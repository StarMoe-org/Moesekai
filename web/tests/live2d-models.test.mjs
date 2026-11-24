import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as storyCore from "@moesekai/story-core";
import * as modelsModule from "../src/lib/live2dViewer/models.ts";
import * as subNamesModule from "../src/lib/live2dViewer/subCharacterNames.ts";

const {
    LIVE2D_COSTUME_TOKENS,
    compareLive2DModels,
    deriveSubOwnerKey,
    live2dModelsFromListings,
    parseLive2DModel,
    parseLive2DModelId,
    parseLive2DSubVariant,
} = modelsModule;

const {
    SUB_CHARACTER_FALLBACK_NAMES,
    SUB_CHARACTER_ID_OVERRIDES,
    resolveFallbackSubCharacter,
} = subNamesModule;

const WEB_ROOT = new URL("../", import.meta.url);

function loadLabelsModule() {
    const source = readFileSync(new URL("src/components/live2d/labels.ts", WEB_ROOT), "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mod = { exports: {} };
    const unitLabelKeys = {
        ln: "common.units.ln",
        mmj: "common.units.mmj",
        vbs: "common.units.vbs",
        ws: "common.units.ws",
        "25ji": "common.units.25ji",
        vs: "common.units.vs",
    };
    const requireStub = (id) => {
        if (id === "@moesekai/story-core") return storyCore;
        if (id === "@/lib/i18n") {
            return {
                getCharacterName: (t, characterId, variant = "full") => {
                    const key = `common.characters.${variant}.${characterId}`;
                    const translated = t(key);
                    return translated !== key ? translated : `Character ${characterId}`;
                },
            };
        }
        if (id === "@/lib/live2dViewer/models") return modelsModule;
        if (id === "@/lib/live2dViewer/subCharacterNames") return subNamesModule;
        if (id === "@/types/types") return { UNIT_ID_LABEL_KEYS: unitLabelKeys };
        throw new Error(`Unexpected import in labels.ts: ${id}`);
    };
    new Function("require", "exports", "module", compiled)(requireStub, mod.exports, mod);
    return mod.exports;
}

const labelsModule = loadLabelsModule();
const {
    groupLive2DModelsByOwner,
    live2dCostumeLabel,
    live2dGroupKey,
    live2dGroupName,
    live2dModelMatchesQuery,
    live2dMotionLabel,
    live2dOwnerAliases,
    live2dOwnerName,
    live2dSecondaryOwnerName,
    localeToRegionKey,
} = labelsModule;

const TEST_MESSAGES = {
    "common.characters.full.1": "Hoshino Ichika",
    "common.characters.short.1": "Ichika",
    "common.characters.full.3": "Mochizuki Honami",
    "common.characters.short.3": "Honami",
    "common.characters.full.14": "Otori Emu",
    "common.characters.short.14": "Emu",
    "common.characters.full.15": "Kusanagi Nene",
    "common.characters.short.15": "Nene",
    "common.characters.full.18": "Asahina Mafuyu",
    "common.characters.short.18": "Mafuyu",
    "common.characters.full.21": "Hatsune Miku",
    "common.characters.short.21": "Miku",
    "common.units.ws": "Wonderlands x Showtime",
    "common.units.ln": "Leo/need",
    "common.units.25ji": "Nightcord at 25:00",
    "page.live2d.collab": "Collab",
    "page.live2d.kind.character": "Characters",
    "page.live2d.kind.sub": "Supporting",
    "page.live2d.kind.collab": "Collaborations",
    "page.live2d.kind.mob": "Mob",
    "page.live2d.costume.normal": "Normal",
    "page.live2d.costume.casual": "Casual",
    "page.live2d.costume.school": "School",
    "page.live2d.costume.unit": "Unit",
    "page.live2d.costume.jc": "Middle School",
    "page.live2d.costume.april": "April Fools",
    "page.live2d.costume.black": "Silhouette",
    "page.live2d.costume.zoom": "Close-up",
    "page.live2d.costume.back": "Back view",
    "page.live2d.costume.live": "Live",
    "page.live2d.costume.stage": "Stage",
    "page.live2d.costume.rw": "RAD WEEKEND",
    "page.live2d.costume.young": "Young",
    "page.live2d.costume.child": "Child",
    "page.live2d.costume.patient": "Hospital",
    "page.live2d.costume.side": "Side view",
    "page.live2d.costume.sunset": "Sunset",
    "page.live2d.costume.fancostume": "Fan costume",
    "page.live2d.costume.transform": "Transformed",
    "page.live2d.costume.princess": "Princess",
    "page.live2d.costume.ponytail": "Ponytail",
    "page.live2d.costume.vest": "Vest",
    "page.live2d.costume.liondance": "Lion dance",
    "page.live2d.costume.dark": "Dark",
    "page.live2d.costume.long": "Long hair",
    "page.live2d.costume.still": "Still",
    "page.live2d.costume.mask": "Mask",
    "page.live2d.costume.cheerful": "Cheer",
    "page.live2d.costume.cloth": "Outfit {number}",
};

function t(key, values) {
    const raw = TEST_MESSAGES[key];
    if (!raw) return key;
    if (!values) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`));
}

test("LIVE2D_COSTUME_TOKENS includes all 20 original and 22 new tokens", () => {
    assert.equal(LIVE2D_COSTUME_TOKENS.length, 42);
    for (const token of [
        "normal", "casual", "school", "april",
        "black", "zoom", "back", "live", "stage", "rw", "young", "child", "patient",
        "side", "sunset", "fancostume", "transform", "princess", "ponytail", "vest",
        "liondance", "dark", "long", "still", "mask", "cheerful",
    ]) {
        assert.ok(LIVE2D_COSTUME_TOKENS.includes(token), `missing token ${token}`);
    }
});

test("parseLive2DModelId decomposes compound main-character tokens cleanly", () => {
    assert.deepEqual(parseLive2DModelId("21miku_wonderblack").costume, [{ unit: "ws" }, { token: "black" }]);
    assert.deepEqual(parseLive2DModelId("21miku_bandblack").costume, [{ unit: "ln" }, { token: "black" }]);
    assert.deepEqual(parseLive2DModelId("01ichika_normalblack").costume, [{ token: "normal" }, { token: "black" }]);
    assert.deepEqual(parseLive2DModelId("01ichika_casualblack").costume, [{ token: "casual" }, { token: "black" }]);
    assert.deepEqual(parseLive2DModelId("06haruka_cloth002black").costume, [{ cloth: 2 }, { token: "black" }]);
    assert.deepEqual(parseLive2DModelId("18mafuyu_darkcloth001").costume, [{ token: "dark" }, { cloth: 1 }]);
    assert.deepEqual(parseLive2DModelId("18mafuyu_darkunit").costume, [{ token: "dark" }, { token: "unit" }]);
    assert.deepEqual(parseLive2DModelId("01ichika_longnormal").costume, [{ token: "long" }, { token: "normal" }]);
    assert.deepEqual(parseLive2DModelId("01ichika_longunit").costume, [{ token: "long" }, { token: "unit" }]);
    assert.deepEqual(parseLive2DModelId("19ena_jccloth").costume, [{ token: "jc" }, { token: "casual" }]);
    assert.deepEqual(parseLive2DModelId("19ena_jc_cloth").costume, [{ token: "jc" }, { token: "casual" }]);
    assert.deepEqual(parseLive2DModelId("16rui_maskcloth003").costume, [{ token: "mask" }, { cloth: 3 }]);
    assert.deepEqual(parseLive2DModelId("v2_20mizuki_culture_02").costume, [{ token: "culture" }, { variant: 2 }]);
    assert.deepEqual(parseLive2DModelId("v2_03honami_april2025_school").costume, [
        { token: "april", variant: 2025 },
        { token: "school" },
    ]);
    assert.deepEqual(parseLive2DModelId("v2_15nene_april2026_transform").costume, [
        { token: "april", variant: 2026 },
        { token: "transform" },
    ]);
    assert.deepEqual(parseLive2DModelId("v2_14emu_igs_princess").costume, [
        { text: "igs" },
        { token: "princess" },
    ]);
    assert.deepEqual(parseLive2DModelId("13tsukasa_liondance").costume, [{ token: "liondance" }]);
});

test("live2dModelsFromListings and parseLive2DModel classify special main-char, sub, and collab models", () => {
    const listed = live2dModelsFromListings(
        [
            "v2_03honami_april2025_school",
            "v2_15nene_april2026_transform",
            "v2_14emu_igs_princess",
            "v2_sub_sanrio_kitty",
            "v2_sub_enst_01izumi_stage",
        ],
        [
            "v2_03honami_motion_base",
            "v2_15nene_motion_base",
            "v2_14emu_motion_base",
            "sub_sanrio_kitty_motion_base",
            "v2_sub_enst_01izumi_motion_base",
        ],
    );
    const byId = new Map(listed.map(m => [m.id, m]));
    // Special main-character models resolve as `character` with canonical asset & motion paths.
    assert.equal(byId.get("v2_03honami_april2025_school")?.kind, "character");
    assert.equal(byId.get("v2_03honami_april2025_school")?.characterId, 3);
    assert.equal(byId.get("v2_03honami_april2025_school")?.asset, "live2d/model/v2_03honami_april2025_school");
    assert.equal(byId.get("v2_03honami_april2025_school")?.motion, "live2d/motion/v2_03honami_motion_base");
    assert.equal(byId.get("v2_15nene_april2026_transform")?.kind, "character");
    assert.equal(byId.get("v2_15nene_april2026_transform")?.characterId, 15);
    assert.equal(byId.get("v2_14emu_igs_princess")?.kind, "character");
    assert.equal(byId.get("v2_14emu_igs_princess")?.characterId, 14);
    // Collab models are classified as `collab`.
    assert.equal(byId.get("v2_sub_sanrio_kitty")?.kind, "collab");
    assert.equal(byId.get("v2_sub_sanrio_kitty")?.ownerKey, "sanrio_kitty");
    assert.equal(byId.get("v2_sub_sanrio_kitty")?.motion, "live2d/motion/sub_sanrio_kitty_motion_base");
    assert.equal(byId.get("v2_sub_enst_01izumi_stage")?.kind, "collab");
    assert.equal(byId.get("v2_sub_enst_01izumi_stage")?.ownerKey, "enst_01izumi");
    assert.deepEqual(byId.get("v2_sub_enst_01izumi_stage")?.subVariant, [{ token: "stage" }]);

    const enriched = parseLive2DModel({
        id: "sub_anfather",
        asset: "live2d/model/sub_anfather",
        motion: "live2d/motion/sub_anfather_motion_base",
        kind: "sub",
        subCharacterId: 12,
        assetName: "sub_anfather",
        ownerKey: "anfather",
        iconBundle: "chr_ts_sub_anfather",
        unit: "street",
        name: "\u8b19",
        aliases: ["\u767d\u77f3\u8b19"],
        names: { jp: "\u8b19", cn: "\u8c26", tw: "\u8b19", en: "Ken", kr: "\ucf04" },
        episodeCount: 42,
        episodes: ["event:10/1", "event:25/8"],
    });
    assert.equal(enriched.subCharacterId, 12);
    assert.equal(enriched.asset, "live2d/model/sub_anfather");
    assert.equal(enriched.motion, "live2d/motion/sub_anfather_motion_base");
    assert.equal(enriched.assetName, "sub_anfather");
    assert.equal(enriched.ownerKey, "anfather");
    assert.equal(enriched.iconBundle, "chr_ts_sub_anfather");
    assert.equal(enriched.unit, "street");
    assert.equal(enriched.name, "\u8b19");
    assert.deepEqual(enriched.aliases, ["\u767d\u77f3\u8b19"]);
    assert.equal(enriched.names.en, "Ken");
    assert.equal(enriched.episodeCount, 42);
    assert.deepEqual(enriched.episodes, ["event:10/1", "event:25/8"]);
});

test("ownerKey derivation, second-pass 02 merge, and subVariant parsing match contract", () => {
    assert.equal(deriveSubOwnerKey("sub_anfather_rw"), "anfather");
    assert.equal(deriveSubOwnerKey("sub_anfather_black"), "anfather");
    assert.equal(deriveSubOwnerKey("sub_anfatheryoung"), "anfather");
    assert.equal(deriveSubOwnerKey("sub_anfatheryoung_black"), "anfather");
    assert.equal(deriveSubOwnerKey("v2_sub_enst_01izumi_stage"), "enst_01izumi");
    assert.equal(deriveSubOwnerKey("sub_wl3_extra02"), "wl3_extra02");
    assert.equal(deriveSubOwnerKey("sub_otoribrother1"), "otoribrother1");
    assert.equal(deriveSubOwnerKey("sub_otoribrother2"), "otoribrother2");

    assert.deepEqual(parseLive2DSubVariant("sub_anfather_rw", "anfather"), [{ token: "rw" }]);
    assert.deepEqual(parseLive2DSubVariant("sub_anfather_black", "anfather"), [{ token: "black" }]);
    assert.deepEqual(parseLive2DSubVariant("sub_anfatheryoung", "anfather"), [{ token: "young" }]);
    assert.deepEqual(parseLive2DSubVariant("v2_sub_enst_01izumi_stage", "enst_01izumi"), [{ token: "stage" }]);
    assert.deepEqual(parseLive2DSubVariant("sub_arisa02_live01", "arisa"), [{ variant: 2 }, { token: "live", variant: 1 }]);
    assert.deepEqual(parseLive2DSubVariant("sub_miu_cloth", "miu"), [{ token: "casual" }]);

    const models = live2dModelsFromListings(
        [
            "sub_arisa",
            "sub_arisa02_live01",
            "sub_wl3_extra02",
            "sub_otoribrother1",
            "sub_otoribrother2",
        ],
        [],
    );
    const byId = new Map(models.map(m => [m.id, m]));
    // `arisa02` merges into `arisa` because `arisa` exists.
    assert.equal(byId.get("sub_arisa02_live01")?.ownerKey, "arisa");
    assert.deepEqual(byId.get("sub_arisa02_live01")?.subVariant, [{ variant: 2 }, { token: "live", variant: 1 }]);
    // `wl3_extra02` has no `wl3_extra` sibling, so it stays intact.
    assert.equal(byId.get("sub_wl3_extra02")?.ownerKey, "wl3_extra02");
    assert.equal(byId.get("sub_otoribrother1")?.ownerKey, "otoribrother1");
    assert.equal(byId.get("sub_otoribrother2")?.ownerKey, "otoribrother2");
});

test("compareLive2DModels orders kinds and sub variants by tier and generation", () => {
    const models = live2dModelsFromListings(
        [
            "mob_a",
            "v2_sub_sanrio_kitty",
            "sub_anfather_black",
            "v2_sub_anfather_black",
            "sub_anfather_zoom",
            "sub_anfatheryoung",
            "sub_anfather_rw",
            "sub_anfather",
            "v2_sub_anfather",
            "v2_01ichika_casual",
        ],
        [],
    );
    assert.deepEqual(models.map(m => m.id), [
        "v2_01ichika_casual",
        "v2_sub_anfather",
        "sub_anfather",
        "sub_anfather_rw",
        "sub_anfatheryoung",
        "sub_anfather_zoom",
        "v2_sub_anfather_black",
        "sub_anfather_black",
        "v2_sub_sanrio_kitty",
        "mob_a",
    ]);
    assert.equal(compareLive2DModels(models[1], models[2]) < 0, true);
});

test("labels.ts localization, secondary name, aliases, costume label, search, and grouping", () => {
    assert.equal(localeToRegionKey("zh-CN"), "cn");
    assert.equal(localeToRegionKey("zh-TW"), "tw");
    assert.equal(localeToRegionKey("en-US"), "en");
    assert.equal(localeToRegionKey("ja-JP"), "jp");
    assert.equal(localeToRegionKey("ko-KR"), "kr");

    const kenMain = parseLive2DModel({
        id: "sub_anfather",
        asset: "live2d/model/sub_anfather",
        motion: null,
        kind: "sub",
        ownerKey: "anfather",
        name: "\u8b19",
        aliases: ["\u767d\u77f3\u8b19", "\u8b19", "Master"],
        names: { jp: "\u8b19", cn: "\u8c26", tw: "\u8b19", en: "Ken", kr: "\ucf04" },
        episodeCount: 30,
        episodes: ["event:10/1"],
    });
    const kenRw = parseLive2DModel({
        id: "sub_anfather_rw",
        asset: "live2d/model/sub_anfather_rw",
        motion: null,
        kind: "sub",
        ownerKey: "anfather",
        name: "\u8b19",
        names: { jp: "\u8b19", cn: "\u8c26", tw: "\u8b19", en: "Ken", kr: "\ucf04" },
        episodeCount: 5,
    });
    const kenBlack = parseLive2DModel({
        id: "sub_anfather_black",
        asset: "live2d/model/sub_anfather_black",
        motion: null,
        kind: "sub",
        ownerKey: "anfather",
        name: "\u8b19",
        names: { jp: "\u8b19", cn: "\u8c26", tw: "\u8b19", en: "Ken", kr: "\ucf04" },
        episodeCount: 2,
    });
    const arisaLive = parseLive2DModel({
        id: "sub_arisa02_live01",
        asset: "live2d/model/sub_arisa02_live01",
        motion: null,
        kind: "sub",
        ownerKey: "arisa",
        name: "\u30a2\u30ea\u30b5",
        names: { jp: "\u30a2\u30ea\u30b5", cn: "\u7231\u8389\u838e", en: "Arisa" },
        episodeCount: 8,
    });
    const honamiApril = parseLive2DModel({
        id: "v2_03honami_april2025_school",
        asset: "live2d/model/v2_03honami_april2025_school",
        motion: null,
        kind: "character",
        characterId: 3,
    });

    // Backward-compatible 2-arg call uses server-native `model.name`.
    assert.equal(live2dOwnerName(t, kenMain), "\u8b19");
    assert.equal(live2dOwnerName(t, kenMain, "zh-CN"), "\u8c26");
    assert.equal(live2dOwnerName(t, kenMain, "en-US"), "Ken");
    assert.equal(live2dOwnerName(t, kenMain, "ja-JP"), "\u8b19");
    assert.equal(live2dOwnerName(t, honamiApril, "en-US"), "Mochizuki Honami");

    assert.equal(live2dSecondaryOwnerName(kenMain, "zh-CN"), "\u8b19");
    assert.equal(live2dSecondaryOwnerName(kenMain, "en-US"), "\u8b19");
    assert.equal(live2dSecondaryOwnerName(kenMain, "ja-JP"), null);
    assert.equal(live2dSecondaryOwnerName(honamiApril, "en-US"), null);

    // Aliases exclude primary & secondary names.
    assert.deepEqual(live2dOwnerAliases(kenMain, "zh-CN"), ["\u767d\u77f3\u8b19", "Master"]);
    assert.deepEqual(live2dOwnerAliases(kenMain, "ja-JP"), ["\u767d\u77f3\u8b19", "Master"]);

    assert.equal(live2dGroupKey(honamiApril), "character:3");
    assert.equal(live2dGroupKey(kenMain), "sub");
    assert.equal(live2dGroupName(t, honamiApril), "Mochizuki Honami");
    assert.equal(live2dGroupName(t, kenMain), "Supporting");

    assert.equal(live2dCostumeLabel(t, kenMain), "Normal");
    assert.equal(live2dCostumeLabel(t, kenRw), "RAD WEEKEND");
    assert.equal(live2dCostumeLabel(t, kenBlack), "Silhouette");
    assert.equal(live2dCostumeLabel(t, arisaLive), "#2 \u00b7 Live 1");
    assert.equal(live2dCostumeLabel(t, honamiApril), "April Fools 2025 \u00b7 School");

    // Cross-language + costume search.
    assert.equal(live2dModelMatchesQuery(t, kenBlack, "ken silhouette", "zh-CN"), true);
    assert.equal(live2dModelMatchesQuery(t, kenBlack, "\u8c26 \u8b19", "en-US"), true);
    assert.equal(live2dModelMatchesQuery(t, kenMain, "master", "en-US"), true);
    assert.equal(live2dModelMatchesQuery(t, kenMain, "arisa", "en-US"), false);

    // Owner grouping sorts groups by totalEpisodes desc and variants inside each group by compareLive2DModels.
    const groups = groupLive2DModelsByOwner(t, [kenBlack, arisaLive, kenRw, kenMain], "en-US");
    assert.equal(groups.length, 2);
    assert.equal(groups[0].ownerKey, "anfather");
    assert.equal(groups[0].displayName, "Ken");
    assert.equal(groups[0].secondaryName, "\u8b19");
    assert.deepEqual(groups[0].aliases, ["\u767d\u77f3\u8b19", "Master"]);
    assert.equal(groups[0].totalEpisodes, 37);
    assert.deepEqual(groups[0].models.map(m => m.id), ["sub_anfather", "sub_anfather_rw", "sub_anfather_black"]);
    assert.equal(groups[1].ownerKey, "arisa");
    assert.equal(groups[1].totalEpisodes, 8);

    assert.equal(live2dMotionLabel("face_smile_01"), "smile_01");
    assert.equal(resolveFallbackSubCharacter({ id: "sub_unknown_xyz", ownerKey: "unknown_xyz", subName: "unknown_xyz" }), null);
});

test("subCharacterNames.ts is pure ASCII and provides 5-region fallback names and aliases", () => {
    const rawSource = readFileSync(new URL("src/lib/live2dViewer/subCharacterNames.ts", WEB_ROOT), "utf8");
    assert.match(rawSource, /^[\x00-\x7F]*$/, "subCharacterNames.ts must contain ASCII-only characters");

    const ownerKeys = Object.keys(SUB_CHARACTER_FALLBACK_NAMES);
    assert.equal(ownerKeys.length, 83);
    assert.ok(Object.keys(SUB_CHARACTER_ID_OVERRIDES).length >= 5);

    for (const key of ownerKeys) {
        const entry = SUB_CHARACTER_FALLBACK_NAMES[key];
        for (const region of ["jp", "cn", "tw", "en", "kr"]) {
            assert.equal(typeof entry.names[region], "string", `missing ${region} name for ${key}`);
            assert.ok(entry.names[region].trim().length > 0, `empty ${region} name for ${key}`);
        }
    }

    // Listing-only models (no `name` / `names`) resolve cleanly from subCharacterNames.
    const listedModels = live2dModelsFromListings(
        [
            "sub_anfather",
            "sub_anfatheryoung",
            "v2_sub_sanrio_kitty",
            "v2_sub_enst_01izumi_stage",
            "sub_nenedayo",
            "sub_mikurobo",
            "sub_wl3_extra02",
            "sub_igs_princess",
        ],
        [],
    );
    const byId = new Map(listedModels.map(m => [m.id, m]));

    assert.equal(live2dOwnerName(t, byId.get("sub_anfather"), "zh-CN"), "\u674f\u7684\u7236\u4eb2");
    assert.equal(live2dOwnerName(t, byId.get("sub_anfather"), "en-US"), "An's Father");
    assert.equal(live2dOwnerName(t, byId.get("sub_anfather"), "ja-JP"), "\u8b19");
    assert.equal(live2dModelMatchesQuery(t, byId.get("sub_anfather"), "\u767d\u77f3\u8c26", "en-US"), true);
    assert.equal(live2dModelMatchesQuery(t, byId.get("sub_anfather"), "ken", "zh-CN"), true);

    // ID override for young Ken uses "谦"/"Ken" while inheriting `anfather` aliases.
    assert.equal(live2dOwnerName(t, byId.get("sub_anfatheryoung"), "zh-CN"), "\u8c26");
    assert.equal(live2dOwnerName(t, byId.get("sub_anfatheryoung"), "en-US"), "Ken");
    assert.equal(live2dModelMatchesQuery(t, byId.get("sub_anfatheryoung"), "\u767d\u77f3\u8c26", "en-US"), true);

    assert.equal(live2dOwnerName(t, byId.get("v2_sub_sanrio_kitty"), "zh-CN"), "\u51ef\u8482\u732b");
    assert.equal(live2dOwnerName(t, byId.get("v2_sub_sanrio_kitty"), "en-US"), "Hello Kitty");

    assert.equal(live2dOwnerName(t, byId.get("v2_sub_enst_01izumi_stage"), "en-US"), "Izumi");
    assert.equal(live2dCostumeLabel(t, byId.get("v2_sub_enst_01izumi_stage")), "Stage");
    assert.equal(live2dModelMatchesQuery(t, byId.get("v2_sub_enst_01izumi_stage"), "\u6fd1\u540d\u6cc9", "en-US"), true);

    assert.equal(live2dOwnerName(t, byId.get("sub_nenedayo"), "zh-CN"), "\u5b81\u5b81\u673a\u5668\u4eba");
    assert.equal(live2dOwnerName(t, byId.get("sub_nenedayo"), "en-US"), "Robo-Nene");
    assert.equal(live2dModelMatchesQuery(t, byId.get("sub_nenedayo"), "nenerobo", "zh-CN"), true);

    assert.equal(live2dModelMatchesQuery(t, byId.get("sub_mikurobo"), "\u521d\u97f3\u673a\u5668\u4eba", "en-US"), true);

    // JP-only newest characters fall back to enriched CN/EN names.
    assert.equal(live2dOwnerName(t, byId.get("sub_wl3_extra02"), "zh-CN"), "\u6765\u6fd1");
    assert.equal(live2dOwnerName(t, byId.get("sub_wl3_extra02"), "en-US"), "Raise");
    assert.equal(live2dOwnerName(t, byId.get("sub_igs_princess"), "en-US"), "Elle");

    // JP-only special April Fools Nene override is keyed under `jp`, not `tw`.
    assert.equal(
        SUB_CHARACTER_ID_OVERRIDES.v2_15nene_april2026_transform.names.jp,
        "\u54b2\u5e0c\u304c\u5316\u3051\u305f\u5be7\u3005",
    );
    assert.equal(SUB_CHARACTER_ID_OVERRIDES.v2_15nene_april2026_transform.names.tw, undefined);
});

test("childhood and sub_* main-character models parse costume parts while keeping format 1 sub_ fallback intact", () => {
    // Low-level parseLive2DModelId remains backward-compatible for `sub_*` ids.
    assert.deepEqual(parseLive2DModelId("sub_airichild"), {
        generation: 1,
        collab: false,
        characterId: null,
        subName: "airichild",
        costume: [],
    });

    // Listing entry without characterId stays `kind: "sub"`.
    const legacySub = parseLive2DModel({
        id: "sub_airichild",
        asset: "live2d/model/sub_airichild",
        motion: null,
        kind: "sub",
    });
    assert.equal(legacySub.kind, "sub");
    assert.equal(legacySub.characterId, null);
    assert.equal(legacySub.subName, "airichild");

    // characterId-tagged main-character `sub_*` models parse childhood & costume tokens.
    const models = [
        { id: "sub_airichild", asset: "live2d/model/sub_airichild", motion: null, kind: "character", characterId: 7 },
        { id: "sub_airichildblack", asset: "live2d/model/sub_airichildblack", motion: null, kind: "character", characterId: 7 },
        { id: "sub_akitochild02", asset: "live2d/model/sub_akitochild02", motion: null, kind: "character", characterId: 11 },
        { id: "sub_harukachild_black", asset: "live2d/model/sub_harukachild_black", motion: null, kind: "character", characterId: 6 },
        { id: "sub_shihochild_js", asset: "live2d/model/sub_shihochild_js", motion: null, kind: "character", characterId: 4 },
        { id: "v2_sub_child_ichika", asset: "live2d/model/v2_sub_child_ichika", motion: null, kind: "character", characterId: 1 },
        { id: "v2_sub_child10_ichika", asset: "live2d/model/v2_sub_child10_ichika", motion: null, kind: "character", characterId: 1 },
        { id: "v2_sub_kanadechild02", asset: "live2d/model/v2_sub_kanadechild02", motion: null, kind: "character", characterId: 17 },
        { id: "sub_emu_princess", asset: "live2d/model/sub_emu_princess", motion: null, kind: "character", characterId: 14 },
    ].map(parseLive2DModel).sort(compareLive2DModels);
    const byId = new Map(models.map(m => [m.id, m]));

    assert.deepEqual(byId.get("sub_airichild")?.costume, [{ token: "child" }]);
    assert.deepEqual(byId.get("sub_airichildblack")?.costume, [{ token: "child" }, { token: "black" }]);
    assert.deepEqual(byId.get("sub_akitochild02")?.costume, [{ token: "child", variant: 2 }]);
    assert.deepEqual(byId.get("sub_harukachild_black")?.costume, [{ token: "child" }, { token: "black" }]);
    assert.deepEqual(byId.get("sub_shihochild_js")?.costume, [{ token: "child" }, { text: "js" }]);
    assert.deepEqual(byId.get("v2_sub_child_ichika")?.costume, [{ token: "child" }]);
    assert.deepEqual(byId.get("v2_sub_child10_ichika")?.costume, [{ token: "child", variant: 10 }]);
    assert.deepEqual(byId.get("v2_sub_kanadechild02")?.costume, [{ token: "child", variant: 2 }]);
    assert.deepEqual(byId.get("sub_emu_princess")?.costume, [{ token: "princess" }]);

    assert.equal(live2dCostumeLabel(t, byId.get("sub_airichild")), "Child");
    assert.equal(live2dCostumeLabel(t, byId.get("sub_airichildblack")), "Child \u00b7 Silhouette");
    assert.equal(live2dCostumeLabel(t, byId.get("sub_akitochild02")), "Child 2");
    assert.equal(live2dCostumeLabel(t, byId.get("sub_harukachild_black")), "Child \u00b7 Silhouette");
    assert.equal(live2dCostumeLabel(t, byId.get("sub_shihochild_js")), "Child \u00b7 js");
    assert.equal(live2dCostumeLabel(t, byId.get("v2_sub_child_ichika")), "Child");
    assert.equal(live2dCostumeLabel(t, byId.get("v2_sub_child10_ichika")), "Child 10");
    assert.equal(live2dCostumeLabel(t, byId.get("v2_sub_kanadechild02")), "Child 2");
    assert.equal(live2dCostumeLabel(t, byId.get("sub_emu_princess")), "Princess");

    // Non-black childhood variant sorts before black silhouette.
    assert.ok(compareLive2DModels(byId.get("sub_airichild"), byId.get("sub_airichildblack")) < 0);
    // `child` sorts before `child 10`.
    assert.ok(compareLive2DModels(byId.get("v2_sub_child_ichika"), byId.get("v2_sub_child10_ichika")) < 0);
});
