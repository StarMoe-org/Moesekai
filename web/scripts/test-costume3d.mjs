import assert from "node:assert/strict";

const { COSTUME3D_FORMATS, costume3dCheckConfig, costume3dRegions, costume3dSource } = await import("../src/lib/costume3d/config.ts");
const {
    PoolBuilder, blocked, costume3dHref, costumeVariant, hairOptions, headGroups, parseSelection, resolveLook, roleCostumes, selectionParams,
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
    assert.equal(costume3dSource("cn"), "https://assets.pjsk.moe/sekai-extra-assets/costume3d/cn/");
    assert.equal(costume3dSource("jp"), "https://assets.pjsk.moe/sekai-extra-assets/costume3d/jp/");
    assert.equal(costume3dSource("tw"), null);
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

// ---------------------------------------------------------------- unrestricted (experimental)
const wearer = { ...catalog, role: { characterId: 1, unit: "light_sound", figure: "ladies", breastSize: "m", defaultHair: 201, motion: "motion/01_00" } };
const mens = {
    ...catalog,
    role: { characterId: 11, unit: "street", figure: "mens", breastSize: "none", defaultHair: 211, motion: "motion/11_00" },
    parts: [
        part({ costume3dId: 80, slot: "body", costumeNumber: 8, colorId: 1, name: "Eight", publishedAt: 400, model: model("body/0008/mens") }),
        part({ costume3dId: 211, slot: "hair", costumeNumber: 0, colorId: 1, name: "默认", model: model("face/11/0001") }),
        part({ costume3dId: 8001, slot: "head", costumeNumber: 8, colorId: 1, name: "Eight", headType: "head_only", publishedAt: 400, model: model("acc/8/a03", { attach: "a03" }) }),
        part({ costume3dId: 8002, slot: "head", costumeNumber: 8, colorId: 1, name: "Eight", headType: "head_and_hair", publishedAt: 400, model: model("face/11/0008") }),
    ],
    notAvailable: [],
    defaultHairs: { "8001": 211 },
};
const smaller = {
    ...catalog,
    role: { characterId: 4, unit: "light_sound", figure: "ladies", breastSize: "s", defaultHair: 204, motion: "motion/04_00" },
    parts: [
        part({ costume3dId: 41, slot: "body", costumeNumber: 5, colorId: 1, name: "Five", publishedAt: 150, model: model("body/0005/s") }),
        part({ costume3dId: 204, slot: "hair", costumeNumber: 0, colorId: 1, name: "默认", model: model("face/04/0001") }),
        part({ costume3dId: 4001, slot: "head", costumeNumber: 5, colorId: 1, name: "Five", headType: "head_only", publishedAt: 200, model: model("acc/5/a02", { attach: "a02" }) }),
    ],
    notAvailable: [],
    defaultHairs: {},
};
const poolOf = (...catalogs) => { const builder = new PoolBuilder(); for (const entry of catalogs) builder.add(entry); return builder.build(); };
const pool = poolOf(mens, smaller, wearer);

// The pool: every role's costumes (a costume dates from its earliest look), hairs by character,
// heads without the complete ones; of parts that are the same, the lowest id, whatever the order.
assert.deepEqual(pool.costumes.map(c => [c.costumeNumber, c.publishedAt]), [[8, 400], [6, 250], [5, 150]]);
assert.deepEqual(pool.hairs.map(p => p.costume3dId), [201, 6161, 5161, 204, 211]);
assert.equal(pool.partOwners.get(211), 11);
assert.equal(pool.costumeOwners.get(5), 1);
assert.equal(pool.parts.has(8002), false);
assert.deepEqual(pool.heads.find(g => g.key === "5:head_only").parts.map(p => p.costume3dId), [4001, 5003]);
assert.deepEqual(poolOf(wearer, smaller, mens).heads.find(g => g.key === "5:head_only").parts.map(p => p.costume3dId), [4001, 5003]);

// A costume the role has a look of: that look, restricted or not.
const five = { costumeNumber: 5, variants: [variant, { ...variant, characterId: 4, bodyBundle: "body/0005/s" }] };
assert.equal(costumeVariant(five, wearer, 1, pool).variant, variant);
assert.equal(costumeVariant(five, wearer, 1, pool).from, null);
// One it has none of: only unrestricted, with the body of the nearest figure, and the role's own
// face, default hair and motion; the costume's accessory stands as the pool's part.
const eight = { costumeNumber: 8, variants: [{
    characterId: 11, unit: "street", colorId: 1, body: 80, hair: 211, head: 8001, bodyBundle: "body/0008/mens", bodyColor: null,
    faceBundle: "face/11/0001", accessoryBundle: "acc/8/a03", accessoryColor: null, attach: "a03", motion: "motion/11_00",
}] };
assert.equal(costumeVariant(eight, wearer, 1, null), null);
let borrowed = costumeVariant(eight, wearer, 1, pool);
assert.deepEqual(borrowed.from, { characterId: 11, unit: "street" });
assert.equal(borrowed.variant.bodyBundle, "body/0008/mens");
assert.equal(borrowed.variant.faceBundle, "face/01/0001");
assert.equal(borrowed.variant.motion, "motion/01_00");
assert.equal(borrowed.variant.head, 8001);
look = resolveLook(borrowed.variant, wearer, follow, pool);
assert.deepEqual([look.face, look.hairFrom, look.accessory.bundle, look.head.costume3dId], ["face/01/0001", null, "acc/8/a03", 8001]);
const nine = { costumeNumber: 9, variants: [eight.variants[0], { ...eight.variants[0], characterId: 4, unit: "light_sound", bodyBundle: "body/0009/s" }] };
assert.equal(costumeVariant(nine, wearer, 1, pool).variant.bodyBundle, "body/0009/s");
assert.equal(costumeVariant(nine, mens, 1, pool).variant.bodyBundle, "body/0008/mens");
// The other gender's: for a man, the flattest ladies' figure.
const ten = { costumeNumber: 10, variants: [variant, { ...variant, characterId: 4, bodyBundle: "body/0010/s" }] };
assert.equal(costumeVariant(ten, mens, 1, pool).variant.bodyBundle, "body/0010/s");

// Another character's hair on the role's own face; `notAvailable` no longer applies.
look = resolveLook(variant, wearer, { hair: 211, head: null }, pool);
assert.deepEqual([look.face, look.hairFrom, look.hair.costume3dId], ["face/01/0001", "face/11/0001", 211]);
look = resolveLook(variant, wearer, { hair: 6161, head: 5001 }, pool);
assert.deepEqual([look.hair.costume3dId, look.hairReplaced, look.hairFrom], [6161, null, null]);
assert.equal(blocked(wearer, 5001, 6161, pool), false);
// Another role's head; its default hair is that role's, so the costume's hair stays.
look = resolveLook(variant, wearer, { hair: null, head: 8001 }, pool);
assert.deepEqual([look.accessory.bundle, look.hair.costume3dId, look.hairFrom], ["acc/8/a03", 201, null]);

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

// ---------------------------------------------------------------- physics
const THREE = await import("three");
const { Costume3dPhysics, pinned, resolverFor } = await import("../src/lib/costume3d/physics.ts");

// A skirt-like chain: a pivot, a spring bone hanging down 10 cm (its tip is its child at +X), a
// sphere collider in front of where it hangs, and a knee the pivot would aim at.
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
    { class: "SpringManager", node: "Hip", enabled: true, fields: { dynamicRatio: 1, enableCollision: 1, enableAngleLimits: 1, gravity: { x: 0, y: 0, z: 0 }, springBones: [{ $ref: { component: 1 } }] } },
    { class: "SekaiSpringBone", node: "Hip/Skirt_offset/EX_Skirt", enabled: true, fields: {
        stiffnessForce: 300, dragForce: 0.4, radius: 0.03, springForce: { x: 0, y: 0, z: 0 },
        pivotNode: { $ref: { node: "Hip/Skirt_offset" } }, sphereColliders: [{ $ref: { component: 2 } }], capsuleColliders: [],
        yAngleLimits: { active: 0, min: 0, max: 0 }, zAngleLimits: { active: 0, min: 0, max: 0 } } },
    { class: "SpringSphereCollider", node: "Hip/Knee/KneeSphere", enabled: true, fields: { radius: 0.03 } },
    { class: "PositionConstraint", node: "Hip/Holder", enabled: true, fields: { m_Active: true, m_Weight: 1, m_Sources: [{ sourceTransform: { $ref: { node: "Hip/Knee" } }, weight: 1 }] } },
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
const resolve = pinned([{ class: "SekaiSpringBone", node: "Hip/EX_Hair", enabled: true, fields: { pivotNode: { $ref: { node: "Hip" } } } }], resolverFor(face, shared));
r.hip.add(hair);
assert.equal(resolve("Hip/EX_Hair"), hair);
assert.equal(resolve("Hip"), r.hip);

console.log("costume3d: ok");
