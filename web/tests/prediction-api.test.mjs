/**
 * 预测页的数据与走势图：prediction-api.ts（fetchPredictionData 的 rk 与 v2 两条路径）、
 * use-prediction-event.ts 的 WL 章节视图（按本章奖励档建行）与 K 线的轮询补取，已结束活动的 rk 重试，分档卡片的指数，
 * PredictionChart 的预测显示开关、PGAIChart 的空数据显示与 ActivityStats 的空指数显示，以及 rk 活动列表失败时的主数据兜底。
 * Run with: node --test --experimental-strip-types tests/prediction-api.test.mjs
 * 规则与主数据来自 tests/fixtures/event-rules（W6 的 masterdata 夹具），模型参数为提交的 priors.json；
 * 上游（rk、rks-n v2、metadata）全部用桩替换。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const SRC_URL = pathToFileURL(SRC_ROOT).href;
const CHART_URL = pathToFileURL(resolvePath(SRC_ROOT, "components/events/PredictionChart.tsx")).href;
const PGAI_URL = pathToFileURL(resolvePath(SRC_ROOT, "components/events/PGAIChart.tsx")).href;
const ACTIVITY_URL = pathToFileURL(resolvePath(SRC_ROOT, "components/events/ActivityStats.tsx")).href;

// 与 prediction-engine.test.mjs 相同的加载钩子：@/ 别名与无扩展名导入按 tsconfig 解析，src 下的 .ts 用 TypeScript
// 转译，不带 type 属性的 JSON 导入转成 ES 模块。.tsx 里只有 PredictionChart、PGAIChart 与 ActivityStats 按 JSX 转译，其余给空模块；
// 两个 React context 和 echarts-for-react 换成最小实现（后者记下传给图表的 option，供断言）。
const STUBS = {
  "@/contexts/I18nContext": "const t = (key) => key; const formatNumber = (n) => String(n); const api = { t, formatNumber }; export function useI18n() { return api; }",
  "@/contexts/ThemeContext": "const theme = { serverSource: 'jp' }; export function useTheme() { return theme; }",
  "echarts-for-react": "export default function ReactECharts(props) { globalThis.__predictionChartOption = props.option; return null; }",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBS[specifier]) return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
    let target = null;
    const withTsExtension = (path) => [`${path}.ts`, `${path}.tsx`, `${path}/index.ts`].find((c) => existsSync(c));
    if (specifier.startsWith("@/")) {
      target = resolvePath(SRC_ROOT, specifier.slice(2));
      if (!extname(target)) target = withTsExtension(target) ?? target;
    } else if (/^\.\.?\//.test(specifier) && !extname(specifier) && context.parentURL?.startsWith("file:")) {
      target = withTsExtension(resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)) ?? null;
    }
    return nextResolve(target ? pathToFileURL(target).href : specifier, context);
  },
  load(url, context, nextLoad) {
    const transpile = (jsx) => {
      const file = fileURLToPath(url);
      const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
        fileName: file,
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
      });
      return { format: "module", source: outputText, shortCircuit: true };
    };
    if (url === CHART_URL || url === PGAI_URL || url === ACTIVITY_URL) return transpile(true);
    if (url.startsWith("file:") && url.endsWith(".tsx")) return { format: "module", source: "export {};", shortCircuit: true };
    if (url.startsWith(SRC_URL) && url.endsWith(".ts")) return transpile(false);
    if (url.startsWith("file:") && url.endsWith(".json") && !url.includes("/node_modules/") && context.importAttributes?.type !== "json") {
      return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { EVENT_RULE_TABLES, resolveEventRules } = await import("../src/lib/event-rules/index.ts");
// 先在没有 window 时载入 ranking-sync：有 window 时它会在模块顶层打开 BroadcastChannel，端口让测试进程无法退出。
await import("../src/lib/ranking-sync.ts");
const api = await import("../src/lib/prediction-api.ts");
const live = await import("../src/lib/prediction/live-prediction.ts");

const HOUR = 3_600_000;
const FIXTURES = new URL("./fixtures/event-rules/", import.meta.url);
const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));

function loadMasterdata(region) {
  const masterdata = {};
  for (const table of EVENT_RULE_TABLES) {
    const url = new URL(`${region}/${table}.json`, FIXTURES);
    if (existsSync(url)) masterdata[table] = readJson(url);
  }
  return masterdata;
}

const MASTERDATA = { jp: loadMasterdata("jp"), cn: loadMasterdata("cn") };
const rulesOf = (region, eventId, scope = { kind: "overall" }) => resolveEventRules({ region, eventId, masterdata: MASTERDATA[region], scope });
const eventRow = (region, eventId) => MASTERDATA[region].events.find((e) => e.id === eventId);

const json = (body, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Routes every upstream request to canned bodies (masterdata from the fixtures); records the URLs. */
function stubFetch(routes) {
  const requested = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    const master = url.match(/\/(jp|cn)\/master\/(\w+)\.json/);
    if (master) {
      const rows = MASTERDATA[master[1]][master[2]] ?? (/^(eventStories|gameCharacterUnits)$/.test(master[2]) ? [] : null);
      return rows ? json(rows)() : json({}, 404)();
    }
    for (const [pattern, reply] of routes) if (pattern.test(url)) return reply();
    return json({ error: "not stubbed" }, 404)();
  };
  return requested;
}

/** Quantiles of consecutive rows (ascending rank) never increase: P10, P50 and P90 each. */
function assertMonotoneQuantiles(charts) {
  for (let i = 1; i < charts.length; i++) {
    const [a, b] = [charts[i - 1], charts[i]];
    for (const key of ["PredictedScoreP10", "PredictedScore", "PredictedScoreP90"]) {
      assert.ok(b[key] <= a[key], `${key}: T${b.Rank} ${b[key]} is above T${a.Rank} ${a[key]}`);
    }
  }
}

