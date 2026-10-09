import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";

// Like the existing component tests, transpile in memory: no generated JS or dependencies.
const require = createRequire(import.meta.url);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://pjsk.moe/" });
const { window } = dom;
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MouseEvent", "KeyboardEvent", "CompositionEvent", "getComputedStyle"]) {
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let frameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = window.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
};
globalThis.cancelAnimationFrame = window.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.CSS = { escape: (value) => Array.from(String(value), (char) => `\\${char.codePointAt(0).toString(16)} `).join("") };
globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
};
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const h = React.createElement;
const modules = new Map();
const motionDiv = React.forwardRef(function MotionDiv({ children, ...props }, ref) {
    // Animation timing is not under test; preserve the real DOM, refs and handlers.
    for (const key of ["initial", "animate", "exit", "transition", "drag", "dragConstraints", "dragElastic", "onDragEnd"]) delete props[key];
    return h("div", { ...props, ref }, children);
});
const mocks = {
    "framer-motion": { AnimatePresence: ({ children }) => children, motion: { div: motionDiv }, useReducedMotion: () => true },
    "@/contexts/I18nContext": { useI18n: () => ({ t: (key) => key, locale: "en-US" }) },
    "@/components/LocalizedLink": { __esModule: true, default: function LocalizedLink({ children, prefetch: _prefetch, ...props }) { return h("a", props, children); } },
};
function loadSource(relativePath) {
    const filename = path.resolve(webRoot, relativePath);
    if (modules.has(filename)) return modules.get(filename).exports;
    const source = readFileSync(filename, "utf8");
    const transpiled = ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        reportDiagnostics: true,
    });
    assert.deepEqual((transpiled.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error), []);
    const compiledModule = { exports: {} };
    modules.set(filename, compiledModule);
    const resolve = (id) => {
        if (mocks[id]) return mocks[id];
        if (id.startsWith("@/")) return loadSource(`${id.replace("@/", "src/")}.ts`);
        if (id.startsWith(".")) {
            const base = path.resolve(path.dirname(filename), id);
            for (const ext of [".ts", ".tsx"]) {
                try { return loadSource(path.relative(webRoot, `${base}${ext}`)); }
                catch (error) { if (error.code !== "ENOENT") throw error; }
            }
            throw new Error(`Cannot resolve ${id} from ${relativePath}`);
        }
        return require(id);
    };
    new Function("require", "exports", "module", transpiled.outputText)(resolve, compiledModule.exports, compiledModule);
    return compiledModule.exports;
}
const md3 = (file) => loadSource(`src/components/md3/${file}`);
const { Dialog } = md3("Dialog.tsx");
const { BottomSheet, SideSheet } = md3("Sheet.tsx");
const { Menu } = md3("Menu.tsx");
const { Tabs, SegmentedButton, ConnectedButtonGroup } = md3("Segmented.tsx");
const { Button, IconButton } = md3("Button.tsx");
const { List, ListItem } = md3("Misc.tsx");
const { TextField } = md3("TextField.tsx");
const { Slider, RangeSlider } = md3("Selection.tsx");
const host = document.getElementById("root");
let root;
async function flushFrames() {
    for (let turn = 0; turn < 4 && frames.size; turn++) {
        await act(async () => {
            const pending = [...frames.entries()];
            frames.clear();
            for (const [, callback] of pending) callback(performance.now());
        });
    }
}
async function render(element) {
    root ??= createRoot(host);
    await act(async () => root.render(element));
    await flushFrames();
}
async function click(node) {
    assert.ok(node);
    await act(async () => node.click());
    await flushFrames();
}
async function focus(node) {
    await act(async () => node.focus());
}
function assertFocused(expected, message = "focus must be on the expected DOM node") {
    assert.ok(document.activeElement === expected, message);
}
function assertMissing(node, message = "the DOM node must be absent") {
    assert.ok(node === null, message);
}
async function key(node, key, options = {}) {
    const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
    await act(async () => node.dispatchEvent(event));
    await flushFrames();
    return event;
}
async function input(node, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
        setter.call(node, value);
        node.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
}
async function composition(node, type) {
    await act(async () => node.dispatchEvent(new window.CompositionEvent(type, { bubbles: true, data: node.value })));
}
function nextPopState(predicate = () => true) {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            window.removeEventListener("popstate", listener);
            reject(new Error("history traversal did not complete"));
        }, 1000);
        const listener = (event) => {
            if (!predicate(event)) return;
            window.clearTimeout(timer);
            window.removeEventListener("popstate", listener);
            resolve(event);
        };
        window.addEventListener("popstate", listener);
    });
}
afterEach(async () => {
    if (root) {
        const historyReturned = window.history.state?.modal ? nextPopState((event) => !event.state?.modal) : null;
        await act(async () => { root.unmount(); if (historyReturned) await historyReturned; });
    }
    root = undefined;
    frames.clear();
    for (const child of [...document.body.children]) if (child !== host) child.remove();
    document.body.style.overflow = "";
    window.history.replaceState(null, "", "/");
});

