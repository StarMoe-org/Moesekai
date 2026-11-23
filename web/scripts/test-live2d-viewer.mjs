import assert from "node:assert/strict";

const { live2dCoreUrl, live2dFetchUrl, live2dSources, live2dListingUrl, live2dCheckConfig, isLive2DRegion, LIVE2D_REGIONS } = await import("../src/lib/live2dViewer/config.ts");
const { parseLive2DModelId, live2dMotionSet, live2dModelsFromListings, parseLive2DModelParam, live2dViewerHref } = await import("../src/lib/live2dViewer/models.ts");
const { resetStoryCoreConfig } = await import("@moesekai/story-core");

const NAMES = [
    "NEXT_PUBLIC_LIVE2D_CORE_URL", "NEXT_PUBLIC_SSE_WEB_CORE_URL", "NEXT_PUBLIC_LIVE2D_SITE", "NEXT_PUBLIC_SSE_WEB_SITE",
    "NEXT_PUBLIC_LIVE2D_ASSET_PROXY", "NEXT_PUBLIC_SSE_WEB_ASSET_PROXY",
];
const set = (values) => {
    resetStoryCoreConfig();
    for (const name of NAMES) delete process.env[name];
    Object.assign(process.env, values);
};

// --- configuration ---

// With nothing set (Docker passes empty strings) the viewer reads the main asset site, and
// Live2D's own Cubism Core.
for (const empty of [{}, { NEXT_PUBLIC_LIVE2D_CORE_URL: " ", NEXT_PUBLIC_LIVE2D_SITE: "" }]) {
    set(empty);
    assert.equal(live2dCoreUrl(), null);
    assert.deepEqual(live2dSources("jp"), { site: "https://storage.pjsk.moe", region: "jp" });
    assert.equal(live2dListingUrl("cn", "live2d/model/"), "https://storage.pjsk.moe/cn/live2d/model/");
    live2dCheckConfig();
}
assert.deepEqual([...LIVE2D_REGIONS], ["jp", "cn", "tw", "kr", "en"]);
assert.ok(isLive2DRegion("tw") && !isLive2DRegion("JP") && !isLive2DRegion(null));

// The story player's copy of Cubism Core serves the viewer too, unless the viewer names its own.
set({ NEXT_PUBLIC_SSE_WEB_CORE_URL: "https://cdn.example.com/core/live2dcubismcore.min.js" });
assert.equal(live2dCoreUrl(), "https://cdn.example.com/core/live2dcubismcore.min.js");
set({ NEXT_PUBLIC_SSE_WEB_CORE_URL: "https://cdn.example.com/a.js", NEXT_PUBLIC_LIVE2D_CORE_URL: "https://cdn.example.com/b.js" });
assert.equal(live2dCoreUrl(), "https://cdn.example.com/b.js");

// A moved site (the viewer's own, else the story player's), and the development relay (the
// viewer's own, else the story player's), which the viewer and the listings both go through.
set({ NEXT_PUBLIC_SSE_WEB_SITE: "https://a.example.com/s/" });
assert.deepEqual(live2dSources("cn"), { site: "https://a.example.com/s", region: "cn" });
set({ NEXT_PUBLIC_SSE_WEB_SITE: "https://a.example.com/s/", NEXT_PUBLIC_LIVE2D_SITE: "https://b.example.com/" });
assert.deepEqual(live2dSources("cn"), { site: "https://b.example.com", region: "cn" });
set({ NEXT_PUBLIC_SSE_WEB_ASSET_PROXY: "http://127.0.0.1:8787/remote/" });
assert.deepEqual(live2dSources("jp"), { site: "https://storage.pjsk.moe", region: "jp", proxy: "http://127.0.0.1:8787/remote/" });
assert.equal(live2dListingUrl("jp", "live2d/motion/"), "http://127.0.0.1:8787/remote/storage.pjsk.moe/jp/live2d/motion/");
assert.equal(live2dFetchUrl("https://storage.exmeaning.com/a.webp"), "http://127.0.0.1:8787/remote/storage.exmeaning.com/a.webp");
set({ NEXT_PUBLIC_SSE_WEB_ASSET_PROXY: "http://127.0.0.1:1/a/", NEXT_PUBLIC_LIVE2D_ASSET_PROXY: "http://localhost:2/b/" });
assert.equal(live2dFetchUrl("https://h/p"), "http://localhost:2/b/h/p");

