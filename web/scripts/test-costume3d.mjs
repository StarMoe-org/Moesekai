import assert from "node:assert/strict";

const {
    COSTUME3D_FORMATS, COSTUME3D_FORMS, costume3dCheckConfig, costume3dRegions, costume3dSource,
} = await import("../src/lib/costume3d/config.ts");
const {
    PoolBuilder, blocked, costume3dHref, wearableBy, costumeVariant, hairById, hairOptions, headGroups, parseSelection, resolveLook, roleCostumes,
    selectionParams, showable,
} = await import("../src/lib/costume3d/look.ts");

// ---------------------------------------------------------------- config
const NAMES = ["NEXT_PUBLIC_COSTUME3D_BASE", "NEXT_PUBLIC_COSTUME3D_REGIONS"];
const set = (values) => {
    for (const name of NAMES) delete process.env[name];
    Object.assign(process.env, values);
};

// With nothing set (Docker passes empty strings) JP and CN, published on assets.pjsk.moe.
for (const empty of [{}, { NEXT_PUBLIC_COSTUME3D_BASE: "", NEXT_PUBLIC_COSTUME3D_REGIONS: " " }]) {
    set(empty);
    costume3dCheckConfig();
    assert.deepEqual(costume3dRegions(), ["jp", "cn"]);
    assert.equal(costume3dSource("cn"), "https://assets.pjsk.moe/sekai-extra-assets/published/cn/canonical/current.json");
    assert.equal(costume3dSource("jp"), "https://assets.pjsk.moe/sekai-extra-assets/published/jp/canonical/current.json");
    assert.equal(costume3dSource("tw"), null);
    assert.equal(costume3dSource("xx"), null);
}

// Regions come back in the site's server order; a local copy may be served over http.
set({ NEXT_PUBLIC_COSTUME3D_BASE: "http://127.0.0.1:8766/out/", NEXT_PUBLIC_COSTUME3D_REGIONS: "cn, jp" });
assert.deepEqual(costume3dRegions(), ["jp", "cn"]);
assert.equal(costume3dSource("jp"), "http://127.0.0.1:8766/out/published/jp/canonical/current.json");

for (const bad of [
    { NEXT_PUBLIC_COSTUME3D_BASE: "http://example.com/out/" },
    { NEXT_PUBLIC_COSTUME3D_BASE: "https://example.com/out" },
    { NEXT_PUBLIC_COSTUME3D_BASE: "https://example.com/a/../out/" },
    { NEXT_PUBLIC_COSTUME3D_BASE: "https://user:pw@example.com/out/" },
    { NEXT_PUBLIC_COSTUME3D_REGIONS: "cn,xx" },
    { NEXT_PUBLIC_COSTUME3D_REGIONS: "cn,cn" },
]) {
    set(bad);
    assert.throws(() => costume3dCheckConfig(), /costume3d_config_invalid/);
}
set({});

// The reader knows the index documents, the costume documents, clip documents v2 and component documents.
assert.deepEqual(COSTUME3D_FORMATS, {
    pointer: 1, "index-root": 1, "index-shard": 1, listing: 1,
    "costume-role": 1, costume: 1, clip: 2, components: 1, asset: 1,
});
assert.deepEqual(COSTUME3D_FORMS, { "costume-role": 1, costume: 1, "costume-model": 1, "costume-motion": 1, texture: 2 });

