import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://pjsk.moe/" });
const { window } = dom;
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MouseEvent", "KeyboardEvent", "StorageEvent", "getComputedStyle"]) {
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
}
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: window.localStorage });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: window.sessionStorage });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let frameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = window.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
};
globalThis.cancelAnimationFrame = window.cancelAnimationFrame = (id) => frames.delete(id);

const scrollCalls = [];
window.scrollTo = (arg1, arg2) => {
    const top = typeof arg1 === "object" && arg1 !== null ? (arg1.top ?? 0) : (arg2 ?? 0);
    window.scrollY = top;
    scrollCalls.push(top);
};

const observers = [];
class MockIntersectionObserver {
    constructor(callback, options = {}) {
        this.callback = callback;
        this.options = options;
        this.targets = new Set();
        this.disconnected = false;
        observers.push(this);
    }
    observe(target) {
        this.targets.add(target);
    }
    unobserve(target) {
        this.targets.delete(target);
    }
    disconnect() {
        this.disconnected = true;
        this.targets.clear();
    }
    trigger(isIntersecting) {
        if (this.disconnected) return;
        const entries = [...this.targets].map((target) => ({ target, isIntersecting }));
        if (entries.length > 0) this.callback(entries, this);
    }
}
globalThis.IntersectionObserver = window.IntersectionObserver = MockIntersectionObserver;

const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const h = React.createElement;

const modules = new Map();
const mocks = {
    "framer-motion": { AnimatePresence: ({ children }) => children, motion: { div: ({ children, ...p }) => h("div", p, children) }, useReducedMotion: () => true },
    "@/contexts/I18nContext": { useI18n: () => ({ t: (key) => key, locale: "en-US" }) },
    "@/components/LocalizedLink": { __esModule: true, default: ({ children, prefetch: _prefetch, ...props }) => h("a", props, children) },
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
        if (id.startsWith("@/") || id.startsWith(".")) {
            const base = id.startsWith("@/") ? path.resolve(webRoot, id.replace("@/", "src/")) : path.resolve(path.dirname(filename), id);
            for (const ext of [".ts", ".tsx", "/index.ts"]) {
                if (existsSync(`${base}${ext}`)) return loadSource(path.relative(webRoot, `${base}${ext}`));
            }
        }
        return require(id);
    };
    new Function("require", "exports", "module", transpiled.outputText)(resolve, compiledModule.exports, compiledModule);
    return compiledModule.exports;
}

const { useAutoLoadMore, setAutoLoadMoreEnabled, getAutoLoadMoreEnabled, isScrollContainerActive } = loadSource("src/hooks/useAutoLoadMore.ts");
const { useExplorerScrollRestore, resetExplorerSavedStateCache } = loadSource("src/hooks/useExplorerScrollRestore.ts");
const { LoadMore } = loadSource("src/components/md3/Patterns.tsx");

const host = document.getElementById("root");
let root;

async function flushFrames() {
    for (let turn = 0; turn < 5 && frames.size; turn++) {
        await act(async () => {
            const pending = [...frames.values()];
            frames.clear();
            for (const callback of pending) callback(performance.now());
        });
    }
}

async function render(element) {
    root ??= createRoot(host);
    await act(async () => root.render(element));
    await flushFrames();
}

function activeObservers() {
    return observers.filter((o) => !o.disconnected);
}

afterEach(async () => {
    if (root) {
        await act(async () => root.unmount());
    }
    root = undefined;
    frames.clear();
    observers.length = 0;
    scrollCalls.length = 0;
    window.scrollY = 0;
    window.innerHeight = 768;
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetExplorerSavedStateCache();
    setAutoLoadMoreEnabled(true);
});

