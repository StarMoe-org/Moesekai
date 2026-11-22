"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "@/components/LocalizedLink";
import { Button, Chip, Icon, LoadingState, Surface, Switch, Tabs, cn } from "@/components/md3";
import { mdMovie, mdOpenInNew, mdRestartAlt } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { groupLive2DFacials, groupLive2DMotions, live2dMotionStyle, type Live2DClipRow, type Live2DMotionGroup } from "@/lib/live2dViewer/clips";
import type { Live2DRegion } from "@/lib/live2dViewer/config";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import type { Live2DViewer } from "@/lib/live2dViewer/viewer";
import { storyPlayerHref } from "@/lib/storyPlayer/episodes";
import { Live2DBackgroundGrid } from "./Live2DBackgroundGrid";
import { Live2DClipRows } from "./Live2DClipRows";
import { Live2DModelPicker } from "./Live2DModelPicker";
import { live2dGroupKey, live2dOwnerAliases } from "./labels";
import type { Live2DViewerState } from "./useLive2DViewer";

type Tab = "models" | "motions" | "facials" | "scene";

interface Live2DInspectorProps {
    region: Live2DRegion;
    /** The asset site the reader chose (for the backgrounds). */
    line: "main" | "backup";
    models: readonly Live2DModel[];
    /** Where the server's list is: loading, failed (with a retry), or in. */
    listStatus: "loading" | "error" | "ready";
    onRetryList: () => void;
    current: Live2DModel | null;
    onSelect: (model: Live2DModel) => void;
    /** The viewer's state once the model is in, else null. */
    state: Live2DViewerState | null;
    act: (change: (viewer: Live2DViewer) => void | Promise<unknown>) => Promise<void>;
    /** The address of a motion's or facial's clip that could not be fetched, or null. */
    clipError: string | null;
    loop: boolean;
    onLoopChange: (loop: boolean) => void;
    background: string | null;
    onBackgroundChange: (name: string | null) => void;
    className?: string;
}

/**
 * The panel beside the stage, in tabs: the models to choose from, the model's motions (by style)
 * and facials (by emotion), and the scene (background, physics, breath).
 */
