/**
 * Translation utilities for Japanese-source locale overlays.
 * zh-CN uses the canonical root files; en-US uses the v2 locale directory.
 * 
 * IndexedDB caching: Translation data is persisted in IndexedDB and keyed by
 * a version hash derived from the masterdata version. On version change,
 * stale translation cache entries are automatically invalidated.
 */

import { getTranslationCache, setTranslationCache, isIndexedDBAvailable } from "./masterdata-cache";
import { MASTERDATA_VERSION_KEY } from "./fetch";

const TRANSLATION_ORIGIN = "https://translation.exmeaning.com";
export const TRANSLATION_BASE_URL = `${TRANSLATION_ORIGIN}/files/translation`;

export function getTranslationAssetBaseUrl(locale: TranslationTargetLocale): string {
    return locale === "zh-CN"
        ? TRANSLATION_BASE_URL
        : `${TRANSLATION_ORIGIN}/files/v2/${locale}/translation`;
}
export interface TranslationMap {
    [key: string]: string;
}

// Full translation data structure
export interface TranslationData {
    cards: {
        prefix: TranslationMap;      // Card prefix/title translations
        skillName: TranslationMap;   // Skill name translations
    };
    skills: {
        description: TranslationMap; // Skill description template translations
    };
    events: {
        name: TranslationMap;        // Event name translations
    };
    information: {
        title: TranslationMap;       // Announcement title translations
    };
    music: {
        title: TranslationMap;       // Song title translations
        artist: TranslationMap;      // Lyricist/composer/arranger names
        vocalCaption: TranslationMap; // Vocal version caption translations
    };
    virtualLive: {
        name: TranslationMap;        // Virtual live name translations
    };
    mysekai: {
        fixtureName: TranslationMap; // Fixture name translations
        flavorText: TranslationMap;  // Fixture flavor text translations
        genre: TranslationMap;       // Genre name translations
        subGenre: TranslationMap;    // Sub-genre name translations
        tag: TranslationMap;         // Tag name translations
        material: TranslationMap;    // Material name translations
    };
    gacha: {
        name: TranslationMap;        // Gacha name translations
    };
    sticker: {
        name: TranslationMap;        // Sticker name translations
    };
    comic: {
        title: TranslationMap;       // Comic title translations
    };
    characters: {
        hobby: TranslationMap;
        specialSkill: TranslationMap;
        favoriteFood: TranslationMap;
        hatedFood: TranslationMap;
        weak: TranslationMap;
        introduction: TranslationMap;
    };
    units: {
        unitName: TranslationMap;
        profileSentence: TranslationMap;
    };
    costumes: {
        name: TranslationMap;        // Costume name translations
        colorName: TranslationMap;   // Color variant name translations
        designer: TranslationMap;    // Designer name translations
    };
}

// Default empty translation data
const emptyTranslationData: TranslationData = {
    cards: { prefix: {}, skillName: {} },
    skills: { description: {} },
    events: { name: {} },
    information: { title: {} },
    music: { title: {}, artist: {}, vocalCaption: {} },
    virtualLive: { name: {} },
    mysekai: { fixtureName: {}, flavorText: {}, genre: {}, subGenre: {}, tag: {}, material: {} },
    gacha: { name: {} },
    sticker: { name: {} },
    comic: { title: {} },
    characters: { hobby: {}, specialSkill: {}, favoriteFood: {}, hatedFood: {}, weak: {}, introduction: {} },
    units: { unitName: {}, profileSentence: {} },
    costumes: { name: {}, colorName: {}, designer: {} },
};

export type TranslationTargetLocale = "zh-CN" | "en-US";

const UI_LOCALE_STORAGE_KEY = "moesekai_ui_locale";
const MAX_MEMORY_LOCALES = 2;

// Locale-bounded in-memory caches. zh-CN and en-US are the only fetched targets.
const translationCaches = new Map<TranslationTargetLocale, TranslationData>();
const loadingPromises = new Map<TranslationTargetLocale, Promise<TranslationData>>();