// Malformed values fail (the build reads every setting once).
for (const [name, value] of [
    ["NEXT_PUBLIC_LIVE2D_SITE", "https://site.example.com/x"],
    ["NEXT_PUBLIC_LIVE2D_SITE", "http://site.example.com/y/"],
    ["NEXT_PUBLIC_LIVE2D_SITE", "https://site.example.com/y/?q=1"],
    ["NEXT_PUBLIC_SSE_WEB_SITE", "https://site.example.com/a/../b/"],
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
// known tokens and compounds are decomposed; words the message packs do not name stay as spelled
assert.deepEqual(parseLive2DModelId("13tsukasa_liondance").costume, [{ token: "liondance" }]);
assert.deepEqual(parseLive2DModelId("18mafuyu_darkcloth001").costume, [{ token: "dark" }, { cloth: 1 }]);
assert.deepEqual(parseLive2DModelId("v2_14emu_igs_princess").costume, [{ text: "igs" }, { token: "princess" }]);
assert.deepEqual(parseLive2DModelId("clb01_24luka01"), { generation: 1, collab: true, characterId: 24, subName: null, costume: [] });
assert.deepEqual(parseLive2DModelId("v2_clb01_21miku"), { generation: 2, collab: true, characterId: 21, subName: null, costume: [] });
assert.deepEqual(parseLive2DModelId("sub_arisa02_lesson"), { generation: 1, collab: false, characterId: null, subName: "arisa02_lesson", costume: [] });
assert.deepEqual(parseLive2DModelId("v2_sub_sanrio_kitty"), { generation: 2, collab: false, characterId: null, subName: "sanrio_kitty", costume: [] });

// --- the models of a server ---

// A model plays with the motion set of the longest stem of its name that has one.
const motionSets = new Set([
    "01ichika_motion_base", "v2_01ichika_motion_base", "23len_motion_base", "sub_arisa_motion_base",
    "sub_arisa02_motion_base", "sub_airichild_motion_base", "sub_sanrio_kitty_motion_base",
]);
for (const [id, motionSet] of [
    ["01ichika_normal", "01ichika_motion_base"],
    ["v2_01ichika_casual", "v2_01ichika_motion_base"],
    ["clb01_23lenblack", "23len_motion_base"],
    ["sub_arisa02_lesson", "sub_arisa02_motion_base"],
    ["sub_arisa_live01", "sub_arisa_motion_base"],
    ["sub_airichildblack", "sub_airichild_motion_base"],
    ["v2_sub_sanrio_kitty", "sub_sanrio_kitty_motion_base"],
    ["sub_emu_princess", null],
]) {
    assert.equal(live2dMotionSet(id, motionSets), motionSet, id);
}

const models = live2dModelsFromListings(
    ["sub_airichild", "01ichika_normal", "v2_01ichika_school01", "sub_still", "v2_01ichika_casual", "mob_x", "01ichika_normal", "Bad Id"],
    [...motionSets],
);
assert.deepEqual(models.map(model => model.id), ["v2_01ichika_casual", "v2_01ichika_school01", "01ichika_normal", "sub_airichild", "sub_still", "mob_x"]);
assert.deepEqual(models[1].motions, ["live2d/motion/v2_01ichika_motion_base"]);
assert.equal(models[1].motion, "live2d/motion/v2_01ichika_motion_base");
assert.equal(models[2].asset, "live2d/model/01ichika_normal");
// a model without a motion set is listed (it shows breath and physics alone)
assert.deepEqual(models[4].motions, []);
assert.equal(models[4].motion, null);
assert.equal(models[3].kind, "sub");
assert.equal(models[3].subName, "airichild");
assert.equal(models[5].characterId, null);

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

// --- motions and facials ---

const { groupLive2DMotions, groupLive2DFacials, live2dMotionStyle } = await import("../src/lib/live2dViewer/clips.ts");
const motions = groupLive2DMotions([
    "w-cute01-tilthead", "w-cute01-tilthead02", "w-cute11-nbtilthead", "w-cute01-posenod", "w-cute02-tiltheadb",
    "w-normal16-nod", "w-noromal16-nod", "w-adult01-thumb", "w-cool01-thumb", "w-special11-wandahoi", "idle",
]);
// styles in their order, the unknown and the unparsed last
assert.deepEqual(motions.map(group => group.style), ["normal", "cute", "cool", "adult", "special", "other"]);
const cute = motions.find(group => group.style === "cute");
// a row per action: the plain head tilt (with its variants), the no-blink one, then a compound
assert.deepEqual(cute.rows.map(row => [row.words.join("+"), row.tag, row.clips.map(clip => clip.code)]), [
    ["tilthead", null, ["01", "01·02", "02·b"]],
    ["tilthead", "nb", ["11"]],
    ["pose+nod", null, ["01"]],
]);
// the game's misspelling files with the real word, and the twin is told apart
assert.deepEqual(motions[0].rows[0].clips.map(clip => [clip.name, clip.code]), [["w-normal16-nod", "16"], ["w-noromal16-nod", "16 (2)"]]);
// `thumb` is a word, not `thum` with a variant `b`
assert.deepEqual(motions.find(group => group.style === "cool").rows[0].words, ["thumb"]);
// a word without a translation is shown as spelled
assert.deepEqual(motions.find(group => group.style === "special").rows[0], { key: "wandahoi|", words: [], raw: "wandahoi", tag: null, clips: [{ name: "w-special11-wandahoi", code: "11" }] });
assert.equal(motions.at(-1).rows[0].raw, "idle");
assert.equal(live2dMotionStyle(motions, "w-cute01-posenod"), "cute");
assert.equal(live2dMotionStyle(motions, null), null);

const facials = groupLive2DFacials([
    "face_smile_02", "face_smile_01", "face_smile_10", "face_ncsmile_01", "face_night_smile_01", "face_angry_01_nokira",
    "face_closeeyes_01", "face_desperate01", "face_lookaway_01l", "face_wonder_train_01", "face_e",
]);
assert.deepEqual(facials.map(row => [row.words.join("+") || row.raw, row.tag, row.clips.map(clip => clip.code)]), [
    ["smile", null, ["01", "02", "10"]],
    ["smile", "nc", ["01"]],
    ["smile", "night", ["01"]],
    ["angry", null, ["01_nokira"]],
    ["desperate", null, ["01"]],
    ["closeeye", null, ["01"]],
    ["lookaway", null, ["01l"]],
    ["e", null, [""]],
    ["wonder_train", null, ["01"]],
]);

console.log("live2d viewer: ok");
