"use client";

import { motion } from "framer-motion";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { Button, Chip, PageHeader } from "@/components/md3";
import { mdBolt, mdRefresh } from "@/components/md3/icons";
import {
    RealtimeRankingRegion,
    REALTIME_RANKING_REGION_OPTIONS,
} from "@/types/realtime-ranking-next";
import {
    getAvailableLines,
    getEffectiveLine,
    RealtimeRankingLine,
} from "@/lib/realtime-ranking-line";

interface BoardHeaderProps {
    region: RealtimeRankingRegion;
    onRegionChange: (region: RealtimeRankingRegion) => void;
    line: RealtimeRankingLine;
    onLineChange: (line: RealtimeRankingLine) => void;
    updatedAt?: number;
    eventId?: number;
    totalEntries: number;
    countdown: number;
    isRefreshing: boolean;
    onRefresh: () => void;
    showChurn: boolean;
    onShowChurnChange: (value: boolean) => void;
}

export default function BoardHeader({
    region,
    onRegionChange,
    line,
    onLineChange,
    updatedAt,
    eventId,
    totalEntries,
    countdown,
    isRefreshing,
    onRefresh,
    showChurn,
    onShowChurnChange,
}: BoardHeaderProps) {
    const { t, formatNumber } = useI18n();

    const updatedLabel = updatedAt
        ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "—";

    const availableLines = getAvailableLines(region);
    const effectiveLine = getEffectiveLine(line, region);

    return (
        <div className="mb-6 space-y-4">
            {/* Title Header */}
            <PageHeader
                className="mb-0 sm:mb-0"
                title={
                    <span className="inline-flex flex-wrap items-center gap-2">
                        {t("page.realtimeRankingNext.title")}
                        <span className="rounded-md3-sm bg-primary-container px-2.5 py-0.5 type-label-m text-on-primary-container">
                            v2 Next
                        </span>
                    </span>
                }
                description={t("page.realtimeRankingNext.subtitle")}
            />

            {/* Controls Bar: Server (Region), Line, Churn toggle */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Server (Region) Selector */}
                <div className="flex max-w-full flex-wrap gap-1.5">
                    {REALTIME_RANKING_REGION_OPTIONS.map((r) => {
                        const regionText = t(`page.realtimeRanking.regions.${r}`);
                        return (
                            <Chip key={r} selected={region === r} onClick={() => onRegionChange(r)} title={regionText}>
                                <ServerRegionLabel server={r} label={regionText} />
                            </Chip>
                        );
                    })}
                </div>

                {/* Line / Route Selector */}
                <div className="flex items-center gap-1.5">
                    <span className="type-label-m text-on-surface-variant whitespace-nowrap">
                        {t("page.realtimeRanking.line.label")}
                    </span>
                    <div className="flex max-w-full flex-wrap gap-1.5">
                        {availableLines.map((l) => (
                            <Chip key={l} selected={effectiveLine === l} onClick={() => onLineChange(l)}>
                                {t(`page.realtimeRanking.line.${l}`)}
                            </Chip>
                        ))}
                    </div>
                </div>

                {/* Churn & Speed Toggle */}
                <Chip
                    icon={mdBolt}
                    selected={showChurn}
                    onClick={() => onShowChurnChange(!showChurn)}
                >
                    {t("page.realtimeRanking.showChurn")}
                </Chip>
            </div>

            {/* Status Bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md3-lg bg-surface-container-low px-4 py-2 type-body-s text-on-surface-variant">
                {eventId != null && (
                    <span className="inline-flex items-center gap-1.5">
                        <span>{t("page.realtimeRankingNext.eventId")}</span>
                        <span className="type-label-l text-on-surface">#{eventId}</span>
                    </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                    <span>{t("page.realtimeRankingNext.totalEntries")}</span>
                    <span className="type-label-l text-on-surface">{formatNumber(totalEntries)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span>{t("page.realtimeRankingNext.updatedAt")}</span>
                    <span className="type-label-l text-on-surface tabular-nums">{updatedLabel}</span>
                </span>

                <div className="ml-auto flex items-center gap-2">
                    <span
                        className={`rounded-md3-sm px-2.5 py-0.5 type-label-s ${
                            isRefreshing
                                ? "bg-tertiary-container text-on-tertiary-container"
                                : "bg-secondary-container text-on-secondary-container"
                        }`}
                    >
                        {isRefreshing ? t("page.realtimeRanking.refreshing") : t("page.realtimeRanking.synced")}
                    </span>

                    <Button size="xs" variant="filled" icon={mdRefresh} onClick={onRefresh}>
                        {isRefreshing ? (
                            <motion.span
                                animate={{ opacity: [1, 0.4, 1] }}
                                transition={{ duration: 0.8, repeat: Infinity }}
                            >
                                {t("page.realtimeRankingNext.refreshing")}
                            </motion.span>
                        ) : (
                            <>
                                <span>{t("page.realtimeRankingNext.refresh")}</span>
                                <span className="tabular-nums opacity-85">{countdown}s</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
