"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SeriesPoint } from "@/types/realtime-ranking-next";

export interface ScoreSeries {
    name: string;
    color: string;
    points: SeriesPoint[];
    /** Render as a dashed reference line (e.g. tier lines). */
    dashed?: boolean;
}

interface ScoreLineChartProps {
    series: ScoreSeries[];
    height?: number;
    className?: string;
}

function fmtAxisTime(ms: number): string {
    const d = new Date(ms);
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    const hh = d.getHours().toString().padStart(2, "0");
    const mi = d.getMinutes().toString().padStart(2, "0");
    return `${mm}/${dd} ${hh}:${mi}`;
}

export default function ScoreLineChart({ series, height = 280, className }: ScoreLineChartProps) {
    const { t, formatNumber } = useI18n();
    const { resolvedColorScheme } = useTheme();
    const isDark = resolvedColorScheme === "dark";

    const option = useMemo(() => {
        const axisColor = isDark ? "#475569" : "#e2e8f0";
        const labelColor = isDark ? "#94a3b8" : "#94a3b8";
        const splitColor = isDark ? "#1e293b" : "#f1f5f9";

        const echartsSeries = series.map((s) => ({
            name: s.name,
            type: "line",
            showSymbol: false,
            smooth: true,
            lineStyle: { width: s.dashed ? 1.5 : 2.5, type: s.dashed ? "dashed" : "solid", color: s.color },
            itemStyle: { color: s.color },
            areaStyle: s.dashed ? undefined : {
                color: {
                    type: "linear", x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: `${s.color}33` },
                        { offset: 1, color: `${s.color}00` },
                    ],
                },
            },
            data: s.points.map((p) => [p.t, p.s]),
        }));

        return {
            tooltip: {
                trigger: "axis",
                backgroundColor: isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.95)",
                borderColor: axisColor,
                borderWidth: 1,
                textStyle: { color: isDark ? "#e2e8f0" : "#334155", fontSize: 11 },
                formatter: (params: { seriesName: string; value: [number, number]; color: string }[]) => {
                    if (!params.length) return "";
                    const head = `<div style="font-weight:600;margin-bottom:4px;">${fmtAxisTime(params[0].value[0])}</div>`;
                    const rows = params.map((p) => `
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="width:8px;height:8px;border-radius:50%;background:${p.color};"></span>
                            <span>${p.seriesName}: ${formatNumber(p.value[1])}</span>
                        </div>`).join("");
                    return head + rows;
                },
            },
            legend: {
                data: series.map((s) => s.name),
                top: 0,
                textStyle: { color: labelColor, fontSize: 11 },
            },
            grid: { left: "2%", right: "4%", bottom: "10%", top: "16%", containLabel: true },
            xAxis: {
                type: "time",
                axisLine: { lineStyle: { color: axisColor } },
                axisLabel: { color: labelColor, fontSize: 10, formatter: (val: number) => fmtAxisTime(val) },
                axisTick: { show: false },
            },
            yAxis: {
                type: "value",
                scale: true,
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: splitColor, type: "dashed" } },
                axisLabel: {
                    color: labelColor,
                    fontSize: 10,
                    formatter: (value: number) => {
                        if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
                        if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
                        return String(value);
                    },
                },
            },
            dataZoom: [
                { type: "inside", start: 0, end: 100 },
            ],
            series: echartsSeries,
        };
    }, [series, isDark, formatNumber]);

    const hasData = series.some((s) => s.points.length > 0);
    if (!hasData) {
        return (
            <div className={`flex items-center justify-center rounded-md3-md border border-dashed border-outline-variant text-xs text-on-surface-variant ${className ?? ""}`} style={{ height }}>
                {t("page.realtimeRankingNext.detail.noSeriesData")}
            </div>
        );
    }

    return (
        <div className={className}>
            <ReactECharts option={option} style={{ height }} notMerge opts={{ renderer: "canvas" }} />
        </div>
    );
}
