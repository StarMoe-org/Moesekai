"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterButton, FilterSection } from "@/components/common/BaseFilters";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { getCharacterIconUrl, getCommonMaterialThumbnailUrl, getMaterialThumbnailUrl, getMysekaiMaterialThumbnailUrl, getPracticeTicketThumbnailUrl, getSkillPracticeTicketThumbnailUrl } from "@/lib/assets";
import { fetchMasterData } from "@/lib/fetch";
import {
    areExchangeFiltersEqual,
    DEFAULT_EXCHANGE_FILTERS,
    filterAndSortExchanges,
    formatExchangeTime,
    getExchangeCategoryLabel,
    getExchangeStatusLabel,
    getExchangeTypeLabel,
    getRefreshCycleLabel,
    getRewardTypeLabel,
    getExchangeLastModified,
    loadExchangeCoreData,
    parseExchangeFilterParams,
    summarizeExchangeRewards,
    type ExchangeCoreData,
    type ExchangeListFilters,
    type ExchangeSortBy,
    type ExchangeSortOrder,
} from "@/lib/exchanges";
import { getCharacterName } from "@/lib/i18n";
import type { ExchangeStatus, FlattenedMaterialExchange } from "@/types/exchange";
import type { ICardInfo } from "@/types/types";
import { Banner, Card, EmptyState, ErrorState, LoadMore, LoadingState, PageContainer, PageHeader, Select } from "@/components/md3";
import { mdSwapHoriz } from "@/components/md3/icons";

function ExchangesPageHeader() {
    const { t } = useI18n();

    return (
        <PageHeader
            align="center"
            eyebrow={t("page.exchanges.badge")}
            title={t("page.exchanges.title")}
            highlight={t("page.exchanges.titleHighlight")}
            description={t("page.exchanges.description")}
        />
    );
}

type BadgeTone = "primary" | "secondary" | "tertiary" | "positive" | "error" | "neutral";

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
    primary: "bg-primary-container text-on-primary-container",
    secondary: "bg-secondary-container text-on-secondary-container",
    tertiary: "bg-tertiary-container text-on-tertiary-container",
    positive: "bg-primary-fixed text-on-primary-fixed-variant",
    error: "bg-error-container text-on-error-container",
    neutral: "bg-surface-container-highest text-on-surface-variant",
};

function Badge({
    label,
    tone = "neutral",
}: {
    label: string;
    tone?: BadgeTone;
}) {
    return (
        <span className={`inline-flex items-center rounded-md3-sm px-2 py-0.5 type-label-s ${BADGE_TONE_CLASS[tone]}`}>
            {label}
        </span>
    );
}

function getStatusTone(status: ExchangeStatus): BadgeTone {
    switch (status) {
        case "active":
            return "positive";
        case "upcoming":
            return "tertiary";
        case "ended":
            return "error";
        case "permanent":
        default:
            return "neutral";
    }
}

const THUMB_LG = "h-9 w-9 shrink-0 rounded-md3-xs bg-surface-container-high object-contain p-0.5";
const THUMB_SM = "h-7 w-7 rounded-md3-xs bg-surface-container-high object-contain p-0.5";
const QTY_BADGE =
    "absolute -bottom-0.5 -right-0.5 rounded-md3-xs bg-inverse-surface/85 px-0.5 text-[7px] font-bold leading-tight text-inverse-on-surface";

function SkeletonList() {
    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, index) => (
                <div
                    key={index}
                    className="animate-pulse rounded-md3-md bg-surface-container-low p-4"
                >
                    <div className="mb-2 flex flex-wrap gap-1.5">
                        <div className="h-5 w-16 rounded-md3-sm bg-surface-container-high" />
                        <div className="h-5 w-20 rounded-md3-sm bg-surface-container-high" />
                        <div className="h-5 w-14 rounded-md3-sm bg-surface-container-high" />
                    </div>
                    <div className="mb-1 h-5 w-3/4 rounded-md3-xs bg-surface-container-highest" />
                    <div className="mb-3 h-4 w-1/2 rounded-md3-xs bg-surface-container-high" />
                    <div className="mb-3 flex gap-1.5">
                        <div className="h-5 w-16 rounded-md3-sm bg-surface-container-high" />
                        <div className="h-5 w-20 rounded-md3-sm bg-surface-container-high" />
                    </div>
                    <div className="flex justify-between">
                        <div className="h-3 w-24 rounded-md3-xs bg-surface-container-high" />
                        <div className="h-3 w-12 rounded-md3-xs bg-surface-container-high" />
                    </div>
                </div>
            ))}
        </div>
    );
}

