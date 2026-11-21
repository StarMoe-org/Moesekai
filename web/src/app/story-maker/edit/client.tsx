"use client";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useShellImmersiveMode } from "@/components/AppShell";
import MainLayout from "@/components/MainLayout";
import {
    Banner, Button, Card, Dialog, EmptyState, Icon, IconButton, LoadingState, PageContainer,
    SegmentedButton, Slider, Snackbar, Surface, cn,
} from "@/components/md3";
import {
    mdArrowBack, mdAutoplay, mdCalculate, mdCheckCircle, mdChevronLeft, mdChevronRight, mdClose,
    mdCloseFullscreen, mdCode, mdDownload, mdDragHandle, mdEdit, mdErrorFill, mdFlag, mdFullscreen,
    mdFullscreenExit, mdNumbers, mdOpenInFull, mdPlayArrow, mdPlayArrowFill, mdPlayCircle, mdRedo,
    mdReplay, mdSettings, mdSkipNext, mdSkipPrevious, mdStar, mdTag, mdUndo, mdViewQuilt,
    mdVisibility, mdVisibilityOff, mdVolumeOff, mdVolumeUp, mdWarning,
} from "@/components/md3/icons";
import { AssetPreloadDialog } from "@/components/story-maker/AssetPreloadPanel";
import type { GameStageChoiceProp } from "@/components/story-maker/GameStageOverlay";
import {
    LivePhasePanel, PHASE_META, getNodeDisplayLabel, summarizeActiveBeat,
    type ActiveVoiceProgress, type LivePhaseBacklogItem, type StoryRuntimePhase,
} from "@/components/story-maker/LivePhasePanel";
import { NodeInspector } from "@/components/story-maker/NodeInspector";
import { ScriptCodeDialog } from "@/components/story-maker/ScriptCodeDialog";
import { StoryEditorBin } from "@/components/story-maker/StoryEditorBin";
import { StoryFlowCanvas } from "@/components/story-maker/StoryFlowCanvas";
import { StoryIssueList } from "@/components/story-maker/StoryIssueList";
import {
    StoryMetaDialog, applyMetaValuesToDoc, metaValuesFromDoc, type StoryMetaValues,
} from "@/components/story-maker/StoryMetaDialog";
import { applyInstructionToStage } from "@/components/story-maker/StoryPlayerView";
import { StoryStageView } from "@/components/story-maker/StoryStageView";
import { useStarterStory } from "@/components/story-maker/useStarterStory";
import { useStoryAudio } from "@/components/story-maker/useStoryAudio";
import { useStoryModels } from "@/components/story-maker/useStoryModels";
import { useStoryStage } from "@/components/story-maker/useStoryStage";
import { useStoryUiKit } from "@/components/story-maker/useStoryUiKit";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { live2dSources } from "@/lib/live2dViewer/config";
import { localizePath } from "@/lib/localized-path";
import { storyBgmUrl, storySeCandidateUrls, storyVoiceCandidateUrls } from "@/lib/storyMaker/assets";
import { compileStoryGraph } from "@/lib/storyMaker/compiler";
import {
    GRAPH_COL_GAP, GRAPH_ORIGIN_X, GRAPH_ORIGIN_Y, acceptsTarget, applyDragPayloadToTarget,
    autoLayoutGraph, connectEdge, continueAndCutScene, createNode, disconnectEdge, disconnectPort,
    duplicateBeat, duplicateNode, getOutgoingEdge, moveBeat, moveNode, removeBeat, removeNode,
    type ContinueSceneOptions, type StoryDragPayload, type StoryDropTarget,
} from "@/lib/storyMaker/document";
import { StoryDraftsUnavailableError, createDraft, getDraft, saveDraft } from "@/lib/storyMaker/drafts";
import { STORY_FADE_SECONDS, STORY_LIMITS } from "@/lib/storyMaker/limits";
import {
    INITIAL_STAGE_STATE, advanceRuntime, createInitialRuntime, evaluateCondition, evaluateStageAt,
    initVariables, interpolateStoryText, type StoryRuntimeFrame,
} from "@/lib/storyMaker/runtime";
import type {
    SceneNode, StoryCastMember, StoryDocument, StoryEffectColor, StoryNode, StoryNodePos,
    StoryStageState, StoryVarValues,
} from "@/types/storyMaker";

const MAX_UNDO = 50;
const AUTOSAVE_MS = 600;
const CHAR_INTERVAL_MS = 28;
const DEFAULT_TOP_SPLIT_PCT = 54;
const MIN_TOP_SPLIT_PCT = 34;
const MAX_TOP_SPLIT_PCT = 70;
const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

type SaveStatus = "saved" | "dirty" | "saving" | "error";
type WorkspaceMode = "edit" | "playtest";

interface PlaytestHistoryItem {
    frame: StoryRuntimeFrame;
    chosenText?: string;
}

function subscribeDesktopViewport(onStoreChange: () => void): () => void {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
    }
    const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
    media.addEventListener("change", onStoreChange);
    return () => media.removeEventListener("change", onStoreChange);
}

