"use client";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { live2dCoreUrl } from "@/lib/live2dViewer/config";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import { IDENTITY_VIEW, type Live2DView } from "@/lib/live2dViewer/view";
import {
    LIVE2D_VIEWER_AVAILABLE, live2dViewerScriptBase, loadLive2DViewer,
    type Live2DViewer, type Live2DViewerError, type Live2DViewerErrorKind, type Live2DViewerMissing,
} from "@/lib/live2dViewer/viewer";

export type Live2DViewerPhase =
    | { kind: "idle" }
    | { kind: "unavailable" }
    | { kind: "loading"; loaded: number; total: number }
    | { kind: "ready" }
    | { kind: "unsupported"; missing: Live2DViewerMissing[] }
    | { kind: "failed"; error: Live2DViewerErrorKind; message: string; url?: string };

/** What the panel shows of the viewer: its lists and the current choices. */
export interface Live2DViewerState {
    motions: readonly string[];
    facials: readonly string[];
    motion: string | null;
    facial: string | null;
    defaultMotion: string | null;
    defaultFacial: string | null;
    hasPhysics: boolean;
    physics: boolean;
    breath: boolean;
    paused: boolean;
}

function read(viewer: Live2DViewer): Live2DViewerState {
    return {
        motions: viewer.motions,
        facials: viewer.facials,
        motion: viewer.motion,
        facial: viewer.facial,
        defaultMotion: viewer.defaultMotion,
        defaultFacial: viewer.defaultFacial,
        hasPhysics: viewer.hasPhysics,
        physics: viewer.physics,
        breath: viewer.breath,
        paused: viewer.paused,
    };
}

function failure(error: unknown): Live2DViewerPhase {
    const detail = error as Live2DViewerError | undefined;
    if (detail?.kind === "unsupported") return { kind: "unsupported", missing: detail.missing ?? [] };
    return {
        kind: "failed",
        error: detail?.kind ?? "internal",
        message: error instanceof Error ? error.message : String(error),
        ...(detail?.url ? { url: detail.url } : {}),
    };
}

/** Device pixels per CSS pixel the stage is drawn at: sharp on high-density screens, capped at 2. */
function pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, 2);
}

interface UseLive2DViewerOptions {
    /** The story library's root, as fetched. */
    library: string;
    /** The model shown; null for none. */
    model: Live2DModel | null;
}

/**
 * The Live2D model viewer on a stage: one viewer per model, created on a canvas of its own in
 * `hostRef` (the canvas is handed to the viewer's worker and cannot be taken back), destroyed when
 * the model changes or the page is left. The stage's size is followed, and the view (zoom and
 * pan) applied.
 */
