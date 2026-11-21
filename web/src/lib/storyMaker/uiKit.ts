/**
 * Project SEKAI in-game scenario UI layout constants, animation curves, and runtime sprite
 * derivation via the vendored sse-web `kit-worker.js`.
 *
 * Geometry, colors, curves, and nine-slice parameters mirror
 * `sse-render/src/native_ui.rs` and `sse-core/src/consts.rs` on the 1920x1080 reference canvas.
 */
import {
    SSE_WEB_PATH,
    sseWebFonts,
    sseWebSources,
    type SseWebFontFile,
    type SseWebSources,
} from "../sseWeb/config.ts";
import { SSE_WEB_RELEASE } from "../sseWeb/release.ts";

/** Reference-pixel rectangle `[x, y, width, height]` on the 1920x1080 canvas (y down). */
export type GameRect = readonly [x: number, y: number, w: number, h: number];

/** Normalized RGBA color tuple with channels in `[0, 1]`. */
export type RgbaTuple = readonly [r: number, g: number, b: number, a: number];

/** Single button slot inside `AnswerChoiceDialog.json` (Unity +y up coordinates). */
export interface ChoiceButtonSpec {
    readonly pos: readonly [number, number];
    readonly size: readonly [number, number];
}

/** Parsed layout of `AnswerChoiceDialog` (reference-canvas pixels, +y up). */
export interface ChoiceLayout {
    readonly window: readonly [number, number];
    readonly buttons: readonly ChoiceButtonSpec[];
}

/** Sampled transform of the manual page-forward `EndSign` at time `t` seconds. */
export interface EndSignSample {
    readonly scaleY: number;
    /** Upward offset in reference pixels (+y up, matching Unity `anchoredPosition.y`). */
    readonly offsetY: number;
    /** Target rectangle `[x, y, w, h]` on the 1920x1080 canvas (y down). */
    readonly rect: GameRect;
}

/** Sampled state of `ScenarioTelop` show/hide animation at time `t` seconds. */
export interface TelopSample {
    readonly baseScaleX: number;
    readonly baseAlpha: number;
    readonly textAlpha: number;
    readonly textOffsetX: number;
}

/** Straight-alpha RGBA pixel buffer for pure sprite transforms. */
export interface RgbaBuffer {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
}

/** Loaded and pre-processed in-game UI sprite URLs and metadata for a server region. */
export interface StoryUiKit {
    readonly region: string;
    /** True when derived from sse-web kit-worker with at least one game sprite decoded. */
    readonly fromGameKit: boolean;
    /** True when kit-worker served the kit directly from the `sse-ui-kit-v1` Cache API. */
    readonly cached: boolean;
    /** `bg_story_adv.png` tinted to `WINDOW_COLOR` (#000022). */
    readonly window: string | null;
    /** `bg_base_half_r8_wh.png` 9-sliced to 16x720, rotated +90 deg, alpha gradient 0.6 -> 0. */
    readonly nameBar: string | null;
    /** `bg_base_round_h48_wh.png` 9-sliced L25/R25 to 200px wide and tinted to `AUTO_BG_COLOR`. */
    readonly autoBg: string | null;
    /** `icon_triangle_h22_wh.png` rotated 90 deg clockwise. */
    readonly autoIcon: string | null;
    /** `btn_circle_h80_wh.png`. */
    readonly menuBg: string | null;
    /** `icon_menu_story_wh.png` tinted to `MENU_ICON_COLOR`. */
    readonly menuIcon: string | null;
    /** `icon_pageForward_gn.png`. */
    readonly endSign: string | null;
    /** `btn_round_h80_wh.png` 9-sliced L51/R51 to 520px wide. */
    readonly answerBg: string | null;
    /** `eff_btn_round_h80_a70_wh.png` 9-sliced L56/R56 to 528px wide and tinted to `BUTTON_GLOW_COLOR`. */
    readonly answerGlow: string | null;
    /** Choice dialog layout from `AnswerChoiceDialog.json` (or JP 7.0.0 default). */
    readonly choiceLayout: ChoiceLayout;
    /** `SE_UI_CHOICES_DECIDE.wav` Blob URL if present in the derived kit. */
    readonly decideSoundUrl: string | null;
    /** `SE_UI_CHOICES_OPEN.wav` Blob URL if present in the derived kit. */
    readonly openSoundUrl: string | null;
    /** Sprite or asset names that were absent or failed to decode. */
    readonly missing: readonly string[];
    /** Releases this caller's reference to the cached Blob URLs (idempotent). */
    release: () => void;
}

export const GAME_CANVAS = {
    width: 1920,
    height: 1080,
} as const;

export const GAME_COLOR_TUPLES = {
    window: [0.0, 0.0, 0.133_333_34, 1.0] as RgbaTuple,
    band: [0.266_666_68, 0.266_666_68, 0.4, 0.8] as RgbaTuple,
    autoBg: [0.266_666_68, 0.266_666_68, 0.4, 0.8] as RgbaTuple,
    menuIcon: [0.266_666_68, 0.266_666_68, 0.4, 1.0] as RgbaTuple,
    answerText: [0.266_666_68, 0.266_666_68, 0.4, 1.0] as RgbaTuple,
    answerGlow: [0.631_372_6, 0.956_862_8, 0.921_568_6, 1.0] as RgbaTuple,
    answerGlowText: [1.0, 1.0, 1.0, 1.0] as RgbaTuple,
    talkName: [0.921_568_6, 0.921_568_6, 0.949_019_6, 1.0] as RgbaTuple,
    talkWords: [1.0, 1.0, 1.0, 1.0] as RgbaTuple,
    textOutline: [0.266_667, 0.266_667, 0.4, 0.6] as RgbaTuple,
} as const;

