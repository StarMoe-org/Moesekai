#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { WEB_ROOT } from "./i18n-utils.mjs";

const routeDataPath = path.join(WEB_ROOT, "src/lib/seo-routes-data.json");
const seoKeywordsPath = path.join(WEB_ROOT, "src/lib/seo-keywords.ts");

const routes = JSON.parse(fs.readFileSync(routeDataPath, "utf8"));
const seoKeywordsSource = fs.readFileSync(seoKeywordsPath, "utf8");
const pageKeys = new Set([...seoKeywordsSource.matchAll(/^\s{2}([a-z0-9_]+):\s*definePage\(/gm)].map((match) => match[1]));
const dynamicPageKeys = new Set([
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

function normalizeRoutePath(routePath) {
    if (!routePath || routePath === "/") return "/";
    const withLeadingSlash = routePath.startsWith("/") ? routePath : `/${routePath}`;
    return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

const seenPaths = new Set();
const seenPageKeys = new Set();
const errors = [];

for (const route of routes) {
    const normalizedPath = normalizeRoutePath(route.path);

    if (seenPaths.has(normalizedPath)) {
        errors.push(`Duplicate SEO route path in registry: ${normalizedPath}`);
    }
    seenPaths.add(normalizedPath);

    if (!route.indexable && !route.excludeReason) {
        errors.push(`Non-indexable SEO route needs an excludeReason: ${normalizedPath}`);
    }

    if (!route.pageKey) continue;

    if (!pageKeys.has(route.pageKey)) {
        errors.push(`SEO route registry references unknown pageKey: ${route.pageKey}`);
    }

    if (seenPageKeys.has(route.pageKey)) {
        errors.push(`Duplicate SEO route pageKey in registry: ${route.pageKey}`);
    }
    seenPageKeys.add(route.pageKey);
}

for (const pageKey of pageKeys) {
    if (!seenPageKeys.has(pageKey) && !dynamicPageKeys.has(pageKey)) {
        errors.push(`SEO page metadata is missing a route registry entry: ${pageKey}`);
    }
}

for (const pageKey of dynamicPageKeys) {
    if (!pageKeys.has(pageKey)) {
        errors.push(`Dynamic SEO page key is not defined in SEO_PAGE_METADATA: ${pageKey}`);
    }
}

if (errors.length > 0) {
    console.error(`SEO route registry mismatch detected (${errors.length}):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
}

const indexableCount = routes.filter((route) => route.indexable).length;
const noindexCount = routes.length - indexableCount;
console.log(`SEO route registry OK (${indexableCount} indexable, ${noindexCount} noindex).`);
