/**
 * 组卡参数映射测试（Node，不进构建，不联网）。
 *
 * 盯的是两层纯映射：
 *   表单状态 --buildDeckWorkerArgs--> worker 入参 --buildEngineOptions--> 引擎 options
 *
 * 这一层丢字段不会抛错，只会静默退化成另一种搜索——模拟活动退回真实活动、
 * 指定队长被忽略、进阶覆盖被丢掉——所以每个字段都要有断言直接盯住落点。
 *
 * 使用方法: node --experimental-strip-types scripts/test-deck-payload.mjs
 */

import { resolve } from 'path';
import { pathToFileURL } from 'url';

const webRoot = resolve(import.meta.dirname ?? '.', '..');
const load = (rel) => import(pathToFileURL(resolve(webRoot, rel)).href);

const { buildDeckWorkerArgs, DEFAULT_DECK_FORM_STATE } = await load('src/lib/deck-recommend/worker-args.ts');
const { buildEngineOptions } = await load('src/lib/deck-recommend/engine-options.ts');

const EVENT_ROWS = [
    { id: 200, eventType: 'marathon' },
    { id: 201, eventType: 'cheerful_carnival' },
    { id: 202, eventType: 'world_bloom' },
    { id: 218, eventType: 'world_bloom' },
    { id: 999, eventType: 'world_bloom' },
];
const WL3_SIM_EVENT_IDS = [3200001, 3200002, 3200003, 3200004, 3200005];

const ACCOUNT = { server: 'jp', userId: ' 1234567890 ', bonusTargets: null };

/** 表单状态 → worker 入参 → 引擎 options。 */
function pipeline(patch, account = ACCOUNT) {
    const state = { ...DEFAULT_DECK_FORM_STATE, ...patch };
    const args = buildDeckWorkerArgs(state, account);
    const options = buildEngineOptions(args, {
        eventRows: EVENT_ROWS,
        worldBloomRows: [
            { eventId: 202, worldBloomChapterType: 'chapter' },
            { eventId: 218, worldBloomChapterType: 'finale' },
            { eventId: 999, worldBloomChapterType: 'finale' },
        ],
        wl3SimulationEventIds: WL3_SIM_EVENT_IDS,
    });
    return { state, args, options };
}

let pass = 0;
const failures = [];

function check(name, fn) {
    try {
        const problem = fn();
        if (problem) {
            failures.push(`${name}: ${problem}`);
            console.error(`   ✗ ${name} — ${problem}`);
        } else {
            pass += 1;
            console.log(`   ✓ ${name}`);
        }
    } catch (err) {
        failures.push(`${name}: ${err.message}`);
        console.error(`   ✗ ${name} — 抛异常: ${err.message}`);
    }
}

const eq = (actual, expected, label) =>
    JSON.stringify(actual) === JSON.stringify(expected)
        ? null
        : `${label} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`;

// ==================== 账号与通用字段 ====================
console.log('A) 账号与通用字段');

const ARGS_BASE = { mode: 'event', eventId: '200', musicId: '74' };

check('userId 去空格、server 透传', () => {
    const { args } = pipeline(ARGS_BASE);
    return eq(args.userId, '1234567890', 'userId') ?? eq(args.server, 'jp', 'server');
});

check('limit / timeout 有边界钳制', () => {
    const high = pipeline({ ...ARGS_BASE, limit: '999', timeoutSeconds: '9999' }).args;
    // 0 / 空串按「没填」处理，回落默认条数；超时另有 5 秒下限。
    const low = pipeline({ ...ARGS_BASE, limit: '0', timeoutSeconds: '1' }).args;
    const one = pipeline({ ...ARGS_BASE, limit: '1' }).args;
    return eq(high.limit, 30, 'limit 上限')
        ?? eq(high.timeoutMs, 300_000, 'timeoutMs 上限')
        ?? eq(low.limit, 10, 'limit=0 回落默认')
        ?? eq(one.limit, 1, 'limit 下限')
        ?? eq(low.timeoutMs, 5_000, 'timeoutMs 下限');
});

// ==================== 真实活动 ====================
console.log('B) 真实活动');

check('活动模式下发 event_id 与目标', () => {
    const { options } = pipeline({ mode: 'event', eventId: '200', selectedEventType: 'marathon', musicId: '74' });
    return eq(options.event_id, 200, 'event_id')
        ?? eq(options.target, 'score', 'target')
        ?? eq(options.live_type, 'multi', 'live_type')
        ?? eq(options.music_id, 74, 'music_id');
});

