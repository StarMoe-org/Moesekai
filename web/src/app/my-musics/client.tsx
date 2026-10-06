"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "@/components/LocalizedLink";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import MyMusicFilters from "@/components/music/MyMusicFilters";
import Best30ShareImage from "@/components/music/Best30ShareImage";
import { TranslatedText } from "@/components/common/TranslatedText";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { loadTranslations, TranslationData } from "@/lib/translations";
import { replaceAssetSourceRegion, useTheme } from "@/contexts/ThemeContext";
import { getMusicJacketUrl, getCharacterIconUrl } from "@/lib/assets";
import {
    getAccounts,
    getActiveAccount,
    setActiveAccount,
    getCachedAvatarUrl,
    fetchAccountGameData,
    normalizeAccountDataError,
    getTopCharacterId,
    type AccountDataErrorCode,
    type MoesekaiAccount,
} from "@/lib/account";

import AccountSelectorBar from "@/components/AccountSelectorBar";
import QuickBindForm from "@/components/QuickBindForm";
import {
    MusicTagType,
    MusicCategoryType,
    IMusicTagInfo,
    IMusicCategoryInfo,
    IMusicInfo,
    normalizeMusicsData,
} from "@/types/music";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { fetchSongConstants, buildSongConstantsMap } from "@/lib/songConstants";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { Banner, Button, EmptyState, ErrorState, Icon, LoadMore, LoadingState, PageContainer, PageHeader, Surface, cn } from "@/components/md3";
import { mdImage, mdKeyboardArrowDown, mdLibraryMusic } from "@/components/md3/icons";

// ==================== Types ====================

interface Music {
    id: number;
    title: string;
    publishedAt: number;
    assetbundleName: string;
    composer: string;
    pronunciation: string;
    categories: string[];
}

interface MusicDifficulty {
    musicId: number;
    musicDifficulty: string;
    playLevel: number;
}

interface RawUserMusicResult {
    musicId?: number | string;
    musicDifficultyType?: string;
    musicDifficulty?: string;
    playResult?: string;
    fullPerfectFlg?: boolean;
    fullComboFlg?: boolean;
}

interface RawUserMusicDifficultyStatus extends RawUserMusicResult {
    userMusicResults?: RawUserMusicResult[];
}

interface RawUserMusic {
    musicId?: number | string;
    userMusicDifficultyStatuses?: RawUserMusicDifficultyStatus[];
    userMusicResults?: RawUserMusicResult[];
}

type PlayResult = "AP" | "FC" | "C" | "";

const PLAY_RESULT_PRIORITY: Record<PlayResult, number> = {
    "": 0,
    C: 1,
    FC: 2,
    AP: 3,
};

