"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { live2dCoreUrl } from "@/lib/live2dViewer/config";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import {
    LIVE2D_STAGE_UNAVAILABLE, loadLive2DStage,
    type Live2DActorInfo, type Live2DStage, type Live2DStageError, type Live2DStageErrorKind, type Live2DStageMissing,
} from "@/lib/live2dViewer/stage";
import { live2dViewerScriptBase } from "@/lib/live2dViewer/viewer";
import { STORY_FADE_SECONDS } from "@/lib/storyMaker/limits";
import type { StoryActorState, StoryCastMember, StoryStageState } from "@/types/storyMaker";

export type StoryStagePhase =
    | { kind: "idle" }
    | { kind: "unavailable" }
    | { kind: "loading" }
    | { kind: "ready" }
    | { kind: "unsupported"; missing: Live2DStageMissing[] }
    | { kind: "failed"; error: Live2DStageErrorKind; message: string; url?: string };

/** Why one actor is not on the stage. */
export type StoryActorProblem = "modelMissing" | "loadFailed";

export interface StoryStageApplyOptions {
    /** Snap to the target (seeking) rather than play the changes. */
    instant: boolean;
    /** Seconds of moves (a move step's duration). */
    moveSeconds?: number;
    /** Fade actors in and out (appear / hide steps with `fade`). */
    fade?: boolean;
}

export interface StoryClipPreviewRequest {
    motion?: string;
    facial?: string;
}

export interface StoryStageHandle {
    hostRef: RefObject<HTMLDivElement | null>;
    phase: StoryStagePhase;
    modelInfo: Record<string, Live2DActorInfo>;
    problems: Record<string, StoryActorProblem>;
    loadingActors: number;
    apply: (target: StoryStageState, options: StoryStageApplyOptions) => Promise<void>;
    previewClip: (cast: StoryCastMember, clip?: StoryClipPreviewRequest) => Promise<void>;
    clearClipPreview: () => void;
    isSoloPreview: boolean;
    previewingCastKey: string | null;
    setTalking: (speaker: string | null) => void;
    shake: (seconds: number) => Promise<void>;
    finish: () => void;
    retry: () => void;
}

interface AppliedActor {
    modelId: string;
    x: number;
    y: number;
    scale: number;
    mirror: boolean;
    order: number;
    motion: string | null;
    facial: string | null;
    info: Live2DActorInfo | null;
}

interface SoloPreviewActor {
    castKey: string;
    modelId: string;
    info: Live2DActorInfo | null;
}

const SOLO_PREVIEW_ACTOR_ID = "__story_clip_preview__";

function failure(error: unknown): StoryStagePhase {
    if (error instanceof Error && error.message === LIVE2D_STAGE_UNAVAILABLE) return { kind: "unavailable" };
    const detail = error as Live2DStageError | undefined;
    if (detail?.kind === "unsupported") return { kind: "unsupported", missing: detail.missing ?? [] };
    return {
        kind: "failed",
        error: detail?.kind ?? "internal",
        message: error instanceof Error ? error.message : String(error),
        ...(detail?.url ? { url: detail.url } : {}),
    };
}

/** How long the stage keeps one size before the drawing buffer follows it. */
const RESIZE_SETTLE_MS = 150;

function pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, 2);
}

/** A motion the model has: `name`, else its default (null: leave it). */
function pick(name: string | null, list: readonly string[] | undefined, fallback: string | null): string | null {
    if (name && list?.includes(name)) return name;
    return fallback;
}

/**
 * Structural stage fingerprint covering background, place, active beat id, and mounted actor
 * identities/transforms (deliberately excluding per-actor motion/facial so clip auditioning
 * and picking on the same beat do not trigger a structural reset or tear down solo preview).
 */
