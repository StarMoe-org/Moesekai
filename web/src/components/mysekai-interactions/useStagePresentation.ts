"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

interface PresentationReturn {
    x: number;
    y: number;
    overflow: string;
    focus: HTMLElement | null;
    background: { element: HTMLElement; inert: boolean }[];
}

/** Presentation changes keep the stage element and renderer realm in place. */
export function useStagePresentation(stage: RefObject<HTMLElement | null>, available = true) {
    const [immersive, setImmersive] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [failed, setFailed] = useState(false);
    const saved = useRef<PresentationReturn | null>(null);
    const remember = useCallback(() => {
        if (!saved.current) saved.current = {
            x: window.scrollX, y: window.scrollY, overflow: document.body.style.overflow,
            focus: document.activeElement instanceof HTMLElement ? document.activeElement : null, background: [],
        };
        return saved.current;
    }, []);
    const leave = useCallback(() => {
        const element = stage.current;
        if (element && document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
        if (element?.hasAttribute("popover")) {
            if (element.matches(":popover-open")) element.hidePopover();
            element.removeAttribute("popover");
        }
        const previous = saved.current;
        if (previous) {
            saved.current = null;
            for (const { element: sibling, inert } of previous.background) sibling.inert = inert;
            document.body.style.overflow = previous.overflow;
            if (previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
            window.scrollTo({ left: previous.x, top: previous.y, behavior: "instant" });
        }
        setImmersive(false);
        setFailed(false);
    }, [stage]);
    const enter = useCallback(() => {
        const element = stage.current;
        if (!element?.isConnected) return;
        const previous = remember();
        if (!previous.background.length) {
            // A manual popover is not modal. Isolate sibling branches without
            // reparenting any ancestor (moving an iframe destroys its realm).
            let branch: HTMLElement = element;
            while (branch.parentElement) {
                for (const sibling of branch.parentElement.children) {
                    if (sibling !== branch && sibling instanceof HTMLElement) {
                        previous.background.push({ element: sibling, inert: sibling.inert });
                        sibling.inert = true;
                    }
                }
                if (branch.parentElement === document.body) break;
                branch = branch.parentElement;
            }
        }
        document.body.style.overflow = "hidden";
        // The top layer avoids transformed/contained MainLayout ancestors.
        if (typeof element.showPopover === "function" && document.fullscreenElement !== element) {
            element.setAttribute("popover", "manual");
            if (!element.matches(":popover-open")) element.showPopover();
        }
        setFailed(false);
        setImmersive(true);
        element.focus({ preventScroll: true });
    }, [stage, remember]);
    const browserFullscreen = useCallback(async () => {
        const element = stage.current;
        if (!element) return;
        if (document.fullscreenElement === element) { await document.exitFullscreen(); return; }
        // A popover cannot requestFullscreen. Hide only its presentation first.
        if (element.hasAttribute("popover")) {
            if (element.matches(":popover-open")) element.hidePopover();
            element.removeAttribute("popover");
        }
        remember();
        setFailed(false);
        try {
            if (!document.fullscreenEnabled || !element.requestFullscreen) throw new Error("Fullscreen unavailable");
            await element.requestFullscreen();
            enter();
        } catch {
            enter(); // Webpage immersive remains usable on unsupported phones.
            setFailed(true);
        }
    }, [stage, enter, remember]);
    // WorkspaceStage remains mounted when session becomes null. Resource
    // cleanup therefore follows availability, not just component unmount.
    useEffect(() => () => leave(), [available, leave]);
    useEffect(() => {
        const change = () => {
            const active = Boolean(stage.current && document.fullscreenElement === stage.current);
            setFullscreen(active);
            if (!active && !stage.current?.hasAttribute("popover")) leave();
        };
        const keyboard = (event: KeyboardEvent) => {
            const element = stage.current;
            if (!saved.current || !element) return;
            if (event.key === "Escape") { event.preventDefault(); leave(); return; }
            if (event.key !== "Tab") return;
            const controls = Array.from(element.querySelectorAll<HTMLElement>(
                "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),iframe,[tabindex]:not([tabindex='-1'])"))
                .filter(control => !control.closest("[inert]") && control.getClientRects().length > 0);
            const first = controls[0], last = controls.at(-1), active = document.activeElement;
            if (!first || (event.shiftKey && (active === first || active === element)) || (!event.shiftKey && active === last)) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus({ preventScroll: true });
            }
        };
        const message = (event: MessageEvent) => {
            const frame = stage.current?.querySelector("iframe");
            if (event.origin === location.origin && event.source === frame?.contentWindow && event.data?.source === "moly"
                && event.data?.schemaVersion === 2 && event.data?.type === "exit-immersive") leave();
        };
        document.addEventListener("fullscreenchange", change);
        window.addEventListener("keydown", keyboard);
        window.addEventListener("message", message);
        return () => {
            document.removeEventListener("fullscreenchange", change);
            window.removeEventListener("keydown", keyboard);
            window.removeEventListener("message", message);
            leave();
        };
    }, [stage, leave]);
    return { immersive, fullscreen, failed, enter, leave, browserFullscreen };
}
