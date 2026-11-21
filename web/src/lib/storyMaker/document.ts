/**
 * Building and editing `moesekai-story/1` documents: a new document, new ids, a new step of each
 * op with sensible defaults, and the pure list edits the editor makes (insert, move, duplicate,
 * remove, patch). Every edit returns a new document.
 */
import {
    STORY_FORMAT,
    type StoryCastMember, type StoryDocument, type StoryOpName, type StoryRegion, type StoryStep, type StoryStepOf,
} from "../../types/storyMaker.ts";
import { STORY_LIMITS } from "./limits.ts";

/** A short random id (`[a-z0-9]`), unique among `taken`. */
export function newStoryId(taken: Iterable<string> = [], length = 8): string {
    const used = new Set(taken);
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (;;) {
        let id = "";
        const bytes = new Uint8Array(length);
        globalThis.crypto.getRandomValues(bytes);
        for (const byte of bytes) id += alphabet[byte % alphabet.length];
        if (!used.has(id)) return id;
    }
}

export function createStoryDocument(region: StoryRegion, title = ""): StoryDocument {
    return { format: STORY_FORMAT, region, title, summary: "", author: "", cast: [], steps: [] };
}

/** A new step of `op`, with defaults that make sense right after `context` (the selected step's cast). */
export function createStep<T extends StoryOpName>(op: T, doc: StoryDocument, castHint?: string): StoryStepOf<T> {
    const id = newStoryId(doc.steps.map(step => step.id));
    const cast = castHint && doc.cast.some(member => member.key === castHint) ? castHint : doc.cast[0]?.key;
    const label = doc.steps.find(step => step.op === "label")?.id ?? "";
    const make = (): StoryStep => {
        switch (op) {
            case "background": return { id, op, name: null, transition: "fade" };
            case "place": return { id, op, text: "" };
            case "appear": return { id, op, cast: cast ?? "", slot: "center", fade: true };
            case "move": return { id, op, cast: cast ?? "", slot: "left", duration: 0.5 };
            case "hide": return { id, op, cast: cast ?? "", fade: true };
            case "pose": return { id, op, cast: cast ?? "" };
            case "talk": return cast ? { id, op, cast, body: "", lipSync: true } : { id, op, name: "", body: "", lipSync: true };
            case "narration": return { id, op, body: "" };
            case "telop": return { id, op, body: "" };
            case "effect": return { id, op, effect: "fadeIn", color: "black", duration: 0.5 };
            case "bgm": return { id, op, action: "play", name: "", volume: 1 };
            case "se": return { id, op, name: "" };
            case "choice": {
                const first = newStoryId([]);
                return {
                    id, op, options: [
                        { id: first, text: "", target: label },
                        { id: newStoryId([first]), text: "", target: label },
                    ],
                };
            }
            case "label": return { id, op, name: "" };
            case "jump": return { id, op, target: label };
        }
        throw new Error(`unknown op ${String(op)}`);
    };
    return make() as StoryStepOf<T>;
}

/** Inserts `step` after `index` (-1: at the start). */
export function insertStep(doc: StoryDocument, index: number, step: StoryStep): StoryDocument {
    if (doc.steps.length >= STORY_LIMITS.steps) return doc;
    const steps = [...doc.steps];
    steps.splice(Math.max(0, Math.min(index + 1, steps.length)), 0, step);
    return { ...doc, steps };
}

/** Moves the step at `from` to `to`. */
export function moveStep(doc: StoryDocument, from: number, to: number): StoryDocument {
    if (from === to || from < 0 || from >= doc.steps.length || to < 0 || to >= doc.steps.length) return doc;
    const steps = [...doc.steps];
    const [step] = steps.splice(from, 1);
    steps.splice(to, 0, step);
    return { ...doc, steps };
}

/** Duplicates the step at `index` (with a new id) right after it. */
export function duplicateStep(doc: StoryDocument, index: number): StoryDocument {
    const step = doc.steps[index];
    if (!step) return doc;
    const copy = structuredClone(step);
    copy.id = newStoryId(doc.steps.map(item => item.id));
    if (copy.op === "choice") {
        const taken: string[] = [];
        for (const option of copy.options) {
            option.id = newStoryId(taken);
            taken.push(option.id);
        }
    }
    return insertStep(doc, index, copy);
}

export function removeStep(doc: StoryDocument, index: number): StoryDocument {
    if (index < 0 || index >= doc.steps.length) return doc;
    return { ...doc, steps: doc.steps.filter((_, i) => i !== index) };
}

/** Replaces the step with `id`. */
export function replaceStep(doc: StoryDocument, id: string, next: StoryStep): StoryDocument {
    return { ...doc, steps: doc.steps.map(step => (step.id === id ? next : step)) };
}

/** A new cast key for `doc`. */
export function newCastKey(doc: StoryDocument): string {
    return newStoryId(doc.cast.map(member => member.key), 4);
}

export function addCastMember(doc: StoryDocument, member: Omit<StoryCastMember, "key">): StoryDocument {
    if (doc.cast.length >= STORY_LIMITS.cast) return doc;
    return { ...doc, cast: [...doc.cast, { key: newCastKey(doc), ...member }] };
}

export function updateCastMember(doc: StoryDocument, key: string, patch: Partial<Omit<StoryCastMember, "key">>): StoryDocument {
    return { ...doc, cast: doc.cast.map(member => (member.key === key ? { ...member, ...patch } : member)) };
}

/** Removes a cast member; the steps that used it are kept (the validator then points at them). */
export function removeCastMember(doc: StoryDocument, key: string): StoryDocument {
    return { ...doc, cast: doc.cast.filter(member => member.key !== key) };
}

/** How many steps refer to the cast member `key`. */
export function castUsage(doc: StoryDocument, key: string): number {
    return doc.steps.filter(step => "cast" in step && step.cast === key).length;
}

/** The name shown for a talk step's speaker. */
export function speakerName(doc: StoryDocument, step: StoryStepOf<"talk">): string {
    if (step.name) return step.name;
    return doc.cast.find(member => member.key === step.cast)?.name ?? "";
}

/** The label steps of a document, for pickers. */
export function storyLabels(doc: StoryDocument): StoryStepOf<"label">[] {
    return doc.steps.filter((step): step is StoryStepOf<"label"> => step.op === "label");
}

/** A file name for an exported document. */
export function storyFileName(doc: StoryDocument): string {
    const printable = [...doc.title].filter(char => char.charCodeAt(0) >= 32).join("");
    const base = printable.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-").slice(0, 60);
    return `${base || "story"}.moesekai-story.json`;
}

/** The JSON of an exported document. */
export function serializeStory(doc: StoryDocument): string {
    return `${JSON.stringify(doc, null, 2)}\n`;
}
