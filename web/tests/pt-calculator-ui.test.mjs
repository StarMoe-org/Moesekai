import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { PT_MUSIC_METAS } from "./fixtures/pt-calculator.mjs";

// Render the actual page, shared song selector and MD3 inputs with local data fixtures.
const require = createRequire(import.meta.url);
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const { window } = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://pjsk.moe/pt-calculator" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MouseEvent", "KeyboardEvent", "getComputedStyle"]) {
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
window.HTMLElement.prototype.scrollIntoView = function () {};
const frames = new Map();
let frameId = 0;
globalThis.requestAnimationFrame = window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = window.cancelAnimationFrame = (id) => frames.delete(id);
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const modules = new Map();
let metadata = [];
let failMetadata = false;
const musics = [
    { id: 74, title: "独りんぼエンヴィー" },
    { id: 226, title: "ロストエンファウンド" },
    { id: 448, title: "Sage" },
    { id: 9999, title: "Other chart" },
    { id: 9988, title: "Missing chart" },
].map((music) => ({ ...music, pronunciation: music.title, seq: music.id, publishedAt: 0, assetbundleName: String(music.id), lyricist: "", composer: "" }));
const matchesLevel = () => true;
const mocks = {
    "@/components/MainLayout": { __esModule: true, default: ({ children }) => children },
    "@/components/LocalizedLink": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "./Progress": { LoadingIndicator: () => null, LinearProgress: () => React.createElement("div", { role: "progressbar" }) },
    "next/image": { __esModule: true, default: (props) => {
        const attributes = { ...props };
        delete attributes.fill;
        delete attributes.unoptimized;
        return React.createElement("img", attributes);
    } },
    "@/contexts/ThemeContext": { useTheme: () => ({ assetSource: "test", isShowSpoiler: false }) },
    "@/lib/assets": { getMusicJacketUrl: (bundle) => `https://example.test/${bundle}.png` },
    "@/lib/translations": { loadTranslations: async () => null },
    "@/lib/fetch": {
        fetchMusicMetas: async () => {
            if (failMetadata) throw new Error("Metadata unavailable");
            return metadata;
        },
        fetchMasterDataForServer: async (_server, file) => file === "musics.json" ? musics : [],
    },
    "@/components/common/Modal": { __esModule: true, default: ({ isOpen, title, children }) => isOpen ? React.createElement("div", { role: "dialog", "aria-label": title }, children) : null },
    "@/components/music/MusicFilters": {
        __esModule: true,
        default: ({ searchQuery, onSearchChange }) => React.createElement("input", { type: "search", value: searchQuery, onChange: (event) => onSearchChange(event.target.value) }),
        useMusicLevelFilter: () => ({ matches: matchesLevel, difficulties: [], range: null, bounds: [1, 100] }),
    },
};
function loadSource(relativePath) {
    const filename = path.resolve(webRoot, relativePath);
    if (modules.has(filename)) return modules.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
        fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        reportDiagnostics: true,
    });
    assert.equal((compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
    const compiledModule = { exports: {} };
    modules.set(filename, compiledModule);
    const resolve = (id) => {
        if (mocks[id]) return mocks[id];
        if (id.startsWith("@/") || id.startsWith(".")) {
            const base = id.startsWith("@/") ? path.resolve(webRoot, id.replace("@/", "src/")) : path.resolve(path.dirname(filename), id);
            const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => /\.(ts|tsx)$/.test(candidate) && existsSync(candidate));
            assert.ok(resolved, `Cannot resolve ${id}`);
            return loadSource(resolved);
        }
        return require(id);
    };
    new Function("require", "exports", "module", compiled.outputText)(resolve, compiledModule.exports, compiledModule);
    return compiledModule.exports;
}
const messages = loadSource("src/lib/i18n/messages/zh-CN/pt-calculator.ts").ptCalculatorMessages;
mocks["@/contexts/I18nContext"] = {
    useI18n: () => ({
        t: (key, values = {}) => {
            if (key.startsWith("page.deckComparator.difficulties.")) return key.split(".").at(-1).toUpperCase();
            const message = key === "common.action.reset" ? "重置" : messages[key.replace("page.ptCalculator.", "")] ?? key;
            return message.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
        },
        formatNumber: (value) => new Intl.NumberFormat("zh-CN").format(value),
    }),
};
mocks["@/components/md3"] = Object.assign({}, mocks["./Progress"], ...["Patterns", "Button", "Icon", "Segmented", "Select", "TextField"].map((name) => loadSource(`src/components/md3/${name}.tsx`)));
metadata = [...PT_MUSIC_METAS];
metadata.push(...["expert", "master"].map((difficulty) => ({
    music_id: 9999, difficulty, base_score: 1, fever_score: 0.5, event_rate: 125,
    skill_score_multi: Array(6).fill(difficulty === "expert" ? 0.125 : 0.25), skill_score_solo: Array(6).fill(0.125),
})));
const calculator = loadSource("src/lib/pt-calculator/calculator.ts");
const calculatePtRange = calculator.calculatePtRange;
let calculationCalls = 0;
calculator.calculatePtRange = (...args) => { calculationCalls++; return calculatePtRange(...args); };
const PtCalculator = loadSource("src/app/pt-calculator/client.tsx").default;
let root;
const button = (text) => [...document.querySelectorAll("button")].find((node) => node.textContent === text);
const inputs = () => [...document.querySelectorAll("input")];
const results = () => [...document.querySelectorAll("h2")].find((node) => node.textContent === messages.results);
async function flushFrames() {
    for (let turn = 0; turn < 4 && frames.size; turn++) await act(async () => {
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback(performance.now()));
    });
}
async function render(query = "") {
    window.history.replaceState({}, "", `/pt-calculator${query}`);
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(PtCalculator)));
    await flushFrames();
}
async function click(node) {
    assert.ok(node);
    await act(async () => node.click());
    await flushFrames();
}
async function input(node, value) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(node, value);
        node.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await flushFrames();
}
async function fill() {
    for (const [index, value] of ["368953", "435", "248", "260", "250", "260", "260", "248"].entries()) await input(inputs()[index], value);
}
afterEach(async () => {
    if (root) await act(async () => root.unmount());
    root = undefined;
    frames.clear();
    calculationCalls = 0;
    failMetadata = false;
});

