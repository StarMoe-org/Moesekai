"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "@/components/LocalizedLink";
import MainLayout from "@/components/MainLayout";
import { StoryReader } from "@/components/story/StoryReader";
import { fetchMasterData } from "@/lib/fetch";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { fetchStoryAssetFromMirror, StoryAssetMissingError } from "@/lib/storyAsset";
import { processScenarioForDisplay } from "@/lib/storyLoader";
import { IProcessedScenarioData } from "@/types/story";

interface IActionSet {
    id: number; areaId: number; releaseConditionId: number;
    scenarioId?: string; actionSetType?: string; isNextGrade?: boolean;
}
interface IArea { id: number; name: string; subName?: string; }

export default function StoryAreaTalkClient() {
    const params = useParams();
    const { serverSource, assetSource } = useTheme();
    const { t } = useI18n();
    const areaIdParam = decodeURIComponent(params.category as string);
    const scenarioId = decodeURIComponent(params.scenarioId as string);
    const lang: "jp" | "cn" = serverSource === "cn" ? "cn" : "jp";

    const [areaName, setAreaName] = useState<string>("");
    const [actionSetId, setActionSetId] = useState<number | null>(null);
    const [scenarioData, setScenarioData] = useState<IProcessedScenarioData | null>(null);
    const [missingPaths, setMissingPaths] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!scenarioId) return;
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
                const action = actionSetsData.find(a => a.scenarioId === scenarioId);
                if (!action?.scenarioId) throw new Error(t("page.story.area.dialogueNotFound"));

                setActionSetId(action.id);
                const area = areasData.find(a => a.id === action.areaId);
                const name = area ? (area.subName ? `${area.name} - ${area.subName}` : area.name) : t("page.story.area.areaFallback", { id: action.areaId });
                setAreaName(name);
                document.title = t("page.story.area.documentTitle", { name });

                const group = Math.floor(action.id / 100);
                const raw = await fetchStoryAssetFromMirror("talk", assetSource, {
                    scenarioId: action.scenarioId,
                    group,
                });
                setScenarioData(await processScenarioForDisplay(raw, "talk", assetSource, serverSource));
            } catch (err) {
                if (err instanceof StoryAssetMissingError) setMissingPaths(err.missingPaths);
                else setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scenarioId, lang, t]);

    return (
        <MainLayout>
            <div className="container mx-auto px-4 sm:px-6 py-8">
                <Link
                    href={`/story/area/${encodeURIComponent(areaIdParam)}`}
                    className="inline-flex items-center gap-2 text-miku hover:text-miku-dark transition-colors mb-6"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    {t("page.story.area.backToDialogueList")}
                </Link>

                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl p-4 mb-6 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="font-bold text-slate-900 dark:text-slate-100">{areaName || t("page.story.area.dialogueFallback", { id: scenarioId })}</h1>
                        <span className="text-xs text-slate-400">ID: {actionSetId}:{scenarioId}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            serverSource === "cn"
                                ? "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/50"
                                : "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50"
                        }`}>{t(`page.story.serverSource.${serverSource}`)}</span>
                    </div>
                </div>

                <StoryReader
                    scenarioData={scenarioData}
                    isLoading={isLoading}
                    error={error}
                    missingPaths={missingPaths ?? undefined}
                    endLabel={t("page.story.area.endLabel")}
                />
            </div>
        </MainLayout>
    );
}