// ---------------------------------------------------------------- catalog
const model = (asset, extra = {}) => ({ asset, ...extra });
const part = (fields) => ({ colorName: "", headType: undefined, publishedAt: 100, ...fields });
const catalog = {
    format: "costume-role",
    version: 1,
    role: {
        characterId: 1, unit: "light_sound", figure: "ladies", breastSize: "m",
        skin: { default: "#ffffff", shadow1: "#eeeeee", shadow2: "#dddddd" },
        defaultBody: 2, defaultHead: 1, defaultHair: 201,
    },
    parts: [
        part({ costume3dId: 2, slot: "body", colorId: 1, name: "Default", model: model("body/0001") }),
        part({ costume3dId: 10, slot: "body", costumeNumber: 5, colorId: 2, colorName: "B", name: "Five", publishedAt: 300, model: model("body/0005") }),
        part({ costume3dId: 11, slot: "body", costumeNumber: 5, colorId: 1, colorName: "A", name: "Five", publishedAt: 200, model: model("body/0005") }),
        part({ costume3dId: 12, slot: "body", costumeNumber: 6, colorId: 1, name: "Six", publishedAt: 250, model: model("body/0006") }),
        part({ costume3dId: 13, slot: "body", costumeNumber: 7, colorId: 1, name: "No model", publishedAt: 999 }),
        part({ costume3dId: 201, slot: "hair", colorId: 1, name: "Default", model: model("face/01/0001") }),
        part({ costume3dId: 5161, slot: "hair", costumeNumber: 5, colorId: 1, name: "Five hair", publishedAt: 200, model: model("face/01/0005n") }),
        part({ costume3dId: 6161, slot: "hair", costumeNumber: 6, colorId: 1, name: "Six hair", publishedAt: 250, model: model("face/01/0006n") }),
        part({ costume3dId: 1, slot: "head", colorId: 1, name: "Not set", headType: "head_only" }),
        part({ costume3dId: 5001, slot: "head", costumeNumber: 5, colorId: 1, name: "Five", headType: "head_only", publishedAt: 200, model: model("acc/5/a02", { attach: "a02" }) }),
        part({ costume3dId: 5003, slot: "head", costumeNumber: 5, colorId: 2, name: "Five", headType: "head_only", publishedAt: 300, model: model("acc/5/a02", { colors: { color: "acc/5/a02/01_C" }, attach: "a02" }) }),
        part({ costume3dId: 6001, slot: "head", costumeNumber: 6, colorId: 1, name: "Six", headType: "head_only", publishedAt: 250, model: model("acc/5/a02", { attach: "a02" }) }),
        part({ costume3dId: 7001, slot: "head", costumeNumber: 7, colorId: 1, name: "Whole", headType: "head_and_hair", publishedAt: 260, model: model("face/01/0007") }),
    ],
    notAvailable: [[5001, 6161]],
    defaultHairs: { "6001": 6161, "5001": 201 },
};

// Costumes: body parts by costume number, newest first, without the starting outfit or parts that
// have no model; a costume dates from its earliest colour.
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
const byId = (id) => catalog.parts.find(p => p.costume3dId === id);
assert.equal(blocked(catalog, byId(5001), byId(6161)), true);
assert.equal(blocked(catalog, byId(6001), byId(6161)), false);

// ---------------------------------------------------------------- looks
const headless = { costumeNumber: 5, colorId: 1, body: 11, hair: 201, head: 0, models: { body: model("body/0005"), face: "face/01/0001" } };
const variant = {
    role: "costume/role/1-light_sound", characterId: 1, unit: "light_sound", colorId: 1, body: 11, hair: 201, head: 5001,
    alternativeHeads: [], models: { body: model("body/0005"), face: "face/01/0001", accessory: model("acc/5/a02", { attach: "a02" }) },
};
const follow = { hair: null, head: null };

// The look as the costume document gives it.
let look = resolveLook(variant, catalog, follow);
assert.deepEqual(look.body, model("body/0005"));
assert.equal(look.face, "face/01/0001");
assert.deepEqual(look.accessory, { model: model("acc/5/a02", { attach: "a02" }), attach: "a02" });
assert.equal(look.head.costume3dId, 5001);
assert.equal(look.hair.costume3dId, 201);
assert.equal(look.fullHead, false);

// A chosen hair keeps the accessory.
look = resolveLook(variant, catalog, { hair: 5161, head: null });
assert.equal(look.face, "face/01/0005n");
assert.equal(look.accessory.model.asset, "acc/5/a02");

// No head: the costume's hair, no accessory.
look = resolveLook(headless, catalog, follow);
assert.deepEqual([look.face, look.accessory, look.head], ["face/01/0001", null, null]);
look = resolveLook(variant, catalog, { hair: null, head: 0 });
assert.equal(look.face, "face/01/0001");
assert.deepEqual([look.accessory, look.head?.costume3dId ?? null, look.hair.costume3dId], [null, null, 201]);

