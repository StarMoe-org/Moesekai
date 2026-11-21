/**
 * Game accounts bound with the browser's own Haruki OAuth2 client (authSource "oauth2").
 *
 * LEGACY: this binding stops on 2026-12-20, when this whole directory goes away. Since StarMoe Connect, a signed-in
 * visitor's data is read through moesekai-api instead and these tokens are no longer used or refreshed; they only
 * still serve visitors who are signed out. Nothing new should depend on this module.
 */
import { normalizeServer, type ServerType } from "../account-servers";
import { getLeaderCardId, getTopCharacterId } from "../account/display";
import {
    getAccountDataErrorMessage,
    getDefaultDataValue,
    normalizeAccountDataError,
    normalizeAccountDataPayload,
    normalizeHarukiApiResponse,
    normalizePerKeyAccountDataValue,
} from "../account/game-data-format";
import { addAccount, findAccountByGameId, getAccounts, makeAccountId, setActiveAccount, updateAccount } from "../account/store";
import type { HarukiApiResult, MoesekaiAccount, OAuthTokenInfo } from "../account/types";
import {
    fetchOAuthGameData,
    fetchOAuthGameDataSuite,
    getOAuthConfig,
    refreshOAuthToken,
    revokeOAuthToken,
    type OAuthBinding,
    type OAuthProfile,
    type OAuthTokenSet,
} from "./client";

/** The day the browser OAuth2 binding stops working (shown to visitors). */
export const LEGACY_OAUTH_END_DATE = "2026-12-20";

export function isLegacyOAuthAccount(account: Pick<MoesekaiAccount, "authSource">): boolean {
    return account.authSource === "oauth2";
}

const pendingTokenRefreshes = new Map<string, Promise<OAuthTokenInfo>>();

async function getRefreshedOAuthToken(account: MoesekaiAccount): Promise<OAuthTokenInfo> {
    const existing = account.oauthToken;
    if (!existing) {
        throw new Error("OAUTH_TOKEN_MISSING");
    }
    const expiresSoon = existing.expiresAt !== null && existing.expiresAt <= Date.now() + 30_000;
    if (!expiresSoon) {
        return existing;
    }
    const refreshToken = existing.refreshToken;
    if (!refreshToken) {
        throw new Error("OAUTH_REAUTH_REQUIRED");
    }

    // The server rotates refresh tokens, so parallel refreshes would invalidate each other.
    const pending = pendingTokenRefreshes.get(account.id);
    if (pending) {
        return pending;
    }

    const refreshTask = (async () => {
        const refreshed = await refreshOAuthToken(refreshToken);
        const nextToken: OAuthTokenInfo = {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: refreshed.expiresAt,
            tokenType: refreshed.tokenType,
            scope: refreshed.scope,
        };
        updateAccount(account.id, {
            oauthToken: nextToken,
            oauthScopes: refreshed.scope,
            authError: null,
        });
        return nextToken;
    })().finally(() => {
        pendingTokenRefreshes.delete(account.id);
    });

    pendingTokenRefreshes.set(account.id, refreshTask);
    return refreshTask;
}

function isOAuthBadRequestError(error: unknown): boolean {
    return getAccountDataErrorMessage(error).startsWith("AUTHORIZED_REQUEST_FAILED_400");
}

function shouldFallbackToOAuthPerKey(error: unknown): boolean {
    const message = getAccountDataErrorMessage(error);
    return isOAuthBadRequestError(error) || message === "INVALID_ACCOUNT_DATA_PAYLOAD";
}

async function fetchOAuthGameDataPerKey(
    accessToken: string,
    server: ServerType,
    gameId: string,
    keys: string[],
    accountId?: string,
): Promise<Record<string, unknown>> {
    const entries = await Promise.all(keys.map(async (key) => {
        try {
            const payload = await fetchOAuthGameData(accessToken, server, key, gameId);
            return [key, normalizePerKeyAccountDataValue(key, payload)] as const;
        } catch (error) {
            if (isOAuthBadRequestError(error)) {
                console.warn(`[OAuth2] game-data key "${key}" returned 400, using fallback default value`, { accountId, server, gameId });
                return [key, getDefaultDataValue(key)] as const;
            }
            throw error;
        }
    }));

    return Object.fromEntries(entries);
}

