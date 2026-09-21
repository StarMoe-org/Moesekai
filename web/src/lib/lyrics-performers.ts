export interface ExternalLyricsPerformer {
    id: number;
    sourceId: string;
    name: string;
    color?: string;
    avatarUrl?: string;
}

// Reserved lyrics-only IDs are intentionally outside the Project SEKAI
// gameCharacters range. They are stable across the producer and consumer and
// represent the audited external singer identities used by the Public Lyrics
// contract. An avatar is included when a checked-in local asset is available;
// otherwise the lyric UI keeps its safe text fallback for that identity.
export const EXTERNAL_LYRICS_PERFORMERS = [
    { id: 1001, sourceId: "外部歌唱者-01", name: "GUMI", color: "#70B85A", avatarUrl: "/images/lyrics-performers/gumi.webp" },
    { id: 1002, sourceId: "外部歌唱者-02", name: "Kasane Teto", color: "#D83B67", avatarUrl: "/images/lyrics-performers/teto.webp" },
    { id: 1003, sourceId: "外部歌唱者-03", name: "flower", color: "#7B6A84", avatarUrl: "/images/lyrics-performers/flower.webp" },
    { id: 1004, sourceId: "外部歌唱者-04", name: "Nenerobo" },
    { id: 1006, sourceId: "外部歌唱者-06", name: "Kamui Gakupo", color: "#6F73C8", avatarUrl: "/images/lyrics-performers/gakupo.webp" },
    { id: 1007, sourceId: "外部歌唱者-07", name: "KAFU", color: "#8A8A91", avatarUrl: "/images/lyrics-performers/kafu.webp" },
    { id: 1008, sourceId: "外部歌唱者-08", name: "Gekiyaku", color: "#A66D87", avatarUrl: "/images/lyrics-performers/gekiyaku.webp" },
    { id: 1009, sourceId: "外部歌唱者-09", name: "SEKAI", color: "#4A89A8", avatarUrl: "/images/lyrics-performers/sekai.webp" },
    { id: 1011, sourceId: "外部歌唱者-11", name: "Zundamon", color: "#78AF54", avatarUrl: "/images/lyrics-performers/zundamon.webp" },
    { id: 1012, sourceId: "外部歌唱者-12", name: "Kaai Yuki", color: "#4F5A4B", avatarUrl: "/images/lyrics-performers/yuki.webp" },
    { id: 1013, sourceId: "外部歌唱者-13", name: "Adachi Rei", color: "#E56E1B", avatarUrl: "/images/lyrics-performers/adachi-rei.webp" },
    { id: 1014, sourceId: "外部歌唱者-14", name: "RIME", color: "#563E8E", avatarUrl: "/images/lyrics-performers/rime.webp" },
    { id: 1015, sourceId: "外部歌唱者-15", name: "Hanakuma Chifuyu", color: "#506D87", avatarUrl: "/images/lyrics-performers/chifuyu.webp" },
    { id: 1016, sourceId: "外部歌唱者-16", name: "VY1", color: "#31A1B5", avatarUrl: "/images/lyrics-performers/vy1.webp" },
    { id: 1017, sourceId: "外部歌唱者-17", name: "SOLARIA", color: "#B86D46", avatarUrl: "/images/lyrics-performers/solaria.webp" },
    { id: 1018, sourceId: "外部歌唱者-18", name: "Kotonoha Aoi", color: "#4D8FCC", avatarUrl: "/images/lyrics-performers/kotonoha-aoi.webp" },
    { id: 1019, sourceId: "外部歌唱者-19", name: "Kotonoha Akane", color: "#D75C58", avatarUrl: "/images/lyrics-performers/kotonoha-akane.webp" },
    { id: 1028, sourceId: "外部歌唱者-28", name: "IA", color: "#FFB1C4", avatarUrl: "/images/lyrics-performers/ia.webp" },
    { id: 1030, sourceId: "外部歌唱者-30", name: "HARU", color: "#8EC31F", avatarUrl: "/images/lyrics-performers/haru.webp" },
    { id: 1031, sourceId: "外部歌唱者-31", name: "COKO", color: "#00A3E0", avatarUrl: "/images/lyrics-performers/coko.webp" },
] as const satisfies readonly ExternalLyricsPerformer[];