interface ExchangePageContextValue {
    coreData: ExchangeCoreData;
    cardsMap: Map<number, ICardInfo>;
}

const ExchangePageContext = React.createContext<ExchangePageContextValue | null>(null);

function useExchangePageContext() {
    const ctx = React.useContext(ExchangePageContext);
    if (!ctx) throw new Error("useExchangePageContext must be used within provider");
    return ctx;
}

function ScrollRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="mb-2">
            <p className="mb-1 type-label-s text-on-surface-variant">{label}</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {children}
            </div>
        </div>
    );
}
function RewardThumbnail({ detail }: { detail: { resourceType: string; resourceId?: number; resourceQuantity?: number } }) {
    const { t } = useI18n();
    const { assetSource } = useTheme();
    const { coreData, cardsMap } = useExchangePageContext();

    if (detail.resourceType === "card" && typeof detail.resourceId === "number") {
        const card = cardsMap.get(detail.resourceId);
        if (card) {
            return (
                <div className="shrink-0" title={card.prefix}>
                    <SekaiCardThumbnail card={card} width={40} />
                </div>
            );
        }
    }

    if (detail.resourceType === "material" && typeof detail.resourceId === "number") {
        return (
            <img
                src={getMaterialThumbnailUrl(detail.resourceId, assetSource)}
                alt={`material-${detail.resourceId}`}
                className={THUMB_LG}
                loading="lazy"
            />
        );
    }

    if (
        detail.resourceType === "coin" ||
        detail.resourceType === "jewel" ||
        detail.resourceType === "virtual_coin"
    ) {
        const assetName = detail.resourceType === "coin"
            ? "coin"
            : detail.resourceType === "jewel"
                ? "jewel"
                : "virtual_coin";
        return (
            <img
                src={getCommonMaterialThumbnailUrl(assetName, assetSource)}
                alt={detail.resourceType}
                className={THUMB_LG}
                loading="lazy"
            />
        );
    }

    if (detail.resourceType === "mysekai_material" && typeof detail.resourceId === "number") {
        const mat = coreData.mysekaiMaterialMap.get(detail.resourceId);
        const imgUrl = mat?.iconAssetbundleName
            ? getMysekaiMaterialThumbnailUrl(mat.iconAssetbundleName, assetSource)
            : undefined;
        return imgUrl ? (
            <img
                src={imgUrl}
                alt={mat?.name ?? `mysekai-mat-${detail.resourceId}`}
                className="h-9 w-9 shrink-0 rounded-md3-xs bg-tertiary-container object-contain p-0.5"
                loading="lazy"
                title={mat?.name}
            />
        ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md3-xs bg-tertiary-container text-[8px] font-bold text-on-tertiary-container">
                MS
            </div>
        );
    }

    if (detail.resourceType === "practice_ticket" && typeof detail.resourceId === "number") {
        return (
            <img
                src={getPracticeTicketThumbnailUrl(detail.resourceId, assetSource)}
                alt={`practice-ticket-${detail.resourceId}`}
                className={THUMB_LG}
                loading="lazy"
                title={getRewardTypeLabel(detail.resourceType, t)}
            />
        );
    }

    if (detail.resourceType === "skill_practice_ticket" && typeof detail.resourceId === "number") {
        return (
            <img
                src={getSkillPracticeTicketThumbnailUrl(detail.resourceId, assetSource)}
                alt={`skill-practice-ticket-${detail.resourceId}`}
                className={THUMB_LG}
                loading="lazy"
                title={getRewardTypeLabel(detail.resourceType, t)}
            />
        );
    }

    if (detail.resourceType === "character_rank_exp" && typeof detail.resourceId === "number") {
        return (
            <div
                className="relative shrink-0"
                title={`${getRewardTypeLabel(detail.resourceType, t)} · ${getCharacterName(t, detail.resourceId)}`}
            >
                <img
                    src={getCharacterIconUrl(detail.resourceId)}
                    alt={`character-rank-exp-${detail.resourceId}`}
                    className="h-9 w-9 rounded-full border border-outline-variant bg-surface-container-lowest object-cover"
                    loading="lazy"
                />
                <span className="absolute -bottom-0.5 -right-0.5 select-none rounded-md3-xs bg-primary px-[3px] text-[6px] font-black leading-tight text-on-primary">
                    EXP
                </span>
            </div>
        );
    }

    return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md3-xs bg-surface-container-high text-[8px] font-bold text-on-surface-variant">
            {getRewardTypeLabel(detail.resourceType, t).slice(0, 2)}
        </div>
    );
}

