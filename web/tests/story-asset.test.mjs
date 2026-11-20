/**
 * The story readers' scenario fetch (src/lib/storyAsset.ts): each story type is read from its
 * path in the server's storage view, and a missing file is reported with that path.
 * Run with: node --test web/tests/story-asset.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { importWebTypeScript } from "./characterization/test-helpers.mjs";

// The server picked in the settings, which a source without a suffix ("main") reads.
let settingsRegion = "jp";
const SITE = "https://assets.example";
globalThis.__storyAssetRegion = (source) => source.includes("-") ? source.slice(source.indexOf("-") + 1) : settingsRegion;
const story = await importWebTypeScript("src/lib/storyAsset.ts", [
    ['import { getAssetBaseUrl, getAssetRegion } from "./assets";',
        `const getAssetRegion = (source) => globalThis.__storyAssetRegion(source);
const getAssetBaseUrl = (source) => "${SITE}/storage/" + getAssetRegion(source);`],
]);

const scenario = (body) => ({ ScenarioId: "x", TalkData: [{ Body: body, WindowDisplayName: "" }] });
const JP = scenario("——皆さん、お待たせしました！");
const EN = scenario("What a nice breeze...");

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

test("each story type is read from its path in the server's storage view", async () => {
    const cases = [
        ["unit", "main-jp", { assetbundleName: "leo_01", scenarioId: "leo_01_01" }, "jp/scenario/unitstory/leo_01/leo_01_01.json"],
        ["event", "main-jp", { assetbundleName: "event_cheerheart_2025", scenarioId: "event_168_01" }, "jp/event_story/event_cheerheart_2025/scenario/event_168_01.json"],
        ["card", "main-jp", { assetbundleName: "res012_no043", scenarioId: "012043_touya01" }, "jp/character/member/res012_no043/012043_touya01.json"],
        ["card", "backup-en", { assetbundleName: "res012_no043", scenarioId: "012043_touya01" }, "en/character/member_scenario/res012_no043/012043_touya01.json"],
        ["talk", "main-jp", { scenarioId: "areatalk_1", group: 1 }, "jp/scenario/actionset/group1/areatalk_1.json"],
        ["self", "main-jp", { scenarioId: "self_ichika" }, "jp/scenario/profile/self_ichika.json"],
        ["special", "main-jp", { assetbundleName: "sp_a", scenarioId: "sp_a_01" }, "jp/scenario/special/sp_a/sp_a_01.json"],
    ];
    for (const [type, source, params, path] of cases) {
        const url = `${SITE}/storage/${path}`;
        const requested = serve({ [url]: JP });
        assert.deepEqual(await story.fetchStoryAssetFromMirror(type, source, params), JP);
        assert.deepEqual(requested, [url]);
    }
});

test("a source without a server suffix reads the server picked in the settings", async () => {
    settingsRegion = "en";
    const url = `${SITE}/storage/en/event_story/event_cheerheart_2025/scenario/event_168_01.json`;
    const requested = serve({ [url]: EN });
    assert.deepEqual(await story.fetchStoryAssetFromMirror("event", "main", { assetbundleName: "event_cheerheart_2025", scenarioId: "event_168_01" }), EN);
    assert.deepEqual(requested, [url]);
    settingsRegion = "jp";
});

test("a missing or unreadable file is reported missing with its path", async () => {
    const EVENT = { assetbundleName: "event_cheerheart_2025", scenarioId: "event_168_01" };
    const path = "event_story/event_cheerheart_2025/scenario/event_168_01.json";
    for (const routes of [{}, { [`${SITE}/storage/jp/${path}`]: new Error("network") }]) {
        serve(routes);
        await assert.rejects(story.fetchStoryAssetFromMirror("event", "main-jp", EVENT), (error) => {
            assert.equal(error.name, "StoryAssetMissingError");
            assert.deepEqual(error.missingPaths, [path]);
            return true;
        });
    }
});
