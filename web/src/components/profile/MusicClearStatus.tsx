"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { fetchMasterDataForServer } from "@/lib/fetch";
import type { ServerType } from "@/lib/account";
import type { UserMusicResultsMap } from "@/lib/user-music-results";
import { DIFFICULTY_COLORS, DIFFICULTY_NAMES, difficultyFillStyle, type MusicDifficultyType } from "@/types/music";
import { Button, SectionCard } from "@/components/md3";
import { mdChevronRight, mdLibraryMusic } from "@/components/md3/icons";

interface Props {
    server: ServerType;
    status: "loading" | "ready" | "error";
    results: UserMusicResultsMap | null;
}

const DIFFICULTIES: MusicDifficultyType[] = ["easy", "normal", "hard", "expert", "master", "append"];
const LEVELS = [
    { key: "clear", labelKey: "page.profile.music.clear", min: ["C", "FC", "AP"] },
    { key: "fullCombo", labelKey: "page.profile.music.fullCombo", min: ["FC", "AP"] },
    { key: "allPerfect", labelKey: "page.profile.music.allPerfect", min: ["AP"] },
] as const;

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

    const counts = useMemo(() => {
        const table: Record<string, Record<string, number>> = {};
        for (const difficulty of DIFFICULTIES) table[difficulty] = { clear: 0, fullCombo: 0, allPerfect: 0 };
        results?.forEach((entry) => {
            for (const difficulty of DIFFICULTIES) {
                const result = entry[difficulty];
                if (!result) continue;
                for (const level of LEVELS) {
                    if ((level.min as readonly string[]).includes(result)) table[difficulty][level.key] += 1;
                }
            }
        });
        return table;
    }, [results]);

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
                    {LEVELS.map((level) => (
                        <span key={level.key} className="text-center type-label-s text-on-surface-variant sm:pr-2 sm:text-left">{t(level.labelKey)}</span>
                    ))}
                    {DIFFICULTIES.map((difficulty) => {
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
                                {LEVELS.map((level) => {
                                    const value = counts[difficulty][level.key];
                                    return (
                                        <div key={level.key} className="min-w-0" title={total > 0 ? `${value} / ${total}` : undefined}>
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
