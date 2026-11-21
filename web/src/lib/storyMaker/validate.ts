/**
 * The strict validator of `moesekai-story/1` documents. Everything a document holds is checked
 * against a whitelist: known ops only, every string capped, ids unique and well formed, cast keys
 * and label targets resolved, asset names restricted to the game's naming. What it returns is a
 * fresh document built from the checked fields only (unknown fields are dropped), so an imported
 * file can never carry anything else into the editor or the player.
 */
import {
    BACKGROUND_TRANSITIONS, BGM_ACTIONS, EFFECT_COLORS, STORY_EFFECTS, STORY_FORMAT, STORY_OPS, STORY_REGIONS,
    STORY_SLOTS, VOICE_KINDS,
    type StoryCastMember, type StoryChoiceOption, type StoryDocument, type StoryIssue, type StoryIssueCode,
    type StoryRegion, type StoryStep, type StoryVoiceRef,
} from "../../types/storyMaker.ts";
import {
    STORY_ASSET_PATTERN, STORY_ID_PATTERN, STORY_LIMITS, STORY_MODEL_PATTERN, STORY_MOTION_PATTERN,
} from "./limits.ts";

export type StoryValidation =
    | { ok: true; doc: StoryDocument }
    | { ok: false; issues: StoryIssue[] };

/** At most this many issues are reported (a broken file would otherwise list thousands). */
const MAX_ISSUES = 50;

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Checker {
    issues: StoryIssue[] = [];

    add(code: StoryIssueCode, path: string, params?: Record<string, string | number>) {
        if (this.issues.length < MAX_ISSUES) this.issues.push(params ? { code, path, params } : { code, path });
    }

    string(raw: Raw, key: string, path: string, max: number, options: { required?: boolean; allowEmpty?: boolean } = {}): string | undefined {
        const { required = true, allowEmpty = true } = options;
        const value = raw[key];
        const at = `${path}.${key}`;
        if (value === undefined || value === null) {
            if (required) this.add("fieldMissing", at);
            return undefined;
        }
        if (typeof value !== "string") {
            this.add("fieldType", at, { expected: "string" });
            return undefined;
        }
        if (value.length > max) {
            this.add("tooLong", at, { max });
            return undefined;
        }
        if (!allowEmpty && value.trim() === "") {
            this.add("fieldMissing", at);
            return undefined;
        }
        return value;
    }

    pattern(raw: Raw, key: string, path: string, pattern: RegExp, code: StoryIssueCode, required = true): string | undefined {
        const value = raw[key];
        const at = `${path}.${key}`;
        if (value === undefined || value === null) {
            if (required) this.add("fieldMissing", at);
            return undefined;
        }
        if (typeof value !== "string" || !pattern.test(value)) {
            this.add(code, at);
            return undefined;
        }
        return value;
    }

    oneOf<T extends string>(raw: Raw, key: string, path: string, values: readonly T[], fallback?: T): T | undefined {
        const value = raw[key];
        const at = `${path}.${key}`;
        if (value === undefined && fallback !== undefined) return fallback;
        if (typeof value !== "string" || !values.includes(value as T)) {
            this.add(value === undefined ? "fieldMissing" : "enumInvalid", at, { allowed: values.join(", ") });
            return undefined;
        }
        return value as T;
    }

    number(raw: Raw, key: string, path: string, min: number, max: number, fallback?: number): number | undefined {
        const value = raw[key];
        const at = `${path}.${key}`;
        if (value === undefined && fallback !== undefined) return fallback;
        if (typeof value !== "number" || !Number.isFinite(value)) {
            this.add(value === undefined ? "fieldMissing" : "fieldType", at, { expected: "number" });
            return undefined;
        }
        if (value < min || value > max) {
            this.add("numberRange", at, { min, max });
            return undefined;
        }
        return value;
    }

    boolean(raw: Raw, key: string, path: string, fallback: boolean): boolean {
        const value = raw[key];
        if (value === undefined) return fallback;
        if (typeof value !== "boolean") {
            this.add("fieldType", `${path}.${key}`, { expected: "boolean" });
            return fallback;
        }
        return value;
    }

    motion(raw: Raw, key: string, path: string): string | undefined {
        const value = raw[key];
        if (value === undefined || value === null || value === "") return undefined;
        if (typeof value !== "string" || !STORY_MOTION_PATTERN.test(value)) {
            this.add("assetNameInvalid", `${path}.${key}`);
            return undefined;
        }
        return value;
    }
}

