"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Banner, Button, EmptyState, IconButton, LinearProgress } from "@/components/md3";
import {
    md360, mdAccessibilityNew, mdFace, mdFitScreen, mdPauseFill, mdPlayArrowFill, mdReplay, mdViewInAr,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { Costume3dStage, Costume3dStageAbortedError, type StageLoad } from "@/lib/costume3d/stage";

/** Whether the browser hands out a WebGL context, asked the way three.js asks (the probe is released at once). */
function canCreateWebGLContext(): boolean {
    try {
        const canvas = document.createElement("canvas");
        const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
        return gl !== null;
    } catch {
        return false;
    }
}

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

interface Costume3dViewportProps {
    /** The look to show; a new object loads it. */
    load: StageLoad | null;
    /** The role's unit colour, for the platform and the background. */
    unitColor: string;
    /** Title, subtitle and anything else drawn over the stage's top left. */
    caption?: React.ReactNode;
    /** What the stage says on behalf of the screen reader: who wears what. */
    label: string;
    className?: string;
}

/**
 * The 3D stage with its toolbar. The look on stage stays while the next one loads; a failed
 * load leaves it there with a banner to retry.
 */
export function Costume3dViewport({ load, unitColor, caption, label, className = "" }: Costume3dViewportProps) {
    const { t } = useI18n();
    const hostRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Costume3dStage | null>(null);
    const [webglUnavailable, setWebglUnavailable] = useState(false);
    const [ready, setReady] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [rotating, setRotating] = useState(false);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        if (!canCreateWebGLContext()) {
            // what the browser offers is only known here, after mounting
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setWebglUnavailable(true);
            return;
        }
        let stage: Costume3dStage;
        try {
            stage = new Costume3dStage(host, { still: prefersReducedMotion() });
        } catch (error) {
            // No WebGL context (hardware acceleration off, GPU blocklisted, context limit):
            // only the stage gives way, not the page around it.
            console.warn("[costume3d] WebGL unavailable", error);
            setWebglUnavailable(true);
            return;
        }
        stageRef.current = stage;
        setPlaying(stage.playing);
        setReady(true);
        return () => {
            stageRef.current = null;
            stage.dispose();
        };
    }, []);

    useEffect(() => {
        stageRef.current?.setUnitColor(unitColor);
    }, [unitColor, ready]);

    useEffect(() => {
        const stage = stageRef.current;
        if (!stage || !load) return;
        const controller = new AbortController();
        stage.show(load, {
            signal: controller.signal,
            onProgress: (done, total) => {
                if (controller.signal.aborted) return;
                setFailed(null);
                setProgress(total ? done / total : 1);
            },
        }).then(() => {
            if (controller.signal.aborted) return;
            setProgress(null);
            setShown(true);
            setPlaying(stage.playing);
        }, (error: unknown) => {
            if (controller.signal.aborted || error instanceof Costume3dStageAbortedError) return;
            console.warn("[costume3d] load failed", error);
            setProgress(null);
            setFailed(error instanceof Error ? error.message : String(error));
        });
        return () => controller.abort();
    }, [load, ready, attempt]);

    const togglePlay = useCallback(() => {
        const stage = stageRef.current;
        if (!stage) return;
        if (stage.playing) stage.pause();
        else stage.play();
        setPlaying(stage.playing);
    }, []);

    const replay = useCallback(() => {
        stageRef.current?.replay();
        setPlaying(true);
    }, []);

    const restPose = useCallback(() => {
        stageRef.current?.restPose();
        setPlaying(false);
    }, []);

    const toggleRotate = useCallback(() => {
        const stage = stageRef.current;
        if (!stage) return;
        stage.autoRotate = !stage.autoRotate;
        setRotating(stage.autoRotate);
    }, []);

    const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        const stage = stageRef.current;
        if (!stage || event.target !== event.currentTarget) return;
        const actions: Record<string, () => void> = {
            ArrowLeft: () => stage.nudge(-Math.PI / 12),
            ArrowRight: () => stage.nudge(Math.PI / 12),
            "+": () => stage.nudge(0, 0.85),
            "=": () => stage.nudge(0, 0.85),
            "-": () => stage.nudge(0, 1 / 0.85),
            " ": togglePlay,
            r: () => stage.viewBody(),
        };
        const action = actions[event.key];
        if (!action) return;
        event.preventDefault();
        action();
    }, [togglePlay]);

    const background = {
        backgroundImage: `radial-gradient(ellipse 70% 60% at 50% 38%, color-mix(in srgb, ${unitColor} 22%, var(--md-sys-color-surface-container-lowest)), color-mix(in srgb, ${unitColor} 10%, var(--md-sys-color-surface-container-high)) 75%, var(--md-sys-color-surface-container-highest))`,
    };

    return (
        <div className={`relative overflow-hidden rounded-md3-lg transition-[background-image] duration-500 ${className}`} style={background}>
            {webglUnavailable ? (
                <EmptyState
                    icon={mdViewInAr}
                    title={t("page.costume3d.stage.webglUnavailableTitle")}
                    description={t("page.costume3d.stage.webglUnavailableMessage")}
                    className="h-full"
                />
            ) : (
                <div
                    ref={hostRef}
                    role="img"
                    aria-label={label}
                    tabIndex={0}
                    onKeyDown={onKeyDown}
                    onDoubleClick={() => stageRef.current?.viewBody()}
                    className="focus-ring absolute inset-0"
                />
            )}

            {progress != null && (
                <div className="absolute inset-x-0 top-0" aria-live="polite">
                    <LinearProgress value={progress} aria-label={t("page.costume3d.stage.loading")} />
                </div>
            )}
            {!shown && !webglUnavailable && !failed && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center type-body-m text-on-surface-variant">
                    {t("page.costume3d.stage.loading")}
                </div>
            )}

            {caption && <div className="pointer-events-none absolute left-4 top-4 max-w-[70%]">{caption}</div>}

            {failed && (
                <div className="absolute inset-x-3 top-3">
                    <Banner
                        tone="error"
                        title={t("page.costume3d.stage.loadFailed")}
                        action={<Button variant="text" onClick={() => setAttempt(n => n + 1)}>{t("page.costume3d.stage.retry")}</Button>}
                    >
                        <span className="break-all type-body-s">{failed}</span>
                    </Banner>
                </div>
            )}

            {!webglUnavailable && (
                <div className="glass absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full p-1">
                    <IconButton icon={mdFitScreen} label={t("page.costume3d.stage.viewBody")} onClick={() => stageRef.current?.viewBody()} />
                    <IconButton icon={mdFace} label={t("page.costume3d.stage.viewHead")} onClick={() => stageRef.current?.viewHead()} />
                    <IconButton
                        icon={playing ? mdPauseFill : mdPlayArrowFill}
                        label={playing ? t("page.costume3d.stage.pause") : t("page.costume3d.stage.play")}
                        variant="filled"
                        onClick={togglePlay}
                    />
                    <IconButton icon={mdReplay} label={t("page.costume3d.stage.replay")} onClick={replay} />
                    <IconButton icon={mdAccessibilityNew} label={t("page.costume3d.stage.restPose")} onClick={restPose} />
                    <IconButton
                        icon={md360}
                        label={t("page.costume3d.stage.autoRotate")}
                        selected={rotating}
                        onClick={toggleRotate}
                    />
                </div>
            )}
        </div>
    );
}
