/**
 * The player's song clear status, tallied from `userMusicResults`.
 *
 * Two places print this tally: the profile's clear-status table (per difficulty, how many songs are
 * cleared / full-comboed / all-perfected) and the count an FC/AP honor carries (the eight
 * difficulty-score honors 3009-3014 and 4700-4701 print how many songs of one difficulty the account
 * FC'd or AP'd). Both read from here, so the honor number is the same number the table shows.
 *
 * Haruki serves neither `userHonorMissions` nor `userMusicDifficultyClearCount` (both 404), so this
 * counts the account's own `userMusicResults` instead of reading a summary field. That read is
 * already collapsed to the best result per song and difficulty (`parseUserMusicResults`), so one
 * entry is counted per chart and a chart played many times is still counted once.
 */
import type { MusicDifficultyType } from "@/types/music";
import type { PlayResult, UserMusicResultsMap } from "./user-music-results";

/** Easy → append, the order the game lists difficulties in. */
export const CLEAR_STATUS_DIFFICULTIES: readonly MusicDifficultyType[] = [
    "easy",
    "normal",
    "hard",
    "expert",
    "master",
    "append",
];

/** The three rows of the clear-status table; each row is stricter than the one above it. */
export const CLEAR_STATUS_LEVELS = ["clear", "fullCombo", "allPerfect"] as const;
export type ClearStatusLevel = (typeof CLEAR_STATUS_LEVELS)[number];

/** A song counts towards a row when its best result is one of these. */
const LEVEL_ACCEPTS: Record<ClearStatusLevel, readonly PlayResult[]> = {
    clear: ["C", "FC", "AP"],
    fullCombo: ["FC", "AP"],
    allPerfect: ["AP"],
};

export type ClearStatusTable = Record<MusicDifficultyType, Record<ClearStatusLevel, number>>;

function emptyTable(): ClearStatusTable {
    const table = {} as ClearStatusTable;
    for (const difficulty of CLEAR_STATUS_DIFFICULTIES) {
        table[difficulty] = { clear: 0, fullCombo: 0, allPerfect: 0 };
    }
    return table;
}

/** One count per difficulty and row: how many songs are cleared, full-comboed and all-perfected. */
export function countClearStatus(results: UserMusicResultsMap | null | undefined): ClearStatusTable {
    const table = emptyTable();
    if (!results) return table;

    results.forEach((entry) => {
        if (!entry) return;
        for (const difficulty of CLEAR_STATUS_DIFFICULTIES) {
            const result = entry[difficulty];
            if (!result) continue;
            for (const level of CLEAR_STATUS_LEVELS) {
                if (LEVEL_ACCEPTS[level].includes(result)) table[difficulty][level] += 1;
            }
        }
    });
    return table;
}

/** The number an FC/AP honor prints, and which row of the clear-status table supplies it. */
export interface HonorMissionCount {
    readonly difficulty: MusicDifficultyType;
    /** An FC honor prints the FC+AP count, an AP honor the AP-only count. */
    readonly level: Exclude<ClearStatusLevel, "clear">;
}

// `honorMissions.json` / `honors.json` spell all-perfect missions `*_full_perfect`, not `*_all_perfect`.
const HONOR_MISSION_PATTERN = /^(easy|normal|hard|expert|master|append)_(full_combo|full_perfect)$/;

/**
 * Reads what an honor prints out of its own masterdata `honorMissionType` (`master_full_perfect`).
 * Only the eight difficulty-score honors carry one; every other honor returns null and is drawn
 * without a number (its level is drawn as stars or birthday flowers instead).
 */
export function resolveHonorMissionCount(honorMissionType?: string | null): HonorMissionCount | null {
    const normalized = typeof honorMissionType === "string" ? honorMissionType.trim().toLowerCase() : "";
    const match = HONOR_MISSION_PATTERN.exec(normalized);
    if (!match) return null;
    return {
        difficulty: match[1] as MusicDifficultyType,
        level: match[2] === "full_perfect" ? "allPerfect" : "fullCombo",
    };
}

/** The number an honor prints, read from an already-counted table. */
export function honorMissionCountFromTable(
    table: ClearStatusTable | null | undefined,
    honorMissionType?: string | null,
): number | null {
    const mission = resolveHonorMissionCount(honorMissionType);
    if (!mission || !table) return null;
    return table[mission.difficulty][mission.level];
}

/** The same read for callers that hold the raw results; returns null when there is no tally yet. */
export function honorMissionCountFor(
    results: UserMusicResultsMap | null | undefined,
    honorMissionType?: string | null,
): number | null {
    if (!results || !resolveHonorMissionCount(honorMissionType)) return null;
    return honorMissionCountFromTable(countClearStatus(results), honorMissionType);
}