const EXTERNAL_LYRICS_PERFORMER_BY_ID = new Map<number, ExternalLyricsPerformer>(
    EXTERNAL_LYRICS_PERFORMERS.map((performer) => [performer.id, performer]),
);
const EXTERNAL_LYRICS_PERFORMER_BY_SOURCE_ID = new Map<string, ExternalLyricsPerformer>(
    EXTERNAL_LYRICS_PERFORMERS.map((performer) => [performer.sourceId, performer]),
);

export function getExternalLyricsPerformer(id: number): ExternalLyricsPerformer | null {
    return EXTERNAL_LYRICS_PERFORMER_BY_ID.get(id) ?? null;
}

export function getExternalLyricsPerformerBySourceId(sourceId: string): ExternalLyricsPerformer | null {
    return EXTERNAL_LYRICS_PERFORMER_BY_SOURCE_ID.get(sourceId) ?? null;
}

export function getLyricsCharacterIdBySourceId(sourceId: string): number | null {
    const match = /^歌唱者-(\d+)$/.exec(sourceId);
    if (!match) return null;
    const characterId = Number(match[1]);
    return Number.isSafeInteger(characterId) && characterId >= 1 && characterId <= 26 ? characterId : null;
}

const OUTSIDE_CHARACTER_NAME_AVATAR_MAP: Record<string, string> = {
    "gumi": "/images/lyrics-performers/gumi.webp",
    "kasane teto": "/images/lyrics-performers/teto.webp",
    "重音テト": "/images/lyrics-performers/teto.webp",
    "teto": "/images/lyrics-performers/teto.webp",
    "flower": "/images/lyrics-performers/flower.webp",
    "v flower": "/images/lyrics-performers/flower.webp",
    "kamui gakupo": "/images/lyrics-performers/gakupo.webp",
    "神威がくぽ": "/images/lyrics-performers/gakupo.webp",
    "gakupo": "/images/lyrics-performers/gakupo.webp",
    "kafu": "/images/lyrics-performers/kafu.webp",
    "可不": "/images/lyrics-performers/kafu.webp",
    "gekiyaku": "/images/lyrics-performers/gekiyaku.webp",
    "ゲキヤク": "/images/lyrics-performers/gekiyaku.webp",
    "sekai": "/images/lyrics-performers/sekai.webp",
    "星界": "/images/lyrics-performers/sekai.webp",
    "zundamon": "/images/lyrics-performers/zundamon.webp",
    "ずんだもん": "/images/lyrics-performers/zundamon.webp",
    "kaai yuki": "/images/lyrics-performers/yuki.webp",
    "歌愛ユキ": "/images/lyrics-performers/yuki.webp",
    "yuki": "/images/lyrics-performers/yuki.webp",
    "adachi rei": "/images/lyrics-performers/adachi-rei.webp",
    "足立レイ": "/images/lyrics-performers/adachi-rei.webp",
    "rime": "/images/lyrics-performers/rime.webp",
    "裏命": "/images/lyrics-performers/rime.webp",
    "hanakuma chifuyu": "/images/lyrics-performers/chifuyu.webp",
    "花隈千冬": "/images/lyrics-performers/chifuyu.webp",
    "chifuyu": "/images/lyrics-performers/chifuyu.webp",
    "vy1": "/images/lyrics-performers/vy1.webp",
    "solaria": "/images/lyrics-performers/solaria.webp",
    "kotonoha aoi": "/images/lyrics-performers/kotonoha-aoi.webp",
    "琴葉 葵": "/images/lyrics-performers/kotonoha-aoi.webp",
    "琴葉葵": "/images/lyrics-performers/kotonoha-aoi.webp",
    "kotonoha akane": "/images/lyrics-performers/kotonoha-akane.webp",
    "琴葉 茜": "/images/lyrics-performers/kotonoha-akane.webp",
    "琴葉茜": "/images/lyrics-performers/kotonoha-akane.webp",
    "coko": "/images/lyrics-performers/coko.webp",
    "狐子": "/images/lyrics-performers/coko.webp",
    "koko": "/images/lyrics-performers/coko.webp",
    "haru": "/images/lyrics-performers/haru.webp",
    "羽累": "/images/lyrics-performers/haru.webp",
    "ia": "/images/lyrics-performers/ia.webp",
};

export function getOutsideCharacterAvatarUrl(name?: string | null): string | null {
    if (!name) return null;
    const normalized = name.trim().toLowerCase();
    return OUTSIDE_CHARACTER_NAME_AVATAR_MAP[normalized] ?? null;
}