// ---------------------------------------------------------------------------
// R9-6：同一快照的各档历史都结束在快照时刻
// ---------------------------------------------------------------------------

// 日服 #218（WL3 终章）进行到 41.2 小时时 rks-n v2 的形状：latest 只有 T1–T100；tier-series 各档最后一点
// 早于 updated_at 的秒数各不相同（录制器 2026-09-27T04:04Z 的真实偏移：7–94 s），分数取同一时刻的真实量级。
const JP_218_START = eventRow("jp", 218).startAt;
const JP_218_END = eventRow("jp", 218).aggregateAt;
const JP_218_BORDERS = [[1, 143_896_395], [2, 142_860_910], [3, 142_670_330], [4, 142_065_290], [5, 141_549_805], [10, 140_297_465],
  [20, 138_872_295], [30, 138_259_290], [40, 137_403_115], [50, 136_005_160], [100, 133_398_580]];
const SERIES_END_OFFSET_S = { 1: 33, 10: 63, 20: 30, 30: 35, 40: 7, 50: 94, 100: 17 };

/** Score of any rank 1-100, interpolated in log(rank) between the recorded borders. */
function jp218ScoreAt(rank) {
  for (let i = 1; i < JP_218_BORDERS.length; i++) {
    const [r0, s0] = JP_218_BORDERS[i - 1];
    const [r1, s1] = JP_218_BORDERS[i];
    if (rank <= r1) return Math.round(s0 + (s1 - s0) * (Math.log(rank / r0) / Math.log(r1 / r0)));
  }
  return JP_218_BORDERS.at(-1)[1];
}

test("v2 fallback: tiers whose series end up to 60 s before the snapshot end on the snapshot, and quantiles stay monotone", async () => {
  const updatedAt = JP_218_START + Math.round(41.2 * HOUR);
  const rankings = Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, score: jp218ScoreAt(i + 1), userId: String(i + 1), name: "p" }));
  const series = {};
  for (const [rank, offsetS] of Object.entries(SERIES_END_OFFSET_S)) {
    const endT = updatedAt - offsetS * 1000;
    const final = jp218ScoreAt(Number(rank)) * (endT - JP_218_START) / (updatedAt - JP_218_START);
    const points = [];
    for (let t = JP_218_START + 120_000; t < endT; t += 15 * 60_000) points.push({ t, s: Math.round(final * (t - JP_218_START) / (endT - JP_218_START)) });
    points.push({ t: endT, s: Math.round(final) });
    series[rank] = points;
  }
  stubFetch([
    [/rk\.exmeaning\.com\/public\/event\/218\/latest/, json({ event_id: 218, status: "active", items: [] })],
    [/rk\.exmeaning\.com\/public\/event\/218\//, json({ error: "origin error" }, 525)],
    [/\/v2\/jp\/latest/, json({ event_id: 218, region: "jp", start_at: JP_218_START, end_at: JP_218_END, updated_at: updatedAt, is_event_aggregate: false, rankings })],
    [/\/v2\/jp\/tier-series/, json({ event_id: 218, region: "jp", updated_at: updatedAt + 7000, tiers: series })],
  ]);
  const data = await api.fetchPredictionData(218, "jp");
  const covered = rulesOf("jp", 218).rankingTiers.filter((rank) => rank <= 100);
  assert.deepEqual(data.data.charts.map((c) => c.Rank), covered);
  const snapshotIso = new Date(updatedAt).toISOString();
  for (const c of data.data.charts) {
    assert.deepEqual(c.HistoryPoints.at(-1), { t: snapshotIso, y: c.CurrentScore }, `T${c.Rank} history ends on the snapshot`);
    assert.ok(c.PredictedScoreP10 <= c.PredictedScore && c.PredictedScore <= c.PredictedScoreP90, `T${c.Rank}`);
  }
  // T1 ended 33 s early: its series point was moved, not duplicated.
  const t1 = data.data.charts.find((c) => c.Rank === 1);
  assert.equal(t1.HistoryPoints.filter((p) => new Date(p.t).getTime() > updatedAt - 60_000).length, 1);
  assertMonotoneQuantiles(data.data.charts);
  // The tier cards' index is rk's (the PGAI scale); a v2 snapshot has none, so every tier gets null.
  assert.deepEqual(data.data.tier_klines.map((k) => k.CurrentIndex), data.data.charts.map(() => null));
});