for (const [name, Component] of [["Dialog", Dialog], ["BottomSheet", BottomSheet], ["SideSheet", SideSheet]]) {
    test(`${name}: initial focus, Tab containment, Escape and focus restoration`, async () => {
        function Example() {
            const [open, setOpen] = React.useState(false);
            return h(React.Fragment, null,
                h("button", { id: "opener", onClick: () => setOpen(true) }, "Open"),
                h(Component, { isOpen: open, onClose: () => setOpen(false), title: "Panel", syncHistory: false },
                    h("button", { id: "first" }, "First"), h("button", { id: "last" }, "Last")));
        }
        await render(h(Example));
        const opener = document.getElementById("opener");
        await focus(opener);
        await click(opener);
        const panel = document.querySelector('[role="dialog"]');
        assert.ok(panel.contains(document.activeElement), "opening moves focus into the modal");
        const first = panel.querySelector("button");
        const last = document.getElementById("last");
        await focus(last);
        assert.equal((await key(last, "Tab")).defaultPrevented, true);
        assertFocused(first);
        await key(first, "Tab", { shiftKey: true });
        assertFocused(last);
        await focus(opener);
        assert.ok(panel.contains(document.activeElement), "programmatic focus cannot escape the modal");
        await key(document.activeElement, "Escape", { isComposing: true });
        assert.ok(document.querySelector('[role="dialog"]'));
        await key(document.activeElement, "Escape");
        assertMissing(document.querySelector('[role="dialog"]'));
        assertFocused(opener);
    });
}

test("empty modal focuses its container and a non-dismissible top layer blocks parent Escape", async () => {
    let outerCloses = 0;
    await render(h(Dialog, { isOpen: true, onClose: () => outerCloses++, title: "Outer", syncHistory: false },
        h(Dialog, { isOpen: true, onClose() {}, title: "Inner", syncHistory: false, dismissible: false, showClose: false })));
    const inner = [...document.querySelectorAll('[role="dialog"]')].find((node) => node.textContent === "Inner");
    assertFocused(inner);
    await key(inner, "Escape");
    assert.equal(outerCloses, 0);
    await key(inner, "Tab");
    assertFocused(inner);
});

test("nested modal closes only the top layer and keeps scroll locked until the last modal closes", async () => {
    document.body.style.overflow = "scroll";
    function Example() {
        const [outer, setOuter] = React.useState(true);
        const [inner, setInner] = React.useState(false);
        return h(Dialog, { isOpen: outer, onClose: () => setOuter(false), title: "Outer", syncHistory: false },
            h("button", { id: "inner-opener", onClick: () => setInner(true) }, "Open inner"),
            h(Dialog, { isOpen: inner, onClose: () => setInner(false), title: "Inner", syncHistory: false }, h("button", null, "Inside")));
    }
    await render(h(Example));
    const trigger = document.getElementById("inner-opener");
    await focus(trigger);
    await click(trigger);
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 2);
    await key(document.activeElement, "Escape");
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
    assertFocused(trigger);
    assert.equal(document.body.style.overflow, "hidden");
    await key(document.activeElement, "Escape");
    assert.equal(document.body.style.overflow, "scroll");
});

