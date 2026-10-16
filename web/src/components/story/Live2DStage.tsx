"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Banner, Button, ButtonGroup, Icon, IconButton, LinearProgress, LoadingIndicator, Slider, cn } from "@/components/md3";
import { mdFullscreenExit, mdPauseFill, mdPlayArrowFill, mdSkipNext, mdSkipPrevious, mdVolumeOff, mdVolumeUp } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { md3EffectsFast, md3SpatialDefault, reducedMotionFade } from "@/lib/motion";
import type { Live2DPlayerState } from "./useLive2DPlayer";

/** The StarMoe wordmark as a mask, to be filled with the element's background colour. */
const STARMOE_MARK = {
    maskImage: "url(/starmoe.svg)",
    maskSize: "contain",
    maskPosition: "center",
    maskRepeat: "no-repeat",
    WebkitMaskImage: "url(/starmoe.svg)",
    WebkitMaskSize: "contain",
    WebkitMaskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
} as const;

/**
 * The square Live2D logo for dark grounds, as Live2D Inc. publishes it (live2d.jp/en/brand): it
 * may not be recoloured, cropped, given effects or set on a ground that hides it.
 */
const LIVE2D_LOGO = "/images/brand/live2d-logo-square-word-white.png";

interface Live2DControlsProps {
    player: Live2DPlayerState;
    /** The toolbar of a full screen, which also leaves it. */
    floating: boolean;
    /** Controls of the page that belong with the player's own (not in full screen). */
    extra?: React.ReactNode;
}

/**
 * The player's controls, as Material's toolbar: the transport is a button group whose main
 * action is the wide filled one, and what follows are toggles. Their container is a
 * `@container`: a narrow one has the volume's button alone.
 */
export function Live2DControls({ player, floating, extra }: Live2DControlsProps) {
    const { t } = useI18n();
    const { position, playing, auto, volume } = player;
    return (
        <>
            <ButtonGroup>
                <IconButton
                    icon={mdSkipPrevious}
                    label={t("page.story.live2d.previousTalk")}
                    variant="tonal"
                    width="narrow"
                    onClick={player.previous}
                    disabled={position.node <= 0}
                />
                <IconButton
                    icon={playing ? mdPauseFill : mdPlayArrowFill}
                    label={playing ? t("page.story.reader.pause") : t("page.story.reader.play")}
                    variant="filled"
                    width="wide"
                    // the main action changes shape with its state, as an Expressive toggle does
                    shape={playing ? "square" : "round"}
                    onClick={player.togglePlay}
                />
                <IconButton
                    icon={mdSkipNext}
                    label={t("page.story.live2d.nextTalk")}
                    variant="tonal"
                    width="narrow"
                    onClick={player.next}
                    disabled={position.node >= position.nodes}
                />
            </ButtonGroup>
            {/* the position is never cut short: a narrow window wraps what follows it instead */}
            <div className={cn("px-1", floating ? "shrink-0" : "min-w-max flex-1")}>
                <span className="block whitespace-nowrap type-label-l tabular-nums text-on-surface">
                    {t("page.story.live2d.position", { current: player.shownNode, total: position.nodes })}
                </span>
                {/* the hint takes the width the position has: it is cut short and does not wrap the toolbar */}
                {player.hint && <span className="block w-0 min-w-full truncate type-label-s text-primary">{player.hint}</span>}
            </div>
            <Button variant="tonal" size="xs" selected={auto} onClick={() => player.changeAuto(!auto)} className="shrink-0">
                {t("page.story.live2d.auto")}
            </Button>
            <div className="flex shrink-0 items-center">
                <IconButton
                    icon={volume === 0 ? mdVolumeOff : mdVolumeUp}
                    label={volume === 0 ? t("page.story.live2d.unmute") : t("page.story.live2d.mute")}
                    selected={volume === 0}
                    onClick={player.toggleMute}
                />
                {/* a narrow window has the button alone */}
                <div className={cn("w-20", floating ? "hidden sm:block" : "hidden @min-[500px]:block")}>
                    <Slider value={volume} onValueChange={player.changeVolume} min={0} max={100} step={5} aria-label={t("page.story.live2d.volume")} />
                </div>
            </div>
            {floating
                ? <IconButton icon={mdFullscreenExit} label={t("page.story.live2d.exitFullscreen")} onClick={player.toggleFullscreen} />
                : extra}
        </>
    );
}

