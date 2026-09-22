"use client";

import { useId } from "react";
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
                    <h2 id={labelId} className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
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
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium" aria-live="polite">
                        {t("page.mysekaiInteractions.results", { count: results.length })}
                    </span>
                </div>

                {(browse.tab === "conversations" || browse.tab === "performances") && (
                    <div className="flex gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 shrink-0">
                        <button
                            type="button"
                            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                browse.tab === "conversations"
                                    ? "bg-white dark:bg-slate-700 text-miku shadow-xs font-bold"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                            }`}
                            onClick={() => change({ tab: "conversations" })}
                        >
                            {t("page.mysekaiWorkspace.allConversations")}
                        </button>
                        <button
                            type="button"
                            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                browse.tab === "performances"
                                    ? "bg-white dark:bg-slate-700 text-miku shadow-xs font-bold"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                            }`}
                            onClick={() => change({ tab: "performances" })}
                        >
                            {t("page.mysekaiWorkspace.furnitureTalks")}
                        </button>
                    </div>
                )}
            </div>

            {/* Results Grid */}
            {results.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                    <h3 className="font-bold text-slate-700 dark:text-slate-300 text-base">
                        {t("page.mysekaiInteractions.noResults")}
                    </h3>
                    <button
                        type="button"
                        className="px-4 py-2 text-xs font-semibold rounded-xl bg-miku text-white hover:bg-miku/90 transition-colors"
                        onClick={() => change({ query: "", characters: [], availability: "all" })}
                    >
                        {t("page.mysekaiInteractions.reset")}
                    </button>
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
                                className={`pressable ios-glass-card ios-glass-card-interactive rounded-2xl p-3 flex flex-col text-left transition-all relative border group ${
                                    isSelected
                                        ? "ring-2 ring-miku bg-miku/5 dark:bg-miku/10 border-miku"
                                        : "border-slate-200/80 dark:border-slate-800/80 hover:border-miku/60"
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
                                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-white/90 dark:bg-slate-900/90 text-miku border border-miku/30 shadow-xs backdrop-blur-xs">
                                                {t(`page.mysekaiInteractions.category.${entry.presentation.category}`)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Live active dot indicator */}
                                    {isActive && (
                                        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/90 text-white shadow-xs backdrop-blur-xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
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
                                        className="font-bold text-sm text-slate-800 dark:text-slate-100 line-clamp-1 group-hover:text-miku transition-colors"
                                        title={entry.title}
                                    >
                                        {entry.title}
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                                        {entry.characters.map(c => c.name).join(" · ")}
                                    </p>

                                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                                        <span className="bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded">
                                            {entry.presentation.textMode === "bubble"
                                                ? t("page.mysekaiInteractions.bubble")
                                                : t(`page.mysekaiInteractions.behavior.${entry.presentation.behavior}`)}
                                        </span>
                                        {!entry.available && (
                                            <span className="text-amber-500 font-medium">
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
