"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface BgmEntry {
    url: string;
    audio: HTMLAudioElement;
    level: number;
    failed: boolean;
    starting: boolean;
    detachError: () => void;
}

export interface StoryAudioControls {
    syncBgm: (url: string | null, level: number) => void;
    playSe: (urlOrUrls: string | readonly string[]) => void;
    playVoice: (url: string) => Promise<void>;
    stopVoice: () => void;
    stopAll: () => void;
    /** Retries starting an autoplay-blocked BGM inside a user gesture. */
    unlock: (overrideMaster?: number) => void;
    /** True while BGM should be playing but is waiting on browser autoplay unlock. */
    audioBlocked: boolean;
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

function errorName(error: unknown): string | undefined {
    if (error instanceof Error) return error.name;
    if (typeof error === "object" && error !== null && "name" in error) {
        const name = (error as { name?: unknown }).name;
        return typeof name === "string" ? name : undefined;
    }
    return undefined;
}

function errorReason(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error) return error;
    return fallback;
}

/**
 * The story player's sound: one looping BGM, one-shot SEs and one voice at a time, all through
 * HTMLAudioElement at the reader's volume. Sounds that fail to load are skipped silently (a
 * missing asset must not stop the story), while browser autoplay rejections arm a one-shot
 * user-gesture unlock so BGM starts cleanly on the reader's first tap or keypress.
 */
