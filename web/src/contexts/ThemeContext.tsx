"use client";
import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, ReactNode } from "react";
import { CHAR_COLORS } from "@/types/types";
import {
    COLOR_SCHEME_STORAGE_KEY,
    DARK_MEDIA_QUERY,
    THEME_CHAR_STORAGE_KEY,
    isValidColorSchemePreference,
    resolveColorSchemePreference,
    type ColorSchemePreference,
    type ResolvedColorScheme,
} from "@/lib/colorScheme";
import {
    ADSENSE_SCRIPT_ID,
    ADSENSE_SCRIPT_SRC,
    ADS_FEATURE_ENABLED,
    DEFAULT_SHOW_ADS,
    SHOW_ADS_STORAGE_KEY,
} from "@/lib/ads";
import { UI_LOCALE_STORAGE_KEY, detectBrowserUiLocale, normalizeUiLocale } from "@/lib/i18n";
import {
    BACKGROUND_ANIMATION_BUDGET_STORAGE_KEY,
    DEFAULT_BACKGROUND_ANIMATION_BUDGET,
    VALID_BACKGROUND_ANIMATION_BUDGETS,
    normalizeBackgroundAnimationBudget,
    type BackgroundAnimationBudget,
} from "@/lib/backgroundAnimation";
import { defaultContentRegionForPathname } from "@/lib/locale-routing";
import { applyThemeCursors, clearThemeCursors } from "@/lib/themeCursor";

export type { BackgroundAnimationBudget } from "@/lib/backgroundAnimation";

// Default theme color (Miku)
const DEFAULT_THEME_CHAR = "21";
const DEFAULT_COLOR = "#33ccbb";
const DEFAULT_COLOR_SCHEME_PREFERENCE: ColorSchemePreference = "system";
const THEME_SWITCHING_CLASS = "theme-switching";
const THEME_SWITCHING_DURATION_MS = 180;

/**
 * Theme-reactive cursors, on by default.
 *
 * Opt-out rather than opt-in because the cursors are part of how the theme
 * color reads on desktop, and a feature nobody discovers is a feature nobody
 * has. Only an explicit `"false"` in storage turns them off, so a corrupt or
 * missing value lands on the intended default.
 */
const CUSTOM_CURSOR_STORAGE_KEY = "custom-cursor";
const DEFAULT_CUSTOM_CURSOR_ENABLED = true;

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Asset source type (Main line / Overseas line, with optional regional suffix for override)
export type AssetSourceType =
    | "main"
    | "overseas"
    | "main-en"
    | "main-jp"
    | "main-cn"
    | "main-tw"
    | "main-kr"
    | "overseas-en"
    | "overseas-jp"
    | "overseas-cn"
    | "overseas-tw"
    | "overseas-kr";
const DEFAULT_ASSET_SOURCE: AssetSourceType = "main";
const VALID_ASSET_SOURCES: AssetSourceType[] = ["main", "overseas"];

// Server source type
export type ServerSourceType = "en" | "jp" | "cn" | "tw" | "kr";
const DEFAULT_SERVER_SOURCE: ServerSourceType = "cn";
const LLM_TRANSLATION_STORAGE_KEY = "use-llm-translation";

function getDefaultLLMTranslationSetting(): boolean {
    if (typeof window === "undefined") return true;

    const savedLLMTranslation = localStorage.getItem(LLM_TRANSLATION_STORAGE_KEY);
    if (savedLLMTranslation === "true") return true;
    if (savedLLMTranslation === "false") return false;

    const savedUiLocale = localStorage.getItem(UI_LOCALE_STORAGE_KEY);
    const uiLocale = savedUiLocale ? normalizeUiLocale(savedUiLocale) : detectBrowserUiLocale();
    return uiLocale === "zh-CN";
}

function setDocumentBackgroundAnimationBudget(budget: BackgroundAnimationBudget) {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.backgroundAnimation = budget;
}

export function getAssetSourceRegion(source: AssetSourceType): ServerSourceType {
    const hyphenIndex = source.indexOf("-");
    return (hyphenIndex !== -1 ? source.substring(hyphenIndex + 1) : "jp") as ServerSourceType;
}

export function replaceAssetSourceRegion(source: AssetSourceType, targetRegion: ServerSourceType): AssetSourceType {
    const base = source.startsWith("overseas") ? "overseas" : "main";
    return `${base}-${targetRegion}` as AssetSourceType;
}

