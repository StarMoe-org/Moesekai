---
name: moesekai-story-script
description: Complete authoring, asset discovery, static validation, branch simulation, and multimodal debugging guide for MoeSekai Script (.msk) interactive Project SEKAI visual novel stories in Moesekai Story Maker (moesekai-story/2). Use when writing, editing, converting, validating, or debugging .msk story scripts.
---

# MoeSekai Script (`.msk`) Authoring & Multimodal Debugging Guide

MoeSekai Script (`.msk`) is the lossless, human- and AI-readable DSL for **Moesekai Story Maker** (`moesekai-story/2`). Every `.msk` file compiles bidirectionally to and from the visual node graph (`start`, `scene`, `choice`, `condition`, `end`) used at `/story-maker/edit` and `/story-maker/play`.

Assets are referenced strictly by their official Project SEKAI game names on the story's server (`jp`, `cn`, `tw`, `kr`, `en`) — never by raw URLs or uploaded files.

> **Public Asset Attribution**: Moesekai (`pjsk.moe`) serves `storage.pjsk.moe`, `storage.exmeaning.com`, `assets.pjsk.moe`, and `metadata.pjsk.moe` with `Access-Control-Allow-Origin: *`. Credit `Moesekai (pjsk.moe)` if you embed these endpoints externally.

---

## 1. Quick-Start Example (Zero Errors, Zero Warnings)

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
    ichika at left scale=1.05 facial="face_smile_01"
    saki at right scale=1.05 facial="face_normal_01"
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
  stage move ichika to center dur=0.5
  talk ichika "Let's take it from the chorus!" motion="w-normal01-glad" facial="face_sparkling_01"
} -> cond_end

scene scene_cafe "Sweets Shop" {
  bg inherit
  bgm inherit
  place hide
  transition none 0.4
  cast inherit
  stage move saki to center dur=0.5
  talk saki "Strawberry parfait time!" facial="face_sparkling_01"
} -> cond_end

condition cond_end "Ending Check" {
  rule_sync: if harmony >= 1 "In Sync" -> end_sync
  else -> end_cafe
}

end end_sync "In-Sync Ending" subtitle="Harmony reached {{harmony}}!"
end end_cafe "Sweet Ending" subtitle="Recharged for tomorrow! (Harmony: {{harmony}})"
```

---

## 2. Complete `.msk` Language Reference

### 2.1 Lexical Rules & Limits

- **Comments**: `# ...` or `// ...` until newline.
- **Separators**: Statements are separated by newlines or optional `;`.
- **Strings**: Double-quoted `"..."`. Supported escapes: `\"`, `\\`, `\n`, `\r`, `\t`.
- **Identifiers** (`STORY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`): Used for document `id`, variable `id`, cast `key`, node `id`, choice option `id`, condition rule `id`. All-digit IDs (`0482`) and digit-hyphen IDs (`01-ev`) are supported; `-` is part of an identifier unless followed by `>` (`->`) or `=` (`-=`).
- **Asset patterns**:
  - Single-segment asset (`bg`, voice `scenarioId` / `voiceId`): `/^[A-Za-z0-9_-]{1,64}$/`
  - Audio path (`bgm`, `se`): `/^(?=.{1,128}$)[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+){0,4}$/` (bare ID, `<pack>/<file>`, or `mysekai/sound/bgm/...`)
  - Live2D `modelId`: `/^[a-z0-9_]{1,64}$/`
  - Motion/facial clip name: `/^[A-Za-z0-9_.-](?:[A-Za-z0-9_. -]{0,62}[A-Za-z0-9_.-])?$/` (internal spaces are allowed because real game clips include names like `"face_ worry_01"`; leading/trailing spaces and slashes are forbidden).
- **Hard limits (`STORY_LIMITS`)**:
  - Graph: max **200 nodes**, **600 edges**, **200 beats/scene**, **2,000 total beats**.
  - Cast & stage: max **8 cast definitions**, max **5 actors** mounted simultaneously in `stageCast`, max **4 reactions** per `talk` beat.
  - Variables & branching: max **32 variables**, **16 varOps/beat or option**, **12 condition rules**, **2–4 options** per `choice`.
  - Strings: title `80`, summary `500`, author `40`, cast name `40`, var display name `32`, node title `60`, end subtitle `160`, rule label `40`, dialogue/narration body `500`, telop `120`, place `80`, speaker override `40`, choice text `80`, audio path `128`.
  - Numeric bounds: `duration` `0..10` s, `vol` / `seVol` `0..1`, `scale` `0.5..2.0`, `y` `-0.6..0.6`, numeric variables `-1,000,000..1,000,000`, voice trim `0 <= start <= 600`, `0 < end <= 600`, `end - start >= 0.05`, canvas coordinates `-20000..20000`.

---

### 2.2 Header Directives

```msk
@story "<title>" region=<jp|cn|tw|kr|en> [id="<docId>"] [author="<author>"] [summary="<summary>"]
@var <varId>: number = <initialNumber> ["<displayName>"]
@var <varId>: boolean = <true|false> ["<displayName>"]
@cast <castKey> "<displayName>" model="<modelId>" [char=<1..999>]
```

