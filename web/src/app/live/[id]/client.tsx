"use client";
import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import MainLayout from "@/components/MainLayout";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import {
    ICompactResourceBoxDetails,
    IResourceBoxDetail,
    IResourceBoxInfo,
    IVirtualLiveInfo,
    IVirtualLiveReward,
    VIRTUAL_LIVE_TYPE_COLORS,
    getVirtualLiveStatus,
    VIRTUAL_LIVE_STATUS_DISPLAY,
    VirtualLiveType
} from "@/types/virtualLive";
import {
    getCommonMaterialThumbnailUrl,
    getEventBannerUrl,
    getMaterialThumbnailUrl,
    getMusicJacketUrl,
    getStampUrl,
    getVirtualLiveBannerUrl,
} from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import ImagePreviewModal from "@/components/common/ImagePreviewModal";
import { useI18n } from "@/contexts/I18nContext";
import type { IMaterialInfo } from "@/types/material";
import type { IHonorGroup, IHonorInfo } from "@/types/honor";
import DegreeImage from "@/components/honor/DegreeImage";
import { Button, EmptyState, Icon, LoadingState, PageContainer, SectionCard, cn } from "@/components/md3";
import {
    mdArrowBack,
    mdEvent,
    mdEventBusy,
    mdInfo,
    mdKeyboardArrowDown,
    mdQueueMusic,
    mdRedeem,
    mdSchedule,
    mdZoomIn,
} from "@/components/md3/icons";

interface IMusic {
    id: number;
    title: string;
    assetbundleName: string;
}

interface IMusicVocal {
    id: number;
    musicId: number;
    musicVocalType: string;
    assetbundleName: string;
}

interface IEventInfo {
    id: number;
    name: string;
    assetbundleName: string;
}

interface IStampInfo {
    id: number;
    name: string;
    assetbundleName: string;
}

interface IGenericRewardItem {
    id: number;
    name?: string;
    title?: string;
    description?: string;
    assetbundleName?: string;
    assetBundleName?: string;
}

interface IRewardLookupData {
    materials: IMaterialInfo[];
    stamps: IStampInfo[];
    honors: IHonorInfo[];
    honorGroups: IHonorGroup[];
    boostItems: IGenericRewardItem[];
    virtualLiveTransitionItems: IGenericRewardItem[];
}

interface IRewardLookupMaps {
    materialMap: Map<number, IMaterialInfo>;
    stampMap: Map<number, IStampInfo>;
    honorMap: Map<number, IHonorInfo>;
    honorGroupMap: Map<number, IHonorGroup>;
    boostItemMap: Map<number, IGenericRewardItem>;
    virtualLiveTransitionItemMap: Map<number, IGenericRewardItem>;
}

interface IResolvedVirtualLiveReward {
    key: string;
    resourceType: string;
    resourceId?: number;
    resourceLevel?: number;
    quantity: number;
    typeLabel: string;
    name: string;
    subtitle?: string;
    imageUrl?: string;
    linkHref?: string;
    honor?: IHonorInfo;
    honorGroup?: IHonorGroup;
}

interface IResolvedVirtualLiveRewardBox {
    reward: IVirtualLiveReward;
    box?: IResourceBoxInfo;
    details: IResolvedVirtualLiveReward[];
}

// API URL for virtual live-event mapping
const VIRTUAL_LIVE_EVENT_MAP_URL = (process.env.NEXT_PUBLIC_API_URL || "") + "/api/virtuallive-event-map";
const VIRTUAL_LIVE_REWARD_PURPOSE = "virtual_live_reward";

const EMPTY_REWARD_LOOKUPS: IRewardLookupData = {
    materials: [],
    stamps: [],
    honors: [],
    honorGroups: [],
    boostItems: [],
    virtualLiveTransitionItems: [],
};

function isCompactResourceBoxServer(): boolean {
    if (typeof window === "undefined") return false;
    const server = localStorage.getItem("server-source") || "jp";
    return server === "cn" || server === "tw" || server === "kr";
}

