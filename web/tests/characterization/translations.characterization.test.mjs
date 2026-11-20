import assert from "node:assert/strict";
import test from "node:test";

import {
  baseline,
  createStorage,
  importTypeScriptSource,
  importWebTypeScript,
  nextTurn,
  readWeb,
} from "./test-helpers.mjs";

const MASTERDATA_CACHE_IMPORT = 'import { getTranslationCache, setTranslationCache, isIndexedDBAvailable } from "./masterdata-cache";';
const MASTERDATA_VERSION_IMPORT = 'import { MASTERDATA_VERSION_KEY } from "./fetch";';
const TRANSLATION_ROOT_URL = "https://translation.exmeaning.com/files/translation";
const EN_TRANSLATION_ROOT_URL = "https://translation.exmeaning.com/files/v2/en-US/translation";

let dependencySequence = 0;

async function importTranslations(dependencies) {
  dependencySequence += 1;
  const dependencyKey = `__moesekaiTranslationDeps${dependencySequence}`;
  globalThis[dependencyKey] = dependencies;
  const source = readWeb("src/lib/translations.ts")
    .replace(
      MASTERDATA_CACHE_IMPORT,
      `const { getTranslationCache, setTranslationCache, isIndexedDBAvailable } = globalThis.${dependencyKey};`,
    )
    .replace(MASTERDATA_VERSION_IMPORT, 'const MASTERDATA_VERSION_KEY = "masterdata-version";');
  return importTypeScriptSource(source, "translations-characterization");
}

function fixtureResponseFor(url, overrides = {}) {
  const match = new URL(url).pathname.match(/\/([^/]+)\.json$/);
  const category = match?.[1];
  if (!category || overrides[category] === null) {
    return { ok: false, json: async () => ({}) };
  }
  return {
    ok: true,
    json: async () => overrides[category] ?? baseline.translationFiles[category],
  };
}

function installBrowser(storage = createStorage()) {
  globalThis.window = {};
  globalThis.localStorage = storage;
  delete globalThis.indexedDB;
  return storage;
}

test("TranslationData keeps source-string categories and canonical producer asset roots", () => {
  const source = readWeb("src/lib/translations.ts");
  assert.match(source, /const MAX_MEMORY_LOCALES = 2/);
  assert.match(source, /\/files\/translation/);
  assert.match(source, /\/files\/v2\/\$\{locale\}\/translation/);
  for (const category of baseline.translationFileOrder) {
    assert.match(source, new RegExp(`/${category}\\.json\\$\\{query\\}`));
  }
  assert.equal((source.match(/fetchTranslationFile<TranslationData\[/g) ?? []).length, 13);
  assert.match(source, /cards:\s*\{[\s\S]*prefix: TranslationMap;[\s\S]*skillName: TranslationMap;[\s\S]*\};/);
  assert.doesNotMatch(source.match(/cards:\s*\{[\s\S]*?\n\s*\};/)?.[0] ?? "", /gachaPhrase/);
  assert.equal(baseline.translationFiles.cards.gachaPhrase["見つけたよ、私の星"], "我找到属于自己的星星了");
});

test("translation loading is network -> memory with versioned URLs and an asynchronous IDB write", async () => {
  const storage = installBrowser(createStorage({
    [baseline.storage.localStorage.masterdataVersion]: "master-42",
    [baseline.storage.localStorage.translationDataVersion]: "proofread-7",
  }));
  const fetches = [];
  const writes = [];
  globalThis.fetch = async (url) => {
    fetches.push(String(url));
    return fixtureResponseFor(String(url));
  };

  const translations = await importTranslations({
    isIndexedDBAvailable: () => true,
    getTranslationCache: async () => null,
    setTranslationCache: async (...args) => { writes.push(args); },
  });

  const first = await translations.loadTranslations();
  assert.deepEqual(first, baseline.translationFiles);
  assert.equal(fetches.length, baseline.translationFileOrder.length);
  assert.ok(fetches.every((url) => url.startsWith(`${TRANSLATION_ROOT_URL}/`)));
  assert.ok(fetches.every((url) => url.endsWith("?v=proofread-7")));
  assert.deepEqual(
    writes.map(([key, , hash]) => ({ key, hash })),
    [{ key: baseline.storage.indexedDB.bundleKey, hash: "master-42:proofread-7" }],
  );
  assert.match(storage.getItem(baseline.storage.localStorage.translationCacheTime), /^\d+$/);

  const second = await translations.loadTranslations();
  assert.strictEqual(second, first);
  assert.equal(fetches.length, baseline.translationFileOrder.length, "fresh memory cache avoids IDB and network");
});

test("an IDB bundle wins over network only when the version hash matches", async () => {
  installBrowser(createStorage({
    [baseline.storage.localStorage.masterdataVersion]: "master-42",
    [baseline.storage.localStorage.translationDataVersion]: "proofread-7",
    [baseline.storage.localStorage.translationCacheTime]: String(Date.now()),
  }));
  let readArgs;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("network should not be used for an IDB hit");
  };
  const cachedBundle = structuredClone(baseline.translationFiles);
  cachedBundle.music.title["ロキ"] = "cached ROKI";

  const translations = await importTranslations({
    isIndexedDBAvailable: () => true,
    getTranslationCache: async (...args) => {
      readArgs = args;
      return cachedBundle;
    },
    setTranslationCache: async () => assert.fail("IDB hit must not be rewritten while fresh"),
  });

  assert.deepEqual(await translations.loadTranslations(), cachedBundle);
  assert.deepEqual(readArgs, [baseline.storage.indexedDB.bundleKey, "master-42:proofread-7"]);
  assert.equal(fetchCount, 0);
});

