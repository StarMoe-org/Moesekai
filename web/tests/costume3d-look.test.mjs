/**
 * The look a role wears in the 3D costume viewer (src/lib/costume3d/look.ts): a role with its own
 * looks of a costume wears the one of the picked colour.
 * Run with: node --experimental-strip-types --test web/tests/costume3d-look.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { importWebTypeScript } from "./characterization/test-helpers.mjs";

const { costumeVariant } = await importWebTypeScript("src/lib/costume3d/look.ts");

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
