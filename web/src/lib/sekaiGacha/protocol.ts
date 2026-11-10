/**
 * Messages between the gacha page and the SekaiGacha stage iframe (protocol v1, documented in
 * the build's WebGL template). The page draws the cards; the stage only plays them.
 *
 * Page → stage: `play` (1–10 cards revealed in order, each its asset name and rarity), `skip`, `mute`.
 * The rarity picks the intro hint and the reveal (★2, ★3, ★4, birthday) as in the game.
 * Stage → page: engine download progress, phase changes, and rejected commands.
 */

const PREFIX = "sekai-gacha:";

/** At most ten cards are revealed per presentation, as in the game. */
export const SEKAI_GACHA_MAX_CARDS = 10;

export type SekaiGachaPhase = "booting" | "ready" | "loading" | "intro" | "reveal" | "complete" | "error";

const PHASES: readonly SekaiGachaPhase[] = ["booting", "ready", "loading", "intro", "reveal", "complete", "error"];

export type SekaiGachaMessage =
    | { kind: "loader"; progress: number }
    | { kind: "state"; phase: SekaiGachaPhase; revealed: number; total: number; card?: string; error?: string }
    | { kind: "rejected"; code: string; message: string };

/** The rarities the stage has presentations for, in masterdata's `cardRarityType` spelling. */
export type SekaiGachaRarity = "rarity_2" | "rarity_3" | "rarity_4" | "rarity_birthday";

export interface SekaiGachaCard {
    id: string;
    rarity: SekaiGachaRarity;
}

export type SekaiGachaCommand =
    | { type: "sekai-gacha:play"; cards: SekaiGachaCard[] }
    | { type: "sekai-gacha:skip" }
    | { type: "sekai-gacha:mute"; muted: boolean };

const CARD_NAME = /^res\d+_no\d+$/;
const RARITIES: readonly string[] = ["rarity_2", "rarity_3", "rarity_4", "rarity_birthday"];

/** Whether the stage can play this card: its asset name and a rarity it has a presentation for. */
export function isSekaiGachaCard(card: { assetbundleName: string; cardRarityType: string }): boolean {
    return CARD_NAME.test(card.assetbundleName) && RARITIES.includes(card.cardRarityType);
}

export function playCommand(cards: { assetbundleName: string; cardRarityType: string }[]): SekaiGachaCommand {
    if (cards.length < 1 || cards.length > SEKAI_GACHA_MAX_CARDS || !cards.every(isSekaiGachaCard)) {
        throw new Error("sekai_gacha_invalid_cards");
    }
    return { type: `${PREFIX}play`, cards: cards.map(card => ({ id: card.assetbundleName, rarity: card.cardRarityType as SekaiGachaRarity })) };
}

const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= SEKAI_GACHA_MAX_CARDS ? value : 0;
const text = (value: unknown) => typeof value === "string" ? value.slice(0, 500) : undefined;

/** Reads one message from the stage; anything that is not a v1 stage message gives null. */
export function readStageMessage(data: unknown): SekaiGachaMessage | null {
    if (!data || typeof data !== "object") return null;
    const message = data as Record<string, unknown>;
    if (message.v !== 1 || typeof message.type !== "string" || !message.type.startsWith(PREFIX)) return null;
    switch (message.type.slice(PREFIX.length)) {
        case "loader": {
            const progress = typeof message.progress === "number" && Number.isFinite(message.progress) ? message.progress : 0;
            return { kind: "loader", progress: Math.min(1, Math.max(0, progress)) };
        }
        case "state": {
            const phase = PHASES.find(item => item === message.phase);
            if (!phase) return null;
            return { kind: "state", phase, revealed: count(message.revealed), total: count(message.total), card: text(message.card), error: text(message.error) };
        }
        case "error":
            return { kind: "rejected", code: text(message.code) ?? "", message: text(message.message) ?? "" };
        default:
            return null;
    }
}
