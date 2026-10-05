"use client";
import { useState, useEffect, useMemo, useCallback, useDeferredValue, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import MainLayout from "@/components/MainLayout";
import MusicFilters from "@/components/music/MusicFilters";
import MusicItem from "@/components/music/MusicItem";
import SearchSyntaxHelp from "@/components/search/SearchSyntaxHelp";
import { parseSearchQuery, matchExpr, makeNumericField, type SearchTerm, type SearchExpr, type FieldRegistry } from "@/lib/searchQuery";
import { MUSIC_GRID_CLASS } from "@/components/music/music-layout";
import {
    IMusicInfo,
    IMusicCategoryInfo,
    IMusicTagInfo,
    MusicTagType,
    MusicCategoryType,
    normalizeMusicsData,
} from "@/types/music";

interface MusicDifficulty {
    musicId: number;
    musicDifficulty: string;
    playLevel: number;
}
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { fetchSongConstants, buildSongConstantsMap } from "@/lib/songConstants";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { fetchMusicAliases } from "@/lib/musicAliases";
import { SEARCH_INDEX_URL } from "@/lib/lyrics-aliases.mjs";
import { fetchMusicBpmMap, MusicBpmEntry } from "@/lib/musicBpm";
import { useI18n } from "@/contexts/I18nContext";
import ExternalLink from "@/components/ExternalLink";
import { EmptyState, ErrorState, LoadingState, LoadMore, PageContainer, PageHeader } from "@/components/md3";
import { mdMusicNote } from "@/components/md3/icons";

// Search index item (from search-index.json)
interface SearchIndexItem {
    id: number;
    n: string;   // name (JP)
    cn?: string;  // name (CN translation)
    en?: string;  // name (EN translation)
    g: string;    // group: cards, music, events, gacha
}

// Music-specific search fields (registered into the advanced search parser).
// level/difficulty values are resolved against the currently selected difficulty.
const MUSIC_SEARCH_FIELDS: FieldRegistry = {
    level: makeNumericField("level-range", { decimal: false }),
    difficulty: makeNumericField("difficulty-range", { decimal: true }),
    bpm: makeNumericField("bpm-range", { decimal: false }),
};

// Collect plain text terms from a parsed query (used to annotate alias hits).
function collectTextTerms(expr: SearchExpr, out: string[] = []): string[] {
    if (expr.kind === "term") {
        if (expr.term.kind === "text") out.push(expr.term.value);
        return out;
    }
    collectTextTerms(expr.left, out);
    collectTextTerms(expr.right, out);
    return out;
}

// Level Separator Card Component
function LevelSeparatorCard({ level, difficulty }: { level: number; difficulty: string }) {
    const difficultyColors: Record<string, string> = {
        EASY: "from-green-400 to-green-500",
        NORMAL: "from-blue-400 to-blue-500",
        HARD: "from-yellow-400 to-yellow-500",
        EXPERT: "from-red-400 to-red-500",
        MASTER: "from-purple-500 to-purple-600",
        APPEND: "from-pink-500 to-pink-600",
    };

    const gradientClass = difficultyColors[difficulty] || "from-outline to-outline";

    return (
        <div className={`aspect-square rounded-md3-md bg-gradient-to-br ${gradientClass} flex flex-col items-center justify-center shadow-elev-1`}>
            <div className="text-white text-center px-2">
                <div className="text-[10px] sm:text-xs font-bold opacity-90 mb-0.5">
                    {difficulty}
                </div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-black">
                    {level}
                </div>
            </div>
        </div>
    );
}

function MusicContent() {
    const searchParams = useSearchParams();
    const { isShowSpoiler } = useTheme();
    const { t } = useI18n();

    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [musicTags, setMusicTags] = useState<IMusicTagInfo[]>([]);
    const [musicDifficulties, setMusicDifficulties] = useState<MusicDifficulty[]>([]);
    const [eventMusicIds, setEventMusicIds] = useState<Set<number>>(new Set());
    const [musicCnMap, setMusicCnMap] = useState<Map<number, string>>(new Map());
    const [musicEnMap, setMusicEnMap] = useState<Map<number, string>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);
    const [songConstantsMap, setSongConstantsMap] = useState<Record<number, Record<string, number>>>({});
    const [musicAliasesMap, setMusicAliasesMap] = useState<Map<number, string[]>>(new Map());
    const [musicBpmMap, setMusicBpmMap] = useState<Map<number, MusicBpmEntry>>(new Map());


    // Filter states
    const [selectedTag, setSelectedTag] = useState<MusicTagType>("all");
    const [selectedCategories, setSelectedCategories] = useState<MusicCategoryType[]>([]);
    const [hasEventOnly, setHasEventOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDifficulty, setSelectedDifficulty] = useState<string>("master");
    const [showDifficulty, setShowDifficulty] = useState(true);
    const [showBpm, setShowBpm] = useState(true);
    const deferredSearchQuery = useDeferredValue(searchQuery);

    // Sort states
    const [sortBy, setSortBy] = useState<"publishedAt" | "id" | "level" | "constant" | "bpm">("publishedAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Pagination with scroll restore
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "music",
        defaultDisplayCount: 30,
        increment: 30,
        maxRestoredDisplayCount: 90,
        isReady: !isLoading,
    });

    // Storage key
    const STORAGE_KEY = "music_filters";

    // Initialize from URL params first, then fallback to sessionStorage
    useEffect(() => {
        const tag = searchParams.get("tag");
        const categories = searchParams.get("categories");
        const eventOnly = searchParams.get("eventOnly");
        const search = searchParams.get("search");
        const sort = searchParams.get("sortBy");
        const order = searchParams.get("sortOrder");
        const showDiff = searchParams.get("showDifficulty");
        const showBpmParam = searchParams.get("showBpm");

        const hasUrlParams = tag || categories || eventOnly || search || sort || order || showDiff || showBpmParam;

        if (hasUrlParams) {
            if (tag) setSelectedTag(tag as MusicTagType);
            if (categories) setSelectedCategories(categories.split(",") as MusicCategoryType[]);
            if (eventOnly === "true") setHasEventOnly(true);
            if (search) setSearchQuery(search);
            if (sort) setSortBy(sort as "publishedAt" | "id" | "level" | "constant" | "bpm");
            if (order) setSortOrder(order as "asc" | "desc");
            if (showDiff === "false") setShowDifficulty(false);
            if (showBpmParam === "false") setShowBpm(false);
        } else {
            try {
                const saved = sessionStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const filters = JSON.parse(saved);
                    if (filters.tag && filters.tag !== "all") setSelectedTag(filters.tag);
                    if (filters.categories?.length) setSelectedCategories(filters.categories);
                    if (filters.eventOnly) setHasEventOnly(true);
                    if (filters.search) setSearchQuery(filters.search);
                    if (filters.sortBy) setSortBy(filters.sortBy);
                    if (filters.sortOrder) setSortOrder(filters.sortOrder);
                    if (filters.showDifficulty === false) setShowDifficulty(false);
                    if (filters.showBpm === false) setShowBpm(false);
                }
            } catch {
                console.log("Could not restore filters from sessionStorage");
            }
        }
        setFiltersInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Save to sessionStorage and update URL when filters change
    useEffect(() => {
        if (!filtersInitialized) return;

        const filters = {
            tag: selectedTag,
            categories: selectedCategories,
            eventOnly: hasEventOnly,
            search: searchQuery,
            sortBy,
            sortOrder,
            showDifficulty,
            showBpm,
        };
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        } catch {
            console.log("Could not save filters to sessionStorage");
        }

        const params = new URLSearchParams();
        if (selectedTag !== "all") params.set("tag", selectedTag);
        if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
        if (hasEventOnly) params.set("eventOnly", "true");
        if (searchQuery) params.set("search", searchQuery);
        if (sortBy !== "publishedAt") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        if (!showDifficulty) params.set("showDifficulty", "false");
        if (!showBpm) params.set("showBpm", "false");
        replaceCurrentUrlSearchParams(params);
    }, [selectedTag, selectedCategories, hasEventOnly, searchQuery, sortBy, sortOrder, showDifficulty, showBpm, filtersInitialized]);

    // Fetch data
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);

                // Fetch essential list data first. Search translations load independently.
                const [musicsData, categoriesData, tagsData, difficultiesData, eventMusicsData] = await Promise.all([
                    fetchMasterData<IMusicInfo[]>("musics.json"),
                    fetchMasterData<IMusicCategoryInfo[]>("musicCategories.json").catch(() => [] as IMusicCategoryInfo[]),
                    fetchMasterData<IMusicTagInfo[]>("musicTags.json"),
                    fetchMasterData<MusicDifficulty[]>("musicDifficulties.json"),
                    fetchMasterData<{ musicId: number }[]>("eventMusics.json"),
                ]);

                // Normalize musics data (supports upstream musicCategories.json and inline categories)
                const normalizedMusics = normalizeMusicsData(musicsData, categoriesData);

                setMusics(normalizedMusics);
                setMusicTags(tagsData);
                setMusicDifficulties(difficultiesData);
                setEventMusicIds(new Set(eventMusicsData.map((em) => em.musicId)));
                setError(null);

                fetch(SEARCH_INDEX_URL)
                    .then((res) => res.json() as Promise<SearchIndexItem[]>)
                    .then((searchIndexData) => {
                        const cnMap = new Map<number, string>();
                        const enMap = new Map<number, string>();
                        for (const item of searchIndexData) {
                            if (item.g !== "music") continue;
                            if (item.cn) cnMap.set(item.id, item.cn);
                            if (item.en) enMap.set(item.id, item.en);
                        }
                        setMusicCnMap(cnMap);
                        setMusicEnMap(enMap);
                    })
                    .catch(() => {
                        setMusicCnMap(new Map());
                        setMusicEnMap(new Map());
                    });

                // Fetch song constants (non-blocking)
                fetchSongConstants().then(entries => {
                    setSongConstantsMap(buildSongConstantsMap(entries));
                }).catch(err => {
                    console.warn("Failed to load song constants:", err);
                });

                // Fetch music aliases (non-blocking)
                fetchMusicAliases().then(aliasesMap => {
                    setMusicAliasesMap(aliasesMap);
                }).catch(err => {
                    console.warn("Failed to load music aliases:", err);
                });

                // Fetch music BPM data (non-blocking, only needed for BPM sorting)
                fetchMusicBpmMap().then(bpmMap => {
                    setMusicBpmMap(bpmMap);
                }).catch(err => {
                    console.warn("Failed to load music BPM:", err);
                });

            } catch (err) {
                console.error("Error fetching music data:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }

        fetchData();
    }, []);

    // Build difficulty map
    const musicDifficultiesMap = useMemo(() => {
        const map: Record<number, Record<string, number>> = {};
        musicDifficulties.forEach(d => {
            if (!map[d.musicId]) map[d.musicId] = {};
            map[d.musicId]![d.musicDifficulty] = d.playLevel;
        });
        return map;
    }, [musicDifficulties]);

    // Advanced search: parse the query into a boolean expression tree
    const parsedSearch = useMemo<SearchExpr | null>(
        () => parseSearchQuery(deferredSearchQuery, MUSIC_SEARCH_FIELDS),
        [deferredSearchQuery]
    );

    // Term matcher for the music page (level/difficulty follow the selected difficulty)
    const matchMusicTerm = useCallback((term: SearchTerm, music: IMusicInfo): boolean => {
        switch (term.kind) {
            case "text": {
                const q = term.value.toLowerCase().trim();
                if (!q) return true;
                if (music.title.toLowerCase().includes(q)) return true;
                const cn = musicCnMap.get(music.id);
                if (cn && cn.toLowerCase().includes(q)) return true;
                const en = musicEnMap.get(music.id);
                if (en && en.toLowerCase().includes(q)) return true;
                if (music.composer.toLowerCase().includes(q)) return true;
                if (music.lyricist.toLowerCase().includes(q)) return true;
                if (music.arranger.toLowerCase().includes(q)) return true;
                const aliases = musicAliasesMap.get(music.id);
                if (aliases && aliases.some(alias => alias.toLowerCase().includes(q))) return true;
                return false;
            }
            case "id-eq":
                return music.id === term.value;
            case "id-range":
                return music.id >= term.lo && music.id <= term.hi;
            case "date-range": {
                return music.publishedAt >= term.loTs && music.publishedAt <= term.hiTs;
            }
            case "level-range": {
                const lv = musicDifficultiesMap[music.id]?.[selectedDifficulty] || 0;
                return lv >= term.lo && lv <= term.hi;
            }
            case "difficulty-range": {
                const c = songConstantsMap[music.id]?.[selectedDifficulty] || 0;
                return c >= term.lo && c <= term.hi;
            }
            case "bpm-range": {
                const bpm = musicBpmMap.get(music.id)?.bpm || 0;
                return bpm >= term.lo && bpm <= term.hi;
            }
        }
    }, [musicCnMap, musicEnMap, musicAliasesMap, musicDifficultiesMap, songConstantsMap, musicBpmMap, selectedDifficulty]);

    // Filter and sort musics
    const filteredMusics = useMemo(() => {
        let result = [...musics];

        // Apply tag filter
        if (selectedTag !== "all") {
            let musicIdsWithTag: Set<number>;
            if (selectedTag === "vocaloid") {
                // "Virtual Singer Only": has vocaloid tag but no unit (cover) tag
                const unitTagIds = new Set<MusicTagType>([
                    "light_music_club",
                    "idol",
                    "street",
                    "theme_park",
                    "school_refusal",
                ]);
                const idsWithUnitTag = new Set(
                    musicTags
                        .filter((mt) => unitTagIds.has(mt.musicTag))
                        .map((mt) => mt.musicId)
                );
                musicIdsWithTag = new Set(
                    musicTags
                        .filter((mt) => mt.musicTag === "vocaloid")
                        .map((mt) => mt.musicId)
                        .filter((id) => !idsWithUnitTag.has(id))
                );
            } else {
                musicIdsWithTag = new Set(
                    musicTags
                        .filter((mt) => mt.musicTag === selectedTag)
                        .map((mt) => mt.musicId)
                );
            }
            result = result.filter((m) => musicIdsWithTag.has(m.id));
        }

        // Apply category filter (all selected categories must be present)
        if (selectedCategories.length > 0) {
            result = result.filter((m) =>
                selectedCategories.every((cat) => (m.categories ?? []).includes(cat))
            );
        }

        // Apply event only filter
        if (hasEventOnly) {
            result = result.filter((m) => eventMusicIds.has(m.id));
        }

        // Apply search query (advanced syntax: space/AND/OR/parens/quotes/fields)
        if (parsedSearch) {
            result = result.filter((m) => matchExpr(parsedSearch, m, matchMusicTerm));
        }

        // Spoiler filter
        if (!isShowSpoiler) {
            result = result.filter((m) => m.publishedAt <= Date.now());
        }

        // Apply sorting
        result.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case "id":
                    comparison = a.id - b.id;
                    break;
                case "publishedAt":
                    comparison = a.publishedAt - b.publishedAt;
                    break;
                case "level":
                    const levelA = musicDifficultiesMap[a.id]?.[selectedDifficulty] || 0;
                    const levelB = musicDifficultiesMap[b.id]?.[selectedDifficulty] || 0;
                    comparison = levelA - levelB;
                    if (comparison === 0) comparison = a.publishedAt - b.publishedAt;
                    break;
                case "constant":
                    const constA = songConstantsMap[a.id]?.[selectedDifficulty] || 0;
                    const constB = songConstantsMap[b.id]?.[selectedDifficulty] || 0;
                    comparison = constA - constB;
                    if (comparison === 0) comparison = a.publishedAt - b.publishedAt;
                    break;
                case "bpm":
                    const bpmA = musicBpmMap.get(a.id)?.bpm || 0;
                    const bpmB = musicBpmMap.get(b.id)?.bpm || 0;
                    comparison = bpmA - bpmB;
                    if (comparison === 0) comparison = a.publishedAt - b.publishedAt;
                    break;
            }
            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [musics, musicTags, eventMusicIds, selectedTag, selectedCategories, hasEventOnly, sortBy, sortOrder, isShowSpoiler, musicDifficultiesMap, selectedDifficulty, songConstantsMap, musicBpmMap, parsedSearch, matchMusicTerm]);

    // musicId -> aliases that explain the current search hit, one per text term
    // that is not already explained by a visible field (title/translation/credits).
    const matchedAliasesMap = useMemo(() => {
        const map = new Map<number, string[]>();
        if (!parsedSearch) return map;
        const textTerms = collectTextTerms(parsedSearch)
            .map(v => v.toLowerCase().trim())
            .filter(v => v !== "");
        if (textTerms.length === 0) return map;

        for (const music of filteredMusics) {
            const hits: string[] = [];
            for (const q of textTerms) {
                if (music.title.toLowerCase().includes(q)
                    || music.composer.toLowerCase().includes(q)
                    || music.lyricist.toLowerCase().includes(q)
                    || music.arranger.toLowerCase().includes(q)) continue;
                const cn = musicCnMap.get(music.id);
                if (cn && cn.toLowerCase().includes(q)) continue;
                const en = musicEnMap.get(music.id);
                if (en && en.toLowerCase().includes(q)) continue;
                const alias = musicAliasesMap.get(music.id)?.find(a => a.toLowerCase().includes(q));
                if (alias && !hits.includes(alias)) hits.push(alias);
            }
            if (hits.length > 0) map.set(music.id, hits);
        }
        return map;
    }, [filteredMusics, parsedSearch, musicAliasesMap, musicCnMap, musicEnMap]);

    // Displayed musics with level separators (only when sorting by level)
    const displayedMusicsWithSeparators = useMemo(() => {
        const musics = filteredMusics.slice(0, displayCount);

        if (sortBy !== "level" && sortBy !== "constant") {
            return musics.map(m => ({ type: 'music' as const, data: m }));
        }

        // Group by level/constant and insert separators
        const result: Array<{ type: 'music' | 'separator', data: IMusicInfo | { level: number, difficulty: string } }> = [];
        let lastLevel: number | null = null;

        for (const music of musics) {
            const rawLevel = sortBy === "constant"
                ? (songConstantsMap[music.id]?.[selectedDifficulty] || 0)
                : (musicDifficultiesMap[music.id]?.[selectedDifficulty] || 0);
            // For constant sorting, group by integer level only (e.g., 35 not 35.1/35.2)
            const groupLevel = sortBy === "constant" ? Math.floor(rawLevel) : rawLevel;

            if (groupLevel !== lastLevel) {
                result.push({
                    type: 'separator',
                    data: { level: groupLevel, difficulty: selectedDifficulty.toUpperCase() }
                });
                lastLevel = groupLevel;
            }

            result.push({ type: 'music', data: music });
        }

        return result;
    }, [filteredMusics, displayCount, sortBy, musicDifficultiesMap, selectedDifficulty, songConstantsMap]);



    // Reset filters
    const resetFilters = useCallback(() => {
        setSelectedTag("all");
        setSelectedCategories([]);
        setHasEventOnly(false);
        setSearchQuery("");
        setSortBy("publishedAt");
        setSortOrder("desc");
        setShowDifficulty(true);
        setShowBpm(true);
        resetDisplayCount();
    }, [resetDisplayCount]);

    // Sort change handler
    const handleSortChange = useCallback(
        (newSortBy: "publishedAt" | "id" | "level" | "constant" | "bpm", newSortOrder: "asc" | "desc") => {
            setSortBy(newSortBy);
            setSortOrder(newSortOrder);
            resetDisplayCount();
        },
        [resetDisplayCount]
    );

    const quickFilterContent = (
        <MusicFilters
            selectedTag={selectedTag}
            onTagChange={(tag) => {
                setSelectedTag(tag);
            }}
            selectedCategories={selectedCategories}
            onCategoryChange={(cats) => {
                setSelectedCategories(cats);
            }}
            hasEventOnly={hasEventOnly}
            onHasEventOnlyChange={(checked) => {
                setHasEventOnly(checked);
            }}
            searchQuery={searchQuery}
            onSearchChange={(q) => {
                setSearchQuery(q);
            }}
            searchHelp={
                <SearchSyntaxHelp
                    fieldItems={[
                        { label: t("search.syntax.id"), example: "id:1-100" },
                        { label: t("search.syntax.date"), example: "date:2026.8.19-2026.8.23" },
                        { label: t("search.syntax.level"), example: "level:35-36" },
                        { label: t("search.syntax.difficulty"), example: "difficulty:35.5-36.5" },
                        { label: t("search.syntax.bpm"), example: "bpm:150-160" },
                    ]}
                />
            }
            selectedDifficulty={selectedDifficulty}
            onDifficultyChange={setSelectedDifficulty}
            showDifficulty={showDifficulty}
            onShowDifficultyChange={setShowDifficulty}
            showBpm={showBpm}
            onShowBpmChange={setShowBpm}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            onReset={resetFilters}
            totalMusics={musics.length}
            filteredMusics={filteredMusics.length}
        />
    );

    useQuickFilter(t("page.music.filterTitle"), quickFilterContent, [
        selectedTag,
        selectedCategories,
        hasEventOnly,
        searchQuery,
        selectedDifficulty,
        showDifficulty,
        showBpm,
        sortBy,
        sortOrder,
        musics.length,
        filteredMusics.length,
    ]);

    return (
        <PageContainer>
            <PageHeader
                align="center"
                eyebrow={t("page.music.badge")}
                title={t("page.music.title")}
                highlight={t("page.music.titleHighlight")}
                description={
                    <>
                        {t("page.music.description")}
                        <span className="mt-1 block type-body-s">
                            {t("page.music.aliasHint")}<ExternalLink href="https://github.com/Team-Haruki" className="text-primary hover:underline">{t("page.music.aliasSource")}</ExternalLink>{t("page.music.aliasDisclaimer")}
                        </span>
                    </>
                }
            />

            {error && (
                <ErrorState
                    className="mb-6"
                    title={t("common.state.loadingFailed")}
                    message={error}
                    retryLabel={t("common.action.retry")}
                />
            )}

            {/* Music Grid. Filters live in the global FilterDrawer (registered
                above via useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {isLoading ? (
                    <div className={MUSIC_GRID_CLASS}>
                        {Array.from({ length: 15 }).map((_, i) => (
                            <div key={i} className="animate-pulse">
                                <div className="rounded-md3-md overflow-hidden bg-surface-container-low">
                                    <div className="aspect-square bg-surface-container-high"></div>
                                    <div className="p-3 space-y-2">
                                        <div className="h-4 bg-surface-container-highest rounded-md3-xs w-3/4"></div>
                                        <div className="h-3 bg-surface-container-high rounded-md3-xs w-1/2"></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : displayedMusicsWithSeparators.filter(item => item.type === 'music').length === 0 ? (
                    <EmptyState icon={mdMusicNote} title={t("page.music.noResult")} description={t("page.music.noResultHint")} />
                ) : (
                    <div className={MUSIC_GRID_CLASS}>
                        {displayedMusicsWithSeparators.map((item) => {
                            if (item.type === 'separator') {
                                const sepData = item.data as { level: number, difficulty: string };
                                return (
                                    <LevelSeparatorCard
                                        key={`sep-${sepData.difficulty}-${sepData.level}`}
                                        level={sepData.level}
                                        difficulty={sepData.difficulty}
                                    />
                                );
                            } else {
                                const music = item.data as IMusicInfo;
                                const now = Date.now();
                                const isSpoiler = music.publishedAt > now;
                                const musicConstant = showDifficulty ? undefined : songConstantsMap[music.id]?.[selectedDifficulty];
                                return <MusicItem key={music.id} music={music} isSpoiler={isSpoiler} constant={musicConstant} difficulties={musicDifficultiesMap[music.id]} showDifficulty={showDifficulty} bpm={showBpm ? musicBpmMap.get(music.id)?.bpm : undefined} cnTitle={musicCnMap.get(music.id)} enTitle={musicEnMap.get(music.id)} matchedAliases={matchedAliasesMap.get(music.id)} />;
                            }
                        })}
                    </div>
                )}

                {!isLoading && (
                    <LoadMore
                        label={t("page.music.loadMore")}
                        shown={displayedMusicsWithSeparators.filter(item => item.type === 'music').length}
                        total={filteredMusics.length}
                        onLoadMore={loadMore}
                        allLoadedLabel={t("page.music.allLoaded", { count: String(filteredMusics.length) })}
                    />
                )}
            </div>
        </PageContainer>
    );
}

export default function MusicClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <MusicContent />
            </Suspense>
        </MainLayout>
    );
}
