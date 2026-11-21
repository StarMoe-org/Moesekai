/**
 * The playback planner: which steps run between two taps. A run starts at a step and goes on
 * through the steps that need no reader (backgrounds, actors, effects, sound, labels), following
 * jumps, until it reaches one that waits for the reader (a line, a narration, a caption, a choice)
 * or the end. A story that loops without ever waiting is cut off.
 */
import type { StoryDocument, StoryOpName } from "../../types/storyMaker.ts";

/** Steps the player stops at until the reader advances (or chooses). */
export const BLOCKING_OPS: ReadonlySet<StoryOpName> = new Set<StoryOpName>(["talk", "narration", "telop", "choice"]);

export interface PlaybackRun {
    /** The indices run, in order (the blocking step last, when the run stopped at one). */
    path: number[];
    /** At a step that waits, at the end of the story, or cut off in a loop without one. */
    stop: "block" | "end" | "loop";
    /** The blocking step's index (stop `block`), else -1. */
    at: number;
}

/** Each label step's index, by its id. */
export function labelIndices(doc: StoryDocument): Map<string, number> {
    const labels = new Map<string, number>();
    doc.steps.forEach((step, index) => {
        if (step.op === "label") labels.set(step.id, index);
    });
    return labels;
}

/** The run starting at `start` (inclusive). */
export function runFrom(doc: StoryDocument, start: number, labels = labelIndices(doc)): PlaybackRun {
    const path: number[] = [];
    // Every step at most a few times over: anything longer is a loop with no step that waits.
    const limit = doc.steps.length * 4 + 16;
    let index = start;
    while (index >= 0 && index < doc.steps.length) {
        if (path.length >= limit) return { path, stop: "loop", at: -1 };
        const step = doc.steps[index];
        path.push(index);
        if (BLOCKING_OPS.has(step.op)) return { path, stop: "block", at: index };
        if (step.op === "jump") {
            const target = labels.get(step.target);
            if (target === undefined) return { path, stop: "end", at: -1 };
            index = target;
            continue;
        }
        index += 1;
    }
    return { path, stop: "end", at: -1 };
}

/** Where a choice's option leads: its label's index, or null. */
export function choiceTarget(doc: StoryDocument, choiceIndex: number, optionId: string, labels = labelIndices(doc)): number | null {
    const step = doc.steps[choiceIndex];
    if (step?.op !== "choice") return null;
    const option = step.options.find(item => item.id === optionId);
    if (!option) return null;
    return labels.get(option.target) ?? null;
}

/** The run after the reader leaves the blocking step `at` (by tapping, or by choosing `optionId`). */
export function advance(doc: StoryDocument, at: number, optionId?: string, labels = labelIndices(doc)): PlaybackRun {
    const step = doc.steps[at];
    if (step?.op === "choice") {
        if (optionId === undefined) return { path: [], stop: "block", at };
        const target = choiceTarget(doc, at, optionId, labels);
        if (target === null) return { path: [], stop: "end", at: -1 };
        return runFrom(doc, target, labels);
    }
    return runFrom(doc, at + 1, labels);
}
