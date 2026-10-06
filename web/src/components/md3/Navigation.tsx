"use client";
import React from "react";
import LocalizedLink from "@/components/LocalizedLink";
import { cn } from "./cn";
import { Icon } from "./Icon";

/* ==========================================================================
   M3 navigation primitives
   - NavigationDrawerItem: 56px pill, secondary-container active indicator
   - NavigationRailItem:   icon in 56×32 pill + label (collapsed rail)
   - NavigationBar(Item):  bottom bar for compact windows (Expressive: 64px,
                           horizontal items on medium widths)
   - TopAppBar:            small / center-aligned / medium / large
   ========================================================================== */

interface NavItemBaseProps {
    href: string;
    label: React.ReactNode;
    /** Icon path (outlined / inactive). */
    icon?: string;
    /** Icon path when active (filled). */
    activeIcon?: string;
    /** Custom leading node (overrides icon). */
    leading?: React.ReactNode;
    active?: boolean;
    badge?: React.ReactNode;
    onClick?: () => void;
    prefetch?: boolean;
    className?: string;
    /** Extra data attributes (e.g. keyboard nav index). */
    dataAttrs?: Record<`data-${string}`, string | number | boolean>;
}

export function NavigationDrawerItem({
    href,
    label,
    icon,
    activeIcon,
    leading,
    active,
    badge,
    onClick,
    prefetch = false,
    className,
    dataAttrs,
    density = "standard",
}: NavItemBaseProps & { density?: "standard" | "compact" }) {
    const path = active && activeIcon ? activeIcon : icon;
    return (
        <LocalizedLink
            href={href}
            prefetch={prefetch}
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            className={cn(
                "state-layer focus-ring flex items-center gap-3 rounded-full type-label-l",
                density === "compact" ? "h-12 px-3 lg:h-10 [@media(any-pointer:coarse)]:min-h-12" : "h-14 pl-4 pr-6",
                active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
                className,
            )}
            {...dataAttrs}
        >
            {leading ?? (path && <Icon path={path} size={density === "compact" ? 20 : 24} />)}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {badge && <span className="type-label-l">{badge}</span>}
        </LocalizedLink>
    );
}

export function NavigationRailItem({ href, label, icon, activeIcon, leading, active, badge, onClick, prefetch = false, className, dataAttrs }: NavItemBaseProps) {
    const path = active && activeIcon ? activeIcon : icon;
    return (
        <LocalizedLink
            href={href}
            prefetch={prefetch}
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            className={cn("group/rail focus-ring flex w-full flex-col items-center gap-1 rounded-md3-lg py-1", className)}
            {...dataAttrs}
        >
            <span
                className={cn(
                    "state-layer relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ease-md3-standard",
                    active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
                )}
            >
                {leading ?? (path && <Icon path={path} size={24} />)}
                {badge && <span className="absolute -right-0.5 -top-0.5">{badge}</span>}
            </span>
            <span className={cn("max-w-full truncate px-1 text-center type-label-m", active ? "text-secondary" : "text-on-surface-variant")}>
                {label}
            </span>
        </LocalizedLink>
    );
}

export function NavigationBar({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
    return (
        <nav
            className={cn(
                "flex h-16 items-stretch justify-around bg-surface-container text-on-surface pb-[env(safe-area-inset-bottom)] box-content",
                className,
            )}
            {...rest}
        >
            {children}
        </nav>
    );
}

export function NavigationBarItem({
    href,
    label,
    icon,
    activeIcon,
    leading,
    active,
    badge,
    onClick,
    prefetch = false,
    className,
    asButton,
}: NavItemBaseProps & { asButton?: boolean }) {
    const path = active && activeIcon ? activeIcon : icon;
    const inner = (
        <>
            <span
                className={cn(
                    "state-layer relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ease-md3-standard",
                    active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
                )}
            >
                {leading ?? (path && <Icon path={path} size={24} />)}
                {badge && <span className="absolute -right-0.5 -top-0.5">{badge}</span>}
            </span>
            <span className={cn("max-w-full truncate type-label-m", active ? "text-secondary" : "text-on-surface-variant")}>{label}</span>
        </>
    );
    const cls = cn("focus-ring flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-1.5 pb-2 cursor-pointer", className);
    if (asButton) {
        return (
            <button type="button" onClick={onClick} className={cls} aria-pressed={active}>
                {inner}
            </button>
        );
    }
    return (
        <LocalizedLink href={href} prefetch={prefetch} onClick={onClick} aria-current={active ? "page" : undefined} className={cls}>
            {inner}
        </LocalizedLink>
    );
}

/* ── Top app bar ──────────────────────────────────────────────────────── */

export type TopAppBarVariant = "small" | "center" | "medium" | "large";

export interface TopAppBarProps {
    variant?: TopAppBarVariant;
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Leading navigation icon button. */
    navigation?: React.ReactNode;
    /** Trailing action icon buttons. */
    actions?: React.ReactNode;
    /** Elevated / scrolled state: switches to surface-container. */
    scrolled?: boolean;
    className?: string;
    children?: React.ReactNode;
}

export function TopAppBar({ variant = "small", title, subtitle, navigation, actions, scrolled, className, children }: TopAppBarProps) {
    const bg = scrolled ? "bg-surface-container" : "bg-surface";
    const row = (
        <div className="flex h-16 items-center gap-1 px-1">
            {navigation && <div className="flex shrink-0 items-center">{navigation}</div>}
            <div className={cn("min-w-0 flex-1", variant === "center" && "text-center", !navigation && "pl-3")}>
                {(variant === "small" || variant === "center") && title && (
                    <>
                        <div className="truncate type-title-l text-on-surface">{title}</div>
                        {subtitle && <div className="truncate type-label-m text-on-surface-variant">{subtitle}</div>}
                    </>
                )}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-0.5 pr-1">{actions}</div>}
        </div>
    );
    return (
        <header className={cn("w-full text-on-surface transition-colors duration-200 ease-md3-standard", bg, className)}>
            {row}
            {(variant === "medium" || variant === "large") && title && (
                <div className={cn("px-4", variant === "medium" ? "pb-6" : "pb-7 pt-10")}>
                    <h1 className={cn("text-on-surface", variant === "medium" ? "type-headline-s" : "type-display-s")}>{title}</h1>
                    {subtitle && <p className="mt-1 type-title-m text-on-surface-variant">{subtitle}</p>}
                </div>
            )}
            {children}
        </header>
    );
}