function migrateLegacyAssetSource(rawSource: string | null): AssetSourceType {
    if (!rawSource) {
        return DEFAULT_ASSET_SOURCE;
    }

    if (VALID_ASSET_SOURCES.includes(rawSource as AssetSourceType)) {
        return rawSource as AssetSourceType;
    }

    // Migrate old values containing regional/line suffixes
    if (rawSource.startsWith("overseas")) {
        return "overseas";
    }
    return "main";
}

interface ThemeContextType {
    themeCharId: string;
    themeColor: string;
    setThemeCharacter: (charId: string) => void;
    colorSchemePreference: ColorSchemePreference;
    resolvedColorScheme: ResolvedColorScheme;
    setColorSchemePreference: (preference: ColorSchemePreference) => void;
    isShowSpoiler: boolean;
    setShowSpoiler: (show: boolean) => void;
    useTrainedThumbnail: boolean;
    setUseTrainedThumbnail: (enabled: boolean) => void;
    assetSource: AssetSourceType;
    setAssetSource: (source: AssetSourceType) => void;
    useLLMTranslation: boolean;
    setUseLLMTranslation: (enabled: boolean) => void;
    showAds: boolean;
    setShowAds: (enabled: boolean) => void;
    backgroundAnimationBudget: BackgroundAnimationBudget;
    setBackgroundAnimationBudget: (budget: BackgroundAnimationBudget) => void;
    customCursorEnabled: boolean;
    setCustomCursorEnabled: (enabled: boolean) => void;
    serverSource: ServerSourceType;
    hasHydratedThemeSettings: boolean;
    setServerSource: (source: ServerSourceType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
    children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
    const [themeCharId, setThemeCharId] = useState<string>(DEFAULT_THEME_CHAR);
    const [themeColor, setThemeColor] = useState<string>(DEFAULT_COLOR);
    const [colorSchemePreference, setColorSchemePreferenceState] = useState<ColorSchemePreference>(DEFAULT_COLOR_SCHEME_PREFERENCE);
    const [resolvedColorScheme, setResolvedColorScheme] = useState<ResolvedColorScheme>("light");
    const [hasHydratedThemeSettings, setHasHydratedThemeSettings] = useState(false);
    const [isShowSpoiler, setIsShowSpoiler] = useState(false);
    const [useTrainedThumbnailState, setUseTrainedThumbnailState] = useState(false);
    const [assetSourceState, setAssetSourceState] = useState<AssetSourceType>(DEFAULT_ASSET_SOURCE);
    const [useLLMTranslationState, setUseLLMTranslationState] = useState(true); // Default ON
    const [showAdsState, setShowAdsState] = useState(DEFAULT_SHOW_ADS);
    const [backgroundAnimationBudgetState, setBackgroundAnimationBudgetState] = useState<BackgroundAnimationBudget>(DEFAULT_BACKGROUND_ANIMATION_BUDGET);
    const [customCursorEnabledState, setCustomCursorEnabledState] = useState(DEFAULT_CUSTOM_CURSOR_ENABLED);
    const [serverSourceState, setServerSourceState] = useState<ServerSourceType>(DEFAULT_SERVER_SOURCE);
    const themeSwitchingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const effectiveShowAds = ADS_FEATURE_ENABLED && showAdsState;

    useEffect(() => {
        return () => {
            if (themeSwitchingTimeoutRef.current !== null) {
                clearTimeout(themeSwitchingTimeoutRef.current);
            }
            if (typeof document !== "undefined") {
                document.documentElement.classList.remove(THEME_SWITCHING_CLASS);
            }
        };
    }, []);

    // Load saved settings from localStorage on mount
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            const savedCharId = localStorage.getItem(THEME_CHAR_STORAGE_KEY);
            if (savedCharId && CHAR_COLORS[savedCharId]) {
                setThemeCharId(savedCharId);
                setThemeColor(CHAR_COLORS[savedCharId]);
            }
            const savedColorSchemePreference = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
            if (isValidColorSchemePreference(savedColorSchemePreference)) {
                setColorSchemePreferenceState(savedColorSchemePreference);
            }
            // Load spoiler setting
            const savedSpoiler = localStorage.getItem("show-spoiler");
            if (savedSpoiler === "true") {
                setIsShowSpoiler(true);
            }
            // Load trained thumbnail setting
            const savedTrainedThumbnail = localStorage.getItem("use-trained-thumbnail");
            if (savedTrainedThumbnail === "true") {
                setUseTrainedThumbnailState(true);
            }
            // Load asset source setting (with legacy migration)
            const savedAssetSource = localStorage.getItem("asset-source");
            const loadedAssetSource: AssetSourceType = migrateLegacyAssetSource(savedAssetSource);
            // Load LLM translation setting. Defaults to ON for Chinese UI and OFF for non-Chinese UI.
            setUseLLMTranslationState(getDefaultLLMTranslationSetting());
            // Load ads display setting
            const savedShowAds = localStorage.getItem(SHOW_ADS_STORAGE_KEY);
            if (ADS_FEATURE_ENABLED) {
                if (savedShowAds === "true") {
                    setShowAdsState(true);
                } else if (savedShowAds === "false") {
                    setShowAdsState(false);
                }
            } else {
                setShowAdsState(false);
                localStorage.setItem(SHOW_ADS_STORAGE_KEY, "false");
            }
            // Load background animation budget setting (migrating legacy values).
            const savedBackgroundAnimationBudget = normalizeBackgroundAnimationBudget(
                localStorage.getItem(BACKGROUND_ANIMATION_BUDGET_STORAGE_KEY)
            );
            if (savedBackgroundAnimationBudget) {
                setBackgroundAnimationBudgetState(savedBackgroundAnimationBudget);
            }
            setDocumentBackgroundAnimationBudget(savedBackgroundAnimationBudget ?? DEFAULT_BACKGROUND_ANIMATION_BUDGET);
            // Load theme cursor setting. Opt-out, so only an explicit "false" disables it.
            if (localStorage.getItem(CUSTOM_CURSOR_STORAGE_KEY) === "false") {
                setCustomCursorEnabledState(false);
            }
            // Load server source setting
            const savedServerSource = localStorage.getItem("server-source");
            const loadedServerSource: ServerSourceType = (
                savedServerSource === "en" ||
                savedServerSource === "jp" ||
                savedServerSource === "cn" ||
                savedServerSource === "tw" ||
                savedServerSource === "kr"
            ) ? savedServerSource : defaultContentRegionForPathname(window.location.pathname);
            setServerSourceState(loadedServerSource);

            setAssetSourceState(loadedAssetSource);
            setHasHydratedThemeSettings(true);
        });

        return () => {
            cancelAnimationFrame(raf);
        };
    }, []);

    useIsomorphicLayoutEffect(() => {
        if (typeof window === "undefined" || !hasHydratedThemeSettings) {
            return;
        }

        const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);

        const applyColorScheme = () => {
            const nextResolvedColorScheme = resolveColorSchemePreference(
                colorSchemePreference,
                mediaQuery.matches
            );

            const previousTheme = document.documentElement.dataset.theme;
            const isThemeChanging = previousTheme !== undefined && previousTheme !== nextResolvedColorScheme;

            if (isThemeChanging) {
                document.documentElement.classList.add(THEME_SWITCHING_CLASS);
                if (themeSwitchingTimeoutRef.current !== null) {
                    clearTimeout(themeSwitchingTimeoutRef.current);
                }
                themeSwitchingTimeoutRef.current = setTimeout(() => {
                    document.documentElement.classList.remove(THEME_SWITCHING_CLASS);
                    themeSwitchingTimeoutRef.current = null;
                }, THEME_SWITCHING_DURATION_MS);
            }

            document.documentElement.dataset.theme = nextResolvedColorScheme;
            document.documentElement.dataset.themePreference = colorSchemePreference;
            document.documentElement.style.colorScheme = nextResolvedColorScheme;
            document.documentElement.classList.toggle("dark", nextResolvedColorScheme === "dark");

            setResolvedColorScheme((current) =>
                current === nextResolvedColorScheme ? current : nextResolvedColorScheme
            );
        };

        applyColorScheme();

        if (colorSchemePreference !== "system") {
            return;
        }

        const handleChange = () => {
            applyColorScheme();
        };

        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", handleChange);
            return () => mediaQuery.removeEventListener("change", handleChange);
        }

        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
    }, [colorSchemePreference, hasHydratedThemeSettings]);

    useEffect(() => {
        if (typeof document === "undefined" || !hasHydratedThemeSettings) {
            return;
        }

        document.documentElement.dataset.showAds = effectiveShowAds ? "true" : "false";

        if (!effectiveShowAds || document.getElementById(ADSENSE_SCRIPT_ID)) {
            return;
        }

        const script = document.createElement("script");
        script.id = ADSENSE_SCRIPT_ID;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.src = ADSENSE_SCRIPT_SRC;
        document.head.appendChild(script);
    }, [effectiveShowAds, hasHydratedThemeSettings]);

    // Apply theme color and generate beautiful dynamic HSL-based gradient stops to CSS variables
    useEffect(() => {
        if (!hasHydratedThemeSettings) {
            return;
        }

        document.documentElement.style.setProperty("--color-miku", themeColor);
        // Also update the dark variant (darken by ~15%)
        const darkColor = darkenColor(themeColor, 15);
        document.documentElement.style.setProperty("--color-miku-dark", darkColor);

        // Regenerate the theme-reactive cursors for the new accent, or strip them
        // so globals.css falls back to native pointers. Kept in this effect (not
        // its own) because the cursors are a function of the same theme color:
        // splitting them would mean two effects racing to describe one state.
        if (customCursorEnabledState) {
            applyThemeCursors(themeColor);
        } else {
            clearThemeCursors();
        }
        document.documentElement.dataset.themeCursor = customCursorEnabledState ? "on" : "off";

        // Update light variant for background (mix with 95% white)
        const lightColor = mixWithWhite(themeColor, 95);
        document.documentElement.style.setProperty("--theme-light", lightColor);

        // Add RGB variant for rgba usage
        const rgb = hexToRgb(themeColor);
        if (rgb) {
            document.documentElement.style.setProperty("--color-miku-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);

            // Calculate HSL for advanced aesthetic gradient stop mapping
            const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

            // 1. Harmonious split-complementary color (shift hue by 150 degrees)
            const compHsl = {
                h: (hsl.h + 150) % 360,
                s: Math.max(30, Math.min(hsl.s, 85)), // keep in pleasant saturation limits
                l: hsl.l
            };
            const compRgb = hslToRgb(compHsl.h, compHsl.s, compHsl.l);
            document.documentElement.style.setProperty("--color-comp-rgb", `${compRgb.r}, ${compRgb.g}, ${compRgb.b}`);

            // 2. Intermediary analog transition color (shift hue by 60 degrees)
            const midHsl = {
                h: (hsl.h + 60) % 360,
                s: Math.max(30, Math.min(hsl.s, 80)),
                l: hsl.l
            };
            const midRgb = hslToRgb(midHsl.h, midHsl.s, midHsl.l);
            document.documentElement.style.setProperty("--color-mid-rgb", `${midRgb.r}, ${midRgb.g}, ${midRgb.b}`);

            // === LIGHT BACKGROUND GRADIENT STOP GENERATION (Highly tinted soft washes) ===
            const lightStartHsl = { h: hsl.h, s: Math.min(hsl.s * 0.45, 30), l: 94 };
            const lightStartRgb = hslToRgb(lightStartHsl.h, lightStartHsl.s, lightStartHsl.l);
            document.documentElement.style.setProperty("--theme-bg-light-start", `rgba(${lightStartRgb.r}, ${lightStartRgb.g}, ${lightStartRgb.b}, 0.65)`);

            const lightMidHsl = { h: midHsl.h, s: Math.min(midHsl.s * 0.35, 25), l: 96 };
            const lightMidRgb = hslToRgb(lightMidHsl.h, lightMidHsl.s, lightMidHsl.l);
            document.documentElement.style.setProperty("--theme-bg-light-middle", `rgba(${lightMidRgb.r}, ${lightMidRgb.g}, ${lightMidRgb.b}, 0.6)`);

            const lightEndHsl = { h: compHsl.h, s: Math.min(compHsl.s * 0.45, 30), l: 93 };
            const lightEndRgb = hslToRgb(lightEndHsl.h, lightEndHsl.s, lightEndHsl.l);
            document.documentElement.style.setProperty("--theme-bg-light-end", `rgba(${lightEndRgb.r}, ${lightEndRgb.g}, ${lightEndRgb.b}, 0.65)`);

            // === DARK BACKGROUND GRADIENT STOP GENERATION (Extremely dark premium tones) ===
            const darkStartHsl = { h: hsl.h, s: Math.min(hsl.s * 0.35, 22), l: 9 };
            const darkStartRgb = hslToRgb(darkStartHsl.h, darkStartHsl.s, darkStartHsl.l);
            document.documentElement.style.setProperty("--theme-bg-dark-start", `rgba(${darkStartRgb.r}, ${darkStartRgb.g}, ${darkStartRgb.b}, 0.8)`);

            const darkMidHsl = { h: midHsl.h, s: Math.min(midHsl.s * 0.28, 16), l: 8 };
            const darkMidRgb = hslToRgb(darkMidHsl.h, darkMidHsl.s, darkMidHsl.l);
            document.documentElement.style.setProperty("--theme-bg-dark-middle", `rgba(${darkMidRgb.r}, ${darkMidRgb.g}, ${darkMidRgb.b}, 0.75)`);

            const darkEndHsl = { h: compHsl.h, s: Math.min(compHsl.s * 0.35, 22), l: 10 };
            const darkEndRgb = hslToRgb(darkEndHsl.h, darkEndHsl.s, darkEndHsl.l);
            document.documentElement.style.setProperty("--theme-bg-dark-end", `rgba(${darkEndRgb.r}, ${darkEndRgb.g}, ${darkEndRgb.b}, 0.78)`);

            // === DARK BODY BACKGROUND OVERRIDES ===
            const darkBodyStartHsl = { h: hsl.h, s: Math.min(hsl.s * 0.22, 14), l: 5 };
            const darkBodyStartRgb = hslToRgb(darkBodyStartHsl.h, darkBodyStartHsl.s, darkBodyStartHsl.l);
            const darkBodyStartHex = rgbToHex(darkBodyStartRgb.r, darkBodyStartRgb.g, darkBodyStartRgb.b);
            document.documentElement.style.setProperty("--theme-body-bg-start", darkBodyStartHex);

            const darkBodyEndHsl = { h: compHsl.h, s: Math.min(compHsl.s * 0.22, 14), l: 8 };
            const darkBodyEndRgb = hslToRgb(darkBodyEndHsl.h, darkBodyEndHsl.s, darkBodyEndHsl.l);
            const darkBodyEndHex = rgbToHex(darkBodyEndRgb.r, darkBodyEndRgb.g, darkBodyEndRgb.b);
            document.documentElement.style.setProperty("--theme-body-bg-end", darkBodyEndHex);
        }
    }, [themeColor, hasHydratedThemeSettings, customCursorEnabledState]);

    const setThemeCharacter = (charId: string) => {
        if (CHAR_COLORS[charId]) {
            setThemeCharId(charId);
            setThemeColor(CHAR_COLORS[charId]);
            try {
                localStorage.setItem(THEME_CHAR_STORAGE_KEY, charId);
            } catch (e) {
                console.error("Failed to save theme to localStorage:", e);
            }
        } else {
            console.warn("Invalid character ID for theme:", charId);
        }
    };

    const setColorSchemePreference = (preference: ColorSchemePreference) => {
        setColorSchemePreferenceState(preference);

        try {
            localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, preference);
        } catch (e) {
            console.error("Failed to save color scheme preference to localStorage:", e);
        }
    };

    const setShowSpoiler = (show: boolean) => {
        setIsShowSpoiler(show);
        try {
            localStorage.setItem("show-spoiler", show ? "true" : "false");
        } catch (e) {
            console.error("Failed to save spoiler setting to localStorage:", e);
        }
    };

    const setUseTrainedThumbnail = (enabled: boolean) => {
        setUseTrainedThumbnailState(enabled);
        try {
            localStorage.setItem("use-trained-thumbnail", enabled ? "true" : "false");
        } catch (e) {
            console.error("Failed to save trained thumbnail setting to localStorage:", e);
        }
    };

    const setAssetSource = (source: AssetSourceType) => {
        setAssetSourceState(source);
        try {
            localStorage.setItem("asset-source", source);
        } catch (e) {
            console.error("Failed to save asset source setting to localStorage:", e);
        }
    };

    const setUseLLMTranslation = (enabled: boolean) => {
        setUseLLMTranslationState(enabled);
        try {
            localStorage.setItem(LLM_TRANSLATION_STORAGE_KEY, enabled ? "true" : "false");
        } catch (e) {
            console.error("Failed to save LLM translation setting to localStorage:", e);
        }
    };

    const setShowAds = (enabled: boolean) => {
        if (!ADS_FEATURE_ENABLED) {
            setShowAdsState(false);
            try {
                localStorage.setItem(SHOW_ADS_STORAGE_KEY, "false");
            } catch (e) {
                console.error("Failed to save ads display setting to localStorage:", e);
            }
            return;
        }

        setShowAdsState(enabled);
        try {
            localStorage.setItem(SHOW_ADS_STORAGE_KEY, enabled ? "true" : "false");
        } catch (e) {
            console.error("Failed to save ads display setting to localStorage:", e);
        }
    };

    const setBackgroundAnimationBudget = (budget: BackgroundAnimationBudget) => {
        if (!VALID_BACKGROUND_ANIMATION_BUDGETS.includes(budget)) return;

        setBackgroundAnimationBudgetState(budget);
        setDocumentBackgroundAnimationBudget(budget);
        try {
            localStorage.setItem(BACKGROUND_ANIMATION_BUDGET_STORAGE_KEY, budget);
        } catch (e) {
            console.error("Failed to save background animation budget setting to localStorage:", e);
        }
    };

    const setCustomCursorEnabled = (enabled: boolean) => {
        // The cursors themselves are (re)applied by the theme-color effect, which
        // already depends on this state — doing it here as well would paint twice.
        setCustomCursorEnabledState(enabled);
        try {
            localStorage.setItem(CUSTOM_CURSOR_STORAGE_KEY, enabled ? "true" : "false");
        } catch (e) {
            console.error("Failed to save theme cursor setting to localStorage:", e);
        }
    };

    const setServerSource = (source: ServerSourceType) => {
        setServerSourceState(source);
        try {
            localStorage.setItem("server-source", source);
        } catch (e) {
            console.error("Failed to save server source setting to localStorage:", e);
        }
    };

    return (
        <ThemeContext.Provider value={{ themeCharId, themeColor, setThemeCharacter, colorSchemePreference, resolvedColorScheme, setColorSchemePreference, isShowSpoiler, setShowSpoiler, useTrainedThumbnail: useTrainedThumbnailState, setUseTrainedThumbnail, assetSource: assetSourceState, setAssetSource, useLLMTranslation: useLLMTranslationState, setUseLLMTranslation, showAds: effectiveShowAds, setShowAds, backgroundAnimationBudget: backgroundAnimationBudgetState, setBackgroundAnimationBudget, customCursorEnabled: customCursorEnabledState, setCustomCursorEnabled, serverSource: serverSourceState, setServerSource, hasHydratedThemeSettings }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}

// Helper function to darken a hex color
function darkenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max((num >> 16) - amt, 0);
    const G = Math.max(((num >> 8) & 0x00ff) - amt, 0);
    const B = Math.max((num & 0x0000ff) - amt, 0);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

// Helper function to mix a color with white (tint)
function mixWithWhite(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const R = (num >> 16) & 0xff;
    const G = (num >> 8) & 0xff;
    const B = num & 0xff;

    // Mix with white (255, 255, 255)
    // percent is chance of white (0-100)
    const factor = percent / 100;

    const newR = Math.round(R * (1 - factor) + 255 * factor);
    const newG = Math.round(G * (1 - factor) + 255 * factor);
    const newB = Math.round(B * (1 - factor) + 255 * factor);

    return `#${((1 << 24) + (newR << 16) + (newG << 8) + newB).toString(16).slice(1)}`;
}

// Helper: Hex to RGB object
function hexToRgb(hex: string): { r: number, g: number, b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Helper: RGB to HSL object conversion
function rgbToHsl(r: number, g: number, b: number) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

// Helper: HSL to RGB object conversion
function hslToRgb(h: number, s: number, l: number) {
    h /= 360; s /= 100; l /= 100;
    let r = l, g = l, b = l;
    if (s !== 0) {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

// Helper: RGB to Hex string conversion
function rgbToHex(r: number, g: number, b: number): string {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Export character color data for use in settings
export { CHAR_COLORS };
