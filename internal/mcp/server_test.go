package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"snowy_viewer/internal/middleware"
)

func TestMCPServerHandshakeAndTools(t *testing.T) {
	s := New()

	// 1. GET /api/mcp
	reqGet := httptest.NewRequest(http.MethodGet, "/api/mcp", nil)
	rrGet := httptest.NewRecorder()
	s.ServeHTTP(rrGet, reqGet)
	if rrGet.Code != http.StatusOK {
		t.Fatalf("GET /api/mcp returned %d, want 200", rrGet.Code)
	}

	// 2. POST initialize
	initReq := Request{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "initialize",
	}
	body, _ := json.Marshal(initReq)
	reqPost := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewReader(body))
	rrPost := httptest.NewRecorder()
	s.ServeHTTP(rrPost, reqPost)
	if rrPost.Code != http.StatusOK {
		t.Fatalf("POST initialize returned %d, want 200", rrPost.Code)
	}

	var initRes Response
	if err := json.Unmarshal(rrPost.Body.Bytes(), &initRes); err != nil {
		t.Fatalf("Failed to parse initialize response: %v", err)
	}
	if initRes.Error != nil {
		t.Fatalf("initialize returned RPC error: %v", initRes.Error)
	}

	// 3. POST tools/list
	toolsReq := Request{
		JSONRPC: "2.0",
		ID:      2,
		Method:  "tools/list",
	}
	toolsBody, _ := json.Marshal(toolsReq)
	reqTools := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewReader(toolsBody))
	rrTools := httptest.NewRecorder()
	s.ServeHTTP(rrTools, reqTools)
	if rrTools.Code != http.StatusOK {
		t.Fatalf("POST tools/list returned %d, want 200", rrTools.Code)
	}

	var toolsRes Response
	if err := json.Unmarshal(rrTools.Body.Bytes(), &toolsRes); err != nil {
		t.Fatalf("Failed to parse tools/list response: %v", err)
	}
	if toolsRes.Error != nil {
		t.Fatalf("tools/list returned error: %v", toolsRes.Error)
	}

	// 4. POST tools/call (get_character_profile)
	callParams, _ := json.Marshal(map[string]interface{}{
		"name": "get_character_profile",
		"arguments": map[string]interface{}{
			"character_id": 21,
		},
	})
	callReq := Request{
		JSONRPC: "2.0",
		ID:      3,
		Method:  "tools/call",
		Params:  callParams,
	}
	callBody, _ := json.Marshal(callReq)
	reqCall := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewReader(callBody))
	rrCall := httptest.NewRecorder()
	s.ServeHTTP(rrCall, reqCall)
	if rrCall.Code != http.StatusOK {
		t.Fatalf("POST tools/call returned %d, want 200", rrCall.Code)
	}

	var callRes Response
	if err := json.Unmarshal(rrCall.Body.Bytes(), &callRes); err != nil {
		t.Fatalf("Failed to parse tools/call response: %v", err)
	}
	if callRes.Error != nil {
		t.Fatalf("tools/call returned error: %v", callRes.Error)
	}

	// 5. POST resources/list
	resReq := Request{
		JSONRPC: "2.0",
		ID:      4,
		Method:  "resources/list",
	}
	resBody, _ := json.Marshal(resReq)
	reqRes := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewReader(resBody))
	rrRes := httptest.NewRecorder()
	s.ServeHTTP(rrRes, reqRes)
	if rrRes.Code != http.StatusOK {
		t.Fatalf("POST resources/list returned %d, want 200", rrRes.Code)
	}
}

func TestMCPExpandedTools(t *testing.T) {
	s := New()

	// 1. plan_event_strategy
	res := s.executeTool("plan_event_strategy", map[string]interface{}{
		"target_score":          float64(5000000),
		"current_score":         float64(1000000),
		"remaining_hours":       float64(48.0),
		"bonus_percent":         float64(475.0),
		"fire_multiplier":       float64(10),
		"song_key":              "envy",
		"daily_available_hours": float64(5.0),
	})
	if res.IsError {
		t.Fatalf("plan_event_strategy returned error: %v", res.Content)
	}
	if len(res.Content) == 0 || !strings.Contains(res.Content[0].Text, "冲榜策略规划") {
		t.Fatalf("Unexpected plan_event_strategy output: %v", res.Content)
	}

	// 2. search_gachas
	gachaRes := s.executeTool("search_gachas", map[string]interface{}{
		"limit": float64(5),
	})
	if gachaRes.IsError {
		t.Fatalf("search_gachas returned error: %v", gachaRes.Content)
	}

	// 3. get_realtime_ranking
	rankingRes := s.executeTool("get_realtime_ranking", map[string]interface{}{
		"region":   "jp",
		"event_id": float64(215),
	})
	if len(rankingRes.Content) == 0 {
		t.Fatalf("get_realtime_ranking returned empty content")
	}

	// 4. get_event_prediction
	predRes := s.executeTool("get_event_prediction", map[string]interface{}{
		"region":   "jp",
		"event_id": float64(215),
	})
	if len(predRes.Content) == 0 {
		t.Fatalf("get_event_prediction returned empty content")
	}
}

