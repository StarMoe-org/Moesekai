"use client";
import React, { useCallback, useEffect, useId, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { stripRouteLocale } from "@/lib/localized-path";
import { useQuickFilterContext } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Icon, IconButton, cn } from "@/components/md3";
import { mdClose, mdFilterList, mdLeftPanelClose, mdLeftPanelOpen } from "@/components/md3/icons";
import { FilterDrawerContext } from "@/components/common/BaseFilters";
import { isKeyboardEventComposing } from "@/lib/shortcuts";

/**
 * Stable id shared by the trigger's `aria-controls` and the drawer's `id`.
 *
 * A constant rather than `useId()` because the two ends live in different
 * components (`FilterTabHandle`'s FAB, this drawer near the end of
 * the layout) and would otherwise each mint their own value. The pairing is
 * only ever one-to-one — there is a single drawer per document — so a literal
 * is both correct and inspectable in devtools.
 */
export const FILTER_DRAWER_ID = "filter-drawer";

/** Scrim fade. Shorter than the panel, so dismissal never lags behind. */
const SCRIM_TRANSITION = { type: "tween", duration: 0.2, ease: [0.2, 0, 0, 1] } as const;

interface FilterDrawerProps {
    /** Whether the primary left navigation sidebar is currently open. */
    isSidebarOpen: boolean;
}

/**
 * FilterDrawer — the single home for every page's filter panel (MD3 side sheet).
 *
 * - `>= 1600px (xlarge)`: standard (docked) side sheet, flush beside the navigation
 *   drawer and below the top app bar. The content column is pushed over by
 *   `--dual-rail-w` (see MainLayout); no scrim, no focus trap.
 * - `640–1599px`: modal side sheet with a scrim, on the right edge beside the FAB
 *   that opens it (FilterTabHandle); the navigation drawer stays where it is.
 * - `< 640px`: modal bottom sheet with a drag handle (swipe down to dismiss).
 */
