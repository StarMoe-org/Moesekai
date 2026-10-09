"use client";
import React, { useLayoutEffect, useRef, useState } from "react";
import { cn, withOverrides } from "./cn";
import { Icon } from "./Icon";
import { mdCheck } from "./icons";
import { isKeyboardEventComposing } from "@/lib/shortcuts";

/* ==========================================================================
   SegmentedButton: 2–5 options, single or multi select. A 40px neutral track
   whose selected segments fill with the spotlight color, sized like the chips.
   ConnectedButtonGroup (M3 Expressive): adjacent toggle buttons 2 apart
   whose inner corners are 8, 4 while pressed; the selected item morphs to a
   full pill.
   ========================================================================== */

/**
 * Both groups fill their row unless the caller sizes them. A sized group is
 * laid out as equal `1fr` grid columns: that sizes every segment to the
 * widest label, checkmark included. Shrink-to-fit flex would split the summed
 * label widths evenly and truncate the selected segment.
 */
function segmentLayout(className: string | undefined, fill: string) {
    return /(^|\s)w-(?!full(\s|$))/.test(className ?? "") ? "inline-grid grid-flow-col auto-cols-fr" : fill;
}

export interface SegmentOption<T extends string = string> {
    value: T;
    label: React.ReactNode;
    icon?: string;
    disabled?: boolean;
}

interface SegmentedBaseProps<T extends string> {
    options: ReadonlyArray<SegmentOption<T>>;
    className?: string;
    /** Show a checkmark on selected segments (default false: the filled segment already says it). */
    showCheckmark?: boolean;
    density?: 0 | -1 | -2;
    /** Icon-only segments (e.g. a grid/list view switch): string labels become the accessible name and tooltip. */
    iconOnly?: boolean;
    "aria-label"?: string;
}

type SingleProps<T extends string> = SegmentedBaseProps<T> & {
    multiple?: false;
    value: T;
    onValueChange: (value: T) => void;
};

type MultiProps<T extends string> = SegmentedBaseProps<T> & {
    multiple: true;
    value: ReadonlyArray<T>;
    onValueChange: (value: T[]) => void;
};

export type SegmentedButtonProps<T extends string> = SingleProps<T> | MultiProps<T>;

const DENSITY = { 0: "h-10", [-1]: "h-9", [-2]: "h-8" } as const;
// The full shape is half the height and not `rounded-full`: a radius far beyond
// what shows cannot be interpolated, the morph would happen within one frame.
const CONNECTED_FULL = {
    0: { all: "rounded-md3-lg-inc", left: "rounded-l-md3-lg-inc", right: "rounded-r-md3-lg-inc" },
    [-1]: { all: "rounded-[18px]", left: "rounded-l-[18px]", right: "rounded-r-[18px]" },
    [-2]: { all: "rounded-md3-lg", left: "rounded-l-md3-lg", right: "rounded-r-md3-lg" },
} as const;

// Set on the group, outline included, so a segmented button lines up with a
// field of the same density. Segments stretch to fill it, and grow with it when
// a parent stretches the group (e.g. `items-stretch` beside a taller field).
const SEGMENT_DENSITY = { 0: "min-h-10", [-1]: "min-h-9", [-2]: "min-h-8" } as const;

function moveOptionFocus(e: React.KeyboardEvent<HTMLDivElement>, nodes: HTMLButtonElement[], vertical = false) {
    if (e.defaultPrevented || isKeyboardEventComposing(e.nativeEvent)) return null;
    const keys = vertical ? ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"] : ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key) || !nodes.length) return null;
    const current = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    const index = current ? nodes.indexOf(current) : -1;
    const rtl = window.getComputedStyle(e.currentTarget).direction === "rtl";
    const forward = e.key === "ArrowDown" || (e.key === "ArrowRight" ? !rtl : e.key === "ArrowLeft" && rtl);
    const next = e.key === "Home" ? 0 : e.key === "End" ? nodes.length - 1
        : index < 0 ? (forward ? 0 : nodes.length - 1) : (index + (forward ? 1 : -1) + nodes.length) % nodes.length;
    e.preventDefault();
    nodes[next].focus();
    return next;
}

