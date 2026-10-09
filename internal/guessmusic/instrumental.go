package guessmusic

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Instrumentals are vocal-free versions of the songs, separated offline
// (scripts/guess-music/separate_instrumentals.py). They never officially
// existed, so the full files stay private: only this backend reads them, and
// everything that leaves the server is a clip of at most 30 s. Responses,
// headers and errors never mention the source location, the manifest or an
// instrumental asset name.

// InstrumentalRefreshInterval is how often the manifest is re-read.
const InstrumentalRefreshInterval = 2 * time.Minute

const (
	maxManifestBytes = 16 << 20
	manifestTimeout  = 30 * time.Second
	// maxInstDurationSec rejects absurd manifest durations (no song is an
	// hour long), which would otherwise overflow the clip start arithmetic.
	maxInstDurationSec = 3600
)

var errInstUnavailable = errors.New("guessmusic: instrumentals unavailable")

// instItem is one manifest entry.
type instItem struct {
	MusicID     int     `json:"musicId"`
	VocalID     int     `json:"vocalId"`
	Bytes       int64   `json:"bytes"`
	DurationSec float64 `json:"durationSec"`
}

type instManifest struct {
	Version   int                 `json:"version"`
	Server    string              `json:"server"`
	Model     string              `json:"model"`
	Bitrate   string              `json:"bitrate"`
	UpdatedAt string              `json:"updatedAt"`
	Items     map[string]instItem `json:"items"`
}

// instEntry is a manifest item with its asset name.
type instEntry struct {
	Asset string
	instItem
}

// instIndex is a loaded manifest indexed by vocal ID. It is immutable.
type instIndex struct {
	byVocal   map[int]instEntry
	updatedAt string
}

func (x *instIndex) lookup(vocalID int) (instEntry, bool) {
	if x == nil {
		return instEntry{}, false
	}
	e, ok := x.byVocal[vocalID]
	return e, ok
}

// newInstIndex validates a manifest. Invalid items are skipped.
func newInstIndex(m *instManifest, server string) (*instIndex, error) {
	if m.Server != "" && m.Server != server {
		return nil, fmt.Errorf("manifest is for server %q", m.Server)
	}
	idx := &instIndex{byVocal: make(map[int]instEntry, len(m.Items)), updatedAt: m.UpdatedAt}
	for asset, item := range m.Items {
		if !assetNamePattern.MatchString(asset) || item.MusicID <= 0 || item.VocalID <= 0 ||
			!(item.DurationSec > 0) || item.DurationSec > maxInstDurationSec {
			continue
		}
		if prev, dup := idx.byVocal[item.VocalID]; dup && prev.Asset < asset {
			continue // deterministic choice for duplicated vocals
		}
		idx.byVocal[item.VocalID] = instEntry{Asset: asset, instItem: item}
	}
	return idx, nil
}

// InstrumentalSource reads the private instrumental set laid out as
// <root>/<server>/manifest.json and <root>/<server>/<asset>.mp3, from a
// local directory or a Range-capable http(s) base URL. It implements
// AudioSource for instrumental asset names.
type InstrumentalSource struct {
	server string
	dir    string           // local <root>/<server>, or ""
	http   *HTTPAudioSource // remote <root>/<server>, or nil
	kind   string

	loadMu sync.Mutex
	mu     sync.RWMutex
	index  *instIndex
	failed bool // the last refresh failed (logged once per failure streak)
}

// NewInstrumentalSource parses GUESS_MUSIC_INST_SOURCE: an absolute local
// directory or an http(s) base URL. Empty returns nil (vocal removal off).
func NewInstrumentalSource(source string) (*InstrumentalSource, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, nil
	}
	s := &InstrumentalSource{server: ServerRegion}
	lower := strings.ToLower(source)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		u, err := url.Parse(source)
		if err != nil || u.Host == "" {
			return nil, errors.New("invalid instrumental source URL")
		}
		base := strings.TrimRight(source, "/") + "/" + s.server
		s.http = &HTTPAudioSource{
			BaseURL: base,
			Client:  &http.Client{Timeout: 90 * time.Second},
			layout:  func(asset string) string { return "/" + asset + ".mp3" },
		}
		s.kind = "http"
		return s, nil
	}
	if !filepath.IsAbs(source) {
		return nil, errors.New("instrumental source must be an absolute directory or an http(s) URL")
	}
	s.dir = filepath.Join(filepath.Clean(source), s.server)
	s.kind = "directory"
	return s, nil
}

// Kind describes the source without revealing its location (for logs).
func (s *InstrumentalSource) Kind() string { return s.kind }

// current returns the last successfully loaded manifest, or nil.
func (s *InstrumentalSource) current() *instIndex {
	if s == nil {
		return nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.index
}

func (s *InstrumentalSource) readManifest(ctx context.Context) ([]byte, error) {
	if s.http != nil {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.http.BaseURL+"/manifest.json", nil)
		if err != nil {
			return nil, err
		}
		resp, err := s.http.Client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("manifest status %s", resp.Status)
		}
		data, err := io.ReadAll(io.LimitReader(resp.Body, maxManifestBytes+1))
		if err != nil {
			return nil, err
		}
		if len(data) > maxManifestBytes {
			return nil, errors.New("manifest too large")
		}
		return data, nil
	}
	f, err := os.Open(filepath.Join(s.dir, "manifest.json"))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxManifestBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxManifestBytes {
		return nil, errors.New("manifest too large")
	}
	return data, nil
}

// Refresh re-reads the manifest. On failure the last good copy is kept.
func (s *InstrumentalSource) Refresh(ctx context.Context) error {
	s.loadMu.Lock()
	defer s.loadMu.Unlock()
	ctx, cancel := context.WithTimeout(ctx, manifestTimeout)
	defer cancel()
	idx, err := s.loadIndex(ctx)
	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		s.failed = true
		return err
	}
	s.failed = false
	s.index = idx
	return nil
}

