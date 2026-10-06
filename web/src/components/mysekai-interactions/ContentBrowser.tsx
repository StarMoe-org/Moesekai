"use client";

import { useId } from "react";
import { Button, EmptyState, SegmentedButton } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyKey, MolyStatus } from "@/lib/moly/contract";
import { type BrowseState, type CatalogEntry, type ContentCatalog, type ResourceSnapshot } from "@/lib/moly/catalog";
import ContentArtwork from "./ContentArtwork";
import CatalogPagination from "./CatalogPagination";
import PerformanceBadge from "./PerformanceBadge";

interface Props {
    catalog?: ContentCatalog;
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

export default function ContentBrowser({
    catalog: _catalog,
    snapshot,
    browse,
    results,
    selected,
    active,
    phase,
    page,
    pageSize,
    change,
    select,
    onPage,
}: Props) {
    const { t } = useI18n();
    const labelId = useId();

    return (
        <section
            className="interaction-browser workspace-content-browser"
            data-mysekai-catalog
            aria-labelledby={labelId}
        >
            {/* Header & Sub-scope */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                    <h2 id={labelId} className="type-title-l text-on-surface">
                        {t(
                            `page.mysekaiWorkspace.${
                                browse.tab === "activities"
                                    ? "activities"
                                    : browse.tab === "performances"
                                    ? "furnitureTalks"
                                    : "conversations"
                            }`
                        )}
                    </h2>
                    <span className="type-label-m text-on-surface-variant" aria-live="polite">
                        {t("page.mysekaiInteractions.results", { count: results.length })}
                    </span>
                </div>

                {(browse.tab === "conversations" || browse.tab === "performances") && (
                    <SegmentedButton
                        className="w-auto shrink-0"
                        density={-2}
                        value={browse.tab === "performances" ? "performances" : "conversations"}
                        onValueChange={(tab) => change({ tab })}
                        options={[
                            { value: "conversations", label: t("page.mysekaiWorkspace.allConversations") },
                            { value: "performances", label: t("page.mysekaiWorkspace.furnitureTalks") },
                        ]}
                    />
                )}
            </div>

            {/* Results Grid */}
            {results.length === 0 ? (
                <div className="rounded-md3-lg bg-surface-container-low">
                    <EmptyState
                        title={t("page.mysekaiInteractions.noResults")}
                        action={
                            <Button variant="tonal" size="xs" onClick={() => change({ query: "", characters: [], availability: "all" })}>
                                {t("page.mysekaiInteractions.reset")}
                            </Button>
                        }
                    />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                    {results.slice((page - 1) * pageSize, page * pageSize).map(entry => {
                        const isSelected = selected === entry.key;
                        const isActive = active === entry.key;
                        return (
                            <button
                                type="button"
                                key={entry.key}
                                aria-pressed={isSelected}
                                onClick={() => select(entry.key)}
                                data-content-key={entry.key}
                                className={`state-layer focus-ring group relative flex flex-col rounded-md3-lg p-3 text-left transition-[background-color,box-shadow] duration-200 ease-md3-standard ${
                                    isSelected
                                        ? "bg-secondary-container text-on-secondary-container ring-2 ring-primary"
                                        : "bg-surface-card ring-1 ring-outline-variant/70 hover:shadow-elev-1"
                                }`}
                            >
                                {/* Artwork Container */}
                                <div className="relative">
                                    <ContentArtwork entry={entry} snapshot={snapshot} />

                                    {/* Category badge */}
                                    <div className="absolute top-2 left-2 pointer-events-none">
                                        {entry.presentation.category === "fixture_performance" ? (
                                            <PerformanceBadge />
                                        ) : (
                                            <span className="inline-block rounded-md3-sm bg-surface-container-lowest px-2 py-0.5 type-label-s text-primary shadow-elev-1">
                                                {t(`page.mysekaiInteractions.category.${entry.presentation.category}`)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Live active dot indicator */}
                                    {isActive && (
                                        <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md3-sm bg-primary px-2 py-0.5 type-label-s text-on-primary shadow-elev-1">
                                            <span className="h-1.5 w-1.5 rounded-full bg-on-primary animate-pulse" />
                                            <span>
                                                {t(
                                                    `page.mysekaiInteractions.phase.${
                                                        phase === "completed"
                                                            ? "completed"
                                                            : entry.presentation.primaryAction === "inspect"
                                                            ? "viewing"
                                                            : "playing"
                                                    }`
                                                )}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Card Copy */}
                                <div className="flex-1 flex flex-col mt-2.5 min-w-0">
                                    <h3
                                        className="line-clamp-1 type-title-s text-on-surface"
                                        title={entry.title}
                                    >
                                        {entry.title}
                                    </h3>
                                    <p className="mt-1 line-clamp-1 type-body-s text-on-surface-variant">
                                        {entry.characters.map(c => c.name).join(" · ")}
                                    </p>

                                    <div className="mt-3 flex items-center justify-between border-t border-outline-variant pt-2 type-label-m text-on-surface-variant">
                                        <span className="rounded-md3-xs bg-surface-container-high px-1.5 py-0.5">
                                            {entry.presentation.textMode === "bubble"
                                                ? t("page.mysekaiInteractions.bubble")
                                                : t(`page.mysekaiInteractions.behavior.${entry.presentation.behavior}`)}
                                        </span>
                                        {!entry.available && (
                                            <span className="text-tertiary">
                                                {t("page.mysekaiInteractions.unavailable")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            <CatalogPagination
                page={page}
                pages={Math.max(1, Math.ceil(results.length / pageSize))}
                total={results.length}
                pageSize={pageSize}
                onPage={onPage}
            />
        </section>
    );
}
