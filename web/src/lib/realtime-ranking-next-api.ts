// ============================================================================
// API client for the v2 realtime ranking (realtime-ranking-next).
//
// Talks to https://rks-n.exmeaning.com/api/public/v2/{region}/...
// Override with NEXT_PUBLIC_REALTIME_RANKING_V2_API_BASE.
//
// Master data (cards/honors/...) is endpoint-independent, so we reuse the
// legacy fetchRealtimeRankingMasterData from realtime-ranking-api.ts.
// ============================================================================

import {
    BoardEntryV2,
    BoardSnapshotV2,
    ChurnApiResponseV2,
    ChurnEntryV2,
    LatestApiResponseV2,
    ParkingLiveApiResponseV2,
    ParkingLiveUserV2,
    RawProfileHonorV2,
    RawRankingEntryV2,
    RealtimeRankingRegion,
    SeriesPoint,
    TierSeriesApiResponseV2,
    UserSeriesApiResponseV2,
    WorldLinkApiResponseV2,
    WorldLinkGroupApiResponseV2,
    WorldLinkGroupSnapshotV2,
    WorldLinkSnapshotV2,
} from "@/types/realtime-ranking-next";
import { NormalizedPlayerHonor } from "@/types/realtime-ranking";
import { getNextApiBase } from "@/lib/realtime-ranking-line";

const LATEST_TIMEOUT_MS = 10_000;
const WORLDLINK_TIMEOUT_MS = 30_000;
const SERIES_TIMEOUT_MS = 15_000;
const CHURN_TIMEOUT_MS = 15_000;
const PARKING_TIMEOUT_MS = 12_000;

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

export type RealtimeRankingNextErrorCode =
    | "fetchFailed"
    | "timeout"
    | "missingWorldLinkCharacter"
    | "unknown";

export class RealtimeRankingNextApiError extends Error {
    code: RealtimeRankingNextErrorCode;
    status?: number;

    constructor(code: RealtimeRankingNextErrorCode, status?: number) {
        super(`${code}${status != null ? `:${status}` : ""}`);
        this.name = "RealtimeRankingNextApiError";
        this.code = code;
        this.status = status;
    }
}

type QueryValue = string | number | null | undefined;

function buildUrl(region: RealtimeRankingRegion, path: string, query?: Record<string, QueryValue>): string {
    const pathname = `${getNextApiBase()}/${region}/${path.replace(/^\/+|\/+$/g, "")}`;
    if (!query) return pathname;

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value == null || value === "") continue;
        params.set(key, String(value));
    }
    const search = params.toString();
    return search ? `${pathname}?${search}` : pathname;
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = (typeof window !== "undefined" ? window.setTimeout : setTimeout)(
        () => controller.abort(),
        timeoutMs,
    ) as unknown as number;

    try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
            throw new RealtimeRankingNextApiError("fetchFailed", response.status);
        }
        return (await response.json()) as T;
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new RealtimeRankingNextApiError("timeout");
        }
        throw error;
    } finally {
        (typeof window !== "undefined" ? window.clearTimeout : clearTimeout)(timer);
    }
}

// ----------------------------------------------------------------------------
// Normalization helpers
// ----------------------------------------------------------------------------

function tryNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    return undefined;
}

function normalizeHonor(item: RawProfileHonorV2): NormalizedPlayerHonor | null {
    const type = item.profileHonorType;
    const honorId = tryNumber(item.honorId);
    const honorLevel = tryNumber(item.honorLevel);

    if (type === "bonds") {
        const bondsHonorId = honorId;
        if (!bondsHonorId) return null;
        const wordId = tryNumber(item.bondsHonorWordId);
        return {
            kind: "bonds",
            bondsHonorId,
            bondsHonorLevel: honorLevel,
            bondsHonorWordAssetbundleName: wordId ? `__WORD_ID__:${wordId}` : undefined,
        };
    }

    if (!honorId) return null;
    return { kind: "normal", honorId, honorLevel };
}

