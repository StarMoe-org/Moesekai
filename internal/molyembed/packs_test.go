package molyembed

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFixture(t *testing.T, root, name string, data []byte) {
	t.Helper()
	filename := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(filename), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filename, data, 0644); err != nil {
		t.Fatal(err)
	}
}
func packedFixture(t *testing.T) (string, Manifest) {
	root, m := fixture(t)
	catalog := []byte(`{"schema":"moly-asset-packs/2","region":"cn","version":"6.0.0-assets","provenance":{"runtime_source":{"region":"cn","runtime_game_version":"6.0.0"}},"packages":[{"manifest":"packages/` + strings.Repeat("a", 64) + `.json","paths":["mysekai-fixtures.json"]}]}`)
	id := fmt.Sprintf("%x", sha256.Sum256(catalog))
	writeFixture(t, root, "asset-store/catalogs/"+id+".json", catalog)
	m.Snapshots[0].Packs = true
	m.Snapshots[0].Assets = "/moly/asset-store/"
	m.Snapshots[0].AssetCatalog = id
	m.Snapshots[0].AssetReleaseVersion = "6.0.0-assets"
	m.Snapshots[0].Provenance = map[string]any{"assetPolicy": "content-addressed-store", "verifiedLogicalFiles": 1}
	saveManifest(t, root, m)
	return root, m
}
func TestPackedManifestKeepsPinAndNumericProvenance(t *testing.T) {
	root, m := packedFixture(t)
	response := request(New(root), "GET", "/moly/manifest.json", nil)
	if response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
	var result Manifest
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	got := result.Snapshots[0]
	if !got.Available || !got.Packs || got.AssetCatalog != m.Snapshots[0].AssetCatalog || got.Provenance["verifiedLogicalFiles"] != float64(1) {
		t.Fatal(got)
	}
	file := "asset-store/catalogs/" + got.AssetCatalog + ".json"
	writeFixture(t, root, file, []byte(`{}`))
	failed := request(New(root), "GET", "/moly/manifest.json", nil)
	if err := json.Unmarshal(failed.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Snapshots[0].Available {
		t.Fatal("corrupted pinned catalog remained available")
	}
}
func TestCASOnlyServesExactImmutableAddresses(t *testing.T) {
	root, _ := packedFixture(t)
	hash := strings.Repeat("a", 64)
	blob := "asset-store/blobs/aa/" + hash + ".gzz"
	writeFixture(t, root, blob, []byte("opaque-gzip-object"))
	writeFixture(t, root, blob+".gz", []byte("must-not-negotiate"))
	h := New(root)
	response := request(h, "GET", "/moly/"+blob, map[string]string{"Accept-Encoding": "gzip,br"})
	if response.Code != 200 || response.Body.String() != "opaque-gzip-object" || response.Header().Get("Content-Encoding") != "" || !strings.Contains(response.Header().Get("Cache-Control"), "immutable") {
		t.Fatal(response.Code, response.Header())
	}
	if got := request(h, "GET", "/moly/"+blob, map[string]string{"Accept-Encoding": "identity;q=0,gzip"}); got.Code != http.StatusNotAcceptable {
		t.Fatal(got.Code)
	}
	for _, rel := range []string{"asset-store/channels/cn/stable.json", "asset-store/asset-packs.json", "asset-store/blobs/bb/" + hash + ".gzz", "asset-store/blobs/aa/" + hash + ".gzz.gz", "asset-store/catalogs/short.json", "asset-store/catalogs/../manifest.json", "asset-store/.publish.lock"} {
		if got := request(h, "GET", "/moly/"+rel, nil); got.Code != 404 {
			t.Fatal(rel, got.Code)
		}
	}
}
func TestHistoricalSnapshotPinCannotCrossRegion(t *testing.T) {
	root, m := packedFixture(t)
	old := m.Snapshots[0]
	old.ID = "cn-history"
	old.Catalog = "/moly/snapshots/cn-history/catalog/index.json"
	bytes, _ := json.Marshal(old)
	writeFixture(t, root, "snapshots/cn-history/snapshot.json", bytes)
	writeFixture(t, root, "snapshots/cn-history/catalog/index.json", []byte(`{"schemaVersion":1,"snapshotId":"cn-history","region":"cn","version":"6.0.0"}`))
	h := New(root)
	response := request(h, "GET", "/moly/manifest.json?snapshot=cn-history&region=cn", nil)
	var result Manifest
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if response.Code != 200 || result.Release.ID != m.Release.ID || result.Snapshots[0].ID != "cn-history" || !result.Snapshots[0].Available {
		t.Fatal(response.Code, response.Body.String())
	}
	for _, query := range []string{"snapshot=cn-history&region=jp", "snapshot=../cn-history", "snapshot=cn-history&snapshot=cn-test"} {
		if got := request(h, "GET", "/moly/manifest.json?"+query, nil); got.Code != 400 {
			t.Fatal(query, got.Code)
		}
	}
	if got := request(h, "GET", "/moly/manifest.json?snapshot=missing", nil); got.Code != 404 {
		t.Fatal(got.Code)
	}
	// Current pins remain available for pre-v2 publications without descriptors.
	if got := request(h, "GET", "/moly/manifest.json?snapshot=cn-test&region=cn", nil); got.Code != 200 {
		t.Fatal(got.Code)
	}
}

func TestSeparateAssetStoreRootIsExplicitAndScoped(t *testing.T) {
	root, _ := fixture(t)
	store := t.TempDir()
	hash := strings.Repeat("b", 64)
	rel := "blobs/bb/" + hash + ".bin"
	writeFixture(t, store, rel, []byte("single-CAS-object"))
	t.Setenv("MOLY_ASSET_STORE_ROOT", store)
	h := New(root)
	if got := request(h, "GET", "/moly/asset-store/"+rel, nil); got.Code != 200 || got.Body.String() != "single-CAS-object" {
		t.Fatal(got.Code, got.Body.String())
	}
	writeFixture(t, store, "channels/cn/stable.json", []byte("private selector"))
	if _, err := h.open("asset-store/channels/cn/stable.json"); err == nil {
		t.Fatal("mutable path escaped immutable prefix")
	}
	if got := request(h, "GET", "/moly/releases/stage-test/"+rel, nil); got.Code != 404 {
		t.Fatal("store leaked outside prefix", got.Code)
	}
	t.Setenv("MOLY_ASSET_STORE_ROOT", "")
	if got := request(New(root), "GET", "/moly/asset-store/"+rel, nil); got.Code != 404 {
		t.Fatal("unconfigured store exposed", got.Code)
	}
}