check('混战活动把 multi 换成 cheerful', () => {
    const { options } = pipeline({ mode: 'event', eventId: '201', selectedEventType: 'cheerful_carnival', musicId: '74' });
    return eq(options.live_type, 'cheerful', 'live_type');
});

check('连接世界真实活动带章节角色', () => {
    const { options } = pipeline({
        mode: 'event', eventId: '202', selectedEventType: 'world_bloom',
        supportCharacterId: 5, musicId: '74',
    });
    return eq(options.event_id, 202, 'event_id')
        ?? eq(options.world_bloom_character_id, 5, 'world_bloom_character_id');
});

check('真实终章不下发之前章节遗留的角色限制', () => {
    const { options } = pipeline({
        mode: 'event', eventId: '999', selectedEventType: 'world_bloom',
        supportCharacterId: 5, musicId: '74', fixedCards: [1004],
    });
    return eq(options.event_id, 999, 'event_id')
        ?? eq(options.world_bloom_character_id, undefined, '终章无章节角色')
        ?? eq(options.fixedConstraintMode, 'members', '终章固定卡仅要求上场');
});

check('EventSelector 的 WL3 假活动转成模拟参数且不带 event_id', () => {
    const { options } = pipeline({
        mode: 'event', eventId: '3200003', selectedEventType: 'world_bloom',
        supportCharacterId: 9, musicId: '74',
    });
    return eq(options.event_id, undefined, 'event_id')
        ?? eq(options.world_bloom_event_turn, 3, 'world_bloom_event_turn')
        ?? eq(options.world_bloom_character_id, 9, 'world_bloom_character_id');
});

check('目标加成档位下发', () => {
    const { options } = pipeline(
        { mode: 'event', eventId: '200', selectedEventType: 'marathon', musicId: '74', target: 'bonus' },
        { ...ACCOUNT, bonusTargets: [420, 425] },
    );
    return eq(options.target, 'bonus', 'target') ?? eq(options.target_bonus_list, [420, 425], 'target_bonus_list');
});

// ==================== 模拟活动 ====================
console.log('C) 模拟活动（团活 / 混活 / 连接世界）');

const SIM_BASE = { mode: 'event', simulateEnabled: true, musicId: '74' };

check('模拟开启后 worker 一定拿到 simulatedEvent', () => {
    const { args } = pipeline({ ...SIM_BASE, simType: 'marathon' });
    return args.simulatedEvent ? null : 'simulatedEvent 缺失——worker 会退回真实活动分支';
});

check('模拟活动即使页面残留 eventId 也不下发 event_id', () => {
    // 回归点：残留的 eventId 会让引擎按真实活动算，模拟条件全部失效。
    const { options } = pipeline({ ...SIM_BASE, eventId: '200', selectedEventType: 'marathon', simType: 'marathon' });
    return eq(options.event_id, undefined, 'event_id') ?? eq(options.event_type, 'marathon', 'event_type');
});

check('未选活动且未开模拟时才报缺 ID', () => {
    // 回归点：以前模拟开关不生效，没选活动就抛 "event mode requires eventId"。
    let simulatedThrew = false;
    try {
        pipeline({ ...SIM_BASE, simType: 'marathon' });
    } catch {
        simulatedThrew = true;
    }
    let realThrew = false;
    try {
        pipeline({ mode: 'event', musicId: '74' });
    } catch {
        realThrew = true;
    }
    if (simulatedThrew) return '开了模拟仍报缺 ID';
    if (!realThrew) return '没选活动也没开模拟时应当报缺 ID';
    return null;
});

check('模拟团活：下发 event_unit', () => {
    const { options } = pipeline({
        ...SIM_BASE, simType: 'marathon', simBonusMode: 'unit', simUnit: 'light_sound', simAttr: 'cool',
    });
    return eq(options.event_type, 'marathon', 'event_type')
        ?? eq(options.event_unit, 'light_sound', 'event_unit')
        ?? eq(options.event_attr, 'cool', 'event_attr')
        ?? eq(options.custom_bonus_character_ids, undefined, 'custom_bonus_character_ids');
});

check('模拟混活：下发加成角色集合与 VS 支援团', () => {
    const { options } = pipeline({
        ...SIM_BASE, simType: 'marathon', simBonusMode: 'character',
        simCharacterIds: [1, 5, 21], simCharacterUnits: { 21: 'street' }, simAttr: 'cute',
    });
    return eq(options.custom_bonus_character_ids, [1, 5, 21], 'custom_bonus_character_ids')
        ?? eq(options.custom_bonus_character_support_units, { 21: 'street' }, 'custom_bonus_character_support_units')
        ?? eq(options.event_attr, 'cute', 'event_attr')
        ?? eq(options.event_unit, undefined, 'event_unit 不应与角色集合同时下发');
});

