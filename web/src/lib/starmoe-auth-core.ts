/**
 * Pure helpers for StarMoe pass sign-in (passport.star.moe, a Logto OIDC
 * provider): PKCE, the authorization URL, state/nonce bookkeeping, ID token
 * claim checks and the stored session shape.
 *
 * No React and no browser globals beyond Web Crypto, btoa/atob and
 * TextEncoder/TextDecoder, so node:test can load it directly. The ID token's
 * signature is verified by the backend; the browser only checks the claims
 * it relies on (iss, aud, exp/iat/nbf, nonce) before storing the token.
 */

export const STARMOE_DEFAULT_ISSUER = "https://passport.star.moe/oidc";
export const STARMOE_SCOPE = "openid profile offline_access";
export const STARMOE_CALLBACK_PATH = "/auth/starmoe/callback/";
export const STARMOE_PENDING_TTL_MS = 10 * 60 * 1000;
export const STARMOE_CLOCK_LEEWAY_SECONDS = 60;
/** The ID token is refreshed this long before it expires. */
export const STARMOE_REFRESH_SKEW_MS = 2 * 60 * 1000;

export interface StarMoeUserInfo {
    sub: string;
    name: string;
    avatar: string | null;
}

export interface StarMoeEndpoints {
    authorization: string;
    token: string;
    userinfo: string;
    jwks: string;
    endSession: string;
}

export interface StarMoeSession {
    idToken: string;
    refreshToken: string | null;
    /** Epoch ms at which the ID token expires (its `exp`). */
    expiresAt: number;
    /** The nonce of the original authentication; refreshed ID tokens may echo it. */
    nonce: string | null;
    user: StarMoeUserInfo;
}

export interface StarMoePendingSignIn {
    state: string;
    nonce: string;
    codeVerifier: string;
    redirectUri: string;
    returnTo: string;
    createdAt: number;
}

export interface StarMoePendingSignOut {
    state: string;
    returnTo: string;
    createdAt: number;
}

export type StarMoeClaimError =
    | "id_token_malformed"
    | "issuer_mismatch"
    | "audience_mismatch"
    | "subject_missing"
    | "nonce_mismatch"
    | "token_expired"
    | "token_not_yet_valid";

export type StarMoeIdTokenClaims = Record<string, unknown>;

export function normalizeIssuer(issuer?: string | null): string {
    const value = (issuer ?? "").trim().replace(/\/+$/, "");
    return value || STARMOE_DEFAULT_ISSUER;
}

/** Logto serves its OIDC endpoints at fixed paths below the issuer. */
export function getStarMoeEndpoints(issuer: string): StarMoeEndpoints {
    const base = normalizeIssuer(issuer);
    return {
        authorization: `${base}/auth`,
        token: `${base}/token`,
        userinfo: `${base}/me`,
        jwks: `${base}/jwks`,
        endSession: `${base}/session/end`,
    };
}

export function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecodeToString(segment: string): string {
    if (!/^[A-Za-z0-9_-]*$/.test(segment)) throw new Error("invalid base64url");
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

/** A random string made only of RFC 3986 unreserved characters. */
export function randomUrlSafeString(byteLength = 32): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
}

/** RFC 7636 S256: BASE64URL(SHA256(ASCII(code_verifier))). */
export async function computeCodeChallenge(codeVerifier: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    return base64UrlEncode(new Uint8Array(digest));
}

export async function createPkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    // 48 random bytes give a 64-character verifier (RFC 7636 allows 43–128).
    const codeVerifier = randomUrlSafeString(48);
    return { codeVerifier, codeChallenge: await computeCodeChallenge(codeVerifier) };
}

export interface AuthorizationUrlParams {
    issuer: string;
    clientId: string;
    redirectUri: string;
    state: string;
    nonce: string;
    codeChallenge: string;
    scope?: string;
    uiLocales?: string | null;
}

export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
    if (!params.clientId) throw new Error("STARMOE_CLIENT_ID_MISSING");
    const url = new URL(getStarMoeEndpoints(params.issuer).authorization);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", params.scope ?? STARMOE_SCOPE);
    url.searchParams.set("state", params.state);
    url.searchParams.set("nonce", params.nonce);
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    // Logto (node-oidc-provider) only issues a refresh token for offline_access
    // when the request asks for consent; first-party apps skip the screen.
    url.searchParams.set("prompt", "consent");
    if (params.uiLocales) url.searchParams.set("ui_locales", params.uiLocales);
    return url.toString();
}

export interface EndSessionUrlParams {
    issuer: string;
    clientId: string;
    idTokenHint: string;
    postLogoutRedirectUri: string;
    state: string;
}

export function buildEndSessionUrl(params: EndSessionUrlParams): string {
    const url = new URL(getStarMoeEndpoints(params.issuer).endSession);
    url.searchParams.set("id_token_hint", params.idTokenHint);
    url.searchParams.set("post_logout_redirect_uri", params.postLogoutRedirectUri);
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("state", params.state);
    return url.toString();
}

