import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

import {
  baseline,
  createStorage,
  importWebTypeScript,
  readJson,
  readWeb,
  WEB_ROOT,
} from "./test-helpers.mjs";

function extractTranslationCallback(source) {
  const match = source.match(/const t = useCallback\(((?:\([^\n]+\)[\s\S]*?\n\s*\})), \[useLLMTranslation, translations\]\);/);
  assert.ok(match, "TranslationContext t() callback should remain extractable");
  const javascript = stripTypeScriptTypes(`const callback = ${match[1]};`, { mode: "transform" });
  return new Function(
    "useLLMTranslation",
    "translations",
    "getTranslation",
    `${javascript}\nreturn callback;`,
  );
}

test("TranslationContext t(category, field, original) keeps the opt-in and fallback contract", () => {
  const source = readWeb("src/contexts/TranslationContext.tsx");
  const makeCallback = extractTranslationCallback(source);
  const getTranslation = (map, key, fallback) => !map || !key ? (fallback ?? key) : (map[key] ?? fallback ?? key);
  const translations = baseline.translationFiles;

  assert.equal(makeCallback(false, translations, getTranslation)("music", "title", "ロキ"), null);
  assert.equal(makeCallback(true, null, getTranslation)("music", "title", "ロキ"), null);
  assert.equal(makeCallback(true, translations, getTranslation)("music", "missing", "ロキ"), null);
  assert.equal(makeCallback(true, translations, getTranslation)("music", "title", "ロキ"), "ROKI");
  assert.equal(makeCallback(true, translations, getTranslation)("music", "title", "39"), null);

  const sameAfterTrim = { music: { title: { " ロキ ": "ロキ" } } };
  assert.equal(makeCallback(true, sameAfterTrim, getTranslation)("music", "title", " ロキ "), null);
  assert.match(source, /t: \(category: keyof TranslationData, subCategory: string, original: string\) => string \| null/);
  assert.match(source, /hasT: \(category: keyof TranslationData, subCategory: string, original: string\) => boolean/);
});

function extractDefaultLLMSetting() {
  const source = readWeb("src/contexts/ThemeContext.tsx");
  const match = source.match(/function getDefaultLLMTranslationSetting\(\): boolean \{[\s\S]*?\n\}/);
  assert.ok(match, "theme default function should remain extractable");
  const javascript = stripTypeScriptTypes(match[0], { mode: "transform" });
  return new Function(
    "LLM_TRANSLATION_STORAGE_KEY",
    "UI_LOCALE_STORAGE_KEY",
    "normalizeUiLocale",
    "detectBrowserUiLocale",
    `${javascript}\nreturn getDefaultLLMTranslationSetting;`,
  );
}

test("useLLMTranslation remains explicit-override first and defaults only zh-CN browsers on", () => {
  const makeDefault = extractDefaultLLMSetting();
  const normalize = (value) => baseline.validation.uiLocales.includes(value) ? value : "zh-CN";
  const llmKey = baseline.storage.localStorage.llmTranslation;
  const uiKey = baseline.storage.localStorage.uiLocale;

  delete globalThis.window;
  globalThis.localStorage = createStorage();
  assert.equal(makeDefault(llmKey, uiKey, normalize, () => "en-US")(), true, "SSR default is on");

  globalThis.window = {};
  globalThis.localStorage = createStorage({ [baseline.storage.localStorage.llmTranslation]: "false", [uiKey]: "zh-CN" });
  assert.equal(makeDefault(llmKey, uiKey, normalize, () => "zh-CN")(), false);
  globalThis.localStorage = createStorage({ [baseline.storage.localStorage.llmTranslation]: "true", [uiKey]: "en-US" });
  assert.equal(makeDefault(llmKey, uiKey, normalize, () => "en-US")(), true);
  globalThis.localStorage = createStorage({ [uiKey]: "zh-CN" });
  assert.equal(makeDefault(llmKey, uiKey, normalize, () => "en-US")(), true);
  globalThis.localStorage = createStorage({ [uiKey]: "zh-TW" });
  assert.equal(makeDefault(llmKey, uiKey, normalize, () => "zh-CN")(), false);
  globalThis.localStorage = createStorage();
  assert.equal(makeDefault(llmKey, uiKey, normalize, () => "ja-JP")(), false);
});

