"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { Banner, Button, Icon, Surface, cn } from "@/components/md3";
import { mdArrowBack, mdCheck, mdCheckCircle, mdCancel, mdContentCopy, mdMilitaryTech, mdReplay, mdSchool } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { getMusicJacketUrl } from "@/lib/assets";
import { formatClock } from "@/lib/guess-music/rounds";
import { formatDuration, type DailyFinishResult, type DailyRoundSummary } from "@/lib/guess-music/daily-api";
import type { DailySongData } from "./DailySongData";

interface DailyResultViewProps {
    result: DailyFinishResult;
    songs: DailySongData | null;
    /** The ranked attempt was already played earlier today. */
    alreadyPlayed?: boolean;
    /** Practice only: another practice run of the same tier. */
    onPlayAgain?: () => void;
    onBack: () => void;
}

function roundMark(round: DailyRoundSummary): string {
    if (!round.correct) return "×";
    return round.attempts <= 1 ? "◎" : "○";
}

/** The end of a run: totals, rank (ranked) or the practice note, sharing, and every round's answer. */
export default function DailyResultView({ result, songs, alreadyPlayed, onPlayAgain, onBack }: DailyResultViewProps) {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<number | null>(null);
    useEffect(
        () => () => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        },
        [],
    );

    const ranked = result.ranked;
    const tierName = t(`page.guessMusicDaily.tiers.${result.tier}`);
    const rounds = [...result.rounds].sort((a, b) => a.round - b.round);
    const total = rounds.length || 20;

    const share = async () => {
        const lines = [
            ranked ? t("page.guessMusicDaily.result.shareTitle", { date: result.date, tier: tierName }) : t("page.guessMusicDaily.result.sharePracticeTitle", { date: result.date, tier: tierName }),
            rounds.map(roundMark).join(""),
            t("page.guessMusicDaily.result.shareScore", { correct: result.correctCount, total, score: result.totalScore.toLocaleString() }),
        ];
        if (ranked && result.rank && result.totalPlayers) lines.push(t("page.guessMusicDaily.result.shareRank", { rank: result.rank, total: result.totalPlayers }));
        lines.push(`${window.location.origin}${window.location.pathname}`);
        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            setCopied(true);
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => setCopied(false), 2500);
        } catch {
            setCopied(false);
        }
    };

    const title = alreadyPlayed ? t("page.guessMusicDaily.result.alreadyPlayedTitle") : ranked ? t("page.guessMusicDaily.result.title") : t("page.guessMusicDaily.result.practiceTitle");

    return (
        <Surface tone="low" radius="xl" className="flex flex-col gap-5 p-4 sm:p-6" as="section" aria-labelledby="daily-result-title">
            <div className="flex flex-col gap-2">
                <div>
                    <Button variant="text" size="s" icon={mdArrowBack} onClick={onBack} className="-ml-2">
                        {t("page.guessMusicDaily.result.back")}
                    </Button>
                </div>
                <span
                    className={cn(
                        "inline-flex h-7 w-fit items-center gap-1 rounded-md3-sm px-2 type-label-l",
                        ranked ? "bg-primary text-on-primary" : "bg-secondary-container text-on-secondary-container",
                    )}
                >
                    <Icon path={ranked ? mdMilitaryTech : mdSchool} size={16} />
                    {ranked ? t("page.guessMusicDaily.round.rankedBadge", { tier: tierName }) : t("page.guessMusicDaily.round.practiceBadge", { tier: tierName })}
                </span>
                <h2 id="daily-result-title" className="type-headline-s text-on-surface">
                    {title}
                </h2>
                <p className="type-body-m text-on-surface-variant">
                    {alreadyPlayed ? t("page.guessMusicDaily.result.alreadyPlayedHint") : t("page.guessMusicDaily.result.dateLine", { date: result.date, tier: tierName })}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={t("page.guessMusicDaily.result.totalScore")} value={result.totalScore.toLocaleString()} emphasis />
                <Stat label={t("page.guessMusicDaily.result.correct")} value={`${result.correctCount} / ${total}`} />
                <Stat label={t("page.guessMusicDaily.result.duration")} value={formatDuration(result.durationMs)} />
                <Stat
                    label={t("page.guessMusicDaily.result.rank")}
                    value={ranked && result.rank ? `#${result.rank}` : "—"}
                    caption={ranked && result.totalPlayers ? t("page.guessMusicDaily.result.rankOf", { total: result.totalPlayers }) : t("page.guessMusicDaily.result.unrankedShort")}
                    icon={ranked && result.rank ? mdMilitaryTech : undefined}
                />
            </div>

            {!ranked ? <Banner tone="info" title={t("page.guessMusicDaily.result.practice")} /> : null}

            <div className="flex flex-wrap gap-2">
                <Button variant="filled" icon={copied ? mdCheck : mdContentCopy} onClick={() => void share()}>
                    {copied ? t("page.guessMusicDaily.result.shareCopied") : t("page.guessMusicDaily.result.share")}
                </Button>
                {onPlayAgain ? (
                    <Button variant="tonal" icon={mdReplay} onClick={onPlayAgain}>
                        {t("page.guessMusicDaily.result.playAgain")}
                    </Button>
                ) : null}
            </div>

            <div className="flex flex-col gap-2">
                <h3 className="type-title-m text-on-surface">{t("page.guessMusicDaily.result.rounds")}</h3>
                <ol className="grid gap-2 sm:grid-cols-2">
                    {rounds.map((round) => (
                        <RoundRow key={round.round} round={round} songs={songs} />
                    ))}
                </ol>
            </div>
        </Surface>
    );
}