// IndexedDB cache key for the combined translation bundle
const TRANSLATION_IDB_KEY = "translations-bundle";

// Translation cache TTL: 30 minutes (faster propagation for proofreading updates)
const TRANSLATION_CACHE_TTL = 30 * 60 * 1000;

// Key for storing translation cache timestamp in localStorage
const TRANSLATION_CACHE_TIME_KEY = "translation-cache-time";

// Key for forcing translation cache-bust when proofreading updates occur
const TRANSLATION_DATA_VERSION_KEY = "translation-data-version";

export function getTranslationTargetLocale(locale: string): TranslationTargetLocale | null {
    if (locale === "zh-CN" || locale === "en-US") return locale;
    return null;
}

function resolveTranslationLocale(locale?: string): string {
    if (locale) return locale;
    if (typeof window === "undefined") return "zh-CN";
    const routeLocale = window.location?.pathname?.split("/").filter(Boolean)[0]?.toLowerCase();
    const routeUiLocale: Record<string, string> = {
        "zh-cn": "zh-CN",
        "zh-tw": "zh-TW",
        "en-us": "en-US",
        "ja-jp": "ja-JP",
        "ko-kr": "ko-KR",
    };
    if (routeLocale && routeUiLocale[routeLocale]) return routeUiLocale[routeLocale];
    return localStorage.getItem(UI_LOCALE_STORAGE_KEY) || "zh-CN";
}

function localeStorageKey(key: string, locale: TranslationTargetLocale): string {
    return locale === "zh-CN" ? key : `${key}:${locale}`;
}

function translationBundleKey(locale: TranslationTargetLocale): string {
    return locale === "zh-CN" ? TRANSLATION_IDB_KEY : `${TRANSLATION_IDB_KEY}:${locale}`;
}

function setMemoryCache(locale: TranslationTargetLocale, data: TranslationData): void {
    translationCaches.delete(locale);
    translationCaches.set(locale, data);
    while (translationCaches.size > MAX_MEMORY_LOCALES) {
        const oldest = translationCaches.keys().next().value as TranslationTargetLocale | undefined;
        if (!oldest) break;
        translationCaches.delete(oldest);
    }
}

function getMemoryCache(locale: TranslationTargetLocale): TranslationData | null {
    const cached = translationCaches.get(locale);
    if (!cached) return null;
    translationCaches.delete(locale);
    translationCaches.set(locale, cached);
    return cached;
}

/**
 * Get the current translation version hash.
 * Uses masterdata version from localStorage as the invalidation key.
 * Falls back to a static string if no version is available.
 */
function getTranslationVersionHash(locale: TranslationTargetLocale): string {
    if (typeof window === "undefined") return "build";
    const masterVersion = localStorage.getItem(MASTERDATA_VERSION_KEY) || "unknown";
    const translationVersion = localStorage.getItem(localeStorageKey(TRANSLATION_DATA_VERSION_KEY, locale)) || "0";
    const versionHash = `${masterVersion}:${translationVersion}`;
    return locale === "zh-CN" ? versionHash : `${locale}:${versionHash}`;
}

function getTranslationDataVersion(locale: TranslationTargetLocale): string {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(localeStorageKey(TRANSLATION_DATA_VERSION_KEY, locale)) || "";
}

/**
 * Check if translation cache has expired (TTL-based)
 */
function isTranslationCacheStale(locale: TranslationTargetLocale): boolean {
    if (typeof window === "undefined") return true;
    const cachedTime = localStorage.getItem(localeStorageKey(TRANSLATION_CACHE_TIME_KEY, locale));
    if (!cachedTime) return true;
    return Date.now() - Number(cachedTime) > TRANSLATION_CACHE_TTL;
}

/**
 * Fetch all translation files from network.
 * Translation data is served from the MoeSekai-Hub static deployment.
 */