test("initial form has no numeric defaults, steppers, explanation or premature errors", async () => {
    await render();
    assert.equal(inputs().length, 8);
    assert.ok(inputs().every((node) => node.value === "" && node.type === "text"));
    assert.equal(inputs()[0].inputMode, "numeric");
    assert.equal(inputs()[1].inputMode, "decimal");
    const selectors = [...document.querySelectorAll('[role="combobox"]')];
    assert.ok([...document.querySelectorAll("button")].some((node) => node.textContent.includes("独りんぼエンヴィー")));
    assert.ok(selectors[0].textContent.includes("EXPERT"));
    assert.ok(selectors[1].textContent.includes("10 火"));
    assert.ok(!document.body.textContent.includes("计算说明"));
    assert.equal(document.querySelector("header p"), null);
    assert.ok(!document.body.textContent.includes("3.48"));
    assert.ok(!document.body.textContent.includes("同实效"));
    assert.equal(button("重置"), undefined);
    assert.ok(button(messages.calculate));
    assert.ok([...document.querySelectorAll("label")].every((node) => !node.textContent.includes("*")));
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.ok(!results());
    assert.equal(calculationCalls, 0);
});

test("calculate button and results alternate after submitting and editing inputs", async () => {
    await render();
    await fill();
    assert.ok(!results());
    assert.ok(button(messages.calculate));
    assert.equal(calculationCalls, 0);
    await click(button(messages.calculate));
    assert.ok(results());
    assert.equal(button(messages.calculate), undefined);
    assert.equal(calculationCalls, 1);
    assert.ok(document.body.textContent.includes("96,775 ~ 97,370"));
    assert.ok(document.body.textContent.includes("6,860,681 ~ 6,923,403"));
    assert.ok(!document.body.textContent.includes("理论预估值"));
    await input(inputs()[1], "0");
    assert.ok(!results());
    assert.ok(button(messages.calculate));
    assert.equal(calculationCalls, 1);
    await click(button(messages.calculate));
    assert.ok(results());
    assert.equal(button(messages.calculate), undefined);
    assert.equal(calculationCalls, 2);
    assert.ok(!document.body.textContent.includes("96,775 ~ 97,370"));
});

test("empty and out-of-range inputs show validation only on submit", async () => {
    await render();
    await click(button(messages.calculate));
    assert.ok(document.querySelector('[role="alert"]').textContent.includes(messages.incomplete));
    assert.ok(!results());
    assert.ok(button(messages.calculate));
    assert.equal(calculationCalls, 0);
    await fill();
    await input(inputs()[2], "289");
    await click(button(messages.calculate));
    assert.ok(document.querySelector('[role="alert"]').textContent.includes(messages.invalidSkills));
    assert.ok(button(messages.calculate));
    assert.equal(calculationCalls, 0);
    await input(inputs()[2], "9.99");
    await click(button(messages.calculate));
    assert.ok(document.querySelector('[role="alert"]').textContent.includes(messages.invalidSkills));
    assert.equal(calculationCalls, 0);
    await input(inputs()[2], "10");
    await click(button(messages.calculate));
    assert.ok(results());
    await input(inputs()[0], "1000001");
    await click(button(messages.calculate));
    assert.ok(document.body.textContent.includes(messages.invalidPower));
    assert.ok(!results());
    assert.ok(button(messages.calculate));
    assert.equal(calculationCalls, 1);
    await input(inputs()[0], "1000000");
    await click(button(messages.calculate));
    assert.ok(results());
    assert.equal(button(messages.calculate), undefined);
    assert.equal(calculationCalls, 2);
});

