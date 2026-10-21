"use client";
import { useMemo, type ReactNode } from "react";
import { Button, Chip, Surface, Switch } from "@/components/md3";
import { mdImage, mdPause, mdPlayArrowFill, mdRestartAlt } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import { live2dCostumeLabel, live2dGroupKey, live2dGroupName, live2dMotionLabel, live2dOwnerName } from "./labels";
import type { Live2DViewerState } from "./useLive2DViewer";
import type { Live2DViewer } from "@/lib/live2dViewer/viewer";

interface Live2DModelPanelProps {
    /** The models the filters let through, in list order. */
    models: readonly Live2DModel[];
    /** How many the server has in all. */
    total: number;
    /** Where the server's list is: loading, failed (with a retry), or in. */
    listStatus: "loading" | "error" | "ready";
    onRetryList: () => void;
    current: Live2DModel | null;
    onSelect: (model: Live2DModel) => void;
    state: Live2DViewerState | null;
    act: (change: (viewer: Live2DViewer) => void | Promise<unknown>) => void;
    /** The address of a motion's or facial's clip that could not be fetched, or null. */
    clipError: string | null;
    loop: boolean;
    onLoopChange: (loop: boolean) => void;
    /** The background's name, or null for none. */
    background: string | null;
    onChooseBackground: () => void;
    onClearBackground: () => void;
}

/**
 * The panel beside the viewer's stage: the model shown, the models to switch to (grouped by
 * character, side characters and mobs after them), its motions and facials, and the options.
 */