function CostThumbnail({ cost }: { cost: { resourceType: string; resourceId: number; quantity: number } }) {
    const { assetSource } = useTheme();
    const { coreData } = useExchangePageContext();

    if (cost.resourceType === "material") {
        return (
            <div className="relative shrink-0" title={coreData.materialMap.get(cost.resourceId)?.name}>
                <img
                    src={getMaterialThumbnailUrl(cost.resourceId, assetSource)}
                    alt={`cost-${cost.resourceId}`}
                    className={THUMB_SM}
                    loading="lazy"
                />
                <span className={QTY_BADGE}>
                    {cost.quantity}
                </span>
            </div>
        );
    }

    if (cost.resourceType === "mysekai_material") {
        const mat = coreData.mysekaiMaterialMap.get(cost.resourceId);
        const imgUrl = mat?.iconAssetbundleName
            ? getMysekaiMaterialThumbnailUrl(mat.iconAssetbundleName, assetSource)
            : undefined;
        return (
            <div className="relative shrink-0" title={mat?.name}>
                {imgUrl ? (
                    <img
                        src={imgUrl}
                        alt={`cost-ms-${cost.resourceId}`}
                        className="h-7 w-7 rounded-md3-xs bg-tertiary-container object-contain p-0.5"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-md3-xs bg-tertiary-container text-[7px] font-bold text-on-tertiary-container">MS</div>
                )}
                <span className={QTY_BADGE}>
                    {cost.quantity}
                </span>
            </div>
        );
    }

    return null;
}

