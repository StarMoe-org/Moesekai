/**
 * Typed client for the daily guess-music challenge API v2 (Go backend, /api/guess-music/...).
 *
 * Four tiers (easy / normal / hard / hell), each with a ranked set and a
 * practice set per day. Every call may carry "Authorization: Bearer <StarMoe
 * ID token>" from `getIdToken`; ranked runs need it, practice does not.
 * Failures surface as DailyApiError with the server's error code, or a
 * synthetic one ("network", "bad_response", "http_<status>") when the server
 * sent none.
 *
 * Kept free of path aliases and React so the tests can import it directly.
 */

import { isAcceptedAliasKey, normalizeAnswer, type SongIndex } from "./answer.ts";
import { apiUrl, defaultApiBaseUrl, isAbortError, readApiError, type FetchLike } from "./api-client.ts";

export { isAbortError };

export const DAILY_TIER_IDS = ["easy", "normal", "hard", "hell"] as const;
export type DailyTierId = (typeof DAILY_TIER_IDS)[number];
export type DailyMode = "ranked" | "practice";
export type DailyAnswerMode = "choice" | "suggest" | "type";

export function isDailyTierId(value: unknown): value is DailyTierId {
    return typeof value === "string" && (DAILY_TIER_IDS as readonly string[]).includes(value);
}

export interface DailyTierInfo {
    id: DailyTierId;
    rounds: number;
    clipSeconds: number;
    timeLimitSeconds: number;
    answerMode: DailyAnswerMode;
    /** Choice mode only: how many options each round offers. */
    optionCount?: number;
    /** The clips come with the vocals removed (separated offline, cut on the server). */
    vocalRemoval: boolean;
    /** False while the tier cannot be played today (hell before enough instrumentals are ready). */
    available: boolean;
}

export interface DailyTierStatus {
    status: "in_progress" | "finished";
    /** In progress: the next unanswered round (0-based). */
    resumeRound?: number;
    score?: number;
    rank?: number;
}

export interface DailyInfo {
    date: string;
    timezone: string;
    /** RFC 3339 instant of the next day boundary. */
    nextResetAt: string;
    server: string;
    authEnabled: boolean;
    /** False until the server has loaded its master data. */
    ready: boolean;
    tiers: DailyTierInfo[];
    /** Only with a valid token; tiers not played today are absent. */
    me?: { tiers: Partial<Record<DailyTierId, DailyTierStatus>> };
}

export interface DailyPlayer {
    name: string;
    avatar: string | null;
}

export interface DailySession {
    sessionId: string;
    date: string;
    tier: DailyTierId;
    mode: DailyMode;
    ranked: boolean;
    player?: DailyPlayer;
    rounds: number;
    /** The next unanswered round (0-based); 0 for a fresh session. */
    resumeRound: number;
}

export interface DailyRoundStart {
    round: number;
    clipSeconds: number;
    timeLimitSeconds: number;
    clipUrl: string;
    /** Choice mode: the music ids to choose from (shuffled, the answer among them). */
    options?: number[];
}

/** The answer of a round; only sent once the round is final. */
export interface RoundReveal {
    musicId: number;
    musicTitle: string;
    vocalId: number;
    vocalCaption: string;
    vocalType: string;
    startSeconds: number;
    clipSeconds: number;
}

export interface DailyAnswerResult {
    correct: boolean;
    final: boolean;
    strikesLeft: number;
    points: number;
    totalScore: number;
    combo: number;
    answer?: RoundReveal;
}

export interface DailyRoundSummary {
    round: number;
    correct: boolean;
    points: number;
    attempts: number;
    elapsedMs: number;
    answer: RoundReveal;
}

export interface DailyFinishResult {
    date: string;
    tier: DailyTierId;
    mode: DailyMode;
    totalScore: number;
    correctCount: number;
    durationMs: number;
    ranked: boolean;
    rank?: number;
    totalPlayers?: number;
    rounds: DailyRoundSummary[];
}

export interface DailyGameBadge {
    server: string;
    name: string;
}

export interface DailyLeaderboardEntry {
    rank: number;
    name: string;
    avatar: string | null;
    score: number;
    correctCount: number;
    durationMs: number;
    game?: DailyGameBadge;
}

export interface DailyLeaderboardMe {
    rank: number;
    score: number;
    correctCount: number;
    durationMs: number;
}

