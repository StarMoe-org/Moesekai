"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/contexts/I18nContext";
import { isKeyboardEventComposing } from "@/lib/shortcuts";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { mdCheck, mdKeyboardArrowDown } from "./icons";
import { OverlayParentContext, useOverlay } from "./useOverlay";

export interface SelectOption<T extends string | number> {
    value: T;
    label: React.ReactNode;
    /** Required for useful searching when label is rich content. */
    textValue?: string;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    disabled?: boolean;
    group?: string;
}

export interface SelectProps<T extends string | number> {
    value: T | null;
    onValueChange: (value: T) => void;
    options: readonly SelectOption<T>[];
    label?: string;
    "aria-label"?: string;
    "aria-describedby"?: string;
    listLabel?: string;
    placeholder?: string;
    selectedLabel?: React.ReactNode;
    disabled?: boolean;
    dense?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    noOptionsLabel?: string;
    /** External filtering can retain an existing remote/limited suggestion list. */
    searchValue?: string;
    onSearchChange?: (query: string) => void;
    filterOptions?: boolean;
    name?: string;
    required?: boolean;
    className?: string;
    id?: string;
    supportingText?: React.ReactNode;
    errorText?: string;
}

interface MenuPosition { left: number; top: number; width: number; maxHeight: number; opensUpward: boolean }

/** visualViewport-aware positioning also handles the on-screen keyboard. */
export function calculateSelectPosition(rect: DOMRect, count: number): MenuPosition {
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
    const topEdge = (viewport?.offsetTop ?? 0) + 8;
    const width = Math.max(0, (viewport?.width ?? window.innerWidth) - 16);
    const height = Math.max(0, (viewport?.height ?? window.innerHeight) - 16);
    const bottomEdge = topEdge + height;
    const desiredHeight = Math.min(360, Math.max(1, count) * 44 + 8);
    const below = Math.max(0, bottomEdge - rect.bottom - 4);
    const above = Math.max(0, rect.top - topEdge - 4);
    const opensUpward = below < desiredHeight && above > below;
    const room = opensUpward ? above : below;
    const maxHeight = Math.min(desiredHeight, room < 48 ? height : room);
    const menuWidth = Math.min(Math.max(rect.width, 160), width);
    return {
        left: Math.max(leftEdge, Math.min(rect.left, leftEdge + width - menuWidth)),
        top: Math.max(topEdge, Math.min(opensUpward ? rect.top - 4 - maxHeight : rect.bottom + 4, bottomEdge - maxHeight)),
        width: menuWidth,
        maxHeight,
        opensUpward,
    };
}

const optionText = <T extends string | number>(option: SelectOption<T>) => option.textValue ?? (typeof option.label === "string" || typeof option.label === "number" ? String(option.label) : String(option.value));

