/**
 * 跨档位关系（src/lib/prediction/model/tiers.ts 与 scripts/prediction-backtest/fit-tiers.mjs）单元测试，全部基于合成数据。
 * 运行：node --test --experimental-strip-types tests/prediction-tiers.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    adjustAcrossTiers,
    enforceMonotone,
    logNormalQuantiles,
    lookupTiersCell,
    tiersCellKey,
    tiersFamilyKey,
    valueAtProgress,
} from "../src/lib/prediction/model/tiers.ts";
import {
    DEFAULT_TIERS_OPTIONS,
    EVAL_MODELS,
    GATE_RULE,
    fitTiers,
    nestedAdjustFlags,
    parseArgs,
    suggestGates,
    withoutAdjust,
} from "../scripts/prediction-backtest/fit-tiers.mjs";

const H = 3_600_000;
const D = 24 * H;
const T0 = Date.UTC(2025, 0, 1, 3, 0, 0);
const Z90 = 1.2815515655446004;

// 确定性伪随机数与标准正态。
function rng(seed) {
    let a = seed >>> 0;
    const uniform = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return () => {
        const u = Math.max(uniform(), 1e-12);
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
    };
}

function ctxOf(overrides = {}) {
    return {
        region: "jp",
        eventId: 1,
        group: "normal",
        wlTurn: null,
        chapterCharacterId: null,
        chapterNo: null,
        autoSpecialMeasure: false,
        scopeStartAt: T0,
        scopeEndAt: T0 + 3 * D,
        breakGauge: false,
        unit: null,
        bannerCharacterId: null,
        jpSameIdFinal: null,
        otherTiers: [],
        ...overrides,
    };
}

function pair(logRatio, logRatioSigma, errorCorr = null) {
    return { logRatio, logRatioSigma, errorCorr, n: 10, nSeries: errorCorr ? 10 : 0 };
}

function section(cells, families = {}) {
    return { version: 1, progressKnots: [0.1, 0.5, 0.9], cells, families };
}

const est = (logMedian, logSigma) => ({ median: Math.exp(logMedian), logSigma });

test("cell keys keep editions apart: finales by event, normal by gauge, WL by turn and unit vs VS/mixed", () => {
    assert.equal(tiersCellKey(ctxOf({ group: "wl_finale", eventId: 218, wlTurn: 3, breakGauge: true })), "jp|wl_finale|#218");
    assert.equal(tiersFamilyKey(ctxOf({ group: "wl_finale", eventId: 218, wlTurn: 3 })), null);
    assert.notEqual(tiersCellKey(ctxOf({ group: "wl_finale", eventId: 180 })), tiersCellKey(ctxOf({ group: "wl_finale", eventId: 218 })));
    assert.notEqual(tiersCellKey(ctxOf({ group: "wl_finale", region: "cn", eventId: 180 })), tiersCellKey(ctxOf({ group: "wl_finale", eventId: 180 })));
    assert.equal(tiersCellKey(ctxOf({ breakGauge: true })), "jp|normal|gauge");
    assert.equal(tiersCellKey(ctxOf({ breakGauge: false })), "jp|normal|base");
    // CN WL1 团章节（48 h）与 CN #140 VS 章节（48 h）、WL3 章节（48 h）各自成格。
    const cnUnit = tiersCellKey(ctxOf({ region: "cn", group: "wl_chapter_48h", wlTurn: 1, unit: "idol", chapterCharacterId: 5 }));
    const cnVs = tiersCellKey(ctxOf({ region: "cn", group: "wl_chapter_48h", wlTurn: 1, unit: null, chapterCharacterId: 21 }));
    const cnWl3 = tiersCellKey(ctxOf({ region: "cn", group: "wl_chapter_48h", wlTurn: 3, unit: null, chapterCharacterId: 5 }));
    assert.equal(new Set([cnUnit, cnVs, cnWl3]).size, 3);
    assert.equal(tiersFamilyKey(ctxOf({ region: "cn", group: "wl_chapter_48h", wlTurn: 1 })), "cn|wl_chapter_48h");
});

test("valueAtProgress interpolates between knots and is flat outside", () => {
    const knots = [0.1, 0.5, 0.9];
    const values = [0.2, 0.6, 1.0];
    assert.equal(valueAtProgress(knots, values, 0), 0.2);
    assert.equal(valueAtProgress(knots, values, 1), 1.0);
    assert.ok(Math.abs(valueAtProgress(knots, values, 0.3) - 0.4) < 1e-12);
    assert.ok(Math.abs(valueAtProgress(knots, values, 0.7) - 0.8) < 1e-12);
});

test("logNormalQuantiles gives the P10 / P90 of a log-normal", () => {
    const q = logNormalQuantiles({ median: 1000, logSigma: 0.1 });
    assert.equal(q.p50, 1000);
    assert.ok(Math.abs(q.p10 - 1000 * Math.exp(-Z90 * 0.1)) < 1e-9);
    assert.ok(Math.abs(q.p90 - 1000 * Math.exp(Z90 * 0.1)) < 1e-9);
});

test("enforceMonotone leaves an ordered ladder untouched, including a finale T1000/T1500 cliff", () => {
    const q = new Map([
        [500, { p10: 9.0e6, p50: 9.5e6, p90: 10.0e6 }],
        [1000, { p10: 8.6e6, p50: 9.0e6, p90: 9.4e6 }],
        [1500, { p10: 2.2e6, p50: 2.45e6, p90: 2.7e6 }],
        [2000, { p10: 2.0e6, p50: 2.2e6, p90: 2.4e6 }],
    ]);
    const out = enforceMonotone(q);
    assert.deepEqual(out, q);
    // 悬崖 T1500/T1000 ≈ 0.27 原样保留。
    assert.ok(Math.abs(out.get(1500).p50 / out.get(1000).p50 - 2.45 / 9.0) < 1e-12);
    assert.equal(enforceMonotone(new Map()).size, 0);
});

test("enforceMonotone repairs inversions, keeps P10 <= P50 <= P90, and moves the vaguer tier more", () => {
    const q = new Map([
        [10, { p10: 9.5e6, p50: 10e6, p90: 10.5e6 }],
        // T100 的中位数高于 T10（倒挂），且区间宽得多。
        [100, { p10: 8e6, p50: 11e6, p90: 14e6 }],
        [1000, { p10: 3e6, p50: 3.2e6, p90: 3.4e6 }],
        [2000, { p10: 3.1e6, p50: 3.3e6, p90: 3.5e6 }],
    ]);
    const out = enforceMonotone(q);
    const ranks = [...out.keys()];
    assert.deepEqual(ranks, [10, 100, 1000, 2000]);
    for (const k of ["p10", "p50", "p90"]) {
        for (let i = 1; i < ranks.length; i++) assert.ok(out.get(ranks[i])[k] <= out.get(ranks[i - 1])[k] + 1e-6, `${k} not non-increasing`);
    }
    for (const r of ranks) {
        const e = out.get(r);
        assert.ok(e.p10 <= e.p50 && e.p50 <= e.p90);
    }
    // 精确的 T10 几乎不动，模糊的 T100 让步。
    assert.ok(Math.abs(out.get(10).p50 - 10e6) < Math.abs(out.get(100).p50 - 11e6));
    assert.ok(out.get(10).p50 >= 10e6);
});

test("adjustAcrossTiers passes a finale without its own cell through unchanged (cliff kept)", () => {
    const s = section({ "jp|normal|base": { ranks: [1000, 1500], pairs: [pair(-0.3, 0.05, [0.9, 0.9, 0.9])], ratioCorr: 0, commonCorr: [0, 0, 0], adjust: true } }, {
        "jp|normal": { ranks: [1000, 1500], pairs: [pair(-0.3, 0.05, [0.9, 0.9, 0.9])], ratioCorr: 0, commonCorr: [0, 0, 0], adjust: true },
    });
    const ctx = ctxOf({ group: "wl_finale", eventId: 218, wlTurn: 3, breakGauge: true });
    assert.equal(lookupTiersCell(ctx, s), null);
    const input = new Map([[1000, est(Math.log(9e6), 0.05)], [1500, est(Math.log(2.45e6), 0.08)]]);
    const out = adjustAcrossTiers(ctx, input, s, T0 + 1.5 * D);
    assert.deepEqual(out, input);
});

test("fill only (no atMs or adjust = false): estimates pass through, missing ladder tiers follow the ladder prior", () => {
    const cell = { ranks: [10, 100, 1000], pairs: [pair(-1, 0.1), pair(-1.2, 0.2)], ratioCorr: 0, commonCorr: null, adjust: false };
    const s = section({ "jp|normal|base": cell });
    const ctx = ctxOf();
    const input = new Map([[10, est(10, 0.05)], [1000, est(7.5, 0.05)]]);
    const out = adjustAcrossTiers(ctx, input, s, T0 + D);
    assert.deepEqual(out.get(10), input.get(10));
    assert.deepEqual(out.get(1000), input.get(1000));
    // 条件分布：精度 1/0.01 + 1/0.04 = 125；均值 (100·(10 − 1) + 25·(7.5 + 1.2)) / 125 = 8.94；
    // 方差 1/125 + 0.8²·0.0025 + 0.2²·0.0025 = 0.0097。
    const t100 = out.get(100);
    assert.ok(Math.abs(Math.log(t100.median) - 8.94) < 1e-9);
    assert.ok(Math.abs(t100.logSigma - Math.sqrt(0.0097)) < 1e-9);

    // 只有 T10：向下外推，方差逐步累加。
    const top = adjustAcrossTiers(ctx, new Map([[10, est(10, 0.05)]]), s);
    assert.ok(Math.abs(Math.log(top.get(100).median) - 9) < 1e-9);
    assert.ok(Math.abs(top.get(100).logSigma - Math.sqrt(0.01 + 0.0025)) < 1e-9);
    assert.ok(Math.abs(Math.log(top.get(1000).median) - 7.8) < 1e-9);
    assert.ok(Math.abs(top.get(1000).logSigma - Math.sqrt(0.01 + 0.04 + 0.0025)) < 1e-9);
});

test("adjust: a noisy tier is pulled toward the ladder, keeps its own sigma; off-ladder ranks pass through; breaks are not crossed", () => {
    const cell = {
        ranks: [10, 100, 1000, 5000, 10000],
        pairs: [pair(-1, 0.05, [0.5, 0.5, 0.5]), pair(-1.2, 0.05, [0.5, 0.5, 0.5]), null, pair(-0.5, 0.05, [0.5, 0.5, 0.5])],
        ratioCorr: 0.2,
        commonCorr: [0.1, 0.1, 0.1],
        adjust: true,
    };
    const s = section({ "jp|normal|base": cell });
    const ctx = ctxOf();
    const input = new Map([
        [10, est(10, 0.02)],
        [50, est(9.5, 0.03)],
        [100, est(9.3, 0.2)],
        [1000, est(7.8, 0.02)],
    ]);
    const out = adjustAcrossTiers(ctx, input, s, T0 + 1.5 * D);
    const y100 = Math.log(out.get(100).median);
    assert.ok(Math.abs(y100 - 9) < 0.1, `T100 not pulled to the ladder: ${y100}`);
    assert.equal(out.get(100).logSigma, 0.2);
    assert.deepEqual(out.get(50), input.get(50));
    // T1000 与 T5000 之间断开：T5000 / T10000 不补。
    assert.ok(!out.has(5000) && !out.has(10000));
    for (const r of [10, 100, 1000]) assert.ok(Number.isFinite(out.get(r).median));
});

test("adjust reduces single-tier error when the errors follow the fitted structure (Monte Carlo)", () => {
    const ranks = [10, 100, 1000, 10000];
    const d = [-1, -1.1, -1.2];
    const tau = 0.1;
    const ratioCorr = 0.3;
    const common = 0.3;
    const adjacent = 0.8;
    const sigmas = [0.05, 0.08, 0.1, 0.12];
    const cell = {
        ranks,
        pairs: d.map((x) => pair(x, tau, [adjacent, adjacent, adjacent])),
        ratioCorr,
        commonCorr: [common, common, common],
        adjust: true,
    };
    const s = section({ "jp|normal|base": cell });
    // 误差相关：c + (1 − c)·ρ'^|i−j|，ρ' = (ρ − c)/(1 − c)。
    const rho = (adjacent - common) / (1 - common);
    const cov = ranks.map((_, i) => ranks.map((__, j) => (i === j ? 1 : common + (1 - common) * rho ** Math.abs(i - j)) * sigmas[i] * sigmas[j]));
    const l = cov.map(() => new Array(ranks.length).fill(0));
    for (let j = 0; j < ranks.length; j++) {
        let v = cov[j][j];
        for (let k = 0; k < j; k++) v -= l[j][k] ** 2;
        l[j][j] = Math.sqrt(v);
        for (let i = j + 1; i < ranks.length; i++) {
            let w = cov[i][j];
            for (let k = 0; k < j; k++) w -= l[i][k] * l[j][k];
            l[i][j] = w / l[j][j];
        }
    }
    const normal = rng(7);
    let single = 0;
    let adjusted = 0;
    const ctx = ctxOf();
    for (let draw = 0; draw < 1500; draw++) {
        const truth = [16];
        let prev = 0;
        for (let k = 0; k < d.length; k++) {
            const z = k === 0 ? normal() : ratioCorr * prev + Math.sqrt(1 - ratioCorr ** 2) * normal();
            prev = z;
            truth.push(truth[k] + d[k] + tau * z);
        }
        const z = ranks.map(() => normal());
        const err = ranks.map((_, i) => l[i].reduce((sum, v, k) => sum + v * z[k], 0));
        const input = new Map(ranks.map((r, i) => [r, est(truth[i] + err[i], sigmas[i])]));
        const out = adjustAcrossTiers(ctx, input, s, T0 + 1.5 * D);
        ranks.forEach((r, i) => {
            single += err[i] ** 2;
            adjusted += (Math.log(out.get(r).median) - truth[i]) ** 2;
        });
    }
    assert.ok(adjusted < 0.9 * single, `adjusted MSE ${adjusted} vs single ${single}`);
});

// ---------------------------------------------------------------------------------------------
// fitTiers：合成数据集

const LADDER = { 10: 40e6, 100: 15e6, 1000: 5e6, 10000: 1.5e6 };
const RANKS = Object.keys(LADDER).map(Number);

function makeEvent({ region = "jp", eventId, start, hours = 72, breakTimeId = null, isFinale = false, wlTurn = null }) {
    return {
        region,
        eventId,
        name: `E${eventId}`,
        eventType: isFinale ? "world_bloom" : "marathon",
        startAt: start,
        aggregateAt: start + hours * H,
        days: hours / 24,
        group: isFinale ? "wl_finale" : "normal",
        wlTurn,
        isFinale,
        chapters: isFinale ? [{ chapterNo: 1, gameCharacterId: null, startAt: start, aggregateAt: start + hours * H }] : [],
        unit: null,
        bannerCharacterId: null,
        breakTimeId,
        autoSpecialMeasure: false,
        bonusRatio: null,
    };
}

/** 每期终榜 = 阶梯 × 活动水平 × 比值噪声；序列 = 终榜 × p^(1 + e)，e 在同期各档间高度相关。 */
function buildDataset(specs, seed = 11) {
    const normal = rng(seed);
    const events = [];
    const series = [];
    const finals = [];
    for (const spec of specs) {
        const ev = makeEvent(spec);
        events.push(ev);
        const level = Math.exp(0.2 * normal());
        const common = 0.15 * normal();
        let factor = 1;
        RANKS.forEach((rank, i) => {
            if (i > 0) factor *= Math.exp(0.03 * normal());
            const final = Math.round(LADDER[rank] * level * factor * (spec.ratioScale?.[rank] ?? 1));
            finals.push({ region: ev.region, eventId: ev.eventId, scope: { kind: "overall" }, rank, score: final, source: "synthetic" });
            const e = common + 0.03 * normal();
            const points = [];
            for (let t = ev.startAt + H; t <= ev.aggregateAt; t += H) {
                const p = (t - ev.startAt) / (ev.aggregateAt - ev.startAt);
                points.push([t, Math.max(1, Math.round(final * p ** (1 + e)))]);
            }
            series.push({ region: ev.region, eventId: ev.eventId, scope: { kind: "overall" }, rank, points, source: "synthetic" });
        });
    }
    return { events, series, finals };
}

