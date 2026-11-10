import type { IMusicMeta } from "../../types/music.ts";

export const PT_DIFFICULTIES = ["easy", "normal", "hard", "expert", "master", "append"] as const;
export type PtDifficulty = typeof PT_DIFFICULTIES[number];

export interface PtMusicMeta extends Pick<IMusicMeta, "music_id" | "difficulty" | "base_score" | "fever_score" | "event_rate"> {
    skill_score_multi?: readonly number[];
    skill_score_solo?: readonly number[];
}

export interface PtSong {
    id: string;
    name: string;
    difficulty: string;
    eventRate: number;
    multi: { base: number; skills: readonly number[] };
    solo: { base: number; skills: readonly number[] };
}

export function getPtSong(meta: PtMusicMeta, mode: "multi" | "solo"): PtSong | null {
    const weights = mode === "multi" ? meta.skill_score_multi : meta.skill_score_solo;
    if (!weights || weights.length !== 6 || weights.some((value) => !Number.isFinite(value) || value < 0)) return null;
    if (!Number.isFinite(meta.base_score) || meta.base_score <= 0) return null;
    if (mode === "multi" && (!Number.isFinite(meta.fever_score) || meta.fever_score < 0)) return null;
    const eventRate = meta.event_rate ?? 100;
    if (!Number.isFinite(eventRate) || eventRate <= 0) return null;
    return {
        id: String(meta.music_id),
        name: String(meta.music_id),
        difficulty: meta.difficulty,
        eventRate,
        multi: {
            base: meta.base_score + (meta.fever_score ?? 0) * 0.5,
            skills: meta.skill_score_multi ?? [],
        },
        solo: { base: meta.base_score, skills: meta.skill_score_solo ?? [] },
    };
}
