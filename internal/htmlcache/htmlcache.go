package htmlcache

import (
	"bytes"
	"container/list"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"snowy_viewer/internal/middleware"
)

const OriginCacheHeader = "X-Moesekai-Origin-Cache"

// maxBackgroundRefreshes bounds concurrent stale-while-revalidate renders. A
// deploy turns every restored entry stale at once, so without a bound each
// request for a distinct page would start its own Next.js render.
const (
	maxBackgroundRefreshes       = 4
	defaultMaxBytes        int64 = 4 << 30
	defaultMaxEntries            = 30_000
	defaultMaxEntryBytes   int64 = 4 << 20
	defaultBypassMax             = 24
	maxSharedBypassBytes   int64 = 256 << 10
	maxEligiblePathLen           = 512
	bypassAcquireTimeout         = 500 * time.Millisecond
	restoreWorkers               = 8
)

type Config struct {
	Dir                 string
	MaxBytes            int64
	MaxEntries          int
	MaxEntryBytes       int64
	FetchTimeout        time.Duration
	Persistent          bool
	MaxBypassConcurrent int
	BaseContext         context.Context
	// BuildID identifies the Next.js build rendering the pages. Restored
	// entries rendered by another build are served stale and re-rendered,
	// because their HTML references that build's JavaScript.
	BuildID string
}

type cachedResponse struct {
	status  int
	header  http.Header
	path    string
	size    int64
	buildID string

	storedAt   time.Time
	freshUntil time.Time
	staleUntil time.Time
	refs       int
	retired    bool
}

type lruItem struct {
	key   string
	value *cachedResponse
}

type sharedResponse struct {
	status          int
	header          http.Header
	body            []byte
	publicCacheable bool
}

type flight struct {
	done   chan struct{}
	stored bool
	shared *sharedResponse
}

type retiredEntry struct {
	key      string
	htmlPath string
}

type WarmupStats struct {
	Total       int       `json:"total"`
	Completed   int       `json:"completed"`
	Warmed      int       `json:"warmed"`
	Skipped     int       `json:"skipped"`
	InProgress  bool      `json:"in_progress"`
	CurrentPath string    `json:"current_path,omitempty"`
	StartTime   time.Time `json:"start_time,omitempty"`
	EndTime     time.Time `json:"end_time,omitempty"`
}

type Stats struct {
	Entries    int         `json:"entries"`
	Bytes      int64       `json:"bytes"`
	BytesMB    float64     `json:"bytes_mb"`
	MaxBytesMB float64     `json:"max_bytes_mb"`
	Warmup     WarmupStats `json:"warmup"`
}

type Cache struct {
	next       http.Handler
	cfg        Config
	now        func() time.Time
	ready      bool
	baseCtx    context.Context
	cancelBase context.CancelFunc

	mu             sync.Mutex
	items          map[string]*list.Element
	lru            *list.List
	bytes          int64
	flights        map[string]*flight
	activeRequests atomic.Int64
	refreshSlots   chan struct{}
	bypassSlots    chan struct{}

	// metaLocks serializes per-key .meta rename/remove outside c.mu.
	// Lock order invariant: always metaLocks[i] -> c.mu, never c.mu -> metaLocks[i].
	metaLocks  [64]sync.Mutex
	shardReady [256]atomic.Bool
	bgWG       sync.WaitGroup

	warmupMu    sync.RWMutex
	warmupStats WarmupStats
}

func (c *Cache) Stats() Stats {
	c.mu.Lock()
	entries := len(c.items)
	bytes := c.bytes
	c.mu.Unlock()

	c.warmupMu.RLock()
	warmup := c.warmupStats
	c.warmupMu.RUnlock()

	return Stats{
		Entries:    entries,
		Bytes:      bytes,
		BytesMB:    float64(bytes) / (1024 * 1024),
		MaxBytesMB: float64(c.cfg.MaxBytes) / (1024 * 1024),
		Warmup:     warmup,
	}
}

func New(next http.Handler, cfg Config) *Cache {
	if cfg.Dir == "" {
		cfg.Dir = filepath.Join(os.TempDir(), "moesekai-html-cache")
	}
	if cfg.MaxBytes <= 0 {
		cfg.MaxBytes = defaultMaxBytes
	}
	if cfg.MaxEntries <= 0 {
		cfg.MaxEntries = defaultMaxEntries
	}
	if cfg.MaxEntryBytes <= 0 {
		cfg.MaxEntryBytes = defaultMaxEntryBytes
	}
	if cfg.FetchTimeout <= 0 {
		cfg.FetchTimeout = 30 * time.Second
	}
	if cfg.MaxBypassConcurrent == 0 {
		cfg.MaxBypassConcurrent = defaultBypassMax
	}

	parentCtx := cfg.BaseContext
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	baseCtx, cancelBase := context.WithCancel(parentCtx)

	var ready bool
	if cfg.Persistent {
		ready = os.MkdirAll(cfg.Dir, 0o755) == nil
	} else {
		ready = os.RemoveAll(cfg.Dir) == nil && os.MkdirAll(cfg.Dir, 0o755) == nil
	}

	var bypassSlots chan struct{}
	if cfg.MaxBypassConcurrent > 0 {
		bypassSlots = make(chan struct{}, cfg.MaxBypassConcurrent)
	}

	cache := &Cache{
		next:         next,
		cfg:          cfg,
		now:          time.Now,
		ready:        ready,
		baseCtx:      baseCtx,
		cancelBase:   cancelBase,
		items:        make(map[string]*list.Element),
		lru:          list.New(),
		flights:      make(map[string]*flight),
		refreshSlots: make(chan struct{}, maxBackgroundRefreshes),
		bypassSlots:  bypassSlots,
	}

	if cfg.Persistent && ready {
		cache.restoreFromDisk()
	}
	return cache
}