export const GAME_COLORS = {
    window: "rgba(0, 0, 34, 1)",
    windowHex: "#000022",
    band: "rgba(68, 68, 102, 0.8)",
    autoBg: "rgba(68, 68, 102, 0.8)",
    menuIcon: "rgba(68, 68, 102, 1)",
    answerText: "rgba(68, 68, 102, 1)",
    answerGlow: "rgba(161, 244, 235, 1)",
    answerGlowText: "rgba(255, 255, 255, 1)",
    talkName: "rgba(235, 235, 242, 1)",
    talkWords: "rgba(255, 255, 255, 1)",
    textOutline: "rgba(68, 68, 102, 0.6)",
} as const;

export const GAME_FONTS = {
    body: '"SekaiStoryBody", "SekaiStoryBodyFill", "Noto Sans JP", "Hiragino Sans", sans-serif',
    name: '"SekaiStoryName", "SekaiStoryNameFill", "Noto Sans JP", "Hiragino Sans", sans-serif',
    bodyWeight: 460,
    nameWeight: 820,
} as const;

export const DEFAULT_CHOICE_LAYOUT: ChoiceLayout = {
    window: [0, -40],
    buttons: [
        { pos: [-460, 40], size: [520, 96] },
        { pos: [460, 40], size: [520, 96] },
    ],
};

/** Exact 1920x1080 in-game layout rectangles, colors, and timings from `native_ui.rs`. */
export const GAME_LAYOUT = {
    canvas: GAME_CANVAS,
    talk: {
        window: [-440, 768, 2800, 312] as GameRect,
        windowColor: GAME_COLORS.window,
        windowColorRgba: GAME_COLOR_TUPLES.window,
        nameBar: [210, 824, 720, 16] as GameRect,
        nameBarAlpha: 0.6,
        name: [230, 790, 593, 44] as GameRect,
        nameFontSize: 44,
        words: [250, 858, 1368.3, 154] as GameRect,
        wordsFontSize: 44,
        wordsMinFontSize: 22,
        lineAdvancePx: 48,
        openCloseDuration: 0.2,
        wordInterval: 0.059_999_998_658_895_49,
        endSignPivot: [1593.5, 1050] as readonly [number, number],
        endSignSize: [50, 44] as readonly [number, number],
        endSignLength: 1.083_333_3,
        auto: [1656, 1008, 200, 48] as GameRect,
        autoBgColor: GAME_COLORS.autoBg,
        autoBgColorRgba: GAME_COLOR_TUPLES.autoBg,
        autoTextSize: 32,
        autoTextSpacing: -4,
        autoIconOn: 0.502_762_44,
        autoIconCycle: 1.0,
        autoIconSize: [22, 28] as readonly [number, number],
        autoIconGroupWidth: 28,
        autoRowGap: 6,
    },
    placeInfo: {
        band: [0, 31, 580, 64] as GameRect,
        rampWidth: 152,
        /** Horizontal x-stops `[leftRampStart, solidStart, solidEnd, rightRampEnd]`. */
        pieces: [-152, 0, 580, 732] as readonly [number, number, number, number],
        fullSpan: [-152, 31, 884, 64] as GameRect,
        color: GAME_COLORS.band,
        colorRgba: GAME_COLOR_TUPLES.band,
        text: [40, 43, 520, 40] as GameRect,
        fontSize: 40,
        slideDuration: 0.2,
        /** `place_info_hidden_x([1920, 1080]) = -(-1920/1080 + 580)`. */
        hiddenX: -(-GAME_CANVAS.width / GAME_CANVAS.height + 580),
    },
    telop: {
        band: [440, 480, 1040, 120] as GameRect,
        /** Horizontal x-stops `[leftRampStart, solidStart, solidEnd, rightRampEnd]` (260/520/260). */
        pieces: [440, 700, 1220, 1480] as readonly [number, number, number, number],
        pivotXFraction: 0.02,
        pivotX: 440 + 0.02 * 1040,
        color: GAME_COLORS.band,
        colorRgba: GAME_COLOR_TUPLES.band,
        text: [440, 480, 1040, 120] as GameRect,
        fontSize: 44,
        clipLength: 0.333_333_34,
    },
    fullScreenText: {
        baseAlpha: 0.5,
        barHeight: 240,
        /** `fst_text([1920, 1080])` from `native_ui.rs`. */
        text: [280, 240, 1640, 600] as GameRect,
        /** Symmetric horizontally-centered text frame `[280, 240, 1360, 600]`. */
        centeredText: [280, 240, 1360, 600] as GameRect,
        fontSize: 56,
        playDuration: 1.0,
        textWait: 0.125,
    },
    choice: {
        buttonSize: [520, 96] as readonly [number, number],
        glowOutset: 4,
        glowSize: [528, 104] as readonly [number, number],
        textInset: 24,
        fontSize: 32,
        textColor: GAME_COLORS.answerText,
        textColorRgba: GAME_COLOR_TUPLES.answerText,
        glowColor: GAME_COLORS.answerGlow,
        glowColorRgba: GAME_COLOR_TUPLES.answerGlow,
        glowTextColor: GAME_COLORS.answerGlowText,
        dialogScaleDuration: 0.125,
        pressFadeIn: 0.1,
        pressFadeOut: 0.4,
        defaultLayout: DEFAULT_CHOICE_LAYOUT,
    },
    menu: {
        button: [1808, 16, 96, 96] as GameRect,
        icon: [1830, 58, 52, 12] as GameRect,
        iconColor: GAME_COLORS.menuIcon,
        iconColorRgba: GAME_COLOR_TUPLES.menuIcon,
        fadeDuration: 0.1,
    },
} as const;

