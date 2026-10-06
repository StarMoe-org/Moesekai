"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import RankChangeBadge from "@/components/realtime-ranking/RankChangeBadge";
import RankBadge from "@/components/realtime-ranking/RankBadge";
import PlayerHonorPreview from "@/components/realtime-ranking/PlayerHonorPreview";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { getCharacterIconUrl } from "@/lib/assets";
import { RealtimeRankingEntryWithDiff, RealtimeRankingMasterData, ChurnRankingEntry } from "@/types/realtime-ranking";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import { AssetSourceType } from "@/contexts/ThemeContext";

interface RankingRowProps {
    entry: RealtimeRankingEntryWithDiff;
    masterData: RealtimeRankingMasterData;
    assetSource: AssetSourceType;
    secondsSinceUpdate?: number;
    showChurn: boolean;
    churnEntry?: ChurnRankingEntry;
    churnData: Map<string, ChurnRankingEntry>;
    onShowParkingPeriods: (userId: string) => void;
    isTracked?: boolean;
    onTrackToggle?: (userId: string) => void;
    /** True when this row's data was carried over from a previous snapshot (syncing). */
    isStale?: boolean;
}

type RealtimeRankingTranslationFn = ReturnType<typeof useI18n>["t"];

function formatElapsed(seconds: number, t: RealtimeRankingTranslationFn): string {
    if (seconds < 0) return t("page.realtimeRanking.churn.elapsedNow");
    if (seconds < 60) return t("page.realtimeRanking.churn.elapsedSeconds", { seconds });
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) {
        return s > 0
            ? t("page.realtimeRanking.churn.elapsedMinutesSeconds", { minutes: m, seconds: s })
            : t("page.realtimeRanking.churn.elapsedMinutes", { minutes: m });
    }
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0
        ? t("page.realtimeRanking.churn.elapsedHoursMinutes", { hours: h, minutes: rm })
        : t("page.realtimeRanking.churn.elapsedHours", { hours: h });
}

