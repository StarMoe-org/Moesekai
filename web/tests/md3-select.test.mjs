import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";

// Exercise real React DOM and overlay logic without emitting files or adding dependencies.
const require = createRequire(import.meta.url);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { window } = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://pjsk.moe/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MouseEvent", "KeyboardEvent", "CompositionEvent", "getComputedStyle"]) {
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const frames = new Map();
let frameId = 0;
globalThis.requestAnimationFrame = window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = window.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.CSS = { escape: (value) => Array.from(String(value), (char) => `\\${char.codePointAt(0).toString(16)} `).join("") };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const scrolled = [];
window.HTMLElement.prototype.scrollIntoView = function (options) { scrolled.push({ node: this, options }); };
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const h = React.createElement;
const modules = new Map();
const motionDiv = React.forwardRef(function MotionDiv({ children, ...props }, ref) {
    for (const key of ["initial", "animate", "exit", "transition", "drag", "dragConstraints", "dragElastic", "onDragEnd"]) delete props[key];
    return h("div", { ...props, ref }, children);
});
const mocks = {
    "framer-motion": { AnimatePresence: ({ children }) => children, motion: { div: motionDiv }, useReducedMotion: () => true },
    "@/contexts/I18nContext": { useI18n: () => ({ t: (key) => key, locale: "en-US" }) },
    "@/components/LocalizedLink": { __esModule: true, default: function LocalizedLink({ children, prefetch: _prefetch, ...props }) { return h("a", props, children); } },
    "next/navigation": { usePathname: () => "/" },
};
function loadSource(relativePath) {
    const filename = path.resolve(webRoot, relativePath);
    if (modules.has(filename)) return modules.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
        fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        reportDiagnostics: true,
    });
    assert.equal((compiled.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
    const compiledModule = { exports: {} };
    modules.set(filename, compiledModule);
    const resolve = (id) => {
        if (mocks[id]) return mocks[id];
        if (id.startsWith("@/") || id.startsWith(".")) {
            const base = id.startsWith("@/") ? path.resolve(webRoot, id.replace("@/", "src/")) : path.resolve(path.dirname(filename), id);
            for (const ext of [".ts", ".tsx"]) {
                try { return loadSource(path.relative(webRoot, `${base}${ext}`)); }
                catch (error) { if (error.code !== "ENOENT") throw error; }
            }
            throw new Error(`Cannot resolve ${id}`);
        }
        return require(id);
    };
    new Function("require", "exports", "module", compiled.outputText)(resolve, compiledModule.exports, compiledModule);
    return compiledModule.exports;
}
const { Select, calculateSelectPosition } = loadSource("src/components/md3/Select.tsx");
const { BottomSheet, SideSheet } = loadSource("src/components/md3/Sheet.tsx");
const { Dialog } = loadSource("src/components/md3/Dialog.tsx");
const { Menu } = loadSource("src/components/md3/Menu.tsx");
const host = document.getElementById("root");
let root;
const options = [{ value: "a", label: "Apple" }, { value: "b", label: "Banana", disabled: true }, { value: "c", label: "Cherry" }, { value: "d", label: "Date" }];
const combo = () => document.querySelector('[role="combobox"]');
const list = () => document.querySelector('[role="listbox"]');
const choices = () => [...document.querySelectorAll('[role="option"]')];
const active = () => document.getElementById(combo().getAttribute("aria-activedescendant"));
function focused(node) { assert.ok(document.activeElement === node, "DOM focus must remain on the expected node"); }
async function flushFrames() {
    for (let turn = 0; turn < 4 && frames.size; turn++) await act(async () => {
        const pending = [...frames.values()]; frames.clear();
        for (const callback of pending) callback(performance.now());
    });
}
async function render(element) { root ??= createRoot(host); await act(async () => root.render(element)); await flushFrames(); }
async function click(node) { assert.ok(node); await act(async () => node.click()); await flushFrames(); }
async function key(node, value, options = {}) {
    const event = new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options });
    await act(async () => node.dispatchEvent(event)); await flushFrames(); return event;
}
async function input(node, value) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(node, value);
        node.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await flushFrames();
}
async function composition(node, type) { await act(async () => node.dispatchEvent(new window.CompositionEvent(type, { bubbles: true }))); }
function example(props = {}) { return h(Select, { value: "a", options, onValueChange() {}, label: "Fruit", ...props }); }
afterEach(async () => {
    if (root) await act(async () => root.unmount());
    root = undefined; frames.clear(); scrolled.length = 0;
    for (const child of [...document.body.children]) if (child !== host) child.remove();
    document.body.style.overflow = "";
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
});