function checkCast(checker: Checker, raw: unknown): StoryCastMember[] {
    if (!Array.isArray(raw)) {
        checker.add(raw === undefined ? "fieldMissing" : "fieldType", "cast", { expected: "array" });
        return [];
    }
    if (raw.length > STORY_LIMITS.cast) {
        checker.add("tooMany", "cast", { max: STORY_LIMITS.cast });
        return [];
    }
    const seen = new Set<string>();
    const cast: StoryCastMember[] = [];
    raw.forEach((item, index) => {
        const path = `cast[${index}]`;
        if (!isObject(item)) {
            checker.add("notObject", path);
            return;
        }
        const key = checker.pattern(item, "key", path, STORY_ID_PATTERN, "idInvalid");
        const modelId = checker.pattern(item, "modelId", path, STORY_MODEL_PATTERN, "modelIdInvalid");
        const name = checker.string(item, "name", path, STORY_LIMITS.castName);
        let characterId: number | undefined;
        if (item.characterId !== undefined && item.characterId !== null) {
            const value = checker.number(item, "characterId", path, 1, 999);
            if (value !== undefined && Number.isInteger(value)) characterId = value;
            else if (value !== undefined) checker.add("fieldType", `${path}.characterId`, { expected: "integer" });
        }
        if (key !== undefined && seen.has(key)) {
            checker.add("idDuplicate", `${path}.key`, { id: key });
            return;
        }
        if (key === undefined || modelId === undefined || name === undefined) return;
        seen.add(key);
        cast.push(characterId !== undefined ? { key, modelId, name, characterId } : { key, modelId, name });
    });
    return cast;
}

function checkVoice(checker: Checker, raw: unknown, path: string): StoryVoiceRef | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (!isObject(raw)) {
        checker.add("notObject", path);
        return undefined;
    }
    const kind = checker.oneOf(raw, "kind", path, VOICE_KINDS, "story");
    const scenarioId = checker.pattern(raw, "scenarioId", path, STORY_ASSET_PATTERN, "assetNameInvalid");
    const voiceId = checker.pattern(raw, "voiceId", path, STORY_ASSET_PATTERN, "assetNameInvalid");
    if (!kind || !scenarioId || !voiceId) return undefined;
    return { kind, scenarioId, voiceId };
}

