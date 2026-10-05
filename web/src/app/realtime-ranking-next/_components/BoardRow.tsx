"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { useRouter } from "next/navigation";
import { localizePathForBrowser } from "@/lib/localized-path";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import PlayerHonorPreview from "@/components/realtime-ranking/PlayerHonorPreview";
import RankChangeBadge from "@/components/realtime-ranking/RankChangeBadge";
import RankBadge from "@/components/realtime-ranking/RankBadge";
import { getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import { useI18n } from "@/contexts/I18nContext";
import { AssetSourceType } from "@/contexts/ThemeContext";
import { BoardEntryWithDiffV2, ChurnEntryV2, RealtimeRankingMasterData } from "@/types/realtime-ranking-next";
import {
    buildHourlyGridReversed,
    calcRecentChurnCount,
    calcRecentGrowth,
    findChurnByRank,
    fmtSpeed,
    getChurnCellColor,
    getCurrentHourKey,
    getSpeedTrend,
    getTierRanks,
} from "../_lib/board-utils";
import ChangeTime from "./ChangeTime";

interface BoardRowProps {
    entry: BoardEntryWithDiffV2;
    masterData: RealtimeRankingMasterData;
    assetSource: AssetSourceType;
    churnEntry?: ChurnEntryV2;
    churnData: Map<string, ChurnEntryV2>;
    showChurn: boolean;
    onShowParkingPeriods: (userId: string) => void;
    /** Link target for the detail page (already includes query). Null disables navigation (tier lines). */
    detailHref: string | null;
    isTracked?: boolean;
    onTrackToggle?: (userId: string) => void;
    /** True when this row's data was carried over from a previous snapshot (syncing). */
    isStale?: boolean;
}

const topThreeCardDeco: Record<number, string> = {
    1: "ring-1 ring-amber-300/70 ",
    2: "ring-1 ring-outline ",
    3: "ring-1 ring-orange-300/70 ",
};

const topThreeBadge: Record<number, string> = {
    1: "border-tertiary bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 text-amber-950 ",
    2: "border-outline-variant bg-gradient-to-r from-surface-container-high via-surface-container-low to-surface-container-high text-on-surface ",
    3: "border-orange-200 bg-gradient-to-r from-orange-200 via-amber-100 to-orange-300 text-orange-800 ",
};

function getCurrentHourChurn(churnEntry?: ChurnEntryV2): number {
    if (!churnEntry) return 0;
    const hourKey = getCurrentHourKey();
    const found = churnEntry.hourly_churn?.find((h) => h.hour === hourKey);
    return found?.count ?? churnEntry.churn_1h ?? 0;
}

export default function BoardRow({
    entry,
    masterData,
    assetSource,
    churnEntry,
    churnData,
    showChurn,
    onShowParkingPeriods,
    detailHref,
    isTracked = false,
    onTrackToggle,
    isStale = false,
}: BoardRowProps) {
    const { t, formatNumber } = useI18n();
    const router = useRouter();

    const leaderCard = entry.leaderCardId
        ? masterData.cards.find((card) => card.id === entry.leaderCardId)
        : undefined;
    const derivedCharacterId = entry.leaderCharacterId ?? leaderCard?.characterId;
    const isTrained = entry.leaderCardDefaultImage === "special_training";
    const masterRank = entry.leaderCardMasterRank ?? 0;
    const isTopThree = entry.rank <= 3;
    const isTierLine = entry.isTierLine;

    // Per-row expansion when global churn toggle is closed.
    const [localExpanded, setLocalExpanded] = useState(false);
    const canShowChurnDetails = !isTierLine && churnEntry != null;
    const canShowTierLine = isTierLine && churnEntry != null;
    const showChurnRow = canShowChurnDetails && (showChurn || localExpanded);
    const showTierLineRow = canShowTierLine && (showChurn || localExpanded);

    // Stock-style flash on score change.
    const [flashType, setFlashType] = useState<"up" | "down" | null>(null);
    useEffect(() => {
        const next = entry.scoreDelta === 0 ? null : entry.scoreDelta > 0 ? "up" : "down";
        const setTimer = window.setTimeout(() => setFlashType(next), 0);
        const clearTimer = next ? window.setTimeout(() => setFlashType(null), 1500) : undefined;
        return () => {
            window.clearTimeout(setTimer);
            if (clearTimer) window.clearTimeout(clearTimer);
        };
    }, [entry.score, entry.scoreDelta]);

    const hasCurrentChange = entry.scoreDelta !== 0;

    const churnLast = (() => {
        const changes = churnEntry?.recent_score_changes;
        if (!changes || changes.length === 0) return null;
        return changes.reduce((acc, c) => (c.t > acc.t ? c : acc), changes[0]);
    })();

    let displayScoreDelta: number;
    let displayChangedAt: number | null;
    if (hasCurrentChange) {
        displayScoreDelta = entry.scoreDelta;
        displayChangedAt = entry.lastChangedAt ?? null;
    } else if (entry.lastScoreDelta && entry.lastScoreDelta !== 0) {
        displayScoreDelta = entry.lastScoreDelta;
        displayChangedAt = entry.lastChangedAt ?? null;
    } else if (churnLast) {
        displayScoreDelta = churnLast.delta;
        displayChangedAt = churnLast.t;
    } else {
        displayScoreDelta = 0;
        displayChangedAt = null;
    }
    const displayRankDelta = hasCurrentChange ? entry.rankDelta : entry.lastRankDelta ?? entry.rankDelta;

    const currentHourChurn = canShowChurnDetails ? getCurrentHourChurn(churnEntry) : 0;
    const speed1h = churnEntry?.growth_1h ?? 0;

    const rowBg = entry.isNewEntry
        ? "bg-secondary-container/40 "
        : entry.scoreDelta > 0
            ? "bg-tertiary-container/30 "
            : entry.scoreDelta < 0
                ? "bg-error-container/30 "
                : isTierLine
                    ? "bg-surface-container-low "
                    : "";

    const scoreColorClass = hasCurrentChange
        ? entry.scoreDelta > 0
            ? "text-tertiary "
            : "text-error "
        : "text-on-surface";

    const trackedClasses = isTracked
        ? "ring-2 ring-primary shadow-elev-2 z-20 rounded-md3-md"
        : "";

    const clickable = !isTierLine && detailHref != null;

    const handleRowClick = () => {
        if (clickable && detailHref) router.push(localizePathForBrowser(detailHref));
    };

    return (
        <motion.div
            layout
            data-rank={entry.rank}
            initial={entry.isNewEntry ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={handleRowClick}
            className={`relative overflow-hidden transition-all duration-300 ${rowBg} ${trackedClasses} ${clickable ? "cursor-pointer state-layer" : ""} ${isStale ? "opacity-60" : ""}`}
        >
            <AnimatePresence>
                {flashType && (
                    <motion.div
                        key={`flash-${entry.score}`}
                        initial={{ opacity: 0.45 }}
                        animate={{ opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className={`absolute inset-0 pointer-events-none z-0 ${
                            flashType === "up"
                                ? "bg-tertiary/20 "
                                : "bg-error/20 "
                        }`}
                    />
                )}
            </AnimatePresence>

            <div className="relative z-10 flex w-full items-center px-3 py-2.5 sm:py-3">
                {/* Rank */}
                <div className="w-12 shrink-0 text-center sm:w-14">
                    <RankBadge
                        rank={entry.rank}
                        toneClassName={isTopThree ? topThreeBadge[entry.rank] : "border-outline-variant bg-surface-container-lowest text-on-surface-variant"}
                    />
                    {isTierLine && (
                        <div className="mt-0.5 text-[8px] font-medium text-on-surface-variant">
                            {t("page.realtimeRankingNext.list.tierLine")}
                        </div>
                    )}
                    {isStale && (
                        <div className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-tertiary-container px-1 py-0.5 text-[7px] font-bold text-on-tertiary-container" title={t("page.realtimeRankingNext.list.staleTitle")}>
                            <span className="h-1 w-1 animate-pulse rounded-full bg-on-tertiary-container" />
                            {t("page.realtimeRankingNext.list.stale")}
                        </div>
                    )}

                    {/* Expand/collapse button under rank column */}
                    {(canShowChurnDetails || canShowTierLine) && !showChurn && (
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                            {currentHourChurn > 0 && (
                                <span
                                    className="sm:hidden inline-flex items-center justify-center rounded-full bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container tabular-nums cursor-help"
                                    title={t("page.realtimeRanking.list.currentHourChurnTitle")}
                                >
                                    {currentHourChurn}
                                </span>
                            )}
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setLocalExpanded((v) => !v);
                                }}
                                className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors ${
                                    localExpanded
                                        ? "bg-primary-container text-on-primary-container"
                                        : "text-outline hover:bg-primary-container hover:text-on-primary-container "
                                }`}
                                title={localExpanded ? t("page.realtimeRanking.list.collapseChurn") : t("page.realtimeRanking.list.expandChurn")}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2.5}
                                    className={`w-3 h-3 transition-transform duration-200 ${localExpanded ? "rotate-180" : ""}`}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>

                {/* Avatar */}
                <div className="relative ml-2 w-16 shrink-0 sm:w-[72px]">
                    {leaderCard ? (
                        <div className={`overflow-hidden ${isTopThree ? topThreeCardDeco[entry.rank] : ""}`}>
                            <SekaiCardThumbnail card={leaderCard} trained={isTrained} mastery={masterRank} width={72} className="w-full" assetSource={assetSource} />
                        </div>
                    ) : derivedCharacterId ? (
                        <div className={`relative h-16 w-16 overflow-hidden border border-outline-variant bg-surface-container-lowest sm:h-[72px] sm:w-[72px] ${isTopThree ? topThreeCardDeco[entry.rank] : ""}`}>
                            <Image src={getCharacterIconUrl(derivedCharacterId)} alt={getCharacterName(t, derivedCharacterId)} fill className="object-cover" unoptimized />
                        </div>
                    ) : (
                        <div className="flex h-16 w-16 items-center justify-center bg-surface-container sm:h-[72px] sm:w-[72px]">
                            <span className="text-xs font-black text-on-surface-variant">#{entry.rank}</span>
                        </div>
                    )}
                </div>

                {/* Player info */}
                <div className="ml-3 min-w-0 flex-1 overflow-hidden">
                    <div className="relative">
                        <div
                            className="flex items-baseline gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden sm:overflow-visible"
                            style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                        >
                            <h3 className="shrink-0 text-sm font-bold leading-tight text-on-surface sm:shrink sm:truncate flex items-center gap-1.5">
                                <span className="truncate">{entry.displayName}</span>
                                {!isTierLine && onTrackToggle && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onTrackToggle(entry.userId);
                                        }}
                                        className={`inline-flex items-center justify-center p-0.5 rounded-md3-xs transition-all duration-200 hover:bg-primary-container hover:text-on-primary-container ${
                                            isTracked ? "text-primary" : "text-outline"
                                        }`}
                                        title={isTracked ? t("page.realtimeRankingNext.untrack") : t("page.realtimeRankingNext.track")}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} className="w-3.5 h-3.5">
                                            <circle cx="12" cy="12" r="8" />
                                            <circle cx="12" cy="12" r="3" fill={isTracked ? "currentColor" : "none"} />
                                            <line x1="12" y1="1" x2="12" y2="3" />
                                            <line x1="12" y1="21" x2="12" y2="23" />
                                            <line x1="1" y1="12" x2="3" y2="12" />
                                            <line x1="21" y1="12" x2="23" y2="12" />
                                        </svg>
                                    </button>
                                )}
                            </h3>
                            {entry.signature && (
                                <p className="shrink-0 text-[11px] leading-tight text-on-surface-variant sm:shrink sm:truncate">{entry.signature}</p>
                            )}
                        </div>
                        <div
                            className="pointer-events-none absolute right-0 top-0 h-full w-5 sm:hidden"
                            style={{ background: "linear-gradient(to left, var(--md-sys-color-surface-container-low), transparent)" }}
                        />
                    </div>
                    <div className="mt-1 flex items-center gap-2 max-w-full overflow-hidden">
                        <PlayerHonorPreview honors={entry.honors} masterData={masterData} assetSource={assetSource} compact />
                        {!isTierLine && !showChurn && speed1h > 0 && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container tabular-nums">
                                1H {fmtSpeed(speed1h)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Score */}
                <div className="w-28 shrink-0 text-right sm:w-36">
                    <motion.div
                        key={hasCurrentChange ? entry.score : "stable"}
                        initial={hasCurrentChange ? { scale: 1.12 } : false}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                        className={`text-base font-black leading-tight sm:text-lg ${scoreColorClass}`}
                    >
                        {formatNumber(entry.score)}
                        <span className="ml-0.5 type-label-s text-on-surface-variant">P</span>
                    </motion.div>
                    <div className="mt-0.5 flex items-center justify-end gap-1">
                        <RankChangeBadge rankDelta={displayRankDelta} isNewEntry={entry.isNewEntry} hasChurnData={!!churnEntry} />
                        <AnimatePresence mode="wait">
                            {displayScoreDelta !== 0 ? (
                                <motion.span
                                    key={`delta-${displayScoreDelta}-${entry.score}`}
                                    initial={{ opacity: 0, y: displayScoreDelta > 0 ? 6 : -6, scale: 0.85 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ type: "spring", stiffness: 350, damping: 20 }}
                                    className={`inline-flex items-center gap-0.5 rounded-md3-xs px-1 py-0.5 type-label-s ${
                                        displayScoreDelta > 0
                                            ? "bg-tertiary-container text-on-tertiary-container "
                                            : "bg-error-container text-on-error-container "
                                    }`}
                                >
                                    <span className="text-[8px]">{displayScoreDelta > 0 ? "▲" : "▼"}</span>
                                    <span>{displayScoreDelta > 0 ? "+" : ""}{formatNumber(displayScoreDelta)}</span>
                                    {displayChangedAt && (
                                        <ChangeTime changedAt={displayChangedAt} className="ml-0.5 text-[8px] font-medium opacity-60" />
                                    )}
                                </motion.span>
                            ) : (
                                <motion.span key="no-delta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[9px] text-on-surface-variant">
                                    —
                                </motion.span>
                            )}
                        </AnimatePresence>

                        {/* Desktop 1H bubble when collapsed */}
                        {canShowChurnDetails && !showChurn && currentHourChurn > 0 && (
                            <span
                                className="hidden sm:inline-flex items-center justify-center rounded-full bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container tabular-nums cursor-help"
                                title={t("page.realtimeRanking.list.currentHourChurnTitle")}
                            >
                                {currentHourChurn}
                            </span>
                        )}
                    </div>
                </div>

                {/* Chevron for navigable rows */}
                {clickable && (
                    <Link
                        href={detailHref}
                        onClick={(e) => e.stopPropagation()}
                        className="ml-1 hidden shrink-0 items-center justify-center text-outline transition-colors hover:text-primary sm:flex"
                        title={t("page.realtimeRankingNext.viewDetail")}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </Link>
                )}
            </div>

            {/* Churn data detail row */}
            <AnimatePresence>
                {showChurnRow && churnEntry && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="relative z-10 overflow-hidden"
                    >
                        <ChurnRow
                            churnEntry={churnEntry}
                            userId={entry.userId}
                            rank={entry.rank}
                            churnData={churnData}
                            onShowParkingPeriods={onShowParkingPeriods}
                        />
                    </motion.div>
                )}
                {showTierLineRow && churnEntry && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="relative z-10 overflow-hidden"
                    >
                        <TierLineChurnRow churnEntry={churnEntry} />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function ChurnRow({
    churnEntry,
    userId,
    rank,
    churnData,
    onShowParkingPeriods,
}: {
    churnEntry: ChurnEntryV2;
    userId: string;
    rank: number;
    churnData: Map<string, ChurnEntryV2>;
    onShowParkingPeriods: (userId: string) => void;
}) {
    const { t } = useI18n();
    const grid = buildHourlyGridReversed(churnEntry.hourly_churn ?? []);
    const row1 = grid.slice(0, 24);
    const row2 = grid.slice(24, 48);

    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = 0;
    }, []);

    // Churn counts.
    const recentChanges = churnEntry.recent_score_changes ?? [];
    const churn1h = churnEntry.churn_1h ?? calcRecentChurnCount(recentChanges, 60);
    const churn20min = churnEntry.churn_20min ?? calcRecentChurnCount(recentChanges, 20);

    // Score speeds.
    const speed1h = churnEntry.growth_1h ?? 0;
    const speed20min3 = calcRecentGrowth(recentChanges, 20) * 3;
    const trend = getSpeedTrend(speed1h, speed20min3);

    // Neighbor tiers.
    const [lowerRank, upperRank] = getTierRanks(rank);
    const lowerEntry = lowerRank != null ? findChurnByRank(churnData, lowerRank) : undefined;
    const upperEntry = upperRank != null ? findChurnByRank(churnData, upperRank) : undefined;

    const trendIcon = trend === "up"
        ? <span className="text-tertiary font-black">▲</span>
        : trend === "down"
            ? <span className="text-error font-black">▼</span>
            : <span className="text-on-surface-variant">—</span>;

    return (
        <div className="px-3 pb-2.5 pt-0.5 border-t border-outline-variant">
            {/* Churn grid row */}
            <div className="flex items-center gap-2">
                {/* 48H total */}
                <div className="shrink-0 text-center w-12 sm:w-14">
                    <span className="type-label-s text-on-surface-variant">48H</span>
                    <div className="text-xs font-black text-primary">{churnEntry.churn_48h ?? 0}</div>
                </div>

                {/* Hourly grid */}
                <div ref={scrollRef} className="flex-1 min-w-0 overflow-x-auto">
                    <div className="flex gap-px mb-px">
                        {row1.map((cell, i) => (
                            <div key={`h-${i}`} className="flex-1 min-w-[22px] text-center text-[8px] font-medium text-on-surface-variant">
                                {i === 0 ? "1H" : cell.hour}
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-px mb-px">
                        {row1.map((cell, i) => (
                            <div key={`r1-${i}`} className={`flex-1 min-w-[22px] text-center text-[9px] font-bold rounded-sm py-0.5 ${getChurnCellColor(cell.count, cell.isCurrentHour)}`} title={cell.localLabel}>
                                {cell.count > 0 ? `${cell.count}${cell.isCurrentHour ? "*" : ""}` : ""}
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-px">
                        {row2.map((cell, i) => (
                            <div key={`r2-${i}`} className={`flex-1 min-w-[22px] text-center text-[9px] font-bold rounded-sm py-0.5 ${getChurnCellColor(cell.count, cell.isCurrentHour)}`} title={cell.localLabel}>
                                {cell.count > 0 ? `${cell.count}${cell.isCurrentHour ? "*" : ""}` : ""}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Parking button */}
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onShowParkingPeriods(userId);
                    }}
                    className="shrink-0 rounded-md3-sm border border-outline-variant bg-surface-container-low px-2 py-1 type-label-s text-on-surface-variant transition-colors hover:border-primary/30 hover:bg-primary-container hover:text-on-primary-container"
                >
                    {t("page.realtimeRanking.churn.parking")}
                </button>
            </div>

            {/* Speed and churn stats row */}
            <div className="relative mt-1.5 pl-[calc(3rem+0.5rem)] sm:pl-[calc(3.5rem+0.5rem)]">
                <div
                    className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:gap-y-1"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                >
                    {/* Latest 1h churn */}
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-md3-xs bg-primary-container px-1.5 py-0.5 text-[10px]">
                        <span className="font-medium text-on-primary-container">{t("page.realtimeRanking.churn.churn1h")}</span>
                        <span className="font-black text-on-primary-container tabular-nums">{churn1h}</span>
                    </span>

                    {/* Latest 20min×3 churn */}
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-md3-xs bg-secondary-container px-1.5 py-0.5 text-[10px]">
                        <span className="font-medium text-on-secondary-container">{t("page.realtimeRanking.churn.churn20min3")}</span>
                        <span className="font-black text-on-secondary-container tabular-nums">{churn20min * 3}</span>
                    </span>

                    <span className="shrink-0 text-outline select-none px-0.5">·</span>

                    {/* Latest 1h speed and trend marker */}
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-md3-xs bg-surface-container px-1.5 py-0.5 text-[10px]">
                        <span className="font-medium text-on-surface-variant">{t("page.realtimeRanking.churn.speed1h")}</span>
                        <span className="font-black text-on-surface tabular-nums">{fmtSpeed(speed1h)}</span>
                        <span className="text-[9px] leading-none">{trendIcon}</span>
                    </span>

                    {/* Latest 20min×3 speed */}
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-md3-xs bg-surface-container px-1.5 py-0.5 text-[10px]">
                        <span className="font-medium text-on-surface-variant">{t("page.realtimeRanking.churn.speed20min3")}</span>
                        <span className={`font-black tabular-nums ${trend === "up" ? "text-tertiary" : trend === "down" ? "text-error" : "text-on-surface"}`}>
                            {fmtSpeed(speed20min3)}
                        </span>
                    </span>

                    {/* Neighbor-tier speed comparison */}
                    {(lowerRank != null || upperRank != null) && (
                        <>
                            <span className="shrink-0 text-outline select-none px-0.5">·</span>
                            {lowerRank != null && (() => {
                                const spd = lowerEntry?.growth_1h;
                                const faster = spd != null && speed1h > spd;
                                const slower = spd != null && speed1h < spd;
                                return (
                                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-md3-xs px-1.5 py-0.5 type-label-s ${
                                        faster ? "bg-tertiary-container " :
                                        slower ? "bg-error-container " :
                                        "bg-surface-container "
                                    }`}>
                                        <span className={`font-medium ${faster ? "text-on-tertiary-container" : slower ? "text-on-error-container" : "text-on-surface-variant"}`}>
                                            T{lowerRank}
                                        </span>
                                        <span className={`tabular-nums ${faster ? "text-on-tertiary-container" : slower ? "text-on-error-container" : "text-on-surface-variant"}`}>
                                            {spd != null ? fmtSpeed(spd) : "—"}
                                        </span>
                                        {faster && <span className="text-on-tertiary-container text-[9px]">↑</span>}
                                        {slower && <span className="text-on-error-container text-[9px]">↓</span>}
                                    </span>
                                );
                            })()}
                            {upperRank != null && (() => {
                                const spd = upperEntry?.growth_1h;
                                const faster = spd != null && speed1h > spd;
                                const slower = spd != null && speed1h < spd;
                                return (
                                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-md3-xs px-1.5 py-0.5 type-label-s ${
                                        faster ? "bg-tertiary-container " :
                                        slower ? "bg-error-container " :
                                        "bg-surface-container "
                                    }`}>
                                        <span className={`font-medium ${faster ? "text-on-tertiary-container" : slower ? "text-on-error-container" : "text-on-surface-variant"}`}>
                                            T{upperRank}
                                        </span>
                                        <span className={`tabular-nums ${faster ? "text-on-tertiary-container" : slower ? "text-on-error-container" : "text-on-surface-variant"}`}>
                                            {spd != null ? fmtSpeed(spd) : "—"}
                                        </span>
                                        {faster && <span className="text-on-tertiary-container text-[9px]">↑</span>}
                                        {slower && <span className="text-on-error-container text-[9px]">↓</span>}
                                    </span>
                                );
                            })()}
                        </>
                    )}
                </div>
                <div
                    className="pointer-events-none absolute right-0 top-0 h-full w-6 sm:hidden"
                    style={{ background: "linear-gradient(to left, var(--md-sys-color-surface-container-low), transparent)" }}
                />
            </div>
        </div>
    );
}

function TierLineChurnRow({ churnEntry }: { churnEntry: ChurnEntryV2 }) {
    const { t } = useI18n();
    const recentChanges = churnEntry.recent_score_changes ?? [];
    const speed1h = churnEntry.growth_1h ?? 0;
    const speed20min3 = calcRecentGrowth(recentChanges, 20) * 3;
    const trend = getSpeedTrend(speed1h, speed20min3);

    const trendIcon = trend === "up"
        ? <span className="text-tertiary font-black">▲</span>
        : trend === "down"
            ? <span className="text-error font-black">▼</span>
            : <span className="text-on-surface-variant">—</span>;

    return (
        <div className="px-3 pb-2.5 pt-0.5 border-t border-outline-variant">
            <div className="relative pl-[calc(3rem+0.5rem)] sm:pl-[calc(3.5rem+0.5rem)]">
                <div
                    className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:gap-y-1"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                >
                    {/* Label */}
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-md3-xs bg-surface-container px-1.5 py-0.5 text-[10px]">
                        <span className="font-medium text-on-surface-variant">{t("page.realtimeRanking.churn.tierLineSpeed")}</span>
                    </span>

                    <span className="shrink-0 text-outline select-none px-0.5">·</span>

                    {/* Latest 1h speed and trend */}
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-md3-xs bg-surface-container px-1.5 py-0.5 text-[10px]">
                        <span className="font-medium text-on-surface-variant">{t("page.realtimeRanking.churn.speed1h")}</span>
                        <span className="font-black text-on-surface tabular-nums">{fmtSpeed(speed1h)}</span>
                        <span className="text-[9px] leading-none">{trendIcon}</span>
                    </span>

                    {/* Latest 20min×3 speed */}
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-md3-xs bg-surface-container px-1.5 py-0.5 text-[10px]">
                        <span className="font-medium text-on-surface-variant">{t("page.realtimeRanking.churn.speed20min3")}</span>
                        <span className={`font-black tabular-nums ${trend === "up" ? "text-tertiary" : trend === "down" ? "text-error" : "text-on-surface"}`}>
                            {fmtSpeed(speed20min3)}
                        </span>
                    </span>
                </div>
                <div
                    className="pointer-events-none absolute right-0 top-0 h-full w-6 sm:hidden"
                    style={{ background: "linear-gradient(to left, var(--md-sys-color-surface-container-low), transparent)" }}
                />
            </div>
        </div>
    );
}

