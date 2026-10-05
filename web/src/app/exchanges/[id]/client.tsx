"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
    formatExchangeTime,
    getExchangeCategoryLabel,
    getExchangeStatusLabel,
    getExchangeTypeLabel,
    getRefreshCycleLabel,
    getRewardTypeLabel,
    loadExchangeCoreData,
    loadRewardLookupsByTypes,
    resolveExchangeCostGroups,
    resolveExchangeDisplayResources,
    resolveExchangeRewards,
} from "@/lib/exchanges";
import type { ExchangeRewardLookups } from "@/lib/exchanges";
import type {
    ExchangeStatus,
    FlattenedMaterialExchange,
    ResolvedExchangeCostGroup,
    ResolvedExchangeDisplayResource,
    ResolvedExchangeRelationParent,
    ResolvedExchangeReward,
} from "@/types/exchange";
import { Banner, Button, Card, LoadingState, PageContainer, SectionCard } from "@/components/md3";
import { mdArrowBack, mdImage, mdInfo, mdKeyboardArrowDown, mdKeyboardArrowUp, mdLink, mdRedeem, mdStorefront, mdToll } from "@/components/md3/icons";

// ─── constants ────────────────────────────────────────────────────────────────

const EMPTY_LOOKUPS: ExchangeRewardLookups = {
    cards: new Map(),
    stamps: new Map(),
    costumes: new Map(),
    blueprints: new Map(),
    fixtures: new Map(),
    practiceTickets: new Map(),
    skillPracticeTickets: new Map(),
    boostItems: new Map(),
    gachaTickets: new Map(),
    avatarCoordinates: new Map(),
    mysekaiItems: new Map(),
    mysekaiTools: new Map(),
};

/** Default number of sibling entries shown before collapsing. */
const SIBLINGS_INITIAL_SHOW = 6;

// ─── small ui helpers ─────────────────────────────────────────────────────────

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
        <span className={`inline-flex items-center rounded-md3-sm px-2.5 py-1 type-label-m ${BADGE_TONE_CLASS[tone]}`}>
            {label}
        </span>
    );
}

function getStatusTone(status: ExchangeStatus): BadgeTone {
    switch (status) {
        case "active":   return "positive";
        case "upcoming": return "tertiary";
        case "ended":    return "error";
        case "permanent":
        default:         return "neutral";
    }
}

/** Info row styled to match the detail page layout. */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 px-5 py-3 type-body-m">
            <span className="text-on-surface-variant">{label}</span>
            <span className="max-w-[60%] text-right type-title-s text-on-surface">{value}</span>
        </div>
    );
}

/** Section card wrapper used by detail blocks. */
function DetailSection({
    title,
    icon,
    children,
    rowStyle = false,
}: {
    title: string;
    icon?: string;
    children: React.ReactNode;
    rowStyle?: boolean;
}) {
    return (
        <SectionCard title={title} icon={icon} bodyClassName={rowStyle ? "px-0 pb-2" : undefined}>
            {rowStyle ? <div className="divide-y divide-outline-variant">{children}</div> : children}
        </SectionCard>
    );
}

function ResourceThumb({ src, alt }: { src?: string; alt: string }) {
    return src ? (
        <img
            src={src}
            alt={alt}
            className="h-14 w-14 rounded-md3-sm bg-surface-container-high object-contain p-2"
            loading="lazy"
        />
    ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-md3-sm bg-surface-container-high type-label-l text-on-surface-variant">
            ?
        </div>
    );
}

// ─── block components ─────────────────────────────────────────────────────────

