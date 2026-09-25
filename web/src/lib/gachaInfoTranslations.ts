/**
 * Gacha information (summary / bubbleText / description) translations.
 * Loaded on demand by the gacha detail page instead of joining the
 * loadTranslations startup bundle: every description is several KB.
 */

import {
    TRANSLATION_CACHE_TTL,
    fetchTranslationFile,
    getTranslationAssetBaseUrl,
    getTranslationDataVersion,
    getTranslationTargetLocale,
    resolveTranslationLocale,
} from "./translations";
import type { TranslationMap, TranslationTargetLocale } from "./translations";

export interface GachaInfoTranslations {
    summary: TranslationMap;
    bubbleText: TranslationMap;
    description: TranslationMap;
}

export type GachaInfoField = keyof GachaInfoTranslations;

export interface GachaInfoTextView {
    text: string;
    showingTranslation: boolean;
    canToggle: boolean;
}

const emptyGachaInfoTranslations: GachaInfoTranslations = { summary: {}, bubbleText: {}, description: {} };

interface GachaInfoCacheEntry {
    data: GachaInfoTranslations;
    version: string;
    cachedAt: number;
}

const gachaInfoCaches = new Map<TranslationTargetLocale, GachaInfoCacheEntry>();
const gachaInfoLoads = new Map<TranslationTargetLocale, Promise<GachaInfoTranslations>>();

/**
 * Load gachaInfo.json for the target locale (memory → network).
 * The memory entry lives as long as the startup bundle's (TRANSLATION_CACHE_TTL)
 * and only for the translation data version it was fetched with, so newly
 * published translations and markTranslationsUpdated reach an open tab.
 * A missing or unreachable file is not cached: it resolves to the previous
 * entry when there is one, otherwise to empty maps.
 */
export async function loadGachaInfoTranslations(locale?: string): Promise<GachaInfoTranslations> {
    const targetLocale = getTranslationTargetLocale(resolveTranslationLocale(locale));
    if (!targetLocale) return emptyGachaInfoTranslations;

    const version = getTranslationDataVersion(targetLocale);
    const cached = gachaInfoCaches.get(targetLocale);
    if (cached && cached.version === version && Date.now() - cached.cachedAt < TRANSLATION_CACHE_TTL) {
        return cached.data;
    }

    const inflight = gachaInfoLoads.get(targetLocale);
    if (inflight) return inflight;

    const query = version ? `?v=${encodeURIComponent(version)}` : "";
    const url = `${getTranslationAssetBaseUrl(targetLocale)}/gachaInfo.json${query}`;
    const loadingPromise = fetchTranslationFile<Partial<GachaInfoTranslations>>(url)
        .then((file): GachaInfoTranslations => {
            if (!file) return cached?.data ?? emptyGachaInfoTranslations;
            const data: GachaInfoTranslations = {
                summary: file.summary ?? {},
                bubbleText: file.bubbleText ?? {},
                description: file.description ?? {},
            };
            gachaInfoCaches.set(targetLocale, { data, version, cachedAt: Date.now() });
            return data;
        })
        .finally(() => {
            gachaInfoLoads.delete(targetLocale);
        });

    gachaInfoLoads.set(targetLocale, loadingPromise);
    return loadingPromise;
}

/**
 * Translation for the exact masterdata text, or null when there is none
 * (same identity rule as TranslationContext.t).
 */
export function getGachaInfoTranslation(
    translations: GachaInfoTranslations | null,
    field: GachaInfoField,
    original: string | undefined,
): string | null {
    if (!translations || !original) return null;
    const translated = translations[field][original];
    if (!translated || translated.trim() === original.trim()) return null;
    return translated;
}

export function resolveGachaInfoText(original: string, translation: string | null, showOriginal: boolean): GachaInfoTextView {
    if (!translation) return { text: original, showingTranslation: false, canToggle: false };
    return showOriginal
        ? { text: original, showingTranslation: false, canToggle: true }
        : { text: translation, showingTranslation: true, canToggle: true };
}
