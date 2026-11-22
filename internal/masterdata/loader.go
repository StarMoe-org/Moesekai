package masterdata

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"snowy_viewer/internal/models"
)

const (
	EventsURL                = "https://metadata.exmeaning.com/jp/master/events.json"
	EventCardsURL            = "https://metadata.exmeaning.com/jp/master/eventCards.json"
	EventMusicsURL           = "https://metadata.exmeaning.com/jp/master/eventMusics.json"
	VirtualLivesURL          = "https://raw.githubusercontent.com/Team-Haruki/haruki-sekai-master/main/master/virtualLives.json"
	GachasURL                = "https://raw.githubusercontent.com/Team-Haruki/haruki-sekai-master/main/master/gachas.json"
	maxMasterDataBytes int64 = 64 << 20
	maxRetryBackoff          = 5 * time.Minute
	drainLimitBytes    int64 = 16 << 10
)

var errNotModified = errors.New("not modified")

// EncodedMap holds pre-marshaled JSON bytes and a stable ETag for a map endpoint.
type EncodedMap struct {
	Data []byte
	ETag string
}

// Snapshot is an immutable, consistent view of all masterdata mappings and
// precomputed handler indexes/payloads.
type Snapshot struct {
	CardEventMap        map[int]models.EventInfo
	MusicEventMap       map[int][]models.EventInfo
	CardGachaMap        map[int][]models.GachaInfo
	EventVirtualLiveMap map[int]models.VirtualLiveInfo
	VirtualLiveEventMap map[int]models.EventInfo

	GachaList        []models.Gacha
	GachaByStartDesc []models.Gacha
	GachaByID        map[int]models.Gacha
	GachaPickups     map[int][]int

	CardEventMapJSON        EncodedMap
	MusicEventMapJSON       EncodedMap
	CardGachaMapJSON        EncodedMap
	EventVirtualLiveMapJSON EncodedMap
	VirtualLiveEventMapJSON EncodedMap

	// Sorted valid IDs derived from masterdata for cache warmup.
	CardIDs  []int
	MusicIDs []int
	EventIDs []int
	GachaIDs []int
}

func newDefaultHTTPClient() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext
	transport.TLSHandshakeTimeout = 10 * time.Second
	transport.ResponseHeaderTimeout = 30 * time.Second
	transport.MaxIdleConns = 16
	transport.MaxIdleConnsPerHost = 8
	transport.MaxConnsPerHost = 16
	transport.IdleConnTimeout = 90 * time.Second
	return &http.Client{
		Timeout:   60 * time.Second,
		Transport: transport,
	}
}

var defaultHTTPClient = newDefaultHTTPClient()

type startupPending struct {
	events       []models.Event
	hasEvents    bool
	eventCards   []models.EventCard
	hasCards     bool
	eventMusics  []models.EventMusic
	hasMusics    bool
	virtualLives []models.VirtualLive
	hasVLs       bool
}

// Store holds all master data in memory.
type Store struct {
	mutex      sync.RWMutex
	fetchMutex sync.Mutex
	ready      bool
	lastError  error
	snapshot   atomic.Pointer[Snapshot]

	// Legacy exported fields kept populated for compatibility.
	CardEventMap        map[int]models.EventInfo
	MusicEventMap       map[int][]models.EventInfo
	CardGachaMap        map[int][]models.GachaInfo
	EventVirtualLiveMap map[int]models.VirtualLiveInfo
	VirtualLiveEventMap map[int]models.EventInfo
	GachaList           []models.Gacha
	GachaPickups        map[int][]int

	// Config & HTTP state (fetchMutex-protected)
	localDataPath   string
	httpClient      *http.Client
	etags           map[string]string
	pending         *startupPending
	eventsURL       string
	eventCardsURL   string
	eventMusicsURL  string
	virtualLivesURL string
	gachasURL       string
}