function normalSpecs(n, { from = 1, start = T0, breakTimeId = null } = {}) {
    return Array.from({ length: n }, (_, i) => ({ eventId: from + i, start: start + i * 8 * D, breakTimeId }));
}

test("fitTiers returns a TiersSection with ladder ratios near the truth and correlated errors", () => {
    const data = buildDataset(normalSpecs(12));
    const s = fitTiers(data);
    assert.ok(!(s instanceof Promise));
    assert.equal(s.version, 1);
    assert.deepEqual(s.progressKnots, [...DEFAULT_TIERS_OPTIONS.knots]);
    const cell = s.cells["jp|normal|base"];
    assert.ok(cell, "normal cell missing");
    assert.deepEqual(cell.ranks, RANKS);
    RANKS.slice(1).forEach((rank, i) => {
        const truth = Math.log(LADDER[rank] / LADDER[RANKS[i]]);
        assert.ok(Math.abs(cell.pairs[i].logRatio - truth) < 0.05, `pair ${i}: ${cell.pairs[i].logRatio} vs ${truth}`);
        assert.ok(cell.pairs[i].logRatioSigma > 0);
        assert.equal(cell.pairs[i].errorCorr.length, s.progressKnots.length);
        assert.ok(cell.pairs[i].errorCorr[3] > 0.5, "errors of adjacent tiers should be correlated");
    });
    assert.deepEqual(fitTiers(data), s);
    // 默认不开任何单元格的调整（完整链路的嵌套回测里调整没有帮助）；"all" 打开所有可调整的单元格与合并组，其余字段不变。
    assert.deepEqual(DEFAULT_TIERS_OPTIONS.adjustCells, []);
    assert.equal(cell.adjust, false);
    const all = fitTiers(data, { adjustCells: "all" });
    assert.equal(all.cells["jp|normal|base"].adjust, true);
    assert.equal(all.families["jp|normal"].adjust, true);
    assert.deepEqual(withoutAdjust(all), s);
});

