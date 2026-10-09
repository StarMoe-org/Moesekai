"use client";

/**
 * The visitor's StarMoe pass account (passport.star.moe), as moesekai-api's
 * session sees it.
 *
 * Sign-in runs on the server (/api/auth/*, a confidential OIDC client): the
 * browser holds only an HttpOnly session cookie and never a token. This
 * module asks GET /api/auth/me once for every component on the page (a
 * module-level store), asks again when the window regains focus (at most once
 * a minute), and turns signing in and out into navigations.
 *
 * When the first check fails (the API restarting, a network error), sign-in
 * shows as unavailable for now, and the server is asked again on a backoff
 * until it answers.
 *
 * The auth routes are always same-origin paths, never NEXT_PUBLIC_API_URL:
 * the session cookie is first-party to the page.
 */

import { useSyncExternalStore } from "react";

export type MoesekaiAccountStatus = "loading" | "signed-out" | "signed-in" | "unavailable";

export interface MoesekaiUser {
    /** The passport subject. */
    id: string;
    /** name, else username, else "StarMoe" (the same fallback as the leaderboard). */
    name: string;
    username: string | null;
    avatar: string | null;
}

export type MoesekaiAccountState =
    | { status: "loading"; user: null }
    | { status: "signed-out"; user: null }
    | { status: "unavailable"; user: null }
    | { status: "signed-in"; user: MoesekaiUser };

const ME_PATH = "/api/auth/me";
const LOGIN_PATH = "/api/auth/login";
const LOGOUT_PATH = "/api/auth/logout";
/** Focus brings a new check at most this often. */
const REFETCH_INTERVAL_MS = 60_000;
/** After failed checks that left nothing known: wait this long before each next one (then the last, repeatedly). */
const RETRY_DELAYS_MS = [5_000, 15_000, 60_000];
const REQUEST_TIMEOUT_MS = 15_000;
// BCP 47-shaped; the server checks it again before passing it on as ui_locales.
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const LOADING: MoesekaiAccountState = { status: "loading", user: null };
const SIGNED_OUT: MoesekaiAccountState = { status: "signed-out", user: null };
const UNAVAILABLE: MoesekaiAccountState = { status: "unavailable", user: null };

