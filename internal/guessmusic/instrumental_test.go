package guessmusic

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// instSong stands in for every instrumental: 96 kbps CBR with an Info
// frame, like the Demucs batch (distinct from fakeSong, 128 kbps).
var instSong = synthCBR(4600, cbrOptions{info: true, kbps: 96})

const instSongSeconds = 4600 * 1152.0 / 44100

func instAssetName(vocalID int) string { return fmt.Sprintf("inst_%04d", vocalID) }

// testManifest lists the sung vocals of catalog (unreleased ones included,
// like the real batch) that keep accepts (nil: all).
func testManifest(catalog *Catalog, keep func(MusicVocal) bool) *instManifest {
	m := &instManifest{Version: 1, Server: "jp", Model: "htdemucs", Bitrate: "96k", Items: map[string]instItem{}}
	catalog.mu.RLock()
	defer catalog.mu.RUnlock()
	for musicID, vocals := range catalog.vocals {
		for _, v := range vocals {
			if v.MusicVocalType == "instrumental" || v.MusicVocalType == "streaming_live" {
				continue
			}
			if keep != nil && !keep(v) {
				continue
			}
			m.Items[instAssetName(v.ID)] = instItem{MusicID: musicID, VocalID: v.ID, Bytes: int64(len(instSong)), DurationSec: instSongSeconds}
		}
	}
	return m
}

func testInstIndex(catalog *Catalog) *instIndex {
	idx, err := newInstIndex(testManifest(catalog, nil), ServerRegion)
	if err != nil {
		panic(err)
	}
	return idx
}

// firstSongs keeps the vocals of the n lowest sung music IDs.
func firstSongs(catalog *Catalog, n int) func(MusicVocal) bool {
	ids := map[int]bool{}
	for _, v := range testManifest(catalog, nil).Items {
		ids[v.MusicID] = true
	}
	var sorted []int
	for id := range ids {
		if id != 99 { // unreleased
			sorted = append(sorted, id)
		}
	}
	sort.Ints(sorted)
	keep := map[int]bool{}
	for _, id := range sorted[:n] {
		keep[id] = true
	}
	return func(v MusicVocal) bool { return keep[v.MusicID] }
}

func writeManifest(t *testing.T, root string, m *instManifest) {
	t.Helper()
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "jp"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "jp", "manifest.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
}

