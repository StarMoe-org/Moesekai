/**
 * Pins where a level badge is repeated in the honor detail dialog.
 *
 * Masterdata only carries per-level art for the difficulty-score honors, and only changes it every
 * ten levels (`honor_3014_100` … `_800`). Printing the same badge on all 80 level cards loads 80
 * images for 8 distinct ones, so the dialog inserts it where `startsHonorArtTier()` says the art
 * changes - and never for the honors whose levels share one bundle or carry none at all.
 * Run with: node --test web/tests/honor-art-tiers.test.mjs
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
    // Only asset URL builders are imported at runtime; this test reads tier boundaries, not URLs.
    const assets = new Proxy({}, { get: (_target, key) => () => `https://example.com/${String(key)}` });
    new Function("require", "exports", compiled)((id) => {
        if (id === "@/lib/assets") return assets;
        throw new Error(`unexpected import ${id}`);
    }, exports);
    return exports;
}

/** The difficulty-score shape: 80 levels, art stepping every 10. */
function leveledTiers() {
    return Array.from({ length: 80 }, (_, index) => ({
        level: index + 1,
        assetbundleName: `honor_3014_${(Math.floor(index / 10) + 1) * 100}`,
    }));
}

test("art tiers open every 10 levels for the difficulty-score family, 8 times over 80 levels", () => {
    const { startsHonorArtTier } = loadHonorArt();
    const levels = leveledTiers();

    const openings = levels.filter((_level, index) => startsHonorArtTier(levels, index)).map((level) => level.level);
    assert.deepEqual(openings, [1, 11, 21, 31, 41, 51, 61, 71]);
    assert.equal(new Set(levels.map((level) => level.assetbundleName)).size, openings.length);
});

test("an honor whose levels carry no bundle never opens a tier", () => {
    const { startsHonorArtTier } = loadHonorArt();
    // 333 of the 341 CN multi-level honors look like this: one badge lives on the honor itself.
    const shared = Array.from({ length: 10 }, (_, index) => ({ level: index + 1 }));

    assert.equal(shared.filter((_level, index) => startsHonorArtTier(shared, index)).length, 0);
});

test("a bundle repeated on every level still opens exactly one tier", () => {
    const { startsHonorArtTier } = loadHonorArt();
    const repeated = Array.from({ length: 5 }, (_, index) => ({ level: index + 1, assetbundleName: "honor_y_1" }));

    assert.deepEqual(
        repeated.filter((_level, index) => startsHonorArtTier(repeated, index)).map((level) => level.level),
        [1],
    );
});
