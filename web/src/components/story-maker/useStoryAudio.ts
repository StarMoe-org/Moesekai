"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    decodeStoryAudio,
    getCachedStoryAudio,
    getSharedAudioContext,
    resumeSharedAudioContext,
} from "../../lib/storyMaker/audioCache.ts";

interface BgmEntry {
    url: string;
    audio: HTMLAudioElement;
    level: number;
    failed: boolean;
    starting: boolean;
    detachError: () => void;
}

interface ActivePlaybackHandle {
    stop: () => void;
    setVolume: (volume: number) => void;
}

interface ActiveSeEntry {
    handle: ActivePlaybackHandle;
    level: number;
}

export interface VoicePlayOptions {
    start?: number;
    end?: number;
    onProgress?: (currentSec: number, durationSec: number) => void;
}

export interface StoryAudioControls {
    syncBgm: (url: string | null, level: number) => void;
    playSe: (urlOrUrls: string | readonly string[], level?: number) => void;
    playVoice: (urlOrUrls: string | readonly string[], options?: VoicePlayOptions) => Promise<void>;
    stopVoice: () => void;
    stopAll: () => void;
    /** Retries starting an autoplay-blocked BGM inside a user gesture. */
    unlock: (overrideMaster?: number) => void;
    /** True while BGM should be playing but is waiting on browser autoplay unlock. */
    audioBlocked: boolean;
}

export interface PreviewSoundOptions {
    volume?: number;
    start?: number;
    end?: number;
    onProgress?: (currentSec: number, durationSec: number) => void;
    onEnd?: () => void;
    onError?: (reason: string) => void;
}

const ANTI_CLICK_FADE_IN_SEC = 0.01;
const ANTI_CLICK_FADE_OUT_SEC = 0.012;
const MIN_PLAY_SPAN_SEC = 0.02;

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

function normalizeCandidates(urlOrUrls: string | readonly string[] | null | undefined): string[] {
    if (!urlOrUrls) return [];
    const list = typeof urlOrUrls === "string" ? [urlOrUrls] : urlOrUrls;
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
        const trimmed = raw.trim();
        if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            out.push(trimmed);
        }
    }
    return out;
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
 * Attempts to resume the shared AudioContext without hanging indefinitely when called
 * outside a user gesture (some browsers leave `ctx.resume()` pending until interaction).
 */
async function tryResumeContextQuickly(ctx: AudioContext, timeoutMs = 120): Promise<boolean> {
    if (ctx.state === "running") return true;
    let timer: number | undefined;
    try {
        const resumed = await Promise.race<boolean>([
            resumeSharedAudioContext(),
            new Promise<boolean>((resolve) => {
                timer = window.setTimeout(() => resolve(ctx.state === "running"), timeoutMs);
            }),
        ]);
        return resumed && (ctx.state as AudioContextState) === "running";
    } finally {
        if (timer !== undefined) window.clearTimeout(timer);
    }
}

