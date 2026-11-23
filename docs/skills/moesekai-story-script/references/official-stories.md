# Studying Official Project SEKAI Stories on Moesekai (`pjsk.moe`)

Because Project SEKAI does not publish a global semantic index of SE sound names, background locations, or per-character pose habits, the highest-leverage way for an AI agent to write authentic `.msk` scripts is to **inspect real official Project SEKAI scenario JSONs served by Moesekai**!

> **Public Asset Attribution**: Moesekai (`pjsk.moe`) serves `metadata.pjsk.moe` (`metadata.exmeaning.com`), `storage.pjsk.moe` (`storage.exmeaning.com`), `assets.pjsk.moe/sekai-extra-assets/sekai-story-search`, and `translation.exmeaning.com` with permissive CORS (`*`). Credit `Moesekai (pjsk.moe)` if you embed these endpoints externally.

---

## 1. Using `scripts/official-story.mjs` (Fastest Agent Workflow)

`scripts/official-story.mjs` is a zero-dependency Node.js 18+ CLI with automatic OS-temp caching and primary→backup CDN fallback.

### 1.1 One-Shot Authoring Kit (`study`) — Recommended First Step!

Before drafting a story, mine 3–5 recent official episodes for the target unit or characters to get a complete, verified `.msk` asset palette (`@cast`, backgrounds + `.webp` URLs, BGMs + titles, pack-qualified SEs + dialogue context, and top `(motion, facial)` pairs per character):

```bash
# Study the 3 newest unit-focus events for 25-ji, Nightcord de. (v2_ models!)
node scripts/official-story.mjs study --unit 25ji --sample 3 --region jp

# Study events featuring specific characters (accepts IDs or EN/JP/ZH names)
node scripts/official-story.mjs study --char 1,2,3,4 --sample 4 --region jp
node scripts/official-story.mjs study --char kanade,mafuyu --sample 3 --region jp

# Study explicit official episodes you already picked
node scripts/official-story.mjs study --selectors event:203/1,event:203/2,event:203/8 --region jp --json
```

Unit aliases accepted by `--unit`: `ln` (`light_sound`), `mmj` (`idol`), `vbs` (`street`), `ws` (`theme_park`), `25ji` (`school_refusal`), `vs` (`piapro`). By default, `--unit` filters events to pure unit-focus events; pass `--include-mixed` for mixed crossover events.

### 1.2 Fast Episode Discovery (`list`)

Lightweight masterdata search (no heavy corpus download):

```bash
# Newest Leo/need events on JP
node scripts/official-story.mjs list --kind event --unit ln --limit 10 --region jp

# Search CN event titles/outlines for a theme
node scripts/official-story.mjs list --kind event --query "星空" --region cn --limit 10

# Unit main stories
node scripts/official-story.mjs list --kind unit --unit ws --region jp --limit 15

# Card side stories for a character (returns card:<id>/former and latter)
node scripts/official-story.mjs list --kind card --char 18 --region jp --limit 10

# Area conversations where two specific characters talk together
node scripts/official-story.mjs list --kind area --char 11,12 --region jp --limit 10
```

### 1.3 Full-Text Official Dialogue Search (`search-text`)

Searches across **all 56,000–62,000 official dialogue chunks** using Moesekai's Brotli-compressed `sekai-story-search` corpus (~8 MB download once, cached permanently by SHA-256 in OS temp dir for <100ms repeat searches!).

Use this whenever you need to find an official scene with a **specific situation, sound effect, or mood** (e.g., rain, rooftop, cafe, phone notification, concert applause, crying, cooking, fireworks):

```bash
# Search CN official dialogues mentioning "天台" with Ichika & Saki
node scripts/official-story.mjs search-text "天台" --region cn --char 1,2 --limit 8

# Search JP dialogues for Nightcord notifications / late-night calls
node scripts/official-story.mjs search-text "通知" --region jp --char 17,19 --limit 8

# Search EN dialogues with regex
node scripts/official-story.mjs search-text "rain|umbrella" --regex --region en --limit 8
```

