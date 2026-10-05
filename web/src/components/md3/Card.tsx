import React from "react";
import LocalizedLink from "@/components/LocalizedLink";
import { cn } from "./cn";

/* ==========================================================================
   M3 Card: elevated | filled | outlined. Interactive when onClick/href given.
   ========================================================================== */

export type CardVariant = "elevated" | "filled" | "outlined";

const CARD_VARIANT: Record<CardVariant, string> = {
    elevated: "bg-surface-container-low text-on-surface shadow-elev-1",
    filled: "bg-surface-container-highest text-on-surface",
    outlined: "bg-surface text-on-surface border border-outline-variant",
};

const CARD_HOVER: Record<CardVariant, string> = {
    elevated: "hover:shadow-elev-2",
    filled: "hover:shadow-elev-1",
    outlined: "hover:shadow-elev-1",
};

export interface CardStyleOptions {
    variant?: CardVariant;
    interactive?: boolean;
    /** Corner radius; MD3 default for cards is md (12px). Expressive allows lg/xl for hero cards. */
    radius?: "md" | "lg" | "xl";
}

export function cardClassName({ variant = "filled", interactive, radius = "md" }: CardStyleOptions = {}) {
    return cn(
        "relative block overflow-hidden",
        radius === "md" ? "rounded-md3-md" : radius === "lg" ? "rounded-md3-lg" : "rounded-md3-xl",
        CARD_VARIANT[variant],
        interactive &&
            cn(
                "state-layer focus-ring cursor-pointer text-left transition-shadow duration-200 ease-md3-standard",
                CARD_HOVER[variant],
            ),
    );
}

type CardBaseProps = CardStyleOptions & { className?: string; children?: React.ReactNode };

export type CardProps =
    | (CardBaseProps & { href: string; onClick?: never } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">)
    | (CardBaseProps & { href?: undefined; onClick: React.MouseEventHandler<HTMLButtonElement> } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">)
    | (CardBaseProps & { href?: undefined; onClick?: undefined } & React.HTMLAttributes<HTMLDivElement>);

export function Card(props: CardProps) {
    const { variant, radius, className, children } = props;
    if (props.href !== undefined) {
        const { href, variant: _v, radius: _r, interactive: _i, className: _c, children: _ch, ...rest } = props;
        return (
            <LocalizedLink href={href} className={cn(cardClassName({ variant, radius, interactive: true }), className)} {...rest}>
                {children}
            </LocalizedLink>
        );
    }
    if (props.onClick !== undefined) {
        const { variant: _v, radius: _r, interactive: _i, className: _c, children: _ch, href: _h, type, ...rest } = props as CardBaseProps &
            React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
        return (
            <button type={type ?? "button"} className={cn(cardClassName({ variant, radius, interactive: true }), "w-full", className)} {...rest}>
                {children}
            </button>
        );
    }
    const { variant: _v, radius: _r, interactive, className: _c, children: _ch, href: _h, onClick: _o, ...rest } = props as CardBaseProps &
        React.HTMLAttributes<HTMLDivElement> & { href?: undefined; onClick?: undefined };
    return (
        <div className={cn(cardClassName({ variant, radius, interactive }), className)} {...rest}>
            {children}
        </div>
    );
}

/* ==========================================================================
   Surface: plain tonal container (no card semantics). Use for page sections,
   panels and grouped content.
   ========================================================================== */

export type SurfaceTone = "lowest" | "low" | "default" | "high" | "highest" | "surface";

const SURFACE_TONE: Record<SurfaceTone, string> = {
    surface: "bg-surface",
    lowest: "bg-surface-container-lowest",
    low: "bg-surface-container-low",
    default: "bg-surface-container",
    high: "bg-surface-container-high",
    highest: "bg-surface-container-highest",
};

export interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
    tone?: SurfaceTone;
    /** Corner radius token. */
    radius?: "none" | "sm" | "md" | "lg" | "lg-inc" | "xl" | "xl-inc";
    elevation?: 0 | 1 | 2 | 3;
    as?: "div" | "section" | "aside" | "header" | "footer" | "article" | "nav";
}

const RADIUS: Record<NonNullable<SurfaceProps["radius"]>, string> = {
    none: "",
    sm: "rounded-md3-sm",
    md: "rounded-md3-md",
    lg: "rounded-md3-lg",
    "lg-inc": "rounded-md3-lg-inc",
    xl: "rounded-md3-xl",
    "xl-inc": "rounded-md3-xl-inc",
};

const ELEVATION = ["", "shadow-elev-1", "shadow-elev-2", "shadow-elev-3"] as const;

export function Surface({ tone = "low", radius = "xl", elevation = 0, as: Tag = "div", className, ...rest }: SurfaceProps) {
    return <Tag className={cn(SURFACE_TONE[tone], "text-on-surface", RADIUS[radius], ELEVATION[elevation], className)} {...rest} />;
}

export default Card;
