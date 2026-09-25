package htmlcache

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func documentRequest(path string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "http://pjsk.moe"+path, nil)
	r.Header.Set("Accept", "text/html,application/xhtml+xml")
	return r
}

func testConfig(t *testing.T) Config {
	t.Helper()
	return Config{Dir: t.TempDir()}
}

func cacheableHandler(count *atomic.Int32) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := count.Add(1)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "public, s-maxage=60")
		w.Header().Set(OriginCacheHeader, "max-age=10, stale-while-revalidate=20")
		fmt.Fprintf(w, "page-%d", n)
	})
}

func TestCachesExplicitLocaleDocument(t *testing.T) {
	var count atomic.Int32
	cfg := testConfig(t)
	c := New(cacheableHandler(&count), cfg)

	first := httptest.NewRecorder()
	c.ServeHTTP(first, documentRequest("/zh-cn/cards/1/"))
	second := httptest.NewRecorder()
	c.ServeHTTP(second, documentRequest("/zh-cn/cards/1/"))
	if count.Load() != 1 {
		t.Fatalf("upstream calls = %d, want 1", count.Load())
	}
	if first.Header().Get("X-Moesekai-Cache") != "MISS" || second.Header().Get("X-Moesekai-Cache") != "HIT" {
		t.Fatalf("unexpected cache states: %q, %q", first.Header().Get("X-Moesekai-Cache"), second.Header().Get("X-Moesekai-Cache"))
	}
	if first.Header().Get(OriginCacheHeader) != "" {
		t.Fatal("origin-only cache header leaked to client")
	}
	if second.Body.String() != "page-1" {
		t.Fatalf("cached body = %q", second.Body.String())
	}
	files, err := os.ReadDir(cfg.Dir)
	if err != nil || len(files) != 1 {
		t.Fatalf("disk cache files = %d, err = %v, want 1", len(files), err)
	}
	if data, err := os.ReadFile(filepath.Join(cfg.Dir, files[0].Name())); err != nil || string(data) != "page-1" {
		t.Fatalf("disk body = %q, err = %v", data, err)
	}
}

func TestNewClearsPreviousContainerCache(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "old.html"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	_ = New(http.NotFoundHandler(), Config{Dir: dir})
	files, err := os.ReadDir(dir)
	if err != nil || len(files) != 0 {
		t.Fatalf("files after startup = %d, err = %v", len(files), err)
	}
}

func TestBypassesUnsafeRequestVariants(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*http.Request)
	}{
		{"query", func(r *http.Request) { r.URL.RawQuery = "sortBy=id" }},
		{"rsc", func(r *http.Request) { r.Header.Set("RSC", "1") }},
		{"auth", func(r *http.Request) { r.Header.Set("Authorization", "Bearer token") }},
		{"unprefixed", func(r *http.Request) { r.URL.Path = "/cards/1/" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var count atomic.Int32
			c := New(cacheableHandler(&count), testConfig(t))
			for i := 0; i < 2; i++ {
				req := documentRequest("/zh-cn/cards/1/")
				tt.mutate(req)
				rr := httptest.NewRecorder()
				c.ServeHTTP(rr, req)
				if rr.Header().Get("X-Moesekai-Cache") != "BYPASS" {
					t.Fatalf("state = %q", rr.Header().Get("X-Moesekai-Cache"))
				}
			}
			if count.Load() != 2 {
				t.Fatalf("upstream calls = %d, want 2", count.Load())
			}
		})
	}
}

func TestDoesNotCachePrivate404OrOversizedResponses(t *testing.T) {
	tests := []struct {
		name      string
		configure func(http.ResponseWriter)
	}{
		{"no-origin-cache", func(w http.ResponseWriter) { w.Header().Del(OriginCacheHeader) }},
		{"set-cookie", func(w http.ResponseWriter) { w.Header().Set("Set-Cookie", "session=x") }},
		{"404", func(w http.ResponseWriter) { w.WriteHeader(http.StatusNotFound) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var count atomic.Int32
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				count.Add(1)
				w.Header().Set("Content-Type", "text/html")
				w.Header().Set(OriginCacheHeader, "max-age=10, stale-while-revalidate=20")
				tt.configure(w)
				_, _ = w.Write([]byte("body"))
			})
			cfg := testConfig(t)
			cfg.MaxEntryBytes = 4
			c := New(next, cfg)
			for i := 0; i < 2; i++ {
				rr := httptest.NewRecorder()
				c.ServeHTTP(rr, documentRequest("/ja-jp/music/1/"))
				if rr.Header().Get("X-Moesekai-Cache") != "BYPASS" {
					t.Fatalf("state = %q", rr.Header().Get("X-Moesekai-Cache"))
				}
			}
			if count.Load() != 2 {
				t.Fatalf("upstream calls = %d, want 2", count.Load())
			}
		})
	}
}

