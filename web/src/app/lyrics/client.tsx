"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import MainLayout from "@/components/MainLayout";
import MusicFilters from "@/components/music/MusicFilters";
import MusicItem from "@/components/music/MusicItem";
import { MUSIC_GRID_CLASS } from "@/components/music/music-layout";
import { useI18n } from "@/contexts/I18nContext";
import { EmptyState, ErrorState, LoadingState, LoadMore, PageContainer, PageHeader } from "@/components/md3";
import { mdLyrics } from "@/components/md3/icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { fetchMasterData } from "@/lib/fetch";
import {
    fetchLyricsIndex,
    getLyricsAvailableVersions,
    hasLyricsDetail,
    type ILyricsIndexEntry,
} from "@/lib/lyrics";
import { buildMusicAliasesById, SEARCH_INDEX_URL } from "@/lib/lyrics-aliases.mjs";
import { fetchLyricsMusicCatalog } from "@/lib/lyrics-music-source";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import type { IMusicInfo, IMusicTagInfo, MusicCategoryType, MusicTagType } from "@/types/music";

function LyricsContent() {
    const searchParams = useSearchParams();
    const { isShowSpoiler } = useTheme();
    const { t } = useI18n();
    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [musicTags, setMusicTags] = useState<IMusicTagInfo[]>([]);
    const [eventMusicIds, setEventMusicIds] = useState<Set<number>>(new Set());
    const [lyricsByMusicId, setLyricsByMusicId] = useState<Map<number, ILyricsIndexEntry>>(new Map());
    const [musicAliasesById, setMusicAliasesById] = useState<Map<number, string[]>>(new Map());
    const [aliasIndexSettled, setAliasIndexSettled] = useState(false);
    const [selectedTag, setSelectedTag] = useState<MusicTagType>((searchParams.get("tag") as MusicTagType) || "all");
    const [selectedCategories, setSelectedCategories] = useState<MusicCategoryType[]>(
        () => (searchParams.get("categories")?.split(",") as MusicCategoryType[] | undefined) ?? [],
    );
    const [hasEventOnly, setHasEventOnly] = useState(searchParams.get("eventOnly") === "true");
    const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [now] = useState(() => Date.now());
    const [sortBy, setSortBy] = useState<"publishedAt" | "id">(
        searchParams.get("sortBy") === "id" ? "id" : "publishedAt",
    );
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
        searchParams.get("sortOrder") === "asc" ? "asc" : "desc",
    );
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const indexRequest = fetchLyricsIndex();
        // Published lyrics follow the JP catalogue, so the ids drive the JP
        // fallback in fetchLyricsMusicCatalog; without them every non-JP region
        // silently drops songs its own masterdata has not caught up with.
        const catalogRequest = indexRequest
            .then((index) => new Set(index.songs.filter(hasLyricsDetail).map((song) => song.musicId)))
            .catch(() => new Set<number>())
            .then((publishedMusicIds) => fetchLyricsMusicCatalog(publishedMusicIds));
        Promise.all([
            indexRequest,
            catalogRequest,
            fetchMasterData<IMusicTagInfo[]>("musicTags.json"),
            fetchMasterData<{ musicId: number }[]>("eventMusics.json"),
        ])
            .then(([index, musicData, tags, eventMusics]) => {
                if (cancelled) return;
                setLyricsByMusicId(new Map(index.songs.map((item) => [item.musicId, item])));
                setMusics(musicData);
                setMusicTags(tags);
                setEventMusicIds(new Set(eventMusics.map((item) => item.musicId)));
                setError(null);
            })
            .catch(() => {
                if (!cancelled) setError(t("page.lyrics.error"));
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [t]);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8_000);

        // Aliases are optional and must not delay the primary lyrics catalog.
        void fetch(SEARCH_INDEX_URL, { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error(`Search index HTTP ${response.status}`);
                return response.json() as Promise<unknown>;
            })
            .then((items) => {
                if (!cancelled) setMusicAliasesById(buildMusicAliasesById(items));
            })
            .catch(() => {
                // Keep title, creator, translation, and ID search available when
                // the optional shared index is temporarily unavailable.
            })
            .finally(() => {
                window.clearTimeout(timeout);
                if (!cancelled) setAliasIndexSettled(true);
            });

        return () => {
            cancelled = true;
            controller.abort();
            window.clearTimeout(timeout);
        };
    }, []);

    useEffect(() => {
        const params = new URLSearchParams();
        if (selectedTag !== "all") params.set("tag", selectedTag);
        if (selectedCategories.length) params.set("categories", selectedCategories.join(","));
        if (hasEventOnly) params.set("eventOnly", "true");
        if (searchQuery) params.set("search", searchQuery);
        if (sortBy !== "publishedAt") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        replaceCurrentUrlSearchParams(params);
    }, [hasEventOnly, searchQuery, selectedCategories, selectedTag, sortBy, sortOrder]);

    const nonInstrumentalMusics = useMemo(
        () => musics.filter((music) => {
            const lyrics = lyricsByMusicId.get(music.id);
            return lyrics?.state !== "satisfied_no_lyrics";
        }),
        [lyricsByMusicId, musics],
    );

    const totalMusics = nonInstrumentalMusics.length;

    const filteredMusics = useMemo(() => {
        let result = nonInstrumentalMusics;
        if (selectedTag !== "all") {
            let matchingIds: Set<number>;
            if (selectedTag === "vocaloid") {
                const unitTags = new Set<MusicTagType>(["light_music_club", "idol", "street", "theme_park", "school_refusal"]);
                const unitMusicIds = new Set(musicTags.filter((tag) => unitTags.has(tag.musicTag)).map((tag) => tag.musicId));
                matchingIds = new Set(
                    musicTags
                        .filter((tag) => tag.musicTag === "vocaloid")
                        .map((tag) => tag.musicId)
                        .filter((musicId) => !unitMusicIds.has(musicId)),
                );
            } else {
                matchingIds = new Set(musicTags.filter((tag) => tag.musicTag === selectedTag).map((tag) => tag.musicId));
            }
            result = result.filter((music) => matchingIds.has(music.id));
        }
        if (selectedCategories.length) {
            result = result.filter((music) => selectedCategories.every((category) => (music.categories ?? []).includes(category)));
        }
        if (hasEventOnly) result = result.filter((music) => eventMusicIds.has(music.id));
        if (deferredSearchQuery.trim()) {
            const query = deferredSearchQuery.trim().toLowerCase();
            const numericQuery = Number.parseInt(query, 10);
            result = result.filter((music) => {
                const indexEntry = lyricsByMusicId.get(music.id);
                const aliases = musicAliasesById.get(music.id);
                return music.id === numericQuery
                    || music.title.toLowerCase().includes(query)
                    || music.pronunciation.toLowerCase().includes(query)
                    || music.composer.toLowerCase().includes(query)
                    || music.lyricist.toLowerCase().includes(query)
                    || Boolean(indexEntry?.title["zh-CN"]?.toLowerCase().includes(query))
                    || Boolean(indexEntry?.title["en-US"]?.toLowerCase().includes(query))
                    || Boolean(aliases?.some((alias) => alias.toLowerCase().includes(query)));
            });
        }
        if (!isShowSpoiler) result = result.filter((music) => music.publishedAt <= now);
        return result.sort((left, right) => {
            const difference = sortBy === "id" ? left.id - right.id : left.publishedAt - right.publishedAt;
            return sortOrder === "asc" ? difference : -difference;
        });
    }, [deferredSearchQuery, eventMusicIds, hasEventOnly, isShowSpoiler, lyricsByMusicId, musicAliasesById, musicTags, nonInstrumentalMusics, now, selectedCategories, selectedTag, sortBy, sortOrder]);

    const waitingForAliasMatch = !isLoading
        && !aliasIndexSettled
        && deferredSearchQuery.trim() !== ""
        && filteredMusics.length === 0;
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "lyrics",
        defaultDisplayCount: 30,
        increment: 30,
        maxRestoredDisplayCount: 90,
        isReady: !isLoading && (deferredSearchQuery.trim() === "" || aliasIndexSettled),
    });

    const resetFilters = () => {
        setSelectedTag("all");
        setSelectedCategories([]);
        setHasEventOnly(false);
        setSearchQuery("");
        setSortBy("publishedAt");
        setSortOrder("desc");
        resetDisplayCount();
    };

    const quickFilterContent = (
        <MusicFilters
            title={t("page.lyrics.filterTitle")}
            countUnit={t("page.lyrics.countUnit")}
            searchPlaceholder={t("page.lyrics.searchPlaceholder")}
            selectedTag={selectedTag}
            onTagChange={(tag) => {
                setSelectedTag(tag);
                resetDisplayCount();
            }}
            selectedCategories={selectedCategories}
            onCategoryChange={(categories) => {
                setSelectedCategories(categories);
                resetDisplayCount();
            }}
            hasEventOnly={hasEventOnly}
            onHasEventOnlyChange={(eventOnly) => {
                setHasEventOnly(eventOnly);
                resetDisplayCount();
            }}
            searchQuery={searchQuery}
            onSearchChange={(query) => {
                setSearchQuery(query);
                resetDisplayCount();
            }}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(nextSort, nextOrder) => {
                setSortBy(nextSort === "id" ? "id" : "publishedAt");
                setSortOrder(nextOrder);
                resetDisplayCount();
            }}
            customSortOptions={[
                { id: "publishedAt", label: t("common.filter.sortByPublishedAt") },
                { id: "id", label: t("common.filter.sortById") },
            ]}
            onReset={resetFilters}
            totalMusics={totalMusics}
            filteredMusics={filteredMusics.length}
        />
    );

    useQuickFilter(t("page.lyrics.filterTitle"), quickFilterContent, [
        selectedTag,
        selectedCategories,
        hasEventOnly,
        searchQuery,
        sortBy,
        sortOrder,
        totalMusics,
        filteredMusics.length,
    ]);

    return (
        <PageContainer>
            <PageHeader
                align="center"
                eyebrow={t("page.lyrics.badge")}
                title={t("page.lyrics.title")}
                highlight={t("page.lyrics.titleHighlight")}
                description={t("page.lyrics.description")}
            />

            {error && (
                <ErrorState
                    className="mb-6"
                    title={t("common.state.loadingFailed")}
                    message={error}
                    retryLabel={t("common.action.retry")}
                />
            )}

            {/* Filters live in the global FilterDrawer (registered above via
                useQuickFilter), so the page body is a single column. */}
            <section className="min-w-0" aria-label={t("page.lyrics.title")}>
                {isLoading || waitingForAliasMatch ? (
                    <div className={MUSIC_GRID_CLASS} aria-label={t("page.lyrics.loading")}>
                        {Array.from({ length: 15 }).map((_, index) => (
                            <div key={index} className="animate-pulse">
                                <div className="overflow-hidden rounded-md3-md bg-surface-container-low">
                                    <div className="aspect-square bg-surface-container-high" />
                                    <div className="space-y-2 p-3">
                                        <div className="h-4 w-3/4 rounded-md3-xs bg-surface-container-highest" />
                                        <div className="h-3 w-1/2 rounded-md3-xs bg-surface-container-high" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredMusics.length === 0 ? (
                    <EmptyState icon={mdLyrics} title={t("page.lyrics.empty")} description={t("page.lyrics.emptyHint")} />
                ) : (
                    <>
                        <div className={MUSIC_GRID_CLASS}>
                            {filteredMusics.slice(0, displayCount).map((music) => {
                                const lyrics = lyricsByMusicId.get(music.id);
                                const hasDetail = lyrics ? hasLyricsDetail(lyrics) : false;
                                const versions = lyrics ? getLyricsAvailableVersions(lyrics) : [];
                                const versionLabel = !hasDetail
                                    ? "page.lyrics.inProgressBadge"
                                    : versions.length === 1 && versions[0] === "game"
                                        ? "page.lyrics.versionGame"
                                        : versions.length === 2 ? "page.lyrics.versionFullAndGame" : "page.lyrics.versionFull";
                                return (
                                    <div key={music.id} className="min-w-0">
                                        <MusicItem
                                            music={music}
                                            isSpoiler={music.publishedAt > now}
                                            cnTitle={lyrics?.title["zh-CN"]}
                                            enTitle={lyrics?.title["en-US"]}
                                            hrefBase="/lyrics"
                                            jacketTopLeftLabel={t(versionLabel)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <LoadMore
                            label={t("page.lyrics.loadMore")}
                            shown={Math.min(displayCount, filteredMusics.length)}
                            total={filteredMusics.length}
                            onLoadMore={loadMore}
                            allLoadedLabel={t("page.lyrics.allLoaded", { count: String(filteredMusics.length) })}
                        />
                    </>
                )}
            </section>
        </PageContainer>
    );
}

export default function LyricsClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <LyricsContent />
            </Suspense>
        </MainLayout>
    );
}
