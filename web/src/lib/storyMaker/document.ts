/**
 * Pure, immutable graph & component mutations for `moesekai-story/2` documents.
 *
 * Covers:
 * - Node creation (always 100% isolated with 0 incoming & 0 outgoing edges), movement, duplication, removal
 * - Explicit edge wiring (`connectEdge` / `disconnectEdge` / `disconnectPort`) enforcing port rules
 * - Strict single-slot stage components (`background`, `bgm`, `place`, `transition`, `stageCast`)
 * - Intra-node and cross-node ordered `SceneBeat` editing & reordering
 * - Choice options, Condition rules, Cast members, and Low-code Variables
 * - Typed Scratch/Puzzle drag-and-drop payloads (`STORY_DRAG_MIME`, `STORY_BEAT_DRAG_MIME`, `acceptsTarget`)
 * - Deterministic DAG auto-layout (`autoLayoutGraph`)
 */
import {
    STORY_SCHEMA_VERSION,
    STORY_SLOTS,
    type BackgroundSlot,
    type BgmSlot,
    type ChoiceNode,
    type ChoiceOption,
    type ConditionExpr,
    type ConditionNode,
    type ConditionRule,
    type CueBeat,
    type EndNode,
    type PlaceSlot,
    type SceneActorSlot,
    type SceneBeat,
    type SceneBeatKind,
    type SceneNode,
    type StageActionBeat,
    type StageCastSlot,
    type StoryCastMember,
    type StoryDocument,
    type StoryEdge,
    type StoryLocalePack,
    type StoryMeta,
    type StoryNode,
    type StoryNodePos,
    type StoryNodeType,
    type StoryRegion,
    type StorySlot,
    type StoryVariable,
    type StoryVoiceRef,
    type TalkBeat,
    type TransitionSlot,
    type VarOp,
} from "../../types/storyMaker.ts";
import type { UiLocale } from "../i18n/locales.ts";
import {
    DEFAULT_STORY_BACKGROUND,
    DEFAULT_STORY_BGM,
    DEFAULT_STORY_SE,
    STORY_ID_PATTERN,
    STORY_LIMITS,
    STORY_TEMPLATE_VAR_PATTERN,
} from "./limits.ts";

// ==================== Drag-and-Drop Payloads ====================

export const STORY_DRAG_MIME = "application/x-moesekai-story-v2-drag";
export const STORY_BEAT_DRAG_MIME = "application/x-moesekai-story-v2-beat";

export type StoryDropZone =
    | "canvas"
    | "slot-bg"
    | "slot-bgm"
    | "slot-place"
    | "slot-transition"
    | "slot-cast"
    | "beat-track";

export type StoryDragPayload =
    | { kind: "node"; nodeType: "scene" | "choice" | "condition" | "end" }
    | { kind: "slot-bg"; slot: BackgroundSlot }
    | { kind: "slot-bgm"; slot: BgmSlot }
    | { kind: "slot-place"; slot: PlaceSlot }
    | { kind: "slot-transition"; slot: TransitionSlot }
    | { kind: "slot-cast-mode"; mode: "inherit" | "clear" }
    | { kind: "asset-cast"; castKey: string }
    | {
        kind: "beat";
        beatKind: SceneBeat["kind"];
        cueType?: CueBeat["cueType"];
        stageAction?: StageActionBeat["action"];
    }
    | { kind: "asset-se"; name: string }
    | { kind: "asset-voice"; voice: StoryVoiceRef; speakerKey?: string }
    | { kind: "var-op"; varId: string };

export interface StoryBeatDragPayload {
    sourceNodeId: string;
    beatId: string;
}

/** Returns the strictly typed drop zones that accept `payload`. */
export function acceptsTarget(payload: StoryDragPayload): readonly StoryDropZone[] {
    switch (payload.kind) {
        case "node":
            return ["canvas"];
        case "slot-bg":
            return ["slot-bg"];
        case "slot-bgm":
            return ["slot-bgm"];
        case "slot-place":
            return ["slot-place"];
        case "slot-transition":
            return ["slot-transition"];
        case "slot-cast-mode":
            return ["slot-cast"];
        case "asset-cast":
            return ["slot-cast", "beat-track"];
        case "beat":
        case "asset-se":
        case "asset-voice":
        case "var-op":
            return ["beat-track"];
    }
}

/** Convenience predicate checking whether `zone` accepts `payload`. */
export function canDropOnTarget(payload: StoryDragPayload, zone: StoryDropZone): boolean {
    return acceptsTarget(payload).includes(zone);
}

// ==================== Layout Constants ====================

export const GRAPH_COL_GAP = 380;
export const GRAPH_ROW_GAP = 260;
export const GRAPH_ORIGIN_X = 40;
export const GRAPH_ORIGIN_Y = 120;

const PREFERRED_ACTOR_SLOTS: readonly StorySlot[] = ["left", "right", "center", "farLeft", "farRight"];

// ==================== IDs & Document Creation ====================

/** A short random id (`[a-z0-9]`), unique among `taken`. */
export function newStoryId(taken: Iterable<string> = [], length = 8): string {
    const used = new Set(taken);
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (;;) {
        let id = "";
        const bytes = new Uint8Array(length);
        globalThis.crypto.getRandomValues(bytes);
        for (const byte of bytes) id += alphabet[byte % alphabet.length];
        if (!used.has(id)) return id;
    }
}

export function clampCoord(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(STORY_LIMITS.coordMax, Math.max(STORY_LIMITS.coordMin, Math.round(value)));
}

function clampVarNumber(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(STORY_LIMITS.varNumberMax, Math.max(STORY_LIMITS.varNumberMin, value));
}

/** Creates a blank `moesekai-story/2` document with only the mandatory `start` node. */
export function createStoryDocument(region: StoryRegion, title = ""): StoryDocument {
    return {
        schema: STORY_SCHEMA_VERSION,
        id: newStoryId([], 10),
        region,
        meta: {
            title: title.slice(0, STORY_LIMITS.title),
            summary: "",
            author: "",
        },
        cast: [],
        variables: [],
        startNodeId: "start",
        nodes: {
            start: {
                id: "start",
                type: "start",
                pos: { x: GRAPH_ORIGIN_X, y: GRAPH_ORIGIN_Y },
            },
        },
        edges: [],
    };
}

/** Collects every beat id currently used across all `SceneNode`s in `doc`. */
export function allBeatIds(doc: StoryDocument): string[] {
    const ids: string[] = [];
    for (const node of Object.values(doc.nodes)) {
        if (node.type === "scene") {
            for (const beat of node.beats) ids.push(beat.id);
        }
    }
    return ids;
}

export function totalBeatCount(doc: StoryDocument): number {
    let count = 0;
    for (const node of Object.values(doc.nodes)) {
        if (node.type === "scene") count += node.beats.length;
    }
    return count;
}

// ==================== Variable Helpers ====================

export function defaultVarOpForVariable(variable: StoryVariable): VarOp {
    if (variable.type === "number") {
        return { varId: variable.id, op: "add", value: 1 };
    }
    return { varId: variable.id, op: "set", value: true };
}

