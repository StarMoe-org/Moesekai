"use client";

/**
 * Shared lazy in-memory cache of Project SEKAI masterdata used by community
 * components (official PJSK stamps, card avatars, and inline entity embed cards).
 *
 * Stamps use JP `stamps.json` as the canonical cross-region catalog so server-exclusive
 * stamps (which 404 or collide across regions) are excluded from the picker, while
 * localized display names and assets are resolved for the viewer's active server with
 * automatic JP fallback.
 */

import { useEffect, useSyncExternalStore } from "react";
import { fetchMasterData, fetchMasterDataForServer, type ServerSourceType } from "./fetch";
import { getCardThumbnailUrl, getStampUrl } from "./assets";
import {
    replaceAssetSourceRegion,
    useTheme,
    type AssetSourceType,
} from "@/contexts/ThemeContext";
import type { ICardInfo, IGachaInfo } from "@/types/types";
import type { IMusicInfo } from "@/types/music";
import type { IEventInfo } from "@/types/events";
import type { ICostumeInfo, IMoeCostumeData } from "@/types/costume";
import type { IVirtualLiveInfo } from "@/types/virtualLive";
import type { EntityLinkType } from "@/types/community";

export interface ICommunityStamp {
    id: number;
    stampType: string;
    seq: number;
    name: string;
    /** Canonical JP stamp name (used for translation lookup & fallback search). */
    jpName?: string;
    assetbundleName: string;
    characterId1: number;
    characterId2?: number | null;
    archivePublishedAt?: number;
    /** True when present in JP canonical stamps.json (cross-region safe). */
    isCanonical?: boolean;
    /** True when present in the viewer's currently selected server stamps.json. */
    availableOnCurrentServer?: boolean;
}

/** Strips redundant leading bracketed region prefixes (e.g. "[Stamp] ") from stamp names. */
export function stripStampPrefix(name: string): string {
    return name.replace(/^\[[^\]]+\]\s*/, "").trim() || name;
}

/**
 * Resolves primary + JP-fallback image URLs for a stamp, preserving the viewer's
 * CDN line (`main` vs `backup`) and active server region.
 */
export function getStampImageUrls(
    stamp: ICommunityStamp,
    assetSource: AssetSourceType,
    serverSource: ServerSourceType,
): { primaryUrl: string; jpFallbackUrl: string } {
    const jpSource = replaceAssetSourceRegion(assetSource, "jp");
    const jpFallbackUrl = getStampUrl(stamp.assetbundleName, jpSource);
    if (serverSource === "jp" || stamp.availableOnCurrentServer === false) {
        return { primaryUrl: jpFallbackUrl, jpFallbackUrl };
    }
    const localSource = replaceAssetSourceRegion(assetSource, serverSource);
    return {
        primaryUrl: getStampUrl(stamp.assetbundleName, localSource),
        jpFallbackUrl,
    };
}

/**
 * Resolves primary + JP-fallback thumbnail URLs for a card avatar/embed,
 * avoiding unnecessary 404s for JP-advance cards not yet on the viewer's server.
 */
export function getCardAvatarImageUrls(
    card: ICardInfo,
    trained: boolean,
    assetSource: AssetSourceType,
    serverSource: ServerSourceType,
    availableOnCurrentServer?: boolean,
): { primaryUrl: string; jpFallbackUrl: string } {
    const jpSource = replaceAssetSourceRegion(assetSource, "jp");
    const jpFallbackUrl = getCardThumbnailUrl(card.characterId, card.assetbundleName, trained, jpSource);
    if (serverSource === "jp" || availableOnCurrentServer === false) {
        return { primaryUrl: jpFallbackUrl, jpFallbackUrl };
    }
    const localSource = replaceAssetSourceRegion(assetSource, serverSource);
    return {
        primaryUrl: getCardThumbnailUrl(card.characterId, card.assetbundleName, trained, localSource),
        jpFallbackUrl,
    };
}

