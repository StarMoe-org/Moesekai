"use client";
import { useState, useEffect } from "react";
import MainLayout from "@/components/MainLayout";
import { fetchMasterData } from "@/lib/fetch";
import { useTheme } from "@/contexts/ThemeContext";
import { IUnitProfile } from "@/types/types";
import { useSimpleScrollRestore } from "@/hooks/useSimpleScrollRestore";
import { StoryPageHeader } from "@/components/story/StoryPageHeader";
import { useI18n } from "@/contexts/I18nContext";
import { Card, ErrorState, LoadingState, PageContainer } from "@/components/md3";

interface IUnitStoryChapterEpisode {
    episodeNo: number;
    title: string;
    scenarioId: string;
    unitStoryEpisodeGroupId: number;
    releaseConditionId: number;
}
interface IUnitStoryChapter {
    assetbundleName: string;
    episodes: IUnitStoryChapterEpisode[];
}
interface IUnitStory {
    id: number;
    seq: number;
    unit: string;
    chapters: IUnitStoryChapter[];
}

function getUnitOutlineLogoUrl(unitCode: string, server: string): string {
    const s = server === "cn" ? "cn" : "jp";
    return `/images/unit-logos/logo_${unitCode}_${s}.png`;
}

export default function StoryUnitListClient() {
    const { serverSource } = useTheme();
    const { t } = useI18n();
    const [units, setUnits] = useState<{ profile: IUnitProfile; story: IUnitStory }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    useSimpleScrollRestore("story_unit", !isLoading);

    useEffect(() => {
        async function load() {
            try {
                const [profiles, stories] = await Promise.all([
                    fetchMasterData<IUnitProfile[]>("unitProfiles.json"),
                    fetchMasterData<IUnitStory[]>("unitStories.json"),
                ]);
                const merged = profiles
                    .map(p => {
                        const story = stories.find(s => s.seq === p.seq);
                        return story ? { profile: p, story } : null;
                    })
                    .filter(Boolean) as { profile: IUnitProfile; story: IUnitStory }[];
                merged.sort((a, b) => {
                    // piapro always last
                    if (a.profile.unit === "piapro") return 1;
                    if (b.profile.unit === "piapro") return -1;
                    return a.profile.seq - b.profile.seq;
                });
                setUnits(merged);
            } catch (err) {
                setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [serverSource, t]);

    return (
        <MainLayout>
            <PageContainer>
                <StoryPageHeader storyKey="unit" />

                {isLoading && <LoadingState label={t("common.state.loading")} />}
                {error && <ErrorState title={t("common.state.loadingFailed")} message={error} retryLabel={t("common.action.retry")} />}

                {!isLoading && !error && (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        {units.map(({ profile, story }) => {
                            const logoUrl = getUnitOutlineLogoUrl(profile.unit, serverSource);
                            const episodeCount = story.chapters[0]?.episodes.length ?? 0;
                            return (
                                <Card
                                    key={profile.seq}
                                    href={`/story/unit/${profile.seq}`}
                                    variant="filled"
                                    className="group flex flex-col items-center gap-3 p-5 text-center"
                                >
                                    <div className="flex h-14 w-full items-center justify-center">
                                        <img src={logoUrl} alt={profile.unitName} className="max-h-full max-w-full object-contain" />
                                    </div>
                                    <div>
                                        <h2 className="type-title-s text-on-surface transition-colors group-hover:text-primary">
                                            {profile.unitName}
                                        </h2>
                                        <p className="mt-0.5 type-body-s text-on-surface-variant">
                                            {t("page.story.unit.episodeCount", { count: episodeCount })}
                                        </p>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