test("TranslatedText keeps original-only, inline, stacked, and hook behavior", () => {
  const source = readWeb("src/components/common/TranslatedText.tsx");
  assert.match(source, /const translation = t\(category, field, original\);/);
  assert.match(source, /if \(!translation\)[\s\S]*return <span className=\{originalClassName\}>\{original\}<\/span>/);
  assert.match(source, /if \(inline\)[\s\S]*\(\{translation\}\)/);
  assert.match(source, /<span className="flex flex-col">/);
  assert.match(source, /translationClassName = "type-body-s text-on-surface-variant mt-0\.5"/);
  assert.match(source, /return t\(category, field, original\);/);
});

test("translation storage keys and cache ordering remain pinned to the baseline fixture", () => {
  const translationSource = readWeb("src/lib/translations.ts");
  const cacheSource = readWeb("src/lib/masterdata-cache.ts");
  const themeSource = readWeb("src/contexts/ThemeContext.tsx");
  const musicSource = readWeb("src/app/music/client.tsx");
  const scrollSource = readWeb("src/hooks/useScrollRestore.ts");

  for (const key of [
    baseline.storage.localStorage.translationCacheTime,
    baseline.storage.localStorage.translationDataVersion,
    baseline.storage.indexedDB.bundleKey,
  ]) {
    assert.ok(translationSource.includes(`"${key}"`));
  }
  assert.ok(themeSource.includes(`"${baseline.storage.localStorage.llmTranslation}"`));
  assert.ok(themeSource.includes(`"${baseline.storage.localStorage.serverSource}"`));
  assert.ok(themeSource.includes(`"${baseline.storage.localStorage.assetSource}"`));
  assert.ok(musicSource.includes(`const STORAGE_KEY = "${baseline.storage.sessionStorage.musicFilters}"`));
  assert.match(scrollSource, /const SCROLL_KEY = `\$\{storageKey\}_scroll`;/);
  assert.match(scrollSource, /const COUNT_KEY = `\$\{storageKey\}_displayCount`;/);
  assert.match(cacheSource, /const DB_NAME = "snowy-cache";/);
  assert.match(cacheSource, /const STORE_TRANSLATIONS = "translations";/);
  assert.match(translationSource, /memory → IndexedDB → network/);
  assert.match(translationSource, /const TRANSLATION_CACHE_TTL = 30 \* 60 \* 1000;/);
  assert.equal(baseline.storage.indexedDB.ttlMs, 30 * 60 * 1000);
});

async function parseCharacterColors() {
  const seedData = readJson("src/lib/theme-seeds.json");
  const seeds = await importWebTypeScript("src/lib/theme-seeds.ts", [[
    'import themeSeeds from "./theme-seeds.json";',
    `const themeSeeds = ${JSON.stringify(seedData)};`,
  ]]);
  assert.deepEqual(seeds.THEME_SEED_COLORS, seedData.seeds, "theme seeds must expose the shared official color map");
  const types = await importWebTypeScript("src/types/types.ts", [[
    'import { THEME_SEED_COLORS } from "@/lib/theme-seeds";',
    `const THEME_SEED_COLORS = ${JSON.stringify(seeds.THEME_SEED_COLORS)};`,
  ]]);
  assert.deepEqual(types.CHAR_COLORS, seedData.seeds, "types must expose every official character seed unchanged");
  return types.CHAR_COLORS;
}

test("CHAR_COLORS preserves official theme-seeds.json colors through types and the ThemeContext re-export", async () => {
  assert.deepEqual(await parseCharacterColors(), baseline.charColors);
  const themeSource = readWeb("src/contexts/ThemeContext.tsx");
  assert.match(themeSource, /import \{ CHAR_COLORS \} from "@\/types\/types";/);
  assert.match(themeSource, /export \{ CHAR_COLORS \};/);
});

