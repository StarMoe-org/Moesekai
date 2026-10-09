"use client";

/**
 * StarMoe pass (passport.star.moe, a Logto OIDC provider) sign-in.
 *
 * Authorization code + PKCE (S256) as a public client. The ID token is what
 * the backend accepts as `Authorization: Bearer`; it is kept in localStorage
 * with the refresh token and renewed shortly before it expires. Tabs share the
 * session through the storage event, and refreshes are serialized across tabs
 * with the Web Locks API because Logto rotates refresh tokens.
 *
 * Pure helpers (PKCE, URL building, claim checks) live in starmoe-auth-core.ts.
 */

import { useMemo, useSyncExternalStore } from "react";

import { localizePathForBrowser } from "@/lib/localized-path";
import {
    STARMOE_CALLBACK_PATH,
    buildAuthorizationUrl,
    buildEndSessionUrl,
    createPkcePair,
    getStarMoeEndpoints,
    isDeadGrantResponse,
    isSessionExpired,
    isSessionUsable,
    needsRefresh,
    normalizeIssuer,
    parsePendingSignIns,
    parsePendingSignOuts,
    parseSession,
    randomUrlSafeString,
    refreshDelayMs,
    sanitizeReturnTo,
    sessionFromTokenResponse,
    takePending,
    type StarMoeSession,
} from "@/lib/starmoe-auth-core";

export type StarMoeAuthStatus = "disabled" | "loading" | "signed-out" | "signed-in";

export interface StarMoeUser {
    sub: string;
    name: string;
    avatar: string | null;
}

export interface StarMoeAuth {
    status: StarMoeAuthStatus;
    user: StarMoeUser | null;
    /** A valid ID token for `Authorization: Bearer`, refreshed when close to expiry; null when signed out or disabled. */
    getIdToken: () => Promise<string | null>;
    /** Redirects to StarMoe pass; returns to `returnTo` (default: the current page) afterwards. */
    login: (returnTo?: string) => void;
    logout: () => void;
}

const CLIENT_ID = process.env.NEXT_PUBLIC_STARMOE_CLIENT_ID || "";
const ISSUER = normalizeIssuer(process.env.NEXT_PUBLIC_STARMOE_ISSUER);
const REDIRECT_URI_OVERRIDE = process.env.NEXT_PUBLIC_STARMOE_REDIRECT_URI || "";
const ENDPOINTS = getStarMoeEndpoints(ISSUER);

const SESSION_KEY = "moesekai_starmoe_session";
const PENDING_SIGN_IN_KEY = "moesekai_starmoe_pending";
const PENDING_SIGN_OUT_KEY = "moesekai_starmoe_pending_logout";
const REFRESH_LOCK_NAME = "moesekai-starmoe-refresh";
const REQUEST_TIMEOUT_MS = 15_000;
/** After a transient refresh failure, try again this much later (while the token still lives). */
const REFRESH_RETRY_MS = 30_000;

export function isStarMoeAuthEnabled(): boolean {
    return Boolean(CLIENT_ID);
}

export function getStarMoeRedirectUri(): string {
    if (REDIRECT_URI_OVERRIDE) return REDIRECT_URI_OVERRIDE;
    if (typeof window === "undefined") return STARMOE_CALLBACK_PATH;
    return new URL(STARMOE_CALLBACK_PATH, window.location.origin).toString();
}

/** Error codes the callback page turns into messages. */
export type StarMoeAuthErrorCode = "disabled" | "access_denied" | "provider_error" | "pending_missing" | "callback_params_missing" | "request_failed";

export class StarMoeAuthError extends Error {
    constructor(readonly code: string, readonly status?: number) {
        super(code);
        this.name = "StarMoeAuthError";
    }
}

// ==================== storage ====================

function readStorage(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string, value: string | null): void {
    try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
    } catch {
        // Private mode or blocked storage: the session simply does not persist.
    }
}

function writeMap(key: string, map: Record<string, unknown>): void {
    writeStorage(key, Object.keys(map).length ? JSON.stringify(map) : null);
}

