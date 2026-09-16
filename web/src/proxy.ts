import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
    DEFAULT_ROUTE_LOCALE,
    isRouteLocale,
    uiLocaleToRouteLocale,
} from "@/lib/locale-routing";
import { resolveAcceptLanguageUiLocale, resolveUiLocale, UI_LOCALE_STORAGE_KEY } from "@/lib/i18n/locales";
import {
    CLIENT_HTML_CACHE_CONTROL,
    ORIGIN_HTML_CACHE_HEADER,
    getPublicPageCachePolicy,
} from "@/lib/page-cache-policy";
import { getPublicRequestOrigin } from "@/lib/site-origin";

export const ROUTE_LOCALE_HEADER = "x-moesekai-route-locale";
export const PUBLIC_PATH_HEADER = "x-moesekai-public-path";
const INTERNAL_LOCALE_REWRITE_HEADER = "x-moesekai-internal-locale-rewrite";
const INTERNAL_NEXT_ORIGIN = process.env.INTERNAL_NEXT_ORIGIN
    || `http://127.0.0.1:${process.env.PORT || "3000"}`;
const QUERY_PAGE_ROBOTS_POLICY = "noindex, follow";
const QUERY_PAGE_CACHE_POLICY = "private, no-store";

const BYPASS_PATHS = ["/_next", "/internal-healthz", "/api", "/data", "/moly", "/robots.txt", "/sitemap.xml", "/sitemap-main.xml", "/sitemap-details.xml", "/.well-known"];
const FILE_PATH_PATTERN = /\.[a-z0-9]+$/i;

function shouldBypass(pathname: string): boolean {
    return BYPASS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
        || FILE_PATH_PATTERN.test(pathname);
}

function preferredRouteLocale(request: NextRequest) {
    const cookieLocale = resolveUiLocale(request.cookies.get(UI_LOCALE_STORAGE_KEY)?.value);
    if (cookieLocale) return uiLocaleToRouteLocale(cookieLocale);

    const acceptedLocale = resolveAcceptLanguageUiLocale(request.headers.get("accept-language"));
    return acceptedLocale ? uiLocaleToRouteLocale(acceptedLocale) : DEFAULT_ROUTE_LOCALE;
}

function publicRedirectUrl(request: NextRequest, pathname: string): URL {
    return new URL(`${pathname}${request.nextUrl.search}`, getPublicRequestOrigin(request.nextUrl.origin));
}

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (shouldBypass(pathname)) return NextResponse.next();

    // Next.js can run proxy again for the destination of a rewrite. Without
    // this guard, /zh-cn/cards/123/ rewrites to /cards/123/ and the second
    // proxy pass redirects it straight back to /zh-cn/cards/123/, creating a
    // self-redirect loop for every localized page.
    if (request.headers.get(INTERNAL_LOCALE_REWRITE_HEADER) === "1") {
        return NextResponse.next();
    }

    const segments = pathname.split("/").filter(Boolean);
    const candidate = segments[0]?.toLowerCase();

    if (candidate && isRouteLocale(candidate)) {
        const routeLocale = candidate;
        const internalPath = `/${segments.slice(1).join("/")}${pathname.endsWith("/") && segments.length > 1 ? "/" : ""}`;
        // The public request can be HTTPS while the co-located standalone server
        // listens on loopback HTTP. Use an explicit trusted internal origin rather
        // than inheriting the public request scheme or reflecting its Host header.
        const rewriteUrl = new URL(internalPath === "//" ? "/" : internalPath, INTERNAL_NEXT_ORIGIN);
        rewriteUrl.search = request.nextUrl.search;

        const requestHeaders = new Headers(request.headers);
        requestHeaders.set(ROUTE_LOCALE_HEADER, routeLocale);
        requestHeaders.set(PUBLIC_PATH_HEADER, pathname);
        requestHeaders.set(INTERNAL_LOCALE_REWRITE_HEADER, "1");

        const response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
        const isDocumentRequest = request.method === "GET" || request.method === "HEAD";
        const hasQuery = Boolean(request.nextUrl.search);
        const isRscRequest = request.headers.get("rsc") === "1"
            || request.headers.has("next-router-state-tree")
            || request.headers.has("next-router-prefetch");

        if (isDocumentRequest && hasQuery) {
            // Filter, sort, search, pagination and share-state URLs can create an
            // unbounded number of equivalent crawl targets. Keep them usable and
            // crawlable, but consolidate indexing on the clean canonical URL that
            // page metadata already emits.
            if (!isRscRequest) response.headers.set("X-Robots-Tag", QUERY_PAGE_ROBOTS_POLICY);
            response.headers.set("Cache-Control", QUERY_PAGE_CACHE_POLICY);
        } else if (isDocumentRequest) {
            const cachePolicy = getPublicPageCachePolicy(internalPath);
            if (cachePolicy) {
                // HTML is cached only inside the current container. CDN/browser
                // revalidation prevents an old document from referencing chunks
                // removed by a later Docker deployment.
                response.headers.set("Cache-Control", CLIENT_HTML_CACHE_CONTROL);
                response.headers.set(ORIGIN_HTML_CACHE_HEADER, cachePolicy.originCacheControl);
            }
        }
        return response;
    }

    if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();

    const locale = preferredRouteLocale(request);
    const localizedPathname = pathname === "/"
        ? `/${locale}/`
        : `/${locale}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;

    // Never reflect Host or X-Forwarded-* into a Location header. Production
    // redirects use the configured canonical origin; local development accepts
    // only explicitly allowed loopback/configured hosts.
    const response = NextResponse.redirect(publicRedirectUrl(request, localizedPathname), 307);
    response.headers.append("Vary", "Cookie, Accept-Language");
    return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
