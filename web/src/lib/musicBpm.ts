/**
 * Music BPM Data Fetching
 *
 * Fetches per-song BPM data (main BPM + BPM segments with durations) from the
 * MoeSekai-Hub static deployment.
 * Source: https://moe.exmeaning.com/data/music_bpm/music_bpms.json
 */

import { fetchWithCompression } from "./fetch";
import { MOE_MUSIC_BPM_URL } from "./assets";

/**
 * Single BPM segment (a continuous stretch of the song at the same BPM)
 */
export interface MusicBpmSegment {
    bpm: number;
    start_bar: number;
    end_bar: number;
    duration_sec: number;
}

/**
 * Single music entry from the BPM database
 */
export interface MusicBpmEntry {
    music_id: number;
    title: string;
    source: string;
    prefix?: string;
    /** Main / representative BPM */
    bpm?: number;
    /** All BPM values appearing in the song (may contain duplicates) */
    bpms?: number[];
    bpm_count?: number;
    bpm_segments?: MusicBpmSegment[];
}

/**
 * Full BPM data structure
 */
export interface MusicBpmData {
    generated_at: string;
    songs: MusicBpmEntry[];
}

// Module-level cache for BPM data (Map<musicId, entry>)
let cachedBpmMap: Map<number, MusicBpmEntry> | null = null;

/**
 * Fetch music BPM data from the CDN
 * Results are cached in memory for the session
 *
 * @returns Map of musicId -> BPM entry
 */
export async function fetchMusicBpmMap(): Promise<Map<number, MusicBpmEntry>> {
    // Return cached data if available
    if (cachedBpmMap) {
        return cachedBpmMap;
    }

    try {
        const response = await fetchWithCompression(MOE_MUSIC_BPM_URL);
        if (!response.ok) {
            console.warn(`[MusicBpm] Failed to fetch: HTTP ${response.status}`);
            return new Map();
        }

        const data: MusicBpmData = await response.json();

        // Build the map
        const map = new Map<number, MusicBpmEntry>();
        for (const song of data.songs) {
            map.set(song.music_id, song);
        }

        // Cache the result
        cachedBpmMap = map;
        console.log(`[MusicBpm] Loaded ${map.size} music BPM entries`);

        return map;
    } catch (error) {
        console.warn("[MusicBpm] Error fetching BPM data:", error);
        return new Map();
    }
}

/**
 * Get BPM entry for a specific music ID
 * Returns null if not found
 */
export function getMusicBpm(musicId: number, bpmMap: Map<number, MusicBpmEntry>): MusicBpmEntry | null {
    const entry = bpmMap.get(musicId);
    if (!entry || entry.bpm == null || !Number.isFinite(entry.bpm)) {
        return null;
    }
    return entry;
}

/**
 * Format a BPM value for display (integers without decimals, floats with 1 decimal)
 */
export function formatBpmValue(bpm?: number | null): string {
    if (bpm == null || !Number.isFinite(bpm)) return "";
    return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
}

/**
 * Format a bar number (start_bar / end_bar) for display.
 * Integers are shown as-is; floats are trimmed to at most 2 decimals.
 */
export function formatBarValue(bar?: number | null): string {
    if (bar == null || !Number.isFinite(bar)) return "";
    if (Number.isInteger(bar)) return String(bar);
    return bar.toFixed(2).replace(/\.?0+$/, "");
}