// ---- PageForward (`EndSign`) animation curves from `native_ui.rs` ----

type CubicSegment = readonly [start: number, a: number, b: number, c: number, d: number];

const END_SIGN_SCALE_Y: readonly CubicSegment[] = [
    [0.0, 9.831_591, -3.195_267, 0.0, 1.0],
    [0.216_667, -29.494_77, 9.585_801, 0.0, 0.95],
    [0.433_333, 0.728_265_9, -0.710_059_3, 0.0, 1.1],
];

const END_SIGN_POS_Y: readonly CubicSegment[] = [
    [0.0, 140.622, -8.922_928, -4.668_121, 0.0],
    [0.216_667, 299.050_8, -95.505_85, 11.269_54, 0.0],
    [0.433_333, -236.186_8, 80.996_28, 12.0, 1.0],
];

const END_SIGN_KEYED_FROM = 39;

const END_SIGN_KEYS: readonly number[] = [
    5.0, 5.194, 5.3328, 5.4316, 5.4984, 5.5378, 5.5529, 5.5452, 5.5161, 5.466, 5.3953, 5.3037,
    5.191, 5.0564, 4.899, 4.7174, 4.5099, 4.2745, 4.0084, 3.7083, 3.3698, 2.9873, 2.5531,
    2.057, 1.4838, 0.8109, 0.0,
];

function evalCubicSegments(curve: readonly CubicSegment[], u: number): number {
    let seg = curve[0];
    for (let i = curve.length - 1; i >= 0; i--) {
        if (u >= curve[i][0]) {
            seg = curve[i];
            break;
        }
    }
    const x = u - seg[0];
    return ((seg[1] * x + seg[2]) * x + seg[3]) * x + seg[4];
}

function remEuclid(value: number, period: number): number {
    return ((value % period) + period) % period;
}

/**
 * Evaluates the in-game `PageForward` clip for `EndSign` at `t` seconds (looping every 1.0833333 s).
 */
export function endSignTransform(t: number): EndSignSample {
    const u = remEuclid(t, GAME_LAYOUT.talk.endSignLength);
    const frame = u * 60.0;
    let offsetY: number;
    if (frame >= END_SIGN_KEYED_FROM) {
        const idx = Math.min(Math.floor(frame - END_SIGN_KEYED_FROM), END_SIGN_KEYS.length - 2);
        const w = Math.min(1.0, frame - END_SIGN_KEYED_FROM - idx);
        offsetY = END_SIGN_KEYS[idx] + (END_SIGN_KEYS[idx + 1] - END_SIGN_KEYS[idx]) * w;
    } else {
        offsetY = evalCubicSegments(END_SIGN_POS_Y, u);
    }
    const scaleY = evalCubicSegments(END_SIGN_SCALE_Y, u);
    const [px, py] = GAME_LAYOUT.talk.endSignPivot;
    const [w, h] = GAME_LAYOUT.talk.endSignSize;
    const bottom = py - offsetY;
    const scaledH = h * scaleY;
    return {
        scaleY,
        offsetY,
        rect: [px - w * 0.5, bottom - scaledH, w, scaledH],
    };
}

/** Whether the AUTO signal triangle icon is visible at `autoTime` seconds into the 1 s blink loop. */
export function isAutoIconVisible(autoTime: number): boolean {
    return remEuclid(autoTime, GAME_LAYOUT.talk.autoIconCycle) < GAME_LAYOUT.talk.autoIconOn;
}

// ---- `ac_scenario_telop_v2_01` / `_02` curves from `native_ui.rs::telop_clip` ----

const TELOP_SHOW_BASE_SCALE_X: readonly number[] = [
    0.0, 0.12296, 0.25391, 0.37795, 0.48991, 0.58842, 0.67495, 0.74949, 0.8125, 0.86549,
    0.90873, 0.94274, 0.9685, 0.98631, 0.99662, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
];

const TELOP_SHOW_BASE_ALPHA: readonly number[] = [
    0.0, 0.01372, 0.05516, 0.1241, 0.21668, 0.32518, 0.4419, 0.55721, 0.66336, 0.75705,
    0.83532, 0.89725, 0.94396, 0.97589, 0.99411, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
];

const TELOP_SHOW_TEXT_ALPHA: readonly number[] = [
    0.0, 0.0, 0.0, 0.0, 0.01159, 0.05211, 0.1365, 0.29176, 0.54934, 0.80819, 0.90005, 0.92208,
    0.94093, 0.95669, 0.96952, 0.97981, 0.98771, 0.99342, 0.99723, 0.99935, 1.0,
];

const TELOP_SHOW_TEXT_X: readonly number[] = [
    -30.0, -30.0, -30.0, -30.0, -29.69962, -28.85422, -27.52697, -25.79509, -23.74549,
    -21.42683, -18.92424, -16.32728, -13.678, -11.0655, -8.57801, -6.25891, -4.19729, -2.47611,
    -1.14798, -0.29804, 0.0,
];

const TELOP_HIDE_ALPHA: readonly number[] = [
    1.0, 0.99797, 0.99153, 0.97992, 0.96224, 0.93757, 0.90421, 0.86046, 0.8045, 0.73316,
    0.6446, 0.53982, 0.42369, 0.30985, 0.21207, 0.1352, 0.07928, 0.04113, 0.01686, 0.00391,
    0.00001,
];

function sampleTelopTable(table: readonly number[], t: number): number {
    const x = Math.max(0.0, Math.min(20.0, t * 60.0));
    const idx = Math.min(19, Math.floor(x));
    const w = x - idx;
    return table[idx] * (1.0 - w) + table[idx + 1] * w;
}

