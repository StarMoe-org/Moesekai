package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"snowy_viewer/internal/masterdata"
	"snowy_viewer/internal/middleware"
)

func TestHTTPServerHasExplicitResourceBounds(t *testing.T) {
	server := newHTTPServer(":0", http.NewServeMux())

	if server.ReadHeaderTimeout != serverReadHeaderTimeout {
		t.Fatalf("ReadHeaderTimeout = %v, want %v", server.ReadHeaderTimeout, serverReadHeaderTimeout)
	}
	if server.ReadTimeout != serverReadTimeout {
		t.Fatalf("ReadTimeout = %v, want %v", server.ReadTimeout, serverReadTimeout)
	}
	if server.WriteTimeout != serverWriteTimeout {
		t.Fatalf("WriteTimeout = %v, want %v", server.WriteTimeout, serverWriteTimeout)
	}
	if server.IdleTimeout != serverIdleTimeout {
		t.Fatalf("IdleTimeout = %v, want %v", server.IdleTimeout, serverIdleTimeout)
	}
	if server.MaxHeaderBytes != serverMaxHeaderBytes {
		t.Fatalf("MaxHeaderBytes = %d, want %d", server.MaxHeaderBytes, serverMaxHeaderBytes)
	}
}

func TestFrontendHealthRouteReflectsInternalFrontend(t *testing.T) {
	frontend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal-healthz/" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer frontend.Close()

	mux := http.NewServeMux()
	registerFrontendHealthRoute(mux, newFrontendHealthCheck(frontend.URL))
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	var body map[string]string
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode health response: %v", err)
	}
	if body["frontend"] != "ok" {
		t.Fatalf("frontend = %q, want ok", body["frontend"])
	}
}

func TestFrontendHealthRouteReturnsUnavailableWhenFrontendFails(t *testing.T) {
	frontend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "failed", http.StatusInternalServerError)
	}))
	frontendURL := frontend.URL
	frontend.Close()

	mux := http.NewServeMux()
	registerFrontendHealthRoute(mux, newFrontendHealthCheck(frontendURL))
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
}

