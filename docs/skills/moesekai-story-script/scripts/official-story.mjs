#!/usr/bin/env node
/**
 * Standalone MoeSekai Official Story & Asset Inspector CLI.
 *
 * Zero-dependency pure Node.js ESM (Node 18+) designed for AI agents and human authors writing
 * MoeSekai Script (`.msk`) stories. Queries Moesekai's public CORS-enabled endpoints
 * (`metadata.pjsk.moe`, `storage.pjsk.moe`, `assets.pjsk.moe`, `translation.exmeaning.com`)
 * so agents can study real official Project SEKAI scenarios and mine verified Live2D models,
 * `(motion, facial)` palettes with dialogue context, backgrounds, BGM tracks, SE clips, and voices.
 *
 * Public Asset Attribution: Moesekai (pjsk.moe)
 *
 * Subcommands:
 *   list         Discover official episodes from masterdata (fast, lightweight)
 *   search-text  Full-text dialogue search across all official episodes (sekai-story-search corpus)
 *   inspect      Extract L2D models, motions/facials, BGs, BGMs, SEs, voices & timeline from an episode
 *   study        Mine & aggregate a ready-to-use .msk asset kit across multiple official episodes
 *   catalog      Browse live Live2D models, motion/facial clips, BGM, BG, SE, or voice directories
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { brotliDecompressSync } from "node:zlib";

// ==================== Constants & Endpoints ====================

export const REGIONS = ["jp", "cn", "tw", "kr", "en"];

const MASTER_DOMAINS = {
    main: ["https://metadata.pjsk.moe", "https://metadata.exmeaning.com"],
    backup: ["https://metadata.exmeaning.com", "https://metadata.pjsk.moe"],
};

const STORAGE_DOMAINS = {
    main: ["https://storage.pjsk.moe", "https://storage.exmeaning.com"],
    backup: ["https://storage.exmeaning.com", "https://storage.pjsk.moe"],
};

const RIPPER_LIBRARY_BASE = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper";
const LIVE2D_INDEX_BASE = "https://assets.pjsk.moe/sekai-extra-assets/sekai-live2d";
const STORY_SEARCH_BASE = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story-search";
const TRANSLATION_BASE = "https://translation.exmeaning.com";

const CACHE_DIR = join(tmpdir(), "moesekai-msk-skill-cache");
const HTTP_TIMEOUT_MS = 20_000;
const CORPUS_TIMEOUT_MS = 60_000;

const TTL_MASTER_MS = 6 * 60 * 60 * 1000;
const TTL_MANIFEST_MS = 60 * 60 * 1000;
const TTL_SCENARIO_MS = 24 * 60 * 60 * 1000;

const SE_PACKS = ["se_pack00001_b", "se_pack00001"];
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|acb|flac)$/i;

export const UNIT_ALIASES = {
    ln: "light_sound",
    leoneed: "light_sound",
    "leo/need": "light_sound",
    light_sound: "light_sound",
    mmj: "idol",
    moremorejump: "idol",
    idol: "idol",
    vbs: "street",
    vividbadsquad: "street",
    street: "street",
    ws: "theme_park",
    wxs: "theme_park",
    wonderlands: "theme_park",
    theme_park: "theme_park",
    "25ji": "school_refusal",
    n25: "school_refusal",
    niigo: "school_refusal",
    nightcord: "school_refusal",
    school_refusal: "school_refusal",
    vs: "piapro",
    virtualsinger: "piapro",
    virtual_singer: "piapro",
    piapro: "piapro",
};

const UNIT_SHORT = {
    light_sound: "ln",
    idol: "mmj",
    street: "vbs",
    theme_park: "ws",
    school_refusal: "25ji",
    piapro: "vs",
};

export const CHARACTERS = [
    { id: 1, key: "ichika", prefix: "01ichika", unit: "light_sound", gender: "f", en: "Hoshino Ichika", jp: "星乃一歌", zh: "星乃一歌", aliases: ["一歌", "ichika", "hoshino"] },
    { id: 2, key: "saki", prefix: "02saki", unit: "light_sound", gender: "f", en: "Tenma Saki", jp: "天馬咲希", zh: "天马咲希", aliases: ["咲希", "saki"] },
    { id: 3, key: "honami", prefix: "03honami", unit: "light_sound", gender: "f", en: "Mochizuki Honami", jp: "望月穂波", zh: "望月穗波", aliases: ["穂波", "穗波", "honami", "mochizuki"] },
    { id: 4, key: "shiho", prefix: "04shiho", unit: "light_sound", gender: "f", en: "Hinomori Shiho", jp: "日野森志歩", zh: "日野森志步", aliases: ["志歩", "志步", "shiho"] },
    { id: 5, key: "minori", prefix: "05minori", unit: "idol", gender: "f", en: "Hanasato Minori", jp: "花里みのり", zh: "花里实乃理", aliases: ["みのり", "实乃理", "實乃理", "minori", "hanasato"] },
    { id: 6, key: "haruka", prefix: "06haruka", unit: "idol", gender: "f", en: "Kiritani Haruka", jp: "桐谷遥", zh: "桐谷遥", aliases: ["遥", "遙", "haruka", "kiritani"] },
    { id: 7, key: "airi", prefix: "07airi", unit: "idol", gender: "f", en: "Momoi Airi", jp: "桃井愛莉", zh: "桃井爱莉", aliases: ["愛莉", "爱莉", "airi", "momoi"] },
    { id: 8, key: "shizuku", prefix: "08shizuku", unit: "idol", gender: "f", en: "Hinomori Shizuku", jp: "日野森雫", zh: "日野森雫", aliases: ["雫", "shizuku"] },
    { id: 9, key: "kohane", prefix: "09kohane", unit: "street", gender: "f", en: "Azusawa Kohane", jp: "小豆沢こはね", zh: "小豆泽心羽", aliases: ["こはね", "心羽", "kohane", "azusawa"] },
    { id: 10, key: "an", prefix: "10an", unit: "street", gender: "f", en: "Shiraishi An", jp: "白石杏", zh: "白石杏", aliases: ["杏", "an", "shiraishi"] },
    { id: 11, key: "akito", prefix: "11akito", unit: "street", gender: "m", en: "Shinonome Akito", jp: "東雲彰人", zh: "东云彰人", aliases: ["彰人", "akito"] },
    { id: 12, key: "toya", prefix: "12touya", unit: "street", gender: "m", en: "Aoyagi Toya", jp: "青柳冬弥", zh: "青柳冬弥", aliases: ["冬弥", "冬彌", "toya", "touya", "aoyagi"] },
    { id: 13, key: "tsukasa", prefix: "13tsukasa", unit: "theme_park", gender: "m", en: "Tenma Tsukasa", jp: "天馬司", zh: "天马司", aliases: ["司", "tsukasa"] },
    { id: 14, key: "emu", prefix: "14emu", unit: "theme_park", gender: "f", en: "Otori Emu", jp: "鳳えむ", zh: "凤笑梦", aliases: ["えむ", "笑梦", "笑夢", "emu", "otori"] },
    { id: 15, key: "nene", prefix: "15nene", unit: "theme_park", gender: "f", en: "Kusanagi Nene", jp: "草薙寧々", zh: "草薙宁宁", aliases: ["寧々", "宁宁", "寧寧", "nene", "kusanagi"] },
    { id: 16, key: "rui", prefix: "16rui", unit: "theme_park", gender: "m", en: "Kamishiro Rui", jp: "神代類", zh: "神代类", aliases: ["類", "类", "rui", "kamishiro"] },
    { id: 17, key: "kanade", prefix: "17kanade", unit: "school_refusal", gender: "f", en: "Yoisaki Kanade", jp: "宵崎奏", zh: "宵崎奏", aliases: ["奏", "kanade", "yoisaki"] },
    { id: 18, key: "mafuyu", prefix: "18mafuyu", unit: "school_refusal", gender: "f", en: "Asahina Mafuyu", jp: "朝比奈まふゆ", zh: "朝比奈真冬", aliases: ["まふゆ", "真冬", "mafuyu", "asahina"] },
    { id: 19, key: "ena", prefix: "19ena", unit: "school_refusal", gender: "f", en: "Shinonome Ena", jp: "東雲絵名", zh: "东云绘名", aliases: ["絵名", "绘名", "繪名", "ena"] },
    { id: 20, key: "mizuki", prefix: "20mizuki", unit: "school_refusal", gender: "f", en: "Akiyama Mizuki", jp: "暁山瑞希", zh: "晓山瑞希", aliases: ["瑞希", "mizuki", "akiyama"] },
    { id: 21, key: "miku", prefix: "21miku", unit: "piapro", gender: "f", en: "Hatsune Miku", jp: "初音ミク", zh: "初音未来", aliases: ["ミク", "未来", "未來", "miku", "hatsune"] },
    { id: 22, key: "rin", prefix: "22rin", unit: "piapro", gender: "f", en: "Kagamine Rin", jp: "鏡音リン", zh: "镜音铃", aliases: ["リン", "铃", "鈴", "rin"] },
    { id: 23, key: "len", prefix: "23len", unit: "piapro", gender: "m", en: "Kagamine Len", jp: "鏡音レン", zh: "镜音连", aliases: ["レン", "连", "連", "len"] },
    { id: 24, key: "luka", prefix: "24luka", unit: "piapro", gender: "f", en: "Megurine Luka", jp: "巡音ルカ", zh: "巡音流歌", aliases: ["ルカ", "流歌", "luka", "megurine"] },
    { id: 25, key: "meiko", prefix: "25meiko", unit: "piapro", gender: "f", en: "MEIKO", jp: "MEIKO", zh: "MEIKO", aliases: ["meiko"] },
    { id: 26, key: "kaito", prefix: "26kaito", unit: "piapro", gender: "m", en: "KAITO", jp: "KAITO", zh: "KAITO", aliases: ["kaito"] },
];

const CHAR_BY_ID = new Map(CHARACTERS.map(c => [c.id, c]));

const SPECIAL_EFFECT_NAMES = {
    0: "None",
    1: "BlackIn",
    2: "BlackOut",
    3: "WhiteIn",
    4: "WhiteOut",
    5: "ShakeScreen",
    6: "ShakeWindow",
    7: "ChangeBackground",
    8: "Telop",
    9: "FlashbackIn",
    10: "FlashbackOut",
    11: "ChangeCardStill",
    12: "AmbientColorNormal",
    13: "AmbientColorEvening",
    14: "AmbientColorNight",
    15: "PlayScenarioEffect",
    16: "StopScenarioEffect",
    17: "ChangeBackgroundStill",
    18: "PlaceInfo",
    19: "Movie",
    20: "SekaiIn",
    21: "SekaiOut",
    22: "AttachCharacterShader",
    23: "SimpleSelectable",
    24: "FullScreenText",
    25: "StopShakeScreen",
    26: "StopShakeWindow",
    27: "MemoryIn",
    28: "MemoryOut",
    29: "BlackWipeInLeft",
    30: "BlackWipeOutLeft",
    31: "BlackWipeInRight",
    32: "BlackWipeOutRight",
    33: "BlackWipeInTop",
    34: "BlackWipeOutTop",
    35: "BlackWipeInBottom",
    36: "BlackWipeOutBottom",
    37: "PlayMV",
    38: "FullScreenTextShow",
    39: "FullScreenTextHide",
    40: "SekaiInCenter",
    41: "SekaiOutCenter",
    42: "ChangeCameraPosition",
    43: "ChangeCameraZoomLevel",
    44: "Blur",
};

const SIDE_TO_MSK_SLOT = {
    0: null,
    1: "farLeft",
    2: "farLeft",
    3: "left",
    4: "center",
    5: "center",
    6: "right",
    7: "right",
    8: "farRight",
};

// ==================== Pure Resolution Helpers ====================

export function resolveUnitKey(raw) {
    if (!raw) return null;
    const norm = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "");
    return UNIT_ALIASES[norm] ?? UNIT_ALIASES[String(raw).trim().toLowerCase()] ?? null;
}

export function resolveCharacterIds(raw) {
    if (!raw) return [];
    const tokens = String(raw).split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    const ids = new Set();
    for (const tok of tokens) {
        if (/^\d+$/.test(tok)) {
            const n = Number.parseInt(tok, 10);
            if (CHAR_BY_ID.has(n)) {
                ids.add(n);
                continue;
            }
        }
        const lower = tok.toLowerCase();
        const exact = CHARACTERS.find(c =>
            c.key === lower
            || c.prefix === lower
            || c.en.toLowerCase() === lower
            || c.jp === tok
            || c.zh === tok
            || c.aliases.some(a => a.toLowerCase() === lower),
        );
        if (exact) {
            ids.add(exact.id);
            continue;
        }
        const partial = CHARACTERS.find(c =>
            c.en.toLowerCase().includes(lower)
            || c.jp.includes(tok)
            || c.zh.includes(tok),
        );
        if (partial) {
            ids.add(partial.id);
        } else {
            throw new Error(`Unknown character '${tok}'. Use ID 1..26 or name (e.g. ichika, 17, mafuyu, 奏).`);
        }
    }
    return [...ids].sort((a, b) => a - b);
}

export function inferMotionBundleCandidates(modelId) {
    if (!modelId) return [];
    const out = [];
    const add = (name) => {
        if (!name) return;
        const bundle = `live2d/motion/${name}`;
        if (!out.includes(bundle)) out.push(bundle);
    };
    const mainChar = /^(v2_)?(\d{2}[a-z]+)_/.exec(modelId);
    if (mainChar) {
        add(`${mainChar[1] ?? ""}${mainChar[2]}_motion_base`);
        return out;
    }
    const collab = /^(v2_)?(clb\d+_\d{2}[a-z]+\d*)/.exec(modelId);
    if (collab) {
        add(`${modelId}_motion_base`);
        add(`${collab[1] ?? ""}${collab[2]}_motion_base`);
        return out;
    }
    const sub = /^(v2_)?(sub_[a-z0-9]+)/.exec(modelId);
    if (sub) {
        add(`${modelId}_motion_base`);
        const base = `${sub[1] ?? ""}${sub[2]}`;
        add(`${base}_motion_base`);
        const stripped = base.replace(/(?:black|white|zoom|young|child)?\d*$/, "");
        if (stripped && stripped !== base && stripped.length > 4) {
            add(`${stripped}_motion_base`);
        }
        return out;
    }
    add(`${modelId}_motion_base`);
    return out;
}

export function isStoryCgBackground(bgId) {
    if (!bgId) return false;
    if (bgId.startsWith("bg_a")) {
        const num = Number.parseInt(bgId.slice(4), 10);
        return Number.isFinite(num) && num >= 1 && num <= 99;
    }
    return bgId.startsWith("bg_s");
}

export function parseSelector(raw) {
    const value = String(raw ?? "").trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) {
        return { kind: "url", url: value, canonical: value };
    }
    if (value.endsWith(".json") && value.includes("/")) {
        return { kind: "path", path: value.replace(/^\/+/, ""), canonical: value };
    }
    const talkShort = /^talk:(\d+)$/.exec(value);
    if (talkShort) {
        const actionSetId = Number.parseInt(talkShort[1], 10);
        return { kind: "area", areaId: null, actionSetId, canonical: `talk:${actionSetId}` };
    }
    const selfMatch = /^self:([A-Za-z0-9_.-]+)$/.exec(value);
    if (selfMatch) {
        return { kind: "self", scenarioId: selfMatch[1], canonical: `self:${selfMatch[1]}` };
    }
    const full = /^(event|unit|card|special|area):([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value);
    if (!full) return null;
    const [, kind, group, ep] = full;
    if (kind === "event") {
        if (!/^\d+$/.test(group) || !/^\d+$/.test(ep)) return null;
        return {
            kind: "event",
            eventId: Number.parseInt(group, 10),
            episodeNo: Number.parseInt(ep, 10),
            canonical: `event:${Number.parseInt(group, 10)}/${Number.parseInt(ep, 10)}`,
        };
    }
    if (kind === "unit") {
        if (!/^\d+$/.test(ep)) return null;
        return {
            kind: "unit",
            chapterOrUnit: group,
            episodeNo: Number.parseInt(ep, 10),
            canonical: `unit:${group}/${Number.parseInt(ep, 10)}`,
        };
    }
    if (kind === "card") {
        if (!/^\d+$/.test(group)) return null;
        const partMap = { former: "former", first: "former", "1": "former", latter: "latter", second: "latter", "2": "latter" };
        const part = partMap[ep.toLowerCase()];
        if (!part) return null;
        return {
            kind: "card",
            cardId: Number.parseInt(group, 10),
            part,
            canonical: `card:${Number.parseInt(group, 10)}/${part}`,
        };
    }
    if (kind === "special") {
        if (!/^\d+$/.test(group) || !/^\d+$/.test(ep)) return null;
        return {
            kind: "special",
            specialId: Number.parseInt(group, 10),
            episodeNo: Number.parseInt(ep, 10),
            canonical: `special:${Number.parseInt(group, 10)}/${Number.parseInt(ep, 10)}`,
        };
    }
    if (kind === "area") {
        if (!/^\d+$/.test(group) || !/^\d+$/.test(ep)) return null;
        return {
            kind: "area",
            areaId: Number.parseInt(group, 10),
            actionSetId: Number.parseInt(ep, 10),
            canonical: `area:${Number.parseInt(group, 10)}/${Number.parseInt(ep, 10)}`,
        };
    }
    return null;
}

function truncate(text, maxLen = 72) {
    const clean = String(text ?? "").replace(/\s+/g, " ").trim();
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, Math.max(1, maxLen - 1))}…`;
}

function encodePath(p) {
    return String(p).split("/").map(encodeURIComponent).join("/");
}

// ==================== Disk Cache & HTTP Helpers ====================

function cacheFilePath(namespace, key, ext = "json") {
    const safeKey = createHash("sha256").update(`${namespace}:${key}`).digest("hex").slice(0, 24);
    const prefix = namespace.replace(/[^A-Za-z0-9_-]+/g, "_");
    return join(CACHE_DIR, `${prefix}_${safeKey}.${ext}`);
}

async function readCacheFile(filePath, ttlMs, noCache) {
    if (noCache) return null;
    try {
        const info = await stat(filePath);
        if (ttlMs > 0 && Date.now() - info.mtimeMs > ttlMs) return null;
        return await readFile(filePath);
    } catch {
        return null;
    }
}

async function writeCacheFile(filePath, data) {
    try {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(filePath, data);
    } catch {
        // Cache write errors are non-fatal (e.g. read-only tmpfs).
    }
}

async function fetchJsonWithFallback(urls, cacheNs, cacheKey, ttlMs, noCache) {
    const filePath = cacheFilePath(cacheNs, cacheKey, "json");
    const cached = await readCacheFile(filePath, ttlMs, noCache);
    if (cached) {
        return JSON.parse(cached.toString("utf8"));
    }
    let lastErr = null;
    for (const url of urls) {
        try {
            const res = await fetch(url, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
            });
            if (res.ok) {
                const text = await res.text();
                const parsed = JSON.parse(text);
                await writeCacheFile(filePath, text);
                return parsed;
            }
            lastErr = new Error(`${url}: HTTP ${res.status}`);
            if (res.status === 404 && urls.length === 1) throw lastErr;
        } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
        }
    }
    throw lastErr ?? new Error(`Failed to fetch ${cacheKey}`);
}

function fetchMaster(region, filename, opts) {
    const domains = MASTER_DOMAINS[opts.line] ?? MASTER_DOMAINS.main;
    const urls = domains.map(d => `${d}/${region}/master/${filename}`);
    return fetchJsonWithFallback(urls, "master", `${region}:${filename}`, TTL_MASTER_MS, opts.noCache);
}

function storageUrl(region, relPath, line = "main") {
    const domain = (STORAGE_DOMAINS[line] ?? STORAGE_DOMAINS.main)[0];
    return `${domain}/sekai-${region}-assets/${relPath.replace(/^\/+/, "")}`;
}

function fetchStorageJson(region, relPath, opts, ttlMs = TTL_SCENARIO_MS) {
    const clean = relPath.replace(/^\/+/, "");
    const domains = STORAGE_DOMAINS[opts.line] ?? STORAGE_DOMAINS.main;
    const urls = domains.map(d => `${d}/sekai-${region}-assets/${clean}`);
    return fetchJsonWithFallback(urls, "storage", `${region}:${clean}`, ttlMs, opts.noCache);
}

async function fetchDirectoryListing(region, dirPath, opts) {
    const clean = dirPath.replace(/^\/+/, "").replace(/\/?$/, "/");
    const data = await fetchStorageJson(region, clean, opts, TTL_MASTER_MS);
    const directories = Array.isArray(data.directories)
        ? data.directories.filter(x => typeof x === "string")
        : [];
    const files = Array.isArray(data.files)
        ? data.files.map(x => (typeof x === "string" ? x : x?.name)).filter(x => typeof x === "string")
        : [];
    return { directories, files };
}

async function loadSePackIndex(region, opts) {
    const results = await Promise.all(
        SE_PACKS.map(async (pack) => {
            try {
                const { files } = await fetchDirectoryListing(region, `sound/scenario/se/${pack}/`, opts);
                return { pack, files };
            } catch {
                return { pack, files: [] };
            }
        }),
    );
    const byBare = new Map();
    const allItems = [];
    for (const { pack, files } of results) {
        for (const file of files) {
            const label = file.replace(AUDIO_EXT_RE, "");
            if (!label) continue;
            if (!byBare.has(label)) byBare.set(label, pack);
            allItems.push({ pack, label, path: `${pack}/${label}` });
        }
    }
    return { byBare, allItems };
}

async function loadBgmMetadata(region, opts) {
    const [tracks, cats] = await Promise.all([
        fetchMaster(region, "musicSoundTracks.json", opts).catch(() => []),
        fetchMaster(region, "musicSoundTrackCategories.json", opts).catch(() => []),
    ]);
    const catById = new Map();
    for (const c of cats ?? []) {
        if (typeof c?.id === "number" && typeof c?.name === "string") catById.set(c.id, c.name);
    }
    const byName = new Map();
    const list = [];
    for (const t of tracks ?? []) {
        const dir = String(t?.assetbundleName ?? "").trim().replace(/^\/+|\/+$/g, "");
        const rawFile = String(t?.assetbundleFileName || dir.split("/").pop() || "").trim().replace(AUDIO_EXT_RE, "");
        if (!dir || !rawFile) continue;
        let canonical;
        if (dir.startsWith("sound/scenario/bgm/")) {
            const sub = dir.slice("sound/scenario/bgm/".length);
            canonical = sub === rawFile ? rawFile : `${sub}/${rawFile}`;
        } else {
            canonical = `${dir}/${rawFile}`;
        }
        const entry = {
            name: canonical,
            bareDir: dir.startsWith("sound/scenario/bgm/") ? dir.slice("sound/scenario/bgm/".length) : canonical,
            title: t.title || canonical,
            category: catById.get(t.musicSoundTrackCategoryId) ?? "",
            mysekai: dir.startsWith("mysekai/"),
        };
        byName.set(canonical, entry);
        if (!byName.has(entry.bareDir)) byName.set(entry.bareDir, entry);
        list.push(entry);
    }
    return { byName, list };
}

async function loadCharacter2dMap(region, opts) {
    const list = await fetchMaster(region, "character2ds.json", opts).catch(() => []);
    const map = new Map();
    for (const item of list ?? []) {
        if (typeof item?.id === "number") map.set(item.id, item);
    }
    return map;
}

async function fetchTranslationEpisode(kind, fileId, episodeKey, locale, opts) {
    if (!locale || (locale !== "zh-CN" && locale !== "en-US")) return null;
    const prefixMap = {
        event: "eventStory/event_",
        card: "cardStory/card_",
        area: "areaTalk/group_",
    };
    const prefix = prefixMap[kind];
    if (!prefix || fileId == null) return null;
    const base = locale === "en-US"
        ? `${TRANSLATION_BASE}/v2/en-US/translation`
        : `${TRANSLATION_BASE}/translation`;
    const url = `${base}/${prefix}${fileId}.json`;
    try {
        const data = await fetchJsonWithFallback([url], "translation", `${locale}:${kind}:${fileId}`, TTL_SCENARIO_MS, opts.noCache);
        const episodes = data?.episodes ?? data;
        return episodes?.[String(episodeKey)] ?? null;
    } catch {
        return null;
    }
}

// ==================== Story Selector -> Scenario Path Resolver ====================

function selectCardParts(episodes) {
    const sorted = [...episodes].sort((a, b) => (a.seq ?? a.id ?? 0) - (b.seq ?? b.id ?? 0));
    if (sorted.length === 0) return [];
    return sorted.slice(0, 2);
}

async function resolveSelectorTarget(parsed, region, opts) {
    if (parsed.kind === "url") {
        return {
            selector: parsed.canonical,
            storyKind: "event",
            scenarioUrl: parsed.url,
            scenarioPath: null,
            storyTitle: "",
            episodeTitle: "",
            translationRef: null,
        };
    }
    if (parsed.kind === "path") {
        return {
            selector: parsed.canonical,
            storyKind: "event",
            scenarioPath: parsed.path,
            scenarioUrl: storageUrl(region, parsed.path, opts.line),
            storyTitle: "",
            episodeTitle: "",
            translationRef: null,
        };
    }
    if (parsed.kind === "event") {
        const [events, stories] = await Promise.all([
            fetchMaster(region, "events.json", opts),
            fetchMaster(region, "eventStories.json", opts),
        ]);
        const story = stories.find(s => s.eventId === parsed.eventId);
        if (!story) throw new Error(`Event story ${parsed.eventId} not found on region '${region}'.`);
        const ep = (story.eventStoryEpisodes ?? []).find(e => e.episodeNo === parsed.episodeNo);
        if (!ep) throw new Error(`Episode ${parsed.episodeNo} not found in event ${parsed.eventId}.`);
        const ev = events.find(e => e.id === parsed.eventId);
        const relPath = `event_story/${story.assetbundleName}/scenario/${ep.scenarioId}.json`;
        return {
            selector: parsed.canonical,
            storyKind: "event",
            scenarioId: ep.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: ev?.name ?? `Event ${parsed.eventId}`,
            episodeTitle: ep.title ?? `Ep ${parsed.episodeNo}`,
            translationRef: { kind: "event", fileId: parsed.eventId, episodeKey: parsed.episodeNo },
        };
    }
    if (parsed.kind === "unit") {
        const [unitStories, unitProfiles] = await Promise.all([
            fetchMaster(region, "unitStories.json", opts),
            fetchMaster(region, "unitProfiles.json", opts).catch(() => []),
        ]);
        const normalizedUnit = resolveUnitKey(parsed.chapterOrUnit);
        let matchedStory = null;
        let matchedChapter = null;
        for (const us of unitStories) {
            for (const ch of us.chapters ?? []) {
                if (ch.assetbundleName === parsed.chapterOrUnit) {
                    matchedStory = us;
                    matchedChapter = ch;
                    break;
                }
            }
            if (matchedChapter) break;
        }
        if (!matchedChapter && normalizedUnit) {
            matchedStory = unitStories.find(us => us.unit === normalizedUnit) ?? null;
            matchedChapter = matchedStory?.chapters?.[0] ?? null;
        }
        if (!matchedChapter) {
            throw new Error(`Unit chapter '${parsed.chapterOrUnit}' not found on region '${region}'.`);
        }
        const ep = (matchedChapter.episodes ?? []).find(e => e.episodeNo === parsed.episodeNo);
        if (!ep) throw new Error(`Episode ${parsed.episodeNo} not found in unit chapter '${matchedChapter.assetbundleName}'.`);
        const profile = unitProfiles.find(p => p.unit === matchedStory.unit);
        const relPath = `scenario/unitstory/${matchedChapter.assetbundleName}/${ep.scenarioId}.json`;
        return {
            selector: `unit:${matchedChapter.assetbundleName}/${ep.episodeNo}`,
            storyKind: "unit",
            scenarioId: ep.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: matchedChapter.title || profile?.unitName || matchedStory.unit,
            episodeTitle: ep.title ?? `Ep ${ep.episodeNo}`,
            translationRef: null,
        };
    }
    if (parsed.kind === "card") {
        const [cards, episodes] = await Promise.all([
            fetchMaster(region, "cards.json", opts),
            fetchMaster(region, "cardEpisodes.json", opts),
        ]);
        const card = cards.find(c => c.id === parsed.cardId);
        if (!card) throw new Error(`Card ${parsed.cardId} not found on region '${region}'.`);
        const parts = selectCardParts(episodes.filter(e => e.cardId === parsed.cardId));
        const idx = parsed.part === "latter" ? 1 : 0;
        const ep = parts[idx];
        if (!ep) throw new Error(`Card ${parsed.cardId} has no '${parsed.part}' side story.`);
        const baseDir = region === "en" ? "character/member_scenario" : "character/member";
        const relPath = `${baseDir}/${card.assetbundleName}/${ep.scenarioId}.json`;
        return {
            selector: `card:${parsed.cardId}/${parsed.part}`,
            storyKind: "card",
            scenarioId: ep.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: card.prefix || `Card ${parsed.cardId}`,
            episodeTitle: ep.title || parsed.part,
            translationRef: { kind: "card", fileId: parsed.cardId, episodeKey: idx + 1 },
        };
    }
    if (parsed.kind === "area") {
        const [actions, areas] = await Promise.all([
            fetchMaster(region, "actionSets.json", opts),
            fetchMaster(region, "areas.json", opts).catch(() => []),
        ]);
        const action = actions.find(a => a.id === parsed.actionSetId);
        if (!action || !action.scenarioId) {
            throw new Error(`Area actionSet ${parsed.actionSetId} not found on region '${region}'.`);
        }
        const area = areas.find(a => a.id === action.areaId);
        const group = Math.floor(action.id / 100);
        const relPath = `scenario/actionset/group${group}/${action.scenarioId}.json`;
        return {
            selector: `area:${action.areaId}/${action.id}`,
            storyKind: "area",
            scenarioId: action.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: area ? (area.subName ? `${area.name} - ${area.subName}` : area.name) : `Area ${action.areaId}`,
            episodeTitle: `ActionSet ${action.id}`,
            translationRef: { kind: "area", fileId: group, episodeKey: action.scenarioId },
        };
    }
    if (parsed.kind === "special") {
        const specials = await fetchMaster(region, "specialStories.json", opts);
        const story = specials.find(s => s.id === parsed.specialId);
        if (!story) throw new Error(`Special story ${parsed.specialId} not found on region '${region}'.`);
        const ep = (story.episodes ?? []).find(e => e.episodeNo === parsed.episodeNo);
        if (!ep) throw new Error(`Episode ${parsed.episodeNo} not found in special story ${parsed.specialId}.`);
        const relPath = `scenario/special/${ep.assetbundleName}/${ep.scenarioId}.json`;
        return {
            selector: `special:${parsed.specialId}/${parsed.episodeNo}`,
            storyKind: "special",
            scenarioId: ep.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: story.title || `Special ${parsed.specialId}`,
            episodeTitle: ep.title || `Ep ${parsed.episodeNo}`,
            translationRef: null,
        };
    }
    if (parsed.kind === "self") {
        const relPath = `scenario/profile/${parsed.scenarioId}.json`;
        return {
            selector: `self:${parsed.scenarioId}`,
            storyKind: "self",
            scenarioId: parsed.scenarioId,
            scenarioPath: relPath,
            scenarioUrl: storageUrl(region, relPath, opts.line),
            storyTitle: "Self Introduction",
            episodeTitle: parsed.scenarioId,
            translationRef: null,
        };
    }
    throw new Error(`Unsupported selector '${parsed.canonical}'.`);
}

// ==================== Pure Scenario Extractor (Study Report) ====================

function buildMskVoiceString(voiceIdRaw, voiceChara2dId, fallbackChara2dId, storyKind, scenarioId, chara2dById, region) {
    const voiceId = String(voiceIdRaw ?? "").trim();
    if (!voiceId) return null;
    if (voiceId.startsWith("partvoice")) {
        const c2dId = voiceChara2dId || fallbackChara2dId || 0;
        const c2d = c2dId ? chara2dById?.get(c2dId) : null;
        if (c2d?.assetName && c2d?.unit) {
            const chara = `${c2d.assetName}_${c2d.unit}`;
            if (chara.startsWith("v2_") || chara.startsWith("clb")) {
                return `voice(story:part_voice_${chara}:${voiceId}@${region})`;
            }
            return `voice(part:${chara}:${voiceId}@${region})`;
        }
    }
    const kind = storyKind === "card" ? "card" : storyKind === "area" ? "area" : "story";
    return `voice(${kind}:${scenarioId}:${voiceId}@${region})`;
}

/**
 * Pure scenario analyzer: walks `IScenarioData` snippets in playback order and extracts
 * everything an AI agent needs to learn from an official Project SEKAI script.
 */