function readStoredSession(): StarMoeSession | null {
    const session = parseSession(readStorage(SESSION_KEY));
    return session && isSessionUsable(session, Date.now()) ? session : null;
}

// ==================== external store ====================

interface Snapshot {
    status: StarMoeAuthStatus;
    user: StarMoeUser | null;
}

const DISABLED_SNAPSHOT: Snapshot = { status: "disabled", user: null };
const LOADING_SNAPSHOT: Snapshot = { status: "loading", user: null };
const SIGNED_OUT_SNAPSHOT: Snapshot = { status: "signed-out", user: null };

let session: StarMoeSession | null = null;
let loaded = false;
let snapshot: Snapshot = CLIENT_ID ? LOADING_SNAPSHOT : DISABLED_SNAPSHOT;
const listeners = new Set<() => void>();
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshInFlight: Promise<StarMoeSession | null> | null = null;

function snapshotFor(next: StarMoeSession | null): Snapshot {
    if (!next) return SIGNED_OUT_SNAPSHOT;
    const current = snapshot.user;
    if (snapshot.status === "signed-in" && current && current.sub === next.user.sub && current.name === next.user.name && current.avatar === next.user.avatar) {
        return snapshot;
    }
    return { status: "signed-in", user: { ...next.user } };
}

function loadOnce(): void {
    if (loaded || !CLIENT_ID || typeof window === "undefined") return;
    loaded = true;
    session = readStoredSession();
    snapshot = snapshotFor(session);
}

/** Replaces the in-memory session, optionally persists it, and notifies subscribers. */
function applySession(next: StarMoeSession | null, persist = true): void {
    loaded = true;
    session = next;
    if (persist) writeStorage(SESSION_KEY, next ? JSON.stringify(next) : null);
    const nextSnapshot = snapshotFor(next);
    if (nextSnapshot !== snapshot) {
        snapshot = nextSnapshot;
        listeners.forEach((listener) => listener());
    }
    scheduleRefresh();
}

function scheduleRefresh(delayOverride?: number): void {
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = undefined;
    if (!session || listeners.size === 0) return;
    const delay = delayOverride ?? refreshDelayMs(session, Date.now());
    // setTimeout overflows above ~24.8 days; a shorter wake-up just reschedules.
    refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (session && needsRefresh(session, Date.now())) void refreshSession();
        else scheduleRefresh();
    }, Math.min(delay, 2 ** 31 - 1));
}

function onStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== SESSION_KEY) return;
    applySession(readStoredSession(), false);
}

function onVisibilityChange(): void {
    // Background tabs throttle timers; catch up when the tab is shown again.
    if (document.visibilityState === "visible" && session && needsRefresh(session, Date.now())) void refreshSession();
}

function subscribe(listener: () => void): () => void {
    if (!CLIENT_ID) return () => {};
    loadOnce();
    listeners.add(listener);
    if (listeners.size === 1) {
        window.addEventListener("storage", onStorage);
        document.addEventListener("visibilitychange", onVisibilityChange);
        scheduleRefresh();
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            window.removeEventListener("storage", onStorage);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            scheduleRefresh();
        }
    };
}

function getSnapshot(): Snapshot {
    loadOnce();
    return snapshot;
}

function getServerSnapshot(): Snapshot {
    return CLIENT_ID ? LOADING_SNAPSHOT : DISABLED_SNAPSHOT;
}

// ==================== token endpoint ====================

async function tokenRequest(params: Record<string, string>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(ENDPOINTS.token, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams(params).toString(),
            signal: controller.signal,
        });
        let body: unknown = null;
        try {
            body = await response.json();
        } catch {
            body = null;
        }
        const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
        if (!response.ok) {
            const errorCode = typeof record.error === "string" ? record.error : null;
            throw new StarMoeAuthError(isDeadGrantResponse(response.status, errorCode) ? "invalid_grant" : "request_failed", response.status);
        }
        return record;
    } catch (error) {
        if (error instanceof StarMoeAuthError) throw error;
        throw new StarMoeAuthError("request_failed");
    } finally {
        clearTimeout(timeoutId);
    }
}

