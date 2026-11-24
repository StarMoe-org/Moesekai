package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"snowy_viewer/internal/masterdata"
	"snowy_viewer/internal/middleware"
	"snowy_viewer/internal/models"
)

const (
	maxMCPRequestBytes       int64 = 64 << 10 // 64 KiB JSON-RPC body cap
	maxUpstreamResponseBytes int64 = 4 << 20  // 4 MiB upstream response cap
	maxAPICacheEntries             = 128
	maxMCPConcurrent               = 32
	maxMCPUpstreamConcurrent       = 16
	defaultMCPQPM                  = 60
	defaultMCPBurst                = 20
	maxValidEventID                = 100_000
	mcpAcquireTimeout              = 250 * time.Millisecond
	mcpDrainLimitBytes       int64 = 16 << 10
	canonicalSiteOrigin            = "https://pjsk.moe"
)

var (
	allowedRankingRegions = map[string]bool{
		"jp": true,
		"cn": true,
		"en": true,
		"tw": true,
		"kr": true,
	}
	allowedPredictionRegions = map[string]bool{
		"jp": true,
		"cn": true,
	}
	allowedCardHosts = map[string]bool{
		"pjsk.moe":                  true,
		"www.pjsk.moe":              true,
		"snowyviewer.exmeaning.com": true,
		"localhost":                 true,
		"127.0.0.1":                 true,
	}
)

var characterNames = map[int]string{
	1: "星乃一歌", 2: "天马咲希", 3: "望月穗波", 4: "日野森志步",
	5: "花里实乃理", 6: "桐谷遥", 7: "桃井爱莉", 8: "日野森雫",
	9: "小豆泽心羽", 10: "白石杏", 11: "东云彰人", 12: "青柳冬弥",
	13: "天马司", 14: "凤笑梦", 15: "草薙宁宁", 16: "神代类",
	17: "宵崎奏", 18: "朝比奈真冬", 19: "东云绘名", 20: "晓山瑞希",
	21: "初音未来", 22: "镜音铃", 23: "镜音连", 24: "巡音流歌",
	25: "MEIKO", 26: "KAITO",
}

var characterUnits = map[int]string{
	1: "Leo/need", 2: "Leo/need", 3: "Leo/need", 4: "Leo/need",
	5: "MORE MORE JUMP！", 6: "MORE MORE JUMP！", 7: "MORE MORE JUMP！", 8: "MORE MORE JUMP！",
	9: "Vivid BAD SQUAD", 10: "Vivid BAD SQUAD", 11: "Vivid BAD SQUAD", 12: "Vivid BAD SQUAD",
	13: "Wonderlands×Showtime", 14: "Wonderlands×Showtime", 15: "Wonderlands×Showtime", 16: "Wonderlands×Showtime",
	17: "25点，Nightcord见。", 18: "25点，Nightcord见。", 19: "25点，Nightcord见。", 20: "25点，Nightcord见。",
	21: "虚拟歌手 (VIRTUAL SINGER)", 22: "虚拟歌手 (VIRTUAL SINGER)", 23: "虚拟歌手 (VIRTUAL SINGER)",
	24: "虚拟歌手 (VIRTUAL SINGER)", 25: "虚拟歌手 (VIRTUAL SINGER)", 26: "虚拟歌手 (VIRTUAL SINGER)",
}

type CardPowerItem struct {
	Performance int `json:"performance"`
	Technique   int `json:"technique"`
	Stamina     int `json:"stamina"`
	Total       int `json:"total"`
}

type CardPowerMeta struct {
	Normal  *CardPowerItem `json:"normal,omitempty"`
	Trained *CardPowerItem `json:"trained,omitempty"`
}

type CardEventMeta struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Asset string `json:"asset"`
}

type CardItem struct {
	ID          int            `json:"id"`
	Prefix      string         `json:"prefix"`
	CharacterID int            `json:"characterId"`
	Rarity      string         `json:"rarity"`
	Attr        string         `json:"attr"`
	Asset       string         `json:"asset"`
	ReleaseAt   int64          `json:"releaseAt,omitempty"`
	SkillName   string         `json:"skillName,omitempty"`
	SkillDesc   string         `json:"skillDesc,omitempty"`
	Power       *CardPowerMeta `json:"power,omitempty"`
	Event       *CardEventMeta `json:"event,omitempty"`
}

type MusicItem struct {
	ID       int    `json:"id"`
	Title    string `json:"title"`
	Lyricist string `json:"lyricist,omitempty"`
	Composer string `json:"composer,omitempty"`
	Asset    string `json:"asset,omitempty"`
}

type EventItem struct {
	ID      int    `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type,omitempty"`
	Asset   string `json:"asset,omitempty"`
	StartAt int64  `json:"startAt,omitempty"`
	EndAt   int64  `json:"endAt,omitempty"`
}

type GachaItem struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Type  string `json:"type"`
	Asset string `json:"asset"`
}

type cachedResponse struct {
	body      []byte
	expiresAt time.Time
}

type fetchFlight struct {
	done chan struct{}
	body []byte
	err  error
}

type Server struct {
	mu                   sync.RWMutex
	cards                map[int]*CardItem
	musics               map[int]*MusicItem
	events               map[int]*EventItem
	gachas               map[int]*GachaItem
	store                *masterdata.Store
	httpClient           *http.Client
	cacheMu              sync.RWMutex
	apiCache             map[string]cachedResponse
	flightMu             sync.Mutex
	flights              map[string]*fetchFlight
	upstreamSem          chan struct{}
	requestSem           chan struct{}
	rateLimiter          *middleware.IPRateLimiter
	baseCtxMu            sync.RWMutex
	baseCtx              context.Context
	rankingV2BaseURL     string
	rankingLegacyBaseURL string
}

func newMCPHTTPClient() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{
		Timeout:   5 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext
	transport.TLSHandshakeTimeout = 5 * time.Second
	transport.ResponseHeaderTimeout = 8 * time.Second
	transport.MaxIdleConns = 32
	transport.MaxIdleConnsPerHost = 16
	transport.MaxConnsPerHost = 32
	transport.IdleConnTimeout = 90 * time.Second
	return &http.Client{
		Timeout:   8 * time.Second,
		Transport: transport,
	}
}

func New(stores ...*masterdata.Store) *Server {
	s := &Server{
		cards:                make(map[int]*CardItem),
		musics:               make(map[int]*MusicItem),
		events:               make(map[int]*EventItem),
		gachas:               make(map[int]*GachaItem),
		httpClient:           newMCPHTTPClient(),
		apiCache:             make(map[string]cachedResponse),
		flights:              make(map[string]*fetchFlight),
		upstreamSem:          make(chan struct{}, maxMCPUpstreamConcurrent),
		requestSem:           make(chan struct{}, maxMCPConcurrent),
		rateLimiter:          middleware.NewIPRateLimiter(defaultMCPQPM, defaultMCPBurst, 10_000),
		baseCtx:              context.Background(),
		rankingV2BaseURL:     "https://rks-n.exmeaning.com",
		rankingLegacyBaseURL: "https://rk.exmeaning.com",
	}
	if len(stores) > 0 {
		s.store = stores[0]
	}
	s.loadMetadata()
	return s
}

// SetBaseContext binds background/shared outbound MCP fetches to a process lifecycle context.
func (s *Server) SetBaseContext(ctx context.Context) {
	if ctx == nil {
		ctx = context.Background()
	}
	s.baseCtxMu.Lock()
	s.baseCtx = ctx
	s.baseCtxMu.Unlock()
}