/** Controlled MD3 select-only/editable combobox. Selection never changes merely by opening. */
export function Select<T extends string | number>({
    value, onValueChange, options, label, "aria-label": ariaLabel, "aria-describedby": describedBy,
    listLabel, placeholder, selectedLabel, disabled = false, dense = false, searchable = false,
    searchPlaceholder, noOptionsLabel, searchValue, onSearchChange, filterOptions = true,
    name, required, className, id, supportingText, errorText,
}: SelectProps<T>) {
    const { t } = useI18n();
    const generatedId = useId();
    const controlId = id ?? `select-${generatedId}`;
    const listId = `${controlId}-options`;
    const fieldRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const composing = useRef(false);
    const typeahead = useRef("");
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [open, setOpen] = useState(false);
    const [activeValue, setActiveValue] = useState<T | null>(value);
    const [localSearch, setLocalSearch] = useState("");
    const [position, setPosition] = useState<MenuPosition | null>(null);
    const [invalid, setInvalid] = useState(false);
    const isOpen = open && !disabled;
    const query = searchValue ?? localSearch;
    const selected = options.find((option) => Object.is(option.value, value));
    const selectedText = selected ? optionText(selected)
        : typeof selectedLabel === "string" || typeof selectedLabel === "number" ? String(selectedLabel)
        : value === null ? "" : String(value);
    const visible = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        return searchable && filterOptions && normalized
            ? options.filter((option) => optionText(option).toLocaleLowerCase().includes(normalized)) : options;
    }, [options, query, searchable, filterOptions]);
    const enabled = visible.filter((option) => !option.disabled);
    const requestedIndex = visible.findIndex((option) => Object.is(option.value, activeValue) && !option.disabled);
    const activeIndex = requestedIndex >= 0 ? requestedIndex : visible.findIndex((option) => !option.disabled);
    const missingRequired = invalid && (value === null || value === "");
    const error = errorText || (missingRequired ? t("common.md3.selectRequired") : undefined);
    const description = error || supportingText;
    const focusTrigger = useCallback(() => (searchable ? inputRef.current : buttonRef.current)?.focus({ preventScroll: true }), [searchable]);
    const close = useCallback((restore = true) => {
        setOpen(false);
        typeahead.current = "";
        if (timer.current) clearTimeout(timer.current);
        if (restore) focusTrigger();
    }, [focusTrigger]);
    const { mounted, overlayRef, overlayContext, onFocusCapture, isTopOverlay } = useOverlay(isOpen, close, { syncHistory: false, modal: false, autoFocus: false });
    const setQuery = (next: string) => {
        if (searchValue === undefined) setLocalSearch(next);
        onSearchChange?.(next);
    };
    const place = useCallback(() => {
        if (fieldRef.current) setPosition(calculateSelectPosition(fieldRef.current.getBoundingClientRect(), visible.length));
    }, [visible.length]);
    const openMenu = (edge?: "first" | "last") => {
        if (disabled) return;
        const initial = edge === "first" ? options.find((option) => !option.disabled)
            : edge === "last" ? [...options].reverse().find((option) => !option.disabled)
            : selected && !selected.disabled ? selected : options.find((option) => !option.disabled);
        setActiveValue(initial?.value ?? null);
        if (!open && searchValue === undefined) setLocalSearch("");
        place();
        setOpen(true);
        focusTrigger();
    };
    const choose = (option: SelectOption<T>) => {
        if (disabled || option.disabled) return;
        setInvalid(false);
        if (!Object.is(option.value, value)) onValueChange(option.value);
        close();
    };

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    useEffect(() => {
        if (!disabled) return;
        const frame = requestAnimationFrame(() => setOpen(false));
        return () => cancelAnimationFrame(frame);
    }, [disabled]);
    useLayoutEffect(() => {
        if (!isOpen) return;
        place();
        const onScroll = (event: Event) => {
            if (event.target instanceof Node && overlayRef.current?.contains(event.target)) return;
            place();
        };
        const viewport = window.visualViewport;
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
        if (fieldRef.current) observer?.observe(fieldRef.current);
        window.addEventListener("resize", place);
        window.addEventListener("scroll", onScroll, true);
        viewport?.addEventListener("resize", place);
        viewport?.addEventListener("scroll", place);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", onScroll, true);
            viewport?.removeEventListener("resize", place);
            viewport?.removeEventListener("scroll", place);
        };
    }, [isOpen, place, overlayRef]);
    useEffect(() => {
        if (isOpen && activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
    }, [isOpen, activeIndex, listId]);
    useEffect(() => {
        if (!isOpen) return;
        const outside = (event: PointerEvent) => {
            if (!isTopOverlay() || !(event.target instanceof Node)) return;
            if (fieldRef.current?.contains(event.target) || overlayRef.current?.contains(event.target)) return;
            close(false);
        };
        document.addEventListener("pointerdown", outside);
        return () => document.removeEventListener("pointerdown", outside);
    }, [isOpen, close, isTopOverlay, overlayRef]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.target as Node) || event.defaultPrevented) return;
        if (composing.current || isKeyboardEventComposing(event.nativeEvent)) {
            event.stopPropagation();
            return;
        }
        if (isOpen && !isTopOverlay()) return;
        if (!isOpen) {
            if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key) || (!searchable && event.key === " ")) {
                event.preventDefault();
                openMenu();
            } else if (!searchable && (event.key === "Home" || event.key === "End")) {
                event.preventDefault();
                openMenu(event.key === "Home" ? "first" : "last");
            }
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
        } else if (event.key === "Tab") {
            event.stopPropagation();
            close(false);
        } else if (event.key === "Enter" || (!searchable && event.key === " ")) {
            event.preventDefault();
            if (activeIndex >= 0) choose(visible[activeIndex]);
        } else if (["ArrowDown", "ArrowUp"].includes(event.key) || (!searchable && ["Home", "End"].includes(event.key))) {
            event.preventDefault();
            const index = enabled.findIndex((option) => Object.is(option.value, visible[activeIndex]?.value));
            const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1
                : Math.max(0, Math.min(enabled.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
            setActiveValue(enabled[next]?.value ?? null);
        } else if (!searchable && event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            if (timer.current) clearTimeout(timer.current);
            typeahead.current += event.key.toLocaleLowerCase();
            const raw = typeahead.current;
            const prefix = [...raw].every((letter) => letter === raw[0]) ? raw[0] : raw;
            const start = enabled.findIndex((option) => Object.is(option.value, visible[activeIndex]?.value));
            for (let offset = 1; offset <= enabled.length; offset++) {
                const option = enabled[(start + offset + enabled.length) % enabled.length];
                if (optionText(option).toLocaleLowerCase().startsWith(prefix)) { setActiveValue(option.value); break; }
            }
            timer.current = setTimeout(() => { typeahead.current = ""; }, 650);
        }
    };
    const shared = {
        id: controlId,
        role: "combobox" as const,
        "aria-label": ariaLabel ?? label ?? placeholder ?? t("common.md3.selectPlaceholder"),
        "aria-haspopup": "listbox" as const,
        "aria-expanded": isOpen,
        "aria-controls": isOpen ? listId : undefined,
        "aria-activedescendant": isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined,
        "aria-required": required || undefined,
        "aria-invalid": Boolean(error) || undefined,
        "aria-describedby": [describedBy, description ? `${controlId}-support` : undefined].filter(Boolean).join(" ") || undefined,
        disabled,
        onKeyDown: handleKeyDown,
        onCompositionStart: () => { composing.current = true; },
        onCompositionEnd: () => { composing.current = false; },
    };
    const fieldClass = cn("relative flex w-full min-w-0 items-center gap-2 rounded-md3-xs border bg-surface-container-low px-3 text-on-surface transition-colors duration-150 ease-md3-standard", dense ? "h-10 type-body-m" : "h-14 type-body-l", error ? "border-error" : isOpen ? "border-primary" : "border-outline hover:border-on-surface", disabled && "opacity-38");

    return (
        <div className={cn("min-w-0 w-full", className)}>
            {label && <label htmlFor={controlId} className="mb-1 block type-label-m text-on-surface-variant">{label}</label>}
            <div ref={fieldRef} className={searchable ? fieldClass : undefined}>
                {searchable ? (
                    <>
                        {selected?.leading && <span className="shrink-0">{selected.leading}</span>}
                        <input {...shared} ref={inputRef} type="text" autoComplete="off" aria-autocomplete="list"
                            value={isOpen ? query : selectedText}
                            placeholder={isOpen ? searchPlaceholder ?? t("common.md3.selectSearch") : placeholder ?? t("common.md3.selectPlaceholder")}
                            onFocus={() => { if (!isOpen) openMenu(); }}
                            onClick={() => { if (!isOpen) openMenu(); }}
                            onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveValue(null); }}
                            className="focus-ring h-full w-full min-w-0 bg-transparent text-inherit outline-none placeholder:text-on-surface-variant" />
                        <Icon path={mdKeyboardArrowDown} size={20} className={cn("shrink-0 text-on-surface-variant transition-transform", isOpen && "rotate-180")} />
                    </>
                ) : (
                    <button {...shared} ref={buttonRef} type="button" onClick={() => isOpen ? close() : openMenu()} className={cn("state-layer focus-ring cursor-pointer text-left", fieldClass)}>
                        {selected?.leading && <span className="shrink-0">{selected.leading}</span>}
                        <span className="min-w-0 flex-1 truncate">{selected?.label ?? selectedLabel ?? (value !== null ? String(value) : placeholder ?? t("common.md3.selectPlaceholder"))}</span>
                        <Icon path={mdKeyboardArrowDown} size={20} className={cn("shrink-0 text-on-surface-variant transition-transform", isOpen && "rotate-180")} />
                    </button>
                )}
            </div>
            {description && <div id={`${controlId}-support`} className={cn("mt-1 type-body-s", error ? "text-error" : "text-on-surface-variant")}>{description}</div>}
            {(name || required) && (
                <select aria-hidden="true" tabIndex={-1} className="sr-only pointer-events-none" name={name} disabled={disabled} required={required} value={value === null ? "" : String(value)}
                    onInvalid={(event) => { event.preventDefault(); setInvalid(true); focusTrigger(); }}
                    onChange={(event) => { const option = options.find((entry) => String(entry.value) === event.target.value); if (option) choose(option); }}>
                    {!options.some((option) => option.value === "") && <option value="" />}
                    {value !== null && !selected && <option value={String(value)}>{String(value)}</option>}
                    {options.map((option) => <option key={`${typeof option.value}:${option.value}`} value={String(option.value)} disabled={option.disabled}>{optionText(option)}</option>)}
                </select>
            )}
            {mounted && isOpen && position && createPortal(
                <OverlayParentContext.Provider value={overlayContext}>
                    <div ref={overlayRef} onFocusCapture={onFocusCapture} style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}
                        role="listbox" id={listId} aria-label={listLabel ?? label ?? ariaLabel} tabIndex={-1} data-placement={position.opensUpward ? "top" : "bottom"}
                        onKeyDown={handleKeyDown} className="md3-menu-enter fixed z-[300] overflow-y-auto overscroll-contain rounded-md3-lg bg-surface-container-low p-1 text-on-surface shadow-elev-2 outline-none">
                        {visible.length === 0 && <div className="px-4 py-3 type-body-m text-on-surface-variant" role="presentation">{noOptionsLabel ?? t("common.md3.selectNoOptions")}</div>}
                        {visible.map((option, index) => (
                            <React.Fragment key={`${typeof option.value}:${option.value}`}>
                                {option.group && option.group !== visible[index - 1]?.group && <div className="px-4 pb-1 pt-3 type-label-m text-on-surface-variant" role="presentation">{option.group}</div>}
                                <div role="option" id={`${listId}-${index}`} aria-selected={Object.is(option.value, value)} aria-disabled={option.disabled || undefined}
                                    onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}
                                    onPointerMove={() => { if (!option.disabled) setActiveValue(option.value); }}
                                    className={cn("state-layer flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 type-label-l", option.disabled && "cursor-not-allowed opacity-38",
                                        // an item's corners are 4; the selected one's, and the list's first and last towards the container, are 12
                                        Object.is(option.value, value) ? "rounded-md3-md" : cn("rounded-md3-xs", index === 0 && "rounded-t-md3-md", index === visible.length - 1 && "rounded-b-md3-md"),
                                        Object.is(option.value, value) ? "bg-tertiary-container text-on-tertiary-container" : index === activeIndex ? "bg-on-surface/8 text-on-surface" : "text-on-surface")}>
                                    {option.leading && <span className="shrink-0">{option.leading}</span>}
                                    <span className="min-w-0 flex-1">{option.label}</span>
                                    {option.trailing && <span className="shrink-0 type-label-s">{option.trailing}</span>}
                                    <Icon path={mdCheck} size={20} className={cn("shrink-0", !Object.is(option.value, value) && "invisible")} />
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </OverlayParentContext.Provider>, document.body,
            )}
        </div>
    );
}
