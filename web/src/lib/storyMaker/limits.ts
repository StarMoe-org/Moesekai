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
 * Base stage x of each slot, as a fraction of half the width of a 16:9 frame (`-1` left edge,
 * `+1` right edge; `sse-core/src/consts.rs`: `SIDE_X_DEFAULT = 350 / 960 ≈ 0.365` for 2-character
 * framing, `SIDE_X_THREE = 550 / 960 ≈ 0.573` for 3-character framing).
 */
export const SLOT_X: Record<StorySlot, number> = {
    farLeft: -0.75,
    left: -0.365,
    center: 0,
    right: 0.365,
    farRight: 0.75,
};

/** Safe horizontal stage geometry constants (fractions of half a 16:9 frame width). */
export const STAGE_SAFE_BOUNDS = {
    /** Approximate head/shoulder safe half-width of one Live2D character at `scale = 1.0`. */
    actorHalfWidth: 0.195,
    /** Outer horizontal center bound by actor count (`n <= 3`, `n === 4`, `n >= 5`). */
    maxEdge3: 0.75,
    maxEdge4: 0.75,
    maxEdge5: 0.8,
    /** Canonical 3-actor trio (`left`, `center`, `right`): `SIDE_X_THREE = 550 / 960`. */
    trioX: [-0.573, 0, 0.573] as const,
    /** Canonical 4-actor quartet (`farLeft`, `left`, `right`, `farRight`): uniform 0.50 spacing. */
    quartetX: [-0.75, -0.25, 0.25, 0.75] as const,
    /** Canonical 5-actor quintet (all 5 slots): uniform 0.40 spacing. */
    quintetX: [-0.8, -0.4, 0, 0.4, 0.8] as const,
} as const;

const SLOT_ORDER: Record<StorySlot, number> = {
    farLeft: 0,
    left: 1,
    center: 2,
    right: 3,
    farRight: 4,
};

function roundStageX(value: number): number {
    return Math.round(value * 1000) / 1000;
}

/**
 * Computes balanced, non-overlapping stage X coordinates for mounted actors while preserving
 * left-to-right semantic slot order, array draw order, and authentic Project SEKAI framing:
 * - 1 actor: exact `SLOT_X[slot]`
 * - 2 actors at `left` + `right`: authentic `±0.365` (`gap = 0.73`)
 * - 3 actors at `left` + `center` + `right`: authentic `±0.573` & `0` (`SIDE_X_THREE`)
 * - 4 actors at `farLeft` + `left` + `right` + `farRight`: uniform `-0.75, -0.25, +0.25, +0.75` (`gap = 0.50`)
 * - 5 actors across all 5 slots: uniform `-0.80, -0.40, 0, +0.40, +0.80` (`gap = 0.40`)
 * - Any other multi-actor or duplicate-slot formation: L2-optimal 1D PAV projection enforcing
 *   safe center-to-center spacing within `[-maxEdge, +maxEdge]`.
 */
export function layoutStageActors<T extends { slot: StorySlot; x: number; scale?: number }>(
    actors: readonly T[],
): T[] {
    const n = actors.length;
    if (n === 0) return [];
    if (n === 1) {
        const single = actors[0];
        const x = SLOT_X[single.slot];
        return single.x === x ? [...actors] : [{ ...single, x }];
    }

    const ordered = actors
        .map((actor, index) => ({ actor, index, slotRank: SLOT_ORDER[actor.slot] }))
        .sort((a, b) => a.slotRank - b.slotRank || a.index - b.index);

    const slotsKey = ordered.map(item => item.actor.slot).join(",");
    let xs: number[] | null = null;

    if (slotsKey === "left,center,right") {
        xs = [...STAGE_SAFE_BOUNDS.trioX];
    } else if (slotsKey === "farLeft,left,right,farRight") {
        xs = [...STAGE_SAFE_BOUNDS.quartetX];
    } else if (slotsKey === "farLeft,left,center,right,farRight") {
        xs = [...STAGE_SAFE_BOUNDS.quintetX];
    }

    if (!xs) {
        const maxEdge = n >= 5
            ? STAGE_SAFE_BOUNDS.maxEdge5
            : n === 4
                ? STAGE_SAFE_BOUNDS.maxEdge4
                : STAGE_SAFE_BOUNDS.maxEdge3;
        const avgScale = ordered.reduce((sum, item) => sum + (item.actor.scale ?? 1), 0) / n;
        const desiredGap = (n >= 5 ? 0.4 : 0.48) * Math.min(1.15, Math.max(0.85, avgScale));
        const gap = Math.min(desiredGap, (2 * maxEdge) / (n - 1));
        const uMin = -maxEdge;
        const uMax = maxEdge - (n - 1) * gap;

        const blocks: Array<{ start: number; count: number; sum: number }> = [];
        for (let i = 0; i < n; i += 1) {
            const z = SLOT_X[ordered[i].actor.slot] - i * gap;
            blocks.push({ start: i, count: 1, sum: z });
            while (blocks.length >= 2) {
                const last = blocks[blocks.length - 1];
                const prev = blocks[blocks.length - 2];
                if (prev.sum / prev.count <= last.sum / last.count) break;
                prev.count += last.count;
                prev.sum += last.sum;
                blocks.pop();
            }
        }
        xs = new Array<number>(n);
        for (const block of blocks) {
            const u = Math.min(uMax, Math.max(uMin, block.sum / block.count));
            for (let k = 0; k < block.count; k += 1) {
                const idx = block.start + k;
                xs[idx] = roundStageX(u + idx * gap);
            }
        }
    }

    const xByOrigIndex = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
        xByOrigIndex[ordered[i].index] = xs[i];
    }
    return actors.map((actor, index) => {
        const nextX = xByOrigIndex[index];
        return actor.x === nextX ? actor : { ...actor, x: nextX };
    });
}

