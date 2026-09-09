// Card Types for Moesekai
// Based on sekai.best and Haruki master data structure

// Unit internal field → official name mapping (source: unitProfiles.json).
// Kept as source/masterdata-style names; UI should prefer UNIT_*_LABEL_KEYS + i18n.
export const UNIT_NAME_MAP: Record<string, string> = {
    light_sound: "Leo/need",
    idol: "MORE MORE JUMP！",
    street: "Vivid BAD SQUAD",
    theme_park: "Wonderlands×Showtime",
    school_refusal: "25点，Nightcord见。",
    piapro: "虚拟歌手",
};

export const UNIT_FIELD_LABEL_KEYS: Record<string, string> = {
    light_sound: "common.units.ln",
    idol: "common.units.mmj",
    street: "common.units.vbs",
    theme_park: "common.units.ws",
    school_refusal: "common.units.25ji",
    piapro: "common.units.vs",
};

export const UNIT_ID_LABEL_KEYS: Record<string, string> = {
    ln: "common.units.ln",
    mmj: "common.units.mmj",
    vbs: "common.units.vbs",
    ws: "common.units.ws",
    "25ji": "common.units.25ji",
    vs: "common.units.vs",
};

export type CardRarityType =
    | "rarity_1"
    | "rarity_2"
    | "rarity_3"
    | "rarity_4"
    | "rarity_birthday";

export type CardAttribute =
    | "cool"
    | "cute"
    | "happy"
    | "mysterious"
    | "pure";

export type SupportUnit =
    | "none"
    | "light_sound"
    | "idol"
    | "school_refusal"
    | "theme_park"
    | "street";

// Support Unit label keys (for virtual singers)
export const SUPPORT_UNIT_LABEL_KEYS: Record<SupportUnit, string> = {
    "none": "common.supportUnits.none",
    "light_sound": "common.units.ln",
    "idol": "common.units.mmj",
    "school_refusal": "common.units.25ji",
    "theme_park": "common.units.ws",
    "street": "common.units.vbs",
};

// Support Unit to Unit ID mapping (for icons)
export const SUPPORT_UNIT_TO_UNIT_ID: Record<SupportUnit, string | null> = {
    "none": null,
    "light_sound": "ln",
    "idol": "mmj",
    "school_refusal": "25ji",
    "theme_park": "ws",
    "street": "vbs",
};

export interface ICardInfo {
    id: number;
    seq: number;
    characterId: number;
    cardRarityType: CardRarityType;
    specialTrainingPower1BonusFixed: number;
    specialTrainingPower2BonusFixed: number;
    specialTrainingPower3BonusFixed: number;
    initialSpecialTrainingStatus?: "not_doing" | "done";
    attr: CardAttribute;
    supportUnit: SupportUnit;
    skillId: number;
    cardSkillName: string;
    specialTrainingSkillId?: number;  // Skill ID after blooming/special training  
    specialTrainingSkillName?: string; // Skill name after blooming/special training
    prefix: string;
    assetbundleName: string;
    gachaPhrase: string;
    archiveDisplayType: string;
    archivePublishedAt: number;
    cardParameters: {
        param1: number[];
        param2: number[];
        param3: number[];
    };
    specialTrainingCosts: unknown[];
    masterLessonAchieveResources: unknown[];
    releaseAt: number;
    cardSupplyId: number;
    cardSupplyType: string;
}

export interface CardPowerItem {
    performance: number;
    technique: number;
    stamina: number;
    total: number;
}

export interface CardPowerMeta {
    normal?: CardPowerItem;
    trained?: CardPowerItem;
}

export interface CardEventMeta {
    id: number;
    name: string;
    asset: string;
}

export interface CardMeta {
    prefix: string;
    characterId: number;
    rarity: string;
    attr: string;
    asset: string;
    releaseAt?: number;
    skillName?: string;
    skillDesc?: string;
    power?: CardPowerMeta;
    event?: CardEventMeta;
    isJpFallback?: boolean;
}

