package htmlcache

import (
	"bytes"
	"container/list"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const OriginCacheHeader = "X-Moesekai-Origin-Cache"

type Config struct {
	Dir           string
	MaxBytes      int64
	MaxEntries    int
	MaxEntryBytes int64
	FetchTimeout  time.Duration
	Persistent    bool
}

type cachedResponse struct {
	status int
	header http.Header
	path   string
	size   int64

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
type flight struct {
	done chan struct{}
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
	next  http.Handler
	cfg   Config
	now   func() time.Time
	ready bool

	mu             sync.Mutex
	items          map[string]*list.Element
	lru            *list.List
	bytes          int64
	flights        map[string]*flight
	activeRequests atomic.Int64

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
		cfg.MaxBytes = 20 << 30
	}
	if cfg.MaxEntries <= 0 {
		cfg.MaxEntries = 100_000
	}
	if cfg.MaxEntryBytes <= 0 {
		cfg.MaxEntryBytes = 4 << 20
	}
	if cfg.FetchTimeout <= 0 {
		cfg.FetchTimeout = 30 * time.Second
	}

	var ready bool
	if cfg.Persistent {
		ready = os.MkdirAll(cfg.Dir, 0o755) == nil
		cleanOrphanTempFiles(cfg.Dir)
	} else {
		ready = os.RemoveAll(cfg.Dir) == nil && os.MkdirAll(cfg.Dir, 0o755) == nil
	}

	cache := &Cache{
		next:    next,
		cfg:     cfg,
		now:     time.Now,
		ready:   ready,
		items:   make(map[string]*list.Element),
		lru:     list.New(),
		flights: make(map[string]*flight),
	}

	if cfg.Persistent && ready {
		cache.restoreFromDisk()
	}
	return cache
}

func (c *Cache) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	c.activeRequests.Add(1)
	defer c.activeRequests.Add(-1)

	if !c.ready || !eligibleRequest(r) {
		w.Header().Set("X-Moesekai-Cache", "BYPASS")
		c.next.ServeHTTP(w, r)
		return
	}
	key := cacheKey(r)
	if entry, state := c.acquire(key); entry != nil {
		serveFile(w, r, entry, state)
		c.release(entry)
		if state == "STALE" {
			c.refresh(key, r)
		}
		return
	}
	f, leader := c.beginFlight(key)
	if !leader {
		<-f.done
		if entry, state := c.acquire(key); entry != nil {
			serveFile(w, r, entry, state)
			c.release(entry)
			return
		}
		w.Header().Set("X-Moesekai-Cache", "BYPASS")
		c.next.ServeHTTP(w, r)
		return
	}
	meta, recorded := c.fetch(r)
	stored := meta != nil && c.store(key, meta, recorded.body.Bytes())
	c.endFlight(key)
	if stored {
		if entry, _ := c.acquire(key); entry != nil {
			serveFile(w, r, entry, "MISS")
			c.release(entry)
			return
		}
	}
	w.Header().Set("X-Moesekai-Cache", "BYPASS")
	serveRecorded(w, r, recorded)
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
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/"), "/")
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

func cacheKey(r *http.Request) string {
	sum := sha256.Sum256([]byte(r.URL.EscapedPath()))
	return hex.EncodeToString(sum[:])
}

func (c *Cache) fetch(r *http.Request) (*cachedResponse, *responseRecorder) {
	ctx, cancel := context.WithTimeout(context.Background(), c.cfg.FetchTimeout)
	defer cancel()
	req := r.Clone(ctx)
	req.Method = http.MethodGet
	req.Body = nil
	req.Header = r.Header.Clone()
	req.Header.Del("Accept-Encoding")
	recorder := &responseRecorder{header: make(http.Header), status: http.StatusOK}
	c.next.ServeHTTP(recorder, req)
	return c.makeEntry(recorder), recorder
}

type responseRecorder struct {
	header      http.Header
	status      int
	wroteHeader bool
	body        bytes.Buffer
}

func (r *responseRecorder) Header() http.Header { return r.header }
func (r *responseRecorder) WriteHeader(code int) {
	if !r.wroteHeader {
		r.status, r.wroteHeader = code, true
	}
}
func (r *responseRecorder) Write(p []byte) (int, error) {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	return r.body.Write(p)
}

func appendVaryAccept(h http.Header) {
	existing := h.Get("Vary")
	if existing == "" {
		h.Set("Vary", "Accept")
		return
	}
	parts := strings.Split(existing, ",")
	for _, p := range parts {
		if strings.EqualFold(strings.TrimSpace(p), "Accept") {
			return
		}
	}
	h.Set("Vary", existing+", Accept")
}

func (c *Cache) makeEntry(r *responseRecorder) *cachedResponse {
	fresh, swr, ok := parsePolicy(r.header.Get(OriginCacheHeader))
	if !ok || r.status != http.StatusOK || !strings.HasPrefix(strings.ToLower(r.header.Get("Content-Type")), "text/html") || len(r.header.Values("Set-Cookie")) > 0 || int64(r.body.Len()) > c.cfg.MaxEntryBytes {
		return nil
	}
	header := cacheableHeaders(r.header)
	header.Set("Cache-Control", "public, max-age=60, s-maxage=3600")
	appendVaryAccept(header)
	now := c.now()
	return &cachedResponse{status: r.status, header: header, size: int64(r.body.Len()), storedAt: now, freshUntil: now.Add(fresh), staleUntil: now.Add(fresh + swr)}
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

func (c *Cache) store(key string, value *cachedResponse, body []byte) bool {
	if value.size > c.cfg.MaxBytes {
		return false
	}
	tmp, err := os.CreateTemp(c.cfg.Dir, ".write-*")
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
	if err = tmp.Sync(); err != nil {
		return false
	}
	if err = tmp.Close(); err != nil {
		return false
	}
	finalPath := filepath.Join(c.cfg.Dir, key+"-"+filepath.Base(tmpName)+".html")
	if err = os.Rename(tmpName, finalPath); err != nil {
		return false
	}
	ok = true
	value.path = finalPath

	c.mu.Lock()
	if old := c.items[key]; old != nil {
		c.removeLocked(old)
	}
	elem := c.lru.PushFront(&lruItem{key: key, value: value})
	c.items[key] = elem
	c.bytes += value.size
	for c.bytes > c.cfg.MaxBytes || c.lru.Len() > c.cfg.MaxEntries {
		c.removeLocked(c.lru.Back())
	}
	stored := c.items[key] == elem
	c.mu.Unlock()

	// The sidecar is named after the cache key, not after the HTML file, so it
	// must be written after eviction: retiring the previous entry for this key
	// (or evicting this one right back out) deletes that same path.
	if stored && c.cfg.Persistent {
		c.writeDiskMeta(key, value)
	}
	return stored
}

func (c *Cache) acquire(key string) (*cachedResponse, string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	elem := c.items[key]
	if elem == nil {
		return nil, ""
	}
	item := elem.Value.(*lruItem)
	now := c.now()
	if !now.Before(item.value.staleUntil) {
		c.removeLocked(elem)
		return nil, ""
	}
	if _, err := os.Stat(item.value.path); err != nil {
		c.removeLocked(elem)
		return nil, ""
	}
	c.lru.MoveToFront(elem)
	item.value.refs++
	if now.Before(item.value.freshUntil) {
		return item.value, "HIT"
	}
	return item.value, "STALE"
}
func (c *Cache) release(value *cachedResponse) {
	c.mu.Lock()
	value.refs--
	if value.refs == 0 && value.retired {
		_ = os.Remove(value.path)
	}
	c.mu.Unlock()
}
func (c *Cache) removeLocked(elem *list.Element) {
	if elem == nil {
		return
	}
	item := elem.Value.(*lruItem)
	delete(c.items, item.key)
	c.bytes -= item.value.size
	c.lru.Remove(elem)
	item.value.retired = true
	if c.cfg.Persistent {
		_ = os.Remove(filepath.Join(c.cfg.Dir, item.key+".meta"))
	}
	if item.value.refs == 0 {
		_ = os.Remove(item.value.path)
	}
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
func (c *Cache) endFlight(key string) {
	c.mu.Lock()
	if f := c.flights[key]; f != nil {
		delete(c.flights, key)
		close(f.done)
	}
	c.mu.Unlock()
}
func (c *Cache) refresh(key string, r *http.Request) {
	_, leader := c.beginFlight(key)
	if !leader {
		return
	}
	clone := r.Clone(context.Background())
	go func() {
		meta, recorded := c.fetch(clone)
		if meta != nil {
			_ = c.store(key, meta, recorded.body.Bytes())
		}
		c.endFlight(key)
	}()
}

func serveFile(w http.ResponseWriter, r *http.Request, entry *cachedResponse, state string) {
	for k, values := range entry.header {
		for _, value := range values {
			w.Header().Add(k, value)
		}
	}
	appendVaryAccept(w.Header())
	w.Header().Set("X-Moesekai-Cache", state)
	age := int64(time.Since(entry.storedAt).Seconds())
	if age < 0 {
		age = 0
	}
	w.Header().Set("Age", strconv.FormatInt(age, 10))
	if state == "STALE" {
		w.Header().Add("Warning", `110 - "Response is stale"`)
	}
	w.WriteHeader(entry.status)
	if r.Method == http.MethodHead {
		return
	}
	file, err := os.Open(entry.path)
	if err != nil {
		return
	}
	defer file.Close()
	_, _ = io.Copy(w, file)
}
func serveRecorded(w http.ResponseWriter, req *http.Request, recorded *responseRecorder) {
	isCacheable := recorded.header.Get(OriginCacheHeader) != ""
	for k, values := range recorded.header {
		if strings.EqualFold(k, OriginCacheHeader) {
			continue
		}
		for _, value := range values {
			w.Header().Add(k, value)
		}
	}
	if isCacheable {
		w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=3600")
		appendVaryAccept(w.Header())
	}
	w.WriteHeader(recorded.status)
	if req.Method != http.MethodHead {
		_, _ = w.Write(recorded.body.Bytes())
	}
}

type diskMeta struct {
	Key        string              `json:"key"`
	HTMLFile   string              `json:"htmlFile"`
	Status     int                 `json:"status"`
	Header     map[string][]string `json:"header"`
	Size       int64               `json:"size"`
	StoredAt   time.Time           `json:"storedAt"`
	FreshUntil time.Time           `json:"freshUntil"`
	StaleUntil time.Time           `json:"staleUntil"`
}

func (c *Cache) writeDiskMeta(key string, value *cachedResponse) {
	meta := diskMeta{
		Key:        key,
		HTMLFile:   filepath.Base(value.path),
		Status:     value.status,
		Header:     value.header,
		Size:       value.size,
		StoredAt:   value.storedAt,
		FreshUntil: value.freshUntil,
		StaleUntil: value.staleUntil,
	}
	data, err := json.Marshal(meta)
	if err != nil {
		return
	}
	tmp, err := os.CreateTemp(c.cfg.Dir, ".meta-*")
	if err != nil {
		return
	}
	tmpName := tmp.Name()
	if _, err = tmp.Write(data); err == nil && tmp.Sync() == nil {
		_ = tmp.Close()
		_ = os.Rename(tmpName, filepath.Join(c.cfg.Dir, key+".meta"))
	} else {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
	}
}

func (c *Cache) restoreFromDisk() {
	started := time.Now()
	files, err := os.ReadDir(c.cfg.Dir)
	if err != nil {
		return
	}
	now := c.now()
	restoredCount := 0
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".meta") {
			continue
		}
		metaPath := filepath.Join(c.cfg.Dir, f.Name())
		metaBytes, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}
		var meta diskMeta
		if err := json.Unmarshal(metaBytes, &meta); err != nil {
			continue
		}
		htmlPath := filepath.Join(c.cfg.Dir, meta.HTMLFile)
		fi, err := os.Stat(htmlPath)
		if err != nil || !now.Before(meta.StaleUntil) {
			_ = os.Remove(metaPath)
			if err == nil {
				_ = os.Remove(htmlPath)
			}
			continue
		}

		resp := &cachedResponse{
			status:     meta.Status,
			header:     meta.Header,
			path:       htmlPath,
			size:       fi.Size(),
			storedAt:   meta.StoredAt,
			freshUntil: meta.FreshUntil,
			staleUntil: meta.StaleUntil,
		}

		elem := c.lru.PushFront(&lruItem{key: meta.Key, value: resp})
		c.items[meta.Key] = elem
		c.bytes += resp.size
		restoredCount++
	}
	if restoredCount > 0 {
		fmt.Printf("[HTMLCache] Restored %d persistent cache entries from %s (%d MB) in %s\n", restoredCount, c.cfg.Dir, c.bytes/(1024*1024), time.Since(started).Round(time.Millisecond))
	}
}

func cleanOrphanTempFiles(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), ".") {
			_ = os.Remove(filepath.Join(dir, e.Name()))
		}
	}
}
