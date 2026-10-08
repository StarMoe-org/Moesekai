/**
 * 组卡 wasm 引擎冒烟测试（Node，不进构建）。
 *
 * 目的：在接入组卡页面之前，先证明
 *   1) allium-deck wasm 能实例化
 *   2) 站点下发的 master 表集合能被 loadMasterData 接受
 *      （可选表缺失时走引擎内建 fallback，不阻断）
 *   3) createUserData + recommend 在活动/控分/WL3 模拟路径都能出非空结果
 *
 * 用真实 master data（和 app 同源）+ 合成的用户数据，所以不需要真实账号。
 *
 * 使用方法: node --experimental-strip-types scripts/smoke-deck-engine.mjs
 *   ALLIUM_DECK_WASM_DIR=... 可指定本地 wasm 产物目录，默认用 public/wasm。
 */

import { existsSync, readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import assert from 'node:assert/strict';
import { buildEngineOptions } from '../src/lib/deck-recommend/engine-options.ts';
import { readSearchCompletion } from '../src/lib/deck-engine/search-completion.ts';

const MASTER_BASE = 'https://metadata.exmeaning.com/jp/master';
const MUSIC_META_URL = 'https://moe.exmeaning.com/data/music_meta/music_metas.json';

/** 与 src/lib/deck-recommend/data-provider.ts 的 PRELOAD_MASTER_KEYS 保持一致。 */
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

/** 引擎可选表：缺失时走内建 fallback，与组卡 worker 的容错一致。 */
const ENGINE_OPTIONAL_MASTER_KEYS = [
    'eventCardBonusLimits',
    'eventHonorBonuses',
    'eventSkillScoreUpLimits',
    'eventShuffleUnitBonuses',
    'eventMysekaiFixtureGameCharacterPerformanceBonusLimits',
];

const webRoot = resolve(import.meta.dirname ?? '.', '..');

/** WL 支援加成表不在远端 master data 里，站点从本地 /data/ 下发，
 *  与 src/lib/deck-recommend/data-provider.ts 的 LOCAL_MASTER_DATA_PATHS 一致。 */
const LOCAL_MASTER_KEYS = [
    'worldBloomSupportDeckBonusesWL1',
    'worldBloomSupportDeckBonusesWL2',
    'worldBloomSupportDeckBonusesWL3',
];

// WL3 模拟第 1 组（成员与 src/lib/world-bloom-simulation.ts 一致）。
const WL3_GROUP1 = { groupId: 1, eventId: 3200001, members: [21, 1, 6, 14, 17] };

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

/** 限并发，太多并行请求会被本地代理掐断。 */
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

async function fetchMasterData() {
    const optional = new Set(ENGINE_OPTIONAL_MASTER_KEYS);
    const remote = [...PRELOAD_MASTER_KEYS, ...ENGINE_OPTIONAL_MASTER_KEYS].filter(
        (key) => !LOCAL_MASTER_KEYS.includes(key),
    );
    const entries = await mapWithConcurrency(remote, 4, async (key) => {
        try {
            return [key, await fetchJson(`${MASTER_BASE}/${key}.json`)];
        } catch (err) {
            if (!optional.has(key)) throw err;
            console.warn(`  (引擎可选表缺失，跳过) ${key}: ${err.message}`);
            return null;
        }
    });
    for (const key of LOCAL_MASTER_KEYS) {
        // Node 下没有站点根，直接读仓库内的 public/data 副本。
        const localPath = resolve(webRoot, 'public', 'data', `${key}.json`);
        entries.push([key, JSON.parse(readFileSync(localPath, 'utf8'))]);
    }
    return Object.fromEntries(entries.filter(Boolean));
}

/** 合成一份最小用户数据：每个角色拿一张能找到的 4 星卡。 */
function buildSyntheticUserData(master) {
    const byCharacter = new Map();
    for (const card of master.cards) {
        if (card.cardRarityType !== 'rarity_4') continue;
        if (!byCharacter.has(card.characterId)) byCharacter.set(card.characterId, card);
    }
    const picked = [...byCharacter.values()].slice(0, 30);

    return {
        userGamedata: { userId: 1, name: 'smoke', deck: 1, rank: 1 },
        userCards: picked.map((card) => ({
            cardId: card.id,
            level: 60,
            masterRank: 0,
            skillLevel: 1,
            specialTrainingStatus: 'done',
            defaultImage: 'special_training',
            episodes: (master.cardEpisodes ?? [])
                .filter((ep) => ep.cardId === card.id)
                .map((ep) => ({ cardEpisodeId: ep.id, scenarioStatus: 'already_read' })),
        })),
        userCharacters: master.gameCharacters.map((c) => ({
            characterId: c.id,
            characterRank: 1,
        })),
        userAreas: [],
        userDecks: [],
        userHonors: [],
        userChallengeLiveSoloDecks: [],
        userMysekaiCanvases: [],
        userMysekaiGates: [],
        userMysekaiFixtureGameCharacterPerformanceBonuses: [],
    };
}

/** public/wasm 下是 copy-wasm 改名后的 allium-deck.*；wasm-pack 产物与
 *  npm 包是原名 allium_deck.*，ALLIUM_DECK_WASM_DIR 两种都认。 */
function resolveArtifacts(dir) {
    for (const [glue, wasm] of [
        ['allium-deck.js', 'allium-deck_bg.wasm'],
        ['allium_deck.js', 'allium_deck_bg.wasm'],
    ]) {
        if (existsSync(`${dir}/${glue}`)) return { glue: `${dir}/${glue}`, wasm: `${dir}/${wasm}` };
    }
    throw new Error(`${dir} 里没有 allium-deck.js / allium_deck.js`);
}

async function main() {
    const artifacts = resolveArtifacts(resolve(process.env.ALLIUM_DECK_WASM_DIR || `${webRoot}/public/wasm`));

    console.log(`1) 加载 wasm 模块（${artifacts.glue}）…`);
    // 与 lib/deck-engine/wasm-loader.ts 相同的动态 import 方式；Node 下
    // fetch 不支持 file://，直接把 wasm 字节喂给 init。
    const mod = await import(pathToFileURL(artifacts.glue).href);
    await mod.default(new Uint8Array(readFileSync(artifacts.wasm)));
    console.log('   ok');

    console.log('2) 拉取 master data…');
    const master = await fetchMasterData();
    console.log(`   ${Object.keys(master).length} 张表, cards=${master.cards.length}`);

    const musicMetas = await fetchJson(MUSIC_META_URL);
    console.log(`   musicMetas=${musicMetas.length}`);

    console.log('3) loadMasterData…');
    // 与 lib/deck-engine/wasm-loader.ts 相同的载荷约定：裸表名 → JSON 原文。
    const payload = {};
    for (const [name, rows] of Object.entries(master)) {
        payload[`${name}.json`] = JSON.stringify(rows);
    }
    mod.load_masterdata(JSON.stringify(payload), JSON.stringify(musicMetas));
    console.log('   ok');

    console.log('4) createUserData（合成账号）…');
    const userData = mod.create_user_data(JSON.stringify(buildSyntheticUserData(master)), 'jp');
    console.log('   ok');

    const meta = musicMetas[0];
    const base = { live_type: 'multi', music_id: meta.music_id, music_diff: meta.difficulty, limit: 3, timeout_ms: 15000 };
    const run = (options) => {
        const response = JSON.parse(mod.recommendWithUserData(JSON.stringify({ ...base, ...options }), userData));
        readSearchCompletion(response);
        console.log(`   completion=${response.completion}`);
        return response;
    };

    console.log('5) recommend(target=power)…');
    const power = run({ target: 'power' });
    console.log(
        `   decks=${power.decks.length}, pool=${power.performance.pool_size}, ` +
            `top: power=${power.decks[0]?.total_power} cards=[${power.decks[0]?.cards.map((c) => c.card_id).join(', ')}]`,
    );
    if (power.decks.length === 0) throw new Error('没有返回任何卡组');

    const events = [...master.events].sort((a, b) => a.startAt - b.startAt);
    const latestEvent = events.at(-1);
    console.log(`6) recommend(event_id=${latestEvent.id}, target=score)…`);
    const score = run({ event_id: latestEvent.id, target: 'score' });
    console.log(
        `   decks=${score.decks.length}` +
            (score.decks[0] ? `, top: pt=${score.decks[0].event_point} bonus=${score.decks[0].event_bonus_total}%` : ''),
    );
    if (score.decks.length === 0) throw new Error('活动 PT 路径没有返回卡组');

    // 控分组卡：target=bonus + target_bonus_list（精确加成档位）。引擎的终章路径不支持
    // bonus target（与 #180 相同，直接报错），最新活动是终章时改用最近的非终章活动。
    const finaleIds = new Set(
        master.worldBlooms.filter((row) => row.worldBloomChapterType === 'finale').map((row) => row.eventId),
    );
    const bonusEvent = events.filter((event) => !finaleIds.has(event.id)).at(-1);
    const bonusBase = bonusEvent.id === latestEvent.id ? score : run({ event_id: bonusEvent.id, target: 'score' });
    const topBonus = Math.round(bonusBase.decks[0]?.event_bonus_total ?? 0);
    const lo = Math.max(0, topBonus - 26);
    const hi = Math.min(topBonus + 5, lo + 31); // 引擎单次最多 32 档
    console.log(`7) recommend(event_id=${bonusEvent.id}, target=bonus, target_bonus_list=[${lo}..${hi}])…`);
    const bonus = run({
        event_id: bonusEvent.id,
        target: 'bonus',
        target_bonus_list: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
        limit: 1,
    });
    console.log(`   decks=${bonus.decks.length}, 可达加成=${bonus.decks.map((d) => d.event_bonus_total).join(', ')}`);
    if (bonus.decks.length === 0) throw new Error('target=bonus 在可达区间内没返回卡组');

    console.log(`8) WL3 模拟（turn=3, characterId=${WL3_GROUP1.members[1]}）…`);
    const wl3 = run({
        world_bloom_event_turn: 3,
        world_bloom_character_id: WL3_GROUP1.members[1],
        target: 'score',
    });
    console.log(
        `   decks=${wl3.decks.length}` +
            (wl3.decks[0] ? `, top: pt=${wl3.decks[0].event_point} bonus=${wl3.decks[0].event_bonus_total}%` : ''),
    );
    if (wl3.decks.length === 0) throw new Error('WL3 模拟路径没有返回卡组');

    console.log('9) getWorldBloomSupportCards…');
    const support = JSON.parse(
        mod.get_world_bloom_support_cards(
            JSON.stringify({
                user_data_str: JSON.stringify(buildSyntheticUserData(master)),
                world_bloom_event_turn: 3,
                world_bloom_character_id: WL3_GROUP1.members[1],
            }),
        ),
    );
    console.log(`   support cards=${support.length}, top bonus=${support[0]?.bonus}`);
    if (support.length === 0) throw new Error('WL 支援卡列表为空');

    console.log('10) Consumer pins retain free-leader membership semantics on JP #218…');
    const pinnedCards = power.decks[0].cards.map((card) => card.card_id);
    const pinInput = {
        mode: 'event', eventId: 218, eventType: 'world_bloom', liveType: 'multi',
        musicId: meta.music_id, difficulty: meta.difficulty, target: 'score',
        cardConfig: {}, fixedCards: pinnedCards, limit: 3, timeoutMs: 15000,
    };
    const context = { eventRows: master.events, worldBloomRows: master.worldBlooms, wl3SimulationEventIds: [] };
    const pinned = run(buildEngineOptions(pinInput, context));
    assert.equal(pinned.completion, 'complete', 'Five fixed cards must finish before asserting optimality');
    assert.equal(pinned.decks.length, 1, 'Permutations remain one distinct public card set');
    assert.deepEqual(pinned.decks[0].cards.map((card) => card.card_id).sort((a, b) => a - b),
        [...pinnedCards].sort((a, b) => a - b));
    const reordered = run(buildEngineOptions({ ...pinInput, fixedCards: [...pinnedCards].reverse() }, context));
    assert.equal(reordered.completion, 'complete');
    assert.deepEqual(reordered.decks, pinned.decks, 'Pin order must not silently choose a leader');
    for (const card of power.decks[0].cards) {
        const forced = run(buildEngineOptions({ ...pinInput, leaderCharacterId: card.character_id }, context));
        assert.equal(forced.completion, 'complete');
        assert.equal(forced.decks[0].cards[0].character_id, card.character_id);
        assert.ok(pinned.decks[0].target_value >= forced.decks[0].target_value,
            'Free leader must cover every explicitly selected leader');
    }

    const mixedInput = {
        ...pinInput,
        fixedCards: pinnedCards.slice(0, 3),
        fixedCharacters: power.decks[0].cards.slice(3).map((card) => card.character_id),
    };
    const mixed = run(buildEngineOptions(mixedInput, context));
    assert.equal(mixed.completion, 'complete');
    assert.ok(mixed.decks.length > 0);
    for (const deck of mixed.decks) {
        assert.ok(mixedInput.fixedCards.every((id) => deck.cards.some((card) => card.card_id === id)));
        assert.ok(mixedInput.fixedCharacters.every((id) => deck.cards.some((card) => card.character_id === id)));
    }

    userData.free();
    console.log('\n冒烟测试通过。');
}

main().catch((err) => {
    console.error('\n冒烟测试失败:', err);
    process.exit(1);
});