/** Evaluates the `ScenarioTelop` show clip (`ac_scenario_telop_v2_01`) at `t` seconds. */
export function telopShowSample(t: number): TelopSample {
    return {
        baseScaleX: sampleTelopTable(TELOP_SHOW_BASE_SCALE_X, t),
        baseAlpha: sampleTelopTable(TELOP_SHOW_BASE_ALPHA, t),
        textAlpha: sampleTelopTable(TELOP_SHOW_TEXT_ALPHA, t),
        textOffsetX: sampleTelopTable(TELOP_SHOW_TEXT_X, t),
    };
}

/** Evaluates the `ScenarioTelop` hide clip (`ac_scenario_telop_v2_02`) at `t` seconds. */
export function telopHideSample(t: number): TelopSample {
    const alpha = sampleTelopTable(TELOP_HIDE_ALPHA, t);
    return {
        baseScaleX: 1.0,
        baseAlpha: alpha,
        textAlpha: alpha,
        textOffsetX: 0.0,
    };
}

// ---- `AnswerChoiceDialog` layout calculator ----

function isFinitePair(value: unknown): value is readonly [number, number] {
    return Array.isArray(value)
        && value.length === 2
        && typeof value[0] === "number"
        && typeof value[1] === "number"
        && Number.isFinite(value[0])
        && Number.isFinite(value[1]);
}

/** Validates a parsed `AnswerChoiceDialog.json` value, falling back to JP 7.0.0 defaults. */
export function parseChoiceLayout(raw: unknown): ChoiceLayout {
    if (!raw || typeof raw !== "object") return DEFAULT_CHOICE_LAYOUT;
    const obj = raw as { window?: unknown; buttons?: unknown };
    if (!isFinitePair(obj.window) || !Array.isArray(obj.buttons) || obj.buttons.length === 0) {
        return DEFAULT_CHOICE_LAYOUT;
    }
    const buttons: ChoiceButtonSpec[] = [];
    for (const item of obj.buttons) {
        if (!item || typeof item !== "object") return DEFAULT_CHOICE_LAYOUT;
        const entry = item as { pos?: unknown; size?: unknown };
        if (!isFinitePair(entry.pos) || !isFinitePair(entry.size)) return DEFAULT_CHOICE_LAYOUT;
        if (entry.size[0] <= 0 || entry.size[1] <= 0) return DEFAULT_CHOICE_LAYOUT;
        buttons.push({
            pos: [entry.pos[0], entry.pos[1]],
            size: [entry.size[0], entry.size[1]],
        });
    }
    return {
        window: [obj.window[0], obj.window[1]],
        buttons,
    };
}

function projectChoiceButton(
    windowPos: readonly [number, number],
    button: ChoiceButtonSpec,
    scale: number,
): GameRect {
    const cx = windowPos[0] + button.pos[0] * scale;
    const cy = windowPos[1] + button.pos[1] * scale;
    const w = button.size[0] * scale;
    const h = button.size[1] * scale;
    return [
        GAME_CANVAS.width * 0.5 + cx - w * 0.5,
        GAME_CANVAS.height * 0.5 - cy - h * 0.5,
        w,
        h,
    ];
}

/**
 * Computes `AnswerChoiceDialog` button rectangles in 1920x1080 reference pixels (y down).
 *
 * - 2 choices (or any count covered by `layout.buttons`): uses the exact prefab slots
 *   (`[-460, 40]` and `[460, 40]` under `window [0, -40]`).
 * - 1 choice: centered at `[0, 40]` under `window`.
 * - 3 choices: balanced two-row pyramid (`[-460, 116]`, `[460, 116]`, `[0, -36]`) keeping
 *   the exact game button width and horizontal anchors while clearing the talk window below.
 * - 4 choices: balanced 2x2 grid (`[-460, 116]`, `[460, 116]`, `[-460, -36]`, `[460, -36]`)
 *   centered vertically at y = 540 with the center character lane unobstructed.
 */
export function choiceButtonRects(
    count: number,
    layout: ChoiceLayout = DEFAULT_CHOICE_LAYOUT,
    scale = 1,
): GameRect[] {
    if (count <= 0) return [];
    const safeScale = Math.max(0, scale);
    const size = GAME_LAYOUT.choice.buttonSize;

    if (count === 1) {
        return [projectChoiceButton(layout.window, { pos: [0, 40], size }, safeScale)];
    }

    if (layout.buttons.length >= count) {
        return layout.buttons
            .slice(0, count)
            .map(button => projectChoiceButton(layout.window, button, safeScale));
    }

    const baseX = layout.buttons.length >= 2
        ? Math.max(Math.abs(layout.buttons[0].pos[0]), Math.abs(layout.buttons[1].pos[0])) || 460
        : 460;
    const baseY = layout.buttons[0]?.pos[1] ?? 40;
    const rowStep = 152; // 96px button height + 56px vertical spacing

    if (count === 3) {
        const topY = baseY + rowStep * 0.5;
        const bottomY = baseY - rowStep * 0.5;
        const slots: ChoiceButtonSpec[] = [
            { pos: [-baseX, topY], size },
            { pos: [baseX, topY], size },
            { pos: [0, bottomY], size },
        ];
        return slots.map(button => projectChoiceButton(layout.window, button, safeScale));
    }

    if (count === 4) {
        const topY = baseY + rowStep * 0.5;
        const bottomY = baseY - rowStep * 0.5;
        const slots: ChoiceButtonSpec[] = [
            { pos: [-baseX, topY], size },
            { pos: [baseX, topY], size },
            { pos: [-baseX, bottomY], size },
            { pos: [baseX, bottomY], size },
        ];
        return slots.map(button => projectChoiceButton(layout.window, button, safeScale));
    }

    // General multi-row 2-column fallback if more than 4 choices are ever supplied.
    const rows = Math.ceil(count / 2);
    const compactStep = rows > 2 ? 128 : rowStep;
    const topRowY = baseY + ((rows - 1) * compactStep) * 0.5;
    const rects: GameRect[] = [];
    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const isLastAlone = i === count - 1 && count % 2 === 1;
        const x = isLastAlone ? 0 : col === 0 ? -baseX : baseX;
        const y = topRowY - row * compactStep;
        rects.push(projectChoiceButton(layout.window, { pos: [x, y], size }, safeScale));
    }
    return rects;
}