// writeInstDir writes <root>/jp/manifest.json and one file per item
// (hard links to a single copy of instSong).
func writeInstDir(t *testing.T, root string, m *instManifest) {
	t.Helper()
	dir := filepath.Join(root, "jp")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	master := filepath.Join(root, "song.bin")
	if _, err := os.Stat(master); err != nil {
		if err := os.WriteFile(master, instSong, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for asset := range m.Items {
		p := filepath.Join(dir, asset+".mp3")
		if _, err := os.Stat(p); err == nil {
			continue
		}
		if err := os.Link(master, p); err != nil {
			if err := os.WriteFile(p, instSong, 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}
	writeManifest(t, root, m)
}

// clipCutFrom reports whether the clip's audio frames were cut from song.
func clipCutFrom(t *testing.T, clip, song []byte) bool {
	t.Helper()
	stream, err := parseMP3(clip)
	if err != nil {
		t.Fatal(err)
	}
	return bytes.Contains(song, clip[stream.frames[0].offset:])
}

// assertNoInstLeak fails if a response names the instrumental location,
// the manifest or an instrumental asset.
func assertNoInstLeak(t *testing.T, r result, root string) {
	t.Helper()
	var all strings.Builder
	all.Write(r.Body)
	for k, vs := range r.Header {
		all.WriteString(k + ": " + strings.Join(vs, ",") + "\n")
	}
	text := all.String()
	if r.Header.Get("Content-Type") == "audio/mpeg" {
		text = strings.Join(r.Header.Values("Content-Type"), "") // binary body
		for k, vs := range r.Header {
			text += k + strings.Join(vs, ",")
		}
	}
	needles := []string{"inst_", "manifest", ".mp3", "/jp/", "song.bin"}
	if root != "" {
		needles = append(needles, root)
	}
	for _, n := range needles {
		if strings.Contains(text, n) {
			t.Fatalf("response leaks %q: %s", n, text)
		}
	}
}

func tierAvailability(t *testing.T, h *harness) map[string]bool {
	t.Helper()
	var info DailyInfo
	if err := json.Unmarshal(h.do(http.MethodGet, base, "", "").Body, &info); err != nil {
		t.Fatal(err)
	}
	out := map[string]bool{}
	for _, tier := range info.Tiers {
		out[tier.ID] = tier.Available
	}
	return out
}

const practiceBase = "/api/guess-music/practice"

func (h *harness) postClip(body string) result {
	h.t.Helper()
	return h.do(http.MethodPost, practiceBase+"/clips", body, "")
}

func TestNewInstrumentalSource(t *testing.T) {
	if s, err := NewInstrumentalSource("  "); s != nil || err != nil {
		t.Fatal("empty source must disable vocal removal")
	}
	for _, bad := range []string{"relative/dir", "http://", "https:///x"} {
		if _, err := NewInstrumentalSource(bad); err == nil {
			t.Fatalf("%q accepted", bad)
		}
	}
	s, err := NewInstrumentalSource("https://inst.example/private/")
	if err != nil {
		t.Fatal(err)
	}
	if u, _ := s.http.url("0001_01"); u != "https://inst.example/private/jp/0001_01.mp3" || s.Kind() != "http" {
		t.Fatalf("url %s", u)
	}
	if _, err := s.http.url("../x"); err == nil {
		t.Fatal("bad asset accepted")
	}
	s, err = NewInstrumentalSource("/srv/inst/")
	if err != nil || s.dir != filepath.Join("/srv/inst", "jp") || s.Kind() != "directory" {
		t.Fatalf("dir %v %v", s, err)
	}
	if s.current() != nil {
		t.Fatal("manifest loaded before Refresh")
	}
}

func TestInstrumentalDirRangeReads(t *testing.T) {
	root := t.TempDir()
	writeInstDir(t, root, &instManifest{Items: map[string]instItem{"inst_0001": {MusicID: 1, VocalID: 1, DurationSec: 1}}})
	s, _ := NewInstrumentalSource(root)
	ctx := context.Background()
	r, err := s.FetchRange(ctx, "inst_0001", 100, 50)
	if err != nil || !bytes.Equal(r.Data, instSong[100:150]) || r.Offset != 100 || r.Total != int64(len(instSong)) || r.Full {
		t.Fatalf("range read %v", err)
	}
	end := int64(len(instSong))
	if r, err := s.FetchRange(ctx, "inst_0001", end-10, 100); err != nil || len(r.Data) != 10 {
		t.Fatalf("tail read %v", err)
	}
	if _, err := s.FetchRange(ctx, "inst_0001", end, 10); err == nil {
		t.Fatal("read past the end")
	}
	if _, err := s.FetchRange(ctx, "../inst_0001", 0, 10); err == nil {
		t.Fatal("path traversal accepted")
	}
	if all, err := s.Fetch(ctx, "inst_0001"); err != nil || !bytes.Equal(all, instSong) {
		t.Fatalf("fetch %v", err)
	}
	if _, err := s.Exists(ctx, "inst_0001"); err == nil {
		t.Fatal("Exists before the manifest loaded")
	}
	if err := s.Refresh(ctx); err != nil {
		t.Fatal(err)
	}
	if ok, err := s.Exists(ctx, "inst_0001"); !ok || err != nil {
		t.Fatal("listed asset missing")
	}
}

func TestHellAvailability(t *testing.T) {
	ctx := context.Background()
	t.Run("unset", func(t *testing.T) {
		h := newHarnessWith(t, nil, false, nil)
		if got := tierAvailability(t, h); !got["easy"] || !got["normal"] || !got["hard"] || got["hell"] {
			t.Fatalf("availability %v", got)
		}
		r := h.do(http.MethodPost, base+"/sessions", `{"tier":"hell","mode":"practice"}`, "")
		h.expect(r, 409, "tier_unavailable")
		h.expect(h.do(http.MethodPost, base+"/sessions", `{"tier":"hell","mode":"ranked"}`, ""), 409, "tier_unavailable")
		list := h.do(http.MethodGet, practiceBase+"/instrumentals", "", "")
		h.expect(list, 200, "")
		if string(bytes.TrimSpace(list.Body)) != `{"available":false,"server":"jp","vocalIds":[]}` {
			t.Fatalf("instrumentals %s", list.Body)
		}
		h.expect(h.postClip(`{"vocalId":1,"clipSeconds":5,"seed":"x","round":0}`), 409, "inst_unavailable")
		// Prewarm skips hell without failing.
		if err := h.svc.prewarm(nil); err != nil || h.svc.hasPlan("2026-10-09", "hell", ModeRanked) {
			t.Fatalf("prewarm %v", err)
		}
	})

	t.Run("manifest error", func(t *testing.T) {
		root := t.TempDir()
		h := newHarnessWith(t, nil, false, func(o *Options, _ string) {
			o.Instrumentals, _ = NewInstrumentalSource(root)
		})
		if tierAvailability(t, h)["hell"] {
			t.Fatal("hell available without a manifest")
		}
		if err := h.svc.prewarm(nil); err != nil {
			t.Fatal(err)
		}
		writeInstDir(t, root, testManifest(h.svc.catalog, nil))
		if err := h.svc.inst.Refresh(ctx); err != nil {
			t.Fatal(err)
		}
		if !tierAvailability(t, h)["hell"] {
			t.Fatal("hell unavailable after the manifest loaded")
		}
		// The next prewarm picks hell up.
		if err := h.svc.prewarm(nil); err != nil || !h.svc.hasPlan("2026-10-09", "hell", ModeRanked) {
			t.Fatalf("hell not prewarmed: %v", err)
		}
		// A broken or foreign manifest keeps the last good copy.
		for _, bad := range []string{`{"items":`, `{"server":"cn","items":{}}`} {
			if err := os.WriteFile(filepath.Join(root, "jp", "manifest.json"), []byte(bad), 0o644); err != nil {
				t.Fatal(err)
			}
			if err := h.svc.inst.Refresh(ctx); err == nil {
				t.Fatalf("%s accepted", bad)
			}
			if !tierAvailability(t, h)["hell"] {
				t.Fatal("a failed refresh dropped the manifest")
			}
		}
		if err := os.Remove(filepath.Join(root, "jp", "manifest.json")); err != nil {
			t.Fatal(err)
		}
		if err := h.svc.inst.Refresh(ctx); err == nil || !tierAvailability(t, h)["hell"] {
			t.Fatal("a missing manifest dropped the last copy")
		}
	})

	t.Run("too few songs", func(t *testing.T) {
		h := newHarnessWith(t, nil, true, func(o *Options, root string) {
			writeManifest(t, root, testManifest(o.Catalog, firstSongs(o.Catalog, RoundsPerDay-1)))
		})
		if tierAvailability(t, h)["hell"] {
			t.Fatal("hell available with 19 songs")
		}
		h.expect(h.do(http.MethodPost, base+"/sessions", `{"tier":"hell","mode":"practice"}`, ""), 409, "tier_unavailable")
		// Free play still lists the 19 songs' vocals.
		var list PracticeInstrumentals
		_ = json.Unmarshal(h.do(http.MethodGet, practiceBase+"/instrumentals", "", "").Body, &list)
		if !list.Available || len(list.VocalIDs) != RoundsPerDay-1 {
			t.Fatalf("instrumentals %+v", list)
		}
		writeManifest(t, h.instRoot, testManifest(h.svc.catalog, firstSongs(h.svc.catalog, RoundsPerDay)))
		if err := h.svc.inst.Refresh(ctx); err != nil {
			t.Fatal(err)
		}
		if !tierAvailability(t, h)["hell"] {
			t.Fatal("hell unavailable with 20 songs")
		}
		_, r := h.create("hell", "practice", "")
		h.expect(r, 201, "")
	})
}

func TestHellPlanUsesManifestVocals(t *testing.T) {
	excluded := map[int]bool{1: true, 2: true, 3: true, 4: true, 6: true, 7: true}
	h := newHarnessWith(t, nil, true, func(o *Options, root string) {
		writeManifest(t, root, testManifest(o.Catalog, func(v MusicVocal) bool { return !excluded[v.MusicID] }))
	})
	idx := h.svc.instIndex()
	for _, mode := range []string{ModeRanked, ModePractice} {
		plan := h.planOf("hell", mode)
		for i, r := range plan.Rounds {
			e, ok := idx.lookup(r.VocalID)
			if !ok || e.Asset != r.Asset || e.MusicID != r.MusicID || !strings.HasPrefix(r.Asset, "inst_") {
				t.Fatalf("%s round %d uses %d/%s outside the manifest", mode, i, r.VocalID, r.Asset)
			}
			if excluded[r.MusicID] || r.VocalType == "instrumental" || !r.VocalRemoval || r.MusicID == 99 {
				t.Fatalf("%s round %d: %+v", mode, i, r)
			}
		}
	}
	// Other tiers still use the CDN assets.
	for _, r := range h.planOf("hard", ModeRanked).Rounds {
		if strings.HasPrefix(r.Asset, "inst_") || r.VocalRemoval {
			t.Fatalf("hard round uses an instrumental: %+v", r)
		}
	}
}

func TestHellClipsFromInstrumentalDir(t *testing.T) {
	h := newHarness(t, nil)
	id, r := h.create("hell", "practice", "")
	h.expect(r, 201, "")
	start := h.do(http.MethodPost, roundPath(id, 0, "start"), "", "")
	h.expect(start, 200, "")
	h.assertNoLeak(start)
	assertNoInstLeak(t, start, h.instRoot)
	clip := h.do(http.MethodGet, roundPath(id, 0, "clip"), "", "")
	h.expect(clip, 200, "")
	assertNoInstLeak(t, clip, h.instRoot)
	if clip.Header.Get("Content-Type") != "audio/mpeg" || !clipCutFrom(t, clip.Body, instSong) {
		t.Fatal("hell clip is not cut from the instrumental")
	}
	if bytes.Contains(clip.Body, []byte("ID3")) || bytes.Contains(clip.Body, []byte("TAG")) {
		t.Fatal("clip carries tags")
	}
	parsed, _ := parseMP3(clip.Body)
	if parsed.frames[0].header.bitrate != 96000 {
		t.Fatalf("bitrate %d", parsed.frames[0].header.bitrate)
	}
	h.svc.warmWG.Wait()
	if h.audio.ranges != 0 || h.audio.fetches != 0 {
		t.Fatalf("hell used the CDN (%d ranges, %d fetches)", h.audio.ranges, h.audio.fetches)
	}
	fin := h.do(http.MethodPost, base+"/sessions/"+id+"/finish", "", "")
	h.expect(fin, 200, "")
	assertNoInstLeak(t, fin, h.instRoot)
}

type instServerStats struct {
	mu       sync.Mutex
	requests int
	full     int
	maxBytes int64
}

// fakeInstServer serves root over HTTP with Range support and records
// whether instrumental reads were ranged.
func fakeInstServer(t *testing.T, root string) (*httptest.Server, *instServerStats) {
	stats := &instServerStats{}
	files := http.FileServer(http.Dir(root))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var n int64
		files.ServeHTTP(countingWriter{ResponseWriter: w, n: &n}, r)
		if strings.HasSuffix(r.URL.Path, ".mp3") {
			stats.mu.Lock()
			stats.requests++
			if r.Header.Get("Range") == "" {
				stats.full++
			}
			if n > stats.maxBytes {
				stats.maxBytes = n
			}
			stats.mu.Unlock()
		}
	}))
	t.Cleanup(srv.Close)
	return srv, stats
}

func TestHellClipsFromInstrumentalHTTP(t *testing.T) {
	var stats *instServerStats
	var srvURL string
	h := newHarnessWith(t, nil, true, func(o *Options, root string) {
		var srv *httptest.Server
		srv, stats = fakeInstServer(t, root)
		srvURL = srv.URL
		src, err := NewInstrumentalSource(srv.URL + "/")
		if err != nil {
			t.Fatal(err)
		}
		o.Instrumentals = src
	})
	if !tierAvailability(t, h)["hell"] {
		t.Fatal("manifest not loaded over HTTP")
	}
	id, r := h.create("hell", "practice", "")
	h.expect(r, 201, "")
	h.expect(h.do(http.MethodPost, roundPath(id, 0, "start"), "", ""), 200, "")
	clip := h.do(http.MethodGet, roundPath(id, 0, "clip"), "", "")
	h.expect(clip, 200, "")
	if !clipCutFrom(t, clip.Body, instSong) {
		t.Fatal("hell clip is not cut from the instrumental")
	}
	assertNoInstLeak(t, clip, srvURL)

	post := h.postClip(`{"vocalId":1,"clipSeconds":30,"seed":"http","round":1}`)
	h.expect(post, 200, "")
	assertNoInstLeak(t, post, srvURL)
	var pc PracticeClipResponse
	_ = json.Unmarshal(post.Body, &pc)
	free := h.do(http.MethodGet, pc.ClipURL, "", "")
	h.expect(free, 200, "")
	if !clipCutFrom(t, free.Body, instSong) {
		t.Fatal("free clip is not cut from the instrumental")
	}
	h.svc.warmWG.Wait()
	stats.mu.Lock()
	defer stats.mu.Unlock()
	if stats.requests == 0 || stats.full != 0 || stats.maxBytes > int64(len(instSong))/3 {
		t.Fatalf("instrumental reads: %d requests, %d without Range, largest %d of %d bytes",
			stats.requests, stats.full, stats.maxBytes, len(instSong))
	}
}

func TestManifestRefreshKeepsPlan(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t, nil)
	ranked := h.planOf("hell", ModeRanked)
	drop := map[int]bool{}
	for _, r := range ranked.Rounds[:3] {
		drop[r.VocalID] = true
	}
	writeManifest(t, h.instRoot, testManifest(h.svc.catalog, func(v MusicVocal) bool { return !drop[v.ID] }))
	if err := h.svc.inst.Refresh(ctx); err != nil {
		t.Fatal(err)
	}
	if _, still := h.svc.instIndex().lookup(ranked.Rounds[0].VocalID); still {
		t.Fatal("refresh did not apply")
	}
	if again := h.planOf("hell", ModeRanked); !reflect.DeepEqual(again.Rounds, ranked.Rounds) {
		t.Fatal("a manifest refresh changed today's plan")
	}
	// A restarted instance reads the persisted plan.
	inst, _ := NewInstrumentalSource(h.instRoot)
	svc2, err := New(ctx, Options{Store: h.store, Catalog: h.svc.catalog, Audio: h.audio, Location: testLoc, Now: h.clock.Now, Instrumentals: inst})
	if err != nil {
		t.Fatal(err)
	}
	stored, err := svc2.planFor(ctx, ranked.Date, "hell", ModeRanked)
	if err != nil || !reflect.DeepEqual(stored.Rounds, ranked.Rounds) {
		t.Fatalf("restarted plan differs: %v", err)
	}
	// The pinned rounds still play although their vocals left the manifest.
	if c, err := svc2.clips.Get(ctx, svc2.clipJob(stored, 0)); err != nil || !clipCutFrom(t, c.Data, instSong) {
		t.Fatalf("pinned round clip: %v", err)
	}
	// A new set would follow the new manifest.
	fresh, err := generatePlan(ctx, h.svc.secret, dayFor(h.clock.Now(), testLoc), mustTier("hell"), ModeRanked, h.svc.catalog, nil, h.svc.instIndex())
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range fresh.Rounds {
		if drop[r.VocalID] {
			t.Fatal("a fresh plan used a dropped vocal")
		}
	}
}

