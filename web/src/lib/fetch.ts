/**
 * Fetch utilities with compression header support
 * Ensures requests include Accept-Encoding: gzip, deflate, br, zstd
 * 
 * Runtime (Client): Uses selected master server (jp or cn)
 * 
 * IndexedDB caching: Runtime masterdata is cached in IndexedDB with version-aware
 * invalidation. Cache is transparent to all callers of fetchMasterData().
 */

import { MOE_BGM_DURATIONS_URL, MOE_MUSIC_META_URL } from "./assets";
import { getMasterDataCache, setMasterDataCache, isIndexedDBAvailable, MASTERDATA_CACHE_GLOBAL_SCOPE } from "./masterdata-cache";
import { defaultContentRegionForPathname } from "./locale-routing";
import { applyMasterdataPatches, patchFileForPath } from "./masterdata-patches";
import type { IMusicMeta } from "@/types/music";

// Server source type
export type ServerSourceType = "en" | "jp" | "cn" | "tw" | "kr";

/**
 * Get current server from localStorage (client-side only)
 */
function getCurrentServer(): ServerSourceType {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return "cn";
    try {
        const saved = localStorage.getItem("server-source");
        if (saved === "en" || saved === "jp" || saved === "cn" || saved === "tw" || saved === "kr") return saved;
        return defaultContentRegionForPathname(window?.location?.pathname);
    } catch {
        return "cn";
    }
}

/**
 * Get current master data version from localStorage
 * Used to ensure we fetch data matching the currently active version (cache persistence)
 */
function getLocalVersion(): string | null {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
    try {
        return localStorage.getItem(MASTERDATA_VERSION_KEY);
    } catch {
        return null;
    }
}

/**
 * Get current asset source from localStorage (client-side only)
 */
function getCurrentAssetSource(): "main" | "overseas" {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return "main";
    try {
        const saved = localStorage.getItem("asset-source");
        if (saved === "overseas" || saved?.startsWith("overseas")) {
            return "overseas";
        }
        return "main";
    } catch {
        return "main";
    }
}

/**
 * Get master base URL for runtime (respects server selection)
 */
function getMasterBaseUrl(server?: ServerSourceType): string {
    const domain = getCurrentAssetSource() === "overseas" ? "metadata.pjsk.moe" : "metadata.exmeaning.com";
    const targetServer = server || getCurrentServer();
    return `https://${domain}/${targetServer}/master`;
}

/**
 * Get fallback master base URL for runtime (respects server selection)
 * Used when primary server fails (e.g., ISP blocking)
 */
function getFallbackMasterBaseUrl(server?: ServerSourceType): string {
    const domain = getCurrentAssetSource() === "overseas" ? "metadata.exmeaning.com" : "metadata.pjsk.moe";
    const targetServer = server || getCurrentServer();
    return `https://${domain}/${targetServer}/master`;
}

/**
 * Get version URL for runtime (respects server selection)
 */
function getVersionUrl(): string {
    const domain = getCurrentAssetSource() === "overseas" ? "metadata.pjsk.moe" : "metadata.exmeaning.com";
    return `https://${domain}/${getCurrentServer()}/versions/current_version.json`;
}

/**
 * Get fallback version URL for runtime (respects server selection)
 * Used when primary server fails (e.g., ISP blocking)
 */
function getFallbackVersionUrl(): string {
    const domain = getCurrentAssetSource() === "overseas" ? "metadata.exmeaning.com" : "metadata.pjsk.moe";
    return `https://${domain}/${getCurrentServer()}/versions/current_version.json`;
}



// Version info type
export interface VersionInfo {
    dataVersion: string;
    assetVersion: string;
    appVersion: string;
    assetHash: string;
    appHash: string;
}

/**
 * Fetch wrapper (compression is handled automatically by the browser)
 */
export async function fetchWithCompression(
    url: string,
    options?: RequestInit
): Promise<Response> {
    return fetch(url, options);
}

// Session storage key for cache bypass flag
const CACHE_BYPASS_KEY = "masterdata-cache-bypass";

/**
 * Set the cache bypass flag (call when _refresh param is detected)
 * This must be called BEFORE cleaning the URL param
 */
export function setCacheBypassFlag(): void {
    if (typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
        try {
            sessionStorage.setItem(CACHE_BYPASS_KEY, 'true');
        } catch { /* ignore */ }
    }
}

/**
 * Check if we should bypass cache
 * Uses sessionStorage flag that was set by MasterDataContext
 */
