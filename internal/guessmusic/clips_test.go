package guessmusic

import (
	"bytes"
	"context"
	"encoding/binary"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type cbrOptions struct {
	info    bool // LAME-style Info frame with frame and byte counts
	id3     int  // ID3v2 tag body size (0: no tag)
	trailer bool // ID3v1 trailer
	kbps    int  // bitrate (default 128)
}

// synthCBR builds a realistic CBR stream (128 kbps by default): frames are
// padded like an encoder does (frame i starts at floor(i * 417.96) bytes at
// 128 kbps), the side info is zero (frames decode as silence) and the main
// data carries frameTag(i).
func synthCBR(frames int, opt cbrOptions) []byte {
	kbps := opt.kbps
	if kbps == 0 {
		kbps = 128
	}
	header := synthHeader
	for idx, rate := range bitratesV1L3 {
		if rate == kbps {
			header[2] = byte(idx)<<4 | synthHeader[2]&0x0F
		}
	}
	perFrame := 144 * kbps * 1000 // bytes * sample rate per frame
	baseLen := perFrame / 44100
	var buf bytes.Buffer
	if opt.id3 > 0 {
		body := make([]byte, opt.id3)
		copy(body, "TIT2\x00\x00\x00\x0d\x00\x00\x03secret title")
		size := len(body)
		buf.Write([]byte{'I', 'D', '3', 4, 0, 0,
			byte(size >> 21 & 0x7F), byte(size >> 14 & 0x7F), byte(size >> 7 & 0x7F), byte(size & 0x7F)})
		buf.Write(body)
	}
	audio := make([]byte, 0, frames*(baseLen+1))
	for i := 0; i < frames; i++ {
		length := (i+1)*perFrame/44100 - i*perFrame/44100
		f := make([]byte, length)
		copy(f, header[:])
		if length == baseLen+1 {
			f[2] |= 0x02 // padding
		}
		for j := 4 + 32; j < len(f); j++ {
			f[j] = frameTag(i)
		}
		audio = append(audio, f...)
	}
	if opt.info {
		info := make([]byte, baseLen)
		copy(info, header[:])
		copy(info[36:], "Info")
		binary.BigEndian.PutUint32(info[40:], xingFlagFrames|xingFlagBytes)
		binary.BigEndian.PutUint32(info[44:], uint32(frames))
		binary.BigEndian.PutUint32(info[48:], uint32(len(info)+len(audio)))
		buf.Write(info)
	}
	buf.Write(audio)
	if opt.trailer {
		trailer := make([]byte, 128)
		copy(trailer, "TAGsecret title")
		buf.Write(trailer)
	}
	return buf.Bytes()
}

// countingWriter counts the body bytes a handler writes.
type countingWriter struct {
	http.ResponseWriter
	n *int64
}

func (w countingWriter) Write(b []byte) (int, error) {
	n, err := w.ResponseWriter.Write(b)
	*w.n += int64(n)
	return n, err
}

type cdnStats struct {
	mu       sync.Mutex
	bytes    int64
	requests int
	ranged   int
}

// fakeCDN serves song at /music/long/<a>/<a>.mp3, honouring Range or not.
func fakeCDN(t *testing.T, song []byte, ranges bool) (*httptest.Server, *cdnStats) {
	stats := &cdnStats{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/music/long/") || !strings.HasSuffix(r.URL.Path, ".mp3") {
			http.NotFound(w, r)
			return
		}
		var n int64
		cw := countingWriter{ResponseWriter: w, n: &n}
		if ranges {
			http.ServeContent(cw, r, "song.mp3", time.Time{}, bytes.NewReader(song))
		} else {
			w.Header().Set("Content-Type", "audio/mpeg")
			_, _ = cw.Write(song)
		}
		stats.mu.Lock()
		stats.bytes += n
		stats.requests++
		if r.Header.Get("Range") != "" {
			stats.ranged++
		}
		stats.mu.Unlock()
	}))
	t.Cleanup(srv.Close)
	return srv, stats
}

