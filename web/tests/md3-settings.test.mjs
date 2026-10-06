import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";
import "./ui-regressions.test.mjs";

test("corner morph transitions use bounded easing instead of spring overshoot", () => {
    const files = [
        "components/md3/Button.tsx", "components/md3/Segmented.tsx",
        "components/SettingsPanel.tsx", "components/home/SetupGuide.tsx",
        "app/design-system/client.tsx", "app/page.tsx",
        "app/cards/[id]/client.tsx", "app/music/[id]/client.tsx", "app/lyrics/[musicId]/client.tsx",
    ];
    for (const file of files) {
        const source = readFileSync(path.join(webRoot, "src", file), "utf8");
        const transitions = source.split("\n").filter((line) => /transition-\[[^\]]*border-radius/.test(line));
        assert.ok(transitions.length > 0, `${file} has a corner morph`);
        for (const line of transitions) {
            assert.match(line, /ease-md3-standard/, `${file} must use bounded corner easing`);
            assert.doesNotMatch(line, /ease-md3-spatial/, `${file} must not overshoot its corner radius`);
        }
    }
    const tokens = readFileSync(path.join(webRoot, "src/styles/md3-tokens.css"), "utf8");
    const curve = tokens.match(/--ease-md3-standard:\s*cubic-bezier\(([^)]+)\)/);
    assert.ok(curve);
    for (const coordinate of curve[1].split(",").map(Number)) {
        assert.ok(coordinate >= 0 && coordinate <= 1, "standard easing stays within its endpoints");
    }
});