test("scroll lock survives out-of-order removal of independent modals", async () => {
    document.body.style.overflow = "auto";
    const view = (outer, inner) => h(React.Fragment, null,
        h(Dialog, { isOpen: outer, onClose() {}, title: "Outer", syncHistory: false }),
        h(Dialog, { isOpen: inner, onClose() {}, title: "Inner", syncHistory: false }));
    await render(view(true, false));
    await render(view(true, true));
    await render(view(false, true));
    assert.equal(document.body.style.overflow, "hidden", "closing an older modal must not unlock the body");
    await render(view(false, false));
    assert.equal(document.body.style.overflow, "auto");
});

test("nested history overlays use separate entries and Back only dismisses the newest", async () => {
    const calls = [];
    const push = window.history.pushState.bind(window.history);
    window.history.pushState = (...args) => { calls.push(args[0]); push(...args); };
    function Example() {
        const [outer, setOuter] = React.useState(true);
        const [inner, setInner] = React.useState(false);
        return h(Dialog, { isOpen: outer, onClose: () => setOuter(false), title: "Outer" },
            h("button", { id: "history-inner", onClick: () => setInner(true) }, "Open inner"),
            h(Dialog, { isOpen: inner, onClose: () => setInner(false), title: "Inner" }));
    }
    try {
        await render(h(Example));
        await click(document.getElementById("history-inner"));
        assert.equal(calls.length, 2);
        await act(async () => {
            const returned = nextPopState();
            window.history.back();
            await returned;
        });
        assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
    } finally { window.history.pushState = push; }
});

const menuItems = [{ key: "disabled", label: "Disabled", disabled: true }, { key: "one", label: "One" }, { key: "two", label: "Two" }];
const menuAnchor = (props) => h("button", { ...props, id: "menu-trigger" }, "Menu");
test("Menu inside Dialog owns Escape, preserves IME and returns focus to its anchor", async () => {
    let closed = 0;
    await render(h(Dialog, { isOpen: true, onClose: () => closed++, title: "Modal", syncHistory: false }, h(Menu, { anchor: menuAnchor, items: menuItems })));
    const anchor = document.getElementById("menu-trigger");
    await focus(anchor);
    await click(anchor);
    const first = document.querySelector('[role="menuitem"]:not([disabled])');
    assertFocused(first);
    await key(first, "Escape", { isComposing: true });
    assert.ok(document.querySelector('[role="menu"]'));
    await key(first, "Escape");
    assertMissing(document.querySelector('[role="menu"]'));
    assert.equal(closed, 0);
    assertFocused(anchor);
});

test("Menu keyboard navigation skips disabled items, uses one tab stop, and Tab closes it", async () => {
    await render(h(Menu, { anchor: menuAnchor, items: menuItems }));
    await click(document.getElementById("menu-trigger"));
    const enabled = [...document.querySelectorAll('[role="menuitem"]:not([disabled])')];
    assert.equal(enabled.filter((node) => node.tabIndex === 0).length, 1);
    await key(enabled[0], "ArrowUp");
    assertFocused(enabled[1]);
    await key(enabled[1], "Home");
    assertFocused(enabled[0]);
    await key(enabled[0], "End");
    assertFocused(enabled[1]);
    assert.equal((await key(enabled[1], "Tab")).defaultPrevented, false);
    assertMissing(document.querySelector('[role="menu"]'));
    assertFocused(document.getElementById("menu-trigger"));
});

