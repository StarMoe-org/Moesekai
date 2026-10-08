/**
 * 冲榜规划器的组卡引擎口径实测（Node，不进构建）。
 *
 * 用真实 master data（与站点同源，jp + cn）+ 合成满配账号，直接调 wasm 引擎，实测：
 *   A. recommendMusic 返回的 PT 是否含火数倍率（对照 recommend 的 boost 0..10）
 *   B. Auto 1..10 火的 PT 与手动单人的对比
 *   C. 引擎是否建模自定义房间（option 键与 wasm 字符串）
 *   D. #180 Auto 特殊措施下限：队友参数 multi_live_teammate_power / score_up，
 *      以及「当期理论最高综合力」（满配账号在该活动下的最高综合力）
 * 然后对 src/lib/deck-recommend/planner-args.ts 做断言（含 worker 入参 → 引擎 options 全链路）。
 *
 * 使用方法: node --experimental-strip-types scripts/test-planner-deck.mjs
 *   ALLIUM_DECK_WASM_DIR=... 可指定本地 wasm 产物目录，默认用 public/wasm。
 */

import { existsSync, readFileSync } from 'fs';
import { registerHooks } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, extname, resolve } from 'path';

const webRoot = resolve(import.meta.dirname ?? '.', '..');
const srcRoot = resolve(webRoot, 'src');

// planner-args.ts 经 @/lib/account 引到站点模块（@/ 别名、无扩展名的相对导入），Node 需要解析钩子。
registerHooks({
    resolve(specifier, context, next) {
        let target = null;
        if (specifier.startsWith('@/')) {
            target = resolve(srcRoot, specifier.slice(2));
        } else if (/^\.\.?\//.test(specifier) && !extname(specifier) && context.parentURL?.startsWith('file:')) {
            target = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
        }
        if (target && !extname(target)) {
            target = [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find((c) => existsSync(c)) ?? target;
        }
        return next(target ? pathToFileURL(target).href : specifier, context);
    },
});
const load = (rel) => import(pathToFileURL(resolve(webRoot, rel)).href);
const artDir = resolve(process.env.ALLIUM_DECK_WASM_DIR || `${webRoot}/public/wasm`);
const MASTER_BASES = {
    jp: 'https://metadata.exmeaning.com/jp/master',
    cn: 'https://metadata.exmeaning.com/cn/master',
};
const MUSIC_META_URL = 'https://moe.exmeaning.com/data/music_meta/music_metas.json';

/** 与 src/lib/deck-recommend/data-provider.ts 的 PRELOAD_MASTER_KEYS 一致。 */
const PRELOAD_MASTER_KEYS = [
    'areaItems', 'areaItemLevels', 'cards', 'cardMysekaiCanvasBonuses', 'cardRarities',
    'characterRanks', 'cardEpisodes', 'events', 'eventCards',
    'eventRarityBonusRates', 'eventDeckBonuses', 'gameCharacters', 'worldBlooms',
    'gameCharacterUnits', 'honors', 'masterLessons', 'mysekaiGates',
    'mysekaiGateLevels', 'skills', 'worldBloomDifferentAttributeBonuses',
    'worldBloomSupportDeckBonuses', 'worldBloomSupportDeckBonusesWL1',
    'worldBloomSupportDeckBonusesWL2', 'worldBloomSupportDeckBonusesWL3',
    'worldBloomSupportDeckUnitEventLimitedBonuses',
];
/** 引擎可选表：与 data-provider 的完整可选表集合一致。 */
const OPTIONAL_MASTER_KEYS = [
    'eventCardBonusLimits', 'eventHonorBonuses', 'eventSkillScoreUpLimits',
    'eventShuffleUnitBonuses', 'eventMysekaiFixtureGameCharacterPerformanceBonusLimits',
];
/** WL 支援加成表站点从本地 /data/ 下发（data-provider.ts 的 LOCAL_MASTER_DATA_PATHS）。 */
const LOCAL_MASTER_KEYS = [
    'worldBloomSupportDeckBonusesWL1', 'worldBloomSupportDeckBonusesWL2', 'worldBloomSupportDeckBonusesWL3',
];
const WL3_SIM_EVENT_IDS = [3200001, 3200002, 3200003, 3200004, 3200005];

/** 官方 v4.0.0 火数倍率（0..10 火）。 */
const OFFICIAL_FIRE = [1, 5, 10, 15, 20, 25, 27, 29, 31, 33, 35];

const ALL_MAX = { disable: false, levelMax: true, episodeRead: true, masterMax: true, skillMax: true };
const ALL_MAX_RARITY = {
    rarity1Config: ALL_MAX, rarity2Config: ALL_MAX, rarity3Config: ALL_MAX,
    rarity4Config: ALL_MAX, rarityBirthdayConfig: ALL_MAX,
};

// ==================== 断言 ====================
let pass = 0;
const failures = [];
function check(name, ok, detail = '') {
    if (ok) {
        pass += 1;
        console.log(`   ✓ ${name}${detail ? ` — ${detail}` : ''}`);
    } else {
        failures.push(`${name}${detail ? `: ${detail}` : ''}`);
        console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

// ==================== 数据 ====================
async function fetchJson(url, attempts = 3) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            return await res.json();
        } catch (err) {
            lastErr = err;
            if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        }
    }
    throw new Error(`${lastErr?.message ?? lastErr} — ${url}`);
}

