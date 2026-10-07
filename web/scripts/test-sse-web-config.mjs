import assert from "node:assert/strict";

const { SSE_WEB_PATH, sseWebCoreUrl, sseWebEnabled, sseWebReleaseBase, sseWebSources } = await import("../src/lib/sseWeb/config.ts");

const NAMES = ["NEXT_PUBLIC_SSE_WEB_BASE", "NEXT_PUBLIC_SSE_WEB_CORE_URL", "NEXT_PUBLIC_SSE_WEB_LIBRARY", "NEXT_PUBLIC_SSE_WEB_INAPP", "NEXT_PUBLIC_SSE_WEB_ASSET_PROXY"];
const set = (values) => {
    for (const name of NAMES) delete process.env[name];
    Object.assign(process.env, values);
};

assert.equal(SSE_WEB_PATH, "/sse-web/");

// Nothing is published by default: an ordinary build has the player off, and
// Docker passes empty strings for what is not set.
for (const empty of [{}, { NEXT_PUBLIC_SSE_WEB_BASE: "", NEXT_PUBLIC_SSE_WEB_CORE_URL: "  " }]) {
    set(empty);
    assert.equal(sseWebReleaseBase(), null);
    assert.equal(sseWebCoreUrl(), null);
    assert.equal(sseWebEnabled(), false);
    assert.deepEqual(sseWebSources(), {
        library: "https://assets.pjsk.moe/sekai-extra-assets/sekai-story/ripper/jp/",
        inapp: "https://assets.pjsk.moe/sekai-extra-assets/inapp/jp-7.0.0/",
    });
}

// The release alone, or Cubism Core alone, does not turn it on.
set({ NEXT_PUBLIC_SSE_WEB_BASE: "https://assets.example.test/bucket/sse-web/0.2.1/" });
assert.equal(sseWebEnabled(), false);
set({ NEXT_PUBLIC_SSE_WEB_CORE_URL: "https://example.test/vendor/live2dcubismcore.min.js" });
assert.equal(sseWebEnabled(), false);

set({
    NEXT_PUBLIC_SSE_WEB_BASE: " https://assets.example.test/bucket/sse-web/0.2.1/ ",
    NEXT_PUBLIC_SSE_WEB_CORE_URL: "https://example.test/vendor/live2dcubismcore.min.js",
    NEXT_PUBLIC_SSE_WEB_LIBRARY: "https://assets.example.test/bucket/library/jp/",
    NEXT_PUBLIC_SSE_WEB_INAPP: "https://assets.example.test/bucket/inapp/jp-7.0.0/",
});
assert.equal(sseWebReleaseBase(), "https://assets.example.test/bucket/sse-web/0.2.1/");
assert.equal(sseWebCoreUrl(), "https://example.test/vendor/live2dcubismcore.min.js");
assert.equal(sseWebEnabled(), true);
assert.deepEqual(sseWebSources(), {
    library: "https://assets.example.test/bucket/library/jp/",
    inapp: "https://assets.example.test/bucket/inapp/jp-7.0.0/",
});

// Development: plain http on a loopback host, and a relay for the asset hosts.
set({
    NEXT_PUBLIC_SSE_WEB_BASE: "http://127.0.0.1:8787/dist/",
    NEXT_PUBLIC_SSE_WEB_CORE_URL: "http://localhost:8787/core/live2dcubismcore.min.js",
    NEXT_PUBLIC_SSE_WEB_ASSET_PROXY: "http://127.0.0.1:8787/remote/",
});
assert.equal(sseWebEnabled(), true);
assert.equal(sseWebSources().proxy, "http://127.0.0.1:8787/remote/");

for (const value of [
    "http://assets.example.test/sse-web/",
    "https://assets.example.test/sse-web",
    "https://assets.example.test/sse-web/?v=1",
    "https://assets.example.test/sse-web/#",
    "https://assets.example.test/a b/",
    "https://assets.example.test/sse-web/../",
    "https://user@assets.example.test/sse-web/",
    "//assets.example.test/sse-web/",
    "/sse-web/",
    "ftp://assets.example.test/sse-web/",
]) {
    set({ NEXT_PUBLIC_SSE_WEB_BASE: value });
    assert.throws(() => sseWebReleaseBase(), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_BASE/, value);
}

for (const value of ["https://example.test/vendor/", "https://example.test/core.wasm", "http://example.test/core.js", "core.js"]) {
    set({ NEXT_PUBLIC_SSE_WEB_CORE_URL: value });
    assert.throws(() => sseWebCoreUrl(), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_CORE_URL/, value);
}

set({ NEXT_PUBLIC_SSE_WEB_INAPP: "https://assets.example.test/inapp/jp-7.0.0" });
assert.throws(() => sseWebSources(), /sse_web_config_invalid:NEXT_PUBLIC_SSE_WEB_INAPP/);

console.log("sse-web config OK");
