/**
 * The StarMoe pass account store (src/lib/moesekai-account.ts) against a fake fetch:
 * reading /api/auth/me, one shared request, failures, the 401 sign-out, the sign-in /
 * sign-out navigations, and the hook's focus refetch.
 * Run with: node --test tests/moesekai-account.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/lib/moesekai-account.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const MIZUKI = { id: "sub-1", name: "Mizuki", username: "mizuki_a", picture: "https://example.com/a.png" };
const MIZUKI_STATE = { status: "signed-in", user: { id: "sub-1", name: "Mizuki", username: "mizuki_a", avatar: "https://example.com/a.png" } };

/** Records requests and answers them from `responses` (an empty queue is a network failure). */
function installFetch() {
    const calls = [];
    const responses = [];
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method ?? "GET", credentials: init.credentials, headers: init.headers ?? {} });
        const next = responses.shift();
        if (!next) throw new TypeError("Failed to fetch");
        if (next.pending) return next.pending;
        return new Response(next.body === undefined ? "" : JSON.stringify(next.body), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
    };
    return { calls, responses };
}

/** A fresh copy of the module: its store is module-level state. `apiOrigin` stands in for NEXT_PUBLIC_MOESEKAI_API_ORIGIN. */
function loadModule(apiOrigin = "") {
    const loaded = { exports: {} };
    const origin = { MOESEKAI_API_ORIGIN: apiOrigin, apiCredentials: (base) => (base ? "include" : "same-origin") };
    const localRequire = (id) => (id === "./moesekai-api-origin.ts" ? origin : require(id));
    new Function("require", "exports", "module", compiled)(localRequire, loaded.exports, loaded);
    return loaded.exports;
}

/** The module in a minimal fake browser whose navigations are recorded. */
function loadAccount({ path = "/zh-cn/guess-music/", search = "?tab=daily", lang = "zh-CN", apiOrigin = "" } = {}) {
    const assigned = [];
    globalThis.window = {
        location: { origin: "https://pjsk.moe", pathname: path, search, assign: (url) => assigned.push(url) },
        addEventListener() {},
        removeEventListener() {},
    };
    globalThis.document = { documentElement: { lang } };
    return { account: loadModule(apiOrigin), assigned, ...installFetch() };
}

function cleanup() {
    delete globalThis.window;
    delete globalThis.document;
}

test("an /api/auth/me body becomes the account state", (t) => {
    t.after(cleanup);
    const { account } = loadAccount();
    assert.deepEqual(account.parseAccountResponse({ user: MIZUKI }), MIZUKI_STATE);
    // name, else username, else "StarMoe"; only http(s) avatars.
    assert.equal(account.parseAccountResponse({ user: { id: "s", name: " ", username: "u" } }).user.name, "u");
    assert.equal(account.parseAccountResponse({ user: { id: "s" } }).user.name, "StarMoe");
    assert.equal(account.parseAccountResponse({ user: { id: "s", picture: "javascript:alert(1)" } }).user.avatar, null);
    assert.deepEqual(account.parseAccountResponse({ user: null }), { status: "signed-out", user: null });
    assert.deepEqual(account.parseAccountResponse({ user: null, available: false }), { status: "unavailable", user: null });
    assert.equal(account.parseAccountResponse({ user: { name: "no id" } }), null);
    assert.equal(account.parseAccountResponse({ error: "unavailable" }), null);
    assert.equal(account.parseAccountResponse("<html>"), null);
});

