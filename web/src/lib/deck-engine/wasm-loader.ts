/**
 * 组卡 wasm 引擎加载器（allium-deck）。
 *
 * 引擎是 @empty-sekai/allium-deck-wasm —— Rust 编写的组卡搜索引擎
 * （allium-deck）的 WebAssembly 构建，导出 wasm-bindgen 风格的
 * `load_masterdata` / `recommend` / `createUserData` 等函数。
 *
 * 产物由 scripts/copy-wasm-artifacts.mjs 拷到 public/wasm/，运行时用动态
 * import 直接从 /wasm/ 加载。wasm-bindgen 的 glue 是标准 ES module，
 * 与 emscripten 不同，不需要绕打包器；但引擎和 master data 都是
 * CPU/内存大户，加载与调用都只应在 Web Worker 里发生。
 */

import { DECK_ENGINE_WASM_VERSION } from "./wasm-version";
import { readSearchCompletion, type DeckSearchCompletion } from "./search-completion";
export type { DeckSearchCompletion } from "./search-completion";

/** 用户数据句柄：解析成本只付一次，后续多次 recommend 复用。 */
export interface DeckEngineUserHandle {
    readonly region: string;
    free(): void;
}

/** 引擎返回的单条卡组（原始 JSON 已展开）。 */
export interface DeckEngineCard {
    card_id: number;
    asset_key: string;
    rarity: string;
    attr: string;
    character_id: number;
    level: number;
    master_rank: number;
    power_total: number;
    skill_score_up: number;
    skill_level: number;
    episode1_read: boolean;
    episode2_read: boolean;
    has_canvas_bonus: boolean;
    canvas_power: number;
    event_bonus?: number | null;
}

export interface DeckEngineDeck {
    rank: number;
    cards: DeckEngineCard[];
    total_power: number;
    live_score: number;
    event_point?: number | null;
    target_value: number;
    skill_score: number;
    multi_live_score_up?: number | null;
    event_bonus_total?: number | null;
}

export interface DeckEngineRecommendResult {
    decks: DeckEngineDeck[];
    /** Only complete certifies the canonical Top-K; timed-out decks are legal incumbents. */
    completion: DeckSearchCompletion;
    timed_out: boolean;
    performance: {
        build_pool_ms: number;
        search_ms: number;
        pool_size: number;
    };
}

/** 单曲收益排行的一行：给定卡组在每首曲目/难度上的单局得分与 PT。 */
export interface DeckEngineMusicRow {
    music_id: number;
    difficulty: string;
    live_score: number;
    event_point?: number | null;
}

type WasmExports = {
    default: (wasmUrl?: string) => Promise<void>;
    load_masterdata: (masterdataJson: string, musicMetasJson: string) => void;
    create_user_data: (userJson: string, region: string) => DeckEngineUserHandle;
    recommendWithUserData: (
        optionsJson: string,
        handle: DeckEngineUserHandle,
    ) => string;
    recommend_area_items: (optionsJson: string) => string;
    recommendMusic: (optionsJson: string) => string;
    calculate_exact_live: (optionsJson: string) => string;
    get_world_bloom_support_cards: (optionsJson: string) => string;
};

/** 组卡引擎对外接口：输入输出均为已展开的 JS 对象。 */
export interface DeckEngine {
    /**
     * 载入 master data 与音乐元数据。`tables` 为裸表名 → 行数组
     * （如 `{ cards: [...] }`），缺表走引擎内建 fallback；
     * 引擎内一次性完成扁平化并缓存，之后每次 recommend 零重复成本。
     */
    loadMasterData(tables: Record<string, unknown[]>, musicMetas: unknown[]): void;
    /** 解析用户数据并返回可复用句柄；region 为 jp/tw/en/kr/cn。 */
    createUserData(region: string, user: unknown): DeckEngineUserHandle;
    /** 组卡搜索：options 支持 camelCase / snake_case 两种键名。 */
    recommend(
        options: Record<string, unknown>,
        user: DeckEngineUserHandle,
    ): DeckEngineRecommendResult;
    /**
     * 单曲收益：对一张已定卡组给全部曲目/难度打分排序。
     * options: { live_type, event_type?, skill_order?, specific_skill_order?,
     * multi_live_teammate_score_up?, multi_live_teammate_power?,
     * deck: { total_power, event_bonus_rate, support_deck_bonus_rate,
     *         cards: [{ skill_score_up, skill_life_recovery }] } }
     */
    recommendMusic(options: Record<string, unknown>): DeckEngineMusicRow[];
    /** 释放用户句柄。 */
    disposeUser(user: DeckEngineUserHandle): void;
}