func TestMCPRejectsInvalidRegionAndEventIDWithoutUpstreamCalls(t *testing.T) {
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer upstream.Close()

	s := New()
	s.rankingV2BaseURL = upstream.URL
	s.rankingLegacyBaseURL = upstream.URL

	badRankingArgs := []map[string]interface{}{
		{"region": "jp&nonce=1"},
		{"region": "../admin"},
		{"region": "invalid"},
		{"region": "jp", "event_id": float64(-5)},
		{"region": "jp", "event_id": float64(999999)},
		{"region": "jp", "event_id": float64(12.5)},
	}
	for _, args := range badRankingArgs {
		res := s.executeTool("get_realtime_ranking", args)
		if !res.IsError {
			t.Fatalf("get_realtime_ranking(%v) unexpectedly succeeded", args)
		}
	}

	badPredArgs := []map[string]interface{}{
		{"region": "en"},
		{"region": "jp&x=1"},
		{"region": "cn", "event_id": float64(maxValidEventID + 1)},
	}
	for _, args := range badPredArgs {
		res := s.executeTool("get_event_prediction", args)
		if !res.IsError {
			t.Fatalf("get_event_prediction(%v) unexpectedly succeeded", args)
		}
	}
	if hits.Load() != 0 {
		t.Fatalf("invalid arguments triggered %d upstream HTTP requests, want 0", hits.Load())
	}
}

func TestMCPBodyCapRateLimitSingleflightAndBoundedCache(t *testing.T) {
	// 1. Oversized POST body -> 413
	s := New()
	oversized := `{"jsonrpc":"2.0","id":1,"method":"ping","params":"` + strings.Repeat("a", int(maxMCPRequestBytes)+1024) + `"}`
	reqBig := httptest.NewRequest(http.MethodPost, "/api/mcp", strings.NewReader(oversized))
	rrBig := httptest.NewRecorder()
	s.ServeHTTP(rrBig, reqBig)
	if rrBig.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized body status = %d, want 413", rrBig.Code)
	}

	// 2. Singleflight coalesces concurrent identical fetches + bounded apiCache cap
	var upstreamHits atomic.Int32
	gate := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/slow" {
			upstreamHits.Add(1)
			<-gate
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			data, err := s.cachedFetch(context.Background(), upstream.URL+"/slow", time.Minute)
			if err != nil || string(data) != `{"ok":true}` {
				t.Errorf("cachedFetch failed: data=%q err=%v", data, err)
			}
		}()
	}
	time.Sleep(30 * time.Millisecond)
	close(gate)
	wg.Wait()
	if upstreamHits.Load() != 1 {
		t.Fatalf("singleflight upstream hits = %d, want 1", upstreamHits.Load())
	}

	// Fill cache past maxAPICacheEntries and verify cap holds.
	for i := 0; i < maxAPICacheEntries+40; i++ {
		_, err := s.cachedFetch(context.Background(), fmt.Sprintf("%s/item/%d", upstream.URL, i), time.Minute)
		if err != nil {
			t.Fatalf("fetch item %d: %v", i, err)
		}
	}
	s.cacheMu.RLock()
	cacheLen := len(s.apiCache)
	s.cacheMu.RUnlock()
	if cacheLen > maxAPICacheEntries {
		t.Fatalf("apiCache size = %d, want <= %d", cacheLen, maxAPICacheEntries)
	}

	// 3. Per-IP rate limit returns 429
	limited := New()
	limited.rateLimiter = middleware.NewIPRateLimiter(60, 1, 16)
	pingBody := `{"jsonrpc":"2.0","id":1,"method":"ping"}`
	req1 := httptest.NewRequest(http.MethodPost, "/api/mcp", strings.NewReader(pingBody))
	req1.RemoteAddr = "198.51.100.7:9000"
	rr1 := httptest.NewRecorder()
	limited.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusOK {
		t.Fatalf("1st ping status = %d, want 200", rr1.Code)
	}
	req2 := httptest.NewRequest(http.MethodPost, "/api/mcp", strings.NewReader(pingBody))
	req2.RemoteAddr = "198.51.100.7:9000"
	rr2 := httptest.NewRecorder()
	limited.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusTooManyRequests {
		t.Fatalf("2nd ping status = %d, want 429", rr2.Code)
	}
}

func TestMCPServerCardCanonicalizesUntrustedHostAndProto(t *testing.T) {
	s := New()
	req := httptest.NewRequest(http.MethodGet, "http://evil.example/.well-known/mcp.json", nil)
	req.Header.Set("X-Forwarded-Proto", "javascript")
	rr := httptest.NewRecorder()
	s.serveServerCard(rr, req)

	var card map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &card); err != nil {
		t.Fatal(err)
	}
	if card["url"] != canonicalSiteOrigin {
		t.Fatalf("server card url = %v, want %q", card["url"], canonicalSiteOrigin)
	}
}
