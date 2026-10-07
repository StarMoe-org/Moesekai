/**
 * Configuration of the Live2D story player (sse-web, built from
 * SekaiStoryExporter). It is a separately versioned release that this
 * repository does not contain: `player.js`, its worker scripts and a wasm
 * under one directory. No release is published by default, so the feature is
 * off until both of these are set:
 *
 * - `NEXT_PUBLIC_SSE_WEB_BASE`: the release directory, ending in "/".
 * - `NEXT_PUBLIC_SSE_WEB_CORE_URL`: the pinned `live2dcubismcore.min.js`
 *   (Cubism Core for Web) the site hosts itself; the release has no copy.
 *
 * The player starts workers from its own directory, and a worker script has
 * to be same-origin with the page. next.config.ts therefore serves the
 * release directory below `/sse-web/`, and the client only ever names that
 * path. Cubism Core is loaded by the workers with `importScripts`, which may
 * cross origins, so its URL is used as it is.
 *
 * Values must already be canonical (what the URL parser gives back), https,
 * or http on a loopback host for development.
 */

/** Same-origin path the release directory is served under. */
export const SSE_WEB_PATH = "/sse-web/";

const DEFAULT_LIBRARY = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/";
const DEFAULT_INAPP = "https://assets.pjsk.moe/sekai-extra-assets/inapp/jp-7.0.0/";

function parse(raw: string, name: string): URL {
    const invalid = new Error(`sse_web_config_invalid:${name}`);
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
    if (!parsed.pathname.endsWith("/")) throw new Error(`sse_web_config_invalid:${name}`);
    return parsed.href;
}

/** The release directory, or null when no release is configured. */
export function sseWebReleaseBase(): string | null {
    return directory(process.env.NEXT_PUBLIC_SSE_WEB_BASE, "NEXT_PUBLIC_SSE_WEB_BASE");
}

/** The URL of Cubism Core for Web, or null when it is not configured. */
export function sseWebCoreUrl(): string | null {
    const value = process.env.NEXT_PUBLIC_SSE_WEB_CORE_URL?.trim();
    if (!value) return null;
    const parsed = parse(value, "NEXT_PUBLIC_SSE_WEB_CORE_URL");
    if (!parsed.pathname.endsWith(".js")) throw new Error("sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_CORE_URL");
    return parsed.href;
}

/** The player is offered only when both the release and Cubism Core are configured. */
export function sseWebEnabled(): boolean {
    return sseWebReleaseBase() !== null && sseWebCoreUrl() !== null;
}

export interface SseWebSources {
    /** The story library (SekaiStoryRipper's output), holding `ripper.lock.json`. */
    library: string;
    /** The client unpack the player derives its UI from. */
    inapp: string;
    /** Development only: a relay put in front of `https://host/...` (the library's host allows one origin). */
    proxy?: string;
}

/** Where the player reads an episode from. Only the JP library is published. */
export function sseWebSources(): SseWebSources {
    const proxy = directory(process.env.NEXT_PUBLIC_SSE_WEB_ASSET_PROXY, "NEXT_PUBLIC_SSE_WEB_ASSET_PROXY");
    return {
        library: directory(process.env.NEXT_PUBLIC_SSE_WEB_LIBRARY, "NEXT_PUBLIC_SSE_WEB_LIBRARY") ?? DEFAULT_LIBRARY,
        inapp: directory(process.env.NEXT_PUBLIC_SSE_WEB_INAPP, "NEXT_PUBLIC_SSE_WEB_INAPP") ?? DEFAULT_INAPP,
        ...(proxy ? { proxy } : {}),
    };
}
