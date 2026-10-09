"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorState, LoadingState } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";
import { markSignedOut, retryMoesekaiAccount, signIn, useMoesekaiAccount } from "@/lib/moesekai-account";
import {
    DailyApiError,
    classifyDailyError,
    clearStoredRun,
    createDailyApi,
    isAbortError,
    loadStoredRun,
    pruneStoredRuns,
    saveStoredRun,
    type DailyErrorKind,
    type DailyFinishResult,
    type DailyInfo,
    type DailyMode,
    type DailySession,
    type DailyTierId,
    type StoredDailyRun,
} from "@/lib/guess-music/daily-api";
import DailyInfoCard, { type RankedAccess } from "./DailyInfoCard";
import DailyResultView from "./DailyResultView";
import DailyRoundView from "./DailyRoundView";
import { useDailySongData } from "./DailySongData";
import DailyTierCard from "./DailyTierCard";
import LeaderboardView from "./LeaderboardView";

/**
 * The daily challenge tab of /guess-music: today's four tiers, each with a
 * ranked run (StarMoe sign-in, once a day) and an unranked practice run on a
 * different question set, plus the per-tier leaderboards.
 */

type View =
    | { kind: "overview" }
    | { kind: "playing"; run: StoredDailyRun }
    | { kind: "finishing"; run: StoredDailyRun }
    | { kind: "result"; result: DailyFinishResult; alreadyPlayed: boolean };

function freshRun(session: DailySession): StoredDailyRun {
    return {
        date: session.date,
        tier: session.tier,
        mode: session.mode,
        sessionId: session.sessionId,
        ranked: session.ranked,
        rounds: session.rounds,
        round: session.resumeRound,
        totalScore: 0,
        combo: 0,
        answered: [],
        wrongGuesses: [],
    };
}

export interface DailyChallengePanelProps {
    /** A run is on screen: the page hides its tabs, so the clip and the round timer never carry on behind another tab. */
    onPlayingChange?: (playing: boolean) => void;
}

