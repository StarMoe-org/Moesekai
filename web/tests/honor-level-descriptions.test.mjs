/**
 * Honor level descriptions recovered from honorMissions.json for the CN masters whose `honors.json`
 * repeats one sentence on every level.
 *
 * The module infers the alignment itself (group level counts, each band's threshold number, wording
 * as the tie-break), so these tests pin that inference: what it must repair, and the three things it
 * must leave alone — an acquisition note that legitimately repeats, a group whose ladder does not
 * line up, and a wording tie it cannot resolve.
 * Run with: node --test web/tests/honor-level-descriptions.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { importWebTypeScript } from "./characterization/test-helpers.mjs";

const { hasCollapsedLevelDescriptions, resolveHonorLevelDescriptions } =
    await importWebTypeScript("src/lib/honor-level-descriptions.ts");

const honor = (id, groupId, descriptions, honorMissionType) => ({
    id,
    groupId,
    name: `honor-${id}`,
    honorMissionType,
    levels: descriptions.map((description, index) => ({ level: index + 1, description })),
});

const mission = (honorMissionType, seq, requirement, sentence) => ({
    id: seq,
    seq,
    honorMissionType,
    requirement,
    sentence,
});

test("collapsed detection only fires on a repeated non-empty sentence across levels", () => {
    assert.equal(hasCollapsedLevelDescriptions(honor(1, 1, ["同じ。", "同じ。"])), true);
    assert.equal(hasCollapsedLevelDescriptions(honor(1, 1, ["L1。", "L2。"])), false);
    assert.equal(hasCollapsedLevelDescriptions(honor(1, 1, ["一回だけ。"])), false);
    assert.equal(hasCollapsedLevelDescriptions(honor(1, 1, ["", ""])), false);
});

test("a declared honorMissionType wins when its ladder fits", () => {
    const honors = [
        honor(3009, 300, Array.from({ length: 3 }, () => "在5首歌曲的EASY难度中达成FULL COMBO。"), "easy_full_combo"),
    ];
    const missions = [
        mission("easy_full_combo", 1, 5, "在5首歌曲的EASY难度中达成FULL COMBO。"),
        mission("easy_full_combo", 2, 10, "在10首歌曲的EASY难度中达成FULL COMBO。"),
        mission("easy_full_combo", 3, 20, "在20首歌曲的EASY难度中达成FULL COMBO。"),
    ];

    assert.deepEqual(resolveHonorLevelDescriptions(honors, missions).get(3009), [
        "在5首歌曲的EASY难度中达成FULL COMBO。",
        "在10首歌曲的EASY难度中达成FULL COMBO。",
        "在20首歌曲的EASY难度中达成FULL COMBO。",
    ]);
});

test("a multi-honor band is aligned by level counts and band-start requirements", () => {
    // 完美主义 shape: 3 + 10 levels over one 13-row ladder.
    const band = ["5", "10", "20"];
    const honors = [
        honor(118, 37, band.map((n) => `完成${n}首歌曲的所有难度。`)),
        honor(119, 37, Array.from({ length: 10 }, () => "完成30首歌曲的所有难度。")),
    ];
    const requirements = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const missions = requirements.map((requirement, index) =>
        mission("clear_live_difficulty_all", index + 1, requirement, `完成${requirement}首歌曲除APPEND难度以外的所有难度。`),
    );

    const resolved = resolveHonorLevelDescriptions(honors, missions);
    assert.equal(resolved.has(118), false, "an honor that is already per-level stays untouched");
    assert.deepEqual(resolved.get(119), requirements.slice(3).map((n) => `完成${n}首歌曲除APPEND难度以外的所有难度。`));
});

test("types sharing a ladder are told apart by wording, not by row order", () => {
    // 応援団 shape: 5 + 10 levels over one 15-row ladder.
    const ladder = [5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 70000, 120000, 170000, 220000, 270000, 320000];
    const honors = [
        honor(206, 72, Array.from({ length: 5 }, () => "在α成员登场的\n虚拟演唱会中累计获得5000应援积分。")),
        honor(207, 72, Array.from({ length: 10 }, () => "在α成员登场的\n虚拟演唱会中累计获得30000应援积分。")),
    ];
    const alpha = ladder.map((n, index) => mission("alpha_cheer", index + 1, n, `在α成员登场的虚拟演唱会中\n累计达到${n}应援积分。`));
    const beta = ladder.map((n, index) => mission("beta_cheer", index + 1, n, `在β成员登场的虚拟演唱会中\n累计达到${n}应援积分。`));

    const resolved = resolveHonorLevelDescriptions(honors, [...beta, ...alpha]);
    assert.deepEqual(resolved.get(206), alpha.slice(0, 5).map((row) => row.sentence));
    assert.deepEqual(resolved.get(207), alpha.slice(5).map((row) => row.sentence));
});

test("a repeated acquisition note is not a defect, even when a mission type has the same row count", () => {
    // 139 of the CN repeats are notes like this: the level shows in the art, so one sentence for all
    // five levels is correct. A five-row mission type that happens to exist must not be applied —
    // the honor's sentence carries no progress number, so no band can match it.
    const note = "通过“「世界」巡游应援祭！”活动获得。";
    const honors = [honor(3100101, 30051, Array.from({ length: 5 }, () => note))];
    const missions = Array.from({ length: 5 }, (_, index) =>
        mission("clear_live_difficulty_all", index + 1, index + 1, `完成${index + 1}首歌曲的所有难度。`));

    assert.equal(resolveHonorLevelDescriptions(honors, missions).size, 0);
});

test("a ladder is rewritten only when every honor in the group starts at its own threshold", () => {
    // Same shape as 完美主义, but the second honor's sentence states 999 — no band matches it, so the
    // whole group is left alone rather than half-aligned.
    const honors = [
        honor(118, 37, Array.from({ length: 3 }, () => "完成5首歌曲的所有难度。")),
        honor(119, 37, Array.from({ length: 10 }, () => "完成999首歌曲的所有难度。")),
    ];
    const missions = Array.from({ length: 13 }, (_, index) =>
        mission("clear_live_difficulty_all", index + 1, index * 10 + 5, `完成${index * 10 + 5}首歌曲除APPEND难度以外的所有难度。`));

    assert.equal(resolveHonorLevelDescriptions(honors, missions).size, 0);
});

test("an equally close candidate is rejected instead of guessed", () => {
    const ladder = [5000, 10000];
    const honors = [honor(1, 1, ladder.map((n) => `累计获得${n}应援积分。`))];
    const same = ladder.map((n, index) => mission("same_a", index + 1, n, `累计获得${n}应援积分。`));
    const sameToo = ladder.map((n, index) => mission("same_b", index + 1, n, `累计获得${n}应援积分。`));

    assert.equal(resolveHonorLevelDescriptions(honors, [...same, ...sameToo]).size, 0);
});

test("groups with no mission counterpart are left alone", () => {
    // Ranking-reward honors legitimately repeat one sentence; no mission table describes them.
    const honors = [honor(10002, 10001, Array.from({ length: 5 }, () => "“某活动”活动阵营应援排行榜奖励"))];
    const missions = [mission("clear_live", 1, 39, "完成39次演出。")];

    assert.equal(resolveHonorLevelDescriptions(honors, missions).size, 0);
    assert.equal(resolveHonorLevelDescriptions(honors, []).size, 0);
});