function Stat({ label, value, caption, emphasis, icon }: { label: string; value: string; caption?: string; emphasis?: boolean; icon?: string }) {
    return (
        <div className={cn("flex flex-col gap-0.5 rounded-md3-lg px-4 py-3", emphasis ? "bg-primary-container text-on-primary-container" : "bg-surface-container text-on-surface")}>
            <span className={cn("type-label-m", emphasis ? "text-on-primary-container" : "text-on-surface-variant")}>{label}</span>
            <span className="flex items-center gap-1 type-headline-s tabular-nums">
                {icon ? <Icon path={icon} size={24} className="text-tertiary" /> : null}
                {value}
            </span>
            {caption ? <span className={cn("type-label-m", emphasis ? "text-on-primary-container" : "text-on-surface-variant")}>{caption}</span> : null}
        </div>
    );
}

function RoundRow({ round, songs }: { round: DailyRoundSummary; songs: DailySongData | null }) {
    const { t } = useI18n();
    const answer = round.answer;
    const music = answer ? songs?.musics.get(answer.musicId) : undefined;
    const localized = answer && songs ? songs.localizedTitle(answer.musicTitle) : "";
    const caption = answer ? (songs ? songs.localizedCaption(answer.vocalCaption) : answer.vocalCaption) : "";
    return (
        <li>
            <Link href={answer ? `/music/${answer.musicId}` : "/music"} target="_blank" className="state-layer focus-ring flex gap-3 rounded-md3-md bg-surface-container p-3 text-on-surface">
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md3-sm bg-surface-container-highest">
                    {music?.assetbundleName ? (
                        <Image src={getMusicJacketUrl(music.assetbundleName, "main-jp")} alt="" fill sizes="56px" className="object-cover" unoptimized />
                    ) : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 type-label-m text-on-surface-variant">
                        <Icon path={round.correct ? mdCheckCircle : mdCancel} size={16} className={round.correct ? "text-primary" : "text-error"} />
                        {t("page.guessMusicDaily.result.roundLabel", { n: round.round + 1 })}
                    </span>
                    <span className="truncate type-title-s">{answer?.musicTitle ?? "—"}</span>
                    {localized && localized !== answer?.musicTitle ? <span className="truncate type-body-s text-on-surface-variant">{localized}</span> : null}
                    <span className="truncate type-body-s text-on-surface-variant">
                        {caption}
                        {answer ? ` · ${formatClock(answer.startSeconds)}` : ""}
                    </span>
                </span>
                <span className="flex shrink-0 flex-col items-end justify-center">
                    <span className={cn("type-title-m tabular-nums", round.correct ? "text-primary" : "text-on-surface-variant")}>
                        {round.correct ? `+${round.points.toLocaleString()}` : "0"}
                    </span>
                    <span className="type-label-s tabular-nums text-on-surface-variant">
                        {round.correct
                            ? t("page.guessMusicDaily.result.roundDetail", { attempts: round.attempts, time: formatDuration(round.elapsedMs) })
                            : t("page.guessMusicDaily.result.roundMissed")}
                    </span>
                </span>
            </Link>
        </li>
    );
}
