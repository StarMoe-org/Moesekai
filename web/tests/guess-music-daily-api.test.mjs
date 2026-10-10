/**
 * Daily guess-music API client v2 (src/lib/guess-music/daily-api.ts) against a fake fetch:
 * routes, methods, bodies, the session cookie, error-code mapping, typed answers and the reload store.
 * Run with: node --test tests/guess-music-daily-api.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
    DAILY_TIER_IDS,
    DailyApiError,
    classifyDailyError,
    clearStoredRun,
    createDailyApi,
    formatCountdown,
    formatDuration,
    isDailyTierId,
    loadStoredRun,
    msUntil,
    pruneStoredRuns,
    recentDates,
    resolveTypedAnswer,
    saveStoredRun,
} from "../src/lib/guess-music/daily-api.ts";
import { buildSongIndex } from "../src/lib/guess-music/answer.ts";

function fakeFetch(responder) {
    const calls = [];
    const fetch = async (url, init = {}) => {
        const call = { url, method: init.method ?? "GET", headers: init.headers ?? {}, credentials: init.credentials, body: init.body ? JSON.parse(init.body) : undefined };
        calls.push(call);
        const { status = 200, json, body, contentType = "application/json" } = (await responder(call)) ?? {};
        const payload = json !== undefined ? JSON.stringify(json) : body ?? "";
        return new Response(status === 204 ? null : payload, { status, headers: { "Content-Type": contentType } });
    };
    return { fetch, calls };
}

const TIERS = [
    { id: "hell", rounds: 20, clipSeconds: 5, timeLimitSeconds: 45, answerMode: "type", vocalRemoval: true, available: false },
    { id: "easy", rounds: 20, clipSeconds: 30, timeLimitSeconds: 45, answerMode: "choice", optionCount: 6, vocalRemoval: false, available: true },
    { id: "bogus", rounds: 20, clipSeconds: 1, timeLimitSeconds: 45, answerMode: "type", vocalRemoval: false },
    { id: "normal", rounds: 20, clipSeconds: 15, timeLimitSeconds: 45, answerMode: "suggest", vocalRemoval: false },
    { id: "hard", rounds: 20, clipSeconds: 5, timeLimitSeconds: 45, answerMode: "type", vocalRemoval: false },
];

const INFO = {
    date: "2026-10-09",
    timezone: "Asia/Shanghai",
    nextResetAt: "2026-10-09T16:00:00Z",
    server: "jp",
    authEnabled: true,
    ready: true,
    tiers: TIERS,
    me: { tiers: { easy: { status: "finished", score: 12000, rank: 3 }, hard: { status: "in_progress", resumeRound: 7 } } },
};

test("tier ids", () => {
    assert.deepEqual([...DAILY_TIER_IDS], ["easy", "normal", "hard", "hell"]);
    assert.ok(isDailyTierId("hell"));
    assert.ok(!isDailyTierId("extreme"));
    assert.ok(!isDailyTierId(undefined));
});

test("every contract route uses the right method, path and body", async () => {
    const { fetch, calls } = fakeFetch(({ url, method }) => {
        if (url.endsWith("/game-link/") && method === "DELETE") return { status: 204 };
        if (url.endsWith("/clip/")) return { body: "ID3?", contentType: "audio/mpeg" };
        return { json: url.endsWith("/daily/") ? INFO : {} };
    });
    const api = createDailyApi({ baseUrl: "https://api.example/", fetch });
    await api.getInfo();
    await api.createSession("easy", "ranked");
    await api.createSession("hell", "practice");
    await api.startRound("s/1", 3);
    const blob = await api.fetchClip("/api/guess-music/daily/sessions/s1/rounds/3/clip");
    await api.answer("s1", 3, 42);
    await api.answer("s1", 3, null);
    await api.finish("s1");
    await api.leaderboard({ tier: "hard", date: "2026-10-01", limit: 50 });
    await api.leaderboard({ tier: "easy" });
    await api.me();
    await api.linkGame("tok");
    await api.unlinkGame();

    assert.equal(await blob.text(), "ID3?");
    assert.equal(blob.type, "audio/mpeg");
    assert.deepEqual(
        calls.map((c) => `${c.method} ${c.url}`),
        [
            // Canonical trailing-slash paths: Next's trailingSlash would 308 the bare ones; the Go API trims the slash.
            "GET https://api.example/api/guess-music/daily/",
            "POST https://api.example/api/guess-music/daily/sessions/",
            "POST https://api.example/api/guess-music/daily/sessions/",
            "POST https://api.example/api/guess-music/daily/sessions/s%2F1/rounds/3/start/",
            "GET https://api.example/api/guess-music/daily/sessions/s1/rounds/3/clip/",
            "POST https://api.example/api/guess-music/daily/sessions/s1/rounds/3/answer/",
            "POST https://api.example/api/guess-music/daily/sessions/s1/rounds/3/answer/",
            "POST https://api.example/api/guess-music/daily/sessions/s1/finish/",
            "GET https://api.example/api/guess-music/daily/leaderboard/?tier=hard&date=2026-10-01&limit=50",
            "GET https://api.example/api/guess-music/daily/leaderboard/?tier=easy",
            "GET https://api.example/api/guess-music/me/",
            "POST https://api.example/api/guess-music/me/game-link/",
            "DELETE https://api.example/api/guess-music/me/game-link/",
        ],
    );
    assert.deepEqual(calls[1].body, { tier: "easy", mode: "ranked" });
    assert.deepEqual(calls[2].body, { tier: "hell", mode: "practice" });
    assert.deepEqual(calls[5].body, { musicId: 42 });
    assert.deepEqual(calls[6].body, { musicId: null });
    assert.deepEqual(calls[11].body, { harukiAccessToken: "tok" });
    // Every tier, hell included, serves mp3 clips.
    assert.match(calls[4].headers.Accept, /^audio\/mpeg/);
    assert.doesNotMatch(calls[4].headers.Accept, /wav/);
    assert.equal(calls[5].headers["Content-Type"], "application/json");
});

test("info keeps known tiers in canonical order and the per-tier status", async () => {
    const { fetch } = fakeFetch(() => ({ json: INFO }));
    const info = await createDailyApi({ baseUrl: "", fetch }).getInfo();
    assert.deepEqual(info.tiers.map((tier) => tier.id), ["easy", "normal", "hard", "hell"]);
    assert.equal(info.tiers[0].optionCount, 6);
    assert.equal(info.tiers[3].vocalRemoval, true);
    // hell waits for its instrumentals; a tier without the flag (an older server) counts as playable.
    assert.deepEqual(info.tiers.map((tier) => tier.available), [true, true, true, false]);
    assert.equal(info.me.tiers.hard.resumeRound, 7);
    assert.equal(info.me.tiers.normal, undefined);

    const { fetch: bare } = fakeFetch(() => ({ json: { ...INFO, tiers: undefined, me: undefined } }));
    const empty = await createDailyApi({ baseUrl: "", fetch: bare }).getInfo();
    assert.deepEqual(empty.tiers, []);
    assert.equal(empty.me, undefined);
});

test("relative paths by default, and the session cookie instead of a token", async (t) => {
    // The cookie is first-party to the page, so a split API host must not take these calls.
    const previous = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://api.example";
    t.after(() => {
        if (previous === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = previous;
    });
    const { fetch, calls } = fakeFetch(() => ({ json: INFO }));
    const api = createDailyApi({ fetch });
    await api.getInfo();
    await api.createSession("easy", "ranked");
    await api.fetchClip("/api/guess-music/daily/sessions/s1/rounds/0/clip");
    assert.equal(calls[0].url, "/api/guess-music/daily/");
    assert.equal(calls[2].url, "/api/guess-music/daily/sessions/s1/rounds/0/clip/");
    for (const call of calls) {
        assert.equal(call.credentials, "same-origin");
        assert.equal(call.headers.Authorization, undefined);
    }
});

test("a 401 reports the lost session; other failures do not", async () => {
    let lost = 0;
    const responses = [
        { status: 401, json: { error: "login_required", message: "" } },
        { status: 403, json: { error: "forbidden", message: "" } },
        { status: 404, json: { error: "session_not_found", message: "" } },
        { status: 401, json: { error: "unauthorized", message: "" } },
    ];
    const { fetch } = fakeFetch(() => responses.shift());
    const api = createDailyApi({ baseUrl: "", fetch, onUnauthorized: () => { lost += 1; } });
    await assert.rejects(api.createSession("easy", "ranked"), (error) => error.kind === "loginRequired");
    assert.equal(lost, 1);
    await assert.rejects(api.answer("s1", 0, 1), (error) => error.status === 403);
    await assert.rejects(api.finish("s1"), (error) => error.kind === "sessionExpired");
    assert.equal(lost, 1);
    await assert.rejects(api.me(), (error) => error.kind === "unauthorized");
    assert.equal(lost, 2);
    // Without a listener a 401 is still just an error.
    const { fetch: bare } = fakeFetch(() => ({ status: 401, json: { error: "unauthorized", message: "" } }));
    await assert.rejects(createDailyApi({ baseUrl: "", fetch: bare }).unlinkGame(), (error) => error.kind === "unauthorized");
});

test("already_played keeps its code, message and result", async () => {
    const result = { date: "2026-10-09", tier: "normal", mode: "ranked", totalScore: 4200, correctCount: 6, durationMs: 300000, ranked: true, rank: 3, totalPlayers: 10, rounds: [] };
    const { fetch } = fakeFetch(() => ({ status: 409, json: { error: "already_played", message: "done today", result } }));
    const api = createDailyApi({ baseUrl: "", fetch });
    await assert.rejects(api.createSession("normal", "ranked"), (error) => {
        assert.ok(error instanceof DailyApiError);
        assert.equal(error.code, "already_played");
        assert.equal(error.status, 409);
        assert.equal(error.message, "done today");
        assert.deepEqual(error.result, result);
        assert.equal(error.kind, "alreadyPlayed");
        return true;
    });
});

test("error kinds from codes, statuses and network failures", async () => {
    const cases = [
        [{ status: 401, json: { error: "login_required", message: "" } }, "loginRequired"],
        [{ status: 409, json: { error: "ranked_unavailable", message: "" } }, "rankedUnavailable"],
        [{ status: 409, json: { error: "tier_unavailable", message: "" } }, "tierUnavailable"],
        [{ status: 503, json: { error: "auth_unavailable", message: "" } }, "authUnavailable"],
        [{ status: 429, json: { error: "rate_limited", message: "" } }, "rateLimited"],
        [{ status: 429, body: "slow down", contentType: "text/plain" }, "rateLimited"],
        [{ status: 401, json: { error: "unauthorized", message: "" } }, "unauthorized"],
        [{ status: 404, json: { error: "session_not_found", message: "" } }, "sessionExpired"],
        [{ status: 409, json: { error: "clip_not_served", message: "" } }, "clipNotServed"],
        [{ status: 409, json: { error: "round_not_current", message: "" } }, "conflict"],
        [{ status: 503, json: { error: "not_ready", message: "" } }, "notReady"],
        [{ status: 502, body: "<html>Bad Gateway</html>", contentType: "text/html" }, "server"],
        [{ status: 400, json: { error: "invalid_tier", message: "" } }, "server"],
        [{ status: 500, json: { error: "internal", message: "" } }, "server"],
    ];
    for (const [response, kind] of cases) {
        const { fetch } = fakeFetch(() => response);
        const api = createDailyApi({ baseUrl: "", fetch });
        await assert.rejects(api.answer("s1", 0, 1), (error) => {
            assert.equal(classifyDailyError(error), kind, JSON.stringify(response));
            return true;
        });
    }
    const offline = createDailyApi({ baseUrl: "", fetch: async () => { throw new TypeError("Failed to fetch"); } });
    await assert.rejects(offline.getInfo(), (error) => error instanceof DailyApiError && error.code === "network" && error.kind === "network");
    const html = createDailyApi({ baseUrl: "", fetch: async () => new Response("<html>", { status: 200 }) });
    await assert.rejects(html.getInfo(), (error) => error instanceof DailyApiError && error.code === "bad_response");
    assert.equal(classifyDailyError(new Error("boom")), "network");
});

test("aborts propagate untouched", async () => {
    const controller = new AbortController();
    const api = createDailyApi({
        baseUrl: "",
        fetch: (_url, init) => new Promise((_resolve, reject) => {
            const abort = () => reject(new DOMException("aborted", "AbortError"));
            if (init.signal.aborted) abort();
            else init.signal.addEventListener("abort", abort);
        }),
    });
    const pending = api.leaderboard({ tier: "easy" }, controller.signal);
    controller.abort();
    await assert.rejects(pending, (error) => error.name === "AbortError" && !(error instanceof DailyApiError));
});

test("typed answers resolve to one song, nothing, or an ambiguous alias", () => {
    const index = buildSongIndex([
        { id: 1, title: "Tell Your World", pronunciation: "てるゆあわーるど", localizedTitle: "告诉你的世界", aliases: ["tyw", "神曲"] },
        { id: 2, title: "メルト", pronunciation: "めると", aliases: ["神曲", "M"] },
        { id: 3, title: "テオ", pronunciation: "てお", aliases: ["tyw"] },
        { id: 9, title: "Tell Your World", pronunciation: "てるゆあわーるど" },
        { id: 4, title: "01", pronunciation: "ぜろいち", aliases: ["01"] },
    ]);
    assert.deepEqual(resolveTypedAnswer(index, "  "), { status: "empty" });
    assert.deepEqual(resolveTypedAnswer(index, "ＴＥＬＬ　ｙｏｕｒ world"), { status: "match", musicId: 1 });
    assert.deepEqual(resolveTypedAnswer(index, "告诉你的世界"), { status: "match", musicId: 1 });
    assert.deepEqual(resolveTypedAnswer(index, "メルト"), { status: "match", musicId: 2 });
    assert.deepEqual(resolveTypedAnswer(index, "テオ"), { status: "match", musicId: 3 });
    assert.deepEqual(resolveTypedAnswer(index, "てお"), { status: "match", musicId: 3 });
    assert.deepEqual(resolveTypedAnswer(index, "TYW"), { status: "ambiguous", musicIds: [1, 3] });
    assert.deepEqual(resolveTypedAnswer(index, "神曲"), { status: "ambiguous", musicIds: [1, 2] });
    // One-character aliases are not accepted; titles still are.
    assert.deepEqual(resolveTypedAnswer(index, "m"), { status: "none" });
    assert.deepEqual(resolveTypedAnswer(index, "01"), { status: "match", musicId: 4 });
    assert.deepEqual(resolveTypedAnswer(index, "メル"), { status: "none" });
});

test("the reload store keeps one run per date, tier and mode", () => {
    const store = new Map();
    globalThis.sessionStorage = {
        get length() {
            return store.size;
        },
        key: (i) => [...store.keys()][i] ?? null,
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
    };
    try {
        const run = {
            date: "2026-10-09",
            tier: "easy",
            mode: "practice",
            sessionId: "s1",
            ranked: false,
            rounds: 20,
            round: 4,
            totalScore: 3100,
            combo: 2,
            answered: [{ round: 0, correct: true, points: 900 }],
            wrongGuesses: [7],
            clipStartedAt: 123,
        };
        saveStoredRun(run);
        saveStoredRun({ ...run, tier: "hell", sessionId: "s2" });
        assert.deepEqual(loadStoredRun("2026-10-09", "easy", "practice"), run);
        assert.equal(loadStoredRun("2026-10-09", "hell", "practice").sessionId, "s2");
        assert.equal(loadStoredRun("2026-10-09", "easy", "ranked"), null);
        assert.equal(loadStoredRun("2026-10-10", "easy", "practice"), null);
        clearStoredRun("2026-10-09", "easy", "practice");
        assert.equal(loadStoredRun("2026-10-09", "easy", "practice"), null);

        store.set("moesekai:guess-music:daily-run:2026-10-09:normal:ranked", "{not json");
        assert.equal(loadStoredRun("2026-10-09", "normal", "ranked"), null);

        saveStoredRun({ ...run, date: "2026-10-08" });
        store.set("moesekai:guess-music:daily-run", "{}");
        store.set("unrelated", "keep");
        pruneStoredRuns("2026-10-09");
        assert.deepEqual([...store.keys()].sort(), [
            "moesekai:guess-music:daily-run:2026-10-09:hell:practice",
            "moesekai:guess-music:daily-run:2026-10-09:normal:ranked",
            "unrelated",
        ]);
    } finally {
        delete globalThis.sessionStorage;
    }
    assert.equal(loadStoredRun("2026-10-09", "hell", "practice"), null);
});

test("time and date helpers", () => {
    assert.equal(msUntil("2026-10-09T16:00:00Z", Date.parse("2026-10-09T15:59:00Z")), 60_000);
    assert.equal(msUntil("2026-10-09T16:00:00Z", Date.parse("2026-10-09T17:00:00Z")), 0);
    assert.equal(msUntil("not a date"), 0);
    assert.equal(formatCountdown(3_723_000), "01:02:03");
    assert.equal(formatDuration(83_450), "1:23.5");
    assert.equal(formatDuration(5_000), "0:05.0");
    const dates = recentDates("2026-03-01", 30);
    assert.equal(dates.length, 31);
    assert.equal(dates[0], "2026-03-01");
    assert.equal(dates[1], "2026-02-28");
    assert.equal(dates[30], "2026-01-30");
});

test("moesekai-api on another origin gets the session cookie", async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: INFO }));
    const api = createDailyApi({ baseUrl: "https://passport.pjsk.moe", fetch });
    await api.getInfo();
    await api.fetchClip("/api/guess-music/daily/sessions/s1/rounds/0/clip");
    assert.equal(calls[0].url, "https://passport.pjsk.moe/api/guess-music/daily/");
    assert.equal(calls[1].url, "https://passport.pjsk.moe/api/guess-music/daily/sessions/s1/rounds/0/clip/");
    for (const call of calls) assert.equal(call.credentials, "include");
});
