import assert from "node:assert/strict";
import test from "node:test";

import {
  baseline,
  importTypeScriptSource,
  importWebTypeScript,
  readWeb,
} from "./test-helpers.mjs";

test("all five route locales retain their UI, server, asset, and zh-CN fallback mapping", async () => {
  const routing = await importWebTypeScript("src/lib/locale-routing.ts");
  assert.equal(routing.DEFAULT_ROUTE_LOCALE, "zh-cn");
  assert.deepEqual([...routing.SUPPORTED_ROUTE_LOCALES], baseline.localeRouting.map((item) => item.route));

  for (const expected of baseline.localeRouting) {
    assert.deepEqual(routing.getLocaleRouteConfig(expected.route), {
      uiLocale: expected.uiLocale,
      defaultServer: expected.server,
      defaultAssetSource: expected.assetSource,
    });
    assert.equal(routing.routeLocaleToUiLocale(expected.route), expected.uiLocale);
    assert.equal(routing.uiLocaleToRouteLocale(expected.uiLocale), expected.route);
    assert.equal(routing.defaultContentRegionForPathname(`/${expected.route}/music/1`), expected.server);
  }

  assert.equal(routing.normalizeRouteLocale(" EN-US "), "en-us");
  assert.equal(routing.normalizeRouteLocale("fr-FR"), "zh-cn");
  assert.equal(routing.defaultContentRegionForPathname("/music/1"), "cn");
  assert.equal(routing.defaultContentRegionForPathname(null), "cn");
});

test("UI locale resolution keeps language-family fallbacks and RFC quality ordering", async () => {
  const locales = await importWebTypeScript("src/lib/i18n/locales.ts");
  assert.deepEqual([...locales.SUPPORTED_UI_LOCALES], baseline.validation.uiLocales);
  assert.equal(locales.resolveUiLocale("zh-Hant-HK"), "zh-TW");
  assert.equal(locales.resolveUiLocale("zh-SG"), "zh-CN");
  assert.equal(locales.resolveUiLocale("en-GB"), "en-US");
  assert.equal(locales.resolveUiLocale("ja"), "ja-JP");
  assert.equal(locales.resolveUiLocale("ko"), "ko-KR");
  assert.equal(locales.resolveUiLocale("fr"), null);
  assert.equal(locales.normalizeUiLocale("fr"), "zh-CN");
  assert.equal(
    locales.resolveAcceptLanguageUiLocale("ja-JP;q=0.5,en-US;q=1.0"),
    "en-US",
  );
  assert.equal(locales.resolveAcceptLanguageUiLocale("en-US;q=0, ja-JP;q=1"), "ja-JP");
  assert.equal(locales.resolveAcceptLanguageUiLocale("fr-FR;q=1, ko;q=0.8, zh;q=0.5"), "ko-KR");
  assert.equal(locales.resolveAcceptLanguageUiLocale("en;q=bogus, zh-TW;q=0.7"), "zh-TW");
  assert.equal(locales.resolveAcceptLanguageUiLocale(null), "zh-CN");
});

test("localized paths preserve the active locale, query, hash, and bypassed resource paths", async () => {
  const routing = await importWebTypeScript("src/lib/locale-routing.ts");
  const dependencyKey = "__moesekaiLocaleRouting";
  globalThis[dependencyKey] = routing;
  const localizedPath = await importWebTypeScript("src/lib/localized-path.ts", [[
    'import { DEFAULT_ROUTE_LOCALE, isRouteLocale, type RouteLocale } from "@/lib/locale-routing";',
    `const { DEFAULT_ROUTE_LOCALE, isRouteLocale } = globalThis.${dependencyKey};\ntype RouteLocale = string;`,
  ]]);

  assert.equal(localizedPath.getRouteLocaleFromPathname("/JA-JP/music/1"), "ja-jp");
  assert.equal(localizedPath.stripRouteLocale("/en-us/music/1"), "/music/1");
  assert.equal(localizedPath.localizePath("/music/1?difficulty=master#chart", "ko-kr"), "/ko-kr/music/1?difficulty=master#chart");
  assert.equal(localizedPath.localizePath("/zh-cn/music/1", "en-us"), "/en-us/music/1");
  assert.equal(localizedPath.localizePath("/api/music/1", "en-us"), "/api/music/1");
  assert.equal(localizedPath.localizePath("https://example.com/music/1", "en-us"), "https://example.com/music/1");

  delete globalThis.window;
  assert.equal(localizedPath.localizePathForBrowser("/music/1"), "/zh-cn/music/1");
  globalThis.window = { location: { pathname: "/zh-tw/music" } };
  assert.equal(localizedPath.localizePathForBrowser("/music/1"), "/zh-tw/music/1");
});

