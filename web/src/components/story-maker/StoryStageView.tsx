"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode, RefObject } from "react";
import { Button, Icon, LoadingIndicator, cn } from "@/components/md3";
import { mdErrorFill, mdInfo, mdRefresh, mdWarningFill } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl, type AssetLine } from "@/lib/assets";
import { md3EasingStandard } from "@/lib/motion";
import { storyBackgroundUrl } from "@/lib/storyMaker/assets";
import type { StoryStageState } from "@/lib/storyMaker/state";
import type { StoryUiKit } from "@/lib/storyMaker/uiKit";
import type { StoryDocument, StoryEffectColor, StoryStepOf } from "@/types/storyMaker";
import { GameStageOverlay } from "./GameStageOverlay";
import type { StoryActorProblem, StoryStagePhase } from "./useStoryStage";

/** Screen colours of fades and flashes: the game's, not theme roles. */
export const SCREEN_COLORS: Record<StoryEffectColor, string> = { black: "#000", white: "#fff" };

export interface StoryStageStatusProps {
    phase: StoryStagePhase;
    problems: Record<string, StoryActorProblem>;
    loadingActors: number;
    onRetry: () => void;
}

interface StoryStageViewProps extends StoryStageStatusProps {
    doc: StoryDocument;
    state: StoryStageState;
    line: AssetLine;
    hostRef: RefObject<HTMLDivElement | null>;
    /** Loaded in-game UI kit sprites (null while loading or when using CSS/SVG fallback). */
    uiKit?: StoryUiKit | null;
    /** Hides the scenario UI overlay (used by the player's Hide UI mode). */
    uiHidden?: boolean;
    /** The dialogue's text as typed so far (the whole line when left out). */
    dialogueText?: string;
    /** Player AUTO mode active: shows `AutoSignal` inside `TalkWindow`. */
    autoPlay?: boolean;
    /** Shows the manual mode bouncing `EndSign` indicator in `TalkWindow`. */
    showEndSign?: boolean;
    /** Choice step rendered via `AnswerChoiceDialog` (interactive in player, preview in editor). */
    choice?: StoryStepOf<"choice"> | null;
    /** Whether `AnswerChoiceDialog` buttons are clickable. */
    choiceInteractive?: boolean;
    onChoose?: (optionId: string, optionText: string) => void;
    onChoiceSound?: (url: string) => void;
    /** Renders the top-right circular `UIPartsMenuButton`. */
    showMenuButton?: boolean;
    menuOpen?: boolean;
    onMenuClick?: () => void;
    /** Animate cinemascope bars when narration appears (enabled in player mode). */
    animateCinemascope?: boolean;
    /** A flash to play (a new key plays it again). */
    flash?: { key: number; color: StoryEffectColor; seconds: number } | null;
    /** Seconds of the screen fade (fade effects, background transitions). */
    fadeSeconds?: number;
    /** Hides verbose engine details (the player shows banners elsewhere). */
    compactStatus?: boolean;
    onClick?: () => void;
    children?: ReactNode;
    className?: string;
}

const MISSING_KEYS = ["webgpu", "webgpu-adapter", "offscreen-canvas", "worker"] as const;