- `@story`: Declares document title, server `region` (`jp`, `cn`, `tw`, `kr`, `en`), optional `id`, `author`, and `summary`.
- `@var`: Declares a typed low-code counter (`number`) or flag (`boolean`). Optional trailing string sets the display name; `{{varId}}` AND `{{displayName}}` can both be interpolated in text!
- `@cast`: Declares a reusable character bound to a Live2D `modelId` (e.g. `v2_01ichika_casual`). `char=<id>` links the MasterCharacter ID (1–26) for UI icons and voice metadata.

---

### 2.3 Graph Nodes, `@pos(x, y)`, and Edges `->`

Every node accepts an optional `@pos(x, y)` canvas coordinate. Any node omitting `@pos` is automatically positioned left-to-right by `autoLayoutGraph` (`col gap = 380`, `row gap = 260`).

#### `start`
```msk
start [id=<startId>] [@pos(x, y)] -> <targetNodeId>
```
- Entry point of the graph (`id` defaults to `start`). Cannot have incoming edges. Must wire `-> <targetNodeId>` or the compiler emits error `startDisconnected`.

#### `scene`
```msk
scene <nodeId> ["<title>"] [@pos(x, y)] {
  bg <set "<asset>" | inherit | clear>
  bgm <play "<audioPath>" [vol=<0..1>] | inherit | stop>
  place <set "<text>" | inherit | hide>
  transition <none|fadeBlack|fadeWhite> [<duration>]
  cast <set [ <actorSlot>... ] | inherit | clear>

  # Ordered performance beats...
} -> <targetNodeId>
```
- The outgoing edge `-> <targetNodeId>` may be placed right after `}` (canonical serializer output) or as the last line inside `{ ... }`.
- Omitted stage slots default to `inherit` (and `transition none 0.4`).
- `bgm play` defaults to `vol=0.75` if `vol=` is omitted.
- **Stage `cast set [...]` actor slot syntax** (newlines or commas separate entries; `cast set []` clears to empty set):
  ```msk
  cast set [
    ichika at left scale=1.05 y=0 motion="w-normal01-nod" facial="face_smile_01"
    saki at right scale=1.05
  ]
  ```
  Standing slots and their exact world X positions (`SLOT_X`):
  | Slot | `SLOT_X` | Typical Usage |
  | --- | --- | --- |
  | `farLeft` | `-0.62` | 3–5 character wide staging (outer left) |
  | `left` | `-0.365` | Standard 2-character dialogue (left) |
  | `center` | `0` | Solo focus or 3-character center |
  | `right` | `0.365` | Standard 2-character dialogue (right) |
  | `farRight` | `0.62` | 3–5 character wide staging (outer right) |

#### All 6 Scene Performance Beats

| Beat | Blocking? | Exact Syntax | Notes |
| --- | --- | --- | --- |
| **Dialogue (`talk`)** | Yes (waits for click/auto) | `talk <speakerKey> [as "<name>"] "<body>" [motion="..."] [facial="..."] [react(<castKey> [motion="..."] [facial="..."]) ...] [voice(...)] [se="..."] [seVol=0.8]`<br>or off-cast free name:<br>`talk "<speakerName>" "<body>" [...]` | Supports `{{var}}` in `body` and speaker name. Up to 4 `react(...)` clauses fire synchronously on co-stars! |
| **Narration (`narration`)** | Yes | `narration "<body>" [se="<path>"] [seVol=<0..1>]` | Full-width narration box; supports `{{var}}`. |
| **Telop (`telop`)** | Yes | `telop "<text>"` | Chapter/time-skip banner card; supports `{{var}}`. |
| **Stage Action (`stage`)** | No (runs immediately) | `stage enter <castKey> [at <slot>] [scale=...] [y=...] [motion="..."] [facial="..."]`<br>`stage move <castKey> to <slot> [dur=0.5] [scale=...] [y=...] [motion="..."] [facial="..."]`<br>`stage pose <castKey> [motion="..."] [facial="..."]`<br>`stage exit <castKey>` | `at` and `to` are accepted interchangeably in the parser; serializer uses `at` for `enter` and `to` for `move`. |
| **Cue (`cue`)** | No (runs immediately) | `cue se "<path>" [vol=<0..1>]`<br>`cue flash <black|white> [<dur>]`<br>`cue shake [<dur>]`<br>`cue wait [<dur>]` | Plays sound effect, screen flash, camera shake, or timed pause. |
| **Variable Op (`set`)** | No (runs immediately) | `set <var> += 1, <var> -= 2, <var> = 5, <flag> = true, <flag> toggle` | Comma-separated mutations (`set` or `set []` is valid empty op). |

