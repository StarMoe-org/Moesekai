/**
 * The sse-web player as this site uses it. The player is loaded at run time
 * from the release directory (see ./config.ts), so only its shape is declared
 * here; the release's README documents the full interface.
 */
import { SSE_WEB_PATH } from "./config";

export type SsePlayerErrorKind = "unsupported" | "not-found" | "network" | "internal";

/** What `SsePlayer.supported()` can report as missing. */
export type SsePlayerMissing = "webgpu" | "webgpu-adapter" | "offscreen-canvas" | "audio-worklet" | "worker";

/** Content of an episode the player does not play. */
export interface SsePlayerUnsupported {
    reason: "movie" | "music_video" | "input_name" | "selectable" | "unknown_effect_type" | "unknown_action";
    name?: string;
}

export interface SsePlayerError extends Error {
    kind?: SsePlayerErrorKind;
    url?: string;
    missing?: SsePlayerMissing[];
}

export interface SsePlayerProgressPart {
    phase: string;
    done: number;
    total: number;
    bytes: number;
}

export interface SsePlayerProgress {
    sim?: SsePlayerProgressPart;
    render?: SsePlayerProgressPart;
    kit?: SsePlayerProgressPart;
}

/**
 * What playback moves between: an instruction of the scenario a tap acts on.
 * `snippet` is its position in the scenario's `Snippets`.
 */
export type SsePlayerNode = { snippet: number } & (
    | { kind: "talk"; speaker: string; body: string }
    | { kind: "telop" | "text"; body: string }
    | { kind: "choices"; options: string[] }
);

export interface SsePlayerPosition {
    shown: number;
    node: number;
    nodes: number;
    seeking: boolean;
    waitsForClick?: boolean;
    waitsForAnswer?: boolean;
    stalled?: string;
    ended: boolean;
}

export interface SsePlayerOptions {
    canvas: HTMLCanvasElement;
    js: string;
    pkg: string;
    core: string;
    sources: { library: string; inapp: string; proxy?: string };
    /** Fonts to draw the text with in place of the client's (which are then not fetched). */
    fonts?: { body: { url: string; weight?: number }[]; name: { url: string; weight?: number }[] };
    selector: string;
    width: number;
    height: number;
    playerName?: string;
    auto?: boolean;
    onProgress?: (progress: SsePlayerProgress) => void;
}

/** Counts since the player was made; the bytes are its two workers' wasm memories. */
export interface SsePlayerStats {
    presented: number;
    skipped: number;
    simWasm?: number;
    renderWasm?: number;
}

export interface SsePlayer extends EventTarget {
    readonly stats: SsePlayerStats;
    readonly nodes: SsePlayerNode[];
    readonly unsupported: SsePlayerUnsupported[];
    readonly node: number;
    readonly position: SsePlayerPosition;
    readonly error?: string;
    width: number;
    height: number;
    play(): Promise<void>;
    pause(): void;
    setAuto(auto: boolean): void;
    click(x?: number, y?: number): void;
    resize(width: number, height: number): void;
    seek(node: number): void;
    next(): void;
    previous(): void;
    setVolume(volume: number): void;
    destroy(): void;
}

export interface SsePlayerStatic {
    supported(): Promise<{ ok: boolean; missing: SsePlayerMissing[] }>;
    create(options: SsePlayerOptions): Promise<SsePlayer>;
}

/** The directory the player's scripts are served from, as a URL of this origin. */
export function sseWebScriptBase(): string {
    return new URL(SSE_WEB_PATH, window.location.origin).href;
}

/** Loads the player class from the release. */
export async function loadSsePlayer(): Promise<SsePlayerStatic> {
    const url = `${sseWebScriptBase()}player.js`;
    // The release is versioned apart from this site: keep it out of every bundle.
    const loaded = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as { SsePlayer?: SsePlayerStatic };
    if (typeof loaded.SsePlayer?.create !== "function") throw new Error("sse_web_player_unavailable");
    return loaded.SsePlayer;
}
