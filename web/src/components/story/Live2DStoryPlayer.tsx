"use client";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Banner, Button, CircularProgress, Icon, IconButton, LinearProgress, Slider, Surface, Switch, cn } from "@/components/md3";
import {
    mdClose, mdFullscreen, mdFullscreenExit, mdPauseFill, mdPlayArrowFill, mdSkipNext, mdSkipPrevious,
    mdSmartDisplay, mdVolumeOff, mdVolumeUp,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { sseWebCoreUrl, sseWebEnabled, sseWebSources } from "@/lib/sseWeb/config";
import {
    loadSsePlayer, sseWebScriptBase,
    type SsePlayer, type SsePlayerError, type SsePlayerErrorKind, type SsePlayerMissing, type SsePlayerUnsupported,
} from "@/lib/sseWeb/player";

export interface Live2DStoryPlayerHandle {
    /** Continues from the start of talk `talk` (0-based), when the player is loaded. */
    seek(talk: number): void;
}

interface Live2DStoryPlayerProps {
    /** The episode in the story library, e.g. `event:219/1`. */
    selector: string;
    /** The player is loaded (true) or was closed (false). */
    onActiveChange?: (active: boolean) => void;
    /** Playback is in talk `talk` of `talks` (0-based; `talks` after the last one). */
    onTalk?: (talk: number, talks: number) => void;
    /** Controls of the page that belong with the player's own, shown while it plays. */
    extraControls?: React.ReactNode;
    ref?: React.Ref<Live2DStoryPlayerHandle>;
}

/** The player's element: it stays in view while it plays, and the page scrolls its list below it. */
export const LIVE2D_STORY_PLAYER_ID = "story-live2d-player";

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

/**
 * The size to render at: the stage's shown size times the device pixel ratio
 * at exactly 16:9 (the player lays its UI out by the aspect ratio), or the
 * screen's in full screen, where a touch device is capped at 1920 on its long
 * side.
 */
function renderSize(stage: HTMLElement): [number, number] {
    const dpr = window.devicePixelRatio || 1;
    if (document.fullscreenElement === stage) {
        let [w, h] = [window.screen.width * dpr, window.screen.height * dpr];
        const cap = window.matchMedia("(pointer: coarse)").matches ? 1920 / Math.max(w, h) : 1;
        if (cap < 1) [w, h] = [w * cap, h * cap];
        return [Math.round(w), Math.round(h)];
    }
    const w = Math.max(16, Math.floor(stage.clientWidth * dpr / 16) * 16);
    return [w, w * 9 / 16];
}

/**
 * The Live2D mode of the story reader: plays the episode as the game does,
 * rendered in the browser by sse-web. Nothing is downloaded until the reader
 * asks for it. Renders nothing when no release is configured.
 */
export function Live2DStoryPlayer({ selector, onActiveChange, onTalk, extraControls, ref }: Live2DStoryPlayerProps) {
    const { t } = useI18n();
    const stageRef = useRef<HTMLDivElement | null>(null);
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

    const release = useCallback(() => {
        epochRef.current++;
        playerRef.current?.destroy();
        playerRef.current = null;
        // the canvas went to the player's worker for good: the next player gets a new one
        stageRef.current?.querySelector("canvas")?.remove();
    }, []);

    const close = useCallback(() => {
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

    const start = useCallback(async () => {
        const stage = stageRef.current;
        const core = sseWebCoreUrl();
        if (!stage || !core) return;
        release();
        const epoch = epochRef.current;
        setFailure(null);
        setProgress({ fraction: undefined, megabytes: 0 });
        setPhase("loading");
        try {
            const SsePlayerClass = await loadSsePlayer();
            if (epoch !== epochRef.current) return;
            const canvas = document.createElement("canvas");
            const [width, height] = renderSize(stage);
            canvas.width = width;
            canvas.height = height;
            canvas.className = "block h-full w-full object-contain";
            stage.prepend(canvas);
            const player = await SsePlayerClass.create({
                canvas,
                js: sseWebScriptBase(),
                pkg: "pkg/",
                core,
                sources: sseWebSources(),
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
    }, [fail, release, selector, t]);

    // The player's events, and its position a few times a second (waiting for a click or an
    // answer has no event of its own).
    useEffect(() => {
        const player = playerRef.current;
        if (phase !== "ready" || !player) return;
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        const onStall = () => {
            clearTimeout(stallTimer);
            stallTimer = setTimeout(() => setBuffering(true), BUFFERING_AFTER_MS);
        };
        const onResume = () => {
            clearTimeout(stallTimer);
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

    // The render size follows the stage: its width in the page, the screen in full screen.
    useEffect(() => {
        const stage = stageRef.current;
        if (phase !== "ready" || !stage) return;
        let pending: ReturnType<typeof setTimeout> | undefined;
        const follow = () => {
            clearTimeout(pending);
            pending = setTimeout(() => {
                const [width, height] = renderSize(stage);
                playerRef.current?.resize(width, height);
            }, 200);
        };
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
    }, [phase]);

    // Leaving the page, or another episode in the same reader, ends the player.
    useEffect(() => release, [release, selector]);

    useImperativeHandle(ref, () => ({
        seek(talk: number) {
            playerRef.current?.seek(talk);
        },
    }), []);

    if (!sseWebEnabled()) return null;

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
        setVolume(next);
        playerRef.current?.setVolume(next / 100);
    };

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
    const shown = phase === "loading" || phase === "ready";

    return (
        <Surface
            id={LIVE2D_STORY_PLAYER_ID}
            tone="default"
            radius="xl"
            elevation={shown ? 2 : 0}
            // below the site's header while it plays, so the list can be read along with the picture
            className={cn("z-10 mb-6 overflow-hidden", shown ? "sticky top-[4.5rem] z-20" : "relative")}
        >
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

            {/* The stage stays mounted while a player exists: its canvas belongs to the player. */}
            <div className={cn(!shown && "hidden")}>
                <div
                    ref={stageRef}
                    onClick={onStageClick}
                    className={cn(
                        "relative aspect-video w-full select-none bg-scrim",
                        phase === "ready" && "cursor-pointer",
                        fullscreen && "aspect-auto",
                    )}
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
                            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-on-primary">
                                <Icon path={mdPlayArrowFill} size={36} />
                            </span>
                        </div>
                    )}
                    {phase === "ready" && buffering && (
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-scrim/40 text-primary-fixed">
                            <CircularProgress aria-label={t("page.story.live2d.buffering")} />
                            <p className="type-label-l">{t("page.story.live2d.buffering")}</p>
                        </div>
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

                {phase === "loading" && (
                    <div className="flex justify-end px-3 py-2">
                        <Button variant="text" size="xs" onClick={close}>{t("common.action.cancel")}</Button>
                    </div>
                )}

                {phase === "ready" && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                        <div className="flex items-center gap-1">
                            <IconButton
                                icon={mdSkipPrevious}
                                label={t("page.story.live2d.previousTalk")}
                                onClick={() => playerRef.current?.previous()}
                                disabled={position.talk <= 0}
                            />
                            <IconButton
                                icon={playing ? mdPauseFill : mdPlayArrowFill}
                                label={playing ? t("page.story.reader.pause") : t("page.story.reader.play")}
                                variant="filled"
                                onClick={togglePlay}
                            />
                            <IconButton
                                icon={mdSkipNext}
                                label={t("page.story.live2d.nextTalk")}
                                onClick={() => playerRef.current?.next()}
                                disabled={position.talk >= position.talks}
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <span className="block truncate type-label-m text-on-surface">
                                {t("page.story.live2d.position", { current: Math.min(position.talk + 1, position.talks), total: position.talks })}
                            </span>
                            {hint && <span className="block truncate type-label-s text-primary">{hint}</span>}
                        </div>
                        <Switch checked={auto} onCheckedChange={changeAuto} label={t("page.story.live2d.auto")} icons={false} />
                        <div className="flex w-36 items-center gap-2">
                            <Icon path={volume === 0 ? mdVolumeOff : mdVolumeUp} size={20} className="shrink-0 text-on-surface-variant" />
                            <Slider value={volume} onValueChange={changeVolume} min={0} max={100} step={5} aria-label={t("page.story.live2d.volume")} />
                        </div>
                        {extraControls}
                        <IconButton icon={mdFullscreen} label={t("page.story.live2d.fullscreen")} onClick={toggleFullscreen} />
                        <IconButton icon={mdClose} label={t("page.story.live2d.close")} onClick={close} />
                    </div>
                )}

                {phase === "ready" && (
                    <p className="px-4 pb-3 type-body-s text-on-surface-variant">
                        {t("page.story.live2d.originalTextNote")}
                        {notPlayed.length > 0 && ` ${t("page.story.live2d.notPlayed", {
                            items: [...new Set(notPlayed.map(item => t(NOT_PLAYED_KEY[item.reason])))].join(t("page.story.live2d.listSeparator")),
                        })}`}
                    </p>
                )}
            </div>
        </Surface>
    );
}

export default Live2DStoryPlayer;
