/**
 * Asset manifest collector, browser cache inspector, and bounded-concurrency preloader for
 * `moesekai-story/2` graph documents.
 *
 * Walks `doc.nodes` (`SceneNode` stage slots & performance beats) and preloads:
 * - Live2D model bundles + referenced motion/facial clips (including `stageCast`, `talk`,
 *   `talk.reactions`, and `stageAction`) into Cache API `"sekai-live2d-v1"` using the exact URL
 *   & `?crc=` cache keys read by `web/vendor/live2d-viewer/stage-worker.js`.
 * - Story backgrounds via `new Image()` (`crossOrigin = "anonymous"`) + `img.decode()`.
 * - Story BGM into browser HTTP cache, and SE / Voice clips into both HTTP cache and the shared
 *   Web Audio `AudioBuffer` LRU cache (`audioCache.ts`).
 * - In-game scenario UI Kit into Cache API `"sse-ui-kit-v1"` via `loadStoryUiKit()`.
 */
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { getAssetLine, type AssetLine } from "@/lib/assets";
import { fetchLive2DModels } from "@/lib/live2dViewer/client";
import { live2dSources } from "@/lib/live2dViewer/config";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import type { StoryDocument, StoryVoiceManifest, StoryVoiceRef } from "@/types/storyMaker";
import {
    storyBackgroundUrl, storyBgmUrl, storySeCandidateUrls, storyVoiceCandidateUrls,
} from "./assets";
import { resolveVoiceManifestLineUrl } from "./i18nPack";
import { decodeStoryAudio, getCachedStoryAudio, getSharedAudioContext } from "./audioCache";
import { loadStoryUiKit } from "./uiKit";

const LIVE2D_CACHE_NAME = "sekai-live2d-v1";
const UIKIT_CACHE_NAME = "sse-ui-kit-v1";
const PRELOAD_CONCURRENCY = 4;

export type StoryPreloadCategory = "live2d" | "background" | "audio" | "uikit";

export interface StoryPreloadLive2DItem {
    modelId: string;
    bundle: string;
    motionBundle: string | null;
    motions: string[];
    facials: string[];
}

export interface StoryPreloadBackgroundItem {
    name: string;
    url: string;
}

export interface StoryPreloadAudioItem {
    kind: "bgm" | "se" | "voice";
    label: string;
    urls: string[];
    voice?: StoryVoiceRef;
}

export interface StoryPreloadManifest {
    libraryBaseUrl: string;
    live2d: StoryPreloadLive2DItem[];
    backgrounds: StoryPreloadBackgroundItem[];
    bgm: StoryPreloadAudioItem[];
    se: StoryPreloadAudioItem[];
    voices: StoryPreloadAudioItem[];
    includeUiKit: boolean;
    counts: {
        live2d: number;
        background: number;
        audio: number;
        uikit: number;
        total: number;
    };
}

export interface StoryPreloadCategoryProgress {
    completed: number;
    cached: number;
    failed: number;
    total: number;
}

export interface StoryPreloadProgress {
    total: number;
    completed: number;
    cached: number;
    failed: number;
    currentCategory: StoryPreloadCategory | null;
    currentLabel: string;
    byCategory: Record<StoryPreloadCategory, StoryPreloadCategoryProgress>;
    done: boolean;
    aborted: boolean;
}

export interface CollectStoryAssetsOptions {
    /** Asset line (`"main"` | `"backup"`) or full `AssetSourceType`. Defaults to `"main"`. */
    assetSource?: AssetSourceType | AssetLine;
    /** Story library root URL (defaults to `live2dSources(doc.region).library`). */
    libraryBaseUrl?: string;
    /** Optional Live2D model index for exact `bundle` & `motionBundle` resolution. */
    models?: readonly Live2DModel[] | null;
    /** Optional custom voice track manifest (`moesekai-story-voice/1`) for audio preloading. */
    voiceManifest?: StoryVoiceManifest | null;
    /** Include the in-game UI Kit in the manifest (default `true`). */
    includeUiKit?: boolean;
}

