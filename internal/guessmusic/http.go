package guessmusic

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"snowy_viewer/internal/starmoe"
)

const (
	apiPrefix          = "/api/guess-music/"
	maxSmallBodyBytes  = 4 << 10
	maxGameLinkBody    = 16 << 10
	requestTimeout     = 25 * time.Second
	clipRequestTimeout = 28 * time.Second
)

// RegisterRoutes mounts the API under /api/guess-music/.
func (s *Service) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle(apiPrefix, s)
}

// DailyInfo describes today's challenge.
type DailyInfo struct {
	Date        string   `json:"date"`
	Timezone    string   `json:"timezone"`
	NextResetAt string   `json:"nextResetAt"`
	Server      string   `json:"server"`
	AuthEnabled bool     `json:"authEnabled"`
	Ready       bool     `json:"ready"`
	Tiers       []Tier   `json:"tiers"`
	Me          *DailyMe `json:"me,omitempty"`
}

// DailyMe is the signed-in player's ranked progress today.
type DailyMe struct {
	Tiers map[string]TierStatus `json:"tiers"`
}

// ServeHTTP dispatches /api/guess-music/* requests.
func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, apiPrefix), "/")
	parts := strings.Split(path, "/")
	w.Header().Set("Cache-Control", "no-store")

	switch {
	case path == "daily":
		if !allowMethods(w, r, http.MethodGet, http.MethodHead) {
			return
		}
		s.handleDaily(w, r)
	case path == "daily/sessions":
		if !allowMethods(w, r, http.MethodPost) {
			return
		}
		s.handleCreateSession(w, r)
	case path == "daily/leaderboard":
		if !allowMethods(w, r, http.MethodGet, http.MethodHead) {
			return
		}
		s.handleLeaderboard(w, r)
	case len(parts) == 4 && parts[0] == "daily" && parts[1] == "sessions" && parts[3] == "finish":
		if !allowMethods(w, r, http.MethodPost) {
			return
		}
		if id, ok := sessionIDParam(w, parts[2]); ok {
			s.handleFinish(w, r, id)
		}
	case len(parts) == 6 && parts[0] == "daily" && parts[1] == "sessions" && parts[3] == "rounds":
		id, ok := sessionIDParam(w, parts[2])
		if !ok {
			return
		}
		n, err := strconv.Atoi(parts[4])
		if err != nil || n < 0 || n >= RoundsPerDay || strconv.Itoa(n) != parts[4] {
			writeError(w, newAPIError(http.StatusBadRequest, "invalid_round", "轮次无效"))
			return
		}
		switch parts[5] {
		case "start":
			if allowMethods(w, r, http.MethodPost) {
				s.handleStart(w, r, id, n)
			}
		case "clip":
			if allowMethods(w, r, http.MethodGet, http.MethodHead) {
				s.handleClip(w, r, id, n)
			}
		case "answer":
			if allowMethods(w, r, http.MethodPost) {
				s.handleAnswer(w, r, id, n)
			}
		default:
			writeError(w, newAPIError(http.StatusNotFound, "not_found", "接口不存在"))
		}
	case path == "practice/instrumentals":
		if allowMethods(w, r, http.MethodGet, http.MethodHead) {
			s.handlePracticeInstrumentals(w, r)
		}
	case path == "practice/clips":
		if allowMethods(w, r, http.MethodPost) {
			s.handlePracticeClip(w, r)
		}
	case len(parts) == 3 && parts[0] == "practice" && parts[1] == "clips":
		if allowMethods(w, r, http.MethodGet, http.MethodHead) {
			s.handlePracticeClipBytes(w, r, parts[2])
		}
	case path == "me":
		if !allowMethods(w, r, http.MethodGet, http.MethodHead) {
			return
		}
		s.handleMe(w, r)
	case path == "me/game-link":
		if !allowMethods(w, r, http.MethodPost, http.MethodDelete) {
			return
		}
		s.handleGameLink(w, r)
	default:
		writeError(w, newAPIError(http.StatusNotFound, "not_found", "接口不存在"))
	}
}

