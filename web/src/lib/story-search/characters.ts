import type { StoryChunk } from "./types";

/**
 * Character alias lookup for matching corpus `chars` and per-line speaker names
 * across Simplified Chinese (`cn`), Traditional Chinese (`tw`), Japanese (`jp`),
 * English (`en`), and Korean (`kr`) story scripts.
 * Kept as Unicode escapes so UI source files contain no raw Han characters.
 */
const CHARACTER_ALIASES: Record<number, readonly string[]> = {
    1: ["\u661f\u4e43\u4e00\u6b4c", "\u4e00\u6b4c", "ichika", "hoshino ichika", "ichika hoshino", "\ud638\uc2dc\ub178 \uc774\uce58\uce74", "\uc774\uce58\uce74"],
    2: ["\u5929\u9a6c\u54b2\u5e0c", "\u5929\u99ac\u54b2\u5e0c", "\u54b2\u5e0c", "saki", "tenma saki", "saki tenma", "\ud150\ub9c8 \uc0ac\ud0a4", "\uc0ac\ud0a4"],
    3: ["\u671b\u6708\u7a57\u6ce2", "\u671b\u6708\u7a42\u6ce2", "\u7a57\u6ce2", "\u7a42\u6ce2", "honami", "mochizuki honami", "honami mochizuki", "\ubaa8\uce58\uc988\ud0a4 \ud638\ub098\ubbf8", "\ud638\ub098\ubbf8"],
    4: ["\u65e5\u91ce\u68ee\u5fd7\u6b65", "\u65e5\u91ce\u68ee\u5fd7\u6b69", "\u5fd7\u6b65", "\u5fd7\u6b69", "shiho", "hinomori shiho", "shiho hinomori", "\ud788\ub178\ubaa8\ub9ac \uc2dc\ud638", "\uc2dc\ud638"],
    5: ["\u82b1\u91cc\u5b9e\u4e43\u7406", "\u82b1\u91cc\u5be6\u4e43\u7406", "\u82b1\u91cc\u307f\u306e\u308a", "\u5b9e\u4e43\u7406", "\u5be6\u4e43\u7406", "\u307f\u306e\u308a", "minori", "hanasato minori", "minori hanasato", "\ud558\ub098\uc0ac\ud1a0 \ubbf8\ub178\ub9ac", "\ubbf8\ub178\ub9ac"],
    6: ["\u6850\u8c37\u9065", "\u6850\u8c37\u9059", "\u9065", "\u9059", "haruka", "kiritani haruka", "haruka kiritani", "\ud0a4\ub9ac\ud0c0\ub2c8 \ud558\ub8e8\uce74", "\ud558\ub8e8\uce74"],
    7: ["\u6843\u4e95\u7231\u8389", "\u6843\u4e95\u611b\u8389", "\u7231\u8389", "\u611b\u8389", "airi", "momoi airi", "airi momoi", "\ubaa8\ubaa8\uc774 \uc544\uc774\ub9ac", "\uc544\uc774\ub9ac"],
    8: ["\u65e5\u91ce\u68ee\u96eb", "\u96eb", "shizuku", "hinomori shizuku", "shizuku hinomori", "\ud788\ub178\ubaa8\ub9ac \uc2dc\uc988\ucfe0", "\uc2dc\uc988\ucfe0"],
    9: ["\u5c0f\u8c46\u6cfd\u5fc3\u7fbd", "\u5c0f\u8c46\u6fa4\u5fc3\u7fbd", "\u5c0f\u8c46\u6ca2\u3053\u306f\u306d", "\u5fc3\u7fbd", "\u3053\u306f\u306d", "kohane", "azusawa kohane", "kohane azusawa", "\uc544\uc988\uc0ac\uc640 \ucf54\ud558\ub124", "\ucf54\ud558\ub124"],
    10: ["\u767d\u77f3\u674f", "\u674f", "an", "shiraishi an", "an shiraishi", "\uc2dc\ub77c\uc774\uc2dc \uc548", "\uc548"],
    11: ["\u4e1c\u4e91\u5f70\u4eba", "\u6771\u96f2\u5f70\u4eba", "\u5f70\u4eba", "akito", "shinonome akito", "akito shinonome", "\uc2dc\ub178\ub178\uba54 \uc544\ud0a4\ud1a0", "\uc544\ud0a4\ud1a0"],
    12: ["\u9752\u67f3\u51ac\u5f25", "\u9752\u67f3\u51ac\u5f4c", "\u51ac\u5f25", "\u51ac\u5f4c", "toya", "aoyagi toya", "toya aoyagi", "\uc544\uc624\uc57c\uae30 \ud1a0\uc6b0\uc57c", "\ud1a0\uc6b0\uc57c"],
    13: ["\u5929\u9a6c\u53f8", "\u5929\u99ac\u53f8", "\u53f8", "tsukasa", "tenma tsukasa", "tsukasa tenma", "\ud150\ub9c8 \uce20\uce74\uc0ac", "\uce20\uce74\uc0ac"],
    14: ["\u51e4\u7b11\u68a6", "\u9cf3\u7b11\u5922", "\u9cf3\u3048\u3080", "\u7b11\u68a6", "\u7b11\u5922", "\u3048\u3080", "emu", "otori emu", "emu otori", "\uc624\uc624\ud1a0\ub9ac \uc5d0\ubb34", "\uc5d0\ubb34"],
    15: ["\u8349\u8599\u5b81\u5b81", "\u8349\u8599\u5be7\u5be7", "\u8349\u8599\u5be7\u3005", "\u5b81\u5b81", "\u5be7\u5be7", "\u5be7\u3005", "nene", "kusanagi nene", "nene kusanagi", "\ucfe0\uc0ac\ub098\uae30 \ub124\ub124", "\ub124\ub124"],
    16: ["\u795e\u4ee3\u7c7b", "\u795e\u4ee3\u985e", "\u7c7b", "\u985e", "rui", "kamishiro rui", "rui kamishiro", "\uce74\ubbf8\uc2dc\ub85c \ub8e8\uc774", "\ub8e8\uc774"],
    17: ["\u5bb5\u5d0e\u594f", "\u594f", "kanade", "yoisaki kanade", "kanade yoisaki", "\uc694\uc774\uc0ac\ud0a4 \uce74\ub098\ub370", "\uce74\ub098\ub370"],
    18: ["\u671d\u6bd4\u5948\u771f\u51ac", "\u671d\u6bd4\u5948\u307e\u3075\u3086", "\u771f\u51ac", "\u307e\u3075\u3086", "mafuyu", "asahina mafuyu", "mafuyu asahina", "\uc544\uc0ac\ud788\ub098 \ub9c8\ud6c4\uc720", "\ub9c8\ud6c4\uc720"],
    19: ["\u4e1c\u4e91\u7ed8\u540d", "\u6771\u96f2\u7e6a\u540d", "\u6771\u96f2\u7d75\u540d", "\u7ed8\u540d", "\u7e6a\u540d", "\u7d75\u540d", "ena", "shinonome ena", "ena shinonome", "\uc2dc\ub178\ub178\uba54 \uc5d0\ub098", "\uc5d0\ub098"],
    20: ["\u6653\u5c71\u745e\u5e0c", "\u66c9\u5c71\u745e\u5e0c", "\u6681\u5c71\u745e\u5e0c", "\u745e\u5e0c", "mizuki", "akiyama mizuki", "mizuki akiyama", "\uc544\ud0a4\uc57c\ub9c8 \ubbf8\uc988\ud0a4", "\ubbf8\uc988\ud0a4"],
    21: ["\u521d\u97f3\u672a\u6765", "\u521d\u97f3\u672a\u4f86", "\u521d\u97f3\u30df\u30af", "\u30df\u30af", "miku", "hatsune miku", "miku hatsune", "\ud558\uce20\ub124 \ubbf8\ucfe0", "\ubbf8\ucfe0"],
    22: ["\u955c\u97f3\u94c3", "\u93e1\u97f3\u9234", "\u93e1\u97f3\u30ea\u30f3", "\u94c3", "\u9234", "\u30ea\u30f3", "rin", "kagamine rin", "rin kagamine", "\uce74\uac00\ubbf8\ub124 \ub9b0", "\ub9b0"],
    23: ["\u955c\u97f3\u8fde", "\u93e1\u97f3\u9023", "\u93e1\u97f3\u30ec\u30f3", "\u8fde", "\u9023", "\u30ec\u30f3", "len", "kagamine len", "len kagamine", "\uce74\uac00\ubbf8\ub124 \ub80c", "\ub80c"],
    24: ["\u5de1\u97f3\u6d41\u6b4c", "\u5de1\u97f3\u30eb\u30ab", "\u6d41\u6b4c", "\u30eb\u30ab", "luka", "megurine luka", "luka megurine", "\uba54\uad6c\ub9ac\ub124 \ub8e8\uce74", "\ub8e8\uce74"],
    25: ["meiko", "\u30e1\u30a4\u30b3"],
    26: ["kaito", "\u30ab\u30a4\u30c8"],
};

