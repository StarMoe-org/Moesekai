/**
 * Pins when a character honor draws its 「推し」 medal.
 *
 * The medal is the second style's marker: the game unlocks `honorBackgrounds` / `honorWords` seq 2
 * at character rank 180 and that look carries a 64x72 rosette over the badge's left edge, pasted at
 * (0, 4) on the main slot only. The fan style (seq 1) keeps the plain badge, so the resolver must
 * require the group's `isMedalDisplayed`, the 「推し」 style and the main slot together.
 * Run with: node --test web/tests/honor-medal.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const webRoot = fileURLToPath(new URL("../", import.meta.url));

function loadHonorArt() {
    const filename = path.join(webRoot, "src/lib/honor-art.ts");
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    // Only asset URL builders are imported at runtime; this test reads the medal layer, not the URLs.
    const assets = new Proxy({}, { get: (_target, key) => () => `https://example.com/${String(key)}` });
    new Function("require", "exports", compiled)((id) => {
        if (id === "@/lib/assets") return assets;
        throw new Error(`unexpected import ${id}`);
    }, exports);
    return exports;
}

/** A highest-rarity character honor: one style, one word, drawn from the art tables. */
const characterHonor = { honorRarity: "highest", assetbundleName: "honor_0104", levels: [{ level: 1, honorRarity: "highest", assetbundleName: "honor_0104" }] };
const characterGroup = { id: 26, honorType: "character", isMedalDisplayed: true };
const style = { backgroundAssetbundleName: "honor_bg_style_02_26", wordAssetbundleName: "honor_word_26_02" };

const resolve = (overrides = {}) => loadHonorArt().resolveHonorArt({
    honor: characterHonor,
    group: characterGroup,
    level: 1,
    sub: false,
    sources: ["main-jp"],
    style,
    oshiStyle: true,
    ...overrides,
});

test("the 「推し」 style of a character honor carries the medal on the main slot", () => {
    const spec = resolve();
    assert.equal(spec.medal.length, 1);
    assert.match(spec.medal[0], /getHonorMedalUrl/);

    // The game pastes it at (0, 4) at its native 64x72.
    const { HONOR_MEDAL_ART } = loadHonorArt();
    assert.deepEqual({ ...HONOR_MEDAL_ART }, { x: 0, y: 4, width: 64, height: 72 });
});

test("the fan style keeps the plain badge", () => {
    assert.deepEqual(resolve({ oshiStyle: false }).medal, []);
    assert.deepEqual(resolve({ oshiStyle: undefined }).medal, []);
});

test("groups that do not display a medal never draw one", () => {
    // e.g. the achievement and birthday families: no isMedalDisplayed, so no medal.
    assert.deepEqual(resolve({ group: { ...characterGroup, isMedalDisplayed: false } }).medal, []);
    assert.deepEqual(resolve({ group: { id: 305, honorType: "achievement", isMedalDisplayed: true } }).medal, []);
    assert.deepEqual(resolve({ group: null }).medal, []);
});

test("the compact slot never draws the medal", () => {
    assert.deepEqual(resolve({ sub: true }).medal, []);
});

test("only the highest-rarity character honor uses the style pair at all", () => {
    // A low-rarity fan title draws from its own bundle; the medal belongs to the composed style art.
    const low = { ...characterHonor, honorRarity: "low" };
    assert.deepEqual(resolve({ honor: low }).medal, []);
});