// Character data
export interface IGameChara {
    id: number;
    firstName: string;
    givenName: string;
    firstNameRuby?: string;
    givenNameRuby?: string;
    gender: string;
    height: number;
    live2dHeightAdjustment: number;
    figure: string;
    breastSize: string;
    modelName: string;
    unit: string;
    supportUnitType: string;
}

// Character profile data from characterProfiles.json
export interface ICharaProfile {
    characterId: number;
    height: string;
    school: string;
    schoolYear: string;
    birthday: string;
    introduction: string;
    hobby?: string;
    specialSkill?: string;
    favoriteFood?: string;
    hatedFood?: string;
    weak?: string;
    scenarioId?: string;
}

// Character unit information from gameCharacterUnits.json
export interface ICharaUnitInfo {
    id: number;
    gameCharacterId: number;
    unit: string;
    colorCode: string;
    skinColorCode: string;
    skinShadowColorCode1: string;
    skinShadowColorCode2: string;
}

// Unit profile data from unitProfiles.json
export interface IUnitProfile {
    unit: string;
    unitName: string;
    seq: number;
    profileSentence: string;
    colorCode: string;
}

// Skill data structure
export interface ISkillEffectDetail {
    level: number;
    activateEffectDuration: number;
    activateEffectValue: number;
}

export interface ISkillEffect {
    id: number;
    skillEffectType: string;
    activateNotesJudgmentType?: string;
    skillEffectDetails: ISkillEffectDetail[];
    skillEnhance?: {
        activateEffectValue: number;
        skillEnhanceType?: string;
        skillEnhanceCondition?: {
            unit?: string;
        };
    };
    activateCharacterRank?: number;
    activateUnitCount?: number;
}

export interface ISkillInfo {
    id: number;
    skillId: number;
    shortDescription?: string;
    description: string;
    descriptionSpriteName: string;
    skillFilterId: number;
    skillEffects: ISkillEffect[];
}


// Unit data structure
export interface UnitData {
    id: string;
    name: string;
    color: string;
    charIds: number[];
}

// Unit icon file mapping (unit id → icon filename)
export const UNIT_ICON_FILES: Record<string, string> = {
    ln: "ln.webp", mmj: "mmj.webp", vbs: "vbs.webp",
    ws: "wxs.webp", "25ji": "n25.webp", vs: "vs.webp",
};

// Unit field (from master data) → unit id mapping
export const UNIT_FIELD_TO_ID: Record<string, string> = {
    light_sound: "ln",
    idol: "mmj",
    street: "vbs",
    theme_park: "ws",
    school_refusal: "25ji",
    piapro: "vs",
};

// Unit definitions
export const UNIT_DATA: UnitData[] = [
    { id: "ln", name: UNIT_NAME_MAP.light_sound, color: "#4455DD", charIds: [1, 2, 3, 4] },
    { id: "mmj", name: UNIT_NAME_MAP.idol, color: "#88DD44", charIds: [5, 6, 7, 8] },
    { id: "vbs", name: UNIT_NAME_MAP.street, color: "#EE1166", charIds: [9, 10, 11, 12] },
    { id: "ws", name: UNIT_NAME_MAP.theme_park, color: "#FF9900", charIds: [13, 14, 15, 16] },
    { id: "25ji", name: UNIT_NAME_MAP.school_refusal, color: "#884499", charIds: [17, 18, 19, 20] },
    { id: "vs", name: UNIT_NAME_MAP.piapro, color: "#33CCBB", charIds: [21, 22, 23, 24, 25, 26] },
];

export const UNIT_DATA_LABEL_KEYS: Record<string, string> = Object.fromEntries(
    UNIT_DATA.map((unit) => [unit.id, UNIT_ID_LABEL_KEYS[unit.id] ?? `common.units.${unit.id}`]),
);

