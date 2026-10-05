"use client";
import React from "react";
import { useTranslation } from "@/contexts/TranslationContext";
import { TranslationData } from "@/lib/translations";

interface TranslatedTextProps {
    /** The original Japanese text */
    original: string;
    /** Translation category (e.g., "cards", "events", etc.) */
    category: keyof TranslationData;
    /** Sub-category within the category (e.g., "prefix", "name", etc.) */
    field: string;
    /** Custom class name for the original text */
    originalClassName?: string;
    /** Custom class name for the translation text */
    translationClassName?: string;
    /** Whether to show inline (side by side) instead of stacked */
    inline?: boolean;
}

/**
 * Component that displays original text with optional translation below
 * When LLM translation is enabled and a translation exists, shows:
 *   Original Text
 *   Translated text
 */
export function TranslatedText({
    original,
    category,
    field,
    originalClassName = "",
    translationClassName = "type-body-s text-on-surface-variant mt-0.5",
    inline = false,
}: TranslatedTextProps) {
    const { t } = useTranslation();

    const translation = t(category, field, original);

    if (!translation) {
        // No translation available, just show original
        return <span className={originalClassName}>{original}</span>;
    }

    if (inline) {
        return (
            <span className={originalClassName}>
                {original}
                <span className={`ml-2 ${translationClassName}`}>
                    ({translation})
                </span>
            </span>
        );
    }

    // Two-line stacked display (default)
    return (
        <span className="flex flex-col">
            <span className={originalClassName}>{original}</span>
            <span className={translationClassName}>{translation}</span>
        </span>
    );
}

/**
 * Hook version for more complex use cases
 * Returns the translation if available, null otherwise
 */
export function useTranslatedText(
    original: string,
    category: keyof TranslationData,
    field: string
): string | null {
    const { t } = useTranslation();
    return t(category, field, original);
}
