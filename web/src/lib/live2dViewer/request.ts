import {
    live2dAssetRequestPath,
    live2dDirectoryPath,
    type Live2DAssetForm,
    type Live2DSources,
} from "@moesekai/story-core";
import type { Live2DViewer, Live2DViewerError, Live2DViewerOptions, Live2DViewerStatic } from "./viewer";

const MAX_RESOLVED_PATH_CACHE = 256;
const resolvedPathCache = new Map<string, string>();

function trimAssetSlashes(path: string): string {
    return path.trim().replace(/^\/+|\/+$/g, "");
}

function resolvedPathKey(sources: Live2DSources, containerPath: string, form: Live2DAssetForm): string {
    const site = sources.site.trim().replace(/\/+$/, "");
    return `${site}|${sources.region}|${sources.version?.trim() ?? ""}|${sources.proxy ?? ""}|${form}|${trimAssetSlashes(containerPath)}`;
}

function isResolvedNestedChild(resolvedPath: string | null | undefined, containerPath: string): resolvedPath is string {
    if (!resolvedPath) return false;
    const cleanResolved = trimAssetSlashes(resolvedPath);
    const cleanContainer = trimAssetSlashes(containerPath);
    if (!cleanResolved || !cleanContainer) return false;
    if (cleanResolved === cleanContainer || !cleanResolved.startsWith(`${cleanContainer}/`)) return false;
    return !cleanResolved.split("/").some(seg => seg === "" || seg === "." || seg === "..");
}

function rememberResolvedPath(
    sources: Live2DSources,
    containerPath: string | null,
    form: Live2DAssetForm,
    resolvedPath: string | null | undefined,
): void {
    if (!containerPath || !isResolvedNestedChild(resolvedPath, containerPath)) return;
    const key = resolvedPathKey(sources, containerPath, form);
    if (!resolvedPathCache.has(key) && resolvedPathCache.size >= MAX_RESOLVED_PATH_CACHE) {
        const oldest = resolvedPathCache.keys().next().value;
        if (oldest !== undefined) resolvedPathCache.delete(oldest);
    }
    resolvedPathCache.set(key, trimAssetSlashes(resolvedPath));
}

function forgetResolvedPath(sources: Live2DSources, containerPath: string | null, form: Live2DAssetForm): void {
    if (!containerPath) return;
    resolvedPathCache.delete(resolvedPathKey(sources, containerPath, form));
}

/** Clears the in-memory resolved model/motion asset path cache (primarily for tests). */
export function clearLive2DViewerPathCache(): void {
    resolvedPathCache.clear();
}

export interface Live2DViewerModelPaths {
    primary: { asset: string; motion: string | null };
    fallback: { asset: string; motion: string | null };
    hasFallback: boolean;
}

function resolveSingleAssetPath(
    sources: Live2DSources,
    rawPath: string,
    form: Live2DAssetForm,
): { primary: string; fallback: string } {
    const fallback = live2dDirectoryPath(rawPath);
    const indexedOrCached = live2dAssetRequestPath(sources, rawPath, form);
    if (indexedOrCached && indexedOrCached !== fallback) {
        return { primary: indexedOrCached, fallback };
    }
    const cleanContainer = trimAssetSlashes(rawPath);
    if (fallback.endsWith("/") && cleanContainer) {
        const remembered = resolvedPathCache.get(resolvedPathKey(sources, cleanContainer, form));
        if (isResolvedNestedChild(remembered, cleanContainer)) {
            return { primary: remembered, fallback };
        }
    }
    return { primary: fallback, fallback };
}

/**
 * Resolves the optimal model/motion paths to pass to `SekaiLive2DViewer.create()`:
 * - `primary` uses exact canonical asset names (`.../buildmodeldata`, `.../buildmotiondata`) when
 *   indexed from `/listings/` or previously resolved (1 direct fetch, 0 walks, 0 404s), otherwise
 *   explicit trailing-`/` directory paths (0 `.asset.json` 404 probes).
 * - `fallback` always uses explicit trailing-`/` directory paths for top-level Live2D containers so
 *   a stale exact path can self-heal cleanly on `not-found` without triggering 404 probes.
 */
export function resolveLive2DViewerModelPaths(
    sources: Live2DSources,
    asset: string,
    motion: string | null,
): Live2DViewerModelPaths {
    const resolvedAsset = resolveSingleAssetPath(sources, asset, "live2d-model");
    const resolvedMotion = motion ? resolveSingleAssetPath(sources, motion, "live2d-motions") : null;
    const primary = { asset: resolvedAsset.primary, motion: resolvedMotion?.primary ?? null };
    const fallback = { asset: resolvedAsset.fallback, motion: resolvedMotion?.fallback ?? null };
    return {
        primary,
        fallback,
        hasFallback: primary.asset !== fallback.asset || primary.motion !== fallback.motion,
    };
}

export interface CreateLive2DViewerWithFallbackOptions extends Omit<Live2DViewerOptions, "canvas" | "model"> {
    asset: string;
    motion: string | null;
    /** Creates a fresh, untransferred canvas for each `Viewer.create()` attempt. */
    createCanvas: () => HTMLCanvasElement;
    /** Skip exact-path optimization (e.g. on user-initiated retry) and load via explicit directory paths. */
    preferDirectoryFallback?: boolean;
}

/**
 * Creates a `SekaiLive2DViewer` using exact indexed/cached paths when available and automatically
 * falls back to explicit trailing-`/` directory paths on a fresh canvas if an exact path fails with
 * `not-found` (e.g. across a published-version rollover).
 */
export async function createLive2DViewerWithFallback(
    Viewer: Pick<Live2DViewerStatic, "create">,
    { asset, motion, createCanvas, preferDirectoryFallback = false, ...options }: CreateLive2DViewerWithFallbackOptions,
): Promise<Live2DViewer> {
    const paths = resolveLive2DViewerModelPaths(options.sources, asset, motion);
    const initialModel = preferDirectoryFallback ? paths.fallback : paths.primary;

    const record = (viewer: Live2DViewer): Live2DViewer => {
        if (!options.signal?.aborted) {
            rememberResolvedPath(options.sources, asset, "live2d-model", viewer.model);
            rememberResolvedPath(options.sources, motion, "live2d-motions", viewer.motionSet);
        }
        return viewer;
    };

    try {
        const created = await Viewer.create({
            ...options,
            canvas: createCanvas(),
            model: initialModel,
        });
        if (
            !preferDirectoryFallback
            && !options.signal?.aborted
            && initialModel.motion !== null
            && initialModel.motion !== paths.fallback.motion
            && created.motionSet === null
            && (created.motions?.length ?? 0) === 0
            && (created.facials?.length ?? 0) === 0
        ) {
            const retryAsset = created.model?.trim() ? trimAssetSlashes(created.model) : paths.fallback.asset;
            created.destroy?.();
            forgetResolvedPath(options.sources, motion, "live2d-motions");
            return record(await Viewer.create({
                ...options,
                canvas: createCanvas(),
                model: { asset: retryAsset, motion: paths.fallback.motion },
            }));
        }
        return record(created);
    } catch (error: unknown) {
        const detail = error as Live2DViewerError | undefined;
        if (
            preferDirectoryFallback
            || !paths.hasFallback
            || options.signal?.aborted
            || detail?.kind !== "not-found"
        ) {
            throw error;
        }
        forgetResolvedPath(options.sources, asset, "live2d-model");
        forgetResolvedPath(options.sources, motion, "live2d-motions");
        return record(await Viewer.create({
            ...options,
            canvas: createCanvas(),
            model: paths.fallback,
        }));
    }
}
