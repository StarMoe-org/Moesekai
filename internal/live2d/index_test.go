package live2d

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
)

const (
	ichika  = "live2d/model/01ichika_normal/live2d/model/v1/main/01_ichika/01ichika_normal/buildmodeldata"
	saki    = "live2d/model/02saki_normal/live2d/model/v1/main/02_saki/02saki_normal/buildmodeldata"
	ichikaM = "live2d/motion/01ichika_motion_base/live2d/motion/v1/main/01_ichika/01ichika_motion_base/buildmotiondata"
	sakiM   = "live2d/motion/02saki_motion_base/live2d/motion/v1/main/02_saki/02saki_motion_base/buildmotiondata"
)

// fakeSite serves versions of one region ("jp") the way an exporter's site does.
type fakeSite struct {
	mutex     sync.Mutex
	versions  map[string]map[string]any // version -> path -> JSON
	history   []string                  // oldest first
	changes   map[string]map[string]any // version -> changes document
	requested map[string]int            // path read of a version -> times
}

func newFakeSite() *fakeSite {
	return &fakeSite{versions: map[string]map[string]any{}, changes: map[string]map[string]any{}, requested: map[string]int{}}
}

func episode(characters map[string]any) any { return map[string]any{"characters": characters} }

func character(motionSet string, models ...string) any {
	var costumes []any
	for _, m := range models {
		costumes = append(costumes, map[string]any{"model": m})
	}
	return map[string]any{"motion_set": motionSet, "costumes": costumes}
}

func modelDoc(textures int) any {
	members := []any{map[string]any{"role": "moc", "size": 100}, map[string]any{"role": "physics", "size": 10}}
	for i := 0; i < textures; i++ {
		members = append(members, map[string]any{"role": "texture/" + string(rune('0'+i)), "size": 1000})
	}
	members = append(members, map[string]any{"role": "motion/w-normal01", "size": 5})
	return map[string]any{"form": "live2d-model", "members": members}
}

// publish adds a version holding `files` and, unless `record` is false, the changes from the
// version before it.
func (f *fakeSite) publish(version string, files map[string]any, record bool) {
	f.mutex.Lock()
	defer f.mutex.Unlock()
	if record && len(f.history) > 0 {
		before := f.versions[f.history[len(f.history)-1]]
		var added, removed, changed []any
		for path, document := range files {
			old, ok := before[path]
			a, _ := json.Marshal(old)
			b, _ := json.Marshal(document)
			switch {
			case !ok:
				added = append(added, map[string]any{"path": path})
			case !bytes.Equal(a, b):
				changed = append(changed, map[string]any{"path": path})
			}
		}
		for path := range before {
			if _, ok := files[path]; !ok {
				removed = append(removed, map[string]any{"path": path})
			}
		}
		f.changes[version] = map[string]any{"format": "version-changes", "version": 1, "from": f.history[len(f.history)-1],
			"to": version, "added": added, "removed": removed, "changed": changed}
	}
	f.versions[version] = files
	f.history = append(f.history, version)
}

func gzipJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/gzip")
	zipped := gzip.NewWriter(w)
	_ = json.NewEncoder(zipped).Encode(value)
	_ = zipped.Close()
}

func (f *fakeSite) tree(version string) any {
	root := map[string]any{"name": "", "directories": []any{}, "files": map[string]any{"names": []string{}}}
	var paths []string
	for path := range f.versions[version] {
		paths = append(paths, path)
		// the asset documents of episodes and some other files are in a tree too
		paths = append(paths, strings.TrimSuffix(path, ".json")+".asset.json")
	}
	sort.Strings(paths)
	for _, path := range paths {
		dir := root
		parts := strings.Split(path, "/")
		for _, part := range parts[:len(parts)-1] {
			var next map[string]any
			for _, d := range dir["directories"].([]any) {
				if d.(map[string]any)["name"] == part {
					next = d.(map[string]any)
				}
			}
			if next == nil {
				next = map[string]any{"name": part, "directories": []any{}, "files": map[string]any{"names": []string{}}}
				dir["directories"] = append(dir["directories"].([]any), next)
			}
			dir = next
		}
		files := dir["files"].(map[string]any)
		files["names"] = append(files["names"].([]string), parts[len(parts)-1])
	}
	return map[string]any{"format": "directory-tree", "version": 1, "published_version": version, "root": root}
}