##### Speaker ↔ Live2D Linkage & Co-Star Reactions
- When `talk <castKey> "..."` references a `castKey` **currently mounted on stage** (via `cast set [...]`, inherited from an earlier scene, or `stage enter`), the stage automatically activates mouth lip-sync on that Live2D actor (`stage.speaking = castKey`) and triggers any `motion="..."` / `facial="..."` on the speaker.
- Adding `react(<otherCastKey> motion="..." facial="...")` updates up to 4 co-stars' Live2D motion/expression on the **exact same beat** as the speaker's line!
- If `<castKey>` is **not** currently on stage, the dialogue still shows the character's name from `@cast` (or `as "..."` override), and `stage.speaking` stays `null` (useful for phone calls, intercoms, or voice-overs).

##### Voice References (`voice(...)`)
```msk
voice(<kind>:<scenarioId>:<voiceId>)
voice(<kind>:<scenarioId>:<voiceId>[<start>..<end>])
voice(<kind>:<scenarioId>:<voiceId>[<start>..])
voice(<kind>:<scenarioId>:<voiceId>[..<end>])
voice(<kind>:<scenarioId>:<voiceId>@<region>)
voice(<kind>:<scenarioId>:<voiceId>[0.25..2.5]@jp)
```
- `<kind>`: `story` | `card` | `area` | `part`.
- Trim bounds: `0 <= start <= 600`, `0 < end <= 600`, `end - start >= 0.05`.
- `@<region>` overrides the document's `region` so a CN/EN story can reference JP voices cleanly.

#### `choice`
```msk
choice <nodeId> ["<title>"] [@pos(x, y)] {
  [<optId>:] "<option text>" [if <var> <op> <val>] [<varOps>] -> <targetNodeId>
  [<optId>:] "<option text>" -> <targetNodeId>
}
```
- Requires **2 to 4** non-empty options. Default option IDs are `opt1`, `opt2`, `opt3`, `opt4`.
- `if <cond>`: Conditional availability (`==`, `!=`, `>`, `>=`, `<`, `<=` for `number`; `==`, `!=` for `boolean`). Options whose condition evaluates `false` are locked/unselectable.
- `[op1, op2]`: Optional variable mutations executed when the player chooses this option.
- Option text supports `{{var}}` interpolation.

#### `condition`
```msk
condition <nodeId> ["<title>"] [@pos(x, y)] {
  [<ruleId>:] if <var> <op> <val> ["<label>"] -> <targetNodeId>
  else -> <targetNodeId>
}
```
- Evaluates rules top-to-bottom (non-blocking) and branches to the first matching rule; falls back to `else`.
- Default rule IDs are `rule1`, `rule2`, ... (`ruleId` cannot be `else`).

#### `end`
```msk
end <nodeId> ["<title>"] [subtitle="<subtitle>"] [@pos(x, y)]
```
- Terminal ending card. Both `<title>` and `subtitle` support `{{var}}` interpolation. Cannot have outgoing edges.

---

## 3. Compiler Rules, Diagnostics & Common Pitfalls

### Blocking Errors (`program.ok === false`)
| Code | Cause | Fix |
| --- | --- | --- |
| `startMissing` / `startDisconnected` | Missing `start` node or `start` has no `-> target` | Add `start -> first_scene` |
| `castUnknown` | `castKey` / `speakerKey` / `react(...)` / `stage` references undeclared cast | Declare `@cast <key> "..." model="..."` |
| `speakerMissing` | `talk` has neither `speakerKey` nor non-empty `speakerName` | Provide cast key or `"Speaker"` string |
| `actorDuplicate` / `actorLimitExceeded` | Duplicate `castKey` or > 5 actors in `cast set [...]` | Keep <= 5 unique actors in `cast set` |
| `variableNotFound` / `variableTypeMismatch` | Undeclared var, or `toggle` on number / `+=` or `>` on boolean | Match variable type (`number` vs `boolean`) |
| `templateVarMissing` | `{{foo}}` does not match any declared variable `id` or `name` | Declare `@var foo: ...` or fix spelling |
| `edgeInvalidSource` / `edgeInvalidTarget` / `edgeDuplicatePort` | Edge from `end`, edge targeting `start` or missing node, or duplicate port wire | Ensure target IDs exist and never wire into `start` |
| `choiceOptionEmpty` / `tooFew` / `tooMany` | Choice has < 2 or > 4 options, or blank option text | Keep 2–4 non-empty choice options |
| `assetNameInvalid` / `modelIdInvalid` / `voiceTrimInvalid` | Invalid characters or trim range (`end - start < 0.05`) | Check regexes in §2.1 |