check('模拟混战：event_type 与 live_type 都是 cheerful 口径', () => {
    const { options } = pipeline({
        ...SIM_BASE, simType: 'cheerful_carnival', simBonusMode: 'unit', simUnit: 'idol', simAttr: 'happy',
    });
    return eq(options.event_type, 'cheerful_carnival', 'event_type')
        ?? eq(options.live_type, 'cheerful', 'live_type')
        ?? eq(options.event_unit, 'idol', 'event_unit');
});

for (const turn of [1, 2]) {
    check(`模拟连接世界第 ${turn} 轮：按团下发轮次`, () => {
        const { options } = pipeline({
            ...SIM_BASE, simType: 'world_bloom', simTurn: turn, simUnit: 'street',
        });
        return eq(options.event_type, 'world_bloom', 'event_type')
            ?? eq(options.world_bloom_event_turn, turn, 'world_bloom_event_turn')
            ?? eq(options.event_unit, 'street', 'event_unit')
            ?? eq(options.world_bloom_character_id, undefined, 'world_bloom_character_id');
    });
}

check('模拟连接世界第 3 轮：按章节角色下发', () => {
    const { options } = pipeline({
        ...SIM_BASE, simType: 'world_bloom', simTurn: 3, simCharacterId: 21, simUnit: 'street',
    });
    return eq(options.world_bloom_event_turn, 3, 'world_bloom_event_turn')
        ?? eq(options.world_bloom_character_id, 21, 'world_bloom_character_id')
        ?? eq(options.event_unit, undefined, '第 3 轮按角色分组，不该带 event_unit');
});

check('连接世界模拟不吃属性加成', () => {
    const { options } = pipeline({
        ...SIM_BASE, simType: 'world_bloom', simTurn: 3, simCharacterId: 21, simAttr: 'cool',
    });
    return eq(options.event_attr, undefined, 'event_attr');
});

// ==================== 指定队长 ====================
console.log('D) 指定队长（与固定卡共存时队长位归指定角色）');

check('指定队长下发 forced_leader_character_id', () => {
    const { options } = pipeline({
        mode: 'event', eventId: '200', selectedEventType: 'marathon', musicId: '74', leaderCharacterId: 7,
    });
    return eq(options.forced_leader_character_id, 7, 'forced_leader_character_id');
});

check('固定卡与指定队长同时下发', () => {
    const { options } = pipeline({
        mode: 'event', eventId: '200', selectedEventType: 'marathon', musicId: '74',
        fixedCards: [1004], leaderCharacterId: 26,
    });
    return eq(options.fixedCards, [1004], 'fixedCards')
        ?? eq(options.fixedConstraintMode, undefined, '普通活动保留slot约束')
        ?? eq(options.forced_leader_character_id, 26, 'forced_leader_character_id');
});

check('真实终章固定卡和角色只要求上场，未指定队长时不固定队长', () => {
    for (const pins of [
        { fixedCards: [1004] },
        { fixedCharacters: [2, 3] },
        { fixedCards: [1004], fixedCharacters: [2] },
    ]) {
        const { options } = pipeline({ ...ARGS_BASE, eventId: '999', selectedEventType: 'world_bloom', ...pins });
        const error = eq(options.fixedConstraintMode, 'members', 'fixedConstraintMode')
            ?? eq(options.forced_leader_character_id, undefined, '不隐式指定队长');
        if (error) return error;
    }
    return null;
});

check('普通章节固定卡保留slot模式', () => {
    const { options } = pipeline({ ...ARGS_BASE, eventId: '202', selectedEventType: 'world_bloom', fixedCards: [1004] });
    return eq(options.fixedConstraintMode, undefined, '章节不启用members');
});

check('显式终章模拟采用members，分组章节模拟不采用', () => {
    const context = { eventRows: [], worldBloomRows: [], wl3SimulationEventIds: [] };
    const common = { mode: 'event', liveType: 'multi', cardConfig: {}, fixedCards: [1004] };
    const finale = buildEngineOptions({ ...common, simulatedEvent: { eventType: 'world_bloom', worldBloomFinaleTurn: 3 } }, context);
    const chapter = buildEngineOptions({ ...common, simulatedEvent: { eventType: 'world_bloom', worldBloomTurn: 3, worldBloomCharacterId: 1 } }, context);
    return eq(finale.fixedConstraintMode, 'members', '终章members')
        ?? eq(finale.world_bloom_finale_turn, 3, '独立终章轮次')
        ?? eq(finale.world_bloom_event_turn, undefined, '不冒用章节轮次')
        ?? eq(chapter.fixedConstraintMode, undefined, '章节slots');
});

