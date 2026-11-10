import assert from "node:assert/strict";

const { sekaiGachaOrigin, sekaiGachaUrl } = await import("../src/lib/sekaiGacha/config.ts");
const { playCommand, readStageMessage } = await import("../src/lib/sekaiGacha/protocol.ts");

// Default: the published build on the resource bucket.
for (const value of [undefined, "", "   "]) {
    if (value === undefined) delete process.env.NEXT_PUBLIC_SEKAI_GACHA_URL;
    else process.env.NEXT_PUBLIC_SEKAI_GACHA_URL = value;
    assert.match(sekaiGachaUrl(), /^https:\/\/assets\.pjsk\.moe\/sekai-extra-assets\/sekai-gacha\/[0-9a-z._-]+\/index\.html$/);
    assert.equal(sekaiGachaOrigin(), "https://assets.pjsk.moe");
}

process.env.NEXT_PUBLIC_SEKAI_GACHA_URL = " http://127.0.0.1:8765/index.html ";
assert.equal(sekaiGachaUrl(), "http://127.0.0.1:8765/index.html");
assert.equal(sekaiGachaOrigin(), "http://127.0.0.1:8765");

for (const value of [
    "http://assets.example.test/sekai-gacha/v1/index.html",
    "https://assets.example.test/sekai-gacha/v1/",
    "https://assets.example.test/sekai-gacha/v1/index.html?x=1",
    "https://assets.example.test/sekai-gacha/v1/index.html#",
    "https://assets.example.test/sekai-gacha/../index.html",
    "https://user:pass@assets.example.test/index.html",
    "HTTPS://assets.example.test/index.html",
    "not a URL",
]) {
    process.env.NEXT_PUBLIC_SEKAI_GACHA_URL = value;
    assert.throws(() => sekaiGachaUrl(), /sekai_gacha_config_invalid/, value);
}

// Commands carry 1–10 cards, each with its asset name and rarity.
const card = (assetbundleName, cardRarityType) => ({ assetbundleName, cardRarityType });
assert.deepEqual(
    playCommand([card("res001_no002", "rarity_2"), card("res006_no012", "rarity_birthday")]),
    { type: "sekai-gacha:play", cards: [{ id: "res001_no002", rarity: "rarity_2" }, { id: "res006_no012", rarity: "rarity_birthday" }] },
);
assert.throws(() => playCommand([]), /sekai_gacha_invalid_cards/);
assert.throws(() => playCommand(Array(11).fill(card("res001_no004", "rarity_4"))), /sekai_gacha_invalid_cards/);
assert.throws(() => playCommand([card("../evil", "rarity_4")]), /sekai_gacha_invalid_cards/);
// ★1 cards are not drawn from gachas and have no presentation.
assert.throws(() => playCommand([card("res001_no001", "rarity_1")]), /sekai_gacha_invalid_cards/);

// Stage messages.
assert.deepEqual(readStageMessage({ type: "sekai-gacha:loader", v: 1, progress: 1.5 }), { kind: "loader", progress: 1 });
assert.deepEqual(
    readStageMessage({ type: "sekai-gacha:state", v: 1, phase: "reveal", revealed: 3, total: 10, card: "res021_no008" }),
    { kind: "state", phase: "reveal", revealed: 3, total: 10, card: "res021_no008", error: undefined },
);
assert.equal(readStageMessage({ type: "sekai-gacha:state", v: 1, phase: "dancing", revealed: 0, total: 0 }), null);
assert.deepEqual(readStageMessage({ type: "sekai-gacha:state", v: 1, phase: "ready", revealed: -1, total: 99 }),
    { kind: "state", phase: "ready", revealed: 0, total: 0, card: undefined, error: undefined });
assert.deepEqual(readStageMessage({ type: "sekai-gacha:error", v: 1, code: "busy", message: "x" }), { kind: "rejected", code: "busy", message: "x" });
for (const data of [null, "sekai-gacha:state", { type: "sekai-gacha:state", v: 2, phase: "ready" }, { type: "moly", v: 1 }, { type: "sekai-gacha:play", v: 1 }]) {
    assert.equal(readStageMessage(data), null);
}

console.log("sekai gacha tests passed");
