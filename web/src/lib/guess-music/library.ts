import type { IMusicInfo, IMusicVocalInfo } from "@/types/music";
import type { TranslationData } from "@/lib/translations";
import { buildSongIndex, type SongIndex, type SongSearchEntry } from "./answer";
import { buildSongPool, type PoolSong } from "./pool";
import type { ServerScope } from "./settings";

/**
 * Everything one game needs from the master data of a server: the pool of
 * playable songs, lookups for display, and the answer index (titles,
 * readings, localized titles and community aliases).
 */
export interface SongLibrary {
    server: ServerScope;
    pool: PoolSong[];
    musicById: Map<number, IMusicInfo>;
    vocalById: Map<number, IMusicVocalInfo>;
    entryById: Map<number, SongSearchEntry>;
    index: SongIndex;
    /** Vocal captions in the UI language, keyed by the master-data caption. */
    captionTranslations: Record<string, string>;
}

export interface SongLibraryInput {
    server: ServerScope;
    musics: readonly IMusicInfo[];
    vocals: readonly IMusicVocalInfo[];
    translations?: Pick<TranslationData, "music"> | null;
    aliases?: ReadonlyMap<number, readonly string[]>;
    /** Adds the pinyin of the Chinese names (pinyin.ts, loaded on demand). */
    withPinyin?: ((entry: SongSearchEntry) => SongSearchEntry) | null;
    now?: number;
}

export function buildSongLibrary({ server, musics, vocals, translations, aliases, withPinyin, now = Date.now() }: SongLibraryInput): SongLibrary {
    const pool = buildSongPool(musics, vocals, now);
    const titleTranslations = translations?.music?.title ?? {};
    const musicById = new Map<number, IMusicInfo>();
    const vocalById = new Map<number, IMusicVocalInfo>();
    const entries: SongSearchEntry[] = [];
    for (const song of pool) {
        musicById.set(song.music.id, song.music);
        for (const vocal of song.vocals) vocalById.set(vocal.id, vocal);
        const localized = titleTranslations[song.music.title];
        const entry: SongSearchEntry = {
            id: song.music.id,
            title: song.music.title,
            pronunciation: song.music.pronunciation ?? "",
            localizedTitle: localized && localized !== song.music.title ? localized : undefined,
            aliases: aliases?.get(song.music.id) ?? [],
        };
        entries.push(withPinyin ? withPinyin(entry) : entry);
    }
    return {
        server,
        pool,
        musicById,
        vocalById,
        entryById: new Map(entries.map((entry) => [entry.id, entry])),
        index: buildSongIndex(entries),
        captionTranslations: translations?.music?.vocalCaption ?? {},
    };
}
