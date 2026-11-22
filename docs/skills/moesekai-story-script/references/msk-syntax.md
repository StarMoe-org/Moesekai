# MoeSekai Script (`.msk`) Complete Language Reference

This reference documents the exact grammar, lexical patterns, numeric/string limits, compiler diagnostics, and stage geometry enforced by Moesekai Story Maker (`moesekai-story/2`, `web/src/lib/storyMaker/`).

---

## 1. Lexical Rules & Hard Limits (`STORY_LIMITS`)

- **Comments**: `# ...` or `// ...` until newline.
- **Statement separators**: Newlines or optional `;`.
- **Strings**: Double-quoted `"..."`. Supported escapes: `\"`, `\\`, `\n`, `\r`, `\t`.
- **Identifiers** (`STORY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`):
  Used for document `id`, variable `id`, cast `key`, node `id`, choice option `id`, and condition rule `id`. All-digit IDs (`0482`) and hyphenated IDs (`01-ev`) are valid; `-` is part of an identifier unless followed by `>` (`->`) or `=` (`-=`).
- **Asset regexes**:
  - Single-segment asset (`bg`, voice `scenarioId` / `voiceId`): `/^[A-Za-z0-9_-]{1,64}$/`
  - Audio path (`bgm`, `se`): `/^(?=.{1,128}$)[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+){0,4}$/` (bare ID, `<pack>/<file>`, or `mysekai/sound/bgm/...`)
  - Live2D `modelId`: `/^[a-z0-9_]{1,64}$/`
  - Motion / facial clip name: `/^[A-Za-z0-9_.-](?:[A-Za-z0-9_. -]{0,62}[A-Za-z0-9_.-])?$/` (internal spaces are allowed because real game clips include names like `"face_ worry_01"`; leading/trailing spaces and slashes are forbidden).

### Structural & Value Limits

| Category | Limit |
| --- | --- |
| Graph size | Max **200 nodes**, **600 edges**, **200 beats/scene**, **2,000 total beats** |
| Cast & stage | Max **8 cast definitions**, **5 simultaneous actors** in `stageCast`, **4 `react(...)` clauses** per `talk` beat |
| Variables & branching | Max **32 variables**, **16 varOps** per `set`/option, **12 condition rules**, **2–4 options** per `choice` |
| String lengths | title `80`, summary `500`, author `40`, cast name `40`, var display name `32`, node title `60`, end subtitle `160`, rule label `40`, dialogue/narration body `500`, telop `120`, place `80`, speaker override `40`, choice text `80`, audio path `128` |
| Numeric bounds | `duration` `0..10` s, `vol`/`seVol` `0..1`, `scale` `0.5..2.0`, `y` `-0.6..0.6`, number var `-1,000,000..1,000,000`, voice trim `0 <= start <= 600`, `0 < end <= 600`, `end - start >= 0.05`, canvas `@pos(x, y)` `-20000..20000` |
| Runtime loop guard | Max **4,000** non-blocking IR instructions per advance |

---

## 2. Header Directives

```msk
@story "<title>" region=<jp|cn|tw|kr|en> [id="<docId>"] [author="<author>"] [summary="<summary>"]
@var <varId>: number = <initialNumber> ["<displayName>"]
@var <varId>: boolean = <true|false> ["<displayName>"]
@cast <castKey> "<displayName>" model="<modelId>" [char=<1..999>]
```

- `@story`: Required document header. `region` selects the game server (`jp`, `cn`, `tw`, `kr`, `en`) used to resolve Live2D models, backgrounds, BGM, SE, and default voices.
- `@var`: Declares a counter (`number`) or flag (`boolean`). Both `{{varId}}` and `{{displayName}}` can be interpolated in dialogue, narration, telop, choice text, ending title, and ending subtitle.
- `@cast`: Declares a reusable actor bound to an official Live2D `modelId`. `char=<1..26>` links the MasterCharacter ID for UI avatars and metadata.

---

## 3. Graph Nodes, `@pos(x, y)`, and Edges (`->`)

Every node accepts an optional `@pos(x, y)` flow-canvas coordinate. Nodes omitting `@pos` are automatically laid out left-to-right (`col gap = 380`, `row gap = 260`).

### `start`
```msk
start [id=<startId>] [@pos(x, y)] -> <targetNodeId>
```
- Graph entry point (`id` defaults to `start`). Cannot have incoming edges. Must wire `-> <targetNodeId>`.

### `scene`
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
- Outgoing `-> <targetNodeId>` can sit right after `}` (canonical serializer form) or as the last line inside `{ ... }`.
- Omitted stage slots default to `inherit`, and omitted `transition` defaults to `none 0.4`.
- `bgm play` defaults to `vol=0.75` if `vol=` is omitted.
- **`cast set [...]` actor slot syntax** (newline- or comma-separated; `cast set []` clears actors):
  ```msk
  cast set [
    ichika at left scale=1 y=0 motion="w-normal01-nod" facial="face_smile_01"
    saki at right scale=1
    # Intentional cheek-to-cheek huddle ("贴贴"):
    # ichika at center overlap facial="face_smile_01"
    # saki at center overlap facial="face_sparkling_01"
  ]
  ```
  Standing slots: `farLeft`, `left`, `center`, `right`, `farRight`.