export function useStoryAudio(volume: number, muted: boolean): StoryAudioControls {
    const bgmRef = useRef<BgmEntry | null>(null);
    const voiceRef = useRef<HTMLAudioElement | null>(null);
    const effectsRef = useRef(new Set<HTMLAudioElement>());
    const seGenerationRef = useRef(0);
    const masterRef = useRef(muted ? 0 : clamp01(volume));
    const unlockCleanupRef = useRef<(() => void) | null>(null);
    const attemptPlayRef = useRef<(entry: BgmEntry) => void>(() => undefined);
    const [rawBlocked, setRawBlocked] = useState(false);

    const detachUnlockListeners = useCallback(() => {
        unlockCleanupRef.current?.();
        unlockCleanupRef.current = null;
    }, []);

    const armUnlockListeners = useCallback(() => {
        setRawBlocked(true);
        if (typeof window === "undefined" || unlockCleanupRef.current) return;
        const onUserGesture = () => {
            const current = bgmRef.current;
            if (!current || current.failed) {
                detachUnlockListeners();
                setRawBlocked(false);
                return;
            }
            if (clamp01(current.level * masterRef.current) <= 0) {
                detachUnlockListeners();
                return;
            }
            if (!current.audio.paused) {
                detachUnlockListeners();
                setRawBlocked(false);
                return;
            }
            attemptPlayRef.current(current);
        };
        const options: AddEventListenerOptions = { capture: true, passive: true };
        window.addEventListener("pointerdown", onUserGesture, options);
        window.addEventListener("click", onUserGesture, options);
        window.addEventListener("keydown", onUserGesture, options);
        unlockCleanupRef.current = () => {
            window.removeEventListener("pointerdown", onUserGesture, options);
            window.removeEventListener("click", onUserGesture, options);
            window.removeEventListener("keydown", onUserGesture, options);
        };
    }, [detachUnlockListeners]);

    const attemptPlayBgm = useCallback((entry: BgmEntry) => {
        if (bgmRef.current !== entry || entry.failed || entry.starting) return;
        const effective = clamp01(entry.level * masterRef.current);
        entry.audio.volume = effective;
        if (effective <= 0) {
            detachUnlockListeners();
            return;
        }
        if (!entry.audio.paused) {
            detachUnlockListeners();
            setRawBlocked(false);
            return;
        }
        entry.starting = true;
        let pending: Promise<void> | undefined;
        try {
            pending = entry.audio.play();
        } catch (error) {
            entry.starting = false;
            const name = errorName(error);
            if (name === "NotSupportedError" || entry.audio.error) {
                entry.failed = true;
                detachUnlockListeners();
                setRawBlocked(false);
            } else if (name !== "AbortError" && clamp01(entry.level * masterRef.current) > 0) {
                armUnlockListeners();
            }
            return;
        }
        if (!pending || typeof pending.then !== "function") {
            entry.starting = false;
            if (clamp01(entry.level * masterRef.current) <= 0) {
                entry.audio.pause();
            }
            detachUnlockListeners();
            setRawBlocked(false);
            return;
        }
        pending.then(
            () => {
                entry.starting = false;
                if (bgmRef.current !== entry) return;
                if (clamp01(entry.level * masterRef.current) <= 0) {
                    entry.audio.pause();
                }
                detachUnlockListeners();
                setRawBlocked(false);
            },
            (error: unknown) => {
                entry.starting = false;
                if (bgmRef.current !== entry) return;
                const name = errorName(error);
                if (name === "AbortError") return;
                if (name === "NotSupportedError" || entry.audio.error) {
                    entry.failed = true;
                    detachUnlockListeners();
                    setRawBlocked(false);
                    return;
                }
                if (clamp01(entry.level * masterRef.current) > 0) {
                    armUnlockListeners();
                }
            },
        );
    }, [armUnlockListeners, detachUnlockListeners]);

    useEffect(() => {
        attemptPlayRef.current = attemptPlayBgm;
    }, [attemptPlayBgm]);

    useEffect(() => {
        const master = muted ? 0 : clamp01(volume);
        masterRef.current = master;
        if (voiceRef.current) voiceRef.current.volume = master;
        for (const se of effectsRef.current) se.volume = master;
        const bgm = bgmRef.current;
        if (!bgm) return;
        const effective = clamp01(bgm.level * master);
        bgm.audio.volume = effective;
        if (effective <= 0) {
            detachUnlockListeners();
            if (!bgm.audio.paused) bgm.audio.pause();
        } else if (!bgm.failed && bgm.audio.paused) {
            attemptPlayBgm(bgm);
        }
    }, [volume, muted, attemptPlayBgm, detachUnlockListeners]);

    const teardownBgm = useCallback(() => {
        detachUnlockListeners();
        const bgm = bgmRef.current;
        if (!bgm) return;
        bgmRef.current = null;
        bgm.detachError();
        bgm.audio.pause();
        bgm.audio.removeAttribute("src");
    }, [detachUnlockListeners]);

    const stopBgm = useCallback(() => {
        teardownBgm();
        setRawBlocked(false);
    }, [teardownBgm]);

    /** Plays `url` as the BGM at `level` (the same BGM keeps playing; null stops it). */
    const syncBgm = useCallback((url: string | null, level: number) => {
        const current = bgmRef.current;
        const normalizedLevel = clamp01(level);
        if (!url) {
            stopBgm();
            return;
        }
        if (current?.url === url) {
            current.level = normalizedLevel;
            const effective = clamp01(normalizedLevel * masterRef.current);
            current.audio.volume = effective;
            if (effective <= 0) {
                detachUnlockListeners();
                setRawBlocked(false);
                if (!current.audio.paused) current.audio.pause();
            } else if (!current.failed && current.audio.paused) {
                attemptPlayBgm(current);
            }
            return;
        }
        teardownBgm();
        setRawBlocked(false);
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = clamp01(normalizedLevel * masterRef.current);
        const entry: BgmEntry = {
            url,
            audio,
            level: normalizedLevel,
            failed: false,
            starting: false,
            detachError: () => undefined,
        };
        const onError = () => {
            entry.failed = true;
            if (bgmRef.current === entry) {
                detachUnlockListeners();
                setRawBlocked(false);
            }
        };
        audio.addEventListener("error", onError, { once: true });
        entry.detachError = () => audio.removeEventListener("error", onError);
        bgmRef.current = entry;
        if (clamp01(normalizedLevel * masterRef.current) > 0) {
            attemptPlayBgm(entry);
        }
    }, [attemptPlayBgm, detachUnlockListeners, stopBgm, teardownBgm]);

    const playSe = useCallback((urlOrUrls: string | readonly string[]) => {
        const candidates = (typeof urlOrUrls === "string" ? [urlOrUrls] : urlOrUrls).filter(Boolean);
        if (candidates.length === 0) return;
        const generation = seGenerationRef.current;
        const tryAt = (index: number) => {
            if (seGenerationRef.current !== generation || index >= candidates.length) return;
            const audio = new Audio(candidates[index]);
            audio.volume = masterRef.current;
            effectsRef.current.add(audio);
            let settled = false;
            const cleanup = () => {
                audio.removeEventListener("ended", onEnded);
                audio.removeEventListener("error", onError);
                effectsRef.current.delete(audio);
            };
            const onEnded = () => {
                if (settled) return;
                settled = true;
                cleanup();
            };
            const onError = () => {
                if (settled) return;
                settled = true;
                cleanup();
                if (seGenerationRef.current === generation && index + 1 < candidates.length) {
                    tryAt(index + 1);
                }
            };
            audio.addEventListener("ended", onEnded, { once: true });
            audio.addEventListener("error", onError, { once: true });
            audio.play().catch((error: unknown) => {
                if (errorName(error) === "AbortError") {
                    onEnded();
                    return;
                }
                onError();
            });
        };
        tryAt(0);
    }, []);

    const stopVoice = useCallback(() => {
        voiceRef.current?.pause();
        voiceRef.current = null;
    }, []);

    /** Plays a voice line (stopping the one before); settles when it ends or fails. */
    const playVoice = useCallback((url: string): Promise<void> => {
        stopVoice();
        const audio = new Audio(url);
        audio.volume = masterRef.current;
        voiceRef.current = audio;
        return new Promise<void>((resolve) => {
            audio.addEventListener("ended", () => resolve(), { once: true });
            audio.addEventListener("error", () => resolve(), { once: true });
            audio.addEventListener("pause", () => resolve(), { once: true });
            audio.play().catch(() => resolve());
        });
    }, [stopVoice]);

    const stopAll = useCallback(() => {
        seGenerationRef.current += 1;
        stopBgm();
        stopVoice();
        for (const audio of effectsRef.current) audio.pause();
        effectsRef.current.clear();
    }, [stopBgm, stopVoice]);

    const unlock = useCallback((overrideMaster?: number) => {
        const master = overrideMaster === undefined ? masterRef.current : clamp01(overrideMaster);
        if (overrideMaster !== undefined) masterRef.current = master;
        const bgm = bgmRef.current;
        if (!bgm || bgm.failed) {
            detachUnlockListeners();
            setRawBlocked(false);
            return;
        }
        if (clamp01(bgm.level * master) > 0 && bgm.audio.paused) {
            attemptPlayBgm(bgm);
        }
    }, [attemptPlayBgm, detachUnlockListeners]);

    useEffect(() => () => {
        seGenerationRef.current += 1;
        teardownBgm();
        stopVoice();
        for (const audio of effectsRef.current) audio.pause();
        effectsRef.current.clear();
    }, [stopVoice, teardownBgm]);

    return {
        syncBgm,
        playSe,
        playVoice,
        stopVoice,
        stopAll,
        unlock,
        audioBlocked: rawBlocked && !muted && volume > 0,
    };
}

