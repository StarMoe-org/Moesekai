import { changeCount, conversionCount, shortVersion, type VersionEntry } from "@/lib/assetHistory";
import type { MasterdataDiffServer, MasterdataVersionItem } from "@/types/masterdataDiff";

export type UnifiedVersionKind = "both" | "asset" | "masterdata";
export type UnifiedMatchReason = "sha" | "exact" | "band" | "timestamp";

export interface UnifiedVersionNode {
    /** Stable identifier for React keys and selection. */
    id: string;
    kind: UnifiedVersionKind;
    asset?: VersionEntry;
    masterdata?: MasterdataVersionItem;
    /** Effective timestamp in ms (newest of asset/masterdata) for chronological sorting. */
    sortTimeMs: number;
    /** Short human-readable label for timeline cards. */
    primaryLabel: string;
    /** Secondary paired label when asset and masterdata version strings differ (e.g. CN 6.4.0-24 vs 6.4.1.11). */
    secondaryLabel?: string;
    matchReason?: UnifiedMatchReason;
    /** True when the asset entry is predominantly a conversion rebuild rather than a game update. */
    isConversionRebuild: boolean;
}

export function isMasterdataDiffServer(server: string): server is MasterdataDiffServer {
    return server === "jp" || server === "en" || server === "cn";
}

function parseTimeMs(iso?: string, fallbackUnixSec?: number): number {
    if (iso) {
        const ms = Date.parse(iso);
        if (Number.isFinite(ms)) return ms;
    }
    if (fallbackUnixSec && Number.isFinite(fallbackUnixSec)) {
        return fallbackUnixSec * 1000;
    }
    return 0;
}

function parseDottedParts(ver: string): number[] | null {
    const clean = ver.trim().replace(/^v/i, "");
    const parts = clean.split(".");
    if (parts.length < 3 || parts.length > 4) return null;
    const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return nums;
}

/**
 * Extracts the trailing 12-hex-character Haruki masterdata commit SHA embedded at the end
 * of `storage.pjsk.moe` asset `published_version` strings, e.g.:
 *   - `6.4.0-23-f5aecde706fc` -> `f5aecde706fc`
 *   - `7.1.0.70-1f43d17e-0318-465d-a4ed-9ea041e0b10a-b73da47303f2` -> `b73da47303f2`
 */
export function extractEmbeddedMasterdataSha(publishedVersion: string): string | null {
    const idx = publishedVersion.lastIndexOf("-");
    if (idx < 0) return null;
    const tail = publishedVersion.slice(idx + 1).toLowerCase();
    return /^[0-9a-f]{12}$/.test(tail) ? tail : null;
}

