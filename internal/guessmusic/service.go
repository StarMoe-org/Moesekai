package guessmusic

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"snowy_viewer/internal/starmoe"
)

const (
	secretKey        = "gm:secret"
	planTTL          = 40 * 24 * time.Hour
	sessionTTL       = 48 * time.Hour
	leaderboardTTL   = 40 * 24 * time.Hour
	leaderboardDays  = 30
	defaultLBLimit   = 50
	maxLBLimit       = 100
	durationCapSecs  = 999999
	storeOpTimeout   = 10 * time.Second
	prewarmInterval  = 5 * time.Minute
	prewarmRetry     = 30 * time.Second
	prewarmAheadTime = 30 * time.Minute
	prewarmWorkers   = 4
)

// Authenticator verifies StarMoe ID tokens (implemented by *starmoe.Verifier).
type Authenticator interface {
	Enabled() bool
	Verify(ctx context.Context, token string) (*starmoe.Claims, error)
}

// GameAccount is a game account linked to a StarMoe user.
type GameAccount struct {
	Server string `json:"server"`
	UserID string `json:"userId"`
	Name   string `json:"name"`
}

// GameLinker resolves the game account owning a Haruki OAuth2 access token.
// server and userID optionally select one of several bindings.
type GameLinker interface {
	Resolve(ctx context.Context, accessToken, server, userID string) (GameAccount, error)
}

// Options configures a Service.
type Options struct {
	Store   Store
	Catalog *Catalog
	Audio   AudioSource
	Auth    Authenticator
	Games   GameLinker
	// Secret seeds the daily questions. Empty: generated once and persisted.
	Secret   string
	Location *time.Location
	// SessionsPerHour limits new sessions per client IP (default 300).
	SessionsPerHour int
	// PracticeClipsPerHour limits free-play clip requests per client IP
	// (default 2000).
	PracticeClipsPerHour int
	// TrustedProxies are extra proxy networks, besides loopback and private
	// ranges, whose X-Forwarded-For entries are believed when finding the
	// client address (e.g. a hosting platform's public ingress).
	TrustedProxies []*net.IPNet
	// CheckAudio HEAD-checks each chosen vocal while building a plan.
	CheckAudio bool
	// ClipCacheDir caches generated clips on disk ("" disables it).
	ClipCacheDir string
	// ClipMemoryBytes caps the in-memory clip cache (default 64 MB).
	ClipMemoryBytes int64
	// Instrumentals is the private vocal-free set (GUESS_MUSIC_INST_SOURCE);
	// nil makes vocal removal unavailable. New loads its manifest once.
	Instrumentals *InstrumentalSource
	Now           func() time.Time
	Logf          func(string, ...interface{})
}

// Service implements the daily challenge.
type Service struct {
	store   Store
	catalog *Catalog
	clips   *clipManager
	auth    Authenticator
	games   GameLinker
	secret  []byte
	loc     *time.Location
	now     func() time.Time
	logf    func(string, ...interface{})
	limiter *rateLimiter
	ips     ipResolver
	exists  existsFunc

	inst        *InstrumentalSource
	clipLimiter *rateLimiter
	tokenEnc    []byte // free-play clip token keys, derived from secret
	tokenMAC    []byte

	planMu    sync.Mutex
	plans     map[string]*DailyPlan
	planCalls map[string]*planCall

	warmMu  sync.Mutex
	warming map[string]bool // question sets being (or already) pre-warmed
	warmWG  sync.WaitGroup  // background warm-ups (tests wait on it)

	prewarmed map[string]bool // touched only by the prewarm goroutine
}

type planCall struct {
	done chan struct{}
	plan *DailyPlan
	err  error
}

// New builds the service, resolving the daily secret.
func New(ctx context.Context, opts Options) (*Service, error) {
	if opts.Store == nil || opts.Catalog == nil || opts.Audio == nil {
		return nil, errors.New("guessmusic: store, catalog and audio source are required")
	}
	s := &Service{
		store:     opts.Store,
		catalog:   opts.Catalog,
		auth:      opts.Auth,
		games:     opts.Games,
		loc:       opts.Location,
		now:       opts.Now,
		logf:      opts.Logf,
		plans:     make(map[string]*DailyPlan),
		planCalls: make(map[string]*planCall),
		warming:   make(map[string]bool),
		prewarmed: make(map[string]bool),
	}
	if s.loc == nil {
		s.loc = time.UTC
	}
	if s.now == nil {
		s.now = time.Now
	}
	if s.logf == nil {
		s.logf = func(string, ...interface{}) {}
	}
	limit := opts.SessionsPerHour
	if limit <= 0 {
		limit = 300
	}
	s.limiter = newRateLimiter(limit, time.Hour, s.now)
	clipLimit := opts.PracticeClipsPerHour
	if clipLimit <= 0 {
		clipLimit = 2000
	}
	s.clipLimiter = newRateLimiter(clipLimit, time.Hour, s.now)
	s.ips = ipResolver{trusted: opts.TrustedProxies}
	s.clips = newClipManager(opts.Audio, opts.ClipCacheDir, opts.ClipMemoryBytes, s.logf)
	if opts.Instrumentals != nil {
		s.inst = opts.Instrumentals
		s.clips.inst = opts.Instrumentals
		if err := s.inst.Refresh(ctx); err != nil {
			s.logf("guess-music: instrumental manifest unavailable, vocal removal off until it loads: %v", err)
		}
	}
	if opts.CheckAudio {
		s.exists = opts.Audio.Exists
	}
	secret, err := s.resolveSecret(ctx, opts.Secret)
	if err != nil {
		return nil, err
	}
	s.secret = secret
	s.tokenEnc = hmacSHA256(secret, "guess-music:free-token:enc")
	s.tokenMAC = hmacSHA256(secret, "guess-music:free-token:mac")
	return s, nil
}

// instIndex returns the loaded instrumental manifest, or nil when vocal
// removal is unavailable.
func (s *Service) instIndex() *instIndex {
	if s.inst == nil {
		return nil
	}
	return s.inst.current()
}