/**
 * Reads `keys` of a legacy OAuth2 account with its token. Marks the account when the binding needs re-authorizing
 * and rethrows; the caller decides whether the public API may stand in.
 */
export async function readLegacyOAuthGameData(account: MoesekaiAccount, keys: string[]): Promise<Record<string, unknown>> {
    try {
        const token = await getRefreshedOAuthToken(account);
        let data: Record<string, unknown>;
        if (keys.length > 1) {
            try {
                const suite = await fetchOAuthGameDataSuite(token.accessToken, account.server, account.gameId);
                data = normalizeAccountDataPayload(suite, keys);
            } catch (error) {
                if (!shouldFallbackToOAuthPerKey(error)) {
                    throw error;
                }
                console.warn("[OAuth2] suite endpoint unavailable or payload invalid, falling back to per-key requests", { accountId: account.id, keys, error });
                data = await fetchOAuthGameDataPerKey(token.accessToken, account.server, account.gameId, keys, account.id);
            }
        } else {
            data = await fetchOAuthGameDataPerKey(token.accessToken, account.server, account.gameId, keys, account.id);
        }
        if (account.authError) updateAccount(account.id, { authError: null });
        return data;
    } catch (error) {
        if (normalizeAccountDataError(error) === "OAUTH_REAUTH_REQUIRED") {
            updateAccount(account.id, { authError: "reauth_required" });
        }
        throw error;
    }
}

/** The current OAuth2 access token of the legacy account bound to (server, gameId), for the deck workers. */
export async function legacyOAuthAccessToken(server: ServerType, gameId: string): Promise<string | undefined> {
    const account = findAccountByGameId(server, gameId);
    if (!account || !isLegacyOAuthAccount(account) || account.authError === "reauth_required") return undefined;
    try {
        return (await getRefreshedOAuthToken(account)).accessToken;
    } catch (error) {
        if (normalizeAccountDataError(error) === "OAUTH_REAUTH_REQUIRED") {
            updateAccount(account.id, { authError: "reauth_required" });
        }
        return undefined;
    }
}

/** Where and how to read a legacy account's MYSEKAI data; null when (server, gameId) is not one. */
export async function legacyOAuthMysekaiRequest(server: ServerType, gameId: string): Promise<{ url: string; authorization: string } | null> {
    const account = findAccountByGameId(server, gameId);
    if (!account || !isLegacyOAuthAccount(account)) return null;
    const token = await getRefreshedOAuthToken(account);
    return {
        url: `${getOAuthConfig().baseUrl}/game-data/${server}/mysekai/${gameId}`,
        authorization: `Bearer ${token.accessToken}`,
    };
}

export async function fetchOAuthBindingInitialData(
    accessToken: string,
    server: ServerType,
    gameId: string,
): Promise<HarukiApiResult | null> {
    const initialKeys = ["userGamedata", "userDecks", "userCharacters", "upload_time"];

    try {
        try {
            const suite = await fetchOAuthGameDataSuite(accessToken, server, gameId);
            const normalized = normalizeHarukiApiResponse(normalizeAccountDataPayload(suite, initialKeys));
            return normalized.success ? normalized : null;
        } catch (error) {
            if (!shouldFallbackToOAuthPerKey(error)) {
                throw error;
            }
            console.warn("[OAuth2] initial suite endpoint unavailable or payload invalid, falling back to per-key requests", { server, gameId, error });
        }

        const perKey = await fetchOAuthGameDataPerKey(accessToken, server, gameId, initialKeys, `${server}_${gameId}`);
        const normalized = normalizeHarukiApiResponse(perKey);
        return normalized.success ? normalized : null;
    } catch (error) {
        console.warn("[OAuth2] failed to preload initial binding data", { server, gameId, error });
        return null;
    }
}

export interface CreateOrUpdateOAuthAccountInput {
    binding: OAuthBinding;
    profile: OAuthProfile | null;
    tokenSet: OAuthTokenSet;
    initialData?: HarukiApiResult | null;
}