export function useLive2DViewer({ library, model }: UseLive2DViewerOptions) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewerRef = useRef<Live2DViewer | null>(null);
    const [attempt, setAttempt] = useState(0);
    const bundle = model?.bundle ?? null;
    // a model without a motion bundle is shown without motions or facials
    const motion = model?.motions[0] ?? null;
    // What each viewer reports is kept with the viewer it is about (`key`): another model, or a
    // retry, starts from a loading stage, no lists and the identity view.
    const key = bundle ? `${library}|${bundle}|${motion ?? ""}|${attempt}` : null;
    const [phaseOf, setPhaseOf] = useState<{ key: string; phase: Live2DViewerPhase } | null>(null);
    const [stateOf, setStateOf] = useState<{ key: string; state: Live2DViewerState } | null>(null);
    const [viewOf, setViewOf] = useState<{ key: string; view: Live2DView } | null>(null);
    const [clipErrorOf, setClipErrorOf] = useState<{ key: string; url: string } | null>(null);
    const phase: Live2DViewerPhase = !LIVE2D_VIEWER_AVAILABLE ? { kind: "unavailable" }
        : !key ? { kind: "idle" }
        : phaseOf?.key === key ? phaseOf.phase
        : { kind: "loading", loaded: 0, total: 0 };
    const state = key && stateOf?.key === key ? stateOf.state : null;
    const view = key && viewOf?.key === key ? viewOf.view : IDENTITY_VIEW;
    /** A motion or facial whose clip could not be fetched (the viewer went on with what it played). */
    const clipError = key && clipErrorOf?.key === key ? clipErrorOf.url : null;

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !key || !bundle || !LIVE2D_VIEWER_AVAILABLE) return;
        const setPhase = (next: Live2DViewerPhase) => setPhaseOf({ key, phase: next });
        const controller = new AbortController();
        const { signal } = controller;
        let viewer: Live2DViewer | null = null;
        const canvas = document.createElement("canvas");
        canvas.className = "absolute inset-0 size-full";
        host.replaceChildren(canvas);

        const follow = () => {
            const rect = host.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width * pixelRatio()));
            const height = Math.max(1, Math.round(rect.height * pixelRatio()));
            viewer?.resize(width, height);
            return [width, height] as const;
        };
        const observer = new ResizeObserver(() => follow());
        const refresh = () => {
            if (viewer && !signal.aborted) setStateOf({ key, state: read(viewer) });
        };

        (async () => {
            const Viewer = await loadLive2DViewer();
            const { ok, missing } = await Viewer.supported();
            if (signal.aborted) return;
            if (!ok) {
                setPhase({ kind: "unsupported", missing });
                return;
            }
            const [width, height] = follow();
            const core = live2dCoreUrl();
            const created = await Viewer.create({
                canvas,
                js: live2dViewerScriptBase(),
                ...(core ? { core } : {}),
                library,
                model: { bundle, motion },
                width,
                height,
                signal,
                onProgress: ({ loaded, total }) => {
                    if (!signal.aborted) setPhase({ kind: "loading", loaded, total });
                },
            });
            if (signal.aborted) {
                created.destroy();
                return;
            }
            viewer = created;
            viewerRef.current = created;
            created.addEventListener("motionstart", refresh);
            created.addEventListener("motionend", refresh);
            created.addEventListener("error", (event) => {
                if (signal.aborted) return;
                setPhase(failure(Object.assign(new Error((event as CustomEvent).detail?.message ?? "internal"), (event as CustomEvent).detail ?? {})));
            });
            observer.observe(host);
            follow();
            refresh();
            setPhase({ kind: "ready" });
        })().catch((error: unknown) => {
            if (!signal.aborted) setPhase(failure(error));
        });

        return () => {
            controller.abort();
            observer.disconnect();
            viewerRef.current = null;
            viewer?.destroy();
            host.replaceChildren();
        };
    }, [key, library, bundle, motion]);

    useEffect(() => {
        viewerRef.current?.setView(view);
    }, [view, state]);

    /**
     * Runs `change` on the viewer, then shows what it did. A motion or facial is fetched the first
     * time it is used, so a change may be a promise: what it did is shown once it settles, and a
     * clip that could not be fetched is told.
     */
    const act = useCallback((change: (viewer: Live2DViewer) => void | Promise<unknown>) => {
        const viewer = viewerRef.current;
        if (!viewer || !key) return;
        const show = () => {
            if (viewerRef.current === viewer) setStateOf({ key, state: read(viewer) });
        };
        let result: void | Promise<unknown>;
        try {
            result = change(viewer);
        } catch {
            // a name the model does not have: nothing changes
            return;
        }
        show();
        if (result instanceof Promise) {
            setClipErrorOf(null);
            result.then(show, (error: unknown) => {
                if (viewerRef.current !== viewer) return;
                const detail = error as Live2DViewerError | undefined;
                setClipErrorOf({ key, url: detail?.url ?? (error instanceof Error ? error.message : String(error)) });
            });
        }
    }, [key]);

    const retry = useCallback(() => setAttempt(value => value + 1), []);
    const setView = useCallback((next: SetStateAction<Live2DView>) => {
        if (!key) return;
        setViewOf(previous => {
            const current = previous?.key === key ? previous.view : IDENTITY_VIEW;
            return { key, view: typeof next === "function" ? next(current) : next };
        });
    }, [key]);

    return { hostRef, phase, state, view, setView, act, clipError, retry };
}
