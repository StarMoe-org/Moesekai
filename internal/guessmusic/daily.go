package guessmusic

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
)

// Daily challenge rules shared with the frontend.
const (
	RoundsPerDay     = 20
	TimeLimitSeconds = 45
	MaxStrikes       = 3
	ServerRegion     = "jp"
	// ChoiceOptions is the number of options (answer included) of a
	// multiple-choice round.
	ChoiceOptions = 6
	timeoutGrace  = 2 * time.Second
	// maxPlanChecks bounds availability probes while building a plan.
	maxPlanChecks = 80
	// planCheckBatch is how many availability probes run concurrently.
	planCheckBatch = 8
	// clipTailSeconds keeps clips away from the very end of a song.
	clipTailSeconds = 3.0
)

// Session modes.
const (
	ModeRanked   = "ranked"
	ModePractice = "practice"
)

// Answer modes of a tier.
const (
	AnswerChoice  = "choice"
	AnswerSuggest = "suggest"
	AnswerType    = "type"
)

// Tier is one difficulty of the daily challenge. Every tier has its own
// question sets and leaderboard.
type Tier struct {
	ID               string `json:"id"`
	Rounds           int    `json:"rounds"`
	ClipSeconds      int    `json:"clipSeconds"`
	TimeLimitSeconds int    `json:"timeLimitSeconds"`
	AnswerMode       string `json:"answerMode"`
	OptionCount      int    `json:"optionCount,omitempty"`
	VocalRemoval     bool   `json:"vocalRemoval"`
	// Available is false when the tier cannot be played today (hell
	// without enough instrumentals).
	Available bool `json:"available"`
}

// Tiers lists the daily tiers in display order.
var Tiers = []Tier{
	{ID: "easy", Rounds: RoundsPerDay, ClipSeconds: 30, TimeLimitSeconds: TimeLimitSeconds, AnswerMode: AnswerChoice, OptionCount: ChoiceOptions},
	{ID: "normal", Rounds: RoundsPerDay, ClipSeconds: 15, TimeLimitSeconds: TimeLimitSeconds, AnswerMode: AnswerSuggest},
	{ID: "hard", Rounds: RoundsPerDay, ClipSeconds: 5, TimeLimitSeconds: TimeLimitSeconds, AnswerMode: AnswerType},
	{ID: "hell", Rounds: RoundsPerDay, ClipSeconds: 5, TimeLimitSeconds: TimeLimitSeconds, AnswerMode: AnswerType, VocalRemoval: true},
}

func tierByID(id string) (Tier, bool) {
	for _, t := range Tiers {
		if t.ID == id {
			return t, true
		}
	}
	return Tier{}, false
}

func validMode(mode string) bool { return mode == ModeRanked || mode == ModePractice }

// RoundPlan is the hidden answer of one daily round. It never leaves the
// server before the round is final (Options excepted: they are public and
// include the answer among distractors).
type RoundPlan struct {
	MusicID       int     `json:"musicId"`
	MusicTitle    string  `json:"musicTitle"`
	VocalID       int     `json:"vocalId"`
	VocalCaption  string  `json:"vocalCaption"`
	VocalType     string  `json:"vocalType"`
	Asset         string  `json:"asset"`
	FillerSec     float64 `json:"fillerSec"`
	ClipSeconds   int     `json:"clipSeconds"`
	StartFraction float64 `json:"startFraction"`
	// VocalRemoval plans are cut from the private instrumental (Asset is
	// then the instrumental's asset name).
	VocalRemoval bool  `json:"vocalRemoval,omitempty"`
	Options      []int `json:"options,omitempty"`

	// fixedStart, when hasFixedStart, is the clip start in seconds (free-play
	// clips); otherwise the start derives from StartFraction.
	fixedStart    float64
	hasFixedStart bool
}

// fingerprint identifies the audio of a round so cached clips never outlive
// a changed plan.
func (p RoundPlan) fingerprint() string {
	version := "v2"
	if p.VocalRemoval {
		version = "inst1"
	}
	key := fmt.Sprintf("%s|%d|%.9f|%.3f|%v|%s", p.Asset, p.ClipSeconds, p.StartFraction, p.FillerSec, p.VocalRemoval, version)
	if p.hasFixedStart {
		key += fmt.Sprintf("|at:%.3f", p.fixedStart)
	}
	sum := sha256.Sum256([]byte(key))
	return fmt.Sprintf("%x", sum[:6])
}

// clipStart is where the clip starts in a stream of duration seconds.
func (p RoundPlan) clipStart(duration float64) float64 {
	if !p.hasFixedStart {
		return clipWindow(duration, p.FillerSec, p.ClipSeconds, p.StartFraction)
	}
	start := p.fixedStart
	if latest := duration - float64(p.ClipSeconds); start > latest {
		start = latest
	}
	if start < 0 {
		start = 0
	}
	return start
}

