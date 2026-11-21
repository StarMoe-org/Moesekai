"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Chip, Icon, IconButton, TextField, cn } from "@/components/md3";
import {
    mdCheck, mdClose, mdPlayArrow, mdPlayArrowFill, mdReplay, mdTune,
} from "@/components/md3/icons";
import { Live2DClipRows } from "@/components/live2d/Live2DClipRows";
import { useI18n } from "@/contexts/I18nContext";
import {
    groupLive2DFacials, groupLive2DMotions, live2dMotionStyle, type Live2DClipRow, type Live2DMotionGroup,
} from "@/lib/live2dViewer/clips";
import type { Live2DActorInfo } from "@/lib/live2dViewer/stage";
import { fetchMotionBundleClips, type StoryMotionBundleClips } from "@/lib/storyMaker/assets";

export interface ClipPickerFieldProps {
    kind: "motion" | "facial";
    value: string | undefined;
    info: Live2DActorInfo | undefined;
    /** Story library root + model motion bundle, used to load `_ripper.json` without WebGPU. */
    library?: string | null;
    motionBundle?: string | null;
    disabled?: boolean;
    onChange: (value: string | undefined) => void;
    /** Optional live preview callback: plays/applies a clip on the Live2D Preview Monitor. */
    onPreviewClip?: (clipName: string) => void;
}

type BundleLoadState =
    | { key: string; status: "ready"; clips: StoryMotionBundleClips }
    | { key: string; status: "error" };

const MAX_INLINE_SUGGESTIONS = 80;

/** Ensures only one right-docked clip browser drawer stays open across all inspector fields. */
const drawerListeners = new Set<(openedId: string) => void>();

function notifyDrawerOpened(openedId: string): void {
    for (const listener of drawerListeners) {
        listener(openedId);
    }
}

/**
 * Live2D body motion / facial expression field with inline searchable suggestions, direct replay,
 * and a non-blocking right-docked floating browser drawer that keeps the 16:9 Live2D stage fully
 * visible and unobstructed during live auditioning.
 */
