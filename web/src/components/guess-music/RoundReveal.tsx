"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Button, Icon, cn } from "@/components/md3";
import { mdArrowForward, mdCheckCircle, mdErrorFill, mdFlag, mdOpenInNew, mdSchedule, mdWarningFill } from "@/components/md3/icons";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getMusicJacketUrl } from "@/lib/assets";
import type { RoundOutcome, RoundResult } from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/library";
import { formatClock } from "@/lib/guess-music/rounds";
import VocalRemovalBadge from "./VocalRemovalBadge";

export const OUTCOME_ICON: Record<RoundOutcome, string> = {
    correct: mdCheckCircle,
    wrong: mdErrorFill,
    timeout: mdSchedule,
    gaveUp: mdFlag,
    unavailable: mdWarningFill,
};

/** The vocal's caption as in the master data, plus its translation when there is one. */
export function vocalCaption(library: SongLibrary, vocalId: number): { caption: string; translated: string | null } {
    const caption = library.vocalById.get(vocalId)?.caption ?? "";
    const translated = library.captionTranslations[caption];
    return { caption, translated: translated && translated !== caption ? translated : null };
}

export interface RoundRevealProps {
    library: SongLibrary;
    result: RoundResult;
    assetSource: AssetSourceType;
    isLast: boolean;
    onNext: () => void;
    className?: string;
}

/** The answer of a finished round: jacket, titles, version, clip position and the round's points. */
export default function RoundReveal({ library, result, assetSource, isLast, onNext, className }: RoundRevealProps) {
    const { t } = useI18n();
    const nextRef = useRef<HTMLButtonElement>(null);
    const music = library.musicById.get(result.musicId);
    const entry = library.entryById.get(result.musicId);
    const { caption, translated } = vocalCaption(library, result.vocalId);
    const correct = result.outcome === "correct";

    useEffect(() => {
        nextRef.current?.focus({ preventScroll: true });
    }, []);

    return (
        // The game's own live region announces the outcome; this section mounts with its content, so it is not one.
        <section
            data-round-reveal=""
            className={cn("overflow-hidden rounded-md3-xl bg-surface-container-low", className)}
        >
            <div
                className={cn(
                    "flex items-center gap-3 px-4 py-3 sm:px-5",
                    correct ? "bg-primary-container text-on-primary-container" : "bg-error-container text-on-error-container",
                )}
            >
                <Icon path={OUTCOME_ICON[result.outcome]} size={24} />
                <span className="min-w-0 flex-1 type-title-m">{t(`page.guessMusic.outcome.${result.outcome}`)}</span>
                {correct && (
                    <span className="shrink-0 type-title-m tabular-nums">
                        {t("page.guessMusic.reveal.points", { score: result.score })}
                        {result.comboMultiplier > 1 && (
                            <span className="ml-2 type-label-l">{t("page.guessMusic.reveal.combo", { multiplier: result.comboMultiplier.toFixed(1) })}</span>
                        )}
                    </span>
                )}
            </div>
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                <div className="relative mx-auto h-36 w-36 shrink-0 overflow-hidden rounded-md3-lg bg-surface-container-high sm:mx-0 sm:h-40 sm:w-40">
                    {music && (
                        <Image
                            src={getMusicJacketUrl(music.assetbundleName, assetSource)}
                            alt={music.title}
                            fill
                            sizes="160px"
                            className="object-cover"
                            unoptimized
                        />
                    )}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                    <div>
                        <h2 className="type-headline-s text-on-surface">{entry?.title ?? music?.title}</h2>
                        {entry?.localizedTitle && <p className="type-body-l text-on-surface-variant">{entry.localizedTitle}</p>}
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 type-body-m">
                        <dt className="text-on-surface-variant">{t("page.guessMusic.reveal.version")}</dt>
                        <dd className="min-w-0 text-on-surface">
                            {caption}
                            {translated && <span className="ml-2 text-on-surface-variant">{translated}</span>}
                        </dd>
                        <dt className="text-on-surface-variant">{t("page.guessMusic.reveal.clipStart")}</dt>
                        <dd className="tabular-nums text-on-surface">{result.clipStart === null ? "--:--" : formatClock(result.clipStart)}</dd>
                        {result.finalGuess && !correct && (
                            <>
                                <dt className="text-on-surface-variant">{t("page.guessMusic.reveal.lastGuess")}</dt>
                                <dd className="min-w-0 truncate text-on-surface">{result.finalGuess.label}</dd>
                            </>
                        )}
                    </dl>
                    {result.vocalRemovalApplied && <VocalRemovalBadge />}
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
                <Button variant="text" icon={mdOpenInNew} href={`/music/${result.musicId}`} linkProps={{ target: "_blank", rel: "noopener" }}>
                    {t("page.guessMusic.reveal.songDetail")}
                </Button>
                <Button ref={nextRef} variant="filled" trailingIcon={mdArrowForward} onClick={onNext}>
                    {isLast ? t("page.guessMusic.reveal.showResults") : t("page.guessMusic.reveal.next")}
                </Button>
            </div>
        </section>
    );
}
