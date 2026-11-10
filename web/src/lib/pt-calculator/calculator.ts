import { getBoostRate } from "../deck-comparator/calculator.ts";
import { PT_DIFFICULTIES, type PtDifficulty, type PtSong } from "./songs.ts";

export type LiveMode = "multi" | "solo";
export interface PtFormState {
    song: string;
    difficulty: PtDifficulty;
    mode: LiveMode;
    fires: number;
    power: string;
    bonus: string;
    /** Effective skill percentages, e.g. "248" for 248%. */
    skills: string[];
}

export function defaultPtForm(mode: LiveMode = "multi"): PtFormState {
    return {
        song: "74", difficulty: "expert", mode, fires: 10, power: "", bonus: "",
        skills: Array(6).fill(""),
    };
}

export function readPtForm(params: URLSearchParams): PtFormState {
    const state = defaultPtForm(params.get("mode") === "solo" ? "solo" : "multi");
    const song = params.get("song");
    if (song && /^[1-9]\d*$/.test(song)) state.song = song;
    const difficulty = params.get("difficulty");
    if (PT_DIFFICULTIES.some((item) => item === difficulty)) state.difficulty = difficulty as PtDifficulty;
    // The original three-song selector encoded a fixed chart for each song.
    if (!difficulty && song === "226") state.difficulty = "hard";
    const fires = Number(params.get("fires"));
    if (params.has("fires") && Number.isInteger(fires) && fires >= 0 && fires <= 10) state.fires = fires;
    state.power = params.get("power") ?? state.power;
    state.bonus = params.get("bonus") ?? state.bonus;
    const skills = params.get("effectiveSkills")?.split(",");
    if (skills?.length === 6) state.skills = skills;
    // Preserve links from the multiplier-based form without confusing their units.
    if (!params.has("effectiveSkills")) {
        const legacySkills = params.get("skills")?.split(",");
        if (legacySkills?.length === 6) {
            state.skills = legacySkills.map((value) => value.trim() && Number.isFinite(Number(value))
                ? String(Math.round((Number(value) - 1) * 100 * 1e6) / 1e6)
                : value);
        }
    }
    return normalizePtSkills(state);
}

export function normalizePtSkills(state: PtFormState): PtFormState {
    const skills = [...state.skills];
    if (state.mode === "solo") skills[5] = skills[0];
    return { ...state, skills };
}

export function writePtForm(params: URLSearchParams, state: PtFormState): void {
    params.delete("skills");
    params.delete("grouping");
    for (const [key, value] of Object.entries({
        song: state.song, difficulty: state.difficulty, mode: state.mode, fires: String(state.fires),
        power: state.power, bonus: state.bonus,
        effectiveSkills: state.skills.some((value) => value.trim()) ? state.skills.join(",") : "",
    })) {
        if (value) params.set(key, value);
        else params.delete(key);
    }
}

export function validatePtForm(state: PtFormState): "incomplete" | "invalidPower" | "invalidBonus" | "invalidSkills" | null {
    if ([state.power, state.bonus, ...state.skills].some((value) => !value.trim())) return "incomplete";
    const power = Number(state.power);
    const bonus = Number(state.bonus);
    if (!Number.isFinite(power) || !Number.isInteger(power) || power <= 0 || power > 1000000) return "invalidPower";
    if (!Number.isFinite(bonus) || bonus < 0 || bonus > 10000) return "invalidBonus";
    if (state.skills.length !== 6 || state.skills.some((value) => !Number.isFinite(Number(value)) || Number(value) < 10 || Number(value) > 288)) return "invalidSkills";
    return null;
}

export function eventPt(score: number, bonus: number, eventRate: number, fires: number, mode: LiveMode): number {
    const base = mode === "multi" ? 125 + Math.floor(score / 17500) : 100 + Math.floor(score / 20000);
    return Math.floor(base * (1 + bonus / 100) * (eventRate / 100)) * getBoostRate(fires);
}

/** Rearrangement inequality gives the worst/best of all 5! skill orders. S6 stays fixed. */
export function calculatePtRange(song: PtSong, state: PtFormState): { scoreMin: number; scoreMax: number; ptMin: number; ptMax: number } | null {
    const normalized = normalizePtSkills(state);
    if (validatePtForm(normalized)) return null;
    const power = Number(normalized.power);
    const skills = normalized.skills.map((value) => Number(value) / 100);
    const sorted = skills.slice(0, 5).sort((a, b) => a - b);
    const score = (weights: readonly number[], best: boolean) => {
        const orderedWeights = weights.slice(0, 5).sort((a, b) => a - b);
        const orderedSkills = best ? sorted : [...sorted].reverse();
        let rate = (state.mode === "multi" ? song.multi.base : song.solo.base) + weights[5] * skills[5];
        for (let index = 0; index < 5; index++) rate += orderedWeights[index] * orderedSkills[index];
        // Multi assumes five equal-power players and five active bonus triggers.
        return Math.floor(rate * power * 4 + (state.mode === "multi" ? 0.375 * power : 0));
    };
    const weights = state.mode === "multi" ? song.multi.skills : song.solo.skills;
    const scoreMin = score(weights, false);
    const scoreMax = score(weights, true);
    return {
        scoreMin, scoreMax,
        ptMin: eventPt(scoreMin, Number(state.bonus), song.eventRate, state.fires, state.mode),
        ptMax: eventPt(scoreMax, Number(state.bonus), song.eventRate, state.fires, state.mode),
    };
}