function currentMusicMatch(music, queryText, cnById, enById, aliasesById) {
  const query = queryText.toLowerCase().trim();
  const queryAsNumber = Number.parseInt(query, 10);
  if (music.id === queryAsNumber) return true;
  if (music.title.toLowerCase().includes(query)) return true;
  const chineseTitle = cnById.get(music.id);
  if (chineseTitle?.toLowerCase().includes(query)) return true;
  const englishTitle = enById.get(music.id);
  if (englishTitle?.toLowerCase().includes(query)) return true;
  if (music.composer.toLowerCase().includes(query)) return true;
  if (music.lyricist.toLowerCase().includes(query)) return true;
  if (music.arranger.toLowerCase().includes(query)) return true;
  return aliasesById.get(music.id)?.some((alias) => alias.toLowerCase().includes(query)) ?? false;
}

test("music list/search preserves ID, original, cn, credits, and community alias matching", () => {
  const source = readWeb("src/app/music/client.tsx");
  for (const fragment of [
    'case "id-eq":',
    "return music.id === term.value;",
    "music.title.toLowerCase().includes(q)",
    "const cn = musicCnMap.get(music.id);",
    "music.composer.toLowerCase().includes(q)",
    "music.lyricist.toLowerCase().includes(q)",
    "music.arranger.toLowerCase().includes(q)",
    "aliases && aliases.some(alias => alias.toLowerCase().includes(q))",
  ]) assert.ok(source.includes(fragment), fragment);

  const music = { id: 1, title: "ロキ", composer: "みきとP", lyricist: "みきとP", arranger: "-" };
  const cnById = new Map([[1, "ROKI"]]);
  const enById = new Map([[1, "Roki English"]]);
  const aliases = new Map([[1, ["Roki song"]]]);
  assert.equal(currentMusicMatch(music, "1", cnById, enById, aliases), true);
  assert.equal(currentMusicMatch(music, "ロキ", cnById, enById, aliases), true);
  assert.equal(currentMusicMatch(music, "roki", cnById, enById, aliases), true);
  assert.equal(currentMusicMatch(music, "roki english", cnById, enById, aliases), true);
  assert.equal(currentMusicMatch(music, "みきと", cnById, enById, aliases), true);
  assert.equal(currentMusicMatch(music, "roki song", cnById, enById, aliases), true);
  assert.equal(currentMusicMatch(music, "missing overlay", cnById, enById, aliases), false);
});

