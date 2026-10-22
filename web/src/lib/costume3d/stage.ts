/**
 * The 3D costume stage: one character on a round platform, with its costume shop motion.
 *
 * Assembly:
 * - the body's skeleton leads: the face's bones are swapped for the body's bones of the same
 *   name, and the face's own nodes (hair bones, attach points) move under the body bone their
 *   parent names;
 * - the accessory hangs from its attach point (`Head/aNN`);
 * - the body's `OffsetValue` holds the shoe height, by which the game lifts the skeleton through
 *   `PositionOffset`.
 *
 * The renderer is transparent: the page paints the background. Rendering stops while the stage
 * is off screen or the tab is hidden.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Costume3dMotion, Costume3dPartRecord, Costume3dVariant } from "@/types/costume3d";
import { loadLibraryJson } from "./data";
import type { Costume3dLook } from "./look";
import { addOutlines, dress, type ColorTextures } from "./materials";
import { bindClip, clipOf, MotionPlayer, rigOf, type Clip, type ClipPair, type MotionPhase } from "./motion";
import { Costume3dPhysics, pinned, resolverFor, type Costume3dComponent, type PhysicsSource } from "./physics";

const STAGE_RADIUS = 0.5;
const STAGE_HEIGHT = 0.04;
/** Full body from slightly above, so the platform reads as a round stage. */
const BODY_VIEW = { target: new THREE.Vector3(0, 0.5, 0), from: new THREE.Vector3(0.32, 0.36, 1).normalize(), distance: 3.1 };
/** Textures kept for later looks; beyond this, those the current look does not use are released. */
const TEXTURE_CACHE_LIMIT = 160;

function canvasTexture(draw: (g: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void, width: number, height = width): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    if (g) draw(g, canvas);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function radialTexture(stops: Array<[number, string]>, size = 256): THREE.CanvasTexture {
    return canvasTexture(g => {
        const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        for (const [at, color] of stops) gradient.addColorStop(at, color);
        g.fillStyle = gradient;
        g.fillRect(0, 0, size, size);
    }, size);
}

/** The platform top: matte, faint concentric rings and a bright rim. Unlit, so the shading is painted in. */
function platformTopTexture(size = 1024): THREE.CanvasTexture {
    const texture = canvasTexture(g => {
        const c = size / 2;
        const fill = g.createRadialGradient(c, c * 0.92, 0, c, c, c);
        fill.addColorStop(0, "#ffffff");
        fill.addColorStop(0.7, "#f3f4f7");
        fill.addColorStop(1, "#e4e6eb");
        g.fillStyle = fill;
        g.fillRect(0, 0, size, size);
        const ring = (r: number, width: number, color: string) => {
            g.beginPath();
            g.arc(c, c, r * c, 0, Math.PI * 2);
            g.lineWidth = width;
            g.strokeStyle = color;
            g.stroke();
        };
        for (const r of [0.28, 0.46, 0.64]) ring(r, 2, "rgba(120, 128, 145, 0.10)");
        ring(0.82, 3, "rgba(120, 128, 145, 0.16)");
        ring(0.955, 6, "rgba(255, 255, 255, 0.95)");
        ring(0.985, 4, "rgba(150, 156, 170, 0.35)");
    }, size);
    texture.anisotropy = 8;
    return texture;
}

function platformSideTexture(): THREE.CanvasTexture {
    return canvasTexture(g => {
        const fill = g.createLinearGradient(0, 0, 0, 64);
        fill.addColorStop(0, "#f7f8fa");
        fill.addColorStop(0.15, "#d9dce3");
        fill.addColorStop(1, "#a9aeb9");
        g.fillStyle = fill;
        g.fillRect(0, 0, 4, 64);
    }, 4, 64);
}

/** Face onto body (see the module comment); returns how many face nodes moved. */
function attachFace(body: THREE.Object3D, face: THREE.Object3D): number {
    const bodyNodes = new Map<string, THREE.Object3D>();
    body.traverse(object => { if (object !== body && !bodyNodes.has(object.name)) bodyNodes.set(object.name, object); });
    face.traverse(object => {
        const mesh = object as THREE.SkinnedMesh;
        if (!mesh.isSkinnedMesh) return;
        const bones = mesh.skeleton.bones.map(bone => (bodyNodes.get(bone.name) as THREE.Bone | undefined) ?? bone);
        mesh.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
    });
    const moves: Array<[THREE.Object3D, THREE.Object3D]> = [];
    face.traverse(object => {
        if (object === face || bodyNodes.has(object.name) || !object.parent || object.parent === face || (object as THREE.Mesh).isMesh) return;
        const target = bodyNodes.get(object.parent.name);
        if (target) moves.push([object, target]);
    });
    for (const [node, target] of moves) target.add(node);
    return moves.length;
}

function disposeGroup(group: THREE.Object3D): void {
    group.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!mesh.userData.isOutline) mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
            if (material.userData.ownsMap) (material as THREE.MeshBasicMaterial).map?.dispose();
            material.dispose();
        }
    });
}