func allowMethods(w http.ResponseWriter, r *http.Request, methods ...string) bool {
	for _, m := range methods {
		if r.Method == m {
			return true
		}
	}
	w.Header().Set("Allow", strings.Join(methods, ", "))
	writeError(w, newAPIError(http.StatusMethodNotAllowed, "method_not_allowed", "不支持的请求方法"))
	return false
}

func sessionIDParam(w http.ResponseWriter, raw string) (string, bool) {
	if !validSessionID(raw) {
		writeError(w, newAPIError(http.StatusNotFound, "session_not_found", "对局不存在或已过期"))
		return "", false
	}
	return raw, true
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(v); err != nil {
		http.Error(w, `{"error":"internal","message":"encode failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(buf.Bytes())
}

func writeError(w http.ResponseWriter, err error) {
	var apiErr *apiError
	switch {
	case errors.As(err, &apiErr):
	case errors.Is(err, ErrNotFound):
		apiErr = newAPIError(http.StatusNotFound, "session_not_found", "对局不存在或已过期")
	case errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled):
		apiErr = newAPIError(http.StatusServiceUnavailable, "timeout", "处理超时，请重试")
	default:
		apiErr = newAPIError(http.StatusInternalServerError, "internal", "服务器内部错误")
	}
	body := map[string]interface{}{"error": apiErr.Code, "message": apiErr.Message}
	for k, v := range apiErr.Extra {
		body[k] = v
	}
	if apiErr.Status == http.StatusTooManyRequests {
		w.Header().Set("Retry-After", "600")
	}
	writeJSON(w, apiErr.Status, body)
}

func (s *Service) logInternal(r *http.Request, err error) {
	var apiErr *apiError
	if errors.As(err, &apiErr) || errors.Is(err, ErrNotFound) {
		return
	}
	s.logf("guess-music: %s %s: %v", r.Method, r.URL.Path, err)
}

func (s *Service) fail(w http.ResponseWriter, r *http.Request, err error) {
	s.logInternal(r, err)
	writeError(w, err)
}

// identify verifies the optional bearer token. With auth disabled tokens
// are ignored.
func (s *Service) identify(r *http.Request) (*starmoe.Claims, error) {
	if !s.authEnabled() {
		return nil, nil
	}
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if header == "" {
		return nil, nil
	}
	const prefix = "bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return nil, newAPIError(http.StatusUnauthorized, "invalid_token", "登录凭据格式错误")
	}
	claims, err := s.auth.Verify(r.Context(), strings.TrimSpace(header[len(prefix):]))
	if err != nil {
		if errors.Is(err, starmoe.ErrKeysUnavailable) {
			return nil, newAPIError(http.StatusServiceUnavailable, "auth_unavailable", "暂时无法验证登录状态，请稍后再试")
		}
		return nil, newAPIError(http.StatusUnauthorized, "invalid_token", "登录已失效，请重新登录")
	}
	return claims, nil
}

func (s *Service) requireUser(r *http.Request) (*starmoe.Claims, error) {
	if !s.authEnabled() {
		return nil, newAPIError(http.StatusUnauthorized, "auth_disabled", "服务器未启用 StarMoe 登录")
	}
	claims, err := s.identify(r)
	if err != nil {
		return nil, err
	}
	if claims == nil {
		return nil, newAPIError(http.StatusUnauthorized, "unauthorized", "请先登录 StarMoe 通行证")
	}
	return claims, nil
}

func (s *Service) handleDaily(w http.ResponseWriter, r *http.Request) {
	day := s.today()
	info := DailyInfo{
		Date:        day.Date,
		Timezone:    s.loc.String(),
		NextResetAt: day.Next.Format(time.RFC3339),
		Server:      ServerRegion,
		AuthEnabled: s.authEnabled(),
		Ready:       s.catalog.Ready(),
		Tiers:       s.tiersFor(day),
	}
	// A missing or invalid token only omits "me": the page still loads.
	if claims, err := s.identify(r); err == nil && claims != nil && claims.Subject != "" {
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		info.Me = &DailyMe{Tiers: s.myTiers(ctx, day.Date, claims.Subject)}
	}
	writeJSON(w, http.StatusOK, info)
}

func drainBody(r *http.Request, limit int64) {
	if r.Body != nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, limit))
	}
}

type createSessionRequest struct {
	Tier string `json:"tier"`
	Mode string `json:"mode"`
}

func (s *Service) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req createSessionRequest
	if err := decodeBody(w, r, maxSmallBodyBytes, &req); err != nil {
		writeError(w, err)
		return
	}
	tier, ok := tierByID(req.Tier)
	if !ok {
		writeError(w, newAPIError(http.StatusBadRequest, "invalid_tier", "tier 必须是 easy、normal、hard 或 hell"))
		return
	}
	if !validMode(req.Mode) {
		writeError(w, newAPIError(http.StatusBadRequest, "invalid_mode", "mode 必须是 ranked 或 practice"))
		return
	}
	var claims *starmoe.Claims
	if req.Mode == ModeRanked {
		var err error
		if claims, err = s.identify(r); err != nil {
			s.fail(w, r, err)
			return
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	resp, created, err := s.createSession(ctx, claims, s.ips.clientIP(r), tier, req.Mode)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, resp)
}

func (s *Service) handleStart(w http.ResponseWriter, r *http.Request, id string, n int) {
	drainBody(r, maxSmallBodyBytes)
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	resp, err := s.startRound(ctx, id, n)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Service) handleClip(w http.ResponseWriter, r *http.Request, id string, n int) {
	ctx, cancel := context.WithTimeout(r.Context(), clipRequestTimeout)
	defer cancel()
	clip, err := s.clipFor(ctx, id, n, r.Method == http.MethodGet)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	h := w.Header()
	h.Set("Content-Type", clip.ContentType)
	h.Set("Cache-Control", "private, no-store")
	h.Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(clip.Data))
}

type answerRequest struct {
	MusicID json.RawMessage `json:"musicId"`
}

func (s *Service) handleAnswer(w http.ResponseWriter, r *http.Request, id string, n int) {
	var req answerRequest
	if err := decodeBody(w, r, maxSmallBodyBytes, &req); err != nil {
		writeError(w, err)
		return
	}
	var musicID *int
	raw := bytes.TrimSpace(req.MusicID)
	switch {
	case len(raw) == 0:
		writeError(w, newAPIError(http.StatusBadRequest, "invalid_body", "缺少 musicId"))
		return
	case bytes.Equal(raw, []byte("null")):
	default:
		v, err := strconv.Atoi(string(raw))
		if err != nil || v <= 0 {
			writeError(w, newAPIError(http.StatusBadRequest, "invalid_body", "musicId 必须是正整数或 null"))
			return
		}
		musicID = &v
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	resp, err := s.answerRound(ctx, id, n, musicID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Service) handleFinish(w http.ResponseWriter, r *http.Request, id string) {
	drainBody(r, maxSmallBodyBytes)
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	resp, err := s.finishSession(ctx, id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Service) handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	tier, ok := tierByID(q.Get("tier"))
	if !ok {
		writeError(w, newAPIError(http.StatusBadRequest, "invalid_tier", "tier 必须是 easy、normal、hard 或 hell"))
		return
	}
	today := s.today()
	date := q.Get("date")
	if date == "" {
		date = today.Date
	}
	day, err := parseDay(date, s.loc)
	if err != nil || day.Start.After(today.Start) || day.Start.Before(today.Start.AddDate(0, 0, -leaderboardDays)) {
		writeError(w, newAPIError(http.StatusBadRequest, "invalid_date", "只能查询今天及之前 30 天的排行榜"))
		return
	}
	limit := defaultLBLimit
	if raw := q.Get("limit"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v <= 0 {
			writeError(w, newAPIError(http.StatusBadRequest, "invalid_limit", "limit 必须是正整数"))
			return
		}
		limit = v
	}
	if limit > maxLBLimit {
		limit = maxLBLimit
	}
	claims, err := s.identify(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	sub := ""
	if claims != nil {
		sub = claims.Subject
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	resp, err := s.leaderboard(ctx, day.Date, tier.ID, limit, sub)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// MeResponse describes the signed-in player.
type MeResponse struct {
	Sub    string       `json:"sub"`
	Name   string       `json:"name"`
	Avatar string       `json:"avatar"`
	Game   *GameAccount `json:"game,omitempty"`
}

func (s *Service) handleMe(w http.ResponseWriter, r *http.Request) {
	claims, err := s.requireUser(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	link, err := s.gameLink(ctx, claims.Subject)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, MeResponse{
		Sub:    claims.Subject,
		Name:   displayName(claims),
		Avatar: claims.Picture,
		Game:   link,
	})
}

type gameLinkRequest struct {
	HarukiAccessToken string `json:"harukiAccessToken"`
	Server            string `json:"server,omitempty"`
	UserID            string `json:"userId,omitempty"`
}

func (s *Service) handleGameLink(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var req gameLinkRequest
		if err := decodeBody(w, r, maxGameLinkBody, &req); err != nil {
			writeError(w, err)
			return
		}
		req.HarukiAccessToken = strings.TrimSpace(req.HarukiAccessToken)
		if req.HarukiAccessToken == "" || len(req.HarukiAccessToken) > 8<<10 {
			writeError(w, newAPIError(http.StatusBadRequest, "invalid_body", "缺少 harukiAccessToken"))
			return
		}
		claims, err := s.requireUser(r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		if s.games == nil {
			writeError(w, newAPIError(http.StatusServiceUnavailable, "game_link_unavailable", "暂不支持绑定游戏账号"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		account, err := s.games.Resolve(ctx, req.HarukiAccessToken, strings.ToLower(strings.TrimSpace(req.Server)), strings.TrimSpace(req.UserID))
		if err != nil {
			switch {
			case errors.Is(err, ErrGameTokenInvalid):
				writeError(w, newAPIError(http.StatusBadRequest, "invalid_haruki_token", "Haruki 授权无效或已过期，请重新授权"))
			case errors.Is(err, ErrNoGameBinding):
				writeError(w, newAPIError(http.StatusUnprocessableEntity, "no_game_binding", "该 Haruki 账号没有可用的游戏账号绑定"))
			default:
				s.logf("guess-music: haruki verify: %v", err)
				writeError(w, newAPIError(http.StatusBadGateway, "haruki_unavailable", "暂时无法连接 Haruki，请稍后再试"))
			}
			return
		}
		if err := s.setGameLink(ctx, claims.Subject, account); err != nil {
			s.fail(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"game": account})
		return
	}

	drainBody(r, maxSmallBodyBytes)
	claims, err := s.requireUser(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := s.store.Delete(ctx, gameLinkKey(claims.Subject)); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// decodeBody reads a size-limited JSON object body.
func decodeBody(w http.ResponseWriter, r *http.Request, limit int64, target interface{}) error {
	body := http.MaxBytesReader(w, r.Body, limit)
	data, err := io.ReadAll(body)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return newAPIError(http.StatusRequestEntityTooLarge, "body_too_large", "请求体过大")
		}
		return newAPIError(http.StatusBadRequest, "invalid_body", "无法读取请求体")
	}
	if err := json.Unmarshal(data, target); err != nil {
		return newAPIError(http.StatusBadRequest, "invalid_body", "请求体不是有效的 JSON")
	}
	return nil
}