const require = createRequire(import.meta.url);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { window } = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://pjsk.moe/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MouseEvent", "KeyboardEvent", "getComputedStyle"]) {
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const frames = new Map();
let frameId = 0;
globalThis.requestAnimationFrame = window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = window.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.CSS = { escape: String };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const h = React.createElement;
let wide = true;
let selected = "21";
const noop = () => {};
const motionDiv = React.forwardRef(function MotionDiv({ children, ...props }, ref) {
    for (const key of ["initial", "animate", "exit", "transition", "drag", "dragConstraints", "dragElastic", "onDragEnd"]) delete props[key];
    return h("div", { ...props, ref }, children);
});
const mocks = {
    "next/navigation": { usePathname: () => "/" },
    "framer-motion": { AnimatePresence: ({ children }) => children, motion: { div: motionDiv }, useReducedMotion: () => true },
    "@/contexts/I18nContext": { useI18n: () => ({ t: (key, values) => values?.name ? `${key}: ${values.name}` : key, locale: "en-US", setLocale: noop }) },
    "@/contexts/ThemeContext": { CHAR_COLORS: { 21: "#33ccbb", 22: "#ffee11" }, useTheme: () => ({ themeCharId: selected, setThemeCharacter: (id) => { selected = id; }, colorSchemePreference: "system", serverSource: "tw", assetSource: "main" }) },
    "@/contexts/MasterDataContext": { useMasterData: () => ({ cloudVersion: "1", localVersion: "1", forceRefreshData: noop }) },
    "@/hooks/useMediaQuery": { useMediaQuery: () => wide },
    "@/lib/assets": { MOE_LOGO_URL: "/logo.svg", getCharacterIconUrl: (id) => `/characters/${id}.png` },
    "@/lib/ads": { ADS_SETTINGS_VISIBLE: false },
    "@/types/types": { UNIT_DATA: [{ id: "vs", charIds: [21, 22] }], UNIT_ID_LABEL_KEYS: { vs: "unit.vs" } },
    "@/lib/i18n": { getCharacterName: (_t, id) => `Character ${id}`, SUPPORTED_UI_LOCALES: ["en-US", "ja-JP"], UI_LOCALE_LABELS: { "en-US": "English", "ja-JP": "日本語" } },
    "@/components/common/ServerRegion": { ServerRegionLabel: ({ server, label }) => h("span", { "data-server": server }, label), getServerDisplayCode: (server) => server === "tw" ? "HMT" : server.toUpperCase() },
    "@/components/LocalizedLink": { __esModule: true, default: ({ prefetch: _prefetch, children, ...props }) => h("a", props, children) },
};
const modules = new Map();
function loadSource(relativePath) {
    const filename = path.resolve(webRoot, relativePath);
    if (modules.has(filename)) return modules.get(filename).exports;
    const result = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
    const compiledModule = { exports: {} };
    modules.set(filename, compiledModule);
    const resolve = (id) => {
        if (mocks[id]) return mocks[id];
        if (id.startsWith("@/") || id.startsWith(".")) {
            const base = id.startsWith("@/") ? path.resolve(webRoot, id.replace("@/", "src/")) : path.resolve(path.dirname(filename), id);
            for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(`${base}${ext}`)) return loadSource(`${base}${ext}`);
        }
        return require(id);
    };
    new Function("require", "exports", "module", result.outputText)(resolve, compiledModule.exports, compiledModule);
    return compiledModule.exports;
}
// Keep the real primitives, Sheet and overlay lifecycle under test.
const md3 = (name) => loadSource(`src/components/md3/${name}.tsx`);
mocks["@/components/md3"] = { ...md3("Sheet"), ...md3("Icon"), ...md3("Button"), ...md3("Segmented"), ...md3("Selection"), ...md3("Progress"), ...md3("Patterns"), ...loadSource("src/components/md3/cn.ts") };
const SettingsPanel = loadSource("src/components/SettingsPanel.tsx").default;
// Isolate homepage layout persistence from network-fed content; keep its state,
// controls and Dialog real so remounts exercise the browser-storage contract.
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: window.localStorage });
mocks["@/components/md3"].Dialog = md3("Dialog").Dialog;
mocks["@/components/MainLayout"] = { __esModule: true, default: ({ children }) => h("main", null, children) };
mocks["@/components/ExternalLink"] = mocks["@/components/LocalizedLink"];
for (const name of ["SetupGuide", "HeroCarousel", "CurrentEventTab", "LatestCardsTab", "LatestMusicTab", "UpcomingLiveTab", "AnnouncementSection", "BirthdaySection"]) {
    mocks[`@/components/home/${name}`] = { __esModule: true, default: () => null };
}
const Home = loadSource("src/app/page.tsx").default;
mocks["next/image"] = { __esModule: true, default: ({ alt, fill: _fill, unoptimized: _unoptimized, ...props }) => h("img", { alt, ...props }) };
mocks["@/components/common/BaseFilters"] = {
    __esModule: true,
    default: ({ children }) => h("div", null, children),
    FilterSection: ({ label, children }) => h("section", { "aria-label": label }, children),
    FilterToggle: () => null,
    getFilterChipStateClasses: (selected) => selected ? "selected" : "unselected",
    getFilterIconStateClasses: () => "",
};
const { default: MusicFilters, useMusicLevelFilter, parseMusicDifficulties, parseMusicLevelRange, parseMusicLevelParams } = loadSource("src/components/music/MusicFilters.tsx");
const { NavigationDrawerItem } = md3("Navigation");
const { SideSheet } = md3("Sheet");
const { Menu } = md3("Menu");
let root;
const host = document.getElementById("root");
async function flush() {
    for (let i = 0; i < 5 && frames.size; i++) await act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(performance.now())); });
}
async function render(element) { root ??= createRoot(host); await act(async () => root.render(element)); await flush(); }
async function click(node) { assert.ok(node); await act(async () => node.click()); await flush(); }
async function key(node, value) { await act(async () => node.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }))); await flush(); }
afterEach(async () => { if (root) await act(async () => root.unmount()); root = undefined; frames.clear(); wide = true; selected = "21"; document.body.style.overflow = ""; window.localStorage.clear(); });

