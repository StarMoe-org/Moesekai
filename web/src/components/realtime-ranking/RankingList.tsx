"use client";

import { EmptyState, Icon } from "@/components/md3";
import { mdWarningFill } from "@/components/md3/icons";
import React from "react";
import RankingRow from "@/components/realtime-ranking/RankingRow";
import { useI18n } from "@/contexts/I18nContext";
import { RealtimeRankingEntryWithDiff, RealtimeRankingMasterData, ChurnRankingEntry } from "@/types/realtime-ranking";
import { AssetSourceType } from "@/contexts/ThemeContext";

interface RankingListProps {
    entries: RealtimeRankingEntryWithDiff[];
    masterData: RealtimeRankingMasterData;
    assetSource: AssetSourceType;
    secondsSinceUpdate?: number;
    showChurn: boolean;
    churnData: Map<string, ChurnRankingEntry>;
    onShowParkingPeriods: (userId: string) => void;
    showExtendedWarning?: boolean;
    trackedUserId: string | null;
    onTrackToggle: (userId: string) => void;
    /** Ranks whose data was carried over from a previous snapshot (stale/syncing). */
    staleRanks?: Set<number>;
}

export default function RankingList({
    entries,
    masterData,
    assetSource,
    secondsSinceUpdate,
    showChurn,
    churnData,
    onShowParkingPeriods,
    showExtendedWarning = true,
    trackedUserId,
    onTrackToggle,
    staleRanks,
}: RankingListProps) {
    const { t } = useI18n();

    if (entries.length === 0) {
        return (
            <div className="rounded-md3-lg bg-surface-card border border-outline-variant/70">
                <EmptyState title={t("page.realtimeRanking.list.empty")} />
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-md3-lg bg-surface-card border border-outline-variant/70">
            {/* Table header */}
            <div className="flex items-center border-b border-outline-variant bg-surface-container px-3 py-2.5 type-label-m text-on-surface-variant">
                <div className="w-12 shrink-0 text-center sm:w-14">{t("page.realtimeRanking.list.rank")}</div>
                <div className="ml-2 flex-1">{t("page.realtimeRanking.list.playerInfo")}</div>
                <div className="w-32 shrink-0 text-right sm:w-40">{t("page.realtimeRanking.list.score")}</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-outline-variant">
                {entries.map((entry, index) => {
                    const prevRank = index > 0 ? entries[index - 1].rank : 0;
                    const showNotice = showExtendedWarning && entry.rank > 100 && prevRank <= 100;
                    // For rank > 100 rows, prefer the tier-line key and fall back to userId.
                    const churnEntry = entry.rank > 100
                        ? (churnData.get(`tier:${entry.rank}`) ?? churnData.get(entry.userId))
                        : churnData.get(entry.userId);
                    return (
                        <React.Fragment key={entry.userId}>
                            {showNotice && (
                                <div className="flex items-center gap-2 bg-tertiary-container px-4 py-2 type-body-s text-on-tertiary-container">
                                    <Icon path={mdWarningFill} size={18} className="shrink-0" />
                                    <span>{t("page.realtimeRanking.list.extendedWarning")}</span>
                                </div>
                            )}
                            <RankingRow
                                entry={entry}
                                masterData={masterData}
                                assetSource={assetSource}
                                secondsSinceUpdate={secondsSinceUpdate}
                                showChurn={showChurn}
                                churnEntry={churnEntry}
                                churnData={churnData}
                                onShowParkingPeriods={onShowParkingPeriods}
                                isTracked={entry.userId === trackedUserId}
                                onTrackToggle={onTrackToggle}
                                isStale={staleRanks?.has(entry.rank) ?? false}
                            />
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