const NORMALIZED_ALIASES: Record<number, readonly string[]> = Object.fromEntries(
    Object.entries(CHARACTER_ALIASES).map(([id, names]) => [
        Number(id),
        names.map((name) => name.toLowerCase()),
    ]),
);

const SPEAKER_TOKEN_SPLIT_RE = /[\u30fb\uff06&\uff0f/\u3001,\s]+/;

/**
 * Checks whether a single line's speaker label corresponds to any of the selected character IDs.
 * Supports full names, short/given names, EN names, and compound speaker labels (e.g. "A・B").
 */
export function speakerMatchesCharacterIds(speaker: string, selectedCharIds: number[]): boolean {
    if (selectedCharIds.length === 0) return true;
    const normalized = speaker.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return false;

    const tokens = normalized.split(SPEAKER_TOKEN_SPLIT_RE).filter(Boolean);

    return selectedCharIds.some((charId) => {
        const aliases = NORMALIZED_ALIASES[charId];
        if (!aliases) return false;
        return aliases.some((alias) => {
            if (normalized === alias || tokens.includes(alias)) return true;
            // Allow substring check only for multi-character aliases (avoids 1-char false hits).
            return alias.length >= 2 && normalized.includes(alias);
        });
    });
}

/**
 * Checks whether a chunk contains any of the selected character IDs.
 * Uses `char_ids` when present and falls back to `chars` speaker aliases.
 */
export function chunkMatchesCharacterIds(chunk: Pick<StoryChunk, "chars" | "char_ids">, selectedCharIds: number[]): boolean {
    if (selectedCharIds.length === 0) return true;

    if (Array.isArray(chunk.char_ids) && chunk.char_ids.length > 0) {
        return selectedCharIds.some((id) => chunk.char_ids!.includes(id));
    }

    const speakers = chunk.chars ?? [];
    if (speakers.length === 0) return false;

    return speakers.some((speaker) => speakerMatchesCharacterIds(speaker, selectedCharIds));
}
