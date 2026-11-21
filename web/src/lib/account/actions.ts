/**
 * What the visitor does to their game accounts, in one place for every page: add one by UID, delete one, save the
 * ones kept only on this device to the StarMoe Passport. Pages show the outcome; they do not repeat these steps.
 */
import type { ServerType } from "../account-servers";
import { disconnectOAuthAccount, isLegacyOAuthAccount } from "../legacy-oauth/accounts";
import { importStarMoeAccounts, removeStarMoeAccount, StarMoeApiError, starMoeDataEnabled } from "../starmoe-accounts";
import { getTopCharacterId } from "./display";
import { storeGameData, verifyHarukiApi } from "./game-data";
import { rememberAccount } from "./starmoe-sync";
import { createAccount, findAccountByGameId, getAccounts, removeAccount, setActiveAccount } from "./store";

/** Where an added account ended up: saved to the Passport, kept on this device (guest), or kept here because saving failed. */
export type AddedTo = "passport" | "device" | "device-full" | "device-failed";

export type AddGameAccountResult =
    | { ok: true; accountId: string; addedTo: AddedTo }
    | { ok: false; error: "DUPLICATE" | "API_NOT_PUBLIC" | "NOT_FOUND" | "NETWORK_ERROR"; accountId?: string };

/**
 * Reads the account from Haruki, adds it to the list and makes it the one being viewed, then (signed in) saves it
 * to the Passport. An account already in the list is not added twice.
 */
export async function addGameAccount(server: ServerType, gameId: string): Promise<AddGameAccountResult> {
    const existing = findAccountByGameId(server, gameId);
    if (existing) return { ok: false, error: "DUPLICATE", accountId: existing.id };

    const result = await verifyHarukiApi(server, gameId);
    if (!result.success) return { ok: false, error: result.error ?? "NETWORK_ERROR" };

    const userCharacters = result.userCharacters ?? null;
    const account = createAccount(
        gameId,
        server,
        result.userGamedata?.name ?? "",
        userCharacters && userCharacters.length > 0 ? getTopCharacterId(userCharacters) : null,
        userCharacters,
        true,
    );
    storeGameData(account, result);
    setActiveAccount(account.id);

    try {
        const saved = await rememberAccount(server, gameId);
        return { ok: true, accountId: account.id, addedTo: saved ? "passport" : "device" };
    } catch (error) {
        const full = error instanceof StarMoeApiError && error.code === "too_many_accounts";
        return { ok: true, accountId: account.id, addedTo: full ? "device-full" : "device-failed" };
    }
}

/**
 * Deletes a game account: from the Passport first when it is saved there (and throws if that fails, leaving the
 * account as it was), then the legacy browser OAuth2 authorization if it has one, then from this device.
 * Verified accounts come from Haruki and are not deleted while signed in; callers do not offer it.
 */
export async function deleteGameAccount(accountId: string): Promise<void> {
    const account = getAccounts().find((item) => item.id === accountId);
    if (!account) return;
    if (account.starmoeSource === "manual" && starMoeDataEnabled()) {
        await removeStarMoeAccount(account.server, account.gameId);
    }
    if (isLegacyOAuthAccount(account)) {
        // A failed revoke still lets the account go from this device.
        await disconnectOAuthAccount(accountId).catch(() => undefined);
    }
    removeAccount(accountId, { remote: false });
}

/** Saves every account kept only on this device to the Passport. Rejects with code too_many_accounts at the limit. */
export async function saveLocalAccountsToPassport(): Promise<void> {
    const local = getAccounts().filter((account) => !account.starmoeSource);
    if (local.length === 0) return;
    await importStarMoeAccounts(local.map((account) => ({ server: account.server, uid: account.gameId })));
}
