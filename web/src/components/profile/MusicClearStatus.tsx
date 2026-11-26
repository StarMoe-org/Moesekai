"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { fetchMasterDataForServer } from "@/lib/fetch";
import type { ServerType } from "@/lib/account";
import type { UserMusicResultsMap } from "@/lib/user-music-results";
import {
    CLEAR_STATUS_DIFFICULTIES,
    CLEAR_STATUS_LEVELS,
    countClearStatus,
    type ClearStatusLevel,
} from "@/lib/music-clear-status";
import { DIFFICULTY_COLORS, DIFFICULTY_NAMES, difficultyFillStyle } from "@/types/music";
import { Button, SectionCard } from "@/components/md3";
import { mdChevronRight, mdLibraryMusic } from "@/components/md3/icons";

interface Props {
    server: ServerType;
    status: "loading" | "ready" | "error";
    results: UserMusicResultsMap | null;
}

// The tally itself lives in lib/music-clear-status.ts: the FC/AP honors print the same numbers, so
// both read one implementation instead of counting the account's results twice, differently.
const LEVEL_LABEL_KEYS: Record<ClearStatusLevel, string> = {
    clear: "page.profile.music.clear",
    fullCombo: "page.profile.music.fullCombo",
    allPerfect: "page.profile.music.allPerfect",
};

/** The game's song clear status: per difficulty, how many songs are cleared, full-comboed and all-perfected. */
export default function MusicClearStatus({ server, status, results }: Props) {
    const { t, formatNumber } = useI18n();
    const [chartCounts, setChartCounts] = useState<Record<string, number> | null>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchMasterDataForServer<Array<{ id: number; publishedAt: number }>>(server, "musics.json"),
            fetchMasterDataForServer<Array<{ musicId: number; musicDifficulty: string }>>(server, "musicDifficulties.json"),
        ]).then(([musics, difficulties]) => {
            const now = Date.now();
            const released = new Set(musics.filter((music) => music.publishedAt <= now).map((music) => music.id));
            const counts: Record<string, number> = {};
            for (const difficulty of difficulties) {
                if (released.has(difficulty.musicId)) counts[difficulty.musicDifficulty] = (counts[difficulty.musicDifficulty] ?? 0) + 1;
            }
            if (!cancelled) setChartCounts(counts);
        }).catch(() => {
            if (!cancelled) setChartCounts({});
        });
        return () => { cancelled = true; };
    }, [server]);

    const counts = useMemo(() => countClearStatus(results), [results]);

    const unavailable = status === "error" || (status === "ready" && !results);

    return (
        <SectionCard
            className="h-full"
            icon={mdLibraryMusic}
            title={t("page.profile.music.title")}
            actions={
                <Button variant="text" size="xs" href="/my-musics" trailingIcon={mdChevronRight}>
                    {t("page.profile.music.viewAll")}
                </Button>
            }
        >
            {unavailable ? (
                <p className="py-8 text-center type-body-m text-on-surface-variant">{t("page.profile.music.unavailable")}</p>
            ) : (
                // Phones list one difficulty per row; wider screens flow the same cells into
                // columns, one per difficulty, the way the game's clear status table reads.
                <div className="grid grid-cols-[4.5rem_repeat(3,minmax(0,1fr))] items-center gap-x-3 gap-y-2.5 sm:grid-flow-col sm:grid-cols-[auto_repeat(6,minmax(0,1fr))] sm:grid-rows-[repeat(4,auto)] sm:gap-x-4 sm:gap-y-3">
                    <span />
                    {CLEAR_STATUS_LEVELS.map((level) => (
                        <span key={level} className="text-center type-label-s text-on-surface-variant sm:pr-2 sm:text-left">{t(LEVEL_LABEL_KEYS[level])}</span>
                    ))}
                    {CLEAR_STATUS_DIFFICULTIES.map((difficulty) => {
                        const total = chartCounts?.[difficulty] ?? 0;
                        return (
                            <div key={difficulty} className="contents">
                                <div className="min-w-0">
                                    <div
                                        className="rounded-md3-sm py-1 text-center type-label-m font-semibold tracking-normal"
                                        style={difficultyFillStyle(difficulty)}
                                    >
                                        {DIFFICULTY_NAMES[difficulty]}
                                    </div>
                                    <div className="mt-0.5 h-4 text-center type-label-s tabular-nums text-on-surface-variant">
                                        {total > 0 && t("page.profile.music.chartCount", { count: formatNumber(total) })}
                                    </div>
                                </div>
                                {CLEAR_STATUS_LEVELS.map((level) => {
                                    const value = counts[difficulty][level];
                                    return (
                                        <div key={level} className="min-w-0" title={total > 0 ? `${value} / ${total}` : undefined}>
                                            {status === "loading" ? (
                                                <div className="mx-auto h-5 w-10 animate-pulse rounded-md3-xs bg-surface-container-high" />
                                            ) : (
                                                <div className="text-center type-title-m tabular-nums text-on-surface">{formatNumber(value)}</div>
                                            )}
                                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-container-highest">
                                                <div
                                                    className="h-full rounded-full transition-[width] duration-500 ease-md3-standard"
                                                    style={{
                                                        width: total > 0 && status === "ready" ? `${Math.min(100, (value / total) * 100)}%` : "0%",
                                                        backgroundColor: DIFFICULTY_COLORS[difficulty],
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}
        </SectionCard>
    );
}
