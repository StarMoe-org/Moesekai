"use client";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Icon, IconButton, cn } from "@/components/md3";
import {
    mdAccessibilityNew, mdAccountTree, mdAdd, mdAltRoute, mdAnimation, mdArticle, mdBlock,
    mdCalculate, mdCenterFocusStrong, mdChat, mdClose, mdContentCopy, mdContentCut,
    mdDelete, mdDragIndicator, mdErrorFill, mdFlag, mdGroups, mdHourglassTop, mdImage,
    mdKeyboardArrowDown, mdKeyboardArrowUp, mdLabel, mdLink, mdLinkOff, mdLock, mdMood, mdMovie,
    mdMusicNote, mdMusicOff, mdPlayArrowFill, mdPlayCircle, mdRecordVoiceOver, mdRedo, mdTitle,
    mdUndo, mdUnfoldLess, mdUnfoldMore, mdVolumeUp, mdWandStars, mdWarning, mdWarningFill,
    mdZoomIn, mdZoomOut,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import {
    STORY_BEAT_DRAG_MIME, STORY_DRAG_MIME, canConnectNodes, canDropOnTarget, clampCoord,
    getIncomingEdges, getNodeOutPorts, getOutgoingEdge, speakerName,
    type StoryBeatDragPayload, type StoryDragPayload, type StoryDropTarget, type StoryDropZone,
} from "@/lib/storyMaker/document";
import { STORY_LIMITS } from "@/lib/storyMaker/limits";
import type {
    ConditionExpr, SceneBeat, SceneNode, StoryCompileDiagnostic, StoryDocument, StoryEdge,
    StoryNode, StoryNodePos, StoryVariable, VarOp,
} from "@/types/storyMaker";

export interface StoryFlowViewportActions {
    getViewportCenterPos: (nodeType: "scene" | "choice" | "condition" | "end") => StoryNodePos | null;
    ensureNodeVisible: (nodeId: string, fallbackPos?: StoryNodePos) => void;
}

export interface StoryFlowCanvasProps {
    doc: StoryDocument;
    mode: "edit" | "monitor" | "play";
    activeNodeId?: string | null;
    activeBeatId?: string | null;
    visitedNodeIds?: readonly string[];
    visitedEdgeIds?: readonly string[];
    diagnostics?: readonly StoryCompileDiagnostic[];
    onSelectNode?: (nodeId: string) => void;
    onSelectBeat?: (nodeId: string, beatId: string) => void;
    onMoveNode?: (nodeId: string, pos: StoryNodePos) => void;
    onConnect?: (fromNodeId: string, fromPortId: string, toNodeId: string) => void;
    onRewireEdgeSource?: (edgeId: string, newFromNodeId: string, newFromPortId: string) => void;
    onDisconnectEdge?: (edgeId: string) => void;
    onDisconnectPort?: (fromNodeId: string, fromPortId: string) => void;
    onDropPayload?: (payload: StoryDragPayload, target: StoryDropTarget) => void;
    onMoveBeat?: (sourceNodeId: string, beatId: string, targetNodeId: string, insertIndex?: number) => void;
    onAddNode?: (nodeType: "scene" | "choice" | "condition" | "end", pos?: StoryNodePos) => void;
    onDuplicateNode?: (nodeId: string) => void;
    onDeleteNode?: (nodeId: string) => void;
    onDeleteBeat?: (nodeId: string, beatId: string) => void;
    onDuplicateBeat?: (nodeId: string, beatId: string) => void;
    onPlayFromNode?: (nodeId: string) => void;
    onContinueScene?: (
        sceneId: string,
        options?: {
            preset?: "inherit" | "bgmStop" | "bgmChange" | "bgChange";
            splitAtBeatId?: string;
        },
    ) => void;
    onAutoLayout?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    undoCount?: number;
    redoCount?: number;
    onUndo?: () => void;
    onRedo?: () => void;
    viewportActionsRef?: React.MutableRefObject<StoryFlowViewportActions | null>;
    activeDragPayload?: StoryDragPayload | null;
    className?: string;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;
const GRID_SNAP = 16;
const START_NODE_WIDTH = 196;
const SCENE_NODE_WIDTH = 292;
const BRANCH_NODE_WIDTH = 272;
const END_NODE_WIDTH = 216;
const MAX_VISIBLE_BEATS = 5;

interface Point {
    x: number;
    y: number;
}

interface NodeSize {
    w: number;
    h: number;
}

interface CanvasView {
    x: number;
    y: number;
    zoom: number;
}

interface MeasuredGeometry {
    sizes: Record<string, NodeSize>;
    ports: Record<string, Point>;
}

interface NodeDragState {
    nodeId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    currentX: number;
    currentY: number;
    moved: boolean;
}

interface PanState {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
}

interface WireSource {
    fromNodeId: string;
    fromPortId: string;
    portKey: string;
    label: string;
    hasExistingEdge: boolean;
}

type WireDragState =
    | {
        kind: "target";
        source: WireSource;
        rewiringEdgeId?: string;
        pointerId: number;
        startClientX: number;
        startClientY: number;
        worldX: number;
        worldY: number;
        dragged: boolean;
        hoveredTargetNodeId: string | null;
    }
    | {
        kind: "source";
        edge: StoryEdge;
        pointerId: number;
        startClientX: number;
        startClientY: number;
        worldX: number;
        worldY: number;
        dragged: boolean;
        hoveredSourcePort: { nodeId: string; portId: string; portKey: string } | null;
    };

type SceneSlotZone = Exclude<StoryDropZone, "canvas" | "beat-track">;

type DropHoverState =
    | { kind: "canvas"; pos: StoryNodePos }
    | { kind: "canvas-reject"; hintKey: string }
    | { kind: "slot"; nodeId: string; zone: SceneSlotZone }
    | { kind: "beat-track"; nodeId: string; visualIndex: number; actualIndex: number };

type FlowContextMenuState =
    | { kind: "node"; node: StoryNode; clientX: number; clientY: number }
    | { kind: "beat"; nodeId: string; beatId: string; clientX: number; clientY: number }
    | { kind: "edge"; edge: StoryEdge; clientX: number; clientY: number }
    | { kind: "canvas"; worldPos: StoryNodePos; clientX: number; clientY: number };

interface ContextMenuAction {
    key: string;
    label: string;
    icon: string;
    danger?: boolean;
    disabled?: boolean;
    dividerBefore?: boolean;
    onSelect: () => void;
}

interface NodeDiagSummary {
    errors: number;
    warnings: number;
    unreachable: boolean;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function snapCoord(value: number): number {
    return clampCoord(Math.round(value / GRID_SNAP) * GRID_SNAP);
}

function portKeyIn(nodeId: string): string {
    return `in:${nodeId}`;
}

function portKeyOut(nodeId: string, portId: string): string {
    return `out:${nodeId}:${portId}`;
}

function defaultNodeSize(node: StoryNode): NodeSize {
    switch (node.type) {
        case "start":
            return { w: START_NODE_WIDTH, h: 58 };
        case "end":
            return { w: END_NODE_WIDTH, h: node.subtitle ? 84 : 62 };
        case "choice":
            return { w: BRANCH_NODE_WIDTH, h: 64 + Math.max(2, node.options.length) * 52 };
        case "condition":
            return { w: BRANCH_NODE_WIDTH, h: 64 + (node.rules.length + 1) * 48 };
        case "scene": {
            const visibleBeats = Math.min(MAX_VISIBLE_BEATS, Math.max(1, node.beats.length));
            return { w: SCENE_NODE_WIDTH, h: 196 + visibleBeats * 32 };
        }
    }
}

function offsetRelativeTo(element: HTMLElement, ancestor: HTMLElement): Point | null {
    let x = element.offsetWidth / 2;
    let y = element.offsetHeight / 2;
    let cursor: HTMLElement | null = element;
    let guard = 0;
    while (cursor && cursor !== ancestor && guard < 24) {
        x += cursor.offsetLeft;
        y += cursor.offsetTop;
        cursor = cursor.offsetParent as HTMLElement | null;
        guard += 1;
    }
    if (cursor !== ancestor) return null;
    return { x, y };
}

function buildCubicBezier(start: Point, end: Point, isSelfLoop: boolean): {
    d: string;
    p0: Point;
    p1: Point;
    p2: Point;
    p3: Point;
} {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (!isSelfLoop && dx >= 40) {
        const bend = Math.min(180, Math.max(52, Math.abs(dx) * 0.45));
        const p1 = { x: start.x + bend, y: start.y };
        const p2 = { x: end.x - bend, y: end.y };
        return {
            d: `M ${start.x} ${start.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${end.x} ${end.y}`,
            p0: start,
            p1,
            p2,
            p3: end,
        };
    }

    const span = isSelfLoop ? 116 : clamp(Math.abs(dx) * 0.35 + 84, 92, 220);
    const arcY = isSelfLoop ? -112 : dy >= 0 ? -96 : 96;
    const p1 = { x: start.x + span, y: start.y + arcY };
    const p2 = { x: end.x - span, y: end.y + arcY };
    return {
        d: `M ${start.x} ${start.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${end.x} ${end.y}`,
        p0: start,
        p1,
        p2,
        p3: end,
    };
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return {
        x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
        y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
    };
}

/** Picks a point along a cubic Bezier roughly `offsetPx` inward from either endpoint for endpoint drag handles. */
function edgeEndpointHandlePoint(
    curve: { p0: Point; p1: Point; p2: Point; p3: Point },
    end: "start" | "end",
    offsetPx: number,
): Point {
    const chord = Math.hypot(curve.p3.x - curve.p0.x, curve.p3.y - curve.p0.y);
    const t = chord < 48 ? 0.22 : clamp(offsetPx / Math.max(chord, 1), 0.04, 0.22);
    return cubicPoint(curve.p0, curve.p1, curve.p2, curve.p3, end === "start" ? t : 1 - t);
}

function geometryChanged(prev: MeasuredGeometry, next: MeasuredGeometry): boolean {
    const prevSizeKeys = Object.keys(prev.sizes);
    const nextSizeKeys = Object.keys(next.sizes);
    if (prevSizeKeys.length !== nextSizeKeys.length) return true;
    for (const key of nextSizeKeys) {
        const a = prev.sizes[key];
        const b = next.sizes[key];
        if (!a || Math.abs(a.w - b.w) > 0.5 || Math.abs(a.h - b.h) > 0.5) return true;
    }
    const prevPortKeys = Object.keys(prev.ports);
    const nextPortKeys = Object.keys(next.ports);
    if (prevPortKeys.length !== nextPortKeys.length) return true;
    for (const key of nextPortKeys) {
        const a = prev.ports[key];
        const b = next.ports[key];
        if (!a || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5) return true;
    }
    return false;
}

function hasDragMime(dataTransfer: DataTransfer, mime: string): boolean {
    return Array.from(dataTransfer.types).includes(mime);
}

function parseDragPayload(dataTransfer: DataTransfer): StoryDragPayload | null {
    const raw = dataTransfer.getData(STORY_DRAG_MIME);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) return null;
        return parsed as StoryDragPayload;
    } catch {
        return null;
    }
}

function parseBeatDragPayload(dataTransfer: DataTransfer): StoryBeatDragPayload | null {
    const raw = dataTransfer.getData(STORY_BEAT_DRAG_MIME);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (
            !parsed
            || typeof parsed !== "object"
            || typeof (parsed as StoryBeatDragPayload).sourceNodeId !== "string"
            || typeof (parsed as StoryBeatDragPayload).beatId !== "string"
        ) {
            return null;
        }
        return parsed as StoryBeatDragPayload;
    } catch {
        return null;
    }
}

function dropHintKeyForPayload(payload: StoryDragPayload): string {
    switch (payload.kind) {
        case "node":
            return "page.storyMaker.v2.palette.dropTargetCanvas";
        case "slot-bg":
            return "page.storyMaker.v2.palette.dropTargetBgSlot";
        case "slot-bgm":
            return "page.storyMaker.v2.palette.dropTargetBgmSlot";
        case "slot-place":
            return "page.storyMaker.v2.palette.dropTargetPlaceSlot";
        case "slot-transition":
            return "page.storyMaker.v2.palette.dropTargetTransSlot";
        case "slot-cast-mode":
        case "asset-cast":
            return "page.storyMaker.v2.palette.dropTargetCastSlot";
        case "beat":
        case "asset-se":
        case "asset-voice":
        case "var-op":
            return "page.storyMaker.v2.palette.dropTargetBeatTrack";
    }
}

function nodeDisplayTitle(
    node: StoryNode,
    t: (key: string, values?: Record<string, string | number>) => string,
): string {
    switch (node.type) {
        case "start":
            return t("page.storyMaker.v2.nodeTypes.start");
        case "scene":
            return node.title || t("page.storyMaker.v2.nodeTypes.scene");
        case "choice":
            return node.title || t("page.storyMaker.v2.nodeTypes.choice");
        case "condition":
            return node.title || t("page.storyMaker.v2.nodeTypes.condition");
        case "end":
            return node.title || t("page.storyMaker.v2.nodeTypes.end");
    }
}

function formatConditionExpr(expr: ConditionExpr, varById: ReadonlyMap<string, StoryVariable>): string {
    const varName = varById.get(expr.varId)?.name || expr.varId;
    return `${varName} ${expr.op} ${String(expr.value)}`;
}

function formatVarOp(op: VarOp, varById: ReadonlyMap<string, StoryVariable>): string {
    const varName = varById.get(op.varId)?.name || op.varId;
    if (op.op === "add") return `${varName} +${op.value}`;
    if (op.op === "sub") return `${varName} -${op.value}`;
    if (op.op === "toggle") return `!${varName}`;
    return `${varName} = ${String(op.value)}`;
}

function beatIcon(beat: SceneBeat): string {
    switch (beat.kind) {
        case "talk":
            return mdChat;
        case "narration":
            return mdArticle;
        case "telop":
            return mdTitle;
        case "stageAction":
            return mdAccessibilityNew;
        case "cue":
            if (beat.cueType === "se") return mdVolumeUp;
            if (beat.cueType === "wait") return mdHourglassTop;
            return mdAnimation;
        case "varOp":
            return mdCalculate;
    }
}

function beatSummary(
    beat: SceneBeat,
    doc: StoryDocument,
    castNameByKey: ReadonlyMap<string, string>,
    varById: ReadonlyMap<string, StoryVariable>,
    t: (key: string, values?: Record<string, string | number>) => string,
): string {
    switch (beat.kind) {
        case "talk": {
            const speaker = speakerName(doc, beat);
            const body = beat.body.trim();
            if (speaker && body) return `${speaker}: ${body}`;
            if (body) return body;
            if (speaker) return speaker;
            return t("page.storyMaker.v2.beats.talk");
        }
        case "narration":
            return beat.body.trim() || t("page.storyMaker.v2.beats.narration");
        case "telop":
            return beat.text.trim() || t("page.storyMaker.v2.beats.telop");
        case "stageAction": {
            const actorName = castNameByKey.get(beat.castKey) || beat.castKey;
            const actionLabel = beat.action === "enter"
                ? t("page.storyMaker.v2.beats.stageActionEnter")
                : beat.action === "move"
                    ? t("page.storyMaker.v2.beats.stageActionMove")
                    : beat.action === "pose"
                        ? t("page.storyMaker.v2.beats.stageActionPose")
                        : t("page.storyMaker.v2.beats.stageActionExit");
            return actorName ? `${actionLabel} · ${actorName}` : actionLabel;
        }
        case "cue": {
            if (beat.cueType === "se") {
                return beat.se ? `${t("page.storyMaker.v2.beats.cueSe")} · ${beat.se}` : t("page.storyMaker.v2.beats.cueSe");
            }
            if (beat.cueType === "flash") {
                return `${t("page.storyMaker.v2.beats.cueFlash")} · ${beat.duration ?? 0.4}s`;
            }
            if (beat.cueType === "shake") {
                return `${t("page.storyMaker.v2.beats.cueShake")} · ${beat.duration ?? 0.4}s`;
            }
            return `${t("page.storyMaker.v2.beats.cueWait")} · ${beat.duration ?? 0.8}s`;
        }
        case "varOp": {
            if (beat.ops.length === 0) return t("page.storyMaker.v2.beats.varOp");
            const first = formatVarOp(beat.ops[0], varById);
            return beat.ops.length > 1 ? `${first} (+${beat.ops.length - 1})` : first;
        }
    }
}

function slotLabel(slot: string, t: (key: string) => string): string {
    switch (slot) {
        case "farLeft":
            return t("page.storyMaker.slot.farLeft");
        case "left":
            return t("page.storyMaker.slot.left");
        case "center":
            return t("page.storyMaker.slot.center");
        case "right":
            return t("page.storyMaker.slot.right");
        case "farRight":
            return t("page.storyMaker.slot.farRight");
        default:
            return slot;
    }
}

function computeReachableNodeIds(doc: StoryDocument): Set<string> {
    const reachable = new Set<string>();
    const startId = doc.startNodeId;
    if (!doc.nodes[startId]) return reachable;
    const adj = new Map<string, string[]>();
    for (const edge of doc.edges) {
        if (!doc.nodes[edge.fromNodeId] || !doc.nodes[edge.toNodeId]) continue;
        let bucket = adj.get(edge.fromNodeId);
        if (!bucket) {
            bucket = [];
            adj.set(edge.fromNodeId, bucket);
        }
        bucket.push(edge.toNodeId);
    }
    reachable.add(startId);
    const queue = [startId];
    for (let i = 0; i < queue.length; i += 1) {
        const current = queue[i];
        for (const next of adj.get(current) ?? []) {
            if (!reachable.has(next)) {
                reachable.add(next);
                queue.push(next);
            }
        }
    }
    return reachable;
}

