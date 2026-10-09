"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, LinearProgress, LoadingIndicator, cn } from "@/components/md3";
import { mdGraphicEq, mdPlayArrow, mdRefresh, mdReplay, mdWarning } from "@/components/md3/icons";
import VocalRemovalBadge from "./VocalRemovalBadge";
import { useI18n } from "@/contexts/I18nContext";
import { ClipAudioEngine, ClipBlockedError, type ClipRequest } from "@/lib/guess-music/clip-audio";

/** retry: the clip could not be fetched right now (rate limit, network), but trying again may work. */
type PlayerStatus = "loading" | "blocked" | "ready" | "playing" | "ended" | "retry" | "error";

/** Seconds per progress-bar step; matches the wavy bar's own linear animation time. */
const BAR_STEP = 0.5;
/** The elapsed-time label updates in tenths of a second. */
const LABEL_STEP = 0.1;

export interface ClipPlayerProps {
    /** The clip of the current round; null hides the player content. */
    clip: ClipRequest | null;
    /** The next round's clip, preloaded once the current one is ready. */
    nextClip?: ClipRequest | null;
    /** The clip has its vocals removed (shows the badge). */
    removeVocals: boolean;
    /** Start playing as soon as the clip is ready. */
    autoPlay: boolean;
    /** Sound started (the round timer starts here). */
    onStarted: (clipStart: number) => void;
    /** The audio could not be loaded. */
    onError: () => void;
    /**
     * A message for a load failure worth retrying (the player then offers a retry
     * instead of calling onError), or null for a real failure.
     */
    describeError?: (error: unknown) => string | null;
    className?: string;
}

/**
 * Plays exactly `clipSeconds` of a song from the clip start. Autoplays when it
 * can and falls back to a play button; the clip can be replayed at will. The
 * audio stops when the player unmounts.
 */
