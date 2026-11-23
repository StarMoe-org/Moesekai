---
name: moesekai-story-script
description: Autonomous authoring, official Project SEKAI scenario research, asset mining, static validation, branch simulation, and debugging guide for MoeSekai Script (.msk) interactive visual novel stories in Moesekai Story Maker (moesekai-story/2). Use whenever writing, planning, editing, converting, validating, or debugging .msk stories, or when looking up official Moesekai scripts to learn authentic Live2D models, motions, facials, backgrounds, BGM, SE, and voices.
---

# MoeSekai Script (`.msk`) Autonomous Authoring & Official Story Research Skill

MoeSekai Script (`.msk`) is the lossless, human- and AI-readable DSL for **Moesekai Story Maker** (`moesekai-story/2`). Every `.msk` file compiles bidirectionally to the visual node graph (`start`, `scene`, `choice`, `condition`, `end`) at `https://pjsk.moe/story-maker/edit` and `/story-maker/play`.

**Golden Rule**: Assets are referenced strictly by official Project SEKAI names on the story's server (`jp`, `cn`, `tw`, `kr`, `en`) — **never guess IDs!** Both scripts in `scripts/` are **100% standalone zero-dependency Node.js 18+ CLIs** (no repo checkout, no `npm install`).

> **Public Asset Attribution**: Moesekai (`pjsk.moe`) serves `metadata.pjsk.moe`, `storage.pjsk.moe`, `assets.pjsk.moe`, and `translation.exmeaning.com` with `Access-Control-Allow-Origin: *`. Credit `Moesekai (pjsk.moe)` if you embed these endpoints externally.

---

## 1. The 5-Step Autonomous Authoring Workflow

Follow this loop proactively every time you author or revise a `.msk` story:

### Step 1 — Research Official Moesekai Scripts FIRST (Learn Real L2D, BG, BGM & SE!)

Official Project SEKAI scripts are the ground truth for character voices, Live2D costumes, `(motion, facial)` habits, location backgrounds, BGM moods, and SE cues (which have numeric IDs with no name table!). Before drafting a single line of `.msk`, mine real official precedents:

```bash
# A. One-shot Authoring Kit: mine 3-4 recent official episodes for your target unit or cast!
#    Returns verified v2_ @cast models, BGs (+ .webp URLs), BGMs (+ official titles),
#    pack-qualified SEs (+ surrounding dialogue context!), and top (motion, facial) pairs per character.
node scripts/official-story.mjs study --unit 25ji --sample 3 --region jp
node scripts/official-story.mjs study --char kanade,mafuyu,ena --sample 3 --region jp

# B. Need a specific situation/location/SE (rain, rooftop, cafe, notification, applause, fireworks)?
#    Search across all 56,000+ official dialogue chunks (CN / JP / EN / TW / KR) to find exact episodes:
node scripts/official-story.mjs search-text "天台" --region cn --char 1,2 --limit 6
node scripts/official-story.mjs search-text "雨" --region jp --char 17,18 --limit 6

# C. Deep-inspect any official episode (with optional CN/EN translation overlay & timeline slice)
#    to study official blocking, transitions, SE timing, and expression phrasing:
node scripts/official-story.mjs inspect event:203/1 --region jp --translate zh-CN --lines 1..20

# D. Browse additional verified assets on demand (main characters, supporting/collab cast by CN/JP/EN name, clips, BGM):
node scripts/official-story.mjs catalog models --char 17 --v2-only --region jp
node scripts/official-story.mjs catalog models --kind sub --search 谦 --region jp   # also --kind collab
node scripts/official-story.mjs catalog clips v2_18mafuyu_casual --filter dark --region jp
node scripts/official-story.mjs catalog bgm --query "星" --region jp
```

> No Node.js available? See [`references/official-stories.md`](references/official-stories.md) for direct HTTPS endpoint formulas (`metadata.pjsk.moe`, `storage.pjsk.moe`, `sekai-story-search`, `translation.exmeaning.com`) and the complete raw scenario JSON → `.msk` mapping table.