// ---- Pure pixel transforms matching `native_ui.rs` ----

/** Multiplies every pixel's RGBA channels by `color` (`[r, g, b, a]` in `0..1`). */
export function tintRgbaPixels(src: RgbaBuffer, color: RgbaTuple): RgbaBuffer {
    const [cr, cg, cb, ca] = color;
    const out = new Uint8ClampedArray(src.data.length);
    for (let i = 0; i < src.data.length; i += 4) {
        out[i] = Math.round(src.data[i] * cr);
        out[i + 1] = Math.round(src.data[i + 1] * cg);
        out[i + 2] = Math.round(src.data[i + 2] * cb);
        out[i + 3] = Math.round(src.data[i + 3] * ca);
    }
    return { width: src.width, height: src.height, data: out };
}

/** Nine-slice along x only (Unity `Image.Type.Sliced`, matching `native_ui.rs::slice_h`). */
export function sliceHorizontalPixels(
    src: RgbaBuffer,
    left: number,
    right: number,
    outW: number,
): RgbaBuffer {
    const sw = src.width;
    const sh = src.height;
    const targetW = Math.max(1, Math.round(outW));
    const l = Math.min(Math.max(0, Math.round(left)), Math.floor(sw / 2), Math.floor(targetW / 2));
    const r = Math.min(Math.max(0, Math.round(right)), sw - l, targetW - l);
    const out = new Uint8ClampedArray(targetW * sh * 4);
    const centreSrc = Math.max(1, sw - l - r);
    const centreDst = Math.max(1, targetW - l - r);

    for (let x = 0; x < targetW; x++) {
        let sx: number;
        if (x < l) {
            sx = x;
        } else if (x >= targetW - r) {
            sx = sw - (targetW - x);
        } else {
            const mapped = Math.round(((x - l + 0.5) / centreDst) * centreSrc - 0.5);
            sx = l + Math.max(0, Math.min(centreSrc - 1, mapped));
        }
        sx = Math.max(0, Math.min(sw - 1, sx));
        for (let y = 0; y < sh; y++) {
            const si = (y * sw + sx) * 4;
            const di = (y * targetW + x) * 4;
            out[di] = src.data[si];
            out[di + 1] = src.data[si + 1];
            out[di + 2] = src.data[si + 2];
            out[di + 3] = src.data[si + 3];
        }
    }
    return { width: targetW, height: sh, data: out };
}

/** Rotates an RGBA image 90 degrees clockwise (matching `image::imageops::rotate90`). */
export function rotate90CwPixels(src: RgbaBuffer): RgbaBuffer {
    const sw = src.width;
    const sh = src.height;
    const dw = sh;
    const dh = sw;
    const out = new Uint8ClampedArray(dw * dh * 4);
    for (let sy = 0; sy < sh; sy++) {
        const dx = sh - 1 - sy;
        for (let sx = 0; sx < sw; sx++) {
            const dy = sx;
            const si = (sy * sw + sx) * 4;
            const di = (dy * dw + dx) * 4;
            out[di] = src.data[si];
            out[di + 1] = src.data[si + 1];
            out[di + 2] = src.data[si + 2];
            out[di + 3] = src.data[si + 3];
        }
    }
    return { width: dw, height: dh, data: out };
}

/**
 * Builds `NameBackground` from `bg_base_half_r8_wh` (16x10 -> 720x16):
 * 9-sliced top border 8px, rotated +90 deg, and faded left-to-right from alpha 0.6 to 0
 * (matching `native_ui.rs::name_bar`).
 */
export function buildNameBarPixels(src: RgbaBuffer): RgbaBuffer {
    const len = GAME_LAYOUT.talk.nameBar[2];
    const thick = GAME_LAYOUT.talk.nameBar[3];
    const sw = src.width;
    const sh = src.height;
    const top = Math.min(8, Math.max(0, sh - 1));
    const span = Math.max(1, sh - top);
    const stretchLen = Math.max(1, len - top);
    const out = new Uint8ClampedArray(len * thick * 4);

    for (let d = 0; d < len; d++) {
        let sy: number;
        if (d < top) {
            sy = d;
        } else {
            const mapped = Math.round(((d - top + 0.5) / stretchLen) * span - 0.5);
            sy = top + Math.max(0, Math.min(span - 1, mapped));
        }
        sy = Math.max(0, Math.min(sh - 1, sy));
        const grad = GAME_LAYOUT.talk.nameBarAlpha * (1.0 - (d + 0.5) / len);
        for (let row = 0; row < thick; row++) {
            const sx = Math.max(0, Math.min(sw - 1, thick - 1 - row));
            const si = (sy * sw + sx) * 4;
            const di = (row * len + d) * 4;
            out[di] = src.data[si];
            out[di + 1] = src.data[si + 1];
            out[di + 2] = src.data[si + 2];
            out[di + 3] = Math.round(src.data[si + 3] * grad);
        }
    }
    return { width: len, height: thick, data: out };
}

