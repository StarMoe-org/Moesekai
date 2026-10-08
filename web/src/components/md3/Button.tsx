"use client";
import React from "react";
import LocalizedLink from "@/components/LocalizedLink";
import { cn } from "./cn";
import { Icon } from "./Icon";

/* ==========================================================================
   M3 Expressive buttons
   - Button: filled | tonal | outlined | text | elevated
   - Sizes: xs (32) | s (40, default) | m (56) | l (96) | xl (136)
   - Shape: round (default) | square; pressed state morphs the corner radius.
   ========================================================================== */

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "elevated";
export type ButtonSize = "xs" | "s" | "m" | "l" | "xl";
export type ButtonShape = "round" | "square";
export type ButtonColor = "primary" | "secondary" | "tertiary" | "error";

// The round shape is half the button's height and not `rounded-full`: a radius
// far beyond what shows cannot be interpolated, the morph to the square shape
// would happen within its last frame. The curve has no overshoot, as the
// reference has none for a button's shape (Compose: DefaultEffects).
const BASE =
    "state-layer focus-ring relative isolate inline-flex select-none items-center justify-center gap-2 whitespace-nowrap " +
    "cursor-pointer transition-[border-radius,background-color,box-shadow,color] duration-200 ease-md3-standard " +
    "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed";

const SIZE: Record<ButtonSize, { box: string; round: string; square: string; pressed: string; icon: number }> = {
    xs: { box: "h-8 px-3 type-label-l", round: "rounded-md3-lg", square: "rounded-md3-md", pressed: "active:rounded-md3-sm", icon: 20 },
    s: { box: "h-10 px-4 type-label-l", round: "rounded-md3-lg-inc", square: "rounded-md3-md", pressed: "active:rounded-md3-sm", icon: 20 },
    m: { box: "h-14 px-6 type-title-m", round: "rounded-md3-xl", square: "rounded-md3-lg", pressed: "active:rounded-md3-md", icon: 24 },
    l: { box: "h-24 px-12 type-headline-s", round: "rounded-md3-xxl", square: "rounded-md3-xl", pressed: "active:rounded-md3-lg", icon: 32 },
    xl: { box: "h-[136px] px-16 type-headline-l", round: "rounded-[68px]", square: "rounded-md3-xl", pressed: "active:rounded-md3-lg", icon: 40 },
};

function variantClass(variant: ButtonVariant, color: ButtonColor, selected?: boolean): string {
    const filled: Record<ButtonColor, string> = {
        primary: "bg-primary text-on-primary",
        secondary: "bg-secondary text-on-secondary",
        tertiary: "bg-tertiary text-on-tertiary",
        error: "bg-error text-on-error",
    };
    const tonal: Record<ButtonColor, string> = {
        primary: "bg-primary-container text-on-primary-container",
        secondary: "bg-secondary-container text-on-secondary-container",
        tertiary: "bg-tertiary-container text-on-tertiary-container",
        error: "bg-error-container text-on-error-container",
    };
    const text: Record<ButtonColor, string> = {
        primary: "text-primary",
        secondary: "text-secondary",
        tertiary: "text-tertiary",
        error: "text-error",
    };
    switch (variant) {
        case "filled":
            if (selected === false) return "bg-surface-container text-on-surface-variant";
            return cn(filled[color], "hover:shadow-elev-1 active:shadow-none");
        case "tonal":
            if (selected === true) return filled[color];
            return cn(tonal[color], "hover:shadow-elev-1 active:shadow-none");
        case "outlined":
            if (selected === true) return "bg-inverse-surface text-inverse-on-surface";
            return cn("border border-outline-variant bg-transparent", color === "primary" ? "text-on-surface-variant" : text[color]);
        case "elevated":
            if (selected === true) return filled[color];
            return cn("bg-surface-container-low shadow-elev-1 hover:shadow-elev-2", text[color]);
        case "text":
        default:
            return cn("bg-transparent", text[color]);
    }
}

const DISABLED = "md3-disabled";

