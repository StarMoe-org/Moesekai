"use client";
import { useMemo } from "react";
import { Icon, IconButton, LinearProgress, Surface, cn } from "@/components/md3";
import {
    mdAccountTree, mdAltRoute, mdAutoplay, mdBolt, mdCalculate, mdChat, mdCheckCircle, mdClose,
    mdFlag, mdGraphicEq, mdHourglassTop, mdImage, mdMonitoring, mdMovie, mdMusicNote, mdMyLocation,
    mdNumbers, mdPerson, mdPlayCircle, mdRecordVoiceOver, mdTag, mdWarning,
} from "@/components/md3/icons";
import { StoryFlowCanvas } from "@/components/story-maker/StoryFlowCanvas";
import { useI18n } from "@/contexts/I18nContext";
import type { CompiledStoryProgram } from "@/lib/storyMaker/compiler";
import { interpolateStoryText, type StoryRuntimeFrame } from "@/lib/storyMaker/runtime";
import type {
    SceneBeat, SceneBeatKind, StoryDocument, StoryNode, StoryNodeType, StorySlot,
    StoryStageState, StoryVarValues,
} from "@/types/storyMaker";

export type StoryRuntimePhase = "typing" | "voice" | "effect" | "choice" | "auto" | "waiting" | "ended";

export interface ActiveVoiceProgress {
    currentSec: number;
    durationSec: number;
    start?: number;
    end?: number;
    label: string;
}

export interface LivePhaseTelemetryProps {
    doc: StoryDocument;
    program: CompiledStoryProgram;
    frame: StoryRuntimeFrame | null;
    runtimePhase: StoryRuntimePhase;
    stageState: StoryStageState;
    /** Optional real-time variable overrides updated as `varOp` instructions execute mid-frame. */
    liveVariables?: StoryVarValues;
    activeVoiceProgress?: ActiveVoiceProgress | null;
    onSelectNode?: (nodeId: string) => void;
    onSelectBeat?: (nodeId: string, beatId: string) => void;
    /** Compact vertical single-column layout for narrow NLE sidebar panes. */
    compact?: boolean;
    /** Hide the inline status/node summary row when embedded under an external header. */
    hideSummary?: boolean;
}

export interface LivePhasePanelProps {
    doc: StoryDocument;
    program: CompiledStoryProgram;
    frame: StoryRuntimeFrame | null;
    runtimePhase: StoryRuntimePhase;
    stageState: StoryStageState;
    liveVariables?: StoryVarValues;
    activeVoiceProgress?: ActiveVoiceProgress | null;
    onSelectNode?: (nodeId: string) => void;
    onSelectBeat?: (nodeId: string, beatId: string) => void;
    onClose?: () => void;
}

export const PHASE_META: Record<StoryRuntimePhase, {
    labelKey:
        | "page.storyMaker.phase.statusTyping"
        | "page.storyMaker.phase.statusVoice"
        | "page.storyMaker.phase.statusEffect"
        | "page.storyMaker.phase.statusChoice"
        | "page.storyMaker.phase.statusAuto"
        | "page.storyMaker.phase.statusWaiting"
        | "page.storyMaker.phase.statusEnded";
    icon: string;
    chipClass: string;
    dotClass: string;
    live: boolean;
}> = {
    typing: {
        labelKey: "page.storyMaker.phase.statusTyping",
        icon: mdChat,
        chipClass: "bg-primary-container text-on-primary-container",
        dotClass: "bg-primary",
        live: true,
    },
    voice: {
        labelKey: "page.storyMaker.phase.statusVoice",
        icon: mdRecordVoiceOver,
        chipClass: "bg-tertiary-container text-on-tertiary-container",
        dotClass: "bg-tertiary",
        live: true,
    },
    effect: {
        labelKey: "page.storyMaker.phase.statusEffect",
        icon: mdBolt,
        chipClass: "bg-secondary-container text-on-secondary-container",
        dotClass: "bg-secondary",
        live: true,
    },
    choice: {
        labelKey: "page.storyMaker.phase.statusChoice",
        icon: mdAltRoute,
        chipClass: "bg-tertiary-container text-on-tertiary-container ring-1 ring-tertiary/40",
        dotClass: "bg-tertiary",
        live: true,
    },
    auto: {
        labelKey: "page.storyMaker.phase.statusAuto",
        icon: mdAutoplay,
        chipClass: "bg-primary text-on-primary",
        dotClass: "bg-primary",
        live: true,
    },
    waiting: {
        labelKey: "page.storyMaker.phase.statusWaiting",
        icon: mdHourglassTop,
        chipClass: "bg-surface-container-highest text-on-surface-variant",
        dotClass: "bg-outline",
        live: false,
    },
    ended: {
        labelKey: "page.storyMaker.phase.statusEnded",
        icon: mdCheckCircle,
        chipClass: "border border-outline-variant bg-surface-container-high text-on-surface-variant",
        dotClass: "bg-outline",
        live: false,
    },
};

