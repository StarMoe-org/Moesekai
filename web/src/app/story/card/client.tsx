"use client";
import { ErrorState, LoadMore, LoadingState, PageContainer } from "@/components/md3";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";

import MainLayout from "@/components/MainLayout";
import CardGrid from "@/components/cards/CardGrid";
import CardFilters from "@/components/cards/CardFilters";
import { ICardInfo, CardRarityType, CardAttribute, getRarityNumber, SupportUnit } from "@/types/types";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import { loadTranslations, TranslationData } from "@/lib/translations";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { StoryPageHeader } from "@/components/story/StoryPageHeader";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";

interface ICardSupply {
    id: number;
    cardSupplyType: string;
    assetbundleName?: string;
    name?: string;
}

function StoryCardContent() {
    const searchParams = useSearchParams();
    const { isShowSpoiler } = useTheme();
    const { t } = useI18n();

    const [cards, setCards] = useState<ICardInfo[]>([]);
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [selectedAttrs, setSelectedAttrs] = useState<CardAttribute[]>([]);
    const [selectedRarities, setSelectedRarities] = useState<CardRarityType[]>([]);
    const [selectedSupplyTypes, setSelectedSupplyTypes] = useState<string[]>([]);
    const [selectedSupportUnits, setSelectedSupportUnits] = useState<SupportUnit[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const [sortBy, setSortBy] = useState<"id" | "releaseAt" | "rarity">("id");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "story_cards",
        defaultDisplayCount: 30,
        increment: 30,
        isReady: !isLoading,
    });

    const STORAGE_KEY = "story_cards_filters";

    useEffect(() => {
        const chars = searchParams.get("characters");
        const units = searchParams.get("units");
        const attrs = searchParams.get("attrs");
        const rarities = searchParams.get("rarities");
        const supplyTypes = searchParams.get("supplyTypes");
        const supportUnits = searchParams.get("supportUnits");
        const search = searchParams.get("search");
        const sort = searchParams.get("sortBy");
        const order = searchParams.get("sortOrder");

        const hasUrlParams = chars || units || attrs || rarities || supplyTypes || supportUnits || search || sort || order;

        if (hasUrlParams) {
            if (chars) setSelectedCharacters(chars.split(",").map(Number));
            if (units) setSelectedUnitIds(units.split(","));
            if (attrs) setSelectedAttrs(attrs.split(",") as CardAttribute[]);
            if (rarities) setSelectedRarities(rarities.split(",") as CardRarityType[]);
            if (supplyTypes) setSelectedSupplyTypes(supplyTypes.split(","));
            if (supportUnits) setSelectedSupportUnits(supportUnits.split(",") as SupportUnit[]);
            if (search) setSearchQuery(search);
            if (sort) setSortBy(sort as "id" | "releaseAt" | "rarity");
            if (order) setSortOrder(order as "asc" | "desc");
        } else {
            try {
                const saved = sessionStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const filters = JSON.parse(saved);
                    if (filters.characters?.length) setSelectedCharacters(filters.characters);
                    if (filters.units?.length) setSelectedUnitIds(filters.units);
                    if (filters.attrs?.length) setSelectedAttrs(filters.attrs);
                    if (filters.rarities?.length) setSelectedRarities(filters.rarities);
                    if (filters.supplyTypes?.length) setSelectedSupplyTypes(filters.supplyTypes);
                    if (filters.supportUnits?.length) setSelectedSupportUnits(filters.supportUnits);
                    if (filters.search) setSearchQuery(filters.search);
                    if (filters.sortBy) setSortBy(filters.sortBy);
                    if (filters.sortOrder) setSortOrder(filters.sortOrder);
                }
            } catch { /* ignore */ }
        }
        setFiltersInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!filtersInitialized) return;

        const filters = {
            characters: selectedCharacters, units: selectedUnitIds,
            attrs: selectedAttrs, rarities: selectedRarities,
            supplyTypes: selectedSupplyTypes, supportUnits: selectedSupportUnits,
            search: searchQuery, sortBy, sortOrder,
        };
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch { /* ignore */ }

        const params = new URLSearchParams();
        if (selectedCharacters.length > 0) params.set("characters", selectedCharacters.join(","));
        if (selectedUnitIds.length > 0) params.set("units", selectedUnitIds.join(","));
        if (selectedAttrs.length > 0) params.set("attrs", selectedAttrs.join(","));
        if (selectedRarities.length > 0) params.set("rarities", selectedRarities.join(","));
        if (selectedSupplyTypes.length > 0) params.set("supplyTypes", selectedSupplyTypes.join(","));
        if (selectedSupportUnits.length > 0) params.set("supportUnits", selectedSupportUnits.join(","));
        if (searchQuery) params.set("search", searchQuery);
        if (sortBy !== "id") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        replaceCurrentUrlSearchParams(params);
    }, [selectedCharacters, selectedUnitIds, selectedAttrs, selectedRarities, selectedSupplyTypes, selectedSupportUnits, searchQuery, sortBy, sortOrder, filtersInitialized]);

    useEffect(() => {
        async function fetchCards() {
            try {
                setIsLoading(true);
                const [cardsData, suppliesData, translationsData, cardEpisodesData] = await Promise.all([
                    fetchMasterData<ICardInfo[]>("cards.json"),
                    fetchMasterData<ICardSupply[]>("cardSupplies.json").catch(() => [] as ICardSupply[]),
                    loadTranslations(),
                    fetchMasterData<{ cardId: number }[]>("cardEpisodes.json").catch(() => []),
                ]);
                const episodeCardIds = new Set(cardEpisodesData.map(e => e.cardId));
                const supplyTypeMap = new Map<number, string>();
                suppliesData.forEach(s => supplyTypeMap.set(s.id, s.cardSupplyType));
                const enhancedCards = cardsData
                    .filter(card => episodeCardIds.has(card.id))
                    .map(card => ({
                        ...card,
                        cardSupplyType: supplyTypeMap.get(card.cardSupplyId) || "normal",
                    }));
                setCards(enhancedCards);
                setTranslations(translationsData);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        fetchCards();
    }, []);

    const filteredCards = useMemo(() => {
        let result = [...cards];
        if (selectedCharacters.length > 0) result = result.filter(c => selectedCharacters.includes(c.characterId));
        if (selectedAttrs.length > 0) result = result.filter(c => selectedAttrs.includes(c.attr));
        if (selectedRarities.length > 0) result = result.filter(c => selectedRarities.includes(c.cardRarityType));
        if (selectedSupplyTypes.length > 0) result = result.filter(c => selectedSupplyTypes.includes(c.cardSupplyType));
        if (selectedSupportUnits.length > 0) {
            result = result.filter(c => c.characterId < 21 || selectedSupportUnits.includes(c.supportUnit));
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const qNum = parseInt(q, 10);
            result = result.filter(c => {
                if (c.id === qNum) return true;
                if (c.prefix.toLowerCase().includes(q)) return true;
                const cn = translations?.cards?.prefix?.[c.prefix];
                if (cn && cn.toLowerCase().includes(q)) return true;
                if (c.cardSkillName.toLowerCase().includes(q)) return true;
                return false;
            });
        }
        const now = Date.now();
        if (!isShowSpoiler) result = result.filter(c => (c.releaseAt || c.archivePublishedAt || 0) <= now);
        result.sort((a, b) => {
            let cmp = 0;
            if (sortBy === "id") cmp = a.id - b.id;
            else if (sortBy === "releaseAt") cmp = (a.releaseAt || 0) - (b.releaseAt || 0);
            else if (sortBy === "rarity") cmp = getRarityNumber(a.cardRarityType) - getRarityNumber(b.cardRarityType);
            return sortOrder === "asc" ? cmp : -cmp;
        });
        return result;
    }, [cards, selectedCharacters, selectedAttrs, selectedRarities, selectedSupplyTypes, selectedSupportUnits, searchQuery, sortBy, sortOrder, isShowSpoiler, translations]);

    const displayedCards = useMemo(() => filteredCards.slice(0, displayCount), [filteredCards, displayCount]);

    const resetFilters = useCallback(() => {
        setSelectedCharacters([]); setSelectedUnitIds([]); setSelectedAttrs([]);
        setSelectedRarities([]); setSelectedSupplyTypes([]); setSelectedSupportUnits([]);
        setSearchQuery(""); setSortBy("id"); setSortOrder("desc");
        resetDisplayCount();
    }, [resetDisplayCount]);

    const handleSortChange = useCallback((newSortBy: string, newSortOrder: "asc" | "desc") => {
        setSortBy(newSortBy as "id" | "releaseAt" | "rarity");
        setSortOrder(newSortOrder);
        resetDisplayCount();
    }, [resetDisplayCount]);

    const quickFilterContent = (
        <CardFilters
            selectedCharacters={selectedCharacters} onCharacterChange={setSelectedCharacters}
            selectedUnitIds={selectedUnitIds} onUnitIdsChange={setSelectedUnitIds}
            selectedAttrs={selectedAttrs} onAttrChange={setSelectedAttrs}
            selectedRarities={selectedRarities} onRarityChange={setSelectedRarities}
            selectedSupplyTypes={selectedSupplyTypes} onSupplyTypeChange={setSelectedSupplyTypes}
            selectedSupportUnits={selectedSupportUnits} onSupportUnitChange={setSelectedSupportUnits}
            selectedSkillTypes={[]} onSkillTypeChange={() => {}}
            searchQuery={searchQuery} onSearchChange={setSearchQuery}
            sortBy={sortBy} sortOrder={sortOrder} onSortChange={handleSortChange}
            onReset={resetFilters}
            totalCards={cards.length} filteredCards={filteredCards.length}
        />
    );

    useQuickFilter(t("page.story.card.filterTitle"), quickFilterContent, [
        selectedCharacters, selectedUnitIds, selectedAttrs, selectedRarities,
        selectedSupplyTypes, selectedSupportUnits, searchQuery, sortBy, sortOrder,
        cards.length, filteredCards.length, t,
    ]);

    return (
        <PageContainer>
            <StoryPageHeader storyKey="card" />

            {error && (
                <ErrorState className="mb-6" title={t("common.state.loadingFailed")} message={error} retryLabel={t("common.action.retry")} />
            )}

            {/* Filters live in the global FilterDrawer (registered above via
                useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                <CardGrid cards={displayedCards} isLoading={isLoading} hrefPrefix="/story/card" />
                {!isLoading && (
                    <LoadMore
                        label={t("page.story.card.loadMore")}
                        shown={displayedCards.length}
                        total={filteredCards.length}
                        onLoadMore={loadMore}
                        allLoadedLabel={t("page.story.card.allLoaded", { count: filteredCards.length })}
                    />
                )}
            </div>
        </PageContainer>
    );
}

export default function StoryCardListClient() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <Suspense fallback={<LoadingState label={t("page.story.card.loadingFallback")} />}>
                <StoryCardContent />
            </Suspense>
        </MainLayout>
    );
}