async function importEventStoryTranslation() {
  return importWebTypeScript("src/lib/eventStoryTranslation.ts", [[
    'import { getTranslationAssetBaseUrl } from "./translations";',
    `const getTranslationAssetBaseUrl = (locale) => locale === "zh-CN"
      ? "https://translation.exmeaning.com/files/translation"
      : \`https://translation.exmeaning.com/files/v2/\${locale}/translation\`;`,
  ]]);
}

test("event-story loading deduplicates in-flight requests and caches only nonempty success", async () => {
  assert.match(readWeb("src/lib/eventStoryTranslation.ts"), /const EVENT_TRANSLATION_CACHE_LIMIT = 64/);
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return { ok: true, json: async () => structuredClone(baseline.eventStory) };
  };
  const events = await importEventStoryTranslation();

  const [first, concurrent] = await Promise.all([
    events.loadEventStoryTranslation(1),
    events.loadEventStoryTranslation(1),
  ]);
  assert.deepEqual(first, baseline.eventStory);
  assert.deepEqual(concurrent, baseline.eventStory);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    url: "https://translation.exmeaning.com/files/translation/eventStory/event_1.json",
    options: { cache: "no-store" },
  });

  assert.deepEqual(await events.loadEventStoryTranslation(1), baseline.eventStory);
  assert.equal(requests.length, 1, "nonempty episodes are retained in the per-event memory cache");
  assert.deepEqual(events.getStoryTranslation(first, 1), baseline.eventStory.episodes["1"]);
  assert.equal(events.getStoryTranslation(first, 99), null);
});

test("event-story failures and empty episode sets remain retryable; legacy maps gain official_cn meta", async () => {
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return { ok: false, json: async () => ({}) };
  };
  const failures = await importEventStoryTranslation();
  assert.equal(await failures.loadEventStoryTranslation(2), null);
  assert.equal(await failures.loadEventStoryTranslation(2), null);
  assert.equal(fetchCount, 2);

  let emptyFetchCount = 0;
  globalThis.fetch = async () => {
    emptyFetchCount += 1;
    return { ok: true, json: async () => ({ episodes: {} }) };
  };
  const empty = await importEventStoryTranslation();
  assert.deepEqual(await empty.loadEventStoryTranslation(3), { episodes: {} });
  assert.deepEqual(await empty.loadEventStoryTranslation(3), { episodes: {} });
  assert.equal(emptyFetchCount, 2);

  globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(baseline.legacyEventStory) });
  const legacy = await importEventStoryTranslation();
  assert.deepEqual(await legacy.loadEventStoryTranslation(4), {
    meta: { source: "official_cn", version: "0.0", last_updated: 0 },
    episodes: baseline.legacyEventStory,
  });
});

