/**
 * Configuration of the Live2D model viewer (SekaiLive2DViewer). Its release -- `viewer.js`, its
 * worker script and a wasm -- is kept in this repository as it was built, in
 * `web/vendor/live2d-viewer`, and copied to `public/live2d-viewer/<release>/` before dev and build
 * (scripts/copy-live2d-viewer.mjs): the viewer starts its worker from its own directory, and a
 * worker script has to be same-origin with the page.
 *
 * The models are those of the version of a server the story data site publishes now (the
 * exporter's publication): the viewer reads a model's files from `<site><region>@<version>/`. The
 * list of models is this site's own catalogue (`/api/live2d/<region>/models`, built by the
 * backend from the published episodes); while it is not ready, the site's `live2d/model/`
 * directory.
 *
 * Values must already be canonical (what the URL parser gives back), https, or http on a loopback
 * host for development. Every variable is optional.
 */

/** Same-origin path the releases are served under, each in a directory of its own. */
export const LIVE2D_VIEWER_PATH = "/live2d-viewer/";

/** The game servers the site publishes. */
export const LIVE2D_REGIONS = ["jp", "cn", "tw", "kr", "en"] as const;

export type Live2DRegion = (typeof LIVE2D_REGIONS)[number];

const DEFAULT_SITE = "https://storage.pjsk.moe/";

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
    /** The site's root (`<site><region>/` names the version it publishes now). */
    site: string;
    region: Live2DRegion;
    /** Development only: a relay put in front of `https://host/...` (`<proxy><host>/...`). */
    proxy?: string;
    /** This site's catalogue of the server's models. */
    catalogue: string;
}

/**
 * Where the viewer reads `region`'s models from: the site of `NEXT_PUBLIC_LIVE2D_SITE`, else the
 * story player's (`NEXT_PUBLIC_SSE_WEB_SITE`), else the default.
 */
export function live2dSources(region: Live2DRegion): Live2DSources {
    const site = directory(process.env.NEXT_PUBLIC_LIVE2D_SITE, "NEXT_PUBLIC_LIVE2D_SITE")
        ?? directory(process.env.NEXT_PUBLIC_SSE_WEB_SITE, "NEXT_PUBLIC_SSE_WEB_SITE")
        ?? DEFAULT_SITE;
    const relay = proxy();
    return {
        site,
        region,
        ...(relay ? { proxy: relay } : {}),
        catalogue: `/api/live2d/${region}/models`,
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
