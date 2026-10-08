/**
 * 组卡引擎全量参数验证（Node，不进构建）。
 *
 * 两个目标：
 *   A. 实际生效：对页面可发送的每一个引擎参数，用同一基线跑两遍
 *      （无参数 vs 带参数），断言结果出现预期差异。
 *   B. 实际传入：静态对照 engine-worker.ts 发出的 option 键与本测试
 *      矩阵的键集合，防止参数在某次改动里被丢掉。
 *
 * 使用方法: node scripts/test-deck-engine-params.mjs
 *   ALLIUM_DECK_WASM_DIR=... 可指定本地 wasm 产物目录，默认 public/wasm。
 */

import { existsSync, readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const webRoot = resolve(import.meta.dirname ?? '.', '..');
const artDir = resolve(process.env.ALLIUM_DECK_WASM_DIR || `${webRoot}/public/wasm`);
// public/wasm 下是改名后的 allium-deck.*；wasm-pack 产物与 npm 包是原名 allium_deck.*。
const artBase = existsSync(`${artDir}/allium-deck.js`) ? 'allium-deck' : 'allium_deck';
const MASTER_BASE = 'https://metadata.exmeaning.com/jp/master';
const MUSIC_META_URL = 'https://moe.exmeaning.com/data/music_meta/music_metas.json';
const SUITE = 'https://suite-api.haruki.seiunx.com/public';
const UID = '21906891722772489'; // JP 实账号（排行榜公开数据）

const PRELOAD_MASTER_KEYS = [
    'areaItems', 'areaItemLevels', 'cards', 'cardMysekaiCanvasBonuses', 'cardRarities',
    'characterRanks', 'cardEpisodes', 'events', 'eventCards',
    'eventRarityBonusRates', 'eventDeckBonuses', 'gameCharacters',
    'gameCharacterUnits', 'honors', 'masterLessons', 'mysekaiGates',
    'mysekaiGateLevels', 'skills', 'worldBloomDifferentAttributeBonuses',
    'worldBloomSupportDeckBonuses', 'worldBloomSupportDeckUnitEventLimitedBonuses',
    'eventCardBonusLimits', 'eventHonorBonuses', 'eventSkillScoreUpLimits', 'eventShuffleUnitBonuses',
    'eventMysekaiFixtureGameCharacterPerformanceBonusLimits',
];
const LOCAL_MASTER_KEYS = ['worldBloomSupportDeckBonusesWL1', 'worldBloomSupportDeckBonusesWL2', 'worldBloomSupportDeckBonusesWL3'];
const USER_KEYS = ['userCards','userBonds','userDecks','userGamedata','userMusics','userMusicResults',
 'userMysekaiMaterials','userAreas','userChallengeLiveSoloDecks','userCharacters',
 'userCharacterMissionV2Statuses','userMysekaiCanvases','userCharacterMissionV2s',
 'userMysekaiFixtureGameCharacterPerformanceBonuses','userMysekaiGates','userWorldBloomSupportDecks',
 'userHonors','userMysekaiCharacterTalks','userChallengeLiveSoloResults','userChallengeLiveSoloStages',
 'userChallengeLiveSoloHighScoreRewards','userEvents','userWorldBlooms','userMusicAchievements',
 'userPlayerFrames','userMaterials','upload_time'];

const ALL_RARITY_DEFAULTS = {
    rarity1Config: { disable: false, levelMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity2Config: { disable: false, levelMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity3Config: { disable: false, levelMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity4Config: { disable: false, levelMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarityBirthdayConfig: { disable: false, levelMax: true, episodeRead: true, masterMax: false, skillMax: false },
};

const BASE_EVENT = {
    region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master',
    event_id: 215, target: 'score', limit: 3, timeout_ms: 60_000,
    ...ALL_RARITY_DEFAULTS,
};

/** 模拟活动基线：与 BASE_EVENT 同口径，但刻意不带 event_id。 */
const SIM_BASE = {
    region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master',
    target: 'score', limit: 3, timeout_ms: 60_000,
    ...ALL_RARITY_DEFAULTS,
};

const BASE_MUSIC_DECK = (deck) => ({
    total_power: deck.total_power,
    event_bonus_rate: deck.event_bonus_total ?? 0,
    support_deck_bonus_rate: 0,
    cards: deck.cards.map((c) => ({ skill_score_up: c.skill_score_up, skill_life_recovery: 0 })),
});

/** 参数矩阵：base 为基线 options，patch 覆盖后必须产生预期差异。 */
function buildMatrix(mod, decks, ctx) {
    const deck0 = decks[0];
    const topCard = deck0.cards[0].card_id;
    const secondCard = deck0.cards[1].card_id;
    // 固定住基线里本来占队长位的那张卡，再把队长指定给队尾角色。
    // 这样「指定队长没生效」会直接暴露成队长位仍是固定卡。
    const otherCharCard = deck0.cards[0].card_id;
    const leaderChar = deck0.cards[deck0.cards.length - 1].character_id;
    const { basePoolSize, baseWlBonus } = ctx;
    return [
        {
            name: 'fixedCards',
            base: BASE_EVENT, patch: { fixedCards: [topCard, secondCard] },
            assert: (r) => r.decks.every((d) => d.cards.some((c) => c.card_id === topCard) && d.cards.some((c) => c.card_id === secondCard)),
            expect: `每个卡组都包含固定卡 ${topCard}/${secondCard}`,
        },
        {
            name: 'excludedCards',
            base: BASE_EVENT, patch: { excludedCards: [topCard] },
            assert: (r) => r.decks.every((d) => d.cards.every((c) => c.card_id !== topCard)),
            expect: `排除卡 ${topCard} 不再出现`,
        },
        {
            name: 'fixedCharacters',
            base: BASE_EVENT, patch: { fixedCharacters: [1] },
            assert: (r) => r.decks.every((d) => d.cards.some((c) => c.character_id === 1)),
            expect: '每个卡组都包含角色 1 的卡',
        },
        {
            name: 'rarityConfig.levelMax',
            base: BASE_EVENT, patch: { rarity4Config: { disable: false, levelMax: false, episodeRead: false, masterMax: false, skillMax: false } },
            assert: (r) => r.decks.length > 0 && r.decks[0].total_power <= deck0.total_power,
            expect: '4 星不按满级/满破/剧情计算，综合力不升',
        },
        {
            name: 'singleCardConfigs',
            base: { ...BASE_EVENT, fixedCards: [topCard] },
            patch: { singleCardConfigs: [{ cardId: topCard, config: { level: 1 } }] },
            assert: (r) => r.decks[0].total_power < deck0.total_power,
            expect: '单卡覆盖把固定卡降到 Lv.1，综合力下降',
        },
        {
            name: 'unitFilter',
            base: BASE_EVENT, patch: { unitFilter: 'idol' },
            assert: (r) => r.performance.pool_size < 1e9 && r.decks.length > 0 && r.performance.pool_size < basePoolSize,
            expect: '团过滤缩小候选池',
            },
        {
            name: 'attrFilter',
            base: BASE_EVENT, patch: { attrFilter: 'cool' },
            assert: (r) => r.decks.length > 0 && r.performance.pool_size < basePoolSize,
            expect: '属性过滤缩小候选池',
        },
        {
            name: 'multiLiveTeammateScoreUp',
            base: BASE_EVENT, patch: { multiLiveTeammateScoreUp: 400 },
            assert: (r) => r.decks[0].live_score > deck0.live_score,
            expect: '队友实效上调，单局得分上升',
        },
        {
            name: 'multiLiveTeammatePower',
            base: BASE_EVENT, patch: { multiLiveTeammatePower: 500_000 },
            assert: (r) => r.decks[0].live_score > deck0.live_score,
            expect: '队友综合力上调（多人 active bonus），得分上升',
        },
        {
            name: 'liveSkillOrder',
            base: BASE_EVENT, patch: { liveSkillOrder: 'max' },
            assert: (r) => r.decks[0].live_score >= deck0.live_score,
            expect: '技能顺序取最大，得分不降',
        },
        {
            name: 'targetBonusList exact hit',
            base: BASE_EVENT, patch: { target: 'bonus', target_bonus_list: [ctx.bonusTier] },
            assert: (r, detail) => {
                const bonus = r.decks[0]?.event_bonus_total ?? -1;
                detail.value = bonus;
                // 精确档位：只返回 total_bonus === 档位 的卡组（不可达档为空数组）。
                return r.decks.length > 0 && bonus === ctx.bonusTier;
            },
            expect: '精确命中目标加成档位（wasm search_targets 路径）',
        },
        {
            name: 'boost',
            base: BASE_EVENT, patch: { boost: 10 },
            assert: (r) => r.decks[0].event_point !== deck0.event_point,
            expect: '体力消耗倍率改变活动 PT',
        },
        {
            name: 'otherScore',
            base: BASE_EVENT, patch: { otherScore: 1_000_000 },
            assert: (r) => r.decks.length > 0,
            expect: '协力对手分数被接受并正常返回',
        },
        {
            name: 'skillReferenceChooseStrategy',
            base: BASE_EVENT, patch: { skillReferenceChooseStrategy: 'max' },
            assert: (r) => r.decks.length > 0,
            expect: 'BFes 吸取策略被接受',
        },
        {
            name: 'keepAfterTrainingState',
            base: BASE_EVENT, patch: { keepAfterTrainingState: true },
            assert: (r) => r.decks.length > 0,
            expect: '双技能状态保持被接受',
        },
        {
            name: 'minimize',
            base: { region: 'jp', live_type: 'solo', target: 'power', limit: 3, timeout_ms: 60_000, ...ALL_RARITY_DEFAULTS },
            patch: { minimize: true },
            assert: (r) => r.decks[0].total_power < deck0.total_power,
            expect: '反向搜索得到显著更低的综合力',
        },
        {
            name: 'worldBloomEventTurn+Character',
            base: { region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master', target: 'score', limit: 3, timeout_ms: 60_000, world_bloom_event_turn: 3, world_bloom_character_id: 1, ...ALL_RARITY_DEFAULTS },
            patch: {},
            assert: (r) => r.decks.length > 0 && (r.decks[0].event_bonus_total ?? 0) > 0,
            expect: 'WL3 模拟按章节出卡并带支援加成',
        },
        {
            name: 'supportMasterMax',
            base: { region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master', target: 'score', limit: 3, timeout_ms: 60_000, world_bloom_event_turn: 3, world_bloom_character_id: 1, ...ALL_RARITY_DEFAULTS },
            patch: { supportMasterMax: true },
            assert: (r) => r.decks[0].event_bonus_total >= baseWlBonus,
            expect: '支援卡满破假设提高/保持总加成',
            },
        {
            name: 'supportSkillMax',
            base: { region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master', target: 'score', limit: 3, timeout_ms: 60_000, world_bloom_event_turn: 3, world_bloom_character_id: 1, ...ALL_RARITY_DEFAULTS },
            patch: { supportSkillMax: true },
            assert: (r) => r.decks[0].event_bonus_total >= baseWlBonus,
            expect: '支援卡满技能假设提高/保持总加成',
        },
        {
            name: 'filterOtherUnit',
            base: { region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master', target: 'score', limit: 3, timeout_ms: 60_000, world_bloom_event_turn: 3, world_bloom_character_id: 1, ...ALL_RARITY_DEFAULTS },
            patch: { filterOtherUnit: true },
            assert: (r) => r.decks.length > 0,
            expect: '过滤其他团体被接受',
        },
        {
            name: 'customBonusCharacters',
            base: { region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master', target: 'score', limit: 3, timeout_ms: 60_000, ...ALL_RARITY_DEFAULTS },
            patch: { custom_bonus_character_ids: [1, 2, 3, 4, 5] },
            assert: (r) => r.decks.length > 0 && (r.decks[0].event_bonus_total ?? 0) > (deck0.event_bonus_total ?? 0) * 0.5,
            expect: '自定义混活角色加成生效',
        },
        {
            name: 'customBonusAttr',
            base: { region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master', target: 'score', limit: 3, timeout_ms: 60_000, custom_bonus_character_ids: [1, 2, 3, 4, 5], ...ALL_RARITY_DEFAULTS },
            patch: { custom_bonus_attr: 'cool' },
            assert: (r) => r.decks.length > 0,
            expect: '自定义加成属性被接受',
        },
        {
            name: 'forcedLeaderCharacterId',
            base: BASE_EVENT, patch: { forced_leader_character_id: 1 },
            assert: (r) => r.decks.length > 0 && r.decks.every((d) => d.cards[0].character_id === 1),
            expect: '指定队长后每个卡组的队长位都是该角色',
        },
        {
            name: 'forcedLeaderCharacterId + fixedCards',
            base: { ...BASE_EVENT, fixedCards: [otherCharCard] },
            patch: { forced_leader_character_id: leaderChar },
            assert: (r) => r.decks.length > 0
                && r.decks.every((d) => d.cards[0].character_id === leaderChar)
                && r.decks.every((d) => d.cards.some((c) => c.card_id === otherCharCard)),
            expect: `固定卡 ${otherCharCard} 留在队里，队长位仍是指定的角色 ${leaderChar}`,
        },
        {
            name: 'simulated unit event',
            base: SIM_BASE, patch: { event_type: 'marathon', event_unit: 'idol' },
            assert: (r) => r.decks.length > 0 && (r.decks[0].event_bonus_total ?? 0) > 0,
            expect: '模拟团活按团给出加成',
        },
        {
            name: 'simulated mixed event',
            base: SIM_BASE,
            patch: { event_type: 'marathon', custom_bonus_character_ids: [1, 5, 10, 15, 21], custom_bonus_character_support_units: { 21: 'street' } },
            assert: (r) => r.decks.length > 0 && (r.decks[0].event_bonus_total ?? 0) > 0,
            expect: '模拟混活按角色集合给出加成',
        },
        {
            name: 'simulated cheerful carnival',
            base: { ...SIM_BASE, live_type: 'cheerful' },
            patch: { event_type: 'cheerful_carnival', event_unit: 'idol', event_attr: 'happy' },
            assert: (r) => r.decks.length > 0 && (r.decks[0].event_point ?? 0) > 0,
            expect: '模拟 5v5 算出活动 PT',
        },
        {
            name: 'simulated world bloom turn 1/2',
            base: SIM_BASE, patch: { event_type: 'world_bloom', world_bloom_event_turn: 1, event_unit: 'street' },
            assert: (r) => r.decks.length > 0 && (r.decks[0].event_bonus_total ?? 0) > 0,
            expect: '模拟连接世界第 1 轮不再要求真实活动 ID',
        },
        {
            name: 'recommendMusic（单曲收益）',
            base: null,
            patch: null,
            run: () => {
                const rows = JSON.parse(mod.recommendMusic(JSON.stringify({
                    live_type: 'multi', event_type: 'marathon', skill_order_choose_strategy: 'average',
                    deck: BASE_MUSIC_DECK(deck0),
                })));
                const top = rows.find((row) => row.difficulty === 'master');
                return rows.length > 0 && top.live_score > 0 && (top.event_point ?? 0) > 0;
            },
            expect: '单曲收益返回非零单局得分与 PT',
        },
        {
            name: 'limit',
            base: BASE_EVENT, patch: { limit: 2 },
            assert: (r) => r.decks.length <= 2 && r.decks.length > 0,
            expect: '结果数量受限',
        },
    ];
}

async function fetchJson(url, attempts = 3) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            return await res.json();
        } catch (err) {
            lastErr = err;
            if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
    }
    throw new Error(`${lastErr?.message ?? lastErr} — ${url}`);
}

async function main() {
    console.log('1) 加载 wasm 与数据…');
    const mod = await import(pathToFileURL(`${artDir}/${artBase}.js`).href);
    await mod.default(new Uint8Array(readFileSync(`${artDir}/${artBase}_bg.wasm`)));
    const master = {};
    for (const key of PRELOAD_MASTER_KEYS) {
        try {
            master[key] = await fetchJson(`${MASTER_BASE}/${key}.json`);
        } catch (err) {
            console.warn(`  (可选表缺失，跳过) ${key}: ${err.message}`);
        }
    }
    for (const key of LOCAL_MASTER_KEYS) {
        master[key] = JSON.parse(readFileSync(resolve(webRoot, 'public', 'data', `${key}.json`), 'utf8'));
    }
    const metas = await fetchJson(MUSIC_META_URL);
    const payload = {};
    for (const [name, rows] of Object.entries(master)) payload[`${name}.json`] = JSON.stringify(rows);
    mod.load_masterdata(JSON.stringify(payload), JSON.stringify(metas));

    console.log('2) 载入真实账号…');
    let user;
    try {
        user = await fetchJson(`${SUITE}/jp/suite/${UID}?key=${USER_KEYS.join(',')}`);
    } catch (err) {
        console.warn(`  实账号拉取失败（${err.message}），回退合成账号`);
        user = {
            userGamedata: { userId: 1, name: 'params-test', deck: 1, rank: 1 },
            userCards: master.cards.filter((c) => c.cardRarityType === 'rarity_4').slice(0, 40).map((card) => ({
                cardId: card.id, level: 60, masterRank: 0, skillLevel: 1,
                specialTrainingStatus: 'done', defaultImage: 'special_training',
                episodes: (master.cardEpisodes ?? []).filter((ep) => ep.cardId === card.id)
                    .map((ep) => ({ cardEpisodeId: ep.id, scenarioStatus: 'already_read' })),
            })),
            userCharacters: master.gameCharacters.map((c) => ({ characterId: c.id, characterRank: 1 })),
            userAreas: [], userDecks: [], userHonors: [], userChallengeLiveSoloDecks: [],
            userMysekaiCanvases: [], userMysekaiGates: [], userMysekaiFixtureGameCharacterPerformanceBonuses: [],
        };
    }
    const { resolveDeckScore } = await import("../src/lib/deck-recommend/deck-score.ts");
    const handle = mod.create_user_data(JSON.stringify(user), 'jp');

    const run = (options) => JSON.parse(mod.recommendWithUserData(JSON.stringify(options), handle));
    const baseEvent = run(BASE_EVENT);
    const basePoolSize = baseEvent.performance.pool_size;
    const baseWlRun = run({
        region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master',
        target: 'score', limit: 3, timeout_ms: 60_000,
        world_bloom_event_turn: 3, world_bloom_character_id: 1, ...ALL_RARITY_DEFAULTS,
    });
    const baseWlBonus = baseWlRun.decks[0]?.event_bonus_total ?? 0;
    console.log(`   基线：pool=${basePoolSize}, topPT=${baseEvent.decks[0]?.event_point}, wlBonus=${baseWlBonus}`);
    // 档位取基线最优卡组的实际加成：该档位由盒内卡组构成，必然可达，
    // 免受排行榜账号卡盒变化影响。
    const bonusTier = Math.round(baseEvent.decks[0].cards.reduce((sum, c) => sum + (c.event_bonus ?? 0), 0));
    const bonusRun = run({ ...BASE_EVENT, target: 'bonus', target_bonus_list: [bonusTier] });
    const challengeRun = run({
        region: 'jp', live_type: 'challenge', challenge_live_character_id: 1,
        music_id: 74, music_diff: 'master', target: 'score', limit: 1, timeout_ms: 60_000,
        ...ALL_RARITY_DEFAULTS,
    });
    const customRun = run({
        region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master',
        target: 'score', limit: 1, timeout_ms: 60_000,
        custom_bonus_character_ids: [1, 2, 3, 4, 5], ...ALL_RARITY_DEFAULTS,
    });
    const skillRun = run({ ...BASE_EVENT, target: 'skill' });
    const weakRun = run({ region: 'jp', live_type: 'solo', target: 'power', minimize: true, limit: 1, timeout_ms: 60_000, ...ALL_RARITY_DEFAULTS });
    const myRun = run({ region: 'jp', live_type: 'multi', music_id: 74, music_diff: 'master', target: 'mysekai', event_id: 215, limit: 1, timeout_ms: 60_000, ...ALL_RARITY_DEFAULTS });

    console.log('3) 参数矩阵逐项验证…');
    const matrix = buildMatrix(mod, baseEvent.decks, { basePoolSize, baseWlBonus, bonusTier });
    let pass = 0;
    const failures = [];
    for (const item of matrix) {
        let ok;
        let detail = '';
        try {
            if (item.run) {
                ok = item.run();
            } else {
                const result = run({ ...item.base, ...item.patch });
                const diag = {};
                ok = item.assert(result, diag);
                if (!ok) detail = ` top=${JSON.stringify(result.decks[0]?.cards?.map((c) => c.card_id))}${diag.value !== undefined ? ` bonus=${diag.value}` : ''}`;
            }
        } catch (err) {
            ok = false;
            detail = ` err=${err.message}`;
        }
        if (ok) {
            pass += 1;
            console.log(`   ✓ ${item.name} — ${item.expect}`);
        } else {
            failures.push(item.name);
            console.error(`   ✗ ${item.name} — ${item.expect}${detail}`);
        }
    }

console.log('3C) 展示解码逐模式校验…');
    const decodeCases = [
        { name: 'event score', input: { mode: 'event', target: 'score', targetValue: baseEvent.decks[0].target_value, eventPoint: baseEvent.decks[0].event_point }, expect: (v) => v >= 100 && v <= 20000 },
        { name: 'event power', input: { mode: 'event', target: 'power', targetValue: run({ ...BASE_EVENT, target: 'power' }).decks[0].target_value }, expect: (v) => v >= 50000 && v <= 2000000 },
        { name: 'event bonus', input: { mode: 'event', target: 'bonus', targetValue: bonusRun.decks[0]?.target_value ?? -1 }, expect: (v) => v >= bonusTier - 5 && v <= bonusTier + 5 },
        { name: 'challenge score', input: { mode: 'challenge', targetValue: challengeRun.decks[0].target_value }, expect: (v) => v >= 1000000 && v <= 5000000 },
        { name: 'custom pt', input: { mode: 'custom', targetValue: customRun.decks[0].target_value, eventPoint: customRun.decks[0].event_point }, expect: (v) => v >= 100 && v <= 20000 },
        { name: 'strongest skill', input: { mode: 'strongest', strongestTarget: 'skill', targetValue: skillRun.decks[0].target_value }, expect: (v) => v >= 50 && v <= 400 },
        { name: 'weakest power', input: { mode: 'weakest', targetValue: weakRun.decks[0].target_value }, expect: (v) => v >= 10000 && v <= 500000 },
        { name: 'mysekai pt', input: { mode: 'mysekai', targetValue: myRun.decks[0].target_value }, expect: (v) => v >= 100 && v <= 20000 },
    ];
    for (const item of decodeCases) {
        const value = resolveDeckScore(item.input);
        const ok = item.expect(value);
        console.log(`   ${ok ? 'ok' : 'FAIL'} ${item.name} -> ${value}`);
        if (ok) { pass += 1; } else { failures.push(`decode:${item.name}`); }
    }

    console.log('3D) 进阶数据覆盖：纯函数改写校验…');
    const { applyUserDataOverrides } = await import("../src/lib/deck-recommend/user-data-overrides.ts");
    const ovMaster = {
        areaItems: master.areaItems ?? [],
        areaItemLevels: master.areaItemLevels ?? [],
        gameCharacters: master.gameCharacters ?? [],
        characterRanks: master.characterRanks ?? [],
        mysekaiGates: master.mysekaiGates ?? [],
        mysekaiGateLevels: master.mysekaiGateLevels ?? [],
        cards: master.cards ?? [],
    };
    const snapshot = {
        userAreas: [{ areaId: 5, areaItems: [{ areaItemId: 1, level: 3 }] }],
        userCharacters: [{ characterId: 1, characterRank: 5 }],
        userMysekaiGates: [{ mysekaiGateId: 1, mysekaiGateLevel: 2 }],
        userMysekaiFixtureGameCharacterPerformanceBonuses: [{ gameCharacterId: 1, totalBonusRate: 100 }],
    };
    const maxBy = (rows, key, idKey, id) => Math.max(0, ...rows.filter((r) => r[idKey] === id).map((r) => r[key]));
    const char1Max = maxBy(master.characterRanks, 'characterRank', 'characterId', 1);
    const gate1Max = maxBy(master.mysekaiGateLevels, 'level', 'mysekaiGateId', 1);
    const flatAreaItems = (applied) => (applied.userAreas ?? []).flatMap((area) => area.areaItems ?? []);

    const overrideCases = [
        {
            name: 'area uniform clamp + insert',
            expect: '所有区域道具统一为各自上限（含补插缺失项）',
            run: () => {
                const applied = applyUserDataOverrides(snapshot, { areaItemLevel: 9999 }, ovMaster);
                const items = flatAreaItems(applied);
                if (items.length !== (ovMaster.areaItems?.length ?? 0)) return false;
                return items.every((item) => item.level === maxBy(master.areaItemLevels, 'level', 'areaItemId', item.areaItemId));
            },
        },
        {
            name: 'area override beats uniform',
            expect: '单项覆盖优先于统一值',
            run: () => {
                const applied = applyUserDataOverrides(snapshot, {
                    areaItemLevel: 9999,
                    areaItemLevelOverrides: [{ areaItemId: 1, level: 1 }],
                }, ovMaster);
                const item1 = flatAreaItems(applied).find((item) => item.areaItemId === 1);
                return item1?.level === 1;
            },
        },
        {
            name: 'character rank uniform clamp + insert',
            expect: '全部角色 clamp 到上限（含未拥有角色补插）',
            run: () => {
                const applied = applyUserDataOverrides(snapshot, { characterRank: 9999 }, ovMaster);
                return (applied.userCharacters ?? []).length === (ovMaster.gameCharacters?.length ?? 0)
                    && applied.userCharacters.find((c) => c.characterId === 1)?.characterRank === char1Max;
            },
        },
        {
            name: 'character rank override',
            expect: '单项角色连 1 生效',
            run: () => {
                const applied = applyUserDataOverrides(snapshot, { characterRankOverrides: [{ characterId: 1, rank: 1 }] }, ovMaster);
                return applied.userCharacters.find((c) => c.characterId === 1)?.characterRank === 1;
            },
        },
        {
            name: 'mysekai gate uniform clamp + insert',
            expect: '烤森门统一为上限（含补插）',
            run: () => {
                const applied = applyUserDataOverrides(snapshot, { mysekaiGateLevel: 9999 }, ovMaster);
                return (applied.userMysekaiGates ?? []).length === (ovMaster.mysekaiGates?.length ?? 0)
                    && applied.userMysekaiGates.find((g) => g.mysekaiGateId === 1)?.mysekaiGateLevel === gate1Max;
            },
        },
        {
            name: 'fixture rate 0 is a valid uniform',
            expect: '玩偶加成统一 0（含全部角色补插）',
            run: () => {
                const applied = applyUserDataOverrides(snapshot, { mysekaiFixtureBonusRate: 0 }, ovMaster);
                const rows = applied.userMysekaiFixtureGameCharacterPerformanceBonuses ?? [];
                return rows.length === (ovMaster.gameCharacters?.length ?? 0) && rows.every((r) => r.totalBonusRate === 0);
            },
        },
        {
            name: 'fixture override beats uniform',
            expect: '单项玩偶覆盖优先于统一值',
            run: () => {
                const applied = applyUserDataOverrides(snapshot, {
                    mysekaiFixtureBonusRate: 500,
                    mysekaiFixtureBonusRateOverrides: [{ characterId: 1, totalBonusRate: 0 }],
                }, ovMaster);
                return applied.userMysekaiFixtureGameCharacterPerformanceBonuses?.find((r) => r.gameCharacterId === 1)?.totalBonusRate === 0;
            },
        },
        {
            name: 'no overrides keeps user data',
            expect: '无覆盖时返回等价快照',
            run: () => JSON.stringify(applyUserDataOverrides(user, undefined, ovMaster)) === JSON.stringify(user),
        },
        {
            name: 'character filter restricts card pool',
            expect: '卡池仅保留角色 1 的卡',
            run: () => {
                const applied = applyUserDataOverrides(user, undefined, ovMaster, [1]);
                const allowed = new Set(master.cards.filter((c) => c.characterId === 1).map((c) => c.id));
                const kept = (applied.userCards ?? []).map((c) => Number(c.cardId));
                if (kept.length === 0) return false;
                return kept.every((id) => allowed.has(id));
            },
        },
    ];
    for (const item of overrideCases) {
        let ok = false;
        try { ok = item.run(); } catch (err) { console.error(`   ✗ ${item.name} err=${err.message}`); }
        if (ok) { pass += 1; console.log(`   ✓ ${item.name} — ${item.expect}`); }
        else { failures.push(`override:${item.name}`); console.error(`   ✗ ${item.name} — ${item.expect}`); }
    }

    console.log('3E) 进阶数据覆盖：引擎端生效校验…');
    const fixedCards = baseEvent.decks[0]?.cards?.map((c) => c.card_id);
    const powerWith = (overrides) => {
        const handleTmp = mod.create_user_data(JSON.stringify(applyUserDataOverrides(user, overrides, ovMaster)), 'jp');
        try {
            const opts = { region: 'jp', live_type: 'solo', target: 'power', limit: 1, timeout_ms: 60_000, fixedCards, ...ALL_RARITY_DEFAULTS };
            return JSON.parse(mod.recommendWithUserData(JSON.stringify(opts), handleTmp)).decks[0]?.total_power ?? -1;
        } finally {
            handleTmp?.free?.();
        }
    };
    const hasHigherRanks = Array.isArray(user.userCharacters) && user.userCharacters.some((c) => Number(c.characterRank) > 1);
    const baseFixedPower = powerWith(undefined);
    const rank1Power = powerWith({ characterRank: 1 });
    const areaMaxPower = powerWith({ areaItemLevel: 9999 });
    const fixture0Power = powerWith({ mysekaiFixtureBonusRate: 0 });
    const fixture500Power = powerWith({ mysekaiFixtureBonusRate: 500 });
    const poolRun = (overrides, characterFilterIds) => {
        const handleTmp = mod.create_user_data(JSON.stringify(applyUserDataOverrides(user, overrides, ovMaster, characterFilterIds)), 'jp');
        try {
            const opts = { region: 'jp', live_type: 'solo', target: 'power', limit: 1, timeout_ms: 60_000, ...ALL_RARITY_DEFAULTS };
            return JSON.parse(mod.recommendWithUserData(JSON.stringify(opts), handleTmp)).performance.pool_size ?? -1;
        } finally {
            handleTmp?.free?.();
        }
    };
    const poolAll = poolRun(undefined, undefined);
    const poolChar1 = poolRun(undefined, [1]);
    const engineOverrideCases = [
        { name: 'character rank 1 lowers power', expect: hasHigherRanks ? '低于基线' : '不超过基线', ok: hasHigherRanks ? rank1Power < baseFixedPower : rank1Power <= baseFixedPower },
        { name: 'area items max raises power', expect: '不低于基线', ok: areaMaxPower >= baseFixedPower },
        { name: 'fixture 500 beats fixture 0', expect: '加成越高力量越高', ok: fixture500Power > fixture0Power },
    ];
    engineOverrideCases.push({
        name: 'character filter shrinks pool',
        expect: '角色过滤后候选池缩小且可用',
        ok: poolChar1 > 0 && poolChar1 < poolAll,
    });
    for (const item of engineOverrideCases) {
        if (item.ok) { pass += 1; console.log(`   ✓ ${item.name} — ${item.expect} (${rank1Power}/${areaMaxPower}/${fixture0Power}/${fixture500Power})`); }
        else { failures.push(`engine-override:${item.name}`); console.error(`   ✗ ${item.name} — ${item.expect} (${rank1Power}/${areaMaxPower}/${fixture0Power}/${fixture500Power})`); }
    }
    console.log(`   无覆盖基准综合力（固定卡组）: ${baseFixedPower}（rank1=${rank1Power}, areaMax=${areaMaxPower}, fixture0=${fixture0Power}, fixture500=${fixture500Power}）`);

    handle.free();

    console.log('\nB) worker 选项键静态对照…');
    // 引擎 options 的组装已抽到 engine-options.ts；worker 只剩数据加载与句柄复用。
    const workerSource = [
        readFileSync(resolve(webRoot, 'src/lib/deck-recommend/engine-options.ts'), 'utf8'),
        readFileSync(resolve(webRoot, 'src/lib/deck-recommend/engine-worker.ts'), 'utf8'),
    ].join('\n');
    const requiredKeys = [
        'event_id', 'event_type', 'event_attr', 'event_unit', 'world_bloom_event_turn',
        'world_bloom_character_id', 'challenge_live_character_id', 'target', 'limit', 'timeout_ms',
        'multiLiveTeammatePower', 'multiLiveTeammateScoreUp', 'multiLiveScoreUpLowerBound',
        'liveSkillOrder', 'specificSkillOrder', 'skillReferenceChooseStrategy',
        'keepAfterTrainingState', 'bestSkillAsLeader', 'minimize', 'boost', 'otherScore',
        'supportMasterMax', 'supportSkillMax', 'filterOtherUnit',
        'fixedCards', 'fixedCharacters', 'excludedCards', 'singleCardConfigs',
        'custom_bonus_character_ids', 'custom_bonus_attr', 'custom_bonus_character_support_units',
        'target_bonus_list', 'rarity1Config', 'rarity4Config', 'forced_leader_character_id',
        'music_id', 'music_diff', 'live_type',
        'userDataOverrides', 'applyUserDataOverrides', 'characterFilterIds',
    ];
    const missing = requiredKeys.filter((key) => !workerSource.includes(key));
    if (missing.length === 0) {
        pass += 1;
        console.log(`   ✓ worker 覆盖全部 ${requiredKeys.length} 个 option 键`);
    } else {
        failures.push(`worker missing keys: ${missing.join(', ')}`);
        console.error(`   ✗ worker 缺少键: ${missing.join(', ')}`);
    }

    // 表单 → worker 入参那一层的逐字段断言在 scripts/test-deck-payload.mjs，
    // 这里只做一次粗筛，保证页面还在走那个纯映射、没有绕回手写 payload。
    console.log('B2) client → worker 传参入口静态对照…');
    const clientSource = readFileSync(resolve(webRoot, 'src/app/deck-recommend/client.tsx'), 'utf8');
    const argsSource = readFileSync(resolve(webRoot, 'src/lib/deck-recommend/worker-args.ts'), 'utf8');
    const clientKeys = ['buildDeckWorkerArgs', 'DataOverridePanel', 'useCurrentDeck'];
    const argsKeys = [
        'simulatedEvent', 'userDataOverrides', 'leaderCharacterId',
        'areaItemLevel', 'areaItemLevelOverrides', 'characterRank', 'characterRankOverrides',
        'mysekaiGateLevel', 'mysekaiGateLevelOverrides',
        'mysekaiFixtureBonusRate', 'mysekaiFixtureBonusRateOverrides',
        'characterFilterIds', 'unitFilter', 'attrFilter',
        'simBonusMode', 'simCharacterIds', 'simCharacterUnits',
    ];
    const clientMissing = clientKeys.filter((key) => !clientSource.includes(key))
        .concat(argsKeys.filter((key) => !argsSource.includes(key)));
    if (clientMissing.length === 0) {
        pass += 1;
        console.log(`   ✓ 页面走 buildDeckWorkerArgs，映射覆盖 ${argsKeys.length} 个契约字段`);
    } else {
        failures.push(`client missing keys: ${clientMissing.join(', ')}`);
        console.error(`   ✗ 缺少键: ${clientMissing.join(', ')}`);
    }

    console.log(`\n参数全量验证：${pass} 项通过${failures.length ? `，${failures.length} 项失败：${failures.join('; ')}` : '，全部生效'}`);
    if (failures.length) process.exit(1);
}

main().catch((err) => {
    console.error('\n参数全量验证失败:', err);
    process.exit(1);
});
