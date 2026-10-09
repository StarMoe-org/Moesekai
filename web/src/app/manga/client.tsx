"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import BaseFilters from "@/components/common/BaseFilters";
import { useI18n } from "@/contexts/I18nContext";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { IMangaItem, IMangaData } from "@/types/manga";
import { getMangaImageUrl } from "@/lib/assets";
import { fetchMangaData } from "@/lib/fetch";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { Card, ErrorState, LoadMore, LoadingState, PageContainer, PageHeader } from "@/components/md3";
import { useGridReflowAnimation } from "@/hooks/useGridReflowAnimation";

// ==================== Component ====================

function MangaContent() {
    const { t, formatDate } = useI18n();
    const gridRef = useGridReflowAnimation<HTMLDivElement>();

    const [mangas, setMangas] = useState<IMangaItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter states
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [searchQuery, setSearchQuery] = useState("");

    // Pagination with scroll restore — 12 per batch
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "manga",
        defaultDisplayCount: 12,
        increment: 12,
        isReady: !isLoading,
    });

    // Fetch mangas data
    useEffect(() => {
        async function fetchMangas() {
            try {
                setIsLoading(true);
                const data = await fetchMangaData<IMangaData>();
                const list = Object.values(data);
                setMangas(list);
                setError(null);
            } catch (err) {
                console.error("Error fetching mangas:", err);
                setError(err instanceof Error ? err.message : t("page.manga.unknownError"));
            } finally {
                setIsLoading(false);
            }
        }
        fetchMangas();
    }, [t]);

    // Filter and sort — supports searching by title AND episode number
    const filteredMangas = useMemo(() => {
        let result = [...mangas];

        if (searchQuery.trim()) {
            const query = searchQuery.trim().toLowerCase();
            result = result.filter((m) => {
                // Match by title
                if (m.title.toLowerCase().includes(query)) return true;
                // Match by episode number (e.g. "123" or "#123")
                const numQuery = query.replace(/^#/, "");
                if (/^\d+$/.test(numQuery) && m.id === parseInt(numQuery, 10)) return true;
                return false;
            });
        }

        result.sort((a, b) =>
            sortOrder === "asc" ? a.id - b.id : b.id - a.id
        );

        return result;
    }, [mangas, searchQuery, sortOrder]);

    // Displayed mangas
    const displayedMangas = useMemo(() => {
        return filteredMangas.slice(0, displayCount);
    }, [filteredMangas, displayCount]);

    const quickFilterContent = (
        <BaseFilters
            filteredCount={filteredMangas.length}
            totalCount={mangas.length}
            countUnit={t("page.manga.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={(q) => { setSearchQuery(q); resetDisplayCount(); }}
            searchPlaceholder={t("page.manga.searchPlaceholder")}
            sortOptions={[{ id: "id", label: t("page.manga.sortLabelEpisode") }]}
            sortBy="id"
            sortOrder={sortOrder}
            onSortChange={(_: string, order: "asc" | "desc") => setSortOrder(order)}
        />
    );

    useQuickFilter(t("page.manga.filterTitle"), quickFilterContent, [
        searchQuery,
        sortOrder,
        filteredMangas.length,
        mangas.length,
        t,
    ]);

    return (
        <PageContainer>
            <PageHeader
                eyebrow={t("page.manga.badge")}
                title={t("page.manga.title")}
                highlight={t("page.manga.titleHighlight")}
                description={t("page.manga.description")}
            />

            {/* Error State */}
            {error && (
                <ErrorState className="mb-6" title={t("page.manga.loadFailed")} message={error} retryLabel={t("common.action.retry")} />
            )}

            {/* Grid. Filters live in the global FilterDrawer (registered
                above via useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {isLoading ? (
                    <LoadingState />
                ) : (
                    <>
                        <div ref={gridRef} className="relative grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
                            {displayedMangas.map((manga) => (
                                <Card
                                    variant="elevated"
                                    key={manga.id}
                                    href={`/manga/${manga.id}`}
                                    data-shortcut-item="true"
                                    className="group"
                                >
                                    {/* Thumbnail: crop top portion of vertical manga */}
                                    <div className="relative aspect-square overflow-hidden bg-surface-container">
                                        <Image
                                            src={getMangaImageUrl(manga.id)}
                                            alt={manga.title}
                                            fill
                                            className="object-cover object-top"
                                            unoptimized
                                        />
                                    </div>
                                    <div className="p-4">
                                        <div className="line-clamp-1 type-title-s text-on-surface">
                                            {manga.title}
                                        </div>
                                        <div className="mt-3 flex items-center justify-between type-label-s text-on-surface-variant">
                                            <span className="rounded-md3-sm bg-secondary-container px-2 py-0.5 text-on-secondary-container">
                                                {t("page.manga.episodeLabel", { id: manga.id })}
                                            </span>
                                            <span>
                                                {formatDate(manga.date * 1000, {
                                                    year: "numeric",
                                                    month: "2-digit",
                                                    day: "2-digit",
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>

                        {/* Load More */}
                        <LoadMore
                            label={t("page.manga.loadMore")}
                            shown={displayedMangas.length}
                            total={filteredMangas.length}
                            onLoadMore={loadMore}
                            allLoadedLabel={t("page.manga.allLoaded", { count: filteredMangas.length })}
                        />
                    </>
                )}
            </div>
        </PageContainer>
    );
}

export default function MangaClient() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <Suspense fallback={<LoadingState className="min-h-[50vh]" label={t("page.manga.loadingFallback")} />}>
                <MangaContent />
            </Suspense>
        </MainLayout>
    );
}