### Non-Blocking Warnings (Fix All for `--strict` Clean Graphs!)
| Code | Cause | How to Resolve |
| --- | --- | --- |
| **`mergeNodeInheritAmbiguous`** | A `scene` node has **2 or more incoming edges (`inDegree >= 2`)** AND uses `inherit` on any of `background`, `bgm`, `place`, or `stageCast`. Depending on which branch the player took, the inherited stage state could differ ambiguously (and static single-node preview in the editor picks the shortest BFS path by edge order). | **Explicitly declare all 4 stage slots on merge scenes**: `bg set "..."` (or `clear`), `bgm play "..."` (or `stop`), `place set "..."` (or `hide`), and `cast set [...]` (or `clear`). Or merge into a `condition` / `choice` / `end` node instead of an `inherit` scene. |
| **`stageSlotDuplicate`** | Two or more actors occupy the **same semantic slot** (e.g., both on `center`, or `stage enter`/`stage move` lands on a slot already held by another character). | Assign distinct slots (`farLeft`, `left`, `center`, `right`, `farRight`), or move/exit the occupying actor first. |
| **`stageActorOverlap`** | Adjacent actors' resolved horizontal spacing (`gap`) is narrower than their combined safe visual envelope (`0.195 × (scale_a + scale_b)`) — typically caused by scaling up too many simultaneous actors (e.g. 4 actors at `scale >= 1.3` or 5 actors at `scale > 1.0`). | Keep `scale` at `1` (true 1:1 in-game size) for multi-actor scenes, reduce `scale`, or stage fewer simultaneous actors. |
| `nodeUnreachable` | Node cannot be reached from `start` | Wire it into the flow or delete unused draft nodes |
| `portUnwired` | A `scene`, `choice` option, or `condition` rule/`else` has no `-> target` | Wire every port to a scene, choice, condition, or `end` |
| `sceneEmptyBeats` | A `scene` has 0 beats | Add at least one beat (or merge setup into the next scene) |
| `endingMissing` | No `end` node is reachable from `start` | Add at least one reachable `end` node |
| `cycleDetected` | Zero-wait cycle over non-blocking nodes (`condition` / beatless `scene`) | Ensure every loop passes through a blocking `talk`/`narration`/`telop` or `choice` |

### Stage Framing & Safe Non-Overlapping Placement
The stage engine (`layoutStageActors` in `limits.ts`) automatically computes authentic, balanced Project SEKAI horizontal positions (`x` in `[-1, +1]` half-frame units) from the occupied semantic slots so characters never crowd into the corners:

| Actors on Stage | Recommended Slots | Resolved `x` Positions | Center-to-Center Gap | Safe `scale` Range |
| --- | --- | --- | --- | --- |
| **1 actor** | `center` (or any slot) | `0` (`farLeft=-0.75`, `left=-0.365`, `right=0.365`, `farRight=0.75`) | — | `0.85 – 1.30` |
| **2 actors** | `left`, `right` | `-0.365, +0.365` (official `SIDE_X_DEFAULT`) | `0.73` | `0.90 – 1.25` |
| **3 actors** | `left`, `center`, `right` | `-0.573, 0, +0.573` (official `SIDE_X_THREE`) | `0.573` | `0.90 – 1.15` |
| **4 actors** | `farLeft`, `left`, `right`, `farRight` | `-0.75, -0.25, +0.25, +0.75` | `0.50` | `0.90 – 1.05` (**prefer `1` / omit `scale`**) |
| **5 actors** | all 5 slots | `-0.80, -0.40, 0, +0.40, +0.80` | `0.40` | `0.85 – 1.00` (**prefer `<= 1`**) |

- **Default `scale = 1` is exact 1:1 in-game PJSK height/scale.** Omit `scale` (or use `scale=1`) for normal multi-character framing; reserve `scale=1.1–1.25` for dramatic 1–2 character close-ups!
- **Never share a slot**: `stage enter` / `stage move` onto an occupied slot triggers `stageSlotDuplicate` (and `--simulate` catches inherited-cast overlaps across scene boundaries too). When shifting a lineup (e.g. 3 actors → 4 actors), move existing actors off the target slot *or* enter into an unoccupied slot first.

### Off-Stage Speaker Check
In `--simulate`, the validator reports any `talk <castKey>` beat where `<castKey>` is **not** mounted on stage (`stage.speaking === null`). Verify each reported line is intentional (e.g. phone call / intercom); otherwise add the actor to `cast set [...]` or emit `stage enter <castKey> at <slot>` before the line.

---

## 4. Real Project SEKAI Asset Discovery Guide

Never guess asset IDs! Every live catalog below is publicly accessible over HTTPS (`CORS *`):

### 4.1 All 26 Official Characters & Live2D Model Naming

