import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const React = require("react");
const { createRoot } = require("react-dom/client");
const { JSDOM } = require("jsdom");
const ts = require("typescript");
const dom = new JSDOM("<div id='root'></div>", { url: "https://host.test/mysekai/interactions/resources/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { storage: { estimate: async () => ({ usage: 2097152, quota: 1073741824 }) } } });
const calls = [];
let reply = { enabled: true, bytes: 1048576, entries: 2 };
let clearFailure = false, finishClear;
let manifest = { release: { resourceBase: "https://cdn.test/bucket/" }, snapshots: [{ id: "cn-v1", region: "cn", version: "6.0.0" }] };
const source = await readFile(new URL("../src/components/mysekai-interactions/ResourceCachePanel.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
const mocks = {
    "@/components/LocalizedLink": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/contexts/I18nContext": { useI18n: () => ({ locale: "en-US", t: (key, values) => key + (values ? JSON.stringify(values) : "") }) },
    "@/lib/moly/useResources": { useRuntimeManifest: () => ({ manifest, failed: !manifest }) },
    "@/lib/moly/resourceCache": { resourceCacheCommand: async type => {
        calls.push(type);
        if (type === "clear") {
            if (clearFailure) throw new Error("clear denied");
            await new Promise(resolve => { finishClear = resolve; });
            return { ...reply, bytes: 0, entries: 0 };
        }
        return reply;
    } },
};
new Function("require", "exports", compiled)(id => mocks[id] ?? require(id), exports);
const Panel = exports.default;
const host = document.getElementById("root");
const root = createRoot(host);
const render = props => React.act(async () => { root.render(React.createElement(Panel, { playerOpen: false, ...props })); });
const text = () => host.textContent;
const button = key => [...host.querySelectorAll("button")].find(node => node.textContent === key);
const click = key => React.act(async () => { const node = button(key); assert.ok(node, key); node.click(); });
const prefix = "page.mysekaiInteractions.cache.";

await render();
assert.deepEqual(calls, ["query"], "opening management does not enable retention or clear resources");
assert.ok(text().includes(prefix + "budgetUnknown"), "legacy workers without budgets remain supported");
assert.equal(host.querySelector("[data-moly-cache-bytes]").dataset.molyCacheBytes, "1048576");
assert.ok(text().includes('"quota":"1,024"'), "site quota estimate is distinct from Moly accounting");
assert.ok(text().includes("https://cdn.test"));
await click(prefix + "clear");
assert.equal(calls.filter(type => type === "clear").length, 0, "opening confirmation cannot delete");
await click("common.action.cancel");
assert.equal(host.querySelector("#moly-clear-confirmation"), null);
await click(prefix + "clear");
clearFailure = true;
await click("common.action.confirm");
assert.ok(text().includes(prefix + "failed"));
assert.ok(host.querySelector("#moly-clear-confirmation"), "failed clearing preserves confirmation for retry");
clearFailure = false;
await click("common.action.confirm");
assert.ok(text().includes(prefix + "clearing"));
assert.equal(button("common.action.confirm").disabled, true);
await React.act(async () => { finishClear(); });
assert.ok(text().includes(prefix + "cleared"));
assert.equal(host.querySelector("[data-moly-cache-bytes]").dataset.molyCacheBytes, "0");
assert.equal(host.querySelector("#moly-clear-confirmation"), null);
assert.equal(button(prefix + "clear").disabled, true);
reply = { ...reply, limitBytes: 536870912 };
await click(prefix + "refresh");
assert.equal(host.querySelector("progress").max, 536870912);
await render({ playerOpen: true });
assert.equal(button(prefix + "clear").disabled, true, "live player blocks destructive action");
await React.act(async () => { root.unmount(); });

const modal = await readFile(new URL("../src/components/mysekai-interactions/InteractionsSettingsModal.tsx", import.meta.url), "utf8");
assert.match(modal, /\/mysekai\/interactions\/resources\//, "management entry is accessible in settings modal");
const runtime = await readFile(new URL("../src/components/mysekai-interactions/RuntimeStage.tsx", import.meta.url), "utf8");
assert.match(runtime, /mount\.current\?\.close\(\)/, "navigation retains close-before-leave ownership");
console.log("Moly resource panel: legacy budget, quota, explicit entry, confirmation/cancel/retry/clear, and live-player guard passed.");
dom.window.close();
