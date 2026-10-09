/**
 * Client for free play's vocal-removal endpoints (Go backend, /api/guess-music/practice/...).
 *
 * Vocals are separated offline and the full instrumentals never leave the
 * server: the browser only learns which vocals have one (ids, nothing else)
 * and asks for one clip per round. The server picks the start from the seed
 * and the round, cuts the clip and hands back a short-lived opaque URL.
 *
 * Kept free of path aliases and React so the tests can import it directly.
 */

import { apiUrl, isAbortError, readApiError, type FetchLike } from "./api-client.ts";

export interface InstrumentalCatalog {
    available: boolean;
    server: string;
    /** Vocals with an instrumental (vocals removed), by musicVocals id. */
    vocalIds: number[];
}

export interface PracticeClipRequest {
    vocalId: number;
    clipSeconds: number;
    /** The game's seed; the same seed, round, vocal and length always give the same clip. */
    seed: string;
    /** 0-based round of the game. */
    round: number;
}

export interface PracticeClip {
    /** URL of the cut clip (mp3, exactly clipSeconds long); play it from 0. */
    clipUrl: string;
    /** Where the clip starts in the song, in seconds (shown in the reveal). */
    startSeconds: number;
    clipSeconds: number;
}

/** What the UI needs to know about a failure. */
export type PracticeErrorKind = "rateLimited" | "unavailable" | "unknownVocal" | "network" | "server";

export class PracticeApiError extends Error {
    /** Server error code, or "network" / "bad_response" / "http_<status>". */
    readonly code: string;
    /** HTTP status; 0 when the request never got a response. */
    readonly status: number;

    constructor(code: string, status: number, message: string) {
        super(message || code);
        this.name = "PracticeApiError";
        this.code = code;
        this.status = status;
    }

    get kind(): PracticeErrorKind {
        return classifyPracticeError(this);
    }
}

export function classifyPracticeError(error: unknown): PracticeErrorKind {
    if (!(error instanceof PracticeApiError)) return "network";
    const { code, status } = error;
    if (code === "rate_limited" || status === 429) return "rateLimited";
    if (code === "inst_unavailable") return "unavailable";
    if (code === "unknown_vocal" || status === 404) return "unknownVocal";
    if (code === "network" || status === 0) return "network";
    return "server";
}

export interface PracticeApiOptions {
    /** Prefix for the relative "/api/..." paths; defaults to "" (the page's own origin, like the daily API). */
    baseUrl?: string;
    fetch?: FetchLike;
}

export interface PracticeApi {
    /** Which vocals have an instrumental. Never rejects for "not available": that is `available: false`. */
    instrumentals(signal?: AbortSignal): Promise<InstrumentalCatalog>;
    /** Asks the server to cut one clip with the vocals removed. */
    clip(request: PracticeClipRequest, signal?: AbortSignal): Promise<PracticeClip>;
}

const ROOT = "/api/guess-music/practice";
/** The server rejects longer seeds. */
export const PRACTICE_SEED_MAX_LENGTH = 64;

/**
 * The server signs clip URLs for 30 minutes (an expired one answers 410
 * clip_expired); a cached answer older than this is asked for again.
 */
export const PRACTICE_CLIP_REUSE_MS = 25 * 60 * 1000;

export function createPracticeApi(options: PracticeApiOptions = {}): PracticeApi {
    const baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
    const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

    async function json<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
        const headers: Record<string, string> = { Accept: "application/json" };
        const init: RequestInit = { method, headers, signal };
        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(body);
        }
        let response: Response;
        try {
            response = await doFetch(apiUrl(baseUrl, path), init);
        } catch (error) {
            if (isAbortError(error)) throw error;
            throw new PracticeApiError("network", 0, error instanceof Error ? error.message : String(error));
        }
        if (!response.ok) throw await toError(response);
        try {
            return (await response.json()) as T;
        } catch {
            throw new PracticeApiError("bad_response", response.status, "invalid JSON");
        }
    }

    return {
        async instrumentals(signal) {
            return normalizeCatalog(await json<Partial<InstrumentalCatalog>>("GET", `${ROOT}/instrumentals`, undefined, signal));
        },
        async clip(request, signal) {
            const data = await json<Partial<PracticeClip>>(
                "POST",
                `${ROOT}/clips`,
                {
                    vocalId: request.vocalId,
                    clipSeconds: request.clipSeconds,
                    seed: request.seed.slice(0, PRACTICE_SEED_MAX_LENGTH),
                    round: request.round,
                },
                signal,
            );
            const startSeconds = Number(data?.startSeconds);
            if (typeof data?.clipUrl !== "string" || !data.clipUrl || !Number.isFinite(startSeconds)) {
                throw new PracticeApiError("bad_response", 200, "clip response without clipUrl or startSeconds");
            }
            const clipSeconds = Number(data.clipSeconds);
            return {
                clipUrl: apiUrl(baseUrl, data.clipUrl),
                startSeconds,
                clipSeconds: Number.isFinite(clipSeconds) && clipSeconds > 0 ? clipSeconds : request.clipSeconds,
            };
        },
    };
}

export interface PracticeClipCache {
    /** The clip for `key`, asking the server only the first time. */
    get(key: string, request: PracticeClipRequest): Promise<PracticeClip>;
}

/**
 * One request per clip: preloading the next round and then playing it share
 * the same answer, so a round costs one request against the server's rate
 * limit. A failed request is forgotten, so a retry asks again, and so is one
 * whose signed URL is close to expiring.
 */
export function createPracticeClipCache(api: Pick<PracticeApi, "clip">, now: () => number = Date.now): PracticeClipCache {
    const requests = new Map<string, { pending: Promise<PracticeClip>; at: number }>();
    return {
        get(key, request) {
            const known = requests.get(key);
            if (known && now() - known.at < PRACTICE_CLIP_REUSE_MS) return known.pending;
            const entry = { pending: api.clip(request), at: now() };
            requests.set(key, entry);
            entry.pending.catch(() => {
                if (requests.get(key) === entry) requests.delete(key);
            });
            return entry.pending;
        },
    };
}

/** Positive integer ids only; anything malformed reads as "not available". */
export function normalizeCatalog(data: Partial<InstrumentalCatalog> | null | undefined): InstrumentalCatalog {
    const ids = Array.isArray(data?.vocalIds) ? data.vocalIds.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
    return {
        available: data?.available === true && ids.length > 0,
        server: typeof data?.server === "string" && data.server ? data.server : "jp",
        vocalIds: ids,
    };
}

async function toError(response: Response): Promise<PracticeApiError> {
    const { code, message } = await readApiError(response);
    return new PracticeApiError(code, response.status, message);
}

/* ---------- Whether free play can remove vocals right now ---------- */

export type CatalogState =
    | { status: "loading" }
    | { status: "failed" }
    | { status: "loaded"; catalog: InstrumentalCatalog };

/**
 * ready: the switch and the hell preset work. loading: still asking the server.
 * unavailable: the server has no instrumentals (or could not be asked).
 * serverUnsupported: the instrumentals cover another server's songs (CN has none).
 */
export type VocalRemovalState = "loading" | "ready" | "unavailable" | "serverUnsupported";

export function vocalRemovalState(server: string, catalog: CatalogState): VocalRemovalState {
    // Only the JP songs have instrumentals: no need to wait for the server to say so.
    if (server !== "jp") return "serverUnsupported";
    if (catalog.status === "loading") return "loading";
    if (catalog.status === "failed" || !catalog.catalog.available) return "unavailable";
    return catalog.catalog.server === server ? "ready" : "serverUnsupported";
}
