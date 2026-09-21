/**
 * Moesekai multi-account system.
 * Uses localStorage only and does not communicate with backend services directly.
 * Supports multiple accounts across every supported server (cn/jp/tw/kr/en).
 */

import {
    isValidServer,
    normalizeServer,
    SERVER_IDS,
    SERVER_LABEL_KEYS,
    SERVER_OPTIONS,
    type ServerType,
} from "./account-servers";

export { SERVER_IDS, SERVER_LABEL_KEYS, SERVER_OPTIONS, isValidServer, normalizeServer };
export type { ServerType };

export interface OAuthTokenInfo {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number | null;
    tokenType: string;
    scope: string[];
}

export interface MoesekaiAccount {
    id: string;                       // Unique id = `${server}_${gameId}`
    gameId: string;                   // UID
    server: ServerType;
    nickname: string;                 // Legacy nickname fallback; prefer userGamedata.name.
    avatarCharacterId: number | null; // Legacy character avatar id; prefer avatarCardId.
    avatarCardId: number | null;      // Avatar card id from the current deck leader.
    isApiPublic: boolean;
    authSource?: "public_api" | "oauth2";
    oauthSubject?: string | null;
    oauthScopes?: string[];
    oauthToken?: OAuthTokenInfo | null;
    oauthBindingId?: string | null;
    lastSyncAt?: number | null;
    authError?: "reauth_required" | null;
    userCharacters: UserCharacter[] | null;
    userGamedata: UserGamedata | null;
    userDecks: UserDeck[] | null;
    userChallengeLiveSoloStages: UserChallengeLiveSoloStage[] | null;
    userChallengeLiveSoloResults: UserChallengeLiveSoloResult[] | null;
    userChallengeLiveSoloHighScoreRewards: UserChallengeLiveSoloHighScoreReward[] | null;
    userBonds: UserBond[] | null;
    userMaterials: UserMaterial[] | null;
    userAreas: UserArea[] | null;
    userMysekaiFixtureGameCharacterPerformanceBonuses: UserMysekaiFixtureGameCharacterPerformanceBonus[] | null;
    userMysekaiGates: UserMysekaiGate[] | null;
    uploadTime: number | null;        // Data upload timestamp
    createdAt: number;
    updatedAt: number;
}

export interface UserCharacter {
    characterId: number;
    characterRank: number;
    totalExp: number;
}

export interface UserGamedata {
    coin: number;
    totalExp: number;
    name: string;
    exp: number;
    userId: number;
    deck: number;
}

export interface UserDeck {
    deckId: number;
    leader: number;
    subLeader: number;
    member1: number;
    member2: number;
    member3: number;
    member4: number;
    member5: number;
    name: string;
}

export interface UserChallengeLiveSoloStage {
    characterId: number;
    rank: number;
}

export interface UserChallengeLiveSoloResult {
    characterId: number;
    highScore: number;
}

export interface UserChallengeLiveSoloHighScoreReward {
    characterId: number;
    challengeLiveHighScoreRewardId: number;
    gameCharacterId?: number;
    challengeLiveSoloHighScoreRewardId?: number;
    rewardId?: number;
}

export interface UserBond {
    bondsGroupId: number;
    rank: number;
    exp: number;
}

export interface UserMaterial {
    materialId: number;
    quantity: number;
}

export interface UserAreaItem {
    areaItemId: number;
    level: number;
}

export interface UserArea {
    areaId: number;
    areaItems: UserAreaItem[];
}

export interface UserMysekaiFixtureGameCharacterPerformanceBonus {
    gameCharacterId: number;
    totalBonusRate: number;
}

export interface UserMysekaiGate {
    mysekaiGateId: number;
    mysekaiGateLevel: number;
}

