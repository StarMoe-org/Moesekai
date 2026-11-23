import { LIVE2D_VIEWER_AVAILABLE, live2dViewerScriptBase, type Live2DViewerErrorKind, type Live2DViewerMissing } from "./viewer";

/**
 * The multi-model stage of the Live2D viewer release (SekaiLive2DStage, `stage.js` beside
 * `viewer.js`): one WebGPU device and canvas, up to 8 models (actors) placed on the game's story
 * camera. It is loaded at runtime from the vendored release, so it is declared here as the release
 * documents it (v0 contract). A release without `stage.js` reports `live2d_stage_unavailable`.
 */

export type Live2DStageErrorKind = Live2DViewerErrorKind;
export type Live2DStageMissing = Live2DViewerMissing;

export interface Live2DStageError extends Error {
    kind?: Live2DStageErrorKind;
    missing?: Live2DStageMissing[];
    url?: string;
}

export interface Live2DActorPlacement {
    /** Fraction of half the width of a 16:9 frame (-1 left edge, 0 centre, +1 right edge). */
    x?: number;
    /** Vertical offset in world units (0: the game's stand height). */
    y?: number;
    /** Multiplier on the game's stand scale. */
    scale?: number;
    /** Whole-model opacity, 0..1. */
    alpha?: number;
    mirror?: boolean;
    /** Draw order, higher on top. */
    order?: number;
}

export type Live2DStageEasing = "linear" | "in-out" | "in" | "out";

export interface Live2DStageTween {
    /** Seconds; 0 (default) is immediate. */
    duration?: number;
    easing?: Live2DStageEasing;
}

export interface Live2DActorInfo {
    motions: string[];
    facials: string[];
    defaultMotion: string | null;
    defaultFacial: string | null;
    hasPhysics: boolean;
}

export interface Live2DStageOptions {
    /** A new canvas: it is handed to the stage's worker for good. */
    canvas: HTMLCanvasElement;
    /** The release's directory; `stage.js`'s own when left out. */
    js?: string;
    pkg?: string;
    /** The deployment's own Cubism Core for Web. */
    core?: string;
    /** The story library's root, as the browser fetches it. */
    library: string;
    /** The drawing buffer, in device pixels. */
    width: number;
    height: number;
    signal?: AbortSignal;
}

export interface Live2DStage extends EventTarget {
    /** Ids on stage, in draw order. */
    readonly actors: string[];
    readonly paused: boolean;
    /** Loads a model and puts it on stage (re-using an id replaces that actor). */
    addActor(
        id: string,
        model: { bundle: string; motion: string | null },
        placement?: Live2DActorPlacement & { motion?: string; facial?: string },
        onProgress?: (progress: { loaded: number; total: number }) => void,
    ): Promise<Live2DActorInfo>;
    removeActor(id: string): void;
    /** Resolves when the tween ends (false when a later setActor on the actor superseded it). */
    setActor(id: string, placement: Live2DActorPlacement, tween?: Live2DStageTween): Promise<boolean>;
    playMotion(id: string, name: string, options?: { loop?: boolean }): Promise<boolean>;
    setFacial(id: string, name: string): Promise<boolean>;
    /** Built-in lip flap while on. */
    setTalking(id: string, on: boolean): void;
    /** Mouth openness 0..1 (overrides talking); null returns to motion / talking. */
    setMouth(id: string, value: number | null): void;
    setPhysics(on: boolean): void;
    setBreath(on: boolean): void;
    /** Whole-stage camera: zoom ≥ 0.5, x / y pan in NDC. */
    setCamera(camera: { zoom?: number; x?: number; y?: number }, tween?: Live2DStageTween): Promise<boolean>;
    /** Snaps every running tween to its end. */
    finishTweens(): void;
    play(): void;
    pause(): void;
    resize(width: number, height: number): void;
    destroy(): void;
}

export interface Live2DStageStatic {
    supported(): Promise<{ ok: boolean; missing: Live2DStageMissing[] }>;
    create(options: Live2DStageOptions): Promise<Live2DStage>;
}

/** At most this many actors share a stage. */
export const LIVE2D_STAGE_MAX_ACTORS = 8;

/** A viewer release is vendored at all (whether it has the stage is known once `stage.js` loads). */
export const LIVE2D_STAGE_RELEASE_PRESENT = LIVE2D_VIEWER_AVAILABLE;

/** The stage class could not be loaded from the release (none vendored, or one without `stage.js`). */
export const LIVE2D_STAGE_UNAVAILABLE = "live2d_stage_unavailable";

/** Loads the stage class from the release; rejects with `live2d_stage_unavailable` when it has none. */
export async function loadLive2DStage(): Promise<Live2DStageStatic> {
    if (!LIVE2D_VIEWER_AVAILABLE) throw new Error(LIVE2D_STAGE_UNAVAILABLE);
    const url = `${live2dViewerScriptBase()}stage.js`;
    let loaded: { SekaiLive2DStage?: Live2DStageStatic };
    try {
        // The release is served as it was built (vendor/live2d-viewer): keep it out of every bundle.
        loaded = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as { SekaiLive2DStage?: Live2DStageStatic };
    } catch {
        // a release from before the stage: stage.js is not there (404)
        throw new Error(LIVE2D_STAGE_UNAVAILABLE);
    }
    if (typeof loaded.SekaiLive2DStage?.create !== "function" || typeof loaded.SekaiLive2DStage.supported !== "function") {
        throw new Error(LIVE2D_STAGE_UNAVAILABLE);
    }
    return loaded.SekaiLive2DStage;
}