for (const [name, Component] of [["SegmentedButton", SegmentedButton], ["ConnectedButtonGroup", ConnectedButtonGroup]]) {
    test(`${name}: radios have one tab stop and arrow/Home/End selection skips disabled options`, async () => {
        const options = [{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }, { value: "c", label: "C" }];
        function Example() {
            const [value, setValue] = React.useState("a");
            return h(Component, { options, value, onValueChange: setValue, "aria-label": "Choice" });
        }
        await render(h(Example));
        const [a, b, c] = host.querySelectorAll("button");
        assert.deepEqual([a.tabIndex, b.tabIndex, c.tabIndex], [0, -1, -1]);
        await focus(a);
        await key(a, "ArrowRight");
        assertFocused(c);
        assert.equal(c.getAttribute("aria-checked"), "true");
        await key(c, "Home");
        assertFocused(a);
        await key(a, "End");
        assertFocused(c);
        await key(c, "ArrowDown");
        assertFocused(a);
        assert.equal((await key(a, "ArrowRight", { isComposing: true })).defaultPrevented, false);
        assertFocused(a);
    });
    test(`${name}: multi-select retains button semantics and independent toggles`, async () => {
        const values = [];
        await render(h(Component, { options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], multiple: true, value: ["a"], onValueChange: (v) => values.push(v) }));
        const buttons = [...host.querySelectorAll("button")];
        assert.equal(host.firstElementChild.getAttribute("role"), "group");
        assert.deepEqual(buttons.map((node) => node.getAttribute("aria-pressed")), ["true", "false"]);
        assert.deepEqual(buttons.map((node) => node.tabIndex), [0, 0]);
        await click(buttons[1]);
        assert.deepEqual(values, [["a", "b"]]);
    });
}

test("Tabs navigate from focused tab, include Home/End, and fall back when the selected tab is disabled", async () => {
    const items = [{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }, { value: "c", label: "C" }];
    function Example({ value: initial = "a" }) {
        const [value, setValue] = React.useState(initial);
        return h(Tabs, { items, value, onValueChange: setValue, "aria-label": "Tabs" });
    }
    await render(h(Example));
    const [a, , c] = host.querySelectorAll("button");
    await focus(c);
    await key(c, "ArrowLeft");
    assertFocused(a, "keyboard moves relative to focus, not stale selection");
    await key(a, "End");
    assertFocused(c);
    assert.equal(c.getAttribute("aria-selected"), "true");
    await key(c, "Home");
    assertFocused(a);
    await render(h(Tabs, { items, value: "b", onValueChange() {} }));
    assert.equal(host.querySelectorAll('button:not([disabled])[tabindex="0"]').length, 1);
});

test("Button/IconButton retain link labels, descriptions and event props, and native buttons do not submit", async () => {
    let clicked = 0;
    await render(h(React.Fragment, null,
        h(Button, { href: "/cards", "aria-label": "Cards", "aria-describedby": "description", id: "button-link", onClick: (e) => { e.preventDefault(); clicked++; } }),
        h(IconButton, { href: "/cards", icon: "M0 0", label: "Icon link", "aria-describedby": "description", id: "icon-link", onClick: (e) => { e.preventDefault(); clicked++; } }),
        h(Button, { selected: false }, "Toggle"), h(IconButton, { icon: "M0 0", label: "Action" })));
    const buttonLink = host.querySelector("a");
    const iconLink = host.querySelectorAll("a")[1];
    assert.equal(buttonLink.getAttribute("aria-label"), "Cards");
    assert.equal(buttonLink.id, "button-link");
    assert.equal(iconLink.getAttribute("aria-describedby"), "description");
    await click(buttonLink);
    await click(iconLink);
    assert.equal(clicked, 2);
    for (const button of host.querySelectorAll("button")) assert.equal(button.type, "button");
    assert.equal(host.querySelector("button").getAttribute("aria-pressed"), "false");
    assert.equal(host.querySelector('button[aria-label="Action"] svg').getAttribute("aria-hidden"), "true");
});

test("List retains li children and disabled actions cannot be activated by keyboard/click", async () => {
    let clicks = 0;
    await render(h(List, null,
        h(ListItem, { headline: "Static" }),
        h(ListItem, { headline: "Disabled action", disabled: true, onClick: () => clicks++ }),
        h(ListItem, { headline: "Disabled link", disabled: true, href: "/cards" })));
    const list = host.querySelector("ul");
    assert.deepEqual([...list.children].map((node) => node.tagName), ["LI", "LI", "LI"]);
    const button = list.querySelector("button");
    assert.equal(button.disabled, true);
    await click(button);
    assert.equal(clicks, 0);
    const link = list.querySelector("a");
    assert.equal(link.getAttribute("aria-disabled"), "true");
    assert.equal(link.tabIndex, -1);
    const event = new window.MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => link.dispatchEvent(event));
    assert.equal(event.defaultPrevented, true);
});