export function ClipPickerField({
    kind, value, info, library, motionBundle, disabled, onChange, onPreviewClip,
}: ClipPickerFieldProps) {
    const { t } = useI18n();
    const drawerId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [typedFilter, setTypedFilter] = useState<string | null>(null);
    const [auditioning, setAuditioning] = useState<string | null>(null);
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

    useEffect(() => {
        const onOtherOpened = (openedId: string) => {
            if (openedId !== drawerId) setDrawerOpen(false);
        };
        drawerListeners.add(onOtherOpened);
        return () => {
            drawerListeners.delete(onOtherOpened);
        };
    }, [drawerId]);

    useEffect(() => {
        if (!dropdownOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && containerRef.current?.contains(target)) return;
            setDropdownOpen(false);
            setTypedFilter(null);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setDropdownOpen(false);
                setTypedFilter(null);
            }
        };
        window.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("keydown", onKeyDown, true);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("keydown", onKeyDown, true);
        };
    }, [dropdownOpen]);

    const manifestClips = bundleKey && loaded?.key === bundleKey && loaded.status === "ready" ? loaded.clips : null;
    const manifestLoading = Boolean(bundleKey && loaded?.key !== bundleKey);
    const manifestFailed = Boolean(bundleKey && loaded?.key === bundleKey && loaded.status === "error");

    const clips = useMemo(() => {
        if (info) return kind === "motion" ? info.motions : info.facials;
        if (manifestClips) return kind === "motion" ? manifestClips.motions : manifestClips.facials;
        return [];
    }, [info, manifestClips, kind]);

    const isDrawerVisible = drawerOpen && !disabled && clips.length > 0;

    useEffect(() => {
        if (!isDrawerVisible) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setDrawerOpen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [isDrawerVisible]);

    const fallback = kind === "motion" ? info?.defaultMotion ?? null : info?.defaultFacial ?? null;
    const motionGroups = useMemo(() => (kind === "motion" ? groupLive2DMotions(clips) : []), [kind, clips]);
    const facialRows = useMemo(() => (kind === "facial" ? groupLive2DFacials(clips) : []), [kind, clips]);

    const validSelectedStyle = selectedStyle && motionGroups.some(item => item.style === selectedStyle)
        ? selectedStyle
        : null;
    const activeStyle = validSelectedStyle
        ?? live2dMotionStyle(motionGroups, value ?? fallback)
        ?? motionGroups[0]?.style
        ?? null;
    const shownGroup = motionGroups.find(item => item.style === activeStyle) ?? motionGroups[0];

    const labelKey = kind === "motion" ? "page.storyMaker.inspector.motion" : "page.storyMaker.inspector.facial";
    const pickTitleKey = kind === "motion" ? "page.storyMaker.inspector.pickMotion" : "page.storyMaker.inspector.pickFacial";
    const previewLabelKey = kind === "motion" ? "page.storyMaker.nle.previewMotion" : "page.storyMaker.nle.previewFacial";

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

    const inlineSuggestions = useMemo(() => {
        if (!dropdownOpen || clips.length === 0) return [];
        const needle = (typedFilter ?? "").trim().toLowerCase();
        const filtered = needle
            ? clips.filter(name => name.toLowerCase().includes(needle))
            : clips;
        return filtered.slice(0, MAX_INLINE_SUGGESTIONS);
    }, [dropdownOpen, clips, typedFilter]);

    const handlePickFromDrawer = (name: string) => {
        onChange(name);
        setAuditioning(name);
        onPreviewClip?.(name);
    };

    const handlePickFromDropdown = (name: string) => {
        onChange(name);
        setAuditioning(name);
        onPreviewClip?.(name);
        setDropdownOpen(false);
        setTypedFilter(null);
    };

    const handleAudition = (name: string) => {
        setAuditioning(name);
        onPreviewClip?.(name);
    };

    const handleUseDefault = () => {
        onChange(undefined);
        setTypedFilter(null);
        setAuditioning(fallback);
        if (fallback) onPreviewClip?.(fallback);
    };

    const openDrawer = () => {
        setDropdownOpen(false);
        setTypedFilter(null);
        notifyDrawerOpened(drawerId);
        setDrawerOpen(true);
    };

    const trimmedValue = value?.trim() ?? "";
    const validAuditioning = auditioning && clips.includes(auditioning) ? auditioning : null;
    const activePreviewClip = validAuditioning || trimmedValue || fallback;

    return (
        <div ref={containerRef} className="relative min-w-0 space-y-1">
            <div className="flex min-w-0 flex-wrap items-start gap-2">
                <TextField
                    label={t(labelKey)}
                    value={value ?? ""}
                    maxLength={64}
                    disabled={disabled}
                    placeholder={fallback ?? t("page.storyMaker.inspector.clipDefault")}
                    onFocus={() => {
                        if (!disabled && clips.length > 0) {
                            setDropdownOpen(true);
                            setTypedFilter(null);
                        }
                    }}
                    onChange={(event) => {
                        const raw = event.target.value;
                        onChange(raw || undefined);
                        if (clips.length > 0) {
                            setDropdownOpen(true);
                            setTypedFilter(raw);
                        }
                    }}
                    onBlur={(event) => {
                        const trimmed = event.target.value.trim();
                        if (trimmed !== (value ?? "")) onChange(trimmed || undefined);
                    }}
                    className="min-w-[9rem] flex-1 font-mono"
                    trailing={trimmedValue ? (
                        <div className="flex items-center">
                            {onPreviewClip && (
                                <IconButton
                                    size="xs"
                                    icon={mdPlayArrow}
                                    label={t(previewLabelKey)}
                                    title={t(previewLabelKey)}
                                    disabled={disabled}
                                    onMouseDown={event => event.preventDefault()}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleAudition(trimmedValue);
                                    }}
                                />
                            )}
                            <IconButton
                                size="xs"
                                icon={mdClose}
                                label={t("page.storyMaker.inspector.useDefault")}
                                disabled={disabled}
                                onClick={handleUseDefault}
                            />
                        </div>
                    ) : undefined}
                />
                <Button
                    size="s"
                    variant={isDrawerVisible ? "filled" : "tonal"}
                    icon={mdTune}
                    disabled={disabled || clips.length === 0}
                    onClick={() => (isDrawerVisible ? setDrawerOpen(false) : openDrawer())}
                    className="mt-1 shrink-0"
                >
                    {t("page.storyMaker.inspector.browse")}
                </Button>
            </div>

            {dropdownOpen && !disabled && inlineSuggestions.length > 0 && (
                <div className="z-30 min-w-0 overflow-hidden rounded-md3-md border border-outline-variant bg-surface-container-high shadow-elev-2">
                    <ul className="max-h-52 divide-y divide-outline-variant/40 overflow-y-auto p-1">
                        {inlineSuggestions.map((clipName) => {
                            const selected = clipName === value;
                            const isAuditioning = clipName === validAuditioning && !selected;
                            return (
                                <li
                                    key={clipName}
                                    className={cn(
                                        "flex min-w-0 items-center gap-1 rounded-md3-xs px-1 py-0.5 transition-colors",
                                        selected
                                            ? "bg-secondary-container text-on-secondary-container"
                                            : isAuditioning
                                                ? "bg-primary-container/40 text-on-surface"
                                                : "text-on-surface",
                                    )}
                                >
                                    <button
                                        type="button"
                                        onMouseDown={event => event.preventDefault()}
                                        onClick={() => handlePickFromDropdown(clipName)}
                                        className="state-layer focus-ring min-w-0 flex-1 truncate rounded-md3-xs px-2 py-1 text-left font-mono type-label-m"
                                        title={clipName}
                                    >
                                        {clipName}
                                    </button>
                                    {onPreviewClip && (
                                        <IconButton
                                            size="xs"
                                            icon={mdPlayArrow}
                                            label={t(previewLabelKey)}
                                            title={t(previewLabelKey)}
                                            onMouseDown={event => event.preventDefault()}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleAudition(clipName);
                                            }}
                                        />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {!disabled && clips.length === 0 && (manifestLoading || manifestFailed) && (
                <p className={manifestFailed ? "type-label-s text-error" : "type-label-s text-on-surface-variant"}>
                    {t(manifestFailed ? "page.storyMaker.inspector.clipLoadFailed" : "page.storyMaker.inspector.clipLoading")}
                </p>
            )}

            {isDrawerVisible && typeof document !== "undefined" && createPortal(
                <div
                    role="dialog"
                    aria-modal="false"
                    aria-label={t(pickTitleKey)}
                    data-clip-picker-drawer="true"
                    className="fixed inset-y-3 right-3 z-[190] flex w-[min(27rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-md3-xl border border-outline-variant bg-surface-container-high shadow-elev-3"
                >
                    {/* Drawer Header */}
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant/60 px-4 py-3">
                        <h3 className="min-w-0 truncate type-title-m text-on-surface">
                            {t(pickTitleKey)}
                        </h3>
                        <div className="flex shrink-0 items-center gap-1">
                            {value && (
                                <Button size="xs" variant="text" onClick={handleUseDefault}>
                                    {t("page.storyMaker.inspector.useDefault")}
                                </Button>
                            )}
                            <IconButton
                                size="xs"
                                icon={mdClose}
                                label={t("common.action.close")}
                                onClick={() => setDrawerOpen(false)}
                            />
                        </div>
                    </div>

                    {/* Live Audition Status & Replay Strip */}
                    {onPreviewClip && activePreviewClip && (
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant/50 bg-surface-container px-4 py-2">
                            <span
                                className="min-w-0 flex-1 truncate font-mono type-label-m text-primary"
                                title={activePreviewClip}
                            >
                                {t("page.storyMaker.v2.picker.auditioning", { clip: activePreviewClip })}
                            </span>
                            <Button
                                size="xs"
                                variant="tonal"
                                icon={mdReplay}
                                className="shrink-0"
                                onClick={() => handleAudition(activePreviewClip)}
                            >
                                {t("page.storyMaker.v2.picker.replay")}
                            </Button>
                        </div>
                    )}

                    {/* Motion Style Filter Bar */}
                    {kind === "motion" && motionGroups.length > 1 && (
                        <div
                            className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-outline-variant/50 px-4 py-2"
                            role="group"
                            aria-label={t("page.live2d.motionStyleTitle")}
                        >
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

                    {/* Scrollable Grouped Clip List */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
                        {kind === "motion" ? (
                            shownGroup && (
                                onPreviewClip ? (
                                    <PreviewableClipRows
                                        rows={shownGroup.rows}
                                        label={rowLabel}
                                        current={value ?? null}
                                        auditioning={validAuditioning}
                                        fallback={fallback}
                                        previewLabel={t(previewLabelKey)}
                                        onPick={handlePickFromDrawer}
                                        onPreview={handleAudition}
                                    />
                                ) : (
                                    <Live2DClipRows
                                        rows={shownGroup.rows}
                                        label={rowLabel}
                                        current={value ?? null}
                                        pending={null}
                                        fallback={fallback}
                                        onPick={handlePickFromDrawer}
                                    />
                                )
                            )
                        ) : (
                            onPreviewClip ? (
                                <PreviewableClipRows
                                    rows={facialRows}
                                    label={rowLabel}
                                    current={value ?? null}
                                    auditioning={validAuditioning}
                                    fallback={fallback}
                                    previewLabel={t(previewLabelKey)}
                                    onPick={handlePickFromDrawer}
                                    onPreview={handleAudition}
                                />
                            ) : (
                                <Live2DClipRows
                                    rows={facialRows}
                                    label={rowLabel}
                                    current={value ?? null}
                                    pending={null}
                                    fallback={fallback}
                                    onPick={handlePickFromDrawer}
                                />
                            )
                        )}
                    </div>

                    {/* Drawer Footer */}
                    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-outline-variant/60 bg-surface-container px-4 py-2.5">
                        <span className="min-w-0 truncate font-mono type-label-s text-on-surface-variant" title={trimmedValue || fallback || undefined}>
                            {trimmedValue || fallback || t("page.storyMaker.inspector.clipDefault")}
                        </span>
                        <Button
                            size="s"
                            variant="filled"
                            icon={mdCheck}
                            className="shrink-0"
                            onClick={() => setDrawerOpen(false)}
                        >
                            {t("page.storyMaker.v2.picker.applyAndClose")}
                        </Button>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}

interface PreviewableClipRowsProps {
    rows: readonly Live2DClipRow[];
    label: (row: Live2DClipRow) => string;
    current: string | null;
    auditioning: string | null;
    fallback: string | null;
    previewLabel: string;
    onPick: (name: string) => void;
    onPreview: (name: string) => void;
}

/**
 * Grouped clip browser rows with dedicated ▶ live audition buttons alongside each clip option
 * so users can preview motions/facials on the Live2D monitor without closing the picker.
 */
function PreviewableClipRows({
    rows, label, current, auditioning, fallback, previewLabel, onPick, onPreview,
}: PreviewableClipRowsProps) {
    return (
        <ul className="divide-y divide-outline-variant/60">
            {rows.map(row => {
                const name = label(row);
                const active = row.clips.some(clip => clip.name === current);
                return (
                    <li key={row.key} className="flex items-start gap-3 py-2">
                        <div className="w-24 shrink-0 pt-1.5">
                            <p className={cn("truncate type-label-l", active ? "text-primary" : "text-on-surface")} title={name}>
                                {name}
                            </p>
                            {row.tag && (
                                <p className="truncate font-mono type-label-s text-on-surface-variant">{row.tag}</p>
                            )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                            {row.clips.map(clip => {
                                const selected = clip.name === current;
                                const isAuditioning = clip.name === auditioning && !selected;
                                return (
                                    <div
                                        key={clip.name}
                                        className={cn(
                                            "inline-flex items-center overflow-hidden rounded-md3-sm border transition-colors",
                                            selected
                                                ? "border-primary bg-primary text-on-primary"
                                                : isAuditioning
                                                    ? "border-primary bg-primary-container text-on-primary-container"
                                                    : "border-outline-variant/60 bg-surface-container-high text-on-surface",
                                        )}
                                    >
                                        <button
                                            type="button"
                                            title={clip.name}
                                            aria-pressed={selected}
                                            aria-label={clip.code ? `${name} ${clip.code}` : name}
                                            onClick={() => onPick(clip.name)}
                                            className="state-layer focus-ring relative inline-flex h-8 min-w-9 items-center justify-center gap-1 px-2 font-mono type-label-m"
                                        >
                                            {clip.code ? (
                                                clip.code
                                            ) : (
                                                <Icon path={mdPlayArrowFill} size={16} />
                                            )}
                                            {clip.name === fallback && !selected && (
                                                <span aria-hidden className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`${previewLabel}: ${clip.name}`}
                                            title={previewLabel}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onPreview(clip.name);
                                            }}
                                            className={cn(
                                                "state-layer focus-ring inline-flex h-8 w-7 items-center justify-center border-l",
                                                selected
                                                    ? "border-on-primary/25 text-on-primary"
                                                    : "border-outline-variant/60 text-on-surface-variant hover:text-primary",
                                            )}
                                        >
                                            <Icon path={mdPlayArrow} size={16} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
