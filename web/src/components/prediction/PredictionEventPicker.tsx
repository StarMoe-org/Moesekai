"use client";
import React from "react";
import Image from "next/image";
import { Chip, Icon, Select, SegmentedButton, Surface } from "@/components/md3";
import { mdGroups, mdKidStar } from "@/components/md3/icons";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import { findActiveWlChapter } from "@/lib/prediction/use-prediction-event";
import type { PredictionEventState } from "@/lib/prediction/types";

/** Marks the running event in the event selector. */
export const ACTIVE_DOT = <span aria-hidden className="block size-2 rounded-full bg-success" />;

interface PredictionEventPickerProps {
    state: PredictionEventState;
}

interface PredictionServerEventControlsProps extends PredictionEventPickerProps {
    /** Extra items appended to the controls row (the prediction page puts its end-of-event notice here). */
    children?: React.ReactNode;
}

/** Server toggle and event selector. */
export function PredictionServerEventControls({ state, children }: PredictionServerEventControlsProps) {
    const { t } = useI18n();
    const { server, setServer, events, eventsLoading, selectedEventId, setSelectedEventId, masterEvent } = state;
    // An event opened from a link may be missing from the ranking API's list; it still gets an option so the
    // selector names the event the page shows.
    const unlistedEventId = selectedEventId != null && !events.some(event => event.id === selectedEventId)
        ? selectedEventId
        : null;

    return (
        <div className="flex flex-col sm:flex-row gap-4 mb-8 items-center sm:items-stretch">
            {/* Server Toggle */}
            <SegmentedButton
                value={server}
                onValueChange={setServer}
                options={[
                    { value: "cn", label: <ServerRegionLabel server="cn" label={t("page.prediction.servers.cn")} /> },
                    { value: "jp", label: <ServerRegionLabel server="jp" label={t("page.prediction.servers.jp")} /> },
                ]}
                showCheckmark={false}
                className="shrink-0 sm:w-auto"
            />

            {/* Event Selector */}
            <div className="w-full sm:flex-1">
                <Select
                    value={selectedEventId}
                    onValueChange={setSelectedEventId}
                    disabled={eventsLoading || (events.length === 0 && unlistedEventId == null)}
                    aria-label={t("page.prediction.title")}
                    options={[
                        ...(unlistedEventId != null ? [{ value: unlistedEventId, label: `#${unlistedEventId} ${masterEvent?.name ?? ""}` }] : []),
                        ...events.map(event => ({ value: event.id, label: `#${event.id} ${event.name}`, leading: event.is_active ? ACTIVE_DOT : undefined })),
                    ]}
                    placeholder={eventsLoading ? t("page.prediction.events.loading") : t("page.prediction.events.empty")}
                />
            </div>
            {children}
        </div>
    );
}

/** Sticky World Link chapter selector (overall + one button per chapter); renders nothing for non-WL events. */
export function PredictionWlChapterBar({ state }: PredictionEventPickerProps) {
    const { t } = useI18n();
    const { isWorldBloomEvent, eventWorldBlooms, selectedWlChapter, setSelectedWlChapter, now } = state;

    if (!isWorldBloomEvent || eventWorldBlooms.length === 0) return null;

    const activeWlChapter = findActiveWlChapter(eventWorldBlooms, selectedWlChapter);

    return (
        <Surface as="aside" tone="default" radius="lg" elevation={1} className="sm:sticky sm:top-[5.5rem] z-20 p-3 mb-6">
            <div className="flex items-center justify-between mb-2.5 px-1">
                <span className="type-title-s text-on-surface flex items-center gap-1.5">
                    <Icon path={mdGroups} size={20} className="text-primary" />
                    <span>{t("page.prediction.wl.chapters")}</span>
                </span>
                <span className="type-label-m text-on-surface-variant tabular-nums">
                    {selectedWlChapter === "overall"
                        ? t("page.prediction.wl.overall")
                        : activeWlChapter
                            ? t("page.prediction.wl.chapterItem", { no: activeWlChapter.chapterNo, name: getCharacterName(t, activeWlChapter.gameCharacterId) })
                            : ""}
                </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {/* Overall Button */}
                <Chip
                    selected={selectedWlChapter === "overall"}
                    showCheckmark={false}
                    icon={mdKidStar}
                    onClick={() => setSelectedWlChapter("overall")}
                    className="shrink-0"
                >
                    {t("page.prediction.wl.overall")}
                </Chip>

                {/* Character Chapter Buttons */}
                {eventWorldBlooms.map((wb) => {
                    const isSelected = selectedWlChapter === wb.gameCharacterId;
                    const isOngoing = now >= wb.chapterStartAt && now <= wb.aggregateAt;
                    const isEnded = now > wb.aggregateAt;
                    const statusKey = isOngoing ? "ongoing" : isEnded ? "ended" : "upcoming";

                    return (
                        <Chip
                            key={wb.gameCharacterId}
                            selected={isSelected}
                            showCheckmark={false}
                            onClick={() => setSelectedWlChapter(wb.gameCharacterId)}
                            className="shrink-0"
                            avatar={(
                                <span className="relative block w-6 h-6 rounded-full overflow-hidden">
                                    <Image
                                        src={getCharacterIconUrl(wb.gameCharacterId)}
                                        alt={getCharacterName(t, wb.gameCharacterId)}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                </span>
                            )}
                        >
                            <span className="inline-flex items-center gap-2">
                                <span>
                                    {t("page.prediction.wl.chapterItem", {
                                        no: wb.chapterNo,
                                        name: getCharacterName(t, wb.gameCharacterId)
                                    })}
                                </span>
                                <span className={`type-label-s px-1.5 py-0.5 rounded-md3-xs ${
                                    isOngoing
                                        ? "bg-tertiary-container text-on-tertiary-container"
                                        : isEnded
                                            ? "bg-surface-container-high text-on-surface-variant"
                                            : "bg-secondary-container text-on-secondary-container"
                                }`}>
                                    {t(`page.prediction.wl.chapterStatus.${statusKey}`)}
                                </span>
                            </span>
                        </Chip>
                    );
                })}
            </div>
        </Surface>
    );
}

/** Server / event / WL-chapter selectors shared by the prediction page and the planner. */
export function PredictionEventPicker({ state }: PredictionEventPickerProps) {
    return (
        <>
            <PredictionServerEventControls state={state} />
            <PredictionWlChapterBar state={state} />
        </>
    );
}

export default PredictionEventPicker;
