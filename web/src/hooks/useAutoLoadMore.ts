"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const AUTO_LOAD_MORE_STORAGE_KEY = "auto-load-more";
const DEFAULT_ROOT_MARGIN = "320px 0px";
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

function findScrollContainer(element: HTMLElement | null): HTMLElement | null {
    let current = element?.parentElement ?? null;
    while (current && current !== document.body && current !== document.documentElement) {
        const overflowY = window.getComputedStyle(current).overflowY;
        if (
            (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
            current.scrollHeight > current.clientHeight + 1
        ) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
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
        if (!isEnabled || !hasMore || itemCount <= 0 || !targetNode) {
            triggeredCountRef.current = null;
            return;
        }
        if (typeof IntersectionObserver === "undefined") return;

        let cancelled = false;
        let observer: IntersectionObserver | null = null;

        // Defer one frame so newly rendered items commit their layout before measuring intersection.
        const rafId = window.requestAnimationFrame(() => {
            if (cancelled) return;
            const explicitRoot = scrollRootRef?.current;
            const root = explicitRoot && explicitRoot.scrollHeight > explicitRoot.clientHeight + 1
                ? explicitRoot
                : findScrollContainer(targetNode);

            observer = new IntersectionObserver(
                (entries) => {
                    const isIntersecting = entries.some((entry) => entry.isIntersecting);
                    if (!isIntersecting) {
                        triggeredCountRef.current = null;
                        return;
                    }
                    if (triggeredCountRef.current === itemCount) return;
                    triggeredCountRef.current = itemCount;
                    onLoadMoreRef.current();
                },
                { root, rootMargin },
            );
            observer.observe(targetNode);
        });

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(rafId);
            observer?.disconnect();
        };
    }, [isEnabled, hasMore, itemCount, targetNode, rootMargin, scrollRootRef]);

    return setTargetNode;
}
