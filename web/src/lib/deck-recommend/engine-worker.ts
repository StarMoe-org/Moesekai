/**
 * 组卡计算 worker（allium-deck 引擎）。
 *
 * 数据链路：SnowyDataProvider/CachedDeckDataProvider 负责 master data、
 * 用户数据与音乐元数据的拉取和缓存；计算交给 allium-deck wasm 引擎
 * （lib/deck-engine/wasm-loader）。连接世界/WL3 模拟由引擎按 world_bloom
 * 参数在内部合成，不再改写 master data。
 */
import {
    CachedDeckDataProvider,
    ENGINE_OPTIONAL_MASTER_KEYS,
    fetchEngineMusicMetas,
    PRELOAD_MASTER_KEYS,
    SnowyDataProvider,
    type HarukiServer,
} from "@/lib/deck-recommend/data-provider";
import { WL3_SIMULATION_GROUPS } from "@/lib/world-bloom-simulation";
import {
    buildEngineOptions,
    type EngineOptionsEventRow,
    type EngineOptionsWorldBloomRow,
} from "@/lib/deck-recommend/engine-options";
import {
    loadDeckEngine,
    type DeckEngine,
    type DeckEngineUserHandle,
} from "@/lib/deck-engine/wasm-loader";
import { resolveDeckScore } from "./deck-score";
import { applyUserDataOverrides } from "./user-data-overrides";
import type {
    DeckResultCard,
    DeckResultDeck,
    DeckUserCard,
    DeckWorkerInput,
    DeckWorkerOutput,
} from "./engine-types";

function sendProgress(stage: string, percent: number, progressKey: string) {
    const message: DeckWorkerOutput = { type: "progress", stage, percent, progressKey };
    postMessage(message);
}

/** 单曲收益查询消息（引擎与 master data 常驻 worker，无需重新加载）。 */
interface MusicRequest {
    requestId: number;
    liveType: string;
    eventType?: string;
    skillOrder?: string;
    teammates?: { power?: number; scoreUp?: number };
    deck: {
        totalPower: number;
        eventBonusRate: number;
        supportDeckBonusRate: number;
        cards: { skillScoreUp: number; skillLifeRecovery: number }[];
    };
}

interface MasterCacheEntry {
    server: string;
    tables: Record<string, unknown[]>;
    musicMetas: unknown[];
}

interface UserCacheEntry {
    key: string;
    userData: Record<string, unknown>;
}

interface HandleCacheEntry {
    key: string;
    handle: DeckEngineUserHandle;
}

/** worker 常驻缓存：master data 按区服缓存一次，用户句柄按账号缓存一次。
 *  二次计算跳过全部网络与 wasm 数据加载，只有引擎搜索本身的开销。 */
let masterCache: MasterCacheEntry | null = null;
let masterInFlight: {
    server: string;
    promise: Promise<{ engine: DeckEngine; master: MasterCacheEntry }>;
} | null = null;

let userCache: UserCacheEntry | null = null;
let userInFlight: {
    key: string;
    promise: Promise<{
        engine: DeckEngine;
        master: MasterCacheEntry;
        userCache: UserCacheEntry;
        handleCache: HandleCacheEntry;
    }>;
} | null = null;

let handleCache: HandleCacheEntry | null = null;

function hasEffectiveUserDataOverrides(input: DeckWorkerInput): boolean {
    if (input.characterFilterIds && input.characterFilterIds.length > 0) {
        return true;
    }
    const o = input.userDataOverrides;
    if (!o) return false;
    if (o.areaItemLevel !== null && o.areaItemLevel !== undefined && o.areaItemLevel > 0) return true;
    if (o.areaItemLevelOverrides && o.areaItemLevelOverrides.length > 0) return true;
    if (o.characterRank !== null && o.characterRank !== undefined && o.characterRank > 0) return true;
    if (o.characterRankOverrides && o.characterRankOverrides.length > 0) return true;
    if (o.mysekaiGateLevel !== null && o.mysekaiGateLevel !== undefined && o.mysekaiGateLevel > 0) return true;
    if (o.mysekaiGateLevelOverrides && o.mysekaiGateLevelOverrides.length > 0) return true;
    if (o.mysekaiFixtureBonusRate !== null && o.mysekaiFixtureBonusRate !== undefined && o.mysekaiFixtureBonusRate >= 0) return true;
    if (o.mysekaiFixtureBonusRateOverrides && o.mysekaiFixtureBonusRateOverrides.length > 0) return true;
    return false;
}