export function defaultConditionForVariable(variable: StoryVariable): ConditionExpr {
    if (variable.type === "number") {
        return { varId: variable.id, op: ">=", value: 1 };
    }
    return { varId: variable.id, op: "==", value: true };
}

// ==================== Node & Port Queries ====================

/** Returns the valid outgoing port IDs of `node` in display/evaluation order. */
export function getNodeOutPorts(node: StoryNode): string[] {
    switch (node.type) {
        case "start":
        case "scene":
            return ["out"];
        case "choice":
            return node.options.map(opt => opt.id);
        case "condition":
            return [...node.rules.map(rule => rule.id), "else"];
        case "end":
            return [];
    }
}

export function canConnectNodes(
    doc: StoryDocument,
    fromNodeId: string,
    fromPortId: string,
    toNodeId: string,
): { ok: true } | { ok: false; reason: "edgeInvalidSource" | "edgeInvalidTarget" } {
    const fromNode = doc.nodes[fromNodeId];
    if (!fromNode || fromNode.type === "end") {
        return { ok: false, reason: "edgeInvalidSource" };
    }
    if (!getNodeOutPorts(fromNode).includes(fromPortId)) {
        return { ok: false, reason: "edgeInvalidSource" };
    }
    const toNode = doc.nodes[toNodeId];
    if (!toNode || toNode.id === doc.startNodeId || toNode.type === "start") {
        return { ok: false, reason: "edgeInvalidTarget" };
    }
    return { ok: true };
}

export function getOutgoingEdge(doc: StoryDocument, fromNodeId: string, fromPortId: string): StoryEdge | undefined {
    return doc.edges.find(edge => edge.fromNodeId === fromNodeId && edge.fromPortId === fromPortId);
}

export function getIncomingEdges(doc: StoryDocument, nodeId: string): StoryEdge[] {
    return doc.edges.filter(edge => edge.toNodeId === nodeId);
}

// ==================== Node Mutations ====================

/**
 * Adds a brand-new, 100% isolated node (0 incoming edges, 0 outgoing edges) at `pos`.
 * Returns the updated document and created node (or `null` if the node limit is reached).
 */
export function createNode<T extends Exclude<StoryNodeType, "start">>(
    doc: StoryDocument,
    type: T,
    pos: StoryNodePos,
    options?: { id?: string; title?: string },
): { doc: StoryDocument; node: Extract<StoryNode, { type: T }> | null } {
    const existingIds = Object.keys(doc.nodes);
    if (existingIds.length >= STORY_LIMITS.nodes) {
        return { doc, node: null };
    }
    const preferredId = options?.id && STORY_ID_PATTERN.test(options.id) && !(options.id in doc.nodes)
        ? options.id
        : undefined;
    const id = preferredId ?? `${type}_${newStoryId(existingIds, 6)}`;
    const safePos: StoryNodePos = { x: clampCoord(pos.x), y: clampCoord(pos.y) };
    const title = (options?.title ?? "").slice(0, STORY_LIMITS.nodeTitle);

    let node: StoryNode;
    switch (type) {
        case "scene": {
            const scene: SceneNode = {
                id,
                type: "scene",
                title,
                pos: safePos,
                background: { mode: "inherit" },
                bgm: { mode: "inherit" },
                place: { mode: "inherit" },
                transition: { kind: "none", duration: 0.4 },
                stageCast: { mode: "inherit" },
                beats: [],
            };
            node = scene;
            break;
        }
        case "choice": {
            const opt1 = newStoryId([], 6);
            const opt2 = newStoryId([opt1], 6);
            const choice: ChoiceNode = {
                id,
                type: "choice",
                title,
                pos: safePos,
                options: [
                    { id: opt1, text: "" },
                    { id: opt2, text: "" },
                ],
            };
            node = choice;
            break;
        }
        case "condition": {
            const firstVar = doc.variables[0];
            const condition: ConditionNode = {
                id,
                type: "condition",
                title,
                pos: safePos,
                rules: firstVar
                    ? [{ id: newStoryId([], 6), expr: defaultConditionForVariable(firstVar) }]
                    : [],
            };
            node = condition;
            break;
        }
        case "end": {
            const end: EndNode = {
                id,
                type: "end",
                title,
                pos: safePos,
            };
            node = end;
            break;
        }
    }

    return {
        doc: {
            ...doc,
            nodes: { ...doc.nodes, [id]: node },
        },
        node: node as Extract<StoryNode, { type: T }>,
    };
}

export const addNode = createNode;

