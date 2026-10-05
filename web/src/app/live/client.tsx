"use client";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import MainLayout from "@/components/MainLayout";
import VirtualLiveGrid from "@/components/live/VirtualLiveGrid";
import VirtualLiveFilters from "@/components/live/VirtualLiveFilters";
import { IVirtualLiveInfo, VirtualLiveType } from "@/types/virtualLive";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import { loadTranslations, TranslationData } from "@/lib/translations";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { ErrorState, LoadMore, LoadingState, PageContainer, PageHeader } from "@/components/md3";

function VirtualLiveContent() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const { isShowSpoiler } = useTheme();

    const [virtualLives, setVirtualLives] = useState<IVirtualLiveInfo[]>([]);
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    // Filter states
    const [selectedTypes, setSelectedTypes] = useState<VirtualLiveType[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    // Sort states
    const [sortBy, setSortBy] = useState<"id" | "startAt">("startAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Pagination with scroll restore
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "live",
        defaultDisplayCount: 12,
        increment: 12,
        isReady: !isLoading,
    });

    // Storage key
    const STORAGE_KEY = "virtual_live_filters";

    // Initialize from URL params first, then fallback to sessionStorage
    useEffect(() => {
        const types = searchParams.get("types");
        const search = searchParams.get("search");
        const sort = searchParams.get("sortBy");
        const order = searchParams.get("sortOrder");

        const hasUrlParams = types || search || sort || order;

        if (hasUrlParams) {
            if (types) setSelectedTypes(types.split(",") as VirtualLiveType[]);
            if (search) setSearchQuery(search);
            if (sort) setSortBy(sort as "id" | "startAt");
            if (order) setSortOrder(order as "asc" | "desc");
        } else {
            try {
                const saved = sessionStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const filters = JSON.parse(saved);
                    if (filters.types?.length) setSelectedTypes(filters.types);
                    if (filters.search) setSearchQuery(filters.search);
                    if (filters.sortBy) setSortBy(filters.sortBy);
                    if (filters.sortOrder) setSortOrder(filters.sortOrder);
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
            types: selectedTypes,
            search: searchQuery,
            sortBy,
            sortOrder,
        };
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        } catch (_e) {
            console.log("Could not save filters to sessionStorage");
        }

        const params = new URLSearchParams();
        if (selectedTypes.length > 0) params.set("types", selectedTypes.join(","));
        if (searchQuery) params.set("search", searchQuery);
        if (sortBy !== "startAt") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        replaceCurrentUrlSearchParams(params);
    }, [selectedTypes, searchQuery, sortBy, sortOrder, filtersInitialized]);

    // Fetch virtual lives data
    useEffect(() => {
        async function fetchVirtualLives() {
            try {
                setIsLoading(true);
                const [data, translationsData] = await Promise.all([
                    fetchMasterData<IVirtualLiveInfo[]>("virtualLives.json"),
                    loadTranslations(),
                ]);
                setVirtualLives(data);
                setTranslations(translationsData);
                setError(null);
            } catch (err) {
                console.error("Error fetching virtual lives:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        fetchVirtualLives();
    }, []);

    // Filter and sort virtual lives
    const filteredVirtualLives = useMemo(() => {
        let result = [...virtualLives];

        // Apply type filter
        if (selectedTypes.length > 0) {
            result = result.filter(vl => selectedTypes.includes(vl.virtualLiveType as VirtualLiveType));
        }

        // Apply search query (supports both name, ID, and Chinese translations)
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            const queryAsNumber = parseInt(query, 10);

            result = result.filter(vl => {
                // Match by ID
                if (vl.id === queryAsNumber) return true;
                // Match by Japanese name
                if (vl.name.toLowerCase().includes(query)) return true;
                // Match by Chinese name translation
                const chineseName = translations?.virtualLive?.name?.[vl.name];
                if (chineseName && chineseName.toLowerCase().includes(query)) return true;
                return false;
            });
        }

        // Spoiler filter
        if (!isShowSpoiler) {
            result = result.filter(vl => vl.startAt <= Date.now());
        }

        // Apply sorting
        result.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case "id":
                    comparison = a.id - b.id;
                    break;
                case "startAt":
                    comparison = a.startAt - b.startAt;
                    break;
            }
            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [virtualLives, selectedTypes, searchQuery, sortBy, sortOrder, isShowSpoiler, translations]);

    // Displayed virtual lives (with pagination)
    const displayedVirtualLives = useMemo(() => {
        return filteredVirtualLives.slice(0, displayCount);
    }, [filteredVirtualLives, displayCount]);



    // Reset filters
    const resetFilters = useCallback(() => {
        setSelectedTypes([]);
        setSearchQuery("");
        setSortBy("startAt");
        setSortOrder("desc");
        resetDisplayCount();
    }, [resetDisplayCount]);

    // Sort change handler
    const handleSortChange = useCallback((newSortBy: "id" | "startAt", newSortOrder: "asc" | "desc") => {
        setSortBy(newSortBy);
        setSortOrder(newSortOrder);
        resetDisplayCount();
    }, [resetDisplayCount]);

    const quickFilterContent = (
        <VirtualLiveFilters
            selectedTypes={selectedTypes}
            onTypeChange={setSelectedTypes}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            onReset={resetFilters}
            totalItems={virtualLives.length}
            filteredItems={filteredVirtualLives.length}
        />
    );

    useQuickFilter(t("page.live.filterTitle"), quickFilterContent, [
        selectedTypes,
        searchQuery,
        sortBy,
        sortOrder,
        virtualLives.length,
        filteredVirtualLives.length,
    ]);

    return (
        <PageContainer>
            <PageHeader
                align="center"
                eyebrow={t("page.live.badge")}
                title={t("page.live.title")}
                highlight={t("page.live.titleHighlight")}
                description={t("page.live.description")}
            />

            {error && (
                <ErrorState
                    className="mb-6"
                    title={t("common.state.loadingFailed")}
                    message={error}
                    retryLabel={t("common.action.retry")}
                />
            )}

            {/* Virtual Live Grid. Filters live in the global FilterDrawer (registered
                above via useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                <VirtualLiveGrid virtualLives={displayedVirtualLives} isLoading={isLoading} />

                {!isLoading && (
                    <LoadMore
                        label={t("page.live.loadMore")}
                        shown={displayedVirtualLives.length}
                        total={filteredVirtualLives.length}
                        onLoadMore={loadMore}
                        allLoadedLabel={t("page.live.allLoaded", { count: filteredVirtualLives.length })}
                    />
                )}
            </div>
        </PageContainer>
    );
}

function VirtualLiveLoadingFallback() {
    const { t } = useI18n();
    return <LoadingState label={t("page.live.loadingFallback")} />;
}

export default function VirtualLiveClient() {
    return (
        <MainLayout>
            <Suspense fallback={<VirtualLiveLoadingFallback />}>
                <VirtualLiveContent />
            </Suspense>
        </MainLayout>
    );
}
