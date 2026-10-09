"use client";
import React from "react";
import { cn, withOverrides } from "./cn";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { LoadingIndicator } from "./Progress";
import { mdErrorFill, mdInfo, mdRefresh, mdSearchOff, mdWarningFill } from "./icons";

/* ==========================================================================
   Page-level MD3 patterns shared by every module page.
   ========================================================================== */

// Han and kana run together without spaces; Hangul and Latin keep word spacing.
// Script_Extensions so the shared prolonged-sound mark counts as kana.
const UNSPACED_SCRIPT = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]/u;

/** Two Han halves join with no space; "Card" + "Progress" and "MySEKAI" + a Han word keep one. */
function titleGap(title: React.ReactNode, highlight: React.ReactNode): string {
    if (typeof title !== "string" || typeof highlight !== "string") return " ";
    return UNSPACED_SCRIPT.test(title.slice(-1)) && UNSPACED_SCRIPT.test(highlight.charAt(0)) ? "" : " ";
}

/**
 * Page header: compact title row with optional eyebrow, one-line description
 * and trailing actions. List and data pages keep the default start alignment
 * so the content stays above the fold; `align="center"` is only for pages
 * whose body is itself a centered, narrower column (auth cards, hubs, forms),
 * so the header shares the body's axis.
 */