test("sign-in and sign-out URLs", (t) => {
    t.after(cleanup);
    const { account } = loadAccount();
    assert.equal(account.buildSignInUrl("/zh-cn/guess-music/?tab=daily", "zh-CN"), "/api/auth/login?return=%2Fzh-cn%2Fguess-music%2F%3Ftab%3Ddaily&locale=zh-CN");
    assert.equal(account.buildSignInUrl("/", "not a locale!"), "/api/auth/login?return=%2F");
    assert.equal(account.buildSignInUrl("/", null), "/api/auth/login?return=%2F");

    const endSession = "https://passport.star.moe/oidc/session/end?client_id=c&post_logout_redirect_uri=https%3A%2F%2Fpjsk.moe%2F";
    assert.equal(account.signOutDestination({ redirect: endSession }, "https://pjsk.moe"), endSession);
    assert.equal(account.signOutDestination({ redirect: "https://pjsk.moe/" }, "https://pjsk.moe"), "https://pjsk.moe/");
    assert.equal(account.signOutDestination({ redirect: "javascript:alert(1)" }, "https://pjsk.moe"), "https://pjsk.moe/");
    assert.equal(account.signOutDestination(null, "https://pjsk.moe"), "https://pjsk.moe/");
});

test("concurrent checks share one same-origin request without a token", async (t) => {
    t.after(cleanup);
    const { account, calls, responses } = loadAccount();
    assert.deepEqual(account.getMoesekaiAccount(), { status: "loading", user: null });
    responses.push({ body: { user: MIZUKI } });
    await Promise.all([account.refreshMoesekaiAccount(), account.refreshMoesekaiAccount()]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/auth/me");
    assert.equal(calls[0].credentials, "same-origin");
    assert.equal(calls[0].headers.Authorization, undefined);
    assert.deepEqual(account.getMoesekaiAccount(), MIZUKI_STATE);
});

test("a failed first check means unavailable; a later failure keeps what is known", async (t) => {
    t.after(cleanup);
    const down = loadAccount();
    down.responses.push({ status: 502, body: { error: "upstream_unavailable" } });
    await down.account.refreshMoesekaiAccount();
    assert.equal(down.account.getMoesekaiAccount().status, "unavailable");
    // Back up later: the next check settles it.
    down.responses.push({ body: { user: null } });
    await down.account.refreshMoesekaiAccount();
    assert.equal(down.account.getMoesekaiAccount().status, "signed-out");

    const flaky = loadAccount();
    flaky.responses.push({ body: { user: MIZUKI } });
    await flaky.account.refreshMoesekaiAccount();
    await flaky.account.refreshMoesekaiAccount(); // offline
    assert.deepEqual(flaky.account.getMoesekaiAccount(), MIZUKI_STATE);

    const unconfigured = loadAccount();
    unconfigured.responses.push({ body: { user: null, available: false } });
    await unconfigured.account.refreshMoesekaiAccount();
    assert.equal(unconfigured.account.getMoesekaiAccount().status, "unavailable");
});

test("asking again on demand only follows a failed check", async (t) => {
    t.after(cleanup);
    const { account, calls, responses } = loadAccount();
    responses.push({ status: 503, body: { error: "unavailable" } });
    await account.refreshMoesekaiAccount();
    assert.equal(account.getMoesekaiAccount().status, "unavailable");
    // Another API call just worked: the account is asked again at once.
    responses.push({ body: { user: MIZUKI } });
    await account.retryMoesekaiAccount();
    assert.equal(calls.length, 2);
    assert.deepEqual(account.getMoesekaiAccount(), MIZUKI_STATE);
    // Known now: nothing to retry.
    await account.retryMoesekaiAccount();
    assert.equal(calls.length, 2);

    // "available: false" is the server's answer, not a failure.
    const unconfigured = loadAccount();
    unconfigured.responses.push({ body: { user: null, available: false } });
    await unconfigured.account.refreshMoesekaiAccount();
    await unconfigured.account.retryMoesekaiAccount();
    assert.equal(unconfigured.calls.length, 1);
    assert.equal(unconfigured.account.getMoesekaiAccount().status, "unavailable");
});

test("a 401 signs a signed-in account out, and an answer requested before it cannot undo that", async (t) => {
    t.after(cleanup);
    const { account, responses } = loadAccount();
    account.markSignedOut();
    assert.equal(account.getMoesekaiAccount().status, "loading", "only a signed-in account changes");

    responses.push({ body: { user: MIZUKI } });
    await account.refreshMoesekaiAccount();
    let release;
    responses.push({ pending: new Promise((resolve) => { release = resolve; }) });
    const stale = account.refreshMoesekaiAccount();
    account.markSignedOut();
    release(new Response(JSON.stringify({ user: MIZUKI }), { status: 200 }));
    await stale;
    assert.deepEqual(account.getMoesekaiAccount(), { status: "signed-out", user: null });

    responses.push({ body: { user: MIZUKI } });
    await account.refreshMoesekaiAccount();
    assert.deepEqual(account.getMoesekaiAccount(), MIZUKI_STATE, "a later check signs in again");
});

test("signing in goes to the server with this page and the UI locale", (t) => {
    t.after(cleanup);
    const { account, assigned } = loadAccount({ path: "/ja-jp/guess-music/", search: "?tab=daily", lang: "ja-JP" });
    const here = "/api/auth/login?return=%2Fja-jp%2Fguess-music%2F%3Ftab%3Ddaily&locale=ja-JP";
    account.signIn();
    account.signIn("/ja-jp/music/1/");
    // Anything but a same-origin path (a click event, "//evil") falls back to this page.
    account.signIn({ type: "click" });
    account.signIn("//evil.example/");
    assert.deepEqual(assigned, [here, "/api/auth/login?return=%2Fja-jp%2Fmusic%2F1%2F&locale=ja-JP", here, here]);
});

test("signing out posts to the server and follows its redirect", async (t) => {
    t.after(cleanup);
    const { account, assigned, calls, responses } = loadAccount();
    responses.push({ body: { user: MIZUKI } });
    await account.refreshMoesekaiAccount();

    responses.push({ status: 403, body: { error: "forbidden" } });
    await assert.rejects(account.signOut(), /SIGN_OUT_FAILED_403/);
    await assert.rejects(account.signOut(), TypeError);
    assert.deepEqual(assigned, [], "a failed sign-out stays on the page");
    assert.deepEqual(account.getMoesekaiAccount(), MIZUKI_STATE);

    const redirect = "https://passport.star.moe/oidc/session/end?client_id=c";
    responses.push({ body: { redirect } });
    await account.signOut();
    const logout = calls.at(-1);
    assert.equal(logout.url, "/api/auth/logout");
    assert.equal(logout.method, "POST");
    assert.equal(logout.credentials, "same-origin");
    assert.deepEqual(assigned, [redirect]);
    assert.equal(account.getMoesekaiAccount().status, "signed-out");
});

test("components share one request; focus checks again at most once a minute", async (t) => {
    const dom = new JSDOM("<!doctype html><html lang='zh-CN'><body><div id='root'></div></body></html>", { url: "https://pjsk.moe/zh-cn/guess-music/" });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const realNow = Date.now;
    t.after(() => {
        Date.now = realNow;
        delete globalThis.IS_REACT_ACT_ENVIRONMENT;
        cleanup();
        dom.window.close();
    });
    const { calls, responses } = installFetch();
    const account = loadModule();
    const React = require("react");
    const { createRoot } = require("react-dom/client");

    const seen = [];
    function Probe({ name }) {
        const state = account.useMoesekaiAccount();
        seen.push(`${name}:${state.status}`);
        return null;
    }
    const root = createRoot(document.getElementById("root"));
    responses.push({ body: { user: MIZUKI } });
    await React.act(async () => {
        root.render(React.createElement(React.Fragment, null, React.createElement(Probe, { name: "chip" }), React.createElement(Probe, { name: "panel" })));
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(seen.slice(-2), ["chip:signed-in", "panel:signed-in"]);

    // Too soon: focus is ignored.
    await React.act(async () => {
        window.dispatchEvent(new window.FocusEvent("focus"));
    });
    assert.equal(calls.length, 1);

    // A minute later the server is asked again; the session ended elsewhere.
    const later = realNow() + 61_000;
    Date.now = () => later;
    responses.push({ body: { user: null } });
    await React.act(async () => {
        window.dispatchEvent(new window.FocusEvent("focus"));
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(seen.slice(-2), ["chip:signed-out", "panel:signed-out"]);

    // Unmounted: no listener left.
    await React.act(async () => root.unmount());
    Date.now = () => later + 61_000;
    window.dispatchEvent(new window.FocusEvent("focus"));
    assert.equal(calls.length, 2);
});

test("a failed first check is asked again on a backoff while the account is in use", async (t) => {
    const dom = new JSDOM("<!doctype html><html lang='zh-CN'><body><div id='root'></div></body></html>", { url: "https://pjsk.moe/zh-cn/guess-music/" });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    t.mock.timers.enable({ apis: ["setTimeout"] });
    t.after(() => {
        delete globalThis.IS_REACT_ACT_ENVIRONMENT;
        cleanup();
        dom.window.close();
    });
    const { calls, responses } = installFetch();
    const account = loadModule();
    const React = require("react");
    const { createRoot } = require("react-dom/client");

    const seen = [];
    function Probe() {
        seen.push(account.useMoesekaiAccount().status);
        return null;
    }
    const root = createRoot(document.getElementById("root"));
    // The API is restarting.
    responses.push({ status: 502, body: { error: "upstream_unavailable" } });
    await React.act(async () => root.render(React.createElement(Probe)));
    assert.equal(calls.length, 1);
    assert.equal(seen.at(-1), "unavailable");

    // Still down after 5 s; the next try waits 15 s.
    responses.push({ status: 502, body: { error: "upstream_unavailable" } });
    await React.act(async () => t.mock.timers.tick(5_000));
    assert.equal(calls.length, 2);
    await React.act(async () => t.mock.timers.tick(14_999));
    assert.equal(calls.length, 2);
    responses.push({ body: { user: MIZUKI } });
    await React.act(async () => t.mock.timers.tick(1));
    assert.equal(calls.length, 3);
    assert.equal(seen.at(-1), "signed-in");

    // Back up: no more tries.
    await React.act(async () => t.mock.timers.tick(120_000));
    assert.equal(calls.length, 3);

    // Unmounting stops a pending try.
    await React.act(async () => root.unmount());
    const fresh = loadModule();
    const again = createRoot(document.getElementById("root"));
    function FreshProbe() {
        fresh.useMoesekaiAccount();
        return null;
    }
    await React.act(async () => again.render(React.createElement(FreshProbe)));
    assert.equal(calls.length, 4, "a fresh store checks once (the queue is empty: offline)");
    await React.act(async () => again.unmount());
    await React.act(async () => t.mock.timers.tick(120_000));
    assert.equal(calls.length, 4);
});

test("with moesekai-api on its own origin, every request goes there with credentials", async (t) => {
    t.after(cleanup);
    const api = "https://passport.pjsk.moe";
    const { account, assigned, calls, responses } = loadAccount({ apiOrigin: api, path: "/zh-cn/guess-music/", search: "" });
    responses.push({ body: { user: MIZUKI } });
    await account.refreshMoesekaiAccount();
    assert.equal(calls[0].url, `${api}/api/auth/me`);
    assert.equal(calls[0].credentials, "include");

    account.signIn();
    assert.deepEqual(assigned, [`${api}/api/auth/login?return=%2Fzh-cn%2Fguess-music%2F&locale=zh-CN`]);

    responses.push({ body: { redirect: "https://passport.star.moe/oidc/session/end?client_id=c" } });
    await account.signOut();
    assert.equal(calls.at(-1).url, `${api}/api/auth/logout`);
    assert.equal(calls.at(-1).credentials, "include");
});
