"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "@/components/LocalizedLink";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import Modal from "@/components/common/Modal";
import PredictionChart from "@/components/events/PredictionChart";
import PGAIChart from "@/components/events/PGAIChart";
import Sparkline from "@/components/events/Sparkline";
import ActivityStats from "@/components/events/ActivityStats";
import { useI18n } from "@/contexts/I18nContext";
import { fetchPredictionData, fetchEventList } from "@/lib/prediction-api";
import { PredictionData, EventListItem, ServerType, TierKLine } from "@/types/prediction";
import { IEventInfo, getEventStatus, EVENT_STATUS_DISPLAY } from "@/types/events";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import { getEventBannerUrl, getEventLogoUrl } from "@/lib/assets";
import { Banner, EmptyState, ErrorState, Icon, LoadingState, PageContainer, PageHeader, Select, SegmentedButton, cn } from "@/components/md3";
import { mdBarChart, mdInfo } from "@/components/md3/icons";
import { ACTIVE_DOT } from "@/components/prediction/PredictionEventPicker";
import { ServerRegionLabel } from "@/components/common/ServerRegion";

interface LegacyTierKline {
    rank: number;
    ChangePct?: number;
    changePct?: number;
    Speed?: number;
    speed?: number;
    CurrentIndex?: number;
    currentIndex?: number;
}

// Available rank tiers
const RANK_TIERS = [50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 5000, 10000];

