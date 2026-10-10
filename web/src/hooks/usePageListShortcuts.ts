"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
    getShortcutById,
    isEditableEventTarget,
    isKeyboardEventComposing,
    matchesShortcutCombo,
    parseShortcutCombos,
    type ParsedShortcutCombo,
} from "@/lib/shortcuts";

interface UsePageListShortcutsOptions {
    rootRef: RefObject<HTMLElement | null>;
    disabled?: boolean;
}

const LIST_ITEM_FALLBACK_SELECTOR = "a.group.block[href], a.block.group[href]";
const INTERACTIVE_SELECTOR = "input, select, textarea, button, a[href], [tabindex]";

function getParsedShortcutCombosById(shortcutId: string): ParsedShortcutCombo[] {
    const combos = getShortcutById(shortcutId)?.combos ?? [];
    return parseShortcutCombos(combos);
}

const LIST_FOCUS_NEXT_COMBOS = getParsedShortcutCombosById("list-focus-next");
const LIST_FOCUS_PREV_COMBOS = getParsedShortcutCombosById("list-focus-prev");
const LIST_OPEN_COMBOS = getParsedShortcutCombosById("list-open-focused");
const LIST_CLEAR_COMBOS = getParsedShortcutCombosById("list-clear-focus");
const LIST_SEARCH_COMBOS = getParsedShortcutCombosById("list-focus-search");
const LIST_FILTERS_COMBOS = getParsedShortcutCombosById("list-focus-filters");
const LIST_LOAD_MORE_COMBOS = getParsedShortcutCombosById("list-load-more");

function isElementVisible(element: HTMLElement): boolean {
    if (element.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
}

function isElementDisabled(element: HTMLElement): boolean {
    if (
        element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
    ) {
        return element.disabled;
    }

    return element.getAttribute("aria-disabled") === "true";
}

function isElementEligible(element: HTMLElement): boolean {
    if (!isElementVisible(element)) return false;
    if (isElementDisabled(element)) return false;
    if (element.closest("[data-shortcut-ignore='true']")) return false;
    return true;
}

function ensureFocusable(element: HTMLElement) {
    if (
        element instanceof HTMLAnchorElement ||
        element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
    ) {
        return;
    }

    if (element.tabIndex < 0) {
        element.tabIndex = 0;
    }
}

function getListItems(root: HTMLElement): HTMLElement[] {
    const explicit = Array.from(root.querySelectorAll<HTMLElement>("[data-shortcut-item='true']"));
    const source = explicit.length > 0
        ? explicit
        : Array.from(root.querySelectorAll<HTMLElement>(LIST_ITEM_FALLBACK_SELECTOR));

    const deduped = Array.from(new Set(source));
    return deduped.filter((element) => isElementEligible(element));
}

function getSearchInput(root: HTMLElement): HTMLInputElement | null {
    return Array.from(
        root.querySelectorAll<HTMLInputElement>("input[data-shortcut-search='true']")
    ).find((input) => isElementEligible(input) && !input.readOnly) ?? null;
}

function getFilterTarget(root: HTMLElement): HTMLElement | null {
    const panel = Array.from(root.querySelectorAll<HTMLElement>("[data-shortcut-filters='true']"))
        .find((element) => isElementEligible(element));
    if (!panel) return null;

    const firstInteractive = Array.from(panel.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR))
        .find((element) => isElementEligible(element));

    return firstInteractive ?? panel;
}

function getLoadMoreButton(root: HTMLElement): HTMLButtonElement | null {
    return Array.from(
        root.querySelectorAll<HTMLButtonElement>("button[data-shortcut-load-more='true']")
    ).find((button) => isElementEligible(button)) ?? null;
}

function getCurrentFocusedIndex(items: HTMLElement[], focusedItem: HTMLElement | null): number {
    if (items.length === 0) return -1;

    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (active) {
        const activeIdx = items.indexOf(active);
        if (activeIdx >= 0) return activeIdx;
    }

    if (focusedItem) {
        const focusedIdx = items.indexOf(focusedItem);
        if (focusedIdx >= 0) return focusedIdx;
    }

    return -1;
}

