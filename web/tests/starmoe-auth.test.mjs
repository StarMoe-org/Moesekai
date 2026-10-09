import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);

function loadModule(relativePath, resolve = () => undefined) {
    const source = readFileSync(new URL(relativePath, root), "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const compiledModule = { exports: {} };
    new Function("require", "exports", "module", compiled)((id) => resolve(id) ?? require(id), compiledModule.exports, compiledModule);
    return compiledModule.exports;
}

const core = loadModule("src/lib/starmoe-auth-core.ts");
const ISSUER = "https://passport.star.moe/oidc";
const CLIENT_ID = "test-client-id";
const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);
const nowSeconds = Math.floor(NOW / 1000);

function encodeSegment(value) {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeIdToken(claims) {
    return `${encodeSegment({ alg: "ES384", typ: "JWT", kid: "test" })}.${encodeSegment(claims)}.c2lnbmF0dXJl`;
}

function claims(overrides = {}) {
    return {
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "a1b2c3d4e5f6",
        iat: nowSeconds,
        exp: nowSeconds + 3600,
        nonce: "nonce-1",
        name: "Mizuki",
        username: "mizuki_a",
        picture: "https://example.com/a.png",
        ...overrides,
    };
}

const checkOptions = (overrides = {}) => ({ issuer: ISSUER, clientId: CLIENT_ID, nowMs: NOW, expectedNonce: "nonce-1", requireNonce: true, ...overrides });

test("PKCE S256 matches the RFC 7636 appendix B test vector", async () => {
    assert.equal(
        await core.computeCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
    const pair = await core.createPkcePair();
    assert.match(pair.codeVerifier, /^[A-Za-z0-9_-]{43,128}$/);
    assert.equal(pair.codeVerifier.length, 64);
    assert.equal(pair.codeChallenge, await core.computeCodeChallenge(pair.codeVerifier));
    assert.notEqual((await core.createPkcePair()).codeVerifier, pair.codeVerifier);
    assert.match(core.randomUrlSafeString(24), /^[A-Za-z0-9_-]{32}$/);
});

test("authorization URL carries the client, PKCE, state, nonce and scope", () => {
    const url = new URL(core.buildAuthorizationUrl({
        issuer: `${ISSUER}/`,
        clientId: CLIENT_ID,
        redirectUri: "https://pjsk.moe/auth/starmoe/callback/",
        state: "state-1",
        nonce: "nonce-1",
        codeChallenge: "challenge-1",
        uiLocales: "zh-CN",
    }));
    assert.equal(`${url.origin}${url.pathname}`, "https://passport.star.moe/oidc/auth");
    const params = Object.fromEntries(url.searchParams);
    assert.deepEqual(params, {
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: "https://pjsk.moe/auth/starmoe/callback/",
        scope: "openid profile offline_access",
        state: "state-1",
        nonce: "nonce-1",
        code_challenge: "challenge-1",
        code_challenge_method: "S256",
        prompt: "consent",
        ui_locales: "zh-CN",
    });
    assert.throws(() => core.buildAuthorizationUrl({ issuer: ISSUER, clientId: "", redirectUri: "x", state: "s", nonce: "n", codeChallenge: "c" }), /CLIENT_ID_MISSING/);
});

test("endpoints follow the issuer and end-session carries the id_token_hint", () => {
    assert.deepEqual(core.getStarMoeEndpoints(ISSUER), {
        authorization: `${ISSUER}/auth`,
        token: `${ISSUER}/token`,
        userinfo: `${ISSUER}/me`,
        jwks: `${ISSUER}/jwks`,
        endSession: `${ISSUER}/session/end`,
    });
    assert.equal(core.normalizeIssuer(""), ISSUER);
    assert.equal(core.normalizeIssuer("https://id.example.com/oidc//"), "https://id.example.com/oidc");
    const url = new URL(core.buildEndSessionUrl({ issuer: ISSUER, clientId: CLIENT_ID, idTokenHint: "tok", postLogoutRedirectUri: "https://pjsk.moe/auth/starmoe/callback/", state: "s" }));
    assert.equal(url.pathname, "/oidc/session/end");
    assert.equal(url.searchParams.get("id_token_hint"), "tok");
    assert.equal(url.searchParams.get("post_logout_redirect_uri"), "https://pjsk.moe/auth/starmoe/callback/");
    assert.equal(url.searchParams.get("state"), "s");
});

test("returnTo stays on the same origin", () => {
    const origin = "https://pjsk.moe";
    const ok = [
        ["/zh-cn/guess-music/", "/zh-cn/guess-music/"],
        ["/zh-cn/guess-music/?tab=daily#top", "/zh-cn/guess-music/?tab=daily#top"],
        ["https://pjsk.moe/ja-jp/guess-music/?tab=daily", "/ja-jp/guess-music/?tab=daily"],
    ];
    for (const [input, expected] of ok) assert.equal(core.sanitizeReturnTo(input, origin), expected, input);
    const rejected = [
        "//evil.example/path",
        "/%2F%2Fevil.example",
        "/\\evil.example",
        "https://evil.example/zh-cn/",
        "http://pjsk.moe/zh-cn/",
        "javascript:alert(1)",
        "guess-music",
        "/zh-cn/auth/starmoe/callback/?code=x",
        "/a\nb",
        "",
        null,
        42,
    ];
    for (const input of rejected) assert.equal(core.sanitizeReturnTo(input, origin, "/fallback"), "/fallback", String(input));
});

test("pending sign-ins are one-time, unexpired and keyed by their own state", () => {
    const entry = (state, createdAt) => ({ state, nonce: `n-${state}`, codeVerifier: "v", redirectUri: "r", returnTo: "/", createdAt });
    const raw = JSON.stringify({
        good: entry("good", NOW - 1000),
        old: entry("old", NOW - core.STARMOE_PENDING_TTL_MS - 1),
        future: entry("future", NOW + 60_000),
        mismatched: entry("other", NOW),
        broken: { state: "broken" },
    });
    const map = core.parsePendingSignIns(raw, NOW);
    assert.deepEqual(Object.keys(map), ["good"]);
    assert.deepEqual(core.parsePendingSignIns("not json", NOW), {});

    const unknown = core.takePending(map, "forged");
    assert.equal(unknown.pending, null);
    assert.equal(core.takePending(map, null).pending, null);
    assert.equal(core.takePending(map, "__proto__").pending, null);

    const taken = core.takePending(map, "good");
    assert.equal(taken.pending.nonce, "n-good");
    assert.deepEqual(taken.rest, {});
    assert.equal(core.takePending(taken.rest, "good").pending, null, "a state cannot be replayed");
});

test("ID token claims: issuer, audience, nonce and time checks", () => {
    const check = (overrides, options) => core.checkIdTokenClaims(claims(overrides), checkOptions(options));
    assert.equal(check({}), null);
    assert.equal(check({ iss: "https://passport.star.moe/oidc/" }), "issuer_mismatch");
    assert.equal(check({ iss: "https://evil.example/oidc" }), "issuer_mismatch");
    assert.equal(check({ aud: "someone-else" }), "audience_mismatch");
    assert.equal(check({ aud: ["someone-else", CLIENT_ID] }), null);
    assert.equal(check({ aud: ["someone-else", CLIENT_ID], azp: "someone-else" }), "audience_mismatch");
    assert.equal(check({ sub: "" }), "subject_missing");
    assert.equal(check({ nonce: "nonce-2" }), "nonce_mismatch");
    assert.equal(check({ nonce: undefined }), "nonce_mismatch");
    assert.equal(check({}, { expectedNonce: null }), "nonce_mismatch", "sign-in always needs the nonce it sent");
    // Refreshed ID tokens may omit the nonce but must not carry a different one.
    assert.equal(check({ nonce: undefined }, { requireNonce: false }), null);
    assert.equal(check({ nonce: "nonce-2" }, { requireNonce: false }), "nonce_mismatch");
    // exp/iat/nbf allow 60 s of clock skew.
    assert.equal(check({ exp: nowSeconds - 30 }), null);
    assert.equal(check({ exp: nowSeconds - 61 }), "token_expired");
    assert.equal(check({ exp: "soon" }), "token_expired");
    assert.equal(check({ iat: nowSeconds + 30 }), null);
    assert.equal(check({ iat: nowSeconds + 120 }), "token_not_yet_valid");
    assert.equal(check({ nbf: nowSeconds + 120 }), "token_not_yet_valid");
});

test("token responses become sessions with the user's name and avatar", () => {
    const result = core.sessionFromTokenResponse({ id_token: fakeIdToken(claims()), refresh_token: "rt-1", access_token: "at" }, checkOptions());
    assert.equal(result.ok, true);
    assert.deepEqual(result.session, {
        idToken: result.session.idToken,
        refreshToken: "rt-1",
        expiresAt: (nowSeconds + 3600) * 1000,
        nonce: "nonce-1",
        user: { sub: "a1b2c3d4e5f6", name: "Mizuki", avatar: "https://example.com/a.png" },
    });

    const refreshed = core.sessionFromTokenResponse(
        { id_token: fakeIdToken(claims({ nonce: undefined, name: "  ", picture: "javascript:alert(1)" })) },
        checkOptions({ requireNonce: false, previousRefreshToken: "rt-1" }),
    );
    assert.equal(refreshed.session.refreshToken, "rt-1", "keeps a refresh token that was not rotated");
    assert.equal(refreshed.session.user.name, "mizuki_a");
    assert.equal(refreshed.session.user.avatar, null);
    assert.equal(core.userFromClaims(claims({ name: undefined, username: undefined })).name, "a1b2c3d4");

    assert.deepEqual(core.sessionFromTokenResponse({ access_token: "only" }, checkOptions()), { ok: false, error: "id_token_missing" });
    assert.deepEqual(core.sessionFromTokenResponse({ id_token: "a.b" }, checkOptions()), { ok: false, error: "id_token_malformed" });
    assert.deepEqual(core.sessionFromTokenResponse({ id_token: fakeIdToken(claims({ nonce: "x" })) }, checkOptions()), { ok: false, error: "nonce_mismatch" });
});

test("expiry handling: refresh ahead of exp, drop dead sessions", () => {
    const session = { idToken: "t", refreshToken: "rt", expiresAt: NOW + 10 * 60_000, nonce: null, user: { sub: "s", name: "n", avatar: null } };
    assert.equal(core.needsRefresh(session, NOW), false);
    assert.equal(core.refreshDelayMs(session, NOW), 8 * 60_000);
    assert.equal(core.needsRefresh(session, session.expiresAt - core.STARMOE_REFRESH_SKEW_MS), true);
    assert.equal(core.refreshDelayMs(session, session.expiresAt), 0);
    assert.equal(core.isSessionExpired(session, session.expiresAt), true);
    assert.equal(core.isSessionUsable({ ...session, expiresAt: NOW - 1 }, NOW), true, "expired but refreshable");
    assert.equal(core.isSessionUsable({ ...session, expiresAt: NOW - 1, refreshToken: null }, NOW), false);

    assert.deepEqual(core.parseSession(JSON.stringify(session)), session);
    assert.equal(core.parseSession(JSON.stringify({ ...session, expiresAt: "later" })), null);
    assert.equal(core.parseSession(JSON.stringify({ ...session, user: { name: "n" } })), null);
    assert.equal(core.parseSession("{"), null);

    assert.equal(core.isDeadGrantResponse(400, "invalid_grant"), true);
    assert.equal(core.isDeadGrantResponse(401, null), true);
    assert.equal(core.isDeadGrantResponse(400, "temporarily_unavailable"), false);
    assert.equal(core.isDeadGrantResponse(503, null), false);
});

// ---- the browser module: callback state/nonce checks and refresh, with a fake fetch ----

function loadBrowserModule() {
    const dom = new JSDOM("<!doctype html><html lang='zh-CN'><body></body></html>", { url: "https://pjsk.moe/zh-cn/guess-music/" });
    for (const key of ["window", "document", "navigator", "localStorage", "StorageEvent"]) {
        Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom.window : dom.window[key] });
    }
    process.env.NEXT_PUBLIC_STARMOE_CLIENT_ID = CLIENT_ID;
    const calls = [];
    const responses = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), body: new URLSearchParams(init.body) });
        const next = responses.shift();
        if (!next) throw new Error("unexpected fetch");
        return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
    };
    const auth = loadModule("src/lib/starmoe-auth.ts", (id) => {
        if (id === "@/lib/starmoe-auth-core") return core;
        if (id === "@/lib/localized-path") return { localizePathForBrowser: (path) => path };
        return undefined;
    });
    delete process.env.NEXT_PUBLIC_STARMOE_CLIENT_ID;
    return { auth, calls, responses, storage: dom.window.localStorage };
}