// ---- Sources & proxy resolution ----

function parseProxyDirectory(raw: string | undefined): string | null {
    const value = raw?.trim();
    if (!value) return null;
    try {
        const parsed = new URL(value);
        const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        if (
            /[?#\\\s]/.test(value)
            || !(parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback))
            || !parsed.hostname
            || parsed.username
            || parsed.password
            || parsed.search
            || parsed.hash
            || parsed.pathname.split("/").some(part => part === "." || part === "..")
            || value !== parsed.href
            || !parsed.pathname.endsWith("/")
        ) {
            return null;
        }
        return parsed.href;
    } catch {
        return null;
    }
}

/**
 * Resolves `sseWebSources(region)` for `kit-worker.js`, falling back to
 * `NEXT_PUBLIC_LIVE2D_ASSET_PROXY` when `NEXT_PUBLIC_SSE_WEB_ASSET_PROXY` is unset in local dev.
 */
export function resolveStoryUiKitSources(region: string): SseWebSources | null {
    let sources: SseWebSources | null;
    try {
        sources = sseWebSources(region);
    } catch {
        return null;
    }
    if (!sources) return null;
    if (sources.proxy) return sources;
    // Named in full so Next.js inlines the public env variable into client bundles.
    const fallbackProxy = parseProxyDirectory(process.env.NEXT_PUBLIC_LIVE2D_ASSET_PROXY);
    return fallbackProxy ? { ...sources, proxy: fallbackProxy } : sources;
}

// ---- Browser canvas & kit-worker extraction ----

const KIT_WORKER_TIMEOUT_MS = 60_000;
const CACHE_RELEASE_GRACE_MS = 60_000;

interface RawKitMessage {
    type: "kit";
    dir: string;
    files: [string, Uint8Array][];
    cached: boolean;
}

interface InternalKitData {
    region: string;
    fromGameKit: boolean;
    cached: boolean;
    window: string | null;
    nameBar: string | null;
    autoBg: string | null;
    autoIcon: string | null;
    menuBg: string | null;
    menuIcon: string | null;
    endSign: string | null;
    answerBg: string | null;
    answerGlow: string | null;
    choiceLayout: ChoiceLayout;
    decideSoundUrl: string | null;
    openSoundUrl: string | null;
    missing: readonly string[];
    blobUrls: string[];
}

interface CacheEntry {
    key: string;
    data: InternalKitData;
    refs: number;
    evictTimer: ReturnType<typeof setTimeout> | null;
}

interface InflightEntry {
    promise: Promise<InternalKitData | null>;
    waiters: number;
    cancel: () => void;
}

const kitCache = new Map<string, CacheEntry>();
const kitInflight = new Map<string, InflightEntry>();

function scriptBaseUrl(): string {
    return new URL(`${SSE_WEB_PATH}${SSE_WEB_RELEASE}/`, window.location.origin).href;
}

function absoluteFontFile(font: SseWebFontFile): SseWebFontFile {
    return { ...font, url: new URL(font.url, window.location.origin).href };
}

function copyToArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(bytes.byteLength);
    out.set(bytes);
    return out;
}

function createWorkCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    return new OffscreenCanvas(width, height);
}

async function canvasToPngBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
    if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
        return canvas.convertToBlob({ type: "image/png" });
    }
    return new Promise<Blob>((resolve, reject) => {
        (canvas as HTMLCanvasElement).toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("canvas_to_blob_failed"));
        }, "image/png");
    });
}