function parseUploadTimeToDate(uploadTime: string | number): Date | null {
    if (typeof uploadTime === "number") {
        if (!Number.isFinite(uploadTime)) return null;
        const normalized = uploadTime < 1_000_000_000_000 ? uploadTime * 1000 : uploadTime;
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = String(uploadTime).trim();
    if (!text) return null;

    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
        const normalized = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getUserErrorMessageKey(code: AccountDataErrorCode): string {
    switch (code) {
        case "API_NOT_PUBLIC":
            return "common.accountDataErrors.apiNotPublic";
        case "NOT_FOUND":
            return "common.accountDataErrors.notFound";
        case "OAUTH_REAUTH_REQUIRED":
            return "common.accountDataErrors.oauthReauthRequired";
        case "OAUTH_ACCESS_FAILED":
            return "common.accountDataErrors.oauthAccessFailed";
        case "NETWORK_ERROR":
        default:
            return "common.accountDataErrors.networkError";
    }
}


function parseMusicId(value: number | string | undefined, fallback?: number): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
    return null;
}

function normalizeDifficulty(value: string | undefined | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    return normalized || null;
}

function normalizePlayResult(result: Pick<RawUserMusicResult, "playResult" | "fullPerfectFlg" | "fullComboFlg">): PlayResult {
    if (result.fullPerfectFlg) return "AP";

    const playResult = result.playResult?.toLowerCase();
    if (playResult === "full_perfect" || playResult === "all_perfect" || playResult === "ap") {
        return "AP";
    }

    if (result.fullComboFlg) return "FC";
    if (playResult === "full_combo" || playResult === "fc") {
        return "FC";
    }

    if (playResult === "clear" || playResult === "c") {
        return "C";
    }

    return "";
}

function upsertMusicResult(
    resultsMap: Map<number, Record<string, PlayResult>>,
    musicId: number,
    difficulty: string,
    rank: PlayResult
): void {
    if (!rank) return;

    if (!resultsMap.has(musicId)) {
        resultsMap.set(musicId, {});
    }

    const entry = resultsMap.get(musicId)!;
    const current = entry[difficulty] || "";
    if (PLAY_RESULT_PRIORITY[rank] > PLAY_RESULT_PRIORITY[current]) {
        entry[difficulty] = rank;
    }
}

function addRawResultsToMap(
    resultsMap: Map<number, Record<string, PlayResult>>,
    rawResults: RawUserMusicResult[],
    fallbackMusicId?: number,
    fallbackDifficulty?: string
): void {
    for (const rawResult of rawResults) {
        const musicId = parseMusicId(rawResult.musicId, fallbackMusicId);
        const difficulty = normalizeDifficulty(
            rawResult.musicDifficultyType || rawResult.musicDifficulty || fallbackDifficulty
        );
        const rank = normalizePlayResult(rawResult);

        if (musicId === null || !difficulty || !rank) continue;
        upsertMusicResult(resultsMap, musicId, difficulty, rank);
    }
}

function parseTopLevelMusicResults(data: unknown): Map<number, Record<string, PlayResult>> {
    const resultsMap = new Map<number, Record<string, PlayResult>>();

    if (Array.isArray(data)) {
        addRawResultsToMap(resultsMap, data as RawUserMusicResult[]);
        return resultsMap;
    }

    if (!data || typeof data !== "object") {
        return resultsMap;
    }

    const topLevelResults = (data as { userMusicResults?: unknown }).userMusicResults;
    if (Array.isArray(topLevelResults)) {
        addRawResultsToMap(resultsMap, topLevelResults as RawUserMusicResult[]);
    }

    return resultsMap;
}

function parseLegacyMusicResults(data: unknown): Map<number, Record<string, PlayResult>> {
    const resultsMap = new Map<number, Record<string, PlayResult>>();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return resultsMap;
    }

    const userMusics = (data as { userMusics?: unknown }).userMusics;
    if (!Array.isArray(userMusics)) {
        return resultsMap;
    }

    for (const music of userMusics as RawUserMusic[]) {
        const musicId = parseMusicId(music.musicId);
        if (musicId === null) continue;

        if (Array.isArray(music.userMusicResults)) {
            addRawResultsToMap(resultsMap, music.userMusicResults, musicId);
        }

        const diffStatuses = Array.isArray(music.userMusicDifficultyStatuses)
            ? music.userMusicDifficultyStatuses
            : [];

        for (const diffStatus of diffStatuses) {
            const statusDifficulty = normalizeDifficulty(
                diffStatus.musicDifficultyType || diffStatus.musicDifficulty
            );

            // Some legacy payloads store clear/fc/ap directly on difficulty status.
            addRawResultsToMap(
                resultsMap,
                [diffStatus],
                musicId,
                statusDifficulty || undefined
            );

            const nestedResults = Array.isArray(diffStatus.userMusicResults)
                ? diffStatus.userMusicResults
                : [];
            addRawResultsToMap(
                resultsMap,
                nestedResults,
                musicId,
                statusDifficulty || undefined
            );
        }
    }

    return resultsMap;
}

function mergeFallbackMusicResults(
    primaryResultsMap: Map<number, Record<string, PlayResult>>,
    fallbackResultsMap: Map<number, Record<string, PlayResult>>
): Map<number, Record<string, PlayResult>> {
    fallbackResultsMap.forEach((fallbackEntry, musicId) => {
        const primaryEntry = primaryResultsMap.get(musicId);
        if (!primaryEntry) {
            primaryResultsMap.set(musicId, { ...fallbackEntry });
            return;
        }

        Object.entries(fallbackEntry).forEach(([difficulty, rank]) => {
            if (!primaryEntry[difficulty]) {
                primaryEntry[difficulty] = rank;
            }
        });
    });

    return primaryResultsMap;
}

// ==================== Main Component ====================