// A chosen head brings its default hair, and keeps the costume's accessory on its hair.
look = resolveLook(variant, catalog, { hair: null, head: 6001 });
assert.equal(look.accessory.model.asset, "acc/5/a02");
assert.equal(look.hair.costume3dId, 6161);
assert.equal(look.face, "face/01/0006n");
look = resolveLook(variant, catalog, { hair: null, head: 5003 });
assert.deepEqual([look.accessory.model.asset, look.accessory.attach], ["acc/5/a02", "a02"]);
// A costume's accessory is coloured by the textures its part's model gives.
assert.deepEqual(byId(5003).model.colors, { color: "acc/5/a02/01_C" });

// A head with its own hair replaces the hair; a chosen hair is then ignored.
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

// A costume whose own head has its own hair: following it, the hair is hidden.
const wholeHead = { ...variant, head: 7001, models: { body: model("body/0005"), face: "face/01/0007" } };
look = resolveLook(wholeHead, catalog, follow);
assert.equal(look.fullHead, true);
assert.equal(look.hair, null);
assert.equal(look.accessory, null);

// Only a look whose body and face are in the version is shown.
assert.equal(showable(variant), true);
assert.equal(showable({ ...variant, missing: ["no face"] }), false);
assert.equal(showable({ ...variant, models: { body: model("body/0005") } }), false);

// ---------------------------------------------------------------- cross-role (experimental)
const wearer = catalog;
const mens = {
    ...catalog,
    role: { ...catalog.role, characterId: 11, unit: "street", figure: "mens", breastSize: "none", defaultHair: 211 },
    parts: [
        part({ costume3dId: 80, slot: "body", costumeNumber: 8, colorId: 1, name: "Eight", publishedAt: 400, model: model("body/0008/mens") }),
        part({ costume3dId: 211, slot: "hair", colorId: 1, name: "Default", model: model("face/11/0001") }),
        part({ costume3dId: 8001, slot: "head", costumeNumber: 8, colorId: 1, name: "Eight", headType: "head_only", publishedAt: 400, model: model("acc/8/a03", { attach: "a03" }) }),
        part({ costume3dId: 8002, slot: "head", costumeNumber: 8, colorId: 1, name: "Eight", headType: "head_and_hair", publishedAt: 400, model: model("face/11/0008") }),
    ],
    notAvailable: [],
    defaultHairs: { "8001": 211 },
};
const smaller = {
    ...catalog,
    role: { ...catalog.role, characterId: 4, figure: "ladies", breastSize: "s", defaultHair: 204 },
    parts: [
        part({ costume3dId: 41, slot: "body", costumeNumber: 5, colorId: 1, name: "Five", publishedAt: 150, model: model("body/0005/s") }),
        part({ costume3dId: 204, slot: "hair", colorId: 1, name: "Default", model: model("face/04/0001") }),
        part({ costume3dId: 4001, slot: "head", costumeNumber: 5, colorId: 1, name: "Five", headType: "head_only", publishedAt: 200, model: model("acc/5/a02", { attach: "a02" }) }),
    ],
    notAvailable: [[4001, 204]],
    defaultHairs: {},
};
// The virtual singer's roles share her ids: the default hair of each unit is 221, in a face of its own.
const singerRole = (unit, face) => ({
    ...catalog,
    role: { ...catalog.role, characterId: 21, unit, figure: "ladies", breastSize: "s", defaultHair: 221 },
    parts: [part({ costume3dId: 221, slot: "hair", colorId: 1, name: "Default", model: model(face) })],
    notAvailable: [],
    defaultHairs: {},
});
const singerHere = singerRole("piapro", "face/21/0000");
const singerThere = singerRole("idol", "face/28/0000");
const poolOf = (...catalogs) => { const builder = new PoolBuilder(); for (const entry of catalogs) builder.add(entry); return builder.build(); };
const pool = poolOf(mens, smaller, wearer, singerThere, singerHere);

