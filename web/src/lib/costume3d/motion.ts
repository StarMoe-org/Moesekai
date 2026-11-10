/**
 * The costume screen's motions (`costume-motion`, a clip document): `motion` + `face` play once,
 * then `motion_loop` + `face_loop` repeat, as in the game.
 *
 * Curves are Unity's, kept as stored (constant, dense at a rate, or streamed cubic segments), and
 * bound as the clip document binds them: a `Transform` curve by the CRC-32 of its node's path below
 * the body root, a blend shape curve by the CRC-32 of its channel's name on the face's meshes.
 * Values are Unity's: a position (x, y, z) is the glTF (−x, y, z), a quaternion (x, y, z, w) is the
 * glTF (x, −y, −z, w), Euler angles are in degrees and applied Z, X, then Y (three's `YXZ`), and a
 * blend shape weight is divided by its channel's full weight.
 */
import * as THREE from "three";
import type { Costume3dClip, Costume3dClipCurve } from "@/types/costume3d";

type Evaluate = (t: number) => number;

/** CRC-32 (the engine's hashing of paths and channel names), unsigned. */
export function crc32(text: string): number {
    let crc = 0xffffffff;
    for (let i = 0; i < text.length; i++) {
        crc ^= text.charCodeAt(i);
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function curveEvaluator(curve: Costume3dClipCurve): Evaluate {
    if (curve.kind === "constant") {
        const value = curve.value;
        return () => value;
    }
    if (curve.kind === "dense") {
        const { samples, begin_time: begin, sample_rate: rate } = curve;
        const last = samples.length - 1;
        return t => {
            const x = Math.max(0, (t - begin) * rate);
            const i = Math.min(Math.floor(x), last);
            const j = Math.min(i + 1, last);
            return samples[i] + (samples[j] - samples[i]) * Math.min(Math.max(x - i, 0), 1);
        };
    }
    // Streamed: per segment a cubic in the time since the segment's start. The first segment
    // starts at -3.4e38 (Unity's "before the clip"), where the value is its constant term.
    const n = curve.segments.length;
    const starts = new Float64Array(n);
    const coeff = new Float64Array(n * 4);
    curve.segments.forEach(([t0, a, b, c, d], i) => {
        starts[i] = t0;
        coeff.set([a, b, c, d], i * 4);
    });
    return t => {
        let lo = 0;
        let hi = n - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= t) lo = mid;
            else hi = mid - 1;
        }
        const dt = lo === 0 && starts[0] < -1e30 ? 0 : t - starts[lo];
        const k = lo * 4;
        return ((coeff[k] * dt + coeff[k + 1]) * dt + coeff[k + 2]) * dt + coeff[k + 3];
    };
}

/** The `Transform` properties a clip drives (clip-documents.md). */
export const TRANSFORM_PROPERTIES = { position: 1, rotation: 2, scale: 3, euler: 4 } as const;

type TransformProperty = (typeof TRANSFORM_PROPERTIES)[keyof typeof TRANSFORM_PROPERTIES];

/** A clip's curves, bound by what they drive. */
export interface Clip {
    name: string;
    start: number;
    stop: number;
    /** `Transform` curves: the CRC-32 of the node's path, the property, and the curves by component. */
    transforms: Array<{ path: number; attribute: TransformProperty; evaluate: Evaluate[] }>;
    /** Blend shape curves: the CRC-32 of the channel's name and the curve. */
    shapes: Array<{ attribute: number; evaluate: Evaluate }>;
    /** Curves of a binding this viewer does not apply. */
    unbound: number;
}

/** Whether `attribute` is one of the `Transform` properties above. */
const isTransformProperty = (attribute: number): attribute is TransformProperty =>
    attribute >= TRANSFORM_PROPERTIES.position && attribute <= TRANSFORM_PROPERTIES.euler;

/** The class of a `Transform`. */
const TRANSFORM_CLASS = 4;
/** The class of a `SkinnedMeshRenderer`, whose blend shape curves have `custom_type`: the channel's name hash. */
const SKINNED_MESH_RENDERER = 137;
const SHAPE_CHANNEL = 20;

export function clipOf(document: Costume3dClip): Clip {
    const transforms = new Map<string, Clip["transforms"][number]>();
    const shapes: Clip["shapes"] = [];
    let unbound = 0;
    for (const curve of document.curves) {
        const evaluate = curveEvaluator(curve);
        if (curve.class_id === SKINNED_MESH_RENDERER && curve.custom_type === SHAPE_CHANNEL) {
            shapes.push({ attribute: curve.attribute, evaluate });
        } else if (curve.class_id === TRANSFORM_CLASS && isTransformProperty(curve.attribute)) {
            const key = `${curve.path}:${curve.attribute}`;
            let transform = transforms.get(key);
            if (!transform) {
                transform = { path: curve.path, attribute: curve.attribute, evaluate: [] };
                transforms.set(key, transform);
            }
            transform.evaluate[curve.component] = evaluate;
        } else {
            unbound++;
        }
    }
    return { name: document.name, start: document.start_time, stop: document.stop_time, transforms: [...transforms.values()], shapes, unbound };
}

