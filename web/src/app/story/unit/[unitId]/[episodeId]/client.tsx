"use client";
import { PageContainer } from "@/components/md3";
import { ServerSourceBadge, StoryBackButton, StoryEpisodeNav, StoryReaderHeader } from "@/components/story/StoryReaderChrome";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { StoryReader } from "@/components/story/StoryReader";
import { useStoryAsset } from "@/hooks/useStoryAsset";
import { fetchMasterData } from "@/lib/fetch";
import { IUnitProfile } from "@/types/types";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";

function getUnitOutlineLogoUrl(unitCode: string, server: string): string {
    const s = server === "cn" ? "cn" : "jp";
    return `/images/unit-logos/logo_${unitCode}_${s}.png`;
}

interface IUnitStoryChapterEpisode {
    episodeNo: number;
    episodeNoLabel: string;
    title: string;
    scenarioId: string;
    unitStoryEpisodeGroupId: number;
}
interface IUnitStoryChapter { assetbundleName: string; episodes: IUnitStoryChapterEpisode[]; }
interface IUnitStory { id: number; seq: number; unit: string; chapters: IUnitStoryChapter[]; }

export default function StoryUnitReaderClient() {
    const params = useParams();
    const { serverSource } = useTheme();
    const { t } = useI18n();
    const unitId = Number(params.unitId);
    const episodeId = decodeURIComponent(params.episodeId as string);

    const [profile, setProfile] = useState<IUnitProfile | null>(null);
    const [allEpisodes, setAllEpisodes] = useState<IUnitStoryChapterEpisode[]>([]);
    const [assetbundleName, setAssetbundleName] = useState<string>("");
    const [masterLoading, setMasterLoading] = useState(true);

    useEffect(() => {
        if (!unitId || !episodeId) return;
        async function load() {
            setMasterLoading(true);
            try {
                const [profiles, stories] = await Promise.all([
                    fetchMasterData<IUnitProfile[]>("unitProfiles.json"),
                    fetchMasterData<IUnitStory[]>("unitStories.json"),
                ]);
                const p = profiles.find(x => x.seq === unitId);
                if (!p) return;
                setProfile(p);
                const s = stories.find(x => x.seq === unitId);
                if (!s?.chapters[0]) return;
                setAllEpisodes(s.chapters[0].episodes);
                setAssetbundleName(s.chapters[0].assetbundleName);
                const ep = s.chapters[0].episodes.find(e => e.scenarioId === episodeId);
                if (ep) document.title = `${ep.title} - ${p.unitName} - Moesekai`;
            } finally {
                setMasterLoading(false);
            }
        }
        load();
    }, [unitId, episodeId, serverSource]);

    const currentEp = allEpisodes.find(e => e.scenarioId === episodeId);
    const currentIndex = allEpisodes.findIndex(e => e.scenarioId === episodeId);
    const prevEp = currentIndex > 0 ? allEpisodes[currentIndex - 1] : null;
    const nextEp = currentIndex >= 0 && currentIndex < allEpisodes.length - 1 ? allEpisodes[currentIndex + 1] : null;

    const { scenarioData, isLoading, error, missingPaths } = useStoryAsset({
        type: "unit",
        params: assetbundleName ? { assetbundleName, scenarioId: episodeId } : null,
        fallbackErrorMessage: t("common.state.loadingFailed"),
    });

    const logoUrl = profile ? getUnitOutlineLogoUrl(profile.unit, serverSource) : null;

    return (
        <MainLayout>
            <PageContainer>
                <StoryBackButton href={`/story/unit/${unitId}`}>{t("page.story.unit.backToChapters")}</StoryBackButton>

                <StoryReaderHeader
                    media={logoUrl && <img src={logoUrl} alt="" className="h-8 w-16 rounded-md3-xs bg-surface-container-high object-contain p-1" />}
                    eyebrow={profile?.unitName ?? t("page.story.unit.fallbackUnitName", { id: unitId })}
                    title={
                        <>
                            {currentEp && <span className="text-primary">{currentEp.episodeNoLabel} — </span>}
                            {currentEp?.title ?? episodeId}
                        </>
                    }
                    badges={<ServerSourceBadge serverSource={serverSource} />}
                />

                <StoryReader
                    scenarioData={scenarioData}
                    isLoading={isLoading || masterLoading}
                    error={error}
                    missingPaths={missingPaths ?? undefined}
                    endLabel={currentEp ? currentEp.episodeNoLabel : t("page.story.unit.currentEpisode")}
                    // the story library names a main story by its chapter's bundle and the episode's number
                    live2dSelector={assetbundleName && currentEp ? `unit:${assetbundleName}/${currentEp.episodeNo}` : undefined}
                />

                {!isLoading && !masterLoading && (
                    <StoryEpisodeNav
                        prev={prevEp ? { href: `/story/unit/${unitId}/${encodeURIComponent(prevEp.scenarioId)}`, title: prevEp.title } : null}
                        next={nextEp ? { href: `/story/unit/${unitId}/${encodeURIComponent(nextEp.scenarioId)}`, title: nextEp.title } : null}
                    />
                )}
            </PageContainer>
        </MainLayout>
    );
}
