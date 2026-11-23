/**
 * Unit tests for Story Maker in-game UI kit geometry, animation curves, choice layout,
 * proxy resolution, and pure RGBA sprite pre-processing helpers.
 *
 * Run with: node --experimental-strip-types --test web/tests/story-maker-uikit.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
    GAME_CANVAS,
    GAME_COLORS,
    GAME_COLOR_TUPLES,
    GAME_LAYOUT,
    DEFAULT_CHOICE_LAYOUT,
    endSignTransform,
    isAutoIconVisible,
    telopShowSample,
    telopHideSample,
    parseChoiceLayout,
    choiceButtonRects,
    resolveStoryUiKitSources,
    tintRgbaPixels,
    sliceHorizontalPixels,
    rotate90CwPixels,
    buildNameBarPixels,
    loadStoryUiKit,
    configureStoryCore,
    resetStoryCoreConfig,
} = await import("@moesekai/story-core");

function approx(actual, expected, eps = 1e-4, label = "") {
    assert.ok(
        Math.abs(actual - expected) <= eps,
        `${label ? `${label}: ` : ""}expected ${actual} to be within ${eps} of ${expected}`,
    );
}

test("GAME_CANVAS and GAME_LAYOUT match native_ui.rs reference rects and colors", () => {
    assert.deepEqual(GAME_CANVAS, { width: 1920, height: 1080 });
    assert.deepEqual(GAME_LAYOUT.talk.window, [-440, 768, 2800, 312]);
    assert.equal(GAME_LAYOUT.talk.windowColor, "rgba(0, 0, 34, 1)");
    assert.deepEqual(GAME_LAYOUT.talk.nameBar, [210, 824, 720, 16]);
    assert.equal(GAME_LAYOUT.talk.nameBarAlpha, 0.6);
    assert.deepEqual(GAME_LAYOUT.talk.name, [230, 790, 593, 44]);
    assert.deepEqual(GAME_LAYOUT.talk.words, [250, 858, 1368.3, 154]);
    assert.deepEqual(GAME_LAYOUT.talk.endSignPivot, [1593.5, 1050]);
    assert.deepEqual(GAME_LAYOUT.talk.endSignSize, [50, 44]);
    assert.deepEqual(GAME_LAYOUT.talk.auto, [1656, 1008, 200, 48]);
    assert.equal(GAME_LAYOUT.talk.autoBgColor, "rgba(68, 68, 102, 0.8)");
    approx(GAME_LAYOUT.talk.autoIconOn, 0.50276244, 1e-7);

    assert.deepEqual(GAME_LAYOUT.placeInfo.band, [0, 31, 580, 64]);
    assert.deepEqual(GAME_LAYOUT.placeInfo.pieces, [-152, 0, 580, 732]);
    assert.deepEqual(GAME_LAYOUT.placeInfo.text, [40, 43, 520, 40]);
    assert.equal(GAME_LAYOUT.placeInfo.fontSize, 40);
    approx(GAME_LAYOUT.placeInfo.hiddenX, -578.2222, 1e-3);

    assert.deepEqual(GAME_LAYOUT.telop.band, [440, 480, 1040, 120]);
    assert.deepEqual(GAME_LAYOUT.telop.pieces, [440, 700, 1220, 1480]);
    assert.equal(GAME_LAYOUT.telop.fontSize, 44);
    approx(GAME_LAYOUT.telop.pivotX, 460.8, 1e-4);

    assert.equal(GAME_LAYOUT.fullScreenText.baseAlpha, 0.5);
    assert.equal(GAME_LAYOUT.fullScreenText.barHeight, 240);
    assert.deepEqual(GAME_LAYOUT.fullScreenText.text, [280, 240, 1640, 600]);

    assert.deepEqual(GAME_LAYOUT.choice.buttonSize, [520, 96]);
    assert.equal(GAME_LAYOUT.choice.glowOutset, 4);
    assert.equal(GAME_LAYOUT.choice.textInset, 24);
    assert.equal(GAME_LAYOUT.choice.fontSize, 32);
    assert.equal(GAME_LAYOUT.choice.textColor, "rgba(68, 68, 102, 1)");
    assert.equal(GAME_COLORS.answerText, "rgba(68, 68, 102, 1)");

    assert.deepEqual(GAME_LAYOUT.menu.button, [1808, 16, 96, 96]);
    assert.deepEqual(GAME_LAYOUT.menu.icon, [1830, 58, 52, 12]);
    assert.equal(GAME_LAYOUT.menu.iconColor, "rgba(68, 68, 102, 1)");
});

test("endSignTransform follows exact cubic segments, 60fps keyed tail, and periodic wrapping", () => {
    // t = 0: resting pose at pivot [1593.5, 1050], size [50, 44]
    const s0 = endSignTransform(0);
    approx(s0.scaleY, 1.0, 1e-5, "t=0 scaleY");
    approx(s0.offsetY, 0.0, 1e-5, "t=0 offsetY");
    assert.deepEqual(s0.rect, [1568.5, 1006, 50, 44]);

    // Segment 1 start (t = 0.216667): compressed to scaleY = 0.95, offsetY = 0
    const s1 = endSignTransform(0.216667);
    approx(s1.scaleY, 0.95, 1e-5, "seg1 scaleY");
    approx(s1.offsetY, 0.0, 1e-5, "seg1 offsetY");

    // Segment 2 start (t = 0.433333): stretched to scaleY = 1.1, offsetY = 1.0
    const s2 = endSignTransform(0.433333);
    approx(s2.scaleY, 1.1, 1e-5, "seg2 scaleY");
    approx(s2.offsetY, 1.0, 1e-5, "seg2 offsetY");

    // Keyed tail start (frame 39 -> t = 39 / 60 = 0.65): offsetY = 5.0
    const sKey0 = endSignTransform(39 / 60);
    approx(sKey0.offsetY, 5.0, 1e-4, "frame 39 offsetY");

    // Peak near frame 45 (index 6 in END_SIGN_KEYS -> 5.5529)
    const sPeak = endSignTransform(45 / 60);
    approx(sPeak.offsetY, 5.5529, 1e-4, "frame 45 peak offsetY");
    assert.ok(sPeak.rect[1] < s0.rect[1], "endSign moves upward (smaller screen y) at peak");

    // Periodicity: t + length and negative t wrap cleanly via Euclidean remainder
    const sWrap = endSignTransform(0.433333 + GAME_LAYOUT.talk.endSignLength * 3);
    approx(sWrap.scaleY, s2.scaleY, 1e-4, "wrapped scaleY");
    approx(sWrap.offsetY, s2.offsetY, 1e-4, "wrapped offsetY");

    const sNeg = endSignTransform(-GAME_LAYOUT.talk.endSignLength + 0.216667);
    approx(sNeg.scaleY, s1.scaleY, 1e-4, "negative t scaleY");
    approx(sNeg.offsetY, s1.offsetY, 1e-4, "negative t offsetY");
});

test("isAutoIconVisible matches AUTO_ICON_ON duty cycle", () => {
    assert.equal(isAutoIconVisible(0), true);
    assert.equal(isAutoIconVisible(0.5), true);
    assert.equal(isAutoIconVisible(0.503), false);
    assert.equal(isAutoIconVisible(0.99), false);
    assert.equal(isAutoIconVisible(1.0), true);
    assert.equal(isAutoIconVisible(2.25), true);
    assert.equal(isAutoIconVisible(-0.2), false);
});

test("telopShowSample and telopHideSample interpolate exact native_ui.rs curves", () => {
    const showStart = telopShowSample(0);
    assert.deepEqual(showStart, { baseScaleX: 0, baseAlpha: 0, textAlpha: 0, textOffsetX: -30 });

    // Clamping below 0
    assert.deepEqual(telopShowSample(-0.5), showStart);

    // Mid-frame linear interpolation at frame 10.5 (t = 10.5 / 60)
    const showMid = telopShowSample(10.5 / 60);
    approx(showMid.baseScaleX, (0.90873 + 0.94274) * 0.5, 1e-5, "showMid baseScaleX");
    approx(showMid.baseAlpha, (0.83532 + 0.89725) * 0.5, 1e-5, "showMid baseAlpha");
    approx(showMid.textAlpha, (0.90005 + 0.92208) * 0.5, 1e-5, "showMid textAlpha");
    approx(showMid.textOffsetX, (-18.92424 + -16.32728) * 0.5, 1e-4, "showMid textOffsetX");

    // End of clip (frame >= 20, t >= 1/3 s)
    const showEnd = telopShowSample(0.4);
    assert.deepEqual(showEnd, { baseScaleX: 1, baseAlpha: 1, textAlpha: 1, textOffsetX: 0 });

    // Hide curve
    const hideStart = telopHideSample(0);
    assert.deepEqual(hideStart, { baseScaleX: 1, baseAlpha: 1, textAlpha: 1, textOffsetX: 0 });

    const hideMid = telopHideSample(10 / 60);
    approx(hideMid.baseAlpha, 0.6446, 1e-5, "hideMid baseAlpha");
    approx(hideMid.textAlpha, 0.6446, 1e-5, "hideMid textAlpha");
    assert.equal(hideMid.baseScaleX, 1);
    assert.equal(hideMid.textOffsetX, 0);

    const hideEnd = telopHideSample(0.5);
    approx(hideEnd.baseAlpha, 0.00001, 1e-6, "hideEnd baseAlpha");
    approx(hideEnd.textAlpha, 0.00001, 1e-6, "hideEnd textAlpha");
});

test("choiceButtonRects produces exact 2-option game layout and balanced 3/4-option layouts", () => {
    assert.deepEqual(choiceButtonRects(0), []);

    // 1 option centered
    assert.deepEqual(choiceButtonRects(1), [[700, 492, 520, 96]]);

    // 2 options: exact JP 7.0.0 AnswerChoiceDialog coordinates
    const two = choiceButtonRects(2, DEFAULT_CHOICE_LAYOUT, 1);
    assert.deepEqual(two, [
        [240, 492, 520, 96],
        [1160, 492, 520, 96],
    ]);

    // Scaling about window center [0, -40]
    const twoHalf = choiceButtonRects(2, DEFAULT_CHOICE_LAYOUT, 0.5);
    // cx = -230, cy = -40 + 20 = -20 -> x = 960 - 230 - 130 = 600, y = 540 + 20 - 24 = 536
    assert.deepEqual(twoHalf, [
        [600, 536, 260, 48],
        [1060, 536, 260, 48],
    ]);

    // 3 options: balanced 2 + 1 pyramid, non-overlapping, above talk window (y=768)
    const three = choiceButtonRects(3);
    assert.equal(three.length, 3);
    assert.deepEqual(three, [
        [240, 416, 520, 96],
        [1160, 416, 520, 96],
        [700, 568, 520, 96],
    ]);

    // 4 options: balanced 2x2 grid centered on 1920x1080, above talk window
    const four = choiceButtonRects(4);
    assert.equal(four.length, 4);
    assert.deepEqual(four, [
        [240, 416, 520, 96],
        [1160, 416, 520, 96],
        [240, 568, 520, 96],
        [1160, 568, 520, 96],
    ]);

    // Verify no overlap and clear bounds for 2, 3, and 4 choices
    for (const rects of [two, three, four]) {
        for (let i = 0; i < rects.length; i++) {
            const [x, y, w, h] = rects[i];
            assert.ok(x >= 0 && x + w <= GAME_CANVAS.width, "within horizontal canvas");
            assert.ok(y >= 112 && y + h <= GAME_LAYOUT.talk.window[1], "between top bar and talk window");
            for (let j = i + 1; j < rects.length; j++) {
                const [x2, y2, w2, h2] = rects[j];
                const overlaps = x < x2 + w2 && x + w > x2 && y < y2 + h2 && y + h > y2;
                assert.equal(overlaps, false, `buttons ${i} and ${j} must not overlap`);
            }
        }
    }
});

test("parseChoiceLayout accepts valid client JSON and falls back cleanly on bad data", () => {
    const custom = {
        window: [10, -20],
        buttons: [
            { pos: [-400, 30], size: [500, 90] },
            { pos: [400, 30], size: [500, 90] },
        ],
    };
    assert.deepEqual(parseChoiceLayout(custom), custom);
    assert.deepEqual(parseChoiceLayout(null), DEFAULT_CHOICE_LAYOUT);
    assert.deepEqual(parseChoiceLayout({ window: [0, 0], buttons: [] }), DEFAULT_CHOICE_LAYOUT);
    assert.deepEqual(
        parseChoiceLayout({ window: [0, 0], buttons: [{ pos: [0, 0], size: [-10, 96] }] }),
        DEFAULT_CHOICE_LAYOUT,
    );
});

test("resolveStoryUiKitSources falls back to live2dAssetProxy when SSE proxy is unset", () => {
    try {
        resetStoryCoreConfig();
        const plain = resolveStoryUiKitSources("jp");
        assert.ok(plain);
        assert.equal(plain.proxy, undefined);

        configureStoryCore({ live2dAssetProxy: "http://127.0.0.1:8788/remote/" });
        const viaL2d = resolveStoryUiKitSources("jp");
        assert.equal(viaL2d?.proxy, "http://127.0.0.1:8788/remote/");

        configureStoryCore({ sseWebAssetProxy: "http://127.0.0.1:8787/remote/" });
        const viaSse = resolveStoryUiKitSources("jp");
        assert.equal(viaSse?.proxy, "http://127.0.0.1:8787/remote/");

        assert.equal(resolveStoryUiKitSources("unknown"), null);
    } finally {
        resetStoryCoreConfig();
    }
});

test("pure sprite pixel transforms match native_ui.rs semantics", () => {
    // 1. Tint white pixel by WINDOW_COLOR (#000022)
    const white = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 200]) };
    const tinted = tintRgbaPixels(white, GAME_COLOR_TUPLES.window);
    assert.deepEqual([...tinted.data], [0, 0, 34, 200]);

    // 2. Horizontal 9-slice preserves left/right caps and stretches center
    const row = new Uint8ClampedArray([
        10, 0, 0, 255, // x=0 (left cap)
        20, 0, 0, 255, // x=1 (center)
        30, 0, 0, 255, // x=2 (right cap)
    ]);
    const sliced = sliceHorizontalPixels({ width: 3, height: 1, data: row }, 1, 1, 5);
    assert.equal(sliced.width, 5);
    assert.equal(sliced.height, 1);
    assert.deepEqual(
        [sliced.data[0], sliced.data[4], sliced.data[8], sliced.data[12], sliced.data[16]],
        [10, 20, 20, 20, 30],
    );

    // 3. 90-degree clockwise rotation (3x2 -> 2x3)
    const rect3x2 = {
        width: 3,
        height: 2,
        data: new Uint8ClampedArray([
            1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255,
            4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255,
        ]),
    };
    const rot = rotate90CwPixels(rect3x2);
    assert.equal(rot.width, 2);
    assert.equal(rot.height, 3);
    // Row 0: [4, 1], Row 1: [5, 2], Row 2: [6, 3]
    assert.deepEqual(
        [rot.data[0], rot.data[4], rot.data[8], rot.data[12], rot.data[16], rot.data[20]],
        [4, 1, 5, 2, 6, 3],
    );

    // 4. buildNameBarPixels outputs 720x16 fading from ~0.6 alpha on left to ~0 on right
    const src16x10 = { width: 16, height: 10, data: new Uint8ClampedArray(16 * 10 * 4).fill(255) };
    const bar = buildNameBarPixels(src16x10);
    assert.equal(bar.width, 720);
    assert.equal(bar.height, 16);
    const leftAlpha = bar.data[3];
    const rightAlpha = bar.data[(719) * 4 + 3];
    assert.ok(leftAlpha >= 150 && leftAlpha <= 155, `left alpha should be ~153, got ${leftAlpha}`);
    assert.ok(rightAlpha <= 1, `right alpha should be ~0, got ${rightAlpha}`);
});

test("loadStoryUiKit degrades gracefully to null in non-browser Node runtime", async () => {
    const kit = await loadStoryUiKit("jp");
    assert.equal(kit, null);
});

test("loadStoryUiKit skips spawning kit-worker.js when sse-web manifest omits it", async () => {
    const origWindow = globalThis.window;
    const origWorker = globalThis.Worker;
    const origFetch = globalThis.fetch;
    let workerSpawned = 0;
    const fetchedUrls = [];
    try {
        globalThis.window = { location: { origin: "http://127.0.0.1:3000" } };
        globalThis.Worker = class FakeWorker {
            constructor() {
                workerSpawned += 1;
            }
            postMessage() {}
            terminate() {}
        };
        globalThis.fetch = async (url) => {
            fetchedUrls.push(String(url));
            return {
                ok: true,
                json: async () => ({
                    format: "sse-web-release/1",
                    version: "2.0.0",
                    sha256: {
                        "player.js": "abc",
                        "render-worker.js": "def",
                        "sim-worker.js": "ghi",
                    },
                }),
            };
        };

        const base = "http://127.0.0.1:3000/sse-web/2.0.0-test-no-kit/";
        const kit1 = await loadStoryUiKit("jp", { scriptBaseUrl: base });
        const kit2 = await loadStoryUiKit("jp", { scriptBaseUrl: base });
        assert.equal(kit1, null);
        assert.equal(kit2, null);
        assert.equal(workerSpawned, 0, "must not spawn kit-worker.js when absent from manifest.json");
        assert.deepEqual(fetchedUrls, [`${base}manifest.json`], "manifest probe must be cached per scriptBaseUrl");
    } finally {
        globalThis.window = origWindow;
        globalThis.Worker = origWorker;
        globalThis.fetch = origFetch;
    }
});
