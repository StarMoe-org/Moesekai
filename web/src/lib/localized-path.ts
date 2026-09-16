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

export function replaceCurrentUrlSearchParams(params: URLSearchParams): void {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const query = params.toString();
    url.search = query ? `?${query}` : "";
    window.history.replaceState({}, "", url.toString());
}