async function fetchAllTranslations(locale: TranslationTargetLocale): Promise<TranslationData> {
    const baseUrl = getTranslationAssetBaseUrl(locale);
    const version = getTranslationDataVersion(locale);
    const query = version ? `?v=${encodeURIComponent(version)}` : "";

    const [cards, skills, events, information, music, virtualLive, mysekai, gacha, sticker, comic, characters, units, costumes] = await Promise.all([
        fetchTranslationFile<TranslationData["cards"]>(`${baseUrl}/cards.json${query}`),
        fetchTranslationFile<TranslationData["skills"]>(`${baseUrl}/skills.json${query}`),
        fetchTranslationFile<TranslationData["events"]>(`${baseUrl}/events.json${query}`),
        fetchTranslationFile<TranslationData["information"]>(`${baseUrl}/information.json${query}`),
        fetchTranslationFile<TranslationData["music"]>(`${baseUrl}/music.json${query}`),
        fetchTranslationFile<TranslationData["virtualLive"]>(`${baseUrl}/virtualLive.json${query}`),
        fetchTranslationFile<TranslationData["mysekai"]>(`${baseUrl}/mysekai.json${query}`),
        fetchTranslationFile<TranslationData["gacha"]>(`${baseUrl}/gacha.json${query}`),
        fetchTranslationFile<TranslationData["sticker"]>(`${baseUrl}/sticker.json${query}`),
        fetchTranslationFile<TranslationData["comic"]>(`${baseUrl}/comic.json${query}`),
        fetchTranslationFile<TranslationData["characters"]>(`${baseUrl}/characters.json${query}`),
        fetchTranslationFile<TranslationData["units"]>(`${baseUrl}/units.json${query}`),
        fetchTranslationFile<TranslationData["costumes"]>(`${baseUrl}/costumes.json${query}`),
    ]);

    return {
        cards: cards ?? emptyTranslationData.cards,
        skills: skills ?? emptyTranslationData.skills,
        events: events ?? emptyTranslationData.events,
        information: information ?? emptyTranslationData.information,
        music: music ?? emptyTranslationData.music,
        virtualLive: virtualLive ?? emptyTranslationData.virtualLive,
        mysekai: mysekai ?? emptyTranslationData.mysekai,
        gacha: gacha ?? emptyTranslationData.gacha,
        sticker: sticker ?? emptyTranslationData.sticker,
        comic: comic ?? emptyTranslationData.comic,
        characters: characters ?? emptyTranslationData.characters,
        units: units ?? emptyTranslationData.units,
        costumes: costumes ?? emptyTranslationData.costumes,
    };
}

/**
 * Background revalidation: fetch fresh translations and update cache if changed.
 * Runs silently without blocking the UI.
 */
function backgroundRevalidateTranslations(locale: TranslationTargetLocale, versionHash: string): void {
    fetchAllTranslations(locale)
        .then((fresh) => {
            setMemoryCache(locale, fresh);
            // Update IndexedDB cache
            if (isIndexedDBAvailable()) {
                setTranslationCache(translationBundleKey(locale), fresh, versionHash).catch(() => { });
            }
            // Update timestamp
            localStorage.setItem(localeStorageKey(TRANSLATION_CACHE_TIME_KEY, locale), Date.now().toString());
        })
        .catch(() => {
            // Silent fail — stale data is better than no data
        });
}

/**
 * Load all translation data from JSON files
 * Returns cached data if already loaded (memory → IndexedDB → network)
 * Uses stale-while-revalidate: returns cached data immediately, refreshes in background if stale.
 */