check('未指定队长时不下发该键', () => {
    const { options } = pipeline({ mode: 'event', eventId: '200', selectedEventType: 'marathon', musicId: '74' });
    return eq(options.forced_leader_character_id, undefined, 'forced_leader_character_id');
});

check('最高技能作队长的开关按原样透传', () => {
    const on = pipeline({ mode: 'event', eventId: '200', musicId: '74', bestSkillAsLeader: true }).options;
    const off = pipeline({ mode: 'event', eventId: '200', musicId: '74', bestSkillAsLeader: false }).options;
    return eq(on.bestSkillAsLeader, undefined, '默认开启时不必下发')
        ?? eq(off.bestSkillAsLeader, false, '关闭时必须下发 false');
});

// ==================== 进阶数据覆盖 ====================
console.log('E) 进阶数据覆盖');

check('userDataOverrides 打包成对象且键名与 worker 契约一致', () => {
    const { args } = pipeline({
        mode: 'event', eventId: '200', musicId: '74',
        areaItemLevel: '15', characterRank: '50', mysekaiGateLevel: '3', mysekaiFixtureBonusRate: '120',
        areaItemOverrides: [{ areaItemId: 1, level: 10 }],
        characterRankOverrides: [{ characterId: 1, rank: 1 }],
        mysekaiGateOverrides: [{ mysekaiGateId: 1, level: 2 }],
        mysekaiFixtureOverrides: [{ characterId: 1, totalBonusRate: 0 }],
    });
    const o = args.userDataOverrides;
    if (!o) return 'userDataOverrides 缺失';
    return eq(o.areaItemLevel, 15, 'areaItemLevel')
        ?? eq(o.characterRank, 50, 'characterRank')
        ?? eq(o.mysekaiGateLevel, 3, 'mysekaiGateLevel')
        ?? eq(o.mysekaiFixtureBonusRate, 120, 'mysekaiFixtureBonusRate')
        ?? eq(o.areaItemLevelOverrides?.length, 1, 'areaItemLevelOverrides')
        ?? eq(o.characterRankOverrides?.length, 1, 'characterRankOverrides')
        ?? eq(o.mysekaiGateLevelOverrides?.length, 1, 'mysekaiGateLevelOverrides')
        ?? eq(o.mysekaiFixtureBonusRateOverrides?.length, 1, 'mysekaiFixtureBonusRateOverrides');
});

check('空覆盖表现为全 null，不会被误判成有效覆盖', () => {
    const o = pipeline({ mode: 'event', eventId: '200', musicId: '74' }).args.userDataOverrides;
    return eq(
        [o.areaItemLevel, o.characterRank, o.mysekaiGateLevel, o.mysekaiFixtureBonusRate],
        [null, null, null, null],
        '统一值',
    );
});

check('最弱组卡不带任何覆盖', () => {
    const { args, options } = pipeline({ mode: 'weakest', areaItemLevel: '15', characterRank: '50' });
    return eq(args.userDataOverrides, undefined, 'userDataOverrides')
        ?? eq(options.target, 'power', 'target')
        ?? eq(options.minimize, true, 'minimize')
        ?? eq(options.live_type, 'solo', 'live_type')
        ?? eq(options.music_id, undefined, 'music_id');
});

check('角色过滤单独下发', () => {
    const { args } = pipeline({ mode: 'event', eventId: '200', musicId: '74', characterFilterIds: [1, 2] });
    return eq(args.characterFilterIds, [1, 2], 'characterFilterIds');
});

// ==================== 其他模式 ====================
console.log('F) 其他模式');

check('挑战模式：角色 + challenge live 类型', () => {
    const normal = pipeline({ mode: 'challenge', challengeCharacterId: 4, liveType: 'challenge', musicId: '74' }).options;
    const auto = pipeline({ mode: 'challenge', challengeCharacterId: 4, liveType: 'auto', musicId: '74' }).options;
    return eq(normal.challenge_live_character_id, 4, 'challenge_live_character_id')
        ?? eq(normal.live_type, 'challenge', 'live_type')
        ?? eq(auto.live_type, 'challenge_auto', 'auto live_type');
});

check('自定义加成模式：按团 / 按角色两种口径', () => {
    const unit = pipeline({ mode: 'custom', customSubMode: 'unit', customUnit: 'idol', customAttr: 'cool', musicId: '74' }).options;
    const chars = pipeline({
        mode: 'custom', customSubMode: 'character', customCharacterIds: [1, 21],
        customCharacterUnits: { 21: 'piapro' }, musicId: '74',
    }).options;
    return eq(unit.event_unit, 'idol', 'event_unit')
        ?? eq(unit.custom_bonus_attr, 'cool', 'custom_bonus_attr')
        ?? eq(chars.custom_bonus_character_ids, [1, 21], 'custom_bonus_character_ids')
        ?? eq(chars.custom_bonus_character_support_units, { 21: 'piapro' }, 'custom_bonus_character_support_units');
});

