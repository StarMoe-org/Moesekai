/**
 * Moesekai's game accounts. See docs/account-system.md for how they relate to the StarMoe pass and Haruki.
 *
 * - types.ts            account and game data shapes
 * - store.ts            the list on this device (localStorage) and the active account
 * - starmoe-sync.ts     following the StarMoe account's list when signed in
 * - game-data.ts        reading data from Haruki (moesekai-api, public API) and refreshing saved accounts
 * - game-data-format.ts normalizing Haruki answers and errors
 * - actions.ts          adding and deleting game accounts, saving local ones to the Passport
 * - display.ts          avatar helpers
 * - hooks.ts            useGameAccounts() (import from "@/lib/account/hooks" in client components)
 *
 * The legacy browser OAuth2 binding lives apart in ../legacy-oauth until it is removed on 2026-12-20.
 */
export * from "./types";
export { SERVER_IDS, SERVER_LABEL_KEYS, SERVER_OPTIONS, isValidServer, normalizeServer } from "../account-servers";
export * from "./display";
export * from "./store";
export { rememberAccount, getLocalOnlyAccounts } from "./starmoe-sync";
export { normalizeAccountDataError } from "./game-data-format";
export {
    fetchAccountGameData,
    fetchAccountMysekaiText,
    getDeckUserDataAccess,
    refreshGameAccount,
    refreshGameAccounts,
    storeGameData,
    verifyHarukiApi,
} from "./game-data";
export { addGameAccount, deleteGameAccount, saveLocalAccountsToPassport, type AddedTo, type AddGameAccountResult } from "./actions";