export default function FilterDrawer({ isSidebarOpen }: FilterDrawerProps) {
    const { t } = useI18n();
    const pathname = usePathname();
    const { filterContent, filterTitle, hasFilters, isOpen, isDocked, open, close } = useQuickFilterContext();
    const titleId = useId();
    const reducedMotion = useReducedMotion();
    /** Compact window (< 640px): the modal sheet is a bottom sheet. */
    const isCompact = !useMediaQuery("(min-width: 640px)", true);

    const panelRef = useRef<HTMLDivElement>(null);
    const mountTimeRef = useRef<number>(0);

    // Whether the drawer is behaving modally. Docked drawers are ordinary page
    // furniture and must NOT trap focus or eat Escape.
    const isModal = Boolean(isOpen && hasFilters && !isDocked);
    const shouldShow = Boolean(hasFilters && filterContent && isOpen);
    // Docked, the pane stays mounted whether open or collapsed: collapsing narrows it to a
    // rail in place, so the way back in stays beside the content instead of moving to the FAB.
    const showDocked = Boolean(hasFilters && filterContent && isDocked);

    // Keyboard focus follows the docked toggle: onto the rail after collapsing (the collapse
    // button goes inert), back onto the collapse button after expanding.
    const railRef = useRef<HTMLButtonElement>(null);
    const collapseRef = useRef<HTMLButtonElement>(null);
    const collapseDocked = useCallback(() => {
        close();
        requestAnimationFrame(() => railRef.current?.focus({ preventScroll: true }));
    }, [close]);
    const expandDocked = useCallback(() => {
        open();
        requestAnimationFrame(() => collapseRef.current?.focus({ preventScroll: true }));
    }, [open]);

    // Track modal open timestamp to guard against click-through on mobile.
    useEffect(() => {
        if (isModal) {
            mountTimeRef.current = Date.now();
        }
    }, [isModal]);


    // Focus management, floating mode only.
    useEffect(() => {
        if (!isModal) return;

        // Skip autofocus on touch devices to avoid virtual keyboard / viewport jump.
        if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
            return;
        }

        const panel = panelRef.current;

        // One frame late: the panel is mounted by AnimatePresence in the same
        // commit, and focusing a node mid-enter transition makes some browsers
        // scroll the (still off-screen) panel into view.
        const raf = requestAnimationFrame(() => {
            if (!panel) return;
            if (panel.contains(document.activeElement)) return;
            panel.focus({ preventScroll: true });
        });

        return () => {
            cancelAnimationFrame(raf);
            // Only reclaim focus if it is still inside the drawer we are closing.
            const activeInPanel = panel?.contains(document.activeElement) ?? false;
            if (!activeInPanel) return;
            const trigger = document.querySelector<HTMLElement>(
                `[aria-controls="${FILTER_DRAWER_ID}"]`
            );
            trigger?.focus({ preventScroll: true });
        };
    }, [isModal]);

    // Escape closes, floating mode only. Registered in the capture phase so the
    // drawer wins over page-level list shortcuts that also listen for Escape.
    useEffect(() => {
        if (!isModal) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented || isKeyboardEventComposing(event)) return;
            event.preventDefault();
            event.stopPropagation();
            close();
        };

        document.addEventListener("keydown", handleKeyDown, true);
        return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [isModal, close]);

    // Background scroll lock, floating mode only.
    useEffect(() => {
        if (!isModal) return;
        // Skip locking body overflow on touch devices to prevent full-page layout reflow and viewport flicker.
        // The modal scrim and drawer content with `overscroll-contain` already prevent background scrolling natively.
        if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
            return;
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isModal]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const hasRestoredRef = useRef(false);
    // Scroll restoration for the filter drawer per route.
    const cleanPathname = stripRouteLocale(pathname);
    const scrollStorageKey = `filter_drawer_scroll:${cleanPathname}`;

    // Restore scroll position when drawer opens and content is mounted (once per open)
    useEffect(() => {
        if (!isOpen) {
            hasRestoredRef.current = false;
            return;
        }

        if (hasRestoredRef.current || !filterContent) return;

        const saved = sessionStorage.getItem(scrollStorageKey);
        if (saved) {
            const top = parseInt(saved, 10);
            if (!Number.isNaN(top) && top > 0) {
                requestAnimationFrame(() => {
                    if (scrollRef.current) {
                        scrollRef.current.scrollTop = top;
                    }
                });
            }
        }
        hasRestoredRef.current = true;
    }, [isOpen, scrollStorageKey, filterContent]);

    // Save scroll position on user scrolling
    const handleBodyScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const top = e.currentTarget.scrollTop;
        sessionStorage.setItem(scrollStorageKey, String(top));
    }, [scrollStorageKey]);

    const scrimPointerDownRef = useRef(false);

    const handleScrimPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            scrimPointerDownRef.current = true;
        }
    }, []);

    const handleScrimClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // Prevent click-through / ghost clicks from triggers that just opened the modal.
        if (Date.now() - mountTimeRef.current < 400) {
            scrimPointerDownRef.current = false;
            return;
        }
        // Both halves of the gesture must have landed on the scrim itself:
        // a drag that started inside the panel must never dismiss it.
        if (scrimPointerDownRef.current && e.target === e.currentTarget) {
            scrimPointerDownRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            close();
        }
        scrimPointerDownRef.current = false;
    }, [close]);

    const resolvedTitle = filterTitle || t("common.filter.title");

    // Header and filter body, shared by the floating sheet and the docked pane.
    const sheet = (
        <div ref={panelRef} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
            {/* Drag handle (bottom sheet only) */}
            {isModal && (
                <div className="flex shrink-0 cursor-grab justify-center pb-1 pt-3 active:cursor-grabbing sm:hidden" aria-hidden="true">
                    <span className="h-1 w-8 rounded-full bg-on-surface-variant/40" />
                </div>
            )}

            {/* Header */}
            <div className="flex h-14 shrink-0 items-center gap-2 pl-5 pr-2 sm:h-16">
                <Icon path={mdFilterList} size={24} className="text-primary" />
                <h2 id={titleId} className="min-w-0 flex-1 truncate type-title-m">
                    {resolvedTitle}
                </h2>
                <IconButton
                    ref={collapseRef}
                    icon={isModal ? mdClose : mdLeftPanelClose}
                    label={isModal ? t("common.action.close") : t("common.filter.collapse")}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (isModal) close();
                        else collapseDocked();
                    }}
                />
            </div>

            {/* The one and only mount point for page filters. */}
            <FilterDrawerContext.Provider value={true}>
                <div
                    ref={scrollRef}
                    data-filter-drawer-body="true"
                    onScroll={handleBodyScroll}
                    onPointerDownCapture={isModal && isCompact ? (e) => e.stopPropagation() : undefined}
                    className="min-h-0 flex-grow overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1"
                >
                    {filterContent}
                </div>
            </FilterDrawerContext.Provider>
        </div>
    );

    return (
        <>
            {/* Scrim — modal (floating) sheet only */}
            <AnimatePresence>
                {isModal && (
                    <motion.div
                        key="filter-drawer-scrim"
                        className="fixed inset-0 z-[115] bg-scrim/32 touch-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={SCRIM_TRANSITION}
                        onPointerDown={handleScrimPointerDown}
                        onClick={handleScrimClick}
                        aria-hidden="true"
                    />
                )}
            </AnimatePresence>

            {/* Floating (modal) sheet: slides in from the right edge, on the side of the FAB that
                opens it, or up from the bottom on compact screens. */}
            <AnimatePresence>
                {shouldShow && isModal && (
                    <motion.aside
                        key="filter-drawer-modal"
                        initial={reducedMotion ? { opacity: 0 } : isCompact ? { y: "100%" } : { x: "100%", opacity: 0 }}
                        animate={reducedMotion ? { opacity: 1 } : isCompact ? { y: 0 } : { x: 0, opacity: 1 }}
                        exit={reducedMotion ? { opacity: 0 } : isCompact ? { y: "100%" } : { x: "100%", opacity: 0 }}
                        transition={reducedMotion ? reducedMotionFade : md3SpatialDefault}
                        drag={isCompact && !reducedMotion ? "y" : false}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.6 }}
                        onDragEnd={(_, info) => {
                            if (info.offset.y > 120 || info.velocity.y > 600) close();
                        }}
                        id={FILTER_DRAWER_ID}
                        role="dialog"
                        aria-modal={true}
                        aria-labelledby={titleId}
                        className={cn(
                            "fixed z-[120] flex flex-col overflow-hidden text-on-surface glass-thick",
                            // compact: bottom sheet; medium: modal side sheet on the right edge
                            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-md3-xl",
                            "sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-0 sm:max-h-none sm:w-[min(var(--filter-drawer-w),calc(100vw-3.5rem))] sm:rounded-none sm:rounded-l-md3-lg",
                        )}
                    >
                        {sheet}
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Docked pane: stays mounted and narrows to a rail in place when collapsed. Its width
                eases exactly like the content column's margin in MainLayout, so the pane's edge and
                the content move as one; the sheet fades out before the rail's contents fade in. */}
            {showDocked && (
                <aside
                    id={FILTER_DRAWER_ID}
                    role="complementary"
                    aria-labelledby={titleId}
                    className={cn(
                        "glass fixed bottom-3 top-[calc(var(--app-bar-h)+0.75rem)] z-[58] overflow-hidden rounded-md3-xl text-on-surface",
                        "transition-[width,left] duration-400 ease-md3-emphasized motion-reduce:transition-none",
                        isSidebarOpen ? "left-[calc(var(--sidebar-w)+0.75rem)]" : "left-3",
                        isOpen ? "w-[calc(var(--filter-drawer-w)-1.5rem)]" : "w-14",
                    )}
                >
                    {/* Fixed width, so the sheet is clipped rather than reflowed while the pane narrows. */}
                    <div
                        inert={!isOpen}
                        className={cn(
                            "flex h-full w-[calc(var(--filter-drawer-w)-1.5rem)] flex-col transition-opacity ease-md3-standard",
                            isOpen ? "opacity-100 delay-100 duration-200" : "opacity-0 duration-100",
                        )}
                    >
                        {sheet}
                    </div>
                    <button
                        ref={railRef}
                        type="button"
                        inert={isOpen}
                        onClick={expandDocked}
                        aria-controls={FILTER_DRAWER_ID}
                        aria-expanded={false}
                        aria-label={t("common.filter.expand")}
                        title={t("common.filter.expand")}
                        className={cn(
                            "state-layer focus-ring absolute inset-y-0 left-0 flex w-14 cursor-pointer flex-col items-center rounded-md3-xl text-on-surface-variant transition-opacity ease-md3-standard",
                            isOpen ? "opacity-0 duration-100" : "opacity-100 delay-100 duration-200",
                        )}
                    >
                        {/* Same height as the sheet's header, so expand sits where collapse was. */}
                        <span className="flex h-16 shrink-0 items-center">
                            <Icon path={mdLeftPanelOpen} size={24} />
                        </span>
                        <Icon path={mdFilterList} size={20} className="text-primary" />
                        <span className="mt-2 max-h-[60%] overflow-hidden type-label-l [writing-mode:vertical-rl]">{resolvedTitle}</span>
                    </button>
                </aside>
            )}
        </>
    );
    }