export function extractScenarioStudy(scenario, ctx = {}) {
    const region = ctx.region ?? "jp";
    const line = ctx.line ?? "main";
    const storyKind = ctx.storyKind ?? "event";
    const scenarioId = scenario.ScenarioId || ctx.scenarioId || "";
    const chara2dById = ctx.chara2dById ?? new Map();
    const sePackByName = ctx.sePackByName ?? new Map();
    const bgmTitleByName = ctx.bgmTitleByName ?? new Map();
    const translationTalk = ctx.translationEpisode?.talkData ?? null;
    const maxExamples = ctx.maxExamples ?? 2;

    const translateText = (raw) => {
        if (!translationTalk || !raw) return null;
        return translationTalk[raw] ?? translationTalk[raw.trim()] ?? null;
    };

    const resolveActorInfo = (char2dId, explicitModelId) => {
        const c2d = chara2dById.get(char2dId);
        const charId = c2d?.characterType === "game_character" ? c2d.characterId : null;
        const baseChar = charId ? CHAR_BY_ID.get(charId) : null;
        const modelId = explicitModelId || "";
        const inferredKey = baseChar?.key ?? (c2d?.assetName || (char2dId ? `char2d_${char2dId}` : "unknown"));
        const name = baseChar ? `${baseChar.en} / ${baseChar.jp}` : (c2d?.assetName || `Char2d#${char2dId}`);
        const motionBundle = modelId ? (inferMotionBundleCandidates(modelId)[0] ?? null) : null;
        return {
            actorKey: modelId ? `${inferredKey}:${modelId}` : `${inferredKey}:id${char2dId}`,
            shortKey: inferredKey,
            char2dId,
            charId,
            name,
            unit: c2d?.unit ?? baseChar?.unit ?? "",
            modelId,
            motionBundle,
            isSubOrMob: !baseChar,
        };
    };

    // 1. Catalog appearing cast & costumes
    const castEntries = [];
    const castSeen = new Set();
    const activeCostumeByChara2d = new Map();
    for (const appear of scenario.AppearCharacters ?? []) {
        const c2dId = appear.Character2dId;
        const modelId = String(appear.CostumeType ?? "").trim();
        if (modelId && !activeCostumeByChara2d.has(c2dId)) {
            activeCostumeByChara2d.set(c2dId, modelId);
        }
        const dedupeKey = `${c2dId}|${modelId}`;
        if (castSeen.has(dedupeKey)) continue;
        castSeen.add(dedupeKey);
        castEntries.push(resolveActorInfo(c2dId, modelId));
    }

    // Pre-index talks by snippet position so SE/BGM/Layout can grab nearest surrounding dialogue context.
    const snippets = Array.isArray(scenario.Snippets) ? scenario.Snippets : [];
    const talkBySnippetIdx = new Map();
    const talkOrderBySnippetIdx = new Map();
    let totalTalks = 0;
    for (let i = 0; i < snippets.length; i++) {
        const sn = snippets[i];
        if (sn?.Action === 1) {
            const td = scenario.TalkData?.[sn.ReferenceIndex];
            if (td) {
                totalTalks += 1;
                talkBySnippetIdx.set(i, td);
                talkOrderBySnippetIdx.set(i, totalTalks);
            }
        }
    }

    const formatTalkShort = (td) => {
        if (!td) return "";
        const speaker = translateText(td.WindowDisplayName) || td.WindowDisplayName || "Narration";
        const body = translateText(td.Body) || td.Body || "";
        return `${speaker}: "${truncate(body, 64)}"`;
    };

    const findAdjacentTalk = (snippetIdx, direction) => {
        const step = direction < 0 ? -1 : 1;
        for (let i = snippetIdx + step; i >= 0 && i < snippets.length && Math.abs(i - snippetIdx) <= 25; i += step) {
            const td = talkBySnippetIdx.get(i);
            if (td && td.Body) {
                return { talkLine: talkOrderBySnippetIdx.get(i), text: formatTalkShort(td) };
            }
        }
        return null;
    };

    // 2. Trackers for backgrounds, BGM, SE, clips, voices, effects, timeline
    const bgMap = new Map();
    const bgmMap = new Map();
    const seMap = new Map();
    const charClipsMap = new Map();
    const voiceSamples = [];
    const effects = {
        transitions: {},
        shakes: 0,
        flashes: 0,
        telops: [],
        places: [],
        enterCount: 0,
        moveCount: 0,
        exitCount: 0,
        coStarReactionCount: 0,
    };
    const timeline = [];

    let currentBg = null;
    let currentPlace = "";
    let currentTalkLine = 0;

    const recordBg = (bgId, talkLine, placeHint) => {
        const id = String(bgId ?? "").trim();
        if (!id || id === "bg_a000000") return;
        currentBg = id;
        let entry = bgMap.get(id);
        if (!entry) {
            entry = {
                id,
                count: 0,
                firstTalkLine: talkLine,
                places: [],
                isCg: isStoryCgBackground(id),
                webp: storageUrl(region, `scenario/background/${id}/${id}.webp`, line),
                png: storageUrl(region, `scenario/background/${id}/${id}.png`, line),
            };
            bgMap.set(id, entry);
        }
        entry.count += 1;
        if (placeHint && !entry.places.includes(placeHint)) {
            entry.places.push(placeHint);
        }
    };

    const recordBgm = (bgmRaw, talkLine, snippetIdx) => {
        const raw = String(bgmRaw ?? "").trim();
        if (!raw || raw === "bgm00000") return;
        const meta = bgmTitleByName.get(raw);
        const canonical = meta?.name ?? raw;
        let entry = bgmMap.get(canonical);
        if (!entry) {
            const after = snippetIdx >= 0 ? findAdjacentTalk(snippetIdx, +1) : findAdjacentTalk(-1, +1);
            const url = canonical.startsWith("mysekai/") || canonical.startsWith("sound/")
                ? storageUrl(region, `${canonical}.mp3`, line)
                : canonical.includes("/")
                    ? storageUrl(region, `sound/scenario/bgm/${canonical}.mp3`, line)
                    : storageUrl(region, `sound/scenario/bgm/${canonical}/${canonical}.mp3`, line);
            entry = {
                name: canonical,
                raw,
                title: meta?.title ?? "",
                category: meta?.category ?? "",
                count: 0,
                firstTalkLine: talkLine,
                sampleContext: after?.text ?? "",
                url,
            };
            bgmMap.set(canonical, entry);
        }
        entry.count += 1;
    };

    const recordSe = (seRaw, talkLine, snippetIdx) => {
        const raw = String(seRaw ?? "").trim();
        if (!raw) return;
        const pack = raw.includes("/") ? raw.split("/")[0] : (sePackByName.get(raw) ?? (raw.endsWith("_b") ? "se_pack00001_b" : null));
        const path = raw.includes("/") ? raw : (pack ? `${pack}/${raw}` : raw);
        let entry = seMap.get(path);
        if (!entry) {
            entry = {
                raw,
                path,
                pack: pack ?? "unknown",
                count: 0,
                examples: [],
                url: pack ? storageUrl(region, `sound/scenario/se/${path}.mp3`, line) : storageUrl(region, `sound/scenario/se/se_pack00001_b/${raw}.mp3`, line),
            };
            seMap.set(path, entry);
        }
        entry.count += 1;
        if (entry.examples.length < maxExamples) {
            const before = findAdjacentTalk(snippetIdx, -1);
            const after = findAdjacentTalk(snippetIdx, +1);
            entry.examples.push({
                talkLine,
                before: before?.text ?? "",
                after: after?.text ?? "",
            });
        }
    };

    const recordClip = (char2dId, motionRaw, facialRaw, source, contextText, explicitModelId) => {
        const motion = String(motionRaw ?? "").trim();
        const facial = String(facialRaw ?? "").trim();
        if (!motion && !facial) return;
        const modelId = String(explicitModelId ?? "").trim() || activeCostumeByChara2d.get(char2dId) || "";
        const info = resolveActorInfo(char2dId, modelId);
        let bucket = charClipsMap.get(info.actorKey);
        if (!bucket) {
            bucket = {
                actorKey: info.actorKey,
                shortKey: info.shortKey,
                char2dId: info.char2dId,
                charId: info.charId,
                name: info.name,
                modelId: info.modelId,
                motionBundle: info.motionBundle,
                pairMap: new Map(),
            };
            charClipsMap.set(info.actorKey, bucket);
        }
        const pairKey = `${motion}\0${facial}`;
        let pair = bucket.pairMap.get(pairKey);
        if (!pair) {
            pair = { motion, facial, count: 0, sources: new Set(), examples: [] };
            bucket.pairMap.set(pairKey, pair);
        }
        pair.count += 1;
        pair.sources.add(source);
        if (contextText && pair.examples.length < maxExamples && !pair.examples.includes(contextText)) {
            pair.examples.push(contextText);
        }
    };

    // 3. Process header fields
    if (scenario.FirstBackground) {
        if (scenario.FirstBackground === "bg_a000000") {
            timeline.push({ kind: "bg", talkLine: 0, bg: "bg_a000000 (black)" });
        } else {
            recordBg(scenario.FirstBackground, 0, "");
            timeline.push({ kind: "bg", talkLine: 0, bg: scenario.FirstBackground });
        }
    }
    if (scenario.FirstBgm && scenario.FirstBgm !== "bgm00000") {
        recordBgm(scenario.FirstBgm, 0, -1);
        timeline.push({ kind: "bgm", talkLine: 0, bgm: bgmTitleByName.get(scenario.FirstBgm)?.name ?? scenario.FirstBgm });
    }
    for (const fl of scenario.FirstLayout ?? []) {
        if (fl.CostumeType) activeCostumeByChara2d.set(fl.Character2dId, fl.CostumeType);
        const info = resolveActorInfo(fl.Character2dId, fl.CostumeType || activeCostumeByChara2d.get(fl.Character2dId));
        recordClip(fl.Character2dId, fl.MotionName, fl.FacialName, "firstLayout", "(opening pose)", fl.CostumeType);
        timeline.push({
            kind: "enter",
            talkLine: 0,
            actor: info.shortKey,
            modelId: info.modelId,
            slot: SIDE_TO_MSK_SLOT[fl.PositionSide] ?? `side:${fl.PositionSide}`,
            motion: fl.MotionName || "",
            facial: fl.FacialName || "",
        });
    }

    // 4. Walk Snippets sequentially
    for (let i = 0; i < snippets.length; i++) {
        const sn = snippets[i];
        if (!sn) continue;

        if (sn.Action === 1) {
            const td = scenario.TalkData?.[sn.ReferenceIndex];
            if (!td) continue;
            currentTalkLine += 1;
            const speakerChara2d = td.TalkCharacters?.[0]?.Character2dId ?? 0;
            const speakerName = translateText(td.WindowDisplayName) || td.WindowDisplayName || "";
            const bodyOrig = td.Body ?? "";
            const bodyTr = translateText(bodyOrig);
            const displayBody = bodyTr ? `${truncate(bodyTr, 80)} [JP: ${truncate(bodyOrig, 48)}]` : truncate(bodyOrig, 100);
            const ctxLine = `${speakerName || "Narration"}: "${truncate(bodyTr || bodyOrig, 64)}"`;

            const speakerMotions = [];
            const reactions = [];
            for (const m of td.Motions ?? []) {
                if (!m) continue;
                const targetId = m.Character2dId || speakerChara2d;
                const isReaction = speakerChara2d > 0 && targetId !== speakerChara2d;
                if (isReaction) effects.coStarReactionCount += 1;
                recordClip(targetId, m.MotionName, m.FacialName, isReaction ? "react" : "talk", ctxLine);
                const actorInfo = resolveActorInfo(targetId, activeCostumeByChara2d.get(targetId));
                if (isReaction) {
                    reactions.push({ actor: actorInfo.shortKey, motion: m.MotionName || "", facial: m.FacialName || "" });
                } else {
                    speakerMotions.push({ motion: m.MotionName || "", facial: m.FacialName || "" });
                }
            }

            let voiceRef = null;
            if (Array.isArray(td.Voices) && td.Voices.length > 0) {
                const v = td.Voices[0];
                voiceRef = buildMskVoiceString(v.VoiceId, v.Character2dId, speakerChara2d, storyKind, scenarioId, chara2dById, region);
                if (voiceRef && voiceSamples.length < 12) {
                    voiceSamples.push({ ref: voiceRef, speaker: speakerName, text: truncate(bodyTr || bodyOrig, 56) });
                }
            }

            const speakerActor = speakerChara2d ? resolveActorInfo(speakerChara2d, activeCostumeByChara2d.get(speakerChara2d)).shortKey : "";
            timeline.push({
                kind: "talk",
                talkLine: currentTalkLine,
                actor: speakerActor,
                speaker: speakerName,
                body: displayBody,
                motion: speakerMotions[0]?.motion ?? "",
                facial: speakerMotions[0]?.facial ?? "",
                reactions,
                voice: voiceRef,
            });
        } else if (sn.Action === 2 || sn.Action === 4) {
            const l = scenario.LayoutData?.[sn.ReferenceIndex];
            if (!l) continue;
            if (l.CostumeType) activeCostumeByChara2d.set(l.Character2dId, l.CostumeType);
            const info = resolveActorInfo(l.Character2dId, l.CostumeType || activeCostumeByChara2d.get(l.Character2dId));
            const nextTalk = findAdjacentTalk(i, +1);
            const prevTalk = findAdjacentTalk(i, -1);
            const ctxText = nextTalk?.text ?? prevTalk?.text ?? "";

            if (sn.Action === 4 || l.Type === 0) {
                recordClip(l.Character2dId, l.MotionName, l.FacialName, "pose", ctxText, l.CostumeType);
                timeline.push({
                    kind: "pose",
                    talkLine: currentTalkLine,
                    actor: info.shortKey,
                    motion: l.MotionName || "",
                    facial: l.FacialName || "",
                });
            } else if (l.Type === 2) {
                effects.enterCount += 1;
                recordClip(l.Character2dId, l.MotionName, l.FacialName, "enter", ctxText, l.CostumeType);
                timeline.push({
                    kind: "enter",
                    talkLine: currentTalkLine,
                    actor: info.shortKey,
                    modelId: info.modelId,
                    slot: SIDE_TO_MSK_SLOT[l.SideTo] ?? `side:${l.SideTo}`,
                    motion: l.MotionName || "",
                    facial: l.FacialName || "",
                });
            } else if (l.Type === 1) {
                effects.moveCount += 1;
                recordClip(l.Character2dId, l.MotionName, l.FacialName, "move", ctxText, l.CostumeType);
                timeline.push({
                    kind: "move",
                    talkLine: currentTalkLine,
                    actor: info.shortKey,
                    slot: SIDE_TO_MSK_SLOT[l.SideTo] ?? `side:${l.SideTo}`,
                    motion: l.MotionName || "",
                    facial: l.FacialName || "",
                });
            } else if (l.Type === 3) {
                effects.exitCount += 1;
                timeline.push({
                    kind: "exit",
                    talkLine: currentTalkLine,
                    actor: info.shortKey,
                });
            }
        } else if (sn.Action === 6) {
            const fx = scenario.SpecialEffectData?.[sn.ReferenceIndex];
            if (!fx) continue;
            const fxName = SPECIAL_EFFECT_NAMES[fx.EffectType] ?? `Effect#${fx.EffectType}`;
            if (fx.EffectType === 7 || fx.EffectType === 17) {
                const bgId = fx.StringValSub || fx.StringVal;
                if (bgId === "bg_a000000") {
                    currentBg = null;
                    timeline.push({ kind: "bg", talkLine: currentTalkLine, bg: "bg_a000000 (black)" });
                } else {
                    recordBg(bgId, currentTalkLine, currentPlace);
                    timeline.push({ kind: "bg", talkLine: currentTalkLine, bg: bgId });
                }
            } else if (fx.EffectType === 18) {
                const placeText = translateText(fx.StringVal) || fx.StringVal || "";
                currentPlace = placeText;
                if (placeText && !effects.places.includes(placeText)) effects.places.push(placeText);
                if (currentBg && bgMap.has(currentBg) && placeText) {
                    const b = bgMap.get(currentBg);
                    if (!b.places.includes(placeText)) b.places.push(placeText);
                }
                timeline.push({ kind: "place", talkLine: currentTalkLine, text: placeText });
            } else if (fx.EffectType === 8) {
                const telopText = translateText(fx.StringVal) || fx.StringVal || "";
                if (telopText) effects.telops.push(telopText);
                timeline.push({ kind: "telop", talkLine: currentTalkLine, text: telopText });
            } else if (fx.EffectType === 5 || fx.EffectType === 6) {
                effects.shakes += 1;
                timeline.push({ kind: "fx", talkLine: currentTalkLine, fx: fxName, duration: fx.Duration });
            } else if (fx.EffectType >= 1 && fx.EffectType <= 4) {
                effects.transitions[fxName] = (effects.transitions[fxName] ?? 0) + 1;
                if (fx.EffectType === 3 || fx.EffectType === 4) effects.flashes += 1;
                timeline.push({ kind: "fx", talkLine: currentTalkLine, fx: fxName, duration: fx.Duration });
            } else if (fx.EffectType === 24 && fx.StringVal) {
                timeline.push({ kind: "telop", talkLine: currentTalkLine, text: `[FullScreen] ${truncate(translateText(fx.StringVal) || fx.StringVal, 80)}` });
            }
        } else if (sn.Action === 7) {
            const snd = scenario.SoundData?.[sn.ReferenceIndex];
            if (!snd) continue;
            if (snd.Bgm) {
                if (snd.Bgm === "bgm00000") {
                    timeline.push({ kind: "bgm", talkLine: currentTalkLine, bgm: "STOP" });
                } else {
                    recordBgm(snd.Bgm, currentTalkLine, i);
                    const canonical = bgmTitleByName.get(snd.Bgm)?.name ?? snd.Bgm;
                    timeline.push({ kind: "bgm", talkLine: currentTalkLine, bgm: canonical });
                }
            }
            if (snd.Se) {
                recordSe(snd.Se, currentTalkLine, i);
                const pack = sePackByName.get(snd.Se);
                const resolvedSe = snd.Se.includes("/") ? snd.Se : (pack ? `${pack}/${snd.Se}` : snd.Se);
                timeline.push({ kind: "se", talkLine: currentTalkLine, se: resolvedSe });
            }
        }
    }

    const characterClips = [...charClipsMap.values()]
        .sort((a, b) => (a.charId ?? 999) - (b.charId ?? 999) || a.actorKey.localeCompare(b.actorKey))
        .map(bucket => ({
            actorKey: bucket.actorKey,
            shortKey: bucket.shortKey,
            charId: bucket.charId,
            name: bucket.name,
            modelId: bucket.modelId,
            motionBundle: bucket.motionBundle,
            pairs: [...bucket.pairMap.values()]
                .sort((a, b) => b.count - a.count || a.motion.localeCompare(b.motion) || a.facial.localeCompare(b.facial))
                .map(p => ({
                    motion: p.motion,
                    facial: p.facial,
                    count: p.count,
                    sources: [...p.sources],
                    examples: p.examples,
                })),
        }));

    return {
        meta: {
            selector: ctx.selector ?? scenarioId,
            region,
            storyKind,
            scenarioId,
            storyTitle: ctx.storyTitle ?? "",
            episodeTitle: ctx.episodeTitle ?? "",
            scenarioUrl: ctx.scenarioUrl ?? "",
            talkCount: totalTalks,
            snippetCount: snippets.length,
        },
        cast: castEntries,
        backgrounds: [...bgMap.values()],
        bgm: [...bgmMap.values()],
        se: [...seMap.values()].sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
        characterClips,
        voices: voiceSamples,
        effects,
        timeline,
    };
}