/** The engine's state as a small note in the stage's top-right corner, clear of the game menu button. */
function StageStatus({
    phase, problems: actorProblems, loadingActors, onRetry, doc, compact, offsetForMenu,
}: StoryStageStatusProps & { doc: StoryDocument; compact?: boolean; offsetForMenu?: boolean }) {
    const { t } = useI18n();
    const problems = Object.entries(actorProblems);
    const chip = "pointer-events-auto flex max-w-full items-center gap-2 rounded-md3-md glass px-3 py-1.5 type-label-m text-on-surface";
    const notes: ReactNode[] = [];
    if (phase.kind === "loading" || loadingActors > 0) {
        notes.push(
            <div key="loading" className={chip}>
                <LoadingIndicator size={20} />
                <span>{t(phase.kind === "loading" ? "page.storyMaker.engine.starting" : "page.storyMaker.engine.loadingModels")}</span>
            </div>,
        );
    } else if (phase.kind === "unavailable") {
        notes.push(
            <div key="unavailable" className={chip} title={t("page.storyMaker.engine.unavailableDescription")}>
                <Icon path={mdInfo} size={18} className="shrink-0 text-on-surface-variant" />
                <span className="truncate">{t("page.storyMaker.engine.unavailable")}</span>
            </div>,
        );
    } else if (phase.kind === "unsupported") {
        const missing = phase.missing.filter(item => (MISSING_KEYS as readonly string[]).includes(item));
        notes.push(
            <div key="unsupported" className={chip}>
                <Icon path={mdWarningFill} size={18} className="shrink-0 text-error" />
                <span className="min-w-0">
                    <span className="block">{t("page.storyMaker.engine.unsupported")}</span>
                    {!compact && missing.map(item => (
                        <span key={item} className="block type-label-s text-on-surface-variant">{t(`page.storyMaker.engine.missing.${item}`)}</span>
                    ))}
                </span>
            </div>,
        );
    } else if (phase.kind === "failed") {
        notes.push(
            <div key="failed" className={chip}>
                <Icon path={mdErrorFill} size={18} className="shrink-0 text-error" />
                <span className="min-w-0 truncate" title={phase.url ?? phase.message}>{t("page.storyMaker.engine.failed")}</span>
                <Button size="xs" variant="text" icon={mdRefresh} onClick={(event) => { event.stopPropagation(); onRetry(); }}>
                    {t("common.action.retry")}
                </Button>
            </div>,
        );
    }
    if (problems.length > 0 && !compact) {
        notes.push(
            <div key="problems" className={chip}>
                <Icon path={mdWarningFill} size={18} className="shrink-0 text-error" />
                <span className="min-w-0">
                    {problems.map(([key, problem]) => (
                        <span key={key} className="block truncate">
                            {t(`page.storyMaker.engine.actor.${problem}`, { name: doc.cast.find(member => member.key === key)?.name || key })}
                        </span>
                    ))}
                </span>
            </div>,
        );
    }
    if (notes.length === 0) return null;
    return (
        <div
            className={cn(
                "pointer-events-none absolute top-2 z-30 flex max-w-[65%] flex-col items-end gap-1.5",
                offsetForMenu ? "right-[7.5%]" : "right-2",
            )}
        >
            {notes}
        </div>
    );
}

/**
 * The story's 16:9 stage: background under the WebGPU Live2D canvas, optional portrait stand-ins
 * only when the Live2D stage is unavailable/unsupported/failed, screen fade cover, the pixel-exact
 * 1920x1080 `GameStageOverlay` scenario UI, and transient screen flashes.
 */
