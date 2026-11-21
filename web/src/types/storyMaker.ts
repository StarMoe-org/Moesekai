/**
 * The community story maker's document format, `moesekai-story/2`.
 *
 * A v2 story is a typed directed node graph (`start`, `scene`, `choice`, `condition`, `end`)
 * with explicit `StoryEdge` wiring, strict single-slot stage components on every `SceneNode`,
 * ordered `SceneBeat` performance tracks, typed counters/flags (`StoryVariable`), and
 * bidirectional compilation to deterministic IR and MoeSekai Script (`.msk`).
 *
 * Assets are referenced strictly by their game names on the document's server: users never
 * upload files. Everything is validated strictly on import and compilation.
 */

/** The schema version tag every v2 document carries. */
export const STORY_SCHEMA_VERSION = "moesekai-story/2" as const;

/** The game servers a story can be set on (those with a published story library). */
export const STORY_REGIONS = ["jp", "cn", "tw", "kr", "en"] as const;
export type StoryRegion = (typeof STORY_REGIONS)[number];

/** The game's standing positions, left to right. */
export const STORY_SLOTS = ["farLeft", "left", "center", "right", "farRight"] as const;
export type StorySlot = (typeof STORY_SLOTS)[number];

/** Where a story voice lives in the game's assets. */
export const VOICE_KINDS = ["story", "card", "area", "part"] as const;
export type StoryVoiceKind = (typeof VOICE_KINDS)[number];

/** Screen effect colour palette (fades & flashes). */
export const EFFECT_COLORS = ["black", "white"] as const;
export type StoryEffectColor = (typeof EFFECT_COLORS)[number];

/** A line of the game's recorded voices: `sound/<kind>/voice/<scenarioId>/<voiceId>` (or `part_voice`). */
export interface StoryVoiceRef {
    kind: StoryVoiceKind;
    scenarioId: string;
    voiceId: string;
    /** Optional game server override when referencing a voice from another server's story corpus. */
    region?: StoryRegion;
    /** Optional trim start offset in seconds (`0 <= start <= 600`, `start < end`). */
    start?: number;
    /** Optional trim end offset in seconds (`0 < end <= 600`, `end - start >= 0.05` when both set). */
    end?: number;
}

/** A cast member: a Live2D model of the server's story library, referenced by `key`. */
export interface StoryCastMember {
    /** Stable key within the document (`[A-Za-z0-9_-]{1,32}`). */
    key: string;
    /** The model's id in the server's `models.json` (e.g. `v2_01ichika_casual`). */
    modelId: string;
    /** The name shown above the dialogue (free text). */
    name: string;
    /** The MasterCharacter id, when the model belongs to one of the 26 characters. */
    characterId?: number;
}

/** Story descriptive metadata. */
export interface StoryMeta {
    title: string;
    summary: string;
    /** Free text; nothing identifies the author. */
    author: string;
}

// ==================== Stage Runtime Snapshot Types ====================

/** Screen color fader state (`StoryStageView` ColorFader layer). */
export interface StoryScreenEffect {
    color: StoryEffectColor;
    covered: boolean;
}

/** Resolved runtime/preview state of one Live2D actor on stage. */
export interface StoryStageActorState {
    /** Cast member key. */
    cast: string;
    slot: StorySlot;
    /** Stage x coordinate (`SLOT_X[slot]`). */
    x: number;
    /** Vertical offset in world units (`0`: game stand baseline). */
    y: number;
    /** Character scale multiplier (`1`: game stand height). */
    scale: number;
    mirror: boolean;
    /** `null`: model's default motion. */
    motion: string | null;
    /** `null`: model's default facial. */
    facial: string | null;
}

/** Backwards-friendly alias retained for `useStoryStage.ts`. */
export type StoryActorState = StoryStageActorState;

/** Complete stage snapshot rendered by `StoryStageView`, `GameStageOverlay`, and `useStoryStage`. */
export interface StoryStageState {
    background: string | null;
    /** Persistent top-left location banner (`PlaceInfo`), or `null` when hidden. */
    place: string | null;
    /** Actors currently on stage in draw order (later on top). */
    actors: StoryStageActorState[];
    bgm: { name: string | null; volume: number };
    dialogue: { stepId: string; cast: string | null; speaker: string; body: string } | null;
    narration: { stepId: string; body: string } | null;
    telop: { stepId: string; body: string } | null;
    /** Persistent screen fader cover. */
    screen: StoryScreenEffect;
    /** Cast key whose mouth flaps during dialogue, if on stage. */
    speaking: string | null;
}