test("rk path: a timeline frame 30 s before the snapshot is moved onto it, like a tier the frame misses", async () => {
  // 日服 #217（普通活动）进行中：rk 的最后一帧比 latest 早 30 s，且 T20000 不在最后一帧里（只到上一小时）。
  const rules = rulesOf("jp", 217);
  const updatedAt = rules.scopeStartAt + 60 * HOUR + 24 * 60_000;
  const collect = new Date(updatedAt).toISOString();
  const ranks = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const score = (rank, h) => Math.round((90_000_000 / Math.sqrt(rank)) * h / 60.4);
  const items = ranks.map((rank) => ({ rank, score: score(rank, 60.4), prediction: null, collect_time: collect, is_final: false }));
  const frame = (atMs, ids) => ({ collect_time: new Date(atMs).toISOString(), items: ids.map((rank) => ({ rank, score: score(rank, (atMs - rules.scopeStartAt) / HOUR), prediction: null })) });
  const lastFrameAt = updatedAt - 30_000;
  const timeline = {
    event_id: 217, status: "active", granularity: 1, final_only: false,
    timeline: [frame(rules.scopeStartAt + 59 * HOUR, ranks), frame(lastFrameAt, ranks.filter((rank) => rank !== 20000))],
  };
  stubFetch([
    [/rk\.exmeaning\.com\/public\/event\/217\/latest/, json({ event_id: 217, status: "active", updated_at: collect, items })],
    [/rk\.exmeaning\.com\/public\/event\/217\/timeline/, json(timeline)],
    [/rk\.exmeaning\.com\/public\/event\/217\/kline/, json({ error: "origin error" }, 525)],
  ]);
  const data = await api.fetchPredictionData(217, "jp");
  assert.deepEqual(data.data.charts.map((c) => c.Rank), ranks);
  for (const c of data.data.charts) {
    assert.deepEqual(c.HistoryPoints.at(-1), { t: collect, y: c.CurrentScore }, `T${c.Rank} history ends on the snapshot`);
    assert.ok(!c.HistoryPoints.some((p) => p.t === new Date(lastFrameAt).toISOString()), `T${c.Rank} keeps no point 30 s before it`);
  }
  assertMonotoneQuantiles(data.data.charts);
});

// ---------------------------------------------------------------------------
// R10-6 / D6：WL 章节视图按本章奖励档建行，并按这些档请求章节 tier-series
// ---------------------------------------------------------------------------

test("chapterRowRanks: covered reward tiers only; every reward tier while the chapter has no data", async () => {
  const { chapterRowRanks } = await import("../src/lib/prediction/use-prediction-event.ts");
  const reward = [100, 200, 300, 4000, 7000, 20000, 100000];
  assert.deepEqual(chapterRowRanks(reward, [1, 2, 50, 100, 200, 4000, 20000], null), [100, 200, 4000, 20000]);
  assert.deepEqual(chapterRowRanks(reward, [100], { 300: [{ t: 1, s: 5 }], 7000: [], 100000: [{ t: 1, s: 2 }] }), [100, 300, 100000]);
  assert.deepEqual(chapterRowRanks(reward, [], { 100: [], 200: [] }), reward);
  assert.deepEqual(chapterRowRanks(reward, [1, 2, 3], null), reward);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function describeState(s) {
  if (!s) return "none";
  const charts = s.activePredictionData?.data.charts;
  return JSON.stringify({
    loading: s.loading, error: s.error, event: s.selectedEventId, chapter: s.selectedWlChapter, isWl: s.isWorldBloomEvent,
    chapters: s.eventWorldBlooms.map((c) => c.gameCharacterId), groups: s.worldLinkSnapshot?.groups?.length ?? null,
    rows: charts?.map((c) => c.Rank) ?? null,
  });
}

/** Mounts usePredictionEvent in jsdom; `latest()` is the newest hook state. */
async function mountHook(options) {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "http://localhost/zh-cn/prediction-next/" });
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { usePredictionEvent } = await import("../src/lib/prediction/use-prediction-event.ts");
  let state = null;
  const Probe = () => {
    state = usePredictionEvent(options);
    return null;
  };
  const root = createRoot(dom.window.document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(Probe)));
  const waitFor = async (cond, what, timeoutMs = 6000) => {
    const deadline = Date.now() + timeoutMs;
    while (!cond(state)) {
      if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}; state: ${describeState(state)}`);
      await React.act(async () => sleep(20));
    }
  };
  const settle = (promise) => React.act(async () => {
    await promise;
    await sleep(50);
  });
  const unmount = async () => {
    await React.act(async () => root.unmount());
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    dom.window.close();
  };
  return { latest: () => state, waitFor, settle, unmount };
}

// rk 活动列表按服务器缓存 10 分钟，所以同一文件的各个钩子测试共用这一份。
const rkEvent = (region, id, status, type = "world_bloom") => {
  const row = eventRow(region, id);
  return { event_id: id, name: row?.name ?? `#${id}`, start_at: row?.startAt ?? 1790600000000, end_at: row?.aggregateAt ?? 1791200000000, status, has_realtime_data: true, event_type: type };
};
const RK_EVENTS = {
  jp: [rkEvent("jp", 218, "active"), { ...rkEvent("jp", 219, "finished"), start_at: 1786000000000, end_at: 1786600000000 }, rkEvent("jp", 214, "finished")],
  cn: [rkEvent("cn", 180, "active"), rkEvent("cn", 112, "finished")],
};
/** Border ranks the v2 boards list after T1-T100 (CN serves these to T200000). */
const V2_BORDERS = [200, 300, 400, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000, 10000, 20000, 30000, 40000, 50000, 70000, 100000, 200000];
const boardEntries = (top) => [...Array.from({ length: 100 }, (_, i) => i + 1), ...V2_BORDERS]
  .map((rank) => ({ rank, score: Math.round(top / Math.sqrt(rank)), userId: String(rank), name: "p" }));

/** v2 worldlink-latest of a WL event: one group per chapter, each listing T1-T100 and the border ranks. */
function worldLinkLatest(region, eventId, chapters, top) {
  return {
    event_id: eventId, region, start_at: chapters[0].startAt, end_at: chapters.at(-1).endAt, updated_at: chapters.at(-1).endAt,
    groups: chapters.map((c, i) => ({
      event_id: eventId, region, start_at: c.startAt, end_at: c.endAt, updated_at: c.endAt,
      game_character_id: c.gameCharacterId, is_world_bloom_chapter_aggregate: false, rankings: boardEntries(top * (1 + i / 10)),
    })),
  };
}

