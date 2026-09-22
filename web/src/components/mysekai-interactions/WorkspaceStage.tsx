"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyBoot, MolyError, MolySnapshot, MolyPlayerDataState } from "@/lib/moly/contract";
import RuntimeStage, { type PlayerSession, type RuntimeStageHandle } from "./RuntimeStage";
import { useStagePresentation } from "./useStagePresentation";
import WeatherControl from "./WeatherControl";

interface Props {
    session: PlayerSession | null;
    player: RefObject<RuntimeStageHandle | null>;
    live: MolySnapshot | null;
    boot: MolyBoot | null;
    error: MolyError | null;
    expanded: boolean;
    closing: boolean;
    mode: "independent" | "current";
    soundEnabled: boolean;
    onToggleSound(): void;
    onOpenSettings(): void;
    setMode(mode: "independent" | "current"): void;
    expand(value: boolean): void;
    close(): void;
    retry(): void;
    onSnapshot(value: MolySnapshot): void;
    onBoot(value: MolyBoot): void;
    onError(value: MolyError): void;
    onPlayerData(value: MolyPlayerDataState): void;
}

/** Collapsing the presentation does not move, key, or unmount the renderer. */
export default function WorkspaceStage({
    session,
    player,
    live,
    boot,
    error,
    expanded,
    closing,
    mode,
    soundEnabled,
    onToggleSound,
    onOpenSettings,
    setMode,
    expand,
    close,
    retry,
    onSnapshot,
    onBoot,
    onError,
    onPlayerData,
}: Props) {
    const { t } = useI18n();
    const root = useRef<HTMLDivElement>(null);
    const [expiredWeatherKey, setExpiredWeatherKey] = useState<string | null>(null);
    const weatherKey = session ? `${session.epoch}:${session.snapshot.id}` : null;
    const hasWeather = Boolean(live?.weather);
    const sceneReady = Boolean(live?.ready);

    useEffect(() => {
        if (!weatherKey || !sceneReady || hasWeather) return;
        const timer = window.setTimeout(() => setExpiredWeatherKey(weatherKey), 30_000);
        return () => window.clearTimeout(timer);
    }, [weatherKey, sceneReady, hasWeather]);

    const presentation = useStagePresentation(root, Boolean(session));
    if (!session) return null;

    const phase = closing ? "restoring" : live?.status.phase ?? "preparing";
    const busy = Boolean(live?.status.canStop);
    const show = expanded || presentation.immersive;
    const weatherUnavailable = sceneReady && expiredWeatherKey === weatherKey;

    const loadingText = boot?.phase === "downloading"
        ? t("page.mysekaiWorkspace.stageDownloading", {
              size: boot.transferredBytes ? (boot.transferredBytes / 1048576).toFixed(1) : "0",
          })
        : boot?.phase === "compiling"
        ? t("page.mysekaiWorkspace.stageCompiling")
        : t("page.mysekaiWorkspace.stagePreparing");

    return (
        <section
            ref={root}
            tabIndex={-1}
            className={`workspace-stage interaction-stage-column${show ? "" : " workspace-stage-folded"}${
                presentation.immersive ? " interaction-immersive" : ""
            }`}
            data-runtime-phase={phase}
            role={presentation.immersive ? "dialog" : undefined}
            aria-modal={presentation.immersive || undefined}
            aria-label={t("page.mysekaiWorkspace.scene")}
        >
            <header className="workspace-stage-heading">
                <button
                    className="workspace-stage-title"
                    onClick={() => {
                        if (show) presentation.leave();
                        expand(!show);
                    }}
                    aria-expanded={show}
                    aria-controls="workspace-runtime-body"
                >
                    <span className="workspace-stage-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                            <rect x="3" y="4" width="18" height="13" rx="3" />
                            <path d="M8 21h8M12 17v4m-2-13 5 2.5-5 2.5z" />
                        </svg>
                    </span>
                    <span className="workspace-stage-copy">
                        <strong>{live?.status.activeTitle ?? t("page.mysekaiWorkspace.scene")}</strong>
                        <span className={`interaction-phase interaction-phase-${phase}`}>
                            {t(`page.mysekaiInteractions.phase.${phase}`)}
                        </span>
                    </span>
                    <span className="workspace-stage-disclosure">
                        {t(`page.mysekaiWorkspace.${show ? "collapseScene" : "expandScene"}`)}
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <path d="m5 7.5 5 5 5-5" />
                        </svg>
                    </span>
                </button>
                <div className="workspace-stage-actions">
                    {busy && (
                        <button
                            className="interaction-text-button"
                            disabled={closing}
                            onClick={() => player.current?.stop()}
                        >
                            {t(`page.mysekaiInteractions.${phase === "completed" ? "returnScene" : "stop"}`)}
                        </button>
                    )}
                    <button className="interaction-text-button" disabled={closing} onClick={close}>
                        {t("page.mysekaiInteractions.closePlayer")}
                    </button>
                </div>
            </header>

            <div className="workspace-stage-body" id="workspace-runtime-body" inert={!show} aria-hidden={!show}>
                <div className="interaction-stage-surface relative">
                    <RuntimeStage
                        ref={player}
                        session={session}
                        onSnapshot={onSnapshot}
                        onBoot={onBoot}
                        onError={onError}
                        onPlayerData={onPlayerData}
                    />

                    {/* Instant Loading Overlay */}
                    {!sceneReady && !error && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-slate-900/80 backdrop-blur-sm text-white text-center select-none">
                            <div className="w-10 h-10 border-3 border-miku border-t-transparent rounded-full animate-spin mb-4" />
                            <p className="text-base font-bold text-white mb-1.5 tracking-wide">
                                {loadingText}
                            </p>
                            <p className="text-xs text-slate-300 max-w-sm leading-relaxed">
                                {t("page.mysekaiWorkspace.stageLoadingTip")}
                            </p>
                        </div>
                    )}
                </div>

                {/* Stage bottom toolbar */}
                <div className="workspace-stage-tools flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800/80">
                    <div className="flex items-center gap-2 flex-wrap">
                        {live?.weather ? (
                            <WeatherControl
                                weather={live.weather}
                                disabled={closing}
                                choose={id => player.current?.setWeather(id)}
                            />
                        ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500" role="status">
                                {t(`page.mysekaiWorkspace.${weatherUnavailable ? "weatherUnavailable" : "preparing"}`)}
                            </span>
                        )}

                        <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 ml-2">
                            <span>{t("page.mysekaiWorkspace.sceneMode")}:</span>
                            <button
                                type="button"
                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                    mode === "independent"
                                        ? "bg-miku/15 text-miku font-bold"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                                }`}
                                disabled={busy || closing}
                                onClick={() => setMode("independent")}
                            >
                                {t("page.mysekaiInteractions.mode.independent")}
                            </button>
                            <button
                                type="button"
                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                    mode === "current"
                                        ? "bg-miku/15 text-miku font-bold"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                                }`}
                                disabled={busy || closing}
                                onClick={() => setMode("current")}
                            >
                                {t("page.mysekaiInteractions.mode.current")}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        {/* Mute/Unmute quick toggle */}
                        <button
                            type="button"
                            onClick={onToggleSound}
                            title={t(`page.mysekaiWorkspace.${soundEnabled ? "soundOn" : "soundOff"}`)}
                            className={`p-2 rounded-lg border transition-all text-xs flex items-center gap-1.5 ${
                                soundEnabled
                                    ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-miku"
                                    : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400"
                            }`}
                        >
                            {soundEnabled ? (
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" />
                                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" strokeLinecap="round" />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                                    <line x1="23" y1="9" x2="17" y2="15" strokeLinecap="round" />
                                    <line x1="17" y1="9" x2="23" y2="15" strokeLinecap="round" />
                                </svg>
                            )}
                            <span className="hidden sm:inline">
                                {t(`page.mysekaiWorkspace.${soundEnabled ? "soundOn" : "soundOff"}`)}
                            </span>
                        </button>

                        {/* Settings button */}
                        <button
                            type="button"
                            onClick={onOpenSettings}
                            title={t("page.mysekaiWorkspace.settingsModalTitle")}
                            className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-miku transition-colors flex items-center gap-1.5 text-xs font-medium"
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                            <span className="hidden md:inline">{t("page.mysekaiWorkspace.settingsModalTitle")}</span>
                        </button>

                        {/* Fullscreen buttons */}
                        <div className="flex gap-1">
                            <button
                                type="button"
                                className={`p-2 rounded-lg border text-xs font-semibold transition-all ${
                                    presentation.immersive
                                        ? "bg-miku text-white border-miku"
                                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-miku/60"
                                }`}
                                onClick={presentation.immersive ? presentation.leave : presentation.enter}
                                title={t(`page.mysekaiInteractions.r4b.${presentation.immersive ? "exitFullscreen" : "webFullscreen"}`)}
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {presentation.failed && (
                    <p className="p-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 text-center" role="status">
                        {t("page.mysekaiInteractions.r4b.fullscreenUnavailable")}
                    </p>
                )}
            </div>

            {(error || live?.status.phase === "error") && (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-900/50 flex flex-wrap items-center justify-between gap-3 text-xs" role="alert">
                    <p className="font-semibold text-red-600 dark:text-red-400">
                        {t(`page.mysekaiInteractions.${error?.code === "source_mismatch" ? "sourceMismatch" : "runtimeFailed"}`)}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="px-3 py-1.5 rounded-md bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50"
                            disabled={closing}
                            onClick={retry}
                        >
                            {t("common.action.retry")}
                        </button>
                        <button
                            type="button"
                            className="px-3 py-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                            onClick={close}
                        >
                            {t("page.mysekaiWorkspace.returnToReading")}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
