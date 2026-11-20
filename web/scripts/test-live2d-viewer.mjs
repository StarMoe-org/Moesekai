import assert from "node:assert/strict";

const { live2dCoreUrl, live2dFetchUrl, live2dSources, live2dCheckConfig, isLive2DRegion, LIVE2D_REGIONS } = await import("../src/lib/live2dViewer/config.ts");
const { parseLive2DModelId, parseLive2DCatalogue, live2dModelsByName, live2dMotionByName, parseLive2DModelParam, live2dViewerHref } = await import("../src/lib/live2dViewer/models.ts");

const NAMES = [
    "NEXT_PUBLIC_LIVE2D_CORE_URL", "NEXT_PUBLIC_SSE_WEB_CORE_URL", "NEXT_PUBLIC_LIVE2D_SITE", "NEXT_PUBLIC_SSE_WEB_SITE",
    "NEXT_PUBLIC_LIVE2D_ASSET_PROXY", "NEXT_PUBLIC_SSE_WEB_ASSET_PROXY",
];
const set = (values) => {
    for (const name of NAMES) delete process.env[name];
    Object.assign(process.env, values);
};

// --- configuration ---

// With nothing set (Docker passes empty strings) the viewer reads the story data site's published
// versions, lists them from this site's catalogue, and loads Live2D's own Cubism Core.
for (const empty of [{}, { NEXT_PUBLIC_LIVE2D_CORE_URL: " ", NEXT_PUBLIC_LIVE2D_SITE: "" }]) {
    set(empty);
    assert.equal(live2dCoreUrl(), null);
    assert.deepEqual(live2dSources("jp"), { site: "https://storage.pjsk.moe/", region: "jp", catalogue: "/api/live2d/jp/models" });
    live2dCheckConfig();
}
assert.deepEqual([...LIVE2D_REGIONS], ["jp", "cn", "tw", "kr", "en"]);
assert.ok(isLive2DRegion("tw") && !isLive2DRegion("JP") && !isLive2DRegion(null));

// The story player's copy of Cubism Core serves the viewer too, unless the viewer names its own.
set({ NEXT_PUBLIC_SSE_WEB_CORE_URL: "https://cdn.example.com/core/live2dcubismcore.min.js" });
assert.equal(live2dCoreUrl(), "https://cdn.example.com/core/live2dcubismcore.min.js");
set({ NEXT_PUBLIC_SSE_WEB_CORE_URL: "https://cdn.example.com/a.js", NEXT_PUBLIC_LIVE2D_CORE_URL: "https://cdn.example.com/b.js" });
assert.equal(live2dCoreUrl(), "https://cdn.example.com/b.js");

// Another site (the viewer's own, else the story player's), and the development relay (likewise).
set({ NEXT_PUBLIC_SSE_WEB_SITE: "https://data.example.com/x/" });
assert.equal(live2dSources("cn").site, "https://data.example.com/x/");
set({ NEXT_PUBLIC_SSE_WEB_SITE: "https://data.example.com/x/", NEXT_PUBLIC_LIVE2D_SITE: "https://other.example.com/" });
assert.equal(live2dSources("cn").site, "https://other.example.com/");
set({ NEXT_PUBLIC_SSE_WEB_ASSET_PROXY: "http://127.0.0.1:8787/remote/" });
assert.equal(live2dSources("jp").proxy, "http://127.0.0.1:8787/remote/");
assert.equal(live2dFetchUrl("https://storage.exmeaning.com/a.webp"), "http://127.0.0.1:8787/remote/storage.exmeaning.com/a.webp");
set({ NEXT_PUBLIC_SSE_WEB_ASSET_PROXY: "http://127.0.0.1:1/a/", NEXT_PUBLIC_LIVE2D_ASSET_PROXY: "http://localhost:2/b/" });
assert.equal(live2dFetchUrl("https://h/p"), "http://localhost:2/b/h/p");

