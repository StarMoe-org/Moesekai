/**
 * What moves on its own after the motion: the Unity constraints and the spring bones of a body
 * and its face (`costume3d-components`, from their prefabs).
 *
 * - Constraints (Aim, Rotation, Position, Parent): the skirt's pivots aim between the knees, the
 *   thigh collider sits between them, the back hair follows the chest. Each constraint keeps the
 *   offset its node has from its sources in the rest pose (what Unity's "Activate" records), and
 *   is blended with the rest pose by its weight.
 * - Spring bones (UTJ SpringBone, as the game's SekaiSpringBone and SpringManager use it): each
 *   bone's tip follows Verlet integration towards where the parent's rest orientation points it,
 *   at a fixed 60 Hz, is pushed out of sphere and capsule colliders, held inside its angle limits
 *   around its pivot, and turned into the bone's rotation.
 *
 * Everything runs in glTF space. A Unity local vector v is (-v.x, v.y, v.z) there (the converter
 * mirrors X); dot products and angles keep their sign, so the algorithm carries over unchanged.
 */
import * as THREE from "three";

/** One component of `components.json`; references are `{ $ref: { node } | { component } }`. */
export interface Costume3dComponent {
    class: string;
    node: string;
    enabled: boolean;
    fields: Record<string, unknown>;
}

type Ref = { $ref?: { node?: string; component?: number } } | null | undefined;
type Vec = { x: number; y: number; z: number };

const STEP = 1 / 60;
/** Steps a frame may take at most (after a stall the springs settle rather than run on). */
const MAX_STEPS = 4;

const unityVector = (v: Vec | undefined, fallback: [number, number, number] = [0, 0, 0]) =>
    v ? new THREE.Vector3(-v.x, v.y, v.z) : new THREE.Vector3(...fallback);

const worldPosition = (node: THREE.Object3D, out = new THREE.Vector3()) => out.setFromMatrixPosition(node.matrixWorld);
const worldQuaternion = (node: THREE.Object3D, out = new THREE.Quaternion()) => node.getWorldQuaternion(out);

/** Finds the nodes a bundle's components name, by path below its root. */
export type NodeResolver = (path: string) => THREE.Object3D | null;

export function resolverFor(root: THREE.Object3D, shared?: Map<string, THREE.Object3D>): NodeResolver {
    return path => {
        let node: THREE.Object3D | undefined = root;
        for (const name of path.split("/")) {
            node = node?.children.find(child => child.name === name);
            if (!node) return null;
        }
        // A face bone the body also has is replaced by the body's (attachFace): use that one.
        return shared?.get(node.name) ?? node;
    };
}

/**
 * Resolves now every path the components name (theirs and their references'), for a resolver
 * whose hierarchy is about to change: attachFace moves the face's own nodes under body bones.
 */
export function pinned(components: Costume3dComponent[], resolve: NodeResolver): NodeResolver {
    const nodes = new Map<string, THREE.Object3D | null>();
    const visit = (value: unknown): void => {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") {
            const ref = (value as Ref)?.$ref;
            if (ref?.node !== undefined) nodes.set(ref.node, resolve(ref.node));
            else Object.values(value).forEach(visit);
        }
    };
    for (const component of components) {
        nodes.set(component.node, resolve(component.node));
        visit(component.fields);
    }
    return path => nodes.get(path) ?? null;
}

// ---------------------------------------------------------------- constraints

interface Constraint {
    node: THREE.Object3D;
    depth: number;
    weight: number;
    restPosition: THREE.Vector3;
    restQuaternion: THREE.Quaternion;
    apply: () => void;
}

function depthOf(node: THREE.Object3D): number {
    let depth = 0;
    for (let n = node.parent; n; n = n.parent) depth++;
    return depth;
}

