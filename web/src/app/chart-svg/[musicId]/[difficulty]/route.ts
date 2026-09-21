import { NextRequest } from "next/server";
import { parseSusText } from "@/vendor/sekai-sus2img/parser";
import { renderScoreToSvg } from "@/vendor/sekai-sus2img/renderer";

export const dynamic = "force-dynamic";

const VALID_DIFFICULTIES = new Set(["easy", "normal", "hard", "expert", "master", "append"]);

// Primary path: render the chart ourselves from the SUS score text (ported from
// Uni-PJSK-Viewer-Frontend's sekai-sus2img pipeline, see src/vendor/sekai-sus2img).
const SUS_ASSET_BASES = [
    "https://storage.exmeaning.com/sekai-jp-assets",
    "https://storage.pjsk.moe/sekai-jp-assets",
];
const MASTER_DATA_BASES = [
    "https://metadata.exmeaning.com/jp/master",
    "https://metadata.pjsk.moe/jp/master",
];
// Note sprites are vendored into web/public so rendering has no upstream dependency.
const LOCAL_NOTE_HOST = "/notes_new/custom01";

// Fallback path: proxy upstream's pre-rendered static SVGs (kept for songs whose
// SUS is unavailable from our asset mirrors).
const UPSTREAM_CHART_BASE = "https://charts-new.unipjsk.com/moe/svg";
const ABSOLUTE_NOTES_BASE = "https://charts-new.unipjsk.com/moe/notes_new/";

const SVG_RESPONSE_HEADERS = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

/**
 * Normalizes upstream chart SVG (fallback path only) to fix asset reference and SVG spec issues:
 * 1. Rewrites relative note sprite paths (e.g. `../../notes_new/`) to absolute CDN URLs
 *    at `https://charts-new.unipjsk.com/moe/notes_new/`.
 * 2. Normalizes negative width/height attributes in clipPath rects which violate the SVG spec.
 * 3. Adds preserveAspectRatio="none" to the stretched note-middle sprite images: without it,
 *    the default xMidYMid meet scaling shrinks the middle slice to ~1x inside its huge
 *    (e.g. 141600-unit-wide) viewport, pushing it outside the clip window so every note
 *    renders as two bare end caps.
 */
function normalizeChartSvg(rawSvg: string): string {
    let svg = rawSvg;

    // Fix relative notes_new paths
    svg = svg.replaceAll("../../notes_new/", ABSOLUTE_NOTES_BASE);
    svg = svg.replaceAll("../notes_new/", ABSOLUTE_NOTES_BASE);
    svg = svg.replaceAll('href="/notes_new/', `href="${ABSOLUTE_NOTES_BASE}`);
    svg = svg.replaceAll('xlink:href="/notes_new/', `xlink:href="${ABSOLUTE_NOTES_BASE}`);

    // Fix invalid negative width or height values in rect elements (e.g. width="-3.1428571428571423")
    svg = svg.replace(/\bwidth="-\d+(?:\.\d+)?"/g, 'width="0"');
    svg = svg.replace(/\bheight="-\d+(?:\.\d+)?"/g, 'height="0"');

    // Fix note middle slices being scaled out of view (upstream's client-side renderer
    // emits preserveAspectRatio="none" here; the static SVGs predate that fix)
    svg = svg.replace(
        /(<symbol id="notes-\d+-middle"[^>]*><image )(?!preserveAspectRatio)/g,
        '$1preserveAspectRatio="none" '
    );

    return svg;
}

const DIFFICULTY_LABELS: Record<string, string> = {
    easy: "EASY",
    normal: "NORMAL",
    hard: "HARD",
    expert: "EXPERT",
    master: "MASTER",
    append: "APPEND",
};

interface MusicMasterRow {
    id: number;
    title: string;
    composer: string;
    assetbundleName: string;
}

interface MusicDifficultyRow {
    musicId: number;
    musicDifficulty: string;
    playLevel: number;
}

interface MusicMeta {
    title: string;
    composer: string;
    jacketUrl: string;
    playLevel: number | null;
}

interface MusicMetaTables {
    fetchedAt: number;
    musics: Map<number, MusicMasterRow>;
    playLevels: Map<string, number>;
}

// Music master data is a few MB per file, so keep a module-level cache instead of
// re-downloading on every chart request. Refreshed at most once per TTL.
const MUSIC_META_TTL_MS = 6 * 60 * 60 * 1000;
let musicMetaCache: MusicMetaTables | null = null;
let musicMetaPromise: Promise<MusicMetaTables> | null = null;