// Malformed values fail (the build reads every setting once).
for (const [name, value] of [
    ["NEXT_PUBLIC_LIVE2D_SITE", "https://data.example.com/x"],
    ["NEXT_PUBLIC_LIVE2D_SITE", "http://data.example.com/y/"],
    ["NEXT_PUBLIC_LIVE2D_SITE", "https://data.example.com/y/?q=1"],
    ["NEXT_PUBLIC_LIVE2D_SITE", "https://data.example.com/a/../b/"],
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

// --- the catalogue ---

const ichika = "live2d/model/01ichika_normal/live2d/model/v1/main/01_ichika/01ichika_normal/buildmodeldata";
const ichikaMotions = "live2d/motion/01ichika_motion_base/live2d/motion/v1/main/01_ichika/01ichika_motion_base/buildmotiondata";
const motionDirectories = ["01ichika_motion_base", "v2_01ichika_motion_base", "sub_airichild_motion_base", "sub_airi_motion_base"];
const catalogue = {
    published_version: "7.1.0",
    complete: true,
    models: [
        { id: "sub_airichild", asset: "live2d/model/sub_airichild/a/buildmodeldata", size: 5, textures: 1, characters: [] },
        { id: "01ichika_normal", asset: ichika, size: 10, textures: 2, characters: [
            { character2d_id: 1, motion_set: ichikaMotions, episodes: 40 },
            { character2d_id: 900, motion_set: "live2d/motion/x/buildmotiondata", episodes: 1 },
        ] },
        { id: "v2_01ichika_casual", asset: "live2d/model/v2_01ichika_casual/b/buildmodeldata", size: 1, textures: 1, characters: [] },
        // a model no story pairs and the naming does not match is listed without motions
        { id: "mob_x", asset: "live2d/model/mob_x/c/buildmodeldata", size: 1, textures: 1, characters: [] },
        { id: "01ichika_normal", asset: "dup", characters: [] },
        { id: "Bad Id", asset: "x", characters: [] },
        { id: "no_asset", characters: [] },
    ],
};
const models = parseLive2DCatalogue(catalogue, motionDirectories);
assert.deepEqual(models.map(model => model.id), ["v2_01ichika_casual", "01ichika_normal", "sub_airichild", "mob_x"]);
// the motion set most stories play first, then the others they do
assert.deepEqual(models[1].motions, [ichikaMotions, "live2d/motion/x/buildmotiondata"]);
assert.equal(models[1].asset, ichika);
assert.equal(models[1].bundle, "live2d/model/01ichika_normal");
assert.equal(models[1].bytes, 10);
assert.equal(models[1].textures, 2);
// a model no story pairs gets the motion set the naming gives: the longest match
assert.deepEqual(models[0].motions, ["live2d/motion/v2_01ichika_motion_base"]);
assert.deepEqual(models[2].motions, ["live2d/motion/sub_airichild_motion_base"]);
assert.deepEqual(models[3].motions, []);
assert.equal(models[2].kind, "sub");
assert.equal(models[3].characterId, null);
// a catalogue still being built says so
assert.equal(parseLive2DCatalogue({ published_version: "", complete: false, models: [] }), null);
assert.throws(() => parseLive2DCatalogue(null), /live2d_catalogue_invalid/);
assert.throws(() => parseLive2DCatalogue({ complete: true }), /live2d_catalogue_invalid/);

// with the masterdata the kind is the characters': character before sub before mob, the
// character and unit of the most episodes of that kind
const character2ds = new Map([
    [1, { characterType: "game_character", characterId: 1, unit: "light_sound" }],
    [900, { characterType: "mob", characterId: 0 }],
    [77, { characterType: "sub_game_character", characterId: 0, unit: "none" }],
]);
const typed = parseLive2DCatalogue({ complete: true, models: [
    { id: "01ichika_normal", asset: ichika, characters: [{ character2d_id: 900, episodes: 99 }, { character2d_id: 1, episodes: 2 }] },
    { id: "sub_airichild", asset: "a", characters: [{ character2d_id: 900, episodes: 3 }] },
    { id: "sub_airi_lesson", asset: "b", characters: [{ character2d_id: 77, episodes: 3 }, { character2d_id: 900, episodes: 9 }] },
    { id: "sub_unknown", asset: "c", characters: [{ character2d_id: 5, episodes: 1 }] },
] }, [], character2ds);
assert.deepEqual(typed.map(model => [model.id, model.kind, model.characterId]), [
    ["01ichika_normal", "character", 1],
    ["sub_airi_lesson", "sub", null],
    // none the masterdata names: what the id spells
    ["sub_unknown", "sub", null],
    ["sub_airichild", "mob", null],
]);

// --- the site's own listing (the catalogue is not ready) ---

assert.equal(live2dMotionByName("sub_airi_lesson", motionDirectories), "live2d/motion/sub_airi_motion_base");
assert.equal(live2dMotionByName("01ichikanot", motionDirectories), null);
const listed = live2dModelsByName(["01ichika_normal", "sub_airichild", "Bad Id", "mob_x"], motionDirectories);
assert.deepEqual(listed.map(model => [model.id, model.asset, model.motions]), [
    ["01ichika_normal", "live2d/model/01ichika_normal", ["live2d/motion/01ichika_motion_base"]],
    ["sub_airichild", "live2d/model/sub_airichild", ["live2d/motion/sub_airichild_motion_base"]],
    ["mob_x", "live2d/model/mob_x", []],
]);

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
