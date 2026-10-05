"use client";
import React, { useId } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useI18n } from "@/contexts/I18nContext";
import { md3EasingEmphasizedAccelerate, md3EffectsDefault, md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { IconButton } from "./Button";
import { mdArrowBack, mdClose } from "./icons";
import { OverlayParentContext, useOverlay } from "./useOverlay";

/* ==========================================================================
   M3 Dialog
   - basic: 280–560px wide, 28px radius, surface-container-high, headline-s
   - fullscreen on compact windows when `fullscreenOnMobile` is set
   ========================================================================== */

export type DialogSize = "sm" | "md" | "lg" | "xl";

const SIZE: Record<DialogSize, string> = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-5xl",
};

export interface DialogProps {
    isOpen: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    /** Hero icon path shown above a centered headline. */
    icon?: string;
    supportingText?: React.ReactNode;
    children?: React.ReactNode;
    /** Bottom action row (typically text Buttons). */
    actions?: React.ReactNode;
    /** Extra header actions next to the close button (non-hero dialogs). */
    headerActions?: React.ReactNode;
    size?: DialogSize;
    /** Use the full-screen dialog layout below 600px. */
    fullscreenOnMobile?: boolean;
    /** Show a close icon button in the header. Default true when no actions are given. */
    showClose?: boolean;
    syncHistory?: boolean;
    /** Close when the scrim is clicked. Default true. */
    dismissible?: boolean;
    className?: string;
    bodyClassName?: string;
}

export function Dialog({
    isOpen,
    onClose,
    title,
    icon,
    supportingText,
    children,
    actions,
    headerActions,
    size = "md",
    fullscreenOnMobile,
    showClose,
    syncHistory = true,
    dismissible = true,
    className,
    bodyClassName,
}: DialogProps) {
    const { t } = useI18n();
    const titleId = useId();
    const reduced = useReducedMotion();
    const { mounted, close, overlayRef, overlayContext, onFocusCapture } = useOverlay(isOpen, onClose, { syncHistory, closeOnEscape: dismissible });
    if (!mounted) return null;

    const withClose = showClose ?? !actions;
    const centered = Boolean(icon);

    return createPortal(
        <OverlayParentContext.Provider value={overlayContext}>
        <AnimatePresence>
            {isOpen && (
                <div className={cn("fixed inset-0 z-[200] isolate flex items-center justify-center", fullscreenOnMobile ? "p-0 sm:p-6" : "p-4 sm:p-6")}>
                    <motion.div
                        className="absolute inset-0 bg-scrim/32"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={reduced ? reducedMotionFade : md3EffectsDefault}
                        onClick={dismissible ? close : undefined}
                    />
                    <motion.div
                        ref={overlayRef}
                        onFocusCapture={onFocusCapture}
                        role="dialog"
                        aria-modal="true"
                        tabIndex={-1}
                        aria-labelledby={title ? titleId : undefined}
                        className={cn(
                            "relative flex w-full flex-col overflow-hidden bg-surface-container-high text-on-surface shadow-elev-3",
                            SIZE[size],
                            fullscreenOnMobile
                                ? "h-full max-h-none rounded-none sm:h-auto sm:max-h-[85vh] sm:rounded-md3-xl"
                                : "max-h-[calc(100dvh-2rem)] rounded-md3-xl sm:max-h-[85vh]",
                            "min-w-[280px]",
                            className,
                        )}
                        style={{ transformOrigin: "top center" }}
                        initial={reduced ? { opacity: 0 } : { opacity: 0, scaleY: 0.8, y: -16 }}
                        animate={reduced ? { opacity: 1 } : { opacity: 1, scaleY: 1, y: 0, transition: md3SpatialDefault }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, scaleY: 0.9, y: -8, transition: { duration: 0.15, ease: md3EasingEmphasizedAccelerate } }}
                        transition={reduced ? reducedMotionFade : md3SpatialDefault}
                    >
                        {fullscreenOnMobile && (
                            <div className="flex h-14 shrink-0 items-center gap-1 px-1 sm:hidden">
                                <IconButton icon={mdArrowBack} label={t("common.md3.close")} onClick={close} />
                                {title && (
                                    <h2 id={titleId} className="flex-1 truncate type-title-l">
                                        {title}
                                    </h2>
                                )}
                                {headerActions}
                            </div>
                        )}
                        {(title || icon || withClose || headerActions) && (
                            <div
                                className={cn(
                                    "shrink-0 px-6 pt-6",
                                    centered ? "flex flex-col items-center text-center" : "flex items-start gap-2",
                                    // Mobile full-screen layout has its own top bar; hide this header there.
                                    fullscreenOnMobile && "max-sm:hidden",
                                )}
                            >
                                {icon && <Icon path={icon} size={24} className="mb-4 text-secondary" />}
                                {title && (
                                    <h2 id={fullscreenOnMobile ? undefined : titleId} className={cn("type-headline-s text-on-surface", !centered && "flex-1 pt-1")}>
                                        {title}
                                    </h2>
                                )}
                                {!centered && (headerActions || withClose) && (
                                    <div className="-mr-3 -mt-1 flex shrink-0 items-center gap-1">
                                        {headerActions}
                                        {withClose && <IconButton icon={mdClose} label={t("common.md3.close")} onClick={close} />}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 pb-6", (title || icon) ? "pt-4" : "pt-6", bodyClassName)}>
                            {supportingText && <div className="mb-4 type-body-m text-on-surface-variant">{supportingText}</div>}
                            {children}
                        </div>
                        {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-6 pb-6">{actions}</div>}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        </OverlayParentContext.Provider>,
        document.body,
    );
}

export default Dialog;
