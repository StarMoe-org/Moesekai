import assert from "node:assert/strict";
import test from "node:test";

import { loadAllMessages } from "../../scripts/i18n-utils.mjs";
import {
  importTypeScriptSource,
  importWebTypeScript,
  readWeb,
} from "./test-helpers.mjs";

const TRANSLATION_ROOT_URL = "https://translation.exmeaning.com/files/translation";
const EN_TRANSLATION_ROOT_URL = "https://translation.exmeaning.com/files/v2/en-US/translation";

// Synthetic test data; none of these strings are game text.
const CARD_FILE = {
  meta: { source: "human", version: "1", last_updated: 1790000000 },
  episodes: {
    "1": {
      scenarioId: "test_card_01",
      title: "测试标题一",
      source: "official_cn",
      talkData: { "テスト台詞一": "测试台词一", "テスト話者": "测试角色" },
    },
    "2": { scenarioId: "test_card_02", title: "", talkData: { "テスト台詞二": "测试台词二" } },
  },
};
const AREA_FILE = {
  meta: { source: "llm", version: "1", last_updated: 1790000001 },
  episodes: {
    test_area_talk_01: {
      scenarioId: "test_area_talk_01",
      title: "",
      source: "official_en",
      talkData: { "テスト台詞三": "Test line three" },
    },
  },
};
const EVENT_FILE = {
  meta: { source: "official_cn", version: "1", last_updated: 1790000002 },
  episodes: { "1": { scenarioId: "test_event_01", title: "测试活动标题", talkData: { "テスト台詞四": "测试台词四" } } },
};
const FILES_BY_DIRECTORY = { eventStory: EVENT_FILE, cardStory: CARD_FILE, areaTalk: AREA_FILE };

async function importStoryTranslation() {
  return importWebTypeScript("src/lib/eventStoryTranslation.ts", [[
    'import { getTranslationAssetBaseUrl } from "./translations";',
    `const getTranslationAssetBaseUrl = (locale) => locale === "zh-CN"
      ? "${TRANSLATION_ROOT_URL}"
      : \`https://translation.exmeaning.com/files/v2/\${locale}/translation\`;`,
  ]]);
}

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => structuredClone(body) };
}

function notFound() {
  return { ok: false, status: 404, json: async () => ({}) };
}

function serveByDirectory(requests) {
  return async (url, options) => {
    requests.push({ url: String(url), options });
    const directory = String(url).split("/translation/")[1].split("/")[0];
    return jsonResponse(FILES_BY_DIRECTORY[directory]);
  };
}

let mergeSequence = 0;

async function importStoryMergeFunctions(getStoryTranslation) {
  const source = readWeb("src/lib/storyLoader.ts");
  const start = source.indexOf("export function mergeTranslations(");
  assert.notEqual(start, -1);
  mergeSequence += 1;
  const dependencyKey = `__moesekaiSideStoryMergeDependencies${mergeSequence}`;
  globalThis[dependencyKey] = { SnippetAction: { Talk: 1 }, getStoryTranslation };
  return importTypeScriptSource(
    `const { SnippetAction, getStoryTranslation } = globalThis.${dependencyKey};\n${source.slice(start)}`,
    "side-story-merge-characterization",
  );
}

test("story translation files resolve per kind under the zh-CN root and the en-US v2 root", async () => {
  const requests = [];
  globalThis.fetch = serveByDirectory(requests);
  const stories = await importStoryTranslation();

  for (const locale of ["zh-CN", "en-US"]) {
    assert.deepEqual(await stories.loadStoryTranslation("event", 7, locale), EVENT_FILE);
    assert.deepEqual(await stories.loadStoryTranslation("card", 7, locale), CARD_FILE);
    assert.deepEqual(await stories.loadStoryTranslation("area", 7, locale), AREA_FILE);
  }
  assert.deepEqual(requests.map((request) => request.url), [
    `${TRANSLATION_ROOT_URL}/eventStory/event_7.json`,
    `${TRANSLATION_ROOT_URL}/cardStory/card_7.json`,
    `${TRANSLATION_ROOT_URL}/areaTalk/group_7.json`,
    `${EN_TRANSLATION_ROOT_URL}/eventStory/event_7.json`,
    `${EN_TRANSLATION_ROOT_URL}/cardStory/card_7.json`,
    `${EN_TRANSLATION_ROOT_URL}/areaTalk/group_7.json`,
  ]);
  assert.ok(requests.every((request) => request.options.cache === "no-store"));

  assert.deepEqual(await stories.loadEventStoryTranslation(7, "zh-CN"), EVENT_FILE);
  assert.equal(requests.length, 6, "loadEventStoryTranslation shares the event entry of the generic loader");
});

