import { createSeed } from "./random";
import { ANSWER_MODES, CLIP_LENGTHS, type AnswerMode, type ClipSeconds } from "./scoring";

export type ServerScope = "jp" | "cn";
export type PresetId = "easy" | "normal" | "hard" | "hell" | "custom";

export interface FreePlaySettings {
    server: ServerScope;
    seed: string;
    clipSeconds: ClipSeconds;
    answerMode: AnswerMode;
    /** Only used by the choice mode. */
    optionsCount: number;
    vocalRemoval: boolean;
    /** Seconds per question. */
    timeLimit: number;
    /** Questions per game, one of ROUND_COUNTS. */
    rounds: number;
}

export const ROUND_COUNTS: readonly number[] = [10, 20, 30];
export const DEFAULT_ROUNDS = 20;
export const OPTION_COUNTS: readonly number[] = [4, 6, 8, 10];
export const SERVER_SCOPES: readonly ServerScope[] = ["jp", "cn"];
export const PRESET_IDS: readonly PresetId[] = ["easy", "normal", "hard", "hell", "custom"];
export const TIME_LIMIT_MIN = 15;
export const TIME_LIMIT_MAX = 120;
export const TIME_LIMIT_DEFAULT = 45;
export const TIME_LIMIT_STEP = 5;
const DEFAULT_OPTIONS = 6;

type PresetDimensions = Pick<FreePlaySettings, "clipSeconds" | "answerMode" | "vocalRemoval"> & { optionsCount?: number };

export const PRESETS: Record<Exclude<PresetId, "custom">, PresetDimensions> = {
    easy: { clipSeconds: 30, answerMode: "choice", optionsCount: 6, vocalRemoval: false },
    normal: { clipSeconds: 15, answerMode: "suggest", vocalRemoval: false },
    hard: { clipSeconds: 5, answerMode: "type", vocalRemoval: false },
    hell: { clipSeconds: 5, answerMode: "type", vocalRemoval: true },
};

export const DEFAULT_PRESET: Exclude<PresetId, "custom"> = "normal";

export function defaultSettings(seed: string = createSeed()): FreePlaySettings {
    return applyPreset(
        {
            server: "jp",
            seed,
            clipSeconds: 15,
            answerMode: "suggest",
            optionsCount: DEFAULT_OPTIONS,
            vocalRemoval: false,
            timeLimit: TIME_LIMIT_DEFAULT,
            rounds: DEFAULT_ROUNDS,
        },
        DEFAULT_PRESET,
    );
}

export function applyPreset(settings: FreePlaySettings, preset: PresetId): FreePlaySettings {
    if (preset === "custom") return settings;
    const dims = PRESETS[preset];
    return {
        ...settings,
        clipSeconds: dims.clipSeconds,
        answerMode: dims.answerMode,
        vocalRemoval: dims.vocalRemoval,
        optionsCount: dims.optionsCount ?? settings.optionsCount,
    };
}

/** The preset whose dimensions match, or "custom". The option count only matters for choice presets. */
export function detectPreset(settings: FreePlaySettings): PresetId {
    for (const id of PRESET_IDS) {
        if (id === "custom") continue;
        const dims = PRESETS[id];
        if (dims.clipSeconds !== settings.clipSeconds || dims.answerMode !== settings.answerMode || dims.vocalRemoval !== settings.vocalRemoval) continue;
        if (dims.answerMode === "choice" && dims.optionsCount !== undefined && dims.optionsCount !== settings.optionsCount) continue;
        return id;
    }
    return "custom";
}

export function clampTimeLimit(value: number): number {
    if (!Number.isFinite(value)) return TIME_LIMIT_DEFAULT;
    return Math.min(TIME_LIMIT_MAX, Math.max(TIME_LIMIT_MIN, Math.round(value)));
}

/** Seeds are free text; trimmed and capped so a share link stays short. */
export function sanitizeSeed(value: string): string {
    return value.trim().slice(0, 32);
}

/** URL parameters that carry free-play settings (share links). */
export const SETTINGS_PARAMS = ["seed", "clip", "mode", "options", "vr", "time", "rounds", "server"] as const;

interface ParamReader {
    get(name: string): string | null;
}

/** Settings from a share link; anything missing or invalid keeps the fallback. */
export function parseSettingsParams(params: ParamReader, fallback: FreePlaySettings): FreePlaySettings {
    const seed = sanitizeSeed(params.get("seed") ?? "");
    const clip = Number(params.get("clip"));
    const mode = params.get("mode");
    const options = Number(params.get("options"));
    const vocal = params.get("vr");
    const time = params.get("time");
    const server = params.get("server");
    const rounds = Number(params.get("rounds"));
    return {
        server: (SERVER_SCOPES as readonly string[]).includes(server ?? "") ? (server as ServerScope) : fallback.server,
        seed: seed || fallback.seed,
        clipSeconds: (CLIP_LENGTHS as readonly number[]).includes(clip) ? (clip as ClipSeconds) : fallback.clipSeconds,
        answerMode: (ANSWER_MODES as readonly string[]).includes(mode ?? "") ? (mode as AnswerMode) : fallback.answerMode,
        optionsCount: OPTION_COUNTS.includes(options) ? options : fallback.optionsCount,
        vocalRemoval: vocal === "1" ? true : vocal === "0" ? false : fallback.vocalRemoval,
        timeLimit: time === null || time === "" ? fallback.timeLimit : clampTimeLimit(Number(time)),
        rounds: ROUND_COUNTS.includes(rounds) ? rounds : fallback.rounds,
    };
}

export function hasSettingsParams(params: ParamReader): boolean {
    return SETTINGS_PARAMS.some((name) => params.get(name) !== null);
}

export function settingsToParams(settings: FreePlaySettings): URLSearchParams {
    const params = new URLSearchParams();
    params.set("seed", settings.seed);
    params.set("clip", String(settings.clipSeconds));
    params.set("mode", settings.answerMode);
    if (settings.answerMode === "choice") params.set("options", String(settings.optionsCount));
    params.set("vr", settings.vocalRemoval ? "1" : "0");
    params.set("time", String(settings.timeLimit));
    params.set("rounds", String(settings.rounds));
    params.set("server", settings.server);
    return params;
}