test("uncontrolled TextField clear updates the DOM, calls once and returns focus to the input", async () => {
    const changes = [];
    await render(h(TextField, { label: "Search", defaultValue: "initial", clearable: true, onValueChange: (value) => changes.push(value) }));
    const field = host.querySelector("input");
    const clear = host.querySelector("button");
    assert.ok(clear.getAttribute("aria-label"), "clear button always has an accessible name");
    await focus(clear);
    await click(clear);
    assert.equal(field.value, "");
    assertFocused(field);
    assert.deepEqual(changes, [""]);
    assertMissing(host.querySelector("button"));
});

test("TextField IME defers value emission and duplicate commit input; Escape clears before dismissing Dialog", async () => {
    const values = [];
    const raw = [];
    let closes = 0;
    function Example() {
        const [value, setValue] = React.useState("");
        return h(Dialog, { isOpen: true, onClose: () => closes++, title: "Search", syncHistory: false },
            h(TextField, { label: "Search", value, onChange: (e) => raw.push(e.target.value), onValueChange: (v) => { values.push(v); setValue(v); }, clearable: true }));
    }
    await render(h(Example));
    const field = document.querySelector("input");
    await focus(field);
    await composition(field, "compositionstart");
    await input(field, "に");
    assert.equal(field.value, "に");
    assert.deepEqual(values, []);
    await key(field, "Escape");
    assert.equal(closes, 0);
    await input(field, "日本");
    await composition(field, "compositionend");
    // Some engines send their final input after compositionend (with the same value).
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
        setter.call(field, "日本");
        if (field._valueTracker) field._valueTracker.setValue("に");
        field.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.deepEqual(values, ["日本"]);
    assert.ok(raw.length >= 2);
    await key(field, "Escape");
    assert.equal(field.value, "");
    assert.equal(closes, 0);
    await key(field, "Escape");
    assert.equal(closes, 1);
});

test("read-only TextField cannot be cleared and labelled support preserves caller descriptions", async () => {
    const changes = [];
    await render(h(TextField, { value: "read only", readOnly: true, clearable: true, label: "Field", supportingText: "Help", "aria-describedby": "external-help", onValueChange: (v) => changes.push(v) }));
    const field = host.querySelector("input");
    assertMissing(host.querySelector("button"));
    await key(field, "Escape");
    assert.equal(field.value, "read only");
    assert.deepEqual(changes, []);
    const support = host.querySelector('[id$="-support"]');
    assert.ok(field.getAttribute("aria-describedby").split(" ").includes(support.id));
    assert.ok(field.getAttribute("aria-describedby").split(" ").includes("external-help"));
});

test("RangeSlider exposes two named native handles on one track with ordered bounds", async () => {
    const updates = [];
    function Example() {
        const [value, setValue] = React.useState([10, 30]);
        return h(RangeSlider, { value, min: 1, max: 40, lowerLabel: "Minimum", upperLabel: "Maximum", formatValue: (n) => `Level ${n}`, onValueChange: (next) => { updates.push(next); setValue(next); } });
    }
    await render(h(Example));
    const [lower, upper] = host.querySelectorAll('input[type="range"]');
    assert.equal(host.querySelectorAll('[data-range-slider="true"]').length, 1);
    assert.equal(lower.getAttribute("aria-label"), "Minimum");
    assert.equal(upper.getAttribute("aria-label"), "Maximum");
    assert.equal(lower.getAttribute("aria-valuetext"), "Level 10");
    assert.deepEqual([lower.min, lower.max, upper.min, upper.max], ["1", "30", "10", "40"]);
    await focus(lower);
    assert.equal((await key(lower, "ArrowRight")).defaultPrevented, false, "native keyboard increments remain available");
    await input(lower, "20");
    await input(upper, "35");
    assert.deepEqual(updates, [[20, 30], [20, 35]]);
    assert.deepEqual([lower.max, upper.min], ["35", "20"]);
});

