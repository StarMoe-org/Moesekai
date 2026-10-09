/**
 * Parses a player's clear results out of the account game-data payload.
 * Shared by the music-progress page and the profile's clear summary.
 */

export interface RawUserMusicResult {
    musicId?: number | string;
    musicDifficultyType?: string;
    musicDifficulty?: string;
    playResult?: string;
    fullPerfectFlg?: boolean;
    fullComboFlg?: boolean;
}

interface RawUserMusicDifficultyStatus extends RawUserMusicResult {
    userMusicResults?: RawUserMusicResult[];
}

interface RawUserMusic {
    musicId?: number | string;
    userMusicDifficultyStatuses?: RawUserMusicDifficultyStatus[];
    userMusicResults?: RawUserMusicResult[];
}

export type PlayResult = "AP" | "FC" | "C" | "";

export const PLAY_RESULT_PRIORITY: Record<PlayResult, number> = {
    "": 0,
    C: 1,
    FC: 2,
    AP: 3,
};

/** Best result per music, keyed by lower-case difficulty. */
export type UserMusicResultsMap = Map<number, Record<string, PlayResult>>;

function parseMusicId(value: number | string | undefined, fallback?: number): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
    return null;
}

function normalizeDifficulty(value: string | undefined | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    return normalized || null;
}

function normalizePlayResult(result: Pick<RawUserMusicResult, "playResult" | "fullPerfectFlg" | "fullComboFlg">): PlayResult {
    if (result.fullPerfectFlg) return "AP";

    const playResult = result.playResult?.toLowerCase();
    if (playResult === "full_perfect" || playResult === "all_perfect" || playResult === "ap") {
        return "AP";
    }

    if (result.fullComboFlg) return "FC";
    if (playResult === "full_combo" || playResult === "fc") {
        return "FC";
    }

    if (playResult === "clear" || playResult === "c") {
        return "C";
    }

    return "";
}

function upsertMusicResult(
    resultsMap: UserMusicResultsMap,
    musicId: number,
    difficulty: string,
    rank: PlayResult
): void {
    if (!rank) return;

    if (!resultsMap.has(musicId)) {
        resultsMap.set(musicId, {});
    }

    const entry = resultsMap.get(musicId)!;
    const current = entry[difficulty] || "";
    if (PLAY_RESULT_PRIORITY[rank] > PLAY_RESULT_PRIORITY[current]) {
        entry[difficulty] = rank;
    }
}

function addRawResultsToMap(
    resultsMap: UserMusicResultsMap,
    rawResults: RawUserMusicResult[],
    fallbackMusicId?: number,
    fallbackDifficulty?: string
): void {
    for (const rawResult of rawResults) {
        const musicId = parseMusicId(rawResult.musicId, fallbackMusicId);
        const difficulty = normalizeDifficulty(
            rawResult.musicDifficultyType || rawResult.musicDifficulty || fallbackDifficulty
        );
        const rank = normalizePlayResult(rawResult);

        if (musicId === null || !difficulty || !rank) continue;
        upsertMusicResult(resultsMap, musicId, difficulty, rank);
    }
}

export function parseTopLevelMusicResults(data: unknown): UserMusicResultsMap {
    const resultsMap: UserMusicResultsMap = new Map();

    if (Array.isArray(data)) {
        addRawResultsToMap(resultsMap, data as RawUserMusicResult[]);
        return resultsMap;
    }

    if (!data || typeof data !== "object") {
        return resultsMap;
    }

    const topLevelResults = (data as { userMusicResults?: unknown }).userMusicResults;
    if (Array.isArray(topLevelResults)) {
        addRawResultsToMap(resultsMap, topLevelResults as RawUserMusicResult[]);
    }

    return resultsMap;
}

export function parseLegacyMusicResults(data: unknown): UserMusicResultsMap {
    const resultsMap: UserMusicResultsMap = new Map();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return resultsMap;
    }

    const userMusics = (data as { userMusics?: unknown }).userMusics;
    if (!Array.isArray(userMusics)) {
        return resultsMap;
    }

    for (const music of userMusics as RawUserMusic[]) {
        const musicId = parseMusicId(music.musicId);
        if (musicId === null) continue;

        if (Array.isArray(music.userMusicResults)) {
            addRawResultsToMap(resultsMap, music.userMusicResults, musicId);
        }

        const diffStatuses = Array.isArray(music.userMusicDifficultyStatuses)
            ? music.userMusicDifficultyStatuses
            : [];

        for (const diffStatus of diffStatuses) {
            const statusDifficulty = normalizeDifficulty(
                diffStatus.musicDifficultyType || diffStatus.musicDifficulty
            );

            // Some legacy payloads store clear/fc/ap directly on difficulty status.
            addRawResultsToMap(
                resultsMap,
                [diffStatus],
                musicId,
                statusDifficulty || undefined
            );

            const nestedResults = Array.isArray(diffStatus.userMusicResults)
                ? diffStatus.userMusicResults
                : [];
            addRawResultsToMap(
                resultsMap,
                nestedResults,
                musicId,
                statusDifficulty || undefined
            );
        }
    }

    return resultsMap;
}

export function mergeFallbackMusicResults(
    primaryResultsMap: UserMusicResultsMap,
    fallbackResultsMap: UserMusicResultsMap
): UserMusicResultsMap {
    fallbackResultsMap.forEach((fallbackEntry, musicId) => {
        const primaryEntry = primaryResultsMap.get(musicId);
        if (!primaryEntry) {
            primaryResultsMap.set(musicId, { ...fallbackEntry });
            return;
        }

        Object.entries(fallbackEntry).forEach(([difficulty, rank]) => {
            if (!primaryEntry[difficulty]) {
                primaryEntry[difficulty] = rank;
            }
        });
    });

    return primaryResultsMap;
}

/** Top-level userMusicResults is the source of truth; the legacy userMusics nesting fills gaps. */
export function parseUserMusicResults(data: unknown): UserMusicResultsMap {
    return mergeFallbackMusicResults(parseTopLevelMusicResults(data), parseLegacyMusicResults(data));
}
