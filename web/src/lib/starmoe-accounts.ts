/**
 * Game accounts kept with the visitor's StarMoe account (moesekai-api /api/v1/me/accounts), and game data read
 * through moesekai-api (/api/v1/me/sekai), which uses the visitor's Haruki connection on StarMoe Connect when it
 * has one. The browser only holds the session cookie: no token, no Authorization header.
 *
 * Signed out, or when moesekai-api does not offer these routes yet, everything here reports "off" and the account
 * library keeps working from the browser alone, as before.
 */
import { useSyncExternalStore } from "react";
import { MOESEKAI_API_ORIGIN, apiCredentials, uncachedUrl } from "./moesekai-api-origin";
import { getMoesekaiAccount, markSignedOut } from "./moesekai-account";
import { isValidServer, type ServerType } from "./account-servers";

export type HarukiLink = "not_connected" | "active" | "needs_reconnect" | "unknown";

export interface StarMoeServerAccount {
    server: ServerType;
    uid: string;
    /** verified: a Haruki-verified account from StarMoe Connect; manual: added by hand. */
    source: "verified" | "manual";
    label: string;
    /** How moesekai-api reads its data for this visitor. */
    readVia: "oauth" | "public";
}

export interface StarMoeAccounts {
    /** off: signed out or not offered; loading: first answer pending; ready: list below is current. */
    status: "off" | "loading" | "ready" | "error";
    accounts: StarMoeServerAccount[];
    haruki: HarukiLink;
    harukiName: string;
    connectUrl: string;
    maxManual: number;
}

const OFF: StarMoeAccounts = { status: "off", accounts: [], haruki: "unknown", harukiName: "", connectUrl: "", maxManual: 20 };
const CONNECT_FALLBACK = "https://connect.star.moe/";
/** moesekai-api's versioned routes for the signed-in visitor (the site and Moebot share them). */
const ACCOUNTS_BASE = "/api/v1/me/accounts";
const SEKAI_BASE = "/api/v1/me/sekai";
const REQUEST_TIMEOUT_MS = 20_000;
const REFRESH_AFTER_MS = 60_000;

let state: StarMoeAccounts = OFF;
/** moesekai-api answered 404 for the accounts route: this deployment does not have the feature (or does not forward it). */
let unsupported = false;
let inFlight: Promise<StarMoeAccounts> | null = null;
let lastLoadAt = 0;
const listeners = new Set<() => void>();
const applyHooks = new Set<(next: StarMoeAccounts) => void>();

function setState(next: StarMoeAccounts): void {
    state = next;
    listeners.forEach((listener) => listener());
}

export function getStarMoeAccounts(): StarMoeAccounts {
    return state;
}

/** True when game data and saved accounts should go through moesekai-api for this visitor. */
export function starMoeDataEnabled(): boolean {
    return !unsupported && getMoesekaiAccount().status === "signed-in";
}

/** The account library registers here to fold a fresh list into the browser's copy. */
export function onStarMoeAccountsLoaded(hook: (next: StarMoeAccounts) => void): () => void {
    applyHooks.add(hook);
    return () => applyHooks.delete(hook);
}

export class StarMoeApiError extends Error {
    readonly status: number;
    readonly code: string;

