"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/md3";
import { mdCenterFocusStrong, mdRefresh } from "@/components/md3/icons";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import { MOE_LOGO_URL } from "@/lib/assets";
import { LOCAL_TEST_LAYOUT_URL, MYSEKAI_PREVIEW_STORAGE_KEY } from "@/lib/mysekai-preview/assets";
import { MysekaiScenePreviewRuntime } from "@/lib/mysekai-preview/runtime";
import type { MysekaiLayoutPayload, MysekaiPreviewOptions, MysekaiPreviewRuntimeMessages, MysekaiPreviewStatus } from "@/lib/mysekai-preview/types";

interface MysekaiScenePreviewProps {
    className?: string;
    heightClassName?: string;
    defaultLayoutUrl?: string;
    compact?: boolean;
    assetSourceOverride?: AssetSourceType;
    persistOptionsEnabled?: boolean;
    showLayoutUrlInput?: boolean;
    headerTitle?: string;
    headerBadge?: string;
    headerNote?: string;
    layoutData?: MysekaiLayoutPayload | null;
    layoutKey?: string;
}

const SITE_OPTIONS = [
    { id: 1, labelKey: "page.mysekaiPreview.preview.siteOutdoor", fallback: "Outdoor" },
    { id: 2, labelKey: null, fallback: "1F" },
    { id: 3, labelKey: null, fallback: "2F" },
    { id: 4, labelKey: null, fallback: "3F" },
];

function readSavedOptions(): Partial<MysekaiPreviewOptions> {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(MYSEKAI_PREVIEW_STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as Partial<MysekaiPreviewOptions>;
    } catch {
        return {};
    }
}

function persistOptions(options: MysekaiPreviewOptions) {
    try {
        localStorage.setItem(MYSEKAI_PREVIEW_STORAGE_KEY, JSON.stringify({
            layoutUrl: options.layoutUrl,
            siteId: options.siteId,
            gridEnabled: options.gridEnabled,
            shadowEnabled: options.shadowEnabled,
            debugEnabled: options.debugEnabled,
            backWallOpacity: options.backWallOpacity,
            lookSensitivity: options.lookSensitivity,
        }));
    } catch {
        // ignore localStorage failures
    }
}

