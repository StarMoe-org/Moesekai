/**
 * The deck workers' read through moesekai-api (src/lib/deck-recommend/starmoe-user-data.ts) against a fake fetch:
 * the request it makes, the answers it passes on, the errors the deck pages show, and when it hands back to the
 * old read.
 * Run with: node --experimental-strip-types --test tests/deck-starmoe-user-data.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { fetchStarMoeUserData } from "../src/lib/deck-recommend/starmoe-user-data.ts";

function json(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Answers every request with `response` and records it. */
function installFetch(response) {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (response instanceof Error) throw response;
        return typeof response === "function" ? response() : response;
    };
    return calls;
}

test("reads the suite from /api/sekai on the page's origin with the session cookie, past the CDN cache", async () => {
    const calls = installFetch(json(200, { userCards: [{ cardId: 1 }], upload_time: 5 }));
    const data = await fetchStarMoeUserData("jp", "123456", "userCards,upload_time", "");
    assert.deepEqual(data, { userCards: [{ cardId: 1 }], upload_time: 5 });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url, "https://pjsk.moe");
    assert.equal(url.pathname, "/api/sekai/jp/suite/123456");
    assert.equal(url.searchParams.get("key"), "userCards,upload_time");
    assert.ok(url.searchParams.get("_"), "a one-off nonce keeps Cloudflare from sharing the answer");
    assert.equal(calls[0].init.credentials, "same-origin");
    assert.equal(calls[0].init.cache, "no-store");
    assert.equal(calls[0].init.headers.Authorization, undefined, "no Haruki token leaves the browser");
});

test("sends the cookie across origins when moesekai-api has its own", async () => {
    const calls = installFetch(json(200, { userCards: [] }));
    await fetchStarMoeUserData("cn", "1", "userCards", "https://api.example.test");
    assert.ok(calls[0].url.startsWith("https://api.example.test/api/sekai/cn/suite/1?"));
    assert.equal(calls[0].init.credentials, "include");
});

test("private data and unknown players keep the codes the deck pages already show", async () => {
    installFetch(() => json(404, { error: "data_not_public" }));
    await assert.rejects(fetchStarMoeUserData("jp", "1", "userCards", ""), { message: "API_NOT_PUBLIC" });
    installFetch(() => json(400, { error: "invalid_uid" }));
    await assert.rejects(fetchStarMoeUserData("jp", "1", "userCards", ""), { message: "USER_NOT_FOUND" });
});

test("hands back to the old read when moesekai-api cannot answer for this visitor", async () => {
    for (const response of [
        json(401, { error: "login_required" }),
        json(404, { error: "not_found" }),
        new Response("404 page not found", { status: 404 }),
        json(503, { error: "unavailable" }),
    ]) {
        installFetch(response);
        assert.equal(await fetchStarMoeUserData("jp", "1", "userCards", ""), null, `status ${response.status}`);
    }
});

test("other failures surface with their status", async () => {
    installFetch(() => json(500, { error: "internal" }));
    await assert.rejects(fetchStarMoeUserData("jp", "1", "userCards", ""), { message: "Failed to fetch user data (500)" });
    installFetch(new TypeError("Failed to fetch"));
    await assert.rejects(fetchStarMoeUserData("jp", "1", "userCards", ""), TypeError);
});