export interface PreviewSoundOptions {
    volume?: number;
    onEnd?: () => void;
    onError?: (reason: string) => void;
}

/** A one-shot preview of an asset (the pickers' and inspector's play button). */
let previewAudio: HTMLAudioElement | null = null;
let previewCleanup: (() => void) | null = null;
let previewToken = 0;

export function previewStorySound(urlOrUrls: string | readonly string[] | null, options?: PreviewSoundOptions): void {
    const token = ++previewToken;
    previewCleanup?.();
    previewCleanup = null;
    if (previewAudio) {
        previewAudio.pause();
        previewAudio.removeAttribute("src");
        previewAudio = null;
    }
    if (!urlOrUrls) return;
    const candidates = (typeof urlOrUrls === "string" ? [urlOrUrls] : urlOrUrls).filter(Boolean);
    if (candidates.length === 0) return;

    const tryAt = (index: number) => {
        if (token !== previewToken || index >= candidates.length) return;
        const audio = new Audio(candidates[index]);
        audio.volume = clamp01(options?.volume ?? 0.85);
        let settled = false;

        const detach = () => {
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("error", onMediaError);
            if (previewAudio === audio) {
                previewAudio = null;
                previewCleanup = null;
            }
        };

        const onEnded = () => {
            if (settled || token !== previewToken) return;
            settled = true;
            detach();
            options?.onEnd?.();
        };

        const failWith = (reason: string) => {
            if (settled || token !== previewToken) return;
            settled = true;
            detach();
            if (index + 1 < candidates.length) {
                tryAt(index + 1);
                return;
            }
            if (options?.onError) {
                options.onError(reason);
            } else {
                options?.onEnd?.();
            }
        };

        const onMediaError = () => {
            const code = audio.error?.code;
            const detail = audio.error?.message || (code ? `Media error (${code})` : "Audio load failed");
            failWith(detail);
        };

        audio.addEventListener("ended", onEnded, { once: true });
        audio.addEventListener("error", onMediaError, { once: true });
        previewCleanup = () => {
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("error", onMediaError);
        };
        previewAudio = audio;
        audio.play().catch((error: unknown) => {
            if (token !== previewToken || errorName(error) === "AbortError") return;
            failWith(errorReason(error, "Audio playback failed"));
        });
    };

    tryAt(0);
}
