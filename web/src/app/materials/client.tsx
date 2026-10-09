"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "@/components/LocalizedLink";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import Modal from "@/components/common/Modal";
import BaseFilters, {
    FilterButton,
    FilterSection,
    FilterToggle,
} from "@/components/common/BaseFilters";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import { getMaterialThumbnailUrl, getMysekaiMaterialThumbnailUrl } from "@/lib/assets";
import { useImageUrlActions } from "@/hooks/useImageUrlActions";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import {
    findMaterialExchangeUsages,
    loadExchangeCoreData,
    type MaterialExchangeUsages,
} from "@/lib/exchanges";
import type { ExchangeStatus, FlattenedMaterialExchange } from "@/types/exchange";
import type { IMaterialInfo, IMysekaiSiteInfo } from "@/types/material";
import type { IMysekaiMaterial } from "@/types/mysekai";
import { Banner, Card, CircularProgress, EmptyState, ErrorState, Icon, LoadMore, LoadingState, PageContainer, PageHeader, Tabs } from "@/components/md3";
import { mdBrokenImage, mdInventory2 } from "@/components/md3/icons";

type TabType = "materials" | "mysekaiMaterials";
type SortOrder = "asc" | "desc";
type MaterialSortBy = "seq" | "id" | "name";
type MysekaiSortBy = MaterialSortBy | "rarity";
type MaterialDetailSelection =
    | { kind: "material"; item: IMaterialInfo }
    | { kind: "mysekai"; item: IMysekaiMaterial }
    | null;

interface MaterialFiltersState {
    searchQuery: string;
    selectedTypes: string[];
    usableOnly: boolean;
    sortBy: MaterialSortBy;
    sortOrder: SortOrder;
}

interface MysekaiFiltersState {
    searchQuery: string;
    selectedTypes: string[];
    selectedRarities: string[];
    selectedSites: number[];
    sortBy: MysekaiSortBy;
    sortOrder: SortOrder;
}

const DEFAULT_TAB: TabType = "materials";

const DEFAULT_MATERIAL_FILTERS: MaterialFiltersState = {
    searchQuery: "",
    selectedTypes: [],
    usableOnly: false,
    sortBy: "seq",
    sortOrder: "asc",
};

const DEFAULT_MYSEKAI_FILTERS: MysekaiFiltersState = {
    searchQuery: "",
    selectedTypes: [],
    selectedRarities: [],
    selectedSites: [],
    sortBy: "seq",
    sortOrder: "asc",
};

const MATERIAL_SORT_OPTIONS = [
    { id: "seq", labelKey: "common.filter.sortByDefault" },
    { id: "id", labelKey: "common.filter.sortById" },
    { id: "name", labelKey: "common.filter.sortByName" },
] as const;

const MYSEKAI_SORT_OPTIONS = [
    { id: "seq", labelKey: "common.filter.sortByDefault" },
    { id: "id", labelKey: "common.filter.sortById" },
    { id: "name", labelKey: "common.filter.sortByName" },
    { id: "rarity", labelKey: "common.filter.sortByRarity" },
] as const;

const MATERIAL_TYPE_KEYS = [
    "common",
    "costume",
    "music",
    "special_training",
    "master_lesson",
    "card_ticket",
    "gacha_ceil_ticket",
    "vocal_card_ticket",
    "character_rank_exp_ticket",
    "card_episode_release_ticket",
    "auto_exchange_music_vocal_ticket",
    "birthday_party_delivery",
] as const;

const MYSEKAI_TYPE_KEYS = [
    "wood",
    "mineral",
    "junk",
    "plant",
    "tone",
    "game_character",
    "birthday_party",
] as const;

const MYSEKAI_RARITY_LABELS: Record<string, string> = {
    rarity_1: "★",
    rarity_2: "★",
    rarity_3: "★",
    rarity_4: "★",
};

const MYSEKAI_SITE_LABEL_KEYS: Record<number, string> = {
    5: "common.mysekaiSites.5",
    6: "common.mysekaiSites.6",
    7: "common.mysekaiSites.7",
    8: "common.mysekaiSites.8",
};

const MATERIAL_TYPE_ORDER = [...MATERIAL_TYPE_KEYS];
const MYSEKAI_TYPE_ORDER = [...MYSEKAI_TYPE_KEYS];
const MYSEKAI_RARITY_ORDER = ["rarity_1", "rarity_2", "rarity_3", "rarity_4"];

function toSearchText(value: string | number | undefined | null): string {
    return String(value ?? "").trim().toLowerCase();
}

function parseStringList(value: string | null): string[] {
    if (!value) return [];
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseNumberList(value: string | null): number[] {
    return parseStringList(value)
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item));
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

function areNumberArraysEqual(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

function areMaterialFiltersEqual(a: MaterialFiltersState, b: MaterialFiltersState): boolean {
    return (
        a.searchQuery === b.searchQuery &&
        areStringArraysEqual(a.selectedTypes, b.selectedTypes) &&
        a.usableOnly === b.usableOnly &&
        a.sortBy === b.sortBy &&
        a.sortOrder === b.sortOrder
    );
}

function areMysekaiFiltersEqual(a: MysekaiFiltersState, b: MysekaiFiltersState): boolean {
    return (
        a.searchQuery === b.searchQuery &&
        areStringArraysEqual(a.selectedTypes, b.selectedTypes) &&
        areStringArraysEqual(a.selectedRarities, b.selectedRarities) &&
        areNumberArraysEqual(a.selectedSites, b.selectedSites) &&
        a.sortBy === b.sortBy &&
        a.sortOrder === b.sortOrder
    );
}

function getUniqueValues(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        if (!value || seen.has(value)) continue;
        seen.add(value);
        result.push(value);
    }

    return result;
}

