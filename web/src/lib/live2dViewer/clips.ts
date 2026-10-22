/**
 * A model's motions and facials, grouped for choosing. The clip names are the game's own
 * (`w-cute01-tilthead02`, `face_smile_03`): a body motion names a style (the character's manner),
 * an action and variant numbers; a facial names an emotion and a number. The panel shows one row
 * per action or emotion, with a button per variant; words it knows are translated
 * (`page.live2d.motionStyle.*`, `motionAction.*`, `emotion.*`), others are shown as spelled.
 */

/** Styles in the order the panel offers them (the most used first). */
export const LIVE2D_MOTION_STYLES = ["normal", "cute", "cool", "happy", "adult", "pure", "animal", "special"] as const;

/** Actions with a translation, in the order their rows are listed. */
export const LIVE2D_MOTION_ACTIONS = [
    "default", "nod", "tilthead", "shakehead", "pose", "forward", "glad", "joy", "blushed", "shy", "angry", "sad", "cry",
    "trouble", "think", "sigh", "relief", "delicious", "piece", "guts", "thumb", "wink", "smug", "greeting", "shakehand",
    "handshake", "salute", "lookleft", "lookright", "lookaway", "lookdown", "lookaround", "fidget", "sleep", "dance",
    "jump", "dizzy", "scare", "surprise", "disgust", "hug", "lookup",
] as const;

/** Emotions with a translation, in the order their rows are listed. */
export const LIVE2D_EMOTIONS = [
    "normal", "smile", "glad", "sparkling", "kirakira", "wink", "smug", "doya", "shy", "blushed", "surprise", "shock",
    "notice", "think", "serious", "trouble", "worry", "confusion", "sad", "cry", "tear", "angry", "disgust", "coldeyes",
    "scared", "scream", "desperate", "regret", "heartbreak", "tired", "exhaustion", "sleepy", "yawn", "closeeye",
    "lookaway", "lookdown", "eat", "delicious", "spicy", "sing", "sneeze",
] as const;

const STYLES = new Set<string>(LIVE2D_MOTION_STYLES);
const ACTIONS = new Set<string>(LIVE2D_MOTION_ACTIONS);
const EMOTIONS = new Set<string>(LIVE2D_EMOTIONS);
const ACTION_ORDER = new Map<string, number>(LIVE2D_MOTION_ACTIONS.map((word, index) => [word, index]));
const EMOTION_ORDER = new Map<string, number>(LIVE2D_EMOTIONS.map((word, index) => [word, index]));
const STYLE_ORDER = new Map<string, number>(LIVE2D_MOTION_STYLES.map((word, index) => [word, index]));
/** Misspellings the game data carries. */
const ALIASES: Record<string, string> = {
    noromal: "normal", nomal: "normal", tilehead: "tilthead", closeeyes: "closeeye", blush: "blushed", surprised: "surprise", confuse: "confusion",
};
/** Prefixes of a facial set (`face_ossmile_01`, `face_darkangry_02`), shown as a tag on the row. */
const FACIAL_SET_PREFIXES = ["dark", "nhi", "os", "nc", "sg", "md", "nt"] as const;

/** One clip: its name (what the viewer plays) and what tells it from the others in its row. */
export interface Live2DClip {
    name: string;
    /** The variant (`01`, `01·02`, `b`); empty when the row has nothing to tell apart. */
    code: string;
}

/**
 * The clips of one action or emotion. `words` are known words (translated, joined); `raw` is the
 * name as spelled when no word is known; `tag` names a variant set (`nb`, `dark`, `night`).
 */
export interface Live2DClipRow {
    key: string;
    words: string[];
    raw: string;
    tag: string | null;
    clips: Live2DClip[];
}

/** The motions of one style; `known` when the style is translated, else `style` is shown as spelled. */
export interface Live2DMotionGroup {
    style: string;
    known: boolean;
    rows: Live2DClipRow[];
}

const canonical = (word: string) => ALIASES[word] ?? word;

/** `posenod` → [pose, nod]: the letters as known words, longest first, or null. */
function splitWords(letters: string, known: ReadonlySet<string>): string[] | null {
    if (!letters) return null;
    const whole = canonical(letters);
    if (known.has(whole)) return [whole];
    for (let end = letters.length - 1; end > 0; end--) {
        const head = canonical(letters.slice(0, end));
        if (!known.has(head)) continue;
        const rest = splitWords(letters.slice(end), known);
        if (rest) return [head, ...rest];
    }
    return null;
}

/**
 * An action as spelled (`nbtilthead09`, `tiltheadb`, `shakehead01r`): its words, a set tag
 * (`nb`), and what is left as the variant (`09`, `b`, `01r`).
 */
function parseAction(spelled: string): { words: string[]; tag: string | null; code: string; raw: string } {
    const letters = /^[a-z]+/.exec(spelled)?.[0] ?? "";
    const tail = spelled.slice(letters.length);
    const tagged = letters.startsWith("nb") ? { tag: "nb", letters: letters.slice(2) } : { tag: null, letters };
    const words = splitWords(tagged.letters, ACTIONS);
    if (words) return { words, tag: tagged.tag, code: tail, raw: tagged.letters };
    // a variant letter after the word (`tiltheadb`, `shakeheadc`)
    const stem = tagged.letters.slice(0, -1);
    const stemWords = splitWords(stem, ACTIONS);
    if (stemWords && /^[a-z]$/.test(tagged.letters.slice(-1))) {
        return { words: stemWords, tag: tagged.tag, code: tagged.letters.slice(-1) + tail, raw: stem };
    }
    return { words: [], tag: tagged.tag, code: tail, raw: tagged.letters || spelled };
}