let enginePromise: Promise<DeckEngine> | null = null;

/** 产物绝对 URL：worker 的脚本基不是站点根（Turbopack dev 下尤其如此），
 *  动态 import 必须用完整绝对地址才能解析。 */
function artifactUrl(path: string): string {
    const origin = (self.location && self.location.origin) || "http://localhost:3000";
    return new URL(path, origin).href;
}

async function importEngineModule(): Promise<WasmExports> {
    const v = encodeURIComponent(DECK_ENGINE_WASM_VERSION);
    const loaderUrl = artifactUrl(`/wasm/allium-deck.js?v=${v}`);

    // 用 Function() 构造动态 import，绕开打包器的静态分析，
    // 让运行时直接拉 /wasm/ 下的文件（与 mmw 预览的做法一致）。
    const mod = (await Function("url", "return import(url)")(loaderUrl)) as {
        default?: WasmExports["default"];
    } & Partial<WasmExports>;

    const init = mod.default;
    if (typeof init !== "function") {
        throw new Error("deck engine loader did not export init");
    }
    await init(artifactUrl(`/wasm/allium-deck_bg.wasm?v=${v}`));
    return mod as WasmExports;
}

function createEngine(mod: WasmExports): DeckEngine {
    return {
        loadMasterData(tables, musicMetas) {
            // 裸表名 → 行数组，统一序列化成「表名.json → 原文」的字符串 map。
            const payload: Record<string, string> = {};
            for (const [name, rows] of Object.entries(tables)) {
                payload[`${name}.json`] = JSON.stringify(rows ?? []);
            }
            mod.load_masterdata(JSON.stringify(payload), JSON.stringify(musicMetas ?? []));
        },
        createUserData(region, user) {
            return mod.create_user_data(JSON.stringify(user ?? {}), region);
        },
        recommend(options, user) {
            const text = mod.recommendWithUserData(JSON.stringify(options ?? {}), user);
            const response = JSON.parse(text) as DeckEngineRecommendResult;
            readSearchCompletion(response);
            return response;
        },
        recommendMusic(options) {
            const text = mod.recommendMusic(JSON.stringify(options ?? {}));
            return JSON.parse(text) as DeckEngineMusicRow[];
        },
        disposeUser(user) {
            user.free();
        },
    };
}

/**
 * 加载并初始化引擎。同一个 worker 内是单例——wasm 实例可以跨多次
 * recommend 复用，master data 与用户数据快照也挂在上面。
 */
export function loadDeckEngine(): Promise<DeckEngine> {
    if (!enginePromise) {
        enginePromise = importEngineModule()
            .then(createEngine)
            .catch((err) => {
                // 失败不缓存，下次调用可以重试（比如首次加载时网络抖了一下）。
                enginePromise = null;
                throw err;
            });
    }
    return enginePromise;
}

/**
 * 预加载 / 预热 WASM 产物。在用户进入组卡页面时触发，提前下载
 * .js 和 .wasm 到浏览器缓存，避免点击计算时还要等待网络拉取。
 */
export function preloadDeckEngine(): void {
    if (typeof window === "undefined" && typeof self === "undefined") return;
    const v = encodeURIComponent(DECK_ENGINE_WASM_VERSION);
    const jsUrl = artifactUrl(`/wasm/allium-deck.js?v=${v}`);
    const wasmUrl = artifactUrl(`/wasm/allium-deck_bg.wasm?v=${v}`);

    try {
        if (typeof fetch === "function") {
            fetch(jsUrl, { cache: "force-cache" }).catch(() => {});
            fetch(wasmUrl, { cache: "force-cache" }).catch(() => {});
        }
    } catch {
        // ignore prefetch errors
    }
}
