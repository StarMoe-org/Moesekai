/**
 * The game assets a story refers to, by name, on its server and the asset line the reader chose:
 * backgrounds, BGM (merged with `/soundtrack` masterdata), SE packs, Live2D motion bundle clips,
 * and story voices, plus cached directory/catalog loaders for the pickers.
 */
import type { AssetSourceType } from "@/contexts/ThemeContext";
import {
    getAreaTalkVoiceUrl, getAssetBaseUrl, getBackgroundImageUrl, getCardStoryVoiceUrl, getStoryBgmUrl,
    getStorySoundEffectUrl, getStoryVoiceUrl, type AssetLine,
} from "@/lib/assets";
import { fetchMasterDataForServer } from "@/lib/fetch";
import type { StoryRegion, StoryVoiceKind, StoryVoiceRef } from "@/types/storyMaker";
import { STORY_ASSET_PATTERN, STORY_AUDIO_PATH_PATTERN } from "./limits";

function source(region: StoryRegion, line: AssetLine): AssetSourceType {
    return `${line}-${region}` as AssetSourceType;
}

function normalizeAssetPath(value: string): string {
    return value.trim().replace(/^\/+|\/+$/g, "");
}

function encodeAssetPath(path: string): string {
    return path.split("/").map(encodeURIComponent).join("/");
}

function createAbortError(): Error {
    if (typeof DOMException !== "undefined") {
        return new DOMException("The operation was aborted.", "AbortError");
    }
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    return err;
}

/**
 * Lets a caller abort awaiting a shared cached promise without aborting the underlying fetch for
 * other callers or evicting a healthy in-flight request.
 */
function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(createAbortError());
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(createAbortError());
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            },
        );
    });
}

// ==================== Asset URL Builders ====================

export function storyBackgroundUrl(name: string, region: StoryRegion, line: AssetLine): string {
    return getBackgroundImageUrl(name, source(region, line));
}

/**
 * Resolves a story BGM reference to its playable MP3 URL:
 * - `mysekai/...` or `sound/...`: direct relative path under the server's asset base
 * - `<dir>/<file>` (e.g. `bgm00016_01/bgm00016_01_1`, `bgm10001/bgm_area_leoneed_untitled`):
 *   direct file under `sound/scenario/bgm/`
 * - bare name (e.g. `bgm00020`, `bgm_area00001`): `sound/scenario/bgm/<name>/<name>.mp3`
 */
export function storyBgmUrl(name: string, region: StoryRegion, line: AssetLine): string {
    const at = source(region, line);
    const trimmed = normalizeAssetPath(name);
    if (trimmed.startsWith("mysekai/") || trimmed.startsWith("sound/")) {
        return `${getAssetBaseUrl(at)}/${trimmed}.mp3`;
    }
    if (trimmed.includes("/")) {
        return `${getAssetBaseUrl(at)}/sound/scenario/bgm/${trimmed}.mp3`;
    }
    return getStoryBgmUrl(trimmed, at);
}

/** The two disjoint SE pack directories under `sound/scenario/se/` (`se/` is a strict subset of `se_pack00001_b/`). */
export const STORY_SE_PACKS = ["se_pack00001_b", "se_pack00001"] as const;
export type StorySePack = (typeof STORY_SE_PACKS)[number];

/** Cached bare SE filename -> pack lookup per `${region}|${line}`, populated by `fetchStorySeCatalog`. */
const sePackIndex = new Map<string, Map<string, StorySePack>>();

/**
 * Resolves a story SE reference to its playable MP3 URL:
 * - `<pack>/<file>` (e.g. `se_pack00001_b/se00001_b`, `se_pack00001/se00056`): direct HTTP 200 path
 * - `sound/...`: direct relative path under the server's asset base
 * - bare name (e.g. `se00001_b`, `se00056`): checks cached pack index first, else defaults to `se_pack00001_b/<name>`
 */