func (s *InstrumentalSource) loadIndex(ctx context.Context) (*instIndex, error) {
	data, err := s.readManifest(ctx)
	if err != nil {
		return nil, fmt.Errorf("read instrumental manifest: %w", redactErr(err))
	}
	var m instManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse instrumental manifest: %w", err)
	}
	return newInstIndex(&m, s.server)
}

// Start refreshes the manifest every interval until stop is closed.
func (s *InstrumentalSource) Start(stop <-chan struct{}, interval time.Duration, logf func(string, ...interface{})) {
	if interval <= 0 {
		interval = InstrumentalRefreshInterval
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
			}
			before := s.current()
			s.mu.RLock()
			wasFailing := s.failed
			s.mu.RUnlock()
			if err := s.Refresh(context.Background()); err != nil {
				if !wasFailing {
					logf("guess-music: instrumental manifest refresh failed, keeping the last copy: %v", err)
				}
				continue
			}
			if after := s.current(); before == nil || len(after.byVocal) != len(before.byVocal) {
				logf("guess-music: instrumental manifest: %d vocals", len(after.byVocal))
			}
		}
	}()
}

func (s *InstrumentalSource) path(asset string) (string, error) {
	if !assetNamePattern.MatchString(asset) {
		return "", fmt.Errorf("invalid asset name %q", asset)
	}
	return filepath.Join(s.dir, asset+".mp3"), nil
}

// Exists reports whether the manifest lists the asset.
func (s *InstrumentalSource) Exists(_ context.Context, asset string) (bool, error) {
	idx := s.current()
	if idx == nil {
		return false, errInstUnavailable
	}
	for _, e := range idx.byVocal {
		if e.Asset == asset {
			return true, nil
		}
	}
	return false, nil
}

// redactErr drops the private location from an instrumental source error
// (the path of an *os.PathError, the URL and host of a *url.Error), so even
// the server log only ever names the source kind.
func redactErr(err error) error {
	if err == nil {
		return nil
	}
	var pathErr *os.PathError
	if errors.As(err, &pathErr) {
		return fmt.Errorf("instrumental %s: %w", pathErr.Op, pathErr.Err)
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		switch {
		case errors.Is(urlErr.Err, context.Canceled):
			return fmt.Errorf("instrumental request: %w", context.Canceled)
		case errors.Is(urlErr.Err, context.DeadlineExceeded) || urlErr.Timeout():
			return fmt.Errorf("instrumental request: %w", context.DeadlineExceeded)
		}
		return errors.New("instrumental request failed")
	}
	return err
}

// Fetch reads a whole instrumental file.
func (s *InstrumentalSource) Fetch(ctx context.Context, asset string) ([]byte, error) {
	data, err := s.fetch(ctx, asset)
	return data, redactErr(err)
}

// FetchRange reads length bytes at offset (fewer at the end of the file).
func (s *InstrumentalSource) FetchRange(ctx context.Context, asset string, offset, length int64) (*RangeData, error) {
	r, err := s.fetchRange(ctx, asset, offset, length)
	return r, redactErr(err)
}

func (s *InstrumentalSource) fetch(ctx context.Context, asset string) ([]byte, error) {
	if s.http != nil {
		return s.http.Fetch(ctx, asset)
	}
	p, err := s.path(asset)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	return readAllLimited(f, info.Size())
}

func (s *InstrumentalSource) fetchRange(ctx context.Context, asset string, offset, length int64) (*RangeData, error) {
	if s.http != nil {
		return s.http.FetchRange(ctx, asset, offset, length)
	}
	if offset < 0 || length <= 0 {
		return nil, fmt.Errorf("invalid range %d+%d", offset, length)
	}
	p, err := s.path(asset)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	total := info.Size()
	if offset >= total {
		return nil, fmt.Errorf("range %d beyond the file (%d bytes)", offset, total)
	}
	if offset+length > total {
		length = total - offset
	}
	data := make([]byte, length)
	n, err := f.ReadAt(data, offset)
	if err != nil && !(errors.Is(err, io.EOF) && int64(n) == length) {
		return nil, err
	}
	return &RangeData{Data: data[:n], Offset: offset, Total: total}, nil
}

// ---------------------------------------------------------------------------
// Pools

// instPool keeps the released songs' sung vocals that have an instrumental;
// AssetbundleName is replaced by the instrumental's asset name.
func instPool(released []poolEntry, idx *instIndex) []poolEntry {
	if idx == nil {
		return nil
	}
	out := make([]poolEntry, 0, len(released))
	for _, entry := range released {
		var sung []MusicVocal
		for _, v := range entry.vocals {
			if v.MusicVocalType == "instrumental" {
				continue // removing vocals from an instrumental is pointless
			}
			e, ok := idx.lookup(v.ID)
			if !ok || e.MusicID != v.MusicID {
				continue
			}
			v.AssetbundleName = e.Asset
			sung = append(sung, v)
		}
		if len(sung) > 0 {
			out = append(out, poolEntry{music: entry.music, vocals: sung})
		}
	}
	return out
}

// practiceVocalIDs lists the vocals free play may use with vocal removal:
// released, sung (not instrumental-only) and listed in the manifest.
func practiceVocalIDs(catalog *Catalog, idx *instIndex, now time.Time) []int {
	ids := make([]int, 0)
	if idx == nil {
		return ids
	}
	if !catalog.Ready() {
		return ids
	}
	for _, entry := range instPool(catalog.pool(now), idx) {
		for _, v := range entry.vocals {
			ids = append(ids, v.ID)
		}
	}
	sort.Ints(ids)
	return ids
}