function sources(fields: Record<string, unknown>, resolve: NodeResolver): Array<{ node: THREE.Object3D; weight: number }> {
    const list = (fields.m_Sources as Array<{ sourceTransform: Ref; weight: number }> | undefined) ?? [];
    return list
        .map(source => ({ node: source.sourceTransform?.$ref?.node ? resolve(source.sourceTransform.$ref.node) : null, weight: source.weight }))
        .filter((source): source is { node: THREE.Object3D; weight: number } => source.node !== null && source.weight > 0);
}

function averagePosition(list: Array<{ node: THREE.Object3D; weight: number }>, out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, 0);
    let total = 0;
    const p = new THREE.Vector3();
    for (const source of list) {
        out.addScaledVector(worldPosition(source.node, p), source.weight);
        total += source.weight;
    }
    return total > 0 ? out.divideScalar(total) : out;
}

function averageQuaternion(list: Array<{ node: THREE.Object3D; weight: number }>, out: THREE.Quaternion): THREE.Quaternion {
    const q = new THREE.Quaternion();
    let total = 0;
    for (const source of list) {
        worldQuaternion(source.node, q);
        if (total === 0) out.copy(q);
        else out.slerp(q, source.weight / (total + source.weight));
        total += source.weight;
    }
    return out;
}

