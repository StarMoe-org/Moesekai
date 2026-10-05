import React from "react";
import { cn } from "./cn";

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
    /** Path data from `@/components/md3/icons` (Material Symbols Rounded). */
    path: string;
    /** Size in px (MD3 default 24). */
    size?: number;
    /** Accessible label. When omitted the icon is decorative (aria-hidden). */
    label?: string;
}

/**
 * Material Symbols icon rendered as inline SVG (SSR-safe, no icon font).
 * Color follows `currentColor`.
 */
export function Icon({ path, size = 24, label, className, ...rest }: IconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 -960 960 960"
            width={size}
            height={size}
            fill="currentColor"
            aria-hidden={label ? undefined : true}
            role={label ? "img" : undefined}
            aria-label={label}
            focusable="false"
            className={cn("shrink-0", className)}
            {...rest}
        >
            <path d={path} />
        </svg>
    );
}

export default Icon;
