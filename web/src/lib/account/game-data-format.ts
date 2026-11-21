/**
 * Turns Haruki's game data answers (public API, moesekai-api, or the legacy OAuth2 API, which nest and name things
 * differently) into one flat shape, and errors into the codes the pages show. Pure functions, no I/O.
 */
import type {
    AccountDataErrorCode,
    HarukiApiResult,
    UserArea,
    UserBond,
    UserChallengeLiveSoloHighScoreReward,
    UserChallengeLiveSoloResult,
    UserChallengeLiveSoloStage,
    UserCharacter,
    UserDeck,
    UserGamedata,
    UserMaterial,
    UserMysekaiFixtureGameCharacterPerformanceBonus,
    UserMysekaiGate,
} from "./types";

export const KNOWN_ACCOUNT_DATA_KEYS = [
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
            normalized[key] = getDefaultDataValue(key);
        }
    });

    return normalized;
}

export function normalizeAccountDataPayload(payload: unknown, keys: readonly string[]): Record<string, unknown> {
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

export function normalizePerKeyAccountDataValue(key: string, payload: unknown): unknown {
    const extracted = extractAccountDataValue(key, payload);
    if (extracted !== ACCOUNT_DATA_NOT_FOUND) {
        return extracted;
    }
    return payload;
}

export function normalizeHarukiApiResponse(data: unknown): HarukiApiResult {
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

/** Everything the profile page shows: read when an account is added or refreshed. */
export const VERIFY_KEYS = [
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
];

/** The value a key the answer left out stands for. */
export function getDefaultDataValue(key: string): unknown {
    if (key === "userGamedata") return null;
    if (key === "upload_time" || key === "uploadTime") return null;
    return [];
}

export function getAccountDataErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error || "");
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
