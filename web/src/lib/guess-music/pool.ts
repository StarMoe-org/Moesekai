import type { IMusicInfo, IMusicVocalInfo } from "@/types/music";

/**
 * The song pool: every released song with at least one playable vocal, medleys
 * excepted. Streaming-live recordings (and any vocal type the game adds later)
 * stay out: they are concert takes, not the song as the game ships it.
 */

const PLAYABLE_VOCAL_TYPES: ReadonlySet<string> = new Set([
    "sekai",
    "virtual_singer",
    "original_song",
    "another_vocal",
    "instrumental",
]);

export function isPlayableVocalType(type: string): boolean {
    return PLAYABLE_VOCAL_TYPES.has(type) || type.startsWith("april_fool");
}

/** Inst.ver. tracks have no lyrics: there are no vocals to remove. */
export function vocalHasLyrics(vocal: Pick<IMusicVocalInfo, "musicVocalType">): boolean {
    return vocal.musicVocalType !== "instrumental";
}

/**
 * Medleys of other songs (music 674-676 on JP, the "MASTER" and anniversary
 * medleys) credit no composer, lyricist or arranger. A clip of one is a clip
 * of some other song, so they are never questions or answers. The title is no
 * guide: music 380 has "medley" in its name and is an ordinary song.
 */
export function isMedley(music: Pick<IMusicInfo, "composer" | "lyricist" | "arranger">): boolean {
    return [music.composer, music.lyricist, music.arranger].every((credit) => {
        const trimmed = (credit ?? "").trim();
        return trimmed === "-" || trimmed === "－";
    });
}

export interface PoolSong {
    music: IMusicInfo;
    /** Playable vocals, by seq then id. */
    vocals: IMusicVocalInfo[];
}

export function buildSongPool(
    musics: readonly IMusicInfo[],
    vocals: readonly IMusicVocalInfo[],
    now: number = Date.now(),
): PoolSong[] {
    const byMusic = new Map<number, IMusicVocalInfo[]>();
    for (const vocal of vocals) {
        if (!vocal?.assetbundleName || !isPlayableVocalType(vocal.musicVocalType)) continue;
        const list = byMusic.get(vocal.musicId);
        if (list) list.push(vocal);
        else byMusic.set(vocal.musicId, [vocal]);
    }
    const pool: PoolSong[] = [];
    for (const music of musics) {
        if (!music || music.id <= 0 || !music.title || !music.assetbundleName) continue;
        if (!(music.publishedAt <= now) || isMedley(music)) continue;
        const list = byMusic.get(music.id);
        if (!list?.length) continue;
        pool.push({ music, vocals: [...list].sort((a, b) => a.seq - b.seq || a.id - b.id) });
    }
    // A stable order keeps seeded games reproducible whatever order the master data uses.
    return pool.sort((a, b) => a.music.id - b.music.id);
}

/**
 * The pool of a vocal-removal game: only vocals whose instrumental the server
 * has, never an Inst.ver., and only songs that keep at least one such vocal
 * (so songs released only as Inst.ver. drop out).
 */
export function restrictPoolToVocals(pool: readonly PoolSong[], vocalIds: ReadonlySet<number>): PoolSong[] {
    const restricted: PoolSong[] = [];
    for (const song of pool) {
        const vocals = song.vocals.filter((vocal) => vocalHasLyrics(vocal) && vocalIds.has(vocal.id));
        if (!vocals.length) continue;
        restricted.push(vocals.length === song.vocals.length ? song : { music: song.music, vocals });
    }
    return restricted;
}
