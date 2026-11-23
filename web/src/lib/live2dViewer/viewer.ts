import { LIVE2D_VIEWER_PATH } from "./config";
import { LIVE2D_VIEWER_RELEASE } from "./release";

/**
 * The interface of the Live2D model viewer (SekaiLive2DViewer), as far as this site uses it, and
 * its loader. The viewer is loaded at runtime from the vendored release, so it is declared here;
 * the release's README documents the full interface.
 */

export type Live2DViewerErrorKind = "unsupported" | "not-found" | "network" | "internal";

/** What a browser lacks for the viewer. */
export type Live2DViewerMissing = "webgpu" | "webgpu-adapter" | "offscreen-canvas" | "worker";

export interface Live2DViewerError extends Error {
    kind?: Live2DViewerErrorKind;
    missing?: Live2DViewerMissing[];
    url?: string;
}

/** The camera: `zoom` ≥ 1, `x` / `y` an offset in normalized device coordinates (-1..1 across the canvas, y up). */
export interface Live2DViewerView {
    zoom: number;
    x: number;
    y: number;
}

export interface Live2DViewerOptions {
    /** A new canvas: it is handed to the viewer's worker for good. */
    canvas: HTMLCanvasElement;
    /** The release's directory (the worker's script and `pkg/`); `viewer.js`'s own when left out. */
    js?: string;
    /** The deployment's own Cubism Core for Web; Live2D's own when left out. */
    core?: string;
    /** The story library's root, as the browser fetches it. */
    library: string;
    /** The model's bundle and its motion bundle (none: no motions or facials), as `models.json` gives them. */
    model: { bundle: string; motion: string | null };
    /** The drawing buffer, in device pixels. */
    width: number;
    height: number;
    signal?: AbortSignal;
    /** Files fetched so far, of how many. */
    onProgress?: (progress: { loaded: number; total: number }) => void;
}

export interface Live2DViewer extends EventTarget {
    readonly motions: readonly string[];
    readonly facials: readonly string[];
    /** The body motion playing and the facial shown (null: none, a model without motions). */
    readonly motion: string | null;
    readonly facial: string | null;
    readonly defaultMotion: string | null;
    readonly defaultFacial: string | null;
    readonly hasPhysics: boolean;
    physics: boolean;
    breath: boolean;
    readonly paused: boolean;
    readonly view: Live2DViewerView;
    readonly error: { message: string; kind: Live2DViewerErrorKind; url?: string } | null;
    /**
     * Plays a motion (once, as the game does, or over and over). The clip is fetched the first time
     * it is used: true once it plays, false when a later call replaced it; rejects when it could
     * not be fetched (the current motion goes on). Throws for a name not in `motions`.
     */
    playMotion(name: string, options?: { loop?: boolean }): Promise<boolean>;
    /** Sets a facial, fetched as `playMotion` fetches a motion. Throws for a name not in `facials`. */
    setFacial(name: string): Promise<boolean>;
    play(): void;
    pause(): void;
    setView(view: Live2DViewerView): void;
    resize(width: number, height: number): void;
    destroy(): void;
}

export interface Live2DViewerStatic {
    supported(): Promise<{ ok: boolean; missing: Live2DViewerMissing[] }>;
    create(options: Live2DViewerOptions): Promise<Live2DViewer>;
}

/** A release is vendored: without one the viewer page says the viewer is not available. */
export const LIVE2D_VIEWER_AVAILABLE = LIVE2D_VIEWER_RELEASE !== null;

/** The directory the viewer's scripts are served from, as a URL of this origin. */
export function live2dViewerScriptBase(): string {
    if (!LIVE2D_VIEWER_RELEASE) throw new Error("live2d_viewer_unavailable");
    return new URL(`${LIVE2D_VIEWER_PATH}${LIVE2D_VIEWER_RELEASE}/`, window.location.origin).href;
}

/** Loads the viewer class from the release. */
export async function loadLive2DViewer(): Promise<Live2DViewerStatic> {
    const url = `${live2dViewerScriptBase()}viewer.js`;
    // The release is served as it was built (vendor/live2d-viewer): keep it out of every bundle.
    const loaded = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as { SekaiLive2DViewer?: Live2DViewerStatic };
    if (typeof loaded.SekaiLive2DViewer?.create !== "function") throw new Error("live2d_viewer_unavailable");
    return loaded.SekaiLive2DViewer;
}
