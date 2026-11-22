import { SEO_PAGE_METADATA, type SeoPageKey } from "@/lib/seo-keywords";
import SEO_ROUTE_DATA from "./seo-routes-data.json";

export type SeoSitemapGroup = "main";
export type SeoChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export interface SeoRouteDefinition {
    path: string;
    pageKey?: SeoPageKey;
    priority: number;
    changefreq: SeoChangeFrequency;
    indexable: boolean;
    sitemapGroup: SeoSitemapGroup;
    excludeReason?: string;
}

type RawSeoRouteDefinition = Omit<SeoRouteDefinition, "pageKey" | "sitemapGroup"> & {
    pageKey?: SeoPageKey;
};

export const SEO_ROUTES = (SEO_ROUTE_DATA as readonly RawSeoRouteDefinition[]).map((route) => ({
    ...route,
    sitemapGroup: "main" as const,
})) satisfies SeoRouteDefinition[];

export const INDEXABLE_SEO_ROUTES = SEO_ROUTES.filter((route) => route.indexable);
export const NON_INDEXABLE_SEO_ROUTES = SEO_ROUTES.filter((route) => !route.indexable);

const BASE_ROBOTS_DISALLOW_PATHS = ["/api/"] as const;

const DYNAMIC_SEO_PAGE_KEYS = new Set<SeoPageKey>([
    "story_area_category",
    "story_area_reader",
    "story_card_reader",
    "story_event_group",
    "story_event_reader",
    "story_self_reader",
    "story_special_reader",
    "story_unit_group",
    "story_unit_reader",
]);

export function normalizeSeoPath(path: string): string {
    if (!path || path === "/") return "/";
    const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
    return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function findSeoRouteByPath(path: string): SeoRouteDefinition | undefined {
    const normalized = normalizeSeoPath(path);
    return SEO_ROUTES.find((route) => normalizeSeoPath(route.path) === normalized);
}

export function findSeoRouteByPageKey(pageKey: SeoPageKey): SeoRouteDefinition | undefined {
    return SEO_ROUTES.find((route) => route.pageKey === pageKey);
}

export function isIndexableSeoPath(path: string): boolean {
    return findSeoRouteByPath(path)?.indexable ?? true;
}

export function isIndexableSeoPage(pageKey: SeoPageKey): boolean {
    return findSeoRouteByPageKey(pageKey)?.indexable ?? true;
}

export function getRobotsDisallowPaths(): string[] {
    // Search engines must be allowed to crawl ordinary noindex pages so they
    // can observe the robots metadata. Only non-page endpoints belong here.
    return [...BASE_ROBOTS_DISALLOW_PATHS];
}

export function assertRobotsDisallowPathsAligned(paths: readonly string[] = getRobotsDisallowPaths()): void {
    for (const path of paths) {
        const normalized = normalizeSeoPath(path);
        if (BASE_ROBOTS_DISALLOW_PATHS.includes(normalized as typeof BASE_ROBOTS_DISALLOW_PATHS[number])) continue;
        assertNoIndexSeoRoute(normalized);
    }
}

export function assertNoIndexSeoRoute(path: string): SeoRouteDefinition {
    const route = findSeoRouteByPath(path);
    if (!route) {
        throw new Error(`No SEO route registry entry found for noindex path: ${path}`);
    }

    if (route.indexable) {
        throw new Error(`SEO route registry marks noindex path as indexable: ${path}`);
    }

    return route;
}

export function assertSeoRouteRegistryAligned(): void {
    const seenPaths = new Set<string>();
    const seenPageKeys = new Set<SeoPageKey>();

    for (const route of SEO_ROUTES) {
        const normalizedPath = normalizeSeoPath(route.path);

        if (seenPaths.has(normalizedPath)) {
            throw new Error(`Duplicate SEO route path in registry: ${normalizedPath}`);
        }
        seenPaths.add(normalizedPath);

        if (route.pageKey) {
            if (!SEO_PAGE_METADATA[route.pageKey]) {
                throw new Error(`SEO route registry references unknown pageKey: ${route.pageKey}`);
            }

            if (seenPageKeys.has(route.pageKey)) {
                throw new Error(`Duplicate SEO route pageKey in registry: ${route.pageKey}`);
            }
            seenPageKeys.add(route.pageKey);

            const metadataPath = normalizeSeoPath(SEO_PAGE_METADATA[route.pageKey].path);
            if (metadataPath !== normalizedPath) {
                throw new Error(`SEO route path mismatch for ${route.pageKey}: registry=${normalizedPath}, metadata=${metadataPath}`);
            }
        }

        if (!route.indexable && !route.excludeReason) {
            throw new Error(`Non-indexable SEO route needs an excludeReason: ${normalizedPath}`);
        }
    }

    for (const pageKey of Object.keys(SEO_PAGE_METADATA) as SeoPageKey[]) {
        if (!seenPageKeys.has(pageKey) && !DYNAMIC_SEO_PAGE_KEYS.has(pageKey)) {
            throw new Error(`SEO page metadata is missing a route registry entry: ${pageKey}`);
        }
    }

    assertRobotsDisallowPathsAligned();
}
