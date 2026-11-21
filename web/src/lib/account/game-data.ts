/**
 * Reading a game account's data from Haruki.
 *
 * Signed in to StarMoe, every read goes through moesekai-api (/api/v1/me/sekai), which uses the visitor's Haruki
 * connection on StarMoe Connect for their verified accounts and Haruki's public API for the rest. Signed out (or
 * when moesekai-api cannot answer) the public API is read directly, except for accounts still bound with the
 * legacy browser OAuth2 client (../legacy-oauth, until 2026-12-20).
 */
import type { ServerType } from "../account-servers";
import { getHarukiPublicApiBase } from "../haruki-public-api";
import {
    isLegacyOAuthAccount,
    legacyOAuthAccessToken,
    legacyOAuthMysekaiRequest,
    readLegacyOAuthGameData,
} from "../legacy-oauth/accounts";
import { readSekaiMysekai, readSekaiSuite, starMoeDataEnabled } from "../starmoe-accounts";
import { getLeaderCardId, getTopCharacterId } from "./display";
import { normalizeAccountDataError, normalizeHarukiApiResponse, VERIFY_KEYS } from "./game-data-format";
import { getAccounts, updateAccount } from "./store";
import type { AccountRefreshError, DeckUserDataAccess, HarukiApiResult, MoesekaiAccount } from "./types";

/** Read errors that mean "moesekai-api cannot serve this visitor here": use the public API directly instead. */
function isStarMoeFallback(error: unknown): boolean {
    const message = error instanceof Error ? error.message : "";
    return message === "LOGIN_REQUIRED" || message === "UNSUPPORTED";
}

/** Reads `keys` of any account: through moesekai-api when signed in, else Haruki's public API. */
async function fetchPublicGameData(server: ServerType, gameId: string, keys: string[]): Promise<Record<string, unknown>> {
    if (starMoeDataEnabled()) {
        try {
            return (await readSekaiSuite(server, gameId, keys)).data;
        } catch (error) {
            if (!isStarMoeFallback(error)) throw error;
        }
    }
    const url = `${getHarukiPublicApiBase()}/${server}/suite/${gameId}?key=${keys.join(",")}`;
    let res: Response;
    try {
        res = await fetch(url);
    } catch {
        throw new Error("NETWORK_ERROR");
    }
    if (res.status === 404) throw new Error("NOT_FOUND");
    if (res.status === 403) throw new Error("API_NOT_PUBLIC");
    if (!res.ok) throw new Error("NETWORK_ERROR");
    return res.json() as Promise<Record<string, unknown>>;
}

/** Checks that (server, gameId) can be read and returns what the profile page shows. Never throws. */
export async function verifyHarukiApi(server: ServerType, gameId: string): Promise<HarukiApiResult> {
    try {
        return normalizeHarukiApiResponse(await fetchPublicGameData(server, gameId, VERIFY_KEYS));
    } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "API_NOT_PUBLIC" || message === "NOT_FOUND") return { success: false, error: message };
        return { success: false, error: "NETWORK_ERROR" };
    }
}

/** Reads `keys` of a saved account. Throws an Error whose message normalizeAccountDataError() understands. */
export async function fetchAccountGameData(account: MoesekaiAccount, keys: string[]): Promise<Record<string, unknown>> {
    if (isLegacyOAuthAccount(account) && !starMoeDataEnabled()) {
        try {
            return await readLegacyOAuthGameData(account, keys);
        } catch (error) {
            if (account.isApiPublic) return fetchPublicGameData(account.server, account.gameId, keys);
            throw new Error(normalizeAccountDataError(error));
        }
    }
    return fetchPublicGameData(account.server, account.gameId, keys);
}

/**
 * Signed in to StarMoe, the deck workers read through moesekai-api; otherwise with the account's legacy OAuth2
 * token when it has a working one, else Haruki's public API.
 */
export async function getDeckUserDataAccess(server: ServerType, gameId: string): Promise<DeckUserDataAccess> {
    if (starMoeDataEnabled()) return { viaStarMoe: true };
    const oauthAccessToken = await legacyOAuthAccessToken(server, gameId);
    return oauthAccessToken ? { viaStarMoe: false, oauthAccessToken } : { viaStarMoe: false };
}

// ==================== refreshing saved accounts ====================

const refreshing = new Map<string, Promise<AccountRefreshError | null>>();

async function readAndStore(account: MoesekaiAccount): Promise<AccountRefreshError | null> {
    let result: HarukiApiResult;
    try {
        result = normalizeHarukiApiResponse(await fetchAccountGameData(account, VERIFY_KEYS));
    } catch (error) {
        const code = normalizeAccountDataError(error);
        if (code === "OAUTH_REAUTH_REQUIRED" || code === "OAUTH_ACCESS_FAILED") return "OAUTH";
        return code === "API_NOT_PUBLIC" || code === "NOT_FOUND" ? code : "NETWORK_ERROR";
    }
    if (!result.success) return result.error === "API_NOT_PUBLIC" || result.error === "NOT_FOUND" ? result.error : "NETWORK_ERROR";
    storeGameData(account, result);
    return null;
}

