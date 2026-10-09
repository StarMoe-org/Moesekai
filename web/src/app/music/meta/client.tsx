"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import Link from "@/components/LocalizedLink";
import ExternalLink from '@/components/ExternalLink';
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import {
    IMusicInfo,
    IMusicMeta,
    IMusicDifficultyInfo,
    MusicDifficultyType,
    DIFFICULTY_COLORS,
    DIFFICULTY_NAMES,
    getMusicJacketUrl,
} from "@/types/music";
import { fetchMasterData, fetchMusicMetas } from "@/lib/fetch";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { Button, ErrorState, Icon, LoadingState, PageContainer, PageHeader, Select, SegmentedButton, TextField } from "@/components/md3";
import { mdHelp, mdKeyboardArrowDown, mdKeyboardArrowUp, mdLeaderboard, mdSearch } from "@/components/md3/icons";

// Items per page options
const PAGE_SIZE_OPTIONS = [20, 50, 100];

// Mode options
type LiveMode = "auto" | "solo" | "multi";
const LIVE_MODE_OPTIONS: { value: LiveMode; labelKey: string }[] = [
    { value: "multi", labelKey: "page.musicMeta.liveModes.multi" },
    { value: "solo", labelKey: "page.musicMeta.liveModes.solo" },
    { value: "auto", labelKey: "page.musicMeta.liveModes.auto" },
];

// View mode
type ViewMode = "overview" | "detailed";

// Mode-specific ranking categories
interface RankingCategory {
    id: string;
    titleKey: string;
    subtitleKey: string;
    field: keyof IMusicMeta;
    format: (val: number) => string;
    dedupeBySong?: boolean;
    hideDifficulty?: boolean;
}

const getRankingCategories = (mode: LiveMode): RankingCategory[] => {
    const base: RankingCategory[] = [];

    if (mode === "multi") {
        base.push(
            { id: "hourly", titleKey: "page.musicMeta.rankings.hourly", subtitleKey: "page.musicMeta.units.pspi", field: "pspi_pt_per_hour_multi", format: (v) => v.toFixed(1) },
            { id: "score", titleKey: "page.musicMeta.rankings.score", subtitleKey: "page.musicMeta.units.pspi", field: "pspi_multi_score", format: (v) => v.toFixed(1) },
            { id: "pt", titleKey: "page.musicMeta.rankings.pt", subtitleKey: "page.musicMeta.units.pspi", field: "pspi_multi_pt_max", format: (v) => v.toFixed(1) },
            { id: "cycles", titleKey: "page.musicMeta.rankings.cycles", subtitleKey: "page.musicMeta.units.timesPerHour", field: "cycles_multi", format: (v) => v.toFixed(1), dedupeBySong: true, hideDifficulty: true },
        );
    } else if (mode === "solo") {
        base.push(
            { id: "score", titleKey: "page.musicMeta.rankings.score", subtitleKey: "page.musicMeta.units.pspi", field: "pspi_solo_score", format: (v) => v.toFixed(1) },
            { id: "pt", titleKey: "page.musicMeta.rankings.pt", subtitleKey: "page.musicMeta.units.pspi", field: "pspi_solo_pt_max", format: (v) => v.toFixed(1) },
        );
    } else {
        base.push(
            { id: "hourly", titleKey: "page.musicMeta.rankings.hourly", subtitleKey: "page.musicMeta.units.pspi", field: "pspi_pt_per_hour_auto", format: (v) => v.toFixed(1) },
            { id: "score", titleKey: "page.musicMeta.rankings.score", subtitleKey: "page.musicMeta.units.pspi", field: "pspi_auto_score", format: (v) => v.toFixed(1) },
            { id: "pt", titleKey: "page.musicMeta.rankings.pt", subtitleKey: "page.musicMeta.units.pspi", field: "pspi_auto_pt_max", format: (v) => v.toFixed(1) },
            { id: "cycles", titleKey: "page.musicMeta.rankings.cycles", subtitleKey: "page.musicMeta.units.timesPerHour", field: "cycles_auto", format: (v) => v.toFixed(1), dedupeBySong: true, hideDifficulty: true },
        );
    }

    return base;
};