export interface StageLoad {
    library: string;
    variant: Costume3dVariant;
    look: Costume3dLook;
    skin: { default: string; shadow1: string };
}

export interface StageLoadOptions {
    signal?: AbortSignal;
    /** Parts done out of parts to fetch (models, colour textures, motion). */
    onProgress?: (done: number, total: number) => void;
}

export class Costume3dStageAbortedError extends Error {
    constructor() {
        super("costume3d_stage_aborted");
    }
}

export interface Costume3dStageOptions {
    /** Start paused on the first frame of the loop (reduced motion). */
    still?: boolean;
}

export class Costume3dStage {
    readonly canvas: HTMLCanvasElement;
    private readonly host: HTMLElement;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.PerspectiveCamera(24, 1, 0.01, 50);
    private readonly controls: OrbitControls;
    private readonly platformTop: THREE.MeshBasicMaterial;
    private readonly platformSide: THREE.MeshBasicMaterial;
    private readonly stageObjects: THREE.Object3D[] = [];
    private readonly player = new MotionPlayer();
    private readonly clock = new THREE.Clock();
    private readonly gltfLoader = new GLTFLoader();
    private readonly textureLoader = new THREE.TextureLoader();
    private readonly textures = new Map<string, Promise<THREE.Texture | null>>();
    private readonly clips = new Map<string, Promise<Clip | null>>();
    private readonly resizeObserver: ResizeObserver;
    private readonly intersectionObserver: IntersectionObserver;
    private current: { group: THREE.Group; key: string; physics: Costume3dPhysics | null } | null = null;
    private onScreen = true;
    private disposed = false;
    playing: boolean;
    outlines = true;

