"use client";

import { useI18n } from "@/contexts/I18nContext";
import { ChurnHourlyEntryV2 } from "@/types/realtime-ranking-next";
import { getCurrentHourKey } from "../../_lib/board-utils";

interface ChurnHeatmapProps {
    hourlyChurn: ChurnHourlyEntryV2[];
    churn48h?: number;
}

interface Cell {
    hour: number;
    count: number;
    isCurrentHour: boolean;
    localLabel: string;
}

/** Expand hourly churn into the last 48 hours, newest first. */
function buildGrid(hourlyChurn: ChurnHourlyEntryV2[]): Cell[] {
    const currentHourKey = getCurrentHourKey();
    const now = new Date();
    const map = new Map<string, number>();
    for (const h of hourlyChurn) map.set(h.hour, h.count);

    const grid: Cell[] = [];
    for (let i = 0; i < 48; i++) {
        const d = new Date(now);
        d.setUTCHours(d.getUTCHours() - i);
        d.setUTCMinutes(0, 0, 0);
        const key = d.toISOString().replace(/\.\d{3}Z$/, "Z");
        const local = new Date(d);
        grid.push({
            hour: local.getHours(),
            count: map.get(key) ?? 0,
            isCurrentHour: key === currentHourKey,
            localLabel: `${local.getMonth() + 1}/${local.getDate()} ${local.getHours()}:00`,
        });
    }
    return grid;
}

function cellColor(count: number, isCurrentHour: boolean): string {
    if (count === 0) return "bg-surface-container text-on-surface-variant ";
    if (isCurrentHour) return "bg-sky-100 text-sky-700 ";
    if (count >= 30) return "bg-rose-300 text-rose-900 ";
    if (count >= 20) return "bg-rose-200 text-rose-800 ";
    if (count >= 10) return "bg-rose-100 text-rose-700 ";
    return "bg-rose-50 text-rose-500 ";
}

export default function ChurnHeatmap({ hourlyChurn, churn48h }: ChurnHeatmapProps) {
    const { t } = useI18n();
    const grid = buildGrid(hourlyChurn);
    const row1 = grid.slice(0, 24);
    const row2 = grid.slice(24, 48);
    const total = churn48h ?? grid.reduce((acc, c) => acc + c.count, 0);

    return (
        <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface-variant">
                    {t("page.realtimeRankingNext.detail.heatmapTitle")}
                </span>
                <span className="text-xs font-black text-primary">
                    48H {total}
                </span>
            </div>
            <div className="space-y-1">
                {[row1, row2].map((row, ri) => (
                    <div key={ri} className="flex w-full min-w-0 gap-px">
                        {row.map((cell, i) => (
                            <div
                                key={`${ri}-${i}`}
                                title={`${cell.localLabel} · ${cell.count}`}
                                className={`flex-1 min-w-0 rounded-sm py-1 text-center text-[8px] font-bold ${cellColor(cell.count, cell.isCurrentHour)}`}
                            >
                                {cell.count > 0 ? `${cell.count}${cell.isCurrentHour ? "*" : ""}` : ""}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[9px] text-on-surface-variant">
                <span>{t("page.realtimeRankingNext.detail.heatmapNewest")}</span>
                <span>{t("page.realtimeRankingNext.detail.heatmapOldest")}</span>
            </div>
        </div>
    );
}