function seedPending(storage, state, nonce, returnTo = "/zh-cn/guess-music/?tab=daily") {
    storage.setItem("moesekai_starmoe_pending", JSON.stringify({
        [state]: { state, nonce, codeVerifier: "verifier-1", redirectUri: "https://pjsk.moe/auth/starmoe/callback/", returnTo, createdAt: Date.now() },
    }));
}

test("callback rejects an unknown state without calling the token endpoint", async () => {
    const { auth, calls, storage } = loadBrowserModule();
    seedPending(storage, "real-state", "n1");
    const result = await auth.completeStarMoeCallback("code=abc&state=forged");
    assert.equal(result.ok, false);
    assert.equal(result.error, "pending_missing");
    assert.equal(calls.length, 0);
    assert.equal(storage.getItem("moesekai_starmoe_session"), null);
});

test("callback rejects an ID token whose nonce does not match", async () => {
    const { auth, calls, responses, storage } = loadBrowserModule();
    const nowS = Math.floor(Date.now() / 1000);
    seedPending(storage, "s2", "expected-nonce");
    responses.push({ body: { id_token: fakeIdToken(claims({ nonce: "other", iat: nowS, exp: nowS + 3600 })), refresh_token: "rt" } });
    const result = await auth.completeStarMoeCallback("code=abc&state=s2");
    assert.deepEqual(result, { ok: false, error: "request_failed", returnTo: "/zh-cn/guess-music/?tab=daily" });
    assert.equal(calls.length, 1);
    assert.equal(storage.getItem("moesekai_starmoe_session"), null);
    assert.equal(storage.getItem("moesekai_starmoe_pending"), null, "the state is consumed");
});

