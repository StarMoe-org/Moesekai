"use client";

import { useId } from "react";
import BaseFilters, { FilterButton, FilterSection, FilterToggle } from "@/components/common/BaseFilters";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyKey, MolyStatus } from "@/lib/moly/contract";
import { type BrowseState, type CatalogEntry, type ContentCatalog, type ResourceSnapshot } from "@/lib/moly/catalog";
import ContentArtwork from "./ContentArtwork";
import CatalogPagination from "./CatalogPagination";
import PerformanceBadge from "./PerformanceBadge";

interface Props {
    catalog: ContentCatalog;
    snapshot: ResourceSnapshot;
    browse: BrowseState;
    results: CatalogEntry[];
    selected: MolyKey | null;
    active: MolyKey | null;
    phase: MolyStatus["phase"];
    page: number;
    pageSize: number;
    change(value: Partial<BrowseState>): void;
    select(key: MolyKey): void;
    onPage(page: number): void;
}

export default function ContentBrowser({ catalog, snapshot, browse, results, selected, active, phase, page, pageSize, change, select, onPage }: Props) {
    const { t } = useI18n();
    const labelId = useId();
    return <section className="interaction-browser workspace-content-browser" data-mysekai-catalog aria-labelledby={labelId}>
        <div className="interaction-section-heading">
            <h2 id={labelId}>{t(`page.mysekaiWorkspace.${browse.tab === "activities" ? "activities" : browse.tab === "performances" ? "furnitureTalks" : "conversations"}`)}</h2>
            <span aria-live="polite">{t("page.mysekaiInteractions.results", { count: results.length })}</span>
        </div>
        {(browse.tab === "conversations" || browse.tab === "performances") && <div className="workspace-conversation-scope" aria-label={t("page.mysekaiWorkspace.conversations")}>
            <button data-tab="all-conversations" aria-pressed={browse.tab === "conversations"} onClick={() => change({ tab: "conversations" })}>{t("page.mysekaiWorkspace.allConversations")}</button>
            <button data-tab="performances" aria-pressed={browse.tab === "performances"} onClick={() => change({ tab: "performances" })}>{t("page.mysekaiWorkspace.furnitureTalks")}</button>
        </div>}
        <div className="interaction-filters">
            <BaseFilters compact variant="plain" filteredCount={results.length} totalCount={catalog.entries.length}
                searchQuery={browse.query} onSearchChange={query => change({ query })}
                searchPlaceholder={t("page.mysekaiInteractions.search")}
                hasActiveFilters={Boolean(browse.query || browse.characters.length || browse.availability !== "all")}
                onReset={() => change({ query: "", characters: [], availability: "all" })}>
                <FilterSection label={t("page.mysekaiInteractions.characters")}>
                    <div className="workspace-character-filter" role="group" aria-label={t("page.mysekaiInteractions.characters")}>
                        <FilterButton selected={browse.characters.length === 0} onClick={() => change({ characters: [] })} className="px-3 py-2 text-xs">
                            {t("page.mysekaiInteractions.allCharacters")}
                        </FilterButton>
                        {catalog.characters.map(character => <FilterButton key={character.id} selected={browse.characters.includes(character.id)}
                            onClick={() => change({ characters: browse.characters.includes(character.id)
                                ? browse.characters.filter(id => id !== character.id) : [...browse.characters, character.id] })}
                            className="px-3 py-2 text-xs">{character.name}</FilterButton>)}
                    </div>
                </FilterSection>
                <FilterToggle label={t("page.mysekaiWorkspace.sceneAvailable")} selected={browse.availability === "ready"}
                    onClick={() => change({ availability: browse.availability === "ready" ? "all" : "ready" })} />
            </BaseFilters>
        </div>
        {results.length === 0 ? <div className="interaction-empty">
            <h3>{t("page.mysekaiInteractions.noResults")}</h3>
            <button className="interaction-button" onClick={() => change({ query: "", characters: [], availability: "all" })}>{t("page.mysekaiInteractions.reset")}</button>
        </div> : <div className={`interaction-grid interaction-grid-${browse.tab}`}>
            {results.slice((page - 1) * pageSize, page * pageSize).map(entry => <button type="button" className="interaction-card" key={entry.key}
                aria-pressed={selected === entry.key} onClick={() => select(entry.key)} data-content-key={entry.key}>
                <ContentArtwork entry={entry} snapshot={snapshot} />
                <span className="interaction-card-copy">
                    {entry.presentation.category === "fixture_performance" ? <PerformanceBadge />
                        : <span className="interaction-eyebrow">{t(`page.mysekaiInteractions.category.${entry.presentation.category}`)}</span>}
                    <strong>{entry.title}</strong>
                    <span className="interaction-card-cast">{entry.characters.map(character => character.name).join(" · ")}</span>
                    <span className="interaction-card-foot">
                        <span>{entry.presentation.textMode === "bubble" ? t("page.mysekaiInteractions.bubble")
                            : t(`page.mysekaiInteractions.behavior.${entry.presentation.behavior}`)}</span>
                        {active === entry.key ? <span className="interaction-live-dot">{t(`page.mysekaiInteractions.phase.${phase === "completed" ? "completed" : entry.presentation.primaryAction === "inspect" ? "viewing" : "playing"}`)}</span>
                            : !entry.available ? <span>{t("page.mysekaiInteractions.unavailable")}</span> : null}
                    </span>
                </span>
            </button>)}
        </div>}
        <CatalogPagination page={page} pages={Math.max(1, Math.ceil(results.length / pageSize))} total={results.length} pageSize={pageSize} onPage={onPage} />
    </section>;
}