/** One step's own fields (references to cast and labels are checked afterwards). */
function checkStep(checker: Checker, raw: Raw, path: string, id: string): StoryStep | undefined {
    const op = raw.op;
    if (typeof op !== "string" || !(STORY_OPS as readonly string[]).includes(op)) {
        checker.add("opUnknown", `${path}.op`, { op: typeof op === "string" ? op.slice(0, 32) : String(op) });
        return undefined;
    }
    const before = checker.issues.length;
    const done = <T extends StoryStep>(step: T): T | undefined => (checker.issues.length === before ? step : undefined);
    const castKey = () => checker.pattern(raw, "cast", path, STORY_ID_PATTERN, "idInvalid");

    switch (op) {
        case "background": {
            let name: string | null = null;
            if (raw.name !== null && raw.name !== undefined) name = checker.pattern(raw, "name", path, STORY_ASSET_PATTERN, "assetNameInvalid") ?? null;
            const transition = checker.oneOf(raw, "transition", path, BACKGROUND_TRANSITIONS, "fade");
            return transition ? done({ id, op, name, transition }) : undefined;
        }
        case "appear": {
            const cast = castKey();
            const slot = checker.oneOf(raw, "slot", path, STORY_SLOTS, "center");
            const motion = checker.motion(raw, "motion", path);
            const facial = checker.motion(raw, "facial", path);
            const fade = checker.boolean(raw, "fade", path, true);
            const mirror = checker.boolean(raw, "mirror", path, false);
            if (!cast || !slot) return undefined;
            return done({
                id, op, cast, slot, fade,
                ...(motion ? { motion } : {}), ...(facial ? { facial } : {}), ...(mirror ? { mirror } : {}),
            });
        }
        case "move": {
            const cast = castKey();
            const slot = checker.oneOf(raw, "slot", path, STORY_SLOTS);
            const duration = checker.number(raw, "duration", path, STORY_LIMITS.duration.min, STORY_LIMITS.duration.max, 0.5);
            if (!cast || !slot || duration === undefined) return undefined;
            return done({ id, op, cast, slot, duration });
        }
        case "hide": {
            const cast = castKey();
            const fade = checker.boolean(raw, "fade", path, true);
            return cast ? done({ id, op, cast, fade }) : undefined;
        }
        case "pose": {
            const cast = castKey();
            const motion = checker.motion(raw, "motion", path);
            const facial = checker.motion(raw, "facial", path);
            if (!cast) return undefined;
            return done({ id, op, cast, ...(motion ? { motion } : {}), ...(facial ? { facial } : {}) });
        }
        case "talk": {
            const cast = raw.cast === undefined || raw.cast === null || raw.cast === "" ? undefined : castKey();
            const name = raw.name === undefined || raw.name === null || raw.name === ""
                ? undefined
                : checker.string(raw, "name", path, STORY_LIMITS.speakerName);
            const body = checker.string(raw, "body", path, STORY_LIMITS.body);
            const motion = checker.motion(raw, "motion", path);
            const facial = checker.motion(raw, "facial", path);
            const voice = checkVoice(checker, raw.voice, `${path}.voice`);
            const lipSync = checker.boolean(raw, "lipSync", path, true);
            if (raw.cast !== undefined && raw.cast !== null && raw.cast !== "" && !cast) return undefined;
            if (!cast && !name) {
                checker.add("speakerMissing", path);
                return undefined;
            }
            if (body === undefined) return undefined;
            return done({
                id, op, body, lipSync,
                ...(cast ? { cast } : {}), ...(name ? { name } : {}),
                ...(motion ? { motion } : {}), ...(facial ? { facial } : {}), ...(voice ? { voice } : {}),
            });
        }
        case "narration": {
            const body = checker.string(raw, "body", path, STORY_LIMITS.body);
            return body === undefined ? undefined : done({ id, op, body });
        }
        case "telop": {
            const body = checker.string(raw, "body", path, STORY_LIMITS.telop);
            return body === undefined ? undefined : done({ id, op, body });
        }
        case "effect": {
            const effect = checker.oneOf(raw, "effect", path, STORY_EFFECTS);
            const color = raw.color === undefined ? undefined : checker.oneOf(raw, "color", path, EFFECT_COLORS);
            const duration = checker.number(raw, "duration", path, STORY_LIMITS.duration.min, STORY_LIMITS.duration.max, 0.5);
            if (!effect || duration === undefined) return undefined;
            return done({ id, op, effect, duration, ...(color ? { color } : {}) });
        }
        case "bgm": {
            const action = checker.oneOf(raw, "action", path, BGM_ACTIONS);
            const name = action === "play" ? checker.pattern(raw, "name", path, STORY_ASSET_PATTERN, "assetNameInvalid") : undefined;
            const volume = action === "stop" || raw.volume === undefined ? undefined : checker.number(raw, "volume", path, 0, 1);
            if (!action || (action === "play" && !name) || (action === "volume" && volume === undefined)) {
                if (action === "volume" && raw.volume === undefined) checker.add("fieldMissing", `${path}.volume`);
                return undefined;
            }
            return done({ id, op, action, ...(name ? { name } : {}), ...(volume !== undefined ? { volume } : {}) });
        }
        case "se": {
            const name = checker.pattern(raw, "name", path, STORY_ASSET_PATTERN, "assetNameInvalid");
            return name ? done({ id, op, name }) : undefined;
        }
        case "choice": {
            const list = raw.options;
            if (!Array.isArray(list)) {
                checker.add(list === undefined ? "fieldMissing" : "fieldType", `${path}.options`, { expected: "array" });
                return undefined;
            }
            if (list.length < STORY_LIMITS.choiceOptions.min) {
                checker.add("tooFew", `${path}.options`, { min: STORY_LIMITS.choiceOptions.min });
                return undefined;
            }
            if (list.length > STORY_LIMITS.choiceOptions.max) {
                checker.add("tooMany", `${path}.options`, { max: STORY_LIMITS.choiceOptions.max });
                return undefined;
            }
            const seen = new Set<string>();
            const options: StoryChoiceOption[] = [];
            list.forEach((item, index) => {
                const at = `${path}.options[${index}]`;
                if (!isObject(item)) {
                    checker.add("notObject", at);
                    return;
                }
                const optionId = checker.pattern(item, "id", at, STORY_ID_PATTERN, "idInvalid");
                const text = checker.string(item, "text", at, STORY_LIMITS.choiceText);
                const target = checker.pattern(item, "target", at, STORY_ID_PATTERN, "idInvalid");
                if (optionId && seen.has(optionId)) checker.add("idDuplicate", `${at}.id`, { id: optionId });
                if (!optionId || text === undefined || !target || seen.has(optionId)) return;
                seen.add(optionId);
                options.push({ id: optionId, text, target });
            });
            return done({ id, op, options });
        }
        case "label": {
            const name = checker.string(raw, "name", path, STORY_LIMITS.labelName);
            return name === undefined ? undefined : done({ id, op, name });
        }
        case "jump": {
            const target = checker.pattern(raw, "target", path, STORY_ID_PATTERN, "idInvalid");
            return target ? done({ id, op, target }) : undefined;
        }
    }
    return undefined;
}

