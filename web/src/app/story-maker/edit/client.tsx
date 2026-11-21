"use client";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useShellImmersiveMode } from "@/components/AppShell";
import MainLayout from "@/components/MainLayout";
import {
    Banner, Button, Dialog, EmptyState, Icon, IconButton, LoadingState, PageContainer,
    Snackbar, Surface, Tabs, cn,
} from "@/components/md3";
import {
    mdArrowBack, mdCheckCircle, mdChevronLeft, mdChevronRight, mdClose, mdCloseFullscreen,
    mdCode, mdDownload, mdDragHandle, mdErrorFill, mdOpenInFull, mdPlayArrow, mdPlayArrowFill,
    mdPlayCircle, mdRedo, mdSettings, mdStar, mdUndo, mdWarning,
} from "@/components/md3/icons";
import { AssetPreloadDialog } from "@/components/story-maker/AssetPreloadPanel";
import type { GameStageChoiceProp } from "@/components/story-maker/GameStageOverlay";
import { NodeInspector } from "@/components/story-maker/NodeInspector";
import { ScriptCodeDialog } from "@/components/story-maker/ScriptCodeDialog";
import { StoryEditorBin, type EditorBinTab } from "@/components/story-maker/StoryEditorBin";
import { StoryFlowCanvas } from "@/components/story-maker/StoryFlowCanvas";
import { StoryIssueList } from "@/components/story-maker/StoryIssueList";
import {
    StoryMetaDialog, applyMetaValuesToDoc, metaValuesFromDoc, type StoryMetaValues,
} from "@/components/story-maker/StoryMetaDialog";
import { StoryStageView } from "@/components/story-maker/StoryStageView";
import { useStarterStory } from "@/components/story-maker/useStarterStory";
import { useStoryModels } from "@/components/story-maker/useStoryModels";
import { useStoryStage } from "@/components/story-maker/useStoryStage";
import { useStoryUiKit } from "@/components/story-maker/useStoryUiKit";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { live2dSources } from "@/lib/live2dViewer/config";
import { localizePath } from "@/lib/localized-path";
import { compileStoryGraph } from "@/lib/storyMaker/compiler";
import {
    GRAPH_COL_GAP, GRAPH_ORIGIN_X, GRAPH_ORIGIN_Y, acceptsTarget, applyDragPayloadToTarget,
    autoLayoutGraph, connectEdge, createNode, disconnectEdge, disconnectPort, duplicateBeat,
    duplicateNode, getOutgoingEdge, moveBeat, moveNode, removeBeat, removeNode,
    type StoryDragPayload, type StoryDropTarget,
} from "@/lib/storyMaker/document";
import { StoryDraftsUnavailableError, createDraft, getDraft, saveDraft } from "@/lib/storyMaker/drafts";
import {
    INITIAL_STAGE_STATE, evaluateCondition, evaluateStageAt, interpolateStoryText,
} from "@/lib/storyMaker/runtime";
import type {
    SceneNode, StoryCastMember, StoryDocument, StoryEffectColor, StoryNode, StoryNodePos,
} from "@/types/storyMaker";

const MAX_UNDO = 50;
const AUTOSAVE_MS = 600;
const DEFAULT_TOP_SPLIT_PCT = 54;
const MIN_TOP_SPLIT_PCT = 34;
const MAX_TOP_SPLIT_PCT = 70;

type SaveStatus = "saved" | "dirty" | "saving" | "error";
type MobileWorkspaceTab = "flow" | "inspector" | "components" | "assets" | "variables" | "cast";

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

