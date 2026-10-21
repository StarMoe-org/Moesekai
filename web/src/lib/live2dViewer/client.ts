import { ASSET_DOMAIN_MAIN, ASSET_DOMAIN_OVERSEAS } from "@/lib/assets";
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

export interface StoryBackgroundPage {
    /** Background names (`bg_a000001`), the bundle names under `scenario/background/`. */
    names: string[];
    /** The cursor of the next page, or null after the last. */
    next: string | null;
}

const BACKGROUND_PREFIX = "scenario/background/";

/**
 * One page of a server's story backgrounds, from the asset site's bundle listing (the one the
 * asset browser reads). `line` is the asset site the reader chose (main or overseas).
 */
export async function fetchStoryBackgrounds(
    region: Live2DRegion,
    line: "main" | "overseas",
    cursor: string | null,
    signal: AbortSignal,
): Promise<StoryBackgroundPage> {
    const query = new URLSearchParams({ server: region, prefix: BACKGROUND_PREFIX, limit: "200" });
    if (cursor) query.set("cursor", cursor);
    const url = `${line === "overseas" ? ASSET_DOMAIN_OVERSEAS : ASSET_DOMAIN_MAIN}/api/assets/bundles?${query.toString()}`;
    const response = await fetch(url, { signal, credentials: "omit" });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const data = await response.json() as { items?: { type?: string; name?: string; path?: string }[]; nextCursor?: string };
    const names = (data.items ?? [])
        .filter(item => item.type === "bundle" && typeof item.name === "string" && item.path === `${BACKGROUND_PREFIX}${item.name}`)
        .map(item => item.name as string)
        // a few bundles of the directory are not backgrounds of their own
        .filter(name => /^bg/.test(name));
    return { names, next: data.nextCursor || null };
}