| ID | Unit | Prefix (`NNname`) | Character (EN / JP / ZH) | Verified `v2_` Models |
| --: | --- | --- | --- | --- |
| 1 | Leo/need | `01ichika` | Hoshino Ichika / 星乃一歌 | `v2_01ichika_casual`, `v2_01ichika_unit`, `v2_01ichika_school01` |
| 2 | Leo/need | `02saki` | Tenma Saki / 天馬咲希 / 天马咲希 | `v2_02saki_casual`, `v2_02saki_unit`, `v2_02saki_school01` |
| 3 | Leo/need | `03honami` | Mochizuki Honami / 望月穂波 / 望月穗波 | `v2_03honami_casual`, `v2_03honami_unit`, `v2_03honami_school01` |
| 4 | Leo/need | `04shiho` | Hinomori Shiho / 日野森志歩 / 日野森志步 | `v2_04shiho_casual`, `v2_04shiho_unit`, `v2_04shiho_school01` |
| 5 | MORE MORE JUMP! | `05minori` | Hanasato Minori / 花里みのり / 花里实乃理 | `v2_05minori_casual`, `v2_05minori_unit`, `v2_05minori_school01` |
| 6 | MORE MORE JUMP! | `06haruka` | Kiritani Haruka / 桐谷遥 | `v2_06haruka_casual`, `v2_06haruka_unit` |
| 7 | MORE MORE JUMP! | `07airi` | Momoi Airi / 桃井愛莉 / 桃井爱莉 | `v2_07airi_casual`, `v2_07airi_unit` |
| 8 | MORE MORE JUMP! | `08shizuku` | Hinomori Shizuku / 日野森雫 | `v2_08shizuku_casual`, `v2_08shizuku_unit`, `v2_08shizuku_school01` |
| 9 | Vivid BAD SQUAD | `09kohane` | Azusawa Kohane / 小豆沢こはね / 小豆泽心羽 | `v2_09kohane_casual`, `v2_09kohane_unit`, `v2_09kohane_school01` |
| 10 | Vivid BAD SQUAD | `10an` | Shiraishi An / 白石杏 | `v2_10an_casual`, `v2_10an_unit`, `v2_10an_school01` |
| 11 | Vivid BAD SQUAD | `11akito` | Shinonome Akito / 東雲彰人 / 东云彰人 | `v2_11akito_casual`, `v2_11akito_unit`, `v2_11akito_school01` |
| 12 | Vivid BAD SQUAD | `12touya` | Aoyagi Toya / 青柳冬弥 | `v2_12touya_casual`, `v2_12touya_unit`, `v2_12touya_school01` |
| 13 | Wonderlands×Showtime | `13tsukasa` | Tenma Tsukasa / 天馬司 / 天马司 | `v2_13tsukasa_casual`, `v2_13tsukasa_unit`, `v2_13tsukasa_school01` |
| 14 | Wonderlands×Showtime | `14emu` | Otori Emu / 鳳えむ / 凤笑梦 | `v2_14emu_casual`, `v2_14emu_unit`, `v2_14emu_school01` |
| 15 | Wonderlands×Showtime | `15nene` | Kusanagi Nene / 草薙寧々 / 草薙宁宁 | `v2_15nene_casual`, `v2_15nene_unit`, `v2_15nene_school01` |
| 16 | Wonderlands×Showtime | `16rui` | Kamishiro Rui / 神代類 / 神代类 | `v2_16rui_casual`, `v2_16rui_unit`, `v2_16rui_school01` |
| 17 | 25-ji, Nightcord de. | `17kanade` | Yoisaki Kanade / 宵崎奏 | `v2_17kanade_casual`, `v2_17kanade_unit`, `v2_17kanade_school` |
| 18 | 25-ji, Nightcord de. | `18mafuyu` | Asahina Mafuyu / 朝比奈まふゆ / 朝比奈真冬 | `v2_18mafuyu_casual`, `v2_18mafuyu_unit`, `v2_18mafuyu_school01` |
| 19 | 25-ji, Nightcord de. | `19ena` | Shinonome Ena / 東雲絵名 / 东云绘名 | `v2_19ena_casual`, `v2_19ena_unit`, `v2_19ena_school01` |
| 20 | 25-ji, Nightcord de. | `20mizuki` | Akiyama Mizuki / 暁山瑞希 / 晓山瑞希 | `v2_20mizuki_casual`, `v2_20mizuki_unit`, `v2_20mizuki_school01` |
| 21 | VIRTUAL SINGER | `21miku` | Hatsune Miku / 初音ミク / 初音未来 | `v2_21miku_normal`, `_band`, `_idol`, `_street`, `_wonder`, `_night` |
| 22 | VIRTUAL SINGER | `22rin` | Kagamine Rin / 鏡音リン / 镜音铃 | `v2_22rin_normal`, `_band`, `_idol`, `_street`, `_wonder`, `_night` |
| 23 | VIRTUAL SINGER | `23len` | Kagamine Len / 鏡音レン / 镜音连 | `v2_23len_normal`, `_band`, `_idol`, `_street`, `_wonder`, `_night` |
| 24 | VIRTUAL SINGER | `24luka` | Megurine Luka / 巡音ルカ / 巡音流歌 | `v2_24luka_normal`, `_band`, `_idol`, `_street`, `_wonder`, `_night` |
| 25 | VIRTUAL SINGER | `25meiko` | MEIKO | `v2_25meiko_normal`, `_band`, `_idol`, `_street`, `_wonder`, `_night` |
| 26 | VIRTUAL SINGER | `26kaito` | KAITO | `v2_26kaito_normal`, `_band`, `_idol`, `_street`, `_wonder`, `_night` |

> **Virtual Singer unit suffixes**: `_band` = Leo/need, `_idol` = MMJ, `_street` = VBS, `_wonder` = WxS, `_night` = 25ji, `_normal` = original VS.

