"use client";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Banner, Button, CircularProgress, Icon, IconButton, LinearProgress, Slider, Surface, Switch, cn } from "@/components/md3";
import {
    mdClose, mdDragIndicator, mdFullscreen, mdFullscreenExit, mdPauseFill, mdPlayArrowFill, mdSkipNext, mdSkipPrevious,
    mdSmartDisplay, mdTune, mdVolumeOff, mdVolumeUp,
} from "@/components/md3/icons";
import { getServerDisplayCode } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import type { ServerType } from "@/lib/account-servers";
import { sseWebCoreUrl, sseWebEnabled, sseWebSources } from "@/lib/sseWeb/config";
import {
    loadSsePlayer, sseWebScriptBase,
    type SsePlayer, type SsePlayerError, type SsePlayerErrorKind, type SsePlayerMissing, type SsePlayerUnsupported,
} from "@/lib/sseWeb/player";
import {
    SSE_WEB_DEFAULT_SETTINGS, loadSseWebSettings, sseWebAspectRatio, sseWebRenderSize, storeSseWebSettings,
    type SseWebSettings,
} from "@/lib/sseWeb/settings";
import { Live2DPlayerSettings } from "./Live2DPlayerSettings";

export interface Live2DStoryPlayerHandle {
    /** Continues from the start of talk `talk` (0-based), when the player is loaded. */
    seek(talk: number): void;
}

interface Live2DStoryPlayerProps {
    /** The episode in the story library, e.g. `event:219/1`. */
    selector: string;
    /** The game server whose library the episode is read from. */
    region: string;
    /** The player is loaded (true) or was closed (false). */
    onActiveChange?: (active: boolean) => void;
    /** Playback is in talk `talk` of `talks` (0-based; `talks` after the last one). */
    onTalk?: (talk: number, talks: number) => void;
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

/** Closes the player that is loading or playing now, for the next one to take its place. */
let closeCurrent: (() => void) | null = null;

/** The page's top that the site's header covers (taller on a narrow page), and a gap below it. */
export function live2dStoryPlayerTop(): number {
    return Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 64) + 8;
}

type Phase = "idle" | "loading" | "ready" | "failed";

interface Failure {
    kind: SsePlayerErrorKind;
    message: string;
    missing: SsePlayerMissing[];
}

const MISSING_KEY = {
    "webgpu": "page.story.live2d.missing.webgpu",
    "webgpu-adapter": "page.story.live2d.missing.webgpuAdapter",
    "offscreen-canvas": "page.story.live2d.missing.offscreenCanvas",
    "audio-worklet": "page.story.live2d.missing.audioWorklet",
    "worker": "page.story.live2d.missing.worker",
} as const satisfies Record<SsePlayerMissing, string>;

const NOT_PLAYED_KEY = {
    movie: "page.story.live2d.notPlayedReasons.movie",
    music_video: "page.story.live2d.notPlayedReasons.musicVideo",
    input_name: "page.story.live2d.notPlayedReasons.inputName",
    selectable: "page.story.live2d.notPlayedReasons.selectable",
    unknown_effect_type: "page.story.live2d.notPlayedReasons.unknownEffect",
    unknown_action: "page.story.live2d.notPlayedReasons.unknownAction",
} as const satisfies Record<SsePlayerUnsupported["reason"], string>;

