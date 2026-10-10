import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const { SSE_WEB_FONT_FILES, SSE_WEB_FONT_PATH, SSE_WEB_PATH, sseWebCheckSources, sseWebCoreUrl, sseWebFonts, sseWebSources } = await import("../src/lib/sseWeb/config.ts");

const NAMES = ["NEXT_PUBLIC_SSE_WEB_CORE_URL", "NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE", "NEXT_PUBLIC_SSE_WEB_INAPP_BASE", "NEXT_PUBLIC_SSE_WEB_INAPPS", "NEXT_PUBLIC_SSE_WEB_ASSET_PROXY", "NEXT_PUBLIC_SSE_WEB_FONT_BASE", "NEXT_PUBLIC_SSE_WEB_CLIENT_FONTS", "NEXT_PUBLIC_SSE_WEB_BUNDLED_FONTS"];
const set = (values) => {
    for (const name of NAMES) delete process.env[name];
    Object.assign(process.env, values);
};

assert.equal(SSE_WEB_PATH, "/sse-web/");

// With nothing set the player reads the published libraries and loads Live2D's own Cubism
// Core; Docker passes empty strings for what is not set.
for (const empty of [{}, { NEXT_PUBLIC_SSE_WEB_CORE_URL: "  ", NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE: "" }]) {
    set(empty);
    assert.equal(sseWebCoreUrl(), null);
    // Each server reads its own library; only JP and CN have a client unpack of their own.
    assert.deepEqual(sseWebSources("jp"), {
        library: "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/",
        inapp: "https://assets.pjsk.moe/sekai-extra-assets/inapp/jp-7.0.0/",
        borrowedUi: false,
    });
    assert.deepEqual(sseWebSources("cn"), {
        library: "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/cn/",
        inapp: "https://assets.pjsk.moe/sekai-extra-assets/inapp/cn-6.4.0/",
        borrowedUi: false,
    });
    for (const region of ["tw", "kr", "en"]) {
        assert.deepEqual(sseWebSources(region), {
            library: `https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/${region}/`,
            inapp: "https://assets.pjsk.moe/sekai-extra-assets/inapp/cn-6.4.0/",
            borrowedUi: true,
        });
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
    NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE: "https://assets.example.test/bucket/library/",
    NEXT_PUBLIC_SSE_WEB_INAPP_BASE: "https://assets.example.test/bucket/inapp/",
    NEXT_PUBLIC_SSE_WEB_INAPPS: "jp=jp-7.1.0, cn=cn-6.4.0",
});
assert.equal(sseWebCoreUrl(), "https://example.test/vendor/live2dcubismcore.min.js");
assert.deepEqual(sseWebSources("jp"), {
    library: "https://assets.example.test/bucket/library/jp/",
    inapp: "https://assets.example.test/bucket/inapp/jp-7.1.0/",
    borrowedUi: false,
});
// A server left out of the list has no Live2D playback.
assert.equal(sseWebSources("tw"), null);
sseWebCheckSources();

// The list is region=unpack pairs of known servers, each once.
for (const value of ["jp", "jp=", "xx=jp-7.0.0", "jp=jp-7.0.0,jp=jp-6.8.1", "jp=../other", "jp=a/b", "jp=jp-7.0.0=x"]) {
    set({ NEXT_PUBLIC_SSE_WEB_INAPPS: value });
    assert.throws(() => sseWebCheckSources(), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_INAPPS/, value);
}

// Development: plain http on a loopback host, and a relay for the asset hosts.
set({
    NEXT_PUBLIC_SSE_WEB_CORE_URL: "http://localhost:8787/core/live2dcubismcore.min.js",
    NEXT_PUBLIC_SSE_WEB_ASSET_PROXY: "http://127.0.0.1:8787/remote/",
});
assert.equal(sseWebCoreUrl(), "http://localhost:8787/core/live2dcubismcore.min.js");
assert.equal(sseWebSources("jp").proxy, "http://127.0.0.1:8787/remote/");

for (const value of [
    "http://assets.example.test/library/",
    "https://assets.example.test/library",
    "https://assets.example.test/library/?v=1",
    "https://assets.example.test/library/#",
    "https://assets.example.test/a b/",
    "https://assets.example.test/library/../",
    "https://user@assets.example.test/library/",
    "//assets.example.test/library/",
    "/library/",
    "ftp://assets.example.test/library/",
]) {
    set({ NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE: value });
    assert.throws(() => sseWebSources("jp"), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE/, value);
}

for (const value of ["https://example.test/vendor/", "https://example.test/core.wasm", "http://example.test/core.js", "core.js"]) {
    set({ NEXT_PUBLIC_SSE_WEB_CORE_URL: value });
    assert.throws(() => sseWebCoreUrl(), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_CORE_URL/, value);
}

set({ NEXT_PUBLIC_SSE_WEB_INAPP_BASE: "https://assets.example.test/inapp" });
assert.throws(() => sseWebSources("jp"), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_INAPP_BASE/);
set({ NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE: "http://assets.example.test/library/" });
assert.throws(() => sseWebCheckSources(), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_LIBRARY_BASE/);

console.log("sse-web config OK");
