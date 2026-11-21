"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
    Button, Dialog, Icon, LinearProgress, LoadingIndicator, Switch, cn,
} from "@/components/md3";
import {
    mdCheckCircle, mdCloudDone, mdDownload, mdErrorFill, mdFace, mdImage, mdInfo,
    mdLayers, mdMusicNote, mdRefresh,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import type { AssetLine } from "@/lib/assets";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import {
    collectStoryAssets, inspectStoryCacheStatus, preloadStoryAssets,
    type StoryCacheStatus, type StoryPreloadCategory, type StoryPreloadProgress,
} from "@/lib/storyMaker/preloader";
import type { StoryDocument } from "@/types/storyMaker";

export const STORY_AUTO_PRELOAD_STORAGE_KEY = "moesekai.storyMaker.autoPreload";

const autoPreloadListeners = new Set<() => void>();

function notifyAutoPreloadListeners(): void {
    for (const listener of autoPreloadListeners) listener();
}

function subscribeAutoPreload(listener: () => void): () => void {
    autoPreloadListeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === STORY_AUTO_PRELOAD_STORAGE_KEY) {
            listener();
        }
    };
    if (typeof window !== "undefined") {
        window.addEventListener("storage", onStorage);
    }
    return () => {
        autoPreloadListeners.delete(listener);
        if (typeof window !== "undefined") {
            window.removeEventListener("storage", onStorage);
        }
    };
}

export function readAutoPreloadPreference(): boolean {
    if (typeof window === "undefined") return false;
    try {
        const raw = window.localStorage.getItem(STORY_AUTO_PRELOAD_STORAGE_KEY);
        return raw === "1" || raw === "true";
    } catch {
        return false;
    }
}

export function writeAutoPreloadPreference(enabled: boolean): void {
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(STORY_AUTO_PRELOAD_STORAGE_KEY, enabled ? "1" : "0");
        } catch {
            // Ignore private-mode or quota storage errors
        }
    }
    notifyAutoPreloadListeners();
}

export interface AssetPreloadDialogProps {
    open: boolean;
    onClose: () => void;
    doc: StoryDocument;
    assetSource: AssetSourceType | AssetLine;
    models?: readonly Live2DModel[] | null;
    autoPreload?: boolean;
    onAutoPreloadChange?: (enabled: boolean) => void;
    onComplete?: (progress: StoryPreloadProgress) => void;
    /** Optional externally managed background preload progress (e.g. player auto-preload). */
    externalProgress?: StoryPreloadProgress | null;
    externalRunning?: boolean;
    onCancelExternal?: () => void;
}

const CATEGORY_META: readonly {
    key: StoryPreloadCategory;
    icon: string;
    labelKey:
        | "page.storyMaker.preload.categoryLive2d"
        | "page.storyMaker.preload.categoryBackground"
        | "page.storyMaker.preload.categoryAudio"
        | "page.storyMaker.preload.categoryUikit";
}[] = [
    { key: "live2d", icon: mdFace, labelKey: "page.storyMaker.preload.categoryLive2d" },
    { key: "background", icon: mdImage, labelKey: "page.storyMaker.preload.categoryBackground" },
    { key: "audio", icon: mdMusicNote, labelKey: "page.storyMaker.preload.categoryAudio" },
    { key: "uikit", icon: mdLayers, labelKey: "page.storyMaker.preload.categoryUikit" },
];

interface ScopedPreloadState {
    doc: StoryDocument;
    assetSource: AssetSourceType | AssetLine;
    progress: StoryPreloadProgress;
}

interface ScopedCacheState {
    doc: StoryDocument;
    assetSource: AssetSourceType | AssetLine;
    status: StoryCacheStatus;
}