/** Updates one node's canvas coordinates. */
export function moveNode(doc: StoryDocument, nodeId: string, pos: StoryNodePos): StoryDocument {
    const node = doc.nodes[nodeId];
    if (!node || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return doc;
    const nextPos: StoryNodePos = { x: clampCoord(pos.x), y: clampCoord(pos.y) };
    if (node.pos.x === nextPos.x && node.pos.y === nextPos.y) return doc;
    return {
        ...doc,
        nodes: {
            ...doc.nodes,
            [nodeId]: { ...node, pos: nextPos },
        },
    };
}

/** Applies a typed updater function to `doc.nodes[nodeId]`. */
export function updateNode<T extends StoryNode = StoryNode>(
    doc: StoryDocument,
    nodeId: string,
    updater: (node: T) => T,
): StoryDocument {
    const current = doc.nodes[nodeId] as T | undefined;
    if (!current) return doc;
    const next = updater(current);
    if (next === current) return doc;
    return {
        ...doc,
        nodes: {
            ...doc.nodes,
            [nodeId]: next,
        },
    };
}

/** Removes a non-start node and all edges connected to or from it. */
export function removeNode(doc: StoryDocument, nodeId: string): StoryDocument {
    const node = doc.nodes[nodeId];
    if (!node || nodeId === doc.startNodeId || node.type === "start") return doc;
    const nextNodes: Record<string, StoryNode> = {};
    for (const [id, item] of Object.entries(doc.nodes)) {
        if (id !== nodeId) nextNodes[id] = item;
    }
    const nextEdges = doc.edges.filter(edge => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId);
    return { ...doc, nodes: nextNodes, edges: nextEdges };
}

/**
 * Duplicates a non-start node into a new isolated node with fresh node, beat, option, and rule IDs.
 * Never copies edges (duplicate starts isolated).
 */
export function duplicateNode(
    doc: StoryDocument,
    nodeId: string,
    offset: StoryNodePos = { x: 40, y: 40 },
): { doc: StoryDocument; node: StoryNode | null } {
    const original = doc.nodes[nodeId];
    const existingIds = Object.keys(doc.nodes);
    if (!original || original.type === "start" || existingIds.length >= STORY_LIMITS.nodes) {
        return { doc, node: null };
    }
    const copy = structuredClone(original);
    const newId = `${original.type}_${newStoryId(existingIds, 6)}`;
    copy.id = newId;
    copy.pos = {
        x: clampCoord(original.pos.x + offset.x),
        y: clampCoord(original.pos.y + offset.y),
    };

    if (copy.type === "scene") {
        const usedBeats = new Set(allBeatIds(doc));
        for (const beat of copy.beats) {
            const nextBeatId = newStoryId(usedBeats, 8);
            usedBeats.add(nextBeatId);
            beat.id = nextBeatId;
        }
    } else if (copy.type === "choice") {
        const usedOpts = new Set<string>();
        for (const opt of copy.options) {
            const nextOptId = newStoryId(usedOpts, 6);
            usedOpts.add(nextOptId);
            opt.id = nextOptId;
        }
    } else if (copy.type === "condition") {
        const usedRules = new Set<string>();
        for (const rule of copy.rules) {
            const nextRuleId = newStoryId(usedRules, 6);
            usedRules.add(nextRuleId);
            rule.id = nextRuleId;
        }
    }

    return {
        doc: {
            ...doc,
            nodes: { ...doc.nodes, [newId]: copy },
        },
        node: copy,
    };
}

export type ContinueScenePreset = "inherit" | "bgmStop" | "bgmChange" | "bgChange";

export interface ContinueSceneOptions {
    title?: string;
    preset?: ContinueScenePreset;
    splitAtBeatId?: string;
}

function findOpenScenePos(doc: StoryDocument, preferred: StoryNodePos): StoryNodePos {
    const existing = Object.values(doc.nodes);
    const isOccupied = (x: number, y: number) =>
        existing.some(node => Math.abs(node.pos.x - x) < 120 && Math.abs(node.pos.y - y) < 120);
    const baseX = clampCoord(preferred.x);
    const baseY = clampCoord(preferred.y);
    if (!isOccupied(baseX, baseY)) return { x: baseX, y: baseY };
    for (let step = 1; step <= 24; step++) {
        const downY = clampCoord(baseY + step * GRAPH_ROW_GAP);
        if (!isOccupied(baseX, downY)) return { x: baseX, y: downY };
        const upY = clampCoord(baseY - step * GRAPH_ROW_GAP);
        if (!isOccupied(baseX, upY)) return { x: baseX, y: upY };
    }
    return { x: clampCoord(baseX + 48), y: clampCoord(baseY + 48) };
}

/**
 * Syntactic sugar for "Continue Stage & Cut Scene":
 * Creates a follow-up `SceneNode` to the right of `sourceSceneId` inheriting all stage slots
 * (with optional preset override), optionally splits beats starting from `splitAtBeatId` into
 * the new scene, and inserts it into `source`'s outgoing `"out"` wire using normal detachable
 * edges (`source.out -> newScene -> oldTarget`). `createNode()` itself stays 100% isolated.
 */
export function continueAndCutScene(
    doc: StoryDocument,
    sourceSceneId: string,
    options?: ContinueSceneOptions,
): { doc: StoryDocument; node: SceneNode | null } {
    const source = doc.nodes[sourceSceneId];
    if (!source || source.type !== "scene") {
        return { doc, node: null };
    }
    if (Object.keys(doc.nodes).length >= STORY_LIMITS.nodes) {
        return { doc, node: null };
    }

    const prevOutEdge = getOutgoingEdge(doc, sourceSceneId, "out");
    const pos = findOpenScenePos(doc, { x: source.pos.x + GRAPH_COL_GAP, y: source.pos.y });
    const title = (options?.title ?? source.title).slice(0, STORY_LIMITS.nodeTitle);
    const created = createNode(doc, "scene", pos, { title });
    if (!created.node) {
        return { doc, node: null };
    }

    const preset: ContinueScenePreset = options?.preset ?? "inherit";
    let background: BackgroundSlot = { mode: "inherit" };
    let bgm: BgmSlot = { mode: "inherit" };
    if (preset === "bgmStop") {
        bgm = { mode: "stop" };
    } else if (preset === "bgmChange") {
        bgm = { mode: "play", name: DEFAULT_STORY_BGM, volume: 0.75 };
    } else if (preset === "bgChange") {
        background = { mode: "set", asset: DEFAULT_STORY_BACKGROUND };
    }

    let keptSourceBeats = source.beats;
    let movedBeats: SceneBeat[] = [];
    if (options?.splitAtBeatId) {
        const splitIdx = source.beats.findIndex(b => b.id === options.splitAtBeatId);
        if (splitIdx !== -1) {
            keptSourceBeats = source.beats.slice(0, splitIdx);
            movedBeats = source.beats.slice(splitIdx);
        }
    }

    const newScene: SceneNode = {
        ...created.node,
        background,
        bgm,
        place: { mode: "inherit" },
        transition: { kind: "none", duration: 0.4 },
        stageCast: { mode: "inherit" },
        beats: movedBeats,
    };

    let nextDoc: StoryDocument = {
        ...created.doc,
        nodes: {
            ...created.doc.nodes,
            ...(keptSourceBeats !== source.beats
                ? { [sourceSceneId]: { ...source, beats: keptSourceBeats } }
                : {}),
            [newScene.id]: newScene,
        },
    };

    nextDoc = connectEdge(nextDoc, sourceSceneId, "out", newScene.id);
    if (prevOutEdge && prevOutEdge.toNodeId !== newScene.id) {
        nextDoc = connectEdge(nextDoc, newScene.id, "out", prevOutEdge.toNodeId);
    }

    return {
        doc: nextDoc,
        node: nextDoc.nodes[newScene.id] as SceneNode,
    };
}

// ==================== Edge Wiring Mutations ====================

/**
 * Wires `(fromNodeId, fromPortId) -> toNodeId`.
 * Replaces any existing edge originating from the same `(fromNodeId, fromPortId)`.
 * No-op if the connection violates port rules (e.g. targeting `start` or sourcing from `end`).
 */
export function connectEdge(
    doc: StoryDocument,
    fromNodeId: string,
    fromPortId: string,
    toNodeId: string,
): StoryDocument {
    if (!canConnectNodes(doc, fromNodeId, fromPortId, toNodeId).ok) return doc;
    const filtered = doc.edges.filter(
        edge => !(edge.fromNodeId === fromNodeId && edge.fromPortId === fromPortId),
    );
    if (filtered.length >= STORY_LIMITS.edges) return doc;
    const existing = doc.edges.find(
        edge => edge.fromNodeId === fromNodeId && edge.fromPortId === fromPortId && edge.toNodeId === toNodeId,
    );
    if (existing) return doc;
    const edgeId = newStoryId(filtered.map(e => e.id), 8);
    const edge: StoryEdge = { id: edgeId, fromNodeId, fromPortId, toNodeId };
    return { ...doc, edges: [...filtered, edge] };
}

export function disconnectEdge(doc: StoryDocument, edgeId: string): StoryDocument {
    const nextEdges = doc.edges.filter(edge => edge.id !== edgeId);
    return nextEdges.length === doc.edges.length ? doc : { ...doc, edges: nextEdges };
}

export function disconnectPort(doc: StoryDocument, fromNodeId: string, fromPortId: string): StoryDocument {
    const nextEdges = doc.edges.filter(
        edge => !(edge.fromNodeId === fromNodeId && edge.fromPortId === fromPortId),
    );
    return nextEdges.length === doc.edges.length ? doc : { ...doc, edges: nextEdges };
}

/**
 * Atomically moves the source (tail) end of `edgeId` to `(newFromNodeId, newFromPortId)` while
 * keeping its target node intact. Replaces any edge previously attached to the destination port.
 */
export function rewireEdgeSource(
    doc: StoryDocument,
    edgeId: string,
    newFromNodeId: string,
    newFromPortId: string,
): StoryDocument {
    const existing = doc.edges.find(edge => edge.id === edgeId);
    if (!existing) return doc;
    if (existing.fromNodeId === newFromNodeId && existing.fromPortId === newFromPortId) {
        return doc;
    }
    if (!canConnectNodes(doc, newFromNodeId, newFromPortId, existing.toNodeId).ok) {
        return doc;
    }
    const filtered = doc.edges.filter(
        edge => edge.id !== edgeId && !(edge.fromNodeId === newFromNodeId && edge.fromPortId === newFromPortId),
    );
    return {
        ...doc,
        edges: [
            ...filtered,
            {
                id: existing.id,
                fromNodeId: newFromNodeId,
                fromPortId: newFromPortId,
                toNodeId: existing.toNodeId,
            },
        ],
    };
}

// ==================== Scene Stage Slot Mutations ====================

function updateSceneNode(doc: StoryDocument, nodeId: string, updater: (scene: SceneNode) => SceneNode): StoryDocument {
    const node = doc.nodes[nodeId];
    if (!node || node.type !== "scene") return doc;
    const next = updater(node);
    if (next === node) return doc;
    return { ...doc, nodes: { ...doc.nodes, [nodeId]: next } };
}

export function setSceneBackground(doc: StoryDocument, nodeId: string, background: BackgroundSlot): StoryDocument {
    return updateSceneNode(doc, nodeId, scene => ({ ...scene, background }));
}

export function setSceneBgm(doc: StoryDocument, nodeId: string, bgm: BgmSlot): StoryDocument {
    return updateSceneNode(doc, nodeId, scene => ({ ...scene, bgm }));
}

export function setScenePlace(doc: StoryDocument, nodeId: string, place: PlaceSlot): StoryDocument {
    return updateSceneNode(doc, nodeId, scene => ({ ...scene, place }));
}

export function setSceneTransition(doc: StoryDocument, nodeId: string, transition: TransitionSlot): StoryDocument {
    return updateSceneNode(doc, nodeId, scene => ({ ...scene, transition }));
}

export function setSceneStageCast(doc: StoryDocument, nodeId: string, stageCast: StageCastSlot): StoryDocument {
    if (stageCast.mode === "set") {
        // Deduplicate by castKey (last wins) and cap at STORY_LIMITS.stageActors.
        const deduped: SceneActorSlot[] = [];
        const indexByKey = new Map<string, number>();
        for (const actor of stageCast.actors) {
            const idx = indexByKey.get(actor.castKey);
            if (idx !== undefined) {
                deduped[idx] = actor;
            } else if (deduped.length < STORY_LIMITS.stageActors) {
                indexByKey.set(actor.castKey, deduped.length);
                deduped.push(actor);
            }
        }
        return updateSceneNode(doc, nodeId, scene => ({
            ...scene,
            stageCast: { mode: "set", actors: deduped },
        }));
    }
    return updateSceneNode(doc, nodeId, scene => ({ ...scene, stageCast }));
}

/** Adds or replaces an actor in a SceneNode's `stageCast` slot (enforces unique `castKey` and max 5 actors). */
export function addActorToSceneCast(doc: StoryDocument, nodeId: string, actor: SceneActorSlot): StoryDocument {
    return updateSceneNode(doc, nodeId, (scene) => {
        if (scene.stageCast.mode !== "set") {
            return { ...scene, stageCast: { mode: "set", actors: [actor] } };
        }
        const existingIdx = scene.stageCast.actors.findIndex(a => a.castKey === actor.castKey);
        if (existingIdx !== -1) {
            const actors = [...scene.stageCast.actors];
            actors[existingIdx] = actor;
            return { ...scene, stageCast: { mode: "set", actors } };
        }
        if (scene.stageCast.actors.length >= STORY_LIMITS.stageActors) {
            return scene;
        }
        return { ...scene, stageCast: { mode: "set", actors: [...scene.stageCast.actors, actor] } };
    });
}

/** Convenience helper that picks the first unoccupied standing slot and mounts `castKey` in `stageCast`. */
export function addCastKeyToScene(doc: StoryDocument, nodeId: string, castKey: string): StoryDocument {
    const node = doc.nodes[nodeId];
    if (!node || node.type !== "scene") return doc;
    if (node.stageCast.mode === "set") {
        if (node.stageCast.actors.some(a => a.castKey === castKey)) return doc;
        if (node.stageCast.actors.length >= STORY_LIMITS.stageActors) return doc;
    }
    const usedSlots = new Set<StorySlot>(
        node.stageCast.mode === "set" ? node.stageCast.actors.map(a => a.slot) : [],
    );
    const slot = PREFERRED_ACTOR_SLOTS.find(s => !usedSlots.has(s)) ?? STORY_SLOTS[0];
    return addActorToSceneCast(doc, nodeId, { castKey, slot });
}

export function updateActorInSceneCast(
    doc: StoryDocument,
    nodeId: string,
    castKey: string,
    patch: Partial<Omit<SceneActorSlot, "castKey">>,
): StoryDocument {
    return updateSceneNode(doc, nodeId, (scene) => {
        if (scene.stageCast.mode !== "set") return scene;
        let changed = false;
        const actors = scene.stageCast.actors.map((actor) => {
            if (actor.castKey !== castKey) return actor;
            changed = true;
            return { ...actor, ...patch };
        });
        return changed ? { ...scene, stageCast: { mode: "set", actors } } : scene;
    });
}

export function removeActorFromSceneCast(doc: StoryDocument, nodeId: string, castKey: string): StoryDocument {
    return updateSceneNode(doc, nodeId, (scene) => {
        if (scene.stageCast.mode !== "set") return scene;
        const actors = scene.stageCast.actors.filter(a => a.castKey !== castKey);
        if (actors.length === scene.stageCast.actors.length) return scene;
        return { ...scene, stageCast: { mode: "set", actors } };
    });
}

// ==================== Scene Beat Creation & Editing ====================

export function createSceneBeat(
    kind: SceneBeatKind,
    doc: StoryDocument,
    options?: {
        castHint?: string;
        cueType?: CueBeat["cueType"];
        stageAction?: StageActionBeat["action"];
        varId?: string;
    },
): SceneBeat {
    const id = newStoryId(allBeatIds(doc), 8);
    const castKey = options?.castHint && doc.cast.some(m => m.key === options.castHint)
        ? options.castHint
        : doc.cast[0]?.key;

    switch (kind) {
        case "talk":
            return castKey
                ? { id, kind: "talk", speakerKey: castKey, body: "" }
                : { id, kind: "talk", speakerName: "", body: "" };
        case "narration":
            return { id, kind: "narration", body: "" };
        case "telop":
            return { id, kind: "telop", text: "" };
        case "stageAction": {
            const action = options?.stageAction ?? "enter";
            return {
                id,
                kind: "stageAction",
                action,
                castKey: castKey ?? "",
                ...(action === "enter" || action === "move" ? { slot: "center" as StorySlot } : {}),
                ...(action === "move" ? { duration: 0.5 } : {}),
            };
        }
        case "cue": {
            const cueType = options?.cueType ?? "se";
            if (cueType === "se") return { id, kind: "cue", cueType: "se", se: DEFAULT_STORY_SE, seVolume: 1 };
            if (cueType === "flash") return { id, kind: "cue", cueType: "flash", color: "white", duration: 0.4 };
            if (cueType === "shake") return { id, kind: "cue", cueType: "shake", duration: 0.4 };
            return { id, kind: "cue", cueType: "wait", duration: 0.8 };
        }
        case "varOp": {
            const targetVar = (options?.varId
                ? doc.variables.find(v => v.id === options.varId)
                : undefined) ?? doc.variables[0];
            return {
                id,
                kind: "varOp",
                ops: targetVar ? [defaultVarOpForVariable(targetVar)] : [],
            };
        }
    }
}

export function insertBeat(
    doc: StoryDocument,
    nodeId: string,
    beat: SceneBeat,
    index?: number,
): StoryDocument {
    if (totalBeatCount(doc) >= STORY_LIMITS.totalBeats) return doc;
    return updateSceneNode(doc, nodeId, (scene) => {
        if (scene.beats.length >= STORY_LIMITS.beatsPerScene) return scene;
        const beats = [...scene.beats];
        const at = index === undefined ? beats.length : Math.max(0, Math.min(index, beats.length));
        beats.splice(at, 0, beat);
        return { ...scene, beats };
    });
}

export function updateBeat(
    doc: StoryDocument,
    nodeId: string,
    beatId: string,
    updater: (beat: SceneBeat) => SceneBeat,
): StoryDocument {
    return updateSceneNode(doc, nodeId, (scene) => {
        let changed = false;
        const beats = scene.beats.map((beat) => {
            if (beat.id !== beatId) return beat;
            const next = updater(beat);
            if (next !== beat) changed = true;
            return next;
        });
        return changed ? { ...scene, beats } : scene;
    });
}

export function replaceBeat(doc: StoryDocument, nodeId: string, beatId: string, next: SceneBeat): StoryDocument {
    return updateBeat(doc, nodeId, beatId, () => next);
}

export function removeBeat(doc: StoryDocument, nodeId: string, beatId: string): StoryDocument {
    return updateSceneNode(doc, nodeId, (scene) => {
        const beats = scene.beats.filter(beat => beat.id !== beatId);
        return beats.length === scene.beats.length ? scene : { ...scene, beats };
    });
}

export function duplicateBeat(
    doc: StoryDocument,
    nodeId: string,
    beatId: string,
): { doc: StoryDocument; beat: SceneBeat | null } {
    const node = doc.nodes[nodeId];
    if (!node || node.type !== "scene") return { doc, beat: null };
    if (node.beats.length >= STORY_LIMITS.beatsPerScene || totalBeatCount(doc) >= STORY_LIMITS.totalBeats) {
        return { doc, beat: null };
    }
    const idx = node.beats.findIndex(b => b.id === beatId);
    if (idx === -1) return { doc, beat: null };
    const copy = structuredClone(node.beats[idx]);
    copy.id = newStoryId(allBeatIds(doc), 8);
    return { doc: insertBeat(doc, nodeId, copy, idx + 1), beat: copy };
}

/**
 * Moves a beat either within the same SceneNode (`sourceNodeId === targetNodeId`)
 * or across two different SceneNodes (`sourceNodeId !== targetNodeId`).
 */
export function moveBeat(
    doc: StoryDocument,
    sourceNodeId: string,
    beatId: string,
    targetNodeId: string,
    targetIndex?: number,
): StoryDocument {
    const sourceNode = doc.nodes[sourceNodeId];
    const targetNode = doc.nodes[targetNodeId];
    if (!sourceNode || sourceNode.type !== "scene" || !targetNode || targetNode.type !== "scene") {
        return doc;
    }
    const fromIdx = sourceNode.beats.findIndex(b => b.id === beatId);
    if (fromIdx === -1) return doc;
    const beat = sourceNode.beats[fromIdx];

    if (sourceNodeId === targetNodeId) {
        const maxIdx = sourceNode.beats.length - 1;
        const toIdx = targetIndex === undefined ? maxIdx : Math.max(0, Math.min(targetIndex, maxIdx));
        if (toIdx === fromIdx) return doc;
        const beats = [...sourceNode.beats];
        beats.splice(fromIdx, 1);
        beats.splice(toIdx, 0, beat);
        return {
            ...doc,
            nodes: { ...doc.nodes, [sourceNodeId]: { ...sourceNode, beats } },
        };
    }

    if (targetNode.beats.length >= STORY_LIMITS.beatsPerScene) return doc;
    const nextSourceBeats = sourceNode.beats.filter((_, i) => i !== fromIdx);
    const nextTargetBeats = [...targetNode.beats];
    const at = targetIndex === undefined
        ? nextTargetBeats.length
        : Math.max(0, Math.min(targetIndex, nextTargetBeats.length));
    nextTargetBeats.splice(at, 0, beat);
    return {
        ...doc,
        nodes: {
            ...doc.nodes,
            [sourceNodeId]: { ...sourceNode, beats: nextSourceBeats },
            [targetNodeId]: { ...targetNode, beats: nextTargetBeats },
        },
    };
}

// ==================== Choice & Condition Mutations ====================

export function addChoiceOption(doc: StoryDocument, nodeId: string, text = ""): StoryDocument {
    return updateNode<ChoiceNode>(doc, nodeId, (node) => {
        if (node.type !== "choice" || node.options.length >= STORY_LIMITS.choiceOptions.max) return node;
        const id = newStoryId(node.options.map(o => o.id), 6);
        return {
            ...node,
            options: [...node.options, { id, text: text.slice(0, STORY_LIMITS.choiceText) }],
        };
    });
}

export function updateChoiceOption(
    doc: StoryDocument,
    nodeId: string,
    optionId: string,
    patch: Partial<Omit<ChoiceOption, "id">>,
): StoryDocument {
    return updateNode<ChoiceNode>(doc, nodeId, (node) => {
        if (node.type !== "choice") return node;
        let changed = false;
        const options = node.options.map((opt) => {
            if (opt.id !== optionId) return opt;
            changed = true;
            return { ...opt, ...patch };
        });
        return changed ? { ...node, options } : node;
    });
}

export function removeChoiceOption(doc: StoryDocument, nodeId: string, optionId: string): StoryDocument {
    const node = doc.nodes[nodeId];
    if (!node || node.type !== "choice" || node.options.length <= STORY_LIMITS.choiceOptions.min) {
        return doc;
    }
    const options = node.options.filter(o => o.id !== optionId);
    if (options.length === node.options.length) return doc;
    const nextEdges = doc.edges.filter(e => !(e.fromNodeId === nodeId && e.fromPortId === optionId));
    return {
        ...doc,
        nodes: { ...doc.nodes, [nodeId]: { ...node, options } },
        edges: nextEdges,
    };
}

export function addConditionRule(
    doc: StoryDocument,
    nodeId: string,
    expr?: ConditionExpr,
    label?: string,
): StoryDocument {
    const fallbackVar = doc.variables[0];
    const resolvedExpr = expr ?? (fallbackVar ? defaultConditionForVariable(fallbackVar) : undefined);
    if (!resolvedExpr) return doc;
    return updateNode<ConditionNode>(doc, nodeId, (node) => {
        if (node.type !== "condition" || node.rules.length >= STORY_LIMITS.conditionRules) return node;
        const id = newStoryId(node.rules.map(r => r.id), 6);
        const rule: ConditionRule = {
            id,
            ...(label ? { label: label.slice(0, STORY_LIMITS.ruleLabel) } : {}),
            expr: resolvedExpr,
        };
        return { ...node, rules: [...node.rules, rule] };
    });
}

export function updateConditionRule(
    doc: StoryDocument,
    nodeId: string,
    ruleId: string,
    patch: Partial<Omit<ConditionRule, "id">>,
): StoryDocument {
    return updateNode<ConditionNode>(doc, nodeId, (node) => {
        if (node.type !== "condition") return node;
        let changed = false;
        const rules = node.rules.map((rule) => {
            if (rule.id !== ruleId) return rule;
            changed = true;
            return { ...rule, ...patch };
        });
        return changed ? { ...node, rules } : node;
    });
}

export function removeConditionRule(doc: StoryDocument, nodeId: string, ruleId: string): StoryDocument {
    const node = doc.nodes[nodeId];
    if (!node || node.type !== "condition") return doc;
    const rules = node.rules.filter(r => r.id !== ruleId);
    if (rules.length === node.rules.length) return doc;
    const nextEdges = doc.edges.filter(e => !(e.fromNodeId === nodeId && e.fromPortId === ruleId));
    return {
        ...doc,
        nodes: { ...doc.nodes, [nodeId]: { ...node, rules } },
        edges: nextEdges,
    };
}

// ==================== Meta, Cast & Variables Mutations ====================

export function updateStoryMeta(doc: StoryDocument, patch: Partial<StoryMeta>): StoryDocument {
    return {
        ...doc,
        meta: {
            title: (patch.title ?? doc.meta.title).slice(0, STORY_LIMITS.title),
            summary: (patch.summary ?? doc.meta.summary).slice(0, STORY_LIMITS.summary),
            author: (patch.author ?? doc.meta.author).slice(0, STORY_LIMITS.author),
        },
    };
}

export function newCastKey(doc: StoryDocument): string {
    return newStoryId(doc.cast.map(member => member.key), 4);
}

export function addCastMember(
    doc: StoryDocument,
    member: Omit<StoryCastMember, "key"> & { key?: string },
): StoryDocument {
    if (doc.cast.length >= STORY_LIMITS.cast) return doc;
    const taken = new Set(doc.cast.map(m => m.key));
    const key = member.key && STORY_ID_PATTERN.test(member.key) && !taken.has(member.key)
        ? member.key
        : newCastKey(doc);
    return {
        ...doc,
        cast: [
            ...doc.cast,
            {
                key,
                modelId: member.modelId,
                name: member.name.slice(0, STORY_LIMITS.castName),
                ...(member.characterId !== undefined ? { characterId: member.characterId } : {}),
            },
        ],
    };
}

export function updateCastMember(
    doc: StoryDocument,
    key: string,
    patch: Partial<Omit<StoryCastMember, "key">>,
): StoryDocument {
    return {
        ...doc,
        cast: doc.cast.map(member => (member.key === key ? { ...member, ...patch } : member)),
    };
}

/** Removes a cast member; references remain so the compiler highlights them cleanly. */
export function removeCastMember(doc: StoryDocument, key: string): StoryDocument {
    return { ...doc, cast: doc.cast.filter(member => member.key !== key) };
}

/** Counts how many stage slots, talk speakers, reactions, and stage actions reference `key`. */
export function castUsage(doc: StoryDocument, key: string): number {
    let count = 0;
    for (const node of Object.values(doc.nodes)) {
        if (node.type !== "scene") continue;
        if (node.stageCast.mode === "set") {
            for (const actor of node.stageCast.actors) {
                if (actor.castKey === key) count += 1;
            }
        }
        for (const beat of node.beats) {
            if (beat.kind === "talk") {
                if (beat.speakerKey === key) count += 1;
                for (const reaction of beat.reactions ?? []) {
                    if (reaction.castKey === key) count += 1;
                }
            } else if (beat.kind === "stageAction" && beat.castKey === key) {
                count += 1;
            }
        }
    }
    return count;
}

/** Resolves the display name shown for a `TalkBeat`'s speaker. */
export function speakerName(doc: StoryDocument, beat: TalkBeat): string {
    if (beat.speakerName) return beat.speakerName;
    return doc.cast.find(member => member.key === beat.speakerKey)?.name ?? "";
}

export function addVariable(
    doc: StoryDocument,
    variable: (Omit<Extract<StoryVariable, { type: "number" }>, "id"> | Omit<Extract<StoryVariable, { type: "boolean" }>, "id">) & { id?: string },
): { doc: StoryDocument; variable: StoryVariable | null } {
    if (doc.variables.length >= STORY_LIMITS.variables) {
        return { doc, variable: null };
    }
    const taken = new Set(doc.variables.map(v => v.id));
    const id = variable.id && STORY_ID_PATTERN.test(variable.id) && !taken.has(variable.id)
        ? variable.id
        : `var_${newStoryId(taken, 5)}`;
    const name = (variable.name.trim() || id).slice(0, STORY_LIMITS.varName);
    const created: StoryVariable = variable.type === "number"
        ? { id, name, type: "number", initial: clampVarNumber(variable.initial) }
        : { id, name, type: "boolean", initial: Boolean(variable.initial) };
    return {
        doc: { ...doc, variables: [...doc.variables, created] },
        variable: created,
    };
}

export function updateVariable(
    doc: StoryDocument,
    varId: string,
    patch: { name?: string; initial?: number | boolean },
): StoryDocument {
    let changed = false;
    const variables = doc.variables.map((variable): StoryVariable => {
        if (variable.id !== varId) return variable;
        changed = true;
        const name = patch.name !== undefined
            ? patch.name.slice(0, STORY_LIMITS.varName)
            : variable.name;
        if (variable.type === "number") {
            const initial = typeof patch.initial === "number" ? clampVarNumber(patch.initial) : variable.initial;
            return { ...variable, name, initial };
        }
        const initial = typeof patch.initial === "boolean" ? patch.initial : variable.initial;
        return { ...variable, name, initial };
    });
    return changed ? { ...doc, variables } : doc;
}

export function removeVariable(doc: StoryDocument, varId: string): StoryDocument {
    const variables = doc.variables.filter(v => v.id !== varId);
    return variables.length === doc.variables.length ? doc : { ...doc, variables };
}

function countTemplateRefs(text: string | undefined, varId: string, varName: string): number {
    if (!text) return 0;
    let count = 0;
    STORY_TEMPLATE_VAR_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = STORY_TEMPLATE_VAR_PATTERN.exec(text)) !== null) {
        const token = match[1].trim();
        if (token === varId || token === varName) count += 1;
    }
    return count;
}