export interface DailyLeaderboard {
    date: string;
    tier: DailyTierId;
    totalPlayers: number;
    entries: DailyLeaderboardEntry[];
    me?: DailyLeaderboardMe;
}

export interface DailyGameAccount {
    server: string;
    userId: string;
    name: string;
}

export interface GuessMusicMe {
    sub: string;
    name: string;
    avatar: string | null;
    game?: DailyGameAccount;
}

/** What the UI needs to know about a failure. */
export type DailyErrorKind =
    | "alreadyPlayed"
    | "tierUnavailable"
    | "loginRequired"
    | "rankedUnavailable"
    | "authUnavailable"
    | "rateLimited"
    | "unauthorized"
    | "sessionExpired"
    | "clipNotServed"
    | "conflict"
    | "notReady"
    | "network"
    | "server";

export class DailyApiError extends Error {
    /** Server error code, or "network" / "bad_response" / "http_<status>". */
    readonly code: string;
    /** HTTP status; 0 when the request never got a response. */
    readonly status: number;
    /** The finished attempt, sent with 409 already_played. */
    readonly result?: DailyFinishResult;

    constructor(code: string, status: number, message: string, result?: DailyFinishResult) {
        super(message || code);
        this.name = "DailyApiError";
        this.code = code;
        this.status = status;
        this.result = result;
    }

    get kind(): DailyErrorKind {
        return classifyDailyError(this);
    }
}

export function classifyDailyError(error: unknown): DailyErrorKind {
    if (!(error instanceof DailyApiError)) return "network";
    const { code, status } = error;
    if (code === "already_played") return "alreadyPlayed";
    if (code === "tier_unavailable") return "tierUnavailable";
    if (code === "login_required") return "loginRequired";
    if (code === "ranked_unavailable") return "rankedUnavailable";
    if (code === "auth_unavailable") return "authUnavailable";
    if (code === "clip_not_served") return "clipNotServed";
    if (code === "not_ready" || status === 503) return "notReady";
    if (code === "rate_limited" || status === 429) return "rateLimited";
    if (status === 401 || code === "unauthorized" || code === "invalid_token") return "unauthorized";
    if (status === 404 || code === "session_not_found" || code === "not_found") return "sessionExpired";
    if (status === 409) return "conflict";
    if (code === "network" || status === 0) return "network";
    return "server";
}

export interface DailyApiOptions {
    /** Prefix for the relative "/api/..." paths; defaults to NEXT_PUBLIC_API_URL or "". */
    baseUrl?: string;
    fetch?: FetchLike;
    /** The signed-in player's ID token, or null for anonymous calls. */
    getIdToken?: () => Promise<string | null>;
}

export interface LeaderboardQuery {
    tier: DailyTierId;
    date?: string;
    limit?: number;
}

export interface DailyApi {
    getInfo(signal?: AbortSignal): Promise<DailyInfo>;
    /** Ranked: resumes today's unfinished run (resumeRound > 0) or rejects with already_played. Practice: always a new run. */
    createSession(tier: DailyTierId, mode: DailyMode): Promise<DailySession>;
    startRound(sessionId: string, round: number): Promise<DailyRoundStart>;
    /** The pre-cut clip bytes (mp3, every tier); the server's round timer starts on the first fetch. */
    fetchClip(clipUrl: string, signal?: AbortSignal): Promise<Blob>;
    answer(sessionId: string, round: number, musicId: number | null): Promise<DailyAnswerResult>;
    finish(sessionId: string): Promise<DailyFinishResult>;
    leaderboard(query: LeaderboardQuery, signal?: AbortSignal): Promise<DailyLeaderboard>;
    me(signal?: AbortSignal): Promise<GuessMusicMe>;
    linkGame(harukiAccessToken: string): Promise<{ game: DailyGameAccount }>;
    unlinkGame(): Promise<void>;
}

const ROOT = "/api/guess-music";
const CLIP_ACCEPT = "audio/mpeg, audio/*;q=0.8";

function seg(value: string | number): string {
    return encodeURIComponent(String(value));
}

/** Known tiers only, in the canonical order; a tier is playable unless the server says otherwise. */
function normalizeInfo(info: DailyInfo): DailyInfo {
    const tiers = Array.isArray(info?.tiers)
        ? info.tiers.filter((tier) => tier && isDailyTierId(tier.id)).map((tier) => ({ ...tier, available: tier.available !== false }))
        : [];
    tiers.sort((a, b) => DAILY_TIER_IDS.indexOf(a.id) - DAILY_TIER_IDS.indexOf(b.id));
    return { ...info, tiers };
}

