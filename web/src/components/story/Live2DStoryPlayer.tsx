"use client";
import { useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Button, Icon, IconButton, LinearProgress, Surface, cn } from "@/components/md3";
import { mdClose, mdFullscreen, mdOpenInNew, mdPlayArrowFill, mdSmartDisplay, mdTune } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { md3EffectsFast, md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import type { SsePlayerNode } from "@/lib/sseWeb/player";
import { sseWebAspectRatio } from "@/lib/sseWeb/settings";
import { storyPlayerHref } from "@/lib/storyPlayer/episodes";
import { Live2DPlayerSettings } from "./Live2DPlayerSettings";
import { Live2DControls, Live2DFailureBanner, Live2DStage } from "./Live2DStage";
import { useLive2DPlayer } from "./useLive2DPlayer";

export interface Live2DStoryPlayerHandle {
    /** Continues from the start of node `node` (0-based), when the player is loaded. */
    seek(node: number): void;
}

interface Live2DStoryPlayerProps {
    /** The episode in the story library, e.g. `event:219/1`. */
    selector: string;
    /** The game server whose library the episode is read from. */
    region: string;
    /** The player is loaded (true) or was closed (false). */
    onActiveChange?: (active: boolean) => void;
    /**
     * Playback is in node `node` of `nodes` (0-based; `nodes.length` after the last one). The
     * nodes are what a tap acts on: talks, telops, full-screen texts and choices.
     */
    onNode?: (node: number, nodes: readonly SsePlayerNode[]) => void;
    /** Controls of the page that belong with the player's own, shown while it plays. */
    extraControls?: React.ReactNode;
    ref?: React.Ref<Live2DStoryPlayerHandle>;
}

/**
 * The player's window, which floats over the page while it plays: the page keeps its list
 * clear of it. A page may hold several players (a card's two parts); one plays at a time,
 * and only its window carries the id.
 */
export const LIVE2D_STORY_PLAYER_ID = "story-live2d-player";

/** The page's top that the site's header covers (taller on a narrow page), and a gap below it. */
export function live2dStoryPlayerTop(): number {
    return Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 64) + 8;
}

/** Where the player's window is: its left and top in the viewport and its width, in CSS pixels. */
interface Frame {
    x: number;
    y: number;
    width: number;
}

const FRAME_KEY = "story-live2d-window";
const FRAME_MARGIN = 8;
const FRAME_MIN_WIDTH = 240;
/** What the arrow keys move or resize the window by. */
const FRAME_KEY_STEP = 16;

/** The viewport without its scrollbar. */
function viewport(): [number, number] {
    return [document.documentElement.clientWidth, window.innerHeight];
}

/**
 * The widest the window may be: the picture (`ratio`: its width over its height) and the
 * `chrome` around it (title and controls) fit the page.
 */
function fitWidth(width: number, chrome: number, ratio: number): number {
    const [vw, vh] = viewport();
    const widest = Math.min(vw - 2 * FRAME_MARGIN, (vh - live2dStoryPlayerTop() - FRAME_MARGIN - chrome) * ratio);
    return Math.round(Math.max(FRAME_MIN_WIDTH, Math.min(width, widest)));
}

/** `frame` narrowed and moved to lie wholly in the page, below the site's header. */
function fitFrame(frame: Frame, chrome: number, ratio: number): Frame {
    const [vw, vh] = viewport();
    const width = fitWidth(frame.width, chrome, ratio);
    const height = chrome + width / ratio;
    const x = Math.round(Math.max(FRAME_MARGIN, Math.min(frame.x, vw - width - FRAME_MARGIN)));
    const y = Math.round(Math.max(live2dStoryPlayerTop(), Math.min(frame.y, vh - height - FRAME_MARGIN)));
    return x === frame.x && y === frame.y && width === frame.width ? frame : { x, y, width };
}

