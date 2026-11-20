"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useTheme } from "./ThemeContext";
import { useI18n } from "./I18nContext";
import { loadTranslations, getTranslation, hasTranslation, TranslationData, TranslationMap } from "@/lib/translations";

interface TranslationContextType {
    translations: TranslationData | null;
    isLoading: boolean;
    // Helper function: returns translation if setting is ON and translation exists, otherwise original
    t: (category: keyof TranslationData, subCategory: string, original: string) => string | null;
    // Check if translation exists for a text
    hasT: (category: keyof TranslationData, subCategory: string, original: string) => boolean;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

interface TranslationProviderProps {
    children: ReactNode;
}

export function TranslationProvider({ children }: TranslationProviderProps) {
    const { useLLMTranslation } = useTheme();
    const { locale } = useI18n();
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load translations on mount
    useEffect(() => {
        let mounted = true;
        setTranslations(null);
        setIsLoading(true);

        async function load() {
            try {
                const data = await loadTranslations(locale);
                if (mounted) {
                    setTranslations(data);
                }
            } catch (error) {
                console.error("Failed to load translations:", error);
            } finally {
                if (mounted) {
                    setIsLoading(false);
                }
            }
        }

        load();

        return () => {
            mounted = false;
        };
    }, [locale]);

    // Translation helper function
    const t = useCallback((category: keyof TranslationData, subCategory: string, original: string): string | null => {
        // If translation is disabled, return null (caller should show original only)
        if (!useLLMTranslation) return null;

        // If translations not loaded yet, return null
        if (!translations) return null;

        // Get the category data
        const categoryData = translations[category];
        if (!categoryData) return null;

        // Get the sub-category map
        const map = (categoryData as Record<string, TranslationMap>)[subCategory];
        if (!map) return null;

        // Get translation
        const translated = getTranslation(map, original);

        // If empty or same as original (after trimming whitespace), no translation available
        if (!translated.trim() || translated.trim() === original.trim()) return null;

        return translated;
    }, [useLLMTranslation, translations]);

    // Check if translation exists
    const hasT = useCallback((category: keyof TranslationData, subCategory: string, original: string): boolean => {
        if (!useLLMTranslation || !translations) return false;

        const categoryData = translations[category];
        if (!categoryData) return false;

        const map = (categoryData as Record<string, TranslationMap>)[subCategory];
        return hasTranslation(map, original);
    }, [useLLMTranslation, translations]);

    return (
        <TranslationContext.Provider value={{ translations, isLoading, t, hasT }}>
            {children}
        </TranslationContext.Provider>
    );
}

export function useTranslation() {
    const context = useContext(TranslationContext);
    if (context === undefined) {
        throw new Error("useTranslation must be used within a TranslationProvider");
    }
    return context;
}