test("LoadMore triggers onLoadMore automatically on intersection and keeps expanding across batches", async () => {
    let loadCalls = 0;
    function ListHarness() {
        const [shown, setShown] = React.useState(30);
        return h(LoadMore, {
            label: "Load more",
            shown,
            total: 90,
            onLoadMore: () => {
                loadCalls++;
                setShown((prev) => prev + 30);
            },
            allLoadedLabel: "All loaded",
        });
    }

    await render(h(ListHarness));
    assert.equal(getAutoLoadMoreEnabled(), true);
    assert.equal(activeObservers().length, 1);

    // Same batch should not double-trigger when observer fires multiple times before re-render
    await act(async () => {
        activeObservers()[0].trigger(true);
        activeObservers()[0].trigger(true);
    });
    await flushFrames();
    assert.equal(loadCalls, 1);
    assert.match(host.textContent, /60 \/ 90/);

    // Next batch creates a fresh observer after layout settles and expands again if still intersecting
    assert.equal(activeObservers().length, 1);
    await act(async () => {
        activeObservers()[0].trigger(true);
    });
    await flushFrames();
    assert.equal(loadCalls, 2);
    assert.match(host.textContent, /All loaded/);
    assert.equal(activeObservers().length, 0);
});

test("global preference disables and re-enables auto-load-more across components", async () => {
    let calls = 0;
    await render(h(LoadMore, {
        label: "Load more",
        shown: 30,
        total: 100,
        onLoadMore: () => { calls++; },
    }));
    assert.equal(activeObservers().length, 1);

    await act(async () => setAutoLoadMoreEnabled(false));
    await flushFrames();
    assert.equal(getAutoLoadMoreEnabled(), false);
    assert.equal(window.localStorage.getItem("auto-load-more"), "false");
    assert.equal(activeObservers().length, 0);

    // Manual click still works when auto-load is turned off
    await act(async () => host.querySelector("button[data-shortcut-load-more='true']").click());
    assert.equal(calls, 1);

    await act(async () => setAutoLoadMoreEnabled(true));
    await flushFrames();
    assert.equal(activeObservers().length, 1);
    await act(async () => activeObservers()[0].trigger(true));
    assert.equal(calls, 2);
});

test("useAutoLoadMore picks the nearest scrolling container and skips non-scrolling overflow wrappers", async () => {
    let calls = 0;
    function ScrollContainerHarness({ scrollable }) {
        const scrollRef = React.useRef(null);
        const sentinelRef = useAutoLoadMore({
            hasMore: true,
            itemCount: 20,
            onLoadMore: () => { calls++; },
        });
        React.useLayoutEffect(() => {
            if (!scrollRef.current) return;
            Object.defineProperty(scrollRef.current, "clientHeight", { configurable: true, value: 400 });
            Object.defineProperty(scrollRef.current, "scrollHeight", { configurable: true, value: scrollable ? 1200 : 400 });
        }, [scrollable]);

        return h(
            "div",
            { ref: scrollRef, style: { overflowY: "auto" } },
            h("div", { ref: sentinelRef }, "sentinel"),
        );
    }

    await render(h(ScrollContainerHarness, { key: "scrollable", scrollable: true }));
    assert.equal(activeObservers().length, 1);
    assert.ok(activeObservers()[0].options.root === host.firstElementChild, "expected scrolling ancestor as observer root");

    await render(h(ScrollContainerHarness, { key: "static", scrollable: false }));
    assert.equal(activeObservers().length, 1);
    assert.ok(activeObservers()[0].options.root === null, "expected viewport (null) when ancestor does not scroll");

    await act(async () => activeObservers()[0].trigger(true));
    assert.equal(calls, 1);
});

test("isScrollContainerActive ignores expanded mobile containers with minor subpixel overflow", () => {
    const mobileExpanded = document.createElement("div");
    mobileExpanded.style.overflowY = "auto";
    Object.defineProperty(mobileExpanded, "clientHeight", { configurable: true, value: 2400 });
    Object.defineProperty(mobileExpanded, "scrollHeight", { configurable: true, value: 2410 });
    assert.equal(isScrollContainerActive(mobileExpanded), false);

    const desktopSplitPane = document.createElement("div");
    desktopSplitPane.style.overflowY = "auto";
    Object.defineProperty(desktopSplitPane, "clientHeight", { configurable: true, value: 520 });
    Object.defineProperty(desktopSplitPane, "scrollHeight", { configurable: true, value: 9000 });
    assert.equal(isScrollContainerActive(desktopSplitPane), true);
});

