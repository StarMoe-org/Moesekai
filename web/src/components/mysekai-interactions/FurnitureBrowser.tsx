"use client";

import FurnitureThumbnail from "./FurnitureThumbnail";
import BaseFilters, { FilterSection, FilterToggle } from "@/components/common/BaseFilters";
import CharacterFilter from "@/components/common/CharacterFilter";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useI18n } from "@/contexts/I18nContext";
import { getMysekaiFixtureThumbnailUrl } from "@/lib/assets";
import { getMysekaiGenreDisplayName, getMysekaiTagDisplayName } from "@/lib/mysekai-i18n";
import type { CatalogEntry, ResourceSnapshot } from "@/lib/moly/catalog";
import type { FurnitureData, FixtureRelations } from "@/lib/moly/furnitureData";
import type { BrowseState, FurnitureFilters } from "@/lib/moly/workspaceNavigation";
import type { IMysekaiFixtureInfo } from "@/types/mysekai";
import type { MolyKey } from "@/lib/moly/contract";
import CatalogPagination from "./CatalogPagination";
import SdPortrait from "./SdPortrait";

interface Props {
    data: FurnitureData;
    snapshot?: ResourceSnapshot;
    results: IMysekaiFixtureInfo[];
    relations: Map<number, FixtureRelations>;
    runtimeEntries: Map<string, CatalogEntry>;
    artworkPending: boolean;
    assetSource: Parameters<typeof getMysekaiFixtureThumbnailUrl>[1];
    browse: BrowseState;
    filters: FurnitureFilters;
    selected: MolyKey | null;
    page: number;
    pageSize: number;
    change(value: Partial<BrowseState>): void;
    filter(value: Partial<FurnitureFilters>): void;
    select(key: MolyKey): void;
    onPage(page: number): void;
    reset(): void;
}

