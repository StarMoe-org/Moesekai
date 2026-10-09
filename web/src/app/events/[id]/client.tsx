"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import MainLayout from "@/components/MainLayout";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import { useI18n } from "@/contexts/I18nContext";
import {
    IEventInfo,
    IEventDeckBonus,
    EVENT_TYPE_COLORS,
    getEventStatus,
    EVENT_STATUS_DISPLAY,
    EventType
} from "@/types/events";
import { IActionSet, IEventStory, buildEventRawUnitMap, rawUnitToFilterId, getEventUnitFilterId, buildEventBannerCharMap } from "@/lib/eventUnit";
import { type EventUnitFilterId } from "@/components/events/EventFilters";
import { getEventLogoUrl, getCharacterIconUrl, getEventBannerUrl, getEventCharacterUrl, getEventStoryBannerUrl, getMusicJacketUrl, getVirtualLiveBannerUrl, getEventBgmUrl } from "@/lib/assets";
import { UNIT_FIELD_LABEL_KEYS } from "@/types/types";
import type { ICardInfo, ICharaUnitInfo, IGameChara } from "@/types/types";
import { isTrainableCard, getCardDefaultTrainedStatus } from "@/types/types";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import { getCharacterName } from "@/lib/i18n";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { fetchMasterData, fetchMasterDataForServer } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import ImagePreviewModal from "@/components/common/ImagePreviewModal";
import { Button, Card, EmptyState, Icon, IconButton, LoadingState, PageContainer, SectionCard, Slider, Tabs } from "@/components/md3";
import {
    mdArrowBack,
    mdChevronRight,
    mdDownload,
    mdEventBusy,
    mdForum,
    mdInfo,
    mdLibraryMusic,
    mdLiveTv,
    mdMenuBook,
    mdMusicNote,
    mdPauseFill,
    mdPlayArrowFill,
    mdStyle,
    mdTrendingUp,
    mdZoomIn,
} from "@/components/md3/icons";

// Asset URL helpers - Now imported from @/lib/assets

// Local attribute icon mapping
const LOCAL_ATTR_ICONS: Record<string, string> = {
    cool: "/data/icon/Cool.webp",
    cute: "/data/icon/cute.webp",
    happy: "/data/icon/Happy.webp",
    mysterious: "/data/icon/Mysterious.webp",
    pure: "/data/icon/Pure.webp",
};

// Attribute display names
const ATTR_NAMES: Record<string, string> = {
    cool: "Cool",
    cute: "Cute",
    happy: "Happy",
    mysterious: "Mysterious",
    pure: "Pure",
};

interface IEventCard {
    id: number;
    cardId: number;
    eventId: number;
    bonusRate: number;
}

interface IEventMusic {
    eventId: number;
    musicId: number;
    seq: number;
}

interface ICard {
    id: number;
    assetbundleName: string;
    prefix: string;
    characterId: number;
    cardRarityType: string;
    attr: string;
}

interface IMusic {
    id: number;
    title: string;
    assetbundleName: string;
}

interface IVirtualLiveInfo {
    id: number;
    name: string;
    assetbundleName: string;
}

// API URL for event-virtual live mapping
const EVENT_VIRTUAL_LIVE_MAP_URL = (process.env.NEXT_PUBLIC_API_URL || "") + "/api/event-virtuallive-map";