export interface PreloadStoryAssetsOptions extends CollectStoryAssetsOptions {
    /** Decode SE & voice clips into the shared Web Audio buffer cache (default `true`). */
    decodeAudio?: boolean;
    /** Progress callback invoked incrementally after every asset settles. */
    onProgress?: (progress: StoryPreloadProgress) => void;
    /** Optional cancellation signal. */
    signal?: AbortSignal;
}

export interface StoryCacheStatus {
    live2dCachedModels: number;
    live2dTotalModels: number;
    audioDecodedCount: number;
    audioTotalDecodable: number;
    uikitCached: boolean;
    /** True when local browser caches already hold at least all Live2D models (or UI kit when cast is empty). */
    hasLocalCache: boolean;
}

interface RipperFileEntry {
    path?: unknown;
    kind?: unknown;
}

interface RipperManifest {
    crc?: unknown;
    files?: RipperFileEntry[];
}

interface Live2DFileTask {
    bundle: string;
    crc: string;
    path: string;
    label: string;
}

/** Matches `stage-worker.js` `encodePath` byte-for-byte. */
function encodePath(path: string): string {
    return path.split("/").map(encodeURIComponent).join("/");
}

function normalizeLibraryRoot(url: string): string {
    return url.endsWith("/") ? url : `${url}/`;
}

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Purely collects and deduplicates all Live2D models/clips, backgrounds, BGM, SE, voice clips,
 * and UI kit entries referenced by a `moesekai-story/2` document's `SceneNode`s.
 */
