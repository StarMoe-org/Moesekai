import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Hct, argbFromHex } from "@material/material-color-utilities";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { defaultSeedId, seeds } = JSON.parse(fs.readFileSync(path.join(webRoot, "src/lib/theme-seeds.json"), "utf8"));
const css = fs.readFileSync(path.join(webRoot, "src/styles/md3-schemes.css"), "utf8");
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim(),
    roles: Object.fromEntries([...body.matchAll(/--md-sys-color-([\w-]+):\s*(#[a-f\d]{6});/gi)].map(([, key, value]) => [key, value.toLowerCase()])),
}));
function luminance(hex) {
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const [r, g, b] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
    const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}
const pairs = [
    ["primary", "on-primary"], ["primary-container", "on-primary-container"],
    ["secondary", "on-secondary"], ["secondary-container", "on-secondary-container"],
    ["tertiary", "on-tertiary"], ["tertiary-container", "on-tertiary-container"],
    ["error", "on-error"], ["error-container", "on-error-container"],
    ["surface", "on-surface"], ["surface-variant", "on-surface-variant"],
    ["inverse-surface", "inverse-on-surface"],
];

const hct = (hex) => Hct.fromInt(argbFromHex(hex));
const hueDistance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const strongPairs = [["secondary-container", "on-secondary-container"], ["tertiary-container", "on-tertiary-container"]];

for (const [id, hex] of Object.entries(seeds)) {
    for (const mode of ["light", "dark"]) {
        test(`seed ${id} ${mode}: complete roles, character-faithful primary and readable foreground pairs`, () => {
            const selector = mode === "light" ? `[data-seed="${id}"]` : `:root[data-theme="dark"][data-seed="${id}"],\n:root[data-theme="dark"] [data-seed="${id}"]`;
            const block = blocks.find((block) => block.selector === selector);
            assert.ok(block, `missing ${selector}`);
            for (const [background, foreground] of pairs) {
                assert.ok(block.roles[background] && block.roles[foreground], `missing ${background}/${foreground}`);
                const ratio = contrast(block.roles[background], block.roles[foreground]);
                assert.ok(ratio >= 4.5, `${background}/${foreground} contrast ${ratio.toFixed(3)} is below 4.5:1`);
            }
            const strong = mode === "dark" ? [...strongPairs, ["primary-container", "on-primary-container"]] : strongPairs;
            for (const [background, foreground] of strong) {
                const ratio = contrast(block.roles[background], block.roles[foreground]);
                assert.ok(ratio >= 7, `${background}/${foreground} contrast ${ratio.toFixed(3)} is below 7:1`);
            }
            const seed = hct(hex);
            if (mode === "light") {
                const container = hct(block.roles["primary-container"]);
                assert.ok(hueDistance(container.hue, seed.hue) <= 15, "light primary container keeps the character hue");
                assert.ok(Math.abs(container.tone - seed.tone) <= 12, "light primary container stays close to the character color");
            } else {
                const primary = hct(block.roles.primary);
                assert.ok(primary.tone <= 85, `dark primary tone ${primary.tone.toFixed(1)} must not wash out to near-white`);
                assert.ok(primary.chroma >= Math.min(24, seed.chroma * 0.6), "dark primary keeps visible character chroma");
            }
            for (const surface of ["surface", "surface-container-low", "surface-container", "surface-container-high"]) {
                assert.ok(hct(block.roles[surface]).chroma <= 5, `${surface} stays near-neutral`);
            }
        });
    }
}

test("official character colors and default surface metadata are generated from the same seed source", () => {
    assert.equal(Object.keys(seeds).length, 26);
    for (const [id, hex] of Object.entries(seeds)) assert.ok(css.includes(`--md-ext-color-char-${id}: ${hex};`));
    const source = fs.readFileSync(path.join(webRoot, "src/styles/md3-default-surface.generated.ts"), "utf8");
    const light = blocks.find((block) => block.selector === `[data-seed="${defaultSeedId}"]`).roles.surface;
    const dark = blocks.find((block) => block.selector.startsWith(`:root[data-theme="dark"][data-seed="${defaultSeedId}"]`)).roles.surface;
    assert.ok(source.includes(`light: "${light}"`) && source.includes(`dark: "${dark}"`));
    const fixedExport = blocks.find((block) => block.selector === `:root [data-theme="light"][data-seed="${defaultSeedId}"]`);
    assert.ok(fixedExport);
    assert.equal(fixedExport.roles.surface, light, "image export islands keep the default light surface even on a dark page");
});

test("legacy game rules are isolated and the global bridge is gone", () => {
    const globals = fs.readFileSync(path.join(webRoot, "src/app/globals.css"), "utf8");
    const games = fs.readFileSync(path.join(webRoot, "src/styles/legacy-games.css"), "utf8");
    assert.equal(fs.existsSync(path.join(webRoot, "src/styles/md3-legacy-bridge.css")), false);
    assert.ok(globals.includes('"../styles/legacy-games.css"'));
    assert.equal(globals.includes("--color-miku"), false);
    for (const line of games.split("\n")) {
        if (/^:root/.test(line)) assert.ok(line.startsWith(':root[data-legacy-game="true"]'), "game rules must not affect migrated pages");
    }
});


test("MD3 RGB channels use modern space-separated syntax while game aliases keep rgba-compatible commas", () => {
    const modern = [...css.matchAll(/--md-sys-color-[\w-]+-rgb:\s*([^;]+);/g)];
    assert.ok(modern.length >= 26 * 2 * 5);
    for (const [, channels] of modern) assert.match(channels, /^\d+ \d+ \d+$/);
    assert.match(css, /--md-ext-accent-rgb: \d+, \d+, \d+;/);
});