func TestStaleResponseRevalidatesOnce(t *testing.T) {
	var count atomic.Int32
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := count.Add(1)
		if n == 2 {
			started <- struct{}{}
			<-release
		}
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set(OriginCacheHeader, "max-age=10, stale-while-revalidate=20")
		fmt.Fprintf(w, "page-%d", n)
	})
	c := New(next, testConfig(t))
	now := time.Unix(1_000, 0)
	c.now = func() time.Time { return now }
	first := httptest.NewRecorder()
	c.ServeHTTP(first, documentRequest("/en-us/events/1/"))
	now = now.Add(11 * time.Second)

	var wg sync.WaitGroup
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rr := httptest.NewRecorder()
			c.ServeHTTP(rr, documentRequest("/en-us/events/1/"))
			if rr.Header().Get("X-Moesekai-Cache") != "STALE" {
				t.Errorf("state = %q", rr.Header().Get("X-Moesekai-Cache"))
			}
		}()
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("background refresh did not start")
	}
	wg.Wait()
	if count.Load() != 2 {
		t.Fatalf("upstream calls during refresh = %d, want 2", count.Load())
	}
	close(release)
	deadline := time.Now().Add(time.Second)
	for {
		rr := httptest.NewRecorder()
		c.ServeHTTP(rr, documentRequest("/en-us/events/1/"))
		if rr.Header().Get("X-Moesekai-Cache") == "HIT" && rr.Body.String() == "page-2" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("revalidated response not installed: state=%q body=%q", rr.Header().Get("X-Moesekai-Cache"), rr.Body.String())
		}
		time.Sleep(time.Millisecond)
	}
}

func TestLRUEvictsByEntryCount(t *testing.T) {
	var count atomic.Int32
	cfg := testConfig(t)
	cfg.MaxEntries = 1
	cfg.MaxBytes = 1 << 20
	c := New(cacheableHandler(&count), cfg)
	for _, path := range []string{"/ko-kr/cards/1/", "/ko-kr/cards/2/", "/ko-kr/cards/1/"} {
		c.ServeHTTP(httptest.NewRecorder(), documentRequest(path))
	}
	if count.Load() != 3 {
		t.Fatalf("upstream calls = %d, want 3 after eviction", count.Load())
	}
	files, err := os.ReadDir(cfg.Dir)
	if err != nil || len(files) != 1 {
		t.Fatalf("disk files after eviction = %d, err = %v, want 1", len(files), err)
	}
}

func TestPersistentCacheRestoresOnStartup(t *testing.T) {
	dir := t.TempDir()
	var count atomic.Int32

	cfg := Config{
		Dir:        dir,
		Persistent: true,
	}

	// First instance populates the cache
	c1 := New(cacheableHandler(&count), cfg)
	rr1 := httptest.NewRecorder()
	c1.ServeHTTP(rr1, documentRequest("/zh-cn/cards/1/"))
	if rr1.Header().Get("X-Moesekai-Cache") != "MISS" || count.Load() != 1 {
		t.Fatalf("instance 1 failed: status=%s count=%d", rr1.Header().Get("X-Moesekai-Cache"), count.Load())
	}

	// Second instance with same directory should restore the cached entry
	c2 := New(cacheableHandler(&count), cfg)
	rr2 := httptest.NewRecorder()
	c2.ServeHTTP(rr2, documentRequest("/zh-cn/cards/1/"))

	if rr2.Header().Get("X-Moesekai-Cache") != "HIT" {
		t.Fatalf("instance 2 want HIT, got %s", rr2.Header().Get("X-Moesekai-Cache"))
	}
	if count.Load() != 1 {
		t.Fatalf("instance 2 made upstream call (%d), want 1", count.Load())
	}
	if rr2.Body.String() != "page-1" {
		t.Fatalf("instance 2 body = %q, want page-1", rr2.Body.String())
	}
}

