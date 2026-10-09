import { DEFAULT_ROUTE_LOCALE, isRouteLocale, type RouteLocale } from "@/lib/locale-routing";

const UNLOCALIZED_PATH_PREFIXES = ["/api/", "/_next/", "/data/", "/moly/", "/robots.txt", "/sitemap"];

export function getRouteLocaleFromPathname(pathname: string | null | undefined): RouteLocale | null {
    const firstSegment = pathname?.split("/").filter(Boolean)[0]?.toLowerCase();
    return firstSegment && isRouteLocale(firstSegment) ? firstSegment : null;
}

export function stripRouteLocale(pathname: string): string {
    const routeLocale = getRouteLocaleFromPathname(pathname);
    if (!routeLocale) return pathname || "/";
    const stripped = pathname.replace(new RegExp(`^/${routeLocale}(?=/|$)`, "i"), "");
    return stripped || "/";
}

export function localizePath(path: string, locale: RouteLocale): string {
    if (!path.startsWith("/") || path.startsWith("//")) return path;
    if (UNLOCALIZED_PATH_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix))) return path;

    const [pathnameAndQuery, hash = ""] = path.split("#", 2);
    const [pathname, query = ""] = pathnameAndQuery.split("?", 2);
    const localizedPathname = `/${locale}${stripRouteLocale(pathname) === "/" ? "/" : stripRouteLocale(pathname)}`;
    return `${localizedPathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

export function localizePathForBrowser(path: string): string {
    if (typeof window === "undefined") return localizePath(path, DEFAULT_ROUTE_LOCALE);
    return localizePath(path, getRouteLocaleFromPathname(window.location.pathname) ?? DEFAULT_ROUTE_LOCALE);
}

// Safari throws a SecurityError once a page calls replaceState more than 100
// times in a short window, which a dragged filter slider reaches in seconds.
// Writes are therefore coalesced: at most one per interval, latest value wins.
const URL_REPLACE_INTERVAL_MS = 300;
let lastUrlReplaceAt = 0;
let pendingUrlReplace: { href: string; pathname: string } | null = null;
let pendingUrlReplaceTimer: ReturnType<typeof setTimeout> | undefined;

function flushUrlReplace(): void {
    pendingUrlReplaceTimer = undefined;
    const pending = pendingUrlReplace;
    pendingUrlReplace = null;
    // The page navigated away before the write was due; its URL is no longer ours.
    if (!pending || window.location.pathname !== pending.pathname) return;
    if (pending.href === window.location.href) return;
    lastUrlReplaceAt = Date.now();
    try {
        window.history.replaceState({}, "", pending.href);
    } catch {
        // Losing a URL sync must never break the page itself.
    }
}

export function replaceCurrentUrlSearchParams(params: URLSearchParams): void {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const query = params.toString();
    url.search = query ? `?${query}` : "";
    pendingUrlReplace = { href: url.toString(), pathname: url.pathname };
    if (pendingUrlReplaceTimer !== undefined) return;

    const wait = lastUrlReplaceAt + URL_REPLACE_INTERVAL_MS - Date.now();
    if (wait <= 0) flushUrlReplace();
    else pendingUrlReplaceTimer = setTimeout(flushUrlReplace, wait);
}