test("opening a selected value neither changes it nor moves focus into the listbox", async () => {
    const calls = [];
    await render(example({ value: "c", onValueChange: (value) => calls.push(value) }));
    await click(combo());
    assert.ok(list()); assert.deepEqual(calls, []); focused(combo());
    assert.equal(active().textContent, "Cherry");
    assert.equal(active().getAttribute("aria-selected"), "true");
    assert.equal(combo().getAttribute("aria-controls"), list().id);
});

test("zero, empty string and unknown values retain their distinct displayed labels", async () => {
    const special = [{ value: 0, label: "Zero" }, { value: "", label: "All" }];
    for (const [value, text] of [[0, "Zero"], ["", "All"], ["missing", "missing"], [null, "Choose"]]) {
        await render(example({ value, options: special, placeholder: "Choose" }));
        assert.equal(combo().textContent, text);
    }
    await render(example({ value: "missing", options: special, selectedLabel: "Unavailable" }));
    assert.equal(combo().textContent, "Unavailable");
});

test("disabled control cannot open and disabled options cannot be selected", async () => {
    const calls = [];
    await render(example({ disabled: true, onValueChange: (value) => calls.push(value) }));
    await click(combo()); assert.ok(!list());
    await render(example({ onValueChange: (value) => calls.push(value) }));
    await click(combo()); await click(choices()[1]);
    assert.deepEqual(calls, []); assert.ok(list());
    assert.equal(choices()[1].getAttribute("aria-disabled"), "true");
});

test("Arrow keys skip disabled options; Home/End reach enabled edges without selection", async () => {
    const calls = [];
    await render(example({ onValueChange: (value) => calls.push(value) }));
    await key(combo(), "ArrowDown");
    await key(combo(), "ArrowDown"); assert.equal(active().textContent, "Cherry");
    await key(combo(), "ArrowUp"); assert.equal(active().textContent, "Apple");
    await key(combo(), "End"); assert.equal(active().textContent, "Date");
    await key(combo(), "Home"); assert.equal(active().textContent, "Apple");
    focused(combo()); assert.deepEqual(calls, []);
});

for (const commitKey of ["Enter", " "]) test(`${JSON.stringify(commitKey)} opens first and only commits on a second keypress`, async () => {
    const calls = [];
    await render(example({ value: null, onValueChange: (value) => calls.push(value) }));
    await key(combo(), commitKey); assert.ok(list()); assert.deepEqual(calls, []);
    await key(combo(), "End"); await key(combo(), commitKey);
    assert.deepEqual(calls, ["d"]); assert.ok(!list()); focused(combo());
});

test("typeahead searches textValue and skips disabled matching options", async () => {
    await render(example({ options: [options[0], { value: "blocked", label: "Cedar", disabled: true }, { value: "rich", label: h("strong", null, "Rich label"), textValue: "Cherry" }] }));
    await click(combo()); await key(combo(), "c"); await key(combo(), "h");
    assert.equal(active().textContent, "Rich label"); focused(combo());
});

test("Escape cancels while Tab closes without preventing native tab navigation", async () => {
    const calls = [];
    await render(example({ onValueChange: (value) => calls.push(value) }));
    await click(combo()); await key(combo(), "End"); await key(combo(), "Escape");
    assert.ok(!list()); focused(combo()); assert.equal(combo().textContent, "Apple");
    await click(combo()); const event = await key(combo(), "Tab");
    assert.equal(event.defaultPrevented, false); assert.ok(!list()); assert.deepEqual(calls, []);
});

test("all-disabled options expose no active descendant and Enter commits nothing", async () => {
    const calls = [];
    await render(example({ options: options.map((option) => ({ ...option, disabled: true })), onValueChange: (value) => calls.push(value) }));
    await click(combo()); await key(combo(), "ArrowDown"); await key(combo(), "Enter");
    assert.ok(!combo().hasAttribute("aria-activedescendant")); assert.deepEqual(calls, []);
});

test("searchable Select filters case-insensitively and reports the empty state", async () => {
    await render(example({ searchable: true, noOptionsLabel: "No fruit" }));
    await click(combo()); await input(combo(), "CHER");
    assert.deepEqual(choices().map((node) => node.textContent), ["Cherry"]); focused(combo());
    await input(combo(), "unknown"); assert.equal(choices().length, 0); assert.equal(list().textContent, "No fruit");
    assert.ok(!combo().hasAttribute("aria-activedescendant"));
});

