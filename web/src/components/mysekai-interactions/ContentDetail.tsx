"use client";

import { useId } from "react";
import { Banner, Button, Chip, CircularProgress, ErrorState, Icon } from "@/components/md3";
import { mdChevronRight, mdKeyboardArrowDown, mdPlayArrowFill, mdShare } from "@/components/md3/icons";
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
                        <span className="inline-block rounded-md3-sm bg-secondary-container px-2 py-0.5 type-label-m text-on-secondary-container">
                            {t(`page.mysekaiInteractions.category.${entry.presentation.category}`)}
                        </span>
                    )}
                    {entry.variant && entry.variant.count > 1 && (
                        <span className="type-label-m text-on-surface-variant">
                            {t("page.mysekaiInteractions.variant", entry.variant)}
                        </span>
                    )}
                </div>
                <h2 id={headingId} className="type-title-l text-on-surface">
                    {entry.title}
                </h2>
            </div>

            {/* Artwork Showcase */}
            <ContentArtwork entry={entry} snapshot={snapshot} large character={character} fixture={fixture} />

            {/* Actions: Play & Share */}
            <div className="flex gap-2.5">
                <Button
                    variant="filled"
                    className="flex-1"
                    disabled={!canPlay || restoring}
                    onClick={play}
                    data-action="play-selected"
                >
                    {preparing ? <CircularProgress size={18} /> : <Icon path={mdPlayArrowFill} size={20} />}
                    <span>
                        {preparing
                            ? t("page.mysekaiWorkspace.preparing")
                            : previewing
                            ? t("page.mysekaiInteractions.r4b.engage")
                            : t(`${playing || replacing ? "page.mysekaiInteractions" : "page.mysekaiWorkspace"}.${action}`)}
                    </span>
                </Button>

                <Button variant="tonal" icon={mdShare} onClick={share} title={t("common.action.share")} className="shrink-0">
                    {t("common.action.share")}
                </Button>
            </div>

            {reason && (
                <Banner tone="warning">
                    {t(`page.mysekaiInteractions.${reason === "scene_unavailable" ? "sceneUnavailable" : "unavailable"}`)}
                </Banner>
            )}

            {detailLoading && (
                <div className="flex items-center justify-center gap-2 py-6 type-body-s text-on-surface-variant">
                    <CircularProgress size={18} />
                    <span>{t("common.state.loading")}</span>
                </div>
            )}

            {detailFailed && (
                <ErrorState title={t("page.mysekaiInteractions.detailFailed")} retryLabel={t("common.action.retry")} onRetry={retry} />
            )}

            {/* Bubble Preview */}
            {entry.preview && (
                <div className="flex flex-col gap-2.5 rounded-md3-lg bg-surface-container p-3.5">
                    <span className="type-title-s text-on-surface">
                        {t("page.mysekaiInteractions.r4b.previewSource")}
                    </span>
                    {entry.preview.available ? (
                        <>
                            <p className="rounded-md3-md bg-surface-container-lowest p-3 type-body-m italic text-on-surface-variant">
                                “{entry.preview.text}”
                            </p>
                            <Button
                                variant="tonal"
                                size="xs"
                                className="self-start"
                                disabled={!canPlay || restoring || previewing}
                                onClick={preview}
                                data-action="preview-bubble"
                            >
                                {t("page.mysekaiInteractions.r4b.previewBubble")}
                            </Button>
                        </>
                    ) : (
                        <p className="type-body-s text-on-surface-variant">
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
                    className="group overflow-hidden rounded-md3-lg bg-surface-container"
                    aria-label={t(`page.mysekaiInteractions.${bubble ? "bubble" : "transcript"}`)}
                >
                    <summary className="state-layer focus-ring flex cursor-pointer list-none select-none items-center justify-between px-3.5 py-3 type-title-s text-on-surface">
                        <span className="flex items-center gap-2">
                            <span>{t(`page.mysekaiInteractions.${bubble ? "bubble" : "transcript"}`)}</span>
                            <span className="rounded-md3-xs bg-surface-container-highest px-1.5 py-0.5 type-label-s text-on-surface-variant">
                                {entry.lines?.length}
                            </span>
                        </span>
                        <Icon path={mdKeyboardArrowDown} size={20} className="text-on-surface-variant transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-3.5 pb-3.5 pt-1 flex flex-col gap-2 max-h-[340px] overflow-y-auto">
                        {entry.lines?.map((line, index) => (
                            <div key={index} className="flex flex-col gap-0.5">
                                <span className="type-label-m text-primary">
                                    {line.speaker}
                                </span>
                                <p className="rounded-md3-md bg-surface-container-lowest p-2.5 type-body-m text-on-surface">
                                    {line.text}
                                </p>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {/* Silent Activity Note */}
            {silent && !detailLoading && (
                <div className="rounded-md3-lg bg-surface-container p-4">
                    <h3 className="mb-1 type-title-s text-on-surface">
                        {t("page.mysekaiInteractions.noDialogue")}
                    </h3>
                    <p className="type-body-s text-on-surface-variant">
                        {entry.description || t("page.mysekaiWorkspace.silentActivity")}
                    </p>
                </div>
            )}

            {/* Associated Fixtures */}
            {Boolean(entry.fixtures?.length) && (
                <div className="flex flex-col gap-2">
                    <h3 className="type-title-s text-on-surface">
                        {t("page.mysekaiInteractions.fixtureDetails")}
                    </h3>
                    <div className="flex flex-col gap-1.5">
                        {entry.fixtures?.map(item => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => fixture(item.id)}
                                className="state-layer focus-ring flex cursor-pointer items-center justify-between rounded-md3-md bg-surface-container p-2.5 text-left type-body-m text-on-surface"
                            >
                                <span>{item.name}</span>
                                <Icon path={mdChevronRight} size={20} className="text-on-surface-variant" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Related chips */}
            {Boolean(entry.related?.length) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.related?.map(item => (
                        <Chip
                            key={`${item.tab}:${item.fixtureId}`}
                            variant="assist"
                            onClick={() => related(item.fixtureId, item.tab)}
                        >
                            {t(`page.mysekaiInteractions.tabs.${item.tab}`)} <span className="text-primary">{item.count}</span>
                        </Chip>
                    ))}
                </div>
            )}
        </section>
    );
}
