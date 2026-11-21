"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button, Icon, LinearProgress, TextField, cn } from "@/components/md3";
import { mdContentCut, mdPlayArrowFill, mdRestartAlt, mdStopFill } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { decodeStoryAudio, extractWaveformPeaks } from "@/lib/storyMaker/audioCache";
import { STORY_LIMITS } from "@/lib/storyMaker/limits";
import { previewStorySound } from "./useStoryAudio";

export interface VoiceTrimControlProps {
    urls: readonly string[];
    start?: number;
    end?: number;
    onChange: (next: { start?: number; end?: number }) => void;
    disabled?: boolean;
}

type WaveformState =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; duration: number; peaks: number[] };

const LOADING_STATE: WaveformState = { status: "loading" };
const ERROR_STATE: WaveformState = { status: "error" };
const WAVEFORM_BUCKETS = 72;
const EDGE_EPSILON = 0.005;

function roundSec(value: number): number {
    return Math.round(value * 100) / 100;
}

function formatSec(value: number): string {
    return value.toFixed(2);
}

/**
 * Interactive waveform voice-trim editor for `talk` steps: renders decoded audio peaks on an
 * MD3-themed HiDPI canvas with pointer- and keyboard-accessible Start/End trim handles,
 * live playhead indicator during preview, and precise numeric second inputs.
 */