function ExchangeCard({ entry }: { entry: FlattenedMaterialExchange }) {
    const { t, formatDate } = useI18n();
    const _rewardSummary = useMemo(() => summarizeExchangeRewards(entry.rewardDetails), [entry.rewardDetails]);
    const visibleRewards = entry.rewardDetails.slice(0, 8);
    const hiddenRewardCount = Math.max(0, entry.rewardDetails.length - 8);
    const visibleCosts = entry.costs.slice(0, 8);
    const hiddenCostCount = Math.max(0, entry.costs.length - 8);

    return (
        <Card
            variant="elevated"
            href={`/exchanges/${entry.id}`}
            data-shortcut-item="true"
            className="group p-4"
        >
            <div className="mb-2 flex flex-wrap gap-1.5">
                <Badge label={getExchangeStatusLabel(entry.status, t)} tone={getStatusTone(entry.status)} />
                <Badge label={getExchangeCategoryLabel(entry.exchangeCategory, t)} tone="secondary" />
                <Badge label={getExchangeTypeLabel(entry.materialExchangeType, t)} tone="tertiary" />
                {typeof entry.exchangeLimit === "number" ? <Badge label={t("page.exchanges.limitTimes", { count: entry.exchangeLimit })} tone="error" /> : null}
            </div>

            <h2 className="mb-3 line-clamp-2 type-title-s text-on-surface">
                {entry.resolvedTitle}
            </h2>

            <div className="flex gap-4">
                {visibleRewards.length > 0 && (
                    <div className="min-w-0 flex-1">
                        <ScrollRow label={t("page.exchanges.rewards")}>
                            {visibleRewards.map((detail, i) => (
                                <RewardThumbnail key={`r-${entry.id}-${i}`} detail={detail} />
                            ))}
                            {hiddenRewardCount > 0 && (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md3-xs bg-surface-container-high type-label-s text-on-surface-variant">
                                    +{hiddenRewardCount}
                                </div>
                            )}
                        </ScrollRow>
                    </div>
                )}

                {visibleCosts.length > 0 && (
                    <div className="min-w-0 flex-1">
                        <ScrollRow label={t("page.exchanges.costs")}>
                            {visibleCosts.map((cost, i) => (
                                <CostThumbnail key={`c-${entry.id}-${i}`} cost={cost} />
                            ))}
                            {hiddenCostCount > 0 && (
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md3-xs bg-surface-container-high text-[8px] font-bold text-on-surface-variant">
                                    +{hiddenCostCount}
                                </div>
                            )}
                        </ScrollRow>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between type-label-m">
                <span className="text-on-surface-variant">{formatExchangeTime(getExchangeLastModified(entry), formatDate)}</span>
                <span className="text-primary">
                    {t("page.exchanges.detailLink")}
                </span>
            </div>
        </Card>
    );
}

function normalizeFilters(filters: ExchangeListFilters): ExchangeListFilters {
    const allowedSortBy: ExchangeSortBy[] = ["status_priority", "seq", "id", "startAt", "endAt"];
    const allowedSortOrder: ExchangeSortOrder[] = ["asc", "desc"];

    return {
        ...DEFAULT_EXCHANGE_FILTERS,
        ...filters,
        sortBy: allowedSortBy.includes(filters.sortBy) ? filters.sortBy : DEFAULT_EXCHANGE_FILTERS.sortBy,
        sortOrder: allowedSortOrder.includes(filters.sortOrder) ? filters.sortOrder : DEFAULT_EXCHANGE_FILTERS.sortOrder,
    };
}

function ExchangesContent() {
    const searchParams = useSearchParams();
    const { t } = useI18n();
    const [coreData, setCoreData] = useState<ExchangeCoreData | null>(null);
    const [cardsMap, setCardsMap] = useState<Map<number, ICardInfo>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);
    const [filters, setFilters] = useState<ExchangeListFilters>(DEFAULT_EXCHANGE_FILTERS);

    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "exchanges",
        defaultDisplayCount: 30,
        increment: 30,
        isReady: !isLoading,
    });

    useEffect(() => {
        const parsed = normalizeFilters(parseExchangeFilterParams(searchParams));
        setFilters((prev) => (areExchangeFiltersEqual(prev, parsed) ? prev : parsed));
        setFiltersInitialized(true);
    }, [searchParams]);

    useEffect(() => {
        if (!filtersInitialized || typeof window === "undefined") return;

        const url = new URL(window.location.href);
        url.search = "";

        const nextParams = new URLSearchParams();
        if (filters.searchQuery.trim()) nextParams.set("search", filters.searchQuery.trim());
        if (filters.selectedSummaryIds.length > 0) nextParams.set("summaries", filters.selectedSummaryIds.join(","));
        if (filters.selectedCategories.length > 0) nextParams.set("categories", filters.selectedCategories.join(","));
        if (filters.selectedExchangeTypes.length > 0) nextParams.set("exchangeTypes", filters.selectedExchangeTypes.join(","));
        if (filters.selectedStatuses.length > 0) nextParams.set("statuses", filters.selectedStatuses.join(","));
        if (filters.selectedRefreshCycles.length > 0) nextParams.set("refreshCycles", filters.selectedRefreshCycles.join(","));
        if (filters.selectedRewardTypes.length > 0) nextParams.set("rewardTypes", filters.selectedRewardTypes.join(","));
        if (filters.selectedCostTypes.length > 0) nextParams.set("costTypes", filters.selectedCostTypes.join(","));
        if (filters.sortBy !== DEFAULT_EXCHANGE_FILTERS.sortBy) nextParams.set("sortBy", filters.sortBy);
        if (filters.sortOrder !== DEFAULT_EXCHANGE_FILTERS.sortOrder) nextParams.set("sortOrder", filters.sortOrder);

        url.search = nextParams.toString();
        window.history.replaceState({}, "", url.toString());
    }, [filters, filtersInitialized]);

    useEffect(() => {
        let cancelled = false;

        async function fetchData() {
            try {
                setIsLoading(true);
                const [loaded, cards] = await Promise.all([
                    loadExchangeCoreData(),
                    fetchMasterData<ICardInfo[]>("cards.json").catch(() => [] as ICardInfo[]),
                ]);
                if (cancelled) return;
                setCoreData(loaded);
                setCardsMap(new Map(cards.map((c) => [c.id, c])));
                setError(null);
            } catch (err) {
                if (cancelled) return;
                console.error("Error loading exchanges:", err);
                setError(err instanceof Error ? err.message : t("page.exchanges.loadFailed"));
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        fetchData();

        return () => {
            cancelled = true;
        };
    }, [t]);

    const summaryOptions = useMemo(() => {
        if (!coreData) return [];
        return [...coreData.summaries]
            .sort((a, b) => a.seq - b.seq)
            .map((summary) => ({
                id: summary.id,
                label: summary.name,
                count: summary.materialExchanges.length,
            }));
    }, [coreData]);

    const categoryOptions = useMemo(() => {
        if (!coreData) return [];
        return Array.from(new Set(coreData.flattenedExchanges.map((entry) => entry.exchangeCategory)))
            .sort((a, b) => getExchangeCategoryLabel(a, t).localeCompare(getExchangeCategoryLabel(b, t)));
    }, [coreData, t]);

    const rewardTypeOptions = useMemo(() => {
        if (!coreData) return [];
        return Array.from(new Set(coreData.flattenedExchanges.flatMap((entry) => entry.rewardTypes)))
            .sort((a, b) => getRewardTypeLabel(a, t).localeCompare(getRewardTypeLabel(b, t)));
    }, [coreData, t]);

    const hasActiveFilters =
        filters.searchQuery !== DEFAULT_EXCHANGE_FILTERS.searchQuery ||
        filters.selectedSummaryIds.length > 0 ||
        filters.selectedCategories.length > 0 ||
        filters.selectedExchangeTypes.length > 0 ||
        filters.selectedStatuses.length > 0 ||
        filters.selectedRefreshCycles.length > 0 ||
        filters.selectedRewardTypes.length > 0 ||
        filters.selectedCostTypes.length > 0 ||
        filters.sortBy !== DEFAULT_EXCHANGE_FILTERS.sortBy ||
        filters.sortOrder !== DEFAULT_EXCHANGE_FILTERS.sortOrder;

    const updateFilters = useCallback((updater: (prev: ExchangeListFilters) => ExchangeListFilters) => {
        setFilters((prev) => normalizeFilters(updater(prev)));
        resetDisplayCount();
    }, [resetDisplayCount]);

    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_EXCHANGE_FILTERS);
        resetDisplayCount();
    }, [resetDisplayCount]);

    const filteredEntries = useMemo(() => {
        if (!coreData) return [];
        return filterAndSortExchanges(coreData.flattenedExchanges, filters);
    }, [coreData, filters]);

    const displayedEntries = useMemo(() => filteredEntries.slice(0, displayCount), [filteredEntries, displayCount]);

    const quickFilterContent = useMemo(() => (
        <BaseFilters
            title={t("page.exchanges.filterPanelTitle")}
            filteredCount={filteredEntries.length}
            totalCount={coreData?.flattenedExchanges.length || 0}
            countUnit={t("page.exchanges.countUnit")}
            searchQuery={filters.searchQuery}
            onSearchChange={(query) => updateFilters((prev) => ({ ...prev, searchQuery: query }))}
            searchPlaceholder={t("page.exchanges.searchPlaceholder")}
            sortOptions={[
                { id: "status_priority", label: t("common.filter.sortByStatusPriority") },
                { id: "seq", label: t("common.filter.sortByDefault") },
                { id: "id", label: t("common.filter.sortById") },
                { id: "startAt", label: t("common.filter.sortByStartAt") },
                { id: "endAt", label: t("common.filter.sortByEndAt") },
            ]}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            onSortChange={(sortBy, sortOrder) => updateFilters((prev) => ({
                ...prev,
                sortBy: sortBy as ExchangeSortBy,
                sortOrder,
            }))}
            hasActiveFilters={hasActiveFilters}
            onReset={resetFilters}
        >
            <FilterSection label={t("common.filter.exchangeShop")}>
                <Select
                    value={filters.selectedSummaryIds.length === 1 ? filters.selectedSummaryIds[0] : null}
                    onValueChange={(value) => updateFilters((prev) => ({ ...prev, selectedSummaryIds: value === 0 ? [] : [value] }))}
                    options={[{ value: 0, label: t("common.filter.all") }, ...summaryOptions.map((summary) => ({ value: summary.id, label: `${summary.label} (${summary.count})`, textValue: summary.label }))]}
                    label={t("common.filter.exchangeShop")}
                    selectedLabel={filters.selectedSummaryIds.length === 0 ? t("common.filter.all") : undefined}
                />
            </FilterSection>

            <FilterSection label={t("common.filter.category")}>
                <Select
                    value={filters.selectedCategories.length === 1 ? filters.selectedCategories[0] : null}
                    onValueChange={(value) => updateFilters((prev) => ({ ...prev, selectedCategories: value === "__all__" ? [] : [value] }))}
                    options={[{ value: "__all__", label: t("common.filter.all") }, ...categoryOptions.map((category) => ({ value: category, label: getExchangeCategoryLabel(category, t) }))]}
                    label={t("common.filter.category")}
                    selectedLabel={filters.selectedCategories.length === 0 ? t("common.filter.all") : undefined}
                />
            </FilterSection>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FilterSection label={t("common.filter.exchangeType")}>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton
                            selected={filters.selectedExchangeTypes.length === 0}
                            onClick={() => updateFilters((prev) => ({ ...prev, selectedExchangeTypes: [] }))}
                        >
                            {t("common.filter.all")}
                        </FilterButton>
                        {(["normal", "beginner"] as ExchangeListFilters["selectedExchangeTypes"]).map((type) => (
                            <FilterButton
                                key={type}
                                selected={filters.selectedExchangeTypes.includes(type)}
                                onClick={() => updateFilters((prev) => ({
                                    ...prev,
                                    selectedExchangeTypes: prev.selectedExchangeTypes.includes(type)
                                        ? prev.selectedExchangeTypes.filter((item) => item !== type)
                                        : [...prev.selectedExchangeTypes, type].sort((a, b) => a.localeCompare(b)),
                                }))}
                            >
                                {getExchangeTypeLabel(type, t)}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>

                <FilterSection label={t("page.exchanges.fields.status")}>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton
                            selected={filters.selectedStatuses.length === 0}
                            onClick={() => updateFilters((prev) => ({ ...prev, selectedStatuses: [] }))}
                        >
                            {t("common.filter.all")}
                        </FilterButton>
                        {(["active", "upcoming", "permanent", "ended"] as ExchangeStatus[]).map((status) => (
                            <FilterButton
                                key={status}
                                selected={filters.selectedStatuses.includes(status)}
                                onClick={() => updateFilters((prev) => ({
                                    ...prev,
                                    selectedStatuses: prev.selectedStatuses.includes(status)
                                        ? prev.selectedStatuses.filter((item) => item !== status)
                                        : [...prev.selectedStatuses, status],
                                }))}
                            >
                                {getExchangeStatusLabel(status, t)}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FilterSection label={t("common.filter.refreshCycle")}>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton
                            selected={filters.selectedRefreshCycles.length === 0}
                            onClick={() => updateFilters((prev) => ({ ...prev, selectedRefreshCycles: [] }))}
                        >
                            {t("common.filter.all")}
                        </FilterButton>
                        {(["none", "monthly"] as ExchangeListFilters["selectedRefreshCycles"]).map((refreshCycle) => (
                            <FilterButton
                                key={refreshCycle}
                                selected={filters.selectedRefreshCycles.includes(refreshCycle)}
                                onClick={() => updateFilters((prev) => ({
                                    ...prev,
                                    selectedRefreshCycles: prev.selectedRefreshCycles.includes(refreshCycle)
                                        ? prev.selectedRefreshCycles.filter((item) => item !== refreshCycle)
                                        : [...prev.selectedRefreshCycles, refreshCycle].sort((a, b) => a.localeCompare(b)),
                                }))}
                            >
                                {getRefreshCycleLabel(refreshCycle, t)}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>

                <FilterSection label={t("common.filter.costType")}>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton
                            selected={filters.selectedCostTypes.length === 0}
                            onClick={() => updateFilters((prev) => ({ ...prev, selectedCostTypes: [] }))}
                        >
                            {t("common.filter.all")}
                        </FilterButton>
                        {([
                            "material",
                            "mysekai_material",
                        ] as ExchangeListFilters["selectedCostTypes"]).map((type) => (
                            <FilterButton
                                key={type}
                                selected={filters.selectedCostTypes.includes(type)}
                                onClick={() => updateFilters((prev) => ({
                                    ...prev,
                                    selectedCostTypes: prev.selectedCostTypes.includes(type)
                                        ? prev.selectedCostTypes.filter((item) => item !== type)
                                        : [...prev.selectedCostTypes, type],
                                }))}
                            >
                                {getRewardTypeLabel(type, t)}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>
            </div>

            <FilterSection label={t("common.filter.rewardType")}>
                <Select
                    value={filters.selectedRewardTypes.length === 1 ? filters.selectedRewardTypes[0] : null}
                    onValueChange={(value) => updateFilters((prev) => ({ ...prev, selectedRewardTypes: value === "__all__" ? [] : [value] }))}
                    options={[{ value: "__all__", label: t("common.filter.all") }, ...rewardTypeOptions.map((rewardType) => ({ value: rewardType, label: getRewardTypeLabel(rewardType, t) }))]}
                    label={t("common.filter.rewardType")}
                    selectedLabel={filters.selectedRewardTypes.length === 0 ? t("common.filter.all") : undefined}
                />
            </FilterSection>
        </BaseFilters>
    ), [coreData?.flattenedExchanges.length, filteredEntries.length, filters, hasActiveFilters, resetFilters, rewardTypeOptions, summaryOptions, categoryOptions, t, updateFilters]);

    useQuickFilter(t("page.exchanges.filterTitle"), quickFilterContent, [quickFilterContent, t]);

    if (!coreData) {
        return (
            <PageContainer>
                <ExchangesPageHeader />
                {error ? (
                    <ErrorState title={t("common.state.loadingFailed")} message={error} retryLabel={t("common.action.retry")} />
                ) : (
                    <SkeletonList />
                )}
            </PageContainer>
        );
    }

    return (
        <ExchangePageContext.Provider value={{ coreData, cardsMap }}>
            <PageContainer>
                <ExchangesPageHeader />

                {error ? (
                    <Banner tone="warning" title={t("page.exchanges.loadNotice")} className="mb-6">
                        {error}
                    </Banner>
                ) : null}

                {!isLoading ? (
                    <div className="mb-4 type-body-s text-on-surface-variant">
                        {t("page.exchanges.currentTotalSummary", {
                            count: filteredEntries.length,
                            total: hasActiveFilters
                                ? t("page.exchanges.currentTotalSuffix", { total: coreData.flattenedExchanges.length })
                                : "",
                        })}
                    </div>
                ) : null}

                {/* Filters live in the global FilterDrawer (registered
                    above via useQuickFilter), so the page body is a single column. */}
                <div className="min-w-0">
                    {isLoading ? (
                        <SkeletonList />
                    ) : filteredEntries.length === 0 ? (
                        <EmptyState
                            icon={mdSwapHoriz}
                            title={hasActiveFilters ? t("page.exchanges.noResult") : t("page.exchanges.noData")}
                            description={hasActiveFilters ? t("page.exchanges.resetHint") : t("page.exchanges.noDataDescription")}
                        />
                    ) : (
                        <>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {displayedEntries.map((entry) => (
                                    <ExchangeCard key={entry.id} entry={entry} />
                                ))}
                            </div>

                            <LoadMore
                                label={t("page.exchanges.loadMore")}
                                shown={displayedEntries.length}
                                total={filteredEntries.length}
                                onLoadMore={loadMore}
                                allLoadedLabel={t("page.exchanges.allLoaded", { count: filteredEntries.length })}
                            />
                        </>
                    )}
                </div>
            </PageContainer>
        </ExchangePageContext.Provider>
    );
}

function ExchangesLoadingFallback() {
    const { t } = useI18n();

    return <LoadingState className="min-h-[50vh]" label={t("page.exchanges.loadingFallback")} />;
}

export default function ExchangesClient() {
    return (
        <MainLayout>
            <Suspense fallback={<ExchangesLoadingFallback />}>
                <ExchangesContent />
            </Suspense>
        </MainLayout>
    );
}
