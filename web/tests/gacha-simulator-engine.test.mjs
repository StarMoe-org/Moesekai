// Engine checks for the gacha simulator: rates, pity, 10-pull floor, UP share.
// Run with: node --experimental-strip-types --test tests/gacha-simulator-engine.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    cardProbabilities, createRng, EMPTY_PULL_STATE, effectiveRates, poolIssues, rollPulls,
} from "../src/lib/gacha-simulator/engine.ts";

const pool = (over = {}) => ({
    id: "t",
    name: "t",
    source: "custom",
    rates: { rarity_1: 0, rarity_2: 0, rarity_3: 20, rarity_4: 3, rarity_birthday: 0 },
    cards: [
        { cardId: 1, rarity: "rarity_3", weight: 1, up: false },
        { cardId: 2, rarity: "rarity_3", weight: 1, up: false },
        { cardId: 10, rarity: "rarity_4", weight: 1, up: true },
        { cardId: 11, rarity: "rarity_4", weight: 3, up: false },
    ],
    upShare: 0,
    pityPulls: 0,
    tenPullFloor: false,
    ...over,
});

test("effective rates normalise to 100 over present rarities", () => {
    const rates = effectiveRates(pool({ rates: { rarity_1: 50, rarity_2: 0, rarity_3: 30, rarity_4: 20, rarity_birthday: 0 } }));
    // rarity_1 has no cards, so its rate is dropped and the rest is normalised.
    assert.equal(rates.rarity_1, 0);
    assert.ok(Math.abs(rates.rarity_3 + rates.rarity_4 - 100) < 1e-9);
    assert.ok(Math.abs(rates.rarity_3 - 60) < 1e-9);
});

test("card probabilities sum to 100 and follow weights", () => {
    const table = cardProbabilities(pool());
    const total = table.reduce((s, e) => s + e.percent, 0);
    assert.ok(Math.abs(total - 100) < 1e-9);
    const p11 = table.find((e) => e.cardId === 11).percent;
    const p10 = table.find((e) => e.cardId === 10).percent;
    assert.ok(Math.abs(p11 / (p10 + p11) - 0.75) < 1e-9);
});

test("UP share reserves that fraction of each rarity for UP cards", () => {
    const table = cardProbabilities(pool({ upShare: 0.5 }));
    const up4 = table.find((e) => e.cardId === 10).percent;
    const total4 = table.filter((e) => e.rarity === "rarity_4").reduce((s, e) => s + e.percent, 0);
    assert.ok(Math.abs(up4 / total4 - 0.5) < 1e-9);
});

test("empirical rarity frequency converges to the configured rate", () => {
    const rng = createRng(12345);
    const { results } = rollPulls(pool(), 200000, EMPTY_PULL_STATE, rng);
    const four = results.filter((r) => r.rarity === "rarity_4").length / results.length;
    // rates 20 (3★) and 3 (4★) normalise to 3 / 23 of the pulls
    assert.ok(Math.abs(four - 3 / 23) < 0.003, `4★ frequency ${four}`);
});

test("pity forces a 4★ on the N-th pull without one", () => {
    const rng = createRng(7);
    const p = pool({ rates: { rarity_1: 0, rarity_2: 0, rarity_3: 99.9, rarity_4: 0.1, rarity_birthday: 0 }, pityPulls: 5 });
    const { results } = rollPulls(p, 5000, EMPTY_PULL_STATE, rng);
    let run = 0;
    for (const r of results) {
        if (r.rarity === "rarity_4") run = 0;
        else run += 1;
        assert.ok(run < 5, "five pulls in a row without a 4★");
        if (r.pityForced) assert.equal(r.rarity, "rarity_4");
    }
});

test("ten-pull floor guarantees 3★+ on the 10th pull when none earlier", () => {
    const rng = createRng(99);
    const p = pool({ rates: { rarity_1: 99.9, rarity_2: 0, rarity_3: 0.1, rarity_4: 0, rarity_birthday: 0 }, cards: [{ cardId: 1, rarity: "rarity_1", weight: 1, up: false }, { cardId: 3, rarity: "rarity_3", weight: 1, up: false }], tenPullFloor: true });
    const { results } = rollPulls(p, 30, EMPTY_PULL_STATE, rng);
    for (let block = 0; block < 3; block += 1) {
        const slice = results.slice(block * 10, block * 10 + 10);
        assert.ok(slice.some((r) => r.rarity === "rarity_3"), `block ${block} lacks 3★`);
    }
});

test("pool issues flag empty pools and missing 4★", () => {
    assert.deepEqual(poolIssues(pool({ cards: [] })), ["noCards"]);
    const issues = poolIssues(pool({ cards: [{ cardId: 1, rarity: "rarity_3", weight: 1, up: false }] }));
    assert.ok(issues.includes("noFourStar"));
});
