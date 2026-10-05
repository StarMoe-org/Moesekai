"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { isKeyboardEventComposing } from "@/lib/shortcuts";

/**
 * Shared overlay behaviour for MD3 Dialog / Sheet:
 * - locks body scroll while open
 * - closes on Escape (IME-safe)
 * - optionally pushes a history entry so the mobile back button closes the overlay
 * - returns `mounted` for portal rendering after hydration
 */
export function useOverlay(isOpen: boolean, onClose: () => void, { syncHistory = true, closeOnEscape = true } = {}) {
    const [mounted, setMounted] = useState(false);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);
    const stableOnClose = useCallback(() => onCloseRef.current(), []);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        let didPushHistory = false;
        let rafId: number | null = null;
        const handlePopState = () => stableOnClose();
        const handleKeyDown = (e: KeyboardEvent) => {
            if (closeOnEscape && e.key === "Escape" && !e.defaultPrevented && !isKeyboardEventComposing(e)) {
                e.preventDefault();
                stableOnClose();
            }
        };

        if (syncHistory) {
            if (!window.history.state?.modal) {
                window.history.pushState({ ...(window.history.state ?? {}), modal: true }, "");
                didPushHistory = true;
            }
            // Delay listener registration by a frame so any popstate triggered by the
            // pushState above (e.g. trailingSlash normalisation) is ignored.
            rafId = requestAnimationFrame(() => window.addEventListener("popstate", handlePopState));
        }
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            document.body.style.overflow = previousBodyOverflow;
            if (syncHistory) {
                window.removeEventListener("popstate", handlePopState);
                if (didPushHistory && window.history.state?.modal) window.history.back();
            }
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, stableOnClose, syncHistory, closeOnEscape]);

    return { mounted, close: stableOnClose };
}