export function AssetPreloadDialog({
    open,
    onClose,
    doc,
    assetSource,
    models,
    autoPreload,
    onAutoPreloadChange,
    onComplete,
    externalProgress = null,
    externalRunning = false,
    onCancelExternal,
}: AssetPreloadDialogProps) {
    const { t } = useI18n();
    const storedAuto = useSyncExternalStore(
        subscribeAutoPreload,
        readAutoPreloadPreference,
        () => false,
    );
    const effectiveAutoPreload = autoPreload ?? storedAuto;

    const manifest = useMemo(
        () => collectStoryAssets(doc, { assetSource, models }),
        [doc, assetSource, models],
    );

    const [scopedCache, setScopedCache] = useState<ScopedCacheState | null>(null);
    const [scopedProgress, setScopedProgress] = useState<ScopedPreloadState | null>(null);
    const [localRunning, setLocalRunning] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const runIdRef = useRef(0);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            runIdRef.current += 1;
            abortRef.current?.abort();
            abortRef.current = null;
        };
    }, []);

    const refreshCacheStatus = useCallback(() => {
        let cancelled = false;
        void inspectStoryCacheStatus(doc, { assetSource, models }).then((status) => {
            if (!cancelled && mountedRef.current) {
                setScopedCache({ doc, assetSource, status });
            }
        });
        return () => { cancelled = true; };
    }, [doc, assetSource, models]);

    useEffect(() => {
        if (!open) return;
        return refreshCacheStatus();
    }, [open, refreshCacheStatus]);

    const cacheStatus = scopedCache && scopedCache.doc === doc && scopedCache.assetSource === assetSource
        ? scopedCache.status
        : null;

    const localProgress = scopedProgress && scopedProgress.doc === doc && scopedProgress.assetSource === assetSource
        ? scopedProgress.progress
        : null;

    const activeProgress = localProgress ?? externalProgress;
    const isRunning = localRunning || (!localProgress && externalRunning);

    const handleCancel = useCallback(() => {
        if (localRunning) {
            runIdRef.current += 1;
            abortRef.current?.abort();
            abortRef.current = null;
            setLocalRunning(false);
        } else if (externalRunning) {
            onCancelExternal?.();
        }
    }, [externalRunning, localRunning, onCancelExternal]);

    const handleStart = useCallback(async () => {
        if (localRunning) return;
        if (externalRunning) {
            onCancelExternal?.();
        }
        abortRef.current?.abort();
        const runId = ++runIdRef.current;
        const controller = new AbortController();
        abortRef.current = controller;
        setLocalRunning(true);

        try {
            const finalProgress = await preloadStoryAssets(doc, {
                assetSource,
                models,
                signal: controller.signal,
                onProgress: (next) => {
                    if (!mountedRef.current || runIdRef.current !== runId || abortRef.current !== controller) return;
                    setScopedProgress({ doc, assetSource, progress: next });
                },
            });
            if (!mountedRef.current || runIdRef.current !== runId || abortRef.current !== controller) return;
            abortRef.current = null;
            setScopedProgress({ doc, assetSource, progress: finalProgress });
            setLocalRunning(false);
            const nextStatus = await inspectStoryCacheStatus(doc, { assetSource, models }).catch(() => null);
            if (!mountedRef.current || runIdRef.current !== runId) return;
            if (nextStatus) {
                setScopedCache({ doc, assetSource, status: nextStatus });
            }
            if (finalProgress.done) {
                onComplete?.(finalProgress);
            }
        } catch {
            if (!mountedRef.current || runIdRef.current !== runId || abortRef.current !== controller) return;
            abortRef.current = null;
            setLocalRunning(false);
        }
    }, [assetSource, doc, externalRunning, localRunning, models, onCancelExternal, onComplete]);

    const handleAutoPreloadToggle = useCallback((checked: boolean) => {
        writeAutoPreloadPreference(checked);
        onAutoPreloadChange?.(checked);
    }, [onAutoPreloadChange]);

    const initialCachedTotal = cacheStatus
        ? cacheStatus.live2dCachedModels + cacheStatus.audioDecodedCount + (cacheStatus.uikitCached ? 1 : 0)
        : 0;

    const totalItems = activeProgress ? activeProgress.total : manifest.counts.total;
    const completedItems = activeProgress ? activeProgress.completed : initialCachedTotal;
    const cachedItems = activeProgress ? activeProgress.cached : initialCachedTotal;
    const failedItems = activeProgress ? activeProgress.failed : 0;
    const isDone = Boolean(activeProgress?.done);
    const hasStoryAssets = manifest.counts.live2d + manifest.counts.background + manifest.counts.audio > 0;
    const progressRatio = totalItems > 0 ? Math.max(0, Math.min(1, completedItems / totalItems)) : 0;
    const progressPercent = Math.round(progressRatio * 100);

    return (
        <Dialog
            isOpen={open}
            onClose={onClose}
            title={t("page.storyMaker.preload.dialogTitle")}
            supportingText={t("page.storyMaker.preload.dialogSubtitle")}
            size="md"
            showClose
            actions={(
                <>
                    {isRunning ? (
                        <Button variant="tonal" onClick={handleCancel}>
                            {t("page.storyMaker.preload.cancelButton")}
                        </Button>
                    ) : (
                        <>
                            <Button variant="text" onClick={onClose}>
                                {t("common.action.close")}
                            </Button>
                            {isDone && failedItems > 0 ? (
                                <Button
                                    variant="filled"
                                    icon={mdRefresh}
                                    disabled={manifest.counts.total === 0}
                                    onClick={() => void handleStart()}
                                >
                                    {t("page.storyMaker.preload.retryButton")}
                                </Button>
                            ) : (
                                <Button
                                    variant="filled"
                                    icon={isDone ? mdRefresh : mdDownload}
                                    disabled={manifest.counts.total === 0}
                                    onClick={() => void handleStart()}
                                >
                                    {t("page.storyMaker.preload.startButton")}
                                </Button>
                            )}
                        </>
                    )}
                </>
            )}
        >
            <div className="min-w-0 space-y-4">
                {/* Overall progress summary */}
                <div className="min-w-0 space-y-2.5 rounded-md3-md bg-surface-container p-3.5">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            {isRunning ? (
                                <LoadingIndicator size={18} className="shrink-0" />
                            ) : isDone && failedItems === 0 ? (
                                <Icon path={mdCloudDone} size={20} className="shrink-0 text-primary" />
                            ) : failedItems > 0 ? (
                                <Icon path={mdErrorFill} size={20} className="shrink-0 text-error" />
                            ) : (
                                <Icon
                                    path={cacheStatus?.hasLocalCache ? mdCloudDone : mdDownload}
                                    size={20}
                                    className={cn("shrink-0", cacheStatus?.hasLocalCache ? "text-primary" : "text-on-surface-variant")}
                                />
                            )}
                            <span className="min-w-0 truncate type-title-s text-on-surface">
                                {isDone && failedItems === 0
                                    ? t("page.storyMaker.preload.doneLabel")
                                    : t("page.storyMaker.preload.summaryProgress", {
                                        completed: completedItems,
                                        total: totalItems,
                                    })}
                            </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            {!isRunning && (isDone ? failedItems === 0 : Boolean(cacheStatus?.hasLocalCache)) && (
                                <span className="rounded-full bg-primary-container px-2 py-0.5 type-label-s text-on-primary-container">
                                    {t("page.storyMaker.preload.readyBadge")}
                                </span>
                            )}
                            <span className="font-mono type-label-m tabular-nums text-on-surface-variant">
                                {progressPercent}%
                            </span>
                        </div>
                    </div>

                    <LinearProgress
                        value={isRunning && totalItems === 0 ? undefined : progressRatio}
                        wavy={isRunning && totalItems > 0 ? true : undefined}
                        stop={false}
                        aria-label={t("page.storyMaker.preload.dialogTitle")}
                    />

                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 type-label-s text-on-surface-variant">
                        {isDone && (
                            <span>
                                {t("page.storyMaker.preload.summaryProgress", {
                                    completed: completedItems,
                                    total: totalItems,
                                })}
                            </span>
                        )}
                        <span>{t("page.storyMaker.preload.cachedCount", { count: cachedItems })}</span>
                        {failedItems > 0 && (
                            <span className="text-error">
                                {t("page.storyMaker.preload.failedCount", { count: failedItems })}
                            </span>
                        )}
                    </div>

                    {isRunning && activeProgress?.currentLabel && (
                        <p className="min-w-0 truncate font-mono type-label-s text-on-surface-variant">
                            {t("page.storyMaker.preload.preloadingStatus", { label: activeProgress.currentLabel })}
                        </p>
                    )}
                </div>

                {!hasStoryAssets && (
                    <p className="rounded-md3-md bg-surface-container-low px-3.5 py-2.5 type-body-s text-on-surface-variant">
                        {t("page.storyMaker.preload.noAssets")}
                    </p>
                )}

                {/* Per-category breakdown */}
                <div className="min-w-0 space-y-1.5">
                    {CATEGORY_META.map(({ key, icon, labelKey }) => {
                        const catProgress = activeProgress?.byCategory[key] ?? null;
                        const catTotal = catProgress ? catProgress.total : manifest.counts[key];
                        const preCached = key === "live2d"
                            ? (cacheStatus?.live2dCachedModels ?? 0)
                            : key === "audio"
                                ? (cacheStatus?.audioDecodedCount ?? 0)
                                : key === "uikit"
                                    ? (cacheStatus?.uikitCached ? 1 : 0)
                                    : 0;
                        const catCompleted = catProgress ? catProgress.completed : preCached;
                        const catFailed = catProgress ? catProgress.failed : 0;
                        const catDone = catTotal > 0 && catCompleted >= catTotal && catFailed === 0;
                        const catActive = isRunning && activeProgress?.currentCategory === key;

                        return (
                            <div
                                key={key}
                                className="flex min-w-0 items-center justify-between gap-2 rounded-md3-md border border-outline-variant/60 bg-surface-container-low px-3 py-2.5"
                            >
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <Icon
                                        path={icon}
                                        size={18}
                                        className={cn(
                                            "shrink-0",
                                            catDone ? "text-primary" : "text-on-surface-variant",
                                        )}
                                    />
                                    <span className="min-w-0 truncate type-body-m text-on-surface">
                                        {t(labelKey)}
                                    </span>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    {catFailed > 0 && (
                                        <span className="type-label-s text-error">
                                            {t("page.storyMaker.preload.failedCount", { count: catFailed })}
                                        </span>
                                    )}
                                    <span className="font-mono type-label-m tabular-nums text-on-surface-variant">
                                        {catTotal === 0 ? "0" : `${Math.min(catCompleted, catTotal)} / ${catTotal}`}
                                    </span>
                                    {catActive ? (
                                        <LoadingIndicator size={16} />
                                    ) : catFailed > 0 ? (
                                        <Icon path={mdErrorFill} size={18} className="shrink-0 text-error" />
                                    ) : catDone ? (
                                        <Icon path={mdCheckCircle} size={18} className="shrink-0 text-primary" />
                                    ) : (
                                        <span aria-hidden className="inline-block size-[18px] shrink-0" />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Auto-preload preference switch */}
                <div className="min-w-0 rounded-md3-md border border-outline-variant/60 bg-surface-container-low px-3.5 py-3">
                    <Switch
                        checked={effectiveAutoPreload}
                        onCheckedChange={handleAutoPreloadToggle}
                        label={t("page.storyMaker.preload.autoPreloadLabel")}
                        description={t("page.storyMaker.preload.autoPreloadDesc")}
                    />
                </div>

                {/* Browser cache explanation */}
                <div className="flex min-w-0 items-start gap-2.5 rounded-md3-md bg-secondary-container/40 px-3.5 py-3">
                    <Icon path={mdInfo} size={18} className="mt-0.5 shrink-0 text-on-secondary-container" />
                    <div className="min-w-0 space-y-0.5">
                        <p className="type-label-l text-on-surface">
                            {t("page.storyMaker.preload.cacheInfoTitle")}
                        </p>
                        <p className="break-words type-body-s text-on-surface-variant">
                            {t("page.storyMaker.preload.cacheInfoBody")}
                        </p>
                    </div>
                </div>
            </div>
        </Dialog>
    );
}