function StoryMakerEditContent() {
    const { t, routeLocale } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { assetSource } = useTheme();
    const buildStarter = useStarterStory();
    const line = assetSource.startsWith("backup") ? "backup" : "main";

    const draftId = searchParams.get("id");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<"missing" | "unavailable" | "failed" | null>(null);
    const [doc, setDoc] = useState<StoryDocument | null>(null);
    const [past, setPast] = useState<StoryDocument[]>([]);
    const [future, setFuture] = useState<StoryDocument[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

    const [immersive, setImmersive] = useState(() => searchParams.get("immersive") === "1");
    const [topSplitPct, setTopSplitPct] = useState(DEFAULT_TOP_SPLIT_PCT);
    const [mobileTab, setMobileTab] = useState<MobileWorkspaceTab>("flow");
    const [activeDragPayload, setActiveDragPayload] = useState<StoryDragPayload | null>(null);

    const [metaOpen, setMetaOpen] = useState(false);
    const [issuesOpen, setIssuesOpen] = useState(false);
    const [codeOpen, setCodeOpen] = useState(false);
    const [preloadOpen, setPreloadOpen] = useState(false);
    const [snack, setSnack] = useState<string | null>(null);
    const [flash, setFlash] = useState<{ key: number; color: StoryEffectColor; seconds: number } | null>(null);

    const flashKeyRef = useRef(0);
    const dirtyDocRef = useRef<StoryDocument | null>(null);
    const nleContainerRef = useRef<HTMLDivElement | null>(null);
    const splitDragRef = useRef<{ pointerId: number } | null>(null);

    useShellImmersiveMode(immersive);

    useEffect(() => {
        if (!immersive || typeof document === "undefined") return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [immersive]);

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

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setLoadError(null);
            setPast([]);
            setFuture([]);
            setSaveStatus("saved");
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
    }, [draftId]);

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

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
                return;
            }
            const hasOpenModal = Boolean(
                metaOpen
                || issuesOpen
                || codeOpen
                || preloadOpen
                || target?.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')
                || document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'),
            );
            if (hasOpenModal) return;

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
                && !document.querySelector('[role="menu"], [data-flow-connecting="true"]')
            ) {
                event.preventDefault();
                handleImmersiveChange(false);
            } else if (
                (event.key === "Delete" || event.key === "Backspace")
                && !event.ctrlKey
                && !event.metaKey
                && !event.altKey
                && !document.querySelector('[role="menu"]')
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
        undo, redo, immersive, handleImmersiveChange,
        metaOpen, issuesOpen, codeOpen, preloadOpen,
        activeScene, activeBeatId, activeNode, doc,
        handleDeleteBeat, handleDeleteNode,
    ]);

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
        shake: shakeStage,
        retry: retryStage,
    } = useStoryStage({ library, cast: doc?.cast ?? [], models });

    const evaluated = useMemo(() => {
        if (!doc || !activeNodeId) {
            return { stage: INITIAL_STAGE_STATE, variables: {} };
        }
        return evaluateStageAt(doc, activeNodeId, activeBeatId ?? undefined);
    }, [doc, activeNodeId, activeBeatId]);

    const stageState = evaluated.stage;

    useEffect(() => {
        if (!doc || stagePhase.kind !== "ready" || !models) return;
        void applyStage(stageState, { instant: true });
    }, [doc, applyStage, stagePhase.kind, models, stageState]);

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
        // Clicking a cast asset card mounts it in stageCast first, or inserts a talk beat if already mounted.
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

    const handleOpenPlayer = useCallback(async (fromNodeId?: string) => {
        if (!draftId || !doc) return;
        if (saveStatus === "dirty") {
            await flushSave(draftId, doc);
        }
        const query = new URLSearchParams({ id: draftId });
        if (fromNodeId) query.set("node", fromNodeId);
        router.push(localizePath(`/story-maker/play?${query.toString()}`, routeLocale));
    }, [doc, draftId, flushSave, routeLocale, router, saveStatus]);

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

    if (loadError || !doc || !draftId) {
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

    const saveStatusLabel = t(`page.storyMaker.editor.saveStatus.${saveStatus}`);
    const modelArray = models ?? [];
    const mobileBinTab: EditorBinTab | null =
        mobileTab === "components" || mobileTab === "assets" || mobileTab === "variables" || mobileTab === "cast"
            ? mobileTab
            : null;

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
            <Surface tone="low" radius="lg" className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-[min(12rem,100%)] flex-1 items-center gap-1.5 sm:gap-2">
                    <IconButton
                        size="s"
                        icon={mdArrowBack}
                        label={t("page.storyMaker.action.backToDrafts")}
                        href="/story-maker"
                    />
                    <button
                        type="button"
                        onClick={() => setMetaOpen(true)}
                        className="state-layer focus-ring min-w-0 flex-1 cursor-pointer rounded-md3-md px-2 py-1 text-left"
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
                    <IconButton
                        size="s"
                        icon={mdUndo}
                        label={t("page.storyMaker.editor.undo")}
                        disabled={past.length === 0}
                        onClick={undo}
                    />
                    <IconButton
                        size="s"
                        icon={mdRedo}
                        label={t("page.storyMaker.editor.redo")}
                        disabled={future.length === 0}
                        onClick={redo}
                    />
                    <IconButton
                        size="s"
                        icon={mdSettings}
                        label={t("page.storyMaker.editor.storySettings")}
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
                        variant="filled"
                        icon={mdPlayArrowFill}
                        className="px-3 sm:px-4"
                        onClick={() => void handleOpenPlayer()}
                    >
                        {t("page.storyMaker.action.previewPlay")}
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

            {/* Single Unified CapCut 3-Pane NLE Cockpit */}
            <div
                ref={nleContainerRef}
                style={{ "--nle-top-h": `${topSplitPct}%` } as React.CSSProperties}
                className={cn(
                    "flex min-w-0 flex-col gap-3",
                    immersive
                        ? "min-h-0 flex-1 overflow-y-auto xl:gap-0 xl:overflow-hidden"
                        : "xl:h-[calc(100svh-8.5rem)] xl:min-h-[44rem] xl:gap-0 xl:overflow-hidden",
                )}
            >
                {/* Top Row: Components/Assets/Vars/Cast Bin | Live 16:9 Stage | Node/Beat Inspector */}
                <div
                    key="top-workspace-row"
                    className="grid min-w-0 grid-cols-1 gap-3 xl:h-[var(--nle-top-h)] xl:min-h-0 xl:shrink-0 xl:grid-cols-[19.5rem_minmax(0,1fr)_23rem]"
                >
                    {/* Desktop Top-Left Pane: StoryEditorBin */}
                    <Surface key="desktop-left-pane" tone="low" radius="xl" className="hidden min-h-0 flex-col overflow-hidden xl:flex">
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
                    </Surface>

                    {/* Top-Center Pane: Persistently Mounted Live 16:9 Stage + Compact Strip */}
                    <div
                        key="center-stage-pane"
                        className="flex min-w-0 flex-col gap-2 xl:min-h-0 xl:overflow-hidden"
                    >
                        <div
                            key="stage-fit-outer"
                            className="min-w-0 rounded-md3-xl border border-outline-variant/60 bg-surface-container-low p-1.5 xl:flex xl:min-h-0 xl:flex-1 xl:items-center xl:justify-center xl:overflow-hidden xl:[container-type:size]"
                        >
                            <div
                                key="stage-fit-inner"
                                className="mx-auto w-full xl:h-[min(100cqh,calc(100cqw*9/16))] xl:w-[min(100cqw,calc(100cqh*16/9))]"
                            >
                                <StoryStageView
                                    key="live-stage"
                                    doc={doc}
                                    state={stageState}
                                    line={line}
                                    hostRef={stageHostRef}
                                    phase={stagePhase}
                                    problems={stageProblems}
                                    loadingActors={loadingActors}
                                    onRetry={retryStage}
                                    uiKit={uiKit}
                                    showEndSign={Boolean(stageState.dialogue) && !previewChoice}
                                    choice={previewChoice}
                                    choiceInteractive={false}
                                    showMenuButton={false}
                                    compactStatus
                                    flash={flash}
                                    className="h-full w-full"
                                />
                            </div>
                        </div>

                        {/* Compact Live Preview Monitor Strip */}
                        <Surface
                            tone="low"
                            radius="lg"
                            className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5"
                        >
                            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
                                {activeNode && (
                                    <span className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-md3-full bg-surface-container px-2.5 py-0.5 type-label-m text-on-surface">
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
                                        onClick={() => void handleOpenPlayer(activeScene.id)}
                                    >
                                        {t("page.storyMaker.v2.ending.playFromScene")}
                                    </Button>
                                )}
                            </div>
                        </Surface>
                    </div>

                    {/* Desktop Top-Right Pane: NodeInspector */}
                    <Surface key="desktop-inspector" tone="low" radius="xl" className="hidden min-h-0 flex-col overflow-hidden xl:flex">
                        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
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
                                onPlayFromScene={nodeId => void handleOpenPlayer(nodeId)}
                                onPreviewEffect={handlePreviewEffect}
                            />
                        </div>
                    </Surface>
                </div>

                {/* Draggable Keyboard-Accessible Horizontal Splitter Bar (xl desktop) */}
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
                    className="focus-ring hidden h-3 shrink-0 cursor-row-resize touch-none select-none items-center justify-center rounded-md3-full transition-colors hover:bg-surface-container-high xl:flex"
                >
                    <Icon path={mdDragHandle} size={18} className="text-on-surface-variant" />
                </div>

                {/* Desktop Bottom Row: Full-Width Scratch/Blueprint Graph Canvas */}
                <StoryFlowCanvas
                    key="desktop-flow-canvas"
                    doc={doc}
                    mode="edit"
                    activeNodeId={activeNodeId}
                    activeBeatId={activeBeatId}
                    diagnostics={diagnostics}
                    activeDragPayload={activeDragPayload}
                    onSelectNode={handleSelectNode}
                    onSelectBeat={handleSelectBeat}
                    onMoveNode={(nodeId, pos) => commit(current => moveNode(current, nodeId, pos))}
                    onConnect={(fromNodeId, fromPortId, toNodeId) => {
                        commit(current => connectEdge(current, fromNodeId, fromPortId, toNodeId));
                        setSnack(t("page.storyMaker.flow.connected"));
                    }}
                    onDisconnectEdge={edgeId => commit(current => disconnectEdge(current, edgeId))}
                    onDisconnectPort={(fromNodeId, fromPortId) => commit(current => disconnectPort(current, fromNodeId, fromPortId))}
                    onDropPayload={handleDropPayload}
                    onMoveBeat={(sourceNodeId, beatId, targetNodeId, insertIndex) => {
                        commit(current => moveBeat(current, sourceNodeId, beatId, targetNodeId, insertIndex));
                        setSelectedNodeId(targetNodeId);
                        setSelectedBeatId(beatId);
                    }}
                    onAddNode={handleAddNode}
                    onDuplicateNode={handleDuplicateNode}
                    onDeleteNode={handleDeleteNode}
                    onDeleteBeat={handleDeleteBeat}
                    onDuplicateBeat={handleDuplicateBeat}
                    onPlayFromNode={nodeId => void handleOpenPlayer(nodeId)}
                    onAutoLayout={() => commit(current => autoLayoutGraph(current))}
                    className="hidden xl:flex xl:min-h-0 xl:flex-1"
                />

                {/* Mobile & Tablet Tabbed Workspace (< xl) */}
                <Surface key="mobile-workspace" tone="low" radius="xl" className="flex min-w-0 flex-col overflow-hidden xl:hidden">
                    <Tabs<MobileWorkspaceTab>
                        value={mobileTab}
                        onValueChange={setMobileTab}
                        aria-label={t("page.storyMaker.editor.workspaceTabs")}
                        scrollable
                        className="[&_[role=tab]]:px-3"
                        items={[
                            { value: "flow", label: t("page.storyMaker.flow.viewModeFlow") },
                            { value: "inspector", label: t("page.storyMaker.editor.inspectorTab") },
                            { value: "components", label: t("page.storyMaker.v2.palette.tabComponents") },
                            { value: "assets", label: t("page.storyMaker.nle.tabAssets") },
                            { value: "variables", label: t("page.storyMaker.v2.variables.tabTitle") },
                            { value: "cast", label: t("page.storyMaker.nle.tabCast") },
                        ]}
                    />

                    {mobileTab === "flow" ? (
                        <StoryFlowCanvas
                            key="mobile-flow-canvas"
                            doc={doc}
                            mode="edit"
                            activeNodeId={activeNodeId}
                            activeBeatId={activeBeatId}
                            diagnostics={diagnostics}
                            activeDragPayload={activeDragPayload}
                            onSelectNode={(nodeId) => {
                                handleSelectNode(nodeId);
                                setMobileTab("inspector");
                            }}
                            onSelectBeat={(nodeId, beatId) => {
                                handleSelectBeat(nodeId, beatId);
                                setMobileTab("inspector");
                            }}
                            onMoveNode={(nodeId, pos) => commit(current => moveNode(current, nodeId, pos))}
                            onConnect={(fromNodeId, fromPortId, toNodeId) => {
                                commit(current => connectEdge(current, fromNodeId, fromPortId, toNodeId));
                                setSnack(t("page.storyMaker.flow.connected"));
                            }}
                            onDisconnectEdge={edgeId => commit(current => disconnectEdge(current, edgeId))}
                            onDisconnectPort={(fromNodeId, fromPortId) => commit(current => disconnectPort(current, fromNodeId, fromPortId))}
                            onDropPayload={handleDropPayload}
                            onMoveBeat={(sourceNodeId, beatId, targetNodeId, insertIndex) => {
                                commit(current => moveBeat(current, sourceNodeId, beatId, targetNodeId, insertIndex));
                                setSelectedNodeId(targetNodeId);
                                setSelectedBeatId(beatId);
                            }}
                            onAddNode={handleAddNode}
                            onDuplicateNode={handleDuplicateNode}
                            onDeleteNode={handleDeleteNode}
                            onDeleteBeat={handleDeleteBeat}
                            onDuplicateBeat={handleDuplicateBeat}
                            onPlayFromNode={nodeId => void handleOpenPlayer(nodeId)}
                            onAutoLayout={() => commit(current => autoLayoutGraph(current))}
                            className="h-[26rem] sm:h-[30rem]"
                        />
                    ) : mobileTab === "inspector" ? (
                        <div className="min-w-0 p-3 sm:p-4">
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
                                onPlayFromScene={nodeId => void handleOpenPlayer(nodeId)}
                                onPreviewEffect={handlePreviewEffect}
                            />
                        </div>
                    ) : mobileBinTab ? (
                        <StoryEditorBin
                            doc={doc}
                            assetSource={assetSource}
                            models={modelArray}
                            modelInfo={modelInfo}
                            modelList={modelList}
                            onRetryModels={retryModels}
                            activeNodeId={activeNodeId}
                            previewingCastId={previewingCastKey}
                            activeTab={mobileBinTab}
                            onTabChange={next => setMobileTab(next)}
                            hideTabs
                            onDocChange={commit}
                            onSelectNode={(nodeId) => {
                                handleSelectNode(nodeId);
                                setMobileTab("inspector");
                            }}
                            onQuickDrop={(payload) => {
                                handleQuickDrop(payload);
                                setMobileTab("inspector");
                            }}
                            onDragPayloadStart={setActiveDragPayload}
                            onPreviewCast={handlePreviewClip}
                            onClearPreview={clearClipPreview}
                            className="max-h-[55vh]"
                        />
                    ) : null}
                </Surface>
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

            {/* Bidirectional MoeSekai Script (.msk) & JSON Dialog */}
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
                        if (beatId) handleSelectBeat(nodeId, beatId);
                        else handleSelectNode(nodeId);
                        setIssuesOpen(false);
                        setMobileTab("inspector");
                    }}
                />
            </Dialog>

            <Snackbar open={snack !== null} message={snack ?? ""} onClose={() => setSnack(null)} />
        </div>
    );
}

export default function StoryMakerEditClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <StoryMakerEditContent />
            </Suspense>
        </MainLayout>
    );
}