function shouldBypassCache(): boolean {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") return false;
    try {
        return sessionStorage.getItem(CACHE_BYPASS_KEY) === 'true';
    } catch {
        return false;
    }
}

/**
 * Clear the cache bypass flag (call after all data is loaded)
 */
export function clearCacheBypassFlag(): void {
    if (typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
        try {
            sessionStorage.removeItem(CACHE_BYPASS_KEY);
        } catch { /* ignore */ }
    }
}

/**
 * Fetch master data from the runtime server
 * Uses sekaimaster.exmeaning.com with fallback to sk.exmeaning.com
 * @param path - Path relative to master directory (e.g., "gachas.json", "cards.json")
 * @param noCache - If true, bypass browser cache by adding timestamp
 */
export async function fetchMasterData<T>(
    path: string,
    noCache: boolean = false,
    server?: ServerSourceType
): Promise<T> {
    const activeServer = server || getCurrentServer();
    // musicCategories.json is only present on JP server; other servers store categories inline in musics.json.
    // Short-circuit to avoid unnecessary requests that 404 and trigger browser CORS warnings.
    if ((path === "musicCategories.json" || path.endsWith("/musicCategories.json")) && activeServer !== "jp") {
        return [] as unknown as T;
    }
    const isCustomServer = Boolean(server && server !== getCurrentServer());
    // Auto-detect if we need to bypass cache (after version sync refresh)
    const shouldNoCache = noCache || shouldBypassCache();
    const fetchOptions: RequestInit = shouldNoCache ? { cache: "no-store" } : {};

    // Determine query parameters
    const params = new URLSearchParams();

    // 1. Version param (persistence enforcement)
    const localVersion = getLocalVersion();
    if (localVersion) {
        params.append("v", localVersion);
    }

    // 2. Cache buster (bypass enforcement)
    if (shouldNoCache) {
        params.append("_t", Date.now().toString());
    }

    const queryString = params.toString() ? `?${params.toString()}` : "";

    // ===== IndexedDB Cache Layer =====
    if (!isCustomServer && isIndexedDBAvailable() && localVersion) {
        // Try reading from IndexedDB (skip if force-refreshing)
        if (!shouldNoCache) {
            try {
                const cached = await getMasterDataCache<T>(activeServer, path, localVersion);
                if (cached !== null) {
                    // Apply post-patches on the cached (original) payload
                    const file = patchFileForPath(path);
                    if (file !== null) {
                        return applyMasterdataPatches(file, activeServer, cached);
                    }
                    return cached;
                }
            } catch {
                // IndexedDB read failed, fall through to network
            }
        }
    }

    // Runtime: try primary server first, then fallback
    const primaryUrl = `${getMasterBaseUrl(activeServer)}/${path}${queryString}`;
    try {
        const response = await fetchWithCompression(primaryUrl, fetchOptions);
        if (response.ok) {
            const data: T = await response.json();
            // Write RAW data to IndexedDB cache (patches stay ephemeral)
            if (!isCustomServer && isIndexedDBAvailable() && localVersion) {
                setMasterDataCache(activeServer, path, data, localVersion).catch(() => { });
            }
            const file = patchFileForPath(path);
            if (file !== null) {
                return applyMasterdataPatches(file, activeServer, data);
            }
            return data;
        }
        // Primary failed with non-ok status, try fallback
        console.warn(`[MasterData] Primary server failed for ${path}, trying fallback...`);
    } catch (error) {
        // Primary failed with network error (e.g., ISP blocking), try fallback
        console.warn(`[MasterData] Primary server unreachable for ${path}, trying fallback...`, error);
    }

    // Try fallback server
    const fallbackUrl = `${getFallbackMasterBaseUrl(activeServer)}/${path}${queryString}`;
    const fallbackResponse = await fetchWithCompression(fallbackUrl, fetchOptions);
    if (!fallbackResponse.ok) {
        throw new Error(`Failed to fetch master data: ${path} (both primary and fallback servers failed)`);
    }
    console.log(`[MasterData] Successfully fetched ${path} from fallback server`);
    const fallbackData: T = await fallbackResponse.json();

    // Write RAW data to IndexedDB cache
    if (!isCustomServer && isIndexedDBAvailable() && localVersion) {
        setMasterDataCache(activeServer, path, fallbackData, localVersion).catch(() => { });
    }

    const fallbackFile = patchFileForPath(path);
    if (fallbackFile !== null) {
        return applyMasterdataPatches(fallbackFile, activeServer, fallbackData);
    }
    return fallbackData;
}

