"use client";
import React, { useId, useRef, useState } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { mdCheck, mdClose, mdRemove } from "./icons";

/* ==========================================================================
   M3 selection controls: Switch, Checkbox, Radio, Slider.
   All are native inputs underneath (keyboard + form friendly).
   ========================================================================== */

/* ── Switch ───────────────────────────────────────────────────────────── */

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    /** Show check / close icons inside the handle. */
    icons?: boolean;
    /** Visible label. When omitted pass aria-label. */
    label?: React.ReactNode;
    description?: React.ReactNode;
    /** Put the switch on the leading edge instead of trailing (default trailing, M3 list style). */
    leading?: boolean;
}

export function Switch({ checked, onCheckedChange, icons = true, label, description, leading, className, disabled, id, ...rest }: SwitchProps) {
    const autoId = useId();
    const inputId = id ?? `sw-${autoId}`;
    const control = (
        <span className="relative inline-flex h-8 w-[52px] shrink-0 items-center">
            <input
                id={inputId}
                type="checkbox"
                role="switch"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onCheckedChange(e.target.checked)}
                className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
                {...rest}
            />
            <span
                aria-hidden
                className={cn(
                    "absolute inset-0 rounded-full border-2 transition-colors duration-200 ease-md3-standard",
                    checked ? "border-primary bg-primary" : "border-outline bg-surface-container-highest",
                    "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-secondary",
                    disabled && (checked ? "border-transparent bg-on-surface/12" : "border-on-surface/12 bg-surface-container-highest/12"),
                )}
            />
            <span
                aria-hidden
                className={cn(
                    "pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full",
                    "transition-all duration-300 ease-md3-spatial-fast peer-active:h-7 peer-active:w-7",
                    checked
                        ? "left-[24px] h-6 w-6 bg-on-primary text-on-primary-container peer-hover:bg-primary-container"
                        : icons
                          ? "left-[4px] h-6 w-6 bg-outline text-surface-container-highest peer-hover:bg-on-surface-variant"
                          : "left-[8px] h-4 w-4 bg-outline peer-hover:bg-on-surface-variant",
                    disabled && (checked ? "bg-surface" : "bg-on-surface/38"),
                )}
            >
                {icons && <Icon path={checked ? mdCheck : mdClose} size={16} />}
            </span>
        </span>
    );
    if (!label && !description) return <span className={className}>{control}</span>;
    return (
        <label htmlFor={inputId} className={cn("flex cursor-pointer items-center gap-4", disabled && "cursor-not-allowed opacity-38", className)}>
            {leading && control}
            <span className="min-w-0 flex-1">
                {label && <span className="block type-body-l text-on-surface">{label}</span>}
                {description && <span className="block type-body-m text-on-surface-variant">{description}</span>}
            </span>
            {!leading && control}
        </label>
    );
}

/* ── Checkbox ─────────────────────────────────────────────────────────── */

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
    checked: boolean;
    indeterminate?: boolean;
    onCheckedChange: (checked: boolean) => void;
    label?: React.ReactNode;
    error?: boolean;
}

export function Checkbox({ checked, indeterminate, onCheckedChange, label, error, className, disabled, id, ...rest }: CheckboxProps) {
    const autoId = useId();
    const inputId = id ?? `cb-${autoId}`;
    const on = checked || indeterminate;
    const box = (
        <span className="state-layer relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface">
            <input
                id={inputId}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                ref={(el) => {
                    if (el) el.indeterminate = Boolean(indeterminate);
                }}
                onChange={(e) => onCheckedChange(e.target.checked)}
                aria-invalid={error || undefined}
                className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
                {...rest}
            />
            <span
                aria-hidden
                className={cn(
                    "flex h-[18px] w-[18px] items-center justify-center rounded-[2px] transition-colors duration-150 ease-md3-standard",
                    "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-secondary",
                    on
                        ? error
                            ? "bg-error text-on-error"
                            : "bg-primary text-on-primary"
                        : cn("border-2", error ? "border-error" : "border-on-surface-variant"),
                    disabled && (on ? "bg-on-surface/38" : "border-on-surface/38"),
                )}
            >
                {indeterminate ? <Icon path={mdRemove} size={16} /> : checked ? <Icon path={mdCheck} size={16} /> : null}
            </span>
        </span>
    );
    if (!label) return <span className={className}>{box}</span>;
    return (
        <label htmlFor={inputId} className={cn("inline-flex cursor-pointer items-center gap-1 pr-2 type-body-m text-on-surface", disabled && "cursor-not-allowed opacity-38", className)}>
            {box}
            {label}
        </label>
    );
}