/** A node's rest transform in Unity's coordinates, which is what the curves leave untouched channels at. */
interface Rest {
    position: [number, number, number];
    quaternion: [number, number, number, number];
    euler: [number, number, number];
    scale: [number, number, number];
}

function unityRest(node: THREE.Object3D): Rest {
    const q = new THREE.Quaternion(node.quaternion.x, -node.quaternion.y, -node.quaternion.z, node.quaternion.w);
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    return {
        position: [-node.position.x, node.position.y, node.position.z],
        quaternion: [q.x, q.y, q.z, q.w],
        euler: [e.x, e.y, e.z].map(THREE.MathUtils.radToDeg) as [number, number, number],
        scale: node.scale.toArray() as [number, number, number],
    };
}

/** The nodes below the body root by CRC-32 of their path, with their rest transforms. */
interface Rig {
    nodes: Map<number, THREE.Object3D>;
    rest: Map<THREE.Object3D, Rest>;
}

export function rigOf(bodyRoot: THREE.Object3D): Rig {
    const nodes = new Map<number, THREE.Object3D>();
    const rest = new Map<THREE.Object3D, Rest>();
    const walk = (node: THREE.Object3D, path: string) => {
        for (const child of node.children) {
            if ((child as THREE.Mesh).isMesh) continue;
            const childPath = path ? `${path}/${child.name}` : child.name;
            const hash = crc32(childPath);
            if (!nodes.has(hash)) nodes.set(hash, child);
            rest.set(child, unityRest(child));
            walk(child, childPath);
        }
    };
    walk(bodyRoot, "");
    return { nodes, rest };
}

interface Track {
    node: THREE.Object3D;
    rest: Rest;
    position: Evaluate[];
    quaternion: Evaluate[];
    euler: Evaluate[];
    scale: Evaluate[];
}

/** A blend shape channel of the face: the influences it writes, at `index`, applied fully at `full`. */
interface Channel {
    influence: number[];
    index: number;
    full: number;
}

interface BoundClip {
    clip: Clip;
    tracks: Track[];
    /** Blend shape curves with a channel of the face's meshes. */
    shapes: Array<{ channel: Channel; evaluate: Evaluate }>;
    /** Curves of an attribute this viewer does not apply. */
    unbound: number;
}

/** The face's meshes' blend shape channels by the CRC-32 of their names. */
function channels(faceMeshes: THREE.Mesh[]): Map<number, Channel[]> {
    const byHash = new Map<number, Channel[]>();
    for (const mesh of faceMeshes) {
        const influence = mesh.morphTargetInfluences as number[] | undefined;
        if (!influence) continue;
        // GLTFLoader turns a mesh's morph targets into a dictionary of names.
        const names = Object.entries(mesh.morphTargetDictionary ?? {}).sort(([, a], [, b]) => a - b).map(([name]) => name);
        const fullWeights = (mesh.userData.fullWeights as number[] | undefined) ?? [];
        names.forEach((name, index) => {
            if (index >= influence.length) return;
            const hash = crc32(name);
            byHash.set(hash, [...(byHash.get(hash) ?? []), { influence, index, full: fullWeights[index] || 100 }]);
        });
    }
    return byHash;
}

export function bindClip(clip: Clip, rig: Rig, faceMeshes: THREE.Mesh[]): BoundClip {
    const tracks = new Map<THREE.Object3D, Track>();
    const byHash = channels(faceMeshes);
    const shapes: BoundClip["shapes"] = [];
    let unbound = clip.unbound;
    for (const { path, attribute, evaluate } of clip.transforms) {
        const node = rig.nodes.get(path);
        const rest = node && rig.rest.get(node);
        if (!node || !rest) {
            unbound++;
            continue;
        }
        let track = tracks.get(node);
        if (!track) {
            track = { node, rest, position: [], quaternion: [], euler: [], scale: [] };
            tracks.set(node, track);
        }
        if (attribute === TRANSFORM_PROPERTIES.position) track.position = evaluate;
        else if (attribute === TRANSFORM_PROPERTIES.rotation) track.quaternion = evaluate;
        else if (attribute === TRANSFORM_PROPERTIES.scale) track.scale = evaluate;
        else track.euler = evaluate;
    }
    for (const { attribute, evaluate } of clip.shapes) {
        const found = byHash.get(attribute);
        if (!found?.length) {
            unbound++;
            continue;
        }
        for (const channel of found) shapes.push({ channel, evaluate: t => evaluate(t) / channel.full });
    }
    return { clip, tracks: [...tracks.values()], shapes, unbound };
}

