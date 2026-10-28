"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getServerDisplayCode } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { ServerType } from "@/lib/account-servers";
import { sseWebCoreUrl, sseWebFonts, sseWebSources, type SseWebFontFile } from "@/lib/sseWeb/config";
import {
    loadSsePlayer, sseWebScriptBase,
    type SsePlayer, type SsePlayerError, type SsePlayerNode, type SsePlayerErrorKind, type SsePlayerMissing, type SsePlayerUnsupported,
} from "@/lib/sseWeb/player";
import {
    SSE_WEB_DEFAULT_SETTINGS, SSE_WEB_NO_ANTIALIASING, loadSseWebSettings, sseWebAspectRatio, sseWebRenderSize,
    storeSseWebSettings,
    type SseWebAntialiasing, type SseWebSettings,
} from "@/lib/sseWeb/settings";

export type Live2DPhase = "idle" | "loading" | "ready" | "failed";

export interface Live2DFailure {
    kind: SsePlayerErrorKind;
    message: string;
    missing: SsePlayerMissing[];
}

/** Where playback is: node `node` of `nodes` (0-based; `nodes` after the last one). */
export interface Live2DPosition {
    node: number;
    nodes: number;
    waitsForClick: boolean;
    waitsForAnswer: boolean;
    ended: boolean;
}

// a type, not an interface: it is handed to `t` as the message's values
export type Live2DStats = {
    width: number;
    height: number;
    fps: number;
    skipped: number;
    megabytes: number;
};

export interface Live2DStartOptions {
    /**
     * The width the picture will be shown at, in CSS pixels, for the settings the player starts
     * with; the stage's own width when not given. The player's window is not laid out yet when
     * it starts, and places itself here.
     */
    shownWidth?: (settings: SseWebSettings) => number;
    /** Plays as soon as the episode is loaded (the reader chose it a moment ago). */
    play?: boolean;
}

