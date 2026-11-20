// ============================================================================
// Data line (API host) selection for the realtime ranking pages (/realtime-ranking-next).
//
//   main (default): https://rks-n.exmeaning.com
//   global:         https://rks-n.pjsk.moe
//
// All five regions (cn, jp, tw, kr, en) share the same line selector.
// The preference is persisted in localStorage and exposed as a tiny external
// store so that components/hooks can subscribe and re-fetch on change.
// ============================================================================

import { useSyncExternalStore } from "react";

export type RealtimeRankingLine = "main" | "global";

export const REALTIME_RANKING_LINE_OPTIONS: readonly RealtimeRankingLine[] = ["main", "global"];

const DEFAULT_LINE: RealtimeRankingLine = "main";
const STORAGE_KEY = "realtime-ranking:line";

const NEXT_LINE_HOSTS: Record<RealtimeRankingLine, string> = {
    main: "https://rks-n.exmeaning.com",
    global: "https://rks-n.pjsk.moe",
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

/** Next v2 API base, honouring the env override when present. */
export function getNextApiBase(): string {
    const override = process.env.NEXT_PUBLIC_REALTIME_RANKING_V2_API_BASE;
    if (override) return stripTrailingSlash(override);
    return `${NEXT_LINE_HOSTS[currentLine]}/api/public/v2`;
}

/** React hook: subscribe to the current data line. */
export function useRealtimeRankingLine(): RealtimeRankingLine {
    return useSyncExternalStore(subscribe, getRealtimeRankingLine, () => DEFAULT_LINE);
}
