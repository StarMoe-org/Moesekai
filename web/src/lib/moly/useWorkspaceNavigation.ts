"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MolyTab } from "./contract";
import { parseWorkspaceNavigation, workspaceQuery, type WorkspaceNavigation } from "./workspaceNavigation";

interface ScrollPosition { y: number; detail: number; anchor?: string; anchorTop?: number; }
interface HistoryEntry { owner: "mysekai-workspace-v1"; parent: string | null; scroll: ScrollPosition; }
interface CommitOptions { replace?: boolean; scroll?: "preserve" | "catalog" | "detail" | "top"; }
const stateKey = "mysekaiWorkspace";
const detailElement = () => document.querySelector<HTMLElement>("[data-mysekai-detail]");
function captureScroll(): ScrollPosition {
    const anchor = Array.from(document.querySelectorAll<HTMLElement>("[data-content-key]"))
        .find(element => element.getBoundingClientRect().bottom > 100 && element.getBoundingClientRect().top < innerHeight);
    return { y: window.scrollY, detail: detailElement()?.scrollTop ?? 0,
        ...(anchor?.dataset.contentKey ? { anchor: anchor.dataset.contentKey, anchorTop: anchor.getBoundingClientRect().top } : {}) };
}
function historyEntry(): HistoryEntry | undefined {
    const value = window.history.state?.[stateKey] as HistoryEntry | undefined;
    return value?.owner === "mysekai-workspace-v1" ? value : undefined;
}
function saveScroll() {
    const current = historyEntry();
    window.history.replaceState({ ...window.history.state, [stateKey]: {
        owner: "mysekai-workspace-v1", parent: current?.parent ?? null, scroll: captureScroll(),
    } satisfies HistoryEntry }, "", window.location.href);
}

/** History belongs to the workspace, never to the canvas/realm lifecycle. */
export function useWorkspaceNavigation(initialSearch: string, defaultTab: MolyTab) {
    const [nav, setNav] = useState(() => parseWorkspaceNavigation(new URLSearchParams(initialSearch), defaultTab));
    const pending = useRef<ScrollPosition | "catalog" | "detail" | "top" | null>(null);
    const currentNav = useRef(nav);
    useEffect(() => { currentNav.current = nav; }, [nav]);

    const commit = useCallback((value: WorkspaceNavigation | ((current: WorkspaceNavigation) => WorkspaceNavigation), options: CommitOptions = {}) => {
        const next = typeof value === "function" ? value(currentNav.current) : value;
        const query = workspaceQuery(next, new URLSearchParams(window.location.search));
        const destination = `${window.location.pathname}?${query}`;
        if (destination === window.location.pathname + window.location.search) return;
        const previousUrl = window.location.pathname + window.location.search;
        const scroll = captureScroll();
        saveScroll();
        const current = historyEntry();
        const entry: HistoryEntry = { owner: "mysekai-workspace-v1", parent: options.replace ? current?.parent ?? null : previousUrl, scroll };
        const state = { ...window.history.state, [stateKey]: entry };
        if (options.replace) window.history.replaceState(state, "", destination);
        else window.history.pushState(state, "", destination);
        pending.current = options.scroll && options.scroll !== "preserve" ? options.scroll : { y: scroll.y, detail: scroll.detail };
        currentNav.current = next;
        setNav(next);
    }, []);

    useEffect(() => {
        const previousRestoration = window.history.scrollRestoration;
        window.history.scrollRestoration = "manual";
        let timer: ReturnType<typeof setTimeout> | undefined;
        const persist = () => {
            if (timer !== undefined || pending.current) return;
            timer = setTimeout(() => { timer = undefined; if (!pending.current) saveScroll(); }, 100);
        };
        const pop = () => {
            if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
            pending.current = historyEntry()?.scroll ?? { y: 0, detail: 0 };
            const next = parseWorkspaceNavigation(new URLSearchParams(window.location.search), defaultTab);
            currentNav.current = next;
            setNav(next);
        };
        const initial = historyEntry();
        if (initial) pending.current = initial.scroll;
        else saveScroll();
        window.addEventListener("popstate", pop);
        window.addEventListener("scroll", persist, { passive: true, capture: true });
        window.addEventListener("pagehide", saveScroll);
        return () => {
            if (timer !== undefined) clearTimeout(timer);
            window.history.scrollRestoration = previousRestoration;
            window.removeEventListener("popstate", pop);
            window.removeEventListener("scroll", persist, true);
            window.removeEventListener("pagehide", saveScroll);
        };
    }, [defaultTab]);

    // Called by the owner after the current source/page is actually in the DOM.
    // Keep the saved position across both index and detail fetches, not a timeout.
    const restore = useCallback((ready: boolean) => {
        if (!pending.current || !ready) return;
        const position = pending.current;
        const frame = requestAnimationFrame(() => {
            if (pending.current !== position) return;
            const mobile = window.matchMedia("(max-width: 900px)").matches;
            if (typeof position === "string") {
                const target = position === "catalog" ? document.querySelector<HTMLElement>("[data-mysekai-catalog]")
                    : position === "detail" && mobile ? document.querySelector<HTMLElement>(".workspace-body") : null;
                if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
                else if (position === "top") window.scrollTo({ top: 0, behavior: "instant" });
                if (position === "detail") { detailElement()?.scrollTo({ top: 0 }); detailElement()?.focus({ preventScroll: true }); }
            } else {
                const anchor = position.anchor ? Array.from(document.querySelectorAll<HTMLElement>("[data-content-key]"))
                    .find(element => element.dataset.contentKey === position.anchor && element.offsetParent !== null) : undefined;
                const top = anchor && position.anchorTop !== undefined ? scrollY + anchor.getBoundingClientRect().top - position.anchorTop : position.y;
                window.scrollTo({ top, behavior: "instant" });
                detailElement()?.scrollTo({ top: position.detail, behavior: "instant" });
            }
            pending.current = null;
            saveScroll();
        });
        return () => cancelAnimationFrame(frame);
    }, []);

    const back = useCallback(() => {
        const previous = historyEntry()?.parent;
        if (previous && /\/mysekai(?:\/interactions)?\//.test(previous)) window.history.back();
        else commit({ ...nav, content: null, invalidContent: false }, { replace: true, scroll: "catalog" });
    }, [commit, nav]);

    return { nav, commit, back, restore };
}
