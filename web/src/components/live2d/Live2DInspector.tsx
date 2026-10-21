"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Button, Chip, LoadingState, Surface, Switch, Tabs, cn } from "@/components/md3";
import { mdRestartAlt } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { groupLive2DFacials, groupLive2DMotions, live2dMotionStyle, type Live2DClipRow, type Live2DMotionGroup } from "@/lib/live2dViewer/clips";
import type { Live2DRegion } from "@/lib/live2dViewer/config";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import type { Live2DViewer } from "@/lib/live2dViewer/viewer";
import { Live2DBackgroundGrid } from "./Live2DBackgroundGrid";
import { Live2DClipRows } from "./Live2DClipRows";
import { Live2DModelPicker } from "./Live2DModelPicker";
import { live2dGroupKey } from "./labels";
import type { Live2DViewerState } from "./useLive2DViewer";

type Tab = "models" | "motions" | "facials" | "scene";

interface Live2DInspectorProps {
    region: Live2DRegion;
    /** The asset site the reader chose (for the backgrounds). */
    line: "main" | "overseas";
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
    const { t } = useI18n();
    const [tab, setTab] = useState<Tab>("models");
    // The group being looked through; it follows the model shown until another is chosen.
    const [browsing, setBrowsing] = useState<string | null>(null);
    const group = browsing ?? (current ? live2dGroupKey(current) : "character:1");
    // The clip being fetched (a motion or facial is fetched the first time it is used).
    const [pending, setPending] = useState<string | null>(null);

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
        <Surface as="aside" tone="low" radius="xl" className={cn("flex min-h-0 flex-col overflow-hidden", className)} aria-label={t("page.live2d.controls")}>
            <Tabs items={tabs} value={tab} onValueChange={setTab} aria-label={t("page.live2d.controls")} className="shrink-0" />
            {clipError && (
                <p role="alert" className="mx-3 mt-3 rounded-md3-md bg-error-container px-3 py-2 type-body-s text-on-error-container">
                    {t("page.live2d.clipFailed")}
                </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
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
                        <Live2DModelPicker models={models} current={current} group={group} onGroupChange={setBrowsing} onSelect={onSelect} />
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

function Notice({ children }: { children: ReactNode }) {
    return <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">{children}</div>;
}
