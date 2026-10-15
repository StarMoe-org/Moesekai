/**
 * The story readers' scenario fetch (src/lib/storyAsset.ts): a mirror file whose text is in
 * another server's language is replaced by the story library's copy of the same path.
 * Run with: node --test web/tests/story-asset.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { importWebTypeScript } from "./characterization/test-helpers.mjs";

let assetBase = "https://storage.exmeaning.com/sekai-jp-assets";
globalThis.__storyAssetTestBase = () => assetBase;
const story = await importWebTypeScript("src/lib/storyAsset.ts", [
    ['import { getAssetBaseUrl } from "./assets";', "const getAssetBaseUrl = () => globalThis.__storyAssetTestBase();"],
]);

const scenario = (...bodies) => ({ ScenarioId: "x", TalkData: bodies.map(Body => ({ Body, WindowDisplayName: "" })) });

// Bodies taken from the mirror's files (event 168/1 JP and TW, card 1116 KR) and their peers.
const JP = scenario("——皆さん、お待たせしました！\n受付が終わったので、中に入りましょう");
const TW = scenario("──讓大家久等了！報到手續完成了，我們進去吧。");
const CN = scenario("——大家久等了！\n手续已经办完了，我们进去吧。");
const KR = scenario("……그럼 컬래버레이션 스테이지에서 할 쇼 대본도\n완성됐으니, 당장 연습을 시작해 볼까? 아오야기 군.");
const EN = scenario("What a nice breeze...");
const SYMBOLS = scenario("……！", "♪——————", "");

test("each server's own text passes and the others' do not", () => {
    const cases = [
        ["jp", JP, true], ["jp", TW, false], ["jp", CN, false], ["jp", KR, false], ["jp", EN, false],
        ["kr", KR, true], ["kr", JP, false], ["kr", TW, false],
        ["en", EN, true], ["en", TW, false], ["en", JP, false], ["en", KR, false],
        ["cn", CN, true], ["cn", TW, true], ["cn", JP, false], ["cn", KR, false], ["cn", EN, false],
        ["tw", TW, true], ["tw", JP, false], ["tw", KR, false],
    ];
    for (const [region, data, expected] of cases) {
        assert.equal(story.scenarioTextMatchesRegion(region, data), expected, `${region}: ${data.TalkData[0].Body}`);
    }
});

test("symbols-only text, missing talk data and unknown servers pass", () => {
    for (const region of ["jp", "kr", "en", "cn", "tw"]) {
        assert.equal(story.scenarioTextMatchesRegion(region, SYMBOLS), true);
        assert.equal(story.scenarioTextMatchesRegion(region, {}), true);
        assert.equal(story.scenarioTextMatchesRegion(region, null), true);
    }
    assert.equal(story.scenarioTextMatchesRegion("xx", TW), true);
});

test("the ratio rules use the stated thresholds", () => {
    // JP: kana × 4 > kanji
    assert.equal(story.scenarioTextMatchesRegion("jp", scenario("あ漢字字字")), false);
    assert.equal(story.scenarioTextMatchesRegion("jp", scenario("あ漢字字")), true);
    // CN/TW: kanji must exceed ten times the kana and the Latin letters
    assert.equal(story.scenarioTextMatchesRegion("cn", scenario("あ一二三四五六七八九十")), false);
    assert.equal(story.scenarioTextMatchesRegion("cn", scenario("あ一二三四五六七八九十十")), true);
    assert.equal(story.scenarioTextMatchesRegion("cn", scenario("Leo/need一二三")), false);
    assert.deepEqual(story.countScenarioScripts(scenario("あア가ㄱ漢㐀Ab1！")), { kana: 2, hangul: 2, han: 2, latin: 2 });
});

test("the library path keeps the mirror path under the same server", () => {
    assert.deepEqual(
        story.storyLibraryUrlFor("https://storage.exmeaning.com/sekai-jp-assets/event_story/event_higher_2025/scenario/event_169_07.json"),
        { region: "jp", url: "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/library/event_story/event_higher_2025/scenario/event_169_07.json" },
    );
    assert.deepEqual(
        story.storyLibraryUrlFor("https://storage.pjsk.moe/sekai-en-assets/character/member_scenario/res001_no001/001001_ichika01.json"),
        { region: "en", url: "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/en/library/character/member_scenario/res001_no001/001001_ichika01.json" },
    );
    assert.equal(story.storyLibraryUrlFor("https://example.com/other.json"), null);
});

function serve(routes) {
    const requested = [];
    globalThis.fetch = async (url) => {
        requested.push(url);
        const body = routes[url];
        if (body === undefined) return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
        if (body instanceof Error) throw body;
        return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
    };
    return requested;
}

const silenceWarnings = (t) => t.mock.method(console, "warn", () => {});
const EVENT = { assetbundleName: "event_cheerheart_2025", scenarioId: "event_168_01" };
const MIRROR = "https://storage.exmeaning.com/sekai-jp-assets/event_story/event_cheerheart_2025/scenario/event_168_01.json";
const LIBRARY = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/library/event_story/event_cheerheart_2025/scenario/event_168_01.json";

test("a JP mirror file in Traditional Chinese is replaced by the library's Japanese", async () => {
    assetBase = "https://storage.exmeaning.com/sekai-jp-assets";
    const requested = serve({ [MIRROR]: TW, [LIBRARY]: JP });
    assert.deepEqual(await story.fetchStoryAssetFromMirror("event", "main", EVENT), JP);
    assert.deepEqual(requested, [MIRROR, LIBRARY]);
});

test("a file in the server's language never reads the library", async () => {
    assetBase = "https://storage.exmeaning.com/sekai-jp-assets";
    const requested = serve({ [MIRROR]: JP });
    assert.deepEqual(await story.fetchStoryAssetFromMirror("event", "main-jp", EVENT), JP);
    assert.deepEqual(requested, [MIRROR]);
});

test("without a library copy the mirror's file is shown", async (t) => {
    silenceWarnings(t);
    assetBase = "https://storage.exmeaning.com/sekai-jp-assets";
    serve({ [MIRROR]: TW });
    assert.deepEqual(await story.fetchStoryAssetFromMirror("event", "main", EVENT), TW);
    serve({ [MIRROR]: TW, [LIBRARY]: new Error("network") });
    assert.deepEqual(await story.fetchStoryAssetFromMirror("event", "main", EVENT), TW);
});

test("every story type falls back, judged by the server of the mirror it read", async () => {
    assetBase = "https://storage.exmeaning.com/sekai-jp-assets";
    const card = "https://storage.exmeaning.com/sekai-jp-assets/character/member/res012_no043/012043_touya01.json";
    const cardLibrary = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/library/character/member/res012_no043/012043_touya01.json";
    let requested = serve({ [card]: KR, [cardLibrary]: JP });
    assert.deepEqual(await story.fetchStoryAssetFromMirror("card", "main-jp", { assetbundleName: "res012_no043", scenarioId: "012043_touya01" }), JP);
    assert.deepEqual(requested, [card, cardLibrary]);

    const special = "https://storage.exmeaning.com/sekai-jp-assets/scenario/special/sp_a/sp_a_01.json";
    requested = serve({ [special]: KR, ["https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/library/scenario/special/sp_a/sp_a_01.json"]: JP });
    assert.deepEqual(await story.fetchStoryAssetFromMirror("special", "main-jp", { assetbundleName: "sp_a", scenarioId: "sp_a_01" }), JP);
    assert.equal(requested.length, 2);

    // A CN reader is judged as CN: Traditional Chinese passes, nothing else is read.
    assetBase = "https://storage.exmeaning.com/sekai-cn-assets";
    requested = serve({ "https://storage.exmeaning.com/sekai-cn-assets/scenario/actionset/group1/areatalk_1.json": TW });
    assert.deepEqual(await story.fetchStoryAssetFromMirror("talk", "main", { scenarioId: "areatalk_1", group: 1 }), TW);
    assert.equal(requested.length, 1);

    // An EN reader of the TW file goes to the EN library.
    assetBase = "https://storage.pjsk.moe/sekai-en-assets";
    const enMirror = "https://storage.pjsk.moe/sekai-en-assets/event_story/event_cheerheart_2025/scenario/event_168_01.json";
    const enLibrary = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/en/library/event_story/event_cheerheart_2025/scenario/event_168_01.json";
    requested = serve({ [enMirror]: TW, [enLibrary]: EN });
    assert.deepEqual(await story.fetchStoryAssetFromMirror("event", "overseas-en", EVENT), EN);
    assert.deepEqual(requested, [enMirror, enLibrary]);
});

test("a missing mirror file is still reported missing", async () => {
    assetBase = "https://storage.exmeaning.com/sekai-jp-assets";
    const requested = serve({ [LIBRARY]: JP });
    await assert.rejects(story.fetchStoryAssetFromMirror("event", "main", EVENT), (error) => {
        assert.equal(error.name, "StoryAssetMissingError");
        assert.deepEqual(error.missingPaths, ["event_story/event_cheerheart_2025/scenario/event_168_01.json"]);
        return true;
    });
    assert.deepEqual(requested, [MIRROR]);
});