func TestReadinessRouteTracksMasterDataState(t *testing.T) {
	pendingMux := http.NewServeMux()
	registerReadinessRoute(pendingMux, masterdata.NewStore(t.TempDir()), nil)

	before := httptest.NewRecorder()
	pendingMux.ServeHTTP(before, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if before.Code != http.StatusServiceUnavailable {
		t.Fatalf("initial status = %d, want %d", before.Code, http.StatusServiceUnavailable)
	}
	if before.Header().Get("Retry-After") != "30" {
		t.Fatalf("Retry-After = %q, want 30", before.Header().Get("Retry-After"))
	}

	readyDir := t.TempDir()
	for _, filename := range []string{"events.json", "eventCards.json", "eventMusics.json", "virtualLives.json", "gachas.json"} {
		if err := os.WriteFile(filepath.Join(readyDir, filename), []byte("[]"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	readyStore := masterdata.NewStore(readyDir)
	if err := readyStore.Fetch(); err != nil {
		t.Fatal(err)
	}
	readyMux := http.NewServeMux()
	registerReadinessRoute(readyMux, readyStore, nil)

	after := httptest.NewRecorder()
	readyMux.ServeHTTP(after, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if after.Code != http.StatusOK {
		t.Fatalf("ready status = %d, want %d", after.Code, http.StatusOK)
	}

	frontendDownMux := http.NewServeMux()
	registerReadinessRoute(frontendDownMux, readyStore, func(context.Context) error {
		return errors.New("frontend unavailable")
	})
	frontendDown := httptest.NewRecorder()
	frontendDownMux.ServeHTTP(frontendDown, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if frontendDown.Code != http.StatusServiceUnavailable {
		t.Fatalf("frontend-down status = %d, want %d", frontendDown.Code, http.StatusServiceUnavailable)
	}
}

func TestStaticArchiveRouteUsesArchiveAndFallsBack(t *testing.T) {
	archiveDir := t.TempDir()
	assetPath := filepath.Join(archiveDir, "chunks", "archived.js")
	if err := os.MkdirAll(filepath.Dir(assetPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(assetPath, []byte("archived"), 0o600); err != nil {
		t.Fatal(err)
	}

	fallback := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("fallback:" + r.URL.Path))
	})
	mux := http.NewServeMux()
	registerStaticArchiveRoute(mux, archiveDir, fallback)

	archived := httptest.NewRecorder()
	mux.ServeHTTP(archived, httptest.NewRequest(http.MethodGet, "/_next/static/chunks/archived.js", nil))
	if archived.Body.String() != "archived" {
		t.Fatalf("archived body = %q", archived.Body.String())
	}
	if archived.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control = %q", archived.Header().Get("Cache-Control"))
	}

	missing := httptest.NewRecorder()
	mux.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/_next/static/chunks/missing.js", nil))
	if missing.Body.String() != "fallback:/_next/static/chunks/missing.js" {
		t.Fatalf("fallback body = %q", missing.Body.String())
	}

	for _, escapedPath := range []string{
		"/_next/static/../secret.txt",
		"/_next/static/%2e%2e/secret.txt",
		"/_next/static/chunks/%2e%2e/%2e%2e/secret.txt",
	} {
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, escapedPath, nil))
		if response.Body.String() == "secret" {
			t.Fatalf("archive traversal path %q escaped the archive root", escapedPath)
		}
	}
}

func TestParseProxyTargetURLRejectsUnsafeValues(t *testing.T) {
	for _, raw := range []string{"", "127.0.0.1:3000", "ftp://127.0.0.1:3000", "http://user:pass@127.0.0.1:3000"} {
		t.Run(raw, func(t *testing.T) {
			if _, err := parseProxyTargetURL(raw); err == nil {
				t.Fatalf("parseProxyTargetURL(%q) unexpectedly succeeded", raw)
			}
		})
	}

	parsed, err := parseProxyTargetURL("http://127.0.0.1:3000")
	if err != nil {
		t.Fatalf("valid proxy URL failed: %v", err)
	}
	if parsed.Host != "127.0.0.1:3000" {
		t.Fatalf("host = %q", parsed.Host)
	}
}

func TestFrontendProxyPreservesHTTPSForwardedProto(t *testing.T) {
	target, err := url.Parse("http://127.0.0.1:3000")
	if err != nil {
		t.Fatal(err)
	}
	proxy := newFrontendProxy(target)
	request := httptest.NewRequest(http.MethodGet, "http://pjsk.moe/lyrics/1/", nil)
	request.Header.Set("X-Forwarded-Proto", "https")
	request.Header.Set("X-Forwarded-Host", "pjsk.moe")

	proxy.Director(request)

	if request.Header.Get("X-Forwarded-Proto") != "https" {
		t.Fatalf("X-Forwarded-Proto = %q, want https", request.Header.Get("X-Forwarded-Proto"))
	}
	if request.Header.Get("X-Forwarded-Host") != "pjsk.moe" {
		t.Fatalf("X-Forwarded-Host = %q, want pjsk.moe", request.Header.Get("X-Forwarded-Host"))
	}
}

func TestInternalHealthzBlockedFromPublic(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/internal-healthz", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})
	mux.HandleFunc("/internal-healthz/", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})

	for _, path := range []string{"/internal-healthz", "/internal-healthz/"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("path %s returned status %d, want 404", path, rec.Code)
		}
	}
}

// newMoesekaiAPIFront serves the main server's routes for moesekai-api behind
// the production middleware chain, proxying to upstreamURL.
func newMoesekaiAPIFront(t *testing.T, upstreamURL string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	registerMoesekaiAPIRoutes(mux, upstreamURL)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("%s reached the frontend and HTML cache", r.URL.Path)
		http.NotFound(w, r)
	})
	front := httptest.NewServer(middleware.Chain(mux, middleware.CORS, middleware.Gzip))
	t.Cleanup(front.Close)
	return front
}