function normalizeHonors(entry: RawRankingEntryV2): NormalizedPlayerHonor[] {
    if (!Array.isArray(entry.profileHonors)) return [];
    return entry.profileHonors
        .map(normalizeHonor)
        .filter((item): item is NormalizedPlayerHonor => !!item)
        .slice(0, 3);
}

function pickSignature(entry: RawRankingEntryV2): string | undefined {
    const candidate = entry.userProfile?.word
        ?? (typeof entry.word === "string" ? entry.word : undefined);
    const trimmed = typeof candidate === "string" ? candidate.trim() : "";
    return trimmed || undefined;
}

function normalizeEntry(raw: RawRankingEntryV2): BoardEntryV2 {
    const card = raw.userCard;
    return {
        rank: raw.rank,
        score: raw.score,
        displayName: raw.name?.trim() || `Player ${raw.userId}`,
        userId: String(raw.userId),
        signature: pickSignature(raw),
        twitterId: raw.userProfile?.twitterId,
        leaderCardId: tryNumber(card?.cardId),
        leaderCharacterId: tryNumber(card?.characterId),
        leaderCardDefaultImage: card?.defaultImage,
        leaderCardMasterRank: tryNumber(card?.masterRank),
        honors: normalizeHonors(raw),
    };
}

function normalizeSnapshot(data: LatestApiResponseV2): BoardSnapshotV2 {
    return {
        eventId: data.event_id,
        region: data.region,
        startAt: data.start_at,
        endAt: data.end_at,
        updatedAt: data.updated_at,
        userRankingStatus: data.user_ranking_status,
        entries: Array.isArray(data.rankings) ? data.rankings.map(normalizeEntry) : [],
    };
}

function normalizeWorldLinkGroup(group: WorldLinkGroupApiResponseV2): WorldLinkGroupSnapshotV2 {
    return {
        eventId: group.event_id,
        region: group.region,
        startAt: group.start_at,
        endAt: group.end_at,
        updatedAt: group.updated_at,
        userRankingStatus: group.user_ranking_status,
        entries: Array.isArray(group.rankings) ? group.rankings.map(normalizeEntry) : [],
        gameCharacterId: group.game_character_id,
        isWorldBloomChapterAggregate: !!group.is_world_bloom_chapter_aggregate,
    };
}

// ----------------------------------------------------------------------------
// Public fetchers
// ----------------------------------------------------------------------------

export async function fetchLatestV2(region: RealtimeRankingRegion): Promise<BoardSnapshotV2> {
    const data = await fetchJson<LatestApiResponseV2>(buildUrl(region, "latest"), LATEST_TIMEOUT_MS);
    return normalizeSnapshot(data);
}

export async function fetchWorldLinkLatestV2(region: RealtimeRankingRegion): Promise<WorldLinkSnapshotV2 | null> {
    try {
        const data = await fetchJson<WorldLinkApiResponseV2>(buildUrl(region, "worldlink-latest"), WORLDLINK_TIMEOUT_MS);
        return {
            eventId: data.event_id,
            region: data.region,
            startAt: data.start_at,
            endAt: data.end_at,
            updatedAt: data.updated_at,
            groups: Array.isArray(data.groups) ? data.groups.map(normalizeWorldLinkGroup) : [],
        };
    } catch (error) {
        if (error instanceof RealtimeRankingNextApiError) {
            // 404/503/timeout => treat as "no WL data yet" rather than a hard error.
            if (error.code === "timeout" || error.status === 404 || error.status === 503) {
                return null;
            }
        }
        throw error;
    }
}

export async function fetchTierSeriesV2(
    region: RealtimeRankingRegion,
    options: { tiers: number[]; since?: number },
): Promise<Record<string, SeriesPoint[]>> {
    const data = await fetchJson<TierSeriesApiResponseV2>(
        buildUrl(region, "tier-series", { tiers: options.tiers.join(","), since: options.since }),
        SERIES_TIMEOUT_MS,
    );
    return data.tiers ?? {};
}