test("music range parsers reject invalid state and accept one-sided URL limits", () => {
    assert.deepEqual(parseMusicDifficulties("master,expert,master,unknown"), ["expert", "master"]);
    assert.deepEqual(parseMusicDifficulties([]), []);
    assert.deepEqual(parseMusicDifficulties("unknown"), []);
    assert.deepEqual(parseMusicLevelRange([1, 40]), [1, 40]);
    for (const value of [null, [], [1], ["1", 40], [0, 40], [1, 101], [30, 20], [2.5, 30]]) assert.equal(parseMusicLevelRange(value), null);
    for (const [query, expected] of [["", null], ["difficultyMin=5", [5, 100]], ["difficultyMax=30", [1, 30]], ["difficultyMin=30&difficultyMax=30", [30, 30]], ["difficultyMin=abc", null], ["difficultyMin=31&difficultyMax=30", null]]) {
        assert.deepEqual(parseMusicLevelParams(new URLSearchParams(query)), expected);
    }
});

const musicCharts = [
    { musicId: 1, musicDifficulty: "expert", playLevel: 25 },
    { musicId: 1, musicDifficulty: "master", playLevel: 30 },
    { musicId: 2, musicDifficulty: "master", playLevel: 26 },
    { musicId: 3, musicDifficulty: "append", playLevel: 26 },
    { musicId: 4, musicDifficulty: "expert", playLevel: 0 },
    { musicId: 5, musicDifficulty: "expert", playLevel: NaN },
];

test("music difficulty filtering uses OR with inclusive levels and empty selection includes all difficulties", async () => {
    let filter;
    function Harness({ charts = musicCharts }) {
        const current = useMusicLevelFilter(charts);
        React.useEffect(() => { filter = current; });
        return null;
    }
    await render(h(Harness));
    assert.equal(filter.matches(999), true, "unfiltered songs need not have loaded charts");
    await act(async () => filter.setRange([25, 26]));
    await act(async () => filter.changeDifficulties(["master"]));
    assert.deepEqual(filter.range, [25, 26], "selecting a difficulty preserves the chosen level range");
    assert.deepEqual([1, 2, 3, 4, 5].filter(filter.matches), [2]);
    await act(async () => filter.changeDifficulties(["expert", "master"]));
    assert.deepEqual(filter.range, [25, 26]);
    assert.deepEqual([1, 2, 3, 4, 5].filter(filter.matches), [1, 2], "either selected difficulty may match, but absent/zero/NaN charts cannot");
    await act(async () => filter.changeDifficulties([]));
    assert.deepEqual(filter.range, [25, 26], "clearing difficulty selection still applies the chosen range to all difficulties");
    assert.deepEqual([1, 2, 3, 4, 5].filter(filter.matches), [1, 2, 3]);
    await act(async () => filter.setRange([26, 26]));
    assert.deepEqual([1, 2, 3].filter(filter.matches), [2, 3], "both range boundaries are inclusive");
    await act(async () => filter.changeDifficulties(["master"]));
    assert.deepEqual(filter.range, [26, 26]);
    assert.deepEqual([1, 2, 3].filter(filter.matches), [2]);
    await act(async () => filter.reset());
    assert.deepEqual(filter.difficulties, []);
    assert.equal(filter.range, null);
});

test("music range restored before chart loading is not clamped away when data arrives", async () => {
    let filter;
    function Harness({ charts }) {
        const current = useMusicLevelFilter(charts, ["master"], [1, 100]);
        React.useEffect(() => { filter = current; });
        return null;
    }
    await render(h(Harness, { charts: [] }));
    assert.deepEqual(filter.range, [1, 100]);
    await render(h(Harness, { charts: musicCharts }));
    assert.deepEqual(filter.range, [1, 100]);
    assert.deepEqual(filter.bounds, [1, 100]);
    assert.equal(filter.matches(2), true);
});

