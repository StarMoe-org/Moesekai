/**
 * The game accounts this browser knows, in localStorage, so every page can read them synchronously.
 *
 * Signed in to StarMoe, the list follows the StarMoe account (starmoe-sync.ts folds it in); signed out it is the
 * visitor's own list on this device. Every change fires ACCOUNTS_CHANGED_EVENT; useGameAccounts() follows it.
 */
import { isValidServer, type ServerType } from "../account-servers";
import { removeStarMoeAccount, starMoeDataEnabled } from "../starmoe-accounts";
import type { MoesekaiAccount, UserCharacter } from "./types";

const ACCOUNTS_KEY = "moesekai_accounts";
const ACTIVE_KEY = "moesekai_active_account";
export const ACCOUNTS_CHANGED_EVENT = "moesekai:accounts-changed";

// Legacy keys
const LEGACY_ACCOUNT_KEY = "moesekai_account";
const LEGACY_USERID_KEY = "deck_recommend_userid";
const LEGACY_SERVER_KEY = "deck_recommend_server";

export function makeAccountId(server: ServerType, gameId: string): string {
    return `${server}_${gameId}`;
}

/** An account with no data yet, read through the public API until something says otherwise. */
export function emptyAccount(server: ServerType, gameId: string, overrides: Partial<MoesekaiAccount> = {}): MoesekaiAccount {
    const now = Date.now();
    return {
        id: makeAccountId(server, gameId),
        gameId,
        server,
        nickname: "",
        avatarCharacterId: null,
        avatarCardId: null,
        isApiPublic: true,
        authSource: "public_api",
        oauthSubject: null,
        oauthScopes: [],
        oauthToken: null,
        oauthBindingId: null,
        lastSyncAt: null,
        authError: null,
        userCharacters: null,
        userGamedata: null,
        userDecks: null,
        userChallengeLiveSoloStages: null,
        userChallengeLiveSoloResults: null,
        userChallengeLiveSoloHighScoreRewards: null,
        userBonds: null,
        userMaterials: null,
        userAreas: null,
        userMysekaiFixtureGameCharacterPerformanceBonuses: null,
        userMysekaiGates: null,
        uploadTime: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

// ==================== reading ====================

/** The raw stored list and active id, for snapshot comparisons (useGameAccounts). */
export function readStoredAccountsRaw(): { accounts: string | null; active: string | null } {
    if (typeof window === "undefined") return { accounts: null, active: null };
    try {
        return { accounts: localStorage.getItem(ACCOUNTS_KEY), active: localStorage.getItem(ACTIVE_KEY) };
    } catch {
        return { accounts: null, active: null };
    }
}

/** Get all accounts. */
export function getAccounts(): MoesekaiAccount[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(ACCOUNTS_KEY);
        if (raw) return JSON.parse(raw) as MoesekaiAccount[];

        // Try migrating from legacy data.
        return migrateFromLegacy();
    } catch {
        return [];
    }
}

/** The active account among `accounts`: the stored choice, else the first one. */
export function pickActiveAccount(accounts: MoesekaiAccount[], activeId: string | null): MoesekaiAccount | null {
    if (accounts.length === 0) return null;
    return (activeId ? accounts.find((a) => a.id === activeId) : undefined) ?? accounts[0];
}

/** Get the currently selected account. */
export function getActiveAccount(): MoesekaiAccount | null {
    const activeId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
    return pickActiveAccount(getAccounts(), activeId);
}

export function findAccountByGameId(server: ServerType, gameId: string): MoesekaiAccount | null {
    const normalized = gameId.trim();
    if (!normalized) return null;
    return getAccounts().find((account) => account.server === server && account.gameId === normalized) || null;
}

/** Check whether any accounts exist. */
export function hasAccounts(): boolean {
    return getAccounts().length > 0;
}

// ==================== writing ====================

export function notifyAccountsChanged(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(ACCOUNTS_CHANGED_EVENT));
}