const NODE_TYPE_META: Record<StoryNodeType, {
    labelKey:
        | "page.storyMaker.v2.nodeTypes.start"
        | "page.storyMaker.v2.nodeTypes.scene"
        | "page.storyMaker.v2.nodeTypes.choice"
        | "page.storyMaker.v2.nodeTypes.condition"
        | "page.storyMaker.v2.nodeTypes.end";
    icon: string;
    chipClass: string;
}> = {
    start: {
        labelKey: "page.storyMaker.v2.nodeTypes.start",
        icon: mdPlayCircle,
        chipClass: "bg-primary-container text-on-primary-container",
    },
    scene: {
        labelKey: "page.storyMaker.v2.nodeTypes.scene",
        icon: mdMovie,
        chipClass: "bg-secondary-container text-on-secondary-container",
    },
    choice: {
        labelKey: "page.storyMaker.v2.nodeTypes.choice",
        icon: mdAltRoute,
        chipClass: "bg-tertiary-container text-on-tertiary-container",
    },
    condition: {
        labelKey: "page.storyMaker.v2.nodeTypes.condition",
        icon: mdCalculate,
        chipClass: "bg-secondary-container text-on-secondary-container",
    },
    end: {
        labelKey: "page.storyMaker.v2.nodeTypes.end",
        icon: mdFlag,
        chipClass: "bg-primary-container text-on-primary-container",
    },
};

const BEAT_KIND_LABEL_KEYS: Record<SceneBeatKind,
    | "page.storyMaker.v2.beats.talk"
    | "page.storyMaker.v2.beats.narration"
    | "page.storyMaker.v2.beats.telop"
    | "page.storyMaker.v2.beats.stageAction"
    | "page.storyMaker.v2.beats.cue"
    | "page.storyMaker.v2.beats.varOp"
> = {
    talk: "page.storyMaker.v2.beats.talk",
    narration: "page.storyMaker.v2.beats.narration",
    telop: "page.storyMaker.v2.beats.telop",
    stageAction: "page.storyMaker.v2.beats.stageAction",
    cue: "page.storyMaker.v2.beats.cue",
    varOp: "page.storyMaker.v2.beats.varOp",
};

const SLOT_LABEL_KEYS: Record<StorySlot,
    | "page.storyMaker.slot.farLeft"
    | "page.storyMaker.slot.left"
    | "page.storyMaker.slot.center"
    | "page.storyMaker.slot.right"
    | "page.storyMaker.slot.farRight"
> = {
    farLeft: "page.storyMaker.slot.farLeft",
    left: "page.storyMaker.slot.left",
    center: "page.storyMaker.slot.center",
    right: "page.storyMaker.slot.right",
    farRight: "page.storyMaker.slot.farRight",
};

function formatSec(value: number): string {
    if (!Number.isFinite(value) || value < 0) return "0.00";
    return value.toFixed(2);
}

/** Localized display label for any v2 graph node (`start`, `scene`, `choice`, `condition`, `end`). */
export function getNodeDisplayLabel(
    node: StoryNode | null | undefined,
    t: (key: string, params?: Record<string, string | number>) => string,
): string {
    if (!node) return t("page.storyMaker.phase.none");
    if (node.type === "start") return t("page.storyMaker.v2.nodeTypes.start");
    const trimmed = node.title.trim();
    if (trimmed) return trimmed;
    return t(NODE_TYPE_META[node.type].labelKey);
}

