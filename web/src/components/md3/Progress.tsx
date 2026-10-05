"use client";
import React from "react";
import { cn } from "./cn";
import { useI18n } from "@/contexts/I18nContext";

/* ==========================================================================
   M3 progress indicators + M3 Expressive LoadingIndicator (morphing shape).
   ========================================================================== */

export interface ProgressProps {
    /** 0–1. Omit for indeterminate. */
    value?: number;
    className?: string;
    "aria-label"?: string;
}

export function LinearProgress({ value, className, "aria-label": label }: ProgressProps) {
    const { t } = useI18n();
    const determinate = typeof value === "number";
    const pct = determinate ? Math.max(0, Math.min(1, value)) * 100 : 0;
    return (
        <div
            role="progressbar"
            aria-label={label ?? t("common.md3.loading")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={determinate ? Math.round(pct) : undefined}
            className={cn("relative h-1 w-full overflow-hidden", className)}
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
            className={cn("inline-flex", !determinate && "animate-spin", className)}
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
    /** Show on a primary-container circle (for use over content). */
    contained?: boolean;
    className?: string;
    "aria-label"?: string;
}) {
    const { t } = useI18n();
    return (
        <span
            role="progressbar"
            aria-label={label ?? t("common.md3.loading")}
            className={cn(
                "inline-flex items-center justify-center",
                contained && "rounded-full bg-primary-container",
                className,
            )}
            style={{ width: size, height: size }}
        >
            <span
                className={cn("md3-loading-shape block", contained ? "bg-on-primary-container" : "bg-primary")}
                style={{ width: size * 0.79, height: size * 0.79 }}
            />
        </span>
    );
}
