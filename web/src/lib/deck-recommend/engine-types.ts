/**
 * 组卡引擎 worker 与页面之间共享的类型。
 */
import type { DeckSearchCompletion } from "../deck-engine/wasm-loader";

export type DeckRecommendMode = "event" | "challenge" | "custom" | "strongest" | "weakest" | "mysekai";

/** 页面可选的 live 类型；challenge 由挑战模式发出，worker 再拆成
 *  challenge / challenge_auto。 */
export type DeckLiveType = "multi" | "solo" | "auto" | "cheerful" | "challenge";

export type DeckTarget = "score" | "power" | "bonus";

export type DeckSkillOrder = "average" | "max" | "min" | "specific";

export type DeckSkillReference = "average" | "max" | "min";

/** 单稀有度养成开关（满级含特训后形态）。 */
export interface DeckTrainingConfig {
    disable: boolean;
    levelMax: boolean;
    episodeRead: boolean;
    masterMax: boolean;
    skillMax: boolean;
}

/** 养成配置：稀有度 key（rarity_1..rarity_birthday）→ 开关。 */
export type DeckCardConfig = Record<string, DeckTrainingConfig>;

/** 单卡养成覆盖：对指定卡牌单独覆盖等级/技能/突破/剧情/画布。 */
export interface DeckSingleCardOverride {
    cardId: number;
    /** 指定等级；缺省沿用通用配置。 */
    level?: number;
    skillLevel?: number;
    masterRank?: number;
    /** 已读剧情数（0/1/2）。 */
    episodeReadCount?: number;
    /** 是否启用画布加成。 */
    canvas?: boolean;
}

/** 区域道具单项覆盖（等级）。 */
export interface DeckAreaItemOverride {
    areaItemId: number;
    level: number;
}

/** 角色等级单项覆盖。 */
export interface DeckCharacterRankOverride {
    characterId: number;
    rank: number;
}

/** 烤森门单项覆盖（等级）。 */
export interface DeckMysekaiGateOverride {
    mysekaiGateId: number;
    level: number;
}

/** 烤森玩偶加成单项覆盖（角色 → 综合力加成值）。 */
export interface DeckMysekaiFixtureOverride {
    characterId: number;
    totalBonusRate: number;
}

/**
 * 进阶数据覆盖：统一值 + 单项覆盖（单项优先）。
 * 全部留空时按账号真实数据计算；统一值对所有项生效并 clamp 到各自上限。
 */
export interface DeckUserDataOverrides {
    /** 区域道具统一等级（1..上限；0/空不覆盖）。 */
    areaItemLevel?: number | null;
    areaItemLevelOverrides?: DeckAreaItemOverride[];
    /** 角色等级统一值（1..上限；0/空不覆盖）。 */
    characterRank?: number | null;
    characterRankOverrides?: DeckCharacterRankOverride[];
    /** 烤森门统一等级（1..上限；0/空不覆盖）。 */
    mysekaiGateLevel?: number | null;
    mysekaiGateLevelOverrides?: DeckMysekaiGateOverride[];
    /** 玩偶加成统一值（数值；0/空不覆盖）。 */
    mysekaiFixtureBonusRate?: number | null;
    mysekaiFixtureBonusRateOverrides?: DeckMysekaiFixtureOverride[];
}

/** 模拟活动：不依赖已发布活动的自定义活动条件。 */
export interface DeckSimulatedEvent {
    /** marathon / cheerful_carnival / world_bloom。 */
    eventType: string;
    attr?: string;
    /** 活动加成团（团活模拟；连接世界 1/2 轮必需）。 */
    unit?: string;
    /** 混活模拟：直接指定加成角色集合，优先于 unit 展开的整团。 */
    characterIds?: number[];
    /** 混活模拟：VS 角色对应的支援团约束（characterId → unit）。 */
    characterUnits?: Record<number, string>;
    /** 连接世界章节轮次（1/2/3；3 为 WL3 分组章节）。 */
    worldBloomTurn?: number;
    /** 显式终章模拟轮次；与分组章节模拟分开。 */
    worldBloomFinaleTurn?: 2 | 3;
    /** 连接世界第 3 轮的章节角色。 */
    worldBloomCharacterId?: number;
}

