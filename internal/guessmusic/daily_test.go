package guessmusic

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sync"
	"testing"
	"time"
)

var testLoc = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		panic(err)
	}
	return loc
}()

// testCatalog has 40 released songs (ids 1..40), one unreleased song (99)
// and vocals of every type, including excluded streaming_live ones.
func testCatalog(now time.Time) *Catalog {
	var musics []Music
	var vocals []MusicVocal
	vid := 1
	types := []string{"sekai", "virtual_singer", "original_song", "another_vocal", "april_fool_2022", "instrumental"}
	for id := 1; id <= 40; id++ {
		musics = append(musics, Music{
			ID: id, Title: fmt.Sprintf("Song Title %02d", id), AssetbundleName: fmt.Sprintf("m%03d", id),
			PublishedAt: now.Add(-time.Duration(id) * 24 * time.Hour).UnixMilli(), FillerSec: 9,
		})
		vocals = append(vocals, MusicVocal{ID: vid, MusicID: id, MusicVocalType: types[id%len(types)],
			Caption: "Caption", AssetbundleName: fmt.Sprintf("vocal_%04d", vid)})
		vid++
		vocals = append(vocals, MusicVocal{ID: vid, MusicID: id, MusicVocalType: "streaming_live",
			Caption: "Live", AssetbundleName: fmt.Sprintf("live_%04d", vid)})
		vid++
	}
	musics = append(musics, Music{ID: 99, Title: "Future Song", AssetbundleName: "m099",
		PublishedAt: now.Add(72 * time.Hour).UnixMilli()})
	vocals = append(vocals, MusicVocal{ID: 999, MusicID: 99, MusicVocalType: "sekai", AssetbundleName: "vocal_0999"})
	// Song 41 only has a streaming_live vocal: never eligible.
	musics = append(musics, Music{ID: 41, Title: "Live Only", PublishedAt: 1})
	vocals = append(vocals, MusicVocal{ID: 1000, MusicID: 41, MusicVocalType: "streaming_live", AssetbundleName: "live_1000"})
	return NewStaticCatalog(musics, vocals)
}

func mustTier(id string) Tier {
	t, ok := tierByID(id)
	if !ok {
		panic(id)
	}
	return t
}

