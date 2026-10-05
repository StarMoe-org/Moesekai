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
import { mdClose, mdFilterList, mdLeftPanelClose } from "@/components/md3/icons";
import { FilterDrawerContext } from "@/components/common/BaseFilters";
import { isKeyboardEventComposing } from "@/lib/shortcuts";

/**
 * Stable id shared by the trigger's `aria-controls` and the drawer's `id`.
 *
 * A constant rather than `useId()` because the two ends live in different
 * components (`FilterTabHandle` at the left edge, this drawer near the end of
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
 * - `>= 1024px (lg)`: standard (docked) side sheet, flush beside the navigation
 *   drawer and below the top app bar. The content column is pushed over by
 *   `--dual-rail-w` (see MainLayout); no scrim, no focus trap.
 * - `640–1023px`: modal side sheet with a scrim.
 * - `< 640px`: modal bottom sheet with a drag handle (swipe down to dismiss).
 */
export default function FilterDrawer({ isSidebarOpen }: FilterDrawerProps) {
    const { t } = useI18n();
    const pathname = usePathname();
    const { filterContent, filterTitle, hasFilters, isOpen, isDocked, close } = useQuickFilterContext();
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

            <AnimatePresence>
                {shouldShow && (
                    <motion.aside
                        key={isModal ? "filter-drawer-modal" : "filter-drawer-docked"}
                        initial={reducedMotion ? { opacity: 0 } : isModal && isCompact ? { y: "100%" } : { x: "-100%", opacity: 0 }}
                        animate={reducedMotion ? { opacity: 1 } : isModal && isCompact ? { y: 0 } : { x: 0, opacity: 1 }}
                        exit={reducedMotion ? { opacity: 0 } : isModal && isCompact ? { y: "100%" } : { x: "-100%", opacity: 0 }}
                        transition={reducedMotion ? reducedMotionFade : md3SpatialDefault}
                        drag={isModal && isCompact && !reducedMotion ? "y" : false}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.6 }}
                        onDragEnd={(_, info) => {
                            if (info.offset.y > 120 || info.velocity.y > 600) close();
                        }}
                        id={FILTER_DRAWER_ID}
                        role={isModal ? "dialog" : "complementary"}
                        aria-modal={isModal ? true : undefined}
                        aria-labelledby={titleId}
                        className={cn(
                            "fixed flex flex-col overflow-hidden text-on-surface",
                            isModal
                                ? cn(
                                      "z-[120] bg-surface-container-low shadow-elev-1",
                                      // compact: bottom sheet; medium: modal side sheet beside the nav drawer
                                      "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-md3-xl",
                                      "sm:inset-x-auto sm:bottom-0 sm:top-0 sm:max-h-none sm:w-[min(var(--filter-drawer-w),calc(100vw-3.5rem))] sm:rounded-none sm:rounded-r-md3-lg",
                                      isSidebarOpen ? "sm:left-0 md:left-[var(--sidebar-w)]" : "sm:left-0",
                                  )
                                : cn(
                                      "bottom-0 top-[var(--app-bar-h)] z-[58] w-[var(--filter-drawer-w)] border-r border-outline-variant bg-surface-container-low",
                                      isSidebarOpen ? "left-[var(--sidebar-w)]" : "left-0",
                                  ),
                        )}
                    >
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
                                    icon={isModal ? mdClose : mdLeftPanelClose}
                                    label={isModal ? t("common.action.close") : t("common.filter.collapse")}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        close();
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
                    </motion.aside>
                )}
            </AnimatePresence>
        </>
    );
    }