interface ButtonOwnProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    shape?: ButtonShape;
    color?: ButtonColor;
    /** Leading icon path from `@/components/md3/icons`. */
    icon?: string;
    /** Trailing icon path. */
    trailingIcon?: string;
    /** Toggle button state. `undefined` = not a toggle. */
    selected?: boolean;
    fullWidth?: boolean;
    /** Render as Next.js link. */
    href?: string;
    /** Extra props for the link (target, prefetch, …). */
    linkProps?: Omit<React.ComponentProps<typeof LocalizedLink>, "href" | "className" | "children">;
}

export type ButtonProps = ButtonOwnProps & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">;

export function buttonClassName({
    variant = "filled",
    size = "s",
    shape = "round",
    color = "primary",
    selected,
    fullWidth,
    disabled,
}: Pick<ButtonOwnProps, "variant" | "size" | "shape" | "color" | "selected" | "fullWidth"> & { disabled?: boolean }) {
    const s = SIZE[size];
    // Selected toggle buttons swap to the square shape (M3 Expressive toggle morph).
    const shapeClass = selected ? s.square : shape === "round" ? s.round : s.square;
    return cn(
        BASE,
        s.box,
        shapeClass,
        !disabled && s.pressed,
        variantClass(variant, color, selected),
        fullWidth && "w-full",
        disabled && DISABLED,
    );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = "filled",
        size = "s",
        shape = "round",
        color = "primary",
        icon,
        trailingIcon,
        selected,
        fullWidth,
        href,
        linkProps,
        className,
        children,
        disabled,
        type = "button",
        ...rest
    },
    ref,
) {
    const cls = cn(buttonClassName({ variant, size, shape, color, selected, fullWidth, disabled }), className);
    const iconSize = SIZE[size].icon;
    const content = (
        <>
            {icon && <Icon path={icon} size={iconSize} />}
            {children}
            {trailingIcon && <Icon path={trailingIcon} size={iconSize} />}
        </>
    );
    if (href && !disabled) {
        return (
            <LocalizedLink href={href} className={cls} {...rest as unknown as React.AnchorHTMLAttributes<HTMLAnchorElement>} {...linkProps}>
                {content}
            </LocalizedLink>
        );
    }
    return (
        <button
            ref={ref}
            type={type}
            className={cls}
            disabled={disabled}
            aria-pressed={selected === undefined ? undefined : selected}
            {...rest}
        >
            {content}
        </button>
    );
});

/* ==========================================================================
   IconButton: standard | filled | tonal | outlined, sizes xs–xl,
   widths narrow | default | wide, optional toggle.
   ========================================================================== */

export type IconButtonVariant = "standard" | "filled" | "tonal" | "outlined";
export type IconButtonWidth = "narrow" | "default" | "wide";

const ICON_SIZE: Record<ButtonSize, { h: string; w: Record<IconButtonWidth, string>; icon: number; square: string }> = {
    xs: { h: "h-8", w: { narrow: "w-7", default: "w-8", wide: "w-10" }, icon: 20, square: "rounded-md3-md" },
    s: { h: "h-10", w: { narrow: "w-8", default: "w-10", wide: "w-13" }, icon: 24, square: "rounded-md3-md" },
    m: { h: "h-14", w: { narrow: "w-12", default: "w-14", wide: "w-18" }, icon: 24, square: "rounded-md3-lg" },
    l: { h: "h-24", w: { narrow: "w-16", default: "w-24", wide: "w-32" }, icon: 32, square: "rounded-md3-xl" },
    xl: { h: "h-[136px]", w: { narrow: "w-26", default: "w-[136px]", wide: "w-46" }, icon: 40, square: "rounded-md3-xl" },
};

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
    icon: string;
    /** Icon shown when `selected` is true (e.g. a filled variant). */
    selectedIcon?: string;
    /** Required accessible label (also used as title tooltip). */
    label: string;
    variant?: IconButtonVariant;
    size?: ButtonSize;
    width?: IconButtonWidth;
    shape?: ButtonShape;
    selected?: boolean;
    href?: string;
}

