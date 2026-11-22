package markdown

import (
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"snowy_viewer/internal/middleware"
)

func TestIsMarkdownRequest(t *testing.T) {
	tests := []struct {
		method string
		accept string
		want   bool
	}{
		{"GET", "text/markdown", true},
		{"GET", "text/markdown, text/html;q=0.9", true},
		{"GET", "text/html,application/xhtml+xml", false},
		{"POST", "text/markdown", false},
		{"GET", "", false},
	}

	for _, tt := range tests {
		req, _ := http.NewRequest(tt.method, "http://localhost/zh-cn/", nil)
		if tt.accept != "" {
			req.Header.Set("Accept", tt.accept)
		}
		if got := IsMarkdownRequest(req); got != tt.want {
			t.Errorf("IsMarkdownRequest(%s, %s) = %v, want %v", tt.method, tt.accept, got, tt.want)
		}
	}
}

func TestConvertHTMLToMarkdown_DetailPage(t *testing.T) {
	htmlContent := `<!DOCTYPE html>
<html>
<head>
    <title>宵崎奏 - Shadow Shadow | Moesekai</title>
    <meta name="description" content="宵崎奏 - Shadow Shadow 卡牌资料与数值分析">
</head>
<body>
    <article class="sr-only" aria-label="宵崎奏 - Shadow Shadow">
        <h1>宵崎奏 - Shadow Shadow</h1>
        <p>宵崎奏 - Shadow Shadow | rarity_4 | happy | 配信日: 2026-09-03</p>
        <table>
            <caption>カードパラメータ (Card Parameters)</caption>
            <thead>
                <tr>
                    <th scope="col">状態</th>
                    <th scope="col">パフォーマンス (Performance)</th>
                    <th scope="col">テクニック (Technique)</th>
                    <th scope="col">スタミナ (Stamina)</th>
                    <th scope="col">総合力 (Total Power)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>通常 / 特訓前</td>
                    <td>11534</td>
                    <td>11534</td>
                    <td>11534</td>
                    <td>34602</td>
                </tr>
            </tbody>
        </table>
        <dl>
            <dt>スキル名</dt>
            <dd>刺す音に酔う</dd>
            <dt>スキル説明</dt>
            <dd>7秒間 BAD以上がPERFECTになり、5秒間 スコアが100％UPする</dd>
        </dl>
    </article>
</body>
</html>`

	md := ConvertHTMLToMarkdown(htmlContent, "/ja-jp/cards/1462/")

	if !strings.Contains(md, "# 宵崎奏 - Shadow Shadow | Moesekai") {
		t.Errorf("Missing title heading in markdown: %s", md)
	}
	if !strings.Contains(md, "> 宵崎奏 - Shadow Shadow 卡牌资料与数值分析") {
		t.Errorf("Missing blockquote description in markdown: %s", md)
	}
	if !strings.Contains(md, "### カードパラメータ (Card Parameters)") {
		t.Errorf("Missing table caption in markdown: %s", md)
	}
	if !strings.Contains(md, "| 状態 | パフォーマンス (Performance) | テクニック (Technique) | スタミナ (Stamina) | 総合力 (Total Power) |") {
		t.Errorf("Missing table header in markdown: %s", md)
	}
	if !strings.Contains(md, "| 通常 / 特訓前 | 11534 | 11534 | 11534 | 34602 |") {
		t.Errorf("Missing table row in markdown: %s", md)
	}
	if !strings.Contains(md, "- **スキル名**: 刺す音に酔う") {
		t.Errorf("Missing skill name in markdown: %s", md)
	}
	if !strings.Contains(md, "- **スキル説明**: 7秒間 BAD以上がPERFECTになり、5秒間 スコアが100％UPする") {
		t.Errorf("Missing skill description in markdown: %s", md)
	}
	if !strings.Contains(md, "https://pjsk.moe/api/mcp") {
		t.Errorf("Missing MCP discovery link in markdown: %s", md)
	}
}

func TestConvertHTMLToMarkdown_HomePage(t *testing.T) {
	htmlContent := `<!DOCTYPE html>
<html>
<head>
    <title>Moesekai - Project SEKAI Wiki</title>
    <meta name="description" content="Project SEKAI 综合查看器">
</head>
<body>
    <div>Welcome to Moesekai</div>
</body>
</html>`

	md := ConvertHTMLToMarkdown(htmlContent, "/zh-cn/")

	if !strings.Contains(md, "# Moesekai - Project SEKAI Wiki") {
		t.Errorf("Missing title in markdown: %s", md)
	}
	if !strings.Contains(md, "> Project SEKAI 综合查看器") {
		t.Errorf("Missing description in markdown: %s", md)
	}
	if !strings.Contains(md, "[卡牌图鉴](/zh-cn/cards/)") {
		t.Errorf("Missing card navigation in markdown: %s", md)
	}
	if !strings.Contains(md, "https://pjsk.moe/api/mcp") {
		t.Errorf("Missing MCP discovery link in markdown: %s", md)
	}
}

