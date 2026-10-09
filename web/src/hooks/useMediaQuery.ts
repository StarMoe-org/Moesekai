"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * useMediaQuery — SSR-safe CSS media query subscriber powered by useSyncExternalStore.
 *
 * Why useSyncExternalStore instead of useState + useEffect or window.innerWidth:
 * - Rendering-time reads of `window.innerWidth` cause SSR/hydration divergence
 *   because the server environment lacks viewport dimensions.
 * - Initializing state with `matchMedia().matches` on the client during the first render
 *   leads to React hydration mismatch warnings (text/DOM bifurcation).
 * - Simple useEffect subscription updates one frame late, causing visible layout pops
 *   if not carefully coordinated.
 * - `useSyncExternalStore` allows explicit separation between client snapshot and
 *   server snapshot, guaranteeing that server render and client hydration snapshot
 *   stay strictly identical, and synchronously transitions on client mount.
 *
 * @param query Media query string, e.g. "(min-width: 1024px)"
 * @param serverFallback Default boolean returned during SSR and initial hydration (default: false)
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
    const subscribe = useCallback(
        (callback: () => void) => {
            if (typeof window === "undefined" || !window.matchMedia) {
                return () => {};
            }
            const mql = window.matchMedia(query);
            mql.addEventListener("change", callback);
            return () => {
                mql.removeEventListener("change", callback);
            };
        },
        [query]
    );

    const getSnapshot = useCallback(() => {
        if (typeof window === "undefined" || !window.matchMedia) {
            return serverFallback;
        }
        return window.matchMedia(query).matches;
    }, [query, serverFallback]);

    const getServerSnapshot = useCallback(() => serverFallback, [serverFallback]);

    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Specific hook for the M3 xlarge window class (min-width: 1600px).
 *
 * This is the breakpoint where the filter drawer stops floating over the
 * content and docks beside the sidebar instead. Docking any earlier leaves
 * the content column squeezed between two 18-20rem rails.
 *
 * Server fallback is false (mobile-first baseline):
 * 1. Mobile-first design principle: default assumption without client viewport info is base viewport.
 * 2. Avoids rendering desktop-specific DOM during SSR that would immediately unmount on mobile/tablet.
 * 3. Matches initial empty filter registration state (QuickFilterContext starts with hasFilters=false).
 */
// rem to match the `xlarge:` variant, which follows the browser's base font size.
export const XL_MEDIA_QUERY = "(min-width: 100rem)";

export function useIsXlScreen(): boolean {
    return useMediaQuery(XL_MEDIA_QUERY, false);
}