interface CatalogSnapshot {
    /** Canonical JP-present stamps (for StickerPicker; excludes region-exclusive stamps). */
    stamps: ICommunityStamp[];
    /** Full lookup map (canonical stamps + current-server extras for legacy comment rendering). */
    stampsMap: Map<number, ICommunityStamp> | null;
    stampsServer: ServerSourceType | null;
    cards: ICardInfo[];
    cardsMap: Map<number, ICardInfo> | null;
    cardsLocalIds: ReadonlySet<number> | null;
    cardsServer: ServerSourceType | null;
    musics: IMusicInfo[];
    musicsMap: Map<number, IMusicInfo> | null;
    events: IEventInfo[];
    eventsMap: Map<number, IEventInfo> | null;
    gachas: IGachaInfo[];
    gachasMap: Map<number, IGachaInfo> | null;
    costumes: ICostumeInfo[];
    costumesMap: Map<number, ICostumeInfo> | null;
    virtualLives: IVirtualLiveInfo[];
    virtualLivesMap: Map<number, IVirtualLiveInfo> | null;
    loadingKeys: ReadonlySet<string>;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

const INITIAL_SNAPSHOT: CatalogSnapshot = {
    stamps: [],
    stampsMap: null,
    stampsServer: null,
    cards: [],
    cardsMap: null,
    cardsLocalIds: null,
    cardsServer: null,
    musics: [],
    musicsMap: null,
    events: [],
    eventsMap: null,
    gachas: [],
    gachasMap: null,
    costumes: [],
    costumesMap: null,
    virtualLives: [],
    virtualLivesMap: null,
    loadingKeys: EMPTY_SET,
};

let snapshot: CatalogSnapshot = INITIAL_SNAPSHOT;
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();

function updateSnapshot(patch: Partial<CatalogSnapshot>): void {
    snapshot = {
        ...snapshot,
        ...patch,
        loadingKeys: new Set(inflight.keys()),
    };
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): CatalogSnapshot {
    return snapshot;
}

function getServerSnapshot(): CatalogSnapshot {
    return INITIAL_SNAPSHOT;
}

function dedupe<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = loader().finally(() => {
        inflight.delete(key);
        updateSnapshot({});
    });
    inflight.set(key, promise);
    updateSnapshot({});
    return promise;
}

export async function loadCommunityStamps(serverSource: ServerSourceType = "cn"): Promise<{
    list: ICommunityStamp[];
    map: Map<number, ICommunityStamp>;
}> {
    if (snapshot.stampsServer === serverSource && snapshot.stampsMap) {
        return { list: snapshot.stamps, map: snapshot.stampsMap };
    }
    return dedupe(`stamps:${serverSource}`, async () => {
        if (serverSource === "jp") {
            const jpList = await fetchMasterData<ICommunityStamp[]>("stamps.json", false, "jp");
            const canonical = jpList.map<ICommunityStamp>((item) => ({
                ...item,
                jpName: item.name,
                isCanonical: true,
                availableOnCurrentServer: true,
            }));
            const map = new Map<number, ICommunityStamp>();
            for (const item of canonical) map.set(item.id, item);
            updateSnapshot({ stamps: canonical, stampsMap: map, stampsServer: serverSource });
            return { list: canonical, map };
        }

        const [jpResult, localResult] = await Promise.allSettled([
            fetchMasterDataForServer<ICommunityStamp[]>("jp", "stamps.json"),
            fetchMasterData<ICommunityStamp[]>("stamps.json", false, serverSource),
        ]);

        const jpList = jpResult.status === "fulfilled" ? jpResult.value : null;
        const localList = localResult.status === "fulfilled" ? localResult.value : null;

        if (!jpList && !localList) {
            throw jpResult.status === "rejected"
                ? jpResult.reason
                : new Error("Failed to load stamps masterdata");
        }

        const localMap = new Map<number, ICommunityStamp>();
        if (localList) {
            for (const item of localList) localMap.set(item.id, item);
        }

        const canonical: ICommunityStamp[] = [];
        const map = new Map<number, ICommunityStamp>();

        if (jpList) {
            for (const jpItem of jpList) {
                const localMatch = localMap.get(jpItem.id);
                const merged: ICommunityStamp = {
                    ...jpItem,
                    name: localMatch?.name || jpItem.name,
                    jpName: jpItem.name,
                    assetbundleName: jpItem.assetbundleName,
                    isCanonical: true,
                    availableOnCurrentServer: Boolean(localMatch),
                };
                canonical.push(merged);
                map.set(merged.id, merged);
            }
            // Keep current-server-only stamps in lookup map so legacy comments on the same server still render.
            if (localList) {
                for (const localItem of localList) {
                    if (!map.has(localItem.id)) {
                        map.set(localItem.id, {
                            ...localItem,
                            isCanonical: false,
                            availableOnCurrentServer: true,
                        });
                    }
                }
            }
        } else if (localList) {
            // Emergency fallback if JP endpoint is unreachable
            for (const item of localList) {
                const entry: ICommunityStamp = {
                    ...item,
                    isCanonical: true,
                    availableOnCurrentServer: true,
                };
                canonical.push(entry);
                map.set(entry.id, entry);
            }
        }

        updateSnapshot({ stamps: canonical, stampsMap: map, stampsServer: serverSource });
        return { list: canonical, map };
    });
}

