"use client";
import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/** Resolved MD3 color roles for echarts / inline SVG in the profile charts. */
export interface ProfileChartColors {
    primary: string;
    onSurface: string;
    onSurfaceVariant: string;
    outline: string;
    outlineVariant: string;
    surface: string;
    surfaceContainer: string;
    surfaceContainerHigh: string;
}

const FALLBACK: ProfileChartColors = {
    primary: "#33CCBB",
    onSurface: "#191c1c",
    onSurfaceVariant: "#3f4948",
    outline: "#6f7978",
    outlineVariant: "#bec9c7",
    surface: "#f4fbf9",
    surfaceContainer: "#e9efed",
    surfaceContainerHigh: "#e3e9e8",
};

function readColors(): ProfileChartColors {
    if (typeof window === "undefined") return FALLBACK;
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(`--md-sys-color-${name}`).trim() || fallback;
    return {
        primary: read("primary", FALLBACK.primary),
        onSurface: read("on-surface", FALLBACK.onSurface),
        onSurfaceVariant: read("on-surface-variant", FALLBACK.onSurfaceVariant),
        outline: read("outline", FALLBACK.outline),
        outlineVariant: read("outline-variant", FALLBACK.outlineVariant),
        surface: read("surface", FALLBACK.surface),
        surfaceContainer: read("surface-container", FALLBACK.surfaceContainer),
        surfaceContainerHigh: read("surface-container-high", FALLBACK.surfaceContainerHigh),
    };
}

/** Re-reads MD3 color roles whenever the seed or light/dark scheme changes. */
export function useProfileChartColors(): ProfileChartColors {
    const { themeCharId, resolvedColorScheme } = useTheme();
    const [colors, setColors] = useState<ProfileChartColors>(FALLBACK);
    useEffect(() => {
        // Wait one frame so <html data-seed/data-theme> updates are applied first.
        const id = requestAnimationFrame(() => setColors(readColors()));
        return () => cancelAnimationFrame(id);
    }, [themeCharId, resolvedColorScheme]);
    return colors;
}