// NewStore creates a new master data store.
func NewStore(localDataPath string) *Store {
	return &Store{
		CardEventMap:        make(map[int]models.EventInfo),
		MusicEventMap:       make(map[int][]models.EventInfo),
		CardGachaMap:        make(map[int][]models.GachaInfo),
		EventVirtualLiveMap: make(map[int]models.VirtualLiveInfo),
		VirtualLiveEventMap: make(map[int]models.EventInfo),
		GachaPickups:        make(map[int][]int),
		localDataPath:       localDataPath,
		httpClient:          newDefaultHTTPClient(),
		etags:               make(map[string]string),
		eventsURL:           EventsURL,
		eventCardsURL:       EventCardsURL,
		eventMusicsURL:      EventMusicsURL,
		virtualLivesURL:     VirtualLivesURL,
		gachasURL:           GachasURL,
	}
}

func fetchJSON(url string, target interface{}) error {
	_, err := fetchJSONWithClient(context.Background(), defaultHTTPClient, url, "", target)
	return err
}

func fetchJSONWithClient(ctx context.Context, client *http.Client, url string, etag string, target interface{}) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Moesekai-Edge/1.0 (+https://pjsk.moe)")
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, drainLimitBytes))
		_ = resp.Body.Close()
	}()

	if resp.StatusCode == http.StatusNotModified {
		return etag, errNotModified
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("bad status: %s", resp.Status)
	}
	if resp.ContentLength > maxMasterDataBytes {
		return "", fmt.Errorf("masterdata response exceeds %d bytes", maxMasterDataBytes)
	}
	if err := decodeJSONLimited(resp.Body, target); err != nil {
		return "", err
	}
	return resp.Header.Get("ETag"), nil
}

func decodeJSONLimited(reader io.Reader, target interface{}) error {
	lr := &io.LimitedReader{R: reader, N: maxMasterDataBytes + 1}
	dec := json.NewDecoder(lr)
	if err := dec.Decode(target); err != nil {
		if lr.N == 0 {
			return fmt.Errorf("masterdata payload exceeds %d bytes", maxMasterDataBytes)
		}
		return err
	}
	if lr.N == 0 {
		return fmt.Errorf("masterdata payload exceeds %d bytes", maxMasterDataBytes)
	}
	// Drain any remaining bytes up to the limit to verify total payload size.
	_, _ = io.Copy(io.Discard, lr)
	if lr.N == 0 {
		return fmt.Errorf("masterdata payload exceeds %d bytes", maxMasterDataBytes)
	}
	return nil
}

func (s *Store) hasLocalFile(filename string) bool {
	if s.localDataPath == "" {
		return false
	}
	info, err := os.Stat(filepath.Join(s.localDataPath, filename))
	return err == nil && !info.IsDir() && info.Size() <= maxMasterDataBytes
}

func (s *Store) loadOrFetch(filename string, url string, target interface{}) error {
	return s.loadOrFetchContext(context.Background(), filename, url, false, target)
}

func (s *Store) loadOrFetchContext(ctx context.Context, filename string, url string, allowConditional bool, target interface{}) error {
	localPath := filepath.Join(s.localDataPath, filename)
	if info, err := os.Stat(localPath); err == nil {
		if info.Size() > maxMasterDataBytes {
			fmt.Printf("Warning: local %s exceeds %d bytes. Falling back to remote.\n", filename, maxMasterDataBytes)
		} else if file, openErr := os.Open(localPath); openErr == nil {
			defer file.Close()
			if err := decodeJSONLimited(file, target); err == nil {
				fmt.Printf("Loaded %s from local file\n", filename)
				return nil
			} else {
				fmt.Printf("Warning: failed to unmarshal local %s: %v. Falling back to remote.\n", filename, err)
			}
		} else {
			fmt.Printf("Warning: failed to read local %s: %v. Falling back to remote.\n", filename, openErr)
		}
	}
	var ifNoneMatch string
	if allowConditional {
		ifNoneMatch = s.etags[url]
	}
	newETag, err := fetchJSONWithClient(ctx, s.httpClient, url, ifNoneMatch, target)
	if err != nil {
		return err
	}
	if newETag != "" {
		s.etags[url] = newETag
	}
	return nil
}

