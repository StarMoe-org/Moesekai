// Pure gacha simulation engine: rarity rates, UP share, pity, 10-pull floor and
// per-card probabilities. It has no DOM, React or network dependencies so the
// same numbers drive both the rolls and the probability tables shown to users.

export const RARITY_KEYS = ["rarity_1", "rarity_2", "rarity_3", "rarity_4", "rarity_birthday"] as const;
export type SimRarity = (typeof RARITY_KEYS)[number];
export type RateTable = Record<SimRarity, number>;

/** Rarities that count as "4★" for pity purposes (birthday cards are 4★ frames). */
export const FOUR_STAR_RARITIES: readonly SimRarity[] = ["rarity_4", "rarity_birthday"];
/** Rarities a 10-pull floor can land on. */
export const TEN_PULL_FLOOR_RARITIES: readonly SimRarity[] = ["rarity_3", "rarity_4", "rarity_birthday"];
export const TEN_PULL_BLOCK = 10;

export interface SimCard {
    cardId: number;
    rarity: SimRarity;
    /** Relative weight inside its rarity group. Non-positive values count as 1. */
    weight: number;
    /** Marked as a rate-up (pickup) card. */
    up: boolean;
}

export interface SimPoolConfig {
    id: string;
    name: string;
    source: "official" | "custom";
    baseGachaId?: number;
    /** Rarity rates in percent. Not required to sum to 100: they are normalised on use. */
    rates: RateTable;
    cards: SimCard[];
    /** 0–1: share of each rarity's rate reserved for its UP cards. 0 uses weights only. */
    upShare: number;
    /** 0 disables pity. N: the N-th consecutive pull without a 4★ is a guaranteed 4★. */
    pityPulls: number;
    /** Guarantee a 3★+ on every 10th pull of a block when none came earlier in it. */
    tenPullFloor: boolean;
}

export interface PullState {
    /** Pulls since the last 4★ (0 right after one). */
    sinceFourStar: number;
    /** Position inside the current 10-pull block (0–9). */
    blockPos: number;
    /** Whether the current block already produced a floor-rarity card. */
    blockHasFloor: boolean;
}

export interface PullResult {
    cardId: number;
    rarity: SimRarity;
    up: boolean;
    pityForced: boolean;
    floorForced: boolean;
}

export const EMPTY_PULL_STATE: PullState = { sinceFourStar: 0, blockPos: 0, blockHasFloor: false };

export const ZERO_RATES: RateTable = { rarity_1: 0, rarity_2: 0, rarity_3: 0, rarity_4: 0, rarity_birthday: 0 };

export type Rng = () => number;

