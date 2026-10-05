// Shared pure helpers for realtime-ranking-next.

import {
    BoardEntryWithDiffV2,
    BoardSnapshotV2,
    ChurnEntryV2,
} from "@/types/realtime-ranking-next";

/** Threshold beyond which a row is a tier line rather than a real player. */
export const TOP_PLAYER_LIMIT = 100;

export interface LastChange {
    rankDelta: number;
    scoreDelta: number;
    changedAt: number;
}

/** Decode HTML entities found in display names / signatures. */
export function decodeHtmlEntities(value: string): string {
    if (typeof window === "undefined") return value;
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
}

/** Map key for churn / lastChanges lookups: players by userId, tier lines by `tier:{rank}`. */
export function entryKey(rank: number, userId: string, isTierLine: boolean): string {
    return isTierLine ? `tier:${rank}` : userId;
}

/**
 * Build board entries enriched with live diff data.
 * TOP100 players diff by userId; tier lines (rank > 100) diff by rank position.
 * `lastChanges` is mutated in place to remember the most recent non-zero delta.
 */
export function buildEntriesWithDiff(
    snapshot: BoardSnapshotV2,
    previous: BoardSnapshotV2 | null,
    lastChanges: Map<string, LastChange>,
    scopeKey: string,
): BoardEntryWithDiffV2[] {
    const prevByUserId = new Map(previous?.entries.map((e) => [e.userId, e]) ?? []);
    const prevByRank = new Map(previous?.entries.map((e) => [e.rank, e]) ?? []);

    return snapshot.entries.map((entry) => {
        const isTierLine = entry.rank > TOP_PLAYER_LIMIT;
        const prev = isTierLine ? prevByRank.get(entry.rank) : prevByUserId.get(entry.userId);

        const rankDelta = prev && !isTierLine ? prev.rank - entry.rank : 0;
        const scoreDelta = prev ? entry.score - prev.score : 0;

        const scopedKey = isTierLine
            ? `${scopeKey}:tier:${entry.rank}`
            : `${scopeKey}:${entry.userId}`;

        if (scoreDelta !== 0 || rankDelta !== 0) {
            const existing = lastChanges.get(scopedKey);
            lastChanges.set(scopedKey, {
                scoreDelta: scoreDelta !== 0 ? scoreDelta : existing?.scoreDelta ?? 0,
                rankDelta: rankDelta !== 0 ? rankDelta : existing?.rankDelta ?? 0,
                changedAt: Date.now(),
            });
        }

        const saved = lastChanges.get(scopedKey);

        return {
            ...entry,
            displayName: decodeHtmlEntities(entry.displayName),
            signature: entry.signature ? decodeHtmlEntities(entry.signature) : entry.signature,
            previousRank: prev?.rank,
            previousScore: prev?.score,
            rankDelta,
            scoreDelta,
            isNewEntry: !prev,
            isTierLine,
            lastScoreDelta: saved?.scoreDelta,
            lastRankDelta: saved?.rankDelta,
            lastChangedAt: saved?.changedAt,
        };
    });
}