Every hit prints a ready-to-use `selector` (`event:50/6`, `unit:light-sound-story-chapter/11`, `card:900/former`, `talk:100`) that you pass directly to `inspect`!

### 1.4 Deep Scenario Inspection (`inspect`)

Downloads the official raw scenario JSON and prints every Live2D model, background (+ `PlaceInfo` + `.webp`), BGM (+ soundtrack title + starting line), pack-qualified SE (+ dialogue before & after!), per-character `(motion, facial)` pairs (+ dialogue quotes!), sample `.msk` `voice(...)` refs, and optional beat-by-beat stageplay timeline:

```bash
# Inspect latest JP event with Chinese translation overlay and first 20 talk lines
node scripts/official-story.mjs inspect event:203/1 --region jp --translate zh-CN --lines 1..20

# Inspect a CN unit story episode (full asset breakdown)
node scripts/official-story.mjs inspect unit:light-sound-story-chapter/11 --region cn

# Inspect a card side story or area conversation with full timeline
node scripts/official-story.mjs inspect card:900/former --region jp --timeline
node scripts/official-story.mjs inspect talk:100 --region jp --timeline

# Machine-readable JSON output
node scripts/official-story.mjs inspect event:223/1 --region jp --json
```

### 1.5 Direct Live Asset Catalog Browsing (`catalog`)

```bash
# List verified v2_ Live2D models for Kanade (char 17)
node scripts/official-story.mjs catalog models --char 17 --v2-only --region jp

# List exact motion & facial clips for a model (reads canonical live2d-motions .asset.json live!)
node scripts/official-story.mjs catalog clips v2_18mafuyu_casual --filter dark --region jp
node scripts/official-story.mjs catalog clips v2_01ichika_casual --type motion --filter nod --region jp

# Search official titled BGM tracks
node scripts/official-story.mjs catalog bgm --query "25:00" --region jp

# Browse non-CG location backgrounds
node scripts/official-story.mjs catalog bg --filter bg_e --region jp --limit 30

# Browse pack-qualified SE clips
node scripts/official-story.mjs catalog se --query se0009 --region jp --limit 30

# List voice clips inside a specific scenarioId
node scripts/official-story.mjs catalog voices event_203_01 --kind story --region jp --limit 20
```

---

## 2. Moesekai Public Endpoint Map (Direct HTTP / Python / `curl` Reference)

If you are running in an environment without Node.js (e.g., Python or direct web fetch), every endpoint below is publicly accessible over HTTPS (`CORS *`):

### 2.1 Base Domains (Primary & Automatic Backup)

| Service | Primary | Backup |
| --- | --- | --- |
| Masterdata JSON | `https://metadata.pjsk.moe/<region>/master/<file>.json` | `https://metadata.exmeaning.com/<region>/master/<file>.json` |
| Game Storage Assets & Scenario JSONs | `https://storage.pjsk.moe/sekai-<region>-assets/<path>` | `https://storage.exmeaning.com/sekai-<region>-assets/<path>` |
| Canonical Live2D Asset Site (listings & `.asset.json`) | `https://storage.pjsk.moe/<region>/live2d/{model,motion}/`<br>`https://storage.pjsk.moe/<region>@<published_version>/<asset>/.../*.asset.json` | `https://storage.exmeaning.com/<region>/live2d/{model,motion}/`<br>`https://storage.exmeaning.com/<region>@<published_version>/<asset>/.../*.asset.json` |
| Story Search Corpus (Brotli JSONL) | `https://assets.pjsk.moe/sekai-extra-assets/sekai-story-search/manifest.json` | — |
| Story Translations (JP → CN / EN) | `https://translation.exmeaning.com/translation/<path>` (zh-CN)<br>`https://translation.exmeaning.com/v2/en-US/translation/<path>` (en-US) | — |