interface Live2DStageProps {
    player: Live2DPlayerState;
    /** `useLive2DPlayer`'s stage ref: the canvas goes in this element. */
    stageRef: React.Ref<HTMLDivElement>;
    className?: string;
    style?: React.CSSProperties;
    /** What lies over the stage besides the player's own marks (a prompt before it loads, the end of an episode). */
    children?: React.ReactNode;
}

/**
 * Where the player draws: the canvas goes in here when it starts. Over the picture lie the
 * marks of who made it, the loading card, the paused and buffering marks, the statistics
 * and, in full screen (only the stage goes full screen), the floating toolbar.
 */
export function Live2DStage({ player, stageRef, className, style, children }: Live2DStageProps) {
    const { t } = useI18n();
    const reducedMotion = useReducedMotion();
    const { phase, progress, playing, position, buffering, stats, fullscreen, toolbarShown, shown, onStageClick, wakeToolbar } = player;
    const fade = reducedMotion ? reducedMotionFade : md3EffectsFast;

    return (
        <div
            ref={stageRef}
            onClick={onStageClick}
            onPointerMove={wakeToolbar}
            onPointerDown={wakeToolbar}
            className={cn(
                // a container of its own: what lies over the picture is sized by the picture's
                // width, in the page and in full screen alike
                "@container relative w-full select-none overflow-hidden bg-scrim",
                // in full screen the pointer rests with the toolbar (the site's themed
                // pointer outranks `cursor-none` on an element that also has a cursor class)
                fullscreen && !toolbarShown ? "cursor-none" : phase === "ready" && "cursor-pointer",
                className,
            )}
            style={style}
        >
            {/*
              * Who made this: over the picture's top left corner, while loading and while playing.
              * The mark keeps its proportion to the picture: 4% of its width high.
              */}
            {shown && (
                // the shadow keeps the white mark readable on a bright picture; it is on the
                // wrapper because a filter is applied before the element's own mask
                <span
                    role="img"
                    aria-label="StarMoe"
                    className="pointer-events-none absolute left-[3.2cqw] top-[2.4cqw] h-[4cqw] w-[14.5cqw] opacity-90 [filter:drop-shadow(0_0_0.25cqw_rgb(0_0_0/0.7))_drop-shadow(0_0.15cqw_0.5cqw_rgb(0_0_0/0.45))]"
                >
                    <span className="block size-full bg-white" style={STARMOE_MARK} />
                </span>
            )}
            {phase === "loading" && (
                <div className="absolute inset-0 flex flex-col">
                    {/*
                      * What draws the characters, at the top right while the episode loads. It is
                      * Live2D's own file, unaltered; its clear space is part of the image, which is
                      * sized and placed so that its figure (the three bars, without the word
                      * below them) is as tall as the StarMoe mark across from it, 4% of the
                      * picture's width, level with it and as far from the corner.
                      */}
                    <div className="pointer-events-none flex shrink-0 justify-end">
                        <img
                            src={LIVE2D_LOGO}
                            alt="Live2D"
                            width={411}
                            height={411}
                            draggable={false}
                            className="mr-[1.55cqw] mt-[1.58cqw] aspect-square h-[6.45cqw] w-auto shrink-0"
                        />
                    </div>
                    <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
                        {/* in a narrow window the indicator sits beside the words, so the card clears the marks above */}
                        <div
                            className={cn(
                                "flex w-72 max-w-full items-center gap-2 rounded-md3-lg bg-surface-container-high px-4 py-2 text-center text-on-surface @min-[400px]:flex-col @min-[400px]:py-3",
                                progress.fraction !== undefined && "flex-col",
                            )}
                        >
                            {progress.fraction === undefined
                                ? <LoadingIndicator size={40} aria-label={t("page.story.live2d.preparing")} />
                                : <LinearProgress value={progress.fraction} className="mt-1" aria-label={t("page.story.live2d.title")} />}
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5 @min-[400px]:flex-none @min-[400px]:gap-2">
                                <p className="type-title-s tabular-nums">
                                    {progress.fraction === undefined
                                        ? t("page.story.live2d.preparing")
                                        : t("page.story.live2d.loading", { percent: Math.floor(progress.fraction * 100) })}
                                </p>
                                <p className="type-body-s tabular-nums text-on-surface-variant">
                                    {t("page.story.live2d.loadedSize", { size: progress.megabytes.toFixed(1) })}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <AnimatePresence>
                {phase === "ready" && !playing && !position.ended && !buffering && (
                    <motion.div
                        key="paused"
                        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-scrim/32"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={fade}
                    >
                        {/* the fixed colour roles, the same in both themes: the stage is black in either */}
                        <span className="flex aspect-square h-1/3 max-h-24 min-h-12 items-center justify-center rounded-md3-xl bg-primary-fixed text-on-primary-fixed shadow-elev-2">
                            <Icon path={mdPlayArrowFill} size={32} />
                        </span>
                    </motion.div>
                )}
                {phase === "ready" && buffering && (
                    <motion.div
                        key="buffering"
                        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-scrim/32"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={fade}
                    >
                        <LoadingIndicator contained size={56} aria-label={t("page.story.live2d.buffering")} />
                        <p className="rounded-md3-sm bg-inverse-surface px-2 py-1 type-label-m text-inverse-on-surface">
                            {t("page.story.live2d.buffering")}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
            {phase === "ready" && stats && (
                <p className="pointer-events-none absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-md3-sm bg-inverse-surface/85 px-2 py-1 type-label-s tabular-nums text-inverse-on-surface">
                    {t("page.story.live2d.settings.statsLine", stats)}
                </p>
            )}
            {children}
            {/* Full screen has the stage alone: its controls float over the picture. */}
            <AnimatePresence>
                {phase === "ready" && toolbarShown && (
                    <motion.div
                        key="toolbar"
                        data-player-toolbar
                        className="absolute inset-x-0 bottom-6 flex cursor-default justify-center px-4"
                        initial={{ opacity: 0, y: reducedMotion ? 0 : 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: reducedMotion ? 0 : 16 }}
                        transition={reducedMotion ? reducedMotionFade : { y: md3SpatialDefault, opacity: md3EffectsFast }}
                    >
                        <div
                            role="toolbar"
                            aria-label={t("page.story.live2d.controls")}
                            className="flex h-16 max-w-full items-center gap-2 rounded-full bg-surface-container px-3 text-on-surface shadow-elev-3"
                        >
                            <Live2DControls player={player} floating />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/** Why the player stopped (no WebGPU, no such episode, the network), with a retry where one can help. */
export function Live2DFailureBanner({ player, onRetry, onClose, className }: {
    player: Live2DPlayerState;
    /** Starts again; the player's own start by default. */
    onRetry?: () => void;
    onClose?: () => void;
    className?: string;
}) {
    const { t } = useI18n();
    const { failure } = player;
    if (!failure) return null;
    return (
        <Banner
            tone={failure.kind === "unsupported" || failure.kind === "not-found" ? "warning" : "error"}
            title={player.failureTitle}
            className={className}
            action={(
                <div className="flex gap-2">
                    {player.canRetry && <Button variant="tonal" size="xs" onClick={onRetry ?? (() => void player.start())}>{t("common.action.retry")}</Button>}
                    {onClose && <Button variant="text" size="xs" onClick={onClose}>{t("page.story.reader.close")}</Button>}
                </div>
            )}
        >
            <p className="break-words">{player.failureDetail}</p>
        </Banner>
    );
}