function rkFinal(eventId, top) {
  const items = [100, 1000, 10000].map((rank) => ({ rank, score: Math.round(top / Math.sqrt(rank)), prediction: null, collect_time: "2026-09-20T11:59:42Z", is_final: true }));
  return { event_id: eventId, status: "finished", updated_at: "2026-09-20T11:59:42Z", items };
}

/** Mounts the hook on one WL chapter and returns its chapter rows and the last chapter tier-series request. */
async function chapterView(region, eventId, gameCharacterId, chapters, expectedRanks) {
  const v2 = `rks-n\\.exmeaning\\.com/api/public/v2/${region}`;
  const requested = stubFetch([
    [/rk\.exmeaning\.com\/public\/events/, json(RK_EVENTS[region])],
    [new RegExp(`rk\\.exmeaning\\.com/public/event/${eventId}/latest`), json(rkFinal(eventId, 3_000_000_000))],
    [new RegExp(`rk\\.exmeaning\\.com/public/event/${eventId}/timeline`), json({ event_id: eventId, status: "finished", granularity: 0, final_only: true, timeline: [] })],
    [new RegExp(`rk\\.exmeaning\\.com/public/event/${eventId}/kline`), json({ klines: [] })],
    [new RegExp(`${v2}/worldlink-latest`), json(worldLinkLatest(region, eventId, chapters, 2_000_000_000))],
    // Like the live API after a chapter: every requested tier, each with an empty series.
    [new RegExp(`${v2}/worldlink-tier-series`), () => {
      const url = new URL(requested.filter((u) => /worldlink-tier-series/.test(u)).at(-1));
      return json({ event_id: eventId, region, tiers: Object.fromEntries(url.searchParams.get("tiers").split(",").map((t) => [t, []])) })();
    }],
    [new RegExp(`${v2}/latest`), json({ error: "origin error" }, 522)],
  ]);
  const hook = await mountHook({ initialServer: region, initialEventId: eventId, initialChapter: gameCharacterId });
  try {
    const ranksOf = (s) => s.activePredictionData?.data.charts.map((c) => c.Rank) ?? [];
    const settled = (s) => !s.loading && s.eventWorldBlooms.length > 0 && ranksOf(s).join() === expectedRanks.join();
    const what = `${region} #${eventId} chapter ${gameCharacterId} rows ${expectedRanks.join(",")}`;
    await hook.waitFor(settled, what);
    // The rows must hold once the event's context source (its rules) has loaded, not only before.
    await hook.settle(live.loadPredictionContextSource(region, eventId));
    await hook.waitFor(settled, `${what} after the context source loaded`);
    const lastSeries = new URL(requested.filter((u) => /worldlink-tier-series/.test(u)).at(-1));
    return { state: hook.latest(), lastSeries };
  } finally {
    await hook.unmount();
  }
}

const chaptersOf = (region, eventId) => MASTERDATA[region].worldBlooms
  .filter((wb) => wb.eventId === eventId && wb.gameCharacterId > 0)
  .sort((a, b) => a.chapterNo - b.chapterNo)
  .map((wb) => ({ gameCharacterId: wb.gameCharacterId, startAt: wb.chapterStartAt, endAt: wb.aggregateAt }));

for (const [region, eventId, gameCharacterId, tierCount, lastTier] of [["jp", 214, 25, 18, 100_000], ["cn", 112, 18, 16, 50_000]]) {
  test(`chapter view ${region} #${eventId} (chapter ${gameCharacterId}): rows and tier-series follow the chapter's ${tierCount} reward tiers`, async () => {
    const reward = rulesOf(region, eventId, { kind: "chapter", gameCharacterId }).rankingTiers;
    assert.equal(reward.length, tierCount);
    assert.equal(reward.at(-1), lastTier);
    const { state, lastSeries } = await chapterView(region, eventId, gameCharacterId, chaptersOf(region, eventId), reward);
    const charts = state.activePredictionData.data.charts;
    const group = worldLinkLatest(region, eventId, chaptersOf(region, eventId), 2_000_000_000).groups.find((g) => g.game_character_id === gameCharacterId);
    for (const c of charts) assert.equal(c.CurrentScore, group.rankings.find((e) => e.rank === c.Rank).score, `T${c.Rank}`);
    assert.deepEqual(state.activePredictionData.data.tier_klines.map((k) => k.Rank), reward);
    assert.equal(lastSeries.searchParams.get("gameCharacterId"), String(gameCharacterId));
    assert.deepEqual(lastSeries.searchParams.get("tiers").split(",").map(Number), reward);
  });
}

test("chapter view without rules for the chapter (event not in masterdata yet): the page's 11 tiers", async () => {
  // 日服 #219：rk 列表里有这个 WL 活动，主数据还没有；章节来自 v2 快照的 group。
  const { PREDICTION_RANK_TIERS } = await import("../src/lib/prediction/use-prediction-event.ts");
  const chapters = [
    { gameCharacterId: 21, startAt: 1786000000000, endAt: 1786000000000 + 48 * HOUR },
    { gameCharacterId: 22, startAt: 1786000000000 + 48 * HOUR, endAt: 1786000000000 + 96 * HOUR },
  ];
  const { state, lastSeries } = await chapterView("jp", 219, 22, chapters, PREDICTION_RANK_TIERS);
  const source = await live.loadPredictionContextSource("jp", 219);
  assert.equal(source.rewardTiersFor({ kind: "chapter", gameCharacterId: 22 }), null);
  assert.deepEqual(state.activePredictionData.data.charts.map((c) => c.Rank), PREDICTION_RANK_TIERS);
  assert.deepEqual(lastSeries.searchParams.get("tiers").split(",").map(Number), PREDICTION_RANK_TIERS);
});