test("fitTiers never pools finales and gives a lone finale no cell", () => {
    const specs = [
        ...normalSpecs(8),
        { eventId: 180, start: T0 + 70 * D, isFinale: true, wlTurn: 2 },
        { eventId: 218, start: T0 + 80 * D, isFinale: true, wlTurn: 3, breakTimeId: 2, ratioScale: { 10000: 0.3 } },
    ];
    const data = buildDataset(specs);
    const s = fitTiers(data);
    assert.ok(!Object.keys(s.cells).some((k) => k.includes("wl_finale")), "a finale with one scope must not get a cell");
    assert.ok(!Object.keys(s.families).some((k) => k.includes("wl_finale")), "finales must not form a family");
    const ctx = ctxOf({ group: "wl_finale", eventId: 218, wlTurn: 3, breakGauge: true });
    const input = new Map([[1000, est(Math.log(5e6), 0.05)], [10000, est(Math.log(0.45e6), 0.1)]]);
    assert.deepEqual(adjustAcrossTiers(ctx, input, s, T0 + 81 * D), input);
});

test("shrinkK 0 fits cells from their own data only; adjustCells and unsharedCells switch adjustment and sharing per cell", () => {
    const data = buildDataset([...normalSpecs(10), ...normalSpecs(3, { from: 50, start: T0 + 100 * D, breakTimeId: 2 })]);
    const shared = fitTiers(data, { unsharedCells: [] });
    const own = fitTiers(data, { shrinkK: 0 });
    assert.deepEqual(own.families, {});
    assert.ok(Object.keys(shared.families).includes("jp|normal"));
    const gated = fitTiers(data, { adjustCells: ["jp|normal|base"], unsharedCells: ["jp|normal|gauge"] });
    assert.deepEqual(gated.cells["jp|normal|base"], { ...shared.cells["jp|normal|base"], adjust: true });
    assert.equal(gated.cells["jp|normal|gauge"].adjust, false);
    assert.equal(gated.families["jp|normal"].adjust, false);
    assert.deepEqual(gated.cells["jp|normal|gauge"].pairs, own.cells["jp|normal|gauge"].pairs);
    assert.notDeepEqual(shared.cells["jp|normal|gauge"].pairs, own.cells["jp|normal|gauge"].pairs);

    // 没有自身数据的单元格：默认退回合并组（只补缺档）；列入 adjustCells 也不借合并组去调整；不共享 → 空阶梯、原样透传。
    const onlyBase = buildDataset(normalSpecs(10));
    const gaugeCtx = ctxOf({ breakGauge: true });
    const all = fitTiers(onlyBase, { adjustCells: "all" });
    assert.equal(lookupTiersCell(gaugeCtx, all), all.families["jp|normal"]);
    assert.equal(all.families["jp|normal"].adjust, true);
    const listed = fitTiers(onlyBase, { adjustCells: ["jp|normal|gauge"] });
    assert.equal(lookupTiersCell(gaugeCtx, listed).adjust, false);
    const blocked = fitTiers(onlyBase, { unsharedCells: ["jp|normal|gauge"] });
    assert.deepEqual(blocked.cells["jp|normal|gauge"].ranks, []);
    const input = new Map([[10, est(17, 0.05)], [1000, est(15.2, 0.3)]]);
    assert.deepEqual(adjustAcrossTiers(gaugeCtx, input, blocked, T0 + D), input);
    const filled = adjustAcrossTiers(gaugeCtx, input, fitTiers(onlyBase), T0 + D);
    assert.deepEqual(filled.get(1000), input.get(1000));
    assert.deepEqual(filled.get(10), input.get(10));
    assert.ok(filled.has(100));
});

