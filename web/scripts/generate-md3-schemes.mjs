/**
 * MD3 Dynamic Color scheme generator
 *
 * 读取 src/lib/theme-seeds.json（角色主题色种子），用 @material/material-color-utilities
 * 生成 light / dark 两套完整的 MD3 color roles，输出为 src/styles/md3-schemes.css。
 *
 * 配色策略「中性舞台，角色原色」（2021 spec，见 docs/md3-migration.md「配色」）：
 * - 页面、卡片、描边等表面色与角色无关，固定为一组冷调中性灰（NEUTRAL_SURFACES）。
 *   由种子派生的表面色会给整页蒙上一层色相，浅色种子尤其发灰发闷。
 * - 角色色只出现在强调处，并尽量保留原色：
 *   - primary-container 是种子原色本身，用于选中态、徽标等实心填充，其上文字取近黑或白；
 *   - primary / secondary 是文字与图标用的强调色，在原色的色板上调到对卡片 ≥ 4.5:1；
 *   - secondary-container 是种子原色在卡片上的淡染，用于次要按钮、导航当前项。
 * - 第三色沿用 TonalSpot 的色相旋转，但提高彩度，并和主色一样只做文字、实心与淡染三种用法。
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
const MIN_TEXT_CONTRAST = 4.5;
/** Spotlight fills must still read as a shape against the card. */
const MIN_FILL_CONTRAST = { light: 1.3, dark: 3 };
/** How much of the seed the soft tint carries over the card. */
const TINT_AMOUNT = { light: 0.14, dark: 0.22 };

/** Seed-independent surfaces: cool neutral greys, one set per mode. */
const NEUTRAL_SURFACES = {
    light: {
        surface: "#f4f5f6", surfaceDim: "#d9dbde", surfaceBright: "#f8f9f9", background: "#f4f5f6",
        surfaceContainerLowest: "#ffffff", surfaceContainerLow: "#f8f9f9", surfaceContainer: "#eff0f1",
        surfaceContainerHigh: "#e9eaec", surfaceContainerHighest: "#e2e4e6", surfaceCard: "#ffffff",
        onSurface: "#17181a", onBackground: "#17181a", surfaceVariant: "#e2e4e6", onSurfaceVariant: "#5a5e64",
        outline: "#8a8e94", outlineVariant: "#dddfe2", inverseSurface: "#2c2d30", inverseOnSurface: "#eff0f1",
    },
    dark: {
        surface: "#121314", surfaceDim: "#121314", surfaceBright: "#37393c", background: "#121314",
        // Lowest only just under the card: pages use it for the white boxes of light mode,
        // which a near-black well would turn into holes.
        surfaceContainerLowest: "#151618", surfaceContainerLow: "#1a1b1d", surfaceContainer: "#1f2023",
        surfaceContainerHigh: "#27292b", surfaceContainerHighest: "#303235", surfaceCard: "#1a1b1d",
        onSurface: "#eceef0", onBackground: "#eceef0", surfaceVariant: "#303235", onSurfaceVariant: "#a5a8ad",
        outline: "#6c7076", outlineVariant: "#2e3033", inverseSurface: "#e4e6e9", inverseOnSurface: "#2c2d30",
    },
};
const INK = { dark: argbFromHex("#17181a"), light: argbFromHex("#ffffff") };

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

/**
 * Status colors (error, warning, success) follow the accents: legible text and
 * solids, and a tinted container rather than a saturated block that outshouts
 * everything else on the page.
 */
function statusShades(palette, isDark) {
    return accentShades(palette, palette.tone(isDark ? 70 : 40), isDark);
}

function statusLines(isDark) {
    const lines = [];
    for (const [name, palette] of Object.entries(STATUS_PALETTES)) {
        const { text, onText, tint, onTint } = statusShades(palette, isDark);
        lines.push(`--md-sys-color-${name}: ${hexFromArgb(text)};`, `--md-sys-color-on-${name}: ${hexFromArgb(onText)};`);
        lines.push(`--md-sys-color-${name}-container: ${hexFromArgb(tint)};`, `--md-sys-color-on-${name}-container: ${hexFromArgb(onTint)};`);
    }
    return lines;
}

/** Near-black or white, whichever is legible over `fill`; null when neither reaches body-text contrast. */
function inkOn(fill) {
    const best = contrastRatio(fill, INK.dark) >= contrastRatio(fill, INK.light) ? INK.dark : INK.light;
    return contrastRatio(fill, best) >= MIN_TEXT_CONTRAST ? best : null;
}

/** The seed itself when it passes `ok`, else the closest tone of its own palette that does. */
function nearestTone(palette, seedArgb, ok) {
    if (ok(seedArgb)) return seedArgb;
    const start = Math.round(Hct.fromInt(seedArgb).tone);
    for (let step = 1; step <= 100; step++) {
        for (const tone of [start - step, start + step]) {
            if (tone >= 0 && tone <= 100 && ok(palette.tone(tone))) return palette.tone(tone);
        }
    }
    throw new Error(`no usable tone for ${hexFromArgb(seedArgb)}`);
}

