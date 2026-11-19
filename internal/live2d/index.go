// Package live2d keeps the catalogue of Live2D models the model viewer lists: every model of a
// region's published version, with the characters the stories show it as and the motion set they
// play on it.
//
// The only source of facts is the episode documents of the publication: an episode names, for
// each character it shows, its costumes' models and the character's motion set. Which models go
// with which characters and motion sets is therefore a pure function of a published version. The
// index keeps each episode's contribution, so that a new version is folded in from what it
// changed (`changes`): the contributions of the episodes it removed or changed go, those of the
// ones it added or changed come. When the changes are missing or do not chain from the version
// held, the index is built again from the version's path tree.
//
// Nothing is taken from the browser: the catalogue is derived from the public publication alone,
// so it is the same for everyone and cannot be poisoned.
package live2d

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Regions the index is kept for.
var Regions = []string{"jp", "en", "tw", "kr", "cn"}

const (
	stateFormat = 1
	// fetchers is how many files are fetched at once.
	fetchers = 8
	// checkInterval is how often a request may make the index look for a new version.
	checkInterval = time.Minute
	// refreshTimeout bounds one refresh (a cold build of jp reads several thousand documents).
	refreshTimeout = 30 * time.Minute
)

// contribution is what one episode says of one model: the character it shows it as, and that
// character's motion set.
type contribution struct {
	Model     string `json:"model"`
	Character int    `json:"character"`
	MotionSet string `json:"motion_set,omitempty"`
}

// modelFacts is what the viewer shows of a model before opening it.
type modelFacts struct {
	// Size is the bytes of its .moc3, physics and textures: what opening it fetches.
	Size     int64 `json:"size"`
	Textures int   `json:"textures"`
}

// state is a region's index, as kept on disk.
type state struct {
	Format           int                       `json:"format"`
	Region           string                    `json:"region"`
	PublishedVersion string                    `json:"published_version"`
	Complete         bool                      `json:"complete"`
	Episodes         map[string][]contribution `json:"episodes"`
	Models           map[string]modelFacts     `json:"models"`
}

func emptyState(region string) *state {
	return &state{
		Format:   stateFormat,
		Region:   region,
		Episodes: map[string][]contribution{},
		Models:   map[string]modelFacts{},
	}
}

// isEpisode tells an episode document (`episode/<type>/<key>/<episode>.json`) from its asset
// document and everything else.
func isEpisode(path string) bool {
	return strings.HasPrefix(path, "episode/") && strings.HasSuffix(path, ".json") &&
		!strings.HasSuffix(path, ".asset.json")
}

// modelAssetSuffix ends the document of a `live2d-model` asset: the exporter names a model asset
// after the client's `BuildModelData` object.
const modelAssetSuffix = "/buildmodeldata.asset.json"

func isModelDocument(path string) bool {
	return strings.HasPrefix(path, "live2d/model/") && strings.HasSuffix(path, modelAssetSuffix)
}

func modelAsset(document string) string {
	return strings.TrimSuffix(document, ".asset.json")
}

// episodeDocument is the part of an episode document the index reads.
type episodeDocument struct {
	Characters map[string]struct {
		MotionSet *string `json:"motion_set"`
		Costumes  []struct {
			Model *string `json:"model"`
		} `json:"costumes"`
		AreaCostumes []struct {
			Model *string `json:"model"`
		} `json:"area_costumes"`
	} `json:"characters"`
}

func (e *episodeDocument) contributions() []contribution {
	seen := map[contribution]bool{}
	out := []contribution{}
	for key, character := range e.Characters {
		id, err := strconv.Atoi(key)
		if err != nil {
			continue
		}
		motionSet := ""
		if character.MotionSet != nil {
			motionSet = *character.MotionSet
		}
		add := func(model *string) {
			if model == nil || *model == "" {
				return
			}
			c := contribution{Model: *model, Character: id, MotionSet: motionSet}
			if !seen[c] {
				seen[c] = true
				out = append(out, c)
			}
		}
		for _, costume := range character.Costumes {
			add(costume.Model)
		}
		for _, costume := range character.AreaCostumes {
			add(costume.Model)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Model != out[j].Model {
			return out[i].Model < out[j].Model
		}
		return out[i].Character < out[j].Character
	})
	return out
}

// modelDocument is the part of a model's asset document the index reads.
type modelDocument struct {
	Form    string `json:"form"`
	Members []struct {
		Role string `json:"role"`
		Size int64  `json:"size"`
	} `json:"members"`
}

// facts of a `live2d-model` asset; false for an asset of another form.
func (m *modelDocument) facts() (modelFacts, bool) {
	if m.Form != "live2d-model" {
		return modelFacts{}, false
	}
	var facts modelFacts
	for _, member := range m.Members {
		switch {
		case member.Role == "moc" || member.Role == "physics":
			facts.Size += member.Size
		case strings.HasPrefix(member.Role, "texture/"):
			facts.Size += member.Size
			facts.Textures++
		}
	}
	return facts, true
}

