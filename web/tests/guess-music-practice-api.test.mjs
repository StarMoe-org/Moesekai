/**
 * Free play's vocal-removal client (src/lib/guess-music/practice-api.ts) against a fake fetch:
 * the instrumental catalog, clip requests, error kinds, and when the switch and the hell preset are usable.
 * Run with: node --test tests/guess-music-practice-api.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
    PRACTICE_CLIP_REUSE_MS,
    PracticeApiError,
    classifyPracticeError,
    createPracticeApi,
    createPracticeClipCache,
    normalizeCatalog,
    vocalRemovalState,
} from "../src/lib/guess-music/practice-api.ts";

function fakeFetch(responder) {
    const calls = [];
    const fetch = async (url, init = {}) => {
        const call = { url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined };
        calls.push(call);
        const { status = 200, json, body, contentType = "application/json" } = (await responder(call)) ?? {};
        const payload = json !== undefined ? JSON.stringify(json) : body ?? "";
        return new Response(payload, { status, headers: { "Content-Type": contentType } });
    };
    return { fetch, calls };
}

test("the catalog lists vocal ids only and reads anything odd as unavailable", async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { available: true, server: "jp", vocalIds: [11, 12, 0, -3, 1.5, "13", 14] } }));
    const catalog = await createPracticeApi({ baseUrl: "", fetch }).instrumentals();
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "/api/guess-music/practice/instrumentals/");
    assert.deepEqual(catalog, { available: true, server: "jp", vocalIds: [11, 12, 14] });

    assert.deepEqual(normalizeCatalog({ available: false, server: "jp", vocalIds: [] }), { available: false, server: "jp", vocalIds: [] });
    // "available" with nothing in it cannot run a game.
    assert.equal(normalizeCatalog({ available: true, server: "jp", vocalIds: [] }).available, false);
    assert.deepEqual(normalizeCatalog(null), { available: false, server: "jp", vocalIds: [] });
    assert.equal(normalizeCatalog({ available: "yes", vocalIds: [1] }).available, false);
});

test("a clip request sends the vocal, length, seed and round, and resolves the clip URL", async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { clipUrl: "/api/guess-music/practice/clips/tok123", startSeconds: 61.25, clipSeconds: 5 } }));
    const api = createPracticeApi({ baseUrl: "https://api.example/", fetch });
    const clip = await api.clip({ vocalId: 42, clipSeconds: 5, seed: "x".repeat(80), round: 7 });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "https://api.example/api/guess-music/practice/clips/");
    assert.equal(calls[0].headers["Content-Type"], "application/json");
    assert.deepEqual(calls[0].body, { vocalId: 42, clipSeconds: 5, seed: "x".repeat(64), round: 7 });
    assert.deepEqual(clip, { clipUrl: "https://api.example/api/guess-music/practice/clips/tok123/", startSeconds: 61.25, clipSeconds: 5 });

    // Relative by default; a missing clipSeconds falls back to the requested one.
    const { fetch: bare } = fakeFetch(() => ({ json: { clipUrl: "/api/guess-music/practice/clips/t", startSeconds: 9 } }));
    const relative = await createPracticeApi({ baseUrl: "", fetch: bare }).clip({ vocalId: 1, clipSeconds: 15, seed: "s", round: 0 });
    assert.deepEqual(relative, { clipUrl: "/api/guess-music/practice/clips/t/", startSeconds: 9, clipSeconds: 15 });

    const { fetch: broken } = fakeFetch(() => ({ json: { startSeconds: 3 } }));
    await assert.rejects(createPracticeApi({ baseUrl: "", fetch: broken }).clip({ vocalId: 1, clipSeconds: 2, seed: "s", round: 0 }), (error) => {
        assert.ok(error instanceof PracticeApiError);
        assert.equal(error.code, "bad_response");
        return true;
    });
});

test("error kinds: rate limit and outages can be retried, an unknown vocal falls back", async () => {
    const cases = [
        [{ status: 429, json: { error: "rate_limited", message: "" } }, "rateLimited"],
        [{ status: 429, body: "slow down", contentType: "text/plain" }, "rateLimited"],
        [{ status: 409, json: { error: "inst_unavailable", message: "" } }, "unavailable"],
        [{ status: 404, json: { error: "unknown_vocal", message: "" } }, "unknownVocal"],
        [{ status: 400, json: { error: "bad_request", message: "" } }, "server"],
        [{ status: 502, body: "<html>Bad Gateway</html>", contentType: "text/html" }, "server"],
    ];
    for (const [response, kind] of cases) {
        const { fetch } = fakeFetch(() => response);
        await assert.rejects(createPracticeApi({ baseUrl: "", fetch }).clip({ vocalId: 1, clipSeconds: 5, seed: "s", round: 0 }), (error) => {
            assert.ok(error instanceof PracticeApiError);
            assert.equal(error.kind, kind, JSON.stringify(response));
            return true;
        });
    }
    const offline = createPracticeApi({ baseUrl: "", fetch: async () => { throw new TypeError("Failed to fetch"); } });
    await assert.rejects(offline.instrumentals(), (error) => error instanceof PracticeApiError && error.kind === "network");
    await assert.rejects(offline.clip({ vocalId: 1, clipSeconds: 5, seed: "s", round: 0 }), (error) => error.kind === "network");
    assert.equal(classifyPracticeError(new Error("boom")), "network");

    const controller = new AbortController();
    const hanging = createPracticeApi({
        baseUrl: "",
        fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    });
    const pending = hanging.instrumentals(controller.signal);
    controller.abort();
    await assert.rejects(pending, (error) => error.name === "AbortError" && !(error instanceof PracticeApiError));
});

test("vocal removal is usable only on JP with a loaded, non-empty catalog", () => {
    const ready = { status: "loaded", catalog: { available: true, server: "jp", vocalIds: [1] } };
    assert.equal(vocalRemovalState("jp", ready), "ready");
    assert.equal(vocalRemovalState("jp", { status: "loading" }), "loading");
    assert.equal(vocalRemovalState("jp", { status: "failed" }), "unavailable");
    assert.equal(vocalRemovalState("jp", { status: "loaded", catalog: { available: false, server: "jp", vocalIds: [] } }), "unavailable");
    // CN has no instrumentals: disabled right away, without waiting for the server.
    assert.equal(vocalRemovalState("cn", { status: "loading" }), "serverUnsupported");
    assert.equal(vocalRemovalState("cn", ready), "serverUnsupported");
    assert.equal(vocalRemovalState("cn", { status: "failed" }), "serverUnsupported");
});

test("the clip cache sends one request per clip and forgets failures so a retry asks again", async () => {
    let status = 429;
    const { fetch, calls } = fakeFetch(() =>
        status === 200 ? { json: { clipUrl: "/api/guess-music/practice/clips/t1", startSeconds: 12, clipSeconds: 5 } } : { status, json: { error: "rate_limited", message: "" } },
    );
    const cache = createPracticeClipCache(createPracticeApi({ baseUrl: "", fetch }));
    const request = { vocalId: 7, clipSeconds: 5, seed: "s", round: 3 };
    await assert.rejects(cache.get("1:3:7", request), (error) => error.kind === "rateLimited");
    status = 200;
    // The preload and the round itself share one request.
    const [preloaded, played] = await Promise.all([cache.get("1:3:7", request), cache.get("1:3:7", request)]);
    assert.equal(preloaded, played);
    assert.equal(played.startSeconds, 12);
    assert.equal(calls.length, 2);
    await cache.get("1:3:7", request);
    assert.equal(calls.length, 2);
    await cache.get("2:3:7", request);
    assert.equal(calls.length, 3, "a new game asks again");
});

test("the clip cache asks again before a signed clip URL expires", async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { clipUrl: "/api/guess-music/practice/clips/t1", startSeconds: 12, clipSeconds: 5 } }));
    let clock = 1_000_000;
    const cache = createPracticeClipCache(createPracticeApi({ baseUrl: "", fetch }), () => clock);
    const request = { vocalId: 7, clipSeconds: 5, seed: "s", round: 3 };
    await cache.get("1:3:7", request);
    clock += PRACTICE_CLIP_REUSE_MS - 1;
    await cache.get("1:3:7", request);
    assert.equal(calls.length, 1, "still fresh");
    clock += 1;
    await cache.get("1:3:7", request);
    assert.equal(calls.length, 2, "a stale URL is replaced");
});
