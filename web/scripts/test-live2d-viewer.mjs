import assert from "node:assert/strict";

const { live2dCoreUrl, live2dFetchUrl, live2dSources, live2dCheckConfig, isLive2DRegion, LIVE2D_REGIONS } = await import("../src/lib/live2dViewer/config.ts");
const { parseLive2DModelId, parseLive2DModelIndex, parseLive2DModelParam, live2dViewerHref } = await import("../src/lib/live2dViewer/models.ts");

const NAMES = [
    "NEXT_PUBLIC_LIVE2D_CORE_URL", "NEXT_PUBLIC_SSE_WEB_CORE_URL", "NEXT_PUBLIC_LIVE2D_LIBRARY_BASE", "NEXT_PUBLIC_LIVE2D_INDEX_BASE",
    "NEXT_PUBLIC_LIVE2D_ASSET_PROXY", "NEXT_PUBLIC_SSE_WEB_ASSET_PROXY",
];
const set = (values) => {
    for (const name of NAMES) delete process.env[name];
    Object.assign(process.env, values);
};

// --- configuration ---

// With nothing set (Docker passes empty strings) the viewer reads the published libraries and
// indexes, and Live2D's own Cubism Core.
for (const empty of [{}, { NEXT_PUBLIC_LIVE2D_CORE_URL: " ", NEXT_PUBLIC_LIVE2D_INDEX_BASE: "" }]) {
    set(empty);
    assert.equal(live2dCoreUrl(), null);
    assert.deepEqual(live2dSources("jp"), {
        library: "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/",
        index: "https://assets.pjsk.moe/sekai-extra-assets/sekai-live2d/jp/models.json",
    });
    live2dCheckConfig();
}
assert.deepEqual([...LIVE2D_REGIONS], ["jp", "cn", "tw", "kr", "en"]);
assert.ok(isLive2DRegion("tw") && !isLive2DRegion("JP") && !isLive2DRegion(null));

// The story player's copy of Cubism Core serves the viewer too, unless the viewer names its own.
set({ NEXT_PUBLIC_SSE_WEB_CORE_URL: "https://cdn.example.com/core/live2dcubismcore.min.js" });
assert.equal(live2dCoreUrl(), "https://cdn.example.com/core/live2dcubismcore.min.js");
set({ NEXT_PUBLIC_SSE_WEB_CORE_URL: "https://cdn.example.com/a.js", NEXT_PUBLIC_LIVE2D_CORE_URL: "https://cdn.example.com/b.js" });
assert.equal(live2dCoreUrl(), "https://cdn.example.com/b.js");

// Moved bases, and the development relay (the viewer's own, else the story player's).
set({ NEXT_PUBLIC_LIVE2D_LIBRARY_BASE: "https://lib.example.com/x/", NEXT_PUBLIC_LIVE2D_INDEX_BASE: "https://idx.example.com/y/" });
assert.deepEqual(live2dSources("cn"), { library: "https://lib.example.com/x/cn/", index: "https://idx.example.com/y/cn/models.json" });
set({ NEXT_PUBLIC_SSE_WEB_ASSET_PROXY: "http://127.0.0.1:8787/remote/" });
assert.equal(live2dSources("jp").library, "http://127.0.0.1:8787/remote/assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/");
assert.equal(live2dFetchUrl("https://storage.exmeaning.com/a.webp"), "http://127.0.0.1:8787/remote/storage.exmeaning.com/a.webp");
set({ NEXT_PUBLIC_SSE_WEB_ASSET_PROXY: "http://127.0.0.1:1/a/", NEXT_PUBLIC_LIVE2D_ASSET_PROXY: "http://localhost:2/b/" });
assert.equal(live2dFetchUrl("https://h/p"), "http://localhost:2/b/h/p");