func TestPersistentCacheSurvivesRestoreAfterRestore(t *testing.T) {
	dir := t.TempDir()
	var count atomic.Int32
	cfg := Config{Dir: dir, Persistent: true}

	// Two stores under the same key: the second one retires the first entry,
	// and the sidecar path is derived from the key both times.
	c1 := New(cacheableHandler(&count), cfg)
	req := documentRequest("/zh-cn/cards/1/")
	c1.ServeHTTP(httptest.NewRecorder(), req)
	if !c1.store(cacheKey(req), &cachedResponse{
		status:     http.StatusOK,
		header:     http.Header{"Content-Type": []string{"text/html; charset=utf-8"}},
		storedAt:   time.Now(),
		freshUntil: time.Now().Add(time.Hour),
		staleUntil: time.Now().Add(2 * time.Hour),
	}, []byte("page-restored")) {
		t.Fatal("second store did not take effect")
	}

	metas, err := filepath.Glob(filepath.Join(dir, "*.meta"))
	if err != nil {
		t.Fatal(err)
	}
	if len(metas) != 1 {
		t.Fatalf("want 1 sidecar after re-store, got %d", len(metas))
	}

	htmlFiles, err := filepath.Glob(filepath.Join(dir, "*.html"))
	if err != nil {
		t.Fatal(err)
	}
	if len(htmlFiles) != 1 {
		t.Fatalf("want 1 html file after re-store, got %d (orphans left behind)", len(htmlFiles))
	}

	// A fresh instance must still adopt the entry from disk.
	c2 := New(cacheableHandler(&count), cfg)
	rr := httptest.NewRecorder()
	c2.ServeHTTP(rr, documentRequest("/zh-cn/cards/1/"))
	if got := rr.Header().Get("X-Moesekai-Cache"); got != "HIT" {
		t.Fatalf("restored instance want HIT, got %s", got)
	}
	if rr.Body.String() != "page-restored" {
		t.Fatalf("restored body = %q, want page-restored", rr.Body.String())
	}
}

