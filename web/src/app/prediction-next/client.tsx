"use client";
import React, { useState, useMemo } from "react";
import Image from "next/image";
import {
    Banner,
    Button,
    Card,
    EmptyState,
    ErrorState,
    Icon,
    LinearProgress,
    LoadingState,
    PageContainer,
    PageHeader,
    SectionCard,
} from "@/components/md3";
import {
    mdArrowForward,
    mdImage,
    mdQueryStats,
    mdSchedule,
    mdTimeline,
} from "@/components/md3/icons";
import MainLayout from "@/components/MainLayout";
import PredictionChart from "@/components/events/PredictionChart";
import PGAIChart from "@/components/events/PGAIChart";
import Sparkline from "@/components/events/Sparkline";
import ActivityStats from "@/components/events/ActivityStats";
import { PredictionServerEventControls, PredictionWlChapterBar } from "@/components/prediction/PredictionEventPicker";
import PlannerEntryCard from "@/components/prediction/PlannerEntryCard";
import { useI18n } from "@/contexts/I18nContext";
import { PredictionData, TierKLine } from "@/types/prediction";
import { IEventInfo, EventType, getEventStatus, EVENT_STATUS_DISPLAY } from "@/types/events";
import { useTheme } from "@/contexts/ThemeContext";
import { getEventBannerUrl, getEventLogoUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import {
    usePredictionEvent,
    findActiveWlChapter,
    looksLikeWorldLinkEvent,
    PREDICTION_RANK_TIERS,
} from "@/lib/prediction/use-prediction-event";

interface LegacyTierKline {
    rank: number;
    ChangePct?: number;
    changePct?: number;
    Speed?: number;
    speed?: number;
    CurrentIndex?: number;
    currentIndex?: number;
}

export default function PredictionNextClient() {
    const { t, formatDate, formatNumber } = useI18n();
    const { assetSource } = useTheme();
    const eventData = usePredictionEvent();
    const {
        server,
        selectedEventId,
        eventMeta,
        masterEvent,
        eventWorldBlooms,
        isWorldBloomEvent,
        selectedWlChapter,
        setSelectedWlChapter,
        activePredictionData,
        scopeStartAt,
        scopeEndAt,
        loading,
        error,
        now,
        worldLinkSnapshot,
    } = eventData;
    const [selectedRank, setSelectedRank] = useState<number>(100);

    const activeWlChapter = useMemo(
        () => findActiveWlChapter(eventWorldBlooms, selectedWlChapter),
        [eventWorldBlooms, selectedWlChapter],
    );

    // Process chart data (trim 1% from start/end) - Replacing original currentChart definition
    const currentChart = useMemo(() => {
        const raw = activePredictionData?.data?.charts?.find(c => c.Rank === selectedRank);
        if (!raw) return undefined;

        const trimData = (points: { t: string, y: number }[]) => {
            if (!points || points.length < 10) return points;
            const trimCount = Math.floor(points.length * 0.01);
            if (trimCount === 0) return points;
            return points.slice(trimCount, points.length - trimCount);
        };

        return {
            ...raw,
            HistoryPoints: trimData(raw.HistoryPoints),
            PredictPoints: raw.PredictPoints
        };
    }, [activePredictionData, selectedRank]);

    // Get available ranks from data
    const availableRanks = activePredictionData?.data?.charts?.map(c => c.Rank) || [];

    // Prepare Event Banner & Status
    const dataTimestamp = activePredictionData?.timestamp;
    const eventState = useMemo(() => {
        if (!selectedEventId) return null;

        const predEvent = eventMeta;

        if (!predEvent && !masterEvent) return null;

        const baseName = masterEvent?.name || predEvent?.name || "";
        const isWlEvent = looksLikeWorldLinkEvent(masterEvent, predEvent);
        const chapterNameSuffix = activeWlChapter
            ? ` · ${t("page.prediction.wl.chapterItem", { no: activeWlChapter.chapterNo, name: getCharacterName(t, activeWlChapter.gameCharacterId) })}`
            : "";
        const name = baseName + chapterNameSuffix;
        const rawType = masterEvent?.eventType || predEvent?.event_type;
        const eventType: EventType = isWlEvent
            ? "world_bloom"
            : rawType === "cheerful_carnival"
                ? "cheerful_carnival"
                : "marathon";
        const assetbundleName = masterEvent?.assetbundleName || "";

        // Timestamps: the active WL chapter window if selected, else prediction schedule / masterdata
        const startAt = scopeStartAt || 0;
        const endAt = scopeEndAt || 0;

        const mockEvent: IEventInfo = {
            id: selectedEventId,
            bgmAssetbundleName: "",
            eventOnlyComponentDisplayStartAt: startAt,
            name,
            eventType,
            assetbundleName,
            startAt,
            aggregateAt: endAt,
            rankingAnnounceAt: endAt,
            distributionStartAt: endAt,
            eventOnlyComponentDisplayEndAt: endAt,
            closedAt: endAt,
            distributionEndAt: endAt,
            virtualLiveId: 0,
            unit: "",
            isCountLeaderCharacterPlay: false,
        };

        const status = getEventStatus(mockEvent);
        const statusDisplay = EVENT_STATUS_DISPLAY[status];
        const eventTypeLabel = t(`common.eventTypes.${eventType}`);
        const eventTypeName = eventTypeLabel === `common.eventTypes.${eventType}` ? eventType : eventTypeLabel;

        const totalDuration = endAt - startAt;
        const elapsed = Math.max(0, now - startAt);
        let progressPercent = 0;

        if (status === 'ongoing') {
            progressPercent = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100) : 0;
        } else if (status === 'ended') {
            progressPercent = 100;
        }


        const formatEventDate = (ts: number) => formatDate(ts, {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        const isActive = predEvent?.is_active || (status === 'ongoing');

        // Relative Update Time
        let updateTime = null;
        if (dataTimestamp) {
            const diff = now - dataTimestamp;
            const diffSec = Math.max(0, Math.floor(diff / 1000));
            if (diffSec < 60) updateTime = t("page.prediction.relativeTime.secondsAgo", { seconds: diffSec });
            else if (diffSec < 3600) updateTime = t("page.prediction.relativeTime.minutesAgo", { minutes: Math.floor(diffSec / 60) });
            else updateTime = formatDate(dataTimestamp, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
        }

        return {
            banner: {
                mockEvent,
                status,
                statusDisplay,
                eventTypeName,
                progressPercent,
                formatEventDate,
                updateTime,
                hasBanner: !!assetbundleName
            },
            isActive
        };
    }, [selectedEventId, eventMeta, masterEvent, dataTimestamp, now, t, formatDate, activeWlChapter, scopeStartAt, scopeEndAt]);

    return (
        <MainLayout>
            <PageContainer>
                <PageHeader
                    eyebrow={t("page.prediction.badge")}
                    title={t("page.predictionNext.title")}
                    description={t("page.predictionNext.description")}
                />

                {/* Controls */}
                <PredictionServerEventControls state={eventData}>
                    {/* Warning for >99% progress */}
                    {eventState && eventState.isActive && eventState.banner.progressPercent >= 99 && (
                        <Banner tone="warning" className="w-full sm:w-auto">
                            {t("page.prediction.stopPredictionNotice")}
                        </Banner>
                    )}
                </PredictionServerEventControls>

                {/* Error Message */}
                {error && (
                    <ErrorState title={t("common.state.loadingFailed")} message={error} className="mb-6" />
                )}

                {/* Loading State */}
                {loading && <LoadingState label={t("page.prediction.loading")} />}

                {/* Main Content */}
                {!loading && activePredictionData && (
                    <div className="space-y-6">
                        {/* World Link Chapter Selector - Sticky docked beneath MainNavbar */}
                        <PredictionWlChapterBar state={eventData} />
                        {/* Event Banner */}
                        {eventState && (() => {
                            const { banner, isActive } = eventState;
                            const isUpcoming = banner.status === "upcoming";
                            const isEnded = banner.status === "ended";
                            const showPredictionColumns = isActive || isUpcoming;
                            const isChapterView = isWorldBloomEvent && selectedWlChapter !== 'overall';
                            const currentChapterGroup = isChapterView ? worldLinkSnapshot?.groups?.find(g => g.gameCharacterId === selectedWlChapter) : undefined;
                            const hasChapterScores = isChapterView ? (!!currentChapterGroup && Array.isArray(currentChapterGroup.entries) && currentChapterGroup.entries.some(e => e.score > 0)) : true;
                            const isChapterUnarchived = isEnded && isChapterView && !hasChapterScores;
                            const statusLabel = t(`common.status.${banner.status}`);
                            const fallbackStatusLabel = t(banner.statusDisplay.labelKey);
                            const resolvedStatusLabel = statusLabel === `common.status.${banner.status}` ? fallbackStatusLabel : statusLabel;
                            return (
                                <>
                                    <Card
                                        href={`/events/${banner.mockEvent.id}`}
                                        variant="outlined"
                                        radius="xl"
                                        className="mb-6 flex flex-col sm:flex-row"
                                    >
                                        <div className="relative h-36 shrink-0 overflow-hidden bg-surface-container-high sm:h-auto sm:min-h-44 sm:w-[42%]">
                                            {banner.hasBanner ? (
                                                <>
                                                    <Image
                                                        src={getEventBannerUrl(banner.mockEvent.assetbundleName, assetSource)}
                                                        alt={banner.mockEvent.name}
                                                        fill
                                                        className="object-cover"
                                                        unoptimized
                                                    />
                                                    <div className="absolute inset-0 bg-scrim/48" />
                                                    <div className="absolute inset-0 flex items-center justify-center p-4">
                                                        <div className="relative h-24 w-full">
                                                            <Image
                                                                src={getEventLogoUrl(banner.mockEvent.assetbundleName, assetSource)}
                                                                alt=""
                                                                fill
                                                                className="object-contain"
                                                                unoptimized
                                                            />
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant">
                                                    <Icon path={mdImage} size={48} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 p-4 sm:p-5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-md3-sm px-3 py-1 type-label-m ${
                                                    banner.status === "ongoing"
                                                        ? "bg-primary-container text-on-primary-container"
                                                        : banner.status === "upcoming"
                                                            ? "bg-tertiary-container text-on-tertiary-container"
                                                            : "bg-surface-container-high text-on-surface-variant"
                                                }`}>
                                                    {resolvedStatusLabel}
                                                </span>
                                                <span className="type-label-m text-on-surface-variant">{banner.eventTypeName}</span>
                                                <Icon path={mdArrowForward} size={20} className="ml-auto text-primary" />
                                            </div>
                                            <h2 className="line-clamp-2 type-title-l text-on-surface" title={banner.mockEvent.name}>
                                                {banner.mockEvent.name}
                                            </h2>
                                            <div className="flex items-start gap-2 type-body-s text-on-surface-variant">
                                                <Icon path={mdSchedule} size={18} className="mt-px shrink-0" />
                                                <div className="flex flex-col tabular-nums sm:flex-row sm:flex-wrap sm:gap-2">
                                                    <span>{banner.formatEventDate(banner.mockEvent.startAt)}</span>
                                                    <span className="hidden sm:inline">–</span>
                                                    <span>{banner.formatEventDate(banner.mockEvent.aggregateAt)}</span>
                                                </div>
                                            </div>
                                            {banner.status === "ongoing" && (
                                                <div className="flex items-center gap-3">
                                                    <LinearProgress value={banner.progressPercent / 100} aria-label={resolvedStatusLabel} />
                                                    <span className="shrink-0 type-label-l tabular-nums text-primary">
                                                        {Math.floor(banner.progressPercent)}%
                                                    </span>
                                                </div>
                                            )}
                                            {banner.updateTime && (
                                                <p className="type-body-s text-on-surface-variant">
                                                    {t("page.prediction.dataUpdate", { time: banner.updateTime })}
                                                </p>
                                            )}
                                        </div>
                                    </Card>

                                    {/* Row 1: PGAI + Activity Stats (Only if Active) */}
                                    {isActive && (
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[320px] mb-6">
                                            <div className="lg:col-span-2 min-h-[300px] lg:min-h-[320px] h-full">
                                                {activePredictionData.data.global_kline && (
                                                    <PGAIChart
                                                        globalKline={activePredictionData.data.global_kline}
                                                        height={undefined} // Let flex/grid handle height
                                                    />
                                                )}
                                            </div>
                                            <div className="min-h-[300px] lg:min-h-[320px] h-full">
                                                {activePredictionData.data.tier_klines && (
                                                    <ActivityStats tiers={activePredictionData.data.tier_klines} />
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Upcoming Chapter / Event Notice Banner */}
                                    {isUpcoming && (
                                        <Banner tone="info" className="mb-6">
                                            {t("page.prediction.wl.upcomingNotice", { time: banner.formatEventDate(banner.mockEvent.startAt) })}
                                        </Banner>
                                    )}

                                    {/* Unarchived Ended Chapter Notice Banner */}
                                    {isChapterUnarchived && (
                                        <Banner tone="warning" className="mb-6">
                                            <p>{t("page.prediction.wl.unarchivedChapterNotice")}</p>
                                            <Button
                                                variant="tonal"
                                                color="tertiary"
                                                onClick={() => setSelectedWlChapter('overall')}
                                                className="mt-3"
                                            >
                                                {t("page.prediction.wl.switchToOverall")}
                                            </Button>
                                        </Banner>
                                    )}

                                    {/* Row 2: Prediction List / Table */}
                                    <SectionCard
                                        title={isUpcoming
                                            ? t("page.prediction.table.upcomingTitle")
                                            : (isActive ? t("page.prediction.table.activeTitle") : t("page.prediction.table.finalTitle"))}
                                        icon={mdQueryStats}
                                        className="mb-6"
                                        bodyClassName="px-0 pb-0"
                                    >
                                        {showPredictionColumns && (
                                            <p className="px-5 pb-3 type-body-s text-on-surface-variant">{t("page.prediction.table.detailHint")}</p>
                                        )}
                                        <div className="overflow-x-auto">
                                            <table className="w-full type-body-m">
                                                <thead className="bg-surface-container-high">
                                                    <tr>
                                                        <th scope="col" className="w-24 px-4 py-3 text-left type-label-l text-on-surface-variant">{t("page.prediction.table.tier")}</th>
                                                        <th scope="col" className="px-4 py-3 text-right type-label-l text-on-surface-variant">
                                                            {isEnded ? t("page.prediction.table.finalScore") : t("page.prediction.table.currentScore")}
                                                        </th>
                                                        {showPredictionColumns && <th scope="col" className="px-4 py-3 text-right type-label-l text-on-surface-variant">{t("page.prediction.table.predictedScore")}</th>}
                                                        {showPredictionColumns && <th scope="col" className="px-4 py-3 text-right type-label-l text-on-surface-variant">{t("page.prediction.table.gap")}</th>}
                                                        {showPredictionColumns && <th scope="col" className="px-4 py-3 text-right type-label-l text-on-surface-variant">{t("page.prediction.table.speed")}</th>}
                                                        {showPredictionColumns && <th scope="col" className="w-32 px-4 py-3 text-center type-label-l text-on-surface-variant">{t("page.prediction.table.trend")}</th>}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {activePredictionData.data.charts?.map(chart => {
                                                        // Handle case-sensitivity or missing data
                                                        const rank = chart.Rank;
                                                        // Try strict and loose matching
                                                        const legacyTierKlines = (activePredictionData.data as PredictionData["data"] & {
                                                            tierKlines?: LegacyTierKline[];
                                                        }).tierKlines;
                                                        const legacyTier = legacyTierKlines?.find((t) => t.rank == rank);
                                                        const tierStats: TierKLine | undefined = activePredictionData.data.tier_klines?.find((t) => t.Rank == rank)
                                                            || (legacyTier
                                                                ? {
                                                                    Rank: legacyTier.rank,
                                                                    Data: [],
                                                                    CurrentIndex: legacyTier.CurrentIndex ?? legacyTier.currentIndex ?? null,
                                                                    Speed: legacyTier.Speed ?? legacyTier.speed ?? 0,
                                                                    ChangePct: legacyTier.ChangePct ?? legacyTier.changePct ?? 0,
                                                                }
                                                                : undefined);

                                                        const historyData = chart.HistoryPoints.map(p => p.y);
                                                        const predictData = (chart.PredictPoints || []).map(p => p.y);

                                                        // Numeric trend data colors: preserve the original red-rise / green-fall encoding.
                                                        const trendColor = tierStats && tierStats.ChangePct < 0 ? '#10b981' : '#ef4444';

                                                        return (
                                                            <tr
                                                                key={chart.Rank}
                                                                className={`state-layer border-t border-outline-variant cursor-pointer transition-colors ${showPredictionColumns && chart.Rank === selectedRank ? 'bg-secondary-container' : ''
                                                                    }`}
                                                                onClick={() => showPredictionColumns && setSelectedRank(chart.Rank)}
                                                            >
                                                                <td className="px-4 py-3 font-bold text-primary">T{chart.Rank}</td>
                                                                <td className="px-4 py-3 text-right text-on-surface font-mono font-bold">
                                                                    {isChapterUnarchived ? (
                                                                        <span className="text-on-surface-variant font-normal select-none">-</span>
                                                                    ) : (
                                                                        formatNumber(chart.CurrentScore)
                                                                    )}
                                                                </td>
                                                                {showPredictionColumns && (
                                                                    <>
                                                                        <td className="px-4 py-3 text-right text-tertiary font-mono font-bold">
                                                                            {formatNumber(chart.PredictedScore)}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right text-on-surface-variant font-mono">
                                                                            {isUpcoming ? `+${formatNumber(chart.PredictedScore)}` : `+${formatNumber(chart.PredictedScore - chart.CurrentScore)}`}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right font-mono">
                                                                            {tierStats ? (
                                                                                isUpcoming ? (
                                                                                    <span className="text-on-surface-variant">0 /h</span>
                                                                                ) : (
                                                                                    <div className="flex flex-col items-end">
                                                                                        <span className="text-on-surface">{tierStats.Speed != null ? formatNumber(tierStats.Speed) : '-'} /h</span>
                                                                                        <span className={`type-label-s ${tierStats.ChangePct >= 0 ? 'text-error' : 'text-secondary'}`}>
                                                                                            {tierStats.ChangePct >= 0 ? '+' : ''}{tierStats.ChangePct?.toFixed(1) ?? '0'}%
                                                                                        </span>
                                                                                    </div>
                                                                                )
                                                                            ) : '-'}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            <div className="flex justify-center items-center">
                                                                                <Sparkline
                                                                                    data={historyData}
                                                                                    prediction={predictData.length > 0 ? predictData : undefined}
                                                                                    progress={isUpcoming ? 0.05 : Math.max(0.05, Math.min(0.95, (banner.progressPercent || 50) / 100))}
                                                                                    color={trendColor}
                                                                                    width={100}
                                                                                    height={30}
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                    </>
                                                                )}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </SectionCard>

                                    {/* Row 3: Goal planner entry (When Event is Active or Upcoming) */}
                                    {showPredictionColumns && (
                                        <PlannerEntryCard
                                            server={server}
                                            eventId={banner.mockEvent.id}
                                            chapter={isChapterView ? selectedWlChapter : "overall"}
                                        />
                                    )}

                                    {/* Row 4: Large Detailed Chart (When Event is Active or Upcoming) */}
                                    {showPredictionColumns && (
                                        <div id="detailed-chart" className="scroll-mt-24 mb-6">
                                            <Card variant="outlined" radius="xl" className="p-6">
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                                                    <h3 className="type-title-l text-on-surface shrink-0">
                                                        {t("page.prediction.chart.detailTitle", { rank: selectedRank })}
                                                    </h3>
                                                    {/* Rank Selector for Chart */}
                                                    <div className="flex gap-2 overflow-x-auto pb-2 w-full sm:w-auto sm:flex-wrap sm:justify-end no-scrollbar">
                                                        {(availableRanks.length > 0 ? availableRanks : PREDICTION_RANK_TIERS).map(rank => (
                                                            <Button
                                                                key={rank}
                                                                size="xs"
                                                                variant={selectedRank === rank ? "filled" : "outlined"}
                                                                onClick={() => setSelectedRank(rank)}
                                                                className="shrink-0 snap-start"
                                                            >
                                                                T{rank}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {currentChart ? (
                                                    <PredictionChart data={currentChart} className="h-[350px] sm:h-[450px]" showPredictionAtAllRanks />
                                                ) : (
                                                    <div className="flex h-[350px] items-center justify-center rounded-md3-lg bg-surface-container-high text-on-surface-variant sm:h-[450px]">
                                                        {t("page.prediction.chart.noTierData", { rank: selectedRank })}
                                                    </div>
                                                )}
                                            </Card>
                                        </div>
                                    )}

                                    {/* Footer Sources */}
                                    <div className="space-y-1 pb-8 text-center type-body-s text-on-surface-variant">
                                        <p>{t("page.prediction.sources.tier")}</p>
                                        <p>{t("page.prediction.sources.prediction")}</p>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )
                }

                {/* Empty State */}
                {
                    !loading && !activePredictionData && !error && selectedEventId && (
                        <EmptyState icon={mdTimeline} title={t("page.prediction.empty")} />
                    )
                }
            </PageContainer>
        </MainLayout>
    );
}
