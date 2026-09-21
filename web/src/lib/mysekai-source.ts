import type { ServerSourceType } from "@/contexts/ThemeContext";

/** A furniture ID is meaningful only together with its actual masterdata server. */
export function mysekaiSource(value: string | null, fallback: ServerSourceType): ServerSourceType | null {
    if (value === null) return fallback;
    return ["cn", "jp", "en", "tw", "kr"].includes(value) ? value as ServerSourceType : null;
}

/**
 * `defaultRegion` is the region the target page would resolve on its own. When
 * it already matches, the pin is dropped: a query string makes the page
 * `noindex` and `private, no-store` (see `proxy.ts`), so carrying a redundant
 * one would cost every furniture page its cached, indexable URL.
 */
export function mysekaiDatabaseHref(region: ServerSourceType, fixtureId?: number, defaultRegion?: ServerSourceType): string {
    if (fixtureId !== undefined && (!Number.isSafeInteger(fixtureId) || fixtureId <= 0)) throw new Error("Invalid furniture identity");
    const path = fixtureId === undefined ? "/mysekai/" : `/mysekai/${fixtureId}/`;
    return region === defaultRegion ? path : `${path}?region=${region}`;
}
