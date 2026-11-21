/**
 * The game assets a story refers to, by name, on its server and the asset line the reader chose:
 * backgrounds, BGM, SE and story voices (URLs from lib/assets.ts), and the lists of names the
 * pickers offer (the storage view's directory listings).
 */
import type { AssetSourceType } from "@/contexts/ThemeContext";
import {
    getAreaTalkVoiceUrl, getAssetBaseUrl, getBackgroundImageUrl, getCardStoryVoiceUrl, getStoryBgmUrl,
    getStorySoundEffectUrl, getStoryVoiceUrl, type AssetLine,
} from "@/lib/assets";
import type { StoryRegion, StoryVoiceRef } from "@/types/storyMaker";

function source(region: StoryRegion, line: AssetLine): AssetSourceType {
    return `${line}-${region}` as AssetSourceType;
}

export function storyBackgroundUrl(name: string, region: StoryRegion, line: AssetLine): string {
    return getBackgroundImageUrl(name, source(region, line));
}

export function storyBgmUrl(name: string, region: StoryRegion, line: AssetLine): string {
    return getStoryBgmUrl(name, source(region, line));
}

export function storySeUrl(name: string, region: StoryRegion, line: AssetLine): string {
    return getStorySoundEffectUrl(name, source(region, line));
}

export function storyVoiceUrl(voice: StoryVoiceRef, region: StoryRegion, line: AssetLine): string {
    const at = source(region, line);
    switch (voice.kind) {
        case "card": return getCardStoryVoiceUrl(voice.scenarioId, voice.voiceId, at);
        case "area": return getAreaTalkVoiceUrl(voice.scenarioId, voice.voiceId, at);
        default: return getStoryVoiceUrl(voice.scenarioId, voice.voiceId, at);
    }
}

/** The asset directories the pickers list. */
export const STORY_ASSET_DIRECTORIES = {
    bgm: "sound/scenario/bgm/",
    se: "sound/scenario/se/",
} as const;

export type StoryAssetKind = keyof typeof STORY_ASSET_DIRECTORIES;

interface DirectoryListing {
    format?: string;
    version?: number;
    directories?: unknown;
    files?: unknown;
}

const listings = new Map<string, Promise<string[]>>();

/**
 * The asset names under one of the pickers' directories: BGM are directories of their own, SE
 * files (named without their extension). Each list is fetched once per page.
 */
export function fetchStoryAssetNames(kind: StoryAssetKind, region: StoryRegion, line: AssetLine): Promise<string[]> {
    const url = `${getAssetBaseUrl(source(region, line))}/${STORY_ASSET_DIRECTORIES[kind]}`;
    const cached = listings.get(url);
    if (cached) return cached;
    const loading = (async () => {
        const response = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        const listing = await response.json() as DirectoryListing;
        if (listing.format !== "directory-listing" || listing.version !== 1) throw new Error(`${url}: unsupported listing`);
        const names = new Set<string>();
        if (Array.isArray(listing.directories)) {
            for (const name of listing.directories) if (typeof name === "string") names.add(name);
        }
        if (Array.isArray(listing.files)) {
            for (const file of listing.files) {
                const name = typeof file === "string" ? file : (file as { name?: unknown })?.name;
                if (typeof name === "string") names.add(name.replace(/\.(mp3|wav|ogg|acb|flac)$/i, ""));
            }
        }
        return [...names].filter(name => /^[A-Za-z0-9_-]{1,64}$/.test(name)).sort();
    })();
    listings.set(url, loading);
    loading.catch(() => listings.delete(url));
    return loading;
}