export function createDailyApi(options: DailyApiOptions = {}): DailyApi {
    const baseUrl = (options.baseUrl ?? defaultApiBaseUrl()).replace(/\/+$/, "");
    const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
    const getIdToken = options.getIdToken ?? (async () => null);

    async function send(method: string, path: string, body?: unknown, signal?: AbortSignal, accept = "application/json"): Promise<Response> {
        const headers: Record<string, string> = { Accept: accept };
        let token: string | null = null;
        try {
            token = await getIdToken();
        } catch {
            token = null;
        }
        if (token) headers.Authorization = `Bearer ${token}`;
        const init: RequestInit = { method, headers, signal, cache: "no-store" };
        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(body);
        }
        let response: Response;
        try {
            response = await doFetch(apiUrl(baseUrl, path), init);
        } catch (error) {
            if (isAbortError(error)) throw error;
            throw new DailyApiError("network", 0, error instanceof Error ? error.message : String(error));
        }
        if (!response.ok) throw await toError(response);
        return response;
    }

    async function json<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
        const response = await send(method, path, body, signal);
        try {
            return (await response.json()) as T;
        } catch {
            throw new DailyApiError("bad_response", response.status, "invalid JSON");
        }
    }

    const session = (sessionId: string) => `${ROOT}/daily/sessions/${seg(sessionId)}`;

    return {
        getInfo: async (signal) => normalizeInfo(await json<DailyInfo>("GET", `${ROOT}/daily`, undefined, signal)),
        createSession: (tier, mode) => json<DailySession>("POST", `${ROOT}/daily/sessions`, { tier, mode }),
        startRound: (sessionId, round) => json<DailyRoundStart>("POST", `${session(sessionId)}/rounds/${seg(round)}/start`, {}),
        async fetchClip(clipUrl, signal) {
            const response = await send("GET", clipUrl, undefined, signal, CLIP_ACCEPT);
            return response.blob();
        },
        answer: (sessionId, round, musicId) =>
            json<DailyAnswerResult>("POST", `${session(sessionId)}/rounds/${seg(round)}/answer`, { musicId }),
        finish: (sessionId) => json<DailyFinishResult>("POST", `${session(sessionId)}/finish`, {}),
        leaderboard(query, signal) {
            const params = new URLSearchParams({ tier: query.tier });
            if (query.date) params.set("date", query.date);
            if (query.limit) params.set("limit", String(query.limit));
            return json<DailyLeaderboard>("GET", `${ROOT}/daily/leaderboard?${params.toString()}`, undefined, signal);
        },
        me: (signal) => json<GuessMusicMe>("GET", `${ROOT}/me`, undefined, signal),
        linkGame: (harukiAccessToken) => json<{ game: DailyGameAccount }>("POST", `${ROOT}/me/game-link`, { harukiAccessToken }),
        async unlinkGame() {
            await send("DELETE", `${ROOT}/me/game-link`);
        },
    };
}

async function toError(response: Response): Promise<DailyApiError> {
    const { code, message, data } = await readApiError(response);
    const result = data?.result && typeof data.result === "object" ? (data.result as DailyFinishResult) : undefined;
    return new DailyApiError(code, response.status, message, result);
}

/* ---------- Typed answers (hard / hell) ---------- */

export type TypedAnswer =
    | { status: "empty" }
    | { status: "none" }
    /** Several different songs answer to this text (a shared alias). */
    | { status: "ambiguous"; musicIds: number[] }
    | { status: "match"; musicId: number };

/**
 * The song a typed answer names, by the same keys free play accepts: the
 * title, the reading, the localized title, or an alias of 2+ characters that
 * is not just digits. Titles, readings and localized titles beat aliases;
 * songs sharing a title count as one (the lowest id is sent).
 */
export function resolveTypedAnswer(index: SongIndex, input: string): TypedAnswer {
    const key = normalizeAnswer(input);
    if (!key) return { status: "empty" };
    const direct = new Map<string, number>();
    const byAlias = new Map<string, number>();
    for (const song of index.songs) {
        for (const candidate of song.keys) {
            if (candidate.key !== key) continue;
            const alias = candidate.kind === "alias";
            if (alias && !isAcceptedAliasKey(candidate.key)) continue;
            const bucket = alias ? byAlias : direct;
            const known = bucket.get(song.titleKey);
            if (known === undefined || song.entry.id < known) bucket.set(song.titleKey, song.entry.id);
        }
    }
    const hits = direct.size ? direct : byAlias;
    if (hits.size === 0) return { status: "none" };
    const ids = [...hits.values()].sort((a, b) => a - b);
    return ids.length === 1 ? { status: "match", musicId: ids[0] } : { status: "ambiguous", musicIds: ids };
}