export async function loadCommunityCards(serverSource: ServerSourceType = "cn"): Promise<{
    list: ICardInfo[];
    map: Map<number, ICardInfo>;
    localIds: ReadonlySet<number>;
}> {
    if (snapshot.cardsServer === serverSource && snapshot.cardsMap && snapshot.cardsLocalIds) {
        return {
            list: snapshot.cards,
            map: snapshot.cardsMap,
            localIds: snapshot.cardsLocalIds,
        };
    }
    return dedupe(`card:${serverSource}`, async () => {
        if (serverSource === "jp") {
            const jpList = await fetchMasterData<ICardInfo[]>("cards.json", false, "jp");
            const map = new Map<number, ICardInfo>();
            const localIds = new Set<number>();
            for (const item of jpList) {
                map.set(item.id, item);
                localIds.add(item.id);
            }
            updateSnapshot({
                cards: jpList,
                cardsMap: map,
                cardsLocalIds: localIds,
                cardsServer: serverSource,
            });
            return { list: jpList, map, localIds };
        }

        const [localResult, jpResult] = await Promise.allSettled([
            fetchMasterData<ICardInfo[]>("cards.json", false, serverSource),
            fetchMasterDataForServer<ICardInfo[]>("jp", "cards.json"),
        ]);

        const localList = localResult.status === "fulfilled" ? localResult.value : null;
        const jpList = jpResult.status === "fulfilled" ? jpResult.value : null;

        if (!localList && !jpList) {
            throw localResult.status === "rejected"
                ? localResult.reason
                : new Error("Failed to load cards masterdata");
        }

        const map = new Map<number, ICardInfo>();
        const localIds = new Set<number>();
        const merged: ICardInfo[] = [];

        if (localList) {
            for (const item of localList) {
                map.set(item.id, item);
                localIds.add(item.id);
                merged.push(item);
            }
        }
        // Merge JP-advance cards so card avatars / embeds referencing newer JP cards always resolve.
        if (jpList) {
            for (const jpItem of jpList) {
                if (!map.has(jpItem.id)) {
                    map.set(jpItem.id, jpItem);
                    merged.push(jpItem);
                }
            }
        }

        updateSnapshot({
            cards: merged,
            cardsMap: map,
            cardsLocalIds: localIds,
            cardsServer: serverSource,
        });
        return { list: merged, map, localIds };
    });
}

export async function loadCommunityMusics(): Promise<{
    list: IMusicInfo[];
    map: Map<number, IMusicInfo>;
}> {
    if (snapshot.musicsMap) {
        return { list: snapshot.musics, map: snapshot.musicsMap };
    }
    return dedupe("music", async () => {
        const list = await fetchMasterData<IMusicInfo[]>("musics.json");
        const map = new Map<number, IMusicInfo>();
        for (const item of list) map.set(item.id, item);
        updateSnapshot({ musics: list, musicsMap: map });
        return { list, map };
    });
}

export async function loadCommunityEvents(): Promise<{
    list: IEventInfo[];
    map: Map<number, IEventInfo>;
}> {
    if (snapshot.eventsMap) {
        return { list: snapshot.events, map: snapshot.eventsMap };
    }
    return dedupe("event", async () => {
        const list = await fetchMasterData<IEventInfo[]>("events.json");
        const map = new Map<number, IEventInfo>();
        for (const item of list) map.set(item.id, item);
        updateSnapshot({ events: list, eventsMap: map });
        return { list, map };
    });
}

export async function loadCommunityGachas(): Promise<{
    list: IGachaInfo[];
    map: Map<number, IGachaInfo>;
}> {
    if (snapshot.gachasMap) {
        return { list: snapshot.gachas, map: snapshot.gachasMap };
    }
    return dedupe("gacha", async () => {
        const list = await fetchMasterData<IGachaInfo[]>("gachas.json");
        const map = new Map<number, IGachaInfo>();
        for (const item of list) map.set(item.id, item);
        updateSnapshot({ gachas: list, gachasMap: map });
        return { list, map };
    });
}

export async function loadCommunityCostumes(): Promise<{
    list: ICostumeInfo[];
    map: Map<number, ICostumeInfo>;
}> {
    if (snapshot.costumesMap) {
        return { list: snapshot.costumes, map: snapshot.costumesMap };
    }
    return dedupe("costume", async () => {
        const data = await fetchMasterData<IMoeCostumeData>("moe_costume.json");
        const list = Array.isArray(data?.costumes) ? data.costumes : [];
        const map = new Map<number, ICostumeInfo>();
        for (const item of list) map.set(item.costumeNumber, item);
        updateSnapshot({ costumes: list, costumesMap: map });
        return { list, map };
    });
}

export async function loadCommunityVirtualLives(): Promise<{
    list: IVirtualLiveInfo[];
    map: Map<number, IVirtualLiveInfo>;
}> {
    if (snapshot.virtualLivesMap) {
        return { list: snapshot.virtualLives, map: snapshot.virtualLivesMap };
    }
    return dedupe("live", async () => {
        const list = await fetchMasterData<IVirtualLiveInfo[]>("virtualLives.json");
        const map = new Map<number, IVirtualLiveInfo>();
        for (const item of list) map.set(item.id, item);
        updateSnapshot({ virtualLives: list, virtualLivesMap: map });
        return { list, map };
    });
}

