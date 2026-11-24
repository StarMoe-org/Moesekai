/**
 * Server-side metadata reader for SEO.
 * 
 * Reads the pre-generated metadata-map.json (built during CI) from disk.
 * Process-level cache ensures the file is read only once per Node.js process lifetime.
 * Zero network requests at runtime.
 * 
 * This module uses `fs` and must only be imported in Server Components / generateMetadata.
 */

import fs from 'fs';
import path from 'path';
import { getServerDataDir } from '@/lib/server-data-dir';

import type {
    CardMeta,
    CardPowerItem,
    CardPowerMeta,
    CardEventMeta,
} from "@/types/types";

export type {
    CardMeta,
    CardPowerItem,
    CardPowerMeta,
    CardEventMeta,
};

export interface MusicMeta {
    title: string;
    lyricist: string;
    composer: string;
    asset: string;
    isJpFallback?: boolean;
}

export interface EventMeta {
    name: string;
    type: string;
    asset: string;
    startAt?: number | string;
    endAt?: number | string;
    isJpFallback?: boolean;
}

export interface GachaMeta {
    name: string;
    type: string;
    asset: string;
    isJpFallback?: boolean;
}

export interface CharacterMeta {
    name: string;
    isJpFallback?: boolean;
}

export interface VirtualLiveMeta {
    name: string;
    asset: string;
    startAt?: number | string;
    endAt?: number | string;
    isJpFallback?: boolean;
}

export interface CostumeMeta {
    name: string;
    isJpFallback?: boolean;
}

export interface FixtureMeta {
    name: string;
    flavor: string;
    asset: string;
}

export interface MangaMeta {
    title: string;
}

export interface ExchangeMeta {
    name: string;
    summaryName: string;
    category: string;
    type: string;
}

export interface StoryEventGroupMeta {
    name: string;
    asset: string;
    episodeCount: number;
    firstEpisodeTitle: string;
}

export interface StoryEventEpisodeMeta {
    eventName: string;
    episodeTitle: string;
    episodeNo: number;
    asset: string;
}

export interface StoryUnitGroupMeta {
    unitName: string;
    unit: string;
    episodeCount: number;
}

export interface StoryUnitEpisodeMeta {
    unitName: string;
    unit: string;
    episodeTitle: string;
    episodeNoLabel: string;
}

export interface StoryCardReaderMeta {
    cardPrefix: string;
    characterName: string;
    asset: string;
    characterId: number;
}

export interface StorySelfReaderMeta {
    characterName: string;
    characterId: number;
}

export interface StorySpecialReaderMeta {
    title: string;
    episodeCount: number;
}

export interface StoryAreaCategoryMeta {
    label: string;
    count: number;
}

export interface StoryAreaReaderMeta {
    areaName: string;
    scenarioId: string;
}

interface MetadataMap {
    cards: Record<string, CardMeta>;
    musics: Record<string, MusicMeta>;
    events: Record<string, EventMeta>;
    gachas: Record<string, GachaMeta>;
    characters: Record<string, CharacterMeta>;
    virtualLives: Record<string, VirtualLiveMeta>;
    costumes: Record<string, CostumeMeta>;
    mysekaiFixtures: Record<string, FixtureMeta>;
    mangas: Record<string, MangaMeta>;
    exchanges: Record<string, ExchangeMeta>;
    storyEventGroups?: Record<string, StoryEventGroupMeta>;
    storyEventEpisodes?: Record<string, StoryEventEpisodeMeta>;
    storyUnitGroups?: Record<string, StoryUnitGroupMeta>;
    storyUnitEpisodes?: Record<string, StoryUnitEpisodeMeta>;
    storyCardReaders?: Record<string, StoryCardReaderMeta>;
    storySelfReaders?: Record<string, StorySelfReaderMeta>;
    storySpecialReaders?: Record<string, StorySpecialReaderMeta>;
    storyAreaCategories?: Record<string, StoryAreaCategoryMeta>;
    storyAreaReaders?: Record<string, StoryAreaReaderMeta>;
}

export const METADATA_REGIONS = ['cn', 'jp', 'tw', 'en', 'kr'] as const;
export type MetadataRegion = (typeof METADATA_REGIONS)[number];

// ==================== Process-level Cache ====================

const cache = new Map<MetadataRegion, MetadataMap | null>();

function getMap(region: MetadataRegion = 'cn'): MetadataMap | null {
    const normalizedRegion = METADATA_REGIONS.includes(region) ? region : 'cn';
    if (cache.has(normalizedRegion)) return cache.get(normalizedRegion) ?? null;
    try {
        const dataDir = getServerDataDir();
        const regionalPath = path.join(dataDir, `metadata-map.${normalizedRegion}.json`);
        const filePath = fs.existsSync(regionalPath)
            ? regionalPath
            : normalizedRegion === 'jp'
                ? path.join(dataDir, 'metadata-map.json')
                : regionalPath;
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as MetadataMap;
        cache.set(normalizedRegion, parsed);
        return parsed;
    } catch {
        // File not found or parse error — degrade gracefully
        cache.set(normalizedRegion, null);
        return null;
    }
}