async function fetchMasterJson<T>(path: string): Promise<T> {
    let lastError: unknown = null;
    for (const base of MASTER_DATA_BASES) {
        try {
            const res = await fetch(`${base}/${path}`, {
                headers: { "User-Agent": "Mozilla/5.0 (Moesekai Chart Renderer)" },
            });
            if (res.ok) {
                return (await res.json()) as T;
            }
            lastError = new Error(`${base}/${path}: HTTP ${res.status}`);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${path}`);
}

async function loadMusicMetaTables(): Promise<MusicMetaTables> {
    if (musicMetaCache && Date.now() - musicMetaCache.fetchedAt < MUSIC_META_TTL_MS) {
        return musicMetaCache;
    }
    if (!musicMetaPromise) {
        musicMetaPromise = (async () => {
            const [musics, difficulties] = await Promise.all([
                fetchMasterJson<MusicMasterRow[]>("musics.json"),
                fetchMasterJson<MusicDifficultyRow[]>("musicDifficulties.json"),
            ]);
            const cache = {
                fetchedAt: Date.now(),
                musics: new Map(musics.map((row) => [row.id, row])),
                playLevels: new Map(
                    difficulties.map((row) => [`${row.musicId}:${row.musicDifficulty}`, row.playLevel])
                ),
            };
            musicMetaCache = cache;
            return cache;
        })().finally(() => {
            musicMetaPromise = null;
        });
    }
    return musicMetaPromise;
}

async function getMusicMeta(musicId: number, difficulty: string): Promise<MusicMeta | null> {
    try {
        const tables = await loadMusicMetaTables();
        const music = tables.musics.get(musicId);
        if (!music) {
            return null;
        }
        return {
            title: music.title,
            composer: music.composer,
            jacketUrl: `${SUS_ASSET_BASES[0]}/music/jacket/${music.assetbundleName}/${music.assetbundleName}.webp`,
            playLevel: tables.playLevels.get(`${musicId}:${difficulty}`) ?? null,
        };
    } catch {
        // Meta is cosmetic (title/jacket/level in the footer) — never fail the render for it.
        return null;
    }
}

async function fetchSusText(musicId: number, difficulty: string): Promise<string> {
    const paddedId = String(musicId).padStart(4, "0");
    let lastError: unknown = null;
    for (const base of SUS_ASSET_BASES) {
        try {
            const res = await fetch(`${base}/music/music_score/${paddedId}_01/${difficulty}.txt`, {
                headers: { "User-Agent": "Mozilla/5.0 (Moesekai Chart Renderer)" },
            });
            if (res.ok) {
                return await res.text();
            }
            lastError = new Error(`SUS fetch failed: HTTP ${res.status}`);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error("SUS fetch failed");
}

/**
 * Renders the chart SVG server-side from the SUS score text, mirroring upstream's
 * client-side pipeline (SUS -> Score -> SVG) with the same visual parameters
 * (noteSize 18, 240px per second).
 */
async function renderChartSvg(musicId: number, difficulty: string): Promise<string> {
    const [susText, meta] = await Promise.all([
        fetchSusText(musicId, difficulty),
        getMusicMeta(musicId, difficulty),
    ]);

    const score = parseSusText(susText);
    score.meta.title = meta?.title || `#${musicId}`;
    score.meta.artist = meta?.composer || null;
    score.meta.difficulty = DIFFICULTY_LABELS[difficulty] ?? difficulty.toUpperCase();
    score.meta.playlevel = meta?.playLevel != null ? String(meta.playLevel) : null;
    score.meta.jacket = meta?.jacketUrl || null;

    return renderScoreToSvg(score, {
        noteHost: LOCAL_NOTE_HOST,
        noteSize: 18,
        timeHeight: 240,
    }).svg;
}

async function proxyUpstreamChartSvg(musicId: number, difficulty: string): Promise<Response> {
    const upstreamUrl = `${UPSTREAM_CHART_BASE}/${musicId}/${difficulty}.svg`;

    const upstreamRes = await fetch(upstreamUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Moesekai Chart Proxy)",
            Accept: "image/svg+xml,*/*",
        },
        next: { revalidate: 86400 },
    });

    if (!upstreamRes.ok) {
        return new Response(`Upstream error: ${upstreamRes.statusText}`, {
            status: upstreamRes.status,
            headers: {
                "Cache-Control": "no-store",
            },
        });
    }

    const fixedSvg = normalizeChartSvg(await upstreamRes.text());
    return new Response(fixedSvg, { status: 200, headers: SVG_RESPONSE_HEADERS });
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ musicId: string; difficulty: string }> }
) {
    const { musicId: rawMusicId, difficulty: rawDifficulty } = await context.params;

    // Handle optional trailing .svg in difficulty param (e.g. master.svg -> master)
    const difficultyClean = rawDifficulty.replace(/\.svg$/i, "").toLowerCase();
    const musicIdNum = parseInt(rawMusicId, 10);

    if (isNaN(musicIdNum) || musicIdNum <= 0 || !VALID_DIFFICULTIES.has(difficultyClean)) {
        return new Response("Invalid music ID or difficulty", { status: 400 });
    }

    try {
        const svg = await renderChartSvg(musicIdNum, difficultyClean);
        return new Response(svg, { status: 200, headers: SVG_RESPONSE_HEADERS });
    } catch {
        // Self-render failed (SUS missing or unparseable) — fall back to upstream static SVGs.
    }

    try {
        return await proxyUpstreamChartSvg(musicIdNum, difficultyClean);
    } catch (error) {
        return new Response(`Failed to fetch chart: ${error instanceof Error ? error.message : "Unknown error"}`, {
            status: 502,
            headers: {
                "Cache-Control": "no-store",
            },
        });
    }
}