test("en-US uses isolated URLs, memory, IDB identity, timestamp, and version keys", async () => {
  const storage = installBrowser(createStorage({
    [baseline.storage.localStorage.masterdataVersion]: "master-42",
    [`${baseline.storage.localStorage.translationDataVersion}:en-US`]: "english-3",
  }));
  const fetches = [];
  const reads = [];
  const writes = [];
  globalThis.fetch = async (url) => {
    fetches.push(String(url));
    return fixtureResponseFor(String(url));
  };
  const translations = await importTranslations({
    isIndexedDBAvailable: () => true,
    getTranslationCache: async (...args) => { reads.push(args); return null; },
    setTranslationCache: async (...args) => { writes.push(args); },
  });

  await translations.loadTranslations("en-US");
  assert.equal(fetches.length, 13);
  assert.ok(fetches.every((url) => url.startsWith(`${EN_TRANSLATION_ROOT_URL}/`)));
  assert.ok(fetches.every((url) => url.endsWith("?v=english-3")));
  assert.deepEqual(reads[0], ["translations-bundle:en-US", "en-US:master-42:english-3"]);
  assert.deepEqual(writes.map(([key, , hash]) => [key, hash]), [["translations-bundle:en-US", "en-US:master-42:english-3"]]);
  assert.match(storage.getItem(`${baseline.storage.localStorage.translationCacheTime}:en-US`), /^\d+$/);
  assert.equal(storage.getItem(baseline.storage.localStorage.translationCacheTime), null);

  await translations.loadTranslations("zh-CN");
  assert.equal(fetches.length, 26, "zh-CN does not reuse the en-US memory bundle");
  assert.ok(fetches.slice(13).every((url) => !url.includes("/en-US/")));
  await translations.loadTranslations("en-US");
  assert.equal(fetches.length, 26, "the en-US memory entry remains available independently");
});

test("ja-JP, zh-TW, and ko-KR return source fallbacks without any target request", async () => {
  installBrowser();
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("unsupported target locale must not fetch");
  };
  const translations = await importTranslations({
    isIndexedDBAvailable: () => true,
    getTranslationCache: async () => assert.fail("unsupported target locale must not read IDB"),
    setTranslationCache: async () => assert.fail("unsupported target locale must not write IDB"),
  });

  for (const locale of ["ja-JP", "zh-TW", "ko-KR"]) {
    const result = await translations.loadTranslations(locale);
    assert.deepEqual(result.music, { title: {}, artist: {}, vocalCaption: {} });
  }
  assert.equal(fetchCount, 0);
});

test("legacy no-argument call sites resolve the localized route before stored UI state", async () => {
  const storage = installBrowser(createStorage({
    [baseline.storage.localStorage.uiLocale]: "zh-CN",
  }));
  globalThis.window.location = { pathname: "/en-us/music" };
  const fetches = [];
  globalThis.fetch = async (url) => {
    fetches.push(String(url));
    return fixtureResponseFor(String(url));
  };
  const translations = await importTranslations({
    isIndexedDBAvailable: () => false,
    getTranslationCache: async () => assert.fail("IDB unavailable"),
    setTranslationCache: async () => assert.fail("IDB unavailable"),
  });

  await translations.loadTranslations();
  assert.equal(storage.getItem(baseline.storage.localStorage.uiLocale), "zh-CN", "the loader does not rewrite legacy UI state");
  assert.ok(fetches.every((url) => url.startsWith(`${EN_TRANSLATION_ROOT_URL}/`)));
});

test("TranslationContext clears the visible bundle and reloads when UI locale changes", () => {
  const source = readWeb("src/contexts/TranslationContext.tsx");
  assert.match(source, /setTranslations\(null\)/);
  assert.match(source, /loadTranslations\(locale\)/);
  assert.match(source, /\}, \[locale\]\);/);
});

test("stale memory is returned immediately and revalidated in the background", async () => {
  const storage = installBrowser(createStorage({
    [baseline.storage.localStorage.masterdataVersion]: "master-42",
    [baseline.storage.localStorage.translationCacheTime]: "0",
  }));
  let fetchCount = 0;
  globalThis.fetch = async (url) => {
    fetchCount += 1;
    return fixtureResponseFor(String(url));
  };
  const writes = [];
  const translations = await importTranslations({
    isIndexedDBAvailable: () => true,
    getTranslationCache: async () => null,
    setTranslationCache: async (...args) => { writes.push(args); },
  });

  const first = await translations.loadTranslations();
  assert.equal(fetchCount, 13);
  storage.setItem(baseline.storage.localStorage.translationCacheTime, "0");
  const second = await translations.loadTranslations();
  assert.strictEqual(second, first, "stale-while-revalidate does not block the caller");
  assert.equal(fetchCount, 26, "the background refresh starts all category requests synchronously");
  await nextTurn();
  assert.equal(writes.length, 2);
  assert.notEqual(storage.getItem(baseline.storage.localStorage.translationCacheTime), "0");
});