function rowOrder(row: Live2DClipRow, order: ReadonlyMap<string, number>): number {
    const first = row.words[0];
    return first !== undefined ? (order.get(first) ?? order.size) * 4 + row.words.length : order.size * 4 + 4;
}

function compareRows(order: ReadonlyMap<string, number>) {
    return (a: Live2DClipRow, b: Live2DClipRow) => rowOrder(a, order) - rowOrder(b, order)
        || Number(a.tag !== null) - Number(b.tag !== null)
        || (a.tag ?? "").localeCompare(b.tag ?? "")
        || a.raw.localeCompare(b.raw);
}

function addClip(rows: Map<string, Live2DClipRow>, row: Omit<Live2DClipRow, "clips">, clip: Live2DClip) {
    const existing = rows.get(row.key) ?? { ...row, clips: [] };
    existing.clips.push(clip);
    rows.set(row.key, existing);
}

function finishRows(rows: Map<string, Live2DClipRow>, order: ReadonlyMap<string, number>): Live2DClipRow[] {
    const list = [...rows.values()];
    for (const row of list) {
        row.clips.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.name.localeCompare(b.name));
        // the same variant twice (the data has `w-normal16-nod` and `w-noromal16-nod`): number the later ones
        const seen = new Map<string, number>();
        for (const clip of row.clips) {
            const count = (seen.get(clip.code) ?? 0) + 1;
            seen.set(clip.code, count);
            if (count > 1) clip.code = clip.code ? `${clip.code} (${count})` : `(${count})`;
        }
    }
    return list.sort(compareRows(order));
}

/**
 * Body motions grouped by style, each style's rows by action. A name the pattern does not fit
 * goes to the style `other` (last) under its own name.
 */
export function groupLive2DMotions(names: readonly string[]): Live2DMotionGroup[] {
    const styles = new Map<string, Map<string, Live2DClipRow>>();
    for (const name of names) {
        // `w-<style><numbers>-<action>`; `m-` too
        const match = /^[a-z]-([a-z0-9]+)-([a-z0-9]+)$/.exec(name);
        let style = "other";
        let row: Omit<Live2DClipRow, "clips">;
        let code = "";
        if (match) {
            const middle = match[1];
            const run = canonical(/^[a-z]*/.exec(middle)?.[0] ?? "");
            const knownStyle = LIVE2D_MOTION_STYLES.find(word => run.startsWith(word))
                ?? (run.startsWith("noromal") ? "normal" : undefined);
            style = knownStyle ?? (run || "other");
            const spelledStyle = /^[a-z]*/.exec(middle)?.[0] ?? "";
            const styleRest = middle.slice(knownStyle && spelledStyle.startsWith(knownStyle) ? knownStyle.length : spelledStyle.length);
            const action = parseAction(match[2]);
            const key = `${action.words.join("+") || action.raw}|${action.tag ?? ""}`;
            row = { key, words: action.words, raw: action.raw, tag: action.tag };
            code = [styleRest, action.code].filter(Boolean).join("·");
        } else {
            row = { key: name, words: [], raw: name, tag: null };
        }
        const rows = styles.get(style) ?? new Map<string, Live2DClipRow>();
        addClip(rows, row, { name, code });
        styles.set(style, rows);
    }
    return [...styles.entries()]
        .map(([style, rows]) => ({ style, known: STYLES.has(style), rows: finishRows(rows, ACTION_ORDER) }))
        .sort((a, b) => (a.style === "other" ? 1 : 0) - (b.style === "other" ? 1 : 0)
            || (STYLE_ORDER.get(a.style) ?? STYLE_ORDER.size) - (STYLE_ORDER.get(b.style) ?? STYLE_ORDER.size)
            || a.style.localeCompare(b.style));
}

/** A facial's emotion as spelled (`smile`, `night_smile`, `ossmile`, `lookaway`): its word and set. */
function parseEmotion(spelled: string): { words: string[]; tag: string | null; raw: string } {
    const word = canonical(spelled);
    if (EMOTIONS.has(word)) return { words: [word], tag: null, raw: spelled };
    const underscore = spelled.lastIndexOf("_");
    if (underscore > 0) {
        const tail = canonical(spelled.slice(underscore + 1));
        if (EMOTIONS.has(tail)) return { words: [tail], tag: spelled.slice(0, underscore), raw: spelled };
    }
    for (const prefix of FACIAL_SET_PREFIXES) {
        const rest = canonical(spelled.slice(prefix.length));
        if (spelled.startsWith(prefix) && EMOTIONS.has(rest)) return { words: [rest], tag: prefix, raw: spelled };
    }
    return { words: [], tag: null, raw: spelled };
}

/** Facials as rows by emotion (`face_smile_03` → smile, 03). */
export function groupLive2DFacials(names: readonly string[]): Live2DClipRow[] {
    const rows = new Map<string, Live2DClipRow>();
    for (const name of names) {
        // `face_<emotion>_<number>`, the number sometimes followed by a variant (`01l`, `01_nokira`) or joined on (`desperate01`)
        const match = /^face_(.+?)_(\d+[a-z_]*)$/.exec(name) ?? /^face_(.+?[a-z])(\d+)$/.exec(name) ?? [name, name.replace(/^face_/, ""), ""];
        const emotion = parseEmotion(match[1].trim());
        const key = `${emotion.words.join("+") || emotion.raw}|${emotion.tag ?? ""}`;
        addClip(rows, { key, ...emotion }, { name, code: match[2] });
    }
    return finishRows(rows, EMOTION_ORDER);
}

/** The style a motion belongs to, as `groupLive2DMotions` files it. */
export function live2dMotionStyle(groups: readonly Live2DMotionGroup[], name: string | null): string | null {
    if (!name) return null;
    return groups.find(group => group.rows.some(row => row.clips.some(clip => clip.name === name)))?.style ?? null;
}
