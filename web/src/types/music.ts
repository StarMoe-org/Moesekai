// Music Types for Moesekai
import type { CSSProperties } from "react";
// Based on sekai.best and sekaimaster data structure

export type MusicCategoryType = "mv" | "mv_2d" | "original" | "image";

export type MusicTagType =
    | "all"
    | "vocaloid"
    | "theme_park"
    | "street"
    | "idol"
    | "school_refusal"
    | "light_music_club"
    | "other";

export interface IlimitedTimeMusicsInfo {
    id: number;
    musicId: number;
    startAt: number;
    endAt: number;
}

export interface IMusicInfo {
    id: number;
    seq: number;
    releaseConditionId: number;
    categories?: MusicCategoryType[];
    title: string;
    pronunciation: string;
    creatorArtistId: number;
    lyricist: string;
    composer: string;
    arranger: string;
    dancerCount: number;
    selfDancerPosition: number;
    assetbundleName: string;
    liveTalkBackgroundAssetbundleName: string;
    publishedAt: number;
    releasedAt: number;
    liveStageId: number;
    fillerSec: number;
    isNewlyWrittenMusic: boolean;
    isFullLength: boolean;
}

export interface IMusicCategoryInfo {
    id: number;
    musicId: number;
    musicCategoryName: MusicCategoryType;
}

export type RawMusicCategory = MusicCategoryType | { musicCategoryName: MusicCategoryType };

export function buildMusicCategoriesMap(
    categoriesData?: readonly IMusicCategoryInfo[] | ReadonlyMap<number, MusicCategoryType[]> | null
): ReadonlyMap<number, MusicCategoryType[]> {
    if (categoriesData && "has" in categoriesData && typeof categoriesData.has === "function") {
        return categoriesData as ReadonlyMap<number, MusicCategoryType[]>;
    }
    const map = new Map<number, MusicCategoryType[]>();
    if (!categoriesData || !Array.isArray(categoriesData)) return map;
    for (const item of categoriesData) {
        if (!item || !item.musicId || !item.musicCategoryName) continue;
        const list = map.get(item.musicId);
        if (list) {
            list.push(item.musicCategoryName);
        } else {
            map.set(item.musicId, [item.musicCategoryName]);
        }
    }
    return map;
}

export function normalizeMusicItem(
    music: IMusicInfo,
    categoriesMap?: ReadonlyMap<number, MusicCategoryType[]>
): IMusicInfo {
    let categories: MusicCategoryType[] = [];
    if (Array.isArray(music.categories) && music.categories.length > 0) {
        categories = (music.categories as unknown as RawMusicCategory[]).map((cat) =>
            typeof cat === "object" && cat !== null && "musicCategoryName" in cat
                ? cat.musicCategoryName
                : (cat as MusicCategoryType)
        );
    } else if (categoriesMap && categoriesMap.has(music.id)) {
        categories = categoriesMap.get(music.id) ?? [];
    }
    return {
        ...music,
        categories,
    };
}

export function normalizeMusicsData(
    musics: readonly IMusicInfo[],
    categoriesData?: readonly IMusicCategoryInfo[] | ReadonlyMap<number, MusicCategoryType[]> | null
): IMusicInfo[] {
    const map = buildMusicCategoriesMap(categoriesData);
    return musics.map((m) => normalizeMusicItem(m, map));
}

export interface IMusicTagInfo {
    id: number;
    musicId: number;
    musicTag: MusicTagType;
    seq: number;
}

export interface IMusicVocalInfo {
    id: number;
    musicId: number;
    musicVocalType: string;
    seq: number;
    releaseConditionId: number;
    caption: string;
    characters: IMusicVocalCharacter[];
    assetbundleName: string;
    archiveDisplayType: string;
    archivePublishedAt: number;
}

export interface IMusicVocalCharacter {
    id: number;
    musicVocalId: number;
    characterType: "game_character" | "outside_character";
    characterId: number;
    seq: number;
}

export interface IOutsideCharacter {
    id: number;
    seq: number;
    name: string;
}

export const MUSIC_TAG_IDS = [
    "all",
    "vocaloid",
    "light_music_club",
    "idol",
    "street",
    "theme_park",
    "school_refusal",
    "other",
] as const satisfies readonly MusicTagType[];

export const MUSIC_TAG_LABEL_KEYS: Record<MusicTagType, string> = {
    all: "common.musicTags.all",
    vocaloid: "common.musicTags.vocaloid",
    light_music_club: "common.musicTags.light_music_club",
    idol: "common.musicTags.idol",
    street: "common.musicTags.street",
    theme_park: "common.musicTags.theme_park",
    school_refusal: "common.musicTags.school_refusal",
    other: "common.musicTags.other",
};

export const MUSIC_CATEGORY_IDS = ["mv", "mv_2d", "original", "image"] as const satisfies readonly MusicCategoryType[];
export const MUSIC_CATEGORY_LABEL_KEYS: Record<MusicCategoryType, string> = {
    mv: "common.musicCategories.mv",
    mv_2d: "common.musicCategories.mv_2d",
    original: "common.musicCategories.original",
    image: "common.musicCategories.image",
};

// Music category colors
export const MUSIC_CATEGORY_COLORS: Record<MusicCategoryType, string> = {
    mv: "#4488DD",
    mv_2d: "#44BB88",
    original: "#FF9900",
    image: "#888888",
};

// Music difficulty type
export type MusicDifficultyType = "easy" | "normal" | "hard" | "expert" | "master" | "append";

export interface IMusicDifficultyInfo {
    id: number;
    musicId: number;
    musicDifficulty: MusicDifficultyType;
    playLevel: number;
    totalNoteCount: number;
}

// Difficulty display names
export const DIFFICULTY_NAMES: Record<MusicDifficultyType, string> = {
    easy: "EASY",
    normal: "NORMAL",
    hard: "HARD",
    expert: "EXPERT",
    master: "MASTER",
    append: "APPEND",
};

// Difficulty colors
export const DIFFICULTY_COLORS: Record<MusicDifficultyType, string> = {
    easy: "#5AC06E",
    normal: "#56A4D4",
    hard: "#EFAF28",
    expert: "#E84D53",
    master: "#BB58B8",
    append: "#EE92BC",
};

/**
 * Fill for a selected or labelled difficulty: the game's own color, fixed
 * across themes, with near-black text, which every one of them is light enough to carry.
 */
export function difficultyFillStyle(difficulty: string): CSSProperties | undefined {
    const color = DIFFICULTY_COLORS[difficulty as MusicDifficultyType];
    return color ? { backgroundColor: color, borderColor: "transparent", color: "#17181a" } : undefined;
}

// Music Meta interface for external API data
export interface IMusicMeta {
    music_id: number;
    difficulty: string;
    music_time: number;
    event_rate: number;
    base_score: number;
    fever_score: number;
    cycles_auto: number;
    cycles_multi: number;
    pspi_auto_score: number;
    pspi_solo_score: number;
    pspi_multi_score: number;
    pspi_auto_pt_max: number;
    pspi_solo_pt_max: number;
    pspi_multi_pt_max: number;
    pspi_pt_per_hour_auto: number;
    pspi_pt_per_hour_multi: number;
}

// Ranking info for display in music items
export interface IRankingInfo {
    rank: number;
    total: number;
}

// Re-export asset URL functions from centralized assets.ts
export { getChartSvgUrl, getMusicJacketUrl, getMusicVocalAudioUrl } from "@/lib/assets";