func TestNormalizeTitle(t *testing.T) {
	same := [][2]string{
		{"Ｔｅｌｌ　Ｙｏｕｒ　Ｗｏｒｌｄ", "tell your world"},
		{"TellYourWorld", "tell your world"},
		{"テオ", "てお"},
		{"ロキ！", "ロキ"},
		{"アイディスマイル", "あいでぃすまいる"},
	}
	for _, p := range same {
		if normalizeTitle(p[0]) != normalizeTitle(p[1]) {
			t.Errorf("%q and %q differ: %q vs %q", p[0], p[1], normalizeTitle(p[0]), normalizeTitle(p[1]))
		}
	}
	if normalizeTitle("ロキ") == normalizeTitle("ロック") || normalizeTitle("!!") != "" {
		t.Error("unexpected match")
	}
}

func TestSameTitleGuessAccepted(t *testing.T) {
	h := newHarness(t, nil)
	id, r := h.create("hard", "practice", "")
	h.expect(r, 201, "")
	answer := h.plan.Rounds[0]
	// A re-release under another music ID, title written differently.
	variant := []rune(strings.ToUpper(answer.MusicTitle))
	for i, c := range variant {
		if c >= '0' && c <= '9' {
			variant[i] = c + 0xFEE0
		}
	}
	h.svc.catalog.mu.Lock()
	h.svc.catalog.musics[500] = Music{ID: 500, Title: string(variant), PublishedAt: 1}
	h.svc.catalog.mu.Unlock()

	h.expect(h.do(http.MethodPost, roundPath(id, 0, "start"), "", ""), 200, "")
	h.expect(h.do(http.MethodGet, roundPath(id, 0, "clip"), "", ""), 200, "")
	res := h.do(http.MethodPost, roundPath(id, 0, "answer"), `{"musicId":500}`, "")
	h.expect(res, 200, "")
	body := res.json(t)
	if body["correct"] != true || body["final"] != true || body["answer"].(map[string]interface{})["musicId"].(float64) != float64(answer.MusicID) {
		t.Fatalf("same-title guess: %s", res.Body)
	}
	// A different title is still wrong.
	h.expect(h.do(http.MethodPost, roundPath(id, 1, "start"), "", ""), 200, "")
	h.expect(h.do(http.MethodGet, roundPath(id, 1, "clip"), "", ""), 200, "")
	wrong := h.do(http.MethodPost, roundPath(id, 1, "answer"), fmt.Sprintf(`{"musicId":%d}`, h.wrongID(1)), "")
	if wrong.json(t)["correct"] != false {
		t.Fatalf("wrong guess accepted: %s", wrong.Body)
	}
}

