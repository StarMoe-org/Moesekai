/**
 * Story Translation Loader
 * Loads per-story translation files from https://translation.exmeaning.com/translation/
 * (zh-CN) or /v2/en-US/translation/ (en-US):
 * - event: eventStory/event_<eventId>.json
 * - card:  cardStory/card_<cardId>.json
 * - area:  areaTalk/group_<floor(JP actionSet id / 100)>.json
 *
 * Each episode's talkData maps the Japanese TalkData body or display name to its translation.
 */

import { getTranslationAssetBaseUrl } from "./translations";
import type { UiLocale } from "./i18n";
import type { ServerSourceType } from "./fetch";
import type { StoryTranslationSource } from "@/types/story";

export type StoryTranslationKind = "event" | "card" | "area";

export interface IEpisodeTranslation {
    scenarioId: string;
    title?: string;
    source?: StoryTranslationSource;
    talkData: Record<string, string>;
}

export interface IEventStoryTranslation {
    meta?: {
        source: StoryTranslationSource;
        version: string;
        last_updated: number;
    };
    episodes: Record<string, IEpisodeTranslation>;
}

const STORY_TRANSLATION_FILE_PREFIXES: Record<StoryTranslationKind, string> = {
    event: "eventStory/event_",
    card: "cardStory/card_",
    area: "areaTalk/group_",
};

const EVENT_TRANSLATION_CACHE_LIMIT = 64;
const EVENT_TRANSLATION_CACHE_TTL = 60 * 1000;

interface CachedEventStoryTranslation {
    data: IEventStoryTranslation;
    cachedAt: number;
    revision: string;
}

// Map: locale:kind:fileId -> translation data
const translationCache = new Map<string, CachedEventStoryTranslation>();

// Track in-flight requests to prevent duplicate fetches
const inflightRequests = new Map<string, Promise<IEventStoryTranslation | null>>();

function eventTranslationTarget(locale: UiLocale): "zh-CN" | "en-US" | null {
    if (locale === "zh-CN" || locale === "en-US") return locale;
    return null;
}

export function selectEventStoryLocalizedText(
    locale: UiLocale,
    sourceText?: string,
    zhCNText?: string,
    targetText?: string,
): string {
    if (locale === "zh-CN") return zhCNText || targetText || sourceText || "";
    if (locale === "en-US") return targetText || sourceText || "";
    return sourceText || "";
}

function storyCacheKey(kind: StoryTranslationKind, fileId: number, locale: "zh-CN" | "en-US"): string {
    return `${locale}:${kind}:${fileId}`;
}

function eventTranslationRevision(data: IEventStoryTranslation): string {
    return `${data.meta?.version ?? "legacy"}:${data.meta?.last_updated ?? 0}`;
}

function setEventCache(key: string, data: IEventStoryTranslation): void {
    translationCache.delete(key);
    translationCache.set(key, {
        data,
        cachedAt: Date.now(),
        revision: eventTranslationRevision(data),
    });
    while (translationCache.size > EVENT_TRANSLATION_CACHE_LIMIT) {
        const oldest = translationCache.keys().next().value as string | undefined;
        if (!oldest) break;
        translationCache.delete(oldest);
    }
}

/**
 * Load the translation file of one story
 * Returns cached data if available, otherwise fetches from server
 *
 * @param kind - event, card or area
 * @param fileId - event id, card id, or area talk group (see areaTalkTranslationGroup)
 * @returns Translation data or null if not available
 */
