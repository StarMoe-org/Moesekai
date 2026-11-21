"use client";
import {
    useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
    type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    Banner, Button, Icon, IconButton, LoadingIndicator, SegmentedButton, SideSheet, Slider, Surface, Tabs, cn,
} from "@/components/md3";
import {
    mdAccountTree, mdAutoplay, mdCalculate, mdClose, mdCloudDone, mdDashboard, mdDownload, mdDragHandle,
    mdErrorFill, mdFlag, mdFullscreen, mdFullscreenExit, mdHistory, mdImage, mdInventory2, mdMonitoring,
    mdMusicNote, mdNumbers, mdPermMedia, mdPerson, mdPlayArrowFill, mdReplay, mdSkipNext, mdSkipPrevious,
    mdSmartDisplay, mdStopFill, mdTag, mdTheaters, mdTimeline, mdVisibility, mdVisibilityOff, mdVolumeOff,
    mdVolumeUp, mdWarning,
} from "@/components/md3/icons";
import { StoryFlowCanvas } from "@/components/story-maker/StoryFlowCanvas";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { getCharacterIconUrl, type AssetLine } from "@/lib/assets";
import { live2dSources } from "@/lib/live2dViewer/config";
import { md3EffectsFast, reducedMotionFade } from "@/lib/motion";
import { storyBgmUrl, storySeCandidateUrls, storyVoiceCandidateUrls } from "@/lib/storyMaker/assets";
import { compileStoryGraph, type StoryIR } from "@/lib/storyMaker/compiler";
import { SLOT_X, STORY_FADE_SECONDS, STORY_LIMITS } from "@/lib/storyMaker/limits";
import {
    collectStoryAssets, inspectStoryCacheStatus, preloadStoryAssets,
    type StoryPreloadAudioItem, type StoryPreloadProgress,
} from "@/lib/storyMaker/preloader";
import {
    INITIAL_STAGE_STATE, advanceRuntime, applyVarOps, createInitialRuntime, evaluateStageAt,
    initVariables, interpolateStoryText, type StoryRuntimeFrame,
} from "@/lib/storyMaker/runtime";
import type {
    StoryDocument, StoryEffectColor, StoryStageActorState, StoryStageState, StoryVarValues, StoryVoiceRef,
} from "@/types/storyMaker";
import {
    AssetPreloadDialog, readAutoPreloadPreference, writeAutoPreloadPreference,
} from "./AssetPreloadPanel";
import {
    LivePhasePanel, LivePhaseTelemetry, PHASE_META, getNodeDisplayLabel,
    type ActiveVoiceProgress, type StoryRuntimePhase,
} from "./LivePhasePanel";
import { StoryStageView } from "./StoryStageView";
import { previewStorySound, useStoryAudio } from "./useStoryAudio";
import { useStoryModels } from "./useStoryModels";
import { useStoryStage } from "./useStoryStage";
import { useStoryUiKit } from "./useStoryUiKit";

export type PlayerLayoutMode = "workspace" | "theater";

type LeftPaneTab = "assets" | "phase" | "backlog";

interface PlayerHistoryItem {
    frame: StoryRuntimeFrame;
    /** Choice option text chosen when leaving this frame, displayed in Backlog. */
    chosenText?: string;
}

interface BacklogEntry {
    key: string;
    kind: "talk" | "narration" | "telop" | "choice";
    speaker?: string;
    body: string;
    voiceUrls?: string[];
    voiceStart?: number;
    voiceEnd?: number;
    voiceLabel?: string;
}

interface AssetJumpTarget {
    nodeId: string;
    beatId?: string;
}

export interface StoryPlayerViewProps {
    doc: StoryDocument;
    line: AssetLine;
    /** Optional full asset source identifier (falls back to `line`). */
    assetSource?: AssetSourceType;
    /** Optional initial node ID to start playback from (`?node=` play-from-scene). */
    startNodeId?: string | null;
    /** Optional controlled layout mode (`"workspace"` NLE 3-pane vs `"theater"`). */
    layoutMode?: PlayerLayoutMode;
    /** Optional layout mode change handler when controlled by page header. */
    onLayoutModeChange?: (mode: PlayerLayoutMode) => void;
    /** Web-fullscreen / immersive mode: fills the entire viewport height with zero page chrome. */
    immersive?: boolean;
    /** Optional action rendered on the ending / error card (e.g. Back to editor). */
    endAction?: React.ReactNode;
}

const CHAR_INTERVAL_MS = 28;
const PLAYER_SPLIT_STORAGE_KEY = "moesekai.storyMaker.playerSplitPct";
const DEFAULT_TOP_SPLIT_PCT = 56;
const MIN_TOP_SPLIT_PCT = 36;
const MAX_TOP_SPLIT_PCT = 72;

const splitListeners = new Set<() => void>();

function clampSplitPct(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_TOP_SPLIT_PCT;
    return Math.max(MIN_TOP_SPLIT_PCT, Math.min(MAX_TOP_SPLIT_PCT, Math.round(value * 10) / 10));
}

function readTopSplitPct(): number {
    if (typeof window === "undefined") return DEFAULT_TOP_SPLIT_PCT;
    try {
        const raw = window.sessionStorage.getItem(PLAYER_SPLIT_STORAGE_KEY);
        if (!raw) return DEFAULT_TOP_SPLIT_PCT;
        return clampSplitPct(Number(raw));
    } catch {
        return DEFAULT_TOP_SPLIT_PCT;
    }
}

function writeTopSplitPct(next: number): void {
    const clamped = clampSplitPct(next);
    if (typeof window !== "undefined") {
        try {
            window.sessionStorage.setItem(PLAYER_SPLIT_STORAGE_KEY, String(clamped));
        } catch {
            // Ignore private-mode / quota errors
        }
    }
    for (const listener of splitListeners) listener();
}

function subscribeTopSplitPct(listener: () => void): () => void {
    splitListeners.add(listener);
    return () => { splitListeners.delete(listener); };
}

function voiceDedupeKey(voice: StoryVoiceRef, defaultRegion: StoryDocument["region"]): string {
    return `${voice.kind}|${voice.region ?? defaultRegion}|${voice.scenarioId}|${voice.voiceId}`;
}

function formatSec(value: number): string {
    if (!Number.isFinite(value) || value < 0) return "0.00";
    return value.toFixed(2);
}

/**
 * Pure incremental stage reducer mirroring `runtime.ts` so `StoryPlayerView` can animate each
 * IR instruction inside `frame.executedInstructions` smoothly (scene transitions, stage actions,
 * cues, varOps, talk + synchronous co-star reactions) before settling on `frame.stage`.
 */
function applyInstructionToStage(
    stage: StoryStageState,
    vars: StoryVarValues,
    inst: StoryIR,
    doc: StoryDocument,
): { stage: StoryStageState; variables: StoryVarValues } {
    switch (inst.op) {
        case "enterScene": {
            const background = inst.background.mode === "inherit"
                ? stage.background
                : inst.background.mode === "clear"
                    ? null
                    : inst.background.asset;
            const bgm = inst.bgm.mode === "inherit"
                ? stage.bgm
                : inst.bgm.mode === "stop"
                    ? { name: null, volume: stage.bgm.volume }
                    : { name: inst.bgm.name, volume: inst.bgm.volume };
            const place = inst.place.mode === "inherit"
                ? stage.place
                : inst.place.mode === "hide"
                    ? null
                    : (interpolateStoryText(inst.place.text, doc, vars).trim() || null);
            const actors: StoryStageActorState[] = inst.stageCast.mode === "inherit"
                ? stage.actors
                : inst.stageCast.mode === "clear"
                    ? []
                    : inst.stageCast.actors.map(actor => ({
                        cast: actor.castKey,
                        slot: actor.slot,
                        x: SLOT_X[actor.slot],
                        y: actor.y ?? 0,
                        scale: actor.scale ?? 1,
                        mirror: false,
                        motion: actor.motion ?? null,
                        facial: actor.facial ?? null,
                    }));
            const screenColor: StoryEffectColor = inst.transition.kind === "fadeWhite" ? "white" : "black";
            return {
                stage: {
                    background,
                    place,
                    actors,
                    bgm,
                    dialogue: null,
                    narration: null,
                    telop: null,
                    screen: { color: screenColor, covered: false },
                    speaking: null,
                },
                variables: vars,
            };
        }
        case "talk": {
            const beat = inst.beat;
            const member = beat.speakerKey ? doc.cast.find(item => item.key === beat.speakerKey) : undefined;
            const speaker = beat.speakerName
                ? interpolateStoryText(beat.speakerName, doc, vars)
                : (member?.name ?? "");
            const body = interpolateStoryText(beat.body, doc, vars);
            const onStage = Boolean(beat.speakerKey && stage.actors.some(a => a.cast === beat.speakerKey));

            const reactionByKey = new Map<string, { motion?: string; facial?: string }>();
            if (beat.speakerKey && (beat.motion || beat.facial)) {
                reactionByKey.set(beat.speakerKey, { motion: beat.motion, facial: beat.facial });
            }
            for (const reaction of beat.reactions ?? []) {
                if (reaction.motion || reaction.facial) {
                    const prev = reactionByKey.get(reaction.castKey);
                    reactionByKey.set(reaction.castKey, {
                        motion: reaction.motion ?? prev?.motion,
                        facial: reaction.facial ?? prev?.facial,
                    });
                }
            }

            const actors = reactionByKey.size === 0
                ? stage.actors
                : stage.actors.map((actor) => {
                    const pose = reactionByKey.get(actor.cast);
                    if (!pose) return actor;
                    return {
                        ...actor,
                        motion: pose.motion ?? actor.motion,
                        facial: pose.facial ?? actor.facial,
                    };
                });

            return {
                stage: {
                    ...stage,
                    actors,
                    narration: null,
                    telop: null,
                    dialogue: {
                        stepId: beat.id,
                        cast: beat.speakerKey ?? null,
                        speaker,
                        body,
                    },
                    speaking: onStage ? (beat.speakerKey ?? null) : null,
                },
                variables: vars,
            };
        }
        case "narration":
            return {
                stage: {
                    ...stage,
                    dialogue: null,
                    telop: null,
                    speaking: null,
                    narration: {
                        stepId: inst.beat.id,
                        body: interpolateStoryText(inst.beat.body, doc, vars),
                    },
                },
                variables: vars,
            };
        case "telop":
            return {
                stage: {
                    ...stage,
                    dialogue: null,
                    narration: null,
                    speaking: null,
                    telop: {
                        stepId: inst.beat.id,
                        body: interpolateStoryText(inst.beat.text, doc, vars),
                    },
                },
                variables: vars,
            };
        case "stageAction": {
            const beat = inst.beat;
            const base: StoryStageState = { ...stage, telop: null, speaking: null };
            if (beat.action === "enter") {
                const slot = beat.slot ?? "center";
                const actor: StoryStageActorState = {
                    cast: beat.castKey,
                    slot,
                    x: SLOT_X[slot],
                    y: beat.y ?? 0,
                    scale: beat.scale ?? 1,
                    mirror: false,
                    motion: beat.motion ?? null,
                    facial: beat.facial ?? null,
                };
                return {
                    stage: { ...base, actors: [...stage.actors.filter(a => a.cast !== beat.castKey), actor] },
                    variables: vars,
                };
            }
            if (beat.action === "exit") {
                return {
                    stage: { ...base, actors: stage.actors.filter(a => a.cast !== beat.castKey) },
                    variables: vars,
                };
            }
            if (beat.action === "move") {
                return {
                    stage: {
                        ...base,
                        actors: stage.actors.map((actor) => {
                            if (actor.cast !== beat.castKey) return actor;
                            const nextSlot = beat.slot ?? actor.slot;
                            return {
                                ...actor,
                                slot: nextSlot,
                                x: SLOT_X[nextSlot],
                                scale: beat.scale ?? actor.scale,
                                y: beat.y ?? actor.y,
                                motion: beat.motion ?? actor.motion,
                                facial: beat.facial ?? actor.facial,
                            };
                        }),
                    },
                    variables: vars,
                };
            }
            return {
                stage: {
                    ...base,
                    actors: stage.actors.map((actor) => {
                        if (actor.cast !== beat.castKey) return actor;
                        return {
                            ...actor,
                            motion: beat.motion ?? actor.motion,
                            facial: beat.facial ?? actor.facial,
                        };
                    }),
                },
                variables: vars,
            };
        }
        case "varOp":
            return {
                stage: { ...stage, telop: null, speaking: null },
                variables: applyVarOps(inst.ops, vars, doc),
            };
        case "choice":
            return {
                stage: { ...stage, telop: null, speaking: null },
                variables: vars,
            };
        case "end":
            return {
                stage: { ...stage, dialogue: null, narration: null, telop: null, speaking: null },
                variables: vars,
            };
        case "cue":
            return { stage: { ...stage, telop: null, speaking: null }, variables: vars };
        case "condition":
        case "jump":
        case "halt":
            return { stage, variables: vars };
    }
}