func (f *fakeSite) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mutex.Lock()
	defer f.mutex.Unlock()
	path := strings.TrimPrefix(r.URL.Path, "/")
	current := f.history[len(f.history)-1]
	switch {
	case path == "jp/":
		_ = json.NewEncoder(w).Encode(map[string]any{"format": "directory-listing", "published_version": current})
	case path == "history/jp/canonical":
		var entries []any
		for i := len(f.history) - 1; i >= 0; i-- {
			entries = append(entries, map[string]any{"published_version": f.history[i]})
		}
		gzipJSON(w, map[string]any{"format": "version-history", "version": 1, "entries": entries})
	case strings.HasPrefix(path, "changes/jp/canonical@"):
		changes, ok := f.changes[strings.TrimPrefix(path, "changes/jp/canonical@")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		gzipJSON(w, changes)
	case path == "trees/jp/canonical":
		gzipJSON(w, f.tree(current))
	case strings.HasPrefix(path, "jp@"):
		version, file, _ := strings.Cut(strings.TrimPrefix(path, "jp@"), "/")
		document, ok := f.versions[version][file]
		if !ok {
			http.NotFound(w, r)
			return
		}
		f.requested[file]++
		_ = json.NewEncoder(w).Encode(document)
	default:
		http.NotFound(w, r)
	}
}

func (f *fakeSite) reads() map[string]int {
	f.mutex.Lock()
	defer f.mutex.Unlock()
	out := f.requested
	f.requested = map[string]int{}
	return out
}

func firstVersion() map[string]any {
	return map[string]any{
		"episode/event/1/1.json":    episode(map[string]any{"1": character(ichikaM, ichika), "2": character(sakiM, saki)}),
		"episode/event/1/2.json":    episode(map[string]any{"1": character(ichikaM, ichika)}),
		"episode/card/9/first.json": episode(map[string]any{"1": character("", ichika)}),
		ichika + ".asset.json":      modelDoc(2),
		saki + ".asset.json":        modelDoc(1),
	}
}

func refreshed(t *testing.T, x *Index) Catalogue {
	t.Helper()
	if err := x.regions["jp"].refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	body, _ := x.regions["jp"].served()
	var c Catalogue
	if err := json.Unmarshal(body, &c); err != nil {
		t.Fatal(err)
	}
	return c
}

func find(c Catalogue, asset string) *Model {
	for i := range c.Models {
		if c.Models[i].Asset == asset {
			return &c.Models[i]
		}
	}
	return nil
}

func TestAColdIndexIsBuiltFromTheTree(t *testing.T) {
	site := newFakeSite()
	site.publish("v1", firstVersion(), true)
	server := httptest.NewServer(site)
	defer server.Close()
	x := New(server.URL, t.TempDir())

	c := refreshed(t, x)
	if !c.Complete || c.PublishedVersion != "v1" || len(c.Models) != 2 {
		t.Fatalf("catalogue %+v", c)
	}
	m := find(c, ichika)
	if m == nil || m.ID != "01ichika_normal" || m.Size != 2110 || m.Textures != 2 {
		t.Fatalf("ichika %+v", m)
	}
	// three episodes show her; the motion set is the one most of them name
	if len(m.Characters) != 1 || m.Characters[0].Character2dID != 1 || m.Characters[0].Episodes != 3 || m.Characters[0].MotionSet != ichikaM {
		t.Fatalf("ichika's characters %+v", m.Characters)
	}
	reads := site.reads()
	if reads["episode/event/1/1.json"] != 1 || reads[ichika+".asset.json"] != 1 || len(reads) != 5 {
		t.Fatalf("reads %v", reads)
	}
}