func TestGeneratePlanDeterministic(t *testing.T) {
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, testLoc)
	catalog := testCatalog(now)
	day := dayFor(now, testLoc)
	secret := []byte("secret-a")
	ctx := context.Background()

	for _, tier := range Tiers {
		a, err := generatePlan(ctx, secret, day, tier, ModeRanked, catalog, nil, testInstIndex(catalog))
		if err != nil {
			t.Fatal(err)
		}
		b, err := generatePlan(ctx, secret, day, tier, ModeRanked, catalog, nil, testInstIndex(catalog))
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(a.Rounds, b.Rounds) {
			t.Fatalf("%s: same secret and date produced different plans", tier.ID)
		}
		if len(a.Rounds) != RoundsPerDay || a.Tier != tier.ID || a.Mode != ModeRanked {
			t.Fatalf("%s: plan header %+v", tier.ID, a)
		}
		seen := map[int]bool{}
		for i, r := range a.Rounds {
			if seen[r.MusicID] {
				t.Fatalf("%s: music %d repeated", tier.ID, r.MusicID)
			}
			seen[r.MusicID] = true
			if r.MusicID < 1 || r.MusicID > 40 {
				t.Fatalf("%s: round %d uses ineligible music %d", tier.ID, i, r.MusicID)
			}
			if !allowedVocalType(r.VocalType) || r.VocalType == "streaming_live" {
				t.Fatalf("%s: round %d uses vocal type %s", tier.ID, i, r.VocalType)
			}
			if tier.VocalRemoval && r.VocalType == "instrumental" {
				t.Fatalf("hell round %d uses an instrumental", i)
			}
			if r.ClipSeconds != tier.ClipSeconds || r.VocalRemoval != tier.VocalRemoval {
				t.Fatalf("%s: round %d clip %d removal %v", tier.ID, i, r.ClipSeconds, r.VocalRemoval)
			}
			if r.StartFraction < 0 || r.StartFraction >= 1 {
				t.Fatalf("%s: round %d start fraction %v", tier.ID, i, r.StartFraction)
			}
			if tier.OptionCount == 0 && r.Options != nil {
				t.Fatalf("%s: round %d has options", tier.ID, i)
			}
		}

		practice, _ := generatePlan(ctx, secret, day, tier, ModePractice, catalog, nil, testInstIndex(catalog))
		other, _ := generatePlan(ctx, secret, dayFor(now.AddDate(0, 0, 1), testLoc), tier, ModeRanked, catalog, nil, testInstIndex(catalog))
		otherSecret, _ := generatePlan(ctx, []byte("secret-b"), day, tier, ModeRanked, catalog, nil, testInstIndex(catalog))
		if reflect.DeepEqual(a.Rounds, practice.Rounds) || reflect.DeepEqual(a.Rounds, other.Rounds) || reflect.DeepEqual(a.Rounds, otherSecret.Rounds) {
			t.Fatalf("%s: sets should differ across modes, dates and secrets", tier.ID)
		}
	}
	easy, _ := generatePlan(ctx, secret, day, mustTier("easy"), ModeRanked, catalog, nil, testInstIndex(catalog))
	hard, _ := generatePlan(ctx, secret, day, mustTier("hard"), ModeRanked, catalog, nil, testInstIndex(catalog))
	if reflect.DeepEqual(easy.Rounds[0].MusicID, hard.Rounds[0].MusicID) && reflect.DeepEqual(easy.Rounds[1].MusicID, hard.Rounds[1].MusicID) {
		t.Fatal("tiers should have their own sets")
	}
}

func TestHellExcludesInstrumentalOnlySongs(t *testing.T) {
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, testLoc)
	catalog := testCatalog(now) // songs with id%6 == 5 only have an instrumental
	for d := 0; d < 15; d++ {
		day := dayFor(now.AddDate(0, 0, d), testLoc)
		plan, err := generatePlan(context.Background(), []byte("s"), day, mustTier("hell"), ModePractice, catalog, nil, testInstIndex(catalog))
		if err != nil {
			t.Fatal(err)
		}
		for _, r := range plan.Rounds {
			if r.MusicID%6 == 5 || r.VocalType == "instrumental" {
				t.Fatalf("hell picked instrumental-only song %d (%s)", r.MusicID, r.VocalType)
			}
		}
	}
}

func TestEasyOptions(t *testing.T) {
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, testLoc)
	catalog := testCatalog(now)
	day := dayFor(now, testLoc)
	plan, err := generatePlan(context.Background(), []byte("s"), day, mustTier("easy"), ModeRanked, catalog, nil, testInstIndex(catalog))
	if err != nil {
		t.Fatal(err)
	}
	answerFirst := 0
	for i, r := range plan.Rounds {
		if len(r.Options) != ChoiceOptions {
			t.Fatalf("round %d has %d options", i, len(r.Options))
		}
		seen := map[int]bool{}
		hasAnswer := false
		for _, id := range r.Options {
			if seen[id] {
				t.Fatalf("round %d repeats option %d", i, id)
			}
			seen[id] = true
			if id == r.MusicID {
				hasAnswer = true
			}
			if id < 1 || id > 40 {
				t.Fatalf("round %d option %d is not a released song", i, id)
			}
		}
		if !hasAnswer {
			t.Fatalf("round %d options %v miss the answer %d", i, r.Options, r.MusicID)
		}
		if r.Options[0] == r.MusicID {
			answerFirst++
		}
	}
	if answerFirst > 10 {
		t.Fatalf("options are not shuffled (answer first in %d rounds)", answerFirst)
	}
	again, _ := generatePlan(context.Background(), []byte("s"), day, mustTier("easy"), ModeRanked, catalog, nil, testInstIndex(catalog))
	if !reflect.DeepEqual(plan.Rounds[3].Options, again.Rounds[3].Options) {
		t.Fatal("options must be deterministic")
	}
}