export default function DailyChallengePanel({ onPlayingChange }: DailyChallengePanelProps = {}) {
    const { t } = useI18n();
    const account = useMoesekaiAccount();
    // The session cookie rides along with every call; a 401 means it is gone, and the account follows.
    const api = useMemo(() => createDailyApi({ onUnauthorized: markSignedOut }), []);
    const songs = useDailySongData();

    const [info, setInfo] = useState<DailyInfo | null>(null);
    const [infoError, setInfoError] = useState<DailyErrorKind | null>(null);
    const [infoAttempt, setInfoAttempt] = useState(0);
    const [view, setView] = useState<View>({ kind: "overview" });
    const [pending, setPending] = useState<{ tier: DailyTierId; mode: DailyMode } | null>(null);
    const [tierError, setTierError] = useState<{ tier: DailyTierId; text: string } | null>(null);
    const [finishError, setFinishError] = useState<DailyErrorKind | null>(null);
    const [boardTier, setBoardTier] = useState<DailyTierId>("easy");
    const [boardKey, setBoardKey] = useState(0);
    // Bumped whenever this tab's stored runs change, so the tier cards re-read them.
    const [, setStoreVersion] = useState(0);
    const resetForRef = useRef<string | null>(null);
    const hasInfoRef = useRef(false);
    // The run on screen, for callbacks that must not change with every answer.
    const runRef = useRef<StoredDailyRun | null>(null);

    // Not while the song list failed to load: that screen has no way back but the tabs.
    const playing = view.kind === "playing" && !songs.error;
    useEffect(() => {
        onPlayingChange?.(playing);
    }, [playing, onPlayingChange]);
    useEffect(() => () => onPlayingChange?.(false), [onPlayingChange]);

    // "me" follows the session cookie: ask again when the account turns out signed in, or changes
    // under the page (a session found expired, a sign-in in another tab).
    const accountKey = account.status === "signed-in" ? `in:${account.user.id}` : "out";
    useEffect(() => {
        const controller = new AbortController();
        api.getInfo(controller.signal)
            .then((data) => {
                hasInfoRef.current = true;
                setInfo(data);
                setInfoError(data.ready ? null : "notReady");
                pruneStoredRuns(data.date);
                // The API answers again (say, after the retry button): an account check that failed
                // while it was down is asked again now rather than on its backoff.
                void retryMoesekaiAccount();
            })
            .catch((error) => {
                if (isAbortError(error)) return;
                // Keep showing what we have when a background refresh fails.
                if (!hasInfoRef.current) setInfoError(classifyDailyError(error));
            });
        return () => controller.abort();
    }, [api, infoAttempt, accountKey]);

    const ranked: RankedAccess = !info || account.status === "loading" ? "loading" : !info.authEnabled || account.status === "unavailable" ? "unavailable" : account.status === "signed-in" ? "ready" : "login";
    const errorText = useCallback((kind: DailyErrorKind) => t(`page.guessMusicDaily.errors.${kind}`), [t]);
    const today = info?.date ?? "";

    const saveRun = useCallback((run: StoredDailyRun) => {
        runRef.current = run;
        saveStoredRun(run);
        setView((current) => (current.kind === "playing" ? { kind: "playing", run } : current));
    }, []);

    const dropRun = useCallback((run: Pick<StoredDailyRun, "date" | "tier" | "mode">) => {
        clearStoredRun(run.date, run.tier, run.mode);
        setStoreVersion((n) => n + 1);
    }, []);

    const showResult = useCallback(
        (result: DailyFinishResult, alreadyPlayed: boolean) => {
            if (result.date && result.tier && result.mode) dropRun({ date: result.date, tier: result.tier, mode: result.mode });
            setView({ kind: "result", result, alreadyPlayed });
            setBoardTier(result.tier);
            if (result.ranked) {
                setBoardKey((n) => n + 1);
                setInfoAttempt((n) => n + 1);
            }
        },
        [dropRun],
    );

    const finish = useCallback(
        async (run: StoredDailyRun) => {
            setView({ kind: "finishing", run });
            setFinishError(null);
            try {
                showResult(await api.finish(run.sessionId), false);
            } catch (error) {
                const kind = classifyDailyError(error);
                if (kind === "sessionExpired") {
                    dropRun(run);
                    setTierError({ tier: run.tier, text: errorText(kind) });
                    setView({ kind: "overview" });
                    return;
                }
                setFinishError(kind);
            }
        },
        [api, dropRun, errorText, showResult],
    );

    const play = useCallback(
        (run: StoredDailyRun) => {
            runRef.current = run;
            saveStoredRun(run);
            setStoreVersion((n) => n + 1);
            if (run.round >= run.rounds) void finish(run);
            else setView({ kind: "playing", run });
        },
        [finish],
    );

    const start = useCallback(
        async (tier: DailyTierId, mode: DailyMode, fresh = false) => {
            if (!info || pending) return;
            if (mode === "ranked" && ranked === "login") {
                signIn();
                return;
            }
            setTierError(null);
            const saved = loadStoredRun(info.date, tier, mode);
            // A practice run kept in this tab resumes without asking the server.
            if (mode === "practice" && saved && !fresh) {
                play(saved);
                return;
            }
            setPending({ tier, mode });
            try {
                const session = await api.createSession(tier, mode);
                let run = freshRun(session);
                if (saved && saved.sessionId === session.sessionId) {
                    const sameRound = saved.round === session.resumeRound;
                    run = {
                        ...saved,
                        rounds: session.rounds,
                        round: session.resumeRound,
                        wrongGuesses: sameRound ? saved.wrongGuesses : [],
                        clipStartedAt: sameRound ? saved.clipStartedAt : undefined,
                    };
                }
                play(run);
            } catch (error) {
                if (error instanceof DailyApiError && error.code === "already_played" && error.result) {
                    showResult(error.result, true);
                } else if (classifyDailyError(error) === "tierUnavailable") {
                    // Not an error to the player: the card turns into its "still being prepared" state
                    // until the next refresh of the day's info says otherwise.
                    setInfo((current) =>
                        current ? { ...current, tiers: current.tiers.map((item) => (item.id === tier ? { ...item, available: false } : item)) } : current,
                    );
                    setView({ kind: "overview" });
                } else {
                    const kind = classifyDailyError(error);
                    if (kind === "loginRequired" || kind === "unauthorized" || kind === "rankedUnavailable") setInfoAttempt((n) => n + 1);
                    setTierError({ tier, text: errorText(kind) });
                }
            } finally {
                setPending(null);
            }
        },
        [api, errorText, info, pending, play, ranked, showResult],
    );

    const onFatal = useCallback(
        (kind: DailyErrorKind) => {
            const run = runRef.current;
            if (run) {
                dropRun(run);
                setTierError({ tier: run.tier, text: errorText(kind) });
            }
            setView({ kind: "overview" });
            setInfoAttempt((n) => n + 1);
        },
        [dropRun, errorText],
    );

    const onDone = useCallback(() => {
        const run = runRef.current;
        if (run) void finish(run);
    }, [finish]);

    const backToOverview = useCallback(() => {
        setView({ kind: "overview" });
        setStoreVersion((n) => n + 1);
        setInfoAttempt((n) => n + 1);
    }, []);

    const onReset = useCallback(() => {
        if (!info || resetForRef.current === info.nextResetAt) return;
        resetForRef.current = info.nextResetAt;
        setInfoAttempt((n) => n + 1);
    }, [info]);

    const login = useCallback(() => signIn(), []);

    if (!info) {
        if (!infoError) return <LoadingState label={t("page.guessMusicDaily.loading")} />;
    }
    if (infoError || !info) {
        const notReady = infoError === "notReady";
        return (
            <ErrorState
                title={notReady ? t("page.guessMusicDaily.errors.notReadyTitle") : t("page.guessMusicDaily.errors.loadFailed")}
                message={notReady ? t("page.guessMusicDaily.errors.notReady") : infoError === "network" ? t("page.guessMusicDaily.errors.unreachable") : errorText(infoError ?? "server")}
                retryLabel={t("page.guessMusicDaily.errors.retry")}
                onRetry={() => {
                    setInfoError(null);
                    setInfo(null);
                    setInfoAttempt((n) => n + 1);
                }}
            />
        );
    }

    const leaderboard = (
        <LeaderboardView api={api} today={info.date} tier={boardTier} onTierChange={setBoardTier} refreshKey={boardKey} canSignIn={ranked !== "unavailable"} />
    );

    if (view.kind === "playing") {
        const tier = info.tiers.find((item) => item.id === view.run.tier);
        if (songs.error) {
            return (
                <ErrorState
                    title={t("page.guessMusicDaily.errors.songsFailed")}
                    message={t("page.guessMusicDaily.errors.network")}
                    retryLabel={t("page.guessMusicDaily.errors.retry")}
                    onRetry={songs.retry}
                />
            );
        }
        if (!songs.data || !tier) return <LoadingState label={t("page.guessMusicDaily.loadingSongs")} />;
        return (
            <DailyRoundView
                key={view.run.sessionId}
                api={api}
                tier={tier}
                run={view.run}
                songs={songs.data}
                onRunChange={saveRun}
                onDone={onDone}
                onFatal={onFatal}
                onExit={backToOverview}
            />
        );
    }

    if (view.kind === "finishing") {
        if (!finishError) return <LoadingState label={t("page.guessMusicDaily.finishing")} />;
        return (
            <ErrorState
                title={t("page.guessMusicDaily.errors.finishFailed")}
                message={errorText(finishError)}
                retryLabel={t("page.guessMusicDaily.errors.retry")}
                onRetry={() => void finish(view.run)}
            />
        );
    }

    if (view.kind === "result") {
        const { result } = view;
        return (
            <div className="flex flex-col gap-4">
                <DailyResultView
                    result={result}
                    songs={songs.data}
                    alreadyPlayed={view.alreadyPlayed}
                    onBack={backToOverview}
                    onPlayAgain={result.ranked ? undefined : () => void start(result.tier, "practice", true)}
                />
                {leaderboard}
            </div>
        );
    }

    // Practice runs kept in this tab (re-read on every render: four small sessionStorage reads).
    const practiceRound = (tier: DailyTierId) => {
        const saved = loadStoredRun(today, tier, "practice");
        return saved ? Math.min(saved.round, saved.rounds - 1) : null;
    };

    return (
        <div className="flex flex-col gap-4">
            <DailyInfoCard info={info} ranked={ranked} playerName={account.user?.name} onLogin={login} onReset={onReset} />
            <div className="grid gap-4 md:grid-cols-2">
                {info.tiers.map((tier) => (
                    <DailyTierCard
                        key={tier.id}
                        tier={tier}
                        ranked={ranked}
                        status={info.me?.tiers[tier.id]}
                        practiceRound={practiceRound(tier.id)}
                        pending={pending?.tier === tier.id ? pending.mode : null}
                        busy={pending !== null}
                        error={tierError?.tier === tier.id ? tierError.text : null}
                        onStart={(mode, fresh) => void start(tier.id, mode, fresh)}
                        onLogin={login}
                    />
                ))}
            </div>
            {leaderboard}
        </div>
    );
}