interface UseLive2DPlayerOptions {
    /** The episode in the story library, e.g. `event:219/1`, or null when there is none to play. */
    selector: string | null;
    /** The game server whose library the episode is read from. */
    region: string;
    /** The player is loaded (true) or was closed (false). */
    onActiveChange?: (active: boolean) => void;
    /**
     * Playback is in node `node` of `nodes` (0-based; `nodes.length` after the last one). The
     * nodes are what a tap acts on: talks, telops, full-screen texts and choices.
     */
    onNode?: (node: number, nodes: readonly SsePlayerNode[]) => void;
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
/** In full screen the pointer hides this long after it last moved; a touch's toolbar leaves as long after. */
const TOOLBAR_IDLE_MS = 3000;
/**
 * In full screen the toolbar shows only while the pointer is this close to the stage's bottom: the
 * toolbar's own 88px (64px high, 24px above the edge) and some room above it. Anywhere else it
 * would cover the talk window's text.
 */
const TOOLBAR_ZONE_PX = 112;

/**
 * Closes the player that is loading or playing now, for the next one to take its place: one
 * plays at a time on the whole site (each holds an episode's files and models in memory).
 */
let closeCurrent: (() => void) | null = null;

/** A font file with its address as a whole URL (the repository's own fonts are named by path). */
function absolute(font: SseWebFontFile): SseWebFontFile {
    return { ...font, url: new URL(font.url, window.location.origin).href };
}

/**
 * An sse-web player and what is shown about it: loading, playing, its position, failures and
 * the reader's settings. The picture is drawn in the element `stageRef` is given (see `Live2DStage`);
 * nothing is downloaded until `start` is called. Leaving the page, or another episode or
 * server, ends the player.
 */
export function useLive2DPlayer({ selector, region, onActiveChange, onNode }: UseLive2DPlayerOptions) {
    const { t } = useI18n();
    // the anti-aliasing chosen in the player's settings holds only while the experimental setting
    // offers it
    const { storyLive2dAntialiasing, storyLive2dHighFps } = useTheme();
    const antialiasingOfferedRef = useRef(storyLive2dAntialiasing);
    antialiasingOfferedRef.current = storyLive2dAntialiasing;
    // the player takes the high frame rate when it is made: a change holds from the next episode loaded
    const highFpsRef = useRef(storyLive2dHighFps);
    highFpsRef.current = storyLive2dHighFps;
    /** What the player was last told to anti-alias with. */
    const appliedAntialiasingRef = useRef<SseWebAntialiasing>(SSE_WEB_NO_ANTIALIASING);
    const sources = sseWebSources(region);
    const fonts = sseWebFonts(region);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const lastVolumeRef = useRef(80);
    const playerRef = useRef<SsePlayer | null>(null);
    /** Counts starts and closes: a load that finishes after it was superseded is thrown away. */
    const epochRef = useRef(0);
    const callbacks = useRef({ onActiveChange, onNode });
    useEffect(() => { callbacks.current = { onActiveChange, onNode }; });

    const [phase, setPhase] = useState<Live2DPhase>("idle");
    const [progress, setProgress] = useState<{ fraction: number | undefined; megabytes: number }>({ fraction: undefined, megabytes: 0 });
    const [failure, setFailure] = useState<Live2DFailure | null>(null);
    const [playing, setPlaying] = useState(false);
    const [auto, setAuto] = useState(true);
    const [volume, setVolume] = useState(80);
    const [position, setPosition] = useState<Live2DPosition>({ node: 0, nodes: 0, waitsForClick: false, waitsForAnswer: false, ended: false });
    const [buffering, setBuffering] = useState(false);
    const [notPlayed, setNotPlayed] = useState<SsePlayerUnsupported[]>([]);
    /** The MSAA sample counts the player's device takes. */
    const [msaaSampleCounts, setMsaaSampleCounts] = useState<number[]>([4]);
    const [fullscreen, setFullscreen] = useState(false);
    /** In full screen: the pointer moved lately, so it is shown. */
    const [pointerAwake, setPointerAwake] = useState(false);
    const pointerTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    /** In full screen: the pointer is at the stage's bottom, or a touch was there lately. */
    const [pointerAtBottom, setPointerAtBottom] = useState(false);
    const touchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    /** In full screen: the keyboard went to the toolbar (Tab), so it stays while focus is in it. */
    const [toolbarFocused, setToolbarFocused] = useState(false);
    const [settings, setSettings] = useState<SseWebSettings>(SSE_WEB_DEFAULT_SETTINGS);
    const [stats, setStats] = useState<Live2DStats | null>(null);
    const ratio = sseWebAspectRatio(settings);

    const release = useCallback(() => {
        epochRef.current++;
        playerRef.current?.destroy();
        playerRef.current = null;
        // the canvas went to the player's worker for good: the next player gets a new one
        stageRef.current?.querySelector("canvas")?.remove();
    }, []);

    // what closes this player, as the site's other players know it
    const closeRef = useRef<() => void>(() => {});

    const close = useCallback(() => {
        if (closeCurrent === closeRef.current) closeCurrent = null;
        // the stage may be gone already (the page is being left): only a stage in full screen leaves it
        const stage = stageRef.current;
        release();
        if (stage && document.fullscreenElement === stage) void document.exitFullscreen().catch(() => {});
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

    const start = useCallback(async (options: Live2DStartOptions = {}) => {
        const stage = stageRef.current;
        const core = sseWebCoreUrl();
        if (!stage || !sources || !selector) return;
        if (closeCurrent && closeCurrent !== closeRef.current) closeCurrent();
        closeCurrent = closeRef.current;
        release();
        const epoch = epochRef.current;
        const chosen = loadSseWebSettings();
        const shownWidth = options.shownWidth?.(chosen) ?? stage.clientWidth;
        setSettings(chosen);
        setFailure(null);
        setProgress({ fraction: undefined, megabytes: 0 });
        setPhase("loading");
        try {
            const SsePlayerClass = await loadSsePlayer();
            if (epoch !== epochRef.current) return;
            const canvas = document.createElement("canvas");
            const [width, height] = sseWebRenderSize(chosen, shownWidth, false);
            canvas.width = width;
            canvas.height = height;
            canvas.className = "block h-full w-full object-contain";
            stage.prepend(canvas);
            const antialiasing = antialiasingOfferedRef.current ? chosen.antialiasing : SSE_WEB_NO_ANTIALIASING;
            appliedAntialiasingRef.current = antialiasing;
            const player = await SsePlayerClass.create({
                canvas,
                js: sseWebScriptBase(),
                pkg: "pkg/",
                ...(core ? { core } : {}),
                sources: { library: sources.library, inapp: sources.inapp, ...(sources.proxy ? { proxy: sources.proxy } : {}) },
                // the workers fetch the fonts: a path of this origin has to be a whole URL for them
                ...(fonts ? { fonts: { body: fonts.body.map(absolute), name: fonts.name.map(absolute) } } : {}),
                selector,
                width,
                height,
                playerName: t("page.story.live2d.playerName"),
                auto: true,
                experimentalAntialiasing: antialiasing,
                highFps: highFpsRef.current,
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
            setMsaaSampleCounts(player.msaaSampleCounts ?? [4]);
            setPosition({ node: player.node, nodes: player.nodes.length, waitsForClick: false, waitsForAnswer: false, ended: false });
            setPhase("ready");
            callbacks.current.onActiveChange?.(true);
            callbacks.current.onNode?.(player.node, player.nodes);
            if (options.play) {
                void player.play();
                setPlaying(true);
            } else {
                setPlaying(false);
            }
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
        const onNodeEvent = () => callbacks.current.onNode?.(player.node, player.nodes);
        const onEnded = () => setPlaying(false);
        const onError = (event: Event) => fail((event as CustomEvent<{ kind?: SsePlayerErrorKind; message?: string }>).detail ?? {});
        player.addEventListener("stall", onStall);
        player.addEventListener("resume", onResume);
        player.addEventListener("node", onNodeEvent);
        player.addEventListener("ended", onEnded);
        player.addEventListener("error", onError);
        const poll = setInterval(() => {
            const p = player.position;
            setPosition(previous => (
                previous.node === p.node && previous.nodes === p.nodes && previous.waitsForClick === !!p.waitsForClick
                    && previous.waitsForAnswer === !!p.waitsForAnswer && previous.ended === p.ended
                    ? previous
                    : { node: p.node, nodes: p.nodes, waitsForClick: !!p.waitsForClick, waitsForAnswer: !!p.waitsForAnswer, ended: p.ended }
            ));
        }, 250);
        return () => {
            clearTimeout(stallTimer);
            clearInterval(poll);
            player.removeEventListener("stall", onStall);
            player.removeEventListener("resume", onResume);
            player.removeEventListener("node", onNodeEvent);
            player.removeEventListener("ended", onEnded);
            player.removeEventListener("error", onError);
        };
    }, [phase, fail]);

    // The render size follows the stage (its width, the screen in full screen) and what the
    // reader chose.
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
            // a full screen starts with the toolbar down, wherever the pointer was before
            setPointerAtBottom(false);
            setToolbarFocused(false);
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

    // The anti-aliasing follows the reader's choice and the experimental setting that offers it.
    const chosenAntialiasing = storyLive2dAntialiasing ? settings.antialiasing : SSE_WEB_NO_ANTIALIASING;
    const { method, ssaaFactor } = chosenAntialiasing;
    // a count this device does not take (kept from elsewhere) falls back to the one every device takes
    const msaaSamples = msaaSampleCounts.includes(chosenAntialiasing.msaaSamples) ? chosenAntialiasing.msaaSamples : 4;
    useEffect(() => {
        const player = playerRef.current;
        if (phase !== "ready" || !player) return;
        const applied = appliedAntialiasingRef.current;
        if (applied.method === method && applied.msaaSamples === msaaSamples && applied.ssaaFactor === ssaaFactor) return;
        appliedAntialiasingRef.current = { method, msaaSamples, ssaaFactor };
        // a release from before the setting has no such method
        if (typeof player.setExperimentalAntialiasing === "function") player.setExperimentalAntialiasing({ method, msaaSamples, ssaaFactor });
    }, [phase, method, msaaSamples, ssaaFactor]);

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

    useEffect(() => () => {
        clearTimeout(pointerTimerRef.current);
        clearTimeout(touchTimerRef.current);
    }, []);

    // Leaving the page, or another episode or server in the same reader, ends the player.
    useEffect(() => () => close(), [close, selector, region]);

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

    /** A click on the picture: plays a paused story, else is a tap on the story screen. */
    const onStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const player = playerRef.current;
        const canvas = stageRef.current?.querySelector("canvas");
        if (!player || !canvas || (event.target as HTMLElement).closest("button, [data-player-toolbar]")) return;
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

    /**
     * In full screen: follows the pointer over the stage. The pointer shows while it moves; the
     * toolbar only while the pointer is at the stage's bottom (a touch there shows it for a while,
     * a touch has no hover).
     */
    const followPointer = (event: React.PointerEvent<HTMLElement>) => {
        if (!fullscreen) return;
        setPointerAwake(true);
        clearTimeout(pointerTimerRef.current);
        pointerTimerRef.current = setTimeout(() => setPointerAwake(false), TOOLBAR_IDLE_MS);
        const atBottom = event.currentTarget.getBoundingClientRect().bottom - event.clientY <= TOOLBAR_ZONE_PX;
        if (event.pointerType === "mouse" || event.pointerType === "pen") {
            setPointerAtBottom(atBottom);
        } else if (event.type === "pointerdown" && atBottom) {
            setPointerAtBottom(true);
            clearTimeout(touchTimerRef.current);
            touchTimerRef.current = setTimeout(() => setPointerAtBottom(false), TOOLBAR_IDLE_MS);
        }
    };
    const leavePointer = (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse" || event.pointerType === "pen") setPointerAtBottom(false);
    };
    /** In full screen: Tab brings the toolbar up for the keyboard to reach it. */
    const onStageKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (fullscreen && event.key === "Tab") setToolbarFocused(true);
    };
    /** Focus left the toolbar (not for one of its own buttons): it goes with the pointer again. */
    const onToolbarBlur = (event: React.FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToolbarFocused(false);
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

    const toggleMute = () => changeVolume(volume === 0 ? lastVolumeRef.current : 0);

    const changeSettings = (next: SseWebSettings) => {
        setSettings(next);
        storeSseWebSettings(next);
    };

    /** Continues from the start of node `node` (0-based), when the player is loaded. */
    const seek = useCallback((node: number) => {
        playerRef.current?.seek(node);
    }, []);

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
    const hint = position.waitsForAnswer
        ? t("page.story.live2d.chooseAnswer")
        : position.waitsForClick
            ? t("page.story.live2d.clickToContinue")
            : position.ended
                ? t("page.story.live2d.ended")
                : null;
    // what the reader should know about the picture while it plays, a line each
    const notes = phase !== "ready" || !sources ? [] : [
        t("page.story.live2d.originalTextNote", { server: getServerDisplayCode(region as ServerType) }),
        sources.borrowedUi && t("page.story.live2d.borrowedUiNote"),
        fonts !== null && t("page.story.live2d.substituteFontNote"),
        notPlayed.length > 0 && t("page.story.live2d.notPlayed", {
            items: [...new Set(notPlayed.map(item => t(NOT_PLAYED_KEY[item.reason])))].join(t("page.story.live2d.listSeparator")),
        }),
    ].filter((line): line is string => typeof line === "string");

    const player = {
        /** The server has a client unpack to play with: without one there is no Live2D playback. */
        available: sources !== null,
        phase,
        /** Loading or playing: the picture is there. */
        shown: phase === "loading" || phase === "ready",
        progress,
        failure,
        failureTitle,
        failureDetail,
        canRetry: failure?.kind === "network" || failure?.kind === "internal",
        playing,
        auto,
        volume,
        position,
        /** The node shown as "talk n of m" (1-based). */
        shownNode: Math.min(position.node + 1, position.nodes),
        hint,
        buffering,
        notes,
        fullscreen,
        // In full screen the toolbar floats over the picture's bottom, where the talk window's text
        // is: it shows only while the pointer is down there (or the keyboard is in it), whether
        // the story plays, is paused or waits for its reader.
        toolbarShown: fullscreen && (pointerAtBottom || toolbarFocused),
        /** In full screen: the pointer is shown (it moved lately, or the toolbar is up). */
        pointerShown: fullscreen && (pointerAwake || pointerAtBottom || toolbarFocused),
        settings,
        msaaSampleCounts,
        ratio,
        stats,
        start,
        close,
        togglePlay,
        previous: () => playerRef.current?.previous(),
        next: () => playerRef.current?.next(),
        seek,
        onStageClick,
        toggleFullscreen,
        followPointer,
        leavePointer,
        onStageKeyDown,
        onToolbarBlur,
        changeAuto,
        changeVolume,
        toggleMute,
        changeSettings,
    };
    // the stage's ref apart from what is shown: an object holding a ref cannot be read while rendering
    return { stageRef, player };
}

export type Live2DPlayerState = ReturnType<typeof useLive2DPlayer>["player"];