Regions: `jp`, `cn`, `tw`, `kr`, `en`.

### 2.2 All 6 Official Story Types → Exact Scenario JSON URLs

| Story Kind | Masterdata Tables to Join | Relative Path under `https://storage.pjsk.moe/sekai-<region>-assets/` |
| --- | --- | --- |
| **Event Story** (`event`) | `events.json` (`id`, `name`) + `eventStories.json` (`eventId`, `assetbundleName`, `bannerGameCharacterUnitId`, `eventStoryEpisodes[].{episodeNo, title, scenarioId}`) | `event_story/<assetbundleName>/scenario/<scenarioId>.json` |
| **Unit Main Story** (`unit`) | `unitStories.json` (`unit`, `chapters[].{assetbundleName, title, episodes[].{episodeNo, title, scenarioId}}`) + `unitProfiles.json` | `scenario/unitstory/<chapter.assetbundleName>/<scenarioId>.json` |
| **Card Side Story** (`card`) | `cards.json` (`id`, `characterId`, `prefix`, `assetbundleName`) + `cardEpisodes.json` (`cardId`, `seq`, `title`, `scenarioId`) | **JP/CN/TW/KR**: `character/member/<assetbundleName>/<scenarioId>.json`<br>**EN**: `character/member_scenario/<assetbundleName>/<scenarioId>.json` |
| **Area Talk** (`area` / `talk`) | `actionSets.json` (`id`, `areaId`, `characterIds`, `scenarioId`) + `areas.json` (`id`, `name`, `subName`) | `scenario/actionset/group<floor(actionSet.id / 100)>/<scenarioId>.json` |
| **Special Story** (`special`) | `specialStories.json` (`id`, `title`, `episodes[].{episodeNo, title, assetbundleName, scenarioId}`) | `scenario/special/<episode.assetbundleName>/<scenarioId>.json` |
| **Self Intro** (`self`) | `characterProfiles.json` / `scenarioId` | `scenario/profile/<scenarioId>.json` |

Helpful supporting masterdata tables:
- `character2ds.json`: maps `Character2dId` in scenario JSON → `{ characterType, characterId, unit, assetName }`.
- `gameCharacterUnits.json`: maps `bannerGameCharacterUnitId` → `{ gameCharacterId, unit }`.
- `musicSoundTracks.json` + `musicSoundTrackCategories.json`: maps BGM `assetbundleName`/`assetbundleFileName` → official track title & category.

### 2.3 Full-Text Story Corpus (`sekai-story-search`)

1. Fetch `https://assets.pjsk.moe/sekai-extra-assets/sekai-story-search/manifest.json`.
2. Read `servers.<region>.chunks.path` (e.g. `cn/chunks.<hash>.jsonl.br`, ~8 MB Brotli).
3. Fetch `https://assets.pjsk.moe/sekai-extra-assets/sekai-story-search/<chunks.path>` and Brotli-decompress to UTF-8 JSONL.
4. Each JSON line has:
   ```json
   {
     "id": 500,
     "server": "cn",
     "type": "event",
     "story_id": "event_50",
     "story": "那一天，天空遥不可及 #6 隐匿在黄昏下的心愿",
     "ep": "6",
     "scenario_id": "event_50_06",
     "chars": ["志步", "一歌", "穗波", "咲希"],
     "char_ids": [4, 1, 3, 2],
     "line_start": 84,
     "line_end": 92,
     "text": "[...]\n一歌: ..."
   }
   ```
5. Join `type` + `story_id` + `scenario_id` with §2.2 to fetch the full raw scenario JSON and inspect its L2D/BG/BGM/SE assets!

### 2.4 Story Translations (`translation.exmeaning.com`)

When inspecting a JP-only newest event, card story, or area talk:
- Event: `eventStory/event_<eventId>.json` (keyed by `episodes["<episodeNo>"].talkData[jpText]`)
- Card: `cardStory/card_<cardId>.json` (keyed by `episodes["1"]` / `episodes["2"]`)
- Area: `areaTalk/group_<floor(actionSetId / 100)>.json` (keyed by `episodes["<scenarioId>"]`)