export function usePageListShortcuts({ rootRef, disabled = false }: UsePageListShortcutsOptions) {
    const focusedItemRef = useRef<HTMLElement | null>(null);
    const lastFocusedIndexRef = useRef<number>(-1);

    const clearFocusedItem = useCallback((resetHistory = false) => {
        const focused = focusedItemRef.current;
        if (focused) {
            delete focused.dataset.shortcutFocused;
            if (document.activeElement === focused) {
                focused.blur();
            }
        }

        focusedItemRef.current = null;
        if (resetHistory) {
            lastFocusedIndexRef.current = -1;
        }
    }, []);

    const focusElement = useCallback((element: HTMLElement, index: number | null = null) => {
        clearFocusedItem();

        ensureFocusable(element);
        element.dataset.shortcutFocused = "true";
        focusedItemRef.current = element;
        if (typeof index === "number") {
            lastFocusedIndexRef.current = index;
        }

        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [clearFocusedItem]);

    const moveFocus = useCallback((direction: 1 | -1) => {
        const root = rootRef.current;
        if (!root) return;

        const items = getListItems(root);
        if (items.length === 0) return;

        const currentIdx = getCurrentFocusedIndex(items, focusedItemRef.current);
        const baseIdx = currentIdx >= 0
            ? currentIdx
            : (lastFocusedIndexRef.current >= 0
                ? Math.min(lastFocusedIndexRef.current, items.length - 1)
                : -1);

        const nextIdx = baseIdx < 0
            ? (direction === 1 ? 0 : items.length - 1)
            : (baseIdx + direction + items.length) % items.length;

        const nextItem = items[nextIdx];
        if (!nextItem) return;

        focusElement(nextItem, nextIdx);
    }, [focusElement, rootRef]);

    const openFocusedItem = useCallback(() => {
        const root = rootRef.current;
        if (!root) return;

        const items = getListItems(root);
        if (items.length === 0) return;

        const currentIdx = getCurrentFocusedIndex(items, focusedItemRef.current);
        const resolvedIdx = currentIdx >= 0
            ? currentIdx
            : (lastFocusedIndexRef.current >= 0
                ? Math.min(lastFocusedIndexRef.current, items.length - 1)
                : -1);
        const target = resolvedIdx >= 0 ? items[resolvedIdx] : null;
        if (!target) return;

        lastFocusedIndexRef.current = resolvedIdx;
        target.click();
    }, [rootRef]);

    const focusSearchInput = useCallback(() => {
        const root = rootRef.current;
        if (!root) return;

        const input = getSearchInput(root);
        if (!input) return;

        clearFocusedItem();
        input.focus({ preventScroll: true });
        input.select();
        input.scrollIntoView({ block: "nearest" });
    }, [clearFocusedItem, rootRef]);

    const focusFilters = useCallback(() => {
        const root = rootRef.current;
        if (!root) return;

        const filterTarget = getFilterTarget(root);
        if (!filterTarget) return;

        clearFocusedItem();
        ensureFocusable(filterTarget);
        filterTarget.focus({ preventScroll: true });
        filterTarget.scrollIntoView({ block: "nearest" });
    }, [clearFocusedItem, rootRef]);

    const triggerLoadMore = useCallback(() => {
        const root = rootRef.current;
        if (!root) return;

        const button = getLoadMoreButton(root);
        if (!button) return;

        const itemsBefore = getListItems(root);
        const currentIdx = getCurrentFocusedIndex(itemsBefore, focusedItemRef.current);
        const preservedIdx = currentIdx >= 0
            ? currentIdx
            : (lastFocusedIndexRef.current >= 0
                ? Math.min(lastFocusedIndexRef.current, Math.max(itemsBefore.length - 1, 0))
                : -1);

        button.click();

        if (preservedIdx < 0) return;

        requestAnimationFrame(() => {
            const nextRoot = rootRef.current;
            if (!nextRoot) return;

            const itemsAfter = getListItems(nextRoot);
            if (itemsAfter.length === 0) return;

            const nextIdx = Math.min(preservedIdx, itemsAfter.length - 1);
            const target = itemsAfter[nextIdx];
            if (!target) return;

            focusElement(target, nextIdx);
        });
    }, [focusElement, rootRef]);

    useEffect(() => {
        if (disabled) {
            clearFocusedItem(true);
        }
    }, [clearFocusedItem, disabled]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const root = rootRef.current;
            if (!root || disabled) return;

            if (event.defaultPrevented || isKeyboardEventComposing(event)) return;
            if (isEditableEventTarget(event.target)) return;

            if (
                event.target instanceof Node &&
                event.target !== document.body &&
                event.target !== document.documentElement &&
                !root.contains(event.target)
            ) {
                return;
            }

            if (event.metaKey || event.ctrlKey || event.altKey) return;

            const isFocusNext = LIST_FOCUS_NEXT_COMBOS.some((combo) => matchesShortcutCombo(event, combo));
            if (isFocusNext) {
                event.preventDefault();
                moveFocus(1);
                return;
            }

            const isFocusPrev = LIST_FOCUS_PREV_COMBOS.some((combo) => matchesShortcutCombo(event, combo));
            if (isFocusPrev) {
                event.preventDefault();
                moveFocus(-1);
                return;
            }

            const isOpenItem = LIST_OPEN_COMBOS.some((combo) => matchesShortcutCombo(event, combo));
            if (isOpenItem) {
                event.preventDefault();
                openFocusedItem();
                return;
            }

            const isClearFocus = LIST_CLEAR_COMBOS.some((combo) => matchesShortcutCombo(event, combo));
            if (isClearFocus) {
                // Only a focused item claims Escape: with none, it stays free for whatever else is open.
                if (focusedItemRef.current) event.preventDefault();
                clearFocusedItem(true);
                return;
            }

            const isFocusSearch = LIST_SEARCH_COMBOS.some((combo) => matchesShortcutCombo(event, combo));
            if (isFocusSearch) {
                event.preventDefault();
                focusSearchInput();
                return;
            }

            const isFocusFilter = LIST_FILTERS_COMBOS.some((combo) => matchesShortcutCombo(event, combo));
            if (isFocusFilter) {
                event.preventDefault();
                focusFilters();
                return;
            }

            const isLoadMore = LIST_LOAD_MORE_COMBOS.some((combo) => matchesShortcutCombo(event, combo));
            if (isLoadMore) {
                event.preventDefault();
                triggerLoadMore();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            clearFocusedItem(true);
        };
    }, [
        clearFocusedItem,
        disabled,
        focusFilters,
        focusSearchInput,
        moveFocus,
        openFocusedItem,
        rootRef,
        triggerLoadMore,
    ]);
}