export function Live2DInspector({
    region, line, models, listStatus, onRetryList, current, onSelect, state, act, clipError, loop, onLoopChange, background, onBackgroundChange, className,
}: Live2DInspectorProps) {
    const { t, locale } = useI18n();
    const [tab, setTab] = useState<Tab>("models");
    // The group being looked through; it follows the model shown until another is chosen.
    const [browsing, setBrowsing] = useState<string | null>(null);
    const group = browsing ?? (current ? live2dGroupKey(current) : "character:1");
    // The clip being fetched (a motion or facial is fetched the first time it is used).
    const [pending, setPending] = useState<string | null>(null);

    const currentAliases = useMemo(() => (current ? live2dOwnerAliases(current, locale) : []), [current, locale]);
    const currentEpisodes = current?.episodes ?? [];
    const currentEpisodeCount = current ? Math.max(current.episodeCount, currentEpisodes.length) : 0;
    const hasStoryInfo = Boolean(current && (currentEpisodes.length > 0 || currentAliases.length > 0));

    const handleSelectModel = (model: Live2DModel) => {
        setBrowsing(null);
        onSelect(model);
    };

    const motionGroups = useMemo(() => groupLive2DMotions(state?.motions ?? []), [state?.motions]);
    const facialRows = useMemo(() => groupLive2DFacials(state?.facials ?? []), [state?.facials]);
    // The style shown: the one chosen for this model, else the playing motion's.
    const [styleOf, setStyleOf] = useState<{ model: string; style: string } | null>(null);
    const style = (current && styleOf?.model === current.id ? styleOf.style : null)
        ?? live2dMotionStyle(motionGroups, state?.motion ?? state?.defaultMotion ?? null)
        ?? motionGroups[0]?.style
        ?? null;
    const shownGroup = motionGroups.find(item => item.style === style) ?? motionGroups[0];

    const pick = (name: string, change: (viewer: Live2DViewer) => Promise<unknown>) => {
        setPending(name);
        void act(change).finally(() => setPending(value => (value === name ? null : value)));
    };
    const actionLabel = (row: Live2DClipRow) => row.words.map(word => t(`page.live2d.motionAction.${word}`)).join(" + ") || row.raw;
    const emotionLabel = (row: Live2DClipRow) => row.words.map(word => t(`page.live2d.emotion.${word}`)).join(" + ") || row.raw;
    const styleLabel = (item: Live2DMotionGroup) => (item.known ? t(`page.live2d.motionStyle.${item.style}`) : item.style === "other" ? t("page.live2d.motionStyleOther") : item.style);

    const tabs = [
        { value: "models" as const, label: t("page.live2d.tab.models") },
        { value: "motions" as const, label: t("page.live2d.tab.motions"), disabled: !current },
        { value: "facials" as const, label: t("page.live2d.tab.facials"), disabled: !current },
        { value: "scene" as const, label: t("page.live2d.tab.scene") },
    ];
    const waiting = !state && (
        <p className="px-1 py-6 text-center type-body-m text-on-surface-variant">{t("page.live2d.controlsWaiting")}</p>
    );

    return (
        <Surface as="aside" tone="low" radius="xl" className={cn("flex flex-col overflow-hidden @4xl:min-h-0", className)} aria-label={t("page.live2d.controls")}>
            <Tabs items={tabs} value={tab} onValueChange={setTab} aria-label={t("page.live2d.controls")} className="shrink-0" />
            {clipError && (
                <p role="alert" className="mx-3 mt-3 rounded-md3-md bg-error-container px-3 py-2 type-body-s text-on-error-container">
                    {t("page.live2d.clipFailed")}
                </p>
            )}
            <div className="p-3 @4xl:min-h-0 @4xl:flex-1 @4xl:overflow-y-auto">
                {tab === "models" && (
                    listStatus === "loading" ? (
                        <LoadingState className="min-h-40" label={t("page.live2d.listLoading")} />
                    ) : listStatus === "error" ? (
                        <Notice>
                            <p className="type-body-m text-error">{t("page.live2d.listFailed")}</p>
                            <Button variant="tonal" size="s" onClick={onRetryList}>{t("common.action.retry")}</Button>
                        </Notice>
                    ) : models.length === 0 ? (
                        <Notice>
                            <p className="type-title-s text-on-surface">{t("page.live2d.listEmpty")}</p>
                            <p className="type-body-s text-on-surface-variant">{t("page.live2d.listEmptyDescription")}</p>
                        </Notice>
                    ) : (
                        <div className="space-y-3">
                            {hasStoryInfo && (
                                <ModelStoryMeta
                                    region={region}
                                    episodes={currentEpisodes}
                                    episodeCount={currentEpisodeCount}
                                    aliases={currentAliases}
                                    compact
                                />
                            )}
                            <Live2DModelPicker models={models} current={current} group={group} onGroupChange={setBrowsing} onSelect={handleSelectModel} />
                        </div>
                    )
                )}

                {tab === "motions" && (waiting || (state && (
                    state.motions.length === 0 ? (
                        <Notice><p className="type-body-m text-on-surface-variant">{t("page.live2d.noMotions")}</p></Notice>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <Switch checked={loop} onCheckedChange={onLoopChange} label={t("page.live2d.loop")} />
                                <Button
                                    variant="text"
                                    size="s"
                                    icon={mdRestartAlt}
                                    disabled={!state.defaultMotion || state.motion === state.defaultMotion}
                                    onClick={() => state.defaultMotion && pick(state.defaultMotion, viewer => viewer.playMotion(viewer.defaultMotion ?? ""))}
                                >
                                    {t("page.live2d.defaultMotion")}
                                </Button>
                            </div>
                            {motionGroups.length > 1 && (
                                <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="group" aria-label={t("page.live2d.motionStyleTitle")}>
                                    {motionGroups.map(item => (
                                        <Chip
                                            key={item.style}
                                            variant="filter"
                                            selected={item.style === shownGroup?.style}
                                            showCheckmark={false}
                                            className="shrink-0"
                                            onClick={() => current && setStyleOf({ model: current.id, style: item.style })}
                                        >
                                            {styleLabel(item)}
                                            <span className="ml-1 type-label-s opacity-70">{item.rows.reduce((sum, row) => sum + row.clips.length, 0)}</span>
                                        </Chip>
                                    ))}
                                </div>
                            )}
                            {shownGroup && (
                                <Live2DClipRows
                                    rows={shownGroup.rows}
                                    label={actionLabel}
                                    current={state.motion}
                                    pending={pending}
                                    fallback={state.defaultMotion}
                                    onPick={name => pick(name, viewer => viewer.playMotion(name, { loop }))}
                                />
                            )}
                        </div>
                    )
                )))}

                {tab === "facials" && (waiting || (state && (
                    state.facials.length === 0 ? (
                        <Notice><p className="type-body-m text-on-surface-variant">{t("page.live2d.noFacials")}</p></Notice>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex justify-end">
                                <Button
                                    variant="text"
                                    size="s"
                                    icon={mdRestartAlt}
                                    disabled={!state.defaultFacial || state.facial === state.defaultFacial}
                                    onClick={() => state.defaultFacial && pick(state.defaultFacial, viewer => viewer.setFacial(viewer.defaultFacial ?? ""))}
                                >
                                    {t("page.live2d.defaultFacial")}
                                </Button>
                            </div>
                            <Live2DClipRows
                                rows={facialRows}
                                label={emotionLabel}
                                current={state.facial}
                                pending={pending}
                                fallback={state.defaultFacial}
                                onPick={name => pick(name, viewer => viewer.setFacial(name))}
                            />
                        </div>
                    )
                )))}

                {tab === "scene" && (
                    <div className="space-y-5">
                        {hasStoryInfo && (
                            <ModelStoryMeta
                                region={region}
                                episodes={currentEpisodes}
                                episodeCount={currentEpisodeCount}
                                aliases={currentAliases}
                            />
                        )}
                        <section className="space-y-2">
                            <h3 className="type-title-s text-on-surface">{t("page.live2d.motionOptions")}</h3>
                            <Switch
                                checked={state?.physics ?? true}
                                disabled={!state?.hasPhysics}
                                onCheckedChange={on => void act(viewer => { viewer.physics = on; })}
                                label={t("page.live2d.physics")}
                            />
                            <Switch
                                checked={state?.breath ?? true}
                                disabled={!state}
                                onCheckedChange={on => void act(viewer => { viewer.breath = on; })}
                                label={t("page.live2d.breath")}
                            />
                        </section>
                        <section className="space-y-2">
                            <h3 className="type-title-s text-on-surface">{t("page.live2d.background")}</h3>
                            <Live2DBackgroundGrid key={`${region}|${line}`} region={region} line={line} current={background} onSelect={onBackgroundChange} />
                        </section>
                    </div>
                )}
            </div>
        </Surface>
    );
}

