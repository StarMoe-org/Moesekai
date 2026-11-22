"use client";
import { useSyncExternalStore } from "react";

export interface EditorLayoutState {
    leftWidthPx: number;
    rightWidthPx: number;
    topSplitPct: number;
    codeSplitPct: number;
    showLeftPane: boolean;
    showRightPane: boolean;
    showBottomPane: boolean;
}

export const EDITOR_LAYOUT_LIMITS = {
    leftMin: 216,
    leftMax: 520,
    rightMin: 256,
    rightMax: 560,
    centerMin: 320,
    topMinPct: 22,
    topMaxPct: 84,
    codeMinPct: 26,
    codeMaxPct: 76,
} as const;

export const DEFAULT_EDITOR_LAYOUT: EditorLayoutState = {
    leftWidthPx: 292,
    rightWidthPx: 344,
    topSplitPct: 56,
    codeSplitPct: 52,
    showLeftPane: true,
    showRightPane: true,
    showBottomPane: true,
};

const STORAGE_KEY = "moesekai.storyMaker.editorLayout.v1";

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSnapshot: EditorLayoutState = DEFAULT_EDITOR_LAYOUT;

function clampNumber(value: unknown, min: number, max: number, fallback: number, precision = 1): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    const clamped = Math.min(max, Math.max(min, value));
    return precision === 1 ? Math.round(clamped) : Math.round(clamped * precision) / precision;
}

function normalizeLayout(raw: Partial<EditorLayoutState> | null | undefined): EditorLayoutState {
    return {
        leftWidthPx: clampNumber(raw?.leftWidthPx, EDITOR_LAYOUT_LIMITS.leftMin, EDITOR_LAYOUT_LIMITS.leftMax, DEFAULT_EDITOR_LAYOUT.leftWidthPx, 1),
        rightWidthPx: clampNumber(raw?.rightWidthPx, EDITOR_LAYOUT_LIMITS.rightMin, EDITOR_LAYOUT_LIMITS.rightMax, DEFAULT_EDITOR_LAYOUT.rightWidthPx, 1),
        topSplitPct: clampNumber(raw?.topSplitPct, EDITOR_LAYOUT_LIMITS.topMinPct, EDITOR_LAYOUT_LIMITS.topMaxPct, DEFAULT_EDITOR_LAYOUT.topSplitPct, 10),
        codeSplitPct: clampNumber(raw?.codeSplitPct, EDITOR_LAYOUT_LIMITS.codeMinPct, EDITOR_LAYOUT_LIMITS.codeMaxPct, DEFAULT_EDITOR_LAYOUT.codeSplitPct, 10),
        showLeftPane: typeof raw?.showLeftPane === "boolean" ? raw.showLeftPane : DEFAULT_EDITOR_LAYOUT.showLeftPane,
        showRightPane: typeof raw?.showRightPane === "boolean" ? raw.showRightPane : DEFAULT_EDITOR_LAYOUT.showRightPane,
        showBottomPane: typeof raw?.showBottomPane === "boolean" ? raw.showBottomPane : DEFAULT_EDITOR_LAYOUT.showBottomPane,
    };
}

function readSnapshot(): EditorLayoutState {
    if (typeof window === "undefined") return DEFAULT_EDITOR_LAYOUT;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === cachedRaw) return cachedSnapshot;
        cachedRaw = raw;
        if (!raw) {
            cachedSnapshot = DEFAULT_EDITOR_LAYOUT;
            return cachedSnapshot;
        }
        const parsed = JSON.parse(raw) as Partial<EditorLayoutState>;
        cachedSnapshot = normalizeLayout(parsed);
        return cachedSnapshot;
    } catch {
        return cachedSnapshot;
    }
}

function getServerSnapshot(): EditorLayoutState {
    return DEFAULT_EDITOR_LAYOUT;
}

function emit(): void {
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function updateEditorLayout(
    patch: Partial<EditorLayoutState> | ((prev: EditorLayoutState) => EditorLayoutState),
): void {
    const current = readSnapshot();
    const next = normalizeLayout(typeof patch === "function" ? patch(current) : { ...current, ...patch });
    const serialized = JSON.stringify(next);
    cachedRaw = serialized;
    cachedSnapshot = next;
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(STORAGE_KEY, serialized);
        } catch {
            // Ignore quota/private-mode storage errors.
        }
    }
    emit();
}

export function resetEditorLayout(): void {
    const serialized = JSON.stringify(DEFAULT_EDITOR_LAYOUT);
    cachedRaw = serialized;
    cachedSnapshot = DEFAULT_EDITOR_LAYOUT;
    if (typeof window !== "undefined") {
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch {
            // Ignore private-mode storage errors.
        }
    }
    emit();
}

export function useEditorLayout(): EditorLayoutState {
    return useSyncExternalStore(subscribe, readSnapshot, getServerSnapshot);
}
