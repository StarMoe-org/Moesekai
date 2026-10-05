"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/md3";
import { mdCheck, mdKeyboardArrowDown } from "@/components/md3/icons";

export interface TranslationEditionSelectOption {
    key: string;
    label: string;
    isDefault?: boolean;
}

interface TranslationEditionSelectProps {
    options: readonly TranslationEditionSelectOption[];
    value: string;
    onChange: (key: string) => void;
    label: string;
    currentLabel: string;
    defaultLabel?: string;
    listLabel: string;
    className?: string;
}

interface MenuPosition {
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    opensUpward: boolean;
}

interface ViewportBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 6;
const MIN_MENU_WIDTH = 240;
const MAX_MENU_HEIGHT = 360;
const OPTION_HEIGHT = 44;
const TYPEAHEAD_RESET_MS = 650;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

function getViewportBounds(): ViewportBounds {
    const viewport = window.visualViewport;
    return viewport
        ? { left: viewport.offsetLeft, top: viewport.offsetTop, width: viewport.width, height: viewport.height }
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function calculateMenuPosition(trigger: DOMRect, optionCount: number): MenuPosition {
    const viewport = getViewportBounds();
    const viewportRight = viewport.left + viewport.width;
    const viewportBottom = viewport.top + viewport.height;
    const desiredHeight = Math.min(MAX_MENU_HEIGHT, optionCount * OPTION_HEIGHT + 16);
    const availableBelow = Math.max(0, viewportBottom - trigger.bottom - MENU_GAP - VIEWPORT_MARGIN);
    const availableAbove = Math.max(0, trigger.top - viewport.top - MENU_GAP - VIEWPORT_MARGIN);
    const opensUpward = availableBelow < desiredHeight && availableAbove > availableBelow;
    const sideRoom = opensUpward ? availableAbove : availableBelow;
    const usableViewportHeight = Math.max(0, viewport.height - VIEWPORT_MARGIN * 2);
    const overlapsTrigger = sideRoom < OPTION_HEIGHT;
    const maxHeight = Math.min(desiredHeight, overlapsTrigger ? usableViewportHeight : sideRoom);
    const maximumWidth = Math.max(0, viewport.width - VIEWPORT_MARGIN * 2);
    const width = Math.min(Math.max(trigger.width, MIN_MENU_WIDTH), maximumWidth);
    const left = clamp(
        trigger.left,
        viewport.left + VIEWPORT_MARGIN,
        Math.max(viewport.left + VIEWPORT_MARGIN, viewportRight - width - VIEWPORT_MARGIN),
    );
    const minimumTop = viewport.top + VIEWPORT_MARGIN;
    const maximumTop = Math.max(minimumTop, viewportBottom - maxHeight - VIEWPORT_MARGIN);
    const proposedTop = overlapsTrigger
        ? minimumTop
        : opensUpward ? trigger.top - MENU_GAP - maxHeight : trigger.bottom + MENU_GAP;
    const top = clamp(proposedTop, minimumTop, maximumTop);
    return { left, top, width, maxHeight, opensUpward };
}

export default function TranslationEditionSelect({
    options,
    value,
    onChange,
    label,
    currentLabel,
    defaultLabel: _defaultLabel,
    listLabel,
    className = "",
}: TranslationEditionSelectProps) {
    const listboxId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const typeaheadRef = useRef("");
    const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isComposingRef = useRef(false);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [position, setPosition] = useState<MenuPosition | null>(null);
    const selectedIndex = Math.max(0, options.findIndex((option) => option.key === value));
    const selectedOption = options[selectedIndex] ?? options[0];

    useEffect(() => () => {
        if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    }, []);

    const closeMenu = useCallback((restoreFocus: boolean) => {
        setIsOpen(false);
        setPosition(null);
        typeaheadRef.current = "";
        if (typeaheadTimerRef.current) {
            clearTimeout(typeaheadTimerRef.current);
            typeaheadTimerRef.current = null;
        }
        if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
    }, []);

    const updateMenuPosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger || options.length === 0) return;
        setPosition(calculateMenuPosition(trigger.getBoundingClientRect(), options.length));
    }, [options.length]);

    const openMenu = useCallback((initialIndex = selectedIndex) => {
        if (!triggerRef.current || options.length === 0) return;
        // Pointer activation does not focus buttons consistently on macOS Safari.
        // Keep the combobox as the aria-activedescendant focus owner explicitly.
        triggerRef.current.focus();
        setActiveIndex(clamp(initialIndex, 0, options.length - 1));
        updateMenuPosition();
        setIsOpen(true);
    }, [options.length, selectedIndex, updateMenuPosition]);

    useEffect(() => {
        if (!isOpen) return;
        const activeOption = optionRefs.current[activeIndex];
        activeOption?.scrollIntoView?.({ block: "nearest" });
    }, [activeIndex, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleOutsidePointer = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && !triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) {
                closeMenu(false);
            }
        };
        const handleWindowScroll = (event: Event) => {
            if (popupRef.current?.contains(event.target as Node)) return;
            closeMenu(false);
        };
        const visualViewport = window.visualViewport;
        document.addEventListener("pointerdown", handleOutsidePointer, true);
        window.addEventListener("scroll", handleWindowScroll, true);
        window.addEventListener("resize", updateMenuPosition);
        visualViewport?.addEventListener("scroll", updateMenuPosition);
        visualViewport?.addEventListener("resize", updateMenuPosition);
        return () => {
            document.removeEventListener("pointerdown", handleOutsidePointer, true);
            window.removeEventListener("scroll", handleWindowScroll, true);
            window.removeEventListener("resize", updateMenuPosition);
            visualViewport?.removeEventListener("scroll", updateMenuPosition);
            visualViewport?.removeEventListener("resize", updateMenuPosition);
        };
    }, [closeMenu, isOpen, updateMenuPosition]);

    const selectIndex = useCallback((index: number) => {
        const option = options[index];
        if (!option) return;
        if (option.key !== value) onChange(option.key);
        closeMenu(true);
    }, [closeMenu, onChange, options, value]);

    const runTypeahead = useCallback((character: string) => {
        if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
        typeaheadRef.current += character.toLocaleLowerCase();
        const query = typeaheadRef.current;
        const start = options.length > 0 ? (activeIndex + 1) % options.length : 0;
        for (let offset = 0; offset < options.length; offset += 1) {
            const index = (start + offset) % options.length;
            if (options[index]?.label.toLocaleLowerCase().startsWith(query)) {
                setActiveIndex(index);
                break;
            }
        }
        typeaheadTimerRef.current = setTimeout(() => {
            typeaheadRef.current = "";
            typeaheadTimerRef.current = null;
        }, TYPEAHEAD_RESET_MS);
    }, [activeIndex, options]);

    const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.nativeEvent.isComposing || isComposingRef.current || event.keyCode === 229) return;
        if (!isOpen) {
            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMenu(selectedIndex);
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                openMenu(selectedIndex);
            } else if (event.key === "Home") {
                event.preventDefault();
                openMenu(0);
            } else if (event.key === "End") {
                event.preventDefault();
                openMenu(options.length - 1);
            }
            return;
        }

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                setActiveIndex((index) => Math.min(options.length - 1, index + 1));
                break;
            case "ArrowUp":
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
                break;
            case "Home":
                event.preventDefault();
                setActiveIndex(0);
                break;
            case "End":
                event.preventDefault();
                setActiveIndex(options.length - 1);
                break;
            case "Enter":
            case " ":
                event.preventDefault();
                selectIndex(activeIndex);
                break;
            case "Escape":
                event.preventDefault();
                closeMenu(true);
                break;
            case "Tab":
                closeMenu(false);
                break;
            default:
                if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    runTypeahead(event.key);
                }
        }
    }, [activeIndex, closeMenu, isOpen, openMenu, options.length, runTypeahead, selectIndex, selectedIndex]);

    const popupStyle: CSSProperties | undefined = position ? {
        left: position.left,
        top: position.top,
        width: position.width,
        maxHeight: position.maxHeight,
    } : undefined;

    return (
        <div className={`min-w-0 ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listboxId : undefined}
                aria-activedescendant={isOpen ? `${listboxId}-option-${activeIndex}` : undefined}
                aria-label={currentLabel}
                onClick={() => isOpen ? closeMenu(false) : openMenu()}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { isComposingRef.current = false; }}
                className={`state-layer focus-ring flex min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-md3-xs border px-3 py-1.5 text-left text-on-surface outline-none transition-colors duration-150 ease-md3-standard motion-reduce:transition-none ${isOpen ? "border-primary" : "border-outline"}`}
            >
                <span className="min-w-0">
                    <span className={`block type-label-s ${isOpen ? "text-primary" : "text-on-surface-variant"}`}>{label}</span>
                    <span className="mt-0.5 flex min-w-0 items-baseline gap-2">
                        <span className="truncate type-body-l text-on-surface">{selectedOption?.label}</span>
                    </span>
                </span>
                <Icon
                    path={mdKeyboardArrowDown}
                    size={24}
                    className={`text-on-surface-variant transition-transform duration-150 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
                />
            </button>

            {typeof document !== "undefined" && isOpen && position && createPortal(
                <div
                    ref={popupRef}
                    id={listboxId}
                    role="listbox"
                    aria-label={listLabel}
                    aria-activedescendant={`${listboxId}-option-${activeIndex}`}
                    data-placement={position.opensUpward ? "top" : "bottom"}
                    style={popupStyle}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={() => { isComposingRef.current = true; }}
                    onCompositionEnd={() => { isComposingRef.current = false; }}
                    className="fixed z-[300] overflow-y-auto overscroll-contain rounded-md3-xs bg-surface-container py-2 text-on-surface shadow-elev-2 outline-none motion-reduce:transition-none"
                >
                    {options.map((option, index) => {
                        const isSelected = option.key === value;
                        const isActive = index === activeIndex;
                        return (
                            <button
                                ref={(element) => { optionRefs.current[index] = element; }}
                                id={`${listboxId}-option-${index}`}
                                key={option.key}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                tabIndex={-1}
                                onClick={() => selectIndex(index)}
                                onPointerMove={() => setActiveIndex(index)}
                                className={`state-layer flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left type-label-l outline-none transition-colors duration-150 motion-reduce:transition-none ${isSelected
                                    ? "bg-secondary-container text-on-secondary-container"
                                    : isActive
                                        ? "bg-on-surface/8 text-on-surface"
                                        : "text-on-surface"
                                }`}
                            >
                                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                <Icon path={mdCheck} size={20} className={isSelected ? "opacity-100" : "opacity-0"} />
                            </button>
                        );
                    })}
                </div>,
                document.body,
            )}
        </div>
    );
}
