import type { Live2DModel } from "./models";

/**
 * Built-in fallback localized names for supporting and collaboration Live2D characters,
 * generated from the 5-region story libraries (jp, cn, tw, en, kr).
 * Used when `models.json` is format 1 or lacks localized `names` for the current UI locale.
 * All non-ASCII characters are stored as `\uXXXX` Unicode escapes so UI source files contain
 * zero raw Han characters.
 */
export interface SubCharacterFallbackEntry {
    names: Partial<Record<"jp" | "cn" | "tw" | "en" | "kr", string>>;
    aliases?: readonly string[];
}

/** Per-ownerKey fallback localized names across all 83 supporting and collaboration characters. */
export const SUB_CHARACTER_FALLBACK_NAMES: Record<string, SubCharacterFallbackEntry> = {
    anfather: { names: { jp: "\u8b19", cn: "\u674f\u7684\u7236\u4eb2", tw: "\u674f\u7684\u7236\u89aa", en: "An's Father", kr: "\uc548\uc758 \uc544\ube60" }, aliases: ["\u8c26", "\u767d\u77f3\u8c26", "Ken", "\u674f\u306e\u7236"] },
    arata: { names: { jp: "\u65b0", cn: "\u65b0", tw: "\u65b0", en: "Arata", kr: "\uc544\ub77c\ud0c0" }, aliases: ["\u8fdc\u91ce\u65b0", "Tono Arata"] },
    arisa: { names: { jp: "\u30a2\u30ea\u30b5", cn: "\u4e9a\u91cc\u7eb1", tw: "\u4e9e\u68a8\u6c99", en: "Arisa", kr: "\uc544\ub9ac\uc0ac" }, aliases: ["\u7231\u8389\u838e"] },
    asahi: { names: { jp: "\u65ed", cn: "\u65ed", tw: "\u65ed", en: "Asahi", kr: "\uc544\uc0ac\ud788" }, aliases: ["\u30a2\u30eb\u30d5\u30ec\u30c3\u30c9"] },
    asrunp: { names: { jp: "\u67ca", cn: "\u67ca", tw: "\u67ca", en: "Hiiragi", kr: "\ud788\uc774\ub77c\uae30" }, aliases: ["ASRUN\u306e\u30d7\u30ed\u30c7\u30e5\u30fc\u30b5\u30fc"] },
    bakunoreki: { names: { jp: "\u6b74", cn: "\u5386", tw: "\u6b77", en: "Reki", kr: "\ub808\ud0a4" }, aliases: ["\u514b\u5e78", "\u65e5\u91ce"] },
    byakkomachi: { names: { jp: "\u767d\u864e\u753a", cn: "\u767d\u864e\u753a", tw: "\u767d\u864e\u753a", en: "Byakkomachi", kr: "\ubc5f\ucf54\ub9c8\uce58" } },
    chairman: { names: { jp: "\u9b3c\u5cf6", cn: "\u9b3c\u5c9b", tw: "\u9b3c\u5cf6", en: "Kijima", kr: "\ud0a4\uc9c0\ub9c8" }, aliases: ["\u516d\u90ce"] },
    cordnukio: { names: { jp: "\u6d38\u592a\u90ce", cn: "\u6d38\u592a\u90ce", tw: "\u6d38\u592a\u90ce", en: "Kotaro", kr: "\ucf54\ud0c0\ub85c" }, aliases: ["\u30df\u30e5\u30fc\u30b8\u30b7\u30e3\u30f3"] },
    diva: { names: { jp: "\u6afb\u5b50", cn: "\u6a31\u5b50", tw: "\u6afb\u5b50", en: "Sakurako", kr: "\uc0ac\ucfe0\ub77c\ucf54" }, aliases: ["\u4ee4\u5b22", "\u6751\u9577\u306e\u5a18"] },
    egg_01_mametchi: { names: { jp: "\u307e\u3081\u3063\u3061", cn: "\u8c46\u4e01\u5409", tw: "\u8c46\u4e01\u5409", en: "Mametchi", kr: "\ub9c8\uba54\uce58" } },
    egg_02_kuchipatchi: { names: { jp: "\u304f\u3061\u3071\u3063\u3061", cn: "\u5927\u5634\u5409", tw: "\u5927\u5634\u5409", en: "Kuchipatchi", kr: "\uad6c\uce58\ud30c\uce58" } },
    egg_03_mimitchi: { names: { jp: "\u307f\u307f\u3063\u3061", cn: "\u5927\u8033\u5409", tw: "\u5927\u8033\u5409", en: "Mimitchi", kr: "\ubbf8\ubbf8\uce58" } },
    egg_04_memetchi: { names: { jp: "\u3081\u3081\u3063\u3061", cn: "\u73ab\u73ab\u5409", tw: "\u73ab\u73ab\u5409", en: "Memetchi", kr: "\uba54\uba54\uce58" } },
    enst_01izumi: { names: { jp: "\u6cc9", cn: "\u6cc9", tw: "\u6cc9", en: "Izumi", kr: "\uc774\uc988\ubbf8" }, aliases: ["\u6fd1\u540d\u6cc9", "Sena Izumi"] },
    enst_02chiaki: { names: { jp: "\u5343\u79cb", cn: "\u5343\u79cb", tw: "\u5343\u79cb", en: "Chiaki", kr: "\uce58\uc544\ud0a4" }, aliases: ["\u5b88\u6cfd\u5343\u79cb", "Morisawa Chiaki"] },
    enst_03natsume: { names: { jp: "\u590f\u76ee", cn: "\u590f\u76ee", tw: "\u590f\u76ee", en: "Natsume", kr: "\ub098\uce20\uba54" }, aliases: ["\u9006\u5148\u590f\u76ee", "Sakasaki Natsume"] },
    enst_04jun: { names: { jp: "\u30b8\u30e5\u30f3", cn: "\u7eaf", tw: "\u7d14", en: "Jun", kr: "\uc970" }, aliases: ["\u6d9f\u7eaf", "Sazanami Jun"] },
    futaba: { names: { jp: "\u4e8c\u8449", cn: "\u4e8c\u53f6", tw: "\u4e8c\u8449", en: "Futaba", kr: "\ud6c4\ud0c0\ubc14" } },
    hanano: { names: { jp: "\u82b1\u4e43", cn: "\u82b1\u4e43", tw: "\u82b1\u4e43", en: "Hanano", kr: "\ud558\ub098\ub178" } },
    harukafan: { names: { jp: "\u771f\u4f9d", cn: "\u771f\u4f9d", tw: "\u771f\u4f9d", en: "Mai", kr: "\ub9c8\uc774" } },
    hikarin: { names: { jp: "\u3072\u304b\u308a\u3093", cn: "\u5149\u5149", tw: "\u5c0f\u5149", en: "Hikarin", kr: "\ud788\uce74\ub9c1" } },
    igs_princess: { names: { jp: "\u30a8\u30eb", cn: "\u827e\u5c14", tw: "\u827e\u723e", en: "Elle", kr: "\uc5d8" }, aliases: ["\u5c11\u5973"] },
    iori: { names: { jp: "\u30a4\u30aa\u30ea", cn: "\u4f0a\u7ec7", tw: "\u4f0a\u7e54", en: "Iori", kr: "\uc774\uc624\ub9ac" } },
    kanadefather: { names: { jp: "\u594f\u306e\u7236", cn: "\u594f\u7684\u7236\u4eb2", tw: "\u594f\u7684\u7236\u89aa", en: "Kanade's Father", kr: "\uce74\ub098\ub370\uc758 \uc544\ube60" } },
    kanademother: { names: { jp: "\u594f\u306e\u6bcd", cn: "\u594f\u7684\u6bcd\u4eb2", tw: "\u594f\u7684\u6bcd\u89aa", en: "Kanade's Mother", kr: "\uce74\ub098\ub370\uc758 \uc5c4\ub9c8" } },
    liondancerobot: { names: { jp: "\u7345\u5b50\u821e\u30ed\u30dc", cn: "\u821e\u72ee\u673a\u5668\u4eba", tw: "\u821e\u7345\u6a5f\u5668\u4eba", en: "Lion Dance Robot", kr: "\uc0ac\uc790\ucda4 \ub85c\ubd07" }, aliases: ["\u7345\u5b50\u821e\u306e\u795e", "\u7345\u5b50\u821e"] },
    mafuyufather: { names: { jp: "\u307e\u3075\u3086\u306e\u7236", cn: "\u771f\u51ac\u7684\u7236\u4eb2", tw: "\u771f\u51ac\u7684\u7236\u89aa", en: "Mafuyu's Father", kr: "\ub9c8\ud6c4\uc720\uc758 \uc544\ube60" } },
    mafuyumother: { names: { jp: "\u307e\u3075\u3086\u306e\u6bcd", cn: "\u771f\u51ac\u7684\u6bcd\u4eb2", tw: "\u771f\u51ac\u7684\u6bcd\u89aa", en: "Mafuyu's Mother", kr: "\ub9c8\ud6c4\uc720\uc758 \uc5c4\ub9c8" } },
    mikudayo: { names: { jp: "\u30df\u30af\u306e\u7740\u3050\u308b\u307f", cn: "\u521d\u97f3\u672a\u6765\u7684\u73a9\u5076\u88c5", tw: "\u521d\u97f3\u672a\u4f86\u73a9\u5076", en: "Mikudayo Mascot", kr: "\ubbf8\ucfe0 \uc778\ud615 \ud0c8" }, aliases: ["Mikudayo", "\u5996\u7cbe"] },
    mikudayoteacher: { names: { jp: "\u30c0\u30e8\u30fc\u5148\u751f", cn: "\u5927\u6709\u8001\u5e08", tw: "DAYO\u6821\u9577", en: "Principal Mikudayo", kr: "\uc5d0\uc624 \uc120\uc0dd\ub2d8" }, aliases: ["\u30df\u30af\u30c0\u30e8\u30fc\u6751\u9577"] },
    mikurobo: { names: { jp: "\u30a2\u30af\u30cf\u30b5\u30ab\u30a8\u30cc\u30fc", cn: "\u90aa\u4e0d\u80dc\u6b63", tw: "\u90aa\u4e0d\u52dd\u6b63", en: "Evil's Bane", kr: "\uc545\uc740\ub9dd\ud574\uc624" }, aliases: ["\u521d\u97f3\u673a\u5668\u4eba", "Mikurobo"] },
    mio: { names: { jp: "\u30df\u30aa", cn: "\u7f8e\u7eea", tw: "\u6faa", en: "Mio", kr: "\ubbf8\uc624" } },
    miu: { names: { jp: "\u672a\u7fbd", cn: "\u672a\u7fbd", tw: "\u672a\u7fbd", en: "Miu", kr: "\ubbf8\uc6b0" } },
    mizukisister: { names: { jp: "\u745e\u5e0c\u306e\u59c9", cn: "\u745e\u5e0c\u7684\u59d0\u59d0", tw: "\u745e\u5e0c\u7684\u59ca\u59ca", en: "Mizuki's Sister", kr: "\ubbf8\uc988\ud0a4\uc758 \uc5b8\ub2c8" } },
    mrmrhouse_landlord: { names: { jp: "\u6709\u6fa4", cn: "\u6709\u6cfd", tw: "\u6709\u6fa4", en: "Arisawa", kr: "\uc544\ub9ac\uc0ac\uc640" }, aliases: ["\u304a\u3070\u3042\u3055\u3093", "\u5927\u5bb6"] },
    nagi: { names: { jp: "\u51ea", cn: "\u51ea", tw: "\u51ea", en: "Nagi", kr: "\ub098\uae30" } },
    nanamin: { names: { jp: "\u306a\u306a\u307f\u3093", cn: "\u4e03\u4e03", tw: "\u4e03\u6d77\u6d77", en: "Nanamin", kr: "\ub098\ub098\ubc0d" } },
    nenedayo: { names: { jp: "\u30cd\u30cd\u30ed\u30dc", cn: "\u5b81\u5b81\u673a\u5668\u4eba", tw: "\u5be7\u5be7\u6a5f\u5668\u4eba", en: "Robo-Nene", kr: "\ub124\ub124 \ub85c\ubd07" }, aliases: ["Nenerobo", "\u30cd\u30fb\u30cd\u30fc", "\u30ed\u30dc\u30c3\u30c8", "\u30cf\u30ab\u30a4\u30b9\u30f3\u30bc\u30fc", "\u60aa\u3044\u30ed\u30dc\u30dc\u30f3\u30dc\u30f3"] },
    otoribrother1: { names: { jp: "\u6176\u4ecb", cn: "\u5e86\u4ecb", tw: "\u6176\u4ecb", en: "Keisuke", kr: "\ucf00\uc774\uc2a4\ucf00" }, aliases: ["\u6176\u4ecb\u53f8\u4ee4\u5b98"] },
    otoribrother2: { names: { jp: "\u6676\u4ecb", cn: "\u6676\u4ecb", tw: "\u6676\u4ecb", en: "Shosuke", kr: "\uc1fc\uc2a4\ucf00" } },
    otorifather: { names: { jp: "\u3048\u3080\u306e\u7236", cn: "\u7b11\u68a6\u7684\u7236\u4eb2", tw: "\u7b11\u5922\u7684\u7236\u89aa", en: "Emu's Father", kr: "\uc5d0\ubb34\uc758 \uc544\ube60" } },
    otorirakunosuke: { names: { jp: "\u697d\u4e4b\u4ecb", cn: "\u4e50\u4e4b\u4ecb", tw: "\u6a02\u4e4b\u4ecb", en: "Rakunosuke", kr: "\ub77c\ucfe0\ub178\uc2a4\ucf00" } },
    otorisister: { names: { jp: "\u3072\u306a\u305f", cn: "\u9633\u8bd7", tw: "\u65e5\u5411", en: "Hinata", kr: "\ud788\ub098\ud0c0" } },
    partner: { names: { jp: "\u5927\u6cb3", cn: "\u5927\u6cb3", tw: "\u5927\u6cb3", en: "Taiga", kr: "\ud0c0\uc774\uac00" }, aliases: ["\u8b0e\u306e\u7537"] },
    riho: { names: { jp: "\u9577\u8c37\u5ddd", cn: "\u957f\u8c37\u5ddd", tw: "\u9577\u8c37\u5ddd", en: "Hasegawa", kr: "\ud558\uc138\uac00\uc640" } },
    rilley: { names: { jp: "\u30e9\u30a4\u30ea\u30fc", cn: "\u83b1\u5229", tw: "\u840a\u5229", en: "Riley", kr: "\ub77c\uc77c\ub9ac" } },
    rival_douglas: { names: { jp: "\u30c0\u30b0\u30e9\u30b9", cn: "\u9053\u683c\u62c9\u65af", tw: "\u9053\u683c\u62c9\u65af", en: "Douglas", kr: "\ub354\uae00\ub77c\uc2a4" } },
    rivalidol_akari: { names: { jp: "\u3042\u304b\u308a", cn: "\u706f", tw: "\u71c8", en: "Akari", kr: "\uc544\uce74\ub9ac" } },
    rivalidol_chiharu: { names: { jp: "\u5343\u6674", cn: "\u5343\u6674", tw: "\u5343\u6674", en: "Chiharu", kr: "\uce58\ud558\ub8e8" } },
    rivalidol_yu: { names: { jp: "\u7d50\u96e8", cn: "\u7ed3\u96e8", tw: "\u7d50\u96e8", en: "Yu", kr: "\uc720\uc6b0" } },
    rivalsisters_elena: { names: { jp: "\u30a8\u30ec\u30ca", cn: "\u827e\u7433\u5a1c", tw: "\u827e\u7433\u5a1c", en: "Elena", kr: "\uc5d8\ub808\ub098" } },
    rivalsisters_rebecca: { names: { jp: "\u30ec\u30d9\u30c3\u30ab", cn: "\u745e\u8d1d\u5361", tw: "\u857e\u8c9d\u5361", en: "Rebecca", kr: "\ub808\ubca0\uce74" } },
    rivaltwins_cedric: { names: { jp: "\u30bb\u30c9\u30ea\u30c3\u30af", cn: "\u585e\u5fb7\u91cc\u514b", tw: "\u8cfd\u5fb7\u5229\u514b", en: "Cedric", kr: "\uc138\ub4dc\ub9ad" } },
    rivaltwins_slade: { names: { jp: "\u30b9\u30ec\u30a4\u30c9", cn: "\u65af\u96f7\u5fb7", tw: "\u53f2\u96f7\u5fb7", en: "Slade", kr: "\uc2ac\ub808\uc774\ub4dc" } },
    saito: { names: { jp: "\u658e\u85e4", cn: "\u658b\u85e4", tw: "\u9f4b\u85e4", en: "Saito", kr: "\uc0ac\uc774\ud1a0" } },
    sakaki: { names: { jp: "\u698a", cn: "\u698a", tw: "\u698a", en: "Sakaki", kr: "\uc0ac\uce74\ud0a4" } },
    saku: { names: { jp: "\u6714", cn: "\u6714", tw: "\u6714", en: "Saku", kr: "\uc0ac\ucfe0" } },
    sanrio_cinnamoroll: { names: { jp: "\u30b7\u30ca\u30e2\u30f3", cn: "\u5927\u8033\u72d7", tw: "\u5927\u8033\u72d7\u559c\u62ff", en: "Cinnamoroll", kr: "\uc2dc\ub098\ubaac" }, aliases: ["\u7389\u6842\u72d7"] },
    sanrio_kitty: { names: { jp: "\u30ad\u30c6\u30a3", cn: "\u51ef\u8482\u732b", tw: "Hello Kitty", en: "Hello Kitty", kr: "\ud0a4\ud2f0" } },
    sanrio_kuromi: { names: { jp: "\u30af\u30ed\u30df", cn: "\u9177\u6d1b\u7c73", tw: "\u9177\u6d1b\u7c73", en: "KUROMI", kr: "\ucfe0\ub85c\ubbf8" }, aliases: ["\u5e93\u6d1b\u7c73"] },
    sanrio_mymelody: { names: { jp: "\u30e1\u30ed\u30c7\u30a3", cn: "\u7f8e\u4e50\u8482", tw: "\u7f8e\u6a02\u8482", en: "My Melody", kr: "\uba5c\ub85c\ub514" } },
    sanrio_pochacco: { names: { jp: "\u30dd\u30c1\u30e3\u30c3\u30b3", cn: "\u5e15\u6070\u72d7", tw: "\u5e15\u6070\u72d7", en: "Pochacco", kr: "\ud3ec\ucc28\ucf54" } },
    sanrio_pompompurin: { names: { jp: "\u30d7\u30ea\u30f3", cn: "\u5e03\u4e01\u72d7", tw: "\u5e03\u4e01\u72d7", en: "Pompompurin", kr: "\ud478\ub9b0" } },
    shinonomefather: { names: { jp: "\u7236\u89aa", cn: "\u7236\u4eb2", tw: "\u7236\u89aa", en: "Father", kr: "\uc544\ube60" }, aliases: ["\u4e1c\u4e91\u7236", "Shinonome Father"] },
    souma: { names: { jp: "\u98af\u771f", cn: "\u98d2\u771f", tw: "\u98af\u771f", en: "Soma", kr: "\uc18c\uc6b0\ub9c8" } },
    tatsuya: { names: { jp: "\u9054\u4e5f", cn: "\u8fbe\u4e5f", tw: "\u9054\u4e5f", en: "Tatsuya", kr: "\ud0c0\uce20\uc57c" }, aliases: ["EVER\u30ea\u30fc\u30c0\u30fc"] },
    touyafather: { names: { jp: "\u51ac\u5f25\u306e\u7236", cn: "\u51ac\u5f25\u7684\u7236\u4eb2", tw: "\u51ac\u5f4c\u7684\u7238\u7238", en: "Toya's Father", kr: "\ud1a0\uc6b0\uc57c\uc758 \uc544\ubc84\uc9c0" } },
    tsukasadoll: { names: { jp: "\u3046\u3055\u304e\u306e\u306c\u3044\u3050\u308b\u307f", cn: "\u5154\u5154\u73a9\u5076", tw: "\u5154\u5b50\u73a9\u5076", en: "Bunny Plushie", kr: "\ud1a0\ub07c \uc778\ud615" } },
    wl3_extra01: { names: { jp: "\u5c11\u5973", cn: "\u5c11\u5973", tw: "\u5c11\u5973", en: "Girl", kr: "\uc18c\ub140" } },
    wl3_extra02: { names: { jp: "\u30e9\u30a4\u30bb", cn: "\u6765\u6fd1", tw: "\u4f86\u7028", en: "Raise", kr: "\ub77c\uc774\uc138" }, aliases: ["\u9752\u5e74", "\u9ad8\u6821\u751f\u306e\u9752\u5e74"] },
    wl3_extra03: { names: { jp: "\u30df\u30ca\u30c8", cn: "\u51d1", tw: "\u6e4a", en: "Minato", kr: "\ubbf8\ub098\ud1a0" } },
    wl3_extra04: { names: { jp: "\u5c11\u5973", cn: "\u5c11\u5973", tw: "\u5c11\u5973", en: "Girl", kr: "\uc18c\ub140" } },
    wl3_extra05: { names: { jp: "\u5b88\u5c4b", cn: "\u5b88\u5c4b", tw: "\u5b88\u5c4b", en: "Moriya", kr: "\ubaa8\ub9ac\uc57c" } },
    wl3_extra06: { names: { jp: "\u9593\u5cf6", cn: "\u95f4\u5c9b", tw: "\u9593\u5cf6", en: "Majima", kr: "\ub9c8\uc9c0\ub9c8" } },
    wl3_extra07: { names: { jp: "\u4fca\u8f1d", cn: "\u4fca\u8f89", tw: "\u4fca\u8f1d", en: "Toshiki", kr: "\ud1a0\uc2dc\ud0a4" } },
    wl3_extra08: { names: { jp: "\u5927\u8f1d", cn: "\u5927\u8f89", tw: "\u5927\u8f1d", en: "Daiki", kr: "\ub2e4\uc774\ud0a4" } },
    wondermascot: { names: { jp: "\u7740\u3050\u308b\u307f", cn: "\u7a7f\u73a9\u5076\u88c5\u7684\u4eba", tw: "\u73a9\u5076\u88dd", en: "Mascot", kr: "\uc778\ud615 \ud0c8" } },
    yoshiki: { names: { jp: "\u771f\u5802", cn: "\u771f\u5802", tw: "\u771f\u5802", en: "Shindo", kr: "\uc2e0\ub3c4" } },
    youta: { names: { jp: "\u8449\u592a", cn: "\u53f6\u592a", tw: "\u8449\u592a", en: "Yota", kr: "\uc694\uc6b0\ud0c0" } },
    yuina: { names: { jp: "\u552f\u5948", cn: "\u552f\u5948", tw: "\u552f\u5948", en: "Yuina", kr: "\uc720\uc774\ub098" }, aliases: ["\u307f\u306e\u308a\u306e\u30d5\u30a1\u30f3"] },
    yukihira: { names: { jp: "\u96ea\u5e73", cn: "\u96ea\u5e73", tw: "\u96ea\u5e73", en: "Yukihira", kr: "\uc720\ud0a4\ud788\ub77c" } },
    yuuka: { names: { jp: "\u5915\u590f", cn: "\u5915\u590f", tw: "\u5915\u590f", en: "Yuka", kr: "\uc720\uc6b0\uce74" }, aliases: ["\u4eba\u9b5a\u59eb"] },
};

