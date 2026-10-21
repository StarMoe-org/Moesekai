/**
 * The 3D costume output of SekaiExtraRipper (`costume3d-*` formats, ADR-0020), as the
 * `/costume-3d` page reads it from `<base>/<region>/`. Only the fields the page uses are typed.
 */

/** `costume3d-version`: `index/version.json`, the lock without its bundle list. */
export interface Costume3dVersion {
    format: "costume3d-version";
    version: number;
    toolVersion: string;
    formats: Record<string, number>;
    region: string;
    appVersion: string;
    assetVersion: string;
    roles: number;
    costumes: number;
}

/** `costume3d-roles`: `index/roles.json`. */
export interface Costume3dRoleList {
    format: "costume3d-roles";
    version: number;
    roles: Array<{ characterId: number; unit: string; catalog: string }>;
}

export interface Costume3dRole {
    characterId: number;
    unit: string;
    characterUnitId: number;
    height: number;
    figure: string;
    breastSize: string;
    skin: { default: string; shadow1: string; shadow2: string };
    defaultBody: number;
    defaultHead: number;
    defaultHair: number;
    motion: string | null;
}

export type Costume3dSlot = "body" | "hair" | "head";
export type Costume3dHeadType = "head_only" | "head_and_hair";

/** One part a role can wear (one costume3d id). */
export interface Costume3dPart {
    costume3dId: number;
    slot: Costume3dSlot;
    costumeNumber: number;
    groupId: number;
    colorId: number;
    colorName: string;
    name: string;
    headType: Costume3dHeadType | null;
    thumbnail: string;
    publishedAt: number | null;
    model: { bundle: string; color: string | null; attach: string | null } | null;
}

/** `costume3d-catalog`: `index/roles/<characterId>-<unit>.json`. */
export interface Costume3dCatalog {
    format: "costume3d-catalog";
    version: number;
    role: Costume3dRole;
    parts: Costume3dPart[];
    /** Head and hair costume3d ids that cannot be worn together. */
    notAvailable: Array<[number, number]>;
    /** Head costume3d id → the hair it brings. */
    defaultHairs: Record<string, number>;
}

/** What one role wears in one colour of a costume. */
export interface Costume3dVariant {
    characterId: number;
    unit: string;
    colorId: number;
    body: number;
    hair: number;
    head: number;
    alternativeHeads?: number[];
    bodyBundle: string;
    bodyColor: string | null;
    faceBundle: string;
    accessoryBundle?: string | null;
    accessoryColor?: string | null;
    attach?: string | null;
    motion: string | null;
    missing?: string[];
}

/** `costume3d-costume`: `index/costumes/<costumeNumber>.json`. */
export interface Costume3dCostume {
    format: "costume3d-costume";
    version: number;
    costumeNumber: number;
    name: string;
    variants: Costume3dVariant[];
}

/** `costume3d-part`: `library/<bundle>/_part.json`. */
export interface Costume3dPartRecord {
    format: "costume3d-part";
    version: number;
    bundle: string;
    kind: "body" | "face" | "accessory" | "textures" | "motion" | "settings";
    model: string | null;
    /** `file` is relative to `library/`. */
    textures: Array<{ name: string; file: string }>;
    motions: Array<{ name: string; file: string; stopTime: number; loopTime: boolean }>;
}

/** A curve of `costume3d-motion` (the `sse-motion` CurveData). */
export type Costume3dCurve =
    | { kind: "constant"; value: number }
    | { kind: "dense"; begin_time: number; sample_rate: number; samples: number[] }
    | { kind: "streamed"; segments: Array<{ t: number; coeff: [number, number, number, number] }> };

/** `costume3d-motion`: one AnimationClip, curves bound by transform path and property. */
export interface Costume3dMotion {
    format: "costume3d-motion";
    version: number;
    name: string;
    stopTime: number;
    loopTime: boolean;
    curves: Array<Costume3dCurve & { path: string; property: string }>;
}