test("useAutoLoadMore resets trigger guard when resetKey changes across directories with equal itemCount", async () => {
    let calls = 0;
    function DirHarness({ dir }) {
        const ref = useAutoLoadMore({
            hasMore: true,
            itemCount: 200,
            resetKey: dir,
            onLoadMore: () => { calls++; },
        });
        return h("div", { ref }, "sentinel");
    }

    await render(h(DirHarness, { dir: "dir-a" }));
    assert.equal(activeObservers().length, 1);
    await act(async () => activeObservers()[0].trigger(true));
    assert.equal(calls, 1);

    // Switching to another directory that also has 200 initial items must re-arm triggering
    await render(h(DirHarness, { dir: "dir-b" }));
    assert.equal(activeObservers().length, 1);
    await act(async () => activeObservers()[0].trigger(true));
    assert.equal(calls, 2);
});

test("useAutoLoadMore triggers via passive scroll fallback inside constrained scroll container", async () => {
    let calls = 0;
    function FallbackScrollHarness() {
        const scrollRef = React.useRef(null);
        const sentinelRef = useAutoLoadMore({
            hasMore: true,
            itemCount: 200,
            rootMargin: "600px 0px",
            scrollRootRef: scrollRef,
            onLoadMore: () => { calls++; },
        });
        React.useLayoutEffect(() => {
            if (!scrollRef.current) return;
            Object.defineProperty(scrollRef.current, "clientHeight", { configurable: true, value: 500 });
            Object.defineProperty(scrollRef.current, "scrollHeight", { configurable: true, value: 4000 });
            scrollRef.current.getBoundingClientRect = () => ({ top: 100, bottom: 600, left: 0, right: 800, width: 800, height: 500 });
            const sentinelEl = scrollRef.current.firstElementChild;
            sentinelEl.getBoundingClientRect = () => ({ top: 900, bottom: 940, left: 0, right: 800, width: 800, height: 40 });
        }, []);

        return h("div", { ref: scrollRef, style: { overflowY: "auto" } }, h("div", { ref: sentinelRef }, "sentinel"));
    }

    await render(h(FallbackScrollHarness));
    // 900 <= 600 + 600 triggers immediately via layout check without waiting on IntersectionObserver
    assert.equal(calls, 1);
});

test("useAutoLoadMore does not trigger when shown is 0 or already all loaded", async () => {
    let calls = 0;
    function GuardHarness({ count, total }) {
        const ref = useAutoLoadMore({
            hasMore: count < total,
            itemCount: count,
            onLoadMore: () => { calls++; },
        });
        return h("div", { ref }, "sentinel");
    }

    await render(h(GuardHarness, { count: 0, total: 50 }));
    assert.equal(activeObservers().length, 0);

    await render(h(GuardHarness, { count: 50, total: 50 }));
    assert.equal(activeObservers().length, 0);
    assert.equal(calls, 0);
});

