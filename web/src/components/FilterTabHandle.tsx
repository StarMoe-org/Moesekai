"use client";
import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQuickFilterContext } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { FILTER_DRAWER_ID } from "@/components/FilterDrawer";
import { md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import { Icon, cn } from "@/components/md3";
import { mdFilterList } from "@/components/md3/icons";

interface FilterTabHandleProps {
    /** Kept for API compatibility with MainLayout; the FAB is viewport-anchored. */
    isSidebarOpen: boolean;
}

/**
 * Quick-filter entry point — an MD3 Extended FAB anchored bottom-right.
 *
 * Shown whenever the page has registered filters and the filter sheet is not
 * already open (the open sheet carries its own close / collapse button).
 * Collapses to an icon-only FAB while the user is scrolling down, and extends
 * again when scrolling up — the standard M3 extended-FAB behaviour.
 */
export default function FilterTabHandle(_props: FilterTabHandleProps) {
    const { t } = useI18n();
    const reduced = useReducedMotion();
    const { hasFilters, isOpen, toggle, filterTitle } = useQuickFilterContext();
    const [extended, setExtended] = useState(true);

    useEffect(() => {
        let last = window.scrollY;
        const onScroll = () => {
            const y = window.scrollY;
            if (Math.abs(y - last) < 8) return;
            setExtended(y < last || y < 120);
            last = y;
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const isVisible = Boolean(hasFilters && !isOpen);
    const label = filterTitle || t("common.filter.title");

    const handleClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
        },
        [toggle],
    );

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.button
                    key="filter-fab"
                    type="button"
                    onClick={handleClick}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                    animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                    transition={reduced ? reducedMotionFade : md3SpatialDefault}
                    aria-controls={FILTER_DRAWER_ID}
                    aria-expanded={isOpen}
                    aria-label={t("common.filter.openQuickFilter")}
                    title={t("common.filter.openQuickFilter")}
                    data-filter-fab="true"
                    className={cn(
                        "state-layer focus-ring fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[70] flex h-14 cursor-pointer items-center gap-3 overflow-hidden rounded-md3-lg",
                        "bg-primary-container text-on-primary-container shadow-elev-3 hover:shadow-elev-4 sm:bottom-6 sm:right-6",
                        "transition-[padding,width,box-shadow] duration-300 ease-md3-spatial-fast",
                        extended ? "px-4" : "w-14 justify-center px-0",
                    )}
                >
                    <Icon path={mdFilterList} size={24} />
                    {extended && <span className="max-w-[12rem] truncate whitespace-nowrap type-label-l">{label}</span>}
                </motion.button>
            )}
        </AnimatePresence>
    );
}
