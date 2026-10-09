/**
 * Clip playback for guess-the-song: two reusable <audio> elements, one
 * playing and one preloading the next round. A clip is "ready" once the
 * metadata is known and the element sits at the clip start (the data there
 * is buffered), so pressing play starts the sound right away.
 *
 * A clip comes either from a full track (the original song on the asset CDN,
 * seeked to the clip start) or from a clip the server has already cut (vocal
 * removal: the instrumental never reaches the browser in full), which plays
 * from 0.
 */
import { resolveClipStart } from "./rounds";

/** A full track: the clip start is picked inside it once its duration is known. */
export interface TrackClipSource {
    kind: "track";
    src: string;
    startFraction: number;
    fillerSec: number;
}

/** A clip cut by the server: `resolve` asks for it and says where it sits in the song. */
export interface CutClipSource {
    kind: "cut";
    resolve: () => Promise<{ src: string; startSeconds: number }>;
}

export interface ClipRequest {
    /** Identity of the clip: changes with the game, round and vocal. */
    key: string;
    clipSeconds: number;
    source: TrackClipSource | CutClipSource;
}

export interface ClipListener {
    /** Sound is coming out (also after a stall or a replay); `songStart` is where the clip starts in the song. */
    onPlaying(songStart: number): void;
    onProgress(fraction: number): void;
    onEnded(): void;
}

/** play() was refused by the autoplay policy: a click is needed. */
export class ClipBlockedError extends Error {
    constructor() {
        super("Clip playback needs a user gesture");
        this.name = "ClipBlockedError";
    }
}

const LOAD_TIMEOUT_MS = 20_000;

interface Slot {
    element: HTMLAudioElement;
    key: string | null;
    request: ClipRequest | null;
    /** Element time where the clip starts (0 for a server-cut clip). */
    offset: number | null;
    /** Song time where the clip starts. */
    songStart: number | null;
    ready: Promise<number> | null;
    cancel: (() => void) | null;
}

function createSlot(): Slot {
    const element = new Audio();
    element.preload = "auto";
    return { element, key: null, request: null, offset: null, songStart: null, ready: null, cancel: null };
}

function abortError(): Error {
    const error = new Error("Clip load superseded");
    error.name = "AbortError";
    return error;
}

export class ClipAudioEngine {
    private slots: Slot[] = [];
    private active: Slot | null = null;
    private listener: ClipListener | null = null;
    private frame = 0;
    private stopTimer: ReturnType<typeof setTimeout> | null = null;
    private destroyed = false;
    private volume = 1;

    setListener(listener: ClipListener | null): void {
        this.listener = listener;
    }

    setVolume(volume: number): void {
        this.volume = Math.min(1, Math.max(0, volume));
        for (const slot of this.slots) slot.element.volume = this.volume;
    }

    /** Loads a clip (reusing a preloaded one) and resolves with its start in the song once it is ready. */
    load(request: ClipRequest): Promise<number> {
        const existing = this.slots.find((slot) => slot.key === request.key && slot.ready);
        if (existing?.ready) return existing.ready;
        return this.prepare(this.freeSlot(), request);
    }

    /** Warms up the next clip in the spare element; failures surface again when it is loaded for real. */
    preload(request: ClipRequest): void {
        if (this.slots.some((slot) => slot.key === request.key)) return;
        this.prepare(this.freeSlot(), request).catch(() => undefined);
    }

    /** Plays the clip from its start. Rejects with ClipBlockedError when a user gesture is needed. */
    async play(key: string): Promise<void> {
        const slot = this.slots.find((candidate) => candidate.key === key);
        if (!slot || slot.offset === null || !slot.request || this.destroyed) throw new Error("Clip not loaded");
        if (this.active && this.active !== slot) this.pauseSlot(this.active);
        this.active = slot;
        this.clearMonitor();

        const element = slot.element;
        if (Math.abs(element.currentTime - slot.offset) > 0.05) element.currentTime = slot.offset;
        try {
            await element.play();
        } catch (error) {
            if (error instanceof DOMException && error.name === "NotAllowedError") throw new ClipBlockedError();
            throw error;
        }
        // Restarting a clip that is still playing fires no new "playing" event: watch for its end here too.
        if (this.active === slot && !element.paused) this.monitor(slot);
    }

    /** Pauses whatever is playing. */
    stop(): void {
        if (this.active) this.pauseSlot(this.active);
        this.clearMonitor();
    }

    destroy(): void {
        this.destroyed = true;
        this.clearMonitor();
        for (const slot of this.slots) {
            slot.cancel?.();
            this.detach(slot);
            slot.element.pause();
            slot.element.removeAttribute("src");
            slot.element.load();
        }
        this.slots = [];
        this.active = null;
        this.listener = null;
    }

