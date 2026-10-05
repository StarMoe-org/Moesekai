"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject, type FocusEvent as ReactFocusEvent } from "react";
import { isKeyboardEventComposing } from "@/lib/shortcuts";

interface OverlayEntry {
    ref: RefObject<HTMLElement | null>;
    parent: OverlayEntry | null;
    modal: boolean;
    syncHistory: boolean;
    closeOnEscape: boolean;
    close: () => void;
    previousFocus: HTMLElement | null;
    historyToken: number | null;
}

// React ancestry survives portals and child-first effect registration.
export const OverlayParentContext = createContext<OverlayEntry | null>(null);
const overlayStack: OverlayEntry[] = [];
const retiredHistoryTokens = new Set<number>();
let nextHistoryToken = 0;
let bodyLockCount = 0;
let bodyOverflowBeforeLock = "";
let pendingHistoryBack = false;
let listenersInstalled = false;
let redirectingFocus = false;

function topEntry() {
    return overlayStack[overlayStack.length - 1];
}

function isDescendant(entry: OverlayEntry, ancestor: OverlayEntry) {
    for (let parent = entry.parent; parent; parent = parent.parent) {
        if (parent === ancestor) return true;
    }
    return false;
}

function isVisible(node: HTMLElement) {
    if (node.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    for (let el: HTMLElement | null = node; el; el = el.parentElement) {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
}

function focusableNodes(root: HTMLElement) {
    return Array.from(root.querySelectorAll<HTMLElement>(
        'a[href],button,input,select,textarea,[contenteditable="true"],[tabindex]',
    )).filter((node) => node.tabIndex >= 0 && !node.matches(":disabled") && isVisible(node));
}

function focusEntry(entry: OverlayEntry, preferred?: HTMLElement | null) {
    const root = entry.ref.current;
    if (!root || !root.isConnected || entry !== topEntry()) return;
    const target = preferred && root.contains(preferred) && !preferred.matches(":disabled") && isVisible(preferred)
        ? preferred : focusableNodes(root)[0] ?? root;
    target.focus({ preventScroll: true });
}

function handleKeyDown(event: KeyboardEvent) {
    const entry = topEntry();
    if (!entry || event.defaultPrevented || isKeyboardEventComposing(event)) return;
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (entry.closeOnEscape) entry.close();
        return;
    }
    if (event.key !== "Tab" || !entry.modal) return;
    const root = entry.ref.current;
    if (!root) return;
    const nodes = focusableNodes(root);
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (!nodes.length) {
        event.preventDefault();
        root.focus({ preventScroll: true });
    } else if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === nodes.length - 1)) {
        event.preventDefault();
        focusEntry(entry, event.shiftKey ? nodes[nodes.length - 1] : nodes[0]);
    }
}

function handleFocusIn(event: FocusEvent) {
    const entry = topEntry();
    const root = entry?.ref.current;
    if (!entry?.modal || !root || redirectingFocus || !(event.target instanceof Node) || root.contains(event.target)) return;
    redirectingFocus = true;
    try { focusEntry(entry); }
    finally { redirectingFocus = false; }
}

function unwindHistory() {
    const token = window.history.state?.modalToken;
    if (pendingHistoryBack || !retiredHistoryTokens.has(token)) return;
    retiredHistoryTokens.delete(token);
    pendingHistoryBack = true;
    window.history.back();
}

function handlePopState(event: PopStateEvent) {
    pendingHistoryBack = false;
    if (retiredHistoryTokens.has(event.state?.modalToken)) {
        unwindHistory();
        return;
    }
    // A programmatic child close returns to the still-open parent's own entry.
    // User Back instead leaves the newest open history entry, closing only it.
    const entry = [...overlayStack].reverse().find((item) => item.historyToken !== null);
    if (entry && event.state?.modalToken !== entry.historyToken) entry.close();
    removeGlobalListeners();
}

function installGlobalListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("popstate", handlePopState);
}

function removeGlobalListeners() {
    if (overlayStack.length || pendingHistoryBack || !listenersInstalled) return;
    listenersInstalled = false;
    retiredHistoryTokens.clear();
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("focusin", handleFocusIn);
    window.removeEventListener("popstate", handlePopState);
}

/** Shared focus/Escape stack; modal layers additionally trap focus and lock scroll. */
export function useOverlay(isOpen: boolean, onClose: () => void, { syncHistory = true, closeOnEscape = true, modal = true } = {}) {
    const [mounted, setMounted] = useState(false);
    const onCloseRef = useRef(onClose);
    const overlayRef = useRef<HTMLDivElement>(null);
    const parent = useContext(OverlayParentContext);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
    const stableOnClose = useCallback(() => onCloseRef.current(), []);
    const entry = useMemo<OverlayEntry>(() => ({
        ref: overlayRef, parent, modal, syncHistory, closeOnEscape, close: stableOnClose,
        previousFocus: null, historyToken: null,
    }), [parent, modal, syncHistory, closeOnEscape, stableOnClose]);
    const isTopOverlay = useCallback(() => topEntry() === entry, [entry]);
    const onFocusCapture = useCallback((event: ReactFocusEvent<HTMLDivElement>) => {
        // Native/React autofocus runs before passive registration. Keep its related
        // target rather than accidentally saving an input that will be removed.
        if (!overlayStack.includes(entry) && event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget)) {
            entry.previousFocus = event.relatedTarget;
        }
    }, [entry]);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    useEffect(() => {
        if (!isOpen || !mounted) return;
        const root = overlayRef.current;
        entry.previousFocus ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const descendantIndex = overlayStack.findIndex((other) => isDescendant(other, entry));
        if (descendantIndex < 0) overlayStack.push(entry);
        else overlayStack.splice(descendantIndex, 0, entry);
        if (modal) {
            if (bodyLockCount === 0) bodyOverflowBeforeLock = document.body.style.overflow;
            bodyLockCount += 1;
            document.body.style.overflow = "hidden";
        }
        installGlobalListeners();

        const raf = requestAnimationFrame(() => {
            // Wait for this commit's registrations, then push parent before child.
            for (const item of overlayStack) {
                if (!item.syncHistory || item.historyToken !== null) continue;
                item.historyToken = ++nextHistoryToken;
                window.history.pushState({ ...(window.history.state ?? {}), modal: true, modalToken: item.historyToken }, "");
            }
            if (!root?.contains(document.activeElement)) focusEntry(entry);
        });
        return () => {
            cancelAnimationFrame(raf);
            const wasTop = topEntry() === entry;
            const active = document.activeElement;
            const shouldRestore = wasTop && (active === document.body || Boolean(root?.contains(active)));
            const index = overlayStack.indexOf(entry);
            if (index >= 0) overlayStack.splice(index, 1);
            // If a parent and its portal children unmount together, keep the live opener.
            for (const other of overlayStack) {
                if (other.previousFocus && root?.contains(other.previousFocus)) other.previousFocus = entry.previousFocus;
            }
            if (modal && --bodyLockCount === 0) document.body.style.overflow = bodyOverflowBeforeLock;
            if (entry.historyToken !== null) {
                retiredHistoryTokens.add(entry.historyToken);
                entry.historyToken = null;
                unwindHistory();
            }
            if (shouldRestore) {
                const next = topEntry();
                if (next?.modal) focusEntry(next, entry.previousFocus);
                else if (entry.previousFocus?.isConnected) entry.previousFocus.focus({ preventScroll: true });
            }
            entry.previousFocus = null;
            removeGlobalListeners();
        };
    }, [isOpen, mounted, entry, modal]);

    return { mounted, close: stableOnClose, overlayRef, overlayContext: entry, onFocusCapture, isTopOverlay };
}
