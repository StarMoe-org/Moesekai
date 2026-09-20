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
export default function WorkspaceStage({ session, player, live, boot, error, expanded, closing, mode, setMode, expand,
    close, retry, onSnapshot, onBoot, onError, onPlayerData }: Props) {
    const { t } = useI18n();
    const root = useRef<HTMLDivElement>(null);
    const [expiredWeatherKey, setExpiredWeatherKey] = useState<string | null>(null);
    const weatherKey = session ? `${session.epoch}:${session.snapshot.id}` : null;
    const hasWeather = Boolean(live?.weather);
    const hasWeatherReceipt = Boolean(session?.snapshot.provenance?.weatherProducerIndexSha256);
    const sceneReady = Boolean(live?.ready);
    useEffect(() => {
        if (!weatherKey || !sceneReady || hasWeather || !hasWeatherReceipt) return;
        const timer = window.setTimeout(() => setExpiredWeatherKey(weatherKey), 30_000);
        return () => window.clearTimeout(timer);
    }, [weatherKey, sceneReady, hasWeather, hasWeatherReceipt]);
    const presentation = useStagePresentation(root, Boolean(session));
    if (!session) return null;
    const phase = closing ? "restoring" : live?.status.phase ?? "preparing";
    const busy = Boolean(live?.status.canStop);
    const show = expanded || presentation.immersive;
    const weatherUnavailable = sceneReady && (!hasWeatherReceipt || expiredWeatherKey === weatherKey);
    return <section ref={root} tabIndex={-1} className={`workspace-stage interaction-stage-column${show ? "" : " workspace-stage-folded"}${presentation.immersive ? " interaction-immersive" : ""}`}
        data-runtime-phase={phase} role={presentation.immersive ? "dialog" : undefined} aria-modal={presentation.immersive || undefined}
        aria-label={t("page.mysekaiWorkspace.scene")}>
        <header className="workspace-stage-heading">
            <button className="workspace-stage-title" onClick={() => { if (show) presentation.leave(); expand(!show); }} aria-expanded={show} aria-controls="workspace-runtime-body">
                <span className={`interaction-phase interaction-phase-${phase}`}>{t(`page.mysekaiInteractions.phase.${phase}`)}</span>
                <strong>{live?.status.activeTitle ?? t("page.mysekaiWorkspace.scene")}</strong><span aria-hidden="true">{show ? "⌃" : "⌄"}</span>
            </button>
            <div className="workspace-stage-actions">
                {busy && <button className="interaction-text-button" disabled={closing} onClick={() => player.current?.stop()}>{t(`page.mysekaiInteractions.${phase === "completed" ? "returnScene" : "stop"}`)}</button>}
                {show && <button className="interaction-text-button" onClick={() => { presentation.leave(); expand(false); }}>{t("page.mysekaiWorkspace.returnToReading")}</button>}
                <button className="interaction-text-button" disabled={closing} onClick={close}>{t("page.mysekaiInteractions.closePlayer")}</button>
            </div>
        </header>
        <div className="workspace-stage-body" id="workspace-runtime-body" inert={!show} aria-hidden={!show}>
            <div className="interaction-stage-surface">
                <RuntimeStage ref={player} session={session} onSnapshot={onSnapshot} onBoot={onBoot} onError={onError} onPlayerData={onPlayerData} />
            </div>
            <div className="workspace-stage-tools">
                {live?.weather ? <WeatherControl weather={live.weather} disabled={closing} choose={id => player.current?.setWeather(id)} /> : <span className="workspace-inline-note" role="status">{t(`page.mysekaiWorkspace.${weatherUnavailable ? "weatherUnavailable" : "preparing"}`)}</span>}
                <div className="workspace-scene-mode" role="group" aria-label={t("page.mysekaiWorkspace.sceneMode")}>
                    <span>{t("page.mysekaiWorkspace.sceneMode")}</span>
                    <div className="workspace-mode-buttons">
                        {(["independent", "current"] as const).map(value => <button type="button" key={value}
                            className="interaction-button" aria-pressed={mode === value} disabled={busy || closing} onClick={() => setMode(value)}>
                            {t(`page.mysekaiInteractions.mode.${value}`)}
                        </button>)}
                    </div>
                </div>
                <div className="workspace-display-actions">
                    <button className="interaction-button" aria-pressed={presentation.immersive} onClick={presentation.immersive ? presentation.leave : presentation.enter}>{t(`page.mysekaiInteractions.r4b.${presentation.immersive ? "exitFullscreen" : "webFullscreen"}`)}</button>
                    <button className="interaction-button" aria-pressed={presentation.fullscreen} onClick={() => void presentation.browserFullscreen()}>{t("page.mysekaiInteractions.r4b.browserFullscreen")}</button>
                </div>
            </div>
            {presentation.failed && <p className="workspace-inline-notice" role="status">{t("page.mysekaiInteractions.r4b.fullscreenUnavailable")}</p>}
            <details className="workspace-source-record workspace-scene-info"><summary>{t("page.mysekaiWorkspace.sceneSettings")}</summary>
                <p>{t(`page.mysekaiInteractions.${mode === "independent" ? "modeHint" : "currentHint"}`)}</p>
                <p>{session.snapshot.region.toUpperCase()} · {session.snapshot.version}{boot?.backend && <> · {boot.backend === "webgpu" ? "WebGPU" : "WebGL 2"}</>}</p>
                {boot && <p>{t("page.mysekaiWorkspace.transferred", { size: (boot.transferredBytes / 1048576).toFixed(1) })}</p>}
            </details>
        </div>
        {(error || live?.status.phase === "error") && <div className="workspace-inline-notice" role="alert">
            <p>{t(`page.mysekaiInteractions.${error?.code === "source_mismatch" ? "sourceMismatch" : "runtimeFailed"}`)}</p>
            <button className="interaction-button" disabled={closing} onClick={retry}>{t("common.action.retry")}</button>
            <button className="interaction-text-button" onClick={close}>{t("page.mysekaiWorkspace.returnToReading")}</button>
        </div>}
    </section>;
}
