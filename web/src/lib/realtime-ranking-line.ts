// ============================================================================
// Data line (API host) selection for the realtime ranking pages.
//
// Both /realtime-ranking (legacy) and /realtime-ranking-next share a single
// "data line" preference. Only the API host differs between lines; all paths
// are identical.
//
//   main (default): rks.exmeaning.com   / rks-n.exmeaning.com
//   global:         rks.pjsk.moe        / rks-n.pjsk.moe
//
// The preference is persisted in localStorage and exposed as a tiny external
// store so that components/hooks can subscribe and re-fetch on change.
// ============================================================================

import { useSyncExternalStore } from "react";
import { RealtimeRankingRegion } from "@/types/realtime-ranking";

export type RealtimeRankingLine = "main" | "global";

export const REALTIME_RANKING_LINE_OPTIONS: readonly RealtimeRankingLine[] = ["main", "global"];

const DEFAULT_LINE: RealtimeRankingLine = "main";
const STORAGE_KEY = "realtime-ranking:line";

export function isSingleMainLineRegion(region: RealtimeRankingRegion | string | null | undefined): boolean {
    return region === "cn" || region === "kr";
}

export function getAvailableLines(region?: RealtimeRankingRegion): readonly RealtimeRankingLine[] {
    if (region && isSingleMainLineRegion(region)) {
        return ["main"];
    }
    return REALTIME_RANKING_LINE_OPTIONS;
}

export function getEffectiveLine(line: RealtimeRankingLine, region?: RealtimeRankingRegion): RealtimeRankingLine {
    if (region && isSingleMainLineRegion(region)) {
        return "main";
    }
    return line;
}

interface LineHosts {
    /** Legacy v1 host (rks.*). */
    legacy: string;
    /** Next v2 host (rks-n.*). */
    next: string;
}

const LINE_HOSTS: Record<RealtimeRankingLine, LineHosts> = {
    main: {
        legacy: "https://rks.exmeaning.com",
        next: "https://rks-n.exmeaning.com",
    },
    global: {
        legacy: "https://rks.pjsk.moe",
        next: "https://rks-n.pjsk.moe",
    },
};

export function isRealtimeRankingLine(value: unknown): value is RealtimeRankingLine {
    return REALTIME_RANKING_LINE_OPTIONS.some((option) => option === value);
}

function readInitialLine(): RealtimeRankingLine {
    if (typeof window === "undefined") return DEFAULT_LINE;
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        return isRealtimeRankingLine(saved) ? saved : DEFAULT_LINE;
    } catch {
        return DEFAULT_LINE;
    }
}

let currentLine: RealtimeRankingLine = readInitialLine();
const listeners = new Set<() => void>();

export function getRealtimeRankingLine(): RealtimeRankingLine {
    return currentLine;
}

export function setRealtimeRankingLine(line: RealtimeRankingLine): void {
    if (!isRealtimeRankingLine(line) || line === currentLine) return;
    currentLine = line;
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(STORAGE_KEY, line);
        } catch {
            // ignore storage failures (private mode, etc.)
        }
    }
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function stripTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

/** Legacy v1 API base, honouring the env override when present. */
export function getLegacyApiBase(): string {
    const override = process.env.NEXT_PUBLIC_REALTIME_RANKING_API_BASE;
    if (override) return stripTrailingSlash(override);
    return `${LINE_HOSTS[currentLine].legacy}/api/public`;
}

/** Next v2 API base, honouring the env override when present. */
export function getNextApiBase(region?: RealtimeRankingRegion): string {
    const override = process.env.NEXT_PUBLIC_REALTIME_RANKING_V2_API_BASE;
    if (override) return stripTrailingSlash(override);
    // cn/kr are collected by the same hub as jp/en/tw since 2026-11-20, so they
    // share the main line's host (they still offer only the main line).
    return `${LINE_HOSTS[getEffectiveLine(currentLine, region)].next}/api/public/v2`;
}

/** React hook: subscribe to the current data line. */
export function useRealtimeRankingLine(): RealtimeRankingLine {
    return useSyncExternalStore(subscribe, getRealtimeRankingLine, () => DEFAULT_LINE);
}