// The pool: every role's costumes (a costume dates from its earliest look), hairs by character,
// heads without the ones with their own hair; of parts that are the same, the lowest id.
assert.deepEqual(pool.costumes.map(c => [c.costumeNumber, c.publishedAt]), [[8, 400], [6, 250], [5, 150]]);
assert.deepEqual(pool.hairs.map(p => p.costume3dId), [201, 6161, 5161, 204, 211, 221, 221]);
assert.deepEqual(pool.roleOf.get(pool.hairs.find(p => p.costume3dId === 211)), { characterId: 11, unit: "street" });
assert.equal(pool.costumeOwners.get(5), 1);
assert.deepEqual([...pool.costumeCharacters.get(5)].sort((a, b) => a - b), [1, 4]);
assert.deepEqual([...pool.costumeGenders.get(8)], ["male"]);
assert.deepEqual([...pool.costumeGenders.get(5)], ["female"]);
assert.equal(pool.headsById.has(8002), false);
assert.deepEqual(pool.heads.find(g => g.key === "5:head_only").parts.map(p => p.costume3dId), [4001, 5003]);
assert.deepEqual(poolOf(wearer, smaller, mens).heads.find(g => g.key === "5:head_only").parts.map(p => p.costume3dId), [4001, 5003]);

// A costume the role has a look of: that look, restricted or not.
const five = { format: "costume", version: 1, costumeNumber: 5, variants: [variant, { ...variant, characterId: 4, models: { ...variant.models, body: model("body/0005/s") } }] };
assert.equal(costumeVariant(five, wearer, 1, pool).variant, variant);
assert.equal(costumeVariant(five, wearer, 1, pool).from, null);
// One it has none of: only cross-role, with the body of the nearest figure, and the role's own
// face, default hair and motions; the costume's accessory only when the role can wear it, as the
// pool's part of that accessory.
const eight = { format: "costume", version: 1, costumeNumber: 8, variants: [{
    role: "costume/role/11-street", characterId: 11, unit: "street", colorId: 1, body: 80, hair: 211, head: 8001, alternativeHeads: [],
    models: { body: model("body/0008/mens"), face: "face/11/0001", accessory: model("acc/8/a03", { attach: "a03" }) },
}] };
assert.equal(costumeVariant(eight, wearer, 1, null), null);
let borrowed = costumeVariant(eight, wearer, 1, pool);
assert.deepEqual(borrowed.from, { characterId: 11, unit: "street" });
assert.deepEqual([borrowed.variant.models.body.asset, borrowed.variant.models.face], ["body/0008/mens", "face/01/0001"]);
assert.deepEqual([borrowed.variant.head, borrowed.variant.models.accessory], [0, undefined]);
look = resolveLook(borrowed.variant, wearer, follow, pool);
assert.deepEqual([look.face, look.hairFrom, look.accessory, look.head], ["face/01/0001", null, null, null]);
const withFive = { ...eight, variants: [{ ...eight.variants[0], head: 1, models: { ...eight.variants[0].models, accessory: model("acc/5/a02", { attach: "a02" }) } }] };
borrowed = costumeVariant(withFive, wearer, 1, pool);
assert.deepEqual([borrowed.variant.head, borrowed.variant.models.accessory.asset], [4001, "acc/5/a02"]);
const nine = { ...eight, variants: [eight.variants[0], { ...eight.variants[0], characterId: 4, unit: "light_sound", models: { ...eight.variants[0].models, body: model("body/0009/s") } }] };
assert.equal(costumeVariant(nine, wearer, 1, pool).variant.models.body.asset, "body/0009/s");
assert.equal(costumeVariant(nine, mens, 1, pool).variant.models.body.asset, "body/0008/mens");
// The other gender's: for a man, the flattest ladies' figure.
const ten = { ...eight, variants: [variant, { ...variant, characterId: 4, models: { ...variant.models, body: model("body/0010/s") } }] };
assert.equal(costumeVariant(ten, mens, 1, pool).variant.models.body.asset, "body/0010/s");
// A colour another role has no look of borrows one of the costume's own.
assert.equal(costumeVariant(five, mens, 3, pool).variant.models.body.asset, "body/0005/s");