async function rangePointer(track, type, clientX) {
    const event = new window.MouseEvent(type, { clientX, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: 1 });
    await act(async () => track.dispatchEvent(event));
}

test("RangeSlider pointer chooses nearest handle, snaps to steps and stops after cancel", async () => {
    const updates = [];
    function Example() {
        const [value, setValue] = React.useState([20, 80]);
        return h(RangeSlider, { value, min: 0, max: 100, step: 5, lowerLabel: "Min", upperLabel: "Max", onValueChange: (next) => { updates.push(next); setValue(next); } });
    }
    await render(h(Example));
    const track = host.querySelector('[data-range-slider="true"]');
    // The rail is inset by the handle radius (10px) at each end: x 20–100 spans the range.
    track.getBoundingClientRect = () => ({ left: 10, width: 100 });
    track.setPointerCapture = () => {};
    await rangePointer(track, "pointerdown", 41);
    assert.deepEqual(updates.at(-1), [25, 80]);
    assertFocused(host.querySelector('[aria-label="Min"]'));
    await rangePointer(track, "pointermove", 200);
    assert.deepEqual(updates.at(-1), [80, 80], "lower handle cannot cross the upper handle");
    await rangePointer(track, "pointercancel", 200);
    const count = updates.length;
    await rangePointer(track, "pointermove", 20);
    assert.equal(updates.length, count);
    await rangePointer(track, "pointerdown", 92);
    assert.deepEqual(updates.at(-1), [80, 90], "coincident handles can separate upward");
    assertFocused(host.querySelector('[aria-label="Max"]'));
});

test("RangeSlider disables both handles for disabled or collapsed bounds", async () => {
    const updates = [];
    for (const props of [{ min: 1, max: 40, disabled: true }, { min: 20, max: 20 }]) {
        await render(h(RangeSlider, { value: [10, 30], lowerLabel: "Min", upperLabel: "Max", onValueChange: (next) => updates.push(next), ...props }));
        const handles = [...host.querySelectorAll('input[type="range"]')];
        assert.equal(handles.length, 2);
        assert.ok(handles.every((node) => node.disabled));
        await rangePointer(host.querySelector('[data-range-slider="true"]'), "pointerdown", 10);
    }
    assert.deepEqual(updates, []);
});

test("Slider stays a native keyboard/form control and its visual handle agrees with clamped range values", async () => {
    const values = [];
    let keys = 0;
    await render(h(Slider, { value: 150, min: 0, max: 100, onValueChange: (v) => values.push(v), formatValue: (v) => `${v}%`, showValue: true, "aria-label": "Volume", name: "volume", onKeyDown: () => keys++ }));
    const slider = host.querySelector("input");
    assert.equal(slider.type, "range");
    assert.equal(slider.value, "100");
    assert.equal(host.querySelector('span[style*="left"]').style.left, "100%");
    assert.equal(slider.getAttribute("aria-valuetext"), "100%");
    assert.equal((await key(slider, "ArrowRight")).defaultPrevented, false, "native keyboard behavior is not overridden");
    assert.equal(keys, 1);
    await input(slider, "60");
    assert.deepEqual(values, [60]);
});

test("Dialog preserves explicit autofocus and restores the opener after removal", async () => {
    function Example() {
        const [open, setOpen] = React.useState(false);
        return h(React.Fragment, null,
            h("button", { id: "autofocus-opener", onClick: () => setOpen(true) }, "Open"),
            h(Dialog, { isOpen: open, onClose: () => setOpen(false), title: "Auto focus", syncHistory: false },
                h("input", { autoFocus: true, "aria-label": "Name", id: "autofocus-input" })));
    }
    await render(h(Example));
    const opener = document.getElementById("autofocus-opener");
    await focus(opener);
    await click(opener);
    assertFocused(document.getElementById("autofocus-input"));
    await key(document.activeElement, "Escape");
    assertFocused(opener);
});