func TestGeneratePlanSkipsUnavailableAudio(t *testing.T) {
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, testLoc)
	catalog := testCatalog(now)
	day := dayFor(now, testLoc)
	tier := mustTier("normal")
	base, _ := generatePlan(context.Background(), []byte("s"), day, tier, ModeRanked, catalog, nil, testInstIndex(catalog))
	missing := base.Rounds[0].Asset
	var mu sync.Mutex
	probes := 0
	plan, err := generatePlan(context.Background(), []byte("s"), day, tier, ModeRanked, catalog, func(_ context.Context, asset string) (bool, error) {
		mu.Lock()
		probes++
		mu.Unlock()
		return asset != missing, nil
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range plan.Rounds {
		if r.Asset == missing {
			t.Fatal("unavailable vocal was used")
		}
	}
	if plan.Rounds[1].MusicID != base.Rounds[2].MusicID || plan.Rounds[18].MusicID != base.Rounds[19].MusicID {
		t.Fatal("skipping a song should shift the remaining order")
	}
	if probes != RoundsPerDay+1 {
		t.Fatalf("probed %d assets, want %d", probes, RoundsPerDay+1)
	}
	if _, err := generatePlan(context.Background(), []byte("s"), day, tier, ModeRanked, catalog, func(context.Context, string) (bool, error) {
		return false, errors.New("network down")
	}, nil); err == nil {
		t.Fatal("probe errors must abort")
	}
}

func TestDayBoundaryInTimezone(t *testing.T) {
	// 2026-10-09 16:30 UTC is 2026-10-10 00:30 in Shanghai.
	d := dayFor(time.Date(2026, 10, 9, 16, 30, 0, 0, time.UTC), testLoc)
	if d.Date != "2026-10-10" {
		t.Fatalf("date = %s", d.Date)
	}
	if got := d.Next.Format(time.RFC3339); got != "2026-10-11T00:00:00+08:00" {
		t.Fatalf("next = %s", got)
	}
	if _, err := parseDay("2026-13-01", testLoc); err == nil {
		t.Fatal("invalid date accepted")
	}
}

func TestClipWindowBounds(t *testing.T) {
	for _, f := range []float64{0, 0.25, 0.999999} {
		start := clipWindow(120, 9, 30, f)
		if start < 9 || start > 120-30-3 {
			t.Fatalf("fraction %v -> start %v out of bounds", f, start)
		}
	}
	if s := clipWindow(20, 9, 15, 0.5); s < 0 || s+15 > 20 {
		t.Fatalf("short song start %v", s)
	}
}

func TestComputePoints(t *testing.T) {
	cases := []struct {
		elapsed      time.Duration
		combo, wrong int
		want         int
	}{
		{0, 0, 0, 1000},
		{9 * time.Second, 1, 1, 400},              // 0.8 * 0.5
		{9 * time.Second, 3, 0, 1200},             // 0.8 * 1.5
		{44 * time.Second, 0, 0, 100},             // floor at 0.1
		{0, 9, 0, 2000},                           // combo capped at 2.0
		{4500 * time.Millisecond, 2, 2, 281},      // 0.9 * 1.25 * 0.25
		{45*time.Second + time.Second, 2, 0, 125}, // past the limit still 0.1
	}
	for _, c := range cases {
		if got := computePoints(c.elapsed, c.combo, c.wrong); got != c.want {
			t.Errorf("computePoints(%v,%d,%d) = %d, want %d", c.elapsed, c.combo, c.wrong, got, c.want)
		}
	}
}
