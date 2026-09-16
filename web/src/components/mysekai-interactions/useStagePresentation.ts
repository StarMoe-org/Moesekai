"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Presentation changes keep the stage element and renderer realm in place. */
export function useStagePresentation(stage: RefObject<HTMLElement | null>) {
    const [immersive, setImmersive] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [failed, setFailed] = useState(false);
    const saved = useRef<{ x: number; y: number; overflow: string; focus: HTMLElement | null } | null>(null);
    const leave = useCallback(() => {
        const element = stage.current;
        if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
        if (element?.hasAttribute("popover")) {
            if (element.matches(":popover-open")) element.hidePopover();
            element.removeAttribute("popover");
        }
        const previous = saved.current;
        if (previous) {
            document.body.style.overflow = previous.overflow;
            saved.current = null;
            previous.focus?.focus({ preventScroll: true });
            window.scrollTo({ left: previous.x, top: previous.y, behavior: "instant" });
        }
        setImmersive(false);
    }, [stage]);
    const enter = useCallback(() => {
        const element = stage.current;
        if (!element) return;
        if (!saved.current) saved.current = { x: window.scrollX, y: window.scrollY, overflow: document.body.style.overflow,
            focus: document.activeElement instanceof HTMLElement ? document.activeElement : null };
        document.body.style.overflow = "hidden";
        // The top layer avoids transformed/contained MainLayout ancestors.
        // No portal/reparenting: either would destroy the iframe's document.
        if (typeof element.showPopover === "function" && document.fullscreenElement !== element) {
            element.setAttribute("popover", "manual");
            element.showPopover();
        }
        setImmersive(true);
        element.focus({ preventScroll: true });
    }, [stage]);
    const browserFullscreen = useCallback(async () => {
        const element = stage.current;
        if (!element) return;
        if (document.fullscreenElement === element) { await document.exitFullscreen(); return; }
        // A popover cannot requestFullscreen. Hide only its presentation first.
        if (element.hasAttribute("popover")) {
            if (element.matches(":popover-open")) element.hidePopover();
            element.removeAttribute("popover");
        }
        if (!saved.current) saved.current = { x: window.scrollX, y: window.scrollY,
            overflow: document.body.style.overflow,
            focus: document.activeElement instanceof HTMLElement ? document.activeElement : null };
        setFailed(false);
        try {
            if (!document.fullscreenEnabled || !element.requestFullscreen) throw new Error("Fullscreen unavailable");
            // Must be called synchronously from the user's gesture, before await.
            await element.requestFullscreen();
            enter();
        } catch {
            enter(); // Webpage immersive remains usable on unsupported phones.
            setFailed(true);
        }
    }, [stage, enter]);
    useEffect(() => {
        const change = () => {
            const active = document.fullscreenElement === stage.current;
            setFullscreen(active);
            if (!active && !stage.current?.hasAttribute("popover")) leave();
        };
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && saved.current) leave(); };
        const message = (event: MessageEvent) => {
            const frame = stage.current?.querySelector("iframe");
            if (event.origin === location.origin && event.source === frame?.contentWindow && event.data?.source === "moly"
                && event.data?.schemaVersion === 2 && event.data?.type === "exit-immersive") leave();
        };
        document.addEventListener("fullscreenchange", change);
        window.addEventListener("keydown", escape);
        window.addEventListener("message", message);
        return () => { document.removeEventListener("fullscreenchange", change); window.removeEventListener("keydown", escape);
            window.removeEventListener("message", message); leave(); };
    }, [stage, leave]);
    return { immersive, fullscreen, failed, enter, leave, browserFullscreen };
}
