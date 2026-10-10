"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { Banner, Button, Chip, Icon, LinearProgress, LoadingState, Surface, cn } from "@/components/md3";
import {
    mdArrowBack,
    mdArrowForward,
    mdBolt,
    mdCancel,
    mdCheckCircle,
    mdFlag,
    mdMilitaryTech,
    mdMusicOff,
    mdOpenInNew,
    mdSchedule,
    mdSchool,
    mdScoreboard,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { getMusicJacketUrl } from "@/lib/assets";
import { formatClock } from "@/lib/guess-music/rounds";
import {
    classifyDailyError,
    isSealedClip,
    type DailyAnswerResult,
    type DailyApi,
    type DailyErrorKind,
    type DailyRoundClip,
    type DailyRoundStart,
    type DailySealedClip,
    type DailyTierInfo,
    type RoundReveal,
    type StoredDailyRun,
} from "@/lib/guess-music/daily-api";
import DailyAnswerInput from "./DailyAnswerInput";
import DailyChoiceGrid from "./DailyChoiceGrid";
import DailyClipPlayer from "./DailyClipPlayer";
import type { DailySongData } from "./DailySongData";
import DailyTypeInput from "./DailyTypeInput";

type Phase = "starting" | "guessing" | "submitting" | "revealed" | "error";
type Outcome = "correct" | "missed" | "gaveUp" | "timeout";

interface RevealState {
    round: number;
    outcome: Outcome;
    points: number;
    attempts: number;
    answer?: RoundReveal;
}

interface DailyRoundViewProps {
    api: DailyApi;
    tier: DailyTierInfo;
    run: StoredDailyRun;
    songs: DailySongData;
    onRunChange: (run: StoredDailyRun) => void;
    /** Every round is final: finish the session. */
    onDone: () => void;
    /** The session can no longer be played (expired, signed out...). */
    onFatal: (kind: DailyErrorKind) => void;
    /** Back to the tier list; the run stays resumable. */
    onExit: () => void;
}

const MAX_STRIKES = 3;
/** How often the round countdown updates; the timer bar glides between updates. */
const COUNTDOWN_TICK_MS = 200;

/** One run of a tier: the rounds against the server, one at a time, with the reveal after each. */
export default function DailyRoundView({ api, tier, run, songs, onRunChange, onDone, onFatal, onExit }: DailyRoundViewProps) {
    const { t } = useI18n();
    const total = run.rounds;
    const [round, setRound] = useState(run.round);
    const [phase, setPhase] = useState<Phase>("starting");
    const [start, setStart] = useState<DailyRoundStart | null>(null);
    const [clipSrc, setClipSrc] = useState<string | null>(null);
    // Downloaded but still locked: the player unlocks it once the page may play sound.
    const [sealedClip, setSealedClip] = useState<DailySealedClip | null>(null);
    const [clipFailed, setClipFailed] = useState(false);
    // How much of the clip has arrived (0-1), while its length is known.
    const [clipProgress, setClipProgress] = useState<number | undefined>(undefined);
    const [reveal, setReveal] = useState<RevealState | null>(null);
    const [notice, setNotice] = useState<{ tone: "error" | "warning"; text: string } | null>(null);
    const [errorKind, setErrorKind] = useState<DailyErrorKind | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [startAttempt, setStartAttempt] = useState(0);

    // Latest run for async callbacks, so a slow response never writes over a newer state.
    const runRef = useRef(run);
    useEffect(() => {
        runRef.current = run;
    }, [run]);
    const commit = useCallback(
        (next: StoredDailyRun) => {
            runRef.current = next;
            onRunChange(next);
        },
        [onRunChange],
    );
    const clipUrlRef = useRef<string | null>(null);
    const clipAbortRef = useRef<AbortController | null>(null);
    const submittingRef = useRef(false);
    // Rounds skipped in a row because the server already had them final.
    const skippedRef = useRef(0);

    const releaseClip = useCallback(() => {
        clipAbortRef.current?.abort();
        clipAbortRef.current = null;
        if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
        clipUrlRef.current = null;
        setClipSrc(null);
        setSealedClip(null);
    }, []);

    useEffect(() => releaseClip, [releaseClip]);

    const errorText = useCallback((kind: DailyErrorKind) => t(`page.guessMusicDaily.errors.${kind}`), [t]);

    const failClip = useCallback(
        (error: unknown) => {
            const kind = classifyDailyError(error);
            if (kind === "sessionExpired" || kind === "unauthorized") {
                onFatal(kind);
                return;
            }
            setClipFailed(true);
        },
        [onFatal],
    );

    const showClip = useCallback(
        (round: number, { clip, timerStartedAt, timerFromServer }: DailyRoundClip) => {
            const current = runRef.current;
            // Count down with the server's timer; its own figure also resyncs a reloaded page.
            if (current.round === round && (timerFromServer || !current.clipStartedAt)) {
                commit({ ...current, clipStartedAt: timerStartedAt });
            }
            const url = URL.createObjectURL(clip);
            clipUrlRef.current = url;
            setClipSrc(url);
        },
        [commit],
    );

    const loadClip = useCallback(
        async (roundStart: DailyRoundStart) => {
            releaseClip();
            setClipFailed(false);
            setClipProgress(undefined);
            const controller = new AbortController();
            clipAbortRef.current = controller;
            try {
                const downloaded = await api.downloadRoundClip(roundStart, controller.signal, (fraction) => {
                    if (!controller.signal.aborted) setClipProgress(fraction);
                });
                if (controller.signal.aborted) return;
                if (isSealedClip(downloaded)) setSealedClip(downloaded);
                else showClip(roundStart.round, downloaded);
                // This clip is here: fetch the next one while this round plays, so it starts at once.
                api.prefetchNextClip(roundStart);
            } catch (error) {
                if (!controller.signal.aborted) failClip(error);
            }
        },
        [api, failClip, releaseClip, showClip],
    );

    // The key starts the round timer: the player asks for it only once the clip can be heard.
    const unlockClip = useCallback(async () => {
        const sealed = sealedClip;
        const controller = clipAbortRef.current;
        if (!sealed || !controller) return;
        setSealedClip(null);
        try {
            const clip = await api.unlockRoundClip(sealed, controller.signal);
            if (!controller.signal.aborted) showClip(round, clip);
        } catch (error) {
            if (!controller.signal.aborted) failClip(error);
        }
    }, [api, failClip, round, sealedClip, showClip]);

    // Start the current round (or recover when the stored progress lags behind the server).
    useEffect(() => {
        if (reveal) return;
        if (round >= total) {
            onDone();
            return;
        }
        let cancelled = false;
        setPhase("starting");
        setStart(null);
        setNotice(null);
        setErrorKind(null);
        api.startRound(run.sessionId, round)
            .then((roundStart) => {
                if (cancelled) return;
                skippedRef.current = 0;
                setStart(roundStart);
                setPhase("guessing");
                void loadClip(roundStart);
            })
            .catch((error) => {
                if (cancelled) return;
                const kind = classifyDailyError(error);
                if (kind === "conflict" && skippedRef.current === 0) {
                    // This round is already final on the server (its answer got lost): move on once.
                    skippedRef.current += 1;
                    const current = runRef.current;
                    commit({ ...current, round: round + 1, wrongGuesses: [], clipStartedAt: undefined });
                    setRound(round + 1);
                    return;
                }
                if (kind === "sessionExpired" || kind === "unauthorized") {
                    onFatal(kind);
                    return;
                }
                setErrorKind(kind);
                setPhase("error");
            });
        return () => {
            cancelled = true;
        };
        // run.sessionId is fixed for the life of this view.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [round, reveal, startAttempt]);

    // Countdown ticker while guessing.
    useEffect(() => {
        if (phase !== "guessing" && phase !== "submitting") return;
        const id = window.setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
        return () => window.clearInterval(id);
    }, [phase]);

    const timeLimitMs = (start?.timeLimitSeconds ?? tier.timeLimitSeconds) * 1000;
    const startedAt = run.round === round ? run.clipStartedAt : undefined;
    // `now` only ticks while guessing: right after a new round starts it can still predate the clip, so cap at the limit.
    const remainingMs = startedAt ? Math.min(timeLimitMs, Math.max(0, timeLimitMs - (now - startedAt))) : timeLimitMs;
    const wrongGuesses = run.round === round ? run.wrongGuesses : [];
    const strikesLeft = MAX_STRIKES - wrongGuesses.length;

    const submit = useCallback(
        async (musicId: number | null, reason: "pick" | "giveUp" | "timeout") => {
            if (submittingRef.current) return;
            submittingRef.current = true;
            setPhase("submitting");
            setNotice(null);
            const before = runRef.current;
            let result: DailyAnswerResult;
            try {
                result = await api.answer(before.sessionId, round, musicId);
            } catch (error) {
                submittingRef.current = false;
                const kind = classifyDailyError(error);
                if (kind === "sessionExpired" || kind === "unauthorized") {
                    onFatal(kind);
                    return;
                }
                if (kind === "conflict") {
                    // Already final on the server; the finish screen will show the answer.
                    commit({ ...before, round: round + 1, wrongGuesses: [], clipStartedAt: undefined });
                    setReveal({ round, outcome: "timeout", points: 0, attempts: before.wrongGuesses.length });
                    setPhase("revealed");
                    return;
                }
                setNotice({ tone: "error", text: errorText(kind) });
                setPhase("guessing");
                return;
            }
            submittingRef.current = false;
            const wrong = !result.correct && musicId !== null ? [...before.wrongGuesses, musicId] : before.wrongGuesses;
            if (!result.final) {
                commit({ ...before, totalScore: result.totalScore, combo: result.combo, wrongGuesses: wrong });
                setNotice({ tone: "warning", text: t("page.guessMusicDaily.round.wrong", { count: result.strikesLeft }) });
                setPhase("guessing");
                return;
            }
            const outcome: Outcome = result.correct
                ? "correct"
                : reason === "timeout" || (musicId !== null && result.strikesLeft > 0)
                  ? "timeout"
                  : reason === "giveUp"
                    ? "gaveUp"
                    : "missed";
            const attempts = wrong.length + (result.correct ? 1 : 0);
            commit({
                ...before,
                round: round + 1,
                totalScore: result.totalScore,
                combo: result.combo,
                wrongGuesses: [],
                clipStartedAt: undefined,
                answered: [...before.answered.filter((r) => r.round !== round), { round, correct: result.correct, points: result.points, answer: result.answer }],
            });
            setReveal({ round, outcome, points: result.points, attempts, answer: result.answer });
            setPhase("revealed");
        },
        [api, commit, errorText, onFatal, round, t],
    );

    // Time is up: give up the round so the answer is revealed.
    useEffect(() => {
        if (phase === "guessing" && startedAt && remainingMs <= 0) void submit(null, "timeout");
    }, [phase, startedAt, remainingMs, submit]);

    const next = () => {
        setReveal(null);
        releaseClip();
        setRound((r) => r + 1);
    };

    const clipSeconds = start?.clipSeconds ?? tier.clipSeconds;
    const last = round >= total - 1;
    const canGuess = phase === "guessing" && Boolean(clipSrc);
    const resetKey = `${round}:${wrongGuesses.length}`;
    const tierName = t(`page.guessMusicDaily.tiers.${tier.id}`);
    // Read out by the live region below, which stays mounted (a region inserted together with its text is often not announced).
    const announcement = reveal
        ? [
              reveal.outcome === "correct" ? t("page.guessMusicDaily.reveal.correct") : t(`page.guessMusicDaily.reveal.${reveal.outcome}`),
              t("page.guessMusicDaily.reveal.points", { points: reveal.points.toLocaleString() }),
              reveal.answer?.musicTitle ?? "",
          ]
              .filter(Boolean)
              .join(" ")
        : "";

    return (
        <Surface tone="low" radius="xl" className="flex flex-col gap-4 p-4 sm:p-6" as="section" aria-label={tierName}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Button variant="text" size="s" icon={mdArrowBack} onClick={onExit} className="-ml-2">
                        {t("page.guessMusicDaily.round.back")}
                    </Button>
                    <span
                        className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-md3-sm px-2 type-label-l",
                            run.ranked ? "bg-primary text-on-primary" : "bg-secondary-container text-on-secondary-container",
                        )}
                    >
                        <Icon path={run.ranked ? mdMilitaryTech : mdSchool} size={16} />
                        {run.ranked ? t("page.guessMusicDaily.round.rankedBadge", { tier: tierName }) : t("page.guessMusicDaily.round.practiceBadge", { tier: tierName })}
                    </span>
                    {tier.vocalRemoval ? (
                        <span className="inline-flex h-7 items-center gap-1 rounded-md3-sm bg-tertiary-container px-2 type-label-m text-on-tertiary-container">
                            <Icon path={mdMusicOff} size={16} />
                            {t("page.guessMusicDaily.tier.vocalRemoval")}
                        </span>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    {run.combo >= 2 ? (
                        <span className="inline-flex items-center gap-1 rounded-md3-sm bg-tertiary-container px-2 py-1 type-label-l text-on-tertiary-container">
                            <Icon path={mdBolt} size={16} />
                            {t("page.guessMusicDaily.round.combo", { count: run.combo })}
                        </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 rounded-md3-sm bg-primary-container px-2 py-1 type-label-l tabular-nums text-on-primary-container">
                        <Icon path={mdScoreboard} size={16} />
                        {t("page.guessMusicDaily.round.score", { score: run.totalScore.toLocaleString() })}
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                    <span className="type-title-l text-on-surface">{t("page.guessMusicDaily.round.progress", { current: Math.min(round + 1, total), total })}</span>
                    <span className="type-label-l text-on-surface-variant">{t("page.guessMusicDaily.player.clipLength", { seconds: clipSeconds })}</span>
                </div>
                <div className="flex gap-0.5 sm:gap-1" aria-hidden="true">
                    {Array.from({ length: total }, (_, i) => {
                        const done = run.answered.find((r) => r.round === i);
                        return (
                            <span
                                key={i}
                                className={cn(
                                    "h-1.5 flex-1 rounded-full",
                                    done ? (done.correct ? "bg-primary" : "bg-error") : i === round ? "bg-secondary" : "bg-surface-container-highest",
                                )}
                            />
                        );
                    })}
                </div>
            </div>

            <p className="sr-only" role="status" aria-atomic="true">
                {announcement}
            </p>
            {phase === "error" && errorKind ? (
                <Banner
                    tone="error"
                    title={errorText(errorKind)}
                    action={
                        <Button variant="text" onClick={() => setStartAttempt((n) => n + 1)}>
                            {t("page.guessMusicDaily.errors.retry")}
                        </Button>
                    }
                />
            ) : phase === "starting" ? (
                <LoadingState label={t("page.guessMusicDaily.round.starting")} className="min-h-48" />
            ) : (
                <>
                    <DailyClipPlayer
                        src={clipSrc}
                        clipSeconds={clipSeconds}
                        failed={clipFailed}
                        loadProgress={clipProgress}
                        onRetry={() => start && void loadClip(start)}
                        onUnlock={sealedClip ? () => void unlockClip() : undefined}
                        autoPlay={!reveal}
                    />
                    {reveal ? (
                        <RevealCard reveal={reveal} songs={songs} last={last} onNext={next} />
                    ) : (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-3">
                                    <span className={cn("inline-flex items-center gap-1 type-label-l tabular-nums", remainingMs <= 10_000 ? "text-error" : "text-on-surface-variant")}>
                                        <Icon path={mdSchedule} size={18} />
                                        {t("page.guessMusicDaily.round.timeLeft", { seconds: Math.ceil(remainingMs / 1000) })}
                                    </span>
                                    <span className="inline-flex items-center gap-1" aria-label={t("page.guessMusicDaily.round.strikesLeft", { count: strikesLeft })} role="img">
                                        {Array.from({ length: MAX_STRIKES }, (_, i) => (
                                            <span key={i} className={cn("h-2.5 w-2.5 rounded-full", i < strikesLeft ? "bg-primary" : "bg-surface-container-highest")} />
                                        ))}
                                    </span>
                                </div>
                                <LinearProgress value={remainingMs / timeLimitMs} tickMs={COUNTDOWN_TICK_MS} aria-label={t("page.guessMusicDaily.round.timeLeft", { seconds: Math.ceil(remainingMs / 1000) })} />
                            </div>
                            {notice ? <Banner tone={notice.tone} title={notice.text} /> : null}
                            {tier.answerMode === "choice" ? (
                                <DailyChoiceGrid songs={songs} options={start?.options ?? []} wrongIds={wrongGuesses} disabled={!canGuess} onPick={(id) => void submit(id, "pick")} />
                            ) : tier.answerMode === "type" ? (
                                <DailyTypeInput songs={songs} wrongIds={wrongGuesses} disabled={!canGuess} onPick={(id) => void submit(id, "pick")} resetKey={resetKey} />
                            ) : (
                                <DailyAnswerInput songs={songs} excludeIds={wrongGuesses} disabled={!canGuess} onPick={(id) => void submit(id, "pick")} resetKey={resetKey} />
                            )}
                            {wrongGuesses.length && tier.answerMode !== "choice" ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="type-label-m text-on-surface-variant">{t("page.guessMusicDaily.round.guessed")}</span>
                                    {wrongGuesses.map((id) => (
                                        <Chip key={id} variant="assist" icon={mdCancel} disabled>
                                            {songs.musics.get(id)?.title ?? `#${id}`}
                                        </Chip>
                                    ))}
                                </div>
                            ) : null}
                            <div className="flex justify-end">
                                <Button variant="text" icon={mdFlag} onClick={() => void submit(null, "giveUp")} disabled={phase !== "guessing"}>
                                    {t("page.guessMusicDaily.round.giveUp")}
                                </Button>
                            </div>
                        </>
                    )}
                </>
            )}
        </Surface>
    );
}

function RevealCard({ reveal, songs, last, onNext }: { reveal: RevealState; songs: DailySongData; last: boolean; onNext: () => void }) {
    const { t } = useI18n();
    const answer = reveal.answer;
    const music = answer ? songs.musics.get(answer.musicId) : undefined;
    const localized = answer ? songs.localizedTitle(answer.musicTitle) : "";
    const correct = reveal.outcome === "correct";
    const nextRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        nextRef.current?.focus({ preventScroll: true });
    }, []);
    return (
        <div className="flex flex-col gap-4">
            <div
                className={cn(
                    "flex items-center gap-2 rounded-md3-md px-4 py-3 type-title-m",
                    correct ? "bg-primary-container text-on-primary-container" : "bg-error-container text-on-error-container",
                )}
            >
                <Icon path={correct ? mdCheckCircle : mdCancel} size={22} />
                <span className="flex-1">
                    {correct
                        ? reveal.attempts > 1
                            ? t("page.guessMusicDaily.reveal.correctAfter", { attempts: reveal.attempts })
                            : t("page.guessMusicDaily.reveal.correct")
                        : t(`page.guessMusicDaily.reveal.${reveal.outcome}`)}
                </span>
                <span className="tabular-nums">{t("page.guessMusicDaily.reveal.points", { points: reveal.points.toLocaleString() })}</span>
            </div>
            {answer ? (
                <div className="flex gap-4">
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md3-md bg-surface-container-highest shadow-elev-1 sm:h-28 sm:w-28">
                        {music?.assetbundleName ? (
                            <Image src={getMusicJacketUrl(music.assetbundleName, "main-jp")} alt={answer.musicTitle} fill sizes="112px" className="object-cover" unoptimized />
                        ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="type-title-l text-on-surface">{answer.musicTitle}</span>
                        {localized && localized !== answer.musicTitle ? <span className="type-body-m text-on-surface-variant">{localized}</span> : null}
                        <span className="type-body-m text-on-surface-variant">{t("page.guessMusicDaily.reveal.vocal", { caption: songs.localizedCaption(answer.vocalCaption) })}</span>
                        <span className="type-body-m text-on-surface-variant">
                            {t("page.guessMusicDaily.reveal.clipFrom", { time: formatClock(answer.startSeconds), seconds: answer.clipSeconds })}
                        </span>
                        <Link href={`/music/${answer.musicId}`} target="_blank" className="focus-ring mt-1 inline-flex w-fit items-center gap-1 rounded-md3-sm type-label-l text-primary hover:underline">
                            {t("page.guessMusicDaily.reveal.openSong")}
                            <Icon path={mdOpenInNew} size={16} />
                        </Link>
                    </div>
                </div>
            ) : (
                <p className="type-body-m text-on-surface-variant">{t("page.guessMusicDaily.reveal.answerLater")}</p>
            )}
            <div className="flex justify-end">
                <Button ref={nextRef} variant="filled" trailingIcon={mdArrowForward} onClick={onNext}>
                    {last ? t("page.guessMusicDaily.reveal.finish") : t("page.guessMusicDaily.reveal.next")}
                </Button>
            </div>
        </div>
    );
}