function ModelStoryMeta({
    region,
    episodes,
    episodeCount,
    aliases,
    compact = false,
}: {
    region: Live2DRegion;
    episodes: readonly string[];
    episodeCount: number;
    aliases: readonly string[];
    compact?: boolean;
}) {
    const { t } = useI18n();
    const watchTitle = t("page.live2d.watchInStoryPlayer");

    if (compact) {
        return (
            <div className="space-y-1.5 rounded-md3-md border border-outline-variant/60 bg-surface-container px-2.5 py-2">
                {episodes.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                        <span className="inline-flex shrink-0 items-center gap-1 type-label-m text-on-surface">
                            <Icon path={mdMovie} size={15} className="text-primary" />
                            {t("page.live2d.storyAppearances")}
                        </span>
                        <span className="shrink-0 type-label-s text-on-surface-variant">
                            {t("page.live2d.storyAppearancesCount", { count: episodeCount })}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                            {episodes.map(ep => (
                                <Link
                                    key={ep}
                                    href={storyPlayerHref(region, ep)}
                                    title={watchTitle}
                                    className="state-layer focus-ring inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 font-mono type-label-s text-primary transition-colors hover:bg-secondary-container hover:text-on-secondary-container"
                                >
                                    <span>{ep}</span>
                                    <Icon path={mdOpenInNew} size={12} />
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
                {aliases.length > 0 && (
                    <p className="truncate type-label-s text-on-surface-variant">
                        <span className="text-on-surface">{t("page.live2d.aliasesLabel")}:</span>{" "}
                        {aliases.join(" / ")}
                    </p>
                )}
            </div>
        );
    }

    return (
        <section className="space-y-2.5 rounded-md3-lg border border-outline-variant/60 bg-surface-container p-3">
            {episodes.length > 0 && (
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <h3 className="inline-flex items-center gap-1.5 type-title-s text-on-surface">
                            <Icon path={mdMovie} size={17} className="text-primary" />
                            {t("page.live2d.storyAppearances")}
                        </h3>
                        <span className="rounded-full bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface-variant">
                            {t("page.live2d.storyAppearancesCount", { count: episodeCount })}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {episodes.map(ep => (
                            <Link
                                key={ep}
                                href={storyPlayerHref(region, ep)}
                                title={watchTitle}
                                className="state-layer focus-ring inline-flex items-center gap-1 rounded-full border border-outline-variant/70 bg-surface-container-high px-2.5 py-1 font-mono type-label-s text-primary transition-colors hover:border-primary/50 hover:bg-secondary-container hover:text-on-secondary-container"
                            >
                                <span>{ep}</span>
                                <Icon path={mdOpenInNew} size={13} />
                            </Link>
                        ))}
                    </div>
                </div>
            )}
            {aliases.length > 0 && (
                <div className="space-y-1">
                    <p className="type-label-m text-on-surface">{t("page.live2d.aliasesLabel")}</p>
                    <div className="flex flex-wrap gap-1">
                        {aliases.map(alias => (
                            <span
                                key={alias}
                                className="rounded-md3-xs bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface-variant"
                            >
                                {alias}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

function Notice({ children }: { children: ReactNode }) {
    return <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">{children}</div>;
}
