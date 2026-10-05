"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import MainLayout from "@/components/MainLayout";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import {
    IlimitedTimeMusicsInfo,
    IMusicInfo,
    IMusicCategoryInfo,
    IMusicTagInfo,
    IMusicDifficultyInfo,
    IMusicVocalInfo,
    IOutsideCharacter,
    MusicDifficultyType,
    getMusicJacketUrl,
    getMusicVocalAudioUrl,
    MUSIC_CATEGORY_COLORS,
    DIFFICULTY_NAMES,
    DIFFICULTY_COLORS,
    MusicCategoryType,
    normalizeMusicItem,
    buildMusicCategoriesMap,
} from "@/types/music";
import { getCharacterName } from "@/lib/i18n";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import { getCharacterIconUrl, getEventBannerUrl, MOE_RANKINGS_URL } from "@/lib/assets";
import { getOutsideCharacterAvatarUrl } from "@/lib/lyrics-performers";
import { fetchMasterData, fetchMusicMetas } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import { fetchSongConstants, buildSongConstantsMap } from "@/lib/songConstants";
import { getPublishedLyricsIndexEntry, hasLyricsDetail } from "@/lib/lyrics";
import { LYRICS_ENTRY_VISIBLE } from "@/lib/lyrics-visibility";
import { fetchMusicBpmMap, getMusicBpm, formatBpmValue, formatBarValue, MusicBpmEntry } from "@/lib/musicBpm";
import { fetchMusicAliases, getMusicAliases } from "@/lib/musicAliases";
import ImagePreviewModal from "@/components/common/ImagePreviewModal";
import { useI18n } from "@/contexts/I18nContext";
import { Button, EmptyState, Icon, LoadingState, PageContainer } from "@/components/md3";
import { mdArrowBack, mdBarChart, mdCalendarMonth, mdDownload, mdInfo, mdKeyboardArrowDown, mdLibraryMusic, mdMic, mdOpenInNew, mdPause, mdPlayArrow, mdPlayCircle, mdSchedule, mdZoomIn } from "@/components/md3/icons";

// Difficulty order for tabs
const DIFFICULTY_ORDER: MusicDifficultyType[] = ["easy", "normal", "hard", "expert", "master", "append"];

// External data URLs
const RANKINGS_API = MOE_RANKINGS_URL;

// Rankings raw data structure  
interface RankingItem {
    rank: number;
    music_id: number;
    difficulty: string;
    value: number;
    pspi?: number;
}

interface RankingsRawData {
    total_songs: number;
    rankings: {
        [key: string]: RankingItem[];
    };
}

interface EventLite {
    id: number;
    name: string;
    assetbundleName: string;
}

interface EventMusicLink {
    eventId: number;
    musicId: number;
}

// Ranking category definitions
type RankingCategoryKey =
    | "pt_per_hour_multi" | "pt_per_hour_auto"
    | "multi_pt_max" | "solo_pt_max" | "auto_pt_max"
    | "multi_score" | "solo_score" | "auto_score";

const RANKING_CATEGORIES: { key: RankingCategoryKey; label: string; shortLabel: string; group: string }[] = [
    { key: "pt_per_hour_multi", label: "rankingCategories.ptPerHourMulti.label", shortLabel: "rankingCategories.ptPerHourMulti.shortLabel", group: "rankingCategories.groups.ptPerHour" },
    { key: "pt_per_hour_auto", label: "rankingCategories.ptPerHourAuto.label", shortLabel: "rankingCategories.ptPerHourAuto.shortLabel", group: "rankingCategories.groups.ptPerHour" },
    { key: "multi_pt_max", label: "rankingCategories.multiPtMax.label", shortLabel: "rankingCategories.multiPtMax.shortLabel", group: "rankingCategories.groups.ptMax" },
    { key: "solo_pt_max", label: "rankingCategories.soloPtMax.label", shortLabel: "rankingCategories.soloPtMax.shortLabel", group: "rankingCategories.groups.ptMax" },
    { key: "auto_pt_max", label: "rankingCategories.autoPtMax.label", shortLabel: "rankingCategories.autoPtMax.shortLabel", group: "rankingCategories.groups.ptMax" },
    { key: "multi_score", label: "rankingCategories.multiScore.label", shortLabel: "rankingCategories.multiScore.shortLabel", group: "rankingCategories.groups.score" },
    { key: "solo_score", label: "rankingCategories.soloScore.label", shortLabel: "rankingCategories.soloScore.shortLabel", group: "rankingCategories.groups.score" },
    { key: "auto_score", label: "rankingCategories.autoScore.label", shortLabel: "rankingCategories.autoScore.shortLabel", group: "rankingCategories.groups.score" },
];