### Step 2 — Plan Graph Architecture & Safe Staging

Design a crisp interactive structure before writing:
- **Narrative arc**: 6–12 `scene` nodes, 1–2 meaningful `choice` nodes (2–4 options each), 1–2 tracked `@var` counters/flags, a `condition` payoff node, and 2–3 distinct `end` cards with `{{var}}` subtitle feedback.
- **Merge-node hygiene**: Any `scene` with **2+ incoming edges (`inDegree >= 2`)** MUST explicitly declare all 4 stage slots (`bg set/clear`, `bgm play/stop`, `place set/hide`, `cast set/clear`) — never use `inherit` on a converging scene (causes `mergeNodeInheritAmbiguous`).
- **Safe non-overlapping stage framing**:
  - Default `scale=1` (omit `scale`) is exact 1:1 in-game PJSK height. Use `scale=1` for 3–5 actors; reserve `scale=1.05–1.25` for 1–2 actor close-ups.
  - Spread actors across distinct slots: 2 actors → `left, right`; 3 → `left, center, right`; 4 → `farLeft, left, right, farRight`; 5 → all 5 slots.
  - **Intentional overlap / "贴贴" (close huddle)**: Only when two characters intentionally lean cheek-to-cheek or hug, add `overlap` explicitly on **both** huddling actors' `cast set` entries or `stage enter`/`stage move` beats (e.g. `ichika at center overlap` + `saki at center overlap`). Never leave undeclared overlaps!

### Step 3 — Draft `.msk` with Authentic PJSK Directing Craft

Apply the staging patterns you observed in official scripts:
1. **Open scene shifts cleanly**: `transition fadeBlack 0.5` (or `fadeWhite 0.6` for flashbacks/SEKAI warps) + `place set "..."` + `telop "..."` for chapter/time beats.
2. **Short, natural dialogue beats**: Keep each `talk` to 1–2 sentences (like real PJSK textboxes) rather than walls of prose.
3. **Keep the whole cast alive**: Pair emotional lines with speaker `motion="..." facial="..."` AND co-star `react(<otherKey> motion="..." facial="...")` so listeners react on the exact same beat!
4. **Dynamic blocking**: Use `stage enter`, `stage move ... dur=0.5`, `stage pose`, and `stage exit` instead of static cardboard cutouts.
5. **Audio pacing**: Keep BGM around `vol=0.65..0.80` so voices/SE stay crisp; use a new `scene` with `bgm stop` for dramatic silence before an emotional turn; always use pack-qualified SE paths (`se_pack00001_b/...` or `se_pack00001/...`).
6. **Strict asset discipline**:
   - Match gender motion prefixes (`w-*` for female characters, `m-*` for male characters: `11akito`, `12touya`, `13tsukasa`, `16rui`, `23len`, `26kaito`).
   - Prefer `v2_` models and `v2_` motion clips (`w-normal01-nod`, `w-cool02-tilthead`), NOT gen-1 clip names on `v2_` models.
   - Never use `bgm00000` (use `bgm stop`), `bg_a000000` (use `bg clear`), `bgm90001`–`bgm90013` (stem packs), or Story CGs (`bg_a000001`–`bg_a000099`, `bg_s*`) as normal stage backdrops.
   - Never assume a facial exists on every character (`04shiho` lacks `face_sparkling_01` and `face_worry_01`; verify every clip!).

### Step 4 — Validate, Simulate & Self-Heal Live (Mandatory!)

Run the standalone validator on every `.msk` draft before returning it to the user:

```bash
node scripts/validate-msk.mjs path/to/story.msk --strict --simulate --verify-assets
```

You can also pipe stdin directly via `-`:
```bash
node scripts/validate-msk.mjs - --strict --simulate --verify-assets < path/to/story.msk
```

