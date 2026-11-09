// Pool plumbing: build a simulator pool from an official banner, serialise
// custom pools into a compact shareable code, and keep presets in localStorage.

import type { ICardInfo, IGachaInfo } from "@/types/types";
import { RARITY_KEYS, ZERO_RATES, type RateTable, type SimCard, type SimPoolConfig, type SimRarity } from "./engine";

export const PRESET_STORAGE_KEY = "moesekai.gacha-simulator.presets.v1";
export const SHARE_CODE_VERSION = 1;

const isRarity = (value: unknown): value is SimRarity => typeof value === "string" && (RARITY_KEYS as readonly string[]).includes(value);

/** Masterdata banner → simulator pool. Official pools keep the masterdata weights as-is (upShare 0). */
export function officialPoolFromGacha(gacha: IGachaInfo, cards: Map<number, ICardInfo>): SimPoolConfig {
    const rates: RateTable = { ...ZERO_RATES };
    for (const rate of gacha.gachaCardRarityRates ?? []) {
        if (isRarity(rate.cardRarityType)) rates[rate.cardRarityType] += Number(rate.rate) || 0;
    }

    const upIds = new Set<number>([
        ...(gacha.gachaPickups ?? []).map((pickup) => pickup.cardId),
        ...(gacha.gachaDetails ?? []).filter((detail) => detail.gachaDetailWishType === "fixed").map((detail) => detail.cardId),
    ]);

    const seen = new Set<number>();
    const poolCards: SimCard[] = [];
    for (const detail of gacha.gachaDetails ?? []) {
        const card = cards.get(detail.cardId);
        if (!card || seen.has(detail.cardId) || !isRarity(card.cardRarityType)) continue;
        seen.add(detail.cardId);
        poolCards.push({ cardId: detail.cardId, rarity: card.cardRarityType, weight: Number(detail.weight) || 1, up: upIds.has(detail.cardId) });
    }

    const tenPullFloor = (gacha.gachaBehaviors ?? []).some((behavior) => behavior.gachaBehaviorType.startsWith("over_rarity"));
    return {
        id: `official-${gacha.id}`,
        name: gacha.name,
        source: "official",
        baseGachaId: gacha.id,
        rates,
        cards: poolCards,
        upShare: 0,
        pityPulls: 0,
        tenPullFloor,
    };
}

/** Clone any pool into an editable custom one. */
export function cloneAsCustom(pool: SimPoolConfig, name: string): SimPoolConfig {
    return {
        ...pool,
        id: `custom-${randomId()}`,
        name,
        source: "custom",
        rates: { ...pool.rates },
        cards: pool.cards.map((card) => ({ ...card })),
    };
}

export function randomId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID().slice(0, 8);
    return Math.random().toString(36).slice(2, 10);
}

/* ── Share codes ─────────────────────────────────────────────────────── */

interface ShareShape {
    v: number;
    n: string;
    r: number[];
    c: Array<[number, number, number, 0 | 1]>;
    u: number;
    p: number;
    t: 0 | 1;
}

function toBase64Url(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
    const padded = code.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(code.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export function encodePoolShare(pool: SimPoolConfig): string {
    const shape: ShareShape = {
        v: SHARE_CODE_VERSION,
        n: pool.name.slice(0, 60),
        r: RARITY_KEYS.map((rarity) => Math.round(pool.rates[rarity] * 1000) / 1000),
        c: pool.cards.map((card) => [card.cardId, RARITY_KEYS.indexOf(card.rarity), card.weight, card.up ? 1 : 0]),
        u: Math.round(pool.upShare * 1000) / 1000,
        p: pool.pityPulls,
        t: pool.tenPullFloor ? 1 : 0,
    };
    return toBase64Url(JSON.stringify(shape));
}

/** Returns null for anything that is not a well-formed share code. */
export function decodePoolShare(code: string): SimPoolConfig | null {
    try {
        const parsed = JSON.parse(fromBase64Url(code)) as Partial<ShareShape>;
        if (parsed.v !== SHARE_CODE_VERSION || !Array.isArray(parsed.r) || parsed.r.length !== RARITY_KEYS.length) return null;
        if (!Array.isArray(parsed.c)) return null;
        const rates = { ...ZERO_RATES };
        RARITY_KEYS.forEach((rarity, index) => { rates[rarity] = Math.max(0, Number(parsed.r?.[index]) || 0); });
        const cards: SimCard[] = [];
        for (const row of parsed.c) {
            if (!Array.isArray(row) || row.length < 4) return null;
            const rarity = RARITY_KEYS[Number(row[1])];
            if (!rarity) return null;
            cards.push({ cardId: Number(row[0]), rarity, weight: Number(row[2]) || 1, up: row[3] === 1 });
        }
        return {
            id: `custom-${randomId()}`,
            name: typeof parsed.n === "string" && parsed.n ? parsed.n : "Shared pool",
            source: "custom",
            rates,
            cards,
            upShare: Math.min(1, Math.max(0, Number(parsed.u) || 0)),
            pityPulls: Math.max(0, Math.floor(Number(parsed.p) || 0)),
            tenPullFloor: parsed.t === 1,
        };
    } catch {
        return null;
    }
}

/* ── Presets (localStorage) ──────────────────────────────────────────── */

function isPoolConfig(value: unknown): value is SimPoolConfig {
    if (!value || typeof value !== "object") return false;
    const pool = value as Partial<SimPoolConfig>;
    return typeof pool.id === "string" && typeof pool.name === "string" && Array.isArray(pool.cards) && typeof pool.rates === "object" && pool.rates !== null;
}

export function loadPresets(): SimPoolConfig[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as { version?: number; pools?: unknown };
        if (parsed.version !== 1 || !Array.isArray(parsed.pools)) return [];
        return parsed.pools.filter(isPoolConfig).map((pool) => ({ ...pool, source: "custom" as const }));
    } catch {
        return [];
    }
}

export function savePresets(pools: SimPoolConfig[]): boolean {
    if (typeof window === "undefined") return false;
    try {
        window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify({ version: 1, pools: pools.filter((pool) => pool.source === "custom") }));
        return true;
    } catch {
        return false;
    }
}
