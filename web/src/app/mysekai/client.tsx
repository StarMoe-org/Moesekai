"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import { Card, EmptyState, ErrorState, LoadMore, LoadingState, PageContainer, PageHeader } from "@/components/md3";
import BaseFilters, { FilterButton, FilterSection } from "@/components/common/BaseFilters";
import CharacterFilter from "@/components/common/CharacterFilter";
import { useTheme, replaceAssetSourceRegion, type ServerSourceType } from "@/contexts/ThemeContext";
import InteractionEntryLink from "@/components/mysekai-interactions/InteractionEntryLink";
import { mysekaiSource, mysekaiDatabaseHref } from "@/lib/mysekai-source";

import { getMysekaiFixtureThumbnailUrl } from "@/lib/assets";
import {
    IMysekaiFixtureInfo,
    IMysekaiFixtureGenre,
    IMysekaiFixtureSubGenre,
    IMysekaiFixtureTag
} from "@/types/mysekai";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import { loadTranslations, TranslationData } from "@/lib/translations";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { getMysekaiGenreDisplayName, getMysekaiTagDisplayName } from "@/lib/mysekai-i18n";

function MysekaiContent() {
    const searchParams = useSearchParams();
    const { assetSource: preferredAssetSource, serverSource } = useTheme();
    const sourceRegion = mysekaiSource(searchParams.get("region"), serverSource);
    const assetSource = replaceAssetSourceRegion(preferredAssetSource, sourceRegion ?? serverSource);
    const [dataSource, setDataSource] = useState<ServerSourceType | null>(null);
    const { t } = useI18n();

    const [fixtures, setFixtures] = useState<IMysekaiFixtureInfo[]>([]);
    const [genres, setGenres] = useState<IMysekaiFixtureGenre[]>([]);
    const [subGenres, setSubGenres] = useState<IMysekaiFixtureSubGenre[]>([]);
    const [tags, setTags] = useState<IMysekaiFixtureTag[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersInitialized, setFiltersInitialized] = useState(false);
    const [translations, setTranslations] = useState<TranslationData | null>(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
    const [selectedSubGenre, setSelectedSubGenre] = useState<number | null>(null);
    const [selectedTag, setSelectedTag] = useState<number | null>(null);
    const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

    // Sort states
    const [sortBy, setSortBy] = useState<string>("id");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Pagination with scroll restore
    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "mysekai",
        defaultDisplayCount: 48,
        increment: 48,
        isReady: !isLoading,
    });

    // Storage key
    const STORAGE_KEY = "mysekai_filters";

    // Initialize from URL params first, then fallback to sessionStorage
    useEffect(() => {
        const genre = searchParams.get("genre");
        const subGenre = searchParams.get("subGenre");
        const tag = searchParams.get("tag");
        const chars = searchParams.get("characters");
        const units = searchParams.get("units");
        const search = searchParams.get("search");
        const sort = searchParams.get("sortBy");
        const order = searchParams.get("sortOrder");

        // If URL has params, use them
        const hasUrlParams = genre || subGenre || tag || chars || units || search || sort || order;

        if (hasUrlParams) {
            if (genre) setSelectedGenre(Number(genre));
            if (subGenre) setSelectedSubGenre(Number(subGenre));
            if (tag) setSelectedTag(Number(tag));
            if (chars) setSelectedCharacters(chars.split(",").map(Number));
            if (units) setSelectedUnitIds(units.split(","));
            if (search) setSearchQuery(search);
            if (sort) setSortBy(sort);
            if (order) setSortOrder(order as "asc" | "desc");
        } else {
            // Fallback to sessionStorage
            try {
                const saved = sessionStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const filters = JSON.parse(saved);
                    if (filters.genre !== undefined && filters.genre !== null) setSelectedGenre(filters.genre);
                    if (filters.subGenre !== undefined && filters.subGenre !== null) setSelectedSubGenre(filters.subGenre);
                    if (filters.tag !== undefined && filters.tag !== null) setSelectedTag(filters.tag);
                    if (filters.characters?.length) setSelectedCharacters(filters.characters);
                    if (filters.units?.length) setSelectedUnitIds(filters.units);
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
    }, []); // Only run once on mount

    // Save to sessionStorage and update URL when filters change
    useEffect(() => {
        if (!filtersInitialized) return;

        // Save to sessionStorage
        const filters = {
            genre: selectedGenre,
            subGenre: selectedSubGenre,
            tag: selectedTag,
            characters: selectedCharacters,
            units: selectedUnitIds,
            search: searchQuery,
            sortBy,
            sortOrder,
        };
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        } catch (_e) {
            console.log("Could not save filters to sessionStorage");
        }

        // Update URL
        const params = new URLSearchParams();
        const pinnedRegion = new URLSearchParams(window.location.search).get("region");
        if (pinnedRegion !== null) params.set("region", pinnedRegion);
        if (selectedGenre !== null) params.set("genre", String(selectedGenre));
        if (selectedSubGenre !== null) params.set("subGenre", String(selectedSubGenre));
        if (selectedTag !== null) params.set("tag", String(selectedTag));
        if (selectedCharacters.length > 0) params.set("characters", selectedCharacters.join(","));
        if (selectedUnitIds.length > 0) params.set("units", selectedUnitIds.join(","));
        if (searchQuery) params.set("search", searchQuery);
        if (sortBy !== "id") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        replaceCurrentUrlSearchParams(params);
    }, [selectedGenre, selectedSubGenre, selectedTag, selectedCharacters, selectedUnitIds, searchQuery, sortBy, sortOrder, filtersInitialized]);

    useEffect(() => {
        let cancelled = false;
        async function fetchData() {
            try {
                setIsLoading(true);
                setError(null);
                setFixtures([]);
                if (!sourceRegion) throw new Error(t("page.mysekaiInteractions.sourceMismatch"));

                const [fixturesData, genresData, subGenresData, tagsData, translationsData] = await Promise.all([
                    fetchMasterDataForServer<IMysekaiFixtureInfo[]>(sourceRegion, "mysekaiFixtures.json"),
                    fetchMasterDataForServer<IMysekaiFixtureGenre[]>(sourceRegion, "mysekaiFixtureMainGenres.json"),
                    fetchMasterDataForServer<IMysekaiFixtureSubGenre[]>(sourceRegion, "mysekaiFixtureSubGenres.json"),
                    fetchMasterDataForServer<IMysekaiFixtureTag[]>(sourceRegion, "mysekaiFixtureTags.json"),
                    loadTranslations(),
                ]);

                if (cancelled) return;
                setFixtures(fixturesData);
                setGenres(genresData);
                setSubGenres(subGenresData);
                setTags(tagsData);
                setTranslations(translationsData);
                setError(null);
            } catch (err) {
                if (cancelled) return;
                console.error("Error fetching mysekai data:", err);
                setError(err instanceof Error ? err.message : t("page.mysekai.unknownError"));
            } finally {
                if (!cancelled) {
                    setDataSource(sourceRegion);
                    setIsLoading(false);
                }
            }
        }
        fetchData();
        return () => { cancelled = true; };
    }, [sourceRegion, t]);

    // Separate tags by type and exclude tags matching fixture names
    const { characterTags, unitTags: _unitTags, generalTags } = useMemo(() => {
        const characterTags = tags.filter(t => t.mysekaiFixtureTagType === 'game_character');
        const unitTags = tags.filter(t => t.mysekaiFixtureTagType === 'unit');

        // Normalize string for comparison (remove all spaces)
        const normalize = (s: string) => s.replace(/\s+/g, '');

        // Get all fixture names for exclusion (normalized)
        const fixtureNamesNormalized = new Set(fixtures.map(f => normalize(f.name)));

        const generalTags = tags.filter(t =>
            t.mysekaiFixtureTagType !== 'game_character' &&
            t.mysekaiFixtureTagType !== 'unit' &&
            !fixtureNamesNormalized.has(normalize(t.name)) // Exclude tags matching fixture names (ignoring spaces)
        );
        return { characterTags, unitTags, generalTags };
    }, [tags, fixtures]);

    // Filter genres to only show those with fixtures
    const availableGenres = useMemo(() => {
        const genreIdsWithFixtures = new Set(fixtures.map(f => f.mysekaiFixtureMainGenreId));
        return genres.filter(g => genreIdsWithFixtures.has(g.id));
    }, [genres, fixtures]);

    // Filter and sort fixtures
    const filteredFixtures = useMemo(() => {
        let result = [...fixtures];

        // Search query (supports Japanese and Chinese names)
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(f => {
                // Match by Japanese name
                if (f.name.toLowerCase().includes(query)) return true;
                // Match by Chinese name translation
                const chineseName = translations?.mysekai?.fixtureName?.[f.name];
                if (chineseName && chineseName.toLowerCase().includes(query)) return true;
                return false;
            });
        }

        // Genre filter
        if (selectedGenre !== null) {
            result = result.filter(f => f.mysekaiFixtureMainGenreId === selectedGenre);
        }

        // SubGenre filter
        if (selectedSubGenre !== null) {
            result = result.filter(f => f.mysekaiFixtureSubGenreId === selectedSubGenre);
        }

        // Tag filter (general tags only)
        if (selectedTag !== null) {
            result = result.filter(f => {
                return Object.entries(f.mysekaiFixtureTagGroup).some(([key, val]) =>
                    key !== 'id' && val === selectedTag
                );
            });
        }

        // Character filter - filter fixtures that have any of the selected character tags
        if (selectedCharacters.length > 0) {
            // Find tag IDs for selected characters
            const selectedCharacterTagIds = characterTags
                .filter(t => selectedCharacters.includes(t.externalId || 0))
                .map(t => t.id);

            result = result.filter(f => {
                return Object.entries(f.mysekaiFixtureTagGroup).some(([key, val]) =>
                    key !== 'id' && selectedCharacterTagIds.includes(val as number)
                );
            });
        }

        // Sort
        result.sort((a, b) => {
            if (sortBy === "id") {
                return sortOrder === "asc" ? a.id - b.id : b.id - a.id;
            }
            return 0;
        });

        return result;
    }, [fixtures, searchQuery, selectedGenre, selectedSubGenre, selectedTag, selectedCharacters, characterTags, sortBy, sortOrder, translations]);

    // Displayed fixtures
    const displayedFixtures = useMemo(() => {
        return filteredFixtures.slice(0, displayCount);
    }, [filteredFixtures, displayCount]);



    // Helper to get genre name (translated)
    const getGenreName = (id: number) => {
        const genre = genres.find(g => g.id === id);
        return genre ? getMysekaiGenreDisplayName(genre.name, t) : "";
    };

    // Reset all filters
    const handleReset = () => {
        setSearchQuery("");
        setSelectedGenre(null);
        setSelectedSubGenre(null);
        setSelectedTag(null);
        setSelectedCharacters([]);
        setSelectedUnitIds([]);
        resetDisplayCount();
    };

    const hasActiveFilters = !!(searchQuery || selectedGenre || selectedSubGenre || selectedTag || selectedCharacters.length > 0);

    const quickFilterContent = (
        <BaseFilters
            title={t("page.mysekai.filterPanelTitle")}
            filteredCount={filteredFixtures.length}
            totalCount={fixtures.length}
            countUnit={t("page.mysekai.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("page.mysekai.searchPlaceholder")}
            sortOptions={[{ id: "id", label: "ID" }]}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(field, order) => {
                setSortBy(field);
                setSortOrder(order);
            }}
            hasActiveFilters={hasActiveFilters}
            onReset={handleReset}
        >
            <CharacterFilter
                selectedCharacters={selectedCharacters}
                onCharacterChange={setSelectedCharacters}
                selectedUnitIds={selectedUnitIds}
                onUnitIdsChange={setSelectedUnitIds}
            />

            <FilterSection label={t("page.mysekai.sectionLabel.mainGenre")}>
                <div className="flex flex-wrap gap-2">
                    <FilterButton selected={selectedGenre === null} onClick={() => { setSelectedGenre(null); setSelectedSubGenre(null); }} className="px-3 py-2 text-xs">
                        {t("page.mysekai.allOption")}
                    </FilterButton>
                    {availableGenres.map(g => <FilterButton key={g.id} selected={selectedGenre === g.id}
                        onClick={() => { setSelectedGenre(g.id); setSelectedSubGenre(null); }} className="px-3 py-2 text-xs">
                        {getMysekaiGenreDisplayName(g.name, t)}
                    </FilterButton>)}
                </div>
            </FilterSection>

            {selectedGenre && (
                <FilterSection label={t("page.mysekai.sectionLabel.subGenre")}>
                    <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
                        <FilterButton selected={selectedSubGenre === null} onClick={() => setSelectedSubGenre(null)} className="px-3 py-2 text-xs">
                            {t("page.mysekai.allOption")}
                        </FilterButton>
                        {subGenres.filter(sg => sg.mysekaiFixtureMainGenreId === selectedGenre).map(sg => (
                            <FilterButton key={sg.id} selected={selectedSubGenre === sg.id} onClick={() => setSelectedSubGenre(sg.id)} className="px-3 py-2 text-xs">
                                {getMysekaiGenreDisplayName(sg.name, t)}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>
            )}

            <FilterSection label={t("page.mysekai.sectionLabel.tag")}>
                <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto pr-1">
                    <FilterButton selected={selectedTag === null} onClick={() => setSelectedTag(null)} className="px-3 py-2 text-xs">
                        {t("page.mysekai.allOption")}
                    </FilterButton>
                    {generalTags.map(tag => {
                        const tagLabel = getMysekaiTagDisplayName(tag.name, t);
                        return <FilterButton key={tag.id} selected={selectedTag === tag.id} onClick={() => setSelectedTag(tag.id)} className="px-3 py-2 text-xs">
                            {tagLabel}
                        </FilterButton>;
                    })}
                </div>
            </FilterSection>


        </BaseFilters>
    );

    useQuickFilter(t("page.mysekai.filterTitle"), quickFilterContent, [
        searchQuery,
        selectedGenre,
        selectedSubGenre,
        selectedTag,
        selectedCharacters,
        selectedUnitIds,
        sortBy,
        sortOrder,
        filteredFixtures.length,
        fixtures.length,
        t,
    ]);

    return (
        <PageContainer>
            <PageHeader
                align="center"
                eyebrow={t("page.mysekai.badge")}
                title={t("page.mysekai.title")}
                highlight={t("page.mysekai.titleHighlight")}
                description={t("page.mysekai.description")}
            />

            {sourceRegion && <div className="mb-6"><InteractionEntryLink region={sourceRegion} /></div>}

            {/* Error State */}
            {error && (
                <ErrorState
                    className="mb-6"
                    title={t("page.mysekai.loadFailed")}
                    message={error}
                    retryLabel={t("common.action.retry")}
                />
            )}

            {/* Filters live in the global FilterDrawer (registered above via
                useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {isLoading || dataSource !== sourceRegion ? (
                    <LoadingState />
                ) : (
                    <>
                        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                            {displayedFixtures.map(fixture => (
                                <Card
                                    variant="elevated"
                                    href={mysekaiDatabaseHref(dataSource ?? serverSource, fixture.id, serverSource)}
                                    key={fixture.id}
                                    data-shortcut-item="true"
                                    className="group flex h-full flex-col p-3"
                                >
                                    <div className="relative aspect-square mb-2 bg-surface-container rounded-md3-sm overflow-hidden">
                                        <Image
                                            src={getMysekaiFixtureThumbnailUrl(fixture.assetbundleName, assetSource, fixture.mysekaiFixtureMainGenreId)}
                                            alt={fixture.name}
                                            fill
                                            className="object-contain p-2"
                                            unoptimized
                                        />
                                    </div>
                                    <div className="flex-1 flex flex-col">
                                        <h3 className="mb-1 type-title-s text-on-surface group-hover:text-primary transition-colors" title={fixture.name}>
                                            <TranslatedText
                                                original={fixture.name}
                                                category="mysekai"
                                                field="fixtureName"
                                                originalClassName="block"
                                                translationClassName="type-body-s text-on-surface-variant block"
                                            />
                                        </h3>
                                        <div className="mt-auto flex flex-wrap gap-1">
                                            <span className="rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 type-label-s text-on-surface-variant">
                                                ID: {fixture.id}
                                            </span>
                                            <span className="rounded-md3-xs bg-secondary-container px-1.5 py-0.5 type-label-s text-on-secondary-container">
                                                {getGenreName(fixture.mysekaiFixtureMainGenreId)}
                                            </span>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>

                        {/* Load More */}
                        <LoadMore
                            label={t("page.mysekai.loadMore")}
                            shown={displayedFixtures.length}
                            total={filteredFixtures.length}
                            onLoadMore={loadMore}
                        />

                        {/* Empty State */}
                        {!isLoading && filteredFixtures.length === 0 && (
                            <EmptyState title={t("page.mysekai.noResult")} />
                        )}
                    </>
                )}
            </div>
        </PageContainer>
    );
}

export default function MysekaiClient() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <Suspense fallback={<LoadingState label={t("page.mysekai.loadingFallback")} />}>
                <MysekaiContent />
            </Suspense>
        </MainLayout>
    );
}