func TestOptionsSkipSameTitle(t *testing.T) {
	var released []poolEntry
	for id := 1; id <= 12; id++ {
		title := fmt.Sprintf("Song %d", id)
		if id == 2 {
			title = "ＳＯＮＧ　１" // same song as 1
		}
		released = append(released, poolEntry{music: Music{ID: id, Title: title}})
	}
	for round := 0; round < 40; round++ {
		opts := pickOptions([]byte("seed"), round, 1, released, ChoiceOptions)
		if len(opts) != ChoiceOptions {
			t.Fatalf("round %d: %v", round, opts)
		}
		for _, id := range opts {
			if id == 2 {
				t.Fatalf("round %d offers the same-title re-release: %v", round, opts)
			}
		}
	}
}

func TestPracticeInstrumentalsList(t *testing.T) {
	h := newHarness(t, nil)
	r := h.do(http.MethodGet, practiceBase+"/instrumentals", "", "")
	h.expect(r, 200, "")
	if r.Header.Get("Cache-Control") != "public, max-age=300" {
		t.Fatalf("cache control %q", r.Header.Get("Cache-Control"))
	}
	assertNoInstLeak(t, r, h.instRoot)
	var list PracticeInstrumentals
	if err := json.Unmarshal(r.Body, &list); err != nil {
		t.Fatal(err)
	}
	var want []int
	for id := 1; id <= 40; id++ {
		if id%6 != 5 { // instrumental-only songs have none
			want = append(want, 2*id-1)
		}
	}
	if !list.Available || list.Server != "jp" || !reflect.DeepEqual(list.VocalIDs, want) {
		t.Fatalf("instrumentals %s", r.Body)
	}
	h.expect(h.do(http.MethodHead, practiceBase+"/instrumentals", "", ""), 200, "")
	h.expect(h.do(http.MethodPost, practiceBase+"/instrumentals", "", ""), 405, "method_not_allowed")
}