export default function ClipPlayer({ clip, nextClip, removeVocals, autoPlay, onStarted, onError, describeError, className }: ClipPlayerProps) {
    const { t } = useI18n();
    const engineRef = useRef<ClipAudioEngine | null>(null);
    const clipKey = clip?.key ?? null;
    // State belongs to one clip: a new clip reads as loading until its own state arrives.
    const [player, setPlayer] = useState<{ key: string | null; status: PlayerStatus; progress: number; message: string | null }>({
        key: null,
        status: "loading",
        progress: 0,
        message: null,
    });
    const status: PlayerStatus = player.key === clipKey ? player.status : "loading";
    const progress = player.key === clipKey ? player.progress : 0;
    const message = player.key === clipKey ? player.message : null;
    // Bumped by the retry button: loads the same clip again.
    const [attempt, setAttempt] = useState(0);
    const latest = useRef({ onStarted, onError, describeError, autoPlay, clip });
    useEffect(() => {
        latest.current = { onStarted, onError, describeError, autoPlay, clip };
    });

    const update = useCallback((key: string, patch: Partial<{ status: PlayerStatus; progress: number; message: string | null }>) => {
        setPlayer((current) => {
            if (current.key !== key) return { key, status: "loading", progress: 0, message: null, ...patch };
            const unchanged =
                (patch.status === undefined || patch.status === current.status) &&
                (patch.progress === undefined || patch.progress === current.progress) &&
                (patch.message === undefined || patch.message === current.message);
            return unchanged ? current : { ...current, ...patch };
        });
    }, []);

    // One engine per mounted player.
    useEffect(() => {
        const engine = new ClipAudioEngine();
        const currentKey = () => latest.current.clip?.key ?? null;
        engine.setListener({
            onPlaying: (clipStart) => {
                const key = currentKey();
                if (key === null) return;
                update(key, { status: "playing" });
                latest.current.onStarted(clipStart);
            },
            onProgress: (fraction) => {
                const key = currentKey();
                const seconds = latest.current.clip?.clipSeconds ?? 0;
                if (key === null || seconds <= 0) return;
                // Tenths are plenty for the label, and keep re-renders far below the frame rate.
                const steps = seconds / LABEL_STEP;
                update(key, { progress: fraction >= 1 ? 1 : Math.floor(fraction * steps + 1e-6) / steps });
            },
            onEnded: () => {
                const key = currentKey();
                if (key !== null) update(key, { status: "ended" });
            },
        });
        engineRef.current = engine;
        return () => {
            engine.destroy();
            if (engineRef.current === engine) engineRef.current = null;
        };
    }, [update]);

    const play = useCallback(async (key: string) => {
        const engine = engineRef.current;
        if (!engine) return;
        try {
            await engine.play(key);
        } catch (error) {
            if (engineRef.current !== engine) return;
            update(key, { status: error instanceof ClipBlockedError ? "blocked" : "ready" });
        }
    }, [update]);

    useEffect(() => {
        const engine = engineRef.current;
        const request = latest.current.clip;
        if (!engine || !request || clipKey === null) return;
        let cancelled = false;
        engine.stop();
        engine.load(request).then(
            () => {
                if (cancelled) return;
                update(request.key, { status: "ready", message: null });
                if (latest.current.autoPlay) void play(request.key);
            },
            (error: Error) => {
                if (cancelled || error.name === "AbortError") return;
                const retryMessage = latest.current.describeError?.(error) ?? null;
                if (retryMessage) {
                    update(request.key, { status: "retry", message: retryMessage });
                    return;
                }
                update(request.key, { status: "error" });
                latest.current.onError();
            },
        );
        return () => {
            cancelled = true;
        };
    }, [clipKey, attempt, play, update]);

    // Preload the next round once the current clip no longer competes for bandwidth.
    const nextKey = nextClip?.key ?? null;
    const nextRef = useRef(nextClip);
    useEffect(() => {
        nextRef.current = nextClip;
    });
    // Not while the current clip waits for a retry: the next request would most likely fail the same way.
    const currentLoaded = status !== "loading" && status !== "retry";
    useEffect(() => {
        const next = nextRef.current;
        if (!currentLoaded || !next || nextKey === null) return;
        engineRef.current?.preload(next);
    }, [currentLoaded, nextKey]);

    const handlePlay = () => {
        if (!clip) return;
        if (status === "retry") {
            update(clip.key, { status: "loading", message: null });
            setAttempt((n) => n + 1);
            return;
        }
        update(clip.key, { progress: 0 });
        void play(clip.key);
    };

    // Autoplay refused or a retry needed: the button is the only way on, so give it the focus nobody else holds.
    const buttonRef = useRef<HTMLButtonElement>(null);
    const needsPress = status === "blocked" || status === "retry";
    useEffect(() => {
        if (!needsPress) return;
        const focused = document.activeElement;
        if (!focused || focused === document.body) buttonRef.current?.focus({ preventScroll: true });
    }, [needsPress]);

    const clipSeconds = clip?.clipSeconds ?? 0;
    const elapsed = Math.min(clipSeconds, progress * clipSeconds);
    const playing = status === "playing";
    const canPlay = status !== "loading" && status !== "error";
    const retry = status === "retry";
    // The bar animates linearly towards its value in BAR_STEP seconds: while playing, aim at the end
    // of the current step so it moves in step with the audio instead of trailing it.
    const bar = playing && clipSeconds > 0 ? Math.min(1, (Math.floor(elapsed / BAR_STEP + 1e-6) + 1) * BAR_STEP / clipSeconds) : progress;

    return (
        <div className={cn("flex items-center gap-4 rounded-md3-xl bg-surface-container p-4 sm:gap-5 sm:p-5", className)}>
            <div className="relative shrink-0">
                {status === "loading" ? (
                    <span className="flex h-16 w-16 items-center justify-center">
                        <LoadingIndicator size={48} aria-label={t("page.guessMusic.player.loading")} />
                    </span>
                ) : (
                    <Button
                        ref={buttonRef}
                        variant={playing ? "tonal" : "filled"}
                        size="m"
                        onClick={handlePlay}
                        disabled={!canPlay}
                        aria-label={
                            retry
                                ? t("page.guessMusic.player.retry")
                                : status === "ended" || playing
                                  ? t("page.guessMusic.player.replay")
                                  : t("page.guessMusic.player.play")
                        }
                        className={cn("h-16 w-16 px-0", status === "blocked" && "motion-safe:animate-pulse")}
                    >
                        <Icon path={playing ? mdGraphicEq : status === "ended" ? mdReplay : status === "error" ? mdWarning : retry ? mdRefresh : mdPlayArrow} size={32} />
                    </Button>
                )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="type-title-s text-on-surface" aria-live="polite">
                        {status === "loading"
                            ? t("page.guessMusic.player.loading")
                            : status === "blocked"
                              ? t("page.guessMusic.player.tapToPlay")
                              : retry
                                ? (message ?? t("page.guessMusic.player.failed"))
                                : status === "error"
                                ? t("page.guessMusic.player.failed")
                                : playing
                                  ? t("page.guessMusic.player.playing")
                                  : status === "ended"
                                    ? t("page.guessMusic.player.ended")
                                    : t("page.guessMusic.player.ready")}
                    </span>
                    <span className="type-label-l tabular-nums text-on-surface-variant">
                        {t("page.guessMusic.player.position", { elapsed: elapsed.toFixed(1), total: clipSeconds })}
                    </span>
                </div>
                <LinearProgress value={bar} wavy={playing} aria-label={t("page.guessMusic.player.progress")} />
                {removeVocals && <VocalRemovalBadge />}
            </div>
        </div>
    );
}