func TestNegotiationMiddleware(t *testing.T) {
	backend := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`<html><head><title>Test Page</title><meta name="description" content="Test Desc"></head><body><h1>Hello</h1></body></html>`))
	})

	handler := NewNegotiationMiddleware(backend)

	// 1. Regular HTML request
	req1, _ := http.NewRequest("GET", "http://localhost/zh-cn/", nil)
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)
	if rec1.Header().Get("Content-Type") != "text/html; charset=utf-8" {
		t.Errorf("Expected text/html, got %s", rec1.Header().Get("Content-Type"))
	}

	// 2. Markdown request
	req2, _ := http.NewRequest("GET", "http://localhost/zh-cn/", nil)
	req2.Header.Set("Accept", "text/markdown")
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)
	if rec2.Header().Get("Content-Type") != "text/markdown; charset=utf-8" {
		t.Errorf("Expected text/markdown, got %s", rec2.Header().Get("Content-Type"))
	}
	body := rec2.Body.String()
	if !strings.Contains(body, "# Test Page") {
		t.Errorf("Markdown missing heading: %s", body)
	}
}

// The htmlcache layer strips Accept-Encoding before its own upstream fetch, so
// cached pages reach the converter uncompressed. Requests it declines to cache
// (query string, RSC headers, prefetch, cache not ready) go straight to the
// Next.js proxy, which honours whatever encoding the client asked for.
func TestNegotiationMiddlewareStripsAcceptEncoding(t *testing.T) {
	const page = `<html><head><title>Test Page</title></head><body><article class="sr-only"><h2>Detail</h2></article></body></html>`
	backend := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			w.Header().Set("Content-Encoding", "gzip")
			gz := gzip.NewWriter(w)
			_, _ = gz.Write([]byte(page))
			_ = gz.Close()
			return
		}
		_, _ = w.Write([]byte(page))
	})

	req, _ := http.NewRequest("GET", "http://localhost/zh-cn/music/74/?sortBy=id", nil)
	req.Header.Set("Accept", "text/markdown")
	req.Header.Set("Accept-Encoding", "gzip, br")
	rec := httptest.NewRecorder()
	NewNegotiationMiddleware(backend).ServeHTTP(rec, req)

	if got := rec.Body.String(); !strings.Contains(got, "# Test Page") {
		t.Errorf("compressed upstream body parsed as HTML; markdown degraded to the generic stub:\n%s", got)
	}
}

func TestNegotiationStreamsNonHTMLAndOversizedHTMLWithoutBuffering(t *testing.T) {
	t.Run("non-HTML streams directly", func(t *testing.T) {
		backend := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/octet-stream")
			_, _ = w.Write([]byte("BINARY-DATA"))
		})
		req := httptest.NewRequest(http.MethodGet, "http://localhost/asset.bin", nil)
		req.Header.Set("Accept", "text/markdown")
		rec := httptest.NewRecorder()
		NewNegotiationMiddlewareWithLimits(backend, 4, 16, nil).ServeHTTP(rec, req)
		if rec.Header().Get("Content-Type") != "application/octet-stream" || rec.Body.String() != "BINARY-DATA" {
			t.Fatalf("non-HTML altered: ct=%q body=%q", rec.Header().Get("Content-Type"), rec.Body.String())
		}
	})

	t.Run("oversized HTML falls back to streaming passthrough", func(t *testing.T) {
		big := "<html><head><title>Big</title></head><body>" + strings.Repeat("x", 1024) + "</body></html>"
		backend := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(big))
		})
		req := httptest.NewRequest(http.MethodGet, "http://localhost/zh-cn/", nil)
		req.Header.Set("Accept", "text/markdown")
		rec := httptest.NewRecorder()
		NewNegotiationMiddlewareWithLimits(backend, 4, 128, nil).ServeHTTP(rec, req)
		if !strings.Contains(rec.Header().Get("Content-Type"), "text/html") {
			t.Fatalf("oversized HTML ct = %q, want text/html passthrough", rec.Header().Get("Content-Type"))
		}
		if rec.Body.String() != big {
			t.Fatalf("oversized HTML body length = %d, want %d", rec.Body.Len(), len(big))
		}
	})
}