// probeRemoteChanges sends conditional GETs with stored ETags when refreshing
// an already-ready remote snapshot. It returns true if all 5 remote files
// answered 304 Not Modified so the full decode/rebuild can be skipped.
func (s *Store) allRemoteUnchanged(ctx context.Context) bool {
	specs := []struct {
		file string
		url  string
	}{
		{"events.json", s.eventsURL},
		{"eventCards.json", s.eventCardsURL},
		{"eventMusics.json", s.eventMusicsURL},
		{"virtualLives.json", s.virtualLivesURL},
		{"gachas.json", s.gachasURL},
	}
	checked := 0
	for _, sp := range specs {
		if s.hasLocalFile(sp.file) {
			return false
		}
		etag := s.etags[sp.url]
		if etag == "" {
			return false
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, sp.url, nil)
		if err != nil {
			return false
		}
		req.Header.Set("User-Agent", "Moesekai-Edge/1.0 (+https://pjsk.moe)")
		req.Header.Set("If-None-Match", etag)
		resp, err := s.httpClient.Do(req)
		if err != nil {
			return false
		}
		status := resp.StatusCode
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, drainLimitBytes))
		_ = resp.Body.Close()
		if status != http.StatusNotModified {
			return false
		}
		checked++
	}
	return checked == len(specs)
}

// Fetch loads all master data from local files or remote.
func (s *Store) Fetch() error {
	return s.FetchContext(context.Background())
}