// Another character's hair on the role's own face.
const noHead = { ...variant, head: 0, models: { body: model("body/0005"), face: "face/01/0001" } };
look = resolveLook(noHead, wearer, { hair: 211, head: null }, pool);
assert.deepEqual([look.face, look.hairFrom, look.hair.costume3dId], ["face/01/0001", "face/11/0001", 211]);
// A head goes only with a hair whose role can wear it: 11 cannot wear acc/5/a02. A chosen hair
// takes the costume's head off; a chosen head keeps it and puts its default hair on instead.
const hairOf = (id) => pool.hairs.find(p => p.costume3dId === id);
assert.equal(blocked(wearer, byId(5001), hairOf(211), pool), true);
assert.equal(blocked(wearer, pool.headsById.get(8001), hairOf(211), pool), false);
look = resolveLook(variant, wearer, { hair: 211, head: null }, pool);
assert.deepEqual([look.hair.costume3dId, look.hairFrom, look.accessory?.model.asset, look.headDropped.costume3dId, look.hairReplaced], [211, "face/11/0001", "acc/5/a02", 5001, null]);
look = resolveLook(variant, wearer, { hair: 211, head: 5001 }, pool);
assert.deepEqual([look.hair.costume3dId, look.hairReplaced.costume3dId, look.accessory.model.asset, look.headDropped], [201, 211, "acc/5/a02", null]);
// `notAvailable` still applies, from every role's document by models: the role's own pairs, and
// another role's hair with the head that role cannot wear it with (4001 is 5001's model).
look = resolveLook(variant, wearer, { hair: 6161, head: 5001 }, pool);
assert.deepEqual([look.hair.costume3dId, look.hairReplaced.costume3dId], [201, 6161]);
assert.equal(blocked(wearer, byId(5001), hairOf(204), pool), true);
assert.equal(blocked(wearer, byId(5003), hairOf(204), pool), false); // the rule is for the other colour
// Another role's head brings that role's default hair; the costume's accessory stays on.
look = resolveLook(variant, wearer, { hair: null, head: 8001 }, pool);
assert.deepEqual([look.accessory.model.asset, look.head.model.asset, look.hair.costume3dId, look.hairFrom], ["acc/5/a02", "acc/8/a03", 211, "face/11/0001"]);
// The filters: who can wear a head in the game.
assert.equal(wearableBy(pool, pool.headsById.get(8001), new Set([11])), true);
assert.equal(wearableBy(pool, pool.headsById.get(8001), new Set([1, 4])), false);
assert.equal(wearableBy(pool, byId(5003), new Set([4])), true);
// A hair is named by its id and its role's unit: the singer's units are told apart.
assert.equal(hairById(singerHere, 221, null, pool).model.asset, "face/21/0000");
assert.equal(hairById(singerHere, 221, "idol", pool).model.asset, "face/28/0000");
assert.equal(hairById(wearer, 221, "piapro", pool).model.asset, "face/21/0000");
look = resolveLook(
    { ...noHead, role: "costume/role/21-piapro", characterId: 21, unit: "piapro", models: { body: model("body/0005"), face: "face/21/0000" }, hair: 221 },
    singerHere, { hair: 221, hairUnit: "idol", head: null }, pool,
);
assert.deepEqual([look.face, look.hairFrom], ["face/21/0000", "face/28/0000"]);

// ---------------------------------------------------------------- addresses
assert.deepEqual(parseSelection(new URLSearchParams("server=CN&ch=1&u=light_sound&c=880&col=2&hair=897165&hu=idol&head=0")), {
    server: "cn", characterId: 1, unit: "light_sound", costumeNumber: 880, colorId: 2, hair: 897165, hairUnit: "idol", head: 0,
});
// Anything malformed is left out, for the page to choose.
assert.deepEqual(parseSelection(new URLSearchParams("ch=0&u=Light-Sound&c=-1&col=x&hair=0&head=1.5")), {});
const selection = { characterId: 21, unit: "piapro", costumeNumber: 880, colorId: 1, hair: null, hairUnit: null, head: 0 };
assert.equal(selectionParams(selection, null).toString(), "ch=21&u=piapro&c=880&col=1&head=0");
assert.equal(selectionParams({ ...selection, head: null, hair: 5 }, "jp").toString(), "server=jp&ch=21&u=piapro&c=880&col=1&hair=5");
assert.equal(selectionParams({ ...selection, head: null, hair: 221, hairUnit: "idol" }, null).toString(), "ch=21&u=piapro&c=880&col=1&hair=221&hu=idol");
assert.equal(costume3dHref({ costumeNumber: 880, colorId: 2, characterId: 1 }), "/costume-3d?ch=1&c=880&col=2");
assert.equal(costume3dHref({}), "/costume-3d");