export function collectStoryAssets(
    doc: StoryDocument,
    options: CollectStoryAssetsOptions = {},
): StoryPreloadManifest {
    const line: AssetLine = getAssetLine((options.assetSource ?? "main") as AssetSourceType);
    const libraryBaseUrl = normalizeLibraryRoot(options.libraryBaseUrl ?? live2dSources(doc.region).library);
    const includeUiKit = options.includeUiKit !== false;

    const modelById = new Map<string, Live2DModel>();
    for (const model of options.models ?? []) {
        modelById.set(model.id, model);
    }

    const castModelByKey = new Map<string, string>();
    const live2dMap = new Map<string, {
        modelId: string;
        bundle: string;
        motionBundle: string | null;
        motions: Set<string>;
        facials: Set<string>;
    }>();

    for (const member of doc.cast) {
        if (!member.modelId) continue;
        castModelByKey.set(member.key, member.modelId);
        if (!live2dMap.has(member.modelId)) {
            const indexed = modelById.get(member.modelId);
            live2dMap.set(member.modelId, {
                modelId: member.modelId,
                bundle: indexed?.bundle ?? `live2d/model/${member.modelId}`,
                motionBundle: indexed ? (indexed.motions[0] ?? null) : null,
                motions: new Set<string>(),
                facials: new Set<string>(),
            });
        }
    }

    const recordClips = (castKey: string | undefined, motion?: string, facial?: string) => {
        if (!castKey) return;
        const modelId = castModelByKey.get(castKey);
        const entry = modelId ? live2dMap.get(modelId) : undefined;
        if (!entry) return;
        if (motion) entry.motions.add(motion);
        if (facial) entry.facials.add(facial);
    };

    const bgSeen = new Set<string>();
    const backgrounds: StoryPreloadBackgroundItem[] = [];
    const bgmSeen = new Set<string>();
    const bgm: StoryPreloadAudioItem[] = [];
    const seSeen = new Set<string>();
    const se: StoryPreloadAudioItem[] = [];
    const voiceSeen = new Set<string>();
    const voices: StoryPreloadAudioItem[] = [];

    const recordSe = (name: string | undefined) => {
        if (!name || seSeen.has(name)) return;
        seSeen.add(name);
        const urls = storySeCandidateUrls(name, doc.region, line);
        if (urls.length > 0) {
            se.push({ kind: "se", label: name, urls });
        }
    };

    for (const node of Object.values(doc.nodes)) {
        if (node.type !== "scene") continue;

        // 1. Background slot
        if (node.background.mode === "set" && node.background.asset) {
            const url = storyBackgroundUrl(node.background.asset, doc.region, line);
            if (!bgSeen.has(url)) {
                bgSeen.add(url);
                backgrounds.push({ name: node.background.asset, url });
            }
        }

        // 2. BGM slot
        if (node.bgm.mode === "play" && node.bgm.name) {
            const url = storyBgmUrl(node.bgm.name, doc.region, line);
            if (!bgmSeen.has(url)) {
                bgmSeen.add(url);
                bgm.push({ kind: "bgm", label: node.bgm.name, urls: [url] });
            }
        }

        // 3. StageCast slot clips
        if (node.stageCast.mode === "set") {
            for (const actor of node.stageCast.actors) {
                recordClips(actor.castKey, actor.motion, actor.facial);
            }
        }

        // 4. Performance beats
        for (const beat of node.beats) {
            switch (beat.kind) {
                case "talk": {
                    recordClips(beat.speakerKey, beat.motion, beat.facial);
                    for (const reaction of beat.reactions ?? []) {
                        recordClips(reaction.castKey, reaction.motion, reaction.facial);
                    }
                    if (beat.voice && beat.voice.scenarioId && beat.voice.voiceId) {
                        const effectiveRegion = beat.voice.region ?? doc.region;
                        const key = `${beat.voice.kind}|${effectiveRegion}|${beat.voice.scenarioId}|${beat.voice.voiceId}`;
                        if (!voiceSeen.has(key)) {
                            voiceSeen.add(key);
                            const urls = storyVoiceCandidateUrls(beat.voice, doc.region, line);
                            if (urls.length > 0) {
                                voices.push({
                                    kind: "voice",
                                    label: beat.voice.voiceId,
                                    urls,
                                    voice: beat.voice,
                                });
                            }
                        }
                    } else if (options.voiceManifest) {
                        const trackUrls = resolveVoiceManifestLineUrl(options.voiceManifest, beat.id);
                        const trackLine = options.voiceManifest.lines[beat.id];
                        if (trackUrls.length > 0 && trackLine) {
                            const key = `voice-track|${trackLine.audioHash || trackUrls[0]}`;
                            if (!voiceSeen.has(key)) {
                                voiceSeen.add(key);
                                voices.push({
                                    kind: "voice",
                                    label: trackLine.speaker || beat.id,
                                    urls: trackUrls,
                                });
                            }
                        }
                    }
                    recordSe(beat.se);
                    break;
                }
                case "narration": {
                    recordSe(beat.se);
                    break;
                }
                case "stageAction": {
                    recordClips(beat.castKey, beat.motion, beat.facial);
                    break;
                }
                case "cue": {
                    if (beat.cueType === "se") recordSe(beat.se);
                    break;
                }
                default:
                    break;
            }
        }
    }

    const live2d: StoryPreloadLive2DItem[] = [...live2dMap.values()].map((item) => ({
        modelId: item.modelId,
        bundle: item.bundle,
        motionBundle: item.motionBundle,
        motions: [...item.motions].sort(compareStrings),
        facials: [...item.facials].sort(compareStrings),
    }));

    const counts = {
        live2d: live2d.length,
        background: backgrounds.length,
        audio: bgm.length + se.length + voices.length,
        uikit: includeUiKit ? 1 : 0,
        total: live2d.length + backgrounds.length + bgm.length + se.length + voices.length + (includeUiKit ? 1 : 0),
    };

    return {
        libraryBaseUrl,
        live2d,
        backgrounds,
        bgm,
        se,
        voices,
        includeUiKit,
        counts,
    };
}

