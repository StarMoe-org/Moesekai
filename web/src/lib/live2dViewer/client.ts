import { getAssetBaseUrl, type AssetLine } from "@/lib/assets";
import { live2dFetchUrl, live2dSources, type Live2DRegion } from "./config";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { live2dModelsByName, parseLive2DCatalogue, type Live2DCharacter2d, type Live2DModel } from "./models";

/** The network side of the Live2D viewer page: a server's models, and the story backgrounds to stand a model on. */

/** The JSON at `url`, or throws. */
async function json(url: string, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(url, { signal, credentials: "omit", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

/** The subdirectories of a directory listing of the published version. */
async function directories(url: string, signal: AbortSignal): Promise<string[]> {
    const listing = await json(url, signal) as { format?: string; directories?: unknown };
    if (listing.format !== "directory-listing" || !Array.isArray(listing.directories)) throw new Error(`${url}: not a directory listing`);
    return listing.directories.filter((name): name is string => typeof name === "string");
}

/**
 * A server's models: this site's catalogue (each model with the motion set the stories play on
 * it), or, while the catalogue is not ready or cannot be had, the models of the version the site
 * publishes now, each with its motion set by the client's naming.
 */
export async function fetchLive2DModels(region: Live2DRegion, signal: AbortSignal): Promise<Live2DModel[]> {
    const sources = live2dSources(region);
    const version = async () => {
        const root = await json(live2dFetchUrl(`${sources.site}${region}/`), signal) as { published_version?: unknown };
        if (typeof root.published_version !== "string") throw new Error(`${sources.site}${region}/: no published version`);
        return live2dFetchUrl(`${sources.site}${region}@${encodeURIComponent(root.published_version)}/`);
    };
    let catalogue: unknown = null;
    try {
        catalogue = await json(sources.catalogue, signal);
    } catch (e) {
        if (signal.aborted) throw e;
    }
    const base = await version();
    const motions = await directories(`${base}live2d/motion/`, signal).catch(() => []);
    if (catalogue !== null) {
        // what the characters are: without the masterdata, what a model's id spells
        const character2ds = new Map<number, Live2DCharacter2d>();
        try {
            const list = await fetchMasterDataForServer<(Live2DCharacter2d & { id: number })[]>(region, "character2ds.json");
            for (const c of list) character2ds.set(c.id, c);
        } catch {
            if (signal.aborted) throw signal.reason;
        }
        try {
            const models = parseLive2DCatalogue(catalogue, motions, character2ds);
            if (models) return models;
        } catch {
            // a catalogue the page cannot read: the site's own listing instead
        }
    }
    return live2dModelsByName(await directories(`${base}live2d/model/`, signal), motions);
}

const BACKGROUND_DIRECTORY = "scenario/background/";

/**
 * A server's story backgrounds (`bg_a000001`), the directories under `scenario/background/` of the
 * storage view on the asset line the reader chose.
 */
export async function fetchStoryBackgrounds(region: Live2DRegion, line: AssetLine, signal: AbortSignal): Promise<string[]> {
    const url = `${getAssetBaseUrl(`${line}-${region}`)}/${BACKGROUND_DIRECTORY}`;
    const response = await fetch(url, { signal, credentials: "omit", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const listing = await response.json() as { format?: string; version?: number; directories?: string[] };
    if (listing.format !== "directory-listing" || listing.version !== 1) {
        throw new Error(`${url}: unsupported listing ${String(listing.format)} ${String(listing.version)}`);
    }
    // a few directories are not backgrounds of their own
    return (listing.directories ?? []).filter(name => /^bg/.test(name));
}
