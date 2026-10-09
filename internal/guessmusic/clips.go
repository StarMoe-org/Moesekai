package guessmusic

import (
	"container/list"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// DefaultAudioBaseURL hosts music/long/<name>/<name>.mp3 (JP assets).
const DefaultAudioBaseURL = "https://storage.exmeaning.com/sekai-jp-assets"

// DefaultClipCacheDir is where generated clips are cached on disk.
const DefaultClipCacheDir = "./data/guess_music_clips"

const (
	maxSourceAudioBytes = 40 << 20
	clipGenerateTimeout = 2 * time.Minute
	clipFailureBackoff  = 10 * time.Second
	// maxClipFailures bounds the remembered failures (one per clip key) so
	// failing requests for ever new clips cannot grow the map without end.
	maxClipFailures = 512
	// defaultClipMemoryBytes caps the in-memory clip LRU.
	defaultClipMemoryBytes = 64 << 20
	// clipDiskDays keeps clip directories of this many previous days.
	clipDiskDays = 2

	// headFetchBytes is the first range read: ID3v2 + Info frame + a few
	// audio frames.
	headFetchBytes = 8 << 10
	// rangeMarginBytes / rangeMarginFrames pad the clip's byte range so the
	// frame sync inside it always finds the needed frames.
	rangeMarginBytes  = 4 << 10
	rangeMarginFrames = 2
)

// RangeData is a byte range of an audio file.
type RangeData struct {
	Data   []byte
	Offset int64 // file offset of Data[0]
	Total  int64 // size of the whole file
	Full   bool  // the server ignored the range and sent the whole file
}

// AudioSource provides the full-length vocal audio.
type AudioSource interface {
	Exists(ctx context.Context, asset string) (bool, error)
	// Fetch downloads the whole file.
	Fetch(ctx context.Context, asset string) ([]byte, error)
	// FetchRange reads length bytes at offset (fewer at the end of file).
	FetchRange(ctx context.Context, asset string, offset, length int64) (*RangeData, error)
}

// HTTPAudioSource downloads vocals from the asset CDN.
type HTTPAudioSource struct {
	BaseURL string
	Client  *http.Client
	// layout maps an asset to its path under BaseURL (default
	// /music/long/<a>/<a>.mp3).
	layout func(asset string) string
}

// NewHTTPAudioSource creates a source rooted at baseURL.
func NewHTTPAudioSource(baseURL string) *HTTPAudioSource {
	if baseURL == "" {
		baseURL = DefaultAudioBaseURL
	}
	return &HTTPAudioSource{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Client:  &http.Client{Timeout: 90 * time.Second},
	}
}

func (s *HTTPAudioSource) url(asset string) (string, error) {
	if !assetNamePattern.MatchString(asset) {
		return "", fmt.Errorf("invalid asset name %q", asset)
	}
	if s.layout != nil {
		return s.BaseURL + s.layout(asset), nil
	}
	return fmt.Sprintf("%s/music/long/%s/%s.mp3", s.BaseURL, asset, asset), nil
}

func (s *HTTPAudioSource) Exists(ctx context.Context, asset string) (bool, error) {
	u, err := s.url(asset)
	if err != nil {
		return false, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, u, nil)
	if err != nil {
		return false, err
	}
	resp, err := s.Client.Do(req)
	if err != nil {
		return false, err
	}
	resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusOK:
		return true, nil
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusGone:
		return false, nil
	default:
		return false, fmt.Errorf("HEAD status %s", resp.Status)
	}
}