function MyMusicsContent() {
    const { t, formatDate } = useI18n();
    // Theme context for asset source
    const { assetSource } = useTheme();
    const searchParams = useSearchParams();

    // Account state
    const [accounts, setAccountsList] = useState<MoesekaiAccount[]>([]);
    const [activeAccount, setActiveAcc] = useState<MoesekaiAccount | null>(null);

    // Data state
    const [allMusics, setAllMusics] = useState<Music[]>([]);
    const [musicDifficulties, setMusicDifficulties] = useState<MusicDifficulty[]>([]);
    const [musicTags, setMusicTags] = useState<IMusicTagInfo[]>([]);
    const [userMusicResults, setUserMusicResults] = useState<Map<number, Record<string, PlayResult>>>(new Map());
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [songConstantsMap, setSongConstantsMap] = useState<Record<number, Record<string, number>>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isFetchingUser, setIsFetchingUser] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userError, setUserError] = useState<AccountDataErrorCode | null>(null);
    const [uploadTime, setUploadTime] = useState<string | number | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);
    const [best30Expanded, setBest30Expanded] = useState(false);
    const [showBest30Share, setShowBest30Share] = useState(false);

    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDifficulty, setSelectedDifficulty] = useState<string>("master");
    const [selectedTag, setSelectedTag] = useState<MusicTagType>("all");
    const [selectedCategories, setSelectedCategories] = useState<MusicCategoryType[]>([]);
    const [sortBy, setSortBy] = useState<"publishedAt" | "id" | "level" | "completion" | "constant">("level");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [completionFilter, setCompletionFilter] = useState<"all" | "no_fc" | "no_ap">("all");

    // Pagination with scroll restoration
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "my-musics",
        defaultDisplayCount: 30,
        increment: 30,
        isReady: !isLoading && !isFetchingUser,
    });

    // Storage key
    const STORAGE_KEY = "my_musics_filters";

    // Initialize from URL params first, then fallback to sessionStorage
    useEffect(() => {
        const tag = searchParams.get("tag");
        const categories = searchParams.get("categories");
        const difficulty = searchParams.get("difficulty");
        const search = searchParams.get("search");
        const sort = searchParams.get("sortBy");
        const order = searchParams.get("sortOrder");
        const completion = searchParams.get("completion");

        const hasUrlParams = tag || categories || difficulty || search || sort || order || completion;

        if (hasUrlParams) {
            if (tag) setSelectedTag(tag as MusicTagType);
            if (categories) setSelectedCategories(categories.split(",") as MusicCategoryType[]);
            if (difficulty) setSelectedDifficulty(difficulty);
            if (search) setSearchQuery(search);
            if (sort) setSortBy(sort as "publishedAt" | "id" | "level" | "completion" | "constant");
            if (order) setSortOrder(order as "asc" | "desc");
            if (completion) setCompletionFilter(completion as "all" | "no_fc" | "no_ap");
        } else {
            try {
                const saved = sessionStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const filters = JSON.parse(saved);
                    if (filters.tag) setSelectedTag(filters.tag);
                    if (filters.categories?.length) setSelectedCategories(filters.categories);
                    if (filters.difficulty) setSelectedDifficulty(filters.difficulty);
                    if (filters.search) setSearchQuery(filters.search);
                    if (filters.sortBy) setSortBy(filters.sortBy);
                    if (filters.sortOrder) setSortOrder(filters.sortOrder);
                    if (filters.completionFilter) setCompletionFilter(filters.completionFilter);
                }
            } catch (_e) {
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
            difficulty: selectedDifficulty,
            search: searchQuery,
            sortBy,
            sortOrder,
            completionFilter,
        };

        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        } catch (_e) {
            console.log("Could not save filters to sessionStorage");
        }

        const params = new URLSearchParams();
        if (selectedTag !== "all") params.set("tag", selectedTag);
        if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
        if (selectedDifficulty !== "master") params.set("difficulty", selectedDifficulty);
        if (searchQuery) params.set("search", searchQuery);
        if (sortBy !== "level") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        if (completionFilter !== "all") params.set("completion", completionFilter);
        replaceCurrentUrlSearchParams(params);
    }, [selectedTag, selectedCategories, selectedDifficulty, searchQuery, sortBy, sortOrder, completionFilter, filtersInitialized]);

    // Load accounts
    useEffect(() => {
        const accs = getAccounts();
        setAccountsList(accs);
        const active = getActiveAccount();
        setActiveAcc(active);
    }, []);

    // Fetch masterdata when account changes
    useEffect(() => {
        if (!activeAccount) {
            setIsLoading(false);
            return;
        }

        let cancelled = false;

        async function loadMasterData() {
            setIsLoading(true);
            setError(null);

            try {
                const server = activeAccount!.server;

                const [musicsData, categoriesData, difficultiesData, tagsData, translationsData] = await Promise.all([
                    fetchMasterDataForServer<Music[]>(server, "musics.json"),
                    fetchMasterDataForServer<IMusicCategoryInfo[]>(server, "musicCategories.json").catch(() => [] as IMusicCategoryInfo[]),
                    fetchMasterDataForServer<MusicDifficulty[]>(server, "musicDifficulties.json"),
                    fetchMasterDataForServer<IMusicTagInfo[]>(server, "musicTags.json"),
                    loadTranslations(),
                ]);

                if (cancelled) return;

                const normalizedMusicsData = normalizeMusicsData(musicsData as unknown as IMusicInfo[], categoriesData) as unknown as Music[];

                setAllMusics(normalizedMusicsData);
                setMusicDifficulties(difficultiesData);
                setMusicTags(tagsData);
                setTranslations(translationsData);

                // Fetch song constants (non-blocking)
                fetchSongConstants().then(entries => {
                    setSongConstantsMap(buildSongConstantsMap(entries));
                }).catch(err => {
                    console.warn("Failed to load song constants:", err);
                });
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : t("page.myMusics.loadDataFailed"));
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadMasterData();
        return () => { cancelled = true; };
    }, [activeAccount, t]);

    // Fetch user music results from suite API
    useEffect(() => {
        if (!activeAccount) {
            setUserMusicResults(new Map());
            return;
        }

        let cancelled = false;

        async function fetchUserMusics() {
            setIsFetchingUser(true);
            setUserError(null);

            try {
                const data = await fetchAccountGameData(activeAccount!, ["userMusics", "userMusicResults", "upload_time"]);

                if (typeof data.upload_time === "number" || typeof data.upload_time === "string") {
                    setUploadTime(data.upload_time);
                } else {
                    setUploadTime(null);
                }

                // New payload: top-level userMusicResults
                const topLevelResultsMap = parseTopLevelMusicResults(data);
                const topLevelCount = topLevelResultsMap.size;

                // Legacy payload fallback: userMusics nested structures
                const legacyResultsMap = parseLegacyMusicResults(data);
                const legacyCount = legacyResultsMap.size;

                // Keep top-level as source-of-truth, fill missing difficulties from legacy payload.
                const mergedResultsMap = mergeFallbackMusicResults(topLevelResultsMap, legacyResultsMap);

                console.log(
                    `[MyMusics] Loaded ${mergedResultsMap.size} music results from API (top-level: ${topLevelCount}, legacy fallback: ${legacyCount})`
                );
                if (!cancelled) setUserMusicResults(mergedResultsMap);
            } catch (error) {
                if (!cancelled) setUserError(normalizeAccountDataError(error));
            } finally {
                if (!cancelled) setIsFetchingUser(false);
            }
        }

        fetchUserMusics();
        return () => { cancelled = true; };
    }, [activeAccount]);

    // Build difficulty map
    const musicDifficultiesMap = useMemo(() => {
        const map: Record<number, Record<string, number>> = {};
        musicDifficulties.forEach(d => {
            if (!map[d.musicId]) map[d.musicId] = {};
            map[d.musicId]![d.musicDifficulty] = d.playLevel;
        });
        return map;
    }, [musicDifficulties]);

    // Filter and sort
    const filteredMusics = useMemo(() => {
        let result = [...allMusics];
        const now = Date.now();

        // Filter released only
        result = result.filter(m => m.publishedAt <= now);

        // Tag filter
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

        // Category filter
        if (selectedCategories.length > 0) {
            result = result.filter((m) =>
                selectedCategories.every((cat) => (m.categories ?? []).includes(cat))
            );
        }

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const qNum = parseInt(q, 10);
            result = result.filter(m => {
                if (m.id === qNum) return true;
                if (m.title.toLowerCase().includes(q)) return true;
                const cn = translations?.music?.title?.[m.title];
                if (cn && cn.toLowerCase().includes(q)) return true;
                return false;
            });
        }

        // Completion filter
        if (completionFilter !== "all" && userMusicResults.size > 0) {
            const diff = selectedDifficulty;
            result = result.filter(m => {
                const rank = userMusicResults.get(m.id)?.[diff] || "";
                if (completionFilter === "no_fc") return rank !== "AP" && rank !== "FC";
                if (completionFilter === "no_ap") return rank !== "AP";
                return true;
            });
        }

        // Sort
        result.sort((a, b) => {
            let cmp = 0;
            if (sortBy === "level") {
                // Sort by level first, then by completion
                const levelA = musicDifficultiesMap[a.id]?.[selectedDifficulty] || 0;
                const levelB = musicDifficultiesMap[b.id]?.[selectedDifficulty] || 0;
                cmp = levelA - levelB;
                if (cmp === 0) {
                    // Same level, sort by completion (AP > FC > C > incomplete)
                    const rankA = userMusicResults.get(a.id)?.[selectedDifficulty] || "";
                    const rankB = userMusicResults.get(b.id)?.[selectedDifficulty] || "";
                    const priority: Record<string, number> = { "": 0, "C": 1, "FC": 2, "AP": 3 };
                    cmp = priority[rankB] - priority[rankA]; // Reverse for high to low
                }
            } else if (sortBy === "constant") {
                const constA = songConstantsMap[a.id]?.[selectedDifficulty] || 0;
                const constB = songConstantsMap[b.id]?.[selectedDifficulty] || 0;
                cmp = constA - constB;
                if (cmp === 0) cmp = a.publishedAt - b.publishedAt;
            } else if (sortBy === "completion") {
                // Sort by completion status (AP > FC > C > incomplete)
                const rankA = userMusicResults.get(a.id)?.[selectedDifficulty] || "";
                const rankB = userMusicResults.get(b.id)?.[selectedDifficulty] || "";
                const priority: Record<string, number> = { "": 0, "C": 1, "FC": 2, "AP": 3 };
                cmp = priority[rankA] - priority[rankB];
                if (cmp === 0) cmp = a.publishedAt - b.publishedAt;
            } else if (sortBy === "publishedAt") {
                cmp = a.publishedAt - b.publishedAt;
                if (cmp === 0) cmp = a.id - b.id;
            } else if (sortBy === "id") {
                cmp = a.id - b.id;
            }
            return sortOrder === "asc" ? cmp : -cmp;
        });

        return result;
    }, [
        allMusics,
        musicTags,
        selectedTag,
        selectedCategories,
        searchQuery,
        completionFilter,
        selectedDifficulty,
        sortBy,
        sortOrder,
        userMusicResults,
        musicDifficultiesMap,
        translations,
        songConstantsMap,
    ]);

    // Progress stats
    const progressStats = useMemo(() => {
        if (userMusicResults.size === 0) return null;

        const diff = selectedDifficulty;
        const now = Date.now();
        let ap = 0, fc = 0, clear = 0, total = 0;

        for (const music of allMusics) {
            if (music.publishedAt > now) continue;
            if (musicDifficultiesMap[music.id]?.[diff] !== undefined) {
                total++;
                const rank = userMusicResults.get(music.id)?.[diff] || "";
                if (rank === "AP") { ap++; fc++; clear++; }
                else if (rank === "FC") { fc++; clear++; }
                else if (rank === "C") { clear++; }
            }
        }

        return { ap, fc, clear, total };
    }, [allMusics, selectedDifficulty, userMusicResults, musicDifficultiesMap]);

    // Best30 calculation
    const best30Data = useMemo(() => {
        if (userMusicResults.size === 0 || Object.keys(songConstantsMap).length === 0) return null;

        const allDiffs = ["easy", "normal", "hard", "expert", "master", "append"];
        const entries: Array<{ musicId: number; difficulty: string; constant: number; userConstant: number; playResult: PlayResult; title: string; assetbundleName: string }> = [];

        for (const music of allMusics) {
            for (const diff of allDiffs) {
                const constant = songConstantsMap[music.id]?.[diff];
                if (constant === undefined) continue;

                const playResult = userMusicResults.get(music.id)?.[diff] || "";
                // Only AP and FC count
                if (playResult !== "AP" && playResult !== "FC") continue;

                let userConstant: number;
                if (playResult === "AP") {
                    userConstant = constant;
                } else {
                    // FC: ≤3 →-1, <33 →-1.5
                    userConstant = constant >= 33 ? constant - 1 : constant - 1.5;
                }

                entries.push({
                    musicId: music.id,
                    difficulty: diff,
                    constant,
                    userConstant,
                    playResult: playResult as PlayResult,
                    title: music.title,
                    assetbundleName: music.assetbundleName,
                });
            }
        }

        // Sort by userConstant descending
        entries.sort((a, b) => b.userConstant - a.userConstant);

        const top30 = entries.slice(0, 30);
        const average = top30.length > 0
            ? top30.reduce((sum, e) => sum + e.userConstant, 0) / top30.length
            : 0;

        return { entries: top30, average };
    }, [allMusics, userMusicResults, songConstantsMap]);

    // Displayed musics with level separators
    const displayedMusicsWithSeparators = useMemo(() => {
        const musics = filteredMusics.slice(0, displayCount);
        if (sortBy !== "level" && sortBy !== "constant") {
            return musics.map(m => ({ type: 'music' as const, data: m }));
        }

        // Group by level and insert separators
        const result: Array<{ type: 'music' | 'separator', data: Music | { level: number, difficulty: string } }> = [];
        let lastLevel: number | null = null;

        for (const music of musics) {
            const rawLevel = sortBy === "constant"
                ? (songConstantsMap[music.id]?.[selectedDifficulty] || 0)
                : (musicDifficultiesMap[music.id]?.[selectedDifficulty] || 0);
            // For constant sorting, group by integer level only
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

    const resetFilters = useCallback(() => {
        setSearchQuery("");
        setSelectedDifficulty("master");
        setSelectedTag("all");
        setSelectedCategories([]);
        setSortBy("level");
        setSortOrder("desc");
        setCompletionFilter("all");
        resetDisplayCount();
    }, [resetDisplayCount]);

    const handleAccountSelect = useCallback((acc: MoesekaiAccount) => {
        setActiveAccount(acc.id);
        setActiveAcc(acc);
    }, []);

    const getMusicThumbnailUrl = useCallback((music: Music): string => {
        const finalAssetSource = activeAccount
            ? replaceAssetSourceRegion(assetSource, activeAccount.server)
            : assetSource;

        return getMusicJacketUrl(music.assetbundleName, finalAssetSource);
    }, [assetSource, activeAccount]);

    const quickFilterContent = (
        <MyMusicFilters
            selectedTag={selectedTag}
            onTagChange={setSelectedTag}
            selectedCategories={selectedCategories}
            onCategoryChange={setSelectedCategories}
            selectedDifficulty={selectedDifficulty}
            onDifficultyChange={setSelectedDifficulty}
            completionFilter={completionFilter}
            onCompletionFilterChange={setCompletionFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(newSortBy, newSortOrder) => {
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
            }}
            onReset={resetFilters}
            totalMusics={allMusics.length}
            filteredMusics={filteredMusics.length}
            hasUserData={userMusicResults.size > 0}
        />
    );

    useQuickFilter(t("page.myMusics.filterTitle"), quickFilterContent, [
        selectedTag,
        selectedCategories,
        selectedDifficulty,
        completionFilter,
        searchQuery,
        sortBy,
        sortOrder,
        allMusics.length,
        filteredMusics.length,
        userMusicResults.size,
    ]);

    // No account state
    if (accounts.length === 0) {
        return (
            <PageContainer className="max-w-3xl">
                <MyMusicsHeader />
                <QuickBindForm
                    onAccountAdded={() => {
                        setAccountsList(getAccounts());
                        const active = getActiveAccount();
                        setActiveAcc(active);
                    }}
                    description={t("page.myMusics.quickBindDescription")}
                    returnTo="/my-musics"
                />

            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <MyMusicsHeader />

            {/* Account Selector */}
            <AccountSelectorBar
                accounts={accounts}
                activeAccount={activeAccount}
                onSelect={handleAccountSelect}
                onAccountAdded={() => {
                    setAccountsList(getAccounts());
                    const active = getActiveAccount();
                    setActiveAcc(active);
                }}
                returnTo="/my-musics"
            />


            {/* User Error */}
            {userError && (
                <Banner tone="error" title={t(getUserErrorMessageKey(userError))} className="mb-4">
                    <ExternalLink href="https://haruki.seiunx.com" className="mt-1 inline-block rounded-md3-xs underline focus-ring">
                        {t("common.account.goHaruki")}
                    </ExternalLink>
                </Banner>
            )}

            {/* Progress Bar */}
            {!isLoading && !isFetchingUser && userMusicResults.size > 0 && progressStats && (
                <Surface tone="low" radius="lg" className="mb-6 p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="type-title-s text-on-surface">
                                {t("common.progress.completionProgress", { difficulty: selectedDifficulty.toUpperCase() })}
                            </span>
                            {uploadTime && (
                                <span className="type-label-s text-on-surface-variant" title={t("common.data.uploadTimeTitle")}>
                                    {t("common.data.dataTime", { time: formatDate(parseUploadTimeToDate(uploadTime) ?? uploadTime, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) })}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-4 type-label-l text-on-surface">
                        <div className="flex items-center gap-1">
                            <Image src="/data/music/icon_clear.png" alt="Clear" width={20} height={20} className="drop-shadow-sm" />
                            <span>{progressStats.clear} / {progressStats.total}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Image src="/data/music/icon_fullCombo.png" alt="FC" width={20} height={20} className="drop-shadow-sm" />
                            <span>{progressStats.fc} / {progressStats.total}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Image src="/data/music/icon_allPerfect.png" alt="AP" width={20} height={20} className="drop-shadow-sm" />
                            <span>{progressStats.ap} / {progressStats.total}</span>
                        </div>
                    </div>
                </Surface>
            )}

            {/* Best30 Card */}
            {!isLoading && !isFetchingUser && best30Data && best30Data.entries.length > 0 && (
                <Surface tone="low" radius="lg" className="mb-6 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 p-2 pl-2">
                        <button
                            type="button"
                            aria-expanded={best30Expanded}
                            className="state-layer focus-ring flex flex-1 cursor-pointer flex-wrap items-center gap-3 rounded-md3-md px-2 py-1 text-left"
                            onClick={() => setBest30Expanded(!best30Expanded)}
                        >
                            <span className="type-title-s text-on-surface">{t("page.myMusics.best30")}</span>
                            <span className="type-headline-s text-primary">{best30Data.average.toFixed(2)}</span>
                            <span className="type-label-s text-on-surface-variant">{t("page.myMusics.communityConstantHint")}</span>
                            <Icon
                                path={mdKeyboardArrowDown}
                                size={20}
                                className={cn("text-on-surface-variant transition-transform duration-200 ease-md3-standard", best30Expanded && "rotate-180")}
                            />
                        </button>
                        <Button variant="tonal" size="xs" icon={mdImage} onClick={() => setShowBest30Share(true)}>
                            {t("common.action.share")}
                        </Button>
                    </div>
                    {best30Expanded && (
                        <div className="grid grid-cols-1 border-t border-outline-variant sm:grid-cols-2">
                            {best30Data.entries.map((entry, idx) => (
                                <Link
                                    key={`${entry.musicId}-${entry.difficulty}`}
                                    href={`/music/${entry.musicId}`}
                                    className="state-layer focus-ring flex items-center gap-2 border-b border-r border-outline-variant/50 px-3 py-1.5"
                                >
                                    <span className="w-5 text-right type-label-s text-on-surface-variant">#{idx + 1}</span>
                                    <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-md3-xs">
                                        <Image
                                            src={getMusicThumbnailUrl({ assetbundleName: entry.assetbundleName } as Music)}
                                            alt=""
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate type-label-m text-on-surface">{entry.title}</div>
                                    </div>
                                    <span className={`rounded-md3-xs px-1 py-0.5 text-[9px] font-bold uppercase ${entry.difficulty === 'master' ? 'bg-purple-100 text-purple-600' :
                                        entry.difficulty === 'append' ? 'bg-pink-100 text-pink-600' :
                                            entry.difficulty === 'expert' ? 'bg-red-100 text-red-600' :
                                                'bg-surface-container-high text-on-surface-variant'
                                        }`}>
                                        {entry.difficulty.slice(0, 3)}
                                    </span>
                                    <Image
                                        src={entry.playResult === 'AP' ? '/data/music/icon_allPerfect.png' : '/data/music/icon_fullCombo.png'}
                                        alt={entry.playResult}
                                        width={14}
                                        height={14}
                                        className="drop-shadow-sm flex-shrink-0"
                                    />
                                    <div className="w-10 flex-shrink-0 text-right">
                                        <div className="type-label-m text-primary">{entry.userConstant.toFixed(1)}</div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </Surface>
            )}

            {/* Best30 Share Image Modal */}
            {showBest30Share && best30Data && activeAccount && (
                <Best30ShareImage
                    entries={best30Data.entries}
                    average={best30Data.average}
                    gameId={activeAccount.gameId}
                    serverLabel={t(`common.server.${activeAccount.server}`)}
                    getMusicThumbnailUrl={(entry) => getMusicThumbnailUrl({ assetbundleName: entry.assetbundleName } as Music)}
                    avatarUrl={
                        getCachedAvatarUrl(activeAccount.id) ||
                        getCharacterIconUrl(
                            activeAccount.userCharacters
                                ? getTopCharacterId(activeAccount.userCharacters)
                                : 21
                        )
                    }
                    nickname={activeAccount.userGamedata?.name || activeAccount.nickname || undefined}
                    uploadTime={uploadTime || undefined}
                    onClose={() => setShowBest30Share(false)}
                />
            )}

            {/* Error */}
            {error && (
                <ErrorState
                    title={t("common.state.loadingFailed")}
                    message={error}
                    retryLabel={t("common.action.retry")}
                    className="mb-6"
                />
            )}

            {/* Filters live in the global FilterDrawer (registered above via
                useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {isLoading || isFetchingUser ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="animate-pulse overflow-hidden rounded-md3-md bg-surface-container-low">
                                <div className="aspect-square bg-surface-container-high" />
                            </div>
                        ))}
                    </div>
                ) : filteredMusics.length === 0 ? (
                    <EmptyState icon={mdLibraryMusic} title={t("page.myMusics.noResult")} />
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                        {displayedMusicsWithSeparators.map((item, _index) => {
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
                                const music = item.data as Music;
                                return (
                                    <MusicItem
                                        key={music.id}
                                        music={music}
                                        difficulties={musicDifficultiesMap[music.id] || {}}
                                        results={userMusicResults.get(music.id) || {}}
                                        thumbnailUrl={getMusicThumbnailUrl(music)}
                                        hasUserData={userMusicResults.size > 0}
                                        selectedDifficulty={selectedDifficulty}
                                        constant={songConstantsMap[music.id]?.[selectedDifficulty]}
                                        sortBy={sortBy}
                                    />
                                );
                            }
                        })}
                    </div>
                )}

                {/* Load More / All loaded */}
                {!isLoading && (
                    <LoadMore
                        label={t("page.myMusics.loadMore")}
                        shown={displayedMusicsWithSeparators.filter(i => i.type === 'music').length}
                        total={filteredMusics.length}
                        onLoadMore={loadMore}
                        allLoadedLabel={t("page.myMusics.allLoaded", { count: filteredMusics.length })}
                    />
                )}
            </div>
        </PageContainer>
    );
}

// ==================== Sub Components ====================

function LevelSeparatorCard({ level, difficulty }: { level: number; difficulty: string }) {
    // Difficulty color mapping
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
        <div className={`flex aspect-square flex-col items-center justify-center rounded-md3-md bg-gradient-to-br shadow-elev-1 ${gradientClass}`}>
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

function MyMusicsHeader() {
    const { t } = useI18n();
    return (
        <PageHeader
            align="center"
            eyebrow={t("page.myMusics.badge")}
            title={t("page.myMusics.title")}
            highlight={t("page.myMusics.titleHighlight")}
            description={t("page.myMusics.description")}
        />
    );
}

interface MusicItemProps {
    music: Music;
    difficulties: Record<string, number>;
    results: Record<string, PlayResult>;
    thumbnailUrl: string;
    hasUserData: boolean;
    selectedDifficulty: string;
    constant?: number;
    sortBy?: string;
}

function MusicItem({ music, difficulties, results, thumbnailUrl, hasUserData, selectedDifficulty, constant, sortBy }: MusicItemProps) {
    const allDiffs = ["easy", "normal", "hard", "expert", "master", "append"];
    const currentLevel = difficulties[selectedDifficulty];

    return (
        <Link href={`/music/${music.id}`} className="group state-layer focus-ring block rounded-md3-md" data-shortcut-item="true">
            <div className="relative cursor-pointer overflow-hidden rounded-md3-md bg-surface-card shadow-elev-1 transition-shadow duration-200 ease-md3-standard hover:shadow-elev-2">
                {/* Music Thumbnail */}
                <div className="w-full aspect-square relative">
                    <Image
                        src={thumbnailUrl}
                        alt={music.title}
                        fill
                        className="object-cover"
                        unoptimized
                    />

                    {/* Badge - top right corner */}
                    {currentLevel !== undefined && (
                        <div className={`absolute right-1 top-1 rounded-md3-xs px-1.5 py-0.5 font-bold ${constant ? 'bg-primary text-[10px] text-on-primary' : 'bg-inverse-surface/80 text-xs text-inverse-on-surface'}`}>
                            {constant ? constant.toFixed(1) : (sortBy === 'constant' ? `${currentLevel}.?` : currentLevel)}
                        </div>
                    )}

                    {/* Completion Badges - bottom left corner */}
                    {hasUserData && (
                        <div className="absolute bottom-1 left-1 flex gap-0.5">
                            {allDiffs.map(diff => {
                                if (difficulties[diff] === undefined) return null;
                                const result = results[diff] || "";

                                return (
                                    <div key={diff} className="flex-shrink-0">
                                        {result === "AP" && (
                                            <Image src="/data/music/icon_allPerfect.png" alt="AP" width={12} height={12} className="drop-shadow-md" />
                                        )}
                                        {result === "FC" && (
                                            <Image src="/data/music/icon_fullCombo.png" alt="FC" width={12} height={12} className="drop-shadow-md" />
                                        )}
                                        {result === "C" && (
                                            <Image src="/data/music/icon_clear.png" alt="C" width={12} height={12} className="drop-shadow-md" />
                                        )}
                                        {!result && (
                                            <Image src="/data/music/icon_notClear.png" alt="NC" width={12} height={12} className="opacity-50 drop-shadow-md" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Title Info */}
                <div className="p-3">
                    <h3 className="type-title-s text-on-surface transition-colors group-hover:text-primary">
                        <TranslatedText
                            original={music.title}
                            category="music"
                            field="title"
                            originalClassName="truncate block"
                            translationClassName="block truncate type-label-s text-on-surface-variant"
                        />
                    </h3>
                </div>
            </div>
        </Link>
    );
}

// ==================== Export ====================

function MyMusicsLoadingFallback() {
    const { t } = useI18n();
    return <LoadingState label={t("common.state.loading")} className="min-h-[50vh]" />;
}

export default function MyMusicsClient() {
    return (
        <MainLayout>
            <Suspense fallback={<MyMusicsLoadingFallback />}>
                <MyMusicsContent />
            </Suspense>
        </MainLayout>
    );
}