function sortByPreferredOrder(values: string[], preferredOrder: string[]): string[] {
    const orderMap = new Map(preferredOrder.map((value, index) => [value, index]));

    return [...values].sort((a, b) => {
        const aOrder = orderMap.get(a);
        const bOrder = orderMap.get(b);

        if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
        if (aOrder !== undefined) return -1;
        if (bOrder !== undefined) return 1;
        return a.localeCompare(b, "zh-Hans-CN");
    });
}

function formatFallbackLabel(value: string): string {
    return value.replace(/_/g, " ");
}

type TranslationFn = ReturnType<typeof useI18n>["t"];

function getMaterialTypeLabel(value: string, t: TranslationFn): string {
    const key = `common.materialTypes.${value}`;
    const label = t(key);
    return label === key ? formatFallbackLabel(value) : label;
}

function getMysekaiTypeLabel(value: string, t: TranslationFn): string {
    const key = `common.mysekaiMaterialTypes.${value}`;
    const label = t(key);
    return label === key ? formatFallbackLabel(value) : label;
}

function getMysekaiRarityLabel(value: string): string {
    return MYSEKAI_RARITY_LABELS[value] || formatFallbackLabel(value);
}

function getMysekaiRarityRank(value: string): number {
    const match = value.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
}

function getEffectiveMaterialDescription(material: IMaterialInfo): string {
    if (
        material.flavorText2 &&
        typeof material.changeFlavorTextAt === "number" &&
        Date.now() >= material.changeFlavorTextAt
    ) {
        return material.flavorText2;
    }

    return material.flavorText || "";
}

function getMysekaiSiteLabel(siteId: number, siteMap: Map<number, IMysekaiSiteInfo>, t: TranslationFn): string {
    const labelKey = MYSEKAI_SITE_LABEL_KEYS[siteId];
    if (labelKey) return t(labelKey);
    return siteMap.get(siteId)?.name || t("common.mysekaiSites.areaFallback", { id: siteId });
}

function MaterialsPageHeader() {
    const { t } = useI18n();

    return (
        <PageHeader
            eyebrow={t("page.materials.badge")}
            title={t("page.materials.title")}
            highlight={t("page.materials.titleHighlight")}
            description={t("page.materials.description")}
        />
    );
}

type BadgeTone = "primary" | "secondary" | "tertiary" | "positive" | "neutral";

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
    primary: "bg-primary-container text-on-primary-container",
    secondary: "bg-secondary-container text-on-secondary-container",
    tertiary: "bg-tertiary-container text-on-tertiary-container",
    positive: "bg-primary-fixed text-on-primary-fixed-variant",
    neutral: "bg-surface-container-highest text-on-surface-variant",
};

function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
    return (
        <span className={`inline-flex items-center rounded-md3-xs px-1.5 py-0.5 type-label-s ${BADGE_TONE_CLASS[tone]}`}>
            {label}
        </span>
    );
}

function CardImage({
    src,
    alt,
    className = "relative mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-md3-sm bg-surface-container",
    imageClassName = "w-full h-full object-contain p-2",
}: {
    src: string;
    alt: string;
    className?: string;
    imageClassName?: string;
}) {
    const [hasError, setHasError] = useState(false);

    return (
        <div className={className}>
            {src && !hasError ? (
                <img
                    src={src}
                    alt={alt}
                    className={imageClassName}
                    loading="lazy"
                    onError={() => setHasError(true)}
                />
            ) : (
                <Icon path={mdBrokenImage} size={40} className="text-outline" />
            )}
        </div>
    );
}

function RegularMaterialCard({
    item,
    assetSource,
    onClick,
}: {
    item: IMaterialInfo;
    assetSource: AssetSourceType;
    onClick: () => void;
}) {
    const { t } = useI18n();

    return (
        <Card
            variant="elevated"
            onClick={onClick}
            data-shortcut-item="true"
            className="group h-full p-4"
            title={t("page.materials.viewDetailTitle", { name: item.name })}
        >
            <CardImage
                src={getMaterialThumbnailUrl(item.id, assetSource)}
                alt={item.name}
            />

            <div className="flex min-h-0 flex-col gap-2">
                <div>
                    <h3 className="break-words type-title-s text-on-surface">
                        {item.name}
                    </h3>
                    <p className="mt-1 font-mono type-label-s text-on-surface-variant">#{item.id}</p>
                </div>

                <div className="flex flex-wrap gap-1">
                    <Badge label={getMaterialTypeLabel(item.materialType, t)} tone="secondary" />
                    {item.canUse && <Badge label={t("page.materials.usableBadge")} tone="positive" />}
                </div>
            </div>
        </Card>
    );
}