// FetchContext loads all master data from local files or remote, respecting ctx.
func (s *Store) FetchContext(ctx context.Context) error {
	s.fetchMutex.Lock()
	defer s.fetchMutex.Unlock()

	if err := ctx.Err(); err != nil {
		return err
	}

	// On periodic refresh after startup, skip full downloads & JSON decode if all ETags match.
	if s.IsReady() && s.allRemoteUnchanged(ctx) {
		fmt.Println("Master data unchanged (all 304 Not Modified); skipping rebuild.")
		return nil
	}

	fmt.Println("Updating master data...")

	// During startup retries, avoid re-downloading already-fetched files if a later file fails.
	isStartup := !s.IsReady()
	if isStartup && s.pending == nil {
		s.pending = &startupPending{}
	}

	var events []models.Event
	if isStartup && s.pending.hasEvents {
		events = s.pending.events
	} else {
		if err := s.loadOrFetchContext(ctx, "events.json", s.eventsURL, false, &events); err != nil {
			return s.recordFetchError(fmt.Errorf("fetch events: %w", err))
		}
		if isStartup {
			s.pending.events = events
			s.pending.hasEvents = true
		}
	}

	var eventCards []models.EventCard
	if isStartup && s.pending.hasCards {
		eventCards = s.pending.eventCards
	} else {
		if err := s.loadOrFetchContext(ctx, "eventCards.json", s.eventCardsURL, false, &eventCards); err != nil {
			return s.recordFetchError(fmt.Errorf("fetch eventCards: %w", err))
		}
		if isStartup {
			s.pending.eventCards = eventCards
			s.pending.hasCards = true
		}
	}

	var eventMusics []models.EventMusic
	if isStartup && s.pending.hasMusics {
		eventMusics = s.pending.eventMusics
	} else {
		if err := s.loadOrFetchContext(ctx, "eventMusics.json", s.eventMusicsURL, false, &eventMusics); err != nil {
			return s.recordFetchError(fmt.Errorf("fetch eventMusics: %w", err))
		}
		if isStartup {
			s.pending.eventMusics = eventMusics
			s.pending.hasMusics = true
		}
	}

	var virtualLives []models.VirtualLive
	if isStartup && s.pending.hasVLs {
		virtualLives = s.pending.virtualLives
	} else {
		if err := s.loadOrFetchContext(ctx, "virtualLives.json", s.virtualLivesURL, false, &virtualLives); err != nil {
			return s.recordFetchError(fmt.Errorf("fetch virtualLives: %w", err))
		}
		if isStartup {
			s.pending.virtualLives = virtualLives
			s.pending.hasVLs = true
		}
	}

	// Build event/card/music/virtualLive maps first and release raw slices
	// before loading the largest file (gachas.json) to minimize peak RSS.
	newCardEventMap := make(map[int]models.EventInfo, len(eventCards))
	newMusicEventMap := make(map[int][]models.EventInfo, len(eventMusics))
	eventLookup := make(map[int]models.Event, len(events))
	eventIDs := make([]int, 0, len(events))
	for _, e := range events {
		eventLookup[e.ID] = e
		if e.ID > 0 {
			eventIDs = append(eventIDs, e.ID)
		}
	}

	for _, ec := range eventCards {
		if ev, ok := eventLookup[ec.EventID]; ok {
			if existing, exists := newCardEventMap[ec.CardID]; exists {
				if ev.ID < existing.ID {
					newCardEventMap[ec.CardID] = models.EventInfo{
						ID:              ev.ID,
						Name:            ev.Name,
						AssetbundleName: ev.AssetbundleName,
					}
				}
			} else {
				newCardEventMap[ec.CardID] = models.EventInfo{
					ID:              ev.ID,
					Name:            ev.Name,
					AssetbundleName: ev.AssetbundleName,
				}
			}
		}
	}

	for _, em := range eventMusics {
		if ev, ok := eventLookup[em.EventID]; ok {
			info := models.EventInfo{
				ID:              ev.ID,
				Name:            ev.Name,
				AssetbundleName: ev.AssetbundleName,
			}
			newMusicEventMap[em.MusicID] = append(newMusicEventMap[em.MusicID], info)
		}
	}

	virtualLiveLookup := make(map[int]models.VirtualLive, len(virtualLives))
	for _, vl := range virtualLives {
		virtualLiveLookup[vl.ID] = vl
	}

	newEventVirtualLiveMap := make(map[int]models.VirtualLiveInfo)
	newVirtualLiveEventMap := make(map[int]models.EventInfo)
	for _, e := range events {
		if e.VirtualLiveId > 0 {
			if vl, ok := virtualLiveLookup[e.VirtualLiveId]; ok {
				newEventVirtualLiveMap[e.ID] = models.VirtualLiveInfo{
					ID:              vl.ID,
					Name:            vl.Name,
					AssetbundleName: vl.AssetbundleName,
				}
				newVirtualLiveEventMap[e.VirtualLiveId] = models.EventInfo{
					ID:              e.ID,
					Name:            e.Name,
					AssetbundleName: e.AssetbundleName,
				}
			}
		}
	}

	// Release raw slices & temporary lookups before decoding gachas.json.
	events = nil
	eventCards = nil
	eventMusics = nil
	virtualLives = nil
	eventLookup = nil
	virtualLiveLookup = nil

	var gachas []models.Gacha
	if err := s.loadOrFetchContext(ctx, "gachas.json", s.gachasURL, false, &gachas); err != nil {
		return s.recordFetchError(fmt.Errorf("fetch gachas: %w", err))
	}

	// Clear temporary startup cache now that all 5 files succeeded.
	s.pending = nil

	newGachaPickups := make(map[int][]int, len(gachas))
	newCardGachaMap := make(map[int][]models.GachaInfo)
	newGachaByID := make(map[int]models.Gacha, len(gachas))
	gachaIDs := make([]int, 0, len(gachas))
	for _, g := range gachas {
		newGachaByID[g.ID] = g
		if g.ID > 0 {
			gachaIDs = append(gachaIDs, g.ID)
		}
		info := models.GachaInfo{
			ID:              g.ID,
			Name:            g.Name,
			AssetbundleName: g.AssetbundleName,
		}
		for _, p := range g.GachaPickups {
			newGachaPickups[g.ID] = append(newGachaPickups[g.ID], p.CardID)
			newCardGachaMap[p.CardID] = append(newCardGachaMap[p.CardID], info)
		}
	}

	gachaSorted := make([]models.Gacha, len(gachas))
	copy(gachaSorted, gachas)
	sort.Slice(gachaSorted, func(i, j int) bool {
		if gachaSorted[i].StartAt == gachaSorted[j].StartAt {
			return gachaSorted[i].ID > gachaSorted[j].ID
		}
		return gachaSorted[i].StartAt > gachaSorted[j].StartAt
	})

	cardIDSet := make(map[int]struct{}, len(newCardEventMap)+len(newCardGachaMap))
	for id := range newCardEventMap {
		if id > 0 {
			cardIDSet[id] = struct{}{}
		}
	}
	for id := range newCardGachaMap {
		if id > 0 {
			cardIDSet[id] = struct{}{}
		}
	}
	cardIDs := make([]int, 0, len(cardIDSet))
	for id := range cardIDSet {
		cardIDs = append(cardIDs, id)
	}
	musicIDs := make([]int, 0, len(newMusicEventMap))
	for id := range newMusicEventMap {
		if id > 0 {
			musicIDs = append(musicIDs, id)
		}
	}
	sort.Ints(cardIDs)
	sort.Ints(musicIDs)
	sort.Ints(eventIDs)
	sort.Ints(gachaIDs)

	snap := &Snapshot{
		CardEventMap:            newCardEventMap,
		MusicEventMap:           newMusicEventMap,
		CardGachaMap:            newCardGachaMap,
		EventVirtualLiveMap:     newEventVirtualLiveMap,
		VirtualLiveEventMap:     newVirtualLiveEventMap,
		GachaList:               gachas,
		GachaByStartDesc:        gachaSorted,
		GachaByID:               newGachaByID,
		GachaPickups:            newGachaPickups,
		CardEventMapJSON:        marshalEncodedMap(newCardEventMap),
		MusicEventMapJSON:       marshalEncodedMap(newMusicEventMap),
		CardGachaMapJSON:        marshalEncodedMap(newCardGachaMap),
		EventVirtualLiveMapJSON: marshalEncodedMap(newEventVirtualLiveMap),
		VirtualLiveEventMapJSON: marshalEncodedMap(newVirtualLiveEventMap),
		CardIDs:                 cardIDs,
		MusicIDs:                musicIDs,
		EventIDs:                eventIDs,
		GachaIDs:                gachaIDs,
	}

	// Swap store atomically.
	s.snapshot.Store(snap)
	s.mutex.Lock()
	s.CardEventMap = newCardEventMap
	s.MusicEventMap = newMusicEventMap
	s.CardGachaMap = newCardGachaMap
	s.EventVirtualLiveMap = newEventVirtualLiveMap
	s.VirtualLiveEventMap = newVirtualLiveEventMap
	s.GachaList = gachas
	s.GachaPickups = newGachaPickups
	s.ready = true
	s.lastError = nil
	s.mutex.Unlock()

	fmt.Printf("Data updated. Mapped %d cards, %d musics, %d event-vl, loaded %d gachas.\n",
		len(newCardEventMap), len(newMusicEventMap), len(newEventVirtualLiveMap), len(gachas))
	return nil
}