const scratchQ = new THREE.Quaternion();
const scratchE = new THREE.Euler(0, 0, 0, "YXZ");

function applyClip(bound: BoundClip, t: number): void {
    const value = (fns: Evaluate[], rest: readonly number[], i: number) => (fns[i] ? fns[i](t) : rest[i]);
    for (const { node, rest, position, quaternion, euler, scale } of bound.tracks) {
        if (position.length) node.position.set(-value(position, rest.position, 0), value(position, rest.position, 1), value(position, rest.position, 2));
        if (quaternion.length) {
            scratchQ.set(
                value(quaternion, rest.quaternion, 0), value(quaternion, rest.quaternion, 1),
                value(quaternion, rest.quaternion, 2), value(quaternion, rest.quaternion, 3),
            ).normalize();
            node.quaternion.set(scratchQ.x, -scratchQ.y, -scratchQ.z, scratchQ.w);
        } else if (euler.length) {
            const d = THREE.MathUtils.degToRad;
            scratchE.set(d(value(euler, rest.euler, 0)), d(value(euler, rest.euler, 1)), d(value(euler, rest.euler, 2)), "YXZ");
            scratchQ.setFromEuler(scratchE);
            node.quaternion.set(scratchQ.x, -scratchQ.y, -scratchQ.z, scratchQ.w);
        }
        if (scale.length) node.scale.set(value(scale, rest.scale, 0), value(scale, rest.scale, 1), value(scale, rest.scale, 2));
    }
    for (const { channel, evaluate } of bound.shapes) channel.influence[channel.index] = evaluate(t);
}

export interface ClipPair {
    body: BoundClip | null;
    face: BoundClip | null;
}

export type MotionPhase = "intro" | "loop" | "rest";

/** Plays the intro once and then the loop on one rig. */
export class MotionPlayer {
    intro: ClipPair | null = null;
    loop: ClipPair | null = null;
    rig: Rig | null = null;
    faceMeshes: THREE.Mesh[] = [];
    time = 0;
    phase: MotionPhase = "intro";

    attach(rig: Rig | null, faceMeshes: THREE.Mesh[], intro: ClipPair | null, loop: ClipPair | null): void {
        this.rig = rig;
        this.faceMeshes = faceMeshes;
        this.intro = intro;
        this.loop = loop;
    }

    get hasMotion(): boolean {
        return Boolean(this.rig && (this.intro || this.loop));
    }

    /** From the start of the intro (or the loop when there is none). */
    reset(): void {
        this.time = 0;
        this.phase = this.intro ? "intro" : "loop";
    }

    /** The first frame of the loop: what a still character shows when motion is reduced. */
    loopStart(): void {
        this.time = 0;
        this.phase = this.loop ? "loop" : "intro";
        this.tick(0);
    }

    /** The model as converted (arms out), with the blend shape weights its nodes store. */
    restPose(): void {
        if (!this.rig) return;
        for (const [node, rest] of this.rig.rest) {
            node.position.set(-rest.position[0], rest.position[1], rest.position[2]);
            node.quaternion.set(rest.quaternion[0], -rest.quaternion[1], -rest.quaternion[2], rest.quaternion[3]);
            node.scale.fromArray(rest.scale);
        }
        // The node's `weights` (stored weights over the channels' full weights) are the mesh's influences as it loads.
        for (const mesh of this.faceMeshes) mesh.morphTargetInfluences?.forEach((_, i) => { mesh.morphTargetInfluences![i] = mesh.userData.weights?.[i] ?? 0; });
        this.phase = "rest";
    }

    tick(dt: number): void {
        if (!this.rig || this.phase === "rest") return;
        const clips = this.phase === "intro" ? this.intro : this.loop;
        if (!clips) return;
        this.time += dt;
        const stop = clips.body?.clip.stop || clips.face?.clip.stop || 1;
        if (this.time >= stop) {
            if (this.phase === "intro" && this.loop) {
                this.phase = "loop";
                this.time -= stop;
                this.tick(0);
                return;
            }
            this.time %= stop;
        }
        if (clips.body) applyClip(clips.body, this.time + clips.body.clip.start);
        if (clips.face) applyClip(clips.face, this.time + clips.face.clip.start);
    }
}