export function storySeUrl(name: string, region: StoryRegion, line: AssetLine): string {
    const at = source(region, line);
    const trimmed = normalizeAssetPath(name);
    if (trimmed.startsWith("sound/")) {
        return `${getAssetBaseUrl(at)}/${trimmed}.mp3`;
    }
    if (trimmed.includes("/")) {
        return getStorySoundEffectUrl(trimmed, at);
    }
    const pack = sePackIndex.get(`${region}|${line}`)?.get(trimmed) ?? "se_pack00001_b";
    return getStorySoundEffectUrl(`${pack}/${trimmed}`, at);
}

/**
 * Candidate playable URLs for a story SE reference in priority order.
 * Pack-qualified paths return a single deterministic URL; bare names return both packs
 * (cached pack first when known, else `se_pack00001_b` then `se_pack00001`) for 404 fallback.
 */
export function storySeCandidateUrls(name: string, region: StoryRegion, line: AssetLine): string[] {
    const trimmed = normalizeAssetPath(name);
    if (!trimmed) return [];
    if (trimmed.includes("/")) {
        return [storySeUrl(trimmed, region, line)];
    }
    const at = source(region, line);
    const knownPack = sePackIndex.get(`${region}|${line}`)?.get(trimmed);
    const packs: readonly StorySePack[] = knownPack === "se_pack00001"
        ? ["se_pack00001", "se_pack00001_b"]
        : ["se_pack00001_b", "se_pack00001"];
    return packs.map(pack => getStorySoundEffectUrl(`${pack}/${trimmed}`, at));
}

export function storyVoiceUrl(voice: StoryVoiceRef, region: StoryRegion, line: AssetLine): string {
    const effectiveRegion = voice.region ?? region;
    const at = source(effectiveRegion, line);
    switch (voice.kind) {
        case "card": return getCardStoryVoiceUrl(voice.scenarioId, voice.voiceId, at);
        case "area": return getAreaTalkVoiceUrl(voice.scenarioId, voice.voiceId, at);
        case "part": return `${getAssetBaseUrl(at)}/sound/scenario/part_voice/${voice.scenarioId}/${voice.voiceId}.mp3`;
        default: return getStoryVoiceUrl(voice.scenarioId, voice.voiceId, at);
    }
}

/**
 * Candidate playable URLs for a story voice reference in priority order.
 * Honors `voice.region` over the document's `region` when set (cross-server voice search),
 * and includes safe `part_voice` <-> `voice/part_voice_*` fallbacks when `voice.kind === "part"`
 * or `voice.voiceId` begins with `"partvoice"`.
 */
export function storyVoiceCandidateUrls(voice: StoryVoiceRef, region: StoryRegion, line: AssetLine): string[] {
    const scenarioId = normalizeAssetPath(voice.scenarioId);
    const voiceId = normalizeAssetPath(voice.voiceId);
    if (!scenarioId || !voiceId) return [];

    const effectiveRegion = voice.region ?? region;
    const at = source(effectiveRegion, line);
    const base = getAssetBaseUrl(at);
    const primary = storyVoiceUrl({ ...voice, scenarioId, voiceId, region: effectiveRegion }, effectiveRegion, line);
    const urls: string[] = [primary];
    const add = (url: string) => {
        if (url && !urls.includes(url)) urls.push(url);
    };

    const isPartVoice = voice.kind === "part" || voiceId.startsWith("partvoice");
    if (isPartVoice) {
        if (voice.kind === "part") {
            const stripped = scenarioId.startsWith("part_voice_") ? scenarioId.slice("part_voice_".length) : scenarioId;
            if (stripped !== scenarioId) {
                add(`${base}/sound/scenario/part_voice/${stripped}/${voiceId}.mp3`);
            }
            const prefixed = scenarioId.startsWith("part_voice_") ? scenarioId : `part_voice_${scenarioId}`;
            add(getStoryVoiceUrl(prefixed, voiceId, at));
        } else if (scenarioId.startsWith("part_voice_")) {
            const chara = scenarioId.slice("part_voice_".length);
            if (chara) {
                add(`${base}/sound/scenario/part_voice/${chara}/${voiceId}.mp3`);
            }
        } else {
            // Legacy/mixed partvoice references may live under `sound/scenario/part_voice/<scenarioId>/`
            // or `sound/scenario/voice/part_voice_<scenarioId>/`.
            add(`${base}/sound/scenario/part_voice/${scenarioId}/${voiceId}.mp3`);
            add(getStoryVoiceUrl(`part_voice_${scenarioId}`, voiceId, at));
        }
    }

    return urls;
}