export default function FurnitureBrowser({ data, snapshot, results, relations, runtimeEntries, artworkPending, assetSource,
    browse, filters, selected, page, pageSize, change, filter, select, onPage, reset }: Props) {
    const { t } = useI18n();
    const genreIds = new Set(data.fixtures.map(fixture => fixture.mysekaiFixtureMainGenreId));
    const genres = data.genres.filter(genre => genreIds.has(genre.id));
    const subGenres = data.subGenres.filter(genre => !filters.genre || genre.mysekaiFixtureMainGenreId === filters.genre);
    const names = new Set(data.fixtures.map(fixture => fixture.name.replace(/\s+/g, "")));
    const tags = data.tags.filter(tag => !["game_character", "unit"].includes(tag.mysekaiFixtureTagType ?? "") && !names.has(tag.name.replace(/\s+/g, "")));
    const refined = Boolean(filters.genre || filters.subGenre || filters.tag || filters.characters.length || filters.units.length);
    return <section className="interaction-browser workspace-furniture" data-mysekai-catalog aria-label={t("page.mysekaiWorkspace.furniture")}>
        <div className="workspace-filters">
            <BaseFilters compact variant="plain" filteredCount={results.length} totalCount={data.fixtures.length}
                searchQuery={browse.query} onSearchChange={query => change({ query })}
                searchPlaceholder={t("page.mysekaiWorkspace.searchFurniture")}
                hasActiveFilters={refined || Boolean(browse.query || browse.characters.length || browse.fixture || browse.availability !== "all")}
                onReset={reset}>
                <div className="workspace-filter-row">
                    <FilterSection label={t("page.mysekai.detail.fields.mainGenre")}>
                        <select aria-label={t("page.mysekai.detail.fields.mainGenre")} value={filters.genre ?? ""}
                            onChange={event => filter({ genre: Number(event.target.value) || null, subGenre: null })}>
                            <option value="">{t("page.mysekaiWorkspace.all")}</option>
                            {genres.map(genre => <option key={genre.id} value={genre.id}>{getMysekaiGenreDisplayName(genre.name, t)}</option>)}
                        </select>
                    </FilterSection>
                    <FilterSection label={t("page.mysekaiWorkspace.order")}>
                        <select aria-label={t("page.mysekaiWorkspace.order")} value={`${filters.sortBy}:${filters.sortOrder}`}
                            onChange={event => { const [sortBy, sortOrder] = event.target.value.split(":"); filter({ sortBy: sortBy as "id" | "name", sortOrder: sortOrder as "asc" | "desc" }); }}>
                            <option value="id:desc">{t("page.mysekaiWorkspace.newest")}</option>
                            <option value="id:asc">{t("page.mysekaiWorkspace.oldest")}</option>
                            <option value="name:asc">{t("page.mysekaiWorkspace.nameOrder")}</option>
                        </select>
                    </FilterSection>
                    <FilterToggle label={t("page.mysekaiWorkspace.sceneAvailable")} selected={browse.availability === "ready"}
                        onClick={() => change({ availability: browse.availability === "ready" ? "all" : "ready" })} />
                </div>
                <details className="workspace-refine">
                    <summary>{t("page.mysekaiWorkspace.refine")}{refined && <span className="workspace-filter-dot" />}</summary>
                    <div className="workspace-filter-row">
                        <FilterSection label={t("page.mysekai.detail.fields.subGenre")}>
                            <select aria-label={t("page.mysekai.detail.fields.subGenre")} value={filters.subGenre ?? ""} onChange={event => filter({ subGenre: Number(event.target.value) || null })}>
                                <option value="">{t("page.mysekaiWorkspace.all")}</option>
                                {subGenres.map(genre => <option key={genre.id} value={genre.id}>{getMysekaiGenreDisplayName(genre.name, t)}</option>)}
                            </select>
                        </FilterSection>
                        <FilterSection label={t("page.mysekai.detail.tags")}>
                            <select aria-label={t("page.mysekai.detail.tags")} value={filters.tag ?? ""} onChange={event => filter({ tag: Number(event.target.value) || null })}>
                                <option value="">{t("page.mysekaiWorkspace.all")}</option>
                                {tags.map(tag => <option key={tag.id} value={tag.id}>{getMysekaiTagDisplayName(tag.name, t)}</option>)}
                            </select>
                        </FilterSection>
                    </div>
                    <CharacterFilter selectedCharacters={filters.characters} selectedUnitIds={filters.units}
                        onCharacterChange={characters => filter({ characters })} onUnitIdsChange={units => filter({ units })}
                        characterLabel={t("page.mysekaiWorkspace.characterTheme")} />
                </details>
            </BaseFilters>
        </div>
        {data.partial && <p className="workspace-inline-notice" role="status">{t("page.mysekaiWorkspace.partialFilters")}</p>}
        {results.length ? <div className="workspace-furniture-grid">
            {results.slice((page - 1) * pageSize, page * pageSize).map(fixture => {
                const key: MolyKey = `fixture:${fixture.id}`;
                const relation = relations.get(fixture.id);
                const runtime = runtimeEntries.get(key);
                return <button type="button" className="workspace-fixture-card" key={key} aria-pressed={selected === key}
                    onClick={() => select(key)} data-content-key={key}>
                    <span className="workspace-fixture-image"><FurnitureThumbnail snapshot={snapshot} image={runtime?.image} pending={artworkPending}
                        fallback={getMysekaiFixtureThumbnailUrl(fixture.assetbundleName, assetSource, fixture.mysekaiFixtureMainGenreId)} alt="" width={180} height={160} />
                        <span className="workspace-fixture-id">#{fixture.id}</span>
                        {runtime?.available && <span className="workspace-scene-mark" aria-label={t("page.mysekaiWorkspace.sceneAvailable")}><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m10 2 7 4v8l-7 4-7-4V6l7-4Z M3 6l7 4 7-4 M10 10v8" /></svg></span>}
                    </span>
                    <span className="workspace-fixture-copy"><strong><TranslatedText original={fixture.name} category="mysekai" field="fixtureName" translationClassName="workspace-translation" /></strong>
                        <span className="workspace-fixture-category">{getMysekaiGenreDisplayName(data.genres.find(genre => genre.id === fixture.mysekaiFixtureMainGenreId)?.name ?? "", t)}</span>
                    </span>
                    {snapshot && relation && <span className="workspace-fixture-relations">
                        <span className="workspace-cast-stack" aria-hidden="true">{relation.characters.slice(0, 3).map(person => <SdPortrait key={person.id} snapshot={snapshot} unit={person.id} name={person.name} size={30} />)}</span>
                        <span>{t("page.mysekaiWorkspace.relatedCount", { count: relation.talks.length + relation.activities.length })}</span>
                    </span>}
                </button>;
            })}
        </div> : <div className="interaction-empty"><h3>{t("page.mysekaiInteractions.noResults")}</h3><button className="interaction-button" onClick={reset}>{t("common.action.reset")}</button></div>}
        <CatalogPagination page={page} pages={Math.max(1, Math.ceil(results.length / pageSize))} total={results.length} pageSize={pageSize} onPage={onPage} />
    </section>;
}