/**
 * Pure aggregator: merges multiple `extractScenarioStudy()` reports into a single `.msk` Authoring Asset Kit.
 */
export function aggregateStudyReports(reports, targetCharIds = []) {
    const targetSet = new Set(targetCharIds);
    const castByChar = new Map();
    const bgMap = new Map();
    const bgmMap = new Map();
    const seMap = new Map();
    const clipsByChar = new Map();

    for (const rep of reports) {
        for (const c of rep.cast) {
            if (!c.modelId) continue;
            if (targetSet.size > 0 && c.charId != null && !targetSet.has(c.charId)) continue;
            const key = `${c.charId ?? c.shortKey}|${c.modelId}`;
            const cur = castByChar.get(key) ?? { ...c, count: 0, isV2: c.modelId.startsWith("v2_") };
            cur.count += 1;
            castByChar.set(key, cur);
        }

        for (const bg of rep.backgrounds) {
            const cur = bgMap.get(bg.id) ?? { ...bg, count: 0, places: [], episodes: [] };
            cur.count += bg.count;
            for (const p of bg.places) if (!cur.places.includes(p)) cur.places.push(p);
            if (!cur.episodes.includes(rep.meta.selector)) cur.episodes.push(rep.meta.selector);
            bgMap.set(bg.id, cur);
        }

        for (const b of rep.bgm) {
            const cur = bgmMap.get(b.name) ?? { ...b, count: 0, episodes: [] };
            cur.count += b.count;
            if (!cur.episodes.includes(rep.meta.selector)) cur.episodes.push(rep.meta.selector);
            bgmMap.set(b.name, cur);
        }

        for (const s of rep.se) {
            const cur = seMap.get(s.path) ?? { ...s, count: 0, examples: [], episodes: [] };
            cur.count += s.count;
            if (!cur.episodes.includes(rep.meta.selector)) cur.episodes.push(rep.meta.selector);
            for (const ex of s.examples) {
                if (cur.examples.length < 3) cur.examples.push({ ...ex, selector: rep.meta.selector });
            }
            seMap.set(s.path, cur);
        }

        for (const cc of rep.characterClips) {
            if (targetSet.size > 0 && cc.charId != null && !targetSet.has(cc.charId)) continue;
            const groupKey = cc.charId != null ? `char:${cc.charId}:${cc.modelId.startsWith("v2_") ? "v2" : "v1"}` : cc.actorKey;
            let bucket = clipsByChar.get(groupKey);
            if (!bucket) {
                bucket = {
                    shortKey: cc.shortKey,
                    charId: cc.charId,
                    name: cc.name,
                    models: new Set(),
                    pairMap: new Map(),
                };
                clipsByChar.set(groupKey, bucket);
            }
            if (cc.modelId) bucket.models.add(cc.modelId);
            for (const p of cc.pairs) {
                const pk = `${p.motion}\0${p.facial}`;
                let cur = bucket.pairMap.get(pk);
                if (!cur) {
                    cur = { motion: p.motion, facial: p.facial, count: 0, examples: [] };
                    bucket.pairMap.set(pk, cur);
                }
                cur.count += p.count;
                for (const ex of p.examples) {
                    if (cur.examples.length < 2 && !cur.examples.includes(ex)) cur.examples.push(ex);
                }
            }
        }
    }

    const recommendedCast = [...castByChar.values()]
        .sort((a, b) => Number(b.isV2) - Number(a.isV2) || (a.charId ?? 999) - (b.charId ?? 999) || b.count - a.count);

    const characterClips = [...clipsByChar.values()]
        .sort((a, b) => (a.charId ?? 999) - (b.charId ?? 999))
        .map(b => ({
            shortKey: b.shortKey,
            charId: b.charId,
            name: b.name,
            models: [...b.models],
            pairs: [...b.pairMap.values()].sort((x, y) => y.count - x.count).slice(0, 14),
        }));

    return {
        sources: reports.map(r => ({
            selector: r.meta.selector,
            storyTitle: r.meta.storyTitle,
            episodeTitle: r.meta.episodeTitle,
            talkCount: r.meta.talkCount,
        })),
        recommendedCast,
        backgrounds: [...bgMap.values()].sort((a, b) => Number(a.isCg) - Number(b.isCg) || b.count - a.count),
        bgm: [...bgmMap.values()].sort((a, b) => b.count - a.count),
        se: [...seMap.values()].sort((a, b) => b.count - a.count),
        characterClips,
    };
}

