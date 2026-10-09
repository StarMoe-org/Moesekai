package guessmusic

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"snowy_viewer/internal/starmoe"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	c.mu.Unlock()
}

// fakeAudio serves the same synthetic ~120 s CBR mp3 for every vocal, with
// byte-range support.
type fakeAudio struct {
	mu       sync.Mutex
	fetches  int
	ranges   int
	bytesOut int64
}

var fakeSong = synthCBR(4600, cbrOptions{info: true, id3: 40})

func (a *fakeAudio) Fetch(_ context.Context, asset string) ([]byte, error) {
	a.mu.Lock()
	a.fetches++
	a.bytesOut += int64(len(fakeSong))
	a.mu.Unlock()
	return fakeSong, nil
}

func (a *fakeAudio) FetchRange(_ context.Context, asset string, offset, length int64) (*RangeData, error) {
	end := offset + length
	if end > int64(len(fakeSong)) {
		end = int64(len(fakeSong))
	}
	a.mu.Lock()
	a.ranges++
	a.bytesOut += end - offset
	a.mu.Unlock()
	return &RangeData{Data: fakeSong[offset:end], Offset: offset, Total: int64(len(fakeSong))}, nil
}

func (a *fakeAudio) Exists(context.Context, string) (bool, error) { return true, nil }

// fakeAuth accepts "user-<sub>" tokens.
type fakeAuth struct{}

func (fakeAuth) Enabled() bool { return true }

func (fakeAuth) Verify(_ context.Context, token string) (*starmoe.Claims, error) {
	if token == "keys-down" {
		return nil, starmoe.ErrKeysUnavailable
	}
	if !strings.HasPrefix(token, "user-") {
		return nil, starmoe.ErrInvalidToken
	}
	sub := strings.TrimPrefix(token, "user-")
	return &starmoe.Claims{Subject: sub, Name: "Player " + sub, Picture: "https://img.example/" + sub + ".png"}, nil
}

type fakeLinker struct{}

func (fakeLinker) Resolve(_ context.Context, token, server, userID string) (GameAccount, error) {
	switch token {
	case "good":
		return GameAccount{Server: "jp", UserID: "123456789", Name: "Mizuki"}, nil
	case "nobind":
		return GameAccount{}, ErrNoGameBinding
	}
	return GameAccount{}, ErrGameTokenInvalid
}

type harness struct {
	t     *testing.T
	svc   *Service
	clock *fakeClock
	store *MemoryStore
	audio *fakeAudio
	// instRoot holds the instrumentals (<root>/jp/...), "" without them.
	instRoot string
	// plan is the set of the session being played (set by create).
	plan *DailyPlan
}

// newHarness builds a service whose instrumental directory lists every
// sung vocal of the test catalog.
func newHarness(t *testing.T, auth Authenticator) *harness {
	t.Helper()
	return newHarnessWith(t, auth, true, nil)
}

// newHarnessWith optionally writes the instrumental directory; tweak may
// adjust the options (root is the instrumental root, or "").
func newHarnessWith(t *testing.T, auth Authenticator, withInst bool, tweak func(o *Options, root string)) *harness {
	t.Helper()
	clock := &fakeClock{now: time.Date(2026, 10, 9, 12, 0, 0, 0, testLoc)}
	store := NewMemoryStore()
	t.Cleanup(func() { store.Close() })
	audio := &fakeAudio{}
	catalog := testCatalog(clock.Now())
	root := ""
	var inst *InstrumentalSource
	if withInst {
		root = t.TempDir()
		writeInstDir(t, root, testManifest(catalog, nil))
		var err error
		if inst, err = NewInstrumentalSource(root); err != nil {
			t.Fatal(err)
		}
	}
	opts := Options{
		Store:         store,
		Catalog:       catalog,
		Audio:         audio,
		Auth:          auth,
		Games:         fakeLinker{},
		Location:      testLoc,
		Now:           clock.Now,
		CheckAudio:    true,
		ClipCacheDir:  t.TempDir(),
		Instrumentals: inst,
	}
	if tweak != nil {
		tweak(&opts, root)
	}
	svc, err := New(context.Background(), opts)
	if err != nil {
		t.Fatal(err)
	}
	// Runs before the clip directory is removed.
	t.Cleanup(svc.warmWG.Wait)
	return &harness{t: t, svc: svc, clock: clock, store: store, audio: audio, instRoot: root}
}

func (h *harness) planOf(tier, mode string) *DailyPlan {
	h.t.Helper()
	plan, err := h.svc.planFor(context.Background(), dayFor(h.clock.Now(), testLoc).Date, tier, mode)
	if err != nil {
		h.t.Fatal(err)
	}
	return plan
}

type result struct {
	Code   int
	Header http.Header
	Body   []byte
}

