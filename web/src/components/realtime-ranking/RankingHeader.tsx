"use client";

import Link from "@/components/LocalizedLink";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { Chip, Icon, PageHeader, Switch } from "@/components/md3";
import { mdArrowForward, mdCelebration } from "@/components/md3/icons";
import { REALTIME_RANKING_REGION_OPTIONS, RealtimeRankingRegion } from "@/types/realtime-ranking";
import { REALTIME_RANKING_LINE_OPTIONS, RealtimeRankingLine } from "@/lib/realtime-ranking-line";

interface RankingHeaderProps {
    region: RealtimeRankingRegion;
    onRegionChange: (region: RealtimeRankingRegion) => void;
    line: RealtimeRankingLine;
    onLineChange: (line: RealtimeRankingLine) => void;
    updatedAt?: number;
    eventId?: number;
    scopeLabel?: string;
    totalEntries: number;
    isRefreshing: boolean;
    showChurn: boolean;
    onShowChurnChange: (value: boolean) => void;
    showChurnToggle?: boolean;
}

export default function RankingHeader({
    region,
    onRegionChange,
    line,
    onLineChange,
    updatedAt,
    eventId,
    scopeLabel,
    totalEntries,
    isRefreshing,
    showChurn,
    onShowChurnChange,
    showChurnToggle = true,
}: RankingHeaderProps) {
    const { t, formatDate, formatNumber } = useI18n();

    return (
        <>
            <PageHeader
                align="center"
                eyebrow={
                    <span className="inline-flex items-center gap-2">
                        {t("page.realtimeRanking.badge")}
                        <span className="rounded-md3-sm bg-surface-container-highest px-2 py-0.5 type-label-s text-on-surface-variant">
                            {t("page.realtimeRanking.legacyBadge")}
                        </span>
                    </span>
                }
                title={t("page.realtimeRanking.title")}
                highlight={t("page.realtimeRanking.titleHighlight")}
                description={
                    <>
                        {t("page.realtimeRanking.description")}
                        <span className="mt-4 flex justify-center">
                            {/* Promote the redesigned (next) version */}
                            <Link
                                href="/realtime-ranking-next"
                                className="state-layer focus-ring inline-flex max-w-full items-center gap-2 rounded-full bg-secondary-container px-4 py-2 type-label-l text-on-secondary-container"
                            >
                                <Icon path={mdCelebration} size={18} className="shrink-0" />
                                <span className="truncate">{t("page.realtimeRanking.tryNextText")}</span>
                                <span className="inline-flex shrink-0 items-center gap-0.5 text-primary">
                                    {t("page.realtimeRanking.tryNextCta")}
                                    <Icon path={mdArrowForward} size={18} />
                                </span>
                            </Link>
                        </span>
                    </>
                }
            />

            {/* Controls */}
            <div className="flex flex-wrap gap-3 mb-8 items-center">
                {/* Region Toggle */}
                <div className="flex max-w-full flex-wrap gap-1.5">
                    {REALTIME_RANKING_REGION_OPTIONS.map((value) => (
                        <Chip key={value} selected={region === value} onClick={() => onRegionChange(value)}>
                            <ServerRegionLabel server={value} label={t(`page.realtimeRanking.regions.${value}`)} />
                        </Chip>
                    ))}
                </div>

                {/* Data Line Toggle */}
                <div className="shrink-0 flex items-center gap-1.5">
                    <span className="type-label-m text-on-surface-variant whitespace-nowrap">
                        {t("page.realtimeRanking.line.label")}
                    </span>
                    <div className="flex max-w-full flex-wrap gap-1.5">
                        {REALTIME_RANKING_LINE_OPTIONS.map((value) => (
                            <Chip key={value} selected={line === value} onClick={() => onLineChange(value)}>
                                {t(`page.realtimeRanking.line.${value}`)}
                            </Chip>
                        ))}
                    </div>
                </div>

                {showChurnToggle && (
                    <Switch
                        className="shrink-0 gap-2"
                        leading
                        checked={showChurn}
                        onCheckedChange={onShowChurnChange}
                        label={t("page.realtimeRanking.showChurn")}
                    />
                )}

                {/* Status Tags */}
                <div className="flex flex-wrap items-center gap-2 type-label-m">
                    {typeof eventId === "number" && (
                        <span className="rounded-md3-sm bg-surface-container-high px-3 py-1.5 text-on-surface-variant whitespace-nowrap">
                            {t("page.realtimeRanking.eventId", { id: eventId })}
                        </span>
                    )}
                    {scopeLabel && (
                        <span className="rounded-md3-sm bg-primary-container px-3 py-1.5 text-on-primary-container whitespace-nowrap">
                            {scopeLabel}
                        </span>
                    )}
                    <span className="rounded-md3-sm bg-surface-container-high px-3 py-1.5 text-on-surface-variant whitespace-nowrap">
                        {t("page.realtimeRanking.totalEntries", { count: formatNumber(totalEntries) })}
                    </span>
                    <span className={`rounded-md3-sm px-3 py-1.5 whitespace-nowrap ${isRefreshing
                        ? "bg-tertiary-container text-on-tertiary-container"
                        : "bg-secondary-container text-on-secondary-container"
                        }`}>
                        {isRefreshing ? t("page.realtimeRanking.refreshing") : t("page.realtimeRanking.synced")}
                    </span>
                    {updatedAt ? (
                        <span className="rounded-md3-sm bg-surface-container-high px-3 py-1.5 text-on-surface-variant whitespace-nowrap">
                            {t("page.realtimeRanking.updatedAt", { time: formatDate(updatedAt) })}
                        </span>
                    ) : null}
                </div>
            </div>
        </>
    );
}