async function openCacheSafe(name: string): Promise<Cache | null> {
    if (typeof caches === "undefined") return null;
    try {
        return await caches.open(name);
    } catch {
        return null;
    }
}

async function runPool<T>(
    items: readonly T[],
    concurrency: number,
    signal: AbortSignal | undefined,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (cursor < items.length && !signal?.aborted) {
            const index = cursor++;
            await worker(items[index]);
        }
    });
    await Promise.all(workers);
}

async function fetchRipperManifest(
    library: string,
    bundle: string,
    signal?: AbortSignal,
): Promise<{ bundle: string; crc: string; files: RipperFileEntry[] } | null> {
    const url = `${library}library/${encodePath(bundle)}/_ripper.json`;
    try {
        const response = await fetch(url, {
            mode: "cors",
            credentials: "omit",
            cache: "no-cache",
            signal,
        });
        if (!response.ok) return null;
        const raw = await response.json() as RipperManifest;
        const crc = raw?.crc !== undefined && raw?.crc !== null ? String(raw.crc) : "";
        const files = Array.isArray(raw?.files) ? raw.files : [];
        return { bundle, crc, files };
    } catch {
        return null;
    }
}

function pickDefaultClipPath(clips: Map<string, string>, patterns: readonly RegExp[]): string | undefined {
    for (const pattern of patterns) {
        for (const [name, path] of clips.entries()) {
            if (pattern.test(name)) return path;
        }
    }
    return clips.values().next().value;
}

async function preloadImage(url: string, signal?: AbortSignal): Promise<"fetched" | "failed" | "aborted"> {
    if (signal?.aborted) return "aborted";
    if (typeof Image === "undefined") {
        // Non-DOM fallback: warm HTTP cache directly.
        try {
            const res = await fetch(url, { mode: "cors", credentials: "omit", signal });
            if (!res.ok) return "failed";
            await res.arrayBuffer();
            return signal?.aborted ? "aborted" : "fetched";
        } catch {
            return signal?.aborted ? "aborted" : "failed";
        }
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        let settled = false;
        const finish = (status: "fetched" | "failed" | "aborted") => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            img.onload = null;
            img.onerror = null;
            resolve(status);
        };
        const onAbort = () => {
            img.src = "";
            finish("aborted");
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        const onLoaded = () => {
            if (typeof img.decode === "function") {
                img.decode().then(() => finish("fetched"), () => finish("fetched"));
            } else {
                finish("fetched");
            }
        };
        img.onload = onLoaded;
        img.onerror = () => finish("failed");
        img.src = url;
        if (img.complete && img.naturalWidth > 0) {
            onLoaded();
        }
    });
}

async function warmHttpAudio(urls: readonly string[], signal?: AbortSignal): Promise<"fetched" | "failed" | "aborted"> {
    for (const url of urls) {
        if (signal?.aborted) return "aborted";
        try {
            const response = await fetch(url, { mode: "cors", credentials: "omit", signal });
            if (!response.ok) continue;
            await response.arrayBuffer();
            return signal?.aborted ? "aborted" : "fetched";
        } catch {
            if (signal?.aborted) return "aborted";
        }
    }
    return signal?.aborted ? "aborted" : "failed";
}

function cloneProgress(state: StoryPreloadProgress): StoryPreloadProgress {
    return {
        ...state,
        byCategory: {
            live2d: { ...state.byCategory.live2d },
            background: { ...state.byCategory.background },
            audio: { ...state.byCategory.audio },
            uikit: { ...state.byCategory.uikit },
        },
    };
}

/**
 * Preloads all assets referenced by `doc` into persistent browser caches (`sekai-live2d-v1`,
 * `sse-ui-kit-v1`, HTTP cache, decoded image cache, and shared Web Audio LRU cache) with
 * bounded concurrency and incremental `onProgress` callbacks.
 */