function shouldUseWebAudioForPreview(candidates: readonly string[], options?: PreviewSoundOptions): boolean {
    if (options?.start !== undefined || options?.end !== undefined || options?.onProgress !== undefined) {
        return true;
    }
    // Keep long BGM streams on HTMLAudioElement so playback starts immediately and does not evict voices from LRU cache.
    return !candidates.every(url => /\/bgm\//i.test(url));
}

/**
 * Plays a decoded `AudioBuffer` through `AudioBufferSourceNode -> GainNode -> destination`
 * with sample-accurate start/end trimming, gentle anti-click fades, and rAF progress callbacks.
 */
function startWebAudioBufferPlayback(
    ctx: AudioContext,
    buffer: AudioBuffer,
    options: {
        volume: number;
        start?: number;
        end?: number;
        onProgress?: (currentSec: number, durationSec: number) => void;
        onEnd?: () => void;
    },
): ActivePlaybackHandle {
    const duration = buffer.duration;
    const rawStart = options.start !== undefined && Number.isFinite(options.start) ? options.start : 0;
    const offset = Math.max(0, Math.min(rawStart, duration));
    const rawEnd = options.end !== undefined && Number.isFinite(options.end) ? options.end : duration;
    const endSec = Math.max(offset, Math.min(rawEnd, duration));
    const available = Math.max(0, duration - offset);
    const span = available <= 0 ? 0 : Math.min(available, Math.max(MIN_PLAY_SPAN_SEC, endSec - offset));

    if (duration <= 0 || span <= 0) {
        let cancelled = false;
        void Promise.resolve().then(() => {
            if (!cancelled) options.onEnd?.();
        });
        return {
            stop: () => { cancelled = true; },
            setVolume: () => undefined,
        };
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);

    const startedAt = ctx.currentTime;
    const targetGain = clamp01(options.volume);
    const needsFadeIn = offset > 0.001;
    const needsFadeOut = offset + span < duration - 0.001;
    const fadeInSec = needsFadeIn ? Math.min(ANTI_CLICK_FADE_IN_SEC, span * 0.35) : 0;
    const fadeOutSec = needsFadeOut ? Math.min(ANTI_CLICK_FADE_OUT_SEC, span * 0.4) : 0;

    gain.gain.cancelScheduledValues(startedAt);
    if (fadeInSec > 0) {
        gain.gain.setValueAtTime(0.0001, startedAt);
        gain.gain.linearRampToValueAtTime(targetGain, startedAt + fadeInSec);
    } else {
        gain.gain.setValueAtTime(targetGain, startedAt);
    }
    if (fadeOutSec > 0) {
        const fadeOutStart = Math.max(startedAt + fadeInSec, startedAt + span - fadeOutSec);
        gain.gain.setValueAtTime(targetGain, fadeOutStart);
        gain.gain.linearRampToValueAtTime(0.0001, startedAt + span);
    }

    let settled = false;
    let rafId: number | null = null;

    const cleanupNodes = () => {
        if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
            rafId = null;
        }
        source.onended = null;
        try {
            source.stop();
        } catch {
            // Source may already be stopped.
        }
        try {
            source.disconnect();
        } catch {
            // Ignore disconnect errors.
        }
        try {
            gain.disconnect();
        } catch {
            // Ignore disconnect errors.
        }
    };

    source.onended = () => {
        if (settled) return;
        settled = true;
        if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
            rafId = null;
        }
        try {
            source.disconnect();
            gain.disconnect();
        } catch {
            // Ignore disconnect errors.
        }
        options.onProgress?.(Math.min(duration, offset + span), duration);
        options.onEnd?.();
    };

    try {
        source.start(startedAt, offset, span);
    } catch {
        settled = true;
        cleanupNodes();
        void Promise.resolve().then(() => options.onEnd?.());
        return {
            stop: () => undefined,
            setVolume: () => undefined,
        };
    }

    if (options.onProgress) {
        const emitProgress = () => {
            if (settled) return;
            const elapsed = Math.max(0, ctx.currentTime - startedAt);
            const currentSec = Math.min(offset + span, offset + elapsed);
            options.onProgress?.(currentSec, duration);
            if (elapsed < span) {
                rafId = window.requestAnimationFrame(emitProgress);
            }
        };
        options.onProgress(offset, duration);
        rafId = window.requestAnimationFrame(emitProgress);
    }

    return {
        stop: () => {
            if (settled) return;
            settled = true;
            cleanupNodes();
        },
        setVolume: (nextVolume: number) => {
            if (settled) return;
            const nextGain = clamp01(nextVolume);
            const now = ctx.currentTime;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(nextGain, now);
            if (fadeOutSec > 0) {
                const endAt = startedAt + span;
                const fadeOutStart = endAt - fadeOutSec;
                if (fadeOutStart > now) {
                    gain.gain.setValueAtTime(nextGain, fadeOutStart);
                    gain.gain.linearRampToValueAtTime(0.0001, endAt);
                } else if (endAt > now) {
                    gain.gain.linearRampToValueAtTime(0.0001, endAt);
                }
            }
        },
    };
}

/**
 * Fallback playback through `HTMLAudioElement` with candidate-URL retries, optional
 * `start`/`end` clamping, and rAF progress tracking.
 */