const UNSAFE_PATH_CHARS = /[\\\u0000-\u001f\u007f]/;
const CALLBACK_PATH_PATTERN = /\/auth\/starmoe\/callback\/?$/i;

/**
 * Reduces `value` to a same-origin path (pathname + search + hash). Anything
 * that could leave `origin` (absolute URLs elsewhere, protocol-relative or
 * backslash tricks, other schemes) and the callback route itself fall back.
 */
export function sanitizeReturnTo(value: unknown, origin: string, fallback = "/"): string {
    if (typeof value !== "string" || !value || UNSAFE_PATH_CHARS.test(value)) return fallback;
    const isPath = value.startsWith("/");
    if (isPath && value.startsWith("//")) return fallback;
    if (!isPath && !/^https?:\/\//i.test(value)) return fallback;
    try {
        if (isPath) {
            const decoded = decodeURIComponent(value);
            if (decoded.startsWith("//") || UNSAFE_PATH_CHARS.test(decoded)) return fallback;
        }
        const expectedOrigin = new URL(origin).origin;
        const url = new URL(value, expectedOrigin);
        if (url.origin !== expectedOrigin) return fallback;
        if (CALLBACK_PATH_PATTERN.test(url.pathname)) return fallback;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return fallback;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function isPendingSignIn(value: unknown): value is StarMoePendingSignIn {
    return isRecord(value)
        && typeof value.state === "string"
        && typeof value.nonce === "string"
        && typeof value.codeVerifier === "string"
        && typeof value.redirectUri === "string"
        && typeof value.returnTo === "string"
        && typeof value.createdAt === "number";
}

function isPendingSignOut(value: unknown): value is StarMoePendingSignOut {
    return isRecord(value)
        && typeof value.state === "string"
        && typeof value.returnTo === "string"
        && typeof value.createdAt === "number";
}

function parsePendingMap<T extends { state: string; createdAt: number }>(
    raw: string | null | undefined,
    guard: (value: unknown) => value is T,
    nowMs: number,
): Record<string, T> {
    const parsed = parseJsonRecord(raw);
    if (!parsed) return {};
    const out: Record<string, T> = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (!guard(value) || value.state !== key) continue;
        const age = nowMs - value.createdAt;
        if (age < 0 || age > STARMOE_PENDING_TTL_MS) continue;
        out[key] = value;
    }
    return out;
}

/** Parses the stored pending sign-ins, dropping malformed and expired entries. */
export function parsePendingSignIns(raw: string | null | undefined, nowMs: number): Record<string, StarMoePendingSignIn> {
    return parsePendingMap(raw, isPendingSignIn, nowMs);
}

export function parsePendingSignOuts(raw: string | null | undefined, nowMs: number): Record<string, StarMoePendingSignOut> {
    return parsePendingMap(raw, isPendingSignOut, nowMs);
}

/**
 * Removes the entry for `state` (one-time use) and returns it. A missing,
 * expired or unknown state yields null: the callback must then be rejected.
 */
export function takePending<T extends { state: string }>(
    map: Record<string, T>,
    state: string | null | undefined,
): { pending: T | null; rest: Record<string, T> } {
    if (!state) return { pending: null, rest: map };
    const rest = { ...map };
    const pending = Object.prototype.hasOwnProperty.call(rest, state) ? rest[state]! : null;
    delete rest[state];
    return { pending: pending && pending.state === state ? pending : null, rest };
}

export function decodeIdTokenClaims(idToken: string): StarMoeIdTokenClaims | null {
    const parts = idToken.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    try {
        return parseJsonRecord(base64UrlDecodeToString(parts[1]));
    } catch {
        return null;
    }
}

export interface ClaimCheckOptions {
    issuer: string;
    clientId: string;
    nowMs: number;
    /** The nonce sent with the authorization request. */
    expectedNonce?: string | null;
    /** On sign-in the nonce must be present and equal; on refresh it may be absent. */
    requireNonce?: boolean;
    leewaySeconds?: number;
}

function numericClaim(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function checkIdTokenClaims(claims: StarMoeIdTokenClaims, options: ClaimCheckOptions): StarMoeClaimError | null {
    const leewayMs = (options.leewaySeconds ?? STARMOE_CLOCK_LEEWAY_SECONDS) * 1000;
    if (claims.iss !== normalizeIssuer(options.issuer)) return "issuer_mismatch";

    const aud = claims.aud;
    const audiences = typeof aud === "string" ? [aud] : Array.isArray(aud) ? aud.filter((item): item is string => typeof item === "string") : [];
    if (!options.clientId || !audiences.includes(options.clientId)) return "audience_mismatch";
    if (audiences.length > 1 && claims.azp !== undefined && claims.azp !== options.clientId) return "audience_mismatch";

    if (typeof claims.sub !== "string" || !claims.sub) return "subject_missing";

    if (options.requireNonce) {
        if (!options.expectedNonce || claims.nonce !== options.expectedNonce) return "nonce_mismatch";
    } else if (claims.nonce !== undefined && options.expectedNonce && claims.nonce !== options.expectedNonce) {
        return "nonce_mismatch";
    }

    const exp = numericClaim(claims.exp);
    if (exp === null || exp * 1000 + leewayMs <= options.nowMs) return "token_expired";
    const iat = numericClaim(claims.iat);
    if (iat === null || iat * 1000 - leewayMs > options.nowMs) return "token_not_yet_valid";
    if (claims.nbf !== undefined) {
        const nbf = numericClaim(claims.nbf);
        if (nbf === null || nbf * 1000 - leewayMs > options.nowMs) return "token_not_yet_valid";
    }
    return null;
}

function nonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function safeAvatarUrl(value: unknown): string | null {
    const raw = nonEmptyString(value);
    if (!raw) return null;
    try {
        const url = new URL(raw);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
}

/** Display name falls back name → username → the first 8 characters of sub. */
export function userFromClaims(claims: StarMoeIdTokenClaims): StarMoeUserInfo | null {
    const sub = nonEmptyString(claims.sub);
    if (!sub) return null;
    return {
        sub,
        name: nonEmptyString(claims.name) ?? nonEmptyString(claims.username) ?? sub.slice(0, 8),
        avatar: safeAvatarUrl(claims.picture),
    };
}

export type TokenResponseResult =
    | { ok: true; session: StarMoeSession }
    | { ok: false; error: StarMoeClaimError | "id_token_missing" };

export interface SessionFromTokenOptions extends ClaimCheckOptions {
    /** Kept when the token endpoint does not rotate the refresh token. */
    previousRefreshToken?: string | null;
}

/** Validates a token endpoint response and turns it into the stored session. */
export function sessionFromTokenResponse(response: unknown, options: SessionFromTokenOptions): TokenResponseResult {
    const body = isRecord(response) ? response : {};
    const idToken = nonEmptyString(body.id_token);
    if (!idToken) return { ok: false, error: "id_token_missing" };
    const claims = decodeIdTokenClaims(idToken);
    if (!claims) return { ok: false, error: "id_token_malformed" };
    const error = checkIdTokenClaims(claims, options);
    if (error) return { ok: false, error };
    const user = userFromClaims(claims);
    if (!user) return { ok: false, error: "subject_missing" };
    const nonce = nonEmptyString(claims.nonce) ?? options.expectedNonce ?? null;
    return {
        ok: true,
        session: {
            idToken,
            refreshToken: nonEmptyString(body.refresh_token) ?? options.previousRefreshToken ?? null,
            expiresAt: (claims.exp as number) * 1000,
            nonce,
            user,
        },
    };
}

export function parseSession(raw: string | null | undefined): StarMoeSession | null {
    const value = parseJsonRecord(raw);
    if (!value) return null;
    const user = isRecord(value.user) ? value.user : null;
    if (
        typeof value.idToken !== "string" || !value.idToken
        || (value.refreshToken !== null && typeof value.refreshToken !== "string")
        || typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)
        || (value.nonce !== null && value.nonce !== undefined && typeof value.nonce !== "string")
        || !user || typeof user.sub !== "string" || !user.sub || typeof user.name !== "string"
        || (user.avatar !== null && typeof user.avatar !== "string")
    ) {
        return null;
    }
    return {
        idToken: value.idToken,
        refreshToken: value.refreshToken as string | null,
        expiresAt: value.expiresAt,
        nonce: (value.nonce as string | null | undefined) ?? null,
        user: { sub: user.sub, name: user.name, avatar: (user.avatar as string | null) ?? null },
    };
}

export function isSessionExpired(session: StarMoeSession, nowMs: number): boolean {
    return session.expiresAt <= nowMs;
}

export function needsRefresh(session: StarMoeSession, nowMs: number, skewMs = STARMOE_REFRESH_SKEW_MS): boolean {
    return session.expiresAt - skewMs <= nowMs;
}

/** Milliseconds until the session should be refreshed (0 = now). */
export function refreshDelayMs(session: StarMoeSession, nowMs: number, skewMs = STARMOE_REFRESH_SKEW_MS): number {
    return Math.max(0, session.expiresAt - skewMs - nowMs);
}

/** A stored session that can no longer produce a valid ID token is dropped on load. */
export function isSessionUsable(session: StarMoeSession, nowMs: number): boolean {
    return !isSessionExpired(session, nowMs) || Boolean(session.refreshToken);
}

// RFC 6749 §5.2 codes that mean the grant itself is dead; anything else is transient.
const DEAD_GRANT_ERROR_CODES = new Set(["invalid_grant", "invalid_client", "unauthorized_client", "invalid_scope"]);

export function isDeadGrantResponse(status: number, errorCode: string | null): boolean {
    if (status !== 400 && status !== 401) return false;
    return errorCode === null || DEAD_GRANT_ERROR_CODES.has(errorCode);
}
