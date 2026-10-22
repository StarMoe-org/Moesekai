import assert from "node:assert/strict";

const { COSTUME3D_FORMATS, costume3dCheckConfig, costume3dRegions, costume3dSource } = await import("../src/lib/costume3d/config.ts");
const {
    blocked, costume3dHref, hairOptions, headGroups, parseSelection, resolveLook, roleCostumes, selectionParams,
} = await import("../src/lib/costume3d/look.ts");

// ---------------------------------------------------------------- config
const NAMES = ["NEXT_PUBLIC_COSTUME3D_BASE", "NEXT_PUBLIC_COSTUME3D_REGIONS"];
const set = (values) => {
    for (const name of NAMES) delete process.env[name];
    Object.assign(process.env, values);
};

// With nothing set (Docker passes empty strings) only CN, published on assets.pjsk.moe.
for (const empty of [{}, { NEXT_PUBLIC_COSTUME3D_BASE: "", NEXT_PUBLIC_COSTUME3D_REGIONS: " " }]) {
    set(empty);
    costume3dCheckConfig();
    assert.deepEqual(costume3dRegions(), ["cn"]);
    assert.equal(costume3dSource("cn"), "https://assets.pjsk.moe/sekai-extra-assets/costume3d/cn/");
    assert.equal(costume3dSource("jp"), null);
    assert.equal(costume3dSource("xx"), null);
}

// Regions come back in the site's server order; a local copy may be served over http.
set({ NEXT_PUBLIC_COSTUME3D_BASE: "http://127.0.0.1:8766/costume3d/", NEXT_PUBLIC_COSTUME3D_REGIONS: "cn, jp" });
assert.deepEqual(costume3dRegions(), ["jp", "cn"]);
assert.equal(costume3dSource("jp"), "http://127.0.0.1:8766/costume3d/jp/");

for (const bad of [
    { NEXT_PUBLIC_COSTUME3D_BASE: "http://example.com/costume3d/" },
    { NEXT_PUBLIC_COSTUME3D_BASE: "https://example.com/costume3d" },
    { NEXT_PUBLIC_COSTUME3D_BASE: "https://example.com/a/../costume3d/" },
    { NEXT_PUBLIC_COSTUME3D_BASE: "https://user:pw@example.com/costume3d/" },
    { NEXT_PUBLIC_COSTUME3D_REGIONS: "cn,xx" },
    { NEXT_PUBLIC_COSTUME3D_REGIONS: "cn,cn" },
]) {
    set(bad);
    assert.throws(() => costume3dCheckConfig(), /costume3d_config_invalid/);
}
set({});

// The reader knows the formats SekaiExtraRipper 0.14.0 writes, with the version file.
assert.equal(COSTUME3D_FORMATS["costume3d-part"], 2);
assert.equal(COSTUME3D_FORMATS["costume3d-version"], 1);

// ---------------------------------------------------------------- catalog
const model = (bundle, extra = {}) => ({ bundle, color: null, attach: null, ...extra });
const part = (fields) => ({ groupId: 0, colorName: "", thumbnail: "", headType: null, publishedAt: 100, ...fields });
const catalog = {
    format: "costume3d-catalog",
    version: 1,
    role: { characterId: 1, unit: "light_sound" },
    parts: [
        part({ costume3dId: 2, slot: "body", costumeNumber: 0, colorId: 1, name: "默认", model: model("body/0001") }),
        part({ costume3dId: 10, slot: "body", costumeNumber: 5, colorId: 2, colorName: "B", name: "Five", publishedAt: 300, model: model("body/0005") }),
        part({ costume3dId: 11, slot: "body", costumeNumber: 5, colorId: 1, colorName: "A", name: "Five", publishedAt: 200, model: model("body/0005") }),
        part({ costume3dId: 12, slot: "body", costumeNumber: 6, colorId: 1, name: "Six", publishedAt: 250, model: model("body/0006") }),
        part({ costume3dId: 13, slot: "body", costumeNumber: 7, colorId: 1, name: "No model", publishedAt: 999, model: null }),
        part({ costume3dId: 201, slot: "hair", costumeNumber: 0, colorId: 1, name: "默认", headType: "head_and_hair", model: model("face/01/0001") }),
        part({ costume3dId: 5161, slot: "hair", costumeNumber: 5, colorId: 1, name: "Five hair", headType: "head_and_hair", publishedAt: 200, model: model("face/01/0005n") }),
        part({ costume3dId: 6161, slot: "hair", costumeNumber: 6, colorId: 1, name: "Six hair", headType: "head_and_hair", publishedAt: 250, model: model("face/01/0006n") }),
        part({ costume3dId: 1, slot: "head", costumeNumber: 0, colorId: 1, name: "未设置", headType: "head_only", model: null }),
        part({ costume3dId: 5001, slot: "head", costumeNumber: 5, colorId: 1, name: "Five", headType: "head_only", publishedAt: 200, model: model("acc/5/a02", { attach: "a02" }) }),
        part({ costume3dId: 5003, slot: "head", costumeNumber: 5, colorId: 2, name: "Five", headType: "head_only", publishedAt: 300, model: model("acc/5/a02", { attach: "a02", color: "acc/5/a02/01" }) }),
        part({ costume3dId: 6001, slot: "head", costumeNumber: 6, colorId: 1, name: "Six", headType: "head_only", publishedAt: 250, model: model("acc/5/a02", { attach: "a02" }) }),
        part({ costume3dId: 7001, slot: "head", costumeNumber: 7, colorId: 1, name: "Whole", headType: "head_and_hair", publishedAt: 260, model: model("face/01/0007") }),
    ],
    notAvailable: [[5001, 6161]],
    defaultHairs: { "6001": 6161, "5001": 201 },
};