// ==================== pure helpers ====================

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function safeHttpUrl(value: unknown, base?: string): string | null {
    const raw = nonEmptyString(value);
    if (!raw) return null;
    try {
        const url = new URL(raw, base);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
}

/** Reads a GET /api/auth/me body; null when it is not one. */
export function parseAccountResponse(body: unknown): MoesekaiAccountState | null {
    if (!isRecord(body)) return null;
    if (body.available === false) return UNAVAILABLE;
    if (body.user === null) return SIGNED_OUT;
    if (!isRecord(body.user)) return null;
    const id = nonEmptyString(body.user.id);
    if (!id) return null;
    const username = nonEmptyString(body.user.username);
    return {
        status: "signed-in",
        user: {
            id,
            name: nonEmptyString(body.user.name) ?? username ?? "StarMoe",
            username,
            avatar: safeHttpUrl(body.user.picture),
        },
    };
}

/** The sign-in entry point; moesekai-api only accepts a same-origin path as `return`. */
export function buildSignInUrl(returnTo: string, locale: string | null): string {
    const params = new URLSearchParams({ return: returnTo });
    if (locale && LOCALE_PATTERN.test(locale)) params.set("locale", locale);
    return `${LOGIN_PATH}?${params.toString()}`;
}

/** Where to go after signing out: the redirect the server answered (http/https only), else the home page. */
export function signOutDestination(body: unknown, origin: string): string {
    return safeHttpUrl(isRecord(body) ? body.redirect : null, origin) ?? new URL("/", origin).toString();
}

function sameState(a: MoesekaiAccountState, b: MoesekaiAccountState): boolean {
    if (a.status !== b.status) return false;
    if (!a.user || !b.user) return a.user === b.user;
    return a.user.id === b.user.id && a.user.name === b.user.name && a.user.username === b.user.username && a.user.avatar === b.user.avatar;
}

// ==================== store ====================

let state: MoesekaiAccountState = LOADING;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let lastCheckAt = 0;
/** Bumped by changes made here (sign-out), so an answer requested before one cannot undo it. */
let generation = 0;
/** Checks in a row that failed while nothing was known: "unavailable" is then a guess, not the server's answer. */
let failedChecks = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function setState(next: MoesekaiAccountState): void {
    if (sameState(state, next)) return;
    state = next;
    listeners.forEach((listener) => listener());
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(path, {
            ...init,
            headers: { Accept: "application/json" },
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchAccount(): Promise<MoesekaiAccountState | null> {
    try {
        const response = await request(ME_PATH);
        if (!response.ok) return null;
        return parseAccountResponse(await response.json());
    } catch {
        return null;
    }
}

function clearRetry(): void {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
}

/** Counts a failed check and, while a component uses the account, asks again after the next backoff delay. */
function scheduleRetry(): void {
    const delay = RETRY_DELAYS_MS[Math.min(failedChecks, RETRY_DELAYS_MS.length - 1)];
    failedChecks += 1;
    if (listeners.size === 0) return;
    retryTimer = setTimeout(() => {
        retryTimer = null;
        void refreshMoesekaiAccount();
    }, delay);
}

/** Asks the server again; concurrent callers share one request. */
export function refreshMoesekaiAccount(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (!inFlight) {
        lastCheckAt = Date.now();
        clearRetry();
        const startedAt = generation;
        inFlight = fetchAccount()
            .then((next) => {
                if (startedAt !== generation) return;
                if (next) {
                    failedChecks = 0;
                    setState(next);
                } else if (state.status === "loading" || failedChecks > 0) {
                    // Nothing known yet, so sign-in cannot be offered for now; ask again shortly.
                    setState(UNAVAILABLE);
                    scheduleRetry();
                }
                // Otherwise a failed check keeps what is already known.
            })
            .finally(() => {
                inFlight = null;
            });
    }
    return inFlight;
}

/**
 * Asks again right away when the last check failed and left nothing known
 * (another call to the API just succeeded, so it is likely back); otherwise
 * does nothing.
 */
export function retryMoesekaiAccount(): Promise<void> {
    return failedChecks > 0 ? refreshMoesekaiAccount() : Promise.resolve();
}

function onFocus(): void {
    if (Date.now() - lastCheckAt >= REFETCH_INTERVAL_MS) void refreshMoesekaiAccount();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (listeners.size === 1) {
        window.addEventListener("focus", onFocus);
        // The first use, a check that failed, or coming back to a page that uses it after a while.
        if (state.status === "loading" || failedChecks > 0 || Date.now() - lastCheckAt >= REFETCH_INTERVAL_MS) void refreshMoesekaiAccount();
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            window.removeEventListener("focus", onFocus);
            clearRetry();
        }
    };
}

function getServerSnapshot(): MoesekaiAccountState {
    return LOADING;
}

// ==================== public actions ====================

/** The account as last known, for code outside React components. */
export function getMoesekaiAccount(): MoesekaiAccountState {
    return state;
}

/**
 * A call that needs the session came back 401: the session is gone (it
 * expired, or was signed out in another tab). Only a signed-in account changes.
 */
export function markSignedOut(): void {
    if (state.status !== "signed-in") return;
    generation += 1;
    setState(SIGNED_OUT);
}

/** Goes to the passport through moesekai-api and comes back to `returnTo` (default: this page). */
export function signIn(returnTo?: string): void {
    if (typeof window === "undefined") return;
    const path = typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : `${window.location.pathname}${window.location.search}`;
    window.location.assign(buildSignInUrl(path, document.documentElement.lang?.trim() || null));
}

/**
 * Ends the session on the server, then follows its redirect (the passport's
 * end-session page, which leads back to the home page). Rejects when the
 * server did not sign out, leaving the account as it was.
 */
export async function signOut(): Promise<void> {
    const response = await request(LOGOUT_PATH, { method: "POST" });
    if (!response.ok) throw new Error(`SIGN_OUT_FAILED_${response.status}`);
    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    generation += 1;
    setState(SIGNED_OUT);
    window.location.assign(signOutDestination(body, window.location.origin));
}

// ==================== hook ====================

export function useMoesekaiAccount(): MoesekaiAccountState {
    return useSyncExternalStore(subscribe, getMoesekaiAccount, getServerSnapshot);
}