/** Counts how many varOps, conditions, and `{{var}}` templates reference `varId`. */
export function variableUsage(doc: StoryDocument, varId: string): number {
    const variable = doc.variables.find(v => v.id === varId);
    const varName = variable?.name ?? varId;
    let count = 0;

    for (const node of Object.values(doc.nodes)) {
        if (node.type === "scene") {
            if (node.place.mode === "set") {
                count += countTemplateRefs(node.place.text, varId, varName);
            }
            for (const beat of node.beats) {
                if (beat.kind === "varOp") {
                    for (const op of beat.ops) {
                        if (op.varId === varId) count += 1;
                    }
                } else if (beat.kind === "talk") {
                    count += countTemplateRefs(beat.body, varId, varName);
                    count += countTemplateRefs(beat.speakerName, varId, varName);
                } else if (beat.kind === "narration") {
                    count += countTemplateRefs(beat.body, varId, varName);
                } else if (beat.kind === "telop") {
                    count += countTemplateRefs(beat.text, varId, varName);
                }
            }
        } else if (node.type === "choice") {
            for (const opt of node.options) {
                count += countTemplateRefs(opt.text, varId, varName);
                if (opt.condition?.varId === varId) count += 1;
                for (const eff of opt.effects ?? []) {
                    if (eff.varId === varId) count += 1;
                }
            }
        } else if (node.type === "condition") {
            for (const rule of node.rules) {
                if (rule.expr.varId === varId) count += 1;
            }
        } else if (node.type === "end") {
            count += countTemplateRefs(node.title, varId, varName);
            count += countTemplateRefs(node.subtitle, varId, varName);
        }
    }
    return count;
}