/** A stall shorter than this is not shown: decoding a model's textures holds a frame or two. */
const BUFFERING_AFTER_MS = 400;

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
export function Live2DStoryPlayer({ selector, region, onActiveChange, onTalk, extraControls, ref }: Live2DStoryPlayerProps) {
    const { t } = useI18n();
    const sources = sseWebSources(region);
    const windowRef = useRef<HTMLDivElement | null>(null);
    const stageRef = useRef<HTMLDivElement | null>(null);
    /** A drag of the window's title or of one of its corners: where it began. */
    const dragRef = useRef<{ kind: "move" | "left" | "right"; x: number; y: number; from: Frame; to: Frame } | null>(null);
    const lastVolumeRef = useRef(80);
    const playerRef = useRef<SsePlayer | null>(null);
    /** Counts starts and closes: a load that finishes after it was superseded is thrown away. */
    const epochRef = useRef(0);
    const callbacks = useRef({ onActiveChange, onTalk });
    useEffect(() => { callbacks.current = { onActiveChange, onTalk }; });

    const [phase, setPhase] = useState<Phase>("idle");
    const [progress, setProgress] = useState<{ fraction: number | undefined; megabytes: number }>({ fraction: undefined, megabytes: 0 });
    const [failure, setFailure] = useState<Failure | null>(null);
    const [playing, setPlaying] = useState(false);
    const [auto, setAuto] = useState(true);
    const [volume, setVolume] = useState(80);
    const [position, setPosition] = useState({ talk: 0, talks: 0, waitsForClick: false, waitsForAnswer: false, ended: false });
    const [buffering, setBuffering] = useState(false);
    const [notPlayed, setNotPlayed] = useState<SsePlayerUnsupported[]>([]);
    const [fullscreen, setFullscreen] = useState(false);
    const [frame, setFrame] = useState<Frame | null>(null);
    const [settings, setSettings] = useState<SseWebSettings>(SSE_WEB_DEFAULT_SETTINGS);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [stats, setStats] = useState<{ width: number; height: number; fps: number; skipped: number; megabytes: number } | null>(null);
    const ratio = sseWebAspectRatio(settings);
    // the window is outside the page's own layers, in the body: only in the browser
    const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);

    const release = useCallback(() => {
        epochRef.current++;
        playerRef.current?.destroy();
        playerRef.current = null;
        // the canvas went to the player's worker for good: the next player gets a new one
        stageRef.current?.querySelector("canvas")?.remove();
    }, []);

    // what closes this player, as the page's other players know it
    const closeRef = useRef<() => void>(() => {});

    const close = useCallback(() => {
        if (closeCurrent === closeRef.current) closeCurrent = null;
        release();
        if (document.fullscreenElement === stageRef.current) void document.exitFullscreen();
        setPhase("idle");
        setPlaying(false);
        setBuffering(false);
        setFailure(null);
        callbacks.current.onActiveChange?.(false);
    }, [release]);

    const fail = useCallback((error: SsePlayerError | { kind?: SsePlayerErrorKind; message?: string }) => {
        release();
        setPlaying(false);
        setBuffering(false);
        setFailure({
            kind: error.kind ?? "internal",
            message: error.message ?? "",
            missing: "missing" in error && Array.isArray(error.missing) ? error.missing : [],
        });
        setPhase("failed");
        callbacks.current.onActiveChange?.(false);
    }, [release]);

    useEffect(() => { closeRef.current = close; });

    const start = useCallback(async () => {
        const stage = stageRef.current;
        const core = sseWebCoreUrl();
        if (!stage || !core || !sources) return;
        // one player at a time: each holds an episode's files and models in memory
        if (closeCurrent && closeCurrent !== closeRef.current) closeCurrent();
        closeCurrent = closeRef.current;
        release();
        const epoch = epochRef.current;
        // the window is not laid out yet: its width is known from where it will be
        const chosen = loadSseWebSettings();
        const placed = fitFrame(initialFrame(), 0, sseWebAspectRatio(chosen));
        setSettings(chosen);
        setFrame(placed);
        setFailure(null);
        setProgress({ fraction: undefined, megabytes: 0 });
        setPhase("loading");
        try {
            const SsePlayerClass = await loadSsePlayer();
            if (epoch !== epochRef.current) return;
            const canvas = document.createElement("canvas");
            const [width, height] = sseWebRenderSize(chosen, placed.width, false);
            canvas.width = width;
            canvas.height = height;
            canvas.className = "block h-full w-full object-contain";
            stage.prepend(canvas);
            const player = await SsePlayerClass.create({
                canvas,
                js: sseWebScriptBase(),
                pkg: "pkg/",
                core,
                sources: { library: sources.library, inapp: sources.inapp, ...(sources.proxy ? { proxy: sources.proxy } : {}) },
                selector,
                width,
                height,
                playerName: t("page.story.live2d.playerName"),
                auto: true,
                onProgress: ({ sim, render, kit }) => {
                    if (epoch !== epochRef.current) return;
                    // the two workers' file counts; the UI kit is found file by file and only adds bytes
                    const files = [sim, render].filter(part => part?.phase === "files");
                    const done = files.reduce((sum, part) => sum + (part?.done ?? 0), 0);
                    const total = files.reduce((sum, part) => sum + (part?.total ?? 0), 0);
                    setProgress({
                        fraction: files.length === 2 && total > 0 ? done / total : undefined,
                        megabytes: ((sim?.bytes ?? 0) + (render?.bytes ?? 0) + (kit?.bytes ?? 0)) / 1e6,
                    });
                },
            });
            if (epoch !== epochRef.current) {
                player.destroy();
                return;
            }
            playerRef.current = player;
            player.setVolume(volume / 100);
            setAuto(true);
            setNotPlayed(player.unsupported);
            setPosition({ talk: player.talk, talks: player.talks.length, waitsForClick: false, waitsForAnswer: false, ended: false });
            setPhase("ready");
            callbacks.current.onActiveChange?.(true);
            callbacks.current.onTalk?.(player.talk, player.talks.length);
        } catch (error) {
            if (epoch !== epochRef.current) return;
            fail(error as SsePlayerError);
        }
        // `volume` is read once, for the new player; later changes go through setVolume
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fail, release, selector, region, t]);

    // The player's events, and its position a few times a second (waiting for a click or an
    // answer has no event of its own).
    useEffect(() => {
        const player = playerRef.current;
        if (phase !== "ready" || !player) return;
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        let stall: { since: number; reason: string } | undefined;
        const onStall = (event: Event) => {
            clearTimeout(stallTimer);
            stall = { since: performance.now(), reason: String((event as CustomEvent<{ reason?: string }>).detail?.reason ?? "") };
            const reason = stall.reason;
            stallTimer = setTimeout(() => {
                // shown from here on: say what playback waits for (a wait that never ends has no resume)
                console.info(`[sse-web] buffering: ${reason}`);
                setBuffering(true);
            }, BUFFERING_AFTER_MS);
        };
        const onResume = () => {
            clearTimeout(stallTimer);
            if (stall && performance.now() - stall.since >= BUFFERING_AFTER_MS) {
                console.info(`[sse-web] buffered for ${Math.round(performance.now() - stall.since)} ms`);
            }
            stall = undefined;
            setBuffering(false);
        };
        const onTalkEvent = () => callbacks.current.onTalk?.(player.talk, player.talks.length);
        const onEnded = () => setPlaying(false);
        const onError = (event: Event) => fail((event as CustomEvent<{ kind?: SsePlayerErrorKind; message?: string }>).detail ?? {});
        player.addEventListener("stall", onStall);
        player.addEventListener("resume", onResume);
        player.addEventListener("talk", onTalkEvent);
        player.addEventListener("ended", onEnded);
        player.addEventListener("error", onError);
        const poll = setInterval(() => {
            const p = player.position;
            setPosition(previous => (
                previous.talk === p.talk && previous.talks === p.talks && previous.waitsForClick === !!p.waitsForClick
                    && previous.waitsForAnswer === !!p.waitsForAnswer && previous.ended === p.ended
                    ? previous
                    : { talk: p.talk, talks: p.talks, waitsForClick: !!p.waitsForClick, waitsForAnswer: !!p.waitsForAnswer, ended: p.ended }
            ));
        }, 250);
        return () => {
            clearTimeout(stallTimer);
            clearInterval(poll);
            player.removeEventListener("stall", onStall);
            player.removeEventListener("resume", onResume);
            player.removeEventListener("talk", onTalkEvent);
            player.removeEventListener("ended", onEnded);
            player.removeEventListener("error", onError);
        };
    }, [phase, fail]);

    // The window stays in the page: when the page is resized, and when its own height changes
    // (its controls wrap, or come with the player).
    const shown = phase === "loading" || phase === "ready";
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
    }, [shown, ratio]);

    // The render size follows the stage (the window's width, the screen in full screen) and
    // what the reader chose.
    useEffect(() => {
        const stage = stageRef.current;
        if (phase !== "ready" || !stage) return;
        let pending: ReturnType<typeof setTimeout> | undefined;
        const follow = () => {
            clearTimeout(pending);
            pending = setTimeout(() => {
                const [width, height] = sseWebRenderSize(settings, stage.clientWidth, document.fullscreenElement === stage);
                playerRef.current?.resize(width, height);
            }, 200);
        };
        follow();
        const onFullscreen = () => {
            setFullscreen(document.fullscreenElement === stage);
            follow();
        };
        const observer = new ResizeObserver(follow);
        observer.observe(stage);
        document.addEventListener("fullscreenchange", onFullscreen);
        return () => {
            clearTimeout(pending);
            observer.disconnect();
            document.removeEventListener("fullscreenchange", onFullscreen);
        };
    }, [phase, settings]);

    // What the picture costs, once a second, when the reader asked to see it.
    useEffect(() => {
        const player = playerRef.current;
        if (phase !== "ready" || !player || !settings.showStats) return;
        let last = { at: performance.now(), presented: player.stats.presented };
        const read = () => {
            const now = { at: performance.now(), presented: player.stats.presented };
            setStats({
                width: player.width,
                height: player.height,
                fps: Math.round((now.presented - last.presented) * 1000 / Math.max(1, now.at - last.at)),
                skipped: player.stats.skipped,
                megabytes: Math.round(((player.stats.simWasm ?? 0) + (player.stats.renderWasm ?? 0)) / 1e6),
            });
            last = now;
        };
        const timer = setInterval(read, 1000);
        return () => {
            clearInterval(timer);
            setStats(null);
        };
    }, [phase, settings.showStats]);

    // Leaving the page, or another episode or server in the same reader, ends the player.
    useEffect(() => () => {
        if (closeCurrent === closeRef.current) closeCurrent = null;
        release();
    }, [release, selector, region]);

    useImperativeHandle(ref, () => ({
        seek(talk: number) {
            playerRef.current?.seek(talk);
        },
    }), []);

    if (!sseWebEnabled() || !sources) return null;

    const togglePlay = () => {
        const player = playerRef.current;
        if (!player) return;
        if (playing) {
            player.pause();
            setPlaying(false);
        } else {
            if (position.ended) player.seek(0);
            void player.play();
            setPlaying(true);
        }
    };

    const onStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const player = playerRef.current;
        const canvas = stageRef.current?.querySelector("canvas");
        if (!player || !canvas || (event.target as HTMLElement).closest("button")) return;
        if (!playing) {
            togglePlay();
            return;
        }
        // the picture keeps its aspect ratio inside the canvas' box (object-contain)
        const box = canvas.getBoundingClientRect();
        const scale = Math.min(box.width / player.width, box.height / player.height);
        const [left, top] = [(box.width - player.width * scale) / 2, (box.height - player.height * scale) / 2];
        player.click((event.clientX - box.left - left) / scale, (event.clientY - box.top - top) / scale);
    };

    const toggleFullscreen = () => {
        const stage = stageRef.current;
        if (!stage) return;
        if (document.fullscreenElement === stage) void document.exitFullscreen();
        else void stage.requestFullscreen().catch(() => {});
    };

    const changeAuto = (next: boolean) => {
        setAuto(next);
        playerRef.current?.setAuto(next);
    };

    const changeVolume = (next: number) => {
        if (next > 0) lastVolumeRef.current = next;
        setVolume(next);
        playerRef.current?.setVolume(next / 100);
    };

    /** The window's height that is not picture. */
    const chrome = () => (windowRef.current?.offsetHeight ?? 0) - (stageRef.current?.offsetHeight ?? 0);

    /** `from` moved by (`dx`, `dy`), or resized by `dx` at its left or right corner (the other side stays). */
    const dragged = (kind: "move" | "left" | "right", from: Frame, dx: number, dy: number): Frame => {
        if (kind === "move") return fitFrame({ ...from, x: from.x + dx, y: from.y + dy }, chrome(), ratio);
        const width = fitWidth(from.width + (kind === "right" ? dx : -dx), chrome(), ratio);
        return fitFrame({ x: kind === "left" ? from.x + from.width - width : from.x, y: from.y, width }, chrome(), ratio);
    };

    const changeSettings = (next: SseWebSettings) => {
        setSettings(next);
        storeSseWebSettings(next);
    };

    const gripProps = (kind: "move" | "left" | "right") => ({
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            if (!frame || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { kind, x: event.clientX, y: event.clientY, from: frame, to: frame };
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
        },
        onPointerCancel: () => {
            dragRef.current = null;
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

    const failureTitle = failure && {
        unsupported: t("page.story.live2d.errors.unsupportedTitle"),
        "not-found": t("page.story.live2d.errors.notFoundTitle"),
        network: t("page.story.live2d.errors.networkTitle"),
        internal: t("page.story.live2d.errors.internalTitle"),
    }[failure.kind];
    const failureDetail = failure && (
        failure.kind === "unsupported"
            ? t("page.story.live2d.errors.unsupportedDescription", { missing: failure.missing.map(m => t(MISSING_KEY[m])).join(t("page.story.live2d.listSeparator")) })
            : failure.kind === "not-found"
                ? t("page.story.live2d.errors.notFoundDescription")
                : failure.kind === "network"
                    ? t("page.story.live2d.errors.networkDescription")
                    : failure.message
    );
    const canRetry = failure?.kind === "network" || failure?.kind === "internal";
    const hint = position.waitsForAnswer
        ? t("page.story.live2d.chooseAnswer")
        : position.waitsForClick
            ? t("page.story.live2d.clickToContinue")
            : position.ended
                ? t("page.story.live2d.ended")
                : null;
    const note = [
        t("page.story.live2d.windowHint"),
        phase === "ready" && t("page.story.live2d.originalTextNote", { server: getServerDisplayCode(region as ServerType) }),
        phase === "ready" && sources.borrowedUi && t("page.story.live2d.borrowedUiNote"),
        phase === "ready" && notPlayed.length > 0 && t("page.story.live2d.notPlayed", {
            items: [...new Set(notPlayed.map(item => t(NOT_PLAYED_KEY[item.reason])))].join(t("page.story.live2d.listSeparator")),
        }),
    ].filter(Boolean).join(" ");

    const corner = "absolute bottom-0 z-10 flex h-5 w-5 touch-none items-center justify-center text-on-surface-variant focus-ring";
    const cornerMark = (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
            <path d="M11 4 4 11M11 8 8 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
                        <Button variant="tonal" icon={mdPlayArrowFill} onClick={() => void start()} className="shrink-0">
                            {t("page.story.live2d.start")}
                        </Button>
                    </div>
                )}

                {phase === "failed" && failure && (
                    <div className="p-4">
                        <Banner
                            tone={failure.kind === "unsupported" || failure.kind === "not-found" ? "warning" : "error"}
                            title={failureTitle}
                            action={(
                                <div className="flex gap-2">
                                    {canRetry && <Button variant="tonal" size="xs" onClick={() => void start()}>{t("common.action.retry")}</Button>}
                                    <Button variant="text" size="xs" onClick={close}>{t("page.story.reader.close")}</Button>
                                </div>
                            )}
                        >
                            <p className="break-words">{failureDetail}</p>
                        </Banner>
                    </div>
                )}

                {/* The picture is in its window: what stays in the page says so. */}
                {shown && (
                    <div className="flex items-start gap-3 px-5 py-4">
                        <Icon path={mdSmartDisplay} size={20} className="mt-0.5 shrink-0 text-primary" />
                        <div className="min-w-0">
                            <h3 className="type-title-s text-on-surface">{t("page.story.live2d.title")}</h3>
                            <p className="mt-1 type-body-s text-on-surface-variant">{note}</p>
                        </div>
                    </div>
                )}
            </Surface>

            {/*
              * The window: over the page and its side rail, below the site's header and its dialogs.
              * It stays mounted while a player exists, whose canvas is in its stage.
              */}
            {inBrowser && createPortal(
                <div
                    ref={windowRef}
                    id={shown ? LIVE2D_STORY_PLAYER_ID : undefined}
                    role="region"
                    aria-label={t("page.story.live2d.title")}
                    className={cn("@container fixed z-[90]", !shown && "hidden")}
                    style={frame ? { left: frame.x, top: frame.y, width: frame.width } : undefined}
                >
                <Surface tone="default" radius="lg" elevation={3} className="relative overflow-hidden">
                    <div
                        {...gripProps("move")}
                        tabIndex={0}
                        aria-label={t("page.story.live2d.moveWindow")}
                        className="focus-ring flex h-10 cursor-grab touch-none select-none items-center gap-1 pl-2 pr-1 active:cursor-grabbing"
                    >
                        <Icon path={mdDragIndicator} size={20} className="shrink-0 text-on-surface-variant" />
                        <span className="min-w-0 flex-1 truncate type-label-l text-on-surface">{t("page.story.live2d.title")}</span>
                        {phase === "ready" && (
                            <>
                                <IconButton icon={mdTune} label={t("page.story.live2d.settings.title")} size="xs" onClick={() => setSettingsOpen(true)} />
                                <IconButton icon={mdFullscreen} label={t("page.story.live2d.fullscreen")} size="xs" onClick={toggleFullscreen} />
                            </>
                        )}
                        <IconButton icon={mdClose} label={t("page.story.live2d.close")} size="xs" onClick={close} />
                    </div>

                    <div
                        ref={stageRef}
                        onClick={onStageClick}
                        className={cn("relative w-full select-none bg-scrim", phase === "ready" && "cursor-pointer")}
                        style={fullscreen ? undefined : { aspectRatio: ratio }}
                    >
                        {phase === "loading" && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-primary-fixed">
                                <p className="type-title-s">
                                    {progress.fraction === undefined
                                        ? t("page.story.live2d.preparing")
                                        : t("page.story.live2d.loading", { percent: Math.floor(progress.fraction * 100) })}
                                </p>
                                <LinearProgress value={progress.fraction} className="w-3/5 max-w-sm" aria-label={t("page.story.live2d.title")} />
                                <p className="type-body-s opacity-80">{t("page.story.live2d.loadedSize", { size: progress.megabytes.toFixed(1) })}</p>
                            </div>
                        )}
                        {phase === "ready" && !playing && !position.ended && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-scrim/30">
                                <span className="flex h-1/4 max-h-16 min-h-10 aspect-square items-center justify-center rounded-full bg-primary text-on-primary">
                                    <Icon path={mdPlayArrowFill} size={28} />
                                </span>
                            </div>
                        )}
                        {phase === "ready" && buffering && (
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-scrim/40 text-primary-fixed">
                                <CircularProgress aria-label={t("page.story.live2d.buffering")} />
                                <p className="type-label-l">{t("page.story.live2d.buffering")}</p>
                            </div>
                        )}
                        {phase === "ready" && stats && (
                            <p className="pointer-events-none absolute left-2 top-2 rounded-md3-sm bg-scrim/60 px-2 py-0.5 type-label-s tabular-nums text-primary-fixed">
                                {t("page.story.live2d.settings.statsLine", stats)}
                            </p>
                        )}
                        {fullscreen && (
                            <IconButton
                                icon={mdFullscreenExit}
                                label={t("page.story.live2d.exitFullscreen")}
                                variant="tonal"
                                onClick={toggleFullscreen}
                                className="absolute right-3 top-3 opacity-70"
                            />
                        )}
                    </div>

                    {/* The corners at the bottom lie on this bar, which is there in both phases. */}
                    <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5">
                        {phase === "ready" && (
                            <>
                                <div className="flex items-center gap-1">
                                    <IconButton
                                        icon={mdSkipPrevious}
                                        label={t("page.story.live2d.previousTalk")}
                                        size="xs"
                                        onClick={() => playerRef.current?.previous()}
                                        disabled={position.talk <= 0}
                                    />
                                    <IconButton
                                        icon={playing ? mdPauseFill : mdPlayArrowFill}
                                        label={playing ? t("page.story.reader.pause") : t("page.story.reader.play")}
                                        variant="filled"
                                        size="xs"
                                        onClick={togglePlay}
                                    />
                                    <IconButton
                                        icon={mdSkipNext}
                                        label={t("page.story.live2d.nextTalk")}
                                        size="xs"
                                        onClick={() => playerRef.current?.next()}
                                        disabled={position.talk >= position.talks}
                                    />
                                </div>
                                <div className="min-w-16 flex-1">
                                    <span className="block truncate type-label-m text-on-surface">
                                        {t("page.story.live2d.position", { current: Math.min(position.talk + 1, position.talks), total: position.talks })}
                                    </span>
                                    {hint && <span className="block truncate type-label-s text-primary">{hint}</span>}
                                </div>
                                <Switch checked={auto} onCheckedChange={changeAuto} label={t("page.story.live2d.auto")} icons={false} />
                                <div className="flex items-center">
                                    <IconButton
                                        icon={volume === 0 ? mdVolumeOff : mdVolumeUp}
                                        label={volume === 0 ? t("page.story.live2d.unmute") : t("page.story.live2d.mute")}
                                        size="xs"
                                        onClick={() => changeVolume(volume === 0 ? lastVolumeRef.current : 0)}
                                    />
                                    {/* a narrow window has the button alone */}
                                    <div className="hidden w-20 @md:block">
                                        <Slider value={volume} onValueChange={changeVolume} min={0} max={100} step={5} aria-label={t("page.story.live2d.volume")} />
                                    </div>
                                </div>
                                {extraControls}
                            </>
                        )}
                        {phase === "loading" && (
                            <Button variant="text" size="xs" onClick={close} className="ml-auto">{t("common.action.cancel")}</Button>
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
                </div>,
                document.body,
            )}

            <Live2DPlayerSettings
                isOpen={settingsOpen && phase === "ready"}
                onClose={() => setSettingsOpen(false)}
                settings={settings}
                onChange={changeSettings}
            />
        </>
    );
}

export default Live2DStoryPlayer;