func TestPracticeClipFlow(t *testing.T) {
	h := newHarness(t, nil)
	clipOf := func(r result) PracticeClipResponse {
		t.Helper()
		h.expect(r, 200, "")
		assertNoInstLeak(t, r, h.instRoot)
		var pc PracticeClipResponse
		if err := json.Unmarshal(r.Body, &pc); err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(pc.ClipURL, "/api/guess-music/practice/clips/") {
			t.Fatalf("clipUrl %s", pc.ClipURL)
		}
		return pc
	}
	a := clipOf(h.postClip(`{"vocalId":1,"clipSeconds":5,"seed":"share-abc","round":3}`))
	b := clipOf(h.postClip(`{"vocalId":1,"clipSeconds":5,"seed":"share-abc","round":3}`))
	if a.StartSeconds != b.StartSeconds || a.ClipSeconds != 5 || a.ClipURL == b.ClipURL {
		t.Fatalf("same seed and round: %+v vs %+v", a, b)
	}
	// The client cannot choose the offset.
	c := clipOf(h.postClip(`{"vocalId":1,"clipSeconds":5,"seed":"share-abc","round":3,"startSeconds":0,"start":0,"offset":0}`))
	if c.StartSeconds != a.StartSeconds {
		t.Fatal("client offset fields changed the start")
	}
	// Different rounds and seeds move the clip (within the vocal's window).
	movedByRound, movedBySeed := false, false
	for i := 4; i < 10; i++ {
		movedByRound = movedByRound || clipOf(h.postClip(fmt.Sprintf(`{"vocalId":1,"clipSeconds":5,"seed":"share-abc","round":%d}`, i))).StartSeconds != a.StartSeconds
		movedBySeed = movedBySeed || clipOf(h.postClip(fmt.Sprintf(`{"vocalId":1,"clipSeconds":5,"seed":"share-ab%d","round":3}`, i))).StartSeconds != a.StartSeconds
	}
	if !movedByRound || !movedBySeed {
		t.Fatal("start should depend on seed and round")
	}
	// The start follows the documented HMAC (frame-aligned down).
	wantMs := practiceStartMs(h.svc.secret, "share-abc", 3, 1, 5, 9, instSongSeconds)
	fd := 1152.0 / 44100
	if d := float64(wantMs)/1000 - a.StartSeconds; d < -0.001 || d > fd+0.001 {
		t.Fatalf("start %v, want frame at %v", a.StartSeconds, float64(wantMs)/1000)
	}
	for round := 0; round <= practiceMaxRound; round++ {
		for secs := range practiceClipSeconds {
			ms := practiceStartMs(h.svc.secret, "bounds", round, 1, secs, 9, instSongSeconds)
			if ms < 9000 || float64(ms)+float64(secs)*1000 > (instSongSeconds-clipTailSeconds)*1000 {
				t.Fatalf("start %dms of a %ds clip outside [fillerSec, duration - clip - 3]", ms, secs)
			}
		}
	}

	for _, secs := range []int{2, 5, 15, 30} {
		pc := clipOf(h.postClip(fmt.Sprintf(`{"vocalId":7,"clipSeconds":%d,"seed":"len","round":0}`, secs)))
		got := h.do(http.MethodGet, pc.ClipURL, "", "")
		h.expect(got, 200, "")
		assertNoInstLeak(t, got, h.instRoot)
		if got.Header.Get("Content-Type") != "audio/mpeg" || got.Header.Get("Cache-Control") != "private, max-age=1800" ||
			got.Header.Get("Content-Length") != fmt.Sprint(len(got.Body)) {
			t.Fatalf("clip headers %v", got.Header)
		}
		parsed, err := parseMP3(got.Body)
		if err != nil {
			t.Fatal(err)
		}
		if d := parsed.Duration(); d < float64(secs) || d > float64(secs)+1 {
			t.Fatalf("%ds clip lasts %v", secs, d)
		}
		if !clipCutFrom(t, got.Body, instSong) || bytes.Contains(got.Body, []byte("ID3")) {
			t.Fatal("free clip is not a tag-free cut of the instrumental")
		}
	}
	part := h.do(http.MethodGet, a.ClipURL, "", "", "Range", "bytes=0-99")
	h.expect(part, 206, "")
	if len(part.Body) != 100 {
		t.Fatalf("range returned %d bytes", len(part.Body))
	}
	h.expect(h.do(http.MethodHead, a.ClipURL, "", ""), 200, "")
	h.expect(h.do(http.MethodPut, practiceBase+"/clips", "", ""), 405, "method_not_allowed")
}

