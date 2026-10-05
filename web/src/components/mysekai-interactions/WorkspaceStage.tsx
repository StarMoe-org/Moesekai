"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Button, Chip, Icon, IconButton, LoadingIndicator } from "@/components/md3";
import { mdFullscreen, mdFullscreenExit, mdKeyboardArrowDown, mdRefresh, mdSettings, mdSmartDisplay, mdVolumeOff, mdVolumeUp } from "@/components/md3/icons";
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
            className={`workspace-stage interaction-stage-column${show ? "" :" workspace-stage-folded"}${
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
                        <Icon path={mdSmartDisplay} size={24} />
                    </span>
                    <span className="workspace-stage-copy">
                        <strong>{live?.status.activeTitle ?? t("page.mysekaiWorkspace.scene")}</strong>
                        <span className={`interaction-phase interaction-phase-${phase}`}>
                            {t(`page.mysekaiInteractions.phase.${phase}`)}
                        </span>
                    </span>
                    <span className="workspace-stage-disclosure">
                        {t(`page.mysekaiWorkspace.${show ? "collapseScene" : "expandScene"}`)}
                        <Icon path={mdKeyboardArrowDown} size={18} />
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
                        <div className="absolute inset-0 z-10 flex select-none flex-col items-center justify-center bg-inverse-surface p-6 text-center text-inverse-on-surface">
                            <LoadingIndicator size={48} className="mb-4 text-inverse-primary" />
                            <p className="mb-1.5 type-title-m">
                                {loadingText}
                            </p>
                            <p className="max-w-sm type-body-s opacity-80">
                                {t("page.mysekaiWorkspace.stageLoadingTip")}
                            </p>
                        </div>
                    )}
                </div>

                {/* Stage bottom toolbar */}
                <div className="workspace-stage-tools flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-container">
                    <div className="flex items-center gap-2 flex-wrap">
                        {live?.weather ? (
                            <WeatherControl
                                weather={live.weather}
                                disabled={closing}
                                choose={id => player.current?.setWeather(id)}
                            />
                        ) : (
                            <span className="type-body-s text-on-surface-variant" role="status">
                                {t(`page.mysekaiWorkspace.${weatherUnavailable ? "weatherUnavailable" : "preparing"}`)}
                            </span>
                        )}

                        <div className="ml-2 hidden items-center gap-2 type-label-m text-on-surface-variant sm:flex">
                            <span>{t("page.mysekaiWorkspace.sceneMode")}:</span>
                            <Chip selected={mode === "independent"} disabled={busy || closing} onClick={() => setMode("independent")}>
                                {t("page.mysekaiInteractions.mode.independent")}
                            </Chip>
                            <Chip selected={mode === "current"} disabled={busy || closing} onClick={() => setMode("current")}>
                                {t("page.mysekaiInteractions.mode.current")}
                            </Chip>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        {/* Mute/Unmute quick toggle */}
                        <Button
                            size="xs"
                            variant="tonal"
                            color={soundEnabled ? "primary" : "error"}
                            icon={soundEnabled ? mdVolumeUp : mdVolumeOff}
                            onClick={onToggleSound}
                            title={t(`page.mysekaiWorkspace.${soundEnabled ? "soundOn" : "soundOff"}`)}
                        >
                            <span className="hidden sm:inline">
                                {t(`page.mysekaiWorkspace.${soundEnabled ? "soundOn" : "soundOff"}`)}
                            </span>
                        </Button>

                        {/* Settings button */}
                        <Button
                            size="xs"
                            variant="tonal"
                            icon={mdSettings}
                            onClick={onOpenSettings}
                            title={t("page.mysekaiWorkspace.settingsModalTitle")}
                        >
                            <span className="hidden md:inline">{t("page.mysekaiWorkspace.settingsModalTitle")}</span>
                        </Button>

                        {/* Fullscreen buttons */}
                        <IconButton
                            size="xs"
                            variant="tonal"
                            icon={presentation.immersive ? mdFullscreenExit : mdFullscreen}
                            selected={presentation.immersive}
                            onClick={presentation.immersive ? presentation.leave : presentation.enter}
                            label={t(`page.mysekaiInteractions.r4b.${presentation.immersive ? "exitFullscreen" : "webFullscreen"}`)}
                        />
                    </div>
                </div>

                {presentation.failed && (
                    <p className="bg-tertiary-container p-2 text-center type-body-s text-on-tertiary-container" role="status">
                        {t("page.mysekaiInteractions.r4b.fullscreenUnavailable")}
                    </p>
                )}
            </div>

            {(error || live?.status.phase === "error") && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-error-container p-4 text-on-error-container" role="alert">
                    <p className="type-title-s">
                        {t(`page.mysekaiInteractions.${error?.code === "source_mismatch" ? "sourceMismatch" : "runtimeFailed"}`)}
                    </p>
                    <div className="flex gap-2">
                        <Button size="xs" variant="filled" color="error" icon={mdRefresh} disabled={closing} onClick={retry}>
                            {t("common.action.retry")}
                        </Button>
                        <Button size="xs" variant="text" color="error" onClick={close}>
                            {t("page.mysekaiWorkspace.returnToReading")}
                        </Button>
                    </div>
                </div>
            )}
        </section>
    );
}
