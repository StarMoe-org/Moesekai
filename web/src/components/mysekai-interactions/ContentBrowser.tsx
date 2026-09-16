"use client";

import { useId } from "react";
import BaseFilters, { FilterSection, FilterToggle } from "@/components/common/BaseFilters";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyKey } from "@/lib/moly/contract";
import { MOLY_TABS, type BrowseState, type CatalogEntry, type ContentCatalog, type ResourceSnapshot } from "@/lib/moly/catalog";
import ContentArtwork from "./ContentArtwork";

interface Props {
    catalog: ContentCatalog;
    snapshot: ResourceSnapshot;
    browse: BrowseState;
    results: CatalogEntry[];
    selected: MolyKey | null;
    active: MolyKey | null;
    displayCount: number;
    change(value: Partial<BrowseState>): void;
    select(key: MolyKey): void;
    more(): void;
}

export default function ContentBrowser({ catalog, snapshot, browse, results, selected, active, displayCount, change, select, more }: Props) {
    const { t } = useI18n();
    const labelId = useId();
    const characterId = useId();
    return <section className="interaction-browser" aria-labelledby={labelId}>
        <div className="interaction-section-heading">
            <h2 id={labelId}>{t("page.mysekaiInteractions.browse")}</h2>
            <span aria-live="polite">{t("page.mysekaiInteractions.results", { count: results.length })}</span>
        </div>
        <div className="interaction-tabs" aria-label={t("page.mysekaiInteractions.browse")}>
            {MOLY_TABS.map(tab => <button key={tab} type="button" aria-pressed={browse.tab === tab} onClick={() => change({ tab })} data-tab={tab}>
                {t(`page.mysekaiInteractions.tabs.${tab}`)}
            </button>)}
        </div>
        <div className="interaction-filters">
            <BaseFilters variant="plain" filteredCount={results.length} totalCount={catalog.entries.length}
                searchQuery={browse.query} onSearchChange={query => change({ query })}
                searchPlaceholder={t("page.mysekaiInteractions.search")}
                hasActiveFilters={Boolean(browse.query || browse.character || browse.availability !== "all")}
                onReset={() => change({ query: "", character: null, availability: "all" })}>
                <FilterSection label={t("page.mysekaiInteractions.characters")}>
                    <select id={characterId} aria-label={t("page.mysekaiInteractions.characters")} value={browse.character ?? ""}
                        onChange={event => change({ character: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">{t("page.mysekaiInteractions.allCharacters")}</option>
                        {catalog.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}
                    </select>
                </FilterSection>
                <FilterToggle label={t("page.mysekaiInteractions.availableOnly")} selected={browse.availability === "ready"}
                    onClick={() => change({ availability: browse.availability === "ready" ? "all" : "ready" })} />
            </BaseFilters>
        </div>
        {results.length === 0 ? <div className="interaction-empty">
            <h3>{t("page.mysekaiInteractions.noResults")}</h3>
            <button className="interaction-button" onClick={() => change({ query: "", character: null, availability: "all" })}>{t("page.mysekaiInteractions.reset")}</button>
        </div> : <div className={`interaction-grid interaction-grid-${browse.tab}`}>
            {results.slice(0, displayCount).map(entry => <button type="button" className="interaction-card" key={entry.key}
                aria-pressed={selected === entry.key} onClick={() => select(entry.key)} data-content-key={entry.key}>
                <ContentArtwork entry={entry} snapshot={snapshot} />
                <span className="interaction-card-copy">
                    <span className="interaction-eyebrow">{t(`page.mysekaiInteractions.category.${entry.presentation.category}`)}</span>
                    <strong>{entry.title}</strong>
                    <span className="interaction-card-cast">{entry.characters.map(character => character.name).join(" · ")}</span>
                    <span className="interaction-card-foot">
                        <span>{entry.presentation.textMode === "bubble" ? t("page.mysekaiInteractions.bubble")
                            : t(`page.mysekaiInteractions.behavior.${entry.presentation.behavior}`)}</span>
                        {active === entry.key ? <span className="interaction-live-dot">{t("page.mysekaiInteractions.phase.playing")}</span>
                            : !entry.available ? <span>{t("page.mysekaiInteractions.unavailable")}</span> : null}
                    </span>
                </span>
            </button>)}
        </div>}
        {results.length > displayCount && <div className="interaction-load-more">
            <button className="interaction-button" onClick={more}>{t("page.mysekaiInteractions.loadMore")}</button>
        </div>}
    </section>;
}
