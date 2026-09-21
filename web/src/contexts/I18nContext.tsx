"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from "react";
import {
    DEFAULT_UI_LOCALE,
    UI_LOCALE_STORAGE_KEY,
    applyUiLocaleToDocument,
    detectBrowserUiLocale,
    normalizeUiLocale,
    type UiLocale,
} from "@/lib/i18n";
import { fallbackMessages, messagesByLocale } from "@/lib/i18n/messages";
import { getMessageByPath, interpolateMessage, type MessageInterpolationValues } from "@/lib/i18n/format";
import type { MessageTree } from "@/lib/i18n/messages/types";
import { routeLocaleToUiLocale, uiLocaleToRouteLocale, type RouteLocale } from "@/lib/locale-routing";
import { getRouteLocaleFromPathname, localizePath } from "@/lib/localized-path";

interface I18nContextType {
    locale: UiLocale;
    routeLocale: RouteLocale;
    setLocale: React.Dispatch<React.SetStateAction<UiLocale>>;
    /** A live feature can opt into router navigation instead of destroying its realm. */
    registerLocaleNavigation: (navigate: (url: string) => void) => () => void;
    t: (key: string, values?: MessageInterpolationValues) => string;
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
    formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
    messages: MessageTree;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

interface I18nProviderProps {
    children: React.ReactNode;
    initialLocale?: UiLocale;
    routeLocale?: RouteLocale;
}

function readStoredLocale(initialLocale: UiLocale): UiLocale {
    if (typeof window === "undefined") return initialLocale;

    try {
        const stored = localStorage.getItem(UI_LOCALE_STORAGE_KEY);
        if (stored) return normalizeUiLocale(stored);
    } catch {
        // Ignore storage errors and fall back to browser / initial locale.
    }

    return detectBrowserUiLocale(initialLocale);
}

function persistLocale(locale: UiLocale) {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale);
    } catch {
        // Ignore storage failures.
    }

    try {
        document.cookie = `${UI_LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=31536000; samesite=lax`;
    } catch {
        // Ignore cookie failures.
    }
}

export function I18nProvider({ children, initialLocale = DEFAULT_UI_LOCALE, routeLocale }: I18nProviderProps) {
    const explicitLocale = routeLocale ? routeLocaleToUiLocale(routeLocale) : undefined;
    const [locale, setLocaleState] = useState<UiLocale>(explicitLocale ?? initialLocale);
    const [hydrated, setHydrated] = useState(false);
    const localeNavigation = useRef<((url: string) => void) | null>(null);
    const registerLocaleNavigation = useCallback((navigate: (url: string) => void) => {
        localeNavigation.current = navigate;
        return () => { if (localeNavigation.current === navigate) localeNavigation.current = null; };
    }, []);
    const resolvedRouteLocale = useMemo(
        () => uiLocaleToRouteLocale(locale),
        [locale],
    );

    useEffect(() => {
        const resolved = explicitLocale ?? readStoredLocale(initialLocale);
        persistLocale(resolved);
        applyUiLocaleToDocument(resolved);
        const frame = requestAnimationFrame(() => {
            setLocaleState(resolved);
            setHydrated(true);
        });
        return () => cancelAnimationFrame(frame);
    }, [explicitLocale, initialLocale]);

    useEffect(() => {
        if (!hydrated) return;
        persistLocale(locale);
        applyUiLocaleToDocument(locale);
    }, [hydrated, locale]);

    useEffect(() => {
        if (!hydrated || explicitLocale || typeof window === "undefined") return;

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== UI_LOCALE_STORAGE_KEY) return;
            const nextLocale = normalizeUiLocale(event.newValue ?? initialLocale);
            setLocaleState(nextLocale);
        };

        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [explicitLocale, hydrated, initialLocale]);

    const setLocale = useCallback<React.Dispatch<React.SetStateAction<UiLocale>>>((nextLocale) => {
        const resolvedLocale = typeof nextLocale === "function" ? nextLocale(locale) : nextLocale;
        setLocaleState(resolvedLocale);
        persistLocale(resolvedLocale);

        if (typeof window !== "undefined" && getRouteLocaleFromPathname(window.location.pathname)) {
            const nextRouteLocale = uiLocaleToRouteLocale(resolvedLocale);
            const nextUrl = localizePath(
                `${window.location.pathname}${window.location.search}${window.location.hash}`,
                nextRouteLocale,
            );
            if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
                if (localeNavigation.current) localeNavigation.current(nextUrl);
                else window.location.assign(nextUrl);
            }
        }
    }, [locale]);

    const t = useCallback((key: string, values?: MessageInterpolationValues) => {
        const currentMessages = messagesByLocale[locale] ?? fallbackMessages;
        const current = getMessageByPath(currentMessages, key) ?? getMessageByPath(fallbackMessages, key);
        if (!current) return key;
        return interpolateMessage(current, values);
    }, [locale]);

    const formatNumber = useCallback((value: number, options?: Intl.NumberFormatOptions) => {
        return new Intl.NumberFormat(locale, options).format(value);
    }, [locale]);

    const formatDate = useCallback((value: Date | number | string, options?: Intl.DateTimeFormatOptions) => {
        const date = value instanceof Date ? value : new Date(value);
        return new Intl.DateTimeFormat(locale, options).format(date);
    }, [locale]);

    const messages = useMemo(() => messagesByLocale[locale] ?? fallbackMessages, [locale]);

    return (
        <I18nContext.Provider value={{
            locale,
            routeLocale: resolvedRouteLocale,
            setLocale,
            registerLocaleNavigation,
            t,
            formatNumber,
            formatDate,
            messages,
        }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (context === undefined) {
        throw new Error("useI18n must be used within an I18nProvider");
    }
    return context;
}
