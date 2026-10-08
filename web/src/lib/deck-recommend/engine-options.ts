/**
 * 页面参数 → 引擎 options 的纯映射。
 *
 * 单独成模块是为了可测：这一层丢字段不会报错，只会静默退化成另一种搜索
 * （模拟活动退回真实活动、指定队长被忽略），必须由测试直接盯住。
 * 运行时零依赖（只有 import type），Node 可直接导入。
 */
import type { DeckWorkerInput } from "./engine-types";
import { isWorldBloomFinale, type WorldBloomChapterRow } from "./world-bloom-finale.ts";

/** 活动主表里本映射需要的最小字段。 */
export interface EngineOptionsEventRow {
    id: number;
    eventType?: string;
}

export type EngineOptionsWorldBloomRow = WorldBloomChapterRow;

export interface EngineOptionsContext {
    /** 活动主表：用于把混战活动的 multi 换算成 cheerful。 */
    eventRows: readonly EngineOptionsEventRow[];
    worldBloomRows: readonly EngineOptionsWorldBloomRow[];
    /** EventSelector 里 WL3 模拟分组占用的假活动 ID。 */
    wl3SimulationEventIds: readonly number[];
}

const RARITY_CONFIG_KEYS: Record<string, string> = {
    rarity_1: "rarity1Config",
    rarity_2: "rarity2Config",
    rarity_3: "rarity3Config",
    rarity_4: "rarity4Config",
    rarity_birthday: "rarityBirthdayConfig",
};

/** 特定技能顺序：UI 用 1-based 数字串（1=队长位），引擎消费 0-based。 */
function toEngineSkillOrder(text: string): string | undefined {
    const digits = text.replace(/\D/g, "").split("");
    if (digits.length !== 5) return undefined;
    return digits.map((d) => String(Number(d) - 1)).join(",");
}