/* ── Radio ────────────────────────────────────────────────────────────── */

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
    checked: boolean;
    onSelect: () => void;
    label?: React.ReactNode;
}

export function Radio({ checked, onSelect, label, className, disabled, id, ...rest }: RadioProps) {
    const autoId = useId();
    const inputId = id ?? `rb-${autoId}`;
    const dot = (
        <span className="state-layer relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface">
            <input
                id={inputId}
                type="radio"
                checked={checked}
                disabled={disabled}
                onChange={() => onSelect()}
                className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
                {...rest}
            />
            <span
                aria-hidden
                className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors duration-150",
                    "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-secondary",
                    checked ? "border-primary" : "border-on-surface-variant",
                    disabled && "border-on-surface/38",
                )}
            >
                <span
                    className={cn(
                        "h-2.5 w-2.5 rounded-full bg-primary transition-transform duration-200 ease-md3-spatial-fast",
                        checked ? "scale-100" : "scale-0",
                        disabled && "bg-on-surface/38",
                    )}
                />
            </span>
        </span>
    );
    if (!label) return <span className={className}>{dot}</span>;
    return (
        <label htmlFor={inputId} className={cn("inline-flex cursor-pointer items-center gap-1 pr-2 type-body-m text-on-surface", disabled && "cursor-not-allowed opacity-38", className)}>
            {dot}
            {label}
        </label>
    );
}

/* ── Slider (M3 Expressive: tall track, bar handle) ───────────────────── */

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
    value: number;
    onValueChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    /** Show value label above the handle while dragging/focused. */
    showValue?: boolean;
    formatValue?: (value: number) => string;
}

export function Slider({ value, onValueChange, min = 0, max = 100, step = 1, showValue, formatValue, className, disabled, ...rest }: SliderProps) {
    const clampedValue = Math.max(min, Math.min(max, value));
    const pct = max <= min ? 0 : ((clampedValue - min) / (max - min)) * 100;
    return (
        <span className={cn("group/slider relative flex h-11 w-full items-center", disabled && "opacity-38", className)}>
            {/* active track */}
            <span
                aria-hidden
                className="absolute left-0 h-4 rounded-l-md3-lg rounded-r-[2px] bg-primary"
                style={{ width: `calc(${pct}% - 6px)` }}
            />
            {/* inactive track */}
            <span
                aria-hidden
                className="absolute right-0 h-4 rounded-r-md3-lg rounded-l-[2px] bg-secondary-container"
                style={{ width: `calc(${100 - pct}% - 6px)` }}
            />
            {/* handle */}
            <span
                aria-hidden
                className="absolute h-11 w-1 -translate-x-1/2 rounded-full bg-primary transition-[width] duration-100 group-active/slider:w-0.5 group-focus-within/slider:outline-3 group-focus-within/slider:outline-offset-2 group-focus-within/slider:outline-secondary"
                style={{ left: `${pct}%` }}
            />
            {showValue && (
                <span
                    aria-hidden
                    className="pointer-events-none absolute -top-10 -translate-x-1/2 scale-0 rounded-full bg-inverse-surface px-3 py-1.5 type-label-l text-inverse-on-surface opacity-0 transition-[opacity,transform] duration-150 group-focus-within/slider:scale-100 group-focus-within/slider:opacity-100 group-active/slider:scale-100 group-active/slider:opacity-100"
                    style={{ left: `${pct}%` }}
                >
                    {formatValue ? formatValue(clampedValue) : clampedValue}
                </span>
            )}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                aria-valuetext={formatValue?.(clampedValue)}
                onChange={(e) => onValueChange(Number(e.target.value))}
                className="relative z-10 m-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 focus-visible:opacity-0 disabled:cursor-not-allowed"
                {...rest}
            />
        </span>
    );
}

