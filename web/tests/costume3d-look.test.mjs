/**
 * The look a role wears in the 3D costume viewer (src/lib/costume3d/look.ts): a role with its own
 * looks of a costume wears the one of the picked colour.
 * Run with: node --experimental-strip-types --test web/tests/costume3d-look.test.mjs
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { importWebTypeScript } from "./characterization/test-helpers.mjs";

const { costumeVariant, resolveLook } = await importWebTypeScript("src/lib/costume3d/look.ts");

const role = { characterId: 2, unit: "light_sound" };
const look = colorId => ({
    role: "costume/role/2-light_sound",
    characterId: 2,
    unit: "light_sound",
    colorId,
    body: 10108010 + 2 * (colorId - 1),
    hair: 0,
    head: 0,
    alternativeHeads: [],
    models: { body: { asset: "body", colors: { color: `color-${colorId}` } }, face: "face" },
});
const costume = { variants: [look(1), look(2), look(3)] };
const catalog = { role };

test("the role's own look is the one of the picked colour", () => {
    for (const colorId of [1, 2, 3]) {
        const worn = costumeVariant(costume, catalog, colorId);
        assert.equal(worn.from, null);
        assert.equal(worn.variant.colorId, colorId);
        assert.equal(worn.variant.models.body.colors.color, `color-${colorId}`);
    }
});

test("a colour the role has no look in falls back to its first look", () => {
    const worn = costumeVariant(costume, catalog, 9);
    assert.equal(worn.variant.colorId, 1);
});

describe("a picked head", () => {
    const part = (costume3dId, slot, model, extra = {}) => ({ costume3dId, slot, colorId: 1, model: { asset: model, ...extra.model }, ...extra.part });
    const ownHair = part(1, "hair", "face-hair");
    const ownHead = part(2, "head", "acc-own", { part: { headType: "head_only" }, model: { attach: "Head/a01" } });
    const pickedHead = part(3, "head", "acc-picked", { part: { headType: "head_only" }, model: { attach: "Head/a02", colors: { color: "acc-picked_C" } } });
    const fullHead = part(4, "head", "full-head", { part: { headType: "head_and_hair" } });
    const headCatalog = {
        role: { ...role, defaultHair: 1 },
        parts: [ownHair, ownHead, pickedHead, fullHead],
        notAvailable: [],
        defaultHairs: {},
    };
    const variant = {
        ...look(1),
        hair: 1,
        head: 2,
        models: { body: { asset: "body" }, face: "face-hair", accessory: { asset: "acc-own", attach: "Head/a01" } },
    };

    test("an accessory head is worn as the accessory", () => {
        const worn = resolveLook(variant, headCatalog, { hair: null, head: 3 });
        assert.equal(worn.head, pickedHead);
        assert.deepEqual(worn.accessory, { model: pickedHead.model, attach: "Head/a02" });
        assert.equal(worn.fullHead, false);
    });

    test("following the costume keeps its accessory", () => {
        const worn = resolveLook(variant, headCatalog, { hair: 1, head: null });
        assert.equal(worn.accessory.model.asset, "acc-own");
    });

    test("a head of none takes the accessory off", () => {
        assert.equal(resolveLook(variant, headCatalog, { hair: null, head: 0 }).accessory, null);
    });

    test("a head with its own hair is the face", () => {
        const worn = resolveLook(variant, headCatalog, { hair: null, head: 4 });
        assert.equal(worn.face, "full-head");
        assert.equal(worn.accessory, null);
    });
});