export default function MysekaiScenePreview({
    className = "",
    heightClassName = "h-[min(78vh,760px)] min-h-[520px]",
    defaultLayoutUrl = LOCAL_TEST_LAYOUT_URL,
    compact = false,
    assetSourceOverride,
    persistOptionsEnabled = true,
    showLayoutUrlInput = true,
    headerTitle,
    headerBadge,
    headerNote,
    layoutData = null,
    layoutKey,
}: MysekaiScenePreviewProps) {
    const { t } = useI18n();
    const { assetSource: themeAssetSource } = useTheme();
    const assetSource = assetSourceOverride ?? themeAssetSource;
    const resolvedHeaderTitle = headerTitle ?? t("page.mysekaiPreview.preview.defaultTitle");
    const resolvedHeaderBadge = headerBadge ?? t("page.mysekaiPreview.preview.defaultBadge");
    const hostRef = useRef<HTMLDivElement>(null);
    const axesRef = useRef<HTMLDivElement>(null);
    const runtimeRef = useRef<MysekaiScenePreviewRuntime | null>(null);
    const [status, setStatus] = useState<MysekaiPreviewStatus>({
        phase: "idle",
        message: t("page.mysekaiPreview.preview.initialStatus"),
        loaded: 0,
        total: 0,
        skipped: 0,
    });
    const [layoutUrl, setLayoutUrl] = useState(() => defaultLayoutUrl || LOCAL_TEST_LAYOUT_URL);
    const [siteId, setSiteId] = useState(1);
    const [debugEnabled, setDebugEnabled] = useState(false);
    const [gridEnabled, setGridEnabled] = useState(true);
    const [shadowEnabled, setShadowEnabled] = useState(true);
    const [backWallOpacity, setBackWallOpacity] = useState(0.2);
    const [lookSensitivity, setLookSensitivity] = useState(1);

    const runtimeMessages = useMemo<MysekaiPreviewRuntimeMessages>(() => ({
        initializing: t("page.mysekaiPreview.runtime.initializing"),
        loadingMasterLabel: t("page.mysekaiPreview.runtime.loadingMasterLabel"),
        loadingMasterMessage: t("page.mysekaiPreview.runtime.loadingMasterMessage"),
        loadFailedLabel: t("page.mysekaiPreview.runtime.loadFailedLabel"),
        loadFailedMessage: t("page.mysekaiPreview.runtime.loadFailedMessage"),
        fetchFailed: t("page.mysekaiPreview.runtime.fetchFailed"),
        noRoomData: t("page.mysekaiPreview.runtime.noRoomData"),
        modelLoadFailed: t("page.mysekaiPreview.runtime.modelLoadFailed"),
        bgmRecordMissing: t("page.mysekaiPreview.runtime.bgmRecordMissing"),
        bgmRecordExternalIdMissing: t("page.mysekaiPreview.runtime.bgmRecordExternalIdMissing"),
        soundtrackMissing: t("page.mysekaiPreview.runtime.soundtrackMissing"),
        soundtrackAssetMissing: t("page.mysekaiPreview.runtime.soundtrackAssetMissing"),
        soundtrackFallbackTitle: t("page.mysekaiPreview.runtime.soundtrackFallbackTitle"),
        soundtrackSubtitle: t("page.mysekaiPreview.runtime.soundtrackSubtitle"),
        musicMissing: t("page.mysekaiPreview.runtime.musicMissing"),
        missingInstrumental: t("page.mysekaiPreview.runtime.missingInstrumental"),
        missingVocal: t("page.mysekaiPreview.runtime.missingVocal"),
        defaultVocal: t("page.mysekaiPreview.runtime.defaultVocal"),
        musicFallbackTitle: t("page.mysekaiPreview.runtime.musicFallbackTitle"),
        bgmLoadFailed: t("page.mysekaiPreview.runtime.bgmLoadFailed"),
        modelMissing: t("page.mysekaiPreview.runtime.modelMissing"),
        preloadingModelsLabel: t("page.mysekaiPreview.runtime.preloadingModelsLabel"),
        preloadingModelsProgress: t("page.mysekaiPreview.runtime.preloadingModelsProgress"),
        readingLayoutLabel: t("page.mysekaiPreview.runtime.readingLayoutLabel"),
        loadingLayoutMessage: t("page.mysekaiPreview.runtime.loadingLayoutMessage"),
        instantiatingFurnitureLabel: t("page.mysekaiPreview.runtime.instantiatingFurnitureLabel"),
        instantiatingFurnitureProgress: t("page.mysekaiPreview.runtime.instantiatingFurnitureProgress"),
        emptyInstance: t("page.mysekaiPreview.runtime.emptyInstance"),
        finalizingSceneLabel: t("page.mysekaiPreview.runtime.finalizingSceneLabel"),
        completeLabel: t("page.mysekaiPreview.runtime.completeLabel"),
        defaultSiteLevel: t("page.mysekaiPreview.runtime.defaultSiteLevel"),
        completeMessage: t("page.mysekaiPreview.runtime.completeMessage"),
        fenceModelMissing: t("page.mysekaiPreview.runtime.fenceModelMissing"),
        fencePartsFailed: t("page.mysekaiPreview.runtime.fencePartsFailed"),
        modelNotPreloaded: t("page.mysekaiPreview.runtime.modelNotPreloaded"),
        fenceModelNotPreloaded: t("page.mysekaiPreview.runtime.fenceModelNotPreloaded"),
        freeView: t("page.mysekaiPreview.runtime.freeView"),
        fixedView: t("page.mysekaiPreview.runtime.fixedView"),
        pointerLock: t("page.mysekaiPreview.runtime.pointerLock"),
        releasePointerLock: t("page.mysekaiPreview.runtime.releasePointerLock"),
        fullscreen: t("page.mysekaiPreview.runtime.fullscreen"),
        exitFullscreen: t("page.mysekaiPreview.runtime.exitFullscreen"),
        cycleLayout: t("page.mysekaiPreview.runtime.cycleLayout"),
        playBgm: t("page.mysekaiPreview.runtime.playBgm"),
        pauseBgm: t("page.mysekaiPreview.runtime.pauseBgm"),
        loadingBgm: t("page.mysekaiPreview.runtime.loadingBgm"),
        playBgmTitle: t("page.mysekaiPreview.runtime.playBgmTitle"),
        bgmErrorTitle: t("page.mysekaiPreview.runtime.bgmErrorTitle"),
        noBgmTitle: t("page.mysekaiPreview.runtime.noBgmTitle"),
        bgmVolume: t("page.mysekaiPreview.runtime.bgmVolume"),
        shortcutHint: t("page.mysekaiPreview.runtime.shortcutHint"),
        mobileUp: t("page.mysekaiPreview.runtime.mobileUp"),
        mobileDown: t("page.mysekaiPreview.runtime.mobileDown"),
        bgmInfo: t("page.mysekaiPreview.runtime.bgmInfo"),
        noBgmInfo: t("page.mysekaiPreview.runtime.noBgmInfo"),
    }), [t]);

    useEffect(() => {
        if (!persistOptionsEnabled) return;
        const saved = readSavedOptions();
        if (typeof saved.layoutUrl === "string" && saved.layoutUrl) setLayoutUrl(saved.layoutUrl);
        if (Number.isFinite(Number(saved.siteId))) setSiteId(Number(saved.siteId));
        if (typeof saved.debugEnabled === "boolean") setDebugEnabled(saved.debugEnabled);
        if (typeof saved.gridEnabled === "boolean") setGridEnabled(saved.gridEnabled);
        if (typeof saved.shadowEnabled === "boolean") setShadowEnabled(saved.shadowEnabled);
        if (Number.isFinite(Number(saved.lookSensitivity))) {
            setLookSensitivity(Math.max(0.25, Math.min(2.2, Number(saved.lookSensitivity))));
        }
        if (Number.isFinite(Number(saved.backWallOpacity))) {
            setBackWallOpacity(Math.max(0, Math.min(1, Number(saved.backWallOpacity))));
        }
    }, [persistOptionsEnabled]);

    useEffect(() => {
        if (!persistOptionsEnabled) setLayoutUrl(defaultLayoutUrl || LOCAL_TEST_LAYOUT_URL);
    }, [defaultLayoutUrl, persistOptionsEnabled]);

    const options = useMemo<MysekaiPreviewOptions>(() => ({
        layoutUrl,
        layoutData,
        layoutKey,
        siteId,
        assetSource,
        gridEnabled,
        shadowEnabled,
        debugEnabled,
        backWallOpacity,
        lookSensitivity,
        messages: runtimeMessages,
    }), [assetSource, backWallOpacity, debugEnabled, gridEnabled, layoutData, layoutKey, layoutUrl, lookSensitivity, runtimeMessages, shadowEnabled, siteId]);

    useEffect(() => {
        if (persistOptionsEnabled) persistOptions(options);
    }, [options, persistOptionsEnabled]);

    useEffect(() => {
        if (!hostRef.current || !axesRef.current) return;
        const runtime = new MysekaiScenePreviewRuntime(hostRef.current, axesRef.current, options, {
            onStatus: setStatus,
            onCycleSite: () => {
                setSiteId((current) => {
                    const index = SITE_OPTIONS.findIndex((option) => option.id === current);
                    return SITE_OPTIONS[(index + 1) % SITE_OPTIONS.length].id;
                });
            },
        });
        runtimeRef.current = runtime;
        void runtime.reload(false);
        return () => {
            runtimeRef.current = null;
            runtime.dispose();
        };
        // Runtime should be created only once; subsequent option changes go through updateOptions.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        runtimeRef.current?.updateOptions(options);
    }, [options]);

    const handleReload = useCallback(() => {
        void runtimeRef.current?.reload(true);
    }, []);

    const handleResetCamera = useCallback(() => {
        runtimeRef.current?.resetCamera();
    }, []);

    const statusTone = status.phase === "error"
        ? "text-error"
        : status.phase === "ready" ? "text-primary" : "text-on-surface-variant";
    const progressValue = Math.max(0, Math.min(100, Math.round(status.progress ?? (status.total ? (status.loaded / Math.max(1, status.total)) * 100 : 0))));
    const showLoadingOverlay = status.phase === "loading";
    const loadingTitle = status.stageLabel || (status.stage === "master" ? t("page.mysekaiPreview.preview.loadingMaster") : status.stage === "layout" ? t("page.mysekaiPreview.preview.readingLayout") : t("page.mysekaiPreview.preview.loadingModels"));
    const panelPadding = compact ? "p-3" : "p-4";

    return (
        <div className={`space-y-3 ${className}`}>
            <div className={`rounded-md3-xl bg-surface-container ${panelPadding} type-body-s text-on-surface`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="type-title-s text-on-surface">{resolvedHeaderTitle}</div>
                            {resolvedHeaderBadge && <span className="rounded-md3-sm bg-primary-container px-2 py-1 type-label-s text-on-primary-container">{resolvedHeaderBadge}</span>}
                            <span className="rounded-md3-sm bg-surface-container-highest px-2 py-1 type-label-s text-on-surface-variant">{assetSource}</span>
                        </div>
                        {!compact && <div className="mt-1 type-body-s text-on-surface-variant">{headerNote ?? t("page.mysekaiPreview.preview.assetRuleNote")}</div>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button size="xs" variant="filled" icon={mdRefresh} onClick={handleReload}>
                            {t("page.mysekaiPreview.preview.reload")}
                        </Button>
                        <Button size="xs" variant="outlined" icon={mdCenterFocusStrong} onClick={handleResetCamera}>
                            {t("page.mysekaiPreview.preview.resetCamera")}
                        </Button>
                    </div>
                </div>

                <div className={`mt-3 grid gap-3 ${showLayoutUrlInput ? "lg:grid-cols-[minmax(0,1fr)_140px_140px_170px]" : "lg:grid-cols-[140px_140px_170px]"}`}>
                    {showLayoutUrlInput && (
                        <label className="block">
                            <span className="mb-1 block type-label-l text-on-surface-variant">{t("page.mysekaiPreview.preview.layoutJson")}</span>
                            <input
                                value={layoutUrl}
                                onChange={(event) => setLayoutUrl(event.target.value)}
                                className="focus-ring w-full rounded-md3-xs border border-outline bg-surface-container-lowest px-3 py-2 type-body-m text-on-surface outline-none focus:border-primary"
                                placeholder={LOCAL_TEST_LAYOUT_URL}
                            />
                        </label>
                    )}
                    <label className="block">
                        <span className="mb-1 block type-label-l text-on-surface-variant">{t("page.mysekaiPreview.preview.scene")}</span>
                        <select
                            value={siteId}
                            onChange={(event) => setSiteId(Number(event.target.value))}
                            className="focus-ring w-full rounded-md3-xs border border-outline bg-surface-container-lowest px-3 py-2 type-body-m text-on-surface outline-none focus:border-primary"
                        >
                            {SITE_OPTIONS.map(option => (
                                <option key={option.id} value={option.id}>{option.labelKey ? t(option.labelKey) : option.fallback}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="mb-1 flex items-center justify-between type-label-l text-on-surface-variant">
                            <span>{t("page.mysekaiPreview.preview.backWall")}</span>
                            <span>{Math.round(backWallOpacity * 100)}%</span>
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(backWallOpacity * 100)}
                            onChange={(event) => setBackWallOpacity(Number(event.target.value) / 100)}
                            className="mt-2 w-full accent-primary"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 flex items-center justify-between type-label-l text-on-surface-variant">
                            <span>{t("page.mysekaiPreview.preview.sensitivity")}</span>
                            <span>{Math.round(lookSensitivity * 100)}%</span>
                        </span>
                        <input
                            type="range"
                            min={25}
                            max={220}
                            step={5}
                            value={Math.round(lookSensitivity * 100)}
                            onChange={(event) => setLookSensitivity(Math.max(0.25, Math.min(2.2, Number(event.target.value) / 100)))}
                            className="mt-2 w-full accent-primary"
                        />
                    </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-on-surface-variant">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 type-label-l">
                        <input type="checkbox" className="accent-primary" checked={debugEnabled} onChange={(event) => setDebugEnabled(event.target.checked)} />
                        {t("page.mysekaiPreview.preview.debug")}
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 type-label-l">
                        <input type="checkbox" className="accent-primary" checked={gridEnabled} onChange={(event) => setGridEnabled(event.target.checked)} />
                        {t("page.mysekaiPreview.preview.grid")}
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 type-label-l">
                        <input type="checkbox" className="accent-primary" checked={shadowEnabled} onChange={(event) => setShadowEnabled(event.target.checked)} />
                        {t("page.mysekaiPreview.preview.shadow")}
                    </label>
                </div>

                <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-container-highest">
                    <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: `${progressValue}%` }}
                    />
                </div>
                <div className={`mt-2 whitespace-pre-wrap rounded-md3-md bg-surface-container-lowest p-3 font-mono type-body-s ${statusTone}`}>
                    {status.message}
                </div>
                {!compact && (
                    <div className="mt-2 type-body-s text-on-surface-variant">
                        {t("page.mysekaiPreview.preview.keyboardHint")}
                    </div>
                )}
            </div>

            <div className={`relative overflow-hidden rounded-md3-xl bg-sky-200 shadow-elev-1 ${heightClassName}`}>
                <div ref={hostRef} className="absolute inset-0" />

                {showLoadingOverlay && (
                    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-scrim/32">
                        <div className="w-[min(460px,calc(100%-2rem))] rounded-md3-xl bg-inverse-surface p-6 text-center text-inverse-on-surface shadow-elev-3">
                            <div
                                className="mx-auto h-14 w-56 bg-inverse-primary sm:h-16 sm:w-64"
                                style={{
                                    maskImage: `url(${MOE_LOGO_URL})`,
                                    maskSize: "contain",
                                    maskPosition: "center",
                                    maskRepeat: "no-repeat",
                                    WebkitMaskImage: `url(${MOE_LOGO_URL})`,
                                    WebkitMaskSize: "contain",
                                    WebkitMaskPosition: "center",
                                    WebkitMaskRepeat: "no-repeat",
                                }}
                                role="img"
                                aria-label="Moe Sekai"
                            />
                            <div className="mt-5 type-title-m">{t("page.mysekaiPreview.preview.loadingOverlayTitle")}</div>
                            <div className="mt-1 type-body-s opacity-80">{loadingTitle}</div>
                            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-inverse-on-surface/20">
                                <div
                                    className="h-full rounded-full bg-inverse-primary transition-[width] duration-300 ease-out"
                                    style={{ width: `${progressValue}%` }}
                                />
                            </div>
                            <div className="mt-2 flex items-center justify-between type-label-m opacity-80">
                                <span>{progressValue}%</span>
                                <span>{status.loaded}/{status.renderableTotal ?? status.total ?? 0}</span>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-2 type-label-m">
                                <div className="rounded-md3-md bg-inverse-on-surface/10 px-3 py-2">
                                    <div className="opacity-80">{t("page.mysekaiPreview.preview.completed")}</div>
                                    <div className="mt-0.5 type-title-s text-inverse-primary">{status.loaded}</div>
                                </div>
                                <div className="rounded-md3-md bg-inverse-on-surface/10 px-3 py-2">
                                    <div className="opacity-80">{t("page.mysekaiPreview.preview.ignored")}</div>
                                    <div className="mt-0.5 type-title-s text-inverse-on-surface">{status.ignored ?? 0}</div>
                                </div>
                                <div className="rounded-md3-md bg-inverse-on-surface/10 px-3 py-2">
                                    <div className="opacity-80">{t("page.mysekaiPreview.preview.failed")}</div>
                                    <div className="mt-0.5 type-title-s text-error-container">{status.failed ?? 0}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={axesRef} className="absolute bottom-3 left-3 z-10 h-28 w-28 overflow-hidden rounded-md3-lg bg-inverse-surface" />

                <div className="absolute bottom-3 right-3 z-10 max-w-[calc(100%-9rem)] rounded-md3-md bg-surface-container-lowest px-4 py-2 text-right type-label-m text-on-surface-variant shadow-elev-2">
                    {t("page.mysekaiPreview.preview.credit")}
                </div>
            </div>
        </div>
    );
}
