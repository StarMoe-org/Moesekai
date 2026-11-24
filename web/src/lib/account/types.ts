/**
 * The shapes of a game account kept in this browser and of the Haruki data read for it.
 */
import type { ServerType } from "../account-servers";

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
    /** Saved with the StarMoe account: verified by Haruki (via StarMoe Connect) or added by hand. Unset: this browser only. */
    starmoeSource?: "verified" | "manual" | null;
    /** How moesekai-api reads this account's data for the visitor. */
    starmoeReadVia?: "oauth" | "public" | null;
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
    rank?: number;                    // Player rank
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

/** Why reading an account's data failed, as the tool pages show it. */
export type AccountDataErrorCode = "API_NOT_PUBLIC" | "NOT_FOUND" | "OAUTH_REAUTH_REQUIRED" | "OAUTH_ACCESS_FAILED" | "NETWORK_ERROR";

/** Why refreshing an account failed (its old data stays). OAUTH: its legacy browser OAuth2 binding failed. */
export type AccountRefreshError = "OAUTH" | "API_NOT_PUBLIC" | "NOT_FOUND" | "NETWORK_ERROR";

/** How the deck workers (deck recommend, score control) read a game account's data. */
export interface DeckUserDataAccess {
    /** Through moesekai-api with the StarMoe session; the public API when it cannot answer. */
    viaStarMoe: boolean;
    /** The account's legacy browser OAuth2 token, current, when not signed in to StarMoe. */
    oauthAccessToken?: string;
}
