import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { AssetSourceType } from "@/contexts/ThemeContext";
import {
    getCustomFixtureAttachObjectPaths,
    getCustomFixtureAttachTexturePaths,
    getFixtureObjectPaths,
    getFixtureTexturePaths,
    getMusicJacketTexturePaths,
    getMysekaiCandidateRawUrls,
    getMysekaiCanvasCardTextureUrls,
    getMysekaiMasterDataUrls,
    getMysekaiMusicVocalAudioUrl,
    getMysekaiSoundTrackAudioUrl,
    getOutdoorGrassTexturePath,
    getRoomSkinDoorObjectPaths,
    getRoomSkinDoorTexturePaths,
    getRoomSkinFloorTexturePaths,
    getRoomSkinWallTexturePaths,
} from "./assets";
import {
    mdArrowDownward,
    mdArrowUpward,
    mdCenterFocusStrong,
    mdFullscreen,
    mdFullscreenExit,
    mdLock,
    mdLockOpen,
    mdPause,
    mdPlayArrow,
    mdRefresh,
} from "@/components/md3/icons";
import type {
    ExtractedMysekaiEntry,
    MysekaiCustomFixtureMaster,
    MysekaiFixtureMaster,
    MysekaiLayoutData,
    MysekaiLayoutItem,
    MysekaiLayoutPayload,
    MysekaiMusicMaster,
    MysekaiMusicPlayFixtureSetting,
    MysekaiMusicRecordMaster,
    MysekaiMusicSoundTrackMaster,
    MysekaiMusicVocalMaster,
    MysekaiPreviewOptions,
    MysekaiPreviewRuntimeMessages,
    MysekaiPreviewStatus,
    MysekaiRankReleaseMaster,
    MysekaiSceneSize,
    MysekaiSiteLayoutMaster,
    MysekaiSiteLevelMaster,
} from "./types";

const GLOBAL_SCALE = 4;
const MAX_RENDER_PIXEL_RATIO = 1.5;
const ALWAYS_ENABLED_LAYOUT_TYPES = ["floor", "rug", "road", "wall_left", "wall_right", "wall_front", "wall_back"];
const INDOOR_TYPES = ["floor", "rug", "wall_left", "wall_right", "wall_front", "wall_back"];
const SHADOW_Y_OFFSET = 0.07;
const ENTRY_BUILD_CONCURRENCY = 8;
const BGM_VOLUME_STORAGE_KEY = "mysekai-preview-bgm-volume";
const DEFAULT_BGM_VOLUME = 0.45;
const FREE_LOOK_PITCH_LIMIT = THREE.MathUtils.degToRad(85);
const FREE_LOOK_BASE_MOUSE_SENSITIVITY = 0.0022;
const FREE_LOOK_BASE_TOUCH_SENSITIVITY = 0.005;
const FREE_LOOK_MOVE_SPEED = 18;
const FREE_LOOK_FAST_MULTIPLIER = 1.75;
const FLOOR_STACKING_BBOX_XZ_OVERLAY_RATIO_THRESHOLD = 0.2;

type MysekaiViewMode = "free" | "fixed";

type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };

interface FreeLookBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
}

interface SavedMysekaiCameraState {
    cameraPos?: number[];
    controlsTarget?: number[];
    cameraUp?: number[];
    viewMode?: MysekaiViewMode;
    freeLookYaw?: number;
    freeLookPitch?: number;
}

const GATE_ASSET_BY_ID: Record<number, string> = {
    1: "mdl_non0006_gate_lon1",
    2: "mdl_non0006_gate_mmj1",
    3: "mdl_non0006_gate_vbs1",
    4: "mdl_non0006_gate_wns1",
    5: "mdl_non0006_gate_nig1",
};

interface RuntimeCallbacks {
    onStatus?: (status: MysekaiPreviewStatus) => void;
    onCycleSite?: () => void;
}

interface ResourcePick {
    url: string;
    source: AssetSourceType;
}

interface RoomSkinAssetInfo {
    asset: string;
    floorTexUrl?: string;
    wallTexUrl?: string;
    doorTexUrl?: string;
    doorObjUrls: string[];
}

interface MysekaiBackgroundMusicInfo {
    url: string;
    title: string;
    subtitle: string;
    fillerSec: number;
    kind: "music" | "music_sound_track";
    setting: MysekaiMusicPlayFixtureSetting;
}

const DEFAULT_RUNTIME_MESSAGES: MysekaiPreviewRuntimeMessages = {
    initializing: "Initializing...",
    loadingMasterLabel: "Loading master data",
    loadingMasterMessage: "Loading master data...",
    loadFailedLabel: "Load failed",
    loadFailedMessage: "Failed: {message}",
    fetchFailed: "Failed to load: {label}{detail}",
    noRoomData: "No usable room data was found in the layout response",
    modelLoadFailed: "Failed to load model: {url}",
    bgmRecordMissing: "BGM record not found: {id}",
    bgmRecordExternalIdMissing: "BGM record is missing externalId: {id}",
    soundtrackMissing: "Soundtrack BGM not found: {id}",
    soundtrackAssetMissing: "Soundtrack BGM is missing asset names: {id}",
    soundtrackFallbackTitle: "Soundtrack BGM {id}",
    soundtrackSubtitle: "Soundtrack BGM",
    musicMissing: "Song not found: {id}",
    missingInstrumental: "Instrumental audio was not found",
    missingVocal: "vocalId={id} audio was not found",
    defaultVocal: "default",
    musicFallbackTitle: "Song {id}",
    bgmLoadFailed: "Failed to load BGM",
    modelMissing: "Model missing: {asset}",
    preloadingModelsLabel: "Preloading model assets",
    preloadingModelsProgress: "Preloading models... {done}/{total}",
    readingLayoutLabel: "Reading layout",
    loadingLayoutMessage: "Loading layout...",
    instantiatingFurnitureLabel: "Instantiating furniture",
    instantiatingFurnitureProgress: "Instantiating furniture... {done}/{total}",
    emptyInstance: "Empty instance",
    finalizingSceneLabel: "Finalizing scene",
    completeLabel: "Loaded",
    defaultSiteLevel: "default",
    completeMessage: "Complete: {loaded}/{renderableTotal} renderable instances\nIgnored: {ignored}　Failed: {failed}\nsiteId={siteId}, rank={rank}, siteLevelId={siteLevelId}, size={width}x{depth}",
    fenceModelMissing: "Fence model missing: {asset}",
    fencePartsFailed: "Failed to identify fence parts: {asset}",
    modelNotPreloaded: "Model was not preloaded: {asset}",
    fenceModelNotPreloaded: "Fence model was not preloaded: {asset}",
    freeView: "Free View",
    fixedView: "Fixed View",
    pointerLock: "Lock Mouse",
    releasePointerLock: "Release Mouse Lock",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit Fullscreen",
    cycleLayout: "Switch Layout",
    playBgm: "Play BGM",
    pauseBgm: "Pause BGM: {title}",
    loadingBgm: "Loading BGM: {title}",
    playBgmTitle: "Play BGM: {title}",
    bgmErrorTitle: "BGM error: {message}",
    noBgmTitle: "No BGM is set for the current scene",
    bgmVolume: "BGM Volume",
    shortcutHint: "Shortcuts: WASD to move, Alt to lock mouse, F10 fullscreen, F8 switch scene.",
    mobileUp: "Move Up",
    mobileDown: "Move Down",
    bgmInfo: "BGM: {text}",
    noBgmInfo: "BGM: none for the current scene",
};

function interpolateRuntimeMessage(template: string, values?: Record<string, string | number | null | undefined>) {
    if (!values) return template;
    return template.replace(/\{([\w.-]+)\}/g, (match, token: string) => {
        const value = values[token];
        return value === null || value === undefined ? match : String(value);
    });
}

interface ExtractEntriesResult {
    entries: ExtractedMysekaiEntry[];
    playerRank: number;
    effectiveTypes: string[];
}

interface SurfaceAppearanceInfo {
    floor: MysekaiLayoutItem | null;
    wall: MysekaiLayoutItem | null;
}

interface FloorPlacementRecord {
    object: THREE.Object3D;
    bbox: THREE.Box3;
    bottomY: number;
    topY: number;
    cellKeys: string[];
    customPartType: string | null;
    putType: string | null;
}

interface FloorShadowRecord {
    object: THREE.Object3D;
    shadow: THREE.Mesh;
}

interface WallPlacedEntry {
    layoutType: string;
    object: THREE.Object3D;
    materials: THREE.Material[];
}

interface EntryBuildResult {
    index: number;
    entryGroup: THREE.Group | null;
    floorPlacementRecords: FloorPlacementRecord[];
    floorShadowRecords: FloorShadowRecord[];
    wallPlacedEntries: WallPlacedEntry[];
    error?: unknown;
}

interface ObjStats {
    url: string;
    volume: number;
    vertexCount: number;
}

interface FixtureRenderAsset {
    asset: string;
    isOrnament: boolean;
    useCustomAttachRoot: boolean;
}

interface EntryRenderAsset extends FixtureRenderAsset {
    handleType?: string;
    fixtureType?: string;
}

interface SceneModelAssetRef {
    key: string;
    asset: string;
    useCustomAttachRoot: boolean;
    handleType?: string;
    fixtureType?: string;
    isFence: boolean;
}

interface PreparedModelAsset {
    key: string;
    asset: string;
    source?: THREE.Group;
    fenceParts?: FencePartSet;
    primaryObjUrl?: string;
    error?: unknown;
}

interface StaticMergeBucket {
    material: THREE.Material;
    geometries: THREE.BufferGeometry[];
    meshes: THREE.Mesh[];
}

interface StaticMergeTarget {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
}

interface OrderedDitherMaterial extends THREE.Material {
    alphaTest: number;
    transparent: boolean;
    alphaHash: boolean;
    depthWrite: boolean;
    depthTest: boolean;
    userData: THREE.Material["userData"] & {
        _baseAlphaTest?: number;
        _orderedDitherReady?: boolean;
        _orderedDitherOpacity?: number;
        _orderedDitherPhaseX?: number;
        _orderedDitherPhaseY?: number;
        _orderedDitherShader?: { uniforms?: Record<string, { value: unknown }> };
    };
}

interface FencePartSet {
    post: THREE.Group;
    beamShort: THREE.Group;
    beamLong: THREE.Group;
    baseDir: "-x";
}

type FenceDirection = "+x" | "-x" | "+z" | "-z";

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await worker(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]> {
    return object instanceof THREE.Mesh;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
    if (Array.isArray(material)) {
        for (const item of material) item.dispose();
        return;
    }
    material.dispose();
}

function disposeObject(root: THREE.Object3D) {
    root.traverse((object) => {
        if (!isMesh(object)) return;
        object.geometry.dispose();
        disposeMaterial(object.material);
    });
}

function normalizeFiniteNumber(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function modPos(value: number, mod: number): number {
    return ((value % mod) + mod) % mod;
}

function mapLayoutToScenePos(position: { x?: number; y?: number; z?: number } | undefined) {
    return {
        x: normalizeFiniteNumber(position?.x),
        y: normalizeFiniteNumber(position?.y),
        z: -normalizeFiniteNumber(position?.z),
    };
}

function mapLayoutToSceneRotDeg(rotation: unknown): number {
    return -normalizeFiniteNumber(rotation);
}

function isShadowObjUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes("shadow") || lower.includes("_sdw") || lower.includes("kage");
}

function getDollSizeValue(sizeName: string): number | null {
    if (sizeName === "small") return 0.8;
    if (sizeName === "medium") return 1.1;
    if (sizeName === "large") return 2;
    return null;
}

function parseDollSizeFromName(name: string | undefined): string | null {
    const lower = String(name || "").toLowerCase();
    const match = lower.match(/mdl_pas\d+_fixture_doll\d+(small|medium|large)/);
    return match ? match[1] : null;
}

function applyDollFixtureSizeCorrection(object: THREE.Object3D, assetName: string) {
    const targetSize = parseDollSizeFromName(assetName);
    if (!targetSize) return;

    const weighted: Record<string, number> = { small: 0, medium: 0, large: 0 };
    object.traverse((node) => {
        if (!isMesh(node)) return;
        const detected = parseDollSizeFromName(node.name);
        if (!detected) return;
        weighted[detected] += node.geometry.attributes.position?.count ?? 0;
    });

    let sourceSize: string | null = null;
    let best = 0;
    for (const key of ["small", "medium", "large"]) {
        if (weighted[key] > best) {
            best = weighted[key];
            sourceSize = key;
        }
    }

    if (!sourceSize || sourceSize === targetSize) return;
    const sourceValue = getDollSizeValue(sourceSize);
    const targetValue = getDollSizeValue(targetSize);
    if (!(sourceValue && targetValue)) return;
    object.scale.multiplyScalar(targetValue / sourceValue);
}

function locateObject(
    object: THREE.Object3D,
    x: number,
    z: number,
    y: number,
    width: number,
    depth: number,
    _height: number,
    rotationYRad: number,
    layoutType: string,
): THREE.Object3D {
    let x0 = x;
    let z0 = z;
    let x1 = x0;
    let z1 = z0;
    const widthOdd = width % 2 === 1;
    const depthOdd = depth % 2 === 1;

    if (!layoutType.startsWith("wall_")) {
        x0 += widthOdd ? 0.5 : 1;
        z0 -= depthOdd ? 0.5 : 1;
        x1 = x0;
        z1 = z0;
        if (widthOdd !== depthOdd) {
            if (width > depth) z1 -= 0.5;
            else x1 += 0.5;
        }
    } else {
        const wallWidth = Math.max(width, depth);
        if (wallWidth % 2 === 1) {
            if (layoutType === "wall_back") x0 -= 0.5;
            else if (layoutType === "wall_front") x0 += 0.5;
            else if (layoutType === "wall_left") z0 += 0.5;
            else if (layoutType === "wall_right") z0 -= 0.5;
        }
        x1 = x0;
        z1 = z0;
    }

    object.scale.multiplyScalar(GLOBAL_SCALE);
    object.rotateY(Math.PI);
    object.position.set(x0, y, z0);

    const pivotRotate = new THREE.Matrix4()
        .makeTranslation(x1, 0, z1)
        .multiply(new THREE.Matrix4().makeRotationY(rotationYRad))
        .multiply(new THREE.Matrix4().makeTranslation(-x1, 0, -z1));
    object.applyMatrix4(pivotRotate);
    object.updateMatrixWorld(true);
    return object;
}

function captureWorldBBox(object: THREE.Object3D): THREE.Box3 {
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object);
}

function getXZCellKeysFromBBox(bbox: THREE.Box3): string[] {
    const minX = Math.floor(bbox.min.x + 0.5);
    const maxX = Math.ceil(bbox.max.x + 0.5);
    const minZ = Math.floor(bbox.min.z + 0.5);
    const maxZ = Math.ceil(bbox.max.z + 0.5);
    const keys: string[] = [];
    for (let x = minX; x < maxX; x++) {
        for (let z = minZ; z < maxZ; z++) {
            keys.push(`${x},${z}`);
        }
    }
    return keys;
}

function computeXZSize(object: THREE.Object3D): { x: number; z: number } {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    return { x: size.x, z: size.z };
}

function inferFencePartRole(group: THREE.Object3D): "post" | "short" | "long" | null {
    const names: string[] = [];
    group.traverse((object) => {
        if (object.name) names.push(String(object.name).toLowerCase());
    });
    const blob = names.join(" ");
    if (blob.includes("wing_long")) return "long";
    if (blob.includes("wing_short")) return "short";
    if (blob.includes("pole_center") || blob.includes("mdl_pole")) return "post";
    return null;
}

function yawFromBaseToTarget(baseDir: FenceDirection, targetDir: FenceDirection): number {
    const order: FenceDirection[] = ["+x", "-z", "-x", "+z"];
    return ((order.indexOf(targetDir) - order.indexOf(baseDir)) * Math.PI) / 2;
}

function calcBBoxXZAreaOverlayRatio(a: THREE.Box3, b: THREE.Box3): number {
    const minX = Math.max(a.min.x, b.min.x);
    const maxX = Math.min(a.max.x, b.max.x);
    const minZ = Math.max(a.min.z, b.min.z);
    const maxZ = Math.min(a.max.z, b.max.z);
    if (minX > maxX || minZ > maxZ) return 0;
    const areaA = (a.max.x - a.min.x) * (a.max.z - a.min.z);
    const areaB = (b.max.x - b.min.x) * (b.max.z - b.min.z);
    const denom = Math.min(areaA, areaB);
    if (!(denom > 1e-12)) return 0;
    return ((maxX - minX) * (maxZ - minZ)) / denom;
}