test("URL inputs wait for calculation and editing preserves other inputs and query parameters", async () => {
    await render("?power=368953&bonus=435&effectiveSkills=248,260,250,260,260,248&unrelated=keep");
    assert.equal(inputs()[2].value, "248");
    assert.ok(!results());
    assert.ok(button(messages.calculate));
    assert.equal(calculationCalls, 0);
    await click(button(messages.calculate));
    assert.ok(results());
    assert.equal(button(messages.calculate), undefined);
    await input(inputs()[2], "250");
    assert.equal(inputs()[0].value, "368953");
    assert.equal(inputs()[1].value, "435");
    assert.equal(inputs()[3].value, "260");
    assert.ok(!results());
    assert.ok(button(messages.calculate));
    assert.equal(new URL(window.location.href).searchParams.get("unrelated"), "keep");
    assert.equal(new URL(window.location.href).searchParams.get("effectiveSkills"), "250,260,250,260,260,248");
});

test("solo encore follows the leader and cannot be clicked or focused; co-op encore remains editable", async () => {
    await render("?grouping=all");
    assert.equal(inputs().length, 8);
    await input(inputs()[2], "248");
    assert.equal(inputs()[3].value, "");
    assert.equal(new URL(window.location.href).searchParams.get("effectiveSkills"), "248,,,,,");
    assert.equal(new URL(window.location.href).searchParams.has("grouping"), false);
    await click(button(messages.solo));
    assert.ok(inputs().slice(2).every((node) => node.value === ""));
    await input(inputs()[2], "150");
    assert.equal(inputs()[7].value, "150");
    assert.equal(inputs()[7].disabled, true);
    await act(async () => {
        inputs()[2].focus();
        inputs()[7].focus();
    });
    assert.equal(document.activeElement, inputs()[2]);
    await click(inputs()[7]);
    assert.equal(document.activeElement, inputs()[2]);
    assert.ok(!results());
    assert.equal(calculationCalls, 0);
    await click(button(messages.multi));
    assert.equal(inputs()[7].disabled, false);
    await act(async () => inputs()[7].focus());
    assert.equal(document.activeElement, inputs()[7]);
    await input(inputs()[7], "200");
    assert.equal(inputs()[7].value, "200");
    assert.equal(inputs()[2].value, "");
});

test("the shared selector searches all songs and calculation uses the selected song and difficulty", async () => {
    await render();
    await fill();
    await click([...document.querySelectorAll("button")].find((node) => node.textContent.includes("独りんぼエンヴィー")));
    await click(button("page.deckRecommend.selector.switchToAll"));
    await input(document.querySelector('input[type="search"]'), "Other chart");
    const title = [...document.querySelectorAll('[role="dialog"] h3')].find((node) => node.textContent === "Other chart");
    await click(title);
    assert.equal(new URL(window.location.href).searchParams.get("song"), "9999");
    assert.ok(!results());
    assert.equal(calculationCalls, 0);
    await click(button(messages.calculate));
    assert.ok(results());
    assert.equal(button(messages.calculate), undefined);
    assert.ok(!document.body.textContent.includes("96,775 ~ 97,370"));
    const expertResult = document.querySelector("dl").textContent;
    await click(document.querySelector('[role="combobox"]'));
    await click([...document.querySelectorAll('[role="option"]')].find((node) => node.textContent.includes("MASTER")));
    assert.ok(!results());
    assert.ok(button(messages.calculate));
    assert.equal(new URL(window.location.href).searchParams.get("difficulty"), "master");
    await click(button(messages.calculate));
    assert.equal(button(messages.calculate), undefined);
    assert.notEqual(document.querySelector("dl").textContent, expertResult);
});

test("missing chart data blocks calculation instead of falling back to the default song", async () => {
    await render("?song=9988");
    await fill();
    assert.equal(button(messages.calculate).disabled, true);
    assert.ok(document.body.textContent.includes(messages.noMeta));
    await click(button(messages.calculate));
    assert.ok(!results());
    assert.equal(calculationCalls, 0);
});

test("failed metadata loads can be retried before calculating", async (context) => {
    context.mock.method(console, "error", () => {});
    failMetadata = true;
    await render();
    assert.ok(document.body.textContent.includes(messages.dataLoadFailed));
    assert.equal(button(messages.calculate).disabled, true);
    failMetadata = false;
    await click(button("common.action.retry"));
    assert.ok(!document.body.textContent.includes(messages.dataLoadFailed));
    assert.equal(button(messages.calculate).disabled, false);
    assert.ok(!results());
    await fill();
    await click(button(messages.calculate));
    assert.ok(results());
});