test("the cache key includes the kind, so one id is fetched once per kind and locale", async () => {
  const requests = [];
  globalThis.fetch = serveByDirectory(requests);
  const stories = await importStoryTranslation();

  for (let round = 0; round < 2; round += 1) {
    assert.deepEqual(await stories.loadStoryTranslation("card", 5, "zh-CN"), CARD_FILE);
    assert.deepEqual(await stories.loadStoryTranslation("area", 5, "zh-CN"), AREA_FILE);
    assert.deepEqual(await stories.loadEventStoryTranslation(5, "zh-CN"), EVENT_FILE);
  }
  assert.equal(requests.length, 3);

  await stories.loadStoryTranslation("card", 5, "en-US");
  assert.equal(requests.length, 4, "en-US keeps its own entry");

  stories.clearEventStoryTranslationCache("zh-CN");
  await stories.loadStoryTranslation("card", 5, "zh-CN");
  await stories.loadStoryTranslation("card", 5, "en-US");
  assert.equal(requests.length, 5, "clearing a locale drops its card entries and keeps the other locale");
});

test("card and area translations are never requested for ja-JP, zh-TW or ko-KR", async () => {
  globalThis.fetch = async () => assert.fail("a locale without a translation target must not fetch");
  const stories = await importStoryTranslation();
  for (const locale of ["ja-JP", "zh-TW", "ko-KR"]) {
    assert.equal(await stories.loadStoryTranslation("card", 1, locale), null);
    assert.equal(await stories.loadStoryTranslation("area", 1, locale), null);
  }
});

test("side-story translation is enabled only for the JP server, a translation locale and the LLM toggle", async () => {
  const stories = await importStoryTranslation();
  for (const serverSource of ["cn", "en", "tw", "kr"]) {
    for (const locale of ["zh-CN", "en-US"]) {
      assert.equal(stories.sideStoryTranslationEnabled(serverSource, locale, true), false, `${serverSource} ${locale}`);
    }
  }
  assert.equal(stories.sideStoryTranslationEnabled("jp", "zh-CN", true), true);
  assert.equal(stories.sideStoryTranslationEnabled("jp", "en-US", true), true);
  assert.equal(stories.sideStoryTranslationEnabled("jp", "zh-CN", false), false);
  for (const locale of ["ja-JP", "zh-TW", "ko-KR"]) {
    assert.equal(stories.sideStoryTranslationEnabled("jp", locale, true), false, locale);
  }

  const card = readWeb("src/app/story/card/[cardId]/client.tsx");
  assert.match(card, /const translationEnabled = sideStoryTranslationEnabled\(serverSource, locale, useLLMTranslation\);/);
  assert.match(card, /if \(!cardId \|\| !translationEnabled\) return;\n\s*let cancelled = false;\n\s*loadStoryTranslation\("card", cardId, locale\)/);
  const area = readWeb("src/app/story/area/[category]/[scenarioId]/client.tsx");
  assert.match(area, /const translationGroup = actionSet\?\.serverSource === "jp" \? areaTalkTranslationGroup\(actionSet\.id\) : null;/);
  assert.match(area, /translationGroup !== null && sideStoryTranslationEnabled\(serverSource, locale, useLLMTranslation\)/);
  assert.match(area, /if \(translationGroup === null \|\| !translationEnabled\) return;\n\s*let cancelled = false;\n\s*loadStoryTranslation\("area", translationGroup, locale\)/);
});

test("area talk files are numbered by floor(JP actionSet id / 100)", async () => {
  const stories = await importStoryTranslation();
  assert.equal(stories.areaTalkTranslationGroup(7), 0);
  assert.equal(stories.areaTalkTranslationGroup(199), 1);
  assert.equal(stories.areaTalkTranslationGroup(200), 2);
  assert.equal(stories.areaTalkTranslationGroup(2373), 23);
});