func readAllLimited(body io.Reader, contentLength int64) ([]byte, error) {
	if contentLength > maxSourceAudioBytes {
		return nil, errors.New("audio file too large")
	}
	data, err := io.ReadAll(io.LimitReader(body, maxSourceAudioBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxSourceAudioBytes {
		return nil, errors.New("audio file too large")
	}
	return data, nil
}

func (s *HTTPAudioSource) Fetch(ctx context.Context, asset string) ([]byte, error) {
	u, err := s.url(asset)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET audio status %s", resp.Status)
	}
	return readAllLimited(resp.Body, resp.ContentLength)
}

func (s *HTTPAudioSource) FetchRange(ctx context.Context, asset string, offset, length int64) (*RangeData, error) {
	if offset < 0 || length <= 0 {
		return nil, fmt.Errorf("invalid range %d+%d", offset, length)
	}
	u, err := s.url(asset)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	// With a Range header the transport does not ask for gzip, so the
	// offsets are those of the file itself.
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", offset, offset+length-1))
	resp, err := s.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusPartialContent:
		start, _, total, ok := parseContentRange(resp.Header.Get("Content-Range"))
		if !ok || start != offset {
			return nil, fmt.Errorf("unexpected Content-Range %q", resp.Header.Get("Content-Range"))
		}
		data, err := io.ReadAll(io.LimitReader(resp.Body, length+1))
		if err != nil {
			return nil, err
		}
		if int64(len(data)) > length {
			data = data[:length]
		}
		return &RangeData{Data: data, Offset: start, Total: total}, nil
	case http.StatusOK:
		data, err := readAllLimited(resp.Body, resp.ContentLength)
		if err != nil {
			return nil, err
		}
		return &RangeData{Data: data, Total: int64(len(data)), Full: true}, nil
	default:
		return nil, fmt.Errorf("GET audio range status %s", resp.Status)
	}
}

// parseContentRange parses "bytes start-end/total".
func parseContentRange(v string) (start, end, total int64, ok bool) {
	v = strings.TrimSpace(v)
	if !strings.HasPrefix(v, "bytes ") {
		return 0, 0, 0, false
	}
	rng, size, found := strings.Cut(v[len("bytes "):], "/")
	if !found {
		return 0, 0, 0, false
	}
	a, b, found := strings.Cut(rng, "-")
	if !found {
		return 0, 0, 0, false
	}
	var err1, err2, err3 error
	start, err1 = strconv.ParseInt(a, 10, 64)
	end, err2 = strconv.ParseInt(b, 10, 64)
	total, err3 = strconv.ParseInt(size, 10, 64)
	if err1 != nil || err2 != nil || err3 != nil || start < 0 || end < start || total <= end {
		return 0, 0, 0, false
	}
	return start, end, total, true
}

// ---------------------------------------------------------------------------
// Loading just enough audio

// fetchStats records the CDN traffic of one clip.
type fetchStats struct {
	bytes    int64
	requests int
	mode     string
}

func (f *fetchStats) add(r *RangeData) {
	f.bytes += int64(len(r.Data))
	f.requests++
}

// loadStream loads the part of the plan's audio needed to cut its clip with
// lead frames before the window: a head read to learn the layout, then one
// byte range. Without Range support (or for VBR files) it falls back to the
// whole file.
func loadStream(ctx context.Context, src AudioSource, plan RoundPlan, lead int, st *fetchStats) (*mp3Stream, error) {
	head, err := src.FetchRange(ctx, plan.Asset, 0, headFetchBytes)
	if err != nil {
		return nil, fmt.Errorf("download audio head: %w", err)
	}
	st.add(head)
	if head.Full {
		st.mode = "full (no range support)"
		return parseMP3(head.Data)
	}
	stream, err := loadRange(ctx, src, plan, lead, head, st)
	if err == nil {
		return stream, nil
	}
	if ctx.Err() != nil {
		return nil, err
	}
	data, ferr := src.Fetch(ctx, plan.Asset)
	if ferr != nil {
		return nil, fmt.Errorf("download audio: %w (range read: %v)", ferr, err)
	}
	st.bytes += int64(len(data))
	st.requests++
	st.mode = "full (" + err.Error() + ")"
	return parseMP3(data)
}