// ==================== Public Accessors ====================

function getRegionalWithFallback<T extends object>(
    getter: (map: MetadataMap) => Record<string, T> | undefined,
    id: string | number,
    region?: MetadataRegion,
): (T & { isJpFallback?: boolean }) | null {
    const key = String(id);
    const regional = getMap(region);
    if (regional) {
        const item = getter(regional)?.[key];
        if (item) {
            return { ...item, isJpFallback: false };
        }
    }
    if (region && region !== 'jp') {
        const jpMap = getMap('jp');
        if (jpMap) {
            const jpItem = getter(jpMap)?.[key];
            if (jpItem) {
                return { ...jpItem, isJpFallback: true };
            }
        }
    }
    for (const altRegion of METADATA_REGIONS) {
        if (altRegion !== region && altRegion !== 'jp') {
            const altMap = getMap(altRegion);
            const altItem = altMap ? getter(altMap)?.[key] : undefined;
            if (altItem) {
                return { ...altItem, isJpFallback: false };
            }
        }
    }
    return null;
}

export function getCardMeta(id: number, region?: MetadataRegion): CardMeta | null {
    return getRegionalWithFallback(m => m.cards, id, region);
}

export function getMusicMeta(id: number, region?: MetadataRegion): MusicMeta | null {
    return getRegionalWithFallback(m => m.musics, id, region);
}

export function getEventMeta(id: number, region?: MetadataRegion): EventMeta | null {
    return getRegionalWithFallback(m => m.events, id, region);
}

export function getGachaMeta(id: number, region?: MetadataRegion): GachaMeta | null {
    return getRegionalWithFallback(m => m.gachas, id, region);
}

export function getCharacterMeta(id: number, region?: MetadataRegion): CharacterMeta | null {
    return getRegionalWithFallback(m => m.characters, id, region);
}

export function getVirtualLiveMeta(id: number, region?: MetadataRegion): VirtualLiveMeta | null {
    return getRegionalWithFallback(m => m.virtualLives, id, region);
}

export function getCostumeMeta(id: number, region?: MetadataRegion): CostumeMeta | null {
    return getRegionalWithFallback(m => m.costumes, id, region);
}

export function getFixtureMeta(id: number, region?: MetadataRegion): FixtureMeta | null {
    return getRegionalWithFallback(m => m.mysekaiFixtures, id, region);
}

export function getMangaMeta(id: number, region?: MetadataRegion): MangaMeta | null {
    return getRegionalWithFallback(m => m.mangas, id, region);
}

export function getExchangeMeta(id: number, region?: MetadataRegion): ExchangeMeta | null {
    return getRegionalWithFallback(m => m.exchanges, id, region);
}

export function getStoryEventGroupMeta(id: string | number, region?: MetadataRegion): StoryEventGroupMeta | null {
    return getMap(region)?.storyEventGroups?.[String(id)] ?? null;
}

export function getStoryEventEpisodeMeta(eventId: string | number, episodeNo: string | number, region?: MetadataRegion): StoryEventEpisodeMeta | null {
    return getMap(region)?.storyEventEpisodes?.[`${eventId}/${episodeNo}`] ?? null;
}

export function getStoryUnitGroupMeta(unitId: string | number, region?: MetadataRegion): StoryUnitGroupMeta | null {
    return getMap(region)?.storyUnitGroups?.[String(unitId)] ?? null;
}

export function getStoryUnitEpisodeMeta(unitId: string | number, episodeId: string, region?: MetadataRegion): StoryUnitEpisodeMeta | null {
    return getMap(region)?.storyUnitEpisodes?.[`${unitId}/${episodeId}`] ?? null;
}

export function getStoryCardReaderMeta(cardId: string | number, region?: MetadataRegion): StoryCardReaderMeta | null {
    return getMap(region)?.storyCardReaders?.[String(cardId)] ?? null;
}

export function getStorySelfReaderMeta(charaId: string | number, region?: MetadataRegion): StorySelfReaderMeta | null {
    return getMap(region)?.storySelfReaders?.[String(charaId)] ?? null;
}

export function getStorySpecialReaderMeta(spId: string | number, region?: MetadataRegion): StorySpecialReaderMeta | null {
    return getMap(region)?.storySpecialReaders?.[String(spId)] ?? null;
}

export function getStoryAreaCategoryMeta(category: string, region?: MetadataRegion): StoryAreaCategoryMeta | null {
    return getMap(region)?.storyAreaCategories?.[category] ?? null;
}

export function getStoryAreaReaderMeta(category: string, scenarioId: string, region?: MetadataRegion): StoryAreaReaderMeta | null {
    return getMap(region)?.storyAreaReaders?.[`${category}/${scenarioId}`] ?? null;
}