export function isConversionDominated(entry: VersionEntry): boolean {
    const total = changeCount(entry);
    const conv = conversionCount(entry);
    if (total === undefined || conv === undefined || total <= 0) return false;
    return conv / total >= 0.8;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const TIGHT_TIMESTAMP_WINDOW_MS = 30 * MINUTE_MS;
const BAND_WINDOW_MS = 24 * HOUR_MS;

interface CandidatePair {
    assetIdx: number;
    mdIdx: number;
    priority: number; // lower is stronger match
    timeDiffMs: number;
    reason: UnifiedMatchReason;
}

/**
 * Correlates asset package versions (from storage version-history) and Haruki masterdata commits
 * into a single newest-first chronological timeline.
 *
 * Matching strategy (1-to-1 greedy by priority, then smallest time delta):
 * 1. Exact version match: `shortVersion(asset) === md.dataVersion` (e.g. `7.1.0.60`, `6.1.50.1`).
 * 2. Tight publish timestamp (<= 30 min) for non-conversion asset updates, or same 4-segment
 *    `a.b.c` + same 10-band within 24h (catches live-release race where asset extractor still
 *    referenced the previous Haruki checkout, e.g. CN `6.4.0-24` <-> `6.4.1.11` 6 min apart).
 * 3. Direct embedded 12-char Haruki commit SHA match: the `-<12hex>` suffix of `published_version`
 *    equals `md.sha.slice(0, 12)` (exact deterministic match for CN/EN/JP historical snapshots).
 */
export function buildUnifiedVersionTimeline(
    assetVersions: VersionEntry[],
    masterdataVersions: MasterdataVersionItem[],
): UnifiedVersionNode[] {
    const assetTimes = assetVersions.map((a) => parseTimeMs(a.published_at));
    const assetShorts = assetVersions.map((a) => shortVersion(a.published_version));
    const assetConvOnly = assetVersions.map((a) => isConversionDominated(a));
    const assetParts = assetShorts.map((s) => parseDottedParts(s));
    const assetEmbeddedShas = assetVersions.map((a) => extractEmbeddedMasterdataSha(a.published_version));

    const mdTimes = masterdataVersions.map((m) => parseTimeMs(m.committedAt, m.committedUnix));
    const mdParts = masterdataVersions.map((m) => parseDottedParts(m.dataVersion));
    const mdShas12 = masterdataVersions.map((m) => m.sha.slice(0, 12).toLowerCase());

    const candidates: CandidatePair[] = [];

    for (let ai = 0; ai < assetVersions.length; ai++) {
        for (let mi = 0; mi < masterdataVersions.length; mi++) {
            const aShort = assetShorts[ai];
            const mVer = masterdataVersions[mi].dataVersion.trim();
            const dt = Math.abs(assetTimes[ai] - mdTimes[mi]);
            const convPenalty = assetConvOnly[ai] ? 2 : 0;

            if (aShort === mVer) {
                candidates.push({
                    assetIdx: ai,
                    mdIdx: mi,
                    priority: 10 + convPenalty,
                    timeDiffMs: dt,
                    reason: "exact",
                });
                continue;
            }

            const ap = assetParts[ai];
            const mp = mdParts[mi];
            if (
                !assetConvOnly[ai] &&
                ap &&
                mp &&
                ap.length === 4 &&
                mp.length === 4 &&
                ap[0] === mp[0] &&
                ap[1] === mp[1] &&
                ap[2] === mp[2] &&
                Math.floor(ap[3] / 10) === Math.floor(mp[3] / 10) &&
                dt <= BAND_WINDOW_MS
            ) {
                candidates.push({
                    assetIdx: ai,
                    mdIdx: mi,
                    priority: 20,
                    timeDiffMs: dt,
                    reason: "band",
                });
                continue;
            }

            if (!assetConvOnly[ai] && assetTimes[ai] > 0 && mdTimes[mi] > 0 && dt <= TIGHT_TIMESTAMP_WINDOW_MS) {
                candidates.push({
                    assetIdx: ai,
                    mdIdx: mi,
                    priority: 25,
                    timeDiffMs: dt,
                    reason: "timestamp",
                });
                continue;
            }

            if (assetEmbeddedShas[ai] && assetEmbeddedShas[ai] === mdShas12[mi]) {
                candidates.push({
                    assetIdx: ai,
                    mdIdx: mi,
                    priority: 30 + convPenalty,
                    timeDiffMs: dt,
                    reason: "sha",
                });
            }
        }
    }

    candidates.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.timeDiffMs - b.timeDiffMs;
    });

    const matchedAsset = new Set<number>();
    const matchedMd = new Set<number>();
    const nodes: UnifiedVersionNode[] = [];

    for (const pair of candidates) {
        if (matchedAsset.has(pair.assetIdx) || matchedMd.has(pair.mdIdx)) continue;
        matchedAsset.add(pair.assetIdx);
        matchedMd.add(pair.mdIdx);

        const asset = assetVersions[pair.assetIdx];
        const md = masterdataVersions[pair.mdIdx];
        const aShort = assetShorts[pair.assetIdx];
        const sortTimeMs = Math.max(assetTimes[pair.assetIdx], mdTimes[pair.mdIdx]);
        const sameLabel = aShort === md.dataVersion;

        nodes.push({
            id: `both:${asset.published_version}+${md.sha}`,
            kind: "both",
            asset,
            masterdata: md,
            sortTimeMs,
            primaryLabel: md.dataVersion,
            secondaryLabel: sameLabel ? undefined : aShort,
            matchReason: pair.reason,
            isConversionRebuild: assetConvOnly[pair.assetIdx],
        });
    }

    for (let ai = 0; ai < assetVersions.length; ai++) {
        if (matchedAsset.has(ai)) continue;
        const asset = assetVersions[ai];
        nodes.push({
            id: `asset:${asset.published_version}`,
            kind: "asset",
            asset,
            sortTimeMs: assetTimes[ai],
            primaryLabel: assetShorts[ai],
            isConversionRebuild: assetConvOnly[ai],
        });
    }

    for (let mi = 0; mi < masterdataVersions.length; mi++) {
        if (matchedMd.has(mi)) continue;
        const md = masterdataVersions[mi];
        nodes.push({
            id: `md:${md.sha}`,
            kind: "masterdata",
            masterdata: md,
            sortTimeMs: mdTimes[mi],
            primaryLabel: md.dataVersion,
            isConversionRebuild: false,
        });
    }

    nodes.sort((a, b) => b.sortTimeMs - a.sortTimeMs);
    return nodes;
}

export function findNodeByQuery(
    nodes: UnifiedVersionNode[],
    versionParam: string,
    shaParam: string,
): UnifiedVersionNode | null {
    if (versionParam && shaParam) {
        const both = nodes.find(
            (n) =>
                n.asset?.published_version === versionParam &&
                (n.masterdata?.sha === shaParam || n.masterdata?.shortSha === shaParam),
        );
        if (both) return both;
    }
    if (shaParam) {
        const bySha = nodes.find(
            (n) => n.masterdata?.sha === shaParam || n.masterdata?.shortSha === shaParam,
        );
        if (bySha) return bySha;
    }
    if (versionParam) {
        const byVer = nodes.find(
            (n) =>
                n.asset?.published_version === versionParam ||
                (n.asset && shortVersion(n.asset.published_version) === versionParam) ||
                n.masterdata?.dataVersion === versionParam,
        );
        if (byVer) return byVer;
    }
    return null;
}