func TestParseContentRange(t *testing.T) {
	if a, b, n, ok := parseContentRange("bytes 100-199/5000"); !ok || a != 100 || b != 199 || n != 5000 {
		t.Fatal("valid Content-Range rejected")
	}
	for _, bad := range []string{"", "bytes */5000", "bytes 10-5/50", "bytes 0-99/50", "items 0-1/2", "bytes 0-1"} {
		if _, _, _, ok := parseContentRange(bad); ok {
			t.Fatalf("%q accepted", bad)
		}
	}
}

func TestRangeFetchMatchesFullDownload(t *testing.T) {
	songs := map[string][]byte{
		"info+id3":     synthCBR(4600, cbrOptions{info: true, id3: 40, trailer: true}),
		"big-id3":      synthCBR(4600, cbrOptions{info: true, id3: 20 << 10}),
		"no-info":      synthCBR(4600, cbrOptions{}),
		"vbr-xing":     synthMP3(4600, true),  // Xing tag: must fall back
		"unpadded-cbr": synthMP3(4600, false), // offsets do not follow the formula
	}
	plans := []RoundPlan{
		{Asset: "vs_0001_01", ClipSeconds: 30, FillerSec: 9, StartFraction: 0},
		{Asset: "vs_0001_01", ClipSeconds: 15, FillerSec: 9, StartFraction: 0.37},
		{Asset: "vs_0001_01", ClipSeconds: 5, FillerSec: 9, StartFraction: 0.999},
		{Asset: "vs_0001_01", ClipSeconds: 5, FillerSec: 2, StartFraction: 0.5},
	}
	for name, song := range songs {
		rangeSrv, rangeStats := fakeCDN(t, song, true)
		fullSrv, fullStats := fakeCDN(t, song, false)
		for _, plan := range plans {
			want, err := cutClip(song, plan)
			if err != nil {
				t.Fatalf("%s: %v", name, err)
			}
			for _, srv := range []*httptest.Server{rangeSrv, fullSrv} {
				var st fetchStats
				stream, err := loadStream(context.Background(), NewHTTPAudioSource(srv.URL), plan, maxLeadFrames, &st)
				if err != nil {
					t.Fatalf("%s: load: %v", name, err)
				}
				got, err := buildClip(stream, plan)
				if err != nil {
					t.Fatalf("%s: build: %v", name, err)
				}
				// The range path counts frames from the Info tag or the
				// file size, which may differ from a full parse by a frame
				// (so the window may shift or grow by one frame).
				if diff := len(got.Data) - len(want.Data); !bytes.Equal(got.Data, want.Data) && (name != "no-info" || diff > synthFrameLen+1 || diff < -synthFrameLen-1) {
					t.Fatalf("%s %+v via %s (%s): clip differs from the full-file cut (start %v vs %v)",
						name, plan, srv.URL, st.mode, got.StartSeconds, want.StartSeconds)
				}
				if d := got.StartSeconds - want.StartSeconds; d > 0.03 || d < -0.03 {
					t.Fatalf("%s: start %v, want %v", name, got.StartSeconds, want.StartSeconds)
				}
				if got.ContentType != want.ContentType {
					t.Fatalf("%s: content type %s", name, got.ContentType)
				}
				expectRange := srv == rangeSrv && (name == "info+id3" || name == "big-id3" || name == "no-info")
				if expectRange != (st.mode == "range") {
					t.Fatalf("%s via %s: mode %q", name, srv.URL, st.mode)
				}
				if expectRange {
					// Head + clip range (+ ID3 skip), far less than the file.
					limit := int64(len(song)) / 4
					if plan.ClipSeconds == 30 {
						limit = int64(len(song)) / 3
					}
					if st.bytes > limit || st.requests > 3 {
						t.Fatalf("%s %ds: fetched %d of %d bytes in %d requests", name, plan.ClipSeconds, st.bytes, len(song), st.requests)
					}
				}
			}
		}
		// Close waits for the handlers, so the counters are final.
		rangeSrv.Close()
		fullSrv.Close()
		rangeStats.mu.Lock()
		fullStats.mu.Lock()
		if rangeStats.ranged == 0 || fullStats.requests == 0 {
			t.Fatalf("%s: servers unused", name)
		}
		if fullStats.bytes < int64(len(song)) {
			t.Fatalf("%s: no-range server sent %d bytes", name, fullStats.bytes)
		}
		fullStats.mu.Unlock()
		rangeStats.mu.Unlock()
	}
}

