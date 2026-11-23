// Honor types based on sekai.best IHonorInfo / IHonorGroup

export interface IHonorLevel {
    honorId: number;
    level: number;
    bonus: number;
    description: string;
    honorRarity?: string;
    assetbundleName?: string;
}

export interface IHonorInfo {
    id: number;
    seq: number;
    groupId: number;
    honorRarity?: string;
    name: string;
    assetbundleName?: string;
    levels: IHonorLevel[];
    honorMissionType?: string;
    honorType?: string;
}

export interface IHonorGroup {
    id: number;
    name: string;
    honorType: string;
    backgroundAssetbundleName?: string;
    frameName?: string;
}

/**
 * A word a character honor can show (honorWords.json): seq 1 is the "fan" word the honor always
 * had, seq 2 the "oshi" word. Each one unlocks at a character rank, which its description states.
 */
export interface IHonorWord {
    id: number;
    seq: number;
    honorGroupId: number;
    assetbundleName: string;
    name: string;
    description: string;
}

/** A background style a character honor can use (honorBackgrounds.json), unlocked the same way. */
export interface IHonorBackground {
    id: number;
    seq: number;
    honorGroupId: number;
    assetbundleName: string;
    name: string;
    description: string;
}

// ==================== Bonds Honor Types ====================

export interface IBondsHonor {
    id: number;
    seq: number;
    bondsGroupId: number;
    gameCharacterUnitId1: number;
    gameCharacterUnitId2: number;
    honorRarity: string;
    name: string;
    levels: IBondsHonorLevel[];
}

export interface IBondsHonorLevel {
    id: number;
    bondsHonorId: number;
    level: number;
    description: string;
}

export interface IBondsHonorWord {
    id: number;
    seq: number;
    bondsGroupId: number;
    assetbundleName: string;
    name: string;
    description: string;
}

export interface IBond {
    id: number;
    groupId: number;
    characterId1: number;
    characterId2: number;
}

export interface IGameCharaUnit {
    id: number;
    gameCharacterId: number;
    unit: string;
    colorCode: string;
    skinColorCode: string;
    skinShadowColorCode: string;
}

// Honor rarity display names
export const HONOR_RARITY_NAMES: Record<string, string> = {
    low: "Normal",
    middle: "Wing",
    high: "Flower",
    highest: "Star",
};

// Honor type display names
export const HONOR_TYPE_NAMES: Record<string, string> = {
    achievement: "Achievement",
    event: "Event",
    event_point: "Event Points",
    rank_match: "Rank Match",
    character_rank: "Character",
    bonds: "Bonds",
    birthday: "Birthday",
    license: "License",
    unit_rank: "Unit Rank",
    world_bloom: "World Bloom",
    main_story: "Main Story",
    challenge_live: "Challenge Live",
    virtual_live: "Virtual Live",
};