/** Where the reader left the window, or the page's lower right corner (a narrow page: its top, in full width). */
function initialFrame(): Frame {
    try {
        const stored = JSON.parse(localStorage.getItem(FRAME_KEY) ?? "null") as Partial<Frame> | null;
        if (stored && [stored.x, stored.y, stored.width].every(Number.isFinite)) {
            return { x: stored.x!, y: stored.y!, width: stored.width! };
        }
    } catch {
        // no storage, or not what was stored: the default place
    }
    const [vw, vh] = viewport();
    if (vw < 640) return { x: FRAME_MARGIN, y: live2dStoryPlayerTop(), width: vw - 2 * FRAME_MARGIN };
    const width = Math.round(Math.min(560, Math.max(400, vw * 0.36)));
    return { x: vw - width, y: vh, width };
}

function storeFrame(frame: Frame) {
    try {
        localStorage.setItem(FRAME_KEY, JSON.stringify(frame));
    } catch {
        // the window is where it is until the page is left
    }
}

const subscribeNever = () => () => {};

/**
 * The Live2D mode of the story reader: plays the episode as the game does,
 * rendered in the browser by sse-web. Nothing is downloaded until the reader
 * asks for it. Renders nothing when no release is configured.
 */
export function Live2DStoryPlayer({ selector, region, onActiveChange, onNode, extraControls, ref }: Live2DStoryPlayerProps) {
    const { t } = useI18n();
    const { stageRef, player } = useLive2DPlayer({ selector, region, onActiveChange, onNode });
    const { phase, ratio, shown } = player;
    const windowRef = useRef<HTMLDivElement | null>(null);
    /** A drag of the window's title or of one of its corners: where it began. */
    const dragRef = useRef<{ kind: "move" | "left" | "right"; x: number; y: number; from: Frame; to: Frame } | null>(null);
    const [frame, setFrame] = useState<Frame | null>(null);
    /** The window is being moved or resized: it is lifted while it is. */
    const [dragging, setDragging] = useState(false);
    const reducedMotion = useReducedMotion();
    const [settingsOpen, setSettingsOpen] = useState(false);
    // the window is outside the page's own layers, in the body: only in the browser
    const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);

    /** Loads the episode in a window where the reader left it: not laid out yet, its width is known from there. */
    const start = () => void player.start({
        shownWidth: (settings) => {
            const placed = fitFrame(initialFrame(), 0, sseWebAspectRatio(settings));
            setFrame(placed);
            return placed.width;
        },
    });

    // The window stays in the page: when the page is resized, and when its own height changes
    // (its controls wrap, or come with the player).
    useEffect(() => {
        const [frameElement, stage] = [windowRef.current, stageRef.current];
        if (!shown || !frameElement || !stage) return;
        const fit = () => {
            if (document.fullscreenElement === stage || dragRef.current) return;
            setFrame(previous => previous && fitFrame(previous, frameElement.offsetHeight - stage.offsetHeight, ratio));
        };
        const observer = new ResizeObserver(fit);
        observer.observe(frameElement);
        window.addEventListener("resize", fit);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", fit);
        };
    }, [shown, ratio, stageRef]);

    useImperativeHandle(ref, () => ({ seek: player.seek }), [player.seek]);

    if (!player.available) return null;

    /** The window's height that is not picture. */
    const chrome = () => (windowRef.current?.offsetHeight ?? 0) - (stageRef.current?.offsetHeight ?? 0);

    /** `from` moved by (`dx`, `dy`), or resized by `dx` at its left or right corner (the other side stays). */
    const dragged = (kind: "move" | "left" | "right", from: Frame, dx: number, dy: number): Frame => {
        if (kind === "move") return fitFrame({ ...from, x: from.x + dx, y: from.y + dy }, chrome(), ratio);
        const width = fitWidth(from.width + (kind === "right" ? dx : -dx), chrome(), ratio);
        return fitFrame({ x: kind === "left" ? from.x + from.width - width : from.x, y: from.y, width }, chrome(), ratio);
    };

    const gripProps = (kind: "move" | "left" | "right") => ({
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            if (!frame || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { kind, x: event.clientX, y: event.clientY, from: frame, to: frame };
            setDragging(true);
            event.preventDefault();
        },
        onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
            const drag = dragRef.current;
            if (!drag) return;
            drag.to = dragged(drag.kind, drag.from, event.clientX - drag.x, event.clientY - drag.y);
            setFrame(drag.to);
        },
        onPointerUp: () => {
            if (dragRef.current) storeFrame(dragRef.current.to);
            dragRef.current = null;
            setDragging(false);
        },
        onPointerCancel: () => {
            dragRef.current = null;
            setDragging(false);
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            const [dx, dy] = {
                ArrowLeft: [-FRAME_KEY_STEP, 0], ArrowRight: [FRAME_KEY_STEP, 0], ArrowUp: [0, -FRAME_KEY_STEP], ArrowDown: [0, FRAME_KEY_STEP],
            }[event.key] ?? [0, 0];
            if (!frame || event.target !== event.currentTarget || (dx === 0 && dy === 0)) return;
            event.preventDefault();
            const next = dragged(kind, frame, dx, dy);
            setFrame(next);
            storeFrame(next);
        },
    });


    // what stays in the page while the picture is in its window, a line each
    const notes = [t("page.story.live2d.windowHint"), ...player.notes];
    // the same episode on the story player page, its script beside a larger stage
    const playerPageLink = (
        <Button variant="text" icon={mdOpenInNew} href={storyPlayerHref(region, selector)} className="shrink-0">
            {t("page.story.live2d.openInStoryPlayer")}
        </Button>
    );

    // a corner's mark follows the window's rounding
    const corner = "absolute bottom-0 z-10 flex h-7 w-7 touch-none items-center justify-center text-on-surface-variant/60 focus-ring rounded-md3-sm";
    const cornerMark = (
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
            <path d="M13 3A10 10 0 0 1 3 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );

    return (
        <>
            <Surface tone="default" radius="xl" className="relative z-10 mb-6 overflow-hidden">
                {phase === "idle" && (
                    <div className="flex flex-col items-center justify-between gap-4 p-5 sm:flex-row">
                        <div className="min-w-0">
                            <h3 className="flex items-center gap-2 type-title-m text-on-surface">
                                <Icon path={mdSmartDisplay} size={20} className="text-primary" />
                                {t("page.story.live2d.title")}
                            </h3>
                            <p className="mt-1 type-body-s text-on-surface-variant">{t("page.story.live2d.hint")}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
                            {playerPageLink}
                            <Button variant="tonal" icon={mdPlayArrowFill} onClick={start} className="shrink-0">
                                {t("page.story.live2d.start")}
                            </Button>
                        </div>
                    </div>
                )}

                {phase === "failed" && (
                    <div className="p-4">
                        <Live2DFailureBanner player={player} onRetry={start} onClose={player.close} />
                    </div>
                )}

                {/* The picture is in its window: what stays in the page says so. */}
                {shown && (
                    <div className="flex items-start gap-4 p-5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md3-md bg-primary-container text-on-primary-container">
                            <Icon path={mdSmartDisplay} size={24} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h3 className="type-title-m text-on-surface">{t("page.story.live2d.title")}</h3>
                            <ul className="mt-1 space-y-1 type-body-s text-on-surface-variant">
                                {notes.map(line => <li key={line}>{line}</li>)}
                            </ul>
                            <div className="-ml-3 mt-2">{playerPageLink}</div>
                        </div>
                    </div>
                )}
            </Surface>

            {/*
              * The window: over the page and its side rail, below the site's header and its dialogs.
              * It stays mounted while a player exists, whose canvas is in its stage.
              */}
            {inBrowser && createPortal(
                <motion.div
                    ref={windowRef}
                    id={shown ? LIVE2D_STORY_PLAYER_ID : undefined}
                    role="region"
                    aria-label={t("page.story.live2d.title")}
                    className={cn("@container fixed z-[90]", !shown && "hidden")}
                    style={frame ? { left: frame.x, top: frame.y, width: frame.width } : undefined}
                    // it arrives with a spring; it leaves at once (its picture is gone already)
                    initial={false}
                    animate={shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: reducedMotion ? 1 : 0.92 }}
                    transition={reducedMotion ? reducedMotionFade : { scale: md3SpatialDefault, opacity: md3EffectsFast }}
                >
                <Surface
                    tone="high"
                    radius="xl"
                    className={cn(
                        "relative overflow-hidden transition-shadow duration-200 ease-md3-standard",
                        dragging ? "shadow-elev-4" : "shadow-elev-3",
                    )}
                >
                    <div
                        {...gripProps("move")}
                        tabIndex={0}
                        aria-label={t("page.story.live2d.moveWindow")}
                        className="focus-ring relative flex h-12 cursor-grab touch-none select-none items-center gap-1 rounded-t-md3-xl pl-5 pr-2 active:cursor-grabbing"
                    >
                        {/* Material's drag handle */}
                        <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-8 -translate-x-1/2 rounded-full bg-on-surface-variant/40" />
                        <span className="min-w-0 flex-1 truncate type-title-s text-on-surface">{t("page.story.live2d.title")}</span>
                        {phase === "ready" && (
                            <>
                                <IconButton icon={mdTune} label={t("page.story.live2d.settings.title")} onClick={() => setSettingsOpen(true)} />
                                <IconButton icon={mdFullscreen} label={t("page.story.live2d.fullscreen")} onClick={player.toggleFullscreen} />
                            </>
                        )}
                        <IconButton icon={mdClose} label={t("page.story.live2d.close")} onClick={player.close} />
                    </div>

                    <Live2DStage player={player} stageRef={stageRef} style={player.fullscreen ? undefined : { aspectRatio: ratio }} />

                    {/* The window's toolbar; the corners at the bottom lie on it, and it is there in both phases. */}
                    {phase === "ready" && (
                        <LinearProgress
                            // a wave while the story plays, flat while it is paused
                            wavy={player.playing}
                            value={player.position.nodes > 0 ? Math.min(player.position.node, player.position.nodes) / player.position.nodes : 0}
                            aria-label={t("page.story.live2d.position", { current: player.shownNode, total: player.position.nodes })}
                        />
                    )}
                    <div
                        role="toolbar"
                        aria-label={t("page.story.live2d.controls")}
                        className="flex min-h-16 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2"
                    >
                        {phase === "ready" && <Live2DControls player={player} floating={false} extra={extraControls} />}
                        {phase === "loading" && (
                            <Button variant="text" onClick={player.close} className="ml-auto">{t("common.action.cancel")}</Button>
                        )}
                    </div>

                    <div
                        {...gripProps("left")}
                        tabIndex={0}
                        role="separator"
                        aria-label={t("page.story.live2d.resizeWindow")}
                        className={cn(corner, "left-0 -scale-x-100 cursor-nesw-resize")}
                    >
                        {cornerMark}
                    </div>
                    <div
                        {...gripProps("right")}
                        tabIndex={0}
                        role="separator"
                        aria-label={t("page.story.live2d.resizeWindow")}
                        className={cn(corner, "right-0 cursor-nwse-resize")}
                    >
                        {cornerMark}
                    </div>
                </Surface>
                </motion.div>,
                document.body,
            )}

            <Live2DPlayerSettings
                isOpen={settingsOpen && phase === "ready"}
                onClose={() => setSettingsOpen(false)}
                settings={player.settings}
                msaaSampleCounts={player.msaaSampleCounts}
                onChange={player.changeSettings}
            />
        </>
    );
}

export default Live2DStoryPlayer;