/** Rotation that turns `localAim` to `aim` and, as far as it can, `localUp` to `up`. */
function aimRotation(localAim: THREE.Vector3, localUp: THREE.Vector3, aim: THREE.Vector3, up: THREE.Vector3 | null, out: THREE.Quaternion): THREE.Quaternion {
    if (!up) return out.setFromUnitVectors(localAim, aim);
    const basis = (a: THREE.Vector3, u: THREE.Vector3) => {
        const x = a.clone().normalize();
        const z = new THREE.Vector3().crossVectors(x, u);
        if (z.lengthSq() < 1e-10) z.crossVectors(x, Math.abs(x.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
        z.normalize();
        const y = new THREE.Vector3().crossVectors(z, x);
        return new THREE.Matrix4().makeBasis(x, y, z);
    };
    const local = basis(localAim, localUp);
    const world = basis(aim, up);
    return out.setFromRotationMatrix(world.multiply(local.transpose()));
}

/** Sets a node's world rotation (and position) through its local transform, blended with its rest pose. */
function setWorld(entry: Constraint, quaternion: THREE.Quaternion | null, position: THREE.Vector3 | null): void {
    const { node, weight, restPosition, restQuaternion } = entry;
    const parent = node.parent;
    if (!parent) return;
    if (quaternion) {
        const local = worldQuaternion(parent).invert().multiply(quaternion);
        node.quaternion.copy(restQuaternion).slerp(local, weight);
    }
    if (position) {
        const local = parent.worldToLocal(position.clone());
        node.position.copy(restPosition).lerp(local, weight);
    }
    node.updateMatrixWorld(true);
}

function buildConstraint(component: Costume3dComponent, node: THREE.Object3D, resolve: NodeResolver): Constraint | null {
    const f = component.fields;
    if (f.m_Active === false || !component.enabled) return null;
    const list = sources(f, resolve);
    if (!list.length) return null;
    const weight = typeof f.m_Weight === "number" ? f.m_Weight : 1;
    const entry: Constraint = {
        node, depth: depthOf(node), weight,
        restPosition: node.position.clone(), restQuaternion: node.quaternion.clone(),
        apply: () => {},
    };
    // Offsets from the sources in the rest pose (world matrices are those of the rest pose here).
    const nodeQ = worldQuaternion(node);
    const nodeP = worldPosition(node);
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    switch (component.class) {
        case "RotationConstraint": {
            const offset = averageQuaternion(list, q.clone()).invert().multiply(nodeQ);
            entry.apply = () => setWorld(entry, averageQuaternion(list, q).multiply(offset), null);
            return entry;
        }
        case "PositionConstraint": {
            const offset = nodeP.clone().sub(averagePosition(list, p.clone()));
            entry.apply = () => setWorld(entry, null, averagePosition(list, p).add(offset));
            return entry;
        }
        case "ParentConstraint": {
            const parentRest = new THREE.Matrix4().compose(averagePosition(list, p.clone()), averageQuaternion(list, q.clone()), new THREE.Vector3(1, 1, 1));
            const offset = parentRest.invert().multiply(node.matrixWorld.clone());
            const m = new THREE.Matrix4();
            const s = new THREE.Vector3();
            entry.apply = () => {
                m.compose(averagePosition(list, p), averageQuaternion(list, q), new THREE.Vector3(1, 1, 1)).multiply(offset);
                const position = new THREE.Vector3();
                const quaternion = new THREE.Quaternion();
                m.decompose(position, quaternion, s);
                setWorld(entry, quaternion, position);
            };
            return entry;
        }
        case "AimConstraint": {
            const localAim = unityVector(f.m_AimVector as Vec, [-1, 0, 0]).normalize();
            const localUp = unityVector(f.m_UpVector as Vec, [0, 1, 0]).normalize();
            const upType = typeof f.m_UpType === "number" ? f.m_UpType : 0;
            const upObject = (f.m_WorldUpObject as Ref)?.$ref?.node ? resolve((f.m_WorldUpObject as Ref)!.$ref!.node!) : null;
            const upVector = unityVector(f.m_WorldUpVector as Vec, [0, 1, 0]).normalize();
            // Unity's WorldUpType: 0 scene up, 1 towards an object, 2 an object's rotated up, 3 a vector, 4 none.
            const worldUp = (from: THREE.Vector3): THREE.Vector3 | null => {
                switch (upType) {
                    case 0: return new THREE.Vector3(0, 1, 0);
                    case 1: return upObject ? worldPosition(upObject).sub(from).normalize() : new THREE.Vector3(0, 1, 0);
                    case 2: return upObject ? upVector.clone().applyQuaternion(worldQuaternion(upObject)) : upVector.clone();
                    case 3: return upVector.clone();
                    default: return null;
                }
            };
            const aimNow = (out: THREE.Quaternion) => {
                const from = worldPosition(node, new THREE.Vector3());
                const direction = averagePosition(list, p).sub(from);
                if (direction.lengthSq() < 1e-12) return null;
                return aimRotation(localAim, localUp, direction.normalize(), worldUp(from), out);
            };
            const aimRest = aimNow(new THREE.Quaternion());
            if (!aimRest) return null;
            const offset = aimRest.clone().invert().multiply(nodeQ);
            entry.apply = () => {
                const aim = aimNow(q);
                if (aim) setWorld(entry, aim.multiply(offset), null);
            };
            return entry;
        }
        default:
            return null;
    }
}

// ---------------------------------------------------------------- spring bones

interface Collider {
    node: THREE.Object3D;
    radius: number;
    /** Capsules run along the node's local +Y for this length; 0 for spheres. */
    height: number;
}

interface AngleLimit {
    min: number;
    max: number;
}

interface SpringBone {
    node: THREE.Object3D;
    pivot: THREE.Object3D | null;
    depth: number;
    restQuaternion: THREE.Quaternion;
    /** Towards the tip (the bone's first child), in the bone's local space, and its length. */
    axis: THREE.Vector3;
    length: number;
    radius: number;
    stiffness: number;
    drag: number;
    force: THREE.Vector3;
    yLimit: AngleLimit | null;
    zLimit: AngleLimit | null;
    colliders: Collider[];
    tip: THREE.Vector3;
    previousTip: THREE.Vector3;
}

interface SpringManager {
    bones: SpringBone[];
    gravity: THREE.Vector3;
    dynamicRatio: number;
    collisions: boolean;
    angleLimits: boolean;
}

function limit(value: unknown): AngleLimit | null {
    const v = value as { active?: number; min?: number; max?: number } | undefined;
    return v?.active ? { min: v.min ?? 0, max: v.max ?? 0 } : null;
}

const scratch = {
    head: new THREE.Vector3(),
    equilibrium: new THREE.Vector3(),
    force: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    center: new THREE.Vector3(),
    end: new THREE.Vector3(),
    closest: new THREE.Vector3(),
    parentQ: new THREE.Quaternion(),
    pivotQ: new THREE.Quaternion(),
    q: new THREE.Quaternion(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    c: new THREE.Vector3(),
};

function closestOnSegment(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3, out: THREE.Vector3): number {
    const ab = scratch.a.subVectors(b, a);
    const lengthSq = ab.lengthSq();
    const t = lengthSq > 0 ? THREE.MathUtils.clamp(scratch.b.subVectors(p, a).dot(ab) / lengthSq, 0, 1) : 0;
    out.copy(a).addScaledVector(ab, t);
    return t;
}

/** Pushes the tip out of a collider, testing the tip and the middle of the bone. */
function collide(bone: SpringBone, head: THREE.Vector3, collider: Collider): void {
    const center = worldPosition(collider.node, scratch.center);
    const reach = collider.radius + bone.radius;
    const pushOut = (point: THREE.Vector3, leverage: number) => {
        let target = center;
        if (collider.height > 0) {
            const end = scratch.end.set(0, collider.height, 0).applyMatrix4(collider.node.matrixWorld);
            closestOnSegment(center, end, point, scratch.closest);
            target = scratch.closest;
        }
        const away = scratch.c.subVectors(point, target);
        const distance = away.length();
        if (distance >= reach || distance < 1e-6) return;
        bone.tip.addScaledVector(away.divideScalar(distance), (reach - distance) * leverage);
    };
    pushOut(bone.tip, 1);
    const middle = scratch.direction.copy(head).lerp(bone.tip, 0.5);
    pushOut(middle.clone(), 2);
}

/**
 * Holds the bone's direction inside a limit: the angle of its projection on a pivot plane,
 * measured from the pivot's forward towards `side`, stays within [min, max] degrees.
 */
function constrainAngle(vector: THREE.Vector3, forward: THREE.Vector3, side: THREE.Vector3, normal: THREE.Vector3, limits: AngleLimit): void {
    const along = vector.dot(normal);
    const projection = scratch.a.copy(vector).addScaledVector(normal, -along);
    const length = projection.length();
    if (length < 1e-6) return;
    const angle = THREE.MathUtils.radToDeg(Math.atan2(projection.dot(side), projection.dot(forward)));
    const clamped = THREE.MathUtils.clamp(angle, limits.min, limits.max);
    if (clamped === angle) return;
    const r = THREE.MathUtils.degToRad(clamped);
    vector.copy(forward).multiplyScalar(Math.cos(r) * length).addScaledVector(side, Math.sin(r) * length).addScaledVector(normal, along);
}

function stepBone(bone: SpringBone, manager: SpringManager): void {
    const { node } = bone;
    const parent = node.parent;
    if (!parent) return;
    const head = worldPosition(node, scratch.head);
    const parentQ = worldQuaternion(parent, scratch.parentQ);
    // Where the bone would point if the spring were at rest: the parent's pose with the bone's own rest rotation.
    const restDirection = scratch.direction.copy(bone.axis).applyQuaternion(bone.restQuaternion).applyQuaternion(parentQ);
    const equilibrium = scratch.equilibrium.copy(head).addScaledVector(restDirection, bone.length);

    const force = scratch.force.subVectors(equilibrium, bone.tip).multiplyScalar(bone.stiffness)
        .add(bone.force).add(manager.gravity).multiplyScalar(0.5 * STEP * STEP);
    const velocity = scratch.velocity.subVectors(bone.tip, bone.previousTip).multiplyScalar(1 - bone.drag);
    bone.previousTip.copy(bone.tip);
    bone.tip.add(force).add(velocity);

    const keepLength = () => {
        const toTip = scratch.b.subVectors(bone.tip, head);
        const length = toTip.length();
        if (length < 1e-6) bone.tip.copy(equilibrium);
        else bone.tip.copy(head).addScaledVector(toTip, bone.length / length);
    };
    keepLength();
    if (manager.collisions) {
        for (const collider of bone.colliders) collide(bone, head, collider);
        keepLength();
    }
    if (manager.angleLimits && bone.pivot && (bone.yLimit || bone.zLimit)) {
        const pivotQ = worldQuaternion(bone.pivot, scratch.pivotQ);
        // UTJ's basis: forward -right, y-limit side -up about -forward, z-limit side -forward about -up (mirrored).
        const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(pivotQ);
        const down = new THREE.Vector3(0, -1, 0).applyQuaternion(pivotQ);
        const back = new THREE.Vector3(0, 0, -1).applyQuaternion(pivotQ);
        const vector = new THREE.Vector3().subVectors(bone.tip, head);
        if (bone.yLimit) constrainAngle(vector, forward, down, back, bone.yLimit);
        if (bone.zLimit) constrainAngle(vector, forward, back, down, bone.zLimit);
        bone.tip.copy(head).add(vector);
        keepLength();
    }

    // The rotation that points the bone at its tip, blended with what the motion gave it.
    const toTip = scratch.b.subVectors(bone.tip, head).normalize().applyQuaternion(parentQ.invert());
    const restAxis = scratch.c.copy(bone.axis).applyQuaternion(bone.restQuaternion);
    const physical = scratch.q.setFromUnitVectors(restAxis, toTip).multiply(bone.restQuaternion);
    node.quaternion.slerp(physical, manager.dynamicRatio);
    node.updateMatrixWorld(true);
}

function resetBone(bone: SpringBone): void {
    const head = worldPosition(bone.node, new THREE.Vector3());
    bone.tip.copy(bone.axis).multiplyScalar(bone.length).applyMatrix4(bone.node.matrixWorld);
    if (bone.tip.distanceTo(head) < 1e-6) bone.tip.copy(head);
    bone.previousTip.copy(bone.tip);
}

// ---------------------------------------------------------------- the whole

export interface PhysicsSource {
    components: Costume3dComponent[];
    resolve: NodeResolver;
}

export class Costume3dPhysics {
    private readonly constraints: Constraint[];
    private readonly managers: SpringManager[];
    private accumulated = 0;

    private constructor(constraints: Constraint[], managers: SpringManager[]) {
        this.constraints = constraints.sort((a, b) => a.depth - b.depth);
        this.managers = managers;
    }

    get springCount(): number {
        return this.managers.reduce((n, manager) => n + manager.bones.length, 0);
    }

    get constraintCount(): number {
        return this.constraints.length;
    }

    /** Reads the components of each bundle; `root` must be in its rest pose, with world matrices up to date. */
    static build(root: THREE.Object3D, sourcesList: PhysicsSource[]): Costume3dPhysics {
        root.updateMatrixWorld(true);
        const constraints: Constraint[] = [];
        const managers: SpringManager[] = [];
        for (const { components, resolve } of sourcesList) {
            const nodeOf = (component: Costume3dComponent) => resolve(component.node);
            for (const component of components) {
                if (!component.class.endsWith("Constraint")) continue;
                const node = nodeOf(component);
                const constraint = node && buildConstraint(component, node, resolve);
                if (constraint) constraints.push(constraint);
            }
            const colliderOf = (ref: Ref): Collider | null => {
                const index = ref?.$ref?.component;
                const component = index !== undefined ? components[index] : undefined;
                const node = component && nodeOf(component);
                if (!component || !node || !component.enabled) return null;
                const scale = node.getWorldScale(new THREE.Vector3()).x;
                const radius = (component.fields.radius as number ?? 0) * scale;
                const height = component.class === "SpringCapsuleCollider" ? (component.fields.height as number ?? 0) * scale : 0;
                return { node, radius, height };
            };
            for (const component of components) {
                if (component.class !== "SpringManager" || !component.enabled) continue;
                const f = component.fields;
                const bones: SpringBone[] = [];
                for (const ref of (f.springBones as Ref[] | undefined) ?? []) {
                    const index = ref?.$ref?.component;
                    const boneComponent = index !== undefined ? components[index] : undefined;
                    const node = boneComponent && boneComponent.enabled ? nodeOf(boneComponent) : null;
                    const child = node?.children.find(c => !(c as THREE.Mesh).isMesh);
                    if (!boneComponent || !node || !child) continue;
                    const b = boneComponent.fields;
                    const pivotRef = (b.pivotNode as Ref)?.$ref?.node;
                    const scale = node.getWorldScale(new THREE.Vector3()).x;
                    const bone: SpringBone = {
                        node,
                        pivot: pivotRef ? resolve(pivotRef) : null,
                        depth: depthOf(node),
                        restQuaternion: node.quaternion.clone(),
                        axis: child.position.clone().normalize(),
                        length: child.position.length() * scale,
                        radius: (b.radius as number ?? 0) * scale,
                        stiffness: b.stiffnessForce as number ?? 0,
                        drag: THREE.MathUtils.clamp(b.dragForce as number ?? 0, 0, 1),
                        force: unityVector(b.springForce as Vec),
                        yLimit: limit(b.yAngleLimits),
                        zLimit: limit(b.zAngleLimits),
                        colliders: [
                            ...((b.sphereColliders as Ref[] | undefined) ?? []),
                            ...((b.capsuleColliders as Ref[] | undefined) ?? []),
                        ].map(colliderOf).filter((c): c is Collider => c !== null),
                        tip: new THREE.Vector3(),
                        previousTip: new THREE.Vector3(),
                    };
                    if (bone.length > 1e-5) bones.push(bone);
                }
                if (!bones.length) continue;
                managers.push({
                    // A chain's parent bone moves before its children.
                    bones: bones.sort((a, b) => a.depth - b.depth),
                    gravity: unityVector(f.gravity as Vec),
                    dynamicRatio: THREE.MathUtils.clamp(typeof f.dynamicRatio === "number" ? f.dynamicRatio : 1, 0, 1),
                    collisions: f.enableCollision !== 0,
                    angleLimits: f.enableAngleLimits !== 0,
                });
            }
        }
        const physics = new Costume3dPhysics(constraints, managers);
        physics.reset(root);
        return physics;
    }

    /** Puts every spring at rest in the current pose (after a jump: a new look, a replay, the rest pose). */
    reset(root: THREE.Object3D): void {
        root.updateMatrixWorld(true);
        for (const constraint of this.constraints) constraint.apply();
        for (const manager of this.managers) {
            for (const bone of manager.bones) {
                bone.node.quaternion.copy(bone.restQuaternion);
                bone.node.updateMatrixWorld(true);
                resetBone(bone);
            }
        }
        this.accumulated = 0;
    }

    /** Runs after the motion has posed the skeleton for this frame. */
    update(root: THREE.Object3D, dt: number): void {
        root.updateMatrixWorld(true);
        for (const constraint of this.constraints) constraint.apply();
        this.accumulated = Math.min(this.accumulated + dt, STEP * MAX_STEPS);
        const steps = Math.floor(this.accumulated / STEP);
        this.accumulated -= steps * STEP;
        if (steps === 0) {
            // Between steps the bones keep the rotation of the last one, over the motion's new pose.
            for (const manager of this.managers) for (const bone of manager.bones) bone.node.updateMatrixWorld(true);
            return;
        }
        for (let i = 0; i < steps; i++) {
            for (const manager of this.managers) {
                for (const bone of manager.bones) stepBone(bone, manager);
            }
        }
    }
}