// ==================== Typed Drag-Drop Application ====================

export type StoryDropTarget =
    | { zone: "canvas"; pos: StoryNodePos; title?: string }
    | { zone: Exclude<StoryDropZone, "canvas">; nodeId: string; beatIndex?: number };

/** Applies a typed `StoryDragPayload` onto a compatible `StoryDropTarget`, returning a new document. */
export function applyDragPayloadToTarget(
    doc: StoryDocument,
    payload: StoryDragPayload,
    target: StoryDropTarget,
): { doc: StoryDocument; nodeId?: string; beatId?: string } {
    if (!canDropOnTarget(payload, target.zone)) {
        return { doc };
    }
    if (target.zone === "canvas" && payload.kind === "node") {
        const res = createNode(doc, payload.nodeType, target.pos, { title: target.title });
        return res.node ? { doc: res.doc, nodeId: res.node.id } : { doc };
    }
    if (target.zone === "canvas") return { doc };

    const { nodeId, beatIndex } = target;
    switch (payload.kind) {
        case "slot-bg":
            return { doc: setSceneBackground(doc, nodeId, payload.slot), nodeId };
        case "slot-bgm":
            return { doc: setSceneBgm(doc, nodeId, payload.slot), nodeId };
        case "slot-place":
            return { doc: setScenePlace(doc, nodeId, payload.slot), nodeId };
        case "slot-transition":
            return { doc: setSceneTransition(doc, nodeId, payload.slot), nodeId };
        case "slot-cast-mode":
            return { doc: setSceneStageCast(doc, nodeId, { mode: payload.mode }), nodeId };
        case "asset-cast":
            if (target.zone === "slot-cast") {
                return { doc: addCastKeyToScene(doc, nodeId, payload.castKey), nodeId };
            }
            if (target.zone === "beat-track") {
                const beat = createSceneBeat("talk", doc, { castHint: payload.castKey });
                return { doc: insertBeat(doc, nodeId, beat, beatIndex), nodeId, beatId: beat.id };
            }
            return { doc };
        case "beat": {
            const beat = createSceneBeat(payload.beatKind, doc, {
                cueType: payload.cueType,
                stageAction: payload.stageAction,
            });
            return { doc: insertBeat(doc, nodeId, beat, beatIndex), nodeId, beatId: beat.id };
        }
        case "asset-se": {
            const beat: CueBeat = {
                id: newStoryId(allBeatIds(doc), 8),
                kind: "cue",
                cueType: "se",
                se: payload.name,
                seVolume: 1,
            };
            return { doc: insertBeat(doc, nodeId, beat, beatIndex), nodeId, beatId: beat.id };
        }
        case "asset-voice": {
            const speakerKey = payload.speakerKey && doc.cast.some(c => c.key === payload.speakerKey)
                ? payload.speakerKey
                : doc.cast[0]?.key;
            const beat: TalkBeat = {
                id: newStoryId(allBeatIds(doc), 8),
                kind: "talk",
                ...(speakerKey ? { speakerKey } : { speakerName: "" }),
                body: "",
                voice: payload.voice,
            };
            return { doc: insertBeat(doc, nodeId, beat, beatIndex), nodeId, beatId: beat.id };
        }
        case "var-op": {
            const beat = createSceneBeat("varOp", doc, { varId: payload.varId });
            return { doc: insertBeat(doc, nodeId, beat, beatIndex), nodeId, beatId: beat.id };
        }
        default:
            return { doc };
    }
}