async function mapWithConcurrency(items, limit, fn) {
    const out = new Array(items.length);
    let cursor = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (cursor < items.length) {
                const i = cursor++;
                out[i] = await fn(items[i]);
            }
        }),
    );
    return out;
}

async function fetchMasterData(region) {
    const optional = new Set(OPTIONAL_MASTER_KEYS);
    const remote = [...PRELOAD_MASTER_KEYS, ...OPTIONAL_MASTER_KEYS].filter((key) => !LOCAL_MASTER_KEYS.includes(key));
    const entries = await mapWithConcurrency(remote, 4, async (key) => {
        try {
            return [key, await fetchJson(`${MASTER_BASES[region]}/${key}.json`)];
        } catch (err) {
            if (!optional.has(key)) throw err;
            console.warn(`   (${region} 可选表缺失，跳过) ${key}: ${err.message}`);
            return null;
        }
    });
    for (const key of LOCAL_MASTER_KEYS) {
        entries.push([key, JSON.parse(readFileSync(resolve(webRoot, 'public', 'data', `${key}.json`), 'utf8'))]);
    }
    return Object.fromEntries(entries.filter(Boolean));
}

/**
 * 满配账号：asOf 之前上线的全部 ★4 与生日卡（引擎按 ALL_MAX 配置满级/满破/满技能/读完剧情；
 * 满配时 ★3 及以下进不了最高综合力或最高 PT 卡组，去掉以缩短搜索），全部画布、全部称号满级；
 * 区域道具 / 角色等级 / 烤森门按 masterdata 上限，玩偶加成 10%（活动上限由引擎截断）。
 */
function buildMaxBox(master, asOf, applyUserDataOverrides) {
    const episodesByCard = new Map();
    for (const ep of master.cardEpisodes ?? []) {
        if (!episodesByCard.has(ep.cardId)) episodesByCard.set(ep.cardId, []);
        episodesByCard.get(ep.cardId).push({ cardEpisodeId: ep.id, scenarioStatus: 'already_read' });
    }
    const cards = master.cards.filter((card) => (card.releaseAt ?? 0) <= asOf
        && (card.cardRarityType === 'rarity_4' || card.cardRarityType === 'rarity_birthday'));
    const raw = {
        userGamedata: { userId: 1, name: 'planner-max-box', deck: 1, rank: 1 },
        userCards: cards.map((card) => ({
            cardId: card.id,
            level: 1,
            masterRank: 0,
            skillLevel: 1,
            specialTrainingStatus: 'done',
            defaultImage: 'special_training',
            episodes: episodesByCard.get(card.id) ?? [],
        })),
        userCharacters: master.gameCharacters.map((c) => ({ characterId: c.id, characterRank: 1 })),
        userAreas: [],
        userDecks: [],
        userHonors: master.honors.map((h) => ({
            honorId: h.id,
            level: Math.max(1, ...(h.levels ?? []).map((l) => l.level)),
        })),
        userChallengeLiveSoloDecks: [],
        userMysekaiCanvases: cards.map((card) => ({ cardId: card.id })),
        userMysekaiGates: [],
        userMysekaiFixtureGameCharacterPerformanceBonuses: [],
    };
    const user = applyUserDataOverrides(
        raw,
        { areaItemLevel: 999, characterRank: 999, mysekaiGateLevel: 999, mysekaiFixtureBonusRate: 100 },
        master,
    );
    return { user, cardCount: cards.length };
}

