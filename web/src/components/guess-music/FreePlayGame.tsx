"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, LinearProgress, cn } from "@/components/md3";
import { mdBolt, mdClose, mdFavorite, mdFavoriteFill } from "@/components/md3/icons";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getMusicVocalAudioUrl } from "@/lib/assets";
import type { ClipRequest } from "@/lib/guess-music/clip-audio";
import { PracticeApiError, createPracticeClipCache, type PracticeApi, type PracticeClip } from "@/lib/guess-music/practice-api";
import {
    currentVocal,
    isVocalRemovalApplied,
    potentialScore,
    remainingMs,
    type GameAction,
    type GameState,
    type Guess,
} from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/library";
import type { RoundSpec } from "@/lib/guess-music/rounds";
import { MAX_STRIKES, comboMultiplier } from "@/lib/guess-music/scoring";
import AnswerPanel from "./AnswerPanel";
import ClipPlayer from "./ClipPlayer";
import RoundReveal from "./RoundReveal";

const TICK_MS = 100;
const NOTICE_MS = 1800;

/** Asks the server for a vocal-removal clip; one request per round and vocal, kept for the whole game. */
type CutClipFetcher = (key: string, vocalId: number, round: number) => Promise<PracticeClip>;

function clipFor(
    library: SongLibrary,
    spec: RoundSpec | undefined,
    vocalIndex: number,
    state: Pick<GameState, "gameId" | "config">,
    source: AssetSourceType,
    fetchCut: CutClipFetcher,
): ClipRequest | null {
    if (!spec) return null;
    const roundVocal = spec.vocals[vocalIndex] ?? spec.vocals[0];
    const vocal = roundVocal ? library.vocalById.get(roundVocal.vocalId) : undefined;
    const music = library.musicById.get(spec.musicId);
    if (!roundVocal || !vocal || !music) return null;
    const key = `${state.gameId}:${spec.index}:${vocal.id}`;
    const { clipSeconds, vocalRemoval } = state.config;
    if (vocalRemoval && roundVocal.hasLyrics) {
        // The server cuts the instrumental clip and picks its start; the full track never reaches the browser.
        return {
            key,
            clipSeconds,
            source: {
                kind: "cut",
                resolve: () => fetchCut(key, vocal.id, spec.index).then((clip) => ({ src: clip.clipUrl, startSeconds: clip.startSeconds })),
            },
        };
    }
    return {
        key,
        clipSeconds,
        source: {
            kind: "track",
            src: getMusicVocalAudioUrl(vocal.assetbundleName, source),
            startFraction: spec.startFraction,
            fillerSec: Number.isFinite(music.fillerSec) ? music.fillerSec : 0,
        },
    };
}

export interface FreePlayGameProps {
    state: GameState;
    dispatch: (action: GameAction) => void;
    library: SongLibrary;
    assetSource: AssetSourceType;
    /** Cuts the clips of vocal-removal rounds. */
    practiceApi: PracticeApi;
    onQuit: () => void;
}

