/**
 * The directory tree of the changes of a version (src/app/asset-versions/diffTree.ts): the
 * counts each folder carries, by kind and of the changes only the conversion made.
 * Run with: node --test web/tests/asset-diff-tree.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { importWebTypeScript } from "./characterization/test-helpers.mjs";

const { buildDiffDirectoryTree, findDiffDirectory } = await importWebTypeScript("src/app/asset-versions/diffTree.ts");

const file = (kind, path, cause) => ({ kind, path, size: 1, ...(cause ? { cause } : {}) });

test("each folder counts its changes by kind and those only the conversion made", () => {
    const root = buildDiffDirectoryTree([
        file("changed", "sound/bgm/a.mp3", "conversion"),
        file("changed", "sound/bgm/b.mp3", "conversion"),
        file("added", "sound/voice/c.mp3", "source"),
        file("removed", "gacha/d.png", "source"),
        file("changed", "gacha/e.png"),
    ]);

    assert.deepEqual(root.counts, { total: 5, added: 1, changed: 3, removed: 1, conversion: 2 });
    assert.deepEqual(findDiffDirectory(root, "sound").counts, { total: 3, added: 1, changed: 2, removed: 0, conversion: 2 });
    assert.deepEqual(findDiffDirectory(root, "sound/bgm").counts, { total: 2, added: 0, changed: 2, removed: 0, conversion: 2 });
    assert.deepEqual(findDiffDirectory(root, "gacha").counts, { total: 2, added: 0, changed: 1, removed: 1, conversion: 0 });
});