export async function fetchUserSeriesV2(
    region: RealtimeRankingRegion,
    options: { userIds: string[]; since?: number },
): Promise<Record<string, SeriesPoint[]>> {
    const userIds = options.userIds.slice(0, 4); // API allows at most 4
    if (userIds.length === 0) return {};
    const data = await fetchJson<UserSeriesApiResponseV2>(
        buildUrl(region, "user-series", { userIds: userIds.join(","), since: options.since }),
        SERIES_TIMEOUT_MS,
    );
    return data.users ?? {};
}

export async function fetchParkingLiveV2(region: RealtimeRankingRegion): Promise<ParkingLiveUserV2[]> {
    const data = await fetchJson<ParkingLiveApiResponseV2>(buildUrl(region, "parking-live"), PARKING_TIMEOUT_MS);
    return Array.isArray(data.users) ? data.users : [];
}

export async function fetchChurnV2(
    region: RealtimeRankingRegion,
    options?: { top?: number },
): Promise<ChurnEntryV2[]> {
    const data = await fetchJson<ChurnApiResponseV2>(
        buildUrl(region, "churn", { top: options?.top }),
        CHURN_TIMEOUT_MS,
    );
    return Array.isArray(data.rankings) ? data.rankings : [];
}

/**
 * World Link chapter churn (per-character dashboard). Mirrors fetchChurnV2 but
 * pulls the WL-scoped series so WL-only players (not in the overall board) get
 * their churn data too.
 */
export async function fetchWorldLinkChurnV2(
    region: RealtimeRankingRegion,
    options: { gameCharacterId: number; top?: number },
): Promise<ChurnEntryV2[]> {
    if (!options.gameCharacterId) {
        throw new RealtimeRankingNextApiError("missingWorldLinkCharacter");
    }
    const data = await fetchJson<ChurnApiResponseV2>(
        buildUrl(region, "worldlink-churn", {
            gameCharacterId: options.gameCharacterId,
            top: options.top,
        }),
        CHURN_TIMEOUT_MS,
    );
    return Array.isArray(data.rankings) ? data.rankings : [];
}
// World Link series variants (require gameCharacterId)
// ----------------------------------------------------------------------------

export async function fetchWorldLinkTierSeriesV2(
    region: RealtimeRankingRegion,
    options: { gameCharacterId: number; tiers: number[]; since?: number },
): Promise<Record<string, SeriesPoint[]>> {
    if (!options.gameCharacterId) {
        throw new RealtimeRankingNextApiError("missingWorldLinkCharacter");
    }
    const data = await fetchJson<TierSeriesApiResponseV2>(
        buildUrl(region, "worldlink-tier-series", {
            gameCharacterId: options.gameCharacterId,
            tiers: options.tiers.join(","),
            since: options.since,
        }),
        SERIES_TIMEOUT_MS,
    );
    return data.tiers ?? {};
}

export async function fetchWorldLinkUserSeriesV2(
    region: RealtimeRankingRegion,
    options: { gameCharacterId: number; userIds: string[]; since?: number },
): Promise<Record<string, SeriesPoint[]>> {
    if (!options.gameCharacterId) {
        throw new RealtimeRankingNextApiError("missingWorldLinkCharacter");
    }
    const userIds = options.userIds.slice(0, 4);
    if (userIds.length === 0) return {};
    const data = await fetchJson<UserSeriesApiResponseV2>(
        buildUrl(region, "worldlink-user-series", {
            gameCharacterId: options.gameCharacterId,
            userIds: userIds.join(","),
            since: options.since,
        }),
        SERIES_TIMEOUT_MS,
    );
    return data.users ?? {};
}

// Re-export master data fetcher (endpoint-independent) for convenience.
export { fetchRealtimeRankingMasterData } from "@/lib/realtime-ranking-api";
