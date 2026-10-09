package guessmusic

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Master data sources (JP), same host as internal/masterdata.
const (
	MusicsURL      = "https://metadata.exmeaning.com/jp/master/musics.json"
	MusicVocalsURL = "https://metadata.exmeaning.com/jp/master/musicVocals.json"
)

var assetNamePattern = regexp.MustCompile(`^[A-Za-z0-9_\-]{1,64}$`)

// Music is the subset of musics.json used by the game.
type Music struct {
	ID              int     `json:"id"`
	Title           string  `json:"title"`
	Pronunciation   string  `json:"pronunciation"`
	AssetbundleName string  `json:"assetbundleName"`
	PublishedAt     int64   `json:"publishedAt"`
	FillerSec       float64 `json:"fillerSec"`
}

// MusicVocal is the subset of musicVocals.json used by the game.
type MusicVocal struct {
	ID              int    `json:"id"`
	MusicID         int    `json:"musicId"`
	MusicVocalType  string `json:"musicVocalType"`
	Caption         string `json:"caption"`
	AssetbundleName string `json:"assetbundleName"`
}

// allowedVocalType reports whether a vocal type may be used for questions.
func allowedVocalType(t string) bool {
	switch t {
	case "sekai", "virtual_singer", "original_song", "another_vocal", "instrumental":
		return true
	}
	return strings.HasPrefix(t, "april_fool")
}

// LoadFunc loads one master data file into target (see masterdata.LoadOrFetchJSON).
type LoadFunc func(filename, url string, target interface{}) error

// Catalog holds the JP music master data.
type Catalog struct {
	load LoadFunc

	fetchMu sync.Mutex
	mu      sync.RWMutex
	ready   bool
	musics  map[int]Music
	vocals  map[int][]MusicVocal // by music ID, sorted by vocal ID
	lastErr error
}

// NewCatalog creates an empty catalog that loads data through load.
func NewCatalog(load LoadFunc) *Catalog {
	return &Catalog{load: load}
}

// NewStaticCatalog creates a ready catalog from in-memory data (tests).
func NewStaticCatalog(musics []Music, vocals []MusicVocal) *Catalog {
	c := &Catalog{}
	c.set(musics, vocals)
	return c
}

func (c *Catalog) set(musics []Music, vocals []MusicVocal) {
	byID := make(map[int]Music, len(musics))
	for _, m := range musics {
		byID[m.ID] = m
	}
	byMusic := make(map[int][]MusicVocal)
	for _, v := range vocals {
		byMusic[v.MusicID] = append(byMusic[v.MusicID], v)
	}
	for id := range byMusic {
		list := byMusic[id]
		sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
	}
	c.mu.Lock()
	c.musics = byID
	c.vocals = byMusic
	c.ready = true
	c.lastErr = nil
	c.mu.Unlock()
}

// Fetch (re)loads the master data. A failed refresh keeps the last snapshot.
func (c *Catalog) Fetch() error {
	if c.load == nil {
		return errors.New("guessmusic: catalog has no loader")
	}
	c.fetchMu.Lock()
	defer c.fetchMu.Unlock()
	var musics []Music
	if err := c.load("musics.json", MusicsURL, &musics); err != nil {
		return c.fail(fmt.Errorf("fetch musics: %w", err))
	}
	var vocals []MusicVocal
	if err := c.load("musicVocals.json", MusicVocalsURL, &vocals); err != nil {
		return c.fail(fmt.Errorf("fetch musicVocals: %w", err))
	}
	if len(musics) == 0 || len(vocals) == 0 {
		return c.fail(errors.New("music master data is empty"))
	}
	c.set(musics, vocals)
	return nil
}

func (c *Catalog) fail(err error) error {
	c.mu.Lock()
	c.lastErr = err
	c.mu.Unlock()
	return err
}

// Ready reports whether a snapshot is loaded.
func (c *Catalog) Ready() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.ready
}

// Music returns a music by ID.
func (c *Catalog) Music(id int) (Music, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	m, ok := c.musics[id]
	return m, ok
}

// Vocal returns a vocal by ID.
func (c *Catalog) Vocal(musicID, vocalID int) (MusicVocal, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, v := range c.vocals[musicID] {
		if v.ID == vocalID {
			return v, true
		}
	}
	return MusicVocal{}, false
}

type poolEntry struct {
	music  Music
	vocals []MusicVocal
}

// pool returns the songs released at or before cutoff with their allowed
// vocals, sorted by music ID.
func (c *Catalog) pool(cutoff time.Time) []poolEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	cutoffMs := cutoff.UnixMilli()
	out := make([]poolEntry, 0, len(c.musics))
	for id, m := range c.musics {
		if m.PublishedAt <= 0 || m.PublishedAt > cutoffMs || strings.TrimSpace(m.Title) == "" {
			continue
		}
		var allowed []MusicVocal
		for _, v := range c.vocals[id] {
			if allowedVocalType(v.MusicVocalType) && assetNamePattern.MatchString(v.AssetbundleName) {
				allowed = append(allowed, v)
			}
		}
		if len(allowed) == 0 {
			continue
		}
		out = append(out, poolEntry{music: m, vocals: allowed})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].music.ID < out[j].music.ID })
	return out
}

// StartLoading retries the initial load every retry interval until it
// succeeds, then refreshes every refresh interval, until stop is closed.
func (c *Catalog) StartLoading(stop <-chan struct{}, retry, refresh time.Duration, logf func(string, ...interface{})) {
	go func() {
		for !c.Ready() {
			if err := c.Fetch(); err != nil {
				logf("guess-music: master data load failed: %v", err)
			}
			if c.Ready() {
				break
			}
			select {
			case <-stop:
				return
			case <-time.After(retry):
			}
		}
		ticker := time.NewTicker(refresh)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				if err := c.Fetch(); err != nil {
					logf("guess-music: master data refresh failed: %v", err)
				}
			}
		}
	}()
}

const maxMasterFileBytes = 64 << 20

// FileOrHTTPLoader loads <dir>/<filename> when present and valid, else
// downloads url (mirrors internal/masterdata).
func FileOrHTTPLoader(dir string, client *http.Client) LoadFunc {
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}
	return func(filename, url string, target interface{}) error {
		if dir != "" {
			if data, err := os.ReadFile(filepath.Join(dir, filename)); err == nil && len(data) <= maxMasterFileBytes {
				if err := json.Unmarshal(data, target); err == nil {
					return nil
				}
			}
		}
		resp, err := client.Get(url)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("GET %s: %s", url, resp.Status)
		}
		data, err := io.ReadAll(io.LimitReader(resp.Body, maxMasterFileBytes+1))
		if err != nil {
			return err
		}
		if len(data) > maxMasterFileBytes {
			return fmt.Errorf("GET %s: response too large", url)
		}
		return json.Unmarshal(data, target)
	}
}
