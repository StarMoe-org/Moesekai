/**
 * 终榜先验（src/lib/prediction/model/prior.ts + scripts/prediction-backtest/fit-prior.mjs）单元测试，基于带固定种子的合成数据集。
 * 运行：node --test --experimental-strip-types tests/prediction-prior.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { contextFromDataset } from "../src/lib/prediction/model/dataset-context.ts";
import { YEAR_MS, finalPrior, priorCellKey, priorCurve } from "../src/lib/prediction/model/prior.ts";
import { DEFAULT_DATA_DIR } from "../scripts/prediction-backtest/dataset.mjs";
import {
    DEFAULT_FIT_DIR,
    PRIOR_CUTS,
    borrowedLevels,
    collectSamples,
    evaluatePrior,
    fitPrior,
    loadToriPrior,
    materializeFinals,
    parseArgs,
    priorLevelSource,
    priorModel,
    renderPriorReport,
    scopeRowKey,
} from "../scripts/prediction-backtest/fit-prior.mjs";
import { rollingBacktest } from "../scripts/prediction-backtest/harness.mjs";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(WEB, "scripts/prediction-backtest/fit-prior.mjs");
const H = 3_600_000;
const D = 24 * H;
const T0 = Date.UTC(2021, 0, 1, 6, 0, 0);
const RANKS = [1, 10, 100, 1000, 10000];
// 8 天（192 小时）活动在 T0 时的 log(终榜)
const LEVEL = { 1: 20, 10: 19, 100: 17.8, 1000: 16.2, 10000: 15 };
const TREND = 0.15;
const UNITS = ["light_sound", "idol", "street", "theme_park", "school_refusal", "piapro"];
const IDOL_EFFECT = 0.25;
const CN_RATIO = -0.5;
const WL_OFFSET = { 1: 0.5, 2: 0.9 };
const FINALE_OFFSET = 0.8;
const N_NORMAL = 48;

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function gauss(rand) {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function makeEvent({ region = "jp", eventId, start, hours, eventType = "marathon", group = "normal", wlTurn = null, isFinale = false, unit = null, banner = null, chapters = [] }) {
    return {
        region, eventId, name: `E${eventId}`, eventType,
        startAt: start, aggregateAt: start + hours * H, days: hours / 24,
        group, wlTurn, isFinale, chapters,
        unit, bannerCharacterId: banner, breakTimeId: null, autoSpecialMeasure: false, bonusRatio: null,
    };
}

function chaptersOf(start, count, hours, firstCharacter = 1) {
    return Array.from({ length: count }, (_, i) => ({
        chapterNo: i + 1,
        gameCharacterId: firstCharacter + i,
        startAt: start + i * hours * H,
        aggregateAt: start + (i + 1) * hours * H,
    }));
}

function logFinal(rank, start, hours) {
    return LEVEL[rank] + TREND * ((start - T0) / YEAR_MS) + Math.log(hours / 192);
}

/** 合成数据：日服 48 期普通活动（第 49 期起为测试用的新活动）、4 期 WL（两期）、1 期终章，国服同 id 普通活动晚一年，终榜 = 日服 × e^-0.5。 */
function buildDataset({ withCn = true, seed = 7 } = {}) {
    const rand = mulberry32(seed);
    const events = [];
    const finals = [];
    const put = (ev, scope, rank, y) => finals.push({ region: ev.region, eventId: ev.eventId, scope, rank, score: Math.round(Math.exp(y)), source: "synthetic" });
    for (let i = 1; i <= N_NORMAL; i++) {
        // 时长、团、封面角色的周期互质，三者可分辨
        const hours = i % 4 < 2 ? 192 : 216;
        const unit = UNITS[i % UNITS.length];
        const ev = makeEvent({ eventId: i, start: T0 + (i - 1) * 12 * D, hours, unit, banner: 1 + (i % 5) });
        events.push(ev);
        const noise = 0.04 * gauss(rand);
        for (const r of RANKS) put(ev, { kind: "overall" }, r, logFinal(r, ev.startAt, hours) + (unit === "idol" ? IDOL_EFFECT : 0) + noise + 0.01 * gauss(rand));
        if (withCn) {
            const cn = makeEvent({ region: "cn", eventId: i, start: ev.startAt + 365 * D, hours, unit, banner: ev.bannerCharacterId });
            events.push(cn);
            const cnNoise = 0.03 * gauss(rand);
            for (const r of RANKS) {
                const jp = finals.find((f) => f.region === "jp" && f.eventId === i && f.rank === r);
                put(cn, { kind: "overall" }, r, Math.log(jp.score) + CN_RATIO + cnNoise);
            }
        }
    }
    const wl = [
        { eventId: 201, turn: 1, at: 10 },
        { eventId: 202, turn: 1, at: 20 },
        { eventId: 203, turn: 1, at: 30 },
        { eventId: 204, turn: 2, at: 40 },
    ];
    for (const w of wl) {
        const start = T0 + w.at * 12 * D + 6 * D;
        const ev = makeEvent({ eventId: w.eventId, start, hours: 192, eventType: "world_bloom", group: "wl_overall", wlTurn: w.turn, unit: "light_sound", chapters: chaptersOf(start, 4, 48) });
        events.push(ev);
        const noise = 0.02 * gauss(rand);
        for (const r of RANKS) put(ev, { kind: "overall" }, r, logFinal(r, start, 192) + WL_OFFSET[w.turn] + noise);
    }
    const finaleStart = T0 + 44 * 12 * D + 6 * D;
    const finale = makeEvent({ eventId: 300, start: finaleStart, hours: 72, eventType: "world_bloom", group: "wl_finale", wlTurn: 2, isFinale: true });
    events.push(finale);
    for (const r of RANKS) put(finale, { kind: "overall" }, r, logFinal(r, finaleStart, 72) + FINALE_OFFSET);
    return { events, series: [], finals };
}

