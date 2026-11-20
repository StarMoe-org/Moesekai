import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const { SSE_WEB_FONT_FILES, SSE_WEB_FONT_PATH, SSE_WEB_PATH, sseWebCheckSources, sseWebCoreUrl, sseWebFonts, sseWebSources } = await import("../src/lib/sseWeb/config.ts");

const NAMES = ["NEXT_PUBLIC_SSE_WEB_CORE_URL", "NEXT_PUBLIC_SSE_WEB_SITE", "NEXT_PUBLIC_SSE_WEB_ASSET_PROXY", "NEXT_PUBLIC_SSE_WEB_FONT_BASE", "NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS", "NEXT_PUBLIC_SSE_WEB_BUNDLED_FONTS"];
const set = (values) => {
    for (const name of NAMES) delete process.env[name];
    Object.assign(process.env, values);
};

assert.equal(SSE_WEB_PATH, "/sse-web/");

// With nothing set the player reads the story data site's published versions and loads Live2D's
// own Cubism Core; Docker passes empty strings for what is not set.
for (const empty of [{}, { NEXT_PUBLIC_SSE_WEB_CORE_URL: "  ", NEXT_PUBLIC_SSE_WEB_SITE: "" }]) {
    set(empty);
    assert.equal(sseWebCoreUrl(), null);
    // Each server reads its own version; only JP and CN have a client view of their own.
    for (const region of ["jp", "cn"]) {
        assert.deepEqual(sseWebSources(region), { site: "https://storage.pjsk.moe/", region, borrowedUi: false });
    }
    for (const region of ["tw", "kr", "en"]) {
        assert.deepEqual(sseWebSources(region), { site: "https://storage.pjsk.moe/", region, borrowedUi: true });
    }
    assert.equal(sseWebSources("xx"), null);
    // A build that found no open fonts and was given no directory of them: the client's fonts
    // are used, on every server.
    for (const region of ["jp", "cn", "tw", "kr", "en"]) assert.equal(sseWebFonts(region), null);
}

// The JP stories are drawn with open fonts: M PLUS 1 at the weights matching the client's two
// faces, and Source Han Sans JP behind it for the characters it lacks. By default they are the
// repository's own, which next.config.ts found in public/story-fonts and are named by path.
const openFonts = (base) => ({
    body: [
        { url: `${base}MPLUS1%5Bwght%5D.ttf`, weight: 460 },
        { url: `${base}SourceHanSansJP-Medium.otf` },
    ],
    name: [
        { url: `${base}MPLUS1%5Bwght%5D.ttf`, weight: 820 },
        { url: `${base}SourceHanSansJP-Heavy.otf` },
    ],
});
assert.equal(SSE_WEB_FONT_PATH, "/story-fonts/");
set({ NEXT_PUBLIC_SSE_WEB_BUNDLED_FONTS: "1" });
assert.deepEqual(sseWebFonts("jp"), openFonts("/story-fonts/"));
for (const region of ["cn", "tw", "kr", "en"]) assert.equal(sseWebFonts(region), null);

// The client's own fonts are used only when asked for, wherever the open ones are.
for (const on of ["1", "true", " TRUE "]) {
    set({ NEXT_PUBLIC_SSE_WEB_BUNDLED_FONTS: "1", NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS: on });
    assert.equal(sseWebFonts("jp"), null, on);
    set({ NEXT_PUBLIC_SSE_WEB_FONT_BASE: "https://assets.example.test/fonts/", NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS: on });
    assert.equal(sseWebFonts("jp"), null, on);
}
for (const off of ["", "0", "false"]) {
    set({ NEXT_PUBLIC_SSE_WEB_BUNDLED_FONTS: "1", NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS: off });
    assert.deepEqual(sseWebFonts("jp"), openFonts("/story-fonts/"), off);
}
set({ NEXT_PUBLIC_SSE_WEB_BUNDLED_FONTS: "1", NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS: "yes" });
assert.throws(() => sseWebCheckSources(), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS/);

// The repository holds the files the configuration names, as SOURCE.json records them.
{
    const directory = new URL(`../public${SSE_WEB_FONT_PATH}`, import.meta.url);
    const source = JSON.parse(readFileSync(new URL("SOURCE.json", directory), "utf8"));
    assert.deepEqual(source.fonts.map(font => font.file).sort(), [...SSE_WEB_FONT_FILES].sort());
    for (const font of source.fonts) {
        const file = new URL(encodeURIComponent(font.file), directory);
        assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), font.sha256, font.file);
        assert.match(readFileSync(new URL(font.licence, directory), "utf8"), /SIL Open Font License/, font.licence);
    }
}

// Another directory of them can be named; it is used whether or not the repository's are there.
set({ NEXT_PUBLIC_SSE_WEB_FONT_BASE: "https://assets.example.test/fonts/", NEXT_PUBLIC_SSE_WEB_BUNDLED_FONTS: "1" });
assert.deepEqual(sseWebFonts("jp"), openFonts("https://assets.example.test/fonts/"));
set({ NEXT_PUBLIC_SSE_WEB_FONT_BASE: "https://assets.example.test/fonts/" });
assert.deepEqual(sseWebFonts("jp"), openFonts("https://assets.example.test/fonts/"));
for (const region of ["cn", "tw", "kr", "en"]) assert.equal(sseWebFonts(region), null);
set({ NEXT_PUBLIC_SSE_WEB_FONT_BASE: "https://assets.example.test/fonts" });
assert.throws(() => sseWebCheckSources(), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_FONT_BASE/);

set({
    NEXT_PUBLIC_SSE_WEB_CORE_URL: " https://example.test/vendor/live2dcubismcore.min.js ",
    NEXT_PUBLIC_SSE_WEB_SITE: "https://data.example.test/stories/",
});
assert.equal(sseWebCoreUrl(), "https://example.test/vendor/live2dcubismcore.min.js");
assert.deepEqual(sseWebSources("jp"), { site: "https://data.example.test/stories/", region: "jp", borrowedUi: false });
sseWebCheckSources();

// Development: plain http on a loopback host, and a relay for the asset hosts.
set({
    NEXT_PUBLIC_SSE_WEB_CORE_URL: "http://localhost:8787/core/live2dcubismcore.min.js",
    NEXT_PUBLIC_SSE_WEB_ASSET_PROXY: "http://127.0.0.1:8787/remote/",
});
assert.equal(sseWebCoreUrl(), "http://localhost:8787/core/live2dcubismcore.min.js");
assert.equal(sseWebSources("jp").proxy, "http://127.0.0.1:8787/remote/");

for (const value of [
    "http://data.example.test/",
    "https://data.example.test/stories",
    "https://data.example.test/?v=1",
    "https://data.example.test/#",
    "https://data.example.test/a b/",
    "https://data.example.test/stories/../",
    "https://user@data.example.test/",
    "//data.example.test/",
    "/stories/",
    "ftp://data.example.test/",
]) {
    set({ NEXT_PUBLIC_SSE_WEB_SITE: value });
    assert.throws(() => sseWebSources("jp"), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_SITE/, value);
}

for (const value of ["https://example.test/vendor/", "https://example.test/core.wasm", "http://example.test/core.js", "core.js"]) {
    set({ NEXT_PUBLIC_SSE_WEB_CORE_URL: value });
    assert.throws(() => sseWebCoreUrl(), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_CORE_URL/, value);
}

set({ NEXT_PUBLIC_SSE_WEB_SITE: "http://data.example.test/" });
assert.throws(() => sseWebCheckSources(), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_SITE/);

console.log("sse-web config OK");