// ---------------------------------------------------------------- physics
const THREE = await import("three");
const { Costume3dPhysics, pinned, resolverFor } = await import("../src/lib/costume3d/physics.ts");

// A skirt-like chain: a pivot, a spring bone hanging down 10 cm (its tip is its child at +X), a
// sphere collider in front of where it hangs, and a knee the pivot would aim at. The components
// are written as component documents write them: script components are `MonoBehaviour`s with their
// script names, and their references are `{ $ref }` objects.
function rig() {
    const root = new THREE.Group();
    const body = new THREE.Object3D(); body.name = "body"; root.add(body);
    const hip = new THREE.Object3D(); hip.name = "Hip"; hip.position.set(0, 1, 0); body.add(hip);
    const pivot = new THREE.Object3D(); pivot.name = "Skirt_offset";
    pivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)); hip.add(pivot);
    const bone = new THREE.Object3D(); bone.name = "EX_Skirt"; pivot.add(bone);
    const tip = new THREE.Object3D(); tip.name = "Skirt_end"; tip.position.set(0.1, 0, 0); bone.add(tip);
    const knee = new THREE.Object3D(); knee.name = "Knee"; knee.position.set(0, -0.4, 0); hip.add(knee);
    const collider = new THREE.Object3D(); collider.name = "KneeSphere"; knee.add(collider);
    const holder = new THREE.Object3D(); holder.name = "Holder"; hip.add(holder);
    return { root, body, hip, pivot, bone, tip, knee, collider, holder };
}
const components = [
    { class: "MonoBehaviour", script: "ThirdParty.SpringBone/UTJ.SpringManager", node: "Hip", enabled: true, fields: {
        dynamicRatio: 1, enableCollision: 1, enableAngleLimits: 1, gravity: { x: 0, y: 0, z: 0 }, springBones: [{ $ref: { component: 1 } }],
        // A reference to a component the document does not list names its node and class.
        linkedRenderer: { $ref: { node: "Hip", class: "SkinnedMeshRenderer" } } } },
    { class: "MonoBehaviour", script: "Assembly-CSharp/Sekai.SekaiSpringBone", node: "Hip/Skirt_offset/EX_Skirt", enabled: true, fields: {
        stiffnessForce: 300, dragForce: 0.4, radius: 0.03, springForce: { x: 0, y: 0, z: 0 },
        pivotNode: { $ref: { node: "Hip/Skirt_offset" } }, sphereColliders: [{ $ref: { component: 2 } }], capsuleColliders: [],
        yAngleLimits: { active: 0, min: 0, max: 0 }, zAngleLimits: { active: 0, min: 0, max: 0 } } },
    { class: "MonoBehaviour", script: "ThirdParty.SpringBone/UTJ.SpringSphereCollider", node: "Hip/Knee/KneeSphere", enabled: true, fields: { radius: 0.03 } },
    { class: "PositionConstraint", script: null, node: "Hip/Holder", enabled: true, fields: { m_Active: true, m_Weight: 1, m_Sources: [{ sourceTransform: { $ref: { node: "Hip/Knee" } }, weight: 1 }] } },
];
const step = (physics, r, frames, move) => { for (let i = 0; i < frames; i++) { move?.(i); physics.update(r.root, 1 / 60); } };
const world = (node) => node.getWorldPosition(new THREE.Vector3());

let r = rig();
let physics = Costume3dPhysics.build(r.root, [{ components, resolve: pinned(components, resolverFor(r.body)) }]);
assert.equal(physics.springCount, 1);
assert.equal(physics.constraintCount, 1);
// At rest nothing moves: the tip hangs 10 cm below the hip.
step(physics, r, 30);
assert.ok(world(r.tip).distanceTo(new THREE.Vector3(0, 0.9, 0)) < 1e-4);

// The knee comes up into the skirt: the tip is pushed out of the knee's sphere, and keeps its length.
step(physics, r, 120, i => { r.knee.position.set(0, -0.4 + Math.min(i, 60) * 0.005, 0.015); });
const tip = world(r.tip), center = world(r.collider), head = world(r.bone);
assert.ok(tip.distanceTo(center) >= 0.06 - 1e-3, `tip ${tip.distanceTo(center).toFixed(3)} m from the knee`);
assert.ok(Math.abs(tip.distanceTo(head) - 0.1) < 1e-4);
assert.ok([tip.x, tip.y, tip.z].every(Number.isFinite));
// The position constraint carried its node with the knee, at the offset it had in the rest pose (40 cm above).
assert.ok(world(r.holder).distanceTo(world(r.knee).add(new THREE.Vector3(0, 0.4, 0))) < 1e-6);

