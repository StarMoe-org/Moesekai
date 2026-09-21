import { mysekaiDatabaseHref } from "../mysekai-source";
import { molyResourceOrigin, molyResourceUrl } from "./resourceOrigin";
import type { MolyEntry, MolyKey, MolyRegion, MolyTab, MolyCharacter } from "./contract";

export const MOLY_CONTRACT_VERSION = 2;
export interface MolyRelease {
    id: string;
    module: string;
    stage: string;
    contractVersion: 2;
    resourceOrigin?: string;
    engines: Record<"webgpu" | "webgl2", { downloadBytes: number; decodedBytes: number; brotliBytes?: number; gzipBytes?: number }>;
}
export interface ResourceSnapshot {
    id: string;
    region: MolyRegion;
    version: string;
    assets: string;
    packs?: boolean;
    assetCatalog?: string;
    assetReleaseVersion?: string;
    /** Validated current release module, used only to load its static pack reader. */
    releaseModule?: string;
    catalog: string;
    available: boolean;
    unavailableReason?: string;
    provenance?: Record<string, string | number>;
    base: { downloadBytes: number; decodedBytes: number };
}
export interface RuntimeManifest {
    schemaVersion: 2;
    release: MolyRelease;
    snapshots: ResourceSnapshot[];
}
export interface CatalogEntry extends MolyEntry { detail: string; }
export interface ContentCatalog {
    schemaVersion: 1;
    snapshotId: string;
    region: MolyRegion;
    version: string;
    characters: MolyCharacter[];
    entries: CatalogEntry[];
}
export { MOLY_TABS, INITIAL_BROWSE, parseBrowse, positiveId, supportedRegion, validContentKey } from "./workspaceNavigation";
export type { BrowseState } from "./workspaceNavigation";
import { supportedRegion, validContentKey, type BrowseState } from "./workspaceNavigation";
const identity = /^[a-z0-9][a-z0-9._-]{0,95}$/;

export function interactionHref(options: { region: string; fixture?: number | null; character?: number | null; content?: MolyKey | null; tab?: MolyTab; snapshot?: string }): string {
    const query = new URLSearchParams({ region: options.region });
    if (options.fixture && Number.isSafeInteger(options.fixture) && options.fixture > 0) query.set("fixture", String(options.fixture));
    if (options.character && Number.isSafeInteger(options.character) && options.character > 0) query.set("character", String(options.character));
    if (options.tab) query.set("tab", options.tab);
    if (options.content) {
        if (!validContentKey(options.content)) throw new Error("Invalid content identity");
        query.set("content", options.content);
    }
    if (options.snapshot) query.set("snapshot", options.snapshot);
    return `/mysekai/interactions/?${query}`;
}
export function furnitureHref(region: MolyRegion, fixture: number): string {
    return mysekaiDatabaseHref(region, fixture);
}