// Close cancels background warmup/refresh fetches and waits for in-flight
// background goroutines to finish until ctx expires.
func (c *Cache) Close(ctx context.Context) error {
	c.cancelBase()
	done := make(chan struct{})
	go func() {
		c.bgWG.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c *Cache) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	c.activeRequests.Add(1)
	defer c.activeRequests.Add(-1)

	if !c.ready || !eligibleRequest(r) {
		c.serveBypass(w, r)
		return
	}

	key := cacheKey(r)
	if entry, state := c.acquire(key); entry != nil {
		err := c.serveAndRelease(w, r, entry, state)
		if err == nil {
			if state == "STALE" {
				c.refresh(key, r)
			}
			return
		}
		if errors.Is(err, os.ErrNotExist) {
			c.evictIfCurrent(key, entry)
		} else {
			return
		}
	}

	f, leader := c.beginFlight(key)
	if !leader {
		select {
		case <-f.done:
		case <-r.Context().Done():
			return
		}
		if f.stored {
			if entry, state := c.acquire(key); entry != nil {
				err := c.serveAndRelease(w, r, entry, state)
				if err == nil {
					return
				}
				if errors.Is(err, os.ErrNotExist) {
					c.evictIfCurrent(key, entry)
				} else {
					return
				}
			}
		}
		if f.shared != nil {
			w.Header().Set("X-Moesekai-Cache", "BYPASS")
			serveShared(w, r, f.shared)
			return
		}
		c.serveBypass(w, r)
		return
	}

	c.runLeaderFlight(w, r, key, f)
}

func (c *Cache) runLeaderFlight(w http.ResponseWriter, r *http.Request, key string, f *flight) {
	defer c.endFlight(key, f)

	rec := c.fetchLive(c.baseCtx, r, w)
	if rec.streaming {
		// Already streamed directly to w (non-HTML or > MaxEntryBytes).
		return
	}

	meta := c.makeEntry(rec)
	if meta != nil {
		bodyBytes := rec.body.Bytes()
		stored := c.store(key, meta, bodyBytes)
		f.stored = stored
		if stored {
			// Serve MISS directly from memory without re-reading the disk file.
			serveMemoryHit(w, r, meta, bodyBytes, "MISS")
			return
		}
		// Disk store failed, but response is still valid public HTML.
		w.Header().Set("X-Moesekai-Cache", "BYPASS")
		serveShared(w, r, &sharedResponse{
			status:          rec.status,
			header:          rec.header,
			body:            bodyBytes,
			publicCacheable: true,
		})
		return
	}

	// Non-cacheable small response (e.g. 404, 500, or Set-Cookie).
	bodyCopy := append([]byte(nil), rec.body.Bytes()...)
	shared := &sharedResponse{
		status:          rec.status,
		header:          rec.header.Clone(),
		body:            bodyCopy,
		publicCacheable: false,
	}
	// Never share responses with Set-Cookie across concurrent waiters.
	if len(rec.header.Values("Set-Cookie")) == 0 {
		f.shared = shared
	}
	w.Header().Set("X-Moesekai-Cache", "BYPASS")
	serveShared(w, r, shared)
}

func (c *Cache) serveBypass(w http.ResponseWriter, r *http.Request) {
	if c.bypassSlots != nil {
		timer := time.NewTimer(bypassAcquireTimeout)
		select {
		case c.bypassSlots <- struct{}{}:
			timer.Stop()
		case <-r.Context().Done():
			timer.Stop()
			return
		case <-timer.C:
			w.Header().Set("X-Moesekai-Cache", "BYPASS")
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Retry-After", "1")
			http.Error(w, "upstream busy", http.StatusServiceUnavailable)
			return
		}
		defer func() { <-c.bypassSlots }()
	}

	w.Header().Set("X-Moesekai-Cache", "BYPASS")
	if sharesDocumentCacheKey(r) {
		w = &privateResponseWriter{ResponseWriter: w}
	}
	c.next.ServeHTTP(w, r)
}

func (c *Cache) serveAndRelease(w http.ResponseWriter, r *http.Request, entry *cachedResponse, state string) error {
	defer c.release(entry)
	return serveFile(w, r, entry, state, c.now)
}