test("StrictMode modal ignores hidden/negative-tabindex controls and uses the latest close callback", async () => {
    let oldCloses = 0;
    let latestCloses = 0;
    const view = (onClose) => h(React.StrictMode, null,
        h(Dialog, { isOpen: true, onClose, title: "Strict", showClose: false, syncHistory: false },
            h("button", { tabIndex: -1 }, "Programmatic only"),
            h("div", { style: { display: "none" } }, h("button", null, "Hidden")),
            h("button", { id: "visible-first" }, "First"), h("button", { id: "visible-last" }, "Last")));
    await render(view(() => oldCloses++));
    assertFocused(document.getElementById("visible-first"));
    await render(view(() => latestCloses++));
    const first = document.getElementById("visible-first");
    await key(first, "Tab", { shiftKey: true });
    assertFocused(document.getElementById("visible-last"));
    await key(document.activeElement, "Escape");
    assert.equal(oldCloses, 0);
    assert.equal(latestCloses, 1);
});

test("programmatic child history close does not dismiss its parent; real Back then closes the parent", async () => {
    function Example() {
        const [outer, setOuter] = React.useState(true);
        const [inner, setInner] = React.useState(false);
        return h(Dialog, { isOpen: outer, onClose: () => setOuter(false), title: "Outer" },
            h("button", { id: "programmatic-inner-opener", onClick: () => setInner(true) }, "Inner"),
            h(Dialog, { isOpen: inner, onClose: () => setInner(false), title: "Inner", showClose: false },
                h("button", { id: "programmatic-inner-close", onClick: () => setInner(false) }, "Close")));
    }
    await render(h(Example));
    await click(document.getElementById("programmatic-inner-opener"));
    const returned = nextPopState();
    await click(document.getElementById("programmatic-inner-close"));
    await act(async () => { await returned; });
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
    assert.equal(document.body.style.overflow, "hidden");
    await act(async () => {
        const returned = nextPopState();
        window.history.back();
        await returned;
    });
    assertMissing(document.querySelector('[role="dialog"]'));
    assert.equal(document.body.style.overflow, "");
});

test("removing a parent and its open portal child unwinds both history entries and restores focus", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Page opener";
    document.body.append(opener);
    await focus(opener);
    const view = (open) => h(Dialog, { isOpen: open, onClose() {}, title: "Parent" },
        h(Dialog, { isOpen: true, onClose() {}, title: "Child" }));
    await render(view(true));
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 2);
    const returned = nextPopState((event) => !event.state?.modal);
    await render(view(false));
    await act(async () => { await returned; });
    assertMissing(document.querySelector('[role="dialog"]'));
    assert.equal(document.body.style.overflow, "");
    assertFocused(opener);
});

test("empty Menu focuses its container, preserves native Tab exit and never locks body scroll", async () => {
    document.body.style.overflow = "auto";
    await render(h(Menu, { anchor: menuAnchor, items: [{ key: "none", label: "Disabled", disabled: true }] }));
    await click(document.getElementById("menu-trigger"));
    const menu = document.querySelector('[role="menu"]');
    assertFocused(menu);
    assert.equal(document.body.style.overflow, "auto");
    await key(menu, "Tab");
    assertMissing(document.querySelector('[role="menu"]'));
});

test("a portal Dialog opened within Menu owns Escape and inside pointers without dismissing Menu", async () => {
    let childCloses = 0;
    const label = h(React.Fragment, null, "Item", h(Dialog, {
        isOpen: true, onClose: () => childCloses++, title: "Child", showClose: false, dismissible: false, syncHistory: false,
    }));
    await render(h(Menu, { anchor: menuAnchor, items: [{ key: "nested", label }] }));
    await click(document.getElementById("menu-trigger"));
    const child = document.querySelector('[role="dialog"]');
    assertFocused(child);
    await key(child, "Escape");
    assert.ok(document.querySelector('[role="menu"]'), "React portal bubbling must not dismiss the parent Menu");
    assert.equal(childCloses, 0);
    await act(async () => child.dispatchEvent(new window.Event("pointerdown", { bubbles: true })));
    assert.ok(document.querySelector('[role="menu"]'), "an inside pointer belongs to the top Dialog, not the lower Menu");
});