/** `amount` of `fg` laid over `bg`. */
function mix(fg, bg, amount) {
    const channel = (read) => Math.round(read(fg) * amount + read(bg) * (1 - amount));
    return (0xff << 24 | channel(redFromArgb) << 16 | channel(greenFromArgb) << 8 | channel(blueFromArgb)) >>> 0;
}

/** One accent color resolved against the neutral surfaces: legible text, a solid fill and a soft tint. */
function accentShades(palette, seedArgb, isDark) {
    const mode = isDark ? "dark" : "light";
    const surfaces = NEUTRAL_SURFACES[mode];
    const card = argbFromHex(surfaces.surfaceCard);
    // Accent text and icons stay legible on every container they sit on.
    const textBg = argbFromHex(isDark ? surfaces.surfaceContainerHigh : surfaces.surface);
    const text = nearestTone(palette, seedArgb, (c) => contrastRatio(c, textBg) >= MIN_TEXT_CONTRAST);
    const fill = nearestTone(palette, seedArgb, (c) => inkOn(c) !== null && contrastRatio(c, card) >= MIN_FILL_CONTRAST[mode]);
    const tint = mix(fill, card, TINT_AMOUNT[mode]);
    const onTint = nearestTone(palette, seedArgb, (c) => contrastRatio(c, tint) >= 7);
    return { text, onText: inkOn(text), fill, onFill: inkOn(fill), tint, onTint };
}

/**
 * The seed-carrying roles. Primary is the seed itself: its fill is the
 * spotlight (selection, badges), its tint the quiet emphasis. Tertiary is the
 * TonalSpot hue rotation of the seed, given enough chroma to read as a color
 * rather than a muddy neutral, and only ever used as text, a solid or a tint.
 */
function accentRoles(source, primaryPalette, tonalSpot, seedArgb, isDark) {
    const p = accentShades(primaryPalette, seedArgb, isDark);
    const tertiaryPalette = TonalPalette.fromHueAndChroma(tonalSpot.tertiaryPalette.hue, Math.min(64, Math.max(40, source.chroma)));
    const t = accentShades(tertiaryPalette, tertiaryPalette.tone(source.tone), isDark);
    return {
        primary: p.text,
        onPrimary: p.onText,
        primaryContainer: p.fill,
        onPrimaryContainer: p.onFill,
        secondary: p.text,
        onSecondary: p.onText,
        secondaryContainer: p.tint,
        onSecondaryContainer: p.onTint,
        surfaceTint: p.text,
        tertiary: t.text,
        onTertiary: t.onText,
        tertiaryContainer: t.tint,
        onTertiaryContainer: t.onTint,
    };
}

/**
 * Highlighter ink for `.brand-mark` (heading highlights): as much of the seed as
 * on-surface text over it allows, laid over the page. Pale seeds keep their exact
 * color in light mode; dark seeds are thinned until the text reads. Dark mode
 * starts at 55%, because a full-strength pastel would swallow light text.
 */
function brandMark(seedArgb, isDark) {
    const surfaces = NEUTRAL_SURFACES[isDark ? "dark" : "light"];
    const page = argbFromHex(surfaces.surface);
    const text = argbFromHex(surfaces.onSurface);
    for (let percent = isDark ? 55 : 100; percent > 0; percent -= 5) {
        const ink = mix(seedArgb, page, percent / 100);
        if (contrastRatio(ink, text) >= MIN_TEXT_CONTRAST) return ink;
    }
    return page;
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
        // Only the mini-games' reference tones still read these; page surfaces are NEUTRAL_SURFACES.
        neutralPalette: TonalPalette.fromHueAndChroma(source.hue, Math.min(4, fidelity.neutralPalette.chroma)),
        neutralVariantPalette: TonalPalette.fromHueAndChroma(source.hue, Math.min(8, fidelity.neutralVariantPalette.chroma)),
    };
    const make = (variant) => new DynamicScheme({ sourceColorHct: source, variant, contrastLevel: 0, isDark, specVersion: SPEC_VERSION, ...palettes });
    const tonalScheme = make(Variant.TONAL_SPOT);
    const scheme = isDark ? tonalScheme : make(Variant.FIDELITY);
    const overrides = {
        ...Object.fromEntries(Object.entries(NEUTRAL_SURFACES[isDark ? "dark" : "light"]).map(([role, value]) => [role, argbFromHex(value)])),
        ...accentRoles(source, scheme.primaryPalette, tonalSpot, argbFromHex(hex), isDark),
    };
    const error = statusShades(scheme.errorPalette, isDark);
    Object.assign(overrides, { error: error.text, onError: error.onText, errorContainer: error.tint, onErrorContainer: error.onTint });
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
    lines.push(`--md-sys-color-surface-card: ${hexFromArgb(roleArgb("surfaceCard"))};`);
    lines.push(`--md-ext-brand-mark: ${hexFromArgb(brandMark(argbFromHex(hex), isDark))};`);
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

let css = `/* AUTO-GENERATED by scripts/generate-md3-schemes.mjs — DO NOT EDIT.\n * Source: src/lib/theme-seeds.json · neutral surfaces + seed accents · spec ${SPEC_VERSION}\n */\n\n`;

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
