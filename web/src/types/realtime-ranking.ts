import { IHonorInfo, IHonorGroup, IBondsHonor, IBondsHonorWord, IGameCharaUnit } from "@/types/honor";
import { ICardInfo } from "@/types/types";

export type RealtimeRankingRegion = "cn" | "jp" | "tw" | "kr" | "en";
export type RealtimeRankingBoardMode = "overall" | "worldlink";
export type ChurnBoardType = "overall" | "worldlink";

export const REALTIME_RANKING_REGION_OPTIONS: readonly RealtimeRankingRegion[] = ["cn", "jp", "tw", "kr", "en"];

export function isRealtimeRankingRegion(value: string | null | undefined): value is RealtimeRankingRegion {
    return REALTIME_RANKING_REGION_OPTIONS.some((option) => option === value);
}

export interface RealtimeRankingRawProfileHonor {
    seq: number;
    profileHonorType: "normal" | "bonds" | string;
    honorId: number;
    honorLevel: number;
    bondsHonorViewType?: string;
    bondsHonorWordId?: number;
    // A character honor's chosen background style and word (0 or absent: the default).
    honorBackgroundId?: number | null;
    honorWordId?: number | null;
}

export interface RealtimeRankingRawLeaderCard {
    cardId: number;
    level?: number;
    masterRank?: number;
    specialTrainingStatus?: string;
    defaultImage?: string;
    characterId?: number;
}

export interface RealtimeRankingRawEntry {
    rank: number;
    score: number;
    name: string;
    userId: number | string;
    word?: string;
    signature?: string;
    profile?: string;
    comment?: string;
    leaderCard?: RealtimeRankingRawLeaderCard;
    leaderCardId?: number;
    leaderCharacterId?: number;
    cardId?: number;
    characterId?: number;
    profileHonors?: RealtimeRankingRawProfileHonor[];
    honor?: unknown;
    honors?: unknown[];
    badge?: unknown;
    badges?: unknown[];
    [key: string]: unknown;
}

export interface RealtimeRankingApiResponse {
    event_id: number;
    region: RealtimeRankingRegion;
    start_at: number;
    end_at: number;
    updated_at: number;
    rankings: RealtimeRankingRawEntry[];
}

export interface NormalizedPlayerHonor {
    kind: "normal" | "bonds";
    honorId?: number;
    honorLevel?: number;
    bondsHonorId?: number;
    bondsHonorLevel?: number;
    bondsHonorWordAssetbundleName?: string;
    honorBackgroundId?: number;
    honorWordId?: number;
}

export interface RealtimeRankingEntry {
    rank: number;
    score: number;
    displayName: string;
    userId: string;
    signature?: string;
    leaderCardId?: number;
    leaderCharacterId?: number;
    leaderCardDefaultImage?: "special_training" | "original" | string;
    leaderCardMasterRank?: number;
    honors: NormalizedPlayerHonor[];
    raw: RealtimeRankingRawEntry;
}

export interface RealtimeRankingEntryWithDiff extends RealtimeRankingEntry {
    previousRank?: number;
    previousScore?: number;
    rankDelta: number;
    scoreDelta: number;
    isNewEntry: boolean;
    /** Last score delta recorded when the score actually changed; used as a fallback when the score is currently stable. */
    lastScoreDelta?: number;
    /** Last rank delta recorded when the rank actually changed. */
    lastRankDelta?: number;
    /** Timestamp in ms for the last score/rank change. */
    lastChangedAt?: number;
}

export interface RealtimeRankingSnapshot {
    eventId: number;
    region: RealtimeRankingRegion;
    startAt: number;
    endAt: number;
    updatedAt: number;
    entries: RealtimeRankingEntry[];
}

export interface WorldLinkGroupApiResponse {
    event_id: number;
    region: RealtimeRankingRegion;
    game_character_id: number;
    start_at: number;
    end_at: number;
    updated_at: number;
    user_ranking_status: string;
    is_world_bloom_chapter_aggregate: boolean;
    rankings: RealtimeRankingRawEntry[];
}

export interface WorldLinkApiResponse {
    event_id: number;
    region: RealtimeRankingRegion;
    start_at: number;
    end_at: number;
    updated_at: number;
    groups: WorldLinkGroupApiResponse[];
}

export interface WorldLinkGroupSnapshot extends RealtimeRankingSnapshot {
    gameCharacterId: number;
    userRankingStatus: string;
    isWorldBloomChapterAggregate: boolean;
}

export interface WorldLinkSnapshot {
    eventId: number;
    region: RealtimeRankingRegion;
    startAt: number;
    endAt: number;
    updatedAt: number;
    groups: WorldLinkGroupSnapshot[];
}

export interface RealtimeRankingMasterData {
    /** The server the tables came from. */
    server?: RealtimeRankingRegion;
    cards: ICardInfo[];
    honors: IHonorInfo[];
    honorGroups: IHonorGroup[];
    bondsHonors: IBondsHonor[];
    bondsHonorWords: IBondsHonorWord[];
    gameCharaUnits: IGameCharaUnit[];
}

// ============================================================================
// Churn tracking types
// ============================================================================

export interface ChurnHourlyEntry {
    hour: string;   // ISO timestamp, e.g. "2026-03-23T13:00:00Z"
    count: number;
}

export interface ChurnLastChange {
    time: number;
    old_score: number;
    new_score: number;
    delta: number;
}

export interface ChurnRecentActivity {
    count: number;
    changed_at: number[];
}

export interface ChurnParkingPeriod {
    /** Unix timestamp in milliseconds. */
    start_time: number;
    /** Unix timestamp in milliseconds; undefined means the parking period is still active. */
    end_time?: number;
    /** Parking duration in seconds, present only for finished periods. */
    duration_s?: number;
}

export interface ChurnScoreChange {
    time: number;
    delta: number;
}

export interface ChurnRankingEntry {
    rank: number;
    userId?: number | string;
    name: string;
    /** Tier-line entry without real player info, used for rank > 100 rows. */
    isTierLine?: boolean;
    score: number;
    churn_48h: number;
    hourly_churn: ChurnHourlyEntry[];
    last_change: ChurnLastChange | null;
    recent_activity: ChurnRecentActivity;
    /** Score change records from the latest hour; record count can vary. */
    recent_score_changes: ChurnScoreChange[];
    /** Total score growth over the latest hour, computed by the server. */
    growth_1h: number;
    parking_periods: ChurnParkingPeriod[];
}

export interface ChurnApiResponse {
    event_id: number;
    region: RealtimeRankingRegion;
    board_type: ChurnBoardType;
    target_id: number;
    updated_at: number;
    rankings: ChurnRankingEntry[];
}