/**
 * Fetch multiple master data files in parallel
 * @param paths - Array of paths relative to master directory
 */
export async function fetchMultipleMasterData<T extends unknown[]>(
    paths: string[]
): Promise<T> {
    const results = await Promise.all(
        paths.map((path) => fetchMasterData(path))
    );
    return results as T;
}

/**
 * Fetch current version info with fallback support
 */
export async function fetchVersionInfo(): Promise<VersionInfo> {
    // Try primary server first
    try {
        const response = await fetchWithCompression(getVersionUrl());
        if (response.ok) {
            return await response.json();
        }
        console.warn(`[VersionInfo] Primary server failed, trying fallback...`);
    } catch (error) {
        console.warn(`[VersionInfo] Primary server unreachable, trying fallback...`, error);
    }

    // Try fallback server
    const fallbackResponse = await fetchWithCompression(getFallbackVersionUrl());
    if (!fallbackResponse.ok) {
        throw new Error("Failed to fetch version info (both primary and fallback servers failed)");
    }
    console.log(`[VersionInfo] Successfully fetched from fallback server`);
    return await fallbackResponse.json();
}

/**
 * Fetch current version info with no cache (bypasses browser cache entirely)
 * Used for version comparisons to detect data updates
 * Includes fallback support for ISP blocking scenarios
 */
export async function fetchVersionInfoNoCache(): Promise<VersionInfo> {
    // Add timestamp to URL to bypass CDN and browser cache
    const cacheBuster = `?_t=${Date.now()}`;

    // Try primary server first
    try {
        const noCacheUrl = `${getVersionUrl()}${cacheBuster}`;
        // Use simple fetch without custom headers to avoid CORS preflight issues
        const response = await fetch(noCacheUrl, {
            cache: "no-store",
        });
        if (response.ok) {
            return await response.json();
        }
        console.warn(`[VersionInfo] Primary server failed (no-cache), trying fallback...`);
    } catch (error) {
        console.warn(`[VersionInfo] Primary server unreachable (no-cache), trying fallback...`, error);
    }

    // Try fallback server
    const fallbackUrl = `${getFallbackVersionUrl()}${cacheBuster}`;
    const fallbackResponse = await fetch(fallbackUrl, {
        cache: "no-store",
    });
    if (!fallbackResponse.ok) {
        throw new Error("Failed to fetch version info (no-cache) (both primary and fallback servers failed)");
    }
    console.log(`[VersionInfo] Successfully fetched (no-cache) from fallback server`);
    return await fallbackResponse.json();
}

// Local storage key for cached version
export const MASTERDATA_VERSION_KEY = "masterdata-version";

/**
 * Fetch master data for a specific game server (cn/jp/tw/kr/en)
 * Unlike fetchMasterData(), this does NOT use the global localStorage server setting.
 * Used by features that need server-specific masterdata (e.g., card progress page).
 *
 * NOTE: Intentionally bypasses IndexedDB cache because this targets a specific server
 * independent of the global version, so the version-keyed cache would be incorrect.
 */
export async function fetchMasterDataForServer<T>(server: "cn" | "jp" | "tw" | "kr" | "en", path: string): Promise<T> {
    // musicCategories.json is only present on JP server; other servers store categories inline in musics.json.
    if ((path === "musicCategories.json" || path.endsWith("/musicCategories.json")) && server !== "jp") {
        return [] as unknown as T;
    }

    // Add version param to avoid stale browser/CDN cache
    const localVersion = getLocalVersion();
    const query = localVersion ? `?v=${encodeURIComponent(localVersion)}` : "";

    const file = patchFileForPath(path);

    const primaryUrl = `${getMasterBaseUrl(server)}/${path}${query}`;
    try {
        const response = await fetchWithCompression(primaryUrl);
        if (response.ok) {
            const data: T = await response.json();
            return file !== null ? applyMasterdataPatches(file, server, data) : data;
        }
    } catch { /* fall through */ }

    const fallbackUrl = `${getFallbackMasterBaseUrl(server)}/${path}${query}`;
    const fallbackResponse = await fetchWithCompression(fallbackUrl);
    if (!fallbackResponse.ok) {
        throw new Error(`Failed to fetch ${path} for server ${server}`);
    }
    const fallbackData: T = await fallbackResponse.json();
    return file !== null ? applyMasterdataPatches(file, server, fallbackData) : fallbackData;
}