/** Checks the references between steps: cast keys and label targets. */
function checkReferences(checker: Checker, doc: StoryDocument) {
    const castKeys = new Set(doc.cast.map(member => member.key));
    const labels = new Set(doc.steps.filter(step => step.op === "label").map(step => step.id));
    doc.steps.forEach((step, index) => {
        const path = `steps[${index}]`;
        if ("cast" in step && step.cast !== undefined && !castKeys.has(step.cast)) {
            checker.add("castUnknown", `${path}.cast`, { key: step.cast });
        }
        if (step.op === "jump" && !labels.has(step.target)) {
            checker.add("labelUnresolved", `${path}.target`, { target: step.target });
        }
        if (step.op === "choice") {
            step.options.forEach((option, optionIndex) => {
                if (!labels.has(option.target)) {
                    checker.add("labelUnresolved", `${path}.options[${optionIndex}].target`, { target: option.target });
                }
            });
        }
    });
}

/** Validates a parsed document. */
export function validateStoryDocument(raw: unknown): StoryValidation {
    const checker = new Checker();
    if (!isObject(raw)) {
        checker.add("notObject", "$");
        return { ok: false, issues: checker.issues };
    }
    if (raw.format !== STORY_FORMAT) {
        checker.add("formatUnsupported", "format", { format: typeof raw.format === "string" ? raw.format.slice(0, 40) : String(raw.format) });
        return { ok: false, issues: checker.issues };
    }
    let region: StoryRegion | undefined;
    if (typeof raw.region !== "string" || !(STORY_REGIONS as readonly string[]).includes(raw.region)) {
        checker.add("regionInvalid", "region", { allowed: STORY_REGIONS.join(", ") });
    } else {
        region = raw.region as StoryRegion;
    }
    const title = checker.string(raw, "title", "$", STORY_LIMITS.title);
    const summary = checker.string(raw, "summary", "$", STORY_LIMITS.summary, { required: false }) ?? "";
    const author = checker.string(raw, "author", "$", STORY_LIMITS.author, { required: false }) ?? "";
    const cast = checkCast(checker, raw.cast);

    const steps: StoryStep[] = [];
    if (!Array.isArray(raw.steps)) {
        checker.add(raw.steps === undefined ? "fieldMissing" : "fieldType", "steps", { expected: "array" });
    } else if (raw.steps.length > STORY_LIMITS.steps) {
        checker.add("tooMany", "steps", { max: STORY_LIMITS.steps });
    } else {
        const ids = new Set<string>();
        raw.steps.forEach((item, index) => {
            const path = `steps[${index}]`;
            if (!isObject(item)) {
                checker.add("notObject", path);
                return;
            }
            const id = checker.pattern(item, "id", path, STORY_ID_PATTERN, "idInvalid");
            if (id === undefined) return;
            if (ids.has(id)) {
                checker.add("idDuplicate", `${path}.id`, { id });
                return;
            }
            ids.add(id);
            const step = checkStep(checker, item, path, id);
            if (step) steps.push(step);
        });
    }

    if (checker.issues.length > 0 || !region || title === undefined) {
        return { ok: false, issues: checker.issues };
    }
    const doc: StoryDocument = { format: STORY_FORMAT, region, title, summary, author, cast, steps };
    checkReferences(checker, doc);
    return checker.issues.length > 0 ? { ok: false, issues: checker.issues } : { ok: true, doc };
}

/** Parses and validates a document's JSON text. */
export function parseStoryJson(text: string): StoryValidation {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return { ok: false, issues: [{ code: "invalidJson", path: "$" }] };
    }
    return validateStoryDocument(raw);
}