export function StoryStageView({
    doc, state, line, hostRef, phase, problems, loadingActors, onRetry,
    uiKit = null, uiHidden = false, dialogueText, autoPlay = false, showEndSign = false,
    choice = null, choiceInteractive = false, onChoose, onChoiceSound,
    showMenuButton = false, menuOpen = false, onMenuClick, animateCinemascope = false,
    flash, fadeSeconds = 0.5, compactStatus, onClick, children, className,
}: StoryStageViewProps) {
    const reduced = useReducedMotion();
    const background = state.background ? storyBackgroundUrl(state.background, doc.region, line) : null;
    const showPortraitFallback = phase.kind === "unavailable" || phase.kind === "unsupported" || phase.kind === "failed";
    const fade = reduced ? 0 : fadeSeconds;

    return (
        <div
            className={cn("@container relative aspect-video w-full select-none overflow-hidden rounded-md3-lg bg-scrim", className)}
            onClick={onClick}
        >
            {/* Layer 0: Background */}
            <AnimatePresence initial={false}>
                {background && (
                    <motion.img
                        key={background}
                        src={background}
                        alt=""
                        draggable={false}
                        className="absolute inset-0 z-0 size-full object-cover"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: fade }}
                    />
                )}
            </AnimatePresence>

            {/* Layer 1: WebGPU Live2D Stage canvas host */}
            <div ref={hostRef} className="absolute inset-0 z-[1]" />

            {/* Layer 2: Upper-body stand slot portraits ONLY when WebGPU stage cannot run */}
            {showPortraitFallback && state.actors.map((actor, order) => {
                const member = doc.cast.find(item => item.key === actor.cast);
                const isSpeaking = state.speaking === actor.cast;
                const displayName = member?.name || actor.cast;
                return (
                    <div
                        key={actor.cast}
                        className="pointer-events-none absolute bottom-[27%] flex -translate-x-1/2 flex-col items-center gap-1.5 transition-[left,transform] duration-500 ease-md3-standard"
                        style={{ left: `${50 + actor.x * 50}%`, zIndex: 2 + order }}
                    >
                        <div
                            className={cn(
                                "relative overflow-hidden rounded-md3-xl bg-surface-container/90 p-[0.6cqw] shadow-elev-2 transition-transform duration-200",
                                isSpeaking ? "scale-105 ring-2 ring-primary" : "ring-1 ring-outline-variant/60",
                            )}
                        >
                            {member?.characterId ? (
                                <img
                                    src={getCharacterIconUrl(member.characterId)}
                                    alt=""
                                    draggable={false}
                                    className={cn(
                                        "size-[13cqw] rounded-md3-lg object-cover object-top",
                                        actor.mirror && "-scale-x-100",
                                    )}
                                />
                            ) : (
                                <span className="flex size-[13cqw] items-center justify-center rounded-md3-lg bg-secondary-container type-title-m text-on-secondary-container">
                                    {displayName.slice(0, 1)}
                                </span>
                            )}
                        </div>
                        <span className="max-w-[18cqw] truncate rounded-md3-sm bg-surface-container-high/92 px-2 py-0.5 type-label-s text-on-surface shadow-elev-1">
                            {displayName}
                        </span>
                    </div>
                );
            })}

            {/* Layer 3: Scene ColorFader (sits over background & characters, under scenario UI) */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[8] transition-opacity"
                style={{
                    backgroundColor: SCREEN_COLORS[state.screen.color],
                    opacity: state.screen.covered ? 1 : 0,
                    transitionDuration: `${fade}s`,
                }}
            />

            {/* Layer 4: 1920x1080 virtual in-game scenario UI overlay */}
            {!uiHidden && (
                <GameStageOverlay
                    state={state}
                    kit={uiKit}
                    dialogueText={dialogueText}
                    autoPlay={autoPlay}
                    showEndSign={showEndSign}
                    choice={choice}
                    choiceInteractive={choiceInteractive}
                    onChoose={onChoose}
                    onChoiceSound={onChoiceSound}
                    showMenuButton={showMenuButton}
                    menuOpen={menuOpen}
                    onMenuClick={onMenuClick}
                    animateCinemascope={animateCinemascope}
                />
            )}

            {/* Layer 5: Transient full-screen flash */}
            <AnimatePresence>
                {flash && !reduced && (
                    <motion.div
                        key={flash.key}
                        aria-hidden
                        className="pointer-events-none absolute inset-0 z-20"
                        style={{ backgroundColor: SCREEN_COLORS[flash.color] }}
                        initial={{ opacity: 0.9 }}
                        animate={{ opacity: 0 }}
                        transition={{ duration: Math.max(0.15, flash.seconds), ease: [...md3EasingStandard] }}
                    />
                )}
            </AnimatePresence>

            {/* Layer 6: Engine status notes */}
            <StageStatus
                phase={phase}
                problems={problems}
                loadingActors={loadingActors}
                onRetry={onRetry}
                doc={doc}
                compact={compactStatus}
                offsetForMenu={!uiHidden && showMenuButton}
            />

            {children}
        </div>
    );
}
