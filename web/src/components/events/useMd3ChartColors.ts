"use client";
import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/** Resolved MD3 color roles for canvas/SVG chart libraries (echarts) that cannot use CSS classes. */
export interface Md3ChartColors {
    primary: string;
    onSurface: string;
    onSurfaceVariant: string;
    outline: string;
    outlineVariant: string;
    surfaceContainer: string;
    surfaceContainerHigh: string;
    inverseSurface: string;
    inverseOnSurface: string;
}

const FALLBACK: Md3ChartColors = {
    primary: "#33CCBB",
    onSurface: "#191c1c",
    onSurfaceVariant: "#3f4948",
    outline: "#6f7978",
    outlineVariant: "#bec9c7",
    surfaceContainer: "#e9efed",
    surfaceContainerHigh: "#e3e9e8",
    inverseSurface: "#2d3131",
    inverseOnSurface: "#eff1f0",
};

function readColors(): Md3ChartColors {
    if (typeof window === "undefined") return FALLBACK;
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(`--md-sys-color-${name}`).trim() || fallback;
    return {
        primary: read("primary", FALLBACK.primary),
        onSurface: read("on-surface", FALLBACK.onSurface),
        onSurfaceVariant: read("on-surface-variant", FALLBACK.onSurfaceVariant),
        outline: read("outline", FALLBACK.outline),
        outlineVariant: read("outline-variant", FALLBACK.outlineVariant),
        surfaceContainer: read("surface-container", FALLBACK.surfaceContainer),
        surfaceContainerHigh: read("surface-container-high", FALLBACK.surfaceContainerHigh),
        inverseSurface: read("inverse-surface", FALLBACK.inverseSurface),
        inverseOnSurface: read("inverse-on-surface", FALLBACK.inverseOnSurface),
    };
}

/** Re-reads the MD3 color roles whenever the seed or light/dark scheme changes. */
export function useMd3ChartColors(): Md3ChartColors {
    const { themeCharId, resolvedColorScheme } = useTheme();
    const [colors, setColors] = useState<Md3ChartColors>(FALLBACK);
    useEffect(() => {
        // Wait one frame so <html data-seed/data-theme> updates are applied first.
        const id = requestAnimationFrame(() => setColors(readColors()));
        return () => cancelAnimationFrame(id);
    }, [themeCharId, resolvedColorScheme]);
    return colors;
}
