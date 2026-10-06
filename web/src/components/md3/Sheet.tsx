"use client";
import React, { useId } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { useI18n } from "@/contexts/I18nContext";
import { md3EffectsDefault, md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import { cn } from "./cn";
import { IconButton } from "./Button";
import { mdClose } from "./icons";
import { OverlayParentContext, useOverlay } from "./useOverlay";

/* ==========================================================================
   M3 Sheets
   - BottomSheet (modal): drag handle, 28px top corners, swipe-down to close
   - SideSheet (modal): slides from an edge, 16px inner corners
   Standard (docked) side sheets are just a <Surface> placed in the layout.
   ========================================================================== */

interface SheetBaseProps {
    isOpen: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    headerActions?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    syncHistory?: boolean;
    className?: string;
    bodyClassName?: string;
}

export function BottomSheet({ isOpen, onClose, title, headerActions, children, footer, syncHistory = true, className, bodyClassName }: SheetBaseProps) {
    const { t } = useI18n();
    const reduced = useReducedMotion();
    const titleId = useId();
    const { mounted, close, overlayRef, overlayContext, onFocusCapture } = useOverlay(isOpen, onClose, { syncHistory });
    if (!mounted) return null;

    const onDragEnd = (_: unknown, info: PanInfo) => {
        if (info.offset.y > 120 || info.velocity.y > 600) close();
    };

    return createPortal(
        <OverlayParentContext.Provider value={overlayContext}>
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] isolate flex items-end justify-center">
                    <motion.div
                        className="absolute inset-0 bg-scrim/32"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={reduced ? reducedMotionFade : md3EffectsDefault}
                        onClick={close}
                    />
                    <motion.div
                        ref={overlayRef}
                        onFocusCapture={onFocusCapture}
                        role="dialog"
                        aria-modal="true"
                        tabIndex={-1}
                        aria-labelledby={title ? titleId : undefined}
                        className={cn(
                            "relative flex max-h-[90dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-md3-xl bg-surface-container-low text-on-surface shadow-elev-1",
                            className,
                        )}
                        initial={reduced ? { opacity: 0 } : { y: "100%" }}
                        animate={reduced ? { opacity: 1 } : { y: 0 }}
                        exit={reduced ? { opacity: 0 } : { y: "100%" }}
                        transition={reduced ? reducedMotionFade : md3SpatialDefault}
                        drag={reduced ? false : "y"}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.6 }}
                        onDragEnd={onDragEnd}
                    >
                        <div className="flex shrink-0 cursor-grab justify-center py-4 active:cursor-grabbing" aria-label={t("common.md3.dragHandle")}>
                            <span className="h-1 w-8 rounded-full bg-on-surface-variant/40" />
                        </div>
                        {(title || headerActions) && (
                            <div className="flex shrink-0 items-center gap-2 px-6 pb-2">
                                {title && (
                                    <h2 id={titleId} className="flex-1 type-title-l">
                                        {title}
                                    </h2>
                                )}
                                {headerActions}
                            </div>
                        )}
                        <div
                            className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]", bodyClassName)}
                            onPointerDownCapture={(e) => e.stopPropagation()}
                        >
                            {children}
                        </div>
                        {footer && <div className="shrink-0 border-t border-outline-variant px-6 py-4">{footer}</div>}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        </OverlayParentContext.Provider>,
        document.body,
    );
}

export interface SideSheetProps extends SheetBaseProps {
    side?: "left" | "right";
    /** Width class (default w-[min(400px,100vw-3.5rem)]). */
    widthClassName?: string;
    showClose?: boolean;
    /** Inset modal presentation; leaves the default edge-attached sheet unchanged. */
    floating?: boolean;
}

export function SideSheet({
    isOpen,
    onClose,
    title,
    headerActions,
    children,
    footer,
    side = "right",
    widthClassName = "w-[min(400px,calc(100vw-3.5rem))]",
    showClose = true,
    floating = false,
    syncHistory = true,
    className,
    bodyClassName,
}: SideSheetProps) {
    const { t } = useI18n();
    const reduced = useReducedMotion();
    const titleId = useId();
    const { mounted, close, overlayRef, overlayContext, onFocusCapture } = useOverlay(isOpen, onClose, { syncHistory });
    if (!mounted) return null;
    const from = side === "right" ? "100%" : "-100%";

    return createPortal(
        <OverlayParentContext.Provider value={overlayContext}>
        <AnimatePresence>
            {isOpen && (
                <div className={cn("fixed inset-0 z-[200] isolate flex", floating && "p-3", side === "right" ? "justify-end" : "justify-start")}>
                    <motion.div
                        className="absolute inset-0 bg-scrim/32"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={reduced ? reducedMotionFade : md3EffectsDefault}
                        onClick={close}
                    />
                    <motion.div
                        ref={overlayRef}
                        onFocusCapture={onFocusCapture}
                        role="dialog"
                        aria-modal="true"
                        tabIndex={-1}
                        aria-labelledby={title ? titleId : undefined}
                        className={cn(
                            "relative flex h-full flex-col bg-surface-container-low text-on-surface",
                            floating ? "overflow-hidden rounded-md3-xl shadow-elev-3" : "shadow-elev-1",
                            !floating && (side === "right" ? "rounded-l-md3-lg" : "rounded-r-md3-lg"),
                            widthClassName,
                            className,
                        )}
                        initial={reduced ? { opacity: 0 } : { x: from }}
                        animate={reduced ? { opacity: 1 } : { x: 0 }}
                        exit={reduced ? { opacity: 0 } : { x: from }}
                        transition={reduced ? reducedMotionFade : md3SpatialDefault}
                    >
                        <div className="flex h-[72px] shrink-0 items-center gap-2 pl-6 pr-3">
                            {title && (
                                <h2 id={titleId} className="flex-1 truncate type-title-l">
                                    {title}
                                </h2>
                            )}
                            {headerActions}
                            {showClose && <IconButton icon={mdClose} label={t("common.md3.close")} onClick={close} />}
                        </div>
                        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6", bodyClassName)}>{children}</div>
                        {footer && <div className="shrink-0 border-t border-outline-variant px-6 py-4">{footer}</div>}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        </OverlayParentContext.Provider>,
        document.body,
    );
}