async function decodePng(bytes: Uint8Array): Promise<RgbaBuffer> {
    const blob = new Blob([copyToArrayBufferBytes(bytes)], { type: "image/png" });
    if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(blob);
        try {
            const canvas = createWorkCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("canvas_2d_unavailable");
            ctx.drawImage(bitmap, 0, 0);
            const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
            return { width: imageData.width, height: imageData.height, data: imageData.data };
        } finally {
            bitmap.close();
        }
    }
    const url = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("image_decode_failed"));
            el.src = url;
        });
        const canvas = createWorkCanvas(img.naturalWidth, img.naturalHeight);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas_2d_unavailable");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
        return { width: imageData.width, height: imageData.height, data: imageData.data };
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function encodePngBlobUrl(buf: RgbaBuffer): Promise<string> {
    const canvas = createWorkCanvas(buf.width, buf.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_2d_unavailable");
    const imageData = ctx.createImageData(buf.width, buf.height);
    imageData.data.set(buf.data);
    ctx.putImageData(imageData, 0, 0);
    const blob = await canvasToPngBlob(canvas);
    return URL.createObjectURL(blob);
}

function bytesToBlobUrl(bytes: Uint8Array, mimeType: string): string {
    return URL.createObjectURL(new Blob([copyToArrayBufferBytes(bytes)], { type: mimeType }));
}

function revokeAllUrls(urls: readonly string[]): void {
    for (const url of urls) {
        try {
            URL.revokeObjectURL(url);
        } catch {
            // ignore already-revoked or invalid URLs
        }
    }
}

async function processKitFiles(
    region: string,
    raw: RawKitMessage,
    cancelled: () => boolean,
): Promise<InternalKitData | null> {
    const fileMap = new Map<string, Uint8Array>();
    for (const [name, bytes] of raw.files) {
        fileMap.set(name, bytes);
    }

    const missing: string[] = [];
    const blobUrls: string[] = [];

    const registerUrl = (url: string): string => {
        blobUrls.push(url);
        return url;
    };

    const transformPng = async (
        name: string,
        transform?: (buf: RgbaBuffer) => RgbaBuffer,
    ): Promise<string | null> => {
        const bytes = fileMap.get(`${name}.png`);
        if (!bytes) {
            missing.push(name);
            return null;
        }
        try {
            if (!transform) {
                return registerUrl(bytesToBlobUrl(bytes, "image/png"));
            }
            const decoded = await decodePng(bytes);
            if (cancelled()) return null;
            const processed = transform(decoded);
            const url = await encodePngBlobUrl(processed);
            return registerUrl(url);
        } catch {
            missing.push(name);
            return null;
        }
    };

    try {
        const [
            windowUrl,
            nameBarUrl,
            autoBgUrl,
            autoIconUrl,
            menuBgUrl,
            menuIconUrl,
            endSignUrl,
            answerBgUrl,
            answerGlowUrl,
        ] = await Promise.all([
            transformPng("bg_story_adv", buf => tintRgbaPixels(buf, GAME_COLOR_TUPLES.window)),
            transformPng("bg_base_half_r8_wh", buf => buildNameBarPixels(buf)),
            transformPng("bg_base_round_h48_wh", buf =>
                tintRgbaPixels(
                    sliceHorizontalPixels(buf, 25, 25, GAME_LAYOUT.talk.auto[2]),
                    GAME_COLOR_TUPLES.autoBg,
                ),
            ),
            transformPng("icon_triangle_h22_wh", buf => rotate90CwPixels(buf)),
            transformPng("btn_circle_h80_wh"),
            transformPng("icon_menu_story_wh", buf => tintRgbaPixels(buf, GAME_COLOR_TUPLES.menuIcon)),
            transformPng("icon_pageForward_gn"),
            transformPng("btn_round_h80_wh", buf =>
                sliceHorizontalPixels(buf, 51, 51, GAME_LAYOUT.choice.buttonSize[0]),
            ),
            transformPng("eff_btn_round_h80_a70_wh", buf =>
                tintRgbaPixels(
                    sliceHorizontalPixels(buf, 56, 56, GAME_LAYOUT.choice.glowSize[0]),
                    GAME_COLOR_TUPLES.answerGlow,
                ),
            ),
        ]);

        if (cancelled()) {
            revokeAllUrls(blobUrls);
            return null;
        }

        let choiceLayout = DEFAULT_CHOICE_LAYOUT;
        const choiceJsonBytes = fileMap.get("AnswerChoiceDialog.json");
        if (choiceJsonBytes) {
            try {
                const decoded = new TextDecoder().decode(choiceJsonBytes);
                choiceLayout = parseChoiceLayout(JSON.parse(decoded));
            } catch {
                choiceLayout = DEFAULT_CHOICE_LAYOUT;
            }
        }

        const decideBytes = fileMap.get("SE_UI_CHOICES_DECIDE.wav");
        const decideSoundUrl = decideBytes ? registerUrl(bytesToBlobUrl(decideBytes, "audio/wav")) : null;

        const openBytes = fileMap.get("SE_UI_CHOICES_OPEN.wav");
        const openSoundUrl = openBytes ? registerUrl(bytesToBlobUrl(openBytes, "audio/wav")) : null;

        const hasAnySprite = Boolean(
            windowUrl || nameBarUrl || autoBgUrl || autoIconUrl || menuBgUrl
            || menuIconUrl || endSignUrl || answerBgUrl || answerGlowUrl,
        );
        if (!hasAnySprite) {
            revokeAllUrls(blobUrls);
            return null;
        }

        return {
            region,
            fromGameKit: true,
            cached: raw.cached,
            window: windowUrl,
            nameBar: nameBarUrl,
            autoBg: autoBgUrl,
            autoIcon: autoIconUrl,
            menuBg: menuBgUrl,
            menuIcon: menuIconUrl,
            endSign: endSignUrl,
            answerBg: answerBgUrl,
            answerGlow: answerGlowUrl,
            choiceLayout,
            decideSoundUrl,
            openSoundUrl,
            missing,
            blobUrls,
        };
    } catch {
        revokeAllUrls(blobUrls);
        return null;
    }
}

function runKitWorker(
    region: string,
    sources: SseWebSources,
): { promise: Promise<InternalKitData | null>; cancel: () => void } {
    let worker: Worker | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;
    let settled = false;
    let resolveOuter: ((value: InternalKitData | null) => void) | null = null;

    const cleanupWorker = () => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        if (worker) {
            worker.onmessage = null;
            worker.onerror = null;
            worker.terminate();
            worker = null;
        }
    };

    const finish = (value: InternalKitData | null) => {
        if (settled) return;
        settled = true;
        cleanupWorker();
        resolveOuter?.(value);
    };

    const promise = new Promise<InternalKitData | null>((resolve) => {
        resolveOuter = resolve;
        try {
            const base = scriptBaseUrl();
            worker = new Worker(`${base}kit-worker.js`);
        } catch {
            finish(null);
            return;
        }

        timeoutId = setTimeout(() => {
            isCancelled = true;
            finish(null);
        }, KIT_WORKER_TIMEOUT_MS);

        worker.onmessage = (event: MessageEvent) => {
            const msg = event.data as (Omit<Partial<RawKitMessage>, "type"> & { type?: string }) | null;
            if (!msg || typeof msg !== "object") return;
            if (msg.type === "error") {
                finish(null);
                return;
            }
            if (msg.type === "kit" && Array.isArray(msg.files)) {
                // Terminate worker immediately to free wasm derivation memory.
                cleanupWorker();
                void processKitFiles(
                    region,
                    {
                        type: "kit",
                        dir: typeof msg.dir === "string" ? msg.dir : "",
                        files: msg.files,
                        cached: Boolean(msg.cached),
                    },
                    () => isCancelled,
                ).then(
                    data => finish(data),
                    () => finish(null),
                );
            }
        };

        worker.onerror = () => {
            finish(null);
        };

        let fontsOption: { body: SseWebFontFile[]; name: SseWebFontFile[] } | undefined;
        try {
            const configured = sseWebFonts(region);
            if (configured) {
                fontsOption = {
                    body: configured.body.map(absoluteFontFile),
                    name: configured.name.map(absoluteFontFile),
                };
            }
        } catch {
            fontsOption = undefined;
        }

        worker.postMessage({
            type: "init",
            options: {
                pkg: "pkg/",
                sources: {
                    library: sources.library,
                    inapp: sources.inapp,
                    ...(sources.proxy ? { proxy: sources.proxy } : {}),
                },
                ...(fontsOption ? { fonts: fontsOption } : {}),
            },
        });
    });

    const cancel = () => {
        isCancelled = true;
        finish(null);
    };

    return { promise, cancel };
}