test("callback exchanges the code with the verifier, stores the session and returns", async () => {
    const { auth, calls, responses, storage } = loadBrowserModule();
    const nowS = Math.floor(Date.now() / 1000);
    seedPending(storage, "s3", "n3");
    responses.push({ body: { id_token: fakeIdToken(claims({ nonce: "n3", iat: nowS, exp: nowS + 3600 })), refresh_token: "rt-3" } });
    const [first, second] = await Promise.all([
        auth.completeStarMoeCallback("code=abc&state=s3"),
        auth.completeStarMoeCallback("code=abc&state=s3"),
    ]);
    assert.deepEqual(first, { ok: true, kind: "signed-in", returnTo: "/zh-cn/guess-music/?tab=daily" });
    assert.equal(second, first, "a repeated effect shares the single exchange");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${ISSUER}/token`);
    assert.equal(calls[0].body.get("grant_type"), "authorization_code");
    assert.equal(calls[0].body.get("code_verifier"), "verifier-1");
    assert.equal(calls[0].body.get("client_id"), CLIENT_ID);
    const stored = JSON.parse(storage.getItem("moesekai_starmoe_session"));
    assert.equal(stored.refreshToken, "rt-3");
    assert.equal(stored.user.name, "Mizuki");
    assert.equal(await auth.getStarMoeIdToken(), stored.idToken);
    assert.equal(calls.length, 1, "a fresh token needs no refresh");
});

test("access_denied from the provider maps to a cancelled sign-in", async () => {
    const { auth, storage } = loadBrowserModule();
    seedPending(storage, "s4", "n4", "/en/guess-music/");
    assert.deepEqual(await auth.completeStarMoeCallback("error=access_denied&state=s4"), { ok: false, error: "access_denied", returnTo: "/en/guess-music/" });
});

test("getIdToken refreshes near expiry once for concurrent callers and signs out on a dead grant", async () => {
    const { auth, calls, responses, storage } = loadBrowserModule();
    const nowS = Math.floor(Date.now() / 1000);
    const nearlyExpired = {
        idToken: fakeIdToken(claims({ iat: nowS - 3500, exp: nowS + 30 })),
        refreshToken: "rt-old",
        expiresAt: (nowS + 30) * 1000,
        nonce: "nonce-1",
        user: { sub: "a1b2c3d4e5f6", name: "Mizuki", avatar: null },
    };
    storage.setItem("moesekai_starmoe_session", JSON.stringify(nearlyExpired));
    const renewed = fakeIdToken(claims({ nonce: undefined, iat: nowS, exp: nowS + 3600 }));
    responses.push({ body: { id_token: renewed, refresh_token: "rt-new" } });
    const tokens = await Promise.all([auth.getStarMoeIdToken(), auth.getStarMoeIdToken(), auth.getStarMoeIdToken()]);
    assert.deepEqual(tokens, [renewed, renewed, renewed]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.get("grant_type"), "refresh_token");
    assert.equal(calls[0].body.get("refresh_token"), "rt-old");
    assert.equal(JSON.parse(storage.getItem("moesekai_starmoe_session")).refreshToken, "rt-new");

    const second = loadBrowserModule();
    second.storage.setItem("moesekai_starmoe_session", JSON.stringify(nearlyExpired));
    second.responses.push({ status: 400, body: { error: "invalid_grant" } });
    assert.equal(await second.auth.getStarMoeIdToken(), null);
    assert.equal(second.storage.getItem("moesekai_starmoe_session"), null);
});
