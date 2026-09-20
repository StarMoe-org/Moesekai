package molyembed

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func fixture(t *testing.T) (string, Manifest) {
	t.Helper()
	root := t.TempDir()
	put := func(name string, value []byte) {
		t.Helper()
		p := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, value, 0644); err != nil {
			t.Fatal(err)
		}
	}
	wasm := []byte{0, 97, 115, 109, 1, 0, 0, 0}
	for _, backend := range []string{"webgpu", "webgl2"} {
		put("releases/stage-test/pkg/"+backend+"/moly-app_bg.wasm", wasm)
		put("releases/stage-test/pkg/"+backend+"/moly-app.js", []byte("export const present=true;"))
	}
	put("releases/stage-test/embed.mjs", []byte("export const version=2;"))
	put("releases/stage-test/stage.html", []byte("<!doctype html><title>stage</title>"))
	put("snapshots/cn-test/assets/mysekai-fixtures.json", []byte(`{"region":"cn","gameVersion":"6.0.0"}`))
	put("snapshots/cn-test/catalog/index.json", []byte(`{"schemaVersion":1,"snapshotId":"cn-test","region":"cn","version":"6.0.0","entries":[]}`))
	put("cache-worker.mjs", []byte("self.addEventListener('fetch',()=>{});"))
	manifest := Manifest{SchemaVersion: 2, Release: Release{ID: "stage-test", Module: "/moly/releases/stage-test/embed.mjs", Stage: "/moly/releases/stage-test/stage.html", ContractVersion: 2, Engines: map[string]EngineSize{"webgpu": {DownloadBytes: 8, DecodedBytes: 8}, "webgl2": {DownloadBytes: 8, DecodedBytes: 8}}}, Snapshots: []Snapshot{{ID: "cn-test", Region: "cn", Version: "6.0.0", Assets: "/moly/snapshots/cn-test/assets/", Catalog: "/moly/snapshots/cn-test/catalog/index.json"}}}
	saveManifest(t, root, manifest)
	return root, manifest
}
func saveManifest(t *testing.T, root string, m Manifest) {
	t.Helper()
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(root, "manifest.json"), b, 0644); err != nil {
		t.Fatal(err)
	}
}
func request(h http.Handler, method, target string, headers map[string]string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, target, nil)
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func TestVersionedServing(t *testing.T) {
	root, _ := fixture(t)
	h := New(root)
	for _, tc := range []struct{ path, mime string }{{"pkg/webgpu/moly-app_bg.wasm", "application/wasm"}, {"embed.mjs", "text/javascript; charset=utf-8"}, {"stage.html", "text/html; charset=utf-8"}} {
		w := request(h, "GET", "/moly/releases/stage-test/"+tc.path, nil)
		if w.Code != 200 || w.Header().Get("Content-Type") != tc.mime {
			t.Fatalf("%s: %d %v", tc.path, w.Code, w.Header())
		}
		if !strings.Contains(w.Header().Get("Cache-Control"), "immutable") || w.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal(w.Header())
		}
		if tc.path == "stage.html" && !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'self'") {
			t.Fatal("missing frame policy")
		}
		notModified := request(h, "GET", "/moly/releases/stage-test/"+tc.path, map[string]string{"If-None-Match": w.Header().Get("ETag")})
		if notModified.Code != 304 {
			t.Fatal(notModified.Code)
		}
		head := request(h, "HEAD", "/moly/releases/stage-test/"+tc.path, nil)
		if head.Code != 200 || head.Body.Len() != 0 || head.Header().Get("Content-Length") == "" {
			t.Fatal("HEAD", head.Code, head.Header())
		}
	}
	rangeResponse := request(h, "GET", "/moly/releases/stage-test/pkg/webgpu/moly-app_bg.wasm", map[string]string{"Range": "bytes=0-3"})
	if rangeResponse.Code != 206 || !bytes.Equal(rangeResponse.Body.Bytes(), []byte{0, 97, 115, 109}) {
		t.Fatal("range response", rangeResponse.Code)
	}
	worker := request(h, "GET", "/moly/cache-worker.mjs", nil)
	if worker.Header().Get("Service-Worker-Allowed") != "/moly/" || worker.Header().Get("Cache-Control") != "no-cache" {
		t.Fatal(worker.Header())
	}
}
func TestSourceWeatherDependenciesAreServed(t *testing.T) {
	root, _ := fixture(t)
	h := New(root)
	for _, tc := range []struct{ ext, mime string }{
		{".glsl", "text/plain; charset=utf-8"},
		{".wgsl", "text/plain; charset=utf-8"},
		{".rgba8", "application/octet-stream"},
		{".acb", "application/octet-stream"},
	} {
		name := "snapshots/cn-test/assets/phenomena/source" + tc.ext
		file := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte("source"), 0644); err != nil {
			t.Fatal(err)
		}
		w := request(h, "GET", "/moly/"+name, nil)
		if w.Code != 200 || w.Header().Get("Content-Type") != tc.mime || w.Body.String() != "source" {
			t.Fatalf("%s: status=%d type=%q body=%q", name, w.Code, w.Header().Get("Content-Type"), w.Body.String())
		}
	}
}
func TestPrecompressedWasm(t *testing.T) {
	root, _ := fixture(t)
	file := filepath.Join(root, "releases/stage-test/pkg/webgpu/moly-app_bg.wasm")
	raw, _ := os.ReadFile(file)
	var encoded bytes.Buffer
	g := gzip.NewWriter(&encoded)
	_, _ = g.Write(raw)
	_ = g.Close()
	if err := os.WriteFile(file+".gz", encoded.Bytes(), 0644); err != nil {
		t.Fatal(err)
	}
	h := New(root)
	w := request(h, "GET", "/moly/releases/stage-test/pkg/webgpu/moly-app_bg.wasm", map[string]string{"Accept-Encoding": "br, gzip"})
	if w.Code != 200 || w.Header().Get("Content-Encoding") != "gzip" || w.Header().Get("X-Moly-Decoded-Bytes") != "8" || w.Header().Get("Vary") != "Accept-Encoding" {
		t.Fatal(w.Code, w.Header())
	}
	decoder, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatal(err)
	}
	decoded, _ := io.ReadAll(decoder)
	if !bytes.Equal(raw, decoded) {
		t.Fatal("changed WASM")
	}
	head := request(h, "HEAD", "/moly/releases/stage-test/pkg/webgpu/moly-app_bg.wasm", map[string]string{"Accept-Encoding": "gzip"})
	if head.Code != 200 || head.Header().Get("Content-Length") != strconv.Itoa(encoded.Len()) || head.Body.Len() != 0 {
		t.Fatal("compressed HEAD must report the encoded representation length", head.Code, head.Header())
	}
	cached := request(h, "HEAD", "/moly/releases/stage-test/pkg/webgpu/moly-app_bg.wasm", map[string]string{"Accept-Encoding": "gzip", "If-None-Match": head.Header().Get("ETag")})
	if cached.Code != 304 || cached.Header().Get("Content-Length") != "" {
		t.Fatal("invalid compressed 304 headers", cached.Header())
	}
	partial := request(h, "GET", "/moly/releases/stage-test/pkg/webgpu/moly-app_bg.wasm", map[string]string{"Accept-Encoding": "gzip", "Range": "bytes=0-3"})
	if partial.Code != 206 || partial.Body.Len() != 4 || partial.Header().Get("Content-Length") != "4" {
		t.Fatal("compressed range length", partial.Header())
	}
	plain := request(h, "GET", "/moly/releases/stage-test/pkg/webgpu/moly-app_bg.wasm", map[string]string{"Accept-Encoding": "gzip;q=0"})
	if plain.Header().Get("Content-Encoding") != "" || plain.Header().Get("ETag") == w.Header().Get("ETag") {
		t.Fatal("encoding variants conflated")
	}
}
func TestBoundaryAndMethods(t *testing.T) {
	root, _ := fixture(t)
	h := New(root)
	for _, target := range []string{"/moly/", "/moly/../secret.json", "/moly/releases/stage-test/../../manifest.json", "/moly/releases/stage-test/%2e%2e/secret.json", "/moly/releases/stage-test/a%2fb.json", "/moly/releases/stage-test/a%5cb.json", "/moly/releases/stage-test/.env", "/moly/releases/stage-test/build.rs", "/moly/releases/stage-test/", "/moly/cache-worker.mjs/extra"} {
		w := request(h, "GET", target, nil)
		if w.Code != 404 {
			t.Errorf("boundary %s = %d", target, w.Code)
		}
	}
	w := request(h, "POST", "/moly/manifest.json", nil)
	if w.Code != 405 || w.Header().Get("Allow") != "GET, HEAD" {
		t.Fatal(w.Code, w.Header())
	}
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.json"), []byte(`{"secret":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "releases/stage-test/outside")); err == nil {
		if w := request(h, "GET", "/moly/releases/stage-test/outside/secret.json", nil); w.Code != 404 {
			t.Fatal("escaped root")
		}
	} else {
		t.Log("symlink creation unavailable; canonical traversal cases still verified")
	}
}
func TestSnapshotProvenance(t *testing.T) {
	for _, tc := range []struct {
		name       string
		change     func(string, *Manifest)
		wantStatus int
		reason     string
	}{
		{"available", func(string, *Manifest) {}, 200, ""},
		{"wrong region", func(root string, m *Manifest) {
			_ = os.WriteFile(filepath.Join(root, "snapshots/cn-test/assets/mysekai-fixtures.json"), []byte(`{"region":"jp","gameVersion":"6.0.0"}`), 0644)
		}, 200, "source_mismatch"},
		{"missing asset root", func(root string, m *Manifest) {
			_ = os.Remove(filepath.Join(root, "snapshots/cn-test/assets/mysekai-fixtures.json"))
		}, 200, "assets_missing"},
		{"missing catalog", func(root string, m *Manifest) {
			_ = os.Remove(filepath.Join(root, "snapshots/cn-test/catalog/index.json"))
		}, 200, "catalog_missing"},
		{"wrong version", func(root string, m *Manifest) { m.Snapshots[0].Version = "6.8.1" }, 200, "source_mismatch"},
		{"unsupported region", func(root string, m *Manifest) { m.Snapshots[0].Region = "en" }, 503, ""},
		{"external module", func(root string, m *Manifest) { m.Release.Module = "https://outside.invalid/app.mjs" }, 503, ""},
		{"missing backend", func(root string, m *Manifest) { delete(m.Release.Engines, "webgl2") }, 503, ""},
		{"fake size", func(root string, m *Manifest) { m.Release.Engines["webgpu"] = EngineSize{} }, 503, ""},
		{"development masquerades as immutable", func(root string, m *Manifest) {
			m.Snapshots[0].Provenance = map[string]any{"assetPolicy": "development-mount"}
		}, 503, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root, m := fixture(t)
			tc.change(root, &m)
			saveManifest(t, root, m)
			h := New(root)
			h.development = false
			w := request(h, "GET", "/moly/manifest.json", nil)
			if w.Code != tc.wantStatus {
				t.Fatal(w.Code, w.Body.String())
			}
			if w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("manifest cached")
			}
			if w.Code == 200 {
				var got Manifest
				if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
					t.Fatal(err)
				}
				if got.Snapshots[0].UnavailableReason != tc.reason || got.Snapshots[0].Available != (tc.reason == "") {
					t.Fatal(got.Snapshots)
				}
			}
		})
	}
}
func TestMissingDeploymentAndStrictDescriptors(t *testing.T) {
	if w := request(New(""), "GET", "/moly/manifest.json", nil); w.Code != 503 {
		t.Fatal(w.Code)
	}
	root, _ := fixture(t)
	f, err := os.OpenFile(filepath.Join(root, "manifest.json"), os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.WriteString(" {}")
	_ = f.Close()
	if w := request(New(root), "GET", "/moly/manifest.json", nil); w.Code != 503 {
		t.Fatal("trailing JSON accepted")
	}
}
func TestDevelopmentAssetsDoNotBecomeImmutable(t *testing.T) {
	root, _ := fixture(t)
	h := New(root)
	h.development = true
	w := request(h, "GET", "/moly/snapshots/cn-test/assets/mysekai-fixtures.json", nil)
	if w.Header().Get("Cache-Control") != "no-cache" {
		t.Fatal(w.Header())
	}
}
func TestEncodingQuality(t *testing.T) {
	for _, tc := range []struct {
		value  string
		accept bool
	}{{"gzip", true}, {"br,gzip;q=0.5", true}, {"gzip;q=0", false}, {"gzip;q=bad", false}, {"gzip;q=1.1", false}, {"gzip;q=-1", false}, {"br", false}} {
		if acceptsGzip(tc.value) != tc.accept {
			t.Error(tc.value)
		}
	}
}
