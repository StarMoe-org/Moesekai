"use client";
import React from "react";
import { animate, useAnimationFrame, useMotionValue, useReducedMotion } from "framer-motion";
import { cn, withOverrides } from "./cn";
import { useI18n } from "@/contexts/I18nContext";
import { md3EasingEmphasizedAccelerate, md3EasingStandard } from "@/lib/motion";

/* ==========================================================================
   M3 progress indicators + M3 Expressive LoadingIndicator (morphing shape).
   ========================================================================== */

export interface ProgressProps {
    /** 0–1. Omit for indeterminate. */
    value?: number;
    className?: string;
    "aria-label"?: string;
}

export interface LinearProgressProps extends ProgressProps {
    /**
     * M3 Expressive wavy shape, for a determinate indicator: while true the
     * active part is a travelling wave, while false it lies flat. A process
     * that can pause passes whether it is running.
     */
    wavy?: boolean;
}

export function LinearProgress({ value, wavy, className, "aria-label": label }: LinearProgressProps) {
    const { t } = useI18n();
    const determinate = typeof value === "number";
    if (determinate && wavy !== undefined) {
        return <WavyLinearProgress value={value} wavy={wavy} className={className} aria-label={label ?? t("common.md3.loading")} />;
    }
    const pct = determinate ? Math.max(0, Math.min(1, value)) * 100 : 0;
    return (
        <div
            role="progressbar"
            aria-label={label ?? t("common.md3.loading")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={determinate ? Math.round(pct) : undefined}
            className={withOverrides("relative h-1 w-full overflow-hidden", className)}
        >
            {determinate ? (
                <>
                    <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300 ease-md3-standard" style={{ width: `${pct}%` }} />
                    <span
                        className="absolute inset-y-0 right-0 rounded-full bg-secondary-container"
                        style={{ width: `calc(${100 - pct}% - 4px)` }}
                    />
                    <span className="absolute right-0 top-0 h-1 w-1 rounded-full bg-primary" />
                </>
            ) : (
                <>
                    <span className="absolute inset-0 rounded-full bg-secondary-container" />
                    <span className="md3-linear-indeterminate absolute inset-y-0 rounded-full bg-primary" />
                </>
            )}
        </div>
    );
}

/* The wavy linear indicator's measures (M3 Expressive, in px): a 4 stroke, a
   wave of amplitude 3 and wavelength 40 in a container 10 high, one wavelength
   a second; the track begins 4 after the active part and ends in a stop of 4.
   The wave is flat below 10% and from 95% of the progress. */
const WAVE = { height: 10, stroke: 4, amplitude: 3, wavelength: 40, gap: 4, seconds: 0.5 };

function WavyLinearProgress({ value, wavy, className, "aria-label": label }: { value: number; wavy: boolean; className?: string; "aria-label": string }) {
    const reducedMotion = useReducedMotion();
    const target = Math.max(0, Math.min(1, value));
    const waves = wavy && !reducedMotion && target > 0.1 && target < 0.95;
    const progress = useMotionValue(target);
    const amplitude = useMotionValue(0);
    const rootRef = React.useRef<HTMLDivElement>(null);
    const activeRef = React.useRef<SVGPathElement>(null);
    const trackRef = React.useRef<SVGLineElement>(null);
    const stopRef = React.useRef<SVGCircleElement>(null);
    const drawn = React.useRef({ width: 0, phase: 0, key: "" });

    React.useEffect(() => {
        const moving = animate(progress, target, { duration: reducedMotion ? 0 : WAVE.seconds, ease: "linear" });
        return () => moving.stop();
    }, [progress, target, reducedMotion]);
    React.useEffect(() => {
        const changing = animate(amplitude, waves ? 1 : 0, {
            duration: reducedMotion ? 0 : WAVE.seconds,
            ease: waves ? [...md3EasingStandard] : [...md3EasingEmphasizedAccelerate],
        });
        return () => changing.stop();
    }, [amplitude, waves, reducedMotion]);
    React.useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const observer = new ResizeObserver(() => { drawn.current.width = root.clientWidth; });
        observer.observe(root);
        drawn.current.width = root.clientWidth;
        return () => observer.disconnect();
    }, []);

    useAnimationFrame((_, delta) => {
        const state = drawn.current;
        const height = amplitude.get();
        if (height > 0) state.phase = (state.phase + delta / 1000 * WAVE.wavelength) % WAVE.wavelength;
        const key = `${state.width}:${progress.get()}:${height}:${height > 0 ? state.phase : 0}`;
        if (key === state.key || !activeRef.current || !trackRef.current || !stopRef.current) return;
        state.key = key;

        const middle = WAVE.height / 2;
        const cap = WAVE.stroke / 2;
        const end = progress.get() * state.width;
        // the strokes have round caps: each line is drawn between the centres of its caps
        let path = "";
        for (let x = cap; x < end - cap; x += 2) {
            const y = middle + WAVE.amplitude * height * Math.sin(2 * Math.PI * (x - state.phase) / WAVE.wavelength);
            path += `${path ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(2)}`;
        }
        if (path) {
            const x = end - cap;
            const y = middle + WAVE.amplitude * height * Math.sin(2 * Math.PI * (x - state.phase) / WAVE.wavelength);
            path += `L${x.toFixed(1)} ${y.toFixed(2)}`;
        }
        activeRef.current.setAttribute("d", path);
        const from = end + WAVE.gap + cap;
        const to = state.width - cap;
        trackRef.current.setAttribute("x1", String(Math.min(from, to)));
        trackRef.current.setAttribute("x2", String(to));
        trackRef.current.style.visibility = from < to ? "visible" : "hidden";
        stopRef.current.setAttribute("cx", String(to));
    });

    return (
        <div
            ref={rootRef}
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(target * 100)}
            className={cn("relative w-full overflow-hidden", className)}
            style={{ height: WAVE.height }}
        >
            <svg className="absolute inset-0 h-full w-full" fill="none" strokeWidth={WAVE.stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line ref={trackRef} y1={WAVE.height / 2} y2={WAVE.height / 2} className="stroke-secondary-container" />
                <path ref={activeRef} className="stroke-primary" />
                <circle ref={stopRef} cy={WAVE.height / 2} r={WAVE.stroke / 2} stroke="none" className="fill-primary" />
            </svg>
        </div>
    );
}

