package markdown

import (
	"bytes"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

var (
	titleRegex       = regexp.MustCompile(`(?i)<title[^>]*>(.*?)</title>`)
	metaDescRegex    = regexp.MustCompile(`(?i)<meta\s+name=["']description["']\s+content=["'](.*?)["']`)
	articleRegex     = regexp.MustCompile(`(?is)<article[^>]*class=["'][^"']*sr-only[^"']*["'][^>]*>(.*?)</article>`)
	h1Regex          = regexp.MustCompile(`(?is)<h1[^>]*>(.*?)</h1>`)
	h2Regex          = regexp.MustCompile(`(?is)<h2[^>]*>(.*?)</h2>`)
	h3Regex          = regexp.MustCompile(`(?is)<h3[^>]*>(.*?)</h3>`)
	pRegex           = regexp.MustCompile(`(?is)<p[^>]*>(.*?)</p>`)
	dlRegex          = regexp.MustCompile(`(?is)<dl[^>]*>(.*?)</dl>`)
	dtDdRegex        = regexp.MustCompile(`(?is)<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>`)
	ulRegex          = regexp.MustCompile(`(?is)<ul[^>]*>(.*?)</ul>`)
	liRegex          = regexp.MustCompile(`(?is)<li[^>]*>(.*?)</li>`)
	tableRegex       = regexp.MustCompile(`(?is)<table[^>]*>(.*?)</table>`)
	captionRegex     = regexp.MustCompile(`(?is)<caption[^>]*>(.*?)</caption>`)
	trRegex          = regexp.MustCompile(`(?is)<tr[^>]*>(.*?)</tr>`)
	thRegex          = regexp.MustCompile(`(?is)<th[^>]*>(.*?)</th>`)
	tdRegex          = regexp.MustCompile(`(?is)<td[^>]*>(.*?)</td>`)
	aRegex           = regexp.MustCompile(`(?is)<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)</a>`)
	stripTagsRegex   = regexp.MustCompile(`<[^>]+>`)
	multiSpacesRegex = regexp.MustCompile(`[ \t]+`)
	multiNewlines    = regexp.MustCompile(`\n{3,}`)
)

// IsMarkdownRequest returns true if the client specifically accepts or prefers text/markdown.
func IsMarkdownRequest(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	accept := strings.ToLower(r.Header.Get("Accept"))
	return strings.Contains(accept, "text/markdown")
}

func cleanText(s string) string {
	s = stripTagsRegex.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	s = multiSpacesRegex.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

// ConvertHTMLToMarkdown parses the HTML from Next.js SSR and produces clean, semantic Markdown.
func ConvertHTMLToMarkdown(htmlStr, requestPath string) string {
	var sb strings.Builder

	// 1. Title
	pageTitle := "Moesekai - Project SEKAI Viewer"
	if m := titleRegex.FindStringSubmatch(htmlStr); len(m) > 1 {
		t := cleanText(m[1])
		if t != "" {
			pageTitle = t
		}
	}
	sb.WriteString("# " + pageTitle + "\n\n")

	// 2. Meta description
	if m := metaDescRegex.FindStringSubmatch(htmlStr); len(m) > 1 {
		desc := cleanText(m[1])
		if desc != "" {
			sb.WriteString("> " + desc + "\n\n")
		}
	}

	// 3. Extract semantic article if available
	articleMatch := articleRegex.FindStringSubmatch(htmlStr)
	if len(articleMatch) > 1 {
		articleHTML := articleMatch[1]

		// Tables
		tables := tableRegex.FindAllStringSubmatch(articleHTML, -1)
		for _, tMatch := range tables {
			tableInner := tMatch[1]
			if capMatch := captionRegex.FindStringSubmatch(tableInner); len(capMatch) > 1 {
				capText := cleanText(capMatch[1])
				if capText != "" {
					sb.WriteString("### " + capText + "\n\n")
				}
			}

			trs := trRegex.FindAllStringSubmatch(tableInner, -1)
			var headerCols []string
			var dataRows [][]string

			for _, tr := range trs {
				trContent := tr[1]
				ths := thRegex.FindAllStringSubmatch(trContent, -1)
				if len(ths) > 0 && len(headerCols) == 0 {
					for _, th := range ths {
						headerCols = append(headerCols, cleanText(th[1]))
					}
					continue
				}
				tds := tdRegex.FindAllStringSubmatch(trContent, -1)
				if len(tds) > 0 {
					var row []string
					for _, td := range tds {
						row = append(row, cleanText(td[1]))
					}
					dataRows = append(dataRows, row)
				}
			}

			if len(headerCols) > 0 {
				sb.WriteString("| " + strings.Join(headerCols, " | ") + " |\n")
				var seps []string
				for range headerCols {
					seps = append(seps, "---")
				}
				sb.WriteString("| " + strings.Join(seps, " | ") + " |\n")
				for _, row := range dataRows {
					// Pad row to match headers count
					for len(row) < len(headerCols) {
						row = append(row, "-")
					}
					sb.WriteString("| " + strings.Join(row, " | ") + " |\n")
				}
				sb.WriteString("\n")
			}
		}

		// Definition lists (dl / dt / dd)
		dls := dlRegex.FindAllStringSubmatch(articleHTML, -1)
		for _, dl := range dls {
			pairs := dtDdRegex.FindAllStringSubmatch(dl[1], -1)
			for _, p := range pairs {
				k := cleanText(p[1])
				v := cleanText(p[2])
				if k != "" && v != "" {
					sb.WriteString(fmt.Sprintf("- **%s**: %s\n", k, v))
				}
			}
			if len(pairs) > 0 {
				sb.WriteString("\n")
			}
		}

		// Headings inside article
		h2s := h2Regex.FindAllStringSubmatch(articleHTML, -1)
		for _, h2 := range h2s {
			txt := cleanText(h2[1])
			if txt != "" {
				sb.WriteString("## " + txt + "\n\n")
			}
		}

		h3s := h3Regex.FindAllStringSubmatch(articleHTML, -1)
		for _, h3 := range h3s {
			txt := cleanText(h3[1])
			if txt != "" {
				sb.WriteString("### " + txt + "\n\n")
			}
		}

		// Paragraphs
		ps := pRegex.FindAllStringSubmatch(articleHTML, -1)
		for _, p := range ps {
			txt := cleanText(p[1])
			if txt != "" && !strings.Contains(sb.String(), txt) {
				sb.WriteString(txt + "\n\n")
			}
		}

		// Lists (ul / li)
		uls := ulRegex.FindAllStringSubmatch(articleHTML, -1)
		for _, ul := range uls {
			lis := liRegex.FindAllStringSubmatch(ul[1], -1)
			for _, li := range lis {
				txt := cleanText(li[1])
				if txt != "" {
					sb.WriteString("- " + txt + "\n")
				}
			}
			if len(lis) > 0 {
				sb.WriteString("\n")
			}
		}
	} else {
		// Home page or non-detail pages: render structured navigation
		locale := detectLocale(requestPath)
		renderSiteNavigation(&sb, locale)
	}

	// 4. Append MCP discovery section
	sb.WriteString("## AI Agent & Developer Tools\n\n")
	sb.WriteString("- **MCP Server (Context Engine)**: `https://pjsk.moe/api/mcp`\n")
	sb.WriteString("- **MCP Server Card**: `https://pjsk.moe/.well-known/mcp.json`\n")
	sb.WriteString("- **OpenAPI Specification**: `https://pjsk.moe/api/openapi.json`\n")

	res := multiNewlines.ReplaceAllString(sb.String(), "\n\n")
	return strings.TrimSpace(res) + "\n"
}

func detectLocale(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) > 0 {
		switch parts[0] {
		case "zh-cn", "zh-tw", "ja-jp", "en-us", "ko-kr":
			return parts[0]
		}
	}
	return "zh-cn"
}

func renderSiteNavigation(sb *strings.Builder, locale string) {
	switch locale {
	case "en-us":
		sb.WriteString("## Core Features & Navigation\n\n")
		sb.WriteString(fmt.Sprintf("- [Card Database](/%s/cards/): Full character card illustrations, skill parameters, and power stats\n", locale))
		sb.WriteString(fmt.Sprintf("- [Music & Charts](/%s/music/): Song catalogue, chart previewer, 3DMV/2DMV, lyrics, and difficulty info\n", locale))
		sb.WriteString(fmt.Sprintf("- [Events](/%s/events/): Historical and active events, event cards, bonus attributes, and schedules\n", locale))
		sb.WriteString(fmt.Sprintf("- [Gacha](/%s/gacha/): Active and past banner archives, featured pick-up cards, and gacha rates\n", locale))
		sb.WriteString(fmt.Sprintf("- [Real-time Ranking](/%s/realtime-ranking-next/): Live top player rankings and event border predictions\n", locale))
		sb.WriteString(fmt.Sprintf("- [Deck Recommender](/%s/deck-recommend/): Optimize team composition for highest event point multiplier\n", locale))
		sb.WriteString(fmt.Sprintf("- [Characters](/%s/character/): Unit profiles, character details, and associated cards/songs\n\n", locale))
	case "ja-jp":
		sb.WriteString("## 主な機能とページナビゲーション\n\n")
		sb.WriteString(fmt.Sprintf("- [カード図鑑](/%s/cards/): 全キャラクターカードイラスト・スキル数値・総合力データ\n", locale))
		sb.WriteString(fmt.Sprintf("- [楽曲一覧](/%s/music/): 収録楽曲・譜面プレビュー・3DMV/2DMV・作詞作曲・歌詞\n", locale))
		sb.WriteString(fmt.Sprintf("- [イベント一覧](/%s/events/): 開催中・過去イベント・ボーナス属性・リアルタイムボーダー\n", locale))
		sb.WriteString(fmt.Sprintf("- [ガチャ](/%s/gacha/): ガチャ一覧・ピックアップメンバー・提供割合\n", locale))
		sb.WriteString(fmt.Sprintf("- [リアルタイムランキング](/%s/realtime-ranking-next/): Top 100 リアルタイムランキングとボーダー予測\n", locale))
		sb.WriteString(fmt.Sprintf("- [編成シミュレーター](/%s/deck-recommend/): イベント最適編成レコメンド\n", locale))
		sb.WriteString(fmt.Sprintf("- [キャラクター](/%s/character/): ユニット・キャラクタープロフィール・関連楽曲\n\n", locale))
	case "zh-tw":
		sb.WriteString("## 核心功能與頁面導航\n\n")
		sb.WriteString(fmt.Sprintf("- [卡牌圖鑑](/%s/cards/): 全角色卡牌立繪、技能數值、劇情與綜合力數據\n", locale))
		sb.WriteString(fmt.Sprintf("- [音樂曲目](/%s/music/): 全收錄曲譜面預覽、3DMV/2DMV、作詞作曲、歌詞\n", locale))
		sb.WriteString(fmt.Sprintf("- [活動總覽](/%s/events/): 歷期活動、加成角色屬性、實時榜線與預測\n", locale))
		sb.WriteString(fmt.Sprintf("- [轉蛋卡池](/%s/gacha/): 當前及歷史卡池一覽、卡池概率\n", locale))
		sb.WriteString(fmt.Sprintf("- [實時排行榜](/%s/realtime-ranking-next/): 日服/台服實時 Top 100 榜線與預測\n", locale))
		sb.WriteString(fmt.Sprintf("- [組卡推薦](/%s/deck-recommend/): 依活動加成推薦最佳隊伍編隊\n", locale))
		sb.WriteString(fmt.Sprintf("- [角色資料](/%s/character/): 各隊伍與角色詳細資料、關聯卡牌與曲目\n\n", locale))
	case "ko-kr":
		sb.WriteString("## 주요 기능 및 페이지 네비게이션\n\n")
		sb.WriteString(fmt.Sprintf("- [카드 도감](/%s/cards/): 전 캐릭터 카드 일러스트, 스킬 수치, 종합력 데이터\n", locale))
		sb.WriteString(fmt.Sprintf("- [악곡 목록](/%s/music/): 수록곡, 채보 미리보기, 3DMV/2DMV, 작사/작곡, 가사\n", locale))
		sb.WriteString(fmt.Sprintf("- [이벤트](/%s/events/): 역대 이벤트, 보너스 속성, 실시간 컷 및 예측\n", locale))
		sb.WriteString(fmt.Sprintf("- [가챠](/%s/gacha/): 진행 중 및 과거 가챠, 픽업 멤버 목록\n", locale))
		sb.WriteString(fmt.Sprintf("- [실시간 랭킹](/%s/realtime-ranking-next/): 실시간 Top 100 랭킹 및 컷 예측\n", locale))
		sb.WriteString(fmt.Sprintf("- [덱 추천](/%s/deck-recommend/): 이벤트 보너스 최적화 덱 추천\n", locale))
		sb.WriteString(fmt.Sprintf("- [캐릭터](/%s/character/): 유닛 프로필, 캐릭터 정보 및 관련 악곡\n\n", locale))
	default: // zh-cn
		sb.WriteString("## 核心功能与页面导航\n\n")
		sb.WriteString(fmt.Sprintf("- [卡牌图鉴](/%s/cards/): 全角色卡牌立绘、技能数值、剧情与突破数据\n", locale))
		sb.WriteString(fmt.Sprintf("- [音乐曲目](/%s/music/): 全收录曲谱面预览、3DMV/2DMV、作词作曲、歌词\n", locale))
		sb.WriteString(fmt.Sprintf("- [活动总览](/%s/events/): 历期活动、加成角色属性、实时榜线与时速预测\n", locale))
		sb.WriteString(fmt.Sprintf("- [扭蛋卡池](/%s/gacha/): 当前及历史卡池一览、卡池概率与模拟抽取\n", locale))
		sb.WriteString(fmt.Sprintf("- [实时排行榜](/%s/realtime-ranking-next/): 日服/国服实时 Top 100 榜线与预测\n", locale))
		sb.WriteString(fmt.Sprintf("- [组卡推荐](/%s/deck-recommend/): 根据活动加成与卡牌自动推荐最佳编队\n", locale))
		sb.WriteString(fmt.Sprintf("- [角色列表](/%s/character/): 各队伍与角色详细资料、关联卡牌与曲目\n\n", locale))
	}
}

// NewNegotiationMiddleware wraps an http.Handler to serve text/markdown when requested by clients.
func NewNegotiationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !IsMarkdownRequest(r) {
			next.ServeHTTP(w, r)
			return
		}

		// Client wants markdown. Request HTML upstream (from cache or Next.js).
		clonedReq := r.Clone(r.Context())
		clonedReq.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		// The recorder buffers the body in-process and the converter reads it as
		// text, so a compressed upstream response would parse as garbage. The
		// htmlcache layer does the same before its own upstream fetch.
		clonedReq.Header.Del("Accept-Encoding")

		rec := &responseRecorder{
			header: make(http.Header),
			body:   &bytes.Buffer{},
			status: http.StatusOK,
		}

		next.ServeHTTP(rec, clonedReq)

		ct := strings.ToLower(rec.header.Get("Content-Type"))
		if rec.status != http.StatusOK || !strings.Contains(ct, "text/html") {
			// Upstream was error or non-HTML: forward as is
			for k, vv := range rec.header {
				for _, v := range vv {
					w.Header().Add(k, v)
				}
			}
			w.WriteHeader(rec.status)
			_, _ = io.Copy(w, rec.body)
			return
		}

		markdownText := ConvertHTMLToMarkdown(rec.body.String(), r.URL.Path)

		mdTokens := estimateTokens(markdownText)
		origTokens := estimateTokens(rec.body.String())

		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=3600")
		w.Header().Set("Vary", "Accept")
		w.Header().Set("x-markdown-tokens", strconv.Itoa(mdTokens))
		w.Header().Set("x-original-tokens", strconv.Itoa(origTokens))
		w.Header().Set("Content-Signal", "ai-train=no, search=yes, ai-input=yes")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(markdownText))
	})
}

func estimateTokens(s string) int {
	runes := len([]rune(s))
	tokens := runes / 3
	if tokens < 1 && len(s) > 0 {
		return 1
	}
	return tokens
}

type responseRecorder struct {
	header      http.Header
	body        *bytes.Buffer
	status      int
	wroteHeader bool
}

func (r *responseRecorder) Header() http.Header { return r.header }
func (r *responseRecorder) WriteHeader(code int) {
	if !r.wroteHeader {
		r.status = code
		r.wroteHeader = true
	}
}
func (r *responseRecorder) Write(b []byte) (int, error) {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	return r.body.Write(b)
}