function getVirtualLiveRewards(virtualLive: IVirtualLiveInfo | null): IVirtualLiveReward[] {
    if (!virtualLive) return [];

    const rewards = [
        ...(virtualLive.virtualLiveReward ? [virtualLive.virtualLiveReward] : []),
        ...(virtualLive.virtualLiveRewards || []),
    ];
    const seen = new Set<string>();

    return rewards.filter((reward) => {
        if (!reward || !Number.isFinite(reward.resourceBoxId)) return false;
        const key = `${reward.virtualLiveType}:${reward.resourceBoxId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getRelevantRewardBoxes(
    virtualLive: IVirtualLiveInfo,
    resourceBoxes: IResourceBoxInfo[]
): IResourceBoxInfo[] {
    const rewardBoxIds = new Set(getVirtualLiveRewards(virtualLive).map((reward) => reward.resourceBoxId));
    return resourceBoxes.filter((box) => box.resourceBoxPurpose === VIRTUAL_LIVE_REWARD_PURPOSE && rewardBoxIds.has(box.id));
}

function resolveCompactEnumValue(enumValues: string[] | undefined, value: number | string | undefined): string | undefined {
    if (typeof value === "string") return value;
    if (typeof value === "number") return enumValues?.[value];
    return undefined;
}

function getRelevantRewardBoxesFromCompact(
    virtualLive: IVirtualLiveInfo,
    compactDetails: ICompactResourceBoxDetails | null
): IResourceBoxInfo[] {
    if (!compactDetails?.resourceBoxId?.length) return [];

    const rewardBoxIds = new Set(getVirtualLiveRewards(virtualLive).map((reward) => reward.resourceBoxId));
    const purposeEnum = compactDetails.__ENUM__?.resourceBoxPurpose;
    const typeEnum = compactDetails.__ENUM__?.resourceType;
    const boxes = new Map<number, IResourceBoxInfo>();

    for (let index = 0; index < compactDetails.resourceBoxId.length; index++) {
        const resourceBoxId = compactDetails.resourceBoxId[index];
        if (!rewardBoxIds.has(resourceBoxId)) continue;

        const resourceBoxPurpose = resolveCompactEnumValue(purposeEnum, compactDetails.resourceBoxPurpose[index]);
        if (resourceBoxPurpose !== VIRTUAL_LIVE_REWARD_PURPOSE) continue;

        const resourceType = resolveCompactEnumValue(typeEnum, compactDetails.resourceType[index]);
        if (!resourceType) continue;

        let box = boxes.get(resourceBoxId);
        if (!box) {
            box = {
                resourceBoxPurpose,
                id: resourceBoxId,
                resourceBoxType: "expand",
                details: [],
            };
            boxes.set(resourceBoxId, box);
        }

        box.details?.push({
            resourceBoxPurpose,
            resourceBoxId,
            seq: (box.details.length || 0) + 1,
            resourceType,
            resourceId: compactDetails.resourceId?.[index],
            resourceLevel: compactDetails.resourceLevel?.[index],
            resourceQuantity: compactDetails.resourceQuantity?.[index],
        });
    }

    return getVirtualLiveRewards(virtualLive)
        .map((reward) => boxes.get(reward.resourceBoxId))
        .filter((box): box is IResourceBoxInfo => Boolean(box));
}

function mergeRewardBoxes(primary: IResourceBoxInfo[], fallback: IResourceBoxInfo[]): IResourceBoxInfo[] {
    const merged = new Map(primary.map((box) => [box.id, box]));

    fallback.forEach((box) => {
        const current = merged.get(box.id);
        if (!current || (current.details || []).length === 0) {
            merged.set(box.id, box);
        }
    });

    return Array.from(merged.values());
}

function hasRewardDetailsForEveryBox(rewards: IVirtualLiveReward[], resourceBoxes: IResourceBoxInfo[]): boolean {
    const boxesWithDetails = new Set(
        resourceBoxes
            .filter((box) => (box.details || []).length > 0)
            .map((box) => box.id)
    );

    return rewards.every((reward) => boxesWithDetails.has(reward.resourceBoxId));
}

function collectRewardResourceTypes(resourceBoxes: IResourceBoxInfo[]): Set<string> {
    const types = new Set<string>();
    resourceBoxes.forEach((box) => {
        (box.details || []).forEach((detail) => {
            if (detail.resourceType) types.add(detail.resourceType);
        });
    });
    return types;
}

function buildMapById<T extends { id: number }>(items: T[]): Map<number, T> {
    return new Map(items.map((item) => [item.id, item]));
}

async function fetchOptionalMasterData<T>(shouldFetch: boolean, path: string, fallback: T): Promise<T> {
    if (!shouldFetch) return fallback;
    try {
        return await fetchMasterData<T>(path);
    } catch (error) {
        console.warn(`[VirtualLiveReward] Failed to fetch ${path}`, error);
        return fallback;
    }
}

async function fetchOptionalMasterRows<T>(shouldFetch: boolean, path: string): Promise<T[]> {
    return fetchOptionalMasterData<T[]>(shouldFetch, path, []);
}

function getTranslatedOrFallback(key: string, fallback: string, t: (key: string, values?: Record<string, string | number>) => string): string {
    const translated = t(key);
    return translated === key ? fallback : translated;
}

function formatResourceType(resourceType: string): string {
    return resourceType
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function getRewardTypeLabel(resourceType: string, t: (key: string, values?: Record<string, string | number>) => string): string {
    return getTranslatedOrFallback(`common.exchange.rewardTypes.${resourceType}`, formatResourceType(resourceType), t);
}

function getRewardConditionLabel(virtualLiveType: string, t: (key: string, values?: Record<string, string | number>) => string): string {
    const pageLabel = getTranslatedOrFallback(`page.live.rewardTypes.${virtualLiveType}`, "", t);
    if (pageLabel) return pageLabel;
    return getTranslatedOrFallback(`common.virtualLiveTypes.${virtualLiveType}`, formatResourceType(virtualLiveType), t);
}

function extractGenericName(item: IGenericRewardItem | undefined, fallback: string): string {
    const name = item?.name || item?.title || item?.description;
    return typeof name === "string" && name.trim() ? name : fallback;
}

function resolveVirtualLiveRewardDetail(
    detail: IResourceBoxDetail,
    lookupMaps: IRewardLookupMaps,
    assetSource: ReturnType<typeof useTheme>["assetSource"],
    t: (key: string, values?: Record<string, string | number>) => string
): IResolvedVirtualLiveReward {
    const resourceId = detail.resourceId;
    const quantity = detail.resourceQuantity ?? 1;
    const typeLabel = getRewardTypeLabel(detail.resourceType, t);
    const fallbackName = typeof resourceId === "number"
        ? t("page.live.rewardFallbackName", { type: typeLabel, id: resourceId })
        : typeLabel;

    switch (detail.resourceType) {
        case "material": {
            const material = typeof resourceId === "number" ? lookupMaps.materialMap.get(resourceId) : undefined;
            return {
                key: `${detail.seq}-${detail.resourceType}-${resourceId ?? "none"}`,
                resourceType: detail.resourceType,
                resourceId,
                resourceLevel: detail.resourceLevel,
                quantity,
                typeLabel,
                name: material?.name || fallbackName,
                subtitle: material?.materialType || typeLabel,
                imageUrl: typeof resourceId === "number" ? getMaterialThumbnailUrl(resourceId, assetSource) : undefined,
                linkHref: typeof resourceId === "number" ? `/materials?search=${encodeURIComponent(String(resourceId))}` : undefined,
            };
        }
        case "stamp": {
            const stamp = typeof resourceId === "number" ? lookupMaps.stampMap.get(resourceId) : undefined;
            return {
                key: `${detail.seq}-${detail.resourceType}-${resourceId ?? "none"}`,
                resourceType: detail.resourceType,
                resourceId,
                resourceLevel: detail.resourceLevel,
                quantity,
                typeLabel,
                name: stamp?.name || fallbackName,
                subtitle: typeLabel,
                imageUrl: stamp?.assetbundleName ? getStampUrl(stamp.assetbundleName, assetSource) : undefined,
                linkHref: typeof resourceId === "number" ? `/sticker?search=${encodeURIComponent(String(resourceId))}` : undefined,
            };
        }
        case "honor": {
            const honor = typeof resourceId === "number" ? lookupMaps.honorMap.get(resourceId) : undefined;
            const honorGroup = honor ? lookupMaps.honorGroupMap.get(honor.groupId) : undefined;
            return {
                key: `${detail.seq}-${detail.resourceType}-${resourceId ?? "none"}-${detail.resourceLevel ?? "level"}`,
                resourceType: detail.resourceType,
                resourceId,
                resourceLevel: detail.resourceLevel,
                quantity,
                typeLabel,
                name: honor?.name || fallbackName,
                subtitle: honorGroup?.name || typeLabel,
                honor,
                honorGroup,
            };
        }
        case "boost_item": {
            const item = typeof resourceId === "number" ? lookupMaps.boostItemMap.get(resourceId) : undefined;
            return {
                key: `${detail.seq}-${detail.resourceType}-${resourceId ?? "none"}`,
                resourceType: detail.resourceType,
                resourceId,
                resourceLevel: detail.resourceLevel,
                quantity,
                typeLabel,
                name: extractGenericName(item, fallbackName),
                subtitle: typeLabel,
            };
        }
        case "virtual_live_transition_item": {
            const item = typeof resourceId === "number" ? lookupMaps.virtualLiveTransitionItemMap.get(resourceId) : undefined;
            return {
                key: `${detail.seq}-${detail.resourceType}-${resourceId ?? "none"}`,
                resourceType: detail.resourceType,
                resourceId,
                resourceLevel: detail.resourceLevel,
                quantity,
                typeLabel,
                name: extractGenericName(item, fallbackName),
                subtitle: typeLabel,
            };
        }
        case "coin":
        case "jewel":
        case "virtual_coin":
            return {
                key: `${detail.seq}-${detail.resourceType}-${resourceId ?? "currency"}`,
                resourceType: detail.resourceType,
                resourceId,
                resourceLevel: detail.resourceLevel,
                quantity,
                typeLabel,
                name: typeLabel,
                imageUrl: getCommonMaterialThumbnailUrl(detail.resourceType, assetSource),
            };
        default:
            return {
                key: `${detail.seq}-${detail.resourceType}-${resourceId ?? "none"}`,
                resourceType: detail.resourceType,
                resourceId,
                resourceLevel: detail.resourceLevel,
                quantity,
                typeLabel,
                name: fallbackName,
                subtitle: typeof resourceId === "number" ? `ID #${resourceId}` : undefined,
            };
    }
}

