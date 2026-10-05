"use client";
import { Card, ErrorState, Icon, LoadingState, PageContainer } from "@/components/md3";
import { mdChevronRight } from "@/components/md3/icons";
import { useState, useEffect } from "react";
import MainLayout from "@/components/MainLayout";
import { fetchMasterData } from "@/lib/fetch";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSimpleScrollRestore } from "@/hooks/useSimpleScrollRestore";
import { StoryPageHeader } from "@/components/story/StoryPageHeader";

interface ISpecialStoryEpisode {
    id: number;
    specialStoryId: number;
    episodeNo: number;
    title: string;
    assetbundleName: string;
    scenarioId: string;
}
interface ISpecialStory {
    id: number;
    seq: number;
    title?: string;
    episodes: ISpecialStoryEpisode[];
}

export default function StorySpecialListClient() {
    const { serverSource } = useTheme();
    const { t } = useI18n();
    const [stories, setStories] = useState<ISpecialStory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    useSimpleScrollRestore("story_special", !isLoading);

    useEffect(() => {
        async function load() {
            try {
                const data = await fetchMasterData<ISpecialStory[]>("specialStories.json");
                // Skip id == 2 (special case per crawler)
                setStories(data.filter(s => s.id !== 2 && s.episodes.length > 0));
            } catch (err) {
                setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [serverSource, t]);

    function getTitle(s: ISpecialStory): string {
        return s.title ?? s.episodes[0]?.title ?? t("page.story.special.fallbackTitle", { id: s.id });
    }

    return (
        <MainLayout>
            <PageContainer>
                <StoryPageHeader storyKey="special" />

                {isLoading && <LoadingState label={t("common.state.loading")} />}
                {error && <ErrorState title={t("common.state.loadingFailed")} message={error} retryLabel={t("common.action.retry")} />}

                {!isLoading && !error && (
                    <div className="space-y-2">
                        {stories.map(s => (
                            <Card key={s.id} href={`/story/special/${s.id}`} variant="filled" className="group flex items-center justify-between gap-3 p-4">
                                <div className="min-w-0">
                                    <span className="type-label-m text-primary">SP{s.id}</span>
                                    <p className="mt-0.5 type-title-m text-on-surface transition-colors group-hover:text-primary">{getTitle(s)}</p>
                                    <p className="mt-0.5 type-body-s text-on-surface-variant">
                                        {t("page.story.special.episodeCount", { count: s.episodes.length })}
                                    </p>
                                </div>
                                <Icon path={mdChevronRight} className="text-on-surface-variant" />
                            </Card>
                        ))}
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