export function createOrUpdateOAuthAccount({ binding, profile, tokenSet, initialData }: CreateOrUpdateOAuthAccountInput): MoesekaiAccount {
    const server = normalizeServer(binding.server ?? binding.region);
    const gameId = String(binding.gameId ?? binding.userId ?? binding.uid ?? "").trim();
    if (!gameId || !server) {
        throw new Error("INVALID_OAUTH_BINDING");
    }

    const accountId = makeAccountId(server, gameId);
    const existing = getAccounts().find((account) => account.id === accountId);
    const oauthToken: OAuthTokenInfo = {
        accessToken: tokenSet.accessToken,
        refreshToken: tokenSet.refreshToken,
        expiresAt: tokenSet.expiresAt,
        tokenType: tokenSet.tokenType,
        scope: tokenSet.scope,
    };

    const nickname = initialData?.userGamedata?.name
        || (typeof profile?.name === "string" ? profile.name : null)
        || (typeof profile?.nickname === "string" ? profile.nickname : null)
        || existing?.nickname
        || "";

    const userCharacters = initialData?.userCharacters ?? existing?.userCharacters ?? null;
    const userGamedata = initialData?.userGamedata ?? existing?.userGamedata ?? null;
    const userDecks = initialData?.userDecks ?? existing?.userDecks ?? null;

    const account: MoesekaiAccount = {
        // Keeps whatever StarMoe already knows about this account.
        ...existing,
        id: accountId,
        gameId,
        server,
        nickname,
        avatarCharacterId: userCharacters && userCharacters.length > 0 ? getTopCharacterId(userCharacters) : existing?.avatarCharacterId ?? null,
        avatarCardId: getLeaderCardId(userGamedata, userDecks) ?? existing?.avatarCardId ?? null,
        isApiPublic: existing?.isApiPublic ?? false,
        authSource: "oauth2",
        oauthSubject: String(profile?.sub ?? profile?.id ?? profile?.userId ?? existing?.oauthSubject ?? "") || null,
        oauthScopes: tokenSet.scope,
        oauthToken,
        oauthBindingId: String(binding.bindingId ?? binding.id ?? existing?.oauthBindingId ?? "") || null,
        lastSyncAt: Date.now(),
        authError: null,
        userCharacters,
        userGamedata,
        userDecks,
        userChallengeLiveSoloStages: initialData?.userChallengeLiveSoloStages ?? existing?.userChallengeLiveSoloStages ?? null,
        userChallengeLiveSoloResults: initialData?.userChallengeLiveSoloResults ?? existing?.userChallengeLiveSoloResults ?? null,
        userChallengeLiveSoloHighScoreRewards: initialData?.userChallengeLiveSoloHighScoreRewards ?? existing?.userChallengeLiveSoloHighScoreRewards ?? null,
        userBonds: initialData?.userBonds ?? existing?.userBonds ?? null,
        userMaterials: initialData?.userMaterials ?? existing?.userMaterials ?? null,
        userAreas: initialData?.userAreas ?? existing?.userAreas ?? null,
        userMysekaiFixtureGameCharacterPerformanceBonuses: initialData?.userMysekaiFixtureGameCharacterPerformanceBonuses ?? existing?.userMysekaiFixtureGameCharacterPerformanceBonuses ?? null,
        userMysekaiGates: initialData?.userMysekaiGates ?? existing?.userMysekaiGates ?? null,
        uploadTime: initialData?.uploadTime ?? existing?.uploadTime ?? null,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
    };

    addAccount(account);
    setActiveAccount(account.id);
    return account;
}

/** Revokes a legacy account's token (best effort) and turns it into a public-API account. */
export async function disconnectOAuthAccount(accountId: string): Promise<void> {
    const account = getAccounts().find((item) => item.id === accountId);
    if (account?.oauthToken?.accessToken) {
        try {
            await revokeOAuthToken(account.oauthToken.accessToken);
        } catch {
            // Ignore revoke failures and still allow local disconnect.
        }
    }

    updateAccount(accountId, {
        authSource: "public_api",
        oauthSubject: null,
        oauthScopes: [],
        oauthToken: null,
        oauthBindingId: null,
        authError: null,
    });
}