function createSkyGradientBackground(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(canvas);
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#5ea8ff");
    grad.addColorStop(0.38, "#8fc8ff");
    grad.addColorStop(0.72, "#c6e6ff");
    grad.addColorStop(1, "#eef7ff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export class MysekaiScenePreviewRuntime {
    private readonly container: HTMLElement;
    private readonly axesContainer: HTMLElement;
    private readonly callbacks: RuntimeCallbacks;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly axesRenderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly axesScene = new THREE.Scene();
    private readonly camera: THREE.PerspectiveCamera;
    private readonly axesCamera: THREE.PerspectiveCamera;
    private readonly controls: OrbitControls;
    private readonly ambientLight = new THREE.AmbientLight(0xffffff, 2);
    private readonly directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    private readonly contentGroup = new THREE.Group();
    private readonly textureLoader = new THREE.TextureLoader();
    private readonly objLoader = new OBJLoader();
    private readonly objTextCache = new Map<string, string>();
    private readonly objTextPromiseCache = new Map<string, Promise<string | null>>();
    private readonly objGroupCache = new Map<string, THREE.Group>();
    private readonly objGroupPromiseCache = new Map<string, Promise<THREE.Group>>();
    private readonly objStatsCache = new Map<string, ObjStats>();
    private readonly objStatsPromiseCache = new Map<string, Promise<ObjStats>>();
    private readonly fenceAssetPartPromiseCache = new Map<string, Promise<FencePartSet>>();
    private readonly textureCache = new Map<string, THREE.Texture>();
    private readonly texturePromiseCache = new Map<string, Promise<THREE.Texture | null>>();
    private readonly fixtureMetaMap = new Map<number, MysekaiFixtureMaster>();
    private readonly customFixtureMetaMap = new Map<number, MysekaiCustomFixtureMaster>();
    private readonly cardAssetById = new Map<number, string>();
    private readonly cardCharacterIdById = new Map<number, number>();
    private readonly musicRecordById = new Map<number, MysekaiMusicRecordMaster>();
    private readonly musicInfoById = new Map<number, MysekaiMusicMaster>();
    private readonly musicSoundTrackById = new Map<number, MysekaiMusicSoundTrackMaster>();
    private readonly musicVocalById = new Map<number, MysekaiMusicVocalMaster>();
    private readonly musicVocalsByMusicId = new Map<number, MysekaiMusicVocalMaster[]>();
    private readonly externalMusicIdByMysekaiMusicRecordId = new Map<number, number>();
    private readonly musicAssetById = new Map<number, string>();
    private readonly indoorWallPlanes: THREE.Mesh[] = [];
    private readonly wallPlacedEntries: WallPlacedEntry[] = [];
    private readonly lastBackFacingCamPos = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    private readonly lastBackFacingCamQuat = new THREE.Quaternion();
    private readonly keyState = { w: false, s: false, a: false, d: false, space: false, shift: false, mobileUp: false, mobileDown: false };
    private readonly freeLookMoveVector = new THREE.Vector3();
    private controlsOverlay: HTMLDivElement | null = null;
    private crosshairElement: HTMLDivElement | null = null;
    private pointerLockButton: HTMLButtonElement | null = null;
    private fullscreenButton: HTMLButtonElement | null = null;
    private cycleSiteButton: HTMLButtonElement | null = null;
    private bgmButton: HTMLButtonElement | null = null;
    private bgmInfoElement: HTMLDivElement | null = null;
    private bgmVolumeInput: HTMLInputElement | null = null;
    private hintElement: HTMLDivElement | null = null;
    private mobileControlsElement: HTMLDivElement | null = null;
    private joystickKnobElement: HTMLDivElement | null = null;
    private fullscreenHost: HTMLElement | null = null;
    private fullscreenRestoreStyle: Partial<CSSStyleDeclaration> | null = null;
    private currentSiteSize: MysekaiSceneSize = { width: 80, depth: 80, height: 10 };
    private viewMode: MysekaiViewMode = "free";
    private freeLookYaw = -Math.PI * 0.25;
    private freeLookPitch = -0.45;
    private pointerLocked = false;
    private mouseLookDragging = false;
    private isFullscreen = false;
    private isPseudoFullscreen = false;
    private lastTickTime = 0;
    private joystickPointerId: number | null = null;
    private joystickOrigin = { x: 0, y: 0 };
    private joystickVector = { x: 0, y: 0 };
    private lookPointerId: number | null = null;
    private lastLookPoint = { x: 0, y: 0 };
    private rankReleases: MysekaiRankReleaseMaster[] = [];
    private siteLevels: MysekaiSiteLevelMaster[] = [];
    private siteLayouts: MysekaiSiteLayoutMaster[] = [];
    private gridMinor: THREE.LineSegments | null = null;
    private gridMajor: THREE.LineSegments | null = null;
    private indoorWallGridMinor: THREE.LineSegments | null = null;
    private indoorWallGridMajor: THREE.LineSegments | null = null;
    private indoorDoorObject: THREE.Object3D | null = null;
    private backFacingOpacityDirty = true;
    private lastBackFacingOpacity = Number.NaN;
    private lastBackFacingSiteId = Number.NaN;
    private grass: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    private floorShadowTexture: THREE.CanvasTexture | null = null;
    private axisHelper: THREE.AxesHelper;
    private rafId = 0;
    private renderPending = false;
    private continuousRenderUntil = 0;
    private disposed = false;
    private reloadGeneration = 0;
    private masterLoaded = false;
    private cardsLoaded = false;
    private musicLoaded = false;
    private fullMusicLoaded = false;
    private restoredCameraState = false;
    private bgmAudio: HTMLAudioElement | null = null;
    private currentBgm: MysekaiBackgroundMusicInfo | null = null;
    private bgmLoading = false;
    private bgmPlaying = false;
    private bgmError: string | null = null;
    private bgmUserWantsPlay = false;
    private bgmVolume = DEFAULT_BGM_VOLUME;
    private options: MysekaiPreviewOptions;
    private currentStatus: MysekaiPreviewStatus = { phase: "idle", message: DEFAULT_RUNTIME_MESSAGES.initializing, loaded: 0, total: 0, skipped: 0 };

    constructor(container: HTMLElement, axesContainer: HTMLElement, options: MysekaiPreviewOptions, callbacks: RuntimeCallbacks = {}) {
        this.container = container;
        this.axesContainer = axesContainer;
        this.options = { ...options, messages: { ...DEFAULT_RUNTIME_MESSAGES, ...options.messages } };
        this.callbacks = callbacks;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_RENDER_PIXEL_RATIO));
        this.renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
        this.renderer.domElement.className = "absolute inset-0 h-full w-full";
        container.appendChild(this.renderer.domElement);

        try {
            this.axesRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch (error) {
            // The caller only sees the throw: leave no canvas or live context behind.
            this.renderer.domElement.remove();
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            throw error;
        }
        this.axesRenderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_RENDER_PIXEL_RATIO));
        this.axesRenderer.setSize(axesContainer.clientWidth || 1, axesContainer.clientHeight || 1);
        this.axesRenderer.domElement.className = "absolute inset-0 h-full w-full";
        axesContainer.appendChild(this.axesRenderer.domElement);

        this.textureLoader.setCrossOrigin("anonymous");
        this.bgmVolume = this.readSavedBgmVolume();
        this.scene.background = createSkyGradientBackground();
        this.camera = new THREE.PerspectiveCamera(55, (container.clientWidth || 1) / (container.clientHeight || 1), 0.1, 1400);
        this.camera.position.set(60, 45, 60);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 0, 0);
        this.controls.enableDamping = true;
        this.controls.minDistance = 0.05;
        this.controls.addEventListener("change", this.handleControlsChange);
        this.controls.addEventListener("start", this.handleControlsStart);
        this.controls.addEventListener("end", this.handleControlsEnd);
        this.controls.enabled = this.viewMode === "fixed";

        this.axesCamera = new THREE.PerspectiveCamera(50, (axesContainer.clientWidth || 1) / (axesContainer.clientHeight || 1), 0.1, 10);
        this.axisHelper = new THREE.AxesHelper(1.2);
        this.axesScene.add(this.axisHelper);

        this.directionalLight.position.set(50, 120, 30);
        this.scene.add(this.ambientLight, this.directionalLight, this.contentGroup);
        this.grass = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ color: 0x8fb77a, side: THREE.DoubleSide }),
        );
        this.grass.rotation.x = -Math.PI * 0.5;
        this.grass.visible = false;
        this.scene.add(this.grass);

        const originMarker = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 14, 10),
            new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.95 }),
        );
        originMarker.userData.debugOnly = true;
        this.scene.add(originMarker);

        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        window.addEventListener("resize", this.handleResize);
        document.addEventListener("pointerlockchange", this.handlePointerLockChange);
        document.addEventListener("fullscreenchange", this.handleFullscreenChange);
        document.addEventListener("webkitfullscreenchange", this.handleFullscreenChange);
        this.renderer.domElement.addEventListener("mousedown", this.handleCanvasMouseDown);
        window.addEventListener("mousemove", this.handleMouseMove);
        window.addEventListener("mouseup", this.handleMouseUp);
        window.addEventListener("beforeunload", this.saveCameraState);
        this.createControlsOverlay();
        this.loadCameraState();
        this.applyViewMode(this.viewMode, false);
        this.handleResize();
        this.requestRender();
    }

    updateOptions(options: MysekaiPreviewOptions) {
        const oldSiteId = this.options.siteId;
        const oldLayoutUrl = this.options.layoutUrl;
        const oldLayoutData = this.options.layoutData;
        const oldLayoutKey = this.options.layoutKey;
        const oldAssetSource = this.options.assetSource;
        this.options = { ...options, messages: { ...DEFAULT_RUNTIME_MESSAGES, ...options.messages } };
        this.applyDebugVisibility();
        this.applyShadowVisibility();
        this.markBackFacingOpacityDirty();
        this.applyBackFacingOpacity();
        this.refreshOverlayTexts();
        this.refreshOverlayState();
        this.requestRender();
        if (
            oldSiteId !== options.siteId
            || oldLayoutUrl !== options.layoutUrl
            || oldLayoutData !== options.layoutData
            || oldLayoutKey !== options.layoutKey
            || oldAssetSource !== options.assetSource
        ) {
            void this.reload(false);
        }
    }

    async reload(forceFreshLayout = true) {
        if (this.disposed) return;
        const generation = ++this.reloadGeneration;
        try {
            this.saveCameraState();
            this.setStatusForReload(generation, { phase: "loading", stage: "master", stageLabel: this.options.messages.loadingMasterLabel, progress: 3, message: this.options.messages.loadingMasterMessage, loaded: 0, total: 0, skipped: 0, ignored: 0, failed: 0 });
            await this.ensureMasterDataLoaded();
            if (!this.isReloadActive(generation)) return;
            await this.buildScene(forceFreshLayout, generation);
        } catch (error) {
            if (!this.isReloadActive(generation)) return;
            console.error(error);
            this.setStatusForReload(generation, { phase: "error", stage: "error", stageLabel: this.options.messages.loadFailedLabel, progress: 100, message: interpolateRuntimeMessage(this.options.messages.loadFailedMessage, { message: errorMessage(error) }), loaded: 0, total: 0, skipped: 0, ignored: 0, failed: 1 });
        }
    }

    resetCamera() {
        this.restoredCameraState = false;
        this.controls.target.set(0, 0, 0);
        this.camera.position.set(60, 45, 60);
        this.camera.up.set(0, 1, 0);
        this.syncFreeLookAnglesFromCamera();
        this.applyFreeLookRotation();
        this.controls.update();
        this.saveCameraState();
        this.requestRender();
    }

    dispose() {
        this.disposed = true;
        this.reloadGeneration++;
        cancelAnimationFrame(this.rafId);
        this.stopBgmAudio(true);
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        window.removeEventListener("resize", this.handleResize);
        document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
        document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
        document.removeEventListener("webkitfullscreenchange", this.handleFullscreenChange);
        this.renderer.domElement.removeEventListener("mousedown", this.handleCanvasMouseDown);
        window.removeEventListener("mousemove", this.handleMouseMove);
        window.removeEventListener("mouseup", this.handleMouseUp);
        window.removeEventListener("beforeunload", this.saveCameraState);
        this.exitPointerLock();
        this.exitPseudoFullscreen();
        this.controlsOverlay?.remove();
        this.controlsOverlay = null;
        this.controls.removeEventListener("change", this.handleControlsChange);
        this.controls.removeEventListener("start", this.handleControlsStart);
        this.controls.removeEventListener("end", this.handleControlsEnd);
        this.controls.dispose();
        this.clearContent();
        this.clearGrid();
        this.clearIndoorWalls();
        disposeObject(this.grass);
        this.scene.remove(this.grass);
        this.textureCache.forEach((texture) => texture.dispose());
        this.floorShadowTexture?.dispose();
        this.renderer.dispose();
        this.axesRenderer.dispose();
        this.renderer.domElement.remove();
        this.axesRenderer.domElement.remove();
    }

    private setStatus(status: MysekaiPreviewStatus) {
        this.currentStatus = status;
        this.callbacks.onStatus?.(status);
    }

    private mergeStatus(partial: Partial<MysekaiPreviewStatus>) {
        this.setStatus({ ...this.currentStatus, ...partial });
    }

    private isReloadActive(generation: number) {
        return !this.disposed && generation === this.reloadGeneration;
    }

    private setStatusForReload(generation: number, status: MysekaiPreviewStatus) {
        if (!this.isReloadActive(generation)) return;
        this.setStatus(status);
    }

    private mergeStatusForReload(generation: number, partial: Partial<MysekaiPreviewStatus>) {
        if (!this.isReloadActive(generation)) return;
        this.mergeStatus(partial);
    }

    private disposeBuildResults(results: EntryBuildResult[]) {
        for (const result of results) {
            if (result.entryGroup) disposeObject(result.entryGroup);
        }
    }

    private async fetchJson<T>(urls: string[], label: string, forceFresh = false): Promise<T> {
        let lastError = "";
        for (const baseUrl of urls) {
            const url = forceFresh ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}_ts=${Date.now()}` : baseUrl;
            try {
                const response = await fetch(url, forceFresh ? { cache: "no-store" } : undefined);
                if (!response.ok) {
                    lastError = `${response.status} ${response.statusText}`;
                    continue;
                }
                return await response.json() as T;
            } catch (error) {
                lastError = errorMessage(error);
            }
        }
        throw new Error(interpolateRuntimeMessage(this.options.messages.fetchFailed, { label, detail: lastError ? ` (${lastError})` : "" }));
    }

    private normalizeLayoutPayload(payload: MysekaiLayoutPayload): MysekaiLayoutData | MysekaiLayoutData[] {
        if (Array.isArray(payload)) return payload;
        if (payload && typeof payload === "object" && "room" in payload) {
            const room = payload.room;
            if (Array.isArray(room) || (room && typeof room === "object")) return room as MysekaiLayoutData | MysekaiLayoutData[];
            throw new Error(this.options.messages.noRoomData);
        }
        return payload as MysekaiLayoutData;
    }

    private async loadLayoutPayload(forceFreshLayout: boolean): Promise<MysekaiLayoutData | MysekaiLayoutData[]> {
        if (this.options.layoutData) return this.normalizeLayoutPayload(this.options.layoutData);
        const payload = await this.fetchJson<MysekaiLayoutPayload>([this.options.layoutUrl], this.options.layoutUrl, forceFreshLayout);
        return this.normalizeLayoutPayload(payload);
    }

    private async ensureMasterDataLoaded() {
        if (this.masterLoaded) return;
        const source = this.options.assetSource;
        const [fixtures, customFixtures, rankReleases, siteLevels, siteLayouts] = await Promise.all([
            this.fetchJson<MysekaiFixtureMaster[]>(getMysekaiMasterDataUrls("mysekaiFixtures.json", source), "mysekaiFixtures.json"),
            this.fetchJson<MysekaiCustomFixtureMaster[]>(getMysekaiMasterDataUrls("mysekaiCustomFixtures.json", source), "mysekaiCustomFixtures.json"),
            this.fetchJson<MysekaiRankReleaseMaster[]>(getMysekaiMasterDataUrls("mysekaiRankReleases.json", source), "mysekaiRankReleases.json"),
            this.fetchJson<MysekaiSiteLevelMaster[]>(getMysekaiMasterDataUrls("mysekaiSiteLevels.json", source), "mysekaiSiteLevels.json"),
            this.fetchJson<MysekaiSiteLayoutMaster[]>(getMysekaiMasterDataUrls("mysekaiSiteLayouts.json", source), "mysekaiSiteLayouts.json"),
        ]);
        this.fixtureMetaMap.clear();
        this.customFixtureMetaMap.clear();
        for (const fixture of fixtures || []) this.fixtureMetaMap.set(Number(fixture.id), fixture);
        for (const custom of customFixtures || []) this.customFixtureMetaMap.set(Number(custom.id), custom);
        this.rankReleases = rankReleases || [];
        this.siteLevels = siteLevels || [];
        this.siteLayouts = siteLayouts || [];
        this.masterLoaded = true;
    }

    private async ensureCardsLoaded() {
        if (this.cardsLoaded) return;
        const cards = await this.fetchJson<Array<{ id?: number; characterId?: number; assetbundleName?: string }>>(getMysekaiMasterDataUrls("cards.json", this.options.assetSource), "cards.json");
        this.cardAssetById.clear();
        this.cardCharacterIdById.clear();
        for (const card of cards || []) {
            this.cardAssetById.set(Number(card.id), String(card.assetbundleName || ""));
            this.cardCharacterIdById.set(Number(card.id), Number(card.characterId || 0));
        }
        this.cardsLoaded = true;
    }

    private async ensureMusicDataLoaded() {
        if (this.musicLoaded) return;
        const [records, musics] = await Promise.all([
            this.fetchJson<MysekaiMusicRecordMaster[]>(getMysekaiMasterDataUrls("mysekaiMusicRecords.json", this.options.assetSource), "mysekaiMusicRecords.json"),
            this.fetchJson<MysekaiMusicMaster[]>(getMysekaiMasterDataUrls("musics.json", this.options.assetSource), "musics.json"),
        ]);
        this.musicRecordById.clear();
        this.musicInfoById.clear();
        this.externalMusicIdByMysekaiMusicRecordId.clear();
        this.musicAssetById.clear();
        for (const record of records || []) {
            const recordId = Number(record.id);
            this.musicRecordById.set(recordId, record);
            if (record.mysekaiMusicTrackType === "music" || !record.mysekaiMusicTrackType) {
                this.externalMusicIdByMysekaiMusicRecordId.set(recordId, Number(record.externalId));
            }
        }
        for (const music of musics || []) {
            const musicId = Number(music.id);
            this.musicInfoById.set(musicId, music);
            this.musicAssetById.set(musicId, String(music.assetbundleName || ""));
        }
        this.musicLoaded = true;
    }

    private async ensureFullMusicDataLoaded() {
        if (this.fullMusicLoaded) return;
        await this.ensureMusicDataLoaded();
        const [soundTracks, vocals] = await Promise.all([
            this.fetchJson<MysekaiMusicSoundTrackMaster[]>(getMysekaiMasterDataUrls("musicSoundTracks.json", this.options.assetSource), "musicSoundTracks.json"),
            this.fetchJson<MysekaiMusicVocalMaster[]>(getMysekaiMasterDataUrls("musicVocals.json", this.options.assetSource), "musicVocals.json"),
        ]);
        this.musicSoundTrackById.clear();
        this.musicVocalById.clear();
        this.musicVocalsByMusicId.clear();
        for (const track of soundTracks || []) this.musicSoundTrackById.set(Number(track.id), track);
        for (const vocal of vocals || []) {
            const vocalId = Number(vocal.id);
            const musicId = Number(vocal.musicId);
            this.musicVocalById.set(vocalId, vocal);
            const list = this.musicVocalsByMusicId.get(musicId) || [];
            list.push(vocal);
            this.musicVocalsByMusicId.set(musicId, list);
        }
        for (const list of this.musicVocalsByMusicId.values()) {
            list.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
        }
        this.fullMusicLoaded = true;
    }

    private async fetchTextFirst(urls: string[]): Promise<ResourcePick | null> {
        const picks = await Promise.all(urls.map(async (url) => {
            const text = await this.fetchObjText(url);
            return text ? { url, source: this.options.assetSource } : null;
        }));
        return picks.find((pick): pick is ResourcePick => !!pick) ?? null;
    }

    private fetchObjText(url: string): Promise<string | null> {
        const cached = this.objTextCache.get(url);
        if (cached) return Promise.resolve(cached);
        const inflight = this.objTextPromiseCache.get(url);
        if (inflight) return inflight;
        const promise = fetch(url)
            .then(async (response) => {
                if (!response.ok) return null;
                const text = await response.text();
                if (!text.trim()) return null;
                this.objTextCache.set(url, text);
                return text;
            })
            .catch(() => null)
            .finally(() => {
                this.objTextPromiseCache.delete(url);
            });
        this.objTextPromiseCache.set(url, promise);
        return promise;
    }

    private getObjCandidateUrls(assetName: string, useCustomAttachRoot: boolean, handleType?: string, fixtureType?: string): string[] {
        const paths = useCustomAttachRoot
            ? getCustomFixtureAttachObjectPaths(assetName)
            : getFixtureObjectPaths(assetName, handleType, fixtureType);
        return paths.flatMap((path) => getMysekaiCandidateRawUrls(path, this.options.assetSource));
    }

    private async getObjSourceGroup(url: string): Promise<THREE.Group> {
        const cached = this.objGroupCache.get(url);
        if (cached) return cached;
        const inflight = this.objGroupPromiseCache.get(url);
        if (inflight) return inflight;
        const promise = (async () => {
            let text = this.objTextCache.get(url);
            if (!text) {
                text = await this.fetchObjText(url) ?? undefined;
                if (!text) throw new Error(interpolateRuntimeMessage(this.options.messages.modelLoadFailed, { url }));
            }
            const group = this.objLoader.parse(text);
            this.objGroupCache.set(url, group);
            return group;
        })().finally(() => {
            this.objGroupPromiseCache.delete(url);
        });
        this.objGroupPromiseCache.set(url, promise);
        return promise;
    }

    private async getObjGroup(url: string): Promise<THREE.Group> {
        return (await this.getObjSourceGroup(url)).clone(true);
    }

    private async getObjStats(url: string): Promise<ObjStats> {
        const cached = this.objStatsCache.get(url);
        if (cached) return cached;
        const inflight = this.objStatsPromiseCache.get(url);
        if (inflight) return inflight;
        const promise = (async () => {
            const group = await this.getObjSourceGroup(url);
            const box = new THREE.Box3().setFromObject(group);
            const size = new THREE.Vector3();
            box.getSize(size);
            let vertexCount = 0;
            group.traverse((node) => {
                if (!isMesh(node)) return;
                vertexCount += node.geometry.attributes.position?.count ?? 0;
            });
            const stats = {
                url,
                volume: Math.max(0, size.x) * Math.max(0, size.y) * Math.max(0, size.z),
                vertexCount,
            };
            this.objStatsCache.set(url, stats);
            return stats;
        })().finally(() => {
            this.objStatsPromiseCache.delete(url);
        });
        this.objStatsPromiseCache.set(url, promise);
        return promise;
    }

    private async pickPrimaryObjUrl(urls: string[]): Promise<string | null> {
        const filtered = urls.filter((url) => !isShadowObjUrl(url));
        const candidates = filtered.length ? filtered : urls;
        const picks = await Promise.all(candidates.map((url) => this.fetchTextFirst([url])));
        const existing = picks.filter((pick): pick is ResourcePick => !!pick).map((pick) => pick.url);
        if (!existing.length) return null;
        const stats = await Promise.all(existing.map((url) => this.getObjStats(url)));
        stats.sort((a, b) => {
            const volumeDiff = b.volume - a.volume;
            if (Math.abs(volumeDiff) > 1e-6) return volumeDiff;
            const vertexDiff = b.vertexCount - a.vertexCount;
            if (vertexDiff !== 0) return vertexDiff;
            return a.url.localeCompare(b.url);
        });
        return stats[0].url;
    }

    private async getTextureFromUrls(urls: string[]): Promise<THREE.Texture | null> {
        for (const url of Array.from(new Set(urls))) {
            const texture = await this.getTextureFromUrl(url);
            if (texture) return texture;
        }
        return null;
    }

    private getTextureFromUrl(url: string): Promise<THREE.Texture | null> {
        const cached = this.textureCache.get(url);
        if (cached) return Promise.resolve(cached);
        const inflight = this.texturePromiseCache.get(url);
        if (inflight) return inflight;
        const promise = this.textureLoader.loadAsync(url)
            .then((texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.flipY = true;
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                this.textureCache.set(url, texture);
                return texture;
            })
            .catch(() => null)
            .finally(() => {
                this.texturePromiseCache.delete(url);
            });
        this.texturePromiseCache.set(url, promise);
        return promise;
    }

    private async getFixtureTexture(assetName: string, textureId: number, useCustomAttachRoot: boolean, handleType?: string): Promise<THREE.Texture | null> {
        const paths = useCustomAttachRoot
            ? getCustomFixtureAttachTexturePaths(assetName, textureId)
            : getFixtureTexturePaths(assetName, textureId, handleType);
        return this.getTextureFromUrls(paths.flatMap((path) => getMysekaiCandidateRawUrls(path, this.options.assetSource)));
    }

    private createFallbackTexture(color = "#cfd3d8"): THREE.CanvasTexture {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 64, 64);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    private prepareDisplayTexture(texture: THREE.Texture): THREE.Texture {
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.set(1, 1);
        texture.offset.set(0, 0);
        texture.needsUpdate = true;
        return texture;
    }

    private async getCanvasCardTexture(item: MysekaiLayoutItem, fixtureId: number): Promise<THREE.Texture> {
        const cardId = Number(item.cardId || 0);
        if (!cardId) return this.createFallbackTexture();
        await this.ensureCardsLoaded();
        const cardAsset = this.cardAssetById.get(cardId);
        if (!cardAsset) return this.createFallbackTexture();
        const texture = await this.getTextureFromUrls(getMysekaiCanvasCardTextureUrls(cardAsset, !!item.isSpecialTraining, fixtureId, this.options.assetSource));
        return texture ? this.prepareDisplayTexture(texture) : this.createFallbackTexture();
    }

    private async getRecordJacketTexture(item: MysekaiLayoutItem): Promise<THREE.Texture> {
        const recordId = Number(item.mysekaiMusicRecordId || 0);
        if (!recordId) return this.createFallbackTexture();
        await this.ensureMusicDataLoaded();
        const musicId = this.externalMusicIdByMysekaiMusicRecordId.get(recordId);
        if (!musicId) return this.createFallbackTexture();
        const musicAsset = this.musicAssetById.get(musicId);
        if (!musicAsset) return this.createFallbackTexture();
        const texture = await this.getTextureFromUrls(getMusicJacketTexturePaths(musicAsset, this.options.assetSource));
        return texture ? this.prepareDisplayTexture(texture) : this.createFallbackTexture();
    }

    private selectMusicVocalForBgm(musicId: number, setting: MysekaiMusicPlayFixtureSetting): MysekaiMusicVocalMaster | null {
        const allVocals = this.musicVocalsByMusicId.get(musicId) || [];
        if (setting.isInstrumental) {
            return allVocals.find((vocal) => vocal.musicVocalType === "instrumental") ?? null;
        }
        const requested = this.musicVocalById.get(Number(setting.musicVocalId || 0));
        if (requested && Number(requested.musicId) === musicId && requested.assetbundleName) return requested;
        return allVocals.find((vocal) => vocal.musicVocalType !== "instrumental" && !!vocal.assetbundleName) ?? null;
    }

    private getCurrentSiteBgmSetting(layoutData: MysekaiLayoutData | MysekaiLayoutData[], siteId: number): MysekaiMusicPlayFixtureSetting | null {
        if (Array.isArray(layoutData)) return null;
        return layoutData.userMysekaiMusicPlayFixtureSettings?.find((item) => Number(item.mysekaiSiteId) === siteId) ?? null;
    }

    private readSavedBgmVolume(): number {
        try {
            const raw = localStorage.getItem(BGM_VOLUME_STORAGE_KEY);
            const value = raw === null ? DEFAULT_BGM_VOLUME : Number(raw);
            return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_BGM_VOLUME;
        } catch {
            return DEFAULT_BGM_VOLUME;
        }
    }

    private saveBgmVolume() {
        try {
            localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(this.bgmVolume));
        } catch {
            // ignore localStorage failures
        }
    }

    private async resolveBackgroundMusic(layoutData: MysekaiLayoutData | MysekaiLayoutData[], siteId: number): Promise<MysekaiBackgroundMusicInfo | null> {
        const setting = this.getCurrentSiteBgmSetting(layoutData, siteId);
        if (!setting?.mysekaiMusicRecordId) return null;
        await this.ensureFullMusicDataLoaded();
        const recordId = Number(setting.mysekaiMusicRecordId || 0);
        const record = this.musicRecordById.get(recordId);
        if (!record) throw new Error(interpolateRuntimeMessage(this.options.messages.bgmRecordMissing, { id: recordId }));
        const externalId = Number(record.externalId || 0);
        if (!externalId) throw new Error(interpolateRuntimeMessage(this.options.messages.bgmRecordExternalIdMissing, { id: recordId }));

        if (record.mysekaiMusicTrackType === "music_sound_track") {
            const track = this.musicSoundTrackById.get(externalId);
            if (!track) throw new Error(interpolateRuntimeMessage(this.options.messages.soundtrackMissing, { id: externalId }));
            const url = getMysekaiSoundTrackAudioUrl(track.assetbundleName, track.assetbundleFileName, this.options.assetSource);
            if (!url) throw new Error(interpolateRuntimeMessage(this.options.messages.soundtrackAssetMissing, { id: externalId }));
            return {
                url,
                title: track.title || interpolateRuntimeMessage(this.options.messages.soundtrackFallbackTitle, { id: externalId }),
                subtitle: this.options.messages.soundtrackSubtitle,
                fillerSec: 0,
                kind: "music_sound_track",
                setting,
            };
        }

        const music = this.musicInfoById.get(externalId);
        if (!music) throw new Error(interpolateRuntimeMessage(this.options.messages.musicMissing, { id: externalId }));
        const vocal = this.selectMusicVocalForBgm(externalId, setting);
        if (!vocal?.assetbundleName) {
            const reason = setting.isInstrumental
                ? this.options.messages.missingInstrumental
                : interpolateRuntimeMessage(this.options.messages.missingVocal, { id: setting.musicVocalId || this.options.messages.defaultVocal });
            throw new Error(`${music.title || interpolateRuntimeMessage(this.options.messages.musicFallbackTitle, { id: externalId })} ${reason}`);
        }
        return {
            url: getMysekaiMusicVocalAudioUrl(vocal.assetbundleName, this.options.assetSource),
            title: music.title || interpolateRuntimeMessage(this.options.messages.musicFallbackTitle, { id: externalId }),
            subtitle: setting.isInstrumental ? "Inst.ver." : (vocal.caption || vocal.musicVocalType || "BGM"),
            fillerSec: Number(music.fillerSec || 0),
            kind: "music",
            setting,
        };
    }

    private cloneWithMaterial(object: THREE.Object3D, materialFactory: () => THREE.Material): THREE.Object3D {
        const out = object.clone(true);
        out.traverse((node) => {
            if (!isMesh(node)) return;
            node.geometry = node.geometry.clone();
            node.material = materialFactory();
        });
        return out;
    }

    private cloneCanvasWithCardMaterial(object: THREE.Object3D, materialFactory: () => THREE.MeshLambertMaterial, cardTexture: THREE.Texture, fixtureId: number): THREE.Object3D {
        const suffix = fixtureId === 439 || fixtureId === 440 || fixtureId === 442 ? "_1" : "_0";
        const out = object.clone(true);
        out.traverse((node) => {
            if (!isMesh(node)) return;
            node.geometry = node.geometry.clone();
            const material = materialFactory();
            if (String(node.name || "").endsWith(suffix)) {
                material.map = cardTexture;
                material.color.set(0xffffff);
            }
            node.material = material;
        });
        return out;
    }

    private pickLikelyCustomDisplayMesh(root: THREE.Object3D): THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]> | null {
        const candidates: Array<{ mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>; name: string }> = [];
        root.traverse((node) => {
            if (!isMesh(node)) return;
            const name = String(node.name || "").toLowerCase();
            if (name.includes("preview")) return;
            candidates.push({ mesh: node, name });
        });
        const preferredNames = ["mdl_cst0006_photo_type1stand1_0"];
        for (const name of preferredNames) {
            const hit = candidates.find((candidate) => candidate.name.includes(name));
            if (hit) return hit.mesh;
        }
        candidates.sort((a, b) => b.name.localeCompare(a.name));
        return candidates[0]?.mesh ?? null;
    }

    private cloneCustomWithDisplayTexture(object: THREE.Object3D, materialFactory: () => THREE.MeshLambertMaterial, displayTexture: THREE.Texture | null): THREE.Object3D {
        const out = object.clone(true);
        const target = this.pickLikelyCustomDisplayMesh(out);
        out.traverse((node) => {
            if (!isMesh(node)) return;
            node.geometry = node.geometry.clone();
            const material = materialFactory();
            if (target && node === target && displayTexture) {
                material.map = displayTexture;
                material.color.set(0xffffff);
            }
            node.material = material;
        });
        return out;
    }

    private stopBgmAudio(resetIntent = false) {
        if (resetIntent) this.bgmUserWantsPlay = false;
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.src = "";
            this.bgmAudio.load();
            this.bgmAudio = null;
        }
        this.bgmLoading = false;
        this.bgmPlaying = false;
    }

    private setCurrentBgm(info: MysekaiBackgroundMusicInfo | null, error: string | null = null) {
        const previousUrl = this.currentBgm?.url || "";
        const nextUrl = info?.url || "";
        const shouldTryResume = this.bgmUserWantsPlay && !!info;
        if (previousUrl !== nextUrl) this.stopBgmAudio(false);
        this.currentBgm = info;
        this.bgmError = error;
        this.refreshBgmOverlayState();
        if (shouldTryResume && previousUrl !== nextUrl) void this.playBgm();
    }

    private async playBgm() {
        if (!this.currentBgm) return;
        this.bgmUserWantsPlay = true;
        this.bgmError = null;
        let audio = this.bgmAudio;
        if (!audio || audio.src !== this.currentBgm.url) {
            audio = new Audio(this.currentBgm.url);
            audio.crossOrigin = "anonymous";
            audio.loop = true;
            audio.volume = this.bgmVolume;
            audio.onplay = () => {
                this.bgmLoading = false;
                this.bgmPlaying = true;
                this.refreshBgmOverlayState();
            };
            audio.onpause = () => {
                this.bgmPlaying = false;
                this.refreshBgmOverlayState();
            };
            audio.onerror = () => {
                this.bgmLoading = false;
                this.bgmPlaying = false;
                this.bgmError = this.options.messages.bgmLoadFailed;
                this.refreshBgmOverlayState();
            };
            this.bgmAudio = audio;
        }
        audio.volume = this.bgmVolume;
        if (this.currentBgm.kind === "music" && this.currentBgm.fillerSec > 0 && audio.currentTime < 0.1) {
            try {
                audio.currentTime = this.currentBgm.fillerSec;
            } catch {
                // Some browsers reject seeking before metadata; keep default start.
            }
        }
        try {
            this.bgmLoading = true;
            this.refreshBgmOverlayState();
            await audio.play();
        } catch (error) {
            this.bgmLoading = false;
            this.bgmPlaying = false;
            this.bgmError = errorMessage(error);
            this.refreshBgmOverlayState();
        }
    }

    private pauseBgm(resetIntent = true) {
        if (resetIntent) this.bgmUserWantsPlay = false;
        this.bgmAudio?.pause();
        this.bgmLoading = false;
        this.bgmPlaying = false;
        this.refreshBgmOverlayState();
    }

    private toggleBgm() {
        if (!this.currentBgm) return;
        if (this.bgmPlaying || this.bgmLoading) this.pauseBgm(true);
        else void this.playBgm();
    }

    private handleBgmVolumeChange = () => {
        const value = Number(this.bgmVolumeInput?.value || 0) / 100;
        this.bgmVolume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_BGM_VOLUME;
        if (this.bgmAudio) this.bgmAudio.volume = this.bgmVolume;
        this.saveBgmVolume();
        this.refreshBgmOverlayState();
    };

    private clearContent() {
        while (this.contentGroup.children.length) {
            const child = this.contentGroup.children.pop();
            if (child) disposeObject(child);
        }
    }

    private clearGrid() {
        if (this.gridMinor) {
            this.scene.remove(this.gridMinor);
            this.gridMinor.geometry.dispose();
            disposeMaterial(this.gridMinor.material);
            this.gridMinor = null;
        }
        if (this.gridMajor) {
            this.scene.remove(this.gridMajor);
            this.gridMajor.geometry.dispose();
            disposeMaterial(this.gridMajor.material);
            this.gridMajor = null;
        }
    }

    private clearIndoorWalls() {
        for (const wall of this.indoorWallPlanes) {
            this.scene.remove(wall);
            disposeObject(wall);
        }
        this.indoorWallPlanes.length = 0;
        if (this.indoorWallGridMinor) {
            this.scene.remove(this.indoorWallGridMinor);
            this.indoorWallGridMinor.geometry.dispose();
            disposeMaterial(this.indoorWallGridMinor.material);
            this.indoorWallGridMinor = null;
        }
        if (this.indoorWallGridMajor) {
            this.scene.remove(this.indoorWallGridMajor);
            this.indoorWallGridMajor.geometry.dispose();
            disposeMaterial(this.indoorWallGridMajor.material);
            this.indoorWallGridMajor = null;
        }
        if (this.indoorDoorObject) {
            this.contentGroup.remove(this.indoorDoorObject);
            disposeObject(this.indoorDoorObject);
            this.indoorDoorObject = null;
        }
        this.markBackFacingOpacityDirty();
    }

    private clearBeforeBuild() {
        this.clearContent();
        this.clearGrid();
        this.clearIndoorWalls();
        this.wallPlacedEntries.length = 0;
        this.grass.visible = false;
        this.grass.material.map = null;
        this.grass.material.color.set(0x8fb77a);
        this.grass.material.needsUpdate = true;
    }

    private applyLightingPreset(isOutdoor: boolean) {
        this.ambientLight.intensity = isOutdoor ? 1.2 : 2;
        this.directionalLight.intensity = isOutdoor ? 1.6 : 1;
    }

    private extractEntries(layoutData: MysekaiLayoutData | MysekaiLayoutData[], siteId: number): ExtractEntriesResult {
        const effectiveTypes = siteId === 1 ? ALWAYS_ENABLED_LAYOUT_TYPES : INDOOR_TYPES;
        const wanted = new Set(effectiveTypes);
        const entries: ExtractedMysekaiEntry[] = [];
        const customArrays = [
            "mysekaiCustomFixtureCollections",
            "mysekaiCustomFixturePenlights",
            "mysekaiCustomFixtureHonors",
            "mysekaiCustomFixtureBondsHonors",
            "mysekaiCustomFixtureRecordJackets",
            "mysekaiCustomFixturePhotos",
        ] as const;

        const pushGroupEntries = (group: { [key: string]: unknown; mysekaiLayoutType?: string }) => {
            const layoutType = group.mysekaiLayoutType || "";
            if (!wanted.has(layoutType)) return;
            for (const item of (group.mysekaiFixtures as MysekaiLayoutItem[] | undefined) || []) entries.push({ layoutType, item });
            for (const item of (group.mysekaiCanvases as MysekaiLayoutItem[] | undefined) || []) entries.push({ layoutType, item });
            for (const item of (group.mysekaiGrowingPlants as MysekaiLayoutItem[] | undefined) || []) entries.push({ layoutType, item: { ...item, __isGrowingPlant: true } });
            for (const key of customArrays) {
                for (const item of (group[key] as MysekaiLayoutItem[] | undefined) || []) {
                    entries.push({ layoutType, item: { ...item, __isCustomFixture: true, __customGroupKey: key } });
                }
            }
        };

        if (Array.isArray(layoutData)) {
            for (const group of layoutData) pushGroupEntries(group as { [key: string]: unknown; mysekaiLayoutType?: string });
            return { entries, playerRank: 1, effectiveTypes };
        }

        const site = layoutData.userMysekaiSiteHousingLayouts?.find((item) => Number(item.mysekaiSiteId) === siteId);
        for (const group of site?.mysekaiSiteHousingLayouts || []) pushGroupEntries(group as { [key: string]: unknown; mysekaiLayoutType?: string });
        return { entries, playerRank: Number(layoutData.mysekaiRank || 1), effectiveTypes };
    }

    private getIgnoredReason(entry: ExtractedMysekaiEntry): string | null {
        if (entry.item.__isCustomFixture) return null;
        const fixtureId = Number(entry.item.mysekaiFixtureId);
        const meta = this.fixtureMetaMap.get(fixtureId);
        if (meta?.mysekaiFixtureHandleType === "block_transparent") return "block_transparent";
        return null;
    }

    private getSiteLevelIdByRank(mysekaiRank: number, siteId: number): number | null {
        const unlocked = new Set(
            this.rankReleases
                .filter((item) => item.mysekaiRankRelaseType === "mysekai_site_level" && Number(item.mysekaiRank) <= mysekaiRank)
                .map((item) => Number(item.externalId)),
        );
        const candidates = this.siteLevels
            .filter((item) => Number(item.mysekaiSiteId) === siteId && unlocked.has(Number(item.id)))
            .sort((a, b) => Number(b.level || 0) - Number(a.level || 0));
        return candidates.length ? Number(candidates[0].id) : null;
    }

    private getSiteSize(siteLevelId: number | null): MysekaiSceneSize {
        if (!siteLevelId) return { width: 80, depth: 80, height: 10 };
        const floor = this.siteLayouts.find((item) => Number(item.mysekaiSiteLevelId) === siteLevelId && item.mysekaiLayoutType === "floor");
        if (!floor) return { width: 80, depth: 80, height: 10 };
        return { width: Number(floor.width || 80), depth: Number(floor.depth || 80), height: Number(floor.height || 10) };
    }

    private mapWallLayoutToScenePos(layoutType: string, position: MysekaiLayoutItem["position"], size: MysekaiSceneSize) {
        const halfW = Number(size.width || 80) / 2;
        const halfD = Number(size.depth || 80) / 2;
        const px = normalizeFiniteNumber(position?.x);
        const py = normalizeFiniteNumber(position?.y);
        const wallEps = 0.01;
        if (layoutType === "wall_back") return { x: px + 1, y: py, z: -halfD + wallEps };
        if (layoutType === "wall_front") return { x: -px - 1, y: py, z: halfD - wallEps };
        if (layoutType === "wall_left") return { x: -halfW + wallEps, y: py, z: -px - 1 };
        if (layoutType === "wall_right") return { x: halfW - wallEps, y: py, z: px + 1 };
        return mapLayoutToScenePos(position);
    }

    private getIndoorSurfaceAppearance(layoutData: MysekaiLayoutData | MysekaiLayoutData[], siteId: number): SurfaceAppearanceInfo {
        if (Array.isArray(layoutData)) return { floor: null, wall: null };
        const site = layoutData.userMysekaiSiteHousingLayouts?.find((item) => Number(item.mysekaiSiteId) === siteId);
        const out: SurfaceAppearanceInfo = { floor: null, wall: null };
        for (const item of site?.mysekaiFixtureSurfaceAppearances || []) {
            const normalized: MysekaiLayoutItem = { mysekaiFixtureId: item.mysekaiFixtureId, textureId: item.textureId };
            if (item.mysekaiFixtureSurfaceAppearanceType === "floor_appearance") out.floor = normalized;
            else if (item.mysekaiFixtureSurfaceAppearanceType === "wall_appearance") out.wall = normalized;
        }
        return out;
    }

    private getRoomSkinTextureUrls(assetName: string, textureId: number, kind: "floor" | "wall" | "door"): string[] {
        const paths = kind === "floor"
            ? getRoomSkinFloorTexturePaths(assetName, textureId)
            : kind === "wall"
                ? getRoomSkinWallTexturePaths(assetName, textureId)
                : getRoomSkinDoorTexturePaths(assetName, textureId);
        return paths.flatMap((path) => getMysekaiCandidateRawUrls(path, this.options.assetSource));
    }

    private async pickExistingTextureUrl(urls: string[]): Promise<string | null> {
        for (const url of urls) {
            const texture = await this.getTextureFromUrl(url);
            if (texture) return url;
        }
        return null;
    }

    private async getRoomSkinAssetInfo(fixtureId: number, textureId: number, kind: "floor" | "wall"): Promise<RoomSkinAssetInfo | null> {
        const meta = this.fixtureMetaMap.get(fixtureId);
        const asset = meta?.assetbundleName;
        if (!asset) return null;
        if (kind === "floor") {
            const floorTex = await this.pickExistingTextureUrl(this.getRoomSkinTextureUrls(asset, textureId, "floor"));
            return { asset, floorTexUrl: floorTex || undefined, doorObjUrls: [] };
        }
        const [wallTex, doorTex] = await Promise.all([
            this.pickExistingTextureUrl(this.getRoomSkinTextureUrls(asset, textureId, "wall")),
            this.pickExistingTextureUrl(this.getRoomSkinTextureUrls(asset, textureId, "door")),
        ]);
        const doorObjUrls = this.pickRoomSkinObjectUrls(asset);
        return { asset, wallTexUrl: wallTex || undefined, doorTexUrl: doorTex || undefined, doorObjUrls };
    }

    private pickRoomSkinObjectUrls(assetName: string): string[] {
        return getRoomSkinDoorObjectPaths(assetName).flatMap((path) => getMysekaiCandidateRawUrls(path, this.options.assetSource));
    }

    private createIndoorWalls(size: MysekaiSceneSize) {
        const halfW = size.width / 2;
        const halfD = size.depth / 2;
        const height = Number(size.height || 12);
        const wallDefs: Array<{
            type: string;
            width: number;
            position: [number, number, number];
            rotation: [number, number, number];
        }> = [
            { type: "wall_back", width: size.width, position: [0, height / 2, -halfD], rotation: [0, 0, 0] },
            { type: "wall_front", width: size.width, position: [0, height / 2, halfD], rotation: [0, Math.PI, 0] },
            { type: "wall_left", width: size.depth, position: [-halfW, height / 2, 0], rotation: [0, Math.PI / 2, 0] },
            { type: "wall_right", width: size.depth, position: [halfW, height / 2, 0], rotation: [0, -Math.PI / 2, 0] },
        ];
        for (const def of wallDefs) {
            const wall = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                new THREE.MeshLambertMaterial({ color: 0xd0d0d0, side: THREE.DoubleSide }),
            );
            wall.scale.set(def.width, height, 1);
            wall.position.set(...def.position);
            wall.rotation.set(...def.rotation);
            wall.userData.wallType = def.type;
            this.indoorWallPlanes.push(wall);
            this.scene.add(wall);
        }
        this.createIndoorWallGrid(size);
        this.markBackFacingOpacityDirty();
    }

    private createIndoorWallGrid(size: MysekaiSceneSize) {
        if (this.indoorWallGridMinor) {
            this.scene.remove(this.indoorWallGridMinor);
            this.indoorWallGridMinor.geometry.dispose();
            disposeMaterial(this.indoorWallGridMinor.material);
            this.indoorWallGridMinor = null;
        }
        if (this.indoorWallGridMajor) {
            this.scene.remove(this.indoorWallGridMajor);
            this.indoorWallGridMajor.geometry.dispose();
            disposeMaterial(this.indoorWallGridMajor.material);
            this.indoorWallGridMajor = null;
        }
        const width = Number(size.width || 80);
        const depth = Number(size.depth || 80);
        const height = Number(size.height || 12);
        const halfW = width / 2;
        const halfD = depth / 2;
        const minorVerts: number[] = [];
        const majorVerts: number[] = [];
        const pushLine = (target: number[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
            target.push(x0, y0, z0, x1, y1, z1);
        };
        const pick = (value: number) => Math.abs(value % 4) < 1e-6 ? majorVerts : minorVerts;
        for (let x = -halfW; x <= halfW; x += 1) {
            const target = pick(Math.round(x));
            pushLine(target, x, 0, -halfD, x, height, -halfD);
            pushLine(target, x, 0, halfD, x, height, halfD);
        }
        for (let z = -halfD; z <= halfD; z += 1) {
            const target = pick(Math.round(z));
            pushLine(target, -halfW, 0, z, -halfW, height, z);
            pushLine(target, halfW, 0, z, halfW, height, z);
        }
        for (let y = 0; y <= height; y += 1) {
            const target = pick(y);
            pushLine(target, -halfW, y, -halfD, halfW, y, -halfD);
            pushLine(target, -halfW, y, halfD, halfW, y, halfD);
            pushLine(target, -halfW, y, -halfD, -halfW, y, halfD);
            pushLine(target, halfW, y, -halfD, halfW, y, halfD);
        }
        const minorGeometry = new THREE.BufferGeometry();
        minorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(minorVerts, 3));
        this.indoorWallGridMinor = new THREE.LineSegments(minorGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
        const majorGeometry = new THREE.BufferGeometry();
        majorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(majorVerts, 3));
        this.indoorWallGridMajor = new THREE.LineSegments(majorGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.68 }));
        this.scene.add(this.indoorWallGridMinor, this.indoorWallGridMajor);
    }

    private applyIndoorFloorUV(geometry: THREE.BufferGeometry, worldMatrix: THREE.Matrix4, siteSize: MysekaiSceneSize) {
        const period = 28;
        const halfW = Number(siteSize.width || 80) / 2;
        const halfD = Number(siteSize.depth || 80) / 2;
        const position = geometry.attributes.position;
        const uv = new Float32Array(position.count * 2);
        const vector = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
            vector.fromBufferAttribute(position, i).applyMatrix4(worldMatrix);
            const gx = vector.x + halfW;
            const gz = vector.z + halfD;
            uv[i * 2] = -modPos(gx + 2, period) / period;
            uv[i * 2 + 1] = modPos(gz + 4, period) / period;
        }
        geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    }

    private applyOutdoorFloorUV(geometry: THREE.BufferGeometry, worldMatrix: THREE.Matrix4, siteSize: MysekaiSceneSize) {
        const period = 8;
        const halfW = Number(siteSize.width || 80) / 2;
        const halfD = Number(siteSize.depth || 80) / 2;
        const position = geometry.attributes.position;
        const uv = new Float32Array(position.count * 2);
        const vector = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
            vector.fromBufferAttribute(position, i).applyMatrix4(worldMatrix);
            uv[i * 2] = (vector.x + halfW) / period;
            uv[i * 2 + 1] = (vector.z + halfD) / period;
        }
        geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    }

    private applyIndoorWallUV(wall: THREE.Mesh) {
        const geometry = wall.geometry;
        const position = geometry.attributes.position;
        const uv = new Float32Array(position.count * 2);
        const wallWidth = Number(wall.scale.x || 1);
        const wallHeight = Number(wall.scale.y || 1);
        const wallType = String(wall.userData.wallType || "");
        const isLeftRight = wallType === "wall_left" || wallType === "wall_right";
        for (let i = 0; i < position.count; i++) {
            const lx = position.getX(i);
            const ly = position.getY(i);
            const alongBase = (lx + 0.5) * wallWidth;
            const along = isLeftRight ? alongBase + 2 : wallWidth - alongBase;
            let up = ly + 0.5;
            if (isLeftRight) up += 1.2;
            up *= wallHeight;
            uv[i * 2] = (along + 0.375) / 24.75;
            uv[i * 2 + 1] = 0.5 + (((up + 1.15) / 12) * 0.5);
            if (!isLeftRight) uv[i * 2] = -uv[i * 2];
        }
        geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    }

    private applyRoadWorldUV(geometry: THREE.BufferGeometry, worldMatrix: THREE.Matrix4) {
        const position = geometry.attributes.position;
        const uv = new Float32Array(position.count * 2);
        const vector = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
            vector.fromBufferAttribute(position, i).applyMatrix4(worldMatrix);
            uv[i * 2] = vector.x * 0.5;
            uv[i * 2 + 1] = vector.z * 0.5;
        }
        geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    }

    private makeGrid(size: MysekaiSceneSize) {
        this.clearGrid();
        const halfW = Number(size.width || 80) / 2;
        const halfD = Number(size.depth || 80) / 2;
        const minX = -halfW;
        const maxX = halfW;
        const minZ = -halfD;
        const maxZ = halfD;
        const minorVerts: number[] = [];
        const majorVerts: number[] = [];
        const y = 0.01;
        const xStart = Math.floor(minX);
        const xEnd = Math.ceil(maxX);
        const zStart = Math.floor(minZ);
        const zEnd = Math.ceil(maxZ);
        const isMajorX = (value: number) => Math.abs((value - minX) % 4) < 1e-6;
        const isMajorZ = (value: number) => Math.abs((value - minZ) % 4) < 1e-6;

        for (let x = xStart; x <= xEnd; x++) {
            const target = isMajorX(x) ? majorVerts : minorVerts;
            target.push(x, y, zStart, x, y, zEnd);
        }
        for (let z = zStart; z <= zEnd; z++) {
            const target = isMajorZ(z) ? majorVerts : minorVerts;
            target.push(xStart, y, z, xEnd, y, z);
        }

        const minorGeometry = new THREE.BufferGeometry();
        minorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(minorVerts, 3));
        this.gridMinor = new THREE.LineSegments(
            minorGeometry,
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
        );

        const majorGeometry = new THREE.BufferGeometry();
        majorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(majorVerts, 3));
        this.gridMajor = new THREE.LineSegments(
            majorGeometry,
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
        );
        this.scene.add(this.gridMinor, this.gridMajor);
        this.applyDebugVisibility();
    }

    private getFloorShadowTexture(): THREE.CanvasTexture {
        if (this.floorShadowTexture) return this.floorShadowTexture;
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            this.floorShadowTexture = new THREE.CanvasTexture(canvas);
            return this.floorShadowTexture;
        }
        const image = ctx.createImageData(canvas.width, canvas.height);
        const data = image.data;
        const halfW = canvas.width * 0.5;
        const halfH = canvas.height * 0.5;
        const rectHalfW = 28;
        const rectHalfH = 22;
        const feather = 18;
        const maxAlpha = 0.32;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const px = Math.abs((x + 0.5) - halfW) - rectHalfW;
                const py = Math.abs((y + 0.5) - halfH) - rectHalfH;
                const ox = Math.max(px, 0);
                const oy = Math.max(py, 0);
                const outsideDist = Math.hypot(ox, oy);
                const insideDist = Math.min(Math.max(px, py), 0);
                const signedDist = outsideDist + insideDist;
                const t = 1 - Math.min(Math.max(signedDist / feather, 0), 1);
                const alpha = t * maxAlpha;
                const index = (y * canvas.width + x) * 4;
                data[index] = 0;
                data[index + 1] = 0;
                data[index + 2] = 0;
                data[index + 3] = Math.round(alpha * 255);
            }
        }
        ctx.putImageData(image, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        this.floorShadowTexture = texture;
        return texture;
    }

    private createFakeFloorShadowForObject(object: THREE.Object3D, siteSize: MysekaiSceneSize): THREE.Mesh | null {
        const bbox = captureWorldBBox(object);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const cx = (bbox.min.x + bbox.max.x) * 0.5;
        const cz = (bbox.min.z + bbox.max.z) * 0.5;
        const sx = Math.max(0.8, size.x * 1.18);
        const sz = Math.max(0.8, size.z * 1.18);
        const area = sx * sz;
        const opacity = area <= 3.2 ? 0.28 : 0.55;
        const halfW = siteSize.width / 2;
        const halfD = siteSize.depth / 2;
        const xMin = Math.max(-halfW, cx - sx * 0.5);
        const xMax = Math.min(halfW, cx + sx * 0.5);
        const zMin = Math.max(-halfD, cz - sz * 0.5);
        const zMax = Math.min(halfD, cz + sz * 0.5);
        const clippedW = xMax - xMin;
        const clippedD = zMax - zMin;
        if (!(clippedW > 0.05 && clippedD > 0.05)) return null;
        const shadow = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                map: this.getFloorShadowTexture(),
                color: 0x000000,
                transparent: true,
                opacity,
                depthWrite: false,
                depthTest: true,
                side: THREE.DoubleSide,
            }),
        );
        shadow.rotation.set(-Math.PI * 0.5, 0, 0, "YXZ");
        shadow.scale.set(clippedW, clippedD, 1);
        shadow.position.set((xMin + xMax) / 2, SHADOW_Y_OFFSET, (zMin + zMax) / 2);
        shadow.userData.isFloorShadow = true;
        shadow.visible = this.options.shadowEnabled;
        shadow.renderOrder = -1;
        return shadow;
    }

    private applyFloorStacking(records: FloorPlacementRecord[], customOnly: boolean) {
        if (!records.length) return;
        const ordered = customOnly
            ? [...records.filter((item) => item.customPartType === "base"), ...records.filter((item) => item.customPartType === "ornament")]
            : [...records].sort((a, b) => a.bottomY - b.bottomY);
        const cellMap = new Map<string, FloorPlacementRecord[]>();
        const eps = 0.001;
        for (const record of ordered) {
            // For put_either, the current game data only uses bricks aligned to exact grid positions.
            // Therefore stacking does not need to distinguish whether they are above or below.
            if (customOnly || record.putType === "put_target") {
                let supportTop: number | null = null;
                for (const key of record.cellKeys) {
                    const belowList = cellMap.get(key);
                    if (!belowList?.length) continue;
                    for (const below of belowList) {
                        if (below === record) continue;
                        if (!customOnly && below.putType !== "put_base")
                            continue;
                        const isValid = customOnly
                            ? below.customPartType === "base" && record.customPartType === "ornament"
                            : below.topY - eps < record.bottomY && below.customPartType === null;
                        if (!isValid) continue;
                        if (calcBBoxXZAreaOverlayRatio(record.bbox, below.bbox) < FLOOR_STACKING_BBOX_XZ_OVERLAY_RATIO_THRESHOLD) continue;
                        if (supportTop === null || below.topY > supportTop) supportTop = below.topY;
                    }
                    break;
                }
                if (supportTop !== null && (customOnly || supportTop <= record.bottomY)) {
                    const dy = supportTop - record.bottomY + eps;
                    record.object.position.y += dy;
                    record.bbox = captureWorldBBox(record.object);
                    record.bottomY = record.bbox.min.y;
                    record.topY = record.bbox.max.y;
                }
            }
            for (const key of record.cellKeys) {
                const list = cellMap.get(key) || [];
                list.push(record);
                cellMap.set(key, list);
            }
        }
    }

    private buildFencePointMap(entries: ExtractedMysekaiEntry[], siteSize: MysekaiSceneSize): Map<number, Set<string>> {
        const out = new Map<number, Set<string>>();
        for (const { layoutType, item } of entries) {
            if (item.__isCustomFixture) continue;
            const fixtureId = Number(item.mysekaiFixtureId);
            const meta = this.fixtureMetaMap.get(fixtureId);
            if (meta?.mysekaiFixtureHandleType !== "fence") continue;
            const position = this.mapWallLayoutToScenePos(layoutType, item.position || { x: 0, y: 0, z: 0 }, siteSize);
            if (!out.has(fixtureId)) out.set(fixtureId, new Set());
            out.get(fixtureId)?.add(`${Math.round(position.x)},${Math.round(position.z)}`);
        }
        return out;
    }

    private getEntryRenderAssets(item: MysekaiLayoutItem, gateId: number): EntryRenderAsset[] {
        const isCustom = !!item.__isCustomFixture;
        const fixtureId = Number(item.mysekaiFixtureId);
        const customFixtureId = Number(item.mysekaiCustomFixtureId);
        const meta = isCustom ? null : this.fixtureMetaMap.get(fixtureId);
        const customMeta = isCustom ? this.customFixtureMetaMap.get(customFixtureId) : null;
        if (!isCustom && meta?.mysekaiFixtureHandleType === "block_transparent") return [];

        const renderAssets: EntryRenderAsset[] = [];
        if (isCustom) {
            if (!customMeta) return renderAssets;
            if (customMeta.baseAssetBundleName) renderAssets.push({ asset: customMeta.baseAssetBundleName, isOrnament: false, useCustomAttachRoot: false });
            if (customMeta.ornamentAssetBundleName) renderAssets.push({ asset: customMeta.ornamentAssetBundleName, isOrnament: true, useCustomAttachRoot: true });
            return renderAssets;
        }

        const asset = fixtureId === 900002 ? GATE_ASSET_BY_ID[gateId] : meta?.assetbundleName;
        if (!asset) return renderAssets;
        renderAssets.push({
            asset,
            isOrnament: false,
            useCustomAttachRoot: false,
            handleType: meta?.mysekaiFixtureHandleType,
            fixtureType: meta?.mysekaiFixtureType,
        });
        return renderAssets;
    }

    private getSceneModelAssetKey(assetInfo: Pick<EntryRenderAsset, "asset" | "useCustomAttachRoot" | "handleType" | "fixtureType">): string {
        return [
            assetInfo.useCustomAttachRoot ? "custom" : "fixture",
            assetInfo.asset,
            assetInfo.handleType || "",
            assetInfo.fixtureType || "",
        ].join("|");
    }

    private collectSceneModelAssets(entries: ExtractedMysekaiEntry[], gateId: number): SceneModelAssetRef[] {
        const refs = new Map<string, SceneModelAssetRef>();
        for (const { item } of entries) {
            for (const assetInfo of this.getEntryRenderAssets(item, gateId)) {
                const key = this.getSceneModelAssetKey(assetInfo);
                if (refs.has(key)) continue;
                refs.set(key, {
                    key,
                    asset: assetInfo.asset,
                    useCustomAttachRoot: assetInfo.useCustomAttachRoot,
                    handleType: assetInfo.handleType,
                    fixtureType: assetInfo.fixtureType,
                    isFence: assetInfo.handleType === "fence"
                        && !assetInfo.useCustomAttachRoot
                        && getFixtureObjectPaths(assetInfo.asset, assetInfo.handleType, assetInfo.fixtureType).length > 1,
                });
            }
        }
        return Array.from(refs.values());
    }

    private async preloadSceneModelAsset(ref: SceneModelAssetRef): Promise<PreparedModelAsset> {
        try {
            const objUrls = this.getObjCandidateUrls(ref.asset, ref.useCustomAttachRoot, ref.handleType, ref.fixtureType);
            if (ref.isFence) {
                const fenceParts = await this.getFencePartSet(ref.asset, objUrls);
                return { key: ref.key, asset: ref.asset, fenceParts };
            }
            const primaryObjUrl = await this.pickPrimaryObjUrl(objUrls);
            if (!primaryObjUrl) throw new Error(interpolateRuntimeMessage(this.options.messages.modelMissing, { asset: ref.asset }));
            const source = await this.getObjSourceGroup(primaryObjUrl);
            return { key: ref.key, asset: ref.asset, source, primaryObjUrl };
        } catch (error) {
            return { key: ref.key, asset: ref.asset, error };
        }
    }

    private async preloadSceneModelAssets(refs: SceneModelAssetRef[], entriesTotal: number, ignored: number, generation: number): Promise<Map<string, PreparedModelAsset>> {
        const prepared = new Map<string, PreparedModelAsset>();
        if (!refs.length) return prepared;
        let processed = 0;
        this.setStatusForReload(generation, {
            phase: "loading",
            stage: "assets",
            stageLabel: this.options.messages.preloadingModelsLabel,
            progress: 12,
            message: interpolateRuntimeMessage(this.options.messages.preloadingModelsProgress, { done: 0, total: refs.length }),
            currentAsset: undefined,
            loaded: 0,
            total: entriesTotal,
            ignored,
            failed: 0,
            skipped: 0,
        });
        const results = await mapWithConcurrency(refs, ENTRY_BUILD_CONCURRENCY, async (ref) => {
            try {
                if (!this.isReloadActive(generation)) return { key: ref.key, asset: ref.asset };
                return await this.preloadSceneModelAsset(ref);
            } finally {
                processed++;
                const progress = 12 + Math.round((processed / Math.max(1, refs.length)) * 38);
                this.mergeStatusForReload(generation, {
                    progress,
                    message: interpolateRuntimeMessage(this.options.messages.preloadingModelsProgress, { done: processed, total: refs.length }),
                    currentAsset: ref.asset,
                });
            }
        });
        for (const result of results) prepared.set(result.key, result);
        return prepared;
    }

    private async applyBackgroundMusic(layout: MysekaiLayoutData | MysekaiLayoutData[], siteId: number, generation: number) {
        if (!this.isReloadActive(generation)) return;
        this.setCurrentBgm(null);
        try {
            const bgm = await this.resolveBackgroundMusic(layout, siteId);
            if (!this.isReloadActive(generation) || Number(this.options.siteId || 1) !== siteId) return;
            this.setCurrentBgm(bgm);
        } catch (error) {
            if (!this.isReloadActive(generation) || Number(this.options.siteId || 1) !== siteId) return;
            console.warn("[mysekai-preview-bgm]", error);
            this.setCurrentBgm(null, errorMessage(error));
        }
    }

    private async buildScene(forceFreshLayout: boolean, generation: number) {
        if (!this.isReloadActive(generation)) return;
        this.clearBeforeBuild();
        this.setStatusForReload(generation, {
            phase: "loading",
            stage: "layout",
            stageLabel: this.options.messages.readingLayoutLabel,
            progress: 8,
            message: this.options.messages.loadingLayoutMessage,
            loaded: 0,
            total: 0,
            skipped: 0,
            ignored: 0,
            failed: 0,
        });
        const layout = await this.loadLayoutPayload(forceFreshLayout);
        if (!this.isReloadActive(generation)) return;
        const siteId = Number(this.options.siteId || 1);
        void this.applyBackgroundMusic(layout, siteId, generation);
        const { entries, playerRank } = this.extractEntries(layout, siteId);
        const ignoredEntries = entries.filter((entry) => this.getIgnoredReason(entry));
        const renderEntries = entries.filter((entry) => !this.getIgnoredReason(entry));
        const siteLevelId = this.getSiteLevelIdByRank(playerRank, siteId);
        const siteSize = this.getSiteSize(siteLevelId);
        this.currentSiteSize = siteSize;
        const fencePointsByFixture = this.buildFencePointMap(renderEntries, siteSize);
        const gateId = Array.isArray(layout) ? 1 : Number(layout.userMysekaiGate?.mysekaiGateId || 1);
        const ignored = ignoredEntries.length;
        const sceneModelAssets = this.collectSceneModelAssets(renderEntries, gateId);
        const preparedModelAssets = await this.preloadSceneModelAssets(sceneModelAssets, entries.length, ignored, generation);
        if (!this.isReloadActive(generation)) return;
        const floorPlacementRecords: FloorPlacementRecord[] = [];
        const floorShadowRecords: FloorShadowRecord[] = [];
        let loaded = 0;
        let failed = 0;
        let processed = 0;

        this.mergeStatusForReload(generation, {
            stage: "assets",
            stageLabel: this.options.messages.instantiatingFurnitureLabel,
            progress: 50,
            message: interpolateRuntimeMessage(this.options.messages.instantiatingFurnitureProgress, { done: 0, total: renderEntries.length }),
            loaded,
            total: entries.length,
            renderableTotal: renderEntries.length,
            skipped: failed,
            ignored,
            failed,
            currentAsset: undefined,
        });

        const emptyBuildResult = (index: number): EntryBuildResult => ({
            index,
            entryGroup: null,
            floorPlacementRecords: [],
            floorShadowRecords: [],
            wallPlacedEntries: [],
        });

        const buildResults = await mapWithConcurrency(renderEntries, ENTRY_BUILD_CONCURRENCY, async ({ layoutType, item }, index): Promise<EntryBuildResult> => {
            const localFloorPlacementRecords: FloorPlacementRecord[] = [];
            const localFloorShadowRecords: FloorShadowRecord[] = [];
            const localWallPlacedEntries: WallPlacedEntry[] = [];
            try {
                if (!this.isReloadActive(generation)) return emptyBuildResult(index);
                const entryGroup = await this.buildEntry(layoutType, item, siteSize, gateId, fencePointsByFixture, preparedModelAssets, localFloorPlacementRecords, localFloorShadowRecords, localWallPlacedEntries);
                if (!entryGroup.children.length) throw new Error(this.options.messages.emptyInstance);
                if (!this.isReloadActive(generation)) {
                    disposeObject(entryGroup);
                    return emptyBuildResult(index);
                }
                loaded++;
                return { index, entryGroup, floorPlacementRecords: localFloorPlacementRecords, floorShadowRecords: localFloorShadowRecords, wallPlacedEntries: localWallPlacedEntries };
            } catch (error) {
                if (!this.isReloadActive(generation)) return emptyBuildResult(index);
                failed++;
                console.warn("[mysekai-preview-skip]", { layoutType, item, error: errorMessage(error) });
                return { index, entryGroup: null, floorPlacementRecords: [], floorShadowRecords: [], wallPlacedEntries: [], error };
            } finally {
                processed++;
                if (processed % 10 === 0 || processed === renderEntries.length) {
                    const progress = 50 + Math.round((processed / Math.max(1, renderEntries.length)) * 38);
                    this.mergeStatusForReload(generation, {
                        message: interpolateRuntimeMessage(this.options.messages.instantiatingFurnitureProgress, { done: processed, total: renderEntries.length }),
                        loaded,
                        total: entries.length,
                        renderableTotal: renderEntries.length,
                        skipped: failed,
                        ignored,
                        failed,
                        progress,
                    });
                }
            }
        });

        if (!this.isReloadActive(generation)) {
            this.disposeBuildResults(buildResults);
            return;
        }
        buildResults.sort((a, b) => a.index - b.index);
        for (const result of buildResults) {
            if (!result.entryGroup) continue;
            this.contentGroup.add(result.entryGroup);
            floorPlacementRecords.push(...result.floorPlacementRecords);
            floorShadowRecords.push(...result.floorShadowRecords);
            this.wallPlacedEntries.push(...result.wallPlacedEntries);
        }

        this.mergeStatusForReload(generation, { stage: "finalize", stageLabel: this.options.messages.finalizingSceneLabel, progress: 92, loaded, total: entries.length, renderableTotal: renderEntries.length, skipped: failed, ignored, failed });
        this.applyFloorStacking(floorPlacementRecords, false);
        this.applyFloorStacking(floorPlacementRecords, true);
        for (const record of floorShadowRecords) {
            const bbox = captureWorldBBox(record.object);
            if (Math.abs(bbox.min.y) > 0.06) this.contentGroup.remove(record.shadow);
        }
        this.optimizeStaticContent();
        this.applyShadowVisibility();
        if (!this.isReloadActive(generation)) return;

        await this.buildBaseSurface(layout, siteId, siteSize, generation);
        if (!this.isReloadActive(generation)) return;
        this.makeGrid(siteSize);
        this.applyDebugVisibility();
        this.markBackFacingOpacityDirty();
        this.applyBackFacingOpacity();

        if (!this.restoredCameraState) {
            this.controls.target.set(0, 0, 0);
            this.camera.position.set(siteSize.width * 0.75, Math.max(25, siteSize.depth * 0.55), siteSize.depth * 0.75);
        }
        if (this.viewMode === "free") {
            this.syncFreeLookAnglesFromCamera();
            this.applyFreeLookRotation();
            this.clampFreeLookPosition();
        }
        this.controls.update();
        this.setStatusForReload(generation, {
            phase: "ready",
            stage: "ready",
            stageLabel: this.options.messages.completeLabel,
            progress: 100,
            message: interpolateRuntimeMessage(this.options.messages.completeMessage, {
                loaded,
                renderableTotal: renderEntries.length,
                ignored,
                failed,
                siteId,
                rank: playerRank,
                siteLevelId: siteLevelId ?? this.options.messages.defaultSiteLevel,
                width: siteSize.width,
                depth: siteSize.depth,
            }),
            loaded,
            total: entries.length,
            renderableTotal: renderEntries.length,
            skipped: failed,
            ignored,
            failed,
        });
        this.requestRender();
    }

    private getStaticMaterialKey(material: THREE.Material): string {
        const meshMaterial = material as THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;
        const color = meshMaterial.color?.getHexString() || "no-color";
        return [
            material.type,
            meshMaterial.map?.uuid || "no-map",
            color,
            material.transparent ? 1 : 0,
            material.opacity,
            material.alphaTest,
            material.side,
            material.depthWrite ? 1 : 0,
            material.depthTest ? 1 : 0,
            material.polygonOffset ? 1 : 0,
            material.polygonOffsetFactor,
            material.polygonOffsetUnits,
        ].join("|");
    }

    private canMergeStaticMesh(mesh: THREE.Mesh): mesh is THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
        if (mesh.userData.isFloorShadow || mesh.userData.debugOnly || mesh.userData.skipStaticMerge) return false;
        if (Array.isArray(mesh.material)) return false;
        const geometry = mesh.geometry;
        if (!geometry || geometry.index) return false;
        if (!geometry.attributes.position) return false;
        if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length) return false;
        return true;
    }

    private collectStaticMergeTargets(): StaticMergeTarget[] {
        const targets: StaticMergeTarget[] = [];
        this.contentGroup.traverse((node) => {
            if (!isMesh(node) || !node.parent || !this.canMergeStaticMesh(node)) return;
            if (!node.visible) return;
            targets.push({ mesh: node });
        });
        return targets;
    }

    private optimizeStaticContent() {
        this.contentGroup.updateMatrixWorld(true);
        const targets = this.collectStaticMergeTargets();
        if (targets.length < 2) return;

        const buckets = new Map<string, StaticMergeBucket>();
        for (const { mesh } of targets) {
            const material = mesh.material;
            const key = this.getStaticMaterialKey(material);
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = { material, geometries: [], meshes: [] };
                buckets.set(key, bucket);
            }
            const geometry = mesh.geometry.clone();
            geometry.applyMatrix4(mesh.matrixWorld);
            bucket.geometries.push(geometry);
            bucket.meshes.push(mesh);
        }

        let mergedCount = 0;
        const removedMeshes: THREE.Mesh[] = [];
        for (const bucket of buckets.values()) {
            if (bucket.meshes.length < 2) {
                for (const geometry of bucket.geometries) geometry.dispose();
                continue;
            }
            const mergedGeometry = mergeGeometries(bucket.geometries, false);
            for (const geometry of bucket.geometries) geometry.dispose();
            if (!mergedGeometry) continue;

            const mergedMesh = new THREE.Mesh(mergedGeometry, bucket.material);
            mergedMesh.name = `static_merged_${mergedCount++}`;
            mergedMesh.matrixAutoUpdate = false;
            mergedMesh.updateMatrix();
            mergedMesh.userData.isStaticMerged = true;
            this.contentGroup.add(mergedMesh);

            for (const mesh of bucket.meshes) {
                mesh.parent?.remove(mesh);
                if (mesh.material !== bucket.material) disposeMaterial(mesh.material);
                removedMeshes.push(mesh);
            }
        }

        const removedSet = new Set(removedMeshes);
        for (const child of [...this.contentGroup.children]) {
            if (!child.userData.isStaticMerged && this.isEmptyAfterStaticMerge(child, removedSet)) {
                this.contentGroup.remove(child);
            }
        }

        for (const mesh of removedMeshes) mesh.geometry.dispose();
    }

    private isEmptyAfterStaticMerge(object: THREE.Object3D, targetSet: Set<THREE.Mesh>): boolean {
        if (targetSet.has(object as THREE.Mesh)) return true;
        if (object.children.length === 0) return false;
        return object.children.every((child) => this.isEmptyAfterStaticMerge(child, targetSet));
    }

    private async getFencePartSet(assetName: string, objUrls: string[]): Promise<FencePartSet> {
        const cached = this.fenceAssetPartPromiseCache.get(assetName);
        if (cached) return cached;
        const promise = (async () => {
            const existing = (await Promise.all(objUrls.map(async (url) => {
                const pick = await this.fetchTextFirst([url]);
                return pick ? url : null;
            }))).filter((url): url is string => !!url);
            if (!existing.length) throw new Error(interpolateRuntimeMessage(this.options.messages.fenceModelMissing, { asset: assetName }));
            const groups = await Promise.all(existing.map((url) => this.getObjSourceGroup(url)));
            const scored = groups.map((group) => ({
                group,
                role: inferFencePartRole(group),
                ...computeXZSize(group),
            }));
            let post = scored.find((item) => item.role === "post")?.group;
            let beamShort = scored.find((item) => item.role === "short")?.group;
            let beamLong = scored.find((item) => item.role === "long")?.group;

            const unassigned = scored.filter((item) => !item.role);
            if (!post && unassigned.length) {
                unassigned.sort((a, b) => Math.abs(a.x - a.z) - Math.abs(b.x - b.z));
                post = unassigned[0].group;
            }

            const wingCandidates = scored
                .filter((item) => item.group !== post)
                .filter((item) => item.role === "short" || item.role === "long" || !item.role)
                .sort((a, b) => Math.max(a.x, a.z) - Math.max(b.x, b.z));
            const uniqueWings: typeof wingCandidates = [];
            const seen = new Set<THREE.Group>();
            for (const item of wingCandidates) {
                if (seen.has(item.group)) continue;
                seen.add(item.group);
                uniqueWings.push(item);
            }
            if (!beamShort && uniqueWings.length >= 2) beamShort = uniqueWings[0].group;
            if (!beamLong && uniqueWings.length >= 2) beamLong = uniqueWings[uniqueWings.length - 1].group;
            if (!beamShort && uniqueWings.length === 1) beamShort = uniqueWings[0].group;
            if (!beamLong && uniqueWings.length === 1) beamLong = uniqueWings[0].group;
            if (!post && scored.length) post = scored[0].group;
            beamShort ||= beamLong;
            beamLong ||= beamShort;
            if (!post || !beamShort || !beamLong) throw new Error(interpolateRuntimeMessage(this.options.messages.fencePartsFailed, { asset: assetName }));
            return { post, beamShort, beamLong, baseDir: "-x" as const };
        })();
        this.fenceAssetPartPromiseCache.set(assetName, promise);
        return promise;
    }

    private createFenceLinks(fixtureId: number, position: { x: number; y: number; z: number }, fencePointsByFixture: Map<number, Set<string>>): Array<{ dx: number; dz: number; dir: FenceDirection; step: number }> {
        const ix = Math.round(position.x);
        const iz = Math.round(position.z);
        const points = fencePointsByFixture.get(fixtureId) || null;
        if (!points) return [];
        const links: Array<{ dx: number; dz: number; dir: FenceDirection; step: number }> = [];
        for (const step of [1, 2]) {
            if (points.has(`${ix - step},${iz}`)) links.push({ dx: -step, dz: 0, dir: "-x", step });
            if (points.has(`${ix + step},${iz}`)) links.push({ dx: step, dz: 0, dir: "+x", step });
            if (points.has(`${ix},${iz - step}`)) links.push({ dx: 0, dz: -step, dir: "-z", step });
            if (points.has(`${ix},${iz + step}`)) links.push({ dx: 0, dz: step, dir: "+z", step });
        }
        return links.filter((link) => link.dx > 0 || (link.dx === 0 && link.dz > 0));
    }

    private async buildEntry(
        layoutType: string,
        item: MysekaiLayoutItem,
        siteSize: MysekaiSceneSize,
        gateId: number,
        fencePointsByFixture: Map<number, Set<string>>,
        preparedModelAssets: Map<string, PreparedModelAsset>,
        floorPlacementRecords: FloorPlacementRecord[],
        floorShadowRecords: FloorShadowRecord[],
        wallPlacedEntries: WallPlacedEntry[],
    ): Promise<THREE.Group> {
        const entryGroup = new THREE.Group();
        const isCustom = !!item.__isCustomFixture;
        const fixtureId = Number(item.mysekaiFixtureId);
        const customFixtureId = Number(item.mysekaiCustomFixtureId);
        const meta = this.fixtureMetaMap.get(fixtureId);
        const customMeta = isCustom ? this.customFixtureMetaMap.get(customFixtureId) : null;
        if (!isCustom && meta?.mysekaiFixtureHandleType === "block_transparent") return entryGroup;

        const renderAssets = this.getEntryRenderAssets(item, gateId);
        if (!renderAssets.length) return entryGroup;

        const position = this.mapWallLayoutToScenePos(layoutType, item.position || { x: 0, y: 0, z: 0 }, siteSize);
        let epsY = 0;
        if (layoutType === "road") epsY = 0.01;
        else if (layoutType === "rug") epsY = 0.02;
        else if (layoutType === "floor") epsY = 0.03;

        const baseGridW = isCustom ? Number(customMeta?.width || 1) : Number(meta?.gridSize?.width || 1);
        const baseGridD = isCustom ? Number(customMeta?.depth || 1) : Number(meta?.gridSize?.depth || 1);
        const baseGridH = isCustom ? Number(customMeta?.height || 1) : Number(meta?.gridSize?.height || 1);
        const baseRotY = mapLayoutToSceneRotDeg(item.rotation || 0) * Math.PI / 180;
        const customRoot = isCustom ? new THREE.Group() : null;
        const customStackParts: THREE.Object3D[] = [];
        let placedForShadow: THREE.Object3D | null = null;

        for (const assetInfo of renderAssets) {
            const preparedAsset = preparedModelAssets.get(this.getSceneModelAssetKey(assetInfo));
            if (!preparedAsset) throw new Error(interpolateRuntimeMessage(this.options.messages.modelNotPreloaded, { asset: assetInfo.asset }));
            if (preparedAsset.error) throw preparedAsset.error;
            const texture = await this.getFixtureTexture(assetInfo.asset, Number(item.textureId || 1), assetInfo.useCustomAttachRoot, assetInfo.handleType);
            const makeMaterial = () => new THREE.MeshLambertMaterial({
                map: texture || null,
                color: 0xffffff,
                side: THREE.FrontSide,
                transparent: layoutType !== "road",
                alphaTest: layoutType === "road" ? 0 : 0.5,
                polygonOffset: layoutType === "road",
                polygonOffsetFactor: layoutType === "road" ? -1 : 0,
                polygonOffsetUnits: layoutType === "road" ? -1 : 0,
            });

            let object: THREE.Object3D;
            if (!isCustom && assetInfo.handleType === "fence" && preparedAsset.fenceParts) {
                const fenceParts = preparedAsset.fenceParts;
                if (!fenceParts) throw new Error(interpolateRuntimeMessage(this.options.messages.fenceModelNotPreloaded, { asset: assetInfo.asset }));
                object = this.cloneWithMaterial(fenceParts.post, makeMaterial);
                for (const link of this.createFenceLinks(fixtureId, position, fencePointsByFixture)) {
                    const beamSource = link.step <= 1 ? fenceParts.beamShort : fenceParts.beamLong;
                    const beam = this.cloneWithMaterial(beamSource, makeMaterial);
                    const beamPlaced = locateObject(
                        beam,
                        position.x + link.dx,
                        position.z + link.dz,
                        position.y + epsY,
                        2,
                        2,
                        1,
                        yawFromBaseToTarget(fenceParts.baseDir, link.dir),
                        layoutType,
                    );
                    beamPlaced.updateMatrixWorld(true);
                    entryGroup.add(beamPlaced);
                }
            } else {
                const srcObject = preparedAsset.source;
                if (!srcObject) throw new Error(interpolateRuntimeMessage(this.options.messages.modelNotPreloaded, { asset: assetInfo.asset }));
                if (!isCustom && fixtureId >= 439 && fixtureId <= 444) {
                    object = this.cloneCanvasWithCardMaterial(srcObject, makeMaterial, await this.getCanvasCardTexture(item, fixtureId), fixtureId);
                } else if (isCustom) {
                    const displayTexture = customFixtureId === 55 && assetInfo.isOrnament
                        ? await this.getRecordJacketTexture(item)
                        : this.createFallbackTexture();
                    object = this.cloneCustomWithDisplayTexture(srcObject, makeMaterial, displayTexture);
                } else {
                    object = this.cloneWithMaterial(srcObject, makeMaterial);
                }
            }

            applyDollFixtureSizeCorrection(object, assetInfo.asset);
            let rotY = baseRotY;
            if (isCustom && assetInfo.isOrnament) rotY += mapLayoutToSceneRotDeg(item.ornamentRotation || 0) * Math.PI / 180;
            const placed = locateObject(object, position.x, position.z, position.y + epsY, baseGridW, baseGridD, baseGridH, rotY, layoutType);
            if (isCustom) {
                placed.traverse((node) => {
                    if (!isMesh(node)) return;
                    if (String(node.name || "").toLowerCase().includes("preview")) node.visible = false;
                });
            }
            if (layoutType === "road") {
                placed.traverse((node) => {
                    if (!isMesh(node)) return;
                    this.applyRoadWorldUV(node.geometry, node.matrixWorld);
                });
            }
            if (layoutType.startsWith("wall_")) {
                const materials: THREE.Material[] = [];
                placed.traverse((node) => {
                    if (!isMesh(node)) return;
                    node.userData.skipStaticMerge = true;
                    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
                    for (const material of nodeMaterials) {
                        this.rememberBaseAlphaTest(material);
                        materials.push(material);
                    }
                });
                wallPlacedEntries.push({ layoutType, object: placed, materials });
            }
            if (isCustom && customRoot) {
                placed.userData.isCustomPart = true;
                placed.userData.customPartType = assetInfo.isOrnament ? "ornament" : "base";
                customRoot.add(placed);
                customStackParts.push(placed);
            } else {
                entryGroup.add(placed);
                placedForShadow ||= placed;
            }
        }

        if (isCustom && customRoot && customRoot.children.length) {
            entryGroup.add(customRoot);
            placedForShadow = customRoot;
        }

        if (layoutType === "floor") {
            const stackObjects = isCustom ? customStackParts : placedForShadow ? [placedForShadow] : [];
            for (const stackObject of stackObjects) {
                const bbox = captureWorldBBox(stackObject);
                floorPlacementRecords.push({
                    object: stackObject,
                    bbox,
                    bottomY: bbox.min.y,
                    topY: bbox.max.y,
                    cellKeys: getXZCellKeysFromBBox(bbox),
                    customPartType: String(stackObject.userData.customPartType || "") || null,
                    putType: String(meta?.mysekaiFixturePutType || "") || null,
                });
            }
            if (placedForShadow && Math.abs(Number(item.position?.y || 0)) < 1e-6) {
                const shadow = this.createFakeFloorShadowForObject(placedForShadow, siteSize);
                if (shadow) {
                    entryGroup.add(shadow);
                    floorShadowRecords.push({ object: placedForShadow, shadow });
                }
            }
        }

        return entryGroup;
    }

    private async buildBaseSurface(layout: MysekaiLayoutData | MysekaiLayoutData[], siteId: number, siteSize: MysekaiSceneSize, generation: number) {
        if (!this.isReloadActive(generation)) return;
        this.applyLightingPreset(siteId === 1);
        this.grass.scale.set(siteSize.width, siteSize.depth, 1);
        this.grass.position.set(0, 0, 0);
        this.grass.visible = true;
        if (siteId === 1) {
            const outdoorTexture = await this.getTextureFromUrls(getMysekaiCandidateRawUrls(getOutdoorGrassTexturePath(), this.options.assetSource));
            if (!this.isReloadActive(generation)) return;
            if (outdoorTexture) {
                outdoorTexture.wrapS = outdoorTexture.wrapT = THREE.RepeatWrapping;
                this.grass.material.map = outdoorTexture;
                this.grass.material.color.set(0xffffff);
                this.grass.material.needsUpdate = true;
                this.grass.updateMatrixWorld(true);
                this.applyOutdoorFloorUV(this.grass.geometry, this.grass.matrixWorld, siteSize);
            }
            return;
        }

        this.createIndoorWalls(siteSize);
        const appearance = this.getIndoorSurfaceAppearance(layout, siteId);
        const floorSkin = appearance.floor?.mysekaiFixtureId
            ? await this.getRoomSkinAssetInfo(Number(appearance.floor.mysekaiFixtureId), Number(appearance.floor.textureId || 1), "floor")
            : null;
        if (!this.isReloadActive(generation)) return;
        const wallSkin = appearance.wall?.mysekaiFixtureId
            ? await this.getRoomSkinAssetInfo(Number(appearance.wall.mysekaiFixtureId), Number(appearance.wall.textureId || 1), "wall")
            : null;
        if (!this.isReloadActive(generation)) return;

        if (floorSkin?.floorTexUrl) {
            const floorTexture = await this.getTextureFromUrls([floorSkin.floorTexUrl]);
            if (!this.isReloadActive(generation)) return;
            if (floorTexture) {
                floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
                this.grass.material.map = floorTexture;
                this.grass.material.color.set(0xffffff);
                this.grass.material.needsUpdate = true;
                this.grass.updateMatrixWorld(true);
                this.applyIndoorFloorUV(this.grass.geometry, this.grass.matrixWorld, siteSize);
            }
        }

        if (wallSkin?.wallTexUrl) {
            const wallTexture = await this.getTextureFromUrls([wallSkin.wallTexUrl]);
            if (!this.isReloadActive(generation)) return;
            if (wallTexture) {
                wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
                for (const wall of this.indoorWallPlanes) {
                    const material = wall.material as THREE.MeshLambertMaterial;
                    material.map = wallTexture;
                    material.color.set(0xffffff);
                    material.needsUpdate = true;
                    this.applyIndoorWallUV(wall);
                }
            }
        }

        if (wallSkin?.doorObjUrls.length) {
            const doorObjUrl = await this.pickPrimaryObjUrl(wallSkin.doorObjUrls);
            if (!this.isReloadActive(generation)) return;
            if (doorObjUrl) {
                const doorTexture = wallSkin.doorTexUrl ? await this.getTextureFromUrls([wallSkin.doorTexUrl]) : null;
                if (!this.isReloadActive(generation)) return;
                const srcDoor = await this.getObjGroup(doorObjUrl);
                if (!this.isReloadActive(generation)) return;
                const door = this.cloneWithMaterial(srcDoor, () => new THREE.MeshLambertMaterial({
                    map: doorTexture,
                    color: 0xffffff,
                    side: THREE.FrontSide,
                    transparent: true,
                    alphaTest: 0.5,
                }));
                const halfW = siteSize.width / 2;
                const halfD = siteSize.depth / 2;
                const placed = locateObject(door, halfW - 2, halfD - 0.01, 0, 4, 1, 5, 0, "wall_front");
                placed.traverse((node) => {
                    if (!isMesh(node)) return;
                    node.userData.skipStaticMerge = true;
                    const materials = Array.isArray(node.material) ? node.material : [node.material];
                    for (const material of materials) this.rememberBaseAlphaTest(material);
                });
                this.contentGroup.add(placed);
                this.indoorDoorObject = placed;
                this.markBackFacingOpacityDirty();
            }
        }
    }

    private applyDebugVisibility() {
        const gridVisible = this.options.gridEnabled;
        if (this.gridMinor) this.gridMinor.visible = gridVisible;
        if (this.gridMajor) this.gridMajor.visible = gridVisible;
        if (this.indoorWallGridMinor) this.indoorWallGridMinor.visible = gridVisible;
        if (this.indoorWallGridMajor) this.indoorWallGridMajor.visible = gridVisible;
        this.scene.traverse((node) => {
            if (node.userData.debugOnly) node.visible = this.options.debugEnabled;
        });
    }

    private applyShadowVisibility() {
        this.contentGroup.traverse((node) => {
            if (node.userData.isFloorShadow) node.visible = this.options.shadowEnabled;
        });
    }

    private asOrderedDitherMaterial(material: THREE.Material): OrderedDitherMaterial {
        return material as OrderedDitherMaterial;
    }

    private ensureOrderedDither(material: THREE.Material | null | undefined) {
        if (!material) return;
        const ditherMaterial = this.asOrderedDitherMaterial(material);
        if (ditherMaterial.userData._orderedDitherReady) return;
        ditherMaterial.userData._orderedDitherReady = true;
        ditherMaterial.userData._orderedDitherOpacity = 1;
        ditherMaterial.userData._orderedDitherPhaseX = 0;
        ditherMaterial.userData._orderedDitherPhaseY = 0;
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uDitherOpacity = { value: ditherMaterial.userData._orderedDitherOpacity ?? 1 };
            shader.uniforms.uDitherPhase = { value: new THREE.Vector2(ditherMaterial.userData._orderedDitherPhaseX ?? 0, ditherMaterial.userData._orderedDitherPhaseY ?? 0) };
            ditherMaterial.userData._orderedDitherShader = shader;
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    "#include <common>",
                    `#include <common>
                     uniform float uDitherOpacity;
                     uniform vec2 uDitherPhase;
                     float bayer4(vec2 p){
                       int x = int(mod(p.x, 4.0));
                       int y = int(mod(p.y, 4.0));
                       int idx = y * 4 + x;
                       float t = 0.0;
                       if (idx == 0) t = 0.0; else if (idx == 1) t = 8.0; else if (idx == 2) t = 2.0; else if (idx == 3) t = 10.0;
                       else if (idx == 4) t = 12.0; else if (idx == 5) t = 4.0; else if (idx == 6) t = 14.0; else if (idx == 7) t = 6.0;
                       else if (idx == 8) t = 3.0; else if (idx == 9) t = 11.0; else if (idx == 10) t = 1.0; else if (idx == 11) t = 9.0;
                       else if (idx == 12) t = 15.0; else if (idx == 13) t = 7.0; else if (idx == 14) t = 13.0; else t = 5.0;
                       return (t + 0.5) / 16.0;
                     }`,
                )
                .replace(
                    "#include <dithering_fragment>",
                    `
                     float _op = clamp(uDitherOpacity, 0.0, 1.0);
                     if (_op < 0.999) {
                       float th = bayer4(gl_FragCoord.xy + uDitherPhase);
                       if (_op < th) discard;
                     }
                     #include <dithering_fragment>`,
                );
        };
        material.needsUpdate = true;
    }

    private setOrderedDitherOpacity(material: THREE.Material | null | undefined, opacity: number, phaseX = 0, phaseY = 0) {
        if (!material) return;
        this.ensureOrderedDither(material);
        const ditherMaterial = this.asOrderedDitherMaterial(material);
        const op = Math.max(0, Math.min(1, Number(opacity || 0)));
        ditherMaterial.userData._orderedDitherOpacity = op;
        ditherMaterial.userData._orderedDitherPhaseX = Number(phaseX || 0);
        ditherMaterial.userData._orderedDitherPhaseY = Number(phaseY || 0);
        const shader = ditherMaterial.userData._orderedDitherShader;
        const opacityUniform = shader?.uniforms?.uDitherOpacity as { value: number } | undefined;
        const phaseUniform = shader?.uniforms?.uDitherPhase as { value: THREE.Vector2 } | undefined;
        if (opacityUniform) opacityUniform.value = op;
        if (phaseUniform) phaseUniform.value.set(ditherMaterial.userData._orderedDitherPhaseX, ditherMaterial.userData._orderedDitherPhaseY);
        ditherMaterial.transparent = false;
        ditherMaterial.alphaHash = false;
        ditherMaterial.depthWrite = true;
        ditherMaterial.depthTest = true;
        material.needsUpdate = true;
    }

    private markBackFacingOpacityDirty() {
        this.backFacingOpacityDirty = true;
    }

    private rememberBaseAlphaTest(material: THREE.Material) {
        const ditherMaterial = this.asOrderedDitherMaterial(material);
        if (ditherMaterial.userData._baseAlphaTest === undefined) {
            ditherMaterial.userData._baseAlphaTest = ditherMaterial.alphaTest ?? 0;
        }
    }

    private applyBackFacingOpacity() {
        const siteId = Number(this.options.siteId || 1);
        if (siteId === 1) return;
        const opacityRatio = Math.max(0, Math.min(1, Number(this.options.backWallOpacity ?? 1)));
        const sameState =
            this.lastBackFacingCamPos.distanceToSquared(this.camera.position) < 1e-10
            && (1 - Math.abs(this.lastBackFacingCamQuat.dot(this.camera.quaternion))) < 1e-10
            && Math.abs(this.lastBackFacingOpacity - opacityRatio) < 1e-10
            && Number(this.lastBackFacingSiteId) === siteId;
        if (!this.backFacingOpacityDirty && sameState) return;
        this.backFacingOpacityDirty = false;
        this.lastBackFacingCamPos.copy(this.camera.position);
        this.lastBackFacingCamQuat.copy(this.camera.quaternion);
        this.lastBackFacingOpacity = opacityRatio;
        this.lastBackFacingSiteId = siteId;

        const wallBackFacing = new Map<string, boolean>();
        const cameraPos = this.camera.position.clone();
        for (const wall of this.indoorWallPlanes) {
            const wallType = String(wall.userData.wallType || "");
            const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(wall.quaternion).normalize();
            const toCamera = cameraPos.clone().sub(wall.position).normalize();
            const backFacing = normal.dot(toCamera) < 0;
            wallBackFacing.set(wallType, backFacing);
            const material = Array.isArray(wall.material) ? wall.material[0] : wall.material;
            this.setOrderedDitherOpacity(material, backFacing ? opacityRatio : 1, 0, 0);
        }

        let ditherIndex = 0;
        for (const entry of this.wallPlacedEntries) {
            const wallOpacity = wallBackFacing.get(entry.layoutType) ? opacityRatio : 1;
            const targetOpacity = Math.min(1, wallOpacity * 2);
            const phaseX = ditherIndex % 4;
            const phaseY = Math.floor(ditherIndex / 4) % 4;
            ditherIndex++;
            for (const material of entry.materials) {
                const ditherMaterial = this.asOrderedDitherMaterial(material);
                ditherMaterial.alphaTest = targetOpacity < 0.999 ? 0 : (ditherMaterial.userData._baseAlphaTest ?? ditherMaterial.alphaTest);
                this.setOrderedDitherOpacity(material, targetOpacity, phaseX, phaseY);
            }
        }

        if (this.indoorDoorObject) {
            const frontWallOpacity = wallBackFacing.get("wall_front") ? opacityRatio : 1;
            const doorOpacity = Math.min(1, frontWallOpacity * 2);
            this.indoorDoorObject.traverse((node) => {
                if (!isMesh(node)) return;
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                for (const material of materials) {
                    this.rememberBaseAlphaTest(material);
                    const ditherMaterial = this.asOrderedDitherMaterial(material);
                    ditherMaterial.alphaTest = doorOpacity < 0.999 ? 0 : (ditherMaterial.userData._baseAlphaTest ?? ditherMaterial.alphaTest);
                    this.setOrderedDitherOpacity(material, doorOpacity, 1, 1);
                }
            });
        }
    }

    private createControlsOverlay() {
        const host = this.container.parentElement || this.container;
        host.style.touchAction = "none";

        const overlay = document.createElement("div");
        overlay.className = "pointer-events-none absolute inset-0 z-20";
        overlay.style.fontFamily = "inherit";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "80";
        this.controlsOverlay = overlay;

        const panel = document.createElement("div");
        panel.className = "pointer-events-auto absolute right-3 top-3 flex flex-wrap items-center justify-end gap-2 rounded-md3-lg border border-outline-variant bg-surface-container-high p-2 type-label-s text-on-surface shadow-elev-2";
        panel.style.pointerEvents = "auto";
        panel.style.zIndex = "120";
        panel.style.touchAction = "manipulation";
        overlay.appendChild(panel);

        const freeButton = this.createOverlayButton(this.options.messages.freeView, () => this.applyViewMode("free"));
        const fixedButton = this.createOverlayButton(this.options.messages.fixedView, () => this.applyViewMode("fixed"));
        this.pointerLockButton = this.createIconOverlayButton(this.pointerLockIconSvg(false), this.options.messages.pointerLock, () => this.togglePointerLock());
        this.fullscreenButton = this.createIconOverlayButton(this.fullscreenIconSvg(false), this.options.messages.fullscreen, () => void this.toggleFullscreen());
        this.cycleSiteButton = this.createIconOverlayButton(this.cycleSiteIconSvg(), this.options.messages.cycleLayout, () => this.callbacks.onCycleSite?.());
        this.bgmButton = this.createIconOverlayButton(this.bgmIconSvg(false), this.options.messages.playBgm, () => this.toggleBgm());
        freeButton.dataset.viewModeButton = "free";
        fixedButton.dataset.viewModeButton = "fixed";
        panel.append(freeButton, fixedButton, this.cycleSiteButton, this.bgmButton, this.pointerLockButton, this.fullscreenButton);

        const bgmPanel = document.createElement("div");
        bgmPanel.className = "pointer-events-auto absolute right-3 top-[4.35rem] flex max-w-[min(360px,calc(100%-1.5rem))] items-center gap-2 rounded-md3-lg border border-outline-variant bg-inverse-surface px-3 py-2 type-label-s text-inverse-on-surface shadow-elev-2";
        bgmPanel.style.pointerEvents = "auto";
        bgmPanel.style.zIndex = "110";
        this.bgmInfoElement = document.createElement("div");
        this.bgmInfoElement.className = "min-w-0 flex-1 truncate type-label-s";
        this.bgmVolumeInput = document.createElement("input");
        this.bgmVolumeInput.type = "range";
        this.bgmVolumeInput.min = "0";
        this.bgmVolumeInput.max = "100";
        this.bgmVolumeInput.value = String(Math.round(this.bgmVolume * 100));
        this.bgmVolumeInput.className = "h-10 w-24 accent-primary focus-ring";
        this.bgmVolumeInput.title = this.options.messages.bgmVolume;
        this.bgmVolumeInput.setAttribute("aria-label", this.options.messages.bgmVolume);
        this.bgmVolumeInput.addEventListener("pointerdown", (event) => event.stopPropagation());
        this.bgmVolumeInput.addEventListener("click", (event) => event.stopPropagation());
        this.bgmVolumeInput.addEventListener("input", this.handleBgmVolumeChange);
        bgmPanel.append(this.bgmInfoElement, this.bgmVolumeInput);
        overlay.appendChild(bgmPanel);

        const hint = document.createElement("div");
        hint.className = "pointer-events-none absolute left-3 top-3 max-w-[min(360px,calc(100%-1.5rem))] rounded-md3-md border border-outline-variant bg-inverse-surface px-3 py-2 type-label-s leading-relaxed text-inverse-on-surface shadow-elev-2";
        hint.textContent = this.options.messages.shortcutHint;
        this.hintElement = hint;
        overlay.appendChild(hint);

        const crosshair = document.createElement("div");
        crosshair.className = "pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-on-surface";
        crosshair.innerHTML = this.materialIconSvg(mdCenterFocusStrong, 28);
        this.crosshairElement = crosshair;
        overlay.appendChild(crosshair);

        const mobileControls = document.createElement("div");
        mobileControls.className = "pointer-events-none absolute inset-0 hidden touch-none";
        mobileControls.style.zIndex = "20";
        mobileControls.innerHTML = `
            <div data-mysekai-joystick class="pointer-events-auto absolute bottom-8 left-6 h-28 w-28 touch-none rounded-full border border-outline-variant bg-surface-container-high/80 shadow-elev-2">
                <div data-mysekai-joystick-knob class="absolute left-1/2 top-1/2 -ml-6 -mt-6 h-12 w-12 rounded-full border border-outline bg-primary shadow-elev-1" style="transform:translate(0px,0px);"></div>
            </div>
            <div class="pointer-events-auto absolute bottom-8 right-6 z-[60] flex touch-none flex-col gap-3">
                <button data-mysekai-mobile-up type="button" aria-label="${this.options.messages.mobileUp}" class="state-layer focus-ring flex h-14 w-14 touch-none items-center justify-center rounded-full border border-outline-variant bg-surface-container-high text-on-surface shadow-elev-2 transition-[background-color,border-color,box-shadow,color] duration-200 ease-md3-standard active:rounded-md3-sm">${this.materialIconSvg(mdArrowUpward, 26)}</button>
                <button data-mysekai-mobile-down type="button" aria-label="${this.options.messages.mobileDown}" class="state-layer focus-ring flex h-14 w-14 touch-none items-center justify-center rounded-full border border-outline-variant bg-surface-container-high text-on-surface shadow-elev-2 transition-[background-color,border-color,box-shadow,color] duration-200 ease-md3-standard active:rounded-md3-sm">${this.materialIconSvg(mdArrowDownward, 26)}</button>
            </div>
            <div data-mysekai-look-zone class="pointer-events-auto absolute bottom-0 right-0 top-0 z-10 w-[58%]"></div>
        `;
        this.mobileControlsElement = mobileControls;
        const joystick = mobileControls.querySelector<HTMLElement>("[data-mysekai-joystick]");
        const lookZone = mobileControls.querySelector<HTMLElement>("[data-mysekai-look-zone]");
        const mobileUpButton = mobileControls.querySelector<HTMLButtonElement>("[data-mysekai-mobile-up]");
        const mobileDownButton = mobileControls.querySelector<HTMLButtonElement>("[data-mysekai-mobile-down]");
        this.joystickKnobElement = mobileControls.querySelector<HTMLDivElement>("[data-mysekai-joystick-knob]");
        joystick?.addEventListener("pointerdown", this.handleJoystickPointerDown);
        joystick?.addEventListener("pointermove", this.handleJoystickPointerMove);
        joystick?.addEventListener("pointerup", this.handleJoystickPointerUp);
        joystick?.addEventListener("pointercancel", this.handleJoystickPointerUp);
        lookZone?.addEventListener("pointerdown", this.handleLookPointerDown);
        lookZone?.addEventListener("pointermove", this.handleLookPointerMove);
        lookZone?.addEventListener("pointerup", this.handleLookPointerUp);
        lookZone?.addEventListener("pointercancel", this.handleLookPointerUp);
        mobileUpButton?.addEventListener("pointerdown", this.handleMobileUpPointerDown);
        mobileUpButton?.addEventListener("pointermove", (event) => { event.preventDefault(); event.stopPropagation(); });
        mobileUpButton?.addEventListener("pointerup", this.handleMobileVerticalPointerUp);
        mobileUpButton?.addEventListener("pointercancel", this.handleMobileVerticalPointerUp);
        mobileDownButton?.addEventListener("pointerdown", this.handleMobileDownPointerDown);
        mobileDownButton?.addEventListener("pointermove", (event) => { event.preventDefault(); event.stopPropagation(); });
        mobileDownButton?.addEventListener("pointerup", this.handleMobileVerticalPointerUp);
        mobileDownButton?.addEventListener("pointercancel", this.handleMobileVerticalPointerUp);
        overlay.appendChild(mobileControls);

        host.appendChild(overlay);
        this.refreshOverlayState();
    }

    private createOverlayButton(label: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.className = "state-layer focus-ring min-h-10 rounded-full border border-outline-variant bg-surface-container-high px-3 py-2 type-label-l text-on-surface shadow-elev-1 transition-[background-color,border-color,box-shadow,color] duration-200 ease-md3-standard hover:bg-surface-container-highest active:rounded-md3-sm";
        button.style.touchAction = "manipulation";
        button.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
        });
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    private createIconOverlayButton(svg: string, label: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.innerHTML = svg;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.className = "state-layer focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container-high text-on-surface-variant shadow-elev-1 transition-[background-color,border-color,box-shadow,color] duration-200 ease-md3-standard hover:bg-surface-container-highest active:rounded-md3-sm disabled:opacity-38 [&_svg]:h-5 [&_svg]:w-5";
        button.style.touchAction = "manipulation";
        button.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
        });
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    private materialIconSvg(path: string, size = 24): string {
        return `<svg viewBox="0 -960 960 960" width="${size}" height="${size}" fill="currentColor" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
    }

    private pointerLockIconSvg(active: boolean): string {
        return this.materialIconSvg(active ? mdLock : mdLockOpen);
    }

    private fullscreenIconSvg(active: boolean): string {
        return this.materialIconSvg(active ? mdFullscreenExit : mdFullscreen);
    }

    private bgmIconSvg(active: boolean): string {
        return this.materialIconSvg(active ? mdPause : mdPlayArrow);
    }

    private cycleSiteIconSvg(): string {
        return this.materialIconSvg(mdRefresh);
    }

    private refreshOverlayTexts() {
        if (!this.controlsOverlay) return;
        const freeButton = this.controlsOverlay.querySelector<HTMLButtonElement>('[data-view-mode-button="free"]');
        const fixedButton = this.controlsOverlay.querySelector<HTMLButtonElement>('[data-view-mode-button="fixed"]');
        if (freeButton) {
            freeButton.textContent = this.options.messages.freeView;
            freeButton.title = this.options.messages.freeView;
            freeButton.setAttribute("aria-label", this.options.messages.freeView);
        }
        if (fixedButton) {
            fixedButton.textContent = this.options.messages.fixedView;
            fixedButton.title = this.options.messages.fixedView;
            fixedButton.setAttribute("aria-label", this.options.messages.fixedView);
        }
        if (this.bgmVolumeInput) {
            this.bgmVolumeInput.title = this.options.messages.bgmVolume;
            this.bgmVolumeInput.setAttribute("aria-label", this.options.messages.bgmVolume);
        }
        if (this.hintElement) this.hintElement.textContent = this.options.messages.shortcutHint;
        const mobileUpButton = this.mobileControlsElement?.querySelector<HTMLButtonElement>("[data-mysekai-mobile-up]");
        const mobileDownButton = this.mobileControlsElement?.querySelector<HTMLButtonElement>("[data-mysekai-mobile-down]");
        mobileUpButton?.setAttribute("aria-label", this.options.messages.mobileUp);
        mobileUpButton?.setAttribute("title", this.options.messages.mobileUp);
        mobileDownButton?.setAttribute("aria-label", this.options.messages.mobileDown);
        mobileDownButton?.setAttribute("title", this.options.messages.mobileDown);
    }

    private refreshBgmOverlayState() {
        const hasBgm = !!this.currentBgm;
        const title = this.bgmError
            ? interpolateRuntimeMessage(this.options.messages.bgmErrorTitle, { message: this.bgmError })
            : hasBgm
                ? interpolateRuntimeMessage(
                    this.bgmPlaying ? this.options.messages.pauseBgm : this.bgmLoading ? this.options.messages.loadingBgm : this.options.messages.playBgmTitle,
                    { title: this.currentBgm?.title || "" },
                )
                : this.options.messages.noBgmTitle;
        if (this.bgmButton) {
            this.bgmButton.disabled = !hasBgm || this.bgmLoading;
            this.bgmButton.innerHTML = this.bgmIconSvg(this.bgmPlaying || this.bgmLoading);
            this.bgmButton.title = title;
            this.bgmButton.setAttribute("aria-label", title);
            this.bgmButton.className = this.bgmPlaying
                ? "state-layer focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-primary bg-primary text-on-primary shadow-elev-1 transition-[background-color,border-color,box-shadow,color] duration-200 ease-md3-standard active:rounded-md3-sm disabled:opacity-38 [&_svg]:h-5 [&_svg]:w-5"
                : "state-layer focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container-high text-on-surface-variant shadow-elev-1 transition-[background-color,border-color,box-shadow,color] duration-200 ease-md3-standard hover:bg-surface-container-highest active:rounded-md3-sm disabled:opacity-38 [&_svg]:h-5 [&_svg]:w-5";
        }
        if (this.bgmInfoElement) {
            this.bgmInfoElement.textContent = this.bgmError
                ? interpolateRuntimeMessage(this.options.messages.bgmInfo, { text: this.bgmError })
                : hasBgm
                    ? interpolateRuntimeMessage(this.options.messages.bgmInfo, { text: `${this.currentBgm?.title}${this.currentBgm?.subtitle ? ` · ${this.currentBgm.subtitle}` : ""}` })
                    : this.options.messages.noBgmInfo;
            this.bgmInfoElement.title = this.bgmInfoElement.textContent;
        }
        if (this.bgmVolumeInput) {
            this.bgmVolumeInput.value = String(Math.round(this.bgmVolume * 100));
            this.bgmVolumeInput.disabled = !hasBgm;
        }
    }

    private refreshOverlayState() {
        if (!this.controlsOverlay) return;
        const touchDevice = this.isTouchDevice();
        if (this.hintElement) this.hintElement.style.display = touchDevice ? "none" : "block";
        for (const button of Array.from(this.controlsOverlay.querySelectorAll<HTMLButtonElement>("[data-view-mode-button]"))) {
            const active = button.dataset.viewModeButton === this.viewMode;
            button.className = active
                ? "state-layer focus-ring min-h-10 rounded-full border border-primary bg-primary px-3 py-2 type-label-l text-on-primary shadow-elev-1 transition-[background-color,border-color,box-shadow,color] duration-200 ease-md3-standard active:rounded-md3-sm"
                : "state-layer focus-ring min-h-10 rounded-full border border-outline-variant bg-surface-container-high px-3 py-2 type-label-l text-on-surface shadow-elev-1 transition-[background-color,border-color,box-shadow,color] duration-200 ease-md3-standard hover:bg-surface-container-highest active:rounded-md3-sm";
            button.setAttribute("aria-pressed", String(active));
        }
        if (this.pointerLockButton) {
            this.pointerLockButton.disabled = this.viewMode !== "free" || touchDevice;
            this.pointerLockButton.innerHTML = this.pointerLockIconSvg(this.pointerLocked);
            this.pointerLockButton.title = this.pointerLocked ? this.options.messages.releasePointerLock : this.options.messages.pointerLock;
            this.pointerLockButton.setAttribute("aria-label", this.pointerLockButton.title);
            this.pointerLockButton.style.display = touchDevice ? "none" : "flex";
            this.pointerLockButton.className = this.pointerLocked
                ? "state-layer focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-primary bg-primary text-on-primary shadow-elev-1 transition-[background-color,border-color,box-shadow,color] duration-200 ease-md3-standard active:rounded-md3-sm [&_svg]:h-5 [&_svg]:w-5"
                : "state-layer focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container-high text-on-surface-variant shadow-elev-1 transition-[background-color,border-color,box-shadow,color] duration-200 ease-md3-standard hover:bg-surface-container-highest active:rounded-md3-sm disabled:opacity-38 [&_svg]:h-5 [&_svg]:w-5";
        }
        if (this.fullscreenButton) {
            this.fullscreenButton.innerHTML = this.fullscreenIconSvg(this.isFullscreen);
            this.fullscreenButton.title = this.isFullscreen ? this.options.messages.exitFullscreen : this.options.messages.fullscreen;
            this.fullscreenButton.setAttribute("aria-label", this.fullscreenButton.title);
        }
        if (this.cycleSiteButton) {
            this.cycleSiteButton.innerHTML = this.cycleSiteIconSvg();
            this.cycleSiteButton.title = this.options.messages.cycleLayout;
            this.cycleSiteButton.setAttribute("aria-label", this.options.messages.cycleLayout);
        }
        this.refreshBgmOverlayState();
        if (this.crosshairElement) this.crosshairElement.classList.toggle("hidden", this.viewMode !== "free");
        if (this.mobileControlsElement) this.mobileControlsElement.classList.toggle("hidden", !(this.viewMode === "free" && this.isTouchDevice()));
    }

    private isTouchDevice(): boolean {
        return window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    }

    private applyNativeFullscreenSizing(active: boolean) {
        const host = this.container.parentElement || this.container;
        if (active) {
            host.style.width = "100vw";
            host.style.height = "100dvh";
            host.style.minHeight = "100dvh";
            host.style.borderRadius = "0";
            host.style.background = "var(--md-sys-color-surface-container-lowest)";
        } else if (!this.isPseudoFullscreen) {
            host.style.width = "";
            host.style.height = "";
            host.style.minHeight = "";
            host.style.borderRadius = "";
            host.style.background = "";
        }
    }

    private applyViewMode(mode: MysekaiViewMode, save = true) {
        this.viewMode = mode;
        this.controls.enabled = mode === "fixed";
        if (mode === "free") {
            this.syncFreeLookAnglesFromCamera();
            this.applyFreeLookRotation();
            this.requestContinuousRender(260);
        } else {
            this.exitPointerLock();
            this.controls.target.copy(this.camera.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).multiplyScalar(20));
            this.controls.update();
        }
        this.refreshOverlayState();
        if (save) this.saveCameraState();
        this.requestRender();
    }

    private syncFreeLookAnglesFromCamera() {
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        this.freeLookYaw = Math.atan2(-direction.x, -direction.z);
        this.freeLookPitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    }

    private applyFreeLookRotation() {
        this.freeLookPitch = THREE.MathUtils.clamp(this.freeLookPitch, -FREE_LOOK_PITCH_LIMIT, FREE_LOOK_PITCH_LIMIT);
        this.camera.rotation.set(this.freeLookPitch, this.freeLookYaw, 0, "YXZ");
    }

    private getFreeLookBounds(): FreeLookBounds {
        const width = Number(this.currentSiteSize.width || 80);
        const depth = Number(this.currentSiteSize.depth || 80);
        const height = Number(this.currentSiteSize.height || 10);
        const margin = 6;
        return { minX: -width / 2 - margin, maxX: width / 2 + margin, minY: 0.8, maxY: Math.max(height + 12, 24), minZ: -depth / 2 - margin, maxZ: depth / 2 + margin };
    }

    private clampFreeLookPosition() {
        const b = this.getFreeLookBounds();
        this.camera.position.set(THREE.MathUtils.clamp(this.camera.position.x, b.minX, b.maxX), THREE.MathUtils.clamp(this.camera.position.y, b.minY, b.maxY), THREE.MathUtils.clamp(this.camera.position.z, b.minZ, b.maxZ));
    }

    private togglePointerLock() {
        if (this.viewMode !== "free") return;
        if (this.pointerLocked) this.exitPointerLock();
        else this.renderer.domElement.requestPointerLock?.();
    }

    private exitPointerLock() {
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock?.();
        this.pointerLocked = false;
        this.refreshOverlayState();
    }

    private handlePointerLockChange = () => {
        this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
        this.refreshOverlayState();
        this.requestRender();
    };

    private handleCanvasMouseDown = (event: MouseEvent) => {
        if (this.viewMode !== "free" || this.pointerLocked || event.button !== 0) return;
        this.mouseLookDragging = true;
        this.requestContinuousRender(500);
    };

    private handleMouseMove = (event: MouseEvent) => {
        if (this.viewMode !== "free") return;
        if (!this.pointerLocked && !this.mouseLookDragging) return;
        this.freeLookYaw -= event.movementX * FREE_LOOK_BASE_MOUSE_SENSITIVITY * this.options.lookSensitivity;
        this.freeLookPitch -= event.movementY * FREE_LOOK_BASE_MOUSE_SENSITIVITY * this.options.lookSensitivity;
        this.applyFreeLookRotation();
        this.requestContinuousRender(260);
    };

    private handleMouseUp = () => {
        if (this.mouseLookDragging) {
            this.mouseLookDragging = false;
            this.saveCameraState();
        }
    };

    private async toggleFullscreen() {
        const host = this.container.parentElement || this.container;
        if (!this.isFullscreen) {
            try {
                const element = host as FullscreenElement;
                if (element.requestFullscreen) await element.requestFullscreen();
                else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
                else throw new Error("fullscreen unsupported");
                try { await (screen.orientation as ScreenOrientation & { lock(o: string): Promise<void> }).lock("landscape"); } catch { /* unsupported or not allowed */ }
            } catch {
                this.enterPseudoFullscreen(host);
            }
        } else {
            try { screen.orientation.unlock(); } catch { /* ignore */ }
            try {
                const fullscreenDocument = document as FullscreenDocument;
                if (document.fullscreenElement) await document.exitFullscreen();
                else if (fullscreenDocument.webkitFullscreenElement && fullscreenDocument.webkitExitFullscreen) await fullscreenDocument.webkitExitFullscreen();
                else this.exitPseudoFullscreen();
            } catch {
                this.exitPseudoFullscreen();
            }
        }
        this.handleResize();
    }

    private enterPseudoFullscreen(host: HTMLElement) {
        this.fullscreenHost = host;
        this.fullscreenRestoreStyle = { position: host.style.position, inset: host.style.inset, zIndex: host.style.zIndex,             width: host.style.width,
            height: host.style.height,
            minHeight: host.style.minHeight,
            borderRadius: host.style.borderRadius, background: host.style.background };
        Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "9999",             width: "100vw",
            height: "100dvh",
            minHeight: "100dvh",
            borderRadius: "0", background: "var(--md-sys-color-surface-container-lowest)" });
        this.isPseudoFullscreen = true;
        this.isFullscreen = true;
        this.refreshOverlayState();
    }

    private exitPseudoFullscreen() {
        if (this.fullscreenHost && this.fullscreenRestoreStyle) Object.assign(this.fullscreenHost.style, this.fullscreenRestoreStyle);
        this.fullscreenHost = null;
        this.fullscreenRestoreStyle = null;
        this.isPseudoFullscreen = false;
        this.isFullscreen = !!document.fullscreenElement || !!(document as FullscreenDocument).webkitFullscreenElement;
        this.refreshOverlayState();
        this.handleResize();
    }

    private handleFullscreenChange = () => {
        const fullscreenDocument = document as FullscreenDocument;
        const host = this.container.parentElement || this.container;
        const active = document.fullscreenElement === host || fullscreenDocument.webkitFullscreenElement === host;
        if (!active) {
            try { screen.orientation.unlock(); } catch { /* ignore */ }
        }
        this.applyNativeFullscreenSizing(active);
        if (!active && this.isPseudoFullscreen) return;
        this.isFullscreen = active || this.isPseudoFullscreen;
        this.refreshOverlayState();
        this.handleResize();
    };

    private handleJoystickPointerDown = (event: PointerEvent) => {
        if (this.viewMode !== "free" || this.joystickPointerId !== null) return;
        const target = event.currentTarget as HTMLElement;
        this.joystickPointerId = event.pointerId;
        target.setPointerCapture(event.pointerId);
        const rect = target.getBoundingClientRect();
        this.joystickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        this.updateJoystick(event.clientX, event.clientY);
    };

    private handleJoystickPointerMove = (event: PointerEvent) => {
        if (event.pointerId !== this.joystickPointerId) return;
        this.updateJoystick(event.clientX, event.clientY);
    };

    private handleJoystickPointerUp = (event: PointerEvent) => {
        if (event.pointerId !== this.joystickPointerId) return;
        this.joystickPointerId = null;
        this.joystickVector = { x: 0, y: 0 };
        if (this.joystickKnobElement) this.joystickKnobElement.style.transform = "translate(0px,0px)";
        this.saveCameraState();
    };

    private updateJoystick(clientX: number, clientY: number) {
        const radius = 42;
        const dx = clientX - this.joystickOrigin.x;
        const dy = clientY - this.joystickOrigin.y;
        const len = Math.hypot(dx, dy);
        const scale = len > radius ? radius / len : 1;
        const nx = dx * scale;
        const ny = dy * scale;
        this.joystickVector = { x: nx / radius, y: ny / radius };
        if (this.joystickKnobElement) this.joystickKnobElement.style.transform = `translate(${nx}px, ${ny}px)`;
        this.requestContinuousRender(260);
    }

    private handleMobileUpPointerDown = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.keyState.mobileUp = true;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        this.requestContinuousRender(260);
    };

    private handleMobileDownPointerDown = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.keyState.mobileDown = true;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        this.requestContinuousRender(260);
    };

    private handleMobileVerticalPointerUp = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.keyState.mobileUp = false;
        this.keyState.mobileDown = false;
        this.requestRender();
    };

    private handleLookPointerDown = (event: PointerEvent) => {
        if (this.viewMode !== "free" || this.lookPointerId !== null) return;
        const target = event.currentTarget as HTMLElement;
        this.lookPointerId = event.pointerId;
        target.setPointerCapture(event.pointerId);
        this.lastLookPoint = { x: event.clientX, y: event.clientY };
    };

    private handleLookPointerMove = (event: PointerEvent) => {
        if (event.pointerId !== this.lookPointerId) return;
        const dx = event.clientX - this.lastLookPoint.x;
        const dy = event.clientY - this.lastLookPoint.y;
        this.lastLookPoint = { x: event.clientX, y: event.clientY };
        this.freeLookYaw -= dx * FREE_LOOK_BASE_TOUCH_SENSITIVITY * this.options.lookSensitivity;
        this.freeLookPitch -= dy * FREE_LOOK_BASE_TOUCH_SENSITIVITY * this.options.lookSensitivity;
        this.applyFreeLookRotation();
        this.requestContinuousRender(260);
    };

    private handleLookPointerUp = (event: PointerEvent) => {
        if (event.pointerId !== this.lookPointerId) return;
        this.lookPointerId = null;
        this.saveCameraState();
    };

    private handleResize = () => {
        const pixelRatio = Math.min(window.devicePixelRatio, MAX_RENDER_PIXEL_RATIO);
        this.renderer.setPixelRatio(pixelRatio);
        this.axesRenderer.setPixelRatio(pixelRatio);

        const width = Math.max(this.container.clientWidth || 1, 1);
        const height = Math.max(this.container.clientHeight || 1, 1);
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        const axesWidth = Math.max(this.axesContainer.clientWidth || 1, 1);
        const axesHeight = Math.max(this.axesContainer.clientHeight || 1, 1);
        this.axesRenderer.setSize(axesWidth, axesHeight);
        this.axesCamera.aspect = axesWidth / axesHeight;
        this.axesCamera.updateProjectionMatrix();
        this.requestRender();
    };

    private handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
        if (!event.repeat && event.key === "Alt") {
            if (this.viewMode === "free") {
                event.preventDefault();
                this.togglePointerLock();
            }
            return;
        }
        if (!event.repeat && event.code === "F10") {
            event.preventDefault();
            void this.toggleFullscreen();
            return;
        }
        if (!event.repeat && event.code === "F8") {
            event.preventDefault();
            this.callbacks.onCycleSite?.();
            return;
        }
        const key = String(event.key || "").toLowerCase();
        if (key === "w" || key === "s" || key === "a" || key === "d") this.keyState[key] = true;
        if (event.code === "Space") this.keyState.space = true;
        if (event.code === "ShiftLeft" || event.code === "ShiftRight") this.keyState.shift = true;
        if (this.viewMode === "free" && this.isCameraKeyActive()) event.preventDefault();
        if (this.isCameraKeyActive()) this.requestContinuousRender();
    };

    private handleKeyUp = (event: KeyboardEvent) => {
        const key = String(event.key || "").toLowerCase();
        if (key === "w" || key === "s" || key === "a" || key === "d") this.keyState[key] = false;
        if (event.code === "Space") this.keyState.space = false;
        if (event.code === "ShiftLeft" || event.code === "ShiftRight") this.keyState.shift = false;
        this.requestRender();
    };

    private isCameraKeyActive(): boolean {
        return this.keyState.w || this.keyState.s || this.keyState.a || this.keyState.d || this.keyState.space || this.keyState.shift || this.keyState.mobileUp || this.keyState.mobileDown;
    }

    private handleControlsChange = () => {
        this.requestContinuousRender(180);
    };

    private handleControlsStart = () => {
        this.requestContinuousRender(500);
    };

    private handleControlsEnd = () => {
        this.saveCameraState();
        this.requestContinuousRender(260);
    };

    private moveCameraRig(offset: THREE.Vector3) {
        this.camera.position.add(offset);
        this.controls.target.add(offset);
        this.controls.update();
    }

    private requestRender() {
        if (this.disposed || this.renderPending) return;
        this.renderPending = true;
        this.rafId = requestAnimationFrame(this.tick);
    }

    private requestContinuousRender(durationMs = 220) {
        this.continuousRenderUntil = Math.max(this.continuousRenderUntil, performance.now() + durationMs);
        this.requestRender();
    }

    private renderOnce() {
        if (this.viewMode === "fixed") this.controls.update();
        this.applyBackFacingOpacity();
        this.renderer.render(this.scene, this.camera);
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        this.axesCamera.position.copy(direction.clone().multiplyScalar(-2.5));
        this.axesCamera.up.copy(this.camera.up);
        this.axesCamera.lookAt(0, 0, 0);
        this.axesRenderer.render(this.axesScene, this.axesCamera);
    }

    private hasMobileFreeLookInput(): boolean {
        return Math.abs(this.joystickVector.x) > 0.01 || Math.abs(this.joystickVector.y) > 0.01 || this.lookPointerId !== null || this.pointerLocked || this.mouseLookDragging;
    }

    private updateFreeLookMovement(deltaSeconds: number) {
        const forward = new THREE.Vector3(-Math.sin(this.freeLookYaw), 0, -Math.cos(this.freeLookYaw));
        const right = new THREE.Vector3(Math.cos(this.freeLookYaw), 0, -Math.sin(this.freeLookYaw));
        const offset = this.freeLookMoveVector.set(0, 0, 0);
        if (this.keyState.w) offset.add(forward);
        if (this.keyState.s) offset.sub(forward);
        if (this.keyState.d) offset.add(right);
        if (this.keyState.a) offset.sub(right);
        if (Math.abs(this.joystickVector.y) > 0.01) offset.addScaledVector(forward, -this.joystickVector.y);
        if (Math.abs(this.joystickVector.x) > 0.01) offset.addScaledVector(right, this.joystickVector.x);
        if (offset.lengthSq() > 1) offset.normalize();
        const speed = FREE_LOOK_MOVE_SPEED * (this.keyState.shift ? FREE_LOOK_FAST_MULTIPLIER : 1) * deltaSeconds;
        this.camera.position.addScaledVector(offset, speed);
        if (this.keyState.space || this.keyState.mobileUp) this.camera.position.y += FREE_LOOK_MOVE_SPEED * deltaSeconds;
        if (this.keyState.mobileDown) this.camera.position.y -= FREE_LOOK_MOVE_SPEED * deltaSeconds;
        if (this.keyState.shift && !(this.keyState.w || this.keyState.a || this.keyState.s || this.keyState.d)) this.camera.position.y -= FREE_LOOK_MOVE_SPEED * deltaSeconds;
        this.clampFreeLookPosition();
        this.applyFreeLookRotation();
    }

    private tick = () => {
        if (this.disposed) return;
        this.renderPending = false;
        const now = performance.now();
        const deltaSeconds = this.lastTickTime ? Math.min((now - this.lastTickTime) / 1000, 0.05) : 1 / 60;
        this.lastTickTime = now;

        if (this.viewMode === "free") {
            this.updateFreeLookMovement(deltaSeconds);
        } else {
            const moveSpeed = 0.35;
            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            forward.y = 0;
            if (forward.lengthSq() > 1e-8) forward.normalize();
            const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
            const offset = new THREE.Vector3();
            if (this.keyState.w) offset.addScaledVector(forward, moveSpeed);
            if (this.keyState.s) offset.addScaledVector(forward, -moveSpeed);
            if (this.keyState.d) offset.addScaledVector(right, moveSpeed);
            if (this.keyState.a) offset.addScaledVector(right, -moveSpeed);
            if (this.keyState.space) offset.y += moveSpeed;
            if (this.keyState.shift) offset.y -= moveSpeed;
            if (offset.lengthSq() > 0) this.moveCameraRig(offset);
        }

        this.renderOnce();
        if (this.isCameraKeyActive() || this.hasMobileFreeLookInput() || now < this.continuousRenderUntil) {
            this.requestRender();
        }
    };

    private saveCameraState = () => {
        try {
            const state = {
                cameraPos: this.camera.position.toArray(),
                controlsTarget: this.controls.target.toArray(),
                cameraUp: this.camera.up.toArray(),
                viewMode: this.viewMode,
                freeLookYaw: this.freeLookYaw,
                freeLookPitch: this.freeLookPitch,
            };
            localStorage.setItem("mysekai-preview-camera", JSON.stringify(state));
        } catch {
            // ignore localStorage failures
        }
    };

    private loadCameraState() {
        try {
            const raw = localStorage.getItem("mysekai-preview-camera");
            if (!raw) return;
            const state = JSON.parse(raw) as SavedMysekaiCameraState;
            if (state.cameraPos?.length === 3 && state.controlsTarget?.length === 3) {
                this.camera.position.fromArray(state.cameraPos);
                this.controls.target.fromArray(state.controlsTarget);
                if (state.cameraUp?.length === 3) this.camera.up.fromArray(state.cameraUp);
                if (state.viewMode === "free" || state.viewMode === "fixed") this.viewMode = state.viewMode;
                if (Number.isFinite(state.freeLookYaw) && Number.isFinite(state.freeLookPitch)) {
                    this.freeLookYaw = Number(state.freeLookYaw);
                    this.freeLookPitch = Number(state.freeLookPitch);
                } else {
                    this.syncFreeLookAnglesFromCamera();
                }
                this.controls.update();
                this.restoredCameraState = true;
            }
        } catch {
            // ignore corrupted camera state
        }
    }
}