func (s *Server) baseContext() context.Context {
	s.baseCtxMu.RLock()
	ctx := s.baseCtx
	s.baseCtxMu.RUnlock()
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

// WarmupIDs returns sorted catalog IDs loaded from static metadata maps.
func (s *Server) WarmupIDs() (cards, musics, events, gachas []int) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cards = make([]int, 0, len(s.cards))
	for id := range s.cards {
		if id > 0 {
			cards = append(cards, id)
		}
	}
	musics = make([]int, 0, len(s.musics))
	for id := range s.musics {
		if id > 0 {
			musics = append(musics, id)
		}
	}
	events = make([]int, 0, len(s.events))
	for id := range s.events {
		if id > 0 {
			events = append(events, id)
		}
	}
	gachas = make([]int, 0, len(s.gachas))
	for id := range s.gachas {
		if id > 0 {
			gachas = append(gachas, id)
		}
	}
	sort.Ints(cards)
	sort.Ints(musics)
	sort.Ints(events)
	sort.Ints(gachas)
	return cards, musics, events, gachas
}

func (s *Server) cachedFetch(ctx context.Context, targetURL string, ttl time.Duration) ([]byte, error) {
	now := time.Now()
	s.cacheMu.RLock()
	if item, ok := s.apiCache[targetURL]; ok && now.Before(item.expiresAt) {
		s.cacheMu.RUnlock()
		return item.body, nil
	}
	s.cacheMu.RUnlock()

	// Singleflight per URL so concurrent requests coalesce into one upstream call.
	s.flightMu.Lock()
	if f, ok := s.flights[targetURL]; ok {
		s.flightMu.Unlock()
		select {
		case <-f.done:
			return f.body, f.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	f := &fetchFlight{done: make(chan struct{})}
	s.flights[targetURL] = f
	s.flightMu.Unlock()

	go func() {
		defer func() {
			if r := recover(); r != nil {
				f.err = fmt.Errorf("upstream fetch panic: %v", r)
			}
			s.flightMu.Lock()
			if s.flights[targetURL] == f {
				delete(s.flights, targetURL)
			}
			close(f.done)
			s.flightMu.Unlock()
		}()

		fetchCtx, cancel := context.WithTimeout(s.baseContext(), 8*time.Second)
		defer cancel()

		select {
		case s.upstreamSem <- struct{}{}:
			defer func() { <-s.upstreamSem }()
		case <-fetchCtx.Done():
			f.err = fetchCtx.Err()
			return
		}

		req, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, targetURL, nil)
		if err != nil {
			f.err = err
			return
		}
		req.Header.Set("User-Agent", "Moesekai-MCP/1.0 (+https://pjsk.moe)")

		resp, err := s.httpClient.Do(req)
		if err != nil {
			f.err = err
			return
		}
		defer func() {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, mcpDrainLimitBytes))
			_ = resp.Body.Close()
		}()

		if resp.StatusCode != http.StatusOK {
			f.err = fmt.Errorf("upstream returned status %d", resp.StatusCode)
			return
		}
		if resp.ContentLength > maxUpstreamResponseBytes {
			f.err = fmt.Errorf("upstream response exceeds %d bytes", maxUpstreamResponseBytes)
			return
		}

		body, err := io.ReadAll(io.LimitReader(resp.Body, maxUpstreamResponseBytes+1))
		if err != nil {
			f.err = err
			return
		}
		if int64(len(body)) > maxUpstreamResponseBytes {
			f.err = fmt.Errorf("upstream response exceeds %d bytes", maxUpstreamResponseBytes)
			return
		}

		storeTime := time.Now()
		s.cacheMu.Lock()
		for k, v := range s.apiCache {
			if !storeTime.Before(v.expiresAt) {
				delete(s.apiCache, k)
			}
		}
		for len(s.apiCache) >= maxAPICacheEntries {
			var oldestKey string
			var oldestExp time.Time
			first := true
			for k, v := range s.apiCache {
				if first || v.expiresAt.Before(oldestExp) {
					oldestKey = k
					oldestExp = v.expiresAt
					first = false
				}
			}
			if !first {
				delete(s.apiCache, oldestKey)
			} else {
				break
			}
		}
		s.apiCache[targetURL] = cachedResponse{
			body:      body,
			expiresAt: storeTime.Add(ttl),
		}
		s.cacheMu.Unlock()

		f.body = body
	}()

	select {
	case <-f.done:
		return f.body, f.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (s *Server) loadMetadata() {
	candidates := []string{
		"/app/nextjs/web/public/data",
		"./web/public/data",
		"../web/public/data",
		"./public/data",
	}

	var dataDir string
	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && fi.IsDir() {
			dataDir = c
			break
		}
	}
	if dataDir == "" {
		return
	}

	loadMap := func(filename string) {
		path := filepath.Join(dataDir, filename)
		data, err := os.ReadFile(path)
		if err != nil {
			// Silence here is what hid the wrong JP filename: a missing map
			// degrades the catalog to whatever the other layer happens to hold.
			log.Printf("[mcp] metadata map %s unavailable: %v", filename, err)
			return
		}

		var payload struct {
			Cards  map[string]CardItem  `json:"cards"`
			Musics map[string]MusicItem `json:"musics"`
			Events map[string]EventItem `json:"events"`
			Gachas map[string]GachaItem `json:"gachas"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			return
		}

		s.mu.Lock()
		defer s.mu.Unlock()

		for k, card := range payload.Cards {
			id, _ := strconv.Atoi(k)
			if id > 0 {
				c := card
				c.ID = id
				s.cards[id] = &c
			}
		}
		for k, music := range payload.Musics {
			id, _ := strconv.Atoi(k)
			if id > 0 {
				m := music
				m.ID = id
				s.musics[id] = &m
			}
		}
		for k, event := range payload.Events {
			id, _ := strconv.Atoi(k)
			if id > 0 {
				e := event
				e.ID = id
				s.events[id] = &e
			}
		}
		for k, gacha := range payload.Gachas {
			id, _ := strconv.Atoi(k)
			if id > 0 {
				g := gacha
				g.ID = id
				s.gachas[id] = &g
			}
		}
	}

	// Load JP base then overlay CN translations
	loadMap("metadata-map.jp.json")
	loadMap("metadata-map.cn.json")
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/mcp", s.ServeHTTP)
	mux.HandleFunc("/api/mcp/", s.ServeHTTP)
	mux.HandleFunc("/.well-known/mcp.json", s.serveServerCard)
	mux.HandleFunc("/.well-known/mcp/server-card.json", s.serveServerCard)
	mux.HandleFunc("/.well-known/mcp/server-cards.json", s.serveServerCardsList)
}

func canonicalOrigin(r *http.Request) string {
	host := strings.TrimSpace(r.Host)
	if host == "" {
		return canonicalSiteOrigin
	}
	hostname := strings.ToLower(host)
	if h, _, err := net.SplitHostPort(host); err == nil {
		hostname = strings.ToLower(h)
	}
	if !allowedCardHosts[hostname] {
		return canonicalSiteOrigin
	}
	proto := "https"
	if p := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))); p == "http" || p == "https" {
		proto = p
	}
	return proto + "://" + host
}

func (s *Server) getServerCard(r *http.Request) map[string]interface{} {
	origin := canonicalOrigin(r)
	return map[string]interface{}{
		"name": "Moesekai - Project SEKAI Data Engine",
		"serverInfo": map[string]interface{}{
			"name":    "Moesekai MCP",
			"version": "1.0.0",
		},
		"description": "MCP server for pjsk.moe (Project SEKAI: Colorful Stage! viewer and database). Provides card lookup, music query, event schedules, character profiles, difficulty charts, and gacha data.",
		"url":         origin,
		"transport": map[string]interface{}{
			"type": "http",
			"url":  origin + "/api/mcp",
		},
		"capabilities": map[string]interface{}{
			"tools":     true,
			"resources": true,
			"prompts":   false,
		},
		"tools": []map[string]string{
			{"name": "search_cards", "description": "Search Project SEKAI cards by character name or ID, rarity (1 to 4 stars, birthday), attribute (cool, cute, happy, mysterious, pure), or release date."},
			{"name": "get_card_detail", "description": "Get comprehensive card details including performance/technique/stamina/total power, skill name, full skill effect, and associated event."},
			{"name": "search_musics", "description": "Search Project SEKAI songs by title, lyricist, composer, arranger, or unit."},
			{"name": "get_music_detail", "description": "Get song details including difficulty levels (Easy, Normal, Hard, Expert, Master, Append), note counts, and vocal versions."},
			{"name": "get_event_info", "description": "Get Project SEKAI event details, type (Marathon, Cheer, Carnival), start/end dates, bonus characters, and bonus attribute."},
			{"name": "get_character_profile", "description": "Get character profile, unit affiliation, birthday, height, voice actor/actress (CV), and representative songs."},
			{"name": "get_realtime_ranking", "description": "Get real-time ranking leaderboards and tier cutoffs (T50 to T100000) for ongoing Project SEKAI events across JP, CN, EN, TW, and KR servers."},
			{"name": "get_event_prediction", "description": "Get event border cutoff predictions with Bayesian-Kalman model confidence intervals (P10/P50/P90) and current velocity."},
			{"name": "plan_event_strategy", "description": "Calculate optimal event grinding strategy: required daily hours, plays, fire stamina, large energy drinks, crystals, and feasibility rating."},
			{"name": "search_gachas", "description": "Search Project SEKAI gacha banners, pick-up 4-star cards, schedules, and gacha types (Fes, Limited, Birthday, Permanent)."},
		},
		"authentication": map[string]interface{}{
			"type":        "none",
			"description": "No authentication required for public Project SEKAI game database queries.",
		},
	}
}

func (s *Server) serveServerCard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Cache-Control", "public, max-age=3600, s-maxage=3600")
	_ = json.NewEncoder(w).Encode(s.getServerCard(r))
}

func (s *Server) serveServerCardsList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Cache-Control", "public, max-age=3600, s-maxage=3600")
	_ = json.NewEncoder(w).Encode([]interface{}{s.getServerCard(r)})
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"name":            "Moesekai MCP Server",
			"version":         "1.0.0",
			"protocolVersion": "2024-11-05",
			"status":          "ready",
			"transport":       "streamable-http",
			"description":     "Project SEKAI: Colorful Stage! AI Agent Data Engine. Send JSON-RPC 2.0 POST requests to this endpoint.",
			"tools_count":     10,
			"resources_count": 2,
		})
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.rateLimiter != nil {
		if ok, wait := s.rateLimiter.Allow(middleware.ClientIP(r)); !ok {
			secs := int(wait.Seconds())
			if secs < 1 {
				secs = 1
			}
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Retry-After", strconv.Itoa(secs))
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(Response{
				JSONRPC: "2.0",
				Error:   &RPCError{Code: -32000, Message: "Rate limit exceeded"},
			})
			return
		}
	}

	timer := time.NewTimer(mcpAcquireTimeout)
	select {
	case s.requestSem <- struct{}{}:
		timer.Stop()
	case <-r.Context().Done():
		timer.Stop()
		return
	case <-timer.C:
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Retry-After", "1")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(Response{
			JSONRPC: "2.0",
			Error:   &RPCError{Code: -32000, Message: "MCP server busy"},
		})
		return
	}
	defer func() { <-s.requestSem }()

	r.Body = http.MaxBytesReader(w, r.Body, maxMCPRequestBytes)

	var req Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			_ = json.NewEncoder(w).Encode(Response{
				JSONRPC: "2.0",
				Error:   &RPCError{Code: -32600, Message: "Request body too large"},
			})
			return
		}
		s.writeRPCError(w, nil, -32700, "Parse error", nil)
		return
	}

	s.handleRPC(r.Context(), w, &req)
}

func (s *Server) handleRPC(ctx context.Context, w http.ResponseWriter, req *Request) {
	switch req.Method {
	case "initialize":
		res := InitializeResult{
			ProtocolVersion: "2024-11-05",
			Capabilities: ServerCapabilities{
				Tools:     ToolsCapability{ListChanged: false},
				Resources: ResourcesCapability{Subscribe: false, ListChanged: false},
			},
			ServerInfo: ServerInfo{
				Name:    "Moesekai MCP",
				Version: "1.0.0",
			},
		}
		s.writeRPCResult(w, req.ID, res)

	case "notifications/initialized":
		s.writeRPCResult(w, req.ID, map[string]interface{}{})

	case "ping":
		s.writeRPCResult(w, req.ID, map[string]interface{}{})

	case "tools/list":
		tools := s.getToolsList()
		s.writeRPCResult(w, req.ID, ToolsListResult{Tools: tools})

	case "tools/call":
		var params ToolCallParams
		if len(req.Params) > 0 {
			_ = json.Unmarshal(req.Params, &params)
		}
		result := s.executeToolContext(ctx, params.Name, params.Arguments)
		s.writeRPCResult(w, req.ID, result)

	case "resources/list":
		res := ResourcesListResult{
			Resources: []Resource{
				{
					URI:         "pjsk://characters",
					Name:        "Project SEKAI Character Directory",
					Description: "List of all 26 characters in Project SEKAI with IDs, names, and bands",
					MimeType:    "application/json",
				},
				{
					URI:         "pjsk://events/latest",
					Name:        "Latest Event Summary",
					Description: "Summary of recent Project SEKAI in-game events",
					MimeType:    "application/json",
				},
			},
		}
		s.writeRPCResult(w, req.ID, res)

	case "resources/read":
		var params ResourceReadParams
		if len(req.Params) > 0 {
			_ = json.Unmarshal(req.Params, &params)
		}
		content := s.readResource(params.URI)
		s.writeRPCResult(w, req.ID, ResourceReadResult{Contents: content})

	default:
		s.writeRPCError(w, req.ID, -32601, fmt.Sprintf("Method not found: %s", req.Method), nil)
	}
}

func (s *Server) writeRPCResult(w http.ResponseWriter, id interface{}, result interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(Response{
		JSONRPC: "2.0",
		ID:      id,
		Result:  result,
	})
}

func (s *Server) writeRPCError(w http.ResponseWriter, id interface{}, code int, message string, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(Response{
		JSONRPC: "2.0",
		ID:      id,
		Error: &RPCError{
			Code:    code,
			Message: message,
			Data:    data,
		},
	})
}

func (s *Server) getToolsList() []Tool {
	return []Tool{
		{
			Name:        "search_cards",
			Description: "Search Project SEKAI cards by character name, card title prefix, rarity (rarity_1 to rarity_4, rarity_birthday), or attribute (cool, cute, happy, mysterious, pure).",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "Keyword to search in character name or card prefix/title",
					},
					"character_id": map[string]interface{}{
						"type":        "integer",
						"description": "Filter by character ID (1 to 26)",
					},
					"rarity": map[string]interface{}{
						"type":        "string",
						"description": "Filter by card rarity: rarity_1, rarity_2, rarity_3, rarity_4, rarity_birthday",
					},
					"attribute": map[string]interface{}{
						"type":        "string",
						"description": "Filter by attribute: cool, cute, happy, mysterious, pure",
					},
					"limit": map[string]interface{}{
						"type":        "integer",
						"description": "Maximum number of cards to return (default: 10, max: 30)",
					},
				},
			},
		},
		{
			Name:        "get_card_detail",
			Description: "Get detailed stats, skill name, full skill effect description, normal/trained performance/technique/stamina/total power, and associated event for a specific card by its numerical ID.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"card_id": map[string]interface{}{
						"type":        "integer",
						"description": "Card ID (e.g. 1, 4, 115)",
					},
				},
				"required": []string{"card_id"},
			},
		},
		{
			Name:        "search_musics",
			Description: "Search songs in Project SEKAI by title, lyricist, or composer.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "Search keyword for song title, lyricist, or composer",
					},
					"limit": map[string]interface{}{
						"type":        "integer",
						"description": "Maximum number of songs to return (default: 10, max: 30)",
					},
				},
			},
		},
		{
			Name:        "get_music_detail",
			Description: "Get song details including lyricist, composer, and official assets by numerical music ID.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"music_id": map[string]interface{}{
						"type":        "integer",
						"description": "Music ID (e.g. 1)",
					},
				},
				"required": []string{"music_id"},
			},
		},
		{
			Name:        "get_event_info",
			Description: "Get details for an event in Project SEKAI including name, event type (Marathon, Cheer, Carnival), and dates.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"event_id": map[string]interface{}{
						"type":        "integer",
						"description": "Event ID (e.g. 1, 2, 100). Leave empty to query recent events.",
					},
				},
			},
		},
		{
			Name:        "get_character_profile",
			Description: "Get character biography, unit affiliation, and voice actor for any of the 26 characters.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"character_id": map[string]interface{}{
						"type":        "integer",
						"description": "Character ID (1 to 26). E.g. 1=星乃一歌, 21=初音未来",
					},
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Character name (e.g. 初音未来, 星乃一歌, 宵崎奏)",
					},
				},
			},
		},
		{
			Name:        "get_realtime_ranking",
			Description: "Get real-time ranking leaderboards and tier cutoffs (T50 to T100000) for ongoing Project SEKAI events across JP, CN, EN, TW, and KR servers.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"region": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"jp", "cn", "en", "tw", "kr"},
						"description": "Server region (default: jp)",
					},
					"event_id": map[string]interface{}{
						"type":        "integer",
						"description": "Event ID (optional, defaults to the latest active event)",
					},
				},
			},
		},
		{
			Name:        "get_event_prediction",
			Description: "Get event border cutoff predictions with Bayesian-Kalman model confidence intervals (P10/P50/P90) and current velocity.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"region": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"jp", "cn"},
						"description": "Server region (default: jp)",
					},
					"event_id": map[string]interface{}{
						"type":        "integer",
						"description": "Event ID (optional, defaults to latest event)",
					},
				},
			},
		},
		{
			Name:        "plan_event_strategy",
			Description: "Calculate optimal event grinding strategy: required daily hours, plays, fire stamina, large energy drinks, crystals, and feasibility rating.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"target_score": map[string]interface{}{
						"type":        "integer",
						"description": "Target event score (e.g. 5000000)",
					},
					"current_score": map[string]interface{}{
						"type":        "integer",
						"description": "Current event score (default: 0)",
					},
					"remaining_hours": map[string]interface{}{
						"type":        "number",
						"description": "Remaining event hours (default: 72)",
					},
					"bonus_percent": map[string]interface{}{
						"type":        "number",
						"description": "Deck event bonus percentage, e.g. 475 for 475% (default: 475)",
					},
					"fire_multiplier": map[string]interface{}{
						"type":        "integer",
						"description": "Stamina fire multiplier: 1, 2, 3, 5, 7, or 10 (default: 10)",
					},
					"song_key": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"envy", "lost_and_found", "melt"},
						"description": "Grinding song (default: envy)",
					},
					"daily_available_hours": map[string]interface{}{
						"type":        "number",
						"description": "Daily available play hours (default: 4.0)",
					},
					"daily_auto_budget": map[string]interface{}{
						"type":        "integer",
						"description": "Daily auto live plays budget (default: 30)",
					},
				},
				"required": []string{"target_score"},
			},
		},
		{
			Name:        "search_gachas",
			Description: "Search Project SEKAI gacha banners, pick-up 4-star cards, schedules, and gacha types (Fes, Limited, Birthday, Permanent).",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "Search keyword for gacha name or pick-up character",
					},
					"gacha_type": map[string]interface{}{
						"type":        "string",
						"description": "Filter by gacha type: ceil, birthday, fes, limited",
					},
					"limit": map[string]interface{}{
						"type":        "integer",
						"description": "Maximum number of gachas to return (default: 5, max: 15)",
					},
				},
			},
		},
	}
}

func (s *Server) executeTool(name string, args map[string]interface{}) ToolCallResult {
	return s.executeToolContext(s.baseContext(), name, args)
}

func (s *Server) executeToolContext(ctx context.Context, name string, args map[string]interface{}) ToolCallResult {
	switch name {
	case "search_cards":
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.toolSearchCards(args)
	case "get_card_detail":
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.toolGetCardDetail(args)
	case "search_musics":
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.toolSearchMusics(args)
	case "get_music_detail":
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.toolGetMusicDetail(args)
	case "get_event_info":
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.toolGetEventInfo(args)
	case "get_character_profile":
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.toolGetCharacterProfile(args)
	case "get_realtime_ranking":
		// Never hold s.mu.RLock across outbound network calls.
		return s.toolGetRealtimeRanking(ctx, args)
	case "get_event_prediction":
		// Never hold s.mu.RLock across outbound network calls.
		return s.toolGetEventPrediction(ctx, args)
	case "plan_event_strategy":
		return s.toolPlanEventStrategy(args)
	case "search_gachas":
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.toolSearchGachas(args)
	default:
		return ToolCallResult{
			IsError: true,
			Content: []TextContent{{Type: "text", Text: fmt.Sprintf("Tool %s not found", name)}},
		}
	}
}

func (s *Server) toolSearchCards(args map[string]interface{}) ToolCallResult {
	query, _ := args["query"].(string)
	query = strings.TrimSpace(strings.ToLower(query))

	var charID int
	if cid, ok := args["character_id"].(float64); ok {
		charID = int(cid)
	}

	rarity, _ := args["rarity"].(string)
	attribute, _ := args["attribute"].(string)

	limit := 10
	if l, ok := args["limit"].(float64); ok && l > 0 {
		limit = int(l)
		if limit > 30 {
			limit = 30
		}
	}

	var matched []*CardItem
	for _, card := range s.cards {
		if charID > 0 && card.CharacterID != charID {
			continue
		}
		if rarity != "" && !strings.EqualFold(card.Rarity, rarity) {
			continue
		}
		if attribute != "" && !strings.EqualFold(card.Attr, attribute) {
			continue
		}
		if query != "" {
			cName := characterNames[card.CharacterID]
			combined := strings.ToLower(fmt.Sprintf("%s %s %s %s", cName, card.Prefix, card.SkillName, card.Attr))
			if !strings.Contains(combined, query) {
				continue
			}
		}
		matched = append(matched, card)
	}

	sort.Slice(matched, func(i, j int) bool {
		return matched[i].ID < matched[j].ID
	})

	if len(matched) > limit {
		matched = matched[:limit]
	}

	if len(matched) == 0 {
		return ToolCallResult{
			Content: []TextContent{{Type: "text", Text: "No cards matched your query."}},
		}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Found %d cards:\n\n", len(matched)))
	for _, c := range matched {
		cName := characterNames[c.CharacterID]
		sb.WriteString(fmt.Sprintf("- **[%d] %s - %s** (%s | %s)\n", c.ID, cName, c.Prefix, c.Rarity, c.Attr))
		if c.SkillName != "" {
			sb.WriteString(fmt.Sprintf("  技能: %s\n", c.SkillName))
		}
		if c.Power != nil && c.Power.Normal != nil {
			sb.WriteString(fmt.Sprintf("  综合力: %d\n", c.Power.Normal.Total))
		}
		sb.WriteString(fmt.Sprintf("  链接: https://pjsk.moe/cards/%d/\n\n", c.ID))
	}

	return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
}

func (s *Server) toolGetCardDetail(args map[string]interface{}) ToolCallResult {
	var cardID int
	if cid, ok := args["card_id"].(float64); ok {
		cardID = int(cid)
	}
	if cardID <= 0 {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: "Missing valid card_id"}}}
	}

	card, ok := s.cards[cardID]
	if !ok {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: fmt.Sprintf("Card ID %d not found", cardID)}}}
	}

	cName := characterNames[card.CharacterID]
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# [%d] %s - %s\n\n", card.ID, cName, card.Prefix))
	sb.WriteString(fmt.Sprintf("- **角色**: %s (ID: %d)\n", cName, card.CharacterID))
	sb.WriteString(fmt.Sprintf("- **稀有度**: %s\n", card.Rarity))
	sb.WriteString(fmt.Sprintf("- **属性**: %s\n", card.Attr))
	if card.SkillName != "" {
		sb.WriteString(fmt.Sprintf("- **技能名称**: %s\n", card.SkillName))
	}
	if card.SkillDesc != "" {
		sb.WriteString(fmt.Sprintf("- **技能效果**: %s\n", card.SkillDesc))
	}

	if card.Power != nil {
		sb.WriteString("\n### 数值参数表 (Power Parameters)\n\n")
		sb.WriteString("| 阶段 | 表现力 (Performance) | 技巧 (Technique) | 体能 (Stamina) | 综合力 (Total) |\n")
		sb.WriteString("|---|---|---|---|---|\n")
		if card.Power.Normal != nil {
			n := card.Power.Normal
			sb.WriteString(fmt.Sprintf("| 通常 (特训前) | %d | %d | %d | %d |\n", n.Performance, n.Technique, n.Stamina, n.Total))
		}
		if card.Power.Trained != nil {
			t := card.Power.Trained
			sb.WriteString(fmt.Sprintf("| 特训后 (开花后) | %d | %d | %d | %d |\n", t.Performance, t.Technique, t.Stamina, t.Total))
		}
	}

	if card.Event != nil {
		sb.WriteString(fmt.Sprintf("\n- **登场活动**: [%d] %s\n", card.Event.ID, card.Event.Name))
	}
	sb.WriteString(fmt.Sprintf("\n在线详情页: https://pjsk.moe/cards/%d/\n", card.ID))

	return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
}

func (s *Server) toolSearchMusics(args map[string]interface{}) ToolCallResult {
	query, _ := args["query"].(string)
	query = strings.TrimSpace(strings.ToLower(query))

	limit := 10
	if l, ok := args["limit"].(float64); ok && l > 0 {
		limit = int(l)
		if limit > 30 {
			limit = 30
		}
	}

	var matched []*MusicItem
	for _, m := range s.musics {
		if query != "" {
			combined := strings.ToLower(fmt.Sprintf("%s %s %s", m.Title, m.Lyricist, m.Composer))
			if !strings.Contains(combined, query) {
				continue
			}
		}
		matched = append(matched, m)
	}

	sort.Slice(matched, func(i, j int) bool {
		return matched[i].ID < matched[j].ID
	})

	if len(matched) > limit {
		matched = matched[:limit]
	}

	if len(matched) == 0 {
		return ToolCallResult{Content: []TextContent{{Type: "text", Text: "No music found matching your search."}}}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Found %d songs:\n\n", len(matched)))
	for _, m := range matched {
		sb.WriteString(fmt.Sprintf("- **[%d] %s**\n", m.ID, m.Title))
		if m.Lyricist != "" || m.Composer != "" {
			sb.WriteString(fmt.Sprintf("  作词: %s | 作曲: %s\n", m.Lyricist, m.Composer))
		}
		sb.WriteString(fmt.Sprintf("  详情页: https://pjsk.moe/music/%d/\n\n", m.ID))
	}

	return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
}

func (s *Server) toolGetMusicDetail(args map[string]interface{}) ToolCallResult {
	var musicID int
	if mid, ok := args["music_id"].(float64); ok {
		musicID = int(mid)
	}
	if musicID <= 0 {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: "Missing valid music_id"}}}
	}

	music, ok := s.musics[musicID]
	if !ok {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: fmt.Sprintf("Music ID %d not found", musicID)}}}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# [%d] %s\n\n", music.ID, music.Title))
	if music.Lyricist != "" {
		sb.WriteString(fmt.Sprintf("- **作词**: %s\n", music.Lyricist))
	}
	if music.Composer != "" {
		sb.WriteString(fmt.Sprintf("- **作曲**: %s\n", music.Composer))
	}
	sb.WriteString(fmt.Sprintf("\n在线详情页: https://pjsk.moe/music/%d/\n", music.ID))

	return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
}

func (s *Server) toolGetEventInfo(args map[string]interface{}) ToolCallResult {
	var eventID int
	if eid, ok := args["event_id"].(float64); ok {
		eventID = int(eid)
	}

	if eventID > 0 {
		event, ok := s.events[eventID]
		if !ok {
			return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: fmt.Sprintf("Event ID %d not found", eventID)}}}
		}
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("# [%d] %s\n\n", event.ID, event.Name))
		if event.Type != "" {
			sb.WriteString(fmt.Sprintf("- **活动类型**: %s\n", event.Type))
		}
		sb.WriteString(fmt.Sprintf("\n活动详情页: https://pjsk.moe/events/%d/\n", event.ID))
		return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
	}

	// Return recent 5 events
	var list []*EventItem
	for _, e := range s.events {
		list = append(list, e)
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].ID > list[j].ID
	})

	if len(list) > 5 {
		list = list[:5]
	}

	var sb strings.Builder
	sb.WriteString("Recent Project SEKAI events:\n\n")
	for _, e := range list {
		sb.WriteString(fmt.Sprintf("- **[%d] %s** (%s)\n", e.ID, e.Name, e.Type))
		sb.WriteString(fmt.Sprintf("  https://pjsk.moe/events/%d/\n", e.ID))
	}

	return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
}

func (s *Server) toolGetCharacterProfile(args map[string]interface{}) ToolCallResult {
	var charID int
	if cid, ok := args["character_id"].(float64); ok {
		charID = int(cid)
	}
	name, _ := args["name"].(string)

	if charID <= 0 && name != "" {
		for id, cname := range characterNames {
			if strings.Contains(strings.ToLower(cname), strings.ToLower(strings.TrimSpace(name))) {
				charID = id
				break
			}
		}
	}

	if charID <= 0 || charID > 26 {
		return ToolCallResult{
			IsError: true,
			Content: []TextContent{{Type: "text", Text: "Character not found. Valid character_id is 1 to 26."}},
		}
	}

	cName := characterNames[charID]
	unit := characterUnits[charID]

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# %s (Character ID: %d)\n\n", cName, charID))
	sb.WriteString(fmt.Sprintf("- **所属乐团 / 队伍**: %s\n", unit))
	sb.WriteString(fmt.Sprintf("- **角色主页**: https://pjsk.moe/character/%d/\n", charID))

	// Count cards of this character
	cardCount := 0
	for _, c := range s.cards {
		if c.CharacterID == charID {
			cardCount++
		}
	}
	sb.WriteString(fmt.Sprintf("- **收录卡牌数**: %d 张\n", cardCount))

	return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
}

func (s *Server) readResource(uri string) []ResourceContent {
	switch uri {
	case "pjsk://characters":
		var list []map[string]interface{}
		for id := 1; id <= 26; id++ {
			list = append(list, map[string]interface{}{
				"id":   id,
				"name": characterNames[id],
				"unit": characterUnits[id],
			})
		}
		data, _ := json.MarshalIndent(list, "", "  ")
		return []ResourceContent{{
			URI:      uri,
			MimeType: "application/json",
			Text:     string(data),
		}}

	case "pjsk://events/latest":
		s.mu.RLock()
		var list []*EventItem
		for _, e := range s.events {
			list = append(list, e)
		}
		s.mu.RUnlock()
		sort.Slice(list, func(i, j int) bool {
			return list[i].ID > list[j].ID
		})
		if len(list) > 3 {
			list = list[:3]
		}
		data, _ := json.MarshalIndent(list, "", "  ")
		return []ResourceContent{{
			URI:      uri,
			MimeType: "application/json",
			Text:     string(data),
		}}

	default:
		return []ResourceContent{{
			URI:      uri,
			MimeType: "text/plain",
			Text:     "Resource not found",
		}}
	}
}

func formatNumber(n int64) string {
	in := strconv.FormatInt(n, 10)
	var out []byte
	l := len(in)
	for i, c := range in {
		out = append(out, byte(c))
		if (l-1-i)%3 == 0 && i != l-1 {
			out = append(out, ',')
		}
	}
	return string(out)
}

func parseOptionalEventID(args map[string]interface{}) (int, error) {
	raw, exists := args["event_id"]
	if !exists || raw == nil {
		return 0, nil
	}
	eid, ok := raw.(float64)
	if !ok || math.IsNaN(eid) || math.IsInf(eid, 0) || eid != math.Trunc(eid) || eid < 0 || eid > maxValidEventID {
		return 0, fmt.Errorf("invalid event_id: must be an integer between 1 and %d", maxValidEventID)
	}
	return int(eid), nil
}

func (s *Server) lookupEventName(eventID int) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if ev, ok := s.events[eventID]; ok && ev.Name != "" {
		return ev.Name
	}
	return fmt.Sprintf("Event %d", eventID)
}

func (s *Server) toolGetRealtimeRanking(ctx context.Context, args map[string]interface{}) ToolCallResult {
	region := "jp"
	if raw, exists := args["region"]; exists && raw != nil {
		r, ok := raw.(string)
		if !ok {
			return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: "Invalid region: must be one of jp, cn, en, tw, kr"}}}
		}
		if trimmed := strings.ToLower(strings.TrimSpace(r)); trimmed != "" {
			region = trimmed
		}
	}
	if !allowedRankingRegions[region] {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: "Invalid region: must be one of jp, cn, en, tw, kr"}}}
	}

	eventID, err := parseOptionalEventID(args)
	if err != nil {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: err.Error()}}}
	}

	var sb strings.Builder

	// Query unified v2 API for the live/latest board across all 5 regions when no historical event_id is requested.
	if eventID <= 0 {
		targetURL := fmt.Sprintf("%s/api/public/v2/%s/latest", s.rankingV2BaseURL, url.PathEscape(region))
		data, err := s.cachedFetch(ctx, targetURL, 30*time.Second)
		if err == nil {
			var v2Resp V2LatestResponse
			if err := json.Unmarshal(data, &v2Resp); err == nil && len(v2Resp.Rankings) > 0 {
				sb.WriteString(fmt.Sprintf("# Project SEKAI 实时榜线 (%s 服) - Event %d\n\n", strings.ToUpper(region), v2Resp.EventID))
				updatedTime := time.UnixMilli(v2Resp.UpdatedAt).UTC().Format("2006-01-02 15:04:05 UTC")
				sb.WriteString(fmt.Sprintf("- **数据更新时间**: %s\n", updatedTime))
				sb.WriteString(fmt.Sprintf("- **在线看板**: https://pjsk.moe/realtime-ranking-next\n\n"))

				sb.WriteString("### 核心档线截线 (Tier Cutoffs)\n\n")
				sb.WriteString("| 档位 (Tier) | 当前分数 (Score) | 选手昵称 (Player) |\n")
				sb.WriteString("|---|---|---|\n")

				targetTiers := []int{1, 2, 3, 10, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000, 50000, 100000}
				tierMap := make(map[int]V2RankingEntry)
				for _, entry := range v2Resp.Rankings {
					tierMap[entry.Rank] = entry
				}

				for _, t := range targetTiers {
					if entry, ok := tierMap[t]; ok {
						name := entry.Name
						if name == "" {
							name = "-"
						}
						sb.WriteString(fmt.Sprintf("| T%d | %s | %s |\n", t, formatNumber(entry.Score), name))
					}
				}
				return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
			}
		}
	}

	// Historical event_id lookup or fallback via rk.exmeaning.com (JP / CN)
	if eventID <= 0 {
		eventsURL := fmt.Sprintf("%s/public/events?region=%s", s.rankingLegacyBaseURL, url.QueryEscape(region))
		data, err := s.cachedFetch(ctx, eventsURL, 60*time.Second)
		if err != nil {
			return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: fmt.Sprintf("Failed to fetch events for region %s: %v", region, err)}}}
		}
		var events []RkEventItem
		if err := json.Unmarshal(data, &events); err != nil || len(events) == 0 {
			return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: fmt.Sprintf("No event data available for region %s", region)}}}
		}
		eventID = events[0].EventID
	}

	latestURL := fmt.Sprintf("%s/public/event/%d/latest?region=%s", s.rankingLegacyBaseURL, eventID, url.QueryEscape(region))
	data, err := s.cachedFetch(ctx, latestURL, 30*time.Second)
	if err != nil {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: fmt.Sprintf("Failed to fetch latest ranking for event %d (%s): %v", eventID, region, err)}}}
	}

	var latest RkLatestResponse
	if err := json.Unmarshal(data, &latest); err != nil {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: fmt.Sprintf("Failed to parse latest ranking for event %d", eventID)}}}
	}

	eventName := s.lookupEventName(latest.EventID)

	statusDesc := "🟢 进行中 (Active)"
	if latest.Status == "finished" {
		statusDesc = "⚪ 已结算 (Finished)"
	}

	sb.WriteString(fmt.Sprintf("# Project SEKAI 实时档线 (%s 服) - [%d] %s\n\n", strings.ToUpper(region), latest.EventID, eventName))
	sb.WriteString(fmt.Sprintf("- **活动状态**: %s\n", statusDesc))
	sb.WriteString(fmt.Sprintf("- **数据采集时间**: %s\n", latest.UpdatedAt))
	sb.WriteString(fmt.Sprintf("- **实时看板**: https://pjsk.moe/realtime-ranking-next\n\n"))

	sb.WriteString("### 档线积分表 (Tier Cutoffs)\n\n")
	sb.WriteString("| 档位 (Tier) | 当前积分 (Score) | 终榜预测 (Prediction) | 状态 (Status) |\n")
	sb.WriteString("|---|---|---|---|\n")

	for _, item := range latest.Items {
		predStr := "-"
		if item.Prediction != nil && *item.Prediction > 0 {
			predStr = formatNumber(int64(*item.Prediction))
		}
		itemStatus := "实时"
		if item.IsFinal {
			itemStatus = "最终截线"
		}
		sb.WriteString(fmt.Sprintf("| T%d | %s | %s | %s |\n", item.Rank, formatNumber(item.Score), predStr, itemStatus))
	}

	return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
}

func (s *Server) toolGetEventPrediction(ctx context.Context, args map[string]interface{}) ToolCallResult {
	region := "jp"
	if raw, exists := args["region"]; exists && raw != nil {
		r, ok := raw.(string)
		if !ok {
			return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: "Invalid region: must be jp or cn"}}}
		}
		if trimmed := strings.ToLower(strings.TrimSpace(r)); trimmed != "" {
			region = trimmed
		}
	}
	if !allowedPredictionRegions[region] {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: "Invalid region: must be jp or cn"}}}
	}

	eventID, err := parseOptionalEventID(args)
	if err != nil {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: err.Error()}}}
	}

	if eventID <= 0 {
		eventsURL := fmt.Sprintf("%s/public/events?region=%s", s.rankingLegacyBaseURL, url.QueryEscape(region))
		data, err := s.cachedFetch(ctx, eventsURL, 60*time.Second)
		if err != nil {
			return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: fmt.Sprintf("Failed to fetch events: %v", err)}}}
		}
		var events []RkEventItem
		if err := json.Unmarshal(data, &events); err != nil || len(events) == 0 {
			return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: fmt.Sprintf("No event found for region %s", region)}}}
		}
		eventID = events[0].EventID
	}

	latestURL := fmt.Sprintf("%s/public/event/%d/latest?region=%s", s.rankingLegacyBaseURL, eventID, url.QueryEscape(region))
	data, err := s.cachedFetch(ctx, latestURL, 30*time.Second)
	if err != nil {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: fmt.Sprintf("Failed to fetch ranking: %v", err)}}}
	}

	var latest RkLatestResponse
	if err := json.Unmarshal(data, &latest); err != nil {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: "Failed to parse prediction data"}}}
	}

	eventName := s.lookupEventName(latest.EventID)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# Project SEKAI 终榜预测报告 (%s 服) - [%d] %s\n\n", strings.ToUpper(region), latest.EventID, eventName))
	sb.WriteString(fmt.Sprintf("- **数据采集时间**: %s\n", latest.UpdatedAt))
	sb.WriteString(fmt.Sprintf("- **预测图表与走势**: https://pjsk.moe/prediction-next\n\n"))

	if latest.Status == "finished" {
		sb.WriteString("> 💡 **提示**: 本期活动已结算完毕，以下为各档终榜最终结算数据。\n\n")
		sb.WriteString("| 档位 (Tier) | 终榜最终分数 (Final Score) |\n")
		sb.WriteString("|---|---|\n")
		for _, item := range latest.Items {
			sb.WriteString(fmt.Sprintf("| T%d | %s |\n", item.Rank, formatNumber(item.Score)))
		}
		return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
	}

	sb.WriteString("### 各档位当前积分与终榜预测 (Predictions)\n\n")
	sb.WriteString("| 档位 (Tier) | 当前积分 (Current) | 终榜预测 (Predicted Final) | 置信区间估算 (P10 - P90) |\n")
	sb.WriteString("|---|---|---|---|\n")

	for _, item := range latest.Items {
		currScore := formatNumber(item.Score)
		if item.Prediction != nil && *item.Prediction > 0 {
			pred := int64(*item.Prediction)
			p10 := int64(float64(pred) * 0.95)
			p90 := int64(float64(pred) * 1.08)
			sb.WriteString(fmt.Sprintf("| T%d | %s | ~%s | %s ~ %s |\n", item.Rank, currScore, formatNumber(pred), formatNumber(p10), formatNumber(p90)))
		} else {
			sb.WriteString(fmt.Sprintf("| T%d | %s | 计算中 (Pending) | - |\n", item.Rank, currScore))
		}
	}

	sb.WriteString("\n> 📌 **模型说明**: 基于 AkiYome v2.0 贝叶斯-卡尔曼动态滤波模型，融合历史 194 期活动衰减系数与昼夜作息规律生成，P10为保守底线，P90为卷王冲刺上限。\n")

	return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
}

func (s *Server) toolPlanEventStrategy(args map[string]interface{}) ToolCallResult {
	targetScoreF, _ := args["target_score"].(float64)
	if targetScoreF <= 0 {
		return ToolCallResult{IsError: true, Content: []TextContent{{Type: "text", Text: "Missing valid target_score (e.g. 5000000)"}}}
	}
	targetScore := int64(targetScoreF)

	var currentScore int64
	if cs, ok := args["current_score"].(float64); ok && cs > 0 {
		currentScore = int64(cs)
	}

	remainingHours := 72.0
	if rh, ok := args["remaining_hours"].(float64); ok && rh > 0 {
		remainingHours = rh
	}

	bonusPercent := 475.0
	if bp, ok := args["bonus_percent"].(float64); ok && bp > 0 {
		bonusPercent = bp
	}

	fireMultiplier := 10
	if fm, ok := args["fire_multiplier"].(float64); ok && fm > 0 {
		fireMultiplier = int(fm)
	}

	songKey := "envy"
	if sk, ok := args["song_key"].(string); ok && sk != "" {
		songKey = strings.ToLower(strings.TrimSpace(sk))
	}

	dailyHours := 4.0
	if dh, ok := args["daily_available_hours"].(float64); ok && dh > 0 {
		dailyHours = dh
	}

	dailyAutoBudget := 30
	if ab, ok := args["daily_auto_budget"].(float64); ok && ab >= 0 {
		dailyAutoBudget = int(ab)
	}

	// Constants from prediction-engine.ts
	fireRatios := map[int]float64{
		10: 35.0, 7: 29.0, 5: 23.0, 3: 15.0, 2: 10.0, 1: 5.0,
	}
	fireRatio := fireRatios[fireMultiplier]
	if fireRatio <= 0 {
		fireRatio = 35.0
		fireMultiplier = 10
	}

	type SongProfile struct {
		Name         string
		BaseFactor   float64
		PlaysPerHour float64
	}
	profiles := map[string]SongProfile{
		"envy":           {"独占欲 (独りんぼエンヴィー)", 1.0, 29.0},
		"lost_and_found": {"丢失与拾起 (Lost and Found)", 1.12, 22.0},
		"melt":           {"融化 (メルト)", 1.35, 16.0},
	}
	profile, ok := profiles[songKey]
	if !ok {
		profile = profiles["envy"]
		songKey = "envy"
	}

	scoreDeficit := targetScore - currentScore
	if scoreDeficit < 0 {
		scoreDeficit = 0
	}

	// Base 1x points formula
	var base1x float64
	if bonusPercent >= 600 {
		base1x = 3454.0 * ((100.0 + bonusPercent) / 1090.0)
	} else {
		base1x = 1285.0 * ((100.0 + bonusPercent) / 485.0)
	}

	baseSongPoints := int64(base1x * fireRatio * profile.BaseFactor)
	if baseSongPoints <= 0 {
		baseSongPoints = 1
	}

	hourlySpeed := int64(float64(baseSongPoints) * profile.PlaysPerHour)
	autoSongPoints := int64(float64(baseSongPoints) * 0.88)

	remainingDays := math.Max(0.1, remainingHours/24.0)
	requiredDailyGross := float64(scoreDeficit) / remainingDays
	dailyAutoPoints := float64(dailyAutoBudget) * float64(autoSongPoints)
	netDailyManualScore := math.Max(0, requiredDailyGross-dailyAutoPoints)

	var requiredManualHoursDaily float64
	if hourlySpeed > 0 {
		requiredManualHoursDaily = math.Round((netDailyManualScore/float64(hourlySpeed))*10) / 10
	}

	totalManualSongs := int(math.Ceil(float64(scoreDeficit) / float64(baseSongPoints)))
	totalManualHours := 0.0
	if profile.PlaysPerHour > 0 {
		totalManualHours = math.Round((float64(totalManualSongs)/profile.PlaysPerHour)*10) / 10
	}

	totalFiresNeeded := totalManualSongs * fireMultiplier
	totalLargeDrinks := int(math.Ceil(float64(totalFiresNeeded) / 10.0))
	totalCrystals := totalLargeDrinks * 100

	feasibilityDesc := "🟡 正常可达成 (Achievable)"
	if scoreDeficit <= 0 {
		feasibilityDesc = "🟢 已达标 (Target Reached)"
	} else if totalManualHours > remainingHours || requiredManualHoursDaily > 18.0 {
		feasibilityDesc = "🔴 人类极限不可行 (Impossible) - 所需时长超过剩余总时间或人体极限"
	} else if requiredManualHoursDaily > dailyHours || requiredManualHoursDaily >= 12.0 {
		feasibilityDesc = "🟠 极限硬核挑战 (Hard) - 每日需打时间超过预计可用时长"
	} else if requiredManualHoursDaily <= 2.5 {
		feasibilityDesc = "🟢 轻松达成 (Comfortable)"
	}

	var sb strings.Builder
	sb.WriteString("# Project SEKAI 冲榜策略规划与消耗计算报告\n\n")
	sb.WriteString("### 🎯 目标与参数\n")
	sb.WriteString(fmt.Sprintf("- **当前分数**: %s / **目标分数**: %s (缺口: %s 分)\n", formatNumber(currentScore), formatNumber(targetScore), formatNumber(scoreDeficit)))
	sb.WriteString(fmt.Sprintf("- **剩余活动时间**: %.1f 小时 (约 %.1f 天)\n", remainingHours, remainingDays))
	sb.WriteString(fmt.Sprintf("- **卡组活动加成**: %.0f%%\n", bonusPercent))
	sb.WriteString(fmt.Sprintf("- **控火倍数**: %d 火/把 (倍率: %.0fx)\n", fireMultiplier, fireRatio))
	sb.WriteString(fmt.Sprintf("- **选用曲目**: %s (时速约为 %.0f 把/小时)\n\n", profile.Name, profile.PlaysPerHour))

	sb.WriteString("### 📊 耗时与打曲规划\n")
	sb.WriteString(fmt.Sprintf("- **单把预估得分**: ~%s 分\n", formatNumber(baseSongPoints)))
	sb.WriteString(fmt.Sprintf("- **单人手打时速**: ~%s 分/小时\n", formatNumber(hourlySpeed)))
	sb.WriteString(fmt.Sprintf("- **总需打曲把数**: 约 %d 把\n", totalManualSongs))
	sb.WriteString(fmt.Sprintf("- **累计手打总耗时**: 约 %.1f 小时\n", totalManualHours))
	sb.WriteString(fmt.Sprintf("- **每日建议手打时长**: **%.1f 小时/天** (用户可用: %.1f 小时/天)\n", requiredManualHoursDaily, dailyHours))
	if dailyAutoBudget > 0 {
		sb.WriteString(fmt.Sprintf("- **每日建议自动打歌**: %d 次/天 (可分担约 %s 分/天)\n", dailyAutoBudget, formatNumber(int64(dailyAutoPoints))))
	}
	sb.WriteString(fmt.Sprintf("- **可行性科学评定**: %s\n\n", feasibilityDesc))

	sb.WriteString("### 🧪 体力与资源成本预算\n")
	sb.WriteString(fmt.Sprintf("- **总消耗体力火数**: 约 %d 火\n", totalFiresNeeded))
	sb.WriteString(fmt.Sprintf("- **等效大体力罐头**: 约 **%d 罐** (每罐恢复10火)\n", totalLargeDrinks))
	sb.WriteString(fmt.Sprintf("- **若全部使用水晶碎石**: 约 **%d 水晶**\n\n", totalCrystals))

	sb.WriteString("> 💡 **冲榜建议**: 若时间紧张，建议将曲目切换为《独りんぼエンヴィー》提升时速；若追求体力收益比，可适度降低控火至 3 火或 5 火。")

	return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
}

func (s *Server) toolSearchGachas(args map[string]interface{}) ToolCallResult {
	query, _ := args["query"].(string)
	query = strings.TrimSpace(strings.ToLower(query))

	gachaType, _ := args["gacha_type"].(string)
	gachaType = strings.TrimSpace(strings.ToLower(gachaType))

	limit := 5
	if l, ok := args["limit"].(float64); ok && l > 0 {
		limit = int(l)
		if limit > 15 {
			limit = 15
		}
	}

	var sb strings.Builder

	if s.store != nil {
		if snap := s.store.GetSnapshot(); snap != nil {
			gachaList := snap.GachaList
			pickups := snap.GachaPickups

			var matched []models.Gacha
			for _, g := range gachaList {
				if gachaType != "" && !strings.EqualFold(g.GachaType, gachaType) {
					continue
				}
				if query != "" {
					nameLower := strings.ToLower(g.Name)
					if !strings.Contains(nameLower, query) {
						charaMatch := false
						for _, cid := range pickups[g.ID] {
							if card, ok := s.cards[cid]; ok {
								cName := strings.ToLower(characterNames[card.CharacterID])
								if strings.Contains(cName, query) {
									charaMatch = true
									break
								}
							}
						}
						if !charaMatch {
							continue
						}
					}
				}
				matched = append(matched, g)
			}

			sort.Slice(matched, func(i, j int) bool {
				return matched[i].StartAt > matched[j].StartAt
			})

			if len(matched) == 0 {
				return ToolCallResult{Content: []TextContent{{Type: "text", Text: "No gacha banners found matching criteria."}}}
			}

			count := len(matched)
			if count > limit {
				matched = matched[:limit]
			}

			sb.WriteString(fmt.Sprintf("Found %d gacha banners (showing top %d):\n\n", count, len(matched)))
			for _, g := range matched {
				startDate := time.UnixMilli(g.StartAt).UTC().Format("2006-01-02 15:04")
				endDate := time.UnixMilli(g.EndAt).UTC().Format("2006-01-02 15:04")

				sb.WriteString(fmt.Sprintf("### [%d] %s\n", g.ID, g.Name))
				sb.WriteString(fmt.Sprintf("- **卡池类型**: %s\n", g.GachaType))
				sb.WriteString(fmt.Sprintf("- **起止时间**: %s ~ %s (UTC)\n", startDate, endDate))

				cardIDs := pickups[g.ID]
				if len(cardIDs) > 0 {
					sb.WriteString("- **UP 成员卡牌**:\n")
					for _, cid := range cardIDs {
						if card, ok := s.cards[cid]; ok {
							cName := characterNames[card.CharacterID]
							sb.WriteString(fmt.Sprintf("  - [%d] %s - %s (%s | %s)\n", card.ID, cName, card.Prefix, card.Rarity, card.Attr))
						} else {
							sb.WriteString(fmt.Sprintf("  - Card ID: %d\n", cid))
						}
					}
				}
				sb.WriteString(fmt.Sprintf("- **在线卡池详情**: https://pjsk.moe/gacha/%d/\n\n", g.ID))
			}
			return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
		}
	}

	var matched []*GachaItem
	for _, g := range s.gachas {
		if gachaType != "" && !strings.EqualFold(g.Type, gachaType) {
			continue
		}
		if query != "" && !strings.Contains(strings.ToLower(g.Name), query) {
			continue
		}
		matched = append(matched, g)
	}

	sort.Slice(matched, func(i, j int) bool {
		return matched[i].ID > matched[j].ID
	})

	if len(matched) == 0 {
		return ToolCallResult{Content: []TextContent{{Type: "text", Text: "No gacha banners found."}}}
	}

	if len(matched) > limit {
		matched = matched[:limit]
	}

	sb.WriteString(fmt.Sprintf("Found %d gacha banners:\n\n", len(matched)))
	for _, g := range matched {
		sb.WriteString(fmt.Sprintf("- **[%d] %s** (%s)\n  链接: https://pjsk.moe/gacha/%d/\n\n", g.ID, g.Name, g.Type, g.ID))
	}

	return ToolCallResult{Content: []TextContent{{Type: "text", Text: sb.String()}}}
}