export interface CircularProgressProps extends ProgressProps {
    size?: number;
    strokeWidth?: number;
}

export function CircularProgress({ value, size = 48, strokeWidth = 4, className, "aria-label": label }: CircularProgressProps) {
    const { t } = useI18n();
    const determinate = typeof value === "number";
    const r = (size - strokeWidth) / 2;
    const c = 2 * Math.PI * r;
    const pct = determinate ? Math.max(0, Math.min(1, value)) : 0.25;
    return (
        <span
            role="progressbar"
            aria-label={label ?? t("common.md3.loading")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={determinate ? Math.round(pct * 100) : undefined}
            className={withOverrides("inline-flex", !determinate && "animate-spin", className)}
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} className="stroke-secondary-container" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    className="stroke-primary transition-[stroke-dashoffset] duration-300"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - pct)}
                />
            </svg>
        </span>
    );
}

/**
 * M3 Expressive loading indicator: an active-indicator shape that morphs
 * through the Material shape library while rotating. Pure CSS (clip-path).
 */
export function LoadingIndicator({
    size = 48,
    contained,
    className,
    "aria-label": label,
}: {
    size?: number;
    /** Show on a tinted disc (for use over images and other content). */
    contained?: boolean;
    className?: string;
    "aria-label"?: string;
}) {
    const { t } = useI18n();
    return (
        <span
            role="progressbar"
            aria-label={label ?? t("common.md3.loading")}
            className={withOverrides(
                "inline-flex items-center justify-center",
                // A pale disc with the accent shape inside, well clear of its edge: the seed-colored
                // disc with a near-black shape on it read as a heavy ring.
                contained && "rounded-full bg-secondary-container shadow-elev-1",
                className,
            )}
            style={{ width: size, height: size }}
        >
            <span
                className="md3-loading-shape block bg-primary"
                style={{ width: size * (contained ? 0.66 : 0.79), height: size * (contained ? 0.66 : 0.79) }}
            />
        </span>
    );
}
