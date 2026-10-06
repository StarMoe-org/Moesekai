/**
 * MD3 Dynamic Color scheme generator
 *
 * 读取 src/lib/theme-seeds.json（角色主题色种子），用 @material/material-color-utilities
 * 生成 light / dark 两套完整的 MD3 color roles，输出为 src/styles/md3-schemes.css。
 *
 * 配色策略（2021 spec，见 docs/md3-migration.md「配色」）：
 * - 亮色：Fidelity 角色映射，primary-container 保留角色原色；其上的文字取主色板
 *   tone 10/100 中对比度更高的一个，不足 4.5:1 时微调容器 tone。
 * - 次级 / 第三色容器与整个暗色模式：TonalSpot 角色映射（柔和容器、暗色 primary=tone 80），
 *   主色板仍沿用种子彩度，避免暗色下出现原色大色块或近白色主色。
 * - 中性色彩度上限 NEUTRAL_CHROMA_CAP，避免黄/绿种子把整页染成旧纸色或橄榄色。
 *
 * 运行时只需要在 <html> 上设置 data-seed="<charId>" 与 data-theme="light|dark"，
 * 不需要在客户端打包 color-utilities，也不会出现首屏闪色。
 *
 * 使用方法: node scripts/generate-md3-schemes.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    Hct,
    DynamicScheme,
    MaterialDynamicColors,
    SchemeFidelity,
    SchemeTonalSpot,
    TonalPalette,
    Variant,
    argbFromHex,
    hexFromArgb,
    redFromArgb,
    greenFromArgb,
    blueFromArgb,
} from "@material/material-color-utilities";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const seedsPath = path.join(webRoot, "src/lib/theme-seeds.json");
const outPath = path.join(webRoot, "src/styles/md3-schemes.css");
const surfaceOutPath = path.join(webRoot, "src/styles/md3-default-surface.generated.ts");

const { defaultSeedId, seeds } = JSON.parse(fs.readFileSync(seedsPath, "utf8"));

const SPEC_VERSION = "2021";
const NEUTRAL_CHROMA_CAP = 4;
const MIN_CONTAINER_CONTRAST = 4.5;

/** MD3 color roles → CSS custom property names (kebab-case). */
const ROLES = [
    "primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "inversePrimary",
    "primaryFixed", "primaryFixedDim", "onPrimaryFixed", "onPrimaryFixedVariant",
    "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer",
    "secondaryFixed", "secondaryFixedDim", "onSecondaryFixed", "onSecondaryFixedVariant",
    "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer",
    "tertiaryFixed", "tertiaryFixedDim", "onTertiaryFixed", "onTertiaryFixedVariant",
    "error", "onError", "errorContainer", "onErrorContainer",
    "background", "onBackground",
    "surface", "surfaceDim", "surfaceBright", "surfaceTint",
    "surfaceContainerLowest", "surfaceContainerLow", "surfaceContainer",
    "surfaceContainerHigh", "surfaceContainerHighest",
    "onSurface", "surfaceVariant", "onSurfaceVariant",
    "inverseSurface", "inverseOnSurface",
    "outline", "outlineVariant", "shadow", "scrim",
];

/**
 * Neutral-variant reference tones exported only for the unmodified mini-games
 * (Tailwind slate-50..950 → MD3 neutral-variant palette). Mirrored in dark mode.
 */
const NEUTRAL_TONES = [6, 10, 20, 30, 40, 50, 60, 80, 90, 95, 98];

const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const rgbTriplet = (argb) => `${redFromArgb(argb)}, ${greenFromArgb(argb)}, ${blueFromArgb(argb)}`;

function relativeLuminance(argb) {
    const [r, g, b] = [redFromArgb(argb), greenFromArgb(argb), blueFromArgb(argb)]
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * Seed-independent status palettes. A warning that turns cyan for one character and
 * lavender for another reads as decoration, so these stay fixed across seeds.
 */
const STATUS_PALETTES = {
    warning: TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex("#e6a100")).hue, 60),
    success: TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex("#2e9e5b")).hue, 48),
};

function statusLines(isDark) {
    const lines = [];
    for (const [name, palette] of Object.entries(STATUS_PALETTES)) {
        const tones = isDark ? [80, 20, 30, 90] : [40, 100, 90, 10];
        const [base, onBase, container, onContainer] = tones.map((tone) => hexFromArgb(palette.tone(tone)));
        lines.push(`--md-sys-color-${name}: ${base};`, `--md-sys-color-on-${name}: ${onBase};`);
        lines.push(`--md-sys-color-${name}-container: ${container};`, `--md-sys-color-on-${name}-container: ${onContainer};`);
    }
    return lines;
}

/** Seed color kept as the light primary container, with the most legible tone 10/100 text on it. */
function seedContainer(palette, seedArgb) {
    let tone = Hct.fromInt(seedArgb).tone;
    let container = seedArgb;
    for (let step = 0; step <= 50; step++) {
        const dark = palette.tone(10);
        const light = palette.tone(100);
        const onDark = contrastRatio(container, dark);
        const onLight = contrastRatio(container, light);
        if (Math.max(onDark, onLight) >= MIN_CONTAINER_CONTRAST) {
            return { container, onContainer: onDark >= onLight ? dark : light };
        }
        tone += onDark >= onLight ? 1 : -1;
        container = palette.tone(tone);
    }
    throw new Error(`no legible container tone for ${hexFromArgb(seedArgb)}`);
}