### 4.2 Live2D Model Index & Motion / Facial Discovery (`models.json` & `_ripper.json`)

- **Full server model index**:
  `https://assets.pjsk.moe/sekai-extra-assets/sekai-live2d/<region>/models.json`
  Each entry gives `{ id, bundle, motion, motions, kind, characterId }`, e.g.:
  - `id`: `"v2_01ichika_casual"`
  - `bundle`: `"live2d/model/v2_01ichika_casual"`
  - `motion`: `"live2d/motion/v2_01ichika_motion_base"`
- **Exact available motions & facials for a model** (from `_ripper.json`, generated from the game's `buildmodeldata.json` / motion bundles):
  `https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/<region>/library/<motionBundle>/_ripper.json`
  Look at `files[].path`:
  - `motion/<motionName>.sse-motion.json` → use `<motionName>` in `motion="..."`
  - `facial/<facialName>.sse-motion.json` → use `<facialName>` in `facial="..."`
- **Naming conventions (and pitfalls!)**:
  - **Body motions**:
    - Female characters (`01ichika`..`10an`, `14emu`, `15nene`, `17kanade`..`22rin`, `24luka`, `25meiko`) use **`w-<style><num>-<action>`**, e.g.:
      - `w-normal01-nod`, `w-normal01-pose`, `w-normal01-glad`, `w-normal01-tilthead`, `w-normal01-shakehead`, `w-normal01-guts`, `w-normal01-piece`
      - `w-cool02-pose`, `w-cool06-nod`, `w-adult01-think`, `w-cute01-...`, `w-happy...`
    - Male characters (`11akito`, `12touya`, `13tsukasa`, `16rui`, `23len`, `26kaito`) use **`m-<style><num>-<action>`**, e.g.:
      - `m-normal13-nod`, `m-normal13-pose`, `m-normal13-tilthead`, `m-normal13-sigh`, `m-normal13-angry`, `m-cool01-nod`, `m-cool08-think`
    - **Never assign a `w-*` motion to a male character or an `m-*` motion to a female character!**
  - **Facials**: `face_<emotion>_<NN>` (and tagged variants like `face_os*`, `face_nc*`, `face_dark*`):
    - Common naming roots across many characters: `face_normal_01`, `face_smile_01`, `face_smile_02`, `face_smile_03`, `face_sparkling_01`, `face_surprise_01`, `face_shy_01`, `face_trouble_01`, `face_worry_01`, `face_sad_01`, `face_angry_01`, `face_cry_01`, `face_closeeye_01`, `face_lookaway_01l`, `face_lookaway_01r`, `face_lookdown_01`.
    - **Per-character availability caveat**: Even "common" facial names vary significantly by character! For example, `04shiho` lacks `face_sparkling_01` and `face_worry_01`; `03honami` lacks `face_worry_01`; `01ichika` and `02saki` lack `face_happy_01` (use `face_smile_01` or `face_sparkling_01`); and some game facials legitimately contain an internal space (e.g. `"face_ worry_01"` on Saki). Always confirm clips against each character's `_ripper.json` or run `--verify-assets`.

### 4.3 Backgrounds (`scenario/background/`)

- **Directory index**: `https://storage.pjsk.moe/sekai-<region>-assets/scenario/background/` (`format: "directory-listing"`, `directories[]`)
- **Image URLs**:
  - WebP (fast preview): `https://storage.pjsk.moe/sekai-<region>-assets/scenario/background/<bgId>/<bgId>.webp`
  - Lossless PNG: `https://storage.pjsk.moe/sekai-<region>-assets/scenario/background/<bgId>/<bgId>.png`
- **Classification**:
  - `bg_a000001`–`bg_a000099` and `bg_s*`: Story CG / event still illustrations.
  - `bg_a000101`+ / `bg_f*`: Reusable location & SEKAI backgrounds.
- **Verified staple location backgrounds (HTTP 200 across all 5 servers `jp`/`cn`/`en`/`tw`/`kr`)**:
  | Asset ID | Location & Lighting |
  | --- | --- |
  | `bg_a000401` | Miyamasuzaka Girls Academy classroom (daytime) |
  | `bg_a000402` | Miyamasuzaka Girls Academy classroom (sunset) |
  | `bg_a000403` | Miyamasuzaka Girls Academy classroom (night) |
  | `bg_a000802` | Miyamasuzaka Girls Academy rooftop (sunset) |
  | `bg_a001401` | Corner cafe / sweets shop (daytime) |
  | `bg_a001901` | Band rehearsal studio (indoor) |
  | `bg_f000101` | School SEKAI classroom (sunset) |
  | `bg_f000701` | School SEKAI starry rooftop (Milky Way) |

### 4.4 BGM (`musicSoundTracks.json` + `sound/scenario/bgm/`)

- **Official titled soundtrack masterdata**:
  - Tracks: `https://metadata.pjsk.moe/<region>/master/musicSoundTracks.json`
  - Categories: `https://metadata.pjsk.moe/<region>/master/musicSoundTrackCategories.json`
- **Scenario BGM directory listing**: `https://storage.pjsk.moe/sekai-<region>-assets/sound/scenario/bgm/`
- **URL rules (`storyBgmUrl`)**:
  - Bare ID (`"bgm00020"`, `"bgm_area00001"`): `.../sound/scenario/bgm/<id>/<id>.mp3`
  - `<dir>/<file>` (`"bgm00016_01/bgm00016_01_1"`, `"bgm10001/bgm_area_leoneed_untitled"`): `.../sound/scenario/bgm/<dir>/<file>.mp3`
  - Full `mysekai/...` (`"mysekai/sound/bgm/music0001/music0001"`): `.../<path>.mp3`
- **Verified scenario BGM examples (JP/all servers)**:
  - Everyday / bright: `bgm00020` (*ウキウキな季節*), `bgm00018` (*今、ここにある日常*), `bgm00006` (*微笑みの陽だまり*), `bgm00045` (*Pretty Good Days*), `bgm00054` (*Not Bad Afternoon*)
  - Comedy / lively: `bgm00003` (*Slapstick!!*), `bgm00052` (*青春フルスロットル！*), `bgm00056` (*虹色ガーランド*), `bgm00059` (*煌びやかな幕開け*)
  - Emotional / tender: `bgm00016` (*涙、心つたって*), `bgm00017` (*想いはきっと…*), `bgm00024` (*優しい星霜*), `bgm00048` (*光射す未来へ*), `bgm00062` (*新たな気持ちで*)
  - Tense / serious: `bgm00038` (*張りつめた糸*), `bgm00051` (*譲れないもの*), `bgm00055` (*深き眼差し*), `bgm00065` (*存在する孤独*)
  - Unit SEKAI themes: `bgm_area00001` (Leo/need), `bgm_area00002` (MMJ), `bgm_area00003` (VBS), `bgm_area00004` (WxS), `bgm_area00005` (25ji), `bgm00036` (SEKAI crossroads)
- **Skip non-BGM directories**: Never use `bgm00000` (10s silence — use `bgm stop`), `bgm` (duplicate wrapper), or `bgm90001`–`bgm90013` (~0.26s stem packs).

### 4.5 Sound Effects (`sound/scenario/se/`)

- Two disjoint packs exist on every server:
  - `se_pack00001_b/` (~1,084 clips, e.g. `se_pack00001_b/se00001_b`..`se00011_b`...)
  - `se_pack00001/` (~541 clips, e.g. `se_pack00001/se00056`...)
- **Directory listings**:
  - `https://storage.pjsk.moe/sekai-<region>-assets/sound/scenario/se/se_pack00001_b/`
  - `https://storage.pjsk.moe/sekai-<region>-assets/sound/scenario/se/se_pack00001/`
- **Always use pack-qualified paths** (`"se_pack00001/se00005"`) so resolution is deterministic on the first request without 404 fallback.
- **Verified staple SE clips (audio-audited, HTTP 200 across all 5 servers)**:
  | Pack Path | Sound Cue |
  | --- | --- |
  | `se_pack00001/se00005` | School chime / bell |
  | `se_pack00001/se00046` | Sliding classroom door |
  | `se_pack00001/se00064` | Footsteps |
  | `se_pack00001/se00091` | Sparkle / starlight chime |
  | `se_pack00001/se00092` | `Untitled` SEKAI warp transition |
  | `se_pack00001/se00123` | Full-band rock riff |
  | `se_pack00001/se00124` | Keyboard phrase |
  | `se_pack00001_b/se00001_b` | Scenario chime (default) |

### 4.6 Voices (`sound/*/voice/`)

| `kind` | URL Pattern under `https://storage.pjsk.moe/sekai-<region>-assets/` |
| --- | --- |
| `story` | `sound/scenario/voice/<scenarioId>/<voiceId>.mp3` |
| `card` | `sound/card_scenario/voice/<scenarioId>/<voiceId>.mp3` |
| `area` | `sound/actionset/voice/<scenarioId>/<voiceId>.mp3` |
| `part` | `sound/scenario/part_voice/<scenarioId>/<voiceId>.mp3` (note: `v2_*` / `clb*` part voices live under `story` as `scenarioId = part_voice_<assetName>_<unit>`) |

Directory listings exist at each voice root (e.g. `.../sound/scenario/voice/` and `.../sound/scenario/voice/<scenarioId>/`).

---

## 5. Multimodal Agent Debugging & Verification Workflow

### 5.1 Run the CLI Validator, Branch Simulator & Asset Inspector

From the repository root (or `web/`):

```bash
# 1. Syntax + compiler check (strict: fail on warnings too)
node --experimental-strip-types docs/skills/moesekai-story-script/scripts/validate-msk.mjs path/to/story.msk --strict

# 2. Full check: compile + simulate EVERY branch & ending + dump all asset URLs
node --experimental-strip-types docs/skills/moesekai-story-script/scripts/validate-msk.mjs path/to/story.msk --strict --simulate --assets

# 3. Live HTTPS verification of every BG, BGM, SE, voice, Live2D modelId, AND every motion/facial clip against _ripper.json!
node --experimental-strip-types docs/skills/moesekai-story-script/scripts/validate-msk.mjs path/to/story.msk --strict --simulate --verify-assets

# 4. Machine-readable JSON output (for programmatic agent pipelines)
node --experimental-strip-types docs/skills/moesekai-story-script/scripts/validate-msk.mjs path/to/story.msk --simulate --assets --dump-json
```

What each flag checks:
- Default: lexing/parsing (`line:col` errors) + full static compiler (`compileStoryGraph`). Exits `0` if 0 errors, `1` on parse/compile error.
- `--strict`: also exits `1` on ANY warning (`mergeNodeInheritAmbiguous`, `portUnwired`, `nodeUnreachable`, `sceneEmptyBeats`, `endingMissing`, `cycleDetected`).
- `--simulate`: runs `createInitialRuntime` + `advanceRuntime` across every reachable choice combination, verifying:
  - Every declared `end` node is actually reachable (`unreachedEndings: []`).
  - Zero branches hit `disconnected`, `loop`, or `deadlock` (all options locked).
  - Final variable states and `{{var}}` interpolations render as intended.
  - Reports any off-stage `talk` beats (`stage.speaking === null`) for review.
- `--assets`: dumps concrete `storage.pjsk.moe` / `assets.pjsk.moe` URLs for every background (`.webp` + `.png`), BGM `.mp3`, SE `.mp3`, voice `.mp3`, Live2D model `_ripper.json`, and every referenced `motion` / `facial` clip.
- `--verify-assets`: verifies over HTTPS that every image/audio URL returns HTTP 200 AND every `modelId`, `motion`, and `facial` exists in the real `models.json` and `_ripper.json` manifests!

### 5.2 Visual & Audio Inspection for Multimodal Agents

If you have vision and/or audio capabilities (or browser preview tools):

1. **Inspect Backgrounds Visually**:
   Run `--assets` to get every `backgrounds[].webp` (or `.png`) URL from `storage.pjsk.moe`. Download and view the images to verify time-of-day (day/sunset/night), indoor/outdoor mood, and that you did not accidentally pick a story CG (`bg_a000001`–`bg_a000099` / `bg_s*`) when a clean location backdrop was needed.
2. **Audit BGM, SE & Voice Audio**:
   Download the `bgm[].url`, `se[].urls[0]`, and `voices[].urls[0]` `.mp3` files from `--assets` to verify emotional tone, volume balance (`vol=0.65..0.80` for BGM so voices/SE stay crisp; `seVol=0.6..0.9`), and voice trim windows (`[start..end]`).
3. **Live Stage & Playtest Preview**:
   - Import the `.msk` file in `/story-maker/edit` (Click **Script / `.msk`** → paste or import `.msk` → Apply to Canvas), click **Playtest** in the top toolbar to step through scenes interactively in-place with real WebGPU Live2D rendering, lip-sync, co-star reactions, BGM transitions, and live variable monitor!
   - Or open directly in `/story-maker/play` to test the standalone reader experience (including mobile playback).

---

## 6. Authoring Best-Practice Checklist (Medium-Scale Stories)

- [ ] **Clear Narrative Arc**: 6–12 scenes, 1–2 meaningful `choice` nodes, 1–2 tracked `@var` counters/flags, a `condition` payoff node, and 2–3 distinct named `end` cards with `{{var}}` subtitle feedback.
- [ ] **Zero-Warning Clean Graph (`--strict`)**:
  - Every `scene` with 2+ incoming edges explicitly declares `bg`, `bgm`, `place`, and `cast` (no `mergeNodeInheritAmbiguous`).
  - Every `choice` option and `condition` rule + `else` is wired (`0 portUnwired`, `0 nodeUnreachable`).
  - Every declared `end` is proven reachable by `--simulate`.
- [ ] **Authentic Pacing & Staging**:
  - Open major location/time shifts with `transition fadeBlack 0.5` (or `fadeWhite 0.6` for flashbacks/dream cuts) + `place set "..."` + `telop "..."`.
  - Keep 2–3 actors well-spaced (`left` + `right`, or `farLeft` + `center` + `farRight`; `scale=1.05` reads cleanly in 16:9).
  - Use `stage move` / `stage enter` / `stage exit` for dynamic blocking instead of static cardboard cutouts.
  - Pair emotional lines with speaker `motion` + `facial` AND co-star `react(...)` expressions so listeners feel alive!
  - Switch BGM or `bgm stop` at turning points (using a fresh `scene` node) and punctuate beats sparingly with `cue flash`, `cue shake`, `cue wait`, or `se="..."`.
- [ ] **Verified Assets Only**: Run `--verify-assets` so zero broken BGs, missing BGMs/SEs, wrong-gender `w-`/`m-` motions, or hallucinated `face_*` names ever ship!