test("missing files fall back per category and the text helpers preserve current semantics", async () => {
  installBrowser();
  globalThis.fetch = async (url) => fixtureResponseFor(String(url), { music: null });
  const translations = await importTranslations({
    isIndexedDBAvailable: () => false,
    getTranslationCache: async () => assert.fail("IDB unavailable"),
    setTranslationCache: async () => assert.fail("IDB unavailable"),
  });

  const data = await translations.loadTranslations();
  assert.deepEqual(data.music, { title: {}, artist: {}, vocalCaption: {} });
  assert.deepEqual(data.cards, baseline.translationFiles.cards);
  assert.equal(translations.getTranslation({ 原文: "译文" }, "原文"), "译文");
  assert.equal(translations.getTranslation({ 原文: "" }, "原文"), "原文");
  assert.equal(translations.getTranslation({ 原文: "   " }, "原文", "回退"), "回退");
  assert.equal(translations.getTranslation({}, "原文"), "原文");
  assert.equal(translations.getTranslation(undefined, "原文", "回退"), "回退");
  assert.equal(translations.hasTranslation({ 原文: "" }, "原文"), true, "empty values still count as present keys");
  assert.equal(translations.hasTranslation({}, "原文"), false);
});

test("proofreading updates bump the URL version, expire the timestamp, and clear memory", async () => {
  const storage = installBrowser(createStorage({
    [baseline.storage.localStorage.masterdataVersion]: "master-42",
    [baseline.storage.localStorage.translationCacheTime]: "100",
  }));
  const fetches = [];
  globalThis.fetch = async (url) => {
    fetches.push(String(url));
    return fixtureResponseFor(String(url));
  };
  const translations = await importTranslations({
    isIndexedDBAvailable: () => false,
    getTranslationCache: async () => assert.fail("IDB unavailable"),
    setTranslationCache: async () => assert.fail("IDB unavailable"),
  });

  await translations.loadTranslations();
  assert.equal(fetches.length, 13);
  const originalNow = Date.now;
  Date.now = () => 424242;
  try {
    translations.markTranslationsUpdated();
  } finally {
    Date.now = originalNow;
  }
  assert.equal(storage.getItem(baseline.storage.localStorage.translationDataVersion), "424242");
  assert.equal(storage.getItem(baseline.storage.localStorage.translationCacheTime), null);

  await translations.loadTranslations();
  assert.equal(fetches.length, 26, "cleared memory forces a new thirteen-file request");
  assert.ok(fetches.slice(13).every((url) => url.endsWith("?v=424242")));
});

function createFakeIndexedDB() {
  const stores = new Map();
  let openCount = 0;

  function request(operation) {
    const result = { result: undefined, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      try {
        result.result = operation();
        result.onsuccess?.();
      } catch (error) {
        result.error = error;
        result.onerror?.();
      }
    });
    return result;
  }

  const db = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) {
      stores.set(name, new Map());
    },
    transaction(storeName) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`missing store ${storeName}`);
      return {
        objectStore() {
          return {
            get: (key) => request(() => structuredClone(store.get(key))),
            put: (value) => request(() => { store.set(value.path, structuredClone(value)); }),
            clear: () => request(() => { store.clear(); }),
          };
        },
      };
    },
  };

  return {
    stores,
    get openCount() { return openCount; },
    open(name, version) {
      openCount += 1;
      assert.equal(name, baseline.storage.indexedDB.database);
      assert.equal(version, baseline.storage.indexedDB.version);
      const result = { result: db, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        result.onupgradeneeded?.();
        result.onsuccess?.();
      });
      return result;
    },
  };
}

test("the native IndexedDB wrapper stores hash-qualified bundles and uses one database promise", async () => {
  globalThis.window = {};
  const fakeIndexedDB = createFakeIndexedDB();
  globalThis.indexedDB = fakeIndexedDB;
  const cache = await importWebTypeScript("src/lib/masterdata-cache.ts");

  assert.equal(cache.isIndexedDBAvailable(), true);
  await cache.setTranslationCache("translations-bundle", { value: 1 }, "master:proofread");
  assert.deepEqual(await cache.getTranslationCache("translations-bundle", "master:proofread"), { value: 1 });
  assert.equal(await cache.getTranslationCache("translations-bundle", "different-hash"), null);
  assert.equal(fakeIndexedDB.openCount, 1);

  const raw = fakeIndexedDB.stores.get(baseline.storage.indexedDB.translationStore).get("translations-bundle");
  assert.equal(raw.path, "translations-bundle");
  assert.equal(raw.hash, "master:proofread");
  assert.equal(typeof raw.cachedAt, "number");

  await cache.clearTranslationCache();
  assert.equal(await cache.getTranslationCache("translations-bundle", "master:proofread"), null);
});
