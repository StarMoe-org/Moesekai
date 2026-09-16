package molyembed

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestEncodingPreferences(t *testing.T) {
	for _, tc := range []struct {
		header string
		want   []string
	}{
		{"", []string{"identity"}},
		{"br, gzip", []string{"br", "gzip", "identity"}},
		{"br;q=0.4,gzip;q=0.9", []string{"gzip", "br", "identity"}},
		{"br;q=0,*;q=0.8", []string{"gzip", "identity"}},
		{"*;q=0", []string{}},
		{"br;q=1,identity;q=0,*;q=0", []string{"br"}},
		{"br;q=0.2,identity;q=1", []string{"identity", "br"}},
		{"BR; q=1, gzip;q=0", []string{"br", "identity"}},
		{"br;q=NaN,gzip;q=garbage", []string{"identity"}},
		{"br;q=0,br;q=1", []string{"identity"}},
	} {
		t.Run(tc.header, func(t *testing.T) {
			if got := preferredEncodings(tc.header); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("%q: got %v want %v", tc.header, got, tc.want)
			}
		})
	}
}

func TestBrotliRepresentationRouting(t *testing.T) {
	root, _ := fixture(t)
	target := "/moly/releases/stage-test/pkg/webgpu/moly-app_bg.wasm"
	file := filepath.Join(root, "releases/stage-test/pkg/webgpu/moly-app_bg.wasm")
	// Opaque sidecar bytes test HTTP representation semantics; the publisher and
	// browser end-to-end tests verify real Brotli decompression and WASM behavior.
	payload := []byte("brotli-representation-fixture")
	if err := os.WriteFile(file+".br", payload, 0644); err != nil {
		t.Fatal(err)
	}
	h := New(root)
	response := request(h, "GET", target, map[string]string{"Accept-Encoding": "br,gzip"})
	if response.Code != 200 || response.Header().Get("Content-Encoding") != "br" || !bytes.Equal(response.Body.Bytes(), payload) {
		t.Fatal(response.Code, response.Header())
	}
	tag := response.Header().Get("ETag")
	head := request(h, "HEAD", target, map[string]string{"Accept-Encoding": "br"})
	if head.Code != 200 || head.Body.Len() != 0 || head.Header().Get("Content-Length") != "29" {
		t.Fatal(head.Code, head.Header())
	}
	cached := request(h, "GET", target, map[string]string{"Accept-Encoding": "br", "If-None-Match": tag})
	if cached.Code != 304 || cached.Body.Len() != 0 || cached.Header().Get("Content-Length") != "" {
		t.Fatal(cached.Code, cached.Header())
	}
	partial := request(h, "GET", target, map[string]string{"Accept-Encoding": "br", "Range": "bytes=0-3"})
	if partial.Code != 206 || partial.Header().Get("Content-Length") != "4" || partial.Body.String() != "brot" {
		t.Fatal(partial.Code, partial.Header(), partial.Body.String())
	}
	plain := request(h, "GET", target, map[string]string{"Accept-Encoding": "br;q=0"})
	if plain.Code != 200 || plain.Header().Get("Content-Encoding") != "" || plain.Header().Get("ETag") == tag {
		t.Fatal(plain.Code, plain.Header())
	}
	excluded := request(h, "GET", target, map[string]string{"Accept-Encoding": "gzip,identity;q=0"})
	if excluded.Code != 406 {
		t.Fatal(excluded.Code, excluded.Header())
	}
}

func TestManifestPreservesAndValidatesCompressionSizes(t *testing.T) {
	root, manifest := fixture(t)
	wasm := filepath.Join(root, "releases/stage-test/pkg/webgpu/moly-app_bg.wasm")
	brotli := []byte("br-sidecar")
	gzip := []byte("gzip-sidecar")
	if err := os.WriteFile(wasm+".br", brotli, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(wasm+".gz", gzip, 0644); err != nil {
		t.Fatal(err)
	}
	manifest.Release.Engines["webgpu"] = EngineSize{
		DownloadBytes: int64(len(brotli)), DecodedBytes: 8,
		BrotliBytes: int64(len(brotli)), GzipBytes: int64(len(gzip)),
	}
	saveManifest(t, root, manifest)
	h := New(root)
	response := request(h, "GET", "/moly/manifest.json", nil)
	if response.Code != http.StatusOK {
		t.Fatal(response.Code, response.Body.String())
	}
	var decoded Manifest
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	size := decoded.Release.Engines["webgpu"]
	if size.BrotliBytes != int64(len(brotli)) || size.GzipBytes != int64(len(gzip)) || size.DownloadBytes != size.BrotliBytes {
		t.Fatalf("compression metadata lost: %+v", size)
	}
	manifest.Release.Engines["webgpu"] = EngineSize{DownloadBytes: int64(len(brotli)) + 1, DecodedBytes: 8, BrotliBytes: int64(len(brotli)), GzipBytes: int64(len(gzip))}
	saveManifest(t, root, manifest)
	invalid := New(root)
	if got := request(invalid, "GET", "/moly/manifest.json", nil); got.Code != http.StatusServiceUnavailable {
		t.Fatalf("mismatched manifest must fail closed: %d", got.Code)
	}
}
