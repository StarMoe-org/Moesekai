import { mysekaiDatabaseHref } from "../mysekai-source";
import type { MolyEntry, MolyKey, MolyRegion, MolyTab, MolyCharacter } from "./contract";

export const MOLY_CONTRACT_VERSION = 2;
export const MOLY_TABS = ["conversations", "furniture", "performances", "activities"] as const;
export interface MolyRelease {
    id: string;
    module: string;
    stage: string;
    contractVersion: 2;
    engines: Record<"webgpu" | "webgl2", { downloadBytes: number; decodedBytes: number }>;
}
export interface ResourceSnapshot {
    id: string;
    region: MolyRegion;
    version: string;
    assets: string;
    catalog: string;
    available: boolean;
    unavailableReason?: string;
    provenance?: Record<string, string>;
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
export interface BrowseState {
    tab: MolyTab;
    query: string;
    character: number | null;
    fixture: number | null;
    availability: "all" | "ready";
}
export const INITIAL_BROWSE: BrowseState = { tab: "conversations", query: "", character: null, fixture: null, availability: "all" };

const identity = /^[a-z0-9][a-z0-9._-]{0,95}$/;
export function supportedRegion(value: string | null | undefined): MolyRegion | null {
    return value === "cn" || value === "jp" ? value : null;
}
export function validContentKey(value: unknown): value is MolyKey {
    if (typeof value !== "string" || value.length > 160) return false;
    const parts = value.split(":");
    const numbers = parts[0] === "talk" && ["general", "fixture"].includes(parts[1]) && parts.length === 3 ? parts.slice(2)
        : parts[0] === "fixture" && parts.length === 2 ? parts.slice(1)
        : parts[0] === "activity" && ["notalk", "preaction"].includes(parts[1]) && parts.length === 4 ? parts.slice(2) : [];
    return numbers.length > 0 && numbers.every(n => /^[1-9]\d*$/.test(n) && Number(n) <= 2147483647);
}
export function positiveId(value: string | null): number | null {
    if (!value || !/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) return null;
    return Number(value);
}
export function parseBrowse(params: Pick<URLSearchParams, "get">): BrowseState {
    const tab = params.get("tab");
    return {
        tab: MOLY_TABS.includes(tab as MolyTab) ? tab as MolyTab : INITIAL_BROWSE.tab,
        query: Array.from(params.get("q") || "").slice(0, 200).join(""),
        character: positiveId(params.get("character")),
        fixture: positiveId(params.get("fixture")),
        availability: params.get("availability") === "ready" ? "ready" : "all",
    };
}

export function interactionHref(options: { region: string; fixture?: number | null; content?: MolyKey | null; tab?: MolyTab; snapshot?: string }): string {
    const query = new URLSearchParams({ region: options.region });
    if (options.fixture && Number.isSafeInteger(options.fixture) && options.fixture > 0) query.set("fixture", String(options.fixture));
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
    const response = await fetch(url, { signal, credentials: "same-origin", cache: noStore ? "no-store" : "force-cache" });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error(`moly_http_${response.status}`);
    const length = Number(response.headers.get("content-length"));
    if (length > maxBytes) throw new Error("moly_response_too_large");
    const text = await response.text();
    if (text.length > maxBytes) throw new Error("moly_response_too_large");
    return JSON.parse(text) as T;
}
export async function fetchRuntimeManifest(signal?: AbortSignal): Promise<RuntimeManifest> {
    const value = await readJson<RuntimeManifest>("/moly/manifest.json", signal, 1048576, true);
    if (value?.schemaVersion !== MOLY_CONTRACT_VERSION || value.release?.contractVersion !== MOLY_CONTRACT_VERSION || !identity.test(value.release.id)
        || value.release.module !== `/moly/releases/${value.release.id}/embed.mjs`
        || value.release.stage !== `/moly/releases/${value.release.id}/stage.html`
        || !Array.isArray(value.snapshots) || value.snapshots.length > 2) throw new Error("moly_manifest_invalid");
    const regions = new Set<string>();
    for (const snapshot of value.snapshots) {
        if (!identity.test(snapshot.id) || !supportedRegion(snapshot.region) || regions.has(snapshot.region)
            || snapshot.assets !== `/moly/snapshots/${snapshot.id}/assets/`
            || snapshot.catalog !== `/moly/snapshots/${snapshot.id}/catalog/index.json`
            || typeof snapshot.available !== "boolean") throw new Error("moly_manifest_invalid");
        regions.add(snapshot.region);
    }
    return value;
}
export async function fetchContentCatalog(snapshot: ResourceSnapshot, signal?: AbortSignal): Promise<ContentCatalog> {
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
export async function fetchContentDetail(snapshot: ResourceSnapshot, entry: CatalogEntry, signal?: AbortSignal): Promise<MolyEntry> {
    const value = await readJson<{ schemaVersion: 1; snapshotId: string; entry: MolyEntry }>(`${snapshot.catalog.slice(0, -"index.json".length)}${entry.detail}`, signal, 2 * 1048576);
    if (value?.schemaVersion !== 1 || value.snapshotId !== snapshot.id || value.entry?.key !== entry.key) throw new Error("moly_detail_mismatch");
    return value.entry;
}
export function resourceImage(snapshot: ResourceSnapshot, image: string | null | undefined): string | undefined {
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
    return catalog.entries.filter(entry => {
        const category = entry.presentation.category;
        const inTab = state.tab === "furniture" ? category === "furniture"
            : state.tab === "activities" ? category === "activity"
                : state.tab === "performances" ? category === "fixture_story" || category === "fixture_performance"
                    : entry.key.startsWith("talk:");
        if (!inTab || (state.fixture !== null && !entry.fixtureIds.includes(state.fixture))
            || (state.character !== null && !entry.unitIds.includes(state.character))
            || (state.availability === "ready" && !entry.available)) return false;
        const search = `${entry.title} ${entry.subtitle} ${entry.key} ${entry.fixtureIds.join(" ")} ${entry.characters.map(c => `${c.name} ${c.originalName || ""}`).join(" ")}`.toLocaleLowerCase();
        return tokens.every(token => search.includes(token.replace(/^#/, "")));
    });
}