function getDesktopViewportSnapshot(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function getDesktopViewportServerSnapshot(): null {
    return null;
}

function useDesktopViewport(): boolean | null {
    return useSyncExternalStore(
        subscribeDesktopViewport,
        getDesktopViewportSnapshot,
        getDesktopViewportServerSnapshot,
    );
}

function pickInitialNodeId(doc: StoryDocument): string {
    const startEdge = getOutgoingEdge(doc, doc.startNodeId, "out");
    if (startEdge && doc.nodes[startEdge.toNodeId]) {
        return startEdge.toNodeId;
    }
    const firstScene = Object.values(doc.nodes).find(n => n.type === "scene");
    if (firstScene) return firstScene.id;
    return doc.nodes[doc.startNodeId] ? doc.startNodeId : (Object.keys(doc.nodes)[0] ?? doc.startNodeId);
}

function getNodeDisplayName(node: StoryNode, t: (key: string) => string): string {
    if (node.type === "start") return t("page.storyMaker.v2.nodeTypes.start");
    return node.title.trim() || t(`page.storyMaker.v2.nodeTypes.${node.type}`);
}

function DesktopOnlyNotice({ draftId }: { draftId: string | null }) {
    const { t } = useI18n();
    return (
        <PageContainer className="flex min-h-[60vh] items-center justify-center py-8">
            <Card variant="filled" radius="xl" className="w-full max-w-md p-2">
                <EmptyState
                    icon={mdViewQuilt}
                    title={t("page.storyMaker.desktopOnly.title")}
                    description={t("page.storyMaker.desktopOnly.description")}
                    action={(
                        <div className="mt-2 flex flex-wrap justify-center gap-2">
                            <Button variant="filled" icon={mdArrowBack} href="/story-maker">
                                {t("page.storyMaker.action.backToDrafts")}
                            </Button>
                            {draftId && (
                                <Button
                                    variant="tonal"
                                    icon={mdPlayArrowFill}
                                    href={`/story-maker/play?id=${encodeURIComponent(draftId)}`}
                                >
                                    {t("page.storyMaker.action.play")}
                                </Button>
                            )}
                        </div>
                    )}
                />
            </Card>
        </PageContainer>
    );
}

function StoryMakerEditContent() {
    const { t, routeLocale } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const reduced = useReducedMotion();
    const { assetSource } = useTheme();
    const buildStarter = useStarterStory();
    const line = assetSource.startsWith("backup") ? "backup" : "main";

    const draftId = searchParams.get("id");
    const initialModeParamRef = useRef(searchParams.get("mode"));
    const initialNodeParamRef = useRef(searchParams.get("node"));

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<"missing" | "unavailable" | "failed" | null>(null);
    const [doc, setDoc] = useState<StoryDocument | null>(null);
    const [past, setPast] = useState<StoryDocument[]>([]);
    const [future, setFuture] = useState<StoryDocument[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("edit");
    const [immersive, setImmersive] = useState(() => searchParams.get("immersive") === "1");
    const [topSplitPct, setTopSplitPct] = useState(DEFAULT_TOP_SPLIT_PCT);
    const [activeDragPayload, setActiveDragPayload] = useState<StoryDragPayload | null>(null);

    const [metaOpen, setMetaOpen] = useState(false);
    const [issuesOpen, setIssuesOpen] = useState(false);
    const [codeOpen, setCodeOpen] = useState(false);
    const [preloadOpen, setPreloadOpen] = useState(false);
    const [snack, setSnack] = useState<string | null>(null);
    const [flash, setFlash] = useState<{ key: number; color: StoryEffectColor; seconds: number } | null>(null);

    // Interactive Playtest runtime state (shares the persistently mounted WebGPU stage).
    const [playHistory, setPlayHistory] = useState<PlaytestHistoryItem[]>([]);
    const [playStageState, setPlayStageState] = useState<StoryStageState>(INITIAL_STAGE_STATE);
    const [playLiveVariables, setPlayLiveVariables] = useState<StoryVarValues>({});
    const [playRunning, setPlayRunning] = useState(false);
    const [playEffectActive, setPlayEffectActive] = useState(false);
    const [playAuto, setPlayAuto] = useState(false);
    const [playUiHidden, setPlayUiHidden] = useState(false);
    const [playFadeSeconds, setPlayFadeSeconds] = useState<number>(STORY_FADE_SECONDS);
    const [playTypedCount, setPlayTypedCount] = useState(0);
    const [playVoicePending, setPlayVoicePending] = useState(false);
    const [playVoiceProgress, setPlayVoiceProgress] = useState<ActiveVoiceProgress | null>(null);
    const [playVolume, setPlayVolume] = useState(0.8);
    const [playMuted, setPlayMuted] = useState(false);
    const [playFullscreen, setPlayFullscreen] = useState(false);

    const flashKeyRef = useRef(0);
    const dirtyDocRef = useRef<StoryDocument | null>(null);
    const nleContainerRef = useRef<HTMLDivElement | null>(null);
    const stageFullscreenRef = useRef<HTMLDivElement | null>(null);
    const splitDragRef = useRef<{ pointerId: number } | null>(null);
    const playGenRef = useRef(0);
    const voiceTokenRef = useRef(0);
    const skipWaitRef = useRef<(() => void) | null>(null);
    const playStageStateRef = useRef(playStageState);
    const playLiveVariablesRef = useRef(playLiveVariables);
    const playHistoryRef = useRef(playHistory);
    const workspaceModeRef = useRef(workspaceMode);
    const pendingAutoPlaytestRef = useRef<string | null>(null);

    useEffect(() => {
        playStageStateRef.current = playStageState;
    }, [playStageState]);

    useEffect(() => {
        playLiveVariablesRef.current = playLiveVariables;
    }, [playLiveVariables]);

    useEffect(() => {
        playHistoryRef.current = playHistory;
    }, [playHistory]);

    useEffect(() => {
        workspaceModeRef.current = workspaceMode;
    }, [workspaceMode]);

    useShellImmersiveMode(immersive);

    useEffect(() => {
        if (!immersive || typeof document === "undefined") return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [immersive]);

    const syncModeUrl = useCallback((nextMode: WorkspaceMode) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        if (nextMode === "playtest") url.searchParams.set("mode", "playtest");
        else url.searchParams.delete("mode");
        window.history.replaceState({}, "", url.toString());
    }, []);

    const handleImmersiveChange = useCallback((next: boolean) => {
        setImmersive(next);
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            if (next) url.searchParams.set("immersive", "1");
            else url.searchParams.delete("immersive");
            window.history.replaceState({}, "", url.toString());
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined" || !draftId) return;
        const url = new URL(window.location.href);
        if (url.searchParams.get("id") !== draftId) {
            url.searchParams.set("id", draftId);
            window.history.replaceState({}, "", url.toString());
        }
    }, [draftId]);

    const {
        syncBgm, playSe, playVoice, stopVoice, stopAll: stopAllAudio, unlock: unlockAudio, audioBlocked,
    } = useStoryAudio(playVolume, playMuted);

    const togglePlayMute = useCallback(() => {
        const nextMuted = !playMuted;
        setPlayMuted(nextMuted);
        if (!nextMuted && playVolume > 0) unlockAudio(playVolume);
    }, [playMuted, playVolume, unlockAudio]);

    const handlePlayVolumeChange = useCallback((next: number) => {
        setPlayMuted(false);
        setPlayVolume(next);
        if (next > 0) unlockAudio(next);
    }, [unlockAudio]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setLoadError(null);
            setPast([]);
            setFuture([]);
            setSaveStatus("saved");
            playGenRef.current += 1;
            voiceTokenRef.current += 1;
            skipWaitRef.current?.();
            stopAllAudio();
            setWorkspaceMode("edit");
            setPlayHistory([]);
            setPlayAuto(false);
            setPlayRunning(false);
            setPlayEffectActive(false);
            setPlayVoicePending(false);
            setPlayVoiceProgress(null);

            if (!draftId) {
                setDoc(null);
                setSelectedNodeId(null);
                setSelectedBeatId(null);
                setLoadError("missing");
                setLoading(false);
                return;
            }
            try {
                const draft = await getDraft(draftId);
                if (cancelled) return;
                if (!draft) {
                    setDoc(null);
                    setSelectedNodeId(null);
                    setSelectedBeatId(null);
                    setLoadError("missing");
                } else {
                    const initialNodeId = pickInitialNodeId(draft.doc);
                    const initialNode = draft.doc.nodes[initialNodeId];
                    setDoc(draft.doc);
                    setSelectedNodeId(initialNodeId);
                    setSelectedBeatId(initialNode?.type === "scene" ? (initialNode.beats[0]?.id ?? null) : null);
                    if (initialModeParamRef.current === "playtest") {
                        initialModeParamRef.current = null;
                        pendingAutoPlaytestRef.current = initialNodeParamRef.current ?? draft.doc.startNodeId;
                    }
                }
            } catch (error) {
                if (cancelled) return;
                setDoc(null);
                setSelectedNodeId(null);
                setSelectedBeatId(null);
                setLoadError(error instanceof StoryDraftsUnavailableError ? "unavailable" : "failed");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [draftId, stopAllAudio]);

    const flushSave = useCallback(async (id: string, target: StoryDocument) => {
        setSaveStatus("saving");
        try {
            await saveDraft(id, target);
            if (dirtyDocRef.current === target) {
                dirtyDocRef.current = null;
                setSaveStatus("saved");
            }
        } catch {
            setSaveStatus("error");
        }
    }, []);

    useEffect(() => {
        if (!draftId || !doc || saveStatus !== "dirty") return;
        dirtyDocRef.current = doc;
        const timer = window.setTimeout(() => {
            void flushSave(draftId, doc);
        }, AUTOSAVE_MS);
        return () => window.clearTimeout(timer);
    }, [doc, draftId, flushSave, saveStatus]);

    useEffect(() => {
        if (saveStatus !== "dirty" && saveStatus !== "saving") return;
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [saveStatus]);

    const commit = useCallback((updater: (current: StoryDocument) => StoryDocument) => {
        setDoc((current) => {
            if (!current) return current;
            const next = updater(current);
            if (next === current) return current;
            setPast(history => [...history.slice(-(MAX_UNDO - 1)), current]);
            setFuture([]);
            setSaveStatus("dirty");
            return next;
        });
    }, []);

    const undo = useCallback(() => {
        setPast((history) => {
            if (history.length === 0 || !doc) return history;
            const previous = history[history.length - 1];
            setFuture(redoStack => [doc, ...redoStack.slice(0, MAX_UNDO - 1)]);
            setDoc(previous);
            setSaveStatus("dirty");
            return history.slice(0, -1);
        });
    }, [doc]);

    const redo = useCallback(() => {
        setFuture((redoStack) => {
            if (redoStack.length === 0 || !doc) return redoStack;
            const next = redoStack[0];
            setPast(history => [...history.slice(-(MAX_UNDO - 1)), doc]);
            setDoc(next);
            setSaveStatus("dirty");
            return redoStack.slice(1);
        });
    }, [doc]);

    // Safe derived selection that always remains valid across Undo/Redo/Delete/Code-Apply.
    const activeNodeId = useMemo(() => {
        if (!doc) return null;
        if (selectedNodeId && doc.nodes[selectedNodeId]) return selectedNodeId;
        if (doc.nodes[doc.startNodeId]) return doc.startNodeId;
        return Object.keys(doc.nodes)[0] ?? null;
    }, [doc, selectedNodeId]);

    const activeNode = doc && activeNodeId ? doc.nodes[activeNodeId] ?? null : null;
    const activeScene: SceneNode | null = activeNode?.type === "scene" ? activeNode : null;

    const activeBeatId = useMemo(() => {
        if (!activeScene || !selectedBeatId) return null;
        return activeScene.beats.some(b => b.id === selectedBeatId) ? selectedBeatId : null;
    }, [activeScene, selectedBeatId]);

    const activeBeatIndex = activeScene && activeBeatId
        ? activeScene.beats.findIndex(b => b.id === activeBeatId)
        : -1;
    const activeBeat = activeScene && activeBeatIndex >= 0
        ? activeScene.beats[activeBeatIndex] ?? null
        : null;

    const handleSelectNode = useCallback((nodeId: string) => {
        setSelectedNodeId(nodeId);
        setSelectedBeatId(null);
    }, []);

    const handleSelectBeat = useCallback((nodeId: string, beatId: string | null) => {
        setSelectedNodeId(nodeId);
        setSelectedBeatId(beatId);
    }, []);

    const handleDeleteNode = useCallback((nodeId: string) => {
        if (!doc) return;
        const target = doc.nodes[nodeId];
        if (!target || target.type === "start" || nodeId === doc.startNodeId) return;
        commit(current => removeNode(current, nodeId));
        if (activeNodeId === nodeId) {
            setSelectedNodeId(doc.startNodeId);
            setSelectedBeatId(null);
        }
    }, [activeNodeId, commit, doc]);

    const handleDeleteBeat = useCallback((nodeId: string, beatId: string) => {
        if (!doc) return;
        const node = doc.nodes[nodeId];
        if (!node || node.type !== "scene") return;
        const idx = node.beats.findIndex(b => b.id === beatId);
        if (idx === -1) return;
        const nextBeat = node.beats[idx + 1] ?? node.beats[idx - 1] ?? null;
        commit(current => removeBeat(current, nodeId, beatId));
        if (activeNodeId === nodeId && activeBeatId === beatId) {
            setSelectedBeatId(nextBeat?.id ?? null);
        }
    }, [activeBeatId, activeNodeId, commit, doc]);

    const program = useMemo(() => (doc ? compileStoryGraph(doc) : null), [doc]);
    const diagnostics = useMemo(() => program?.diagnostics ?? [], [program]);
    const errorCount = program?.errors.length ?? 0;
    const warningCount = program?.warnings.length ?? 0;

    const { list: modelList, models, retry: retryModels } = useStoryModels(doc?.region ?? null);
    const { kit: uiKit } = useStoryUiKit(doc?.region ?? null);
    const library = useMemo(() => (doc ? live2dSources(doc.region).library : null), [doc]);
    const {
        hostRef: stageHostRef,
        phase: stagePhase,
        modelInfo,
        problems: stageProblems,
        loadingActors,
        apply: applyStage,
        previewClip,
        clearClipPreview,
        isSoloPreview,
        previewingCastKey,
        setTalking: setStageTalking,
        shake: shakeStage,
        finish: finishStage,
        retry: retryStage,
    } = useStoryStage({ library, cast: doc?.cast ?? [], models });

    const evaluated = useMemo(() => {
        if (!doc || !activeNodeId) {
            return { stage: INITIAL_STAGE_STATE, variables: {} };
        }
        return evaluateStageAt(doc, activeNodeId, activeBeatId ?? undefined);
    }, [doc, activeNodeId, activeBeatId]);

    const editStageState = evaluated.stage;

    // Sync WebGPU stage to edit preview whenever in edit mode.
    useEffect(() => {
        if (workspaceMode !== "edit" || !doc || stagePhase.kind !== "ready" || !models) return;
        void applyStage(editStageState, { instant: true });
    }, [workspaceMode, doc, applyStage, stagePhase.kind, models, editStageState]);

    // Re-sync WebGPU stage to playtest state only when the stage or model list finishes initializing mid-playtest.
    useEffect(() => {
        if (workspaceModeRef.current !== "playtest" || stagePhase.kind !== "ready" || !models) return;
        void applyStage(playStageStateRef.current, { instant: true });
    }, [applyStage, stagePhase.kind, models]);

    // ==================== Interactive Playtest Engine ====================

    const stopActivePlayVoice = useCallback(() => {
        voiceTokenRef.current += 1;
        stopVoice();
        setPlayVoicePending(false);
        setPlayVoiceProgress(null);
    }, [stopVoice]);

    const startPlayVoice = useCallback((
        urls: string[],
        meta: { label: string; start?: number; end?: number },
        generation: number,
        trackPending: boolean,
    ) => {
        if (urls.length === 0) return;
        const token = ++voiceTokenRef.current;
        if (trackPending) setPlayVoicePending(true);
        setPlayVoiceProgress({
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
                setPlayVoiceProgress({
                    currentSec,
                    durationSec,
                    start: meta.start,
                    end: meta.end,
                    label: meta.label,
                });
            },
        }).finally(() => {
            if (voiceTokenRef.current === token) {
                setPlayVoiceProgress(null);
            }
            if (trackPending && playGenRef.current === generation) {
                setPlayVoicePending(false);
            }
        });
    }, [playVoice]);

    const waitPlayMs = useCallback((ms: number, generation: number) => {
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

    const executePlayFrame = useCallback(async (
        nextHistory: PlaytestHistoryItem[],
        baseStage: StoryStageState,
        baseVars: StoryVarValues,
        frame: StoryRuntimeFrame,
        instant = false,
    ) => {
        if (!doc) return;
        const generation = ++playGenRef.current;
        skipWaitRef.current?.();
        stopActivePlayVoice();
        setStageTalking(null);
        setPlayEffectActive(false);
        setPlayHistory(nextHistory);

        if (instant || frame.executedInstructions.length === 0) {
            finishStage();
            setFlash(null);
            setPlayStageState(frame.stage);
            setPlayLiveVariables(frame.variables);
            setPlayTypedCount(frame.stage.dialogue?.body.length ?? 0);
            setPlayRunning(false);
            syncBgm(
                frame.stage.bgm.name ? storyBgmUrl(frame.stage.bgm.name, doc.region, line) : null,
                frame.stage.bgm.volume,
            );
            void applyStage(frame.stage, { instant: true });
            if (frame.stoppedReason !== "blocking") setPlayAuto(false);
            return;
        }

        setPlayRunning(true);
        let stage = baseStage;
        let vars = baseVars;

        for (const inst of frame.executedInstructions) {
            if (playGenRef.current !== generation) return;
            const stepped = applyInstructionToStage(stage, vars, inst, doc);
            stage = stepped.stage;
            vars = stepped.variables;

            switch (inst.op) {
                case "enterScene": {
                    setPlayStageState(stage);
                    syncBgm(
                        stage.bgm.name ? storyBgmUrl(stage.bgm.name, doc.region, line) : null,
                        stage.bgm.volume,
                    );
                    if (inst.transition.kind === "fadeBlack" || inst.transition.kind === "fadeWhite") {
                        const dur = Math.max(0.1, inst.transition.duration);
                        const color: StoryEffectColor = inst.transition.kind === "fadeWhite" ? "white" : "black";
                        setPlayFadeSeconds(dur);
                        setPlayEffectActive(true);
                        try {
                            flashKeyRef.current += 1;
                            setFlash({ key: flashKeyRef.current, color, seconds: dur });
                            await Promise.all([
                                applyStage(stage, { instant: false, fade: true }),
                                waitPlayMs(dur * 1000 * 0.6, generation),
                            ]);
                        } finally {
                            if (playGenRef.current === generation) setPlayEffectActive(false);
                        }
                    } else {
                        setPlayFadeSeconds(0);
                        await applyStage(stage, { instant: false, fade: false });
                    }
                    break;
                }
                case "stageAction": {
                    setPlayStageState(stage);
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
                    setPlayStageState(stage);
                    if (beat.cueType === "se") {
                        if (beat.se) playSe(storySeCandidateUrls(beat.se, doc.region, line), beat.seVolume);
                    } else {
                        setPlayEffectActive(true);
                        try {
                            if (beat.cueType === "flash") {
                                const dur = beat.duration ?? 0.4;
                                flashKeyRef.current += 1;
                                setFlash({ key: flashKeyRef.current, color: beat.color ?? "white", seconds: dur });
                                await waitPlayMs(Math.min(dur, 1.5) * 1000, generation);
                            } else if (beat.cueType === "shake") {
                                await shakeStage(beat.duration ?? 0.4);
                            } else if (beat.cueType === "wait") {
                                await waitPlayMs((beat.duration ?? 0.8) * 1000, generation);
                            }
                        } finally {
                            if (playGenRef.current === generation) setPlayEffectActive(false);
                        }
                    }
                    break;
                }
                case "varOp": {
                    setPlayLiveVariables(vars);
                    break;
                }
                case "talk": {
                    const beat = inst.beat;
                    setPlayStageState(stage);
                    setPlayLiveVariables(vars);
                    void applyStage(stage, { instant: false });
                    const body = stage.dialogue?.body ?? interpolateStoryText(beat.body, doc, vars);
                    setPlayTypedCount(reduced ? body.length : 0);
                    if (beat.se) {
                        playSe(storySeCandidateUrls(beat.se, doc.region, line), beat.seVolume);
                    }
                    if (beat.voice && beat.voice.scenarioId && beat.voice.voiceId) {
                        const urls = storyVoiceCandidateUrls(beat.voice, doc.region, line);
                        startPlayVoice(
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
                    setPlayStageState(stage);
                    void applyStage(stage, { instant: false });
                    if (beat.se) {
                        playSe(storySeCandidateUrls(beat.se, doc.region, line), beat.seVolume);
                    }
                    break;
                }
                case "telop":
                case "choice":
                case "end": {
                    setPlayStageState(stage);
                    void applyStage(stage, { instant: false });
                    break;
                }
                default:
                    break;
            }
        }

        if (playGenRef.current !== generation) return;
        setPlayStageState(frame.stage);
        setPlayLiveVariables(frame.variables);
        syncBgm(
            frame.stage.bgm.name ? storyBgmUrl(frame.stage.bgm.name, doc.region, line) : null,
            frame.stage.bgm.volume,
        );
        setPlayEffectActive(false);
        setPlayRunning(false);
        if (frame.stoppedReason !== "blocking") setPlayAuto(false);
    }, [applyStage, doc, finishStage, line, playSe, reduced, setStageTalking, shakeStage, startPlayVoice, stopActivePlayVoice, syncBgm, waitPlayMs]);

    const startPlaytestFrom = useCallback((targetNodeId?: string | null) => {
        if (!doc || !program || program.errors.length > 0) return;
        voiceTokenRef.current += 1;
        stopAllAudio();
        setPlayVoicePending(false);
        setPlayVoiceProgress(null);
        setPlayEffectActive(false);
        setStageTalking(null);
        setPlayAuto(false);
        setPlayUiHidden(false);

        const resolvedNodeId = targetNodeId && program.nodeEntryPc[targetNodeId] !== undefined
            ? targetNodeId
            : doc.startNodeId;
        const initialFrame = createInitialRuntime(program, resolvedNodeId);
        const seed = resolvedNodeId !== doc.startNodeId
            ? evaluateStageAt(doc, resolvedNodeId)
            : { stage: INITIAL_STAGE_STATE, variables: initVariables(doc) };
        void executePlayFrame([{ frame: initialFrame }], seed.stage, seed.variables, initialFrame, false);
    }, [doc, executePlayFrame, program, setStageTalking, stopAllAudio]);

    const enterPlaytest = useCallback((fromNodeId?: string) => {
        if (!doc || !program) return;
        if (program.errors.length > 0) {
            setSnack(t("page.storyMaker.v2.mode.playtestBlockedErrors", { count: program.errors.length }));
            setIssuesOpen(true);
            return;
        }
        clearClipPreview();
        setActiveDragPayload(null);
        unlockAudio();
        setWorkspaceMode("playtest");
        syncModeUrl("playtest");
        startPlaytestFrom(fromNodeId ?? doc.startNodeId);
    }, [clearClipPreview, doc, program, startPlaytestFrom, syncModeUrl, t, unlockAudio]);

    const exitPlaytest = useCallback((syncSelection = false) => {
        playGenRef.current += 1;
        voiceTokenRef.current += 1;
        skipWaitRef.current?.();
        stopAllAudio();
        setStageTalking(null);
        finishStage();
        setFlash(null);
        setPlayAuto(false);
        setPlayRunning(false);
        setPlayEffectActive(false);
        setPlayVoicePending(false);
        setPlayVoiceProgress(null);
        setPlayUiHidden(false);
        if (typeof document !== "undefined" && document.fullscreenElement === stageFullscreenRef.current) {
            void document.exitFullscreen?.().catch(() => undefined);
        }
        if (syncSelection && doc) {
            const latest = playHistoryRef.current[playHistoryRef.current.length - 1]?.frame;
            if (latest?.nodeId && doc.nodes[latest.nodeId]) {
                const targetNode = doc.nodes[latest.nodeId];
                setSelectedNodeId(latest.nodeId);
                if (
                    targetNode.type === "scene"
                    && latest.beatId
                    && targetNode.beats.some(beat => beat.id === latest.beatId)
                ) {
                    setSelectedBeatId(latest.beatId);
                } else {
                    setSelectedBeatId(null);
                }
            }
        }
        setWorkspaceMode("edit");
        syncModeUrl("edit");
    }, [doc, finishStage, setStageTalking, stopAllAudio, syncModeUrl]);

    // Honor `?mode=playtest` on initial draft load once `doc` and `program` are ready.
    useEffect(() => {
        const target = pendingAutoPlaytestRef.current;
        if (!target || !doc || !program) return;
        pendingAutoPlaytestRef.current = null;
        const timer = window.setTimeout(() => {
            if (program.errors.length === 0) {
                enterPlaytest(target);
            } else {
                setSnack(t("page.storyMaker.v2.mode.playtestBlockedErrors", { count: program.errors.length }));
                setIssuesOpen(true);
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [doc, enterPlaytest, program, t]);

    // Cleanup pending timers when unmounting editor.
    useEffect(() => () => {
        playGenRef.current += 1;
        voiceTokenRef.current += 1;
        skipWaitRef.current?.();
    }, []);

    const playLatestItem = playHistory[playHistory.length - 1] ?? null;
    const playActiveFrame = playLatestItem?.frame ?? null;
    const playCurrentChoice = workspaceMode === "playtest" && !playRunning && playActiveFrame?.stoppedReason === "choice"
        ? playActiveFrame.pendingChoice
        : null;
    const playFullDialogueBody = playStageState.dialogue?.body ?? "";
    const playIsTyping = workspaceMode === "playtest"
        && !reduced
        && playFullDialogueBody.length > 0
        && playTypedCount < playFullDialogueBody.length;
    const playDisplayedDialogue = playStageState.dialogue
        ? (reduced ? playFullDialogueBody : playFullDialogueBody.slice(0, playTypedCount))
        : undefined;

    /** Typewriter timer in playtest mode. */
    useEffect(() => {
        if (workspaceMode !== "playtest" || playRunning || reduced || !playStageState.dialogue) return;
        const targetLength = playStageState.dialogue.body.length;
        if (playTypedCount >= targetLength) return;
        const timer = window.setTimeout(() => {
            setPlayTypedCount(count => Math.min(targetLength, count + 1));
        }, CHAR_INTERVAL_MS);
        return () => window.clearTimeout(timer);
    }, [workspaceMode, playRunning, reduced, playStageState.dialogue, playTypedCount]);

    /** Drive Live2D lip-flap during playtest typing or voice playback. */
    useEffect(() => {
        if (workspaceMode !== "playtest") return;
        const activeSpeaker = playStageState.speaking;
        const mouthMoving = Boolean(activeSpeaker) && !playRunning && (playIsTyping || playVoicePending);
        setStageTalking(mouthMoving ? activeSpeaker : null);
    }, [workspaceMode, setStageTalking, playStageState.speaking, playRunning, playIsTyping, playVoicePending]);

    const snapPlayFrame = useCallback(() => {
        if (!doc) return;
        const current = playHistoryRef.current;
        const latest = current[current.length - 1];
        if (!latest) return;
        playGenRef.current += 1;
        skipWaitRef.current?.();
        stopActivePlayVoice();
        finishStage();
        const finalFrame = latest.frame;
        setPlayStageState(finalFrame.stage);
        setPlayLiveVariables(finalFrame.variables);
        setPlayTypedCount(finalFrame.stage.dialogue?.body.length ?? 0);
        setPlayEffectActive(false);
        setPlayRunning(false);
        syncBgm(
            finalFrame.stage.bgm.name ? storyBgmUrl(finalFrame.stage.bgm.name, doc.region, line) : null,
            finalFrame.stage.bgm.volume,
        );
        void applyStage(finalFrame.stage, { instant: true });
    }, [applyStage, doc, finishStage, line, stopActivePlayVoice, syncBgm]);

    const handlePlayAdvance = useCallback(() => {
        if (!program || program.errors.length > 0) return;
        unlockAudio();
        if (playUiHidden) {
            setPlayUiHidden(false);
            return;
        }
        if (playRunning) {
            snapPlayFrame();
            return;
        }
        if (playIsTyping) {
            setPlayTypedCount(playFullDialogueBody.length);
            return;
        }
        const current = playHistoryRef.current;
        const latest = current[current.length - 1];
        if (!latest || latest.frame.stoppedReason !== "blocking") return;
        const nextFrame = advanceRuntime(program, latest.frame);
        if (nextFrame === latest.frame) return;
        void executePlayFrame(
            [...current, { frame: nextFrame }],
            playStageStateRef.current,
            playLiveVariablesRef.current,
            nextFrame,
            false,
        );
    }, [
        executePlayFrame, playFullDialogueBody.length, playIsTyping, playRunning,
        playUiHidden, program, snapPlayFrame, unlockAudio,
    ]);

    const handlePlayChoose = useCallback((optionId: string, optionText: string) => {
        if (!program || program.errors.length > 0) return;
        unlockAudio();
        const current = playHistoryRef.current;
        const latest = current[current.length - 1];
        if (!latest || latest.frame.stoppedReason !== "choice") return;
        const matched = latest.frame.pendingChoice?.options.find(opt => opt.id === optionId);
        if (!matched || !matched.available) return;
        const annotated = current.map((item, idx) => (
            idx === current.length - 1 ? { ...item, chosenText: optionText } : item
        ));
        const nextFrame = advanceRuntime(program, latest.frame, optionId);
        if (nextFrame === latest.frame) return;
        void executePlayFrame(
            [...annotated, { frame: nextFrame }],
            playStageStateRef.current,
            playLiveVariablesRef.current,
            nextFrame,
            false,
        );
    }, [executePlayFrame, program, unlockAudio]);

    const handlePlayPrevious = useCallback(() => {
        if (!doc) return;
        const current = playHistoryRef.current;
        if (current.length <= 1) return;
        playGenRef.current += 1;
        skipWaitRef.current?.();
        stopActivePlayVoice();
        setStageTalking(null);
        setPlayAuto(false);
        setPlayEffectActive(false);
        setPlayRunning(false);

        const nextHistory = current.slice(0, -1).map((item, idx, arr) => (
            idx === arr.length - 1 ? { ...item, chosenText: undefined } : item
        ));
        const prevFrame = nextHistory[nextHistory.length - 1].frame;
        setPlayHistory(nextHistory);
        setPlayStageState(prevFrame.stage);
        setPlayLiveVariables(prevFrame.variables);
        setPlayTypedCount(prevFrame.stage.dialogue?.body.length ?? 0);
        syncBgm(
            prevFrame.stage.bgm.name ? storyBgmUrl(prevFrame.stage.bgm.name, doc.region, line) : null,
            prevFrame.stage.bgm.volume,
        );
        void applyStage(prevFrame.stage, { instant: true });
    }, [applyStage, doc, line, setStageTalking, stopActivePlayVoice, syncBgm]);

    const jumpPlaytestToNode = useCallback((nodeId: string) => {
        if (!program || program.errors.length > 0 || program.nodeEntryPc[nodeId] === undefined) return;
        setPlayAuto(false);
        const frame = createInitialRuntime(program, nodeId);
        void executePlayFrame([{ frame }], frame.stage, frame.variables, frame, true);
    }, [executePlayFrame, program]);

    const jumpPlaytestToBeat = useCallback((nodeId: string, beatId: string) => {
        if (!program || program.errors.length > 0 || program.nodeEntryPc[nodeId] === undefined) return;
        setPlayAuto(false);
        let cur = createInitialRuntime(program, nodeId);
        const frames: PlaytestHistoryItem[] = [{ frame: cur }];
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

        void executePlayFrame(frames, cur.stage, cur.variables, cur, true);
    }, [executePlayFrame, program]);

    /** Auto-advance timer in playtest mode. */
    useEffect(() => {
        if (
            workspaceMode !== "playtest" || !playAuto || playRunning || playIsTyping
            || playVoicePending || preloadOpen || issuesOpen || playCurrentChoice
        ) {
            return;
        }
        if (!playActiveFrame || playActiveFrame.stoppedReason !== "blocking") return;
        const bodyLen = playStageState.dialogue?.body.length
            ?? playStageState.narration?.body.length
            ?? playStageState.telop?.body.length
            ?? 0;
        const delay = Math.max(1200, Math.min(4500, bodyLen * 60 + 800));
        const timer = window.setTimeout(() => {
            handlePlayAdvance();
        }, delay);
        return () => window.clearTimeout(timer);
    }, [
        workspaceMode, playActiveFrame, playAuto, playCurrentChoice, handlePlayAdvance,
        issuesOpen, playIsTyping, preloadOpen, playRunning, playStageState, playVoicePending,
    ]);

    /** Track native fullscreen state for the playtest stage container. */
    useEffect(() => {
        const sync = () => setPlayFullscreen(document.fullscreenElement === stageFullscreenRef.current);
        document.addEventListener("fullscreenchange", sync);
        return () => document.removeEventListener("fullscreenchange", sync);
    }, []);

    const togglePlayFullscreen = useCallback(() => {
        const el = stageFullscreenRef.current;
        if (!el) return;
        if (document.fullscreenElement === el) {
            void document.exitFullscreen?.().catch(() => undefined);
        } else {
            void el.requestFullscreen?.().catch(() => undefined);
        }
    }, []);

    const playtestBacklogEntries = useMemo<LivePhaseBacklogItem[]>(() => {
        if (!doc || workspaceMode !== "playtest") return [];
        const items: LivePhaseBacklogItem[] = [];
        playHistory.forEach((entry, frameIndex) => {
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
    }, [doc, line, playHistory, workspaceMode]);

    const handlePlayReplayBacklogVoice = useCallback((item: LivePhaseBacklogItem) => {
        if (!item.voiceUrls || item.voiceUrls.length === 0) return;
        startPlayVoice(
            item.voiceUrls,
            { label: item.voiceLabel ?? "", start: item.voiceStart, end: item.voiceEnd },
            playGenRef.current,
            false,
        );
    }, [startPlayVoice]);

    // ==================== Keyboard Shortcuts (Mode-Aware) ====================

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
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
            const hasOpenOverlay = Boolean(
                metaOpen
                || issuesOpen
                || codeOpen
                || preloadOpen
                || target?.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-clip-picker-drawer]')
                || document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], [data-clip-picker-drawer]'),
            );
            if (hasOpenOverlay) return;

            if (workspaceMode === "playtest") {
                if (event.key === "Delete" || event.key === "Backspace") {
                    return;
                }
                if (event.key === "Escape") {
                    if (document.fullscreenElement) return;
                    if (playUiHidden) {
                        event.preventDefault();
                        setPlayUiHidden(false);
                        return;
                    }
                    if (!event.defaultPrevented) {
                        event.preventDefault();
                        exitPlaytest(false);
                    }
                    return;
                }
                if (event.key === " " || event.key === "Enter") {
                    if (target?.tagName === "BUTTON") return;
                    event.preventDefault();
                    handlePlayAdvance();
                } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    handlePlayAdvance();
                } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    handlePlayPrevious();
                } else if (playCurrentChoice && /^[1-4]$/.test(event.key)) {
                    const option = playCurrentChoice.options[Number(event.key) - 1];
                    if (option && option.available) {
                        event.preventDefault();
                        if (uiKit?.decideSoundUrl) playSe(uiKit.decideSoundUrl);
                        handlePlayChoose(option.id, option.text || t("page.storyMaker.player.emptyOption"));
                    }
                }
                return;
            }

            // Edit mode shortcuts
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                if (event.shiftKey) redo();
                else undo();
            } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
                event.preventDefault();
                redo();
            } else if (
                event.key === "Escape"
                && immersive
                && !event.defaultPrevented
                && !document.querySelector('[role="menu"], [data-flow-connecting="true"], [data-clip-picker-drawer]')
            ) {
                event.preventDefault();
                handleImmersiveChange(false);
            } else if (
                (event.key === "Delete" || event.key === "Backspace")
                && !event.ctrlKey
                && !event.metaKey
                && !event.altKey
                && !document.querySelector('[role="menu"], [data-clip-picker-drawer]')
            ) {
                if (activeScene && activeBeatId) {
                    event.preventDefault();
                    handleDeleteBeat(activeScene.id, activeBeatId);
                } else if (activeNode && activeNode.type !== "start" && doc && activeNode.id !== doc.startNodeId) {
                    event.preventDefault();
                    handleDeleteNode(activeNode.id);
                }
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [
        workspaceMode, playUiHidden, exitPlaytest, handlePlayAdvance, handlePlayPrevious,
        playCurrentChoice, uiKit?.decideSoundUrl, playSe, handlePlayChoose, t,
        undo, redo, immersive, handleImmersiveChange,
        metaOpen, issuesOpen, codeOpen, preloadOpen,
        activeScene, activeBeatId, activeNode, doc,
        handleDeleteBeat, handleDeleteNode,
    ]);

    // ==================== Edit Preview & Graph Actions ====================

    const previewChoice = useMemo<GameStageChoiceProp | null>(() => {
        if (!doc || !activeNode || activeNode.type !== "choice") return null;
        return {
            id: activeNode.id,
            options: activeNode.options.map(opt => ({
                id: opt.id,
                text: interpolateStoryText(opt.text, doc, evaluated.variables),
                available: opt.condition ? evaluateCondition(opt.condition, evaluated.variables) : true,
            })),
        };
    }, [doc, activeNode, evaluated.variables]);

    const previewingCastMember = useMemo(
        () => (doc && previewingCastKey ? doc.cast.find(member => member.key === previewingCastKey) ?? null : null),
        [doc, previewingCastKey],
    );

    const replayActionInfo = useMemo(() => {
        if (!doc || !activeBeat) return null;
        if (activeBeat.kind === "talk" && activeBeat.speakerKey && (activeBeat.motion || activeBeat.facial)) {
            const member = doc.cast.find(item => item.key === activeBeat.speakerKey);
            if (!member) return null;
            return { member, clip: { motion: activeBeat.motion, facial: activeBeat.facial } };
        }
        if (activeBeat.kind === "stageAction" && activeBeat.castKey && (activeBeat.motion || activeBeat.facial)) {
            const member = doc.cast.find(item => item.key === activeBeat.castKey);
            if (!member) return null;
            return { member, clip: { motion: activeBeat.motion, facial: activeBeat.facial } };
        }
        return null;
    }, [doc, activeBeat]);

    const handlePreviewClip = useCallback((castMember: StoryCastMember, clip?: { motion?: string; facial?: string }) => {
        if (stagePhase.kind !== "ready") {
            setSnack(t("page.storyMaker.nle.previewNeedsWebgpu"));
            return;
        }
        void previewClip(castMember, clip);
    }, [previewClip, stagePhase.kind, t]);

    const handlePreviewEffect = useCallback((cue: { cueType: "flash" | "shake"; color?: StoryEffectColor; duration?: number }) => {
        if (cue.cueType === "flash") {
            flashKeyRef.current += 1;
            setFlash({ key: flashKeyRef.current, color: cue.color ?? "white", seconds: cue.duration ?? 0.4 });
        } else {
            void shakeStage(cue.duration ?? 0.4);
        }
    }, [shakeStage]);

    const defaultNewNodeTitle = useCallback((currentDoc: StoryDocument, nodeType: "scene" | "choice" | "condition" | "end") => {
        if (nodeType === "scene") {
            const count = Object.values(currentDoc.nodes).filter(n => n.type === "scene").length + 1;
            return t("page.storyMaker.flow.newSceneDefaultName", { n: count });
        }
        return t(`page.storyMaker.v2.nodeTypes.${nodeType}`);
    }, [t]);

    const nextNodePos = useCallback((currentDoc: StoryDocument): StoryNodePos => {
        const anchor = activeNodeId ? currentDoc.nodes[activeNodeId] : undefined;
        if (anchor) {
            return { x: anchor.pos.x + GRAPH_COL_GAP, y: anchor.pos.y + 40 };
        }
        const count = Object.keys(currentDoc.nodes).length;
        return { x: GRAPH_ORIGIN_X + count * 48, y: GRAPH_ORIGIN_Y + count * 32 };
    }, [activeNodeId]);

    const handleAddNode = useCallback((nodeType: "scene" | "choice" | "condition" | "end", pos?: StoryNodePos) => {
        if (!doc) return;
        const targetPos = pos ?? nextNodePos(doc);
        const title = defaultNewNodeTitle(doc, nodeType);
        const res = createNode(doc, nodeType, targetPos, { title });
        if (!res.node) return;
        const createdId = res.node.id;
        commit(() => res.doc);
        setSelectedNodeId(createdId);
        setSelectedBeatId(null);
    }, [commit, defaultNewNodeTitle, doc, nextNodePos]);

    const handleContinueScene = useCallback((sceneId: string, options?: ContinueSceneOptions) => {
        if (!doc) return;
        const source = doc.nodes[sceneId];
        if (!source || source.type !== "scene") return;
        const baseTitle = source.title.trim() || defaultNewNodeTitle(doc, "scene");
        const suffix = t("page.storyMaker.v2.scene.continueSuffix");
        const title = options?.title ?? `${baseTitle} (${suffix})`;
        const res = continueAndCutScene(doc, sceneId, { ...options, title });
        if (!res.node) return;
        const createdNode = res.node;
        commit(() => res.doc);
        setSelectedNodeId(createdNode.id);
        setSelectedBeatId(createdNode.beats[0]?.id ?? null);
    }, [commit, defaultNewNodeTitle, doc, t]);

    const handleDuplicateNode = useCallback((nodeId: string) => {
        if (!doc) return;
        const res = duplicateNode(doc, nodeId);
        if (!res.node) return;
        const createdId = res.node.id;
        commit(() => res.doc);
        setSelectedNodeId(createdId);
        setSelectedBeatId(null);
    }, [commit, doc]);

    const handleDuplicateBeat = useCallback((nodeId: string, beatId: string) => {
        if (!doc) return;
        const res = duplicateBeat(doc, nodeId, beatId);
        if (!res.beat) return;
        const createdBeatId = res.beat.id;
        commit(() => res.doc);
        setSelectedNodeId(nodeId);
        setSelectedBeatId(createdBeatId);
    }, [commit, doc]);

    const handleDropPayload = useCallback((payload: StoryDragPayload, target: StoryDropTarget) => {
        setActiveDragPayload(null);
        if (!doc) return;
        const enrichedTarget: StoryDropTarget = target.zone === "canvas" && payload.kind === "node" && !target.title
            ? { ...target, title: defaultNewNodeTitle(doc, payload.nodeType) }
            : target;
        const res = applyDragPayloadToTarget(doc, payload, enrichedTarget);
        if (res.doc === doc) return;
        commit(() => res.doc);
        if (res.nodeId) {
            setSelectedNodeId(res.nodeId);
            setSelectedBeatId(res.beatId ?? null);
        }
    }, [commit, defaultNewNodeTitle, doc]);

    const handleQuickDrop = useCallback((payload: StoryDragPayload) => {
        if (!doc) return;
        if (payload.kind === "node") {
            handleAddNode(payload.nodeType);
            return;
        }
        const targetScene = activeScene ?? Object.values(doc.nodes).find((n): n is SceneNode => n.type === "scene") ?? null;
        if (!targetScene) {
            setSnack(t("page.storyMaker.v2.palette.dropTargetCanvas"));
            return;
        }
        const zones = acceptsTarget(payload);
        let zone = zones[0];
        if (
            payload.kind === "asset-cast"
            && targetScene.stageCast.mode === "set"
            && targetScene.stageCast.actors.some(a => a.castKey === payload.castKey)
        ) {
            zone = "beat-track";
        }
        if (!zone || zone === "canvas") return;
        const res = applyDragPayloadToTarget(doc, payload, { zone, nodeId: targetScene.id });
        if (res.doc === doc) return;
        commit(() => res.doc);
        setSelectedNodeId(targetScene.id);
        setSelectedBeatId(res.beatId ?? null);
    }, [activeScene, commit, doc, handleAddNode, t]);

    const handleUpdateMeta = (values: StoryMetaValues) => {
        commit(current => applyMetaValuesToDoc(current, values));
        setMetaOpen(false);
    };

    const handleApplyCode = (nextDoc: StoryDocument) => {
        commit(() => nextDoc);
        const nextNodeId = activeNodeId && nextDoc.nodes[activeNodeId]
            ? activeNodeId
            : pickInitialNodeId(nextDoc);
        setSelectedNodeId(nextNodeId);
        setSelectedBeatId(null);
    };

    const handleCreateStarterHere = async () => {
        const created = await createDraft(buildStarter("jp"));
        router.push(localizePath(`/story-maker/edit?id=${encodeURIComponent(created.id)}`, routeLocale));
    };

    const handleSplitterPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        splitDragRef.current = { pointerId: event.pointerId };
    };

    const handleSplitterPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!splitDragRef.current || splitDragRef.current.pointerId !== event.pointerId) return;
        const container = nleContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        if (rect.height <= 0) return;
        const rawPct = ((event.clientY - rect.top) / rect.height) * 100;
        const clamped = Math.min(MAX_TOP_SPLIT_PCT, Math.max(MIN_TOP_SPLIT_PCT, Math.round(rawPct * 10) / 10));
        setTopSplitPct(clamped);
    };

    const handleSplitterPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (splitDragRef.current?.pointerId === event.pointerId) {
            splitDragRef.current = null;
        }
    };

    if (loading) {
        return <PageContainer wide><LoadingState /></PageContainer>;
    }

    if (loadError || !doc || !draftId || !program) {
        return (
            <PageContainer>
                <EmptyState
                    title={t(loadError === "unavailable" ? "page.storyMaker.storage.unavailableTitle" : "page.storyMaker.editor.notFoundTitle")}
                    description={t(loadError === "unavailable" ? "page.storyMaker.storage.unavailableDescription" : "page.storyMaker.editor.notFoundDescription")}
                    action={(
                        <div className="mt-2 flex flex-wrap justify-center gap-2">
                            <Button variant="filled" icon={mdArrowBack} href="/story-maker">
                                {t("page.storyMaker.action.backToDrafts")}
                            </Button>
                            {loadError !== "unavailable" && (
                                <Button variant="tonal" icon={mdStar} onClick={() => void handleCreateStarterHere()}>
                                    {t("page.storyMaker.landing.tryStarter")}
                                </Button>
                            )}
                        </div>
                    )}
                />
            </PageContainer>
        );
    }

    const isPlaytest = workspaceMode === "playtest";
    const saveStatusLabel = t(`page.storyMaker.editor.saveStatus.${saveStatus}`);
    const modelArray = models ?? [];

    // Derived Playtest presentation state
    const playStoppedReason = playActiveFrame?.stoppedReason ?? null;
    const playReachedEnding = isPlaytest && !playRunning && playStoppedReason === "end" && Boolean(playActiveFrame?.ending);
    const playLooped = isPlaytest && !playRunning && playStoppedReason === "loop";
    const playDisconnected = isPlaytest && !playRunning && playStoppedReason === "disconnected";
    const playEnded = playReachedEnding || playLooped || playDisconnected;
    const playHasAnyContent = Object.values(doc.nodes).some(node => node.type !== "start");
    const playEmptyStory = isPlaytest && !playHasAnyContent;
    const playStageClickBlocked = Boolean(playCurrentChoice) || playEnded || playEmptyStory;
    const playShowEndSign = isPlaytest && !playUiHidden && !playRunning && !playIsTyping && !playAuto && !playCurrentChoice && Boolean(playStageState.dialogue);
    const playDisplayState: StoryStageState = playUiHidden
        ? { ...playStageState, place: null, dialogue: null, narration: null, telop: null }
        : playStageState;
    const playRuntimePhase: StoryRuntimePhase = playEnded || playEmptyStory
        ? "ended"
        : playCurrentChoice
            ? "choice"
            : playEffectActive
                ? "effect"
                : playIsTyping
                    ? "typing"
                    : playVoicePending
                        ? "voice"
                        : playRunning
                            ? "effect"
                            : playAuto
                                ? "auto"
                                : "waiting";
    const playPhaseMeta = PHASE_META[playRuntimePhase];

    const playActiveNode = playActiveFrame?.nodeId ? doc.nodes[playActiveFrame.nodeId] ?? null : null;
    const playActiveNodeLabel = getNodeDisplayLabel(playActiveNode, t);
    const playActiveBeatInfo = (() => {
        if (!playActiveNode || playActiveNode.type !== "scene" || !playActiveFrame?.beatId) return null;
        const idx = playActiveNode.beats.findIndex(item => item.id === playActiveFrame.beatId);
        if (idx < 0) return null;
        const beat = playActiveNode.beats[idx];
        return {
            index: idx,
            total: playActiveNode.beats.length,
            beat,
            summary: summarizeActiveBeat(beat, doc, playLiveVariables, t),
        };
    })();

    return (
        <div
            key="editor-root"
            className={cn(
                "min-w-0",
                immersive
                    ? "fixed inset-0 z-[150] flex flex-col gap-2.5 overflow-hidden bg-surface p-2 sm:p-3"
                    : "mx-auto w-full max-w-[1720px] space-y-2.5 px-4 py-3 sm:px-6 sm:py-4",
            )}
        >
            {/* Top Editor Toolbar */}
            <Surface
                tone="low"
                radius="lg"
                className={cn(
                    "flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2 transition-colors",
                    isPlaytest && "border border-primary/50 bg-primary-container/15",
                )}
            >
                <div className="flex min-w-[min(12rem,100%)] flex-1 items-center gap-1.5 sm:gap-2">
                    <IconButton
                        size="s"
                        icon={mdArrowBack}
                        label={t("page.storyMaker.action.backToDrafts")}
                        href="/story-maker"
                    />
                    <button
                        type="button"
                        disabled={isPlaytest}
                        onClick={() => setMetaOpen(true)}
                        className={cn(
                            "state-layer focus-ring min-w-0 flex-1 rounded-md3-md px-2 py-1 text-left",
                            isPlaytest ? "cursor-default" : "cursor-pointer",
                        )}
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate type-title-m text-on-surface">
                                {doc.meta.title || t("page.storyMaker.untitled")}
                            </span>
                            <span className="shrink-0 rounded-md3-full bg-tertiary-container px-1.5 py-0.5 type-label-s text-on-tertiary-container">
                                {t("page.storyMaker.betaBadge")}
                            </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 type-label-s text-on-surface-variant">
                            <span className="truncate">{t(SERVER_LABEL_KEYS[doc.region])}</span>
                            <span>·</span>
                            <span className={cn("truncate", saveStatus === "error" && "text-error")}>{saveStatusLabel}</span>
                        </span>
                    </button>
                    {saveStatus === "error" && (
                        <Button size="xs" variant="text" color="error" className="shrink-0" onClick={() => void flushSave(draftId, doc)}>
                            {t("common.action.retry")}
                        </Button>
                    )}
                </div>

                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
                    {/* In-Place Edit <-> Playtest Mode Switcher */}
                    <SegmentedButton<WorkspaceMode>
                        density={-1}
                        value={workspaceMode}
                        onValueChange={(next) => {
                            if (next === "playtest") enterPlaytest();
                            else exitPlaytest(false);
                        }}
                        aria-label={t("page.storyMaker.v2.mode.edit")}
                        className="w-auto shrink-0"
                        options={[
                            { value: "edit", label: t("page.storyMaker.v2.mode.edit"), icon: mdEdit },
                            { value: "playtest", label: t("page.storyMaker.v2.mode.playtest"), icon: mdPlayArrowFill },
                        ]}
                    />

                    <IconButton
                        size="s"
                        icon={mdUndo}
                        label={t("page.storyMaker.editor.undo")}
                        disabled={isPlaytest || past.length === 0}
                        onClick={undo}
                    />
                    <IconButton
                        size="s"
                        icon={mdRedo}
                        label={t("page.storyMaker.editor.redo")}
                        disabled={isPlaytest || future.length === 0}
                        onClick={redo}
                    />
                    <IconButton
                        size="s"
                        icon={mdSettings}
                        label={t("page.storyMaker.editor.storySettings")}
                        disabled={isPlaytest}
                        onClick={() => setMetaOpen(true)}
                    />

                    {/* Compiler Status Pill */}
                    {errorCount > 0 ? (
                        <Button
                            size="s"
                            variant="tonal"
                            color="error"
                            icon={mdErrorFill}
                            className="px-3 sm:px-3.5"
                            onClick={() => setIssuesOpen(true)}
                        >
                            {t("page.storyMaker.v2.compiler.statusErrors", { count: errorCount })}
                        </Button>
                    ) : warningCount > 0 ? (
                        <Button
                            size="s"
                            variant="tonal"
                            color="tertiary"
                            icon={mdWarning}
                            className="px-3 sm:px-3.5"
                            onClick={() => setIssuesOpen(true)}
                        >
                            {t("page.storyMaker.v2.compiler.statusWarnings", { count: warningCount })}
                        </Button>
                    ) : (
                        <Button
                            size="s"
                            variant="outlined"
                            icon={mdCheckCircle}
                            className="px-3 sm:px-3.5"
                            onClick={() => setIssuesOpen(true)}
                        >
                            {t("page.storyMaker.v2.compiler.statusOk")}
                        </Button>
                    )}

                    <Button
                        size="s"
                        variant="tonal"
                        icon={mdCode}
                        disabled={isPlaytest}
                        className="px-3 sm:px-3.5"
                        onClick={() => setCodeOpen(true)}
                    >
                        {t("page.storyMaker.v2.script.buttonLabel")}
                    </Button>
                    <Button
                        size="s"
                        variant="outlined"
                        icon={mdDownload}
                        className="px-3 sm:px-3.5"
                        onClick={() => setPreloadOpen(true)}
                    >
                        {t("page.storyMaker.preload.buttonLabel")}
                    </Button>
                    <Button
                        size="s"
                        variant={immersive ? "tonal" : "outlined"}
                        icon={immersive ? mdCloseFullscreen : mdOpenInFull}
                        className="px-3 sm:px-3.5"
                        onClick={() => handleImmersiveChange(!immersive)}
                    >
                        {t(immersive ? "page.storyMaker.nle.exitImmersive" : "page.storyMaker.nle.enterImmersive")}
                    </Button>
                </div>
            </Surface>

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

            {/* Desktop 3-Pane NLE Cockpit (lg: 1024px+ upward) */}
            <div
                ref={nleContainerRef}
                style={{ "--nle-top-h": `${topSplitPct}%` } as React.CSSProperties}
                className={cn(
                    "flex min-w-0 flex-col gap-0 overflow-hidden",
                    immersive
                        ? "min-h-0 flex-1"
                        : "h-[calc(100svh-8.5rem)] min-h-[42rem]",
                )}
            >
                {/* Top Row: Left Bin/LivePhase | Center Persistently Mounted 16:9 Stage | Right Inspector/Playtest Handoff */}
                <div
                    key="top-workspace-row"
                    className="grid h-[var(--nle-top-h)] min-h-0 min-w-0 shrink-0 gap-2.5 lg:grid-cols-[17.5rem_minmax(0,1fr)_20.5rem] xl:grid-cols-[19.5rem_minmax(0,1fr)_23rem]"
                >
                    {/* Top-Left Pane: Edit Bin OR Read-Only Playtest LivePhasePanel */}
                    <Surface
                        key="desktop-left-pane"
                        tone="low"
                        radius="xl"
                        className={cn(
                            "flex min-h-0 flex-col overflow-hidden",
                            isPlaytest && "border border-primary/35",
                        )}
                    >
                        {isPlaytest ? (
                            <LivePhasePanel
                                doc={doc}
                                program={program}
                                frame={playActiveFrame}
                                runtimePhase={playRuntimePhase}
                                stageState={playStageState}
                                liveVariables={playLiveVariables}
                                activeVoiceProgress={playVoiceProgress}
                                backlog={playtestBacklogEntries}
                                onReplayVoice={handlePlayReplayBacklogVoice}
                                onSelectNode={jumpPlaytestToNode}
                                onSelectBeat={jumpPlaytestToBeat}
                                docked
                                className="min-h-0 flex-1"
                            />
                        ) : (
                            <StoryEditorBin
                                doc={doc}
                                assetSource={assetSource}
                                models={modelArray}
                                modelInfo={modelInfo}
                                modelList={modelList}
                                onRetryModels={retryModels}
                                activeNodeId={activeNodeId}
                                previewingCastId={previewingCastKey}
                                onDocChange={commit}
                                onSelectNode={handleSelectNode}
                                onQuickDrop={handleQuickDrop}
                                onDragPayloadStart={setActiveDragPayload}
                                onPreviewCast={handlePreviewClip}
                                onClearPreview={clearClipPreview}
                                className="min-h-0 flex-1"
                            />
                        )}
                    </Surface>

                    {/* Top-Center Pane: Persistently Mounted Live 16:9 Stage + Mode-Aware Monitor/Transport Strip */}
                    <div
                        key="center-stage-pane"
                        ref={stageFullscreenRef}
                        className={cn(
                            "flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden",
                            playFullscreen && "h-dvh w-full justify-center bg-surface p-4",
                        )}
                    >
                        <div
                            key="stage-fit-outer"
                            className={cn(
                                "flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md3-xl bg-surface-container-low p-1.5 transition-shadow [container-type:size]",
                                isPlaytest
                                    ? "border-2 border-primary ring-2 ring-primary/35"
                                    : "border border-outline-variant/60",
                            )}
                        >
                            <div
                                key="stage-fit-inner"
                                className="mx-auto h-[min(100cqh,calc(100cqw*9/16))] w-[min(100cqw,calc(100cqh*16/9))]"
                            >
                                <StoryStageView
                                    key="live-stage"
                                    doc={doc}
                                    state={isPlaytest ? playDisplayState : editStageState}
                                    line={line}
                                    hostRef={stageHostRef}
                                    phase={stagePhase}
                                    problems={stageProblems}
                                    loadingActors={loadingActors}
                                    onRetry={retryStage}
                                    uiKit={uiKit}
                                    uiHidden={isPlaytest && playUiHidden}
                                    dialogueText={isPlaytest ? (playUiHidden ? undefined : playDisplayedDialogue) : undefined}
                                    autoPlay={isPlaytest && playAuto}
                                    showEndSign={isPlaytest ? playShowEndSign : (Boolean(editStageState.dialogue) && !previewChoice)}
                                    choice={isPlaytest ? (playUiHidden ? null : playCurrentChoice) : previewChoice}
                                    choiceInteractive={isPlaytest && !playUiHidden && Boolean(playCurrentChoice)}
                                    onChoose={isPlaytest ? handlePlayChoose : undefined}
                                    onChoiceSound={isPlaytest ? playSe : undefined}
                                    showMenuButton={false}
                                    animateCinemascope={isPlaytest}
                                    flash={flash}
                                    fadeSeconds={isPlaytest ? playFadeSeconds : undefined}
                                    compactStatus
                                    onClick={isPlaytest && !playStageClickBlocked ? handlePlayAdvance : undefined}
                                    className={cn("h-full w-full", isPlaytest && !playStageClickBlocked && "cursor-pointer")}
                                >
                                    {/* Playtest Multi-Ending Achievement Overlay Card */}
                                    {isPlaytest && !playUiHidden && playReachedEnding && playActiveFrame?.ending && (
                                        <div
                                            className="absolute inset-0 z-[25] flex items-center justify-center bg-scrim/55 p-3"
                                            onClick={event => event.stopPropagation()}
                                        >
                                            <Surface
                                                tone="high"
                                                radius="xl"
                                                elevation={2}
                                                className="flex max-h-full w-full max-w-md flex-col items-center gap-2.5 overflow-y-auto border border-primary/30 p-5 text-center"
                                            >
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-container px-3 py-1 type-label-m text-on-primary-container">
                                                    <Icon path={mdFlag} size={16} className="shrink-0" />
                                                    <span>{t("page.storyMaker.v2.ending.achievedBadge")}</span>
                                                </span>
                                                <p className="break-words type-title-l text-on-surface">
                                                    {playActiveFrame.ending.title || t("page.storyMaker.player.endTitle")}
                                                </p>
                                                <p className="whitespace-pre-wrap break-words type-body-m text-on-surface-variant">
                                                    {playActiveFrame.ending.subtitle || t("page.storyMaker.player.endDescription")}
                                                </p>
                                                {doc.variables.length > 0 && (
                                                    <div className="w-full min-w-0 space-y-1.5 rounded-md3-md border border-outline-variant/50 bg-surface-container p-2.5 text-left">
                                                        <div className="flex items-center gap-1.5 type-label-s text-on-surface-variant">
                                                            <Icon path={mdCalculate} size={14} className="shrink-0 text-primary" />
                                                            <span>{t("page.storyMaker.v2.ending.finalVariables")}</span>
                                                        </div>
                                                        <div className="flex min-w-0 flex-wrap gap-1.5">
                                                            {doc.variables.map((variable) => {
                                                                const val = playActiveFrame.variables[variable.id] ?? variable.initial;
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
                                                    <Button variant="filled" icon={mdReplay} onClick={() => startPlaytestFrom(doc.startNodeId)}>
                                                        {t("page.storyMaker.v2.ending.replayOtherEndings")}
                                                    </Button>
                                                    <Button variant="tonal" icon={mdEdit} onClick={() => exitPlaytest(true)}>
                                                        {t("page.storyMaker.v2.mode.returnToEdit")}
                                                    </Button>
                                                </div>
                                            </Surface>
                                        </div>
                                    )}

                                    {/* Playtest Generic End / Loop / Empty Overlay */}
                                    {isPlaytest && !playUiHidden && !playReachedEnding && (playEnded || playEmptyStory) && (
                                        <div
                                            className="absolute inset-0 z-[25] flex items-center justify-center bg-scrim/45 p-3"
                                            onClick={event => event.stopPropagation()}
                                        >
                                            <Surface
                                                tone="high"
                                                radius="xl"
                                                elevation={2}
                                                className="flex max-h-full w-full max-w-sm flex-col items-center gap-2.5 overflow-y-auto p-5 text-center"
                                            >
                                                <p className="type-title-l text-on-surface">
                                                    {t(
                                                        playEmptyStory
                                                            ? "page.storyMaker.player.emptyTitle"
                                                            : playLooped
                                                                ? "page.storyMaker.player.loopTitle"
                                                                : "page.storyMaker.player.endTitle",
                                                    )}
                                                </p>
                                                <p className="type-body-m text-on-surface-variant">
                                                    {t(
                                                        playEmptyStory
                                                            ? "page.storyMaker.player.emptyDescription"
                                                            : playLooped
                                                                ? "page.storyMaker.player.loopDescription"
                                                                : "page.storyMaker.player.endDescription",
                                                    )}
                                                </p>
                                                <div className="flex flex-wrap justify-center gap-2 pt-1">
                                                    {!playEmptyStory && (
                                                        <Button variant="filled" icon={mdReplay} onClick={() => startPlaytestFrom(doc.startNodeId)}>
                                                            {t("page.storyMaker.player.replay")}
                                                        </Button>
                                                    )}
                                                    <Button variant="tonal" icon={mdEdit} onClick={() => exitPlaytest(true)}>
                                                        {t("page.storyMaker.v2.mode.returnToEdit")}
                                                    </Button>
                                                </div>
                                            </Surface>
                                        </div>
                                    )}

                                    {/* Playtest Unhide UI Button */}
                                    {isPlaytest && playUiHidden && (
                                        <div className="absolute bottom-3 right-3 z-30">
                                            <IconButton
                                                variant="tonal"
                                                icon={mdVisibility}
                                                label={t("page.storyMaker.player.showUi")}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setPlayUiHidden(false);
                                                }}
                                            />
                                        </div>
                                    )}
                                </StoryStageView>
                            </div>
                        </div>

                        {/* Mode-Aware Monitor / Transport Strip */}
                        <Surface
                            tone="low"
                            radius="lg"
                            className={cn(
                                "flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5",
                                isPlaytest && "border border-primary/40 bg-primary-container/15",
                            )}
                        >
                            {isPlaytest ? (
                                <>
                                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
                                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 type-label-s text-on-primary">
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    "inline-block size-2 shrink-0 rounded-full bg-on-primary",
                                                    !reduced && "animate-pulse",
                                                )}
                                            />
                                            <span>{t("page.storyMaker.v2.mode.playtestBadge")}</span>
                                        </span>

                                        <IconButton
                                            size="xs"
                                            icon={mdSkipPrevious}
                                            label={t("page.storyMaker.player.previous")}
                                            disabled={playHistory.length <= 1}
                                            onClick={handlePlayPrevious}
                                        />
                                        <Button
                                            size="xs"
                                            variant="filled"
                                            icon={mdSkipNext}
                                            disabled={Boolean(playCurrentChoice) || playEnded || playEmptyStory}
                                            onClick={handlePlayAdvance}
                                        >
                                            {t("page.storyMaker.player.next")}
                                        </Button>
                                        <IconButton
                                            size="xs"
                                            icon={mdReplay}
                                            label={t("page.storyMaker.player.replay")}
                                            disabled={playEmptyStory}
                                            onClick={() => startPlaytestFrom(doc.startNodeId)}
                                        />
                                        <Button
                                            size="xs"
                                            variant={playAuto ? "filled" : "tonal"}
                                            selected={playAuto}
                                            icon={mdAutoplay}
                                            disabled={playEmptyStory || playEnded}
                                            onClick={() => setPlayAuto(on => !on)}
                                        >
                                            {t("page.storyMaker.player.auto")}
                                        </Button>
                                    </div>

                                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                                        {audioBlocked && !playEmptyStory && !playEnded && (
                                            <Button
                                                size="xs"
                                                variant="tonal"
                                                icon={mdVolumeUp}
                                                onClick={() => unlockAudio()}
                                            >
                                                {t("page.storyMaker.player.tapToEnableAudio")}
                                            </Button>
                                        )}
                                        <IconButton
                                            size="xs"
                                            icon={playUiHidden ? mdVisibility : mdVisibilityOff}
                                            label={t(playUiHidden ? "page.storyMaker.player.showUi" : "page.storyMaker.player.hideUi")}
                                            onClick={() => setPlayUiHidden(hidden => !hidden)}
                                        />
                                        <IconButton
                                            size="xs"
                                            icon={playMuted || playVolume === 0 ? mdVolumeOff : mdVolumeUp}
                                            label={t(playMuted ? "page.storyMaker.player.unmute" : "page.storyMaker.player.mute")}
                                            onClick={togglePlayMute}
                                        />
                                        <Slider
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={playMuted ? 0 : playVolume}
                                            onValueChange={handlePlayVolumeChange}
                                            aria-label={t("page.storyMaker.player.volume")}
                                            formatValue={val => `${Math.round(val * 100)}%`}
                                            className="h-6 w-16"
                                        />
                                        <IconButton
                                            size="xs"
                                            icon={playFullscreen ? mdFullscreenExit : mdFullscreen}
                                            label={t(playFullscreen ? "page.storyMaker.player.exitFullscreen" : "page.storyMaker.player.fullscreen")}
                                            onClick={togglePlayFullscreen}
                                        />
                                        <Button
                                            size="xs"
                                            variant="tonal"
                                            icon={mdEdit}
                                            onClick={() => exitPlaytest(false)}
                                        >
                                            {t("page.storyMaker.v2.mode.returnToEdit")}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-container px-2.5 py-0.5 type-label-s text-on-surface-variant">
                                            <Icon path={mdEdit} size={13} className="shrink-0" />
                                            <span>{t("page.storyMaker.v2.mode.editBadge")}</span>
                                        </span>

                                        {activeNode && (
                                            <span className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md3-full bg-surface-container px-2.5 py-0.5 type-label-m text-on-surface">
                                                <span className="shrink-0 type-label-s text-primary">
                                                    {t(`page.storyMaker.v2.nodeTypes.${activeNode.type}`)}
                                                </span>
                                                <span className="min-w-0 truncate">{getNodeDisplayName(activeNode, t)}</span>
                                            </span>
                                        )}

                                        {activeScene && activeScene.beats.length > 0 && (
                                            <div className="inline-flex items-center gap-0.5">
                                                <IconButton
                                                    size="xs"
                                                    icon={mdChevronLeft}
                                                    label={t("page.storyMaker.editor.prevStep")}
                                                    disabled={activeBeatIndex <= 0}
                                                    onClick={() => {
                                                        const target = activeScene.beats[Math.max(0, activeBeatIndex - 1)];
                                                        if (target) setSelectedBeatId(target.id);
                                                    }}
                                                />
                                                <span className="min-w-12 text-center font-mono type-label-s text-on-surface-variant">
                                                    {activeBeatIndex >= 0
                                                        ? `${activeBeatIndex + 1} / ${activeScene.beats.length}`
                                                        : `0 / ${activeScene.beats.length}`}
                                                </span>
                                                <IconButton
                                                    size="xs"
                                                    icon={mdChevronRight}
                                                    label={t("page.storyMaker.editor.nextStep")}
                                                    disabled={activeBeatIndex >= activeScene.beats.length - 1}
                                                    onClick={() => {
                                                        const nextIdx = activeBeatIndex < 0 ? 0 : Math.min(activeScene.beats.length - 1, activeBeatIndex + 1);
                                                        const target = activeScene.beats[nextIdx];
                                                        if (target) setSelectedBeatId(target.id);
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {isSoloPreview && previewingCastMember && (
                                            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md3-full bg-tertiary-container px-2.5 py-0.5 type-label-s text-on-tertiary-container">
                                                <span className="truncate">
                                                    {t("page.storyMaker.nle.previewingModel", {
                                                        name: previewingCastMember.name || previewingCastMember.key,
                                                    })}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={clearClipPreview}
                                                    className="state-layer focus-ring inline-flex cursor-pointer items-center gap-0.5 rounded-md3-full bg-surface-container-lowest/70 px-1.5 py-0.5 type-label-s text-on-surface"
                                                >
                                                    <Icon path={mdClose} size={12} />
                                                    <span>{t("page.storyMaker.nle.exitPreview")}</span>
                                                </button>
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                                        {replayActionInfo && (
                                            <Button
                                                size="xs"
                                                variant="tonal"
                                                color="tertiary"
                                                icon={mdPlayArrow}
                                                disabled={stagePhase.kind !== "ready"}
                                                title={stagePhase.kind !== "ready" ? t("page.storyMaker.nle.previewNeedsWebgpu") : undefined}
                                                onClick={() => handlePreviewClip(replayActionInfo.member, replayActionInfo.clip)}
                                            >
                                                {t("page.storyMaker.nle.replayAction")}
                                            </Button>
                                        )}
                                        {activeScene && (
                                            <Button
                                                size="xs"
                                                variant="tonal"
                                                icon={mdPlayCircle}
                                                onClick={() => enterPlaytest(activeScene.id)}
                                            >
                                                {t("page.storyMaker.v2.ending.playFromScene")}
                                            </Button>
                                        )}
                                    </div>
                                </>
                            )}
                        </Surface>
                    </div>

                    {/* Top-Right Pane: NodeInspector (Edit) OR Read-Only Playtest Status & Quick-Edit Handoff */}
                    <Surface
                        key="desktop-inspector"
                        tone="low"
                        radius="xl"
                        className={cn(
                            "flex min-h-0 flex-col overflow-hidden",
                            isPlaytest && "border border-primary/35",
                        )}
                    >
                        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
                            {isPlaytest ? (
                                <div className="min-w-0 space-y-3">
                                    <Banner tone="info">
                                        {t("page.storyMaker.v2.mode.playtestReadonlyBanner")}
                                    </Banner>

                                    <Button
                                        variant="filled"
                                        icon={mdEdit}
                                        className="w-full justify-center"
                                        onClick={() => exitPlaytest(true)}
                                    >
                                        {t("page.storyMaker.v2.mode.stopAndEditHere")}
                                    </Button>

                                    {/* Current Running Node & Beat Summary */}
                                    <div className="min-w-0 space-y-2 rounded-md3-md border border-outline-variant/50 bg-surface-container p-3">
                                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
                                            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 type-label-s", playPhaseMeta.chipClass)}>
                                                <Icon path={playPhaseMeta.icon} size={13} className="shrink-0" />
                                                <span>{t(playPhaseMeta.labelKey)}</span>
                                            </span>
                                            {playActiveNode && (
                                                <span className="rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 type-label-s text-on-surface-variant">
                                                    {t(`page.storyMaker.v2.nodeTypes.${playActiveNode.type}`)}
                                                </span>
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <div className="type-label-s text-on-surface-variant">
                                                {t("page.storyMaker.phase.currentNode")}
                                            </div>
                                            <p className="truncate type-title-s text-on-surface">
                                                {playActiveNodeLabel}
                                            </p>
                                        </div>

                                        {playActiveBeatInfo && (
                                            <div className="min-w-0 space-y-1 border-t border-outline-variant/40 pt-2">
                                                <div className="flex items-center justify-between gap-2 type-label-s text-on-surface-variant">
                                                    <span className="rounded-md3-xs bg-secondary-container px-1.5 py-0.5 text-on-secondary-container">
                                                        {t(`page.storyMaker.v2.beats.${playActiveBeatInfo.beat.kind}`)}
                                                    </span>
                                                    <span className="font-mono tabular-nums">
                                                        {t("page.storyMaker.phase.currentStep", {
                                                            current: playActiveBeatInfo.index + 1,
                                                            total: playActiveBeatInfo.total,
                                                        })}
                                                    </span>
                                                </div>
                                                <p className="line-clamp-3 break-words type-body-s text-on-surface">
                                                    {playActiveBeatInfo.summary}
                                                </p>
                                            </div>
                                        )}

                                        {playReachedEnding && playActiveFrame?.ending && (
                                            <div className="min-w-0 space-y-1 border-t border-outline-variant/40 pt-2">
                                                <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-2 py-0.5 type-label-s text-on-primary-container">
                                                    <Icon path={mdFlag} size={12} className="shrink-0" />
                                                    <span>{t("page.storyMaker.v2.ending.achievedBadge")}</span>
                                                </span>
                                                <p className="break-words type-title-s text-on-surface">
                                                    {playActiveFrame.ending.title || t("page.storyMaker.player.endTitle")}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Live Variables & Counters Readout */}
                                    <div className="min-w-0 space-y-2 rounded-md3-md border border-outline-variant/50 bg-surface-container p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="flex min-w-0 items-center gap-1.5 type-label-m text-on-surface">
                                                <Icon path={mdCalculate} size={15} className="shrink-0 text-primary" />
                                                <span className="truncate">{t("page.storyMaker.v2.variables.liveMonitorTitle")}</span>
                                            </span>
                                            <span className="shrink-0 font-mono type-label-s tabular-nums text-on-surface-variant">
                                                {doc.variables.length}
                                            </span>
                                        </div>

                                        {doc.variables.length === 0 ? (
                                            <p className="type-body-s text-on-surface-variant">
                                                {t("page.storyMaker.phase.none")}
                                            </p>
                                        ) : (
                                            <ul className="min-w-0 space-y-1.5">
                                                {doc.variables.map((variable) => {
                                                    const currentValue = playLiveVariables[variable.id] ?? variable.initial;
                                                    const isChanged = currentValue !== variable.initial;
                                                    return (
                                                        <li
                                                            key={variable.id}
                                                            className={cn(
                                                                "flex min-w-0 items-center justify-between gap-2 rounded-md3-sm border px-2 py-1.5",
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
                                                                <span className="min-w-0 truncate type-label-m text-on-surface">
                                                                    {variable.name || variable.id}
                                                                </span>
                                                            </span>
                                                            <span
                                                                className={cn(
                                                                    "shrink-0 rounded-md3-xs px-2 py-0.5 font-mono type-label-s tabular-nums",
                                                                    isChanged
                                                                        ? "bg-primary text-on-primary"
                                                                        : "bg-surface-container-highest text-on-surface-variant",
                                                                )}
                                                            >
                                                                {variable.type === "number" ? String(currentValue) : String(Boolean(currentValue))}
                                                            </span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            size="s"
                                            variant="outlined"
                                            icon={mdReplay}
                                            disabled={playEmptyStory}
                                            className="flex-1 justify-center"
                                            onClick={() => startPlaytestFrom(doc.startNodeId)}
                                        >
                                            {t("page.storyMaker.player.replay")}
                                        </Button>
                                        <Button
                                            size="s"
                                            variant="tonal"
                                            icon={mdArrowBack}
                                            className="flex-1 justify-center"
                                            onClick={() => exitPlaytest(false)}
                                        >
                                            {t("page.storyMaker.v2.mode.returnToEdit")}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <NodeInspector
                                    doc={doc}
                                    selectedNodeId={activeNodeId}
                                    selectedBeatId={activeBeatId}
                                    assetSource={assetSource}
                                    models={modelArray}
                                    modelInfo={modelInfo}
                                    diagnostics={diagnostics}
                                    onDocChange={commit}
                                    onSelectNode={handleSelectNode}
                                    onSelectBeat={handleSelectBeat}
                                    onPreviewClip={handlePreviewClip}
                                    onPlayFromScene={nodeId => enterPlaytest(nodeId)}
                                    onContinueScene={handleContinueScene}
                                    onPreviewEffect={handlePreviewEffect}
                                />
                            )}
                        </div>
                    </Surface>
                </div>

                {/* Draggable Keyboard-Accessible Horizontal Splitter Bar */}
                <div
                    role="separator"
                    tabIndex={0}
                    aria-orientation="horizontal"
                    aria-label={t("page.storyMaker.nle.resizeSplit")}
                    aria-valuenow={Math.round(topSplitPct)}
                    aria-valuemin={MIN_TOP_SPLIT_PCT}
                    aria-valuemax={MAX_TOP_SPLIT_PCT}
                    title={t("page.storyMaker.nle.resizeSplit")}
                    onPointerDown={handleSplitterPointerDown}
                    onPointerMove={handleSplitterPointerMove}
                    onPointerUp={handleSplitterPointerUp}
                    onPointerCancel={() => { splitDragRef.current = null; }}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setTopSplitPct(prev => Math.max(MIN_TOP_SPLIT_PCT, prev - 2));
                        } else if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setTopSplitPct(prev => Math.min(MAX_TOP_SPLIT_PCT, prev + 2));
                        } else if (event.key === "Home") {
                            event.preventDefault();
                            setTopSplitPct(MIN_TOP_SPLIT_PCT);
                        } else if (event.key === "End") {
                            event.preventDefault();
                            setTopSplitPct(MAX_TOP_SPLIT_PCT);
                        }
                    }}
                    onDoubleClick={() => setTopSplitPct(DEFAULT_TOP_SPLIT_PCT)}
                    className="focus-ring flex h-3 shrink-0 cursor-row-resize touch-none select-none items-center justify-center rounded-md3-full transition-colors hover:bg-surface-container-high"
                >
                    <Icon path={mdDragHandle} size={18} className="text-on-surface-variant" />
                </div>

                {/* Bottom Row: Full-Width Flow Canvas (Edit or Read-Only Playtest Monitor, preserving zoom/pan!) */}
                <StoryFlowCanvas
                    key="desktop-flow-canvas"
                    doc={doc}
                    mode={isPlaytest ? "play" : "edit"}
                    activeNodeId={isPlaytest ? (playActiveFrame?.nodeId ?? null) : activeNodeId}
                    activeBeatId={isPlaytest ? (playActiveFrame?.beatId ?? null) : activeBeatId}
                    visitedNodeIds={isPlaytest ? (playActiveFrame?.visitedNodeIds ?? []) : undefined}
                    visitedEdgeIds={isPlaytest ? (playActiveFrame?.visitedEdgeIds ?? []) : undefined}
                    diagnostics={diagnostics}
                    activeDragPayload={isPlaytest ? null : activeDragPayload}
                    onSelectNode={isPlaytest ? jumpPlaytestToNode : handleSelectNode}
                    onSelectBeat={isPlaytest ? jumpPlaytestToBeat : handleSelectBeat}
                    onMoveNode={isPlaytest ? undefined : ((nodeId, pos) => commit(current => moveNode(current, nodeId, pos)))}
                    onConnect={isPlaytest ? undefined : ((fromNodeId, fromPortId, toNodeId) => {
                        commit(current => connectEdge(current, fromNodeId, fromPortId, toNodeId));
                        setSnack(t("page.storyMaker.flow.connected"));
                    })}
                    onDisconnectEdge={isPlaytest ? undefined : (edgeId => commit(current => disconnectEdge(current, edgeId)))}
                    onDisconnectPort={isPlaytest ? undefined : ((fromNodeId, fromPortId) => commit(current => disconnectPort(current, fromNodeId, fromPortId)))}
                    onDropPayload={isPlaytest ? undefined : handleDropPayload}
                    onMoveBeat={isPlaytest ? undefined : ((sourceNodeId, beatId, targetNodeId, insertIndex) => {
                        commit(current => moveBeat(current, sourceNodeId, beatId, targetNodeId, insertIndex));
                        setSelectedNodeId(targetNodeId);
                        setSelectedBeatId(beatId);
                    })}
                    onAddNode={isPlaytest ? undefined : handleAddNode}
                    onDuplicateNode={isPlaytest ? undefined : handleDuplicateNode}
                    onDeleteNode={isPlaytest ? undefined : handleDeleteNode}
                    onDeleteBeat={isPlaytest ? undefined : handleDeleteBeat}
                    onDuplicateBeat={isPlaytest ? undefined : handleDuplicateBeat}
                    onContinueScene={isPlaytest ? undefined : handleContinueScene}
                    onPlayFromNode={isPlaytest ? undefined : (nodeId => enterPlaytest(nodeId))}
                    onAutoLayout={isPlaytest ? undefined : (() => commit(current => autoLayoutGraph(current)))}
                    className="flex min-h-0 flex-1"
                />
            </div>

            {/* Metadata Settings Dialog */}
            <StoryMetaDialog
                isOpen={metaOpen}
                onClose={() => setMetaOpen(false)}
                title={t("page.storyMaker.editor.storySettings")}
                confirmLabel={t("common.action.confirm")}
                initial={metaValuesFromDoc(doc)}
                showRegionHint
                onSubmit={handleUpdateMeta}
            />

            {/* Bidirectional MoeSekai Script (.msk) Dialog */}
            <ScriptCodeDialog
                isOpen={codeOpen}
                onClose={() => setCodeOpen(false)}
                doc={doc}
                onApply={handleApplyCode}
            />

            {/* Preload Assets Dialog */}
            <AssetPreloadDialog
                open={preloadOpen}
                onClose={() => setPreloadOpen(false)}
                doc={doc}
                assetSource={assetSource}
                models={models ?? undefined}
            />

            {/* Compiler Diagnostics Dialog */}
            <Dialog
                isOpen={issuesOpen}
                onClose={() => setIssuesOpen(false)}
                title={t("page.storyMaker.editor.issuesDialogTitle", { count: diagnostics.length })}
                size="md"
            >
                <StoryIssueList
                    diagnostics={diagnostics}
                    onSelectDiagnostic={(nodeId, beatId) => {
                        if (workspaceMode === "playtest") {
                            exitPlaytest(false);
                        }
                        if (beatId) handleSelectBeat(nodeId, beatId);
                        else handleSelectNode(nodeId);
                        setIssuesOpen(false);
                    }}
                />
            </Dialog>

            <Snackbar open={snack !== null} message={snack ?? ""} onClose={() => setSnack(null)} />
        </div>
    );
}

function StoryMakerEditGate() {
    const searchParams = useSearchParams();
    const draftId = searchParams.get("id");
    const isDesktop = useDesktopViewport();

    // SSR & initial hydration pass: CSS-only split avoids hydration mismatch and mounts zero WebGPU on mobile.
    if (isDesktop === null) {
        return (
            <>
                <div className="lg:hidden">
                    <DesktopOnlyNotice draftId={draftId} />
                </div>
                <div className="hidden lg:block">
                    <PageContainer wide><LoadingState /></PageContainer>
                </div>
            </>
        );
    }

    if (!isDesktop) {
        return <DesktopOnlyNotice draftId={draftId} />;
    }

    return <StoryMakerEditContent />;
}

export default function StoryMakerEditClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <StoryMakerEditGate />
            </Suspense>
        </MainLayout>
    );
}