func marshalEncodedMap(v interface{}) EncodedMap {
	data, err := json.Marshal(v)
	if err != nil {
		data = []byte("{}")
	}
	sum := sha256.Sum256(data)
	return EncodedMap{
		Data: data,
		ETag: `"` + hex.EncodeToString(sum[:8]) + `"`,
	}
}

func (s *Store) recordFetchError(err error) error {
	s.mutex.Lock()
	s.lastError = err
	s.mutex.Unlock()
	return err
}

// GetSnapshot returns the latest immutable masterdata snapshot, or nil before
// startup loading completes.
func (s *Store) GetSnapshot() *Snapshot {
	return s.snapshot.Load()
}

// IsReady reports whether at least one complete required masterdata snapshot
// has been loaded. Refresh failures do not discard an already valid snapshot.
func (s *Store) IsReady() bool {
	return s.snapshot.Load() != nil
}

// ReadinessError returns the most recent load error while startup is pending.
func (s *Store) ReadinessError() error {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.lastError
}

// StartRetryUntilReady retries failed startup loading until a complete
// snapshot is available.
func (s *Store) StartRetryUntilReady(interval time.Duration) {
	s.StartRetryUntilReadyContext(context.Background(), interval)
}

// StartRetryUntilReadyContext retries failed startup loading with exponential
// backoff and jitter until ready or ctx is cancelled.
func (s *Store) StartRetryUntilReadyContext(ctx context.Context, baseInterval time.Duration) {
	if baseInterval <= 0 {
		baseInterval = 30 * time.Second
	}
	go func() {
		delay := baseInterval
		for {
			if s.IsReady() || ctx.Err() != nil {
				return
			}
			if err := s.FetchContext(ctx); err != nil && ctx.Err() == nil {
				fmt.Printf("Startup masterdata retry error: %v\n", err)
			}
			if s.IsReady() || ctx.Err() != nil {
				return
			}
			wait := jitterDuration(delay)
			timer := time.NewTimer(wait)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
			delay *= 2
			if delay > maxRetryBackoff {
				delay = maxRetryBackoff
			}
		}
	}()
}