export interface HarukiApiResult {
    success: boolean;
    error?: "NOT_FOUND" | "API_NOT_PUBLIC" | "NETWORK_ERROR";
    userProfile?: { word: string; userId: number };
    userCharacters?: UserCharacter[];
    userGamedata?: UserGamedata;
    userDecks?: UserDeck[];
    userChallengeLiveSoloStages?: UserChallengeLiveSoloStage[];
    userChallengeLiveSoloResults?: UserChallengeLiveSoloResult[];
    userChallengeLiveSoloHighScoreRewards?: UserChallengeLiveSoloHighScoreReward[];
    userBonds?: UserBond[];
    userMaterials?: UserMaterial[];
    userAreas?: UserArea[];
    userMysekaiFixtureGameCharacterPerformanceBonuses?: UserMysekaiFixtureGameCharacterPerformanceBonus[];
    userMysekaiGates?: UserMysekaiGate[];
    uploadTime?: number;
}

import { fetchOAuthGameData, fetchOAuthGameDataSuite, refreshOAuthToken, revokeOAuthToken, type OAuthBinding, type OAuthProfile, type OAuthTokenSet } from "./oauth";
import { getHarukiPublicApiBase } from "./haruki-public-api";

const HARUKI_PUBLIC_API_BASE = getHarukiPublicApiBase();
const ACCOUNTS_KEY = "moesekai_accounts";
const ACTIVE_KEY = "moesekai_active_account";
export const ACCOUNTS_CHANGED_EVENT = "moesekai:accounts-changed";

// Legacy keys
const LEGACY_ACCOUNT_KEY = "moesekai_account";
const LEGACY_USERID_KEY = "deck_recommend_userid";
const LEGACY_SERVER_KEY = "deck_recommend_server";

function makeAccountId(server: ServerType, gameId: string): string {
    return `${server}_${gameId}`;
}

/** Get the character avatar URL. */
export function getCharacterIconUrl(characterId: number): string {
    return `https://moe.exmeaning.com/assets/chr_ts_${characterId}.png`;
}

/** Get the character id with the highest rank. */
export function getTopCharacterId(characters: UserCharacter[]): number {
    if (!characters || characters.length === 0) return 21; // Default Miku
    return characters.reduce((top, c) => c.characterRank > top.characterRank ? c : top, characters[0]).characterId;
}

/** Get the current deck leader card id. */
export function getLeaderCardId(userGamedata: UserGamedata | null, userDecks: UserDeck[] | null): number | null {
    if (!userGamedata || !userDecks || userDecks.length === 0) return null;
    const currentDeck = userDecks.find(d => d.deckId === userGamedata.deck);
    return currentDeck ? currentDeck.leader : null;
}

const KNOWN_ACCOUNT_DATA_KEYS = [
    "userGamedata",
    "userProfile",
    "userDecks",
    "userCharacters",
    "userChallengeLiveSoloStages",
    "userChallengeLiveSoloResults",
    "userChallengeLiveSoloHighScoreRewards",
    "userBonds",
    "userMaterials",
    "userAreas",
    "userMysekaiFixtureGameCharacterPerformanceBonuses",
    "userMysekaiGates",
    "upload_time",
] as const;

const ACCOUNT_DATA_CONTAINER_KEYS = ["data", "result", "updatedData"] as const;
const ACCOUNT_DATA_ARRAY_KEYS = ["items", "updatedData", "records", "list"] as const;
const ACCOUNT_DATA_NOT_FOUND = Symbol("ACCOUNT_DATA_NOT_FOUND");

function toAccountDataRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function hasKnownAccountDataKey(data: Record<string, unknown>, keys: readonly string[]): boolean {
    if (keys.some((key) => Object.prototype.hasOwnProperty.call(data, key))) {
        return true;
    }
    return keys.includes("upload_time") && Object.prototype.hasOwnProperty.call(data, "uploadTime");
}

function extractAccountDataRecord(
    payload: unknown,
    keys: readonly string[] = KNOWN_ACCOUNT_DATA_KEYS,
    depth = 0,
): Record<string, unknown> | null {
    const direct = toAccountDataRecord(payload);
    if (!direct) return null;
    if (hasKnownAccountDataKey(direct, keys)) return direct;
    if (depth >= 3) return null;

    for (const containerKey of ACCOUNT_DATA_CONTAINER_KEYS) {
        const nested = extractAccountDataRecord(direct[containerKey], keys, depth + 1);
        if (nested) return nested;
    }

    return null;
}