export { storyVoiceCandidateUrls as getStoryVoiceCandidateUrls };

// ==================== Directory Listing Helpers ====================

/** The asset directories the pickers list. */
export const STORY_ASSET_DIRECTORIES = {
    bgm: "sound/scenario/bgm/",
    se: "sound/scenario/se/",
} as const;

export type StoryAssetKind = keyof typeof STORY_ASSET_DIRECTORIES;

/** Voice directory roots matching `storyVoiceUrl`. */
export const STORY_VOICE_DIRECTORIES: Record<StoryVoiceKind, string> = {
    story: "sound/scenario/voice/",
    card: "sound/card_scenario/voice/",
    area: "sound/actionset/voice/",
    part: "sound/scenario/part_voice/",
};

interface DirectoryListing {
    format?: string;
    version?: number;
    directories?: unknown;
    files?: unknown;
}

const AUDIO_EXTENSION_RE = /\.(mp3|wav|ogg|acb|flac)$/i;

async function fetchDirectoryListing(url: string): Promise<{ directories: string[]; files: string[] }> {
    const response = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const listing = await response.json() as DirectoryListing;
    if (listing.format !== "directory-listing" || listing.version !== 1) {
        throw new Error(`${url}: unsupported listing`);
    }
    const directories: string[] = [];
    if (Array.isArray(listing.directories)) {
        for (const entry of listing.directories) {
            if (typeof entry === "string") directories.push(entry);
        }
    }
    const files: string[] = [];
    if (Array.isArray(listing.files)) {
        for (const entry of listing.files) {
            const name = typeof entry === "string" ? entry : (entry as { name?: unknown })?.name;
            if (typeof name === "string") files.push(name);
        }
    }
    return { directories, files };
}

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

// ==================== SE Catalog ====================

export interface StorySeItem {
    /** Deterministic `<pack>/<file>` asset path (e.g. `se_pack00001_b/se00001_b`). */
    name: string;
    pack: StorySePack;
    /** Clean file basename without extension (e.g. `se00001_b`). */
    label: string;
}

const seCatalogs = new Map<string, Promise<StorySeItem[]>>();

/**
 * Fetches all playable SE items from the two disjoint packs (`se_pack00001_b/` and `se_pack00001/`,
 * skipping the duplicate `se/` subset) and populates the bare-name pack index. Cached per `${region}|${line}`.
 */