func TestPracticeClipValidation(t *testing.T) {
	h := newHarnessWith(t, nil, true, func(o *Options, root string) {
		// The manifest also lists an instrumental-only vocal (9) and the
		// unreleased song's vocal (999): neither may be played.
		m := testManifest(o.Catalog, nil)
		m.Items["inst_0009"] = instItem{MusicID: 5, VocalID: 9, DurationSec: instSongSeconds}
		writeInstDir(t, root, m)
	})
	for _, body := range []string{
		``, `not json`, `{}`, `{"vocalId":1}`, `{"vocalId":1,"clipSeconds":3}`, `{"vocalId":1,"clipSeconds":60}`,
		`{"vocalId":1,"clipSeconds":"5"}`, `{"vocalId":1.5,"clipSeconds":5}`, `{"vocalId":-1,"clipSeconds":5}`,
		`{"vocalId":1,"clipSeconds":5,"round":100}`, `{"vocalId":1,"clipSeconds":5,"round":-1}`,
		`{"vocalId":1,"clipSeconds":5,"seed":5}`, `{"vocalId":1,"clipSeconds":5,"seed":"` + strings.Repeat("x", 65) + `"}`,
	} {
		r := h.postClip(body)
		h.expect(r, 400, "bad_request")
		assertNoInstLeak(t, r, h.instRoot)
	}
	h.expect(h.postClip(`{"vocalId":1,"clipSeconds":5,"seed":"`+strings.Repeat("曲", 64)+`","round":99}`), 200, "")
	for _, vocal := range []int{2 /* live */, 9 /* instrumental-only */, 999 /* unreleased */, 123456} {
		r := h.postClip(fmt.Sprintf(`{"vocalId":%d,"clipSeconds":5,"seed":"x","round":0}`, vocal))
		h.expect(r, 404, "unknown_vocal")
		assertNoInstLeak(t, r, h.instRoot)
	}
}