### All 6 Scene Performance Beats

| Beat | Blocking? | Exact Syntax | Notes |
| --- | --- | --- | --- |
| `talk` | Yes | `talk <speakerKey> [as "<name>"] "<body>" [motion="..."] [facial="..."] [react(<castKey> [motion="..."] [facial="..."]) ...] [voice(...)] [se="..."] [seVol=0.8]`<br>or off-cast free speaker:<br>`talk "<speakerName>" "<body>" [se="..."] [seVol=0.8]` | Supports `{{var}}` in `body` and speaker name. Up to 4 `react(...)` clauses trigger simultaneously on co-stars. |
| `narration` | Yes | `narration "<body>" [se="<path>"] [seVol=<0..1>]` | Full-width narration box; supports `{{var}}`. |
| `telop` | Yes | `telop "<text>"` | Chapter / time-skip banner card; supports `{{var}}`. |
| `stage` | No | `stage enter <castKey> [at <slot>] [scale=...] [y=...] [overlap] [motion="..."] [facial="..."]`<br>`stage move <castKey> to <slot> [dur=0.5] [scale=...] [y=...] [overlap] [motion="..."] [facial="..."]`<br>`stage pose <castKey> [motion="..."] [facial="..."]`<br>`stage exit <castKey>` | `at` and `to` are interchangeable in the parser; canonical form uses `at` for `enter` and `to` for `move`. |
| `cue` | No | `cue se "<path>" [vol=<0..1>]`<br>`cue flash <black|white> [<dur>]`<br>`cue shake [<dur>]`<br>`cue wait [<dur>]` | Non-blocking stage/audio/camera cue. |
| `set` | No | `set <var> += 1, <var> -= 2, <var> = 5, <flag> = true, <flag> toggle` | Comma-separated variable mutations. |

#### Speaker ↔ Live2D Lip-Sync Linkage
- When `talk <castKey> "..."` names a `castKey` **currently mounted on stage**, the stage activates Live2D lip-sync (`stage.speaking = castKey`) and applies `motion` / `facial`.
- If `<castKey>` is **not** on stage, the dialogue still shows the `@cast` name (or `as "..."` override), and `stage.speaking` stays `null` (useful for phone calls, intercoms, voice-overs, or off-screen voices).
- `validate-msk.mjs --simulate` lists every off-stage `talk <castKey>` so you can verify none are accidental!

#### Voice Reference Syntax (`voice(...)`)
```msk
voice(<kind>:<scenarioId>:<voiceId>)
voice(<kind>:<scenarioId>:<voiceId>[<start>..<end>])
voice(<kind>:<scenarioId>:<voiceId>[<start>..])
voice(<kind>:<scenarioId>:<voiceId>[..<end>])
voice(<kind>:<scenarioId>:<voiceId>@<region>)
voice(<kind>:<scenarioId>:<voiceId>[0.25..2.5]@jp)
```
- `<kind>`: `story` | `card` | `area` | `part`.
- `@<region>` overrides the story's `region` (e.g., allowing a CN/EN story to play official JP voices).

### `choice`
```msk
choice <nodeId> ["<title>"] [@pos(x, y)] {
  [<optId>:] "<option text>" [if <var> <op> <val>] [<varOps>] -> <targetNodeId>
  [<optId>:] "<option text>" -> <targetNodeId>
}
```
- Requires **2 to 4** non-empty options. Default option IDs: `opt1`..`opt4`.
- Operators: `==`, `!=`, `>`, `>=`, `<`, `<=` (numbers); `==`, `!=` (booleans). Options whose `if` guard evaluates `false` appear locked.
- `[op1, op2]` executes variable mutations when chosen. Option text supports `{{var}}`.

### `condition`
```msk
condition <nodeId> ["<title>"] [@pos(x, y)] {
  [<ruleId>:] if <var> <op> <val> ["<label>"] -> <targetNodeId>
  else -> <targetNodeId>
}
```
- Non-blocking top-to-bottom branch evaluation; falls back to `else`. Default rule IDs: `rule1`, `rule2`, ... (`ruleId` cannot be `else`).

### `end`
```msk
end <nodeId> ["<title>"] [subtitle="<subtitle>"] [@pos(x, y)]
```
- Terminal ending card. Both `<title>` and `subtitle` support `{{var}}`. Cannot have outgoing edges.

---

## 4. Stage Framing Geometry & Intentional Overlap (`overlap` / "贴贴")

`layoutStageActors` in `limits.ts` maps occupied semantic slots onto authentic Project SEKAI 16:9 world X coordinates (`[-1, +1]` half-frame units):