// ==================== 引擎 ====================
const mod = await import(pathToFileURL(`${artDir}/allium-deck.js`).href);
await mod.default(new Uint8Array(readFileSync(`${artDir}/allium-deck_bg.wasm`)));
const { applyUserDataOverrides } = await load('src/lib/deck-recommend/user-data-overrides.ts');
const planner = await load('src/lib/deck-recommend/planner-args.ts');
const { buildEngineOptions } = await load('src/lib/deck-recommend/engine-options.ts');
const { resolveEventRules } = await load('src/lib/event-rules/index.ts');
const { DEFAULT_GAP_SECONDS, playsPerHour } = await load('src/lib/goal-planner/core.ts');

function loadMaster(master, musicMetas) {
    const payload = {};
    for (const [name, rows] of Object.entries(master)) payload[`${name}.json`] = JSON.stringify(rows);
    mod.load_masterdata(JSON.stringify(payload), JSON.stringify(musicMetas));
}
const recommend = (options, handle) => JSON.parse(mod.recommendWithUserData(JSON.stringify(options), handle));
const recommendMusic = (options) => JSON.parse(mod.recommendMusic(JSON.stringify(options)));

/** engine-worker.ts 的 music 消息处理：MusicRequest → recommendMusic options。 */
function workerMusicOptions(music) {
    return {
        live_type: music.liveType,
        event_type: music.eventType,
        skill_order_choose_strategy: music.skillOrder ?? 'average',
        multi_live_teammate_score_up: music.teammates?.scoreUp,
        multi_live_teammate_power: music.teammates?.power,
        deck: {
            total_power: music.deck.totalPower,
            event_bonus_rate: music.deck.eventBonusRate,
            support_deck_bonus_rate: music.deck.supportDeckBonusRate,
            cards: music.deck.cards.map((c) => ({ skill_score_up: c.skillScoreUp, skill_life_recovery: c.skillLifeRecovery })),
        },
    };
}
/** engine-worker.ts 回给页面的 music 行（DeckMusicRow）。 */
const workerMusicRows = (raw) => raw.map((row) => ({
    musicId: row.music_id,
    difficulty: row.difficulty,
    liveScore: row.live_score,
    eventPoint: row.event_point ?? undefined,
}));

/** 与 engine-worker.ts 的 music 消息同构：卡组画像 → recommendMusic。 */
function musicOptions(deck, liveType, eventType, teammates) {
    return {
        live_type: liveType,
        event_type: eventType,
        skill_order_choose_strategy: 'average',
        multi_live_teammate_score_up: teammates?.scoreUp,
        multi_live_teammate_power: teammates?.power,
        deck: {
            total_power: deck.total_power,
            event_bonus_rate: deck.event_bonus_total ?? 0,
            support_deck_bonus_rate: 0,
            cards: deck.cards.map((c) => ({ skill_score_up: c.skill_score_up, skill_life_recovery: 0 })),
        },
    };
}
const musicRow = (rows, musicId, diff) => rows.find((r) => r.music_id === musicId && r.difficulty === diff);
const deckKey = (deck) => deck.cards.map((c) => c.card_id).join(',');

const MUSIC = { id: 74, diff: 'master' };
const musicMetas = await fetchJson(MUSIC_META_URL);
const facts = {};