// tierAvailable reports whether tier can be played on day: vocal removal
// needs a loaded manifest with enough released, sung songs for a set.
func (s *Service) tierAvailable(tier Tier, day dayInfo) bool {
	if !tier.VocalRemoval {
		return true
	}
	idx := s.instIndex()
	if idx == nil {
		return false
	}
	return len(instPool(s.catalog.pool(day.Start), idx)) >= RoundsPerDay
}

// tiersFor lists the tiers with their availability on day.
func (s *Service) tiersFor(day dayInfo) []Tier {
	out := append([]Tier(nil), Tiers...)
	for i := range out {
		out[i].Available = s.tierAvailable(out[i], day)
	}
	return out
}

func (s *Service) resolveSecret(ctx context.Context, configured string) ([]byte, error) {
	if configured = strings.TrimSpace(configured); configured != "" {
		return []byte(configured), nil
	}
	ctx, cancel := context.WithTimeout(ctx, storeOpTimeout)
	defer cancel()
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return nil, err
	}
	if _, err := s.store.SetNX(ctx, secretKey, []byte(hex.EncodeToString(buf)), 0); err != nil {
		return nil, fmt.Errorf("guessmusic: persist secret: %w", err)
	}
	stored, err := s.store.Get(ctx, secretKey)
	if err != nil || len(stored) == 0 {
		return nil, fmt.Errorf("guessmusic: read secret: %v", err)
	}
	return stored, nil
}

func (s *Service) authEnabled() bool {
	return s.auth != nil && s.auth.Enabled()
}

func (s *Service) today() dayInfo {
	return dayFor(s.now(), s.loc)
}

// ---------------------------------------------------------------------------
// Daily plans

var errNotReady = errors.New("guessmusic: master data not loaded")

func planKey(date, tier, mode string) string { return "gm:plan:" + date + ":" + tier + ":" + mode }

func setKey(date, tier, mode string) string { return date + "|" + tier + "|" + mode }

// planFor returns the (generated once, then persisted) question set. Each
// set is generated at most once at a time.
func (s *Service) planFor(ctx context.Context, date, tier, mode string) (*DailyPlan, error) {
	key := setKey(date, tier, mode)
	s.planMu.Lock()
	if p := s.plans[key]; p != nil {
		s.planMu.Unlock()
		return p, nil
	}
	call := s.planCalls[key]
	if call == nil {
		call = &planCall{done: make(chan struct{})}
		s.planCalls[key] = call
		go s.buildPlan(key, date, tier, mode, call)
	}
	s.planMu.Unlock()
	select {
	case <-call.done:
		return call.plan, call.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (s *Service) buildPlan(key, date, tier, mode string, call *planCall) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	plan, err := s.loadOrGeneratePlan(ctx, date, tier, mode)
	s.planMu.Lock()
	if err == nil {
		s.rememberPlan(key, plan)
	}
	delete(s.planCalls, key)
	s.planMu.Unlock()
	call.plan, call.err = plan, err
	close(call.done)
}

func (s *Service) loadOrGeneratePlan(ctx context.Context, date, tierID, mode string) (*DailyPlan, error) {
	if p, err := s.loadPlan(ctx, date, tierID, mode); err == nil {
		return p, nil
	}
	tier, ok := tierByID(tierID)
	if !ok || !validMode(mode) {
		return nil, fmt.Errorf("guessmusic: unknown set %s/%s", tierID, mode)
	}
	day, err := parseDay(date, s.loc)
	if err != nil {
		return nil, err
	}
	if !s.catalog.Ready() {
		return nil, errNotReady
	}
	var inst *instIndex
	if tier.VocalRemoval {
		if inst = s.instIndex(); inst == nil {
			return nil, errInstUnavailable
		}
	}
	plan, err := generatePlan(ctx, s.secret, day, tier, mode, s.catalog, s.exists, inst)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(plan)
	if err != nil {
		return nil, err
	}
	created, err := s.store.SetNX(ctx, planKey(date, tierID, mode), raw, planTTL)
	if err != nil {
		return nil, fmt.Errorf("store plan: %w", err)
	}
	if !created {
		// Another instance won the race; use its plan.
		if p, err := s.loadPlan(ctx, date, tierID, mode); err == nil {
			plan = p
		}
	}
	return plan, nil
}

func (s *Service) loadPlan(ctx context.Context, date, tier, mode string) (*DailyPlan, error) {
	raw, err := s.store.Get(ctx, planKey(date, tier, mode))
	if err != nil {
		return nil, err
	}
	var p DailyPlan
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, err
	}
	if p.Date != date || p.Tier != tier || p.Mode != mode || len(p.Rounds) != RoundsPerDay {
		return nil, errors.New("stored plan is invalid")
	}
	return &p, nil
}

// rememberPlan caches p and forgets plans older than two days. planMu held.
func (s *Service) rememberPlan(key string, p *DailyPlan) {
	s.plans[key] = p
	oldest := s.today().Start.AddDate(0, 0, -2).Format("2006-01-02")
	for k, plan := range s.plans {
		if plan.Date < oldest {
			delete(s.plans, k)
		}
	}
}

func (s *Service) clipJob(plan *DailyPlan, round int) clipJob {
	return clipJob{Date: plan.Date, Tier: plan.Tier, Mode: plan.Mode, Round: round, Plan: plan.Rounds[round]}
}

// warmClips generates the missing clips of plan with a few workers.
func (s *Service) warmClips(stop <-chan struct{}, plan *DailyPlan) error {
	jobs := make(chan int)
	errs := make(chan error, RoundsPerDay)
	var wg sync.WaitGroup
	for w := 0; w < prewarmWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				job := s.clipJob(plan, i)
				if s.clips.has(job) {
					continue
				}
				ctx, cancel := context.WithTimeout(context.Background(), clipGenerateTimeout)
				_, err := s.clips.Get(ctx, job)
				cancel()
				if err != nil {
					errs <- fmt.Errorf("clip %s: %w", job.label(), err)
				}
			}
		}()
	}