func TestNegotiationDoesNotMarkPrivateOrSetCookiePublicAndPreservesVary(t *testing.T) {
	for _, tc := range []struct {
		name      string
		setCookie string
		cc        string
	}{
		{"set-cookie", "session=abc; HttpOnly", "public, max-age=60"},
		{"private", "", "private, no-store"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			backend := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				if tc.setCookie != "" {
					w.Header().Set("Set-Cookie", tc.setCookie)
				}
				if tc.cc != "" {
					w.Header().Set("Cache-Control", tc.cc)
				}
				_, _ = w.Write([]byte(`<html><head><title>Private</title></head><body></body></html>`))
			})
			req := httptest.NewRequest(http.MethodGet, "http://localhost/zh-cn/account/", nil)
			req.Header.Set("Accept", "text/markdown")
			rec := httptest.NewRecorder()
			rec.Header().Set("Vary", "Origin")
			NewNegotiationMiddlewareWithLimits(backend, 4, 1<<20, nil).ServeHTTP(rec, req)
			if strings.Contains(strings.ToLower(rec.Header().Get("Cache-Control")), "public") {
				t.Fatalf("private/cookie response marked public: Cache-Control=%q", rec.Header().Get("Cache-Control"))
			}
			vary := strings.Join(rec.Header().Values("Vary"), ", ")
			if !strings.Contains(vary, "Origin") || !strings.Contains(vary, "Accept") {
				t.Fatalf("Vary clobbered: %q", vary)
			}
		})
	}
}

func TestNegotiationHeadRequestReturnsHeadersWithoutBody(t *testing.T) {
	backend := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("expected upstream GET for markdown HEAD, got %s", r.Method)
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Head Test</title></head><body><article class="sr-only"><p>Hello</p></article></body></html>`))
	})
	req := httptest.NewRequest(http.MethodHead, "http://localhost/zh-cn/cards/1/", nil)
	req.Header.Set("Accept", "text/markdown")
	rec := httptest.NewRecorder()
	NewNegotiationMiddlewareWithLimits(backend, 4, 1<<20, nil).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Header().Get("Content-Type"), "text/markdown") {
		t.Fatalf("Content-Type = %q", rec.Header().Get("Content-Type"))
	}
	if rec.Header().Get("x-markdown-tokens") == "" || rec.Header().Get("x-original-tokens") == "0" {
		t.Fatalf("unexpected token headers: md=%q orig=%q", rec.Header().Get("x-markdown-tokens"), rec.Header().Get("x-original-tokens"))
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("HEAD response wrote %d bytes, want 0", rec.Body.Len())
	}
}

func TestNegotiationConcurrencyAndRateLimits(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	backend := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case started <- struct{}{}:
		default:
		}
		<-release
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><head><title>Slow</title></head></html>`))
	})

	h := NewNegotiationMiddlewareWithLimits(backend, 1, 1<<20, nil)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		req := httptest.NewRequest(http.MethodGet, "http://localhost/zh-cn/", nil)
		req.Header.Set("Accept", "text/markdown")
		h.ServeHTTP(httptest.NewRecorder(), req)
	}()
	<-started

	req2 := httptest.NewRequest(http.MethodGet, "http://localhost/zh-cn/", nil)
	req2.Header.Set("Accept", "text/markdown")
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	close(release)
	wg.Wait()
	if rec2.Code != http.StatusServiceUnavailable {
		t.Fatalf("saturated status = %d, want 503", rec2.Code)
	}

	// Rate limit test
	fastBackend := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><head><title>Fast</title></head></html>`))
	})
	limited := NewNegotiationMiddlewareWithLimits(fastBackend, 4, 1<<20, middleware.NewIPRateLimiter(60, 1, 16))
	reqA := httptest.NewRequest(http.MethodGet, "http://localhost/zh-cn/", nil)
	reqA.Header.Set("Accept", "text/markdown")
	reqA.RemoteAddr = "203.0.113.5:1234"
	recA := httptest.NewRecorder()
	limited.ServeHTTP(recA, reqA)
	if recA.Code != http.StatusOK {
		t.Fatalf("first status = %d, want 200", recA.Code)
	}

	reqB := httptest.NewRequest(http.MethodGet, "http://localhost/zh-cn/", nil)
	reqB.Header.Set("Accept", "text/markdown")
	reqB.RemoteAddr = "203.0.113.5:1234"
	recB := httptest.NewRecorder()
	limited.ServeHTTP(recB, reqB)
	if recB.Code != http.StatusTooManyRequests {
		t.Fatalf("second status = %d, want 429", recB.Code)
	}
}