export async function loadStoryTranslation(
    kind: StoryTranslationKind,
    fileId: number,
    locale: UiLocale = "zh-CN",
): Promise<IEventStoryTranslation | null> {
    const targetLocale = eventTranslationTarget(locale);
    if (!targetLocale) return null;
    const cacheKey = storyCacheKey(kind, fileId, targetLocale);

    const cached = translationCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < EVENT_TRANSLATION_CACHE_TTL) {
        translationCache.delete(cacheKey);
        translationCache.set(cacheKey, cached);
        return cached.data;
    }

    // If already loading, wait for that promise
    if (inflightRequests.has(cacheKey)) {
        return inflightRequests.get(cacheKey)!;
    }

    // Start loading
    const loadPromise = (async (): Promise<IEventStoryTranslation | null> => {
        try {
            const localeBase = getTranslationAssetBaseUrl(targetLocale);
            const response = await fetch(`${localeBase}/${STORY_TRANSLATION_FILE_PREFIXES[kind]}${fileId}.json`, { cache: "no-store" });
            if (!response.ok) {
                // Translation file doesn't exist for this story
                // Don't cache — file may be added later
                return null;
            }
            const data = await response.json();

            // Backward compatibility: check if data has "episodes" key
            let parsedData: IEventStoryTranslation;
            if (data.episodes) {
                parsedData = data as IEventStoryTranslation;
            } else {
                // Treat as old format (just episodes map)
                // Assume it's official_cn since that was the only source using this loader before
                parsedData = {
                    meta: { source: 'official_cn', version: '0.0', last_updated: 0 },
                    episodes: data as Record<string, IEpisodeTranslation>
                };
            }

            // Only cache if data has episodes (not empty/incomplete)
            if (Object.keys(parsedData.episodes).length > 0) {
                if (cached && cached.revision !== eventTranslationRevision(parsedData)) {
                    translationCache.delete(cacheKey);
                }
                setEventCache(cacheKey, parsedData);
            }
            return parsedData;
        } catch (error) {
            console.debug(`Story translation not found for ${kind} ${fileId}:`, error);
            // Don't cache failures — allow retry on next visit
            return null;
        } finally {
            inflightRequests.delete(cacheKey);
        }
    })();

    inflightRequests.set(cacheKey, loadPromise);
    return loadPromise;
}

/**
 * Load event story translation for a specific event
 *
 * @param eventId - The event ID
 * @returns Translation data or null if not available
 */
export function loadEventStoryTranslation(eventId: number, locale: UiLocale = "zh-CN"): Promise<IEventStoryTranslation | null> {
    return loadStoryTranslation("event", eventId, locale);
}

// Card and area translations are keyed by the Japanese script text, so only the JP server's scenario can use them.
export function sideStoryTranslationEnabled(
    serverSource: ServerSourceType,
    locale: UiLocale,
    useLLMTranslation: boolean,
): boolean {
    return serverSource === "jp" && useLLMTranslation && eventTranslationTarget(locale) !== null;
}

/** Area talk file number for a JP actionSet id. */
export function areaTalkTranslationGroup(actionSetId: number): number {
    return Math.floor(actionSetId / 100);
}

/**
 * Get translation for a specific episode
 *
 * @param translation - The story translation data
 * @param episodeKey - Episode number (event), "1"/"2" (card) or scenarioId (area)
 * @returns The selected episode translation or null if not found
 */
export function getStoryTranslation(
    translation: IEventStoryTranslation | null,
    episodeKey: number | string
): IEpisodeTranslation | null {
    if (!translation) return null;
    return translation.episodes[String(episodeKey)] || null;
}

/** Source label of one episode: its own source, else the file's; undefined when the episode is absent. */
export function storyEpisodeTranslationSource(
    translation: IEventStoryTranslation | null,
    episodeKey: number | string,
): StoryTranslationSource | undefined {
    const episode = getStoryTranslation(translation, episodeKey);
    if (!episode) return undefined;
    return episode.source ?? translation?.meta?.source;
}

export function storyTranslationSourceLabelKey(source: StoryTranslationSource): string {
    switch (source) {
        case "official_cn":
            return "page.story.reader.translationSources.officialCn";
        case "official_en":
            return "page.story.reader.translationSources.officialEn";
        case "human":
            return "page.story.reader.translationSources.human";
        default:
            return "page.story.reader.translationSources.ai";
    }
}

/**
 * Clear the translation cache (useful for testing or forced refresh)
 */
export function clearEventStoryTranslationCache(locale?: UiLocale): void {
    const targetLocale = locale ? eventTranslationTarget(locale) : null;
    if (locale && !targetLocale) return;
    if (!targetLocale) {
        translationCache.clear();
        inflightRequests.clear();
        return;
    }
    const prefix = `${targetLocale}:`;
    for (const key of translationCache.keys()) {
        if (key.startsWith(prefix)) translationCache.delete(key);
    }
    for (const key of inflightRequests.keys()) {
        if (key.startsWith(prefix)) inflightRequests.delete(key);
    }
}
