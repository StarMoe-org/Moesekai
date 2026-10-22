/**
 * The costume screen's motions (`character/motion/costume_setting/<NN>_00`, `costume3d-motion`):
 * `motion` + `face` play once, then `motion_loop` + `face_loop` repeat, as in the game.
 *
 * Curves are Unity's, kept as stored (constant, dense at 60 Hz, or streamed cubic segments), and
 * bound by transform path below the body root (`body`). Values are converted to glTF space here:
 * position x negated, quaternion (x, −y, −z, w), `localEulerAnglesRaw` in degrees applied Z, X,
 * then Y (three's `YXZ`), blendshape weights in percent.
 */
import * as THREE from "three";
import type { Costume3dCurve, Costume3dMotion } from "@/types/costume3d";

type Evaluate = (t: number) => number;

function curveEvaluator(curve: Costume3dCurve): Evaluate {
    if (curve.kind === "constant") {
        const value = curve.value;
        return () => value;
    }
    if (curve.kind === "dense") {
        const { samples, begin_time: begin, sample_rate: rate } = curve;
        const last = samples.length - 1;
        return t => {
            const x = (t - begin) * rate;
            if (x <= 0) return samples[0];
            const i = Math.floor(x);
            if (i >= last) return samples[last];
            return samples[i] + (samples[i + 1] - samples[i]) * (x - i);
        };
    }
    // Streamed: per segment a cubic in the time since the segment's start. The first segment
    // starts at -3.4e38 (Unity's "before the clip"), where the value is its constant term.
    const n = curve.segments.length;
    const starts = new Float64Array(n);
    const coeff = new Float64Array(n * 4);
    curve.segments.forEach((segment, i) => {
        starts[i] = segment.t;
        coeff.set(segment.coeff, i * 4);
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

export interface Clip {
    name: string;
    stop: number;
    curves: Array<{ path: string; property: string; evaluate: Evaluate }>;
}

export function clipOf(motion: Costume3dMotion): Clip {
    return {
        name: motion.name,
        stop: motion.stopTime,
        curves: motion.curves.map(curve => ({ path: curve.path, property: curve.property, evaluate: curveEvaluator(curve) })),
    };
}

/** A node's rest transform in Unity's space, which is what the curves leave untouched channels at. */
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

/** The nodes below the body root by transform path, with their rest transforms. */
interface Rig {
    nodes: Map<string, THREE.Object3D>;
    rest: Map<THREE.Object3D, Rest>;
}

export function rigOf(bodyRoot: THREE.Object3D): Rig {
    const nodes = new Map<string, THREE.Object3D>();
    const rest = new Map<THREE.Object3D, Rest>();
    const walk = (node: THREE.Object3D, path: string) => {
        for (const child of node.children) {
            if ((child as THREE.Mesh).isMesh) continue;
            const childPath = path ? `${path}/${child.name}` : child.name;
            if (!nodes.has(childPath)) nodes.set(childPath, child);
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

interface BoundClip {
    clip: Clip;
    tracks: Track[];
    shapes: Array<{ name: string; evaluate: Evaluate }>;
    unbound: number;
}

export function bindClip(clip: Clip, rig: Rig): BoundClip {
    const tracks = new Map<THREE.Object3D, Track>();
    const shapes: BoundClip["shapes"] = [];
    let unbound = 0;
    for (const curve of clip.curves) {
        if (curve.property.startsWith("blendShape.")) {
            shapes.push({ name: curve.property.slice("blendShape.".length), evaluate: curve.evaluate });
            continue;
        }
        const node = rig.nodes.get(curve.path);
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
        const [channel, axis] = curve.property.split(".");
        const index = "xyzw".indexOf(axis);
        if (index < 0) unbound++;
        else if (channel === "m_LocalPosition") track.position[index] = curve.evaluate;
        else if (channel === "m_LocalRotation") track.quaternion[index] = curve.evaluate;
        else if (channel === "localEulerAnglesRaw") track.euler[index] = curve.evaluate;
        else if (channel === "m_LocalScale") track.scale[index] = curve.evaluate;
        else unbound++;
    }
    return { clip, tracks: [...tracks.values()], shapes, unbound };
}

const scratchQ = new THREE.Quaternion();
const scratchE = new THREE.Euler(0, 0, 0, "YXZ");

function applyClip(bound: BoundClip, t: number, faceMeshes: THREE.Mesh[]): void {
    const value = (fns: Evaluate[], rest: readonly number[], i: number) => (fns[i] ? fns[i](t) : rest[i]);
    for (const { node, rest, position, quaternion, euler, scale } of bound.tracks) {
        if (position.length) {
            node.position.set(-value(position, rest.position, 0), value(position, rest.position, 1), value(position, rest.position, 2));
        }
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
    for (const shape of bound.shapes) {
        const weight = shape.evaluate(t) / 100;
        for (const mesh of faceMeshes) {
            const i = mesh.morphTargetDictionary?.[shape.name];
            if (i !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[i] = weight;
        }
    }
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

    /** The model as converted, with no clip applied (arms out). */
    restPose(): void {
        if (!this.rig) return;
        for (const [node, rest] of this.rig.rest) {
            node.position.set(-rest.position[0], rest.position[1], rest.position[2]);
            node.quaternion.set(rest.quaternion[0], -rest.quaternion[1], -rest.quaternion[2], rest.quaternion[3]);
            node.scale.fromArray(rest.scale);
        }
        for (const mesh of this.faceMeshes) mesh.morphTargetInfluences?.fill(0);
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
        if (clips.body) applyClip(clips.body, this.time, this.faceMeshes);
        if (clips.face) applyClip(clips.face, this.time, this.faceMeshes);
    }
}