test("MusicFilters retains an empty multi-selection and renders a single double-ended range track", async () => {
    let selection;
    function Harness() {
        const filter = useMusicLevelFilter(musicCharts);
        React.useEffect(() => { selection = filter.difficulties; }, [filter.difficulties]);
        return h(MusicFilters, {
            selectedTag: "all", selectedCategories: [], onTagChange: noop, onCategoryChange: noop,
            hasEventOnly: false, onHasEventOnlyChange: noop, searchQuery: "", onSearchChange: noop,
            sortBy: "publishedAt", sortOrder: "desc", onSortChange: noop, onReset: filter.reset,
            totalMusics: 5, filteredMusics: 5, selectedDifficulties: filter.difficulties,
            onDifficultiesChange: filter.changeDifficulties, difficultyRange: filter.range,
            difficultyBounds: filter.bounds, onDifficultyRangeChange: filter.setRange,
        });
    }
    await render(h(Harness));
    const section = host.querySelector('[aria-label="common.filter.difficulty"]');
    const buttons = [...section.querySelectorAll("button")];
    assert.equal(buttons.length, 6);
    assert.ok(buttons.every((button) => button.getAttribute("aria-pressed") === "false"));
    assert.equal(section.querySelectorAll('[data-range-slider="true"]').length, 1);
    assert.equal(section.querySelectorAll('input[type="range"]').length, 2);
    const master = buttons.find((button) => button.textContent === "MASTER");
    await click(master);
    assert.deepEqual(selection, ["master"]);
    await click(master);
    assert.deepEqual(selection, [], "deselecting the last difficulty leaves no selection rather than auto-checking every chip");
    assert.ok(buttons.every((button) => button.getAttribute("aria-pressed") === "false"));
});

const homeStorageKey = "home_dynamic_sections";
const visibleHomeSections = () => [...host.querySelectorAll('section[aria-labelledby^="home-section-"]')].map((node) => node.getAttribute("aria-labelledby").replace("home-section-", ""));
const buttonWithText = (text) => [...document.querySelectorAll("button")].find((node) => node.textContent === text);

test("home customization restores saved layout before writing and persists hide/order/reset across remounts", async () => {
    window.localStorage.setItem("moesekai_setup_completed", "true");
    const initial = { order: ["music", "event", "cards", "live"], hidden: ["cards"] };
    window.localStorage.setItem(homeStorageKey, JSON.stringify(initial));
    root = createRoot(host);
    await act(async () => root.render(h(Home)));
    assert.deepEqual(JSON.parse(window.localStorage.getItem(homeStorageKey)), initial, "initial effects must not overwrite stored preferences with defaults");
    await flush();
    assert.deepEqual(visibleHomeSections(), ["music", "event", "live"]);
    await click(buttonWithText("page.home.customize.open"));
    const checkboxes = [...document.querySelectorAll('[role="dialog"] input[type="checkbox"]')];
    assert.equal(checkboxes.length, 4);
    assert.equal(checkboxes[2].checked, false);
    await click(checkboxes[2]);
    await click(document.querySelector('[aria-label="page.home.customize.moveDown"]'));
    assert.deepEqual(JSON.parse(window.localStorage.getItem(homeStorageKey)), { order: ["event", "music", "cards", "live"], hidden: [] });
    await act(async () => root.unmount());
    root = undefined;
    await render(h(Home));
    assert.deepEqual(visibleHomeSections(), ["event", "music", "cards", "live"]);
    await click(buttonWithText("page.home.customize.open"));
    await click(buttonWithText("page.home.customize.reset"));
    assert.deepEqual(JSON.parse(window.localStorage.getItem(homeStorageKey)), { order: ["event", "cards", "music", "live"], hidden: [] });
});

test("home customization rejects corrupted data and fills missing or duplicate section IDs", async () => {
    window.localStorage.setItem("moesekai_setup_completed", "true");
    for (const [saved, expected] of [
        ["{invalid", ["event", "cards", "music", "live"]],
        ["null", ["event", "cards", "music", "live"]],
        [JSON.stringify({ order: ["live", "invalid", "live"], hidden: ["invalid", "event"] }), ["live", "cards", "music"]],
    ]) {
        window.localStorage.setItem(homeStorageKey, saved);
        await render(h(Home));
        assert.deepEqual(visibleHomeSections(), expected);
        await act(async () => root.unmount());
        root = undefined;
    }
});