func loadRange(ctx context.Context, src AudioSource, plan RoundPlan, lead int, head *RangeData, st *fetchStats) (*mp3Stream, error) {
	total := head.Total
	if total <= 0 {
		return nil, errors.New("unknown file size")
	}
	tag := int64(id3v2DeclaredSize(head.Data))
	probe := head.Data
	if tag > 0 {
		// Keep enough after the tag for the Info frame and two audio frames.
		if tag+5<<10 <= int64(len(head.Data)) {
			probe = head.Data[tag:]
		} else {
			if tag >= total {
				return nil, errNoFrames
			}
			more, err := src.FetchRange(ctx, plan.Asset, tag, headFetchBytes)
			if err != nil {
				return nil, err
			}
			st.add(more)
			if more.Full {
				st.mode = "full (no range support)"
				return parseMP3(more.Data)
			}
			probe = more.Data
		}
	}
	info, err := probeCBR(probe, tag, total)
	if err != nil {
		return nil, err
	}
	fd := info.frameDuration()
	duration := float64(info.frames) * fd
	if duration < float64(plan.ClipSeconds) {
		return nil, fmt.Errorf("audio is shorter (%.1fs) than the clip", duration)
	}
	start := plan.clipStart(duration)
	first := int(math.Floor(start/fd + 1e-9))
	end := int(math.Ceil((start+float64(plan.ClipSeconds))/fd - 1e-9))
	lo := first - lead - rangeMarginFrames
	if lo < 0 {
		lo = 0
	}
	hi := end + rangeMarginFrames
	if hi > info.frames {
		hi = info.frames
	}
	from := int64(info.frameOffset(lo)) - rangeMarginBytes
	if from < info.audioStart {
		from = info.audioStart
	}
	to := int64(math.Ceil(info.frameOffset(hi))) + rangeMarginBytes
	if to > total {
		to = total
	}
	chunk, err := src.FetchRange(ctx, plan.Asset, from, to-from)
	if err != nil {
		return nil, err
	}
	st.add(chunk)
	if chunk.Full {
		st.mode = "full (no range support)"
		return parseMP3(chunk.Data)
	}
	stream, err := parseCBRChunk(chunk.Data, chunk.Offset, info)
	if err != nil {
		return nil, err
	}
	if _, _, err := stream.span(start, float64(plan.ClipSeconds)); err != nil {
		return nil, err
	}
	if want := first - lead; stream.base > want && stream.base > 0 {
		return nil, errWindowOutside // lead-in frames missing from the range
	}
	st.mode = "range"
	return stream, nil
}

// Clip is a finished round clip.
type Clip struct {
	Data         []byte
	ContentType  string
	StartSeconds float64
	Seconds      float64
}

// buildClip cuts the plan's clip (whole frames, no tags). Vocal-removed
// clips are cut the same way from the instrumental.
func buildClip(stream *mp3Stream, plan RoundPlan) (*Clip, error) {
	duration := stream.Duration()
	if duration < float64(plan.ClipSeconds) {
		return nil, fmt.Errorf("audio is shorter (%.1fs) than the clip", duration)
	}
	start := plan.clipStart(duration)
	cut, err := stream.Slice(start, float64(plan.ClipSeconds))
	if err != nil {
		return nil, err
	}
	return &Clip{
		Data:         cut.Data,
		ContentType:  "audio/mpeg",
		StartSeconds: math.Round(cut.StartSeconds*1000) / 1000,
		Seconds:      math.Round(cut.Seconds*1000) / 1000,
	}, nil
}

// cutClip builds the plan's clip from a whole mp3 file.
func cutClip(source []byte, plan RoundPlan) (*Clip, error) {
	stream, err := parseMP3(source)
	if err != nil {
		return nil, err
	}
	return buildClip(stream, plan)
}

// ---------------------------------------------------------------------------
// Clip records (disk cache format)

type clipMeta struct {
	StartSeconds float64 `json:"startSeconds"`
	Seconds      float64 `json:"seconds"`
	ContentType  string  `json:"contentType"`
}

func encodeClip(c *Clip) []byte {
	meta, _ := json.Marshal(clipMeta{StartSeconds: c.StartSeconds, Seconds: c.Seconds, ContentType: c.ContentType})
	out := make([]byte, 4+len(meta)+len(c.Data))
	binary.BigEndian.PutUint32(out, uint32(len(meta)))
	copy(out[4:], meta)
	copy(out[4+len(meta):], c.Data)
	return out
}

func decodeClip(b []byte) (*Clip, error) {
	if len(b) < 4 {
		return nil, errors.New("clip record too short")
	}
	n := int(binary.BigEndian.Uint32(b))
	if n > len(b)-4 {
		return nil, errors.New("clip record corrupt")
	}
	var meta clipMeta
	if err := json.Unmarshal(b[4:4+n], &meta); err != nil {
		return nil, err
	}
	data := b[4+n:]
	if len(data) == 0 || meta.ContentType == "" {
		return nil, errors.New("clip record has no audio")
	}
	return &Clip{Data: data, ContentType: meta.ContentType, StartSeconds: meta.StartSeconds, Seconds: meta.Seconds}, nil
}

// ---------------------------------------------------------------------------
// Clip manager