async function importStoryMergeFunctions() {
  const source = readWeb("src/lib/storyLoader.ts");
  const start = source.indexOf("export function mergeTranslations(");
  assert.notEqual(start, -1);
  const dependencyKey = "__moesekaiStoryMergeDependencies";
  globalThis[dependencyKey] = {
    SnippetAction: { Talk: 1 },
    getStoryTranslation(translation, episodeNo) {
      return translation?.episodes[String(episodeNo)] ?? null;
    },
  };
  return importTypeScriptSource(
    `const { SnippetAction, getStoryTranslation } = globalThis.${dependencyKey};\n${source.slice(start)}`,
    "story-merge-characterization",
  );
}

test("event story merge attaches cnBody/cnDisplayName by original source text without mutating input", async () => {
  const story = await importStoryMergeFunctions();
  const actions = [
    { type: 1, body: "ん……。\n……あれ？", chara: { id: 21, name: "ミク" } },
    { type: 1, body: "未翻译", chara: { id: 1, name: "一歌" } },
    { type: 7, body: "ミク" },
    { type: 1, body: "ん……。\n……あれ？", chara: { id: 1, name: "一歌" } },
    { type: 1, body: "未翻译", chara: { id: 21, name: "ミク" } },
  ];
  const merged = story.mergeTranslations(actions, baseline.eventStory, 1);

  assert.notStrictEqual(merged, actions);
  assert.deepEqual(merged[0], {
    ...actions[0],
    translatedBody: "唔……\n……咦？",
    translatedDisplayName: "初音未来",
    cnBody: "唔……\n……咦？",
    cnDisplayName: "初音未来",
    translationSource: "official_cn",
  });
  assert.strictEqual(merged[1], actions[1], "untranslated talk actions retain object identity");
  assert.strictEqual(merged[2], actions[2], "non-talk actions are not translated");
  assert.deepEqual(merged[3], {
    ...actions[3],
    translatedBody: "唔……\n……咦？",
    translatedDisplayName: "一歌",
    cnBody: "唔……\n……咦？",
    cnDisplayName: "一歌",
    translationSource: "official_cn",
  }, "a body-only hit fills cnDisplayName with the original name, which the UI later hides");
  assert.deepEqual(merged[4], {
    ...actions[4],
    translatedBody: undefined,
    translatedDisplayName: "初音未来",
    cnBody: undefined,
    cnDisplayName: "初音未来",
    translationSource: "official_cn",
  }, "a display-name-only hit still clones the Talk action");
  assert.deepEqual(actions[0], { type: 1, body: "ん……。\n……あれ？", chara: { id: 21, name: "ミク" } });
  assert.equal(story.mergeStoryTitle("Original", baseline.eventStory, 1), "孤独的雨");
  assert.equal(story.mergeStoryTitle("Original", baseline.eventStory, 99), "Original");

  assert.deepEqual(story.mergeTranslations([actions[0]], baseline.eventStory, 1, "en-US")[0], {
    ...actions[0],
    translatedBody: "唔……\n……咦？",
    translatedDisplayName: "初音未来",
    translationSource: "official_cn",
  }, "non-CN targets never populate the legacy cn aliases");
});

test("event story locale isolation fetches en-US only and never fetches ja-JP, zh-TW, or ko-KR", async () => {
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return { ok: true, json: async () => structuredClone(baseline.eventStory) };
  };
  const events = await importEventStoryTranslation();

  assert.deepEqual(await events.loadEventStoryTranslation(8, "en-US"), baseline.eventStory);
  assert.equal(requests[0], "https://translation.exmeaning.com/files/v2/en-US/translation/eventStory/event_8.json");
  for (const locale of ["ja-JP", "zh-TW", "ko-KR"]) {
    assert.equal(await events.loadEventStoryTranslation(8, locale), null);
  }
  assert.equal(requests.length, 1);
});