/** The playing screen: status bar, clip player, answer panel and the reveal after each round. */
export default function FreePlayGame({ state, dispatch, library, assetSource, practiceApi, onQuit }: FreePlayGameProps) {
    const { t } = useI18n();
    const round = state.round;
    const spec = round ? state.rounds[round.index] : undefined;
    const status = round?.status ?? "waiting";
    const [now, setNow] = useState(0);
    const [notice, setNotice] = useState<string | null>(null);
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The clock only runs while the round is open: it drives the countdown and the timeout.
    useEffect(() => {
        if (status !== "guessing") return;
        const timer = setInterval(() => {
            const time = performance.now();
            setNow(time);
            dispatch({ type: "tick", now: time });
        }, TICK_MS);
        return () => clearInterval(timer);
    }, [status, dispatch]);

    useEffect(() => () => {
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
    }, []);

    const showNotice = useCallback((message: string | null) => {
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        setNotice(message);
        if (message) noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
    }, []);

    // Vocal-removal clips requested so far (clip keys carry the game id): the preload and the round share one request.
    const [cutClips] = useState(() => createPracticeClipCache(practiceApi));
    const seed = state.config.seed;
    const cutLength = state.config.clipSeconds;
    const fetchCut = useCallback<CutClipFetcher>(
        (key, vocalId, round) => cutClips.get(key, { vocalId, clipSeconds: cutLength, seed, round }),
        [cutClips, cutLength, seed],
    );
    const describeClipError = useCallback(
        (error: unknown): string | null => {
            if (!(error instanceof PracticeApiError)) return null;
            // An unknown vocal is a real failure: the round moves on to the song's next vocal.
            if (error.kind === "unknownVocal") return null;
            return t(`page.guessMusic.player.errors.${error.kind}`);
        },
        [t],
    );

    const config = state.config;
    const gameId = state.gameId;
    const clip = useMemo(
        () => (round ? clipFor(library, spec, round.vocalIndex, { gameId, config }, assetSource, fetchCut) : null),
        [library, spec, round, gameId, config, assetSource, fetchCut],
    );
    const nextSpec = round ? state.rounds[round.index + 1] : undefined;
    const nextClip = useMemo(
        () => clipFor(library, nextSpec, 0, { gameId, config }, assetSource, fetchCut),
        [library, nextSpec, gameId, config, assetSource, fetchCut],
    );

    const handleStarted = useCallback((clipStart: number) => {
        const time = performance.now();
        setNow(time);
        dispatch({ type: "clipStarted", now: time, clipStart });
    }, [dispatch]);
    const handleAudioError = useCallback(() => dispatch({ type: "audioFailed", now: performance.now() }), [dispatch]);

    const handleGuess = (guess: Guess, correct: boolean) => {
        if (!round) return;
        const time = performance.now();
        setNow(time);
        const repeated = round.guesses.some((previous) => previous.key === guess.key);
        dispatch({ type: "guess", now: time, correct, guess });
        if (!correct && !repeated && round.strikes + 1 < MAX_STRIKES) showNotice(t("page.guessMusic.hud.wrongPenalty"));
        else if (correct || round.strikes + 1 >= MAX_STRIKES) showNotice(null);
    };
    const handleGiveUp = () => {
        showNotice(null);
        dispatch({ type: "giveUp", now: performance.now() });
    };
    const handleNext = () => dispatch({ type: "next" });

    if (!round || !spec) return null;

    const limitMs = state.config.timeLimit * 1000;
    const leftMs = Math.min(limitMs, remainingMs(round, now));
    const revealed = status === "revealed";
    const result = revealed ? state.results[state.results.length - 1] : undefined;
    const potential = potentialScore(state, now);
    const streakMultiplier = comboMultiplier(state.combo);
    const removeVocals = isVocalRemovalApplied(state);
    const strikesLeft = MAX_STRIKES - round.strikes;
    const vocal = currentVocal(state);
    // Read out by the live region below, which stays mounted (a region inserted together with its text is often not announced).
    const announcement = result
        ? [
              t(`page.guessMusic.outcome.${result.outcome}`),
              result.outcome === "correct" ? t("page.guessMusic.reveal.points", { score: result.score }) : "",
              library.entryById.get(result.musicId)?.title ?? "",
          ]
              .filter(Boolean)
              .join(" ")
        : "";

    return (
        <div className="space-y-4">
            <section className="space-y-3 rounded-md3-xl bg-surface-container p-4 sm:p-5" aria-label={t("page.guessMusic.hud.status")}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="type-title-l tabular-nums text-on-surface">
                            {t("page.guessMusic.hud.round", { current: round.index + 1, total: state.rounds.length })}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="flex items-center gap-0.5" aria-label={t("page.guessMusic.hud.strikesLeft", { count: strikesLeft })} role="img">
                                {Array.from({ length: MAX_STRIKES }, (_, index) => (
                                    <Icon
                                        key={index}
                                        path={index < strikesLeft ? mdFavoriteFill : mdFavorite}
                                        size={20}
                                        className={index < strikesLeft ? "text-error" : "text-outline-variant"}
                                    />
                                ))}
                            </span>
                            {state.combo > 1 && (
                                <span className="inline-flex h-6 items-center gap-1 rounded-md3-sm bg-tertiary-container px-2 type-label-m text-on-tertiary-container">
                                    <Icon path={mdBolt} size={16} />
                                    {t("page.guessMusic.hud.combo", { count: state.combo, multiplier: streakMultiplier.toFixed(1) })}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                        <div className="text-right">
                            <div className="type-headline-s tabular-nums text-on-surface">
                                {state.score}
                                <span className="ml-1 type-label-l text-on-surface-variant">{t("page.guessMusic.hud.pointsUnit")}</span>
                            </div>
                            <div className={cn("type-label-l tabular-nums", potential > 0 ? "text-primary" : "text-on-surface-variant")}>
                                {revealed ? " " : t("page.guessMusic.hud.potential", { score: potential })}
                            </div>
                        </div>
                        <Button variant="text" color="secondary" size="xs" icon={mdClose} onClick={onQuit} className="-mr-2">
                            {t("page.guessMusic.hud.quit")}
                        </Button>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between type-label-l text-on-surface-variant">
                        <span>{status === "waiting" ? t("page.guessMusic.hud.waiting") : t("page.guessMusic.hud.timeLeft")}</span>
                        <span className={cn("tabular-nums", leftMs <= 5000 && status === "guessing" ? "text-error" : "text-on-surface")}>
                            {t("page.guessMusic.hud.seconds", { seconds: (leftMs / 1000).toFixed(1) })}
                        </span>
                    </div>
                    <LinearProgress value={limitMs > 0 ? leftMs / limitMs : 0} tickMs={TICK_MS} aria-label={t("page.guessMusic.hud.timeLeft")} />
                </div>
            </section>

            {/* Sibling keys share one namespace: prefix them so a game id never equals a round index. */}
            <ClipPlayer
                key={`player:${state.gameId}`}
                clip={clip}
                nextClip={nextClip}
                removeVocals={removeVocals}
                autoPlay={status === "waiting"}
                onStarted={handleStarted}
                onError={handleAudioError}
                describeError={describeClipError}
            />

            {notice && (
                <div role="status" className="rounded-md3-lg bg-error-container px-4 py-3 text-center type-title-s text-on-error-container">
                    {notice}
                </div>
            )}

            <p className="sr-only" role="status" aria-atomic="true">
                {announcement}
            </p>
            {revealed && result ? (
                <RoundReveal
                    key={`reveal:${state.gameId}:${result.index}`}
                    library={library}
                    result={result}
                    assetSource={assetSource}
                    isLast={round.index + 1 >= state.rounds.length}
                    onNext={handleNext}
                />
            ) : (
                <AnswerPanel
                    key={`answer:${state.gameId}:${round.index}`}
                    mode={state.config.answerMode}
                    library={library}
                    answerId={spec.musicId}
                    optionIds={spec.optionIds}
                    wrongGuesses={round.guesses}
                    enabled={status === "guessing"}
                    canGiveUp={!revealed && vocal !== null}
                    onGuess={handleGuess}
                    onGiveUp={handleGiveUp}
                    assetSource={assetSource}
                />
            )}
        </div>
    );
}