test("search-index consumers preserve n/cn, add en, and keep aliases separate", () => {
  const palette = readWeb("src/components/CommandPalette.tsx");
  const music = readWeb("src/app/music/client.tsx");
  assert.match(palette, /n: string;\s*\/\/ name \(JP\)/);
  assert.match(palette, /cn\?: string;\s*\/\/ name \(CN translation\)/);
  assert.match(palette, /en\?: string;\s*\/\/ name \(EN translation\)/);
  assert.match(palette, /item\.n\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(palette, /item\.cn && item\.cn\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(palette, /item\.en && item\.en\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(palette, /fetchMusicAliases/);
  assert.ok(palette.includes("fetch(SEARCH_INDEX_URL)"));
  assert.ok(music.includes("fetch(SEARCH_INDEX_URL)"));
  assert.equal(
    readWeb("src/lib/lyrics-aliases.mjs").match(/SEARCH_INDEX_URL = "([^"]+)"/)[1],
    baseline.baseline.searchIndexUrl,
  );
  assert.match(music, /if \(item\.g !== "music"\) continue;/);
  assert.match(music, /if \(item\.cn\) cnMap\.set\(item\.id, item\.cn\)/);
  assert.match(music, /if \(item\.en\) enMap\.set\(item\.id, item\.en\)/);
  assert.deepEqual(Object.keys(baseline.searchIndex[0]).sort(), ["cn", "g", "id", "n"]);
});

test("MusicItem keeps localized default links and translation precedence", () => {
  const item = readWeb("src/components/music/MusicItem.tsx");
  assert.match(item, /import Link from "@\/components\/LocalizedLink";/);
  assert.match(item, /hrefBase = "\/music"/);
  assert.match(item, /const itemHref = href \?\? `\$\{hrefBase\}\/\$\{music\.id\}`/);
  assert.match(item, /translateMasterText\("music", "title", music\.title\) \?\? \(useLLMTranslation \? indexedTitle : undefined\)/);
  assert.match(item, /\{music\.title\}[\s\S]*\{translatedTitle &&/);
  assert.match(item, /<p className="type-body-s text-on-surface-variant mt-1">\s*\{music\.composer\}/, "composer credit must use secondary semantic text");
});

test("music list/detail preserve responsive layouts and use light/dark semantic colors", () => {
  const layout = readWeb("src/components/music/music-layout.ts");
  const detail = readWeb("src/app/music/[id]/client.tsx");
  const item = readWeb("src/components/music/MusicItem.tsx");
  const filters = readWeb("src/components/music/MusicFilters.tsx");
  const patterns = readWeb("src/components/md3/Patterns.tsx");
  const pageContainer = patterns.match(/export function PageContainer[\s\S]*?\n\}/)?.[0];
  assert.ok(pageContainer, "the shared responsive PageContainer must remain available");

  assert.ok(layout.includes(`MUSIC_GRID_CLASS = "${baseline.musicUi.gridClass}"`));
  assert.ok(detail.includes(`className="${baseline.musicUi.detailGridClass}"`));
  assert.ok(detail.includes(`className="${baseline.musicUi.detailStickyClass}"`));
  assert.match(detail, /<PageContainer>[\s\S]*<h1/, "music content must use the shared page gutters");
  assert.match(pageContainer, /mx-auto w-full px-4 py-6 sm:px-6 sm:py-8/);
  assert.match(pageContainer, /"max-w-7xl"/, "ordinary pages retain a bounded desktop content width");
  assert.match(detail, /<h1 className="min-w-0 type-headline-m text-on-surface sm:type-headline-l">/);
  assert.match(item, /sizes="\(max-width: 640px\) 50vw, \(max-width: 1024px\) 33vw, 20vw"/);
  assert.match(item, /bg-surface-card text-on-surface/);
  assert.match(filters, /className=\{getFilterChipStateClasses\(isSelected\)\}/);
  assert.match(filters, /className=\{`!p-1\.5 \$\{getFilterIconStateClasses\(isSelected\)\}`\}/);
  const baseFilters = readWeb("src/components/common/BaseFilters.tsx");
  assert.ok(baseFilters.includes('border-transparent bg-secondary-container text-on-secondary-container'), "selected filter chips retain a distinct theme-aware state");
  assert.ok(baseFilters.includes('border-outline-variant bg-transparent text-on-surface-variant'), "unselected filter chips retain theme-aware text and outlines");

  // Dark mode now comes from the shared roles rather than per-component dark: classes.
  const tokens = readWeb("src/styles/md3-tokens.css");
  const schemes = readWeb("src/styles/md3-schemes.css");
  const lightRoles = schemes.match(/:root\s*\{([^}]*--md-sys-color-primary:[^}]*)\}/)?.[1];
  const darkRoles = schemes.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1];
  assert.ok(lightRoles && darkRoles, "both light and dark default color schemes must be generated");
  for (const role of ["surface-container-low", "surface-card", "on-surface", "on-surface-variant", "secondary-container", "on-secondary-container", "outline-variant"]) {
    assert.ok(tokens.includes(`--color-${role}: var(--md-sys-color-${role});`), `${role} must resolve through the dynamic scheme`);
    const declaration = new RegExp(`--md-sys-color-${role}: #[0-9a-fA-F]{6};`);
    assert.ok(declaration.test(lightRoles), `${role} must exist in the light scheme`);
    assert.ok(declaration.test(darkRoles), `${role} must exist in the dark scheme`);
  }
  assert.doesNotMatch(detail, /fetchLyrics|LyricText/, "the existing music detail route remains independent of lyrics");
});

