// ============================================================================
// Type definitions for the v2 realtime ranking (realtime-ranking-next).
//
// These mirror the responses from https://rks-n.exmeaning.com/api/public/v2/{region}/...
// The v2 API differs from the legacy rks.exmeaning.com API in several ways:
//   - Player avatar lives under `userCard` (legacy: `leaderCard`)
//   - Signature lives under `userProfile.word` (legacy: top-level `word`)
//   - Churn time fields use `t` (legacy: `time`)
//   - Churn pre-computes `churn_1h` / `churn_20min` on the server
//   - Churn no longer ships `last_change` / `recent_activity`
//
// We reuse the shared, endpoint-independent types from realtime-ranking.ts
// (regions, honors, master data) to avoid duplication.
// ============================================================================

import {
    RealtimeRankingRegion,
    NormalizedPlayerHonor,
} from "@/types/realtime-ranking";

export type {
    RealtimeRankingRegion,
    NormalizedPlayerHonor,
    RealtimeRankingMasterData,
} from "@/types/realtime-ranking";
export {
    REALTIME_RANKING_REGION_OPTIONS,
    isRealtimeRankingRegion,
} from "@/types/realtime-ranking";

export type RealtimeRankingNextBoardMode = "overall" | "worldlink";

// ----------------------------------------------------------------------------
// Raw API shapes (v2)
// ----------------------------------------------------------------------------

export interface RawUserCardV2 {
    cardId?: number;
    level?: number;
    masterRank?: number;
    specialTrainingStatus?: string;
    defaultImage?: "special_training" | "original" | string;
    characterId?: number;
}

export interface RawUserProfileV2 {
    userId?: string | number;
    word?: string;
    twitterId?: string;
    profileImageType?: string;
}

export interface RawProfileHonorV2 {
    seq?: number;
    profileHonorType?: "normal" | "bonds" | string;
    honorId?: number;
    honorLevel?: number;
    bondsHonorViewType?: string;
    bondsHonorWordId?: number;
    honorBackgroundId?: number | null;
    honorWordId?: number | null;
}

export interface RawRankingEntryV2 {
    rank: number;
    score: number;
    name: string;
    userId: number | string;
    userCard?: RawUserCardV2;
    userProfile?: RawUserProfileV2;
    profileHonors?: RawProfileHonorV2[];
    [key: string]: unknown;
}

export interface LatestApiResponseV2 {
    event_id: number;
    region: RealtimeRankingRegion;
    start_at: number;
    end_at: number;
    updated_at: number;
    user_ranking_status?: string;
    is_event_aggregate?: boolean;
    rankings: RawRankingEntryV2[];
}

export interface WorldLinkGroupApiResponseV2 {
    event_id: number;
    region: RealtimeRankingRegion;
    game_character_id: number;
    start_at: number;
    end_at: number;
    updated_at: number;
    user_ranking_status?: string;
    is_world_bloom_chapter_aggregate?: boolean;
    rankings: RawRankingEntryV2[];
}

export interface WorldLinkApiResponseV2 {
    event_id: number;
    region: RealtimeRankingRegion;
    start_at: number;
    end_at: number;
    updated_at: number;
    groups: WorldLinkGroupApiResponseV2[];
}

// ----------------------------------------------------------------------------
// Normalized board shapes
// ----------------------------------------------------------------------------

export interface BoardEntryV2 {
    rank: number;
    score: number;
    displayName: string;
    userId: string;
    signature?: string;
    twitterId?: string;
    leaderCardId?: number;
    leaderCharacterId?: number;
    leaderCardDefaultImage?: "special_training" | "original" | string;
    leaderCardMasterRank?: number;
    honors: NormalizedPlayerHonor[];
}

export interface BoardSnapshotV2 {
    eventId: number;
    region: RealtimeRankingRegion;
    startAt: number;
    endAt: number;
    updatedAt: number;
    userRankingStatus?: string;
    entries: BoardEntryV2[];
}

export interface WorldLinkGroupSnapshotV2 extends BoardSnapshotV2 {
    gameCharacterId: number;
    isWorldBloomChapterAggregate: boolean;
}

export interface WorldLinkSnapshotV2 {
    eventId: number;
    region: RealtimeRankingRegion;
    startAt: number;
    endAt: number;
    updatedAt: number;
    groups: WorldLinkGroupSnapshotV2[];
}

/** A board entry enriched with live diff data computed across polling cycles. */
export interface BoardEntryWithDiffV2 extends BoardEntryV2 {
    previousRank?: number;
    previousScore?: number;
    rankDelta: number;
    scoreDelta: number;
    isNewEntry: boolean;
    /** True when this row is a tier line (rank > 100) rather than a real player. */
    isTierLine: boolean;
    /** Last score delta recorded when the score actually changed (stable fallback). */
    lastScoreDelta?: number;
    /** Last rank delta recorded when the rank actually changed. */
    lastRankDelta?: number;
    /** Timestamp in ms for the last score/rank change. */
    lastChangedAt?: number;
}

// ----------------------------------------------------------------------------
// Time series (tier-series / user-series)
// ----------------------------------------------------------------------------

export interface SeriesPoint {
    /** Unix timestamp in milliseconds. */
    t: number;
    /** Score at that time. */
    s: number;
}

export interface TierSeriesApiResponseV2 {
    event_id: number;
    region: RealtimeRankingRegion;
    since: number;
    updated_at: number;
    /** Keyed by tier rank as string, e.g. "1", "10", "100". */
    tiers: Record<string, SeriesPoint[]>;
}

export interface UserSeriesApiResponseV2 {
    event_id: number;
    region: RealtimeRankingRegion;
    since: number;
    updated_at: number;
    /** Keyed by userId. */
    users: Record<string, SeriesPoint[]>;
}

// ----------------------------------------------------------------------------
// Parking live
// ----------------------------------------------------------------------------

export interface ParkingLiveUserV2 {
    userId: string;
    name: string;
    rank: number;
    /** Unix timestamp in milliseconds when this parking period started. */
    since_ms: number;
    /** Current parking duration in seconds. */
    duration_s: number;
    last_score: number;
}

export interface ParkingLiveApiResponseV2 {
    event_id: number;
    region: RealtimeRankingRegion;
    updated_at: number;
    users: ParkingLiveUserV2[];
}

// ----------------------------------------------------------------------------
// Churn (row-level mini dashboard)
// ----------------------------------------------------------------------------

export interface ChurnHourlyEntryV2 {
    /** ISO timestamp, e.g. "2026-06-14T18:00:00Z". */
    hour: string;
    count: number;
}

export interface ChurnScoreChangeV2 {
    /** Unix timestamp in milliseconds. */
    t: number;
    delta: number;
}

export interface ChurnParkingPeriodV2 {
    /** Unix timestamp in milliseconds. */
    start_time?: number;
    since_ms?: number;
    /** Unix timestamp in milliseconds; undefined means still parking. */
    end_time?: number;
    duration_s?: number;
}

export interface ChurnEntryV2 {
    rank: number;
    userId?: string;
    name: string;
    /** True for tier-line rows (rank > 100) without real player info. */
    isTierLine?: boolean;
    score: number;
    growth_1h: number;
    churn_1h: number;
    churn_20min: number;
    churn_48h: number;
    hourly_churn: ChurnHourlyEntryV2[];
    recent_score_changes: ChurnScoreChangeV2[];
    parking_periods: ChurnParkingPeriodV2[];
}

export interface ChurnApiResponseV2 {
    event_id: number;
    region: RealtimeRankingRegion;
    updated_at: number;
    rankings: ChurnEntryV2[];
}
