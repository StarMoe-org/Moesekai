"use client";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import MainLayout from "@/components/MainLayout";
import GachaGrid from "@/components/gacha/GachaGrid";
import ViewToggle, { type ListViewMode } from "@/components/cards/ViewToggle";
import GachaFilters from "@/components/gacha/GachaFilters";
import { useTheme } from "@/contexts/ThemeContext";
import { IGachaInfo, ICardInfo, GachaCategoryType, isWishGacha } from "@/types/types";
import { fetchMasterData } from "@/lib/fetch";
import { loadTranslations, TranslationData } from "@/lib/translations";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { ErrorState, LoadMore, LoadingState, PageContainer, PageHeader } from "@/components/md3";

function GachaContent() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const { isShowSpoiler } = useTheme();

    const [allGachas, setAllGachas] = useState<IGachaInfo[]>([]);
    const [allCards, setAllCards] = useState<ICardInfo[]>([]);
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"id" | "startAt">("startAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [selectedCategory, setSelectedCategory] = useState<GachaCategoryType>("all");
    const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [view, setView] = useState<ListViewMode>("grid");

    // Pagination with scroll restore
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "gacha",
        defaultDisplayCount: 24,
        increment: 24,
        isReady: !isLoading,
    });

    // Storage key
    const STORAGE_KEY = "gacha_filters";

    // Initialize from URL params first, then fallback to sessionStorage
    useEffect(() => {
        const search = searchParams.get("search");
        const sort = searchParams.get("sortBy");
        const order = searchParams.get("sortOrder");
        const category = searchParams.get("category") as GachaCategoryType | null;
        const chars = searchParams.get("chars");
        const units = searchParams.get("units");
        const viewParam = searchParams.get("view");

        const hasUrlParams = search || sort || order || category || chars || units || viewParam;

        if (hasUrlParams) {
            if (search) setSearchQuery(search);
            if (sort) setSortBy(sort as "id" | "startAt");
            if (order) setSortOrder(order as "asc" | "desc");
            if (category && ["all", "wish_pick", "normal_pickup"].includes(category)) {
                setSelectedCategory(category);
            }
            if (chars) {
                try {
                    setSelectedCharacters(JSON.parse(chars));
                } catch { /* ignore */ }
            }
            if (units) {
                try {
                    setSelectedUnitIds(JSON.parse(units));
                } catch { /* ignore */ }
            }
            if (viewParam) setView(viewParam === "table" || viewParam === "list" ? "table" : "grid");
        } else {
            try {
                const saved = sessionStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const filters = JSON.parse(saved);
                    if (filters.search) setSearchQuery(filters.search);
                    if (filters.sortBy) setSortBy(filters.sortBy);
                    if (filters.sortOrder) setSortOrder(filters.sortOrder);
                    if (filters.category) setSelectedCategory(filters.category);
                    if (filters.chars) setSelectedCharacters(filters.chars);
                    if (filters.units) setSelectedUnitIds(filters.units);
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
            search: searchQuery,
            sortBy,
            sortOrder,
            category: selectedCategory,
            chars: selectedCharacters,
            units: selectedUnitIds,
        };
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        } catch (_e) {
            console.log("Could not save filters to sessionStorage");
        }

        // Update URL
        const params = new URLSearchParams();
        if (searchQuery) params.set("search", searchQuery);
        if (sortBy !== "startAt") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        if (selectedCategory !== "all") params.set("category", selectedCategory);
        if (selectedCharacters.length > 0) params.set("chars", JSON.stringify(selectedCharacters));
        if (selectedUnitIds.length > 0) params.set("units", JSON.stringify(selectedUnitIds));
        if (view !== "grid") params.set("view", view);
        replaceCurrentUrlSearchParams(params);
    }, [searchQuery, sortBy, sortOrder, selectedCategory, selectedCharacters, selectedUnitIds, view, filtersInitialized]);

    // Fetch gachas from master data
    useEffect(() => {
        async function fetchGachas() {
            try {
                setIsLoading(true);
                const [data, cardsData, translationsData] = await Promise.all([
                    fetchMasterData<IGachaInfo[]>("gachas.json"),
                    fetchMasterData<ICardInfo[]>("cards.json"),
                    loadTranslations(),
                ]);
                setAllGachas(data);
                setAllCards(cardsData);
                setTranslations(translationsData);
                setError(null);
            } catch (err) {
                console.error("Error fetching gachas:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        fetchGachas();
    }, []);

    // Filter and sort gachas
    const filteredGachas = useMemo(() => {
        let result = [...allGachas];

        // Apply category filter
        if (selectedCategory !== "all") {
            if (selectedCategory === "wish_pick") {
                result = result.filter(g => isWishGacha(g));
            } else if (selectedCategory === "normal_pickup") {
                result = result.filter(g => !isWishGacha(g));
            }
        }

        // Apply character filter (filter by pickup characters)
        if (selectedCharacters.length > 0) {
            const cardMap = new Map(allCards.map(card => [card.id, card]));
            result = result.filter(gacha => {
                const pickupCharIds = new Set<number>();
                for (const pickup of gacha.gachaPickups || []) {
                    const card = cardMap.get(pickup.cardId);
                    if (card) {
                        pickupCharIds.add(card.characterId);
                    }
                }
                return selectedCharacters.some(charId => pickupCharIds.has(charId));
            });
        }

        // Apply search query (supports both name, ID, and Chinese translations)
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            const queryAsNumber = parseInt(query, 10);

            result = result.filter(gacha => {
                // Match by ID
                if (gacha.id === queryAsNumber) return true;
                // Match by Japanese name
                if (gacha.name.toLowerCase().includes(query)) return true;
                // Match by Chinese name translation
                const chineseName = translations?.gacha?.name?.[gacha.name];
                if (chineseName && chineseName.toLowerCase().includes(query)) return true;
                return false;
            });
        }

        // Spoiler filter
        if (!isShowSpoiler) {
            result = result.filter(gacha => gacha.startAt <= Date.now());
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
    }, [allGachas, allCards, searchQuery, sortBy, sortOrder, isShowSpoiler, translations, selectedCategory, selectedCharacters]);

    // Displayed gachas (with pagination)
    const displayedGachas = useMemo(() => {
        return filteredGachas.slice(0, displayCount);
    }, [filteredGachas, displayCount]);



    // Sort change handler
    const handleSortChange = useCallback((newSortBy: "id" | "startAt", newSortOrder: "asc" | "desc") => {
        setSortBy(newSortBy);
        setSortOrder(newSortOrder);
        resetDisplayCount();
    }, [resetDisplayCount]);

    const quickFilterContent = (
        <GachaFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            selectedCategory={selectedCategory}
            onCategoryChange={(category) => {
                setSelectedCategory(category);
                resetDisplayCount();
            }}
            selectedCharacters={selectedCharacters}
            onCharacterChange={(chars) => {
                setSelectedCharacters(chars);
                resetDisplayCount();
            }}
            selectedUnitIds={selectedUnitIds}
            onUnitIdsChange={(units) => {
                setSelectedUnitIds(units);
                resetDisplayCount();
            }}
            totalGachas={allGachas.length}
            filteredGachas={filteredGachas.length}
        />
    );

    useQuickFilter(t("page.gacha.filterTitle"), quickFilterContent, [
        searchQuery,
        sortBy,
        sortOrder,
        selectedCategory,
        selectedCharacters,
        selectedUnitIds,
        allGachas.length,
        filteredGachas.length,
    ]);

    return (
        <PageContainer>
            <PageHeader
                eyebrow={t("page.gacha.badge")}
                title={t("page.gacha.title")}
                highlight={t("page.gacha.titleHighlight")}
                description={t("page.gacha.description")}
            />

            {error && (
                <ErrorState
                    className="mb-6"
                    title={t("common.state.loadingFailed")}
                    message={error}
                    retryLabel={t("common.action.retry")}
                />
            )}

            {/* Gacha Grid. Filters live in the global FilterDrawer (registered
                above via useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                <div className="mb-4 flex justify-end"><ViewToggle value={view} onChange={setView} /></div>
                <GachaGrid gachas={displayedGachas} isLoading={isLoading} view={view} />

                {!isLoading && (
                    <LoadMore
                        label={t("page.gacha.loadMore")}
                        shown={displayedGachas.length}
                        total={filteredGachas.length}
                        onLoadMore={loadMore}
                        allLoadedLabel={t("page.gacha.allLoaded", { count: filteredGachas.length })}
                    />
                )}
            </div>
        </PageContainer>
    );
}

function GachaLoadingFallback() {
    const { t } = useI18n();
    return <LoadingState label={t("page.gacha.loadingFallback")} />;
}

export default function GachaClient() {
    return (
        <MainLayout>
            <Suspense fallback={<GachaLoadingFallback />}>
                <GachaContent />
            </Suspense>
        </MainLayout>
    );
}