// A capsule collider is read as one: a spring bone inside it is pushed along its length, not out of a sphere.
r = rig();
const capsule = structuredClone(components);
capsule[1].fields.sphereColliders = [];
capsule[1].fields.capsuleColliders = [{ $ref: { node: "Hip", class: "SpringCapsuleCollider" } }];
const capsuleCollider = rig();
capsule.push({ class: "MonoBehaviour", script: "ThirdParty.SpringBone/UTJ.SpringCapsuleCollider", node: "Hip/Knee/KneeCapsule", enabled: true, fields: { radius: 0.02, height: 0.2 } });
capsuleCollider.knee.add(Object.assign(new THREE.Object3D(), { name: "KneeCapsule" }));
physics = Costume3dPhysics.build(capsuleCollider.root, [{ components: capsule, resolve: pinned(capsule, resolverFor(capsuleCollider.body)) }]);
assert.equal(physics.springCount, 1);
step(physics, capsuleCollider, 120, i => { capsuleCollider.knee.position.set(0, -0.25 + Math.min(i, 60) * 0.004, 0); });
const capsuleTip = world(capsuleCollider.tip);
assert.ok(Number.isFinite(capsuleTip.y) && capsuleTip.distanceTo(world(capsuleCollider.bone)) > 0.09);

// Angle limits: the bone may swing towards the pivot's +Y (up to 30 degrees) but not past -Y.
r = rig();
const limited = structuredClone(components);
limited[1].fields.yAngleLimits = { active: 1, min: -30, max: 0 };
limited[1].fields.sphereColliders = [];
physics = Costume3dPhysics.build(r.root, [{ components: limited, resolve: pinned(limited, resolverFor(r.body)) }]);
// Swing the hip hard one way and the other: inertia throws the tip both ways.
for (const dz of [0.02, -0.02]) step(physics, r, 40, () => { r.hip.position.z += dz; });
const pivotQ = r.pivot.getWorldQuaternion(new THREE.Quaternion());
const v = world(r.tip).sub(world(r.bone));
const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(pivotQ), down = new THREE.Vector3(0, -1, 0).applyQuaternion(pivotQ);
const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(pivotQ);
const projection = v.clone().addScaledVector(normal, -v.dot(normal));
const angle = THREE.MathUtils.radToDeg(Math.atan2(projection.dot(down), projection.dot(forward)));
assert.ok(angle <= 0.5 && angle >= -30.5, `angle ${angle.toFixed(1)}`);

// The face's paths are pinned before its nodes move, and its bones are the body's of the same name.
r = rig();
const face = new THREE.Object3D(); face.name = "face";
const faceHip = new THREE.Object3D(); faceHip.name = "Hip"; face.add(faceHip);
const hair = new THREE.Object3D(); hair.name = "EX_Hair"; faceHip.add(hair);
const shared = new Map([["Hip", r.hip]]);
const resolve = pinned([{ class: "MonoBehaviour", script: "Assembly-CSharp/Sekai.SekaiSpringBone", node: "Hip/EX_Hair", enabled: true, fields: { pivotNode: { $ref: { node: "Hip" } } } }], resolverFor(face, shared));
r.hip.add(hair);
assert.equal(resolve("Hip/EX_Hair"), hair);
assert.equal(resolve("Hip"), r.hip);

// ---------------------------------------------------------------- motion
const { bindClip, clipOf, crc32, MotionPlayer, rigOf } = await import("../src/lib/costume3d/motion.ts");

// CRC-32, as the engine hashes node paths and blend shape channel names.
assert.equal(crc32(""), 0);
assert.equal(crc32("Position/Hip"), 3796555716);

