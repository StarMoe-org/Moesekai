"use client";

import { useI18n } from "@/contexts/I18nContext";
import { ChurnEntryV2 } from "@/types/realtime-ranking-next";
import { calcRecentGrowth, fmtSpeed, getSpeedTrend } from "../../_lib/board-utils";

interface SpeedGaugeProps {
    churnEntry?: ChurnEntryV2;
}

interface StatCardProps {
    label: string;
    value: string;
    accent?: "primary" | "sky" | "emerald" | "rose" | "neutral";
    trend?: "up" | "down" | "flat";
}

const accentClass: Record<NonNullable<StatCardProps["accent"]>, string> = {
    primary: "text-primary",
    sky: "text-sky-600 ",
    emerald: "text-emerald-600 ",
    rose: "text-rose-500 ",
    neutral: "text-on-surface",
};

function StatCard({ label, value, accent = "neutral", trend }: StatCardProps) {
    const trendIcon = trend === "up" ? "▲" : trend === "down" ? "▼" : null;
    const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-rose-500" : "text-on-surface-variant";
    return (
        <div className="rounded-md3-md bg-surface-container px-3 py-2.5">
            <div className="type-label-s text-on-surface-variant">{label}</div>
            <div className={`mt-0.5 flex items-baseline gap-1 type-title-l tabular-nums ${accentClass[accent]}`}>
                <span>{value}</span>
                {trendIcon && <span className={`text-xs ${trendColor}`}>{trendIcon}</span>}
            </div>
        </div>
    );
}

export default function SpeedGauge({ churnEntry }: SpeedGaugeProps) {
    const { t } = useI18n();

    if (!churnEntry) {
        return (
            <div className="rounded-md3-md border border-dashed border-outline-variant px-3 py-6 text-center text-xs text-on-surface-variant">
                {t("page.realtimeRankingNext.detail.noSpeedData")}
            </div>
        );
    }

    const changes = churnEntry.recent_score_changes ?? [];
    const speed1h = churnEntry.growth_1h ?? 0;
    const speed20min3 = calcRecentGrowth(changes, 20) * 3;
    const trend = getSpeedTrend(speed1h, speed20min3);

    const churn1h = churnEntry.churn_1h ?? 0;
    const churn20min3 = (churnEntry.churn_20min ?? 0) * 3;
    const churn48h = churnEntry.churn_48h ?? 0;

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatCard label={t("page.realtimeRankingNext.detail.speed1h")} value={fmtSpeed(speed1h)} accent="neutral" trend={trend} />
            <StatCard label={t("page.realtimeRankingNext.detail.speed20min3")} value={fmtSpeed(speed20min3)} accent={trend === "up" ? "emerald" : trend === "down" ? "rose" : "neutral"} />
            <StatCard label={t("page.realtimeRankingNext.detail.churn48h")} value={String(churn48h)} accent="primary" />
            <StatCard label={t("page.realtimeRankingNext.detail.churn1h")} value={String(churn1h)} accent="primary" />
            <StatCard label={t("page.realtimeRankingNext.detail.churn20min3")} value={String(churn20min3)} accent="sky" />
        </div>
    );
}