feed:
	for i := range plan.Rounds {
		select {
		case <-stop:
			break feed
		case jobs <- i:
		}
	}
	close(jobs)
	wg.Wait()
	close(errs)
	return <-errs
}

// warmSet pre-generates a question set's clips in the background, once.
// Practice sets are warmed on first use.
func (s *Service) warmSet(plan *DailyPlan) {
	key := setKey(plan.Date, plan.Tier, plan.Mode)
	s.warmMu.Lock()
	if s.warming[key] {
		s.warmMu.Unlock()
		return
	}
	s.warming[key] = true
	for k := range s.warming {
		if k < plan.Date {
			delete(s.warming, k) // keys start with the date
		}
	}
	s.warmMu.Unlock()
	s.warmWG.Add(1)
	go func() {
		defer s.warmWG.Done()
		if err := s.warmClips(nil, plan); err != nil {
			s.logf("guess-music: warm %s: %v", key, err)
			s.warmMu.Lock()
			delete(s.warming, key) // retry on the next session
			s.warmMu.Unlock()
		}
	}()
}

// StartPrewarm builds the ranked sets of every tier and their clips in the
// background (today's, and tomorrow's shortly before the reset), and prunes
// the disk cache, until stop is closed.
func (s *Service) StartPrewarm(stop <-chan struct{}) {
	go func() {
		for {
			wait := prewarmInterval
			if err := s.prewarm(stop); errors.Is(err, errNotReady) {
				wait = 3 * time.Second
			} else if err != nil {
				s.logf("guess-music: prewarm: %v", err)
				wait = prewarmRetry
			}
			select {
			case <-stop:
				return
			case <-time.After(wait):
			}
		}
	}()
}

func (s *Service) prewarm(stop <-chan struct{}) error {
	if !s.catalog.Ready() {
		return errNotReady
	}
	today := s.today()
	s.clips.pruneDisk(today.Start.AddDate(0, 0, -clipDiskDays).Format("2006-01-02"))
	dates := []string{today.Date}
	if today.Next.Sub(s.now()) < prewarmAheadTime {
		dates = append(dates, today.Next.Format("2006-01-02"))
	}
	for _, date := range dates {
		day, err := parseDay(date, s.loc)
		if err != nil {
			return err
		}
		began := time.Now()
		before := s.clips.fetchedBytes.Load()
		var warmed []string
		for _, tier := range Tiers {
			key := date + "|" + tier.ID
			if s.prewarmed[key] {
				continue
			}
			// A set is pinned once generated; hell waits for instrumentals.
			if !s.tierAvailable(tier, day) && !s.planPinned(context.Background(), date, tier.ID, ModeRanked) {
				continue
			}
			select {
			case <-stop:
				return nil
			default:
			}
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			plan, err := s.planFor(ctx, date, tier.ID, ModeRanked)
			cancel()
			if err != nil {
				return fmt.Errorf("plan %s %s: %w", date, tier.ID, err)
			}
			if err := s.warmClips(stop, plan); err != nil {
				return err
			}
			s.prewarmed[key] = true
			warmed = append(warmed, tier.ID)
		}
		if len(warmed) > 0 {
			s.logf("guess-music: ranked sets ready for %s (%s, %d bytes fetched, %s)",
				date, strings.Join(warmed, ", "), s.clips.fetchedBytes.Load()-before, time.Since(began).Round(time.Millisecond))
		}
	}
	for key := range s.prewarmed {
		if key < today.Date {
			delete(s.prewarmed, key) // keys start with the date
		}
	}
	return nil
}

// hasPlan reports whether the set is already generated (in memory).
func (s *Service) hasPlan(date, tier, mode string) bool {
	s.planMu.Lock()
	defer s.planMu.Unlock()
	return s.plans[setKey(date, tier, mode)] != nil
}

// planPinned reports whether the set was already generated, here or by
// another instance or process (persisted in the store). A pinned set stays
// playable, and ranked runs resumable, when its tier later turns
// unavailable (e.g. the instrumental manifest cannot be read after a
// restart).
func (s *Service) planPinned(ctx context.Context, date, tier, mode string) bool {
	if s.hasPlan(date, tier, mode) {
		return true
	}
	ctx, cancel := context.WithTimeout(ctx, storeOpTimeout)
	defer cancel()
	_, err := s.loadPlan(ctx, date, tier, mode)
	return err == nil
}

// ---------------------------------------------------------------------------
// Sessions

// Player is the public identity of a signed-in player.
type Player struct {
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
}

type roundState struct {
	Started   bool      `json:"started,omitempty"`
	StartedAt time.Time `json:"startedAt,omitempty"`
	Served    bool      `json:"served,omitempty"`
	ServedAt  time.Time `json:"servedAt,omitempty"`
	ClipStart float64   `json:"clipStart,omitempty"`
	HasStart  bool      `json:"hasStart,omitempty"`
	Attempts  int       `json:"attempts,omitempty"`
	Wrong     int       `json:"wrong,omitempty"`
	Correct   bool      `json:"correct,omitempty"`
	Final     bool      `json:"final,omitempty"`
	Outcome   string    `json:"outcome,omitempty"`
	Points    int       `json:"points,omitempty"`
	ElapsedMs int64     `json:"elapsedMs,omitempty"`
}

type sessionState struct {
	ID         string          `json:"id"`
	Date       string          `json:"date"`
	Tier       string          `json:"tier"`
	Mode       string          `json:"mode"`
	Ranked     bool            `json:"ranked"`
	Sub        string          `json:"sub,omitempty"`
	Player     *Player         `json:"player,omitempty"`
	CreatedAt  time.Time       `json:"createdAt"`
	Rounds     []roundState    `json:"rounds"`
	Combo      int             `json:"combo"`
	TotalScore int             `json:"totalScore"`
	Finished   bool            `json:"finished,omitempty"`
	Result     *FinishResponse `json:"result,omitempty"`
}

