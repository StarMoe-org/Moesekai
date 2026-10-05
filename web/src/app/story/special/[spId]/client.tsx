"use client";
import { LoadingState, PageContainer } from "@/components/md3";
import { ServerSourceBadge, StoryBackButton, StoryBadge, StoryReaderHeader } from "@/components/story/StoryReaderChrome";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { StoryReader } from "@/components/story/StoryReader";
import { fetchMasterData } from "@/lib/fetch";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { fetchStoryAssetFromMirror, StoryAssetMissingError } from "@/lib/storyAsset";
import { processScenarioForDisplay } from "@/lib/storyLoader";
import { IProcessedScenarioData } from "@/types/story";

interface ISpecialStoryEpisode {
    id: number; specialStoryId: number; episodeNo: number;
    title: string; assetbundleName: string; scenarioId: string;
}
interface ISpecialStory {
    id: number; seq: number; title?: string;
    episodes: ISpecialStoryEpisode[];
}

type EpResult = { data: IProcessedScenarioData | null; missing: string[] | null; err: string | null };

export default function StorySpecialReaderClient() {
    const params = useParams();
    const { serverSource, assetSource } = useTheme();
    const { t } = useI18n();
    const spId = Number(params.spId);
    const lang: "jp" | "cn" = serverSource === "cn" ? "cn" : "jp";

    const [story, setStory] = useState<ISpecialStory | null>(null);
    const [results, setResults] = useState<EpResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!spId) return;
        async function load() {
            setIsLoading(true);
            try {
                const data = await fetchMasterData<ISpecialStory[]>("specialStories.json");
                const s = data.find(x => x.id === spId);
                if (!s || s.id === 2) return;
                setStory(s);
                const title = s.title ?? s.episodes[0]?.title ?? `SP${spId}`;
                document.title = t("page.story.special.documentTitle", { name: title });

                const epResults: EpResult[] = await Promise.all(
                    s.episodes.map(async (ep): Promise<EpResult> => {
                        try {
                            const raw = await fetchStoryAssetFromMirror("special", assetSource, {
                                assetbundleName: ep.assetbundleName,
                                scenarioId: ep.scenarioId,
                            });
                            return { data: await processScenarioForDisplay(raw, "special", assetSource, serverSource), missing: null, err: null };
                        } catch (err) {
                            if (err instanceof StoryAssetMissingError)
                                return { data: null, missing: err.missingPaths, err: null };
                            return { data: null, missing: null, err: err instanceof Error ? err.message : t("common.state.loadingFailed") };
                        }
                    })
                );
                setResults(epResults);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spId, lang, t]);

    const storyTitle = story?.title ?? story?.episodes[0]?.title ?? t("page.story.special.fallbackTitle", { id: spId });
    const multiEp = (story?.episodes.length ?? 0) > 1;

    return (
        <MainLayout>
            <PageContainer>
                <StoryBackButton href="/story/special">{t("page.story.special.backToList")}</StoryBackButton>

                <StoryReaderHeader
                    eyebrow={<span className="text-primary">SP{spId}</span>}
                    title={storyTitle}
                    badges={<ServerSourceBadge serverSource={serverSource} />}
                />

                {isLoading && <LoadingState label={t("page.story.special.loading")} />}

                {!isLoading && story && results.length > 0 && (
                    <div className="mx-auto max-w-4xl space-y-10">
                        {story.episodes.map((ep, i) => {
                            const r = results[i];
                            return (
                                <div key={ep.id}>
                                    {multiEp && (
                                        <div className="mb-4 flex items-center gap-3">
                                            <StoryBadge tone="primary">{t("page.story.special.episodeLabel", { episode: ep.episodeNo })}</StoryBadge>
                                            <h2 className="type-title-l text-on-surface">{ep.title}</h2>
                                        </div>
                                    )}
                                    <StoryReader
                                        scenarioData={r?.data ?? null}
                                        isLoading={false}
                                        error={r?.err ?? null}
                                        missingPaths={r?.missing ?? undefined}
                                        endLabel={multiEp ? t("page.story.special.episodeLabel", { episode: ep.episodeNo }) : storyTitle}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
