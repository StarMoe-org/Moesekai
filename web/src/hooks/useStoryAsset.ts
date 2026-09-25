"use client";
/**
 * useStoryAsset — generic story asset loading hook
 *
 * - Resolves lang (jp/cn) from serverSource.
 * - Optionally merges target-locale overlays into Japanese scenario actions.
 * - Handles StoryAssetMissingError consistently.
 */
import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchStoryAssetFromMirror, StoryAssetMissingError, StoryAssetType, AssetParams } from "@/lib/storyAsset";
import { processScenarioForDisplay, mergeTranslations } from "@/lib/storyLoader";
import { IProcessedScenarioData } from "@/types/story";
import { IEventStoryTranslation } from "@/lib/eventStoryTranslation";
import type { UiLocale } from "@/lib/i18n";

export interface UseStoryAssetOptions {
    type: StoryAssetType;
    params: AssetParams | null; // null = not ready yet
    /** Optional target-locale translation to merge (only used when lang=jp). */
    translation?: IEventStoryTranslation | null;
    /** Episode number for translation lookup */
    episodeNo?: number;
    /** Target locale for locale-neutral translated fields. */
    translationLocale?: UiLocale;
    /** Localized fallback used when a thrown value is not an Error instance. */
    fallbackErrorMessage?: string;
}

export interface UseStoryAssetResult {
    scenarioData: IProcessedScenarioData | null;
    isLoading: boolean;
    error: string | null;
    missingPaths: string[] | null;
    lang: "jp" | "cn";
    translationSource: "official_cn" | "llm" | "human" | undefined;
}

export function useStoryAsset({
    type,
    params,
    translation,
    episodeNo,
    translationLocale = "zh-CN",
    fallbackErrorMessage = "Failed to load",
}: UseStoryAssetOptions): UseStoryAssetResult {
    const { serverSource, assetSource } = useTheme();
    const lang: "jp" | "cn" = serverSource === "cn" ? "cn" : "jp";

    const [scenarioData, setScenarioData] = useState<IProcessedScenarioData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [missingPaths, setMissingPaths] = useState<string[] | null>(null);
    const [translationSource, setTranslationSource] = useState<"official_cn" | "llm" | "human" | undefined>(undefined);

    // Stable key to detect param changes
    const paramsKey = params
        ? `${type}|${lang}|${assetSource}|${params.scenarioId}|${params.assetbundleName ?? ""}|${params.group ?? ""}`
        : null;

    useEffect(() => {
        if (!params || !paramsKey) return;

        let cancelled = false;

        async function load() {
            setIsLoading(true);
            setError(null);
            setMissingPaths(null);
            setScenarioData(null);
            setTranslationSource(undefined);

            try {
                const rawData = await fetchStoryAssetFromMirror(type, assetSource, params!);
                if (cancelled) return;

                const processed = await processScenarioForDisplay(rawData, "scenario", assetSource, serverSource);
                if (cancelled) return;

                // Merge JP translation if available
                if (lang === "jp" && translation && episodeNo !== undefined) {
                    const merged = mergeTranslations(processed.actions, translation, episodeNo, translationLocale);
                    setScenarioData({ ...processed, actions: merged });
                    setTranslationSource(translation.meta?.source);
                } else {
                    setScenarioData(processed);
                }
            } catch (err) {
                if (cancelled) return;
                if (err instanceof StoryAssetMissingError) {
                    setMissingPaths(err.missingPaths);
                } else {
                    setError(err instanceof Error ? err.message : fallbackErrorMessage);
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramsKey, translation, episodeNo, translationLocale, fallbackErrorMessage]);

    return { scenarioData, isLoading, error, missingPaths, lang, translationSource };
}
