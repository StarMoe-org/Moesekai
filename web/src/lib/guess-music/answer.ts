/**
 * Answer normalization, suggestion search and typed-answer matching.
 *
 * Every comparison runs on normalized keys: NFKC (full-width letters and
 * digits, half-width kana), lower case, katakana folded to hiragana, and
 * whitespace, punctuation and symbols removed. "Ｔｅｌｌ　Ｙｏｕｒ　Ｗｏｒｌｄ",
 * "tell your world" and "TellYourWorld" all become "tellyourworld";
 * "テオ" and "てお" are the same answer.
 */

export type MatchKind = "title" | "localized" | "pronunciation" | "alias";

export interface SongSearchEntry {
    id: number;
    /** Title as in the game's master data (Japanese for both JP and CN). */
    title: string;
    /** Kana reading from the master data. */
    pronunciation: string;
    /** Title in the UI language, when a translation exists. */
    localizedTitle?: string;
    /** Community aliases (Haruki). */
    aliases?: readonly string[];
}

export interface IndexedKey {
    key: string;
    kind: MatchKind;
    /** The original text the key came from, for display. */
    text: string;
}

export interface IndexedSong {
    entry: SongSearchEntry;
    /** Normalized title: two songs with the same title key count as the same answer. */
    titleKey: string;
    keys: IndexedKey[];
}

export interface SongIndex {
    songs: IndexedSong[];
    byId: Map<number, IndexedSong>;
}

export interface SongSuggestion {
    id: number;
    kind: MatchKind;
    /** Text that matched the query (the alias itself for alias matches). */
    text: string;
}

const KIND_ORDER: Record<MatchKind, number> = { title: 0, localized: 1, pronunciation: 2, alias: 3 };
const STRIPPED = /[\p{P}\p{S}\p{Z}\p{Cc}\p{Cf}\s]/gu;
const DIGITS_ONLY = /^\d+$/;

export function normalizeAnswer(input: string): string {
    const folded = (input ?? "").normalize("NFKC").toLowerCase();
    let out = "";
    for (const char of folded) {
        const code = char.codePointAt(0) ?? 0;
        // Katakana ァ..ヶ and the iteration marks ヽヾ sit 0x60 above their hiragana.
        if ((code >= 0x30a1 && code <= 0x30f6) || code === 0x30fd || code === 0x30fe) {
            out += String.fromCodePoint(code - 0x60);
        } else {
            out += char;
        }
    }
    return out.replace(STRIPPED, "");
}

/** Haruki aliases include music ids such as "01"; those never name a song. */
export function isNumericKey(key: string): boolean {
    return DIGITS_ONLY.test(key);
}

/** Aliases accepted as a typed answer: at least 2 characters and not purely digits. */
export function isAcceptedAliasKey(key: string): boolean {
    return [...key].length >= 2 && !isNumericKey(key);
}

export function buildSongIndex(entries: readonly SongSearchEntry[]): SongIndex {
    const songs: IndexedSong[] = [];
    const byId = new Map<number, IndexedSong>();
    for (const entry of entries) {
        const keys: IndexedKey[] = [];
        const seen = new Set<string>();
        const add = (text: string | undefined, kind: MatchKind) => {
            if (!text) return;
            const key = normalizeAnswer(text);
            if (!key || seen.has(key)) return;
            if (kind === "alias" && isNumericKey(key)) return;
            seen.add(key);
            keys.push({ key, kind, text });
        };
        add(entry.title, "title");
        add(entry.localizedTitle, "localized");
        add(entry.pronunciation, "pronunciation");
        for (const alias of entry.aliases ?? []) add(alias, "alias");
        const song: IndexedSong = { entry, titleKey: normalizeAnswer(entry.title) || `#${entry.id}`, keys };
        songs.push(song);
        byId.set(entry.id, song);
    }
    return { songs, byId };
}

/**
 * Songs matching a query: exact matches, then prefix matches, then substring
 * matches; within a rank titles beat localized titles, readings and aliases,
 * and the closer (shorter) key wins. Songs sharing a title appear once.
 */
export function searchSongs(index: SongIndex, query: string, limit = 8): SongSuggestion[] {
    const q = normalizeAnswer(query);
    if (!q) return [];
    const hits: Array<{ song: IndexedSong; key: IndexedKey; rank: number }> = [];
    for (const song of index.songs) {
        let best: { key: IndexedKey; rank: number } | null = null;
        for (const key of song.keys) {
            const rank = key.key === q ? 0 : key.key.startsWith(q) ? 1 : key.key.includes(q) ? 2 : -1;
            if (rank < 0) continue;
            if (!best || compareHit(rank, key, best.rank, best.key) < 0) best = { key, rank };
        }
        if (best) hits.push({ song, ...best });
    }
    hits.sort((a, b) => compareHit(a.rank, a.key, b.rank, b.key) || a.song.entry.id - b.song.entry.id);
    const out: SongSuggestion[] = [];
    const titles = new Set<string>();
    for (const hit of hits) {
        if (titles.has(hit.song.titleKey)) continue;
        titles.add(hit.song.titleKey);
        out.push({ id: hit.song.entry.id, kind: hit.key.kind, text: hit.key.text });
        if (out.length >= limit) break;
    }
    return out;
}

function compareHit(rankA: number, keyA: IndexedKey, rankB: number, keyB: IndexedKey): number {
    return rankA - rankB || KIND_ORDER[keyA.kind] - KIND_ORDER[keyB.kind] || keyA.key.length - keyB.key.length;
}

/** Normalized answers the pure-typing mode accepts for a song. */
export function acceptedAnswerKeys(entry: SongSearchEntry): Set<string> {
    const keys = new Set<string>();
    for (const text of [entry.title, entry.pronunciation, entry.localizedTitle]) {
        const key = text ? normalizeAnswer(text) : "";
        if (key) keys.add(key);
    }
    for (const alias of entry.aliases ?? []) {
        const key = normalizeAnswer(alias);
        if (isAcceptedAliasKey(key)) keys.add(key);
    }
    return keys;
}

export function matchesTypedAnswer(entry: SongSearchEntry, input: string): boolean {
    const key = normalizeAnswer(input);
    return key.length > 0 && acceptedAnswerKeys(entry).has(key);
}

/** A picked song is right when it is the answer or shares its title (re-releases). */
export function isSameSong(index: SongIndex, guessId: number, answerId: number): boolean {
    if (guessId === answerId) return true;
    const guess = index.byId.get(guessId);
    const answer = index.byId.get(answerId);
    return Boolean(guess && answer && guess.titleKey === answer.titleKey);
}
