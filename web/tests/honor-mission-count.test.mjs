/**
 * Pins the tally an FC/AP honor prints and the profile's clear-status table shows.
 *
 * Both read `lib/music-clear-status.ts` because the account's `userMusicResults` is the only source
 * that carries these counts — Haruki serves neither `userHonorMissions` nor
 * `userMusicDifficultyClearCount` (both 404). The honor number must equal the table number, so the
 * counting rules (a song cleared at C or better, full-comboed at FC or better, all-perfected at AP)
 * and the mission names from `honors.json` (`master_full_perfect`, not `master_all_perfect`) are
 * pinned here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const webRoot = fileURLToPath(new URL("../", import.meta.url));

function loadClearStatus() {
    const filename = path.join(webRoot, "src/lib/music-clear-status.ts");
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    // Both imports are type-only, so the compiled module requires nothing at runtime.
    new Function("require", "exports", compiled)((id) => {
        throw new Error(`unexpected import ${id}`);
    }, exports);
    return exports;
}

/** One entry per chart, the shape `parseUserMusicResults` already collapsed to best-result-per-chart. */
function results(rows) {
    const map = new Map();
    for (const [musicId, difficulty, result] of rows) {
        const entry = map.get(musicId) ?? {};
        entry[difficulty] = result;
        map.set(musicId, entry);
    }
    return map;
}

test("an honor says which count it prints", () => {
    const { resolveHonorMissionCount } = loadClearStatus();

    assert.deepEqual(resolveHonorMissionCount("master_full_perfect"), {
        difficulty: "master",
        level: "allPerfect",
    });
    assert.deepEqual(resolveHonorMissionCount("append_full_combo"), {
        difficulty: "append",
        level: "fullCombo",
    });
    assert.deepEqual(resolveHonorMissionCount(" Expert_Full_Combo "), {
        difficulty: "expert",
        level: "fullCombo",
    });

    // Everything that is not one of the eight difficulty-score honors prints no number.
    for (const other of ["", "master_all_perfect", "honor_mission", "master", "master_full_combo_v2", 0, null, undefined]) {
        assert.equal(resolveHonorMissionCount(other), null, String(other));
    }
});

test("the three rows are cumulative, and only a chart with a result counts", () => {
    const { countClearStatus } = loadClearStatus();
    const table = countClearStatus(results([
        [1, "master", "AP"],
        [2, "master", "AP"],
        [3, "master", "FC"],
        [4, "master", "C"],
        [5, "master", ""],      // played but not cleared: in no row
        [6, "expert", "FC"],
        [7, "easy", "AP"],
    ]));

    assert.deepEqual(table.master, { clear: 4, fullCombo: 3, allPerfect: 2 });
    assert.deepEqual(table.expert, { clear: 1, fullCombo: 1, allPerfect: 0 });
    assert.deepEqual(table.easy, { clear: 1, fullCombo: 1, allPerfect: 1 });
    assert.deepEqual(table.normal, { clear: 0, fullCombo: 0, allPerfect: 0 });
    assert.deepEqual(table.append, { clear: 0, fullCombo: 0, allPerfect: 0 });
});

test("an FC honor prints the FC+AP count and an AP honor prints the AP count", () => {
    const { honorMissionCountFor } = loadClearStatus();
    const account = results([
        [1, "master", "AP"],
        [2, "master", "AP"],
        [3, "master", "FC"],
        [4, "master", "C"],
        [5, "expert", "FC"],
        [6, "append", "AP"],
    ]);

    assert.equal(honorMissionCountFor(account, "master_full_perfect"), 2);
    assert.equal(honorMissionCountFor(account, "master_full_combo"), 3);
    assert.equal(honorMissionCountFor(account, "expert_full_combo"), 1);
    assert.equal(honorMissionCountFor(account, "append_full_perfect"), 1);
    assert.equal(honorMissionCountFor(account, "hard_full_combo"), 0);
});

test("nothing is printed before the account's results are there", () => {
    const { honorMissionCountFor, honorMissionCountFromTable } = loadClearStatus();
    const account = results([[1, "master", "AP"]]);

    assert.equal(honorMissionCountFor(null, "master_full_perfect"), null);
    assert.equal(honorMissionCountFor(undefined, "master_full_perfect"), null);
    // A character or event honor prints no number even when results exist.
    assert.equal(honorMissionCountFor(account, undefined), null);
    assert.equal(honorMissionCountFor(account, ""), null);
    assert.equal(honorMissionCountFromTable(null, "master_full_perfect"), null);
});

test("counting a missing read yields zero, so callers must pass null instead", () => {
    const { countClearStatus, honorMissionCountFromTable } = loadClearStatus();

    // `countClearStatus(null)` is a table of zeros — handing that to an honor would print "0" while
    // the results are still loading, which is why ProfileHeroCard and the frame preview keep the
    // table null until `userMusicResults` actually arrives.
    assert.deepEqual(countClearStatus(null).master, { clear: 0, fullCombo: 0, allPerfect: 0 });
    assert.equal(honorMissionCountFromTable(countClearStatus(null), "master_full_perfect"), 0);
});
