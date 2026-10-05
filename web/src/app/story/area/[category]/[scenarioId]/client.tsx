"use client";
import { useState, useEffect, useMemo } from "react";
import { PageContainer } from "@/components/md3";
import { ServerSourceBadge, StoryBackButton, StoryReaderHeader } from "@/components/story/StoryReaderChrome";
import { useParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { StoryReader } from "@/components/story/StoryReader";
import { StoryTranslationSourceBadge } from "@/components/story/StoryTranslationSourceBadge";
import { fetchMasterData } from "@/lib/fetch";
import { useTheme, type ServerSourceType } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { fetchStoryAssetFromMirror, StoryAssetMissingError } from "@/lib/storyAsset";
import { mergeTranslations, processScenarioForDisplay } from "@/lib/storyLoader";
import {
    areaTalkTranslationGroup,
    IEventStoryTranslation,
    loadStoryTranslation,
    sideStoryTranslationEnabled,
    storyEpisodeTranslationSource,
} from "@/lib/eventStoryTranslation";
import { IProcessedScenarioData } from "@/types/story";
import type { UiLocale } from "@/lib/i18n";

interface IActionSet {
    id: number; areaId: number; releaseConditionId: number;
    scenarioId?: string; actionSetType?: string; isNextGrade?: boolean;
}
interface IArea { id: number; name: string; subName?: string; }

export default function StoryAreaTalkClient() {
    const params = useParams();
    const { serverSource, assetSource, useLLMTranslation } = useTheme();
    const { locale, t } = useI18n();
    const areaIdParam = decodeURIComponent(params.category as string);
    const scenarioId = decodeURIComponent(params.scenarioId as string);
    const lang: "jp" | "cn" = serverSource === "cn" ? "cn" : "jp";

    const [areaName, setAreaName] = useState<string>("");
    const [actionSet, setActionSet] = useState<{ id: number; serverSource: ServerSourceType } | null>(null);
    const [scenarioData, setScenarioData] = useState<IProcessedScenarioData | null>(null);
    const [missingPaths, setMissingPaths] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [translationState, setTranslationState] = useState<{
        group: number;
        locale: UiLocale;
        translation: IEventStoryTranslation | null;
    } | null>(null);

    useEffect(() => {
        if (!scenarioId) return;
        // serverSource hydrates from localStorage one frame after mount; drop the stale run.
        let cancelled = false;
        async function load() {
            setIsLoading(true);
            setError(null);
            setMissingPaths(null);
            setScenarioData(null);
            try {
                const [actionSetsData, areasData] = await Promise.all([
                    fetchMasterData<IActionSet[]>("actionSets.json"),
                    fetchMasterData<IArea[]>("areas.json"),
                ]);
                if (cancelled) return;
                const action = actionSetsData.find(a => a.scenarioId === scenarioId);
                if (!action?.scenarioId) throw new Error(t("page.story.area.dialogueNotFound"));

                setActionSet({ id: action.id, serverSource });
                const area = areasData.find(a => a.id === action.areaId);
                const name = area ? (area.subName ? `${area.name} - ${area.subName}` : area.name) : t("page.story.area.areaFallback", { id: action.areaId });
                setAreaName(name);
                document.title = t("page.story.area.documentTitle", { name });

                const group = Math.floor(action.id / 100);
                const raw = await fetchStoryAssetFromMirror("talk", assetSource, {
                    scenarioId: action.scenarioId,
                    group,
                });
                if (cancelled) return;
                const processed = await processScenarioForDisplay(raw, "talk", assetSource, serverSource);
                if (!cancelled) setScenarioData(processed);
            } catch (err) {
                if (cancelled) return;
                if (err instanceof StoryAssetMissingError) setMissingPaths(err.missingPaths);
                else setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scenarioId, lang, serverSource, t]);

    // The translation file is grouped by the JP actionSet id.
    const translationGroup = actionSet?.serverSource === "jp" ? areaTalkTranslationGroup(actionSet.id) : null;
    const translationEnabled = translationGroup !== null && sideStoryTranslationEnabled(serverSource, locale, useLLMTranslation);
    useEffect(() => {
        if (translationGroup === null || !translationEnabled) return;
        let cancelled = false;
        loadStoryTranslation("area", translationGroup, locale).then((translation) => {
            if (!cancelled) setTranslationState({ group: translationGroup, locale, translation });
        });
        return () => { cancelled = true; };
    }, [translationGroup, locale, translationEnabled]);

    const activeTranslation = translationState?.group === translationGroup && translationState.locale === locale
        ? translationState
        : null;
    // The original script shows as soon as it loads; a translation merges in when its file arrives.
    const translation = translationEnabled ? activeTranslation?.translation ?? null : null;
    const translationSource = storyEpisodeTranslationSource(translation, scenarioId);
    const displayedScenario = useMemo(() => (
        scenarioData && translationSource
            ? { ...scenarioData, actions: mergeTranslations(scenarioData.actions, translation, scenarioId, locale) }
            : scenarioData
    ), [scenarioData, translation, translationSource, scenarioId, locale]);

    return (
        <MainLayout>
            <PageContainer>
                <StoryBackButton href={`/story/area/${encodeURIComponent(areaIdParam)}`}>{t("page.story.area.backToDialogueList")}</StoryBackButton>

                <StoryReaderHeader
                    title={areaName || t("page.story.area.dialogueFallback", { id: scenarioId })}
                    badges={
                        <>
                            <span className="type-label-m text-on-surface-variant">
                                ID: {actionSet?.id}:{scenarioId}
                            </span>
                            {translationSource && <StoryTranslationSourceBadge source={translationSource} />}
                            <ServerSourceBadge serverSource={serverSource} />
                        </>
                    }
                />

                <StoryReader
                    scenarioData={displayedScenario}
                    isLoading={isLoading}
                    error={error}
                    missingPaths={missingPaths ?? undefined}
                    endLabel={t("page.story.area.endLabel")}
                    translationSource={translationSource}
                    storyType="area"
                />
            </PageContainer>
        </MainLayout>
    );
}
