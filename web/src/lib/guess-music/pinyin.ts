/**
 * Pinyin of the songs' Chinese names, so a player can type "cuimianshu" (or
 * pick "cms" from the suggestions) for Mesmerizer's Chinese title. Kept apart from answer.ts:
 * pinyin-pro's dictionary is large, so pages load this module on demand.
 */
import { pinyin } from "pinyin-pro";
import { isAcceptedAliasKey, normalizeAnswer, type PinyinName, type SongSearchEntry } from "./answer.ts";

const HAN = /\p{Script=Han}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const DIGITS = /^\d*$/;

interface Syllable {
    origin: string;
    pinyin: string;
    first: string;
    isZh: boolean;
}

/** The pinyin of a name with Han characters in it, or null. Latin and kana parts stay as written. */
export function pinyinName(text: string, source: PinyinName["source"]): PinyinName | null {
    if (!text || !HAN.test(text)) return null;
    const syllables = pinyin(text, { type: "all", toneType: "none", v: true, nonZh: "consecutive" }) as Syllable[];
    const spell = (u: boolean) => normalizeAnswer(syllables.map((s) => (s.isZh ? (u ? s.pinyin.replace(/v/g, "u") : s.pinyin) : s.origin)).join(""));
    const spellings = [...new Set([spell(false), spell(true)])].filter(Boolean);
    if (spellings.length === 0) return null;
    // Initials only for names in Han characters alone (digits and punctuation aside), of two or more.
    const han = syllables.filter((s) => s.isZh).length;
    const hanOnly = syllables.every((s) => s.isZh || DIGITS.test(normalizeAnswer(s.origin)));
    const initials = han >= 2 && hanOnly ? normalizeAnswer(syllables.map((s) => (s.isZh ? s.first : s.origin)).join("")) : "";
    return initials ? { text, source, spellings, initials } : { text, source, spellings };
}

/**
 * The entry with the pinyin of its Chinese names: the localized title, the
 * aliases, and the title itself when it has no kana (Japanese titles in kanji
 * alone read as Chinese too, "yueguang" for the song Gekkou). An alias too
 * short to be an answer (one character) gets no pinyin either, or a single
 * syllable such as "feng" would answer.
 */
export function withPinyin(entry: SongSearchEntry): SongSearchEntry {
    const names: PinyinName[] = [];
    const seen = new Set<string>();
    const push = (name: PinyinName | null) => {
        if (!name || seen.has(name.text)) return;
        seen.add(name.text);
        names.push(name);
    };
    if (!KANA.test(entry.title)) push(pinyinName(entry.title, "title"));
    if (entry.localizedTitle) push(pinyinName(entry.localizedTitle, "localized"));
    for (const alias of entry.aliases ?? []) {
        if (isAcceptedAliasKey(normalizeAnswer(alias))) push(pinyinName(alias, "alias"));
    }
    return names.length ? { ...entry, pinyin: names } : entry;
}