// ==================== 1. Low-Code Variables & Expressions ====================

export const STORY_VAR_TYPES = ["number", "boolean"] as const;
export type StoryVarType = (typeof STORY_VAR_TYPES)[number];

export interface StoryNumberVariable {
    id: string;
    name: string;
    type: "number";
    initial: number;
}

export interface StoryBooleanVariable {
    id: string;
    name: string;
    type: "boolean";
    initial: boolean;
}

export type StoryVariable = StoryNumberVariable | StoryBooleanVariable;

export type NumberVarOp = {
    varId: string;
    op: "set" | "add" | "sub";
    value: number;
};

export type BooleanVarOp = {
    varId: string;
    op: "set" | "toggle";
    value?: boolean;
};

export type VarOp = NumberVarOp | BooleanVarOp;

export const CONDITION_OPS = ["==", "!=", ">", ">=", "<", "<="] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export interface ConditionExpr {
    varId: string;
    op: ConditionOp;
    value: number | boolean;
}

/** Runtime map of `variable.id -> current value`. */
export type StoryVarValues = Record<string, number | boolean>;

// ==================== 2. Componentized Stage Slots (SceneNode) ====================

export type BackgroundSlot =
    | { mode: "inherit" }
    | { mode: "clear" }
    | { mode: "set"; asset: string };

export type BgmSlot =
    | { mode: "inherit" }
    | { mode: "stop" }
    | { mode: "play"; name: string; volume: number };

export type PlaceSlot =
    | { mode: "inherit" }
    | { mode: "hide" }
    | { mode: "set"; text: string };

export const TRANSITION_KINDS = ["none", "fadeBlack", "fadeWhite"] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export interface TransitionSlot {
    kind: TransitionKind;
    duration: number;
}

export interface SceneActorSlot {
    castKey: string;
    slot: StorySlot;
    scale?: number;
    y?: number;
    motion?: string;
    facial?: string;
}

export type StageCastSlot =
    | { mode: "inherit" }
    | { mode: "clear" }
    | { mode: "set"; actors: SceneActorSlot[] };

// ==================== 3. Scene Performance Beats ====================

export const SCENE_BEAT_KINDS = ["talk", "narration", "telop", "stageAction", "cue", "varOp"] as const;
export type SceneBeatKind = (typeof SCENE_BEAT_KINDS)[number];

export const STAGE_ACTION_KINDS = ["enter", "move", "pose", "exit"] as const;
export type StageActionKind = (typeof STAGE_ACTION_KINDS)[number];

export const CUE_TYPES = ["se", "flash", "shake", "wait"] as const;
export type CueType = (typeof CUE_TYPES)[number];

/** Synchronous Live2D pose/expression reaction of another on-stage character during a TalkBeat. */
export interface ActorReaction {
    castKey: string;
    motion?: string;
    facial?: string;
}

export interface TalkBeat {
    id: string;
    kind: "talk";
    speakerKey?: string;
    speakerName?: string;
    body: string;
    motion?: string;
    facial?: string;
    reactions?: ActorReaction[];
    voice?: StoryVoiceRef;
    se?: string;
    seVolume?: number;
}

export interface NarrationBeat {
    id: string;
    kind: "narration";
    body: string;
    se?: string;
    seVolume?: number;
}

export interface TelopBeat {
    id: string;
    kind: "telop";
    text: string;
}

export interface StageActionBeat {
    id: string;
    kind: "stageAction";
    action: StageActionKind;
    castKey: string;
    slot?: StorySlot;
    scale?: number;
    y?: number;
    motion?: string;
    facial?: string;
    duration?: number;
}

export interface CueBeat {
    id: string;
    kind: "cue";
    cueType: CueType;
    se?: string;
    seVolume?: number;
    color?: StoryEffectColor;
    duration?: number;
}

export interface VarOpBeat {
    id: string;
    kind: "varOp";
    ops: VarOp[];
}

export type SceneBeat =
    | TalkBeat
    | NarrationBeat
    | TelopBeat
    | StageActionBeat
    | CueBeat
    | VarOpBeat;