export async function loadTranslations(locale?: string): Promise<TranslationData> {
    const targetLocale = getTranslationTargetLocale(resolveTranslationLocale(locale));
    if (!targetLocale) return emptyTranslationData;

    // 1. Return in-memory cache if available
    const memoryCache = getMemoryCache(targetLocale);
    if (memoryCache) {
        // If cache is stale, trigger background revalidation
        if (isTranslationCacheStale(targetLocale)) {
            backgroundRevalidateTranslations(targetLocale, getTranslationVersionHash(targetLocale));
        }
        return memoryCache;
    }

    // If already loading, wait for that promise
    const inflight = loadingPromises.get(targetLocale);
    if (inflight) {
        return inflight;
    }

    // Start loading
    const loadingPromise = (async (): Promise<TranslationData> => {
        const versionHash = getTranslationVersionHash(targetLocale);
        const bundleKey = translationBundleKey(targetLocale);

        // 2. Try IndexedDB cache
        if (isIndexedDBAvailable()) {
            try {
                const cached = await getTranslationCache<TranslationData>(bundleKey, versionHash);
                if (cached) {
                    setMemoryCache(targetLocale, cached);
                    // If stale, revalidate in background (stale-while-revalidate)
                    if (isTranslationCacheStale(targetLocale)) {
                        backgroundRevalidateTranslations(targetLocale, versionHash);
                    }
                    return cached;
                }
            } catch {
                // IndexedDB read failed, fall through to network
            }
        }

        // 3. Fetch from network (cache miss)
        try {
            const result = await fetchAllTranslations(targetLocale);
            setMemoryCache(targetLocale, result);

            // 4. Write to IndexedDB (async, non-blocking)
            if (isIndexedDBAvailable()) {
                setTranslationCache(bundleKey, result, versionHash).catch(() => { });
            }
            // Update timestamp
            if (typeof window !== "undefined") {
                localStorage.setItem(localeStorageKey(TRANSLATION_CACHE_TIME_KEY, targetLocale), Date.now().toString());
            }

            return result;
        } catch (error) {
            console.error("Failed to load translations:", error);
            return emptyTranslationData;
        }
    })().finally(() => {
        loadingPromises.delete(targetLocale);
    });

    loadingPromises.set(targetLocale, loadingPromise);
    return loadingPromise;
}

/**
 * Fetch a single translation file, returns null if not found
 */
async function fetchTranslationFile<T>(url: string): Promise<T | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            // Translation file not found is normal during development
            console.debug(`Translation file not found: ${url}`);
            return null;
        }
        return await response.json();
    } catch (error) {
        console.debug(`Failed to fetch translation file: ${url}`, error);
        return null;
    }
}

/**
 * Get translation for a text, with fallback to original
 * @param map Translation map to look up
 * @param key Original Japanese text
 * @param fallback Fallback text if translation not found (defaults to key)
 * @returns Translated text or fallback
 */
export function getTranslation(map: TranslationMap | undefined, key: string, fallback?: string): string {
    if (!map || !key) return fallback ?? key;
    return map[key] ?? fallback ?? key;
}

/**
 * Check if a translation exists
 */
export function hasTranslation(map: TranslationMap | undefined, key: string): boolean {
    if (!map || !key) return false;
    return key in map;
}

/**
 * Clear the translation cache (useful for testing or forced refresh)
 * Clears both in-memory and IndexedDB caches.
 */
export function clearTranslationCache(locale?: string): void {
    const targetLocale = locale ? getTranslationTargetLocale(locale) : null;
    if (locale && !targetLocale) return;
    if (targetLocale) {
        translationCaches.delete(targetLocale);
        loadingPromises.delete(targetLocale);
        if (isIndexedDBAvailable()) {
            import("./masterdata-cache").then(m => m.deleteTranslationCache(translationBundleKey(targetLocale))).catch(() => { });
        }
        return;
    }

    translationCaches.clear();
    loadingPromises.clear();
    if (isIndexedDBAvailable()) {
        import("./masterdata-cache").then(m => m.clearTranslationCache()).catch(() => { });
    }
}

/**
 * Mark translations as updated by proofreading actions.
 * This bumps a local version key to force cache-busting query params
 * and clears current caches so subsequent page loads fetch fresh files.
 */
export function markTranslationsUpdated(locale?: string): void {
    if (typeof window === "undefined") return;
    const resolvedLocale = resolveTranslationLocale(locale);
    const targetLocale = getTranslationTargetLocale(resolvedLocale);
    if (!targetLocale) return;
    localStorage.setItem(localeStorageKey(TRANSLATION_DATA_VERSION_KEY, targetLocale), Date.now().toString());
    localStorage.removeItem(localeStorageKey(TRANSLATION_CACHE_TIME_KEY, targetLocale));
    clearTranslationCache(targetLocale);
}