// Malformed values fail (the build reads every setting once).
for (const [name, value] of [
    ["NEXT_PUBLIC_LIVE2D_LIBRARY_BASE", "https://lib.example.com/x"],
    ["NEXT_PUBLIC_LIVE2D_INDEX_BASE", "http://idx.example.com/y/"],
    ["NEXT_PUBLIC_LIVE2D_INDEX_BASE", "https://idx.example.com/y/?q=1"],
    ["NEXT_PUBLIC_LIVE2D_LIBRARY_BASE", "https://lib.example.com/a/../b/"],
    ["NEXT_PUBLIC_LIVE2D_CORE_URL", "https://cdn.example.com/core/"],
    ["NEXT_PUBLIC_LIVE2D_ASSET_PROXY", "https://user:pw@relay.example.com/"],
]) {
    set({ [name]: value });
    assert.throws(() => live2dCheckConfig(), new RegExp(`live2d_viewer_config_invalid:${name}`), `${name}=${value}`);
}
set({});

// --- model ids ---

assert.deepEqual(parseLive2DModelId("v2_01ichika_casual"), {
    generation: 2, collab: false, characterId: 1, subName: null, costume: [{ token: "casual" }],
});
assert.deepEqual(parseLive2DModelId("01ichika_normal").costume, [{ token: "normal" }]);
assert.deepEqual(parseLive2DModelId("v2_05minori_school01").costume, [{ token: "school" }]);
assert.deepEqual(parseLive2DModelId("02saki_sports02").costume, [{ token: "sports", variant: 2 }]);
assert.deepEqual(parseLive2DModelId("06haruka_cloth002").costume, [{ cloth: 2 }]);
assert.deepEqual(parseLive2DModelId("v2_21miku_band").costume, [{ unit: "ln" }]);
assert.deepEqual(parseLive2DModelId("25meiko_night").costume, [{ unit: "25ji" }]);
// a word the message packs do not name is shown as the id spells it
assert.deepEqual(parseLive2DModelId("13tsukasa_liondance").costume, [{ text: "liondance" }]);
assert.deepEqual(parseLive2DModelId("18mafuyu_darkcloth001").costume, [{ text: "darkcloth001" }]);
assert.deepEqual(parseLive2DModelId("clb01_24luka01"), { generation: 1, collab: true, characterId: 24, subName: null, costume: [] });
assert.deepEqual(parseLive2DModelId("v2_clb01_21miku"), { generation: 2, collab: true, characterId: 21, subName: null, costume: [] });
assert.deepEqual(parseLive2DModelId("sub_arisa02_lesson"), { generation: 1, collab: false, characterId: null, subName: "arisa02_lesson", costume: [] });
assert.deepEqual(parseLive2DModelId("v2_sub_sanrio_kitty"), { generation: 2, collab: false, characterId: null, subName: "sanrio_kitty", costume: [] });

// --- the index ---

