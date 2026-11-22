import { fetchLive2DModels } from "@/lib/live2dViewer/client";
import { compareLive2DModels, type Live2DModel } from "@/lib/live2dViewer/models";
import { sseWebSources, type SseWebRegion } from "@/lib/sseWeb/config";
import { parseSelector } from "./episodes";

export interface EpisodeModelEntry {
    id: string;
    model: Live2DModel;
    character2dIds: number[];
}

interface RipperEpisodeCostume {
    modelBundle?: unknown;
    model_bundle?: unknown;
}

interface RipperEpisodeCharacter {
    costumes?: unknown;
}

interface RipperEpisodeJson {
    characters?: unknown;
}

const episodeBundlesCache = new Map<string, Promise<Map<string, number[]>>>();

/**
 * Map a story selector (`event:<g>/<n>`, `unit:<g>/<n>`, `card:<g>/<former|latter>`,
 * `special:<g>/<n>`, `area:<g>/<n>`) to its ripper episode JSON path.
 */
export function episodeJsonPath(selector: string): string | null {
    const normalized = parseSelector(selector);
    if (!normalized) return null;
    const colon = normalized.indexOf(":");
    const slash = normalized.indexOf("/", colon + 1);
    if (colon <= 0 || slash <= colon + 1) return null;
    const kind = normalized.slice(0, colon);
    const group = normalized.slice(colon + 1, slash);
    const episode = normalized.slice(slash + 1);
    if (kind === "card") {
        const partNumber = episode === "former" ? "1" : episode === "latter" ? "2" : null;
        return partNumber ? `episodes/card/${group}/${partNumber}.json` : null;
    }
    return `episodes/${kind}/${group}/${episode}.json`;
}

function extractModelBundles(raw: unknown): Map<string, number[]> {
    const result = new Map<string, number[]>();
    if (typeof raw !== "object" || raw === null) return result;
    const characters = (raw as RipperEpisodeJson).characters;
    if (typeof characters !== "object" || characters === null || Array.isArray(characters)) return result;

    for (const [c2dKey, charValue] of Object.entries(characters as Record<string, unknown>)) {
        if (typeof charValue !== "object" || charValue === null) continue;
        const costumes = (charValue as RipperEpisodeCharacter).costumes;
        if (!Array.isArray(costumes)) continue;
        const c2dId = Number(c2dKey);
        const validC2d = Number.isInteger(c2dId) && c2dId > 0 ? c2dId : null;

        for (const item of costumes) {
            if (typeof item !== "object" || item === null) continue;
            const costume = item as RipperEpisodeCostume;
            const bundle = typeof costume.modelBundle === "string"
                ? costume.modelBundle
                : typeof costume.model_bundle === "string"
                    ? costume.model_bundle
                    : null;
            if (!bundle) continue;
            const id = bundle.replace(/^live2d\/model\//, "").trim();
            if (!id) continue;
            let list = result.get(id);
            if (!list) {
                list = [];
                result.set(id, list);
            }
            if (validC2d !== null && !list.includes(validC2d)) {
                list.push(validC2d);
            }
        }
    }

    return result;
}

function fetchEpisodeBundleMap(region: SseWebRegion, selector: string, signal?: AbortSignal): Promise<Map<string, number[]>> {
    const relPath = episodeJsonPath(selector);
    const sources = sseWebSources(region);
    if (!relPath || !sources) return Promise.resolve(new Map());

    const cacheKey = `${region}|${relPath}`;
    let cached = episodeBundlesCache.get(cacheKey);
    if (!cached) {
        const rawUrl = `${sources.library}${relPath}`;
        const url = sources.proxy ? rawUrl.replace(/^https:\/\//, sources.proxy) : rawUrl;
        const loading = (async (): Promise<Map<string, number[]>> => {
            const response = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
            if (response.status === 404) return new Map();
            if (!response.ok) throw new Error(`${relPath}: HTTP ${response.status}`);
            return extractModelBundles(await response.json());
        })();
        episodeBundlesCache.set(cacheKey, loading);
        loading.catch(() => episodeBundlesCache.delete(cacheKey));
        cached = loading;
    }

    if (!signal) return cached;
    if (signal.aborted) return Promise.resolve(new Map());
    return new Promise<Map<string, number[]>>((resolve, reject) => {
        const onAbort = () => resolve(new Map());
        signal.addEventListener("abort", onAbort, { once: true });
        cached.then(
            value => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            error => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            },
        );
    });
}

/**
 * Resolve the unique Live2D models appearing in a story episode, ordered by
 * `character` -> `sub` -> `collab` -> `mob`. Gracefully returns `[]` on 404 or network failure.
 */
export async function fetchEpisodeModels(
    region: SseWebRegion,
    selector: string,
    signal?: AbortSignal,
): Promise<EpisodeModelEntry[]> {
    if (signal?.aborted) return [];
    const normalized = parseSelector(selector);
    if (!normalized) return [];

    try {
        const [bundleMap, allModels] = await Promise.all([
            fetchEpisodeBundleMap(region, normalized, signal),
            fetchLive2DModels(region, signal),
        ]);
        if (signal?.aborted || bundleMap.size === 0 || allModels.length === 0) return [];

        const byId = new Map<string, Live2DModel>();
        for (const model of allModels) byId.set(model.id, model);

        const entries: EpisodeModelEntry[] = [];
        for (const [id, character2dIds] of bundleMap.entries()) {
            const model = byId.get(id);
            if (!model) continue;
            entries.push({ id, model, character2dIds });
        }

        entries.sort((a, b) => compareLive2DModels(a.model, b.model));
        return entries;
    } catch {
        return [];
    }
}
