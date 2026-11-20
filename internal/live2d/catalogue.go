package live2d

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
)

// Catalogue is what `GET /api/live2d/<region>/models` answers.
type Catalogue struct {
	PublishedVersion string `json:"published_version"`
	// Complete is false while the index of the region is being built: the page then lists the
	// models another way.
	Complete bool    `json:"complete"`
	Models   []Model `json:"models"`
}

// Model is one model of the catalogue.
type Model struct {
	// ID is the model's bundle name (`live2d/model/<id>/…`), which spells its character and
	// costume.
	ID string `json:"id"`
	// Asset is its `live2d-model` asset, which the viewer opens.
	Asset    string `json:"asset"`
	Size     int64  `json:"size"`
	Textures int    `json:"textures"`
	// Characters the stories show it as, the most episodes first.
	Characters []Character `json:"characters"`
}

// Character is one character the stories show a model as.
type Character struct {
	Character2dID int `json:"character2d_id"`
	// MotionSet is the `live2d-motions` asset the stories play on the model as this character
	// (the one most of them do); empty when they name none.
	MotionSet string `json:"motion_set,omitempty"`
	Episodes  int    `json:"episodes"`
}

// modelID is the bundle name of a model asset (`live2d/model/<id>/…`).
func modelID(asset string) string {
	rest := strings.TrimPrefix(asset, "live2d/model/")
	if i := strings.IndexByte(rest, '/'); i >= 0 {
		return rest[:i]
	}
	return rest
}

func (s *state) catalogue() Catalogue {
	type pairing struct {
		episodes   int
		motionSets map[string]int
	}
	byModel := map[string]map[int]*pairing{}
	for _, contributions := range s.Episodes {
		for _, c := range contributions {
			characters := byModel[c.Model]
			if characters == nil {
				characters = map[int]*pairing{}
				byModel[c.Model] = characters
			}
			p := characters[c.Character]
			if p == nil {
				p = &pairing{motionSets: map[string]int{}}
				characters[c.Character] = p
			}
			p.episodes++
			if c.MotionSet != "" {
				p.motionSets[c.MotionSet]++
			}
		}
	}
	catalogue := Catalogue{PublishedVersion: s.PublishedVersion, Complete: s.Complete, Models: []Model{}}
	for asset, facts := range s.Models {
		model := Model{ID: modelID(asset), Asset: asset, Size: facts.Size, Textures: facts.Textures, Characters: []Character{}}
		for id, p := range byModel[asset] {
			best, most := "", 0
			for motionSet, count := range p.motionSets {
				if count > most || (count == most && motionSet < best) {
					best, most = motionSet, count
				}
			}
			model.Characters = append(model.Characters, Character{Character2dID: id, MotionSet: best, Episodes: p.episodes})
		}
		sort.Slice(model.Characters, func(i, j int) bool {
			a, b := model.Characters[i], model.Characters[j]
			if a.Episodes != b.Episodes {
				return a.Episodes > b.Episodes
			}
			return a.Character2dID < b.Character2dID
		})
		catalogue.Models = append(catalogue.Models, model)
	}
	sort.Slice(catalogue.Models, func(i, j int) bool {
		a, b := catalogue.Models[i], catalogue.Models[j]
		if a.ID != b.ID {
			return a.ID < b.ID
		}
		return a.Asset < b.Asset
	})
	return catalogue
}

// Episodes is what `GET /api/live2d/<region>/episodes` answers: the selectors of the episodes
// the version holds (`event:1/1`, `card:9/former`, …), sorted, for the story player's list.
type Episodes struct {
	PublishedVersion string   `json:"published_version"`
	Complete         bool     `json:"complete"`
	Episodes         []string `json:"episodes"`
}

// selector of the episode document at `path` (`episode/<type>/<key>/<episode>.json`), as the
// player takes it: a card's parts are `former` and `latter`.
func selector(path string) (string, bool) {
	rest := strings.TrimSuffix(strings.TrimPrefix(path, "episode/"), ".json")
	kind, rest, ok := strings.Cut(rest, "/")
	if !ok {
		return "", false
	}
	i := strings.LastIndexByte(rest, '/')
	if i <= 0 {
		return "", false
	}
	key, episode := rest[:i], rest[i+1:]
	if kind == "card" {
		switch episode {
		case "first":
			episode = "former"
		case "second":
			episode = "latter"
		}
	}
	return kind + ":" + key + "/" + episode, true
}

func (s *state) episodes() Episodes {
	list := Episodes{PublishedVersion: s.PublishedVersion, Complete: s.Complete, Episodes: []string{}}
	for path := range s.Episodes {
		if sel, ok := selector(path); ok {
			list.Episodes = append(list.Episodes, sel)
		}
	}
	sort.Strings(list.Episodes)
	return list
}

// served is a response and its ETag.
type served struct {
	body []byte
	etag string
}

func serve(value any) served {
	body, err := json.Marshal(value)
	if err != nil {
		body = []byte(`{"published_version":"","complete":false}`)
	}
	sum := sha256.Sum256(body)
	return served{body: body, etag: `"` + hex.EncodeToString(sum[:16]) + `"`}
}

// render makes the responses of the state held (the caller holds the lock).
func (r *regionIndex) render() {
	r.models = serve(r.state.catalogue())
	r.episodeList = serve(r.state.episodes())
}

// RegisterRoutes serves `GET /api/live2d/<region>/models` and `GET /api/live2d/<region>/episodes`.
func (x *Index) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/live2d/", x.handleModels)
}

func (x *Index) handleModels(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/live2d/")
	region, tail, _ := strings.Cut(rest, "/")
	if tail != "models" && tail != "episodes" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body []byte
	var etag string
	var ok bool
	if tail == "models" {
		body, etag, ok = x.Models(region)
	} else {
		body, etag, ok = x.Episodes(region)
	}
	if !ok {
		http.NotFound(w, r)
		return
	}
	header := w.Header()
	header.Set("Content-Type", "application/json")
	header.Set("ETag", etag)
	header.Set("Cache-Control", "public, max-age=60, stale-while-revalidate=86400")
	if match := r.Header.Get("If-None-Match"); match != "" && match == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(body)
}