const index = {
    format: 1,
    region: "jp",
    models: [
        { id: "sub_airichild", bundle: "live2d/model/sub_airichild", motion: "live2d/motion/sub_airichild_motion_base", kind: "sub" },
        { id: "01ichika_normal", bundle: "live2d/model/01ichika_normal", motion: "live2d/motion/01ichika_motion_base", bytes: 10 },
        { id: "v2_01ichika_school01", bundle: "live2d/model/v2_01ichika_school01", motion: "live2d/motion/v2_01ichika_motion_base", motions: ["live2d/motion/x", "live2d/motion/v2_01ichika_motion_base"], characterId: 1 },
        // a model without a motion bundle is listed (it shows breath and physics alone)
        { id: "sub_still", bundle: "live2d/model/sub_still", motion: null, motions: [], kind: "sub" },
        { id: "v2_01ichika_casual", bundle: "live2d/model/v2_01ichika_casual", motion: "live2d/motion/v2_01ichika_motion_base" },
        { id: "mob_x", bundle: "live2d/model/mob_x", motion: "live2d/motion/mob_motion_base", kind: "mob" },
        { id: "01ichika_normal", bundle: "dup", motion: "dup" },
        { id: "Bad Id", bundle: "b", motion: "m" },
        { id: "no_motion", bundle: "b" },
        { id: "list_motion", bundle: "b", motion: ["m"] },
    ],
};
const models = parseLive2DModelIndex(index);
assert.deepEqual(models.map(model => model.id), ["v2_01ichika_casual", "v2_01ichika_school01", "01ichika_normal", "sub_airichild", "sub_still", "mob_x"]);
// the default motion bundle first, then the others the stories used
assert.deepEqual(models[1].motions, ["live2d/motion/v2_01ichika_motion_base", "live2d/motion/x"]);
assert.deepEqual(models[4].motions, []);
assert.equal(models[2].bytes, 10);
assert.equal(models[2].bundle, "live2d/model/01ichika_normal");
assert.equal(models[3].kind, "sub");
assert.equal(models[3].subName, "airichild");
assert.equal(models[5].characterId, null);
assert.throws(() => parseLive2DModelIndex({ format: 2, models: [] }), /live2d_index_invalid/);
assert.throws(() => parseLive2DModelIndex(null), /live2d_index_invalid/);

// --- the address ---

assert.equal(parseLive2DModelParam(" v2_01ichika_casual "), "v2_01ichika_casual");
assert.equal(parseLive2DModelParam("../x"), null);
assert.equal(parseLive2DModelParam(null), null);
assert.equal(live2dViewerHref("jp"), "/live2d?server=jp");
assert.equal(live2dViewerHref("cn", "v2_01ichika_casual"), "/live2d?server=cn&model=v2_01ichika_casual");
assert.equal(live2dViewerHref("cn", "v2_01ichika_casual", 1), "/live2d?server=cn&model=v2_01ichika_casual");
assert.equal(live2dViewerHref("jp", null, 14), "/live2d?server=jp&character=14");
const { live2dCharacterHref, parseLive2DCharacterParam } = await import("../src/lib/live2dViewer/models.ts");
assert.equal(live2dCharacterHref(14), "/live2d?character=14");
assert.equal(parseLive2DCharacterParam("14"), 14);
assert.equal(parseLive2DCharacterParam("27"), null);
assert.equal(parseLive2DCharacterParam("1.5"), null);
assert.equal(parseLive2DCharacterParam(null), null);

// --- zoom and pan ---

const { IDENTITY_VIEW, MAX_ZOOM, clampView, zoomAbout, panBy, toNdc, isIdentityView } = await import("../src/lib/live2dViewer/view.ts");
assert.deepEqual(clampView({ zoom: 0.5, x: 3, y: -3 }), IDENTITY_VIEW);
assert.ok(isIdentityView(clampView({ zoom: 1, x: -0, y: 0 })));
assert.equal(clampView({ zoom: 99, x: 0, y: 0 }).zoom, MAX_ZOOM);
// zooming about a point keeps that point where it was
const zoomed = zoomAbout(IDENTITY_VIEW, 2, 0.5, -0.25);
assert.deepEqual(zoomed, { zoom: 2, x: -0.5, y: 0.25 });
assert.ok(Math.abs((0.25 * zoomed.zoom + zoomed.x) - 0) < 1e-9);
// and zooming back out returns to the identity view
assert.deepEqual(zoomAbout(zoomed, 0.5, 0, 0), IDENTITY_VIEW);
// a drag of half the stage's width moves the view by one unit, y up
assert.deepEqual(panBy({ zoom: 2, x: 0, y: 0 }, 50, 25, 100, 100), { zoom: 2, x: 1, y: -0.5 });
assert.deepEqual(panBy(IDENTITY_VIEW, 50, 0, 100, 100), IDENTITY_VIEW);
assert.deepEqual(toNdc(150, 50, { left: 100, top: 0, width: 100, height: 100 }), [0, 0]);

console.log("live2d viewer: ok");
