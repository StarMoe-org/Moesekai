import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("src/components/common/ServerRegion.tsx", root), "utf8");
const compiledModule = { exports: {} };
const keys = Object.fromEntries(["cn", "jp", "tw", "kr", "en"].map(server => [server, `common.server.${server}`]));
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("require", "exports", "module", compiled)((id) => {
    if (id === "@/contexts/I18nContext") return { useI18n: () => ({ t: key => `translated:${key}` }) };
    if (id === "@/lib/account-servers") return { SERVER_LABEL_KEYS: keys };
    return require(id);
}, compiledModule.exports, compiledModule);
const { ServerRegionIcon, ServerRegionLabel, getServerDisplayCode } = compiledModule.exports;
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("all five standalone icons have translated accessible names and circular clipping", () => {
    for (const server of Object.keys(keys)) {
        const svg = render(ServerRegionIcon, { server });
        assert.match(svg, new RegExp(`aria-label="translated:common.server.${server}"`));
        assert.match(svg, /role="img"/);
        assert.match(svg, /<clipPath id="[^"]+"><circle cx="50" cy="50" r="49"/);
        assert.doesNotMatch(svg, /<image|href=|\p{Regional_Indicator}/u);
    }
});

test("labels preserve localized text while hiding decorative SVGs", () => {
    const html = render(ServerRegionLabel, { server: "tw", size: 18 });
    assert.match(html, /aria-hidden="true"/);
    assert.doesNotMatch(html, /role="img"|aria-label=/);
    assert.match(html, /width="18" height="18"/);
    assert.match(html, /<span class="min-w-0">translated:common.server.tw<\/span>/);
    assert.match(render(ServerRegionLabel, { server: "cn", label: React.createElement("strong", null, "custom") }), /<strong>custom<\/strong>/);
    assert.match(render(ServerRegionIcon, { server: "jp", label: "Custom Japan" }), /aria-label="Custom Japan"/);
});

test("multiple instances receive independent clipPath IDs", () => {
    const html = renderToStaticMarkup(React.createElement("div", null, ...Object.keys(keys).map(server => React.createElement(ServerRegionLabel, { key: server, server }))));
    const ids = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
    for (const id of ids) assert.ok(html.includes(`clip-path="url(#${id})"`));
});

test("EN artwork uses a simplified circular red-white stripe field with one white star", () => {
    const svg = render(ServerRegionIcon, { server: "en" });
    assert.equal((svg.match(/<polygon /g) ?? []).length, 1);
    assert.match(svg, /<rect width="54" height="56" fill="#3c3b6e">/);
    assert.match(svg, /<rect width="100" height="100" fill="#fff">/);
    assert.match(svg, /<path d="M0 0h100v14H0zm0 28h100v14H0zm0 28h100v14H0zm0 28h100v16H0z" fill="#b22234">/);
    assert.match(svg, /<g fill="#fff"><polygon /);
    assert.match(svg, /fill="#b22234"/);
    assert.doesNotMatch(svg, /data-stripe=|50 stars/);
});

test("China and Japan retain their artwork; HMT uses Hong Kong's five-petal regional flag", () => {
    assert.equal((render(ServerRegionIcon, { server: "cn" }).match(/<polygon /g) ?? []).length, 5);
    assert.match(render(ServerRegionIcon, { server: "jp" }), /cx="50" cy="50" r="25" fill="#bc002d"/);
    const tw = render(ServerRegionIcon, { server: "tw" });
    assert.match(tw, /data-server-region="tw" data-display-region="HMT"/);
    assert.equal((tw.match(/data-hmt-petal=/g) ?? []).length, 5);
    assert.equal((tw.match(/fill="#fff"/g) ?? []).length, 5);
    assert.match(tw, /fill="#ee1c25"/);
    assert.doesNotMatch(tw, /<text/);
    assert.equal(getServerDisplayCode("tw"), "HMT");
    assert.match(render(ServerRegionLabel, { server: "tw", label: "TW" }), /<span class="min-w-0">HMT<\/span>/);
});

test("Korea has the two-color taegeuk and the four correctly arranged trigrams", () => {
    const svg = render(ServerRegionIcon, { server: "kr" });
    assert.match(svg, /fill="#0047a0"/);
    assert.match(svg, /fill="#cd2e3a"/);
    const expectations = [
        ["geon", "27 34.67", 3, 0], ["gam", "73 34.67", 1, 2],
        ["ri", "27 65.33", 2, 1], ["gon", "73 65.33", 0, 3],
    ];
    for (const [name, position, solids, broken] of expectations) {
        const group = svg.match(new RegExp(`<g data-trigram="${name}"[^>]*>(.*?)<\\/g>`))?.[0];
        assert.ok(group, name);
        assert.ok(group.includes(`translate(${position})`));
        assert.equal((group.match(/<rect /g) ?? []).length, solids);
        assert.equal((group.match(/<path /g) ?? []).length, broken);
    }
});

test("public props retain shared ServerType and optional size/className/labels", () => {
    assert.match(source, /server: ServerType;/);
    assert.match(source, /size\?: number;/);
    assert.match(source, /className\?: string;/);
    assert.match(source, /label\?: ReactNode;/);
    assert.match(source, /label\?: string;/);
    assert.match(source, /export function ServerRegionIcon/);
    assert.match(source, /export function ServerRegionLabel/);
});