function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks && typeof locks.request === "function") {
        return locks.request(REFRESH_LOCK_NAME, task) as Promise<T>;
    }
    return task();
}

async function performRefresh(): Promise<StarMoeSession | null> {
    // Another tab may have refreshed while this one waited for the lock. A sign-out
    // elsewhere already cleared `session` through the storage event; the in-memory
    // fallback covers browsers where storage is blocked.
    const stored = readStoredSession() ?? session;
    if (!stored) {
        applySession(null);
        return null;
    }
    if (!needsRefresh(stored, Date.now())) {
        applySession(stored, false);
        return stored;
    }
    if (!stored.refreshToken) {
        if (isSessionExpired(stored, Date.now())) {
            applySession(null);
            return null;
        }
        return stored;
    }

    try {
        const response = await tokenRequest({
            grant_type: "refresh_token",
            client_id: CLIENT_ID,
            refresh_token: stored.refreshToken,
        });
        const result = sessionFromTokenResponse(response, {
            issuer: ISSUER,
            clientId: CLIENT_ID,
            nowMs: Date.now(),
            expectedNonce: stored.nonce,
            requireNonce: false,
            previousRefreshToken: stored.refreshToken,
        });
        if (!result.ok) throw new StarMoeAuthError(result.error);
        applySession(result.session);
        return result.session;
    } catch (error) {
        const code = error instanceof StarMoeAuthError ? error.code : "request_failed";
        if (code === "invalid_grant") {
            // Without Web Locks another tab may have rotated the token first.
            const latest = readStoredSession();
            if (latest && latest.refreshToken !== stored.refreshToken && !needsRefresh(latest, Date.now())) {
                applySession(latest, false);
                return latest;
            }
            console.warn("[StarMoe] refresh token rejected, signing out");
            applySession(null);
            return null;
        }
        if (code === "request_failed" && !isSessionExpired(stored, Date.now())) {
            // Transient: keep the still-valid token and try again a little later.
            console.warn("[StarMoe] token refresh failed, retrying", error);
            applySession(stored, false);
            scheduleRefresh(REFRESH_RETRY_MS);
            return stored;
        }
        console.warn("[StarMoe] token refresh failed, signing out", error);
        applySession(null);
        return null;
    }
}

function refreshSession(): Promise<StarMoeSession | null> {
    if (!refreshInFlight) {
        refreshInFlight = withRefreshLock(performRefresh).finally(() => {
            refreshInFlight = null;
        });
    }
    return refreshInFlight;
}

// ==================== public actions ====================

async function getIdToken(): Promise<string | null> {
    if (!CLIENT_ID || typeof window === "undefined") return null;
    loadOnce();
    if (!session) return null;
    if (!needsRefresh(session, Date.now())) return session.idToken;
    const next = await refreshSession();
    return next && !isSessionExpired(next, Date.now()) ? next.idToken : null;
}

/** Same as `useStarMoeAuth().getIdToken`, for code outside React components. */
export const getStarMoeIdToken = getIdToken;