check('最强组卡：综合力 / 技能两个目标', () => {
    const power = pipeline({ mode: 'strongest', strongestTarget: 'power', musicId: '74' }).options;
    const skill = pipeline({ mode: 'strongest', strongestTarget: 'skill', musicId: '74' }).options;
    return eq(power.target, 'power', 'power target') ?? eq(skill.target, 'skill', 'skill target');
});

check('烤森模式：活动 ID + mysekai 目标，且不要求乐曲', () => {
    const { options } = pipeline({ mode: 'mysekai', eventId: '200' });
    return eq(options.event_id, 200, 'event_id')
        ?? eq(options.target, 'mysekai', 'target')
        ?? eq(options.music_id, undefined, 'music_id');
});

check('养成配置逐稀有度下发', () => {
    const { options } = pipeline({ mode: 'event', eventId: '200', musicId: '74' });
    return eq(Object.keys(options).filter((k) => k.endsWith('Config')).sort(), [
        'rarity1Config', 'rarity2Config', 'rarity3Config', 'rarity4Config', 'rarityBirthdayConfig',
    ], '养成配置键');
});

check('特定技能顺序从 1-based 换成引擎的 0-based', () => {
    const { options } = pipeline({
        mode: 'event', eventId: '200', musicId: '74', skillOrder: 'specific', specificSkillOrder: '15243',
    });
    return eq(options.liveSkillOrder, 'specific', 'liveSkillOrder')
        ?? eq(options.specificSkillOrder, '0,4,1,3,2', 'specificSkillOrder');
});

check('协力参数与过滤条件透传', () => {
    const { options } = pipeline({
        mode: 'event', eventId: '200', musicId: '74',
        multiTeammatePower: '250000', multiTeammateScoreUp: '400', multiScoreUpLowerBound: '350',
        boost: '10', otherScore: '1000000', unitFilter: 'idol', attrFilter: 'cool',
        supportMasterMax: true, supportSkillMax: true, filterOtherUnit: true,
        keepAfterTrainingState: true, skillReference: 'max',
        excludedCards: [1], fixedCharacters: [2],
        singleCardOverrides: [{ cardId: 1, level: 1 }],
    });
    return eq(options.multiLiveTeammatePower, 250000, 'multiLiveTeammatePower')
        ?? eq(options.multiLiveTeammateScoreUp, 400, 'multiLiveTeammateScoreUp')
        ?? eq(options.multiLiveScoreUpLowerBound, 350, 'multiLiveScoreUpLowerBound')
        ?? eq(options.boost, 10, 'boost')
        ?? eq(options.otherScore, 1000000, 'otherScore')
        ?? eq(options.unitFilter, 'idol', 'unitFilter')
        ?? eq(options.attrFilter, 'cool', 'attrFilter')
        ?? eq(options.supportMasterMax, true, 'supportMasterMax')
        ?? eq(options.supportSkillMax, true, 'supportSkillMax')
        ?? eq(options.filterOtherUnit, true, 'filterOtherUnit')
        ?? eq(options.keepAfterTrainingState, true, 'keepAfterTrainingState')
        ?? eq(options.skillReferenceChooseStrategy, 'max', 'skillReferenceChooseStrategy')
        ?? eq(options.excludedCards, [1], 'excludedCards')
        ?? eq(options.fixedCharacters, [2], 'fixedCharacters')
        ?? eq(options.singleCardConfigs?.length, 1, 'singleCardConfigs');
});

// ==================== 契约完整性 ====================
console.log('G) 契约完整性');

check('worker 入参里的成组字段一个都不能少', () => {
    const { args } = pipeline({
        ...SIM_BASE, simType: 'marathon', simBonusMode: 'character', simCharacterIds: [1],
        leaderCharacterId: 3, areaItemLevel: '10',
    });
    const missing = ['simulatedEvent', 'userDataOverrides', 'leaderCharacterId']
        .filter((key) => args[key] === undefined);
    return missing.length === 0 ? null : `缺少 ${missing.join(', ')}`;
});

console.log(
    `\n参数映射测试：${pass} 项通过${failures.length ? `，${failures.length} 项失败：${failures.join('; ')}` : '，全部命中'}`,
);
if (failures.length) process.exit(1);