async function ensureMasterData(
    server: string,
    userId?: string,
    oauthAccessToken?: string,
    onProgress?: (stage: string, percent: number, progressKey: string) => void,
): Promise<{ engine: DeckEngine; master: NonNullable<typeof masterCache> }> {
    const engine = await loadDeckEngine();
    if (masterCache && masterCache.server === server) {
        return { engine, master: masterCache };
    }
    if (masterInFlight && masterInFlight.server === server) {
        return await masterInFlight.promise;
    }

    if (handleCache) {
        engine.disposeUser(handleCache.handle);
        handleCache = null;
    }
    userCache = null;
    userInFlight = null;

    onProgress?.("fetching", 5, "page.deckRecommend.progress.fetchingUserData");

    const promise = (async () => {
        const dataProvider = new CachedDeckDataProvider(
            new SnowyDataProvider(userId || "0", server as HarukiServer, oauthAccessToken || null),
        );

        const [musicMetas] = await Promise.all([
            fetchEngineMusicMetas(),
            dataProvider.preloadMasterData(PRELOAD_MASTER_KEYS),
        ]);

        onProgress?.("processing", 25, "page.deckRecommend.progress.loadingEngine");

        const tables: Record<string, unknown[]> = {};
        for (const key of PRELOAD_MASTER_KEYS) {
            tables[key] = await dataProvider.getMasterData(key);
        }
        for (const key of ENGINE_OPTIONAL_MASTER_KEYS) {
            try {
                tables[key] = await dataProvider.getMasterData(key);
            } catch {
                // 站点不下发的表：引擎走内建 fallback（上限 4/5、终章 140%）。
            }
        }
        engine.loadMasterData(tables, musicMetas as unknown[]);
        masterCache = {
            server,
            tables,
            musicMetas: musicMetas as unknown[],
        };
        return { engine, master: masterCache };
    })().finally(() => {
        if (masterInFlight?.server === server) {
            masterInFlight = null;
        }
    });

    masterInFlight = { server, promise };
    return await promise;
}

async function ensureUserData(
    server: string,
    userId: string,
    oauthAccessToken?: string,
    onProgress?: (stage: string, percent: number, progressKey: string) => void,
): Promise<{
    engine: DeckEngine;
    master: NonNullable<typeof masterCache>;
    userCache: NonNullable<typeof userCache>;
    handleCache: NonNullable<typeof handleCache>;
}> {
    const { engine, master } = await ensureMasterData(server, userId, oauthAccessToken, onProgress);
    const userKey = `${userId}|${server}|${oauthAccessToken ?? ""}`;

    if (userCache && userCache.key === userKey && handleCache && handleCache.key === userKey) {
        return { engine, master, userCache, handleCache };
    }

    if (userInFlight && userInFlight.key === userKey) {
        return await userInFlight.promise;
    }

    const promise = (async () => {
        if (!userCache || userCache.key !== userKey) {
            if (handleCache) {
                engine.disposeUser(handleCache.handle);
                handleCache = null;
            }
            onProgress?.("fetching", 10, "page.deckRecommend.progress.fetchingUserData");
            const dataProvider = new CachedDeckDataProvider(
                new SnowyDataProvider(userId, server as HarukiServer, oauthAccessToken || null),
            );
            const userData = (await dataProvider.getUserDataAll()) as Record<string, unknown>;
            userCache = { key: userKey, userData };
        }

        if (!handleCache || handleCache.key !== userKey) {
            if (handleCache) {
                engine.disposeUser(handleCache.handle);
            }
            const user = engine.createUserData(server, userCache.userData);
            handleCache = { key: userKey, handle: user };
        }

        return { engine, master, userCache: userCache!, handleCache: handleCache! };
    })().finally(() => {
        if (userInFlight?.key === userKey) {
            userInFlight = null;
        }
    });

    userInFlight = { key: userKey, promise };
    return await promise;
}