export function getCachedStamp(id: number): ICommunityStamp | undefined {
    return snapshot.stampsMap?.get(id);
}

export function useCommunityStamps(enabled = true) {
    const { serverSource, hasHydratedThemeSettings } = useTheme();
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    useEffect(() => {
        if (!enabled || !hasHydratedThemeSettings) return;
        if (state.stampsServer === serverSource && state.stampsMap) return;
        void loadCommunityStamps(serverSource).catch(() => undefined);
    }, [enabled, hasHydratedThemeSettings, serverSource, state.stampsMap, state.stampsServer]);

    const readyForServer = state.stampsServer === serverSource && Boolean(state.stampsMap);

    return {
        stamps: state.stamps,
        map: state.stampsMap,
        loading:
            enabled &&
            !readyForServer &&
            (!hasHydratedThemeSettings || state.loadingKeys.has(`stamps:${serverSource}`)),
    };
}

export function useCommunityCards(enabled = true) {
    const { serverSource, hasHydratedThemeSettings } = useTheme();
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    useEffect(() => {
        if (!enabled || !hasHydratedThemeSettings) return;
        if (state.cardsServer === serverSource && state.cardsMap) return;
        void loadCommunityCards(serverSource).catch(() => undefined);
    }, [enabled, hasHydratedThemeSettings, serverSource, state.cardsMap, state.cardsServer]);

    const readyForServer = state.cardsServer === serverSource && Boolean(state.cardsMap);

    return {
        cards: state.cards,
        cardsMap: state.cardsMap,
        localCardIds: state.cardsLocalIds,
        loading:
            enabled &&
            !readyForServer &&
            (!hasHydratedThemeSettings || state.loadingKeys.has(`card:${serverSource}`)),
    };
}

export interface EntityCatalogState {
    cards: ICardInfo[];
    cardsMap: Map<number, ICardInfo> | null;
    cardsLocalIds: ReadonlySet<number> | null;
    musics: IMusicInfo[];
    musicsMap: Map<number, IMusicInfo> | null;
    events: IEventInfo[];
    eventsMap: Map<number, IEventInfo> | null;
    gachas: IGachaInfo[];
    gachasMap: Map<number, IGachaInfo> | null;
    costumes: ICostumeInfo[];
    costumesMap: Map<number, ICostumeInfo> | null;
    virtualLives: IVirtualLiveInfo[];
    virtualLivesMap: Map<number, IVirtualLiveInfo> | null;
    loading: boolean;
}

export function useCommunityEntityLoader(types: readonly EntityLinkType[]): EntityCatalogState {
    const { serverSource, hasHydratedThemeSettings } = useTheme();
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const typeKey = Array.from(new Set(types)).sort().join(",");

    useEffect(() => {
        if (!typeKey) return;
        const needed = typeKey.split(",") as EntityLinkType[];
        if (
            needed.includes("card") &&
            hasHydratedThemeSettings &&
            (snapshot.cardsServer !== serverSource || !snapshot.cardsMap)
        ) {
            void loadCommunityCards(serverSource).catch(() => undefined);
        }
        if (needed.includes("music") && !snapshot.musicsMap) void loadCommunityMusics().catch(() => undefined);
        if (needed.includes("event") && !snapshot.eventsMap) void loadCommunityEvents().catch(() => undefined);
        if (needed.includes("gacha") && !snapshot.gachasMap) void loadCommunityGachas().catch(() => undefined);
        if (needed.includes("costume") && !snapshot.costumesMap) void loadCommunityCostumes().catch(() => undefined);
        if (needed.includes("live") && !snapshot.virtualLivesMap) void loadCommunityVirtualLives().catch(() => undefined);
    }, [hasHydratedThemeSettings, serverSource, typeKey]);

    const neededList = typeKey ? (typeKey.split(",") as EntityLinkType[]) : [];
    const loading = neededList.some((k) =>
        k === "card"
            ? state.loadingKeys.has(`card:${serverSource}`)
            : state.loadingKeys.has(k),
    );

    return {
        cards: state.cards,
        cardsMap: state.cardsMap,
        cardsLocalIds: state.cardsLocalIds,
        musics: state.musics,
        musicsMap: state.musicsMap,
        events: state.events,
        eventsMap: state.eventsMap,
        gachas: state.gachas,
        gachasMap: state.gachasMap,
        costumes: state.costumes,
        costumesMap: state.costumesMap,
        virtualLives: state.virtualLives,
        virtualLivesMap: state.virtualLivesMap,
        loading,
    };
}