function stageStructureKey(target: StoryStageState, castList: readonly StoryCastMember[]): string {
    const modelByKey = new Map(castList.map(member => [member.key, member.modelId]));
    const stepId = target.dialogue?.stepId ?? target.narration?.stepId ?? target.telop?.stepId ?? "";
    const actorsSig = target.actors
        .map(actor => `${actor.cast}:${modelByKey.get(actor.cast) ?? ""}:${actor.x}:${actor.y}:${actor.scale}:${actor.mirror ? 1 : 0}`)
        .join(",");
    return `${target.background ?? ""}|${target.place ?? ""}|${stepId}|${actorsSig}`;
}

/** Safely invokes `stage.playMotion` catching both synchronous validation throws and rejections. */
function safePlayMotion(stage: Live2DStage, actorId: string, name: string, loop = false): Promise<boolean> {
    try {
        return stage.playMotion(actorId, name, { loop }).catch(() => false);
    } catch {
        return Promise.resolve(false);
    }
}

/** Safely invokes `stage.setFacial` catching both synchronous validation throws and rejections. */
function safeSetFacial(stage: Live2DStage, actorId: string, name: string): Promise<boolean> {
    try {
        return stage.setFacial(actorId, name).catch(() => false);
    } catch {
        return Promise.resolve(false);
    }
}

interface UseStoryStageOptions {
    /** The story library's root, as fetched; null while unknown. */
    library: string | null;
    cast: readonly StoryCastMember[];
    /** The server's models (null while loading). */
    models: readonly Live2DModel[] | null;
}

/**
 * The story maker's Live2D stage: one SekaiLive2DStage on a canvas of its own in `hostRef`
 * (created for the story's library, destroyed when the page is left). `apply` brings the stage to
 * a StoryStageState by the difference with what it shows: actors added or removed (faded when
 * asked), moved, re-posed. `previewClip` / `clearClipPreview` support live motion & facial
 * auditioning both on mounted stage actors and via a temporary centered solo preview actor.
 */
