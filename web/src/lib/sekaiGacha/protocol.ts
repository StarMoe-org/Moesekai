/**
 * Messages between the gacha page and the SekaiGacha stage iframe (protocol v1, documented in
 * the build's WebGL template). The page draws the cards; the stage only plays them.
 *
 * Page → stage: `play` (1–10 card asset names, revealed in order), `skip`, `mute`.
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

export type SekaiGachaCommand =
    | { type: "sekai-gacha:play"; cards: string[] }
    | { type: "sekai-gacha:skip" }
    | { type: "sekai-gacha:mute"; muted: boolean };

const CARD_NAME = /^res\d+_no\d+$/;

/** Whether the stage can play this card asset name. */
export function isSekaiGachaCard(assetbundleName: string): boolean {
    return CARD_NAME.test(assetbundleName);
}

export function playCommand(cards: string[]): SekaiGachaCommand {
    if (cards.length < 1 || cards.length > SEKAI_GACHA_MAX_CARDS || !cards.every(isSekaiGachaCard)) {
        throw new Error("sekai_gacha_invalid_cards");
    }
    return { type: `${PREFIX}play`, cards: [...cards] };
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