// ==================== Subcommand Implementations ====================

async function discoverEpisodes(opts) {
    const region = opts.region;
    const kind = opts.kind ?? "event";
    const unitKey = resolveUnitKey(opts.unit);
    const charIds = opts.char ? resolveCharacterIds(opts.char) : [];
    const charSet = new Set(charIds);
    const queryLower = (opts.query ?? "").trim().toLowerCase();
    const limit = opts.limit ?? 15;
    const sortLatest = opts.oldest ? false : true;

    const unitCharIds = unitKey
        ? new Set(CHARACTERS.filter(c => c.unit === unitKey).map(c => c.id))
        : null;

    if (kind === "event") {
        const [events, stories, gcu, eventCards, cards] = await Promise.all([
            fetchMaster(region, "events.json", opts),
            fetchMaster(region, "eventStories.json", opts),
            fetchMaster(region, "gameCharacterUnits.json", opts).catch(() => []),
            (charSet.size > 0 || unitKey) ? fetchMaster(region, "eventCards.json", opts).catch(() => []) : Promise.resolve([]),
            (charSet.size > 0 || unitKey) ? fetchMaster(region, "cards.json", opts).catch(() => []) : Promise.resolve([]),
        ]);
        const eventById = new Map(events.map(e => [e.id, e]));
        const gcuById = new Map(gcu.map(u => [u.id, u]));
        const cardCharById = new Map(cards.map(c => [c.id, c.characterId]));
        const eventChars = new Map();
        for (const ec of eventCards) {
            const cid = cardCharById.get(ec.cardId);
            if (!cid) continue;
            let set = eventChars.get(ec.eventId);
            if (!set) { set = new Set(); eventChars.set(ec.eventId, set); }
            set.add(cid);
        }

        const matched = [];
        for (const s of stories) {
            const ev = eventById.get(s.eventId);
            const bannerUnit = gcuById.get(s.bannerGameCharacterUnitId);
            const bannerCharId = bannerUnit?.gameCharacterId ?? null;
            const bannerUnitName = bannerUnit?.unit ?? null;
            const charsInEv = new Set(eventChars.get(s.eventId) ?? []);
            if (bannerCharId) charsInEv.add(bannerCharId);

            if (unitKey) {
                const unitCardCount = [...charsInEv].filter(cid => unitCharIds?.has(cid)).length;
                const isUnitMajority = charsInEv.size > 0 && unitCardCount >= Math.max(2, Math.ceil(charsInEv.size * 0.6));
                const isUnitFocus = bannerUnitName === unitKey || (!bannerUnitName && isUnitMajority);
                const isMixedMatch = unitCardCount >= 1;
                if (opts.includeMixed ? !isMixedMatch : !isUnitFocus) continue;
            }
            if (charSet.size > 0) {
                const matchAll = [...charSet].every(cid => charsInEv.has(cid));
                if (!matchAll) continue;
            }
            const title = ev?.name ?? `Event ${s.eventId}`;
            const outline = s.outline ?? "";
            const eps = [...(s.eventStoryEpisodes ?? [])].sort((a, b) => a.episodeNo - b.episodeNo);
            if (queryLower) {
                const hay = `${title} ${outline} ${s.assetbundleName} ${eps.map(e => e.title).join(" ")}`.toLowerCase();
                if (!hay.includes(queryLower)) continue;
            }
            const firstEp = eps[0];
            if (!firstEp) continue;
            matched.push({
                selector: `event:${s.eventId}/${firstEp.episodeNo}`,
                kind: "event",
                eventId: s.eventId,
                title,
                episodeCount: eps.length,
                firstEpisodeTitle: firstEp.title,
                scenarioId: firstEp.scenarioId,
                bannerChar: bannerCharId ? CHAR_BY_ID.get(bannerCharId)?.key ?? String(bannerCharId) : "",
                unit: bannerUnitName ? (UNIT_SHORT[bannerUnitName] ?? bannerUnitName) : "",
                outline: truncate(outline, 90),
            });
        }
        matched.sort((a, b) => (sortLatest ? b.eventId - a.eventId : a.eventId - b.eventId));
        return matched.slice(0, limit);
    }

    if (kind === "unit") {
        const [unitStories, profiles] = await Promise.all([
            fetchMaster(region, "unitStories.json", opts),
            fetchMaster(region, "unitProfiles.json", opts).catch(() => []),
        ]);
        const profileByUnit = new Map(profiles.map(p => [p.unit, p.unitName]));
        const out = [];
        for (const us of unitStories) {
            if (unitKey && us.unit !== unitKey) continue;
            if (charSet.size > 0) {
                const unitMembers = new Set(CHARACTERS.filter(c => c.unit === us.unit).map(c => c.id));
                if (![...charSet].some(cid => unitMembers.has(cid))) continue;
            }
            for (const ch of us.chapters ?? []) {
                for (const ep of ch.episodes ?? []) {
                    const title = `${ch.title || profileByUnit.get(us.unit) || us.unit} — ${ep.title}`;
                    if (queryLower && !title.toLowerCase().includes(queryLower) && !ep.scenarioId.toLowerCase().includes(queryLower)) continue;
                    out.push({
                        selector: `unit:${ch.assetbundleName}/${ep.episodeNo}`,
                        kind: "unit",
                        unit: UNIT_SHORT[us.unit] ?? us.unit,
                        title,
                        scenarioId: ep.scenarioId,
                    });
                }
            }
        }
        return out.slice(0, limit);
    }

    if (kind === "card") {
        const [cards, episodes] = await Promise.all([
            fetchMaster(region, "cards.json", opts),
            fetchMaster(region, "cardEpisodes.json", opts),
        ]);
        const epsByCard = new Map();
        for (const ep of episodes) {
            const arr = epsByCard.get(ep.cardId) ?? [];
            arr.push(ep);
            epsByCard.set(ep.cardId, arr);
        }
        const matched = [];
        for (const c of cards) {
            if (charSet.size > 0 && !charSet.has(c.characterId)) continue;
            if (unitCharIds && !unitCharIds.has(c.characterId)) continue;
            const parts = selectCardParts(epsByCard.get(c.id) ?? []);
            if (parts.length === 0) continue;
            const chInfo = CHAR_BY_ID.get(c.characterId);
            const title = `${chInfo?.en ?? c.characterId} — ${c.prefix}`;
            if (queryLower && !title.toLowerCase().includes(queryLower) && !c.assetbundleName.toLowerCase().includes(queryLower)) continue;
            matched.push({
                selector: `card:${c.id}/former`,
                latterSelector: parts[1] ? `card:${c.id}/latter` : null,
                kind: "card",
                cardId: c.id,
                char: chInfo?.key ?? String(c.characterId),
                title,
                scenarioId: parts[0].scenarioId,
            });
        }
        matched.sort((a, b) => (sortLatest ? b.cardId - a.cardId : a.cardId - b.cardId));
        return matched.slice(0, limit);
    }

    if (kind === "area") {
        const [actions, areas, c2dMap] = await Promise.all([
            fetchMaster(region, "actionSets.json", opts),
            fetchMaster(region, "areas.json", opts).catch(() => []),
            loadCharacter2dMap(region, opts),
        ]);
        const areaById = new Map(areas.map(a => [a.id, a]));
        const matched = [];
        for (const a of actions) {
            if (!a.scenarioId) continue;
            const chars = [...new Set((a.characterIds ?? []).map(id => c2dMap.get(id)?.characterId).filter(Boolean))];
            if (charSet.size > 0 && ![...charSet].every(cid => chars.includes(cid))) continue;
            if (unitCharIds && !chars.some(cid => unitCharIds.has(cid))) continue;
            const area = areaById.get(a.areaId);
            const areaName = area ? (area.subName ? `${area.name} - ${area.subName}` : area.name) : `Area ${a.areaId}`;
            if (queryLower && !areaName.toLowerCase().includes(queryLower) && !a.scenarioId.toLowerCase().includes(queryLower)) continue;
            matched.push({
                selector: `area:${a.areaId}/${a.id}`,
                kind: "area",
                actionSetId: a.id,
                title: areaName,
                chars: chars.map(cid => CHAR_BY_ID.get(cid)?.key ?? String(cid)),
                scenarioId: a.scenarioId,
            });
        }
        matched.sort((a, b) => (sortLatest ? b.actionSetId - a.actionSetId : a.actionSetId - b.actionSetId));
        return matched.slice(0, limit);
    }

    if (kind === "special") {
        const specials = await fetchMaster(region, "specialStories.json", opts);
        const matched = [];
        for (const s of specials) {
            for (const ep of s.episodes ?? []) {
                const title = `${s.title || `Special ${s.id}`} — ${ep.title || `Ep ${ep.episodeNo}`}`;
                if (queryLower && !title.toLowerCase().includes(queryLower)) continue;
                matched.push({
                    selector: `special:${s.id}/${ep.episodeNo}`,
                    kind: "special",
                    id: s.id,
                    title,
                    scenarioId: ep.scenarioId,
                });
            }
        }
        return matched.slice(0, limit);
    }

    throw new Error(`Unknown --kind '${kind}' (expected event|unit|card|area|special).`);
}

