/**
 * Web Worker for score-control deck building.
 *
 * Uses the allium-deck engine to find decks for exact event-bonus tiers
 * (target=bonus + target_bonus_list); the score-control page then maps each
 * tier to the score range that lands on the target PT. The worker protocol
 * matches the previous sekai-calculator implementation, so the page is
 * untouched.
 */
import {
    calcDuration,
    CachedDeckDataProvider,
    ENGINE_OPTIONAL_MASTER_KEYS,
    fetchEngineMusicMetas,
    PRELOAD_MASTER_KEYS,
    type HarukiServer,
    SnowyDataProvider,
} from "./data-provider";
import {
    loadDeckEngine,
    type DeckSearchCompletion,
    type DeckEngineUserHandle,
} from "@/lib/deck-engine/wasm-loader";

/** Per-rarity training switches sent by the score-control page (page form field names). */
export interface DeckBuilderCardConfig {
    disable?: boolean;
    rankMax?: boolean;
    episodeRead?: boolean;
    masterMax?: boolean;
    skillMax?: boolean;
}

interface UserCardEntry {
    cardId: number;
    [key: string]: unknown;
}

interface EventInfoLite {
    id: number;
    eventType?: string;
}

type DeckResultRow = Record<string, unknown>;

// ==================== WORKER LOGIC ====================

// Types

export interface DeckBuilderInput {
    userId: string;
    server: string;
    oauthAccessToken?: string;
    eventId: number;
    /** Bonus tiers derived from the page's route planning; only these tiers are built (takes precedence over the range mode). */
    bonusTiers?: number[];
    minBonus: number;
    maxBonus: number;
    liveType: string; // "multi" | "solo" | "auto" | "cheerful"
    musicId: number;
    difficulty: string;
    supportCharacterId?: number;
    cardConfig: Record<string, DeckBuilderCardConfig>;
}

export interface DeckBuilderOutput {
    result?: DeckResultRow[];
    userCards?: UserCardEntry[];
    duration?: number;
    completion?: DeckSearchCompletion;
    error?: string;
    upload_time?: number;
}

/** Max tiers per target_bonus_list batch (MAX_TARGET_BONUS_BUCKETS=32). */
const BONUS_BATCH_SIZE = 32;

function chunk<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < values.length; i += size) {
        chunks.push(values.slice(i, i + size));
    }
    return chunks;
}

const RARITY_CONFIG_KEYS: Record<string, string> = {
    rarity_1: "rarity1Config",
    rarity_2: "rarity2Config",
    rarity_3: "rarity3Config",
    rarity_4: "rarity4Config",
    rarity_birthday: "rarityBirthdayConfig",
};

/** Persistent worker cache: master data by server, user handle by account. */
let masterCache: {
    server: string;
    tables: Record<string, unknown[]>;
    musicMetas: unknown[];
} | null = null;
let userCache: {
    key: string;
    userData: Record<string, unknown>;
} | null = null;
let handleCache: { key: string; handle: DeckEngineUserHandle } | null = null;