// ==================== Manga Data Fetching ====================

export const MANGA_JSON_URL = "https://moe.exmeaning.com/mangas/mangas.json";

/**
 * Fetch official 4-panel manga list from exmeaning CDN
 * This bypasses the standard sekaimaster runtime cache but still uses basic compression
 */
export async function fetchMangaData<T>(): Promise<T> {
    const response = await fetchWithCompression(MANGA_JSON_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch manga data: HTTP ${response.status}`);
    }
    return response.json();
}

// ==================== Bilibili Data Fetching ====================

export const BILIBILI_EVENTS_JSON_URL = "https://moe.exmeaning.com/data/event_bvid/events_bilibili.json";

/**
 * Fetch Bilibili video mapping for events
 */
export async function fetchBilibiliEventsData<T>(): Promise<T> {
    const response = await fetchWithCompression(BILIBILI_EVENTS_JSON_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch Bilibili events data: HTTP ${response.status}`);
    }
    return response.json();
}

// ==================== BGM Duration Data Fetching ====================

/**
 * Fetch BGM duration metadata from the Moe static CDN.
 * This supplements soundtrack masterdata with unreleased/extra BGM candidates.
 */
export async function fetchBgmDurationsData<T>(): Promise<T> {
    const response = await fetchWithCompression(MOE_BGM_DURATIONS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch BGM duration data: HTTP ${response.status}`);
    }
    return response.json();
}

// ==================== Music Metas Data Fetching ====================

let musicMetasInFlightPromise: Promise<IMusicMeta[]> | null = null;
let cachedMusicMetasMemory: IMusicMeta[] | null = null;

/**
 * Fetch music metas with in-flight deduplication, memory cache, and IndexedDB persistence.
 * Prevents duplicate downloads across components and workers.
 */
export async function fetchMusicMetas(noCache: boolean = false): Promise<IMusicMeta[]> {
    if (!noCache && cachedMusicMetasMemory) {
        return cachedMusicMetasMemory;
    }

    if (!noCache && musicMetasInFlightPromise) {
        return musicMetasInFlightPromise;
    }

    const localVersion = getLocalVersion() || "static_v1";

    musicMetasInFlightPromise = (async () => {
        // Try IndexedDB first
        if (!noCache && isIndexedDBAvailable()) {
            try {
                const cached = await getMasterDataCache<IMusicMeta[]>(MASTERDATA_CACHE_GLOBAL_SCOPE, "music_metas.json", localVersion);
                if (cached && Array.isArray(cached) && cached.length > 0) {
                    cachedMusicMetasMemory = cached;
                    return cached;
                }
            } catch {
                // Ignore IDB read error and fallback to network
            }
        }

        const fetchOptions: RequestInit = noCache ? { cache: "no-store" } : {};

        // Try primary CDN
        try {
            const response = await fetchWithCompression(MOE_MUSIC_META_URL, fetchOptions);
            if (response.ok) {
                const data: IMusicMeta[] = await response.json();
                cachedMusicMetasMemory = data;
                if (isIndexedDBAvailable()) {
                    setMasterDataCache(MASTERDATA_CACHE_GLOBAL_SCOPE, "music_metas.json", data, localVersion).catch(() => {});
                }
                return data;
            }
            console.warn(`[MusicMeta] Primary fetch failed (${response.status}), trying fallback...`);
        } catch (e) {
            console.warn("[MusicMeta] Primary fetch error, trying fallback...", e);
        }

        // Fallback CDN
        const fallbackUrl = "https://metadata.pjsk.moe/data/music_meta/music_metas.json";
        const fallbackResponse = await fetchWithCompression(fallbackUrl, fetchOptions);
        if (!fallbackResponse.ok) {
            throw new Error(`Failed to fetch music metas (both primary and fallback failed, status: ${fallbackResponse.status})`);
        }
        const fallbackData: IMusicMeta[] = await fallbackResponse.json();
        cachedMusicMetasMemory = fallbackData;
        if (isIndexedDBAvailable()) {
            setMasterDataCache(MASTERDATA_CACHE_GLOBAL_SCOPE, "music_metas.json", fallbackData, localVersion).catch(() => {});
        }
        return fallbackData;
    })().finally(() => {
        musicMetasInFlightPromise = null;
    });

    return musicMetasInFlightPromise;
}