function iconVariantClass(variant: IconButtonVariant, selected?: boolean): string {
    switch (variant) {
        case "filled":
            return selected === false ? "bg-surface-container text-primary" : "bg-primary text-on-primary";
        case "tonal":
            return selected === true
                ? "bg-secondary text-on-secondary"
                : "bg-secondary-container text-on-secondary-container";
        case "outlined":
            return selected === true
                ? "bg-inverse-surface text-inverse-on-surface"
                : "border border-outline-variant text-on-surface-variant";
        case "standard":
        default:
            return selected === true ? "text-primary" : "text-on-surface-variant";
    }
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
    {
        icon,
        selectedIcon,
        label,
        variant = "standard",
        size = "s",
        width = "default",
        shape = "round",
        selected,
        href,
        className,
        disabled,
        type = "button",
        title,
        ...rest
    },
    ref,
) {
    const s = ICON_SIZE[size];
    // A selected toggle has the other shape: round becomes square, square becomes round.
    const square = selected ? shape === "round" : shape === "square";
    const cls = cn(
        BASE,
        "shrink-0 p-0",
        s.h,
        s.w[width],
        square ? s.square : SIZE[size].round,
        !disabled && "active:rounded-md3-sm",
        iconVariantClass(variant, selected),
        disabled && (variant === "standard" ? "opacity-38 pointer-events-none" : DISABLED),
        className,
    );
    const path = selected && selectedIcon ? selectedIcon : icon;
    if (href && !disabled) {
        return (
            <LocalizedLink href={href} className={cls} aria-label={label} title={title ?? label} {...rest as unknown as React.AnchorHTMLAttributes<HTMLAnchorElement>}>
                <Icon path={path} size={s.icon} />
            </LocalizedLink>
        );
    }
    return (
        <button
            ref={ref}
            type={type}
            className={cls}
            aria-label={label}
            title={title ?? label}
            disabled={disabled}
            aria-pressed={selected === undefined ? undefined : selected}
            {...rest}
        >
            <Icon path={path} size={s.icon} />
        </button>
    );
});

/* ==========================================================================
   FAB / Extended FAB (M3 Expressive: FAB 56, medium 80, large 96)
   ========================================================================== */

export type FabSize = "s" | "m" | "l";
export type FabColor = "primary" | "secondary" | "tertiary" | "primary-container" | "secondary-container" | "tertiary-container" | "surface";

const FAB_COLOR: Record<FabColor, string> = {
    primary: "bg-primary text-on-primary",
    secondary: "bg-secondary text-on-secondary",
    tertiary: "bg-tertiary text-on-tertiary",
    "primary-container": "bg-primary-container text-on-primary-container",
    "secondary-container": "bg-secondary-container text-on-secondary-container",
    "tertiary-container": "bg-tertiary-container text-on-tertiary-container",
    surface: "bg-surface-container-high text-primary",
};

const FAB_SIZE: Record<FabSize, { box: string; ext: string; radius: string; icon: number }> = {
    s: { box: "h-14 w-14", ext: "h-14 px-4 type-title-m", radius: "rounded-md3-lg", icon: 24 },
    m: { box: "h-20 w-20", ext: "h-20 px-6 type-title-l", radius: "rounded-md3-lg-inc", icon: 28 },
    l: { box: "h-24 w-24", ext: "h-24 px-7 type-headline-s", radius: "rounded-md3-xl", icon: 36 },
};

export interface FabProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
    icon: string;
    label: string;
    /** Show the label next to the icon (Extended FAB). */
    extended?: boolean;
    size?: FabSize;
    color?: FabColor;
    lowered?: boolean;
}

export const Fab = React.forwardRef<HTMLButtonElement, FabProps>(function Fab(
    { icon, label, extended, size = "s", color = "primary-container", lowered, className, type = "button", ...rest },
    ref,
) {
    const s = FAB_SIZE[size];
    return (
        <button
            ref={ref}
            type={type}
            aria-label={extended ? undefined : label}
            title={extended ? undefined : label}
            className={cn(
                BASE,
                "gap-3",
                extended ? s.ext : s.box,
                s.radius,
                FAB_COLOR[color],
                lowered ? "shadow-elev-1 hover:shadow-elev-2" : "shadow-elev-3 hover:shadow-elev-4",
                className,
            )}
            {...rest}
        >
            <Icon path={icon} size={s.icon} />
            {extended && <span>{label}</span>}
        </button>
    );
});

export default Button;