const DATA = buildDataset();
const SECTION = fitPrior(DATA);
const LAST_JP_START = T0 + (N_NORMAL - 1) * 12 * D;
const NEXT_START = LAST_JP_START + 12 * D;

function ctxFor(ev, jpSameIdFinal = null) {
    return contextFromDataset(ev, { kind: "overall" }, ev.startAt, [], jpSameIdFinal);
}

function nextNormal(overrides = {}) {
    return makeEvent({ eventId: 900, start: NEXT_START, hours: 192, unit: "street", banner: 3, ...overrides });
}

function medians(ctx, s = SECTION, ranks = RANKS) {
    return ranks.map((r) => finalPrior(ctx, r, s));
}

test("fitPrior 同步返回可序列化的 version 1 先验表", () => {
    assert.equal(typeof SECTION.then, "undefined");
    assert.equal(SECTION.version, 1);
    assert.ok(SECTION.regions.jp && SECTION.regions.cn, "两个区服都有先验");
    assert.ok(SECTION.cnRatio && SECTION.cnRatio.base.length === RANKS.length);
    assert.deepEqual(JSON.parse(JSON.stringify(SECTION)), SECTION);
    assert.deepEqual(SECTION.regions.jp.base.map((t) => t.rank), RANKS);
});

test("普通活动：还原水平与时间趋势，σ 为正且较小", () => {
    const ctx = ctxFor(nextNormal());
    for (const [i, est] of medians(ctx).entries()) {
        const r = RANKS[i];
        assert.ok(est, `T${r} 有先验`);
        assert.ok(Math.abs(Math.log(est.median) - logFinal(r, NEXT_START, 192)) < 0.06, `T${r} 水平`);
        assert.ok(est.logSigma >= 0.03 && est.logSigma < 0.15, `T${r} σ = ${est.logSigma}`);
    }
});