func TestClipManagerDiskCacheAndLRU(t *testing.T) {
	dir := t.TempDir()
	audio := &fakeAudio{}
	logs := &strings.Builder{}
	var logMu sync.Mutex
	logf := func(format string, args ...interface{}) {
		logMu.Lock()
		defer logMu.Unlock()
		logs.WriteString(format + "\n")
	}
	job := clipJob{Date: "2026-10-09", Tier: "normal", Mode: ModeRanked, Round: 3,
		Plan: RoundPlan{Asset: "vs_0001_01", ClipSeconds: 15, FillerSec: 9, StartFraction: 0.4}}

	m := newClipManager(audio, dir, 0, logf)
	if m.has(job) {
		t.Fatal("empty cache reports a clip")
	}
	clip, err := m.Get(context.Background(), job)
	if err != nil {
		t.Fatal(err)
	}
	if !m.has(job) {
		t.Fatal("clip not cached")
	}
	if _, err := os.Stat(filepath.Join(dir, "2026-10-09")); err != nil {
		t.Fatalf("no per-date directory: %v", err)
	}
	if audio.fetches != 0 || audio.ranges < 2 || audio.bytesOut > int64(len(fakeSong))/4 {
		t.Fatalf("fetches %d ranges %d bytes %d", audio.fetches, audio.ranges, audio.bytesOut)
	}
	if m.fetchedBytes.Load() != audio.bytesOut {
		t.Fatalf("fetched counter %d, want %d", m.fetchedBytes.Load(), audio.bytesOut)
	}

	// A fresh manager (another instance or a restart) reads the disk copy.
	ranges := audio.ranges
	m2 := newClipManager(audio, dir, 0, logf)
	again, err := m2.Get(context.Background(), job)
	if err != nil {
		t.Fatal(err)
	}
	if audio.ranges != ranges || !bytes.Equal(again.Data, clip.Data) || again.StartSeconds != clip.StartSeconds || again.ContentType != clip.ContentType {
		t.Fatal("disk cache was not used")
	}
	if p := m2.peek(job); p == nil || !bytes.Equal(p.Data, clip.Data) {
		t.Fatal("peek failed")
	}
	// Corrupt files are dropped and rebuilt.
	if err := os.WriteFile(m.diskPath(job), []byte{0, 0}, 0o644); err != nil {
		t.Fatal(err)
	}
	m3 := newClipManager(audio, dir, 0, logf)
	if c, err := m3.Get(context.Background(), job); err != nil || !bytes.Equal(c.Data, clip.Data) {
		t.Fatalf("rebuild after corruption: %v", err)
	}

	// Without a directory, only memory is used.
	m4 := newClipManager(audio, "", 0, logf)
	if _, err := m4.Get(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	other := job
	other.Round = 4
	if m4.has(other) {
		t.Fatal("unexpected cached clip")
	}

	// The memory LRU stays under its cap, evicting the oldest clips.
	small := newClipManager(audio, "", 2500, logf)
	for i := 0; i < 5; i++ {
		small.memPut(string(rune('a'+i)), &Clip{Data: make([]byte, 1000), ContentType: "audio/mpeg"})
	}
	if small.memBytes > 2500 || len(small.items) != 2 || small.items["e"] == nil || small.items["d"] == nil {
		t.Fatalf("lru holds %d bytes, %d items", small.memBytes, len(small.items))
	}
	small.memPut("huge", &Clip{Data: make([]byte, 5000)})
	if small.items["huge"] != nil {
		t.Fatal("a clip larger than the cap must not be cached")
	}
}

func TestPruneDisk(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"2026-10-05", "2026-10-06", "2026-10-07", "2026-10-09", "2026-10-10", "notes", "2026-13-01x"} {
		if err := os.MkdirAll(filepath.Join(dir, name), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "2026-10-01"), []byte("file, not dir"), 0o644); err != nil {
		t.Fatal(err)
	}
	m := newClipManager(&fakeAudio{}, dir, 0, func(string, ...interface{}) {})
	m.pruneDisk("2026-10-07")
	entries, _ := os.ReadDir(dir)
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	if got := strings.Join(names, ","); got != "2026-10-01,2026-10-07,2026-10-09,2026-10-10,2026-13-01x,notes" {
		t.Fatalf("after prune: %s", got)
	}
}