export function VoiceTrimControl({
    urls,
    start,
    end,
    onChange,
    disabled = false,
}: VoiceTrimControlProps) {
    const { t } = useI18n();
    const urlsKey = urls.join("|");
    const urlsList = useMemo(() => (urlsKey ? urlsKey.split("|") : []), [urlsKey]);

    const [loaded, setLoaded] = useState<{ key: string; state: WaveformState } | null>(null);
    const [playingKey, setPlayingKey] = useState<string | null>(null);
    const [playheadSec, setPlayheadSec] = useState<number | null>(null);
    const [previewErrorKey, setPreviewErrorKey] = useState<string | null>(null);
    const [draggingHandle, setDraggingHandle] = useState<"start" | "end" | null>(null);
    const [themeTick, setThemeTick] = useState(0);
    const [canvasBox, setCanvasBox] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [editingField, setEditingField] = useState<"start" | "end" | null>(null);
    const [draftText, setDraftText] = useState("");

    const trackRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activePreviewTokenRef = useRef(0);
    const owningPreviewRef = useRef(false);

    const playing = playingKey === urlsKey;
    const activePlayheadSec = playing ? playheadSec : null;
    const previewError = previewErrorKey === urlsKey;

    // Decode waveform peaks when the candidate URLs change.
    useEffect(() => {
        if (urlsList.length === 0) return;
        const controller = new AbortController();
        decodeStoryAudio(urlsList, controller.signal).then(
            (decoded) => {
                if (controller.signal.aborted) return;
                if (!decoded || decoded.buffer.duration <= 0) {
                    setLoaded({ key: urlsKey, state: { status: "error" } });
                    return;
                }
                const peaks = extractWaveformPeaks(decoded.buffer, WAVEFORM_BUCKETS);
                setLoaded({
                    key: urlsKey,
                    state: {
                        status: "ready",
                        duration: decoded.buffer.duration,
                        peaks,
                    },
                });
            },
            () => {
                if (!controller.signal.aborted) {
                    setLoaded({ key: urlsKey, state: { status: "error" } });
                }
            },
        );
        return () => controller.abort();
    }, [urlsKey, urlsList]);

    // Stop trim preview owned by this control when the clip changes or on unmount.
    useEffect(() => () => {
        if (owningPreviewRef.current) {
            owningPreviewRef.current = false;
            activePreviewTokenRef.current += 1;
            previewStorySound(null);
        }
    }, [urlsKey]);

    // Redraw canvas automatically when MD3 light/dark mode or character theme seed changes.
    useEffect(() => {
        if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
        const observer = new MutationObserver(() => {
            setThemeTick(tick => tick + 1);
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme", "data-seed", "class", "style"],
        });
        return () => observer.disconnect();
    }, []);

    const waveformState: WaveformState = urlsList.length === 0
        ? ERROR_STATE
        : loaded?.key === urlsKey
            ? loaded.state
            : LOADING_STATE;

    const duration = waveformState.status === "ready" ? waveformState.duration : null;
    const maxBound = duration !== null
        ? Math.min(duration, STORY_LIMITS.voiceTrimMax)
        : STORY_LIMITS.voiceTrimMax;
    const minSpan = duration !== null
        ? Math.min(STORY_LIMITS.voiceTrimMinSpan, Math.max(0.01, duration))
        : STORY_LIMITS.voiceTrimMinSpan;

    // Observe track size so the canvas stays razor-sharp across responsive panel resizes.
    useEffect(() => {
        const track = trackRef.current;
        if (!track || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (!rect) return;
            const width = Math.max(0, Math.round(rect.width));
            const height = Math.max(0, Math.round(rect.height));
            setCanvasBox(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
        });
        observer.observe(track);
        return () => observer.disconnect();
    }, [waveformState.status]);

    const effectiveStart = start !== undefined && Number.isFinite(start)
        ? Math.max(0, Math.min(start, maxBound))
        : 0;
    const effectiveEnd = end !== undefined && Number.isFinite(end)
        ? Math.max(effectiveStart, Math.min(end, maxBound))
        : (duration ?? maxBound);

    const startRatio = duration && duration > 0 ? Math.min(1, Math.max(0, effectiveStart / duration)) : 0;
    const endRatio = duration && duration > 0 ? Math.min(1, Math.max(startRatio, effectiveEnd / duration)) : 1;
    const hasTrim = start !== undefined || end !== undefined;

    const emitNormalized = useCallback((rawStart: number | undefined, rawEnd: number | undefined) => {
        const cleanStart = rawStart !== undefined && Number.isFinite(rawStart)
            ? roundSec(Math.max(0, Math.min(rawStart, maxBound)))
            : undefined;
        const cleanEnd = rawEnd !== undefined && Number.isFinite(rawEnd)
            ? roundSec(Math.max(0, Math.min(rawEnd, maxBound)))
            : undefined;

        const normalizedStart = cleanStart !== undefined && cleanStart > EDGE_EPSILON ? cleanStart : undefined;
        const normalizedEnd = cleanEnd !== undefined && (duration === null || cleanEnd < duration - EDGE_EPSILON)
            ? cleanEnd
            : undefined;

        onChange({ start: normalizedStart, end: normalizedEnd });
    }, [duration, maxBound, onChange]);

    const updateStartSec = useCallback((candidate: number) => {
        const upperLimit = Math.max(0, (end !== undefined ? Math.min(end, maxBound) : maxBound) - minSpan);
        const clamped = roundSec(Math.max(0, Math.min(candidate, upperLimit)));
        emitNormalized(clamped, end);
    }, [emitNormalized, end, maxBound, minSpan]);

    const updateEndSec = useCallback((candidate: number) => {
        const lowerLimit = Math.min(maxBound, (start !== undefined ? Math.max(0, start) : 0) + minSpan);
        const clamped = roundSec(Math.max(lowerLimit, Math.min(candidate, maxBound)));
        emitNormalized(start, clamped);
    }, [emitNormalized, maxBound, minSpan, start]);

    // Draw HiDPI waveform + active trim region + live playhead on canvas.
    useEffect(() => {
        if (waveformState.status !== "ready") return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const width = canvasBox.width || canvas.clientWidth;
        const height = canvasBox.height || canvas.clientHeight;
        if (width <= 0 || height <= 0) return;

        const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
        const targetW = Math.round(width * dpr);
        const targetH = Math.round(height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const styles = window.getComputedStyle(canvas);
        const fallbackColor = styles.color;
        const primary = styles.getPropertyValue("--md-sys-color-primary").trim() || fallbackColor;
        const primaryContainer = styles.getPropertyValue("--md-sys-color-primary-container").trim() || primary;
        const outlineVariant = styles.getPropertyValue("--md-sys-color-outline-variant").trim() || fallbackColor;
        const tertiary = styles.getPropertyValue("--md-sys-color-tertiary").trim() || primary;
        const scrim = styles.getPropertyValue("--md-sys-color-scrim").trim() || outlineVariant;

        const startX = startRatio * width;
        const endX = endRatio * width;

        // Subtle highlight for the active playback span.
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = primaryContainer;
        ctx.fillRect(startX, 0, Math.max(0, endX - startX), height);

        // Dimmed masks outside the active trim range.
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = scrim;
        if (startX > 0) ctx.fillRect(0, 0, startX, height);
        if (endX < width) ctx.fillRect(endX, 0, width - endX, height);

        // Center baseline.
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = outlineVariant;
        ctx.fillRect(0, Math.floor(height / 2), width, 1);

        // Waveform peak bars.
        const peaks = waveformState.peaks;
        const count = peaks.length;
        const slotW = width / count;
        const barW = Math.max(1.5, Math.min(4, slotW * 0.62));
        const maxBarH = Math.max(8, height - 12);
        const centerY = height / 2;

        for (let i = 0; i < count; i++) {
            const centerX = (i + 0.5) * slotW;
            const inRange = centerX >= startX - 0.5 && centerX <= endX + 0.5;
            const barH = Math.max(3, peaks[i] * maxBarH);
            const x = centerX - barW / 2;
            const y = centerY - barH / 2;
            const radius = Math.min(barW / 2, barH / 2);

            ctx.globalAlpha = inRange ? 0.92 : 0.45;
            ctx.fillStyle = inRange ? primary : outlineVariant;
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
                ctx.roundRect(x, y, barW, barH, radius);
            } else {
                ctx.rect(x, y, barW, barH);
            }
            ctx.fill();
        }

        // Trim boundary markers.
        ctx.globalAlpha = 1;
        ctx.fillStyle = primary;
        ctx.fillRect(Math.max(0, startX - 1), 0, 2, height);
        ctx.fillRect(Math.min(width - 2, Math.max(0, endX - 1)), 0, 2, height);

        // Live moving playhead cursor during preview.
        if (activePlayheadSec !== null && waveformState.duration > 0) {
            const ratio = Math.min(1, Math.max(0, activePlayheadSec / waveformState.duration));
            const px = Math.min(width - 1, Math.max(1, ratio * width));
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = tertiary;
            ctx.fillRect(px - 1, 0, 2, height);
            ctx.beginPath();
            ctx.arc(px, 4, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }, [waveformState, canvasBox, startRatio, endRatio, activePlayheadSec, themeTick]);

    const clientXToSeconds = useCallback((clientX: number): number | null => {
        const track = trackRef.current;
        if (!track || duration === null || duration <= 0) return null;
        const rect = track.getBoundingClientRect();
        if (rect.width <= 0) return null;
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        return ratio * duration;
    }, [duration]);

    const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (disabled || duration === null || duration <= 0) return;
        const sec = clientXToSeconds(event.clientX);
        if (sec === null) return;
        const distStart = Math.abs(sec - effectiveStart);
        const distEnd = Math.abs(sec - effectiveEnd);
        const chosen: "start" | "end" = distStart <= distEnd ? "start" : "end";
        event.currentTarget.setPointerCapture(event.pointerId);
        setDraggingHandle(chosen);
        if (chosen === "start") updateStartSec(sec);
        else updateEndSec(sec);
    };

    const handleHandlePointerDown = (which: "start" | "end", event: PointerEvent<HTMLButtonElement>) => {
        if (disabled || duration === null || duration <= 0) return;
        event.stopPropagation();
        const track = trackRef.current;
        if (track) track.setPointerCapture(event.pointerId);
        setDraggingHandle(which);
    };

    const handleTrackPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!draggingHandle || disabled) return;
        const sec = clientXToSeconds(event.clientX);
        if (sec === null) return;
        if (draggingHandle === "start") updateStartSec(sec);
        else updateEndSec(sec);
    };

    const handleTrackPointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (!draggingHandle) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setDraggingHandle(null);
    };

    const handleHandleKeyDown = (which: "start" | "end", event: KeyboardEvent<HTMLButtonElement>) => {
        if (disabled || duration === null || duration <= 0) return;
        const step = event.shiftKey ? 0.25 : 0.05;
        let next: number | null = null;
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            next = (which === "start" ? effectiveStart : effectiveEnd) - step;
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            next = (which === "start" ? effectiveStart : effectiveEnd) + step;
        } else if (event.key === "Home") {
            next = which === "start" ? 0 : effectiveStart + minSpan;
        } else if (event.key === "End") {
            next = which === "start" ? effectiveEnd - minSpan : maxBound;
        }
        if (next === null) return;
        event.preventDefault();
        if (which === "start") updateStartSec(next);
        else updateEndSec(next);
    };

    const handleNumberFocus = (field: "start" | "end") => {
        setEditingField(field);
        const val = field === "start" ? start : end;
        setDraftText(val !== undefined && Number.isFinite(val) ? formatSec(val) : "");
    };

    const handleNumberChange = (field: "start" | "end", raw: string) => {
        setEditingField(field);
        setDraftText(raw);
        const trimmed = raw.trim();
        if (trimmed === "") {
            if (field === "start") emitNormalized(undefined, end);
            else emitNormalized(start, undefined);
            return;
        }
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) return;
        if (field === "start") {
            const upperLimit = (end !== undefined ? Math.min(end, maxBound) : maxBound) - minSpan;
            if (parsed <= upperLimit + 1e-6) {
                emitNormalized(parsed, end);
            }
        } else {
            const lowerLimit = (start !== undefined ? Math.max(0, start) : 0) + minSpan;
            if (parsed >= lowerLimit - 1e-6 && parsed <= maxBound + 1e-6) {
                emitNormalized(start, parsed);
            }
        }
    };

    const handleNumberBlur = (field: "start" | "end") => {
        const trimmed = draftText.trim();
        setEditingField(null);
        setDraftText("");
        if (trimmed === "") {
            if (field === "start") emitNormalized(undefined, end);
            else emitNormalized(start, undefined);
            return;
        }
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) return;
        if (field === "start") updateStartSec(parsed);
        else updateEndSec(parsed);
    };

    const togglePreview = () => {
        setPreviewErrorKey(null);
        if (playing) {
            owningPreviewRef.current = false;
            activePreviewTokenRef.current += 1;
            previewStorySound(null);
            setPlayingKey(null);
            setPlayheadSec(null);
            return;
        }
        if (urlsList.length === 0) return;
        const token = ++activePreviewTokenRef.current;
        const key = urlsKey;
        owningPreviewRef.current = true;
        setPlayingKey(key);
        setPlayheadSec(effectiveStart);
        previewStorySound(urlsList, {
            start,
            end,
            onProgress: (currentSec) => {
                if (activePreviewTokenRef.current === token) {
                    setPlayheadSec(currentSec);
                }
            },
            onEnd: () => {
                if (activePreviewTokenRef.current === token) {
                    owningPreviewRef.current = false;
                    setPlayingKey(curr => (curr === key ? null : curr));
                    setPlayheadSec(null);
                }
            },
            onError: () => {
                if (activePreviewTokenRef.current === token) {
                    owningPreviewRef.current = false;
                    setPlayingKey(curr => (curr === key ? null : curr));
                    setPlayheadSec(null);
                    setPreviewErrorKey(key);
                }
            },
        });
    };

    const handleReset = () => {
        if (playing) {
            owningPreviewRef.current = false;
            activePreviewTokenRef.current += 1;
            previewStorySound(null);
            setPlayingKey(null);
            setPlayheadSec(null);
        }
        setEditingField(null);
        setDraftText("");
        onChange({ start: undefined, end: undefined });
    };

    const selectedSpan = Math.max(0, effectiveEnd - effectiveStart);
    const startInputValue = editingField === "start"
        ? draftText
        : (start !== undefined && Number.isFinite(start) ? formatSec(start) : "");
    const endInputValue = editingField === "end"
        ? draftText
        : (end !== undefined && Number.isFinite(end) ? formatSec(end) : "");

    return (
        <div className="min-w-0 space-y-2.5 rounded-md3-md border border-outline-variant/70 bg-surface-container-low p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 type-label-l text-on-surface">
                    <Icon path={mdContentCut} size={16} className="shrink-0 text-primary" />
                    <span className="truncate">{t("page.storyMaker.voiceTrim.title")}</span>
                </span>
                <span className="shrink-0 font-mono type-label-s text-on-surface-variant">
                    {hasTrim && (duration !== null || end !== undefined)
                        ? t("page.storyMaker.voiceTrim.selectedDuration", {
                            start: formatSec(effectiveStart),
                            end: formatSec(effectiveEnd),
                            duration: formatSec(selectedSpan),
                        })
                        : duration !== null
                            ? `${t("page.storyMaker.voiceTrim.fullClip")} · ${t("page.storyMaker.voiceTrim.durationLabel", { duration: formatSec(duration) })}`
                            : t("page.storyMaker.voiceTrim.fullClip")}
                </span>
            </div>

            {waveformState.status === "loading" && (
                <div className="space-y-1.5 rounded-md3-sm bg-surface-container px-3 py-3">
                    <p className="type-label-s text-on-surface-variant">
                        {t("page.storyMaker.voiceTrim.loadingWaveform")}
                    </p>
                    <LinearProgress />
                </div>
            )}

            {waveformState.status === "error" && (
                <p className="rounded-md3-sm bg-surface-container px-3 py-2 type-body-s text-on-surface-variant">
                    {t("page.storyMaker.voiceTrim.waveformError")}
                </p>
            )}

            {waveformState.status === "ready" && (
                <div className="rounded-md3-sm border border-outline-variant/70 bg-surface-container px-2.5 py-1.5">
                    <div
                        ref={trackRef}
                        onPointerDown={handleTrackPointerDown}
                        onPointerMove={handleTrackPointerMove}
                        onPointerUp={handleTrackPointerUp}
                        onPointerCancel={handleTrackPointerUp}
                        className={cn(
                            "relative h-14 w-full touch-none select-none",
                            disabled ? "opacity-50" : "cursor-ew-resize",
                        )}
                    >
                        <canvas ref={canvasRef} className="block h-full w-full" />

                        <button
                            type="button"
                            role="slider"
                            disabled={disabled}
                            aria-label={t("page.storyMaker.voiceTrim.startLabel")}
                            aria-valuemin={0}
                            aria-valuemax={Number(Math.max(0, effectiveEnd - minSpan).toFixed(2))}
                            aria-valuenow={Number(effectiveStart.toFixed(2))}
                            onPointerDown={event => handleHandlePointerDown("start", event)}
                            onKeyDown={event => handleHandleKeyDown("start", event)}
                            style={{ left: `${startRatio * 100}%` }}
                            className={cn(
                                "focus-ring absolute top-1/2 z-10 flex h-11 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-md3-full border border-on-primary/30 bg-primary text-on-primary shadow-elev-1 transition-transform duration-150",
                                draggingHandle === "start" && "scale-110",
                            )}
                        >
                            <span className="h-4 w-0.5 rounded-full bg-on-primary" />
                        </button>

                        <button
                            type="button"
                            role="slider"
                            disabled={disabled}
                            aria-label={t("page.storyMaker.voiceTrim.endLabel")}
                            aria-valuemin={Number(Math.min(maxBound, effectiveStart + minSpan).toFixed(2))}
                            aria-valuemax={Number(maxBound.toFixed(2))}
                            aria-valuenow={Number(effectiveEnd.toFixed(2))}
                            onPointerDown={event => handleHandlePointerDown("end", event)}
                            onKeyDown={event => handleHandleKeyDown("end", event)}
                            style={{ left: `${endRatio * 100}%` }}
                            className={cn(
                                "focus-ring absolute top-1/2 z-10 flex h-11 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-md3-full border border-on-primary/30 bg-primary text-on-primary shadow-elev-1 transition-transform duration-150",
                                draggingHandle === "end" && "scale-110",
                            )}
                        >
                            <span className="h-4 w-0.5 rounded-full bg-on-primary" />
                        </button>
                    </div>
                </div>
            )}

            <p className="type-body-s text-on-surface-variant">
                {t("page.storyMaker.voiceTrim.rangeHint")}
            </p>

            <div className="grid grid-cols-2 gap-2">
                <TextField
                    type="number"
                    inputMode="decimal"
                    step="0.05"
                    min={0}
                    max={Number(maxBound.toFixed(2))}
                    disabled={disabled}
                    label={t("page.storyMaker.voiceTrim.startLabel")}
                    placeholder="0.00"
                    value={startInputValue}
                    onFocus={() => handleNumberFocus("start")}
                    onChange={event => handleNumberChange("start", event.target.value)}
                    onBlur={() => handleNumberBlur("start")}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="font-mono"
                />
                <TextField
                    type="number"
                    inputMode="decimal"
                    step="0.05"
                    min={0}
                    max={Number(maxBound.toFixed(2))}
                    disabled={disabled}
                    label={t("page.storyMaker.voiceTrim.endLabel")}
                    placeholder={duration !== null ? formatSec(duration) : ""}
                    value={endInputValue}
                    onFocus={() => handleNumberFocus("end")}
                    onChange={event => handleNumberChange("end", event.target.value)}
                    onBlur={() => handleNumberBlur("end")}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="font-mono"
                />
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                    size="xs"
                    variant="tonal"
                    icon={playing ? mdStopFill : mdPlayArrowFill}
                    disabled={disabled || urlsList.length === 0}
                    onClick={togglePreview}
                >
                    {t(playing ? "page.storyMaker.voiceTrim.stopPreview" : "page.storyMaker.voiceTrim.previewTrim")}
                </Button>
                <Button
                    size="xs"
                    variant="text"
                    icon={mdRestartAlt}
                    disabled={disabled || !hasTrim}
                    onClick={handleReset}
                >
                    {t("page.storyMaker.voiceTrim.resetTrim")}
                </Button>
            </div>

            {previewError && (
                <p role="alert" className="type-label-s text-error">
                    {t("page.storyMaker.inspector.audioPreviewFailed")}
                </p>
            )}
        </div>
    );
}
