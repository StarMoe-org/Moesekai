/**
 * Limits of a `moesekai-story/2` graph document and the stage geometry the story maker uses.
 * Shared by the validator, compiler, runtime VM, MoeSekai Script parser, editor inputs, and stage adapter.
 */
import type { StorySlot } from "../../types/storyMaker.ts";

export const STORY_LIMITS = {
    nodes: 200,
    edges: 600,
    beatsPerScene: 200,
    totalBeats: 2000,
    cast: 8,
    /** Max unique actors mounted in a single SceneNode's `stageCast` slot (matches the 5 standing slots). */
    stageActors: 5,
    /** Max simultaneous off-speaker reactions attached to a single `TalkBeat`. */
    reactionsPerTalk: 4,
    variables: 32,
    varOpsPerBeat: 16,
    conditionRules: 12,
    title: 80,
    summary: 500,
    author: 40,
    castName: 40,
    varName: 32,
    nodeTitle: 60,
    endSubtitle: 160,
    ruleLabel: 40,
    body: 500,
    telop: 120,
    place: 80,
    speakerName: 40,
    /** Max length of audio asset paths (bare IDs, `<pack>/<file>`, or `mysekai/sound/bgm/...`). */
    audioPath: 128,
    choiceOptions: { min: 2, max: 4 },
    choiceText: 80,
    /** Seconds, for transitions, moves, flashes, shakes and waits. */
    duration: { min: 0, max: 10 },
    volume: { min: 0, max: 1 },
    /** Bounded finite numeric range for low-code counter variables and expressions. */
    varNumberMin: -1_000_000,
    varNumberMax: 1_000_000,
    /** Character scale multiplier (`stageCast` / `stageAction`, default 1.0). */
    scaleMin: 0.5,
    scaleMax: 2.0,
    /** Character vertical offset in stage world units (`stageCast` / `stageAction`, default 0). */
    yMin: -0.6,
    yMax: 0.6,
    /** Voice trim bounds in seconds (`0 <= start <= 600`, `0 < end <= 600`, `end - start >= 0.05`). */
    voiceTrimMax: 600,
    voiceTrimMinSpan: 0.05,
    /** Flow graph node canvas coordinate bounds. */
    coordMin: -20000,
    coordMax: 20000,
    /** Alias retained for layout helpers. */
    flowCoordMin: -20000,
    flowCoordMax: 20000,
    /** Maximum IR instructions executed in a single runtime advance before declaring a zero-wait loop. */
    maxRuntimeSteps: 4000,
} as const;

/** Ids of documents, nodes, edges, beats, cast members, variables, choice options and condition rules. */
export const STORY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/** Game asset names (single-segment ids: backgrounds, voice scenario / voice ids). */
export const STORY_ASSET_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/**
 * Audio asset paths (BGM and SE): bare ids (`bgm00020`), pack paths (`se_pack00001_b/se00001_b`,
 * `bgm00016_01/bgm00016_01_1`), or full asset paths (`mysekai/sound/bgm/music0001/music0001`).
 */
export const STORY_AUDIO_PATH_PATTERN = /^(?=.{1,128}$)[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+){0,4}$/;
/** Model ids of `models.json`. */
export const STORY_MODEL_PATTERN = /^[a-z0-9_]{1,64}$/;
/** Motion and facial names of a model's motion bundle (internal spaces allowed for real game clips like `face_ worry_01`). */
export const STORY_MOTION_PATTERN = /^[A-Za-z0-9_.-](?:[A-Za-z0-9_. -]{0,62}[A-Za-z0-9_.-])?$/;

/** Template placeholder syntax `{{varId}}` or `{{varName}}` supported inside story text. */
export const STORY_TEMPLATE_VAR_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Stage x of each slot, as a fraction of half the width of a 16:9 frame (`sse-core/src/consts.rs`:
 * `SIDE_X_DEFAULT = 350 / 960 ≈ 0.365` for 2-character framing, `SIDE_X_THREE = 550 / 960`+ for wide).
 */
export const SLOT_X: Record<StorySlot, number> = {
    farLeft: -0.62,
    left: -0.365,
    center: 0,
    right: 0.365,
    farRight: 0.62,
};

/** Seconds of default fades of transitions, stage enters and exits. */
export const STORY_FADE_SECONDS = 0.4;

/** Verified Miyamasuzaka Girls Academy daytime classroom scene background (available on all 5 servers). */
export const DEFAULT_STORY_BACKGROUND = "bg_a000401";

/** Verified everyday classroom BGM (paired with bg_a000401 in Leo/need unit story Ep. 9; HTTP 200 on all 5 servers). */
export const DEFAULT_STORY_BGM = "bgm00020";

/** Verified scenario sound effect in pack `se_pack00001_b` (HTTP 200 on all 5 servers). */
export const DEFAULT_STORY_SE = "se_pack00001_b/se00001_b";