/** Resolve every exported role for one seed and mode. Exported for tests via the generated CSS only. */
function resolveScheme(hex, isDark) {
    const source = Hct.fromInt(argbFromHex(hex));
    const fidelity = new SchemeFidelity(source, isDark, 0, SPEC_VERSION);
    const tonalSpot = new SchemeTonalSpot(source, isDark, 0, SPEC_VERSION);
    const palettes = {
        primaryPalette: fidelity.primaryPalette,
        secondaryPalette: tonalSpot.secondaryPalette,
        tertiaryPalette: tonalSpot.tertiaryPalette,
        neutralPalette: TonalPalette.fromHueAndChroma(source.hue, Math.min(NEUTRAL_CHROMA_CAP, fidelity.neutralPalette.chroma)),
        neutralVariantPalette: TonalPalette.fromHueAndChroma(source.hue, Math.min(NEUTRAL_CHROMA_CAP + 4, fidelity.neutralVariantPalette.chroma)),
    };
    const make = (variant) => new DynamicScheme({ sourceColorHct: source, variant, contrastLevel: 0, isDark, specVersion: SPEC_VERSION, ...palettes });
    const tonalScheme = make(Variant.TONAL_SPOT);
    const scheme = isDark ? tonalScheme : make(Variant.FIDELITY);
    const overrides = {};
    if (!isDark) {
        const { container, onContainer } = seedContainer(scheme.primaryPalette, argbFromHex(hex));
        overrides.primaryContainer = container;
        overrides.onPrimaryContainer = onContainer;
        for (const role of ["secondaryContainer", "onSecondaryContainer", "tertiaryContainer", "onTertiaryContainer"]) {
            overrides[role] = MaterialDynamicColors[role].getArgb(tonalScheme);
        }
    }
    const roleArgb = (role) => overrides[role] ?? MaterialDynamicColors[role].getArgb(scheme);
    return { scheme, roleArgb };
}

function buildScheme(hex, isDark) {
    const { scheme, roleArgb } = resolveScheme(hex, isDark);
    const lines = [];
    for (const role of ROLES) {
        if (!MaterialDynamicColors[role]) continue;
        lines.push(`--md-sys-color-${kebab(role)}: ${hexFromArgb(roleArgb(role))};`);
    }
    // Card surface: white on the light page, one step above the page in dark mode.
    lines.push(`--md-sys-color-surface-card: ${hexFromArgb(roleArgb(isDark ? "surfaceContainerLow" : "surfaceContainerLowest"))};`);
    for (const role of ["primary", "onSurface", "surface", "shadow", "scrim"]) {
        lines.push(`--md-sys-color-${kebab(role)}-rgb: ${rgbTriplet(roleArgb(role)).replaceAll(",", "")};`);
    }
    for (const tone of NEUTRAL_TONES) {
        lines.push(`--md-ref-palette-neutral-variant-${tone}: ${hexFromArgb(scheme.neutralVariantPalette.tone(tone))};`);
    }
    // Mini-game-only accent aliases: a mid tone that reads both as a
    // fill under white text and as text over the surface, in each mode.
    const accents = {
        accent: scheme.primaryPalette.tone(isDark ? 50 : 40),
        "accent-deep": scheme.primaryPalette.tone(isDark ? 40 : 30),
        "accent-alt": scheme.tertiaryPalette.tone(isDark ? 50 : 40),
    };
    for (const [name, argb] of Object.entries(accents)) {
        lines.push(`--md-ext-${name}: ${hexFromArgb(argb)};`);
        lines.push(`--md-ext-${name}-rgb: ${rgbTriplet(argb)};`);
    }
    return lines;
}

const block = (selector, lines) => `${selector} {\n${lines.map((l) => `  ${l}`).join("\n")}\n}\n`;

const ids = Object.keys(seeds);
const defaultHex = seeds[defaultSeedId];
if (!defaultHex) throw new Error(`defaultSeedId ${defaultSeedId} not found in seeds`);

let css = `/* AUTO-GENERATED by scripts/generate-md3-schemes.mjs — DO NOT EDIT.\n * Source: src/lib/theme-seeds.json · Fidelity (light) + TonalSpot (dark/containers) · spec ${SPEC_VERSION}\n */\n\n`;

// Fixed character brand colors (not harmonized).
css += block(":root", ids.map((id) => `--md-ext-color-char-${id}: ${seeds[id]};`));
css += "\n";

// Default seed.
css += block(":root", [...buildScheme(defaultHex, false), ...statusLines(false)]);
css += block(':root[data-theme="dark"]', [...buildScheme(defaultHex, true), ...statusLines(true)]);
css += "\n";

for (const id of ids) {
    const hex = seeds[id];
    css += block(`[data-seed="${id}"]`, buildScheme(hex, false));
    css += block(`:root[data-theme="dark"][data-seed="${id}"],\n:root[data-theme="dark"] [data-seed="${id}"]`, buildScheme(hex, true));
}

// Fixed-appearance islands (image export / screenshot areas): a container with
// data-seed="<default>" data-theme="light" keeps the light default scheme even
// when the page itself is dark. Placed last + higher specificity than the dark rules.
css += "\n";
css += block(`:root [data-theme="light"][data-seed="${defaultSeedId}"]`, ["color-scheme: light;", ...buildScheme(defaultHex, false), ...statusLines(false)]);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, css);
const surfaceOf = (isDark) => hexFromArgb(resolveScheme(defaultHex, isDark).roleArgb("surface"));
fs.writeFileSync(surfaceOutPath, `/* AUTO-GENERATED by scripts/generate-md3-schemes.mjs — DO NOT EDIT. */
export const MD3_DEFAULT_SURFACE = { light: "${surfaceOf(false)}", dark: "${surfaceOf(true)}" } as const;
`);
console.log(`[md3] wrote ${path.relative(webRoot, outPath)} (${ids.length} seeds, ${(css.length / 1024).toFixed(1)} KB)`);
