"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Chip, Dialog, IconButton, TextField } from "@/components/md3";
import { mdClose, mdTune } from "@/components/md3/icons";
import { Live2DClipRows } from "@/components/live2d/Live2DClipRows";
import { useI18n } from "@/contexts/I18nContext";
import {
    groupLive2DFacials, groupLive2DMotions, live2dMotionStyle, type Live2DClipRow, type Live2DMotionGroup,
} from "@/lib/live2dViewer/clips";
import type { Live2DActorInfo } from "@/lib/live2dViewer/stage";
import { fetchMotionBundleClips, type StoryMotionBundleClips } from "@/lib/storyMaker/assets";

interface ClipPickerFieldProps {
    kind: "motion" | "facial";
    value: string | undefined;
    info: Live2DActorInfo | undefined;
    /** Story library root + model motion bundle, used to load `_ripper.json` without WebGPU. */
    library?: string | null;
    motionBundle?: string | null;
    disabled?: boolean;
    onChange: (value: string | undefined) => void;
}

type BundleLoadState =
    | { key: string; status: "ready"; clips: StoryMotionBundleClips }
    | { key: string; status: "error" };

/**
 * Choosing a Live2D body motion or facial expression for a step: offers a free-text field so
 * clips can always be entered offline, plus a visual picker dialog reusing the Live2D viewer's
 * grouped clip rows from either WebGPU ActorInfo or the lightweight `_ripper.json` manifest.
 */
export function ClipPickerField({ kind, value, info, library, motionBundle, disabled, onChange }: ClipPickerFieldProps) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
    const [loaded, setLoaded] = useState<BundleLoadState | null>(null);

    const bundleKey = !disabled && !info && library && motionBundle ? `${library}|${motionBundle}` : null;

    useEffect(() => {
        if (!bundleKey || !library || !motionBundle) return;
        const controller = new AbortController();
        fetchMotionBundleClips(library, motionBundle, controller.signal).then(
            clips => setLoaded({ key: bundleKey, status: "ready", clips }),
            () => {
                if (!controller.signal.aborted) setLoaded({ key: bundleKey, status: "error" });
            },
        );
        return () => controller.abort();
    }, [bundleKey, library, motionBundle]);

    const manifestClips = bundleKey && loaded?.key === bundleKey && loaded.status === "ready" ? loaded.clips : null;
    const manifestLoading = Boolean(bundleKey && loaded?.key !== bundleKey);
    const manifestFailed = Boolean(bundleKey && loaded?.key === bundleKey && loaded.status === "error");

    const clips = useMemo(() => {
        if (info) return kind === "motion" ? info.motions : info.facials;
        if (manifestClips) return kind === "motion" ? manifestClips.motions : manifestClips.facials;
        return [];
    }, [info, manifestClips, kind]);

    const fallback = kind === "motion" ? info?.defaultMotion ?? null : info?.defaultFacial ?? null;
    const motionGroups = useMemo(() => (kind === "motion" ? groupLive2DMotions(clips) : []), [kind, clips]);
    const facialRows = useMemo(() => (kind === "facial" ? groupLive2DFacials(clips) : []), [kind, clips]);

    const activeStyle = selectedStyle
        ?? live2dMotionStyle(motionGroups, value ?? fallback)
        ?? motionGroups[0]?.style
        ?? null;
    const shownGroup = motionGroups.find(item => item.style === activeStyle) ?? motionGroups[0];

    const labelKey = kind === "motion" ? "page.storyMaker.inspector.motion" : "page.storyMaker.inspector.facial";
    const pickTitleKey = kind === "motion" ? "page.storyMaker.inspector.pickMotion" : "page.storyMaker.inspector.pickFacial";
    const rowLabel = (row: Live2DClipRow) => {
        const prefix = kind === "motion" ? "page.live2d.motionAction" : "page.live2d.emotion";
        return row.words.map(word => t(`${prefix}.${word}`)).join(" + ") || row.raw;
    };
    const styleLabel = (item: Live2DMotionGroup) => (
        item.known
            ? t(`page.live2d.motionStyle.${item.style}`)
            : item.style === "other"
                ? t("page.live2d.motionStyleOther")
                : item.style
    );

    const handlePick = (name: string) => {
        onChange(name);
        setOpen(false);
    };

    return (
        <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 flex-wrap items-start gap-2">
                <TextField
                    label={t(labelKey)}
                    value={value ?? ""}
                    maxLength={64}
                    disabled={disabled}
                    placeholder={fallback ?? t("page.storyMaker.inspector.clipDefault")}
                    onChange={event => onChange(event.target.value || undefined)}
                    onBlur={event => {
                        const trimmed = event.target.value.trim();
                        if (trimmed !== (value ?? "")) onChange(trimmed || undefined);
                    }}
                    className="min-w-[9rem] flex-1 font-mono"
                    trailing={value ? (
                        <IconButton
                            size="xs"
                            icon={mdClose}
                            label={t("page.storyMaker.inspector.useDefault")}
                            disabled={disabled}
                            onClick={() => onChange(undefined)}
                        />
                    ) : undefined}
                />
                <Button
                    size="s"
                    variant="tonal"
                    icon={mdTune}
                    disabled={disabled || clips.length === 0}
                    onClick={() => setOpen(true)}
                    className="mt-1 shrink-0"
                >
                    {t("page.storyMaker.inspector.browse")}
                </Button>
            </div>
            {!disabled && clips.length === 0 && (
                <p className={manifestFailed ? "type-label-s text-error" : "type-label-s text-on-surface-variant"}>
                    {t(
                        manifestFailed
                            ? "page.storyMaker.inspector.clipLoadFailed"
                            : manifestLoading
                                ? "page.storyMaker.inspector.clipLoading"
                                : "page.storyMaker.inspector.clipPickerHint",
                    )}
                </p>
            )}

            <Dialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title={t(pickTitleKey)}
                size="lg"
                fullscreenOnMobile
                headerActions={value ? (
                    <Button size="xs" variant="text" onClick={() => { onChange(undefined); setOpen(false); }}>
                        {t("page.storyMaker.inspector.useDefault")}
                    </Button>
                ) : undefined}
            >
                {kind === "motion" ? (
                    <div className="space-y-3">
                        {motionGroups.length > 1 && (
                            <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t("page.live2d.motionStyleTitle")}>
                                {motionGroups.map(item => (
                                    <Chip
                                        key={item.style}
                                        variant="filter"
                                        selected={item.style === shownGroup?.style}
                                        showCheckmark={false}
                                        className="shrink-0"
                                        onClick={() => setSelectedStyle(item.style)}
                                    >
                                        {styleLabel(item)}
                                        <span className="ml-1 type-label-s opacity-70">
                                            {item.rows.reduce((sum, row) => sum + row.clips.length, 0)}
                                        </span>
                                    </Chip>
                                ))}
                            </div>
                        )}
                        {shownGroup && (
                            <Live2DClipRows
                                rows={shownGroup.rows}
                                label={rowLabel}
                                current={value ?? null}
                                pending={null}
                                fallback={fallback}
                                onPick={handlePick}
                            />
                        )}
                    </div>
                ) : (
                    <Live2DClipRows
                        rows={facialRows}
                        label={rowLabel}
                        current={value ?? null}
                        pending={null}
                        fallback={fallback}
                        onPick={handlePick}
                    />
                )}
            </Dialog>
        </div>
    );
}
