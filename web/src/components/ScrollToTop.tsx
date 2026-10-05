"use client";
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useI18n } from "@/contexts/I18nContext";
import { useQuickFilterContext } from "@/contexts/QuickFilterContext";
import { md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import { Icon, cn } from "@/components/md3";
import { mdArrowUpward } from "@/components/md3/icons";

/**
 * MD3 small FAB that scrolls back to the top. Stacks above the quick-filter FAB
 * when that one is visible, so the two never overlap.
 */
export default function ScrollToTop() {
    const { t } = useI18n();
    const reduced = useReducedMotion();
    const { hasFilters, isOpen } = useQuickFilterContext();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setIsVisible(window.scrollY > 300);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const filterFabVisible = hasFilters && !isOpen;

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.button
                    key="scroll-top"
                    type="button"
                    onClick={scrollToTop}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                    animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                    transition={reduced ? reducedMotionFade : md3SpatialDefault}
                    aria-label={t("layout.nav.scrollToTop")}
                    title={t("layout.nav.scrollToTop")}
                    className={cn(
                        "state-layer focus-ring fixed right-4 z-[69] flex h-10 w-10 cursor-pointer items-center justify-center rounded-md3-md",
                        "bg-surface-container-high text-primary shadow-elev-3 hover:shadow-elev-4 sm:right-6",
                        "transition-[bottom] duration-300 ease-md3-spatial",
                        // 56px filter FAB + 16px gap above it when present; otherwise the FAB slot.
                        filterFabVisible
                            ? "bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.5rem)] sm:bottom-[6.5rem]"
                            : "bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6",
                        filterFabVisible && "mr-2",
                    )}
                >
                    <Icon path={mdArrowUpward} size={24} />
                </motion.button>
            )}
        </AnimatePresence>
    );
}