// DailyPlan is the server-side definition of one question set (a date, a
// tier and a mode).
type DailyPlan struct {
	Date        string      `json:"date"`
	Tier        string      `json:"tier"`
	Mode        string      `json:"mode"`
	Rounds      []RoundPlan `json:"rounds"`
	GeneratedAt time.Time   `json:"generatedAt"`
}

type dayInfo struct {
	Date  string
	Start time.Time
	Next  time.Time
}

func dayFor(t time.Time, loc *time.Location) dayInfo {
	local := t.In(loc)
	start := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	next := time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, loc)
	return dayInfo{Date: start.Format("2006-01-02"), Start: start, Next: next}
}

func parseDay(date string, loc *time.Location) (dayInfo, error) {
	if len(date) != len("2006-01-02") {
		return dayInfo{}, errors.New("date must be YYYY-MM-DD")
	}
	t, err := time.ParseInLocation("2006-01-02", date, loc)
	if err != nil || t.Format("2006-01-02") != date {
		return dayInfo{}, errors.New("date must be YYYY-MM-DD")
	}
	return dayFor(t, loc), nil
}

func hmacSHA256(key []byte, message string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(message))
	return mac.Sum(nil)
}

// setSeed is the seed of one question set. Ranked and practice sets of the
// same tier and day are independent.
func setSeed(secret []byte, date, tier, mode string) []byte {
	if mode == ModePractice {
		return hmacSHA256(secret, "guess-music:practice:"+date+":"+tier)
	}
	return hmacSHA256(secret, "guess-music:"+date+":"+tier)
}

func seedUint64(seed []byte, label string) uint64 {
	return binary.BigEndian.Uint64(hmacSHA256(seed, label)[:8])
}

func seedFraction(seed []byte, label string) float64 {
	return float64(seedUint64(seed, label)>>11) / float64(uint64(1)<<53)
}

// existsFunc reports whether a vocal's audio is downloadable. A non-nil
// error means "unknown" (e.g. network failure) and aborts plan generation.
type existsFunc func(ctx context.Context, asset string) (bool, error)

// rankedKey orders items by a seeded hash with a stable tie-break.
type rankedKey struct {
	key uint64
	id  int
	idx int
}

func sortRanked(list []rankedKey) {
	sort.Slice(list, func(i, j int) bool {
		if list[i].key != list[j].key {
			return list[i].key < list[j].key
		}
		return list[i].id < list[j].id
	})
}

// checkAvailability probes assets concurrently and returns their status in
// order. The first error aborts.
func checkAvailability(ctx context.Context, exists existsFunc, assets []string) ([]bool, error) {
	out := make([]bool, len(assets))
	errs := make([]error, len(assets))
	var wg sync.WaitGroup
	for i, asset := range assets {
		wg.Add(1)
		go func(i int, asset string) {
			defer wg.Done()
			out[i], errs[i] = exists(ctx, asset)
		}(i, asset)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			return nil, fmt.Errorf("check audio %s: %w", assets[i], err)
		}
	}
	return out, nil
}