// ---------------------------------------------------------------------------
// R13-5 / D5：走势图的预测显示开关
// ---------------------------------------------------------------------------

test("PredictionChart: T20000+ shows the prediction only with showPredictionAtAllRanks; up to T10000 it always does", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: PredictionChart } = await import("../src/components/events/PredictionChart.tsx");
  const chart = (rank) => ({
    Rank: rank, CurrentScore: 400_000, PredictedScore: 900_000, PredictedScoreP10: 800_000, PredictedScoreP90: 1_000_000,
    HistoryPoints: [{ t: "2026-09-26T00:00:00.000Z", y: 0 }, { t: "2026-09-27T00:00:00.000Z", y: 400_000 }],
    PredictPoints: [{ t: "2026-09-28T00:00:00.000Z", y: 700_000 }, { t: "2026-09-29T00:00:00.000Z", y: 900_000 }],
  });
  const render = (props) => {
    globalThis.__predictionChartOption = null;
    const html = renderToStaticMarkup(React.createElement(PredictionChart, props));
    const option = globalThis.__predictionChartOption;
    return { html, series: option.series.map((s) => s.name), legend: option.legend.data };
  };
  const predicted = "page.prediction.chart.predictedScore";
  const shown = (r) => r.html.includes("80% CI: 800000 ~ 1000000") && r.html.includes("900000") && r.series.includes(predicted) && r.legend.includes(predicted);
  const hidden = (r) => !r.html.includes("80% CI") && !r.html.includes("900000") && !r.series.includes(predicted) && !r.legend.includes(predicted);

  // /prediction (default): T10000 and below only, as before.
  assert.ok(shown(render({ data: chart(10000) })), "T10000 default");
  assert.ok(hidden(render({ data: chart(20000) })), "T20000 default");
  // /prediction-next: every rank the page predicted.
  assert.ok(shown(render({ data: chart(20000), showPredictionAtAllRanks: true })), "T20000 all ranks");
  assert.ok(shown(render({ data: chart(100000), showPredictionAtAllRanks: true })), "T100000 all ranks");
  assert.ok(shown(render({ data: chart(1000), showPredictionAtAllRanks: true })), "T1000 all ranks");
});

test("only /prediction-next opts in to the prediction above T10000; /prediction keeps the default", () => {
  const src = (path) => readFileSync(new URL(`../src/app/${path}`, import.meta.url), "utf8");
  const uses = (text) => [...text.matchAll(/<PredictionChart\b[^>]*\/>/g)].map((m) => m[0]);
  assert.deepEqual(uses(src("prediction-next/client.tsx")).map((u) => /\bshowPredictionAtAllRanks\b/.test(u)), [true]);
  assert.deepEqual(uses(src("prediction/client.tsx")).map((u) => /\bshowPredictionAtAllRanks\b/.test(u)), [false]);
});

// ---------------------------------------------------------------------------
// PGAI：K 线的时间与空数据显示
// ---------------------------------------------------------------------------

// rk 的 kline 桶是北京时间的整点却带 Z：2026-09-28T10:48Z（北京 18:48）时两服的最后一桶都是 "2026-09-28T18:00:00Z"，
// 同一时刻国服 timeline 的最后一帧是 "2026-09-28T18:00:00+08:00"。数值取自日服 #218 当时的最后两桶。
const RK_KLINES = [
  { time_bucket: "2026-09-28T17:00:00Z", open: 9093, high: 12708, low: 8803, close: 10807, volume: 71_998_944 },
  { time_bucket: "2026-09-28T18:00:00Z", open: 10398, high: 11100, low: 8743, close: 8882, volume: 44_219_004 },
];
const KLINE_HOURS_UTC = ["2026-09-28T09:00:00.000Z", "2026-09-28T10:00:00.000Z"];
const klineHours = (data) => data.data.global_kline.map((k) => new Date(k.t).toISOString());

test("PGAI kline on the rk path: Beijing-hour buckets become the right instants, OHLC unchanged", async () => {
  const rules = rulesOf("jp", 217);
  const collect = new Date(rules.scopeStartAt + 30 * HOUR).toISOString();
  const items = [100, 1000].map((rank) => ({ rank, score: 50_000_000 / rank, prediction: null, collect_time: collect, is_final: false }));
  stubFetch([
    [/rk\.exmeaning\.com\/public\/event\/217\/latest/, json({ event_id: 217, status: "active", updated_at: collect, items })],
    [/rk\.exmeaning\.com\/public\/event\/217\/timeline/, json({ event_id: 217, status: "active", granularity: 1, final_only: false, timeline: [] })],
    [/rk\.exmeaning\.com\/public\/event\/217\/kline/, json({ event_id: 217, status: "active", klines: RK_KLINES, tier_speeds: [] })],
  ]);
  const data = await api.fetchPredictionData(217, "jp");
  assert.deepEqual(klineHours(data), KLINE_HOURS_UTC);
  assert.deepEqual(data.data.global_kline.map((k) => [k.o, k.h, k.l, k.c]), RK_KLINES.map((k) => [k.open, k.high, k.low, k.close]));
});