function startHtmlAudioPlayback(
    candidates: readonly string[],
    options: {
        volume: number;
        start?: number;
        end?: number;
        resolveOnPause?: boolean;
        onProgress?: (currentSec: number, durationSec: number) => void;
        onEnd?: () => void;
        onError?: (reason: string) => void;
    },
): ActivePlaybackHandle {
    let stopped = false;
    let currentVolume = clamp01(options.volume);
    let activeAudio: HTMLAudioElement | null = null;
    let detachActive: (() => void) | null = null;
    let rafId: number | null = null;

    const rawStart = options.start !== undefined && Number.isFinite(options.start) ? Math.max(0, options.start) : 0;
    const rawEnd = options.end !== undefined && Number.isFinite(options.end) ? Math.max(0, options.end) : undefined;

    const cancelRaf = () => {
        if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
            rafId = null;
        }
    };

    const cleanupCurrent = () => {
        cancelRaf();
        detachActive?.();
        detachActive = null;
        if (activeAudio) {
            activeAudio.pause();
            activeAudio.removeAttribute("src");
            activeAudio = null;
        }
    };

    const tryAt = (index: number) => {
        if (stopped || index >= candidates.length) return;
        const audio = new Audio(candidates[index]);
        audio.volume = currentVolume;
        activeAudio = audio;
        let settled = false;
        let seekApplied = false;

        const computeBounds = () => {
            const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0;
            const duration = hasDuration ? audio.duration : undefined;
            const offset = duration !== undefined ? Math.min(rawStart, duration) : rawStart;
            const endSec = rawEnd !== undefined
                ? (duration !== undefined ? Math.min(rawEnd, duration) : rawEnd)
                : duration;
            return { duration, offset, endSec };
        };

        const applyInitialSeek = () => {
            if (seekApplied || rawStart <= 0) return;
            const { offset } = computeBounds();
            try {
                audio.currentTime = offset;
                seekApplied = true;
            } catch {
                // Retry once loadedmetadata fires.
            }
        };

        const detach = () => {
            cancelRaf();
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("error", onMediaError);
            audio.removeEventListener("pause", onPause);
            if (activeAudio === audio) {
                activeAudio = null;
                detachActive = null;
            }
        };

        const finishSuccess = () => {
            if (settled || stopped) return;
            settled = true;
            detach();
            audio.pause();
            audio.removeAttribute("src");
            options.onEnd?.();
        };

        const failWith = (reason: string) => {
            if (settled || stopped) return;
            settled = true;
            detach();
            audio.pause();
            audio.removeAttribute("src");
            if (index + 1 < candidates.length) {
                tryAt(index + 1);
                return;
            }
            if (options.onError) {
                options.onError(reason);
            } else {
                options.onEnd?.();
            }
        };

        const onLoadedMetadata = () => {
            if (settled || stopped) return;
            applyInitialSeek();
            const { duration, offset, endSec } = computeBounds();
            if (duration !== undefined && endSec !== undefined && endSec <= offset + 0.005) {
                finishSuccess();
            }
        };

        const onEnded = () => {
            const { duration, endSec } = computeBounds();
            if (duration !== undefined) {
                options.onProgress?.(endSec ?? duration, duration);
            }
            finishSuccess();
        };

        const onPause = () => {
            if (!options.resolveOnPause || settled || stopped) return;
            finishSuccess();
        };

        const onMediaError = () => {
            const code = audio.error?.code;
            const detail = audio.error?.message || (code ? `Media error (${code})` : "Audio load failed");
            failWith(detail);
        };

        const startProgressLoop = () => {
            if (rawEnd === undefined && !options.onProgress) return;
            const tick = () => {
                if (settled || stopped || activeAudio !== audio) return;
                const { duration, offset, endSec } = computeBounds();
                const currentSec = Math.max(offset, audio.currentTime);
                const reportDuration = duration ?? endSec ?? Math.max(currentSec, offset);
                options.onProgress?.(currentSec, reportDuration);
                if (endSec !== undefined && currentSec >= endSec) {
                    options.onProgress?.(endSec, reportDuration);
                    finishSuccess();
                    return;
                }
                rafId = window.requestAnimationFrame(tick);
            };
            cancelRaf();
            rafId = window.requestAnimationFrame(tick);
        };

        audio.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
        audio.addEventListener("ended", onEnded, { once: true });
        audio.addEventListener("error", onMediaError, { once: true });
        if (options.resolveOnPause) {
            audio.addEventListener("pause", onPause, { once: true });
        }
        detachActive = detach;

        if (audio.readyState >= 1) {
            applyInitialSeek();
        }

        audio.play().then(
            () => {
                if (settled || stopped) return;
                applyInitialSeek();
                startProgressLoop();
            },
            (error: unknown) => {
                if (stopped) return;
                if (errorName(error) === "AbortError") {
                    finishSuccess();
                    return;
                }
                failWith(errorReason(error, "Audio playback failed"));
            },
        );
    };

    tryAt(0);

    return {
        stop: () => {
            if (stopped) return;
            stopped = true;
            cleanupCurrent();
        },
        setVolume: (nextVolume: number) => {
            currentVolume = clamp01(nextVolume);
            if (activeAudio) activeAudio.volume = currentVolume;
        },
    };
}

