/**
 * Pins where an honor's placement plate is pasted.
 *
 * The plate is a separate sprite the game lays over the assembled badge, so its position cannot be
 * read from the art: an event title's "第N名" ribbon (150x78 main / 120x38 sub) and a rank-match tier
 * (180x78 / 158x40) are pasted at anchors `lib/honor-art.ts` owns for both renderers. The sub plate
 * hangs on the badge's bottom edge — pasting it at y=0, which the SVG renderer used to do, buried the
 * event title baked into the top of the background art.
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
    // The module only builds asset URLs from here; the anchors are what this test pins.
    const assets = new Proxy({}, { get: (_target, key) => () => `https://example.com/${String(key)}` });
    new Function("require", "exports", compiled)((id) => {
        if (id === "@/lib/assets") return assets;
        throw new Error(`unexpected import ${id}`);
    }, exports);
    return exports;
}

// The sprites' natural sizes, as the asset site serves them.
const PLATE = {
    event: { main: { width: 150, height: 78 }, sub: { width: 120, height: 38 } },
    rank_match: { main: { width: 180, height: 78 }, sub: { width: 158, height: 40 } },
    scroll: { main: { width: 96, height: 26 }, sub: { width: 96, height: 26 } },
};

test("sub placement plates hang on the badge's bottom edge, main plates fill its right half", () => {
    const { honorOverlayAnchor, HONOR_ART_CANVAS } = loadHonorArt();

    assert.deepEqual(honorOverlayAnchor("event", true), { x: 34, y: 42 });
    assert.deepEqual(honorOverlayAnchor("rank_match", true), { x: 17, y: 42 });
    assert.deepEqual(honorOverlayAnchor("scroll", true), { x: 37, y: 3 });

    assert.deepEqual(honorOverlayAnchor("event", false), { x: 190, y: 0 });
    assert.deepEqual(honorOverlayAnchor("rank_match", false), { x: 190, y: 0 });
    assert.deepEqual(honorOverlayAnchor("scroll", false), { x: 215, y: 3 });

    for (const sub of [true, false]) {
        const slot = sub ? "sub" : "main";
        const canvas = HONOR_ART_CANVAS[slot];
        for (const kind of ["event", "rank_match", "scroll"]) {
            const anchor = honorOverlayAnchor(kind, sub);
            const plate = PLATE[kind][slot];
            assert.ok(anchor.x >= 0 && anchor.y >= 0, `${kind}/${slot} must be inside the art`);
            assert.ok(
                anchor.x + plate.width <= canvas.width,
                `${kind}/${slot} plate (${plate.width} wide) overflows the ${canvas.width} wide badge`,
            );
            assert.ok(
                anchor.y + plate.height <= canvas.height + 2,
                `${kind}/${slot} plate (${plate.height} tall) overflows the ${canvas.height} tall badge`,
            );
        }
        if (sub) {
            // Flush with the bottom edge is what tells the sub anchors apart from the main ones.
            assert.equal(honorOverlayAnchor("event", true).y + PLATE.event.sub.height, HONOR_ART_CANVAS.sub.height);
            assert.equal(honorOverlayAnchor("rank_match", true).y + PLATE.rank_match.sub.height, HONOR_ART_CANVAS.sub.height + 2);
        }
    }
});

test("the sub event plate never sits over the event title baked into the background", () => {
    const { honorOverlayAnchor } = loadHonorArt();
    // y=0 was the bug: the 第N名 ribbon covered "Unfading wishing"-style title art at the top.
    assert.ok(honorOverlayAnchor("event", true).y >= 38);
});