export function Live2DModelPanel({
    models, total, listStatus, onRetryList, current, onSelect, state, act, clipError, loop, onLoopChange, background, onChooseBackground, onClearBackground,
}: Live2DModelPanelProps) {
    const { t } = useI18n();
    const groups = useMemo(() => {
        const byKey = new Map<string, { name: string; models: Live2DModel[] }>();
        for (const model of models) {
            const key = live2dGroupKey(model);
            const group = byKey.get(key) ?? { name: live2dGroupName(t, model), models: [] };
            group.models.push(model);
            byKey.set(key, group);
        }
        return [...byKey.entries()];
    }, [models, t]);

    return (
        <Surface as="aside" tone="low" radius="xl" className="space-y-5 p-4 @4xl:max-h-[80vh] @4xl:overflow-y-auto" aria-label={t("page.live2d.controls")}>
            {current && (
                <div className="min-w-0">
                    <h2 className="truncate type-title-l text-on-surface">{live2dOwnerName(t, current)}</h2>
                    <p className="mt-0.5 type-body-m text-on-surface-variant">{live2dCostumeLabel(t, current)}</p>
                    <p className="mt-1 break-all font-mono type-label-s text-on-surface-variant">
                        {current.id}
                        {current.generation === 2 ? " · v2" : ""}
                        {current.bytes > 0 ? ` · ${(current.bytes / (1024 * 1024)).toFixed(1)} MB` : ""}
                    </p>
                </div>
            )}

            <Group title={t("page.live2d.models", { count: models.length, total })}>
                {listStatus === "loading" ? (
                    <p className="type-body-s text-on-surface-variant">{t("page.live2d.listLoading")}</p>
                ) : listStatus === "error" ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="type-body-s text-error">{t("page.live2d.listFailed")}</p>
                        <Button variant="text" size="s" onClick={onRetryList}>{t("common.action.retry")}</Button>
                    </div>
                ) : models.length === 0 ? (
                    <p className="type-body-s text-on-surface-variant">{t(total === 0 ? "page.live2d.listEmpty" : "page.live2d.noMatches")}</p>
                ) : (
                    <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                        {groups.map(([key, group]) => (
                            <div key={key}>
                                <p className="mb-1.5 type-label-m text-on-surface-variant">{group.name}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {group.models.map(model => (
                                        <Chip
                                            key={model.id}
                                            variant="filter"
                                            selected={model.id === current?.id}
                                            showCheckmark={false}
                                            title={model.id}
                                            onClick={() => onSelect(model)}
                                        >
                                            {live2dCostumeLabel(t, model)}
                                            {model.generation === 2 && <span className="ml-1 type-label-s opacity-70">v2</span>}
                                        </Chip>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Group>

            {current && (state ? (
                <>
                    {clipError && (
                        <p role="alert" className="break-all type-body-s text-error">
                            {t("page.live2d.clipFailed")}
                            <span className="ml-1 font-mono type-label-s">{clipError}</span>
                        </p>
                    )}
                    <Group title={t("page.live2d.motions")}>
                        {state.motions.length === 0 && <p className="type-body-s text-on-surface-variant">{t("page.live2d.noMotions")}</p>}
                        <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1">
                            {state.motions.map(name => (
                                <Chip
                                    key={name}
                                    variant="filter"
                                    selected={name === state.motion}
                                    showCheckmark={false}
                                    title={name}
                                    className="font-mono"
                                    onClick={() => act(viewer => viewer.playMotion(name, { loop }))}
                                >
                                    {live2dMotionLabel(name)}
                                </Chip>
                            ))}
                        </div>
                        <Switch checked={loop} onCheckedChange={onLoopChange} label={t("page.live2d.loop")} />
                    </Group>

                    <Group title={t("page.live2d.facials")}>
                        {state.facials.length === 0 ? (
                            <p className="type-body-s text-on-surface-variant">{t("page.live2d.noFacials")}</p>
                        ) : (
                            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
                                {state.facials.map(name => (
                                    <Chip
                                        key={name}
                                        variant="filter"
                                        selected={name === state.facial}
                                        showCheckmark={false}
                                        title={name}
                                        className="font-mono"
                                        onClick={() => act(viewer => viewer.setFacial(name))}
                                    >
                                        {live2dMotionLabel(name)}
                                    </Chip>
                                ))}
                            </div>
                        )}
                    </Group>

                    <Group title={t("page.live2d.options")}>
                        <Switch
                            checked={state.physics}
                            disabled={!state.hasPhysics}
                            onCheckedChange={on => act(viewer => { viewer.physics = on; })}
                            label={t("page.live2d.physics")}
                        />
                        <Switch checked={state.breath} onCheckedChange={on => act(viewer => { viewer.breath = on; })} label={t("page.live2d.breath")} />
                        <div className="flex flex-wrap gap-2 pt-1">
                            <Button
                                variant="tonal"
                                size="s"
                                icon={state.paused ? mdPlayArrowFill : mdPause}
                                onClick={() => act(viewer => (viewer.paused ? viewer.play() : viewer.pause()))}
                            >
                                {t(state.paused ? "page.live2d.resume" : "page.live2d.pause")}
                            </Button>
                            <Button
                                variant="outlined"
                                size="s"
                                icon={mdRestartAlt}
                                onClick={() => act(viewer => Promise.all([
                                    viewer.defaultMotion ? viewer.playMotion(viewer.defaultMotion) : false,
                                    viewer.defaultFacial ? viewer.setFacial(viewer.defaultFacial) : false,
                                ]))}
                            >
                                {t("page.live2d.reset")}
                            </Button>
                        </div>
                    </Group>
                </>
            ) : (
                <p className="type-body-s text-on-surface-variant">{t("page.live2d.controlsWaiting")}</p>
            ))}

            <Group title={t("page.live2d.background")}>
                <p className="type-body-s text-on-surface-variant">{background ?? t("page.live2d.noBackground")}</p>
                <div className="flex flex-wrap gap-2">
                    <Button variant="tonal" size="s" icon={mdImage} onClick={onChooseBackground}>{t("page.live2d.chooseBackground")}</Button>
                    {background && <Button variant="text" size="s" onClick={onClearBackground}>{t("page.live2d.clearBackground")}</Button>}
                </div>
            </Group>
        </Surface>
    );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="type-title-s text-on-surface">{title}</h3>
            {children}
        </section>
    );
}