// Rank colors for top 3, drawn on the jacket's dark scrim
const getRankColor = (rank: number): string => {
    if (rank === 1) return "text-yellow-400"; // Gold
    if (rank === 2) return "text-zinc-200"; // Silver
    if (rank === 3) return "text-amber-500"; // Bronze
    return "text-white";
};

// Hook to get responsive column count
function useColumnCount() {
    const [columns, setColumns] = useState(5);

    useEffect(() => {
        const updateColumns = () => {
            const width = window.innerWidth;
            if (width >= 1280) setColumns(5);      // xl
            else if (width >= 1024) setColumns(3); // lg
            else if (width >= 640) setColumns(2);  // sm
            else setColumns(1);                     // mobile
        };

        updateColumns();
        window.addEventListener("resize", updateColumns);
        return () => window.removeEventListener("resize", updateColumns);
    }, []);

    return columns;
}

// Hook to determine if sticky columns should be enabled
// When scrollable area is less than MIN_SCROLLABLE_WIDTH, disable sticky to allow full horizontal scroll
const MIN_SCROLLABLE_WIDTH = 100; // Minimum pixels for scrollable area
// Total sticky columns width: ID + Difficulty + Song Title (min-width)
// sm+: 60 + 140 + 180 = 380px
// xs:  45 + 95 + 180 = 320px
const STICKY_COLUMNS_WIDTH_SM = 380;
const STICKY_COLUMNS_WIDTH_XS = 320;

function useEnableStickyColumns() {
    const [enableSticky, setEnableSticky] = useState(true);

    useEffect(() => {
        const checkWidth = () => {
            const screenWidth = window.innerWidth;
            const isSm = screenWidth >= 640;
            const stickyWidth = isSm ? STICKY_COLUMNS_WIDTH_SM : STICKY_COLUMNS_WIDTH_XS;
            // Calculate scrollable area: screen width - sticky columns - container padding (px-4 = 32px total)
            const scrollableArea = screenWidth - stickyWidth - 32;
            setEnableSticky(scrollableArea >= MIN_SCROLLABLE_WIDTH);
        };

        checkWidth();
        window.addEventListener("resize", checkWidth);
        return () => window.removeEventListener("resize", checkWidth);
    }, []);

    return enableSticky;
}