test("progress indicators expose localized default names and preserve explicit labels", async () => {
    const { LinearProgress, CircularProgress, LoadingIndicator } = md3("Progress.tsx");
    await render(h(React.Fragment, null,
        h(LinearProgress), h(CircularProgress), h(LoadingIndicator),
        h(LinearProgress, { value: 0.25, "aria-label": "Playback" })));
    const indicators = [...host.querySelectorAll('[role="progressbar"]')];
    assert.deepEqual(indicators.map((node) => node.getAttribute("aria-label")), [
        "common.md3.loading", "common.md3.loading", "common.md3.loading", "Playback",
    ]);
    assert.equal(indicators[3].getAttribute("aria-valuenow"), "25");
});

test("withOverrides drops the defaults a caller's className sets, whatever order Tailwind emits them in", () => {
    const { withOverrides } = md3("cn.ts");
    // Tailwind emits p-0 before p-4 and w-auto before w-full, so joining both would keep the default.
    assert.equal(withOverrides("p-4 sm:p-5", "p-0"), "p-0");
    assert.equal(withOverrides("inline-flex w-full", "w-auto"), "inline-flex w-auto");
    assert.equal(withOverrides("mx-auto w-full max-w-7xl", "max-w-3xl"), "mx-auto w-full max-w-3xl");
    // Several caller sides add up to the default shorthand; a single side does not.
    assert.equal(withOverrides("px-4", "pl-0 pr-2"), "pl-0 pr-2");
    assert.equal(withOverrides("p-4", "pt-0"), "p-4 pt-0");
    // A wider-breakpoint default would take back what the caller set below it.
    assert.equal(withOverrides("px-4 py-6 sm:py-8", "pb-12"), "px-4 py-6 pb-12");
    assert.equal(withOverrides("p-4 sm:p-5", "sm:pt-0"), "p-4 sm:p-5 sm:pt-0");
    // State variants and unrelated utilities stay; colour and size share the text- prefix.
    assert.equal(withOverrides("bg-primary hover:shadow-elev-1 shadow-none", "bg-error"), "hover:shadow-elev-1 shadow-none bg-error");
    assert.equal(withOverrides("border border-outline text-on-surface type-label-l", "border-error text-xs"), "border text-on-surface type-label-l border-error text-xs");
    assert.equal(withOverrides("relative inline-flex", "absolute hidden sm:flex"), "absolute hidden sm:flex");
    assert.equal(withOverrides("rounded-full active:rounded-md3-sm", "rounded-md3-md"), "active:rounded-md3-sm rounded-md3-md");
    assert.equal(withOverrides("w-full", undefined), "w-full");
});

test("md3 roots and bodies let the caller's className replace their defaults", async () => {
    const { SectionCard, PageContainer, EmptyState } = md3("Patterns.tsx");
    await render(h(React.Fragment, null,
        h(SectionCard, { title: "Media", bodyClassName: "p-0" }, h("img", { alt: "" })),
        h(PageContainer, { className: "max-w-3xl" }, "narrow"),
        h(EmptyState, { title: "Nothing", className: "py-10" }),
        h(Button, { className: "absolute px-2" }, "Floating")));
    const classes = (node) => node.className.split(" ");
    const body = host.querySelector("section img").parentElement;
    assert.deepEqual(classes(body).filter((c) => /(^|:)p[trblxy]?-/.test(c)), ["p-0"]);
    const container = [...host.children].find((node) => node.textContent === "narrow");
    assert.deepEqual(classes(container).filter((c) => c.startsWith("max-w-")), ["max-w-3xl"]);
    assert.ok(!classes(host.querySelector(".py-10")).includes("py-16"));
    const button = host.querySelector("button");
    assert.ok(classes(button).includes("absolute") && !classes(button).includes("relative"));
    assert.ok(classes(button).includes("px-2") && !classes(button).includes("px-4"));
});