// ==================== Deterministic DAG Auto-Layout ====================

/**
 * Computes a deterministic left-to-right layered DAG layout for all nodes (or only `options.onlyNodeIds`),
 * handling cycles via DFS back-edge detection and placing unreachable nodes on a clean bottom row.
 */
export function autoLayoutGraph(
    doc: StoryDocument,
    options?: { onlyNodeIds?: ReadonlySet<string> },
): StoryDocument {
    const nodeIds = Object.keys(doc.nodes);
    if (nodeIds.length === 0) return doc;

    const orderIndex = new Map<string, number>();
    nodeIds.forEach((id, idx) => orderIndex.set(id, idx));

    const startId = doc.nodes[doc.startNodeId] ? doc.startNodeId : nodeIds[0];

    // Build adjacency preserving port order.
    const outgoing = new Map<string, string[]>();
    for (const id of nodeIds) outgoing.set(id, []);
    for (const edge of doc.edges) {
        if (!doc.nodes[edge.fromNodeId] || !doc.nodes[edge.toNodeId]) continue;
        outgoing.get(edge.fromNodeId)!.push(edge.toNodeId);
    }

    // BFS reachability from startId.
    const reachable = new Set<string>([startId]);
    const bfsQueue = [startId];
    for (let head = 0; head < bfsQueue.length; head++) {
        const u = bfsQueue[head];
        for (const v of outgoing.get(u) ?? []) {
            if (!reachable.has(v)) {
                reachable.add(v);
                bfsQueue.push(v);
            }
        }
    }

    // Iterative DFS to detect back-edges so cyclic graphs layer deterministically.
    const state = new Map<string, 0 | 1 | 2>();
    const backEdges = new Set<string>();
    const dfsStack: Array<{ id: string; nextIdx: number }> = [{ id: startId, nextIdx: 0 }];
    state.set(startId, 1);

    while (dfsStack.length > 0) {
        const frame = dfsStack[dfsStack.length - 1];
        const neighbors = outgoing.get(frame.id) ?? [];
        if (frame.nextIdx < neighbors.length) {
            const v = neighbors[frame.nextIdx++];
            const vState = state.get(v) ?? 0;
            if (vState === 0) {
                state.set(v, 1);
                dfsStack.push({ id: v, nextIdx: 0 });
            } else if (vState === 1) {
                backEdges.add(`${frame.id}\0${v}`);
            }
        } else {
            state.set(frame.id, 2);
            dfsStack.pop();
        }
    }

    // Longest-path columns via Kahn topological sort over forward edges.
    const forwardOut = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const id of reachable) {
        forwardOut.set(id, []);
        inDegree.set(id, 0);
    }
    const seenForward = new Set<string>();
    for (const u of reachable) {
        for (const v of outgoing.get(u) ?? []) {
            if (!reachable.has(v) || u === v) continue;
            const pairKey = `${u}\0${v}`;
            if (backEdges.has(pairKey) || seenForward.has(pairKey)) continue;
            seenForward.add(pairKey);
            forwardOut.get(u)!.push(v);
            inDegree.set(v, (inDegree.get(v) ?? 0) + 1);
        }
    }

    const colOf = new Map<string, number>();
    const topo: string[] = [];
    for (const id of reachable) {
        colOf.set(id, 0);
        if ((inDegree.get(id) ?? 0) === 0) topo.push(id);
    }
    topo.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));

    for (let head = 0; head < topo.length; head++) {
        const u = topo[head];
        const colU = colOf.get(u) ?? 0;
        for (const v of forwardOut.get(u) ?? []) {
            if (colU + 1 > (colOf.get(v) ?? 0)) colOf.set(v, colU + 1);
            const deg = (inDegree.get(v) ?? 1) - 1;
            inDegree.set(v, deg);
            if (deg === 0) topo.push(v);
        }
    }

    const columns = new Map<number, string[]>();
    const unreachableIds: string[] = [];
    for (const id of nodeIds) {
        if (!reachable.has(id)) {
            unreachableIds.push(id);
            continue;
        }
        const col = colOf.get(id) ?? 0;
        let bucket = columns.get(col);
        if (!bucket) {
            bucket = [];
            columns.set(col, bucket);
        }
        bucket.push(id);
    }

    let maxRows = 1;
    for (const bucket of columns.values()) {
        if (bucket.length > maxRows) maxRows = bucket.length;
    }

    const computed = new Map<string, StoryNodePos>();
    const centerY = GRAPH_ORIGIN_Y + ((maxRows - 1) * GRAPH_ROW_GAP) / 2;
    let maxReachableY = GRAPH_ORIGIN_Y;

    const sortedCols = [...columns.keys()].sort((a, b) => a - b);
    for (const col of sortedCols) {
        const bucket = columns.get(col)!;
        bucket.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
        const x = clampCoord(GRAPH_ORIGIN_X + col * GRAPH_COL_GAP);
        bucket.forEach((id, row) => {
            const y = clampCoord(centerY + (row - (bucket.length - 1) / 2) * GRAPH_ROW_GAP);
            computed.set(id, { x, y });
            if (y > maxReachableY) maxReachableY = y;
        });
    }

    const unreachableY = clampCoord(maxReachableY + GRAPH_ROW_GAP);
    unreachableIds.forEach((id, idx) => {
        computed.set(id, {
            x: clampCoord(GRAPH_ORIGIN_X + idx * GRAPH_COL_GAP),
            y: unreachableY,
        });
    });

    const nextNodes: Record<string, StoryNode> = {};
    for (const [id, node] of Object.entries(doc.nodes)) {
        if (options?.onlyNodeIds && !options.onlyNodeIds.has(id)) {
            nextNodes[id] = node;
        } else {
            nextNodes[id] = { ...node, pos: computed.get(id) ?? node.pos };
        }
    }
    return { ...doc, nodes: nextNodes };
}