async function deckBuilderRunner(args: DeckBuilderInput): Promise<DeckBuilderOutput> {
    const {
        userId, server, oauthAccessToken, eventId, minBonus, maxBonus,
        liveType: liveTypeStr, musicId, difficulty,
        supportCharacterId, cardConfig,
    } = args;

    const currentDuration = calcDuration();
    const engine = await loadDeckEngine();

    if (!masterCache || masterCache.server !== server) {
        if (handleCache) {
            engine.disposeUser(handleCache.handle);
            handleCache = null;
        }
        userCache = null;

        const dataProvider = new CachedDeckDataProvider(
            new SnowyDataProvider(userId, server as HarukiServer, oauthAccessToken || null),
        );
        const [musicMetas] = await Promise.all([
            fetchEngineMusicMetas(),
            dataProvider.preloadMasterData(PRELOAD_MASTER_KEYS),
        ]);
        const tables: Record<string, unknown[]> = {};
        for (const key of PRELOAD_MASTER_KEYS) {
            tables[key] = await dataProvider.getMasterData(key);
        }
        for (const key of ENGINE_OPTIONAL_MASTER_KEYS) {
            try {
                tables[key] = await dataProvider.getMasterData(key);
            } catch {
                // Tables the site does not serve: the engine falls back to built-ins.
            }
        }
        engine.loadMasterData(tables, musicMetas as unknown[]);
        masterCache = {
            server,
            tables,
            musicMetas: musicMetas as unknown[],
        };
    }

    const userKey = `${userId}|${server}|${oauthAccessToken ?? ""}`;
    if (!userCache || userCache.key !== userKey) {
        if (handleCache) {
            engine.disposeUser(handleCache.handle);
            handleCache = null;
        }
        const dataProvider = new CachedDeckDataProvider(
            new SnowyDataProvider(userId, server as HarukiServer, oauthAccessToken || null),
        );
        const userData = (await dataProvider.getUserDataAll()) as Record<string, unknown>;
        userCache = { key: userKey, userData };
    }

    const { tables } = masterCache;
    const { userData } = userCache;
    const userCards = (userData.userCards as UserCardEntry[] | undefined) ?? [];
    const uploadTime = userData.upload_time as number | undefined;

    let user: DeckEngineUserHandle;
    if (handleCache && handleCache.key === userKey) {
        user = handleCache.handle;
    } else {
        if (handleCache) engine.disposeUser(handleCache.handle);
        user = engine.createUserData(server, userData);
        handleCache = { key: userKey, handle: user };
    }

    try {
        // Cheerful carnival conversion (identical to the deck recommend page).
        let computedLiveType: string = liveTypeStr;
        const events = (tables.events ?? []) as EventInfoLite[];
        const event0 = events.find((it) => it.id === eventId);
        if (event0?.eventType === "cheerful_carnival" && computedLiveType === "multi") {
            computedLiveType = "cheerful";
        }

        const options: Record<string, unknown> = {
            event_id: eventId,
            target: "bonus",
            live_type: computedLiveType,
            music_id: musicId,
            music_diff: difficulty,
            limit: 10,
            // Exact-tier search finishes in milliseconds; 30s is just a fuse.
            timeout_ms: 30_000,
        };
        if (event0?.eventType === "world_bloom" && supportCharacterId) {
            options.world_bloom_character_id = supportCharacterId;
        }
        for (const [rarityKey, configKey] of Object.entries(RARITY_CONFIG_KEYS)) {
            const config = cardConfig[rarityKey];
            if (!config) continue;
            options[configKey] = {
                disable: config.disable,
                levelMax: config.rankMax,
                episodeRead: config.episodeRead,
                masterMax: config.masterMax,
                skillMax: config.skillMax,
            };
        }

        // Target tiers from the page's route planning take precedence; otherwise
        // the whole bonus range is used (batched by 32 tiers per engine call).
        const bonusList: number[] = args.bonusTiers && args.bonusTiers.length > 0
            ? args.bonusTiers
            : (() => {
                  const list: number[] = [];
                  for (let bonus = Math.max(1, minBonus); bonus <= maxBonus; bonus++) {
                      list.push(bonus);
                  }
                  return list;
              })();

        const results: DeckResultRow[] = [];
        let completion: DeckSearchCompletion = "complete";
        for (const batch of chunk(bonusList, BONUS_BATCH_SIZE)) {
            const response = engine.recommend({ ...options, target_bonus_list: batch }, user);
            if (response.completion === "timed_out") completion = "timed_out";
            const { decks } = response;
            for (const deck of decks) {
                results.push({
                    eventBonus: deck.event_bonus_total ?? 0,
                    score: deck.live_score,
                    cards: deck.cards.map((card) => ({
                        cardId: card.card_id,
                        cardRarityType: card.rarity,
                        masterRank: card.master_rank,
                        level: card.level,
                    })),
                });
            }
        }

        return {
            result: results,
            userCards,
            duration: currentDuration.done(),
            completion,
            upload_time: uploadTime,
        };
    } finally {
        // User handle is kept in handleCache across multiple calls
    }
}

// Worker message handler
addEventListener("message", (event: MessageEvent<{ args?: DeckBuilderInput; warmup?: boolean }>) => {
    if (event.data.warmup) {
        // Preload the wasm instance so the first real search skips engine boot.
        loadDeckEngine()
            .then(() => postMessage({ warm: true }))
            .catch(() => postMessage({ warm: false }));
        return;
    }
    if (!event.data.args) return;
    deckBuilderRunner(event.data.args)
        .then((output) => {
            postMessage(output);
        })
        .catch((err) => {
            postMessage({
                error: err instanceof Error ? err.message : String(err),
            });
        });
});
