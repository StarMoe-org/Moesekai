"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    Banner, Button, IconButton, LoadingIndicator, SideSheet, Slider, Surface, cn,
} from "@/components/md3";
import {
    mdAutoplay, mdClose, mdFullscreen, mdFullscreenExit, mdHistory, mdPlayArrowFill, mdReplay, mdSkipNext, mdSkipPrevious,
    mdVisibility, mdVisibilityOff, mdVolumeOff, mdVolumeUp,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetLine } from "@/lib/assets";
import { live2dSources } from "@/lib/live2dViewer/config";
import { md3EffectsFast, reducedMotionFade } from "@/lib/motion";
import { storyBgmUrl, storySeCandidateUrls, storyVoiceUrl } from "@/lib/storyMaker/assets";
import { speakerName } from "@/lib/storyMaker/document";
import { STORY_FADE_SECONDS } from "@/lib/storyMaker/limits";
import { advance, labelIndices, runFrom, type PlaybackRun } from "@/lib/storyMaker/playback";
import { INITIAL_STAGE_STATE, applyStep, stageStateAlong, type StoryStageState } from "@/lib/storyMaker/state";
import type { StoryDocument, StoryEffectColor, StoryStepOf } from "@/types/storyMaker";
import { StoryStageView } from "./StoryStageView";
import { useStoryAudio } from "./useStoryAudio";
import { useStoryModels } from "./useStoryModels";
import { useStoryStage } from "./useStoryStage";
import { useStoryUiKit } from "./useStoryUiKit";

interface PlaybackBeat {
    path: number[];
    stop: PlaybackRun["stop"];
    at: number;
    /** The choice option chosen when leaving this beat, for the backlog. */
    chosenText?: string;
}

interface BacklogEntry {
    key: string;
    kind: "talk" | "narration" | "telop" | "choice";
    speaker?: string;
    body: string;
    voiceUrl?: string;
}

interface StoryPlayerViewProps {
    doc: StoryDocument;
    line: AssetLine;
    /** Optional action rendered on the end-of-story card (e.g. Back to editor). */
    endAction?: React.ReactNode;
}

const CHAR_INTERVAL_MS = 28;

/**
 * Interactive visual-novel player for a `moesekai-story/1` document: runs step sequences with
 * Live2D stage sync, authentic 1920x1080 in-game scenario UI overlay, typewriter text, lip-flap,
 * choices, BGM/SE/voice audio, AUTO mode, seek, previous/next navigation, in-game quick menu,
 * backlog drawer, and graceful fallback without WebGPU/`stage.js`.
 */