export interface StageSlotCollision {
    slot: StorySlot;
    actors: string[];
}

export interface StageOverlapWarning {
    leftActor: string;
    rightActor: string;
    gap: number;
    minGap: number;
}

export interface StageOverlapAudit {
    duplicateSlots: StageSlotCollision[];
    overlaps: StageOverlapWarning[];
}

/**
 * Checks a set of mounted actors for:
 * 1. `duplicateSlots`: two or more actors explicitly assigned to the same semantic `slot`.
 * 2. `overlaps`: adjacent actors whose resolved center-to-center distance `|x_b - x_a|` is smaller
 *    than their combined safe visual envelope (`actorHalfWidth * (scale_a + scale_b)`), e.g., when
 *    too many characters are scaled up on screen simultaneously.
 */
export function detectStageActorOverlaps(
    actors: readonly { cast: string; slot: StorySlot; x: number; scale?: number }[],
): StageOverlapAudit {
    const duplicateSlots: StageSlotCollision[] = [];
    const overlaps: StageOverlapWarning[] = [];
    if (actors.length < 2) return { duplicateSlots, overlaps };

    const bySlot = new Map<StorySlot, string[]>();
    for (const actor of actors) {
        const list = bySlot.get(actor.slot);
        if (list) list.push(actor.cast);
        else bySlot.set(actor.slot, [actor.cast]);
    }
    for (const [slot, list] of bySlot) {
        if (list.length >= 2) {
            duplicateSlots.push({ slot, actors: list });
        }
    }

    const resolved = layoutStageActors(actors);
    const byX = [...resolved].sort((a, b) => a.x - b.x || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
    for (let i = 0; i < byX.length - 1; i += 1) {
        const left = byX[i];
        const right = byX[i + 1];
        const leftScale = left.scale ?? 1;
        const rightScale = right.scale ?? 1;
        const gap = roundStageX(right.x - left.x);
        const minGap = roundStageX(STAGE_SAFE_BOUNDS.actorHalfWidth * (leftScale + rightScale));
        if (gap + 1e-4 < minGap) {
            overlaps.push({
                leftActor: left.cast,
                rightActor: right.cast,
                gap,
                minGap,
            });
        }
    }

    return { duplicateSlots, overlaps };
}

/** Seconds of default fades of transitions, stage enters and exits. */
export const STORY_FADE_SECONDS = 0.4;

/** Verified Miyamasuzaka Girls Academy daytime classroom scene background (available on all 5 servers). */
export const DEFAULT_STORY_BACKGROUND = "bg_a000401";

/** Verified everyday classroom BGM (paired with bg_a000401 in Leo/need unit story Ep. 9; HTTP 200 on all 5 servers). */
export const DEFAULT_STORY_BGM = "bgm00020";

/** Verified scenario sound effect in pack `se_pack00001_b` (HTTP 200 on all 5 servers). */
export const DEFAULT_STORY_SE = "se_pack00001_b/se00001_b";
