/**
 * Bonds honor geometry (src/components/honor/bondsHonorLayout.ts) against the game's
 * UIPartsBondsHonorImage prefab: in a sub slot the SDs are scaled 0.77, sit on the bottom edge
 * and are each clipped to a 103.5px strip from their own side, overlapping in the middle.
 * Run with: node --test web/tests/bonds-honor-layout.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { importWebTypeScript } from "./characterization/test-helpers.mjs";

const { getBondsHonorLayout } = await importWebTypeScript("src/components/honor/bondsHonorLayout.ts");

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test("sub slot: SDs at 0.77 scale, bottom-aligned, clipped to overlapping 103.5px strips", () => {
    const layout = getBondsHonorLayout(true);
    assert.equal(layout.width, 180);
    assert.equal(layout.height, 80);

    close(layout.leftCharacter.width, 160 * 0.77);
    close(layout.leftCharacter.height, 136 * 0.77);
    close(layout.leftCharacter.x, 0);
    close(layout.leftCharacter.y + layout.leftCharacter.height, 80);
    close(layout.rightCharacter.x + layout.rightCharacter.width, 180);
    close(layout.rightCharacter.y, layout.leftCharacter.y);

    assert.deepEqual(layout.leftCharacterClip, { x: 0, y: 0, width: 103.5, height: 80 });
    assert.deepEqual(layout.rightCharacterClip, { x: 76.5, y: 0, width: 103.5, height: 80 });
    assert.deepEqual(layout.leftBackground, { x: 0, y: 0, width: 93, height: 80 });
});

test("main slot: SDs at full size, 12px below the badge, unclipped", () => {
    const layout = getBondsHonorLayout(false);
    assert.equal(layout.width, 380);
    assert.deepEqual(layout.leftCharacter, { x: 0, y: -44, width: 160, height: 136 });
    assert.deepEqual(layout.rightCharacter, { x: 220, y: -44, width: 160, height: 136 });
    assert.equal(layout.leftCharacterClip, undefined);
    assert.equal(layout.rightCharacterClip, undefined);
    assert.deepEqual(layout.leftBackground, { x: 0, y: 0, width: 193, height: 80 });
});

test("level icons are 16px in both slots, along the bottom edge from x=50", () => {
    for (const sub of [true, false]) {
        const layout = getBondsHonorLayout(sub);
        assert.deepEqual(layout.levelIcon(0), { x: 50, y: 64, width: 16, height: 16 });
        assert.deepEqual(layout.levelIcon(4), { x: 114, y: 64, width: 16, height: 16 });
    }
});

const assets = await importWebTypeScript("src/lib/assets.ts", [
    ['import {\n    type AssetSourceType,\n} from "@/contexts/ThemeContext";', 'type AssetSourceType = string;'],
    ['import { ASSET_DOMAIN_BACKUP, ASSET_DOMAIN_MAIN } from "@/lib/assetDomains";', 'const ASSET_DOMAIN_MAIN = "https://main.example"; const ASSET_DOMAIN_BACKUP = "https://backup.example";'],
    ['import { defaultContentRegionForPathname } from "@/lib/locale-routing";', 'const defaultContentRegionForPathname = () => "jp";'],
]);

test("bonds honor word: one bundle per rarity, as the game names them", () => {
    const url = (rarity) => assets.getBondsHonorWordUrl("honorname_0102_01", rarity, "main-jp");
    assert.equal(url("low"), "https://main.example/sekai-jp-assets/bonds_honor/word/honorname_0102_01_01/honorname_0102_01_01.webp");
    assert.match(url("middle"), /honorname_0102_01_02\/honorname_0102_01_02\.webp$/);
    assert.match(url("high"), /honorname_0102_01_03\/honorname_0102_01_03\.webp$/);
    assert.match(url("highest"), /honorname_0102_01_04\/honorname_0102_01_04\.webp$/);
    assert.match(url("unknown"), /honorname_0102_01_01\.webp$/);
});
