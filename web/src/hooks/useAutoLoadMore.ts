"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const AUTO_LOAD_MORE_STORAGE_KEY = "auto-load-more";
const DEFAULT_ROOT_MARGIN = "320px 0px";
const DEFAULT_MARGIN_PX = 320;
const listeners = new Set<() => void>();

function readAutoLoadMorePreference(): boolean {
    if (typeof window === "undefined") return true;
    try {
        return window.localStorage.getItem(AUTO_LOAD_MORE_STORAGE_KEY) !== "false";
    } catch {
        return true;
    }
}

/** Read the persisted auto-load-more preference (defaults to enabled). */
export function getAutoLoadMoreEnabled(): boolean {
    return readAutoLoadMorePreference();
}

/** Persist and broadcast changes to the global auto-load-more preference. */
export function setAutoLoadMoreEnabled(enabled: boolean): void {
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(AUTO_LOAD_MORE_STORAGE_KEY, String(enabled));
        } catch {
            // Ignore storage errors (private mode / quota exceeded)
        }
    }
    for (const listener of listeners) {
        listener();
    }
}

function subscribeAutoLoadMore(callback: () => void): () => void {
    listeners.add(callback);
    if (typeof window === "undefined") {
        return () => {
            listeners.delete(callback);
        };
    }
    const handleStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === AUTO_LOAD_MORE_STORAGE_KEY) {
            callback();
        }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
        listeners.delete(callback);
        window.removeEventListener("storage", handleStorage);
    };
}

/** Subscribe to the global auto-load-more preference with SSR-safe hydration. */
export function useAutoLoadMoreEnabled(): boolean {
    return useSyncExternalStore(subscribeAutoLoadMore, readAutoLoadMorePreference, () => true);
}

/**
 * Determine whether an element is an active constrained scroll container rather
 * than a full-height mobile wrapper whose scroll is handled by `window`.
 */
export function isScrollContainerActive(element: HTMLElement | null): boolean {
    if (!element || typeof window === "undefined") return false;
    const overflowY = window.getComputedStyle(element).overflowY;
    if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") {
        return false;
    }
    if (element.scrollHeight <= element.clientHeight + 2) {
        return false;
    }
    return element.clientHeight < window.innerHeight - 1 || element.scrollHeight > element.clientHeight + 32;
}

function findScrollContainer(element: HTMLElement | null): HTMLElement | null {
    let current = element?.parentElement ?? null;
    while (current && current !== document.body && current !== document.documentElement) {
        if (isScrollContainerActive(current)) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

function parseTopBottomMarginPx(rootMargin: string): number {
    const firstToken = rootMargin.trim().split(/\s+/)[0] ?? "";
    const parsed = Number.parseFloat(firstToken);
    return Number.isFinite(parsed) ? parsed : DEFAULT_MARGIN_PX;
}

export interface UseAutoLoadMoreOptions {
    hasMore: boolean;
    onLoadMore: () => void;
    /** Number of currently rendered items; re-evaluates intersection after each batch renders. */
    itemCount: number;
    /** Explicit override for the global auto-load preference. */
    enabled?: boolean;
    /** Margin around the scroll root to preload ahead of reaching the bottom. */
    rootMargin?: string;
    /** Optional explicit scroll container ref (otherwise auto-detected). */
    scrollRootRef?: React.RefObject<HTMLElement | null>;
    /** Re-arms and re-evaluates when switching directories, views, or filters even if `itemCount` stays equal. */
    resetKey?: string | number;
}

/**
 * Observe a bottom sentinel element and automatically invoke `onLoadMore`
 * when it approaches the bottom of the viewport or nearest scrollable container.
 */
export function useAutoLoadMore<T extends HTMLElement = HTMLDivElement>({
    hasMore,
    onLoadMore,
    itemCount,
    enabled,
    rootMargin = DEFAULT_ROOT_MARGIN,
    scrollRootRef,
    resetKey,
}: UseAutoLoadMoreOptions): React.RefCallback<T> {
    const [targetNode, setTargetNode] = useState<T | null>(null);
    const globalEnabled = useAutoLoadMoreEnabled();
    const isEnabled = enabled ?? globalEnabled;

    const onLoadMoreRef = useRef(onLoadMore);
    useEffect(() => {
        onLoadMoreRef.current = onLoadMore;
    }, [onLoadMore]);

    const triggeredCountRef = useRef<number | null>(null);

    useEffect(() => {
        triggeredCountRef.current = null;
        if (!isEnabled || !hasMore || itemCount <= 0 || !targetNode) {
            return;
        }
        if (typeof IntersectionObserver === "undefined") return;

        let cancelled = false;
        let observer: IntersectionObserver | null = null;
        let removeListeners: (() => void) | null = null;
        let scrollCheckRaf: number | null = null;

        const triggerLoadMore = () => {
            if (cancelled || triggeredCountRef.current === itemCount) return;
            triggeredCountRef.current = itemCount;
            onLoadMoreRef.current();
        };

        const marginPx = parseTopBottomMarginPx(rootMargin);

        // Defer one frame so newly rendered items commit their layout before measuring intersection.
        const rafId = window.requestAnimationFrame(() => {
            if (cancelled) return;
            const explicitRoot = scrollRootRef?.current ?? null;
            const root = explicitRoot && isScrollContainerActive(explicitRoot)
                ? explicitRoot
                : findScrollContainer(targetNode);

            const checkNearBottom = () => {
                if (cancelled || triggeredCountRef.current === itemCount) return;
                const rect = targetNode.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return;
                if (root) {
                    const rootRect = root.getBoundingClientRect();
                    if (rect.top <= rootRect.bottom + marginPx && rect.bottom >= rootRect.top - marginPx) {
                        triggerLoadMore();
                    }
                } else if (rect.top <= window.innerHeight + marginPx && rect.bottom >= -marginPx) {
                    triggerLoadMore();
                }
            };

            observer = new IntersectionObserver(
                (entries) => {
                    const isIntersecting = entries.some((entry) => entry.isIntersecting);
                    if (!isIntersecting) {
                        triggeredCountRef.current = null;
                        return;
                    }
                    triggerLoadMore();
                },
                { root, rootMargin },
            );
            observer.observe(targetNode);

            // Passive scroll fallback in case nested overflow containers skip an intersection edge.
            const handleScrollOrResize = () => {
                if (scrollCheckRaf !== null) return;
                scrollCheckRaf = window.requestAnimationFrame(() => {
                    scrollCheckRaf = null;
                    checkNearBottom();
                });
            };
            const scrollTarget = root ?? window;
            scrollTarget.addEventListener("scroll", handleScrollOrResize, { passive: true });
            window.addEventListener("resize", handleScrollOrResize, { passive: true });
            removeListeners = () => {
                scrollTarget.removeEventListener("scroll", handleScrollOrResize);
                window.removeEventListener("resize", handleScrollOrResize);
            };
            checkNearBottom();
        });

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(rafId);
            if (scrollCheckRaf !== null) {
                window.cancelAnimationFrame(scrollCheckRaf);
            }
            observer?.disconnect();
            removeListeners?.();
        };
    }, [isEnabled, hasMore, itemCount, targetNode, rootMargin, scrollRootRef, resetKey]);

    return setTargetNode;
}