export default function PredictionClient() {
    const { t, formatDate, formatNumber } = useI18n();
    const { assetSource, serverSource } = useTheme();
    const [server, setServer] = useState<ServerType>(() => (serverSource === "jp" ? "jp" : "cn"));
    const hasManualServerOverride = useRef(false);
    const [events, setEvents] = useState<EventListItem[]>([]);
    const [masterEvents, setMasterEvents] = useState<IEventInfo[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
    const [predictionData, setPredictionData] = useState<PredictionData | null>(null);
    const [selectedRank, setSelectedRank] = useState<number>(100);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [isWlNoticeOpen, setIsWlNoticeOpen] = useState(false);

    // Live Clock for relative time & progress
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Sync server selection when global data server setting changes
    useEffect(() => {
        if (!hasManualServerOverride.current) {
            const targetServer: ServerType = serverSource === "jp" ? "jp" : "cn";
            if (targetServer !== server) {
                setServer(targetServer);
                setSelectedEventId(null);
                setEvents([]);
                setPredictionData(null);
                setEventsLoading(true);
            }
        }
    }, [serverSource, server]);

    // Fetch master data for assets
    useEffect(() => {
        fetchMasterData<IEventInfo[]>("events.json").then(setMasterEvents).catch(console.error);
    }, []);

    // Handle server switch safely
    const handleServerChange = (newServer: ServerType) => {
        if (newServer === server) return;
        hasManualServerOverride.current = true;
        setEventsLoading(true);
        setError(null);
        setServer(newServer);
        setSelectedEventId(null); // Clear selection to prevent invalid fetch
        setEvents([]); // Clear list
        setPredictionData(null); // Clear data
    };

    const handleEventChange = (eventId: number) => {
        setError(null);
        setLoading(true);
        setSelectedEventId(eventId);
    };

    // Fetch events list when server changes
    useEffect(() => {
        fetchEventList(server)
            .then(data => {
                if (!Array.isArray(data)) {
                    setEvents([]);
                    // If data is invalid, selectedEventId stays null
                    return;
                }
                // Sort: active first, then by ID descending (latest first)
                const sortedEvents = [...data].sort((a, b) => {
                    if (a.is_active && !b.is_active) return -1;
                    if (!a.is_active && b.is_active) return 1;
                    return b.id - a.id;
                });
                setEvents(sortedEvents);

                // If no event selected (e.g. after server switch), select default
                if (!selectedEventId) {
                    const activeEvent = sortedEvents.find(e => e.is_active);
                    const latestEvent = sortedEvents[0];
                    const defaultEventId = activeEvent?.id || latestEvent?.id || null;
                    if (defaultEventId) {
                        setLoading(true);
                        setError(null);
                        setSelectedEventId(defaultEventId);
                    }
                }
            })
            .catch(err => {
                console.error('Failed to fetch events:', err);
                setError(t("page.prediction.errors.eventsFetchFailed"));
                setEvents([]);
            })
            .finally(() => setEventsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server, t]);

    // Fetch prediction data when event changes
    useEffect(() => {
        if (!selectedEventId) {
            return;
        }

        fetchPredictionData(selectedEventId, server)
            .then(data => {
                setPredictionData(data);
            })
            .catch(err => {
                console.error('Failed to fetch prediction:', err);
                setError(t("page.prediction.errors.predictionFetchFailed"));
                setPredictionData(null);
            })
            .finally(() => setLoading(false));
    }, [selectedEventId, server, t]);

    // Process chart data (trim 1% from start/end) - Replacing original currentChart definition
    const currentChart = useMemo(() => {
        const raw = predictionData?.data?.charts?.find(c => c.Rank === selectedRank);
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
            PredictPoints: trimData(raw.PredictPoints)
        };
    }, [predictionData, selectedRank]);

    // Get available ranks from data
    const availableRanks = predictionData?.data?.charts?.map(c => c.Rank) || [];

    // Prepare Event Banner & Status
    const eventState = useMemo(() => {
        if (!selectedEventId) return null;

        const predEvent = events.find(e => e.id == selectedEventId);
        const masterEvent = masterEvents.find(e => e.id == selectedEventId);

        if (!predEvent && !masterEvent) return null;

        const name = masterEvent?.name || predEvent?.name || "";
        const eventType = masterEvent?.eventType || "marathon";
        const assetbundleName = masterEvent?.assetbundleName || "";

        // Timestamps: Prefer Prediction Data (as it reflects current server schedule), fallback to Master Data
        const s = predEvent?.start_at ? (predEvent.start_at < 10000000000 ? predEvent.start_at * 1000 : predEvent.start_at) : masterEvent?.startAt;
        const e = predEvent?.end_at ? (predEvent.end_at < 10000000000 ? predEvent.end_at * 1000 : predEvent.end_at) : masterEvent?.aggregateAt;

        const startAt = s || 0;
        const endAt = e || 0;

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
        if (predictionData?.timestamp) {
            const diff = now - predictionData.timestamp;
            const diffSec = Math.max(0, Math.floor(diff / 1000));
            if (diffSec < 60) updateTime = t("page.prediction.relativeTime.secondsAgo", { seconds: diffSec });
            else if (diffSec < 3600) updateTime = t("page.prediction.relativeTime.minutesAgo", { minutes: Math.floor(diffSec / 60) });
            else updateTime = formatDate(predictionData.timestamp, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
    }, [selectedEventId, events, masterEvents, predictionData, now, t, formatDate]);

    const isWorldBloomEvent = eventState?.banner.mockEvent.eventType === "world_bloom";

     
    useEffect(() => {
        if (selectedEventId && isWorldBloomEvent) {
            setIsWlNoticeOpen(true);
            return;
        }
        setIsWlNoticeOpen(false);
    }, [selectedEventId, isWorldBloomEvent]);

    return (
        <MainLayout>
            <PageContainer>
                <PageHeader
                    eyebrow={t("page.prediction.badge")}
                    title={t("page.prediction.title")}
                    highlight={t("page.prediction.titleHighlight")}
                    description={t("page.prediction.description")}
                />

                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-4 mb-8 items-center sm:items-stretch">
                    {/* Server Toggle */}
                    <SegmentedButton
                        options={[
                            { value: "cn" as const, label: <ServerRegionLabel server="cn" label={t("page.prediction.servers.cn")} /> },
                            { value: "jp" as const, label: <ServerRegionLabel server="jp" label={t("page.prediction.servers.jp")} /> },
                        ]}
                        value={server}
                        onValueChange={(v) => handleServerChange(v)}
                        className="shrink-0 self-center"
                    />

                    {/* Event Selector */}
                    <div className="flex-1 w-full">
                        <Select
                            value={selectedEventId}
                            onValueChange={handleEventChange}
                            disabled={eventsLoading || events.length === 0}
                            aria-label={t("page.prediction.title")}
                            options={events.map(event => ({
                                value: event.id,
                                label: `#${event.id} ${event.name}`,
                                leading: event.is_active ? ACTIVE_DOT : undefined,
                            }))}
                            placeholder={eventsLoading ? t("page.prediction.events.loading") : t("page.prediction.events.empty")}
                            className="w-full"
                        />
                    </div>
                    {isWorldBloomEvent && (
                        <button
                            onClick={() => setIsWlNoticeOpen(true)}
                            className="state-layer focus-ring inline-flex h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-tertiary-container px-5 type-label-l text-on-tertiary-container shrink-0"
                        >
                            <Icon path={mdInfo} size={18} />
                            {t("page.prediction.wl.noticeButton")}
                        </button>
                    )}
                    {/* Warning for >99% progress */}
                    {eventState && eventState.isActive && eventState.banner.progressPercent >= 99 && (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary-container text-on-primary-container w-full sm:w-auto justify-center sm:justify-start shrink-0">
                            <div
                                className="w-6 h-6 shrink-0 bg-primary"
                                style={{
                                    maskImage: `url(/miku.webp)`,
                                    maskSize: 'contain',
                                    maskRepeat: 'no-repeat',
                                    maskPosition: 'center',
                                    WebkitMaskImage: `url(/miku.webp)`,
                                    WebkitMaskSize: 'contain',
                                    WebkitMaskRepeat: 'no-repeat',
                                    WebkitMaskPosition: 'center',
                                }}
                            />
                            <span className="type-label-l whitespace-nowrap">
                                {t("page.prediction.stopPredictionNotice")}
                            </span>
                        </div>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <ErrorState className="mb-6" title={t("common.state.loadingFailed")} message={error} />
                )}

                {/* Loading State */}
                {loading && <LoadingState label={t("page.prediction.loading")} className="min-h-0 py-20" />}

                {/* Main Content */}
                {!loading && predictionData && (
                    <div className="space-y-6">
                        {/* Event Banner */}
                        {eventState && (() => {
                            const { banner, isActive } = eventState;
                            const statusLabel = t(`common.status.${banner.status}`);
                            const fallbackStatusLabel = t(banner.statusDisplay.labelKey);
                            const resolvedStatusLabel = statusLabel === `common.status.${banner.status}` ? fallbackStatusLabel : statusLabel;
                            return (
                                <>
                                    <Link href={`/events/${banner.mockEvent.id}`} className="block group mb-6 rounded-md3-xl focus-ring">
                                        <div className="state-layer relative flex h-32 md:h-36 rounded-md3-xl overflow-hidden bg-surface-card shadow-elev-1 transition-shadow group-hover:shadow-elev-2 cursor-pointer">
                                            {/* Left Side: Background & Logo */}
                                            <div className="w-[45%] relative overflow-hidden">
                                                {banner.hasBanner ? (
                                                    <>
                                                        <div className="absolute inset-0">
                                                            <Image
                                                                src={getEventBannerUrl(banner.mockEvent.assetbundleName, assetSource)}
                                                                alt={banner.mockEvent.name}
                                                                fill
                                                                className="object-cover"
                                                                unoptimized
                                                            />
                                                            <div className="absolute inset-0 bg-scrim/50" />
                                                        </div>
                                                        <div className="absolute inset-0 flex items-center justify-center p-2">
                                                            <div className="relative w-full h-full max-h-20 sm:max-h-24">
                                                                <Image
                                                                    src={getEventLogoUrl(banner.mockEvent.assetbundleName, assetSource)}
                                                                    alt=""
                                                                    fill
                                                                    className="object-contain drop-shadow-2xl"
                                                                    unoptimized
                                                                />
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="absolute inset-0 bg-surface-container-high flex items-center justify-center text-on-surface-variant/60 type-headline-m">
                                                        NO IMAGE
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Side: Info */}
                                            <div className="w-[55%] relative flex flex-col justify-center p-3 sm:p-4 z-10 overflow-hidden">
                                                {/* Progress Overlay */}
                                                {banner.status === "ongoing" && (
                                                    <div
                                                        className="absolute inset-y-0 left-0 bg-primary/12 transition-all duration-500 ease-out z-0 pointer-events-none"
                                                        style={{ width: `${banner.progressPercent}%` }}
                                                    />
                                                )}

                                                <div className="space-y-1 relative z-20">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span
                                                            className="type-label-s px-2 py-0.5 rounded-md3-xs text-white"
                                                            style={{ backgroundColor: banner.statusDisplay.color }}
                                                        >
                                                            {resolvedStatusLabel}
                                                        </span>
                                                        <span className="type-label-s text-on-surface-variant">
                                                            {banner.eventTypeName}
                                                        </span>
                                                    </div>
                                                    <h3 className="type-title-s sm:type-title-m text-on-surface line-clamp-1" title={banner.mockEvent.name}>
                                                        {banner.mockEvent.name}
                                                    </h3>
                                                    <div className="pt-2 type-label-m text-on-surface-variant font-mono flex flex-col sm:flex-row sm:gap-2">
                                                        <span>{banner.formatEventDate(banner.mockEvent.startAt)}</span>
                                                        <span className="hidden sm:inline">-</span>
                                                        <span>{banner.formatEventDate(banner.mockEvent.aggregateAt)}</span>
                                                    </div>
                                                    {banner.updateTime && (
                                                        <div className="type-label-m text-on-surface-variant font-mono mt-0.5">
                                                            {t("page.prediction.dataUpdate", { time: banner.updateTime })}
                                                        </div>
                                                    )}
                                                </div>

                                                {banner.status === "ongoing" && (
                                                    <div className="absolute bottom-0 right-2 type-display-s text-on-surface select-none z-10 tabular-nums">
                                                        {Math.floor(banner.progressPercent)}<span className="type-headline-s ml-1">%</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Link>


                                    {/* Row 1: PGAI + Activity Stats (Only if Active) */}
                                    {isActive && (
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-[320px] mb-6">
                                            <div className="lg:col-span-2 h-[320px] lg:h-full">
                                                {predictionData.data.global_kline && (
                                                    <PGAIChart
                                                        globalKline={predictionData.data.global_kline}
                                                        height={undefined} // Let flex/grid handle height
                                                    />
                                                )}
                                            </div>
                                            <div className="h-auto lg:h-full">
                                                {predictionData.data.tier_klines && (
                                                    <ActivityStats tiers={predictionData.data.tier_klines} />
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Row 2: Prediction List / Table */}
                                    <div className="bg-surface-card border border-outline-variant/70 rounded-md3-xl overflow-hidden mb-6">
                                        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center gap-4">
                                            <h3 className="type-title-l text-on-surface">
                                                {isActive ? t("page.prediction.table.activeTitle") : t("page.prediction.table.finalTitle")}
                                            </h3>
                                            {isActive && <span className="type-body-s text-on-surface-variant">{t("page.prediction.table.detailHint")}</span>}
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full type-body-m">
                                                <thead className="bg-surface-container">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left type-title-s text-on-surface-variant w-24">{t("page.prediction.table.tier")}</th>
                                                        <th className="px-4 py-3 text-right type-title-s text-on-surface-variant">
                                                            {isActive ? t("page.prediction.table.currentScore") : t("page.prediction.table.finalScore")}
                                                        </th>
                                                        {isActive && <th className="px-4 py-3 text-right type-title-s text-on-surface-variant">{t("page.prediction.table.predictedScore")}</th>}
                                                        {isActive && <th className="px-4 py-3 text-right type-title-s text-on-surface-variant">{t("page.prediction.table.gap")}</th>}
                                                        {isActive && <th className="px-4 py-3 text-right type-title-s text-on-surface-variant">{t("page.prediction.table.speed")}</th>}
                                                        {isActive && <th className="px-4 py-3 text-center type-title-s text-on-surface-variant w-32">{t("page.prediction.table.trend")}</th>}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {predictionData.data.charts?.map(chart => {
                                                        // Handle case-sensitivity or missing data
                                                        const rank = chart.Rank;
                                                        // Try strict and loose matching
                                                        const legacyTierKlines = (predictionData.data as PredictionData["data"] & {
                                                            tierKlines?: LegacyTierKline[];
                                                        }).tierKlines;
                                                        const legacyTier = legacyTierKlines?.find((t) => t.rank == rank);
                                                        const tierStats: TierKLine | undefined = predictionData.data.tier_klines?.find((t) => t.Rank == rank)
                                                            || (legacyTier
                                                                ? {
                                                                    Rank: legacyTier.rank,
                                                                    Data: [],
                                                                    CurrentIndex: legacyTier.CurrentIndex ?? legacyTier.currentIndex ?? null,
                                                                    Speed: legacyTier.Speed ?? legacyTier.speed ?? 0,
                                                                    ChangePct: legacyTier.ChangePct ?? legacyTier.changePct ?? 0,
                                                                }
                                                                : undefined);

                                                        const totalLen = chart.HistoryPoints.length;
                                                        const trimCount = Math.floor(totalLen * 0.01);
                                                        const historyData = chart.HistoryPoints.slice(trimCount, totalLen - trimCount).map(p => p.y);

                                                        const predLen = chart.PredictPoints?.length || 0;
                                                        const predTrim = Math.floor(predLen * 0.01);
                                                        const predictData = chart.PredictPoints?.slice(predTrim, predLen - predTrim).map(p => p.y) || [];

                                                        // Determine colors
                                                        const trendColor = tierStats && tierStats.ChangePct < 0 ? '#10b981' : '#ef4444';

                                                        return (
                                                            <tr
                                                                key={chart.Rank}
                                                                className={`border-t border-outline-variant cursor-pointer transition-colors hover:bg-on-surface/[0.04] ${isActive && chart.Rank === selectedRank ? 'bg-secondary-container/60' : ''
                                                                    }`}
                                                                onClick={() => isActive && setSelectedRank(chart.Rank)}
                                                            >
                                                                <td className="px-4 py-3 font-medium text-primary">T{chart.Rank}</td>
                                                                <td className="px-4 py-3 text-right text-on-surface font-mono font-medium">
                                                                    {formatNumber(chart.CurrentScore)}
                                                                </td>
                                                                {isActive && (
                                                                    <>
                                                                        <td className="px-4 py-3 text-right text-tertiary font-mono font-medium">
                                                                            {chart.Rank > 10000 ? '-' : formatNumber(chart.PredictedScore)}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right text-on-surface-variant font-mono">
                                                                            {chart.Rank > 10000 ? '-' : `+${formatNumber(chart.PredictedScore - chart.CurrentScore)}`}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right font-mono">
                                                                            {tierStats ? (
                                                                                <div className="flex flex-col items-end">
                                                                                    <span className="text-on-surface">{tierStats.Speed != null ? formatNumber(tierStats.Speed) : '-'} /h</span>
                                                                                    <span className={`type-label-s ${tierStats.ChangePct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                                                        {tierStats.ChangePct >= 0 ? '+' : ''}{tierStats.ChangePct?.toFixed(1) ?? '0'}%
                                                                                    </span>
                                                                                </div>
                                                                            ) : '-'}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            <div className="flex justify-center items-center">
                                                                                <Sparkline
                                                                                    data={historyData}
                                                                                    prediction={(predictData.length > 0 && chart.Rank <= 10000) ? predictData : undefined}
                                                                                    progress={Math.max(0.05, Math.min(0.95, (banner.progressPercent || 50) / 100))}
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
                                    </div>

                                    {/* Row 3: Large Detailed Chart (Only if Active) */}
                                    {isActive && (
                                        <div id="detailed-chart" className="scroll-mt-24 mb-6">
                                            <div className="bg-surface-card border border-outline-variant/70 rounded-md3-xl p-6">
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                                                    <h3 className="type-title-l text-on-surface shrink-0">
                                                        {t("page.prediction.chart.detailTitle", { rank: selectedRank })}
                                                    </h3>
                                                    {/* Rank Selector for Chart */}
                                                    <div className="flex gap-2 overflow-x-auto pb-2 w-full sm:w-auto sm:flex-wrap sm:justify-end no-scrollbar">
                                                        {(availableRanks.length > 0 ? availableRanks : RANK_TIERS).map(rank => (
                                                            <button
                                                                key={rank}
                                                                onClick={() => setSelectedRank(rank)}
                                                                className={cn(
                                                                    "state-layer focus-ring h-8 px-3 rounded-md3-sm type-label-l whitespace-nowrap flex-shrink-0 snap-start border transition-colors",
                                                                    selectedRank === rank
                                                                        ? "bg-primary-container text-on-primary-container border-transparent"
                                                                        : "border-outline-variant text-on-surface-variant"
                                                                )}
                                                            >
                                                                T{rank}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {currentChart ? (
                                                    <PredictionChart data={currentChart} className="h-[350px] sm:h-[450px] !p-0" />
                                                ) : (
                                                    <div className="h-[350px] sm:h-[450px] flex items-center justify-center type-body-m text-on-surface-variant bg-surface-container rounded-md3-lg">
                                                        {t("page.prediction.chart.noTierData", { rank: selectedRank })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {/* Footer Sources */}
                                    <div className="text-center type-body-s text-on-surface-variant pb-8 space-y-1">
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
                    !loading && !predictionData && !error && selectedEventId && (
                        <EmptyState icon={mdBarChart} title={t("page.prediction.empty")} />
                    )
                }
            </PageContainer>
            <Modal
                isOpen={isWlNoticeOpen}
                onClose={() => setIsWlNoticeOpen(false)}
                title={t("page.prediction.wl.title")}
                size="sm"
                syncHistory={false}
            >
                <Banner tone="warning">{t("page.prediction.wl.description")}</Banner>
            </Modal>
        </MainLayout>
    );
}