// Character name mapping (Chinese, from gameCharacters.json: firstName + givenName).
// Kept as source/masterdata-style fallback; UI should prefer getCharacterName(t, id).
export const CHARACTER_NAMES: Record<number, string> = {
    1: "星乃一歌",
    2: "天马咲希",
    3: "望月穗波",
    4: "日野森志步",
    5: "花里实乃理",
    6: "桐谷遥",
    7: "桃井爱莉",
    8: "日野森雫",
    9: "小豆泽心羽",
    10: "白石杏",
    11: "东云彰人",
    12: "青柳冬弥",
    13: "天马司",
    14: "凤笑梦",
    15: "草薙宁宁",
    16: "神代类",
    17: "宵崎奏",
    18: "朝比奈真冬",
    19: "东云绘名",
    20: "晓山瑞希",
    21: "初音未来",
    22: "镜音铃",
    23: "镜音连",
    24: "巡音流歌",
    25: "MEIKO",
    26: "KAITO",
};

// Rarity star count mapping
export const RARITY_TO_STARS: Record<CardRarityType, number> = {
    rarity_1: 1,
    rarity_2: 2,
    rarity_3: 3,
    rarity_4: 4,
    rarity_birthday: 4,
};

// Max levels by rarity (normal untrained, and trained if trainable)
export const CARD_RARITY_MAX_LEVELS: Record<CardRarityType, { normal: number; trained?: number }> = {
    rarity_1: { normal: 20 },
    rarity_2: { normal: 30 },
    rarity_3: { normal: 40, trained: 50 },
    rarity_4: { normal: 50, trained: 60 },
    rarity_birthday: { normal: 60 },
};

// Rarity display config with colors
export const RARITY_DISPLAY: Record<number, { label: string; color: string }> = {
    1: { label: "1★", color: "#888888" },
    2: { label: "2★", color: "#88BB44" },
    3: { label: "3★", color: "#4488DD" },
    4: { label: "4★", color: "#FFAA00" },
    5: { label: "🎂", color: "#FF6699" },
};

// Check if card can be trained (special training)
// A card is trainable iff at least one of the three training power bonus
// fields is non-zero (i.e. it has both normal / after_training card art).
export function isTrainableCard(card: Pick<ICardInfo, "specialTrainingPower1BonusFixed" | "specialTrainingPower2BonusFixed" | "specialTrainingPower3BonusFixed">): boolean {
    return card.specialTrainingPower1BonusFixed !== 0 ||
        card.specialTrainingPower2BonusFixed !== 0 ||
        card.specialTrainingPower3BonusFixed !== 0;
}

// Check if a card's default (or only) card art is the after_training one.
// Cards with `initialSpecialTrainingStatus === "done"` (e.g. ids 1167, 1458-1463)
// ship with no normal art, so their thumbnail must always use after_training.
export function getCardDefaultTrainedStatus(card: Pick<ICardInfo, "initialSpecialTrainingStatus">): boolean {
    return card.initialSpecialTrainingStatus === "done";
}

// Get rarity number from type
export function getRarityNumber(rarityType: CardRarityType): number {
    if (rarityType === "rarity_birthday") return 5;
    return parseInt(rarityType.replace("rarity_", ""));
}

// Attribute display names
export const ATTR_NAMES: Record<CardAttribute, string> = {
    cool: "Cool",
    cute: "Cute",
    happy: "Happy",
    mysterious: "Mysterious",
    pure: "Pure",
};

// Attribute colors for UI
export const ATTR_COLORS: Record<CardAttribute, string> = {
    cool: "#4455dd",
    cute: "#ff6699",
    happy: "#ffaa00",
    mysterious: "#bb88ff",
    pure: "#44dd88",
};

// Attribute icon file paths (Case sensitive for Linux/Production)
export const ATTR_ICON_PATHS: Record<CardAttribute, string> = {
    cool: "Cool.webp",
    cute: "cute.webp",
    happy: "Happy.webp",
    mysterious: "Mysterious.webp",
    pure: "Pure.webp",
};