function normalizeUploadTime(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}

function applyDefaultAccountDataKeys(data: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...data };

    if (!("upload_time" in normalized) && "uploadTime" in normalized) {
        normalized.upload_time = normalized.uploadTime;
    }

    keys.forEach((key) => {
        if (!(key in normalized)) {
            normalized[key] = getDefaultOAuthDataValue(key);
        }
    });

    return normalized;
}

function normalizeAccountDataPayload(payload: unknown, keys: readonly string[]): Record<string, unknown> {
    const record = extractAccountDataRecord(payload, keys);
    if (!record) {
        throw new Error("INVALID_ACCOUNT_DATA_PAYLOAD");
    }
    return applyDefaultAccountDataKeys(record, keys);
}

function extractAccountDataValue(key: string, payload: unknown, depth = 0): unknown | typeof ACCOUNT_DATA_NOT_FOUND {
    const direct = toAccountDataRecord(payload);
    if (!direct) {
        return ACCOUNT_DATA_NOT_FOUND;
    }

    if (Object.prototype.hasOwnProperty.call(direct, key)) {
        return direct[key];
    }
    if (key === "upload_time" && Object.prototype.hasOwnProperty.call(direct, "uploadTime")) {
        return direct.uploadTime;
    }

    if (depth < 3) {
        for (const containerKey of ACCOUNT_DATA_CONTAINER_KEYS) {
            const nested = extractAccountDataValue(key, direct[containerKey], depth + 1);
            if (nested !== ACCOUNT_DATA_NOT_FOUND) {
                return nested;
            }
        }
    }

    for (const arrayKey of ACCOUNT_DATA_ARRAY_KEYS) {
        const candidate = direct[arrayKey];
        if (Array.isArray(candidate)) {
            return candidate;
        }
    }

    return ACCOUNT_DATA_NOT_FOUND;
}

function normalizePerKeyAccountDataValue(key: string, payload: unknown): unknown {
    const extracted = extractAccountDataValue(key, payload);
    if (extracted !== ACCOUNT_DATA_NOT_FOUND) {
        return extracted;
    }
    return payload;
}

// ==================== Haruki API ====================

function normalizeHarukiApiResponse(data: unknown): HarukiApiResult {
    const normalizedData = extractAccountDataRecord(data, KNOWN_ACCOUNT_DATA_KEYS);

    if (!normalizedData) {
        return { success: false, error: "NOT_FOUND" };
    }

    const flatData = applyDefaultAccountDataKeys(normalizedData, KNOWN_ACCOUNT_DATA_KEYS);

    return {
        success: true,
        userProfile: flatData.userProfile && typeof flatData.userProfile === "object"
            ? flatData.userProfile as { word: string; userId: number }
            : undefined,
        userGamedata: flatData.userGamedata && typeof flatData.userGamedata === "object"
            ? flatData.userGamedata as UserGamedata
            : undefined,
        userDecks: Array.isArray(flatData.userDecks) ? flatData.userDecks as UserDeck[] : undefined,
        userCharacters: Array.isArray(flatData.userCharacters) ? flatData.userCharacters as UserCharacter[] : undefined,
        userChallengeLiveSoloStages: Array.isArray(flatData.userChallengeLiveSoloStages)
            ? flatData.userChallengeLiveSoloStages as UserChallengeLiveSoloStage[]
            : undefined,
        userChallengeLiveSoloResults: Array.isArray(flatData.userChallengeLiveSoloResults)
            ? flatData.userChallengeLiveSoloResults as UserChallengeLiveSoloResult[]
            : undefined,
        userChallengeLiveSoloHighScoreRewards: Array.isArray(flatData.userChallengeLiveSoloHighScoreRewards)
            ? flatData.userChallengeLiveSoloHighScoreRewards as UserChallengeLiveSoloHighScoreReward[]
            : undefined,
        userBonds: Array.isArray(flatData.userBonds) ? flatData.userBonds as UserBond[] : undefined,
        userMaterials: Array.isArray(flatData.userMaterials) ? flatData.userMaterials as UserMaterial[] : undefined,
        userAreas: Array.isArray(flatData.userAreas) ? flatData.userAreas as UserArea[] : undefined,
        userMysekaiFixtureGameCharacterPerformanceBonuses: Array.isArray(flatData.userMysekaiFixtureGameCharacterPerformanceBonuses)
            ? flatData.userMysekaiFixtureGameCharacterPerformanceBonuses as UserMysekaiFixtureGameCharacterPerformanceBonus[]
            : undefined,
        userMysekaiGates: Array.isArray(flatData.userMysekaiGates) ? flatData.userMysekaiGates as UserMysekaiGate[] : undefined,
        uploadTime: normalizeUploadTime(flatData.upload_time),
    };
}