// Index keeps the catalogue of each region, refreshed when it is asked for.
type Index struct {
	site    *site
	dataDir string
	regions map[string]*regionIndex
}

type regionIndex struct {
	region string
	index  *Index

	mutex      sync.RWMutex
	state      *state
	response   []byte
	etag       string
	refreshing bool
	lastCheck  time.Time
}

// New makes the index of the publication on `site` (such as `https://example.org`), kept in
// `dataDir` as `<region>.json`.
func New(site, dataDir string) *Index {
	index := &Index{site: newSite(site), dataDir: dataDir, regions: map[string]*regionIndex{}}
	for _, region := range Regions {
		r := &regionIndex{region: region, index: index, state: emptyState(region)}
		if loaded, err := index.load(region); err == nil {
			r.state = loaded
		} else if !errors.Is(err, os.ErrNotExist) {
			log.Printf("live2d: %s: %v (built again when asked for)", region, err)
		}
		r.render()
		index.regions[region] = r
	}
	return index
}

func (x *Index) path(region string) string {
	return filepath.Join(x.dataDir, region+".json")
}

func (x *Index) load(region string) (*state, error) {
	bytes, err := os.ReadFile(x.path(region))
	if err != nil {
		return nil, err
	}
	var loaded state
	if err := json.Unmarshal(bytes, &loaded); err != nil {
		return nil, err
	}
	if loaded.Format != stateFormat || loaded.Region != region || loaded.Episodes == nil || loaded.Models == nil {
		return nil, fmt.Errorf("%s: not an index of format %d", x.path(region), stateFormat)
	}
	return &loaded, nil
}

func (x *Index) save(s *state) error {
	if err := os.MkdirAll(x.dataDir, 0o755); err != nil {
		return err
	}
	bytes, err := json.Marshal(s)
	if err != nil {
		return err
	}
	temporary, err := os.CreateTemp(x.dataDir, s.Region+".*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(temporary.Name())
	if _, err := temporary.Write(bytes); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Chmod(temporary.Name(), 0o644); err != nil {
		return err
	}
	return os.Rename(temporary.Name(), x.path(s.Region))
}

// Models is the catalogue of `region` as served (JSON) and its ETag, and starts a refresh in the
// background when one is due: the first request for a region builds its index, later ones fold in
// a new version. Until the index is complete the catalogue says so (`complete`: false). false for
// a region the index is not kept for.
func (x *Index) Models(region string) (body []byte, etag string, ok bool) {
	r := x.regions[region]
	if r == nil {
		return nil, "", false
	}
	r.maybeRefresh()
	body, etag = r.served()
	return body, etag, true
}

// served is the catalogue held and its ETag.
func (r *regionIndex) served() ([]byte, string) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()
	return r.response, r.etag
}

func (r *regionIndex) maybeRefresh() {
	r.mutex.Lock()
	due := !r.refreshing && time.Since(r.lastCheck) >= checkInterval
	if due {
		r.refreshing = true
		r.lastCheck = time.Now()
	}
	r.mutex.Unlock()
	if !due {
		return
	}
	go func() {
		defer func() {
			r.mutex.Lock()
			r.refreshing = false
			r.mutex.Unlock()
		}()
		ctx, cancel := context.WithTimeout(context.Background(), refreshTimeout)
		defer cancel()
		if err := r.refresh(ctx); err != nil {
			log.Printf("live2d: %s: %v", r.region, err)
		}
	}()
}

func (r *regionIndex) current() *state {
	r.mutex.RLock()
	defer r.mutex.RUnlock()
	return r.state
}

// refresh brings the index to the version the site publishes now: from the changes when they
// chain from the version held, else from the path tree. The index served meanwhile is the old one.
func (r *regionIndex) refresh(ctx context.Context) error {
	site := r.index.site
	published, err := site.published(ctx, r.region)
	if err != nil {
		return err
	}
	held := r.current()
	if held.Complete && held.PublishedVersion == published {
		return nil
	}
	start := time.Now()
	requests := site.requests.Load()
	var next *state
	how := "changes"
	if held.Complete && held.PublishedVersion != "" {
		next, err = r.fold(ctx, held, published)
		if err != nil {
			log.Printf("live2d: %s: %v; building it again from the tree", r.region, err)
		}
	}
	if next == nil {
		how = "tree"
		if next, err = r.build(ctx); err != nil {
			return err
		}
	}
	r.mutex.Lock()
	r.state = next
	r.render()
	r.mutex.Unlock()
	log.Printf("live2d: %s index at %s from the %s: %d episodes, %d models, %d requests, %s",
		r.region, next.PublishedVersion, how, len(next.Episodes), len(next.Models),
		site.requests.Load()-requests, time.Since(start).Round(time.Millisecond))
	return r.index.save(next)
}