test("settings: floating desktop sheet, one history owner, disclosure reset and persistent theme", async () => {
    const historyLength = window.history.length;
    const view = (open) => h(SettingsPanel, { isOpen: open, onClose: noop });
    await render(view(true));
    const panel = document.querySelector('[role="dialog"]');
    assert.match(panel.className, /rounded-md3-xl/);
    assert.match(panel.className, /w-\[480px\]/);
    assert.match(panel.parentElement.className, /p-3/);
    assert.equal(document.body.style.overflow, "hidden");
    assert.equal(window.history.length, historyLength);
    const toggle = panel.querySelector("button[aria-expanded]");
    const options = document.getElementById(toggle.getAttribute("aria-controls"));
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(options.hidden, true);
    await click(toggle);
    assert.equal(options.hidden, false);
    await click(options.querySelector('[aria-label="Character 22"]'));
    assert.equal(selected, "22");
    await render(view(false));
    assert.equal(document.body.style.overflow, "");
    await render(view(true));
    assert.equal(document.querySelector("button[aria-expanded]").getAttribute("aria-expanded"), "false");
    assert.match(document.querySelector("button[aria-expanded]").textContent, /Character 22/);
    assert.equal(window.history.length, historyLength);
});

test("settings: narrow viewport uses BottomSheet and Escape closes through overlay", async () => {
    wide = false;
    let closed = 0;
    await render(h(SettingsPanel, { isOpen: true, onClose: () => closed++ }));
    assert.match(document.querySelector('[role="dialog"]').className, /rounded-t-md3-xl/);
    await key(document.activeElement, "Escape");
    assert.equal(closed, 1);
});

test("settings: four tabs, plain language labels and stable server codes remain available", async () => {
    await render(h(SettingsPanel, { isOpen: true, onClose: noop }));
    assert.equal(document.querySelectorAll('[role="tab"]').length, 4);
    const radios = [...document.querySelectorAll('input[type="radio"]')];
    assert.equal(radios.length, 2);
    assert.match(document.querySelector('[role="radiogroup"][aria-label="settings.uiLanguage.label"]').textContent, /English/);
    assert.equal(document.querySelector('[role="radiogroup"][aria-label="settings.uiLanguage.label"] svg'), null);
    await click([...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent.includes("settings.sections.data")));
    assert.deepEqual([...document.querySelectorAll('[data-server]')].map((node) => node.dataset.server), ["en", "jp", "cn", "tw", "kr"]);
    assert.match(document.querySelector('[role="dialog"]').textContent, /settings.serverSource.tw/);
    assert.match(document.querySelector('[role="dialog"]').textContent, /settings.refresh.idle/);
    await click([...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent.includes("settings.sections.content")));
    assert.match(document.querySelector('[role="dialog"]').textContent, /settings.translation.label/);
});

test("navigation: compact sizes, touch target, active state and keyboard index survive", async () => {
    await render(h(NavigationDrawerItem, { href: "/cards", label: "Cards", icon: "M0 0", density: "compact", active: true, dataAttrs: { "data-nav-index": 7 } }));
    const item = host.querySelector("a");
    assert.match(item.className, /lg:h-10/);
    assert.match(item.className, /any-pointer:coarse/);
    assert.equal(item.getAttribute("aria-current"), "page");
    assert.equal(item.dataset.navIndex, "7");
    assert.equal(item.querySelector("svg").getAttribute("width"), "20");
});

test("SideSheet: floating is opt-in and nested menu Escape does not close its parent", async () => {
    let parentCloses = 0;
    function Example() {
        return h(SideSheet, { isOpen: true, onClose: () => parentCloses++, syncHistory: false, title: "Sheet" },
            h(Menu, { anchor: (props) => h("button", props, "Menu"), items: [{ key: "option", label: "Option", onSelect: noop }] }));
    }
    await render(h(Example));
    assert.match(document.querySelector('[role="dialog"]').className, /rounded-l-md3-lg/);
    await click([...document.querySelectorAll("button")].find((node) => node.textContent === "Menu"));
    assert.ok(document.querySelector('[role="menu"]'));
    await key(document.activeElement, "Escape");
    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.equal(parentCloses, 0);
    await key(document.activeElement, "Escape");
    assert.equal(parentCloses, 1);
});