What this verifies automatically:
- **Syntax & Static Compiler (`--strict`)**: 0 parse errors, 0 compiler errors, **0 compiler warnings** (`mergeNodeInheritAmbiguous`, `stageSlotDuplicate`, `stageActorOverlap`, `portUnwired`, `nodeUnreachable`, `sceneEmptyBeats`, `endingMissing`, `cycleDetected`).
- **Exhaustive Branch Simulator (`--simulate`)**: Executes every reachable choice combination, confirming every `end` is reachable, 0 deadlocks/loops/disconnected paths, 0 unintended runtime overlaps, and flags any off-stage `talk` beats (`stage.speaking === null`) for review.
- **Live HTTPS Asset Verifier (`--verify-assets`)**: Checks every BG `.webp`, BGM `.mp3`, SE `.mp3`, voice `.mp3`, Live2D model `_ripper.json`, AND every single `motion` and `facial` clip against Moesekai's live ripper manifests! When a clip is missing, it prints **`did you mean: ...`** suggestions from that character's real manifest so you can self-heal in one turn!
- Add `--assets` to dump all concrete preview URLs (if you have vision/audio tools, inspect the `.webp` backgrounds and `.mp3` audio directly!) or `--dump-json` for machine-readable reports.

**Do NOT stop until exit code is `0` with 0 errors, 0 warnings, 0 missing assets, and 100% endings reached!**

### Step 5 — Deliver Ready-to-Paste `.msk`

Present the final `.msk` script (or file) and remind the user they can paste it directly into **Moesekai Story Maker → Code Mode (`代码`)** at `https://pjsk.moe/story-maker/edit` (1-click **Paste → Apply & Playtest**).

---

## 2. Quick-Start Example (Zero Errors, Zero Warnings)

```msk
# Comments start with '#' or '//'
@story "After-School Mini Practice" region=jp id="demo_story" author="Moesekai" summary="A short branching demo."

@var harmony: number = 0 "Harmony"
@var invited: boolean = false "Invited"

@cast ichika "Hoshino Ichika" model="v2_01ichika_casual" char=1
@cast saki "Tenma Saki" model="v2_02saki_casual" char=2

start -> scene_open

scene scene_open "After-School Classroom" {
  bg set "bg_a000401"
  bgm play "bgm00020" vol=0.75
  place set "Miyamasuzaka Girls Academy - Classroom"
  transition fadeBlack 0.5
  cast set [
    ichika at left facial="face_smile_01"
    saki at right facial="face_normal_01"
  ]
  telop "After-School Mini Practice"
  talk ichika "Good work today, Saki!" motion="w-normal01-nod" facial="face_smile_01" react(saki motion="w-normal01-glad" facial="face_sparkling_01") se="se_pack00001_b/se00001_b" seVol=0.7
  talk saki "Hehe, let's make the most of today!" motion="w-normal01-pose" facial="face_wink_01"
} -> choice_plan

choice choice_plan "What next?" {
  opt_practice: "Rehearse the chorus" [harmony += 1, invited = true] -> scene_practice
  opt_cafe: "Visit the sweets shop" -> scene_cafe
}

scene scene_practice "Rehearsal" {
  bg inherit
  bgm inherit
  place inherit
  transition none 0.4
  cast inherit
  stage move ichika to center dur=0.4 overlap facial="face_shy_01"
  stage move saki to center dur=0.45 overlap facial="face_sparkling_01"
  talk saki "Let's read the score together right here!" motion="w-normal01-glad" facial="face_sparkling_01" react(ichika motion="w-normal01-nod" facial="face_smile_01")
} -> cond_end

scene scene_cafe "Sweets Shop" {
  bg set "bg_a001401"
  bgm play "bgm00045" vol=0.72
  place set "Corner Cafe"
  transition fadeBlack 0.5
  cast set [
    ichika at left facial="face_smile_01"
    saki at right facial="face_sparkling_01"
  ]
  talk saki "Strawberry parfait time!" motion="w-normal01-pose" facial="face_sparkling_01"
} -> cond_end

condition cond_end "Ending Check" {
  rule_sync: if harmony >= 1 "In Sync" -> end_sync
  else -> end_cafe
}

end end_sync "In-Sync Ending" subtitle="Harmony reached {{harmony}}!"
end end_cafe "Sweet Ending" subtitle="Recharged for tomorrow! (Harmony: {{harmony}})"
```