// nextRound is the first round that is not final (RoundsPerDay when done).
func (st *sessionState) nextRound() int {
	for i, r := range st.Rounds {
		if !r.Final {
			return i
		}
	}
	return len(st.Rounds)
}

// latestStarted is the highest started round, or -1.
func (st *sessionState) latestStarted() int {
	latest := -1
	for i, r := range st.Rounds {
		if r.Started {
			latest = i
		}
	}
	return latest
}

func sessionKey(id string) string { return "gm:session:" + id }

func playerKey(date, tier, sub string) string { return "gm:player:" + date + ":" + tier + ":" + sub }

func newSessionID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func validSessionID(id string) bool {
	if len(id) != 32 {
		return false
	}
	_, err := hex.DecodeString(id)
	return err == nil && strings.ToLower(id) == id
}

func (s *Service) loadSession(ctx context.Context, id string) (*sessionState, error) {
	raw, err := s.store.Get(ctx, sessionKey(id))
	if err != nil {
		return nil, err
	}
	var st sessionState
	if err := json.Unmarshal(raw, &st); err != nil {
		return nil, err
	}
	if len(st.Rounds) != RoundsPerDay {
		return nil, errors.New("corrupt session")
	}
	return &st, nil
}

// updateSession applies fn atomically. fn must be free of side effects.
func (s *Service) updateSession(ctx context.Context, id string, fn func(st *sessionState) error) (*sessionState, error) {
	var out *sessionState
	err := s.store.Update(ctx, sessionKey(id), sessionTTL, func(current []byte, exists bool) ([]byte, error) {
		if !exists {
			return nil, ErrNotFound
		}
		var st sessionState
		if err := json.Unmarshal(current, &st); err != nil {
			return nil, err
		}
		if len(st.Rounds) != RoundsPerDay {
			return nil, errors.New("corrupt session")
		}
		if err := fn(&st); err != nil {
			return nil, err
		}
		next, err := json.Marshal(&st)
		if err != nil {
			return nil, err
		}
		out = &st
		return next, nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// apiError is an error with an HTTP status and machine readable code.
type apiError struct {
	Status  int
	Code    string
	Message string
	Extra   map[string]interface{}
}

func (e *apiError) Error() string { return e.Code + ": " + e.Message }

func newAPIError(status int, code, message string) *apiError {
	return &apiError{Status: status, Code: code, Message: message}
}

// SessionResponse is returned when a session is created or resumed.
type SessionResponse struct {
	SessionID   string  `json:"sessionId"`
	Date        string  `json:"date"`
	Tier        string  `json:"tier"`
	Mode        string  `json:"mode"`
	Ranked      bool    `json:"ranked"`
	Player      *Player `json:"player,omitempty"`
	Rounds      int     `json:"rounds"`
	ResumeRound int     `json:"resumeRound"`
}

func sessionResponse(st *sessionState) SessionResponse {
	return SessionResponse{
		SessionID:   st.ID,
		Date:        st.Date,
		Tier:        st.Tier,
		Mode:        st.Mode,
		Ranked:      st.Ranked,
		Player:      st.Player,
		Rounds:      RoundsPerDay,
		ResumeRound: st.nextRound(),
	}
}

// createSession starts a session of today's set for tier and mode, or
// resumes the player's unfinished ranked session. created reports a new
// session (201) as opposed to a resumed one (200).
func (s *Service) createSession(ctx context.Context, claims *starmoe.Claims, clientIP string, tier Tier, mode string) (resp SessionResponse, created bool, err error) {
	if !s.catalog.Ready() {
		return resp, false, newAPIError(503, "not_ready", "曲库数据尚未加载完成，请稍后再试")
	}
	day := s.today()
	if !s.tierAvailable(tier, day) && !s.planPinned(ctx, day.Date, tier.ID, mode) {
		return resp, false, newAPIError(409, "tier_unavailable", "这个难度今天暂不可用")
	}
	ranked := mode == ModeRanked
	if ranked {
		if !s.authEnabled() {
			return resp, false, newAPIError(409, "ranked_unavailable", "服务器未启用 StarMoe 登录，暂时只能进行练习")
		}
		if claims == nil || claims.Subject == "" {
			return resp, false, newAPIError(401, "login_required", "排名挑战需要先登录 StarMoe 通行证")
		}
		existing, apiErr := s.existingRanked(ctx, day.Date, tier.ID, claims.Subject)
		if apiErr != nil {
			return resp, false, apiErr
		}
		if existing != nil {
			return sessionResponse(existing), false, nil
		}
	}

	plan, err := s.planFor(ctx, day.Date, tier.ID, mode)
	if err != nil {
		s.logf("guess-music: plan %s %s/%s: %v", day.Date, tier.ID, mode, err)
		return resp, false, newAPIError(503, "not_ready", "今日题目尚未就绪，请稍后再试")
	}

	if !s.limiter.Allow(clientIP) {
		return resp, false, newAPIError(429, "rate_limited", "创建对局过于频繁，请稍后再试")
	}

	id, err := newSessionID()
	if err != nil {
		return resp, false, err
	}
	st := &sessionState{
		ID:        id,
		Date:      day.Date,
		Tier:      tier.ID,
		Mode:      mode,
		Ranked:    ranked,
		CreatedAt: s.now().UTC(),
		Rounds:    make([]roundState, RoundsPerDay),
	}
	if ranked {
		st.Sub = claims.Subject
		st.Player = &Player{Name: displayName(claims), Avatar: claims.Picture}
	}
	raw, err := json.Marshal(st)
	if err != nil {
		return resp, false, err
	}
	if err := s.store.Set(ctx, sessionKey(id), raw, sessionTTL); err != nil {
		return resp, false, err
	}
	if ranked {
		won, err := s.store.SetNX(ctx, playerKey(day.Date, tier.ID, claims.Subject), []byte(id), sessionTTL)
		if err != nil {
			return resp, false, err
		}
		if !won {
			// A concurrent request created the ranked session first.
			_ = s.store.Delete(ctx, sessionKey(id))
			existing, apiErr := s.existingRanked(ctx, day.Date, tier.ID, claims.Subject)
			if apiErr != nil {
				return resp, false, apiErr
			}
			if existing == nil {
				return resp, false, errors.New("ranked session vanished")
			}
			return sessionResponse(existing), false, nil
		}
	} else {
		s.warmSet(plan)
	}
	return sessionResponse(st), true, nil
}

func displayName(c *starmoe.Claims) string {
	if name := c.DisplayName(); name != "" {
		return name
	}
	return "StarMoe 玩家"
}

// existingRanked returns the user's unfinished ranked session of date, nil
// when there is none, or an already_played error carrying the result.
func (s *Service) existingRanked(ctx context.Context, date, tier, sub string) (*sessionState, *apiError) {
	raw, err := s.store.Get(ctx, playerKey(date, tier, sub))
	if errors.Is(err, ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, newAPIError(500, "internal", "读取对局失败")
	}
	st, err := s.loadSession(ctx, string(raw))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, nil
		}
		return nil, newAPIError(500, "internal", "读取对局失败")
	}
	if st.Finished && st.Result != nil {
		// Heal a leaderboard write that failed after the session finished.
		if err := s.recordRanked(ctx, st); err != nil {
			s.logf("guess-music: leaderboard write: %v", err)
		}
		result := s.withRank(ctx, *st.Result, st.Sub)
		e := newAPIError(409, "already_played", "今天这个难度的排名挑战已经完成")
		e.Extra = map[string]interface{}{"result": result}
		return nil, e
	}
	return st, nil
}

// ---------------------------------------------------------------------------
// Rounds

// StartResponse is returned by the round start endpoint.
type StartResponse struct {
	Round            int    `json:"round"`
	ClipSeconds      int    `json:"clipSeconds"`
	TimeLimitSeconds int    `json:"timeLimitSeconds"`
	ClipURL          string `json:"clipUrl"`
	Options          []int  `json:"options,omitempty"`
}

func clipPath(id string, n int) string {
	return fmt.Sprintf("/api/guess-music/daily/sessions/%s/rounds/%d/clip", id, n)
}

func (s *Service) timeLimit() time.Duration { return TimeLimitSeconds * time.Second }

// timedOut reports whether a served round ran past the limit plus grace.
func (s *Service) timedOut(r *roundState, now time.Time) bool {
	return r.Served && now.Sub(r.ServedAt) > s.timeLimit()+timeoutGrace
}

func (s *Service) finalizeTimeout(st *sessionState, r *roundState) {
	r.Final = true
	r.Correct = false
	r.Points = 0
	r.Outcome = "timeout"
	r.ElapsedMs = s.timeLimit().Milliseconds()
	st.Combo = 0
}

func (s *Service) startRound(ctx context.Context, id string, n int) (StartResponse, error) {
	now := s.now().UTC()
	st, err := s.updateSession(ctx, id, func(st *sessionState) error {
		if st.Finished {
			return newAPIError(409, "session_finished", "本局已结束")
		}
		// A round left running past its limit is closed automatically.
		for i := 0; i < n && i < len(st.Rounds); i++ {
			if r := &st.Rounds[i]; !r.Final && s.timedOut(r, now) {
				s.finalizeTimeout(st, r)
			}
		}
		next := st.nextRound()
		if n < next {
			return newAPIError(409, "round_final", "这一轮已经结束")
		}
		if n > next {
			return newAPIError(409, "round_out_of_order", "请按顺序进行，上一轮尚未结束")
		}
		r := &st.Rounds[n]
		if !r.Started {
			r.Started = true
			r.StartedAt = now
		}
		return nil
	})
	if err != nil {
		return StartResponse{}, err
	}
	plan, err := s.planFor(ctx, st.Date, st.Tier, st.Mode)
	if err != nil {
		return StartResponse{}, newAPIError(503, "not_ready", "题目尚未就绪")
	}
	resp := StartResponse{
		Round:            n,
		ClipSeconds:      plan.Rounds[n].ClipSeconds,
		TimeLimitSeconds: TimeLimitSeconds,
		ClipURL:          clipPath(id, n),
	}
	if opts := plan.Rounds[n].Options; len(opts) > 0 {
		resp.Options = append([]int(nil), opts...)
	}
	return resp, nil
}

// clipFor returns the audio of round n and starts its timer on first serve.
// markServed is false for HEAD requests.
func (s *Service) clipFor(ctx context.Context, id string, n int, markServed bool) (*Clip, error) {
	st, err := s.loadSession(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := checkClipRound(st, n); err != nil {
		return nil, err
	}
	plan, err := s.planFor(ctx, st.Date, st.Tier, st.Mode)
	if err != nil {
		return nil, newAPIError(503, "not_ready", "题目尚未就绪")
	}
	job := s.clipJob(plan, n)
	clip, err := s.clips.Get(ctx, job)
	if err != nil {
		s.logf("guess-music: clip %s: %v", job.label(), err)
		return nil, newAPIError(503, "clip_unavailable", "音频暂时无法加载，请稍后重试")
	}
	if !markServed {
		return clip, nil
	}
	now := s.now().UTC()
	_, err = s.updateSession(ctx, id, func(st *sessionState) error {
		if err := checkClipRound(st, n); err != nil {
			return err
		}
		r := &st.Rounds[n]
		if r.Served {
			return errNoWrite
		}
		r.Served = true
		r.ServedAt = now
		r.ClipStart = clip.StartSeconds
		r.HasStart = true
		return nil
	})
	if err != nil && !errors.Is(err, errNoWrite) {
		return nil, err
	}
	return clip, nil
}

// checkClipRound allows the clip of the latest started round only.
func checkClipRound(st *sessionState, n int) error {
	if n < 0 || n >= len(st.Rounds) || !st.Rounds[n].Started {
		return newAPIError(409, "round_not_started", "这一轮尚未开始")
	}
	if st.latestStarted() != n {
		return newAPIError(409, "round_not_current", "只能获取当前这一轮的音频")
	}
	if st.Finished {
		return newAPIError(409, "session_finished", "本局已结束")
	}
	return nil
}

// RoundReveal discloses a round's answer once it is final.
type RoundReveal struct {
	MusicID      int     `json:"musicId"`
	MusicTitle   string  `json:"musicTitle"`
	VocalID      int     `json:"vocalId"`
	VocalCaption string  `json:"vocalCaption"`
	VocalType    string  `json:"vocalType"`
	StartSeconds float64 `json:"startSeconds"`
	ClipSeconds  int     `json:"clipSeconds"`
}

func reveal(plan RoundPlan, start float64) *RoundReveal {
	return &RoundReveal{
		MusicID:      plan.MusicID,
		MusicTitle:   plan.MusicTitle,
		VocalID:      plan.VocalID,
		VocalCaption: plan.VocalCaption,
		VocalType:    plan.VocalType,
		StartSeconds: start,
		ClipSeconds:  plan.ClipSeconds,
	}
}

// AnswerResponse is returned by the answer endpoint.
type AnswerResponse struct {
	Correct     bool         `json:"correct"`
	Final       bool         `json:"final"`
	StrikesLeft int          `json:"strikesLeft"`
	Points      int          `json:"points"`
	TotalScore  int          `json:"totalScore"`
	Combo       int          `json:"combo"`
	Answer      *RoundReveal `json:"answer,omitempty"`
}

// computePoints implements the scoring formula.
func computePoints(elapsed time.Duration, combo, wrong int) int {
	limit := float64(TimeLimitSeconds)
	timeFactor := 1 - elapsed.Seconds()/limit
	if timeFactor < 0.1 {
		timeFactor = 0.1
	}
	if timeFactor > 1 {
		timeFactor = 1
	}
	comboMult := 1.0
	if combo >= 2 {
		comboMult = 1 + 0.25*float64(combo-1)
		if comboMult > 2 {
			comboMult = 2
		}
	}
	penalty := 1.0
	for i := 0; i < wrong; i++ {
		penalty *= 0.5
	}
	// The epsilon absorbs float error (e.g. 0.8*1.5 landing just below 1.2).
	return int(1000*timeFactor*comboMult*penalty + 1e-6)
}

// answerRound evaluates a guess; musicID nil means giving up.
func (s *Service) answerRound(ctx context.Context, id string, n int, musicID *int) (AnswerResponse, error) {
	st, err := s.loadSession(ctx, id)
	if err != nil {
		return AnswerResponse{}, err
	}
	plan, err := s.planFor(ctx, st.Date, st.Tier, st.Mode)
	if err != nil {
		return AnswerResponse{}, newAPIError(503, "not_ready", "题目尚未就绪")
	}
	if n < 0 || n >= len(plan.Rounds) {
		return AnswerResponse{}, newAPIError(400, "invalid_round", "轮次无效")
	}
	if musicID != nil {
		if _, ok := s.catalog.Music(*musicID); !ok && *musicID != plan.Rounds[n].MusicID {
			return AnswerResponse{}, newAPIError(400, "unknown_music", "没有这首歌曲")
		}
	}
	target := plan.Rounds[n]
	now := s.now().UTC()
	var resp AnswerResponse
	_, err = s.updateSession(ctx, id, func(st *sessionState) error {
		if st.Finished {
			return newAPIError(409, "session_finished", "本局已结束")
		}
		r := &st.Rounds[n]
		if !r.Started {
			return newAPIError(409, "round_not_started", "这一轮尚未开始")
		}
		if r.Final {
			return newAPIError(409, "round_final", "这一轮已经结束")
		}
		if !r.Served && musicID != nil {
			return newAPIError(409, "clip_not_served", "音频尚未开始播放")
		}
		elapsed := time.Duration(0)
		if r.Served {
			elapsed = now.Sub(r.ServedAt)
		}
		switch {
		case s.timedOut(r, now):
			s.finalizeTimeout(st, r)
		case musicID == nil:
			r.Final = true
			r.Outcome = "gave_up"
			r.ElapsedMs = clampElapsed(elapsed, s.timeLimit())
			st.Combo = 0
		case *musicID == target.MusicID || s.sameTitle(*musicID, target):
			r.Attempts++
			r.Final = true
			r.Correct = true
			r.Outcome = "correct"
			r.ElapsedMs = clampElapsed(elapsed, s.timeLimit())
			if r.Wrong == 0 {
				st.Combo++
			} else {
				st.Combo = 0
			}
			r.Points = computePoints(elapsed, st.Combo, r.Wrong)
			st.TotalScore += r.Points
		default:
			r.Attempts++
			r.Wrong++
			if r.Wrong >= MaxStrikes {
				r.Final = true
				r.Outcome = "strikes"
				r.ElapsedMs = clampElapsed(elapsed, s.timeLimit())
				st.Combo = 0
			}
		}
		resp = AnswerResponse{
			Correct:     r.Correct,
			Final:       r.Final,
			StrikesLeft: MaxStrikes - r.Wrong,
			Points:      r.Points,
			TotalScore:  st.TotalScore,
			Combo:       st.Combo,
		}
		if r.Final {
			resp.Answer = reveal(target, r.ClipStart)
		}
		return nil
	})
	if err != nil {
		return AnswerResponse{}, err
	}
	return resp, nil
}

// sameTitle reports whether musicID is a different release of the answer's
// song (same normalized title).
func (s *Service) sameTitle(musicID int, target RoundPlan) bool {
	m, ok := s.catalog.Music(musicID)
	if !ok {
		return false
	}
	want := normalizeTitle(target.MusicTitle)
	return want != "" && normalizeTitle(m.Title) == want
}

func clampElapsed(elapsed, limit time.Duration) int64 {
	if elapsed < 0 {
		elapsed = 0
	}
	if elapsed > limit {
		elapsed = limit
	}
	return elapsed.Milliseconds()
}

// ---------------------------------------------------------------------------
// Finish and leaderboard

// RoundResult is one round in a finished session.
type RoundResult struct {
	Round     int          `json:"round"`
	Correct   bool         `json:"correct"`
	Points    int          `json:"points"`
	Attempts  int          `json:"attempts"`
	ElapsedMs int64        `json:"elapsedMs"`
	Answer    *RoundReveal `json:"answer"`
}

// FinishResponse summarizes a finished session.
type FinishResponse struct {
	Date         string        `json:"date"`
	Tier         string        `json:"tier"`
	Mode         string        `json:"mode"`
	TotalScore   int           `json:"totalScore"`
	CorrectCount int           `json:"correctCount"`
	DurationMs   int64         `json:"durationMs"`
	Ranked       bool          `json:"ranked"`
	Rank         *int64        `json:"rank,omitempty"`
	TotalPlayers *int64        `json:"totalPlayers,omitempty"`
	Rounds       []RoundResult `json:"rounds"`
}

type leaderboardEntry struct {
	Sub          string       `json:"sub"`
	Name         string       `json:"name"`
	Avatar       string       `json:"avatar"`
	Score        int          `json:"score"`
	CorrectCount int          `json:"correctCount"`
	DurationMs   int64        `json:"durationMs"`
	Game         *GameSummary `json:"game,omitempty"`
}

// GameSummary is the public part of a linked game account.
type GameSummary struct {
	Server string `json:"server"`
	Name   string `json:"name"`
}

func leaderboardKey(date, tier string) string { return "gm:lb:" + date + ":" + tier }

func leaderboardEntryKey(date, tier, sub string) string {
	return "gm:lbe:" + date + ":" + tier + ":" + sub
}

func gameLinkKey(sub string) string { return "gm:gamelink:" + sub }

func leaderboardScore(totalScore int, durationMs int64) float64 {
	secs := durationMs / 1000
	if secs > durationCapSecs {
		secs = durationCapSecs
	}
	if secs < 0 {
		secs = 0
	}
	return float64(totalScore)*1e6 + float64(durationCapSecs-secs)
}

func (s *Service) finishSession(ctx context.Context, id string) (FinishResponse, error) {
	st, err := s.loadSession(ctx, id)
	if err != nil {
		return FinishResponse{}, err
	}
	if !st.Finished {
		plan, err := s.planFor(ctx, st.Date, st.Tier, st.Mode)
		if err != nil {
			return FinishResponse{}, newAPIError(503, "not_ready", "题目尚未就绪")
		}
		// Resolve clip starts outside the atomic update (it may download).
		starts := make(map[int]float64)
		for i, r := range st.Rounds {
			if r.HasStart {
				continue
			}
			if c := s.clips.peek(s.clipJob(plan, i)); c != nil {
				starts[i] = c.StartSeconds
				continue
			}
			cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
			c, err := s.clips.Get(cctx, s.clipJob(plan, i))
			cancel()
			if err == nil {
				starts[i] = c.StartSeconds
			} else {
				starts[i] = plan.Rounds[i].FillerSec
			}
		}
		now := s.now().UTC()
		st, err = s.updateSession(ctx, id, func(st *sessionState) error {
			if st.Finished {
				return nil
			}
			for i := range st.Rounds {
				r := &st.Rounds[i]
				if !r.HasStart {
					r.ClipStart = starts[i]
					r.HasStart = true
				}
				if r.Final {
					continue
				}
				if s.timedOut(r, now) {
					s.finalizeTimeout(st, r)
					continue
				}
				r.Final = true
				r.Outcome = "gave_up"
				if r.Served {
					r.ElapsedMs = clampElapsed(now.Sub(r.ServedAt), s.timeLimit())
				}
				st.Combo = 0
			}
			res := FinishResponse{Date: st.Date, Tier: st.Tier, Mode: st.Mode, Ranked: st.Ranked, TotalScore: st.TotalScore}
			for i, r := range st.Rounds {
				if r.Correct {
					res.CorrectCount++
				}
				res.DurationMs += r.ElapsedMs
				res.Rounds = append(res.Rounds, RoundResult{
					Round:     i,
					Correct:   r.Correct,
					Points:    r.Points,
					Attempts:  r.Attempts,
					ElapsedMs: r.ElapsedMs,
					Answer:    reveal(plan.Rounds[i], r.ClipStart),
				})
			}
			st.Finished = true
			st.Result = &res
			return nil
		})
		if err != nil {
			return FinishResponse{}, err
		}
	}
	if st.Result == nil {
		return FinishResponse{}, errors.New("finished session has no result")
	}
	if st.Ranked && st.Sub != "" {
		if err := s.recordRanked(ctx, st); err != nil {
			return FinishResponse{}, err
		}
	}
	return s.withRank(ctx, *st.Result, st.Sub), nil
}

// recordRanked writes a finished ranked session to the leaderboard. It is
// idempotent: ZADD NX keeps the first write.
func (s *Service) recordRanked(ctx context.Context, st *sessionState) error {
	res := st.Result
	entry := leaderboardEntry{
		Sub:          st.Sub,
		Score:        res.TotalScore,
		CorrectCount: res.CorrectCount,
		DurationMs:   res.DurationMs,
	}
	if st.Player != nil {
		entry.Name = st.Player.Name
		entry.Avatar = st.Player.Avatar
	}
	if link, err := s.gameLink(ctx, st.Sub); err == nil && link != nil {
		entry.Game = &GameSummary{Server: link.Server, Name: link.Name}
	}
	raw, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	if _, err := s.store.SetNX(ctx, leaderboardEntryKey(st.Date, st.Tier, st.Sub), raw, leaderboardTTL); err != nil {
		return err
	}
	key := leaderboardKey(st.Date, st.Tier)
	if _, err := s.store.ZAddNX(ctx, key, st.Sub, leaderboardScore(res.TotalScore, res.DurationMs)); err != nil {
		return err
	}
	return s.store.Expire(ctx, key, leaderboardTTL)
}

func (s *Service) withRank(ctx context.Context, res FinishResponse, sub string) FinishResponse {
	res.Rank, res.TotalPlayers = nil, nil
	if !res.Ranked || sub == "" {
		return res
	}
	key := leaderboardKey(res.Date, res.Tier)
	if rank, ok, err := s.store.ZRevRank(ctx, key, sub); err == nil && ok {
		r := rank + 1
		res.Rank = &r
	}
	if total, err := s.store.ZCard(ctx, key); err == nil {
		res.TotalPlayers = &total
	}
	return res
}

// LeaderboardResponse is the daily leaderboard.
type LeaderboardResponse struct {
	Date         string              `json:"date"`
	Tier         string              `json:"tier"`
	TotalPlayers int64               `json:"totalPlayers"`
	Entries      []LeaderboardRow    `json:"entries"`
	Me           *LeaderboardSelfRow `json:"me,omitempty"`
}

// LeaderboardRow is one public leaderboard row.
type LeaderboardRow struct {
	Rank         int64        `json:"rank"`
	Name         string       `json:"name"`
	Avatar       string       `json:"avatar"`
	Score        int          `json:"score"`
	CorrectCount int          `json:"correctCount"`
	DurationMs   int64        `json:"durationMs"`
	Game         *GameSummary `json:"game,omitempty"`
}

// LeaderboardSelfRow is the requesting player's own standing.
type LeaderboardSelfRow struct {
	Rank         int64 `json:"rank"`
	Score        int   `json:"score"`
	CorrectCount int   `json:"correctCount"`
	DurationMs   int64 `json:"durationMs"`
}

func (s *Service) leaderboard(ctx context.Context, date, tier string, limit int, sub string) (LeaderboardResponse, error) {
	key := leaderboardKey(date, tier)
	resp := LeaderboardResponse{Date: date, Tier: tier, Entries: []LeaderboardRow{}}
	total, err := s.store.ZCard(ctx, key)
	if err != nil {
		return resp, err
	}
	resp.TotalPlayers = total
	members, err := s.store.ZRevRange(ctx, key, 0, int64(limit-1))
	if err != nil {
		return resp, err
	}
	keys := make([]string, len(members))
	for i, m := range members {
		keys[i] = leaderboardEntryKey(date, tier, m.Member)
	}
	raws, err := s.store.MGet(ctx, keys...)
	if err != nil {
		return resp, err
	}
	for i, m := range members {
		var e leaderboardEntry
		if raws[i] == nil || json.Unmarshal(raws[i], &e) != nil {
			e = leaderboardEntry{Name: "?", Score: int(m.Score / 1e6)}
		}
		resp.Entries = append(resp.Entries, LeaderboardRow{
			Rank:         int64(i) + 1,
			Name:         e.Name,
			Avatar:       e.Avatar,
			Score:        e.Score,
			CorrectCount: e.CorrectCount,
			DurationMs:   e.DurationMs,
			Game:         e.Game,
		})
	}
	if sub != "" {
		if rank, ok, err := s.store.ZRevRank(ctx, key, sub); err == nil && ok {
			if raw, err := s.store.Get(ctx, leaderboardEntryKey(date, tier, sub)); err == nil {
				var e leaderboardEntry
				if json.Unmarshal(raw, &e) == nil {
					resp.Me = &LeaderboardSelfRow{Rank: rank + 1, Score: e.Score, CorrectCount: e.CorrectCount, DurationMs: e.DurationMs}
				}
			}
		}
	}
	return resp, nil
}

// TierStatus is the signed-in player's ranked progress in one tier today.
type TierStatus struct {
	Status      string `json:"status"`
	ResumeRound *int   `json:"resumeRound,omitempty"`
	Score       *int   `json:"score,omitempty"`
	Rank        *int64 `json:"rank,omitempty"`
}

// myTiers returns the player's ranked status per tier; unplayed tiers are
// absent.
func (s *Service) myTiers(ctx context.Context, date, sub string) map[string]TierStatus {
	out := make(map[string]TierStatus)
	keys := make([]string, len(Tiers))
	for i, t := range Tiers {
		keys[i] = playerKey(date, t.ID, sub)
	}
	ids, err := s.store.MGet(ctx, keys...)
	if err != nil {
		s.logf("guess-music: read player status: %v", err)
		return out
	}
	for i, t := range Tiers {
		if ids[i] == nil {
			continue
		}
		st, err := s.loadSession(ctx, string(ids[i]))
		if err != nil {
			continue
		}
		if st.Finished && st.Result != nil {
			score := st.Result.TotalScore
			status := TierStatus{Status: "finished", Score: &score}
			if rank, ok, err := s.store.ZRevRank(ctx, leaderboardKey(date, t.ID), sub); err == nil && ok {
				r := rank + 1
				status.Rank = &r
			}
			out[t.ID] = status
			continue
		}
		next := st.nextRound()
		out[t.ID] = TierStatus{Status: "in_progress", ResumeRound: &next}
	}
	return out
}

// ---------------------------------------------------------------------------
// Game links

type storedGameLink struct {
	GameAccount
	LinkedAt time.Time `json:"linkedAt"`
}

func (s *Service) gameLink(ctx context.Context, sub string) (*GameAccount, error) {
	raw, err := s.store.Get(ctx, gameLinkKey(sub))
	if errors.Is(err, ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var link storedGameLink
	if err := json.Unmarshal(raw, &link); err != nil {
		return nil, err
	}
	return &link.GameAccount, nil
}

func (s *Service) setGameLink(ctx context.Context, sub string, account GameAccount) error {
	raw, err := json.Marshal(storedGameLink{GameAccount: account, LinkedAt: s.now().UTC()})
	if err != nil {
		return err
	}
	return s.store.Set(ctx, gameLinkKey(sub), raw, 0)
}