    private freeSlot(): Slot {
        const spare = this.slots.find((slot) => slot !== this.active);
        if (spare) return spare;
        if (this.slots.length < 2) {
            const slot = createSlot();
            slot.element.volume = this.volume;
            this.slots.push(slot);
            return slot;
        }
        return this.slots[0];
    }

    private prepare(slot: Slot, request: ClipRequest): Promise<number> {
        slot.cancel?.();
        this.detach(slot);
        if (slot === this.active) {
            this.clearMonitor();
            this.active = null;
        }
        slot.key = request.key;
        slot.request = request;
        slot.offset = null;
        slot.songStart = null;
        const element = slot.element;
        element.pause();

        const ready = new Promise<number>((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => fail(new Error("Clip load timed out")), LOAD_TIMEOUT_MS);
            const cleanup = () => {
                clearTimeout(timer);
                element.removeEventListener("loadedmetadata", onMetadata);
                element.removeEventListener("seeked", onSeeked);
                element.removeEventListener("error", onError);
                if (slot.cancel === cancel) slot.cancel = null;
            };
            const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (slot.key === request.key) {
                    slot.ready = null;
                    slot.key = null;
                }
                reject(error);
            };
            const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                this.attach(slot);
                resolve(slot.songStart ?? 0);
            };
            const onSeeked = () => finish();
            const onError = () => fail(new Error("Clip failed to load"));
            const onMetadata = () => {
                const source = request.source;
                const offset =
                    source.kind === "track" ? resolveClipStart(source.startFraction, source.fillerSec, element.duration, request.clipSeconds) : 0;
                slot.offset = offset;
                if (source.kind === "track") slot.songStart = offset;
                if (Math.abs(element.currentTime - offset) < 0.01) {
                    finish();
                    return;
                }
                element.addEventListener("seeked", onSeeked);
                element.currentTime = offset;
            };
            const cancel = () => fail(abortError());
            const startElement = (src: string) => {
                element.addEventListener("loadedmetadata", onMetadata);
                element.addEventListener("error", onError);
                element.src = src;
                element.load();
            };
            slot.cancel = cancel;

            const source = request.source;
            if (source.kind === "track") {
                startElement(source.src);
                return;
            }
            source.resolve().then(
                (cut) => {
                    if (settled) return;
                    slot.songStart = cut.startSeconds;
                    startElement(cut.src);
                },
                (error: unknown) => fail(error instanceof Error ? error : new Error(String(error))),
            );
        });
        slot.ready = ready;
        return ready;
    }

    private handlers = new WeakMap<Slot, { playing: () => void; ended: () => void }>();

    private attach(slot: Slot): void {
        if (this.handlers.has(slot)) return;
        const playing = () => {
            if (this.active !== slot || slot.songStart === null) return;
            this.listener?.onPlaying(slot.songStart);
            this.monitor(slot);
        };
        const ended = () => {
            if (this.active !== slot) return;
            this.clearMonitor();
            this.listener?.onProgress(1);
            this.listener?.onEnded();
        };
        slot.element.addEventListener("playing", playing);
        slot.element.addEventListener("ended", ended);
        this.handlers.set(slot, { playing, ended });
    }

    private detach(slot: Slot): void {
        const handlers = this.handlers.get(slot);
        if (!handlers) return;
        slot.element.removeEventListener("playing", handlers.playing);
        slot.element.removeEventListener("ended", handlers.ended);
        this.handlers.delete(slot);
    }

    /** Stops the element exactly at the clip end: an animation-frame loop, plus a timer for hidden tabs. */
    private monitor(slot: Slot): void {
        this.clearMonitor();
        const request = slot.request;
        const offset = slot.offset;
        if (!request || offset === null) return;
        const end = offset + request.clipSeconds;
        const element = slot.element;
        /** True once the clip is over. */
        const check = (): boolean => {
            if (this.active !== slot) return true;
            const position = element.currentTime;
            if (position >= end - 0.01) {
                this.pauseSlot(slot);
                this.clearMonitor();
                this.listener?.onProgress(1);
                this.listener?.onEnded();
                return true;
            }
            this.listener?.onProgress(Math.max(0, Math.min(1, (position - offset) / request.clipSeconds)));
            return false;
        };
        const onFrame = () => {
            if (!check()) this.frame = requestAnimationFrame(onFrame);
        };
        const onTimer = () => {
            this.stopTimer = null;
            // A stall delays the end: check again when the rest of the clip should be over.
            if (!check()) this.stopTimer = setTimeout(onTimer, Math.max(50, (end - element.currentTime) * 1000 + 30));
        };
        this.frame = requestAnimationFrame(onFrame);
        this.stopTimer = setTimeout(onTimer, Math.max(0, end - element.currentTime) * 1000 + 30);
    }

    private clearMonitor(): void {
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
        if (this.stopTimer) clearTimeout(this.stopTimer);
        this.stopTimer = null;
    }

    private pauseSlot(slot: Slot): void {
        if (!slot.element.paused) slot.element.pause();
    }
}