/**
 * Compiler-driven deterministic player for `moesekai-story/2` graph documents with a CapCut / NLE
 * single-screen 3-pane Director Workspace (Assets / Live Phase & Variables / Backlog · Persistent
 * 16:9 Live2D Stage · Full-Width Live Flow Monitor), plus Theater, Native Fullscreen, and Immersive modes.
 */
export function StoryPlayerView({
    doc,
    line,
    assetSource,
    startNodeId = null,
    layoutMode,
    onLayoutModeChange,
    immersive = false,
    endAction,
}: StoryPlayerViewProps) {
    const { t } = useI18n();
    const reduced = useReducedMotion();
    const workspaceRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const preloadSource = assetSource ?? line;

    const [internalLayoutMode, setInternalLayoutMode] = useState<PlayerLayoutMode>("workspace");
    const effectiveLayoutMode = layoutMode ?? internalLayoutMode;
    const setEffectiveLayoutMode = useCallback((next: PlayerLayoutMode) => {
        if (onLayoutModeChange) {
            onLayoutModeChange(next);
        } else {
            setInternalLayoutMode(next);
        }
    }, [onLayoutModeChange]);

    const topSplitPct = useSyncExternalStore(
        subscribeTopSplitPct,
        readTopSplitPct,
        () => DEFAULT_TOP_SPLIT_PCT,
    );
    const draggingSplitRef = useRef(false);

    const program = useMemo(() => compileStoryGraph(doc), [doc]);
    const hasCompileErrors = program.errors.length > 0;

    const { models } = useStoryModels(doc.region);
    const modelsRef = useRef(models);
    useEffect(() => {
        modelsRef.current = models;
    }, [models]);

    const { kit: uiKit, status: uiKitStatus } = useStoryUiKit(doc.region);
    const library = useMemo(() => live2dSources(doc.region).library, [doc.region]);
    const {
        hostRef: stageHostRef,
        phase: stagePhase,
        problems: stageProblems,
        loadingActors,
        apply: applyStage,
        setTalking: setStageTalking,
        shake: shakeStage,
        finish: finishStage,
        retry: retryStage,
    } = useStoryStage({ library, cast: doc.cast, models });

    const [volume, setVolume] = useState(0.8);
    const [muted, setMuted] = useState(false);
    const {
        syncBgm, playSe, playVoice, stopVoice, stopAll, unlock: unlockAudio, audioBlocked,
    } = useStoryAudio(volume, muted);

    const toggleMute = useCallback(() => {
        const nextMuted = !muted;
        setMuted(nextMuted);
        if (!nextMuted && volume > 0) unlockAudio(volume);
    }, [muted, unlockAudio, volume]);

    const handleVolumeChange = useCallback((next: number) => {
        setMuted(false);
        setVolume(next);
        if (next > 0) unlockAudio(next);
    }, [unlockAudio]);

    const assetManifest = useMemo(
        () => collectStoryAssets(doc, { assetSource: preloadSource, models }),
        [doc, preloadSource, models],
    );

    /** First SceneNode (and optional beat) referencing each asset, for click-to-jump in Media Bin. */
    const assetFirstTarget = useMemo(() => {
        const cast = new Map<string, AssetJumpTarget>();
        const background = new Map<string, AssetJumpTarget>();
        const bgm = new Map<string, AssetJumpTarget>();
        const se = new Map<string, AssetJumpTarget>();
        const voice = new Map<string, AssetJumpTarget>();

        const orderedIds = [
            ...program.reachableNodeIds,
            ...Object.keys(doc.nodes).filter(id => !program.reachableNodeIds.includes(id)),
        ];

        for (const nodeId of orderedIds) {
            const node = doc.nodes[nodeId];
            if (!node || node.type !== "scene") continue;

            if (node.background.mode === "set" && node.background.asset && !background.has(node.background.asset)) {
                background.set(node.background.asset, { nodeId });
            }
            if (node.bgm.mode === "play" && node.bgm.name && !bgm.has(node.bgm.name)) {
                bgm.set(node.bgm.name, { nodeId });
            }
            if (node.stageCast.mode === "set") {
                for (const actor of node.stageCast.actors) {
                    if (actor.castKey && !cast.has(actor.castKey)) {
                        cast.set(actor.castKey, { nodeId });
                    }
                }
            }

            for (const beat of node.beats) {
                switch (beat.kind) {
                    case "talk": {
                        if (beat.speakerKey && !cast.has(beat.speakerKey)) {
                            cast.set(beat.speakerKey, { nodeId, beatId: beat.id });
                        }
                        for (const reaction of beat.reactions ?? []) {
                            if (reaction.castKey && !cast.has(reaction.castKey)) {
                                cast.set(reaction.castKey, { nodeId, beatId: beat.id });
                            }
                        }
                        if (beat.se && !se.has(beat.se)) {
                            se.set(beat.se, { nodeId, beatId: beat.id });
                        }
                        if (beat.voice && beat.voice.scenarioId && beat.voice.voiceId) {
                            const key = voiceDedupeKey(beat.voice, doc.region);
                            if (!voice.has(key)) {
                                voice.set(key, { nodeId, beatId: beat.id });
                            }
                        }
                        break;
                    }
                    case "narration":
                        if (beat.se && !se.has(beat.se)) {
                            se.set(beat.se, { nodeId, beatId: beat.id });
                        }
                        break;
                    case "stageAction":
                        if (beat.castKey && !cast.has(beat.castKey)) {
                            cast.set(beat.castKey, { nodeId, beatId: beat.id });
                        }
                        break;
                    case "cue":
                        if (beat.cueType === "se" && beat.se && !se.has(beat.se)) {
                            se.set(beat.se, { nodeId, beatId: beat.id });
                        }
                        break;
                    default:
                        break;
                }
            }
        }

        return { cast, background, bgm, se, voice };
    }, [doc.nodes, doc.region, program.reachableNodeIds]);

    const [history, setHistory] = useState<PlayerHistoryItem[]>([]);
    const [stageState, setStageState] = useState<StoryStageState>(INITIAL_STAGE_STATE);
    const [liveVariables, setLiveVariables] = useState<StoryVarValues>(() => initVariables(doc));
    const [running, setRunning] = useState(false);
    const [effectActive, setEffectActive] = useState(false);
    const [autoPlay, setAutoPlay] = useState(false);
    const [uiHidden, setUiHidden] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [backlogOpen, setBacklogOpen] = useState(false);
    const [phaseOpen, setPhaseOpen] = useState(false);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(true);
    const [leftTab, setLeftTab] = useState<LeftPaneTab>("assets");
    const [drawerTab, setDrawerTab] = useState<LeftPaneTab>("phase");
    const [previewingAudioKey, setPreviewingAudioKey] = useState<string | null>(null);
    const [preloadOpen, setPreloadOpen] = useState(false);
    const [autoPreload, setAutoPreload] = useState(false);
    const [preloadRunning, setPreloadRunning] = useState(false);
    const [preloadProgress, setPreloadProgress] = useState<StoryPreloadProgress | null>(null);
    const [cacheReady, setCacheReady] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [fadeSeconds, setFadeSeconds] = useState<number>(STORY_FADE_SECONDS);
    const [flash, setFlash] = useState<{ key: number; color: StoryEffectColor; seconds: number } | null>(null);
    const [typedCount, setTypedCount] = useState(0);
    const [voicePending, setVoicePending] = useState(false);
    const [voiceProgress, setVoiceProgress] = useState<ActiveVoiceProgress | null>(null);

    const flashKeyRef = useRef(0);
    const playGenRef = useRef(0);
    const voiceTokenRef = useRef(0);
    const binPreviewTokenRef = useRef(0);
    const preloadAbortRef = useRef<AbortController | null>(null);
    const skipWaitRef = useRef<(() => void) | null>(null);
    const stageStateRef = useRef(stageState);
    const liveVariablesRef = useRef(liveVariables);
    const historyRef = useRef(history);

    useEffect(() => {
        stageStateRef.current = stageState;
    }, [stageState]);

    useEffect(() => {
        liveVariablesRef.current = liveVariables;
    }, [liveVariables]);

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    const stopBinPreview = useCallback(() => {
        binPreviewTokenRef.current += 1;
        previewStorySound(null);
        setPreviewingAudioKey(null);
    }, []);

    useEffect(() => () => {
        binPreviewTokenRef.current += 1;
        previewStorySound(null);
    }, []);

    const toggleBinAudioPreview = useCallback((audioKey: string, item: StoryPreloadAudioItem) => {
        if (previewingAudioKey === audioKey) {
            stopBinPreview();
            return;
        }
        const token = ++binPreviewTokenRef.current;
        setPreviewingAudioKey(audioKey);
        previewStorySound(item.urls, {
            volume: muted ? 0 : Math.max(0.15, volume),
            start: item.voice?.start,
            end: item.voice?.end,
            onEnd: () => {
                if (binPreviewTokenRef.current === token) {
                    setPreviewingAudioKey(null);
                }
            },
            onError: () => {
                if (binPreviewTokenRef.current === token) {
                    setPreviewingAudioKey(null);
                }
            },
        });
    }, [muted, previewingAudioKey, stopBinPreview, volume]);

    const stopActiveVoice = useCallback(() => {
        voiceTokenRef.current += 1;
        stopVoice();
        setVoicePending(false);
        setVoiceProgress(null);
    }, [stopVoice]);

    const startVoice = useCallback((
        urls: string[],
        meta: { label: string; start?: number; end?: number },
        generation: number,
        trackPending: boolean,
    ) => {
        if (urls.length === 0) return;
        const token = ++voiceTokenRef.current;
        if (trackPending) setVoicePending(true);
        setVoiceProgress({
            currentSec: meta.start ?? 0,
            durationSec: meta.end ?? 0,
            start: meta.start,
            end: meta.end,
            label: meta.label,
        });
        void playVoice(urls, {
            start: meta.start,
            end: meta.end,
            onProgress: (currentSec, durationSec) => {
                if (voiceTokenRef.current !== token) return;
                setVoiceProgress({
                    currentSec,
                    durationSec,
                    start: meta.start,
                    end: meta.end,
                    label: meta.label,
                });
            },
        }).finally(() => {
            if (voiceTokenRef.current === token) {
                setVoiceProgress(null);
            }
            if (trackPending && playGenRef.current === generation) {
                setVoicePending(false);
            }
        });
    }, [playVoice]);

    const cancelBackgroundPreload = useCallback(() => {
        preloadAbortRef.current?.abort();
        preloadAbortRef.current = null;
        setPreloadRunning(false);
    }, []);

    const handleAutoPreloadChange = useCallback((enabled: boolean) => {
        setAutoPreload(enabled);
        writeAutoPreloadPreference(enabled);
    }, []);

    const handlePreloadComplete = useCallback((progress: StoryPreloadProgress) => {
        setPreloadProgress(progress);
        if (progress.done && progress.failed === 0) {
            setCacheReady(true);
        }
    }, []);

    /** Inspect browser caches on mount and honor saved auto-preload preference without blocking playback. */
    useEffect(() => {
        const enabled = readAutoPreloadPreference();
        let cancelled = false;
        void inspectStoryCacheStatus(doc, { assetSource: preloadSource, models: modelsRef.current }).then((status) => {
            if (cancelled) return;
            setAutoPreload(enabled);
            setCacheReady(status.hasLocalCache);
        });
        if (!enabled) {
            return () => { cancelled = true; };
        }
        const controller = new AbortController();
        preloadAbortRef.current = controller;
        const timer = window.setTimeout(() => {
            if (cancelled || controller.signal.aborted || preloadAbortRef.current !== controller) return;
            setPreloadRunning(true);
            void preloadStoryAssets(doc, {
                assetSource: preloadSource,
                models: modelsRef.current,
                signal: controller.signal,
                onProgress: (next) => {
                    if (cancelled || preloadAbortRef.current !== controller) return;
                    setPreloadProgress(next);
                },
            }).then((finalProgress) => {
                if (cancelled || preloadAbortRef.current !== controller) return;
                preloadAbortRef.current = null;
                setPreloadProgress(finalProgress);
                setPreloadRunning(false);
                if (finalProgress.done && finalProgress.failed === 0) {
                    setCacheReady(true);
                }
            }).catch(() => {
                if (cancelled || preloadAbortRef.current !== controller) return;
                preloadAbortRef.current = null;
                setPreloadRunning(false);
            });
        }, 0);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            controller.abort();
            if (preloadAbortRef.current === controller) {
                preloadAbortRef.current = null;
            }
        };
    }, [doc, preloadSource]);

    const latestItem = history[history.length - 1] ?? null;
    const activeFrame = latestItem?.frame ?? null;
    const currentChoice = !running && activeFrame?.stoppedReason === "choice" ? activeFrame.pendingChoice : null;
    const fullDialogueBody = stageState.dialogue?.body ?? "";
    const isTyping = !reduced && fullDialogueBody.length > 0 && typedCount < fullDialogueBody.length;
    const displayedDialogue = stageState.dialogue
        ? (reduced ? fullDialogueBody : fullDialogueBody.slice(0, typedCount))
        : undefined;

    const waitMs = useCallback((ms: number, generation: number) => {
        if (ms <= 0 || reduced) return Promise.resolve();
        return new Promise<void>((resolve) => {
            const finish = () => {
                if (skipWaitRef.current === cancel) skipWaitRef.current = null;
                resolve();
            };
            const timer = window.setTimeout(finish, ms);
            const cancel = () => {
                window.clearTimeout(timer);
                finish();
            };
            if (playGenRef.current !== generation) {
                cancel();
                return;
            }
            skipWaitRef.current = cancel;
        });
    }, [reduced]);

    /** Executes one compiled `StoryRuntimeFrame`'s `executedInstructions` faithfully on top of `(baseStage, baseVars)`. */
    const executeFrame = useCallback(async (
        nextHistory: PlayerHistoryItem[],
        baseStage: StoryStageState,
        baseVars: StoryVarValues,
        frame: StoryRuntimeFrame,
        instant = false,
    ) => {
        const generation = ++playGenRef.current;
        skipWaitRef.current?.();
        stopActiveVoice();
        setStageTalking(null);
        setEffectActive(false);
        setHistory(nextHistory);

        if (instant || frame.executedInstructions.length === 0) {
            setStageState(frame.stage);
            setLiveVariables(frame.variables);
            setTypedCount(frame.stage.dialogue?.body.length ?? 0);
            setRunning(false);
            syncBgm(
                frame.stage.bgm.name ? storyBgmUrl(frame.stage.bgm.name, doc.region, line) : null,
                frame.stage.bgm.volume,
            );
            void applyStage(frame.stage, { instant: true });
            if (frame.stoppedReason !== "blocking") setAutoPlay(false);
            return;
        }

        setRunning(true);
        let stage = baseStage;
        let vars = baseVars;

        for (const inst of frame.executedInstructions) {
            if (playGenRef.current !== generation) return;
            const stepped = applyInstructionToStage(stage, vars, inst, doc);
            stage = stepped.stage;
            vars = stepped.variables;

            switch (inst.op) {
                case "enterScene": {
                    setStageState(stage);
                    syncBgm(
                        stage.bgm.name ? storyBgmUrl(stage.bgm.name, doc.region, line) : null,
                        stage.bgm.volume,
                    );
                    if (inst.transition.kind === "fadeBlack" || inst.transition.kind === "fadeWhite") {
                        const dur = Math.max(0.1, inst.transition.duration);
                        const color: StoryEffectColor = inst.transition.kind === "fadeWhite" ? "white" : "black";
                        setFadeSeconds(dur);
                        setEffectActive(true);
                        try {
                            flashKeyRef.current += 1;
                            setFlash({ key: flashKeyRef.current, color, seconds: dur });
                            await Promise.all([
                                applyStage(stage, { instant: false, fade: true }),
                                waitMs(dur * 1000 * 0.6, generation),
                            ]);
                        } finally {
                            if (playGenRef.current === generation) setEffectActive(false);
                        }
                    } else {
                        setFadeSeconds(0);
                        await applyStage(stage, { instant: false, fade: false });
                    }
                    break;
                }
                case "stageAction": {
                    setStageState(stage);
                    const beat = inst.beat;
                    await applyStage(stage, {
                        instant: false,
                        fade: beat.action === "enter" || beat.action === "exit",
                        moveSeconds: beat.action === "move" ? (beat.duration ?? STORY_FADE_SECONDS) : undefined,
                    });
                    break;
                }
                case "cue": {
                    const beat = inst.beat;
                    setStageState(stage);
                    if (beat.cueType === "se") {
                        if (beat.se) playSe(storySeCandidateUrls(beat.se, doc.region, line), beat.seVolume);
                    } else {
                        setEffectActive(true);
                        try {
                            if (beat.cueType === "flash") {
                                const dur = beat.duration ?? 0.4;
                                flashKeyRef.current += 1;
                                setFlash({ key: flashKeyRef.current, color: beat.color ?? "white", seconds: dur });
                                await waitMs(Math.min(dur, 1.5) * 1000, generation);
                            } else if (beat.cueType === "shake") {
                                await shakeStage(beat.duration ?? 0.4);
                            } else if (beat.cueType === "wait") {
                                await waitMs((beat.duration ?? 0.8) * 1000, generation);
                            }
                        } finally {
                            if (playGenRef.current === generation) setEffectActive(false);
                        }
                    }
                    break;
                }
                case "varOp": {
                    setLiveVariables(vars);
                    break;
                }
                case "talk": {
                    const beat = inst.beat;
                    setStageState(stage);
                    setLiveVariables(vars);
                    void applyStage(stage, { instant: false });
                    const body = stage.dialogue?.body ?? interpolateStoryText(beat.body, doc, vars);
                    setTypedCount(reduced ? body.length : 0);
                    if (beat.se) {
                        playSe(storySeCandidateUrls(beat.se, doc.region, line), beat.seVolume);
                    }
                    if (beat.voice && beat.voice.scenarioId && beat.voice.voiceId) {
                        const urls = storyVoiceCandidateUrls(beat.voice, doc.region, line);
                        startVoice(
                            urls,
                            { label: beat.voice.voiceId, start: beat.voice.start, end: beat.voice.end },
                            generation,
                            true,
                        );
                    }
                    break;
                }
                case "narration": {
                    const beat = inst.beat;
                    setStageState(stage);
                    void applyStage(stage, { instant: false });
                    if (beat.se) {
                        playSe(storySeCandidateUrls(beat.se, doc.region, line), beat.seVolume);
                    }
                    break;
                }
                case "telop":
                case "choice":
                case "end": {
                    setStageState(stage);
                    void applyStage(stage, { instant: false });
                    break;
                }
                case "condition":
                case "jump":
                case "halt":
                default:
                    break;
            }
        }

        if (playGenRef.current !== generation) return;
        setStageState(frame.stage);
        setLiveVariables(frame.variables);
        syncBgm(
            frame.stage.bgm.name ? storyBgmUrl(frame.stage.bgm.name, doc.region, line) : null,
            frame.stage.bgm.volume,
        );
        setEffectActive(false);
        setRunning(false);
        if (frame.stoppedReason !== "blocking") setAutoPlay(false);
    }, [applyStage, doc, line, playSe, reduced, setStageTalking, shakeStage, startVoice, stopActiveVoice, syncBgm, waitMs]);

    /** Starts or restarts playback from `targetNodeId` (defaults to `doc.startNodeId`). */
    const startPlaybackFrom = useCallback((targetNodeId?: string | null) => {
        voiceTokenRef.current += 1;
        stopBinPreview();
        stopAll();
        setVoicePending(false);
        setVoiceProgress(null);
        setEffectActive(false);
        setStageTalking(null);
        setAutoPlay(false);
        setUiHidden(false);
        setMenuOpen(false);

        if (program.errors.length > 0) {
            playGenRef.current += 1;
            setHistory([]);
            setStageState(INITIAL_STAGE_STATE);
            setLiveVariables(initVariables(doc));
            setRunning(false);
            return;
        }

        const resolvedNodeId = targetNodeId && program.nodeEntryPc[targetNodeId] !== undefined
            ? targetNodeId
            : doc.startNodeId;
        const initialFrame = createInitialRuntime(program, resolvedNodeId);
        const seed = resolvedNodeId !== doc.startNodeId
            ? evaluateStageAt(doc, resolvedNodeId)
            : { stage: INITIAL_STAGE_STATE, variables: initVariables(doc) };
        void executeFrame([{ frame: initialFrame }], seed.stage, seed.variables, initialFrame, false);
    }, [doc, executeFrame, program, setStageTalking, stopAll, stopBinPreview]);

    const restart = useCallback(() => {
        startPlaybackFrom(doc.startNodeId);
    }, [doc.startNodeId, startPlaybackFrom]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            startPlaybackFrom(startNodeId);
        }, 0);
        return () => {
            window.clearTimeout(timer);
            playGenRef.current += 1;
            voiceTokenRef.current += 1;
            skipWaitRef.current?.();
        };
    }, [startNodeId, startPlaybackFrom]);

    /** Re-sync actors when the Live2D stage becomes ready or the model list finishes loading. */
    useEffect(() => {
        if (stagePhase.kind !== "ready" || !models) return;
        void applyStage(stageStateRef.current, { instant: true });
    }, [applyStage, stagePhase.kind, models]);

    /** Typewriter timer for the active dialogue line. */
    useEffect(() => {
        if (running || reduced || !stageState.dialogue) return;
        const targetLength = stageState.dialogue.body.length;
        if (typedCount >= targetLength) return;
        const timer = window.setTimeout(() => {
            setTypedCount(count => Math.min(targetLength, count + 1));
        }, CHAR_INTERVAL_MS);
        return () => window.clearTimeout(timer);
    }, [running, reduced, stageState.dialogue, typedCount]);

    /** Drive Live2D lip-flap while the line is typing or voice audio is playing. */
    useEffect(() => {
        const activeSpeaker = stageState.speaking;
        const mouthMoving = Boolean(activeSpeaker) && !running && (isTyping || voicePending);
        setStageTalking(mouthMoving ? activeSpeaker : null);
    }, [setStageTalking, stageState.speaking, running, isTyping, voicePending]);

    /** Snap any in-progress frame execution immediately to the current frame's final state. */
    const snapCurrentFrame = useCallback(() => {
        const current = historyRef.current;
        const latest = current[current.length - 1];
        if (!latest) return;
        playGenRef.current += 1;
        skipWaitRef.current?.();
        stopActiveVoice();
        finishStage();
        const finalFrame = latest.frame;
        setStageState(finalFrame.stage);
        setLiveVariables(finalFrame.variables);
        setTypedCount(finalFrame.stage.dialogue?.body.length ?? 0);
        setEffectActive(false);
        setRunning(false);
        syncBgm(
            finalFrame.stage.bgm.name ? storyBgmUrl(finalFrame.stage.bgm.name, doc.region, line) : null,
            finalFrame.stage.bgm.volume,
        );
        void applyStage(finalFrame.stage, { instant: true });
    }, [applyStage, doc.region, finishStage, line, stopActiveVoice, syncBgm]);

    /** Advance one blocking beat (or complete typing / snap running transitions first). */
    const handleAdvance = useCallback(() => {
        unlockAudio();
        if (menuOpen) {
            setMenuOpen(false);
            return;
        }
        if (uiHidden) {
            setUiHidden(false);
            return;
        }
        if (hasCompileErrors) return;
        if (running) {
            snapCurrentFrame();
            return;
        }
        if (isTyping) {
            setTypedCount(fullDialogueBody.length);
            return;
        }
        const current = historyRef.current;
        const latest = current[current.length - 1];
        if (!latest || latest.frame.stoppedReason !== "blocking") return;
        const nextFrame = advanceRuntime(program, latest.frame);
        if (nextFrame === latest.frame) return;
        void executeFrame(
            [...current, { frame: nextFrame }],
            stageStateRef.current,
            liveVariablesRef.current,
            nextFrame,
            false,
        );
    }, [
        executeFrame, fullDialogueBody.length, hasCompileErrors, isTyping, menuOpen,
        program, running, snapCurrentFrame, uiHidden, unlockAudio,
    ]);

    /** Pick an available choice option (runtime automatically applies option `effects` and jumps). */
    const handleChoose = useCallback((optionId: string, optionText: string) => {
        unlockAudio();
        if (hasCompileErrors) return;
        const current = historyRef.current;
        const latest = current[current.length - 1];
        if (!latest || latest.frame.stoppedReason !== "choice") return;
        const matched = latest.frame.pendingChoice?.options.find(opt => opt.id === optionId);
        if (!matched || !matched.available) return;
        const annotated = current.map((item, idx) => (
            idx === current.length - 1 ? { ...item, chosenText: optionText } : item
        ));
        const nextFrame = advanceRuntime(program, latest.frame, optionId);
        if (nextFrame === latest.frame) return;
        void executeFrame(
            [...annotated, { frame: nextFrame }],
            stageStateRef.current,
            liveVariablesRef.current,
            nextFrame,
            false,
        );
    }, [executeFrame, hasCompileErrors, program, unlockAudio]);

    /** Step cleanly back one frame with exact restored variables, stage state, and branch trace. */
    const handlePrevious = useCallback(() => {
        const current = historyRef.current;
        if (current.length <= 1) return;
        playGenRef.current += 1;
        skipWaitRef.current?.();
        stopActiveVoice();
        setStageTalking(null);
        setAutoPlay(false);
        setEffectActive(false);
        setRunning(false);

        const nextHistory = current.slice(0, -1).map((item, idx, arr) => (
            idx === arr.length - 1 ? { ...item, chosenText: undefined } : item
        ));
        const prevFrame = nextHistory[nextHistory.length - 1].frame;
        setHistory(nextHistory);
        setStageState(prevFrame.stage);
        setLiveVariables(prevFrame.variables);
        setTypedCount(prevFrame.stage.dialogue?.body.length ?? 0);
        syncBgm(
            prevFrame.stage.bgm.name ? storyBgmUrl(prevFrame.stage.bgm.name, doc.region, line) : null,
            prevFrame.stage.bgm.volume,
        );
        void applyStage(prevFrame.stage, { instant: true });
    }, [applyStage, doc.region, line, setStageTalking, stopActiveVoice, syncBgm]);

    /** Jumps runtime directly to any graph node (reconstructing inherited state & variables). */
    const handleJumpToNode = useCallback((nodeId: string) => {
        if (hasCompileErrors || program.nodeEntryPc[nodeId] === undefined) return;
        stopBinPreview();
        setAutoPlay(false);
        setMenuOpen(false);
        const frame = createInitialRuntime(program, nodeId);
        void executeFrame([{ frame }], frame.stage, frame.variables, frame, true);
    }, [executeFrame, hasCompileErrors, program, stopBinPreview]);

    /** Jumps runtime directly to a specific `(nodeId, beatId)` inside a scene, preserving intra-scene history. */
    const handleJumpToBeat = useCallback((nodeId: string, beatId: string) => {
        if (hasCompileErrors || program.nodeEntryPc[nodeId] === undefined) return;
        stopBinPreview();
        setAutoPlay(false);
        setMenuOpen(false);

        let cur = createInitialRuntime(program, nodeId);
        const frames: PlayerHistoryItem[] = [{ frame: cur }];
        const maxSteps = STORY_LIMITS.beatsPerScene + 4;

        for (let step = 0; step < maxSteps; step += 1) {
            const hitInBatch = cur.beatId === beatId
                || cur.executedInstructions.some(inst => "beatId" in inst && inst.beatId === beatId);
            if (hitInBatch) break;
            if (cur.stoppedReason !== "blocking" || cur.nodeId !== nodeId) break;
            const next = advanceRuntime(program, cur);
            if (next === cur) break;
            const nextHasBeat = next.beatId === beatId
                || next.executedInstructions.some(inst => "beatId" in inst && inst.beatId === beatId);
            if (next.nodeId !== nodeId && !nextHasBeat) break;
            cur = next;
            frames.push({ frame: cur });
        }

        void executeFrame(frames, cur.stage, cur.variables, cur, true);
    }, [executeFrame, hasCompileErrors, program, stopBinPreview]);

    /** AUTO-advance timer. */
    useEffect(() => {
        if (
            !autoPlay || hasCompileErrors || running || isTyping || voicePending
            || backlogOpen || menuOpen || preloadOpen || currentChoice
        ) {
            return;
        }
        if (!activeFrame || activeFrame.stoppedReason !== "blocking") return;
        const bodyLen = stageState.dialogue?.body.length
            ?? stageState.narration?.body.length
            ?? stageState.telop?.body.length
            ?? 0;
        const delay = Math.max(1200, Math.min(4500, bodyLen * 60 + 800));
        const timer = window.setTimeout(() => {
            handleAdvance();
        }, delay);
        return () => window.clearTimeout(timer);
    }, [
        activeFrame, autoPlay, backlogOpen, currentChoice, handleAdvance, hasCompileErrors,
        isTyping, menuOpen, preloadOpen, running, stageState, voicePending,
    ]);

    /** Keyboard shortcuts: Space/Enter/ArrowRight advance, ArrowLeft prev, 1-4 available choices, Escape closes menu/UI hide. */
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (backlogOpen || preloadOpen) return;
            const target = event.target as HTMLElement | null;
            if (
                target
                && (
                    target.tagName === "INPUT"
                    || target.tagName === "TEXTAREA"
                    || target.tagName === "SELECT"
                    || target.isContentEditable
                    || target.getAttribute("role") === "separator"
                )
            ) {
                return;
            }
            if (event.key === "Escape") {
                if (menuOpen) {
                    event.preventDefault();
                    setMenuOpen(false);
                    return;
                }
                if (uiHidden) {
                    event.preventDefault();
                    setUiHidden(false);
                    return;
                }
            }
            if (menuOpen || hasCompileErrors) return;
            if (event.key === " " || event.key === "Enter") {
                if (target?.tagName === "BUTTON") return;
                event.preventDefault();
                handleAdvance();
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                handleAdvance();
            } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                handlePrevious();
            } else if (currentChoice && /^[1-4]$/.test(event.key)) {
                const option = currentChoice.options[Number(event.key) - 1];
                if (option && option.available) {
                    event.preventDefault();
                    if (uiKit?.decideSoundUrl) playSe(uiKit.decideSoundUrl);
                    handleChoose(option.id, option.text || t("page.storyMaker.player.emptyOption"));
                }
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [
        backlogOpen, currentChoice, handleAdvance, handleChoose, handlePrevious, hasCompileErrors,
        menuOpen, playSe, preloadOpen, t, uiHidden, uiKit?.decideSoundUrl,
    ]);

    /** Track native fullscreen state. */
    useEffect(() => {
        const sync = () => setFullscreen(document.fullscreenElement === containerRef.current);
        document.addEventListener("fullscreenchange", sync);
        return () => document.removeEventListener("fullscreenchange", sync);
    }, []);

    const toggleFullscreen = () => {
        const el = containerRef.current;
        if (!el) return;
        if (document.fullscreenElement === el) {
            void document.exitFullscreen?.().catch(() => undefined);
        } else {
            void el.requestFullscreen?.().catch(() => undefined);
        }
    };

    const handleSplitterPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        draggingSplitRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleSplitterPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!draggingSplitRef.current || !workspaceRef.current) return;
        const rect = workspaceRef.current.getBoundingClientRect();
        if (rect.height <= 0) return;
        const pct = ((event.clientY - rect.top) / rect.height) * 100;
        writeTopSplitPct(pct);
    };

    const handleSplitterPointerEnd = () => {
        draggingSplitRef.current = false;
    };

    const handleSplitterKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            writeTopSplitPct(topSplitPct - 4);
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            writeTopSplitPct(topSplitPct + 4);
        } else if (event.key === "Home") {
            event.preventDefault();
            writeTopSplitPct(MIN_TOP_SPLIT_PCT);
        } else if (event.key === "End") {
            event.preventDefault();
            writeTopSplitPct(MAX_TOP_SPLIT_PCT);
        }
    };

    const backlogEntries = useMemo<BacklogEntry[]>(() => {
        const items: BacklogEntry[] = [];
        history.forEach((entry, frameIndex) => {
            const { frame } = entry;
            frame.executedInstructions.forEach((inst, instIdx) => {
                if (inst.op === "talk") {
                    const beat = inst.beat;
                    const member = beat.speakerKey ? doc.cast.find(item => item.key === beat.speakerKey) : undefined;
                    const speaker = frame.stage.dialogue?.stepId === beat.id
                        ? frame.stage.dialogue.speaker
                        : beat.speakerName
                            ? interpolateStoryText(beat.speakerName, doc, frame.variables)
                            : (member?.name ?? "");
                    const body = frame.stage.dialogue?.stepId === beat.id
                        ? frame.stage.dialogue.body
                        : interpolateStoryText(beat.body, doc, frame.variables);
                    const hasVoice = Boolean(beat.voice && beat.voice.scenarioId && beat.voice.voiceId);
                    const voiceUrls = hasVoice && beat.voice
                        ? storyVoiceCandidateUrls(beat.voice, doc.region, line)
                        : [];
                    items.push({
                        key: `${frameIndex}-${instIdx}-${beat.id}`,
                        kind: "talk",
                        speaker,
                        body,
                        voiceUrls: voiceUrls.length > 0 ? voiceUrls : undefined,
                        voiceStart: beat.voice?.start,
                        voiceEnd: beat.voice?.end,
                        voiceLabel: beat.voice?.voiceId,
                    });
                } else if (inst.op === "narration") {
                    const body = frame.stage.narration?.stepId === inst.beat.id
                        ? frame.stage.narration.body
                        : interpolateStoryText(inst.beat.body, doc, frame.variables);
                    items.push({
                        key: `${frameIndex}-${instIdx}-${inst.beat.id}`,
                        kind: "narration",
                        body,
                    });
                } else if (inst.op === "telop") {
                    const body = frame.stage.telop?.stepId === inst.beat.id
                        ? frame.stage.telop.body
                        : interpolateStoryText(inst.beat.text, doc, frame.variables);
                    items.push({
                        key: `${frameIndex}-${instIdx}-${inst.beat.id}`,
                        kind: "telop",
                        body,
                    });
                }
            });
            if (entry.chosenText) {
                items.push({ key: `${frameIndex}-choice`, kind: "choice", body: entry.chosenText });
            }
        });
        return items;
    }, [doc, history, line]);

    const activeNode = activeFrame?.nodeId ? doc.nodes[activeFrame.nodeId] ?? null : null;
    const activeNodeLabel = activeNode ? getNodeDisplayLabel(activeNode, t) : null;
    const activeBeatProgress = useMemo(() => {
        if (!activeNode || activeNode.type !== "scene" || !activeFrame?.beatId) return null;
        const idx = activeNode.beats.findIndex(b => b.id === activeFrame.beatId);
        if (idx < 0) return null;
        return { current: idx + 1, total: activeNode.beats.length };
    }, [activeFrame?.beatId, activeNode]);

    const activeCastKeys = useMemo(
        () => new Set(stageState.actors.map(actor => actor.cast)),
        [stageState.actors],
    );

    const displayState: StoryStageState = uiHidden
        ? { ...stageState, place: null, dialogue: null, narration: null, telop: null }
        : stageState;

    const stoppedReason = activeFrame?.stoppedReason ?? null;
    const reachedEnding = !running && !hasCompileErrors && stoppedReason === "end" && Boolean(activeFrame?.ending);
    const looped = !running && !hasCompileErrors && stoppedReason === "loop";
    const disconnected = !running && !hasCompileErrors && stoppedReason === "disconnected";
    const ended = reachedEnding || looped || disconnected;
    const hasAnyPlayableContent = useMemo(
        () => Object.values(doc.nodes).some(node => node.type !== "start"),
        [doc.nodes],
    );
    const emptyStory = !hasCompileErrors && !hasAnyPlayableContent;

    const isNleWorkspace = effectiveLayoutMode === "workspace" && !fullscreen;
    const runtimePhase: StoryRuntimePhase = hasCompileErrors || ended || emptyStory
        ? "ended"
        : currentChoice
            ? "choice"
            : effectActive
                ? "effect"
                : isTyping
                    ? "typing"
                    : voicePending
                        ? "voice"
                        : running
                            ? "effect"
                            : autoPlay
                                ? "auto"
                                : "waiting";
    const phaseMeta = PHASE_META[runtimePhase];
    const isPreloadReady = !preloadRunning && (cacheReady || Boolean(preloadProgress?.done && preloadProgress.failed === 0));
    const showEndSign = !uiHidden && !running && !isTyping && !autoPlay && !currentChoice && Boolean(stageState.dialogue);
    const uiKitLabel = uiKitStatus === "ready"
        ? t("page.storyMaker.player.uiKitGame")
        : uiKitStatus === "loading"
            ? t("page.storyMaker.player.uiKitLoading")
            : t("page.storyMaker.player.uiKitFallback");
    const quickMenuTransition = reduced ? reducedMotionFade : md3EffectsFast;
    const audioItems = useMemo<StoryPreloadAudioItem[]>(
        () => [...assetManifest.bgm, ...assetManifest.se, ...assetManifest.voices],
        [assetManifest.bgm, assetManifest.se, assetManifest.voices],
    );

    const handlePhaseButtonClick = () => {
        if (fullscreen) {
            void document.exitFullscreen?.().catch(() => undefined);
            setDrawerTab("phase");
            if (effectiveLayoutMode === "workspace") {
                setLeftTab("phase");
                setMobileDrawerOpen(true);
            } else {
                setPhaseOpen(true);
            }
            return;
        }
        if (effectiveLayoutMode === "workspace") {
            setLeftTab("phase");
            setDrawerTab("phase");
            setMobileDrawerOpen(open => !open);
            return;
        }
        setDrawerTab("phase");
        setPhaseOpen(open => !open);
    };

    const leftPaneTabs = useMemo(() => ([
        { value: "assets" as const, label: t("page.storyMaker.nle.tabAssets"), icon: mdInventory2 },
        { value: "phase" as const, label: t("page.storyMaker.nle.tabPhase"), icon: mdMonitoring },
        { value: "backlog" as const, label: t("page.storyMaker.nle.tabBacklog"), icon: mdHistory },
    ]), [t]);

    const stackedDrawerTabs = useMemo(() => ([
        { value: "phase" as const, label: t("page.storyMaker.nle.tabPhase"), icon: mdMonitoring },
        { value: "assets" as const, label: t("page.storyMaker.nle.tabAssets"), icon: mdInventory2 },
        { value: "backlog" as const, label: t("page.storyMaker.nle.tabBacklog"), icon: mdHistory },
    ]), [t]);

    const jumpToAssetTarget = useCallback((target: AssetJumpTarget | undefined) => {
        if (!target) return;
        if (target.beatId) {
            handleJumpToBeat(target.nodeId, target.beatId);
        } else {
            handleJumpToNode(target.nodeId);
        }
    }, [handleJumpToBeat, handleJumpToNode]);

    const renderBacklogList = () => (
        backlogEntries.length === 0 ? (
            <p className="py-8 text-center type-body-m text-on-surface-variant">
                {t("page.storyMaker.player.backlogEmpty")}
            </p>
        ) : (
            <ol className="min-w-0 space-y-2.5">
                {backlogEntries.map(entry => (
                    <li key={entry.key} className="min-w-0 rounded-md3-md bg-surface-container p-2.5">
                        <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                            <span className="min-w-0 truncate type-label-l text-primary">
                                {entry.kind === "talk"
                                    ? entry.speaker || "?"
                                    : entry.kind === "narration"
                                        ? t("page.storyMaker.v2.beats.narration")
                                        : entry.kind === "telop"
                                            ? t("page.storyMaker.v2.beats.telop")
                                            : t("page.storyMaker.player.chosenOption")}
                            </span>
                            {entry.voiceUrls && entry.voiceUrls.length > 0 && (
                                <IconButton
                                    size="xs"
                                    icon={mdPlayArrowFill}
                                    label={t("page.storyMaker.player.replayVoice")}
                                    onClick={() => startVoice(
                                        entry.voiceUrls!,
                                        {
                                            label: entry.voiceLabel ?? "",
                                            start: entry.voiceStart,
                                            end: entry.voiceEnd,
                                        },
                                        playGenRef.current,
                                        false,
                                    )}
                                />
                            )}
                        </div>
                        <p className="whitespace-pre-wrap break-words type-body-m text-on-surface">{entry.body}</p>
                    </li>
                ))}
            </ol>
        )
    );

    const renderMediaBin = () => (
        <div className="min-w-0 space-y-4">
            {/* Preload quick banner */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md3-md border border-outline-variant/50 bg-surface-container px-2.5 py-2">
                <div className="flex min-w-0 items-center gap-2">
                    {preloadRunning ? (
                        <LoadingIndicator size={16} className="shrink-0" />
                    ) : (
                        <Icon
                            path={isPreloadReady ? mdCloudDone : mdDownload}
                            size={18}
                            className={cn("shrink-0", isPreloadReady ? "text-primary" : "text-on-surface-variant")}
                        />
                    )}
                    <span className="min-w-0 truncate type-label-m text-on-surface">
                        {preloadRunning
                            ? t("page.storyMaker.preload.summaryProgress", {
                                completed: preloadProgress?.completed ?? 0,
                                total: preloadProgress?.total ?? 0,
                            })
                            : isPreloadReady
                                ? t("page.storyMaker.preload.readyBadge")
                                : t("page.storyMaker.preload.buttonLabel")}
                    </span>
                </div>
                <Button
                    size="xs"
                    variant={isPreloadReady ? "tonal" : "filled"}
                    icon={isPreloadReady ? mdCloudDone : mdDownload}
                    onClick={() => setPreloadOpen(true)}
                >
                    {t("page.storyMaker.preload.buttonLabel")}
                </Button>
            </div>

            {/* Cast / Live2D Group */}
            <section className="min-w-0 space-y-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 type-label-l text-on-surface">
                        <Icon path={mdPerson} size={16} className="shrink-0 text-primary" />
                        <span className="truncate">{t("page.storyMaker.nle.binCastGroup")}</span>
                    </span>
                    <span className="shrink-0 font-mono type-label-s tabular-nums text-on-surface-variant">
                        {doc.cast.length}
                    </span>
                </div>

                {doc.cast.length === 0 ? (
                    <p className="rounded-md3-md bg-surface-container/60 px-2.5 py-2 type-body-s text-on-surface-variant">
                        {t("page.storyMaker.nle.binEmpty")}
                    </p>
                ) : (
                    <ul className="min-w-0 space-y-1.5">
                        {doc.cast.map((member) => {
                            const inUse = activeCastKeys.has(member.key);
                            const target = assetFirstTarget.cast.get(member.key);
                            const clickable = Boolean(target) && !hasCompileErrors;
                            return (
                                <li key={member.key} className="min-w-0">
                                    <button
                                        type="button"
                                        disabled={!clickable}
                                        title={clickable ? t("page.storyMaker.nle.jumpToUse") : undefined}
                                        onClick={() => jumpToAssetTarget(target)}
                                        className={cn(
                                            "state-layer focus-ring flex w-full min-w-0 items-center gap-2 rounded-md3-md border p-2 text-left transition-colors",
                                            inUse
                                                ? "border-primary/60 bg-primary-container/30"
                                                : "border-outline-variant/50 bg-surface-container",
                                            !clickable && "cursor-default opacity-75",
                                        )}
                                    >
                                        {member.characterId ? (
                                            <img
                                                src={getCharacterIconUrl(member.characterId)}
                                                alt=""
                                                className="size-8 shrink-0 rounded-full border border-outline-variant/50 bg-surface-container-highest object-cover"
                                            />
                                        ) : (
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary-container type-label-l text-on-secondary-container">
                                                {(member.name || member.key).slice(0, 1)}
                                            </span>
                                        )}
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate type-label-l text-on-surface">
                                                {member.name || member.key}
                                            </span>
                                            <span className="block truncate font-mono type-label-s text-on-surface-variant">
                                                {member.modelId}
                                            </span>
                                        </span>
                                        {inUse && (
                                            <span className="shrink-0 rounded-full bg-primary-container px-2 py-0.5 type-label-s text-on-primary-container">
                                                {t("page.storyMaker.nle.assetInUse")}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {/* Backgrounds Group */}
            <section className="min-w-0 space-y-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 type-label-l text-on-surface">
                        <Icon path={mdImage} size={16} className="shrink-0 text-primary" />
                        <span className="truncate">{t("page.storyMaker.nle.binBgGroup")}</span>
                    </span>
                    <span className="shrink-0 font-mono type-label-s tabular-nums text-on-surface-variant">
                        {assetManifest.backgrounds.length}
                    </span>
                </div>

                {assetManifest.backgrounds.length === 0 ? (
                    <p className="rounded-md3-md bg-surface-container/60 px-2.5 py-2 type-body-s text-on-surface-variant">
                        {t("page.storyMaker.nle.binEmpty")}
                    </p>
                ) : (
                    <div className="grid min-w-0 grid-cols-2 gap-2">
                        {assetManifest.backgrounds.map((bg) => {
                            const inUse = stageState.background === bg.name;
                            const target = assetFirstTarget.background.get(bg.name);
                            const clickable = Boolean(target) && !hasCompileErrors;
                            return (
                                <button
                                    key={bg.url}
                                    type="button"
                                    disabled={!clickable}
                                    title={clickable ? t("page.storyMaker.nle.jumpToUse") : bg.name}
                                    onClick={() => jumpToAssetTarget(target)}
                                    className={cn(
                                        "state-layer focus-ring group relative flex min-w-0 flex-col overflow-hidden rounded-md3-md border text-left transition-colors",
                                        inUse
                                            ? "border-primary bg-primary-container/20 ring-2 ring-primary/40"
                                            : "border-outline-variant/50 bg-surface-container",
                                        !clickable && "cursor-default opacity-75",
                                    )}
                                >
                                    <div className="relative aspect-video w-full overflow-hidden bg-surface-container-highest">
                                        <img
                                            src={bg.url}
                                            crossOrigin="anonymous"
                                            alt=""
                                            loading="lazy"
                                            className="size-full object-cover"
                                        />
                                        {inUse && (
                                            <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 type-label-s text-on-primary shadow-elev-1">
                                                {t("page.storyMaker.nle.assetInUse")}
                                            </span>
                                        )}
                                    </div>
                                    <span className="min-w-0 truncate px-2 py-1 font-mono type-label-s text-on-surface">
                                        {bg.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Audio Group (BGM, SE, Voices) */}
            <section className="min-w-0 space-y-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 type-label-l text-on-surface">
                        <Icon path={mdMusicNote} size={16} className="shrink-0 text-primary" />
                        <span className="truncate">{t("page.storyMaker.nle.binAudioGroup")}</span>
                    </span>
                    <span className="shrink-0 font-mono type-label-s tabular-nums text-on-surface-variant">
                        {audioItems.length}
                    </span>
                </div>

                {audioItems.length === 0 ? (
                    <p className="rounded-md3-md bg-surface-container/60 px-2.5 py-2 type-body-s text-on-surface-variant">
                        {t("page.storyMaker.nle.binEmpty")}
                    </p>
                ) : (
                    <ul className="min-w-0 space-y-1.5">
                        {audioItems.map((item) => {
                            const audioKey = item.voice
                                ? `voice:${voiceDedupeKey(item.voice, doc.region)}`
                                : `${item.kind}:${item.label}`;
                            const isPreviewing = previewingAudioKey === audioKey;
                            const inUse = (item.kind === "bgm" && stageState.bgm.name === item.label)
                                || (item.kind === "voice" && voiceProgress?.label === item.label);
                            const target = item.kind === "bgm"
                                ? assetFirstTarget.bgm.get(item.label)
                                : item.kind === "se"
                                    ? assetFirstTarget.se.get(item.label)
                                    : item.voice
                                        ? assetFirstTarget.voice.get(voiceDedupeKey(item.voice, doc.region))
                                        : undefined;
                            const clickable = Boolean(target) && !hasCompileErrors;
                            const hasTrimEnd = Boolean(item.voice && item.voice.end !== undefined);
                            const crossRegion = item.voice?.region && item.voice.region !== doc.region
                                ? item.voice.region
                                : null;
                            const kindLabel = item.kind === "bgm"
                                ? t("page.storyMaker.op.bgm")
                                : item.kind === "se"
                                    ? t("page.storyMaker.op.se")
                                    : t("page.storyMaker.phase.activeVoice");

                            return (
                                <li
                                    key={audioKey}
                                    className={cn(
                                        "flex min-w-0 items-center gap-1.5 rounded-md3-md border p-1.5 transition-colors",
                                        inUse
                                            ? "border-primary/60 bg-primary-container/30"
                                            : "border-outline-variant/50 bg-surface-container",
                                    )}
                                >
                                    <IconButton
                                        size="xs"
                                        variant={isPreviewing ? "filled" : "tonal"}
                                        icon={isPreviewing ? mdStopFill : mdPlayArrowFill}
                                        label={t(isPreviewing ? "page.storyMaker.inspector.stopPreview" : "page.storyMaker.inspector.previewAudio")}
                                        onClick={() => toggleBinAudioPreview(audioKey, item)}
                                    />
                                    <button
                                        type="button"
                                        disabled={!clickable}
                                        title={clickable ? t("page.storyMaker.nle.jumpToUse") : item.label}
                                        onClick={() => jumpToAssetTarget(target)}
                                        className={cn(
                                            "focus-ring flex min-w-0 flex-1 flex-col rounded-md3-xs px-1 py-0.5 text-left",
                                            clickable ? "cursor-pointer hover:text-primary" : "cursor-default",
                                        )}
                                    >
                                        <span className="flex min-w-0 flex-wrap items-center gap-1">
                                            <span className="shrink-0 rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 type-label-s text-on-surface-variant">
                                                {kindLabel}
                                            </span>
                                            {inUse && (
                                                <span className="shrink-0 rounded-full bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">
                                                    {t("page.storyMaker.nle.assetInUse")}
                                                </span>
                                            )}
                                            {crossRegion && (
                                                <span
                                                    className="shrink-0 rounded-md3-xs bg-secondary-container px-1.5 py-0.5 type-label-s text-on-secondary-container"
                                                    title={t("page.storyMaker.nle.crossServerVoiceNotice", {
                                                        server: t(SERVER_LABEL_KEYS[crossRegion]),
                                                    })}
                                                >
                                                    {t(SERVER_LABEL_KEYS[crossRegion])}
                                                </span>
                                            )}
                                            {hasTrimEnd && item.voice && (
                                                <span className="shrink-0 rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 font-mono type-label-s text-on-tertiary-container">
                                                    {t("page.storyMaker.phase.trimmedRange", {
                                                        start: formatSec(item.voice.start ?? 0),
                                                        end: formatSec(item.voice.end!),
                                                    })}
                                                </span>
                                            )}
                                        </span>
                                        <span className="mt-0.5 block truncate font-mono type-label-m text-on-surface">
                                            {item.label}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );

    const showStackedDrawer = !fullscreen && (effectiveLayoutMode === "theater" ? phaseOpen : mobileDrawerOpen);
    const isImmersiveTheaterFill = immersive && !isNleWorkspace && !fullscreen && !phaseOpen;
    const stageClickBlocked = Boolean(currentChoice) || ended || emptyStory || hasCompileErrors || menuOpen;

    return (
        <div
            className={cn(
                "min-w-0 max-w-full",
                immersive ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2.5",
            )}
        >
            {!onLayoutModeChange && (
                <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2">
                    <SegmentedButton<PlayerLayoutMode>
                        density={-1}
                        value={effectiveLayoutMode}
                        onValueChange={setEffectiveLayoutMode}
                        aria-label={t("page.storyMaker.nle.layoutWorkspace")}
                        className="w-auto max-w-full"
                        options={[
                            { value: "workspace", label: t("page.storyMaker.nle.layoutWorkspace"), icon: mdDashboard },
                            { value: "theater", label: t("page.storyMaker.nle.layoutTheater"), icon: mdTheaters },
                        ]}
                    />
                </div>
            )}

            {stagePhase.kind === "unavailable" && (
                <Banner tone="info" title={t("page.storyMaker.engine.unavailable")}>
                    {t("page.storyMaker.engine.unavailableBanner")}
                </Banner>
            )}
            {stagePhase.kind === "unsupported" && (
                <Banner tone="warning" title={t("page.storyMaker.engine.unsupported")}>
                    {t("page.storyMaker.engine.unsupportedBanner")}
                </Banner>
            )}
            {looped && (
                <Banner tone="warning" title={t("page.storyMaker.player.loopTitle")}>
                    {t("page.storyMaker.player.loopDescription")}
                </Banner>
            )}

            {/* Blocking Compiler Errors Card (keeps Flow Monitor accessible & never unmounts Stage) */}
            {hasCompileErrors && (
                <Surface
                    tone="high"
                    radius="lg"
                    className="min-w-0 max-w-full shrink-0 space-y-2 border border-error/50 bg-error-container/25 p-3 sm:p-4"
                >
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Icon path={mdErrorFill} size={20} className="shrink-0 text-error" />
                            <h3 className="min-w-0 break-words type-title-s text-on-surface">
                                {t("page.storyMaker.v2.compiler.errorsTitle")}
                            </h3>
                            <span className="shrink-0 rounded-full bg-error-container px-2 py-0.5 type-label-s text-on-error-container">
                                {t("page.storyMaker.v2.compiler.statusErrors", { count: program.errors.length })}
                            </span>
                        </div>
                        {endAction && <div className="flex shrink-0 flex-wrap gap-2">{endAction}</div>}
                    </div>
                    <ul className="max-h-36 min-w-0 space-y-1.5 overflow-y-auto pr-1">
                        {program.errors.map((err, index) => (
                            <li
                                key={`${err.path}-${err.code}-${index}`}
                                className="flex min-w-0 items-start gap-2 rounded-md3-sm bg-surface-container px-2.5 py-1.5"
                            >
                                <Icon path={mdWarning} size={16} className="mt-0.5 shrink-0 text-error" />
                                <span className="min-w-0 flex-1">
                                    <span className="block break-words type-body-s text-on-surface">
                                        {t(`page.storyMaker.issue.${err.code}`, err.params ?? {})}
                                    </span>
                                    <span className="block break-all font-mono type-label-s text-on-surface-variant">
                                        {err.path}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </Surface>
            )}

            {/* Main NLE Workspace / Theater Root */}
            <div
                ref={workspaceRef}
                className={cn(
                    "min-w-0 max-w-full",
                    isNleWorkspace
                        ? immersive
                            ? "flex min-h-0 flex-1 flex-col gap-3 xl:h-full xl:gap-0 xl:overflow-hidden"
                            : "flex flex-col gap-3 xl:h-[calc(100svh-8.5rem)] xl:min-h-[42rem] xl:gap-0 xl:overflow-hidden"
                        : isImmersiveTheaterFill
                            ? "flex min-h-0 flex-1 flex-col gap-2"
                            : "space-y-3",
                )}
                style={isNleWorkspace ? ({ "--nle-top-split": `${topSplitPct}%` } as CSSProperties) : undefined}
            >
                {/* TOP ROW (xl+ workspace: 2-col [23rem Media/Phase/Backlog | 1fr Preview Monitor]; mobile/theater: single col) */}
                <div
                    className={cn(
                        "min-w-0 max-w-full",
                        isNleWorkspace
                            ? "flex flex-col gap-3 xl:grid xl:min-h-0 xl:shrink-0 xl:grow-0 xl:basis-[var(--nle-top-split)] xl:grid-cols-[23rem_minmax(0,1fr)] xl:gap-3"
                            : isImmersiveTheaterFill
                                ? "flex min-h-0 flex-1 flex-col gap-2"
                                : "space-y-3",
                    )}
                >
                    {/* Top-Left Pane: Assets + Live Phase & Variables + Backlog (xl+ workspace only) */}
                    {isNleWorkspace && (
                        <Surface
                            tone="low"
                            radius="lg"
                            className="hidden min-h-0 min-w-0 flex-col overflow-hidden border border-outline-variant/60 xl:flex"
                        >
                            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant/50 px-3 py-1.5">
                                <span className="flex min-w-0 items-center gap-1.5 type-label-l text-on-surface">
                                    <Icon path={mdPermMedia} size={17} className="shrink-0 text-primary" />
                                    <span className="truncate">{t("page.storyMaker.nle.paneAssets")}</span>
                                </span>
                                <IconButton
                                    size="xs"
                                    icon={isPreloadReady ? mdCloudDone : mdDownload}
                                    label={t("page.storyMaker.preload.buttonLabel")}
                                    onClick={() => setPreloadOpen(true)}
                                />
                            </div>
                            <Tabs<LeftPaneTab>
                                variant="secondary"
                                value={leftTab}
                                onValueChange={setLeftTab}
                                items={leftPaneTabs}
                                aria-label={t("page.storyMaker.nle.paneAssets")}
                                className="shrink-0"
                            />
                            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                                {leftTab === "assets" && renderMediaBin()}
                                {leftTab === "phase" && (
                                    <LivePhaseTelemetry
                                        doc={doc}
                                        program={program}
                                        frame={activeFrame}
                                        runtimePhase={runtimePhase}
                                        stageState={stageState}
                                        liveVariables={liveVariables}
                                        activeVoiceProgress={voiceProgress}
                                        onSelectNode={handleJumpToNode}
                                        onSelectBeat={handleJumpToBeat}
                                        compact
                                    />
                                )}
                                {leftTab === "backlog" && renderBacklogList()}
                            </div>
                        </Surface>
                    )}

                    {/* Top-Right Pane (or full-width Stage): ALWAYS mounted at same slot so WebGPU never resets! */}
                    <div
                        key="player-stage-host"
                        ref={containerRef}
                        className={cn(
                            "min-w-0 max-w-full",
                            fullscreen
                                ? "flex h-dvh w-full max-w-full flex-col justify-center gap-2 overflow-x-hidden bg-surface p-4"
                                : isNleWorkspace
                                    ? "flex min-h-0 flex-col gap-2 xl:overflow-hidden xl:rounded-md3-lg xl:border xl:border-outline-variant/60 xl:bg-surface-container-low xl:p-2.5"
                                    : isImmersiveTheaterFill
                                        ? "flex min-h-0 flex-1 flex-col gap-2"
                                        : "space-y-2",
                        )}
                    >
                        {isNleWorkspace && (
                            <div className="hidden shrink-0 items-center justify-between gap-2 px-0.5 xl:flex">
                                <div className="flex min-w-0 items-center gap-2">
                                    <Icon path={mdSmartDisplay} size={17} className="shrink-0 text-primary" />
                                    <span className="truncate type-label-l text-on-surface">
                                        {t("page.storyMaker.nle.panePreview")}
                                    </span>
                                    {!emptyStory && (
                                        <button
                                            type="button"
                                            onClick={() => setLeftTab("phase")}
                                            className="state-layer focus-ring inline-flex min-w-0 items-center gap-1.5 rounded-full bg-surface-container px-2 py-0.5 type-label-s text-on-surface-variant hover:text-on-surface"
                                        >
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    "inline-block size-2 shrink-0 rounded-full",
                                                    phaseMeta.dotClass,
                                                    phaseMeta.live && !reduced && "animate-pulse",
                                                )}
                                            />
                                            <span className="truncate">{t(phaseMeta.labelKey)}</span>
                                        </button>
                                    )}
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    {preloadRunning && (
                                        <div className="inline-flex items-center gap-1 rounded-full bg-secondary-container/70 py-0.5 pl-2 pr-0.5 text-on-secondary-container">
                                            <button
                                                type="button"
                                                onClick={() => setPreloadOpen(true)}
                                                className="focus-ring inline-flex items-center gap-1.5 rounded-full type-label-s"
                                            >
                                                <LoadingIndicator size={12} className="shrink-0" />
                                                <span className="font-mono tabular-nums">
                                                    {t("page.storyMaker.preload.summaryProgress", {
                                                        completed: preloadProgress?.completed ?? 0,
                                                        total: preloadProgress?.total ?? 0,
                                                    })}
                                                </span>
                                            </button>
                                            <IconButton
                                                size="xs"
                                                icon={mdClose}
                                                label={t("page.storyMaker.preload.cancelButton")}
                                                onClick={cancelBackgroundPreload}
                                            />
                                        </div>
                                    )}
                                    {uiKitStatus !== "idle" && (
                                        <span className="inline-flex items-center gap-1.5 type-label-s text-on-surface-variant">
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    "inline-block size-2 shrink-0 rounded-full",
                                                    uiKitStatus === "ready" ? "bg-primary" : "bg-outline",
                                                )}
                                            />
                                            <span className="truncate">{uiKitLabel}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 16:9 Stage Viewport Box (contained in both width & height inside NLE preview pane & immersive theater) */}
                        <div
                            className={cn(
                                "relative w-full min-w-0",
                                fullscreen
                                    ? "mx-auto max-w-[min(100%,calc((100dvh-7rem)*16/9))]"
                                    : isNleWorkspace
                                        ? "xl:flex xl:min-h-0 xl:flex-1 xl:items-center xl:justify-center xl:overflow-hidden xl:rounded-md3-md xl:bg-scrim/20 xl:[container-type:size]"
                                        : isImmersiveTheaterFill
                                            ? "flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md3-md bg-scrim/20 [container-type:size]"
                                            : undefined,
                            )}
                        >
                            <div
                                className={cn(
                                    "relative w-full",
                                    isNleWorkspace && "xl:w-[min(100cqw,calc(100cqh*16/9))]",
                                    isImmersiveTheaterFill && "w-[min(100cqw,calc(100cqh*16/9))]",
                                )}
                            >
                                <StoryStageView
                                    key="player-stage-host"
                                    doc={doc}
                                    state={displayState}
                                    line={line}
                                    hostRef={stageHostRef}
                                    phase={stagePhase}
                                    problems={stageProblems}
                                    loadingActors={loadingActors}
                                    onRetry={retryStage}
                                    uiKit={uiKit}
                                    uiHidden={uiHidden}
                                    dialogueText={uiHidden ? undefined : displayedDialogue}
                                    autoPlay={autoPlay}
                                    showEndSign={showEndSign}
                                    choice={uiHidden || hasCompileErrors ? null : currentChoice}
                                    choiceInteractive={!uiHidden && !hasCompileErrors && Boolean(currentChoice)}
                                    onChoose={handleChoose}
                                    onChoiceSound={playSe}
                                    showMenuButton={!uiHidden && !emptyStory && !hasCompileErrors}
                                    menuOpen={menuOpen}
                                    onMenuClick={() => setMenuOpen(open => !open)}
                                    animateCinemascope
                                    flash={flash}
                                    fadeSeconds={fadeSeconds}
                                    compactStatus
                                    onClick={stageClickBlocked ? undefined : handleAdvance}
                                    className={cn(!stageClickBlocked && "cursor-pointer")}
                                >
                                    <AnimatePresence>
                                        {!uiHidden && menuOpen && (
                                            <motion.div
                                                key="game-quick-menu"
                                                role="dialog"
                                                aria-modal="true"
                                                aria-label={t("page.storyMaker.player.menuTitle")}
                                                className="absolute inset-0 z-[28] flex items-center justify-center bg-scrim/45 p-2 sm:p-5"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={quickMenuTransition}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setMenuOpen(false);
                                                }}
                                            >
                                                <div
                                                    className="glass-thick max-h-full w-full max-w-md overflow-x-hidden overflow-y-auto rounded-md3-xl p-3 text-on-surface sm:p-4"
                                                    onClick={event => event.stopPropagation()}
                                                >
                                                    <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="truncate type-title-m text-on-surface">
                                                                {t("page.storyMaker.player.menuTitle")}
                                                            </p>
                                                            {uiKitStatus !== "idle" && (
                                                                <span className="mt-0.5 inline-flex max-w-full items-center gap-1.5 type-label-s text-on-surface-variant">
                                                                    {uiKitStatus === "loading" ? (
                                                                        <LoadingIndicator size={12} />
                                                                    ) : (
                                                                        <span
                                                                            aria-hidden
                                                                            className={cn(
                                                                                "inline-block size-2 shrink-0 rounded-full",
                                                                                uiKitStatus === "ready" ? "bg-primary" : "bg-outline",
                                                                            )}
                                                                        />
                                                                    )}
                                                                    <span className="truncate">{uiKitLabel}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                        <IconButton
                                                            size="s"
                                                            icon={mdClose}
                                                            label={t("page.storyMaker.player.menuClose")}
                                                            onClick={() => setMenuOpen(false)}
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
                                                        <Button
                                                            size="s"
                                                            variant={autoPlay ? "filled" : "tonal"}
                                                            selected={autoPlay}
                                                            disabled={emptyStory || ended || hasCompileErrors}
                                                            icon={mdAutoplay}
                                                            className="min-w-0 px-2.5 sm:px-3"
                                                            onClick={() => setAutoPlay(on => !on)}
                                                        >
                                                            <span className="truncate">{t("page.storyMaker.player.auto")}</span>
                                                        </Button>
                                                        <Button
                                                            size="s"
                                                            variant="tonal"
                                                            icon={mdHistory}
                                                            className="min-w-0 px-2.5 sm:px-3"
                                                            onClick={() => {
                                                                setMenuOpen(false);
                                                                setBacklogOpen(true);
                                                            }}
                                                        >
                                                            <span className="truncate">{t("page.storyMaker.player.backlog")}</span>
                                                        </Button>
                                                        <Button
                                                            size="s"
                                                            variant="tonal"
                                                            icon={mdVisibilityOff}
                                                            className="min-w-0 px-2.5 sm:px-3"
                                                            onClick={() => {
                                                                setMenuOpen(false);
                                                                setUiHidden(true);
                                                            }}
                                                        >
                                                            <span className="truncate">{t("page.storyMaker.player.hideUi")}</span>
                                                        </Button>
                                                        <Button
                                                            size="s"
                                                            variant="tonal"
                                                            icon={mdReplay}
                                                            disabled={emptyStory || hasCompileErrors}
                                                            className="min-w-0 px-2.5 sm:px-3"
                                                            onClick={() => {
                                                                setMenuOpen(false);
                                                                restart();
                                                            }}
                                                        >
                                                            <span className="truncate">{t("page.storyMaker.player.replay")}</span>
                                                        </Button>
                                                        <Button
                                                            size="s"
                                                            variant={muted || volume === 0 ? "filled" : "tonal"}
                                                            selected={muted || volume === 0}
                                                            icon={muted || volume === 0 ? mdVolumeOff : mdVolumeUp}
                                                            className="min-w-0 px-2.5 sm:px-3"
                                                            onClick={toggleMute}
                                                        >
                                                            <span className="truncate">{t(muted || volume === 0 ? "page.storyMaker.player.unmute" : "page.storyMaker.player.mute")}</span>
                                                        </Button>
                                                        <Button
                                                            size="s"
                                                            variant="tonal"
                                                            icon={fullscreen ? mdFullscreenExit : mdFullscreen}
                                                            className="min-w-0 px-2.5 sm:px-3"
                                                            onClick={() => {
                                                                setMenuOpen(false);
                                                                toggleFullscreen();
                                                            }}
                                                        >
                                                            <span className="truncate">{t(fullscreen ? "page.storyMaker.player.exitFullscreen" : "page.storyMaker.player.fullscreen")}</span>
                                                        </Button>
                                                    </div>

                                                    <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md3-md bg-surface-container/60 px-2.5 py-1.5 sm:px-3">
                                                        <IconButton
                                                            size="xs"
                                                            icon={muted || volume === 0 ? mdVolumeOff : mdVolumeUp}
                                                            label={t(muted ? "page.storyMaker.player.unmute" : "page.storyMaker.player.mute")}
                                                            onClick={toggleMute}
                                                        />
                                                        <Slider
                                                            min={0}
                                                            max={1}
                                                            step={0.05}
                                                            value={muted ? 0 : volume}
                                                            onValueChange={handleVolumeChange}
                                                            aria-label={t("page.storyMaker.player.volume")}
                                                            formatValue={val => `${Math.round(val * 100)}%`}
                                                            className="h-8 min-w-0 flex-1"
                                                        />
                                                        <span className="w-10 shrink-0 text-right font-mono type-label-s tabular-nums text-on-surface-variant">
                                                            {Math.round((muted ? 0 : volume) * 100)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Blocking Compile Error Stage Overlay */}
                                    {!uiHidden && hasCompileErrors && (
                                        <div
                                            className="absolute inset-0 z-[25] flex items-center justify-center bg-scrim/55 p-2 sm:p-4"
                                            onClick={event => event.stopPropagation()}
                                        >
                                            <Surface
                                                tone="high"
                                                radius="xl"
                                                elevation={2}
                                                className="flex max-h-full w-full max-w-md flex-col items-center gap-2 overflow-y-auto p-4 text-center sm:gap-3 sm:p-6"
                                            >
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-error-container px-3 py-1 type-label-m text-on-error-container">
                                                    <Icon path={mdErrorFill} size={16} className="shrink-0" />
                                                    <span>
                                                        {t("page.storyMaker.v2.compiler.statusErrors", { count: program.errors.length })}
                                                    </span>
                                                </span>
                                                <p className="type-title-m text-on-surface">
                                                    {t("page.storyMaker.v2.compiler.errorsTitle")}
                                                </p>
                                                <p className="line-clamp-2 break-words type-body-s text-on-surface-variant">
                                                    {t(`page.storyMaker.issue.${program.errors[0].code}`, program.errors[0].params ?? {})}
                                                </p>
                                                {endAction && <div className="flex flex-wrap justify-center gap-2 pt-1">{endAction}</div>}
                                            </Surface>
                                        </div>
                                    )}

                                    {/* Multi-Ending Achievement Overlay Card */}
                                    {!uiHidden && reachedEnding && activeFrame?.ending && (
                                        <div
                                            className="absolute inset-0 z-[25] flex items-center justify-center bg-scrim/55 p-2 sm:p-4"
                                            onClick={event => event.stopPropagation()}
                                        >
                                            <Surface
                                                tone="high"
                                                radius="xl"
                                                elevation={2}
                                                className="flex max-h-full w-full max-w-md flex-col items-center gap-2.5 overflow-y-auto border border-primary/30 p-4 text-center sm:gap-3 sm:p-6"
                                            >
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-container px-3 py-1 type-label-m text-on-primary-container">
                                                    <Icon path={mdFlag} size={16} className="shrink-0" />
                                                    <span>{t("page.storyMaker.v2.ending.achievedBadge")}</span>
                                                </span>

                                                <p className="break-words type-title-l text-on-surface">
                                                    {activeFrame.ending.title || t("page.storyMaker.player.endTitle")}
                                                </p>

                                                <p className="whitespace-pre-wrap break-words type-body-m text-on-surface-variant">
                                                    {activeFrame.ending.subtitle || t("page.storyMaker.player.endDescription")}
                                                </p>

                                                {doc.variables.length > 0 && (
                                                    <div className="w-full min-w-0 space-y-1.5 rounded-md3-md border border-outline-variant/50 bg-surface-container p-2.5 text-left">
                                                        <div className="flex items-center gap-1.5 type-label-s text-on-surface-variant">
                                                            <Icon path={mdCalculate} size={14} className="shrink-0 text-primary" />
                                                            <span>{t("page.storyMaker.v2.ending.finalVariables")}</span>
                                                        </div>
                                                        <div className="flex min-w-0 flex-wrap gap-1.5">
                                                            {doc.variables.map((variable) => {
                                                                const val = activeFrame.variables[variable.id] ?? variable.initial;
                                                                return (
                                                                    <span
                                                                        key={variable.id}
                                                                        className="inline-flex max-w-full items-center gap-1.5 rounded-md3-sm bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface"
                                                                    >
                                                                        <Icon
                                                                            path={variable.type === "number" ? mdNumbers : mdTag}
                                                                            size={12}
                                                                            className="shrink-0 text-primary"
                                                                        />
                                                                        <span className="max-w-28 truncate text-on-surface-variant">
                                                                            {variable.name || variable.id}
                                                                        </span>
                                                                        <span className="shrink-0 font-mono tabular-nums text-primary">
                                                                            {String(val)}
                                                                        </span>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap justify-center gap-2 pt-1">
                                                    <Button variant="filled" icon={mdReplay} onClick={restart}>
                                                        {t("page.storyMaker.v2.ending.replayOtherEndings")}
                                                    </Button>
                                                    {endAction}
                                                </div>
                                            </Surface>
                                        </div>
                                    )}

                                    {/* Generic End / Disconnected / Empty / Loop Overlay Card */}
                                    {!uiHidden && !hasCompileErrors && !reachedEnding && (ended || emptyStory) && (
                                        <div
                                            className="absolute inset-0 z-[25] flex items-center justify-center bg-scrim/45 p-2 sm:p-4"
                                            onClick={event => event.stopPropagation()}
                                        >
                                            <Surface
                                                tone="high"
                                                radius="xl"
                                                elevation={2}
                                                className="flex max-h-full w-full max-w-sm flex-col items-center gap-2 overflow-y-auto p-4 text-center sm:gap-3 sm:p-6"
                                            >
                                                <p className="type-title-l text-on-surface">
                                                    {t(
                                                        emptyStory
                                                            ? "page.storyMaker.player.emptyTitle"
                                                            : looped
                                                                ? "page.storyMaker.player.loopTitle"
                                                                : "page.storyMaker.player.endTitle",
                                                    )}
                                                </p>
                                                <p className="type-body-m text-on-surface-variant">
                                                    {t(
                                                        emptyStory
                                                            ? "page.storyMaker.player.emptyDescription"
                                                            : looped
                                                                ? "page.storyMaker.player.loopDescription"
                                                                : "page.storyMaker.player.endDescription",
                                                    )}
                                                </p>
                                                <div className="flex flex-wrap justify-center gap-2 pt-1">
                                                    {!emptyStory && (
                                                        <Button variant="filled" icon={mdReplay} onClick={restart}>
                                                            {t("page.storyMaker.player.replay")}
                                                        </Button>
                                                    )}
                                                    {endAction}
                                                </div>
                                            </Surface>
                                        </div>
                                    )}

                                    {uiHidden && (
                                        <div className="absolute bottom-3 right-3 z-30">
                                            <IconButton
                                                variant="tonal"
                                                icon={mdVisibility}
                                                label={t("page.storyMaker.player.showUi")}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setUiHidden(false);
                                                }}
                                            />
                                        </div>
                                    )}
                                </StoryStageView>
                            </div>
                        </div>

                        {/* Docked Transport Bar */}
                        <Surface
                            tone="low"
                            radius="lg"
                            className={cn(
                                "min-w-0 shrink-0 space-y-1.5 p-2.5 sm:p-3",
                                isNleWorkspace && "xl:border xl:border-outline-variant/40 xl:bg-surface-container xl:p-2",
                            )}
                        >
                            {(!emptyStory || preloadRunning) && (
                                <div className={cn("flex min-w-0 flex-wrap items-center justify-between gap-1.5 px-1", isNleWorkspace && "xl:hidden")}>
                                    {!emptyStory && (
                                        <button
                                            type="button"
                                            onClick={handlePhaseButtonClick}
                                            aria-expanded={showStackedDrawer}
                                            className="state-layer focus-ring inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 type-label-s text-on-surface-variant transition-colors hover:text-on-surface"
                                        >
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    "inline-block size-2 shrink-0 rounded-full",
                                                    phaseMeta.dotClass,
                                                    phaseMeta.live && !reduced && "animate-pulse",
                                                )}
                                            />
                                            {activeNodeLabel && (
                                                <span className="max-w-32 truncate text-on-surface sm:max-w-48">
                                                    {activeNodeLabel}
                                                </span>
                                            )}
                                            {activeBeatProgress && (
                                                <>
                                                    <span aria-hidden className="shrink-0">·</span>
                                                    <span className="shrink-0 font-mono tabular-nums">
                                                        {t("page.storyMaker.phase.currentStep", activeBeatProgress)}
                                                    </span>
                                                </>
                                            )}
                                            <span
                                                className={cn(
                                                    "hidden shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 type-label-s sm:inline-flex",
                                                    phaseMeta.chipClass,
                                                )}
                                            >
                                                <Icon path={phaseMeta.icon} size={12} className="shrink-0" />
                                                <span>{t(phaseMeta.labelKey)}</span>
                                            </span>
                                        </button>
                                    )}

                                    {preloadRunning && (
                                        <div className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-secondary-container/70 py-0.5 pl-2.5 pr-1 text-on-secondary-container">
                                            <button
                                                type="button"
                                                onClick={() => setPreloadOpen(true)}
                                                className="focus-ring inline-flex min-w-0 items-center gap-1.5 rounded-full py-0.5 type-label-s"
                                            >
                                                <LoadingIndicator size={14} className="shrink-0" />
                                                <span className="min-w-0 truncate font-mono tabular-nums">
                                                    {t("page.storyMaker.preload.summaryProgress", {
                                                        completed: preloadProgress?.completed ?? 0,
                                                        total: preloadProgress?.total ?? 0,
                                                    })}
                                                </span>
                                            </button>
                                            <IconButton
                                                size="xs"
                                                icon={mdClose}
                                                label={t("page.storyMaker.preload.cancelButton")}
                                                onClick={cancelBackgroundPreload}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
                                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                                    <IconButton
                                        size="s"
                                        icon={mdSkipPrevious}
                                        label={t("page.storyMaker.player.previous")}
                                        disabled={history.length <= 1 || hasCompileErrors}
                                        onClick={handlePrevious}
                                    />
                                    <Button
                                        size="s"
                                        variant="filled"
                                        icon={mdSkipNext}
                                        disabled={Boolean(currentChoice) || ended || emptyStory || hasCompileErrors}
                                        className="px-3 sm:px-3.5"
                                        onClick={handleAdvance}
                                    >
                                        {t("page.storyMaker.player.next")}
                                    </Button>
                                    <IconButton
                                        size="s"
                                        icon={mdReplay}
                                        label={t("page.storyMaker.player.replay")}
                                        disabled={emptyStory || hasCompileErrors}
                                        onClick={restart}
                                    />
                                    <Button
                                        size="s"
                                        variant={autoPlay ? "filled" : "tonal"}
                                        icon={mdAutoplay}
                                        disabled={emptyStory || ended || hasCompileErrors}
                                        selected={autoPlay}
                                        className="px-2.5 sm:px-3"
                                        onClick={() => setAutoPlay(on => !on)}
                                    >
                                        {t("page.storyMaker.player.auto")}
                                    </Button>
                                </div>

                                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                                    {audioBlocked && !emptyStory && !ended && !hasCompileErrors && (
                                        <Button
                                            size="xs"
                                            variant="tonal"
                                            icon={mdVolumeUp}
                                            onClick={() => unlockAudio()}
                                            className="max-w-full"
                                        >
                                            <span className="truncate">{t("page.storyMaker.player.tapToEnableAudio")}</span>
                                        </Button>
                                    )}
                                    <Button
                                        size="s"
                                        variant={(effectiveLayoutMode === "theater" ? phaseOpen : mobileDrawerOpen) ? "filled" : "tonal"}
                                        selected={effectiveLayoutMode === "theater" ? phaseOpen : mobileDrawerOpen}
                                        icon={mdTimeline}
                                        className={cn("px-2.5 sm:px-3", isNleWorkspace && "xl:hidden")}
                                        onClick={handlePhaseButtonClick}
                                    >
                                        {t("page.storyMaker.phase.toggleButton")}
                                    </Button>
                                    <Button
                                        size="s"
                                        variant={isPreloadReady ? "tonal" : "text"}
                                        icon={isPreloadReady ? mdCloudDone : mdDownload}
                                        className="px-2.5 sm:px-3"
                                        onClick={() => setPreloadOpen(true)}
                                    >
                                        {t("page.storyMaker.preload.buttonLabel")}
                                    </Button>
                                    <Button
                                        size="s"
                                        variant="text"
                                        icon={mdHistory}
                                        className={cn("px-2.5 sm:px-3", isNleWorkspace && "xl:hidden")}
                                        onClick={() => setBacklogOpen(true)}
                                    >
                                        {t("page.storyMaker.player.backlog")}
                                    </Button>
                                    <IconButton
                                        size="s"
                                        icon={uiHidden ? mdVisibility : mdVisibilityOff}
                                        label={t(uiHidden ? "page.storyMaker.player.showUi" : "page.storyMaker.player.hideUi")}
                                        onClick={() => {
                                            setMenuOpen(false);
                                            setUiHidden(hidden => !hidden);
                                        }}
                                    />
                                    <div className="flex items-center gap-1">
                                        <IconButton
                                            size="s"
                                            icon={muted || volume === 0 ? mdVolumeOff : mdVolumeUp}
                                            label={t(muted ? "page.storyMaker.player.unmute" : "page.storyMaker.player.mute")}
                                            onClick={toggleMute}
                                        />
                                        <Slider
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={muted ? 0 : volume}
                                            onValueChange={handleVolumeChange}
                                            aria-label={t("page.storyMaker.player.volume")}
                                            formatValue={val => `${Math.round(val * 100)}%`}
                                            className="hidden h-7 w-20 sm:flex"
                                        />
                                    </div>
                                    <IconButton
                                        size="s"
                                        icon={fullscreen ? mdFullscreenExit : mdFullscreen}
                                        label={t(fullscreen ? "page.storyMaker.player.exitFullscreen" : "page.storyMaker.player.fullscreen")}
                                        onClick={toggleFullscreen}
                                    />
                                </div>
                            </div>
                        </Surface>
                    </div>
                </div>

                {/* DRAGGABLE HORIZONTAL SPLITTER BAR (xl+ workspace mode only) */}
                {isNleWorkspace && (
                    <div
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={t("page.storyMaker.nle.resizeSplit")}
                        aria-valuemin={MIN_TOP_SPLIT_PCT}
                        aria-valuemax={MAX_TOP_SPLIT_PCT}
                        aria-valuenow={Math.round(topSplitPct)}
                        tabIndex={0}
                        title={t("page.storyMaker.nle.resizeSplit")}
                        onPointerDown={handleSplitterPointerDown}
                        onPointerMove={handleSplitterPointerMove}
                        onPointerUp={handleSplitterPointerEnd}
                        onPointerCancel={handleSplitterPointerEnd}
                        onLostPointerCapture={handleSplitterPointerEnd}
                        onDoubleClick={() => writeTopSplitPct(DEFAULT_TOP_SPLIT_PCT)}
                        onKeyDown={handleSplitterKeyDown}
                        className="focus-ring group hidden h-3 shrink-0 cursor-row-resize touch-none select-none items-center justify-center rounded-full xl:flex"
                    >
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-0.5 text-on-surface-variant transition-colors group-hover:bg-primary-container group-hover:text-on-primary-container">
                            <Icon path={mdDragHandle} size={16} />
                        </span>
                    </div>
                )}

                {/* BOTTOM ROW: FULL-WIDTH LIVE FLOW MONITOR (xl+ workspace mode only) */}
                {isNleWorkspace && (
                    <Surface
                        tone="low"
                        radius="lg"
                        className="hidden min-h-[14rem] min-w-0 flex-1 flex-col overflow-hidden border border-outline-variant/60 xl:flex"
                    >
                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-outline-variant/50 px-3 py-1.5">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="flex min-w-0 items-center gap-1.5 type-label-l text-on-surface">
                                    <Icon path={mdAccountTree} size={17} className="shrink-0 text-primary" />
                                    <span className="truncate">{t("page.storyMaker.nle.paneFlow")}</span>
                                </span>
                                {activeNodeLabel && (
                                    <span className="inline-flex max-w-48 items-center gap-1 rounded-md3-sm bg-surface-container px-2 py-0.5 type-label-s text-on-surface">
                                        <span className="text-on-surface-variant">{t("page.storyMaker.phase.currentNode")}:</span>
                                        <span className="truncate">{activeNodeLabel}</span>
                                    </span>
                                )}
                                {activeBeatProgress && (
                                    <span className="rounded-md3-sm bg-surface-container px-2 py-0.5 font-mono type-label-s tabular-nums text-on-surface">
                                        {t("page.storyMaker.phase.currentStep", activeBeatProgress)}
                                    </span>
                                )}
                                <span className="rounded-md3-sm bg-surface-container px-2 py-0.5 type-label-s text-on-surface-variant">
                                    {t("page.storyMaker.phase.visitedNodes", { count: activeFrame?.visitedNodeIds.length ?? 0 })}
                                </span>
                            </div>
                            <span className="type-label-s text-on-surface-variant">
                                {t("page.storyMaker.phase.jumpToStep")}
                            </span>
                        </div>

                        <StoryFlowCanvas
                            doc={doc}
                            mode="monitor"
                            activeNodeId={activeFrame?.nodeId ?? null}
                            activeBeatId={activeFrame?.beatId ?? null}
                            visitedNodeIds={activeFrame?.visitedNodeIds ?? []}
                            visitedEdgeIds={activeFrame?.visitedEdgeIds ?? []}
                            diagnostics={program.diagnostics}
                            onSelectNode={hasCompileErrors ? undefined : handleJumpToNode}
                            onSelectBeat={hasCompileErrors ? undefined : handleJumpToBeat}
                            className="min-h-0 flex-1 rounded-none border-0"
                        />
                    </Surface>
                )}

                {/* STACKED DRAWER: Theater mode (all viewports when toggled) OR Workspace mode on mobile (< xl) */}
                {showStackedDrawer && (
                    <div className={cn("min-w-0 max-w-full", effectiveLayoutMode === "workspace" && "xl:hidden")}>
                        <Surface
                            tone="low"
                            radius="lg"
                            className="min-w-0 max-w-full overflow-hidden border border-outline-variant/60"
                        >
                            <div className="flex min-w-0 items-center justify-between gap-2 border-b border-outline-variant/50 pr-2">
                                <Tabs<LeftPaneTab>
                                    variant="secondary"
                                    scrollable
                                    value={drawerTab}
                                    onValueChange={setDrawerTab}
                                    items={stackedDrawerTabs}
                                    aria-label={t("page.storyMaker.nle.paneAssets")}
                                    className="min-w-0 flex-1 border-b-0"
                                />
                                <IconButton
                                    size="xs"
                                    icon={mdClose}
                                    label={t("page.storyMaker.phase.collapse")}
                                    onClick={() => {
                                        if (effectiveLayoutMode === "theater") setPhaseOpen(false);
                                        else setMobileDrawerOpen(false);
                                    }}
                                />
                            </div>
                            <div className="min-w-0 p-3">
                                {drawerTab === "phase" && (
                                    <LivePhasePanel
                                        doc={doc}
                                        program={program}
                                        frame={activeFrame}
                                        runtimePhase={runtimePhase}
                                        stageState={stageState}
                                        liveVariables={liveVariables}
                                        activeVoiceProgress={voiceProgress}
                                        onSelectNode={hasCompileErrors ? undefined : handleJumpToNode}
                                        onSelectBeat={hasCompileErrors ? undefined : handleJumpToBeat}
                                    />
                                )}
                                {drawerTab === "assets" && renderMediaBin()}
                                {drawerTab === "backlog" && renderBacklogList()}
                            </div>
                        </Surface>
                    </div>
                )}
            </div>

            <AssetPreloadDialog
                open={preloadOpen}
                onClose={() => setPreloadOpen(false)}
                doc={doc}
                assetSource={preloadSource}
                models={models}
                autoPreload={autoPreload}
                onAutoPreloadChange={handleAutoPreloadChange}
                onComplete={handlePreloadComplete}
                externalProgress={preloadProgress}
                externalRunning={preloadRunning}
                onCancelExternal={cancelBackgroundPreload}
            />

            <SideSheet
                isOpen={backlogOpen}
                onClose={() => setBacklogOpen(false)}
                title={t("page.storyMaker.player.backlog")}
            >
                {renderBacklogList()}
            </SideSheet>
        </div>
    );
}