func TestWarmupPopulatesCache(t *testing.T) {
	dir := t.TempDir()
	var count atomic.Int32

	cfg := Config{
		Dir:        dir,
		Persistent: true,
	}

	c := New(cacheableHandler(&count), cfg)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	routes := []string{"/zh-cn/cards/10/", "/zh-cn/cards/20/"}
	c.StartWarmup(ctx, routes, 10*time.Millisecond)

	// Wait for warmup to finish
	deadline := time.Now().Add(2 * time.Second)
	for count.Load() < 2 {
		if time.Now().After(deadline) {
			t.Fatalf("warmup did not complete in time, count = %d", count.Load())
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Verify both routes are cached and serve HIT
	for _, route := range routes {
		rr := httptest.NewRecorder()
		c.ServeHTTP(rr, documentRequest(route))
		if rr.Header().Get("X-Moesekai-Cache") != "HIT" {
			t.Fatalf("expected HIT for %s, got %s", route, rr.Header().Get("X-Moesekai-Cache"))
		}
	}
}

func waitForState(t *testing.T, c *Cache, path, state, body string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		rr := httptest.NewRecorder()
		c.ServeHTTP(rr, documentRequest(path))
		if rr.Header().Get("X-Moesekai-Cache") == state && rr.Body.String() == body {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("%s: want %s %q, got %s %q", path, state, body, rr.Header().Get("X-Moesekai-Cache"), rr.Body.String())
		}
		time.Sleep(time.Millisecond)
	}
}

func TestRestoredEntriesFromAnotherBuildAreRerendered(t *testing.T) {
	for _, previousBuild := range []string{"build-a", ""} {
		t.Run("previous="+previousBuild, func(t *testing.T) {
			dir := t.TempDir()
			var count atomic.Int32

			c1 := New(cacheableHandler(&count), Config{Dir: dir, Persistent: true, BuildID: previousBuild})
			c1.ServeHTTP(httptest.NewRecorder(), documentRequest("/zh-cn/gacha/1/"))

			c2 := New(cacheableHandler(&count), Config{Dir: dir, Persistent: true, BuildID: "build-b"})
			rr := httptest.NewRecorder()
			c2.ServeHTTP(rr, documentRequest("/zh-cn/gacha/1/"))
			if got := rr.Header().Get("X-Moesekai-Cache"); got != "STALE" || rr.Body.String() != "page-1" {
				t.Fatalf("first request after the build changed = %s %q, want STALE page-1", got, rr.Body.String())
			}
			waitForState(t, c2, "/zh-cn/gacha/1/", "HIT", "page-2")

			// The sidecar is written just after the entry is installed in memory.
			metaPath := filepath.Join(dir, cacheKey(documentRequest("/zh-cn/gacha/1/"))+".meta")
			deadline := time.Now().Add(2 * time.Second)
			for {
				data, _ := os.ReadFile(metaPath)
				if strings.Contains(string(data), `"buildId":"build-b"`) {
					break
				}
				if time.Now().After(deadline) {
					t.Fatalf("sidecar does not record the new build: %s", data)
				}
				time.Sleep(time.Millisecond)
			}

			// The re-rendered entry belongs to the new build, so another start of
			// the same build keeps it fresh.
			c3 := New(cacheableHandler(&count), Config{Dir: dir, Persistent: true, BuildID: "build-b"})
			rr = httptest.NewRecorder()
			c3.ServeHTTP(rr, documentRequest("/zh-cn/gacha/1/"))
			if got := rr.Header().Get("X-Moesekai-Cache"); got != "HIT" || rr.Body.String() != "page-2" {
				t.Fatalf("restart of the same build = %s %q, want HIT page-2", got, rr.Body.String())
			}
			if count.Load() != 2 {
				t.Fatalf("upstream calls = %d, want 2", count.Load())
			}
		})
	}
}

func TestRestoredEntriesFromTheSameBuildStayFresh(t *testing.T) {
	dir := t.TempDir()
	var count atomic.Int32
	cfg := Config{Dir: dir, Persistent: true, BuildID: "build-a"}

	New(cacheableHandler(&count), cfg).ServeHTTP(httptest.NewRecorder(), documentRequest("/zh-cn/gacha/1/"))
	rr := httptest.NewRecorder()
	New(cacheableHandler(&count), cfg).ServeHTTP(rr, documentRequest("/zh-cn/gacha/1/"))
	if got := rr.Header().Get("X-Moesekai-Cache"); got != "HIT" || count.Load() != 1 {
		t.Fatalf("same build restore = %s with %d upstream calls, want HIT with 1", got, count.Load())
	}
}

func TestBackgroundRefreshesAreBounded(t *testing.T) {
	var count, inFlight, peak atomic.Int32
	release := make(chan struct{})
	var refreshing atomic.Bool
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := count.Add(1)
		if refreshing.Load() {
			cur := inFlight.Add(1)
			for {
				old := peak.Load()
				if cur <= old || peak.CompareAndSwap(old, cur) {
					break
				}
			}
			<-release
			inFlight.Add(-1)
		}
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set(OriginCacheHeader, "max-age=10, stale-while-revalidate=20")
		fmt.Fprintf(w, "page-%d", n)
	})
	c := New(next, testConfig(t))
	now := time.Unix(1_000, 0)
	c.now = func() time.Time { return now }

	const pages = maxBackgroundRefreshes + 3
	for i := 0; i < pages; i++ {
		c.ServeHTTP(httptest.NewRecorder(), documentRequest(fmt.Sprintf("/zh-cn/cards/%d/", i)))
	}
	now = now.Add(11 * time.Second)
	refreshing.Store(true)

	for i := 0; i < pages; i++ {
		rr := httptest.NewRecorder()
		c.ServeHTTP(rr, documentRequest(fmt.Sprintf("/zh-cn/cards/%d/", i)))
		if got := rr.Header().Get("X-Moesekai-Cache"); got != "STALE" {
			t.Fatalf("page %d state = %s, want STALE", i, got)
		}
	}
	deadline := time.Now().Add(time.Second)
	for inFlight.Load() < maxBackgroundRefreshes && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if got := count.Load(); got != pages+maxBackgroundRefreshes {
		t.Fatalf("upstream calls = %d, want %d (only %d refreshes may start)", got, pages+maxBackgroundRefreshes, maxBackgroundRefreshes)
	}

	close(release)
	deadline = time.Now().Add(time.Second)
	for inFlight.Load() > 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if peak.Load() > maxBackgroundRefreshes {
		t.Fatalf("peak concurrent refreshes = %d, want at most %d", peak.Load(), maxBackgroundRefreshes)
	}

	// A page skipped while every slot was busy refreshes on a later request.
	last := fmt.Sprintf("/zh-cn/cards/%d/", pages-1)
	c.ServeHTTP(httptest.NewRecorder(), documentRequest(last))
	deadline = time.Now().Add(2 * time.Second)
	for {
		rr := httptest.NewRecorder()
		c.ServeHTTP(rr, documentRequest(last))
		if rr.Header().Get("X-Moesekai-Cache") == "HIT" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("skipped page never refreshed: state=%s", rr.Header().Get("X-Moesekai-Cache"))
		}
		time.Sleep(time.Millisecond)
	}
}
