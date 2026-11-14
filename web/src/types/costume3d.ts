/**
 * What `/costume-3d` reads from a published exporter output: its index documents (pointer, root,
 * shards and listings), the costume forms (`costume-role`, `costume`, `costume-model`,
 * `costume-motion`), and the model and clip documents they carry.
 */
import type { Costume3dPublication } from "@/lib/costume3d/publication";

/** `current.json` of a region and view: where its index root is. */
export interface Costume3dPointer {
    format: "pointer";
    version: number;
    published_version: string;
    revision: string;
    root: string;
}

/** The index root: the shards by directory and the listings by asset form. */
export interface Costume3dIndexRoot {
    format: "index-root";
    version: number;
    published_version: string;
    revision: string;
    shards: Array<{ directory: string; sha256: string }>;
    listings: Array<{ form: string; sha256: string }>;
    failures: Array<{ name: string; code: string }>;
}

/** An object in the store, by hash and extension. */
export interface Costume3dObject {
    sha256: string;
    extension: string;
}

/** The files of one directory. */
export interface Costume3dIndexShard {
    format: "index-shard";
    version: number;
    directory: string;
    entries: Array<{ name: string; sha256: string; extension: string; size: number; media_type: string; asset: string; role: string }>;
}

/** Every asset of one form. */
export interface Costume3dListing {
    format: "listing";
    version: number;
    form: string;
    entries: Array<{ name: string; fingerprint: string; size: number }>;
}

/** What an asset is: its form, its sources and its files with their roles. */
export interface Costume3dAssetDocument {
    format: "asset";
    version: number;
    name: string;
    form: string;
    form_version: number;
    fingerprint: string;
    sources: Array<{ bundle: string; path_id: string; class: string }>;
    members: Array<{ role: string; sha256: string; size: number; extension: string; media_type: string }>;
    references: string[];
    error?: { code: string; message: string };
}

export type Costume3dSlot = "body" | "hair" | "head";
export type Costume3dHeadType = "head_only" | "head_and_hair" | "head_all" | "head_front" | "head_back";

/** What shows a part. */
export interface Costume3dPartModel {
    /** The name of a `costume-model` asset. */
    asset: string;
    /** The colour-variation textures: `texture` assets whose names end in `_C`, `_S` and `_H`. */
    colors?: { color?: string; shadow?: string; value?: string };
    /** For an accessory: the child of the face's `Head` node it hangs from. */
    attach?: string;
}

/** One part a role can wear (one costume3d id). */
export interface Costume3dPart {
    costume3dId: number;
    slot: Costume3dSlot;
    costumeNumber?: number;
    colorId: number;
    colorName?: string;
    name?: string;
    headType?: Costume3dHeadType;
    publishedAt?: number;
    thumbnail?: string;
    model?: Costume3dPartModel;
    /** What could not be resolved; a viewer shows no look that has any. */
    missing?: string[];
}

export interface Costume3dRole {
    characterId: number;
    unit: string;
    figure: string;
    breastSize: string;
    skin: { default: string; shadow1: string; shadow2: string };
    defaultBody: number;
    defaultHead: number;
    defaultHair: number;
    /** Clip name → the name of its `costume-motion` asset. */
    motions?: Record<string, string>;
}

/** `costume-role`: one character in a unit. */
export interface Costume3dCatalog {
    format: "costume-role";
    version: number;
    role: Costume3dRole;
    parts: Costume3dPart[];
    /** Head and hair costume3d ids that cannot be worn together. */
    notAvailable: Array<[number, number]>;
    /** Head costume3d id → the hair it brings. */
    defaultHairs: Record<string, number>;
}

/** The parts that show one look. */
export interface Costume3dModels {
    body?: Costume3dPartModel;
    /** The `costume-model` asset of the face worn. */
    face?: string;
    /** The accessory, absent under a head with its own hair. */
    accessory?: Costume3dPartModel;
}

/** One role in one costume in one colour. */
export interface Costume3dVariant {
    /** The role's `costume-role` asset. */
    role: string;
    characterId: number;
    unit: string;
    colorId: number;
    body: number;
    head: number;
    hair: number;
    alternativeHeads: number[];
    models: Costume3dModels;
    /** What could not be resolved; a viewer shows no look that has any. */
    missing?: string[];
}

/** `costume`: one costume, with the look of each role and colour that wear it. */
export interface Costume3dCostume {
    format: "costume";
    version: number;
    costumeNumber: number;
    name?: string;
    variants: Costume3dVariant[];
}

/** The value of a clip curve. */
export type Costume3dCurve =
    | { kind: "streamed"; segments: Array<[number, number, number, number, number]> }
    | { kind: "dense"; begin_time: number; sample_rate: number; samples: number[] }
    | { kind: "constant"; value: number };

/** A curve and the binding it belongs to. */
export type Costume3dClipCurve = Costume3dCurve & {
    /** The CRC-32 of the target's path. */
    path: number;
    /** A `Transform` property (1 position, 2 quaternion, 3 scale, 4 euler) or a CRC-32. */
    attribute: number;
    class_id: number;
    script: string | null;
    custom_type: number;
    component: number;
};

/** `clip`: one AnimationClip as the engine stores it. */
export interface Costume3dClip {
    format: "clip";
    version: number;
    name: string;
    sample_rate: number;
    start_time: number;
    stop_time: number;
    loop: boolean;
    curves: Costume3dClipCurve[];
    events: Array<{ time: number; function: string; data: string; float: number; int: number }>;
}

/** A reference of a component document. */
export type Costume3dRef = { $ref: { node?: string; component?: number; class?: string } } | null;

/** One component of a prefab. */
export interface Costume3dComponent {
    class: string;
    /** For a `MonoBehaviour`, its script as `<assembly>/<namespace>.<class>`. */
    script: string | null;
    node: string;
    enabled: boolean;
    fields: Record<string, unknown>;
}

/** `components`: a prefab's springs, colliders and constraints. */
export interface Costume3dComponents {
    format: "components";
    version: number;
    components: Costume3dComponent[];
}

/** What the stage shows: the files of one look and what colours them. */
export interface StageLoad {
    publication: Costume3dPublication;
    /** The body, with its colour-variation textures. */
    body: Costume3dPartModel;
    /** The face with its hair, or a head with its own hair. */
    face: string | null;
    /** An accessory, with its colour-variation textures and the node it hangs from. */
    accessory: { model: Costume3dPartModel; attach: string | null } | null;
    /** Another character's face whose hair is worn on this one. */
    hair: string | null;
    /** Clip name (`motion`, `face`, `motion_loop`, `face_loop`) → the name of its `costume-motion` asset. */
    motions: Record<string, string>;
    skin: { default: string; shadow1: string };
}