/** Verify user data availability through the Haruki API. */
export async function verifyHarukiApi(server: ServerType, gameId: string): Promise<HarukiApiResult> {
    const url = `${HARUKI_PUBLIC_API_BASE}/${server}/suite/${gameId}?key=userGamedata,userDecks,userCharacters,userChallengeLiveSoloStages,userChallengeLiveSoloResults,userChallengeLiveSoloHighScoreRewards,userBonds,userMaterials,userAreas,userMysekaiFixtureGameCharacterPerformanceBonuses,userMysekaiGates,upload_time`;
    try {
        const res = await fetch(url);
        if (res.status === 404) {
            return { success: false, error: "NOT_FOUND" };
        }
        if (res.status === 403) {
            return { success: false, error: "API_NOT_PUBLIC" };
        }
        if (!res.ok) {
            return { success: false, error: "NETWORK_ERROR" };
        }
        const data = await res.json() as Record<string, unknown>;
        return normalizeHarukiApiResponse(data);
    } catch {
        return { success: false, error: "NETWORK_ERROR" };
    }
}

async function fetchPublicGameData(server: ServerType, gameId: string, keys: string[]): Promise<Record<string, unknown>> {
    const url = `${HARUKI_PUBLIC_API_BASE}/${server}/suite/${gameId}?key=${keys.join(",")}`;
    const res = await fetch(url);
    if (res.status === 404) {
        throw new Error("NOT_FOUND");
    }
    if (res.status === 403) {
        throw new Error("API_NOT_PUBLIC");
    }
    if (!res.ok) {
        throw new Error("NETWORK_ERROR");
    }
    return res.json() as Promise<Record<string, unknown>>;
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

export type AccountDataErrorCode = "API_NOT_PUBLIC" | "NOT_FOUND" | "OAUTH_REAUTH_REQUIRED" | "OAUTH_ACCESS_FAILED" | "NETWORK_ERROR";

function getAccountDataErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error || "");
}

function isOAuthBadRequestError(error: unknown): boolean {
    return getAccountDataErrorMessage(error).startsWith("AUTHORIZED_REQUEST_FAILED_400");
}

function shouldFallbackToOAuthPerKey(error: unknown): boolean {
    const message = getAccountDataErrorMessage(error);
    return isOAuthBadRequestError(error) || message === "INVALID_ACCOUNT_DATA_PAYLOAD";
}

function getDefaultOAuthDataValue(key: string): unknown {
    if (key === "userGamedata") return null;
    if (key === "upload_time" || key === "uploadTime") return null;
    return [];
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
                return [key, getDefaultOAuthDataValue(key)] as const;
            }
            throw error;
        }
    }));

    return Object.fromEntries(entries);
}