// generatePlan deterministically builds one question set from its seed and
// the songs released before the day starts. Every song is ranked by its own
// HMAC so the choice is stable when unrelated songs enter the pool. Vocal
// removal tiers draw only from sung vocals listed in the instrumental
// manifest inst and need no availability probe.
func generatePlan(ctx context.Context, secret []byte, day dayInfo, tier Tier, mode string, catalog *Catalog, exists existsFunc, inst *instIndex) (*DailyPlan, error) {
	released := catalog.pool(day.Start)
	pool := released
	if tier.VocalRemoval {
		if inst == nil {
			return nil, errInstUnavailable
		}
		pool = instPool(released, inst)
		exists = nil
	}
	if len(pool) < RoundsPerDay {
		return nil, fmt.Errorf("guessmusic: only %d songs in the pool", len(pool))
	}
	if tier.OptionCount > len(released) {
		return nil, fmt.Errorf("guessmusic: only %d songs for %d options", len(released), tier.OptionCount)
	}
	seed := setSeed(secret, day.Date, tier.ID, mode)

	order := make([]rankedKey, len(pool))
	for i, entry := range pool {
		order[i] = rankedKey{key: seedUint64(seed, "music:"+strconv.Itoa(entry.music.ID)), id: entry.music.ID, idx: i}
	}
	sortRanked(order)

	type candidate struct {
		music Music
		vocal MusicVocal
	}
	pick := func(entry poolEntry) candidate {
		id := strconv.Itoa(entry.music.ID)
		vocals := entry.vocals
		return candidate{music: entry.music, vocal: vocals[seedUint64(seed, "vocal:"+id)%uint64(len(vocals))]}
	}

	plan := &DailyPlan{Date: day.Date, Tier: tier.ID, Mode: mode, GeneratedAt: time.Now().UTC()}
	checks := 0
	for next := 0; next < len(order) && len(plan.Rounds) < RoundsPerDay; {
		batch := planCheckBatch
		if missing := RoundsPerDay - len(plan.Rounds); exists == nil || missing < batch {
			batch = missing
		}
		if next+batch > len(order) {
			batch = len(order) - next
		}
		cands := make([]candidate, batch)
		assets := make([]string, batch)
		for i := range cands {
			cands[i] = pick(pool[order[next+i].idx])
			assets[i] = cands[i].vocal.AssetbundleName
		}
		next += batch
		ok := make([]bool, batch)
		if exists != nil {
			checks += batch
			if checks > maxPlanChecks {
				return nil, errors.New("guessmusic: too many unavailable songs while building the plan")
			}
			var err error
			if ok, err = checkAvailability(ctx, exists, assets); err != nil {
				return nil, err
			}
		} else {
			for i := range ok {
				ok[i] = true
			}
		}
		for i, c := range cands {
			if !ok[i] || len(plan.Rounds) == RoundsPerDay {
				continue
			}
			round := len(plan.Rounds)
			id := strconv.Itoa(c.music.ID)
			rp := RoundPlan{
				MusicID:       c.music.ID,
				MusicTitle:    c.music.Title,
				VocalID:       c.vocal.ID,
				VocalCaption:  c.vocal.Caption,
				VocalType:     c.vocal.MusicVocalType,
				Asset:         c.vocal.AssetbundleName,
				FillerSec:     c.music.FillerSec,
				ClipSeconds:   tier.ClipSeconds,
				StartFraction: seedFraction(seed, "start:"+id),
				VocalRemoval:  tier.VocalRemoval,
			}
			if tier.OptionCount > 1 {
				rp.Options = pickOptions(seed, round, c.music.ID, released, tier.OptionCount)
			}
			plan.Rounds = append(plan.Rounds, rp)
		}
	}
	if len(plan.Rounds) < RoundsPerDay {
		return nil, fmt.Errorf("guessmusic: only %d playable songs", len(plan.Rounds))
	}
	return plan, nil
}

// pickOptions returns count distinct music IDs, the answer included, drawn
// from the released songs and shuffled, all derived from the set's seed.
// Options never share a title (re-releases would be two right answers).
func pickOptions(seed []byte, round, answer int, released []poolEntry, count int) []int {
	prefix := "option:" + strconv.Itoa(round) + ":"
	titles := make(map[int]string, len(released))
	cands := make([]rankedKey, 0, len(released))
	for _, entry := range released {
		titles[entry.music.ID] = normalizeTitle(entry.music.Title)
		if entry.music.ID == answer {
			continue
		}
		cands = append(cands, rankedKey{key: seedUint64(seed, prefix+strconv.Itoa(entry.music.ID)), id: entry.music.ID})
	}
	sortRanked(cands)
	chosen := []rankedKey{{id: answer}}
	used := map[string]bool{titles[answer]: true}
	for _, c := range cands {
		if len(chosen) == count {
			break
		}
		if t := titles[c.id]; t != "" {
			if used[t] {
				continue
			}
			used[t] = true
		}
		chosen = append(chosen, rankedKey{id: c.id})
	}
	orderPrefix := "option-order:" + strconv.Itoa(round) + ":"
	for i := range chosen {
		chosen[i].key = seedUint64(seed, orderPrefix+strconv.Itoa(chosen[i].id))
	}
	sortRanked(chosen)
	out := make([]int, len(chosen))
	for i, c := range chosen {
		out[i] = c.id
	}
	return out
}

// clipWindow computes the clip start inside [fillerSec, duration-clip-3].
func clipWindow(duration, fillerSec float64, clipSeconds int, fraction float64) float64 {
	clip := float64(clipSeconds)
	lo := fillerSec
	if lo < 0 {
		lo = 0
	}
	hi := duration - clip - clipTailSeconds
	if hi < lo {
		// Very short song: fall back to the latest start that still fits.
		hi = duration - clip
		if hi < 0 {
			hi = 0
		}
		if lo > hi {
			lo = hi
		}
	}
	if fraction < 0 {
		fraction = 0
	}
	if fraction > 1 {
		fraction = 1
	}
	return lo + fraction*(hi-lo)
}

// normalizeTitle folds a title for same-song comparison: full-width ASCII
// to half-width, lower case, katakana to hiragana, and whitespace,
// punctuation and symbols removed (mirrors the frontend's normalizeAnswer).
func normalizeTitle(title string) string {
	var b strings.Builder
	for _, r := range title {
		switch {
		case r >= 0xFF01 && r <= 0xFF5E:
			r -= 0xFEE0
		case r == 0x3000:
			r = ' '
		}
		r = unicode.ToLower(r)
		if (r >= 0x30A1 && r <= 0x30F6) || r == 0x30FD || r == 0x30FE {
			r -= 0x60
		}
		if unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r) || unicode.IsControl(r) || unicode.Is(unicode.Cf, r) || unicode.Is(unicode.Z, r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