test("PGAI kline on the v2 fallback (rk lists #218 without tiers): the chart still gets rk's kline", async () => {
  const updatedAt = JP_218_START + 70 * HOUR;
  const rankings = Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, score: jp218ScoreAt(i + 1), userId: String(i + 1), name: "p" }));
  stubFetch([
    [/rk\.exmeaning\.com\/public\/event\/218\/latest/, json({ event_id: 218, status: "active", items: [] })],
    [/rk\.exmeaning\.com\/public\/event\/218\/kline/, json({ event_id: 218, status: "active", klines: RK_KLINES, tier_speeds: [] })],
    [/rk\.exmeaning\.com\/public\/event\/218\//, json({ event_id: 218, status: "active", granularity: 0, final_only: false, timeline: [] })],
    [/\/v2\/jp\/latest/, json({ event_id: 218, region: "jp", start_at: JP_218_START, end_at: JP_218_END, updated_at: updatedAt, is_event_aggregate: false, rankings })],
    [/\/v2\/jp\/tier-series/, json({ error: "origin error" }, 522)],
  ]);
  const data = await api.fetchPredictionData(218, "jp");
  assert.ok(data.data.charts.length > 0, "the v2 snapshot supplied the rows");
  assert.deepEqual(klineHours(data), KLINE_HOURS_UTC);
});

test("PGAI kline when rk's latest and timeline requests fail outright: the v2 fallback still gets rk's kline", async () => {
  // 国服 #178：latest 与 timeline 连接失败（与 3.5 s 超时中止一样是 reject），kline 正常返回。
  const row = eventRow("cn", 178);
  const rankings = Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, score: Math.round(40_000_000 / Math.sqrt(i + 1)), userId: String(i + 1), name: "p" }));
  const refused = () => { throw new TypeError("Failed to fetch"); };
  stubFetch([
    [/rk\.exmeaning\.com\/public\/event\/178\/kline/, json({ event_id: 178, status: "active", klines: RK_KLINES, tier_speeds: [] })],
    [/rk\.exmeaning\.com\/public\/event\/178\//, refused],
    [/\/v2\/cn\/latest/, json({ event_id: 178, region: "cn", start_at: row.startAt, end_at: row.aggregateAt, updated_at: row.startAt + 30 * HOUR, is_event_aggregate: false, rankings })],
    [/\/v2\/cn\/tier-series/, json({ error: "origin error" }, 522)],
  ]);
  const data = await api.fetchPredictionData(178, "cn");
  assert.ok(data.data.charts.length > 0, "the v2 snapshot supplied the rows");
  assert.deepEqual(klineHours(data), KLINE_HOURS_UTC);
});

test("PGAI kline that failed on the page load arrives with a later poll tick", async () => {
  // 国服 #180：首次加载时 kline 525，之后恢复；页面每 10 s 一次的轮询（这里缩成 50 ms）把 K 线补上。
  let klineCalls = 0;
  stubFetch([
    [/rk\.exmeaning\.com\/public\/events/, json(RK_EVENTS.cn)],
    [/rk\.exmeaning\.com\/public\/event\/180\/latest/, json(rkFinal(180, 3_000_000_000))],
    [/rk\.exmeaning\.com\/public\/event\/180\/timeline/, json({ event_id: 180, status: "finished", granularity: 0, final_only: true, timeline: [] })],
    [/rk\.exmeaning\.com\/public\/event\/180\/kline/, () => (++klineCalls === 1
      ? json({ error: "origin error" }, 525)
      : json({ event_id: 180, status: "active", klines: RK_KLINES, tier_speeds: [] }))()],
    [/\/v2\/cn\//, json({ error: "origin error" }, 522)],
  ]);
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = (fn, ms, ...rest) => realSetInterval(fn, ms === 10_000 ? 50 : ms, ...rest);
  try {
    const hook = await mountHook({ initialServer: "cn", initialEventId: 180 });
    try {
      await hook.waitFor((s) => s.activePredictionData?.data.global_kline.length === 2, "the kline from a poll tick");
      assert.equal(klineCalls, 2, "one failed load, one retry");
      assert.deepEqual(klineHours(hook.latest().activePredictionData), KLINE_HOURS_UTC);
      assert.ok(hook.latest().activePredictionData.data.charts.length > 0, "the rows stay");
    } finally {
      await hook.unmount();
    }
  } finally {
    globalThis.setInterval = realSetInterval;
  }
});

test("PGAIChart: without kline data it shows a dash and no change; with data, the last close and its change", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: PGAIChart } = await import("../src/components/events/PGAIChart.tsx");
  const render = (globalKline) => {
    globalThis.__predictionChartOption = null;
    const html = renderToStaticMarkup(React.createElement(PGAIChart, { globalKline }));
    return { html, option: globalThis.__predictionChartOption };
  };

  const empty = render([]);
  assert.ok(empty.html.includes("—"), empty.html);
  assert.ok(!/[▲▼]|\d%/.test(empty.html), `no change figure without data: ${empty.html}`);
  assert.equal(empty.option.title.text, "page.prediction.pgai.noKlineData");

  const points = RK_KLINES.map((k) => ({ t: k.time_bucket.replace(/Z$/, "+08:00"), o: k.open, c: k.close, l: k.low, h: k.high, v: k.volume }));
  const full = render(points);
  assert.ok(full.html.includes(">8882<"), full.html);
  // (8882 - 10807) / 10807 = -17.81 %
  assert.ok(full.html.includes("▼") && full.html.includes("17.81%"), full.html);
  assert.equal(full.option.series[0].data.length, 2);
});

// ---------------------------------------------------------------------------
// 已结束的活动：v2 只提供本服进行中的活动，rk 首次失败时再请求一次
// ---------------------------------------------------------------------------

const refusedReply = () => { throw new TypeError("Failed to fetch"); };

/** Replies with `first` to the first request and with `rest` to every later one; `calls()` counts the requests. */
function sequence(first, rest) {
  let n = 0;
  const reply = () => (++n === 1 ? first : rest)();
  reply.calls = () => n;
  return reply;
}

