/**
 * What the reader chooses about the Live2D player's picture: the size it is
 * rendered at and its aspect ratio. Kept in this browser.
 */

/** The aspect ratios on offer, as whole numbers: a picture is a whole multiple of one. */
export const SSE_WEB_ASPECTS = {
    "16:9": [16, 9],
    "4:3": [4, 3],
    "2:1": [2, 1],
    "21:9": [21, 9],
} as const satisfies Record<string, readonly [number, number]>;

export type SseWebAspect = keyof typeof SSE_WEB_ASPECTS;

/** The picture's height in pixels, or `auto`: what the player's window shows, pixel for pixel. */
export const SSE_WEB_RESOLUTIONS = ["auto", "540", "720", "1080", "1440", "2160"] as const;

export type SseWebResolution = (typeof SSE_WEB_RESOLUTIONS)[number];

export interface SseWebSettings {
    resolution: SseWebResolution;
    aspect: SseWebAspect;
    /** In full screen the picture has the screen's aspect ratio in place of `aspect`. */
    fullscreenFillsScreen: boolean;
    /** The render size, frame rate and memory are shown over the picture. */
    showStats: boolean;
}

export const SSE_WEB_DEFAULT_SETTINGS: SseWebSettings = {
    resolution: "auto",
    aspect: "16:9",
    fullscreenFillsScreen: true,
    showStats: false,
};

const SETTINGS_KEY = "story-live2d-settings";

/** What was stored, where it is still on offer; the defaults for the rest. */
export function loadSseWebSettings(): SseWebSettings {
    const settings = { ...SSE_WEB_DEFAULT_SETTINGS };
    try {
        const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Record<keyof SseWebSettings, unknown>> | null;
        if (!stored || typeof stored !== "object") return settings;
        if (SSE_WEB_RESOLUTIONS.includes(stored.resolution as SseWebResolution)) settings.resolution = stored.resolution as SseWebResolution;
        if (typeof stored.aspect === "string" && stored.aspect in SSE_WEB_ASPECTS) settings.aspect = stored.aspect as SseWebAspect;
        if (typeof stored.fullscreenFillsScreen === "boolean") settings.fullscreenFillsScreen = stored.fullscreenFillsScreen;
        if (typeof stored.showStats === "boolean") settings.showStats = stored.showStats;
    } catch {
        // no storage, or not what was stored
    }
    return settings;
}

export function storeSseWebSettings(settings: SseWebSettings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // the settings hold until the page is left
    }
}

/** Width over height of the picture in the player's window. */
export function sseWebAspectRatio(settings: SseWebSettings): number {
    const [across, down] = SSE_WEB_ASPECTS[settings.aspect];
    return across / down;
}

/**
 * The size to render at.
 *
 * In the window: the chosen height, or the picture's shown size (`shownWidth`
 * CSS pixels across) times the device pixel ratio; always an exact multiple
 * of the aspect ratio, which the player lays its UI out by.
 *
 * In full screen: the screen's own shape when that is asked for and the
 * screen lies on its side, else the largest picture of the chosen aspect
 * ratio that fits it. Without a chosen height a touch device is capped at
 * 1920 on its long side.
 */
export function sseWebRenderSize(settings: SseWebSettings, shownWidth: number, fullscreen: boolean): [number, number] {
    const dpr = window.devicePixelRatio || 1;
    const [across, down] = SSE_WEB_ASPECTS[settings.aspect];
    const multiple = (units: number): [number, number] => {
        const whole = Math.max(1, Math.floor(units));
        return [whole * across, whole * down];
    };
    const chosen = settings.resolution === "auto" ? null : Number(settings.resolution);
    if (!fullscreen) return multiple(chosen ? chosen / down : shownWidth * dpr / across);

    let [width, height] = [window.screen.width * dpr, window.screen.height * dpr];
    const cap = window.matchMedia("(pointer: coarse)").matches ? 1920 / Math.max(width, height) : 1;
    if (cap < 1) [width, height] = [width * cap, height * cap];
    if (settings.fullscreenFillsScreen && width > height) {
        const scale = chosen ? chosen / height : 1;
        return [Math.round(width * scale), Math.round(height * scale)];
    }
    return multiple(chosen ? chosen / down : Math.min(width / across, height / down));
}