func TestPrewarmBuildsRankedSetsAndPrunes(t *testing.T) {
	h := newHarness(t, nil)
	dir := h.svc.clips.dir
	old := filepath.Join(dir, "2026-10-01")
	if err := os.MkdirAll(old, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := h.svc.prewarm(nil); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatal("old clip directory was not pruned")
	}
	for _, tier := range Tiers {
		plan := h.planOf(tier.ID, ModeRanked)
		for i := range plan.Rounds {
			if !h.svc.clips.has(h.svc.clipJob(plan, i)) {
				t.Fatalf("%s round %d not warmed", tier.ID, i)
			}
		}
		practice := h.planOf(tier.ID, ModePractice)
		if h.svc.clips.has(h.svc.clipJob(practice, 0)) {
			t.Fatalf("%s practice set warmed eagerly", tier.ID)
		}
	}
	ranges := h.audio.ranges
	if err := h.svc.prewarm(nil); err != nil || h.audio.ranges != ranges {
		t.Fatalf("second prewarm refetched (%v)", err)
	}
	// Plans are the only game data in the store: no clip bytes.
	for _, tier := range Tiers {
		if _, err := h.store.Get(context.Background(), planKey("2026-10-09", tier.ID, ModeRanked)); err != nil {
			t.Fatalf("plan of %s not stored: %v", tier.ID, err)
		}
	}
	h.store.mu.Lock()
	for key, v := range h.store.values {
		if strings.HasPrefix(key, "gm:clip") || len(v.data) > 64<<10 {
			t.Errorf("store holds %s (%d bytes)", key, len(v.data))
		}
	}
	h.store.mu.Unlock()
}

func TestPracticeSetWarmsOnFirstUse(t *testing.T) {
	h := newHarness(t, nil)
	_, r := h.create("normal", "practice", "")
	h.expect(r, 201, "")
	deadline := time.Now().Add(10 * time.Second)
	for {
		warmed := 0
		for i := range h.plan.Rounds {
			if h.svc.clips.has(h.svc.clipJob(h.plan, i)) {
				warmed++
			}
		}
		if warmed == RoundsPerDay {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("only %d practice clips warmed", warmed)
		}
		time.Sleep(10 * time.Millisecond)
	}
	ranges := h.audio.ranges
	_, r = h.create("normal", "practice", "")
	h.expect(r, 201, "")
	time.Sleep(50 * time.Millisecond)
	if h.audio.ranges != ranges {
		t.Fatal("a second practice session refetched its clips")
	}
}

// Failing clips are remembered for a backoff, but the memory of failures
// stays bounded however many different clips fail.
func TestClipFailuresBounded(t *testing.T) {
	clock := &fakeClock{now: time.Unix(1_800_000_000, 0)}
	m := newClipManager(&fakeAudio{}, "", 0, func(string, ...interface{}) {})
	m.now = clock.Now
	plan := RoundPlan{Asset: "missing", ClipSeconds: 5, VocalRemoval: true} // no instrumentals: fails
	for i := 0; i < 3*maxClipFailures; i++ {
		job := clipJob{Date: "2026-10-09", Tier: "free", Mode: "inst", Plan: plan}
		job.Plan.fixedStart, job.Plan.hasFixedStart = float64(i), true
		if _, err := m.Get(context.Background(), job); err == nil {
			t.Fatal("expected a failure")
		}
		if i%100 == 0 {
			clock.Advance(time.Second)
		}
	}
	m.mu.Lock()
	n := len(m.failures)
	m.mu.Unlock()
	if n > maxClipFailures {
		t.Fatalf("%d failures remembered", n)
	}
	// The backoff still applies to a recent failure.
	job := clipJob{Date: "2026-10-09", Tier: "free", Mode: "inst", Plan: plan}
	job.Plan.fixedStart, job.Plan.hasFixedStart = float64(3*maxClipFailures-1), true
	m.mu.Lock()
	_, remembered := m.failures[job.key()]
	m.mu.Unlock()
	if !remembered {
		t.Fatal("the latest failure was forgotten")
	}
}
