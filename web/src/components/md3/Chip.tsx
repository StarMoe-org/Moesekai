"use client";
import React from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { mdCheck, mdClose } from "./icons";

/* ==========================================================================
   M3 Chips: assist | filter | input | suggestion. 32px tall, 8px radius.
   ========================================================================== */

export type ChipVariant = "assist" | "filter" | "input" | "suggestion";

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
    variant?: ChipVariant;
    /** Filter chip state (also used by input chips to show selected). */
    selected?: boolean;
    /** Leading icon path. Filter chips show a checkmark when selected instead. */
    icon?: string;
    /** Leading image/avatar (input chips). */
    avatar?: React.ReactNode;
    /** Trailing icon path (e.g. dropdown arrow on filter chips). */
    trailingIcon?: string;
    /** Input chips: remove handler renders a trailing ✕ button. */
    onRemove?: () => void;
    removeLabel?: string;
    elevated?: boolean;
    /** Show the selected checkmark on filter chips (default true). */
    showCheckmark?: boolean;
}

export function chipClassName({
    selected,
    elevated,
    disabled,
}: {
    selected?: boolean;
    elevated?: boolean;
    disabled?: boolean;
}) {
    return cn(
        "state-layer focus-ring relative isolate inline-flex h-8 shrink-0 select-none items-center gap-2 rounded-md3-sm px-4 type-label-l",
        "cursor-pointer transition-[background-color,border-color,border-radius] duration-150 ease-md3-standard",
        selected
            ? "bg-secondary-container text-on-secondary-container border border-transparent"
            : elevated
              ? "bg-surface-container-low text-on-surface-variant shadow-elev-1 border border-transparent"
              : "border border-outline-variant bg-transparent text-on-surface-variant",
        disabled && "md3-disabled",
    );
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(function Chip(
    {
        variant = "filter",
        selected,
        icon,
        avatar,
        trailingIcon,
        onRemove,
        removeLabel,
        elevated,
        showCheckmark = true,
        className,
        children,
        disabled,
        type = "button",
        ...rest
    },
    ref,
) {
    const isFilter = variant === "filter";
    const showCheck = isFilter && selected && showCheckmark;
    const leading = showCheck ? mdCheck : icon;
    const hasLeading = Boolean(leading || avatar);
    const hasTrailing = Boolean(trailingIcon || onRemove);
    return (
        <span className={cn("relative inline-flex", className)}>
            <button
                ref={ref}
                type={type}
                disabled={disabled}
                aria-pressed={isFilter ? Boolean(selected) : undefined}
                className={cn(
                    chipClassName({ selected: (isFilter || variant === "input") && selected, elevated, disabled }),
                    hasLeading && (avatar ? "pl-1" : "pl-2"),
                    hasTrailing && "pr-2",
                    onRemove && "pr-9",
                    variant === "assist" && !selected && "text-on-surface",
                )}
                {...rest}
            >
                {avatar ? (
                    <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">{avatar}</span>
                ) : leading ? (
                    <Icon
                        path={leading}
                        size={18}
                        className={cn(!selected && variant === "assist" && "text-primary", !selected && variant !== "assist" && "text-primary")}
                    />
                ) : null}
                <span className="truncate">{children}</span>
                {trailingIcon && !onRemove && <Icon path={trailingIcon} size={18} />}
            </button>
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={removeLabel}
                    title={removeLabel}
                    disabled={disabled}
                    className="state-layer focus-ring absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant"
                >
                    <Icon path={mdClose} size={18} />
                </button>
            )}
        </span>
    );
});

export default Chip;