/** ISO key for the current hour, e.g. "2026-06-14T18:00:00Z". */
export function getCurrentHourKey(): string {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Find a churn entry by rank within a churn map. */
export function findChurnByRank(churn: Map<string, ChurnEntryV2>, rank: number): ChurnEntryV2 | undefined {
    for (const e of churn.values()) {
        if (e.rank === rank) return e;
    }
    return undefined;
}

/** Neighbouring tier ranks used for speed comparison. */
export function getTierRanks(rank: number): [number | null, number | null] {
    if (rank <= 10) {
        return [rank > 1 ? rank - 1 : null, rank < 10 ? rank + 1 : null];
    }
    const lower = Math.floor((rank - 1) / 10) * 10;
    const upper = Math.ceil((rank + 1) / 10) * 10;
    return [lower > 0 ? lower : null, upper <= 100 ? upper : null];
}

/** Format a score speed in k units. */
export function fmtSpeed(value: number): string {
    return `${Math.round(value / 1000)}k`;
}

/** Speed trend by comparing 20×3 projection against the actual 1h speed. */
export function getSpeedTrend(speed1h: number, speed20min3: number): "up" | "down" | "flat" {
    if (speed1h === 0 && speed20min3 === 0) return "flat";
    const ratio = speed1h > 0 ? speed20min3 / speed1h : speed20min3 > 0 ? Infinity : 1;
    if (ratio > 1.08) return "up";
    if (ratio < 0.92) return "down";
    return "flat";
}

/**
 * Sanitize recent score changes against upstream cache flapping and micro-delta burst inflation:
 * 1. Flapping de-duplication: Drops duplicate deltas occurring within < 55s (physical floor of live gameplay cycle).
 * 2. High-frequency live jitter filter: Drops impossible consecutive manual live entries occurring < 45s apart.
 * 3. Micro-delta clustering: Merges rapid consecutive non-live micro-increments (< 20s apart, e.g. MySEKAI item claims
 *    or story reward popups) into a single batch entry so they do not artificially multiply the live play round count.
 */
export function sanitizeRecentChanges<T extends { t: number; delta: number }>(changes: T[]): T[] {
    if (!changes || changes.length <= 1) return changes ? [...changes] : [];
    const sorted = [...changes].sort((a, b) => a.t - b.t);
    const result: T[] = [];

    for (const c of sorted) {
        if (result.length === 0) {
            result.push({ ...c });
            continue;
        }
        const prev = result[result.length - 1];
        const dt = c.t - prev.t;

        // 1. Exact duplicate delta within 55s (cache flapping bounce between replica nodes)
        if (c.delta === prev.delta && dt < 55_000) {
            continue;
        }

        // 2. Impossible manual live frequency (< 45s between two full lives)
        if (dt < 45_000 && prev.delta >= 35_000 && c.delta >= 35_000) {
            continue;
        }

        // 3. Cluster rapid micro-increments (< 20s apart, e.g. item harvests or reward claims)
        if (dt < 20_000 && c.delta < 25_000 && prev.delta < 25_000) {
            prev.delta += c.delta;
            prev.t = c.t;
            continue;
        }

        result.push({ ...c });
    }

    return result;
}

/** Sum positive deltas within the latest N minutes from recent_score_changes. */
export function calcRecentGrowth(changes: { t: number; delta: number }[], minutes: number): number {
    const clean = sanitizeRecentChanges(changes);
    const cutoff = Date.now() - minutes * 60 * 1000;
    return clean.filter((c) => c.t >= cutoff && c.delta > 0).reduce((acc, c) => acc + c.delta, 0);
}

/** Count positive deltas within the latest N minutes. */
export function calcRecentChurnCount(changes: { t: number; delta: number }[], minutes: number): number {
    const clean = sanitizeRecentChanges(changes);
    const cutoff = Date.now() - minutes * 60 * 1000;
    return clean.filter((c) => c.t >= cutoff && c.delta > 0).length;
}

export interface HourlyGridCell {
    hour: number;
    count: number;
    isCurrentHour: boolean;
    localLabel: string;
}

/** Expand hourly_churn into 48 hours, with the newest hour on the left. */
export function buildHourlyGridReversed(
    hourlyChurn: { hour: string; count: number }[],
): HourlyGridCell[] {
    const currentHourKey = getCurrentHourKey();
    const now = new Date();

    const churnMap = new Map<string, number>();
    for (const h of hourlyChurn) {
        churnMap.set(h.hour, h.count);
    }

    const grid: HourlyGridCell[] = [];

    for (let i = 0; i < 48; i++) {
        const t = new Date(now);
        t.setUTCHours(t.getUTCHours() - i);
        t.setUTCMinutes(0, 0, 0);
        const key = t.toISOString().replace(/\.\d{3}Z$/, "Z");
        const localT = new Date(t);
        const hourNum = localT.getHours();
        const isCurrentHour = key === currentHourKey;

        grid.push({
            hour: hourNum,
            count: churnMap.get(key) ?? 0,
            isCurrentHour,
            localLabel: `${localT.getMonth() + 1}/${localT.getDate()} ${hourNum}:00`,
        });
    }

    return grid;
}

/** Return the background color class based on count. */
export function getChurnCellColor(count: number, isCurrentHour: boolean): string {
    if (count === 0) return "bg-surface-container text-on-surface-variant ";
    if (isCurrentHour) return "bg-sky-100 text-sky-700 ";
    if (count >= 30) return "bg-rose-300 text-rose-900 ";
    if (count >= 20) return "bg-rose-200 text-rose-800 ";
    if (count >= 10) return "bg-rose-100 text-rose-700 ";
    return "bg-rose-50 text-rose-500 ";
}