export function fetchStorySeCatalog(
    region: StoryRegion,
    line: AssetLine,
    signal?: AbortSignal,
): Promise<StorySeItem[]> {
    if (signal?.aborted) return Promise.reject(createAbortError());
    const key = `${region}|${line}`;
    let cached = seCatalogs.get(key);
    if (!cached) {
        const base = getAssetBaseUrl(source(region, line));
        const loading = (async () => {
            const results = await Promise.all(
                STORY_SE_PACKS.map(async (pack) => {
                    const { files } = await fetchDirectoryListing(`${base}/sound/scenario/se/${pack}/`);
                    return { pack, files };
                }),
            );
            const items: StorySeItem[] = [];
            const seen = new Set<string>();
            const packMap = new Map<string, StorySePack>();
            for (const { pack, files } of results) {
                for (const file of files) {
                    const label = file.replace(AUDIO_EXTENSION_RE, "");
                    if (!STORY_ASSET_PATTERN.test(label)) continue;
                    const name = `${pack}/${label}`;
                    if (seen.has(name)) continue;
                    seen.add(name);
                    if (!packMap.has(label)) packMap.set(label, pack);
                    items.push({ name, pack, label });
                }
            }
            items.sort((a, b) => compareStrings(a.label, b.label) || compareStrings(a.pack, b.pack));
            sePackIndex.set(key, packMap);
            return items;
        })();
        seCatalogs.set(key, loading);
        loading.catch(() => seCatalogs.delete(key));
        cached = loading;
    }
    return withAbortSignal(cached, signal);
}

// ==================== BGM + /soundtrack Catalog ====================

export interface StoryBgmCategory {
    id: number;
    name: string;
}

export interface StoryBgmItem {
    /** Canonical story BGM name: bare ID (`bgm00020`), `<dir>/<file>`, or `mysekai/sound/bgm/<dir>/<file>`. */
    name: string;
    title: string;
    pronunciation?: string;
    categoryId: number | null;
    categoryName: string;
    source: "soundtrack" | "scenario";
    mysekai?: boolean;
}

export interface StoryBgmCatalog {
    categories: StoryBgmCategory[];
    items: StoryBgmItem[];
}

interface SoundTrackMasterEntry {
    id: number;
    seq?: number;
    title: string;
    pronunciation?: string;
    musicSoundTrackCategoryId: number;
    assetbundleName: string;
    assetbundleFileName?: string;
}

interface SoundTrackCategoryMasterEntry {
    id: number;
    name: string;
}

/**
 * Top-level `sound/scenario/bgm/` directories that are not standalone `<dir>/<dir>.mp3` BGMs:
 * - `bgm00000`: 10s silent placeholder (Story Maker already has `bgm` action `stop`)
 * - `bgm`: holds only duplicates `bgm00024.mp3` and `bgm00341.mp3` (which have their own dirs)
 * - `bgm90001`..`bgm90013`: multi-file ~0.26s stem packs (`bgm90040` etc. are real full BGMs)
 */
const SKIP_SCENARIO_BGM_DIRS = new Set([
    "bgm",
    "bgm00000",
    "bgm90001", "bgm90002", "bgm90003", "bgm90004", "bgm90005", "bgm90006", "bgm90007",
    "bgm90008", "bgm90009", "bgm90010", "bgm90011", "bgm90012", "bgm90013",
]);

/** Known multi-file / non-matching-filename scenario BGM dirs expanded into `<dir>/<file>` items. */
const EXPAND_SCENARIO_BGM_DIRS = new Set([
    "bgm00016_01", "bgm00038_01", "bgm00039_01",
    "bgm10001", "bgm10002", "bgm10003", "bgm10004", "bgm10005",
]);

const SCENARIO_BGM_PREFIX = "sound/scenario/bgm/";

function canonicalSoundtrackBgmName(assetbundleName: string, assetbundleFileName?: string): { name: string; mysekai: boolean } | null {
    const dir = normalizeAssetPath(assetbundleName);
    const file = normalizeAssetPath(assetbundleFileName || dir.split("/").pop() || "").replace(AUDIO_EXTENSION_RE, "");
    if (!dir || !file) return null;
    const mysekai = dir.startsWith("mysekai/");
    let name: string;
    if (dir.startsWith(SCENARIO_BGM_PREFIX)) {
        const subDir = dir.slice(SCENARIO_BGM_PREFIX.length);
        name = subDir === file ? file : `${subDir}/${file}`;
    } else {
        name = `${dir}/${file}`;
    }
    if (!STORY_AUDIO_PATH_PATTERN.test(name)) return null;
    return { name, mysekai };
}