/** Save all accounts (without notifying). */
export function saveAccounts(accounts: MoesekaiAccount[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function getActiveAccountId(): string | null {
    return typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
}

/** Set the currently selected account. */
export function setActiveAccount(accountId: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(ACTIVE_KEY, accountId);
    // Sync legacy keys for backward compatibility.
    const account = getAccounts().find(a => a.id === accountId);
    if (account) {
        localStorage.setItem(LEGACY_USERID_KEY, account.gameId);
        localStorage.setItem(LEGACY_SERVER_KEY, account.server);
    }
    notifyAccountsChanged();
}

/** Add an account. */
export function addAccount(account: MoesekaiAccount): void {
    const accounts = getAccounts();
    const existing = accounts.findIndex(a => a.id === account.id);
    if (existing >= 0) {
        accounts[existing] = { ...account, updatedAt: Date.now() };
    } else {
        accounts.push(account);
    }
    saveAccounts(accounts);
    // Automatically activate the first account.
    if (accounts.length === 1) {
        setActiveAccount(account.id);
        return;
    }
    notifyAccountsChanged();
}

/** Create and add an account. */
export function createAccount(
    gameId: string,
    server: ServerType,
    nickname: string,
    avatarCharacterId: number | null,
    userCharacters: UserCharacter[] | null,
    isApiPublic: boolean,
): MoesekaiAccount {
    const account = emptyAccount(server, gameId, { nickname, avatarCharacterId, userCharacters, isApiPublic });
    addAccount(account);
    return account;
}

/** Update an account. */
export function updateAccount(accountId: string, updates: Partial<MoesekaiAccount>): void {
    const accounts = getAccounts();
    const idx = accounts.findIndex(a => a.id === accountId);
    if (idx < 0) return;
    accounts[idx] = { ...accounts[idx], ...updates, updatedAt: Date.now() };
    saveAccounts(accounts);
    notifyAccountsChanged();
}

/** Remove an account. A hand-added account saved with the StarMoe account is removed there too. */
export function removeAccount(accountId: string): void {
    let accounts = getAccounts();
    const removed = accounts.find(a => a.id === accountId);
    if (removed?.starmoeSource === "manual" && starMoeDataEnabled()) {
        void removeStarMoeAccount(removed.server, removed.gameId).catch((error) => {
            console.warn(`Removing ${removed.id} from the StarMoe account failed`, error);
        });
    }
    accounts = accounts.filter(a => a.id !== accountId);
    saveAccounts(accounts);
    // If the active account was removed, switch to the first remaining account.
    if (getActiveAccountId() === accountId) {
        if (accounts.length > 0) {
            setActiveAccount(accounts[0].id);
            return;
        }
        localStorage.removeItem(ACTIVE_KEY);
        localStorage.removeItem(LEGACY_USERID_KEY);
        localStorage.removeItem(LEGACY_SERVER_KEY);
    }
    notifyAccountsChanged();
}

/** Clear all accounts on this device (a StarMoe account keeps its own list). */
export function clearAllAccounts(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(ACCOUNTS_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(LEGACY_ACCOUNT_KEY);
    localStorage.removeItem(LEGACY_USERID_KEY);
    localStorage.removeItem(LEGACY_SERVER_KEY);
    notifyAccountsChanged();
}

// ==================== backward compatibility ====================

/** Migrate from the single-account keys older versions kept. */
function migrateFromLegacy(): MoesekaiAccount[] {
    if (typeof window === "undefined") return [];

    const accounts: MoesekaiAccount[] = [];

    try {
        // Try migrating from the legacy single-account key.
        const oldRaw = localStorage.getItem(LEGACY_ACCOUNT_KEY);
        if (oldRaw) {
            const old = JSON.parse(oldRaw);
            if (old.gameId) {
                const server: ServerType = old.server && isValidServer(old.server) ? old.server : "jp";
                accounts.push(emptyAccount(server, old.gameId, {
                    nickname: old.nickname || "",
                    createdAt: old.createdAt || Date.now(),
                }));
            }
        }

        // Try migrating from the legacy userid key.
        if (accounts.length === 0) {
            const legacyId = localStorage.getItem(LEGACY_USERID_KEY);
            const legacyServer = localStorage.getItem(LEGACY_SERVER_KEY);
            if (legacyId) {
                const server: ServerType = legacyServer && isValidServer(legacyServer) ? legacyServer : "jp";
                accounts.push(emptyAccount(server, legacyId));
            }
        }

        if (accounts.length > 0) {
            saveAccounts(accounts);
            setActiveAccount(accounts[0].id);
        }
    } catch {
        // ignore migration errors
    }

    return accounts;
}

// ==================== legacy interfaces for the deck tools ====================

/** Legacy-compatible getAccount interface. */
export function getAccount(): { gameId: string; server: ServerType; toolStates: { deckRecommend: { userId: string; server: ServerType } | null; scoreControl: { userId: string; server: ServerType } | null } } | null {
    const active = getActiveAccount();
    if (!active) return null;
    const state = { userId: active.gameId, server: active.server, savedAt: Date.now() };
    return {
        gameId: active.gameId,
        server: active.server,
        toolStates: {
            deckRecommend: state,
            scoreControl: state,
        },
    };
}

/** Legacy-compatible saveToolState interface. */
export function saveToolState(
    _tool: "deckRecommend" | "scoreControl",
    userId: string,
    server: ServerType,
): void {
    const id = makeAccountId(server, userId);
    if (!getAccounts().some(a => a.id === id)) {
        // Auto-create the account.
        createAccount(userId, server, "", null, null, true);
    }
    setActiveAccount(id);
}

// ==================== avatar cache ====================

const AVATAR_CACHE_KEY = "moesekai_avatar_cache";

/** Get the cached avatar URL. */
export function getCachedAvatarUrl(accountId: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(AVATAR_CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw) as Record<string, string>;
        return cache[accountId] || null;
    } catch {
        return null;
    }
}

/** Cache the avatar URL. */
export function setCachedAvatarUrl(accountId: string, url: string): void {
    if (typeof window === "undefined") return;
    try {
        const raw = localStorage.getItem(AVATAR_CACHE_KEY);
        const cache: Record<string, string> = raw ? JSON.parse(raw) : {};
        cache[accountId] = url;
        localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // ignore
    }
}