/** mulberry32: small seeded PRNG so tests and shared seeds are reproducible. */
export function createRng(seed?: number): Rng {
    if (seed === undefined) return Math.random;
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const weightOf = (card: { weight: number }) => (card.weight > 0 ? card.weight : 1);

/** Rarity rates normalised to 100 over the rarities that actually have cards. */
export function effectiveRates(pool: SimPoolConfig): RateTable {
    const present = new Set(pool.cards.map((card) => card.rarity));
    const raw = RARITY_KEYS.map((rarity) => {
        const value = Number(pool.rates[rarity]);
        return present.has(rarity) && Number.isFinite(value) && value > 0 ? value : 0;
    });
    const total = raw.reduce((sum, value) => sum + value, 0);
    const out = { ...ZERO_RATES };
    if (total <= 0) return out;
    RARITY_KEYS.forEach((rarity, index) => {
        out[rarity] = (raw[index] / total) * 100;
    });
    return out;
}

export interface CardProbability {
    cardId: number;
    rarity: SimRarity;
    up: boolean;
    /** Chance of this card on a single pull, in percent. */
    percent: number;
}

/** Per-card chance on a single unguarded pull, in percent. Sums to 100 (or 0 for an empty pool). */
export function cardProbabilities(pool: SimPoolConfig): CardProbability[] {
    const rates = effectiveRates(pool);
    const share = Math.min(1, Math.max(0, pool.upShare || 0));
    const out: CardProbability[] = [];
    for (const rarity of RARITY_KEYS) {
        const rate = rates[rarity];
        if (rate <= 0) continue;
        const members = pool.cards.filter((card) => card.rarity === rarity);
        const groupPercent = (group: SimCard[], total: number) => {
            const sum = group.reduce((acc, card) => acc + weightOf(card), 0);
            for (const card of group) {
                out.push({ cardId: card.cardId, rarity, up: card.up, percent: sum > 0 ? (total * weightOf(card)) / sum : 0 });
            }
        };
        const ups = members.filter((card) => card.up);
        if (share <= 0 || ups.length === 0) {
            // No UP split: every card in the rarity is weighted together.
            groupPercent(members, rate);
            continue;
        }
        const others = members.filter((card) => !card.up);
        // With no non-UP cards the UP cards take the whole rarity rate.
        const upTotal = others.length ? rate * share : rate;
        groupPercent(ups, upTotal);
        groupPercent(others, rate - upTotal);
    }
    return out;
}

/** Rarity-level chance summary for display: the normalised rates. */
export function rarityProbabilities(pool: SimPoolConfig): RateTable {
    return effectiveRates(pool);
}

/** Human-readable issues that make a pool unusable or surprising. Empty means it is fine. */
export type PoolIssue = "noCards" | "noFourStar" | "noRates" | "upWithoutShare";

export function poolIssues(pool: SimPoolConfig): PoolIssue[] {
    const issues: PoolIssue[] = [];
    if (pool.cards.length === 0) issues.push("noCards");
    const rates = effectiveRates(pool);
    if (pool.cards.length > 0 && RARITY_KEYS.every((rarity) => rates[rarity] <= 0)) issues.push("noRates");
    if (pool.cards.length > 0 && !pool.cards.some((card) => FOUR_STAR_RARITIES.includes(card.rarity))) issues.push("noFourStar");
    if (pool.upShare > 0 && !pool.cards.some((card) => card.up)) issues.push("upWithoutShare");
    return issues;
}

function sampleFrom(entries: CardProbability[], rng: Rng): CardProbability | null {
    const total = entries.reduce((sum, entry) => sum + entry.percent, 0);
    if (entries.length === 0 || total <= 0) return null;
    let roll = rng() * total;
    for (const entry of entries) {
        roll -= entry.percent;
        if (roll < 0) return entry;
    }
    return entries[entries.length - 1];
}

/**
 * Roll one pull, advancing the pull state. Pity and the 10-pull floor are
 * applied by conditioning the draw on the guaranteed rarity set, so the
 * remaining pulls keep the configured relative odds.
 */
export function rollPull(
    pool: SimPoolConfig,
    state: PullState,
    rng: Rng,
    table: CardProbability[] = cardProbabilities(pool),
): { result: PullResult | null; next: PullState } {
    if (table.length === 0) return { result: null, next: state };

    const pityForced = pool.pityPulls > 0 && state.sinceFourStar + 1 >= pool.pityPulls;
    const floorForced = !pityForced && pool.tenPullFloor && state.blockPos === TEN_PULL_BLOCK - 1 && !state.blockHasFloor;

    let entries = table;
    if (pityForced) entries = table.filter((entry) => FOUR_STAR_RARITIES.includes(entry.rarity));
    else if (floorForced) entries = table.filter((entry) => TEN_PULL_FLOOR_RARITIES.includes(entry.rarity));
    if (entries.length === 0) entries = table;

    const picked = sampleFrom(entries, rng);
    if (!picked) return { result: null, next: state };

    const isFour = FOUR_STAR_RARITIES.includes(picked.rarity);
    const isFloor = TEN_PULL_FLOOR_RARITIES.includes(picked.rarity);
    const last = state.blockPos === TEN_PULL_BLOCK - 1;
    const next: PullState = {
        sinceFourStar: isFour ? 0 : state.sinceFourStar + 1,
        blockPos: last ? 0 : state.blockPos + 1,
        blockHasFloor: last ? false : state.blockHasFloor || isFloor,
    };
    return {
        result: { cardId: picked.cardId, rarity: picked.rarity, up: picked.up, pityForced, floorForced },
        next,
    };
}

/** Roll `count` pulls in sequence. */
export function rollPulls(pool: SimPoolConfig, count: number, state: PullState, rng: Rng) {
    const table = cardProbabilities(pool);
    const results: PullResult[] = [];
    let current = state;
    for (let i = 0; i < count; i += 1) {
        const { result, next } = rollPull(pool, current, rng, table);
        if (!result) break;
        results.push(result);
        current = next;
    }
    return { results, state: current };
}

/** Empirical probability summary used by the stats panel. */
export function summarise(results: Array<Pick<PullResult, "rarity" | "up">>) {
    const counts: Record<SimRarity, number> = { rarity_1: 0, rarity_2: 0, rarity_3: 0, rarity_4: 0, rarity_birthday: 0 };
    let up = 0;
    for (const result of results) {
        counts[result.rarity] += 1;
        if (result.up) up += 1;
    }
    const fourStar = counts.rarity_4 + counts.rarity_birthday;
    return { counts, total: results.length, fourStar, up };
}