export default function EventDetailPage() {
    const { t, formatDate: formatLocaleDate } = useI18n();
    const params = useParams();
    const _router = useRouter();
    const searchParams = useSearchParams();
    const eventId = Number(params.id);
    const isScreenshotMode = searchParams.get('mode') === 'screenshot';

    const [event, setEvent] = useState<IEventInfo | null>(null);
    const [deckBonuses, setDeckBonuses] = useState<IEventDeckBonus[]>([]);
    const [eventCards, setEventCards] = useState<IEventCard[]>([]);
    const [eventMusics, setEventMusics] = useState<IEventMusic[]>([]);
    const [allCards, setAllCards] = useState<ICard[]>([]);
    const [allMusics, setAllMusics] = useState<IMusic[]>([]);
    const [gameCharacterUnits, setGameCharacterUnits] = useState<ICharaUnitInfo[]>([]);
    const [gameCharacters, setGameCharacters] = useState<IGameChara[]>([]);
    const [eventUnitMap, setEventUnitMap] = useState<Map<number, EventUnitFilterId>>(new Map());
    const [bannerCharId, setBannerCharId] = useState<number | null>(null);
    const [hasEventStory, setHasEventStory] = useState(true);
    const [virtualLive, setVirtualLive] = useState<IVirtualLiveInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [activeImageTab, setActiveImageTab] = useState<"event_story_banner" | "logo" | "banner" | "character">("event_story_banner");
    const [imageViewerOpen, setImageViewerOpen] = useState(false);
    const { useTrainedThumbnail, assetSource } = useTheme();
    const { setDetailName } = useBreadcrumb();

    // Set mounted state
    useEffect(() => {
        setMounted(true);
    }, []);

    // Set breadcrumb detail name
    useEffect(() => {
        if (event) setDetailName(event.name);
    }, [event, setDetailName]);

    // Fetch data
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const [eventsData, bonusesData, eventCardsData, eventMusicsData, cardsData, musicsData, charUnitsData, gameCharsData, actionSetsForUnitMapData, eventStoriesData] = await Promise.all([
                    fetchMasterData<IEventInfo[]>("events.json"),
                    fetchMasterData<IEventDeckBonus[]>("eventDeckBonuses.json"),
                    fetchMasterData<IEventCard[]>("eventCards.json"),
                    fetchMasterData<IEventMusic[]>("eventMusics.json"),
                    fetchMasterData<ICard[]>("cards.json"),
                    fetchMasterData<IMusic[]>("musics.json"),
                    fetchMasterData<ICharaUnitInfo[]>("gameCharacterUnits.json"),
                    fetchMasterData<IGameChara[]>("gameCharacters.json"),
                    fetchMasterDataForServer<IActionSet[]>("jp", "actionSets.json"),
                    fetchMasterData<IEventStory[]>("eventStories.json"),
                ]);

                const foundEvent = eventsData.find(e => e.id === eventId);
                if (!foundEvent) {
                    throw new Error(`Event ${eventId} not found`);
                }

                setEvent(foundEvent);
                document.title = `Moesekai - ${foundEvent.name}`;
                setDeckBonuses(bonusesData.filter(b => b.eventId === eventId));
                setEventCards(eventCardsData.filter(c => c.eventId === eventId));
                setEventMusics(eventMusicsData.filter(m => m.eventId === eventId));
                setAllCards(cardsData);
                setAllMusics(musicsData);
                setGameCharacterUnits(charUnitsData);
                setGameCharacters(gameCharsData);
                // Build event unit map from actionSets (always fetched from JP server)
                const rawMap = buildEventRawUnitMap(actionSetsForUnitMapData);
                const unitMap = new Map<number, EventUnitFilterId>();
                for (const [eid, rawType] of rawMap) {
                    unitMap.set(eid, rawUnitToFilterId(rawType));
                }
                setEventUnitMap(unitMap);
                // Build banner character
                const bannerMap = buildEventBannerCharMap(eventStoriesData, charUnitsData);
                setBannerCharId(bannerMap.get(eventId) ?? null);
                // Check if this event has event stories
                setHasEventStory(eventStoriesData.some(s => s.eventId === eventId));
                setError(null);
            } catch (err) {
                console.error("Error fetching event:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        if (Number.isFinite(eventId)) {
            fetchData();
        } else {
            setIsLoading(false);
        }
    }, [eventId]);

    // Fetch virtual live data
    useEffect(() => {
        async function fetchVirtualLive() {
            try {
                const res = await fetch(EVENT_VIRTUAL_LIVE_MAP_URL);
                if (res.ok) {
                    const data: Record<string, IVirtualLiveInfo> = await res.json();
                    const vlInfo = data[eventId.toString()];
                    setVirtualLive(vlInfo || null);
                }
            } catch (err) {
                console.error("Error fetching virtual live:", err);
            }
        }
        if (eventId) {
            fetchVirtualLive();
        }
    }, [eventId]);

    // Get bonus attribute
    const bonusAttr = useMemo(() => {
        const attrBonus = deckBonuses.find(b => b.cardAttr && !b.gameCharacterUnitId);
        return attrBonus?.cardAttr;
    }, [deckBonuses]);

    // Get bonus characters with unit info for piapro characters
    const bonusCharacters = useMemo(() => {
        const seen = new Set<number>();
        return deckBonuses
            .filter(b => b.gameCharacterUnitId)
            .map(b => {
                const unitId = b.gameCharacterUnitId!;
                if (seen.has(unitId)) return null;
                seen.add(unitId);

                const charUnit = gameCharacterUnits.find(u => u.id === unitId);
                if (!charUnit) return null;

                const charId = charUnit.gameCharacterId;
                const gameChar = gameCharacters.find(c => c.id === charId);
                const baseName = getCharacterName(t, charId);

                // If piapro character and belongs to a specific group (not piapro itself)
                let displayName = baseName;
                if (gameChar?.unit === "piapro" && charUnit.unit !== "piapro") {
                    const groupNameKey = UNIT_FIELD_LABEL_KEYS[charUnit.unit];
                    if (groupNameKey) {
                        displayName = `${baseName} (${t(groupNameKey)})`;
                    }
                }

                return { charId, unitId, displayName };
            })
            .filter((item): item is { charId: number; unitId: number; displayName: string } => item !== null)
            .sort((a, b) => a.charId - b.charId);
    }, [deckBonuses, gameCharacterUnits, gameCharacters, t]);

    // Get event cards with full card info
    const eventCardsWithInfo = useMemo(() => {
        return eventCards
            .map(ec => {
                const card = allCards.find(c => c.id === ec.cardId);
                return card ? { ...ec, card } : null;
            })
            .filter((c): c is (IEventCard & { card: ICard }) => c !== null);
    }, [eventCards, allCards]);

    // Get theme songs
    const themeSongs = useMemo(() => {
        return eventMusics.map(em => {
            return allMusics.find(m => m.id === em.musicId);
        }).filter((m): m is IMusic => !!m);
    }, [eventMusics, allMusics]);

    // Format date helper
    const formatDate = (timestamp: number) => {
        if (!mounted) return "...";
        return formatLocaleDate(timestamp, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    if (isLoading) {
        return (
            <MainLayout>
                <PageContainer>
                    <LoadingState label={t("common.state.loading")} />
                </PageContainer>
            </MainLayout>
        );
    }

    if (error || !event) {
        return (
            <MainLayout>
                <PageContainer>
                    <EmptyState
                        icon={mdEventBusy}
                        title={t("page.events.notFoundTitle", { id: eventId })}
                        description={t("page.events.notFoundDesc")}
                        action={
                            <Button href="/events" variant="filled" size="m" icon={mdArrowBack}>
                                {t("page.events.backToList")}
                            </Button>
                        }
                    />
                </PageContainer>
            </MainLayout>
        );
    }

    const logoUrl = getEventLogoUrl(event.assetbundleName, assetSource);
    const eventStoryBannerUrl = getEventStoryBannerUrl(event.assetbundleName, assetSource);
    const bannerUrl = getEventBannerUrl(event.assetbundleName, assetSource);
    const characterUrl = getEventCharacterUrl(event.assetbundleName, assetSource);
    const status = getEventStatus(event);
    const statusDisplay = EVENT_STATUS_DISPLAY[status];

    // Events with no banner character hide the character tab, except for whitelisted IDs
    const CHARACTER_TAB_WHITELIST = [180];
    const hasBannerChar = event.eventType !== "world_bloom" && bannerCharId !== null;
    const showCharacterTab = hasBannerChar || CHARACTER_TAB_WHITELIST.includes(event.id);

    // Events not in eventStories.json have no event story banner
    const showEventStoryBannerTab = hasEventStory;

    // Resolve effective tab (fallback to "logo" if event_story_banner tab is hidden)
    const effectiveTab = (activeImageTab === "event_story_banner" && !showEventStoryBannerTab) ? "logo" : activeImageTab;

    const activeImageUrl = effectiveTab === "event_story_banner" ? eventStoryBannerUrl : effectiveTab === "logo" ? logoUrl : effectiveTab === "banner" ? bannerUrl : characterUrl;
    const activeImageLabelKey = effectiveTab === "event_story_banner" ? "event_story_banner" : effectiveTab === "logo" ? "logo" : effectiveTab === "banner" ? "banner" : "character";
    const activeImageLabel = t(`page.events.imageTabs.${activeImageLabelKey}`);

    return (
        <MainLayout>
            <ImagePreviewModal
                isOpen={imageViewerOpen}
                onClose={() => setImageViewerOpen(false)}
                title={t("page.events.imageDetailTitle", { name: event.name, tab: activeImageLabel })}
                imageUrl={activeImageUrl}
                alt={t("page.events.imageDetailAlt", { name: event.name, tab: activeImageLabel })}
                fileName={`event_${event.id}_${activeImageTab}.png`}
            />

            <PageContainer>
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="inline-flex items-center h-7 px-3 rounded-md3-sm bg-surface-container-high type-label-m font-mono text-on-surface-variant">
                            ID: {event.id}
                        </span>
                        <span
                            className="inline-flex items-center h-7 px-3 rounded-md3-sm type-label-m text-white"
                            style={{ backgroundColor: EVENT_TYPE_COLORS[event.eventType as EventType] }}
                        >
                            {t("common.eventTypes." + event.eventType)}
                        </span>
                        <span
                            className="inline-flex items-center h-7 px-3 rounded-md3-sm type-label-m text-white"
                            style={{ backgroundColor: statusDisplay.color }}
                        >
                            {t("common.status." + status)}
                        </span>
                    </div>
                    <h1 className="type-headline-m sm:type-headline-l text-on-surface">
                        <TranslatedText
                            original={event.name}
                            category="events"
                            field="name"
                            originalClassName=""
                            translationClassName="block type-title-m text-on-surface-variant mt-1"
                        />
                    </h1>
                </div>

                {/* Main Content Grid - Images LEFT, Info RIGHT */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* LEFT Column: Image Gallery */}
                    <div>
                        {isScreenshotMode ? (
                            /* Screenshot Mode: Show all images in flat layout */
                            <div className="space-y-4">
                                {/* Event Story Banner (Logo) — only for events with story */}
                                {showEventStoryBannerTab && (
                                    <ScreenshotImageCard label={t("page.events.imageTabs.event_story_banner")}>
                                        <Image
                                            src={eventStoryBannerUrl}
                                            alt={t("page.events.imageDetailAlt", { name: event.name, tab: t("page.events.imageTabs.event_story_banner") })}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                            priority
                                        />
                                    </ScreenshotImageCard>
                                )}
                                {/* Title Logo */}
                                <ScreenshotImageCard label={t("page.events.imageTabs.logo")}>
                                    <Image
                                        src={logoUrl}
                                        alt={t("page.events.imageDetailAlt", { name: event.name, tab: t("page.events.imageTabs.logo") })}
                                        fill
                                        className="object-contain p-6"
                                        unoptimized
                                    />
                                </ScreenshotImageCard>
                                {/* Banner */}
                                <ScreenshotImageCard label={t("page.events.imageTabs.banner")}>
                                    <Image
                                        src={bannerUrl}
                                        alt={t("page.events.imageDetailAlt", { name: event.name, tab: t("page.events.imageTabs.banner") })}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                </ScreenshotImageCard>
                                {/* Character */}
                                {showCharacterTab && (
                                    <ScreenshotImageCard label={t("page.events.imageTabs.character")}>
                                        <Image
                                            src={characterUrl}
                                            alt={t("page.events.imageDetailAlt", { name: event.name, tab: t("page.events.imageTabs.character") })}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </ScreenshotImageCard>
                                )}
                            </div>
                        ) : (
                            /* Normal Mode: Tabs */
                            <div className="bg-surface-card border border-outline-variant/70 rounded-md3-xl overflow-hidden lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto custom-scrollbar">
                                {/* Tabs */}
                                <Tabs
                                    items={[
                                        ...(showEventStoryBannerTab ? [{ value: "event_story_banner" as const, label: t("page.events.imageTabs.event_story_banner") }] : []),
                                        { value: "logo" as const, label: t("page.events.imageTabs.logo") },
                                        { value: "banner" as const, label: t("page.events.imageTabs.banner") },
                                        ...(showCharacterTab ? [{ value: "character" as const, label: t("page.events.imageTabs.character") }] : []),
                                    ]}
                                    value={effectiveTab}
                                    onValueChange={(v) => setActiveImageTab(v)}
                                />
                                {/* Image Content */}
                                <div
                                    className="relative aspect-[16/9] bg-surface-container cursor-zoom-in group"
                                    onClick={() => setImageViewerOpen(true)}
                                >
                                    {/* Letterboxed and transparent assets sit on the dimmed event background
                                        instead of a grey band, the way the game itself presents them. */}
                                    {effectiveTab !== "banner" && (
                                        <>
                                            <Image src={bannerUrl} alt="" fill className="object-cover" unoptimized />
                                            <div className="absolute inset-0 bg-scrim/40" />
                                        </>
                                    )}
                                    {effectiveTab === "event_story_banner" && (
                                        <Image
                                            src={eventStoryBannerUrl}
                                            alt={t("page.events.imageDetailAlt", { name: event.name, tab: t("page.events.imageTabs.event_story_banner") })}
                                            fill
                                            className="object-contain p-4 sm:p-6 drop-shadow-xl"
                                            unoptimized
                                            priority
                                        />
                                    )}
                                    {effectiveTab === "logo" && (
                                        <Image
                                            src={logoUrl}
                                            alt={t("page.events.imageDetailAlt", { name: event.name, tab: t("page.events.imageTabs.logo") })}
                                            fill
                                            className="object-contain p-6 drop-shadow-xl"
                                            unoptimized
                                            priority
                                        />
                                    )}
                                    {effectiveTab === "banner" && (
                                        <Image
                                            src={bannerUrl}
                                            alt={t("page.events.imageDetailAlt", { name: event.name, tab: t("page.events.imageTabs.banner") })}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    )}
                                    {effectiveTab === "character" && showCharacterTab && (
                                        <Image
                                            src={characterUrl}
                                            alt={t("page.events.imageDetailAlt", { name: event.name, tab: t("page.events.imageTabs.character") })}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    )}
                                    <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-inverse-surface/70 py-1 pl-1.5 pr-2.5 type-label-s text-inverse-on-surface transition-opacity duration-200 [@media(hover:hover)]:opacity-0 group-hover:opacity-100">
                                        <Icon path={mdZoomIn} size={16} />
                                        {t("page.events.clickExpand")}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT Column: Info Cards */}
                    <div className="space-y-6">
                        {/* Basic Info Card */}
                        <SectionCard icon={mdInfo} title={t("page.events.basicInfo")} bodyClassName="p-0 pb-2">
                            <div className="divide-y divide-outline-variant">
                                <InfoRow label="ID" value={`#${event.id}`} />
                                <InfoRow
                                    label={t("page.events.nameLabel")}
                                    value={
                                        <TranslatedText
                                            original={event.name}
                                            category="events"
                                            field="name"
                                            originalClassName=""
                                            translationClassName="block type-body-s text-on-surface-variant mt-0.5"
                                        />
                                    }
                                />
                                <InfoRow
                                    label={t("page.events.unitLabel")}
                                    value={(() => {
                                        const filterId = getEventUnitFilterId(event.id, eventUnitMap);
                                        return filterId ? t(`common.units.${filterId}`) : t("page.events.none");
                                    })()}
                                />
                                <InfoRow
                                    label={t("page.events.bannerCharLabel")}
                                    value={
                                        event.eventType === "world_bloom"
                                            ? t("page.events.none")
                                            : bannerCharId
                                            ? getCharacterName(t, bannerCharId)
                                            : t("page.events.none")
                                    }
                                />
                                <InfoRow
                                    label={t("page.events.eventTypeLabel")}
                                    value={t(`common.eventTypes.${event.eventType}`)}
                                />
                                <InfoRow label={t("page.events.startTimeLabel")} value={formatDate(event.startAt)} />
                                <InfoRow label={t("page.events.endTimeLabel")} value={formatDate(event.aggregateAt)} />
                                <InfoRow
                                    label={t("page.events.assetNameLabel")}
                                    value={<span className="font-mono type-label-m bg-surface-container-high px-2 py-0.5 rounded-md3-xs">{event.assetbundleName}</span>}
                                />
                            </div>
                        </SectionCard>

                        {/* Event Theme Song Card */}
                        <SectionCard icon={mdMusicNote} title={t("page.events.bgmTitle")} bodyClassName="p-0">
                            <EventBgmPlayer event={event} assetSource={assetSource} />
                        </SectionCard>

                        {/* Bonus Info Card */}
                        <SectionCard icon={mdTrendingUp} title={t("page.events.bonusTitle")} bodyClassName="space-y-4">
                            {bonusAttr && (
                                <div className="flex items-center justify-between">
                                    <span className="type-body-m text-on-surface-variant">{t("page.events.bonusAttrLabel")}</span>
                                    <div className="flex items-center gap-2">
                                        <Image
                                            src={LOCAL_ATTR_ICONS[bonusAttr] || LOCAL_ATTR_ICONS.cool}
                                            alt={bonusAttr}
                                            width={28}
                                            height={28}
                                            unoptimized
                                        />
                                        <span className="type-title-s text-on-surface">
                                            {ATTR_NAMES[bonusAttr] || bonusAttr}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {bonusCharacters.length > 0 && (
                                <div>
                                    <span className="type-body-m text-on-surface-variant block mb-2">{t("page.events.bonusCharLabel")}</span>
                                    <div className="flex flex-wrap gap-2">
                                        {bonusCharacters.map(({ charId, unitId, displayName }) => (
                                            <div
                                                key={unitId}
                                                className="flex items-center gap-1.5 h-8 pl-1 pr-3 rounded-md3-sm bg-surface-container-high"
                                                title={displayName}
                                            >
                                                <div className="w-6 h-6 rounded-full overflow-hidden bg-surface-container-lowest">
                                                    <Image
                                                        src={getCharacterIconUrl(charId)}
                                                        alt={displayName}
                                                        width={24}
                                                        height={24}
                                                        className="w-full h-full object-cover"
                                                        unoptimized
                                                    />
                                                </div>
                                                <span className="type-label-l text-on-surface">
                                                    {displayName}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </SectionCard>

                        {/* Theme Songs Card */}
                        {themeSongs.length > 0 && (
                            <SectionCard icon={mdLibraryMusic} title={t("page.events.relatedSongsTitle", { count: themeSongs.length })} bodyClassName="space-y-2">
                                {themeSongs.map((music) => (
                                    <Link
                                        key={music.id}
                                        href={`/music/${music.id}`}
                                        className="state-layer focus-ring flex items-center gap-3 p-3 bg-surface-container rounded-md3-lg group"
                                    >
                                        <div className="w-12 h-12 rounded-md3-sm overflow-hidden bg-surface-container-high shrink-0">
                                            <Image
                                                src={getMusicJacketUrl(music.assetbundleName, assetSource)}
                                                alt={music.title}
                                                width={48}
                                                height={48}
                                                className="w-full h-full object-cover"
                                                unoptimized
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="type-title-s text-on-surface truncate group-hover:text-primary transition-colors">
                                                <TranslatedText
                                                    original={music.title}
                                                    category="music"
                                                    field="title"
                                                    originalClassName="truncate block"
                                                    translationClassName="type-body-s text-on-surface-variant truncate block"
                                                />
                                            </p>
                                            <p className="type-label-m text-on-surface-variant font-mono">ID: {music.id}</p>
                                        </div>
                                        <Icon path={mdChevronRight} className="text-on-surface-variant" />
                                    </Link>
                                ))}
                            </SectionCard>
                        )}

                        {/* Event Story Card */}
                        <EventLinkCard
                            href={`/story/event/${event.id}`}
                            icon={mdMenuBook}
                            title={t("page.events.storyTitle")}
                            action={t("page.events.storyReadBtn")}
                            description={t("page.events.storyReadDesc")}
                        />

                        {/* Event Area Conversations Card */}
                        <EventLinkCard
                            href={`/story/area/event_${event.id}`}
                            icon={mdForum}
                            title={t("page.events.areaTalkTitle")}
                            action={t("page.events.areaTalkReadBtn")}
                            description={t("page.events.areaTalkReadDesc")}
                        />

                        {/* Virtual Live Card */}
                        {virtualLive && (
                            <SectionCard icon={mdLiveTv} title={t("page.events.virtualLiveTitle")}>
                                <Link href={`/live/${virtualLive.id}`} className="group block overflow-hidden rounded-md3-lg focus-ring">
                                    <div className="relative aspect-[16/5] w-full">
                                        <Image
                                            src={getVirtualLiveBannerUrl(virtualLive.assetbundleName, assetSource)}
                                            alt={virtualLive.name}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-scrim/80 via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />
                                        <div className="absolute bottom-0 left-0 w-full p-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="type-label-s font-mono bg-scrim/40 text-white px-2 py-0.5 rounded-md3-xs">
                                                    Live #{virtualLive.id}
                                                </span>
                                            </div>
                                            <h3 className="text-white type-title-m truncate">
                                                <TranslatedText
                                                    original={virtualLive.name}
                                                    category="virtualLive"
                                                    field="name"
                                                    originalClassName="truncate block"
                                                    translationClassName="type-body-s text-white/90 truncate block mt-0.5"
                                                />
                                            </h3>
                                        </div>
                                    </div>
                                </Link>
                            </SectionCard>
                        )}

                        {/* Event Cards - Now in Right Column */}
                        {eventCardsWithInfo.length > 0 && (
                            <SectionCard icon={mdStyle} title={t("page.events.cardsTitle", { count: eventCardsWithInfo.length })}>
                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-6 xl:grid-cols-8 gap-1.5">
                                    {eventCardsWithInfo.map(({ cardId, card }) => {
                                        const cardInfo = card as unknown as ICardInfo;
                                        const showTrained = getCardDefaultTrainedStatus(cardInfo) ||
                                            (useTrainedThumbnail && isTrainableCard(cardInfo));

                                        return (
                                            <Link
                                                key={cardId}
                                                href={`/cards/${cardId}`}
                                                className="group block rounded-md3-sm focus-ring"
                                            >
                                                <div className="relative rounded-md3-sm overflow-hidden bg-surface-container-lowest ring-1 ring-outline-variant group-hover:ring-2 group-hover:ring-primary transition-shadow">
                                                    <SekaiCardThumbnail card={card as unknown as ICardInfo} trained={showTrained} className="w-full" />
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </SectionCard>
                        )}

                        <DetailPageAdCard hidden={isScreenshotMode} />
                    </div>
                </div>

                {/* Back Button */}
                <div className="mt-12 text-center">
                    <Button href="/events" variant="tonal" size="s" icon={mdArrowBack}>
                        {t("page.events.backToList")}
                    </Button>
                </div>
            </PageContainer>
        </MainLayout>
    );
}

function ScreenshotImageCard({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="bg-surface-card border border-outline-variant/70 rounded-md3-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-outline-variant">
                <span className="type-title-s text-on-surface-variant">{label}</span>
            </div>
            <div className="relative aspect-[16/9] bg-surface-container">{children}</div>
        </div>
    );
}

function EventLinkCard({
    href,
    icon,
    title,
    action,
    description,
}: {
    href: string;
    icon: string;
    title: string;
    action: string;
    description: string;
}) {
    return (
        <Card href={href} variant="filled" radius="xl" className="group">
            <div className="flex items-center gap-3 px-5 pt-4">
                <Icon path={icon} className="text-primary" />
                <h2 className="type-title-l text-on-surface">{title}</h2>
            </div>
            <div className="p-5 pt-3 flex items-center justify-between gap-4">
                <div>
                    <p className="type-title-s text-on-surface group-hover:text-primary transition-colors">{action}</p>
                    <p className="type-body-s text-on-surface-variant mt-1">{description}</p>
                </div>
                <span className="w-10 h-10 shrink-0 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                    <Icon path={mdChevronRight} />
                </span>
            </div>
        </Card>
    );
}


function EventBgmPlayer({ event, assetSource }: { event: IEventInfo; assetSource: AssetSourceType }) {
    const { t } = useI18n();
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    // Use useRef to keep track of the current audio URL to handle changes if needed, 
    // though usually event ID doesn't change without remount.
    // We get the URL directly in the render to ensure reactivity to assetSource changes
    const audioUrl = getEventBgmUrl(event.assetbundleName, assetSource);

    const togglePlay = () => {
        if (!audioRef.current) {
            audioRef.current = new Audio(audioUrl);
            audioRef.current.volume = 0.5; // Default volume
            audioRef.current.onended = () => setIsPlaying(false);
            audioRef.current.onplay = () => setIsPlaying(true);
            audioRef.current.onpause = () => setIsPlaying(false);
            audioRef.current.onloadedmetadata = () => {
                if (audioRef.current) setDuration(audioRef.current.duration);
            };
            audioRef.current.ontimeupdate = () => {
                if (audioRef.current) {
                    setProgress(audioRef.current.currentTime);
                }
            };
        }

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(console.error);
        }
    };

    const handleSeek = (time: number) => {
        setProgress(time);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
        }
    };

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // Also restart/reset if audioUrl changes (e.g. source change)
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            requestAnimationFrame(() => {
                setIsPlaying(false);
                setProgress(0);
                setDuration(0);
            });
        }
    }, [audioUrl]);

    return (
        <div className="px-5 py-4">
            <div className="flex items-center gap-4">
                {/* Play Button */}
                <IconButton
                    variant="filled"
                    size="m"
                    icon={isPlaying ? mdPauseFill : mdPlayArrowFill}
                    label={isPlaying ? t("common.action.pause") : t("common.action.play")}
                    onClick={togglePlay}
                    className="shrink-0"
                />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <div className="type-title-s text-on-surface truncate">
                            {t("page.events.themeSongLabel")}
                        </div>
                        {/* Download Button */}
                        <a
                            href={audioUrl}
                            download={`${event.assetbundleName}_top.mp3`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="state-layer focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant"
                            title={t("page.events.downloadAudio")}
                            aria-label={t("page.events.downloadAudio")}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Icon path={mdDownload} size={22} />
                        </a>
                    </div>

                    {/* Progress Bar & Time */}
                    <div className="flex items-center gap-3">
                        <Slider
                            min={0}
                            max={duration || 100}
                            step={0.1}
                            value={progress}
                            onValueChange={handleSeek}
                            aria-label={t("page.events.themeSongLabel")}
                            className="flex-1"
                        />
                        <span className="type-label-s font-mono text-on-surface-variant shrink-0 min-w-[60px] text-right">
                            {formatTime(progress)} / {formatTime(duration)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Info Row Component
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="px-5 py-3 flex items-center justify-between gap-4 type-body-m">
            <span className="text-on-surface-variant">{label}</span>
            <span className="text-on-surface font-medium text-right max-w-[60%]">{value}</span>
        </div>
    );
}
