import { getAssetBaseUrl, type AssetLine } from "@/lib/assets";
import { live2dListingUrl, type Live2DRegion } from "./config";
import { live2dModelsFromListings, type Live2DModel } from "./models";

/** The network side of the Live2D viewer page: a server's models, and the story backgrounds to stand a model on. */

/** The subdirectories of a directory listing of the site; null when the site has no such directory (404). */
async function subdirectories(url: string): Promise<string[] | null> {
    const response = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const listing = await response.json() as { format?: string; version?: number; directories?: string[] };
    if (listing.format !== "directory-listing" || listing.version !== 1) {
        throw new Error(`${url}: unsupported listing ${String(listing.format)} ${String(listing.version)}`);
    }
    return listing.directories ?? [];
}

const modelCache = new Map<string, Promise<Live2DModel[]>>();

/**
 * A server's models, from the listings of its publication's `live2d/model/` and `live2d/motion/`;
 * none when it publishes no models. Cached per `${region}|${url}` (retries on rejection).
 */
export function fetchLive2DModels(region: Live2DRegion, signal?: AbortSignal): Promise<Live2DModel[]> {
    if (signal?.aborted) return Promise.reject(createAbortError());
    const modelsUrl = live2dListingUrl(region, "live2d/model/");
    const key = `${region}|${modelsUrl}`;
    let cached = modelCache.get(key);
    if (!cached) {
        const loading = (async (): Promise<Live2DModel[]> => {
            const [models, motions] = await Promise.all([
                subdirectories(modelsUrl),
                subdirectories(live2dListingUrl(region, "live2d/motion/")),
            ]);
            return live2dModelsFromListings(models ?? [], motions ?? []);
        })();
        modelCache.set(key, loading);
        loading.catch(() => modelCache.delete(key));
        cached = loading;
    }
    return withAbortSignal(cached, signal);
}

const BACKGROUND_DIRECTORY = "scenario/background/";
const backgroundCache = new Map<string, Promise<string[]>>();

function createAbortError(): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException("The operation was aborted.", "AbortError");
    }
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    return err;
}

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(createAbortError());
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(createAbortError());
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            },
        );
    });
}

/**
 * Whether a scenario background id is a story CG / still illustration rather than a reusable scene
 * (`bg_a000001`..`bg_a000099` and `bg_s*`, matching `StorySnippet.tsx`).
 */
export function isStoryCgBackground(name: string): boolean {
    if (name.startsWith("bg_a")) {
        const num = Number.parseInt(name.slice(4), 10);
        return Number.isFinite(num) && num >= 1 && num <= 99;
    }
    return name.startsWith("bg_s");
}

/**
 * A server's story backgrounds (`bg_a000001`), the directories under `scenario/background/` of the
 * storage view on the asset line the reader chose. Cached per `${region}|${line}` (retries on rejection).
 */
export function fetchStoryBackgrounds(region: Live2DRegion, line: AssetLine, signal?: AbortSignal): Promise<string[]> {
    if (signal?.aborted) return Promise.reject(createAbortError());
    const key = `${region}|${line}`;
    let cached = backgroundCache.get(key);
    if (!cached) {
        const url = `${getAssetBaseUrl(`${line}-${region}`)}/${BACKGROUND_DIRECTORY}`;
        const loading = (async () => {
            const directories = await subdirectories(url);
            if (!directories) throw new Error(`${url}: HTTP 404`);
            // a few directories are not backgrounds of their own
            return directories.filter(name => /^bg/.test(name));
        })();
        backgroundCache.set(key, loading);
        loading.catch(() => backgroundCache.delete(key));
        cached = loading;
    }
    return withAbortSignal(cached, signal);
}
