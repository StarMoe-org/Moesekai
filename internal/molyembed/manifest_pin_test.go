package molyembed

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// A pin that is still published is already validated against the current
// manifest stamp. Re-reading its catalogue per request is what serialises
// discovery on the handler mutex, so the answer must come from the manifest.
func TestPublishedPinReusesValidatedManifest(t *testing.T) {
	root, m := fixture(t)
	h := New(root)
	plain := request(h, "GET", "/moly/manifest.json", nil)
	if plain.Code != 200 {
		t.Fatal(plain.Code, plain.Body.String())
	}
	for _, name := range []string{"snapshots/cn-test/catalog/index.json", "snapshots/cn-test/assets/mysekai-fixtures.json"} {
		if err := os.Remove(filepath.Join(root, filepath.FromSlash(name))); err != nil {
			t.Fatal(err)
		}
	}
	pinned := request(h, "GET", "/moly/manifest.json?snapshot="+m.Snapshots[0].ID+"&region=cn", nil)
	if pinned.Code != 200 {
		t.Fatal(pinned.Code, pinned.Body.String())
	}
	if pinned.Body.String() != plain.Body.String() {
		t.Fatalf("published pin diverged from the manifest it pins:\n plain  %s\n pinned %s", plain.Body.String(), pinned.Body.String())
	}
}

// A historical pin is read and validated once per manifest stamp. Replacing the
// manifest must drop that cache so a withdrawn snapshot stops being served.
func TestHistoricalPinValidatesOncePerManifestStamp(t *testing.T) {
	root, m := fixture(t)
	old := m.Snapshots[0]
	old.ID = "cn-history"
	old.Assets = "/moly/snapshots/cn-history/assets/"
	old.Catalog = "/moly/snapshots/cn-history/catalog/index.json"
	descriptor, err := json.Marshal(old)
	if err != nil {
		t.Fatal(err)
	}
	write := func(name string, value []byte) {
		t.Helper()
		p := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, value, 0644); err != nil {
			t.Fatal(err)
		}
	}
	write("snapshots/cn-history/snapshot.json", descriptor)
	write("snapshots/cn-history/assets/mysekai-fixtures.json", []byte(`{"region":"cn","gameVersion":"6.0.0"}`))
	write("snapshots/cn-history/catalog/index.json", []byte(`{"schemaVersion":1,"snapshotId":"cn-history","region":"cn","version":"6.0.0","entries":[]}`))

	h := New(root)
	first := request(h, "GET", "/moly/manifest.json?snapshot=cn-history&region=cn", nil)
	if first.Code != 200 {
		t.Fatal(first.Code, first.Body.String())
	}
	// Removing the descriptor proves the second answer came from the pin cache.
	if err := os.Remove(filepath.Join(root, filepath.FromSlash("snapshots/cn-history/snapshot.json"))); err != nil {
		t.Fatal(err)
	}
	if again := request(h, "GET", "/moly/manifest.json?snapshot=cn-history&region=cn", nil); again.Code != 200 || again.Body.String() != first.Body.String() {
		t.Fatal("cached historical pin was not reused", again.Code)
	}
	// A new publication invalidates the cache along with the manifest.
	m.Snapshots[0].Version = "6.0.1"
	write("snapshots/cn-test/assets/mysekai-fixtures.json", []byte(`{"region":"cn","gameVersion":"6.0.1"}`))
	write("snapshots/cn-test/catalog/index.json", []byte(`{"schemaVersion":1,"snapshotId":"cn-test","region":"cn","version":"6.0.1","entries":[]}`))
	saveManifest(t, root, m)
	if stale := request(h, "GET", "/moly/manifest.json?snapshot=cn-history&region=cn", nil); stale.Code != 404 {
		t.Fatal("withdrawn pin survived a new manifest", stale.Code, stale.Body.String())
	}
}
