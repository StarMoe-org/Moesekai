/**
 * The community story maker's document format, `moesekai-story/1`.
 *
 * A story is a linear list of steps with game-scenario semantics (backgrounds, characters
 * appearing / moving / leaving, dialogue, narration, place captions, screen effects, BGM and SE),
 * plus labels, jumps and choices for branching. Assets are only ever referenced by their game
 * names (a background `bg_a000001`, a BGM `bgm00001`, a story voice) on the document's server:
 * users never upload files. The format is validated strictly on import (lib/storyMaker/validate.ts).
 */

/** The format tag every document carries. */
export const STORY_FORMAT = "moesekai-story/1" as const;

/** The game servers a story can be set on (those with a published story library). */
export const STORY_REGIONS = ["jp", "cn", "tw", "kr", "en"] as const;
export type StoryRegion = (typeof STORY_REGIONS)[number];

/** The game's standing positions, left to right. */
export const STORY_SLOTS = ["farLeft", "left", "center", "right", "farRight"] as const;
export type StorySlot = (typeof STORY_SLOTS)[number];

/** A cast member: a model of the server's story library, under a key the steps refer to. */
export interface StoryCastMember {
    /** Stable key within the document (`a`…, `[A-Za-z0-9_-]`). */
    key: string;
    /** The model's id in the server's `models.json` (its bundle name, e.g. `v2_01ichika_casual`). */
    modelId: string;
    /** The name shown above the dialogue (free text). */
    name: string;
    /** The MasterCharacter id, when the model is one of the 26 characters. */
    characterId?: number;
}

export const BACKGROUND_TRANSITIONS = ["cut", "fade", "black", "white"] as const;
export type BackgroundTransition = (typeof BACKGROUND_TRANSITIONS)[number];

export const STORY_EFFECTS = ["fadeIn", "fadeOut", "flash", "shake", "wait"] as const;
export type StoryEffectKind = (typeof STORY_EFFECTS)[number];

export const EFFECT_COLORS = ["black", "white"] as const;
export type StoryEffectColor = (typeof EFFECT_COLORS)[number];

export const BGM_ACTIONS = ["play", "stop", "volume"] as const;
export type StoryBgmAction = (typeof BGM_ACTIONS)[number];

/** Where a story voice lives in the game's assets. */
export const VOICE_KINDS = ["story", "card", "area"] as const;
export type StoryVoiceKind = (typeof VOICE_KINDS)[number];

/** A line of the game's recorded voices: `sound/<kind>/voice/<scenarioId>/<voiceId>`. */
export interface StoryVoiceRef {
    kind: StoryVoiceKind;
    scenarioId: string;
    voiceId: string;
}

export interface BackgroundStep {
    op: "background";
    /** The background's asset name, or null for none (an empty stage). */
    name: string | null;
    transition: BackgroundTransition;
}

/** Persistent top-left location banner (`PlaceInfo`). Empty string clears it. */
export interface PlaceStep {
    op: "place";
    text: string;
}

export interface AppearStep {
    op: "appear";
    cast: string;
    slot: StorySlot;
    motion?: string;
    facial?: string;
    /** Fades in rather than popping in. */
    fade: boolean;
    mirror?: boolean;
}

export interface MoveStep {
    op: "move";
    cast: string;
    slot: StorySlot;
    /** Seconds. */
    duration: number;
}

export interface HideStep {
    op: "hide";
    cast: string;
    fade: boolean;
}

/** A change of motion and/or facial without a line. */
export interface PoseStep {
    op: "pose";
    cast: string;
    motion?: string;
    facial?: string;
}

export interface TalkStep {
    op: "talk";
    /** The cast member speaking; the name shown is theirs unless `name` overrides it. */
    cast?: string;
    /** A speaker name of its own (a voice off stage, "???"), or an override of the cast member's. */
    name?: string;
    body: string;
    motion?: string;
    facial?: string;
    voice?: StoryVoiceRef;
    /** The mouth flaps while the line types (default on). */
    lipSync: boolean;
}

/** Full-screen text over a dimmed stage. */
export interface NarrationStep {
    op: "narration";
    body: string;
}

/** Centered scene caption / time jump (`ScenarioTelop`, waits for tap). */
export interface TelopStep {
    op: "telop";
    body: string;
}

export interface EffectStep {
    op: "effect";
    effect: StoryEffectKind;
    /** fadeIn / fadeOut / flash colour. */
    color?: StoryEffectColor;
    /** Seconds. */
    duration: number;
}

export interface BgmStep {
    op: "bgm";
    action: StoryBgmAction;
    /** The BGM's asset name (`play`). */
    name?: string;
    /** 0..1 (`play`, `volume`). */
    volume?: number;
}

export interface SeStep {
    op: "se";
    name: string;
}

export interface StoryChoiceOption {
    /** Stable id within the step. */
    id: string;
    text: string;
    /** The id of the label step the option jumps to. */
    target: string;
}

export interface ChoiceStep {
    op: "choice";
    options: StoryChoiceOption[];
}

export interface LabelStep {
    op: "label";
    /** A name shown in the editor (jumps refer to the step's id). */
    name: string;
}

export interface JumpStep {
    op: "jump";
    /** The id of a label step. */
    target: string;
}

export type StoryOp =
    | BackgroundStep | PlaceStep | AppearStep | MoveStep | HideStep | PoseStep | TalkStep | NarrationStep | TelopStep
    | EffectStep | BgmStep | SeStep | ChoiceStep | LabelStep | JumpStep;

export type StoryOpName = StoryOp["op"];

export const STORY_OPS = [
    "background", "place", "appear", "move", "hide", "pose", "talk", "narration", "telop",
    "effect", "bgm", "se", "choice", "label", "jump",
] as const satisfies readonly StoryOpName[];

/** A step: an op with an id that is stable across edits. */
export type StoryStep = StoryOp & { id: string };

export type StoryStepOf<T extends StoryOpName> = Extract<StoryStep, { op: T }>;

/** A `place` step with its stable id (`{ id: string; op: "place"; text: string }`). */
export type StoryPlaceStep = StoryStepOf<"place">;

export interface StoryDocument {
    format: typeof STORY_FORMAT;
    region: StoryRegion;
    title: string;
    summary: string;
    /** Free text; nothing identifies the author. */
    author: string;
    cast: StoryCastMember[];
    steps: StoryStep[];
}

/** A draft kept in the browser (IndexedDB). */
export interface StoryDraft {
    id: string;
    doc: StoryDocument;
    createdAt: number;
    updatedAt: number;
}

/** Validation issue codes; the UI shows `page.storyMaker.issue.<code>`. */
export const STORY_ISSUE_CODES = [
    "invalidJson", "notObject", "formatUnsupported", "regionInvalid", "fieldType", "fieldMissing",
    "tooLong", "tooMany", "tooFew", "idInvalid", "idDuplicate", "opUnknown", "castUnknown",
    "labelUnresolved", "assetNameInvalid", "modelIdInvalid", "numberRange", "enumInvalid", "speakerMissing",
] as const;
export type StoryIssueCode = (typeof STORY_ISSUE_CODES)[number];

export interface StoryIssue {
    code: StoryIssueCode;
    /** Where, as a JSON path (`steps[3].body`). */
    path: string;
    params?: Record<string, string | number>;
}