/** Stores what a successful read returned on the account (data, upload time, avatar, in-game name). */
export function storeGameData(account: MoesekaiAccount, result: HarukiApiResult): void {
    const userGamedata = result.userGamedata ?? null;
    const userDecks = result.userDecks ?? null;
    const userCharacters = result.userCharacters ?? null;
    updateAccount(account.id, {
        userCharacters,
        userGamedata,
        userDecks,
        userChallengeLiveSoloStages: result.userChallengeLiveSoloStages ?? null,
        userChallengeLiveSoloResults: result.userChallengeLiveSoloResults ?? null,
        userChallengeLiveSoloHighScoreRewards: result.userChallengeLiveSoloHighScoreRewards ?? null,
        userBonds: result.userBonds ?? null,
        userMaterials: result.userMaterials ?? null,
        userAreas: result.userAreas ?? null,
        userMysekaiFixtureGameCharacterPerformanceBonuses: result.userMysekaiFixtureGameCharacterPerformanceBonuses ?? null,
        userMysekaiGates: result.userMysekaiGates ?? null,
        uploadTime: result.uploadTime ?? null,
        avatarCardId: getLeaderCardId(userGamedata, userDecks),
        avatarCharacterId: userCharacters && userCharacters.length > 0 ? getTopCharacterId(userCharacters) : account.avatarCharacterId,
        nickname: userGamedata?.name || account.nickname,
        lastSyncAt: Date.now(),
    });
}

/**
 * Re-reads one saved account and stores what came back. Resolves to why it failed (the old data stays), or null.
 * Calls for an account already being read share that read.
 */
export function refreshGameAccount(accountId: string): Promise<AccountRefreshError | null> {
    const pending = refreshing.get(accountId);
    if (pending) return pending;
    const account = getAccounts().find((item) => item.id === accountId);
    if (!account) return Promise.resolve(null);
    const task = readAndStore(account).finally(() => refreshing.delete(accountId));
    refreshing.set(accountId, task);
    return task;
}

/** Re-reads saved accounts one after another; `onlyMissing` skips accounts that already have data. */
export async function refreshGameAccounts({ onlyMissing = false } = {}): Promise<void> {
    const targets = getAccounts().filter((acc) => !onlyMissing || (!acc.uploadTime && !acc.userGamedata));
    for (const account of targets) {
        await refreshGameAccount(account.id);
    }
}

// ==================== MYSEKAI ====================

/** Raw MYSEKAI JSON for the isolated renderer. No cache or local data write.
 * Haruki source: public.go RegisterPublicRoutes at be8bf2d8b8ea09745dc8d465ecc71aab227bb563.
 * MYSEKAI and suite public permissions are independent. A denied OAuth read
 * must not fall back silently to a differently authorized dataset.
 */
export async function fetchAccountMysekaiText(server: "cn" | "jp", gameId: string, signal?: AbortSignal): Promise<string> {
    if (!/^[1-9]\d{0,19}$/.test(gameId)) throw new Error("INVALID_UID");
    let response: Response | null = null;
    if (starMoeDataEnabled()) {
        try {
            response = await readSekaiMysekai(server, gameId);
        } catch (error) {
            if (!isStarMoeFallback(error)) {
                throw new Error(error instanceof Error && error.message === "API_NOT_PUBLIC" ? "MYSEKAI_NOT_ACCESSIBLE" : "NETWORK_ERROR");
            }
        }
    }
    if (!response) {
        let url = `${getHarukiPublicApiBase()}/${server}/mysekai/${gameId}`;
        const headers: Record<string, string> = { Accept: "application/json" };
        const legacy = await legacyOAuthMysekaiRequest(server, gameId);
        if (legacy) {
            url = legacy.url;
            headers.Authorization = legacy.authorization;
        }
        response = await fetch(url, { headers, signal, cache: "no-store", credentials: "omit", redirect: "error" });
        if (response.status === 401) throw new Error("OAUTH_REAUTH_REQUIRED");
        if (response.status === 403 || response.status === 404) throw new Error("MYSEKAI_NOT_ACCESSIBLE");
        if (!response.ok) throw new Error("NETWORK_ERROR");
    }
    if (!response.headers.get("content-type")?.includes("json")) throw new Error("INVALID_PLAYER_DATA");
    const limit = 32 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > limit) throw new Error("PLAYER_DATA_TOO_LARGE");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("INVALID_PLAYER_DATA");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const chunks: string[] = [];
    let bytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > limit) throw new Error("PLAYER_DATA_TOO_LARGE");
            chunks.push(decoder.decode(value, { stream: true }));
        }
        chunks.push(decoder.decode());
        return chunks.join("");
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
}
