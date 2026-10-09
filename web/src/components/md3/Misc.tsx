"use client";
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import LocalizedLink from "@/components/LocalizedLink";
import { md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import { cn, withOverrides } from "./cn";
import { Icon } from "./Icon";

/* ==========================================================================
   Misc M3 primitives: List / ListItem, Divider, Badge, Tooltip, Snackbar.
   ========================================================================== */

/* ── List ─────────────────────────────────────────────────────────────── */

export function List({ className, ...rest }: React.HTMLAttributes<HTMLUListElement>) {
    return <ul role="list" className={withOverrides("py-2", className)} {...rest} />;
}

export interface ListItemProps {
    headline: React.ReactNode;
    supportingText?: React.ReactNode;
    overline?: React.ReactNode;
    /** Leading icon path. */
    icon?: string;
    /** Leading custom node (avatar, image, checkbox). */
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    trailingText?: React.ReactNode;
    href?: string;
    onClick?: () => void;
    selected?: boolean;
    disabled?: boolean;
    className?: string;
}

export function ListItem({
    headline,
    supportingText,
    overline,
    icon,
    leading,
    trailing,
    trailingText,
    href,
    onClick,
    selected,
    disabled,
    className,
}: ListItemProps) {
    const interactive = Boolean(href || onClick);
    const lines = (overline ? 1 : 0) + (supportingText ? 1 : 0);
    const cls = withOverrides(
        "flex w-full items-center gap-4 px-4 text-left",
        lines === 0 ? "min-h-14 py-2" : lines === 1 ? "min-h-[72px] py-2" : "min-h-[88px] py-3",
        interactive && "state-layer focus-ring cursor-pointer",
        selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
        disabled && "pointer-events-none opacity-38",
        className,
    );
    const content = (
        <>
            {icon && <Icon path={icon} size={24} className={selected ? "" : "text-on-surface-variant"} />}
            {leading}
            <span className="min-w-0 flex-1">
                {overline && <span className="block type-label-s text-on-surface-variant">{overline}</span>}
                <span className="block truncate type-body-l">{headline}</span>
                {supportingText && <span className="block type-body-m text-on-surface-variant">{supportingText}</span>}
            </span>
            {trailingText && <span className="shrink-0 type-label-s text-on-surface-variant">{trailingText}</span>}
            {trailing}
        </>
    );
    return (
        <li>
            {href ? (
                <LocalizedLink
                    href={href}
                    className={cls}
                    aria-current={selected ? "page" : undefined}
                    aria-disabled={disabled || undefined}
                    tabIndex={disabled ? -1 : undefined}
                    onClick={(e) => {
                        if (disabled) e.preventDefault();
                        else onClick?.();
                    }}
                >
                    {content}
                </LocalizedLink>
            ) : onClick ? (
                <button type="button" onClick={onClick} disabled={disabled} className={cls} aria-pressed={selected}>
                    {content}
                </button>
            ) : (
                <div className={cls}>{content}</div>
            )}
        </li>
    );
}

/* ── Divider ──────────────────────────────────────────────────────────── */

export function Divider({ inset, vertical, className }: { inset?: boolean; vertical?: boolean; className?: string }) {
    return (
        <div
            role="separator"
            aria-orientation={vertical ? "vertical" : "horizontal"}
            className={withOverrides(vertical ? "w-px self-stretch bg-outline-variant" : "h-px w-full bg-outline-variant", inset && !vertical && "ml-4", className)}
        />
    );
}

/* ── Badge ────────────────────────────────────────────────────────────── */

export function Badge({ value, max = 999, className }: { value?: number | string; max?: number; className?: string }) {
    if (value === undefined || value === "") {
        return <span aria-hidden className={withOverrides("inline-block h-1.5 w-1.5 rounded-full bg-error", className)} />;
    }
    const text = typeof value === "number" && value > max ? `${max}+` : String(value);
    return (
        <span className={withOverrides("inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 type-label-s text-on-error", className)}>
            {text}
        </span>
    );
}

/* ── Tooltip (plain) ──────────────────────────────────────────────────── */

export function Tooltip({
    label,
    children,
    side = "top",
    className,
}: {
    label: React.ReactNode;
    children: React.ReactElement;
    side?: "top" | "bottom";
    className?: string;
}) {
    return (
        <span className={withOverrides("group/tt relative inline-flex", className)}>
            {children}
            <span
                role="tooltip"
                className={cn(
                    "pointer-events-none absolute left-1/2 z-[250] -translate-x-1/2 whitespace-nowrap rounded-md3-xs bg-inverse-surface px-2 py-1 type-body-s text-inverse-on-surface",
                    "opacity-0 transition-opacity delay-300 duration-150 group-focus-within/tt:opacity-100 group-hover/tt:opacity-100",
                    side === "top" ? "bottom-full mb-1" : "top-full mt-1",
                )}
            >
                {label}
            </span>
        </span>
    );
}

/* ── Snackbar ─────────────────────────────────────────────────────────── */

export interface SnackbarProps {
    open: boolean;
    message: React.ReactNode;
    onClose: () => void;
    actionLabel?: string;
    onAction?: () => void;
    /** ms; 0 = persistent. Default 4000. */
    duration?: number;
    className?: string;
}

export function Snackbar({ open, message, onClose, actionLabel, onAction, duration = 4000, className }: SnackbarProps) {
    const reduced = useReducedMotion();
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const raf = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(raf);
    }, []);
    useEffect(() => {
        if (!open || duration <= 0) return;
        const timer = window.setTimeout(onClose, duration);
        return () => window.clearTimeout(timer);
    }, [open, duration, onClose]);
    if (!mounted) return null;
    return (
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[260] flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <AnimatePresence>
                {open && (
                    <motion.div
                        role="status"
                        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
                        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
                        transition={reduced ? reducedMotionFade : md3SpatialDefault}
                        className={withOverrides(
                            "pointer-events-auto flex min-h-12 w-full max-w-[560px] items-center gap-2 rounded-md3-xs bg-inverse-surface py-1 pl-4 pr-2 text-inverse-on-surface shadow-elev-3",
                            className,
                        )}
                    >
                        <span className="flex-1 py-2 type-body-m">{message}</span>
                        {actionLabel && onAction && (
                            <button
                                type="button"
                                onClick={() => {
                                    onAction();
                                    onClose();
                                }}
                                className="state-layer focus-ring h-10 shrink-0 cursor-pointer rounded-full px-3 type-label-l text-inverse-primary"
                            >
                                {actionLabel}
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