function acquireHandle(entry: CacheEntry, region: string): StoryUiKit {
    if (entry.evictTimer !== null) {
        clearTimeout(entry.evictTimer);
        entry.evictTimer = null;
    }
    entry.refs += 1;
    let released = false;

    const release = () => {
        if (released) return;
        released = true;
        entry.refs = Math.max(0, entry.refs - 1);
        if (entry.refs === 0 && entry.evictTimer === null) {
            entry.evictTimer = setTimeout(() => {
                entry.evictTimer = null;
                if (entry.refs === 0 && kitCache.get(entry.key) === entry) {
                    kitCache.delete(entry.key);
                    revokeAllUrls(entry.data.blobUrls);
                }
            }, CACHE_RELEASE_GRACE_MS);
        }
    };

    const { blobUrls: _urls, ...publicFields } = entry.data;
    return {
        ...publicFields,
        region,
        release,
    };
}

/**
 * Loads and pre-processes the in-game scenario UI kit for `region` via `sse-web`'s `kit-worker.js`.
 *
 * - Shares the browser `sse-ui-kit-v1` Cache API entry with `/story-player`.
 * - Deduplicates concurrent loads and caches processed Blob URLs with reference counting.
 * - Resolves to `null` (never throws) on SSR, abort, unsupported browsers, or network failure so
 *   callers can fall back seamlessly to vector/CSS styling.
 */
export async function loadStoryUiKit(
    region: string,
    signal?: AbortSignal,
): Promise<StoryUiKit | null> {
    if (signal?.aborted) return null;
    if (
        typeof window === "undefined"
        || typeof Worker === "undefined"
        || typeof URL === "undefined"
        || typeof URL.createObjectURL !== "function"
    ) {
        return null;
    }

    const sources = resolveStoryUiKitSources(region);
    if (!sources) return null;

    let ownFonts = false;
    try {
        const fonts = sseWebFonts(region);
        ownFonts = Boolean(fonts?.body.length && fonts?.name.length);
    } catch {
        ownFonts = false;
    }

    const cacheKey = `${sources.inapp}|${ownFonts ? "own" : "client"}`;

    const existing = kitCache.get(cacheKey);
    if (existing) {
        return acquireHandle(existing, region);
    }

    let inflight = kitInflight.get(cacheKey);
    if (!inflight) {
        const task = runKitWorker(region, sources);
        const created: InflightEntry = {
            waiters: 0,
            cancel: task.cancel,
            promise: task.promise.then((data) => {
                if (kitInflight.get(cacheKey) === created) {
                    kitInflight.delete(cacheKey);
                }
                if (data && !kitCache.has(cacheKey)) {
                    const entry: CacheEntry = {
                        key: cacheKey,
                        data,
                        refs: 0,
                        evictTimer: null,
                    };
                    kitCache.set(cacheKey, entry);
                    // Schedule cleanup in case every waiter aborted right before resolution.
                    entry.evictTimer = setTimeout(() => {
                        entry.evictTimer = null;
                        if (entry.refs === 0 && kitCache.get(cacheKey) === entry) {
                            kitCache.delete(cacheKey);
                            revokeAllUrls(entry.data.blobUrls);
                        }
                    }, CACHE_RELEASE_GRACE_MS);
                } else if (data) {
                    revokeAllUrls(data.blobUrls);
                }
                return data;
            }),
        };
        kitInflight.set(cacheKey, created);
        inflight = created;
    }

    inflight.waiters += 1;
    let waiterCleaned = false;
    const detachWaiter = () => {
        if (waiterCleaned || !inflight) return;
        waiterCleaned = true;
        inflight.waiters = Math.max(0, inflight.waiters - 1);
        if (inflight.waiters === 0 && kitInflight.get(cacheKey) === inflight) {
            kitInflight.delete(cacheKey);
            inflight.cancel();
        }
    };

    try {
        const result = await new Promise<InternalKitData | null>((resolve) => {
            if (signal?.aborted) {
                resolve(null);
                return;
            }
            const onAbort = () => {
                detachWaiter();
                resolve(null);
            };
            signal?.addEventListener("abort", onAbort, { once: true });
            void inflight!.promise.then((data) => {
                signal?.removeEventListener("abort", onAbort);
                if (signal?.aborted) {
                    resolve(null);
                } else {
                    resolve(data);
                }
            });
        });

        if (!result || signal?.aborted) {
            return null;
        }

        const cachedEntry = kitCache.get(cacheKey);
        if (!cachedEntry) return null;
        return acquireHandle(cachedEntry, region);
    } finally {
        if (!waiterCleaned) {
            waiterCleaned = true;
            inflight.waiters = Math.max(0, inflight.waiters - 1);
        }
    }
}
