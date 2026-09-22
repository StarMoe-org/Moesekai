"use client";

import { useId } from "react";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyEntry, MolyTab } from "@/lib/moly/contract";
import type { ResourceSnapshot } from "@/lib/moly/catalog";
import ContentArtwork from "./ContentArtwork";
import PerformanceBadge from "./PerformanceBadge";

interface Props {
    entry: MolyEntry;
    snapshot: ResourceSnapshot;
    detailLoading: boolean;
    detailFailed: boolean;
    canPlay: boolean;
    preparing: boolean;
    reason: "source_unavailable" | "scene_unavailable" | null;
    playing: boolean;
    replacing: boolean;
    restoring: boolean;
    play(): void;
    preview(): void;
    previewing: boolean;
    share(): void;
    retry(): void;
    related(fixture: number, tab: MolyTab): void;
    character(id: number): void;
    fixture(id: number): void;
}

/** Clean, modern presentation for selected interaction item. */
export default function ContentDetail({
    entry,
    snapshot,
    detailLoading,
    detailFailed,
    canPlay,
    preparing,
    reason,
    playing,
    replacing,
    restoring,
    play,
    preview,
    previewing,
    share,
    retry,
    related,
    character,
    fixture,
}: Props) {
    const { t } = useI18n();
    const headingId = useId();
    const silent = entry.presentation.textMode === "none" && entry.presentation.category !== "furniture";
    const bubble = entry.presentation.textMode === "bubble";
    const action = playing
        ? "replay"
        : replacing
        ? "replace"
        : entry.presentation.primaryAction === "inspect"
        ? "inspectScene"
        : "playScene";

    return (
        <section
            className="p-5 flex flex-col gap-4 text-left"
            aria-labelledby={headingId}
            data-selected-content={entry.key}
        >
            {/* Header: Title & Badges */}
            <div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {entry.presentation.category === "fixture_performance" ? (
                        <PerformanceBadge />
                    ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-miku/10 text-miku border border-miku/30">
                            {t(`page.mysekaiInteractions.category.${entry.presentation.category}`)}
                        </span>
                    )}
                    {entry.variant && entry.variant.count > 1 && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {t("page.mysekaiInteractions.variant", entry.variant)}
                        </span>
                    )}
                </div>
                <h2 id={headingId} className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 leading-snug">
                    {entry.title}
                </h2>
            </div>

            {/* Artwork Showcase */}
            <ContentArtwork entry={entry} snapshot={snapshot} large character={character} fixture={fixture} />

            {/* Actions: Play & Share */}
            <div className="flex gap-2.5">
                <button
                    type="button"
                    disabled={!canPlay || restoring}
                    onClick={play}
                    data-action="play-selected"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-miku hover:bg-miku/90 text-white font-bold shadow-sm transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
                >
                    {preparing ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor" aria-hidden="true">
                            <path d="M6 3.8a.7.7 0 0 1 1.04-.61l9 5.5a.7.7 0 0 1 0 1.22l-9 5.5A.7.7 0 0 1 6 14.8v-11Z" />
                        </svg>
                    )}
                    <span>
                        {preparing
                            ? t("page.mysekaiWorkspace.preparing")
                            : previewing
                            ? t("page.mysekaiInteractions.r4b.engage")
                            : t(`${playing || replacing ? "page.mysekaiInteractions" : "page.mysekaiWorkspace"}.${action}`)}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={share}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    title={t("common.action.share")}
                >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    <span>{t("common.action.share")}</span>
                </button>
            </div>

            {reason && (
                <p className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs text-amber-700 dark:text-amber-300" role="status">
                    {t(`page.mysekaiInteractions.${reason === "scene_unavailable" ? "sceneUnavailable" : "unavailable"}`)}
                </p>
            )}

            {detailLoading && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
                    <span className="w-4 h-4 border-2 border-miku border-t-transparent rounded-full animate-spin" />
                    <span>{t("common.state.loading")}</span>
                </div>
            )}

            {detailFailed && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center justify-between" role="alert">
                    <span>{t("page.mysekaiInteractions.detailFailed")}</span>
                    <button type="button" className="underline font-bold ml-2 cursor-pointer" onClick={retry}>
                        {t("common.action.retry")}
                    </button>
                </div>
            )}

            {/* Bubble Preview */}
            {entry.preview && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-2.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {t("page.mysekaiInteractions.r4b.previewSource")}
                    </span>
                    {entry.preview.available ? (
                        <>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800 leading-relaxed italic">
                                “{entry.preview.text}”
                            </p>
                            <button
                                type="button"
                                disabled={!canPlay || restoring || previewing}
                                onClick={preview}
                                data-action="preview-bubble"
                                className="px-3 py-2 rounded-lg bg-slate-200/80 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-semibold text-xs transition-colors self-start cursor-pointer disabled:opacity-50"
                            >
                                {t("page.mysekaiInteractions.r4b.previewBubble")}
                            </button>
                        </>
                    ) : (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            {t("page.mysekaiInteractions.r4b.previewUnavailable")}
                        </p>
                    )}
                </div>
            )}

            {/* Dialogue Transcript */}
            {!detailLoading && Boolean(entry.lines?.length) && (
                <details
                    key={entry.key}
                    open
                    className="group rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 overflow-hidden"
                    aria-label={t(`page.mysekaiInteractions.${bubble ? "bubble" : "transcript"}`)}
                >
                    <summary className="px-3.5 py-3 cursor-pointer flex items-center justify-between select-none font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 list-none">
                        <span className="flex items-center gap-2">
                            <span>{t(`page.mysekaiInteractions.${bubble ? "bubble" : "transcript"}`)}</span>
                            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400">
                                {entry.lines?.length}
                            </span>
                        </span>
                        <svg
                            viewBox="0 0 20 20"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="transition-transform group-open:rotate-180 text-slate-400"
                        >
                            <path d="m5 7.5 5 5 5-5" />
                        </svg>
                    </summary>
                    <div className="px-3.5 pb-3.5 pt-1 flex flex-col gap-2 max-h-[340px] overflow-y-auto">
                        {entry.lines?.map((line, index) => (
                            <div key={index} className="flex flex-col gap-0.5 text-xs">
                                <span className="font-bold text-miku text-[11px]">
                                    {line.speaker}
                                </span>
                                <p className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 leading-relaxed">
                                    {line.text}
                                </p>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {/* Silent Activity Note */}
            {silent && !detailLoading && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs">
                    <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">
                        {t("page.mysekaiInteractions.noDialogue")}
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                        {entry.description || t("page.mysekaiWorkspace.silentActivity")}
                    </p>
                </div>
            )}

            {/* Associated Fixtures */}
            {Boolean(entry.fixtures?.length) && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {t("page.mysekaiInteractions.fixtureDetails")}
                    </h3>
                    <div className="flex flex-col gap-1.5">
                        {entry.fixtures?.map(item => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => fixture(item.id)}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-200 transition-colors cursor-pointer text-left"
                            >
                                <span className="font-medium">{item.name}</span>
                                <span className="text-slate-400">›</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Related chips */}
            {Boolean(entry.related?.length) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.related?.map(item => (
                        <button
                            key={`${item.tab}:${item.fixtureId}`}
                            type="button"
                            className="px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-miku transition-colors border border-slate-200/60 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5"
                            onClick={() => related(item.fixtureId, item.tab)}
                        >
                            <span>{t(`page.mysekaiInteractions.tabs.${item.tab}`)}</span>
                            <span className="font-bold text-miku">{item.count}</span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