test("时长项：9 天比 8 天按拟合的 log 小时系数放大", () => {
    const short = medians(ctxFor(nextNormal()));
    const long = medians(ctxFor(nextNormal({ hours: 216 })));
    for (let i = 0; i < RANKS.length; i++) {
        const elasticity = Math.log(long[i].median / short[i].median) / Math.log(216 / 192);
        assert.ok(Math.abs(elasticity - 1) < 0.35, `T${RANKS[i]} 弹性 ${elasticity}`);
    }
    const flat = fitPrior(DATA, { days: "off" });
    const a = finalPrior(ctxFor(nextNormal()), 100, flat);
    const b = finalPrior(ctxFor(nextNormal({ hours: 216 })), 100, flat);
    assert.equal(a.median, b.median, "days=off 时与时长无关");
});

test("团效应：开启时 idol 高于其他团，关闭时两者相同", () => {
    const idol = finalPrior(ctxFor(nextNormal({ unit: "idol" })), 1000, SECTION);
    const street = finalPrior(ctxFor(nextNormal({ unit: "street" })), 1000, SECTION);
    assert.ok(Math.log(idol.median / street.median) > 0.1);
    const off = fitPrior(DATA, { unit: false, banner: false });
    const a = finalPrior(ctxFor(nextNormal({ unit: "idol" })), 1000, off);
    const b = finalPrior(ctxFor(nextNormal({ unit: "street" })), 1000, off);
    assert.equal(a.median, b.median);
    assert.deepEqual(off.regions.jp.base[0].unit, {});
});

test("训练期内的旧活动用完整分段趋势（节点项）", () => {
    const ev = DATA.events.find((e) => e.region === "jp" && e.eventId === 5);
    for (const r of RANKS) {
        const actual = DATA.finals.find((f) => f.region === "jp" && f.eventId === 5 && f.rank === r).score;
        const est = finalPrior(ctxFor(ev), r, SECTION);
        assert.ok(Math.abs(Math.log(est.median / actual)) < 0.12, `#5 T${r}`);
    }
});