test("the gauge cell uses only the newest break-time set; older sets feed the family pool", () => {
    const data = buildDataset([
        ...normalSpecs(6),
        ...normalSpecs(2, { from: 30, start: T0 + 60 * D, breakTimeId: 1 }),
        ...normalSpecs(4, { from: 40, start: T0 + 80 * D, breakTimeId: 2 }),
    ]);
    const s = fitTiers(data, { shrinkK: 0 });
    assert.equal(s.cells["jp|normal|gauge"].pairs[0].n, 4);
    const pooled = fitTiers(data);
    assert.equal(pooled.cells["jp|normal|gauge"].pairs[0].n, 4);
    assert.equal(pooled.cells["jp|normal|base"].pairs[0].n, 6);
    // 去掉参数套 1 的两期后合并组的比值会变：它们只进合并组。
    const keep = new Set(data.events.filter((e) => e.breakTimeId !== 1).map((e) => e.eventId));
    const without = fitTiers({
        events: data.events.filter((e) => keep.has(e.eventId)),
        series: data.series.filter((x) => keep.has(x.eventId)),
        finals: data.finals.filter((x) => keep.has(x.eventId)),
    });
    assert.notEqual(without.families["jp|normal"].pairs[0].logRatio, pooled.families["jp|normal"].pairs[0].logRatio);
    assert.deepEqual(without.cells["jp|normal|gauge"].pairs[0].n, 4);
});