function summarizeActiveBeat(
    beat: SceneBeat,
    doc: StoryDocument,
    vars: StoryVarValues,
    t: (key: string, params?: Record<string, string | number>) => string,
): string {
    switch (beat.kind) {
        case "talk": {
            const member = beat.speakerKey ? doc.cast.find(item => item.key === beat.speakerKey) : undefined;
            const speaker = beat.speakerName
                ? interpolateStoryText(beat.speakerName, doc, vars)
                : (member?.name ?? "");
            const body = interpolateStoryText(beat.body, doc, vars).trim();
            return speaker && body ? `${speaker}: ${body}` : (body || speaker || t("page.storyMaker.v2.beats.talk"));
        }
        case "narration":
            return interpolateStoryText(beat.body, doc, vars).trim() || t("page.storyMaker.v2.beats.narration");
        case "telop":
            return interpolateStoryText(beat.text, doc, vars).trim() || t("page.storyMaker.v2.beats.telop");
        case "stageAction": {
            const actorName = doc.cast.find(item => item.key === beat.castKey)?.name || beat.castKey;
            return actorName || t("page.storyMaker.v2.beats.stageAction");
        }
        case "cue":
            return beat.cueType === "se" && beat.se ? beat.se : t("page.storyMaker.v2.beats.cue");
        case "varOp":
            return t("page.storyMaker.v2.beats.varOp");
    }
}

function CompilerStatusBadge({
    program,
}: {
    program: CompiledStoryProgram;
}) {
    const { t } = useI18n();
    if (program.errors.length > 0) {
        return (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-error-container px-2 py-0.5 type-label-s text-on-error-container">
                <Icon path={mdWarning} size={13} className="shrink-0" />
                <span className="truncate">
                    {t("page.storyMaker.v2.compiler.statusErrors", { count: program.errors.length })}
                </span>
            </span>
        );
    }
    if (program.warnings.length > 0) {
        return (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-tertiary-container px-2 py-0.5 type-label-s text-on-tertiary-container">
                <Icon path={mdWarning} size={13} className="shrink-0" />
                <span className="truncate">
                    {t("page.storyMaker.v2.compiler.statusWarnings", { count: program.warnings.length })}
                </span>
            </span>
        );
    }
    return (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-container/70 px-2 py-0.5 type-label-s text-on-primary-container">
            <Icon path={mdCheckCircle} size={13} className="shrink-0" />
            <span className="truncate">{t("page.storyMaker.v2.compiler.statusOk")}</span>
        </span>
    );
}

/**
 * Reusable live execution telemetry cards, Live Variables & Counters Monitor, and branch path trace
 * (embedded inside the NLE workspace's Top-Left `phase` tab without duplicating the Flow Canvas,
 * and composed into `<LivePhasePanel>`).
 */
