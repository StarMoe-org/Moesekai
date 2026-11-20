import { getAssetBaseUrl, type AssetLine } from "@/lib/assets";
import { live2dSources, type Live2DRegion } from "./config";
import { parseLive2DModelIndex, type Live2DModel } from "./models";

/** The network side of the Live2D viewer page: a server's model index, and the story backgrounds to stand a model on. */

/** A server's models; none when its index is not published yet (404). */
export async function fetchLive2DModels(region: Live2DRegion, signal: AbortSignal): Promise<Live2DModel[]> {
    const url = live2dSources(region).index;
    const response = await fetch(url, { signal, credentials: "omit", headers: { Accept: "application/json" } });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return parseLive2DModelIndex(await response.json());
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