function onSegmentKeyDown<T extends string>(e: React.KeyboardEvent<HTMLDivElement>, props: SegmentedButtonProps<T>) {
    if (props.multiple) return;
    const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([disabled])'));
    const next = moveOptionFocus(e, nodes, true);
    const option = next === null ? undefined : props.options.filter((opt) => !opt.disabled)[next];
    if (option) props.onValueChange(option.value);
}

export function SegmentedButton<T extends string>(props: SegmentedButtonProps<T>) {
    const { options, className, showCheckmark = false, density = 0, iconOnly = false } = props;
    const isSelected = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
    const tabStopValue = options.find((opt) => !opt.disabled && isSelected(opt.value))?.value ?? options.find((opt) => !opt.disabled)?.value;
    const toggle = (v: T) => {
        if (props.multiple) {
            const next = props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v];
            props.onValueChange(next);
        } else {
            props.onValueChange(v);
        }
    };
    return (
        <div
            role={props.multiple ? "group" : "radiogroup"}
            aria-label={props["aria-label"]}
            onKeyDown={(e) => onSegmentKeyDown(e, props)}
            className={withOverrides(segmentLayout(className, "inline-flex w-full"), "gap-0.5 rounded-md3-md bg-surface-container-high p-1", SEGMENT_DENSITY[density], className)}
        >
            {options.map((opt) => {
                const selected = isSelected(opt.value);
                const name = iconOnly && typeof opt.label === "string" ? opt.label : undefined;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role={props.multiple ? undefined : "radio"}
                        aria-checked={props.multiple ? undefined : selected}
                        aria-pressed={props.multiple ? selected : undefined}
                        aria-label={name}
                        title={name}
                        disabled={opt.disabled}
                        tabIndex={opt.disabled ? -1 : props.multiple || opt.value === tabStopValue ? 0 : -1}
                        onClick={() => toggle(opt.value)}
                        className={cn(
                            "state-layer focus-ring relative flex min-w-0 items-center justify-center gap-1.5 rounded-md3-sm type-label-l",
                            iconOnly ? "w-10 flex-none" : "flex-1 px-3",
                            "cursor-pointer transition-colors duration-150 ease-md3-standard",
                            selected ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:text-on-surface",
                            opt.disabled && "pointer-events-none opacity-38",
                        )}
                    >
                        {iconOnly ? (
                            opt.icon && <Icon path={opt.icon} size={20} />
                        ) : (
                            <>
                                {selected && showCheckmark ? (
                                    <Icon path={mdCheck} size={18} />
                                ) : opt.icon ? (
                                    <Icon path={opt.icon} size={18} />
                                ) : null}
                                <span className="truncate">{opt.label}</span>
                            </>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/* ── Connected button group (Expressive) ─────────────────────────────── */

export function ConnectedButtonGroup<T extends string>(props: SegmentedButtonProps<T>) {
    const { options, className, density = 0 } = props;
    const full = CONNECTED_FULL[density];
    const isSelected = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
    const tabStopValue = options.find((opt) => !opt.disabled && isSelected(opt.value))?.value ?? options.find((opt) => !opt.disabled)?.value;
    const toggle = (v: T) => {
        if (props.multiple) {
            const next = props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v];
            props.onValueChange(next);
        } else {
            props.onValueChange(v);
        }
    };
    return (
        <div role={props.multiple ? "group" : "radiogroup"} aria-label={props["aria-label"]} onKeyDown={(e) => onSegmentKeyDown(e, props)} className={withOverrides(segmentLayout(className, "flex w-full"), "gap-0.5", className)}>
            {options.map((opt, i) => {
                const selected = isSelected(opt.value);
                const first = i === 0;
                const last = i === options.length - 1;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role={props.multiple ? undefined : "radio"}
                        aria-checked={props.multiple ? undefined : selected}
                        aria-pressed={props.multiple ? selected : undefined}
                        disabled={opt.disabled}
                        tabIndex={opt.disabled ? -1 : props.multiple || opt.value === tabStopValue ? 0 : -1}
                        onClick={() => toggle(opt.value)}
                        className={cn(
                            "state-layer focus-ring relative flex min-w-0 flex-1 items-center justify-center gap-2 px-4 type-label-l",
                            "cursor-pointer transition-[border-radius,background-color] duration-300 ease-md3-standard",
                            DENSITY[density],
                            selected ? "bg-secondary text-on-secondary" : "bg-secondary-container text-on-secondary-container",
                            selected ? full.all
                                : first && last ? full.all
                                : first ? cn(full.left, "rounded-r-md3-sm")
                                : last ? cn(full.right, "rounded-l-md3-sm")
                                : "rounded-md3-sm",
                            // pressed: the inner corners tighten, selected or not
                            first && last ? null : first ? "active:rounded-r-md3-xs" : last ? "active:rounded-l-md3-xs" : "active:rounded-md3-xs",
                            opt.disabled && "pointer-events-none opacity-38",
                        )}
                    >
                        {opt.icon && <Icon path={opt.icon} size={18} />}
                        <span className="truncate">{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

/* ==========================================================================
   Tabs (M3 primary / secondary) with animated active indicator.
   ========================================================================== */

export interface TabItem<T extends string = string> {
    value: T;
    label: React.ReactNode;
    icon?: string;
    badge?: React.ReactNode;
    disabled?: boolean;
}

export interface TabsProps<T extends string> {
    items: ReadonlyArray<TabItem<T>>;
    value: T;
    onValueChange: (value: T) => void;
    variant?: "primary" | "secondary";
    /** Scrollable (left aligned) instead of fixed equal widths. */
    scrollable?: boolean;
    className?: string;
    "aria-label"?: string;
}

export function Tabs<T extends string>({
    items,
    value,
    onValueChange,
    variant = "primary",
    scrollable,
    className,
    "aria-label": ariaLabel,
}: TabsProps<T>) {
    const listRef = useRef<HTMLDivElement>(null);
    const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

    useLayoutEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const update = () => {
            const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
            if (!active) return setIndicator(null);
            const content = variant === "primary" ? active.querySelector<HTMLElement>("[data-tab-content]") ?? active : active;
            const listRect = list.getBoundingClientRect();
            const r = content.getBoundingClientRect();
            setIndicator({ left: r.left - listRect.left + list.scrollLeft, width: r.width });
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(list);
        return () => ro.disconnect();
    }, [value, items, variant]);

    const tabStopValue = items.find((item) => !item.disabled && item.value === value)?.value ?? items.find((item) => !item.disabled)?.value;
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'));
        const index = moveOptionFocus(e, nodes);
        const next = index === null ? undefined : items.filter((item) => !item.disabled)[index];
        if (next) onValueChange(next.value);
    };

    return (
        <div className={withOverrides("relative border-b border-surface-variant", className)}>
            <div
                ref={listRef}
                role="tablist"
                aria-label={ariaLabel}
                onKeyDown={onKeyDown}
                className={cn("relative flex", scrollable ? "scrollbar-hide overflow-x-auto" : "")}
            >
                {items.map((item) => {
                    const selected = item.value === value;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            role="tab"
                            data-tab-value={item.value}
                            aria-selected={selected}
                            tabIndex={!item.disabled && item.value === tabStopValue ? 0 : -1}
                            disabled={item.disabled}
                            onClick={() => onValueChange(item.value)}
                            className={cn(
                                "state-layer focus-ring relative flex shrink-0 cursor-pointer items-center justify-center px-4 type-title-s",
                                scrollable ? "" : "flex-1",
                                variant === "primary" && item.icon ? "h-16" : "h-12",
                                selected ? (variant === "primary" ? "text-primary" : "text-on-surface") : "text-on-surface-variant",
                                item.disabled && "pointer-events-none opacity-38",
                            )}
                        >
                            <span
                                data-tab-content
                                className={cn(
                                    "flex items-center gap-1",
                                    variant === "primary" && item.icon ? "flex-col" : "flex-row gap-2",
                                )}
                            >
                                {item.icon && (
                                    <span className="relative">
                                        <Icon path={item.icon} size={24} />
                                        {item.badge}
                                    </span>
                                )}
                                <span className="whitespace-nowrap">{item.label}</span>
                                {!item.icon && item.badge}
                            </span>
                        </button>
                    );
                })}
                {indicator && (
                    <span
                        aria-hidden
                        className={cn(
                            "pointer-events-none absolute bottom-0 bg-primary transition-[left,width] duration-300 ease-md3-spatial",
                            variant === "primary" ? "h-[3px] rounded-t-[3px]" : "h-0.5",
                        )}
                        style={{ left: indicator.left, width: indicator.width }}
                    />
                )}
            </div>
        </div>
    );
}