test("a missing or unreachable side-story file returns null, is retried, and leaves the story untouched", async () => {
  const requests = [];
  let mode = "404";
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (mode === "network") throw new TypeError("Failed to fetch");
    return notFound();
  };
  const stories = await importStoryTranslation();

  assert.equal(await stories.loadStoryTranslation("card", 9, "zh-CN"), null);
  assert.equal(await stories.loadStoryTranslation("card", 9, "zh-CN"), null);
  mode = "network";
  const originalDebug = console.debug;
  console.debug = () => {};
  try {
    assert.equal(await stories.loadStoryTranslation("area", 9, "en-US"), null);
  } finally {
    console.debug = originalDebug;
  }
  assert.deepEqual(requests, [
    `${TRANSLATION_ROOT_URL}/cardStory/card_9.json`,
    `${TRANSLATION_ROOT_URL}/cardStory/card_9.json`,
    `${EN_TRANSLATION_ROOT_URL}/areaTalk/group_9.json`,
  ]);

  const story = await importStoryMergeFunctions(stories.getStoryTranslation);
  const actions = [{ type: 1, body: "テスト台詞一", chara: { id: 1, name: "テスト話者" } }];
  assert.strictEqual(story.mergeTranslations(actions, null, "1", "zh-CN"), actions);
  assert.equal(story.mergeStoryTitle("テスト原題", null, "1"), "テスト原題");
  assert.equal(stories.storyEpisodeTranslationSource(null, "1"), undefined);
});

test("a script line with trailing whitespace finds the backend's trimmed key", async () => {
  const stories = await importStoryTranslation();
  const story = await importStoryMergeFunctions(stories.getStoryTranslation);
  const file = { episodes: { "1": { scenarioId: "test_01", talkData: { "テスト台詞末尾": "测试台词末尾", "テスト話者": "测试说话人" } } } };
  const [merged] = story.mergeTranslations([{ type: 1, body: "テスト台詞末尾\u3000", chara: { id: 1, name: "テスト話者 " } }], file, "1", "zh-CN");
  assert.equal(merged.translatedBody, "测试台词末尾");
  assert.equal(merged.translatedDisplayName, "测试说话人");
});

test("string episode keys select card parts and area scenarioIds; the episode source wins over meta", async () => {
  const stories = await importStoryTranslation();
  assert.deepEqual(stories.getStoryTranslation(CARD_FILE, "1"), CARD_FILE.episodes["1"]);
  assert.deepEqual(stories.getStoryTranslation(CARD_FILE, 2), CARD_FILE.episodes["2"]);
  assert.deepEqual(stories.getStoryTranslation(AREA_FILE, "test_area_talk_01"), AREA_FILE.episodes.test_area_talk_01);
  assert.equal(stories.getStoryTranslation(AREA_FILE, "test_area_talk_02"), null);

  assert.equal(stories.storyEpisodeTranslationSource(CARD_FILE, "1"), "official_cn");
  assert.equal(stories.storyEpisodeTranslationSource(CARD_FILE, "2"), "human", "an episode without source uses meta.source");
  assert.equal(stories.storyEpisodeTranslationSource(CARD_FILE, "3"), undefined);
  assert.equal(stories.storyEpisodeTranslationSource(AREA_FILE, "test_area_talk_01"), "official_en");

  const story = await importStoryMergeFunctions(stories.getStoryTranslation);
  const actions = [
    { type: 1, body: "テスト台詞一", chara: { id: 1, name: "テスト話者" } },
    { type: 1, body: "テスト未訳", chara: { id: 2, name: "テスト未訳者" } },
  ];
  assert.deepEqual(story.mergeTranslations(actions, CARD_FILE, "1", "zh-CN")[0], {
    ...actions[0],
    translatedBody: "测试台词一",
    translatedDisplayName: "测试角色",
    cnBody: "测试台词一",
    cnDisplayName: "测试角色",
    translationSource: "official_cn",
  });
  assert.strictEqual(story.mergeTranslations(actions, CARD_FILE, "1", "zh-CN")[1], actions[1]);

  const areaActions = [{ type: 1, body: "テスト台詞三", chara: { id: 3, name: "テスト話者" } }];
  assert.deepEqual(story.mergeTranslations(areaActions, AREA_FILE, "test_area_talk_01", "en-US")[0], {
    ...areaActions[0],
    translatedBody: "Test line three",
    translatedDisplayName: "テスト話者",
    translationSource: "official_en",
  });

  assert.equal(story.mergeStoryTitle("テスト原題", CARD_FILE, "1"), "测试标题一");
  assert.equal(story.mergeStoryTitle("テスト原題", CARD_FILE, "2"), "テスト原題", "an empty translated title keeps the original");
});