const bgmCatalogs = new Map<string, Promise<StoryBgmCatalog>>();

/**
 * Fetches the unified BGM catalog for `region`/`line`:
 * 1. Official `/soundtrack` masterdata (`musicSoundTracks.json` + `musicSoundTrackCategories.json`),
 *    providing localized track titles, categories, and MySEKAI BGM tracks, deduplicated by canonical audio key.
 * 2. Playable unlisted directories under `sound/scenario/bgm/` (skipping silent/stem pack dirs and
 *    expanding known multi-file dirs into exact `<dir>/<file>` paths so every listed item resolves HTTP 200).
 * Falls back gracefully to the scenario directory listing if masterdata fails. Cached per `${region}|${line}`.
 */
export function fetchStoryBgmCatalog(
    region: StoryRegion,
    line: AssetLine,
    signal?: AbortSignal,
): Promise<StoryBgmCatalog> {
    if (signal?.aborted) return Promise.reject(createAbortError());
    const key = `${region}|${line}`;
    let cached = bgmCatalogs.get(key);
    if (!cached) {
        const base = getAssetBaseUrl(source(region, line));
        const loading = (async (): Promise<StoryBgmCatalog> => {
            const [tracksData, categoriesData, rootListing] = await Promise.all([
                fetchMasterDataForServer<SoundTrackMasterEntry[]>(region, "musicSoundTracks.json").catch(() => null),
                fetchMasterDataForServer<SoundTrackCategoryMasterEntry[]>(region, "musicSoundTrackCategories.json").catch(() => []),
                fetchDirectoryListing(`${base}/${SCENARIO_BGM_PREFIX}`).catch(() => null),
            ]);
            if (!tracksData && !rootListing) {
                throw new Error(`${base}/${SCENARIO_BGM_PREFIX}: failed to load BGM catalog`);
            }

            const categoryNameById = new Map<number, string>();
            for (const cat of categoriesData) {
                if (typeof cat?.id === "number" && typeof cat?.name === "string") {
                    categoryNameById.set(cat.id, cat.name);
                }
            }

            // 1. Soundtrack tracks (sorted by seq/id; later entry wins on shared audio keys such as bgm_area00001 -> id=104).
            const soundtrackByName = new Map<string, { order: number; item: StoryBgmItem }>();
            if (Array.isArray(tracksData)) {
                const sortedTracks = [...tracksData].sort((a, b) => (a.seq ?? a.id) - (b.seq ?? b.id) || a.id - b.id);
                for (const track of sortedTracks) {
                    const resolved = canonicalSoundtrackBgmName(track.assetbundleName, track.assetbundleFileName);
                    if (!resolved) continue;
                    const categoryId = typeof track.musicSoundTrackCategoryId === "number" ? track.musicSoundTrackCategoryId : null;
                    const categoryName = categoryId !== null ? (categoryNameById.get(categoryId) ?? "") : "";
                    const item: StoryBgmItem = {
                        name: resolved.name,
                        title: track.title || resolved.name,
                        ...(track.pronunciation ? { pronunciation: track.pronunciation } : {}),
                        categoryId,
                        categoryName,
                        source: "soundtrack",
                        ...(resolved.mysekai ? { mysekai: true } : {}),
                    };
                    soundtrackByName.set(resolved.name, { order: track.seq ?? track.id, item });
                }
            }

            const soundtrackItems = [...soundtrackByName.values()]
                .sort((a, b) => a.order - b.order || compareStrings(a.item.name, b.item.name))
                .map(entry => entry.item);

            const seenNames = new Set<string>(soundtrackItems.map(item => item.name));

            // Keep only categories actually represented in the catalog, sorted by id.
            const usedCategoryIds = new Set<number>();
            for (const item of soundtrackItems) {
                if (item.categoryId !== null) usedCategoryIds.add(item.categoryId);
            }
            const categories: StoryBgmCategory[] = [...usedCategoryIds]
                .sort((a, b) => a - b)
                .map(id => ({ id, name: categoryNameById.get(id) ?? String(id) }));

            // 2. Unlisted playable scenario BGMs from live storage directory listing.
            const unlistedItems: StoryBgmItem[] = [];
            if (rootListing) {
                const expandTargets = rootListing.directories.filter(dir => EXPAND_SCENARIO_BGM_DIRS.has(dir));
                const expandedResults = await Promise.all(
                    expandTargets.map(async (dir) => {
                        try {
                            const { files } = await fetchDirectoryListing(`${base}/${SCENARIO_BGM_PREFIX}${encodeURIComponent(dir)}/`);
                            return { dir, files };
                        } catch {
                            return { dir, files: [] as string[] };
                        }
                    }),
                );
                for (const { dir, files } of expandedResults) {
                    for (const file of files) {
                        const baseName = file.replace(AUDIO_EXTENSION_RE, "");
                        if (!STORY_ASSET_PATTERN.test(baseName)) continue;
                        const name = baseName === dir ? dir : `${dir}/${baseName}`;
                        if (!STORY_AUDIO_PATH_PATTERN.test(name) || seenNames.has(name)) continue;
                        seenNames.add(name);
                        unlistedItems.push({
                            name,
                            title: baseName,
                            categoryId: null,
                            categoryName: "",
                            source: "scenario",
                        });
                    }
                }
                for (const dir of rootListing.directories) {
                    if (SKIP_SCENARIO_BGM_DIRS.has(dir) || EXPAND_SCENARIO_BGM_DIRS.has(dir)) continue;
                    if (!STORY_ASSET_PATTERN.test(dir) || seenNames.has(dir)) continue;
                    seenNames.add(dir);
                    unlistedItems.push({
                        name: dir,
                        title: dir,
                        categoryId: null,
                        categoryName: "",
                        source: "scenario",
                    });
                }
                unlistedItems.sort((a, b) => compareStrings(a.name, b.name));
            }

            return {
                categories,
                items: [...soundtrackItems, ...unlistedItems],
            };
        })();
        bgmCatalogs.set(key, loading);
        loading.catch(() => bgmCatalogs.delete(key));
        cached = loading;
    }
    return withAbortSignal(cached, signal);
}