function gateRow(model, eventId, p50, { rank = 10, cut = "p50", actual = 100 } = {}) {
    return { model, region: "jp", eventId, scope: "overall", cell: "x", rank, cut, p10: p50 * 0.9, p50, p90: p50 * 1.1, actual };
}

test("suggestGates: adjustment only where the full chain gains with enough events, and only if the nested rule gains overall", () => {
    const chainRows = (nestedA) => {
        const rows = [];
        for (let i = 0; i < 3; i++) {
            // A：开启有效（3 期）。B：开启变差。C：开启有效但只有 2 期。
            rows.push(gateRow(EVAL_MODELS.chainOff, 1 + i, 110), gateRow(EVAL_MODELS.chainOn, 1 + i, 102), gateRow(EVAL_MODELS.chainNested, 1 + i, nestedA));
            rows.push(gateRow(EVAL_MODELS.chainOff, 11 + i, 103), gateRow(EVAL_MODELS.chainOn, 11 + i, 106), gateRow(EVAL_MODELS.chainNested, 11 + i, 103));
            if (i < 2) rows.push(gateRow(EVAL_MODELS.chainOff, 21 + i, 110), gateRow(EVAL_MODELS.chainOn, 21 + i, 101), gateRow(EVAL_MODELS.chainNested, 21 + i, 110));
        }
        for (const id of [1, 2]) {
            // D：只用自身数据补得更准 → 不共享。E：收缩补得更准 → 共享。
            rows.push(gateRow(EVAL_MODELS.finalsFill, 30 + id, 108, { cut: "final" }), gateRow(EVAL_MODELS.finalsFillCell, 30 + id, 103, { cut: "final" }));
            rows.push(gateRow(EVAL_MODELS.finalsFill, 40 + id, 101, { cut: "final" }), gateRow(EVAL_MODELS.finalsFillCell, 40 + id, 104, { cut: "final" }));
        }
        return rows;
    };
    const cellOfRow = (r) => "ABCDE"[Math.floor(r.eventId / 10)];

    const g = suggestGates(chainRows(102), cellOfRow);
    assert.equal(g.overall.keep, true);
    assert.deepEqual(g.adjustCells, ["A"]);
    assert.deepEqual(g.unsharedCells, ["D"]);
    const byCell = Object.fromEntries(g.table.map((t) => [t.cell, t]));
    assert.equal(byCell.A.evidence.helps, true);
    assert.equal(byCell.B.evidence.helps, false);
    assert.equal(byCell.C.evidence.helps, false, "fewer than GATE_RULE.minEvents events");
    assert.equal(byCell.D.evidence.off, null);
    assert.equal(byCell.E.share, true);

    // 嵌套使用时规则没有降低总误差：即使 A 在全量数据上有效也一个都不开。
    const none = suggestGates(chainRows(110), cellOfRow);
    assert.equal(none.overall.keep, false);
    assert.deepEqual(none.adjustCells, []);
    assert.deepEqual(none.unsharedCells, ["D"]);
});