const body = new THREE.Object3D(); body.name = "body";
const hip = new THREE.Object3D(); hip.name = "Hip"; hip.position.set(0, 1, 0); body.add(hip);
const hand = new THREE.Object3D(); hand.name = "Hand"; hand.position.set(0.5, 0, 0); hip.add(hand);
const faceMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
faceMesh.morphTargetInfluences = [0, 0];
faceMesh.morphTargetDictionary = { eye_close: 0, mouth: 1 };
faceMesh.userData.fullWeights = [50, 100];
body.add(faceMesh);

const clip = clipOf({
    format: "clip", version: 2, name: "motion", sample_rate: 60, start_time: 0.5, stop_time: 2, loop: false, events: [],
    curves: [
        // Hand's position: only z is curved; x and y keep the rest pose.
        { path: crc32("Hip/Hand"), attribute: 1, class_id: 4, script: null, custom_type: 0, component: 2, kind: "constant", value: 0.25 },
        // Hip's rotation as Euler angles: z (component 2) turns 90 degrees about Z.
        { path: crc32("Hip"), attribute: 4, class_id: 4, script: null, custom_type: 0, component: 2, kind: "streamed", segments: [[-3.4028235e38, 0, 0, 0, 0]] },
        { path: crc32("Hip"), attribute: 4, class_id: 4, script: null, custom_type: 0, component: 2, kind: "constant", value: 90 },
        // Hip's scale, a dense curve: 1 at 0.5 s, 2 at 1.5 s, linear between.
        { path: crc32("Hip"), attribute: 3, class_id: 4, script: null, custom_type: 0, component: 0, kind: "dense", begin_time: 0.5, sample_rate: 1, samples: [1, 2] },
        // eye_close, a blend shape channel: 25 at the stored weight applies its frame halfway (full weight 50).
        { path: 0, attribute: crc32("eye_close"), class_id: 137, script: null, custom_type: 20, component: 0, kind: "constant", value: 25 },
        // A channel this face does not have, and a Transform attribute this viewer does not apply.
        { path: 0, attribute: crc32("unknown"), class_id: 137, script: null, custom_type: 20, component: 0, kind: "constant", value: 1 },
        { path: crc32("Hip"), attribute: 9, class_id: 4, script: null, custom_type: 0, component: 0, kind: "constant", value: 1 },
    ],
});
// Hand's position, Hip's Euler rotation and Hip's scale; attribute 9 is no Transform property.
assert.equal(clip.transforms.length, 3);
// The face's channel only (`unknown` stays a curve with no channel to write).
assert.deepEqual(clip.shapes.map(shape => shape.attribute), [crc32("eye_close"), crc32("unknown")]);

const rigged = rigOf(body);
// Paths are those below the body root; the face mesh is not a node.
assert.deepEqual([...rigged.nodes.keys()].sort(), [crc32("Hip"), crc32("Hip/Hand")].sort());
const bound = bindClip(clip, rigged, [faceMesh]);
// `unknown` is no channel of the face, and attribute 9 is no Transform property.
assert.equal(bound.unbound, 2);
const player = new MotionPlayer();
player.attach(rigged, [faceMesh], { body: bound, face: null }, null);
player.reset();
player.tick(0);
assert.ok(Math.abs(hand.position.z - 0.25) < 1e-6);
assert.ok(Math.abs(hand.position.x - 0.5) < 1e-6);
const tilted = new THREE.Vector3(0, 1, 0).applyQuaternion(hip.quaternion);
assert.ok(Math.abs(tilted.x - 1) < 1e-5 && Math.abs(tilted.y) < 1e-5, `Hip's up is ${tilted.toArray().map(n => n.toFixed(3))}`); // 90° about Z in glTF space
assert.ok(Math.abs(faceMesh.morphTargetInfluences[0] - 0.5) < 1e-6);
// A dense curve is read at clip time: playback position plus `start_time`.
player.tick(0.5); // t = 1.0
assert.ok(Math.abs(hip.scale.x - 1.5) < 1e-6, `scale ${hip.scale.x}`);
// The rest pose restores the models' transforms and the weights their nodes store.
faceMesh.userData.weights = [0.2, 0];
player.restPose();
assert.ok(Math.abs(hand.position.x - 0.5) < 1e-6 && hand.position.z === 0);
assert.deepEqual(faceMesh.morphTargetInfluences, [0.2, 0]);

console.log("costume3d: ok");


















