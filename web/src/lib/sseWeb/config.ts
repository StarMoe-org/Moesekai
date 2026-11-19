/**
 * Configuration of the Live2D story player (sse-web, built from
 * SekaiStoryExporter). Its release -- `player.js`, its worker scripts and a
 * wasm -- is kept in this repository as it was built, in `web/vendor/sse-web`,
 * and copied to `public/sse-web/<release>/` before dev and build
 * (scripts/copy-sse-web.mjs): the player starts workers from its own
 * directory, and a worker script has to be same-origin with the page.
 *
 * The release has no copy of Cubism Core for Web: the player loads
 * `live2dcubismcore.min.js` from Live2D's own address. A deployment that
 * serves a copy of its own names it in `NEXT_PUBLIC_SSE_WEB_CORE_URL`; the
 * workers load it with `importScripts`, which may cross origins.
 *
 * Values must already be canonical (what the URL parser gives back), https,
 * or http on a loopback host for development.
 */

/** Same-origin path the releases are served under, each in a directory of its own. */
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

/** The deployment's own copy of Cubism Core for Web, or null: the player then loads Live2D's. */
export function sseWebCoreUrl(): string | null {
    const value = process.env.NEXT_PUBLIC_SSE_WEB_CORE_URL?.trim();
    if (!value) return null;
    const parsed = parse(value, "NEXT_PUBLIC_SSE_WEB_CORE_URL");
    if (!parsed.pathname.endsWith(".js")) throw new Error("sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_CORE_URL");
    return parsed.href;
}

/** The game servers whose stories the site publishes. */
export const SSE_WEB_REGIONS = ["jp", "cn", "tw", "kr", "en"] as const;

export type SseWebRegion = (typeof SSE_WEB_REGIONS)[number];

/** The site that publishes the story data (the exporter's publication), by default. */
const DEFAULT_SITE = "https://storage.pjsk.moe/";

export interface SseWebSources {
    /** The site's root: the player reads `<site><region>@<version>/` and the client view `<site>client/<client region>@<version>/`. */
    site: string;
    region: SseWebRegion;
    /** The interface is another server's client (CN's, for TW, KR and EN): its UI and fonts are not this server's own. */
    borrowedUi: boolean;
    /** Development only: a relay put in front of `https://host/...` (`<proxy><host>/...`). */
    proxy?: string;
}

/** The server whose client view a server's stories are shown with: its own for JP, CN's for the others (player.js does the same). */
export function sseWebClientRegion(region: SseWebRegion): "jp" | "cn" {
    return region === "jp" ? "jp" : "cn";
}

/** The site's root, `NEXT_PUBLIC_SSE_WEB_SITE` or the default. */
export function sseWebSite(): string {
    return directory(process.env.NEXT_PUBLIC_SSE_WEB_SITE, "NEXT_PUBLIC_SSE_WEB_SITE") ?? DEFAULT_SITE;
}

/**
 * Where the player reads the episodes of `region`'s server from: the version the site publishes
 * now (the player finds it), or null for a server the site does not publish.
 */
export function sseWebSources(region: string): SseWebSources | null {
    if (!SSE_WEB_REGIONS.includes(region as SseWebRegion)) return null;
    const known = region as SseWebRegion;
    const proxy = directory(process.env.NEXT_PUBLIC_SSE_WEB_ASSET_PROXY, "NEXT_PUBLIC_SSE_WEB_ASSET_PROXY");
    return {
        site: sseWebSite(),
        region: known,
        borrowedUi: sseWebClientRegion(known) !== known,
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
 * The JP client's own typeface is a commercial one, which this site does not hand out: the JP
 * stories are drawn with open fonts instead, and the player then does not fetch the client's
 * font files at all.
 *
 * - M PLUS 1 (variable; SIL OFL 1.1) for the text. Its weights are set to what measures the
 *   same stroke weight as the client's two faces: 460 for the words, 820 for the names.
 * - Source Han Sans JP (SIL OFL 1.1) for the characters M PLUS 1 lacks (it has the common
 *   kanji but not all of the rarer ones): Medium behind the words, Heavy behind the names.
 *
 * The three files are kept in this repository under their upstream names, with their licence
 * (`public/story-fonts`), and served from the site's own origin. `NEXT_PUBLIC_SSE_WEB_FONT_BASE`
 * names another directory holding them. The client's fonts are used only when
 * `NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS` asks for them, or when the build found the three files
 * missing and no other directory is named (next.config.ts tells through
 * `NEXT_PUBLIC_SSE_WEB_BUNDLED_FONTS`).
 *
 * The other servers' text is drawn with the CN client's own font, Source Han Sans SC (open), from
 * the site's client view.
 */
const FONT_TEXT = "MPLUS1[wght].ttf";
const FONT_FILL_BODY = "SourceHanSansJP-Medium.otf";
const FONT_FILL_NAME = "SourceHanSansJP-Heavy.otf";
const WEIGHT_BODY = 460;
const WEIGHT_NAME = 820;

/** Same-origin directory of the open fonts this repository keeps (`public/story-fonts`). */
export const SSE_WEB_FONT_PATH = "/story-fonts/";

/** The font files that directory has to hold. */
export const SSE_WEB_FONT_FILES: readonly string[] = [FONT_TEXT, FONT_FILL_BODY, FONT_FILL_NAME];

/** A switch: unset, empty, `0` or `false` is off; `1` or `true` is on. */
function enabled(raw: string | undefined, name: string): boolean {
    const value = raw?.trim().toLowerCase();
    if (!value || value === "0" || value === "false") return false;
    if (value === "1" || value === "true") return true;
    throw new Error(`sse_web_config_invalid:${name}`);
}

/**
 * The fonts that replace the client's for `region`'s stories, or null when the client's are
 * used. The URLs are those of the configured directory, or paths of this origin for the fonts
 * the repository keeps.
 */
export function sseWebFonts(region: string): SseWebFonts | null {
    const named = directory(process.env.NEXT_PUBLIC_SSE_WEB_FONT_BASE, "NEXT_PUBLIC_SSE_WEB_FONT_BASE");
    const client = enabled(process.env.NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS, "NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS");
    const bundled = enabled(process.env.NEXT_PUBLIC_SSE_WEB_BUNDLED_FONTS, "NEXT_PUBLIC_SSE_WEB_BUNDLED_FONTS");
    const base = named ?? (bundled ? SSE_WEB_FONT_PATH : null);
    if (region !== "jp" || client || !base) return null;
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