test("event story group text never selects CN mirror fields outside zh-CN", async () => {
  const events = await importEventStoryTranslation();
  const source = "Japanese source";
  const chinese = "Chinese mirror";
  const english = "English artifact";

  assert.equal(events.selectEventStoryLocalizedText("zh-CN", source, chinese, english), chinese);
  assert.equal(events.selectEventStoryLocalizedText("en-US", source, chinese, english), english);
  assert.equal(events.selectEventStoryLocalizedText("en-US", source, chinese), source);
  for (const locale of ["ja-JP", "zh-TW", "ko-KR"]) {
    assert.equal(events.selectEventStoryLocalizedText(locale, source, chinese, english), source);
    assert.equal(events.selectEventStoryLocalizedText(locale, undefined, chinese, english), "");
  }

  const group = readWeb("src/app/story/event/[eventId]/client.tsx");
  assert.match(group, /loadEventStoryTranslation\(eventId, locale\)/);
  assert.match(group, /selectEventStoryLocalizedText\(/);
  assert.match(group, /adminData\?\.outline_jp \|\| eventStory\?\.outline/);
});

test("event story cache evicts the least recently used entry at its fixed bound", async () => {
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return { ok: true, json: async () => structuredClone(baseline.eventStory) };
  };
  const events = await importEventStoryTranslation();

  for (let eventId = 1; eventId <= 65; eventId += 1) {
    await events.loadEventStoryTranslation(eventId, "zh-CN");
  }
  assert.equal(fetchCount, 65);
  await events.loadEventStoryTranslation(65, "zh-CN");
  assert.equal(fetchCount, 65, "the newest event remains cached");
  await events.loadEventStoryTranslation(1, "zh-CN");
  assert.equal(fetchCount, 66, "the oldest event is fetched again after eviction");
});

test("event story cache revalidates on a bounded TTL and replaces changed revisions", async () => {
  const originalNow = Date.now;
  let now = 10_000;
  let version = "1.0";
  let fetchCount = 0;
  Date.now = () => now;
  globalThis.fetch = async () => {
    fetchCount += 1;
    const data = structuredClone(baseline.eventStory);
    data.meta.version = version;
    return { ok: true, json: async () => data };
  };

  try {
    const events = await importEventStoryTranslation();
    assert.match(readWeb("src/lib/eventStoryTranslation.ts"), /const EVENT_TRANSLATION_CACHE_TTL = 60 \* 1000/);
    assert.equal((await events.loadEventStoryTranslation(9, "en-US")).meta.version, "1.0");
    now += 59_999;
    version = "2.0";
    assert.equal((await events.loadEventStoryTranslation(9, "en-US")).meta.version, "1.0");
    assert.equal(fetchCount, 1);
    now += 2;
    assert.equal((await events.loadEventStoryTranslation(9, "en-US")).meta.version, "2.0");
    assert.equal(fetchCount, 2);
  } finally {
    Date.now = originalNow;
  }
});

test("event reader keys translated state by locale and cancels obsolete locale loads", () => {
  const source = readWeb("src/app/story/event/[eventId]/[episodeNo]/client.tsx");
  assert.match(source, /translationState\.locale === locale/);
  assert.match(source, /let cancelled = false/);
  assert.match(source, /if \(cancelled\) return/);
  assert.match(source, /return \(\) => \{ cancelled = true; \}/);
});

test("story display gates both CN fields on useLLMTranslation and trimmed inequality", () => {
  const source = readWeb("src/components/story/StorySnippet.tsx");
  assert.match(source, /const showCnText = useLLMTranslation && !!cnText && cnText\.trim\(\) !== text\.trim\(\);/);
  assert.match(source, /const showCnDisplayName = useLLMTranslation && !!cnDisplayName && cnDisplayName\.trim\(\) !== characterName\.trim\(\);/);
  assert.match(source, /cnText=\{action\.cnBody\}/);
  assert.match(source, /cnDisplayName=\{action\.cnDisplayName\}/);
  assert.match(source, /translatedText=\{action\.translatedBody\}/);
  assert.match(source, /translatedDisplayName=\{action\.translatedDisplayName\}/);
  assert.match(source, /mt-2 whitespace-pre-wrap border-t border-outline-variant pt-2/);
});