/** 组装引擎 options；活动类型相关的 live_type 转换在此完成。 */
export function buildEngineOptions(
    input: DeckWorkerInput,
    { eventRows, worldBloomRows, wl3SimulationEventIds }: EngineOptionsContext,
): Record<string, unknown> {
    const {
        mode, eventId, eventType, simulatedEvent, liveType, supportCharacterId,
        challengeCharacterId, musicId, difficulty, cardConfig, target, bonusTargets,
        customUnit, customCharacterIds, customCharacterUnits, customAttr, strongestTarget,
        multiTeammatePower, multiTeammateScoreUp, multiScoreUpLowerBound,
        skillOrder, specificSkillOrder, skillReference, keepAfterTrainingState,
        bestSkillAsLeader, minimize, boost, otherScore, unitFilter, attrFilter,
        supportMasterMax, supportSkillMax, filterOtherUnit,
        fixedCards, fixedCharacters, excludedCards, singleCardOverrides,
        leaderCharacterId, limit, timeoutMs,
    } = input;

    let computedLiveType: string = liveType;
    const usesRealEvent = Boolean(eventId) && !simulatedEvent;
    if (usesRealEvent && (mode === "event" || mode === "mysekai")) {
        const event0 = eventRows.find((it) => it.id === eventId);
        if (event0?.eventType === "cheerful_carnival" && computedLiveType === "multi") {
            computedLiveType = "cheerful";
        }
    }
    // 模拟混战活动同样要走 cheerful 结算，否则分数按普通协力算。
    if (mode === "event" && simulatedEvent?.eventType === "cheerful_carnival" && computedLiveType === "multi") {
        computedLiveType = "cheerful";
    }
    if (mode === "challenge") {
        computedLiveType = liveType === "auto" ? "challenge_auto" : "challenge";
    }

    const options: Record<string, unknown> = {
        live_type: computedLiveType,
        limit: limit ?? 10,
        timeout_ms: timeoutMs ?? 120_000,
    };
    if (mode !== "weakest") {
        options.music_id = musicId;
        options.music_diff = difficulty;
    }

    if (mode === "weakest") {
        // 最弱组卡：无活动、无乐曲、不应用任何养成覆盖，直接按账号真实数据求最低综合力。
        options.target = "power";
        options.minimize = true;
        options.live_type = "solo";
        return options;
    }

    for (const [rarityKey, configKey] of Object.entries(RARITY_CONFIG_KEYS)) {
        const config = cardConfig[rarityKey];
        if (!config) continue;
        options[configKey] = {
            disable: config.disable,
            levelMax: config.levelMax,
            episodeRead: config.episodeRead,
            masterMax: config.masterMax,
            skillMax: config.skillMax,
        };
    }

    if (multiTeammatePower) options.multiLiveTeammatePower = multiTeammatePower;
    if (multiTeammateScoreUp) options.multiLiveTeammateScoreUp = multiTeammateScoreUp;
    if (multiScoreUpLowerBound) options.multiLiveScoreUpLowerBound = multiScoreUpLowerBound;
    if (skillOrder) options.liveSkillOrder = skillOrder;
    const engineOrder = specificSkillOrder ? toEngineSkillOrder(specificSkillOrder) : undefined;
    if (skillOrder === "specific" && engineOrder) options.specificSkillOrder = engineOrder;
    if (skillReference) options.skillReferenceChooseStrategy = skillReference;
    if (keepAfterTrainingState) options.keepAfterTrainingState = true;
    if (bestSkillAsLeader === false) options.bestSkillAsLeader = false;
    if (minimize) options.minimize = true;
    if (supportMasterMax) options.supportMasterMax = true;
    if (supportSkillMax) options.supportSkillMax = true;
    if (filterOtherUnit) options.filterOtherUnit = true;
    if (boost !== undefined) options.boost = boost;
    if (otherScore) options.otherScore = otherScore;
    if (unitFilter) options.unitFilter = unitFilter;
    if (attrFilter) options.attrFilter = attrFilter;
    if (leaderCharacterId) options.forced_leader_character_id = leaderCharacterId;
    if (fixedCards?.length) options.fixedCards = fixedCards;
    if (fixedCharacters?.length) options.fixedCharacters = fixedCharacters;
    // Preserve the vendored finale behavior: pins mean "on stage" and the leader
    // is selected separately. Other modes retain the engine's existing slot contract.
    const isFinale = (mode === "event" || mode === "mysekai") && (
        simulatedEvent
            ? simulatedEvent.worldBloomFinaleTurn !== undefined
            : isWorldBloomFinale(eventId, worldBloomRows)
    );
    if (isFinale && (fixedCards?.length || fixedCharacters?.length)) options.fixedConstraintMode = "members";
    if (excludedCards?.length) options.excludedCards = excludedCards;
    if (singleCardOverrides?.length) {
        options.singleCardConfigs = singleCardOverrides.map((entry) => ({
            cardId: entry.cardId,
            config: {
                level: entry.level,
                skillLevel: entry.skillLevel,
                masterRank: entry.masterRank,
                episodeReadCount: entry.episodeReadCount,
                canvas: entry.canvas ?? false,
            },
        }));
    }

    if (mode === "event" && simulatedEvent) {
        // 模拟活动：不带 event_id，由引擎按条件合成活动行。
        options.event_type = simulatedEvent.eventType;
        if (simulatedEvent.attr) options.event_attr = simulatedEvent.attr;
        if (simulatedEvent.unit) options.event_unit = simulatedEvent.unit;
        // 混活：直接给加成角色集合；引擎优先用它，不再按 event_unit 展开整团。
        if (simulatedEvent.characterIds?.length) {
            options.custom_bonus_character_ids = simulatedEvent.characterIds;
            if (simulatedEvent.characterUnits && Object.keys(simulatedEvent.characterUnits).length > 0) {
                options.custom_bonus_character_support_units = Object.fromEntries(
                    Object.entries(simulatedEvent.characterUnits).map(([id, unit]) => [String(id), unit]),
                );
            }
        }
        if (simulatedEvent.worldBloomFinaleTurn !== undefined) {
            options.world_bloom_finale_turn = simulatedEvent.worldBloomFinaleTurn;
        } else if (simulatedEvent.worldBloomTurn) {
            options.world_bloom_event_turn = simulatedEvent.worldBloomTurn;
            if (simulatedEvent.worldBloomTurn === 3 && simulatedEvent.worldBloomCharacterId) {
                options.world_bloom_character_id = simulatedEvent.worldBloomCharacterId;
            }
        }
        const searchTarget = target ?? "score";
        options.target = searchTarget;
        if (searchTarget === "bonus" && bonusTargets?.length) {
            options.target_bonus_list = bonusTargets;
        }
        return options;
    }

    if (mode === "event") {
        // EventSelector 的 WL3 模拟活动（3200001..3200005）转成引擎模拟参数。
        if (eventId !== undefined && wl3SimulationEventIds.includes(eventId)) {
            if (!supportCharacterId) throw new Error("wl3 mode requires supportCharacterId");
            options.world_bloom_event_turn = 3;
            options.world_bloom_character_id = supportCharacterId;
            options.target = target ?? "score";
            if ((target ?? "score") === "bonus" && bonusTargets?.length) {
                options.target_bonus_list = bonusTargets;
            }
            return options;
        }
        if (!eventId) throw new Error("event mode requires eventId");
        options.event_id = eventId;
        if (eventType === "world_bloom" && supportCharacterId && !isFinale) {
            options.world_bloom_character_id = supportCharacterId;
        }
        const searchTarget = target ?? "score";
        options.target = searchTarget;
        if (searchTarget === "bonus" && bonusTargets?.length) {
            options.target_bonus_list = bonusTargets;
        }
        return options;
    }

    if (mode === "challenge") {
        if (!challengeCharacterId) throw new Error("challenge mode requires challengeCharacterId");
        options.challenge_live_character_id = challengeCharacterId;
        return options;
    }

    if (mode === "custom") {
        if (customUnit) options.event_unit = customUnit;
        if (customCharacterIds?.length) options.custom_bonus_character_ids = customCharacterIds;
        if (customCharacterUnits && Object.keys(customCharacterUnits).length > 0) {
            options.custom_bonus_character_support_units = Object.fromEntries(
                Object.entries(customCharacterUnits).map(([id, unit]) => [String(id), unit]),
            );
        }
        if (customAttr) options.custom_bonus_attr = customAttr;
        return options;
    }

    if (mode === "strongest") {
        options.target = strongestTarget ?? "power";
        return options;
    }


    // mysekai
    if (!eventId) throw new Error("mysekai mode requires eventId");
    options.event_id = eventId;
    options.target = "mysekai";
    return options;
}
