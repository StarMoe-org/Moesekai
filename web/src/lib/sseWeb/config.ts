/**
 * Configuration of the Live2D story player (sse-web, built from
 * SekaiStoryExporter). It is a separately versioned release that this
 * repository does not contain: `player.js`, its worker scripts and a wasm
 * under one directory. No release is published by default, so the feature is
 * off until this is set:
 *
 * - `NEXT_PUBLIC_SSE_WEB_BASE`: the release directory, ending in "/".
 *
 * The release has no copy of Cubism Core for Web: the player loads
 * `live2dcubismcore.min.js` from Live2D's own address. A deployment that
 * serves a copy of its own names it in `NEXT_PUBLIC_SSE_WEB_CORE_URL`.
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

/** The deployment's own copy of Cubism Core for Web, or null: the player then loads Live2D's. */
export function sseWebCoreUrl(): string | null {
    const value = process.env.NEXT_PUBLIC_SSE_WEB_CORE_URL?.trim();
    if (!value) return null;
    const parsed = parse(value, "NEXT_PUBLIC_SSE_WEB_CORE_URL");
    if (!parsed.pathname.endsWith(".js")) throw new Error("sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_CORE_URL");
    return parsed.href;
}

/** The player is offered only when a release is configured. */
export function sseWebEnabled(): boolean {
    return sseWebReleaseBase() !== null;
}

/** The game servers a story library is published for. */
export const SSE_WEB_REGIONS = ["jp", "cn", "tw", "kr", "en"] as const;

export type SseWebRegion = (typeof SSE_WEB_REGIONS)[number];

const DEFAULT_LIBRARY_BASE = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/";
const DEFAULT_INAPP_BASE = "https://assets.pjsk.moe/sekai-extra-assets/inapp/";
// Only the JP and CN clients are unpacked. The other three servers' libraries play with the
// CN client's UI and fonts, which draw their text but are not those servers' own.
const DEFAULT_INAPPS = "jp=jp-7.0.0,cn=cn-6.4.0,tw=cn-6.4.0,kr=cn-6.4.0,en=cn-6.4.0";

export interface SseWebSources {
    /** The story library (SekaiStoryRipper's output), holding `ripper.lock.json`. */
    library: string;
    /** The client unpack the player derives its UI from. */
    inapp: string;
    /** The client unpack is another server's: the picture's UI and fonts are not this server's own. */
    borrowedUi: boolean;
    /** Development only: a relay put in front of `https://host/...` (the library's host allows one origin). */
    proxy?: string;
}

/**
 * The client unpack each server's stories are played with, as `NEXT_PUBLIC_SSE_WEB_INAPPS`
 * gives it: `<region>=<unpack>` pairs separated by commas, an unpack being a directory under
 * the unpacks' base (e.g. `jp-7.0.0`). A server that is left out has no Live2D playback.
 */
function inapps(): Partial<Record<SseWebRegion, string>> {
    const invalid = new Error("sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_INAPPS");
    const raw = process.env.NEXT_PUBLIC_SSE_WEB_INAPPS?.trim() || DEFAULT_INAPPS;
    const map: Partial<Record<SseWebRegion, string>> = {};
    for (const pair of raw.split(",")) {
        const [region, unpack, ...rest] = pair.trim().split("=");
        if (rest.length > 0 || !SSE_WEB_REGIONS.includes(region as SseWebRegion) || region in map
            || !/^[a-z0-9][a-z0-9.-]*$/.test(unpack ?? "") || unpack.includes("..")) throw invalid;
        map[region as SseWebRegion] = unpack;
    }
    return map;
}

/**
 * Where the player reads the episodes of `region`'s server from, or null when that server
 * has no client unpack to play with. The libraries are `<base>/<region>/`, the unpacks
 * `<base>/<unpack>/`; both bases can be moved (`NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE`,
 * `NEXT_PUBLIC_SSE_WEB_INAPP_BASE`).
 */
export function sseWebSources(region: string): SseWebSources | null {
    const unpack = inapps()[region as SseWebRegion];
    if (!unpack) return null;
    const libraries = directory(process.env.NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE, "NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE") ?? DEFAULT_LIBRARY_BASE;
    const unpacks = directory(process.env.NEXT_PUBLIC_SSE_WEB_INAPP_BASE, "NEXT_PUBLIC_SSE_WEB_INAPP_BASE") ?? DEFAULT_INAPP_BASE;
    const proxy = directory(process.env.NEXT_PUBLIC_SSE_WEB_ASSET_PROXY, "NEXT_PUBLIC_SSE_WEB_ASSET_PROXY");
    return {
        library: `${libraries}${region}/`,
        inapp: `${unpacks}${unpack}/`,
        borrowedUi: !unpack.startsWith(`${region}-`),
        ...(proxy ? { proxy } : {}),
    };
}

/** A font file the player draws text with: its URL and, for a variable font, the weight it is set to. */
export interface SseWebFontFile {
    url: string;
    weight?: number;
}

/** The fonts of the words and of the names: each a font and the fonts that fill in the characters it lacks. */
export interface SseWebFonts {
    body: SseWebFontFile[];
    name: SseWebFontFile[];
}

/*
 * The JP client's own typeface is a commercial one, which this site does not hand out. With
 * `NEXT_PUBLIC_SSE_WEB_FONT_BASE` set (a directory holding the three files below, under
 * their upstream names, with their licence), the JP stories are drawn with open fonts
 * instead, and the player does not fetch the client's font files at all:
 *
 * - M PLUS 1 (variable; SIL OFL 1.1) for the text. Its weights are set to what measures the
 *   same stroke weight as the client's two faces: 460 for the words, 820 for the names.
 * - Source Han Sans JP (SIL OFL 1.1) for the characters M PLUS 1 lacks (it has the common
 *   kanji but not all of the rarer ones): Medium behind the words, Heavy behind the names.
 *
 * The other servers' text is drawn with Source Han Sans SC, an open font their client unpack
 * carries, and is left as it is.
 */
const FONT_TEXT = "MPLUS1[wght].ttf";
const FONT_FILL_BODY = "SourceHanSansJP-Medium.otf";
const FONT_FILL_NAME = "SourceHanSansJP-Heavy.otf";
const WEIGHT_BODY = 460;
const WEIGHT_NAME = 820;

/** The fonts that replace the client's for `region`'s stories, or null when the client's are used. */
export function sseWebFonts(region: string): SseWebFonts | null {
    const base = directory(process.env.NEXT_PUBLIC_SSE_WEB_FONT_BASE, "NEXT_PUBLIC_SSE_WEB_FONT_BASE");
    if (!base || region !== "jp") return null;
    const file = (name: string) => `${base}${encodeURIComponent(name)}`;
    return {
        body: [{ url: file(FONT_TEXT), weight: WEIGHT_BODY }, { url: file(FONT_FILL_BODY) }],
        name: [{ url: file(FONT_TEXT), weight: WEIGHT_NAME }, { url: file(FONT_FILL_NAME) }],
    };
}

/** Checks every value that `sseWebSources` and `sseWebFonts` read; a wrong one throws. For the build. */
export function sseWebCheckSources(): void {
    for (const region of SSE_WEB_REGIONS) {
        sseWebSources(region);
        sseWebFonts(region);
    }
}
