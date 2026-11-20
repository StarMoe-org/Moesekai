import type { StoryChunk } from "./types";

/**
 * Character alias lookup for matching corpus `chars` speaker names across
 * Simplified Chinese (`cn`) and Japanese (`jp`) story scripts.
 * Kept as Unicode escapes so UI source files contain no raw Han characters.
 */
const CHARACTER_ALIASES: Record<number, readonly string[]> = {
    1: ["\u661f\u4e43\u4e00\u6b4c", "\u4e00\u6b4c"],
    2: ["\u5929\u9a6c\u54b2\u5e0c", "\u5929\u99ac\u54b2\u5e0c", "\u54b2\u5e0c"],
    3: ["\u671b\u6708\u7a57\u6ce2", "\u671b\u6708\u7a42\u6ce2", "\u7a57\u6ce2", "\u7a42\u6ce2"],
    4: ["\u65e5\u91ce\u68ee\u5fd7\u6b65", "\u65e5\u91ce\u68ee\u5fd7\u6b69", "\u5fd7\u6b65", "\u5fd7\u6b69"],
    5: ["\u82b1\u91cc\u5b9e\u4e43\u7406", "\u82b1\u91cc\u307f\u306e\u308a", "\u5b9e\u4e43\u7406", "\u307f\u306e\u308a"],
    6: ["\u6850\u8c37\u9065", "\u9065"],
    7: ["\u6843\u4e95\u7231\u8389", "\u6843\u4e95\u611b\u8389", "\u7231\u8389", "\u611b\u8389"],
    8: ["\u65e5\u91ce\u68ee\u96eb", "\u96eb"],
    9: ["\u5c0f\u8c46\u6cfd\u5fc3\u7fbd", "\u5c0f\u8c46\u6ca2\u3053\u306f\u306d", "\u5fc3\u7fbd", "\u3053\u306f\u306d"],
    10: ["\u767d\u77f3\u674f", "\u674f"],
    11: ["\u4e1c\u4e91\u5f70\u4eba", "\u6771\u96f2\u5f70\u4eba", "\u5f70\u4eba"],
    12: ["\u9752\u67f3\u51ac\u5f25", "\u51ac\u5f25"],
    13: ["\u5929\u9a6c\u53f8", "\u5929\u99ac\u53f8", "\u53f8"],
    14: ["\u51e4\u7b11\u68a6", "\u9cf3\u3048\u3080", "\u7b11\u68a6", "\u3048\u3080"],
    15: ["\u8349\u8599\u5b81\u5b81", "\u8349\u8599\u5be7\u3005", "\u5b81\u5b81", "\u5be7\u3005"],
    16: ["\u795e\u4ee3\u7c7b", "\u795e\u4ee3\u985e", "\u7c7b", "\u985e"],
    17: ["\u5bb5\u5d0e\u594f", "\u594f"],
    18: ["\u671d\u6bd4\u5948\u771f\u51ac", "\u671d\u6bd4\u5948\u307e\u3075\u3086", "\u771f\u51ac", "\u307e\u3075\u3086"],
    19: ["\u4e1c\u4e91\u7ed8\u540d", "\u6771\u96f2\u7d75\u540d", "\u7ed8\u540d", "\u7d75\u540d"],
    20: ["\u6653\u5c71\u745e\u5e0c", "\u6681\u5c71\u745e\u5e0c", "\u745e\u5e0c"],
    21: ["\u521d\u97f3\u672a\u6765", "\u521d\u97f3\u30df\u30af", "\u30df\u30af", "miku"],
    22: ["\u955c\u97f3\u94c3", "\u93e1\u97f3\u30ea\u30f3", "\u30ea\u30f3", "rin"],
    23: ["\u955c\u97f3\u8fde", "\u93e1\u97f3\u30ec\u30f3", "\u30ec\u30f3", "len"],
    24: ["\u5de1\u97f3\u6d41\u6b4c", "\u5de1\u97f3\u30eb\u30ab", "\u30eb\u30ab", "luka"],
    25: ["meiko", "\u30e1\u30a4\u30b3"],
    26: ["kaito", "\u30ab\u30a4\u30c8"],
};

const NORMALIZED_ALIASES: Record<number, string[]> = Object.fromEntries(
    Object.entries(CHARACTER_ALIASES).map(([id, names]) => [
        Number(id),
        names.map((name) => name.toLowerCase()),
    ]),
);

/**
 * Checks whether a chunk contains ALL (or ANY? No: OR across selected characters, matching site filters)
 * selected character IDs. Uses `char_ids` when present and falls back to `chars` speaker aliases.
 */
export function chunkMatchesCharacterIds(chunk: Pick<StoryChunk, "chars" | "char_ids">, selectedCharIds: number[]): boolean {
    if (selectedCharIds.length === 0) return true;

    if (Array.isArray(chunk.char_ids) && chunk.char_ids.length > 0) {
        return selectedCharIds.some((id) => chunk.char_ids!.includes(id));
    }

    const speakers = (chunk.chars ?? []).map((s) => s.toLowerCase());
    if (speakers.length === 0) return false;

    return selectedCharIds.some((charId) => {
        const aliases = NORMALIZED_ALIASES[charId];
        if (!aliases) return false;
        return speakers.some((speaker) => aliases.some((alias) => speaker === alias || speaker.includes(alias)));
    });
}