async function measureRegion(region, normalEventId, finaleEventId) {
    console.log(`\n==== ${region.toUpperCase()} ====`);
    const master = await fetchMasterData(region);
    loadMaster(master, musicMetas);
    const events = new Map(master.events.map((e) => [e.id, e]));
    const normal = events.get(normalEventId);
    const finale = events.get(finaleEventId);
    console.log(`   master ${Object.keys(master).length} 张表；普通活动 #${normalEventId} ${normal?.eventType}，终章 #${finaleEventId} ${finale?.eventType}`);

    const base = { music_id: MUSIC.id, music_diff: MUSIC.diff, target: 'score', limit: 1, timeout_ms: 120_000, ...ALL_MAX_RARITY };

    // 普通活动：满配账号截至该活动结束。
    const normalBox = buildMaxBox(master, normal.aggregateAt, applyUserDataOverrides);
    const normalHandle = mod.create_user_data(JSON.stringify(normalBox.user), region);
    console.log(`   满配账号（截至 #${normalEventId} 结束）${normalBox.cardCount} 张卡`);

    // ---------- A. recommendMusic 与 boost ----------
    console.log(`A) recommendMusic 与 recommend boost 0..10（#${normalEventId}，music ${MUSIC.id} ${MUSIC.diff}）`);
    const boostTable = {};
    for (const liveType of ['solo', 'multi', 'auto']) {
        const pts = [];
        const decks = [];
        const d0 = recommend({ ...base, live_type: liveType, event_id: normalEventId, boost: 0 }, normalHandle).decks[0];
        pts.push(d0.event_point);
        decks.push(d0);
        // boost 1..10 固定为 boost 0 选出的卡组，只看火数对同一卡组 PT 的影响。
        const fixedCards = d0.cards.map((c) => c.card_id);
        for (let boost = 1; boost <= 10; boost++) {
            const r = recommend({ ...base, live_type: liveType, event_id: normalEventId, boost, fixedCards }, normalHandle);
            pts.push(r.decks[0].event_point);
            decks.push(r.decks[0]);
        }
        boostTable[liveType] = pts;
        const rows = recommendMusic(musicOptions(d0, liveType, normal.eventType));
        const row = musicRow(rows, MUSIC.id, MUSIC.diff);
        check(`${liveType}: 固定卡组后各火数的卡组与得分不变`, decks.every((d) => deckKey(d) === deckKey(d0) && d.live_score === d0.live_score));
        check(`${liveType}: recommendMusic 的 live_score 与 recommend 一致`, row.live_score === d0.live_score,
            `music=${row.live_score} deck=${d0.live_score}`);
        check(`${liveType}: recommendMusic 的 PT = recommend boost 0 的 PT（不含火数倍率）`, row.event_point === pts[0],
            `music=${row.event_point} boost0=${pts[0]}`);
        const ratios = pts.map((p) => p / pts[0]);
        check(`${liveType}: recommend PT = boost0 PT × 官方火数倍率（逐火精确相等）`,
            pts.every((p, b) => p === pts[0] * OFFICIAL_FIRE[b]), `倍率 ${ratios.join('/')}`);
        console.log(`      ${liveType} PT 0..10 火: ${pts.join(', ')}`);
    }
    facts.boost = facts.boost ?? {};
    facts.boost[region] = boostTable;

    // ---------- B. Auto 与手动单人 ----------
    console.log(`B) Auto 1..10 火 vs 手动单人（同卡组同曲）`);
    const ratio = boostTable.auto.map((p, b) => p / boostTable.solo[b]);
    for (let b = 1; b <= 10; b++) {
        console.log(`      ${String(b).padStart(2)} 火: auto ${boostTable.auto[b]}  solo ${boostTable.solo[b]}  auto/solo ${ratio[b].toFixed(3)}`);
    }
    check('Auto PT 低于同火数手动单人', boostTable.auto.every((p, b) => p < boostTable.solo[b]));
    facts.autoVsSolo = facts.autoVsSolo ?? {};
    facts.autoVsSolo[region] = ratio.slice(1).map((r) => Number(r.toFixed(3)));

    // ---------- C. 自定义房间 ----------
    if (region === 'jp') {
        console.log('C) 自定义房间');
        const plain = recommend({ ...base, live_type: 'multi', event_id: normalEventId }, normalHandle).decks[0];
        const extra = recommend({
            ...base, live_type: 'multi', event_id: normalEventId,
            custom_room: true, customRoom: true, room_type: 'custom', roomType: 'custom',
        }, normalHandle).decks[0];
        check('custom_room / customRoom / room_type 键不改变结果（引擎不认）',
            extra.event_point === plain.event_point && extra.live_score === plain.live_score,
            `pt ${plain.event_point} → ${extra.event_point}`);
        const text = readFileSync(`${artDir}/allium-deck_bg.wasm`).toString('latin1') + readFileSync(`${artDir}/allium-deck.js`, 'utf8');
        const hits = [...new Set(text.match(/[A-Za-z_]*[Rr]oom[A-Za-z_]*/g) ?? [])];
        check('wasm 与 glue 中没有任何 room 相关标识', hits.length === 0, hits.length ? hits.join(', ') : '0 处');
    }
    normalHandle.free();

    // ---------- D. 终章 Auto 下限 ----------
    console.log(`D) #${finaleEventId} Auto 特殊措施下限`);
    const finaleBox = buildMaxBox(master, finale.aggregateAt, applyUserDataOverrides);
    const finaleHandle = mod.create_user_data(JSON.stringify(finaleBox.user), region);
    console.log(`   满配账号（截至 #${finaleEventId} 结束）${finaleBox.cardCount} 张卡`);
    const powerDeck = recommend({ ...base, live_type: 'multi', event_id: finaleEventId, target: 'power' }, finaleHandle).decks[0];
    const noEventPower = recommend({ ...base, live_type: 'multi', target: 'power' }, finaleHandle).decks[0];
    console.log(`   理论最高综合力：#${finaleEventId} 下 ${powerDeck.total_power}，不带活动 ${noEventPower.total_power}`);
    let skillDeck = null;
    try {
        skillDeck = recommend({ ...base, live_type: 'multi', event_id: finaleEventId, target: 'skill' }, finaleHandle).decks[0];
        console.log(`   理论最高实效（#${finaleEventId} 技能上限下）${skillDeck.multi_live_score_up ?? skillDeck.skill_score}，技能 [${skillDeck.cards.map((c) => c.skill_score_up).join(', ')}]`);
    } catch (err) {
        console.log(`   target=skill 带活动不可用：${err}`);
    }
    const noEventSkill = recommend({ ...base, live_type: 'multi', target: 'skill' }, finaleHandle).decks[0];
    console.log(`   不带活动（无技能上限）最高实效 ${noEventSkill.multi_live_score_up ?? noEventSkill.skill_score}，技能 [${noEventSkill.cards.map((c) => c.skill_score_up).join(', ')}]`);
    const rules = resolveEventRules({ region, eventId: finaleEventId, masterdata: master });
    check(`#${finaleEventId} 规则：技能上限 140、无综合力上限`, rules.skillCap.value === 140 && rules.powerCap.value === null,
        `skillCap=${rules.skillCap.value} powerCap=${rules.powerCap.value}`);
    const teammates = planner.autoSpecialMeasureTeammates(rules);
    const skillAtCap = skillDeck ? (skillDeck.multi_live_score_up ?? skillDeck.skill_score) : null;
    check('autoSpecialMeasureTeammates 综合力 = 实测理论最高综合力', teammates.power === powerDeck.total_power,
        `${teammates.power} vs ${powerDeck.total_power}`);
    check('autoSpecialMeasureTeammates 实效 = 技能上限 × 1.8 = 实测上限下最高实效', teammates.scoreUp === skillAtCap,
        `${teammates.scoreUp} vs ${skillAtCap}`);
    const uncapped = planner.autoSpecialMeasureTeammates({ ...rules, skillCap: { ...rules.skillCap, value: null } });
    const noEventSkillValue = noEventSkill.multi_live_score_up ?? noEventSkill.skill_score;
    check('无技能上限时实效 = 实测无上限最高实效', uncapped.scoreUp === noEventSkillValue, `${uncapped.scoreUp} vs ${noEventSkillValue}`);
    const capped = planner.autoSpecialMeasureTeammates({ ...rules, powerCap: { value: 336_000, source: 'official' } });
    check('有综合力上限时队友综合力取上限', capped.power === 336_000, String(capped.power));

    const autoRun = recommend({ ...base, live_type: 'auto', event_id: finaleEventId, boost: 1 }, finaleHandle).decks[0];
    const multiRun = recommend({ ...base, live_type: 'multi', event_id: finaleEventId, boost: 1 }, finaleHandle).decks[0];
    const autoRows = recommendMusic(musicOptions(autoRun, 'auto', finale.eventType));
    const multiSelf = recommendMusic(musicOptions(autoRun, 'multi', finale.eventType));
    const multiMax = recommendMusic(musicOptions(autoRun, 'multi', finale.eventType, teammates));
    const multiMaxLowPower = recommendMusic(musicOptions(autoRun, 'multi', finale.eventType, { ...teammates, power: Math.round(teammates.power * 0.9) }));
    const pick = (rows) => musicRow(rows, MUSIC.id, MUSIC.diff);
    const a = pick(autoRows);
    const mSelf = pick(multiSelf);
    const mMax = pick(multiMax);
    const mLow = pick(multiMaxLowPower);
    console.log(`   Auto 卡组（boost 1 搜索）综合力 ${autoRun.total_power}，加成 ${autoRun.event_bonus_total}%`);
    console.log(`   同卡组 music ${MUSIC.id} ${MUSIC.diff}（不含火数）：auto ${a.event_point} PT / 分 ${a.live_score}；`
        + `协力（队友=自己）${mSelf.event_point} / ${mSelf.live_score}；协力（理论最高队友 ${teammates.power} / ${teammates.scoreUp}）${mMax.event_point} / ${mMax.live_score}`);
    console.log(`   队友综合力 −10% 时协力 PT ${mLow.event_point}（${((mLow.event_point / mMax.event_point - 1) * 100).toFixed(2)}%）`);
    check('recommend auto boost1 = recommendMusic auto × 5', autoRun.event_point === a.event_point * OFFICIAL_FIRE[1],
        `${autoRun.event_point} vs ${a.event_point}×5`);
    check('理论最高队友的协力 PT 高于 Auto PT（下限起作用）', mMax.event_point > a.event_point);
    check('理论最高队友的协力 PT 不低于队友=自己', mMax.event_point >= mSelf.event_point);
    check('协力搜索 boost1 与 recommendMusic 协力（队友=自己）× 5 一致', multiRun.event_point === pick(recommendMusic(musicOptions(multiRun, 'multi', finale.eventType))).event_point * 5);
    let teammateError = null;
    try {
        recommendMusic(musicOptions(autoRun, 'auto', finale.eventType, teammates));
    } catch (err) {
        teammateError = String(err);
    }
    check('recommendMusic 对非协力 live 传队友参数会报错', teammateError !== null, teammateError ?? '未报错');

    // ---------- 规划器入参全链路：PlannerDeckRequest → worker 入参 → 引擎 options → 引擎 ----------
    const allMaxConfig = Object.fromEntries(
        ['rarity_1', 'rarity_2', 'rarity_3', 'rarity_4', 'rarity_birthday'].map((k) => [k, ALL_MAX]),
    );
    // 已保存的组卡配置里的单次搜索约束（固定卡、target、队长、筛选）必须被规划器清掉，养成假设保留。
    const saved = planner.parseSavedDeckConfig(JSON.stringify({
        cardConfig: allMaxConfig, target: 'power', fixedCards: [autoRun.cards[0].card_id],
        leaderCharacterId: 1, unitFilter: 'light_sound', simulateEnabled: true, timeoutSeconds: '120',
    }));
    const plannerReq = {
        server: region, userId: ' 1 ', eventId: finaleEventId, eventType: finale.eventType,
        liveType: 'auto', musicId: MUSIC.id, difficulty: MUSIC.diff, boost: 1, limit: 1,
    };
    const args = planner.buildPlannerWorkerArgs(plannerReq, saved);
    check('规划器 worker 入参：活动模式、本期活动、live 类型、曲目、火数、条数',
        args.mode === 'event' && args.eventId === finaleEventId && args.liveType === 'auto' && args.musicId === MUSIC.id
        && args.difficulty === MUSIC.diff && args.boost === 1 && args.limit === 1 && args.userId === '1',
        JSON.stringify({ mode: args.mode, eventId: args.eventId, liveType: args.liveType, boost: args.boost, limit: args.limit }));
    check('规划器 worker 入参：清掉已保存的搜索约束、保留养成假设',
        args.target === 'score' && args.fixedCards === undefined && args.leaderCharacterId === undefined
        && !args.unitFilter && args.simulatedEvent === undefined && args.cardConfig.rarity_4.masterMax === true);
    const options = buildEngineOptions(args, { eventRows: master.events, worldBloomRows: master.worldBlooms ?? [], wl3SimulationEventIds: WL3_SIM_EVENT_IDS });
    const plannerRun = recommend(options, finaleHandle).decks[0];
    check('规划器链路搜出的 Auto 卡组与直接调用引擎一致（PT 含火数）',
        deckKey(plannerRun) === deckKey(autoRun) && plannerRun.event_point === autoRun.event_point,
        `${plannerRun.event_point} vs ${autoRun.event_point}`);

    // ---------- 规划器歌曲收益：PlannerSongGainRequest → worker music 消息 → buildSongGainRows ----------
    const profile = {
        totalPower: autoRun.total_power,
        eventBonusRate: autoRun.event_bonus_total,
        skillScoreUps: autoRun.cards.map((c) => c.skill_score_up),
    };
    const gainReq = { server: region, eventId: finaleEventId, eventType: finale.eventType, liveType: 'auto', boost: 1, profile, teammates };
    const autoMusicReq = planner.buildPlannerMusicRequest(gainReq, 1);
    check('非协力 live 的 music 请求不带队友参数', autoMusicReq.teammates === undefined);
    const lowerBoundReq = planner.buildPlannerMusicRequest({ ...gainReq, liveType: 'multi' }, 2);
    const lowerBoundRow = pick(recommendMusic(workerMusicOptions(lowerBoundReq)));
    check('Auto 下限的 music 请求（multi + 理论最高队友）与直接调用一致', lowerBoundRow.event_point === mMax.event_point,
        `${lowerBoundRow.event_point} vs ${mMax.event_point}`);
    const musics = await fetchJson(`${MASTER_BASES[region]}/musics.json`);
    const catalog = planner.buildSongGainCatalog(musics, musicMetas, finale.aggregateAt);
    const gainRows = planner.buildSongGainRows(workerMusicRows(recommendMusic(workerMusicOptions(autoMusicReq))), catalog, gainReq);
    const gain74 = gainRows.find((r) => r.musicId === MUSIC.id && r.difficulty === MUSIC.diff);
    const seconds74 = musicMetas.find((m) => m.music_id === MUSIC.id && m.difficulty === MUSIC.diff).music_time;
    check('歌曲收益：ptPerPlayNoBoost = recommendMusic PT，ptPerPlay = recommend boost 1 PT',
        gain74?.ptPerPlayNoBoost === a.event_point && gain74?.ptPerPlay === autoRun.event_point,
        `${gain74?.ptPerPlayNoBoost} / ${gain74?.ptPerPlay} vs ${a.event_point} / ${autoRun.event_point}`);
    check('歌曲收益：每小时场次按曲长 + auto 默认间隔，每体力 PT = 每场 PT / 火数',
        gain74?.seconds === seconds74 && gain74?.playsPerHour === playsPerHour(seconds74, DEFAULT_GAP_SECONDS.auto)
        && gain74?.ptPerHour === gain74?.ptPerPlay * gain74?.playsPerHour && gain74?.ptPerStamina === gain74?.ptPerPlay,
        `${seconds74}s, ${gain74?.playsPerHour?.toFixed(2)} 场/时`);
    const released = musics.filter((m) => (m.publishedAt ?? 0) <= finale.aggregateAt).length;
    check('歌曲收益行只含截至活动时已上线的曲子，且每行倍率一致',
        gainRows.length > 0 && new Set(gainRows.map((r) => r.musicId)).size <= released
        && gainRows.every((r) => r.ptPerPlay === r.ptPerPlayNoBoost * OFFICIAL_FIRE[1]),
        `${gainRows.length} 行，${released} 首已上线`);
    facts.finale = facts.finale ?? {};
    facts.finale[region] = {
        eventId: finaleEventId,
        aggregateAt: finale.aggregateAt,
        maxBoxCards: finaleBox.cardCount,
        theoreticalMaxPower: powerDeck.total_power,
        noEventMaxPower: noEventPower.total_power,
        maxEffectiveSkill: skillDeck ? (skillDeck.multi_live_score_up ?? skillDeck.skill_score) : null,
        noEventMaxEffectiveSkill: noEventSkill.multi_live_score_up ?? noEventSkill.skill_score,
        autoPt: a.event_point,
        multiSelfPt: mSelf.event_point,
        multiMaxTeammatesPt: mMax.event_point,
        multiMaxTeammatesPtPower90: mLow.event_point,
    };
    finaleHandle.free();
    return master;
}

