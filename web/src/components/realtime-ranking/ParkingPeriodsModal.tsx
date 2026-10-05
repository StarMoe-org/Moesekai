"use client";

import Modal from "@/components/common/Modal";
import { Icon } from "@/components/md3";
import { mdLocalParking } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { ChurnRankingEntry } from "@/types/realtime-ranking";
import { ChurnEntryV2 } from "@/types/realtime-ranking-next";

interface ParkingPeriodsModalProps {
    userId: string | null;
    churnEntry?: ChurnRankingEntry | ChurnEntryV2 | null;
    onClose: () => void;
}

function formatDuration(startMs: number, endMs?: number, durationS?: number): string {
    // Prefer duration_s returned by the API.
    const totalSeconds = durationS != null ? durationS : Math.max(0, Math.floor(((endMs ?? Date.now()) - startMs) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
}

export default function ParkingPeriodsModal({ userId, churnEntry, onClose }: ParkingPeriodsModalProps) {
    const { t, formatDate } = useI18n();
    const playerName = churnEntry?.name ?? t("page.realtimeRanking.churn.playerFallback", { id: userId ?? "" });
    const periods = churnEntry?.parking_periods ?? [];

    return (
        <Modal
            isOpen={!!userId}
            onClose={onClose}
            title={t("page.realtimeRanking.churn.parkingTitle", { player: playerName })}
            size="md"
        >
            {periods.length === 0 ? (
                <div className="py-8 text-center text-on-surface-variant">
                    <Icon path={mdLocalParking} size={32} className="mx-auto mb-2" />
                    <p className="text-sm font-medium">{t("page.realtimeRanking.churn.noParking")}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {periods.map((period, index) => {
                        const isOngoing = !period.end_time;
                        const startTime = period.start_time ?? (period as { since_ms?: number }).since_ms ?? 0;
                        return (
                            <div
                                key={index}
                                className={`flex items-center gap-3 rounded-md3-md p-3 transition-colors ${
                                    isOngoing
                                        ? "bg-primary-container text-on-primary-container"
                                        : "bg-surface-container"
                                }`}
                            >
                                {/* Index */}
                                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full type-label-m ${
                                    isOngoing
                                        ? "bg-primary text-on-primary"
                                        : "bg-surface-container-high text-on-surface-variant "
                                }`}>
                                    {index + 1}
                                </div>

                                {/* Time range */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="font-medium text-on-surface-variant">
                                            {formatDate(startTime)}
                                        </span>
                                        <span className="text-on-surface-variant">→</span>
                                        <span className={`font-medium ${isOngoing ? "text-primary" : "text-on-surface-variant"}`}>
                                            {isOngoing ? t("page.realtimeRanking.churn.ongoing") : formatDate(period.end_time!)}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-on-surface-variant">
                                        {t("page.realtimeRanking.churn.duration", { duration: formatDuration(startTime, period.end_time, period.duration_s) })}
                                    </div>
                                </div>

                                {/* Status badge */}
                                {isOngoing && (
                                    <span className="shrink-0 rounded-md3-sm bg-primary-container px-2 py-0.5 type-label-s text-on-primary-container">
                                        {t("page.realtimeRanking.churn.activeParking")}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
}