// Character short names (Chinese).
// Kept as source/masterdata-style fallback; UI should prefer getCharacterName(t, id, "short").
export const CHAR_NAMES: Record<number, string> = {
    1: "一歌", 2: "咲希", 3: "穗波", 4: "志步",
    5: "实乃理", 6: "遥", 7: "爱莉", 8: "雫",
    9: "心羽", 10: "杏", 11: "彰人", 12: "冬弥",
    13: "司", 14: "笑梦", 15: "宁宁", 16: "类",
    17: "奏", 18: "真冬", 19: "绘名", 20: "瑞希",
    21: "Miku", 22: "Rin", 23: "Len", 24: "Luka", 25: "MEIKO", 26: "KAITO"
};

// Character theme colors for UI customization
export const CHAR_COLORS: Record<string, string> = {
    "1": "#33aaee", "2": "#ffdd44", "3": "#ee6666", "4": "#BBDD22",
    "5": "#FFCCAA", "6": "#99CCFF", "7": "#ffaacc", "8": "#99EEDD",
    "9": "#ff6699", "10": "#00BBDD", "11": "#ff7722", "12": "#0077DD",
    "13": "#FFBB00", "14": "#FF66BB", "15": "#33DD99", "16": "#BB88EE",
    "17": "#bb6688", "18": "#8888CC", "19": "#CCAA88", "20": "#DDAACC",
    "21": "#33ccbb", "22": "#ffcc11", "23": "#FFEE11", "24": "#FFBBCC",
    "25": "#DD4444", "26": "#3366CC"
};

// ==================== Gacha Types ====================

export interface IGachaInformation {
    gachaId: number;
    summary?: string;
    description?: string;
    bubbleAssetbundleName?: string;
    bubbleText?: string;
}

export interface IGachaInfo {
    id: number;
    gachaType: string;
    name: string;
    seq: number;
    assetbundleName: string;
    gachaCeilItemId?: number;
    startAt: number;
    endAt: number;
    gachaBehaviors: IGachaBehavior[];
    gachaCardRarityRates: IGachaCardRarityRate[];
    gachaDetails: IGachaDetail[];
    gachaPickups: IGachaPickup[];
    wishSelectCount?: number;
    wishFixedSelectCount?: number;
    wishLimitedSelectCount?: number;
    gachaCeilExchangeId?: number;
    gachaBonusId?: number;
    gachaInformation?: IGachaInformation;
}

export interface IGachaPickup {
    id: number;
    gachaId: number;
    cardId: number;
    gachaPickupType?: string;
}

export interface IGachaBehavior {
    id: number;
    gachaId: number;
    gachaBehaviorType: string;
    costResourceType: string;
    costResourceQuantity: number;
    spinCount: number;
    spinLimit?: number;
}

export interface IGachaCardRarityRate {
    id: number;
    gachaId: number;
    cardRarityType: CardRarityType;
    lotteryType?: string;
    rate: number;
}

export interface IGachaDetail {
    id: number;
    gachaId: number;
    cardId: number;
    weight: number;
    isWish?: boolean;
    gachaDetailWishType?: "fixed" | "normal" | "limited";
}

// Gacha type label keys
export const GACHA_TYPE_LABEL_KEYS: Record<string, string> = {
    ceil: "common.gachaTypes.ceil",
    normal: "common.gachaTypes.normal",
    limited: "common.gachaTypes.limited",
    birthday: "common.gachaTypes.birthday",
    colorful_festival: "common.gachaTypes.colorful_festival",
};

// Gacha category filter types
export type GachaCategoryType = "all" | "wish_pick" | "normal_pickup";

export const GACHA_CATEGORY_LABEL_KEYS: Record<GachaCategoryType, string> = {
    all: "common.gachaCategories.all",
    wish_pick: "common.gachaCategories.wish_pick",
    normal_pickup: "common.gachaCategories.normal_pickup",
};

// Helper function to check if a gacha is a wish/pick pool
export function isWishGacha(gacha: IGachaInfo): boolean {
    if (!gacha) return false;
    if (gacha.wishFixedSelectCount && gacha.wishFixedSelectCount > 0) return true;
    if (gacha.gachaCardRarityRates?.some(rate => rate.lotteryType === "categorized_wish")) return true;
    return gacha.gachaDetails?.some(detail => detail.isWish || detail.gachaDetailWishType === "fixed") ?? false;
}
