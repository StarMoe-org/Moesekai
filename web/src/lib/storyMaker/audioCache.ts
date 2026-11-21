/**
 * Shared Web Audio API context, bounded LRU decoded `AudioBuffer` cache, concurrent fetch
 * deduplication, and waveform peak extraction for Story Maker voice trimming & SE playback.
 */

const MAX_CACHED_BUFFERS = 32;

export interface DecodedStoryAudio {
    buffer: AudioBuffer;
    url: string;
}

interface InflightDecode {
    key: string;
    controller: AbortController;
    waiters: number;
    promise: Promise<DecodedStoryAudio | null>;
}

let sharedAudioContext: AudioContext | null = null;
/** LRU map ordered oldest -> newest (canonical resolved URL -> decoded AudioBuffer). */
const decodedCache = new Map<string, AudioBuffer>();
/** Maps candidate URL -> canonical resolved URL stored in `decodedCache`. */
const urlAliases = new Map<string, string>();
/** Active in-flight decode jobs keyed by candidate list key. */
const inflightDecodes = new Map<string, InflightDecode>();

function getAudioContextCtor(): (new () => AudioContext) | null {
    if (typeof window === "undefined") return null;
    const win = window as unknown as {
        AudioContext?: new () => AudioContext;
        webkitAudioContext?: new () => AudioContext;
    };
    return win.AudioContext ?? win.webkitAudioContext ?? null;
}

/** Returns the lazily-created shared browser `AudioContext`, or `null` during SSR / unsupported environments. */
export function getSharedAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (sharedAudioContext && sharedAudioContext.state !== "closed") {
        return sharedAudioContext;
    }
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
        sharedAudioContext = new Ctor();
        return sharedAudioContext;
    } catch {
        return null;
    }
}

/** Resumes the shared `AudioContext` inside a user gesture; resolves `true` when running. */
export async function resumeSharedAudioContext(): Promise<boolean> {
    const ctx = getSharedAudioContext();
    if (!ctx) return false;
    if (ctx.state === "running") return true;
    try {
        await ctx.resume();
        return (ctx.state as AudioContextState) === "running";
    } catch {
        return false;
    }
}

function touchCache(canonicalUrl: string, buffer: AudioBuffer): void {
    decodedCache.delete(canonicalUrl);
    decodedCache.set(canonicalUrl, buffer);
}

function storeInCache(canonicalUrl: string, buffer: AudioBuffer, attemptedUrls: readonly string[]): void {
    touchCache(canonicalUrl, buffer);
    for (const candidate of attemptedUrls) {
        if (candidate && candidate !== canonicalUrl) {
            urlAliases.set(candidate, canonicalUrl);
        }
    }
    while (decodedCache.size > MAX_CACHED_BUFFERS) {
        const oldest = decodedCache.keys().next().value;
        if (oldest === undefined) break;
        decodedCache.delete(oldest);
        for (const [alias, target] of urlAliases.entries()) {
            if (target === oldest) urlAliases.delete(alias);
        }
    }
}

/** Looks up a previously decoded `AudioBuffer` by URL (touching LRU recency on hit). */
export function getCachedStoryAudio(url: string): AudioBuffer | null {
    const trimmed = url.trim();
    if (!trimmed) return null;
    const canonical = urlAliases.get(trimmed) ?? trimmed;
    const hit = decodedCache.get(canonical);
    if (!hit) return null;
    touchCache(canonical, hit);
    return hit;
}

/** Clears the in-memory decoded audio cache (useful for tests or memory pressure). */
export function clearStoryAudioCache(): void {
    decodedCache.clear();
    urlAliases.clear();
}

/**
 * Fetches and decodes the first playable URL from `urls` into the shared LRU `AudioBuffer` cache.
 * Deduplicates concurrent requests across callers and honors per-caller `AbortSignal`.
 */
