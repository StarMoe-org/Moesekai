"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode, RefObject } from "react";
import { Button, Icon, LoadingIndicator, cn } from "@/components/md3";
import { mdErrorFill, mdInfo, mdRefresh, mdWarningFill } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl, type AssetLine } from "@/lib/assets";
import { storyBackgroundUrl } from "@/lib/storyMaker/assets";
import type { StoryStageState } from "@/lib/storyMaker/state";
import { md3EasingStandard } from "@/lib/motion";
import type { StoryDocument, StoryEffectColor } from "@/types/storyMaker";
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
    /** The dialogue's text as typed so far (the whole line when left out). */
    dialogueText?: string;
    /** A flash to play (a new key plays it again). */
    flash?: { key: number; color: StoryEffectColor; seconds: number } | null;
    /** Seconds of the screen fade (fade effects, background transitions). */
    fadeSeconds?: number;
    /** Hides the engine's status (the player shows it elsewhere). */
    compactStatus?: boolean;
    onClick?: () => void;
    children?: ReactNode;
    className?: string;
}

const MISSING_KEYS = ["webgpu", "webgpu-adapter", "offscreen-canvas", "worker"] as const;

/** The engine's state as a small note in the stage's corner. */
function StageStatus({
    phase, problems: actorProblems, loadingActors, onRetry, doc, compact,
}: StoryStageStatusProps & { doc: StoryDocument; compact?: boolean }) {
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
    return <div className="pointer-events-none absolute right-2 top-2 z-30 flex max-w-[70%] flex-col items-end gap-1.5">{notes}</div>;
}

/**
 * The story's stage, 16:9: the background drawn with CSS under the Live2D canvas, then DOM layers
 * for the place caption, the narration, the dialogue window and the screen effects. Without a
 * live stage, the actors are stood in by their icons at their slots, so the scene still reads.
 */
export function StoryStageView({
    doc, state, line, hostRef, phase, problems, loadingActors, onRetry,
    dialogueText, flash, fadeSeconds = 0.5, compactStatus, onClick, children, className,
}: StoryStageViewProps) {
    const reduced = useReducedMotion();
    const background = state.background ? storyBackgroundUrl(state.background, doc.region, line) : null;
    const live = phase.kind === "ready";
    const fade = reduced ? 0 : fadeSeconds;

    return (
        <div
            className={cn("@container relative aspect-video w-full select-none overflow-hidden rounded-md3-lg bg-surface-container-highest", className)}
            onClick={onClick}
        >
            <AnimatePresence initial={false}>
                {background && (
                    <motion.img
                        key={background}
                        src={background}
                        alt=""
                        draggable={false}
                        className="absolute inset-0 size-full object-cover"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: fade }}
                    />
                )}
            </AnimatePresence>

            <div ref={hostRef} className="absolute inset-0" />

            {!live && state.actors.map((actor, order) => {
                const member = doc.cast.find(item => item.key === actor.cast);
                return (
                    <div
                        key={actor.cast}
                        className="absolute bottom-[8%] flex -translate-x-1/2 flex-col items-center gap-1 transition-[left] duration-500 ease-md3-standard"
                        style={{ left: `${50 + actor.x * 50}%`, zIndex: 1 + order }}
                    >
                        {member?.characterId ? (
                            <img src={getCharacterIconUrl(member.characterId)} alt="" className="size-[12cqw] rounded-full bg-surface-container object-cover shadow-elev-2" />
                        ) : (
                            <span className="flex size-[12cqw] items-center justify-center rounded-full bg-secondary-container type-title-m text-on-secondary-container shadow-elev-2">
                                {(member?.name || actor.cast).slice(0, 1)}
                            </span>
                        )}
                        <span className="max-w-[18cqw] truncate rounded-md3-sm bg-surface-container-high px-1.5 type-label-s text-on-surface">{member?.name || actor.cast}</span>
                    </div>
                );
            })}

            {state.telop && (
                <div className="absolute left-[3%] top-[6%] z-10 max-w-[70%] rounded-md3-sm bg-inverse-surface px-[2cqw] py-[0.8cqw] text-inverse-on-surface shadow-elev-2" style={{ fontSize: "max(12px, 2.2cqw)" }}>
                    {state.telop.body}
                </div>
            )}

            {state.narration && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-scrim/50 p-[6%]">
                    <p className="glass-thick max-w-[80%] whitespace-pre-wrap rounded-md3-lg px-[3cqw] py-[2cqw] text-center text-on-surface" style={{ fontSize: "max(13px, 2.4cqw)" }}>
                        {state.narration.body}
                    </p>
                </div>
            )}

            {state.dialogue && (
                <div className="absolute inset-x-[3%] bottom-[3%] z-10">
                    {state.dialogue.speaker && (
                        <span className="relative z-10 ml-[2cqw] inline-block translate-y-1/3 rounded-md3-sm bg-primary-container px-[1.6cqw] py-[0.4cqw] text-on-primary-container shadow-elev-1" style={{ fontSize: "max(12px, 2cqw)" }}>
                            {state.dialogue.speaker}
                        </span>
                    )}
                    <div className="glass-thick min-h-[12cqw] rounded-md3-lg px-[2.4cqw] pb-[1.6cqw] pt-[2cqw] text-on-surface" style={{ fontSize: "max(13px, 2.3cqw)" }}>
                        <p className="whitespace-pre-wrap">{dialogueText ?? state.dialogue.body}</p>
                    </div>
                </div>
            )}

            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-20 transition-opacity"
                style={{
                    backgroundColor: SCREEN_COLORS[state.screen.color],
                    opacity: state.screen.covered ? 1 : 0,
                    transitionDuration: `${fade}s`,
                }}
            />
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

            <StageStatus
                phase={phase}
                problems={problems}
                loadingActors={loadingActors}
                onRetry={onRetry}
                doc={doc}
                compact={compactStatus}
            />
            {children}
        </div>
    );
}