func jitterDuration(d time.Duration) time.Duration {
	if d <= 0 {
		return 0
	}
	// +/- 20% jitter
	delta := float64(d) * 0.2
	offset := (rand.Float64()*2 - 1) * delta
	res := time.Duration(float64(d) + offset)
	if res < time.Millisecond {
		return time.Millisecond
	}
	return res
}

// StartPeriodicUpdate starts a goroutine to update data periodically.
func (s *Store) StartPeriodicUpdate(interval time.Duration) {
	s.StartPeriodicUpdateContext(context.Background(), interval)
}

// StartPeriodicUpdateContext starts a cancellable periodic refresh loop.
func (s *Store) StartPeriodicUpdateContext(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 6 * time.Hour
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := s.FetchContext(ctx); err != nil && ctx.Err() == nil {
					fmt.Printf("Periodic update error: %v\n", err)
				}
			}
		}
	}()
}

// Thread-safe getters

func (s *Store) GetCardEventMap() map[int]models.EventInfo {
	if snap := s.snapshot.Load(); snap != nil {
		return snap.CardEventMap
	}
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.CardEventMap
}

func (s *Store) GetMusicEventMap() map[int][]models.EventInfo {
	if snap := s.snapshot.Load(); snap != nil {
		return snap.MusicEventMap
	}
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.MusicEventMap
}

func (s *Store) GetCardGachaMap() map[int][]models.GachaInfo {
	if snap := s.snapshot.Load(); snap != nil {
		return snap.CardGachaMap
	}
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.CardGachaMap
}

func (s *Store) GetEventVirtualLiveMap() map[int]models.VirtualLiveInfo {
	if snap := s.snapshot.Load(); snap != nil {
		return snap.EventVirtualLiveMap
	}
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.EventVirtualLiveMap
}

func (s *Store) GetVirtualLiveEventMap() map[int]models.EventInfo {
	if snap := s.snapshot.Load(); snap != nil {
		return snap.VirtualLiveEventMap
	}
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.VirtualLiveEventMap
}

func (s *Store) GetGachaList() []models.Gacha {
	if snap := s.snapshot.Load(); snap != nil {
		return snap.GachaList
	}
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.GachaList
}

func (s *Store) GetGachaPickups() map[int][]int {
	if snap := s.snapshot.Load(); snap != nil {
		return snap.GachaPickups
	}
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.GachaPickups
}
