"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { live2dCoreUrl } from "@/lib/live2dViewer/config";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import {
    LIVE2D_STAGE_UNAVAILABLE, loadLive2DStage,
    type Live2DActorInfo, type Live2DStage, type Live2DStageError, type Live2DStageErrorKind, type Live2DStageMissing,
} from "@/lib/live2dViewer/stage";
import { live2dViewerScriptBase } from "@/lib/live2dViewer/viewer";
import { STORY_FADE_SECONDS } from "@/lib/storyMaker/limits";
import type { StoryActorState, StoryStageState } from "@/lib/storyMaker/state";
import type { StoryCastMember } from "@/types/storyMaker";

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

interface AppliedActor {
    modelId: string;
    x: number;
    mirror: boolean;
    order: number;
    motion: string | null;
    facial: string | null;
    info: Live2DActorInfo | null;
}

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
 * asked), moved, re-posed. Changes run one after another; a target superseded while queued is
 * skipped. Without a stage (none in the release, or a browser without WebGPU) every call is a
 * no-op and `phase` tells why: the editor and player work on without the live preview.
 */
export function useStoryStage({ library, cast, models }: UseStoryStageOptions) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const stageRef = useRef<Live2DStage | null>(null);
    const appliedRef = useRef(new Map<string, AppliedActor>());
    const infoCacheRef = useRef(new Map<string, Live2DActorInfo>());
    const castRef = useRef(cast);
    const modelsRef = useRef(models);
    const queueRef = useRef<Promise<void>>(Promise.resolve());
    const generationRef = useRef(0);
    const [attempt, setAttempt] = useState(0);
    const key = library ? `${library}|${attempt}` : null;
    const [phaseOf, setPhaseOf] = useState<{ key: string; phase: StoryStagePhase } | null>(null);
    /** What each model has (motions, facials), by model id, once it has been on the stage. */
    const [modelInfo, setModelInfo] = useState<Record<string, Live2DActorInfo>>({});
    const [problems, setProblems] = useState<Record<string, StoryActorProblem>>({});
    const [loadingActors, setLoadingActors] = useState(0);
    const phase: StoryStagePhase = !key ? { kind: "idle" } : phaseOf?.key === key ? phaseOf.phase : { kind: "loading" };

    useEffect(() => {
        castRef.current = cast;
        modelsRef.current = models;
    }, [cast, models]);

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
            generationRef.current += 1;
            stage?.destroy();
            host.replaceChildren();
        };
    }, [key, library]);

    const runApply = useCallback(async (target: StoryStageState, options: StoryStageApplyOptions, generation: number) => {
        const stage = stageRef.current;
        if (!stage || generation !== generationRef.current) return;
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
                // On stage: move, re-order, re-pose.
                if (current.x !== actor.x || current.mirror !== actor.mirror || current.order !== order) {
                    const moving = current.x !== actor.x && !options.instant;
                    tasks.push(stage.setActor(id, { x: actor.x, mirror: actor.mirror, order, alpha: 1 }, {
                        duration: moving ? options.moveSeconds ?? STORY_FADE_SECONDS : 0, easing: "in-out",
                    }).catch(() => undefined));
                    current.x = actor.x;
                    current.mirror = actor.mirror;
                    current.order = order;
                }
                const info = current.info;
                const motion = pick(actor.motion, info?.motions, info?.defaultMotion ?? null);
                if (motion && motion !== current.motion) {
                    tasks.push(stage.playMotion(id, motion).catch(() => undefined));
                    current.motion = motion;
                }
                const facial = pick(actor.facial, info?.facials, info?.defaultFacial ?? null);
                if (facial && facial !== current.facial) {
                    tasks.push(stage.setFacial(id, facial).catch(() => undefined));
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
            const entry: AppliedActor = { modelId, x: actor.x, mirror: actor.mirror, order, motion, facial, info: cached ?? null };
            applied.set(id, entry);
            setLoadingActors(count => count + 1);
            tasks.push(stage.addActor(id, { bundle: model.bundle, motion: model.motions[0] ?? null }, {
                x: actor.x, mirror: actor.mirror, order, alpha: fadeIn ? 0 : 1,
                ...(motion ? { motion } : {}), ...(facial ? { facial } : {}),
            }).then(async (info) => {
                infoCacheRef.current.set(modelId, info);
                if (appliedRef.current.get(id) !== entry || stageRef.current !== stage) return;
                entry.info = info;
                setModelInfo(previous => ({ ...previous, [modelId]: info }));
                // the names given before the model's lists were known
                const wantMotion = pick(actor.motion, info.motions, info.defaultMotion);
                const wantFacial = pick(actor.facial, info.facials, info.defaultFacial);
                entry.motion = wantMotion;
                entry.facial = wantFacial;
                const steps: Promise<unknown>[] = [];
                if (!motion && wantMotion && wantMotion !== info.defaultMotion) steps.push(stage.playMotion(id, wantMotion).catch(() => undefined));
                if (!facial && wantFacial && wantFacial !== info.defaultFacial) steps.push(stage.setFacial(id, wantFacial).catch(() => undefined));
                if (fadeIn) steps.push(stage.setActor(id, { alpha: 1 }, { duration: STORY_FADE_SECONDS, easing: "in" }).catch(() => undefined));
                await Promise.all(steps);
            }, () => {
                if (appliedRef.current.get(id) === entry) appliedRef.current.delete(id);
                setProblems(previous => ({ ...previous, [id]: "loadFailed" }));
            }).finally(() => setLoadingActors(count => Math.max(0, count - 1))));
        }

        setProblems(previous => {
            const next: Record<string, StoryActorProblem> = { ...nextProblems };
            for (const [id, problem] of Object.entries(previous)) {
                if (problem === "loadFailed" && wanted.has(id) && !applied.has(id)) next[id] = problem;
            }
            return next;
        });
        if (options.instant) {
            // seeking: actors still loading arrive at their place; the rest snaps there now
            stage.finishTweens();
            return;
        }
        await Promise.all(tasks);
    }, []);

    /** Brings the stage to `target` (see the hook's comment); settles when the changes have played. */
    const apply = useCallback((target: StoryStageState, options: StoryStageApplyOptions): Promise<void> => {
        const generation = ++generationRef.current;
        const next = queueRef.current.then(() => runApply(target, options, generation)).catch(() => undefined);
        queueRef.current = next;
        return next;
    }, [runApply]);

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

    return { hostRef, phase, modelInfo, problems, loadingActors, apply, setTalking, shake, finish, retry };
}