export type SceneBeatOf<K extends SceneBeatKind> = Extract<SceneBeat, { kind: K }>;

// ==================== 4. Standard Flow Graph Nodes & Explicit Edges ====================

export const STORY_NODE_TYPES = ["start", "scene", "choice", "condition", "end"] as const;
export type StoryNodeType = (typeof STORY_NODE_TYPES)[number];

export interface StoryNodePos {
    x: number;
    y: number;
}

export interface StartNode {
    id: string;
    type: "start";
    pos: StoryNodePos;
}

export interface SceneNode {
    id: string;
    type: "scene";
    title: string;
    pos: StoryNodePos;
    background: BackgroundSlot;
    bgm: BgmSlot;
    place: PlaceSlot;
    transition: TransitionSlot;
    stageCast: StageCastSlot;
    beats: SceneBeat[];
}

export interface ChoiceOption {
    id: string;
    text: string;
    condition?: ConditionExpr;
    effects?: VarOp[];
}

export interface ChoiceNode {
    id: string;
    type: "choice";
    title: string;
    pos: StoryNodePos;
    options: ChoiceOption[];
}

export interface ConditionRule {
    id: string;
    label?: string;
    expr: ConditionExpr;
}

export interface ConditionNode {
    id: string;
    type: "condition";
    title: string;
    pos: StoryNodePos;
    rules: ConditionRule[];
}

export interface EndNode {
    id: string;
    type: "end";
    title: string;
    subtitle?: string;
    pos: StoryNodePos;
}

export type StoryNode = StartNode | SceneNode | ChoiceNode | ConditionNode | EndNode;
export type StoryNodeOf<T extends StoryNodeType> = Extract<StoryNode, { type: T }>;

/** Explicit directed wire connecting `(fromNodeId, fromPortId) -> toNodeId`. */
export interface StoryEdge {
    id: string;
    fromNodeId: string;
    fromPortId: string;
    toNodeId: string;
}

/** Root `moesekai-story/2` graph document. */
export interface StoryDocument {
    schema: typeof STORY_SCHEMA_VERSION;
    id: string;
    region: StoryRegion;
    meta: StoryMeta;
    cast: StoryCastMember[];
    variables: StoryVariable[];
    startNodeId: string;
    nodes: Record<string, StoryNode>;
    edges: StoryEdge[];
}

/** A draft persisted locally in browser IndexedDB (`moesekai-story-maker-v2`). */
export interface StoryDraft {
    id: string;
    doc: StoryDocument;
    createdAt: number;
    updatedAt: number;
}

// ==================== 5. Validation & Compiler Diagnostics ====================

/** Validation & compiler diagnostic codes; the UI displays `page.storyMaker.issue.<code>`. */
export const STORY_ISSUE_CODES = [
    "invalidJson", "notObject", "formatUnsupported", "regionInvalid", "fieldType", "fieldMissing",
    "tooLong", "tooMany", "tooFew", "idInvalid", "idDuplicate", "opUnknown", "castUnknown",
    "labelUnresolved", "assetNameInvalid", "modelIdInvalid", "numberRange", "enumInvalid", "speakerMissing",
    "voiceTrimInvalid", "flowLayoutInvalid",
    // v2 graph compiler diagnostic codes
    "startMissing", "startDisconnected", "nodeUnreachable", "portUnwired",
    "edgeInvalidSource", "edgeInvalidTarget", "edgeDuplicatePort",
    "actorDuplicate", "actorLimitExceeded",
    "variableNotFound", "variableTypeMismatch", "templateVarMissing", "conditionInvalid",
    "endingMissing", "sceneEmptyBeats", "choiceOptionEmpty", "cycleDetected",
] as const;

export type StoryIssueCode = (typeof STORY_ISSUE_CODES)[number];
export type StoryValidationCode = StoryIssueCode;

export interface StoryIssue {
    code: StoryIssueCode;
    /** JSON or graph path (e.g. `nodes.scene_open.beats[0].body`). */
    path: string;
    params?: Record<string, string | number>;
}

export type StoryCompileDiagnosticSeverity = "error" | "warning";

export interface StoryCompileDiagnostic {
    severity: StoryCompileDiagnosticSeverity;
    code: StoryIssueCode;
    path: string;
    nodeId?: string;
    beatId?: string;
    params?: Record<string, string | number>;
}
