/**
 * Strict whitelist JSON parser and compiler diagnostic bridge for `moesekai-story/2`.
 *
 * Strips all unknown fields on import, rejects prototype-pollution keys, verifies every field type
 * and limit, and runs `compileStoryGraph` so imported documents are guaranteed safe & compilable.
 */
import {
    CONDITION_OPS,
    CUE_TYPES,
    EFFECT_COLORS,
    SCENE_BEAT_KINDS,
    STAGE_ACTION_KINDS,
    STORY_I18N_SCHEMA_VERSION,
    STORY_NODE_TYPES,
    STORY_REGIONS,
    STORY_SCHEMA_VERSION,
    STORY_SLOTS,
    STORY_TRANSLATION_ORIGINS,
    STORY_VAR_TYPES,
    TRANSITION_KINDS,
    VOICE_KINDS,
    type ActorReaction,
    type BackgroundSlot,
    type BgmSlot,
    type ChoiceOption,
    type ConditionExpr,
    type ConditionRule,
    type PlaceSlot,
    type SceneActorSlot,
    type SceneBeat,
    type StageCastSlot,
    type StoryCastMember,
    type StoryCompileDiagnostic,
    type StoryDocument,
    type StoryEdge,
    type StoryIssue,
    type StoryIssueCode,
    type StoryLocaleBeatEntry,
    type StoryLocalePack,
    type StoryNode,
    type StoryNodePos,
    type StoryRegion,
    type StoryTranslationMeta,
    type StoryVariable,
    type StoryVoiceRef,
    type TransitionSlot,
    type VarOp,
} from "../../types/storyMaker.ts";
import { SUPPORTED_UI_LOCALES, isUiLocale, type UiLocale } from "../i18n/locales.ts";
import { compileStoryGraph, type CompiledStoryProgram } from "./compiler.ts";
import {
    STORY_ASSET_PATTERN,
    STORY_AUDIO_PATH_PATTERN,
    STORY_ID_PATTERN,
    STORY_LIMITS,
    STORY_MODEL_PATTERN,
    STORY_MOTION_PATTERN,
} from "./limits.ts";

export type StoryValidation =
    | { ok: true; doc: StoryDocument; program: CompiledStoryProgram }
    | { ok: false; issues: StoryIssue[]; diagnostics?: StoryCompileDiagnostic[] };