    // Plain fields rather than parameter properties, so Node's type stripping can load this module in scripts.
    constructor(status: number, code: string) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const url = `${MOESEKAI_API_ORIGIN}${path}`;
        const method = init.method ?? "GET";
        return await fetch(method === "GET" ? uncachedUrl(url) : url, {
            ...init,
            headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
            credentials: apiCredentials(MOESEKAI_API_ORIGIN),
            cache: "no-store",
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function errorFrom(response: Response): Promise<StarMoeApiError> {
    let code = `http_${response.status}`;
    try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === "string") code = body.error;
    } catch {
        // not JSON
    }
    if (response.status === 401) markSignedOut();
    return new StarMoeApiError(response.status, code);
}

function parseList(body: unknown): StarMoeAccounts | null {
    if (!body || typeof body !== "object") return null;
    const raw = body as Record<string, unknown>;
    if (!Array.isArray(raw.accounts)) return null;
    const accounts: StarMoeServerAccount[] = [];
    for (const item of raw.accounts) {
        if (!item || typeof item !== "object") continue;
        const a = item as Record<string, unknown>;
        const server = typeof a.server === "string" ? a.server.toLowerCase() : "";
        const uid = typeof a.uid === "string" ? a.uid : "";
        if (!isValidServer(server) || !/^\d{1,24}$/.test(uid)) continue;
        accounts.push({
            server,
            uid,
            source: a.source === "verified" ? "verified" : "manual",
            label: typeof a.label === "string" ? a.label : "",
            readVia: a.read_via === "oauth" ? "oauth" : "public",
        });
    }
    const haruki = raw.haruki;
    return {
        status: "ready",
        accounts,
        haruki: haruki === "active" || haruki === "needs_reconnect" || haruki === "not_connected" ? haruki : "unknown",
        harukiName: typeof raw.haruki_name === "string" ? raw.haruki_name : "",
        connectUrl: typeof raw.connect_url === "string" && raw.connect_url.startsWith("https://") ? raw.connect_url : CONNECT_FALLBACK,
        maxManual: typeof raw.max_manual === "number" ? raw.max_manual : 20,
    };
}

function publish(next: StarMoeAccounts): StarMoeAccounts {
    lastLoadAt = Date.now();
    setState(next);
    applyHooks.forEach((hook) => hook(next));
    return next;
}

async function answer(response: Response): Promise<StarMoeAccounts> {
    if (response.status === 404) {
        // The routes are not deployed (or not forwarded): behave as before this feature.
        unsupported = true;
        setState(OFF);
        return OFF;
    }
    if (!response.ok) throw await errorFrom(response);
    const parsed = parseList(await response.json());
    if (!parsed) throw new StarMoeApiError(response.status, "invalid_response");
    return publish(parsed);
}

/** Loads the saved accounts; concurrent callers share one request. Signed out, it resets to "off". */
export function loadStarMoeAccounts(force = false): Promise<StarMoeAccounts> {
    if (!starMoeDataEnabled()) {
        if (state.status !== "off") setState(OFF);
        return Promise.resolve(OFF);
    }
    if (!force && state.status === "ready" && Date.now() - lastLoadAt < REFRESH_AFTER_MS) return Promise.resolve(state);
    if (inFlight) return inFlight;
    if (state.status === "off") setState({ ...OFF, status: "loading" });
    inFlight = request(ACCOUNTS_BASE)
        .then(answer)
        .catch((error: unknown) => {
            if (state.status !== "ready") setState({ ...OFF, status: "error" });
            throw error;
        })
        .finally(() => {
            inFlight = null;
        });
    return inFlight;
}

function accountPath(server: ServerType, uid: string): string {
    return `${ACCOUNTS_BASE}/${encodeURIComponent(server)}/${encodeURIComponent(uid)}`;
}

/** Saves a hand-added account with the StarMoe account. Rejects with code too_many_accounts at the limit. */
export async function saveStarMoeAccount(server: ServerType, uid: string, label = ""): Promise<StarMoeAccounts> {
    return answer(await request(ACCOUNTS_BASE, { method: "POST", body: JSON.stringify({ server, uid, label }) }));
}

/** Copies accounts kept only in this browser to the StarMoe account (up to the limit; existing ones stay). */
export async function importStarMoeAccounts(items: { server: ServerType; uid: string; label?: string }[]): Promise<StarMoeAccounts> {
    const accounts = items.map((item) => ({ server: item.server, uid: item.uid, label: item.label ?? "" }));
    return answer(await request(`${ACCOUNTS_BASE}/import`, { method: "POST", body: JSON.stringify({ accounts }) }));
}

/** Removes a hand-added account. Verified ones come from Haruki and cannot be removed here. */
export async function removeStarMoeAccount(server: ServerType, uid: string): Promise<void> {
    const response = await request(accountPath(server, uid), { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw await errorFrom(response);
    await loadStarMoeAccounts(true).catch(() => undefined);
}

/** Where to send the visitor to connect (or manage) Haruki on StarMoe Connect, coming back to `returnTo`. */
export function connectHref(returnTo?: string): string {
    const base = state.connectUrl || CONNECT_FALLBACK;
    if (typeof window === "undefined") return base;
    const back = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? `${window.location.origin}${returnTo}`
        : window.location.href;
    const url = new URL(base);
    url.searchParams.set("return_to", back);
    return url.toString();
}

// ==================== game data ====================

export interface SekaiRead {
    data: Record<string, unknown>;
    /** oauth: through the visitor's Haruki connection; public: Haruki's public API. */
    source: "oauth" | "public";
    /** The visitor's Haruki connection needs renewing; the public API was used meanwhile. */
    reconnect: boolean;
}

/** Error codes the account library already understands. */
export type SekaiReadError = "API_NOT_PUBLIC" | "NOT_FOUND" | "NETWORK_ERROR" | "LOGIN_REQUIRED" | "UNSUPPORTED";

function readError(status: number, code: string): SekaiReadError {
    if (status === 401) return "LOGIN_REQUIRED";
    if (status === 404 && code === "data_not_public") return "API_NOT_PUBLIC";
    // Not deployed (404) or moesekai-api unreachable (503): read Haruki's public API directly instead.
    if (status === 404 || status === 503) return "UNSUPPORTED";
    if (status === 400) return "NOT_FOUND";
    return "NETWORK_ERROR";
}

async function sekaiResponse(server: ServerType, type: "suite" | "mysekai", uid: string, keys?: string[]): Promise<Response> {
    const query = keys && keys.length > 0 ? `?key=${encodeURIComponent(keys.join(","))}` : "";
    const response = await request(`${SEKAI_BASE}/${server}/${type}/${encodeURIComponent(uid)}${query}`);
    if (response.ok) {
        if (response.headers.get("X-Haruki-Reconnect") === "1") markHarukiReconnect();
        return response;
    }
    const error = await errorFrom(response);
    if (response.status === 404 && error.code !== "data_not_public") unsupported = true;
    throw new Error(readError(response.status, error.code));
}

/** Reads `keys` of an account's suite through moesekai-api. Throws an Error whose message is a SekaiReadError. */
export async function readSekaiSuite(server: ServerType, uid: string, keys: string[]): Promise<SekaiRead> {
    let response: Response;
    try {
        response = await sekaiResponse(server, "suite", uid, keys);
    } catch (error) {
        if (error instanceof Error && /^(API_NOT_PUBLIC|NOT_FOUND|LOGIN_REQUIRED|UNSUPPORTED|NETWORK_ERROR)$/.test(error.message)) throw error;
        throw new Error("NETWORK_ERROR");
    }
    const data = (await response.json()) as Record<string, unknown>;
    return {
        data,
        source: response.headers.get("X-Data-Source") === "oauth" ? "oauth" : "public",
        reconnect: response.headers.get("X-Haruki-Reconnect") === "1",
    };
}

/** The raw MYSEKAI response of an account through moesekai-api, for callers that stream or size-check it. */
export function readSekaiMysekai(server: ServerType, uid: string): Promise<Response> {
    return sekaiResponse(server, "mysekai", uid);
}

function markHarukiReconnect(): void {
    if (state.status === "ready" && state.haruki === "active") setState({ ...state, haruki: "needs_reconnect" });
}

// ==================== hooks ====================

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useStarMoeAccounts(): StarMoeAccounts {
    return useSyncExternalStore(subscribe, getStarMoeAccounts, () => OFF);
}