test("card parts are chosen by seq, not by masterdata array order", async () => {
  const parts = await importWebTypeScript("src/app/story/card/cardStoryParts.ts");
  const first = { id: 11, cardId: 1, seq: 1, title: "テスト前編", scenarioId: "test_card_01" };
  const second = { id: 12, cardId: 1, seq: 2, title: "テスト後編", scenarioId: "test_card_02" };

  assert.deepEqual(parts.selectCardStoryParts([first, second]), [first, second]);
  assert.deepEqual(parts.selectCardStoryParts([second, first]), [first, second], "reversed rows still map seq 1 to part 1");
  const withoutSeq = [{ ...second, seq: undefined }, { ...first, seq: undefined }];
  assert.deepEqual(parts.selectCardStoryParts(withoutSeq), withoutSeq, "array order only when seq is missing");
  assert.equal(parts.selectCardStoryParts([second]), null);
  assert.equal(parts.selectCardStoryParts([second, { ...second, id: 13, seq: 3 }]), null, "no seq 1 means no first part");

  const card = readWeb("src/app/story/card/[cardId]/client.tsx");
  assert.match(card, /selectCardStoryParts\(episodesData\.filter\(e => e\.cardId === cardId\)\)/);
  assert.doesNotMatch(card, /episode_1|episode_2/);
});

test("the source badge maps official_cn, official_en, human and llm to labels present in every locale", async () => {
  const stories = await importStoryTranslation();
  const expected = {
    official_cn: "page.story.reader.translationSources.officialCn",
    official_en: "page.story.reader.translationSources.officialEn",
    human: "page.story.reader.translationSources.human",
    llm: "page.story.reader.translationSources.ai",
  };
  for (const [source, key] of Object.entries(expected)) {
    assert.equal(stories.storyTranslationSourceLabelKey(source), key);
  }

  for (const [locale, messages] of Object.entries(loadAllMessages())) {
    const labels = messages.page.story.reader.translationSources;
    for (const key of Object.values(expected)) {
      const label = labels[key.split(".").at(-1)];
      assert.equal(typeof label, "string", `${locale} ${key}`);
      assert.notEqual(label.trim(), "", `${locale} ${key}`);
    }
    assert.notEqual(labels.officialEn, labels.officialCn, `${locale} distinguishes the two official sources`);
  }

  const badge = readWeb("src/components/story/StoryTranslationSourceBadge.tsx");
  assert.match(badge, /t\(storyTranslationSourceLabelKey\(source\)\)/);
  assert.doesNotMatch(badge, /198/);
  const card = readWeb("src/app/story/card/[cardId]/client.tsx");
  assert.match(card, /const source = storyEpisodeTranslationSource\(translation, key\);/);
  assert.match(card, /\{source && <StoryTranslationSourceBadge source=\{source\} \/>\}/);
  assert.match(card, /translationSource=\{source\}\n\s*storyType="card"/);
  assert.match(card, /title: episode \? mergeStoryTitle\(episode\.title, translation, key\) : undefined/);
  const area = readWeb("src/app/story/area/[category]/[scenarioId]/client.tsx");
  assert.match(area, /const translationSource = storyEpisodeTranslationSource\(translation, scenarioId\);/);
  assert.match(area, /\{translationSource && <StoryTranslationSourceBadge source=\{translationSource\} \/>\}/);
  assert.match(area, /translationSource=\{translationSource\}\n\s*storyType="area"/);
});