export function StoryPlayerView({ doc, line, endAction }: StoryPlayerViewProps) {
    const { t } = useI18n();
    const reduced = useReducedMotion();
    const containerRef = useRef<HTMLDivElement>(null);

    const { models } = useStoryModels(doc.region);
    const { kit: uiKit, status: uiKitStatus } = useStoryUiKit(doc.region);
    const library = useMemo(() => live2dSources(doc.region).library, [doc.region]);
    const {
        hostRef: stageHostRef,
        phase: stagePhase,
        problems: stageProblems,
        loadingActors,
        apply: applyStage,
        setTalking: setStageTalking,
        shake: shakeStage,
        finish: finishStage,
        retry: retryStage,
    } = useStoryStage({ library, cast: doc.cast, models });

    const [volume, setVolume] = useState(0.8);
    const [muted, setMuted] = useState(false);
    const {
        syncBgm, playSe, playVoice, stopVoice, stopAll, unlock: unlockAudio, audioBlocked,
    } = useStoryAudio(volume, muted);

    const toggleMute = useCallback(() => {
        const nextMuted = !muted;
        setMuted(nextMuted);
        if (!nextMuted && volume > 0) unlockAudio(volume);
    }, [muted, unlockAudio, volume]);

    const handleVolumeChange = useCallback((next: number) => {
        setMuted(false);
        setVolume(next);
        if (next > 0) unlockAudio(next);
    }, [unlockAudio]);

    const labels = useMemo(() => labelIndices(doc), [doc]);

    const [history, setHistory] = useState<PlaybackBeat[]>([]);
    const [stageState, setStageState] = useState<StoryStageState>(INITIAL_STAGE_STATE);
    const [running, setRunning] = useState(false);
    const [autoPlay, setAutoPlay] = useState(false);
    const [uiHidden, setUiHidden] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [backlogOpen, setBacklogOpen] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [fadeSeconds, setFadeSeconds] = useState<number>(STORY_FADE_SECONDS);
    const [flash, setFlash] = useState<{ key: number; color: StoryEffectColor; seconds: number } | null>(null);
    const [typedCount, setTypedCount] = useState(0);
    const [voicePending, setVoicePending] = useState(false);

    const flashKeyRef = useRef(0);
    const playGenRef = useRef(0);
    const skipWaitRef = useRef<(() => void) | null>(null);
    const stageStateRef = useRef(stageState);
    const historyRef = useRef(history);

    useEffect(() => {
        stageStateRef.current = stageState;
    }, [stageState]);

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    const latestBeat = history[history.length - 1] ?? null;
    const currentStep = latestBeat && latestBeat.at >= 0 ? doc.steps[latestBeat.at] ?? null : null;
    const currentChoice: StoryStepOf<"choice"> | null = !running && latestBeat?.stop === "block" && currentStep?.op === "choice"
        ? currentStep
        : null;
    const fullDialogueBody = stageState.dialogue?.body ?? "";
    const isTyping = !reduced && fullDialogueBody.length > 0 && typedCount < fullDialogueBody.length;
    const displayedDialogue = stageState.dialogue
        ? (reduced ? fullDialogueBody : fullDialogueBody.slice(0, typedCount))
        : undefined;

    const waitMs = useCallback((ms: number, generation: number) => {
        if (ms <= 0 || reduced) return Promise.resolve();
        return new Promise<void>((resolve) => {
            const finish = () => {
                if (skipWaitRef.current === cancel) skipWaitRef.current = null;
                resolve();
            };
            const timer = window.setTimeout(finish, ms);
            const cancel = () => {
                window.clearTimeout(timer);
                finish();
            };
            if (playGenRef.current !== generation) {
                cancel();
                return;
            }
            skipWaitRef.current = cancel;
        });
    }, [reduced]);

    /** Plays a planned run step-by-step on top of `baseState` and appends it to `baseHistory`. */
    const executeRun = useCallback(async (
        baseHistory: PlaybackBeat[],
        baseState: StoryStageState,
        run: PlaybackRun,
        instant = false,
    ) => {
        const generation = ++playGenRef.current;
        skipWaitRef.current?.();
        stopVoice();
        setStageTalking(null);
        setVoicePending(false);

        const nextHistory: PlaybackBeat[] = [...baseHistory, { path: run.path, stop: run.stop, at: run.at }];
        setHistory(nextHistory);

        if (run.path.length === 0) {
            setRunning(false);
            setStageState(baseState);
            setTypedCount(baseState.dialogue?.body.length ?? 0);
            if (run.stop !== "block") setAutoPlay(false);
            return;
        }

        if (instant) {
            let state = baseState;
            for (const idx of run.path) {
                const step = doc.steps[idx];
                if (step) state = applyStep(state, step, doc);
            }
            setStageState(state);
            setTypedCount(state.dialogue?.body.length ?? 0);
            setRunning(false);
            syncBgm(state.bgm.name ? storyBgmUrl(state.bgm.name, doc.region, line) : null, state.bgm.volume);
            void applyStage(state, { instant: true });
            if (run.stop !== "block") setAutoPlay(false);
            return;
        }

        setRunning(true);
        let state = baseState;

        for (const idx of run.path) {
            if (playGenRef.current !== generation) return;
            const step = doc.steps[idx];
            if (!step) continue;
            state = applyStep(state, step, doc);
            setStageState(state);

            switch (step.op) {
                case "background": {
                    const seconds = step.transition === "cut" ? 0 : STORY_FADE_SECONDS;
                    setFadeSeconds(seconds);
                    if (step.transition === "black" || step.transition === "white") {
                        flashKeyRef.current += 1;
                        setFlash({ key: flashKeyRef.current, color: step.transition, seconds: STORY_FADE_SECONDS });
                    }
                    await waitMs(seconds * 1000 * 0.6, generation);
                    break;
                }
                case "appear":
                    await applyStage(state, { instant: false, fade: step.fade });
                    break;
                case "move":
                    await applyStage(state, { instant: false, moveSeconds: step.duration });
                    break;
                case "hide":
                    await applyStage(state, { instant: false, fade: step.fade });
                    break;
                case "pose":
                    await applyStage(state, { instant: false });
                    break;
                case "effect":
                    if (step.effect === "fadeIn" || step.effect === "fadeOut") {
                        setFadeSeconds(step.duration);
                        await waitMs(step.duration * 1000, generation);
                    } else if (step.effect === "flash") {
                        flashKeyRef.current += 1;
                        setFlash({ key: flashKeyRef.current, color: step.color ?? "white", seconds: step.duration });
                        await waitMs(Math.min(step.duration, 1.5) * 1000, generation);
                    } else if (step.effect === "shake") {
                        await shakeStage(step.duration);
                    } else if (step.effect === "wait") {
                        await waitMs(step.duration * 1000, generation);
                    }
                    break;
                case "bgm":
                    syncBgm(state.bgm.name ? storyBgmUrl(state.bgm.name, doc.region, line) : null, state.bgm.volume);
                    break;
                case "se":
                    if (step.name) playSe(storySeCandidateUrls(step.name, doc.region, line));
                    break;
                case "talk": {
                    void applyStage(state, { instant: false });
                    setTypedCount(reduced ? step.body.length : 0);
                    if (step.voice && step.voice.scenarioId && step.voice.voiceId) {
                        setVoicePending(true);
                        void playVoice(storyVoiceUrl(step.voice, doc.region, line)).finally(() => {
                            if (playGenRef.current === generation) setVoicePending(false);
                        });
                    }
                    break;
                }
                case "narration":
                case "telop":
                case "choice":
                    void applyStage(state, { instant: false });
                    break;
                case "place":
                case "label":
                case "jump":
                    break;
            }
        }

        if (playGenRef.current !== generation) return;
        setRunning(false);
        if (run.stop !== "block") setAutoPlay(false);
    }, [applyStage, doc, line, playSe, playVoice, reduced, setStageTalking, shakeStage, stopVoice, syncBgm, waitMs]);

    /** Start playback from step 0 when the document changes. */
    const restart = useCallback(() => {
        stopAll();
        setStageTalking(null);
        setAutoPlay(false);
        setUiHidden(false);
        setMenuOpen(false);
        if (doc.steps.length === 0) {
            playGenRef.current += 1;
            setHistory([]);
            setStageState(INITIAL_STAGE_STATE);
            setRunning(false);
            return;
        }
        const initialRun = runFrom(doc, 0, labels);
        void executeRun([], INITIAL_STAGE_STATE, initialRun);
    }, [doc, executeRun, labels, setStageTalking, stopAll]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            restart();
        }, 0);
        return () => {
            window.clearTimeout(timer);
            playGenRef.current += 1;
            skipWaitRef.current?.();
        };
    }, [restart]);

    /** Re-sync actors when the Live2D stage becomes ready or the model list finishes loading. */
    useEffect(() => {
        if (stagePhase.kind !== "ready" || !models) return;
        void applyStage(stageStateRef.current, { instant: true });
    }, [applyStage, stagePhase.kind, models]);

    /** Typewriter timer for the active dialogue line. */
    useEffect(() => {
        if (running || reduced || !stageState.dialogue) return;
        const targetLength = stageState.dialogue.body.length;
        if (typedCount >= targetLength) return;
        const timer = window.setTimeout(() => {
            setTypedCount(count => Math.min(targetLength, count + 1));
        }, CHAR_INTERVAL_MS);
        return () => window.clearTimeout(timer);
    }, [running, reduced, stageState.dialogue, typedCount]);

    /** Drive Live2D lip-flap while the line is typing or voice audio is playing. */
    useEffect(() => {
        const activeSpeaker = stageState.speaking;
        const mouthMoving = Boolean(activeSpeaker) && !running && (isTyping || voicePending);
        setStageTalking(mouthMoving ? activeSpeaker : null);
    }, [setStageTalking, stageState.speaking, running, isTyping, voicePending]);

    /** Snap any in-progress run immediately to its final beat state. */
    const snapCurrentRun = useCallback(() => {
        const current = historyRef.current;
        if (current.length === 0) return;
        playGenRef.current += 1;
        skipWaitRef.current?.();
        finishStage();
        const finalState = stageStateAlong(doc, current.flatMap(beat => beat.path));
        setStageState(finalState);
        setTypedCount(finalState.dialogue?.body.length ?? 0);
        setRunning(false);
        setVoicePending(false);
        syncBgm(finalState.bgm.name ? storyBgmUrl(finalState.bgm.name, doc.region, line) : null, finalState.bgm.volume);
        void applyStage(finalState, { instant: true });
    }, [applyStage, doc, finishStage, line, syncBgm]);

    /** Advance one beat (or complete typing / skip running transition first). */
    const handleAdvance = useCallback(() => {
        unlockAudio();
        if (menuOpen) {
            setMenuOpen(false);
            return;
        }
        if (uiHidden) {
            setUiHidden(false);
            return;
        }
        if (doc.steps.length === 0) return;
        if (running) {
            snapCurrentRun();
            return;
        }
        if (isTyping) {
            setTypedCount(fullDialogueBody.length);
            return;
        }
        const current = historyRef.current;
        const beat = current[current.length - 1];
        if (!beat || beat.stop !== "block") return;
        const step = doc.steps[beat.at];
        if (step?.op === "choice") return;
        const nextRun = advance(doc, beat.at, undefined, labels);
        void executeRun(current, stageStateRef.current, nextRun);
    }, [doc, executeRun, fullDialogueBody.length, isTyping, labels, menuOpen, running, snapCurrentRun, uiHidden, unlockAudio]);

    /** Pick an option on a choice step. */
    const handleChoose = useCallback((optionId: string, optionText: string) => {
        unlockAudio();
        const current = historyRef.current;
        const beat = current[current.length - 1];
        if (!beat || beat.stop !== "block") return;
        const annotated = current.map((item, idx) => (idx === current.length - 1 ? { ...item, chosenText: optionText } : item));
        const nextRun = advance(doc, beat.at, optionId, labels);
        void executeRun(annotated, stageStateRef.current, nextRun);
    }, [doc, executeRun, labels, unlockAudio]);

    /** Step back to the previous beat. */
    const handlePrevious = useCallback(() => {
        const current = historyRef.current;
        if (current.length <= 1) return;
        playGenRef.current += 1;
        skipWaitRef.current?.();
        stopVoice();
        setStageTalking(null);
        setAutoPlay(false);
        setVoicePending(false);
        setRunning(false);

        const nextHistory = current.slice(0, -1).map((item, idx, arr) => (
            idx === arr.length - 1 ? { ...item, chosenText: undefined } : item
        ));
        const nextState = stageStateAlong(doc, nextHistory.flatMap(beat => beat.path));
        setHistory(nextHistory);
        setStageState(nextState);
        setTypedCount(nextState.dialogue?.body.length ?? 0);
        syncBgm(nextState.bgm.name ? storyBgmUrl(nextState.bgm.name, doc.region, line) : null, nextState.bgm.volume);
        void applyStage(nextState, { instant: true });
    }, [applyStage, doc, line, setStageTalking, stopVoice, syncBgm]);

    /** Seek directly to any linear step index `0..doc.steps.length - 1`. */
    const handleSeek = useCallback((targetIndex: number) => {
        if (doc.steps.length === 0) return;
        const clamped = Math.max(0, Math.min(doc.steps.length - 1, Math.round(targetIndex)));
        playGenRef.current += 1;
        skipWaitRef.current?.();
        stopVoice();
        setStageTalking(null);
        setAutoPlay(false);
        setVoicePending(false);
        setRunning(false);

        const path = Array.from({ length: clamped + 1 }, (_, i) => i);
        const nextBeat: PlaybackBeat = { path, stop: "block", at: clamped };
        const nextState = stageStateAlong(doc, path);
        setHistory([nextBeat]);
        setStageState(nextState);
        setTypedCount(nextState.dialogue?.body.length ?? 0);
        syncBgm(nextState.bgm.name ? storyBgmUrl(nextState.bgm.name, doc.region, line) : null, nextState.bgm.volume);
        void applyStage(nextState, { instant: true });
    }, [applyStage, doc, line, setStageTalking, stopVoice, syncBgm]);

    /** AUTO-advance timer. */
    useEffect(() => {
        if (!autoPlay || running || isTyping || voicePending || backlogOpen || menuOpen || currentChoice) return;
        if (!latestBeat || latestBeat.stop !== "block") return;
        const bodyLen = stageState.dialogue?.body.length ?? stageState.narration?.body.length ?? stageState.telop?.body.length ?? 0;
        const delay = Math.max(1200, Math.min(4500, bodyLen * 60 + 800));
        const timer = window.setTimeout(() => {
            handleAdvance();
        }, delay);
        return () => window.clearTimeout(timer);
    }, [autoPlay, backlogOpen, currentChoice, handleAdvance, isTyping, latestBeat, menuOpen, running, stageState, voicePending]);

    /** Keyboard shortcuts: Space/Enter advance, arrows prev/next, 1-4 choices, Escape closes menu/UI hide. */
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (backlogOpen) return;
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
                return;
            }
            if (event.key === "Escape") {
                if (menuOpen) {
                    event.preventDefault();
                    setMenuOpen(false);
                    return;
                }
                if (uiHidden) {
                    event.preventDefault();
                    setUiHidden(false);
                    return;
                }
            }
            if (menuOpen) return;
            if (event.key === " " || event.key === "Enter") {
                if (target?.tagName === "BUTTON") return;
                event.preventDefault();
                handleAdvance();
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                handleAdvance();
            } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                handlePrevious();
            } else if (currentChoice && /^[1-4]$/.test(event.key)) {
                const option = currentChoice.options[Number(event.key) - 1];
                if (option) {
                    event.preventDefault();
                    if (uiKit?.decideSoundUrl) playSe(uiKit.decideSoundUrl);
                    handleChoose(option.id, option.text || t("page.storyMaker.player.emptyOption"));
                }
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [backlogOpen, currentChoice, handleAdvance, handleChoose, handlePrevious, menuOpen, playSe, t, uiHidden, uiKit?.decideSoundUrl]);

    /** Track fullscreen state. */
    useEffect(() => {
        const sync = () => setFullscreen(document.fullscreenElement === containerRef.current);
        document.addEventListener("fullscreenchange", sync);
        return () => document.removeEventListener("fullscreenchange", sync);
    }, []);

    const toggleFullscreen = () => {
        const el = containerRef.current;
        if (!el) return;
        if (document.fullscreenElement === el) {
            void document.exitFullscreen?.().catch(() => undefined);
        } else {
            void el.requestFullscreen?.().catch(() => undefined);
        }
    };

    const backlogEntries = useMemo<BacklogEntry[]>(() => {
        const items: BacklogEntry[] = [];
        history.forEach((beat, beatIndex) => {
            beat.path.forEach((stepIdx, pos) => {
                const step = doc.steps[stepIdx];
                if (!step) return;
                if (step.op === "talk") {
                    items.push({
                        key: `${beatIndex}-${pos}-${step.id}`,
                        kind: "talk",
                        speaker: speakerName(doc, step),
                        body: step.body,
                        voiceUrl: step.voice && step.voice.scenarioId && step.voice.voiceId
                            ? storyVoiceUrl(step.voice, doc.region, line)
                            : undefined,
                    });
                } else if (step.op === "narration") {
                    items.push({ key: `${beatIndex}-${pos}-${step.id}`, kind: "narration", body: step.body });
                } else if (step.op === "telop") {
                    items.push({ key: `${beatIndex}-${pos}-${step.id}`, kind: "telop", body: step.body });
                }
            });
            if (beat.chosenText) {
                items.push({ key: `${beatIndex}-choice`, kind: "choice", body: beat.chosenText });
            }
        });
        return items;
    }, [doc, history, line]);

    const currentStepNumber = latestBeat && latestBeat.at >= 0
        ? latestBeat.at
        : latestBeat?.path.length
            ? latestBeat.path[latestBeat.path.length - 1]
            : 0;

    const displayState: StoryStageState = uiHidden
        ? { ...stageState, place: null, dialogue: null, narration: null, telop: null }
        : stageState;

    const ended = !running && latestBeat?.stop === "end";
    const looped = !running && latestBeat?.stop === "loop";
    const emptyStory = doc.steps.length === 0;
    const showEndSign = !uiHidden && !running && !isTyping && !autoPlay && !currentChoice && Boolean(stageState.dialogue);
    const uiKitLabel = uiKitStatus === "ready"
        ? t("page.storyMaker.player.uiKitGame")
        : uiKitStatus === "loading"
            ? t("page.storyMaker.player.uiKitLoading")
            : t("page.storyMaker.player.uiKitFallback");
    const quickMenuTransition = reduced ? reducedMotionFade : md3EffectsFast;

    return (
        <div className="min-w-0 space-y-3">
            {stagePhase.kind === "unavailable" && (
                <Banner tone="info" title={t("page.storyMaker.engine.unavailable")}>
                    {t("page.storyMaker.engine.unavailableBanner")}
                </Banner>
            )}
            {stagePhase.kind === "unsupported" && (
                <Banner tone="warning" title={t("page.storyMaker.engine.unsupported")}>
                    {t("page.storyMaker.engine.unsupportedBanner")}
                </Banner>
            )}
            {looped && (
                <Banner tone="warning" title={t("page.storyMaker.player.loopTitle")}>
                    {t("page.storyMaker.player.loopDescription")}
                </Banner>
            )}

            <div
                ref={containerRef}
                className={cn(
                    "min-w-0 space-y-2",
                    fullscreen && "flex h-dvh w-full max-w-full flex-col justify-center overflow-x-hidden bg-surface p-4",
                )}
            >
                <div className={cn("relative", fullscreen && "mx-auto w-full max-w-[min(100%,calc((100dvh-7rem)*16/9))]")}>
                    <StoryStageView
                        doc={doc}
                        state={displayState}
                        line={line}
                        hostRef={stageHostRef}
                        phase={stagePhase}
                        problems={stageProblems}
                        loadingActors={loadingActors}
                        onRetry={retryStage}
                        uiKit={uiKit}
                        uiHidden={uiHidden}
                        dialogueText={uiHidden ? undefined : displayedDialogue}
                        autoPlay={autoPlay}
                        showEndSign={showEndSign}
                        choice={uiHidden ? null : currentChoice}
                        choiceInteractive={!uiHidden && Boolean(currentChoice)}
                        onChoose={handleChoose}
                        onChoiceSound={playSe}
                        showMenuButton={!uiHidden && !emptyStory}
                        menuOpen={menuOpen}
                        onMenuClick={() => setMenuOpen(open => !open)}
                        animateCinemascope
                        flash={flash}
                        fadeSeconds={fadeSeconds}
                        compactStatus
                        onClick={currentChoice || ended || emptyStory || menuOpen ? undefined : handleAdvance}
                        className={cn(!currentChoice && !ended && !emptyStory && !menuOpen && "cursor-pointer")}
                    >
                        <AnimatePresence>
                            {!uiHidden && menuOpen && (
                                <motion.div
                                    key="game-quick-menu"
                                    role="dialog"
                                    aria-modal="true"
                                    aria-label={t("page.storyMaker.player.menuTitle")}
                                    className="absolute inset-0 z-[28] flex items-center justify-center bg-scrim/45 p-2 sm:p-5"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={quickMenuTransition}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setMenuOpen(false);
                                    }}
                                >
                                    <div
                                        className="glass-thick max-h-full w-full max-w-md overflow-x-hidden overflow-y-auto rounded-md3-xl p-3 text-on-surface sm:p-4"
                                        onClick={event => event.stopPropagation()}
                                    >
                                        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate type-title-m text-on-surface">
                                                    {t("page.storyMaker.player.menuTitle")}
                                                </p>
                                                {uiKitStatus !== "idle" && (
                                                    <span className="mt-0.5 inline-flex max-w-full items-center gap-1.5 type-label-s text-on-surface-variant">
                                                        {uiKitStatus === "loading" ? (
                                                            <LoadingIndicator size={12} />
                                                        ) : (
                                                            <span
                                                                aria-hidden
                                                                className={cn(
                                                                    "inline-block size-2 shrink-0 rounded-full",
                                                                    uiKitStatus === "ready" ? "bg-primary" : "bg-outline",
                                                                )}
                                                            />
                                                        )}
                                                        <span className="truncate">{uiKitLabel}</span>
                                                    </span>
                                                )}
                                            </div>
                                            <IconButton
                                                size="s"
                                                icon={mdClose}
                                                label={t("page.storyMaker.player.menuClose")}
                                                onClick={() => setMenuOpen(false)}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
                                            <Button
                                                size="s"
                                                variant={autoPlay ? "filled" : "tonal"}
                                                selected={autoPlay}
                                                disabled={emptyStory || ended}
                                                icon={mdAutoplay}
                                                className="min-w-0 px-2.5 sm:px-3"
                                                onClick={() => setAutoPlay(on => !on)}
                                            >
                                                <span className="truncate">{t("page.storyMaker.player.auto")}</span>
                                            </Button>
                                            <Button
                                                size="s"
                                                variant="tonal"
                                                icon={mdHistory}
                                                className="min-w-0 px-2.5 sm:px-3"
                                                onClick={() => {
                                                    setMenuOpen(false);
                                                    setBacklogOpen(true);
                                                }}
                                            >
                                                <span className="truncate">{t("page.storyMaker.player.backlog")}</span>
                                            </Button>
                                            <Button
                                                size="s"
                                                variant="tonal"
                                                icon={mdVisibilityOff}
                                                className="min-w-0 px-2.5 sm:px-3"
                                                onClick={() => {
                                                    setMenuOpen(false);
                                                    setUiHidden(true);
                                                }}
                                            >
                                                <span className="truncate">{t("page.storyMaker.player.hideUi")}</span>
                                            </Button>
                                            <Button
                                                size="s"
                                                variant="tonal"
                                                icon={mdReplay}
                                                disabled={emptyStory}
                                                className="min-w-0 px-2.5 sm:px-3"
                                                onClick={() => {
                                                    setMenuOpen(false);
                                                    restart();
                                                }}
                                            >
                                                <span className="truncate">{t("page.storyMaker.player.replay")}</span>
                                            </Button>
                                            <Button
                                                size="s"
                                                variant={muted || volume === 0 ? "filled" : "tonal"}
                                                selected={muted || volume === 0}
                                                icon={muted || volume === 0 ? mdVolumeOff : mdVolumeUp}
                                                className="min-w-0 px-2.5 sm:px-3"
                                                onClick={toggleMute}
                                            >
                                                <span className="truncate">{t(muted || volume === 0 ? "page.storyMaker.player.unmute" : "page.storyMaker.player.mute")}</span>
                                            </Button>
                                            <Button
                                                size="s"
                                                variant="tonal"
                                                icon={fullscreen ? mdFullscreenExit : mdFullscreen}
                                                className="min-w-0 px-2.5 sm:px-3"
                                                onClick={() => {
                                                    setMenuOpen(false);
                                                    toggleFullscreen();
                                                }}
                                            >
                                                <span className="truncate">{t(fullscreen ? "page.storyMaker.player.exitFullscreen" : "page.storyMaker.player.fullscreen")}</span>
                                            </Button>
                                        </div>

                                        <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md3-md bg-surface-container/60 px-2.5 py-1.5 sm:px-3">
                                            <IconButton
                                                size="xs"
                                                icon={muted || volume === 0 ? mdVolumeOff : mdVolumeUp}
                                                label={t(muted ? "page.storyMaker.player.unmute" : "page.storyMaker.player.mute")}
                                                onClick={toggleMute}
                                            />
                                            <Slider
                                                min={0}
                                                max={1}
                                                step={0.05}
                                                value={muted ? 0 : volume}
                                                onValueChange={handleVolumeChange}
                                                aria-label={t("page.storyMaker.player.volume")}
                                                formatValue={val => `${Math.round(val * 100)}%`}
                                                className="h-8 min-w-0 flex-1"
                                            />
                                            <span className="w-10 shrink-0 text-right font-mono type-label-s tabular-nums text-on-surface-variant">
                                                {Math.round((muted ? 0 : volume) * 100)}%
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {!uiHidden && (ended || emptyStory) && (
                            <div
                                className="absolute inset-0 z-[25] flex items-center justify-center bg-scrim/45 p-2 sm:p-4"
                                onClick={event => event.stopPropagation()}
                            >
                                <Surface tone="high" radius="xl" elevation={2} className="flex max-h-full w-full max-w-sm flex-col items-center gap-2 overflow-y-auto p-4 text-center sm:gap-3 sm:p-6">
                                    <p className="type-title-l text-on-surface">
                                        {t(emptyStory ? "page.storyMaker.player.emptyTitle" : "page.storyMaker.player.endTitle")}
                                    </p>
                                    <p className="type-body-m text-on-surface-variant">
                                        {t(emptyStory ? "page.storyMaker.player.emptyDescription" : "page.storyMaker.player.endDescription")}
                                    </p>
                                    <div className="flex flex-wrap justify-center gap-2 pt-1">
                                        {!emptyStory && (
                                            <Button variant="filled" icon={mdReplay} onClick={restart}>
                                                {t("page.storyMaker.player.replay")}
                                            </Button>
                                        )}
                                        {endAction}
                                    </div>
                                </Surface>
                            </div>
                        )}

                        {uiHidden && (
                            <div className="absolute bottom-3 right-3 z-30">
                                <IconButton
                                    variant="tonal"
                                    icon={mdVisibility}
                                    label={t("page.storyMaker.player.showUi")}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setUiHidden(false);
                                    }}
                                />
                            </div>
                        )}
                    </StoryStageView>
                </div>

                <Surface tone="low" radius="lg" className="min-w-0 space-y-2 p-2.5 sm:p-3">
                    {doc.steps.length > 1 && (
                        <div className="flex min-w-0 items-center gap-2 px-1 sm:gap-3">
                            <Slider
                                min={0}
                                max={doc.steps.length - 1}
                                step={1}
                                value={currentStepNumber}
                                onValueChange={handleSeek}
                                aria-label={t("page.storyMaker.player.seek")}
                                formatValue={val => `${val + 1} / ${doc.steps.length}`}
                                className="h-8 min-w-0 flex-1"
                            />
                            <span className="shrink-0 font-mono type-label-m tabular-nums text-on-surface-variant">
                                {currentStepNumber + 1} / {doc.steps.length}
                            </span>
                        </div>
                    )}

                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                            <IconButton
                                size="s"
                                icon={mdSkipPrevious}
                                label={t("page.storyMaker.player.previous")}
                                disabled={history.length <= 1}
                                onClick={handlePrevious}
                            />
                            <Button
                                size="s"
                                variant="filled"
                                icon={mdSkipNext}
                                disabled={Boolean(currentChoice) || ended || emptyStory}
                                className="px-3 sm:px-4"
                                onClick={handleAdvance}
                            >
                                {t("page.storyMaker.player.next")}
                            </Button>
                            <IconButton
                                size="s"
                                icon={mdReplay}
                                label={t("page.storyMaker.player.replay")}
                                disabled={emptyStory}
                                onClick={restart}
                            />
                            <Button
                                size="s"
                                variant={autoPlay ? "filled" : "tonal"}
                                icon={mdAutoplay}
                                disabled={emptyStory || ended}
                                selected={autoPlay}
                                className="px-3 sm:px-4"
                                onClick={() => setAutoPlay(on => !on)}
                            >
                                {t("page.storyMaker.player.auto")}
                            </Button>
                        </div>

                        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                            {audioBlocked && !emptyStory && !ended && (
                                <Button
                                    size="xs"
                                    variant="tonal"
                                    icon={mdVolumeUp}
                                    onClick={() => unlockAudio()}
                                    className="max-w-full"
                                >
                                    <span className="truncate">{t("page.storyMaker.player.tapToEnableAudio")}</span>
                                </Button>
                            )}
                            <Button
                                size="s"
                                variant="text"
                                icon={mdHistory}
                                className="px-3 sm:px-4"
                                onClick={() => setBacklogOpen(true)}
                            >
                                {t("page.storyMaker.player.backlog")}
                            </Button>
                            <IconButton
                                size="s"
                                icon={uiHidden ? mdVisibility : mdVisibilityOff}
                                label={t(uiHidden ? "page.storyMaker.player.showUi" : "page.storyMaker.player.hideUi")}
                                onClick={() => {
                                    setMenuOpen(false);
                                    setUiHidden(hidden => !hidden);
                                }}
                            />
                            <div className="flex items-center gap-1">
                                <IconButton
                                    size="s"
                                    icon={muted || volume === 0 ? mdVolumeOff : mdVolumeUp}
                                    label={t(muted ? "page.storyMaker.player.unmute" : "page.storyMaker.player.mute")}
                                    onClick={toggleMute}
                                />
                                <Slider
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={muted ? 0 : volume}
                                    onValueChange={handleVolumeChange}
                                    aria-label={t("page.storyMaker.player.volume")}
                                    formatValue={val => `${Math.round(val * 100)}%`}
                                    className="hidden h-8 w-24 sm:flex"
                                />
                            </div>
                            <IconButton
                                size="s"
                                icon={fullscreen ? mdFullscreenExit : mdFullscreen}
                                label={t(fullscreen ? "page.storyMaker.player.exitFullscreen" : "page.storyMaker.player.fullscreen")}
                                onClick={toggleFullscreen}
                            />
                        </div>
                    </div>
                </Surface>
            </div>

            <SideSheet
                isOpen={backlogOpen}
                onClose={() => setBacklogOpen(false)}
                title={t("page.storyMaker.player.backlog")}
            >
                {backlogEntries.length === 0 ? (
                    <p className="py-8 text-center type-body-m text-on-surface-variant">
                        {t("page.storyMaker.player.backlogEmpty")}
                    </p>
                ) : (
                    <ol className="space-y-3">
                        {backlogEntries.map(entry => (
                            <li key={entry.key} className="min-w-0 rounded-md3-md bg-surface-container p-3">
                                <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                                    <span className="min-w-0 truncate type-label-l text-primary">
                                        {entry.kind === "talk"
                                            ? entry.speaker || "?"
                                            : entry.kind === "narration"
                                                ? t("page.storyMaker.op.narration")
                                                : entry.kind === "telop"
                                                    ? t("page.storyMaker.op.telop")
                                                    : t("page.storyMaker.player.chosenOption")}
                                    </span>
                                    {entry.voiceUrl && (
                                        <IconButton
                                            size="xs"
                                            icon={mdPlayArrowFill}
                                            label={t("page.storyMaker.player.replayVoice")}
                                            onClick={() => void playVoice(entry.voiceUrl!)}
                                        />
                                    )}
                                </div>
                                <p className="whitespace-pre-wrap break-words type-body-m text-on-surface">{entry.body}</p>
                            </li>
                        ))}
                    </ol>
                )}
            </SideSheet>
        </div>
    );
}