/** Backwards-compatible list of playable asset names for `kind` (`bgm` or `se`). */
export async function fetchStoryAssetNames(
    kind: StoryAssetKind,
    region: StoryRegion,
    line: AssetLine,
    signal?: AbortSignal,
): Promise<string[]> {
    if (kind === "se") {
        const items = await fetchStorySeCatalog(region, line, signal);
        return items.map(item => item.name);
    }
    const { items } = await fetchStoryBgmCatalog(region, line, signal);
    return items.map(item => item.name);
}

// ==================== Live2D Motion Bundle Clips (_ripper.json) ====================

export interface StoryMotionBundleClips {
    motions: string[];
    facials: string[];
}

interface RipperManifest {
    files?: Array<{ path?: unknown }>;
}

const motionBundleClips = new Map<string, Promise<StoryMotionBundleClips>>();

/**
 * Fetches body motion and facial clip names directly from a motion bundle's `_ripper.json`
 * manifest (matching `stage-worker.js` `clipPaths`), allowing `ClipPickerField` to browse clips
 * without waiting for WebGPU or placing the actor on stage. Cached per `${library}|${motionBundle}`.
 */
export function fetchMotionBundleClips(
    library: string,
    motionBundle: string,
    signal?: AbortSignal,
): Promise<StoryMotionBundleClips> {
    if (signal?.aborted) return Promise.reject(createAbortError());
    const root = library.endsWith("/") ? library : `${library}/`;
    const bundle = normalizeAssetPath(motionBundle);
    if (!bundle) return Promise.resolve({ motions: [], facials: [] });
    const key = `${root}|${bundle}`;
    let cached = motionBundleClips.get(key);
    if (!cached) {
        const url = `${root}library/${encodeAssetPath(bundle)}/_ripper.json`;
        const loading = (async (): Promise<StoryMotionBundleClips> => {
            const response = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
            const manifest = await response.json() as RipperManifest;
            const motions = new Set<string>();
            const facials = new Set<string>();
            for (const entry of manifest.files ?? []) {
                const filePath = typeof entry?.path === "string" ? entry.path : "";
                const match = /^(motion|facial)\/(.+)\.sse-motion\.json$/.exec(filePath);
                if (!match) continue;
                if (match[1] === "motion") motions.add(match[2]);
                else facials.add(match[2]);
            }
            return {
                motions: [...motions].sort(compareStrings),
                facials: [...facials].sort(compareStrings),
            };
        })();
        motionBundleClips.set(key, loading);
        loading.catch(() => motionBundleClips.delete(key));
        cached = loading;
    }
    return withAbortSignal(cached, signal);
}