export async function preloadStoryAssets(
    doc: StoryDocument,
    options: PreloadStoryAssetsOptions = {},
): Promise<StoryPreloadProgress> {
    const { onProgress, signal, decodeAudio = true } = options;

    let models = options.models;
    if ((!models || models.length === 0) && doc.cast.length > 0 && !signal?.aborted) {
        models = await fetchLive2DModels(doc.region, signal).catch(() => null);
    }

    const manifest = collectStoryAssets(doc, { ...options, models });
    const state: StoryPreloadProgress = {
        total: manifest.counts.total,
        completed: 0,
        cached: 0,
        failed: 0,
        currentCategory: null,
        currentLabel: "",
        byCategory: {
            live2d: { completed: 0, cached: 0, failed: 0, total: manifest.counts.live2d },
            background: { completed: 0, cached: 0, failed: 0, total: manifest.counts.background },
            audio: { completed: 0, cached: 0, failed: 0, total: manifest.counts.audio },
            uikit: { completed: 0, cached: 0, failed: 0, total: manifest.counts.uikit },
        },
        done: false,
        aborted: Boolean(signal?.aborted),
    };

    const emit = () => {
        state.total =
            state.byCategory.live2d.total
            + state.byCategory.background.total
            + state.byCategory.audio.total
            + state.byCategory.uikit.total;
        state.completed =
            state.byCategory.live2d.completed
            + state.byCategory.background.completed
            + state.byCategory.audio.completed
            + state.byCategory.uikit.completed;
        state.cached =
            state.byCategory.live2d.cached
            + state.byCategory.background.cached
            + state.byCategory.audio.cached
            + state.byCategory.uikit.cached;
        state.failed =
            state.byCategory.live2d.failed
            + state.byCategory.background.failed
            + state.byCategory.audio.failed
            + state.byCategory.uikit.failed;
        onProgress?.(cloneProgress(state));
    };

    const recordResult = (
        category: StoryPreloadCategory,
        label: string,
        outcome: "cached" | "fetched" | "failed" | "aborted",
    ) => {
        if (outcome === "aborted") {
            state.aborted = true;
            return;
        }
        state.currentCategory = category;
        state.currentLabel = label;
        const bucket = state.byCategory[category];
        bucket.completed += 1;
        if (outcome === "cached") bucket.cached += 1;
        else if (outcome === "failed") bucket.failed += 1;
        emit();
    };

    if (signal?.aborted) {
        state.aborted = true;
        emit();
        return cloneProgress(state);
    }

    emit();

    const live2dTasks: Live2DFileTask[] = [];
    const seenLive2DKeys = new Set<string>();
    const manifestCache = new Map<string, Promise<{ bundle: string; crc: string; files: RipperFileEntry[] } | null>>();
    const getManifest = (bundle: string) => {
        let p = manifestCache.get(bundle);
        if (!p) {
            p = fetchRipperManifest(manifest.libraryBaseUrl, bundle, signal);
            manifestCache.set(bundle, p);
        }
        return p;
    };

    let failedLive2DManifests = 0;
    if (manifest.live2d.length > 0 && !signal?.aborted) {
        await runPool(manifest.live2d, PRELOAD_CONCURRENCY, signal, async (item) => {
            const [modelManifest, motionManifest] = await Promise.all([
                getManifest(item.bundle),
                item.motionBundle ? getManifest(item.motionBundle) : Promise.resolve(null),
            ]);
            if (signal?.aborted) return;
            if (!modelManifest) {
                failedLive2DManifests += 1;
                return;
            }
            for (const f of modelManifest.files) {
                if (f?.kind === "motion" || typeof f?.path !== "string" || !f.path) continue;
                const url = `${manifest.libraryBaseUrl}library/${encodePath(modelManifest.bundle)}/${encodePath(f.path)}`;
                const key = `${url}?crc=${modelManifest.crc}`;
                if (seenLive2DKeys.has(key)) continue;
                seenLive2DKeys.add(key);
                live2dTasks.push({
                    bundle: modelManifest.bundle,
                    crc: modelManifest.crc,
                    path: f.path,
                    label: `${item.modelId}/${f.path.split("/").pop() ?? f.path}`,
                });
            }
            if (motionManifest) {
                const motionPaths = new Map<string, string>();
                const facialPaths = new Map<string, string>();
                for (const f of motionManifest.files) {
                    const p = typeof f?.path === "string" ? f.path : "";
                    const match = /^(motion|facial)\/(.+)\.sse-motion\.json$/.exec(p);
                    if (!match) continue;
                    if (match[1] === "motion") motionPaths.set(match[2], p);
                    else facialPaths.set(match[2], p);
                }

                const wantedClipPaths = new Set<string>();
                for (const m of item.motions) {
                    const p = motionPaths.get(m);
                    if (p) wantedClipPaths.add(p);
                }
                for (const f of item.facials) {
                    const p = facialPaths.get(f);
                    if (p) wantedClipPaths.add(p);
                }
                const defMotion = pickDefaultClipPath(motionPaths, [/normal01$/i, /idle/i]);
                if (defMotion) wantedClipPaths.add(defMotion);
                const defFacial = pickDefaultClipPath(facialPaths, [/^face_normal_01$/i, /^face_normal/i]);
                if (defFacial) wantedClipPaths.add(defFacial);

                for (const p of wantedClipPaths) {
                    const url = `${manifest.libraryBaseUrl}library/${encodePath(motionManifest.bundle)}/${encodePath(p)}`;
                    const key = `${url}?crc=${motionManifest.crc}`;
                    if (seenLive2DKeys.has(key)) continue;
                    seenLive2DKeys.add(key);
                    live2dTasks.push({
                        bundle: motionManifest.bundle,
                        crc: motionManifest.crc,
                        path: p,
                        label: `${item.modelId}/${p.split("/").pop() ?? p}`,
                    });
                }
            }
        });

        state.byCategory.live2d.total = live2dTasks.length + failedLive2DManifests;
        if (failedLive2DManifests > 0) {
            state.byCategory.live2d.completed += failedLive2DManifests;
            state.byCategory.live2d.failed += failedLive2DManifests;
        }
        emit();
    }

    const live2dCache = live2dTasks.length > 0 ? await openCacheSafe(LIVE2D_CACHE_NAME) : null;
    const canDecodeAudio = decodeAudio && typeof window !== "undefined" && getSharedAudioContext() !== null;

    type WorkItem = () => Promise<void>;
    const tasks: WorkItem[] = [];

    for (const file of live2dTasks) {
        tasks.push(async () => {
            if (signal?.aborted) return;
            const url = `${manifest.libraryBaseUrl}library/${encodePath(file.bundle)}/${encodePath(file.path)}`;
            const cacheKey = `${url}?crc=${file.crc}`;
            try {
                const hit = await live2dCache?.match(cacheKey);
                if (hit) {
                    recordResult("live2d", file.label, "cached");
                    return;
                }
            } catch {
                // fall through to network fetch
            }
            try {
                const response = await fetch(url, { mode: "cors", credentials: "omit", signal });
                if (!response.ok) {
                    recordResult("live2d", file.label, "failed");
                    return;
                }
                const bytes = await response.arrayBuffer();
                if (signal?.aborted) {
                    recordResult("live2d", file.label, "aborted");
                    return;
                }
                await live2dCache?.put(cacheKey, new Response(bytes)).catch(() => undefined);
                recordResult("live2d", file.label, "fetched");
            } catch {
                recordResult("live2d", file.label, signal?.aborted ? "aborted" : "failed");
            }
        });
    }

    for (const bg of manifest.backgrounds) {
        tasks.push(async () => {
            const outcome = await preloadImage(bg.url, signal);
            recordResult("background", bg.name, outcome);
        });
    }

    for (const track of manifest.bgm) {
        tasks.push(async () => {
            const outcome = await warmHttpAudio(track.urls, signal);
            recordResult("audio", track.label, outcome);
        });
    }

    for (const clip of [...manifest.se, ...manifest.voices]) {
        tasks.push(async () => {
            if (signal?.aborted) return;
            if (canDecodeAudio) {
                if (clip.urls.some(u => getCachedStoryAudio(u) !== null)) {
                    recordResult("audio", clip.label, "cached");
                    return;
                }
                const decoded = await decodeStoryAudio(clip.urls, signal);
                if (signal?.aborted) {
                    recordResult("audio", clip.label, "aborted");
                    return;
                }
                recordResult("audio", clip.label, decoded ? "fetched" : "failed");
                return;
            }
            const outcome = await warmHttpAudio(clip.urls, signal);
            recordResult("audio", clip.label, outcome);
        });
    }

    if (manifest.includeUiKit) {
        tasks.push(async () => {
            if (signal?.aborted) return;
            const kit = await loadStoryUiKit(doc.region, signal).catch(() => null);
            if (signal?.aborted) {
                kit?.release();
                recordResult("uikit", "UI Kit", "aborted");
                return;
            }
            if (kit) {
                const outcome = kit.cached ? "cached" : "fetched";
                kit.release();
                recordResult("uikit", "UI Kit", outcome);
            } else {
                recordResult("uikit", "UI Kit", "failed");
            }
        });
    }

    await runPool(tasks, PRELOAD_CONCURRENCY, signal, async (task) => task());

    state.aborted = Boolean(signal?.aborted);
    state.done = !state.aborted;
    emit();
    return cloneProgress(state);
}