const MAX_ISSUES = 50;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Checker {
    issues: StoryIssue[] = [];

    add(code: StoryIssueCode, path: string, params?: Record<string, string | number>) {
        if (this.issues.length < MAX_ISSUES) {
            this.issues.push(params ? { code, path, params } : { code, path });
        }
    }

    string(
        raw: Raw,
        key: string,
        path: string,
        max: number,
        options: { required?: boolean } = {},
    ): string | undefined {
        const { required = true } = options;
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
        return value;
    }

    pattern(
        raw: Raw,
        key: string,
        path: string,
        pattern: RegExp,
        code: StoryIssueCode,
        required = true,
    ): string | undefined {
        const value = raw[key];
        const at = `${path}.${key}`;
        if (value === undefined || value === null || value === "") {
            if (required) this.add("fieldMissing", at);
            return undefined;
        }
        if (typeof value !== "string" || !pattern.test(value)) {
            this.add(code, at);
            return undefined;
        }
        return value;
    }

    oneOf<T extends string>(
        raw: Raw,
        key: string,
        path: string,
        values: readonly T[],
        fallback?: T,
    ): T | undefined {
        const value = raw[key];
        const at = `${path}.${key}`;
        if (value === undefined && fallback !== undefined) return fallback;
        if (typeof value !== "string" || !values.includes(value as T)) {
            this.add(value === undefined ? "fieldMissing" : "enumInvalid", at, { allowed: values.join(", ") });
            return undefined;
        }
        return value as T;
    }

    number(
        raw: Raw,
        key: string,
        path: string,
        min: number,
        max: number,
        fallback?: number,
    ): number | undefined {
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

function checkPos(checker: Checker, raw: unknown, path: string): StoryNodePos | undefined {
    if (!isObject(raw)) {
        checker.add("flowLayoutInvalid", path);
        return undefined;
    }
    const { x, y } = raw;
    if (
        typeof x !== "number" || !Number.isFinite(x)
        || x < STORY_LIMITS.coordMin || x > STORY_LIMITS.coordMax
        || typeof y !== "number" || !Number.isFinite(y)
        || y < STORY_LIMITS.coordMin || y > STORY_LIMITS.coordMax
    ) {
        checker.add("flowLayoutInvalid", path);
        return undefined;
    }
    return { x, y };
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

function checkVariables(checker: Checker, raw: unknown): StoryVariable[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
        checker.add("fieldType", "variables", { expected: "array" });
        return [];
    }
    if (raw.length > STORY_LIMITS.variables) {
        checker.add("tooMany", "variables", { max: STORY_LIMITS.variables });
        return [];
    }
    const seen = new Set<string>();
    const variables: StoryVariable[] = [];
    raw.forEach((item, idx) => {
        const path = `variables[${idx}]`;
        if (!isObject(item)) {
            checker.add("notObject", path);
            return;
        }
        const id = checker.pattern(item, "id", path, STORY_ID_PATTERN, "idInvalid");
        const name = checker.string(item, "name", path, STORY_LIMITS.varName, { required: false }) ?? id ?? "";
        const type = checker.oneOf(item, "type", path, STORY_VAR_TYPES);
        if (id && seen.has(id)) {
            checker.add("idDuplicate", `${path}.id`, { id });
            return;
        }
        if (!id || !type) return;
        if (type === "number") {
            const initial = checker.number(item, "initial", path, STORY_LIMITS.varNumberMin, STORY_LIMITS.varNumberMax);
            if (initial === undefined) return;
            seen.add(id);
            variables.push({ id, name, type: "number", initial });
        } else {
            if (typeof item.initial !== "boolean") {
                checker.add(item.initial === undefined ? "fieldMissing" : "fieldType", `${path}.initial`, { expected: "boolean" });
                return;
            }
            seen.add(id);
            variables.push({ id, name, type: "boolean", initial: item.initial });
        }
    });
    return variables;
}

function checkVarOp(checker: Checker, raw: unknown, path: string): VarOp | undefined {
    if (!isObject(raw)) {
        checker.add("notObject", path);
        return undefined;
    }
    const varId = checker.pattern(raw, "varId", path, STORY_ID_PATTERN, "idInvalid");
    const op = checker.oneOf(raw, "op", path, ["set", "add", "sub", "toggle"] as const);
    if (!varId || !op) return undefined;
    if (op === "toggle") {
        return { varId, op: "toggle" };
    }
    if (op === "add" || op === "sub") {
        const value = checker.number(raw, "value", path, STORY_LIMITS.varNumberMin, STORY_LIMITS.varNumberMax);
        return value === undefined ? undefined : { varId, op, value };
    }
    // op === "set": value can be number or boolean (compiler verifies type match against variable).
    if (typeof raw.value === "boolean") {
        return { varId, op: "set", value: raw.value };
    }
    if (typeof raw.value === "number" && Number.isFinite(raw.value)) {
        if (raw.value < STORY_LIMITS.varNumberMin || raw.value > STORY_LIMITS.varNumberMax) {
            checker.add("numberRange", `${path}.value`, { min: STORY_LIMITS.varNumberMin, max: STORY_LIMITS.varNumberMax });
            return undefined;
        }
        return { varId, op: "set", value: raw.value };
    }
    checker.add(raw.value === undefined ? "fieldMissing" : "fieldType", `${path}.value`, { expected: "number | boolean" });
    return undefined;
}

function checkConditionExpr(checker: Checker, raw: unknown, path: string): ConditionExpr | undefined {
    if (!isObject(raw)) {
        checker.add("notObject", path);
        return undefined;
    }
    const varId = checker.pattern(raw, "varId", path, STORY_ID_PATTERN, "idInvalid");
    const op = checker.oneOf(raw, "op", path, CONDITION_OPS);
    let value: number | boolean | undefined;
    if (typeof raw.value === "boolean") {
        value = raw.value;
    } else if (typeof raw.value === "number" && Number.isFinite(raw.value)) {
        if (raw.value < STORY_LIMITS.varNumberMin || raw.value > STORY_LIMITS.varNumberMax) {
            checker.add("numberRange", `${path}.value`, { min: STORY_LIMITS.varNumberMin, max: STORY_LIMITS.varNumberMax });
        } else {
            value = raw.value;
        }
    } else {
        checker.add(raw.value === undefined ? "fieldMissing" : "fieldType", `${path}.value`, { expected: "number | boolean" });
    }
    if (!varId || !op || value === undefined) return undefined;
    return { varId, op, value };
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
    let region: StoryRegion | undefined;
    let regionOk = true;
    if (raw.region !== undefined && raw.region !== null) {
        if (typeof raw.region !== "string" || !(STORY_REGIONS as readonly string[]).includes(raw.region)) {
            checker.add("regionInvalid", `${path}.region`, { allowed: STORY_REGIONS.join(", ") });
            regionOk = false;
        } else {
            region = raw.region as StoryRegion;
        }
    }
    let start: number | undefined;
    let end: number | undefined;
    let trimOk = true;
    if (raw.start !== undefined && raw.start !== null) {
        if (typeof raw.start !== "number" || !Number.isFinite(raw.start) || raw.start < 0 || raw.start > STORY_LIMITS.voiceTrimMax) {
            checker.add("voiceTrimInvalid", `${path}.start`);
            trimOk = false;
        } else {
            start = raw.start;
        }
    }
    if (raw.end !== undefined && raw.end !== null) {
        if (typeof raw.end !== "number" || !Number.isFinite(raw.end) || raw.end <= 0 || raw.end > STORY_LIMITS.voiceTrimMax) {
            checker.add("voiceTrimInvalid", `${path}.end`);
            trimOk = false;
        } else {
            end = raw.end;
        }
    }
    if (trimOk && start !== undefined && end !== undefined) {
        if (end <= start || (end - start) + 1e-9 < STORY_LIMITS.voiceTrimMinSpan) {
            checker.add("voiceTrimInvalid", path);
            trimOk = false;
        }
    }
    if (!kind || !scenarioId || !voiceId || !regionOk || !trimOk) return undefined;
    return {
        kind,
        scenarioId,
        voiceId,
        ...(region !== undefined ? { region } : {}),
        ...(start !== undefined ? { start } : {}),
        ...(end !== undefined ? { end } : {}),
    };
}

function checkBackgroundSlot(checker: Checker, raw: unknown, path: string): BackgroundSlot | undefined {
    if (!isObject(raw)) {
        checker.add(raw === undefined ? "fieldMissing" : "notObject", path);
        return undefined;
    }
    const mode = checker.oneOf(raw, "mode", path, ["inherit", "clear", "set"] as const);
    if (!mode) return undefined;
    if (mode === "set") {
        const asset = checker.pattern(raw, "asset", path, STORY_ASSET_PATTERN, "assetNameInvalid");
        return asset ? { mode: "set", asset } : undefined;
    }
    return { mode };
}

function checkBgmSlot(checker: Checker, raw: unknown, path: string): BgmSlot | undefined {
    if (!isObject(raw)) {
        checker.add(raw === undefined ? "fieldMissing" : "notObject", path);
        return undefined;
    }
    const mode = checker.oneOf(raw, "mode", path, ["inherit", "stop", "play"] as const);
    if (!mode) return undefined;
    if (mode === "play") {
        const name = checker.pattern(raw, "name", path, STORY_AUDIO_PATH_PATTERN, "assetNameInvalid");
        const volume = checker.number(raw, "volume", path, STORY_LIMITS.volume.min, STORY_LIMITS.volume.max, 0.75);
        return name && volume !== undefined ? { mode: "play", name, volume } : undefined;
    }
    return { mode };
}

function checkPlaceSlot(checker: Checker, raw: unknown, path: string): PlaceSlot | undefined {
    if (!isObject(raw)) {
        checker.add(raw === undefined ? "fieldMissing" : "notObject", path);
        return undefined;
    }
    const mode = checker.oneOf(raw, "mode", path, ["inherit", "hide", "set"] as const);
    if (!mode) return undefined;
    if (mode === "set") {
        const text = checker.string(raw, "text", path, STORY_LIMITS.place);
        return text !== undefined ? { mode: "set", text } : undefined;
    }
    return { mode };
}

function checkTransitionSlot(checker: Checker, raw: unknown, path: string): TransitionSlot | undefined {
    if (!isObject(raw)) {
        checker.add(raw === undefined ? "fieldMissing" : "notObject", path);
        return undefined;
    }
    const kind = checker.oneOf(raw, "kind", path, TRANSITION_KINDS);
    const duration = checker.number(raw, "duration", path, STORY_LIMITS.duration.min, STORY_LIMITS.duration.max, 0.4);
    return kind && duration !== undefined ? { kind, duration } : undefined;
}

function checkStageCastSlot(checker: Checker, raw: unknown, path: string): StageCastSlot | undefined {
    if (!isObject(raw)) {
        checker.add(raw === undefined ? "fieldMissing" : "notObject", path);
        return undefined;
    }
    const mode = checker.oneOf(raw, "mode", path, ["inherit", "clear", "set"] as const);
    if (!mode) return undefined;
    if (mode !== "set") return { mode };
    if (!Array.isArray(raw.actors)) {
        checker.add(raw.actors === undefined ? "fieldMissing" : "fieldType", `${path}.actors`, { expected: "array" });
        return undefined;
    }
    if (raw.actors.length > STORY_LIMITS.stageActors) {
        checker.add("actorLimitExceeded", `${path}.actors`, { max: STORY_LIMITS.stageActors });
        return undefined;
    }
    const actors: SceneActorSlot[] = [];
    raw.actors.forEach((item, idx) => {
        const aPath = `${path}.actors[${idx}]`;
        if (!isObject(item)) {
            checker.add("notObject", aPath);
            return;
        }
        const castKey = checker.pattern(item, "castKey", aPath, STORY_ID_PATTERN, "idInvalid");
        const slot = checker.oneOf(item, "slot", aPath, STORY_SLOTS);
        const scale = item.scale === undefined || item.scale === null
            ? undefined
            : checker.number(item, "scale", aPath, STORY_LIMITS.scaleMin, STORY_LIMITS.scaleMax);
        const y = item.y === undefined || item.y === null
            ? undefined
            : checker.number(item, "y", aPath, STORY_LIMITS.yMin, STORY_LIMITS.yMax);
        const motion = checker.motion(item, "motion", aPath);
        const facial = checker.motion(item, "facial", aPath);
        const allowOverlap = item.allowOverlap === undefined || item.allowOverlap === null
            ? undefined
            : typeof item.allowOverlap === "boolean"
                ? item.allowOverlap
                : (checker.add("fieldType", `${aPath}.allowOverlap`, { expected: "boolean" }), undefined);
        if (!castKey || !slot) return;
        actors.push({
            castKey,
            slot,
            ...(scale !== undefined ? { scale } : {}),
            ...(y !== undefined ? { y } : {}),
            ...(motion ? { motion } : {}),
            ...(facial ? { facial } : {}),
            ...(allowOverlap ? { allowOverlap: true } : {}),
        });
    });
    return { mode: "set", actors };
}

function checkBeat(checker: Checker, raw: unknown, path: string): SceneBeat | undefined {
    if (!isObject(raw)) {
        checker.add("notObject", path);
        return undefined;
    }
    const id = checker.pattern(raw, "id", path, STORY_ID_PATTERN, "idInvalid");
    const kind = raw.kind;
    if (typeof kind !== "string" || !(SCENE_BEAT_KINDS as readonly string[]).includes(kind)) {
        checker.add("opUnknown", `${path}.kind`, { op: typeof kind === "string" ? kind.slice(0, 32) : String(kind) });
        return undefined;
    }
    if (!id) return undefined;
    const before = checker.issues.length;
    const done = <T extends SceneBeat>(beat: T): T | undefined => (checker.issues.length === before ? beat : undefined);

    switch (kind) {
        case "talk": {
            const speakerKey = raw.speakerKey === undefined || raw.speakerKey === null || raw.speakerKey === ""
                ? undefined
                : checker.pattern(raw, "speakerKey", path, STORY_ID_PATTERN, "idInvalid");
            const speakerName = raw.speakerName === undefined || raw.speakerName === null || raw.speakerName === ""
                ? undefined
                : checker.string(raw, "speakerName", path, STORY_LIMITS.speakerName);
            const body = checker.string(raw, "body", path, STORY_LIMITS.body);
            const motion = checker.motion(raw, "motion", path);
            const facial = checker.motion(raw, "facial", path);
            const voice = checkVoice(checker, raw.voice, `${path}.voice`);
            const se = raw.se === undefined || raw.se === null || raw.se === ""
                ? undefined
                : checker.pattern(raw, "se", path, STORY_AUDIO_PATH_PATTERN, "assetNameInvalid");
            const seVolume = raw.seVolume === undefined || raw.seVolume === null
                ? undefined
                : checker.number(raw, "seVolume", path, STORY_LIMITS.volume.min, STORY_LIMITS.volume.max);

            let reactions: ActorReaction[] | undefined;
            if (raw.reactions !== undefined && raw.reactions !== null) {
                if (!Array.isArray(raw.reactions)) {
                    checker.add("fieldType", `${path}.reactions`, { expected: "array" });
                } else if (raw.reactions.length > STORY_LIMITS.reactionsPerTalk) {
                    checker.add("tooMany", `${path}.reactions`, { max: STORY_LIMITS.reactionsPerTalk });
                } else if (raw.reactions.length > 0) {
                    reactions = [];
                    raw.reactions.forEach((item, idx) => {
                        const rPath = `${path}.reactions[${idx}]`;
                        if (!isObject(item)) {
                            checker.add("notObject", rPath);
                            return;
                        }
                        const castKey = checker.pattern(item, "castKey", rPath, STORY_ID_PATTERN, "idInvalid");
                        const rMotion = checker.motion(item, "motion", rPath);
                        const rFacial = checker.motion(item, "facial", rPath);
                        if (!castKey) return;
                        reactions!.push({
                            castKey,
                            ...(rMotion ? { motion: rMotion } : {}),
                            ...(rFacial ? { facial: rFacial } : {}),
                        });
                    });
                }
            }
            if (body === undefined) return undefined;
            return done({
                id,
                kind: "talk",
                ...(speakerKey ? { speakerKey } : {}),
                ...(speakerName ? { speakerName } : {}),
                body,
                ...(motion ? { motion } : {}),
                ...(facial ? { facial } : {}),
                ...(reactions && reactions.length > 0 ? { reactions } : {}),
                ...(voice ? { voice } : {}),
                ...(se ? { se } : {}),
                ...(seVolume !== undefined ? { seVolume } : {}),
            });
        }
        case "narration": {
            const body = checker.string(raw, "body", path, STORY_LIMITS.body);
            const se = raw.se === undefined || raw.se === null || raw.se === ""
                ? undefined
                : checker.pattern(raw, "se", path, STORY_AUDIO_PATH_PATTERN, "assetNameInvalid");
            const seVolume = raw.seVolume === undefined || raw.seVolume === null
                ? undefined
                : checker.number(raw, "seVolume", path, STORY_LIMITS.volume.min, STORY_LIMITS.volume.max);
            if (body === undefined) return undefined;
            return done({
                id,
                kind: "narration",
                body,
                ...(se ? { se } : {}),
                ...(seVolume !== undefined ? { seVolume } : {}),
            });
        }
        case "telop": {
            const text = checker.string(raw, "text", path, STORY_LIMITS.telop);
            return text === undefined ? undefined : done({ id, kind: "telop", text });
        }
        case "stageAction": {
            const action = checker.oneOf(raw, "action", path, STAGE_ACTION_KINDS);
            const castKey = checker.pattern(raw, "castKey", path, STORY_ID_PATTERN, "idInvalid");
            const slot = raw.slot === undefined || raw.slot === null
                ? undefined
                : checker.oneOf(raw, "slot", path, STORY_SLOTS);
            const scale = raw.scale === undefined || raw.scale === null
                ? undefined
                : checker.number(raw, "scale", path, STORY_LIMITS.scaleMin, STORY_LIMITS.scaleMax);
            const y = raw.y === undefined || raw.y === null
                ? undefined
                : checker.number(raw, "y", path, STORY_LIMITS.yMin, STORY_LIMITS.yMax);
            const motion = checker.motion(raw, "motion", path);
            const facial = checker.motion(raw, "facial", path);
            const duration = raw.duration === undefined || raw.duration === null
                ? undefined
                : checker.number(raw, "duration", path, STORY_LIMITS.duration.min, STORY_LIMITS.duration.max);
            const allowOverlap = raw.allowOverlap === undefined || raw.allowOverlap === null
                ? undefined
                : typeof raw.allowOverlap === "boolean"
                    ? raw.allowOverlap
                    : (checker.add("fieldType", `${path}.allowOverlap`, { expected: "boolean" }), undefined);
            if (!action || !castKey) return undefined;
            return done({
                id,
                kind: "stageAction",
                action,
                castKey,
                ...(slot ? { slot } : {}),
                ...(scale !== undefined ? { scale } : {}),
                ...(y !== undefined ? { y } : {}),
                ...(motion ? { motion } : {}),
                ...(facial ? { facial } : {}),
                ...(duration !== undefined ? { duration } : {}),
                ...(allowOverlap ? { allowOverlap: true } : {}),
            });
        }
        case "cue": {
            const cueType = checker.oneOf(raw, "cueType", path, CUE_TYPES);
            if (!cueType) return undefined;
            if (cueType === "se") {
                const se = checker.pattern(raw, "se", path, STORY_AUDIO_PATH_PATTERN, "assetNameInvalid");
                const seVolume = raw.seVolume === undefined || raw.seVolume === null
                    ? undefined
                    : checker.number(raw, "seVolume", path, STORY_LIMITS.volume.min, STORY_LIMITS.volume.max);
                return se ? done({ id, kind: "cue", cueType: "se", se, ...(seVolume !== undefined ? { seVolume } : {}) }) : undefined;
            }
            const color = raw.color === undefined || raw.color === null
                ? undefined
                : checker.oneOf(raw, "color", path, EFFECT_COLORS);
            const duration = raw.duration === undefined || raw.duration === null
                ? undefined
                : checker.number(raw, "duration", path, STORY_LIMITS.duration.min, STORY_LIMITS.duration.max);
            return done({
                id,
                kind: "cue",
                cueType,
                ...(color ? { color } : {}),
                ...(duration !== undefined ? { duration } : {}),
            });
        }
        case "varOp": {
            if (!Array.isArray(raw.ops)) {
                checker.add(raw.ops === undefined ? "fieldMissing" : "fieldType", `${path}.ops`, { expected: "array" });
                return undefined;
            }
            if (raw.ops.length > STORY_LIMITS.varOpsPerBeat) {
                checker.add("tooMany", `${path}.ops`, { max: STORY_LIMITS.varOpsPerBeat });
                return undefined;
            }
            const ops: VarOp[] = [];
            raw.ops.forEach((opItem, idx) => {
                const checked = checkVarOp(checker, opItem, `${path}.ops[${idx}]`);
                if (checked) ops.push(checked);
            });
            return done({ id, kind: "varOp", ops });
        }
    }
    return undefined;
}

function checkNode(checker: Checker, key: string, raw: unknown, path: string): StoryNode | undefined {
    if (!isObject(raw)) {
        checker.add("notObject", path);
        return undefined;
    }
    const id = checker.pattern(raw, "id", path, STORY_ID_PATTERN, "idInvalid");
    if (id && id !== key) {
        checker.add("idInvalid", `${path}.id`);
        return undefined;
    }
    const type = checker.oneOf(raw, "type", path, STORY_NODE_TYPES);
    const pos = checkPos(checker, raw.pos, `${path}.pos`);
    if (!id || !type || !pos) return undefined;

    switch (type) {
        case "start":
            return { id, type: "start", pos };
        case "scene": {
            const title = checker.string(raw, "title", path, STORY_LIMITS.nodeTitle, { required: false }) ?? "";
            const background = checkBackgroundSlot(checker, raw.background, `${path}.background`);
            const bgm = checkBgmSlot(checker, raw.bgm, `${path}.bgm`);
            const place = checkPlaceSlot(checker, raw.place, `${path}.place`);
            const transition = checkTransitionSlot(checker, raw.transition, `${path}.transition`);
            const stageCast = checkStageCastSlot(checker, raw.stageCast, `${path}.stageCast`);
            const beats: SceneBeat[] = [];
            if (!Array.isArray(raw.beats)) {
                checker.add(raw.beats === undefined ? "fieldMissing" : "fieldType", `${path}.beats`, { expected: "array" });
            } else if (raw.beats.length > STORY_LIMITS.beatsPerScene) {
                checker.add("tooMany", `${path}.beats`, { max: STORY_LIMITS.beatsPerScene });
            } else {
                raw.beats.forEach((item, idx) => {
                    const beat = checkBeat(checker, item, `${path}.beats[${idx}]`);
                    if (beat) beats.push(beat);
                });
            }
            if (!background || !bgm || !place || !transition || !stageCast) return undefined;
            return { id, type: "scene", title, pos, background, bgm, place, transition, stageCast, beats };
        }
        case "choice": {
            const title = checker.string(raw, "title", path, STORY_LIMITS.nodeTitle, { required: false }) ?? "";
            if (!Array.isArray(raw.options)) {
                checker.add(raw.options === undefined ? "fieldMissing" : "fieldType", `${path}.options`, { expected: "array" });
                return undefined;
            }
            if (raw.options.length < STORY_LIMITS.choiceOptions.min) {
                checker.add("tooFew", `${path}.options`, { min: STORY_LIMITS.choiceOptions.min });
                return undefined;
            }
            if (raw.options.length > STORY_LIMITS.choiceOptions.max) {
                checker.add("tooMany", `${path}.options`, { max: STORY_LIMITS.choiceOptions.max });
                return undefined;
            }
            const options: ChoiceOption[] = [];
            raw.options.forEach((item, idx) => {
                const oPath = `${path}.options[${idx}]`;
                if (!isObject(item)) {
                    checker.add("notObject", oPath);
                    return;
                }
                const optId = checker.pattern(item, "id", oPath, STORY_ID_PATTERN, "idInvalid");
                const text = checker.string(item, "text", oPath, STORY_LIMITS.choiceText);
                const condition = item.condition === undefined || item.condition === null
                    ? undefined
                    : checkConditionExpr(checker, item.condition, `${oPath}.condition`);
                let effects: VarOp[] | undefined;
                if (item.effects !== undefined && item.effects !== null) {
                    if (!Array.isArray(item.effects)) {
                        checker.add("fieldType", `${oPath}.effects`, { expected: "array" });
                    } else if (item.effects.length > STORY_LIMITS.varOpsPerBeat) {
                        checker.add("tooMany", `${oPath}.effects`, { max: STORY_LIMITS.varOpsPerBeat });
                    } else if (item.effects.length > 0) {
                        effects = [];
                        item.effects.forEach((eff, eIdx) => {
                            const checked = checkVarOp(checker, eff, `${oPath}.effects[${eIdx}]`);
                            if (checked) effects!.push(checked);
                        });
                    }
                }
                if (!optId || text === undefined) return;
                options.push({
                    id: optId,
                    text,
                    ...(condition ? { condition } : {}),
                    ...(effects && effects.length > 0 ? { effects } : {}),
                });
            });
            return { id, type: "choice", title, pos, options };
        }
        case "condition": {
            const title = checker.string(raw, "title", path, STORY_LIMITS.nodeTitle, { required: false }) ?? "";
            if (!Array.isArray(raw.rules)) {
                checker.add(raw.rules === undefined ? "fieldMissing" : "fieldType", `${path}.rules`, { expected: "array" });
                return undefined;
            }
            if (raw.rules.length > STORY_LIMITS.conditionRules) {
                checker.add("tooMany", `${path}.rules`, { max: STORY_LIMITS.conditionRules });
                return undefined;
            }
            const rules: ConditionRule[] = [];
            raw.rules.forEach((item, idx) => {
                const rPath = `${path}.rules[${idx}]`;
                if (!isObject(item)) {
                    checker.add("notObject", rPath);
                    return;
                }
                const ruleId = checker.pattern(item, "id", rPath, STORY_ID_PATTERN, "idInvalid");
                const label = item.label === undefined || item.label === null || item.label === ""
                    ? undefined
                    : checker.string(item, "label", rPath, STORY_LIMITS.ruleLabel);
                const expr = checkConditionExpr(checker, item.expr, `${rPath}.expr`);
                if (!ruleId || !expr) return;
                rules.push({ id: ruleId, ...(label ? { label } : {}), expr });
            });
            return { id, type: "condition", title, pos, rules };
        }
        case "end": {
            const title = checker.string(raw, "title", path, STORY_LIMITS.nodeTitle, { required: false }) ?? "";
            const subtitle = raw.subtitle === undefined || raw.subtitle === null
                ? undefined
                : checker.string(raw, "subtitle", path, STORY_LIMITS.endSubtitle);
            return { id, type: "end", title, ...(subtitle !== undefined ? { subtitle } : {}), pos };
        }
    }
    return undefined;
}

function checkEdges(checker: Checker, raw: unknown): StoryEdge[] {
    if (!Array.isArray(raw)) {
        checker.add(raw === undefined ? "fieldMissing" : "fieldType", "edges", { expected: "array" });
        return [];
    }
    if (raw.length > STORY_LIMITS.edges) {
        checker.add("tooMany", "edges", { max: STORY_LIMITS.edges });
        return [];
    }
    const edges: StoryEdge[] = [];
    raw.forEach((item, idx) => {
        const path = `edges[${idx}]`;
        if (!isObject(item)) {
            checker.add("notObject", path);
            return;
        }
        const id = checker.pattern(item, "id", path, STORY_ID_PATTERN, "idInvalid");
        const fromNodeId = checker.pattern(item, "fromNodeId", path, STORY_ID_PATTERN, "idInvalid");
        const fromPortId = checker.pattern(item, "fromPortId", path, STORY_ID_PATTERN, "idInvalid");
        const toNodeId = checker.pattern(item, "toNodeId", path, STORY_ID_PATTERN, "idInvalid");
        if (!id || !fromNodeId || !fromPortId || !toNodeId) return;
        edges.push({ id, fromNodeId, fromPortId, toNodeId });
    });
    return edges;
}

function checkLocalePack(
    checker: Checker,
    localeKey: UiLocale,
    raw: unknown,
    path: string,
): StoryLocalePack | undefined {
    if (!isObject(raw)) {
        checker.add("notObject", path);
        return undefined;
    }
    if (raw.schema !== STORY_I18N_SCHEMA_VERSION) {
        checker.add("formatUnsupported", `${path}.schema`, {
            format: typeof raw.schema === "string" ? raw.schema.slice(0, 40) : String(raw.schema),
        });
        return undefined;
    }
    const storyId = checker.string(raw, "storyId", path, 64, { required: false }) ?? "";
    let baseRev: number | undefined;
    if (raw.baseRev !== undefined && raw.baseRev !== null) {
        const rev = checker.number(raw, "baseRev", path, 0, 1_000_000);
        if (rev !== undefined && Number.isInteger(rev)) baseRev = rev;
        else if (rev !== undefined) checker.add("fieldType", `${path}.baseRev`, { expected: "integer" });
    }
    if (raw.locale !== localeKey) {
        checker.add("enumInvalid", `${path}.locale`, { allowed: localeKey });
        return undefined;
    }

    if (!isObject(raw.translationMeta)) {
        checker.add(raw.translationMeta === undefined ? "fieldMissing" : "notObject", `${path}.translationMeta`);
        return undefined;
    }
    const origin = checker.oneOf(raw.translationMeta, "origin", `${path}.translationMeta`, STORY_TRANSLATION_ORIGINS);
    if (!origin) return undefined;
    if (origin === "original") {
        checker.add("enumInvalid", `${path}.translationMeta.origin`, { allowed: "human, ai_assisted, ai_raw" });
        return undefined;
    }
    const modelHint = raw.translationMeta.modelHint === undefined || raw.translationMeta.modelHint === null || raw.translationMeta.modelHint === ""
        ? undefined
        : checker.string(raw.translationMeta, "modelHint", `${path}.translationMeta`, STORY_LIMITS.translationModelHint);
    const note = raw.translationMeta.note === undefined || raw.translationMeta.note === null || raw.translationMeta.note === ""
        ? undefined
        : checker.string(raw.translationMeta, "note", `${path}.translationMeta`, STORY_LIMITS.translationNote);
    const updatedAt = raw.translationMeta.updatedAt === undefined || raw.translationMeta.updatedAt === null || raw.translationMeta.updatedAt === ""
        ? undefined
        : checker.string(raw.translationMeta, "updatedAt", `${path}.translationMeta`, 64);

    const translationMeta: StoryTranslationMeta = {
        origin,
        ...(modelHint !== undefined ? { modelHint } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(updatedAt !== undefined ? { updatedAt } : {}),
    };

    let meta: { title?: string; summary?: string } | undefined;
    if (raw.meta !== undefined && raw.meta !== null) {
        if (!isObject(raw.meta)) {
            checker.add("notObject", `${path}.meta`);
        } else {
            const mTitle = raw.meta.title === undefined || raw.meta.title === null
                ? undefined
                : checker.string(raw.meta, "title", `${path}.meta`, STORY_LIMITS.title);
            const mSummary = raw.meta.summary === undefined || raw.meta.summary === null
                ? undefined
                : checker.string(raw.meta, "summary", `${path}.meta`, STORY_LIMITS.summary);
            if (mTitle !== undefined || mSummary !== undefined) {
                meta = {
                    ...(mTitle !== undefined ? { title: mTitle } : {}),
                    ...(mSummary !== undefined ? { summary: mSummary } : {}),
                };
            }
        }
    }

    const readStringRecord = (
        obj: unknown,
        subPath: string,
        maxEntries: number,
        maxLen: number,
    ): Record<string, string> | undefined => {
        if (obj === undefined || obj === null) return undefined;
        if (!isObject(obj)) {
            checker.add("notObject", subPath);
            return undefined;
        }
        const entries = Object.entries(obj);
        if (entries.length > maxEntries) {
            checker.add("tooMany", subPath, { max: maxEntries });
            return undefined;
        }
        const out: Record<string, string> = {};
        for (const [k, v] of entries) {
            if (FORBIDDEN_KEYS.has(k) || !STORY_ID_PATTERN.test(k)) {
                checker.add("idInvalid", `${subPath}.${k}`);
                continue;
            }
            if (typeof v !== "string") {
                checker.add("fieldType", `${subPath}.${k}`, { expected: "string" });
                continue;
            }
            if (v.length > maxLen) {
                checker.add("tooLong", `${subPath}.${k}`, { max: maxLen });
                continue;
            }
            out[k] = v;
        }
        return Object.keys(out).length > 0 ? out : undefined;
    };

    const cast = readStringRecord(raw.cast, `${path}.cast`, STORY_LIMITS.cast, STORY_LIMITS.castName);
    const places = readStringRecord(raw.places, `${path}.places`, STORY_LIMITS.nodes, STORY_LIMITS.place);

    const beats: Record<string, StoryLocaleBeatEntry> = {};
    if (!isObject(raw.beats)) {
        checker.add(raw.beats === undefined ? "fieldMissing" : "notObject", `${path}.beats`);
        return undefined;
    }
    const beatEntries = Object.entries(raw.beats);
    if (beatEntries.length > STORY_LIMITS.totalBeats) {
        checker.add("tooMany", `${path}.beats`, { max: STORY_LIMITS.totalBeats });
        return undefined;
    }
    for (const [beatId, beatRaw] of beatEntries) {
        const bPath = `${path}.beats.${beatId}`;
        if (FORBIDDEN_KEYS.has(beatId) || !STORY_ID_PATTERN.test(beatId)) {
            checker.add("idInvalid", bPath);
            continue;
        }
        if (!isObject(beatRaw)) {
            checker.add("notObject", bPath);
            continue;
        }
        const srcHash = checker.string(beatRaw, "srcHash", bPath, 32, { required: false }) ?? "";
        const body = checker.string(beatRaw, "body", bPath, STORY_LIMITS.body);
        const speaker = beatRaw.speaker === undefined || beatRaw.speaker === null || beatRaw.speaker === ""
            ? undefined
            : checker.string(beatRaw, "speaker", bPath, STORY_LIMITS.speakerName);
        if (body === undefined) continue;
        beats[beatId] = {
            srcHash,
            body,
            ...(speaker !== undefined ? { speaker } : {}),
        };
    }

    let choices: Record<string, Record<string, string>> | undefined;
    if (raw.choices !== undefined && raw.choices !== null) {
        if (!isObject(raw.choices)) {
            checker.add("notObject", `${path}.choices`);
        } else {
            const entries = Object.entries(raw.choices);
            if (entries.length > STORY_LIMITS.nodes) {
                checker.add("tooMany", `${path}.choices`, { max: STORY_LIMITS.nodes });
            } else {
                const map: Record<string, Record<string, string>> = {};
                for (const [nodeId, optMap] of entries) {
                    if (FORBIDDEN_KEYS.has(nodeId) || !STORY_ID_PATTERN.test(nodeId)) {
                        checker.add("idInvalid", `${path}.choices.${nodeId}`);
                        continue;
                    }
                    const checkedOpts = readStringRecord(
                        optMap,
                        `${path}.choices.${nodeId}`,
                        STORY_LIMITS.choiceOptions.max,
                        STORY_LIMITS.choiceText,
                    );
                    if (checkedOpts) map[nodeId] = checkedOpts;
                }
                if (Object.keys(map).length > 0) choices = map;
            }
        }
    }

    let ends: Record<string, { title?: string; subtitle?: string }> | undefined;
    if (raw.ends !== undefined && raw.ends !== null) {
        if (!isObject(raw.ends)) {
            checker.add("notObject", `${path}.ends`);
        } else {
            const entries = Object.entries(raw.ends);
            if (entries.length > STORY_LIMITS.nodes) {
                checker.add("tooMany", `${path}.ends`, { max: STORY_LIMITS.nodes });
            } else {
                const map: Record<string, { title?: string; subtitle?: string }> = {};
                for (const [nodeId, endRaw] of entries) {
                    const ePath = `${path}.ends.${nodeId}`;
                    if (FORBIDDEN_KEYS.has(nodeId) || !STORY_ID_PATTERN.test(nodeId)) {
                        checker.add("idInvalid", ePath);
                        continue;
                    }
                    if (!isObject(endRaw)) {
                        checker.add("notObject", ePath);
                        continue;
                    }
                    const eTitle = endRaw.title === undefined || endRaw.title === null
                        ? undefined
                        : checker.string(endRaw, "title", ePath, STORY_LIMITS.nodeTitle);
                    const eSubtitle = endRaw.subtitle === undefined || endRaw.subtitle === null
                        ? undefined
                        : checker.string(endRaw, "subtitle", ePath, STORY_LIMITS.endSubtitle);
                    if (eTitle !== undefined || eSubtitle !== undefined) {
                        map[nodeId] = {
                            ...(eTitle !== undefined ? { title: eTitle } : {}),
                            ...(eSubtitle !== undefined ? { subtitle: eSubtitle } : {}),
                        };
                    }
                }
                if (Object.keys(map).length > 0) ends = map;
            }
        }
    }

    return {
        schema: STORY_I18N_SCHEMA_VERSION,
        storyId,
        ...(baseRev !== undefined ? { baseRev } : {}),
        locale: localeKey,
        translationMeta,
        ...(meta ? { meta } : {}),
        ...(cast ? { cast } : {}),
        ...(places ? { places } : {}),
        beats,
        ...(choices ? { choices } : {}),
        ...(ends ? { ends } : {}),
    };
}

function checkLocales(
    checker: Checker,
    raw: unknown,
): Partial<Record<UiLocale, StoryLocalePack>> | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (!isObject(raw)) {
        checker.add("notObject", "locales");
        return undefined;
    }
    const out: Partial<Record<UiLocale, StoryLocalePack>> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (FORBIDDEN_KEYS.has(key) || !isUiLocale(key)) {
            checker.add("enumInvalid", `locales.${key}`, { allowed: SUPPORTED_UI_LOCALES.join(", ") });
            continue;
        }
        const pack = checkLocalePack(checker, key, value, `locales.${key}`);
        if (pack) out[key] = pack;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function parseRawDocument(raw: unknown): { doc: StoryDocument | null; issues: StoryIssue[] } {
    const checker = new Checker();
    if (!isObject(raw)) {
        checker.add("notObject", "$");
        return { doc: null, issues: checker.issues };
    }
    if (raw.schema !== STORY_SCHEMA_VERSION) {
        checker.add("formatUnsupported", "schema", {
            format: typeof raw.schema === "string" ? raw.schema.slice(0, 40) : String(raw.schema),
        });
        return { doc: null, issues: checker.issues };
    }

    const id = checker.pattern(raw, "id", "$", STORY_ID_PATTERN, "idInvalid");
    let region: StoryRegion | undefined;
    if (typeof raw.region !== "string" || !(STORY_REGIONS as readonly string[]).includes(raw.region)) {
        checker.add("regionInvalid", "region", { allowed: STORY_REGIONS.join(", ") });
    } else {
        region = raw.region as StoryRegion;
    }

    let sourceLocale: UiLocale | undefined;
    if (raw.sourceLocale !== undefined && raw.sourceLocale !== null && raw.sourceLocale !== "") {
        if (!isUiLocale(raw.sourceLocale)) {
            checker.add("enumInvalid", "sourceLocale", { allowed: SUPPORTED_UI_LOCALES.join(", ") });
        } else {
            sourceLocale = raw.sourceLocale;
        }
    }

    let title: string | undefined;
    let summary = "";
    let author = "";
    if (!isObject(raw.meta)) {
        checker.add(raw.meta === undefined ? "fieldMissing" : "notObject", "meta");
    } else {
        title = checker.string(raw.meta, "title", "meta", STORY_LIMITS.title);
        summary = checker.string(raw.meta, "summary", "meta", STORY_LIMITS.summary, { required: false }) ?? "";
        author = checker.string(raw.meta, "author", "meta", STORY_LIMITS.author, { required: false }) ?? "";
    }

    const cast = checkCast(checker, raw.cast);
    const variables = checkVariables(checker, raw.variables);
    const startNodeId = checker.pattern(raw, "startNodeId", "$", STORY_ID_PATTERN, "idInvalid");

    const nodes: Record<string, StoryNode> = {};
    if (!isObject(raw.nodes)) {
        checker.add(raw.nodes === undefined ? "fieldMissing" : "notObject", "nodes");
    } else {
        const entries = Object.entries(raw.nodes);
        if (entries.length > STORY_LIMITS.nodes) {
            checker.add("tooMany", "nodes", { max: STORY_LIMITS.nodes });
        } else {
            for (const [key, value] of entries) {
                if (FORBIDDEN_KEYS.has(key) || !STORY_ID_PATTERN.test(key)) {
                    checker.add("idInvalid", `nodes.${key}`);
                    continue;
                }
                const checked = checkNode(checker, key, value, `nodes.${key}`);
                if (checked) nodes[key] = checked;
            }
        }
    }

    const edges = checkEdges(checker, raw.edges);
    const locales = checkLocales(checker, raw.locales);

    if (checker.issues.length > 0 || !id || !region || title === undefined || !startNodeId) {
        return { doc: null, issues: checker.issues };
    }

    return {
        doc: {
            schema: STORY_SCHEMA_VERSION,
            id,
            region,
            ...(sourceLocale !== undefined ? { sourceLocale } : {}),
            meta: { title, summary, author },
            cast,
            variables,
            startNodeId,
            nodes,
            edges,
            ...(locales ? { locales } : {}),
        },
        issues: [],
    };
}

/**
 * Strictly validates an untrusted `moesekai-story/2` JSON value, strips unknown fields, and compiles
 * the graph. Returns `{ ok: true, doc, program }` when structural parsing succeeds and the compiler
 * produces 0 errors (non-blocking warnings are preserved on `program.warnings`).
 */
export function validateStoryDocument(raw: unknown): StoryValidation {
    const parsed = parseRawDocument(raw);
    if (!parsed.doc) {
        return { ok: false, issues: parsed.issues };
    }
    const program = compileStoryGraph(parsed.doc);
    if (!program.ok) {
        const issues: StoryIssue[] = program.errors.slice(0, MAX_ISSUES).map(diag => ({
            code: diag.code,
            path: diag.path,
            ...(diag.params ? { params: diag.params } : {}),
        }));
        return { ok: false, issues, diagnostics: program.diagnostics };
    }
    return { ok: true, doc: parsed.doc, program };
}

/** Parses and strictly validates a v2 JSON string. */
export function parseStoryJson(text: string): StoryValidation {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return { ok: false, issues: [{ code: "invalidJson", path: "$" }] };
    }
    return validateStoryDocument(raw);
}

/**
 * Lenient structural check used exclusively for locally stored IndexedDB drafts (`drafts.ts`),
 * allowing incomplete mid-edit v2 drafts (e.g. a brand-new draft with unwired `start` or an empty
 * choice text) while rejecting old v1 drafts or corrupted records.
 */
export function parseStoryDocumentDraft(raw: unknown): StoryDocument | null {
    const parsed = parseRawDocument(raw);
    if (parsed.doc) return parsed.doc;
    if (!isObject(raw)) return null;
    if (raw.schema !== STORY_SCHEMA_VERSION) return null;
    if (typeof raw.id !== "string" || !raw.id) return null;
    if (typeof raw.region !== "string" || !(STORY_REGIONS as readonly string[]).includes(raw.region)) return null;
    if (!isObject(raw.meta) || typeof raw.meta.title !== "string") return null;
    if (!Array.isArray(raw.cast) || !Array.isArray(raw.variables) || !Array.isArray(raw.edges)) return null;
    if (!isObject(raw.nodes) || typeof raw.startNodeId !== "string") return null;
    return raw as unknown as StoryDocument;
}
