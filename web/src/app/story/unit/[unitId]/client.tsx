"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button, Card, EmptyState, ErrorState, Icon, LoadingState, PageContainer, Surface } from "@/components/md3";
import { mdAcUnit, mdArrowBack, mdLock } from "@/components/md3/icons";
import MainLayout from "@/components/MainLayout";
import { fetchMasterData } from "@/lib/fetch";
import { getUnitStoryEpisodeImageUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { IUnitProfile } from "@/types/types";
import { useI18n } from "@/contexts/I18nContext";
import { useSimpleScrollRestore } from "@/hooks/useSimpleScrollRestore";

function getUnitOutlineLogoUrl(unitCode: string, server: string): string {
    const s = server === "cn" ? "cn" : "jp";
    return `/images/unit-logos/logo_${unitCode}_${s}.png`;
}

function getUnitEpisodeImageUrl(chapterAssetbundleName: string, episodeAssetbundleName: string, assetSource: import("@/contexts/ThemeContext").AssetSourceType): string {
    return getUnitStoryEpisodeImageUrl(chapterAssetbundleName, episodeAssetbundleName, assetSource);
}

interface IUnitStoryEpisodeGroup {
    id: number;
    unit: string;
    seq: number;
    name: string;
    outline: string;
    assetbundleName: string;
}
interface IUnitStoryChapterEpisode {
    episodeNo: number;
    episodeNoLabel: string;
    title: string;
    assetbundleName: string;
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

export default function StoryUnitDetailClient() {
    const params = useParams();
    const { serverSource, assetSource } = useTheme();
    const { t } = useI18n();
    const unitId = Number(params.unitId);

    const [profile, setProfile] = useState<IUnitProfile | null>(null);
    const [story, setStory] = useState<IUnitStory | null>(null);
    const [episodeGroups, setEpisodeGroups] = useState<IUnitStoryEpisodeGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Restore scroll position when navigating back from an episode reader page
    useSimpleScrollRestore(`story_unit_detail_${unitId}`, !isLoading);

    // Locked episodes state and unlock haptics/animations
    const [unlockedStories, setUnlockedStories] = useState<Record<string, boolean>>({});
    const [unlockingId, setUnlockingId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("moesekai_unlocked_stories");
            if (saved) {
                try {
                    setUnlockedStories(JSON.parse(saved));
                } catch (e) {
                    console.error("Failed to parse unlocked stories cache:", e);
                }
            }
        }
    }, []);

    const triggerUnlockEffect = (scenarioId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setUnlockingId(scenarioId);
        
        // Haptic feedback if supported
        if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([80, 50, 100]);
        }
        
        setTimeout(() => {
            const newUnlocked = { ...unlockedStories, [scenarioId]: true };
            setUnlockedStories(newUnlocked);
            localStorage.setItem("moesekai_unlocked_stories", JSON.stringify(newUnlocked));
            setUnlockingId(null);
        }, 850);
    };

    useEffect(() => {
        if (!unitId) return;
        async function load() {
            try {
                const [profiles, stories, groups] = await Promise.all([
                    fetchMasterData<IUnitProfile[]>("unitProfiles.json"),
                    fetchMasterData<IUnitStory[]>("unitStories.json"),
                    fetchMasterData<IUnitStoryEpisodeGroup[]>("unitStoryEpisodeGroups.json"),
                ]);
                const p = profiles.find(x => x.seq === unitId);
                if (!p) throw new Error(t("page.story.unit.unitNotFound"));
                const s = stories.find(x => x.seq === unitId);
                if (!s) throw new Error(t("page.story.unit.storyDataNotFound"));
                setProfile(p);
                setStory(s);
                setEpisodeGroups(groups.filter(g => g.unit === p.unit));
                document.title = t("page.story.unit.documentTitle", { name: p.unitName });
            } catch (err) {
                setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [unitId, serverSource, t]);

    if (isLoading) {
        return (
            <MainLayout>
                <LoadingState label={t("common.state.loading")} />
            </MainLayout>
        );
    }

    if (error || !profile || !story) {
        return (
            <MainLayout>
                <PageContainer>
                    {error ? (
                        <ErrorState title={t("common.state.loadingFailed")} message={error} retryLabel={t("common.action.retry")} />
                    ) : (
                        <EmptyState title={t("common.state.noData")} />
                    )}
                    <div className="mt-6 flex justify-center">
                        <Button variant="tonal" icon={mdArrowBack} href="/story/unit">
                            {t("page.story.unit.backToList")}
                        </Button>
                    </div>
                </PageContainer>
            </MainLayout>
        );
    }

    const episodes = story.chapters[0]?.episodes ?? [];
    const chapterAssetbundleName = story.chapters[0]?.assetbundleName ?? "";
    const logoUrl = getUnitOutlineLogoUrl(profile.unit, serverSource);

    // Group episodes by unitStoryEpisodeGroupId
    const groupMap = new Map<number, IUnitStoryEpisodeGroup>();
    episodeGroups.forEach(g => groupMap.set(g.id, g));

    // Build display groups: each unique episodeGroupId → episodes
    const displayGroups: { group: IUnitStoryEpisodeGroup | null; episodes: IUnitStoryChapterEpisode[] }[] = [];
    const seenGroups = new Set<number>();
    for (const ep of episodes) {
        const gid = ep.unitStoryEpisodeGroupId;
        if (!seenGroups.has(gid)) {
            seenGroups.add(gid);
            displayGroups.push({ group: groupMap.get(gid) ?? null, episodes: [] });
        }
        displayGroups[displayGroups.length - 1].episodes.push(ep);
    }

    return (
        <MainLayout>
            <PageContainer>
                <Button variant="text" icon={mdArrowBack} href="/story/unit" className="-ml-3 mb-4">
                    {t("page.story.unit.backToUnitList")}
                </Button>

                <Surface tone="card" className="mb-8 flex items-center gap-5 p-5">
                    <div className="flex h-12 w-24 shrink-0 items-center justify-center rounded-md3-md bg-surface-container-high p-1.5">
                        <img src={logoUrl} alt={profile.unitName} className="max-h-full max-w-full shrink-0 object-contain" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="type-headline-s text-on-surface sm:type-headline-m">{profile.unitName}</h1>
                        <p className="mt-1 type-body-m text-on-surface-variant">{t("page.story.unit.episodeCount", { count: episodes.length })}</p>
                    </div>
                </Surface>

                <div className="relative space-y-10">
                    {/* Vertical story tree backbone connector */}
                    <div className="pointer-events-none absolute bottom-4 left-6 top-4 hidden w-0.5 rounded-full bg-outline-variant md:block" />

                    {displayGroups.map(({ group, episodes: eps }, gi) => (
                        <div key={gi} className="relative md:pl-12">
                            {/* Chapter Node Marker */}
                            <div className="absolute left-4 top-2.5 z-10 hidden h-4 w-4 rounded-full border-4 border-primary bg-surface md:block" />

                            {group && (
                                <div className="mb-5">
                                    <h2 className="flex items-center gap-2 type-title-l text-on-surface">
                                        <span className="inline-block h-2 w-2 rounded-full bg-primary md:hidden" />
                                        {group.name}
                                    </h2>
                                    {group.outline && (
                                        <div className="mt-2.5 rounded-md3-lg bg-surface-card border border-outline-variant/70 p-4 type-body-m text-on-surface-variant">
                                            {group.outline}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                                {eps.map(ep => {
                                    const isLocked = ep.releaseConditionId > 1 && !unlockedStories[ep.scenarioId];
                                    const isUnlocking = unlockingId === ep.scenarioId;

                                    const CardContent = (
                                        <div className="relative flex h-full flex-col">
                                            {/* Locked Shield Overlay */}
                                            {isLocked && (
                                                <div
                                                    onClick={(e) => triggerUnlockEffect(ep.scenarioId, e)}
                                                    className="state-layer group/lock absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-surface-container-highest/90 p-3 text-center text-on-surface"
                                                >
                                                    {/* Unlock animation layer */}
                                                    {isUnlocking && (
                                                        <div className="absolute inset-0 z-30 flex animate-pulse flex-col items-center justify-center bg-primary-container text-on-primary-container">
                                                            <Icon path={mdAcUnit} size={48} className="animate-spin motion-reduce:animate-none" />
                                                            <span className="mt-2 type-label-m">{t("page.story.reader.unlocking")}</span>
                                                        </div>
                                                    )}

                                                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-tertiary-container text-on-tertiary-container">
                                                        <Icon path={mdLock} size={22} />
                                                    </div>
                                                    <span className="mt-2 type-label-m text-on-surface-variant">{t("page.story.reader.lockedEpisode")}</span>
                                                    <span className="mt-1 type-label-s text-tertiary opacity-0 transition-opacity duration-300 group-hover/lock:opacity-100">
                                                        {t("page.story.reader.clickToUnlock")}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="p-2.5 pb-0">
                                                <div className="relative aspect-video overflow-hidden rounded-md3-sm bg-surface-container-high">
                                                    <img
                                                        src={getUnitEpisodeImageUrl(chapterAssetbundleName, ep.assetbundleName, assetSource)}
                                                        alt={ep.title}
                                                        className="h-full w-full object-cover"
                                                        loading="lazy"
                                                    />
                                                    <div className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-container-highest/90 px-1 type-label-s text-on-surface">
                                                        {ep.episodeNo}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-1 flex-col justify-between p-2.5 pt-2">
                                                <div>
                                                    <span className="type-label-s text-primary">{ep.episodeNoLabel}</span>
                                                    <p className="mt-0.5 line-clamp-2 type-title-s text-on-surface transition-colors group-hover:text-primary">
                                                        {ep.title}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );

                                    return isLocked ? (
                                        <Card key={ep.scenarioId} variant="filled" className="h-full">
                                            {CardContent}
                                        </Card>
                                    ) : (
                                        <Card
                                            key={ep.scenarioId}
                                            href={`/story/unit/${unitId}/${encodeURIComponent(ep.scenarioId)}`}
                                            variant="filled"
                                            className="group h-full"
                                        >
                                            {CardContent}
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </PageContainer>
        </MainLayout>
    );
}