---

## 3. Compact `.msk` Syntax Cheat Sheet

- **Header**:
  - `@story "<title>" region=<jp|cn|tw|kr|en> [id="<id>"] [author="<author>"] [summary="<summary>"]`
  - `@var <id>: number = <n> ["<name>"]` | `@var <id>: boolean = <true|false> ["<name>"]` (interpolate via `{{id}}` or `{{name}}`)
  - `@cast <key> "<name>" model="<modelId>" [char=<1..26>]` (omit `char=...` for supporting/collab models found via `catalog models --kind sub|collab --search <name>`)
- **Nodes** (all accept optional `@pos(x, y)`):
  - `start [id=<id>] -> <target>`
  - `scene <id> ["<title>"] { <slots> <beats...> } -> <target>`
    - Slots: `bg set "<id>" | inherit | clear`, `bgm play "<path>" [vol=0.75] | inherit | stop`, `place set "<text>" | inherit | hide`, `transition <none|fadeBlack|fadeWhite> [<dur>]`, `cast set [ <key> at <farLeft|left|center|right|farRight> [scale=1] [y=0] [overlap] [motion="..."] [facial="..."] ... ] | inherit | clear`
  - `choice <id> ["<title>"] { [<optId>:] "<text>" [if <var> <op> <val>] [<varOps>] -> <target> ... }` (2–4 options)
  - `condition <id> ["<title>"] { [<ruleId>:] if <var> <op> <val> ["<label>"] -> <target> ... else -> <target> }`
  - `end <id> ["<title>"] [subtitle="<text>"]`
- **Beats inside `scene`**:
  - `talk <key> [as "<name>"] "<body>" [motion="..."] [facial="..."] [react(<key> [motion="..."] [facial="..."]) ...] [voice(<kind>:<scenarioId>:<voiceId>[[start..end]][@region])] [se="<path>"] [seVol=0.8]` (or off-cast `talk "<name>" "<body>"`)
  - `narration "<body>" [se="<path>"] [seVol=0.8]`
  - `telop "<text>"`
  - `stage enter <key> [at <slot>] [scale=...] [y=...] [overlap] [motion="..."] [facial="..."]`
  - `stage move <key> to <slot> [dur=0.5] [scale=...] [y=...] [overlap] [motion="..."] [facial="..."]`
  - `stage pose <key> [motion="..."] [facial="..."]` | `stage exit <key>`
  - `cue se "<path>" [vol=0.8]` | `cue flash <black|white> [<dur>]` | `cue shake [<dur>]` | `cue wait [<dur>]`
  - `set <var> += 1, <var> -= 1, <var> = 5, <flag> = true, <flag> toggle`

---

## 4. Deep-Dive References (Load On Demand)

- **[`references/msk-syntax.md`](references/msk-syntax.md)** — Complete lexical rules, `STORY_LIMITS`, every compiler error & warning code, full 1–5 actor stage geometry & `overlap` math, and voice trim bounds.
- **[`references/official-stories.md`](references/official-stories.md)** — Complete Moesekai official story & public CDN handbook: all `official-story.mjs` commands, all 6 official story types' URL patterns, `sekai-story-search` Brotli corpus, `translation.exmeaning.com`, and raw official scenario JSON (`Snippets`/`TalkData`/`LayoutData`/`SpecialEffectData`/`SoundData`) → `.msk` mapping.
- **[`references/character-assets.md`](references/character-assets.md)** — All 26 characters' IDs, units, gender motion prefixes, verified `v2_` models, Live2D motion/facial caveats, and verified staple backgrounds, BGMs, SEs, and voice patterns.