test("档位单调不增；档位之间按 log(rank) 插值；范围外与非正档位为 null", () => {
    const contexts = [
        ctxFor(nextNormal()),
        ctxFor(makeEvent({ eventId: 205, start: NEXT_START, hours: 192, eventType: "world_bloom", group: "wl_overall", wlTurn: 2, unit: "light_sound", chapters: chaptersOf(NEXT_START, 4, 48) })),
        ctxFor(makeEvent({ eventId: 300, start: NEXT_START, hours: 72, eventType: "world_bloom", group: "wl_finale", wlTurn: 2, isFinale: true })),
        ctxFor(makeEvent({ region: "cn", eventId: 49, start: NEXT_START + 365 * D, hours: 192, unit: "street", banner: 3 })),
        ctxFor(makeEvent({ region: "cn", eventId: 49, start: NEXT_START + 365 * D, hours: 192, unit: "street", banner: 3 }), { 1: 9e8, 10: 5e8, 100: 1e8, 1000: 2e7, 10000: 5e6 }),
    ];
    const ranks = [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    for (const ctx of contexts) {
        const m = medians(ctx, SECTION, ranks).map((e) => e.median);
        for (let i = 1; i < m.length; i++) assert.ok(m[i] <= m[i - 1], `${ctx.region} #${ctx.eventId} T${ranks[i]}`);
        const m10 = finalPrior(ctx, 10, SECTION).median;
        const m100 = finalPrior(ctx, 100, SECTION).median;
        const m30 = finalPrior(ctx, 30, SECTION).median;
        const f = Math.log(3) / Math.log(10);
        assert.ok(Math.abs(Math.log(m30) - (Math.log(m10) + f * (Math.log(m100) - Math.log(m10)))) < 1e-9);
        assert.equal(finalPrior(ctx, 20000, SECTION), null);
        assert.equal(finalPrior(ctx, 0, SECTION), null);
        assert.equal(finalPrior(ctx, 0.5, SECTION), null);
    }
});

test("相邻档位倒挂时按精度加权合并（PAVA）", () => {
    const s = structuredClone(SECTION);
    const tiers = s.regions.jp.base;
    const [t1, t10] = tiers;
    const before = [t1.a, t10.a + 0.1 + (t1.a - t10.a)];
    t10.a = before[1];
    const ctx = ctxFor(nextNormal());
    const curve = priorCurve(ctx, s);
    assert.ok(Math.abs(curve[0].mu - curve[1].mu) < 1e-12, "T1 与 T10 合并为同一值");
    const lo = Math.min(...before) - 1;
    const hi = Math.max(...before) + 1;
    assert.ok(curve[0].mu > lo && curve[0].mu < hi);
    for (let i = 1; i < curve.length; i++) assert.ok(curve[i].mu <= curve[i - 1].mu);
    assert.ok(curve[0].sigma !== curve[1].sigma || t1.sigma === t10.sigma, "σ 按档保留");
});

test("小单元格按 n/(n+k) 向组收缩；没有数据的新一期只用组偏移，σ 更大", () => {
    const jp = SECTION.regions.jp;
    const k = SECTION.features.cellK;
    assert.equal(k, 2);
    const turn1 = jp.cells["jp|wl_overall|1|unit"];
    const turn2 = jp.cells["jp|wl_overall|2|unit"];
    assert.equal(turn1.nEvents, 3);
    assert.equal(turn2.nEvents, 1);
    assert.ok(Math.abs(turn1.weight - 3 / 5) < 1e-4 && Math.abs(turn2.weight - 1 / 3) < 1e-4);
    const group = jp.groups.wl_overall;
    const wlCtx = (turn, eventId) => ctxFor(makeEvent({ eventId, start: NEXT_START, hours: 192, eventType: "world_bloom", group: "wl_overall", wlTurn: turn, unit: "light_sound", chapters: chaptersOf(NEXT_START, 4, 48) }));
    const base = ctxFor(nextNormal({ unit: null, banner: null }));
    for (const r of RANKS) {
        const g = group.tiers.find((t) => t.rank === r).offset;
        const c2 = turn2.tiers.find((t) => t.rank === r).offset;
        // 组偏移约为 (3×0.5 + 0.9)/4 = 0.6，第二期自身 0.9，收缩后约 0.6 + (0.9 − 0.6)/3 = 0.7
        assert.ok(Math.abs(g - 0.6) < 0.05, `T${r} 组偏移 ${g}`);
        assert.ok(g + c2 > 0.6 && g + c2 < 0.9 && Math.abs(g + c2 - 0.7) < 0.06, `T${r} 第二期偏移 ${g + c2}`);
        const b = finalPrior(base, r, SECTION);
        const two = finalPrior(wlCtx(2, 206), r, SECTION);
        const three = finalPrior(wlCtx(3, 207), r, SECTION);
        assert.ok(Math.abs(Math.log(two.median / b.median) - (g + c2)) < 1e-4);
        assert.ok(Math.abs(Math.log(three.median / b.median) - g) < 1e-4, "第三期没有单元格，只用组偏移");
        assert.ok(three.logSigma > two.logSigma, "新单元格 σ 更大");
    }
    assert.equal(priorCellKey(wlCtx(3, 207)), "jp|wl_overall|3|unit");
    assert.equal(jp.cells["jp|wl_overall|3|unit"], undefined);
});

test("终章按活动 id 单列：已结算的一期复现终榜，新一期沿用终章组偏移并放宽 σ；σ 借自期数足够的组", () => {
    const jp = SECTION.regions.jp;
    const finale = jp.groups.wl_finale;
    assert.equal(finale.nEvents, 1);
    for (const t of finale.tiers) {
        const donor = jp.groups.wl_overall.tiers.find((x) => x.rank === t.rank);
        assert.ok(Math.abs(t.sigma - donor.sigma) < 1e-4, `T${t.rank} σ 借自 wl_overall`);
    }
    assert.equal(jp.cells["jp|wl_finale|2|#300"].nEvents, 1);
    const seen = ctxFor(DATA.events.find((e) => e.eventId === 300));
    const unseen = ctxFor(makeEvent({ eventId: 301, start: NEXT_START, hours: 72, eventType: "world_bloom", group: "wl_finale", wlTurn: 2, isFinale: true }));
    for (const r of RANKS) {
        const actual = DATA.finals.find((f) => f.eventId === 300 && f.rank === r).score;
        const a = finalPrior(seen, r, SECTION);
        assert.ok(Math.abs(Math.log(a.median / actual)) < 1e-3, `#300 T${r}`);
        const b = finalPrior(unseen, r, SECTION);
        assert.ok(b.logSigma > a.logSigma, `#301 T${r} σ 更大`);
        // 新一期终章整份沿用 #300 的水平：同一时点、同一时长下与 #300 的中位相同；方差 = σ² + se² + σ²/k，一期时 se = σ
        const t = finale.tiers.find((x) => x.rank === r);
        assert.ok(Math.abs(t.se - t.sigma) < 1e-4, `T${r} 一期组的 se = σ`);
        const again = finalPrior(ctxFor(makeEvent({ eventId: 301, start: seen.scopeStartAt, hours: 72, eventType: "world_bloom", group: "wl_finale", wlTurn: 2, isFinale: true })), r, SECTION);
        assert.ok(Math.abs(Math.log(again.median / a.median)) < 1e-9, `#301 T${r} 水平取自 #300`);
        const k = jp.cellK;
        assert.ok(Math.abs(b.logSigma ** 2 - (t.sigma ** 2 + t.se ** 2 + t.sigma ** 2 / k)) < 1e-9, `#301 T${r} 方差`);
    }
});

test("先验水平来源：cell / group / anchor / normal / none 与 priorCurve 的取值一致", () => {
    const seen = ctxFor(DATA.events.find((e) => e.eventId === 300));
    const unseen = ctxFor(makeEvent({ eventId: 301, start: NEXT_START, hours: 72, eventType: "world_bloom", group: "wl_finale", wlTurn: 3, isFinale: true }));
    assert.deepEqual(priorLevelSource(SECTION, seen), { kind: "cell", source: "jp", nEvents: 1 });
    assert.deepEqual(priorLevelSource(SECTION, unseen), { kind: "group", source: "jp", nEvents: 1 });
    assert.deepEqual(priorLevelSource(SECTION, ctxFor(nextNormal())), { kind: "normal" });
    const cnEv = makeEvent({ region: "cn", eventId: 49, start: NEXT_START + 365 * D, hours: 192 });
    assert.deepEqual(priorLevelSource(SECTION, ctxFor(cnEv, { 100: 1e8 })), { kind: "anchor" });
    assert.deepEqual(priorLevelSource(SECTION, ctxFor(cnEv)), { kind: "normal" });
    const chapterEv = makeEvent({ eventId: 208, start: NEXT_START, hours: 96, eventType: "world_bloom", group: "wl_chapter_48h", wlTurn: 3, chapters: chaptersOf(NEXT_START, 2, 48, 21) });
    assert.deepEqual(priorLevelSource(SECTION, contextFromDataset(chapterEv, { kind: "chapter", gameCharacterId: 21 }, NEXT_START, [], null)), { kind: "none" });
});

test("borrowedLevels：列出结算晚于 now、水平借自组偏移的范围及其来源活动", () => {
    const upcoming = makeEvent({ eventId: 301, start: NEXT_START, hours: 72, eventType: "world_bloom", group: "wl_finale", wlTurn: 3, isFinale: true });
    const data = { ...DATA, events: [...DATA.events, upcoming] };
    const list = borrowedLevels(SECTION, data, NEXT_START + H);
    assert.equal(list.length, 1, "已结算的活动都有自身单元格，普通活动不列");
    const [b] = list;
    assert.equal(b.region, "jp");
    assert.equal(b.eventId, 301);
    assert.equal(b.kind, "group");
    assert.equal(b.cell, "jp|wl_finale|3|#301");
    assert.deepEqual(b.sourceEvents, [300]);
    const k = SECTION.regions.jp.cellK;
    for (const t of b.tiers) assert.ok(Math.abs(t.logSigma / t.groupSigma - Math.sqrt(2 + 1 / k)) < 1e-3, `T${t.rank} σ/σ_组`);
    assert.deepEqual(borrowedLevels(SECTION, data, upcoming.aggregateAt), [], "结算后不再列出");
});

test("先验回测报告第 6 节：记录拟合时的水平来源，并单列组偏移只来自 1–2 期的点", async () => {
    // 第二期终章 #301 在 #300 结算后开始：拟合 #301 时终章组只有 #300 一期、#301 自身单元格没有数据
    const start = T0 + 46 * 12 * D + 6 * D;
    const second = makeEvent({ eventId: 301, start, hours: 72, eventType: "world_bloom", group: "wl_finale", wlTurn: 3, isFinale: true });
    const finals = RANKS.map((r) => ({ region: "jp", eventId: 301, scope: { kind: "overall" }, rank: r, score: Math.round(Math.exp(logFinal(r, start, 72) + FINALE_OFFSET + 0.1)), source: "synthetic" }));
    const data = { events: [...DATA.events, second], series: [], finals: [...DATA.finals, ...finals] };
    const { rows, levels } = await evaluatePrior({ data, candidates: [], log: () => {} });
    assert.deepEqual(levels.get(scopeRowKey("jp", 301, "overall")), { kind: "group", source: "jp", nEvents: 1 });
    assert.deepEqual(levels.get(scopeRowKey("jp", 300, "overall")), { kind: "none" }, "#300 拟合时终章组还没有样本，先验为 null");
    assert.ok(!rows.get("prior").some((r) => r.eventId === 300), "#300 没有先验预测");
    const md = renderPriorReport({ rows, section: fitPrior(data), generatedAt: new Date(start + 400 * D).toISOString(), events: data.events, data, levels });
    const sec6 = md.slice(md.indexOf("## 6."));
    assert.ok(sec6.includes("组偏移只来自 1–2 期"), sec6);
    assert.ok(sec6.includes("jp #301 · jp\\|wl_finale\\|3\\|#301"), sec6);
    assert.ok(md.includes("组偏移只来自 2 期（#300、#301）"), "第 4 节写出来源活动");
});

test("国服：有日服同 id 终榜时 = 日服终榜 × 拟合的国服/日服比例", () => {
    const ev = makeEvent({ region: "cn", eventId: 49, start: LAST_JP_START + 365 * D + 12 * D, hours: 192, unit: "street", banner: 3 });
    const jp = { 1: 9e8, 10: 5e8, 100: 1e8, 1000: 2e7, 10000: 5e6 };
    const anchored = medians(ctxFor(ev, jp));
    const doubled = medians(ctxFor(ev, Object.fromEntries(Object.entries(jp).map(([r, v]) => [r, 2 * v]))));
    for (const [i, est] of anchored.entries()) {
        const r = RANKS[i];
        assert.ok(Math.abs(Math.log(est.median / jp[r]) - CN_RATIO) < 0.05, `T${r} 比例 ${Math.log(est.median / jp[r])}`);
        assert.ok(Math.abs(doubled[i].median / est.median - 2) < 1e-9);
    }
    const own = medians(ctxFor(ev));
    assert.ok(own.every(Boolean), "没有日服终榜时用国服自身历史");
    assert.notEqual(own[2].median, anchored[2].median);
    const noRatio = fitPrior(DATA, { ratio: false });
    assert.equal(noRatio.cnRatio, null);
    assert.deepEqual(medians(ctxFor(ev, jp), noRatio), medians(ctxFor(ev), noRatio), "ratio=off 时忽略日服终榜");
    const jpCtx = { ...ctxFor(nextNormal()), jpSameIdFinal: jp };
    assert.deepEqual(medians(jpCtx), medians(ctxFor(nextNormal())), "日服不读 jpSameIdFinal");
});

test("组、区服没有样本时返回 null", () => {
    const chapterEv = makeEvent({ eventId: 208, start: NEXT_START, hours: 96, eventType: "world_bloom", group: "wl_chapter_48h", wlTurn: 3, chapters: chaptersOf(NEXT_START, 2, 48, 21) });
    const chapterCtx = contextFromDataset(chapterEv, { kind: "chapter", gameCharacterId: 21 }, NEXT_START, [], null);
    assert.equal(chapterCtx.group, "wl_chapter_48h");
    assert.deepEqual(medians(chapterCtx), RANKS.map(() => null));
    const jpOnly = fitPrior(buildDataset({ withCn: false }));
    assert.equal(jpOnly.regions.cn, undefined);
    assert.equal(jpOnly.cnRatio, null);
    const cnCtx = ctxFor(makeEvent({ region: "cn", eventId: 49, start: NEXT_START, hours: 192 }), { 1: 9e8, 10: 5e8 });
    assert.deepEqual(medians(cnCtx, jpOnly), RANKS.map(() => null));
    const empty = fitPrior({ events: [], series: [], finals: [] });
    assert.deepEqual(empty.regions, {});
    assert.equal(finalPrior(ctxFor(nextNormal()), 100, empty), null);
});

test("坏终榜（EXCLUDED_FINALS）不进拟合也不进回测", () => {
    const bad = makeEvent({ region: "cn", eventId: 176, start: T0, hours: 288 });
    const data = { events: [bad], series: [], finals: [{ region: "cn", eventId: 176, scope: { kind: "overall" }, rank: 100, score: 1e6, source: "rk" }] };
    assert.equal(collectSamples(data).length, 0);
    assert.equal(materializeFinals(data).finals.length, 0);
});

test("滚动回测（先验单独预测）：只用已结算的活动拟合，区间有序", () => {
    const mat = materializeFinals(DATA);
    assert.equal(mat.series.length, mat.finals.length);
    assert.ok(mat.series.every((s) => s.points.length === 1 && s.points[0][1] === 0));
    const m = priorModel("prior");
    const rows = rollingBacktest({ data: mat, fit: m.fit, predict: m.predict, cuts: PRIOR_CUTS, model: m.name, maxStaleMs: Infinity });
    assert.ok(rows.length > 0);
    assert.ok(!rows.some((r) => r.region === "jp" && r.eventId === 1), "第一期没有训练数据");
    for (const r of rows) assert.ok(r.p10 < r.p50 && r.p50 < r.p90, `${r.region} #${r.eventId} T${r.rank}`);
    const late = rows.filter((r) => r.region === "jp" && r.group === "normal" && r.eventId > 30);
    const male = late.reduce((a, r) => a + Math.abs(Math.log(r.p50 / r.actual)), 0) / late.length;
    assert.ok(male < 0.08, `后段普通活动 MALE ${male}`);
});

test("tori-v2 先验基线可载入并给出有序区间", async () => {
    const tori = await loadToriPrior();
    const ev = nextNormal();
    const out = tori.predict(null, ctxFor(ev), ev.startAt, [{ rank: 100 }, { rank: 1000 }], { event: ev });
    for (const q of out.values()) assert.ok(q.p50 > 0 && q.p10 <= q.p50 && q.p50 <= q.p90);
});

test("parseArgs：默认目录、参数与错误", () => {
    assert.deepEqual(parseArgs([]), { data: DEFAULT_DATA_DIR, out: DEFAULT_FIT_DIR, evaluate: false });
    assert.deepEqual(parseArgs(["--data", "a", "--out", "b", "--evaluate"]), { data: "a", out: "b", evaluate: true });
    assert.throws(() => parseArgs(["--out"]));
    assert.throws(() => parseArgs(["--bogus"]));
});

test("CLI：直接运行才写 prior.json，import 不执行", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prior-test-"));
    try {
        const imported = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(SCRIPT).href)});`], { encoding: "utf8" });
        assert.equal(imported.status, 0, imported.stderr);
        assert.equal(imported.stdout, "");
        const emptyData = path.join(dir, "data");
        fs.mkdirSync(emptyData);
        const out = path.join(dir, "fit");
        const run = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", SCRIPT, "--data", emptyData, "--out", out], { encoding: "utf8", cwd: WEB });
        assert.equal(run.status, 0, run.stderr);
        const section = JSON.parse(fs.readFileSync(path.join(out, "prior.json"), "utf8"));
        assert.equal(section.version, 1);
        assert.ok(section.regions.jp.base.length > 0);
        assert.ok(section.cnRatio.base.length > 0);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