// ==================== Native Multi-Language Pack Mutations ====================

/** Sets or updates the master document's original authoring locale (`doc.sourceLocale`). */
export function setStorySourceLocale(doc: StoryDocument, sourceLocale: UiLocale): StoryDocument {
    if (doc.sourceLocale === sourceLocale) return doc;
    // If an overlay pack existed for the new source locale, drop it so source stays authoritative.
    let nextLocales = doc.locales;
    if (nextLocales && sourceLocale in nextLocales) {
        const rest = { ...nextLocales };
        delete rest[sourceLocale];
        nextLocales = Object.keys(rest).length > 0 ? rest : undefined;
    }
    const nextDoc: StoryDocument = { ...doc, sourceLocale };
    if (nextLocales) {
        nextDoc.locales = nextLocales;
    } else {
        delete nextDoc.locales;
    }
    return nextDoc;
}

/** Attaches or replaces a decoupled `StoryLocalePack` on `doc.locales[pack.locale]` without mutating `doc`. */
export function upsertStoryLocalePack(doc: StoryDocument, pack: StoryLocalePack): StoryDocument {
    // Source locale lives on the master document itself; never store an overlay for `doc.sourceLocale`.
    if (doc.sourceLocale && pack.locale === doc.sourceLocale) {
        return doc;
    }
    // Never allow any overlay locale pack to spoof `original`.
    const sanitizedOrigin = pack.translationMeta.origin === "original"
        ? "ai_raw"
        : pack.translationMeta.origin;
    const normalizedPack: StoryLocalePack = {
        ...pack,
        storyId: doc.id,
        translationMeta: {
            ...pack.translationMeta,
            origin: sanitizedOrigin,
        },
    };
    return {
        ...doc,
        locales: {
            ...(doc.locales ?? {}),
            [pack.locale]: normalizedPack,
        },
    };
}

