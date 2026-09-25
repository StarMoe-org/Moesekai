import assert from "node:assert/strict";
import test from "node:test";

import {
  createStorage,
  importTypeScriptSource,
  readWeb,
} from "./test-helpers.mjs";

const MASTERDATA_CACHE_IMPORT = 'import { getTranslationCache, setTranslationCache, isIndexedDBAvailable } from "./masterdata-cache";';
const MASTERDATA_VERSION_IMPORT = 'import { MASTERDATA_VERSION_KEY } from "./fetch";';
const GACHA_INFO_TRANSLATIONS_IMPORT = /import \{[^}]*\} from "\.\/translations";/;
const TRANSLATION_ROOT_URL = "https://translation.exmeaning.com/files/translation";
const EN_TRANSLATION_ROOT_URL = "https://translation.exmeaning.com/files/v2/en-US/translation";

const SUMMARY_JA = "期間限定ガチャ開催中！\n★4メンバーの出現確率アップ！";
const BUBBLE_JA = "新メンバー登場！";
const DESCRIPTION_JA = "【開催期間】\nテスト期間\n\n【注意事項】\n・テスト用の説明文です。\n・二行目の説明です。";
const GACHA_INFO_FILE = {
  summary: { [SUMMARY_JA]: "限定卡池开放中！\n★4成员出现概率提升！" },
  bubbleText: { [BUBBLE_JA]: "新成员登场！" },
  description: { [DESCRIPTION_JA]: "【开放时间】\n测试时间\n\n【注意事项】\n・测试用说明。\n・第二行说明。" },
};

let dependencySequence = 0;

async function importTranslations(dependencies = {}) {
  dependencySequence += 1;
  const dependencyKey = `__moesekaiGachaInfoTranslationDeps${dependencySequence}`;
  globalThis[dependencyKey] = {
    isIndexedDBAvailable: () => false,
    getTranslationCache: async () => assert.fail("IDB unavailable"),
    setTranslationCache: async () => assert.fail("IDB unavailable"),
    ...dependencies,
  };
  const source = readWeb("src/lib/translations.ts")
    .replace(
      MASTERDATA_CACHE_IMPORT,
      `const { getTranslationCache, setTranslationCache, isIndexedDBAvailable } = globalThis.${dependencyKey};`,
    )
    .replace(MASTERDATA_VERSION_IMPORT, 'const MASTERDATA_VERSION_KEY = "masterdata-version";');
  return importTypeScriptSource(source, "gacha-info-translations-base");
}

async function importGachaInfo() {
  const translations = await importTranslations();
  dependencySequence += 1;
  const translationsKey = `__moesekaiGachaInfoTranslations${dependencySequence}`;
  globalThis[translationsKey] = translations;
  const source = readWeb("src/lib/gachaInfoTranslations.ts");
  const valueImport = source.match(GACHA_INFO_TRANSLATIONS_IMPORT)?.[0];
  assert.ok(valueImport, "gachaInfoTranslations.ts should import its loader helpers from ./translations");
  const names = valueImport.match(/\{([^}]*)\}/)[1];
  const replaced = source.replace(valueImport, `const {${names}} = globalThis.${translationsKey};`);
  return importTypeScriptSource(replaced, "gacha-info-translations");
}

function installBrowser(storage = createStorage()) {
  globalThis.window = {};
  globalThis.localStorage = storage;
  delete globalThis.indexedDB;
  return storage;
}

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => structuredClone(body) };
}

function notFound() {
  return { ok: false, status: 404, json: async () => ({}) };
}

test("gachaInfo.json loads lazily per target locale with the shared cache-busting query and memory cache", async () => {
  installBrowser(createStorage({ "translation-data-version": "proofread-7" }));
  const fetches = [];
  globalThis.fetch = async (url) => {
    fetches.push(String(url));
    return jsonResponse(GACHA_INFO_FILE);
  };
  const gachaInfo = await importGachaInfo();

  const [first, concurrent] = await Promise.all([
    gachaInfo.loadGachaInfoTranslations("zh-CN"),
    gachaInfo.loadGachaInfoTranslations("zh-CN"),
  ]);
  assert.deepEqual(fetches, [`${TRANSLATION_ROOT_URL}/gachaInfo.json?v=proofread-7`]);
  assert.deepEqual(first, GACHA_INFO_FILE);
  assert.strictEqual(concurrent, first, "concurrent callers share one request");
  assert.strictEqual(await gachaInfo.loadGachaInfoTranslations("zh-CN"), first, "memory cache avoids a second request");
  assert.equal(fetches.length, 1);

  await gachaInfo.loadGachaInfoTranslations("en-US");
  assert.deepEqual(fetches.slice(1), [`${EN_TRANSLATION_ROOT_URL}/gachaInfo.json`]);
  await gachaInfo.loadGachaInfoTranslations("en-US");
  assert.equal(fetches.length, 2, "en-US keeps its own memory entry");
});