test("RootLayout renders native parser scripts in the SSR head and always loads analytics", () => {
  const layout = readWeb("src/app/layout.tsx");
  const headScripts = readWeb("src/components/RootHeadScripts.tsx");
  const googleTag = readWeb("src/components/GoogleTagBootstrap.tsx");
  const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
  const body = layout.slice(layout.indexOf("<body"), layout.indexOf("</body>"));
  assert.match(head, /<RootHeadScripts/);
  assert.match(headScripts, /useServerInsertedHTML\(\(\) => \{/);
  assert.match(headScripts, /id="moesekai-theme-bootstrap"/);
  assert.match(headScripts, /id="moesekai-website-jsonld"[\s\S]*type="application\/ld\+json"/);
  assert.match(headScripts, /id="moesekai-videogame-jsonld"[\s\S]*type="application\/ld\+json"/);
  assert.match(headScripts, /id="moesekai-navigation-jsonld"[\s\S]*type="application\/ld\+json"/);
  assert.match(headScripts, /return null;/);
  assert.match(layout, /import \{ serializeJsonLd \} from "@\/lib\/json-ld"/);
  assert.match(readWeb("src/lib/json-ld.ts"), /JSON\.stringify\(value\)\.replace\(JSON_LD_ESCAPE_PATTERN/);
  assert.doesNotMatch(body, /moesekai-(?:website|videogame|navigation)-jsonld/);
  assert.doesNotMatch(layout, /bootstrapMarkup|<div hidden dangerouslySetInnerHTML/);
  assert.match(body, /<GoogleTagBootstrap \/>/);
  assert.doesNotMatch(layout, /<Script|strategy="(?:before|after)Interactive"/);
  assert.match(googleTag, /useEffect\(\(\) => \{/);
  assert.match(googleTag, /getGoogleTagMeasurementId\(window\.location\.hostname\)/);
  assert.match(googleTag, /window\.gtag\("config", measurementId/);
  assert.doesNotMatch(googleTag, /analyticsConsent|isAnalyticsAllowed|readAnalyticsConsent/);
});

test("home carousel promotes only the currently visible background as the LCP candidate", () => {
  const hero = readWeb("src/components/home/HeroCarousel.tsx");
  assert.equal(hero.match(/isActive=\{index === currentIndex\}/g)?.length, 3);
  assert.equal(hero.match(/loading=\{isActive \? "eager" : "lazy"\}/g)?.length, 3);
  assert.equal(hero.match(/fetchPriority=\{isActive \? "high" : undefined\}/g)?.length, 3);
  assert.doesNotMatch(hero, /loading="eager"/);
  assert.match(hero, /getEventLogoUrl[\s\S]*loading="lazy"/);
  assert.match(hero, /getGachaLogoUrl[\s\S]*loading="lazy"/);
});

test("music SEO remains server-wired for list and detail independently of lyrics", () => {
  assert.match(readWeb("src/app/music/page.tsx"), /withPageBreadcrumb\("music"/);
  assert.match(readWeb("src/app/music/[id]/page.tsx"), /defineMusicDetailClientPage\(MusicDetailClient\)/);
  assert.match(readWeb("src/lib/seo-routes-data.json"), /"path": "\/music\/", "pageKey": "music"/);
  assert.match(readWeb("src/lib/seo-keywords.ts"), /music: definePage\(\s*"\/music"/);
});

test("2D chart SVG normalization rewrites relative note asset paths and fixes negative rect dimensions", () => {
  const routeSource = readWeb("src/app/chart-svg/[musicId]/[difficulty]/route.ts");
  assert.match(routeSource, /export async function GET/);

  assert.doesNotMatch(routeSource, /export function normalizeChartSvg/, "Next route files may only export route handlers and supported configuration");
  const match = routeSource.match(/function normalizeChartSvg\((?:[\s\S]*?\n\})/);
  assert.ok(match, "normalizeChartSvg should remain a private route helper");
  const js = stripTypeScriptTypes(match[0], { mode: "transform" });
  const normalizeChartSvg = new Function(
    "ABSOLUTE_NOTES_BASE",
    `${js}\nreturn normalizeChartSvg;`,
  )("https://charts-new.unipjsk.com/moe/notes_new/");

  const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><symbol id="notes-0"><image href="../../notes_new/custom01/notes_0.png" width="118"/></symbol><symbol id="notes-0-middle" viewBox="0 0 134400 56"><image href="../../notes_new/custom01/notes_0.png" x="-37200" y="-3" width="141600" height="62"/></symbol><clipPath id="test"><rect x="0" y="0" width="-3.142857" height="30"/></clipPath></defs></svg>`;
  const normalized = normalizeChartSvg(sampleSvg);

  assert.ok(!normalized.includes("../../notes_new/"), "Relative notes_new path should be removed");
  assert.ok(normalized.includes("https://charts-new.unipjsk.com/moe/notes_new/custom01/notes_0.png"), "Absolute notes CDN URL should be used");
  assert.ok(!normalized.includes('width="-3.142857"'), "Negative rect width should be removed");
  assert.ok(normalized.includes('width="0"'), "Negative rect width should become 0");
  assert.ok(
    /<symbol id="notes-0-middle"[^>]*><image preserveAspectRatio="none" /.test(normalized),
    "Note middle sprite image should get preserveAspectRatio=none so the stretched slice stays visible",
  );
  assert.ok(
    !/<symbol id="notes-0"><image preserveAspectRatio/.test(normalized),
    "Non-middle note sprite images should be left untouched",
  );
  assert.equal(normalizeChartSvg(normalized), normalized, "Normalization should be idempotent");

  const assetsSource = readWeb("src/lib/assets.ts");
  assert.match(assetsSource, /export function getChartSvgUrl\(musicId:\s*number,\s*difficulty:\s*string/);
  assert.match(assetsSource, /`\/chart-svg\/\$\{musicId\}\/\$\{difficulty\}\.svg`/);
});

function loadSus2ImgPipeline() {
  // The vendored files are plain TS modules importing each other; concatenate them
  // into one scope (imports removed) so the pipeline runs without a bundler.
  const order = ["fraction.ts", "model.ts", "parser.ts", "renderer.ts"];
  let js = "";
  for (const file of order) {
    let src = readWeb(`src/vendor/sekai-sus2img/${file}`);
    src = src.replace(/^import\s+[\s\S]*?from\s+'[^']+'\n/gm, "");
    js += `\n${stripTypeScriptTypes(src, { mode: "transform" })}`;
  }
  js = js.replace(/^export /gm, "");
  return new Function(`${js}\nreturn { parseSusText, renderScoreToSvg };`)();
}

test("2D chart self-render pipeline turns SUS text into a complete SVG with local sprites", () => {
  const routeSource = readWeb("src/app/chart-svg/[musicId]/[difficulty]/route.ts");
  assert.match(routeSource, /@\/vendor\/sekai-sus2img\/parser/, "route renders from vendored SUS parser");
  assert.match(routeSource, /@\/vendor\/sekai-sus2img\/renderer/, "route renders with vendored SVG renderer");
  assert.match(routeSource, /proxyUpstreamChartSvg/, "upstream static SVG proxy remains as fallback");
  assert.match(routeSource, /"\/notes_new\/custom01"/, "self-render uses locally vendored note sprites");

  const { parseSusText, renderScoreToSvg } = loadSus2ImgPipeline();
  const sus = [
    "#BPM01: 120",
    "#00008: 01",
    "#00019: 1313", // two taps, lane 9, width 3
    "#000340: 1424", // one slide (start + end), lane 4, width 4
  ].join("\n");

  const score = parseSusText(sus);
  assert.equal(score.notes.length, 4, "two taps + slide start/end should survive parsing");

  score.meta.title = "Test Song";
  score.meta.difficulty = "MASTER";
  score.meta.playlevel = "32";

  const { svg, width, height } = renderScoreToSvg(score, {
    noteHost: "/notes_new/custom01",
    noteSize: 18,
    timeHeight: 240,
  });

  assert.ok(width > 0 && height > 0, "rendered SVG should have positive dimensions");
  assert.match(svg, /<symbol id="notes-1-middle"[^>]*><image [^>]*preserveAspectRatio="none"/,
    "stretched note-middle sprites must carry preserveAspectRatio=none");
  assert.match(svg, /href="\/notes_new\/custom01\/notes_1\.png"/, "note sprites resolve to the local public dir");
  assert.match(svg, /<use href="#notes-\d+-4"/, "notes are placed via 3-slice symbols");
  assert.match(svg, /class="slide"/, "slide path is rendered");
  assert.match(svg, /MASTER 32 譜面確認/, "meta subtitle matches upstream format");

  // Every sprite the renderer can reference must exist locally.
  const spriteDir = join(WEB_ROOT, "public", "notes_new", "custom01");
  const expectedSprites = [];
  for (let n = 0; n <= 6; n += 1) expectedSprites.push(`notes_${n}.png`);
  expectedSprites.push(
    "notes_friction_among_crtcl.png",
    "notes_friction_among_flick.png",
    "notes_friction_among_long.png",
    "notes_long_among.png",
    "notes_long_among_crtcl.png",
  );
  for (let w = 1; w <= 6; w += 1) {
    const ww = `0${w}`;
    expectedSprites.push(
      `notes_flick_arrow_${ww}.png`,
      `notes_flick_arrow_${ww}_diagonal.png`,
      `notes_flick_arrow_crtcl_${ww}.png`,
      `notes_flick_arrow_crtcl_${ww}_diagonal.png`,
    );
  }
  for (const sprite of expectedSprites) {
    assert.ok(existsSync(join(spriteDir, sprite)), `missing local note sprite: ${sprite}`);
  }
});

function runNodeScript(relativePath) {
  return spawnSync(process.execPath, [relativePath], {
    cwd: WEB_ROOT,
    encoding: "utf8",
  });
}

test("UI i18n parity, literal usage, hardcoded allowlist, and SEO registry match the captured baseline", () => {
  const keyCheck = runNodeScript("scripts/check-i18n-keys.mjs");
  assert.equal(keyCheck.status, 0, keyCheck.stderr);
  const keyCount = Number(keyCheck.stdout.match(/\((\d+) keys across 5 locales\)/)?.[1]);
  assert.ok(keyCount >= baseline.validation.i18nKeyCount);

  const usageCheck = runNodeScript("scripts/check-i18n-usage.mjs");
  assert.equal(usageCheck.status, 0, usageCheck.stderr);
  assert.match(usageCheck.stdout, /Literal i18n usage keys OK/);

  const hardcodedCheck = runNodeScript("scripts/scan-hardcoded-ui-text.mjs");
  assert.equal(hardcodedCheck.status, 0, hardcodedCheck.stderr);
  assert.match(hardcodedCheck.stdout, /Hardcoded UI Han scan OK/);

  const seoCheck = runNodeScript("scripts/check-seo-routes.mjs");
  assert.equal(seoCheck.status, 0, seoCheck.stderr);
  const seoCounts = seoCheck.stdout.match(/\((\d+) indexable, (\d+) noindex\)/);
  assert.ok(Number(seoCounts?.[1]) >= baseline.validation.seoIndexableRoutes);
  assert.ok(Number(seoCounts?.[2]) >= baseline.validation.seoNoindexRoutes);
});

test("search inputs, CommandPalette, and FilterDrawer preserve IME composition and prevent premature Enter navigation", async () => {
  const commandPalette = readWeb("src/components/CommandPalette.tsx");
  assert.match(commandPalette, /onCompositionStart=\{handleCompositionStart\}/, "CommandPalette input tracks composition start");
  assert.match(commandPalette, /onCompositionEnd=\{handleCompositionEnd\}/, "CommandPalette input tracks composition end");
  assert.match(commandPalette, /isComposingRef\.current/, "CommandPalette keydown handler guards on active IME composition");
  assert.match(commandPalette, /compositionEndedAtRef\.current/, "CommandPalette keydown handler guards on Enter immediately following compositionend");

  const baseFilters = readWeb("src/components/common/BaseFilters.tsx");
  assert.match(baseFilters, /function FilterSearchInput/, "BaseFilters uses dedicated FilterSearchInput with local composition buffer");
  assert.match(baseFilters, /onCompositionStart=\{handleCompositionStart\}/, "FilterSearchInput tracks composition start");
  assert.match(baseFilters, /onCompositionEnd=\{handleCompositionEnd\}/, "FilterSearchInput updates parent on composition end");
  assert.match(baseFilters, /isKeyboardEventComposing/, "FilterSearchInput stops propagation of IME escape/process keys");

  const filterDrawer = readWeb("src/components/FilterDrawer.tsx");
  assert.match(filterDrawer, /isKeyboardEventComposing\(event\)/, "FilterDrawer escape listener guards against IME composition cancellation");

  const modal = readWeb("src/components/common/Modal.tsx");
  const dialog = readWeb("src/components/md3/Dialog.tsx");
  const overlay = readWeb("src/components/md3/useOverlay.ts");
  assert.match(modal, /import \{ Dialog \} from "@\/components\/md3\/Dialog";/, "Modal must delegate to the real shared Dialog");
  assert.match(modal, /<Dialog\s+isOpen=\{isOpen\}\s+onClose=\{onClose\}/, "Modal must forward its open state and close callback");
  assert.match(dialog, /import \{[^}]*\buseOverlay\b[^}]*\} from "\.\/useOverlay";/);
  assert.match(dialog, /useOverlay\(isOpen, onClose, \{ syncHistory, closeOnEscape: dismissible \}\)/);
  assert.match(overlay, /document\.addEventListener\("keydown", handleKeyDown\)/, "the guarded handler must be the active document listener");

  // Execute the real listener instead of pinning where its early-return guard lives.
  const handlerSource = overlay.match(/function handleKeyDown\(event: KeyboardEvent\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(handlerSource, "the shared overlay keydown handler must remain extractable");
  const { isKeyboardEventComposing } = await importWebTypeScript("src/lib/shortcuts.ts");
  let effects;
  const entry = { closeOnEscape: true, modal: true, ref: { current: null }, close: () => { effects.closed += 1; } };
  const handler = new Function("topEntry", "isKeyboardEventComposing",
    `${stripTypeScriptTypes(handlerSource, { mode: "transform" })}\nreturn handleKeyDown;`,
  )(() => entry, isKeyboardEventComposing);
  const dispatch = (overrides = {}) => {
    effects = { closed: 0, prevented: 0, stopped: 0 };
    handler({
      key: "Escape", isComposing: false, keyCode: 27, defaultPrevented: false,
      preventDefault() { effects.prevented += 1; },
      stopImmediatePropagation() { effects.stopped += 1; },
      ...overrides,
    });
    return effects;
  };
  for (const [label, event] of [
    ["composing Escape", { isComposing: true }],
    ["legacy IME Escape", { keyCode: 229 }],
    ["IME Process", { key: "Process" }],
    ["already handled Escape", { defaultPrevented: true }],
    ["Enter", { key: "Enter", keyCode: 13 }],
  ]) {
    assert.deepEqual(dispatch(event), { closed: 0, prevented: 0, stopped: 0 }, `${label} must not dismiss or consume input for the Dialog`);
  }
  assert.deepEqual(dispatch(), { closed: 1, prevented: 1, stopped: 1 }, "an ordinary Escape must dismiss the Dialog exactly once");
  entry.closeOnEscape = false;
  assert.deepEqual(dispatch(), { closed: 0, prevented: 1, stopped: 1 }, "a nondismissible Dialog must not close or leak Escape to a parent");
});
