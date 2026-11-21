"use client";

/**
 * Shared lazy in-memory cache of Project SEKAI masterdata used by community
 * components (official PJSK stamps and inline entity embed cards).
 */

import { useEffect, useSyncExternalStore } from "react";
import { fetchMasterData } from "./fetch";
import type { ICardInfo, IGachaInfo } from "@/types/types";
import type { IMusicInfo } from "@/types/music";
import type { IEventInfo } from "@/types/events";
import type { ICostumeInfo, IMoeCostumeData } from "@/types/costume";
import type { EntityLinkType } from "@/types/community";

export interface ICommunityStamp {
    id: number;
    stampType: string;
    seq: number;
    name: string;
    assetbundleName: string;
    characterId1: number;
    characterId2?: number | null;
    archivePublishedAt?: number;
}

interface CatalogSnapshot {
    stamps: ICommunityStamp[];
    stampsMap: Map<number, ICommunityStamp> | null;
    stampsLoaded: boolean;
    cards: ICardInfo[];
    cardsMap: Map<number, ICardInfo> | null;
    musics: IMusicInfo[];
    musicsMap: Map<number, IMusicInfo> | null;
    events: IEventInfo[];
    eventsMap: Map<number, IEventInfo> | null;
    gachas: IGachaInfo[];
    gachasMap: Map<number, IGachaInfo> | null;
    costumes: ICostumeInfo[];
    costumesMap: Map<number, ICostumeInfo> | null;
    loadingKeys: ReadonlySet<string>;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

const INITIAL_SNAPSHOT: CatalogSnapshot = {
    stamps: [],
    stampsMap: null,
    stampsLoaded: false,
    cards: [],
    cardsMap: null,
    musics: [],
    musicsMap: null,
    events: [],
    eventsMap: null,
    gachas: [],
    gachasMap: null,
    costumes: [],
    costumesMap: null,
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

export async function loadCommunityStamps(): Promise<{
    list: ICommunityStamp[];
    map: Map<number, ICommunityStamp>;
}> {
    if (snapshot.stampsLoaded && snapshot.stampsMap) {
        return { list: snapshot.stamps, map: snapshot.stampsMap };
    }
    return dedupe("stamps", async () => {
        const list = await fetchMasterData<ICommunityStamp[]>("stamps.json");
        const map = new Map<number, ICommunityStamp>();
        for (const item of list) map.set(item.id, item);
        updateSnapshot({ stamps: list, stampsMap: map, stampsLoaded: true });
        return { list, map };
    });
}

export async function loadCommunityCards(): Promise<{
    list: ICardInfo[];
    map: Map<number, ICardInfo>;
}> {
    if (snapshot.cardsMap) {
        return { list: snapshot.cards, map: snapshot.cardsMap };
    }
    return dedupe("card", async () => {
        const list = await fetchMasterData<ICardInfo[]>("cards.json");
        const map = new Map<number, ICardInfo>();
        for (const item of list) map.set(item.id, item);
        updateSnapshot({ cards: list, cardsMap: map });
        return { list, map };
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

export function getCachedStamp(id: number): ICommunityStamp | undefined {
    return snapshot.stampsMap?.get(id);
}

export function useCommunityStamps(enabled = true) {
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    useEffect(() => {
        if (!enabled || state.stampsLoaded) return;
        void loadCommunityStamps().catch(() => undefined);
    }, [enabled, state.stampsLoaded]);

    return {
        stamps: state.stamps,
        map: state.stampsMap,
        loading: enabled && !state.stampsLoaded && state.loadingKeys.has("stamps"),
    };
}

export interface EntityCatalogState {
    cards: ICardInfo[];
    cardsMap: Map<number, ICardInfo> | null;
    musics: IMusicInfo[];
    musicsMap: Map<number, IMusicInfo> | null;
    events: IEventInfo[];
    eventsMap: Map<number, IEventInfo> | null;
    gachas: IGachaInfo[];
    gachasMap: Map<number, IGachaInfo> | null;
    costumes: ICostumeInfo[];
    costumesMap: Map<number, ICostumeInfo> | null;
    loading: boolean;
}

export function useCommunityEntityLoader(types: readonly EntityLinkType[]): EntityCatalogState {
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const typeKey = Array.from(new Set(types)).sort().join(",");

    useEffect(() => {
        if (!typeKey) return;
        const needed = typeKey.split(",") as EntityLinkType[];
        if (needed.includes("card") && !snapshot.cardsMap) void loadCommunityCards().catch(() => undefined);
        if (needed.includes("music") && !snapshot.musicsMap) void loadCommunityMusics().catch(() => undefined);
        if (needed.includes("event") && !snapshot.eventsMap) void loadCommunityEvents().catch(() => undefined);
        if (needed.includes("gacha") && !snapshot.gachasMap) void loadCommunityGachas().catch(() => undefined);
        if (needed.includes("costume") && !snapshot.costumesMap) void loadCommunityCostumes().catch(() => undefined);
    }, [typeKey]);

    const neededList = typeKey ? (typeKey.split(",") as EntityLinkType[]) : [];
    const loading = neededList.some((k) => state.loadingKeys.has(k));

    return {
        cards: state.cards,
        cardsMap: state.cardsMap,
        musics: state.musics,
        musicsMap: state.musicsMap,
        events: state.events,
        eventsMap: state.eventsMap,
        gachas: state.gachas,
        gachasMap: state.gachasMap,
        costumes: state.costumes,
        costumesMap: state.costumesMap,
        loading,
    };
}
