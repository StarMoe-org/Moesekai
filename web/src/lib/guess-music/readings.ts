/**
 * The extra ways to type a song, loaded on demand by the guess-music pages:
 * pinyin of its Chinese names and romaji of its kana reading.
 */
import type { SongSearchEntry } from "./answer.ts";
import { withPinyin } from "./pinyin.ts";
import { romajiOfReading, romanizeQuery } from "./romaji.ts";

export { romanizeQuery };

export function withReadings(entry: SongSearchEntry): SongSearchEntry {
    const withNames = withPinyin(entry);
    const romaji = romajiOfReading(entry.pronunciation);
    return romaji ? { ...withNames, romaji } : withNames;
}
