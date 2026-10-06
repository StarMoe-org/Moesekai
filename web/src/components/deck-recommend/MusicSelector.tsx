"use client";
import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
    IMusicInfo,
    IMusicCategoryInfo,
    MusicTagType,
    MusicCategoryType,
    IMusicTagInfo,
    IMusicMeta,
    normalizeMusicsData,
} from "@/types/music";
import { fetchMasterDataForServer, fetchMusicMetas, type ServerSourceType } from "@/lib/fetch";
import { getMusicJacketUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { loadTranslations, TranslationData } from "@/lib/translations";
import SelectorModal from "./SelectorModal";
import { Button, Icon, LoadingState } from "@/components/md3";
import { mdArrowBack, mdArrowForward, mdMusicNote, mdSearch, mdUnfoldMore } from "@/components/md3/icons";
import MusicFilters, { useMusicLevelFilter, type MusicLevelChart } from "@/components/music/MusicFilters";

/** Sort options for MusicSelector (no level/constant since there's no difficulty context) */
const SELECTOR_SORT_OPTION_IDS = ["publishedAt", "id"] as const;

interface MusicSelectorProps {
    selectedMusicId: string;
    onSelect: (musicId: string) => void;
    /** Show recommended picks section (default: true) */
    showRecommendations?: boolean;
    recommendMode?: "event" | "challenge";
    liveType?: string;
    server?: ServerSourceType;
}

interface RecommendationItem {
    music: IMusicInfo;
    meta: IMusicMeta;
    value: number;
    rank: number;
    isPinned?: boolean;
}

interface RecommendationCategory {
    key: "efficiency" | "pt" | "score";
    titleKey: string;
    descKey: string;
    unit: string;
    accentColor: string;
    items: RecommendationItem[];
}

export default function MusicSelector({
    selectedMusicId,
    onSelect,
    showRecommendations = true,
    recommendMode: _recommendMode = "event",
    liveType = "multi",
    server = "jp",
}: MusicSelectorProps) {
    const { assetSource, isShowSpoiler } = useTheme();
    const { t } = useI18n();
    const [now] = useState(() => Date.now());
    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [musicTags, setMusicTags] = useState<IMusicTagInfo[]>([]);
    const [charts, setCharts] = useState<MusicLevelChart[]>([]);
    const levelFilter = useMusicLevelFilter(charts);
    const { matches: matchesLevel } = levelFilter;
    const [musicMetas, setMusicMetas] = useState<IMusicMeta[]>([]);
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);

    // View mode: "recommend" (vertical 3 categories) vs "all" (detailed search & filter)
    const [userViewMode, setUserViewMode] = useState<"recommend" | "all">("recommend");
    const viewMode = !showRecommendations ? "all" : userViewMode;
    const setViewMode = (mode: "recommend" | "all") => setUserViewMode(mode);

    const [displayCount, setDisplayCount] = useState(30);

    // Filters state
    const [selectedTag, setSelectedTag] = useState<MusicTagType>("all");
    const [selectedCategories, setSelectedCategories] = useState<MusicCategoryType[]>([]);
    const [hasEventOnly, setHasEventOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"id" | "publishedAt">("publishedAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const selectorSortOptions = useMemo(() => {
        return SELECTOR_SORT_OPTION_IDS.map((id) => ({
            id,
            label: t(id === "publishedAt" ? "page.deckRecommend.selector.sortByPublishedAt" : "page.deckRecommend.selector.sortById"),
        }));
    }, [t]);

    // Normalize liveType for meta lookup
    const metaMode = useMemo(() => {
        if (liveType === "multi" || liveType === "cheerful") return "multi";
        if (liveType === "auto") return "auto";
        if (liveType === "solo") return "solo";
        return "multi";
    }, [liveType]);

    // Load musics, tags, and music metas on mount or when server changes
    useEffect(() => {
        let cancelled = false;
        const fetches: Promise<unknown>[] = [
            fetchMasterDataForServer<IMusicInfo[]>(server, "musics.json"),
            fetchMasterDataForServer<IMusicCategoryInfo[]>(server, "musicCategories.json").catch(() => [] as IMusicCategoryInfo[]),
            fetchMasterDataForServer<IMusicTagInfo[]>(server, "musicTags.json"),
            loadTranslations(),
            fetchMasterDataForServer<MusicLevelChart[]>(server, "musicDifficulties.json"),
        ];
        if (showRecommendations) {
            fetches.push(
                fetchMusicMetas().catch((err) => {
                    console.error("Failed to fetch music meta", err);
                    return [];
                })
            );
        }
        Promise.all(fetches)
            .then(([musicsData, categoriesData, tagsData, translationsData, chartsData, metasData]) => {
                if (cancelled) return;
                const rawMusics = musicsData as IMusicInfo[];
                const rawCats = categoriesData as IMusicCategoryInfo[];
                const normalizedMusics = normalizeMusicsData(rawMusics, rawCats);
                setMusics(normalizedMusics);
                setMusicTags(tagsData as IMusicTagInfo[]);
                setCharts(chartsData as MusicLevelChart[]);
                setTranslations(translationsData as TranslationData);
                if (metasData) setMusicMetas(metasData as IMusicMeta[]);
                setLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Failed to load musics", err);
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [showRecommendations, server]);

    // Vertically arranged recommended categories: Efficiency, PT, Score
    const recommendationCategories = useMemo<RecommendationCategory[]>(() => {
        if (!showRecommendations || !musics.length || !musicMetas.length) return [];

        const buildCategory = (
            key: "efficiency" | "pt" | "score",
            titleKey: string,
            descKey: string,
            unit: string,
            accentColor: string,
            sortField: keyof IMusicMeta,
            pinnedIds: number[] = [],
            maxItems: number = 3
        ): RecommendationCategory => {
            const sortedMetas = [...musicMetas].sort(
                (a, b) => ((b[sortField] as number) || 0) - ((a[sortField] as number) || 0)
            );

            const rankMap = new Map<number, number>();
            let currentRank = 1;
            const seenRank = new Set<number>();
            for (const meta of sortedMetas) {
                if (!seenRank.has(meta.music_id)) {
                    seenRank.add(meta.music_id);
                    rankMap.set(meta.music_id, currentRank++);
                }
            }

            const seen = new Set<number>();
            const items: RecommendationItem[] = [];

            const addItem = (id: number, isPinned: boolean = false) => {
                if (seen.has(id)) return;
                const meta = sortedMetas.find((m) => m.music_id === id) || musicMetas.find((m) => m.music_id === id);
                if (meta) {
                    const music = musics.find((m) => m.id === id);
                    if (music) {
                        seen.add(id);
                        items.push({
                            music,
                            meta,
                            value: (meta[sortField] as number) || 0,
                            rank: rankMap.get(id) || 999,
                            isPinned,
                        });
                    }
                }
            };

            for (const pid of pinnedIds) {
                addItem(pid, true);
            }

            for (const meta of sortedMetas) {
                if (items.length >= maxItems) break;
                addItem(meta.music_id);
            }

            return { key, titleKey, descKey, unit, accentColor, items };
        };

        const categories: RecommendationCategory[] = [];

        // 1. Efficiency (hidden in solo mode)
        if (metaMode !== "solo") {
            const effField: keyof IMusicMeta =
                metaMode === "auto" ? "pspi_pt_per_hour_auto" : "pspi_pt_per_hour_multi";
            categories.push(
                buildCategory(
                    "efficiency",
                    "page.deckRecommend.selector.recommendationEfficiency",
                    "page.deckRecommend.selector.recommendationEfficiencyDesc",
                    "PSPI/h",
                    "bg-primary",
                    effField,
                    [],
                    3
                )
            );
        }

        // 2. PT
        const ptField: keyof IMusicMeta =
            metaMode === "solo"
                ? "pspi_solo_pt_max"
                : metaMode === "auto"
                ? "pspi_auto_pt_max"
                : "pspi_multi_pt_max";
        const pinnedPt = metaMode === "multi" ? [226, 448] : [];
        categories.push(
            buildCategory(
                "pt",
                "page.deckRecommend.selector.recommendationPt",
                "page.deckRecommend.selector.recommendationPtDesc",
                "PSPI",
                "bg-secondary",
                ptField,
                pinnedPt,
                3
            )
        );

        // 3. Score
        const scoreField: keyof IMusicMeta =
            metaMode === "solo"
                ? "pspi_solo_score"
                : metaMode === "auto"
                ? "pspi_auto_score"
                : "pspi_multi_score";
        categories.push(
            buildCategory(
                "score",
                "page.deckRecommend.selector.recommendationScore",
                "page.deckRecommend.selector.recommendationScoreDesc",
                "PSPI",
                "bg-tertiary",
                scoreField,
                [],
                3
            )
        );

        return categories;
    }, [showRecommendations, musics, musicMetas, metaMode]);

    // Filter musics
    const filteredMusics = useMemo(() => {
        let result = musics.filter((music) => matchesLevel(music.id));

        // Tag filter
        if (selectedTag !== "all") {
            const validIds = new Set(
                musicTags
                    .filter((t) => t.musicTag === selectedTag)
                    .map((t) => t.musicId)
            );
            result = result.filter((m) => validIds.has(m.id));
        }

        // Category filter
        if (selectedCategories.length > 0) {
            result = result.filter((m) =>
                (m.categories ?? []).some((cat) => selectedCategories.includes(cat))
            );
        }

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter((m) => {
                if (m.id.toString().includes(q)) return true;
                if (m.title.toLowerCase().includes(q)) return true;
                const chineseTitle = translations?.music?.title?.[m.title];
                if (chineseTitle && chineseTitle.toLowerCase().includes(q)) return true;
                if (m.lyricist.toLowerCase().includes(q)) return true;
                if (m.composer.toLowerCase().includes(q)) return true;
                return false;
            });
        }

        // Spoiler filter
        if (!isShowSpoiler) {
            result = result.filter((m) => m.publishedAt <= now);
        }

        // Sort
        result.sort((a, b) => {
            const valA = a[sortBy];
            const valB = b[sortBy];
            return sortOrder === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
        });

        return result;
    }, [matchesLevel, musics, musicTags, selectedTag, selectedCategories, searchQuery, sortBy, sortOrder, translations, isShowSpoiler, now]);

    // Get currently selected music object
    const selectedMusic = useMemo(() => {
        if (!selectedMusicId) return null;
        return musics.find((m) => m.id.toString() === selectedMusicId) || null;
    }, [musics, selectedMusicId]);

    const handleSelect = (music: IMusicInfo) => {
        onSelect(music.id.toString());
        setModalOpen(false);
    };

    return (
        <div className="w-full">
            <label className="mb-1 block type-label-l text-on-surface-variant">
                {t("page.deckRecommend.selector.music")} <span className="text-error">*</span>
            </label>

            <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="state-layer focus-ring group flex w-full items-center gap-3 rounded-md3-md border border-outline bg-surface-container-lowest p-3 text-left transition-colors hover:border-on-surface"
            >
                {selectedMusic ? (
                    <>
                        <div className="relative w-16 aspect-square bg-surface-container-high rounded-md3-sm overflow-hidden flex-shrink-0">
                            <Image
                                src={getMusicJacketUrl(selectedMusic.assetbundleName, assetSource)}
                                alt={selectedMusic.title}
                                fill
                                className="object-cover"
                                unoptimized
                                loading="lazy"
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="type-label-s font-mono text-on-surface-variant bg-surface-container-high px-1.5 rounded-md3-xs">
                                    #{selectedMusic.id}
                                </span>
                            </div>
                            <div className="type-title-s text-on-surface truncate group-hover:text-primary transition-colors">
                                {selectedMusic.title}
                            </div>
                            <div className="type-body-s text-on-surface-variant truncate">
                                {selectedMusic.lyricist} / {selectedMusic.composer}
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-16 aspect-square bg-surface-container-high rounded-md3-sm flex items-center justify-center text-on-surface-variant">
                            <Icon path={mdMusicNote} size={24} />
                        </div>
                        <span className="type-body-m text-on-surface-variant">{t("page.deckRecommend.selector.selectMusicPlaceholder")}</span>
                    </>
                )}
                <Icon path={mdUnfoldMore} size={20} className="shrink-0 text-on-surface-variant" />
            </button>

            <SelectorModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={t("page.deckRecommend.selector.selectMusicTitle")}
            >
                <div className="space-y-4">
                    {/* Header Switcher */}
                    {showRecommendations && (
                        <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
                            <div className="type-label-l text-on-surface-variant">
                                {viewMode === "recommend"
                                    ? t("page.deckRecommend.selector.basedOnMode", {
                                          mode:
                                              liveType === "cheerful"
                                                  ? "Multi"
                                                  : liveType.charAt(0).toUpperCase() + liveType.slice(1),
                                      })
                                    : t("page.deckRecommend.selector.music")}
                            </div>
                            {viewMode === "recommend" ? (
                                <Button type="button" variant="tonal" size="xs" icon={mdSearch} onClick={() => setViewMode("all")}>
                                    {t("page.deckRecommend.selector.switchToAll", { count: musics.length })}
                                </Button>
                            ) : (
                                <Button type="button" variant="outlined" size="xs" icon={mdArrowBack} onClick={() => setViewMode("recommend")}>
                                    {t("page.deckRecommend.selector.switchToRecommend")}
                                </Button>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <LoadingState label={t("common.state.loading")} className="min-h-[30vh]" />
                    ) : viewMode === "recommend" && showRecommendations ? (
                        /* Recommendations View: Vertical layout with Efficiency, PT, and Score */
                        <div className="space-y-5">
                            {recommendationCategories.map((category) => (
                                <div
                                    key={category.key}
                                    className="rounded-md3-lg bg-surface-container-low p-4"
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-1.5 h-4 ${category.accentColor} rounded-full`} />
                                            <h3 className="type-title-s text-on-surface">
                                                {t(category.titleKey)}
                                            </h3>
                                        </div>
                                        <span className="type-body-s text-on-surface-variant sm:text-right">
                                            {t(category.descKey)}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {category.items.map((item) => (
                                            <div
                                                key={`${category.key}-${item.music.id}`}
                                                onClick={() => handleSelect(item.music)}
                                                className="state-layer cursor-pointer rounded-md3-md border border-outline-variant bg-surface-container-lowest transition-colors hover:border-outline flex items-center gap-3 p-2.5 group"
                                            >
                                                {/* Rank Badge */}
                                                <div
                                                    className={`w-7 h-7 flex-shrink-0 flex items-center justify-center type-label-m rounded-md3-sm ${
                                                        item.rank === 1
                                                            ? "bg-tertiary-container text-on-tertiary-container type-emphasized"
                                                            : item.rank === 2
                                                            ? "bg-secondary-container text-on-secondary-container type-emphasized"
                                                            : item.rank === 3
                                                            ? "bg-primary-container text-on-primary-container type-emphasized"
                                                            : "bg-surface-container-high text-on-surface-variant"
                                                    }`}
                                                >
                                                    #{item.rank}
                                                </div>

                                                {/* Jacket */}
                                                <div className="relative w-12 h-12 rounded-md3-sm overflow-hidden bg-surface-container-high flex-shrink-0">
                                                    <Image
                                                        src={getMusicJacketUrl(item.music.assetbundleName, assetSource)}
                                                        alt={item.music.title}
                                                        fill
                                                        className="object-cover"
                                                        unoptimized
                                                        loading="lazy"
                                                    />
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                        <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container-high px-1 rounded-md3-xs">
                                                            #{item.music.id}
                                                        </span>
                                                    </div>
                                                    <div className="type-title-s text-on-surface truncate group-hover:text-primary transition-colors">
                                                        {item.music.title}
                                                    </div>
                                                    {translations?.music?.title?.[item.music.title] && (
                                                        <div className="type-body-s text-on-surface-variant truncate">
                                                            {translations.music.title[item.music.title]}
                                                        </div>
                                                    )}
                                                    <div className="text-[11px] text-on-surface-variant truncate mt-0.5">
                                                        {item.music.composer}
                                                    </div>
                                                </div>

                                                {/* Value */}
                                                <div className="text-right flex-shrink-0 pl-1">
                                                    <div className="type-title-s type-emphasized text-primary font-mono">
                                                        {item.value.toFixed(0)}
                                                    </div>
                                                    <div className="text-[10px] text-on-surface-variant font-medium">
                                                        {category.unit}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {/* Switch to detailed view button banner */}
                            <div className="pt-2 text-center">
                                <Button type="button" variant="outlined" size="s" trailingIcon={mdArrowForward} onClick={() => setViewMode("all")}>
                                    {t("page.deckRecommend.selector.viewAllNotice")}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        /* Detailed View: Filter + Search + Paginated All Songs */
                        <div className="space-y-6">
                            <MusicFilters
                                selectedDifficulties={levelFilter.difficulties}
                                onDifficultiesChange={(next) => { levelFilter.changeDifficulties(next); setDisplayCount(30); }}
                                difficultyRange={levelFilter.range}
                                difficultyBounds={levelFilter.bounds}
                                onDifficultyRangeChange={(next) => { levelFilter.setRange(next); setDisplayCount(30); }}
                                selectedTag={selectedTag}
                                onTagChange={(tag) => {
                                    setSelectedTag(tag);
                                    setDisplayCount(30);
                                }}
                                selectedCategories={selectedCategories}
                                onCategoryChange={(cats) => {
                                    setSelectedCategories(cats);
                                    setDisplayCount(30);
                                }}
                                hasEventOnly={hasEventOnly}
                                onHasEventOnlyChange={(val) => {
                                    setHasEventOnly(val);
                                    setDisplayCount(30);
                                }}
                                searchQuery={searchQuery}
                                onSearchChange={(q) => {
                                    setSearchQuery(q);
                                    setDisplayCount(30);
                                }}
                                sortBy={sortBy}
                                sortOrder={sortOrder}
                                onSortChange={(nextSortBy, nextSortOrder) => {
                                    if (nextSortBy === "level" || nextSortBy === "constant" || nextSortBy === "bpm") return;
                                    setSortBy(nextSortBy as "id" | "publishedAt");
                                    setSortOrder(nextSortOrder);
                                    setDisplayCount(30);
                                }}
                                customSortOptions={selectorSortOptions}
                                onReset={() => {
                                    levelFilter.reset();
                                    setSelectedTag("all");
                                    setSelectedCategories([]);
                                    setHasEventOnly(false);
                                    setSearchQuery("");
                                    setSortBy("publishedAt");
                                    setSortOrder("desc");
                                    setDisplayCount(30);
                                }}
                                totalMusics={musics.length}
                                filteredMusics={filteredMusics.length}
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {filteredMusics.slice(0, displayCount).map((music) => (
                                    <div
                                        key={music.id}
                                        onClick={() => handleSelect(music)}
                                        className="cursor-pointer"
                                    >
                                        <MusicSelectionItem music={music} translations={translations} />
                                    </div>
                                ))}

                                {filteredMusics.length > displayCount && (
                                    <div className="col-span-full py-4 text-center">
                                        <Button
                                            type="button"
                                            variant="tonal"
                                            size="s"
                                            onClick={() => setDisplayCount((prev) => prev + 30)}
                                        >
                                            {t("page.deckRecommend.selector.loadMore", {
                                                loaded: Math.min(displayCount, filteredMusics.length),
                                                total: filteredMusics.length,
                                            })}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </SelectorModal>
        </div>
    );
}

// Simplified MusicItem for selection
function MusicSelectionItem({ music, translations }: { music: IMusicInfo; translations: TranslationData | null }) {
    const { assetSource } = useTheme();
    const jacketUrl = getMusicJacketUrl(music.assetbundleName, assetSource);

    return (
        <div className="state-layer group rounded-md3-md bg-surface-container-low shadow-elev-1 overflow-hidden transition-shadow hover:shadow-elev-2 flex items-center gap-3 p-2">
            <div className="relative w-14 h-14 rounded-md3-sm overflow-hidden flex-shrink-0 bg-surface-container-high">
                <Image
                    src={jacketUrl}
                    alt={music.title}
                    fill
                    className="object-cover"
                    unoptimized
                    loading="lazy"
                />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                    <div className="type-label-s font-mono text-on-surface-variant bg-surface-container-high px-1 rounded-md3-xs">
                        #{music.id}
                    </div>
                    {/* Categories Badges */}
                    <div className="flex gap-1">
                        {(music.categories ?? []).includes("mv") && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" title="3D MV" />
                        )}
                        {(music.categories ?? []).includes("mv_2d") && (
                            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" title="2D MV" />
                        )}
                    </div>
                </div>

                <h3 className="type-title-s text-on-surface line-clamp-1 group-hover:text-primary transition-colors custom-font-jp">
                    {music.title}
                </h3>
                {translations?.music?.title?.[music.title] && (
                    <div className="type-body-s text-on-surface-variant line-clamp-1 mb-0.5">
                        {translations.music.title[music.title]}
                    </div>
                )}

                <div className="type-body-s text-on-surface-variant line-clamp-1">
                    {music.composer}
                </div>
            </div>
        </div>
    );
}