func canonicalPath(r *http.Request) (string, bool) {
	p := r.URL.Path
	if p == "" || len(p) > maxEligiblePathLen || p[0] != '/' {
		return "", false
	}
	for i := 0; i < len(p); i++ {
		if p[i] < 0x20 || p[i] == 0x7f {
			return "", false
		}
	}
	if r.URL.RawPath != "" {
		lowerRaw := strings.ToLower(r.URL.RawPath)
		if strings.Contains(lowerRaw, "%2f") || strings.Contains(lowerRaw, "%5c") {
			return "", false
		}
	}
	trailing := p != "/" && strings.HasSuffix(p, "/")
	cleaned := path.Clean(p)
	if !strings.HasPrefix(cleaned, "/") {
		cleaned = "/" + cleaned
	}
	if trailing && cleaned != "/" && !strings.HasSuffix(cleaned, "/") {
		cleaned += "/"
	}
	return cleaned, true
}

func eligibleRequest(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	if r.URL.RawQuery != "" || r.Header.Get("Authorization") != "" || r.Header.Get("Range") != "" || r.Header.Get("Upgrade") != "" {
		return false
	}
	if r.Header.Get("RSC") != "" || r.Header.Get("Next-Router-State-Tree") != "" || r.Header.Get("Next-Url") != "" {
		return false
	}
	if strings.Contains(strings.ToLower(r.Header.Get("Purpose")), "prefetch") || strings.Contains(strings.ToLower(r.Header.Get("Next-Router-Prefetch")), "1") {
		return false
	}
	accept := strings.ToLower(r.Header.Get("Accept"))
	if accept != "" && !strings.Contains(accept, "text/html") && !strings.Contains(accept, "*/*") {
		return false
	}
	cleaned, ok := canonicalPath(r)
	if !ok {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(cleaned, "/"), "/")
	if len(parts) == 0 {
		return false
	}
	switch parts[0] {
	case "zh-cn", "zh-tw", "ja-jp", "en-us", "ko-kr":
		return true
	default:
		return false
	}
}

// sharesDocumentCacheKey reports whether a request is an RSC request without the `_rsc`
// cache-busting param, so a CDN would store its response under the plain document URL.
func sharesDocumentCacheKey(r *http.Request) bool {
	if r.Header.Get("RSC") == "" && r.Header.Get("Next-Router-State-Tree") == "" &&
		r.Header.Get("Next-Router-Prefetch") == "" && r.Header.Get("Next-Router-Segment-Prefetch") == "" {
		return false
	}
	return !r.URL.Query().Has("_rsc")
}

// privateResponseWriter keeps a response out of shared caches whatever the upstream says.
type privateResponseWriter struct {
	http.ResponseWriter
	wroteHeader bool
}

func (p *privateResponseWriter) WriteHeader(code int) {
	if code >= http.StatusOK && !p.wroteHeader {
		p.wroteHeader = true
		p.Header().Set("Cache-Control", "private, no-store")
		p.Header().Del(OriginCacheHeader)
	}
	p.ResponseWriter.WriteHeader(code)
}

func (p *privateResponseWriter) Write(b []byte) (int, error) {
	if !p.wroteHeader {
		p.WriteHeader(http.StatusOK)
	}
	return p.ResponseWriter.Write(b)
}