function CostGroupBlock({ title, group }: { title?: string; group: ResolvedExchangeCostGroup }) {
    return (
        <div className="rounded-md3-lg bg-surface-container p-4">
            {title ? <h3 className="mb-3 type-title-s text-on-surface">{title}</h3> : null}
            <div className="space-y-3">
                {group.costs.map((cost) => (
                    <div
                        key={`${group.costGroupId}-${cost.resourceType}-${cost.resourceId}`}
                        className="flex items-center gap-3 rounded-md3-md bg-surface-container-lowest p-3"
                    >
                        <ResourceThumb src={cost.imageUrl} alt={cost.name} />
                        <div className="min-w-0 flex-1">
                            <div className="break-words type-title-s text-on-surface">{cost.name}</div>
                            {cost.subtitle ? <div className="mt-1 type-body-s text-on-surface-variant">{cost.subtitle}</div> : null}
                        </div>
                        <div className="shrink-0 type-title-m text-primary">× {cost.quantity}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const REWARD_CARD_CLASS = "h-full rounded-md3-md bg-surface-container-lowest p-4";

function RewardCard({ reward, lookups }: { reward: ResolvedExchangeReward; lookups: ExchangeRewardLookups }) {
    const { t } = useI18n();

    if (reward.resourceType === "card" && typeof reward.resourceId === "number") {
        const cardInfo = lookups.cards.get(reward.resourceId);
        if (cardInfo) {
            const body = (
                <>
                    <div>
                        <div className="mb-3 line-clamp-2 type-title-s text-on-surface">{reward.name}</div>
                        <div className="flex justify-center">
                            <SekaiCardThumbnail card={cardInfo} width={80} />
                        </div>
                    </div>
                    <div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Badge label={getRewardTypeLabel(reward.resourceType, t)} tone="secondary" />
                            <Badge label={t("page.exchanges.quantity", { count: reward.quantity })} tone="neutral" />
                        </div>
                        {reward.subtitle ? <div className="mt-2 type-body-s text-on-surface-variant">{reward.subtitle}</div> : null}
                    </div>
                </>
            );
            return reward.linkHref ? (
                <Card variant="outlined" href={reward.linkHref} className="flex h-full flex-col justify-between p-4">{body}</Card>
            ) : (
                <div className={`${REWARD_CARD_CLASS} flex flex-col justify-between`}>{body}</div>
            );
        }
    }

    const body = (
        <>
            <div className="mb-3 flex items-start gap-3">
                <ResourceThumb src={reward.imageUrl} alt={reward.name} />
                <div className="min-w-0 flex-1">
                    <div className="break-words type-title-s text-on-surface">{reward.name}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                        <Badge label={getRewardTypeLabel(reward.resourceType, t)} tone="secondary" />
                        <Badge label={t("page.exchanges.quantity", { count: reward.quantity })} tone="neutral" />
                    </div>
                    {reward.subtitle ? <div className="mt-2 type-body-s text-on-surface-variant">{reward.subtitle}</div> : null}
                </div>
            </div>
            {typeof reward.resourceId === "number" ? (
                <div className="font-mono type-label-s text-on-surface-variant">resourceId: {reward.resourceId}</div>
            ) : null}
        </>
    );

    return reward.linkHref ? (
        <Card variant="outlined" href={reward.linkHref} className="h-full p-4">{body}</Card>
    ) : (
        <div className={REWARD_CARD_CLASS}>{body}</div>
    );
}

function DisplayResourceCard({ resource }: { resource: ResolvedExchangeDisplayResource }) {
    const { t } = useI18n();

    return (
        <div className="rounded-md3-md bg-surface-container-lowest p-4">
            <div className="mb-3 flex items-start gap-3">
                <ResourceThumb src={resource.imageUrl} alt={resource.name} />
                <div className="min-w-0 flex-1">
                    <div className="break-words type-title-s text-on-surface">{resource.name}</div>
                    {resource.subtitle ? <div className="mt-1 type-body-s text-on-surface-variant">{resource.subtitle}</div> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Badge label={getRewardTypeLabel(resource.resourceType, t)} tone="secondary" />
                        <Badge label={t("page.exchanges.groupNumber", { group: resource.groupId })} tone="neutral" />
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Collapsible sibling entries card. */
function SiblingsCard({ siblings }: { siblings: FlattenedMaterialExchange[] }) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(false);
    const hasMore = siblings.length > SIBLINGS_INITIAL_SHOW;
    const shown = isExpanded ? siblings : siblings.slice(0, SIBLINGS_INITIAL_SHOW);

    return (
        <DetailSection
            title={t("page.exchanges.siblingsTitle", { count: siblings.length })}
            icon={mdLink}
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {shown.map((sibling) => (
                    <Card
                        variant="outlined"
                        key={sibling.id}
                        href={`/exchanges/${sibling.id}`}
                        className="px-4 py-3"
                    >
                        <div className="type-title-s text-on-surface">{sibling.resolvedTitle}</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                            <Badge label={getExchangeStatusLabel(sibling.status, t)} tone={getStatusTone(sibling.status)} />
                            <Badge label={getRefreshCycleLabel(sibling.refreshCycle, t)} tone="neutral" />
                        </div>
                    </Card>
                ))}
            </div>

            {hasMore && (
                <Button
                    variant="text"
                    fullWidth
                    className="mt-3"
                    icon={isExpanded ? mdKeyboardArrowUp : mdKeyboardArrowDown}
                    onClick={() => setIsExpanded(!isExpanded)}
                    aria-expanded={isExpanded}
                >
                    {isExpanded ? t("page.exchanges.collapse") : t("page.exchanges.expandOthers", { count: siblings.length - SIBLINGS_INITIAL_SHOW })}
                </Button>
            )}
        </DetailSection>
    );
}

function DetailErrorState({ message }: { message: string }) {
    const { t } = useI18n();

    return (
        <PageContainer>
            <Banner
                tone="error"
                title={t("page.exchanges.relationLoadFailed")}
                action={
                    <Button variant="text" color="error" icon={mdArrowBack} href="/exchanges">
                        {t("page.exchanges.backToList")}
                    </Button>
                }
            >
                {message}
            </Banner>
        </PageContainer>
    );
}

// ─── page component ───────────────────────────────────────────────────────────

export default function ExchangeDetailClient() {
    const params = useParams();
    const exchangeId = Number(params.id);
    const { assetSource } = useTheme();
    const { t, formatDate } = useI18n();
    const { setDetailName } = useBreadcrumb();

    const [coreData, setCoreData] = useState<Awaited<ReturnType<typeof loadExchangeCoreData>> | null>(null);
    const [entry, setEntry] = useState<FlattenedMaterialExchange | null>(null);
    const [rewardLookups, setRewardLookups] = useState<ExchangeRewardLookups>(EMPTY_LOOKUPS);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (entry) setDetailName(entry.resolvedTitle);
    }, [entry, setDetailName]);

    useEffect(() => {
        let cancelled = false;

        async function fetchData() {
            try {
                setIsLoading(true);
                const loaded = await loadExchangeCoreData();
                if (cancelled) return;

                const foundEntry = loaded.flattenedExchanges.find((item) => item.id === exchangeId);
                if (!foundEntry) {
                    throw new Error(t("page.exchanges.itemNotFound", { id: exchangeId }));
                }

                setCoreData(loaded);
                setEntry(foundEntry);

                const lookups = await loadRewardLookupsByTypes(foundEntry.rewardTypes);
                if (cancelled) return;

                setRewardLookups(lookups);
                setError(null);
            } catch (err) {
                if (cancelled) return;
                console.error("Error loading exchange detail:", err);
                setError(err instanceof Error ? err.message : t("page.exchanges.detailLoadFailed"));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        if (Number.isFinite(exchangeId) && exchangeId > 0) {
            fetchData();
        } else {
            setIsLoading(false);
            setError(t("page.exchanges.invalidItemId"));
        }

        return () => { cancelled = true; };
    }, [exchangeId, t]);

    const costInfo = useMemo(() => {
        if (!entry || !coreData) {
            return {
                baseCostGroups: [] as ResolvedExchangeCostGroup[],
                relationParents: [] as ResolvedExchangeRelationParent[],
            };
        }
        const resolved = resolveExchangeCostGroups(entry, coreData.materialMap, coreData.mysekaiMaterialMap, assetSource, t);
        return { baseCostGroups: resolved.baseCostGroups, relationParents: resolved.relationParents };
    }, [assetSource, coreData, entry, t]);

    const resolvedRewards = useMemo(() => {
        if (!entry || !coreData) return [] as ResolvedExchangeReward[];
        return resolveExchangeRewards(entry, coreData.materialMap, coreData.mysekaiMaterialMap, rewardLookups, assetSource, t);
    }, [assetSource, coreData, entry, rewardLookups, t]);

    const displayResources = useMemo(() => {
        if (!entry || !coreData) return [] as ResolvedExchangeDisplayResource[];
        return resolveExchangeDisplayResources(entry, coreData.materialMap, coreData.mysekaiMaterialMap, assetSource, t);
    }, [assetSource, coreData, entry, t]);

    const siblingEntries = useMemo(() => {
        if (!entry || !coreData) return [] as FlattenedMaterialExchange[];
        return coreData.flattenedExchanges.filter((item) => item.summaryId === entry.summaryId && item.id !== entry.id);
    }, [coreData, entry]);

    // ── loading / error states ────────────────────────────────────────────────

    if (error) {
        return (
            <MainLayout>
                <DetailErrorState message={error} />
            </MainLayout>
        );
    }

    if (isLoading || !entry || !coreData) {
        return (
            <MainLayout>
                <LoadingState className="min-h-[60vh]" />
            </MainLayout>
        );
    }

    const startAt = entry.exchangeStartAt ?? entry.summaryStartAt;
    const endAt   = entry.summaryEndAt;

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <MainLayout>
            <PageContainer>

                {/* ── Header ── */}
                <header className="mb-8">
                    <Button variant="text" icon={mdArrowBack} href="/exchanges" className="-ml-3 mb-4">
                        {t("page.exchanges.backToList")}
                    </Button>

                    {/* ID chip and badges */}
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                        <span className="inline-flex w-fit items-center rounded-md3-sm bg-surface-container-high px-3 py-1 font-mono type-label-m text-on-surface-variant">
                            ID: #{entry.id}
                        </span>
                        <Badge label={getExchangeStatusLabel(entry.status, t)} tone={getStatusTone(entry.status)} />
                        <Badge label={getExchangeCategoryLabel(entry.exchangeCategory, t)} tone="secondary" />
                        <Badge label={getExchangeTypeLabel(entry.materialExchangeType, t)} tone="tertiary" />
                        <Badge label={getRefreshCycleLabel(entry.refreshCycle, t)} tone="neutral" />
                        {typeof entry.exchangeLimit === "number" && (
                            <Badge label={t("page.exchanges.limitTimes", { count: entry.exchangeLimit })} tone="error" />
                        )}
                        {entry.materialExchangeRelationParents.length > 0 && (
                            <Badge label={t("page.exchanges.relatedCostIncluded")} tone="positive" />
                        )}
                    </div>

                    <h1 className="type-headline-m text-on-surface sm:type-headline-l">{entry.resolvedTitle}</h1>
                    <p className="mt-2 type-body-m text-on-surface-variant">
                        {t("page.exchanges.belongsToSummary", { summary: entry.summaryName })}
                    </p>
                </header>

                {/* Main grid */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">

                    {/* Left column */}
                    <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">

                        {/* Rewards */}
                        <DetailSection
                            title={t("page.exchanges.rewardContent", {
                                count: resolvedRewards.length > 0
                                    ? t("page.exchanges.countSuffix", { count: resolvedRewards.length })
                                    : "",
                            })}
                            icon={mdRedeem}
                        >
                            {resolvedRewards.length > 0 ? (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {resolvedRewards.map((reward) => (
                                        <RewardCard
                                            key={`${reward.resourceType}-${reward.resourceId ?? "noid"}-${reward.seq}`}
                                            reward={reward}
                                            lookups={rewardLookups}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="type-body-m text-on-surface-variant">{t("page.exchanges.noRewards")}</p>
                            )}
                        </DetailSection>

                        {/* Display resources */}
                        {displayResources.length > 0 && (
                            <DetailSection
                                title={t("page.exchanges.displayResourceGroup")}
                                icon={mdImage}
                            >
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {displayResources.map((resource) => (
                                        <DisplayResourceCard
                                            key={`${resource.id}-${resource.resourceType}-${resource.resourceId}`}
                                            resource={resource}
                                        />
                                    ))}
                                </div>
                            </DetailSection>
                        )}

                        {/* Costs */}
                        <DetailSection
                            title={t("page.exchanges.exchangeCosts")}
                            icon={mdToll}
                        >
                            <div className="space-y-4">
                                {costInfo.baseCostGroups.length > 0 ? (
                                    costInfo.baseCostGroups.map((group, index) => (
                                        <CostGroupBlock
                                            key={`base-${group.costGroupId}`}
                                            title={costInfo.baseCostGroups.length > 1
                                                ? t("page.exchanges.baseCostGroup", { index: index + 1 })
                                                : t("page.exchanges.baseCost")}
                                            group={group}
                                        />
                                    ))
                                ) : (
                                    <p className="type-body-m text-on-surface-variant">{t("page.exchanges.noBaseCost")}</p>
                                )}
                            </div>

                            {costInfo.relationParents.length > 0 && (
                                <div className="mt-6 space-y-4 border-t border-outline-variant pt-6">
                                    <h3 className="type-title-m text-on-surface">{t("page.exchanges.relationCostGroups")}</h3>
                                    {costInfo.relationParents.map((parent) => (
                                        <div key={parent.id} className="rounded-md3-lg border border-outline-variant bg-secondary-container/40 p-4">
                                            <div className="mb-4 flex flex-wrap items-center gap-2">
                                                <Badge label={t("page.exchanges.relationCondition")} tone="positive" />
                                                <span className="type-title-s text-on-secondary-container">{parent.description}</span>
                                            </div>
                                            <div className="space-y-4">
                                                {parent.costGroups.map((group, index) => (
                                                    <CostGroupBlock
                                                        key={`relation-${parent.id}-${group.costGroupId}`}
                                                        title={parent.costGroups.length > 1 ? t("page.exchanges.relationCostGroup", { index: index + 1 }) : undefined}
                                                        group={group}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </DetailSection>
                    </div>

                    {/* Right column */}
                    <div className="space-y-6">

                        {/* Basic information */}
                        <DetailSection
                            title={t("page.exchanges.basicInfo")}
                            rowStyle
                            icon={mdInfo}
                        >
                            <InfoRow label={t("page.exchanges.fields.exchangeItemId")} value={<span className="font-mono">#{entry.id}</span>} />
                            <InfoRow label={t("page.exchanges.fields.exchangeShopId")} value={<span className="font-mono">#{entry.summaryId}</span>} />
                            <InfoRow label={t("common.field.seq")} value={`${entry.summarySeq}-${entry.exchangeSeq}`} />
                            <InfoRow label={t("page.exchanges.fields.category")} value={getExchangeCategoryLabel(entry.exchangeCategory, t)} />
                            <InfoRow label={t("page.exchanges.fields.exchangeType")} value={getExchangeTypeLabel(entry.materialExchangeType, t)} />
                            <InfoRow label={t("page.exchanges.fields.refreshCycle")} value={getRefreshCycleLabel(entry.refreshCycle, t)} />
                            <InfoRow label={t("page.exchanges.fields.status")} value={getExchangeStatusLabel(entry.status, t)} />
                            <InfoRow label={t("page.exchanges.fields.startTime")} value={formatExchangeTime(startAt, formatDate)} />
                            <InfoRow label={t("page.exchanges.fields.endTime")} value={formatExchangeTime(endAt, formatDate)} />
                            <InfoRow label={t("page.exchanges.fields.exchangeLimit")} value={typeof entry.exchangeLimit === "number" ? t("page.exchanges.times", { count: entry.exchangeLimit }) : t("page.exchanges.unlimited")} />
                            <InfoRow label={t("page.exchanges.fields.rewardBoxId")} value={<span className="font-mono">#{entry.resourceBoxId}</span>} />
                            <InfoRow label={t("page.exchanges.fields.displayRewardQuantity")} value={entry.isDisplayQuantity ? t("common.field.yes") : t("common.field.no")} />
                            <InfoRow label={t("page.exchanges.fields.rewardTypeCount")} value={t("page.exchanges.rewardTypeCount", { count: entry.rewardTypes.length })} />
                            <InfoRow label={t("page.exchanges.fields.costItemCount")} value={t("page.exchanges.costItemCount", { count: entry.costs.length })} />
                        </DetailSection>

                        {/* Exchange summary */}
                        <DetailSection
                            title={t("page.exchanges.summaryInfo")}
                            rowStyle
                            icon={mdStorefront}
                        >
                            <InfoRow label={t("page.exchanges.fields.exchangeShopName")} value={entry.summaryName} />
                            <InfoRow label={t("page.exchanges.fields.exchangeShopStart")} value={formatExchangeTime(entry.summaryStartAt, formatDate)} />
                            <InfoRow label={t("page.exchanges.fields.exchangeShopEnd")} value={formatExchangeTime(entry.summaryEndAt, formatDate)} />
                            <InfoRow label={t("page.exchanges.fields.displayResourceGroupId")} value={entry.summaryDisplayResourceGroupId ? `#${entry.summaryDisplayResourceGroupId}` : "—"} />
                        </DetailSection>

                        {/* Sibling entries */}
                        {siblingEntries.length > 0 && (
                            <SiblingsCard siblings={siblingEntries} />
                        )}

                        <DetailPageAdCard />
                    </div>
                </div>
            </PageContainer>
        </MainLayout>
    );
}
