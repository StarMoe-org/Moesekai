"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isScrollContainerActive } from "@/hooks/useAutoLoadMore";

export interface ExplorerSavedState {
    visibleCount: number;
    listScrollTop: number;
    windowScrollY: number;
}

const MAX_SAVED_VIEWS = 60;
const FLUSH_DEBOUNCE_MS = 150;
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const memoryStore = new Map<string, Map<string, ExplorerSavedState>>();
const hydratedKeys = new Set<string>();

function getStorageKey(storageKey: string): string {
    return `${storageKey}_explorer_views_v1`;
}

function getStore(storageKey: string): Map<string, ExplorerSavedState> {
    let map = memoryStore.get(storageKey);
    if (!map) {
        map = new Map<string, ExplorerSavedState>();
        memoryStore.set(storageKey, map);
    }
    if (typeof window !== "undefined" && !hydratedKeys.has(storageKey)) {
        hydratedKeys.add(storageKey);
        try {
            const raw = window.sessionStorage.getItem(getStorageKey(storageKey));
            if (raw) {
                const parsed = JSON.parse(raw) as unknown;
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        if (
                            Array.isArray(item) &&
                            typeof item[0] === "string" &&
                            item[1] &&
                            typeof item[1] === "object"
                        ) {
                            const val = item[1] as Partial<ExplorerSavedState>;
                            if (
                                typeof val.visibleCount === "number" &&
                                Number.isFinite(val.visibleCount) &&
                                val.visibleCount > 0
                            ) {
                                map.set(item[0], {
                                    visibleCount: val.visibleCount,
                                    listScrollTop: typeof val.listScrollTop === "number" && val.listScrollTop >= 0 ? val.listScrollTop : 0,
                                    windowScrollY: typeof val.windowScrollY === "number" && val.windowScrollY >= 0 ? val.windowScrollY : 0,
                                });
                            }
                        }
                    }
                }
            }
        } catch {
            // Ignore malformed or unavailable sessionStorage
        }
    }
    return map;
}

function flushStore(storageKey: string): void {
    if (typeof window === "undefined") return;
    const map = memoryStore.get(storageKey);
    if (!map) return;
    try {
        window.sessionStorage.setItem(getStorageKey(storageKey), JSON.stringify([...map.entries()]));
    } catch {
        // Ignore storage errors
    }
}

export function readExplorerSavedState(storageKey: string, viewKey: string): ExplorerSavedState | null {
    const map = getStore(storageKey);
    return map.get(viewKey) ?? null;
}

export function writeExplorerSavedState(
    storageKey: string,
    viewKey: string,
    entry: ExplorerSavedState,
    persistNow = true,
): void {
    const map = getStore(storageKey);
    // Refresh insertion order for LRU eviction.
    map.delete(viewKey);
    map.set(viewKey, entry);
    while (map.size > MAX_SAVED_VIEWS) {
        const oldestKey = map.keys().next().value;
        if (oldestKey === undefined) break;
        map.delete(oldestKey);
    }
    if (persistNow) {
        flushStore(storageKey);
    }
}

/** Clear in-memory cache for tests. */
export function resetExplorerSavedStateCache(): void {
    memoryStore.clear();
    hydratedKeys.clear();
}

export interface UseExplorerScrollRestoreOptions {
    storageKey: string;
    viewKey: string;
    filterSignature: string;
    pageSize: number;
    listScrollRef: React.RefObject<HTMLDivElement | null>;
    isReady: boolean;
}

export interface UseExplorerScrollRestoreReturn {
    visibleCount: number;
    setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
    loadMore: () => void;
    rememberScroll: () => void;
}

/**
 * Persist and restore both loaded item count (`visibleCount`) and scroll position
 * (for both the desktop split-pane list container and mobile `window` scroll)
 * per explorer `viewKey` across directory navigation and route returns.
 */