await measureRegion('jp', 217, 180);
await measureRegion('cn', 178, 180);

// ==================== E. planner-args 纯函数 ====================
console.log('\n==== E) planner-args ====');
{
    // 账号：与组卡页同一套存储键与账号列表回退。
    const store = new Map();
    globalThis.window = globalThis;
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
    const account = (entries) => {
        store.clear();
        store.set('moesekai_accounts', '[]');
        for (const [k, v] of Object.entries(entries)) store.set(k, v);
        return planner.readPlannerAccount();
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const U = planner.DECK_USER_ID_STORAGE_KEY;
    const S = planner.DECK_SERVER_STORAGE_KEY;
    check('存储键与组卡页一致', U === 'deck_recommend_userid' && S === 'deck_recommend_server'
        && planner.DECK_SAVED_CONFIG_KEY === 'deck_recommend_saved_config_v2');
    check('读组卡页保存的服务器与 ID（去空白）', same(account({ [S]: 'cn', [U]: ' 42 ' }), { server: 'cn', userId: '42' }));
    check('只存了 ID 时按组卡页默认服务器 jp', same(account({ [U]: '7' }), { server: 'jp', userId: '7' }));
    check('存的服务器无效时同样回到 jp', same(account({ [S]: 'xx', [U]: '3' }), { server: 'jp', userId: '3' }));
    check('规划器不支持的服务器返回 null', account({ [S]: 'tw', [U]: '9' }) === null);
    check('没有组卡页记录时取账号列表第一个',
        same(account({ moesekai_accounts: JSON.stringify([{ id: 'a', gameId: '555', server: 'cn' }, { id: 'b', gameId: '1', server: 'jp' }]) }),
            { server: 'cn', userId: '555' }));
    check('什么都没有时返回 null', account({}) === null);
    delete globalThis.localStorage;
    delete globalThis.window;

    // 已保存配置：坏 JSON 与缺失返回 null，稀有度配置按默认补齐。
    const parsed = planner.parseSavedDeckConfig(JSON.stringify({ cardConfig: { rarity_4: ALL_MAX }, liveType: 'solo' }));
    check('已保存配置：缺的稀有度按默认补齐',
        parsed.cardConfig.rarity_4.masterMax === true && parsed.cardConfig.rarity_1.masterMax === false && parsed.liveType === 'solo');
    check('已保存配置：缺失或损坏返回 null', planner.parseSavedDeckConfig(null) === null && planner.parseSavedDeckConfig('{') === null);
    const noSaved = planner.buildPlannerWorkerArgs({
        server: 'jp', userId: '1', eventId: 217, eventType: 'marathon', liveType: 'multi', musicId: 74, difficulty: 'master', boost: 0,
    }, null);
    check('无已保存配置：默认条数 5、boost 0 照发、非 WL 不带应援角色',
        noSaved.limit === 5 && noSaved.boost === 0 && noSaved.supportCharacterId === undefined && noSaved.target === 'score');

    // DeckMusicRequest 与 engine-worker.ts 的 MusicRequest 字段一致（worker 静默丢弃未知字段）。
    const fieldsOf = (text, name) => {
        const body = text.match(new RegExp(`interface ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
        return [...body.matchAll(/(\w+)\??:/g)].map((m) => m[1]).sort().join(',');
    };
    const workerFields = fieldsOf(readFileSync(resolve(srcRoot, 'lib/deck-recommend/engine-worker.ts'), 'utf8'), 'MusicRequest');
    const plannerFields = fieldsOf(readFileSync(resolve(srcRoot, 'lib/deck-recommend/planner-args.ts'), 'utf8'), 'DeckMusicRequest');
    check('DeckMusicRequest 字段与 worker MusicRequest 一致', workerFields !== '' && workerFields === plannerFields,
        `${plannerFields} vs ${workerFields}`);
}

console.log('\n==== 实测汇总 ====');
console.log(JSON.stringify(facts, null, 2));

console.log(`\n${pass} 项通过，${failures.length} 项失败`);
if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
}