test("useExplorerScrollRestore preserves visibleCount and listScrollTop across folder navigation and route remounts", async () => {
    let api;
    function ExplorerHarness({ viewKey, filterSignature = "all", isReady = true }) {
        const listScrollRef = React.useRef(null);
        const state = useExplorerScrollRestore({
            storageKey: "asset-viewer",
            viewKey,
            filterSignature,
            pageSize: 200,
            listScrollRef,
            isReady,
        });
        React.useEffect(() => {
            api = state;
        });
        return h(
            "div",
            { ref: listScrollRef, "data-visible": String(state.visibleCount), style: { overflowY: "auto", height: "500px" } },
            h("div", { style: { height: `${state.visibleCount * 40}px` } }, String(state.visibleCount)),
        );
    }

    await render(h(ExplorerHarness, { viewKey: "jp:storage:" }));
    assert.equal(api.visibleCount, 200);

    // User loads more twice (200 -> 600) and scrolls down inside listScrollRef
    await act(async () => {
        api.loadMore();
        api.loadMore();
    });
    await flushFrames();
    assert.equal(api.visibleCount, 600);

    const listNode = host.firstElementChild;
    listNode.scrollTop = 14200;
    await act(async () => {
        listNode.dispatchEvent(new window.Event("scroll"));
    });

    // Navigate into subfolder ("second page")
    await act(async () => api.rememberScroll());
    await render(h(ExplorerHarness, { viewKey: "jp:storage:music" }));
    assert.equal(api.visibleCount, 200);
    assert.equal(host.firstElementChild.scrollTop, 0);

    // Return to parent folder -> both visibleCount (600) and scrollTop (14200) must be restored!
    await act(async () => api.rememberScroll());
    await render(h(ExplorerHarness, { viewKey: "jp:storage:" }));
    assert.equal(api.visibleCount, 600);
    assert.equal(host.firstElementChild.scrollTop, 14200);

    // Filter change in the same folder resets visibleCount to 200 and scrollTop to 0
    await render(h(ExplorerHarness, { viewKey: "jp:storage:", filterSignature: "image" }));
    assert.equal(api.visibleCount, 200);
    assert.equal(host.firstElementChild.scrollTop, 0);

    // Simulate navigating away and returning via browser Back (new mount reading sessionStorage)
    await render(h(ExplorerHarness, { viewKey: "jp:storage:music" }));
    await act(async () => api.loadMore());
    await flushFrames();
    host.firstElementChild.scrollTop = 6400;
    await act(async () => api.rememberScroll());

    await act(async () => root.unmount());
    root = undefined;
    resetExplorerSavedStateCache();

    // First render while loading (isReady=false), then ready (isReady=true)
    await render(h(ExplorerHarness, { viewKey: "jp:storage:music", isReady: false }));
    assert.equal(api.visibleCount, 400);
    await render(h(ExplorerHarness, { viewKey: "jp:storage:music", isReady: true }));
    assert.equal(api.visibleCount, 400);
    assert.equal(host.firstElementChild.scrollTop, 6400);
});

test("useExplorerScrollRestore restores mobile window.scrollY when list container does not constrain scroll", async () => {
    let api;
    function MobileExplorerHarness({ viewKey }) {
        const listScrollRef = React.useRef(null);
        const state = useExplorerScrollRestore({
            storageKey: "asset-versions",
            viewKey,
            filterSignature: "all",
            pageSize: 200,
            listScrollRef,
            isReady: true,
        });
        React.useEffect(() => {
            api = state;
        });
        React.useLayoutEffect(() => {
            const node = document.querySelector("[data-mobile-list='true']");
            if (!node) return;
            Object.defineProperty(node, "clientHeight", { configurable: true, value: 4000 });
            Object.defineProperty(node, "scrollHeight", { configurable: true, value: 4000 });
        }, []);
        return h("div", { ref: listScrollRef, "data-mobile-list": "true", style: { overflowY: "auto" } }, String(state.visibleCount));
    }

    await render(h(MobileExplorerHarness, { viewKey: "jp:v2:" }));
    await act(async () => api.loadMore());
    await flushFrames();
    window.scrollY = 2850;
    await act(async () => api.rememberScroll());

    await render(h(MobileExplorerHarness, { viewKey: "jp:v2:ondemand" }));
    assert.equal(window.scrollY, 0);

    await render(h(MobileExplorerHarness, { viewKey: "jp:v2:" }));
    assert.equal(api.visibleCount, 400);
    assert.equal(window.scrollY, 2850);
});