// Costumes: body parts by costume number, newest first, without the starting outfit or
// parts that have no model; a costume dates from its earliest colour.
assert.deepEqual(roleCostumes(catalog), [
    { costumeNumber: 6, name: "Six", publishedAt: 250, colors: [{ colorId: 1, colorName: "" }] },
    { costumeNumber: 5, name: "Five", publishedAt: 200, colors: [{ colorId: 1, colorName: "A" }, { colorId: 2, colorName: "B" }] },
]);

// Hairs: the default first, then newest first.
assert.deepEqual(hairOptions(catalog).map(p => p.costume3dId), [201, 6161, 5161]);
// Head groups: one per costume and kind of head, colours in order, newest first.
assert.deepEqual(headGroups(catalog).map(g => [g.costumeNumber, g.headType, g.publishedAt, g.parts.map(p => p.costume3dId)]), [
    [7, "head_and_hair", 260, [7001]],
    [6, "head_only", 250, [6001]],
    [5, "head_only", 200, [5001, 5003]],
]);
assert.equal(blocked(catalog, 5001, 6161), true);
assert.equal(blocked(catalog, 6001, 6161), false);

// ---------------------------------------------------------------- looks
const variant = {
    characterId: 1, unit: "light_sound", colorId: 1, body: 11, hair: 201, head: 5001,
    bodyBundle: "body/0005", bodyColor: null, faceBundle: "face/01/0001",
    accessoryBundle: "acc/5/a02", accessoryColor: null, attach: "a02", motion: "motion/01_00",
};
const follow = { hair: null, head: null };

// Following the costume: the variant's own bundles.
let look = resolveLook(variant, catalog, follow);
assert.equal(look.face, "face/01/0001");
assert.deepEqual(look.accessory, { bundle: "acc/5/a02", color: null, attach: "a02" });
assert.equal(look.head.costume3dId, 5001);
assert.equal(look.hair.costume3dId, 201);
assert.equal(look.fullHead, false);

// A picked hair keeps the costume's accessory.
look = resolveLook(variant, catalog, { hair: 5161, head: null });
assert.equal(look.face, "face/01/0005n");
assert.equal(look.accessory.bundle, "acc/5/a02");

// No head: the costume's hair, no accessory.
look = resolveLook(variant, catalog, { hair: null, head: 0 });
assert.equal(look.face, "face/01/0001");
assert.equal(look.accessory, null);
assert.equal(look.head, null);

// A picked head brings its default hair, with its colour bundle.
look = resolveLook(variant, catalog, { hair: null, head: 6001 });
assert.equal(look.hair.costume3dId, 6161);
assert.equal(look.face, "face/01/0006n");
look = resolveLook(variant, catalog, { hair: null, head: 5003 });
assert.deepEqual(look.accessory, { bundle: "acc/5/a02", color: "acc/5/a02/01", attach: "a02" });

// A complete head replaces the hair; a picked hair is then ignored.
look = resolveLook(variant, catalog, { hair: 5161, head: 7001 });
assert.equal(look.face, "face/01/0007");
assert.equal(look.accessory, null);
assert.equal(look.hair, null);
assert.equal(look.fullHead, true);
assert.equal(look.hairIgnored, true);

// A hair the head does not allow is replaced by the head's default hair.
look = resolveLook(variant, catalog, { hair: 6161, head: 5001 });
assert.equal(look.hairReplaced.costume3dId, 6161);
assert.equal(look.hair.costume3dId, 201);
assert.equal(look.face, "face/01/0001");

// A costume whose own head is complete: following it, the hair is hidden.
look = resolveLook({ ...variant, head: 7001, faceBundle: "face/01/0007", accessoryBundle: null, attach: null }, catalog, follow);
assert.equal(look.fullHead, true);
assert.equal(look.hair, null);
assert.equal(look.accessory, null);

// ---------------------------------------------------------------- addresses
assert.deepEqual(parseSelection(new URLSearchParams("server=CN&ch=1&u=light_sound&c=880&col=2&hair=897165&head=0")), {
    server: "cn", characterId: 1, unit: "light_sound", costumeNumber: 880, colorId: 2, hair: 897165, head: 0,
});
// Anything malformed is left out, for the page to choose.
assert.deepEqual(parseSelection(new URLSearchParams("ch=0&u=Light-Sound&c=-1&col=x&hair=0&head=1.5")), {});
const selection = { characterId: 21, unit: "piapro", costumeNumber: 880, colorId: 1, hair: null, head: 0 };
assert.equal(selectionParams(selection, null).toString(), "ch=21&u=piapro&c=880&col=1&head=0");
assert.equal(selectionParams({ ...selection, head: null, hair: 5 }, "jp").toString(), "server=jp&ch=21&u=piapro&c=880&col=1&hair=5");
assert.equal(costume3dHref({ costumeNumber: 880, colorId: 2, characterId: 1 }), "/costume-3d?ch=1&c=880&col=2");
assert.equal(costume3dHref({}), "/costume-3d");

console.log("costume3d: ok");