export function normalizeAccountDataError(error: unknown): AccountDataErrorCode {
    const message = getAccountDataErrorMessage(error);
    if (message === "API_NOT_PUBLIC") return "API_NOT_PUBLIC";
    if (message === "NOT_FOUND") return "NOT_FOUND";
    if (
        message === "OAUTH_REAUTH_REQUIRED"
        || message === "OAUTH_TOKEN_MISSING"
        || message.startsWith("AUTHORIZED_REQUEST_FAILED_401")
    ) {
        return "OAUTH_REAUTH_REQUIRED";
    }
    if (message.startsWith("AUTHORIZED_REQUEST_FAILED_403") || message.startsWith("AUTHORIZED_REQUEST_FAILED_404")) {
        return "OAUTH_ACCESS_FAILED";
    }
    return "NETWORK_ERROR";
}

export async function fetchAccountGameData(account: MoesekaiAccount, keys: string[]): Promise<Record<string, unknown>> {
    if (account.authSource === "oauth2") {
        try {
            const token = await getRefreshedOAuthToken(account);
            if (keys.length > 1) {
                try {
                    const suite = await fetchOAuthGameDataSuite(token.accessToken, account.server, account.gameId);
                    return normalizeAccountDataPayload(suite, keys);
                } catch (error) {
                    if (!shouldFallbackToOAuthPerKey(error)) {
                        throw error;
                    }
                    console.warn("[OAuth2] suite endpoint unavailable or payload invalid, falling back to per-key requests", { accountId: account.id, keys, error });
                    return fetchOAuthGameDataPerKey(token.accessToken, account.server, account.gameId, keys, account.id);
                }
            }

            return fetchOAuthGameDataPerKey(token.accessToken, account.server, account.gameId, keys, account.id);
        } catch (error) {
            const normalized = normalizeAccountDataError(error);

            if (normalized === "OAUTH_REAUTH_REQUIRED") {
                updateAccount(account.id, { authError: "reauth_required" });
            }

            if (account.isApiPublic) {
                return fetchPublicGameData(account.server, account.gameId, keys);
            }

            throw new Error(normalized);
        }
    }

    return fetchPublicGameData(account.server, account.gameId, keys);
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

// ==================== Multi-account CRUD ====================

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

function notifyAccountsChanged(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(ACCOUNTS_CHANGED_EVENT));
}