/** Two accessible handles sharing one MD3 range track. */
export interface RangeSliderProps {
    value: [number, number];
    onValueChange: (value: [number, number]) => void;
    min?: number;
    max?: number;
    step?: number;
    lowerLabel: string;
    upperLabel: string;
    disabled?: boolean;
    formatValue?: (value: number) => string;
    className?: string;
}

export function RangeSlider({ value, onValueChange, min = 0, max = 100, step = 1, lowerLabel, upperLabel, disabled, formatValue, className }: RangeSliderProps) {
    const lowerInput = useRef<HTMLInputElement>(null);
    const upperInput = useRef<HTMLInputElement>(null);
    const activeHandle = useRef<0 | 1>(0);
    const dragging = useRef(false);
    const [focused, setFocused] = useState<0 | 1 | null>(null);
    const upperBound = Math.max(min, max);
    const lower = Math.max(min, Math.min(upperBound, value[0]));
    const upper = Math.max(lower, Math.min(upperBound, value[1]));
    const range = upperBound - min;
    const lowerPct = range ? (lower - min) / range * 100 : 0;
    const upperPct = range ? (upper - min) / range * 100 : 0;
    const isDisabled = disabled || range === 0;
    const update = (index: 0 | 1, next: number) => {
        const bounded = Math.max(min, Math.min(upperBound, next));
        onValueChange(index === 0 ? [Math.min(bounded, upper), upper] : [lower, Math.max(bounded, lower)]);
    };
    const pointerValue = (event: React.PointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
        const increment = step > 0 ? step : 1;
        return Math.max(min, Math.min(upperBound, Number((min + Math.round(fraction * range / increment) * increment).toFixed(6))));
    };
    const endDrag = () => { dragging.current = false; };
    return (
        <div
            className={cn("relative flex h-11 w-full touch-none items-center", isDisabled && "opacity-38", className)}
            data-range-slider="true"
            onPointerDown={(event) => {
                if (isDisabled || event.button !== 0) return;
                event.preventDefault();
                const next = pointerValue(event);
                const index: 0 | 1 = lower === upper
                    ? next < lower ? 0 : next > upper ? 1 : activeHandle.current
                    : Math.abs(next - lower) <= Math.abs(next - upper) ? 0 : 1;
                activeHandle.current = index;
                dragging.current = true;
                (index === 0 ? lowerInput : upperInput).current?.focus({ preventScroll: true });
                event.currentTarget.setPointerCapture(event.pointerId);
                update(index, next);
            }}
            onPointerMove={(event) => {
                if (dragging.current && !isDisabled) update(activeHandle.current, pointerValue(event));
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
        >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 h-4 rounded-full bg-secondary-container" />
            <span aria-hidden className="pointer-events-none absolute h-4 rounded-[2px] bg-primary" style={{ left: `${lowerPct}%`, width: `${upperPct - lowerPct}%` }} />
            {([0, 1] as const).map((index) => (
                <React.Fragment key={index}>
                    <input
                        ref={index === 0 ? lowerInput : upperInput}
                        type="range"
                        aria-label={index === 0 ? lowerLabel : upperLabel}
                        aria-valuetext={formatValue?.(index === 0 ? lower : upper)}
                        min={index === 0 ? min : lower}
                        max={index === 0 ? upper : upperBound}
                        step={step}
                        value={index === 0 ? lower : upper}
                        disabled={isDisabled}
                        onChange={(event) => update(index, Number(event.target.value))}
                        onFocus={() => { activeHandle.current = index; setFocused(index); }}
                        onBlur={() => setFocused(null)}
                        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                    />
                    <span
                        aria-hidden
                        className={cn("pointer-events-none absolute h-11 w-1 -translate-x-1/2 rounded-full bg-primary ring-4 ring-surface", focused === index && "z-10 outline-3 outline-offset-4 outline-secondary")}
                        style={{ left: `${index === 0 ? lowerPct : upperPct}%` }}
                    />
                </React.Fragment>
            ))}
        </div>
    );
}