test("finished event: rk's latest answers 525 and v2 has no board for it, so rk is asked once more", async () => {
  // 国服 #180 结束后线上 6 次 latest 有 2 次 525；v2 只提供进行中的活动（404）。这里是国服 #179。
  const final = rkFinal(179, 3_000_000_000);
  const latest = sequence(json({ error: "origin error" }, 525), json(final));
  stubFetch([
    [/rk\.exmeaning\.com\/public\/event\/179\/latest/, latest],
    [/rk\.exmeaning\.com\/public\/event\/179\/timeline/, json({ event_id: 179, status: "finished", granularity: 0, final_only: true, timeline: [] })],
    [/rk\.exmeaning\.com\/public\/event\/179\/kline/, json({ klines: [] })],
    [/\/v2\/cn\/latest/, json({ error: "not found" }, 404)],
  ]);
  const data = await api.fetchPredictionData(179, "cn");
  assert.equal(latest.calls(), 2);
  assert.deepEqual(data.data.charts.map((c) => [c.Rank, c.CurrentScore]), final.items.map((i) => [i.rank, i.score]));
});

test("finished event: rk's latest and timeline fail outright and v2 serves another event; the retry goes on without the timeline", async () => {
  // 日服 #211 已结束：首次 latest 与 timeline 连接失败（与 3.5 s 超时中止一样是 reject），v2 是另一期（#214）的榜；
  // 第二次 latest 正常，timeline 仍失败，各档没有历史点。
  const final = rkFinal(211, 3_000_000_000);
  const latest = sequence(refusedReply, json(final));
  const other = eventRow("jp", 214);
  stubFetch([
    [/rk\.exmeaning\.com\/public\/event\/211\/latest/, latest],
    [/rk\.exmeaning\.com\/public\/event\/211\/timeline/, refusedReply],
    [/rk\.exmeaning\.com\/public\/event\/211\/kline/, json({ klines: [] })],
    [/\/v2\/jp\/latest/, json({ event_id: 214, region: "jp", start_at: other.startAt, end_at: other.aggregateAt, updated_at: other.startAt + 30 * HOUR, is_event_aggregate: false, rankings: boardEntries(2_000_000_000) })],
  ]);
  const data = await api.fetchPredictionData(211, "jp");
  assert.equal(latest.calls(), 2);
  assert.deepEqual(data.data.charts.map((c) => [c.Rank, c.CurrentScore]), final.items.map((i) => [i.rank, i.score]));
  for (const c of data.data.charts) assert.deepEqual(c.HistoryPoints, [], `T${c.Rank}`);
});

test("rk failing twice and v2 failing: the load rejects with the v2 error", async () => {
  const latest = sequence(json({ error: "origin error" }, 525), json({ error: "origin error" }, 525));
  stubFetch([
    [/rk\.exmeaning\.com\/public\/event\/205\/latest/, latest],
    [/rk\.exmeaning\.com\/public\/event\/205\//, json({ error: "origin error" }, 525)],
    [/\/v2\/jp\/latest/, json({ error: "origin error" }, 522)],
  ]);
  await assert.rejects(api.fetchPredictionData(205, "jp"), (err) => err.status === 522);
  assert.equal(latest.calls(), 2);
});

// ---------------------------------------------------------------------------
// 分档卡片（最活跃 / 最摸鱼）的指数：只取 rk kline 的 index_value（PGAI 的量级），没有时为 null
// ---------------------------------------------------------------------------

/** rk latest and timeline of a running JP marathon at hour 50, with frames at hours 49 and 50. */
function rkRunning(eventId) {
  const rules = rulesOf("jp", eventId);
  const at = (h) => rules.scopeStartAt + h * HOUR;
  const score = (rank, h) => Math.round((90_000_000 / Math.sqrt(rank)) * h / 50);
  const ranks = [100, 1000];
  const collect = new Date(at(50)).toISOString();
  const frame = (h) => ({ collect_time: new Date(at(h)).toISOString(), items: ranks.map((rank) => ({ rank, score: score(rank, h), prediction: null })) });
  return {
    latest: { event_id: eventId, status: "active", updated_at: collect, items: ranks.map((rank) => ({ rank, score: score(rank, 50), prediction: null, collect_time: collect, is_final: false })) },
    timeline: { event_id: eventId, status: "active", granularity: 1, final_only: false, timeline: [frame(49), frame(50)] },
    hourly: (rank) => score(rank, 50) - score(rank, 49),
    syncAt: (h) => ({ region: "jp", eventId, updatedAt: at(h), tierScores: Object.fromEntries(ranks.map((rank) => [rank, { rank, score: score(rank, h) }])), source: "prediction" }),
    contextFor: (tiers) => live.predictionContextFor(null, { kind: "overall" }, tiers, {
      region: "jp", eventId, eventType: "marathon", startAt: rules.scopeStartAt, endAt: rules.scopeAggregateAt, chapterCharacterId: null, chapterNo: null,
    }),
    rules,
  };
}

test("tier cards on the rk path: the index is rk's index_value; without rk's tier speeds it is null, and a live sync keeps it", async () => {
  const withSpeeds = rkRunning(197);
  stubFetch([
    [/rk\.exmeaning\.com\/public\/event\/197\/latest/, json(withSpeeds.latest)],
    [/rk\.exmeaning\.com\/public\/event\/197\/timeline/, json(withSpeeds.timeline)],
    [/rk\.exmeaning\.com\/public\/event\/197\/kline/, json({
      event_id: 197, status: "active", klines: [],
      tier_speeds: [{ rank: 100, speed_ph: 1_234_567, index_value: 6272 }, { rank: 1000, speed_ph: 345_678, index_value: 11216 }],
    })],
  ]);
  const indexed = await api.fetchPredictionData(197, "jp");
  const cards = (data) => data.data.tier_klines.map((k) => [k.Rank, k.CurrentIndex, k.Speed]);
  assert.deepEqual(cards(indexed), [[100, 6272, 1_234_567], [1000, 11216, 345_678]]);

  // 日服 #198：kline 525，分档卡片由 timeline 最后两帧算速度，指数为 null（不是该档分数）。
  const noSpeeds = rkRunning(198);
  stubFetch([
    [/rk\.exmeaning\.com\/public\/event\/198\/latest/, json(noSpeeds.latest)],
    [/rk\.exmeaning\.com\/public\/event\/198\/timeline/, json(noSpeeds.timeline)],
    [/rk\.exmeaning\.com\/public\/event\/198\/kline/, json({ error: "origin error" }, 525)],
  ]);
  const unindexed = await api.fetchPredictionData(198, "jp");
  assert.deepEqual(cards(unindexed), [[100, null, noSpeeds.hourly(100)], [1000, null, noSpeeds.hourly(1000)]]);

  // A live sync moves the scores; the index stays rk's (or null) instead of becoming the new score.
  const sync = (source, data) => live.applyLiveSyncToPrediction(data, source.syncAt(50.5), "jp", source.rules.scopeStartAt, source.rules.scopeAggregateAt, source.contextFor);
  const synced = sync(withSpeeds, indexed);
  assert.notDeepEqual(synced.data.charts.map((c) => c.CurrentScore), indexed.data.charts.map((c) => c.CurrentScore));
  assert.deepEqual(synced.data.tier_klines.map((k) => k.CurrentIndex), [6272, 11216]);
  assert.deepEqual(sync(noSpeeds, unindexed).data.tier_klines.map((k) => k.CurrentIndex), [null, null]);
});

test("ActivityStats: a tier without an index shows a dash; a tier with one shows the index", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: ActivityStats } = await import("../src/components/events/ActivityStats.tsx");
  const tiers = [
    { Rank: 100, Data: [], CurrentIndex: null, Speed: 1_234_567, ChangePct: 1.5 },
    { Rank: 1000, Data: [], CurrentIndex: 6272, Speed: 345_678, ChangePct: -0.5 },
  ];
  const html = renderToStaticMarkup(React.createElement(ActivityStats, { tiers }));
  assert.ok(html.includes('title="—">—<'), html);
  assert.ok(html.includes('title="6272">6272<'), html);
  assert.ok(!html.includes("null"), html);
});

