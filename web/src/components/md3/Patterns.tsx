"use client";
import React from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { LoadingIndicator } from "./Progress";
import { mdErrorFill, mdInfo, mdRefresh, mdSearchOff, mdWarningFill } from "./icons";

/* ==========================================================================
   Page-level MD3 patterns shared by every module page.
   ========================================================================== */

/** Page header: optional eyebrow chip, headline, description and trailing actions. */
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
    /** Second part of the title rendered in the primary color. */
    highlight?: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    align?: "start" | "center";
    className?: string;
}) {
    const centered = align === "center";
    return (
        <header className={cn("mb-6 sm:mb-8", centered && "text-center", className)}>
            <div className={cn("flex flex-wrap items-end gap-4", centered ? "justify-center" : "justify-between")}>
                <div className={cn("min-w-0", centered && "mx-auto")}>
                    {eyebrow && <div className="mb-2 type-label-l text-primary">{eyebrow}</div>}
                    <h1 className="type-headline-m text-on-surface sm:type-headline-l">
                        {title}
                        {highlight && <span className="text-primary"> {highlight}</span>}
                    </h1>
                    {description && (
                        <p className={cn("mt-2 max-w-3xl type-body-l text-on-surface-variant", centered && "mx-auto")}>{description}</p>
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
        <section className={cn("overflow-hidden rounded-md3-lg text-on-surface", toneCls, className)}>
            {(title || actions) && (
                <div className="flex min-h-14 items-center gap-3 px-4 pt-4 sm:px-5">
                    {icon && <Icon path={icon} size={24} className="text-primary" />}
                    {title && <h2 className="min-w-0 flex-1 truncate type-title-l">{title}</h2>}
                    {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
                </div>
            )}
            <div className={cn("p-4 sm:p-5", title ? "pt-3 sm:pt-3" : undefined, bodyClassName)}>{children}</div>
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
    const toneCls =
        tone === "error"
            ? "bg-error-container text-on-error-container"
            : tone === "warning"
              ? "bg-warning-container text-on-warning-container"
              : "bg-secondary-container text-on-secondary-container";
    const icon = tone === "error" ? mdErrorFill : tone === "warning" ? mdWarningFill : mdInfo;
    return (
        <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-md3-lg px-4 py-3", toneCls, className)}>
            <Icon path={icon} size={24} className="mt-px shrink-0" />
            <div className="min-w-0 flex-1">
                {title && <div className="type-title-s">{title}</div>}
                {children && <div className="type-body-m">{children}</div>}
            </div>
            {action && <div className="shrink-0 self-center">{action}</div>}
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
                    <Button variant="text" color="error" icon={mdRefresh} onClick={onRetry ?? (() => window.location.reload())}>
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
        <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-16 text-center", className)}>
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
        <div className={cn("flex min-h-[40vh] w-full flex-col items-center justify-center gap-4 text-on-surface-variant", className)}>
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
            <div className={cn("mt-8 text-center type-body-m text-on-surface-variant", className)}>{allLoadedLabel}</div>
        ) : null;
    }
    return (
        <div className={cn("mt-8 flex justify-center", className)}>
            <Button variant="tonal" size="m" onClick={onLoadMore} data-shortcut-load-more="true">
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
    return <div className={cn("mx-auto w-full px-4 py-6 sm:px-6 sm:py-8", wide ? "max-w-[1600px]" : "max-w-7xl", className)}>{children}</div>;
}