// ==================== 2-Step Voice Directory Loaders ====================

const voiceScenariosCache = new Map<string, Promise<string[]>>();
const voiceFilesCache = new Map<string, Promise<string[]>>();

/** Lists available `scenarioId` directories for a voice `kind` (`story` / `card` / `area`). Cached per `${kind}|${region}|${line}`. */
export function fetchStoryVoiceScenarios(
    kind: StoryVoiceKind,
    region: StoryRegion,
    line: AssetLine,
    signal?: AbortSignal,
): Promise<string[]> {
    if (signal?.aborted) return Promise.reject(createAbortError());
    const key = `${kind}|${region}|${line}`;
    let cached = voiceScenariosCache.get(key);
    if (!cached) {
        const url = `${getAssetBaseUrl(source(region, line))}/${STORY_VOICE_DIRECTORIES[kind]}`;
        const loading = (async () => {
            const { directories } = await fetchDirectoryListing(url);
            const names = new Set<string>();
            for (const name of directories) {
                if (STORY_ASSET_PATTERN.test(name)) names.add(name);
            }
            return [...names].sort(compareStrings);
        })();
        voiceScenariosCache.set(key, loading);
        loading.catch(() => voiceScenariosCache.delete(key));
        cached = loading;
    }
    return withAbortSignal(cached, signal);
}

/** Lists available `voiceId` clip names (without extension) inside `scenarioId` for a voice `kind`. Cached per `${kind}|${scenarioId}|${region}|${line}`. */
export function fetchStoryVoiceFiles(
    kind: StoryVoiceKind,
    scenarioId: string,
    region: StoryRegion,
    line: AssetLine,
    signal?: AbortSignal,
): Promise<string[]> {
    if (signal?.aborted) return Promise.reject(createAbortError());
    const cleanScenario = scenarioId.trim();
    if (!STORY_ASSET_PATTERN.test(cleanScenario)) {
        return Promise.reject(new Error(`Invalid voice scenarioId: ${scenarioId}`));
    }
    const key = `${kind}|${cleanScenario}|${region}|${line}`;
    let cached = voiceFilesCache.get(key);
    if (!cached) {
        const url = `${getAssetBaseUrl(source(region, line))}/${STORY_VOICE_DIRECTORIES[kind]}${encodeURIComponent(cleanScenario)}/`;
        const loading = (async () => {
            const { files } = await fetchDirectoryListing(url);
            const names = new Set<string>();
            for (const file of files) {
                const name = file.replace(AUDIO_EXTENSION_RE, "");
                if (STORY_ASSET_PATTERN.test(name)) names.add(name);
            }
            return [...names].sort(compareStrings);
        })();
        voiceFilesCache.set(key, loading);
        loading.catch(() => voiceFilesCache.delete(key));
        cached = loading;
    }
    return withAbortSignal(cached, signal);
}
