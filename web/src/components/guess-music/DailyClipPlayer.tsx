"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, IconButton, LinearProgress, cn } from "@/components/md3";
import { mdGraphicEq, mdPlayArrow, mdRefresh, mdReplay, mdStop } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { formatClock } from "@/lib/guess-music/rounds";

interface DailyClipPlayerProps {
    /** Object URL of the pre-cut clip; null while it loads. */
    src: string | null;
    clipSeconds: number;
    failed?: boolean;
    /** How much of the clip has downloaded (0-1) while it loads; absent when unknown. */
    loadProgress?: number;
    onRetry?: () => void;
    /** Start playing as soon as the clip is ready (falls back to a button when the browser blocks it). */
    autoPlay?: boolean;
    /**
     * Set while the clip is downloaded but sealed. Its key starts the round timer, so this is called
     * only once the page may play sound: right away when the browser allows it, else on the player's tap.
     */
    onUnlock?: () => void;
    className?: string;
}

/** 10 ms of silence: playing it tells whether the page may play sound, and a tap that plays it lets this element play later. */
const SILENCE = "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

/**
 * A minimal player for the server-cut daily clip: always plays from 0,
 * shows progress, and offers replay.
 */
export default function DailyClipPlayer({ src, clipSeconds, failed, loadProgress, onRetry, autoPlay = true, onUnlock, className }: DailyClipPlayerProps) {
    const { t } = useI18n();
    const audioRef = useRef<HTMLAudioElement>(null);
    const frameRef = useRef<number | null>(null);
    const [playing, setPlaying] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(clipSeconds);

    // Smooth progress while playing.
    useEffect(() => {
        if (!playing) return;
        const step = () => {
            const audio = audioRef.current;
            if (audio) setPosition(audio.currentTime);
            frameRef.current = requestAnimationFrame(step);
        };
        frameRef.current = requestAnimationFrame(step);
        return () => {
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        };
    }, [playing]);

    const play = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio || !audio.src) return;
        audio.currentTime = 0;
        try {
            await audio.play();
            setBlocked(false);
        } catch (error) {
            if ((error as { name?: string })?.name === "NotAllowedError") setBlocked(true);
        }
    }, []);

    const stop = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
        setPosition(0);
    }, []);

    // A new clip starts from a clean slate.
    const [prevSrc, setPrevSrc] = useState(src);
    if (prevSrc !== src) {
        setPrevSrc(src);
        setPosition(0);
        setPlaying(false);
        setBlocked(false);
    }

    // Read at load time only: turning autoplay off (the round was revealed) must not restart the clip.
    const autoPlayRef = useRef(autoPlay);
    useEffect(() => {
        autoPlayRef.current = autoPlay;
    }, [autoPlay]);

    /** Plays the silence on this element; resolves false when the browser wants a tap first. */
    const playSilence = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) return false;
        audio.src = SILENCE;
        try {
            await audio.play();
            return true;
        } catch (error) {
            return (error as { name?: string })?.name !== "NotAllowedError";
        } finally {
            audio.pause();
        }
    }, []);

    const unlockRef = useRef(onUnlock);
    useEffect(() => {
        unlockRef.current = onUnlock;
    }, [onUnlock]);
    const locked = Boolean(onUnlock) && !src && !failed;

    // A sealed clip is opened as soon as this element may play: autoplay allowed, or a tap already let it.
    useEffect(() => {
        if (!locked) return;
        let cancelled = false;
        void playSilence().then((allowed) => {
            if (cancelled) return;
            if (allowed) unlockRef.current?.();
            else setBlocked(true);
        });
        return () => {
            cancelled = true;
        };
    }, [locked, playSilence]);

    // In the tap itself: playing the silence there lets this element play the clip once its key is in.
    const unlockByTap = () => {
        setBlocked(false);
        void playSilence();
        unlockRef.current?.();
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (!src) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
            return;
        }
        audio.src = src;
        audio.load();
        if (autoPlayRef.current) {
            audio.play().catch((error: { name?: string }) => {
                if (error?.name === "NotAllowedError") setBlocked(true);
            });
        }
        return () => {
            audio.pause();
        };
    }, [src]);

    // The silence is not the clip: its events, which can arrive after playSilence returns, leave the controls alone.
    const isSilence = () => audioRef.current?.getAttribute("src") === SILENCE;
    const onPlay = () => {
        if (isSilence()) return;
        setPlaying(true);
        setBlocked(false);
    };
    const onPause = () => {
        if (isSilence()) return;
        setPlaying(false);
        const audio = audioRef.current;
        if (audio) setPosition(audio.currentTime);
    };
    const onEnded = () => {
        if (isSilence()) return;
        setPlaying(false);
        setPosition(duration);
    };

    const total = duration > 0 ? duration : clipSeconds;
    const ready = Boolean(src) && !failed;
    // Downloaded and only waiting for the tap: nothing is loading any more.
    const waitingForTap = locked && blocked;

    return (
        <div className={cn("flex flex-col gap-3 rounded-md3-lg bg-surface-container-high p-4", className)}>
            <audio
                ref={audioRef}
                preload="auto"
                onPlay={onPlay}
                onPause={onPause}
                onEnded={onEnded}
                // load() stops playback without a pause event.
                onEmptied={() => setPlaying(false)}
                onLoadedMetadata={(e) => {
                    const value = e.currentTarget.duration;
                    if (!isSilence() && Number.isFinite(value) && value > 0) setDuration(value);
                }}
            />
            <div className="flex items-center gap-3">
                {failed ? (
                    <Button variant="tonal" icon={mdRefresh} onClick={onRetry}>
                        {t("page.guessMusicDaily.player.retry")}
                    </Button>
                ) : playing ? (
                    <IconButton icon={mdStop} variant="filled" size="m" label={t("page.guessMusicDaily.player.stop")} onClick={stop} />
                ) : (
                    <IconButton
                        icon={position > 0 ? mdReplay : mdPlayArrow}
                        variant="filled"
                        size="m"
                        label={position > 0 ? t("page.guessMusicDaily.player.replay") : t("page.guessMusicDaily.player.play")}
                        onClick={() => void play()}
                        disabled={!ready}
                    />
                )}
                <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 type-label-l text-on-surface">
                            <Icon path={mdGraphicEq} size={18} className={cn("shrink-0", playing ? "text-primary" : "text-on-surface-variant")} />
                            <span className="truncate">
                                {failed
                                    ? t("page.guessMusicDaily.player.loadFailed")
                                    : !src && !waitingForTap
                                      ? t("page.guessMusicDaily.player.loading")
                                      : t("page.guessMusicDaily.player.clipLength", { seconds: clipSeconds })}
                            </span>
                        </span>
                        <span className="shrink-0 type-label-m tabular-nums text-on-surface-variant">
                            {formatClock(position)} / {formatClock(total)}
                        </span>
                    </div>
                    {src || failed || waitingForTap ? (
                        <LinearProgress
                            value={total > 0 ? Math.min(1, position / total) : 0}
                            aria-label={t("page.guessMusicDaily.player.progress")}
                            // Updated every frame while playing: no easing lag behind the audio.
                            className="[&>span]:transition-none"
                        />
                    ) : (
                        <LinearProgress value={loadProgress} aria-label={t("page.guessMusicDaily.player.loading")} />
                    )}
                </div>
                {ready && playing && (
                    <IconButton icon={mdReplay} variant="standard" label={t("page.guessMusicDaily.player.replay")} onClick={() => void play()} />
                )}
            </div>
            {blocked && locked && (
                <Button variant="filled" icon={mdPlayArrow} onClick={unlockByTap} fullWidth>
                    {t("page.guessMusicDaily.player.tapToStart")}
                </Button>
            )}
            {blocked && ready && (
                <Button variant="filled" icon={mdPlayArrow} onClick={() => void play()} fullWidth>
                    {t("page.guessMusicDaily.player.tapToPlay")}
                </Button>
            )}
        </div>
    );
}