func TestPracticeTokenTamperAndExpiry(t *testing.T) {
	h := newHarness(t, nil)
	r := h.postClip(`{"vocalId":1,"clipSeconds":15,"seed":"tamper","round":0}`)
	h.expect(r, 200, "")
	var pc PracticeClipResponse
	_ = json.Unmarshal(r.Body, &pc)
	token := strings.TrimPrefix(pc.ClipURL, practiceClipsPath)
	if strings.Contains(token, "tamper") || len(token) != 67 {
		t.Fatalf("token %q", token)
	}
	h.expect(h.do(http.MethodGet, pc.ClipURL, "", ""), 200, "")

	flip := func(s string, i int) string {
		b := []byte(s)
		if b[i] == 'A' {
			b[i] = 'B'
		} else {
			b[i] = 'A'
		}
		return string(b)
	}
	forged, _ := sealPracticeToken(bytes.Repeat([]byte{1}, 32), bytes.Repeat([]byte{2}, 32),
		practiceClip{VocalID: 1, StartMs: 0, ClipSeconds: 30, Expires: h.clock.Now().Add(time.Hour).Unix()})
	unlisted, _ := sealPracticeToken(h.svc.tokenEnc, h.svc.tokenMAC,
		practiceClip{VocalID: 2, StartMs: 1000, ClipSeconds: 5, Expires: h.clock.Now().Add(time.Hour).Unix()})
	for _, bad := range []string{flip(token, 0), flip(token, 20), flip(token, 40), flip(token, 60), token[:66], token + "A", "abc", forged, unlisted} {
		res := h.do(http.MethodGet, practiceClipsPath+bad, "", "")
		h.expect(res, 404, "clip_not_found")
		assertNoInstLeak(t, res, h.instRoot)
	}
	// A valid token from the server's own keys lets nobody pick offsets
	// without those keys; it still expires after 30 minutes.
	h.clock.Advance(29 * time.Minute)
	h.expect(h.do(http.MethodGet, pc.ClipURL, "", ""), 200, "")
	h.clock.Advance(time.Minute + time.Second)
	h.expect(h.do(http.MethodGet, pc.ClipURL, "", ""), 410, "clip_expired")
}

// Free-play clips start anywhere in the song (by seed and round), not in
// one fixed stretch, so vocal-removal rounds stay varied.
func TestPracticeClipsSpreadOverTheSong(t *testing.T) {
	h := newHarness(t, nil)
	lo, hi := instSongSeconds, 0.0
	for i := 0; i < 60; i++ {
		ms := practiceStartMs(h.svc.secret, fmt.Sprintf("spread-%d", i), i%100, 1, 5, 9, instSongSeconds)
		sec := float64(ms) / 1000
		if sec < lo {
			lo = sec
		}
		if sec > hi {
			hi = sec
		}
	}
	if hi-lo < 60 {
		t.Fatalf("60 seeds only reached starts %.1f-%.1fs of a %.0fs song", lo, hi, instSongSeconds)
	}
}