func TestANewVersionIsFoldedInFromItsChanges(t *testing.T) {
	site := newFakeSite()
	site.publish("v1", firstVersion(), true)
	server := httptest.NewServer(site)
	defer server.Close()
	x := New(server.URL, t.TempDir())
	refreshed(t, x)
	site.reads()

	files := firstVersion()
	delete(files, "episode/event/1/2.json")
	files["episode/event/2/1.json"] = episode(map[string]any{"2": character(sakiM, saki, ichika)})
	site.publish("v2", files, true)
	files = map[string]any{}
	for k, v := range site.versions["v2"] {
		files[k] = v
	}
	files[saki+".asset.json"] = modelDoc(3)
	site.publish("v3", files, true)

	c := refreshed(t, x)
	reads := site.reads()
	if len(reads) != 2 || reads["episode/event/2/1.json"] != 1 || reads[saki+".asset.json"] != 1 {
		t.Fatalf("only what changed is read: %v", reads)
	}
	if c.PublishedVersion != "v3" {
		t.Fatalf("version %s", c.PublishedVersion)
	}
	if m := find(c, saki); m.Textures != 3 || m.Characters[0].Episodes != 2 {
		t.Fatalf("saki %+v", m)
	}
	// ichika: event 1/2 gone, event 2/1 shows her as saki's character (2)
	m := find(c, ichika)
	if len(m.Characters) != 2 || m.Characters[0].Character2dID != 1 || m.Characters[0].Episodes != 2 ||
		m.Characters[1].Character2dID != 2 || m.Characters[1].MotionSet != sakiM {
		t.Fatalf("ichika %+v", m.Characters)
	}
}

func TestChangesThatDoNotChainBuildTheIndexAgain(t *testing.T) {
	site := newFakeSite()
	site.publish("v1", firstVersion(), true)
	server := httptest.NewServer(site)
	defer server.Close()
	x := New(server.URL, t.TempDir())
	refreshed(t, x)
	site.reads()

	files := firstVersion()
	delete(files, "episode/card/9/first.json")
	site.publish("v2", files, false) // no record of its changes
	c := refreshed(t, x)
	if c.PublishedVersion != "v2" || find(c, ichika).Characters[0].Episodes != 2 {
		t.Fatalf("catalogue %+v", c)
	}
	if reads := site.reads(); len(reads) != 4 {
		t.Fatalf("built again from the tree: %v", reads)
	}
}

func TestTheIndexIsKeptOnDisk(t *testing.T) {
	site := newFakeSite()
	site.publish("v1", firstVersion(), true)
	server := httptest.NewServer(site)
	defer server.Close()
	dir := t.TempDir()
	refreshed(t, New(server.URL, dir))
	site.reads()

	again := New(server.URL, dir)
	body, _ := again.regions["jp"].served()
	var c Catalogue
	_ = json.Unmarshal(body, &c)
	if !c.Complete || len(c.Models) != 2 {
		t.Fatalf("loaded %+v", c)
	}
	// the version held is the one published: nothing is read
	if err := again.regions["jp"].refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if reads := site.reads(); len(reads) != 0 {
		t.Fatalf("reads %v", reads)
	}
}

func TestTheCatalogueIsServedWithItsETag(t *testing.T) {
	site := newFakeSite()
	site.publish("v1", firstVersion(), true)
	server := httptest.NewServer(site)
	defer server.Close()
	x := New(server.URL, t.TempDir())
	refreshed(t, x)
	mux := http.NewServeMux()
	x.RegisterRoutes(mux)

	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/live2d/jp/models", nil))
	etag := response.Header().Get("ETag")
	if response.Code != http.StatusOK || etag == "" ||
		response.Header().Get("Cache-Control") != "public, max-age=60, stale-while-revalidate=86400" {
		t.Fatalf("%d %v", response.Code, response.Header())
	}
	request := httptest.NewRequest(http.MethodGet, "/api/live2d/jp/models", nil)
	request.Header.Set("If-None-Match", etag)
	response = httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != http.StatusNotModified {
		t.Fatalf("revalidated: %d", response.Code)
	}
	for _, path := range []string{"/api/live2d/xx/models", "/api/live2d/jp/other"} {
		response = httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusNotFound {
			t.Fatalf("%s: %d", path, response.Code)
		}
	}
}

func TestARegionNotIndexedYetSaysSo(t *testing.T) {
	x := New("http://127.0.0.1:1", t.TempDir())
	body, _, ok := x.Models("kr")
	var c Catalogue
	_ = json.Unmarshal(body, &c)
	if !ok || c.Complete || c.Models == nil || len(c.Models) != 0 {
		t.Fatalf("%s", body)
	}
}