| Actors on Stage | Recommended Slots | Resolved `x` Positions | Center-to-Center Gap | Safe `scale` Range |
| --- | --- | --- | --- | --- |
| **1 actor** | `center` (or any slot) | `0` (`farLeft=-0.75`, `left=-0.365`, `right=0.365`, `farRight=0.75`) | — | `0.85 – 1.30` |
| **2 actors** | `left`, `right` | `-0.365, +0.365` (`SIDE_X_DEFAULT`) | `0.73` | `0.90 – 1.25` |
| **3 actors** | `left`, `center`, `right` | `-0.573, 0, +0.573` (`SIDE_X_THREE`) | `0.573` | `0.90 – 1.15` |
| **4 actors** | `farLeft`, `left`, `right`, `farRight` | `-0.75, -0.25, +0.25, +0.75` | `0.50` | `0.90 – 1.05` (prefer `1` / omit `scale`) |
| **5 actors** | all 5 slots | `-0.80, -0.40, 0, +0.40, +0.80` | `0.40` | `0.85 – 1.00` (prefer `<= 1`) |

- **Default `scale = 1`** is exact 1:1 in-game PJSK height. Omit `scale` (or use `scale=1`) for 3–5 character scenes; reserve `scale=1.1–1.25` for dramatic 1–2 actor close-ups.
- **Safe spacing rule**: Adjacent non-overlapping actors need `gap >= 0.195 × (scale_a + scale_b)`.
- **Intentional overlap ("贴贴" / close huddle)**:
  - Accidental shared slots or overly tight spacing trigger `--strict` warnings (`stageSlotDuplicate` / `stageActorOverlap`).
  - When characters intentionally lean in, hug, whisper, or huddle cheek-to-cheek, explicitly add `overlap` on **all** huddling actors' `cast set` entries or `stage enter`/`stage move` beats (e.g. `ichika at center overlap` + `saki at center overlap`, or moving both actors with `overlap`).
  - Declared `overlap` pairs relax smoothly to a snug **`0.22` cheek-to-cheek huddle gap** (e.g. `[-0.11, +0.11]` at center — shoulders touching while keeping both faces unobstructed) and suppress overlap warnings while keeping bystanders cleanly separated!

---

## 5. Compiler Diagnostics Reference

### Blocking Errors (`program.ok === false`)

| Code | Cause | Fix |
| --- | --- | --- |
| `startMissing` / `startDisconnected` | Missing `start` node or no `-> target` | Add `start -> first_scene` |
| `castUnknown` | Undeclared `castKey` / `speakerKey` / `react(...)` / `stage` | Declare `@cast <key> "..." model="..."` |
| `speakerMissing` | `talk` has neither `speakerKey` nor non-empty speaker string | Supply cast key or `"Speaker"` string |
| `actorDuplicate` / `actorLimitExceeded` | Duplicate actor or > 5 actors in `cast set [...]` | Keep <= 5 unique actors in `cast set` |
| `variableNotFound` / `variableTypeMismatch` | Undeclared var, or `toggle` on number / `+=` or `>` on boolean | Match variable type (`number` vs `boolean`) |
| `templateVarMissing` | `{{foo}}` matches no declared variable `id` or `name` | Declare `@var foo: ...` or fix spelling |
| `edgeInvalidSource` / `edgeInvalidTarget` / `edgeDuplicatePort` | Edge out of `end`, edge into `start`/missing node, or duplicate port wire | Wire valid existing node IDs; never target `start` |
| `choiceOptionEmpty` / `tooFew` / `tooMany` | Choice has < 2 or > 4 options, or blank option text | Keep 2–4 non-empty options |
| `assetNameInvalid` / `modelIdInvalid` / `voiceTrimInvalid` | Invalid characters or trim span `< 0.05s` | Check regexes and bounds in §1 |

### Non-Blocking Warnings (All Fail `--strict`)

| Code | Cause | How to Resolve |
| --- | --- | --- |
| `mergeNodeInheritAmbiguous` | A `scene` has `inDegree >= 2` AND uses `inherit` on `bg`, `bgm`, `place`, or `cast`. | Explicitly set all 4 slots (`bg set/clear`, `bgm play/stop`, `place set/hide`, `cast set/clear`) on converging scenes, OR merge into a `condition`/`choice`/`end` node. |
| `stageSlotDuplicate` | 2+ actors share a slot without all declaring `overlap`. | Assign distinct slots, OR add `overlap` if huddling intentionally. |
| `stageActorOverlap` | Adjacent actors' resolved gap is below `0.195 × (scale_a + scale_b)` without `overlap`. | Lower `scale` to `1` / spread slots, OR add `overlap` if intentional. |
| `nodeUnreachable` | Node is unreachable from `start`. | Wire it into the flow or remove it. |
| `portUnwired` | A `scene`, `choice` option, or `condition` rule/`else` lacks `-> target`. | Wire every port to a valid target node. |
| `sceneEmptyBeats` | A `scene` has 0 beats. | Add at least one beat or merge setup into the next scene. |
| `endingMissing` | No `end` node is reachable from `start`. | Add at least one reachable `end` node. |
| `cycleDetected` | Zero-wait cycle over non-blocking nodes (`condition` / empty `scene`). | Ensure every loop passes through a blocking `talk`/`narration`/`telop` or `choice`. |
