/**
 * Configuration of the Live2D model viewer (SekaiLive2DViewer). Its release -- `viewer.js`, its
 * worker script and a wasm -- is kept in this repository as it was built, in
 * `web/vendor/live2d-viewer`, and copied to `public/live2d-viewer/<release>/` before dev and build
 * (scripts/copy-live2d-viewer.mjs): the viewer starts its worker from its own directory, and a
 * worker script has to be same-origin with the page.
 *
 * The models are those of the story libraries (SekaiStoryRipper's output, one per server): the
 * viewer reads a model's files from `<library base>/<region>/library/`, and the list of models
 * from an index published beside them, `<index base>/<region>/models.json`.
 *
 * Values must already be canonical (what the URL parser gives back), https, or http on a loopback
 * host for development. Every variable is optional.
 */

/** Same-origin path the releases are served under, each in a directory of its own. */
export const LIVE2D_VIEWER_PATH = "/live2d-viewer/";

/** The game servers a story library (and so a model index) is published for. */
export const LIVE2D_REGIONS = ["jp", "cn", "tw", "kr", "en"] as const;

export type Live2DRegion = (typeof LIVE2D_REGIONS)[number];

const DEFAULT_LIBRARY_BASE = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/";
const DEFAULT_INDEX_BASE = "https://assets.pjsk.moe/sekai-extra-assets/sekai-live2d/";

function parse(raw: string, name: string): URL {
    const invalid = new Error(`live2d_viewer_config_invalid:${name}`);
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw invalid;
    }
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (/[?#\\\s]/.test(raw) || !(parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback))
        || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash
        || parsed.pathname.split("/").some(part => part === "." || part === "..")
        || raw !== parsed.href) throw invalid;
    return parsed;
}

function directory(raw: string | undefined, name: string): string | null {
    const value = raw?.trim();
    if (!value) return null;
    const parsed = parse(value, name);
    if (!parsed.pathname.endsWith("/")) throw new Error(`live2d_viewer_config_invalid:${name}`);
    return parsed.href;
}

/**
 * The deployment's own copy of Cubism Core for Web, or null: the viewer then loads Live2D's. A
 * deployment that serves one for the story player (`NEXT_PUBLIC_SSE_WEB_CORE_URL`) serves it to
 * the viewer too, unless `NEXT_PUBLIC_LIVE2D_CORE_URL` names another.
 */
export function live2dCoreUrl(): string | null {
    // Each variable is named in full: Next.js writes in only the values it sees spelled out.
    const own = process.env.NEXT_PUBLIC_LIVE2D_CORE_URL?.trim();
    const name = own ? "NEXT_PUBLIC_LIVE2D_CORE_URL" : "NEXT_PUBLIC_SSE_WEB_CORE_URL";
    const value = own || process.env.NEXT_PUBLIC_SSE_WEB_CORE_URL?.trim();
    if (!value) return null;
    const parsed = parse(value, name);
    if (!parsed.pathname.endsWith(".js")) throw new Error(`live2d_viewer_config_invalid:${name}`);
    return parsed.href;
}

/** Development only: a relay put in front of `https://host/...` URLs (`<proxy><host>/...`). */
function proxy(): string | null {
    return directory(process.env.NEXT_PUBLIC_LIVE2D_ASSET_PROXY, "NEXT_PUBLIC_LIVE2D_ASSET_PROXY")
        ?? directory(process.env.NEXT_PUBLIC_SSE_WEB_ASSET_PROXY, "NEXT_PUBLIC_SSE_WEB_ASSET_PROXY");
}

/** `url` as the browser fetches it: through the development relay when one is set. */
export function live2dFetchUrl(url: string): string {
    const relay = proxy();
    return relay ? url.replace(/^https:\/\//, relay) : url;
}

export interface Live2DSources {
    /** The story library's root (holding `ripper.lock.json` and `library/`), as fetched. */
    library: string;
    /** The server's model index, as fetched. */
    index: string;
}

/**
 * Where the viewer reads `region`'s models from. The libraries are `<base>/<region>/`
 * (`NEXT_PUBLIC_LIVE2D_LIBRARY_BASE`), the indexes `<base>/<region>/models.json`
 * (`NEXT_PUBLIC_LIVE2D_INDEX_BASE`).
 */
export function live2dSources(region: Live2DRegion): Live2DSources {
    const libraries = directory(process.env.NEXT_PUBLIC_LIVE2D_LIBRARY_BASE, "NEXT_PUBLIC_LIVE2D_LIBRARY_BASE") ?? DEFAULT_LIBRARY_BASE;
    const indexes = directory(process.env.NEXT_PUBLIC_LIVE2D_INDEX_BASE, "NEXT_PUBLIC_LIVE2D_INDEX_BASE") ?? DEFAULT_INDEX_BASE;
    return {
        library: live2dFetchUrl(`${libraries}${region}/`),
        index: live2dFetchUrl(`${indexes}${region}/models.json`),
    };
}

/** Reads every setting once, so that a malformed one fails the build (next.config.ts). */
export function live2dCheckConfig(): void {
    live2dCoreUrl();
    for (const region of LIVE2D_REGIONS) live2dSources(region);
}

export function isLive2DRegion(value: string | null | undefined): value is Live2DRegion {
    return LIVE2D_REGIONS.includes(value as Live2DRegion);
}