// clipJob identifies one round clip of one question set.
type clipJob struct {
	Date  string
	Tier  string
	Mode  string
	Round int
	Plan  RoundPlan
}

func (j clipJob) name() string {
	return j.Tier + "-" + j.Mode + "-" + strconv.Itoa(j.Round) + "-" + j.Plan.fingerprint()
}

func (j clipJob) key() string { return j.Date + "/" + j.name() }

func (j clipJob) label() string {
	return fmt.Sprintf("%s %s/%s #%d", j.Date, j.Tier, j.Mode, j.Round)
}

type clipCall struct {
	done chan struct{}
	clip *Clip
	err  error
}

type clipFailure struct {
	err error
	at  time.Time
}

type lruItem struct {
	key  string
	clip *Clip
}

// clipManager generates, caches (memory LRU + disk) and deduplicates round
// clips. Clips are deterministic, so every instance can build its own.
type clipManager struct {
	source AudioSource
	// inst serves vocal-removed plans (the private instrumentals); nil
	// makes them fail.
	inst   AudioSource
	dir    string // "" disables the disk cache
	maxMem int64
	logf   func(string, ...interface{})
	now    func() time.Time

	fetchedBytes atomic.Int64
	diskWarned   atomic.Bool

	mu       sync.Mutex
	lru      *list.List
	items    map[string]*list.Element
	memBytes int64
	inflight map[string]*clipCall
	failures map[string]clipFailure
}

func newClipManager(source AudioSource, dir string, maxMem int64, logf func(string, ...interface{})) *clipManager {
	if maxMem <= 0 {
		maxMem = defaultClipMemoryBytes
	}
	return &clipManager{
		source:   source,
		dir:      dir,
		maxMem:   maxMem,
		logf:     logf,
		now:      time.Now,
		lru:      list.New(),
		items:    make(map[string]*list.Element),
		inflight: make(map[string]*clipCall),
		failures: make(map[string]clipFailure),
	}
}

func (m *clipManager) diskPath(j clipJob) string {
	return filepath.Join(m.dir, j.Date, j.name()+".clip")
}

// memGet returns a memory-cached clip. m.mu held.
func (m *clipManager) memGetLocked(key string) *Clip {
	if el := m.items[key]; el != nil {
		m.lru.MoveToFront(el)
		return el.Value.(*lruItem).clip
	}
	return nil
}