test("gachaInfo.json is never requested for locales without a translation target", async () => {
  installBrowser();
  globalThis.fetch = async () => assert.fail("unsupported target locale must not fetch");
  const gachaInfo = await importGachaInfo();
  for (const locale of ["ja-JP", "zh-TW", "ko-KR"]) {
    assert.deepEqual(await gachaInfo.loadGachaInfoTranslations(locale), { summary: {}, bubbleText: {}, description: {} });
  }
});

test("a missing or unreachable gachaInfo.json resolves to empty maps and is retried on the next load", async () => {
  installBrowser();
  const fetches = [];
  let mode = "404";
  globalThis.fetch = async (url) => {
    fetches.push(String(url));
    if (mode === "404") return notFound();
    if (mode === "network") throw new TypeError("Failed to fetch");
    return jsonResponse({ summary: GACHA_INFO_FILE.summary });
  };
  const gachaInfo = await importGachaInfo();

  assert.deepEqual(await gachaInfo.loadGachaInfoTranslations("zh-CN"), { summary: {}, bubbleText: {}, description: {} });
  mode = "network";
  assert.deepEqual(await gachaInfo.loadGachaInfoTranslations("zh-CN"), { summary: {}, bubbleText: {}, description: {} });
  mode = "published";
  const published = await gachaInfo.loadGachaInfoTranslations("zh-CN");
  assert.deepEqual(published, { summary: GACHA_INFO_FILE.summary, bubbleText: {}, description: {} }, "absent fields normalize to empty maps");
  assert.equal(fetches.length, 3);
});

test("the gachaInfo memory entry expires with the shared TTL and the translation data version", async () => {
  installBrowser();
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const fetches = [];
    const untranslated = { summary: { [SUMMARY_JA]: "" }, bubbleText: {}, description: {} };
    let served = untranslated;
    globalThis.fetch = async (url) => {
      fetches.push(String(url));
      return served ? jsonResponse(served) : notFound();
    };
    const translations = await importTranslations();
    const gachaInfo = await importGachaInfo();
    const ttl = translations.TRANSLATION_CACHE_TTL;

    const first = await gachaInfo.loadGachaInfoTranslations("zh-CN");
    assert.equal(gachaInfo.getGachaInfoTranslation(first, "summary", SUMMARY_JA), null, "published keys without translations show the source");

    served = GACHA_INFO_FILE;
    now += ttl - 1;
    assert.strictEqual(await gachaInfo.loadGachaInfoTranslations("zh-CN"), first, "a live entry is reused");
    assert.equal(fetches.length, 1);

    now += 2;
    const refreshed = await gachaInfo.loadGachaInfoTranslations("zh-CN");
    assert.equal(fetches.length, 2, "an expired entry is fetched again");
    assert.equal(gachaInfo.getGachaInfoTranslation(refreshed, "summary", SUMMARY_JA), GACHA_INFO_FILE.summary[SUMMARY_JA], "translations published after the first load reach an open tab");

    translations.markTranslationsUpdated("zh-CN");
    await gachaInfo.loadGachaInfoTranslations("zh-CN");
    assert.deepEqual(fetches.slice(2), [`${TRANSLATION_ROOT_URL}/gachaInfo.json?v=${now}`], "a data version bump refetches with the new cache-busting query");

    served = null;
    now += ttl;
    assert.deepEqual(await gachaInfo.loadGachaInfoTranslations("zh-CN"), GACHA_INFO_FILE, "a failed refresh keeps the previous translations");
    await gachaInfo.loadGachaInfoTranslations("zh-CN");
    assert.equal(fetches.length, 5, "a failed refresh is not cached");
  } finally {
    Date.now = realNow;
  }
});

test("the startup translation bundle does not request gachaInfo.json", async () => {
  installBrowser();
  const fetches = [];
  globalThis.fetch = async (url) => {
    fetches.push(String(url));
    return notFound();
  };
  const translations = await importTranslations();
  await translations.loadTranslations("zh-CN");
  await translations.loadTranslations("en-US");
  assert.equal(fetches.length, 26);
  assert.ok(fetches.every((url) => !url.includes("gachaInfo")));
});