export function useStoryStage({ library, cast, models }: UseStoryStageOptions): StoryStageHandle {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const stageRef = useRef<Live2DStage | null>(null);
    const appliedRef = useRef(new Map<string, AppliedActor>());
    const infoCacheRef = useRef(new Map<string, Live2DActorInfo>());
    const lastStateRef = useRef<StoryStageState | null>(null);
    const lastStructureKeyRef = useRef<string | null>(null);
    const soloPreviewRef = useRef<SoloPreviewActor | null>(null);
    const hiddenForSoloRef = useRef(new Set<string>());
    const libraryRef = useRef(library);
    const castRef = useRef(cast);
    const modelsRef = useRef(models);
    const queueRef = useRef<Promise<void>>(Promise.resolve());
    const generationRef = useRef(0);
    const structuralGenRef = useRef(0);
    const previewGenRef = useRef(0);
    const [attempt, setAttempt] = useState(0);
    const key = library ? `${library}|${attempt}` : null;
    const [phaseOf, setPhaseOf] = useState<{ key: string; phase: StoryStagePhase } | null>(null);
    /** What each model has (motions, facials), by model id, once it has been on the stage. */
    const [modelInfoByLib, setModelInfoByLib] = useState<{ library: string | null; info: Record<string, Live2DActorInfo> }>({
        library,
        info: {},
    });
    const [problemsByLib, setProblemsByLib] = useState<{ library: string | null; problems: Record<string, StoryActorProblem> }>({
        library,
        problems: {},
    });
    const [loadingActors, setLoadingActors] = useState(0);
    const [soloPreviewByKey, setSoloPreviewByKey] = useState<{ key: string | null; castKey: string | null }>({
        key,
        castKey: null,
    });
    const phase: StoryStagePhase = !key ? { kind: "idle" } : phaseOf?.key === key ? phaseOf.phase : { kind: "loading" };
    const modelInfo: Record<string, Live2DActorInfo> = modelInfoByLib.library === library ? modelInfoByLib.info : {};
    const problems: Record<string, StoryActorProblem> = problemsByLib.library === library ? problemsByLib.problems : {};
    const previewingCastKey = soloPreviewByKey.key === key ? soloPreviewByKey.castKey : null;
    const isSoloPreview = previewingCastKey !== null;

    useEffect(() => {
        castRef.current = cast;
        modelsRef.current = models;
    }, [cast, models]);

    useEffect(() => {
        libraryRef.current = library;
        infoCacheRef.current.clear();
    }, [library]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !key || !library) return;
        const setPhase = (next: StoryStagePhase) => setPhaseOf({ key, phase: next });
        const controller = new AbortController();
        const { signal } = controller;
        let stage: Live2DStage | null = null;
        const canvas = document.createElement("canvas");
        canvas.className = "absolute inset-0 size-full";
        host.replaceChildren(canvas);
        const applied = appliedRef.current;
        const hiddenForSolo = hiddenForSoloRef.current;

        const measure = () => {
            const rect = host.getBoundingClientRect();
            return [Math.max(1, Math.round(rect.width * pixelRatio())), Math.max(1, Math.round(rect.height * pixelRatio()))] as const;
        };
        let size = "";
        let settling = 0;
        const follow = () => {
            const [width, height] = measure();
            if (`${width}x${height}` === size) return;
            size = `${width}x${height}`;
            stage?.resize(width, height);
        };
        const observer = new ResizeObserver(() => {
            window.clearTimeout(settling);
            settling = window.setTimeout(follow, RESIZE_SETTLE_MS);
        });

        (async () => {
            const Stage = await loadLive2DStage();
            const { ok, missing } = await Stage.supported();
            if (signal.aborted) return;
            if (!ok) {
                setPhase({ kind: "unsupported", missing });
                return;
            }
            const [width, height] = measure();
            size = `${width}x${height}`;
            const core = live2dCoreUrl();
            const created = await Stage.create({
                canvas,
                js: live2dViewerScriptBase(),
                ...(core ? { core } : {}),
                library,
                width,
                height,
                signal,
            });
            if (signal.aborted) {
                created.destroy();
                return;
            }
            stage = created;
            stageRef.current = created;
            created.addEventListener("error", (event) => {
                if (signal.aborted) return;
                const detail = (event as CustomEvent).detail ?? {};
                setPhase(failure(Object.assign(new Error(detail.message ?? "internal"), detail)));
            });
            observer.observe(host);
            follow();
            setPhase({ kind: "ready" });
        })().catch((error: unknown) => {
            if (!signal.aborted) setPhase(failure(error));
        });

        return () => {
            controller.abort();
            observer.disconnect();
            window.clearTimeout(settling);
            stageRef.current = null;
            applied.clear();
            lastStructureKeyRef.current = null;
            soloPreviewRef.current = null;
            hiddenForSolo.clear();
            generationRef.current += 1;
            structuralGenRef.current += 1;
            previewGenRef.current += 1;
            stage?.destroy();
            host.replaceChildren();
        };
    }, [key, library]);

    const teardownSoloPreview = useCallback((stage: Live2DStage, activeKey: string | null) => {
        if (soloPreviewRef.current) {
            soloPreviewRef.current = null;
            try {
                stage.removeActor(SOLO_PREVIEW_ACTOR_ID);
            } catch {
                // Solo preview actor may already be removed.
            }
        }
        if (hiddenForSoloRef.current.size > 0) {
            for (const id of hiddenForSoloRef.current) {
                if (appliedRef.current.has(id)) {
                    void stage.setActor(id, { alpha: 1 }, { duration: 0 }).catch(() => undefined);
                }
            }
            hiddenForSoloRef.current.clear();
        }
        setSoloPreviewByKey({ key: activeKey, castKey: null });
    }, []);

    const runApply = useCallback(async (
        target: StoryStageState,
        options: StoryStageApplyOptions,
        generation: number,
        structureChanged: boolean,
    ) => {
        const stage = stageRef.current;
        const activeLibrary = libraryRef.current;
        if (!stage || generation !== generationRef.current) return;

        // Only exit solo clip preview on structural stage navigation/changes or non-instant playback;
        // editing an off-stage actor's motion/facial on the same beat preserves the solo preview.
        if (soloPreviewRef.current || hiddenForSoloRef.current.size > 0) {
            if (!structureChanged) return;
            teardownSoloPreview(stage, key);
        }

        const applied = appliedRef.current;
        const castByKey = new Map(castRef.current.map(member => [member.key, member]));
        const modelList = modelsRef.current;
        const fadeSeconds = options.instant ? 0 : STORY_FADE_SECONDS;
        const wanted = new Map<string, { actor: StoryActorState; order: number; modelId: string }>();
        target.actors.forEach((actor, order) => {
            const member = castByKey.get(actor.cast);
            if (member) wanted.set(actor.cast, { actor, order, modelId: member.modelId });
        });
        const tasks: Promise<unknown>[] = [];
        const nextProblems: Record<string, StoryActorProblem> = {};

        // Leaving (or recast with another model).
        for (const [id, current] of [...applied]) {
            const want = wanted.get(id);
            if (want && want.modelId === current.modelId) continue;
            applied.delete(id);
            if (!options.instant && options.fade && !want) {
                tasks.push(stage.setActor(id, { alpha: 0 }, { duration: fadeSeconds, easing: "out" })
                    .then(() => { if (!appliedRef.current.has(id) && stageRef.current === stage) stage.removeActor(id); }, () => undefined));
            } else {
                stage.removeActor(id);
            }
        }

        for (const [id, { actor, order, modelId }] of wanted) {
            const current = applied.get(id);
            if (current) {
                // On stage: move, scale/offset, re-order, re-pose.
                const transformChanged =
                    current.x !== actor.x
                    || current.y !== actor.y
                    || current.scale !== actor.scale
                    || current.mirror !== actor.mirror
                    || current.order !== order;
                if (transformChanged) {
                    const moving = (current.x !== actor.x || current.y !== actor.y || current.scale !== actor.scale) && !options.instant;
                    tasks.push(stage.setActor(id, {
                        x: actor.x,
                        y: actor.y,
                        scale: actor.scale,
                        mirror: actor.mirror,
                        order,
                        alpha: 1,
                    }, {
                        duration: moving ? options.moveSeconds ?? STORY_FADE_SECONDS : 0, easing: "in-out",
                    }).catch(() => undefined));
                    current.x = actor.x;
                    current.y = actor.y;
                    current.scale = actor.scale;
                    current.mirror = actor.mirror;
                    current.order = order;
                }
                const info = current.info;
                const motion = pick(actor.motion, info?.motions, info?.defaultMotion ?? null);
                if (motion && motion !== current.motion) {
                    tasks.push(safePlayMotion(stage, id, motion, false));
                    current.motion = motion;
                }
                const facial = pick(actor.facial, info?.facials, info?.defaultFacial ?? null);
                if (facial && facial !== current.facial) {
                    tasks.push(safeSetFacial(stage, id, facial));
                    current.facial = facial;
                }
                continue;
            }
            // Arriving.
            const model = modelList?.find(item => item.id === modelId);
            if (!modelList) continue;
            if (!model) {
                nextProblems[id] = "modelMissing";
                continue;
            }
            const cached = infoCacheRef.current.get(modelId);
            const motion = cached ? pick(actor.motion, cached.motions, null) : null;
            const facial = cached ? pick(actor.facial, cached.facials, null) : null;
            const fadeIn = !options.instant && !!options.fade;
            const entry: AppliedActor = {
                modelId,
                x: actor.x,
                y: actor.y,
                scale: actor.scale,
                mirror: actor.mirror,
                order,
                motion,
                facial,
                info: cached ?? null,
            };
            applied.set(id, entry);
            setLoadingActors(count => count + 1);
            tasks.push(stage.addActor(id, { bundle: model.bundle, motion: model.motions[0] ?? null }, {
                x: actor.x, y: actor.y, scale: actor.scale, mirror: actor.mirror, order, alpha: fadeIn ? 0 : 1,
                ...(motion ? { motion } : {}), ...(facial ? { facial } : {}),
            }).then(async (info) => {
                if (libraryRef.current !== activeLibrary || stageRef.current !== stage) return;
                infoCacheRef.current.set(modelId, info);
                if (appliedRef.current.get(id) !== entry) return;
                entry.info = info;
                setModelInfoByLib(previous => ({
                    library: activeLibrary,
                    info: previous.library === activeLibrary ? { ...previous.info, [modelId]: info } : { [modelId]: info },
                }));
                // Preserve any clip explicitly auditioned while the actor was loading.
                const wantMotion = pick(entry.motion ?? actor.motion, info.motions, info.defaultMotion);
                const wantFacial = pick(entry.facial ?? actor.facial, info.facials, info.defaultFacial);
                entry.motion = wantMotion;
                entry.facial = wantFacial;
                const steps: Promise<unknown>[] = [];
                if (!motion && wantMotion && wantMotion !== info.defaultMotion) steps.push(safePlayMotion(stage, id, wantMotion, false));
                if (!facial && wantFacial && wantFacial !== info.defaultFacial) steps.push(safeSetFacial(stage, id, wantFacial));
                if (fadeIn) steps.push(stage.setActor(id, { alpha: 1 }, { duration: STORY_FADE_SECONDS, easing: "in" }).catch(() => undefined));
                await Promise.all(steps);
            }, () => {
                if (libraryRef.current !== activeLibrary || stageRef.current !== stage) return;
                if (appliedRef.current.get(id) === entry) appliedRef.current.delete(id);
                setProblemsByLib(previous => ({
                    library: activeLibrary,
                    problems: previous.library === activeLibrary ? { ...previous.problems, [id]: "loadFailed" } : { [id]: "loadFailed" },
                }));
            }).finally(() => setLoadingActors(count => Math.max(0, count - 1))));
        }

        setProblemsByLib(previous => {
            const base = previous.library === activeLibrary ? previous.problems : {};
            const next: Record<string, StoryActorProblem> = { ...nextProblems };
            for (const [id, problem] of Object.entries(base)) {
                if (problem === "loadFailed" && wanted.has(id) && !applied.has(id)) next[id] = problem;
            }
            return { library: activeLibrary, problems: next };
        });
        if (options.instant) {
            // seeking: actors still loading arrive at their place; the rest snaps there now
            stage.finishTweens();
            return;
        }
        await Promise.all(tasks);
    }, [key, teardownSoloPreview]);

    /** Brings the stage to `target` (see the hook's comment); settles when the changes have played. */
    const apply = useCallback((target: StoryStageState, options: StoryStageApplyOptions): Promise<void> => {
        const nextStructureKey = stageStructureKey(target, castRef.current);
        const structureChanged = !options.instant || lastStructureKeyRef.current !== nextStructureKey;
        lastStateRef.current = target;
        lastStructureKeyRef.current = nextStructureKey;
        const generation = ++generationRef.current;
        if (structureChanged) {
            structuralGenRef.current += 1;
        }
        const next = queueRef.current
            .then(() => runApply(target, options, generation, structureChanged))
            .catch(() => undefined);
        queueRef.current = next;
        return next;
    }, [runApply]);

    /**
     * Live-auditions a motion and/or facial clip for `cast`:
     * - When `cast` is already the active solo preview actor, replays directly with zero reload latency.
     * - When `cast` is mounted on stage and `clip` specifies a motion/facial, forces immediate replay
     *   directly on the mounted stage actor (even if it is the same clip name).
     * - Otherwise hides current stage actors and mounts `cast` centered (`x: 0, scale: 1.15`) as a solo
     *   preview actor until `clearClipPreview()` or a structural stage change.
     */
    const previewClip = useCallback((castMember: StoryCastMember, clip?: StoryClipPreviewRequest): Promise<void> => {
        const structGen = structuralGenRef.current;
        const previewGen = ++previewGenRef.current;
        const next = queueRef.current.then(async () => {
            const stage = stageRef.current;
            const activeLibrary = libraryRef.current;
            if (!stage || structuralGenRef.current !== structGen || previewGenRef.current !== previewGen) return;

            const hasExplicitClip = Boolean(clip?.motion || clip?.facial);
            const mounted = appliedRef.current.get(castMember.key);

            // Already mounted as the active solo preview actor: replay with zero reload latency.
            const existingSolo = soloPreviewRef.current;
            if (existingSolo && existingSolo.castKey === castMember.key && existingSolo.modelId === castMember.modelId) {
                setSoloPreviewByKey({ key, castKey: castMember.key });
                const tasks: Promise<unknown>[] = [];
                if (clip?.motion) {
                    tasks.push(safePlayMotion(stage, SOLO_PREVIEW_ACTOR_ID, clip.motion, false));
                }
                if (clip?.facial) {
                    tasks.push(safeSetFacial(stage, SOLO_PREVIEW_ACTOR_ID, clip.facial));
                }
                if (tasks.length > 0) await Promise.all(tasks);
                return;
            }

            // In-place force replay when the actor is mounted on stage and a specific clip is requested.
            if (hasExplicitClip && mounted && mounted.modelId === castMember.modelId) {
                if (soloPreviewRef.current || hiddenForSoloRef.current.size > 0) {
                    teardownSoloPreview(stage, key);
                }
                const tasks: Promise<unknown>[] = [];
                if (clip?.motion) {
                    tasks.push(safePlayMotion(stage, castMember.key, clip.motion, false));
                    if (!mounted.info || mounted.info.motions.includes(clip.motion)) {
                        mounted.motion = clip.motion;
                    }
                }
                if (clip?.facial) {
                    tasks.push(safeSetFacial(stage, castMember.key, clip.facial));
                    if (!mounted.info || mounted.info.facials.includes(clip.facial)) {
                        mounted.facial = clip.facial;
                    }
                }
                if (tasks.length > 0) await Promise.all(tasks);
                return;
            }

            // Mount a centered solo preview actor while keeping real stage actors loaded in memory at alpha 0.
            const model = modelsRef.current?.find(item => item.id === castMember.modelId);
            if (!model) return;

            for (const id of appliedRef.current.keys()) {
                if (!hiddenForSoloRef.current.has(id)) {
                    hiddenForSoloRef.current.add(id);
                    void stage.setActor(id, { alpha: 0 }, { duration: 0 }).catch(() => undefined);
                }
            }
            if (soloPreviewRef.current) {
                try {
                    stage.removeActor(SOLO_PREVIEW_ACTOR_ID);
                } catch {
                    // Ignore removal error.
                }
                soloPreviewRef.current = null;
            }

            const cached = infoCacheRef.current.get(castMember.modelId);
            const initialMotion = cached
                ? (clip?.motion && cached.motions.includes(clip.motion) ? clip.motion : cached.defaultMotion ?? undefined)
                : undefined;
            const initialFacial = cached
                ? (clip?.facial && cached.facials.includes(clip.facial) ? clip.facial : cached.defaultFacial ?? undefined)
                : undefined;

            setSoloPreviewByKey({ key, castKey: castMember.key });
            setLoadingActors(count => count + 1);
            try {
                const info = await stage.addActor(
                    SOLO_PREVIEW_ACTOR_ID,
                    { bundle: model.bundle, motion: model.motions[0] ?? null },
                    {
                        x: 0,
                        y: 0,
                        scale: 1.15,
                        alpha: 1,
                        order: 100,
                        ...(initialMotion ? { motion: initialMotion } : {}),
                        ...(initialFacial ? { facial: initialFacial } : {}),
                    },
                );
                if (
                    libraryRef.current !== activeLibrary
                    || stageRef.current !== stage
                    || structuralGenRef.current !== structGen
                ) {
                    if (stageRef.current === stage) {
                        try {
                            stage.removeActor(SOLO_PREVIEW_ACTOR_ID);
                        } catch {
                            // Ignore removal error.
                        }
                    }
                    return;
                }
                infoCacheRef.current.set(castMember.modelId, info);
                soloPreviewRef.current = { castKey: castMember.key, modelId: castMember.modelId, info };
                setModelInfoByLib(previous => ({
                    library: activeLibrary,
                    info: previous.library === activeLibrary
                        ? { ...previous.info, [castMember.modelId]: info }
                        : { [castMember.modelId]: info },
                }));
                if (previewGenRef.current !== previewGen) return;
                const tasks: Promise<unknown>[] = [];
                if (clip?.motion && clip.motion !== initialMotion && info.motions.includes(clip.motion)) {
                    tasks.push(safePlayMotion(stage, SOLO_PREVIEW_ACTOR_ID, clip.motion, false));
                }
                if (clip?.facial && clip.facial !== initialFacial && info.facials.includes(clip.facial)) {
                    tasks.push(safeSetFacial(stage, SOLO_PREVIEW_ACTOR_ID, clip.facial));
                }
                if (tasks.length > 0) await Promise.all(tasks);
            } catch {
                if (stageRef.current === stage && previewGenRef.current === previewGen) {
                    teardownSoloPreview(stage, key);
                }
            } finally {
                setLoadingActors(count => Math.max(0, count - 1));
            }
        }).catch(() => undefined);
        queueRef.current = next;
        return next;
    }, [key, teardownSoloPreview]);

    /** Exits any active solo clip preview and immediately restores the current stage state. */
    const clearClipPreview = useCallback(() => {
        previewGenRef.current += 1;
        structuralGenRef.current += 1;
        const generation = generationRef.current;
        const next = queueRef.current.then(async () => {
            const stage = stageRef.current;
            if (!stage) {
                soloPreviewRef.current = null;
                hiddenForSoloRef.current.clear();
                setSoloPreviewByKey({ key, castKey: null });
                return;
            }
            const hadSolo = Boolean(soloPreviewRef.current || hiddenForSoloRef.current.size > 0);
            teardownSoloPreview(stage, key);
            if (hadSolo && lastStateRef.current && generation === generationRef.current) {
                await runApply(lastStateRef.current, { instant: true }, generation, true);
            }
        }).catch(() => undefined);
        queueRef.current = next;
    }, [key, runApply, teardownSoloPreview]);

    /** The cast member whose mouth flaps (null: nobody's). */
    const setTalking = useCallback((speaker: string | null) => {
        const stage = stageRef.current;
        if (!stage) return;
        for (const id of appliedRef.current.keys()) {
            try {
                stage.setTalking(id, id === speaker);
            } catch {
                // an actor still loading
            }
        }
    }, []);

    /** Shakes the camera for `seconds`. */
    const shake = useCallback(async (seconds: number) => {
        const stage = stageRef.current;
        if (!stage) return;
        const end = performance.now() + seconds * 1000;
        let sign = 1;
        while (performance.now() < end && stageRef.current === stage) {
            sign = -sign;
            await stage.setCamera({ x: 0.02 * sign, y: 0.012 * -sign }, { duration: 0.05, easing: "linear" }).catch(() => false);
        }
        await stage.setCamera({ x: 0, y: 0 }, { duration: 0.05 }).catch(() => false);
    }, []);

    /** Snaps every running tween to its end. */
    const finish = useCallback(() => stageRef.current?.finishTweens(), []);

    const retry = useCallback(() => setAttempt(value => value + 1), []);

    return {
        hostRef,
        phase,
        modelInfo,
        problems,
        loadingActors,
        apply,
        previewClip,
        clearClipPreview,
        isSoloPreview,
        previewingCastKey,
        setTalking,
        shake,
        finish,
        retry,
    };
}