func (r result) json(t *testing.T) map[string]interface{} {
	t.Helper()
	var out map[string]interface{}
	if err := json.Unmarshal(r.Body, &out); err != nil {
		t.Fatalf("bad JSON %q: %v", r.Body, err)
	}
	return out
}

func (h *harness) do(method, path, body, token string, headers ...string) result {
	h.t.Helper()
	var req *http.Request
	if body != "" {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	req.RemoteAddr = "198.51.100.7:4567"
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	h.svc.ServeHTTP(rec, req)
	return result{Code: rec.Code, Header: rec.Header(), Body: rec.Body.Bytes()}
}

func (h *harness) expect(r result, code int, errCode string) {
	h.t.Helper()
	if r.Code != code {
		h.t.Fatalf("status %d, want %d: %s", r.Code, code, r.Body)
	}
	if errCode != "" {
		if got := r.json(h.t)["error"]; got != errCode {
			h.t.Fatalf("error %v, want %s: %s", got, errCode, r.Body)
		}
	}
}

// assertNoLeak fails if a pre-final response mentions any answer of any
// set of the day.
func (h *harness) assertNoLeak(r result) {
	h.t.Helper()
	body := string(r.Body)
	for _, key := range []string{`"musicId"`, `"vocalId"`, `"musicTitle"`, `"vocalCaption"`, `"answer"`, `"asset"`} {
		if strings.Contains(body, key) {
			h.t.Fatalf("pre-final response leaks %s: %s", key, body)
		}
	}
	for _, tier := range Tiers {
		for _, mode := range []string{ModeRanked, ModePractice} {
			plan, err := h.svc.planFor(context.Background(), dayFor(h.clock.Now(), testLoc).Date, tier.ID, mode)
			if errors.Is(err, errInstUnavailable) {
				continue // hell without instrumentals
			}
			if err != nil {
				h.t.Fatal(err)
			}
			for _, round := range plan.Rounds {
				if strings.Contains(body, round.MusicTitle) || strings.Contains(body, round.Asset) {
					h.t.Fatalf("pre-final response leaks %s/%s: %s", round.MusicTitle, round.Asset, body)
				}
			}
		}
	}
}

const base = "/api/guess-music/daily"

func roundPath(id string, n int, action string) string {
	return fmt.Sprintf("%s/sessions/%s/rounds/%d/%s", base, id, n, action)
}

func (h *harness) create(tier, mode, token string) (string, result) {
	h.t.Helper()
	r := h.do(http.MethodPost, base+"/sessions", fmt.Sprintf(`{"tier":%q,"mode":%q}`, tier, mode), token)
	if r.Code != http.StatusCreated && r.Code != http.StatusOK {
		return "", r
	}
	h.assertNoLeak(r)
	h.plan = h.planOf(tier, mode)
	id, _ := r.json(h.t)["sessionId"].(string)
	return id, r
}

// playCorrect starts round n, fetches its clip and answers correctly after wait.
func (h *harness) playCorrect(id string, n int, wait time.Duration) map[string]interface{} {
	h.t.Helper()
	h.expect(h.do(http.MethodPost, roundPath(id, n, "start"), "", ""), 200, "")
	h.expect(h.do(http.MethodGet, roundPath(id, n, "clip"), "", ""), 200, "")
	h.clock.Advance(wait)
	r := h.do(http.MethodPost, roundPath(id, n, "answer"), fmt.Sprintf(`{"musicId":%d}`, h.plan.Rounds[n].MusicID), "")
	h.expect(r, 200, "")
	return r.json(h.t)
}

func (h *harness) wrongID(n int) int {
	for id := 1; id <= 40; id++ {
		if id != h.plan.Rounds[n].MusicID {
			return id
		}
	}
	return 0
}

func TestDailyInfo(t *testing.T) {
	h := newHarness(t, nil)
	for _, path := range []string{base, base + "/"} {
		r := h.do(http.MethodGet, path, "", "")
		h.expect(r, 200, "")
		var info DailyInfo
		if err := json.Unmarshal(r.Body, &info); err != nil {
			t.Fatal(err)
		}
		if info.Date != "2026-10-09" || info.Timezone != "Asia/Shanghai" || info.NextResetAt != "2026-10-10T00:00:00+08:00" ||
			info.Server != "jp" || info.AuthEnabled || !info.Ready || info.Me != nil {
			t.Fatalf("unexpected info %s", r.Body)
		}
		got := fmt.Sprint(info.Tiers)
		want := "[{easy 20 30 45 choice 6 false true} {normal 20 15 45 suggest 0 false true} {hard 20 5 45 type 0 false true} {hell 20 5 45 type 0 true true}]"
		if got != want {
			t.Fatalf("tiers %s", got)
		}
		if strings.Contains(string(r.Body), `"optionCount":0`) || strings.Contains(string(r.Body), `"me"`) {
			t.Fatalf("unexpected fields %s", r.Body)
		}
	}
	h.expect(h.do(http.MethodPost, base, "", ""), 405, "method_not_allowed")
	h.expect(h.do(http.MethodGet, "/api/guess-music/nope", "", ""), 404, "not_found")
}

func TestCreateSessionValidation(t *testing.T) {
	h := newHarness(t, nil)
	h.expect(h.do(http.MethodPost, base+"/sessions", "", ""), 400, "invalid_body")
	h.expect(h.do(http.MethodPost, base+"/sessions", `{"tier":"insane","mode":"practice"}`, ""), 400, "invalid_tier")
	h.expect(h.do(http.MethodPost, base+"/sessions", `{"tier":"easy"}`, ""), 400, "invalid_mode")
	h.expect(h.do(http.MethodPost, base+"/sessions", `{"tier":"easy","mode":"casual"}`, ""), 400, "invalid_mode")
}

func TestFullPracticeFlow(t *testing.T) {
	h := newHarness(t, nil)
	id, r := h.create("easy", "practice", "")
	h.expect(r, 201, "")
	s := r.json(t)
	if s["ranked"] != false || s["resumeRound"].(float64) != 0 || s["rounds"].(float64) != 20 || s["date"] != "2026-10-09" ||
		s["tier"] != "easy" || s["mode"] != "practice" {
		t.Fatalf("unexpected session %s", r.Body)
	}
	if _, ok := s["player"]; ok {
		t.Fatal("practice session has a player")
	}
	ranked := h.planOf("easy", ModeRanked)
	if reflect.DeepEqual(ranked.Rounds, h.plan.Rounds) {
		t.Fatal("practice must use its own set")
	}

	// Rounds are strictly in order and the clip needs a started round.
	h.expect(h.do(http.MethodPost, roundPath(id, 1, "start"), "", ""), 409, "round_out_of_order")
	h.expect(h.do(http.MethodGet, roundPath(id, 0, "clip"), "", ""), 409, "round_not_started")
	h.expect(h.do(http.MethodPost, roundPath(id, 0, "answer"), `{"musicId":1}`, ""), 409, "round_not_started")
	h.expect(h.do(http.MethodPost, roundPath(id, 20, "start"), "", ""), 400, "invalid_round")

	start := h.do(http.MethodPost, roundPath(id, 0, "start"), "", "")
	h.expect(start, 200, "")
	h.assertNoLeak(start)
	var st StartResponse
	if err := json.Unmarshal(start.Body, &st); err != nil {
		t.Fatal(err)
	}
	if st.Round != 0 || st.ClipSeconds != 30 || st.TimeLimitSeconds != 45 || st.ClipURL != roundPath(id, 0, "clip") {
		t.Fatalf("unexpected start %s", start.Body)
	}
	if !reflect.DeepEqual(st.Options, h.plan.Rounds[0].Options) || len(st.Options) != 6 {
		t.Fatalf("options %v, want %v", st.Options, h.plan.Rounds[0].Options)
	}
	again := h.do(http.MethodPost, roundPath(id, 0, "start"), "", "")
	if string(again.Body) != string(start.Body) {
		t.Fatal("repeating start should return the same response")
	}

	// Answering before the clip was served is rejected.
	h.expect(h.do(http.MethodPost, roundPath(id, 0, "answer"), `{"musicId":1}`, ""), 409, "clip_not_served")

	clip := h.do(http.MethodGet, roundPath(id, 0, "clip"), "", "")
	h.expect(clip, 200, "")
	if clip.Header.Get("Content-Type") != "audio/mpeg" || clip.Header.Get("Cache-Control") != "private, no-store" ||
		clip.Header.Get("Content-Length") != strconv.Itoa(len(clip.Body)) {
		t.Fatalf("bad clip headers %v", clip.Header)
	}
	parsed, err := parseMP3(clip.Body)
	if err != nil {
		t.Fatal(err)
	}
	if d := parsed.Duration(); d < 30 || d > 31 {
		t.Fatalf("clip duration %v", d)
	}
	if strings.Contains(string(clip.Body), "secret title") || strings.Contains(string(clip.Body), "ID3") {
		t.Fatal("clip leaks tags")
	}
	h.expect(h.do(http.MethodGet, roundPath(id, 0, "clip"), "", "", "Range", "bytes=0-99"), 206, "")

	// Wrong guess: strike, not final, nothing revealed.
	h.clock.Advance(4 * time.Second)
	wrong := h.do(http.MethodPost, roundPath(id, 0, "answer"), fmt.Sprintf(`{"musicId":%d}`, h.wrongID(0)), "")
	h.expect(wrong, 200, "")
	h.assertNoLeak(wrong)
	w := wrong.json(t)
	if w["correct"] != false || w["final"] != false || w["strikesLeft"].(float64) != 2 || w["points"].(float64) != 0 {
		t.Fatalf("unexpected wrong answer %s", wrong.Body)
	}
	// Re-fetching the clip does not reset the timer.
	h.clock.Advance(5 * time.Second)
	h.expect(h.do(http.MethodGet, roundPath(id, 0, "clip"), "", ""), 200, "")
	right := h.do(http.MethodPost, roundPath(id, 0, "answer"), fmt.Sprintf(`{"musicId":%d}`, h.plan.Rounds[0].MusicID), "")
	h.expect(right, 200, "")
	a := right.json(t)
	// elapsed 9s -> timeFactor 0.8, one wrong -> 0.5, combo 0.
	if a["correct"] != true || a["final"] != true || a["points"].(float64) != 400 || a["combo"].(float64) != 0 || a["totalScore"].(float64) != 400 {
		t.Fatalf("unexpected correct answer %s", right.Body)
	}
	ans := a["answer"].(map[string]interface{})
	if int(ans["musicId"].(float64)) != h.plan.Rounds[0].MusicID || ans["musicTitle"] != h.plan.Rounds[0].MusicTitle ||
		int(ans["vocalId"].(float64)) != h.plan.Rounds[0].VocalID || ans["clipSeconds"].(float64) != 30 ||
		ans["vocalType"] != h.plan.Rounds[0].VocalType || ans["startSeconds"].(float64) < 9 {
		t.Fatalf("bad reveal %v", ans)
	}
	if strings.Contains(string(right.Body), h.plan.Rounds[0].Asset) {
		t.Fatal("asset name must never be sent")
	}
	h.expect(h.do(http.MethodPost, roundPath(id, 0, "answer"), `{"musicId":1}`, ""), 409, "round_final")
	h.expect(h.do(http.MethodPost, roundPath(id, 0, "start"), "", ""), 409, "round_final")

	// Rounds 1 and 2: first-try corrects build a combo.
	if r := h.playCorrect(id, 1, 0); r["combo"].(float64) != 1 || r["points"].(float64) != 1000 {
		t.Fatalf("round 1 %v", r)
	}
	if r := h.playCorrect(id, 2, 0); r["combo"].(float64) != 2 || r["points"].(float64) != 1250 {
		t.Fatalf("round 2 %v", r)
	}
	// The previous clip is no longer available once the next round starts.
	h.expect(h.do(http.MethodPost, roundPath(id, 3, "start"), "", ""), 200, "")
	h.expect(h.do(http.MethodGet, roundPath(id, 2, "clip"), "", ""), 409, "round_not_current")
	h.expect(h.do(http.MethodPost, roundPath(id, 4, "start"), "", ""), 409, "round_out_of_order")

	// Round 3 times out: served, then more than 45+2 s pass.
	h.expect(h.do(http.MethodGet, roundPath(id, 3, "clip"), "", ""), 200, "")
	h.clock.Advance(48 * time.Second)
	late := h.do(http.MethodPost, roundPath(id, 3, "answer"), fmt.Sprintf(`{"musicId":%d}`, h.plan.Rounds[3].MusicID), "")
	h.expect(late, 200, "")
	l := late.json(t)
	if l["correct"] != false || l["final"] != true || l["points"].(float64) != 0 || l["combo"].(float64) != 0 || l["answer"] == nil {
		t.Fatalf("timed out answer %s", late.Body)
	}

	// Round 4: three strikes.
	h.expect(h.do(http.MethodPost, roundPath(id, 4, "start"), "", ""), 200, "")
	h.expect(h.do(http.MethodGet, roundPath(id, 4, "clip"), "", ""), 200, "")
	for i := 0; i < 3; i++ {
		r := h.do(http.MethodPost, roundPath(id, 4, "answer"), fmt.Sprintf(`{"musicId":%d}`, h.wrongID(4)), "")
		h.expect(r, 200, "")
		final := r.json(t)["final"] == true
		if final != (i == 2) {
			t.Fatalf("strike %d final=%v", i, final)
		}
		if i < 2 {
			h.assertNoLeak(r)
		}
	}
	// Round 5: give up before the clip was even served.
	h.expect(h.do(http.MethodPost, roundPath(id, 5, "start"), "", ""), 200, "")
	gu := h.do(http.MethodPost, roundPath(id, 5, "answer"), `{"musicId":null}`, "")
	h.expect(gu, 200, "")
	if g := gu.json(t); g["final"] != true || g["correct"] != false || g["answer"] == nil {
		t.Fatalf("give up %s", gu.Body)
	}
	// Bad bodies.
	h.expect(h.do(http.MethodPost, roundPath(id, 6, "start"), "", ""), 200, "")
	h.expect(h.do(http.MethodPost, roundPath(id, 6, "answer"), `{}`, ""), 400, "invalid_body")
	h.expect(h.do(http.MethodPost, roundPath(id, 6, "answer"), `{"musicId":"x"}`, ""), 400, "invalid_body")
	h.expect(h.do(http.MethodPost, roundPath(id, 6, "answer"), `{"musicId":`+strings.Repeat("1", 5000)+`}`, ""), 413, "body_too_large")

	// Finish: unfinished rounds become give-ups, everything is revealed.
	fin := h.do(http.MethodPost, base+"/sessions/"+id+"/finish", "", "")
	h.expect(fin, 200, "")
	var res FinishResponse
	if err := json.Unmarshal(fin.Body, &res); err != nil {
		t.Fatal(err)
	}
	if res.TotalScore != 2650 || res.CorrectCount != 3 || res.Ranked || res.Rank != nil || len(res.Rounds) != 20 ||
		res.Tier != "easy" || res.Mode != "practice" || res.Date != "2026-10-09" {
		t.Fatalf("unexpected finish %s", fin.Body)
	}
	if res.DurationMs != 9000+0+0+45000 {
		t.Fatalf("duration %d", res.DurationMs)
	}
	for i, rr := range res.Rounds {
		if rr.Answer == nil || rr.Answer.MusicID != h.plan.Rounds[i].MusicID || rr.Answer.StartSeconds < 9 || rr.Round != i {
			t.Fatalf("round %d reveal %+v", i, rr.Answer)
		}
	}
	if res.Rounds[0].Attempts != 2 || res.Rounds[4].Attempts != 3 {
		t.Fatalf("attempts %d %d", res.Rounds[0].Attempts, res.Rounds[4].Attempts)
	}
	again = h.do(http.MethodPost, base+"/sessions/"+id+"/finish", "", "")
	if string(again.Body) != string(fin.Body) {
		t.Fatal("finish should be idempotent")
	}
	h.expect(h.do(http.MethodPost, roundPath(id, 7, "start"), "", ""), 409, "session_finished")

	// Practice never reaches the leaderboard.
	lb := h.do(http.MethodGet, base+"/leaderboard?tier=easy", "", "")
	h.expect(lb, 200, "")
	if lb.json(t)["totalPlayers"].(float64) != 0 || lb.json(t)["tier"] != "easy" {
		t.Fatalf("practice session was ranked: %s", lb.Body)
	}
	// Clips were cut from byte ranges, never from whole downloads.
	if h.audio.fetches != 0 {
		t.Fatalf("audio fully downloaded %d times", h.audio.fetches)
	}
	h.expect(h.do(http.MethodPost, base+"/sessions/0123456789abcdef0123456789abcdef/finish", "", ""), 404, "session_not_found")
	h.expect(h.do(http.MethodPost, base+"/sessions/nothex/finish", "", ""), 404, "session_not_found")
}

func TestStartClosesTimedOutRound(t *testing.T) {
	h := newHarness(t, nil)
	id, _ := h.create("hard", "practice", "")
	h.expect(h.do(http.MethodPost, roundPath(id, 0, "start"), "", ""), 200, "")
	h.expect(h.do(http.MethodGet, roundPath(id, 0, "clip"), "", ""), 200, "")
	h.expect(h.do(http.MethodPost, roundPath(id, 1, "start"), "", ""), 409, "round_out_of_order")
	h.clock.Advance(47*time.Second + time.Millisecond)
	h.expect(h.do(http.MethodPost, roundPath(id, 1, "start"), "", ""), 200, "")
}

func TestTierClips(t *testing.T) {
	h := newHarness(t, nil)
	for _, tier := range Tiers {
		id, r := h.create(tier.ID, "practice", "")
		h.expect(r, 201, "")
		start := h.do(http.MethodPost, roundPath(id, 0, "start"), "", "")
		h.expect(start, 200, "")
		h.assertNoLeak(start)
		if got := start.json(t)["clipSeconds"].(float64); int(got) != tier.ClipSeconds {
			t.Fatalf("%s clipSeconds %v", tier.ID, got)
		}
		if _, has := start.json(t)["options"]; has != (tier.OptionCount > 0) {
			t.Fatalf("%s options presence %s", tier.ID, start.Body)
		}
		clip := h.do(http.MethodGet, roundPath(id, 0, "clip"), "", "")
		h.expect(clip, 200, "")
		if clip.Header.Get("Content-Type") != "audio/mpeg" {
			t.Fatalf("%s content type %s", tier.ID, clip.Header.Get("Content-Type"))
		}
		parsed, err := parseMP3(clip.Body)
		if err != nil {
			t.Fatal(err)
		}
		if d := parsed.Duration(); d < float64(tier.ClipSeconds) || d > float64(tier.ClipSeconds)+1 {
			t.Fatalf("%s clip duration %v", tier.ID, d)
		}
		// Hell is cut from the instrumental, the others from the original.
		if fromInst := clipCutFrom(t, clip.Body, instSong); fromInst != tier.VocalRemoval || clipCutFrom(t, clip.Body, fakeSong) == tier.VocalRemoval {
			t.Fatalf("%s clip source: from instrumental %v", tier.ID, fromInst)
		}
		if clip.Header.Get("Content-Length") != strconv.Itoa(len(clip.Body)) || clip.Header.Get("Cache-Control") != "private, no-store" {
			t.Fatalf("%s clip headers %v", tier.ID, clip.Header)
		}
		// HEAD does not start the timer.
		h.expect(h.do(http.MethodHead, roundPath(id, 0, "clip"), "", ""), 200, "")
		gu := h.do(http.MethodPost, roundPath(id, 0, "answer"), `{"musicId":null}`, "")
		h.expect(gu, 200, "")
		if a := gu.json(t)["answer"].(map[string]interface{}); a["clipSeconds"].(float64) != float64(tier.ClipSeconds) {
			t.Fatalf("%s reveal %s", tier.ID, gu.Body)
		}
	}
}

func TestRankedRequiresLogin(t *testing.T) {
	h := newHarness(t, fakeAuth{})
	if h.do(http.MethodGet, base, "", "").json(t)["authEnabled"] != true {
		t.Fatal("auth should be enabled")
	}
	h.expect(h.do(http.MethodPost, base+"/sessions", `{"tier":"easy","mode":"ranked"}`, ""), 401, "login_required")
	h.expect(h.do(http.MethodPost, base+"/sessions", `{"tier":"easy","mode":"ranked"}`, "garbage"), 401, "invalid_token")
	h.expect(h.do(http.MethodPost, base+"/sessions", `{"tier":"easy","mode":"ranked"}`, "keys-down"), 503, "auth_unavailable")
	// Practice works for anyone, with or without a (even broken) token.
	_, r := h.create("easy", "practice", "")
	h.expect(r, 201, "")
	_, r = h.create("easy", "practice", "garbage")
	h.expect(r, 201, "")
	if r.json(t)["ranked"] != false {
		t.Fatal("practice must never be ranked")
	}
	// An invalid token only hides "me".
	info := h.do(http.MethodGet, base, "", "garbage")
	h.expect(info, 200, "")
	if strings.Contains(string(info.Body), `"me"`) {
		t.Fatalf("me with an invalid token: %s", info.Body)
	}
}

func TestRankedUnavailableWithoutAuth(t *testing.T) {
	h := newHarness(t, nil)
	h.expect(h.do(http.MethodPost, base+"/sessions", `{"tier":"hard","mode":"ranked"}`, ""), 409, "ranked_unavailable")
	h.expect(h.do(http.MethodPost, base+"/sessions", `{"tier":"hard","mode":"ranked"}`, "user-alice"), 409, "ranked_unavailable")
	_, r := h.create("hard", "practice", "whatever")
	h.expect(r, 201, "")
	h.expect(h.do(http.MethodGet, "/api/guess-music/me", "", "whatever"), 401, "auth_disabled")
	if strings.Contains(string(h.do(http.MethodGet, base, "", "user-alice").Body), `"me"`) {
		t.Fatal("me must be absent without auth")
	}
}

func TestRankedOncePerTierAndResume(t *testing.T) {
	h := newHarness(t, fakeAuth{})
	me := func(token string) map[string]interface{} {
		t.Helper()
		r := h.do(http.MethodGet, base, "", token)
		h.expect(r, 200, "")
		m, ok := r.json(t)["me"].(map[string]interface{})
		if !ok {
			t.Fatalf("no me in %s", r.Body)
		}
		return m["tiers"].(map[string]interface{})
	}
	if tiers := me("user-alice"); len(tiers) != 0 {
		t.Fatalf("fresh player has tiers %v", tiers)
	}

	id, r := h.create("easy", "ranked", "user-alice")
	h.expect(r, 201, "")
	s := r.json(t)
	player, _ := s["player"].(map[string]interface{})
	if s["ranked"] != true || s["mode"] != "ranked" || s["tier"] != "easy" || player["name"] != "Player alice" || player["avatar"] != "https://img.example/alice.png" {
		t.Fatalf("unexpected ranked session %s", r.Body)
	}
	// Resume returns the same session.
	id2, r2 := h.create("easy", "ranked", "user-alice")
	h.expect(r2, 200, "")
	if id2 != id || r2.json(t)["resumeRound"].(float64) != 0 {
		t.Fatalf("resume returned %s", r2.Body)
	}
	h.playCorrect(id, 0, 0)
	h.expect(h.do(http.MethodPost, roundPath(id, 1, "start"), "", ""), 200, "")
	_, r3 := h.create("easy", "ranked", "user-alice")
	if r3.json(t)["resumeRound"].(float64) != 1 || r3.json(t)["sessionId"] != id {
		t.Fatalf("resume after round 0 %s", r3.Body)
	}
	if st := me("user-alice")["easy"].(map[string]interface{}); st["status"] != "in_progress" || st["resumeRound"].(float64) != 1 {
		t.Fatalf("me in progress %v", st)
	}

	// Link a game account so it shows on the leaderboard.
	h.expect(h.do(http.MethodPost, "/api/guess-music/me/game-link", `{"harukiAccessToken":"good"}`, "user-alice"), 200, "")

	fin := h.do(http.MethodPost, base+"/sessions/"+id+"/finish", "", "")
	h.expect(fin, 200, "")
	var res FinishResponse
	_ = json.Unmarshal(fin.Body, &res)
	if !res.Ranked || res.Rank == nil || *res.Rank != 1 || res.TotalPlayers == nil || *res.TotalPlayers != 1 || res.TotalScore != 1000 ||
		res.Tier != "easy" || res.Mode != "ranked" {
		t.Fatalf("unexpected ranked finish %s", fin.Body)
	}
	if st := me("user-alice")["easy"].(map[string]interface{}); st["status"] != "finished" || st["score"].(float64) != 1000 || st["rank"].(float64) != 1 {
		t.Fatalf("me finished %v", st)
	}

	// Second attempt at the same tier the same day: 409 with the stored result.
	again := h.do(http.MethodPost, base+"/sessions", `{"tier":"easy","mode":"ranked"}`, "user-alice")
	h.expect(again, 409, "already_played")
	body := again.json(t)
	if body["message"] == nil || body["result"].(map[string]interface{})["totalScore"].(float64) != 1000 {
		t.Fatalf("already_played body %s", again.Body)
	}
	// Finishing again does not write twice.
	h.expect(h.do(http.MethodPost, base+"/sessions/"+id+"/finish", "", ""), 200, "")
	// Practice of the same tier is still open.
	_, pr := h.create("easy", "practice", "user-alice")
	h.expect(pr, 201, "")

	// Another tier is a separate ranked attempt with its own leaderboard.
	hard, hr := h.create("hard", "ranked", "user-alice")
	h.expect(hr, 201, "")
	if hard == id {
		t.Fatal("tiers must not share a session")
	}
	tiers := me("user-alice")
	if len(tiers) != 2 || tiers["hard"].(map[string]interface{})["status"] != "in_progress" {
		t.Fatalf("me tiers %v", tiers)
	}

	// Bob scores less on easy and is ranked second.
	bob, _ := h.create("easy", "ranked", "user-bob")
	h.playCorrect(bob, 0, 30*time.Second)
	h.expect(h.do(http.MethodPost, base+"/sessions/"+bob+"/finish", "", ""), 200, "")

	lb := h.do(http.MethodGet, base+"/leaderboard?tier=easy&limit=500", "", "user-bob")
	h.expect(lb, 200, "")
	var board LeaderboardResponse
	if err := json.Unmarshal(lb.Body, &board); err != nil {
		t.Fatal(err)
	}
	if board.Tier != "easy" || board.TotalPlayers != 2 || len(board.Entries) != 2 || board.Entries[0].Name != "Player alice" || board.Entries[0].Rank != 1 ||
		board.Entries[1].Name != "Player bob" || board.Entries[1].Rank != 2 {
		t.Fatalf("unexpected leaderboard %s", lb.Body)
	}
	if g := board.Entries[0].Game; g == nil || g.Server != "jp" || g.Name != "Mizuki" {
		t.Fatalf("game summary %v", board.Entries[0].Game)
	}
	if strings.Contains(string(lb.Body), "123456789") || strings.Contains(string(lb.Body), `"sub"`) {
		t.Fatal("leaderboard leaks private ids")
	}
	if board.Me == nil || board.Me.Rank != 2 || board.Me.Score != board.Entries[1].Score {
		t.Fatalf("me %+v", board.Me)
	}
	if lb := h.do(http.MethodGet, base+"/leaderboard?tier=easy&limit=1", "", ""); len(lb.json(t)["entries"].([]interface{})) != 1 {
		t.Fatal("limit ignored")
	}
	if n := h.do(http.MethodGet, base+"/leaderboard?tier=hard", "", "").json(t)["totalPlayers"].(float64); n != 0 {
		t.Fatalf("hard leaderboard has %v players", n)
	}
	h.expect(h.do(http.MethodGet, base+"/leaderboard", "", ""), 400, "invalid_tier")
	h.expect(h.do(http.MethodGet, base+"/leaderboard?tier=nope", "", ""), 400, "invalid_tier")

	// Date window: today and the previous 30 days.
	h.expect(h.do(http.MethodGet, base+"/leaderboard?tier=easy&date=2026-09-09", "", ""), 200, "")
	h.expect(h.do(http.MethodGet, base+"/leaderboard?tier=easy&date=2026-09-08", "", ""), 400, "invalid_date")
	h.expect(h.do(http.MethodGet, base+"/leaderboard?tier=easy&date=2026-10-10", "", ""), 400, "invalid_date")
	h.expect(h.do(http.MethodGet, base+"/leaderboard?tier=easy&date=bogus", "", ""), 400, "invalid_date")

	// A new day allows a new ranked attempt.
	h.clock.Advance(24 * time.Hour)
	_, next := h.create("easy", "ranked", "user-alice")
	h.expect(next, 201, "")
	if next.json(t)["date"] != "2026-10-10" {
		t.Fatalf("next day session %s", next.Body)
	}
}
func TestLeaderboardTieBreak(t *testing.T) {
	if !(leaderboardScore(1000, 20_000) > leaderboardScore(1000, 30_000)) {
		t.Fatal("shorter duration should rank higher on equal score")
	}
	if !(leaderboardScore(1001, 999_999_000) > leaderboardScore(1000, 0)) {
		t.Fatal("score must dominate duration")
	}
	if leaderboardScore(5, 2_000_000_000) != 5e6 {
		t.Fatal("duration must be capped")
	}
}

func TestMeAndGameLink(t *testing.T) {
	h := newHarness(t, fakeAuth{})
	h.expect(h.do(http.MethodGet, "/api/guess-music/me", "", ""), 401, "unauthorized")
	me := h.do(http.MethodGet, "/api/guess-music/me", "", "user-carol")
	h.expect(me, 200, "")
	if m := me.json(t); m["sub"] != "carol" || m["name"] != "Player carol" || m["game"] != nil {
		t.Fatalf("me %s", me.Body)
	}
	h.expect(h.do(http.MethodPost, "/api/guess-music/me/game-link", `{"harukiAccessToken":"good"}`, ""), 401, "unauthorized")
	h.expect(h.do(http.MethodPost, "/api/guess-music/me/game-link", `{}`, "user-carol"), 400, "invalid_body")
	h.expect(h.do(http.MethodPost, "/api/guess-music/me/game-link", `{"harukiAccessToken":"bad"}`, "user-carol"), 400, "invalid_haruki_token")
	h.expect(h.do(http.MethodPost, "/api/guess-music/me/game-link", `{"harukiAccessToken":"nobind"}`, "user-carol"), 422, "no_game_binding")
	link := h.do(http.MethodPost, "/api/guess-music/me/game-link", `{"harukiAccessToken":"good"}`, "user-carol")
	h.expect(link, 200, "")
	if g := link.json(t)["game"].(map[string]interface{}); g["server"] != "jp" || g["userId"] != "123456789" || g["name"] != "Mizuki" {
		t.Fatalf("link %s", link.Body)
	}
	if g := h.do(http.MethodGet, "/api/guess-music/me", "", "user-carol").json(t)["game"]; g == nil {
		t.Fatal("me should include the game link")
	}
	h.expect(h.do(http.MethodDelete, "/api/guess-music/me/game-link", "", "user-carol"), 204, "")
	if g := h.do(http.MethodGet, "/api/guess-music/me", "", "user-carol").json(t)["game"]; g != nil {
		t.Fatal("game link should be removed")
	}
}

func TestSessionsUnavailableBeforeMasterData(t *testing.T) {
	store := NewMemoryStore()
	defer store.Close()
	svc, err := New(context.Background(), Options{
		Store: store, Catalog: NewCatalog(func(string, string, interface{}) error { return errors.New("offline") }),
		Audio: &fakeAudio{}, Location: testLoc,
	})
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	svc.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, base, nil))
	if !strings.Contains(rec.Body.String(), `"ready":false`) {
		t.Fatalf("daily %s", rec.Body)
	}
	rec = httptest.NewRecorder()
	svc.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, base+"/sessions", strings.NewReader(`{"tier":"easy","mode":"practice"}`)))
	if rec.Code != 503 {
		t.Fatalf("status %d", rec.Code)
	}
	// The generated secret is persisted and reused.
	first, _ := store.Get(context.Background(), secretKey)
	svc2, _ := New(context.Background(), Options{Store: store, Catalog: svc.catalog, Audio: &fakeAudio{}})
	if string(svc2.secret) != string(first) || len(first) == 0 {
		t.Fatal("secret was not persisted")
	}
}