export function PageHeader({
    eyebrow,
    title,
    highlight,
    description,
    actions,
    align = "start",
    className,
}: {
    eyebrow?: React.ReactNode;
    title: React.ReactNode;
    /** Second part of the title, marked with a highlighter stroke in the character's own color. */
    highlight?: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    align?: "start" | "center";
    className?: string;
}) {
    const centered = align === "center";
    return (
        <header className={withOverrides("mb-4 sm:mb-6", centered && "text-center", className)}>
            <div className={cn("flex flex-wrap items-end gap-x-4 gap-y-2", centered ? "justify-center" : "justify-between")}>
                <div className={cn("min-w-0", centered && "mx-auto")}>
                    {/* Neutral: the highlight below is the header's one accent, in the true character color. */}
                    {eyebrow && <div className="mb-1 type-label-m text-on-surface-variant">{eyebrow}</div>}
                    <h1 className="type-headline-s text-on-surface sm:type-headline-m">
                        {title}
                        {highlight && (
                            <>
                                {titleGap(title, highlight)}
                                <span className="brand-mark">{highlight}</span>
                            </>
                        )}
                    </h1>
                    {description && (
                        <p className={cn("mt-1 max-w-3xl type-body-m text-on-surface-variant", centered && "mx-auto")}>{description}</p>
                    )}
                </div>
                {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
            </div>
        </header>
    );
}

/** Titled content block on a tonal surface. */
export function SectionCard({
    title,
    icon,
    actions,
    children,
    className,
    bodyClassName,
    tone = "low",
}: {
    title?: React.ReactNode;
    icon?: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    bodyClassName?: string;
    tone?: "low" | "default" | "high" | "lowest";
}) {
    // "low" (the default) is the card surface: white with a hairline on the light page,
    // so panels separate from the background without a stack of near-identical greys.
    const toneCls =
        tone === "lowest"
            ? "bg-surface-container-lowest"
            : tone === "default"
              ? "bg-surface-container"
              : tone === "high"
                ? "bg-surface-container-high"
                : "bg-surface-card border border-outline-variant/70";
    return (
        <section className={withOverrides("overflow-hidden rounded-md3-lg text-on-surface", toneCls, className)}>
            {(title || actions) && (
                <div className="flex min-h-14 items-center gap-3 px-4 pt-4 sm:px-5">
                    {icon && <Icon path={icon} size={24} className="text-primary" />}
                    {title && <h2 className="min-w-0 flex-1 truncate type-title-l">{title}</h2>}
                    {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
                </div>
            )}
            <div className={withOverrides("p-4 sm:p-5", title ? "pt-3 sm:pt-3" : undefined, bodyClassName)}>{children}</div>
        </section>
    );
}

/** Inline status banner: error / warning / info. */
export function Banner({
    tone = "info",
    title,
    children,
    action,
    className,
}: {
    tone?: "error" | "warning" | "info";
    title?: React.ReactNode;
    children?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}) {
    // A light tint with a hairline border in the tone's colour; the icon carries the tone,
    // text stays on-surface so long messages read like body copy.
    const toneCls =
        tone === "error"
            ? "border-error/25 bg-error-container/45"
            : tone === "warning"
              ? "border-warning/30 bg-warning-container/55"
              : "border-outline-variant/70 bg-secondary-container/45";
    const iconCls = tone === "error" ? "text-error" : tone === "warning" ? "text-warning" : "text-secondary";
    const icon = tone === "error" ? mdErrorFill : tone === "warning" ? mdWarningFill : mdInfo;
    const twoPart = !!title && !!children;
    return (
        <div
            role={tone === "error" ? "alert" : "status"}
            className={withOverrides(
                "flex gap-3 rounded-md3-lg border px-4 py-3 text-on-surface",
                twoPart ? "items-start" : "items-center",
                toneCls,
                className,
            )}
        >
            <Icon path={icon} size={20} className={cn("shrink-0", iconCls)} />
            <div className="min-w-0 flex-1">
                {title && <div className="type-title-s">{title}</div>}
                {children && <div className={cn("type-body-m", title ? "mt-0.5 text-on-surface-variant" : undefined)}>{children}</div>}
            </div>
            {/* Negative margins keep a button from making the banner taller than its text. */}
            {action && <div className="-my-1.5 shrink-0 self-center">{action}</div>}
        </div>
    );
}

/** Error banner with a retry button (defaults to reloading the page). */
export function ErrorState({
    title,
    message,
    retryLabel,
    onRetry,
    className,
}: {
    title: React.ReactNode;
    message?: React.ReactNode;
    retryLabel?: string;
    onRetry?: () => void;
    className?: string;
}) {
    return (
        <Banner
            tone="error"
            title={title}
            className={className}
            action={
                retryLabel ? (
                    <Button variant="text" color="error" size="xs" icon={mdRefresh} onClick={onRetry ?? (() => window.location.reload())}>
                        {retryLabel}
                    </Button>
                ) : undefined
            }
        >
            {message}
        </Banner>
    );
}

/** Empty / no-result placeholder. */
export function EmptyState({
    icon = mdSearchOff,
    title,
    description,
    action,
    className,
}: {
    icon?: string;
    title: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={withOverrides("flex flex-col items-center justify-center gap-3 px-6 py-16 text-center", className)}>
            <span className="flex h-16 w-16 items-center justify-center rounded-md3-xl bg-surface-container-high text-on-surface-variant">
                <Icon path={icon} size={32} />
            </span>
            <div className="type-title-m text-on-surface">{title}</div>
            {description && <div className="max-w-md type-body-m text-on-surface-variant">{description}</div>}
            {action}
        </div>
    );
}

/** Centered loading block. */
export function LoadingState({ label, className }: { label?: React.ReactNode; className?: string }) {
    return (
        <div className={withOverrides("flex min-h-[40vh] w-full flex-col items-center justify-center gap-4 text-on-surface-variant", className)}>
            <LoadingIndicator size={48} />
            {label && <span className="type-body-m">{label}</span>}
        </div>
    );
}

/** "Load more" footer used by paginated list pages (keeps the keyboard shortcut hook). */
export function LoadMore({
    label,
    shown,
    total,
    onLoadMore,
    allLoadedLabel,
    className,
}: {
    label: React.ReactNode;
    shown: number;
    total: number;
    onLoadMore: () => void;
    allLoadedLabel?: React.ReactNode;
    className?: string;
}) {
    if (shown >= total) {
        return allLoadedLabel && shown > 0 ? (
            <div className={withOverrides("mt-8 text-center type-body-m text-on-surface-variant", className)}>{allLoadedLabel}</div>
        ) : null;
    }
    return (
        <div className={withOverrides("mt-8 flex justify-center", className)}>
            <Button variant="tonal" color="secondary" size="s" onClick={onLoadMore} data-shortcut-load-more="true">
                {label}
                <span className="type-label-l opacity-80">
                    {shown} / {total}
                </span>
            </Button>
        </div>
    );
}

/** Standard page container width + gutters (M3 window size classes). */
export function PageContainer({ className, children, wide }: { className?: string; children: React.ReactNode; wide?: boolean }) {
    return <div className={withOverrides("mx-auto w-full px-4 py-6 sm:px-6 sm:py-8", wide ? "max-w-[1600px]" : "max-w-7xl", className)}>{children}</div>;
}
