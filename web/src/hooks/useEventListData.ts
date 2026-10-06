"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import { type EventUnitFilterId } from "@/components/events/EventFilters";
import { IEventInfo, IEventDeckBonus, EventType } from "@/types/events";
import { ICharaUnitInfo, CardAttribute } from "@/types/types";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData, fetchMasterDataForServer } from "@/lib/fetch";
import { loadTranslations, TranslationData } from "@/lib/translations";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { IActionSet, IEventStory, buildEventRawUnitMap, rawUnitToFilterId, buildEventBannerCharMap } from "@/lib/eventUnit";

// ---------------------------------------------------------------------------
// Hook config & return type
// ---------------------------------------------------------------------------

export interface UseEventListDataConfig {
    /** Storage key prefix, e.g. "events" or "storyEvent" */
    storageKey: string;
    /** URL base path, e.g. "/events" or "/story/event" */
    basePath: string;
}

export interface UseEventListDataReturn {
    // Data
    events: IEventInfo[];
    charaUnits: ICharaUnitInfo[];
    translations: TranslationData | null;
    eventUnitMap: Map<number, string>;
    eventBannerCharMap: Map<number, number>;
    eventBonusAttrMap: Map<number, string>;
    eventStoryIds: Set<number>;
    isLoading: boolean;
    error: string | null;

    // Filtered / displayed
    filteredEvents: IEventInfo[];
    displayedEvents: IEventInfo[];

    // Filter state
    selectedTypes: EventType[];
    setSelectedTypes: (v: EventType[]) => void;
    selectedEventUnits: EventUnitFilterId[];
    setSelectedEventUnits: (v: EventUnitFilterId[]) => void;
    selectedCharacters: number[];
    setSelectedCharacters: (v: number[]) => void;
    selectedUnitIds: string[];
    setSelectedUnitIds: (v: string[]) => void;
    selectedBannerChars: number[];
    setSelectedBannerChars: (v: number[]) => void;
    selectedBannerUnitIds: string[];
    setSelectedBannerUnitIds: (v: string[]) => void;
    selectedBonusAttr: CardAttribute | null;
    setSelectedBonusAttr: (v: CardAttribute | null) => void;
    searchQuery: string;
    setSearchQuery: (v: string) => void;

    // Sort
    sortBy: "id" | "startAt";
    sortOrder: "asc" | "desc";
    handleSortChange: (sortBy: "id" | "startAt", sortOrder: "asc" | "desc") => void;