test("gacha info display shows an exact translation with an original toggle and otherwise the untouched source", async () => {
  installBrowser();
  const gachaInfo = await importGachaInfo();
  const loaded = structuredClone(GACHA_INFO_FILE);

  assert.equal(gachaInfo.getGachaInfoTranslation(loaded, "description", DESCRIPTION_JA), GACHA_INFO_FILE.description[DESCRIPTION_JA]);
  assert.equal(gachaInfo.getGachaInfoTranslation(loaded, "summary", SUMMARY_JA.replace("\n", "")), null, "keys match the full multi-line source exactly");
  assert.equal(gachaInfo.getGachaInfoTranslation(loaded, "bubbleText", SUMMARY_JA), null, "fields do not share maps");
  assert.equal(gachaInfo.getGachaInfoTranslation(null, "summary", SUMMARY_JA), null);
  assert.equal(gachaInfo.getGachaInfoTranslation(loaded, "summary", undefined), null);
  assert.equal(gachaInfo.getGachaInfoTranslation({ ...loaded, bubbleText: { [BUBBLE_JA]: ` ${BUBBLE_JA} ` } }, "bubbleText", BUBBLE_JA), null, "identity translations are ignored");
  assert.equal(gachaInfo.getGachaInfoTranslation({ ...loaded, bubbleText: { [BUBBLE_JA]: "" } }, "bubbleText", BUBBLE_JA), null);

  const translated = GACHA_INFO_FILE.summary[SUMMARY_JA];
  assert.deepEqual(gachaInfo.resolveGachaInfoText(SUMMARY_JA, translated, false), { text: translated, showingTranslation: true, canToggle: true });
  assert.deepEqual(gachaInfo.resolveGachaInfoText(SUMMARY_JA, translated, true), { text: SUMMARY_JA, showingTranslation: false, canToggle: true });
  assert.deepEqual(gachaInfo.resolveGachaInfoText(SUMMARY_JA, null, false), { text: SUMMARY_JA, showingTranslation: false, canToggle: false });
  assert.deepEqual(gachaInfo.resolveGachaInfoText(SUMMARY_JA, null, true), { text: SUMMARY_JA, showingTranslation: false, canToggle: false });
});

test("the gacha detail page routes all three gachaInformation texts through the opt-in translation display", () => {
  const source = readWeb("src/app/gacha/[id]/client.tsx");
  assert.match(source, /loadGachaInfoTranslations\(/);
  assert.match(source, /useLLMTranslation/);
  for (const field of ["summary", "bubbleText", "description"]) {
    assert.match(source, new RegExp(`getGachaInfoTranslation\\([^)]*"${field}", gacha\\.gachaInformation\\?\\.${field}\\)`));
  }
  assert.equal((source.match(/whitespace-pre-line/g) ?? []).length, 2, "summary and description keep their line-break preserving blocks");
  assert.equal((source.match(/max-h-36 overflow-hidden relative/g) ?? []).length, 2, "summary and description keep their collapsed height");
  assert.match(source, /t\("page\.gacha\.showOriginalText"\)/);
  assert.match(source, /t\("page\.gacha\.showTranslatedText"\)/);
});

test("NEXT_PUBLIC_TRANSLATION_ORIGIN points every translation asset root at a local backend", async () => {
  const previous = process.env.NEXT_PUBLIC_TRANSLATION_ORIGIN;
  try {
    installBrowser();
    delete process.env.NEXT_PUBLIC_TRANSLATION_ORIGIN;
    const production = await importTranslations();
    assert.equal(production.getTranslationAssetBaseUrl("zh-CN"), TRANSLATION_ROOT_URL);
    assert.equal(production.getTranslationAssetBaseUrl("en-US"), EN_TRANSLATION_ROOT_URL);

    process.env.NEXT_PUBLIC_TRANSLATION_ORIGIN = "http://localhost:8080/";
    const local = await importTranslations();
    assert.equal(local.TRANSLATION_BASE_URL, "http://localhost:8080/files/translation");
    assert.equal(local.getTranslationAssetBaseUrl("zh-CN"), "http://localhost:8080/files/translation");
    assert.equal(local.getTranslationAssetBaseUrl("en-US"), "http://localhost:8080/files/v2/en-US/translation");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_TRANSLATION_ORIGIN;
    else process.env.NEXT_PUBLIC_TRANSLATION_ORIGIN = previous;
  }
});