/**
 * The story player's sound: one streaming looping BGM (via HTMLAudioElement with autoplay unlock),
 * plus sample-accurate Web Audio voice playback (supporting start/end trim and progress updates)
 * and zero-latency cached SE playback with seamless HTMLAudioElement fallback.
 */
export function useStoryAudio(volume: number, muted: boolean): StoryAudioControls {
    const bgmRef = useRef<BgmEntry | null>(null);
    const voiceHandleRef = useRef<ActivePlaybackHandle | null>(null);
    const voiceGenerationRef = useRef(0);
    const seHandlesRef = useRef(new Set<ActiveSeEntry>());
    const seControllersRef = useRef(new Set<AbortController>());
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
            void resumeSharedAudioContext();
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
        voiceHandleRef.current?.setVolume(master);
        for (const entry of seHandlesRef.current) entry.handle.setVolume(clamp01(entry.level * master));
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

    const stopSeAll = useCallback(() => {
        seGenerationRef.current += 1;
        for (const controller of seControllersRef.current) controller.abort();
        seControllersRef.current.clear();
        for (const entry of seHandlesRef.current) entry.handle.stop();
        seHandlesRef.current.clear();
    }, []);

    const playSe = useCallback((urlOrUrls: string | readonly string[], level = 1) => {
        const candidates = normalizeCandidates(urlOrUrls);
        if (candidates.length === 0) return;
        const normalizedLevel = clamp01(level);
        const generation = seGenerationRef.current;

        const registerHandle = (create: (onDone: () => void) => ActivePlaybackHandle) => {
            let entry: ActiveSeEntry | null = null;
            let done = false;
            const onDone = () => {
                done = true;
                if (entry) seHandlesRef.current.delete(entry);
            };
            const handle = create(onDone);
            if (!done) {
                entry = { handle, level: normalizedLevel };
                seHandlesRef.current.add(entry);
            }
        };

        const ctx = getSharedAudioContext();
        let cachedBuffer: AudioBuffer | null = null;
        if (ctx) {
            for (const candidate of candidates) {
                cachedBuffer = getCachedStoryAudio(candidate);
                if (cachedBuffer) break;
            }
            // Zero-latency path when SE is already decoded and AudioContext is active.
            if (cachedBuffer && ctx.state === "running") {
                const buffer = cachedBuffer;
                registerHandle(onDone => startWebAudioBufferPlayback(ctx, buffer, {
                    volume: clamp01(normalizedLevel * masterRef.current),
                    onEnd: onDone,
                }));
                return;
            }
        }

        const controller = new AbortController();
        seControllersRef.current.add(controller);

        void (async () => {
            try {
                if (ctx) {
                    const [decoded, resumed] = await Promise.all([
                        cachedBuffer
                            ? Promise.resolve({ buffer: cachedBuffer, url: candidates[0] })
                            : decodeStoryAudio(candidates, controller.signal),
                        tryResumeContextQuickly(ctx, 80),
                    ]);
                    if (seGenerationRef.current !== generation || controller.signal.aborted) return;
                    if (decoded && resumed && ctx.state === "running") {
                        registerHandle(onDone => startWebAudioBufferPlayback(ctx, decoded.buffer, {
                            volume: clamp01(normalizedLevel * masterRef.current),
                            onEnd: onDone,
                        }));
                        return;
                    }
                }
                if (seGenerationRef.current !== generation || controller.signal.aborted) return;
                registerHandle(onDone => startHtmlAudioPlayback(candidates, {
                    volume: clamp01(normalizedLevel * masterRef.current),
                    onEnd: onDone,
                    onError: () => onDone(),
                }));
            } finally {
                seControllersRef.current.delete(controller);
            }
        })();
    }, []);

    const stopVoice = useCallback(() => {
        voiceGenerationRef.current += 1;
        const current = voiceHandleRef.current;
        voiceHandleRef.current = null;
        current?.stop();
    }, []);

    /**
     * Plays a voice line (stopping the one before) with optional start/end trimming and progress;
     * settles cleanly when the clip finishes, is stopped, or fails.
     */
    const playVoice = useCallback((
        urlOrUrls: string | readonly string[],
        options?: VoicePlayOptions,
    ): Promise<void> => {
        stopVoice();
        const candidates = normalizeCandidates(urlOrUrls);
        if (candidates.length === 0) return Promise.resolve();

        const generation = voiceGenerationRef.current;
        const controller = new AbortController();

        return new Promise<void>((resolve) => {
            let settled = false;
            let activePlayback: ActivePlaybackHandle | null = null;

            const finish = () => {
                if (settled) return;
                settled = true;
                activePlayback = null;
                if (voiceHandleRef.current === handle) {
                    voiceHandleRef.current = null;
                }
                resolve();
            };

            const handle: ActivePlaybackHandle = {
                stop: () => {
                    if (settled) return;
                    controller.abort();
                    activePlayback?.stop();
                    finish();
                },
                setVolume: (nextVolume: number) => {
                    activePlayback?.setVolume(nextVolume);
                },
            };

            voiceHandleRef.current = handle;

            void (async () => {
                const ctx = getSharedAudioContext();
                if (ctx) {
                    const [decoded, resumed] = await Promise.all([
                        decodeStoryAudio(candidates, controller.signal),
                        tryResumeContextQuickly(ctx, 120),
                    ]);
                    if (settled || voiceGenerationRef.current !== generation || controller.signal.aborted) return;
                    if (decoded && resumed && ctx.state === "running") {
                        activePlayback = startWebAudioBufferPlayback(ctx, decoded.buffer, {
                            volume: masterRef.current,
                            start: options?.start,
                            end: options?.end,
                            onProgress: options?.onProgress,
                            onEnd: finish,
                        });
                        return;
                    }
                }
                if (settled || voiceGenerationRef.current !== generation || controller.signal.aborted) return;
                activePlayback = startHtmlAudioPlayback(candidates, {
                    volume: masterRef.current,
                    start: options?.start,
                    end: options?.end,
                    resolveOnPause: true,
                    onProgress: options?.onProgress,
                    onEnd: finish,
                    onError: () => finish(),
                });
            })();
        });
    }, [stopVoice]);

    const stopAll = useCallback(() => {
        stopSeAll();
        stopBgm();
        stopVoice();
    }, [stopBgm, stopSeAll, stopVoice]);

    const unlock = useCallback((overrideMaster?: number) => {
        void resumeSharedAudioContext();
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
        stopSeAll();
        teardownBgm();
        stopVoice();
    }, [stopSeAll, stopVoice, teardownBgm]);

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

/** A one-shot preview of an asset (the pickers', trim control's, and inspector's play button). */
let previewStop: (() => void) | null = null;
let previewToken = 0;

export function previewStorySound(urlOrUrls: string | readonly string[] | null, options?: PreviewSoundOptions): void {
    const token = ++previewToken;
    const prevStop = previewStop;
    previewStop = null;
    prevStop?.();

    const candidates = normalizeCandidates(urlOrUrls);
    if (candidates.length === 0) return;

    const targetVolume = clamp01(options?.volume ?? 0.85);
    const controller = new AbortController();
    let settled = false;
    let activePlayback: ActivePlaybackHandle | null = null;

    const finishEnd = () => {
        if (settled) return;
        settled = true;
        activePlayback = null;
        if (token === previewToken) previewStop = null;
        options?.onEnd?.();
    };

    const finishError = (reason: string) => {
        if (settled) return;
        settled = true;
        activePlayback = null;
        if (token === previewToken) previewStop = null;
        if (options?.onError) {
            options.onError(reason);
        } else {
            options?.onEnd?.();
        }
    };

    previewStop = () => {
        controller.abort();
        activePlayback?.stop();
        finishEnd();
    };

    const useWebAudio = shouldUseWebAudioForPreview(candidates, options);
    const ctx = useWebAudio ? getSharedAudioContext() : null;

    if (!ctx) {
        activePlayback = startHtmlAudioPlayback(candidates, {
            volume: targetVolume,
            start: options?.start,
            end: options?.end,
            onProgress: options?.onProgress,
            onEnd: finishEnd,
            onError: finishError,
        });
        return;
    }

    void (async () => {
        const [decoded, resumed] = await Promise.all([
            decodeStoryAudio(candidates, controller.signal),
            tryResumeContextQuickly(ctx, 160),
        ]);
        if (settled || token !== previewToken || controller.signal.aborted) return;
        if (decoded && resumed && ctx.state === "running") {
            activePlayback = startWebAudioBufferPlayback(ctx, decoded.buffer, {
                volume: targetVolume,
                start: options?.start,
                end: options?.end,
                onProgress: options?.onProgress,
                onEnd: finishEnd,
            });
            return;
        }
        activePlayback = startHtmlAudioPlayback(candidates, {
            volume: targetVolume,
            start: options?.start,
            end: options?.end,
            onProgress: options?.onProgress,
            onEnd: finishEnd,
            onError: finishError,
        });
    })();
}