test("controlled search query supports caller-provided filtering", async () => {
    const queries = [];
    function Controlled() {
        const [query, setQuery] = React.useState("");
        return example({ searchable: true, searchValue: query, onSearchChange: (value) => { queries.push(value); setQuery(value); }, filterOptions: false });
    }
    await render(h(Controlled)); await click(combo()); await input(combo(), "remote-only");
    assert.equal(combo().value, "remote-only"); assert.deepEqual(queries, ["remote-only"]);
    assert.equal(choices().length, options.length);
});

test("searchable selection preserves native Home/End and Space editing", async () => {
    const calls = [];
    await render(example({ searchable: true, onValueChange: (value) => calls.push(value) }));
    await click(combo()); await input(combo(), "ch");
    for (const value of ["Home", "End", " "]) assert.equal((await key(combo(), value)).defaultPrevented, false);
    await key(combo(), "Enter"); assert.deepEqual(calls, ["c"]); assert.ok(!list()); focused(combo());
});

test("IME Enter and Escape do not select or close the enclosing Dialog", async () => {
    const calls = [];
    let closes = 0;
    await render(h(Dialog, { isOpen: true, onClose: () => closes++, title: "Parent", syncHistory: false }, example({ searchable: true, onValueChange: (value) => calls.push(value) })));
    await click(combo()); await composition(combo(), "compositionstart");
    await key(combo(), "Enter"); await key(combo(), "Escape");
    assert.ok(list()); assert.equal(closes, 0); assert.deepEqual(calls, []);
    await composition(combo(), "compositionend");
    await key(combo(), "Escape", { isComposing: true }); assert.ok(list()); assert.equal(closes, 0);
    await key(combo(), "Escape", { keyCode: 229 }); assert.ok(list()); assert.equal(closes, 0);
    await key(combo(), "Escape"); assert.ok(!list()); assert.equal(closes, 0);
});

test("opening scrolls the selected option into view without moving DOM focus", async () => {
    await render(example({ value: "d" })); await click(combo());
    assert.ok(scrolled.some(({ node, options }) => node === active() && options.block === "nearest"));
    focused(combo()); await key(combo(), "Home");
    assert.ok(scrolled.at(-1).node === active()); focused(combo());
});

test("outside pointer closes without stealing the outside target's focus", async () => {
    await render(h(React.Fragment, null, example(), h("button", { id: "outside" }, "Outside")));
    await click(combo()); const outside = document.getElementById("outside");
    await act(async () => { outside.focus(); outside.dispatchEvent(new window.Event("pointerdown", { bubbles: true })); });
    await flushFrames(); assert.ok(!list()); focused(outside);
});

test("position clamps to visual viewport and flips above when space below is insufficient", () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 300, height: 400, offsetLeft: 20, offsetTop: 30 } });
    const position = calculateSelectPosition({ left: 290, top: 350, bottom: 390, width: 220 }, 10);
    assert.equal(position.opensUpward, true); assert.ok(position.left >= 28);
    assert.ok(position.left + position.width <= 312); assert.ok(position.top >= 38);
    assert.ok(position.top + position.maxHeight <= 422);
});

