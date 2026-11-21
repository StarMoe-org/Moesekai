/**
 * Limits of a `moesekai-story/1` document and the stage geometry the story maker uses. Shared by
 * the validator, the editor's inputs (maxLength) and the stage adapter.
 */
import type { StorySlot } from "../../types/storyMaker.ts";

export const STORY_LIMITS = {
    steps: 2000,
    cast: 8,
    title: 80,
    summary: 500,
    author: 40,
    castName: 40,
    body: 500,
    telop: 120,
    place: 80,
    labelName: 40,
    speakerName: 40,
    choiceOptions: { min: 2, max: 4 },
    choiceText: 80,
    /** Seconds, for moves and effects. */
    duration: { min: 0, max: 10 },
    /** Character scale multiplier (`appear` / `move`, default 1.0). */
    scaleMin: 0.5,
    scaleMax: 2.0,
    /** Character vertical offset in stage world units (`appear` / `move`, default 0). */
    yMin: -0.6,
    yMax: 0.6,
} as const;

/** Ids of steps, cast members and choice options. */
export const STORY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/** Game asset names (backgrounds, BGM, SE, voice scenario / voice ids). */
export const STORY_ASSET_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Model ids of `models.json`. */
export const STORY_MODEL_PATTERN = /^[a-z0-9_]{1,64}$/;
/** Motion and facial names of a model's motion bundle. */
export const STORY_MOTION_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

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

/** Seconds of the default fades of appear / hide / background transitions. */
export const STORY_FADE_SECONDS = 0.4;

/** Verified Miyamasuzaka Girls Academy daytime classroom scene background (available on all 5 servers). */
export const DEFAULT_STORY_BACKGROUND = "bg_a000401";

/** Verified everyday classroom BGM (paired with bg_a000401 in Leo/need unit story Ep. 9; HTTP 200 on all 5 servers). */
export const DEFAULT_STORY_BGM = "bgm00020";