    // Actions
    resetFilters: () => void;
    loadMore: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEventListData({ storageKey }: UseEventListDataConfig): UseEventListDataReturn {
    const searchParams = useSearchParams();
    const { isShowSpoiler } = useTheme();

    // Raw data
    const [events, setEvents] = useState<IEventInfo[]>([]);
    const [deckBonuses, setDeckBonuses] = useState<IEventDeckBonus[]>([]);
    const [charaUnits, setCharaUnits] = useState<ICharaUnitInfo[]>([]);
    const [actionSetsForUnitMap, setActionSetsForUnitMap] = useState<IActionSet[]>([]);
    const [eventStories, setEventStories] = useState<IEventStory[]>([]);
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    // Filter states
    const [selectedTypes, setSelectedTypes] = useState<EventType[]>([]);
    const [selectedEventUnits, setSelectedEventUnits] = useState<EventUnitFilterId[]>([]);
    const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [selectedBannerChars, setSelectedBannerChars] = useState<number[]>([]);
    const [selectedBannerUnitIds, setSelectedBannerUnitIds] = useState<string[]>([]);
    const [selectedBonusAttr, setSelectedBonusAttr] = useState<CardAttribute | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Sort states
    const [sortBy, setSortBy] = useState<"id" | "startAt">("id");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Pagination
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey,
        defaultDisplayCount: 12,
        increment: 12,
        isReady: !isLoading,
    });

    const STORAGE_KEY = `${storageKey}_filters`;

    // ---- Initialize filters from URL / sessionStorage ----
    useEffect(() => {
        const types = searchParams.get("types");
        const eventUnits = searchParams.get("eventUnits");
        const chars = searchParams.get("characters");
        const units = searchParams.get("units");
        const bannerChars = searchParams.get("bannerChars");
        const bannerUnits = searchParams.get("bannerUnits");
        const bonusAttr = searchParams.get("bonusAttr");
        const search = searchParams.get("search");
        const sort = searchParams.get("sortBy");
        const order = searchParams.get("sortOrder");

        const hasUrlParams = types || eventUnits || chars || units || bannerChars || bannerUnits || bonusAttr || search || sort || order;

        if (hasUrlParams) {
            if (types) setSelectedTypes(types.split(",") as EventType[]);
            if (eventUnits) setSelectedEventUnits(eventUnits.split(",") as EventUnitFilterId[]);
            if (chars) setSelectedCharacters(chars.split(",").map(Number));
            if (units) setSelectedUnitIds(units.split(","));
            if (bannerChars) setSelectedBannerChars(bannerChars.split(",").map(Number));
            if (bannerUnits) setSelectedBannerUnitIds(bannerUnits.split(","));
            if (bonusAttr) setSelectedBonusAttr(bonusAttr as CardAttribute);
            if (search) setSearchQuery(search);
            if (sort) setSortBy(sort as "id" | "startAt");
            if (order) setSortOrder(order as "asc" | "desc");
        } else {
            try {
                const saved = sessionStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const f = JSON.parse(saved);
                    if (f.types?.length) setSelectedTypes(f.types);
                    if (f.eventUnits?.length) setSelectedEventUnits(f.eventUnits);
                    if (f.characters?.length) setSelectedCharacters(f.characters);
                    if (f.units?.length) setSelectedUnitIds(f.units);
                    if (f.bannerChars?.length) setSelectedBannerChars(f.bannerChars);
                    if (f.bannerUnits?.length) setSelectedBannerUnitIds(f.bannerUnits);
                    if (f.bonusAttr) setSelectedBonusAttr(f.bonusAttr);
                    if (f.search) setSearchQuery(f.search);
                    if (f.sortBy) setSortBy(f.sortBy);
                    if (f.sortOrder) setSortOrder(f.sortOrder);
                }
            } catch {
                // ignore
            }
        }
        setFiltersInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- Persist filters ----
    useEffect(() => {
        if (!filtersInitialized) return;

        const filters = {
            types: selectedTypes,
            eventUnits: selectedEventUnits,
            characters: selectedCharacters,
            units: selectedUnitIds,
            bannerChars: selectedBannerChars,
            bannerUnits: selectedBannerUnitIds,
            bonusAttr: selectedBonusAttr,
            search: searchQuery,
            sortBy,
            sortOrder,
        };
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch { /* ignore */ }

        const params = new URLSearchParams();
        const currentView = new URLSearchParams(window.location.search).get("view");
        if (currentView === "table" || currentView === "list") params.set("view", "table");
        if (selectedTypes.length > 0) params.set("types", selectedTypes.join(","));
        if (selectedEventUnits.length > 0) params.set("eventUnits", selectedEventUnits.join(","));
        if (selectedCharacters.length > 0) params.set("characters", selectedCharacters.join(","));
        if (selectedUnitIds.length > 0) params.set("units", selectedUnitIds.join(","));
        if (selectedBannerChars.length > 0) params.set("bannerChars", selectedBannerChars.join(","));
        if (selectedBannerUnitIds.length > 0) params.set("bannerUnits", selectedBannerUnitIds.join(","));
        if (selectedBonusAttr) params.set("bonusAttr", selectedBonusAttr);
        if (searchQuery) params.set("search", searchQuery);
        if (sortBy !== "id") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        replaceCurrentUrlSearchParams(params);
    }, [selectedTypes, selectedEventUnits, selectedCharacters, selectedUnitIds, selectedBannerChars, selectedBannerUnitIds, selectedBonusAttr, searchQuery, sortBy, sortOrder, filtersInitialized, STORAGE_KEY]);

    // ---- Fetch data ----
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const [eventsData, bonusesData, charaUnitsData, actionSetsForUnitMapData, eventStoriesData, translationsData] = await Promise.all([
                    fetchMasterData<IEventInfo[]>("events.json"),
                    fetchMasterData<IEventDeckBonus[]>("eventDeckBonuses.json"),
                    fetchMasterData<ICharaUnitInfo[]>("gameCharacterUnits.json"),
                    fetchMasterDataForServer<IActionSet[]>("jp", "actionSets.json"),
                    fetchMasterData<IEventStory[]>("eventStories.json"),
                    loadTranslations(),
                ]);
                setEvents(eventsData);
                setDeckBonuses(bonusesData);
                setCharaUnits(charaUnitsData);
                setActionSetsForUnitMap(actionSetsForUnitMapData);
                setEventStories(eventStoriesData);
                setTranslations(translationsData);
                setError(null);
            } catch (err) {
                console.error("Error fetching events:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, []);

    // ---- Derived maps ----
    const eventBonusCharMap = useMemo(() => {
        const map = new Map<number, Set<number>>();
        for (const bonus of deckBonuses) {
            if (bonus.gameCharacterUnitId) {
                if (!map.has(bonus.eventId)) map.set(bonus.eventId, new Set());
                map.get(bonus.eventId)!.add(bonus.gameCharacterUnitId);
            }
        }
        return map;
    }, [deckBonuses]);

    const vsCharAllUnitIds = useMemo(() => {
        const map = new Map<number, number[]>();
        for (const cu of charaUnits) {
            if (cu.gameCharacterId >= 21 && cu.gameCharacterId <= 26) {
                if (!map.has(cu.gameCharacterId)) map.set(cu.gameCharacterId, []);
                map.get(cu.gameCharacterId)!.push(cu.id);
            }
        }
        return map;
    }, [charaUnits]);

    const eventUnitMap = useMemo(() => {
        if (actionSetsForUnitMap.length === 0) return new Map<number, string>();
        const rawMap = buildEventRawUnitMap(actionSetsForUnitMap);
        const filterMap = new Map<number, string>();
        for (const [eventId, rawType] of rawMap) {
            filterMap.set(eventId, rawUnitToFilterId(rawType));
        }
        return filterMap;
    }, [actionSetsForUnitMap]);

    const eventBannerCharMap = useMemo(() => {
        if (eventStories.length === 0 || charaUnits.length === 0) return new Map<number, number>();
        return buildEventBannerCharMap(eventStories, charaUnits);
    }, [eventStories, charaUnits]);

    const eventBonusAttrMap = useMemo(() => {
        const map = new Map<number, string>();
        for (const bonus of deckBonuses) {
            if (bonus.cardAttr && !bonus.gameCharacterUnitId) {
                map.set(bonus.eventId, bonus.cardAttr);
            }
        }
        return map;
    }, [deckBonuses]);

    const eventStoryIds = useMemo(() => new Set(eventStories.map(s => s.eventId)), [eventStories]);

    // ---- Filter & sort ----
    const filteredEvents = useMemo(() => {
        let result = [...events];

        if (selectedTypes.length > 0) {
            result = result.filter(e => selectedTypes.includes(e.eventType as EventType));
        }

        if (selectedEventUnits.length > 0) {
            result = result.filter(e => {
                const uid = eventUnitMap.get(e.id);
                return uid ? selectedEventUnits.includes(uid as EventUnitFilterId) : false;
            });
        }

        if (selectedCharacters.length > 0) {
            result = result.filter(e => {
                const bonusUnitIds = eventBonusCharMap.get(e.id);
                if (!bonusUnitIds) return false;
                return selectedCharacters.every(charId => {
                    if (charId >= 21 && charId <= 26) {
                        const allIds = vsCharAllUnitIds.get(charId);
                        return allIds ? allIds.some(id => bonusUnitIds.has(id)) : false;
                    }
                    return bonusUnitIds.has(charId);
                });
            });
        }

        if (selectedBannerChars.length > 0) {
            result = result.filter(e => {
                if (e.eventType === "world_bloom") return false;
                const bannerCharId = eventBannerCharMap.get(e.id);
                return bannerCharId !== undefined && selectedBannerChars.includes(bannerCharId);
            });
        }

        if (selectedBonusAttr) {
            result = result.filter(e => eventBonusAttrMap.get(e.id) === selectedBonusAttr);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const qNum = parseInt(q, 10);
            result = result.filter(e => {
                if (e.id === qNum) return true;
                if (e.name.toLowerCase().includes(q)) return true;
                const cn = translations?.events?.name?.[e.name];
                if (cn && cn.toLowerCase().includes(q)) return true;
                return false;
            });
        }

        if (!isShowSpoiler) {
            result = result.filter(e => e.startAt <= Date.now());
        }

        result.sort((a, b) => {
            const cmp = sortBy === "startAt" ? a.startAt - b.startAt : a.id - b.id;
            return sortOrder === "asc" ? cmp : -cmp;
        });

        return result;
    }, [events, selectedTypes, selectedEventUnits, eventUnitMap, selectedCharacters, eventBonusCharMap, vsCharAllUnitIds, selectedBannerChars, eventBannerCharMap, selectedBonusAttr, eventBonusAttrMap, searchQuery, sortBy, sortOrder, isShowSpoiler, translations]);

    const displayedEvents = useMemo(() => filteredEvents.slice(0, displayCount), [filteredEvents, displayCount]);

    // ---- Actions ----
    const resetFilters = useCallback(() => {
        setSelectedTypes([]);
        setSelectedEventUnits([]);
        setSelectedCharacters([]);
        setSelectedUnitIds([]);
        setSelectedBannerChars([]);
        setSelectedBannerUnitIds([]);
        setSelectedBonusAttr(null);
        setSearchQuery("");
        setSortBy("id");
        setSortOrder("desc");
        resetDisplayCount();
    }, [resetDisplayCount]);

    const handleSortChange = useCallback((newSortBy: "id" | "startAt", newSortOrder: "asc" | "desc") => {
        setSortBy(newSortBy);
        setSortOrder(newSortOrder);
        resetDisplayCount();
    }, [resetDisplayCount]);

    return {
        events,
        charaUnits,
        translations,
        eventUnitMap,
        eventBannerCharMap,
        eventBonusAttrMap,
        eventStoryIds,
        isLoading,
        error,
        filteredEvents,
        displayedEvents,
        selectedTypes,
        setSelectedTypes,
        selectedEventUnits,
        setSelectedEventUnits,
        selectedCharacters,
        setSelectedCharacters,
        selectedUnitIds,
        setSelectedUnitIds,
        selectedBannerChars,
        setSelectedBannerChars,
        selectedBannerUnitIds,
        setSelectedBannerUnitIds,
        selectedBonusAttr,
        setSelectedBonusAttr,
        searchQuery,
        setSearchQuery,
        sortBy,
        sortOrder,
        handleSortChange,
        resetFilters,
        loadMore,
    };
}