test("open popup repositions after window and visual viewport resize", async () => {
    const viewport = new window.EventTarget();
    Object.assign(viewport, { width: 400, height: 700, offsetLeft: 0, offsetTop: 0 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    await render(example());
    const field = combo().parentElement;
    field.getBoundingClientRect = () => ({ left: 320, top: 300, bottom: 356, width: 180 });
    await click(combo()); assert.equal(list().dataset.placement, "bottom");
    viewport.height = 390;
    await act(async () => viewport.dispatchEvent(new window.Event("resize")));
    assert.equal(list().dataset.placement, "top");
    viewport.width = 220;
    await act(async () => window.dispatchEvent(new window.Event("resize")));
    assert.ok(Number.parseFloat(list().style.left) + Number.parseFloat(list().style.width) <= 212);
});

test("named selection submits numeric zero, empty and unknown values through FormData", async () => {
    for (const value of [0, "", "unknown"]) {
        await render(h("form", null, example({ value, name: "fruit", options: [{ value: 0, label: "Zero" }, { value: "", label: "All" }] })));
        assert.equal(new window.FormData(host.querySelector("form")).get("fruit"), String(value));
    }
    await render(h("form", null, example({ name: "fruit", disabled: true })));
    assert.equal(new window.FormData(host.querySelector("form")).has("fruit"), false);
});

test("required validation focuses the visible combobox and clears after valid selection", async () => {
    function Required() {
        const [value, setValue] = React.useState(null);
        return h("form", null, example({ value, required: true, name: "fruit", onValueChange: setValue }));
    }
    await render(h(Required)); const form = host.querySelector("form");
    await act(async () => assert.equal(form.checkValidity(), false));
    focused(combo()); assert.equal(combo().getAttribute("aria-invalid"), "true");
    assert.ok(document.getElementById(combo().getAttribute("aria-describedby")));
    await click(combo()); await click(choices()[2]);
    assert.equal(form.checkValidity(), true); assert.ok(!combo().hasAttribute("aria-invalid"));
    assert.equal(new window.FormData(form).get("fruit"), "c");
});

for (const [name, Sheet] of [["BottomSheet", BottomSheet], ["SideSheet", SideSheet]]) test(`Select inside ${name}: Escape closes only top overlay and preserves scroll locking`, async () => {
    document.body.style.overflow = "scroll";
    function Nested() {
        const [open, setOpen] = React.useState(false);
        return h(React.Fragment, null, h("button", { id: "sheet-opener", onClick: () => setOpen(true) }, "Open"),
            h(Sheet, { isOpen: open, onClose: () => setOpen(false), title: "Sheet", syncHistory: false }, example()));
    }
    await render(h(Nested)); const opener = document.getElementById("sheet-opener");
    await act(async () => opener.focus()); await click(opener); await click(combo());
    focused(combo()); assert.equal(document.body.style.overflow, "hidden");
    await key(combo(), "End"); focused(combo()); assert.ok(active());
    await key(combo(), "Escape"); assert.ok(!list()); assert.ok(document.querySelector('[role="dialog"]'));
    focused(combo()); assert.equal(document.body.style.overflow, "hidden");
    await key(combo(), "Escape"); assert.ok(!document.querySelector('[role="dialog"]'));
    assert.equal(document.body.style.overflow, "scroll"); focused(opener);
});

function menuExample(items) { return h(Menu, { items, anchor: (props) => h("button", { ...props, id: "menu-opener" }, "Menu") }); }
test("Menu link preserves href/current state and does not cancel Ctrl-click navigation", async () => {
    let selected = 0;
    await render(menuExample([{ key: "link", label: "Cards", href: "/cards", ariaCurrent: "page", onSelect: () => selected++ }]));
    await click(document.getElementById("menu-opener")); const link = document.querySelector('[role="menuitem"]');
    assert.equal(link.tagName, "A"); assert.equal(link.getAttribute("href"), "/cards"); assert.equal(link.getAttribute("aria-current"), "page");
    const event = new window.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    // Cancel only at document after React's handler to avoid jsdom's unimplemented navigation.
    let componentPrevented;
    document.addEventListener("click", (event) => { componentPrevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
    await act(async () => link.dispatchEvent(event));
    assert.equal(componentPrevented, false); assert.equal(selected, 1);
});

test("Menu disabled links prevent activation and keyboard navigation skips them", async () => {
    let selected = 0;
    await render(menuExample([{ key: "a", label: "First", href: "/cards" }, { key: "disabled", label: "Disabled", href: "/music", disabled: true, onSelect: () => selected++ }, { key: "c", label: "Last", onSelect() {} }]));
    await click(document.getElementById("menu-opener"));
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    const event = new window.MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => items[1].dispatchEvent(event));
    assert.equal(event.defaultPrevented, true); assert.equal(selected, 0); assert.ok(document.querySelector('[role="menu"]'));
    await act(async () => items[0].focus()); await key(items[0], "ArrowDown"); focused(items[2]);
});


test("searchable remote results retain the selected label when the current item is outside the result slice", async () => {
    await render(h(Select, { searchable: true, value: 7, selectedLabel: "Selected song", options: [], searchValue: "", onSearchChange() {}, onValueChange() {}, "aria-label": "Song" }));
    assert.equal(combo().value, "Selected song");
    await click(combo());
    assert.equal(combo().value, "");
    await key(combo(), "Escape");
    assert.equal(combo().value, "Selected song");
});
