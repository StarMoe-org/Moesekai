package middleware

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestCORS_PublicMapEndpointsAllowAllOrigins(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{name: "card event map", path: "/api/card-event-map"},
		{name: "card gacha map", path: "/api/card-gacha-map"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))

			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			req.Header.Set("Origin", "https://evil.example")
			rr := httptest.NewRecorder()

			handler.ServeHTTP(rr, req)

			if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "*" {
				t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "*")
			}
			if got := rr.Header().Get("Vary"); got != "" {
				t.Fatalf("Vary = %q, want empty", got)
			}
		})
	}
}

func TestCORS_PublicMapEndpointsHandleOptionsWithWildcard(t *testing.T) {
	called := false
	handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/card-gacha-map", nil)
	req.Header.Set("Origin", "https://evil.example")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if called {
		t.Fatal("next handler should not be called for OPTIONS requests")
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("status code = %d, want %d", rr.Code, http.StatusOK)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "*")
	}
}

func TestCORS_NonMapEndpointsEchoAllowedOrigins(t *testing.T) {
	handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/gachas", nil)
	req.Header.Set("Origin", "https://pjsk.moe")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "https://pjsk.moe" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "https://pjsk.moe")
	}
	if got := rr.Header().Get("Vary"); got != "Origin" {
		t.Fatalf("Vary = %q, want %q", got, "Origin")
	}
}

func TestCORS_NonMapEndpointsRejectUnknownOrigins(t *testing.T) {
	handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/gachas", nil)
	req.Header.Set("Origin", "https://evil.example")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty", got)
	}
}

func TestCORS_MCPEndpointsAllowWildcardAndPreflight(t *testing.T) {
	handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	for _, path := range []string{"/api/mcp", "/api/mcp/", "/.well-known/mcp.json"} {
		req := httptest.NewRequest(http.MethodOptions, path, nil)
		req.Header.Set("Origin", "https://external-agent.example")
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("%s OPTIONS status = %d, want 200", path, rr.Code)
		}
		if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "*" {
			t.Fatalf("%s Access-Control-Allow-Origin = %q, want *", path, got)
		}
	}
}

func TestGzipSkipsBodylessStatusesHeadAndCompressedTypes(t *testing.T) {
	t.Run("204 and 304 stay bodyless without gzip header", func(t *testing.T) {
		for _, status := range []int{http.StatusNoContent, http.StatusNotModified} {
			h := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(status)
			}))
			req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
			req.Header.Set("Accept-Encoding", "gzip")
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != status {
				t.Fatalf("status = %d, want %d", rr.Code, status)
			}
			if rr.Header().Get("Content-Encoding") != "" {
				t.Fatalf("status %d got Content-Encoding = %q, want empty", status, rr.Header().Get("Content-Encoding"))
			}
			if rr.Body.Len() != 0 {
				t.Fatalf("status %d wrote %d body bytes, want 0", status, rr.Body.Len())
			}
		}
	})

	t.Run("HEAD skips gzip", func(t *testing.T) {
		h := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(http.StatusOK)
		}))
		req := httptest.NewRequest(http.MethodHead, "/zh-cn/", nil)
		req.Header.Set("Accept-Encoding", "gzip")
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Header().Get("Content-Encoding") != "" || rr.Body.Len() != 0 {
			t.Fatalf("HEAD response compressed or non-empty: ce=%q len=%d", rr.Header().Get("Content-Encoding"), rr.Body.Len())
		}
	})

	t.Run("compressed media types skipped, svg compressed", func(t *testing.T) {
		skipTypes := []string{"image/png", "image/webp", "image/jpeg", "font/woff2", "application/pdf", "application/zip", "text/event-stream"}
		for _, ct := range skipTypes {
			h := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", ct)
				_, _ = w.Write([]byte("raw-payload"))
			}))
			req := httptest.NewRequest(http.MethodGet, "/asset", nil)
			req.Header.Set("Accept-Encoding", "gzip")
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Header().Get("Content-Encoding") != "" || rr.Body.String() != "raw-payload" {
				t.Fatalf("content-type %s was unexpectedly compressed: ce=%q", ct, rr.Header().Get("Content-Encoding"))
			}
		}

		// SVG should still be compressed.
		h := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
			_, _ = w.Write([]byte("<svg></svg>"))
		}))
		req := httptest.NewRequest(http.MethodGet, "/icon.svg", nil)
		req.Header.Set("Accept-Encoding", "gzip")
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Header().Get("Content-Encoding") != "gzip" {
			t.Fatalf("svg was not compressed")
		}
		zr, err := gzip.NewReader(bytes.NewReader(rr.Body.Bytes()))
		if err != nil {
			t.Fatal(err)
		}
		defer zr.Close()
		out, _ := io.ReadAll(zr)
		if string(out) != "<svg></svg>" {
			t.Fatalf("svg decompressed = %q", string(out))
		}
	})
}

func TestGzipPoolConcurrentAndPanicSafe(t *testing.T) {
	panicHandler := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("partial"))
		panic("boom")
	}))
	func() {
		defer func() { _ = recover() }()
		req := httptest.NewRequest(http.MethodGet, "/panic", nil)
		req.Header.Set("Accept-Encoding", "gzip")
		panicHandler.ServeHTTP(httptest.NewRecorder(), req)
	}()

	// Subsequent concurrent requests must still produce valid gzip streams.
	h := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = io.WriteString(w, strings.Repeat("hello world ", 50))
	}))
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := httptest.NewRequest(http.MethodGet, "/ok", nil)
			req.Header.Set("Accept-Encoding", "gzip")
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			zr, err := gzip.NewReader(bytes.NewReader(rr.Body.Bytes()))
			if err != nil {
				t.Errorf("gzip reader: %v", err)
				return
			}
			defer zr.Close()
			out, err := io.ReadAll(zr)
			if err != nil || string(out) != strings.Repeat("hello world ", 50) {
				t.Errorf("corrupted output: err=%v len=%d", err, len(out))
			}
		}()
	}
	wg.Wait()
}

func TestGzipGuardWriterUnwrap(t *testing.T) {
	rec := httptest.NewRecorder()
	grw := &gzipGuardWriter{ResponseWriter: rec}
	if grw.Unwrap() != rec {
		t.Fatal("Unwrap did not return underlying ResponseWriter")
	}
}

func TestIPRateLimiterBoundsAndConcurrency(t *testing.T) {
	now := time.Unix(1_000, 0)
	lim := NewIPRateLimiter(60, 2, 4)
	lim.now = func() time.Time { return now }

	if ok, _ := lim.Allow("1.2.3.4"); !ok {
		t.Fatal("1st request denied")
	}
	if ok, _ := lim.Allow("1.2.3.4"); !ok {
		t.Fatal("2nd request denied")
	}
	if ok, wait := lim.Allow("1.2.3.4"); ok || wait < time.Second {
		t.Fatalf("3rd request ok=%v wait=%v, want denied", ok, wait)
	}
	now = now.Add(2 * time.Second)
	if ok, _ := lim.Allow("1.2.3.4"); !ok {
		t.Fatal("refilled request denied")
	}

	// Hard cap bounds map size.
	for i := 0; i < 20; i++ {
		lim.Allow(strings.Repeat("a", i+1))
	}
	lim.mu.Lock()
	size := len(lim.buckets)
	lim.mu.Unlock()
	if size > 4 {
		t.Fatalf("buckets size = %d, want <= 4", size)
	}

	// Concurrent race check.
	conc := NewIPRateLimiter(600, 50, 32)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				conc.Allow("10.0.0.1")
			}
		}(i)
	}
	wg.Wait()
}