function currentLocation(): string {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function resolveReturnTo(returnTo?: string): string {
    const origin = window.location.origin;
    const fallback = localizePathForBrowser("/");
    const safe = sanitizeReturnTo(returnTo ?? currentLocation(), origin, fallback);
    return localizePathForBrowser(safe);
}

function uiLocales(): string | null {
    const lang = document.documentElement.lang?.trim();
    return lang || null;
}

async function startSignIn(returnTo?: string): Promise<void> {
    const state = randomUrlSafeString(24);
    const nonce = randomUrlSafeString(24);
    const { codeVerifier, codeChallenge } = await createPkcePair();
    const redirectUri = getStarMoeRedirectUri();
    const now = Date.now();
    const pending = parsePendingSignIns(readStorage(PENDING_SIGN_IN_KEY), now);
    pending[state] = { state, nonce, codeVerifier, redirectUri, returnTo: resolveReturnTo(returnTo), createdAt: now };
    writeMap(PENDING_SIGN_IN_KEY, pending);
    window.location.assign(buildAuthorizationUrl({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        redirectUri,
        state,
        nonce,
        codeChallenge,
        uiLocales: uiLocales(),
    }));
}

function login(returnTo?: string): void {
    if (!CLIENT_ID || typeof window === "undefined") return;
    void startSignIn(returnTo).catch((error) => console.error("[StarMoe] could not start sign-in", error));
}

function logout(): void {
    if (!CLIENT_ID || typeof window === "undefined") return;
    loadOnce();
    const current = session ?? readStoredSession();
    applySession(null);
    if (!current) return;
    const state = randomUrlSafeString(16);
    const now = Date.now();
    const pending = parsePendingSignOuts(readStorage(PENDING_SIGN_OUT_KEY), now);
    pending[state] = { state, returnTo: resolveReturnTo(), createdAt: now };
    writeMap(PENDING_SIGN_OUT_KEY, pending);
    window.location.assign(buildEndSessionUrl({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        idTokenHint: current.idToken,
        postLogoutRedirectUri: getStarMoeRedirectUri(),
        state,
    }));
}

// ==================== callback ====================

export type StarMoeCallbackResult =
    | { ok: true; kind: "signed-in" | "signed-out"; returnTo: string }
    | { ok: false; error: StarMoeAuthErrorCode; returnTo: string };

async function processCallback(search: string): Promise<StarMoeCallbackResult> {
    const params = new URLSearchParams(search);
    const fallback = localizePathForBrowser("/");
    if (!CLIENT_ID) return { ok: false, error: "disabled", returnTo: fallback };

    const state = params.get("state");
    const code = params.get("code");
    const providerError = params.get("error");
    const now = Date.now();

    if (!code && !providerError) {
        // Coming back from end_session: only the state we sent is echoed.
        const { pending, rest } = takePending(parsePendingSignOuts(readStorage(PENDING_SIGN_OUT_KEY), now), state);
        writeMap(PENDING_SIGN_OUT_KEY, rest);
        return { ok: true, kind: "signed-out", returnTo: pending?.returnTo ?? fallback };
    }

    const { pending, rest } = takePending(parsePendingSignIns(readStorage(PENDING_SIGN_IN_KEY), now), state);
    writeMap(PENDING_SIGN_IN_KEY, rest);
    const returnTo = pending?.returnTo ?? fallback;

    if (providerError) {
        return { ok: false, error: providerError === "access_denied" ? "access_denied" : "provider_error", returnTo };
    }
    if (!code || !state) return { ok: false, error: "callback_params_missing", returnTo };
    if (!pending) return { ok: false, error: "pending_missing", returnTo };

    try {
        const response = await tokenRequest({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            code,
            redirect_uri: pending.redirectUri,
            code_verifier: pending.codeVerifier,
        });
        const result = sessionFromTokenResponse(response, {
            issuer: ISSUER,
            clientId: CLIENT_ID,
            nowMs: Date.now(),
            expectedNonce: pending.nonce,
            requireNonce: true,
        });
        if (!result.ok) {
            console.error("[StarMoe] ID token rejected", result.error);
            return { ok: false, error: "request_failed", returnTo };
        }
        applySession(result.session);
        return { ok: true, kind: "signed-in", returnTo };
    } catch (error) {
        console.error("[StarMoe] code exchange failed", error);
        return { ok: false, error: "request_failed", returnTo };
    }
}

// Authorization codes are single-use: React's dev double effects must share one exchange.
const callbacksInFlight = new Map<string, Promise<StarMoeCallbackResult>>();

/** Finishes a sign-in (or sign-out) redirect; `search` is the callback URL's query string. */
export function completeStarMoeCallback(search: string): Promise<StarMoeCallbackResult> {
    let task = callbacksInFlight.get(search);
    if (!task) {
        task = processCallback(search);
        callbacksInFlight.set(search, task);
    }
    return task;
}

// ==================== hook ====================

export function useStarMoeAuth(): StarMoeAuth {
    const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return useMemo(() => ({ status: current.status, user: current.user, getIdToken, login, logout }), [current]);
}
