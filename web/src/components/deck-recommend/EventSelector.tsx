"use client";
import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { IEventInfo, IEventDeckBonus, EventType, EVENT_TYPE_COLORS, getEventStatus } from "@/types/events";
import { ICharaUnitInfo, UNIT_DATA, UNIT_ICON_FILES, UNIT_ID_LABEL_KEYS, CardAttribute, ATTR_ICON_PATHS, ATTR_NAMES } from "@/types/types";
import { fetchMasterDataForServer, type ServerSourceType } from "@/lib/fetch";
import { getCharacterIconUrl, getEventLogoUrl, getEventStoryBannerUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import { loadTranslations, TranslationData } from "@/lib/translations";
import { TranslatedText } from "@/components/common/TranslatedText";
import SelectorModal from "./SelectorModal";
import { Icon, LoadingState } from "@/components/md3";
import { mdCalendarMonth, mdImage, mdUnfoldMore } from "@/components/md3/icons";
import EventFilters, { type EventUnitFilterId } from "@/components/events/EventFilters";
import { IActionSet, IEventStory, buildEventRawUnitMap, rawUnitToFilterId, buildEventBannerCharMap } from "@/lib/eventUnit";
import { type Wl3SimulationGroup, getWl3SimulationGroupByEventId } from "@/lib/world-bloom-simulation";

// Build unit icon mapping from UNIT_DATA (same as EventItem)
const EVENT_UNIT_ICON: Record<string, { icon: string; labelKey: string }> = Object.fromEntries(
    UNIT_DATA.filter(u => UNIT_ICON_FILES[u.id]).map(u => [u.id, { icon: UNIT_ICON_FILES[u.id], labelKey: UNIT_ID_LABEL_KEYS[u.id] ?? `common.units.${u.id}` }])
);

function getWl3SimulationInfo(eventId: string): Wl3SimulationGroup | null {
    return getWl3SimulationGroupByEventId(eventId);
}

function Wl3SimulationMemberAvatars({
    members,
    size = 28,
}: {
    members: readonly number[];
    size?: number;
}) {
    const { t } = useI18n();

    return (
        <div className="flex flex-wrap gap-1.5">
            {members.map((characterId) => {
                const characterName = getCharacterName(t, characterId);
                return (
                    <div
                        key={characterId}
                        className="rounded-full ring-2 ring-surface-container-lowest overflow-hidden bg-surface-container-high"
                        title={characterName}
                        style={{ width: size, height: size }}
                    >
                        <Image
                            src={getCharacterIconUrl(characterId)}
                            alt={characterName}
                            width={size}
                            height={size}
                            className="w-full h-full object-cover"
                            unoptimized
                        />
                    </div>
                );
            })}
        </div>
    );
}

interface EventSelectorProps {
    selectedEventId: string;
    onSelect: (eventId: string, eventType?: string) => void;
    onEventTypeChange?: (eventType: string | null) => void;
    onBonusCharactersChange?: (characterIds: number[]) => void;
    server?: ServerSourceType;
}

export default function EventSelector({
    selectedEventId,
    onSelect,
    onEventTypeChange,
    onBonusCharactersChange,
    server = "jp",
}: EventSelectorProps) {
    const { assetSource, isShowSpoiler } = useTheme();
    const { t, formatDate } = useI18n();
    const [now] = useState(() => Date.now());
    const [events, setEvents] = useState<IEventInfo[]>([]);
    const [deckBonuses, setDeckBonuses] = useState<IEventDeckBonus[]>([]);
    const [charaUnits, setCharaUnits] = useState<ICharaUnitInfo[]>([]);
    const [actionSetsForUnitMap, setActionSetsForUnitMap] = useState<IActionSet[]>([]);
    const [eventStories, setEventStories] = useState<IEventStory[]>([]);
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);

    // Filters state
    const [selectedTypes, setSelectedTypes] = useState<EventType[]>([]);
    const [selectedEventUnits, setSelectedEventUnits] = useState<EventUnitFilterId[]>([]);
    const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [selectedBannerChars, setSelectedBannerChars] = useState<number[]>([]);
    const [selectedBannerUnitIds, setSelectedBannerUnitIds] = useState<string[]>([]);
    const [selectedBonusAttr, setSelectedBonusAttr] = useState<CardAttribute | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"id" | "startAt">("startAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Load all data on mount or when server changes
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchMasterDataForServer<IEventInfo[]>(server, "events.json"),
            fetchMasterDataForServer<IEventDeckBonus[]>(server, "eventDeckBonuses.json"),
            fetchMasterDataForServer<ICharaUnitInfo[]>(server, "gameCharacterUnits.json"),
            fetchMasterDataForServer<IActionSet[]>(server, "actionSets.json"),
            fetchMasterDataForServer<IEventStory[]>(server, "eventStories.json"),
            loadTranslations(),
        ])
            .then(([eventsData, bonusesData, charaUnitsData, actionSetsForUnitMapData, eventStoriesData, translationsData]) => {
                if (cancelled) return;
                setEvents(eventsData);
                setDeckBonuses(bonusesData);
                setCharaUnits(charaUnitsData);
                setActionSetsForUnitMap(actionSetsForUnitMapData);
                setEventStories(eventStoriesData);
                setTranslations(translationsData);
                setLoading(false);
            })
            .catch(err => {
                if (cancelled) return;
                console.error("Failed to load events data", err);
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [server]);

    // Derived maps — same logic as useEventListData
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

    // Map: gameCharacterUnitId → gameCharacterId
    const charUnitToCharId = useMemo(() => {
        const map = new Map<number, number>();
        for (const cu of charaUnits) {
            map.set(cu.id, cu.gameCharacterId);
        }
        return map;
    }, [charaUnits]);

    // Compute bonus characterIds for the currently selected event
    const selectedEventBonusCharacterIds = useMemo(() => {
        const eid = parseInt(selectedEventId, 10);
        if (!eid) return [];
        const bonusUnitIds = eventBonusCharMap.get(eid);
        if (!bonusUnitIds) return [];
        const charIdSet = new Set<number>();
        for (const unitId of bonusUnitIds) {
            const charId = charUnitToCharId.get(unitId);
            if (charId !== undefined) charIdSet.add(charId);
        }
        return [...charIdSet].sort((a, b) => a - b);
    }, [selectedEventId, eventBonusCharMap, charUnitToCharId]);

    // Notify parent of bonus characters when selection changes
    useEffect(() => {
        onBonusCharactersChange?.(selectedEventBonusCharacterIds);
    }, [selectedEventBonusCharacterIds, onBonusCharactersChange]);

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

    const eventBannerCharMapDerived = useMemo(() => {
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

    // Filter events — same logic as useEventListData
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
                const bannerCharId = eventBannerCharMapDerived.get(e.id);
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
            result = result.filter(e => e.startAt <= now);
        }

        result.sort((a, b) => {
            const cmp = sortBy === "startAt" ? a.startAt - b.startAt : a.id - b.id;
            return sortOrder === "asc" ? cmp : -cmp;
        });

        return result;
     
    }, [events, selectedTypes, selectedEventUnits, eventUnitMap, selectedCharacters, eventBonusCharMap, vsCharAllUnitIds, selectedBannerChars, eventBannerCharMapDerived, selectedBonusAttr, eventBonusAttrMap, searchQuery, sortBy, sortOrder, translations, isShowSpoiler, now]);

    // Get currently selected event object
    const selectedEvent = useMemo(() => {
        if (!selectedEventId) return null;
        return events.find(e => e.id.toString() === selectedEventId) || null;
    }, [events, selectedEventId]);

    const selectedWl3Simulation = useMemo(() => {
        return getWl3SimulationInfo(selectedEventId);
    }, [selectedEventId]);

    // Notify parent of event type when selected event resolves (including initial load)
    useEffect(() => {
        onEventTypeChange?.(selectedEvent?.eventType ?? (selectedWl3Simulation ? "world_bloom" : null));
    }, [selectedEvent, selectedWl3Simulation, onEventTypeChange]);

    const handleSelect = (event: IEventInfo) => {
        onSelect(event.id.toString(), event.eventType);
        setModalOpen(false);
    };

    const handleReset = () => {
        setSelectedTypes([]);
        setSelectedEventUnits([]);
        setSelectedCharacters([]);
        setSelectedUnitIds([]);
        setSelectedBannerChars([]);
        setSelectedBannerUnitIds([]);
        setSelectedBonusAttr(null);
        setSearchQuery("");
        setSortBy("startAt");
        setSortOrder("desc");
    };

    // Thumbnail for the trigger button
    const selectedEventThumbnail = useMemo(() => {
        if (!selectedEvent) return "";
        const hasStoryBanner = eventStoryIds.has(selectedEvent.id);
        return hasStoryBanner
            ? getEventStoryBannerUrl(selectedEvent.assetbundleName, assetSource)
            : getEventLogoUrl(selectedEvent.assetbundleName, assetSource);
    }, [selectedEvent, eventStoryIds, assetSource]);

    const selectedEventHasStoryBanner = selectedEvent ? eventStoryIds.has(selectedEvent.id) : false;
    const selectedWl3GroupTitle = selectedWl3Simulation
        ? t("page.deckRecommend.wl3GroupTitle", { group: selectedWl3Simulation.groupId })
        : "";

    return (
        <div className="w-full">
            <label className="mb-1 block type-label-l text-on-surface-variant">
                {t("page.deckRecommend.selector.eventId")} <span className="text-error">*</span>
            </label>

            <button
                onClick={() => setModalOpen(true)}
                className="state-layer focus-ring group flex w-full items-center gap-3 rounded-md3-md border border-outline bg-surface-container-lowest p-3 text-left transition-colors hover:border-on-surface"
            >
                {selectedEvent ? (
                    <>
                        <div className="relative w-16 aspect-video bg-surface-container-high rounded-md3-sm overflow-hidden flex-shrink-0">
                            <Image
                                src={selectedEventThumbnail}
                                alt={selectedEvent.name}
                                fill
                                className={`object-contain ${selectedEventHasStoryBanner ? "" : "p-1"}`}
                                unoptimized
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="type-label-s font-mono text-on-surface-variant bg-surface-container-high px-1.5 rounded-md3-xs">
                                    #{selectedEvent.id}
                                </span>
                                <span className="type-label-s text-on-surface-variant">
                                    {formatDate(selectedEvent.startAt)}
                                </span>
                            </div>
                            <div className="type-title-s text-on-surface truncate group-hover:text-primary transition-colors">
                                {selectedEvent.name}
                            </div>
                            {translations?.events?.name?.[selectedEvent.name] && (
                                <div className="type-body-s text-on-surface-variant truncate">
                                    {translations.events.name[selectedEvent.name]}
                                </div>
                            )}
                        </div>
                    </>
                ) : selectedWl3Simulation ? (
                    <>
                        <div className="w-16 aspect-video rounded-md3-sm flex-shrink-0 bg-tertiary flex items-center justify-center">
                            <span className="text-on-tertiary type-label-l type-emphasized tracking-wide">WL3</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="type-label-s font-mono text-on-tertiary-container bg-tertiary-container px-1.5 rounded-md3-xs">
                                    #{selectedWl3Simulation.eventId}
                                </span>
                                <span className="type-label-s text-on-tertiary-container bg-tertiary-container px-1.5 rounded-md3-xs">
                                    {t("page.deckRecommend.selector.simulation")}
                                </span>
                            </div>
                            <div className="type-title-s text-on-surface truncate group-hover:text-primary transition-colors">
                                {t("page.deckRecommend.selector.wl3SimulationTitle", { title: selectedWl3GroupTitle })}
                            </div>
                            <div className="mt-2">
                                <Wl3SimulationMemberAvatars members={selectedWl3Simulation.members} size={24} />
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-16 aspect-video bg-surface-container-high rounded-md3-sm flex items-center justify-center text-on-surface-variant">
                            <Icon path={mdImage} size={24} />
                        </div>
                        <span className="type-body-m text-on-surface-variant">{t("page.deckRecommend.selector.selectEventPlaceholder")}</span>
                    </>
                )}
                <Icon path={mdUnfoldMore} size={20} className="shrink-0 text-on-surface-variant" />
            </button>

            <SelectorModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={t("page.deckRecommend.selector.selectEventTitle")}
            >
                <div className="space-y-6">
                    <EventFilters
                        selectedTypes={selectedTypes}
                        onTypeChange={setSelectedTypes}
                        selectedEventUnits={selectedEventUnits}
                        onEventUnitChange={setSelectedEventUnits}
                        selectedCharacters={selectedCharacters}
                        onCharacterChange={setSelectedCharacters}
                        selectedUnitIds={selectedUnitIds}
                        onUnitIdsChange={setSelectedUnitIds}
                        charaUnits={charaUnits}
                        selectedBannerChars={selectedBannerChars}
                        onBannerCharsChange={setSelectedBannerChars}
                        selectedBannerUnitIds={selectedBannerUnitIds}
                        onBannerUnitIdsChange={setSelectedBannerUnitIds}
                        selectedBonusAttr={selectedBonusAttr}
                        onBonusAttrChange={setSelectedBonusAttr}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSortChange={(nextSortBy, nextSortOrder) => {
                            setSortBy(nextSortBy);
                            setSortOrder(nextSortOrder);
                        }}
                        onReset={handleReset}
                        totalEvents={events.length}
                        filteredEvents={filteredEvents.length}
                    />

                    {loading ? (
                        <LoadingState label={t("common.state.loading")} className="min-h-[30vh]" />
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            {filteredEvents.slice(0, 50).map(event => (
                                <EventSelectionItem
                                    key={event.id}
                                    event={event}
                                    isSpoiler={event.startAt > now}
                                    unitType={eventUnitMap.get(event.id)}
                                    bonusAttr={eventBonusAttrMap.get(event.id)}
                                    eventStoryIds={eventStoryIds}
                                    onClick={() => handleSelect(event)}
                                />
                            ))}
                            {filteredEvents.length > 50 && (
                                <div className="col-span-full py-4 text-center type-body-m text-on-surface-variant">
                                    {t("page.deckRecommend.selector.first50Only")}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </SelectorModal>
        </div>
    );
}

// EventItem-style card for selection (div instead of Link)
function EventSelectionItem({
    event,
    isSpoiler,
    unitType,
    bonusAttr,
    eventStoryIds,
    onClick,
}: {
    event: IEventInfo;
    isSpoiler?: boolean;
    unitType?: string;
    bonusAttr?: string;
    eventStoryIds?: Set<number>;
    onClick: () => void;
}) {
    const { assetSource } = useTheme();
    const { t, formatDate } = useI18n();
    const hasEventStoryBanner = eventStoryIds ? eventStoryIds.has(event.id) : true;
    const thumbnailUrl = hasEventStoryBanner
        ? getEventStoryBannerUrl(event.assetbundleName, assetSource)
        : getEventLogoUrl(event.assetbundleName, assetSource);
    const status = getEventStatus(event);
    const statusColor = status === "upcoming" ? "#42A5F5" : status === "ongoing" ? "#66BB6A" : "#9E9E9E";

    return (
        <div
            onClick={onClick}
            className="group block cursor-pointer"
        >
            <div className="state-layer overflow-hidden rounded-md3-md bg-surface-container-low shadow-elev-1 transition-shadow duration-200 ease-md3-standard hover:shadow-elev-2">
                {/* Event Thumbnail */}
                <div className="relative aspect-[16/9] bg-surface-container-high overflow-hidden">
                    <Image
                        src={thumbnailUrl}
                        alt={event.name}
                        fill
                        className={`object-contain ${hasEventStoryBanner ? "" : "p-4"}`}
                        unoptimized
                    />

                    {/* Status Badge */}
                    <div
                        className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold text-white"
                        style={{ backgroundColor: statusColor }}
                    >
                        {t(`common.status.${status}`)}
                    </div>

                    {/* Event Type Badge */}
                    <div
                        className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold text-white"
                        style={{ backgroundColor: EVENT_TYPE_COLORS[event.eventType as EventType] }}
                    >
                        {t(`common.eventTypes.${event.eventType}`)}
                    </div>

                    {/* Spoiler Badge */}
                    {isSpoiler && (
                        <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 px-1.5 sm:px-2 py-0.5 bg-error rounded-full text-[10px] sm:text-xs font-bold text-on-error">
                            {t("common.badge.spoiler")}
                        </div>
                    )}
                </div>

                {/* Event Info */}
                <div className="p-2.5 sm:p-4">
                    {/* ID Badge + Unit Badge */}
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <span className="px-1.5 sm:px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-[10px] sm:text-xs font-mono rounded-md3-sm">
                            #{event.id}
                        </span>
                        {unitType && (
                            EVENT_UNIT_ICON[unitType] ? (
                                <div className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center" title={t(EVENT_UNIT_ICON[unitType].labelKey)}>
                                    <Image
                                        src={`/data/icon/${EVENT_UNIT_ICON[unitType].icon}`}
                                        alt={t(EVENT_UNIT_ICON[unitType].labelKey)}
                                        width={16}
                                        height={16}
                                        className="object-contain"
                                        unoptimized
                                    />
                                </div>
                            ) : (
                                <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant text-[10px] font-bold rounded-md3-sm" title={t("common.badge.mixed")}>{t("common.badge.mixed")}</span>
                            )
                        )}
                        {bonusAttr && ATTR_ICON_PATHS[bonusAttr as keyof typeof ATTR_ICON_PATHS] && (
                            <div className="w-5 h-5 flex items-center justify-center" title={ATTR_NAMES[bonusAttr as keyof typeof ATTR_NAMES]}>
                                <Image
                                    src={`/data/icon/${ATTR_ICON_PATHS[bonusAttr as keyof typeof ATTR_ICON_PATHS]}`}
                                    alt={ATTR_NAMES[bonusAttr as keyof typeof ATTR_NAMES] || bonusAttr}
                                    width={16}
                                    height={16}
                                    className="object-contain"
                                    unoptimized
                                />
                            </div>
                        )}
                    </div>

                    {/* Event Name */}
                    <h3 className="type-title-s text-on-surface mb-1.5 sm:mb-2 group-hover:text-primary transition-colors">
                        <TranslatedText
                            original={event.name}
                            category="events"
                            field="name"
                            originalClassName=""
                            translationClassName="type-body-s text-on-surface-variant mt-0.5"
                        />
                    </h3>

                    {/* Date Range */}
                    <div className="type-body-s text-on-surface-variant space-y-0.5 hidden sm:block">
                        <div className="flex items-center gap-1">
                            <Icon path={mdCalendarMonth} size={14} />
                            <span>{formatDate(event.startAt, { year: "numeric", month: "short", day: "numeric" })}</span>
                            <span>~</span>
                            <span>{formatDate(event.aggregateAt, { year: "numeric", month: "short", day: "numeric" })}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