func TestPracticeStartRangeSanitizes(t *testing.T) {
	secret := []byte("s")
	for _, c := range []struct{ filler, duration float64 }{
		{9, 120}, {0, 31}, {50, 40}, {math.NaN(), 120}, {-5, 120}, {9, math.Inf(1)}, {9, 1e300}, {1e300, 120},
	} {
		for secs := range practiceClipSeconds {
			ms := practiceStartMs(secret, "x", 1, 1, secs, c.filler, c.duration)
			if ms < 0 || ms > 3600*1000 {
				t.Fatalf("filler %v duration %v: start %dms", c.filler, c.duration, ms)
			}
		}
	}
}

func TestManifestSkipsAbsurdDurations(t *testing.T) {
	idx, err := newInstIndex(&instManifest{Server: "jp", Items: map[string]instItem{
		"ok":    {MusicID: 1, VocalID: 1, DurationSec: 120},
		"huge":  {MusicID: 2, VocalID: 2, DurationSec: 1e300},
		"hour":  {MusicID: 3, VocalID: 3, DurationSec: 3601},
		"zero":  {MusicID: 4, VocalID: 4, DurationSec: 0},
		"../x":  {MusicID: 5, VocalID: 5, DurationSec: 120},
		"a/b":   {MusicID: 6, VocalID: 6, DurationSec: 120},
		"a.mp3": {MusicID: 7, VocalID: 7, DurationSec: 120},
	}}, "jp")
	if err != nil {
		t.Fatal(err)
	}
	if len(idx.byVocal) != 1 || idx.byVocal[1].Asset != "ok" {
		t.Fatalf("index %+v", idx.byVocal)
	}
}

// Errors of the instrumental source never carry its location, not even
// into the server log.
func TestInstrumentalErrorsHideLocation(t *testing.T) {
	root := t.TempDir()
	dirSrc, err := NewInstrumentalSource(root)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.NotFoundHandler())
	host := strings.TrimPrefix(srv.URL, "http://")
	srv.Close() // unreachable from now on
	httpSrc, err := NewInstrumentalSource(srv.URL + "/private-instrumentals")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for name, src := range map[string]*InstrumentalSource{"dir": dirSrc, "http": httpSrc} {
		var errs []error
		errs = append(errs, src.Refresh(ctx))
		_, e := src.Fetch(ctx, "vocal_0001")
		errs = append(errs, e)
		_, e = src.FetchRange(ctx, "vocal_0001", 0, 100)
		errs = append(errs, e)
		for _, e := range errs {
			if e == nil {
				t.Fatalf("%s: expected an error", name)
			}
			for _, needle := range []string{root, host, "private-instrumentals", "vocal_0001", "manifest.json"} {
				if strings.Contains(e.Error(), needle) {
					t.Fatalf("%s error leaks %q: %v", name, needle, e)
				}
			}
		}
	}
}

// A question set that was already generated stays playable when its tier
// later turns unavailable, e.g. after a restart while the manifest cannot be
// read (the set is persisted in the store).
func TestPinnedHellSetSurvivesUnavailableManifest(t *testing.T) {
	h := newHarness(t, nil)
	id, r := h.create("hell", "practice", "")
	h.expect(r, 201, "")
	h.expect(h.do(http.MethodPost, roundPath(id, 0, "start"), "", ""), 200, "")

	// Restart: same store, the manifest is gone but the files are there.
	if err := os.Remove(filepath.Join(h.instRoot, "jp", "manifest.json")); err != nil {
		t.Fatal(err)
	}
	inst, err := NewInstrumentalSource(h.instRoot)
	if err != nil {
		t.Fatal(err)
	}
	svc, err := New(context.Background(), Options{
		Store: h.store, Catalog: h.svc.catalog, Audio: h.audio, Location: testLoc, Now: h.clock.Now,
		ClipCacheDir: t.TempDir(), Instrumentals: inst,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(svc.warmWG.Wait)
	restarted := &harness{t: t, svc: svc, clock: h.clock, store: h.store, audio: h.audio, instRoot: h.instRoot}
	if tierAvailability(t, restarted)["hell"] {
		t.Fatal("hell should be reported unavailable without a manifest")
	}
	_, r = restarted.create("hell", "practice", "")
	restarted.expect(r, 201, "")
	clip := restarted.do(http.MethodGet, roundPath(id, 0, "clip"), "", "")
	restarted.expect(clip, 200, "")
	if !clipCutFrom(t, clip.Body, instSong) {
		t.Fatal("pinned hell clip is not cut from the instrumental")
	}
	// A set that was never generated (the next day's) stays unavailable.
	h.clock.Advance(24 * time.Hour)
	r = restarted.do(http.MethodPost, base+"/sessions", `{"tier":"hell","mode":"practice"}`, "")
	restarted.expect(r, 409, "tier_unavailable")
}
