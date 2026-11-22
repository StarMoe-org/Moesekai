import assert from "node:assert/strict";
import test from "node:test";
import { costumeVariant, resolveLook, roleCostumes } from "../src/lib/costume3d/look.ts";
import fixture from "./fixtures/costume3d/rui-2082.json" with { type: "json" };

/** The published documents as they are: the colours other than the first are not exported. */
const asPublished = () => structuredClone(fixture);

/** The same documents once the exporter publishes the colour variations: nothing missing, each colour with its textures. */
function withColours() {
    const { catalog, costume } = structuredClone(fixture);
    const colours = (asset, colorId) => (colorId > 1 ? { color: `${asset}#${colorId}_C`, shadow: `${asset}#${colorId}_S`, value: `${asset}#${colorId}_H` } : undefined);
    for (const part of catalog.parts) {
        delete part.missing;
        if (part.model) part.model.colors = colours(part.model.asset, part.colorId);
    }
    for (const variant of costume.variants) {
        delete variant.missing;
        variant.models.body.colors = colours(variant.models.body.asset, variant.colorId);
        if (variant.models.accessory) variant.models.accessory.colors = colours(variant.models.accessory.asset, variant.colorId);
    }
    return { catalog, costume };
}

const HAT_2082 = "live_pv/model/characterv2/head_optional/2237/a05/optional";
const HEAD_2077 = "live_pv/model/characterv2/head_optional/2235/a05/optional";

test("#162: a picked head accessory is the one worn, not the costume's", () => {
    const { catalog, costume } = asPublished();
    const { variant } = costumeVariant(costume, catalog, 1, null);
    assert.equal(variant.models.accessory.asset, HAT_2082);

    const look = resolveLook(variant, catalog, { hair: 216, hairUnit: null, head: 2077025 }, null);
    assert.equal(look.head?.costume3dId, 2077025);
    assert.equal(look.accessory?.model.asset, HEAD_2077);
    assert.equal(look.accessory?.attach, "a05");

    const withoutHair = resolveLook(variant, catalog, { hair: null, head: 2077025 }, null);
    assert.equal(withoutHair.accessory?.model.asset, HEAD_2077);
});

test("#162: following the costume keeps its accessory; no head wears none", () => {
    const { catalog, costume } = asPublished();
    const { variant } = costumeVariant(costume, catalog, 1, null);
    assert.equal(resolveLook(variant, catalog, { hair: null, head: null }, null).accessory?.model.asset, HAT_2082);
    assert.equal(resolveLook(variant, catalog, { hair: null, head: 0 }, null).accessory, null);
});

test("#162: a picked head carries its own colour textures", () => {
    const { catalog, costume } = withColours();
    const { variant } = costumeVariant(costume, catalog, 1, null);
    const look = resolveLook(variant, catalog, { hair: null, head: 2077031 }, null);
    assert.equal(look.accessory?.model.asset, HEAD_2077);
    assert.equal(look.accessory?.model.colors?.color, `${HEAD_2077}#4_C`);
});

test("#163: each colour is the role's look in that colour", () => {
    const { catalog, costume } = withColours();
    for (const colorId of [1, 2, 3, 4]) {
        const worn = costumeVariant(costume, catalog, colorId, null);
        assert.equal(worn?.variant.colorId, colorId);
    }
    assert.equal(costumeVariant(costume, catalog, 4, null).variant.models.body.colors?.color.endsWith("#4_C"), true);
    assert.equal(costumeVariant(costume, catalog, 9, null), null);
});

test("#163: colours the version does not hold are marked, and their parts are not worn", () => {
    const { catalog, costume } = asPublished();
    const colors = roleCostumes(catalog).find(entry => entry.costumeNumber === 2082).colors;
    assert.deepEqual(colors.map(color => [color.colorId, color.available]), [[1, true], [2, false], [3, false], [4, false]]);
    assert.ok(costumeVariant(costume, catalog, 4, null).variant.missing?.length);

    // A head in a colour that is not exported is not put on in its first colour's textures.
    const { variant } = costumeVariant(costume, catalog, 1, null);
    assert.equal(resolveLook(variant, catalog, { hair: null, head: 2077031 }, null).accessory?.model.asset, HAT_2082);

    const exported = roleCostumes(withColours().catalog).find(entry => entry.costumeNumber === 2082).colors;
    assert.ok(exported.every(color => color.available));
});