/** Get the ISO key for the current hour. */
function getCurrentHourKey(): string {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Get the churn count for the current hour. */
function getCurrentHourChurn(churnEntry?: ChurnRankingEntry): number {
    if (!churnEntry) return 0;
    const hourKey = getCurrentHourKey();
    const found = churnEntry.hourly_churn.find((h) => h.hour === hourKey);
    return found?.count ?? 0;
}

export default function RankingRow({ entry, masterData, assetSource, secondsSinceUpdate, showChurn, churnEntry, churnData, onShowParkingPeriods, isTracked = false, onTrackToggle, isStale = false }: RankingRowProps) {
    const { t, formatNumber } = useI18n();
    const leaderCard = entry.leaderCardId
        ? masterData.cards.find((card) => card.id === entry.leaderCardId)
        : undefined;

    const derivedLeaderCharacterId = entry.leaderCharacterId ?? leaderCard?.characterId;
    const isTrained = entry.leaderCardDefaultImage === "special_training";
    const masterRank = entry.leaderCardMasterRank ?? 0;
    const isTopThree = entry.rank <= 3;
    const isExtendedTier = entry.rank > 100;
    const isTierLineEntry = isExtendedTier && !!churnEntry?.isTierLine;
    // Outside TOP100, real player rows show churn details while tier-line rows show tier-line speed.
    const canShowChurnDetails = !isExtendedTier && churnEntry != null;
    const canShowTierLine = isTierLineEntry;

    // Live countdown for lastChangedAt.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    // Stock-style flash triggered by actual score changes.
    const [flashType, setFlashType] = useState<"up" | "down" | null>(null);
    const prevScoreRef = useRef(entry.score);

    // Per-row expansion when the global churn panel is closed.
    const [localExpanded, setLocalExpanded] = useState(false);
    const showChurnRow = canShowChurnDetails && (showChurn || localExpanded);
    const showTierLineRow = canShowTierLine && (showChurn || localExpanded);

    useEffect(() => {
        const nextFlashType = entry.scoreDelta === 0 ? null : entry.scoreDelta > 0 ? "up" : "down";
        const setTimer = window.setTimeout(() => setFlashType(nextFlashType), 0);
        const clearTimer = nextFlashType ? window.setTimeout(() => setFlashType(null), 1500) : undefined;

        return () => {
            window.clearTimeout(setTimer);
            if (clearTimer) window.clearTimeout(clearTimer);
        };
    }, [entry.score, entry.scoreDelta]);

    useEffect(() => {
        prevScoreRef.current = entry.score;
    }, [entry.score]);

    // --- Fix 1: use churn last_change to show the delta on first entry. ---
    const churnLastChange = churnEntry?.last_change;
    const hasChurnData = !!churnLastChange;

    const hasCurrentChange = entry.scoreDelta !== 0;

    let displayScoreDelta: number;
    let displayRankDelta: number;
    let displayElapsed: number | undefined;

    if (hasCurrentChange) {
        // Prefer live data when there is a current change.
        displayScoreDelta = entry.scoreDelta;
        displayRankDelta = entry.rankDelta;
        displayElapsed = secondsSinceUpdate ?? 0;
    } else if (entry.lastScoreDelta != null && entry.lastScoreDelta !== 0) {
        // Change recorded in a previous polling cycle.
        displayScoreDelta = entry.lastScoreDelta;
        displayRankDelta = entry.lastRankDelta ?? entry.rankDelta;
        displayElapsed = entry.lastChangedAt ? Math.floor((now - entry.lastChangedAt) / 1000) : undefined;
    } else if (entry.isNewEntry && churnLastChange) {
        // First load with churn data: use churn.last_change.
        displayScoreDelta = churnLastChange.delta;
        displayRankDelta = 0; // Churn has no rank movement data.
        // Timestamp compatibility: seconds vs milliseconds.
        const churnTime = churnLastChange.time < 1e12
            ? churnLastChange.time * 1000
            : churnLastChange.time;
        displayElapsed = churnTime > 0
            ? Math.floor((now - churnTime) / 1000)
            : undefined;
    } else {
        displayScoreDelta = 0;
        displayRankDelta = entry.rankDelta;
        displayElapsed = undefined;
    }

    // --- Fix 3: latest 1H churn bubble. ---
    const currentHourChurn = canShowChurnDetails ? getCurrentHourChurn(churnEntry) : 0;

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

    const rowBg = entry.isNewEntry
        ? "bg-secondary-container/40 "
        : entry.scoreDelta > 0
            ? "bg-tertiary-container/30 "
            : entry.scoreDelta < 0
                ? "bg-error-container/30 "
                : isExtendedTier
                    ? "bg-surface-container-low "
                    : entry.rankDelta > 0
                        ? "bg-tertiary-container/30 "
                        : entry.rankDelta < 0
                            ? "bg-error-container/30 "
                            : "";

    // Score color reflects movement when a change exists.
    const scoreColorClass = hasCurrentChange
        ? entry.scoreDelta > 0
            ? "text-tertiary "
            : "text-error "
        : "text-on-surface";

    const trackedClasses = isTracked ? "ring-2 ring-primary shadow-elev-2 z-20 rounded-md3-md" : "";

    return (
        <motion.div
            layout
            data-rank={entry.rank}
            initial={entry.isNewEntry ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={`relative overflow-hidden transition-all duration-300 ${rowBg} ${trackedClasses} ${isStale ? "opacity-60" : ""}`}
        >
            {/* Stock-style background flash */}
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

            <div className="relative z-10 grid w-full grid-cols-[2.5rem_3rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:flex sm:gap-0 sm:py-3">
                {/* Rank # */}
                <div className="row-span-2 w-10 min-w-0 shrink-0 self-start text-center max-sm:[&>span]:max-w-full max-sm:[&>span]:text-[10px] sm:w-14 sm:self-auto">
                    <RankBadge
                        rank={entry.rank}
                        toneClassName={isTopThree ? topThreeBadge[entry.rank] : "border-outline-variant bg-surface-container-lowest text-on-surface-variant"}
                    />
                    {isExtendedTier && (
                        <div className="mt-0.5 text-[8px] font-medium text-on-surface-variant">{t("page.realtimeRanking.list.extended")}</div>
                    )}
                    {isStale && (
                        <div className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-tertiary-container px-1 py-0.5 text-[7px] font-bold text-on-tertiary-container" title={t("page.realtimeRanking.list.staleTitle")}>
                            <span className="h-1 w-1 animate-pulse rounded-full bg-on-tertiary-container" />
                            {t("page.realtimeRanking.list.stale")}
                        </div>
                    )}
                    {/* Expand/collapse button, shown under the rank column on all viewports. */}
                    {(canShowChurnDetails || canShowTierLine) && !showChurn && (
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                            {/* Mobile: also show the 1H bubble in the rank column. */}
                            {currentHourChurn > 0 && (
                                <span
                                    className="sm:hidden inline-flex items-center justify-center rounded-full bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container tabular-nums cursor-help"
                                    title={t("page.realtimeRanking.list.currentHourChurnTitle")}
                                >
                                    {currentHourChurn}
                                </span>
                            )}
                            <button
                                onClick={() => setLocalExpanded((v) => !v)}
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
                <div className="relative ml-0 w-12 shrink-0 sm:ml-2 sm:w-[72px]">
                    {leaderCard ? (
                        <div className={`overflow-hidden ${isTopThree ? topThreeCardDeco[entry.rank] : ""}`}>
                            <SekaiCardThumbnail card={leaderCard} trained={isTrained} mastery={masterRank} width={72} className="w-full" />
                        </div>
                    ) : derivedLeaderCharacterId ? (
                        <div className={`relative h-12 w-12 overflow-hidden border border-outline-variant bg-surface-container-lowest sm:h-[72px] sm:w-[72px] ${isTopThree ? topThreeCardDeco[entry.rank] : ""}`}>
                            <Image src={getCharacterIconUrl(derivedLeaderCharacterId)} alt={getCharacterName(t, derivedLeaderCharacterId)} fill className="object-cover" unoptimized />
                        </div>
                    ) : (
                        <div className="flex h-12 w-12 items-center justify-center bg-surface-container sm:h-[72px] sm:w-[72px]">
                            <span className="max-w-full px-1 text-[10px] font-black text-on-surface-variant [overflow-wrap:anywhere] sm:text-xs">#{entry.rank}</span>
                        </div>
                    )}
                </div>

                {/* Player info: name + signature + honors */}
                <div className="min-w-0 overflow-hidden sm:ml-3 sm:flex-1">
                    {/* Let mobile names wrap without competing with the score row. */}
                    <div className="relative">
                        <div
                            className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-1.5"
                        >
                            <h3 className="flex w-full min-w-0 items-center gap-1.5 text-sm font-bold leading-tight text-on-surface sm:w-auto sm:shrink sm:truncate">
                                <span className="min-w-0 [overflow-wrap:anywhere] sm:truncate">{entry.displayName}</span>
                                {!isExtendedTier && onTrackToggle && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onTrackToggle(entry.userId);
                                        }}
                                        className={`inline-flex shrink-0 items-center justify-center p-0.5 rounded-md3-xs transition-all duration-200 hover:bg-primary-container hover:text-on-primary-container ${
                                            isTracked
                                                ? "text-primary"
                                                : "text-outline"
                                        }`}
                                        title={isTracked ? t("page.realtimeRanking.untrackPlayer") : t("page.realtimeRanking.trackPlayer")}
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={2.8}
                                            className="w-3.5 h-3.5"
                                        >
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
                                <p className="max-w-full truncate text-[11px] leading-tight text-on-surface-variant sm:shrink">{entry.signature}</p>
                            )}
                        </div>
                    </div>
                    <div className="mt-1 max-w-full overflow-hidden">
                        <PlayerHonorPreview honors={entry.honors} masterData={masterData} assetSource={assetSource} compact />
                    </div>
                </div>

                {/* Score column — stock-style feedback */}
                <div className="col-span-2 col-start-2 min-w-0 text-right sm:w-40 sm:shrink-0">
                    {/* Score body: movement color plus bounce animation. */}
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

                    {/* Movement detail row */}
                    <div className="mt-0.5 flex flex-wrap items-center justify-end gap-1 sm:flex-nowrap">
                        <RankChangeBadge rankDelta={displayRankDelta} isNewEntry={entry.isNewEntry} hasChurnData={hasChurnData} />
                        <AnimatePresence mode="wait">
                            {displayScoreDelta !== 0 ? (
                                <motion.span
                                    key={`delta-${displayScoreDelta}-${entry.score}`}
                                    initial={{ opacity: 0, y: displayScoreDelta > 0 ? 6 : -6, scale: 0.85 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ type: "spring", stiffness: 350, damping: 20 }}
                                    className={`inline-flex max-w-full flex-wrap items-center justify-end gap-0.5 rounded-md3-xs px-1 py-0.5 type-label-s sm:flex-nowrap ${
                                        displayScoreDelta > 0
                                            ? "bg-tertiary-container text-on-tertiary-container "
                                            : "bg-error-container text-on-error-container "
                                    }`}
                                >
                                    <span className="text-[8px]">{displayScoreDelta > 0 ? "▲" : "▼"}</span>
                                    <span>{displayScoreDelta > 0 ? "+" : ""}{formatNumber(displayScoreDelta)}</span>
                                    {typeof displayElapsed === "number" && (
                                        <span className="ml-0.5 font-medium opacity-60">{formatElapsed(displayElapsed, t)}</span>
                                    )}
                                </motion.span>
                            ) : (
                                <motion.span
                                    key="no-delta"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-[9px] text-on-surface-variant"
                                >
                                    —
                                </motion.span>
                            )}
                        </AnimatePresence>

                        {/* Desktop: place the 1H bubble next to the score row when there is room. */}
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
                        <ChurnRow churnEntry={churnEntry} userId={entry.userId} rank={entry.rank} churnData={churnData} onShowParkingPeriods={onShowParkingPeriods} />
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

/** Expand hourly_churn into 48 hours, with the newest hour on the left. */
function buildHourlyGridReversed(hourlyChurn: { hour: string; count: number }[]): { hour: number; count: number; isCurrentHour: boolean; localLabel: string }[] {
    const currentHourKey = getCurrentHourKey();
    const now = new Date();

    // Build a map for efficient lookup.
    const churnMap = new Map<string, number>();
    for (const h of hourlyChurn) {
        churnMap.set(h.hour, h.count);
    }

    // Start from the current hour and list 48 hours in reverse order.
    const grid: { hour: number; count: number; isCurrentHour: boolean; localLabel: string }[] = [];

    for (let i = 0; i < 48; i++) {
        const t = new Date(now);
        t.setUTCHours(t.getUTCHours() - i);
        t.setUTCMinutes(0, 0, 0);
        const key = t.toISOString().replace(/\.\d{3}Z$/, "Z");
        // Display local hour numbers.
        const localT = new Date(t);
        const hourNum = localT.getHours();
        const isCurrentHour = key === currentHourKey;

        grid.push({
            hour: hourNum,
            count: churnMap.get(key) ?? 0,
            isCurrentHour,
            localLabel: `${localT.getMonth() + 1}/${localT.getDate()} ${hourNum}:00`,
        });
    }

    return grid;
}

/** Return the background color class based on count. */
function getChurnCellColor(count: number, isCurrentHour: boolean): string {
    if (count === 0) return "bg-surface-container text-on-surface-variant ";
    if (isCurrentHour) return "bg-sky-100 text-sky-700 ";
    // Darken the color as count increases.
    if (count >= 30) return "bg-rose-300 text-rose-900 ";
    if (count >= 20) return "bg-rose-200 text-rose-800 ";
    if (count >= 10) return "bg-rose-100 text-rose-700 ";
    return "bg-rose-50 text-rose-500 ";
}

/** Calculate neighboring tier ranks from the current rank. */
function getTierRanks(rank: number): [number | null, number | null] {
    if (rank <= 10) {
        return [rank > 1 ? rank - 1 : null, rank < 10 ? rank + 1 : null];
    }
    const lower = Math.floor((rank - 1) / 10) * 10;
    const upper = Math.ceil((rank + 1) / 10) * 10;
    return [lower > 0 ? lower : null, upper <= 100 ? upper : null];
}

/** Sanitize legacy recent score changes against flapping duplicates & micro-bursts. */
function sanitizeLegacyChanges(recentChanges: { time: number; delta: number }[]): { time: number; delta: number }[] {
    if (!recentChanges || recentChanges.length <= 1) return recentChanges ?? [];
    const sorted = [...recentChanges].sort((a, b) => a.time - b.time);
    const result: { time: number; delta: number }[] = [];
    for (const c of sorted) {
        if (result.length === 0) {
            result.push({ ...c });
            continue;
        }
        const prev = result[result.length - 1];
        const dt = c.time - prev.time;
        if (c.delta === prev.delta && dt < 55_000) continue;
        if (dt < 45_000 && prev.delta >= 35_000 && c.delta >= 35_000) continue;
        if (dt < 20_000 && c.delta < 25_000 && prev.delta < 25_000) {
            prev.delta += c.delta;
            prev.time = c.time;
            continue;
        }
        result.push({ ...c });
    }
    return result;
}

/** Calculate total growth within the latest N minutes from recent_score_changes. */
function calcRecentGrowth(recentChanges: { time: number; delta: number }[], minutes: number): number {
    const clean = sanitizeLegacyChanges(recentChanges);
    const cutoff = Date.now() - minutes * 60 * 1000;
    return clean
        .filter((c) => c.time >= cutoff && c.delta > 0)
        .reduce((acc, c) => acc + c.delta, 0);
}

/** Calculate churn count within the latest N minutes from recent_score_changes. */
function calcRecentChurnCount(recentChanges: { time: number; delta: number }[], minutes: number): number {
    const clean = sanitizeLegacyChanges(recentChanges);
    const cutoff = Date.now() - minutes * 60 * 1000;
    return clean.filter((c) => c.time >= cutoff && c.delta > 0).length;
}

/** Format score speed in k units. */
function fmtSpeed(value: number): string {
    return `${Math.round(value / 1000)}k`;
}

/** Speed trend: compare latest 20min×3 with latest 1h to detect acceleration, slowdown, or flat movement. */
function getSpeedTrend(speed1h: number, speed20min3: number): "up" | "down" | "flat" {
    if (speed1h === 0 && speed20min3 === 0) return "flat";
    const ratio = speed1h > 0 ? speed20min3 / speed1h : speed20min3 > 0 ? Infinity : 1;
    if (ratio > 1.08) return "up";
    if (ratio < 0.92) return "down";
    return "flat";
}

function ChurnRow({ churnEntry, userId, rank, churnData, onShowParkingPeriods }: {
    churnEntry: ChurnRankingEntry;
    userId: string;
    rank: number;
    churnData: Map<string, ChurnRankingEntry>;
    onShowParkingPeriods: (userId: string) => void;
}) {
    const { t } = useI18n();
    const grid = buildHourlyGridReversed(churnEntry.hourly_churn);
    const row1 = grid.slice(0, 24);
    const row2 = grid.slice(24, 48);

    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = 0;
    }, []);

    // Churn counts.
    const recentChanges = churnEntry.recent_score_changes ?? [];
    const churn1h = calcRecentChurnCount(recentChanges, 60);
    const churn20min = calcRecentChurnCount(recentChanges, 20);

    // Score speeds.
    const speed1h = churnEntry.growth_1h;
    const speed20min3 = calcRecentGrowth(recentChanges, 20) * 3;
    const trend = getSpeedTrend(speed1h, speed20min3);

    // Neighbor tiers.
    const [lowerRank, upperRank] = getTierRanks(rank);
    const findByRank = (r: number | null): ChurnRankingEntry | undefined => {
        if (r == null || r <= 0) return undefined;
        for (const e of churnData.values()) {
            if (e.rank === r) return e;
        }
        return undefined;
    };
    const lowerEntry = findByRank(lowerRank);
    const upperEntry = findByRank(upperRank);

    const trendIcon = trend === "up"
        ? <span className="text-tertiary font-black">▲</span>
        : trend === "down"
            ? <span className="text-error font-black">▼</span>
            : <span className="text-on-surface-variant">—</span>;

    return (
        <div className="px-3 pb-2.5 pt-0.5">
            {/* Churn grid row */}
            <div className="flex items-center gap-2">
                {/* 48H total */}
                <div className="w-10 shrink-0 text-center sm:w-14">
                    <span className="type-label-s text-on-surface-variant">48H</span>
                    <div className="text-xs font-black text-primary">{churnEntry.churn_48h}</div>
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
                    onClick={() => onShowParkingPeriods(userId)}
                    className="shrink-0 rounded-md3-sm border border-outline-variant bg-surface-container-low px-2 py-1 type-label-s text-on-surface-variant transition-colors hover:border-primary/30 hover:bg-primary-container hover:text-on-primary-container"
                >
                    {t("page.realtimeRanking.churn.parking")}
                </button>
            </div>

            {/* Speed and churn stats row */}
            <div className="relative mt-1.5 pl-[calc(2.5rem+0.5rem)] sm:pl-[calc(3.5rem+0.5rem)]">
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

                {/* Neighbor-tier speed comparison with independent bubbles. */}
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
                {/* Right-side fade mask, mobile only. */}
                <div
                    className="pointer-events-none absolute right-0 top-0 h-full w-6 sm:hidden"
                    style={{ background: "linear-gradient(to left, var(--md-sys-color-surface-container-low), transparent)" }}
                />
            </div>
        </div>
    );
}

/** Tier-line speed row for rank > 100 data points without real player information. */
function TierLineChurnRow({ churnEntry }: { churnEntry: ChurnRankingEntry }) {
    const { t } = useI18n();
    const recentChanges = churnEntry.recent_score_changes ?? [];
    const speed1h = churnEntry.growth_1h;
    const speed20min3 = calcRecentGrowth(recentChanges, 20) * 3;
    const trend = getSpeedTrend(speed1h, speed20min3);
    const activityCount = churnEntry.recent_activity?.count ?? 0;

    const trendIcon = trend === "up"
        ? <span className="text-tertiary font-black">▲</span>
        : trend === "down"
            ? <span className="text-error font-black">▼</span>
            : <span className="text-on-surface-variant">—</span>;

    return (
        <div className="px-3 pb-2.5 pt-0.5">
            <div className="relative pl-[calc(2.5rem+0.5rem)] sm:pl-[calc(3.5rem+0.5rem)]">
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

                    {activityCount > 0 && (
                        <>
                            <span className="shrink-0 text-outline select-none px-0.5">·</span>
                            {/* Recent sample count */}
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-md3-xs bg-secondary-container px-1.5 py-0.5 text-[10px]">
                                <span className="font-medium text-on-secondary-container">{t("page.realtimeRanking.churn.recentSamples")}</span>
                                <span className="font-black text-on-secondary-container tabular-nums">{activityCount}</span>
                            </span>
                        </>
                    )}
                </div>
                {/* Right-side fade mask, mobile only. */}
                <div
                    className="pointer-events-none absolute right-0 top-0 h-full w-6 sm:hidden"
                    style={{ background: "linear-gradient(to left, var(--md-sys-color-surface-container-low), transparent)" }}
                />
            </div>
        </div>
    );
}
