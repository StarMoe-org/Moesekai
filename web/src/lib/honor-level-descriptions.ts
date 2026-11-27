/**
 * Recover honor level descriptions that CN masterdata collapses.
 *
 * Some CN achievement honors repeat one sentence on every level: the difficulty-score titles
 * (3009-3014, 4700-4701) print their first step, "5 songs", on all 80 levels instead of stepping
 * 5 -> 790. The per-level wording does exist in the same region's honorMissions.json, so it is read
 * from there rather than by patching upstream data: the four CN feeds (moe / Haruki / kotori8823 /
 * local cache) are byte identical, so the collapse comes from the generator, not from any mirror.
 *
 * A repeated sentence is NOT by itself a defect. The acquisition-note titles ("obtained from event
 * X", "event cheer ranking reward") legitimately print one line on every level, because the level
 * shows in the art rather than in words (139 of the 165 CN repeats, measured). Only a title whose
 * ladder is a number progression (songs, rank, cheer points) is wrong when it repeats, and those are
 * exactly the ones the mission table can describe. The gate below therefore asks the mission table
 * first and only rewrites what it can explain:
 *
 * 1. The group's level counts add up to one mission type's row count (the achievement group with
 *    3+10+10+10 levels = 33 = `clear_live_difficulty_all`).
 * 2. Every honor in that group starts at a band whose `requirement` is a number its own level-1
 *    sentence already carries - a progress ladder, not an acquisition note (whose sentence holds no
 *    useful number, so it matches nothing and keeps the masterdata text).
 * 3. When several types share the ladder (the six unit cheer groups differ only by unit name), the
 *    one whose wording overlaps the honor's own sentence the most wins, and only a strict winner is
 *    accepted; a tie means "cannot tell" and nothing is rewritten.
 *
 * Measured against the CN masterdata (8291 honors, 1110 missions): 26 of the 165 repeats are
 * rewritten, every one a genuine defect, and the recovered text matches an exact join through
 * `honorMissions.rewards` -> resourceBoxDetails (`mission_reward` -> honor id + level) level for
 * level. JP keeps its single repeat and EN has none, so neither region is touched.
 *
 * Pure functions, zero runtime imports (types are type-only) so this stays unit-testable.
 */
import type { IHonorInfo, IHonorMission } from "@/types/honor";

/** True when an honor repeats a single non-empty sentence across two or more levels. */
export function hasCollapsedLevelDescriptions(honor: Pick<IHonorInfo, "levels">): boolean {
    if (honor.levels.length < 2) return false;
    const first = honor.levels[0]?.description ?? "";
    if (!first.trim()) return false;
    return honor.levels.every((level) => (level.description ?? "") === first);
}

/** The numbers a sentence carries, ignoring spaces: "5 songs ... 610 songs" -> [5, 610]. */
function numbersIn(value: string): number[] {
    return (value.replace(/\s+/g, "").match(/\d+/g) ?? []).map(Number);
}

/**
 * How many of `a`'s characters (spaces and digits ignored) `b` also uses, repeats counted — a cheap
 * stand-in for edit distance when telling apart two sentences that differ only by a unit name.
 */
function sharedWording(a: string, b: string): number {
    const available = new Map<string, number>();
    for (const char of b.replace(/[\s\d]/g, "")) available.set(char, (available.get(char) ?? 0) + 1);
    let shared = 0;
    for (const char of a.replace(/[\s\d]/g, "")) {
        const left = available.get(char) ?? 0;
        if (left === 0) continue;
        shared += 1;
        available.set(char, left - 1);
    }
    return shared;
}

/** The mission type that describes a whole honor group, or null when nothing fits or two fit equally. */
function pickMissionRows(
    ladder: IHonorInfo[],
    rowsByType: Map<string, IHonorMission[]>,
): IHonorMission[] | null {
    // Where each honor's first level sits in the group's mission ladder.
    const starts: number[] = [];
    let total = 0;
    for (const honor of ladder) {
        starts.push(total);
        total += honor.levels.length;
    }

    const candidates: { type: string; rows: IHonorMission[]; wording: number }[] = [];
    for (const [type, rows] of rowsByType) {
        if (rows.length !== total) continue;
        let fits = true;
        let wording = 0;
        for (let index = 0; index < ladder.length; index += 1) {
            const first = ladder[index].levels[0]?.description ?? "";
            const band = rows[starts[index]];
            // The band's threshold has to be a number the honor's own first level already states.
            if (!band || !numbersIn(first).includes(band.requirement)) {
                fits = false;
                break;
            }
            wording += sharedWording(first, band.sentence);
        }
        if (fits) candidates.push({ type, rows, wording });
    }
    if (!candidates.length) return null;

    // A group that declares its mission type points straight at the table (the six difficulty-score
    // honors 3009-3014).
    const declared = new Set(ladder.map((honor) => (honor.honorMissionType ?? "").trim()).filter(Boolean));
    if (declared.size === 1) {
        const match = candidates.find((candidate) => candidate.type === declared.values().next().value);
        if (match) return match.rows;
    }
    // Exactly one type lines up. The ladder checks above are the whole guard here; measured against
    // CN data no wrong type reaches this branch, because every band of every honor must carry its own
    // threshold number first. A family that fits by row count alone would be taken on trust, so add a
    // wording floor here before such a family appears.
    if (candidates.length === 1) return candidates[0].rows;

    // Several types share the ladder (the six cheer groups differ only by unit name): take the
    // closest wording, and bail out when two are equally close rather than guess.
    let best = candidates[0];
    for (const candidate of candidates) if (candidate.wording > best.wording) best = candidate;
    const tied = candidates.filter((candidate) => candidate.wording === best.wording).length;
    return tied === 1 ? best.rows : null;
}

/**
 * Map honor id → its level descriptions taken from honorMissions.json.
 * Honors that are already fine, repeat an acquisition note, have no mission counterpart, or cannot
 * be aligned uniquely are simply absent from the map, so callers keep rendering the masterdata text.
 */
export function resolveHonorLevelDescriptions(
    honors: IHonorInfo[],
    missions: IHonorMission[],
): Map<number, string[]> {
    const resolved = new Map<number, string[]>();
    if (!honors.length || !missions.length) return resolved;

    const groups = new Map<number, IHonorInfo[]>();
    for (const honor of honors) {
        const members = groups.get(honor.groupId);
        if (members) members.push(honor);
        else groups.set(honor.groupId, [honor]);
    }

    const rowsByType = new Map<string, IHonorMission[]>();
    for (const row of missions) {
        const rows = rowsByType.get(row.honorMissionType);
        if (rows) rows.push(row);
        else rowsByType.set(row.honorMissionType, [row]);
    }
    for (const rows of rowsByType.values()) rows.sort((a, b) => a.seq - b.seq);

    for (const members of groups.values()) {
        // Cheap gate: a group where every honor already reads differently never needs the table.
        if (!members.some(hasCollapsedLevelDescriptions)) continue;
        const ladder = [...members].sort((a, b) => a.id - b.id);
        const rows = pickMissionRows(ladder, rowsByType);
        if (!rows) continue;

        let offset = 0;
        for (const honor of ladder) {
            const count = honor.levels.length;
            if (hasCollapsedLevelDescriptions(honor)) {
                resolved.set(honor.id, rows.slice(offset, offset + count).map((row) => row.sentence));
            }
            offset += count;
        }
    }

    return resolved;
}