export function StoryFlowCanvas({
    doc,
    mode,
    activeNodeId = null,
    activeBeatId = null,
    visitedNodeIds,
    visitedEdgeIds,
    diagnostics,
    onSelectNode,
    onSelectBeat,
    onMoveNode,
    onConnect,
    onRewireEdgeSource,
    onDisconnectEdge,
    onDisconnectPort,
    onDropPayload,
    onMoveBeat,
    onAddNode,
    onDuplicateNode,
    onDeleteNode,
    onDeleteBeat,
    onDuplicateBeat,
    onPlayFromNode,
    onContinueScene,
    onAutoLayout,
    canUndo = false,
    canRedo = false,
    undoCount = 0,
    redoCount = 0,
    onUndo,
    onRedo,
    viewportActionsRef,
    activeDragPayload = null,
    className,
}: StoryFlowCanvasProps): React.JSX.Element {
    const { t } = useI18n();
    const rawId = useId();
    const markerPrefix = rawId.replace(/[^a-zA-Z0-9_-]/g, "");

    const isEdit = mode === "edit";
    const isPlay = mode === "play";
    const isReadonly = !isEdit;

    const nodesList = useMemo(() => {
        const all = Object.values(doc.nodes);
        return all.sort((a, b) => {
            if (a.id === doc.startNodeId) return -1;
            if (b.id === doc.startNodeId) return 1;
            return 0;
        });
    }, [doc.nodes, doc.startNodeId]);

    const docRef = useRef(doc);
    useEffect(() => {
        docRef.current = doc;
    }, [doc]);

    const viewportRef = useRef<HTMLDivElement | null>(null);
    const contextMenuRef = useRef<HTMLDivElement | null>(null);
    const nodeElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const hasAutoFittedRef = useRef(false);
    const fitPendingRef = useRef(false);

    const [view, setView] = useState<CanvasView>({ x: 36, y: 36, zoom: 0.9 });
    const viewRef = useRef(view);
    useEffect(() => {
        viewRef.current = view;
    }, [view]);
    const [measured, setMeasured] = useState<MeasuredGeometry>({ sizes: {}, ports: {} });
    const measuredRef = useRef(measured);
    useEffect(() => {
        measuredRef.current = measured;
    }, [measured]);

    const [panState, setPanState] = useState<PanState | null>(null);
    const [dragState, setDragState] = useState<NodeDragState | null>(null);
    const [wireDrag, setWireDrag] = useState<WireDragState | null>(null);
    const [clickConnectSource, setClickConnectSource] = useState<WireSource | null>(null);
    const [dropHover, setDropHover] = useState<DropHoverState | null>(null);
    const [draggingBeat, setDraggingBeat] = useState<StoryBeatDragPayload | null>(null);
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<FlowContextMenuState | null>(null);
    const [expandedNodeIds, setExpandedNodeIds] = useState<ReadonlySet<string>>(() => new Set());

    const activeWireSource = wireDrag?.dragged && wireDrag.kind === "target"
        ? wireDrag.source
        : clickConnectSource;
    const activeRewireSourceDrag = wireDrag?.dragged && wireDrag.kind === "source" ? wireDrag : null;

    const visitedNodeSet = useMemo(() => new Set(visitedNodeIds ?? []), [visitedNodeIds]);
    const visitedEdgeSet = useMemo(() => new Set(visitedEdgeIds ?? []), [visitedEdgeIds]);
    const reachableNodeSet = useMemo(() => computeReachableNodeIds(doc), [doc]);

    const castNameByKey = useMemo(() => {
        const map = new Map<string, string>();
        for (const member of doc.cast) {
            map.set(member.key, member.name || member.key);
        }
        return map;
    }, [doc.cast]);

    const varById = useMemo(() => {
        const map = new Map<string, StoryVariable>();
        for (const variable of doc.variables) {
            map.set(variable.id, variable);
        }
        return map;
    }, [doc.variables]);

    const { nodeDiags, beatDiags } = useMemo(() => {
        const nodesMap = new Map<string, NodeDiagSummary>();
        const beatsMap = new Map<string, "error" | "warning">();
        for (const diag of diagnostics ?? []) {
            if (diag.nodeId) {
                const entry = nodesMap.get(diag.nodeId) ?? { errors: 0, warnings: 0, unreachable: false };
                if (diag.severity === "error") entry.errors += 1;
                else entry.warnings += 1;
                if (diag.code === "nodeUnreachable") entry.unreachable = true;
                nodesMap.set(diag.nodeId, entry);
            }
            if (diag.nodeId && diag.beatId) {
                const key = `${diag.nodeId}:${diag.beatId}`;
                const prev = beatsMap.get(key);
                if (!prev || diag.severity === "error") {
                    beatsMap.set(key, diag.severity);
                }
            }
        }
        return { nodeDiags: nodesMap, beatDiags: beatsMap };
    }, [diagnostics]);

    const expandableNodeIds = useMemo(() => {
        const ids: string[] = [];
        for (const node of nodesList) {
            if (node.type === "scene" && node.beats.length > MAX_VISIBLE_BEATS) {
                ids.push(node.id);
            }
        }
        return ids;
    }, [nodesList]);

    const allExpandableExpanded = expandableNodeIds.length > 0
        && expandableNodeIds.every(id => expandedNodeIds.has(id));

    const toggleNodeExpanded = useCallback((nodeId: string) => {
        setExpandedNodeIds((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

    const toggleAllExpanded = useCallback(() => {
        setExpandedNodeIds((prev) => {
            const currentlyAll = expandableNodeIds.length > 0
                && expandableNodeIds.every(id => prev.has(id));
            return currentlyAll ? new Set() : new Set(expandableNodeIds);
        });
    }, [expandableNodeIds]);

    const getNodePos = useCallback((node: StoryNode): Point => {
        if (dragState && dragState.nodeId === node.id) {
            return { x: dragState.currentX, y: dragState.currentY };
        }
        return node.pos;
    }, [dragState]);

    const getNodeSize = useCallback((node: StoryNode): NodeSize => {
        return measured.sizes[node.id] ?? defaultNodeSize(node);
    }, [measured.sizes]);

    const getPortWorldPoint = useCallback((node: StoryNode, key: string): Point => {
        const pos = getNodePos(node);
        const rel = measured.ports[key];
        if (rel) {
            return { x: pos.x + rel.x, y: pos.y + rel.y };
        }
        const size = getNodeSize(node);
        if (key.startsWith("in:")) {
            return { x: pos.x, y: pos.y + Math.min(26, size.h / 2) };
        }
        if (key.startsWith("out:")) {
            const portId = key.slice(`out:${node.id}:`.length);
            if (node.type === "choice") {
                const idx = Math.max(0, node.options.findIndex(o => o.id === portId));
                return { x: pos.x + size.w, y: pos.y + 68 + idx * 50 };
            }
            if (node.type === "condition") {
                const idx = portId === "else"
                    ? node.rules.length
                    : Math.max(0, node.rules.findIndex(r => r.id === portId));
                return { x: pos.x + size.w, y: pos.y + 66 + idx * 46 };
            }
            return { x: pos.x + size.w, y: pos.y + Math.min(26, size.h / 2) };
        }
        return { x: pos.x + size.w, y: pos.y + size.h / 2 };
    }, [getNodePos, getNodeSize, measured.ports]);

    const fitView = useCallback((targetDoc?: StoryDocument, sizeOverrides?: Record<string, NodeSize>) => {
        const viewport = viewportRef.current;
        const currentDoc = targetDoc ?? docRef.current;
        const list = Object.values(currentDoc.nodes);
        if (!viewport || list.length === 0) return;
        const rect = viewport.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        const sizeMap = sizeOverrides ?? measuredRef.current.sizes;
        for (const node of list) {
            const size = sizeMap[node.id] ?? defaultNodeSize(node);
            if (node.pos.x < minX) minX = node.pos.x;
            if (node.pos.y < minY) minY = node.pos.y;
            if (node.pos.x + size.w > maxX) maxX = node.pos.x + size.w;
            if (node.pos.y + size.h > maxY) maxY = node.pos.y + size.h;
        }

        const pad = isReadonly ? 28 : 44;
        const contentW = Math.max(120, maxX - minX);
        const contentH = Math.max(80, maxY - minY);
        const availW = Math.max(60, rect.width - pad * 2);
        const availH = Math.max(60, rect.height - pad * 2);
        const nextZoom = clamp(Math.min(availW / contentW, availH / contentH), MIN_ZOOM, 1.05);
        const nextX = (rect.width - contentW * nextZoom) / 2 - minX * nextZoom;
        const nextY = (rect.height - contentH * nextZoom) / 2 - minY * nextZoom;
        setView({ x: nextX, y: nextY, zoom: nextZoom });
    }, [isReadonly]);

    const measureAllNodes = useCallback((): MeasuredGeometry => {
        const sizes: Record<string, NodeSize> = {};
        const ports: Record<string, Point> = {};
        for (const [nodeId, el] of nodeElsRef.current.entries()) {
            if (!el.isConnected) continue;
            sizes[nodeId] = { w: el.offsetWidth, h: el.offsetHeight };
            const portEls = el.querySelectorAll<HTMLElement>("[data-port-key]");
            portEls.forEach((portEl) => {
                const key = portEl.dataset.portKey;
                if (!key) return;
                const rel = offsetRelativeTo(portEl, el);
                if (rel) ports[key] = rel;
            });
        }
        const next: MeasuredGeometry = { sizes, ports };
        setMeasured(prev => (geometryChanged(prev, next) ? next : prev));
        return next;
    }, []);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            const fresh = measureAllNodes();
            if (!hasAutoFittedRef.current) {
                const vp = viewportRef.current;
                if (vp && vp.clientWidth > 20 && vp.clientHeight > 20) {
                    hasAutoFittedRef.current = true;
                    fitView(docRef.current, fresh.sizes);
                }
            } else if (fitPendingRef.current) {
                fitPendingRef.current = false;
                fitView(docRef.current, fresh.sizes);
            }
        });
        const observer = new ResizeObserver(() => {
            const fresh = measureAllNodes();
            if (!hasAutoFittedRef.current) {
                const vp = viewportRef.current;
                if (vp && vp.clientWidth > 20 && vp.clientHeight > 20) {
                    hasAutoFittedRef.current = true;
                    fitView(docRef.current, fresh.sizes);
                }
            }
        });
        if (viewportRef.current) observer.observe(viewportRef.current);
        for (const el of nodeElsRef.current.values()) {
            observer.observe(el);
        }
        return () => {
            window.cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [doc.nodes, doc.edges, expandedNodeIds, measureAllNodes, fitView]);

    // Non-passive wheel zoom toward cursor.
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            setContextMenu(null);
            const rect = viewport.getBoundingClientRect();
            const localX = event.clientX - rect.left;
            const localY = event.clientY - rect.top;
            const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
            setView((prev) => {
                const nextZoom = clamp(prev.zoom * factor, MIN_ZOOM, MAX_ZOOM);
                if (Math.abs(nextZoom - prev.zoom) < 0.0005) return prev;
                const ratio = nextZoom / prev.zoom;
                return {
                    zoom: nextZoom,
                    x: localX - (localX - prev.x) * ratio,
                    y: localY - (localY - prev.y) * ratio,
                };
            });
        };
        viewport.addEventListener("wheel", onWheel, { passive: false });
        return () => viewport.removeEventListener("wheel", onWheel);
    }, []);

    // Escape cancels connect mode, wire drag, context menu, or selected edge.
    useEffect(() => {
        if (!clickConnectSource && !wireDrag && !contextMenu && !selectedEdgeId) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setClickConnectSource(null);
                setWireDrag(null);
                setContextMenu(null);
                setSelectedEdgeId(null);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [clickConnectSource, wireDrag, contextMenu, selectedEdgeId]);

    // Dismiss context menu on outside click, scroll, or resize.
    useEffect(() => {
        if (!contextMenu) return;
        const onPointerDown = (event: PointerEvent) => {
            if (contextMenuRef.current?.contains(event.target as Node)) return;
            setContextMenu(null);
        };
        const dismiss = () => setContextMenu(null);
        window.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("scroll", dismiss, true);
        window.addEventListener("resize", dismiss);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("scroll", dismiss, true);
            window.removeEventListener("resize", dismiss);
        };
    }, [contextMenu]);

    // Clear drop hover / beat drag when drag ends anywhere in the window.
    useEffect(() => {
        if (!dropHover && !draggingBeat) return;
        const clear = () => {
            setDropHover(null);
            setDraggingBeat(null);
        };
        window.addEventListener("dragend", clear);
        return () => window.removeEventListener("dragend", clear);
    }, [dropHover, draggingBeat]);

    const getViewportCenterPos = useCallback((nodeType: "scene" | "choice" | "condition" | "end"): StoryNodePos | null => {
        const viewport = viewportRef.current;
        const currentView = viewRef.current;
        if (!viewport || viewport.clientWidth <= 0 || viewport.clientHeight <= 0) {
            return null;
        }
        const estW = nodeType === "scene"
            ? SCENE_NODE_WIDTH
            : nodeType === "end"
                ? END_NODE_WIDTH
                : BRANCH_NODE_WIDTH;
        const estH = nodeType === "scene" ? 210 : nodeType === "end" ? 72 : 140;
        const centerWorldX = (viewport.clientWidth / 2 - currentView.x) / currentView.zoom;
        const centerWorldY = (viewport.clientHeight / 2 - currentView.y) / currentView.zoom;
        return {
            x: snapCoord(centerWorldX - estW / 2),
            y: snapCoord(centerWorldY - estH / 2),
        };
    }, []);

    const ensureNodeVisible = useCallback((nodeId: string, fallbackPos?: StoryNodePos) => {
        const viewport = viewportRef.current;
        if (!viewport || viewport.clientWidth <= 0 || viewport.clientHeight <= 0) return;
        const target = docRef.current.nodes[nodeId];
        const pos = target?.pos ?? fallbackPos;
        if (!pos) return;
        const size = target
            ? (measuredRef.current.sizes[nodeId] ?? defaultNodeSize(target))
            : { w: SCENE_NODE_WIDTH, h: 210 };
        const currentView = viewRef.current;
        const leftPx = pos.x * currentView.zoom + currentView.x;
        const topPx = pos.y * currentView.zoom + currentView.y;
        const rightPx = (pos.x + size.w) * currentView.zoom + currentView.x;
        const bottomPx = (pos.y + size.h) * currentView.zoom + currentView.y;
        const pad = 32;
        const isVisible = rightPx >= pad
            && leftPx <= viewport.clientWidth - pad
            && bottomPx >= pad
            && topPx <= viewport.clientHeight - pad;
        if (isVisible) return;
        const cx = pos.x + size.w / 2;
        const cy = pos.y + size.h / 2;
        setView(prev => ({
            ...prev,
            x: Math.round(viewport.clientWidth / 2 - cx * prev.zoom),
            y: Math.round(viewport.clientHeight / 2 - cy * prev.zoom),
        }));
    }, []);

    useEffect(() => {
        if (!viewportActionsRef) return;
        viewportActionsRef.current = { getViewportCenterPos, ensureNodeVisible };
        return () => {
            viewportActionsRef.current = null;
        };
    }, [viewportActionsRef, getViewportCenterPos, ensureNodeVisible]);

    const zoomBy = useCallback((factor: number) => {
        const viewport = viewportRef.current;
        const cx = viewport ? viewport.clientWidth / 2 : 240;
        const cy = viewport ? viewport.clientHeight / 2 : 160;
        setView((prev) => {
            const nextZoom = clamp(prev.zoom * factor, MIN_ZOOM, MAX_ZOOM);
            if (Math.abs(nextZoom - prev.zoom) < 0.0005) return prev;
            const ratio = nextZoom / prev.zoom;
            return {
                zoom: nextZoom,
                x: cx - (cx - prev.x) * ratio,
                y: cy - (cy - prev.y) * ratio,
            };
        });
    }, []);

    const clientToWorld = useCallback((clientX: number, clientY: number): Point => {
        const viewport = viewportRef.current;
        if (!viewport) return { x: 0, y: 0 };
        const rect = viewport.getBoundingClientRect();
        return {
            x: (clientX - rect.left - view.x) / view.zoom,
            y: (clientY - rect.top - view.y) / view.zoom,
        };
    }, [view.x, view.y, view.zoom]);

    const hitTestTargetNode = useCallback((
        worldX: number,
        worldY: number,
        fromNodeId: string,
        fromPortId: string,
    ): string | null => {
        for (let i = nodesList.length - 1; i >= 0; i -= 1) {
            const node = nodesList[i];
            if (!canConnectNodes(doc, fromNodeId, fromPortId, node.id).ok) continue;
            const pos = getNodePos(node);
            const size = getNodeSize(node);
            if (
                worldX >= pos.x - 24
                && worldX <= pos.x + size.w + 14
                && worldY >= pos.y - 14
                && worldY <= pos.y + size.h + 14
            ) {
                return node.id;
            }
        }
        return null;
    }, [doc, nodesList, getNodePos, getNodeSize]);

    const hitTestSourcePort = useCallback((
        worldX: number,
        worldY: number,
        targetNodeId: string,
    ): { nodeId: string; portId: string; portKey: string } | null => {
        let best: { nodeId: string; portId: string; portKey: string; dist: number } | null = null;
        const maxRadius = 36;
        for (const node of nodesList) {
            const outPorts = getNodeOutPorts(node);
            for (const portId of outPorts) {
                if (!canConnectNodes(doc, node.id, portId, targetNodeId).ok) continue;
                const pKey = portKeyOut(node.id, portId);
                const pt = getPortWorldPoint(node, pKey);
                const dist = Math.hypot(worldX - pt.x, worldY - pt.y);
                if (dist <= maxRadius && (!best || dist < best.dist)) {
                    best = { nodeId: node.id, portId, portKey: pKey, dist };
                }
            }
        }
        return best ? { nodeId: best.nodeId, portId: best.portId, portKey: best.portKey } : null;
    }, [doc, nodesList, getPortWorldPoint]);

    const completeConnection = useCallback((source: WireSource, targetNodeId: string) => {
        if (!canConnectNodes(doc, source.fromNodeId, source.fromPortId, targetNodeId).ok) return;
        onConnect?.(source.fromNodeId, source.fromPortId, targetNodeId);
        setClickConnectSource(null);
        setWireDrag(null);
    }, [doc, onConnect]);

    const handleViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        setContextMenu(null);
        setSelectedEdgeId(null);
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPanState({
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            originX: view.x,
            originY: view.y,
            moved: false,
        });
    };

    const handleViewportPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!panState || panState.pointerId !== event.pointerId) return;
        const dx = event.clientX - panState.startClientX;
        const dy = event.clientY - panState.startClientY;
        const moved = panState.moved || Math.hypot(dx, dy) > 4;
        setPanState(prev => (prev ? { ...prev, moved } : null));
        setView(prev => ({ ...prev, x: panState.originX + dx, y: panState.originY + dy }));
    };

    const handleViewportPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!panState || panState.pointerId !== event.pointerId) return;
        if (!panState.moved && clickConnectSource) {
            setClickConnectSource(null);
        }
        setPanState(null);
    };

    const handleViewportContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!isEdit || !onAddNode) return;
        event.preventDefault();
        const world = clientToWorld(event.clientX, event.clientY);
        setContextMenu({
            kind: "canvas",
            worldPos: {
                x: snapCoord(world.x - SCENE_NODE_WIDTH / 2),
                y: snapCoord(world.y - 36),
            },
            clientX: event.clientX,
            clientY: event.clientY,
        });
    };

    const handleViewportDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        if (!isEdit) return;
        if (hasDragMime(event.dataTransfer, STORY_BEAT_DRAG_MIME)) {
            event.dataTransfer.dropEffect = "none";
            setDropHover(prev => (
                prev?.kind === "canvas-reject" && prev.hintKey === "page.storyMaker.v2.palette.dropTargetBeatTrack"
                    ? prev
                    : { kind: "canvas-reject", hintKey: "page.storyMaker.v2.palette.dropTargetBeatTrack" }
            ));
            return;
        }
        if (!onDropPayload || !hasDragMime(event.dataTransfer, STORY_DRAG_MIME)) return;

        if (activeDragPayload && !canDropOnTarget(activeDragPayload, "canvas")) {
            event.dataTransfer.dropEffect = "none";
            const hintKey = dropHintKeyForPayload(activeDragPayload);
            setDropHover(prev => (
                prev?.kind === "canvas-reject" && prev.hintKey === hintKey
                    ? prev
                    : { kind: "canvas-reject", hintKey }
            ));
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        const world = clientToWorld(event.clientX, event.clientY);
        const pos: StoryNodePos = {
            x: snapCoord(world.x - SCENE_NODE_WIDTH / 2),
            y: snapCoord(world.y - 36),
        };
        setDropHover(prev => (
            prev?.kind === "canvas" && prev.pos.x === pos.x && prev.pos.y === pos.y
                ? prev
                : { kind: "canvas", pos }
        ));
    };

    const handleViewportDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        if (!viewportRef.current?.contains(event.relatedTarget as Node | null)) {
            setDropHover(null);
        }
    };

    const handleViewportDrop = (event: React.DragEvent<HTMLDivElement>) => {
        if (!isEdit || !onDropPayload) return;
        setDropHover(null);
        const payload = parseDragPayload(event.dataTransfer);
        if (!payload || !canDropOnTarget(payload, "canvas")) return;
        event.preventDefault();
        const world = clientToWorld(event.clientX, event.clientY);
        const pos: StoryNodePos = {
            x: snapCoord(world.x - SCENE_NODE_WIDTH / 2),
            y: snapCoord(world.y - 36),
        };
        onDropPayload(payload, { zone: "canvas", pos });
    };

    const handleRejectNodeDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        if (!isEdit) return;
        if (!hasDragMime(event.dataTransfer, STORY_DRAG_MIME) && !hasDragMime(event.dataTransfer, STORY_BEAT_DRAG_MIME)) {
            return;
        }
        event.stopPropagation();
        event.dataTransfer.dropEffect = "none";
        setDropHover(null);
    };

    const handleSceneSlotDragOver = (
        nodeId: string,
        zone: SceneSlotZone,
        event: React.DragEvent<HTMLDivElement>,
    ) => {
        if (!isEdit || !onDropPayload) return;
        if (!hasDragMime(event.dataTransfer, STORY_DRAG_MIME)) return;
        event.stopPropagation();
        if (activeDragPayload && !canDropOnTarget(activeDragPayload, zone)) {
            event.dataTransfer.dropEffect = "none";
            setDropHover(prev => (prev?.kind === "slot" && prev.nodeId === nodeId && prev.zone === zone ? null : prev));
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropHover(prev => (
            prev?.kind === "slot" && prev.nodeId === nodeId && prev.zone === zone
                ? prev
                : { kind: "slot", nodeId, zone }
        ));
    };

    const handleSceneSlotDragLeave = (
        nodeId: string,
        zone: SceneSlotZone,
        event: React.DragEvent<HTMLDivElement>,
    ) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropHover(prev => (prev?.kind === "slot" && prev.nodeId === nodeId && prev.zone === zone ? null : prev));
        }
    };

    const handleSceneSlotDrop = (
        nodeId: string,
        zone: SceneSlotZone,
        event: React.DragEvent<HTMLDivElement>,
    ) => {
        if (!isEdit || !onDropPayload) return;
        event.stopPropagation();
        setDropHover(null);
        const payload = parseDragPayload(event.dataTransfer);
        if (!payload || !canDropOnTarget(payload, zone)) return;
        event.preventDefault();
        onDropPayload(payload, { zone, nodeId });
    };

    const computeBeatInsertIndices = (
        scene: SceneNode,
        visibleIndices: number[],
        trackEl: HTMLElement,
        clientY: number,
    ): { visualIndex: number; actualIndex: number } => {
        const rows = trackEl.querySelectorAll<HTMLElement>("[data-beat-row-idx]");
        let visualIndex = rows.length;
        for (let i = 0; i < rows.length; i += 1) {
            const rect = rows[i].getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) {
                visualIndex = i;
                break;
            }
        }
        if (visibleIndices.length === 0) {
            return { visualIndex: 0, actualIndex: 0 };
        }
        if (visualIndex >= visibleIndices.length) {
            return { visualIndex: visibleIndices.length, actualIndex: scene.beats.length };
        }
        return { visualIndex, actualIndex: visibleIndices[visualIndex] };
    };

    const handleBeatTrackDragOver = (
        scene: SceneNode,
        visibleIndices: number[],
        event: React.DragEvent<HTMLDivElement>,
    ) => {
        if (!isEdit) return;
        const isBeatMove = hasDragMime(event.dataTransfer, STORY_BEAT_DRAG_MIME);
        const isPayload = hasDragMime(event.dataTransfer, STORY_DRAG_MIME);
        if (!isBeatMove && !isPayload) return;

        event.stopPropagation();
        if (isBeatMove) {
            if (!onMoveBeat) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
        } else {
            if (!onDropPayload) return;
            if (activeDragPayload && !canDropOnTarget(activeDragPayload, "beat-track")) {
                event.dataTransfer.dropEffect = "none";
                setDropHover(prev => (prev?.kind === "beat-track" && prev.nodeId === scene.id ? null : prev));
                return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
        }

        const { visualIndex, actualIndex } = computeBeatInsertIndices(
            scene,
            visibleIndices,
            event.currentTarget,
            event.clientY,
        );
        setDropHover(prev => (
            prev?.kind === "beat-track"
            && prev.nodeId === scene.id
            && prev.visualIndex === visualIndex
            && prev.actualIndex === actualIndex
                ? prev
                : { kind: "beat-track", nodeId: scene.id, visualIndex, actualIndex }
        ));
    };

    const handleBeatTrackDrop = (
        scene: SceneNode,
        visibleIndices: number[],
        event: React.DragEvent<HTMLDivElement>,
    ) => {
        if (!isEdit) return;
        event.stopPropagation();
        const { actualIndex } = computeBeatInsertIndices(
            scene,
            visibleIndices,
            event.currentTarget,
            event.clientY,
        );
        setDropHover(null);
        setDraggingBeat(null);

        const beatMove = parseBeatDragPayload(event.dataTransfer);
        if (beatMove && onMoveBeat) {
            event.preventDefault();
            let targetIndex = actualIndex;
            if (beatMove.sourceNodeId === scene.id) {
                const fromIdx = scene.beats.findIndex(b => b.id === beatMove.beatId);
                if (fromIdx === -1) return;
                if (targetIndex > fromIdx) targetIndex -= 1;
                if (targetIndex === fromIdx) return;
            }
            onMoveBeat(beatMove.sourceNodeId, beatMove.beatId, scene.id, targetIndex);
            return;
        }

        const payload = parseDragPayload(event.dataTransfer);
        if (payload && onDropPayload && canDropOnTarget(payload, "beat-track")) {
            event.preventDefault();
            onDropPayload(payload, { zone: "beat-track", nodeId: scene.id, beatIndex: actualIndex });
        }
    };

    const handleNodeHeaderPointerDown = (node: StoryNode, event: React.PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        setContextMenu(null);
        setSelectedEdgeId(null);
        if (event.button !== 0 && event.pointerType === "mouse") return;
        if (isEdit && clickConnectSource && canConnectNodes(doc, clickConnectSource.fromNodeId, clickConnectSource.fromPortId, node.id).ok) {
            completeConnection(clickConnectSource, node.id);
            return;
        }
        if (!isEdit) {
            onSelectNode?.(node.id);
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragState({
            nodeId: node.id,
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            originX: node.pos.x,
            originY: node.pos.y,
            currentX: node.pos.x,
            currentY: node.pos.y,
            moved: false,
        });
    };

    const handleNodeHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        event.stopPropagation();
        const rawDx = event.clientX - dragState.startClientX;
        const rawDy = event.clientY - dragState.startClientY;
        const moved = dragState.moved || Math.hypot(rawDx, rawDy) > 4;
        const nextX = clampCoord(dragState.originX + rawDx / view.zoom);
        const nextY = clampCoord(dragState.originY + rawDy / view.zoom);
        setDragState(prev => (prev ? { ...prev, currentX: nextX, currentY: nextY, moved } : null));
    };

    const handleNodeHeaderPointerUp = (node: StoryNode, event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        event.stopPropagation();
        const finished = dragState;
        setDragState(null);
        if (finished.moved) {
            const snapped: StoryNodePos = {
                x: snapCoord(finished.currentX),
                y: snapCoord(finished.currentY),
            };
            if (snapped.x !== finished.originX || snapped.y !== finished.originY) {
                onMoveNode?.(node.id, snapped);
            }
        } else {
            onSelectNode?.(node.id);
        }
    };

    const handlePortPointerDown = (source: WireSource, event: React.PointerEvent<HTMLButtonElement>) => {
        if (!isEdit) return;
        event.stopPropagation();
        setContextMenu(null);
        setSelectedEdgeId(null);
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const world = clientToWorld(event.clientX, event.clientY);
        const existingEdge = getOutgoingEdge(doc, source.fromNodeId, source.fromPortId);
        setWireDrag({
            kind: "target",
            source,
            rewiringEdgeId: existingEdge?.id,
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            worldX: world.x,
            worldY: world.y,
            dragged: false,
            hoveredTargetNodeId: null,
        });
    };

    const handlePortPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!wireDrag || wireDrag.kind !== "target" || wireDrag.pointerId !== event.pointerId) return;
        event.stopPropagation();
        const dist = Math.hypot(event.clientX - wireDrag.startClientX, event.clientY - wireDrag.startClientY);
        const dragged = wireDrag.dragged || dist > 6;
        const world = clientToWorld(event.clientX, event.clientY);
        const hoveredTargetNodeId = dragged
            ? hitTestTargetNode(world.x, world.y, wireDrag.source.fromNodeId, wireDrag.source.fromPortId)
            : null;
        if (dragged && clickConnectSource) {
            setClickConnectSource(null);
        }
        setWireDrag(prev => (prev && prev.kind === "target" ? {
            ...prev,
            dragged,
            worldX: world.x,
            worldY: world.y,
            hoveredTargetNodeId,
        } : null));
    };

    const handlePortPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!wireDrag || wireDrag.kind !== "target" || wireDrag.pointerId !== event.pointerId) return;
        event.stopPropagation();
        const finished = wireDrag;
        setWireDrag(null);
        if (finished.dragged) {
            if (finished.hoveredTargetNodeId) {
                completeConnection(finished.source, finished.hoveredTargetNodeId);
            } else if (finished.rewiringEdgeId && onDisconnectEdge) {
                onDisconnectEdge(finished.rewiringEdgeId);
            } else {
                // Releasing on blank canvas instantly unwires this port!
                onDisconnectPort?.(finished.source.fromNodeId, finished.source.fromPortId);
            }
            return;
        }
        setClickConnectSource(prev => (prev?.portKey === finished.source.portKey ? null : finished.source));
    };

    const handleEdgeHeadPointerDown = (edge: StoryEdge, event: React.PointerEvent<HTMLButtonElement>) => {
        if (!isEdit) return;
        event.stopPropagation();
        setContextMenu(null);
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const world = clientToWorld(event.clientX, event.clientY);
        const fromNode = doc.nodes[edge.fromNodeId];
        const source: WireSource = {
            fromNodeId: edge.fromNodeId,
            fromPortId: edge.fromPortId,
            portKey: portKeyOut(edge.fromNodeId, edge.fromPortId),
            label: fromNode ? nodeDisplayTitle(fromNode, t) : edge.fromNodeId,
            hasExistingEdge: true,
        };
        setWireDrag({
            kind: "target",
            source,
            rewiringEdgeId: edge.id,
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            worldX: world.x,
            worldY: world.y,
            dragged: false,
            hoveredTargetNodeId: edge.toNodeId,
        });
    };

    const handleEdgeHeadPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!wireDrag || wireDrag.kind !== "target" || wireDrag.pointerId !== event.pointerId) return;
        event.stopPropagation();
        const dist = Math.hypot(event.clientX - wireDrag.startClientX, event.clientY - wireDrag.startClientY);
        const dragged = wireDrag.dragged || dist > 5;
        const world = clientToWorld(event.clientX, event.clientY);
        const hoveredTargetNodeId = dragged
            ? hitTestTargetNode(world.x, world.y, wireDrag.source.fromNodeId, wireDrag.source.fromPortId)
            : null;
        if (dragged && clickConnectSource) {
            setClickConnectSource(null);
        }
        setWireDrag(prev => (prev && prev.kind === "target" ? {
            ...prev,
            dragged,
            worldX: world.x,
            worldY: world.y,
            hoveredTargetNodeId,
        } : null));
    };

    const handleEdgeHeadPointerUp = (edge: StoryEdge, event: React.PointerEvent<HTMLButtonElement>) => {
        if (!wireDrag || wireDrag.kind !== "target" || wireDrag.pointerId !== event.pointerId) return;
        event.stopPropagation();
        const finished = wireDrag;
        setWireDrag(null);
        if (finished.dragged) {
            if (finished.hoveredTargetNodeId) {
                if (finished.hoveredTargetNodeId !== edge.toNodeId) {
                    completeConnection(finished.source, finished.hoveredTargetNodeId);
                }
            } else {
                onDisconnectEdge?.(edge.id);
                setSelectedEdgeId(null);
            }
            return;
        }
        setSelectedEdgeId(prev => (prev === edge.id ? null : edge.id));
    };

    const handleEdgeTailPointerDown = (edge: StoryEdge, event: React.PointerEvent<HTMLButtonElement>) => {
        if (!isEdit) return;
        event.stopPropagation();
        setContextMenu(null);
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const world = clientToWorld(event.clientX, event.clientY);
        setWireDrag({
            kind: "source",
            edge,
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            worldX: world.x,
            worldY: world.y,
            dragged: false,
            hoveredSourcePort: {
                nodeId: edge.fromNodeId,
                portId: edge.fromPortId,
                portKey: portKeyOut(edge.fromNodeId, edge.fromPortId),
            },
        });
    };

    const handleEdgeTailPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!wireDrag || wireDrag.kind !== "source" || wireDrag.pointerId !== event.pointerId) return;
        event.stopPropagation();
        const dist = Math.hypot(event.clientX - wireDrag.startClientX, event.clientY - wireDrag.startClientY);
        const dragged = wireDrag.dragged || dist > 5;
        const world = clientToWorld(event.clientX, event.clientY);
        const hoveredSourcePort = dragged
            ? hitTestSourcePort(world.x, world.y, wireDrag.edge.toNodeId)
            : null;
        if (dragged && clickConnectSource) {
            setClickConnectSource(null);
        }
        setWireDrag(prev => (prev && prev.kind === "source" ? {
            ...prev,
            dragged,
            worldX: world.x,
            worldY: world.y,
            hoveredSourcePort,
        } : null));
    };

    const handleEdgeTailPointerUp = (edge: StoryEdge, event: React.PointerEvent<HTMLButtonElement>) => {
        if (!wireDrag || wireDrag.kind !== "source" || wireDrag.pointerId !== event.pointerId) return;
        event.stopPropagation();
        const finished = wireDrag;
        setWireDrag(null);
        if (finished.dragged) {
            if (finished.hoveredSourcePort) {
                const { nodeId, portId } = finished.hoveredSourcePort;
                if (nodeId !== edge.fromNodeId || portId !== edge.fromPortId) {
                    if (onRewireEdgeSource) {
                        onRewireEdgeSource(edge.id, nodeId, portId);
                    } else {
                        onDisconnectEdge?.(edge.id);
                        onConnect?.(nodeId, portId, edge.toNodeId);
                    }
                }
            } else {
                onDisconnectEdge?.(edge.id);
                setSelectedEdgeId(null);
            }
            return;
        }
        setSelectedEdgeId(prev => (prev === edge.id ? null : edge.id));
    };

    const handlePortKeyDown = (source: WireSource, event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isEdit) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setClickConnectSource(prev => (prev?.portKey === source.portKey ? null : source));
        }
    };

    const handleTriggerAutoLayout = () => {
        fitPendingRef.current = true;
        onAutoLayout?.();
    };

    const openNodeContextMenu = (node: StoryNode, event: React.MouseEvent) => {
        if (!isEdit) return;
        if (node.type === "start") return;
        event.preventDefault();
        event.stopPropagation();
        onSelectNode?.(node.id);
        setContextMenu({ kind: "node", node, clientX: event.clientX, clientY: event.clientY });
    };

    const openBeatContextMenu = (nodeId: string, beatId: string, event: React.MouseEvent) => {
        if (!isEdit) return;
        event.preventDefault();
        event.stopPropagation();
        onSelectBeat?.(nodeId, beatId);
        setContextMenu({ kind: "beat", nodeId, beatId, clientX: event.clientX, clientY: event.clientY });
    };

    const openEdgeContextMenu = (edge: StoryEdge, event: React.MouseEvent) => {
        if (!isEdit || !onDisconnectEdge) return;
        event.preventDefault();
        event.stopPropagation();
        setSelectedEdgeId(edge.id);
        setContextMenu({ kind: "edge", edge, clientX: event.clientX, clientY: event.clientY });
    };

    const contextMenuActions: ContextMenuAction[] = useMemo(() => {
        if (!contextMenu) return [];
        const nodesFull = Object.keys(doc.nodes).length >= STORY_LIMITS.nodes;

        if (contextMenu.kind === "node") {
            const { node } = contextMenu;
            const actions: ContextMenuAction[] = [];
            if (node.type === "scene" && onPlayFromNode) {
                actions.push({
                    key: "play-scene",
                    label: t("page.storyMaker.v2.ending.playFromScene"),
                    icon: mdPlayCircle,
                    onSelect: () => onPlayFromNode(node.id),
                });
            }
            if (node.type === "scene" && onContinueScene) {
                actions.push(
                    {
                        key: "continue-scene",
                        label: t("page.storyMaker.v2.scene.continueAndCut"),
                        icon: mdContentCut,
                        disabled: nodesFull,
                        dividerBefore: actions.length > 0,
                        onSelect: () => onContinueScene(node.id, { preset: "inherit" }),
                    },
                    {
                        key: "continue-scene-bgm-stop",
                        label: t("page.storyMaker.v2.scene.continueBgmStop"),
                        icon: mdMusicOff,
                        disabled: nodesFull,
                        onSelect: () => onContinueScene(node.id, { preset: "bgmStop" }),
                    },
                    {
                        key: "continue-scene-bgm-change",
                        label: t("page.storyMaker.v2.scene.continueBgmChange"),
                        icon: mdMusicNote,
                        disabled: nodesFull,
                        onSelect: () => onContinueScene(node.id, { preset: "bgmChange" }),
                    },
                    {
                        key: "continue-scene-bg-change",
                        label: t("page.storyMaker.v2.scene.continueBgChange"),
                        icon: mdImage,
                        disabled: nodesFull,
                        onSelect: () => onContinueScene(node.id, { preset: "bgChange" }),
                    },
                );
            }
            if (node.type !== "start" && onDuplicateNode) {
                actions.push({
                    key: "duplicate-node",
                    label: t("common.action.copy"),
                    icon: mdContentCopy,
                    disabled: nodesFull,
                    dividerBefore: actions.length > 0 && node.type === "scene" && Boolean(onContinueScene),
                    onSelect: () => onDuplicateNode(node.id),
                });
            }
            if (node.type !== "start" && onDeleteNode) {
                actions.push({
                    key: "delete-node",
                    label: t("page.storyMaker.nle.contextDeleteNode"),
                    icon: mdDelete,
                    danger: true,
                    dividerBefore: actions.length > 0,
                    onSelect: () => onDeleteNode(node.id),
                });
            }
            return actions;
        }

        if (contextMenu.kind === "beat") {
            const { nodeId, beatId } = contextMenu;
            const ownerNode = doc.nodes[nodeId];
            const beatIndex = ownerNode?.type === "scene"
                ? ownerNode.beats.findIndex(b => b.id === beatId)
                : -1;
            const actions: ContextMenuAction[] = [];
            if (onContinueScene && beatIndex > 0) {
                actions.push({
                    key: "split-from-beat",
                    label: t("page.storyMaker.v2.scene.splitFromBeat"),
                    icon: mdContentCut,
                    disabled: nodesFull,
                    onSelect: () => onContinueScene(nodeId, { preset: "inherit", splitAtBeatId: beatId }),
                });
            }
            if (onDuplicateBeat) {
                actions.push({
                    key: "duplicate-beat",
                    label: t("page.storyMaker.nle.contextDuplicateStep"),
                    icon: mdContentCopy,
                    onSelect: () => onDuplicateBeat(nodeId, beatId),
                });
            }
            if (onDeleteBeat) {
                actions.push({
                    key: "delete-beat",
                    label: t("page.storyMaker.nle.contextDeleteStep"),
                    icon: mdDelete,
                    danger: true,
                    dividerBefore: actions.length > 0,
                    onSelect: () => onDeleteBeat(nodeId, beatId),
                });
            }
            return actions;
        }

        if (contextMenu.kind === "edge") {
            if (!onDisconnectEdge) return [];
            return [{
                key: "disconnect-edge",
                label: t("page.storyMaker.nle.contextDisconnectEdge"),
                icon: mdLinkOff,
                danger: true,
                onSelect: () => {
                    onDisconnectEdge(contextMenu.edge.id);
                    setSelectedEdgeId(null);
                },
            }];
        }

        if (contextMenu.kind === "canvas" && onAddNode) {
            return [
                {
                    key: "add-scene",
                    label: t("page.storyMaker.nle.contextNewSceneHere"),
                    icon: mdMovie,
                    disabled: nodesFull,
                    onSelect: () => onAddNode("scene", contextMenu.worldPos),
                },
                {
                    key: "add-choice",
                    label: t("page.storyMaker.flow.addChoice"),
                    icon: mdAltRoute,
                    disabled: nodesFull,
                    onSelect: () => onAddNode("choice", contextMenu.worldPos),
                },
                {
                    key: "add-condition",
                    label: `+ ${t("page.storyMaker.v2.nodeTypes.condition")}`,
                    icon: mdCalculate,
                    disabled: nodesFull,
                    onSelect: () => onAddNode("condition", contextMenu.worldPos),
                },
                {
                    key: "add-end",
                    label: `+ ${t("page.storyMaker.v2.nodeTypes.end")}`,
                    icon: mdFlag,
                    disabled: nodesFull,
                    onSelect: () => onAddNode("end", contextMenu.worldPos),
                },
            ];
        }

        return [];
    }, [
        contextMenu, doc.nodes, onAddNode, onContinueScene, onDeleteBeat, onDeleteNode,
        onDisconnectEdge, onDuplicateBeat, onDuplicateNode, onPlayFromNode, t,
    ]);

    const renderedEdges = useMemo(() => {
        const list: Array<{
            edge: StoryEdge;
            d: string;
            labelPos: Point;
            tailHandlePos: Point;
            headHandlePos: Point;
            label: string | null;
            tone: "primary" | "tertiary" | "secondary";
            dashed: boolean;
            visited: boolean;
        }> = [];

        for (const edge of doc.edges) {
            const fromNode = doc.nodes[edge.fromNodeId];
            const toNode = doc.nodes[edge.toNodeId];
            if (!fromNode || !toNode) continue;
            if (!getNodeOutPorts(fromNode).includes(edge.fromPortId)) continue;

            const start = getPortWorldPoint(fromNode, portKeyOut(fromNode.id, edge.fromPortId));
            const end = getPortWorldPoint(toNode, portKeyIn(toNode.id));
            const curve = buildCubicBezier(start, end, edge.fromNodeId === edge.toNodeId);
            const labelPos = cubicPoint(curve.p0, curve.p1, curve.p2, curve.p3, 0.5);
            const tailHandlePos = edgeEndpointHandlePoint(curve, "start", 20);
            const headHandlePos = edgeEndpointHandlePoint(curve, "end", 18);

            let label: string | null = null;
            let tone: "primary" | "tertiary" | "secondary" = "primary";
            let dashed = false;

            if (fromNode.type === "choice") {
                tone = "tertiary";
                const opt = fromNode.options.find(o => o.id === edge.fromPortId);
                label = opt?.text.trim() || t("page.storyMaker.player.emptyOption");
            } else if (fromNode.type === "condition") {
                tone = "secondary";
                if (edge.fromPortId === "else") {
                    label = t("page.storyMaker.v2.ports.elsePort");
                    dashed = true;
                } else {
                    const rule = fromNode.rules.find(r => r.id === edge.fromPortId);
                    label = rule ? (rule.label?.trim() || formatConditionExpr(rule.expr, varById)) : null;
                }
            }

            list.push({
                edge,
                d: curve.d,
                labelPos,
                tailHandlePos,
                headHandlePos,
                label,
                tone,
                dashed,
                visited: isReadonly && visitedEdgeSet.has(edge.id),
            });
        }

        list.sort((a, b) => Number(a.visited) - Number(b.visited));
        return list;
    }, [doc.edges, doc.nodes, getPortWorldPoint, isReadonly, t, varById, visitedEdgeSet]);

    const rubberBandPath = useMemo(() => {
        if (!wireDrag || !wireDrag.dragged) return null;
        if (wireDrag.kind === "target") {
            const sourceNode = doc.nodes[wireDrag.source.fromNodeId];
            if (!sourceNode) return null;
            const start = getPortWorldPoint(sourceNode, wireDrag.source.portKey);
            const hoveredNode = wireDrag.hoveredTargetNodeId ? doc.nodes[wireDrag.hoveredTargetNodeId] : undefined;
            const end = hoveredNode
                ? getPortWorldPoint(hoveredNode, portKeyIn(hoveredNode.id))
                : { x: wireDrag.worldX, y: wireDrag.worldY };
            return buildCubicBezier(start, end, false).d;
        }
        const targetNode = doc.nodes[wireDrag.edge.toNodeId];
        if (!targetNode) return null;
        const end = getPortWorldPoint(targetNode, portKeyIn(targetNode.id));
        const hoveredSrcNode = wireDrag.hoveredSourcePort ? doc.nodes[wireDrag.hoveredSourcePort.nodeId] : undefined;
        const start = hoveredSrcNode && wireDrag.hoveredSourcePort
            ? getPortWorldPoint(hoveredSrcNode, wireDrag.hoveredSourcePort.portKey)
            : { x: wireDrag.worldX, y: wireDrag.worldY };
        return buildCubicBezier(start, end, false).d;
    }, [wireDrag, doc.nodes, getPortWorldPoint]);

    const activeNodeObj = activeNodeId ? doc.nodes[activeNodeId] ?? null : null;
    const gridStep = Math.max(12, 24 * view.zoom);
    const zoomPercent = Math.round(view.zoom * 100);
    const nodesFull = Object.keys(doc.nodes).length >= STORY_LIMITS.nodes;

    const registerNodeEl = useCallback((nodeId: string, element: HTMLDivElement | null) => {
        if (element) {
            nodeElsRef.current.set(nodeId, element);
        } else {
            nodeElsRef.current.delete(nodeId);
        }
    }, []);

    const menuPosition = useMemo(() => {
        if (!contextMenu || typeof window === "undefined") return { left: 8, top: 8 };
        const approxW = 224;
        const approxH = Math.max(48, contextMenuActions.length * 40 + 16);
        return {
            left: clamp(contextMenu.clientX, 8, Math.max(8, window.innerWidth - approxW - 8)),
            top: clamp(contextMenu.clientY, 8, Math.max(8, window.innerHeight - approxH - 8)),
        };
    }, [contextMenu, contextMenuActions.length]);

    const isZoneAcceptingActiveDrag = (zone: StoryDropZone): boolean => {
        if (!isEdit) return false;
        if (zone === "beat-track" && draggingBeat !== null) return true;
        if (!activeDragPayload) return false;
        return canDropOnTarget(activeDragPayload, zone);
    };

    const renderOutPortButton = (
        nodeId: string,
        portId: string,
        label: string,
        tone: "primary" | "tertiary" | "secondary" = "primary",
    ) => {
        const pKey = portKeyOut(nodeId, portId);
        const outgoing = getOutgoingEdge(doc, nodeId, portId);
        const isConnected = Boolean(outgoing);
        const isSourceActive = activeWireSource?.portKey === pKey;
        const isRewireSourceValid = Boolean(
            activeRewireSourceDrag
            && canConnectNodes(doc, nodeId, portId, activeRewireSourceDrag.edge.toNodeId).ok,
        );
        const isRewireSourceHovered = activeRewireSourceDrag?.hoveredSourcePort?.portKey === pKey;
        const wireSource: WireSource = {
            fromNodeId: nodeId,
            fromPortId: portId,
            portKey: pKey,
            label,
            hasExistingEdge: isConnected,
        };

        const toneIdle = tone === "tertiary"
            ? isConnected
                ? "border-tertiary bg-tertiary text-on-tertiary"
                : "border-tertiary bg-tertiary-container text-on-tertiary-container"
            : tone === "secondary"
                ? isConnected
                    ? "border-secondary bg-secondary text-on-secondary"
                    : "border-secondary bg-secondary-container text-on-secondary-container"
                : isConnected
                    ? "border-primary bg-primary text-on-primary"
                    : "border-primary bg-primary-container text-on-primary-container";

        const toneActive = tone === "tertiary"
            ? "scale-125 border-tertiary bg-tertiary text-on-tertiary ring-4 ring-tertiary/30"
            : tone === "secondary"
                ? "scale-125 border-secondary bg-secondary text-on-secondary ring-4 ring-secondary/30"
                : "scale-125 border-primary bg-primary text-on-primary ring-4 ring-primary/30";

        return (
            <button
                type="button"
                data-port-key={pKey}
                disabled={!isEdit}
                aria-label={`${label} — ${t("page.storyMaker.v2.ports.dragToWire")}`}
                title={isEdit
                    ? `${t("page.storyMaker.v2.ports.dragToWire")} · ${t("page.storyMaker.v2.ports.dropCanvasToUnwire")}`
                    : undefined}
                onPointerDown={event => handlePortPointerDown(wireSource, event)}
                onPointerMove={handlePortPointerMove}
                onPointerUp={handlePortPointerUp}
                onPointerCancel={() => setWireDrag(null)}
                onKeyDown={event => handlePortKeyDown(wireSource, event)}
                onClick={event => event.stopPropagation()}
                className={cn(
                    "focus-ring absolute -right-2.5 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border-2 shadow-elev-1 transition-transform",
                    isSourceActive || isRewireSourceHovered
                        ? toneActive
                        : isRewireSourceValid
                            ? `${toneIdle} scale-115 ring-2 ring-primary/50`
                            : toneIdle,
                    isEdit && "cursor-crosshair hover:scale-115",
                )}
            >
                <Icon path={mdLink} size={11} />
            </button>
        );
    };

    const renderInPortDot = (
        nodeId: string,
        tone: "primary" | "tertiary" | "secondary",
        isValidConnectTarget: boolean,
    ) => {
        const incoming = isEdit ? getIncomingEdges(doc, nodeId) : [];
        const detachableEdge = incoming.length > 0 ? incoming[incoming.length - 1] : null;
        const borderTone = tone === "tertiary"
            ? "border-tertiary"
            : tone === "secondary"
                ? "border-secondary"
                : "border-primary";

        if (!isEdit || !detachableEdge) {
            return (
                <span
                    data-port-key={portKeyIn(nodeId)}
                    aria-hidden
                    className={cn(
                        "absolute -left-2 top-1/2 z-10 size-4 -translate-y-1/2 rounded-full border-2 transition-transform",
                        isValidConnectTarget
                            ? "scale-125 border-primary bg-primary-container ring-4 ring-primary/30"
                            : `${borderTone} bg-surface-container-lowest`,
                    )}
                />
            );
        }

        return (
            <button
                type="button"
                data-port-key={portKeyIn(nodeId)}
                aria-label={t("page.storyMaker.v2.ports.dragEdgeTarget")}
                title={t("page.storyMaker.v2.ports.dragEdgeTarget")}
                onPointerDown={event => handleEdgeHeadPointerDown(detachableEdge, event)}
                onPointerMove={handleEdgeHeadPointerMove}
                onPointerUp={event => handleEdgeHeadPointerUp(detachableEdge, event)}
                onPointerCancel={() => setWireDrag(null)}
                onClick={event => event.stopPropagation()}
                className={cn(
                    "focus-ring absolute -left-2 top-1/2 z-10 size-4 -translate-y-1/2 cursor-grab rounded-full border-2 transition-transform hover:scale-125 active:cursor-grabbing",
                    isValidConnectTarget
                        ? "scale-125 border-primary bg-primary-container ring-4 ring-primary/30"
                        : `${borderTone} bg-surface-container-lowest`,
                )}
            />
        );
    };

    const renderDiagnosticDot = (summary: NodeDiagSummary | undefined) => {
        if (!summary || (summary.errors === 0 && summary.warnings === 0)) return null;
        if (summary.errors > 0) {
            return (
                <span
                    title={t("page.storyMaker.v2.compiler.statusErrors", { count: summary.errors })}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-md3-full bg-error-container px-1.5 py-0.5 type-label-s text-on-error-container"
                >
                    <Icon path={mdErrorFill} size={12} className="shrink-0" />
                    <span>{summary.errors}</span>
                </span>
            );
        }
        return (
            <span
                title={t("page.storyMaker.v2.compiler.statusWarnings", { count: summary.warnings })}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-md3-full bg-tertiary-container px-1.5 py-0.5 type-label-s text-on-tertiary-container"
            >
                <Icon path={mdWarningFill} size={12} className="shrink-0" />
                <span>{summary.warnings}</span>
            </span>
        );
    };

    const renderTargetLabel = (edge: StoryEdge | undefined): string => {
        if (!edge) return t("page.storyMaker.v2.ports.unconnected");
        const target = doc.nodes[edge.toNodeId];
        return target ? `→ ${nodeDisplayTitle(target, t)}` : t("page.storyMaker.v2.ports.unconnected");
    };

    const renderSceneSockets = (scene: SceneNode) => {
        const bgAccept = isZoneAcceptingActiveDrag("slot-bg");
        const bgHover = dropHover?.kind === "slot" && dropHover.nodeId === scene.id && dropHover.zone === "slot-bg";

        const bgmAccept = isZoneAcceptingActiveDrag("slot-bgm");
        const bgmHover = dropHover?.kind === "slot" && dropHover.nodeId === scene.id && dropHover.zone === "slot-bgm";

        const placeAccept = isZoneAcceptingActiveDrag("slot-place");
        const placeHover = dropHover?.kind === "slot" && dropHover.nodeId === scene.id && dropHover.zone === "slot-place";

        const transAccept = isZoneAcceptingActiveDrag("slot-transition");
        const transHover = dropHover?.kind === "slot" && dropHover.nodeId === scene.id && dropHover.zone === "slot-transition";

        const castAccept = isZoneAcceptingActiveDrag("slot-cast");
        const castHover = dropHover?.kind === "slot" && dropHover.nodeId === scene.id && dropHover.zone === "slot-cast";

        const socketClass = (accept: boolean, hover: boolean) => cn(
            "flex min-w-0 items-center gap-1.5 rounded-md3-sm border px-2 py-1 transition-all",
            hover
                ? "border-dashed border-primary bg-primary-container/60 ring-2 ring-primary shadow-elev-1"
                : accept
                    ? "border-dashed border-primary bg-primary-container/30 ring-2 ring-primary/55"
                    : "border-outline-variant/50 bg-surface-container-low hover:border-outline-variant",
        );

        const transLabel = scene.transition.kind === "fadeBlack"
            ? `${t("page.storyMaker.v2.slots.transFadeBlack")} ${scene.transition.duration}s`
            : scene.transition.kind === "fadeWhite"
                ? `${t("page.storyMaker.v2.slots.transFadeWhite")} ${scene.transition.duration}s`
                : t("page.storyMaker.v2.slots.transNone");

        return (
            <div className="space-y-1 border-b border-outline-variant/50 bg-surface-container/50 p-2">
                <div className="flex items-center justify-between px-0.5">
                    <span className="type-label-s text-on-surface-variant">
                        {t("page.storyMaker.v2.slots.sectionTitle")}
                    </span>
                    {(bgHover || bgmHover || placeHover || transHover || castHover) && (
                        <span className="rounded-md3-full bg-primary px-1.5 py-0.5 type-label-s text-on-primary">
                            {t("page.storyMaker.v2.slots.replaceHint")}
                        </span>
                    )}
                </div>

                {/* BG Socket */}
                <div
                    data-drop-zone="slot-bg"
                    onDragOver={event => handleSceneSlotDragOver(scene.id, "slot-bg", event)}
                    onDragLeave={event => handleSceneSlotDragLeave(scene.id, "slot-bg", event)}
                    onDrop={event => handleSceneSlotDrop(scene.id, "slot-bg", event)}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={(event) => {
                        if (clickConnectSource) return;
                        event.stopPropagation();
                        onSelectNode?.(scene.id);
                    }}
                    className={socketClass(bgAccept, bgHover)}
                >
                    <Icon
                        path={scene.background.mode === "clear" ? mdBlock : mdImage}
                        size={14}
                        className="shrink-0 text-primary"
                    />
                    <span className="shrink-0 type-label-s text-on-surface-variant">
                        {t("page.storyMaker.v2.slots.background")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right">
                        {scene.background.mode === "set" ? (
                            <span className="inline-block max-w-full truncate rounded-md3-xs bg-primary-container px-1.5 py-0.5 font-mono type-label-s text-on-primary-container">
                                {scene.background.asset}
                            </span>
                        ) : (
                            <span className="type-label-s text-on-surface-variant">
                                {t(
                                    scene.background.mode === "clear"
                                        ? "page.storyMaker.v2.slots.bgClear"
                                        : "page.storyMaker.v2.slots.bgInherit",
                                )}
                            </span>
                        )}
                    </span>
                </div>

                {/* BGM Socket */}
                <div
                    data-drop-zone="slot-bgm"
                    onDragOver={event => handleSceneSlotDragOver(scene.id, "slot-bgm", event)}
                    onDragLeave={event => handleSceneSlotDragLeave(scene.id, "slot-bgm", event)}
                    onDrop={event => handleSceneSlotDrop(scene.id, "slot-bgm", event)}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={(event) => {
                        if (clickConnectSource) return;
                        event.stopPropagation();
                        onSelectNode?.(scene.id);
                    }}
                    className={socketClass(bgmAccept, bgmHover)}
                >
                    <Icon
                        path={scene.bgm.mode === "stop" ? mdMusicOff : mdMusicNote}
                        size={14}
                        className="shrink-0 text-secondary"
                    />
                    <span className="shrink-0 type-label-s text-on-surface-variant">
                        {t("page.storyMaker.v2.slots.bgm")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right">
                        {scene.bgm.mode === "play" ? (
                            <span className="inline-block max-w-full truncate rounded-md3-xs bg-secondary-container px-1.5 py-0.5 font-mono type-label-s text-on-secondary-container">
                                {scene.bgm.name}
                            </span>
                        ) : (
                            <span className="type-label-s text-on-surface-variant">
                                {t(
                                    scene.bgm.mode === "stop"
                                        ? "page.storyMaker.v2.slots.bgmStop"
                                        : "page.storyMaker.v2.slots.bgmInherit",
                                )}
                            </span>
                        )}
                    </span>
                </div>

                {/* Place & Transition Mini-Sockets */}
                <div className="grid grid-cols-2 gap-1">
                    <div
                        data-drop-zone="slot-place"
                        onDragOver={event => handleSceneSlotDragOver(scene.id, "slot-place", event)}
                        onDragLeave={event => handleSceneSlotDragLeave(scene.id, "slot-place", event)}
                        onDrop={event => handleSceneSlotDrop(scene.id, "slot-place", event)}
                        onPointerDown={event => event.stopPropagation()}
                        onClick={(event) => {
                            if (clickConnectSource) return;
                            event.stopPropagation();
                            onSelectNode?.(scene.id);
                        }}
                        className={socketClass(placeAccept, placeHover)}
                    >
                        <Icon path={mdLabel} size={13} className="shrink-0 text-on-surface-variant" />
                        <span className="min-w-0 flex-1 truncate type-label-s text-on-surface">
                            {scene.place.mode === "set"
                                ? scene.place.text || t("page.storyMaker.v2.slots.placeSet")
                                : t(
                                    scene.place.mode === "hide"
                                        ? "page.storyMaker.v2.slots.placeHide"
                                        : "page.storyMaker.v2.slots.placeInherit",
                                )}
                        </span>
                    </div>

                    <div
                        data-drop-zone="slot-transition"
                        onDragOver={event => handleSceneSlotDragOver(scene.id, "slot-transition", event)}
                        onDragLeave={event => handleSceneSlotDragLeave(scene.id, "slot-transition", event)}
                        onDrop={event => handleSceneSlotDrop(scene.id, "slot-transition", event)}
                        onPointerDown={event => event.stopPropagation()}
                        onClick={(event) => {
                            if (clickConnectSource) return;
                            event.stopPropagation();
                            onSelectNode?.(scene.id);
                        }}
                        className={socketClass(transAccept, transHover)}
                    >
                        <Icon path={mdAnimation} size={13} className="shrink-0 text-tertiary" />
                        <span className="min-w-0 flex-1 truncate type-label-s text-on-surface">
                            {transLabel}
                        </span>
                    </div>
                </div>

                {/* Stage Cast Socket */}
                <div
                    data-drop-zone="slot-cast"
                    onDragOver={event => handleSceneSlotDragOver(scene.id, "slot-cast", event)}
                    onDragLeave={event => handleSceneSlotDragLeave(scene.id, "slot-cast", event)}
                    onDrop={event => handleSceneSlotDrop(scene.id, "slot-cast", event)}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={(event) => {
                        if (clickConnectSource) return;
                        event.stopPropagation();
                        onSelectNode?.(scene.id);
                    }}
                    className={cn(socketClass(castAccept, castHover), "flex-col items-stretch gap-1")}
                >
                    <div className="flex items-center justify-between gap-1.5">
                        <span className="inline-flex items-center gap-1 type-label-s text-on-surface-variant">
                            <Icon path={mdGroups} size={14} className="shrink-0 text-secondary" />
                            <span>{t("page.storyMaker.v2.slots.stageCast")}</span>
                        </span>
                        {scene.stageCast.mode === "set" ? (
                            <span className="font-mono type-label-s text-on-surface-variant">
                                {scene.stageCast.actors.length}/{STORY_LIMITS.stageActors}
                            </span>
                        ) : (
                            <span className="type-label-s text-on-surface-variant">
                                {t(
                                    scene.stageCast.mode === "clear"
                                        ? "page.storyMaker.v2.slots.castClear"
                                        : "page.storyMaker.v2.slots.castInherit",
                                )}
                            </span>
                        )}
                    </div>
                    {scene.stageCast.mode === "set" && (
                        scene.stageCast.actors.length === 0 ? (
                            <span className="truncate type-label-s text-on-surface-variant opacity-80">
                                {t("page.storyMaker.v2.slots.emptyCastSlot")}
                            </span>
                        ) : (
                            <div className="flex flex-wrap gap-1">
                                {scene.stageCast.actors.map((actor) => (
                                    <span
                                        key={actor.castKey}
                                        className="inline-flex max-w-full items-center gap-1 rounded-md3-full bg-secondary-container px-1.5 py-0.5 type-label-s text-on-secondary-container"
                                    >
                                        <span className="max-w-[90px] truncate">
                                            {castNameByKey.get(actor.castKey) || actor.castKey}
                                        </span>
                                        <span className="opacity-70">{slotLabel(actor.slot, t)}</span>
                                    </span>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </div>
        );
    };

    const renderSceneBeats = (scene: SceneNode) => {
        const canExpand = scene.beats.length > MAX_VISIBLE_BEATS;
        const isExpanded = canExpand && expandedNodeIds.has(scene.id);

        const visibleIndices: number[] = (() => {
            const all = scene.beats.map((_, i) => i);
            if (!canExpand || isExpanded) return all;
            const base = all.slice(0, MAX_VISIBLE_BEATS);
            if (activeBeatId && activeNodeId === scene.id) {
                const activeIdx = scene.beats.findIndex(b => b.id === activeBeatId);
                if (activeIdx >= MAX_VISIBLE_BEATS) {
                    return [...all.slice(0, MAX_VISIBLE_BEATS - 1), activeIdx];
                }
            }
            return base;
        })();

        const hiddenCount = Math.max(0, scene.beats.length - visibleIndices.length);
        const trackAccept = isZoneAcceptingActiveDrag("beat-track");
        const trackHover = dropHover?.kind === "beat-track" && dropHover.nodeId === scene.id ? dropHover : null;

        return (
            <div
                data-drop-zone="beat-track"
                onDragOver={event => handleBeatTrackDragOver(scene, visibleIndices, event)}
                onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setDropHover(prev => (prev?.kind === "beat-track" && prev.nodeId === scene.id ? null : prev));
                    }
                }}
                onDrop={event => handleBeatTrackDrop(scene, visibleIndices, event)}
                className={cn(
                    "space-y-0.5 rounded-b-[calc(var(--radius-md3-xl)-1px)] border-2 p-2 transition-colors",
                    trackHover
                        ? "border-dashed border-primary bg-primary-container/25"
                        : trackAccept
                            ? "border-dashed border-primary/70 bg-primary-container/15"
                            : "border-transparent",
                )}
            >
                <div className="mb-1 flex items-center justify-between px-0.5">
                    <span className="type-label-s text-on-surface-variant">
                        {t("page.storyMaker.v2.beats.sectionTitle")}
                    </span>
                    <span className="font-mono type-label-s text-on-surface-variant">
                        {scene.beats.length}
                    </span>
                </div>

                {scene.beats.length === 0 ? (
                    <div
                        className={cn(
                            "rounded-md3-sm border border-dashed px-2 py-2 text-center type-label-s text-on-surface-variant",
                            trackHover ? "border-primary bg-primary-container/30 text-on-primary-container" : "border-outline-variant/60",
                        )}
                    >
                        {t("page.storyMaker.v2.beats.emptyBeats")}
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {visibleIndices.map((actualIdx, visualIdx) => {
                            const beat = scene.beats[actualIdx];
                            if (!beat) return null;
                            const isBeatActive = activeNodeId === scene.id && activeBeatId === beat.id;
                            const isBeingDragged = draggingBeat?.sourceNodeId === scene.id && draggingBeat.beatId === beat.id;
                            const diagSev = beatDiags.get(`${scene.id}:${beat.id}`);
                            const showInsertBefore = trackHover !== null && trackHover.visualIndex === visualIdx;
                            const summaryText = beatSummary(beat, doc, castNameByKey, varById, t);

                            return (
                                <React.Fragment key={beat.id}>
                                    {showInsertBefore && (
                                        <div className="pointer-events-none relative my-0.5 flex items-center">
                                            <span className="size-2 shrink-0 rounded-full bg-primary" />
                                            <span className="h-0.5 flex-1 rounded-full bg-primary" />
                                        </div>
                                    )}
                                    <div
                                        data-beat-row-idx={visualIdx}
                                        draggable={isEdit}
                                        onPointerDown={event => event.stopPropagation()}
                                        onDragStart={(event) => {
                                            if (!isEdit) return;
                                            event.stopPropagation();
                                            const payload: StoryBeatDragPayload = {
                                                sourceNodeId: scene.id,
                                                beatId: beat.id,
                                            };
                                            setDraggingBeat(payload);
                                            event.dataTransfer.setData(STORY_BEAT_DRAG_MIME, JSON.stringify(payload));
                                            event.dataTransfer.setData("text/plain", beat.id);
                                            event.dataTransfer.effectAllowed = "move";
                                        }}
                                        onDragEnd={() => {
                                            setDraggingBeat(null);
                                            setDropHover(null);
                                        }}
                                        onContextMenu={event => openBeatContextMenu(scene.id, beat.id, event)}
                                        className={cn(
                                            "group/beat flex min-w-0 items-center gap-0.5 rounded-md3-sm transition-colors",
                                            isBeatActive
                                                ? "bg-primary-container text-on-primary-container"
                                                : "text-on-surface hover:bg-surface-container-high",
                                            isBeingDragged && "opacity-45",
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onPointerDown={event => event.stopPropagation()}
                                            onClick={(event) => {
                                                if (clickConnectSource) return;
                                                event.stopPropagation();
                                                if (onSelectBeat) onSelectBeat(scene.id, beat.id);
                                                else onSelectNode?.(scene.id);
                                            }}
                                            className={cn(
                                                "state-layer focus-ring flex min-w-0 flex-1 items-center gap-1.5 rounded-md3-sm px-1.5 py-1 text-left",
                                                isEdit && "cursor-grab active:cursor-grabbing",
                                            )}
                                        >
                                            {isEdit && (
                                                <Icon
                                                    path={mdDragIndicator}
                                                    size={13}
                                                    className="shrink-0 opacity-45 group-hover/beat:opacity-80"
                                                />
                                            )}
                                            <Icon path={beatIcon(beat)} size={14} className="shrink-0 opacity-85" />
                                            <span className="min-w-0 flex-1 truncate type-body-s">
                                                {summaryText}
                                            </span>
                                            {beat.kind === "talk" && (beat.reactions?.length ?? 0) > 0 && (
                                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md3-xs bg-secondary-container/80 px-1 py-0.5 type-label-s text-on-secondary-container">
                                                    <Icon path={mdMood} size={11} />
                                                    <span>{beat.reactions!.length}</span>
                                                </span>
                                            )}
                                            {beat.kind === "talk" && beat.voice && (
                                                <Icon path={mdRecordVoiceOver} size={13} className="shrink-0 text-primary" />
                                            )}
                                            {(beat.kind === "talk" || beat.kind === "narration") && beat.se && (
                                                <Icon path={mdVolumeUp} size={12} className="shrink-0 text-secondary" />
                                            )}
                                            {diagSev && (
                                                <Icon
                                                    path={diagSev === "error" ? mdErrorFill : mdWarningFill}
                                                    size={13}
                                                    className={cn("shrink-0", diagSev === "error" ? "text-error" : "text-tertiary")}
                                                />
                                            )}
                                        </button>
                                        {isEdit && onDeleteBeat && !clickConnectSource && (
                                            <button
                                                type="button"
                                                aria-label={t("page.storyMaker.nle.contextDeleteStep")}
                                                title={t("page.storyMaker.nle.contextDeleteStep")}
                                                onPointerDown={event => event.stopPropagation()}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onDeleteBeat(scene.id, beat.id);
                                                }}
                                                className="focus-ring mr-1 flex size-5 shrink-0 items-center justify-center rounded-full text-on-surface-variant opacity-0 transition-opacity hover:bg-error-container hover:text-on-error-container group-hover/beat:opacity-100 focus-visible:opacity-100"
                                            >
                                                <Icon path={mdClose} size={12} />
                                            </button>
                                        )}
                                    </div>
                                </React.Fragment>
                            );
                        })}

                        {trackHover !== null && trackHover.visualIndex >= visibleIndices.length && (
                            <div className="pointer-events-none relative my-0.5 flex items-center">
                                <span className="size-2 shrink-0 rounded-full bg-primary" />
                                <span className="h-0.5 flex-1 rounded-full bg-primary" />
                            </div>
                        )}
                    </div>
                )}

                {canExpand && (
                    <button
                        type="button"
                        aria-expanded={isExpanded}
                        onPointerDown={event => event.stopPropagation()}
                        onClick={(event) => {
                            if (clickConnectSource) return;
                            event.stopPropagation();
                            toggleNodeExpanded(scene.id);
                        }}
                        className={cn(
                            "state-layer focus-ring mt-1 flex w-full items-center justify-center gap-1 rounded-md3-sm bg-surface-container px-2 py-1 type-label-s",
                            isExpanded ? "text-on-surface-variant" : "text-primary",
                        )}
                    >
                        <Icon
                            path={isExpanded ? mdKeyboardArrowUp : mdKeyboardArrowDown}
                            size={15}
                            className="shrink-0"
                        />
                        <span className="truncate">
                            {isExpanded
                                ? t("page.storyMaker.nle.collapseSteps")
                                : t("page.storyMaker.nle.expandSteps", { count: hiddenCount })}
                        </span>
                    </button>
                )}
            </div>
        );
    };

    return (
        <div
            className={cn(
                "relative flex min-h-[14rem] min-w-0 flex-col overflow-hidden rounded-md3-xl border bg-surface-container-lowest",
                isPlay ? "border-primary/50" : "border-outline-variant/70",
                className,
            )}
        >
            {/* Top Canvas Toolbar (strictly single-row with container-query progressive compression) */}
            <div className="@container z-10 flex h-10 min-w-0 shrink-0 flex-nowrap items-center justify-between gap-1.5 overflow-x-auto overflow-y-hidden border-b border-outline-variant/60 bg-surface-container-low px-2">
                {isEdit ? (
                    <div className="flex min-w-0 shrink-0 flex-nowrap items-center gap-1">
                        {(onUndo || onRedo) && (
                            <>
                                <div className="inline-flex shrink-0 items-center gap-1">
                                    {onUndo && (
                                        <Button
                                            size="xs"
                                            variant="outlined"
                                            icon={mdUndo}
                                            disabled={!canUndo}
                                            aria-label={t("page.storyMaker.editor.undo")}
                                            title={`${t("page.storyMaker.editor.undo")} (Ctrl+Z)`}
                                            className="shrink-0 gap-1 px-2"
                                            onClick={onUndo}
                                        >
                                            <span className="hidden @[980px]:inline">{t("page.storyMaker.editor.undo")}</span>
                                            {undoCount > 0 && (
                                                <span className="font-mono text-[11px] opacity-80">{undoCount}</span>
                                            )}
                                        </Button>
                                    )}
                                    {onRedo && (
                                        <Button
                                            size="xs"
                                            variant="outlined"
                                            icon={mdRedo}
                                            disabled={!canRedo}
                                            aria-label={t("page.storyMaker.editor.redo")}
                                            title={`${t("page.storyMaker.editor.redo")} (Ctrl+Y)`}
                                            className="shrink-0 gap-1 px-2"
                                            onClick={onRedo}
                                        >
                                            <span className="hidden @[980px]:inline">{t("page.storyMaker.editor.redo")}</span>
                                            {redoCount > 0 && (
                                                <span className="font-mono text-[11px] opacity-80">{redoCount}</span>
                                            )}
                                        </Button>
                                    )}
                                </div>
                                <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-outline-variant/60" />
                            </>
                        )}
                        {onAddNode && (
                            <div className="inline-flex shrink-0 items-center gap-1">
                                <Button
                                    size="xs"
                                    variant="tonal"
                                    icon={mdMovie}
                                    disabled={nodesFull}
                                    aria-label={t("page.storyMaker.v2.nodeTypes.scene")}
                                    title={t("page.storyMaker.v2.nodeTypes.scene")}
                                    className="shrink-0 gap-1 px-2"
                                    onClick={() => onAddNode("scene")}
                                >
                                    <span className="hidden @[700px]:inline">{t("page.storyMaker.v2.nodeTypes.scene")}</span>
                                </Button>
                                <Button
                                    size="xs"
                                    variant="tonal"
                                    color="tertiary"
                                    icon={mdAltRoute}
                                    disabled={nodesFull}
                                    aria-label={t("page.storyMaker.v2.nodeTypes.choice")}
                                    title={t("page.storyMaker.v2.nodeTypes.choice")}
                                    className="shrink-0 gap-1 px-2"
                                    onClick={() => onAddNode("choice")}
                                >
                                    <span className="hidden @[700px]:inline">{t("page.storyMaker.v2.nodeTypes.choice")}</span>
                                </Button>
                                <Button
                                    size="xs"
                                    variant="tonal"
                                    color="secondary"
                                    icon={mdCalculate}
                                    disabled={nodesFull}
                                    aria-label={t("page.storyMaker.v2.nodeTypes.condition")}
                                    title={t("page.storyMaker.v2.nodeTypes.condition")}
                                    className="shrink-0 gap-1 px-2"
                                    onClick={() => onAddNode("condition")}
                                >
                                    <span className="hidden @[700px]:inline">{t("page.storyMaker.v2.nodeTypes.condition")}</span>
                                </Button>
                                <Button
                                    size="xs"
                                    variant="outlined"
                                    icon={mdFlag}
                                    disabled={nodesFull}
                                    aria-label={t("page.storyMaker.v2.nodeTypes.end")}
                                    title={t("page.storyMaker.v2.nodeTypes.end")}
                                    className="shrink-0 gap-1 px-2"
                                    onClick={() => onAddNode("end")}
                                >
                                    <span className="hidden @[700px]:inline">{t("page.storyMaker.v2.nodeTypes.end")}</span>
                                </Button>
                            </div>
                        )}
                        {onAutoLayout && (
                            <Button
                                size="xs"
                                variant="outlined"
                                icon={mdWandStars}
                                aria-label={t("page.storyMaker.flow.autoLayout")}
                                title={t("page.storyMaker.flow.autoLayout")}
                                className="shrink-0 gap-1 px-2"
                                onClick={handleTriggerAutoLayout}
                            >
                                <span className="hidden @[860px]:inline">{t("page.storyMaker.flow.autoLayout")}</span>
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-hidden">
                        {isPlay && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md3-full bg-primary px-2 py-0.5 type-label-s text-on-primary">
                                <Icon path={mdLock} size={12} className="shrink-0" />
                                <span className="hidden truncate @[820px]:inline">{t("page.storyMaker.v2.mode.canvasReadonlyHint")}</span>
                            </span>
                        )}
                        {activeNodeObj && (
                            <span className="inline-flex min-w-0 max-w-[16rem] items-center gap-1.5 rounded-md3-full bg-primary-container px-2 py-0.5 type-label-s text-on-primary-container">
                                <span aria-hidden className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-primary" />
                                <span className="truncate">
                                    {nodeDisplayTitle(activeNodeObj, t)}
                                </span>
                            </span>
                        )}
                        <span className="hidden shrink-0 items-center gap-1 rounded-md3-full bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface-variant @[680px]:inline-flex">
                            <Icon path={mdAccountTree} size={13} className="shrink-0" />
                            <span>{t("page.storyMaker.phase.visitedNodes", { count: visitedNodeSet.size })}</span>
                        </span>
                    </div>
                )}

                <div className="flex shrink-0 flex-nowrap items-center gap-0.5">
                    {expandableNodeIds.length > 0 && (
                        <Button
                            size="xs"
                            variant="text"
                            icon={allExpandableExpanded ? mdUnfoldLess : mdUnfoldMore}
                            aria-label={t(allExpandableExpanded ? "page.storyMaker.nle.collapseAllNodes" : "page.storyMaker.nle.expandAllNodes")}
                            title={t(allExpandableExpanded ? "page.storyMaker.nle.collapseAllNodes" : "page.storyMaker.nle.expandAllNodes")}
                            onClick={toggleAllExpanded}
                            className="mr-0.5 shrink-0 gap-1 px-1.5"
                        >
                            <span className="hidden @[860px]:inline">
                                {t(allExpandableExpanded ? "page.storyMaker.nle.collapseAllNodes" : "page.storyMaker.nle.expandAllNodes")}
                            </span>
                        </Button>
                    )}
                    <IconButton
                        size="xs"
                        icon={mdZoomOut}
                        label={t("page.storyMaker.flow.zoomOut")}
                        disabled={view.zoom <= MIN_ZOOM + 0.01}
                        onClick={() => zoomBy(1 / 1.2)}
                    />
                    <button
                        type="button"
                        onClick={() => fitView()}
                        title={t("page.storyMaker.flow.fitView")}
                        className="state-layer focus-ring min-w-10 shrink-0 rounded-md3-sm px-1 py-1 text-center font-mono type-label-s text-on-surface-variant"
                    >
                        {zoomPercent}%
                    </button>
                    <IconButton
                        size="xs"
                        icon={mdZoomIn}
                        label={t("page.storyMaker.flow.zoomIn")}
                        disabled={view.zoom >= MAX_ZOOM - 0.01}
                        onClick={() => zoomBy(1.2)}
                    />
                    <IconButton
                        size="xs"
                        icon={mdCenterFocusStrong}
                        label={t("page.storyMaker.flow.fitView")}
                        onClick={() => fitView()}
                    />
                </div>
            </div>

            {/* Interactive 2D Pan & Zoom Viewport */}
            <div
                ref={viewportRef}
                role="region"
                aria-label={t("page.storyMaker.flow.title")}
                onPointerDown={handleViewportPointerDown}
                onPointerMove={handleViewportPointerMove}
                onPointerUp={handleViewportPointerUp}
                onPointerCancel={() => setPanState(null)}
                onContextMenu={handleViewportContextMenu}
                onDragOver={handleViewportDragOver}
                onDragLeave={handleViewportDragLeave}
                onDrop={handleViewportDrop}
                className={cn(
                    "relative min-h-0 flex-1 touch-none select-none overflow-hidden",
                    panState ? "cursor-grabbing" : clickConnectSource ? "cursor-crosshair" : "cursor-grab",
                )}
                style={{
                    backgroundImage: "radial-gradient(circle, var(--md-sys-color-outline-variant) 1.2px, transparent 1.2px)",
                    backgroundSize: `${gridStep}px ${gridStep}px`,
                    backgroundPosition: `${view.x % gridStep}px ${view.y % gridStep}px`,
                }}
            >
                {/* Click-to-Connect Floating Banner */}
                {isEdit && clickConnectSource && (
                    <div
                        data-flow-connecting="true"
                        onPointerDown={event => event.stopPropagation()}
                        className="glass absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-md3-full px-3.5 py-1.5 text-on-surface"
                    >
                        <Icon path={mdLink} size={18} className="shrink-0 text-primary" />
                        <span className="truncate type-label-l">
                            {t("page.storyMaker.flow.connectingFrom", { name: clickConnectSource.label })}
                        </span>
                        <span className="hidden type-label-m text-on-surface-variant sm:inline">
                            · {t("page.storyMaker.flow.clickTargetLabel")}
                        </span>
                        {clickConnectSource.hasExistingEdge && onDisconnectPort && (
                            <Button
                                size="xs"
                                variant="outlined"
                                color="error"
                                icon={mdLinkOff}
                                onClick={() => {
                                    onDisconnectPort(clickConnectSource.fromNodeId, clickConnectSource.fromPortId);
                                    setClickConnectSource(null);
                                }}
                            >
                                {t("page.storyMaker.nle.contextDisconnectEdge")}
                            </Button>
                        )}
                        <Button
                            size="xs"
                            variant="tonal"
                            color="error"
                            icon={mdClose}
                            onClick={() => setClickConnectSource(null)}
                        >
                            {t("page.storyMaker.flow.cancelConnect")}
                        </Button>
                    </div>
                )}

                {/* Rubber-band Unwire / Rewire Hint Banner */}
                {isEdit && wireDrag?.dragged && wireDrag.kind === "target" && !wireDrag.hoveredTargetNodeId && wireDrag.source.hasExistingEdge && (
                    <div className="glass pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-md3-full px-3 py-1 type-label-m text-error">
                        <Icon path={mdLinkOff} size={16} className="shrink-0" />
                        <span>{t("page.storyMaker.v2.ports.dropCanvasToUnwire")}</span>
                    </div>
                )}
                {isEdit && wireDrag?.dragged && wireDrag.kind === "source" && !wireDrag.hoveredSourcePort && (
                    <div className="glass pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-md3-full px-3 py-1 type-label-m text-error">
                        <Icon path={mdLinkOff} size={16} className="shrink-0" />
                        <span>{t("page.storyMaker.v2.ports.dropPortToRewire")}</span>
                    </div>
                )}

                {/* Non-node Drop Reject Hint Banner on Blank Canvas */}
                {isEdit && dropHover?.kind === "canvas-reject" && (
                    <div className="glass pointer-events-none absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1.5 rounded-md3-full px-3.5 py-1.5 type-label-m text-on-surface">
                        <Icon path={mdWarning} size={16} className="shrink-0 text-tertiary" />
                        <span className="truncate">{t(dropHover.hintKey)}</span>
                    </div>
                )}

                {/* Transformed World Layer */}
                <div
                    className="pointer-events-none absolute left-0 top-0"
                    style={{
                        transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                        transformOrigin: "0 0",
                    }}
                >
                    {/* SVG Explicit Edges Layer (ZERO implicit wires) */}
                    <svg
                        width={1}
                        height={1}
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-0 overflow-visible"
                    >
                        <defs>
                            <marker
                                id={`${markerPrefix}-arrow-primary`}
                                viewBox="0 0 10 10"
                                refX="8"
                                refY="5"
                                markerWidth="7"
                                markerHeight="7"
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--md-sys-color-primary)" />
                            </marker>
                            <marker
                                id={`${markerPrefix}-arrow-tertiary`}
                                viewBox="0 0 10 10"
                                refX="8"
                                refY="5"
                                markerWidth="7"
                                markerHeight="7"
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--md-sys-color-tertiary)" />
                            </marker>
                            <marker
                                id={`${markerPrefix}-arrow-secondary`}
                                viewBox="0 0 10 10"
                                refX="8"
                                refY="5"
                                markerWidth="7"
                                markerHeight="7"
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--md-sys-color-secondary)" />
                            </marker>
                        </defs>

                        {renderedEdges.map(({ edge, d, tone, dashed, visited }) => {
                            const isRewiringThis = Boolean(
                                wireDrag?.dragged
                                && (
                                    (wireDrag.kind === "target" && wireDrag.rewiringEdgeId === edge.id)
                                    || (wireDrag.kind === "source" && wireDrag.edge.id === edge.id)
                                ),
                            );
                            const isHot = !isRewiringThis && (hoveredEdgeId === edge.id || selectedEdgeId === edge.id);
                            const stroke = visited
                                ? "var(--md-sys-color-primary)"
                                : tone === "tertiary"
                                    ? "var(--md-sys-color-tertiary)"
                                    : tone === "secondary"
                                        ? "var(--md-sys-color-secondary)"
                                        : "var(--md-sys-color-primary)";
                            const markerId = visited
                                ? `${markerPrefix}-arrow-primary`
                                : `${markerPrefix}-arrow-${tone}`;
                            const strokeWidth = visited ? 3.4 : isHot ? 3.2 : 2.3;
                            const strokeOpacity = isRewiringThis ? 0.2 : isReadonly && !visited ? 0.45 : isHot ? 1 : 0.9;

                            return (
                                <g key={edge.id}>
                                    <path
                                        d={d}
                                        fill="none"
                                        stroke={stroke}
                                        strokeWidth={strokeWidth}
                                        strokeOpacity={strokeOpacity}
                                        strokeDasharray={isRewiringThis || dashed ? "6 4" : undefined}
                                        strokeLinecap="round"
                                        markerEnd={`url(#${markerId})`}
                                    />
                                    {isEdit && !isRewiringThis && (
                                        <path
                                            d={d}
                                            fill="none"
                                            stroke="transparent"
                                            strokeWidth={16}
                                            className="pointer-events-auto cursor-pointer"
                                            onMouseEnter={() => setHoveredEdgeId(edge.id)}
                                            onMouseLeave={() => setHoveredEdgeId(prev => (prev === edge.id ? null : prev))}
                                            onPointerDown={event => event.stopPropagation()}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setSelectedEdgeId(prev => (prev === edge.id ? null : edge.id));
                                            }}
                                            onContextMenu={event => openEdgeContextMenu(edge, event)}
                                        />
                                    )}
                                </g>
                            );
                        })}

                        {/* Live Rubber-Band Bezier Curve */}
                        {rubberBandPath && (
                            <path
                                d={rubberBandPath}
                                fill="none"
                                stroke={
                                    (wireDrag?.kind === "target" && wireDrag.hoveredTargetNodeId)
                                    || (wireDrag?.kind === "source" && wireDrag.hoveredSourcePort)
                                        ? "var(--md-sys-color-primary)"
                                        : "var(--md-sys-color-outline)"
                                }
                                strokeWidth={2.75}
                                strokeDasharray="7 4"
                                strokeLinecap="round"
                                markerEnd={`url(#${markerPrefix}-arrow-primary)`}
                            />
                        )}
                    </svg>

                    {/* Draggable Edge Endpoint Handles (Tail / Source & Head / Target) */}
                    {isEdit && renderedEdges.map(({ edge, tailHandlePos, headHandlePos, tone }) => {
                        const isRewiringThis = Boolean(
                            wireDrag?.dragged
                            && (
                                (wireDrag.kind === "target" && wireDrag.rewiringEdgeId === edge.id)
                                || (wireDrag.kind === "source" && wireDrag.edge.id === edge.id)
                            ),
                        );
                        if (isRewiringThis) return null;
                        const isHot = hoveredEdgeId === edge.id || selectedEdgeId === edge.id;
                        const dotTone = tone === "tertiary"
                            ? "border-tertiary bg-tertiary-container"
                            : tone === "secondary"
                                ? "border-secondary bg-secondary-container"
                                : "border-primary bg-primary-container";
                        return (
                            <React.Fragment key={`edge-handles:${edge.id}`}>
                                {/* Tail / Source End Handle */}
                                <button
                                    type="button"
                                    aria-label={t("page.storyMaker.v2.ports.dragEdgeSource")}
                                    title={t("page.storyMaker.v2.ports.dragEdgeSource")}
                                    style={{ left: tailHandlePos.x, top: tailHandlePos.y }}
                                    onMouseEnter={() => setHoveredEdgeId(edge.id)}
                                    onMouseLeave={() => setHoveredEdgeId(prev => (prev === edge.id ? null : prev))}
                                    onPointerDown={event => handleEdgeTailPointerDown(edge, event)}
                                    onPointerMove={handleEdgeTailPointerMove}
                                    onPointerUp={event => handleEdgeTailPointerUp(edge, event)}
                                    onPointerCancel={() => setWireDrag(null)}
                                    onClick={event => event.stopPropagation()}
                                    className="focus-ring pointer-events-auto absolute z-[7] flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
                                >
                                    <span
                                        className={cn(
                                            "size-2.5 rounded-full border-2 shadow-elev-1 transition-all",
                                            dotTone,
                                            isHot ? "scale-110 opacity-100 ring-2 ring-primary/35" : "scale-75 opacity-0 hover:scale-110 hover:opacity-100",
                                        )}
                                    />
                                </button>
                                {/* Head / Target (Arrow) End Handle */}
                                <button
                                    type="button"
                                    aria-label={t("page.storyMaker.v2.ports.dragEdgeTarget")}
                                    title={t("page.storyMaker.v2.ports.dragEdgeTarget")}
                                    style={{ left: headHandlePos.x, top: headHandlePos.y }}
                                    onMouseEnter={() => setHoveredEdgeId(edge.id)}
                                    onMouseLeave={() => setHoveredEdgeId(prev => (prev === edge.id ? null : prev))}
                                    onPointerDown={event => handleEdgeHeadPointerDown(edge, event)}
                                    onPointerMove={handleEdgeHeadPointerMove}
                                    onPointerUp={event => handleEdgeHeadPointerUp(edge, event)}
                                    onPointerCancel={() => setWireDrag(null)}
                                    onClick={event => event.stopPropagation()}
                                    className="focus-ring pointer-events-auto absolute z-[7] flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
                                >
                                    <span
                                        className={cn(
                                            "size-2.5 rounded-full border-2 shadow-elev-1 transition-all",
                                            dotTone,
                                            isHot ? "scale-110 opacity-100 ring-2 ring-primary/35" : "scale-75 opacity-0 hover:scale-110 hover:opacity-100",
                                        )}
                                    />
                                </button>
                            </React.Fragment>
                        );
                    })}

                    {/* Edge Midpoint Labels & Hover/Selected Quick-Disconnect Controls */}
                    {renderedEdges.map(({ edge, labelPos, label, tone, visited }) => {
                        const isHot = isEdit && (hoveredEdgeId === edge.id || selectedEdgeId === edge.id);
                        if (!label && !isHot) return null;

                        return (
                            <div
                                key={`edge-pill:${edge.id}`}
                                onMouseEnter={() => isEdit && setHoveredEdgeId(edge.id)}
                                onMouseLeave={() => isEdit && setHoveredEdgeId(prev => (prev === edge.id ? null : prev))}
                                onPointerDown={event => event.stopPropagation()}
                                onContextMenu={isEdit ? event => openEdgeContextMenu(edge, event) : undefined}
                                style={{ left: labelPos.x, top: labelPos.y }}
                                className={cn(
                                    "pointer-events-auto absolute z-[6] flex max-w-[180px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md3-full border shadow-elev-1",
                                    label ? "px-2 py-0.5" : "p-0.5",
                                    visited
                                        ? "border-primary/50 bg-primary-container text-on-primary-container"
                                        : tone === "tertiary"
                                            ? "border-tertiary/45 bg-tertiary-container text-on-tertiary-container"
                                            : tone === "secondary"
                                                ? "border-secondary/45 bg-secondary-container text-on-secondary-container"
                                                : "border-primary/45 bg-primary-container text-on-primary-container",
                                )}
                            >
                                {label && (
                                    <span className="truncate type-label-s">{label}</span>
                                )}
                                {isHot && onDisconnectEdge && (
                                    <button
                                        type="button"
                                        aria-label={t("page.storyMaker.nle.contextDisconnectEdge")}
                                        title={t("page.storyMaker.nle.contextDisconnectEdge")}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onDisconnectEdge(edge.id);
                                            setSelectedEdgeId(null);
                                        }}
                                        className="focus-ring flex size-4 shrink-0 items-center justify-center rounded-full bg-error text-on-error transition-transform hover:scale-110"
                                    >
                                        <Icon path={mdClose} size={11} />
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {/* Ghost Drop Card on Blank Canvas (Only for Node Payloads!) */}
                    {isEdit && dropHover?.kind === "canvas" && (
                        <div
                            className="pointer-events-none absolute z-[25] flex w-[272px] flex-col items-center justify-center gap-1.5 rounded-md3-xl border-2 border-dashed border-primary bg-primary-container/25 px-4 py-6 text-center text-on-primary-container"
                            style={{ left: dropHover.pos.x, top: dropHover.pos.y }}
                        >
                            <Icon path={mdAdd} size={22} className="text-primary" />
                            <span className="type-label-l">{t("page.storyMaker.nle.dropCreateNode")}</span>
                        </div>
                    )}

                    {/* Node Cards Layer */}
                    {nodesList.map((node) => {
                        const pos = getNodePos(node);
                        const isDragging = dragState?.nodeId === node.id && dragState.moved;
                        const isActive = activeNodeId === node.id;
                        const isVisited = isReadonly && !isActive && visitedNodeSet.has(node.id);
                        const isReachable = reachableNodeSet.has(node.id);
                        const diagSummary = nodeDiags.get(node.id);
                        const isValidConnectTarget = isEdit
                            && activeWireSource !== null
                            && canConnectNodes(doc, activeWireSource.fromNodeId, activeWireSource.fromPortId, node.id).ok;
                        const isHoveredConnectTarget = isValidConnectTarget && wireDrag?.kind === "target" && wireDrag.hoveredTargetNodeId === node.id;
                        const title = nodeDisplayTitle(node, t);

                        const tryCompleteClickConnect = (event: React.MouseEvent): boolean => {
                            if (!isEdit || !clickConnectSource) return false;
                            if (!canConnectNodes(doc, clickConnectSource.fromNodeId, clickConnectSource.fromPortId, node.id).ok) {
                                return false;
                            }
                            event.stopPropagation();
                            completeConnection(clickConnectSource, node.id);
                            return true;
                        };

                        // 1. START HAT BLOCK (OUT port ONLY, NO input port)
                        if (node.type === "start") {
                            return (
                                <div
                                    key={node.id}
                                    ref={el => registerNodeEl(node.id, el)}
                                    data-node-id={node.id}
                                    data-node-type="start"
                                    onDragOver={handleRejectNodeDragOver}
                                    style={{ left: pos.x, top: pos.y }}
                                    className={cn(
                                        "pointer-events-auto absolute z-[3] w-[196px] rounded-md3-xl border bg-primary text-on-primary shadow-elev-2 transition-shadow",
                                        isActive ? "border-on-primary ring-2 ring-primary shadow-elev-3" : "border-primary",
                                        isDragging && "z-20 shadow-elev-4",
                                    )}
                                >
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onPointerDown={event => handleNodeHeaderPointerDown(node, event)}
                                        onPointerMove={handleNodeHeaderPointerMove}
                                        onPointerUp={event => handleNodeHeaderPointerUp(node, event)}
                                        onPointerCancel={() => setDragState(null)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                onSelectNode?.(node.id);
                                            }
                                        }}
                                        className={cn(
                                            "relative flex items-center gap-2 rounded-md3-xl py-3 pl-3 pr-5",
                                            isEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                                        )}
                                    >
                                        {isEdit && <Icon path={mdDragIndicator} size={16} className="shrink-0 opacity-70" />}
                                        <Icon path={mdPlayArrowFill} size={20} className="shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <span className="block truncate type-title-s">{title}</span>
                                            <span className="inline-block rounded-md3-full bg-on-primary/15 px-1.5 py-0.5 type-label-s text-on-primary">
                                                {t("page.storyMaker.v2.ports.outOnly")}
                                            </span>
                                        </div>
                                        {renderDiagnosticDot(diagSummary)}
                                        {renderOutPortButton(node.id, "out", title, "primary")}
                                    </div>
                                </div>
                            );
                        }

                        // 2. END TERMINAL CARD (IN port ONLY, NO output port)
                        if (node.type === "end") {
                            return (
                                <div
                                    key={node.id}
                                    ref={el => registerNodeEl(node.id, el)}
                                    data-node-id={node.id}
                                    data-node-type="end"
                                    onClick={tryCompleteClickConnect}
                                    onContextMenu={event => openNodeContextMenu(node, event)}
                                    onDragOver={handleRejectNodeDragOver}
                                    style={{ left: pos.x, top: pos.y }}
                                    className={cn(
                                        "pointer-events-auto absolute z-[3] w-[216px] rounded-md3-xl border bg-surface-container-high text-on-surface shadow-elev-1 transition-shadow",
                                        isActive && "border-primary ring-2 ring-primary shadow-elev-2",
                                        isVisited && "border-primary/55 bg-primary-container/30",
                                        !isActive && !isVisited && "border-outline-variant/80",
                                        isValidConnectTarget && "cursor-crosshair border-primary ring-2 ring-primary/70",
                                        isHoveredConnectTarget && "ring-4 ring-primary shadow-elev-4",
                                        !isReachable && !isActive && "opacity-80",
                                        isDragging && "z-20 shadow-elev-4",
                                    )}
                                >
                                    {/* Left IN port ONLY */}
                                    {renderInPortDot(node.id, "primary", isValidConnectTarget)}

                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onPointerDown={event => handleNodeHeaderPointerDown(node, event)}
                                        onPointerMove={handleNodeHeaderPointerMove}
                                        onPointerUp={event => handleNodeHeaderPointerUp(node, event)}
                                        onPointerCancel={() => setDragState(null)}
                                        onKeyDown={(event) => {
                                            if (event.key !== "Enter" && event.key !== " ") return;
                                            event.preventDefault();
                                            if (isEdit && clickConnectSource && canConnectNodes(doc, clickConnectSource.fromNodeId, clickConnectSource.fromPortId, node.id).ok) {
                                                completeConnection(clickConnectSource, node.id);
                                            } else {
                                                onSelectNode?.(node.id);
                                            }
                                        }}
                                        className={cn(
                                            "flex items-start gap-2 rounded-md3-xl px-3.5 py-2.5",
                                            isValidConnectTarget
                                                ? "cursor-crosshair"
                                                : isEdit
                                                    ? "cursor-grab active:cursor-grabbing"
                                                    : "cursor-pointer",
                                        )}
                                    >
                                        {isEdit && <Icon path={mdDragIndicator} size={16} className="mt-0.5 shrink-0 opacity-55" />}
                                        <Icon path={mdFlag} size={18} className="mt-0.5 shrink-0 text-primary" />
                                        <div className="min-w-0 flex-1 space-y-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="min-w-0 flex-1 truncate type-title-s">{title}</span>
                                                {renderDiagnosticDot(diagSummary)}
                                            </div>
                                            {node.subtitle && (
                                                <p className="line-clamp-2 type-body-s text-on-surface-variant">
                                                    {node.subtitle}
                                                </p>
                                            )}
                                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                                <span className="inline-block rounded-md3-full bg-surface-container-highest px-1.5 py-0.5 type-label-s text-on-surface-variant">
                                                    {t("page.storyMaker.v2.ports.inOnly")}
                                                </span>
                                                {!isReachable && (
                                                    <span className="inline-flex items-center gap-0.5 rounded-md3-full bg-tertiary-container px-1.5 py-0.5 type-label-s text-on-tertiary-container">
                                                        <Icon path={mdWarningFill} size={11} />
                                                        <span>{t("page.storyMaker.nle.isolatedNode")}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // 3. CHOICE BRANCH CARD
                        if (node.type === "choice") {
                            return (
                                <div
                                    key={node.id}
                                    ref={el => registerNodeEl(node.id, el)}
                                    data-node-id={node.id}
                                    data-node-type="choice"
                                    onClick={tryCompleteClickConnect}
                                    onContextMenu={event => openNodeContextMenu(node, event)}
                                    onDragOver={handleRejectNodeDragOver}
                                    style={{ left: pos.x, top: pos.y }}
                                    className={cn(
                                        "pointer-events-auto absolute z-[3] w-[272px] rounded-md3-xl border bg-surface-card shadow-elev-1 transition-shadow",
                                        isActive && "border-primary ring-2 ring-primary shadow-elev-2",
                                        isVisited && "border-primary/55 bg-primary-container/25",
                                        !isActive && !isVisited && "border-tertiary/55",
                                        isValidConnectTarget && "cursor-crosshair border-primary ring-2 ring-primary/70",
                                        isHoveredConnectTarget && "ring-4 ring-primary shadow-elev-4",
                                        !isReachable && !isActive && "opacity-80",
                                        isDragging && "z-20 shadow-elev-4",
                                    )}
                                >
                                    {/* Choice Header */}
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onPointerDown={event => handleNodeHeaderPointerDown(node, event)}
                                        onPointerMove={handleNodeHeaderPointerMove}
                                        onPointerUp={event => handleNodeHeaderPointerUp(node, event)}
                                        onPointerCancel={() => setDragState(null)}
                                        onKeyDown={(event) => {
                                            if (event.key !== "Enter" && event.key !== " ") return;
                                            event.preventDefault();
                                            if (isEdit && clickConnectSource && canConnectNodes(doc, clickConnectSource.fromNodeId, clickConnectSource.fromPortId, node.id).ok) {
                                                completeConnection(clickConnectSource, node.id);
                                            } else {
                                                onSelectNode?.(node.id);
                                            }
                                        }}
                                        className={cn(
                                            "relative flex items-center gap-2 rounded-t-[calc(var(--radius-md3-xl)-1px)] bg-tertiary-container px-3 py-2 text-on-tertiary-container",
                                            isValidConnectTarget
                                                ? "cursor-crosshair"
                                                : isEdit
                                                    ? "cursor-grab active:cursor-grabbing"
                                                    : "cursor-pointer",
                                        )}
                                    >
                                        {renderInPortDot(node.id, "tertiary", isValidConnectTarget)}
                                        {isEdit && <Icon path={mdDragIndicator} size={15} className="shrink-0 opacity-65" />}
                                        <Icon path={mdAltRoute} size={17} className="shrink-0" />
                                        <span className="min-w-0 flex-1 truncate type-title-s">{title}</span>
                                        {isReadonly && isActive && (
                                            <span aria-hidden className="inline-block size-2.5 shrink-0 animate-pulse rounded-full bg-primary ring-2 ring-surface-container-lowest" />
                                        )}
                                        {renderDiagnosticDot(diagSummary)}
                                    </div>

                                    {!isReachable && (
                                        <div className="flex items-center gap-1 border-b border-outline-variant/40 bg-tertiary-container/45 px-3 py-1 type-label-s text-on-tertiary-container">
                                            <Icon path={mdWarningFill} size={13} className="shrink-0" />
                                            <span className="truncate">{t("page.storyMaker.nle.isolatedNode")}</span>
                                        </div>
                                    )}

                                    <div className="divide-y divide-outline-variant/50 py-1">
                                        {node.options.map((option, idx) => {
                                            const optionLabel = option.text.trim() || t("page.storyMaker.player.emptyOption");
                                            const edge = getOutgoingEdge(doc, node.id, option.id);
                                            const pKey = portKeyOut(node.id, option.id);
                                            const isPortHot = activeWireSource?.portKey === pKey;

                                            return (
                                                <div
                                                    key={option.id}
                                                    className={cn(
                                                        "relative flex items-center gap-2 py-2 pl-3 pr-5",
                                                        isPortHot && "bg-tertiary-container/40",
                                                    )}
                                                >
                                                    <button
                                                        type="button"
                                                        onPointerDown={event => event.stopPropagation()}
                                                        onClick={(event) => {
                                                            if (tryCompleteClickConnect(event)) return;
                                                            event.stopPropagation();
                                                            onSelectNode?.(node.id);
                                                        }}
                                                        className="state-layer focus-ring flex min-w-0 flex-1 items-start gap-2 rounded-md3-sm px-1 py-0.5 text-left"
                                                    >
                                                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-tertiary-container type-label-s text-on-tertiary-container">
                                                            {idx + 1}
                                                        </span>
                                                        <span className="min-w-0 flex-1 space-y-0.5">
                                                            <span className="block truncate type-body-s text-on-surface">
                                                                {optionLabel}
                                                            </span>
                                                            {(option.condition || (option.effects?.length ?? 0) > 0) && (
                                                                <span className="flex flex-wrap items-center gap-1">
                                                                    {option.condition && (
                                                                        <span className="inline-flex max-w-full items-center gap-0.5 rounded-md3-xs bg-secondary-container px-1.5 py-0.5 font-mono type-label-s text-on-secondary-container">
                                                                            <Icon path={mdLock} size={11} className="shrink-0" />
                                                                            <span className="truncate">
                                                                                {formatConditionExpr(option.condition, varById)}
                                                                            </span>
                                                                        </span>
                                                                    )}
                                                                    {(option.effects?.length ?? 0) > 0 && (
                                                                        <span className="inline-flex max-w-full items-center gap-0.5 rounded-md3-xs bg-primary-container px-1.5 py-0.5 font-mono type-label-s text-on-primary-container">
                                                                            <Icon path={mdCalculate} size={11} className="shrink-0" />
                                                                            <span className="truncate">
                                                                                {formatVarOp(option.effects![0], varById)}
                                                                                {option.effects!.length > 1 ? ` +${option.effects!.length - 1}` : ""}
                                                                            </span>
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            )}
                                                            <span className="block truncate type-label-s text-on-surface-variant">
                                                                {renderTargetLabel(edge)}
                                                            </span>
                                                        </span>
                                                    </button>
                                                    {renderOutPortButton(node.id, option.id, optionLabel, "tertiary")}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }

                        // 4. CONDITION LOGIC BRANCH CARD
                        if (node.type === "condition") {
                            const elseEdge = getOutgoingEdge(doc, node.id, "else");
                            const elsePortKey = portKeyOut(node.id, "else");

                            return (
                                <div
                                    key={node.id}
                                    ref={el => registerNodeEl(node.id, el)}
                                    data-node-id={node.id}
                                    data-node-type="condition"
                                    onClick={tryCompleteClickConnect}
                                    onContextMenu={event => openNodeContextMenu(node, event)}
                                    onDragOver={handleRejectNodeDragOver}
                                    style={{ left: pos.x, top: pos.y }}
                                    className={cn(
                                        "pointer-events-auto absolute z-[3] w-[272px] rounded-md3-xl border bg-surface-card shadow-elev-1 transition-shadow",
                                        isActive && "border-primary ring-2 ring-primary shadow-elev-2",
                                        isVisited && "border-primary/55 bg-primary-container/25",
                                        !isActive && !isVisited && "border-secondary/60",
                                        isValidConnectTarget && "cursor-crosshair border-primary ring-2 ring-primary/70",
                                        isHoveredConnectTarget && "ring-4 ring-primary shadow-elev-4",
                                        !isReachable && !isActive && "opacity-80",
                                        isDragging && "z-20 shadow-elev-4",
                                    )}
                                >
                                    {/* Condition Header */}
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onPointerDown={event => handleNodeHeaderPointerDown(node, event)}
                                        onPointerMove={handleNodeHeaderPointerMove}
                                        onPointerUp={event => handleNodeHeaderPointerUp(node, event)}
                                        onPointerCancel={() => setDragState(null)}
                                        onKeyDown={(event) => {
                                            if (event.key !== "Enter" && event.key !== " ") return;
                                            event.preventDefault();
                                            if (isEdit && clickConnectSource && canConnectNodes(doc, clickConnectSource.fromNodeId, clickConnectSource.fromPortId, node.id).ok) {
                                                completeConnection(clickConnectSource, node.id);
                                            } else {
                                                onSelectNode?.(node.id);
                                            }
                                        }}
                                        className={cn(
                                            "relative flex items-center gap-2 rounded-t-[calc(var(--radius-md3-xl)-1px)] bg-secondary-container px-3 py-2 text-on-secondary-container",
                                            isValidConnectTarget
                                                ? "cursor-crosshair"
                                                : isEdit
                                                    ? "cursor-grab active:cursor-grabbing"
                                                    : "cursor-pointer",
                                        )}
                                    >
                                        {renderInPortDot(node.id, "secondary", isValidConnectTarget)}
                                        {isEdit && <Icon path={mdDragIndicator} size={15} className="shrink-0 opacity-65" />}
                                        <Icon path={mdCalculate} size={17} className="shrink-0" />
                                        <span className="min-w-0 flex-1 truncate type-title-s">{title}</span>
                                        {isReadonly && isActive && (
                                            <span aria-hidden className="inline-block size-2.5 shrink-0 animate-pulse rounded-full bg-primary ring-2 ring-surface-container-lowest" />
                                        )}
                                        {renderDiagnosticDot(diagSummary)}
                                    </div>

                                    {!isReachable && (
                                        <div className="flex items-center gap-1 border-b border-outline-variant/40 bg-tertiary-container/45 px-3 py-1 type-label-s text-on-tertiary-container">
                                            <Icon path={mdWarningFill} size={13} className="shrink-0" />
                                            <span className="truncate">{t("page.storyMaker.nle.isolatedNode")}</span>
                                        </div>
                                    )}

                                    <div className="divide-y divide-outline-variant/50 py-1">
                                        {node.rules.map((rule) => {
                                            const exprText = formatConditionExpr(rule.expr, varById);
                                            const edge = getOutgoingEdge(doc, node.id, rule.id);
                                            const pKey = portKeyOut(node.id, rule.id);
                                            const isPortHot = activeWireSource?.portKey === pKey;

                                            return (
                                                <div
                                                    key={rule.id}
                                                    className={cn(
                                                        "relative flex items-center gap-2 py-2 pl-3 pr-5",
                                                        isPortHot && "bg-secondary-container/40",
                                                    )}
                                                >
                                                    <button
                                                        type="button"
                                                        onPointerDown={event => event.stopPropagation()}
                                                        onClick={(event) => {
                                                            if (tryCompleteClickConnect(event)) return;
                                                            event.stopPropagation();
                                                            onSelectNode?.(node.id);
                                                        }}
                                                        className="state-layer focus-ring flex min-w-0 flex-1 flex-col rounded-md3-sm px-1 py-0.5 text-left"
                                                    >
                                                        {rule.label && (
                                                            <span className="truncate type-label-m text-on-surface">
                                                                {rule.label}
                                                            </span>
                                                        )}
                                                        <span className="inline-block max-w-full truncate rounded-md3-xs bg-secondary-container/60 px-1.5 py-0.5 font-mono type-label-s text-on-secondary-container">
                                                            {exprText}
                                                        </span>
                                                        <span className="mt-0.5 block truncate type-label-s text-on-surface-variant">
                                                            {renderTargetLabel(edge)}
                                                        </span>
                                                    </button>
                                                    {renderOutPortButton(node.id, rule.id, rule.label || exprText, "secondary")}
                                                </div>
                                            );
                                        })}

                                        {/* Mandatory Else Row */}
                                        <div
                                            className={cn(
                                                "relative flex items-center gap-2 rounded-b-[calc(var(--radius-md3-xl)-1px)] bg-surface-container/60 py-2 pl-3 pr-5",
                                                activeWireSource?.portKey === elsePortKey && "bg-secondary-container/45",
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onPointerDown={event => event.stopPropagation()}
                                                onClick={(event) => {
                                                    if (tryCompleteClickConnect(event)) return;
                                                    event.stopPropagation();
                                                    onSelectNode?.(node.id);
                                                }}
                                                className="state-layer focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md3-sm px-1 py-0.5 text-left"
                                            >
                                                <Icon path={mdRedo} size={15} className="shrink-0 text-on-surface-variant" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate type-label-m text-on-surface">
                                                        {t("page.storyMaker.v2.ports.elsePort")}
                                                    </span>
                                                    <span className="block truncate type-label-s text-on-surface-variant">
                                                        {renderTargetLabel(elseEdge)}
                                                    </span>
                                                </span>
                                            </button>
                                            {renderOutPortButton(
                                                node.id,
                                                "else",
                                                `${title} (${t("page.storyMaker.v2.ports.elsePort")})`,
                                                "secondary",
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // 5. SCENE BIG PUZZLE CARD (Dedicated Stage Sockets + Draggable Beat Track)
                        return (
                            <div
                                key={node.id}
                                ref={el => registerNodeEl(node.id, el)}
                                data-node-id={node.id}
                                data-node-type="scene"
                                onClick={tryCompleteClickConnect}
                                onContextMenu={event => openNodeContextMenu(node, event)}
                                onDragOver={(event) => {
                                    // Swallow unhandled dragovers on card shell so blank canvas ghost doesn't flicker underneath.
                                    if (
                                        hasDragMime(event.dataTransfer, STORY_DRAG_MIME)
                                        || hasDragMime(event.dataTransfer, STORY_BEAT_DRAG_MIME)
                                    ) {
                                        event.stopPropagation();
                                        event.dataTransfer.dropEffect = "none";
                                        setDropHover(null);
                                    }
                                }}
                                style={{ left: pos.x, top: pos.y }}
                                className={cn(
                                    "group/scene pointer-events-auto absolute z-[3] w-[292px] rounded-md3-xl border bg-surface-card shadow-elev-1 transition-shadow",
                                    isActive && "border-primary ring-2 ring-primary shadow-elev-2",
                                    isVisited && "border-primary/55 bg-primary-container/20",
                                    !isActive && !isVisited && "border-outline-variant/85",
                                    isValidConnectTarget && "cursor-crosshair border-primary ring-2 ring-primary/70",
                                    isHoveredConnectTarget && "ring-4 ring-primary shadow-elev-4",
                                    !isReachable && !isActive && "opacity-85",
                                    isDragging && "z-20 shadow-elev-4",
                                )}
                            >
                                {/* Scene Header */}
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onPointerDown={event => handleNodeHeaderPointerDown(node, event)}
                                    onPointerMove={handleNodeHeaderPointerMove}
                                    onPointerUp={event => handleNodeHeaderPointerUp(node, event)}
                                    onPointerCancel={() => setDragState(null)}
                                    onKeyDown={(event) => {
                                        if (event.key !== "Enter" && event.key !== " ") return;
                                        event.preventDefault();
                                        if (isEdit && clickConnectSource && canConnectNodes(doc, clickConnectSource.fromNodeId, clickConnectSource.fromPortId, node.id).ok) {
                                            completeConnection(clickConnectSource, node.id);
                                        } else {
                                            onSelectNode?.(node.id);
                                        }
                                    }}
                                    className={cn(
                                        "relative flex items-center gap-1.5 rounded-t-[calc(var(--radius-md3-xl)-1px)] border-b border-outline-variant/50 py-2 pl-3 pr-5",
                                        isActive
                                            ? "bg-primary-container text-on-primary-container"
                                            : "bg-surface-container-high text-on-surface",
                                        isValidConnectTarget
                                            ? "cursor-crosshair"
                                            : isEdit
                                                ? "cursor-grab active:cursor-grabbing"
                                                : "cursor-pointer",
                                    )}
                                >
                                    {/* Left IN port */}
                                    {renderInPortDot(node.id, "primary", isValidConnectTarget)}

                                    {isEdit && <Icon path={mdDragIndicator} size={15} className="shrink-0 opacity-60" />}
                                    <Icon path={mdMovie} size={17} className="shrink-0 text-primary" />
                                    <span className="min-w-0 flex-1 truncate type-title-s">{title}</span>

                                    {isReadonly && isActive && (
                                        <span
                                            aria-hidden
                                            className="inline-block size-2.5 shrink-0 animate-pulse rounded-full bg-primary ring-2 ring-surface-container-lowest"
                                        />
                                    )}

                                    {isEdit && onPlayFromNode && !clickConnectSource && (
                                        <button
                                            type="button"
                                            aria-label={t("page.storyMaker.v2.ending.playFromScene")}
                                            title={t("page.storyMaker.v2.ending.playFromScene")}
                                            onPointerDown={event => event.stopPropagation()}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onPlayFromNode(node.id);
                                            }}
                                            className="focus-ring flex size-6 shrink-0 items-center justify-center rounded-full text-primary opacity-75 transition-opacity hover:bg-primary/15 hover:opacity-100"
                                        >
                                            <Icon path={mdPlayCircle} size={16} />
                                        </button>
                                    )}

                                    {renderDiagnosticDot(diagSummary)}

                                    <span className="shrink-0 rounded-md3-full bg-surface-container-lowest/80 px-1.5 py-0.5 font-mono type-label-s text-on-surface-variant">
                                        {node.beats.length}
                                    </span>

                                    {/* Right OUT port */}
                                    {renderOutPortButton(node.id, "out", title, "primary")}
                                </div>

                                {!isReachable && (
                                    <div className="flex items-center gap-1 border-b border-outline-variant/40 bg-tertiary-container/45 px-3 py-1 type-label-s text-on-tertiary-container">
                                        <Icon path={mdWarningFill} size={13} className="shrink-0" />
                                        <span className="truncate">{t("page.storyMaker.nle.isolatedNode")}</span>
                                    </div>
                                )}

                                {/* Upper Section: Dedicated Stage Component Sockets */}
                                {renderSceneSockets(node)}

                                {/* Lower Section: Ordered Draggable Performance Beat Track */}
                                {renderSceneBeats(node)}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* MD3 Right-Click Context Menu (fixed z-[180], viewport-clamped) */}
            {isEdit && contextMenu && contextMenuActions.length > 0 && (
                <div
                    ref={contextMenuRef}
                    role="menu"
                    onContextMenu={event => event.preventDefault()}
                    style={{ left: menuPosition.left, top: menuPosition.top }}
                    className="fixed z-[180] min-w-52 rounded-md3-md border border-outline-variant/80 bg-surface-container-high p-1 text-on-surface shadow-elev-3"
                >
                    {contextMenuActions.map((item) => (
                        <React.Fragment key={item.key}>
                            {item.dividerBefore && <div className="my-1 border-t border-outline-variant/60" />}
                            <button
                                type="button"
                                role="menuitem"
                                disabled={item.disabled}
                                onClick={() => {
                                    setContextMenu(null);
                                    item.onSelect();
                                }}
                                className={cn(
                                    "state-layer focus-ring flex w-full items-center gap-2.5 rounded-md3-sm px-2.5 py-2 text-left type-label-l",
                                    item.danger ? "text-error" : "text-on-surface",
                                    item.disabled && "pointer-events-none opacity-38",
                                )}
                            >
                                <Icon path={item.icon} size={18} className="shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            )}
        </div>
    );
}