function MusicMetaContent() {
    const searchParams = useSearchParams();
    const { assetSource } = useTheme();
    const { t, formatNumber } = useI18n();
    const [musicMetas, setMusicMetas] = useState<IMusicMeta[]>([]);
    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [difficulties, setDifficulties] = useState<IMusicDifficultyInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    // View mode state
    const [viewMode, setViewMode] = useState<ViewMode>("overview");

    // Live mode state
    const [liveMode, setLiveMode] = useState<LiveMode>("multi");

    // Ranking expand states
    const [expandedRankings, setExpandedRankings] = useState<Set<string>>(new Set());

    // Sort state (for detailed view)
    const [sortField, setSortField] = useState<keyof IMusicMeta>("music_id");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    // Search state
    const [searchQuery, setSearchQuery] = useState("");

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    // Get responsive column count
    const columnCount = useColumnCount();

    // Check if sticky columns should be enabled (false when scrollable area is too small)
    const enableStickyColumns = useEnableStickyColumns();

    // Calculate item counts based on columns to fill rows
    // Default: 1 row, Expanded: 3 rows
    const defaultRowCount = 1;
    const expandedRowCount = columnCount >= 5 ? 3 : 5;
    const defaultItemCount = columnCount * defaultRowCount;
    const expandedItemCount = columnCount * expandedRowCount;

    // Storage key for sessionStorage
    const STORAGE_KEY = "music_meta_filters";

    // Initialize from URL params first, then fallback to sessionStorage
    useEffect(() => {
        const view = searchParams.get("view");
        const mode = searchParams.get("mode");
        const expanded = searchParams.get("expanded");
        const sort = searchParams.get("sortField");
        const order = searchParams.get("sortOrder");
        const search = searchParams.get("search");
        const page = searchParams.get("page");
        const size = searchParams.get("pageSize");

        // If URL has params, use them
        const hasUrlParams = view || mode || expanded || sort || order || search || page || size;

        if (hasUrlParams) {
            if (view && (view === "overview" || view === "detailed")) setViewMode(view);
            if (mode && (mode === "multi" || mode === "solo" || mode === "auto")) setLiveMode(mode);
            if (expanded) setExpandedRankings(new Set(expanded.split(",")));
            if (sort) setSortField(sort as keyof IMusicMeta);
            if (order && (order === "asc" || order === "desc")) setSortOrder(order);
            if (search) setSearchQuery(search);
            if (page) setCurrentPage(Number(page) || 1);
            if (size && PAGE_SIZE_OPTIONS.includes(Number(size))) setPageSize(Number(size));
        } else {
            // Fallback to sessionStorage
            try {
                const saved = sessionStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const filters = JSON.parse(saved);
                    if (filters.viewMode) setViewMode(filters.viewMode);
                    if (filters.liveMode) setLiveMode(filters.liveMode);
                    if (filters.expandedRankings?.length) setExpandedRankings(new Set(filters.expandedRankings));
                    if (filters.sortField) setSortField(filters.sortField);
                    if (filters.sortOrder) setSortOrder(filters.sortOrder);
                    if (filters.searchQuery) setSearchQuery(filters.searchQuery);
                    if (filters.currentPage) setCurrentPage(filters.currentPage);
                    if (filters.pageSize) setPageSize(filters.pageSize);
                }
            } catch (_e) {
                console.log("Could not restore filters from sessionStorage");
            }
        }
        setFiltersInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount

    // Save to sessionStorage and update URL when filters change
    useEffect(() => {
        if (!filtersInitialized) return;

        // Save to sessionStorage
        const filters = {
            viewMode,
            liveMode,
            expandedRankings: Array.from(expandedRankings),
            sortField,
            sortOrder,
            searchQuery,
            currentPage,
            pageSize,
        };
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        } catch (_e) {
            console.log("Could not save filters to sessionStorage");
        }

        // Update URL
        const params = new URLSearchParams();
        if (viewMode !== "overview") params.set("view", viewMode);
        if (liveMode !== "multi") params.set("mode", liveMode);
        if (expandedRankings.size > 0) params.set("expanded", Array.from(expandedRankings).join(","));
        if (sortField !== "music_id") params.set("sortField", sortField);
        if (sortOrder !== "asc") params.set("sortOrder", sortOrder);
        if (searchQuery) params.set("search", searchQuery);
        if (currentPage !== 1) params.set("page", String(currentPage));
        if (pageSize !== 50) params.set("pageSize", String(pageSize));
        replaceCurrentUrlSearchParams(params);
    }, [viewMode, liveMode, expandedRankings, sortField, sortOrder, searchQuery, currentPage, pageSize, filtersInitialized]);

    // Fetch data
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const [metaData, musicsData, difficultiesData] = await Promise.all([
                    fetchMusicMetas(),
                    fetchMasterData<IMusicInfo[]>("musics.json"),
                    fetchMasterData<IMusicDifficultyInfo[]>("musicDifficulties.json"),
                ]);
                setMusicMetas(metaData);
                setMusics(musicsData);
                setDifficulties(difficultiesData);
                setError(null);
            } catch (err) {
                console.error("Error fetching music meta data:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, []);

    // Create music ID to info map
    const musicMap = useMemo(() => {
        const map = new Map<number, IMusicInfo>();
        musics.forEach((m) => map.set(m.id, m));
        return map;
    }, [musics]);

    // Create difficulty map
    const difficultyMap = useMemo(() => {
        const map = new Map<string, number>();
        difficulties.forEach((d) => {
            map.set(`${d.musicId}-${d.musicDifficulty}`, d.playLevel);
        });
        return map;
    }, [difficulties]);

    // Toggle ranking expansion - just update state, no scroll
    const toggleRankingExpand = (id: string) => {
        setExpandedRankings((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Get top N items for a ranking (with optional deduplication by song)
    const getTopItems = (field: keyof IMusicMeta, count: number, dedupeBySong: boolean = false) => {
        const sorted = [...musicMetas].sort((a, b) => (b[field] as number) - (a[field] as number));

        if (dedupeBySong) {
            const seen = new Set<number>();
            const result: IMusicMeta[] = [];
            for (const item of sorted) {
                if (!seen.has(item.music_id)) {
                    seen.add(item.music_id);
                    result.push(item);
                    if (result.length >= count) break;
                }
            }
            return result;
        }

        return sorted.slice(0, count);
    };

    // Get ranking categories for current mode
    const rankingCategories = useMemo(() => getRankingCategories(liveMode), [liveMode]);

    // Filter and sort (for detailed view)
    const filteredMetas = useMemo(() => {
        let result = [...musicMetas];

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            const queryNum = parseInt(query, 10);
            result = result.filter((meta) => {
                const music = musicMap.get(meta.music_id);
                const title = music?.title || "";
                return meta.music_id === queryNum || title.toLowerCase().includes(query);
            });
        }

        result.sort((a, b) => {
            if (sortField === "difficulty") {
                const aLevel = difficultyMap.get(`${a.music_id}-${a.difficulty}`) || 0;
                const bLevel = difficultyMap.get(`${b.music_id}-${b.difficulty}`) || 0;
                if (aLevel !== bLevel) {
                    return sortOrder === "asc" ? aLevel - bLevel : bLevel - aLevel;
                }
            }
            const aVal = a[sortField];
            const bVal = b[sortField];
            if (typeof aVal === "number" && typeof bVal === "number") {
                return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
            }
            return sortOrder === "asc"
                ? String(aVal).localeCompare(String(bVal))
                : String(bVal).localeCompare(String(aVal));
        });

        return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [musicMetas, searchQuery, sortField, sortOrder, musicMap]);

    const paginatedMetas = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredMetas.slice(start, start + pageSize);
    }, [filteredMetas, currentPage, pageSize]);

    const totalPages = Math.ceil(filteredMetas.length / pageSize);



    const handleSort = (field: keyof IMusicMeta) => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("desc");
        }
        setCurrentPage(1);
    };

    const getModeFields = (mode: LiveMode) => {
        switch (mode) {
            case "auto":
                return {
                    score: "pspi_auto_score" as keyof IMusicMeta,
                    pt: "pspi_auto_pt_max" as keyof IMusicMeta,
                    hourly: "pspi_pt_per_hour_auto" as keyof IMusicMeta,
                    cycles: "cycles_auto" as keyof IMusicMeta,
                };
            case "solo":
                return {
                    score: "pspi_solo_score" as keyof IMusicMeta,
                    pt: "pspi_solo_pt_max" as keyof IMusicMeta,
                    hourly: null,
                    cycles: null,
                };
            case "multi":
                return {
                    score: "pspi_multi_score" as keyof IMusicMeta,
                    pt: "pspi_multi_pt_max" as keyof IMusicMeta,
                    hourly: "pspi_pt_per_hour_multi" as keyof IMusicMeta,
                    cycles: "cycles_multi" as keyof IMusicMeta,
                };
        }
    };

    const modeFields = getModeFields(liveMode);

    // Ranking Item Component - Compact horizontal layout
    const RankingItem = ({ meta, rank, category }: { meta: IMusicMeta; rank: number; category: RankingCategory }) => {
        const music = musicMap.get(meta.music_id);
        const level = difficultyMap.get(`${meta.music_id}-${meta.difficulty}`) || "?";
        const diffColor = DIFFICULTY_COLORS[meta.difficulty as MusicDifficultyType] || "#888";
        const diffName = DIFFICULTY_NAMES[meta.difficulty as MusicDifficultyType] || meta.difficulty;
        const value = meta[category.field] as number;

        return (
            <Link
                href={`/music/${meta.music_id}`}
                className="group state-layer focus-ring relative block rounded-md3-md"
            >
                <div className="relative rounded-md3-md overflow-hidden bg-surface-card text-on-surface shadow-elev-1 group-hover:shadow-elev-2 transition-shadow duration-200 ease-md3-standard flex">
                    {/* Cover Image - Smaller */}
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 overflow-hidden">
                        {music && (
                            <Image
                                src={getMusicJacketUrl(music.assetbundleName, assetSource)}
                                alt={music.title}
                                fill
                                sizes="96px"
                                className="object-cover"
                                unoptimized
                            />
                        )}

                        {/* Rank sits on the jacket: at five columns the info column is
                            too narrow to share a row with the score. */}
                        <div className={`absolute left-1 top-1 min-w-7 rounded-md3-xs bg-scrim/60 px-1.5 py-0.5 text-center type-label-l type-emphasized tabular-nums select-none ${getRankColor(rank)}`}>
                            #{rank}
                        </div>

                        {/* Difficulty Badge - Only show if not hidden */}
                        {!category.hideDifficulty && (
                            <div
                                className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md3-xs text-[9px] font-bold text-white shadow-elev-1"
                                style={{ backgroundColor: diffColor }}
                            >
                                {diffName} {level}
                            </div>
                        )}
                    </div>

                    {/* Info Section */}
                    <div className="flex-1 p-2 sm:p-3 flex flex-col justify-center min-w-0">
                        <h3 className="type-title-s text-on-surface truncate group-hover:text-primary transition-colors">
                            {music?.title || `Music ${meta.music_id}`}
                        </h3>
                        <p className="type-body-s text-on-surface-variant truncate mt-0.5">
                            {music?.composer}
                            {music?.composer !== music?.arranger && music?.arranger !== "-" && ` / ${music?.arranger}`}
                        </p>
                        {/* PSPI Score */}
                        <div className="mt-1.5 flex items-baseline gap-1">
                            <span className="type-title-l type-emphasized text-primary">{category.format(value)}</span>
                            <span className="type-label-s text-on-surface-variant">{t(category.subtitleKey)}</span>
                        </div>
                    </div>
                </div>
            </Link>
        );
    };

    // Ranking Section Component
    const RankingSection = ({ category }: { category: RankingCategory }) => {
        const isExpanded = expandedRankings.has(category.id);
        const itemCount = isExpanded ? expandedItemCount : defaultItemCount;
        const items = getTopItems(category.field, itemCount, category.dedupeBySong);

        return (
            <div className="mb-10">
                {/* Section Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Icon path={mdLeaderboard} size={24} className="text-primary" />
                        <h2 className="type-title-l text-on-surface">{t(category.titleKey)}</h2>
                        <span className="type-label-m text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-md3-xs">{t(category.subtitleKey)}</span>
                    </div>
                    <Button
                        variant="text"
                        size="xs"
                        trailingIcon={isExpanded ? mdKeyboardArrowUp : mdKeyboardArrowDown}
                        onClick={(e) => {
                            e.preventDefault();
                            toggleRankingExpand(category.id);
                        }}
                    >
                        {isExpanded ? t("page.musicMeta.collapse") : t("page.musicMeta.expandMore")}
                    </Button>
                </div>

                {/* Ranking Grid - Responsive: 1 col mobile, 2 sm, 3 lg, 5 xl */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    {items.map((meta, idx) => (
                        <RankingItem
                            key={`${category.id}-${meta.music_id}-${meta.difficulty}`}
                            meta={meta}
                            rank={idx + 1}
                            category={category}
                        />
                    ))}
                </div>
            </div>
        );
    };

    // Table Header Component
    const TableHeader = ({
        field, main, sub, center = false, className = "",
    }: {
        field: keyof IMusicMeta; main: string; sub?: string; center?: boolean; className?: string;
    }) => (
        <th
            className={`px-3 py-3 ${center ? "text-center" : "text-left"} cursor-pointer hover:bg-surface-container-highest transition-colors whitespace-nowrap bg-surface-container-high ${className}`}
            onClick={() => handleSort(field)}
        >
            <div className={`flex flex-col ${center ? "items-center" : "items-start"}`}>
                <span className="type-title-s text-on-surface">
                    {main}
                    {sortField === field && <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                </span>
                {sub && <span className="type-body-s text-on-surface-variant">{sub}</span>}
            </div>
        </th>
    );

    // Difficulty Badge Component
    const DifficultyBadge = ({ musicId, difficulty }: { musicId: number; difficulty: string }) => {
        const color = DIFFICULTY_COLORS[difficulty as MusicDifficultyType] || "#888";
        const name = DIFFICULTY_NAMES[difficulty as MusicDifficultyType] || difficulty.toUpperCase();
        const level = difficultyMap.get(`${musicId}-${difficulty}`) || "?";
        return (
            <div className="flex justify-center">
                <span className="w-[85px] sm:w-[120px] px-2 py-0.5 rounded-md3-xs text-xs font-bold text-white inline-flex items-center justify-center gap-1" style={{ backgroundColor: color }}>
                    <span className="hidden sm:inline">{name}</span>
                    <span className="opacity-90">Lv.{level}</span>
                </span>
            </div>
        );
    };

    // Pagination Component
    const Pagination = () => (
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 px-2">
            <div className="flex items-center gap-2 type-body-m text-on-surface-variant">
                <span>{t("page.musicMeta.pagination.perPagePrefix")}</span>
                <Select
                    value={pageSize}
                    onValueChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                    options={PAGE_SIZE_OPTIONS.map((size) => ({ value: size, label: String(size) }))}
                    aria-label={t("page.musicMeta.pagination.perPagePrefix")}
                    className="min-w-20"
                />
                <span>{t("page.musicMeta.pagination.perPageSuffix")}</span>
                <span className="ml-2">{t("page.musicMeta.pagination.total", { count: formatNumber(filteredMetas.length) })}</span>
            </div>
            <div className="flex items-center gap-1">
                <Button variant="outlined" size="xs" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>{t("page.musicMeta.pagination.first")}</Button>
                <Button variant="outlined" size="xs" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>{t("page.musicMeta.pagination.previous")}</Button>
                <span className="px-3 py-1 type-body-m text-on-surface-variant font-mono">{currentPage}/{totalPages || 1}</span>
                <Button variant="outlined" size="xs" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>{t("page.musicMeta.pagination.next")}</Button>
                <Button variant="outlined" size="xs" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}>{t("page.musicMeta.pagination.last")}</Button>
            </div>
        </div>
    );

    // PSPI Explanation Section
    const PSPIExplanation = () => (
        <div className="mt-12 p-6 bg-surface-card border border-outline-variant/70 rounded-md3-xl">
            <h2 className="type-title-l text-on-surface mb-4 flex items-center gap-2">
                <Icon path={mdHelp} size={24} className="text-primary" />
                {t("page.musicMeta.pspi.title")}
            </h2>
            <div className="space-y-4 text-on-surface-variant type-body-m">
                <p>
                    <strong>{t("page.musicMeta.pspi.term")}</strong>{t("page.musicMeta.pspi.descriptionAfterTerm")}
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 bg-surface-container-lowest rounded-md3-lg">
                        <h3 className="type-title-s text-on-surface mb-2">{t("page.musicMeta.pspi.teamTitle")}</h3>
                        <ul className="space-y-1 type-body-m">
                            <li>{t("page.musicMeta.pspi.soloAutoTeam")}</li>
                            <li>{t("page.musicMeta.pspi.multiTeam")}</li>
                        </ul>
                    </div>
                    <div className="p-4 bg-surface-container-lowest rounded-md3-lg">
                        <h3 className="type-title-s text-on-surface mb-2">{t("page.musicMeta.pspi.cyclesTitle")}</h3>
                        <ul className="space-y-1 type-body-m">
                            <li>{t("page.musicMeta.pspi.autoCycle")}</li>
                            <li>{t("page.musicMeta.pspi.multiCycle")}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );

    // Credits Section
    const CreditsSection = () => (
        <div className="mt-8 py-6 border-t border-outline-variant text-center">
            <div className="type-label-l text-on-surface-variant mb-2">{t("page.musicMeta.creditsTitle")}</div>
            <div className="text-center type-body-m text-on-surface-variant py-8">
                Meta Data Provided by <ExternalLink href="https://github.com/Sekai-World/sekai-viewer" target="_blank" rel="noopener noreferrer" className="text-on-surface hover:text-primary transition-colors">Sekai-World/sekai-viewer</ExternalLink> & <ExternalLink href="https://3-3.dev/" target="_blank" rel="noopener noreferrer" className="text-on-surface hover:text-primary transition-colors">xfl03</ExternalLink> & <ExternalLink href="https://github.com/NeuraXmy" target="_blank" rel="noopener noreferrer" className="text-on-surface hover:text-primary transition-colors">Luna</ExternalLink>
            </div>
        </div>
    );

    return (
        <PageContainer wide>
            <PageHeader
                eyebrow={t("page.musicMeta.badge")}
                title={t("page.musicMeta.title")}
                highlight={t("page.musicMeta.titleHighlight")}
                description={t("page.musicMeta.description")}
            />

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-8">
                <SegmentedButton
                    className="w-auto"
                    value={liveMode}
                    onValueChange={(v) => setLiveMode(v)}
                    options={LIVE_MODE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
                />
                <SegmentedButton
                    className="w-auto"
                    value={viewMode}
                    onValueChange={(v) => setViewMode(v)}
                    options={[
                        { value: "overview" as const, label: t("page.musicMeta.viewModes.overview") },
                        { value: "detailed" as const, label: t("page.musicMeta.viewModes.detailed") },
                    ]}
                />
            </div>

            {error && (
                <ErrorState className="mb-6" title={t("page.musicMeta.loadFailed")} message={error} />
            )}

            {isLoading ? (
                <LoadingState className="min-h-[30vh]" label={t("page.musicMeta.loading")} />
            ) : viewMode === "overview" ? (
                /* Overview Mode - Rankings */
                <div>
                    {rankingCategories.map((category) => (
                        <RankingSection key={category.id} category={category} />
                    ))}
                </div>
            ) : (
                /* Detailed Mode - Table */
                <>
                    <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between sticky top-[4.5rem] z-30 bg-surface-container p-4 rounded-md3-lg shadow-elev-1">
                        <div className="relative w-full sm:max-w-md">
                            <TextField
                                data-shortcut-search="true"
                                icon={mdSearch}
                                placeholder={t("page.musicMeta.searchPlaceholder")}
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-md3-lg border border-outline-variant bg-surface-container-lowest">
                        <table className="w-full type-body-m text-on-surface border-separate border-spacing-0">
                            <thead className="bg-surface-container-high">
                                <tr>
                                    <TableHeader field="music_id" main="ID" center className={`${enableStickyColumns ? 'sticky left-0 z-20' : ''} border-r border-outline-variant w-[45px] min-w-[45px] sm:w-[60px]`} />
                                    <TableHeader field="difficulty" main={t("page.musicMeta.table.difficulty")} center className={`${enableStickyColumns ? 'sticky left-[45px] sm:left-[60px] z-20 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]' : ''} border-r border-outline-variant w-[95px] min-w-[95px] sm:w-[140px]`} />
                                    <th className={`px-3 py-3 text-left type-title-s text-on-surface min-w-[180px] ${enableStickyColumns ? 'sticky left-[140px] sm:left-[200px] z-20 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]' : ''} bg-surface-container-high border-r border-outline-variant`}>{t("page.musicMeta.table.songName")}</th>
                                    <TableHeader field="music_time" main={t("page.musicMeta.table.duration")} sub={t("page.musicMeta.units.seconds")} center className="w-[80px]" />
                                    <TableHeader field="event_rate" main={t("page.musicMeta.table.eventRate")} center className="w-[100px]" />
                                    <TableHeader field="base_score" main={t("page.musicMeta.table.baseScore")} center className="min-w-[100px]" />
                                    <TableHeader field="fever_score" main="Fever" center className="min-w-[100px]" />
                                    {modeFields.cycles && <TableHeader field={modeFields.cycles} main={t("page.musicMeta.table.cycles")} sub={t("page.musicMeta.table.baseCycles")} center className="min-w-[90px]" />}
                                    <TableHeader field={modeFields.score} main={t("page.musicMeta.table.score")} sub={t("page.musicMeta.units.pspi")} center className="min-w-[100px]" />
                                    <TableHeader field={modeFields.pt} main={t("page.musicMeta.table.eventPt")} sub={t("page.musicMeta.units.pspi")} center className="min-w-[100px]" />
                                    {modeFields.hourly && <TableHeader field={modeFields.hourly} main={t("page.musicMeta.table.hourly")} sub={t("page.musicMeta.units.pspi")} center className="min-w-[100px]" />}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedMetas.map((meta, idx) => {
                                    const rowBgClass = idx % 2 === 0 ? "bg-surface-container-lowest" : "bg-surface-container-low";
                                    const music = musicMap.get(meta.music_id);
                                    return (
                                        <tr key={`${meta.music_id}-${meta.difficulty}`} className="transition-colors group">
                                            <td className={`px-3 py-3 font-mono text-on-surface-variant text-center ${enableStickyColumns ? 'sticky left-0 z-10' : ''} border-r border-outline-variant ${rowBgClass}`}>{meta.music_id}</td>
                                            <td className={`px-3 py-3 ${enableStickyColumns ? 'sticky left-[45px] sm:left-[60px] z-10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]' : ''} border-r border-outline-variant ${rowBgClass}`}><DifficultyBadge musicId={meta.music_id} difficulty={meta.difficulty} /></td>
                                            <td className={`px-3 py-3 ${enableStickyColumns ? 'sticky left-[140px] sm:left-[200px] z-10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]' : ''} border-r border-outline-variant ${rowBgClass}`}>
                                                <Link href={`/music/${meta.music_id}`} className="text-on-surface group-hover:text-primary font-medium transition-colors line-clamp-1" title={music?.title}>
                                                    {music?.title || `Music ${meta.music_id}`}
                                                </Link>
                                            </td>
                                            <td className={`px-3 py-3 text-on-surface-variant font-mono text-center ${rowBgClass}`}>{meta.music_time.toFixed(1)}</td>
                                            <td className={`px-3 py-3 text-on-surface-variant font-mono text-center ${rowBgClass}`}>{meta.event_rate}%</td>
                                            <td className={`px-3 py-3 text-on-surface-variant font-mono text-center ${rowBgClass}`}>{(meta.base_score * 100).toFixed(2)}%</td>
                                            <td className={`px-3 py-3 text-on-surface-variant font-mono text-center ${rowBgClass}`}>{(meta.fever_score * 100).toFixed(2)}%</td>
                                            {modeFields.cycles && <td className={`px-3 py-3 text-on-surface-variant font-mono text-center ${rowBgClass}`}>{(meta[modeFields.cycles] as number).toFixed(1)}</td>}
                                            <td className={`px-3 py-3 text-on-surface-variant font-mono text-center ${rowBgClass}`}>{(meta[modeFields.score] as number).toFixed(1)}</td>
                                            <td className={`px-3 py-3 text-on-surface-variant font-mono text-center ${rowBgClass}`}>{(meta[modeFields.pt] as number).toFixed(1)}</td>
                                            {modeFields.hourly && <td className={`px-3 py-3 text-on-surface-variant font-mono text-center ${rowBgClass}`}>{(meta[modeFields.hourly] as number).toFixed(1)}</td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <Pagination />
                </>
            )}

            {/* PSPI Explanation & Credits */}
            <PSPIExplanation />
            <CreditsSection />
        </PageContainer>
    );
}

function MusicMetaFallback() {
    const { t } = useI18n();

    return <>{t("page.musicMeta.loadingFallback")}</>;
}

export default function MusicMetaClient() {
    return (
        <MainLayout>
            <Suspense
                fallback={
                    <LoadingState label={<MusicMetaFallback />} />
                }
            >
                <MusicMetaContent />
            </Suspense>
        </MainLayout>
    );
}
