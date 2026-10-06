
import { ICardInfo, ISkillInfo, CHARACTER_NAMES } from "@/types/types";

export type CardSkillType =
    | "score_up"
    | "perfect_score_up"
    | "life_score_up"
    | "score_up_keep"
    | "score_up_unit_count"
    | "different_unit_score_up"
    | "score_up_character_rank"
    | "other_member_score_up_reference_rate"
    | "judgment_up"
    | "life_recovery";

export function getCardSkillTypes(skill?: Pick<ISkillInfo, "descriptionSpriteName" | "skillFilterId" | "skillEffects"> | null): CardSkillType[] {
    if (!skill) return [];

    const types = new Set<CardSkillType>();
    const effects = skill.skillEffects ?? [];
    const firstEffect = effects[0];

    if (
        skill.skillFilterId === 3 ||
        effects.some(effect => effect.skillEffectType === "judgment_up")
    ) {
        types.add("judgment_up");
        return [...types];
    }

    if (
        skill.skillFilterId === 4 ||
        effects.some(effect => effect.skillEffectType === "life_recovery")
    ) {
        types.add("life_recovery");
        return [...types];
    }

    if (firstEffect?.activateNotesJudgmentType === "perfect") {
        types.add("perfect_score_up");
    }

    if (firstEffect?.skillEffectType === "score_up_condition_life") {
        types.add("life_score_up");
    }

    if (effects.some(effect => effect.skillEffectType === "score_up_keep")) {
        types.add("score_up_keep");
    }

    if (effects.some(effect => effect.skillEnhance?.skillEnhanceType === "sub_unit_score_up")) {
        types.add("score_up_unit_count");
    }

    if (effects.some(effect => effect.skillEffectType === "score_up_unit_count")) {
        types.add("different_unit_score_up");
    }

    if (effects.some(effect => effect.skillEffectType === "score_up_character_rank")) {
        types.add("score_up_character_rank");
    }

    if (effects.some(effect => effect.skillEffectType === "other_member_score_up_reference_rate")) {
        types.add("other_member_score_up_reference_rate");
    }

    if (types.size === 0) {
        types.add("score_up");
    }

    return [...types];
}

/**
 * Formats the skill description by replacing placeholders with actual values.
 * Based on sekai.best implementation.
 */
export function formatSkillDescription(
    skill: ISkillInfo,
    skillLevel: number,
    card?: ICardInfo
): string {
    if (!skill || !skill.description) return "";

    let newSkillInfo = skill.description;

    // Regular expressions for placeholders
    // Single arg: {{id;type}}
    const singleRegExp = /{{(\d+);(\w+)}}/g;
    // Double arg: {{min,max;type}}
    const doubleRegExp = /{{(\d+),(\d+);(\w+)}}/g;

    // Replace single argument placeholders
    // Types: d (duration), v (value), e (enhance), m (multiplier), c (character name)
    newSkillInfo = newSkillInfo.replace(singleRegExp, (match, idStr, type) => {
        const id = Number(idStr);

        // Handle character name special case
        if (type === "c" && card) {
            const charaName = CHARACTER_NAMES[card.characterId];
            return charaName || match;
        }

        // Find the skill effect
        const skillEffect = skill.skillEffects.find(eff => eff.id === id);
        if (!skillEffect) return match;

        // Find details for the specific level
        const detail = skillEffect.skillEffectDetails.find(d => d.level === skillLevel);
        if (!detail) return match;

        switch (type) {
            case "d": // Duration
                return String(detail.activateEffectDuration);
            case "v": // Value
                return String(detail.activateEffectValue);
            case "e": // Enhance value
                // Typically used for perfect scorer skills where it boosts the score up
                return skillEffect.skillEnhance?.activateEffectValue
                    ? String(skillEffect.skillEnhance.activateEffectValue)
                    : match;
            case "m": // Multiplier (5 * enhance + base)
                if (skillEffect.skillEnhance?.activateEffectValue) {
                    return String(
                        skillEffect.skillEnhance.activateEffectValue * 5 +
                        detail.activateEffectValue
                    );
                }
                return match;
            default:
                return match;
        }
    });

    // Replace double argument placeholders
    // These are usually conditional skills (e.g. valid for rank range)
    // For a generic viewer, we can assume the condition is met to show the max potential
    // or arguably handled differently. For now, let's try to extract the "Value".
    newSkillInfo = newSkillInfo.replace(doubleRegExp, (match, id1Str, id2Str, type) => {
        const id1 = Number(id1Str);
        const id2 = Number(id2Str);

        // Helper to get effect value at current level
        const getEffectValue = (effectId: number, preferValue2 = false) => {
            const effect = skill.skillEffects.find(e => e.id === effectId);
            if (!effect) return 0;
            const detail = effect.skillEffectDetails.find(d => d.level === skillLevel);
            if (!detail) return 0;
            return preferValue2 && detail.activateEffectValue2 != null
                ? detail.activateEffectValue2
                : detail.activateEffectValue;
        };

        const val1 = getEffectValue(id1);
        const val2 = getEffectValue(id2);

        // Logic based on sekai.best / sekaidex behavior for static display
        // We assume we want to show the specific values referenced by the IDs.
        // For "Max X%", it usually involves summing the base and the max bonus.

        switch (type) {
            case "u": // Unit Scaling (Base + Max Bonus)
            case "s": // Score (Base + Rank Bonus)
            case "v": // Value (Base + Rank Bonus)
                // For these, we sum the two values to get the total/max
                return String(val1 + val2);

            case "o":
                return String(getEffectValue(id1, true) + getEffectValue(id2, true));
            case "r": // Rank requirement range?
                // Logic usually checks if rank is within range.
                // For static display, we might just want to show the value of the secondary ID 
                // if it implies the "target" value, or maybe just val2?
                // Based on reference, 'r' usually returns a specific value based on rank match.
                // If we assume "Max", we might default to val2 (the max rank effect).
                return String(val2 > 0 ? val2 : val1);

            default:
                return match;
        }
    });

    return newSkillInfo;
}