async function runDeck(input: DeckWorkerInput): Promise<DeckWorkerOutput> {
    const { mode, userId, server, oauthAccessToken, target } = input;

    // 1. 确保 Master data 与 User data 已加载进引擎缓存
    const { engine, master, userCache: cachedUser } = await ensureUserData(
        server,
        userId,
        oauthAccessToken,
        sendProgress,
    );

    const { tables } = master;
    const { userData } = cachedUser;
    const uploadTime = userData.upload_time as number | undefined;
    const userCards = (userData.userCards ?? []) as DeckUserCard[];

    // 2. 进阶数据覆盖与角色过滤：按 Haruki 语义改写快照后交给引擎。
    // 无覆盖且账号未变时直接复用已解析的用户句柄（跳过 createUserData）。
    const hasOverrides = hasEffectiveUserDataOverrides(input);
    const userKey = `${userId}|${server}|${oauthAccessToken ?? ""}`;
    let user: DeckEngineUserHandle;
    let isTempUser = false;
    if (!hasOverrides && handleCache && handleCache.key === userKey) {
        user = handleCache.handle;
    } else {
        const preparedUserData = applyUserDataOverrides(
            userData,
            input.userDataOverrides,
            tables,
            input.characterFilterIds,
        );
        user = engine.createUserData(server, preparedUserData);
        if (!hasOverrides) {
            if (handleCache) engine.disposeUser(handleCache.handle);
            handleCache = { key: userKey, handle: user };
        } else {
            isTempUser = true;
        }
    }

    try {
        sendProgress("calculating", 50, "page.deckRecommend.progress.calculating");

        const options = buildEngineOptions(input, {
            eventRows: (tables.events ?? []) as EngineOptionsEventRow[],
            worldBloomRows: (tables.worldBlooms ?? []) as EngineOptionsWorldBloomRow[],
            wl3SimulationEventIds: WL3_SIMULATION_GROUPS.map((group) => group.eventId),
        });
        const { decks, performance, completion } = engine.recommend(options, user);

        const result = decks.map(
            (deck): DeckResultDeck => {
                const displayScore = resolveDeckScore({
                    mode,
                    target: mode === "event" ? target : undefined,
                    strongestTarget: mode === "strongest" ? input.strongestTarget : undefined,
                    targetValue: deck.target_value,
                    eventPoint: deck.event_point ?? undefined,
                });
                return {
                    rank: deck.rank,
                    score: displayScore,
                    eventPoint: deck.event_point ?? undefined,
                    liveScore: deck.live_score,
                    totalPower: deck.total_power,
                    eventBonus: deck.event_bonus_total ?? undefined,
                    effectiveSkill: deck.multi_live_score_up ?? deck.skill_score,
                    cards: deck.cards.map(
                        (card): DeckResultCard => ({
                            cardId: card.card_id,
                            characterId: card.character_id,
                            assetKey: card.asset_key,
                            rarity: card.rarity,
                            attr: card.attr,
                            level: card.level,
                            masterRank: card.master_rank,
                            skillLevel: card.skill_level,
                            power: card.power_total,
                            skillScoreUp: card.skill_score_up,
                            eventBonus: card.event_bonus ?? 0,
                            episode1Read: card.episode1_read,
                            episode2Read: card.episode2_read,
                            hasCanvasBonus: card.has_canvas_bonus,
                            canvasPower: card.canvas_power,
                        }),
                    ),
                };
            },
        );

        sendProgress("done", 100, "page.deckRecommend.progress.calculationComplete");
        return {
            type: "result",
            result,
            userCards,
            duration: performance.build_pool_ms + performance.search_ms,
            completion,
            upload_time: uploadTime,
        };
    } finally {
        // 复用路径不释放句柄（handleCache 持有）；仅临时创建的覆盖句柄在此释放。
        if (isTempUser) {
            engine.disposeUser(user);
        }
    }
}

interface WarmupMessage {
    server?: string;
    userId?: string;
    oauthAccessToken?: string;
}

self.onmessage = async (
    event: MessageEvent<{
        args?: DeckWorkerInput;
        music?: MusicRequest;
        warmup?: boolean | WarmupMessage;
        server?: string;
        userId?: string;
        oauthAccessToken?: string;
    }>
) => {
    const { args, music, warmup } = event.data;
    if (warmup) {
        // 预热：提前加载 wasm 实例、区服 master data 与用户数据，让首次真实计算零延迟直接产出结果。
        const warmupData: WarmupMessage = typeof warmup === "object" ? warmup : {};
        const warmupServer = warmupData.server || event.data.server;
        const warmupUserId = warmupData.userId || event.data.userId;
        const warmupToken = warmupData.oauthAccessToken || event.data.oauthAccessToken;

        (async () => {
            if (warmupServer && warmupUserId && warmupUserId.trim()) {
                await ensureUserData(warmupServer, warmupUserId.trim(), warmupToken);
            } else if (warmupServer) {
                await ensureMasterData(warmupServer);
            } else {
                await loadDeckEngine();
            }
            postMessage({ type: "warm", ready: true });
        })().catch((err) => {
            console.warn("deck worker warmup failed:", err);
            postMessage({ type: "warm", ready: false });
        });
        return;
    }
    if (music) {
        // 单曲收益：master data 已在 worker 内缓存；音乐推荐不依赖用户数据。
        try {
            const engine = await loadDeckEngine();
            const raw = engine.recommendMusic({
                    live_type: music.liveType,
                    event_type: music.eventType,
                    skill_order_choose_strategy: music.skillOrder ?? "average",
                    multi_live_teammate_score_up: music.teammates?.scoreUp,
                    multi_live_teammate_power: music.teammates?.power,
                    deck: {
                        total_power: music.deck.totalPower,
                        event_bonus_rate: music.deck.eventBonusRate,
                        support_deck_bonus_rate: music.deck.supportDeckBonusRate,
                        cards: music.deck.cards.map((c) => ({
                            skill_score_up: c.skillScoreUp,
                            skill_life_recovery: c.skillLifeRecovery,
                        })),
                    },
                });
            const rows = raw
                .map((row) => ({
                    musicId: row.music_id,
                    difficulty: row.difficulty,
                    liveScore: row.live_score,
                    eventPoint: row.event_point ?? undefined,
                }))
                .sort((a, b) => (b.eventPoint ?? b.liveScore) - (a.eventPoint ?? a.liveScore));
            postMessage({ type: "music", requestId: music.requestId, rows });
        } catch (err) {
            postMessage({ type: "music", requestId: music.requestId, rows: [] });
            console.error("music ranking failed:", err);
        }
        return;
    }
    if (!args) return;
    try {
        postMessage(await runDeck(args));
    } catch (err) {
        postMessage({
            type: "result",
            error: err instanceof Error ? err.message : String(err),
        } satisfies DeckWorkerOutput);
    }
};
