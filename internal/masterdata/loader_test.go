package masterdata

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestFetchJSONRejectsOversizedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(maxMasterDataBytes+1))
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	var target map[string]any
	err := fetchJSON(server.URL, &target)
	if err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("fetchJSON error = %v, want size-bound rejection", err)
	}
}

func TestLoadOrFetchRejectsOversizedLocalFileAndFallsBack(t *testing.T) {
	dir := t.TempDir()
	localPath := filepath.Join(dir, "events.json")
	file, err := os.Create(localPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxMasterDataBytes + 1); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"source":"remote"}`)
	}))
	defer server.Close()

	store := NewStore(dir)
	var target map[string]string
	if err := store.loadOrFetch("events.json", server.URL, &target); err != nil {
		t.Fatal(err)
	}
	if target["source"] != "remote" {
		t.Fatalf("target = %#v, want bounded local fallback to remote", target)
	}
}

func TestFetchMarksStoreReadyOnlyAfterCompleteSnapshot(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir)
	if store.IsReady() {
		t.Fatal("new store must not be ready")
	}

	for _, filename := range []string{"events.json", "eventCards.json", "eventMusics.json", "virtualLives.json", "gachas.json"} {
		if err := os.WriteFile(filepath.Join(dir, filename), []byte("[]"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Fetch(); err != nil {
		t.Fatal(err)
	}
	if !store.IsReady() || store.ReadinessError() != nil {
		t.Fatalf("ready = %v, error = %v, want complete ready snapshot", store.IsReady(), store.ReadinessError())
	}
}

func TestStartupRetryLoadsImmediately(t *testing.T) {
	dir := t.TempDir()
	for _, filename := range []string{"events.json", "eventCards.json", "eventMusics.json", "virtualLives.json", "gachas.json"} {
		if err := os.WriteFile(filepath.Join(dir, filename), []byte("[]"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	store := NewStore(dir)
	store.StartRetryUntilReady(time.Hour)
	deadline := time.Now().Add(time.Second)
	for !store.IsReady() && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if !store.IsReady() {
		t.Fatal("startup loader did not attempt an immediate fetch")
	}
}

func TestFetchUsesETag304ToSkipUnchangedRebuildAndCachesStartupPartialSuccess(t *testing.T) {
	var gachasFail atomic.Bool
	gachasFail.Store(true)
	var eventsHits, gachasHits, notModifiedHits atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		etag := `"v1-` + r.URL.Path + `"`
		if r.Header.Get("If-None-Match") == etag {
			notModifiedHits.Add(1)
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", etag)
		switch r.URL.Path {
		case "/events.json":
			eventsHits.Add(1)
			_, _ = w.Write([]byte(`[{"id":10,"name":"Ev10","assetbundleName":"ev10"}]`))
		case "/gachas.json":
			gachasHits.Add(1)
			if gachasFail.Load() {
				w.WriteHeader(http.StatusTooManyRequests)
				return
			}
			_, _ = w.Write([]byte(`[{"id":20,"name":"G20","startAt":100,"gachaPickups":[{"gachaId":20,"cardId":77}]}]`))
		default:
			_, _ = w.Write([]byte(`[]`))
		}
	}))
	defer server.Close()

	store := NewStore(t.TempDir())
	store.eventsURL = server.URL + "/events.json"
	store.eventCardsURL = server.URL + "/eventCards.json"
	store.eventMusicsURL = server.URL + "/eventMusics.json"
	store.virtualLivesURL = server.URL + "/virtualLives.json"
	store.gachasURL = server.URL + "/gachas.json"

	// First startup attempt fails on gachas.json after events.json succeeded.
	if err := store.FetchContext(context.Background()); err == nil {
		t.Fatal("expected initial fetch error when gachas returns 429")
	}
	if store.IsReady() {
		t.Fatal("store must not be ready on partial failure")
	}

	// Second attempt succeeds and MUST NOT re-download events.json.
	gachasFail.Store(false)
	if err := store.FetchContext(context.Background()); err != nil {
		t.Fatalf("second fetch failed: %v", err)
	}
	if eventsHits.Load() != 1 {
		t.Fatalf("events.json fetched %d times across startup retry, want 1", eventsHits.Load())
	}
	if gachasHits.Load() != 2 {
		t.Fatalf("gachas.json fetched %d times, want 2", gachasHits.Load())
	}
	snap := store.GetSnapshot()
	if snap == nil || len(snap.EventIDs) != 1 || snap.EventIDs[0] != 10 || len(snap.GachaIDs) != 1 || snap.GachaIDs[0] != 20 || len(snap.CardIDs) != 1 || snap.CardIDs[0] != 77 {
		t.Fatalf("unexpected snapshot IDs: %+v", snap)
	}

	// Third attempt (periodic refresh) sees 304 for all 5 files and skips full fetch/rebuild.
	if err := store.FetchContext(context.Background()); err != nil {
		t.Fatalf("conditional refresh failed: %v", err)
	}
	if notModifiedHits.Load() != 5 {
		t.Fatalf("304 hits = %d, want 5", notModifiedHits.Load())
	}
	if eventsHits.Load() != 1 || gachasHits.Load() != 2 {
		t.Fatalf("unchanged refresh re-downloaded payloads: events=%d gachas=%d", eventsHits.Load(), gachasHits.Load())
	}
}

func TestBackgroundLoopsRespectContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	store := NewStore(t.TempDir())
	store.eventsURL = "http://127.0.0.1:1/unreachable"

	cancel()
	store.StartRetryUntilReadyContext(ctx, time.Millisecond)
	store.StartPeriodicUpdateContext(ctx, time.Millisecond)
	time.Sleep(20 * time.Millisecond)
	if store.IsReady() {
		t.Fatal("cancelled store unexpectedly became ready")
	}
}
