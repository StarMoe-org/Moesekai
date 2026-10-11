/**
 * Romaji for the songs' kana readings, so "mezumaraiza" finds メズマライザー.
 * Readings and typed romaji meet in one loose spelling: the reading is
 * romanized (Hepburn), the input goes to kana and back, so "syaruru" and
 * "sharuru", "tyuurippu" and "churippu" are the same; long vowels collapse
 * ("ー" dropped, "ou" and doubled vowels as one), so "gekkou", "gekko" and
 * "mezumaraizaa" match too.
 */
import { toHiragana, toRomaji } from "wanakana";
import { normalizeAnswer } from "./answer.ts";

const ASCII_KEY = /^[a-z0-9]+$/;

function loose(romaji: string): string {
    return normalizeAnswer(romaji).replace(/ou/g, "o").replace(/([aiueo])\1+/g, "$1");
}

/** The loose romaji of a kana reading, or "" when it has no kana. */
export function romajiOfReading(reading: string): string {
    const kana = normalizeAnswer(reading).replace(/ー/g, "");
    if (!kana || ASCII_KEY.test(kana)) return "";
    const romaji = loose(toRomaji(kana));
    // Anything wanakana could not romanize (kanji in a reading) makes the key useless.
    return ASCII_KEY.test(romaji) ? romaji : "";
}

/** A normalized query typed in Latin letters, in the same loose romaji; "" for anything else. */
export function romanizeQuery(normalizedQuery: string): string {
    if (!ASCII_KEY.test(normalizedQuery)) return "";
    return loose(toRomaji(toHiragana(normalizedQuery).replace(/ー/g, "")));
}