func (p *privateResponseWriter) Flush() {
	if !p.wroteHeader {
		p.WriteHeader(http.StatusOK)
	}
	if f, ok := p.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (p *privateResponseWriter) Unwrap() http.ResponseWriter { return p.ResponseWriter }

func cacheKey(r *http.Request) string {
	cleaned, ok := canonicalPath(r)
	if !ok {
		cleaned = r.URL.Path
	}
	canonicalEscaped := (&url.URL{Path: cleaned}).EscapedPath()
	sum := sha256.Sum256([]byte(canonicalEscaped))
	return hex.EncodeToString(sum[:])
}

func (c *Cache) buildFetchRequest(ctx context.Context, r *http.Request) (*http.Request, context.CancelFunc) {
	fetchCtx, cancel := context.WithTimeout(ctx, c.cfg.FetchTimeout)
	req := r.Clone(fetchCtx)
	req.Method = http.MethodGet
	req.Body = nil
	if cleaned, ok := canonicalPath(r); ok {
		req.URL.Path = cleaned
		req.URL.RawPath = ""
	}
	req.Header = r.Header.Clone()
	req.Header.Del("Accept-Encoding")
	return req, cancel
}

func (c *Cache) fetchLive(ctx context.Context, r *http.Request, w http.ResponseWriter) *fetchRecorder {
	req, cancel := c.buildFetchRequest(ctx, r)
	defer cancel()
	rec := &fetchRecorder{
		w:              w,
		reqMethod:      r.Method,
		header:         make(http.Header),
		status:         http.StatusOK,
		maxCacheBytes:  c.cfg.MaxEntryBytes,
		maxSharedBytes: maxSharedBypassBytes,
	}
	c.next.ServeHTTP(rec, req)
	return rec
}

func (c *Cache) fetchBackground(ctx context.Context, r *http.Request) (*cachedResponse, *fetchRecorder) {
	req, cancel := c.buildFetchRequest(ctx, r)
	defer cancel()
	rec := &fetchRecorder{
		header:        make(http.Header),
		status:        http.StatusOK,
		maxCacheBytes: c.cfg.MaxEntryBytes,
	}
	c.next.ServeHTTP(rec, req)
	return c.makeEntry(rec), rec
}

// fetchRecorder enforces a strict memory ceiling during upstream fetches:
// cacheable HTML buffers up to maxCacheBytes; non-cacheable small text/HTML
// responses buffer up to maxSharedBytes (to coalesce 404 bursts); non-HTML or
// oversized bodies immediately stream straight through to w (or discard in
// background refreshes/warmup).
type fetchRecorder struct {
	w               http.ResponseWriter
	reqMethod       string
	header          http.Header
	status          int
	wroteHeader     bool
	cacheableHeader bool
	fresh           time.Duration
	swr             time.Duration
	maxCacheBytes   int64
	maxSharedBytes  int64
	body            bytes.Buffer
	streaming       bool
	discard         bool
	overflowed      bool
}

func (r *fetchRecorder) Header() http.Header { return r.header }

func (r *fetchRecorder) WriteHeader(code int) {
	if r.wroteHeader {
		return
	}
	r.status = code
	r.wroteHeader = true

	fresh, swr, ok := parsePolicy(r.header.Get(OriginCacheHeader))
	ct := strings.ToLower(r.header.Get("Content-Type"))
	r.cacheableHeader = ok &&
		code == http.StatusOK &&
		strings.HasPrefix(ct, "text/html") &&
		len(r.header.Values("Set-Cookie")) == 0
	if r.cacheableHeader {
		r.fresh = fresh
		r.swr = swr
		return
	}

	if r.w == nil {
		// Background refresh/warmup has no client; discard non-cacheable bodies immediately.
		r.discard = true
		return
	}

	// Stream non-text/non-HTML responses (e.g. binaries/images) immediately without buffering.
	isSmallText := ct == "" || strings.HasPrefix(ct, "text/") || strings.HasPrefix(ct, "application/json")
	if !isSmallText {
		r.enterStreaming()
		return
	}
	if clStr := r.header.Get("Content-Length"); clStr != "" {
		if cl, err := strconv.ParseInt(clStr, 10, 64); err == nil && cl > r.maxSharedBytes {
			r.enterStreaming()
		}
	}
}

func (r *fetchRecorder) enterStreaming() {
	if r.streaming {
		return
	}
	r.streaming = true
	if r.w == nil {
		r.body.Reset()
		r.discard = true
		return
	}
	r.w.Header().Set("X-Moesekai-Cache", "BYPASS")
	writeRecordedHeaders(r.w.Header(), r.header, r.cacheableHeader)
	r.w.WriteHeader(r.status)
	if r.body.Len() > 0 {
		if r.reqMethod != http.MethodHead {
			_, _ = r.w.Write(r.body.Bytes())
		}
		r.body.Reset()
	}
}

func (r *fetchRecorder) Write(p []byte) (int, error) {
	if !r.wroteHeader {
		if r.header.Get("Content-Type") == "" {
			r.header.Set("Content-Type", http.DetectContentType(p))
		}
		r.WriteHeader(http.StatusOK)
	}
	if r.discard {
		return len(p), nil
	}
	if r.streaming {
		if r.reqMethod == http.MethodHead {
			return len(p), nil
		}
		return r.w.Write(p)
	}

	limit := r.maxSharedBytes
	if r.cacheableHeader {
		limit = r.maxCacheBytes
	}
	if int64(r.body.Len())+int64(len(p)) > limit {
		r.overflowed = true
		if r.w == nil {
			r.body.Reset()
			r.discard = true
			return len(p), nil
		}
		r.enterStreaming()
		if r.reqMethod == http.MethodHead {
			return len(p), nil
		}
		return r.w.Write(p)
	}
	return r.body.Write(p)
}

func (c *Cache) makeEntry(r *fetchRecorder) *cachedResponse {
	if r == nil || !r.cacheableHeader || r.overflowed || r.streaming || r.discard || int64(r.body.Len()) > c.cfg.MaxEntryBytes {
		return nil
	}
	header := cacheableHeaders(r.header)
	header.Set("Cache-Control", "public, max-age=60, s-maxage=3600")
	middleware.AppendVary(header, "Accept")
	now := c.now()
	return &cachedResponse{
		status:     r.status,
		header:     header,
		size:       int64(r.body.Len()),
		buildID:    c.cfg.BuildID,
		storedAt:   now,
		freshUntil: now.Add(r.fresh),
		staleUntil: now.Add(r.fresh + r.swr),
	}
}

func cacheableHeaders(source http.Header) http.Header {
	allowed := [...]string{
		"Cache-Control",
		"Content-Language",
		"Content-Type",
		"ETag",
		"Last-Modified",
		"Link",
		"Vary",
		"X-Robots-Tag",
	}
	header := make(http.Header, len(allowed))
	for _, key := range allowed {
		for _, value := range source.Values(key) {
			header.Add(key, value)
		}
	}
	return header
}

func parsePolicy(value string) (time.Duration, time.Duration, bool) {
	var fresh, swr time.Duration
	for _, part := range strings.Split(value, ",") {
		pair := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(pair) != 2 {
			continue
		}
		seconds, err := strconv.ParseInt(strings.TrimSpace(pair[1]), 10, 64)
		if err != nil || seconds < 0 {
			return 0, 0, false
		}
		switch strings.ToLower(strings.TrimSpace(pair[0])) {
		case "max-age":
			fresh = time.Duration(seconds) * time.Second
		case "stale-while-revalidate":
			swr = time.Duration(seconds) * time.Second
		}
	}
	return fresh, swr, fresh > 0
}

func (c *Cache) metaLock(key string) *sync.Mutex {
	var idx uint8
	if len(key) >= 2 {
		idx = (key[0] ^ key[1]) & 63
	} else if len(key) == 1 {
		idx = key[0] & 63
	}
	return &c.metaLocks[idx]
}

func parseHexByte(s string) (int, bool) {
	if len(s) < 2 {
		return 0, false
	}
	v, err := strconv.ParseUint(s[:2], 16, 8)
	if err != nil {
		return 0, false
	}
	return int(v), true
}

func (c *Cache) shardDir(key string) string {
	if len(key) >= 2 {
		if _, ok := parseHexByte(key[:2]); ok {
			return filepath.Join(c.cfg.Dir, strings.ToLower(key[:2]))
		}
	}
	return c.cfg.Dir
}

func (c *Cache) ensureShardDir(key string) (string, error) {
	dir := c.shardDir(key)
	if dir == c.cfg.Dir {
		return dir, nil
	}
	if b, ok := parseHexByte(key[:2]); ok {
		if c.shardReady[b].Load() {
			return dir, nil
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return "", err
		}
		c.shardReady[b].Store(true)
		return dir, nil
	}
	return dir, os.MkdirAll(dir, 0o755)
}

func (c *Cache) metaPath(key string) string {
	return filepath.Join(c.shardDir(key), key+".meta")
}

func renameFile(src, dst string) error {
	var err error
	for attempt := 0; attempt < 8; attempt++ {
		err = os.Rename(src, dst)
		if err == nil {
			return nil
		}
		time.Sleep(2 * time.Millisecond)
	}
	return err
}

func (c *Cache) store(key string, value *cachedResponse, body []byte) bool {
	if value.size > c.cfg.MaxBytes {
		return false
	}
	dir, err := c.ensureShardDir(key)
	if err != nil {
		return false
	}
	tmp, err := os.CreateTemp(dir, ".write-*")
	if err != nil {
		return false
	}
	tmpName := tmp.Name()
	ok := false
	defer func() {
		_ = tmp.Close()
		if !ok {
			_ = os.Remove(tmpName)
		}
	}()
	if _, err = tmp.Write(body); err != nil {
		return false
	}
	if err = tmp.Close(); err != nil {
		return false
	}
	finalPath := filepath.Join(dir, key+"-"+filepath.Base(tmpName)+".html")
	if err = os.Rename(tmpName, finalPath); err != nil {
		return false
	}
	ok = true
	value.path = finalPath

	var metaTmpName string
	if c.cfg.Persistent {
		metaTmpName = c.writeDiskMetaTemp(dir, key, value)
	}

	var retired []retiredEntry
	c.mu.Lock()
	if old := c.items[key]; old != nil {
		retired = append(retired, c.removeLocked(old))
	}
	elem := c.lru.PushFront(&lruItem{key: key, value: value})
	c.items[key] = elem
	c.bytes += value.size
	for c.bytes > c.cfg.MaxBytes || c.lru.Len() > c.cfg.MaxEntries {
		retired = append(retired, c.removeLocked(c.lru.Back()))
	}
	stored := c.items[key] == elem
	c.mu.Unlock()

	// Commit or discard the .meta temp file under the per-key stripe lock
	// so eviction/replacement can never race to orphan or resurrect .meta files.
	if c.cfg.Persistent && metaTmpName != "" {
		ml := c.metaLock(key)
		ml.Lock()
		c.mu.Lock()
		stillCurrent := c.items[key] == elem && !value.retired
		c.mu.Unlock()
		if stillCurrent {
			if err := renameFile(metaTmpName, c.metaPath(key)); err != nil {
				_ = os.Remove(metaTmpName)
			}
		} else {
			_ = os.Remove(metaTmpName)
		}
		ml.Unlock()
	}

	c.cleanupRetired(retired)
	return stored
}

func (c *Cache) cleanupRetired(retired []retiredEntry) {
	for _, ret := range retired {
		if ret.key == "" && ret.htmlPath == "" {
			continue
		}
		if c.cfg.Persistent && ret.key != "" {
			ml := c.metaLock(ret.key)
			ml.Lock()
			c.mu.Lock()
			hasReplacement := c.items[ret.key] != nil
			c.mu.Unlock()
			if !hasReplacement {
				_ = os.Remove(c.metaPath(ret.key))
			}
			ml.Unlock()
		}
		if ret.htmlPath != "" {
			_ = os.Remove(ret.htmlPath)
		}
	}
}

func (c *Cache) acquire(key string) (*cachedResponse, string) {
	var expired retiredEntry
	c.mu.Lock()
	elem := c.items[key]
	if elem == nil {
		c.mu.Unlock()
		return nil, ""
	}
	item := elem.Value.(*lruItem)
	now := c.now()
	if !now.Before(item.value.staleUntil) {
		expired = c.removeLocked(elem)
		c.mu.Unlock()
		c.cleanupRetired([]retiredEntry{expired})
		return nil, ""
	}
	c.lru.MoveToFront(elem)
	item.value.refs++
	state := "STALE"
	if now.Before(item.value.freshUntil) {
		state = "HIT"
	}
	val := item.value
	c.mu.Unlock()
	return val, state
}

func (c *Cache) evictIfCurrent(key string, target *cachedResponse) {
	var retired retiredEntry
	c.mu.Lock()
	if elem := c.items[key]; elem != nil {
		if item := elem.Value.(*lruItem); item.value == target {
			retired = c.removeLocked(elem)
		}
	}
	c.mu.Unlock()
	c.cleanupRetired([]retiredEntry{retired})
}

func (c *Cache) release(value *cachedResponse) {
	var pathToRemove string
	c.mu.Lock()
	value.refs--
	if value.refs == 0 && value.retired {
		pathToRemove = value.path
	}
	c.mu.Unlock()
	if pathToRemove != "" {
		_ = os.Remove(pathToRemove)
	}
}

func (c *Cache) removeLocked(elem *list.Element) retiredEntry {
	if elem == nil {
		return retiredEntry{}
	}
	item := elem.Value.(*lruItem)
	delete(c.items, item.key)
	c.bytes -= item.value.size
	c.lru.Remove(elem)
	item.value.retired = true
	ret := retiredEntry{key: item.key}
	if item.value.refs == 0 {
		ret.htmlPath = item.value.path
	}
	return ret
}

func (c *Cache) beginFlight(key string) (*flight, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if f := c.flights[key]; f != nil {
		return f, false
	}
	f := &flight{done: make(chan struct{})}
	c.flights[key] = f
	return f, true
}

func (c *Cache) endFlight(key string, target *flight) {
	c.mu.Lock()
	if f := c.flights[key]; f != nil && f == target {
		delete(c.flights, key)
		close(f.done)
	}
	c.mu.Unlock()
}

func (c *Cache) beginRefreshFlight(key string) (*flight, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if elem := c.items[key]; elem != nil {
		item := elem.Value.(*lruItem)
		if c.now().Before(item.value.freshUntil) {
			return nil, false
		}
	}
	if f := c.flights[key]; f != nil {
		return f, false
	}
	f := &flight{done: make(chan struct{})}
	c.flights[key] = f
	return f, true
}

func (c *Cache) refresh(key string, r *http.Request) {
	if c.baseCtx.Err() != nil {
		return
	}
	select {
	case c.refreshSlots <- struct{}{}:
	default:
		// Every slot is busy; the entry stays stale and a later request retries.
		return
	}
	f, leader := c.beginRefreshFlight(key)
	if !leader {
		<-c.refreshSlots
		return
	}
	clone := r.Clone(c.baseCtx)
	c.bgWG.Add(1)
	go func() {
		defer c.bgWG.Done()
		defer func() { <-c.refreshSlots }()
		defer c.endFlight(key, f)
		meta, recorded := c.fetchBackground(c.baseCtx, clone)
		if meta != nil {
			f.stored = c.store(key, meta, recorded.body.Bytes())
		}
	}()
}

func serveFile(w http.ResponseWriter, r *http.Request, entry *cachedResponse, state string, nowFn func() time.Time) error {
	file, err := os.Open(entry.path)
	if err != nil {
		return err
	}
	defer file.Close()

	writeCachedEntryHeaders(w.Header(), entry, state, nowFn)
	w.WriteHeader(entry.status)
	if r.Method == http.MethodHead {
		return nil
	}
	_, _ = io.Copy(w, file)
	return nil
}

func serveMemoryHit(w http.ResponseWriter, r *http.Request, entry *cachedResponse, body []byte, state string) {
	writeCachedEntryHeaders(w.Header(), entry, state, func() time.Time { return entry.storedAt })
	w.WriteHeader(entry.status)
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}

func writeCachedEntryHeaders(dst http.Header, entry *cachedResponse, state string, nowFn func() time.Time) {
	for k, values := range entry.header {
		for _, value := range values {
			dst.Add(k, value)
		}
	}
	middleware.AppendVary(dst, "Accept")
	dst.Set("X-Moesekai-Cache", state)
	age := int64(nowFn().Sub(entry.storedAt).Seconds())
	if age < 0 {
		age = 0
	}
	dst.Set("Age", strconv.FormatInt(age, 10))
	if state == "STALE" {
		dst.Add("Warning", `110 - "Response is stale"`)
	}
}

func writeRecordedHeaders(dst http.Header, src http.Header, publicCacheable bool) {
	for k, values := range src {
		if strings.EqualFold(k, OriginCacheHeader) {
			continue
		}
		for _, value := range values {
			dst.Add(k, value)
		}
	}
	if publicCacheable {
		dst.Set("Cache-Control", "public, max-age=60, s-maxage=3600")
		middleware.AppendVary(dst, "Accept")
	}
}

func serveShared(w http.ResponseWriter, req *http.Request, shared *sharedResponse) {
	writeRecordedHeaders(w.Header(), shared.header, shared.publicCacheable)
	w.WriteHeader(shared.status)
	if req.Method != http.MethodHead {
		_, _ = w.Write(shared.body)
	}
}

type diskMeta struct {
	Key        string              `json:"key"`
	HTMLFile   string              `json:"htmlFile"`
	Status     int                 `json:"status"`
	Header     map[string][]string `json:"header"`
	Size       int64               `json:"size"`
	BuildID    string              `json:"buildId,omitempty"`
	StoredAt   time.Time           `json:"storedAt"`
	FreshUntil time.Time           `json:"freshUntil"`
	StaleUntil time.Time           `json:"staleUntil"`
}

func (c *Cache) writeDiskMetaTemp(dir, key string, value *cachedResponse) string {
	meta := diskMeta{
		Key:        key,
		HTMLFile:   filepath.Base(value.path),
		Status:     value.status,
		Header:     value.header,
		Size:       value.size,
		BuildID:    value.buildID,
		StoredAt:   value.storedAt,
		FreshUntil: value.freshUntil,
		StaleUntil: value.staleUntil,
	}
	data, err := json.Marshal(meta)
	if err != nil {
		return ""
	}
	tmp, err := os.CreateTemp(dir, ".meta-*")
	if err != nil {
		return ""
	}
	tmpName := tmp.Name()
	if _, err = tmp.Write(data); err == nil {
		if err = tmp.Close(); err == nil {
			return tmpName
		}
	} else {
		_ = tmp.Close()
	}
	_ = os.Remove(tmpName)
	return ""
}

type scanDirJob struct {
	dir          string
	isLegacyRoot bool
}

type restoreCandidate struct {
	meta         diskMeta
	metaPath     string
	htmlPath     string
	size         int64
	isLegacyRoot bool
}

type dirScanResult struct {
	candidates   []restoreCandidate
	htmlFiles    map[string]struct{}
	sweptTemp    int
	sweptCorrupt int
	sweptExpired int
}

func (c *Cache) scanCacheDir(job scanDirJob, now time.Time) dirScanResult {
	res := dirScanResult{
		htmlFiles: make(map[string]struct{}),
	}
	entries, err := os.ReadDir(job.dir)
	if err != nil {
		return res
	}
	var metaNames []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		full := filepath.Join(job.dir, name)
		if strings.HasPrefix(name, ".") || strings.HasSuffix(name, ".tmp") {
			_ = os.Remove(full)
			res.sweptTemp++
			continue
		}
		if strings.HasSuffix(name, ".html") {
			res.htmlFiles[full] = struct{}{}
			continue
		}
		if strings.HasSuffix(name, ".meta") {
			metaNames = append(metaNames, name)
		}
	}

	for _, name := range metaNames {
		metaPath := filepath.Join(job.dir, name)
		metaBytes, err := os.ReadFile(metaPath)
		if err != nil {
			_ = os.Remove(metaPath)
			res.sweptCorrupt++
			continue
		}
		var meta diskMeta
		if err := json.Unmarshal(metaBytes, &meta); err != nil ||
			meta.Key == "" ||
			meta.HTMLFile == "" ||
			filepath.Base(meta.HTMLFile) != meta.HTMLFile ||
			strings.ContainsAny(meta.HTMLFile, `/\`) {
			_ = os.Remove(metaPath)
			res.sweptCorrupt++
			continue
		}
		htmlPath := filepath.Join(job.dir, meta.HTMLFile)
		fi, err := os.Stat(htmlPath)
		if err != nil || fi.IsDir() {
			_ = os.Remove(metaPath)
			res.sweptCorrupt++
			continue
		}
		if !now.Before(meta.StaleUntil) {
			_ = os.Remove(metaPath)
			_ = os.Remove(htmlPath)
			delete(res.htmlFiles, htmlPath)
			res.sweptExpired++
			continue
		}
		res.candidates = append(res.candidates, restoreCandidate{
			meta:         meta,
			metaPath:     metaPath,
			htmlPath:     htmlPath,
			size:         fi.Size(),
			isLegacyRoot: job.isLegacyRoot,
		})
	}
	return res
}

func (c *Cache) restoreFromDisk() {
	started := time.Now()
	rootEntries, err := os.ReadDir(c.cfg.Dir)
	if err != nil {
		return
	}

	jobs := []scanDirJob{{dir: c.cfg.Dir, isLegacyRoot: true}}
	for _, e := range rootEntries {
		if e.IsDir() && len(e.Name()) == 2 {
			if b, ok := parseHexByte(e.Name()); ok {
				c.shardReady[b].Store(true)
				jobs = append(jobs, scanDirJob{
					dir:          filepath.Join(c.cfg.Dir, e.Name()),
					isLegacyRoot: false,
				})
			}
		}
	}

	now := c.now()
	jobCh := make(chan scanDirJob, len(jobs))
	for _, j := range jobs {
		jobCh <- j
	}
	close(jobCh)

	workers := restoreWorkers
	if len(jobs) < workers {
		workers = len(jobs)
	}
	results := make([]dirScanResult, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			merged := dirScanResult{htmlFiles: make(map[string]struct{})}
			for j := range jobCh {
				r := c.scanCacheDir(j, now)
				merged.candidates = append(merged.candidates, r.candidates...)
				for p := range r.htmlFiles {
					merged.htmlFiles[p] = struct{}{}
				}
				merged.sweptTemp += r.sweptTemp
				merged.sweptCorrupt += r.sweptCorrupt
				merged.sweptExpired += r.sweptExpired
			}
			results[idx] = merged
		}(i)
	}
	wg.Wait()

	byKey := make(map[string]restoreCandidate)
	allHTML := make(map[string]struct{})
	sweptTemp, sweptCorrupt, sweptExpired, sweptOrphans := 0, 0, 0, 0
	for _, r := range results {
		sweptTemp += r.sweptTemp
		sweptCorrupt += r.sweptCorrupt
		sweptExpired += r.sweptExpired
		for p := range r.htmlFiles {
			allHTML[p] = struct{}{}
		}
		for _, cand := range r.candidates {
			if prev, exists := byKey[cand.meta.Key]; exists {
				// Keep whichever entry is newer; delete the older duplicate.
				if cand.meta.StoredAt.After(prev.meta.StoredAt) {
					_ = os.Remove(prev.metaPath)
					_ = os.Remove(prev.htmlPath)
					delete(allHTML, prev.htmlPath)
					byKey[cand.meta.Key] = cand
				} else {
					_ = os.Remove(cand.metaPath)
					_ = os.Remove(cand.htmlPath)
					delete(allHTML, cand.htmlPath)
				}
				sweptOrphans++
			} else {
				byKey[cand.meta.Key] = cand
			}
		}
	}

	referenced := make(map[string]struct{}, len(byKey))
	candidates := make([]restoreCandidate, 0, len(byKey))
	for _, cand := range byKey {
		referenced[cand.htmlPath] = struct{}{}
		candidates = append(candidates, cand)
	}

	// Sweep all unreferenced orphan .html files across root and all shard directories.
	for htmlPath := range allHTML {
		if _, ok := referenced[htmlPath]; !ok {
			_ = os.Remove(htmlPath)
			sweptOrphans++
		}
	}

	// Keep the most recently stored entries up to MaxEntries and MaxBytes;
	// immediately delete all excess entries from disk.
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].meta.StoredAt.Equal(candidates[j].meta.StoredAt) {
			return candidates[i].meta.Key < candidates[j].meta.Key
		}
		return candidates[i].meta.StoredAt.After(candidates[j].meta.StoredAt)
	})

	restoredCount := 0
	otherBuildCount := 0
	migratedCount := 0
	evictedExcess := 0

	for _, cand := range candidates {
		if restoredCount >= c.cfg.MaxEntries || c.bytes+cand.size > c.cfg.MaxBytes {
			_ = os.Remove(cand.metaPath)
			_ = os.Remove(cand.htmlPath)
			evictedExcess++
			continue
		}

		htmlPath := cand.htmlPath
		if cand.isLegacyRoot {
			if targetDir, mkErr := c.ensureShardDir(cand.meta.Key); mkErr == nil && targetDir != c.cfg.Dir {
				newHTML := filepath.Join(targetDir, filepath.Base(cand.htmlPath))
				newMeta := filepath.Join(targetDir, cand.meta.Key+".meta")
				if err := os.Rename(cand.htmlPath, newHTML); err == nil {
					if err := os.Rename(cand.metaPath, newMeta); err == nil {
						htmlPath = newHTML
						migratedCount++
					} else {
						// Roll back html rename if meta rename failed.
						_ = os.Rename(newHTML, cand.htmlPath)
					}
				}
			}
		}

		freshUntil := cand.meta.FreshUntil
		if c.cfg.BuildID != "" && cand.meta.BuildID != c.cfg.BuildID {
			otherBuildCount++
			if freshUntil.After(now) {
				freshUntil = now
			}
		}

		resp := &cachedResponse{
			status:     cand.meta.Status,
			header:     cand.meta.Header,
			path:       htmlPath,
			size:       cand.size,
			buildID:    cand.meta.BuildID,
			storedAt:   cand.meta.StoredAt,
			freshUntil: freshUntil,
			staleUntil: cand.meta.StaleUntil,
		}

		// PushBack preserves newest-at-front LRU ordering.
		elem := c.lru.PushBack(&lruItem{key: cand.meta.Key, value: resp})
		c.items[cand.meta.Key] = elem
		c.bytes += resp.size
		restoredCount++
	}

	if restoredCount > 0 || sweptOrphans > 0 || evictedExcess > 0 || sweptTemp > 0 || sweptCorrupt > 0 || sweptExpired > 0 {
		fmt.Printf("[HTMLCache] Restored %d entries from %s (%d MB) in %s (other_build=%d migrated=%d evicted_excess=%d swept_orphans=%d expired=%d corrupt=%d temp=%d)\n",
			restoredCount, c.cfg.Dir, c.bytes/(1024*1024), time.Since(started).Round(time.Millisecond),
			otherBuildCount, migratedCount, evictedExcess, sweptOrphans, sweptExpired, sweptCorrupt, sweptTemp)
	}
}