/**
 * Inspects local Cache API (`sekai-live2d-v1`, `sse-ui-kit-v1`) and in-memory decoded audio cache
 * without issuing any network requests.
 */
export async function inspectStoryCacheStatus(
    doc: StoryDocument,
    options: CollectStoryAssetsOptions = {},
): Promise<StoryCacheStatus> {
    const manifest = collectStoryAssets(doc, options);
    let live2dCachedModels = 0;
    let uikitCached = false;

    if (typeof caches !== "undefined") {
        try {
            if (manifest.live2d.length > 0 && (await caches.has(LIVE2D_CACHE_NAME))) {
                const cache = await caches.open(LIVE2D_CACHE_NAME);
                const keys = await cache.keys();
                const urls = keys.map(req => req.url);
                for (const item of manifest.live2d) {
                    const prefix = `${manifest.libraryBaseUrl}library/${encodePath(item.bundle)}/`;
                    if (urls.some(u => u.startsWith(prefix))) {
                        live2dCachedModels += 1;
                    }
                }
            }
        } catch {
            // ignore private-mode / sandboxed Cache API failures
        }
        try {
            if (manifest.includeUiKit && (await caches.has(UIKIT_CACHE_NAME))) {
                const cache = await caches.open(UIKIT_CACHE_NAME);
                const keys = await cache.keys();
                uikitCached = keys.length > 0;
            }
        } catch {
            // ignore
        }
    }

    const decodable = [...manifest.se, ...manifest.voices];
    let audioDecodedCount = 0;
    for (const clip of decodable) {
        if (clip.urls.some(u => getCachedStoryAudio(u) !== null)) {
            audioDecodedCount += 1;
        }
    }

    const live2dReady = manifest.live2d.length === 0 || live2dCachedModels >= manifest.live2d.length;
    const uikitReady = !manifest.includeUiKit || uikitCached;

    return {
        live2dCachedModels,
        live2dTotalModels: manifest.live2d.length,
        audioDecodedCount,
        audioTotalDecodable: decodable.length,
        uikitCached,
        hasLocalCache: (manifest.live2d.length > 0 || manifest.includeUiKit) && live2dReady && uikitReady,
    };
}