func (m *clipManager) memPut(key string, c *Clip) {
	size := int64(len(c.Data))
	if size > m.maxMem {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if el := m.items[key]; el != nil {
		m.lru.MoveToFront(el)
		return
	}
	m.items[key] = m.lru.PushFront(&lruItem{key: key, clip: c})
	m.memBytes += size
	for m.memBytes > m.maxMem {
		back := m.lru.Back()
		if back == nil {
			break
		}
		item := back.Value.(*lruItem)
		m.lru.Remove(back)
		delete(m.items, item.key)
		m.memBytes -= int64(len(item.clip.Data))
	}
}

// has reports whether the clip is cached in memory or on disk.
func (m *clipManager) has(j clipJob) bool {
	m.mu.Lock()
	_, ok := m.items[j.key()]
	m.mu.Unlock()
	if ok {
		return true
	}
	if m.dir == "" {
		return false
	}
	_, err := os.Stat(m.diskPath(j))
	return err == nil
}

// peek returns a cached clip without generating it.
func (m *clipManager) peek(j clipJob) *Clip {
	key := j.key()
	m.mu.Lock()
	c := m.memGetLocked(key)
	m.mu.Unlock()
	if c != nil {
		return c
	}
	if c := m.readDisk(j); c != nil {
		m.memPut(key, c)
		return c
	}
	return nil
}

// Get returns the clip, generating it at most once at a time. The
// generation outlives ctx so concurrent waiters share it.
func (m *clipManager) Get(ctx context.Context, j clipJob) (*Clip, error) {
	key := j.key()
	m.mu.Lock()
	if c := m.memGetLocked(key); c != nil {
		m.mu.Unlock()
		return c, nil
	}
	if f, ok := m.failures[key]; ok && m.now().Sub(f.at) < clipFailureBackoff {
		m.mu.Unlock()
		return nil, f.err
	}
	call := m.inflight[key]
	if call == nil {
		call = &clipCall{done: make(chan struct{})}
		m.inflight[key] = call
		go m.generate(key, j, call)
	}
	m.mu.Unlock()

	select {
	case <-call.done:
		return call.clip, call.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (m *clipManager) generate(key string, j clipJob, call *clipCall) {
	ctx, cancel := context.WithTimeout(context.Background(), clipGenerateTimeout)
	defer cancel()
	clip, err := m.load(ctx, j)
	if err == nil {
		m.memPut(key, clip)
	}
	m.mu.Lock()
	if err == nil {
		delete(m.failures, key)
	} else {
		m.rememberFailureLocked(key, err)
	}
	delete(m.inflight, key)
	m.mu.Unlock()

	call.clip, call.err = clip, err
	close(call.done)
}

// rememberFailureLocked backs key off for clipFailureBackoff. Failures past
// their backoff are forgotten once the map is full, and if they are all
// recent the oldest goes. m.mu held.
func (m *clipManager) rememberFailureLocked(key string, err error) {
	now := m.now()
	if _, known := m.failures[key]; !known && len(m.failures) >= maxClipFailures {
		oldestKey, oldest := "", now
		for k, f := range m.failures {
			if now.Sub(f.at) >= clipFailureBackoff {
				delete(m.failures, k)
			} else if f.at.Before(oldest) || oldestKey == "" {
				oldestKey, oldest = k, f.at
			}
		}
		if len(m.failures) >= maxClipFailures {
			delete(m.failures, oldestKey)
		}
	}
	m.failures[key] = clipFailure{err: err, at: now}
}

func (m *clipManager) readDisk(j clipJob) *Clip {
	if m.dir == "" {
		return nil
	}
	raw, err := os.ReadFile(m.diskPath(j))
	if err != nil {
		return nil
	}
	c, err := decodeClip(raw)
	if err != nil {
		m.logf("guess-music: dropping corrupt cached clip %s: %v", j.label(), err)
		_ = os.Remove(m.diskPath(j))
		return nil
	}
	return c
}

func (m *clipManager) writeDisk(j clipJob, c *Clip) {
	if m.dir == "" {
		return
	}
	path := m.diskPath(j)
	err := os.MkdirAll(filepath.Dir(path), 0o755)
	if err == nil {
		var tmp *os.File
		tmp, err = os.CreateTemp(filepath.Dir(path), ".tmp-*")
		if err == nil {
			_, err = tmp.Write(encodeClip(c))
			if cerr := tmp.Close(); err == nil {
				err = cerr
			}
			if err == nil {
				err = os.Rename(tmp.Name(), path)
			}
			if err != nil {
				_ = os.Remove(tmp.Name())
			}
		}
	}
	if err != nil && !m.diskWarned.Swap(true) {
		m.logf("guess-music: clip disk cache unavailable: %v", err)
	}
}

func (m *clipManager) load(ctx context.Context, j clipJob) (*Clip, error) {
	if c := m.readDisk(j); c != nil {
		return c, nil
	}
	began := time.Now()
	src := m.source
	if j.Plan.VocalRemoval {
		if m.inst == nil {
			return nil, errInstUnavailable
		}
		src = m.inst
	}
	var st fetchStats
	stream, err := loadStream(ctx, src, j.Plan, maxLeadFrames, &st)
	m.fetchedBytes.Add(st.bytes)
	if err != nil {
		return nil, err
	}
	clip, err := buildClip(stream, j.Plan)
	if err != nil {
		return nil, err
	}
	m.logf("guess-music: clip %s: fetched %d bytes in %d requests (%s), clip %d bytes %s, %dms",
		j.label(), st.bytes, st.requests, st.mode, len(clip.Data), clip.ContentType, time.Since(began).Milliseconds())
	m.writeDisk(j, clip)
	return clip, nil
}

// pruneDisk removes cached clip directories of dates before keepFrom.
func (m *clipManager) pruneDisk(keepFrom string) {
	if m.dir == "" {
		return
	}
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		name := e.Name()
		if !e.IsDir() || len(name) != len("2006-01-02") || name >= keepFrom {
			continue
		}
		if _, err := time.Parse("2006-01-02", name); err != nil {
			continue
		}
		if err := os.RemoveAll(filepath.Join(m.dir, name)); err != nil {
			m.logf("guess-music: prune clip cache %s: %v", name, err)
		}
	}
}
