import { getAssetBaseUrl, type AssetLine } from "@/lib/assets";
import { live2dListingUrl, type Live2DRegion } from "./config";
import { live2dModelsFromListings, type Live2DModel } from "./models";

/** The network side of the Live2D viewer page: a server's models, and the story backgrounds to stand a model on. */

/** The subdirectories of a directory listing of the site; none when the site has no such directory (404). */
async function subdirectories(url: string, signal: AbortSignal): Promise<string[]> {
    const response = await fetch(url, { signal, credentials: "omit", headers: { Accept: "application/json" } });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const listing = await response.json() as { format?: string; version?: number; directories?: string[] };
    if (listing.format !== "directory-listing" || listing.version !== 1) {
        throw new Error(`${url}: unsupported listing ${String(listing.format)} ${String(listing.version)}`);
    }
    return listing.directories ?? [];
}

/** A server's models, from the listings of its publication's `live2d/model/` and `live2d/motion/`. */
export async function fetchLive2DModels(region: Live2DRegion, signal: AbortSignal): Promise<Live2DModel[]> {
    const [models, motions] = await Promise.all([
        subdirectories(live2dListingUrl(region, "live2d/model/"), signal),
        subdirectories(live2dListingUrl(region, "live2d/motion/"), signal),
    ]);
    return live2dModelsFromListings(models, motions);
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
