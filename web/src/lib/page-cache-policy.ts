const PUBLIC_CACHE_ROOTS = new Set([
    "about",
    "cards",
    "character",
    "comic",
    "costumes",
    "events",
    "exchanges",
    "gacha",
    "honors",
    "information",
    "live",
    "manga",
    "materials",
    "music",
    "mysekai",
    "privacy",
    "soundtrack",
    "sticker",
    "story",
    "terms",
]);

const PUBLIC_DETAIL_CACHE_ROOTS = new Set([
    "cards",
    "character",
    "costumes",
    "events",
    "exchanges",
    "gacha",
    "live",
    "manga",
    "music",
    "mysekai",
    "story",
]);

const LIST_ORIGIN_MAX_AGE_SECONDS = 3600;
const DETAIL_ORIGIN_MAX_AGE_SECONDS = 15552000; // 180 days (masterdata detail pages are immutable)
const STALE_WHILE_REVALIDATE_SECONDS = 604800;

export const CLIENT_HTML_CACHE_CONTROL = "public, max-age=60, s-maxage=3600";
export const ORIGIN_HTML_CACHE_HEADER = "X-Moesekai-Origin-Cache";

export interface PublicPageCachePolicy {
    originCacheControl: string;
    kind: "list" | "detail";
}

/**
 * Returns a shared-cache policy only for public, locale-stable HTML routes.
 * The path is the internal path after removing the explicit route locale.
 * Unknown routes deliberately remain private until they are reviewed.
 */
export function getPublicPageCachePolicy(internalPath: string): PublicPageCachePolicy | null {
    const segments = internalPath.split("/").filter(Boolean);

    if (segments.length === 0) {
        return {
            kind: "list",
            originCacheControl: formatOriginCacheControl(LIST_ORIGIN_MAX_AGE_SECONDS),
        };
    }

    const root = segments[0];
    if (!PUBLIC_CACHE_ROOTS.has(root)) return null;
    if (segments.length > 1 && !PUBLIC_DETAIL_CACHE_ROOTS.has(root)) return null;

    const kind = segments.length > 1 ? "detail" : "list";
    const maxAge = kind === "detail" ? DETAIL_ORIGIN_MAX_AGE_SECONDS : LIST_ORIGIN_MAX_AGE_SECONDS;

    return {
        kind,
        originCacheControl: formatOriginCacheControl(maxAge),
    };
}

function formatOriginCacheControl(maxAge: number): string {
    return `max-age=${maxAge}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`;
}
