"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import CostumeFilters from "@/components/costumes/CostumeFilters";
import DatabaseTable from "@/components/cards/DatabaseTable";
import ViewToggle, { type ListViewMode } from "@/components/cards/ViewToggle";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCostumeThumbnailUrl } from "@/lib/assets";
import {
    ICostumeInfo,
    IMoeCostumeData,
    PART_TYPE_LABEL_KEYS,
    SOURCE_LABEL_KEYS,
} from "@/types/costume";
import { ICardInfo } from "@/types/types"; // Import ICardInfo
import { fetchMasterData } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { Card, EmptyState, ErrorState, LoadMore, LoadingState, PageContainer, PageHeader } from "@/components/md3";

// ... imports remain the same

// CostumeGroup interface and groupCostumes function are removed as ICostumeInfo is now the group itself.

function CostumesContent() {
    const searchParams = useSearchParams();
    const { assetSource, isShowSpoiler } = useTheme();
    const { t } = useTranslation();
    const { t: tI18n } = useI18n();
    const translateWithFallback = (key: string | undefined, fallback: string) => {
        if (!key) return fallback;
        const label = tI18n(key);
        return label === key ? fallback : label;
    };

    const [costumes, setCostumes] = useState<ICostumeInfo[]>([]);
    const [allCards, setAllCards] = useState<ICardInfo[]>([]); // Store all cards
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [view, setView] = useState<ListViewMode>("grid");
    const [selectedPartTypes, setSelectedPartTypes] = useState<string[]>([]);
    const [selectedSources, setSelectedSources] = useState<string[]>([]);
    const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
    const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
    const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [onlyRelatedCardCostumes, setOnlyRelatedCardCostumes] = useState(false); // New filter state

    // Sort states
    const [sortBy, setSortBy] = useState<string>("id");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Pagination with scroll restore
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "costumes",
        defaultDisplayCount: 48,
        increment: 48,
        isReady: !isLoading,
    });

    // Storage key
    const STORAGE_KEY = "costumes_filters";

    // Initialize from URL params first, then fallback to sessionStorage
    useEffect(() => {
        const partTypes = searchParams.get("partTypes");
        const sources = searchParams.get("sources");
        const rarities = searchParams.get("rarities");
        const genders = searchParams.get("genders");
        const chars = searchParams.get("characters");
        const units = searchParams.get("units");
        const search = searchParams.get("search");
        const sort = searchParams.get("sortBy");
        const order = searchParams.get("sortOrder");
        const related = searchParams.get("related"); // New param
        const viewParam = searchParams.get("view");

        const hasUrlParams = partTypes || sources || rarities || genders || chars || units || search || sort || order || related || viewParam;

        if (hasUrlParams) {
            if (partTypes) setSelectedPartTypes(partTypes.split(","));
            if (sources) setSelectedSources(sources.split(","));
            if (rarities) setSelectedRarities(rarities.split(","));
            if (genders) setSelectedGenders(genders.split(","));
            if (chars) setSelectedCharacters(chars.split(",").map(Number));
            if (units) setSelectedUnitIds(units.split(","));
            if (search) setSearchQuery(search);
            if (sort) setSortBy(sort);
            if (order) setSortOrder(order as "asc" | "desc");
            if (related) setOnlyRelatedCardCostumes(related === "true");
            if (viewParam) setView(viewParam === "table" || viewParam === "list" ? "table" : "grid");
        } else {
            try {
                const saved = sessionStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const filters = JSON.parse(saved);
                    // Handle migration or previous single-value format if needed, but assuming new format or empty
                    if (filters.partTypes?.length) setSelectedPartTypes(filters.partTypes); else if (filters.partType) setSelectedPartTypes([filters.partType]);
                    if (filters.sources?.length) setSelectedSources(filters.sources); else if (filters.source) setSelectedSources([filters.source]);
                    if (filters.rarities?.length) setSelectedRarities(filters.rarities); else if (filters.rarity) setSelectedRarities([filters.rarity]);
                    if (filters.genders?.length) setSelectedGenders(filters.genders); else if (filters.gender) setSelectedGenders([filters.gender]);

                    if (filters.characters?.length) setSelectedCharacters(filters.characters);
                    if (filters.units?.length) setSelectedUnitIds(filters.units);
                    if (filters.search) setSearchQuery(filters.search);
                    if (filters.sortBy) setSortBy(filters.sortBy);
                    if (filters.sortOrder) setSortOrder(filters.sortOrder);
                    if (filters.onlyRelatedCardCostumes !== undefined) setOnlyRelatedCardCostumes(filters.onlyRelatedCardCostumes);
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
            partTypes: selectedPartTypes,
            sources: selectedSources,
            rarities: selectedRarities,
            genders: selectedGenders,
            characters: selectedCharacters,
            units: selectedUnitIds,
            search: searchQuery,
            sortBy,
            sortOrder,
            onlyRelatedCardCostumes,
        };
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        } catch (_e) {
            console.log("Could not save filters to sessionStorage");
        }

        // Update URL
        const params = new URLSearchParams();
        if (selectedPartTypes.length > 0) params.set("partTypes", selectedPartTypes.join(","));
        if (selectedSources.length > 0) params.set("sources", selectedSources.join(","));
        if (selectedRarities.length > 0) params.set("rarities", selectedRarities.join(","));
        if (selectedGenders.length > 0) params.set("genders", selectedGenders.join(","));
        if (selectedCharacters.length > 0) params.set("characters", selectedCharacters.join(","));
        if (selectedUnitIds.length > 0) params.set("units", selectedUnitIds.join(","));
        if (searchQuery) params.set("search", searchQuery);
        if (sortBy !== "id") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        if (onlyRelatedCardCostumes) params.set("related", "true");
        if (view !== "grid") params.set("view", view);
        replaceCurrentUrlSearchParams(params);
    }, [selectedPartTypes, selectedSources, selectedRarities, selectedGenders, selectedCharacters, selectedUnitIds, searchQuery, sortBy, sortOrder, onlyRelatedCardCostumes, view, filtersInitialized]);

    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                // Parallel fetch
                const [costumeData, cardList] = await Promise.all([
                    fetchMasterData<IMoeCostumeData>("moe_costume.json"),
                    fetchMasterData<ICardInfo[]>("cards.json")
                ]);

                setCostumes(costumeData.costumes || []);
                setAllCards(cardList || []);
                setError(null);
            } catch (err) {
                console.error("Error fetching data:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, []);

    // Filter and sort costumes (Use ICostumeInfo directly)
    const filteredCostumes = useMemo(() => {
        let result = [...costumes];

        // Search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(c => {
                const translatedName = t("costumes", "name", c.name);
                return c.name.toLowerCase().includes(query) ||
                    c.designer.toLowerCase().includes(query) ||
                    (translatedName && translatedName.toLowerCase().includes(query));
            });
        }

        // Part type filter - Check in partTypes array
        if (selectedPartTypes.length > 0) {
            result = result.filter(c => c.partTypes && c.partTypes.some(pt => selectedPartTypes.includes(pt)));
        }

        // Source filter
        if (selectedSources.length > 0) {
            result = result.filter(c => selectedSources.includes(c.source));
        }

        // Rarity filter
        if (selectedRarities.length > 0) {
            result = result.filter(c => selectedRarities.includes(c.costume3dRarity));
        }

        // Gender filter
        if (selectedGenders.length > 0) {
            result = result.filter(c => selectedGenders.includes(c.gender));
        }

        // Character filter
        if (selectedCharacters.length > 0) {
            result = result.filter(c =>
                selectedCharacters.some(charId => c.characterIds.includes(charId))
            );
        }

        // Associated Card Filter
        if (onlyRelatedCardCostumes && selectedCharacters.length > 0) {
            // Filter costumes that have cardIds containing any card associated with selected characters
            const selectedCharCards = new Set(
                allCards
                    .filter(card => selectedCharacters.includes(card.characterId))
                    .map(card => card.id)
            );

            result = result.filter(c => {
                // If not a card source, always show (unless filtered by other filters)
                if (c.source !== "card") return true;

                // If it is a card source, it MUST be associated with the selected character(s)
                if (!c.cardIds || c.cardIds.length === 0) return false;
                return c.cardIds.some(cid => selectedCharCards.has(cid));
            });
        }

        // Spoiler filter
        const now = Date.now();
        if (!isShowSpoiler) {
            result = result.filter(c =>
                (c.publishedAt || 0) <= now
            );
        }

        // Sort
        result.sort((a, b) => {
            if (sortBy === "id") {
                return sortOrder === "asc" ? a.costumeNumber - b.costumeNumber : b.costumeNumber - a.costumeNumber;
            }
            if (sortBy === "publishedAt") {
                return sortOrder === "asc" ? (a.publishedAt || 0) - (b.publishedAt || 0) : (b.publishedAt || 0) - (a.publishedAt || 0);
            }
            return 0;
        });

        return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [costumes, allCards, searchQuery, selectedPartTypes, selectedSources, selectedRarities, selectedGenders, selectedCharacters, onlyRelatedCardCostumes, sortBy, sortOrder, isShowSpoiler]);

    const displayedGroups = useMemo(() => {
        return filteredCostumes.slice(0, displayCount);
    }, [filteredCostumes, displayCount]);

    // Reset all filters
    const handleReset = () => {
        setSearchQuery("");
        setSelectedPartTypes([]);
        setSelectedSources([]);
        setSelectedRarities([]);
        setSelectedGenders([]);
        setSelectedCharacters([]);
        setSelectedUnitIds([]);
        setOnlyRelatedCardCostumes(false);
        resetDisplayCount();
    };

    const quickFilterContent = (
        <CostumeFilters
            selectedCharacters={selectedCharacters}
            onCharacterChange={setSelectedCharacters}
            selectedUnitIds={selectedUnitIds}
            onUnitIdsChange={setSelectedUnitIds}
            selectedPartTypes={selectedPartTypes}
            onPartTypeChange={setSelectedPartTypes}
            selectedSources={selectedSources}
            onSourceChange={setSelectedSources}
            selectedRarities={selectedRarities}
            onRarityChange={setSelectedRarities}
            selectedGenders={selectedGenders}
            onGenderChange={setSelectedGenders}
            onlyRelatedCardCostumes={onlyRelatedCardCostumes}
            onOnlyRelatedCardCostumesChange={setOnlyRelatedCardCostumes}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(field, order) => {
                setSortBy(field);
                setSortOrder(order);
            }}
            onReset={handleReset}
            totalCount={costumes.length}
            filteredCount={filteredCostumes.length}
        />
    );

    useQuickFilter(tI18n("page.costumes.filterTitle"), quickFilterContent, [
        selectedCharacters,
        selectedUnitIds,
        selectedPartTypes,
        selectedSources,
        selectedRarities,
        selectedGenders,
        onlyRelatedCardCostumes,
        searchQuery,
        sortBy,
        sortOrder,
        costumes.length,
        filteredCostumes.length,
    ]);

    return (
        <PageContainer>
            <PageHeader
                eyebrow={tI18n("page.costumes.badge")}
                title={tI18n("page.costumes.title")}
                highlight={tI18n("page.costumes.titleHighlight")}
                description={tI18n("page.costumes.description")}
            />

            {/* Error State */}
            {error && (
                <ErrorState className="mb-6" title={tI18n("page.costumes.loadFailed")} message={error} retryLabel={tI18n("common.action.retry")} />
            )}

            {/* Grid. Filters live in the global FilterDrawer (registered
                above via useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {isLoading ? (
                    <LoadingState />
                ) : (
                    <>
                        <div className="mb-4 flex justify-end"><ViewToggle value={view} onChange={setView} /></div>
                        {view === "table" ? <DatabaseTable rows={displayedGroups.map(costume => {
                            const part = costume.parts.body?.[0] ?? costume.parts.hair?.[0] ?? costume.parts.head?.[0] ?? Object.values(costume.parts).flat()[0];
                            return {
                                id: costume.costumeNumber,
                                href: `/costumes/${costume.costumeNumber}`,
                                thumbnail: <Image src={getCostumeThumbnailUrl(part?.assetbundleName ?? "", assetSource)} alt={costume.name} fill className="object-contain" unoptimized />,
                                name: <TranslatedText original={costume.name} category="costumes" field="name" />,
                                details: <><div>{costume.partTypes.map(pt => translateWithFallback(PART_TYPE_LABEL_KEYS[pt], pt)).join(" · ")}</div><div>{translateWithFallback(SOURCE_LABEL_KEYS[costume.source], costume.source)}</div>{(costume.publishedAt || 0) > Date.now() && <span className="text-tertiary">{tI18n("page.costumes.spoilerBadge")}</span>}</>,
                            };
                        })} /> : <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                            {displayedGroups.map(costume => {
                                let assetName = "";
                                let repPart;
                                if (costume.parts["body"] && costume.parts["body"].length > 0) {
                                    repPart = costume.parts["body"][0];
                                } else if (costume.parts["hair"] && costume.parts["hair"].length > 0) {
                                    repPart = costume.parts["hair"][0];
                                } else if (costume.parts["head"] && costume.parts["head"].length > 0) {
                                    repPart = costume.parts["head"][0];
                                } else {
                                    const firstKey = Object.keys(costume.parts)[0];
                                    if (firstKey && costume.parts[firstKey].length > 0) {
                                        repPart = costume.parts[firstKey][0];
                                    }
                                }

                                if (repPart) {
                                    assetName = repPart.assetbundleName;
                                }

                                const now = Date.now();
                                const isSpoiler = (costume.publishedAt || 0) > now;

                                return (
                                    <Card
                                        variant="elevated"
                                        href={`/costumes/${costume.costumeNumber}`}
                                        key={costume.costumeNumber}
                                        data-shortcut-item="true"
                                        className="group flex h-full flex-col p-3"
                                    >
                                        <div className="relative mb-2 aspect-square overflow-hidden rounded-md3-sm bg-surface-container">
                                            <Image
                                                src={getCostumeThumbnailUrl(assetName, assetSource)}
                                                alt={costume.name}
                                                fill
                                                className="object-contain p-2"
                                                unoptimized
                                            />
                                        </div>
                                        <div className="flex flex-1 flex-col">
                                            {isSpoiler && (
                                                <div className="mb-1">
                                                    <span className="inline-block rounded-md3-xs bg-tertiary px-1.5 py-0.5 type-label-s text-on-tertiary">
                                                        {tI18n("page.costumes.spoilerBadge")}
                                                    </span>
                                                </div>
                                            )}
                                            <h3 className="mb-1 type-title-s text-on-surface" title={costume.name}>
                                                <TranslatedText
                                                    original={costume.name}
                                                    category="costumes"
                                                    field="name"
                                                    originalClassName="block"
                                                    translationClassName="block type-body-s text-on-surface-variant"
                                                />
                                            </h3>
                                            <div className="mt-auto flex flex-wrap gap-1">
                                                {costume.partTypes.map(pt => (
                                                    <span key={pt} className="rounded-md3-xs bg-secondary-container px-1.5 py-0.5 type-label-s text-on-secondary-container">
                                                        {translateWithFallback(PART_TYPE_LABEL_KEYS[pt], pt)}
                                                    </span>
                                                ))}
                                                <span className="rounded-md3-xs bg-surface-container-highest px-1.5 py-0.5 type-label-s text-on-surface-variant">
                                                    {translateWithFallback(SOURCE_LABEL_KEYS[costume.source], costume.source)}
                                                </span>
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>}

                        {/* Load More */}
                        <LoadMore
                            label={tI18n("page.costumes.loadMore")}
                            shown={displayedGroups.length}
                            total={filteredCostumes.length}
                            onLoadMore={loadMore}
                        />

                        {/* Empty State */}
                        {!isLoading && filteredCostumes.length === 0 && (
                            <EmptyState title={tI18n("page.costumes.noResult")} />
                        )}
                    </>
                )}
            </div>
        </PageContainer>
    );
}
export default function CostumesClient() {
    return (
        <MainLayout>
            <Suspense fallback={<CostumesLoadingFallback />}>
                <CostumesContent />
            </Suspense>
        </MainLayout>
    );
}

function CostumesLoadingFallback() {
    const { t } = useI18n();
    return <LoadingState className="min-h-[50vh]" label={t("page.costumes.loadingFallback")} />;
}