/** Removes a locale overlay pack from `doc.locales`. */
export function removeStoryLocalePack(doc: StoryDocument, locale: UiLocale): StoryDocument {
    if (!doc.locales || !(locale in doc.locales)) return doc;
    const nextLocales: Partial<Record<UiLocale, StoryLocalePack>> = { ...doc.locales };
    delete nextLocales[locale];
    if (Object.keys(nextLocales).length === 0) {
        const nextDoc: StoryDocument = { ...doc };
        delete nextDoc.locales;
        return nextDoc;
    }
    return { ...doc, locales: nextLocales };
}

// ==================== Export Helpers ====================

function safeFileBase(title: string): string {
    const printable = [...title].filter(char => char.charCodeAt(0) >= 32).join("");
    const base = printable.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-").slice(0, 60);
    return base || "story";
}

/** Export filename for a JSON story document (`.moesekai-story.json`). */
export function storyFileName(doc: StoryDocument): string {
    return `${safeFileBase(doc.meta.title)}.moesekai-story.json`;
}

/** Export filename for a MoeSekai Script source file (`.msk`). */
export function storyScriptFileName(doc: StoryDocument): string {
    return `${safeFileBase(doc.meta.title)}.msk`;
}

/** Export filename for a decoupled story localization pack (`.<locale>.i18n.json`). */
export function storyLocalePackFileName(doc: StoryDocument, locale: UiLocale): string {
    return `${safeFileBase(doc.meta.title)}.${locale}.i18n.json`;
}

/** Canonical pretty-printed JSON of a v2 document. */
export function serializeStory(doc: StoryDocument): string {
    return `${JSON.stringify(doc, null, 2)}\n`;
}