func assertJSONError(t *testing.T, status int, header http.Header, body []byte, wantStatus int, wantCode string) {
	t.Helper()
	if status != wantStatus {
		t.Fatalf("status = %d, want %d", status, wantStatus)
	}
	if header.Get("Content-Type") != "application/json" || header.Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %v, want uncached JSON", header)
	}
	var payload map[string]string
	if err := json.Unmarshal(body, &payload); err != nil || payload["error"] != wantCode || len(payload) != 1 {
		t.Fatalf("body = %s, want {\"error\":%q}", body, wantCode)
	}
}

func TestMoesekaiAPIRoutesAnswer503WithoutUpstream(t *testing.T) {
	for _, rawURL := range []string{"", "moesekai-api:8080", "http://user:secret@moesekai-api:8080"} {
		t.Run(rawURL, func(t *testing.T) {
			mux := http.NewServeMux()
			registerMoesekaiAPIRoutes(mux, rawURL)
			mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
				http.NotFound(w, r)
			})

			for _, path := range []string{"/api/auth/me", "/api/guess-music/daily"} {
				response := httptest.NewRecorder()
				mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
				assertJSONError(t, response.Code, response.Header(), response.Body.Bytes(), http.StatusServiceUnavailable, "unavailable")
			}
			other := httptest.NewRecorder()
			mux.ServeHTTP(other, httptest.NewRequest(http.MethodGet, "/api/authors", nil))
			if other.Code != http.StatusNotFound {
				t.Fatalf("/api/authors status = %d, want 404", other.Code)
			}
		})
	}
}

func TestMoesekaiAPIProxyForwardsRequestsAndResponses(t *testing.T) {
	type seenRequest struct {
		method, path, query, body, cookie                         string
		forwardedFor, forwardedHost, forwardedProto, connectingIP string
	}
	seen := make(chan seenRequest, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		seen <- seenRequest{
			method: r.Method, path: r.URL.Path, query: r.URL.RawQuery, body: string(body), cookie: r.Header.Get("Cookie"),
			forwardedFor: r.Header.Get("X-Forwarded-For"), forwardedHost: r.Header.Get("X-Forwarded-Host"),
			forwardedProto: r.Header.Get("X-Forwarded-Proto"), connectingIP: r.Header.Get("CF-Connecting-IP"),
		}
		w.Header().Add("Set-Cookie", "__Host-ms_session=new; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax")
		w.Header().Add("Set-Cookie", "__Host-ms_auth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax")
		w.Header().Set("Location", "https://pjsk.moe/guess-music/?tier=hard")
		w.WriteHeader(http.StatusSeeOther)
	}))
	defer upstream.Close()
	front := newMoesekaiAPIFront(t, upstream.URL)
	client := front.Client()
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

	tests := []struct {
		name    string
		method  string
		target  string
		body    string
		headers map[string]string
		want    seenRequest
	}{
		{
			name:   "behind Cloudflare and the ingress",
			method: http.MethodPost,
			target: "/api/guess-music/daily/sessions?tier=hard&practice=1",
			body:   `{"tier":"hard"}`,
			headers: map[string]string{
				"Cookie":            "__Host-ms_session=old; theme=dark",
				"X-Forwarded-For":   "203.0.113.7, 10.0.0.2",
				"X-Forwarded-Host":  "pjsk.moe",
				"X-Forwarded-Proto": "https",
				"CF-Connecting-IP":  "203.0.113.7",
			},
			want: seenRequest{
				method: http.MethodPost, path: "/api/guess-music/daily/sessions", query: "tier=hard&practice=1",
				body: `{"tier":"hard"}`, cookie: "__Host-ms_session=old; theme=dark",
				forwardedFor: "203.0.113.7, 10.0.0.2, 127.0.0.1", forwardedHost: "pjsk.moe",
				forwardedProto: "https", connectingIP: "203.0.113.7",
			},
		},
		{
			name:   "direct",
			method: http.MethodGet,
			target: "/api/auth/callback?code=c&state=s",
			want: seenRequest{
				method: http.MethodGet, path: "/api/auth/callback", query: "code=c&state=s",
				forwardedFor: "127.0.0.1", forwardedHost: strings.TrimPrefix(front.URL, "http://"), forwardedProto: "http",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request, err := http.NewRequest(tt.method, front.URL+tt.target, strings.NewReader(tt.body))
			if err != nil {
				t.Fatal(err)
			}
			for key, value := range tt.headers {
				request.Header.Set(key, value)
			}
			response, err := client.Do(request)
			if err != nil {
				t.Fatal(err)
			}
			response.Body.Close()

			if got := <-seen; got != tt.want {
				t.Fatalf("upstream saw %+v, want %+v", got, tt.want)
			}
			if response.StatusCode != http.StatusSeeOther {
				t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusSeeOther)
			}
			if got := response.Header.Get("Location"); got != "https://pjsk.moe/guess-music/?tier=hard" {
				t.Fatalf("Location = %q", got)
			}
			cookies := response.Header.Values("Set-Cookie")
			if len(cookies) != 2 ||
				cookies[0] != "__Host-ms_session=new; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax" ||
				cookies[1] != "__Host-ms_auth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" {
				t.Fatalf("Set-Cookie = %q", cookies)
			}
		})
	}
}