function MysekaiMaterialCard({
    item,
    assetSource,
    siteMap,
    onClick,
}: {
    item: IMysekaiMaterial;
    assetSource: AssetSourceType;
    siteMap: Map<number, IMysekaiSiteInfo>;
    onClick: () => void;
}) {
    const { t } = useI18n();
    const visibleSiteIds = item.mysekaiSiteIds.slice(0, 2);
    const extraSiteCount = Math.max(0, item.mysekaiSiteIds.length - visibleSiteIds.length);

    return (
        <Card
            variant="elevated"
            onClick={onClick}
            data-shortcut-item="true"
            className="group h-full p-4"
            title={t("page.materials.viewDetailTitle", { name: item.name })}
        >
            <CardImage
                src={getMysekaiMaterialThumbnailUrl(item.iconAssetbundleName, assetSource)}
                alt={item.name}
            />

            <div className="flex min-h-0 flex-col gap-2">
                <div>
                    <h3 className="break-words type-title-s text-on-surface">
                        {item.name}
                    </h3>
                    <p className="mt-1 font-mono type-label-s text-on-surface-variant">#{item.id}</p>
                </div>

                <div className="flex flex-wrap gap-1">
                    <Badge label={getMysekaiTypeLabel(item.mysekaiMaterialType, t)} tone="secondary" />
                    <Badge label={getMysekaiRarityLabel(item.mysekaiMaterialRarityType)} tone="tertiary" />
                    {item.mysekaiSiteIds.length === 0 ? (
                        <Badge label={t("page.materials.specialSourceBadge")} tone="positive" />
                    ) : (
                        <>
                            {visibleSiteIds.map((siteId) => (
                                <Badge key={`${item.id}-${siteId}`} label={getMysekaiSiteLabel(siteId, siteMap, t)} tone="neutral" />
                            ))}
                            {extraSiteCount > 0 && <Badge label={`+${extraSiteCount}`} tone="neutral" />}
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-outline-variant py-2.5 last:border-0">
            <span className="type-label-l text-on-surface-variant">{label}</span>
            <span className="max-w-[60%] text-right type-body-m text-on-surface">{value}</span>
        </div>
    );
}

function getExchangeStatusTone(status: ExchangeStatus): BadgeTone {
    switch (status) {
        case "active": return "positive";
        case "upcoming": return "tertiary";
        case "ended": return "neutral";
        case "permanent": default: return "secondary";
    }
}

function ExchangeUsageLink({ entry }: { entry: FlattenedMaterialExchange }) {
    const { t } = useI18n();

    return (
        <Link
            href={`/exchanges/${entry.id}`}
            className="state-layer focus-ring flex items-center justify-between gap-2 rounded-md3-sm border border-outline-variant px-3 py-2 type-body-m"
        >
            <span className="truncate text-on-surface">{entry.resolvedTitle}</span>
            <span className="shrink-0">
                <Badge label={t(`common.exchange.statuses.${entry.status}`)} tone={getExchangeStatusTone(entry.status)} />
            </span>
        </Link>
    );
}

function ExchangeUsageSection({ selection }: { selection: MaterialDetailSelection }) {
    const { t } = useI18n();
    const [usages, setUsages] = useState<MaterialExchangeUsages | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!selection) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setUsages(null);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        loadExchangeCoreData()
            .then((coreData) => {
                if (cancelled) return;
                const materialType = selection.kind === "material" ? "material" as const : "mysekai_material" as const;
                const result = findMaterialExchangeUsages(
                    selection.item.id,
                    materialType,
                    coreData.flattenedExchanges
                );
                setUsages(result);
            })
            .catch(() => {
                if (!cancelled) setUsages(null);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [selection]);

    if (isLoading) {
        return (
            <div>
                <h3 className="mb-3 type-title-s text-on-surface">{t("common.field.exchangeRelations")}</h3>
                <div className="flex items-center justify-center gap-2 rounded-md3-md bg-surface-container p-4 type-body-s text-on-surface-variant">
                    <CircularProgress size={20} strokeWidth={3} />
                    {t("common.state.loading")}
                </div>
            </div>
        );
    }

    if (!usages || (usages.asCost.length === 0 && usages.asReward.length === 0)) {
        return null;
    }

    return (
        <div>
            <h3 className="mb-3 type-title-s text-on-surface">{t("common.field.exchangeRelations")}</h3>
            <div className="space-y-3">
                {usages.asCost.length > 0 && (
                    <div>
                        <p className="mb-1.5 type-label-l text-on-surface-variant">{t("common.field.asExchangeCost", { count: usages.asCost.length })}</p>
                        <div className="space-y-1">
                            {usages.asCost.slice(0, 8).map((entry) => (
                                <ExchangeUsageLink key={`cost-${entry.id}`} entry={entry} />
                            ))}
                            {usages.asCost.length > 8 && (
                                <p className="pl-3 type-body-s text-on-surface-variant">{t("common.field.remainingItems", { count: usages.asCost.length - 8 })}</p>
                            )}
                        </div>
                    </div>
                )}
                {usages.asReward.length > 0 && (
                    <div>
                        <p className="mb-1.5 type-label-l text-on-surface-variant">{t("common.field.asExchangeReward", { count: usages.asReward.length })}</p>
                        <div className="space-y-1">
                            {usages.asReward.slice(0, 8).map((entry) => (
                                <ExchangeUsageLink key={`reward-${entry.id}`} entry={entry} />
                            ))}
                            {usages.asReward.length > 8 && (
                                <p className="pl-3 type-body-s text-on-surface-variant">{t("common.field.remainingItems", { count: usages.asReward.length - 8 })}</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function MaterialDetailModal({
    selection,
    assetSource,
    siteMap,
    onClose,
}: {
    selection: MaterialDetailSelection;
    assetSource: AssetSourceType;
    siteMap: Map<number, IMysekaiSiteInfo>;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const regularMaterial = selection?.kind === "material" ? selection.item : null;
    const mysekaiMaterial = selection?.kind === "mysekai" ? selection.item : null;
    const title = selection?.item.name ?? t("page.materials.detailTitle");
    const description = regularMaterial
        ? getEffectiveMaterialDescription(regularMaterial)
        : mysekaiMaterial?.description || "";
    const imageUrl = regularMaterial
        ? getMaterialThumbnailUrl(regularMaterial.id, assetSource)
        : mysekaiMaterial
            ? getMysekaiMaterialThumbnailUrl(mysekaiMaterial.iconAssetbundleName, assetSource)
            : "";
    const actionFileName = selection ? `${selection.item.name}_${selection.item.id}` : "material";
    const mysekaiSiteLabels = mysekaiMaterial
        ? mysekaiMaterial.mysekaiSiteIds.length === 0
            ? [t("page.materials.specialSourceBadge")]
            : mysekaiMaterial.mysekaiSiteIds.map((siteId) => getMysekaiSiteLabel(siteId, siteMap, t))
        : [];

    const { headerActions, errorMessage, saveClickCount } = useImageUrlActions({
        isOpen: !!selection,
        imageUrl,
        fileName: actionFileName,
    });

    return (
        <Modal
            isOpen={!!selection}
            onClose={onClose}
            title={title}
            size="md"
            syncHistory={false}
            headerActions={headerActions}
        >
            {selection && (
                <div className="space-y-5">
                    {saveClickCount >= 2 && (
                        <Banner tone="info">{t("page.materials.downloadHint")}</Banner>
                    )}

                    {errorMessage && <p className="type-body-s text-error">{errorMessage}</p>}

                    <div className="flex justify-center">
                        <div className="w-full max-w-[380px]">
                            <CardImage
                                key={`${selection.kind}-${selection.item.id}`}
                                src={imageUrl}
                                alt={selection.item.name}
                                className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md3-lg bg-transparent"
                                imageClassName="mx-auto h-full w-full object-contain p-4 sm:p-6"
                            />
                        </div>
                    </div>

                    <div className="space-y-0">
                        <InfoRow label="ID" value={`#${selection.item.id}`} />
                        <InfoRow label={t("common.field.name")} value={selection.item.name} />
                        <InfoRow label={t("common.field.seq")} value={String(selection.item.seq)} />
                        {regularMaterial ? (
                            <>
                                <InfoRow label={t("common.field.type")} value={getMaterialTypeLabel(regularMaterial.materialType, t)} />
                                <InfoRow label={t("common.field.canUse")} value={regularMaterial.canUse ? t("common.field.yes") : t("common.field.no")} />
                            </>
                        ) : mysekaiMaterial ? (
                            <>
                                <InfoRow label={t("common.field.type")} value={getMysekaiTypeLabel(mysekaiMaterial.mysekaiMaterialType, t)} />
                                <InfoRow label={t("common.field.rarity")} value={getMysekaiRarityLabel(mysekaiMaterial.mysekaiMaterialRarityType)} />
                            </>
                        ) : null}
                    </div>

                    {mysekaiMaterial && (
                        <div>
                            <h3 className="mb-3 type-title-s text-on-surface">{t("common.filter.sourceArea")}</h3>
                            <div className="flex flex-wrap gap-2">
                                {mysekaiSiteLabels.map((siteLabel) => (
                                    <Badge key={`${mysekaiMaterial.id}-${siteLabel}`} label={siteLabel} tone="neutral" />
                                ))}
                            </div>
                        </div>
                    )}

                    {description && (
                        <div>
                            <h3 className="mb-3 type-title-s text-on-surface">{t("common.field.description")}</h3>
                            <div className="rounded-md3-md bg-surface-container p-4">
                                <p className="whitespace-pre-line type-body-m text-on-surface-variant">
                                    {description}
                                </p>
                            </div>
                        </div>
                    )}

                    <ExchangeUsageSection selection={selection} />
                </div>
            )}
        </Modal>
    );
}

function SkeletonGrid() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, index) => (
                <div key={index} className="animate-pulse overflow-hidden rounded-md3-md bg-surface-container-low p-3">
                    <div className="mb-3 aspect-square rounded-md3-sm bg-surface-container-high" />
                    <div className="space-y-2">
                        <div className="h-4 w-3/4 rounded-md3-xs bg-surface-container-highest" />
                        <div className="h-3 w-full rounded-md3-xs bg-surface-container-high" />
                        <div className="h-3 w-2/3 rounded-md3-xs bg-surface-container-high" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function MaterialsContent() {
    const searchParams = useSearchParams();
    const { assetSource } = useTheme();
    const { t } = useI18n();

    const [materials, setMaterials] = useState<IMaterialInfo[]>([]);
    const [mysekaiMaterials, setMysekaiMaterials] = useState<IMysekaiMaterial[]>([]);
    const [mysekaiSites, setMysekaiSites] = useState<IMysekaiSiteInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    const [activeTab, setActiveTab] = useState<TabType>(DEFAULT_TAB);
    const [materialFilters, setMaterialFilters] = useState<MaterialFiltersState>(DEFAULT_MATERIAL_FILTERS);
    const [mysekaiFilters, setMysekaiFilters] = useState<MysekaiFiltersState>(DEFAULT_MYSEKAI_FILTERS);
    const [selectedDetail, setSelectedDetail] = useState<MaterialDetailSelection>(null);

    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "materials",
        defaultDisplayCount: 48,
        increment: 48,
        isReady: !isLoading,
    });

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        const requestedTab = searchParams.get("tab");
        const hasMysekaiParams = Boolean(
            searchParams.get("mysekaiTypes") ||
            searchParams.get("rarities") ||
            searchParams.get("sites")
        );

        const nextActiveTab: TabType =
            requestedTab === "mysekaiMaterials" || (!requestedTab && hasMysekaiParams)
                ? "mysekaiMaterials"
                : "materials";

        const nextMaterialFilters: MaterialFiltersState = {
            ...DEFAULT_MATERIAL_FILTERS,
        };

        const nextMysekaiFilters: MysekaiFiltersState = {
            ...DEFAULT_MYSEKAI_FILTERS,
        };

        if (nextActiveTab === "materials") {
            nextMaterialFilters.searchQuery = searchParams.get("search") || "";

            const sortBy = searchParams.get("sortBy");
            if (sortBy === "seq" || sortBy === "id" || sortBy === "name") {
                nextMaterialFilters.sortBy = sortBy;
            }

            const sortOrder = searchParams.get("sortOrder");
            if (sortOrder === "asc" || sortOrder === "desc") {
                nextMaterialFilters.sortOrder = sortOrder;
            }

            nextMaterialFilters.selectedTypes = parseStringList(searchParams.get("materialTypes"));
            nextMaterialFilters.usableOnly = searchParams.get("usable") === "true";
        } else {
            nextMysekaiFilters.searchQuery = searchParams.get("search") || "";

            const sortBy = searchParams.get("sortBy");
            if (sortBy === "seq" || sortBy === "id" || sortBy === "name" || sortBy === "rarity") {
                nextMysekaiFilters.sortBy = sortBy;
            }

            const sortOrder = searchParams.get("sortOrder");
            if (sortOrder === "asc" || sortOrder === "desc") {
                nextMysekaiFilters.sortOrder = sortOrder;
            }

            nextMysekaiFilters.selectedTypes = parseStringList(searchParams.get("mysekaiTypes"));
            nextMysekaiFilters.selectedRarities = parseStringList(searchParams.get("rarities"));
            nextMysekaiFilters.selectedSites = parseNumberList(searchParams.get("sites"));
        }

        setActiveTab((prev) => (prev === nextActiveTab ? prev : nextActiveTab));
        setMaterialFilters((prev) => (areMaterialFiltersEqual(prev, nextMaterialFilters) ? prev : nextMaterialFilters));
        setMysekaiFilters((prev) => (areMysekaiFiltersEqual(prev, nextMysekaiFilters) ? prev : nextMysekaiFilters));
        setFiltersInitialized(true);
    }, [searchParams]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        let cancelled = false;

        async function fetchData() {
            setIsLoading(true);

            const [materialsResult, mysekaiMaterialsResult, mysekaiSitesResult] = await Promise.allSettled([
                fetchMasterData<IMaterialInfo[]>("materials.json"),
                fetchMasterData<IMysekaiMaterial[]>("mysekaiMaterials.json"),
                fetchMasterData<IMysekaiSiteInfo[]>("mysekaiSites.json"),
            ]);

            if (cancelled) return;

            const nextMaterials = materialsResult.status === "fulfilled" ? materialsResult.value : [];
            const nextMysekaiMaterials = mysekaiMaterialsResult.status === "fulfilled" ? mysekaiMaterialsResult.value : [];
            const nextMysekaiSites = mysekaiSitesResult.status === "fulfilled" ? mysekaiSitesResult.value : [];

            setMaterials(nextMaterials);
            setMysekaiMaterials(nextMysekaiMaterials);
            setMysekaiSites(nextMysekaiSites);

            const mainDataFailed = materialsResult.status === "rejected" && mysekaiMaterialsResult.status === "rejected";
            const partialFailed =
                materialsResult.status === "rejected" ||
                mysekaiMaterialsResult.status === "rejected" ||
                mysekaiSitesResult.status === "rejected";

            if (mainDataFailed) {
                setError(t("page.materials.loadFailed"));
            } else if (partialFailed) {
                setError(t("page.materials.partialLoadFailed"));
            } else {
                setError(null);
            }

            setIsLoading(false);
        }

        fetchData();

        return () => {
            cancelled = true;
        };
    }, [t]);

    useEffect(() => {
        if (!filtersInitialized || typeof window === "undefined") return;

        const url = new URL(window.location.href);
        url.search = "";

        if (activeTab !== DEFAULT_TAB) {
            url.searchParams.set("tab", activeTab);
        }

        if (activeTab === "materials") {
            if (materialFilters.searchQuery.trim()) {
                url.searchParams.set("search", materialFilters.searchQuery.trim());
            }
            if (materialFilters.selectedTypes.length > 0) {
                url.searchParams.set("materialTypes", materialFilters.selectedTypes.join(","));
            }
            if (materialFilters.usableOnly) {
                url.searchParams.set("usable", "true");
            }
            if (materialFilters.sortBy !== DEFAULT_MATERIAL_FILTERS.sortBy) {
                url.searchParams.set("sortBy", materialFilters.sortBy);
            }
            if (materialFilters.sortOrder !== DEFAULT_MATERIAL_FILTERS.sortOrder) {
                url.searchParams.set("sortOrder", materialFilters.sortOrder);
            }
        } else {
            if (mysekaiFilters.searchQuery.trim()) {
                url.searchParams.set("search", mysekaiFilters.searchQuery.trim());
            }
            if (mysekaiFilters.selectedTypes.length > 0) {
                url.searchParams.set("mysekaiTypes", mysekaiFilters.selectedTypes.join(","));
            }
            if (mysekaiFilters.selectedRarities.length > 0) {
                url.searchParams.set("rarities", mysekaiFilters.selectedRarities.join(","));
            }
            if (mysekaiFilters.selectedSites.length > 0) {
                url.searchParams.set("sites", mysekaiFilters.selectedSites.join(","));
            }
            if (mysekaiFilters.sortBy !== DEFAULT_MYSEKAI_FILTERS.sortBy) {
                url.searchParams.set("sortBy", mysekaiFilters.sortBy);
            }
            if (mysekaiFilters.sortOrder !== DEFAULT_MYSEKAI_FILTERS.sortOrder) {
                url.searchParams.set("sortOrder", mysekaiFilters.sortOrder);
            }
        }

        window.history.replaceState({}, "", url.toString());
    }, [activeTab, materialFilters, mysekaiFilters, filtersInitialized]);

    const mysekaiSiteMap = useMemo(() => {
        const map = new Map<number, IMysekaiSiteInfo>();
        mysekaiSites
            .filter((site) => site.mysekaiSiteCategory === "harvest")
            .forEach((site) => {
                map.set(site.id, site);
            });
        return map;
    }, [mysekaiSites]);

    const materialTypeOptions = useMemo(
        () => sortByPreferredOrder(getUniqueValues(materials.map((item) => item.materialType)), MATERIAL_TYPE_ORDER),
        [materials]
    );

    const mysekaiTypeOptions = useMemo(
        () => sortByPreferredOrder(getUniqueValues(mysekaiMaterials.map((item) => item.mysekaiMaterialType)), MYSEKAI_TYPE_ORDER),
        [mysekaiMaterials]
    );

    const mysekaiRarityOptions = useMemo(
        () => sortByPreferredOrder(getUniqueValues(mysekaiMaterials.map((item) => item.mysekaiMaterialRarityType)), MYSEKAI_RARITY_ORDER),
        [mysekaiMaterials]
    );

    const mysekaiSiteOptions = useMemo(() => {
        const uniqueSiteIds = Array.from(
            new Set(mysekaiMaterials.flatMap((item) => item.mysekaiSiteIds))
        ).sort((a, b) => a - b);

        return uniqueSiteIds.map((siteId) => ({
            id: siteId,
            label: getMysekaiSiteLabel(siteId, mysekaiSiteMap, t),
        }));
    }, [mysekaiMaterials, mysekaiSiteMap, t]);

    const filteredMaterials = useMemo(() => {
        let result = [...materials];

        if (materialFilters.selectedTypes.length > 0) {
            result = result.filter((item) => materialFilters.selectedTypes.includes(item.materialType));
        }

        if (materialFilters.usableOnly) {
            result = result.filter((item) => item.canUse);
        }

        if (materialFilters.searchQuery.trim()) {
            const query = toSearchText(materialFilters.searchQuery);
            result = result.filter((item) => {
                const description = getEffectiveMaterialDescription(item);
                return (
                    toSearchText(item.name).includes(query) ||
                    toSearchText(item.id).includes(query) ||
                    toSearchText(description).includes(query)
                );
            });
        }

        result.sort((a, b) => {
            let compare = 0;

            if (materialFilters.sortBy === "id") {
                compare = a.id - b.id;
            } else if (materialFilters.sortBy === "name") {
                compare = a.name.localeCompare(b.name, "zh-Hans-CN");
            } else {
                compare = a.seq - b.seq;
            }

            if (compare !== 0) {
                return materialFilters.sortOrder === "asc" ? compare : -compare;
            }

            return a.id - b.id;
        });

        return result;
    }, [materials, materialFilters]);

    const filteredMysekaiMaterials = useMemo(() => {
        let result = [...mysekaiMaterials];

        if (mysekaiFilters.selectedTypes.length > 0) {
            result = result.filter((item) => mysekaiFilters.selectedTypes.includes(item.mysekaiMaterialType));
        }

        if (mysekaiFilters.selectedRarities.length > 0) {
            result = result.filter((item) => mysekaiFilters.selectedRarities.includes(item.mysekaiMaterialRarityType));
        }

        if (mysekaiFilters.selectedSites.length > 0) {
            result = result.filter((item) =>
                item.mysekaiSiteIds.some((siteId) => mysekaiFilters.selectedSites.includes(siteId))
            );
        }

        if (mysekaiFilters.searchQuery.trim()) {
            const query = toSearchText(mysekaiFilters.searchQuery);
            result = result.filter((item) => {
                return (
                    toSearchText(item.name).includes(query) ||
                    toSearchText(item.id).includes(query) ||
                    toSearchText(item.description).includes(query)
                );
            });
        }

        result.sort((a, b) => {
            let compare = 0;

            if (mysekaiFilters.sortBy === "id") {
                compare = a.id - b.id;
            } else if (mysekaiFilters.sortBy === "name") {
                compare = a.name.localeCompare(b.name, "zh-Hans-CN");
            } else if (mysekaiFilters.sortBy === "rarity") {
                compare = getMysekaiRarityRank(a.mysekaiMaterialRarityType) - getMysekaiRarityRank(b.mysekaiMaterialRarityType);
            } else {
                compare = a.seq - b.seq;
            }

            if (compare !== 0) {
                return mysekaiFilters.sortOrder === "asc" ? compare : -compare;
            }

            return a.id - b.id;
        });

        return result;
    }, [mysekaiMaterials, mysekaiFilters]);

    const currentItems = activeTab === "materials" ? filteredMaterials : filteredMysekaiMaterials;
    const currentTotalCount = activeTab === "materials" ? materials.length : mysekaiMaterials.length;
    const displayedItems = useMemo(() => currentItems.slice(0, displayCount), [currentItems, displayCount]);

    const hasActiveMaterialFilters =
        materialFilters.searchQuery !== DEFAULT_MATERIAL_FILTERS.searchQuery ||
        materialFilters.selectedTypes.length > 0 ||
        materialFilters.usableOnly !== DEFAULT_MATERIAL_FILTERS.usableOnly ||
        materialFilters.sortBy !== DEFAULT_MATERIAL_FILTERS.sortBy ||
        materialFilters.sortOrder !== DEFAULT_MATERIAL_FILTERS.sortOrder;

    const hasActiveMysekaiFilters =
        mysekaiFilters.searchQuery !== DEFAULT_MYSEKAI_FILTERS.searchQuery ||
        mysekaiFilters.selectedTypes.length > 0 ||
        mysekaiFilters.selectedRarities.length > 0 ||
        mysekaiFilters.selectedSites.length > 0 ||
        mysekaiFilters.sortBy !== DEFAULT_MYSEKAI_FILTERS.sortBy ||
        mysekaiFilters.sortOrder !== DEFAULT_MYSEKAI_FILTERS.sortOrder;

    const updateMaterialFilters = useCallback((updater: (prev: MaterialFiltersState) => MaterialFiltersState) => {
        setMaterialFilters((prev) => updater(prev));
        resetDisplayCount();
    }, [resetDisplayCount]);

    const updateMysekaiFilters = useCallback((updater: (prev: MysekaiFiltersState) => MysekaiFiltersState) => {
        setMysekaiFilters((prev) => updater(prev));
        resetDisplayCount();
    }, [resetDisplayCount]);

    const resetMaterialFilters = useCallback(() => {
        setMaterialFilters(DEFAULT_MATERIAL_FILTERS);
        resetDisplayCount();
    }, [resetDisplayCount]);

    const resetMysekaiFilters = useCallback(() => {
        setMysekaiFilters(DEFAULT_MYSEKAI_FILTERS);
        resetDisplayCount();
    }, [resetDisplayCount]);

    const quickFilterTitle = t(`page.materials.filterTitle.${activeTab}`);
    const quickFilterContent = useMemo(() => {
        const materialSortOptions = MATERIAL_SORT_OPTIONS.map((option) => ({
            id: option.id,
            label: t(option.labelKey),
        }));
        const mysekaiSortOptions = MYSEKAI_SORT_OPTIONS.map((option) => ({
            id: option.id,
            label: t(option.labelKey),
        }));

        return activeTab === "materials" ? (
            <BaseFilters
                title={t("page.materials.filterPanelTitle.materials")}
                filteredCount={filteredMaterials.length}
                totalCount={materials.length}
                countUnit={t("page.materials.countUnit")}
                searchQuery={materialFilters.searchQuery}
                onSearchChange={(query) => updateMaterialFilters((prev) => ({ ...prev, searchQuery: query }))}
                searchPlaceholder={t("page.materials.searchPlaceholder.materials")}
                sortOptions={materialSortOptions}
                sortBy={materialFilters.sortBy}
                sortOrder={materialFilters.sortOrder}
                onSortChange={(sortBy, sortOrder) =>
                    updateMaterialFilters((prev) => ({
                        ...prev,
                        sortBy: sortBy as MaterialSortBy,
                        sortOrder,
                    }))
                }
                hasActiveFilters={hasActiveMaterialFilters}
                onReset={resetMaterialFilters}
            >
                <FilterSection label={t("common.filter.materialType")}>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton
                            selected={materialFilters.selectedTypes.length === 0}
                            onClick={() => updateMaterialFilters((prev) => ({ ...prev, selectedTypes: [] }))}
                        >
                            {t("common.filter.all")}
                        </FilterButton>
                        {materialTypeOptions.map((type) => (
                            <FilterButton
                                key={type}
                                selected={materialFilters.selectedTypes.includes(type)}
                                onClick={() =>
                                    updateMaterialFilters((prev) => ({
                                        ...prev,
                                        selectedTypes: prev.selectedTypes.includes(type)
                                            ? prev.selectedTypes.filter((item) => item !== type)
                                            : [...prev.selectedTypes, type],
                                    }))
                                }
                            >
                                {getMaterialTypeLabel(type, t)}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>

                <FilterSection label={t("common.filter.display")}>
                    <FilterToggle
                        selected={materialFilters.usableOnly}
                        onClick={() => updateMaterialFilters((prev) => ({ ...prev, usableOnly: !prev.usableOnly }))}
                        label={t("page.materials.usableOnly")}
                    />
                </FilterSection>
            </BaseFilters>
        ) : (
            <BaseFilters
                title={t("page.materials.filterPanelTitle.mysekaiMaterials")}
                filteredCount={filteredMysekaiMaterials.length}
                totalCount={mysekaiMaterials.length}
                countUnit={t("page.materials.countUnit")}
                searchQuery={mysekaiFilters.searchQuery}
                onSearchChange={(query) => updateMysekaiFilters((prev) => ({ ...prev, searchQuery: query }))}
                searchPlaceholder={t("page.materials.searchPlaceholder.mysekaiMaterials")}
                sortOptions={mysekaiSortOptions}
                sortBy={mysekaiFilters.sortBy}
                sortOrder={mysekaiFilters.sortOrder}
                onSortChange={(sortBy, sortOrder) =>
                    updateMysekaiFilters((prev) => ({
                        ...prev,
                        sortBy: sortBy as MysekaiSortBy,
                        sortOrder,
                    }))
                }
                hasActiveFilters={hasActiveMysekaiFilters}
                onReset={resetMysekaiFilters}
            >
                <FilterSection label={t("common.filter.materialType")}>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton
                            selected={mysekaiFilters.selectedTypes.length === 0}
                            onClick={() => updateMysekaiFilters((prev) => ({ ...prev, selectedTypes: [] }))}
                        >
                            {t("common.filter.all")}
                        </FilterButton>
                        {mysekaiTypeOptions.map((type) => (
                            <FilterButton
                                key={type}
                                selected={mysekaiFilters.selectedTypes.includes(type)}
                                onClick={() =>
                                    updateMysekaiFilters((prev) => ({
                                        ...prev,
                                        selectedTypes: prev.selectedTypes.includes(type)
                                            ? prev.selectedTypes.filter((item) => item !== type)
                                            : [...prev.selectedTypes, type],
                                    }))
                                }
                            >
                                {getMysekaiTypeLabel(type, t)}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>

                <FilterSection label={t("common.filter.rarity")}>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton
                            selected={mysekaiFilters.selectedRarities.length === 0}
                            onClick={() => updateMysekaiFilters((prev) => ({ ...prev, selectedRarities: [] }))}
                        >
                            {t("common.filter.all")}
                        </FilterButton>
                        {mysekaiRarityOptions.map((rarity) => (
                            <FilterButton
                                key={rarity}
                                selected={mysekaiFilters.selectedRarities.includes(rarity)}
                                onClick={() =>
                                    updateMysekaiFilters((prev) => ({
                                        ...prev,
                                        selectedRarities: prev.selectedRarities.includes(rarity)
                                            ? prev.selectedRarities.filter((item) => item !== rarity)
                                            : [...prev.selectedRarities, rarity],
                                    }))
                                }
                            >
                                {getMysekaiRarityLabel(rarity)}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>

                <FilterSection label={t("common.filter.sourceArea")}>
                    <div className="grid grid-cols-2 gap-2">
                        <FilterButton
                            selected={mysekaiFilters.selectedSites.length === 0}
                            onClick={() => updateMysekaiFilters((prev) => ({ ...prev, selectedSites: [] }))}
                        >
                            {t("common.filter.all")}
                        </FilterButton>
                        {mysekaiSiteOptions.map((site) => (
                            <FilterButton
                                key={site.id}
                                selected={mysekaiFilters.selectedSites.includes(site.id)}
                                onClick={() =>
                                    updateMysekaiFilters((prev) => ({
                                        ...prev,
                                        selectedSites: prev.selectedSites.includes(site.id)
                                            ? prev.selectedSites.filter((item) => item !== site.id)
                                            : [...prev.selectedSites, site.id].sort((a, b) => a - b),
                                    }))
                                }
                            >
                                {site.label}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>
            </BaseFilters>
        );
    }, [
        activeTab,
        filteredMaterials.length,
        filteredMysekaiMaterials.length,
        hasActiveMaterialFilters,
        hasActiveMysekaiFilters,
        materialFilters,
        materialTypeOptions,
        materials.length,
        mysekaiFilters,
        mysekaiMaterials.length,
        mysekaiRarityOptions,
        mysekaiSiteOptions,
        mysekaiTypeOptions,
        resetMaterialFilters,
        resetMysekaiFilters,
        t,
        updateMaterialFilters,
        updateMysekaiFilters,
    ]);

    useQuickFilter(quickFilterTitle, quickFilterContent, [quickFilterTitle, quickFilterContent]);

    const currentTabLabel = t(`page.materials.tabs.${activeTab}`);
    const currentHasActiveFilters = activeTab === "materials" ? hasActiveMaterialFilters : hasActiveMysekaiFilters;

    return (
        <PageContainer>
            <MaterialDetailModal
                selection={selectedDetail}
                assetSource={assetSource}
                siteMap={mysekaiSiteMap}
                onClose={() => setSelectedDetail(null)}
            />

            <MaterialsPageHeader />

            <Tabs
                className="mb-4"
                value={activeTab}
                onValueChange={(tab) => {
                    setSelectedDetail(null);
                    setActiveTab(tab);
                    resetDisplayCount();
                }}
                items={[
                    { value: "materials" as TabType, label: t("page.materials.tabs.materials") },
                    { value: "mysekaiMaterials" as TabType, label: t("page.materials.tabs.mysekaiMaterials") },
                ]}
            />

            {!isLoading && (
                <div className="mb-4 type-body-s text-on-surface-variant">
                    {t("page.materials.currentTabSummary", {
                        tab: currentTabLabel,
                        count: currentItems.length,
                        total: currentHasActiveFilters
                            ? t("page.materials.currentTabTotalSuffix", { total: currentTotalCount })
                            : "",
                    })}
                </div>
            )}

            {error && (
                <ErrorState className="mb-6" title={t("page.materials.loadNotice")} message={error} retryLabel={t("common.action.retry")} />
            )}

            {/* Filters live in the global FilterDrawer (registered
                above via useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {isLoading ? (
                    <SkeletonGrid />
                ) : currentItems.length === 0 ? (
                    <EmptyState
                        icon={mdInventory2}
                        title={currentHasActiveFilters ? t("page.materials.noResult") : t("common.state.noData")}
                        description={
                            currentHasActiveFilters
                                ? t("page.materials.resetHint")
                                : t(`page.materials.noData.${activeTab}`)
                        }
                    />
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                            {activeTab === "materials"
                                ? (displayedItems as IMaterialInfo[]).map((item) => (
                                    <RegularMaterialCard
                                        key={item.id}
                                        item={item}
                                        assetSource={assetSource}
                                        onClick={() => setSelectedDetail({ kind: "material", item })}
                                    />
                                ))
                                : (displayedItems as IMysekaiMaterial[]).map((item) => (
                                    <MysekaiMaterialCard
                                        key={item.id}
                                        item={item}
                                        assetSource={assetSource}
                                        siteMap={mysekaiSiteMap}
                                        onClick={() => setSelectedDetail({ kind: "mysekai", item })}
                                    />
                                ))}
                        </div>

                        <LoadMore
                            label={t("page.materials.loadMore")}
                            shown={displayedItems.length}
                            total={currentItems.length}
                            onLoadMore={loadMore}
                            allLoadedLabel={t("page.materials.allLoaded", { count: currentItems.length, tab: currentTabLabel })}
                        />
                    </>
                )}
            </div>
        </PageContainer>
    );
}

function MaterialsLoadingFallback() {
    const { t } = useI18n();

    return <LoadingState className="min-h-[50vh]" label={t("page.materials.loadingFallback")} />;
}

export default function MaterialsClient() {
    return (
        <MainLayout>
            <Suspense fallback={<MaterialsLoadingFallback />}>
                <MaterialsContent />
            </Suspense>
        </MainLayout>
    );
}
