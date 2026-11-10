"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useI18n } from "@/contexts/I18nContext";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { Button, Icon, IconButton, LinearProgress, LoadingIndicator, cn, useOverlay } from "@/components/md3";
import { OverlayParentContext } from "@/components/md3/useOverlay";
import {
    mdClose,
    mdError,
    mdFullscreen,
    mdFullscreenExit,
    mdRefresh,
    mdReplay,
    mdSkipNext,
    mdViewInAr,
    mdVolumeOff,
    mdVolumeUp,
} from "@/components/md3/icons";
import { md3EffectsDefault, md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import { sekaiGachaOrigin, sekaiGachaUrl } from "@/lib/sekaiGacha/config";
import { playCommand, readStageMessage, type SekaiGachaCommand, type SekaiGachaPhase } from "@/lib/sekaiGacha/protocol";
import type { ICardInfo } from "@/types/types";

export interface GachaStageCard {
    card: ICardInfo;
    trained: boolean;
    pickup: boolean;
}

/** One presentation. A new `id` plays `cards` (1–10, revealed in order). */
export interface GachaStageRequest {
    id: number;
    cards: GachaStageCard[];
}

interface Props {
    request: GachaStageRequest;
    open: boolean;
    onClose(): void;
    /** Draws again with the same spin and plays the new result. */
    onAgain(): void;
    againLabel: string;
    title: string;
    logoUrl: string;
    backdropUrl: string;
}

interface StageState {
    phase: SekaiGachaPhase;
    revealed: number;
    total: number;
    error?: string;
}

const MUTED_KEY = "gacha-stage-3d-muted";
const PLAYING: readonly SekaiGachaPhase[] = ["loading", "intro", "reveal"];
const isFourStar = (card: ICardInfo) => card.cardRarityType === "rarity_4" || card.cardRarityType === "rarity_birthday";

function readMuted(): boolean {
    try { return localStorage.getItem(MUTED_KEY) === "1"; } catch { return false; }
}

/**
 * Full-screen stage for the 3D gacha presentation. The Unity build runs in a cross-origin
 * iframe that stays loaded while this component is mounted, so later draws start at once;
 * closing only hides it (a hidden cross-origin frame is throttled by the browser).
 */
export default function GachaStage3d({ request, open, onClose, onAgain, againLabel, title, logoUrl, backdropUrl }: Props) {
    const { t } = useI18n();
    const reduced = useReducedMotion();
    const { mounted, overlayRef, overlayContext, onFocusCapture } = useOverlay(open, onClose);
    const frame = useRef<HTMLIFrameElement>(null);
    const [frameKey, setFrameKey] = useState(0);
    const [frameLoaded, setFrameLoaded] = useState(false);
    const [engineReady, setEngineReady] = useState(false);
    const [loader, setLoader] = useState(0);
    const [stage, setStage] = useState<StageState>({ phase: "booting", revealed: 0, total: 0 });
    const [muted, setMuted] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
    // The newest request the stage has not accepted yet, and the one it is playing.
    const wanted = useRef<GachaStageRequest | null>(null);
    const playing = useRef<GachaStageRequest | null>(null);
    const mutedRef = useRef(false);
    const openRef = useRef(open);
    const stageRef = useRef(stage);
    const origin = sekaiGachaOrigin();

    useEffect(() => {
        const value = readMuted();
        setMuted(value);
        mutedRef.current = value;
        setFullscreenAvailable(Boolean(document.fullscreenEnabled));
    }, []);
    useEffect(() => { stageRef.current = stage; }, [stage]);
    // Declared before the effects that send commands, so they see the current value.
    useEffect(() => { openRef.current = open; }, [open]);

    const post = useCallback((command: SekaiGachaCommand) => {
        frame.current?.contentWindow?.postMessage(command, origin);
    }, [origin]);

    // Hands the newest request to the stage once it can take one. While the engine boots the
    // stage keeps the command itself; while a presentation runs it would refuse it.
    const flush = useCallback(() => {
        const next = wanted.current;
        if (!next || !frameLoaded || PLAYING.includes(stageRef.current.phase)) return;
        wanted.current = null;
        playing.current = next;
        post({ type: "sekai-gacha:mute", muted: mutedRef.current || !openRef.current });
        post(playCommand(next.cards.map(item => item.card)));
        if (stageRef.current.phase !== "booting") {
            const state = { phase: "loading" as const, revealed: 0, total: next.cards.length };
            stageRef.current = state;
            setStage(state);
        }
    }, [frameLoaded, post]);

    useEffect(() => {
        if (playing.current?.id === request.id || wanted.current?.id === request.id) return;
        wanted.current = request;
        flush();
    }, [request, flush]);

    useEffect(() => {
        if (!frameLoaded) return;
        if (open) {
            post({ type: "sekai-gacha:mute", muted: mutedRef.current });
            return;
        }
        // Hidden: silence it and let a running presentation jump to its end.
        post({ type: "sekai-gacha:mute", muted: true });
        if (PLAYING.includes(stageRef.current.phase)) post({ type: "sekai-gacha:skip" });
        if (document.fullscreenElement && document.fullscreenElement === overlayRef.current) void document.exitFullscreen().catch(() => {});
    }, [open, frameLoaded, post, overlayRef]);

    useEffect(() => {
        const receive = (event: MessageEvent) => {
            if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
            const message = readStageMessage(event.data);
            if (!message) return;
            if (message.kind === "loader") {
                setLoader(message.progress);
            } else if (message.kind === "state") {
                if (message.phase !== "booting" && message.phase !== "error") setEngineReady(true);
                const state = { phase: message.phase, revealed: message.revealed, total: message.total, error: message.error };
                stageRef.current = state;
                setStage(state);
                flush();
            } else if (message.code === "busy" && playing.current) {
                // Refused because the previous presentation was still ending: send it again then.
                wanted.current ??= playing.current;
            } else {
                console.warn("[sekai-gacha] command rejected", message.code, message.message);
                const state = { phase: "error" as const, revealed: 0, total: 0, error: `${message.code}: ${message.message}` };
                stageRef.current = state;
                setStage(state);
            }
        };
        window.addEventListener("message", receive);
        return () => window.removeEventListener("message", receive);
    }, [origin, flush]);

    useEffect(() => { flush(); }, [frameLoaded, flush]);

    useEffect(() => {
        const change = () => setFullscreen(Boolean(overlayRef.current && document.fullscreenElement === overlayRef.current));
        document.addEventListener("fullscreenchange", change);
        return () => document.removeEventListener("fullscreenchange", change);
    }, [overlayRef]);

    const toggleMuted = () => {
        const value = !muted;
        setMuted(value);
        mutedRef.current = value;
        try { localStorage.setItem(MUTED_KEY, value ? "1" : "0"); } catch { /* storage unavailable */ }
        post({ type: "sekai-gacha:mute", muted: value });
    };
    const toggleFullscreen = () => {
        const root = overlayRef.current;
        if (!root) return;
        if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
        else void root.requestFullscreen?.().catch(() => setFullscreenAvailable(false));
    };
    const retry = () => {
        if (!engineReady) {
            // The engine itself failed to start: load the page again.
            wanted.current = playing.current ?? request;
            playing.current = null;
            setFrameLoaded(false);
            setLoader(0);
            const state = { phase: "booting" as const, revealed: 0, total: 0 };
            stageRef.current = state;
            setStage(state);
            setFrameKey(key => key + 1);
            return;
        }
        wanted.current = playing.current ?? request;
        playing.current = null;
        flush();
    };

    if (!mounted) return null;

    const { phase } = stage;
    const preparing = phase === "booting" || phase === "ready" || phase === "loading";
    const booting = !engineReady && phase !== "error";
    const shown = playing.current ?? request;
    const fourStars = shown.cards.filter(item => isFourStar(item.card)).length;
    const pickups = shown.cards.filter(item => item.pickup).length;
    const fade = reduced ? reducedMotionFade : md3EffectsDefault;
    const rise = reduced ? reducedMotionFade : md3SpatialDefault;

    return createPortal(
        <OverlayParentContext.Provider value={overlayContext}>
            <div
                ref={overlayRef}
                onFocusCapture={onFocusCapture}
                role="dialog"
                aria-modal={open || undefined}
                aria-label={t("page.gacha.stage3d.dialogLabel", { name: title })}
                aria-hidden={!open || undefined}
                inert={!open}
                tabIndex={-1}
                className={cn(
                    "fixed inset-0 z-[200] isolate overflow-hidden bg-scrim outline-none",
                    "transition-[opacity,visibility] duration-300 ease-md3-standard motion-reduce:transition-none",
                    open ? "visible opacity-100" : "pointer-events-none invisible opacity-0",
                )}
            >
                <iframe
                    key={frameKey}
                    ref={frame}
                    src={sekaiGachaUrl()}
                    title={t("page.gacha.stage3d.frameTitle")}
                    allow="autoplay; fullscreen"
                    sandbox="allow-scripts allow-same-origin"
                    onLoad={() => setFrameLoaded(true)}
                    className="absolute inset-0 h-full w-full border-0"
                />

                {/* Preparing: the banner art with the engine or card download progress. */}
                <AnimatePresence>
                    {preparing && (
                        <motion.div
                            key="preparing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={fade}
                            className="absolute inset-0 grid place-items-center p-4"
                        >
                            <Image src={backdropUrl} alt="" fill unoptimized className="object-cover" />
                            <div className="absolute inset-0 bg-scrim/50" />
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={rise}
                                className="glass-thick relative flex w-full max-w-sm flex-col items-center gap-4 rounded-md3-xl px-6 pb-6 pt-5 text-center"
                                aria-live="polite"
                            >
                                <div className="relative h-24 w-full">
                                    <Image src={logoUrl} alt={title} fill unoptimized className="object-contain" />
                                </div>
                                <div className="w-full space-y-3">
                                    <p className="type-title-m text-on-surface">
                                        {booting ? t("page.gacha.stage3d.loadingEngine") : t("page.gacha.stage3d.loadingCards")}
                                    </p>
                                    {booting ? (
                                        <LinearProgress value={loader} wavy={loader < 1} aria-label={t("page.gacha.stage3d.loadingEngine")} />
                                    ) : (
                                        <div className="flex justify-center"><LoadingIndicator size={40} aria-label={t("page.gacha.stage3d.loadingCards")} /></div>
                                    )}
                                    <p className="type-body-s text-on-surface-variant">
                                        {booting
                                            ? t("page.gacha.stage3d.loadingEngineHint", { percent: Math.round(loader * 100) })
                                            : t("page.gacha.stage3d.loadingCardsHint", { count: shown.cards.length })}
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Top bar: what is playing, and the stage controls. */}
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
                    <div className="glass pointer-events-auto flex h-12 min-w-0 items-center gap-2 rounded-full pl-4 pr-2">
                        <Icon path={mdViewInAr} size={20} className="shrink-0 text-primary" />
                        <span className="truncate type-title-s text-on-surface">{title}</span>
                        {(phase === "reveal" || phase === "complete") && stage.total > 0 && (
                            <span className="shrink-0 rounded-full bg-primary-container px-2.5 py-1 type-label-m text-on-primary-container tabular-nums">
                                {t("page.gacha.stage3d.progress", { current: stage.revealed, total: stage.total })}
                            </span>
                        )}
                    </div>
                    <div className="glass pointer-events-auto flex shrink-0 items-center gap-1 rounded-full p-1">
                        <IconButton
                            icon={muted ? mdVolumeOff : mdVolumeUp}
                            label={muted ? t("page.gacha.stage3d.unmute") : t("page.gacha.stage3d.mute")}
                            onClick={toggleMuted}
                        />
                        {fullscreenAvailable && (
                            <IconButton
                                icon={fullscreen ? mdFullscreenExit : mdFullscreen}
                                label={fullscreen ? t("page.gacha.stage3d.exitFullscreen") : t("page.gacha.stage3d.fullscreen")}
                                onClick={toggleFullscreen}
                            />
                        )}
                        <IconButton icon={mdClose} label={t("common.action.close")} variant="filled" onClick={onClose} />
                    </div>
                </div>

                {/* Skip while the presentation runs. */}
                <AnimatePresence>
                    {(phase === "intro" || phase === "reveal") && (
                        <motion.div
                            key="skip"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 12 }}
                            transition={rise}
                            className="glass absolute bottom-4 right-4 rounded-full p-1 sm:bottom-6 sm:right-6"
                        >
                            <Button variant="text" icon={mdSkipNext} onClick={() => post({ type: "sekai-gacha:skip" })}>
                                {t("page.gacha.stage3d.skip")}
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Results once every card is out. */}
                <AnimatePresence>
                    {phase === "complete" && (
                        <motion.section
                            key={`results-${shown.id}`}
                            initial={{ opacity: 0, y: 32 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 32 }}
                            transition={rise}
                            aria-label={t("page.gacha.stage3d.resultsTitle")}
                            className="glass-thick absolute inset-x-3 bottom-3 mx-auto max-w-4xl rounded-md3-xl p-4 sm:inset-x-6 sm:bottom-6 sm:p-5"
                        >
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <h2 className="mr-auto type-title-m text-on-surface">{t("page.gacha.stage3d.resultsTitle")}</h2>
                                {fourStars > 0 && (
                                    <span className="rounded-full bg-yellow-400 px-2.5 py-1 type-label-m text-black/80">
                                        {t("page.gacha.stage3d.fourStarCount", { count: fourStars })}
                                    </span>
                                )}
                                {pickups > 0 && (
                                    <span className="rounded-full bg-tertiary px-2.5 py-1 type-label-m text-on-tertiary">
                                        {t("page.gacha.stage3d.pickupCount", { count: pickups })}
                                    </span>
                                )}
                            </div>
                            <ol className={cn("grid gap-2", shown.cards.length > 5 ? "grid-cols-5 sm:grid-cols-10" : "grid-cols-5")}>
                                {shown.cards.map((item, index) => (
                                    <motion.li
                                        key={`${shown.id}-${index}`}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={reduced ? reducedMotionFade : { ...md3SpatialDefault, delay: 0.04 * index }}
                                        className={cn(
                                            "overflow-hidden rounded-md3-sm bg-surface-container-lowest",
                                            item.pickup ? "ring-2 ring-tertiary" : isFourStar(item.card) ? "ring-2 ring-yellow-400" : "ring-1 ring-outline-variant",
                                        )}
                                    >
                                        <SekaiCardThumbnail card={item.card} trained={item.trained} className="w-full" />
                                    </motion.li>
                                ))}
                            </ol>
                            <div className="mt-4 flex flex-wrap justify-end gap-2">
                                <Button variant="tonal" onClick={onClose}>{t("page.gacha.stage3d.done")}</Button>
                                <Button variant="filled" icon={mdReplay} onClick={onAgain}>{againLabel}</Button>
                            </div>
                        </motion.section>
                    )}
                </AnimatePresence>

                {/* A failed engine start or card download. */}
                <AnimatePresence>
                    {phase === "error" && (
                        <motion.div
                            key="error"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={fade}
                            className="absolute inset-0 grid place-items-center bg-scrim/60 p-4"
                        >
                            <div role="alert" className="glass-thick flex w-full max-w-sm flex-col items-center gap-3 rounded-md3-xl p-6 text-center">
                                <Icon path={mdError} size={40} className="text-error" />
                                <p className="type-title-m text-on-surface">
                                    {engineReady ? t("page.gacha.stage3d.cardsFailed") : t("page.gacha.stage3d.engineFailed")}
                                </p>
                                <p className="type-body-s text-on-surface-variant">
                                    {engineReady ? t("page.gacha.stage3d.cardsFailedHint") : t("page.gacha.stage3d.engineFailedHint")}
                                </p>
                                {stage.error && <p className="max-h-20 w-full overflow-auto break-all rounded-md3-sm bg-surface-container px-3 py-2 font-mono type-label-s text-on-surface-variant">{stage.error}</p>}
                                <div className="mt-1 flex gap-2">
                                    <Button variant="tonal" onClick={onClose}>{t("common.action.close")}</Button>
                                    <Button variant="filled" icon={mdRefresh} onClick={retry}>{t("common.action.retry")}</Button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </OverlayParentContext.Provider>,
        document.body,
    );
}