func TestMoesekaiAPIProxyStreamsResponses(t *testing.T) {
	// Text goes through the gzip middleware, audio around it; both must flush.
	// A known length (clips have one) is not a reason to buffer either.
	for _, contentType := range []string{"application/json", "audio/mpeg"} {
		t.Run(contentType, func(t *testing.T) {
			release := make(chan struct{})
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", contentType)
				w.Header().Set("Content-Length", "13")
				_, _ = io.WriteString(w, "first\n")
				w.(http.Flusher).Flush()
				select {
				case <-release:
				case <-time.After(5 * time.Second):
					t.Error("the first chunk was held back until the response ended")
				}
				_, _ = io.WriteString(w, "second\n")
			}))
			defer upstream.Close()
			front := newMoesekaiAPIFront(t, upstream.URL)

			response, err := front.Client().Get(front.URL + "/api/guess-music/stream")
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			if gzipped := response.Uncompressed; gzipped != (contentType == "application/json") {
				t.Fatalf("gzipped = %v for %s", gzipped, contentType)
			}
			reader := bufio.NewReader(response.Body)
			first, err := reader.ReadString('\n')
			close(release)
			if err != nil || first != "first\n" {
				t.Fatalf("first chunk = %q, %v", first, err)
			}
			rest, err := io.ReadAll(reader)
			if err != nil || string(rest) != "second\n" {
				t.Fatalf("rest = %q, %v", rest, err)
			}
		})
	}
}

func TestMoesekaiAPIProxyAnswers502WhenUpstreamIsDown(t *testing.T) {
	upstream := httptest.NewServer(http.NotFoundHandler())
	upstreamURL := upstream.URL
	upstream.Close()
	front := newMoesekaiAPIFront(t, upstreamURL)

	response, err := front.Client().Get(front.URL + "/api/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	assertJSONError(t, response.StatusCode, response.Header, body, http.StatusBadGateway, "upstream_unavailable")
}

func TestMoesekaiAPIProxyAddsNoCredentialedCORS(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"user":null}`)
	}))
	defer upstream.Close()
	front := newMoesekaiAPIFront(t, upstream.URL)

	for _, origin := range []string{"https://pjsk.moe", "https://evil.example"} {
		request, err := http.NewRequest(http.MethodGet, front.URL+"/api/auth/me", nil)
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Origin", origin)
		response, err := front.Client().Do(request)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if got := response.Header.Get("Access-Control-Allow-Credentials"); got != "" {
			t.Fatalf("Origin %s: Access-Control-Allow-Credentials = %q", origin, got)
		}
		if got := response.Header.Get("Access-Control-Allow-Origin"); got != "" && got != origin {
			t.Fatalf("Origin %s: Access-Control-Allow-Origin = %q", origin, got)
		}
		if origin == "https://evil.example" && response.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Fatal("an unknown origin was allowed")
		}
	}
}