async function resolveChunkToSelector(chunk, region, opts, caches) {
    if (chunk.type === "event") {
        const evMatch = /^event_(\d+)$/.exec(chunk.story_id || "");
        if (evMatch && /^\d+$/.test(String(chunk.ep || ""))) {
            return `event:${evMatch[1]}/${chunk.ep}`;
        }
    }
    if (chunk.type === "card") {
        const cardMatch = /^card_(\d+)$/.exec(chunk.story_id || "");
        if (cardMatch) {
            const epStr = String(chunk.ep || "").toLowerCase();
            const part = (epStr === "2" || epStr.includes("后") || epStr.includes("後") || epStr.includes("latter") || epStr.includes("2")) ? "latter" : "former";
            return `card:${cardMatch[1]}/${part}`;
        }
    }
    if (chunk.type === "talk") {
        const talkMatch = /^talk_(\d+)$/.exec(chunk.story_id || "");
        if (talkMatch) return `talk:${talkMatch[1]}`;
    }
    if (chunk.type === "self") {
        return chunk.scenario_id ? `self:${chunk.scenario_id}` : null;
    }
    if (chunk.type === "unit" && chunk.scenario_id) {
        if (!caches.unitByScenario) {
            const us = await fetchMaster(region, "unitStories.json", opts).catch(() => []);
            caches.unitByScenario = new Map();
            for (const u of us) {
                for (const ch of u.chapters ?? []) {
                    for (const ep of ch.episodes ?? []) {
                        if (ep.scenarioId) caches.unitByScenario.set(ep.scenarioId, `unit:${ch.assetbundleName}/${ep.episodeNo}`);
                    }
                }
            }
        }
        return caches.unitByScenario.get(chunk.scenario_id) ?? null;
    }
    if (chunk.type === "special" && chunk.scenario_id) {
        if (!caches.specialByScenario) {
            const sp = await fetchMaster(region, "specialStories.json", opts).catch(() => []);
            caches.specialByScenario = new Map();
            for (const s of sp) {
                for (const ep of s.episodes ?? []) {
                    if (ep.scenarioId) caches.specialByScenario.set(ep.scenarioId, `special:${s.id}/${ep.episodeNo}`);
                }
            }
        }
        return caches.specialByScenario.get(chunk.scenario_id) ?? null;
    }
    return null;
}