/* ---------- Reload persistence (sessionStorage, one run per date, tier and mode) ---------- */

/** A round answered in this browser, kept so a reload can show it again. */
export interface StoredRound {
    round: number;
    correct: boolean;
    points: number;
    answer?: RoundReveal;
}

export interface StoredDailyRun {
    date: string;
    tier: DailyTierId;
    mode: DailyMode;
    sessionId: string;
    ranked: boolean;
    /** Rounds in the set. */
    rounds: number;
    /** The round being played or next to play. */
    round: number;
    totalScore: number;
    combo: number;
    answered: StoredRound[];
    /** Wrong music ids guessed in the current round. */
    wrongGuesses: number[];
    /** Epoch ms when the current round's clip started loading (the server timer starts then). */
    clipStartedAt?: number;
}

const STORAGE_PREFIX = "moesekai:guess-music:daily-run:";
const LEGACY_STORAGE_KEY = "moesekai:guess-music:daily-run";

function storageKey(date: string, tier: DailyTierId, mode: DailyMode): string {
    return `${STORAGE_PREFIX}${date}:${tier}:${mode}`;
}

function storage(): Storage | undefined {
    try {
        return globalThis.sessionStorage ?? undefined;
    } catch {
        return undefined;
    }
}

export function loadStoredRun(date: string, tier: DailyTierId, mode: DailyMode): StoredDailyRun | null {
    try {
        const raw = storage()?.getItem(storageKey(date, tier, mode));
        if (!raw) return null;
        const run = JSON.parse(raw) as StoredDailyRun;
        if (!run || run.date !== date || run.tier !== tier || run.mode !== mode) return null;
        if (typeof run.sessionId !== "string" || !run.sessionId) return null;
        return {
            ...run,
            ranked: mode === "ranked",
            rounds: Number(run.rounds) > 0 ? Number(run.rounds) : 20,
            round: Number.isInteger(run.round) && run.round >= 0 ? run.round : 0,
            totalScore: Number(run.totalScore) || 0,
            combo: Number(run.combo) || 0,
            answered: Array.isArray(run.answered) ? run.answered : [],
            wrongGuesses: Array.isArray(run.wrongGuesses) ? run.wrongGuesses : [],
        };
    } catch {
        return null;
    }
}

export function saveStoredRun(run: StoredDailyRun): void {
    try {
        storage()?.setItem(storageKey(run.date, run.tier, run.mode), JSON.stringify(run));
    } catch {
        // Private mode or storage disabled: the run just will not survive a reload.
    }
}

export function clearStoredRun(date: string, tier: DailyTierId, mode: DailyMode): void {
    try {
        storage()?.removeItem(storageKey(date, tier, mode));
    } catch {
        // Nothing to clear.
    }
}

/** Drops runs of other days (and the v1 single-run entry). */
export function pruneStoredRuns(today: string): void {
    try {
        const store = storage();
        if (!store) return;
        const stale: string[] = [];
        for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (!key) continue;
            if (key === LEGACY_STORAGE_KEY || (key.startsWith(STORAGE_PREFIX) && !key.startsWith(`${STORAGE_PREFIX}${today}:`))) stale.push(key);
        }
        for (const key of stale) store.removeItem(key);
    } catch {
        // Storage unavailable.
    }
}

/* ---------- Small helpers shared by the daily UI ---------- */

/** Milliseconds until an RFC 3339 instant (never negative). */
export function msUntil(isoInstant: string, now: number = Date.now()): number {
    const at = Date.parse(isoInstant);
    return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}

/** "HH:MM:SS" for a countdown. */
export function formatCountdown(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "M:SS.s" for a run duration or a round's elapsed time. */
export function formatDuration(ms: number): string {
    const tenths = Math.max(0, Math.round(ms / 100));
    const m = Math.floor(tenths / 600);
    const s = (tenths % 600) / 10;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** The given day and the previous `days` days, newest first, as YYYY-MM-DD. */
export function recentDates(today: string, days = 30): string[] {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
    if (!match) return [today];
    const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const out: string[] = [];
    for (let i = 0; i <= days; i++) out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
    return out;
}
