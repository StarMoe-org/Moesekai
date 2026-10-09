"use client";

import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { Icon, cn } from "@/components/md3";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getMusicJacketUrl } from "@/lib/assets";
import type { RoundResult } from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/library";
import { formatClock } from "@/lib/guess-music/rounds";
import { OUTCOME_ICON, vocalCaption } from "./RoundReveal";
import VocalRemovalBadge from "./VocalRemovalBadge";

export interface ResultListProps {
    library: SongLibrary;
    results: readonly RoundResult[];
    assetSource: AssetSourceType;
    className?: string;
}

/** Every round of a finished game, linking to the song pages. */
export default function ResultList({ library, results, assetSource, className }: ResultListProps) {
    const { t } = useI18n();
    return (
        <ol className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", className)}>
            {results.map((result) => {
                const music = library.musicById.get(result.musicId);
                const entry = library.entryById.get(result.musicId);
                const { caption, translated } = vocalCaption(library, result.vocalId);
                const correct = result.outcome === "correct";
                return (
                    <li key={result.index}>
                        <Link
                            href={`/music/${result.musicId}`}
                            className="state-layer focus-ring flex h-full gap-3 rounded-md3-lg bg-surface-container p-3 text-on-surface"
                        >
                            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md3-sm bg-surface-container-high">
                                {music && (
                                    <Image
                                        src={getMusicJacketUrl(music.assetbundleName, assetSource)}
                                        alt=""
                                        fill
                                        sizes="64px"
                                        className="object-cover"
                                        unoptimized
                                    />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 type-label-m text-on-surface-variant">
                                    <span className="tabular-nums">{t("page.guessMusic.results.roundLabel", { round: result.index + 1 })}</span>
                                    <span
                                        className={cn("inline-flex items-center gap-1", correct ? "text-primary" : "text-error")}
                                    >
                                        <Icon path={OUTCOME_ICON[result.outcome]} size={16} />
                                        {t(`page.guessMusic.outcome.${result.outcome}`)}
                                    </span>
                                </div>
                                <div className="truncate type-title-s">{entry?.title ?? music?.title}</div>
                                {entry?.localizedTitle && <div className="truncate type-body-s text-on-surface-variant">{entry.localizedTitle}</div>}
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 type-label-m text-on-surface-variant">
                                    <span className="truncate">{translated ?? caption}</span>
                                    {result.clipStart !== null && <span className="tabular-nums">{formatClock(result.clipStart)}</span>}
                                    {result.timeTaken > 0 && (
                                        <span className="tabular-nums">{t("page.guessMusic.results.timeTaken", { seconds: result.timeTaken.toFixed(1) })}</span>
                                    )}
                                    {result.vocalRemovalApplied && <VocalRemovalBadge className="h-5" />}
                                </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                                <span className={cn("type-title-m tabular-nums", correct ? "text-on-surface" : "text-on-surface-variant")}>
                                    +{result.score}
                                </span>
                                {result.comboMultiplier > 1 && (
                                    <span className="rounded-md3-xs bg-tertiary-container px-1.5 type-label-s text-on-tertiary-container">
                                        {t("page.guessMusic.reveal.combo", { multiplier: result.comboMultiplier.toFixed(1) })}
                                    </span>
                                )}
                            </div>
                        </Link>
                    </li>
                );
            })}
        </ol>
    );
}