/** Per-model-id fallback overrides for models whose story display name differs from their ownerKey. */
export const SUB_CHARACTER_ID_OVERRIDES: Record<string, SubCharacterFallbackEntry> = {
    sub_anfatheryoung: { names: { jp: "\u8b19", cn: "\u8c26", tw: "\u8b19", en: "Ken", kr: "\ucf04" } },
    sub_rilleyyoung: { names: { jp: "\u82e5\u3044\u30e9\u30a4\u30ea\u30fc", cn: "\u5e74\u8f7b\u65f6\u7684\u83b1\u5229", tw: "\u5e74\u8f15\u7684\u840a\u5229", en: "Young Riley", kr: "\uc80a\uc740 \ub77c\uc77c\ub9ac" } },
    v2_03honami_april2025_school: { names: { jp: "\u30bf\u30f3\u30c8\u30aa\u30bf\u30d9", cn: "\u591a\u5403\u70b9\u513f", tw: "\u300c\u54c6\u5403\u5178\u300d", en: "Mealmonger", kr: "\ub9c8\ub2c8\uba38\uac70" } },
    v2_14emu_igs_princess: { names: { jp: "\u30a8\u30eb", cn: "\u827e\u5c14", tw: "\u827e\u723e", en: "Elle", kr: "\uc5d8" }, aliases: ["\u30a8\u30eb"] },
    v2_15nene_april2026_transform: { names: { jp: "\u54b2\u5e0c\u304c\u5316\u3051\u305f\u5be7\u3005" } },
};

/** Resolve built-in fallback localized names for a supporting/collab/mob Live2D model. */
export function resolveFallbackSubCharacter(
    model: Pick<Live2DModel, "id" | "ownerKey" | "subName">,
): SubCharacterFallbackEntry | null {
    const byId = SUB_CHARACTER_ID_OVERRIDES[model.id];
    const byOwner = (model.ownerKey ? SUB_CHARACTER_FALLBACK_NAMES[model.ownerKey] : undefined)
        ?? (model.subName ? SUB_CHARACTER_FALLBACK_NAMES[model.subName] : undefined);
    if (byId && byOwner) {
        const aliases = [...(byId.aliases ?? []), ...(byOwner.aliases ?? [])];
        return {
            names: { ...byOwner.names, ...byId.names },
            ...(aliases.length > 0 ? { aliases } : {}),
        };
    }
    return byId ?? byOwner ?? null;
}