// Ranking info per category
interface MusicRankings {
    total: number;
    categories: Record<string, { rank: number; difficulty: string; value: number; pspi?: number } | null>;
    bestCategory: RankingCategoryKey | null;
}



export default function MusicDetailPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const { assetSource } = useTheme();
    const { setDetailName } = useBreadcrumb();
    const { t, formatDate, formatNumber } = useI18n();
    const musicId = Number(params.id);
    const isScreenshotMode = searchParams.get('mode') === 'screenshot';

    const [music, setMusic] = useState<IMusicInfo | null>(null);
    const [musicTags, setMusicTags] = useState<IMusicTagInfo[]>([]);
    const [difficulties, setDifficulties] = useState<IMusicDifficultyInfo[]>([]);
    const [vocals, setVocals] = useState<IMusicVocalInfo[]>([]);
    const [relatedEvents, setRelatedEvents] = useState<EventLite[]>([]);
    const [limitedTimeMusics, setLimitedTimeMusics] = useState<IlimitedTimeMusicsInfo[]>([]);
    const [outsideCharacters, setOutsideCharacters] = useState<Record<number, string>>({});
    const [hasPublishedLyrics, setHasPublishedLyrics] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    // Duration and ranking states
    const [musicDuration, setMusicDuration] = useState<number | null>(null);
    const [rankings, setRankings] = useState<MusicRankings | null>(null);
    const [selectedRankingCategory, setSelectedRankingCategory] = useState<RankingCategoryKey>("pt_per_hour_multi");

    // BPM states
    const [bpmEntry, setBpmEntry] = useState<MusicBpmEntry | null>(null);
    const [bpmListOpen, setBpmListOpen] = useState(false);

    // Alias states
    const [aliases, setAliases] = useState<string[]>([]);
    const [aliasesOpen, setAliasesOpen] = useState(false);

    // View states
    const [selectedDifficulty, setSelectedDifficulty] = useState<MusicDifficultyType>("master");
    const [imageViewerOpen, setImageViewerOpen] = useState(false);
    const [songConstantsMap, setSongConstantsMap] = useState<Record<number, Record<string, number>>>({});

    // Set mounted state
    useEffect(() => {
        setMounted(true);
    }, []);

    // Set breadcrumb detail name
    useEffect(() => {
        if (music) setDetailName(music.title);
    }, [music, setDetailName]);

    // Lyrics availability is optional and must never block the music detail page.
    useEffect(() => {
        setHasPublishedLyrics(false);
        if (!LYRICS_ENTRY_VISIBLE) return;

        const controller = new AbortController();
        let active = true;

        getPublishedLyricsIndexEntry(musicId, controller.signal)
            .then((entry) => {
                if (active) setHasPublishedLyrics(entry !== null && hasLyricsDetail(entry));
            })
            .catch(() => {
                if (active) setHasPublishedLyrics(false);
            });

        return () => {
            active = false;
            controller.abort();
        };
    }, [musicId]);

    // Fetch data
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const [musicsData, categoriesData, tagsData, diffisData, vocalsData, eventsData, eventMusicsData, limitedTimeMusicsData, outsideCharsData] = await Promise.all([
                    fetchMasterData<IMusicInfo[]>("musics.json"),
                    fetchMasterData<IMusicCategoryInfo[]>("musicCategories.json").catch(() => [] as IMusicCategoryInfo[]),
                    fetchMasterData<IMusicTagInfo[]>("musicTags.json"),
                    fetchMasterData<IMusicDifficultyInfo[]>("musicDifficulties.json"),
                    fetchMasterData<IMusicVocalInfo[]>("musicVocals.json"),
                    fetchMasterData<EventLite[]>("events.json"),
                    fetchMasterData<EventMusicLink[]>("eventMusics.json"),
                    fetchMasterData<IlimitedTimeMusicsInfo[]>("limitedTimeMusics.json"),
                    fetchMasterData<IOutsideCharacter[]>("outsideCharacters.json").catch(() => [] as IOutsideCharacter[]),
                ]);

                const foundMusic = musicsData.find(m => m.id === musicId);
                if (!foundMusic) {
                    throw new Error(`Music ${musicId} not found`);
                }

                const categoriesMap = buildMusicCategoriesMap(categoriesData);
                const normalizedMusic = normalizeMusicItem(foundMusic, categoriesMap);

                setMusic(normalizedMusic);
                document.title = `Moesekai - ${normalizedMusic.title}`;
                setMusicTags(tagsData.filter(t => t.musicId === musicId));
                setDifficulties(diffisData.filter(d => d.musicId === musicId).sort((a, b) => {
                    return DIFFICULTY_ORDER.indexOf(a.musicDifficulty) - DIFFICULTY_ORDER.indexOf(b.musicDifficulty);
                }));
                setVocals(vocalsData.filter(v => v.musicId === musicId));
                setLimitedTimeMusics(limitedTimeMusicsData);

                // Build outside character name map
                const outsideCharMap: Record<number, string> = {};
                for (const oc of outsideCharsData) {
                    outsideCharMap[oc.id] = oc.name;
                }
                setOutsideCharacters(outsideCharMap);

                // Process related events using client-side data
                const musicEvents = eventMusicsData.filter(em => em.musicId === musicId);
                const relatedEventIds = new Set(musicEvents.map(em => em.eventId));
                const related = eventsData.filter(e => relatedEventIds.has(e.id));
                // Sort by event id (newest first usually, or old to new)
                related.sort((a, b) => b.id - a.id);
                setRelatedEvents(related);

                setError(null);

                // Set default difficulty to master if available
                const availableDiffs = diffisData.filter(d => d.musicId === musicId);
                if (availableDiffs.length > 0) {
                    const masterDiff = availableDiffs.find(d => d.musicDifficulty === "master");
                    setSelectedDifficulty(masterDiff?.musicDifficulty || "expert");
                }
            } catch (err) {
                console.error("Error fetching music:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        if (Number.isFinite(musicId)) {
            fetchData();

            // Fetch optional meta and rankings data (don't block main content)
            async function fetchMetaData() {
                try {
                    const metaData = await fetchMusicMetas();
                    const thisMusicMeta = metaData.find(m => m.music_id === musicId);
                    if (thisMusicMeta) {
                        setMusicDuration(thisMusicMeta.music_time);
                    }
                } catch (err) {
                    console.warn("Failed to fetch music duration:", err);
                }

                try {
                    const rankingsRes = await fetch(RANKINGS_API);
                    if (rankingsRes.ok) {
                        const rankingsData: RankingsRawData = await rankingsRes.json();

                        // Collect rankings for all categories
                        const categories: Record<string, { rank: number; difficulty: string; value: number; pspi: number } | null> = {};
                        let bestRank = Infinity;
                        let bestCategory: RankingCategoryKey | null = null;

                        for (const cat of RANKING_CATEGORIES) {
                            const categoryRankings = rankingsData.rankings[cat.key];
                            if (categoryRankings) {
                                const thisRanking = categoryRankings.find(item => item.music_id === musicId);
                                if (thisRanking) {
                                    categories[cat.key] = {
                                        rank: thisRanking.rank,
                                        difficulty: thisRanking.difficulty,
                                        value: thisRanking.value,
                                        pspi: thisRanking.pspi ?? 0,
                                    };
                                    // Track best (lowest) rank
                                    if (thisRanking.rank < bestRank) {
                                        bestRank = thisRanking.rank;
                                        bestCategory = cat.key;
                                    }
                                } else {
                                    categories[cat.key] = null;
                                }
                            }
                        }

                        setRankings({
                            total: rankingsData.total_songs,
                            categories,
                            bestCategory,
                        });

                        // Default to best category if available
                        if (bestCategory) {
                            setSelectedRankingCategory(bestCategory);
                        }
                    }
                } catch (err) {
                    console.warn("Failed to fetch ranking:", err);
                }

                try {
                    const bpmMap = await fetchMusicBpmMap();
                    const entry = getMusicBpm(musicId, bpmMap);
                    if (entry && entry.bpm != null) {
                        setBpmEntry(entry);
                        // Only offer the expandable list when the song actually has BPM changes
                        setBpmListOpen(false);
                    }
                } catch (err) {
                    console.warn("Failed to fetch music BPM:", err);
                }

                try {
                    const aliasesMap = await fetchMusicAliases();
                    setAliases(getMusicAliases(musicId, aliasesMap));
                    setAliasesOpen(false);
                } catch (err) {
                    console.warn("Failed to load music aliases:", err);
                }
            }

            fetchMetaData();

            // Fetch song constants (non-blocking)
            fetchSongConstants().then(entries => {
                setSongConstantsMap(buildSongConstantsMap(entries));
            }).catch(err => {
                console.warn("Failed to load song constants:", err);
            });
        } else {
            setIsLoading(false);
        }
    }, [musicId]);

    // Selected difficulty info
    const selectedDifficultyInfo = useMemo(() => {
        return difficulties.find(d => d.musicDifficulty === selectedDifficulty);
    }, [difficulties, selectedDifficulty]);

    // Get tag names for this music
    const tagNames = useMemo(() => {
        return musicTags.map((tagInfo) => {
            const key = `common.musicTags.${tagInfo.musicTag}`;
            const label = t(key);
            return label === key ? tagInfo.musicTag : label;
        });
    }, [musicTags, t]);

    // Create set of limited time music IDs
    const limitedMusicIds = useMemo(() => {
        return new Set(limitedTimeMusics.map(item => item.musicId));
    }, [limitedTimeMusics]);

    // Check if current music is limited time
    const isLimitedMusic = useMemo(() => {
        return music ? limitedMusicIds.has(music.id) : false;
    }, [music, limitedMusicIds]);

    if (isLoading) {
        return (
            <MainLayout>
                <PageContainer>
                    <LoadingState label={t("common.state.loading")} />
                </PageContainer>
            </MainLayout>
        );
    }

    if (error || !music) {
        return (
            <MainLayout>
                <PageContainer>
                    <EmptyState
                        icon={mdSchedule}
                        title={t("page.music.notFoundTitle", { id: musicId })}
                        description={t("page.music.notFoundDesc")}
                        action={
                            <Button variant="filled" icon={mdArrowBack} href="/music">
                                {t("page.music.backToList")}
                            </Button>
                        }
                    />
                </PageContainer>
            </MainLayout>
        );
    }

    const jacketUrl = getMusicJacketUrl(music.assetbundleName, assetSource);
    const releaseConditionMap: Record<number, string> = {
        1: t("page.music.releaseConditions.initial"),
        5: t("page.music.releaseConditions.musicShop"),
        6: t("page.music.releaseConditions.none"),
        10: t("page.music.releaseConditions.gift"),
    };
    const releaseCondition = releaseConditionMap[music.releaseConditionId] ?? String(music.releaseConditionId);
    const releaseConditionText = isLimitedMusic
        ? t("page.music.releaseConditionLimited", { condition: releaseCondition })
        : releaseCondition;

    return (
        <MainLayout>
            <ImagePreviewModal
                isOpen={imageViewerOpen}
                onClose={() => setImageViewerOpen(false)}
                title={t("page.music.jacketPreviewTitle", { title: music.title })}
                imageUrl={jacketUrl}
                alt={music.title}
                fileName={`music_${music.id}_jacket.png`}
            />

            <PageContainer>
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-high rounded-md3-sm type-label-m font-mono text-on-surface-variant w-fit">
                            ID: {music.id}
                        </span>
                        {/* Category Tags */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {Array.from(new Set(music.categories ?? [])).map((cat) => {
                                const categoryKey = `common.musicCategories.${cat}`;
                                const categoryLabel = t(categoryKey);

                                return (
                                    <span
                                        key={cat}
                                        className="px-2 py-0.5 type-label-m rounded-md3-xs text-white"
                                        style={{ backgroundColor: MUSIC_CATEGORY_COLORS[cat as MusicCategoryType] }}
                                    >
                                        {categoryLabel === categoryKey ? cat : categoryLabel}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                    <div className="mb-2">
                        <div className="inline-flex max-w-full flex-wrap items-start gap-2">
                            <h1 className="min-w-0 type-headline-m text-on-surface sm:type-headline-l">
                                <TranslatedText
                                    original={music.title}
                                    category="music"
                                    field="title"
                                    originalClassName=""
                                    translationClassName="block type-title-l text-on-surface-variant mt-1"
                                />
                            </h1>
                            {aliases.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setAliasesOpen(v => !v)}
                                    className={`state-layer focus-ring inline-flex h-7 items-center gap-0.5 whitespace-nowrap rounded-md3-sm border pl-2 pr-1 type-label-m transition-colors ${aliasesOpen ? "border-transparent bg-secondary-container text-on-secondary-container" : "border-outline-variant text-on-surface-variant"}`}
                                    aria-expanded={aliasesOpen}
                                    title={t("page.music.aliasesToggle")}
                                >
                                    {t("page.music.aliasesLabel")}
                                    <Icon path={mdKeyboardArrowDown} size={18} className={`transition-transform duration-200 ${aliasesOpen ? "rotate-180" : ""}`} />
                                </button>
                            )}
                            {LYRICS_ENTRY_VISIBLE && hasPublishedLyrics && (
                                <Link
                                    href={`/lyrics/${music.id}`}
                                    className="state-layer focus-ring inline-flex h-7 items-center gap-0.5 whitespace-nowrap rounded-md3-sm bg-tertiary-container pl-2 pr-1.5 type-label-m text-on-tertiary-container"
                                >
                                    {t("page.music.goToLyrics")}
                                    <Icon path={mdOpenInNew} size={16} />
                                </Link>
                            )}
                        </div>
                        {aliasesOpen && aliases.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {aliases.map((alias, i) => (
                                    <span
                                        key={`${alias}-${i}`}
                                        className="max-w-full break-words rounded-md3-sm bg-surface-container-high px-2.5 py-1 type-label-l text-on-surface-variant"
                                    >
                                        {alias}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="type-title-m text-on-surface-variant">{music.composer}</span>
                        {tagNames.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                                {tagNames.map((tag, i) => (
                                    <span key={i} className="type-label-m px-2 py-0.5 bg-secondary-container text-on-secondary-container rounded-md3-sm">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Grid - 2 Column Layout like Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column: Jacket Image */}
                    <div className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto custom-scrollbar">
                        <div className="rounded-md3-xl bg-surface-container-low overflow-hidden">
                            {/* Jacket Image */}
                            <div
                                className="relative aspect-square bg-surface-container cursor-zoom-in"
                                onClick={() => setImageViewerOpen(true)}
                            >
                                <Image
                                    src={jacketUrl}
                                    alt={music.title}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                    priority
                                />
                                <div className="absolute bottom-3 right-3 bg-inverse-surface/80 text-inverse-on-surface type-label-m px-2 py-1 rounded-md3-sm flex items-center gap-1">
                                    <Icon path={mdZoomIn} size={16} />
                                    {t("page.music.clickExpand")}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Info Cards */}
                    <div className="space-y-6">
                        {/* Basic Info Card */}
                        <div className="rounded-md3-xl bg-surface-container-low overflow-hidden">
                            <SectionTitle icon={mdInfo}>{t("page.music.basicInfo")}</SectionTitle>
                            <div className="divide-y divide-outline-variant">
                                <InfoRow label="ID" value={`#${music.id}`} />
                                <InfoRow
                                    label={t("page.music.fields.title")}
                                    value={
                                        <TranslatedText
                                            original={music.title}
                                            category="music"
                                            field="title"
                                            originalClassName=""
                                            translationClassName="block type-body-s text-on-surface-variant mt-0.5"
                                        />
                                    }
                                />
                                <InfoRow label={t("page.music.fields.composer")} value={music.composer} />
                                <InfoRow label={t("page.music.fields.arranger")} value={music.arranger} />
                                <InfoRow label={t("page.music.fields.lyricist")} value={music.lyricist} />
                                {/* Duration */}
                                {musicDuration != null && (
                                    <InfoRow
                                        label={t("page.music.fields.duration")}
                                        value={`${Math.floor(musicDuration / 60)}:${Math.floor(musicDuration % 60).toString().padStart(2, "0")}`}
                                    />
                                )}
                                {/* BPM */}
                                {bpmEntry && bpmEntry.bpm != null && (
                                    <>
                                        <InfoRow
                                            label={t("page.music.fields.bpm")}
                                            value={
                                                (bpmEntry.bpm_segments?.length ?? 0) > 1 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setBpmListOpen(v => !v)}
                                                        className="state-layer focus-ring inline-flex items-center gap-1 rounded-full px-2 -mr-2 text-on-surface hover:text-primary transition-colors"
                                                        aria-expanded={bpmListOpen}
                                                        title={t("page.music.bpmListToggle")}
                                                    >
                                                        {formatBpmValue(bpmEntry.bpm)}
                                                        <Icon path={mdKeyboardArrowDown} size={18} className={`transition-transform duration-200 ${bpmListOpen ? "rotate-180" : ""}`} />
                                                    </button>
                                                ) : (
                                                    formatBpmValue(bpmEntry.bpm)
                                                )
                                            }
                                        />
                                        {bpmListOpen && (bpmEntry.bpm_segments?.length ?? 0) > 1 && (
                                            <div className="px-5 py-3 border-t border-outline-variant">
                                                <div className="bg-surface-container rounded-md3-md px-3 py-1 max-h-56 overflow-y-auto custom-scrollbar">
                                                    {bpmEntry.bpm_segments?.map((segment, index) => (
                                                        <div
                                                            key={index}
                                                            className="flex items-center justify-between py-1.5 type-body-s border-b border-outline-variant last:border-0"
                                                        >
                                                            <span className="font-mono font-bold text-on-surface">
                                                                {formatBpmValue(segment.bpm)}
                                                            </span>
                                                            <span className="font-mono text-on-surface-variant">
                                                                {formatBarValue(segment.start_bar)} → {formatBarValue(segment.end_bar)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                <InfoRow
                                    label={t("page.music.fields.publishedAt")}
                                    value={mounted && music.publishedAt
                                        ? formatDate(music.publishedAt, {
                                            year: "numeric",
                                            month: "long",
                                            day: "numeric",
                                        })
                                        : "..."}
                                />
                                <InfoRow
                                    label={t("page.music.fields.releaseCondition")}
                                    value={releaseConditionText}
                                />
                                <InfoRow
                                    label={t("page.music.fields.assetName")}
                                    value={<span className="font-mono type-body-s bg-surface-container-high px-2 py-0.5 rounded-md3-xs">{music.assetbundleName}</span>}
                                />
                            </div>
                        </div>

                        {/* Ranking Card */}
                        {rankings && (
                            <div className="rounded-md3-xl bg-surface-container-low overflow-hidden">
                                <SectionTitle icon={mdBarChart}>{t("page.music.metaRanking")}</SectionTitle>

                                {/* Category Tabs */}
                                <div className="px-4 py-2 border-b border-outline-variant flex flex-wrap gap-2">
                                    {RANKING_CATEGORIES.map((cat) => {
                                        const catRanking = rankings.categories[cat.key];
                                        const isSelected = selectedRankingCategory === cat.key;
                                        return (
                                            <button
                                                key={cat.key}
                                                onClick={() => setSelectedRankingCategory(cat.key)}
                                                className={`state-layer focus-ring h-8 px-3 rounded-md3-sm type-label-l border transition-colors ${isSelected
                                                    ? "border-transparent bg-secondary-container text-on-secondary-container"
                                                    : catRanking
                                                        ? "border-outline-variant text-on-surface-variant"
                                                        : "border-outline-variant text-on-surface-variant opacity-38 cursor-not-allowed"
                                                    }`}
                                                disabled={!catRanking}
                                            >
                                                {t(`page.music.${cat.shortLabel}`)}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Compact Horizontal Rank Display */}
                                {rankings.categories[selectedRankingCategory] && (
                                    <div className="p-4 flex items-center justify-between">
                                        {/* Left: PSPI */}
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <div className="type-label-m text-on-surface-variant mb-0.5">PSPI</div>
                                                <div className="type-headline-s type-emphasized text-primary">
                                                    {(rankings.categories[selectedRankingCategory]!.pspi ?? 0).toFixed(1)}
                                                </div>
                                            </div>
                                            <span className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant type-label-m rounded-md3-xs uppercase font-mono">
                                                {rankings.categories[selectedRankingCategory]!.difficulty}
                                            </span>
                                        </div>

                                        {/* Right: Rank */}
                                        <div className="text-right">
                                            <span className="type-display-s type-emphasized text-primary">
                                                #{rankings.categories[selectedRankingCategory]!.rank}
                                            </span>
                                            <span className="text-on-surface-variant type-body-m ml-1">/{rankings.total}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Difficulty Card */}
                        <div className="rounded-md3-xl bg-surface-container-low overflow-hidden">
                            <SectionTitle icon={mdLibraryMusic}>{t("page.music.difficultyInfo")}</SectionTitle>

                            {/* Difficulty Grid */}
                            <div className={`p-4 grid gap-2 ${difficulties.length > 5 ? "grid-cols-6" : "grid-cols-5"}`}>
                                {difficulties.map((diff) => (
                                    <button
                                        key={diff.musicDifficulty}
                                        className={`state-layer focus-ring flex flex-col items-center p-2 rounded-md3-md transition-colors ${selectedDifficulty === diff.musicDifficulty
                                            ? "ring-2 bg-surface-container-lowest"
                                            : "border border-transparent"
                                            }`}
                                        style={
                                            selectedDifficulty === diff.musicDifficulty
                                                ? {
                                                    borderColor: DIFFICULTY_COLORS[diff.musicDifficulty],
                                                    boxShadow: `0 0 0 2px ${DIFFICULTY_COLORS[diff.musicDifficulty]}`
                                                }
                                                : {}
                                        }
                                        onClick={() => setSelectedDifficulty(diff.musicDifficulty)}
                                    >
                                        <span
                                            className="text-[10px] font-bold uppercase"
                                            style={{ color: DIFFICULTY_COLORS[diff.musicDifficulty] }}
                                        >
                                            {DIFFICULTY_NAMES[diff.musicDifficulty]?.slice(0, 3) ?? diff.musicDifficulty}
                                        </span>
                                        <span
                                            className="text-lg font-black"
                                            style={{ color: DIFFICULTY_COLORS[diff.musicDifficulty] }}
                                        >
                                            {diff.playLevel}
                                        </span>
                                        {songConstantsMap[musicId]?.[diff.musicDifficulty] !== undefined && (
                                            <span className="text-[9px] font-bold text-on-surface-variant -mt-0.5">
                                                {songConstantsMap[musicId][diff.musicDifficulty].toFixed(1)}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Selected Difficulty Details */}
                            {selectedDifficultyInfo && (
                                <div className="px-5 pb-4">
                                    <div className="flex items-center justify-between py-2 border-t border-outline-variant">
                                        <span className="type-body-m text-on-surface-variant">{t("page.music.fields.noteCount")}</span>
                                        <span className="type-title-s text-on-surface">
                                            {formatNumber(selectedDifficultyInfo.totalNoteCount)}
                                        </span>
                                    </div>
                                    {songConstantsMap[musicId]?.[selectedDifficulty] !== undefined && (
                                        <div className="flex items-center justify-between py-2 border-t border-outline-variant">
                                            <span className="type-body-m text-on-surface-variant">{t("page.music.fields.constant")}</span>
                                            <span className="type-title-s type-emphasized text-primary">
                                                {songConstantsMap[musicId][selectedDifficulty].toFixed(1)}
                                            </span>
                                        </div>
                                    )}
                                    {songConstantsMap[musicId] && Object.keys(songConstantsMap[musicId]).length > 0 && (
                                        <div className="pt-1 pb-0.5 type-label-s text-on-surface-variant text-center">
                                            {t("page.music.communityConstantNote")}
                                        </div>
                                    )}

                                    <Link
                                        href={`/chart-image?musicId=${musicId}&difficulty=${selectedDifficulty}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="state-layer focus-ring mt-2 flex items-center justify-center gap-2 w-full h-12 rounded-full text-white type-label-l shadow-elev-1 hover:shadow-elev-2 transition-shadow"
                                        style={{ backgroundColor: DIFFICULTY_COLORS[selectedDifficulty] }}
                                    >
                                        <Icon path={mdOpenInNew} size={20} />
                                        {t("page.music.openChartImagePreview", { difficulty: DIFFICULTY_NAMES[selectedDifficulty] })}
                                    </Link>
                                    <Link
                                        href={`/chart-preview?musicId=${musicId}&difficulty=${selectedDifficulty}&preview=true&from=/music/${musicId}`}
                                        className="state-layer focus-ring flex items-center justify-center gap-2 w-full h-12 rounded-full type-label-l border-2 transition-colors mt-2"
                                        style={{ borderColor: DIFFICULTY_COLORS[selectedDifficulty], color: DIFFICULTY_COLORS[selectedDifficulty] }}
                                    >
                                        <Icon path={mdPlayCircle} size={20} />
                                        {t("page.music.open3dChartPreview")}
                                    </Link>
                                </div>
                            )}
                        </div>

                        {/* Vocals Card */}
                        {vocals.length > 0 && (
                            <div className="rounded-md3-xl bg-surface-container-low overflow-hidden">
                                <SectionTitle icon={mdMic}>{t("page.music.vocalVersions", { seconds: Math.round((music.fillerSec || 0) * 10) / 10 })}</SectionTitle>
                                <div className="divide-y divide-outline-variant max-h-96 overflow-y-auto">
                                    {vocals.map((vocal) => (
                                        <VocalPlayer
                                            key={vocal.id}
                                            vocal={vocal}
                                            fillerSec={music.fillerSec}
                                            assetSource={assetSource}
                                            outsideCharacters={outsideCharacters}
                                            downloadLabel={t("page.music.downloadAudio")}
                                            getCharacterLabel={(characterId) => getCharacterName(t, characterId)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Related Events Card */}
                        {relatedEvents.length > 0 && (
                            <div className="rounded-md3-xl bg-surface-container-low overflow-hidden">
                                <SectionTitle icon={mdCalendarMonth}>{t("page.music.relatedEvents")}</SectionTitle>
                                <div className="p-4 pt-2 space-y-3">
                                    {relatedEvents.map((event) => (
                                        <Link key={event.id} href={`/events/${event.id}`} className="focus-ring block group rounded-md3-lg overflow-hidden relative">
                                            <div className="relative aspect-[2/1] w-full">
                                                <Image
                                                    src={getEventBannerUrl(event.assetbundleName, assetSource)}
                                                    alt={event.name}
                                                    fill
                                                    className="object-cover"
                                                    unoptimized
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-scrim/80 via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />
                                                <div className="absolute bottom-0 left-0 w-full p-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-mono bg-scrim/40 text-white px-2 py-0.5 rounded-md3-xs">
                                                            Event #{event.id}
                                                        </span>
                                                    </div>
                                                    <h3 className="text-white type-title-l leading-tight truncate">
                                                        <TranslatedText
                                                            original={event.name}
                                                            category="events"
                                                            field="name"
                                                            originalClassName="truncate block"
                                                            translationClassName="text-sm font-medium text-white/90 truncate block mt-0.5"
                                                        />
                                                    </h3>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        <DetailPageAdCard hidden={isScreenshotMode} />
                    </div>
                </div>

                {/* Back Button */}
                <div className="mt-12 text-center">
                    <Button variant="tonal" icon={mdArrowBack} href="/music">
                        {t("page.music.backToList")}
                    </Button>
                </div>
            </PageContainer>
        </MainLayout>
    );
}

// Section heading used by the detail cards
function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-14 items-center gap-3 px-5 pt-4 pb-2">
            <Icon path={icon} size={24} className="text-primary" />
            <h2 className="min-w-0 flex-1 truncate type-title-l text-on-surface">{children}</h2>
        </div>
    );
}

// Vocal Player Component
function VocalPlayer({
    vocal,
    fillerSec,
    assetSource,
    outsideCharacters,
    downloadLabel,
    getCharacterLabel,
}: {
    vocal: IMusicVocalInfo;
    fillerSec: number;
    assetSource: AssetSourceType;
    outsideCharacters: Record<number, string>;
    downloadLabel: string;
    getCharacterLabel: (characterId: number) => string;
}) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrl = getMusicVocalAudioUrl(vocal.assetbundleName, assetSource);

    const togglePlay = () => {
        if (!audioRef.current) {
            audioRef.current = new Audio(audioUrl);
            audioRef.current.onended = () => setIsPlaying(false);
            audioRef.current.onplay = () => setIsPlaying(true);
            audioRef.current.onpause = () => setIsPlaying(false);
            audioRef.current.onloadedmetadata = () => {
                if (audioRef.current) setDuration(audioRef.current.duration);
            };
            audioRef.current.ontimeupdate = () => {
                if (audioRef.current) {
                    setProgress(audioRef.current.currentTime);
                }
            };

            // Initial offset skip
            if (fillerSec > 0) {
                audioRef.current.currentTime = fillerSec;
            }
        }

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(console.error);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        setProgress(time);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
        }
    };

    // Format time (mm:ss)
    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    return (
        <div className="px-5 py-4 transition-colors group">
            <div className="flex items-center gap-4">
                {/* Play Button */}
                <button
                    type="button"
                    onClick={togglePlay}
                    aria-pressed={isPlaying}
                    className={`state-layer focus-ring shrink-0 w-12 h-12 flex items-center justify-center transition-[border-radius,background-color] duration-200 ease-md3-spatial-fast ${isPlaying
                        ? "bg-primary-container text-on-primary-container rounded-md3-lg"
                        : "bg-primary text-on-primary rounded-full shadow-elev-1"
                        }`}
                >
                    <Icon path={isPlaying ? mdPause : mdPlayArrow} size={24} />
                </button>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="type-title-s text-on-surface truncate">
                            <TranslatedText
                                original={vocal.caption}
                                category="music"
                                field="vocalCaption"
                                originalClassName="truncate block"
                                translationClassName="type-body-s text-on-surface-variant truncate block"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Download Button */}
                            <a
                                href={audioUrl}
                                download={`${vocal.caption}.mp3`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="state-layer focus-ring flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant"
                                title={downloadLabel}
                                aria-label={downloadLabel}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Icon path={mdDownload} size={20} />
                            </a>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-2">
                        {vocal.characters?.map((chara) => {
                            const isGameChar = chara.characterType === "game_character";
                            const charName = isGameChar
                                ? getCharacterLabel(chara.characterId)
                                : outsideCharacters[chara.characterId] || `Guest ${chara.characterId}`;
                            const externalAvatar = !isGameChar ? getOutsideCharacterAvatarUrl(charName) : null;
                            const hasIcon = (isGameChar && chara.characterId <= 26) || Boolean(externalAvatar);
                            const avatarUrl = isGameChar ? getCharacterIconUrl(chara.characterId) : externalAvatar;

                            return hasIcon && avatarUrl ? (
                                <div
                                    key={chara.id}
                                    className="w-6 h-6 rounded-full overflow-hidden bg-surface-container-high ring-1 ring-surface"
                                    title={charName}
                                >
                                    <Image
                                        src={avatarUrl}
                                        alt={charName}
                                        width={24}
                                        height={24}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                    />
                                </div>
                            ) : (
                                <div
                                    key={chara.id}
                                    className="h-6 px-2 rounded-full bg-surface-container-high ring-1 ring-surface flex items-center"
                                    title={charName}
                                >
                                    <span className="type-label-s text-on-surface-variant leading-none whitespace-nowrap">
                                        {charName}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Progress Bar & Time */}
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min="0"
                            max={duration || 100}
                            value={progress}
                            onChange={handleSeek}
                            className="flex-1 h-1.5 bg-surface-container-highest rounded-full appearance-none cursor-pointer accent-primary"
                        />
                        <span className="text-[10px] font-mono text-on-surface-variant shrink-0 min-w-[60px] text-right">
                            {formatTime(progress)} / {formatTime(duration)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Info Row Component
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="px-5 py-3 flex items-center justify-between gap-4 type-body-m">
            <span className="text-on-surface-variant">{label}</span>
            <span className="text-on-surface font-medium text-right">{value}</span>
        </div>
    );
}
