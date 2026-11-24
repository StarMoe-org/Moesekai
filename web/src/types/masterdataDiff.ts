export type MasterdataDiffServer = "jp" | "en" | "cn";

export const MASTERDATA_DIFF_SERVERS: readonly MasterdataDiffServer[] = ["jp", "en", "cn"] as const;

export interface MasterdataVersionItem {
    server: MasterdataDiffServer;
    sha: string;
    shortSha: string;
    parentSha?: string;
    dataVersion: string;
    commitMessage: string;
    committedAt: string;
    committedUnix: number;
    commitUrl: string;
}

export interface MasterdataVersionsResponse {
    server: MasterdataDiffServer;
    repo: string;
    page: number;
    limit: number;
    hasMore: boolean;
    items: MasterdataVersionItem[];
}

export interface MasterdataDiffStats {
    filesChanged: number;
    additions: number;
    deletions: number;
}

export interface MasterdataFileChange {
    path: string;
    name: string;
    status: "added" | "modified" | "removed";
    additions: number;
    deletions: number;
    changes: number;
    category: string;
    isCore: boolean;
}

export interface MasterdataEntityItem {
    id: string;
    changeType: "added" | "modified" | "removed";
    title: string;
    subtitle?: string;
    assetbundleName?: string;
    characterId?: number;
    rarity?: string;
    attr?: string;
    startAt?: number;
    endAt?: number;
    detailPath?: string;
    changedFields?: string[];
    extra?: Record<string, unknown>;
}

export interface MasterdataEntityGroup {
    key: string;
    file: string;
    addedCount: number;
    modifiedCount: number;
    removedCount: number;
    truncated?: boolean;
    items: MasterdataEntityItem[];
}

export interface MasterdataCommitDiffResponse {
    server: MasterdataDiffServer;
    repo: string;
    sha: string;
    shortSha: string;
    parentSha?: string;
    dataVersion: string;
    commitMessage: string;
    committedAt: string;
    committedUnix: number;
    commitUrl: string;
    stats: MasterdataDiffStats;
    versionMeta?: Record<string, unknown>;
    entityGroups: MasterdataEntityGroup[];
    files: MasterdataFileChange[];
    generatedAt: string;
}

export interface MasterdataFieldDiff {
    field: string;
    before?: unknown;
    after?: unknown;
}

export interface MasterdataRecordDiff {
    key: string;
    changeType: "added" | "modified" | "removed";
    summary?: string;
    before?: unknown;
    after?: unknown;
    fields?: MasterdataFieldDiff[];
}

export interface MasterdataFileDiffResponse {
    server: MasterdataDiffServer;
    sha: string;
    parentSha?: string;
    file: string;
    status: string;
    mode: "array" | "object" | "raw";
    totalAdded: number;
    totalModified: number;
    totalRemoved: number;
    totalItems: number;
    offset: number;
    limit: number;
    truncated?: boolean;
    items: MasterdataRecordDiff[];
}

export interface MasterdataSummarySection {
    category: string;
    title: string;
    items: string[];
}

export interface MasterdataSummaryResponse {
    server: MasterdataDiffServer;
    sha: string;
    dataVersion: string;
    locale: string;
    source: "ai" | "fallback";
    provider?: string;
    model?: string;
    cached: boolean;
    generatedAt: string;
    headline: string;
    highlights: string[];
    sections: MasterdataSummarySection[];
    notes?: string;
}