/** Save all accounts. */
function saveAccounts(accounts: MoesekaiAccount[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** Get the currently selected account. */
export function getActiveAccount(): MoesekaiAccount | null {
    const accounts = getAccounts();
    if (accounts.length === 0) return null;

    const activeId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
    if (activeId) {
        const found = accounts.find(a => a.id === activeId);
        if (found) return found;
    }
    // Fall back to the first account.
    return accounts[0];
}

export function findAccountByGameId(server: ServerType, gameId: string): MoesekaiAccount | null {
    const normalized = gameId.trim();
    if (!normalized) return null;
    return getAccounts().find((account) => account.server === server && account.gameId === normalized) || null;
}

export function getOAuthAccessTokenForGameUser(server: ServerType, gameId: string): string | undefined {
    const account = findAccountByGameId(server, gameId);
    if (!account || account.authSource !== "oauth2") return undefined;
    if (account.authError === "reauth_required") return undefined;
    return account.oauthToken?.accessToken || undefined;
}

/** Set the currently selected account. */
export function setActiveAccount(accountId: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(ACTIVE_KEY, accountId);
    // Sync legacy keys for backward compatibility.
    const accounts = getAccounts();
    const account = accounts.find(a => a.id === accountId);
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
    const account: MoesekaiAccount = {
        id: makeAccountId(server, gameId),
        gameId,
        server,
        nickname,
        avatarCharacterId,
        avatarCardId: null,
        isApiPublic,
        userCharacters,
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
        authSource: "public_api",
        oauthSubject: null,
        oauthScopes: [],
        oauthToken: null,
        oauthBindingId: null,
        lastSyncAt: null,
        authError: null,
        uploadTime: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
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

/** Remove an account. */
export function removeAccount(accountId: string): void {
    let accounts = getAccounts();
    accounts = accounts.filter(a => a.id !== accountId);
    saveAccounts(accounts);
    // If the active account was removed, switch to the first remaining account.
    const activeId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
    if (activeId === accountId) {
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

/** Clear all accounts. */
export function clearAllAccounts(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(ACCOUNTS_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(LEGACY_ACCOUNT_KEY);
    localStorage.removeItem(LEGACY_USERID_KEY);
    localStorage.removeItem(LEGACY_SERVER_KEY);
    notifyAccountsChanged();
}

/** Check whether any accounts exist. */
export function hasAccounts(): boolean {
    return getAccounts().length > 0;
}

// ==================== Backward compatibility ====================

/** Migrate from legacy data. */
function migrateFromLegacy(): MoesekaiAccount[] {
    if (typeof window === "undefined") return [];

    const accounts: MoesekaiAccount[] = [];

    try {
        // Try migrating from the legacy single-account key.
        const oldRaw = localStorage.getItem(LEGACY_ACCOUNT_KEY);
        if (oldRaw) {
            const old = JSON.parse(oldRaw);
            if (old.gameId) {
                const account: MoesekaiAccount = {
                    id: makeAccountId(old.server || "jp", old.gameId),
                    gameId: old.gameId,
                    server: old.server || "jp",
                    nickname: old.nickname || "",
                    avatarCharacterId: null,
                    avatarCardId: null,
                    isApiPublic: true,
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
                    authSource: "public_api",
                    oauthSubject: null,
                    oauthScopes: [],
                    oauthToken: null,
                    oauthBindingId: null,
                    lastSyncAt: null,
                    authError: null,
                    uploadTime: null,
                    createdAt: old.createdAt || Date.now(),
                    updatedAt: Date.now(),
                };
                accounts.push(account);
            }
        }

        // Try migrating from the legacy userid key.
        if (accounts.length === 0) {
            const legacyId = localStorage.getItem(LEGACY_USERID_KEY);
            const legacyServer = localStorage.getItem(LEGACY_SERVER_KEY);
            if (legacyId) {
                const server: ServerType = legacyServer && isValidServer(legacyServer) ? legacyServer : "jp";
                const account: MoesekaiAccount = {
                    id: makeAccountId(server, legacyId),
                    gameId: legacyId,
                    server,
                    nickname: "",
                    avatarCharacterId: null,
                    avatarCardId: null,
                    isApiPublic: true,
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
                    authSource: "public_api",
                    oauthSubject: null,
                    oauthScopes: [],
                    oauthToken: null,
                    oauthBindingId: null,
                    lastSyncAt: null,
                    authError: null,
                    uploadTime: null,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                accounts.push(account);
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

// ==================== Legacy interfaces for workers ====================

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
    const accounts = getAccounts();
    const id = makeAccountId(server, userId);
    const existing = accounts.find(a => a.id === id);
    if (!existing) {
        // Auto-create the account.
        createAccount(userId, server, "", null, null, true);
    }
    setActiveAccount(id);
}

// ==================== Avatar cache ====================

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

export async function refreshOAuthAccountData(accountId: string): Promise<HarukiApiResult> {
    const account = getAccounts().find((item) => item.id === accountId);
    if (!account || account.authSource !== "oauth2") {
        throw new Error("OAUTH_ACCOUNT_NOT_FOUND");
    }

    const data = await fetchAccountGameData(account, [
        "userGamedata",
        "userDecks",
        "userCharacters",
        "userChallengeLiveSoloStages",
        "userChallengeLiveSoloResults",
        "userChallengeLiveSoloHighScoreRewards",
        "userBonds",
        "userMaterials",
        "userAreas",
        "userMysekaiFixtureGameCharacterPerformanceBonuses",
        "userMysekaiGates",
        "upload_time",
    ]);
    const normalized = normalizeHarukiApiResponse(data);
    if (!normalized.success) {
        throw new Error(normalized.error || "NETWORK_ERROR");
    }

    const latestUserGamedata = normalized.userGamedata ?? account.userGamedata ?? null;
    const latestUserDecks = normalized.userDecks ?? account.userDecks ?? null;
    const latestUserCharacters = normalized.userCharacters ?? account.userCharacters ?? null;

    updateAccount(accountId, {
        nickname: normalized.userGamedata?.name || account.nickname,
        avatarCardId: getLeaderCardId(latestUserGamedata, latestUserDecks) ?? account.avatarCardId,
        avatarCharacterId: latestUserCharacters && latestUserCharacters.length > 0 ? getTopCharacterId(latestUserCharacters) : account.avatarCharacterId,
        userCharacters: latestUserCharacters,
        userGamedata: latestUserGamedata,
        userDecks: latestUserDecks,
        userChallengeLiveSoloStages: normalized.userChallengeLiveSoloStages ?? account.userChallengeLiveSoloStages ?? null,
        userChallengeLiveSoloResults: normalized.userChallengeLiveSoloResults ?? account.userChallengeLiveSoloResults ?? null,
        userChallengeLiveSoloHighScoreRewards: normalized.userChallengeLiveSoloHighScoreRewards ?? account.userChallengeLiveSoloHighScoreRewards ?? null,
        userBonds: normalized.userBonds ?? account.userBonds ?? null,
        userMaterials: normalized.userMaterials ?? account.userMaterials ?? null,
        userAreas: normalized.userAreas ?? account.userAreas ?? null,
        userMysekaiFixtureGameCharacterPerformanceBonuses: normalized.userMysekaiFixtureGameCharacterPerformanceBonuses ?? account.userMysekaiFixtureGameCharacterPerformanceBonuses ?? null,
        userMysekaiGates: normalized.userMysekaiGates ?? account.userMysekaiGates ?? null,
        uploadTime: normalized.uploadTime ?? account.uploadTime ?? null,
        lastSyncAt: Date.now(),
        authError: null,
    });

    return normalized;
}

export async function disconnectOAuthAccount(accountId: string): Promise<void> {
    const account = getAccounts().find((item) => item.id === accountId);
    if (!account?.oauthToken?.accessToken) {
        updateAccount(accountId, {
            authSource: "public_api",
            oauthSubject: null,
            oauthScopes: [],
            oauthToken: null,
            oauthBindingId: null,
            authError: null,
        });
        return;
    }

    try {
        await revokeOAuthToken(account.oauthToken.accessToken);
    } catch {
        // Ignore revoke failures and still allow local disconnect.
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

/** Raw MYSEKAI JSON for the isolated renderer. No cache or local data write.
 * Haruki source: public.go RegisterPublicRoutes at be8bf2d8b8ea09745dc8d465ecc71aab227bb563.
 * MYSEKAI and suite public permissions are independent. A denied OAuth read
 * must not fall back silently to a differently authorized dataset.
 */
export async function fetchAccountMysekaiText(server: "cn" | "jp", gameId: string, signal?: AbortSignal): Promise<string> {
    if (!/^[1-9]\d{0,19}$/.test(gameId)) throw new Error("INVALID_UID");
    const account = findAccountByGameId(server, gameId);
    let url = `${getHarukiPublicApiBase()}/${server}/mysekai/${gameId}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (account?.authSource === "oauth2") {
        const token = await getRefreshedOAuthToken(account);
        const { getOAuthConfig } = await import("./oauth");
        url = `${getOAuthConfig().baseUrl}/game-data/${server}/mysekai/${gameId}`;
        headers.Authorization = `Bearer ${token.accessToken}`;
    }
    const response = await fetch(url, { headers, signal, cache: "no-store", credentials: "omit", redirect: "error" });
    if (response.status === 401) throw new Error("OAUTH_REAUTH_REQUIRED");
    if (response.status === 403 || response.status === 404) throw new Error("MYSEKAI_NOT_ACCESSIBLE");
    if (!response.ok) throw new Error("NETWORK_ERROR");
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