export function useExplorerScrollRestore({
    storageKey,
    viewKey,
    filterSignature,
    pageSize,
    listScrollRef,
    isReady,
}: UseExplorerScrollRestoreOptions): UseExplorerScrollRestoreReturn {
    const [visibleCount, setVisibleCount] = useState<number>(() => {
        return Math.max(pageSize, readExplorerSavedState(storageKey, viewKey)?.visibleCount ?? pageSize);
    });

    const [prevViewKey, setPrevViewKey] = useState(viewKey);
    const [prevFilterSig, setPrevFilterSig] = useState(filterSignature);

    if (viewKey !== prevViewKey) {
        setPrevViewKey(viewKey);
        setPrevFilterSig(filterSignature);
        const saved = readExplorerSavedState(storageKey, viewKey);
        setVisibleCount(Math.max(pageSize, saved?.visibleCount ?? pageSize));
    } else if (filterSignature !== prevFilterSig) {
        setPrevFilterSig(filterSignature);
        setVisibleCount(pageSize);
    }

    const lastRestoredKeyRef = useRef<string | null>(null);
    const lastFilterSigRef = useRef<string>(filterSignature);
    const isRestoringRef = useRef<boolean>(true);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const captureCurrentState = useCallback((): ExplorerSavedState => {
        const listEl = listScrollRef.current;
        const listScrollTop = listEl ? listEl.scrollTop : 0;
        const windowScrollY = typeof window !== "undefined" ? window.scrollY : 0;
        return {
            visibleCount,
            listScrollTop,
            windowScrollY,
        };
    }, [listScrollRef, visibleCount]);

    const rememberScroll = useCallback(() => {
        if (!isReady) return;
        writeExplorerSavedState(storageKey, viewKey, captureCurrentState(), true);
    }, [captureCurrentState, isReady, storageKey, viewKey]);

    const loadMore = useCallback(() => {
        setVisibleCount((prev) => prev + pageSize);
    }, [pageSize]);

    // Restore scroll position once data is ready and the restored visibleCount has rendered.
    useIsomorphicLayoutEffect(() => {
        if (!isReady) {
            isRestoringRef.current = true;
            lastRestoredKeyRef.current = null;
            return;
        }

        const listEl = listScrollRef.current;

        // Filter/search/sort changed inside the same directory: reset scroll to top and overwrite saved entry.
        if (lastRestoredKeyRef.current === viewKey) {
            if (lastFilterSigRef.current !== filterSignature) {
                lastFilterSigRef.current = filterSignature;
                if (listEl) listEl.scrollTop = 0;
                writeExplorerSavedState(
                    storageKey,
                    viewKey,
                    { visibleCount: pageSize, listScrollTop: 0, windowScrollY: typeof window !== "undefined" ? window.scrollY : 0 },
                    true,
                );
            }
            isRestoringRef.current = false;
            return;
        }

        isRestoringRef.current = true;
        const saved = readExplorerSavedState(storageKey, viewKey);
        const targetListTop = saved?.listScrollTop ?? 0;
        const targetWindowY = saved?.windowScrollY ?? 0;
        const hadPriorRestore = lastRestoredKeyRef.current !== null;

        if (listEl) {
            listEl.scrollTop = targetListTop;
        }
        const restoreWindowScroll = typeof window !== "undefined" && !isScrollContainerActive(listEl) && (saved !== null || hadPriorRestore);
        if (restoreWindowScroll) {
            window.scrollTo({ top: targetWindowY, behavior: "instant" });
        }

        lastRestoredKeyRef.current = viewKey;
        lastFilterSigRef.current = filterSignature;

        let cancelled = false;
        const rafId = window.requestAnimationFrame(() => {
            if (cancelled) return;
            const currentListEl = listScrollRef.current;
            if (currentListEl && targetListTop > 0 && Math.abs(currentListEl.scrollTop - targetListTop) > 2) {
                currentListEl.scrollTop = targetListTop;
            }
            if (restoreWindowScroll && Math.abs(window.scrollY - targetWindowY) > 2) {
                window.scrollTo({ top: targetWindowY, behavior: "instant" });
            }
            isRestoringRef.current = false;
        });

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(rafId);
        };
    }, [filterSignature, isReady, listScrollRef, pageSize, storageKey, viewKey]);

    // Continuously record scroll position & visibleCount once restoration settles.
    useEffect(() => {
        if (!isReady || typeof window === "undefined") return;

        const scheduleFlush = () => {
            if (flushTimerRef.current !== null) return;
            flushTimerRef.current = setTimeout(() => {
                flushTimerRef.current = null;
                flushStore(storageKey);
            }, FLUSH_DEBOUNCE_MS);
        };

        const recordPosition = (immediate = false) => {
            if (isRestoringRef.current || lastRestoredKeyRef.current !== viewKey) return;
            writeExplorerSavedState(storageKey, viewKey, captureCurrentState(), immediate);
            if (!immediate) {
                scheduleFlush();
            }
        };

        // Persist updated visibleCount immediately when user loads more items.
        if (!isRestoringRef.current && lastRestoredKeyRef.current === viewKey) {
            writeExplorerSavedState(storageKey, viewKey, captureCurrentState(), true);
        }

        const listEl = listScrollRef.current;
        const handleScroll = () => recordPosition(false);
        const handlePageLeave = () => recordPosition(true);

        listEl?.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("beforeunload", handlePageLeave);
        window.addEventListener("pagehide", handlePageLeave);

        return () => {
            listEl?.removeEventListener("scroll", handleScroll);
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("beforeunload", handlePageLeave);
            window.removeEventListener("pagehide", handlePageLeave);
            if (flushTimerRef.current !== null) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
            if (!isRestoringRef.current && lastRestoredKeyRef.current === viewKey) {
                flushStore(storageKey);
            }
        };
    }, [captureCurrentState, isReady, listScrollRef, storageKey, viewKey, visibleCount]);

    return {
        visibleCount,
        setVisibleCount,
        loadMore,
        rememberScroll,
    };
}