function resolveVirtualLiveRewardBoxes(
    virtualLive: IVirtualLiveInfo | null,
    resourceBoxes: IResourceBoxInfo[],
    lookupMaps: IRewardLookupMaps,
    assetSource: ReturnType<typeof useTheme>["assetSource"],
    t: (key: string, values?: Record<string, string | number>) => string
): IResolvedVirtualLiveRewardBox[] {
    if (!virtualLive) return [];
    const boxMap = new Map(resourceBoxes.map((box) => [box.id, box]));

    return getVirtualLiveRewards(virtualLive).map((reward) => {
        const box = boxMap.get(reward.resourceBoxId);
        return {
            reward,
            box,
            details: (box?.details || [])
                .slice()
                .sort((a, b) => a.seq - b.seq)
                .map((detail) => resolveVirtualLiveRewardDetail(detail, lookupMaps, assetSource, t)),
        };
    });
}

export default function VirtualLiveDetailClient() {
    const params = useParams();
    const virtualLiveId = Number(params.id);
    const { assetSource } = useTheme();
    const { setDetailName } = useBreadcrumb();
    const { t, formatDate: formatLocaleDate, formatNumber } = useI18n();

    const [virtualLive, setVirtualLive] = useState<IVirtualLiveInfo | null>(null);
    const [allMusics, setAllMusics] = useState<IMusic[]>([]);
    const [allMusicVocals, setAllMusicVocals] = useState<IMusicVocal[]>([]);
    const [rewardResourceBoxes, setRewardResourceBoxes] = useState<IResourceBoxInfo[]>([]);
    const [rewardLookups, setRewardLookups] = useState<IRewardLookupData>(EMPTY_REWARD_LOOKUPS);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [relatedEvent, setRelatedEvent] = useState<IEventInfo | null>(null);
    const [imageViewerOpen, setImageViewerOpen] = useState(false);

    const rewardLookupMaps = useMemo<IRewardLookupMaps>(() => ({
        materialMap: buildMapById(rewardLookups.materials),
        stampMap: buildMapById(rewardLookups.stamps),
        honorMap: buildMapById(rewardLookups.honors),
        honorGroupMap: buildMapById(rewardLookups.honorGroups),
        boostItemMap: buildMapById(rewardLookups.boostItems),
        virtualLiveTransitionItemMap: buildMapById(rewardLookups.virtualLiveTransitionItems),
    }), [rewardLookups]);

    const resolvedRewardBoxes = useMemo(
        () => resolveVirtualLiveRewardBoxes(virtualLive, rewardResourceBoxes, rewardLookupMaps, assetSource, t),
        [virtualLive, rewardResourceBoxes, rewardLookupMaps, assetSource, t]
    );

    // Set mounted state
    useEffect(() => {
        setMounted(true);
    }, []);

    // Set breadcrumb detail name
    useEffect(() => {
        if (virtualLive) setDetailName(virtualLive.name);
    }, [virtualLive, setDetailName]);

    // Fetch data
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const [virtualLivesData, musicsData, musicVocalsData, resourceBoxesData] = await Promise.all([
                    fetchMasterData<IVirtualLiveInfo[]>("virtualLives.json"),
                    fetchMasterData<IMusic[]>("musics.json"),
                    fetchMasterData<IMusicVocal[]>("musicVocals.json"),
                    fetchOptionalMasterRows<IResourceBoxInfo>(true, "resourceBoxes.json"),
                ]);

                const foundVL = virtualLivesData.find(vl => vl.id === virtualLiveId);
                if (!foundVL) {
                    throw new Error(`Virtual Live ${virtualLiveId} not found`);
                }

                const resourceBoxRewards = getVirtualLiveRewards(foundVL);
                const relevantRewardBoxesFromResourceBoxes = getRelevantRewardBoxes(foundVL, resourceBoxesData);
                const shouldUseCompactFallback =
                    isCompactResourceBoxServer() ||
                    !hasRewardDetailsForEveryBox(resourceBoxRewards, relevantRewardBoxesFromResourceBoxes);
                const compactResourceBoxDetails = await fetchOptionalMasterData<ICompactResourceBoxDetails | null>(
                    shouldUseCompactFallback,
                    "compactResourceBoxDetails.json",
                    null
                );
                const relevantRewardBoxes = mergeRewardBoxes(
                    relevantRewardBoxesFromResourceBoxes,
                    getRelevantRewardBoxesFromCompact(foundVL, compactResourceBoxDetails)
                );
                const rewardResourceTypes = collectRewardResourceTypes(relevantRewardBoxes);
                const [
                    materialsData,
                    stampsData,
                    honorsData,
                    honorGroupsData,
                    boostItemsData,
                    virtualLiveTransitionItemsData,
                ] = await Promise.all([
                    fetchOptionalMasterRows<IMaterialInfo>(rewardResourceTypes.has("material"), "materials.json"),
                    fetchOptionalMasterRows<IStampInfo>(rewardResourceTypes.has("stamp"), "stamps.json"),
                    fetchOptionalMasterRows<IHonorInfo>(rewardResourceTypes.has("honor"), "honors.json"),
                    fetchOptionalMasterRows<IHonorGroup>(rewardResourceTypes.has("honor"), "honorGroups.json"),
                    fetchOptionalMasterRows<IGenericRewardItem>(rewardResourceTypes.has("boost_item"), "boostItems.json"),
                    fetchOptionalMasterRows<IGenericRewardItem>(
                        rewardResourceTypes.has("virtual_live_transition_item"),
                        "virtualLiveTransitionItems.json"
                    ),
                ]);

                setVirtualLive(foundVL);
                document.title = `Moesekai - ${foundVL.name}`;
                setAllMusics(musicsData);
                setAllMusicVocals(musicVocalsData);
                setRewardResourceBoxes(relevantRewardBoxes);
                setRewardLookups({
                    materials: materialsData,
                    stamps: stampsData,
                    honors: honorsData,
                    honorGroups: honorGroupsData,
                    boostItems: boostItemsData,
                    virtualLiveTransitionItems: virtualLiveTransitionItemsData,
                });
                setError(null);
            } catch (err) {
                console.error("Error fetching virtual live:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        if (Number.isFinite(virtualLiveId)) {
            fetchData();
        } else {
            setIsLoading(false);
        }
    }, [virtualLiveId]);

    // Fetch related event data
    useEffect(() => {
        async function fetchRelatedEvent() {
            try {
                const res = await fetch(VIRTUAL_LIVE_EVENT_MAP_URL);
                if (res.ok) {
                    const data: Record<string, IEventInfo> = await res.json();
                    const eventInfo = data[virtualLiveId.toString()];
                    setRelatedEvent(eventInfo || null);
                }
            } catch (err) {
                console.error("Error fetching related event:", err);
            }
        }
        if (virtualLiveId) {
            fetchRelatedEvent();
        }
    }, [virtualLiveId]);

    // Get setlist music info
    const setlistWithMusic = useMemo(() => {
        if (!virtualLive?.virtualLiveSetlists) return [];

        return virtualLive.virtualLiveSetlists.map(setlist => {
            if (setlist.virtualLiveSetlistType === "music" && setlist.musicVocalId) {
                const musicVocal = allMusicVocals.find(mv => mv.id === setlist.musicVocalId);
                const music = musicVocal ? allMusics.find(m => m.id === musicVocal.musicId) : null;
                return { ...setlist, music, musicVocal };
            }
            return { ...setlist, music: null, musicVocal: null };
        });
    }, [virtualLive, allMusics, allMusicVocals]);

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

    // Format short date helper
    const formatShortDate = (timestamp: number) => {
        if (!mounted) return "...";
        return formatLocaleDate(timestamp, {
            month: "short",
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

    if (error || !virtualLive) {
        return (
            <MainLayout>
                <PageContainer>
                    <EmptyState
                        icon={mdEventBusy}
                        title={t("page.live.notFoundTitle", { id: virtualLiveId })}
                        description={t("page.live.notFoundDesc")}
                        action={
                            <Button href="/live" variant="filled" size="m" icon={mdArrowBack}>
                                {t("page.live.backToList")}
                            </Button>
                        }
                    />
                </PageContainer>
            </MainLayout>
        );
    }

    const bannerUrl = getVirtualLiveBannerUrl(virtualLive.assetbundleName, assetSource);
    const status = getVirtualLiveStatus(virtualLive);
    const statusDisplay = VIRTUAL_LIVE_STATUS_DISPLAY[status];

    return (
        <MainLayout>
            <ImagePreviewModal
                isOpen={imageViewerOpen}
                onClose={() => setImageViewerOpen(false)}
                title={t("page.live.bannerDetailTitle", { name: virtualLive.name })}
                imageUrl={bannerUrl}
                alt={t("page.live.bannerDetailAlt", { name: virtualLive.name })}
                fileName={`live_${virtualLive.id}_banner.png`}
            />

            <PageContainer>
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="inline-flex items-center h-7 px-3 rounded-md3-sm bg-surface-container-high type-label-m font-mono text-on-surface-variant">
                            ID: {virtualLive.id}
                        </span>
                        <span
                            className="inline-flex items-center h-7 px-3 rounded-md3-sm type-label-m text-white"
                            style={{ backgroundColor: VIRTUAL_LIVE_TYPE_COLORS[virtualLive.virtualLiveType as VirtualLiveType] || "#9E9E9E" }}
                        >
                            {t(`common.virtualLiveTypes.${virtualLive.virtualLiveType}`)}
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
                            original={virtualLive.name}
                            category="virtualLive"
                            field="name"
                            originalClassName=""
                            translationClassName="block type-title-m text-on-surface-variant mt-1"
                        />
                    </h1>
                </div>

                {/* Main Content Grid - Banner LEFT, Info RIGHT */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* LEFT Column: Banner */}
                    <div>
                        <div className="bg-surface-container-low rounded-md3-xl overflow-hidden lg:sticky lg:top-24">
                            <div className="px-4 py-3 border-b border-outline-variant">
                                <span className="type-title-s text-on-surface-variant">{t("page.live.bannerTitle")}</span>
                            </div>
                            <div
                                className="relative aspect-[16/5] bg-surface-container cursor-zoom-in"
                                onClick={() => setImageViewerOpen(true)}
                            >
                                <Image
                                    src={bannerUrl}
                                    alt={t("page.live.bannerDetailAlt", { name: virtualLive.name })}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                    priority
                                />
                                <div className="absolute bottom-3 right-3 bg-inverse-surface/80 text-inverse-on-surface type-label-m px-2 py-1 rounded-md3-sm flex items-center gap-1">
                                    <Icon path={mdZoomIn} size={16} />
                                    {t("page.live.clickExpand")}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT Column: Info Cards */}
                    <div className="space-y-6">
                        {/* Basic Info Card */}
                        <SectionCard icon={mdInfo} title={t("page.live.basicInfo")} bodyClassName="p-0 pb-2">
                            <div className="divide-y divide-outline-variant">
                                <InfoRow label="ID" value={`#${virtualLive.id}`} />
                                <InfoRow
                                    label={t("common.field.name")}
                                    value={
                                        <TranslatedText
                                            original={virtualLive.name}
                                            category="virtualLive"
                                            field="name"
                                            originalClassName=""
                                            translationClassName="block type-body-s text-on-surface-variant mt-0.5"
                                        />
                                    }
                                />
                                <InfoRow
                                    label={t("common.field.type")}
                                    value={
                                        t(`common.virtualLiveTypes.${virtualLive.virtualLiveType}`)
                                    }
                                />
                                <InfoRow label={t("page.live.platformLabel")} value={virtualLive.virtualLivePlatform} />
                                <InfoRow label={t("page.live.startTimeLabel")} value={formatDate(virtualLive.startAt)} />
                                <InfoRow label={t("page.live.endTimeLabel")} value={formatDate(virtualLive.endAt)} />
                                <InfoRow
                                    label={t("page.live.assetNameLabel")}
                                    value={<span className="font-mono type-label-m bg-surface-container-high px-2 py-0.5 rounded-md3-xs">{virtualLive.assetbundleName}</span>}
                                />
                            </div>
                        </SectionCard>

                        {/* Rewards Card */}
                        {resolvedRewardBoxes.length > 0 && (
                            <VirtualLiveRewardsCard
                                rewardBoxes={resolvedRewardBoxes}
                                formatNumber={formatNumber}
                                getConditionLabel={(virtualLiveType) => getRewardConditionLabel(virtualLiveType, t)}
                                assetSource={assetSource}
                            />
                        )}

                        {/* Schedules Card */}
                        {virtualLive.virtualLiveSchedules && virtualLive.virtualLiveSchedules.length > 0 && (
                            <SchedulesCard
                                schedules={virtualLive.virtualLiveSchedules}
                                formatShortDate={formatShortDate}
                            />
                        )}

                        {/* Related Event Card */}
                        {relatedEvent && (
                            <SectionCard icon={mdEvent} title={t("page.live.relatedEventTitle")}>
                                <Link href={`/events/${relatedEvent.id}`} className="group block overflow-hidden rounded-md3-lg focus-ring">
                                    <div className="relative aspect-[2/1] w-full">
                                        <Image
                                            src={getEventBannerUrl(relatedEvent.assetbundleName, assetSource)}
                                            alt={relatedEvent.name}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-scrim/80 via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />
                                        <div className="absolute bottom-0 left-0 w-full p-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="type-label-s font-mono bg-scrim/40 text-white px-2 py-0.5 rounded-md3-xs">
                                                    Event #{relatedEvent.id}
                                                </span>
                                            </div>
                                            <h3 className="text-white type-title-m truncate">
                                                <TranslatedText
                                                    original={relatedEvent.name}
                                                    category="events"
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

                        {/* Setlist Card */}
                        {setlistWithMusic.length > 0 && (
                            <SectionCard icon={mdQueueMusic} title={t("page.live.setlistTitle", { count: setlistWithMusic.length })} bodyClassName="p-0 pb-2">
                                <div className="divide-y divide-outline-variant">
                                    {setlistWithMusic.map((item, index) => (
                                        <div key={item.id} className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 shrink-0 rounded-full bg-surface-container-high flex items-center justify-center type-label-l text-on-surface-variant">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    {item.virtualLiveSetlistType === "music" && item.music ? (
                                                        <Link
                                                            href={`/music/${item.music.id}`}
                                                            className="flex items-center gap-3 group rounded-md3-sm focus-ring"
                                                        >
                                                            <div className="w-10 h-10 rounded-md3-sm overflow-hidden bg-surface-container-high shrink-0">
                                                                <Image
                                                                    src={getMusicJacketUrl(item.music.assetbundleName, assetSource)}
                                                                    alt={item.music.title}
                                                                    width={40}
                                                                    height={40}
                                                                    className="w-full h-full object-cover"
                                                                    unoptimized
                                                                />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="type-title-s text-on-surface group-hover:text-primary transition-colors">
                                                                    <TranslatedText
                                                                        original={item.music.title}
                                                                        category="music"
                                                                        field="title"
                                                                        originalClassName="truncate block"
                                                                        translationClassName="type-body-s text-on-surface-variant truncate block"
                                                                    />
                                                                </p>
                                                                <p className="type-body-s text-on-surface-variant">{t("page.live.setlistMusicLabel")}</p>
                                                            </div>
                                                        </Link>
                                                    ) : item.virtualLiveSetlistType === "mc" ? (
                                                        <div>
                                                            <p className="type-body-m text-on-surface">{t("page.live.setlistMcLabel")}</p>
                                                            <p className="type-label-s text-on-surface-variant font-mono">{item.assetbundleName}</p>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <p className="type-body-m text-on-surface">{item.virtualLiveSetlistType}</p>
                                                            <p className="type-label-s text-on-surface-variant font-mono">{item.assetbundleName}</p>
                                                        </div>
                                                    )}
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-md3-sm type-label-m ${item.virtualLiveSetlistType === "music"
                                                    ? "bg-primary-container text-on-primary-container"
                                                    : "bg-surface-container-high text-on-surface-variant"
                                                    }`}>
                                                    {item.virtualLiveSetlistType === "music" ? t("page.live.setlistTypeMusic") : t("page.live.setlistTypeMc")}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        <DetailPageAdCard />
                    </div>
                </div>

                {/* Back Button */}
                <div className="mt-12 text-center">
                    <Button href="/live" variant="tonal" size="m" icon={mdArrowBack}>
                        {t("page.live.backToList")}
                    </Button>
                </div>
            </PageContainer>
        </MainLayout>
    );
}

function VirtualLiveRewardsCard({
    rewardBoxes,
    formatNumber,
    getConditionLabel,
    assetSource,
}: {
    rewardBoxes: IResolvedVirtualLiveRewardBox[];
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
    getConditionLabel: (virtualLiveType: string) => string;
    assetSource: ReturnType<typeof useTheme>["assetSource"];
}) {
    const { t } = useI18n();
    const totalRewards = rewardBoxes.reduce((total, box) => total + box.details.length, 0);

    return (
        <SectionCard icon={mdRedeem} title={t("page.live.rewardsTitle", { count: totalRewards })} bodyClassName="p-0 pb-2">
            <div className="divide-y divide-outline-variant">
                {rewardBoxes.map((box) => (
                    <div key={`${box.reward.virtualLiveType}-${box.reward.resourceBoxId}`} className="p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center rounded-md3-sm bg-secondary-container px-2.5 py-1 type-label-m text-on-secondary-container">
                                {getConditionLabel(box.reward.virtualLiveType)}
                            </span>
                            <span className="font-mono type-label-s text-on-surface-variant">
                                {t("page.live.rewardBoxLabel", { id: box.reward.resourceBoxId })}
                            </span>
                        </div>

                        {box.details.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {box.details.map((detail) => (
                                    <VirtualLiveRewardItem
                                        key={detail.key}
                                        detail={detail}
                                        formatNumber={formatNumber}
                                        assetSource={assetSource}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="rounded-md3-md bg-surface-container px-3 py-2 type-body-m text-on-surface-variant">
                                {t("page.live.rewardEmpty")}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </SectionCard>
    );
}

function VirtualLiveRewardItem({
    detail,
    formatNumber,
    assetSource,
}: {
    detail: IResolvedVirtualLiveReward;
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
    assetSource: ReturnType<typeof useTheme>["assetSource"];
}) {
    const { t } = useI18n();
    const showQuantity = detail.quantity > 1 || detail.resourceType === "coin" || detail.resourceType === "jewel" || detail.resourceType === "virtual_coin";
    const content = (
        <>
            <VirtualLiveRewardThumbnail detail={detail} assetSource={assetSource} />
            <div className="min-w-0 flex-1">
                <p className="line-clamp-2 type-title-s text-on-surface group-hover:text-primary transition-colors">
                    {detail.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {detail.subtitle && (
                        <span className="rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 type-label-s text-on-surface-variant">
                            {detail.subtitle}
                        </span>
                    )}
                    {typeof detail.resourceId === "number" && (
                        <span className="font-mono type-label-s text-on-surface-variant">ID: {detail.resourceId}</span>
                    )}
                    {showQuantity && (
                        <span className="rounded-md3-xs bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">
                            {t("page.live.rewardQuantity", { count: formatNumber(detail.quantity) })}
                        </span>
                    )}
                </div>
            </div>
        </>
    );

    const className = cn(
        "group flex min-h-[84px] items-center gap-3 rounded-md3-lg bg-surface-container p-3",
        detail.linkHref && "state-layer focus-ring",
    );

    return detail.linkHref ? (
        <Link href={detail.linkHref} className={className}>
            {content}
        </Link>
    ) : (
        <div className={className}>
            {content}
        </div>
    );
}

function VirtualLiveRewardThumbnail({
    detail,
    assetSource,
}: {
    detail: IResolvedVirtualLiveReward;
    assetSource: ReturnType<typeof useTheme>["assetSource"];
}) {
    if (detail.honor) {
        return (
            <div className="w-32 shrink-0">
                <DegreeImage
                    honor={detail.honor}
                    honorGroup={detail.honorGroup}
                    honorLevel={detail.resourceLevel || detail.honor.levels[0]?.level}
                    source={assetSource}
                />
            </div>
        );
    }

    if (detail.imageUrl) {
        return (
            <div className="relative h-14 w-14 shrink-0 rounded-md3-md bg-surface-container-lowest ring-1 ring-outline-variant overflow-hidden">
                <Image
                    src={detail.imageUrl}
                    alt={detail.name}
                    fill
                    sizes="56px"
                    className="object-contain p-1.5"
                    unoptimized
                />
            </div>
        );
    }

    return (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md3-md bg-surface-container-lowest type-label-m text-on-surface-variant ring-1 ring-outline-variant">
            {detail.typeLabel.slice(0, 2).toUpperCase()}
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

// Schedules Card Component with expandable list
interface ISchedule {
    id: number;
    seq: number;
    startAt: number;
    endAt: number;
}

function SchedulesCard({ schedules, formatShortDate }: { schedules: ISchedule[], formatShortDate: (ts: number) => string }) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(false);

    const firstSchedule = schedules[0];
    const lastSchedule = schedules[schedules.length - 1];
    const middleSchedules = schedules.slice(1, -1);
    const hasMiddleSchedules = middleSchedules.length > 0;

    return (
        <SectionCard icon={mdSchedule} title={t("page.live.schedulesTitle", { count: schedules.length })} bodyClassName="p-4 pt-3 space-y-3">
            {/* First Schedule */}
            <div className="p-3 bg-primary-container text-on-primary-container rounded-md3-lg">
                <div className="flex items-center gap-2 mb-1">
                    <span className="type-label-l">{t("page.live.scheduleFirst")}</span>
                    <span className="type-label-m opacity-80">{t("page.live.scheduleSeq", { seq: firstSchedule.seq })}</span>
                </div>
                <div className="type-body-m font-medium">
                    {formatShortDate(firstSchedule.startAt)}
                </div>
                <div className="type-body-s opacity-80">
                    ~ {formatShortDate(firstSchedule.endAt)}
                </div>
            </div>

            {/* Middle Schedules (Collapsible) */}
            {hasMiddleSchedules && (
                <>
                    <Button
                        variant="tonal"
                        fullWidth
                        icon={mdKeyboardArrowDown}
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={isExpanded ? "[&>svg:first-child]:rotate-180" : undefined}
                    >
                        {isExpanded ? t("page.live.scheduleMiddleCollapse") : t("page.live.scheduleMiddleExpand", { count: middleSchedules.length })}
                    </Button>

                    {isExpanded && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                            {middleSchedules.map((schedule) => (
                                <div key={schedule.id} className="p-2 bg-surface-container rounded-md3-sm">
                                    <div className="type-label-s text-on-surface-variant mb-0.5">{t("page.live.scheduleSeq", { seq: schedule.seq })}</div>
                                    <div className="type-body-s font-medium text-on-surface">
                                        {formatShortDate(schedule.startAt)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Last Schedule (if different from first) */}
            {schedules.length > 1 && (
                <div className="p-3 bg-tertiary-container text-on-tertiary-container rounded-md3-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="type-label-l">{t("page.live.scheduleLast")}</span>
                        <span className="type-label-m opacity-80">{t("page.live.scheduleSeq", { seq: lastSchedule.seq })}</span>
                    </div>
                    <div className="type-body-m font-medium">
                        {formatShortDate(lastSchedule.startAt)}
                    </div>
                    <div className="type-body-s opacity-80">
                        ~ {formatShortDate(lastSchedule.endAt)}
                    </div>
                </div>
            )}
        </SectionCard>
    );
}