test("nestedAdjustFlags decides each record only from events that ended before it started", () => {
    const events = Array.from({ length: 5 }, (_, i) => makeEvent({ eventId: i + 1, start: T0 + i * 10 * D }));
    // 重叠活动：第 6 期在第 5 期结算前开始，看不到第 5 期。
    events.push(makeEvent({ eventId: 6, start: events[4].startAt + D }));
    const data = { events, series: [], finals: [] };
    const records = events.map((ev) => ({ ev, tiersCell: "X" }));
    const rowsFor = (bad) => events.flatMap((ev) => {
        const onP50 = bad.has(ev.eventId) ? 130 : 102;
        return [gateRow(EVAL_MODELS.chainOff, ev.eventId, 110), gateRow(EVAL_MODELS.chainOn, ev.eventId, onP50)];
    });
    const cellOfRow = () => "X";
    const good = nestedAdjustFlags(data, records, rowsFor(new Set()), cellOfRow, GATE_RULE);
    assert.deepEqual(good, [false, false, false, true, true, true]);
    // 第 4、5 期自己变差不影响它们自己的开关，只影响之后开始的活动。
    const worse = nestedAdjustFlags(data, records, rowsFor(new Set([4, 5])), cellOfRow, GATE_RULE);
    assert.deepEqual(worse.slice(0, 4), good.slice(0, 4));
    assert.equal(worse[4], true, "event 5 sees events 1-4, where adjustment still helps on average");
    assert.equal(worse[5], true, "event 6 starts before event 5 ends");
    // 第 3 期变差：第 4 期看到的 3 期里调整已不再占优，之后的活动又因第 4 期回到有效。
    const third = nestedAdjustFlags(data, records, rowsFor(new Set([3])), cellOfRow, GATE_RULE);
    assert.deepEqual(third, [false, false, false, false, true, true]);
});

test("parseArgs: defaults, flags and unknown arguments", () => {
    const d = parseArgs([]);
    assert.equal(d.backtest, false);
    assert.ok(d.out.replaceAll("\\", "/").endsWith("/prediction-model/fit"));
    const a = parseArgs(["--data", "/x", "--out", "/y", "--backtest", "--backtest-out", "/z", "--report", "/r.md"]);
    assert.deepEqual(a, { data: "/x", out: "/y", backtest: true, backtestOut: "/z", report: "/r.md" });
    assert.throws(() => parseArgs(["--nope"]));
    assert.throws(() => parseArgs(["--out"]));
});
