"use client";
import { useState, useEffect, useMemo, Suspense } from "react";

import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import BaseFilters from "@/components/common/BaseFilters";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getComicUrl } from "@/lib/assets";
import { fetchMasterData } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import ImagePreviewModal from "@/components/common/ImagePreviewModal";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { Card, ErrorState, LoadMore, LoadingState, PageContainer, PageHeader } from "@/components/md3";
import { oldComicTips } from "@/lib/oldComicTips";

interface ITipInfo {
    id: number;
    title: string;
    description?: string;
    fromUserRank?: number;
    toUserRank?: number;
    assetbundleName?: string; // Only comics have this
}

function ComicContent() {
    const { assetSource } = useTheme();
    const { t } = useI18n();

    const [comics, setComics] = useState<ITipInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter states
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [searchQuery, setSearchQuery] = useState("");

    // Pagination with scroll restore
    const { displayCount, loadMore } = useScrollRestore({
        storageKey: "comic",
        defaultDisplayCount: 24,
        increment: 24,
        isReady: !isLoading,
    });

    // Selected comic for full view
    const [selectedComic, setSelectedComic] = useState<ITipInfo | null>(null);

    // Fetch comics data
    useEffect(() => {
        async function fetchComics() {
            try {
                setIsLoading(true);
                const data = await fetchMasterData<ITipInfo[]>("tips.json");
                // Filter only comics (those with assetbundleName)
                const comicsOnly = data.filter(t => t.assetbundleName);

                // Add manual old comic tips
                const comicIds = new Set(comicsOnly.map(c => c.id));
                const missingOldComics = oldComicTips.filter(c => !comicIds.has(c.id));
                const allComics = [...comicsOnly, ...missingOldComics];

                setComics(allComics);
                setError(null);
            } catch (err) {
                console.error("Error fetching comics:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        fetchComics();
    }, []);

    // Filter and sort comics
    const filteredComics = useMemo(() => {
        let result = [...comics];

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(c => c.title.toLowerCase().includes(query));
        }

        // Sort
        result.sort((a, b) => sortOrder === "asc" ? a.id - b.id : b.id - a.id);

        return result;
    }, [comics, searchQuery, sortOrder]);

    // Displayed comics
    const displayedComics = useMemo(() => {
        return filteredComics.slice(0, displayCount);
    }, [filteredComics, displayCount]);

    const quickFilterContent = (
        <BaseFilters
            filteredCount={filteredComics.length}
            totalCount={comics.length}
            countUnit={t("page.comic.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("page.comic.searchPlaceholder")}
            sortOptions={[{ id: "id", label: "ID" }]}
            sortBy="id"
            sortOrder={sortOrder}
            onSortChange={(_: string, order: "asc" | "desc") => setSortOrder(order)}
        />
    );

    useQuickFilter(t("page.comic.filterTitle"), quickFilterContent, [
        searchQuery,
        sortOrder,
        filteredComics.length,
        comics.length,
        t,
    ]);



    return (
        <PageContainer>
            <ImagePreviewModal
                isOpen={!!selectedComic}
                onClose={() => setSelectedComic(null)}
                title={selectedComic ? t("page.comic.previewTitle", { title: selectedComic.title }) : t("page.comic.previewTitleFallback")}
                imageUrl={selectedComic?.assetbundleName ? getComicUrl(selectedComic.assetbundleName, assetSource) : ""}
                alt={selectedComic?.title || t("page.comic.previewAltFallback")}
                fileName={selectedComic ? `comic_${selectedComic.id}.png` : "comic.png"}
            />

            <PageHeader
                align="center"
                eyebrow={t("page.comic.badge")}
                title={t("page.comic.title")}
                highlight={t("page.comic.titleHighlight")}
                description={t("page.comic.description")}
            />

            {/* Error State */}
            {error && (
                <ErrorState className="mb-6" title={t("page.comic.loadFailed")} message={error} retryLabel={t("common.action.retry")} />
            )}

            {/* Grid. Filters live in the global FilterDrawer (registered
                above via useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {isLoading ? (
                    <LoadingState />
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                            {displayedComics.map(comic => (
                                <Card
                                    variant="elevated"
                                    key={comic.id}
                                    onClick={() => setSelectedComic(comic)}
                                    data-shortcut-item="true"
                                    className="group cursor-zoom-in"
                                >
                                    <div className="relative aspect-[4/3] bg-surface-container">
                                        <Image
                                            src={getComicUrl(comic.assetbundleName!, assetSource)}
                                            alt={comic.title}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </div>
                                    <div className="p-4">
                                        <div className="line-clamp-1 type-title-s text-on-surface">
                                            <TranslatedText
                                                original={comic.title}
                                                category="comic"
                                                field="title"
                                                originalClassName="block truncate"
                                                translationClassName="mt-0.5 block truncate type-body-s text-on-surface-variant"
                                            />
                                        </div>
                                        <div className="mt-3 flex items-center justify-between">
                                            <span className="rounded-md3-sm bg-secondary-container px-2 py-0.5 type-label-s text-on-secondary-container">#{comic.id}</span>
                                            {comic.fromUserRank !== undefined && (
                                                <span className="type-label-s text-on-surface-variant">Rank {comic.fromUserRank}</span>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>

                        {/* Load More */}
                        <LoadMore
                            label={t("page.comic.loadMore")}
                            shown={displayedComics.length}
                            total={filteredComics.length}
                            onLoadMore={loadMore}
                            allLoadedLabel={t("page.comic.allLoaded", { count: filteredComics.length })}
                        />
                    </>
                )}
            </div>
        </PageContainer>
    );
}

export default function ComicClient() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <Suspense fallback={<LoadingState className="min-h-[50vh]" label={t("page.comic.loadingFallback")} />}>
                <ComicContent />
            </Suspense>
        </MainLayout>
    );
}