// ---------------------------------------------------------------------------
// 活动列表：rk 的列表请求失败时，主数据兜底只列已开始的活动
// ---------------------------------------------------------------------------

/** Masterdata events.json rows relative to now; rk's event list answers `rkReply`, v2's latest answers `v2Reply`. */
function stubEventListFallback(region, rows, rkReply, v2Reply) {
  const requested = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.includes(`rk.exmeaning.com/public/events?region=${region}`)) return rkReply();
    if (url.includes(`/${region}/master/events.json`)) return json(rows)();
    if (url.includes(`/v2/${region}/latest`)) return v2Reply();
    return json({ error: "not stubbed" }, 404)();
  };
  return requested;
}

const DAY = 24 * HOUR;
/** Moves the clock past the 10-minute event list cache, which the hook tests above filled for both regions. */
const pastEventListCache = (t) => t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 11 * 60_000 });
const listedEvent = (id, startInDays, days) => {
  const startAt = Date.now() + startInDays * DAY;
  return { id, name: `event ${id}`, eventType: "marathon", startAt, aggregateAt: startAt + days * DAY };
};

test("event list fallback: rk's list answers 525, so masterdata lists only the events that have started", async (t) => {
  pastEventListCache(t);
  // 国服主数据比 rk 多列出约 20 期已公布未开始的活动（2026-09-29 时是 #181–#200，rk 列到 #180）；
  // 原样照搬时预测页默认选中 id 最大的 #200，它没有任何数据。v2 在两期之间没有榜（404）。
  const rows = [listedEvent(178, -20, 8), listedEvent(179, -11, 8), listedEvent(180, -5, 3), listedEvent(181, 3, 8), listedEvent(200, 150, 8)];
  const requested = stubEventListFallback("cn", rows, json({ error: "origin error" }, 525), json({ error: "not found" }, 404));
  const list = await api.fetchEventList("cn");
  assert.ok(requested.some((u) => u.includes("/cn/master/events.json")), requested.join("\n"));
  assert.deepEqual(list.map((e) => [e.id, e.is_active]), [[178, false], [179, false], [180, false]]);
});

test("event list fallback: an event v2 reports as running is listed even when masterdata's start is a minute ahead", async (t) => {
  pastEventListCache(t);
  // 日服 #219 刚开始，本机时钟慢了一点，主数据的 startAt 还在一分钟后；v2 已经是 #219 的榜。#220 未开始。
  const rows = [listedEvent(217, -12, 8), listedEvent(218, -6, 3), listedEvent(219, 1 / 1440, 8), listedEvent(220, 12, 8)];
  const running = rows[2];
  const v2 = json({ event_id: 219, region: "jp", start_at: running.startAt, end_at: running.aggregateAt, updated_at: Date.now(), is_event_aggregate: false, rankings: boardEntries(2_000_000) });
  stubEventListFallback("jp", rows, refusedReply, v2);
  const list = await api.fetchEventList("jp");
  assert.deepEqual(list.map((e) => [e.id, e.is_active]), [[217, false], [218, false], [219, true]]);
});