async function readJson<T>(url: string, signal: AbortSignal | undefined, maxBytes: number, noStore = false): Promise<T> {
    const response = await fetch(url, { signal, credentials: "omit", redirect: "error", cache: noStore ? "no-store" : "force-cache" });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error(`moly_http_${response.status}`);
    const length = Number(response.headers.get("content-length"));
    if (length > maxBytes) throw new Error("moly_response_too_large");
    const text = await response.text();
    if (text.length > maxBytes) throw new Error("moly_response_too_large");
    return JSON.parse(text) as T;
}
export async function fetchRuntimeManifest(signal?: AbortSignal, pin?: { snapshot: string; region?: string | null }): Promise<RuntimeManifest> {
    if (pin && (!identity.test(pin.snapshot) || (pin.region && !supportedRegion(pin.region)))) throw new Error("moly_snapshot_invalid");
    const query = pin ? new URLSearchParams({ snapshot: pin.snapshot, ...(pin.region ? { region: pin.region } : {}) }) : null;
    const value = await readJson<RuntimeManifest>(`/moly/manifest.json${query ? `?${query}` : ""}`, signal, 1048576, true).catch(error => {
        // Keep the pinned URL so the page reports snapshotExpired rather than
        // silently selecting a different source when a history entry is absent.
        if (pin && error instanceof Error && error.message === "moly_http_404") return readJson<RuntimeManifest>("/moly/manifest.json", signal, 1048576, true);
        throw error;
    });
    if (value?.schemaVersion !== MOLY_CONTRACT_VERSION || value.release?.contractVersion !== MOLY_CONTRACT_VERSION || !identity.test(value.release.id)
        || value.release.module !== `/moly/releases/${value.release.id}/embed.mjs`
        || value.release.stage !== `/moly/releases/${value.release.id}/stage.html`
        || !Array.isArray(value.snapshots) || value.snapshots.length > 2) throw new Error("moly_manifest_invalid");
    const regions = new Set<string>();
    for (const snapshot of value.snapshots) {
        if (!identity.test(snapshot.id) || !supportedRegion(snapshot.region) || regions.has(snapshot.region)
            || (snapshot.packs !== undefined && typeof snapshot.packs !== "boolean")
            || (snapshot.packs === true ? snapshot.assets !== "/moly/asset-store/" || !/^[a-f0-9]{64}$/.test(snapshot.assetCatalog ?? "") || typeof snapshot.assetReleaseVersion !== "string" || !snapshot.assetReleaseVersion
                : snapshot.assets !== `/moly/snapshots/${snapshot.id}/assets/` || snapshot.assetCatalog !== undefined || snapshot.assetReleaseVersion !== undefined)
            || snapshot.catalog !== `/moly/snapshots/${snapshot.id}/catalog/index.json`
            || typeof snapshot.available !== "boolean") throw new Error("moly_manifest_invalid");
        regions.add(snapshot.region);
        snapshot.releaseModule = value.release.module;
    }
    // Validate logical publication identities before applying the host's exact,
    // trusted resource origin. The SDK and iframe remain on the site origin.
    value.release.resourceOrigin = molyResourceOrigin() || undefined;
    for (const snapshot of value.snapshots) {
        snapshot.assets = molyResourceUrl(snapshot.assets);
        snapshot.catalog = molyResourceUrl(snapshot.catalog);
    }
    return value;
}
export async function fetchContentCatalog(snapshot: Pick<ResourceSnapshot, "id" | "catalog" | "region" | "version">, signal?: AbortSignal): Promise<ContentCatalog> {
    const catalog = await readJson<ContentCatalog>(snapshot.catalog, signal, 32 * 1048576);
    if (catalog?.schemaVersion !== 1 || catalog.region !== snapshot.region || catalog.version !== snapshot.version || catalog.snapshotId !== snapshot.id
        || !Array.isArray(catalog.entries) || catalog.entries.length > 100000 || !Array.isArray(catalog.characters)) throw new Error("moly_catalog_mismatch");
    const seen = new Set<string>();
    for (const entry of catalog.entries) {
        if (!validContentKey(entry.key) || seen.has(entry.key) || !Array.isArray(entry.fixtureIds) || !Array.isArray(entry.unitIds)
            || typeof entry.available !== "boolean" || !entry.presentation
            || !/^entries\/[a-z0-9-]+\.json$/.test(entry.detail)) throw new Error("moly_catalog_invalid");
        seen.add(entry.key);
    }
    return catalog;
}
export async function fetchContentDetail(snapshot: Pick<ResourceSnapshot, "id" | "catalog">, entry: Pick<CatalogEntry, "key" | "detail">, signal?: AbortSignal): Promise<MolyEntry> {
    const value = await readJson<{ schemaVersion: 1; snapshotId: string; entry: MolyEntry }>(`${snapshot.catalog.slice(0, -"index.json".length)}${entry.detail}`, signal, 2 * 1048576, true);
    if (value?.schemaVersion !== 1 || value.snapshotId !== snapshot.id || value.entry?.key !== entry.key) throw new Error("moly_detail_mismatch");
    return value.entry;
}
export function resourceImage(snapshot: ResourceSnapshot, image: string | null | undefined): string | undefined {
    if (snapshot.packs) return undefined;
    if (!image) return undefined;
    const path = image.replace(/^moly:\/\//, "");
    if (path.startsWith("/") || path.includes(":") || path.includes("\\") || path.split("/").some(part => !part || part === ".." || part === ".")) return undefined;
    return snapshot.assets + path.split("/").map(encodeURIComponent).join("/");
}

// These are ordinary catalogue/search predicates over an immutable Rust
// projection. The `available` flag is never recomputed in the host. Starting
// playback always goes back through the real runtime's current admission gate.
export function filterCatalog(catalog: ContentCatalog, state: BrowseState): CatalogEntry[] {
    const tokens = state.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    // Search the same furniture relationships used by the furniture detail page.
    // Authored conversation titles usually contain the cast, not the furniture.
    const furnitureNames = new Map(catalog.entries
        .filter(entry => entry.key.startsWith("fixture:"))
        .map(entry => [Number(entry.key.slice("fixture:".length)), `${entry.title} ${entry.subtitle}`]));
    return catalog.entries.filter(entry => {
        const category = entry.presentation.category;
        const inTab = state.tab === "furniture" ? category === "furniture"
            : state.tab === "activities" ? category === "activity"
                : state.tab === "performances" ? category === "fixture_story" || category === "fixture_performance"
                    : entry.key.startsWith("talk:");
        if (!inTab || (state.fixture !== null && !entry.fixtureIds.includes(state.fixture))
            || !state.characters.every(character => entry.unitIds.includes(character))
            || (state.availability === "ready" && !entry.available)) return false;
        const search = `${entry.title} ${entry.subtitle} ${entry.key} ${entry.fixtureIds.map(id => `${id} ${furnitureNames.get(id) ?? ""}`).join(" ")} ${entry.characters.map(c => `${c.name} ${c.originalName || ""}`).join(" ")}`.toLocaleLowerCase();
        return tokens.every(token => search.includes(token.replace(/^#/, "")));
    });
}
