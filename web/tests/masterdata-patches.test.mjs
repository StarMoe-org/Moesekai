/**
 * Unit tests for the masterdata post-patch system (src/lib/masterdata-patches.ts).
 * Run with: node --test web/tests/masterdata-patches.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { importWebTypeScript } from "./characterization/test-helpers.mjs";

const mod = await importWebTypeScript("src/lib/masterdata-patches.ts");
const {
  MASTERDATA_PATCHES,
  applyMasterdataPatches,
  patchFileForPath,
} = mod;

// ---------------------------------------------------------------------------
// patchFileForPath
// ---------------------------------------------------------------------------

test("patchFileForPath maps known files", () => {
  assert.equal(patchFileForPath("cards.json"), "cards");
  assert.equal(patchFileForPath("eventStories.json"), "eventStories");
  assert.equal(patchFileForPath("https://x/master/cards.json"), "cards");
});

test("patchFileForPath returns null for unknown files", () => {
  assert.equal(patchFileForPath("musics.json"), null);
  assert.equal(patchFileForPath("gachas.json"), null);
  assert.equal(patchFileForPath("cards.json.bak"), null);
});

// ---------------------------------------------------------------------------
// Registered patches — "apply to ALL servers" per requirement
// ---------------------------------------------------------------------------

test("registered cards patch has no server restriction (all regions)", () => {
  const patch = MASTERDATA_PATCHES.find((p) => p.id === "cards-1345-1347-supply");
  assert.ok(patch);
  assert.equal(patch.server, undefined);
});

test("registered cards 1489-1491 patch has no server restriction (all regions)", () => {
  const patch = MASTERDATA_PATCHES.find((p) => p.id === "cards-1489-1491-supply");
  assert.ok(patch);
  assert.equal(patch.server, undefined);
});

test("registered eventStories patch has no server restriction (all regions)", () => {
  const patch = MASTERDATA_PATCHES.find((p) => p.id === "eventstories-97-banner");
  assert.ok(patch);
  assert.equal(patch.server, undefined);
});

test("cards patch applies on every server (jp & cn)", () => {
  const cards = [
    { id: 1345, cardSupplyId: 1, name: "a" },
    { id: 1347, cardSupplyId: 1, name: "c" },
  ];
  for (const server of ["jp", "cn", "tw", "kr", "en"]) {
    const out = applyMasterdataPatches("cards", server, cards);
    assert.equal(out[0].cardSupplyId, 3, `server ${server}`);
    assert.equal(out[1].cardSupplyId, 3, `server ${server}`);
  }
});

test("cards 1489-1491 patch applies on every server (all regions)", () => {
  const cards = [
    { id: 1489, cardSupplyId: 1, prefix: "暗闇の果てに" },
    { id: 1490, cardSupplyId: 1, prefix: "ほんの少しの温もりを" },
    { id: 1491, cardSupplyId: 1, prefix: "鍵を壊すために" },
  ];
  for (const server of ["jp", "cn", "tw", "kr", "en"]) {
    const out = applyMasterdataPatches("cards", server, cards);
    assert.equal(out[0].cardSupplyId, 3, `server ${server} id 1489`);
    assert.equal(out[1].cardSupplyId, 3, `server ${server} id 1490`);
    assert.equal(out[2].cardSupplyId, 3, `server ${server} id 1491`);
    assert.equal(out[0].prefix, "暗闇の果てに", `server ${server} preserves fields`);
  }
});

// ---------------------------------------------------------------------------
// Matching: exact id / id range
// ---------------------------------------------------------------------------

test("exact id match patches the right entry", () => {
  const stories = [
    { id: 96, bannerGameCharacterUnitId: 9 },
    { id: 97, bannerGameCharacterUnitId: 9 },
    { id: 98, bannerGameCharacterUnitId: 9 },
  ];
  const out = applyMasterdataPatches("eventStories", "jp", stories);
  assert.equal(out[0].bannerGameCharacterUnitId, 9); // untouched
  assert.equal(out[1].bannerGameCharacterUnitId, 10); // patched
  assert.equal(out[2].bannerGameCharacterUnitId, 9); // untouched
});

test("id range matches inclusive bounds only", () => {
  const cards = [1344, 1345, 1346, 1347, 1348].map((id) => ({ id, cardSupplyId: 1 }));
  const out = applyMasterdataPatches("cards", "jp", cards);
  assert.equal(out[0].cardSupplyId, 1);
  assert.equal(out[1].cardSupplyId, 3);
  assert.equal(out[2].cardSupplyId, 3);
  assert.equal(out[3].cardSupplyId, 3);
  assert.equal(out[4].cardSupplyId, 1);
});

test("cards 1489-1491 id range matches inclusive bounds only (leaves neighbors 1488 & 1492 untouched)", () => {
  const cards = [
    { id: 1488, cardSupplyId: 2 },
    { id: 1489, cardSupplyId: 1 },
    { id: 1490, cardSupplyId: 1 },
    { id: 1491, cardSupplyId: 1 },
    { id: 1492, cardSupplyId: 1 },
  ];
  const out = applyMasterdataPatches("cards", "jp", cards);
  assert.equal(out[0].cardSupplyId, 2);
  assert.equal(out[0], cards[0]); // untouched reference
  assert.equal(out[1].cardSupplyId, 3);
  assert.equal(out[2].cardSupplyId, 3);
  assert.equal(out[3].cardSupplyId, 3);
  assert.equal(out[4].cardSupplyId, 1);
  assert.equal(out[4], cards[4]); // untouched reference
});

test("no matching patch returns the original array reference", () => {
  const cards = [{ id: 999, cardSupplyId: 1 }];
  assert.equal(applyMasterdataPatches("cards", "jp", cards), cards);
});

test("empty array stays empty and unchanged", () => {
  const empty = [];
  assert.equal(applyMasterdataPatches("cards", "jp", empty), empty);
});

// ---------------------------------------------------------------------------
// Server filtering mechanism (injectable patch table)
// ---------------------------------------------------------------------------

function jpOnlyPatches() {
  return [
    {
      id: "test-jp-only",
      file: "cards",
      server: "jp",
      match: { id: [1, 5] },
      patch: { cardSupplyId: 3 },
    },
    {
      id: "test-multi-server",
      file: "cards",
      server: ["jp", "tw"],
      match: { id: [1, 5] },
      patch: { rarity: "rarity_4" },
    },
  ];
}

test("server filter: single server applies only there", () => {
  const cards = [{ id: 2, cardSupplyId: 1 }];
  const jpOut = applyMasterdataPatches("cards", "jp", cards, jpOnlyPatches());
  assert.equal(jpOut[0].cardSupplyId, 3);
  const cnOut = applyMasterdataPatches("cards", "cn", cards, jpOnlyPatches());
  assert.equal(cnOut, cards); // untouched reference
});

test("server filter: array of servers applies to members", () => {
  const cards = [{ id: 2, cardSupplyId: 1 }];
  for (const server of ["jp", "tw"]) {
    const out = applyMasterdataPatches("cards", server, cards, jpOnlyPatches());
    assert.equal(out[0].rarity, "rarity_4", `server ${server}`);
  }
  const krOut = applyMasterdataPatches("cards", "kr", cards, jpOnlyPatches());
  assert.equal(krOut, cards);
});

// ---------------------------------------------------------------------------
// Immutability / merge semantics
// ---------------------------------------------------------------------------

test("patches do not mutate the original entries", () => {
  const cards = [{ id: 1345, cardSupplyId: 1, name: "x" }];
  const snapshot = JSON.stringify(cards);
  const out = applyMasterdataPatches("cards", "jp", cards);
  assert.notEqual(out, cards); // new array
  assert.notEqual(out[0], cards[0]); // new object for patched entry
  assert.equal(JSON.stringify(cards), snapshot); // original untouched
});

test("multiple patches hitting the same entry merge all fields", () => {
  const multi = [
    {
      id: "merge-a",
      file: "cards",
      match: { id: 1 },
      patch: { cardSupplyId: 3 },
    },
    {
      id: "merge-b",
      file: "cards",
      match: { id: 1 },
      patch: { cardRarityType: "rarity_4" },
    },
  ];
  const cards = [{ id: 1, cardSupplyId: 1, cardRarityType: "rarity_2" }];
  const out = applyMasterdataPatches("cards", "jp", cards, multi);
  assert.equal(out[0].cardSupplyId, 3);
  assert.equal(out[0].cardRarityType, "rarity_4");
  assert.equal(out[0].id, 1);
});