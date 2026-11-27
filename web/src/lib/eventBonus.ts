/**
 * Helpers for extracting and matching event bonus attributes from eventDeckBonuses.
 *
 * Normal events have a single attribute-only bonus row (e.g. `pure`), World Link
 * events have zero attribute-only rows, and Compilation ("Memories") events
 * (#221, #222, #226, #227, ...) have all 5 attributes as separate attribute-only
 * rows so any single-color deck receives the attribute bonus.
 *
 * Pure functions, zero runtime imports (type-only imports).
 */
import type { IEventDeckBonus } from "@/types/events";
import type { CardAttribute } from "@/types/types";

/** Canonical attribute order for consistent UI display across the site. */
export const EVENT_BONUS_ATTR_ORDER: readonly CardAttribute[] = [
    "cool",
    "cute",
    "happy",
    "mysterious",
    "pure",
] as const;

const VALID_BONUS_ATTRS: ReadonlySet<string> = new Set(EVENT_BONUS_ATTR_ORDER);

function isCardAttribute(value: string): value is CardAttribute {
    return VALID_BONUS_ATTRS.has(value);
}

/**
 * Extract all unique bonus attributes for a single event's deck bonus rows,
 * ordered canonically (cool, cute, happy, mysterious, pure).
 *
 * Only attribute-only entries (`cardAttr && !gameCharacterUnitId`) define an
 * event's attribute bonus.
 */
export function getEventBonusAttrs(bonuses: readonly IEventDeckBonus[]): CardAttribute[] {
    const found = new Set<CardAttribute>();
    for (const bonus of bonuses) {
        if (bonus.cardAttr && !bonus.gameCharacterUnitId && isCardAttribute(bonus.cardAttr)) {
            found.add(bonus.cardAttr);
        }
    }
    if (found.size === 0) return [];
    return EVENT_BONUS_ATTR_ORDER.filter((attr) => found.has(attr));
}

/**
 * Build a map from eventId → sorted unique bonus attributes.
 * Events without attribute bonuses (e.g. World Link) are omitted.
 */
export function buildEventBonusAttrsMap(
    bonuses: readonly IEventDeckBonus[],
): Map<number, CardAttribute[]> {
    const sets = new Map<number, Set<CardAttribute>>();
    for (const bonus of bonuses) {
        if (bonus.cardAttr && !bonus.gameCharacterUnitId && isCardAttribute(bonus.cardAttr)) {
            let attrSet = sets.get(bonus.eventId);
            if (!attrSet) {
                attrSet = new Set<CardAttribute>();
                sets.set(bonus.eventId, attrSet);
            }
            attrSet.add(bonus.cardAttr);
        }
    }

    const result = new Map<number, CardAttribute[]>();
    for (const [eventId, attrSet] of sets) {
        result.set(
            eventId,
            EVENT_BONUS_ATTR_ORDER.filter((attr) => attrSet.has(attr)),
        );
    }
    return result;
}

/**
 * True when an event grants attribute bonuses for all 5 card attributes
 * (e.g. Compilation / Memories events where any pure-color deck works).
 */
export function isAllBonusAttrs(attrs?: readonly CardAttribute[] | null): boolean {
    if (!attrs || attrs.length < EVENT_BONUS_ATTR_ORDER.length) return false;
    return EVENT_BONUS_ATTR_ORDER.every((attr) => attrs.includes(attr));
}

/**
 * Check whether an event's bonus attributes match the selected filter attribute.
 * All-attribute events match every selected attribute filter.
 */
export function matchesBonusAttrFilter(
    attrs: readonly CardAttribute[] | undefined,
    selectedBonusAttr: CardAttribute | null,
): boolean {
    if (!selectedBonusAttr) return true;
    return Boolean(attrs && attrs.includes(selectedBonusAttr));
}