---

## 3. Raw Official Scenario JSON (`IScenarioData`) → `.msk` Mapping

Every official scenario JSON shares this exact schema:

| Official JSON Field | Meaning | `.msk` Equivalent |
| --- | --- | --- |
| `AppearCharacters[]` | `{ Character2dId, CostumeType }` — all Live2D costumes loaded for the episode | `@cast <key> "<name>" model="<CostumeType>" char=<id>` |
| `FirstBackground` | Initial background ID (`"bg_a000000"` = black screen) | `bg set "<id>"` (or `bg clear` for `bg_a000000`) |
| `FirstBgm` | Initial BGM (`"bgm00000"` = silent) | `bgm play "<id>" vol=0.75` (or `bgm stop` for `bgm00000`) |
| `FirstLayout[]` | `{ Character2dId, CostumeType, PositionSide, MotionName, FacialName }` | `cast set [ <key> at <slot> motion="..." facial="..." ]` |
| `Snippets[]` | Ordered playback list: `{ Action, ReferenceIndex, Delay, ProgressBehavior }` | Sequential beats inside `scene { ... }` |

### `Snippets[].Action` Reference

| `Action` | Array Indexed by `ReferenceIndex` | How to Translate to `.msk` |
| --- | --- | --- |
| `1` (Talk) | `TalkData[i]` | `talk <speakerKey> "<body>" motion="..." facial="..." react(...) voice(...)`<br>- `TalkData.Motions[]`: entries matching speaker → `motion`/`facial`; entries for *other* `Character2dId`s → `react(<otherKey> motion="..." facial="...")`!<br>- `TalkData.Voices[0]`: `voice(<kind>:<ScenarioId>:<VoiceId>@<region>)` (for `partvoice*`, see `character-assets.md` §4). |
| `2` (CharacterLayout) | `LayoutData[i]` | - `Type=2` (Appear): `stage enter <key> at <slot> motion="..." facial="..."`<br>- `Type=1` (Move): `stage move <key> to <slot> dur=0.5 motion="..." facial="..."`<br>- `Type=3` (Hide): `stage exit <key>`<br>- `SideTo` mapping: `1/2`→`farLeft`, `3`→`left`, `4`→`center`, `6/7`→`right`, `8`→`farRight`. |
| `4` (CharacterMotion) | `LayoutData[i]` (`Type=0`) | `stage pose <key> motion="..." facial="..."` |
| `6` (SpecialEffect) | `SpecialEffectData[i]` | - `EffectType 1/2` (BlackIn/Out) → `transition fadeBlack <dur>` (new scene) or `cue flash black <dur>`<br>- `EffectType 3/4` (WhiteIn/Out) → `transition fadeWhite <dur>` or `cue flash white <dur>`<br>- `EffectType 5/6` (ShakeScreen/Window) → `cue shake <dur>`<br>- `EffectType 7/17` (ChangeBackground/Still) → new `scene` with `bg set "<StringValSub \|\| StringVal>"`<br>- `EffectType 8` (Telop) → `telop "<StringVal>"`<br>- `EffectType 18` (PlaceInfo) → `place set "<StringVal>"` |
| `7` (Sound) | `SoundData[i]` | - `Bgm` (`"bgm00000"` = stop): new `scene` with `bgm play "<Bgm>"` / `bgm stop`<br>- `Se`: resolve bare `Se` against `se_pack00001_b/` & `se_pack00001/` → `se="<pack>/<Se>"` on `talk`/`narration` or `cue se "<pack>/<Se>"`! |
| `8` (CharacterLayoutMode) | `ScenarioSnippetCharacterLayoutModes[i]` | `0` = 2-actor default spacing; `3` = 3-actor wide spacing (`.msk` handles this automatically via `layoutStageActors`!). |