async function runSearchText(query, opts) {
    const region = opts.region;
    const manifest = await fetchJsonWithFallback(
        [`${STORY_SEARCH_BASE}/manifest.json`],
        "story-search-manifest",
        "manifest",
        TTL_MANIFEST_MS,
        opts.noCache,
    );
    const serverEntry = manifest?.servers?.[region] ?? manifest?.[region];
    if (!serverEntry) throw new Error(`Story search corpus not available for region '${region}'.`);
    const chunkPath = serverEntry.chunks?.path ?? serverEntry.corpus?.path;
    const sha = serverEntry.chunks?.sha256 ?? serverEntry.version ?? chunkPath;
    if (!chunkPath) throw new Error(`No chunks path found in manifest for '${region}'.`);

    const corpusCacheFile = cacheFilePath("corpus-jsonl", `${region}:${sha}`, "jsonl");
    let rawText = null;
    const cachedBuf = await readCacheFile(corpusCacheFile, 0, opts.noCache);
    if (cachedBuf) {
        rawText = cachedBuf.toString("utf8");
    } else {
        const url = chunkPath.startsWith("http") ? chunkPath : `${STORY_SEARCH_BASE}/${chunkPath.replace(/^\/+/, "")}`;
        if (!opts.json) {
            process.stderr.write(`Downloading ${region} story corpus (${((serverEntry.chunks?.br_bytes ?? 0) / 1048576).toFixed(1)} MB Brotli, cached for future runs)...\n`);
        }
        const res = await fetch(url, { signal: AbortSignal.timeout(CORPUS_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        const compressed = Buffer.from(await res.arrayBuffer());
        const decompressed = brotliDecompressSync(compressed);
        rawText = decompressed.toString("utf8");
        await writeCacheFile(corpusCacheFile, decompressed);
    }

    const charIds = opts.char ? resolveCharacterIds(opts.char) : [];
    const kindFilter = opts.kind && opts.kind !== "all" ? (opts.kind === "area" ? "talk" : opts.kind) : null;
    const limit = opts.limit ?? 12;
    const re = opts.regex ? new RegExp(query, "i") : null;
    const needle = query.toLowerCase();

    const hits = [];
    const seenEpisodes = new Set();
    const lines = rawText.split("\n");
    const caches = {};
    let totalMatchingChunks = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        // Fast pre-check on raw JSON line before JSON.parse
        if (!re && needle && !line.toLowerCase().includes(needle)) continue;
        let chunk;
        try { chunk = JSON.parse(line); } catch { continue; }
        if (kindFilter && chunk.type !== kindFilter) continue;
        if (charIds.length > 0) {
            const cids = Array.isArray(chunk.char_ids) ? chunk.char_ids : [];
            if (!charIds.every(cid => cids.includes(cid))) continue;
        }
        const text = chunk.text ?? "";
        if (re) {
            if (!re.test(text)) continue;
        } else if (needle && !text.toLowerCase().includes(needle)) {
            continue;
        }
        totalMatchingChunks += 1;
        const epKey = `${chunk.type}|${chunk.story_id}|${chunk.ep}|${chunk.scenario_id}`;
        if (seenEpisodes.has(epKey)) continue;
        seenEpisodes.add(epKey);

        const selector = await resolveChunkToSelector(chunk, region, opts, caches);
        const dialogueLines = text.split("\n").filter(l => l.trim() && !l.startsWith("["));
        const matchedLines = dialogueLines.filter(l => (re ? re.test(l) : l.toLowerCase().includes(needle))).slice(0, 3);
        hits.push({
            selector: selector ?? `${chunk.type}:${chunk.scenario_id}`,
            type: chunk.type,
            story: chunk.story,
            ep: chunk.ep,
            scenarioId: chunk.scenario_id,
            lineRange: `${(chunk.line_start ?? 0) + 1}..${(chunk.line_end ?? 0) + 1}`,
            chars: chunk.chars ?? [],
            matchedLines: matchedLines.length > 0 ? matchedLines : dialogueLines.slice(0, 2),
        });
        if (hits.length >= limit) break;
    }

    return {
        region,
        query,
        totalMatchingChunks,
        returnedEpisodes: hits.length,
        hits,
    };
}

async function runInspectOne(selectorRaw, opts) {
    const parsed = parseSelector(selectorRaw);
    if (!parsed) {
        throw new Error(`Invalid selector '${selectorRaw}'. Examples: event:203/1, unit:light_sound/1, card:900/former, area:1/100, special:1/1`);
    }
    const region = opts.region;
    const target = await resolveSelectorTarget(parsed, region, opts);
    const [scenario, chara2dById, seIndex, bgmMeta, translationEpisode] = await Promise.all([
        target.scenarioPath
            ? fetchStorageJson(region, target.scenarioPath, opts, TTL_SCENARIO_MS)
            : fetchJsonWithFallback([target.scenarioUrl], "scenario-url", target.scenarioUrl, TTL_SCENARIO_MS, opts.noCache),
        loadCharacter2dMap(region, opts),
        loadSePackIndex(region, opts),
        loadBgmMetadata(region, opts),
        opts.translate && target.translationRef
            ? fetchTranslationEpisode(target.translationRef.kind, target.translationRef.fileId, target.translationRef.episodeKey, opts.translate, opts)
            : Promise.resolve(null),
    ]);

    return extractScenarioStudy(scenario, {
        region,
        line: opts.line,
        selector: target.selector,
        storyKind: target.storyKind,
        scenarioId: target.scenarioId,
        storyTitle: target.storyTitle,
        episodeTitle: target.episodeTitle,
        scenarioUrl: target.scenarioUrl,
        chara2dById,
        sePackByName: seIndex.byBare,
        bgmTitleByName: bgmMeta.byName,
        translationEpisode,
        maxExamples: opts.maxExamples ?? 2,
    });
}

async function runStudy(opts) {
    let selectors = [];
    if (opts.selectors) {
        selectors = opts.selectors.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    } else {
        const sampleCount = Math.min(8, Math.max(1, opts.sample ?? 3));
        const discovered = await discoverEpisodes({ ...opts, limit: sampleCount });
        selectors = discovered.map(d => d.selector);
    }
    if (selectors.length === 0) {
        throw new Error("No matching official episodes found to study. Try broadening --unit / --char / --query or specify --selectors.");
    }
    const capped = selectors.slice(0, 8);
    const reports = [];
    const errors = [];
    for (const sel of capped) {
        try {
            const rep = await runInspectOne(sel, { ...opts, maxExamples: 2 });
            reports.push(rep);
        } catch (err) {
            errors.push({ selector: sel, error: err instanceof Error ? err.message : String(err) });
        }
    }
    if (reports.length === 0) {
        throw new Error(`All episodes failed to load: ${errors.map(e => `${e.selector}: ${e.error}`).join("; ")}`);
    }
    let targetCharIds = opts.char ? resolveCharacterIds(opts.char) : [];
    if (targetCharIds.length === 0 && opts.unit) {
        const uk = resolveUnitKey(opts.unit);
        if (uk) {
            targetCharIds = CHARACTERS
                .filter(c => c.unit === uk || c.unit === "piapro")
                .map(c => c.id);
        }
    }
    const kit = aggregateStudyReports(reports, targetCharIds);
    return { region: opts.region, ...kit, errors };
}

async function runCatalog(subkind, arg, opts) {
    const region = opts.region;
    const limit = opts.limit ?? 40;
    const filterLower = (opts.filter || opts.query || "").trim().toLowerCase();

    if (subkind === "models") {
        const charIds = opts.char ? new Set(resolveCharacterIds(opts.char)) : null;
        let models = [];
        try {
            const idx = await fetchJsonWithFallback(
                [`${LIVE2D_INDEX_BASE}/${region}/models.json`],
                "live2d-index",
                region,
                TTL_MASTER_MS,
                opts.noCache,
            );
            models = (idx.models ?? []).map(m => ({ id: m.id, motion: m.motion ?? null }));
        } catch {
            // Fallback to live storage live2d/model/ directory listing
            const { directories } = await fetchDirectoryListing(region, "live2d/model/", opts);
            models = directories.map(id => ({ id, motion: inferMotionBundleCandidates(id)[0] ?? null }));
        }
        const filtered = models.filter(m => {
            if (opts.v2Only && !m.id.startsWith("v2_")) return false;
            if (charIds) {
                const match = /^(?:v2_)?(?:clb\d+_)?(\d{2})[a-z]+/.exec(m.id);
                const cid = match ? Number.parseInt(match[1], 10) : null;
                if (!cid || !charIds.has(cid)) return false;
            }
            if (filterLower && !m.id.toLowerCase().includes(filterLower)) return false;
            return true;
        });
        filtered.sort((a, b) => Number(b.id.startsWith("v2_")) - Number(a.id.startsWith("v2_")) || a.id.localeCompare(b.id));
        return { kind: "models", region, total: filtered.length, items: filtered.slice(0, limit) };
    }

    if (subkind === "clips") {
        const modelId = (arg || opts.model || "").trim();
        if (!modelId) throw new Error("Usage: catalog clips <modelId> [--type all|motion|facial] [--filter <text>]");
        const candidates = inferMotionBundleCandidates(modelId);
        let manifest = null;
        let matchedBundle = null;
        for (const bundle of candidates) {
            const url = `${RIPPER_LIBRARY_BASE}/${region}/library/${encodePath(bundle)}/_ripper.json`;
            try {
                manifest = await fetchJsonWithFallback([url], "ripper-motion", `${region}:${bundle}`, TTL_SCENARIO_MS, opts.noCache);
                matchedBundle = bundle;
                break;
            } catch {
                // try next candidate
            }
        }
        if (!manifest) {
            throw new Error(`Motion bundle _ripper.json not found for '${modelId}' (tried: ${candidates.join(", ")}).`);
        }
        const motions = [];
        const facials = [];
        for (const f of manifest.files ?? []) {
            const match = /^(motion|facial)\/(.+)\.sse-motion\.json$/.exec(String(f?.path ?? ""));
            if (!match) continue;
            if (filterLower && !match[2].toLowerCase().includes(filterLower)) continue;
            if (match[1] === "motion") motions.push(match[2]);
            else facials.push(match[2]);
        }
        motions.sort();
        facials.sort();
        const type = opts.type ?? "all";
        return {
            kind: "clips",
            region,
            modelId,
            motionBundle: matchedBundle,
            totalMotions: motions.length,
            totalFacials: facials.length,
            motions: type === "facial" ? [] : motions.slice(0, limit),
            facials: type === "motion" ? [] : facials.slice(0, limit),
        };
    }

    if (subkind === "bgm") {
        const { list } = await loadBgmMetadata(region, opts);
        const catLower = (opts.category ?? "").trim().toLowerCase();
        const filtered = list.filter(item => {
            if (catLower && !item.category.toLowerCase().includes(catLower)) return false;
            if (filterLower) {
                const hay = `${item.name} ${item.title} ${item.category}`.toLowerCase();
                if (!hay.includes(filterLower)) return false;
            }
            return true;
        });
        return { kind: "bgm", region, total: filtered.length, items: filtered.slice(0, limit) };
    }

    if (subkind === "bg") {
        const { directories } = await fetchDirectoryListing(region, "scenario/background/", opts);
        const filtered = directories
            .filter(id => id.startsWith("bg") && id !== "bg_a000000")
            .filter(id => opts.includeCg || !isStoryCgBackground(id))
            .filter(id => !filterLower || id.toLowerCase().includes(filterLower))
            .sort();
        return {
            kind: "bg",
            region,
            total: filtered.length,
            items: filtered.slice(0, limit).map(id => ({
                id,
                isCg: isStoryCgBackground(id),
                webp: storageUrl(region, `scenario/background/${id}/${id}.webp`, opts.line),
            })),
        };
    }

    if (subkind === "se") {
        const { allItems } = await loadSePackIndex(region, opts);
        const filtered = allItems
            .filter(item => !filterLower || item.path.toLowerCase().includes(filterLower))
            .sort((a, b) => a.label.localeCompare(b.label));
        return { kind: "se", region, total: filtered.length, items: filtered.slice(0, limit) };
    }

    if (subkind === "voices") {
        const scenarioId = (arg || opts.scenario || "").trim();
        const vkind = opts.kind ?? "story";
        const dirMap = {
            story: "sound/scenario/voice/",
            card: "sound/card_scenario/voice/",
            area: "sound/actionset/voice/",
            part: "sound/scenario/part_voice/",
        };
        const root = dirMap[vkind];
        if (!root) throw new Error(`Invalid voice --kind '${vkind}' (story|card|area|part).`);
        if (!scenarioId) {
            const { directories } = await fetchDirectoryListing(region, root, opts);
            const filtered = directories.filter(d => !filterLower || d.toLowerCase().includes(filterLower)).sort();
            return { kind: "voices-scenarios", region, voiceKind: vkind, total: filtered.length, items: filtered.slice(0, limit) };
        }
        const { files } = await fetchDirectoryListing(region, `${root}${encodeURIComponent(scenarioId)}/`, opts);
        const clips = files.map(f => f.replace(AUDIO_EXT_RE, "")).filter(c => !filterLower || c.toLowerCase().includes(filterLower)).sort();
        return {
            kind: "voices",
            region,
            voiceKind: vkind,
            scenarioId,
            total: clips.length,
            items: clips.slice(0, limit).map(v => `voice(${vkind}:${scenarioId}:${v}@${region})`),
        };
    }

    throw new Error(`Unknown catalog subkind '${subkind ?? ""}' (expected models|clips|bgm|bg|se|voices).`);
}

// ==================== Human / Agent-Friendly Printing ====================

function printList(items, opts) {
    console.log(`=== Official Episodes (kind=${opts.kind ?? "event"}, region=${opts.region}, shown=${items.length}) ===`);
    if (items.length === 0) {
        console.log("  (no matches)");
        return;
    }
    for (const it of items) {
        const metaParts = [];
        if (it.unit) metaParts.push(`unit=${it.unit}`);
        if (it.bannerChar) metaParts.push(`banner=${it.bannerChar}`);
        if (it.char) metaParts.push(`char=${it.char}`);
        if (it.chars?.length) metaParts.push(`chars=${it.chars.join(",")}`);
        if (it.episodeCount) metaParts.push(`${it.episodeCount} eps`);
        console.log(`  ${it.selector.padEnd(24)} | ${it.title}${metaParts.length ? ` (${metaParts.join(", ")})` : ""}`);
        if (it.outline) console.log(`      ${it.outline}`);
    }
    console.log(`\nNext step: node scripts/official-story.mjs inspect <selector> --region ${opts.region}`);
}

function printSearchText(result) {
    console.log(`=== Story Text Search (region=${result.region}, query="${result.query}", matchedChunks=${result.totalMatchingChunks}, shown=${result.returnedEpisodes}) ===`);
    if (result.hits.length === 0) {
        console.log("  (no matches)");
        return;
    }
    for (const h of result.hits) {
        console.log(`  ${h.selector} | ${h.story} (ep ${h.ep}, lines ${h.lineRange}) [${h.chars.slice(0, 5).join(", ")}]`);
        for (const l of h.matchedLines) {
            console.log(`      ${truncate(l, 110)}`);
        }
    }
    console.log(`\nNext step: node scripts/official-story.mjs inspect <selector> --region ${result.region} --timeline`);
}

function parseLineRange(raw) {
    if (!raw) return null;
    const m = /^(\d+)?\.\.(\d+)?$/.exec(String(raw).trim());
    if (!m) {
        const single = Number.parseInt(raw, 10);
        if (Number.isInteger(single) && single > 0) return [single, single + 20];
        throw new Error(`Invalid --lines '${raw}' (expected start..end, e.g. 1..25)`);
    }
    return [m[1] ? Number.parseInt(m[1], 10) : 1, m[2] ? Number.parseInt(m[2], 10) : Number.MAX_SAFE_INTEGER];
}

function printInspect(rep, opts) {
    const m = rep.meta;
    console.log(`=== Official Scenario Study: ${m.selector} (region=${m.region}) ===`);
    console.log(`Title: ${m.storyTitle}${m.episodeTitle ? ` — ${m.episodeTitle}` : ""}`);
    console.log(`Scenario: ${m.scenarioId} (${m.talkCount} talk lines, ${m.snippetCount} snippets)`);
    console.log(`JSON URL: ${m.scenarioUrl}`);

    console.log(`\n[Cast & Live2D Models (${rep.cast.length})]`);
    for (const c of rep.cast) {
        const charTag = c.charId ? ` char=${c.charId}` : "";
        console.log(`  @cast ${c.shortKey} "${c.name}" model="${c.modelId}"${charTag}${c.motionBundle ? `  # motionBundle=${c.motionBundle}` : ""}`);
    }

    console.log(`\n[Backgrounds (${rep.backgrounds.length})]`);
    for (const bg of rep.backgrounds) {
        const tags = [];
        if (bg.isCg) tags.push("STORY-CG");
        if (bg.places.length > 0) tags.push(`place: ${bg.places.join(" / ")}`);
        console.log(`  - ${bg.id} (x${bg.count}, line ${bg.firstTalkLine})${tags.length ? ` [${tags.join("; ")}]` : ""}`);
        console.log(`    webp: ${bg.webp}`);
    }

    console.log(`\n[BGM (${rep.bgm.length})]`);
    for (const b of rep.bgm) {
        const title = b.title ? ` "${b.title}"${b.category ? ` (${b.category})` : ""}` : "";
        console.log(`  - ${b.name}${title} (x${b.count}, line ${b.firstTalkLine})`);
        if (b.sampleContext) console.log(`    context: ${b.sampleContext}`);
    }

    console.log(`\n[SE (${rep.se.length})]`);
    for (const s of rep.se) {
        console.log(`  - ${s.path} (x${s.count})`);
        for (const ex of s.examples) {
            const parts = [];
            if (ex.before) parts.push(`before: ${ex.before}`);
            if (ex.after) parts.push(`after: ${ex.after}`);
            if (parts.length) console.log(`    line ${ex.talkLine}: ${parts.join(" -> ")}`);
        }
    }

    console.log(`\n[Per-Character Authentic Motions & Facials (${rep.characterClips.length} actor(s))]`);
    for (const cc of rep.characterClips) {
        console.log(`  * ${cc.shortKey} (${cc.modelId || "no-model"}):`);
        for (const p of cc.pairs.slice(0, 12)) {
            const parts = [];
            if (p.motion) parts.push(`motion="${p.motion}"`);
            if (p.facial) parts.push(`facial="${p.facial}"`);
            const ex = p.examples[0] ? `  e.g. ${p.examples[0]}` : "";
            console.log(`      ${parts.join(" ")} (x${p.count})${ex}`);
        }
        if (cc.pairs.length > 12) console.log(`      ... (+${cc.pairs.length - 12} more pairs; use --json for all)`);
    }

    if (rep.voices.length > 0) {
        console.log(`\n[Sample .msk Voice Refs (${rep.voices.length} shown)]`);
        for (const v of rep.voices.slice(0, 6)) {
            console.log(`  - ${v.ref}  # ${v.speaker}: "${v.text}"`);
        }
    }

    const fx = rep.effects;
    const transStr = Object.entries(fx.transitions).map(([k, v]) => `${k}x${v}`).join(", ");
    console.log(
        `\n[Directing Summary] enters=${fx.enterCount}, moves=${fx.moveCount}, exits=${fx.exitCount}, `
        + `coStarReacts=${fx.coStarReactionCount}, shakes=${fx.shakes}, flashes=${fx.flashes}`
        + (transStr ? `, transitions=[${transStr}]` : ""),
    );

    if (opts.timeline || opts.lines) {
        const range = parseLineRange(opts.lines);
        const startLine = range ? range[0] : 0;
        const endLine = range ? range[1] : Number.MAX_SAFE_INTEGER;
        console.log(`\n[Stageplay Timeline${range ? ` (talk lines ${startLine}..${endLine})` : ""}]`);
        for (const ev of rep.timeline) {
            if (ev.talkLine < startLine || ev.talkLine > endLine) continue;
            const ln = String(ev.talkLine).padStart(3, " ");
            if (ev.kind === "bg") console.log(`  L${ln} [BG] ${ev.bg}`);
            else if (ev.kind === "place") console.log(`  L${ln} [PLACE] "${ev.text}"`);
            else if (ev.kind === "telop") console.log(`  L${ln} [TELOP] "${ev.text}"`);
            else if (ev.kind === "bgm") console.log(`  L${ln} [BGM] ${ev.bgm}`);
            else if (ev.kind === "se") console.log(`  L${ln} [SE] ${ev.se}`);
            else if (ev.kind === "fx") console.log(`  L${ln} [FX] ${ev.fx}${ev.duration ? ` (${ev.duration}s)` : ""}`);
            else if (ev.kind === "enter") console.log(`  L${ln} [ENTER] ${ev.actor} at ${ev.slot}${ev.modelId ? ` (${ev.modelId})` : ""}${ev.motion ? ` motion="${ev.motion}"` : ""}${ev.facial ? ` facial="${ev.facial}"` : ""}`);
            else if (ev.kind === "move") console.log(`  L${ln} [MOVE] ${ev.actor} -> ${ev.slot}${ev.motion ? ` motion="${ev.motion}"` : ""}${ev.facial ? ` facial="${ev.facial}"` : ""}`);
            else if (ev.kind === "exit") console.log(`  L${ln} [EXIT] ${ev.actor}`);
            else if (ev.kind === "pose") console.log(`  L${ln} [POSE] ${ev.actor}${ev.motion ? ` motion="${ev.motion}"` : ""}${ev.facial ? ` facial="${ev.facial}"` : ""}`);
            else if (ev.kind === "talk") {
                const extras = [];
                if (ev.motion) extras.push(`motion="${ev.motion}"`);
                if (ev.facial) extras.push(`facial="${ev.facial}"`);
                for (const r of ev.reactions ?? []) {
                    const rp = [r.motion ? `motion="${r.motion}"` : "", r.facial ? `facial="${r.facial}"` : ""].filter(Boolean).join(" ");
                    extras.push(`react(${r.actor}${rp ? ` ${rp}` : ""})`);
                }
                console.log(`  L${ln} [TALK] ${ev.speaker || ev.actor || "Narration"}: ${ev.body}${extras.length ? `  | ${extras.join(" ")}` : ""}`);
            }
        }
    }
}

function printStudy(kit) {
    console.log(`=== Official Story Authoring Kit (region=${kit.region}, sampled=${kit.sources.length} episode(s)) ===`);
    console.log("Sources:");
    for (const s of kit.sources) {
        console.log(`  - ${s.selector}: ${s.storyTitle} — ${s.episodeTitle} (${s.talkCount} lines)`);
    }
    if (kit.errors?.length) {
        console.log("Skipped:");
        for (const e of kit.errors) console.log(`  - ${e.selector}: ${e.error}`);
    }

    console.log(`\n[Recommended @cast Directives (top verified models)]`);
    for (const c of kit.recommendedCast.slice(0, 12)) {
        const charTag = c.charId ? ` char=${c.charId}` : "";
        console.log(`  @cast ${c.shortKey} "${c.name}" model="${c.modelId}"${charTag}  # seen in ${c.count} ep(s)`);
    }

    console.log(`\n[Top Backgrounds (${kit.backgrounds.length})]`);
    for (const bg of kit.backgrounds.slice(0, 12)) {
        const place = bg.places.length ? ` | place: ${bg.places.join(" / ")}` : "";
        const cg = bg.isCg ? " [STORY-CG]" : "";
        console.log(`  - ${bg.id} (x${bg.count})${cg}${place}`);
        console.log(`    webp: ${bg.webp}`);
    }

    console.log(`\n[Top BGM Tracks (${kit.bgm.length})]`);
    for (const b of kit.bgm.slice(0, 12)) {
        const title = b.title ? ` "${b.title}"${b.category ? ` (${b.category})` : ""}` : "";
        console.log(`  - ${b.name}${title} (x${b.count})`);
    }

    console.log(`\n[Top SE Clips (${kit.se.length}, pack-qualified for .msk)]`);
    for (const s of kit.se.slice(0, 14)) {
        const ex = s.examples[0];
        const ctx = ex ? `  | ${[ex.before, ex.after].filter(Boolean).join(" -> ")}` : "";
        console.log(`  - ${s.path} (x${s.count})${ctx}`);
    }

    console.log(`\n[Top Authentic (motion, facial) Palettes per Character]`);
    for (const cc of kit.characterClips) {
        console.log(`  * ${cc.shortKey} (models: ${cc.models.slice(0, 3).join(", ")}):`);
        for (const p of cc.pairs.slice(0, 8)) {
            const parts = [];
            if (p.motion) parts.push(`motion="${p.motion}"`);
            if (p.facial) parts.push(`facial="${p.facial}"`);
            const ex = p.examples[0] ? `  e.g. ${p.examples[0]}` : "";
            console.log(`      ${parts.join(" ")} (x${p.count})${ex}`);
        }
    }
}

function printCatalog(res) {
    if (res.kind === "models") {
        console.log(`=== Live2D Models (region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const m of res.items) {
            console.log(`  - ${m.id}${m.motion ? `  (${m.motion})` : ""}`);
        }
        return;
    }
    if (res.kind === "clips") {
        console.log(`=== Live2D Clips for ${res.modelId} (region=${res.region}, bundle=${res.motionBundle}) ===`);
        if (res.motions.length > 0) {
            console.log(`Motions (${res.motions.length}/${res.totalMotions}):`);
            console.log(`  ${res.motions.join(", ")}`);
        }
        if (res.facials.length > 0) {
            console.log(`Facials (${res.facials.length}/${res.totalFacials}):`);
            console.log(`  ${res.facials.join(", ")}`);
        }
        return;
    }
    if (res.kind === "bgm") {
        console.log(`=== BGM Catalog (region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const b of res.items) {
            console.log(`  - ${b.name.padEnd(26)} | ${b.title}${b.category ? ` [${b.category}]` : ""}`);
        }
        return;
    }
    if (res.kind === "bg") {
        console.log(`=== Backgrounds (region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const b of res.items) {
            console.log(`  - ${b.id}${b.isCg ? " [CG]" : ""}  ${b.webp}`);
        }
        return;
    }
    if (res.kind === "se") {
        console.log(`=== SE Clips (region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const s of res.items) {
            console.log(`  - ${s.path}`);
        }
        return;
    }
    if (res.kind === "voices-scenarios") {
        console.log(`=== Voice Scenario Dirs (kind=${res.voiceKind}, region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const d of res.items) console.log(`  - ${d}`);
        return;
    }
    if (res.kind === "voices") {
        console.log(`=== Voice Clips (kind=${res.voiceKind}, scenario=${res.scenarioId}, region=${res.region}, total=${res.total}, shown=${res.items.length}) ===`);
        for (const v of res.items) console.log(`  - ${v}`);
    }
}

// ==================== CLI Argument Parsing & Main ====================

const HELP_TEXT = `MoeSekai Official Story & Asset Inspector CLI (zero-dependency Node 18+)

Usage:
  node scripts/official-story.mjs <command> [args] [options]

Commands:
  list [options]
      Discover official episodes from masterdata (fast, no heavy corpus download).
      --kind <event|unit|card|area|special>   Story type (default: event)
      --unit <ln|mmj|vbs|ws|25ji|vs>          Filter by unit (events default to unit-focus; add --include-mixed for crossovers)
      --include-mixed                         Include mixed-unit crossover events when filtering by --unit
      --char <id|name,...>                    Filter by character(s), e.g. 17,18 or kanade,mafuyu or 奏,真冬
      --query <text>                          Substring filter on title/outline/episode
      --oldest                                Sort oldest-first (default: newest-first for modern v2_ assets)
      --limit <n>                             Max results (default: 15)

  search-text "<query>" [options]
      Full-text search across all official dialogue chunks (uses Moesekai's Brotli story-search corpus).
      --region <jp|cn|tw|kr|en>               Server language to search (default: jp; use cn for Chinese, en for English)
      --kind <all|event|unit|card|talk|self|special>
      --char <id|name,...>                    Filter chunks containing these character(s)
      --regex                                 Treat query as regular expression
      --limit <n>                             Max distinct episodes returned (default: 12)

  inspect <selector|url> [options]
      Extract verified L2D models, (motion, facial) palettes, BGs, BGMs (with titles), pack-qualified SEs
      (with surrounding dialogue context), voices, and directing timeline from an official episode.
      Selectors: event:203/1 | unit:light_sound/1 | card:900/former | area:1/100 | talk:100 | special:1/1
      --translate <zh-CN|en-US>               Overlay translation when inspecting a JP event/card/area
      --timeline                              Print beat-by-beat stageplay timeline
      --lines <start..end>                    Slice timeline to talk line range (e.g. 1..25)

  study [options]
      Mine & aggregate a ready-to-use .msk Authoring Asset Kit across multiple official episodes at once!
      --selectors <sel1,sel2,...>             Explicit comma-separated episode selectors
      OR discovery filters: --kind, --unit, --char, --query, --sample <1..8> (default: 3)

  catalog <models|clips|bgm|bg|se|voices> [arg] [options]
      Browse live Moesekai asset catalogs directly:
      catalog models [--char ...] [--query ...] [--v2-only]
      catalog clips <modelId> [--type all|motion|facial] [--filter <text>]
      catalog bgm [--query <text>] [--category <text>]
      catalog bg [--filter <text>] [--include-cg]
      catalog se [--query <text>]
      catalog voices [scenarioId] [--kind story|card|area|part] [--filter <text>]

Global Options:
  --region <jp|cn|tw|kr|en>    Game server region (default: jp)
  --line <main|backup>         CDN line (default: main -> pjsk.moe, auto-fallback to exmeaning.com)
  --json                       Emit machine-readable JSON
  --no-cache                   Bypass local OS temp cache (${CACHE_DIR})
  -h, --help                   Show this help
`;

function parseCliArgs(argv) {
    const positionals = [];
    const opts = {
        region: "jp",
        line: "main",
        json: false,
        noCache: false,
        help: false,
    };

    const valueFlags = new Set([
        "--region", "--line", "--kind", "--unit", "--char", "--query", "--filter",
        "--limit", "--sample", "--selectors", "--translate", "--lines", "--type",
        "--category", "--model", "--scenario", "--max-examples",
    ]);

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            opts.help = true;
        } else if (arg === "--json") {
            opts.json = true;
        } else if (arg === "--no-cache") {
            opts.noCache = true;
        } else if (arg === "--oldest") {
            opts.oldest = true;
        } else if (arg === "--latest") {
            opts.oldest = false;
            const next = argv[i + 1];
            if (next && /^\d+$/.test(next)) {
                const n = Number.parseInt(argv[++i], 10);
                opts.limit = n;
                opts.sample = n;
            }
        } else if (arg === "--regex") {
            opts.regex = true;
        } else if (arg === "--timeline") {
            opts.timeline = true;
        } else if (arg === "--v2-only") {
            opts.v2Only = true;
        } else if (arg === "--include-cg") {
            opts.includeCg = true;
        } else if (arg === "--include-mixed") {
            opts.includeMixed = true;
        } else if (valueFlags.has(arg)) {
            const val = argv[++i];
            if (val === undefined) throw new Error(`Missing value for ${arg}`);
            const key = arg.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            if (key === "limit" || key === "sample" || key === "maxExamples") {
                const n = Number.parseInt(val, 10);
                if (!Number.isInteger(n) || n < 1 || n > 500) {
                    throw new Error(`Invalid ${arg} '${val}' (expected integer 1..500)`);
                }
                opts[key] = n;
            } else {
                opts[key] = val;
            }
        } else if (arg.startsWith("-")) {
            throw new Error(`Unknown option '${arg}'`);
        } else {
            positionals.push(arg);
        }
    }

    if (!REGIONS.includes(opts.region)) {
        throw new Error(`Invalid --region '${opts.region}' (expected ${REGIONS.join("|")})`);
    }
    if (opts.line !== "main" && opts.line !== "backup") {
        throw new Error(`Invalid --line '${opts.line}' (expected main|backup)`);
    }

    return { command: positionals[0] ?? null, args: positionals.slice(1), opts };
}

async function main() {
    let parsed;
    try {
        parsed = parseCliArgs(process.argv.slice(2));
    } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        console.error(HELP_TEXT);
        process.exit(2);
    }

    const { command, args, opts } = parsed;
    if (opts.help || !command) {
        console.log(HELP_TEXT);
        process.exit(opts.help ? 0 : 2);
    }

    try {
        if (command === "list") {
            const items = await discoverEpisodes(opts);
            if (opts.json) console.log(JSON.stringify(items, null, 2));
            else printList(items, opts);
        } else if (command === "search-text") {
            const query = args.join(" ").trim() || (opts.query ?? "").trim();
            if (!query) throw new Error("Usage: search-text \"<query>\" [--region jp|cn|en] [--char ...] [--kind ...]");
            const result = await runSearchText(query, opts);
            if (opts.json) console.log(JSON.stringify(result, null, 2));
            else printSearchText(result);
        } else if (command === "inspect") {
            const selector = args[0];
            if (!selector) throw new Error("Usage: inspect <selector|url> [--region jp|cn|en] [--timeline] [--lines 1..25]");
            const rep = await runInspectOne(selector, opts);
            if (opts.json) console.log(JSON.stringify(rep, null, 2));
            else printInspect(rep, opts);
        } else if (command === "study") {
            const kit = await runStudy(opts);
            if (opts.json) console.log(JSON.stringify(kit, null, 2));
            else printStudy(kit);
        } else if (command === "catalog") {
            const subkind = args[0];
            const res = await runCatalog(subkind, args[1], opts);
            if (opts.json) console.log(JSON.stringify(res, null, 2));
            else printCatalog(res);
        } else {
            throw new Error(`Unknown command '${command}'. Run with --help to see available commands.`);
        }
    } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}

function isDirectExecution() {
    if (!process.argv[1]) return false;
    try {
        return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
    } catch {
        return false;
    }
}

if (isDirectExecution()) {
    main();
}
