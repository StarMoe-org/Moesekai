/**
 * What the stage shows after a run of steps: the pure reducer behind seeking. The editor shows
 * the state at the selected step (`stageStateAt`), the player the state along the path it played
 * (`stageStateAlong`, which follows jumps and choices). Transient cues (a flash, a shake, an SE,
 * the fade of a transition) are not state: the player plays them as it passes their steps.
 */
import type { StoryDocument, StoryEffectColor, StorySlot, StoryStep } from "../../types/storyMaker.ts";
import { SLOT_X } from "./limits.ts";

export interface StoryActorState {
    cast: string;
    slot: StorySlot;
    /** Stage x (SLOT_X). */
    x: number;
    mirror: boolean;
    /** null: the model's default. */
    motion: string | null;
    facial: string | null;
}

export interface StoryStageState {
    background: string | null;
    /** Persistent top-left location banner (`PlaceInfo`), or null when hidden. */
    place: string | null;
    /** On stage, in the order they appeared (later on top). */
    actors: StoryActorState[];
    bgm: { name: string | null; volume: number };
    dialogue: { stepId: string; cast: string | null; speaker: string; body: string } | null;
    narration: { stepId: string; body: string } | null;
    telop: { stepId: string; body: string } | null;
    /** A screen faded out (and not yet back in). */
    screen: { color: StoryEffectColor; covered: boolean };
    /** The cast member whose line is showing with lip sync, if any. */
    speaking: string | null;
}

export const INITIAL_STAGE_STATE: StoryStageState = {
    background: null,
    place: null,
    actors: [],
    bgm: { name: null, volume: 1 },
    dialogue: null,
    narration: null,
    telop: null,
    screen: { color: "black", covered: false },
    speaking: null,
};

function withActor(state: StoryStageState, cast: string | undefined, change: (actor: StoryActorState) => StoryActorState): StoryActorState[] {
    if (!cast) return state.actors;
    return state.actors.map(actor => (actor.cast === cast ? change(actor) : actor));
}

/** The state after `step`. */
export function applyStep(state: StoryStageState, step: StoryStep, doc: StoryDocument): StoryStageState {
    // A caption and a line's lip sync last until the next step.
    const next: StoryStageState = { ...state, telop: null, speaking: null };
    switch (step.op) {
        case "background":
            return { ...next, background: step.name, dialogue: null, narration: null };
        case "place":
            return { ...next, place: step.text.trim() ? step.text : null };
        case "appear": {
            const actor: StoryActorState = {
                cast: step.cast,
                slot: step.slot,
                x: SLOT_X[step.slot],
                mirror: step.mirror ?? false,
                motion: step.motion ?? null,
                facial: step.facial ?? null,
            };
            return { ...next, actors: [...state.actors.filter(item => item.cast !== step.cast), actor] };
        }
        case "move":
            return { ...next, actors: withActor(state, step.cast, actor => ({ ...actor, slot: step.slot, x: SLOT_X[step.slot] })) };
        case "hide":
            return { ...next, actors: state.actors.filter(actor => actor.cast !== step.cast) };
        case "pose":
            return {
                ...next,
                actors: withActor(state, step.cast, actor => ({
                    ...actor,
                    motion: step.motion ?? actor.motion,
                    facial: step.facial ?? actor.facial,
                })),
            };
        case "talk": {
            const member = step.cast ? doc.cast.find(item => item.key === step.cast) : undefined;
            const onStage = !!step.cast && state.actors.some(actor => actor.cast === step.cast);
            return {
                ...next,
                narration: null,
                dialogue: { stepId: step.id, cast: step.cast ?? null, speaker: step.name || member?.name || "", body: step.body },
                actors: withActor(state, step.cast, actor => ({
                    ...actor,
                    motion: step.motion ?? actor.motion,
                    facial: step.facial ?? actor.facial,
                })),
                speaking: step.lipSync && onStage ? step.cast ?? null : null,
            };
        }
        case "narration":
            return { ...next, dialogue: null, narration: { stepId: step.id, body: step.body } };
        case "telop":
            return { ...next, dialogue: null, narration: null, telop: { stepId: step.id, body: step.body } };
        case "effect":
            if (step.effect === "fadeOut") return { ...next, screen: { color: step.color ?? "black", covered: true } };
            if (step.effect === "fadeIn") return { ...next, screen: { color: step.color ?? state.screen.color, covered: false } };
            return next;
        case "bgm":
            if (step.action === "play") return { ...next, bgm: { name: step.name ?? null, volume: step.volume ?? 1 } };
            if (step.action === "stop") return { ...next, bgm: { ...state.bgm, name: null } };
            return { ...next, bgm: { ...state.bgm, volume: step.volume ?? state.bgm.volume } };
        case "se":
        case "choice":
        case "label":
        case "jump":
            return next;
    }
    return next;
}

/** The state after the steps `0..index` in document order (-1: before the first). */
export function stageStateAt(doc: StoryDocument, index: number): StoryStageState {
    let state = INITIAL_STAGE_STATE;
    const last = Math.min(index, doc.steps.length - 1);
    for (let i = 0; i <= last; i++) state = applyStep(state, doc.steps[i], doc);
    return state;
}

/** The state after the steps of `path` (indices, in the order they were played). */
export function stageStateAlong(doc: StoryDocument, path: readonly number[]): StoryStageState {
    let state = INITIAL_STAGE_STATE;
    for (const index of path) {
        const step = doc.steps[index];
        if (step) state = applyStep(state, step, doc);
    }
    return state;
}