export interface DeckWorkerInput {
    mode: DeckRecommendMode;
    userId: string;
    server: string;
    oauthAccessToken?: string;
    /** 活动 ID（模拟活动开启时忽略）。 */
    eventId?: number;
    /** EventSelector 识别出的活动类型（marathon/cheerful_carnival/world_bloom…）。 */
    eventType?: string;
    /** 模拟活动条件（活动模式可用，开启后覆盖真实活动）。 */
    simulatedEvent?: DeckSimulatedEvent;
    liveType: DeckLiveType;
    /** 连接世界 / WL3 的章节角色。 */
    supportCharacterId?: number;
    /** 挑战组卡的目标角色。 */
    challengeCharacterId?: number;
    /** 乐曲 ID；烤森 / 最弱组卡不需要乐曲，可缺省。 */
    musicId?: number;
    /** 难度；同上，无乐曲时可缺省。 */
    difficulty?: string;
    cardConfig: DeckCardConfig;
    /** 组卡目标（活动/烤森模式）。 */
    target?: DeckTarget;
    /** target=bonus 时精确命中的加成档位列表（整数百分点，最多 32 个）。 */
    bonusTargets?: number[];
    /** 自定义加成：加成团（按团体模式）。 */
    customUnit?: string;
    /** 自定义加成：加成角色（按角色模式，最多 5 个）。 */
    customCharacterIds?: number[];
    /** 自定义加成：VS 角色对应的支援团约束（characterId → unit）。 */
    customCharacterUnits?: Record<number, string>;
    /** 自定义加成：加成属性。 */
    customAttr?: string;
    /** 最强组卡优化目标。 */
    strongestTarget?: "power" | "skill";
    /** 协力参数：队友综合力；缺省按当前卡组近似。 */
    multiTeammatePower?: number;
    /** 协力参数：队友实效（百分点）。 */
    multiTeammateScoreUp?: number;
    /** 协力参数：协力总实效下限（百分点）。 */
    multiScoreUpLowerBound?: number;
    /** 技能顺序策略。 */
    skillOrder?: DeckSkillOrder;
    /** 特定技能顺序（1-based 的 5 位数字串，1 表示队长位）。 */
    specificSkillOrder?: string;
    /** BFes 技能吸取方式。 */
    skillReference?: DeckSkillReference;
    /** 保留卡牌特训前后的双技能状态。 */
    keepAfterTrainingState?: boolean;
    /** 是否让最高技能作队长（默认 true）。 */
    bestSkillAsLeader?: boolean;
    /** 反向搜索：综合力目标下求最弱卡组。 */
    minimize?: boolean;
    /** 连接世界支援卡按满破计算。 */
    supportMasterMax?: boolean;
    /** 连接世界支援卡按满技能计算。 */
    supportSkillMax?: boolean;
    /** 过滤其他团体成员。 */
    filterOtherUnit?: boolean;
    /** 体力消耗（0-10），影响 Pt 换算。 */
    boost?: number;
    /** 协力对手分数（分数目标参考）。 */
    otherScore?: number;
    /** 团体过滤。 */
    unitFilter?: string;
    /** 属性过滤。 */
    attrFilter?: string;
    /** 角色过滤：卡池只保留这些角色的卡（Haruki 的 characterFilters）。 */
    characterFilterIds?: number[];
    /** 指定队长角色（引擎 forced_leader_character_id）。 */
    leaderCharacterId?: number;
    /** 固定卡牌（最多 5 张，同角色仅 1 张）。 */
    fixedCards?: number[];
    /** 固定角色（最多 5 个）。 */
    fixedCharacters?: number[];
    /** 排除卡牌。 */
    excludedCards?: number[];
    /** 单卡养成覆盖。 */
    singleCardOverrides?: DeckSingleCardOverride[];
    /** 进阶数据覆盖（区域道具/角色等级/烤森门/玩偶加成）。 */
    userDataOverrides?: DeckUserDataOverrides;
    /** 返回卡组条数（1-30，默认 10）。 */
    limit?: number;
    /** 搜索超时毫秒（默认 120000，上限 300000）。 */
    timeoutMs?: number;
}

export interface DeckResultCard {
    cardId: number;
    characterId: number;
    /** 卡图 asset key（thumbnail/chara/{bundle}_{status}）。 */
    assetKey: string;
    rarity: string;
    attr: string;
    level: number;
    masterRank: number;
    skillLevel: number;
    /** 卡牌战力（含养成/剧情/画布加成）。 */
    power: number;
    /** 技能分数上升（百分比数值，如 150 = +150%）。 */
    skillScoreUp: number;
    /** 该卡的固定加成（百分比数值），无加成为 0。 */
    eventBonus: number;
    episode1Read: boolean;
    episode2Read: boolean;
    hasCanvasBonus: boolean;
    canvasPower: number;
}

export interface DeckResultDeck {
    rank: number;
    /** 搜索目标值：活动点数 / 战力 / 技能期望 / 加成档位。 */
    score: number;
    /** 活动点数（仅活动类目标时存在）。 */
    eventPoint?: number;
    liveScore: number;
    totalPower: number;
    /** 综合活动加成（百分点，含支援卡）。 */
    eventBonus?: number;
    /** 实效值（百分点：队长 + 其余/4）。 */
    effectiveSkill: number;
    cards: DeckResultCard[];
}

/** 单曲收益面板的一行：该卡组在某曲目/难度上的单局得分与 PT。 */
export interface DeckMusicRow {
    musicId: number;
    difficulty: string;
    liveScore: number;
    eventPoint?: number;
}

export interface DeckUserCard {
    cardId: number;
    masterRank?: number;
    level?: number;
}

export type DeckWorkerOutput =
    | {
          type: "progress";
          stage: string;
          percent: number;
          progressKey?: string;
          stageLabel?: string;
      }
    | {
          type: "result";
          result?: DeckResultDeck[];
          userCards?: DeckUserCard[];
          duration?: number;
          completion?: DeckSearchCompletion;
          upload_time?: number;
          error?: string;
      };