    constructor(host: HTMLElement, options: Costume3dStageOptions = {}) {
        this.host = host;
        this.playing = !options.still;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.canvas = this.renderer.domElement;
        this.canvas.style.display = "block";
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.touchAction = "none";
        host.prepend(this.canvas);

        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.minDistance = 0.3;
        this.controls.maxDistance = 6;
        this.controls.autoRotateSpeed = 1.5;
        // Never below the horizon: the platform is not meant to be seen from underneath.
        this.controls.minPolarAngle = 0.15;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.02;

        this.platformTop = new THREE.MeshBasicMaterial({ map: platformTopTexture() });
        this.platformSide = new THREE.MeshBasicMaterial({ map: platformSideTexture() });
        const platform = new THREE.Mesh(
            new THREE.CylinderGeometry(STAGE_RADIUS, STAGE_RADIUS * 1.015, STAGE_HEIGHT, 128, 1),
            [this.platformSide, this.platformTop, this.platformSide],
        );
        platform.position.y = STAGE_HEIGHT / 2;
        const shadow = (strength: number) => new THREE.MeshBasicMaterial({
            map: radialTexture([[0, `rgba(20, 24, 32, ${strength})`], [0.55, `rgba(20, 24, 32, ${strength * 0.45})`], [1, "rgba(20, 24, 32, 0)"]]),
            transparent: true,
            depthWrite: false,
        });
        const groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(STAGE_RADIUS * 3, STAGE_RADIUS * 3), shadow(0.28));
        groundShadow.rotation.x = -Math.PI / 2;
        groundShadow.position.y = 0.0005;
        const feetShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), shadow(0.32));
        feetShadow.rotation.x = -Math.PI / 2;
        feetShadow.position.y = STAGE_HEIGHT + 0.0005;
        feetShadow.renderOrder = 1;
        this.stageObjects.push(platform, groundShadow, feetShadow);
        this.scene.add(platform, groundShadow, feetShadow);
        this.setUnitColor(null);

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(host);
        this.intersectionObserver = new IntersectionObserver(entries => {
            this.onScreen = entries.some(entry => entry.isIntersecting);
            this.updateLoop();
        });
        this.intersectionObserver.observe(host);
        document.addEventListener("visibilitychange", this.updateLoop);
        this.resize();
        this.viewBody();
        this.updateLoop();
    }

    private readonly frame = () => {
        const dt = Math.min(this.clock.getDelta(), 0.1);
        if (this.playing) this.player.tick(dt);
        // Springs keep moving while the motion is paused: they settle as they would in the game.
        if (this.current?.physics) this.current.physics.update(this.current.group, dt);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    };

    private readonly updateLoop = () => {
        const run = !this.disposed && this.onScreen && document.visibilityState !== "hidden";
        this.clock.getDelta();
        this.renderer.setAnimationLoop(run ? this.frame : null);
    };

    private resize(): void {
        const width = Math.max(1, this.host.clientWidth);
        const height = Math.max(1, this.host.clientHeight);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    /** Tints the platform with the role's unit colour. */
    setUnitColor(hex: string | null): void {
        const unit = new THREE.Color(hex ?? "#888888");
        this.platformTop.color.set("#ffffff").lerp(unit, 0.1);
        this.platformSide.color.set("#ffffff").lerp(unit, 0.28);
    }

    private frameOn(target: THREE.Vector3, distance: number): void {
        this.controls.target.copy(target);
        const direction = this.camera.position.clone().sub(target).normalize();
        if (!Number.isFinite(direction.x) || direction.lengthSq() === 0) direction.set(0, 0, 1);
        this.camera.position.copy(target).add(direction.multiplyScalar(distance));
        this.controls.update();
    }

    viewBody(): void {
        this.camera.position.copy(BODY_VIEW.target).add(BODY_VIEW.from.clone().multiplyScalar(BODY_VIEW.distance));
        this.frameOn(BODY_VIEW.target, BODY_VIEW.distance);
    }

    viewHead(): void {
        const head = this.current?.group.getObjectByName("Head");
        const target = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0.85, 0);
        this.frameOn(target.add(new THREE.Vector3(0, 0.06, 0)), 0.7);
    }

    /** Rotates the view around the character by `radians`, and zooms by `factor` (< 1 nearer). */
    nudge(radians: number, factor = 1): void {
        const offset = this.camera.position.clone().sub(this.controls.target);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
        const length = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
        this.camera.position.copy(this.controls.target).add(offset.setLength(length));
        this.controls.update();
    }

    get autoRotate(): boolean {
        return this.controls.autoRotate;
    }

    set autoRotate(on: boolean) {
        this.controls.autoRotate = on;
    }

    setOutlines(on: boolean): void {
        this.outlines = on;
        this.current?.group.traverse(object => { if (object.userData.isOutline) object.visible = on; });
    }

    get motionPhase(): MotionPhase {
        return this.player.phase;
    }

    get hasMotion(): boolean {
        return this.player.hasMotion;
    }

    replay(): void {
        this.player.reset();
        this.player.tick(0);
        this.resetPhysics();
        this.playing = true;
    }

    /** Springs at rest in the current pose: after the pose jumped. */
    private resetPhysics(): void {
        if (this.current?.physics) this.current.physics.reset(this.current.group);
    }

    restPose(): void {
        this.playing = false;
        this.player.restPose();
        this.resetPhysics();
    }

    play(): void {
        if (this.player.phase === "rest") this.player.reset();
        this.playing = true;
    }

    pause(): void {
        this.playing = false;
    }

    private texture = (file: string, srgb: boolean, library: string): Promise<THREE.Texture | null> => {
        const key = `${library}${file}${srgb ? "" : "#linear"}`;
        let pending = this.textures.get(key);
        if (!pending) {
            pending = this.textureLoader.loadAsync(`${library}${file}`).then(texture => {
                texture.flipY = false; // PNG rows top first; the glTF UVs are flipped already
                texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
                texture.anisotropy = 4;
                return texture;
            }, () => null);
            this.textures.set(key, pending);
        } else {
            // Most recently used last, for the eviction below.
            this.textures.delete(key);
            this.textures.set(key, pending);
        }
        return pending;
    };

    /** Releases cached textures beyond the limit, oldest first, except those `group` uses. */
    private async trimTextures(group: THREE.Object3D): Promise<void> {
        if (this.textures.size <= TEXTURE_CACHE_LIMIT) return;
        const used = new Set<THREE.Texture>();
        group.traverse(object => {
            const material = (object as THREE.Mesh).material as THREE.ShaderMaterial | THREE.MeshBasicMaterial | undefined;
            if (!material) return;
            const uniforms = (material as THREE.ShaderMaterial).uniforms;
            for (const texture of [uniforms?.mainTex?.value, uniforms?.shadowTex?.value, uniforms?.valueTex?.value, (material as THREE.MeshBasicMaterial).map]) {
                if (texture) used.add(texture as THREE.Texture);
            }
        });
        for (const [key, pending] of this.textures) {
            if (this.textures.size <= TEXTURE_CACHE_LIMIT) break;
            const texture = await pending;
            if (texture && used.has(texture)) continue;
            this.textures.delete(key);
            texture?.dispose();
        }
    }

    private part(library: string, bundle: string): Promise<Costume3dPartRecord> {
        return loadLibraryJson<Costume3dPartRecord>(library, `${bundle}/_part.json`);
    }

    private async colorTextures(library: string, bundle: string | null | undefined): Promise<ColorTextures | null> {
        if (!bundle) return null;
        const record = await this.part(library, bundle);
        const textures: ColorTextures = {};
        for (const texture of record.textures) {
            const match = /_([CSH])$/i.exec(texture.name);
            if (match) textures[`_${match[1].toUpperCase()}` as keyof ColorTextures] = texture.file;
        }
        return textures;
    }

    private async components(library: string, bundle: string | null | undefined): Promise<Costume3dComponent[]> {
        if (!bundle) return [];
        const record = await this.part(library, bundle);
        if (!record.components) return [];
        const file = await loadLibraryJson<{ components: Costume3dComponent[] }>(library, `${bundle}/${record.components}`);
        return file.components ?? [];
    }

    private clip(library: string, bundle: string, record: Costume3dPartRecord, name: string): Promise<Clip | null> {
        const key = `${library}${bundle}#${name}`;
        let pending = this.clips.get(key);
        if (!pending) {
            const entry = record.motions.find(motion => motion.name === name);
            pending = !entry
                ? Promise.resolve(null)
                : fetch(`${library}${bundle}/${entry.file}`)
                    .then(response => {
                        if (!response.ok) throw new Error(`${response.status} ${bundle}/${entry.file}`);
                        return response.json() as Promise<Costume3dMotion>;
                    })
                    .then(clipOf);
            pending.catch(() => this.clips.delete(key));
            this.clips.set(key, pending);
        }
        return pending;
    }

    private async motion(library: string, bundle: string | null): Promise<{ intro: Clip | null; introFace: Clip | null; loop: Clip | null; loopFace: Clip | null } | null> {
        if (!bundle) return null;
        const record = await this.part(library, bundle);
        const [intro, introFace, loop, loopFace] = await Promise.all(
            ["motion", "face", "motion_loop", "face_loop"].map(name => this.clip(library, bundle, record, name)),
        );
        return { intro, introFace, loop, loopFace };
    }

    /**
     * Shows a look. The look on stage stays until the new one is complete, then they swap in
     * one frame; an aborted load leaves the stage as it was. A look that differs only in
     * colour keeps the motion where it is.
     */
    async show({ library, variant, look, skin }: StageLoad, { signal, onProgress }: StageLoadOptions = {}): Promise<void> {
        const glb = (bundle: string | null | undefined): Promise<GLTF | null> => (bundle
            ? this.gltfLoader.loadAsync(`${library}${bundle}/model.glb`)
            : Promise.resolve(null));
        const tasks: Array<Promise<unknown>> = [
            glb(variant.bodyBundle), glb(look.face), glb(look.accessory?.bundle),
            this.colorTextures(library, variant.bodyColor), this.colorTextures(library, look.accessory?.color),
            this.motion(library, variant.motion),
            this.components(library, variant.bodyBundle), this.components(library, look.face),
        ];
        let done = 0;
        onProgress?.(0, tasks.length);
        for (const task of tasks) task.then(() => onProgress?.(++done, tasks.length), () => {});
        const [body, face, accessory, bodyColors, accessoryColors, motion, bodyComponents, faceComponents] = await Promise.all(tasks) as [
            GLTF | null, GLTF | null, GLTF | null, ColorTextures | null, ColorTextures | null, Awaited<ReturnType<Costume3dStage["motion"]>>,
            Costume3dComponent[], Costume3dComponent[],
        ];
        const texture = (file: string, srgb: boolean) => this.texture(file, srgb, library);
        await Promise.all([
            body && dress(body.scene, { kind: "body", skin, colors: bodyColors, texture }),
            face && dress(face.scene, { kind: "face", skin, colors: null, texture }),
            accessory && dress(accessory.scene, { kind: "accessory", skin, colors: accessoryColors, texture }),
        ]);
        const group = new THREE.Group();
        if (signal?.aborted || this.disposed) {
            for (const model of [body, face, accessory]) if (model) disposeGroup(model.scene);
            throw new Costume3dStageAbortedError();
        }

        group.position.y = STAGE_HEIGHT;
        const faceMeshes: THREE.Mesh[] = [];
        // The components name nodes by path below each prefab's root; the face's are found before
        // attachFace moves them, and the bones it shares with the body are the body's.
        const bodyRoot = body ? body.scene.getObjectByName("body") ?? body.scene : null;
        const physicsSources: PhysicsSource[] = [];
        if (bodyRoot && bodyComponents.length) {
            physicsSources.push({ components: bodyComponents, resolve: pinned(bodyComponents, resolverFor(bodyRoot)) });
        }
        if (bodyRoot && face && faceComponents.length) {
            const bodyNodes = new Map<string, THREE.Object3D>();
            bodyRoot.traverse(object => { if (object !== bodyRoot && !bodyNodes.has(object.name)) bodyNodes.set(object.name, object); });
            const faceRoot = face.scene.getObjectByName("face") ?? face.scene;
            physicsSources.push({ components: faceComponents, resolve: pinned(faceComponents, resolverFor(faceRoot, bodyNodes)) });
        }
        if (body) group.add(body.scene);
        if (face) {
            face.scene.traverse(object => {
                const mesh = object as THREE.Mesh;
                if (mesh.isMesh && mesh.morphTargetDictionary) faceMeshes.push(mesh);
            });
            group.add(face.scene);
            if (body) attachFace(body.scene, face.scene);
        }
        if (accessory) {
            const attach = look.accessory?.attach;
            let anchor: THREE.Object3D | null = null;
            group.traverse(object => { if (!anchor && attach && object.name === attach) anchor = object; });
            (anchor ?? group).add(accessory.scene);
        }
        const offsetValue = body?.scene.getObjectByName("OffsetValue");
        const positionOffset = body?.scene.getObjectByName("PositionOffset");
        if (offsetValue && positionOffset) positionOffset.position.copy(offsetValue.position);
        addOutlines(group);
        group.traverse(object => { if (object.userData.isOutline) object.visible = this.outlines; });

        // In the rest pose, before the motion: constraints keep the offsets they have here.
        const physics = physicsSources.length ? Costume3dPhysics.build(group, physicsSources) : null;
        const rig = bodyRoot ? rigOf(bodyRoot) : null;
        const pair = (bodyClip: Clip | null, faceClip: Clip | null): ClipPair | null => (rig && (bodyClip || faceClip)
            ? { body: bodyClip && bindClip(bodyClip, rig), face: faceClip && bindClip(faceClip, rig) }
            : null);
        const key = [variant.bodyBundle, look.face, look.accessory?.bundle ?? "", variant.motion ?? ""].join("|");
        const sameModels = this.current?.key === key;
        const { time, phase } = this.player;

        if (this.current) {
            this.scene.remove(this.current.group);
            disposeGroup(this.current.group);
        }
        this.scene.add(group);
        this.current = { group, key, physics };
        this.player.attach(rig, faceMeshes, pair(motion?.intro ?? null, motion?.introFace ?? null), pair(motion?.loop ?? null, motion?.loopFace ?? null));
        if (sameModels && phase !== "rest") {
            this.player.time = time;
            this.player.phase = phase;
            this.player.tick(0);
        } else if (this.playing) {
            this.player.reset();
            this.player.tick(0);
        } else {
            this.player.loopStart();
        }
        this.resetPhysics();
        void this.trimTextures(group);
    }

    dispose(): void {
        this.disposed = true;
        this.updateLoop();
        document.removeEventListener("visibilitychange", this.updateLoop);
        this.resizeObserver.disconnect();
        this.intersectionObserver.disconnect();
        this.controls.dispose();
        if (this.current) disposeGroup(this.current.group);
        for (const object of this.stageObjects) disposeGroup(object);
        this.platformTop.map?.dispose();
        this.platformSide.map?.dispose();
        for (const object of this.stageObjects.slice(1)) ((object as THREE.Mesh).material as THREE.MeshBasicMaterial).map?.dispose();
        for (const pending of this.textures.values()) void pending.then(texture => texture?.dispose());
        this.textures.clear();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.canvas.remove();
    }
}
