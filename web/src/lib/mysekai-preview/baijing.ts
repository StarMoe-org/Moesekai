export const BAIJING_API_BASE = "https://baijing.exmeaning.com/api";
export const BAIJING_IMAGE_BASE = "https://baijing.exmeaning.com/image";

export type BaijingServer = "jp" | "cn";

export interface BaijingCompetition {
    id: number;
    name?: string;
    description?: string;
    submitStartAt?: number;
    reviewStartAt?: number;
    submitEndAt?: number;
    aggregateAt?: number;
    backgroundImageAssetbundleFileName?: string;
    backNumberAccentColorCode?: string;
}

export interface BaijingRankingEntry {
    rank: number;
    key?: string;
    seenCount?: number;
    reviewCount?: number;
    ownerUserId?: number | string;
    ownerUserName?: string;
    title?: string;
    comment?: string;
    thumbnailPath?: string;
    thumbnailUrl?: string;
    tabType?: string;
    submittedAt?: number;
    firstSeenAt?: number;
    lastSeenAt?: number;
}

export interface BaijingRankingSnapshot {
    server: BaijingServer;
    competition: BaijingCompetition;
    pollIntervalSeconds?: number;
    snapshotTtlSeconds?: number;
    lastPolledAt?: number;
    snapshotGeneratedAt?: number;
    totalUniqueEntries?: number;
    top100?: BaijingRankingEntry[];
}

export interface BaijingActiveRankingsResponse {
    rankings?: BaijingRankingSnapshot[];
    server?: BaijingServer;
}

export interface BaijingRoomResponse {
    fetchedAt?: number;
    meta?: {
        competitionId?: number;
        entry?: BaijingRankingEntry;
        rank?: number;
    };
    room?: unknown;
}

export function normalizeBaijingServer(value?: string | null): BaijingServer {
    return value === "cn" ? "cn" : "jp";
}

export function getActiveRankingsUrl(server: BaijingServer) {
    return `${BAIJING_API_BASE}/${server}/active-rankings`;
}

export function getRoomUrl(server: BaijingServer, competitionId: number, rank: number) {
    return `${BAIJING_API_BASE}/${server}/housing-competition/${competitionId}/ranking/${rank}/room`;
}

export function getUserMysekaiRoomUrl(server: BaijingServer, userId: string | number) {
    return `${BAIJING_API_BASE}/${server}/user/mysekai/${encodeURIComponent(String(userId))}/room`;
}

export function getEntryThumbnailUrl(server: BaijingServer, entry?: Pick<BaijingRankingEntry, "thumbnailPath" | "thumbnailUrl"> | null) {
    if (!entry) return "";
    if (entry.thumbnailUrl) return entry.thumbnailUrl;
    if (!entry.thumbnailPath) return "";
    return `${BAIJING_IMAGE_BASE}/${server}/mysekai-housing/${entry.thumbnailPath.replace(/^\/+/, "")}`;
}

type BaijingTranslationValue = string | number | boolean | null | undefined;
type BaijingTranslationFn = (key: string, values?: Record<string, BaijingTranslationValue>) => string;

export function formatDateTime(timestamp?: number, locale = "en-US", fallback = "Not provided") {
    if (!timestamp) return fallback;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return fallback;
    return new Intl.DateTimeFormat(locale, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function formatFullDateTime(timestamp?: number, locale = "en-US", fallback = "Not provided") {
    if (!timestamp) return fallback;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return fallback;
    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function formatNumber(value?: number, locale = "en-US") {
    if (!Number.isFinite(Number(value))) return "-";
    return new Intl.NumberFormat(locale).format(Number(value));
}

export function getTabTypeLabel(tabType?: string, t?: BaijingTranslationFn) {
    const normalized = tabType || "top";
    const key = `page.mysekaiPreview.tabTypes.${normalized}`;
    const label = t?.(key);
    if (label && label !== key) return label;
    return tabType || "TOP";
}

export function getRankTone(rank: number) {
    if (rank === 1) return "bg-tertiary-container text-on-tertiary-container shadow-elev-1";
    if (rank === 2) return "bg-surface-container-highest text-on-surface shadow-elev-1";
    if (rank === 3) return "bg-secondary-container text-on-secondary-container shadow-elev-1";
    return "border border-outline-variant bg-primary-container text-on-primary-container shadow-elev-1";
}
