/**
 * Unit tests for multi-attribute / compilation event bonus attribute helpers
 * (src/lib/eventBonus.ts).
 *
 * Run with: node --test web/tests/event-bonus-attrs.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { importWebTypeScript } from "./characterization/test-helpers.mjs";

const mod = await importWebTypeScript("src/lib/eventBonus.ts");
const {
    EVENT_BONUS_ATTR_ORDER,
    getEventBonusAttrs,
    buildEventBonusAttrsMap,
    isAllBonusAttrs,
    matchesBonusAttrFilter,
} = mod;

// Sample fixtures mirroring live JP masterdata:
// - Event 220: normal single-attr marathon ("pure")
// - Event 227: Compilation / Memories event ("Leo/need Memories", all 5 attrs in cute/cool/pure/happy/mysterious order)
// - Event 218: World Link finale (0 attr-only rows)
const NORMAL_EVENT_220_BONUSES = [
    { id: 3561, eventId: 220, gameCharacterUnitId: 1, cardAttr: "pure", bonusRate: 50 },
    { id: 3562, eventId: 220, gameCharacterUnitId: 2, cardAttr: "pure", bonusRate: 50 },
    { id: 3571, eventId: 220, gameCharacterUnitId: 1, bonusRate: 25 },
    { id: 3581, eventId: 220, cardAttr: "pure", bonusRate: 25 },
];

const COMPILATION_EVENT_227_BONUSES = [
    // 4 unit chars × 5 attrs at 75% (subset + full attr-only entries)
    { id: 3710, eventId: 227, gameCharacterUnitId: 1, cardAttr: "cute", bonusRate: 75 },
    { id: 3714, eventId: 227, gameCharacterUnitId: 1, cardAttr: "cool", bonusRate: 75 },
    { id: 3718, eventId: 227, gameCharacterUnitId: 1, cardAttr: "pure", bonusRate: 75 },
    { id: 3722, eventId: 227, gameCharacterUnitId: 1, cardAttr: "happy", bonusRate: 75 },
    { id: 3726, eventId: 227, gameCharacterUnitId: 1, cardAttr: "mysterious", bonusRate: 75 },
    // 5 attr-only entries in JP masterdata order (mysterious last!)
    { id: 3730, eventId: 227, cardAttr: "cute", bonusRate: 25 },
    { id: 3731, eventId: 227, cardAttr: "cool", bonusRate: 25 },
    { id: 3732, eventId: 227, cardAttr: "pure", bonusRate: 25 },
    { id: 3733, eventId: 227, cardAttr: "happy", bonusRate: 25 },
    { id: 3734, eventId: 227, cardAttr: "mysterious", bonusRate: 25 },
];

const WORLD_LINK_218_BONUSES = [
    { id: 3500, eventId: 218, gameCharacterUnitId: 1, bonusRate: 25 },
    { id: 3501, eventId: 218, gameCharacterUnitId: 2, bonusRate: 25 },
];

test("getEventBonusAttrs extracts single attribute for normal event", () => {
    assert.deepEqual(getEventBonusAttrs(NORMAL_EVENT_220_BONUSES), ["pure"]);
    assert.equal(isAllBonusAttrs(getEventBonusAttrs(NORMAL_EVENT_220_BONUSES)), false);
});

test("getEventBonusAttrs extracts all 5 attributes in canonical order for compilation event", () => {
    const attrs = getEventBonusAttrs(COMPILATION_EVENT_227_BONUSES);
    assert.deepEqual(attrs, [...EVENT_BONUS_ATTR_ORDER]);
    assert.equal(isAllBonusAttrs(attrs), true);
});

test("getEventBonusAttrs returns empty array for World Link events with no attr-only entries", () => {
    assert.deepEqual(getEventBonusAttrs(WORLD_LINK_218_BONUSES), []);
    assert.equal(isAllBonusAttrs([]), false);
});

test("getEventBonusAttrs ignores char+attr entries, deduplicates, and ignores unknown attrs", () => {
    const bonuses = [
        { id: 1, eventId: 999, gameCharacterUnitId: 1, cardAttr: "cool", bonusRate: 50 },
        { id: 2, eventId: 999, cardAttr: "pure", bonusRate: 25 },
        { id: 3, eventId: 999, cardAttr: "cute", bonusRate: 25 },
        { id: 4, eventId: 999, cardAttr: "pure", bonusRate: 25 },
        { id: 5, eventId: 999, cardAttr: "invalid_attr", bonusRate: 25 },
    ];
    const attrs = getEventBonusAttrs(bonuses);
    assert.deepEqual(attrs, ["cute", "pure"]);
    assert.equal(isAllBonusAttrs(attrs), false);
});

test("buildEventBonusAttrsMap groups by eventId and omits events with no bonus attrs", () => {
    const all = [
        ...NORMAL_EVENT_220_BONUSES,
        ...COMPILATION_EVENT_227_BONUSES,
        ...WORLD_LINK_218_BONUSES,
    ];
    const map = buildEventBonusAttrsMap(all);

    assert.deepEqual(map.get(220), ["pure"]);
    assert.deepEqual(map.get(227), ["cool", "cute", "happy", "mysterious", "pure"]);
    assert.equal(map.has(218), false);
    assert.equal(map.size, 2);
});

test("matchesBonusAttrFilter matches compilation events under every pure-color attribute filter", () => {
    const map = buildEventBonusAttrsMap([
        ...NORMAL_EVENT_220_BONUSES,
        ...COMPILATION_EVENT_227_BONUSES,
        ...WORLD_LINK_218_BONUSES,
    ]);

    // No filter selected → matches everything including World Link
    assert.equal(matchesBonusAttrFilter(map.get(220), null), true);
    assert.equal(matchesBonusAttrFilter(map.get(227), null), true);
    assert.equal(matchesBonusAttrFilter(map.get(218), null), true);

    // Every single attribute filter matches #227 (all-color compilation event)
    for (const attr of EVENT_BONUS_ATTR_ORDER) {
        assert.equal(
            matchesBonusAttrFilter(map.get(227), attr),
            true,
            `compilation event should match filter "${attr}"`,
        );
        assert.equal(
            matchesBonusAttrFilter(map.get(218), attr),
            false,
            `world_bloom event should not match filter "${attr}"`,
        );
        assert.equal(
            matchesBonusAttrFilter(map.get(220), attr),
            attr === "pure",
            `normal pure event should only match "pure" (got "${attr}")`,
        );
    }
});