// build makes the index of the version the path tree is of.
func (r *regionIndex) build(ctx context.Context) (*state, error) {
	tree, err := r.index.site.tree(ctx, r.region)
	if err != nil {
		return nil, err
	}
	var episodes, models []string
	tree.Root.walk("", "episode/", func(path string) {
		if isEpisode(path) {
			episodes = append(episodes, path)
		}
	})
	tree.Root.walk("", "live2d/model/", func(path string) {
		if isModelDocument(path) {
			models = append(models, path)
		}
	})
	next := emptyState(r.region)
	next.PublishedVersion = tree.PublishedVersion
	if err := r.read(ctx, next, episodes, models); err != nil {
		return nil, err
	}
	next.Complete = true
	return next, nil
}

// fold makes the index of `published` from `held` and the changes of every version between.
func (r *regionIndex) fold(ctx context.Context, held *state, published string) (*state, error) {
	site := r.index.site
	history, err := site.history(ctx, r.region)
	if err != nil {
		return nil, err
	}
	// the versions after the one held, oldest first
	var versions []string
	found := false
	for i := len(history) - 1; i >= 0; i-- {
		version := history[i].PublishedVersion
		if found {
			versions = append(versions, version)
		}
		if version == held.PublishedVersion {
			found = true
		}
	}
	if !found {
		return nil, fmt.Errorf("the history has no version %s", held.PublishedVersion)
	}
	if len(versions) == 0 || versions[len(versions)-1] != published {
		return nil, fmt.Errorf("the history does not reach %s", published)
	}
	// what happened last to each path read: true for there, false for gone
	touched := map[string]bool{}
	from := held.PublishedVersion
	for _, version := range versions {
		changes, err := site.changes(ctx, r.region, version)
		if err != nil {
			return nil, err
		}
		if changes.From != from {
			return nil, fmt.Errorf("the changes of %s are from %s, not %s", version, changes.From, from)
		}
		for _, list := range [][]changedFile{changes.Added, changes.Changed} {
			for _, file := range list {
				touched[file.Path] = true
			}
		}
		for _, file := range changes.Removed {
			touched[file.Path] = false
		}
		from = version
	}
	next := emptyState(r.region)
	next.PublishedVersion = published
	for path, contributions := range held.Episodes {
		next.Episodes[path] = contributions
	}
	for asset, facts := range held.Models {
		next.Models[asset] = facts
	}
	var episodes, models []string
	for path, there := range touched {
		switch {
		case isEpisode(path):
			delete(next.Episodes, path)
			if there {
				episodes = append(episodes, path)
			}
		case isModelDocument(path):
			delete(next.Models, modelAsset(path))
			if there {
				models = append(models, path)
			}
		}
	}
	sort.Strings(episodes)
	sort.Strings(models)
	if err := r.read(ctx, next, episodes, models); err != nil {
		return nil, err
	}
	next.Complete = true
	return next, nil
}

// read fetches the episodes and model documents at `paths` of `s`'s version into it, several at
// a time. A document the version turns out not to have is left out.
func (r *regionIndex) read(ctx context.Context, s *state, episodes, models []string) error {
	type job struct {
		path    string
		episode bool
	}
	jobs := make(chan job)
	var mutex sync.Mutex
	var first error
	var wait sync.WaitGroup
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	for i := 0; i < fetchers; i++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			for j := range jobs {
				var err error
				if j.episode {
					var document episodeDocument
					if err = r.index.site.file(ctx, s.Region, s.PublishedVersion, j.path, &document); err == nil {
						contributions := document.contributions()
						mutex.Lock()
						s.Episodes[j.path] = contributions
						mutex.Unlock()
					}
				} else {
					var document modelDocument
					if err = r.index.site.file(ctx, s.Region, s.PublishedVersion, j.path, &document); err == nil {
						if facts, ok := document.facts(); ok {
							mutex.Lock()
							s.Models[modelAsset(j.path)] = facts
							mutex.Unlock()
						}
					}
				}
				if err != nil && !errors.Is(err, errNotFound) {
					mutex.Lock()
					if first == nil {
						first = err
						cancel()
					}
					mutex.Unlock()
				}
			}
		}()
	}
	send := func(paths []string, episode bool) {
		for _, path := range paths {
			select {
			case jobs <- job{path, episode}:
			case <-ctx.Done():
				return
			}
		}
	}
	send(episodes, true)
	send(models, false)
	close(jobs)
	wait.Wait()
	if first != nil {
		return first
	}
	return ctx.Err()
}