export async function decodeStoryAudio(
    urls: readonly string[],
    signal?: AbortSignal,
): Promise<DecodedStoryAudio | null> {
    if (typeof window === "undefined" || signal?.aborted) return null;

    const candidates: string[] = [];
    const seen = new Set<string>();
    for (const raw of urls) {
        const trimmed = raw.trim();
        if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            candidates.push(trimmed);
        }
    }
    if (candidates.length === 0) return null;

    // Fast path: already decoded in LRU cache under any candidate URL.
    for (const candidate of candidates) {
        const canonical = urlAliases.get(candidate) ?? candidate;
        const hit = decodedCache.get(canonical);
        if (hit) {
            storeInCache(canonical, hit, candidates);
            return { buffer: hit, url: canonical };
        }
    }

    const ctx = getSharedAudioContext();
    if (!ctx) return null;

    const key = candidates.join("|");
    let entry = inflightDecodes.get(key);
    if (!entry) {
        const controller = new AbortController();
        const created: InflightDecode = {
            key,
            controller,
            waiters: 0,
            promise: (async (): Promise<DecodedStoryAudio | null> => {
                for (const candidate of candidates) {
                    if (controller.signal.aborted) return null;
                    try {
                        const response = await fetch(candidate, {
                            mode: "cors",
                            credentials: "omit",
                            signal: controller.signal,
                        });
                        if (!response.ok) continue;
                        const rawBytes = await response.arrayBuffer();
                        if (controller.signal.aborted) return null;
                        // Copy buffer because `decodeAudioData` detaches the ArrayBuffer in browsers.
                        const buffer = await ctx.decodeAudioData(rawBytes.slice(0));
                        storeInCache(candidate, buffer, candidates);
                        return { buffer, url: candidate };
                    } catch {
                        if (controller.signal.aborted) return null;
                    }
                }
                return null;
            })().finally(() => {
                if (inflightDecodes.get(key) === created) {
                    inflightDecodes.delete(key);
                }
            }),
        };
        inflightDecodes.set(key, created);
        entry = created;
    }

    entry.waiters += 1;
    let released = false;
    const detachWaiter = () => {
        if (released || !entry) return;
        released = true;
        entry.waiters = Math.max(0, entry.waiters - 1);
        if (entry.waiters === 0 && inflightDecodes.get(key) === entry) {
            inflightDecodes.delete(key);
            entry.controller.abort();
        }
    };

    if (!signal) {
        try {
            return await entry.promise;
        } finally {
            if (!released) {
                released = true;
                entry.waiters = Math.max(0, entry.waiters - 1);
            }
        }
    }

    return new Promise<DecodedStoryAudio | null>((resolve) => {
        if (signal.aborted) {
            detachWaiter();
            resolve(null);
            return;
        }
        const onAbort = () => {
            detachWaiter();
            resolve(null);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        void entry!.promise.then((result) => {
            signal.removeEventListener("abort", onAbort);
            if (!released) {
                released = true;
                entry!.waiters = Math.max(0, entry!.waiters - 1);
            }
            resolve(signal.aborted ? null : result);
        });
    });
}

/**
 * Downsamples a mono or multi-channel `AudioBuffer` into `bucketCount` normalized `0..1`
 * amplitude peak values suitable for waveform canvas rendering.
 */
export function extractWaveformPeaks(
    buffer: Pick<AudioBuffer, "numberOfChannels" | "length" | "getChannelData">,
    bucketCount = 72,
): number[] {
    const count = Math.max(1, Math.min(4096, Math.floor(Number.isFinite(bucketCount) ? bucketCount : 72)));
    const channels = Math.max(0, Math.floor(buffer.numberOfChannels));
    const length = Math.max(0, Math.floor(buffer.length));
    if (channels === 0 || length === 0) {
        return new Array<number>(count).fill(0);
    }

    const channelData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) {
        channelData.push(buffer.getChannelData(c));
    }

    const rawPeaks = new Array<number>(count).fill(0);
    let maxPeak = 0;

    for (let b = 0; b < count; b++) {
        const start = Math.floor((b * length) / count);
        const end = Math.min(length, Math.max(start + 1, Math.floor(((b + 1) * length) / count)));
        const span = end - start;
        const stride = Math.max(1, Math.floor(span / 1024));
        let bucketPeak = 0;
        for (let c = 0; c < channelData.length; c++) {
            const data = channelData[c];
            for (let i = start; i < end; i += stride) {
                const value = Math.abs(data[i] ?? 0);
                if (value > bucketPeak) bucketPeak = value;
            }
        }
        rawPeaks[b] = bucketPeak;
        if (bucketPeak > maxPeak) maxPeak = bucketPeak;
    }

    if (maxPeak <= 0 || !Number.isFinite(maxPeak)) {
        return new Array<number>(count).fill(0);
    }
    return rawPeaks.map(value => Math.min(1, Math.max(0, value / maxPeak)));
}