export function LivePhaseTelemetry({
    doc,
    program,
    frame,
    runtimePhase,
    stageState,
    liveVariables,
    activeVoiceProgress = null,
    onSelectNode,
    onSelectBeat,
    compact = false,
    hideSummary = false,
}: LivePhaseTelemetryProps) {
    const { t } = useI18n();

    const activeNodeId = frame?.nodeId ?? null;
    const activeBeatId = frame?.beatId ?? null;
    const activeNode = activeNodeId ? doc.nodes[activeNodeId] ?? null : null;
    const activeNodeLabel = getNodeDisplayLabel(activeNode, t);
    const activeNodeMeta = activeNode ? NODE_TYPE_META[activeNode.type] : null;
    const phaseMeta = PHASE_META[runtimePhase];

    const effectiveVars = useMemo<StoryVarValues>(() => {
        if (liveVariables) return liveVariables;
        if (frame) return frame.variables;
        const init: StoryVarValues = {};
        for (const variable of doc.variables) init[variable.id] = variable.initial;
        return init;
    }, [doc.variables, frame, liveVariables]);

    const activeBeatInfo = useMemo(() => {
        if (!activeNode || activeNode.type !== "scene" || !activeBeatId) return null;
        const index = activeNode.beats.findIndex(item => item.id === activeBeatId);
        if (index < 0) return null;
        const beat = activeNode.beats[index];
        return {
            index,
            total: activeNode.beats.length,
            beat,
            summary: summarizeActiveBeat(beat, doc, effectiveVars, t),
        };
    }, [activeBeatId, activeNode, doc, effectiveVars, t]);

    const beatVoiceRef = activeBeatInfo?.beat.kind === "talk"
        && activeBeatInfo.beat.voice
        && activeBeatInfo.beat.voice.voiceId
        ? activeBeatInfo.beat.voice
        : null;

    const visitedNodeIds = frame?.visitedNodeIds ?? [];

    const voiceTelemetry = useMemo(() => {
        if (activeVoiceProgress) {
            const rangeStart = Math.max(0, activeVoiceProgress.start ?? 0);
            const hasTrim = activeVoiceProgress.start !== undefined || activeVoiceProgress.end !== undefined;
            const totalDuration = activeVoiceProgress.durationSec > 0
                ? activeVoiceProgress.durationSec
                : (activeVoiceProgress.end ?? 0);
            const rangeEnd = activeVoiceProgress.end !== undefined
                ? (totalDuration > 0 ? Math.min(activeVoiceProgress.end, totalDuration) : activeVoiceProgress.end)
                : totalDuration;
            const span = Math.max(0.01, rangeEnd - rangeStart);
            const elapsed = Math.max(0, Math.min(span, activeVoiceProgress.currentSec - rangeStart));
            const ratio = rangeEnd > rangeStart ? Math.max(0, Math.min(1, elapsed / span)) : 0;
            return {
                playing: true,
                label: activeVoiceProgress.label,
                hasTrim,
                rangeStart,
                rangeEnd,
                currentSec: activeVoiceProgress.currentSec,
                totalSec: rangeEnd || totalDuration,
                ratio,
            };
        }
        if (beatVoiceRef) {
            const hasTrim = beatVoiceRef.start !== undefined || beatVoiceRef.end !== undefined;
            return {
                playing: false,
                label: beatVoiceRef.voiceId,
                hasTrim,
                rangeStart: Math.max(0, beatVoiceRef.start ?? 0),
                rangeEnd: beatVoiceRef.end ?? 0,
                currentSec: 0,
                totalSec: 0,
                ratio: 0,
            };
        }
        return null;
    }, [activeVoiceProgress, beatVoiceRef]);

    return (
        <div className="min-w-0 max-w-full space-y-2.5">
            {!hideSummary && (
                <div className="min-w-0 space-y-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span
                            className={cn(
                                "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 type-label-m",
                                phaseMeta.chipClass,
                            )}
                        >
                            <Icon path={phaseMeta.icon} size={14} className="shrink-0" />
                            <span className="truncate">{t(phaseMeta.labelKey)}</span>
                        </span>

                        {activeNodeMeta && (
                            <span
                                className={cn(
                                    "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 type-label-s",
                                    activeNodeMeta.chipClass,
                                )}
                            >
                                <Icon path={activeNodeMeta.icon} size={13} className="shrink-0" />
                                <span className="truncate">{t(activeNodeMeta.labelKey)}</span>
                            </span>
                        )}

                        <CompilerStatusBadge program={program} />
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="inline-flex max-w-full items-center gap-1 rounded-md3-sm bg-surface-container px-2 py-0.5 type-label-s text-on-surface-variant">
                            <span className="shrink-0">{t("page.storyMaker.phase.currentNode")}:</span>
                            <span className="max-w-36 truncate text-on-surface">{activeNodeLabel}</span>
                        </span>

                        {activeBeatInfo && (
                            <span className="rounded-md3-sm bg-surface-container px-2 py-0.5 font-mono type-label-s tabular-nums text-on-surface">
                                {t("page.storyMaker.phase.currentStep", {
                                    current: activeBeatInfo.index + 1,
                                    total: activeBeatInfo.total,
                                })}
                            </span>
                        )}

                        <span className="rounded-md3-sm bg-surface-container px-2 py-0.5 type-label-s text-on-surface-variant">
                            {t("page.storyMaker.phase.visitedNodes", { count: visitedNodeIds.length })}
                        </span>
                    </div>
                </div>
            )}

            {/* Active Beat Summary Card */}
            {activeBeatInfo && activeNodeId && (
                <div className="flex min-w-0 items-center justify-between gap-2 rounded-md3-md border border-outline-variant/50 bg-surface-container px-2.5 py-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="shrink-0 rounded-md3-xs bg-secondary-container px-1.5 py-0.5 type-label-s text-on-secondary-container">
                                {t(BEAT_KIND_LABEL_KEYS[activeBeatInfo.beat.kind])}
                            </span>
                            <span className="shrink-0 font-mono type-label-s tabular-nums text-on-surface-variant">
                                {t("page.storyMaker.phase.currentStep", {
                                    current: activeBeatInfo.index + 1,
                                    total: activeBeatInfo.total,
                                })}
                            </span>
                        </div>
                        <p className="min-w-0 truncate type-body-s text-on-surface" title={activeBeatInfo.summary}>
                            {activeBeatInfo.summary}
                        </p>
                    </div>
                    {onSelectBeat && (
                        <button
                            type="button"
                            onClick={() => onSelectBeat(activeNodeId, activeBeatInfo.beat.id)}
                            className="state-layer focus-ring shrink-0 rounded-md3-xs bg-surface-container-high px-2 py-1 type-label-s text-on-surface-variant hover:text-on-surface"
                        >
                            {t("page.storyMaker.phase.jumpToStep")}
                        </button>
                    )}
                </div>
            )}

            {/* Live Variables & Counters Monitor */}
            <div className="min-w-0 space-y-2 rounded-md3-md border border-outline-variant/50 bg-surface-container p-2.5">
                <div className="flex min-w-0 items-center justify-between gap-2 type-label-s text-on-surface-variant">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Icon path={mdCalculate} size={15} className="shrink-0 text-primary" />
                        <span className="truncate type-label-m text-on-surface">
                            {t("page.storyMaker.v2.variables.liveMonitorTitle")}
                        </span>
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">
                        {doc.variables.length}
                    </span>
                </div>

                {doc.variables.length === 0 ? (
                    <p className="type-body-s text-on-surface-variant">
                        {t("page.storyMaker.phase.none")}
                    </p>
                ) : (
                    <ul
                        className={cn(
                            "grid min-w-0 grid-cols-1 gap-1.5",
                            !compact && "sm:grid-cols-2 lg:grid-cols-3",
                        )}
                    >
                        {doc.variables.map((variable) => {
                            const currentValue = effectiveVars[variable.id] ?? variable.initial;
                            const isChanged = currentValue !== variable.initial;
                            return (
                                <li
                                    key={variable.id}
                                    className={cn(
                                        "flex min-w-0 items-center justify-between gap-2 rounded-md3-sm border px-2 py-1.5 transition-colors",
                                        isChanged
                                            ? "border-primary/50 bg-primary-container/25"
                                            : "border-outline-variant/40 bg-surface-container-low",
                                    )}
                                >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        <Icon
                                            path={variable.type === "number" ? mdNumbers : mdTag}
                                            size={14}
                                            className="shrink-0 text-primary"
                                        />
                                        <span className="min-w-0">
                                            <span className="block truncate type-label-m text-on-surface">
                                                {variable.name || variable.id}
                                            </span>
                                            <span className="block truncate font-mono type-label-s text-on-surface-variant">
                                                {variable.id}
                                            </span>
                                        </span>
                                    </span>

                                    {variable.type === "number" ? (
                                        <span
                                            className={cn(
                                                "shrink-0 rounded-md3-xs px-2 py-0.5 font-mono type-label-m tabular-nums",
                                                isChanged
                                                    ? "bg-primary text-on-primary"
                                                    : "bg-primary-container text-on-primary-container",
                                            )}
                                        >
                                            {String(currentValue)}
                                        </span>
                                    ) : (
                                        <span
                                            className={cn(
                                                "shrink-0 rounded-full px-2 py-0.5 font-mono type-label-s",
                                                currentValue === true
                                                    ? "bg-primary text-on-primary"
                                                    : "bg-surface-container-highest text-on-surface-variant",
                                            )}
                                        >
                                            {String(Boolean(currentValue))}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Live Scene Telemetry Grid */}
            <div
                className={cn(
                    "grid min-w-0 grid-cols-1 gap-2",
                    !compact && "sm:grid-cols-2 lg:grid-cols-4",
                )}
            >
                {/* Active Background & PlaceInfo */}
                <div className="min-w-0 space-y-1.5 rounded-md3-md border border-outline-variant/50 bg-surface-container p-2.5">
                    <div className="flex min-w-0 items-center gap-1.5 type-label-s text-on-surface-variant">
                        <Icon path={mdImage} size={15} className="shrink-0 text-primary" />
                        <span className="truncate">{t("page.storyMaker.phase.activeBackground")}</span>
                    </div>
                    <p
                        className={cn(
                            "min-w-0 truncate font-mono type-body-s",
                            stageState.background ? "text-on-surface" : "text-on-surface-variant",
                        )}
                        title={stageState.background ?? undefined}
                    >
                        {stageState.background || t("page.storyMaker.phase.none")}
                    </p>
                    <div className="flex min-w-0 items-center gap-1 pt-0.5 type-label-s text-on-surface-variant">
                        <Icon path={mdMyLocation} size={14} className="shrink-0" />
                        <span className="shrink-0">{t("page.storyMaker.phase.activePlace")}:</span>
                        <span
                            className="min-w-0 truncate text-on-surface"
                            title={stageState.place ?? undefined}
                        >
                            {stageState.place || t("page.storyMaker.phase.none")}
                        </span>
                    </div>
                </div>

                {/* Active BGM */}
                <div className="min-w-0 space-y-1.5 rounded-md3-md border border-outline-variant/50 bg-surface-container p-2.5">
                    <div className="flex min-w-0 items-center justify-between gap-1.5 type-label-s text-on-surface-variant">
                        <span className="flex min-w-0 items-center gap-1.5">
                            <Icon path={mdMusicNote} size={15} className="shrink-0 text-primary" />
                            <span className="truncate">{t("page.storyMaker.phase.activeBgm")}</span>
                        </span>
                        {stageState.bgm.name && (
                            <span className="shrink-0 font-mono tabular-nums text-on-surface">
                                {Math.round(stageState.bgm.volume * 100)}%
                            </span>
                        )}
                    </div>
                    <p
                        className={cn(
                            "min-w-0 truncate font-mono type-body-s",
                            stageState.bgm.name ? "text-on-surface" : "text-on-surface-variant",
                        )}
                        title={stageState.bgm.name ?? undefined}
                    >
                        {stageState.bgm.name || t("page.storyMaker.phase.none")}
                    </p>
                    {stageState.bgm.name && (
                        <div className="pt-1">
                            <LinearProgress
                                value={Math.max(0, Math.min(1, stageState.bgm.volume))}
                                stop={false}
                                aria-label={t("page.storyMaker.phase.activeBgm")}
                            />
                        </div>
                    )}
                </div>

                {/* Active Actors */}
                <div className="min-w-0 space-y-1.5 rounded-md3-md border border-outline-variant/50 bg-surface-container p-2.5">
                    <div className="flex min-w-0 items-center justify-between gap-1.5 type-label-s text-on-surface-variant">
                        <span className="flex min-w-0 items-center gap-1.5">
                            <Icon path={mdPerson} size={15} className="shrink-0 text-primary" />
                            <span className="truncate">{t("page.storyMaker.phase.activeActors")}</span>
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">
                            {stageState.actors.length}
                        </span>
                    </div>
                    {stageState.actors.length === 0 ? (
                        <p className="type-body-s text-on-surface-variant">
                            {t("page.storyMaker.phase.noActors")}
                        </p>
                    ) : (
                        <ul className="min-w-0 space-y-1">
                            {stageState.actors.map((actor) => {
                                const member = doc.cast.find(item => item.key === actor.cast);
                                const displayName = member?.name || actor.cast;
                                const isSpeaking = stageState.speaking === actor.cast;
                                const poseParts = [actor.motion, actor.facial].filter(Boolean);
                                return (
                                    <li
                                        key={actor.cast}
                                        className={cn(
                                            "flex min-w-0 items-center justify-between gap-1.5 rounded-md3-xs px-1.5 py-0.5",
                                            isSpeaking
                                                ? "bg-primary-container/60 text-on-primary-container"
                                                : "bg-surface-container-low text-on-surface",
                                        )}
                                    >
                                        <span className="flex min-w-0 items-center gap-1">
                                            {isSpeaking && (
                                                <Icon path={mdGraphicEq} size={13} className="shrink-0 text-primary" />
                                            )}
                                            <span className="min-w-0 truncate type-label-m">
                                                {displayName}
                                            </span>
                                            <span className="shrink-0 rounded-md3-xs bg-surface-container-high px-1 py-0.5 type-label-s text-on-surface-variant">
                                                {t(SLOT_LABEL_KEYS[actor.slot])}
                                            </span>
                                        </span>
                                        {poseParts.length > 0 && (
                                            <span
                                                className="min-w-0 max-w-28 truncate font-mono type-label-s text-on-surface-variant"
                                                title={poseParts.join(" / ")}
                                            >
                                                {poseParts.join(" / ")}
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Active Voice */}
                <div className="min-w-0 space-y-1.5 rounded-md3-md border border-outline-variant/50 bg-surface-container p-2.5">
                    <div className="flex min-w-0 items-center justify-between gap-1.5 type-label-s text-on-surface-variant">
                        <span className="flex min-w-0 items-center gap-1.5">
                            <Icon
                                path={mdRecordVoiceOver}
                                size={15}
                                className={cn("shrink-0", voiceTelemetry?.playing ? "text-tertiary" : "text-primary")}
                            />
                            <span className="truncate">{t("page.storyMaker.phase.activeVoice")}</span>
                        </span>
                        {voiceTelemetry?.playing && voiceTelemetry.totalSec > 0 && (
                            <span className="shrink-0 font-mono tabular-nums text-on-surface">
                                {formatSec(voiceTelemetry.currentSec)}s / {formatSec(voiceTelemetry.totalSec)}s
                            </span>
                        )}
                    </div>

                    {voiceTelemetry ? (
                        <div className="min-w-0 space-y-1.5">
                            <p
                                className={cn(
                                    "min-w-0 truncate font-mono type-body-s",
                                    voiceTelemetry.playing ? "text-on-surface" : "text-on-surface-variant",
                                )}
                                title={voiceTelemetry.label}
                            >
                                {voiceTelemetry.label}
                            </p>
                            {voiceTelemetry.hasTrim && voiceTelemetry.rangeEnd > 0 && (
                                <span className="inline-flex max-w-full truncate rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 font-mono type-label-s text-on-tertiary-container">
                                    {t("page.storyMaker.phase.trimmedRange", {
                                        start: formatSec(voiceTelemetry.rangeStart),
                                        end: formatSec(voiceTelemetry.rangeEnd),
                                    })}
                                </span>
                            )}
                            {voiceTelemetry.playing && (
                                <LinearProgress
                                    value={voiceTelemetry.totalSec > 0 ? voiceTelemetry.ratio : undefined}
                                    tickMs={voiceTelemetry.totalSec > 0 ? 60 : undefined}
                                    stop={false}
                                    aria-label={t("page.storyMaker.phase.activeVoice")}
                                />
                            )}
                        </div>
                    ) : (
                        <p className="type-body-s text-on-surface-variant">
                            {t("page.storyMaker.phase.none")}
                        </p>
                    )}
                </div>
            </div>

            {/* Branch Path Trace Strip */}
            {visitedNodeIds.length > 0 && (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-md3-md bg-surface-container/60 px-2.5 py-1.5">
                    <span className="shrink-0 type-label-s text-on-surface-variant">
                        {t("page.storyMaker.phase.branchPath")}:
                    </span>
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                        {visitedNodeIds.map((nodeId, idx) => {
                            const node = doc.nodes[nodeId];
                            const label = getNodeDisplayLabel(node, t);
                            const isActive = nodeId === activeNodeId;
                            const clickable = Boolean(onSelectNode && program.nodeEntryPc[nodeId] !== undefined);
                            return (
                                <span key={nodeId} className="inline-flex max-w-full items-center gap-1">
                                    {idx > 0 && (
                                        <span aria-hidden className="type-label-s text-on-surface-variant">›</span>
                                    )}
                                    {clickable ? (
                                        <button
                                            type="button"
                                            onClick={() => onSelectNode?.(nodeId)}
                                            title={t("page.storyMaker.phase.jumpToStep")}
                                            className={cn(
                                                "state-layer focus-ring max-w-36 truncate rounded-md3-xs px-1.5 py-0.5 type-label-s transition-colors",
                                                isActive
                                                    ? "bg-primary-container text-on-primary-container"
                                                    : "bg-surface-container-high text-on-surface-variant hover:text-on-surface",
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ) : (
                                        <span
                                            className={cn(
                                                "max-w-36 truncate rounded-md3-xs px-1.5 py-0.5 type-label-s",
                                                isActive
                                                    ? "bg-primary-container text-on-primary-container"
                                                    : "bg-surface-container-high text-on-surface-variant",
                                            )}
                                        >
                                            {label}
                                        </span>
                                    )}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Full standalone Live Phase, Variables & Flow Monitor panel (for Theater & mobile views).
 */
export function LivePhasePanel({
    doc,
    program,
    frame,
    runtimePhase,
    stageState,
    liveVariables,
    activeVoiceProgress = null,
    onSelectNode,
    onSelectBeat,
    onClose,
}: LivePhasePanelProps) {
    const { t } = useI18n();

    const activeNodeId = frame?.nodeId ?? null;
    const activeBeatId = frame?.beatId ?? null;
    const activeNode = activeNodeId ? doc.nodes[activeNodeId] ?? null : null;
    const activeNodeLabel = getNodeDisplayLabel(activeNode, t);
    const activeNodeMeta = activeNode ? NODE_TYPE_META[activeNode.type] : null;
    const phaseMeta = PHASE_META[runtimePhase];
    const visitedNodeIds = frame?.visitedNodeIds ?? [];
    const visitedEdgeIds = frame?.visitedEdgeIds ?? [];

    const activeBeatIndex = activeNode?.type === "scene" && activeBeatId
        ? activeNode.beats.findIndex(item => item.id === activeBeatId)
        : -1;
    const activeBeatTotal = activeNode?.type === "scene" ? activeNode.beats.length : 0;

    return (
        <Surface
            tone="low"
            radius="lg"
            className="min-w-0 max-w-full space-y-3 border border-outline-variant/60 p-3 sm:p-4"
        >
            {/* Header */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <Icon path={mdMonitoring} size={20} className="shrink-0 text-primary" />
                        <h3 className="truncate type-title-m text-on-surface">
                            {t("page.storyMaker.phase.title")}
                        </h3>
                    </div>

                    <span
                        className={cn(
                            "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 type-label-m",
                            phaseMeta.chipClass,
                        )}
                    >
                        <Icon path={phaseMeta.icon} size={15} className="shrink-0" />
                        <span className="truncate">{t(phaseMeta.labelKey)}</span>
                    </span>

                    <CompilerStatusBadge program={program} />
                </div>

                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
                    {activeNodeMeta && (
                        <span
                            className={cn(
                                "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 type-label-s",
                                activeNodeMeta.chipClass,
                            )}
                        >
                            <Icon path={activeNodeMeta.icon} size={13} className="shrink-0" />
                            <span className="truncate">{t(activeNodeMeta.labelKey)}</span>
                        </span>
                    )}

                    <span className="inline-flex max-w-full items-center gap-1 rounded-md3-sm bg-surface-container px-2 py-0.5 type-label-s text-on-surface-variant">
                        <span className="shrink-0">{t("page.storyMaker.phase.currentNode")}:</span>
                        <span className="max-w-32 truncate text-on-surface sm:max-w-44">{activeNodeLabel}</span>
                    </span>

                    {activeBeatIndex >= 0 && activeBeatTotal > 0 && (
                        <span className="rounded-md3-sm bg-surface-container px-2 py-0.5 font-mono type-label-s tabular-nums text-on-surface">
                            {t("page.storyMaker.phase.currentStep", {
                                current: activeBeatIndex + 1,
                                total: activeBeatTotal,
                            })}
                        </span>
                    )}

                    <span className="rounded-md3-sm bg-surface-container px-2 py-0.5 type-label-s text-on-surface-variant">
                        {t("page.storyMaker.phase.visitedNodes", { count: visitedNodeIds.length })}
                    </span>

                    {onClose && (
                        <IconButton
                            size="xs"
                            icon={mdClose}
                            label={t("page.storyMaker.phase.collapse")}
                            onClick={onClose}
                        />
                    )}
                </div>
            </div>

            <LivePhaseTelemetry
                doc={doc}
                program={program}
                frame={frame}
                runtimePhase={runtimePhase}
                stageState={stageState}
                liveVariables={liveVariables}
                activeVoiceProgress={activeVoiceProgress}
                onSelectNode={onSelectNode}
                onSelectBeat={onSelectBeat}
                hideSummary
            />

            {/* Live Flow Graph Monitor */}
            <div className="min-w-0 space-y-1.5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 type-label-l text-on-surface">
                        <Icon path={mdAccountTree} size={17} className="shrink-0 text-primary" />
                        <span className="truncate">{t("page.storyMaker.phase.flowMonitor")}</span>
                    </span>
                    {onSelectNode && (
                        <span className="type-label-s text-on-surface-variant">
                            {t("page.storyMaker.phase.jumpToStep")}
                        </span>
                    )}
                </div>

                <StoryFlowCanvas
                    doc={doc}
                    mode="monitor"
                    activeNodeId={activeNodeId}
                    activeBeatId={activeBeatId}
                    visitedNodeIds={visitedNodeIds}
                    visitedEdgeIds={visitedEdgeIds}
                    diagnostics={program.diagnostics}
                    onSelectNode={onSelectNode}
                    onSelectBeat={onSelectBeat}
                    className="h-72 sm:h-80"
                />
            </div>
        </Surface>
    );
}
