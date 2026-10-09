import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

// The guess-music modules are plain TypeScript without path aliases: transpile them on the fly.
const require = createRequire(import.meta.url);
const root = new URL("../src/lib/guess-music/", import.meta.url);
const modules = new Map();
function load(name) {
    const cached = modules.get(name);
    if (cached) return cached.exports;
    const source = readFileSync(new URL(`${name}.ts`, root), "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const loaded = { exports: {} };
    modules.set(name, loaded);
    new Function("require", "exports", "module", compiled)(
        (id) => (id.startsWith("./") ? load(id.slice(2)) : require(id)),
        loaded.exports,
        loaded,
    );
    return loaded.exports;
}

const answer = load("answer");
const scoring = load("scoring");
const random = load("random");
const pool = load("pool");
const rounds = load("rounds");
const settings = load("settings");
const game = load("game");

const NOW = Date.UTC(2026, 9, 9);

function fakeSongs(count) {
    const musics = [];
    const vocals = [];
    for (let id = 1; id <= count; id++) {
        musics.push({ id, title: `Song ${id}`, pronunciation: `そんぐ${id}`, assetbundleName: `m${id}`, publishedAt: NOW - 1000, fillerSec: 9 });
        vocals.push({ id: id * 10, musicId: id, musicVocalType: "sekai", seq: 1, caption: "セカイver.", assetbundleName: `se_${id}` });
        vocals.push({ id: id * 10 + 1, musicId: id, musicVocalType: "virtual_singer", seq: 2, caption: "バーチャル・シンガーver.", assetbundleName: `vs_${id}` });
    }
    return { musics, vocals };
}

test("normalization folds width, case, katakana and punctuation", () => {
    assert.equal(answer.normalizeAnswer("Ｔｅｌｌ　Ｙｏｕｒ　Ｗｏｒｌｄ"), "tellyourworld");
    assert.equal(answer.normalizeAnswer("Tell Your World!"), "tellyourworld");
    assert.equal(answer.normalizeAnswer("テオ"), answer.normalizeAnswer("てお"));
    assert.equal(answer.normalizeAnswer("ﾃｵ"), "てお");
    assert.equal(answer.normalizeAnswer("ヒバナ -Reloaded-"), "ひばなreloaded");
});

test("typed answers accept title, reading, localized title and real aliases, kana-insensitively", () => {
    const entry = { id: 2, title: "テオ", pronunciation: "てお", localizedTitle: "Teo", aliases: ["01", "2", "t", "ておちゃん"] };
    for (const input of ["テオ", "てお", "ﾃｵ", " teo ", "TEO", "テオチャン", "ておちゃん"]) {
        assert.equal(answer.matchesTypedAnswer(entry, input), true, input);
    }
    // Music ids used as aliases ("01"), single characters and empty input never count.
    for (const input of ["01", "2", "t", "", "  ", "テ"]) {
        assert.equal(answer.matchesTypedAnswer(entry, input), false, input);
    }
    assert.equal(answer.isAcceptedAliasKey("01"), false);
    assert.equal(answer.isAcceptedAliasKey("v2"), true);
    // The numeric rule only filters aliases: a title that normalizes to digits still counts.
    const digits = { id: 3, title: "1/6", pronunciation: "ろくぶんのいち", aliases: ["3"] };
    assert.equal(answer.matchesTypedAnswer(digits, "1/6"), true);
    assert.equal(answer.matchesTypedAnswer(digits, "ロクブンノイチ"), true);
    assert.equal(answer.matchesTypedAnswer(digits, "3"), false);
});

test("suggestions rank exact and prefix matches before substrings and skip numeric aliases", () => {
    const index = answer.buildSongIndex([
        { id: 10, title: "Butterfly", pronunciation: "ばたふらい" },
        { id: 11, title: "Flyer!", pronunciation: "ふらいやー" },
        { id: 12, title: "テオ", pronunciation: "てお", aliases: ["01"] },
        { id: 13, title: "Tell Your World", pronunciation: "てるゆあわーるど", aliases: ["TYW"] },
        { id: 14, title: "Tell Your World", pronunciation: "てるゆあわーるど" },
    ]);
    assert.deepEqual(answer.searchSongs(index, "fly").map((hit) => hit.id), [11, 10]);
    assert.deepEqual(answer.searchSongs(index, "フライ").map((hit) => hit.id), [11, 10]);
    assert.deepEqual(answer.searchSongs(index, "01"), []);
    const tyw = answer.searchSongs(index, "tyw");
    assert.deepEqual(tyw.map((hit) => [hit.id, hit.kind]), [[13, "alias"]]);
    // Songs sharing a title are one answer.
    assert.equal(answer.searchSongs(index, "tell").length, 1);
    assert.equal(answer.isSameSong(index, 14, 13), true);
    assert.equal(answer.isSameSong(index, 12, 13), false);
});

test("scoring stacks clip, answer mode, vocal removal, time and combo", () => {
    const base = { timeLeft: 45, timeLimit: 45, clipSeconds: 30, answerMode: "choice", vocalRemovalApplied: false, combo: 1 };
    assert.equal(scoring.scoreRound(base), 1000);
    assert.equal(scoring.scoreRound({ ...base, clipSeconds: 15, answerMode: "suggest" }), 1690);
    assert.equal(scoring.scoreRound({ ...base, clipSeconds: 5, answerMode: "type" }), 3060);
    assert.equal(scoring.scoreRound({ ...base, clipSeconds: 2, answerMode: "type", vocalRemovalApplied: true }), 5940);
    assert.equal(scoring.scoreRound({ ...base, timeLeft: 22.5 }), 500);
    assert.equal(scoring.scoreRound({ ...base, timeLeft: 0 }), 100);
    assert.equal(scoring.scoreRound({ ...base, combo: 3 }), 2000);
    assert.equal(scoring.comboMultiplier(0), 1);
    assert.equal(scoring.comboMultiplier(2), 1.5);
    assert.equal(scoring.nextCombo(2, 0, true), 3);
    assert.equal(scoring.nextCombo(2, 1, true), 0);
    assert.equal(scoring.nextCombo(2, 0, false), 0);
    assert.equal(scoring.timeAfterWrongGuess(30), 15);
});

test("the round timer starts with the clip; wrong guesses halve the time and three end the round", () => {
    const { musics, vocals } = fakeSongs(12);
    const specs = rounds.buildRounds(pool.buildSongPool(musics, vocals, NOW), { seed: "abc", rounds: 2, optionsCount: 0 });
    const config = { clipSeconds: 15, answerMode: "suggest", vocalRemoval: false, timeLimit: 45 };
    let state = game.gameReducer(game.createGameState(), { type: "start", rounds: specs, config });
    const answerId = specs[0].musicId;
    const wrong = (key) => ({ key, label: key, musicId: null });

    // Before the clip plays nothing counts and the clock stands still.
    assert.equal(game.gameReducer(state, { type: "guess", now: 0, correct: true, guess: wrong("x") }), state);
    assert.equal(game.gameReducer(state, { type: "tick", now: 1e9 }), state);

    state = game.gameReducer(state, { type: "clipStarted", now: 1000, clipStart: 42 });
    assert.equal(state.round.status, "guessing");
    assert.equal(game.remainingMs(state.round, 1000), 45000);

    state = game.gameReducer(state, { type: "guess", now: 11000, correct: false, guess: wrong("a") });
    assert.equal(state.round.strikes, 1);
    assert.equal(game.remainingMs(state.round, 11000), 17500);
    // The same wrong answer again costs nothing.
    assert.equal(game.gameReducer(state, { type: "guess", now: 12000, correct: false, guess: wrong("a") }), state);

    const right = { key: `id:${answerId}`, label: "right", musicId: answerId };
    const won = game.gameReducer(state, { type: "guess", now: 18500, correct: true, guess: right });
    const result = won.results[0];
    assert.equal(result.outcome, "correct");
    assert.equal(result.clipStart, 42);
    assert.equal(result.combo, 0, "a second-try answer does not build the combo");
    assert.equal(result.score, scoring.scoreRound({ timeLeft: 10, timeLimit: 45, clipSeconds: 15, answerMode: "suggest", vocalRemovalApplied: false, combo: 0 }));

    let lost = game.gameReducer(state, { type: "guess", now: 12000, correct: false, guess: wrong("b") });
    lost = game.gameReducer(lost, { type: "guess", now: 13000, correct: false, guess: wrong("c") });
    assert.equal(lost.results[0].outcome, "wrong");
    assert.equal(lost.results[0].score, 0);

    const timedOut = game.gameReducer(state, { type: "tick", now: 1e9 });
    assert.equal(timedOut.results[0].outcome, "timeout");

    const next = game.gameReducer(won, { type: "next" });
    assert.equal(next.round.index, 1);
    assert.equal(next.round.status, "waiting");
    const finished = game.gameReducer(game.gameReducer(next, { type: "giveUp", now: 0 }), { type: "next" });
    assert.equal(finished.phase, "finished");
});

test("a vocal whose audio fails falls back to the song's next vocal", () => {
    const { musics, vocals } = fakeSongs(12);
    const specs = rounds.buildRounds(pool.buildSongPool(musics, vocals, NOW), { seed: "fallback", rounds: 1, optionsCount: 0 });
    const config = { clipSeconds: 5, answerMode: "type", vocalRemoval: false, timeLimit: 30 };
    let state = game.gameReducer(game.createGameState(), { type: "start", rounds: specs, config });
    state = game.gameReducer(state, { type: "audioFailed", now: 0 });
    assert.equal(state.round.vocalIndex, 1);
    state = game.gameReducer(state, { type: "audioFailed", now: 0 });
    assert.equal(state.results[0].outcome, "unavailable");
});

test("seeded rounds are deterministic and independent of the answer mode", () => {
    const { musics, vocals } = fakeSongs(40);
    const songPool = pool.buildSongPool([...musics].reverse(), vocals, NOW);
    const first = rounds.buildRounds(songPool, { seed: "share-me", rounds: 10, optionsCount: 6 });
    const again = rounds.buildRounds(pool.buildSongPool(musics, vocals, NOW), { seed: "share-me", rounds: 10, optionsCount: 6 });
    assert.deepEqual(first, again);
    const typed = rounds.buildRounds(songPool, { seed: "share-me", rounds: 10, optionsCount: 0 });
    assert.deepEqual(typed.map((round) => [round.musicId, round.vocals, round.startFraction]), first.map((round) => [round.musicId, round.vocals, round.startFraction]));
    const other = rounds.buildRounds(songPool, { seed: "another", rounds: 10, optionsCount: 6 });
    assert.notDeepEqual(other.map((round) => round.musicId), first.map((round) => round.musicId));

    assert.equal(new Set(first.map((round) => round.musicId)).size, 10);
    for (const round of first) {
        assert.equal(round.optionIds.length, 6);
        assert.equal(new Set(round.optionIds).size, 6);
        assert.ok(round.optionIds.includes(round.musicId));
        assert.ok(round.startFraction >= 0 && round.startFraction < 1);
    }

    const a = random.createRandom("x");
    const b = random.createRandom("x");
    assert.deepEqual([a.next(), a.int(10), a.next()], [b.next(), b.int(10), b.next()]);
    assert.equal(rounds.buildRounds(songPool.slice(0, 5), { seed: "x", rounds: 10, optionsCount: 0 }).length, 0);
});

test("medleys never enter the pool, but a song merely titled メドレー does", () => {
    const { musics, vocals } = fakeSongs(3);
    const credits = (name) => ({ composer: name, lyricist: name, arranger: name });
    musics.push({ ...musics[0], id: 674, title: "MASTER高難易度楽曲メドレー", assetbundleName: "m674", ...credits("-") });
    musics.push({ ...musics[0], id: 380, title: "スターダストメドレー", assetbundleName: "m380", ...credits("きさら") });
    vocals.push({ ...vocals[1], id: 6740, musicId: 674, assetbundleName: "vs_674" });
    vocals.push({ ...vocals[1], id: 3800, musicId: 380, assetbundleName: "vs_380" });
    const ids = pool.buildSongPool(musics, vocals, NOW).map((song) => song.music.id);
    assert.deepEqual(ids, [1, 2, 3, 380]);
    assert.equal(pool.isMedley({ composer: "cosMo@暴走P", lyricist: "cosMo@暴走P", arranger: "-" }), false);
});

test("a longer game with the same seed starts with the shorter game's questions", () => {
    const { musics, vocals } = fakeSongs(40);
    const songPool = pool.buildSongPool(musics, vocals, NOW);
    const ten = rounds.buildRounds(songPool, { seed: "prefix", rounds: 10, optionsCount: 4 });
    const twenty = rounds.buildRounds(songPool, { seed: "prefix", rounds: 20, optionsCount: 4 });
    const thirty = rounds.buildRounds(songPool, { seed: "prefix", rounds: 30, optionsCount: 4 });
    assert.equal(twenty.length, 20);
    assert.equal(thirty.length, 30);
    assert.deepEqual(twenty.slice(0, 10), ten);
    assert.deepEqual(thirty.slice(0, 20), twenty);
    assert.equal(new Set(thirty.map((round) => round.musicId)).size, 30);
    assert.equal(rounds.requiredPoolSize(30, 10), 30);
    assert.equal(rounds.buildRounds(songPool.slice(0, 25), { seed: "prefix", rounds: 30, optionsCount: 0 }).length, 0);
});

test("distractors never repeat the answer's title", () => {
    const { musics, vocals } = fakeSongs(8);
    musics.push({ ...musics[0], id: 99, assetbundleName: "m99" });
    vocals.push({ ...vocals[0], id: 990, musicId: 99 });
    const songPool = pool.buildSongPool(musics, vocals, NOW);
    for (let seed = 0; seed < 30; seed++) {
        for (const round of rounds.buildRounds(songPool, { seed: String(seed), rounds: 9, optionsCount: 8 })) {
            if (round.musicId !== 1 && round.musicId !== 99) continue;
            const twin = round.musicId === 1 ? 99 : 1;
            assert.equal(round.optionIds.includes(twin), false);
        }
    }
});

test("the pool keeps released songs with playable vocals only", () => {
    const musics = [
        { id: 1, title: "A", assetbundleName: "a", publishedAt: NOW - 1 },
        { id: 2, title: "B", assetbundleName: "b", publishedAt: NOW + 1 },
        { id: 3, title: "C", assetbundleName: "c", publishedAt: NOW - 1 },
        { id: 4, title: "D", assetbundleName: "d", publishedAt: NOW - 1 },
    ];
    const vocals = [
        { id: 10, musicId: 1, musicVocalType: "streaming_live", seq: 1, assetbundleName: "sl" },
        { id: 11, musicId: 1, musicVocalType: "april_fool_2022", seq: 2, assetbundleName: "af" },
        { id: 20, musicId: 2, musicVocalType: "sekai", seq: 1, assetbundleName: "s2" },
        { id: 30, musicId: 3, musicVocalType: "streaming_live", seq: 1, assetbundleName: "sl3" },
        { id: 40, musicId: 4, musicVocalType: "instrumental", seq: 1, assetbundleName: "in4" },
    ];
    const songPool = pool.buildSongPool(musics, vocals, NOW);
    assert.deepEqual(songPool.map((song) => [song.music.id, song.vocals.map((vocal) => vocal.id)]), [[1, [11]], [4, [40]]]);
    assert.equal(pool.vocalHasLyrics({ musicVocalType: "instrumental" }), false);
    assert.equal(pool.vocalHasLyrics({ musicVocalType: "another_vocal" }), true);
});

test("vocal removal draws only from vocals with an instrumental and never from Inst.ver.-only songs", () => {
    const { musics, vocals } = fakeSongs(30);
    // Song 30 exists only as Inst.ver.; even listed, it has nothing to remove.
    for (const vocal of vocals) if (vocal.musicId === 30) vocal.musicVocalType = "instrumental";
    const full = pool.buildSongPool(musics, vocals, NOW);
    // Instrumentals for the sekai vocal of songs 1-25 and the virtual-singer vocal of song 2, plus the Inst.ver. of song 30.
    const listed = new Set([...Array.from({ length: 25 }, (_, i) => (i + 1) * 10), 21, 300, 301]);
    const restricted = pool.restrictPoolToVocals(full, listed);
    assert.deepEqual(restricted.map((song) => song.music.id), Array.from({ length: 25 }, (_, i) => i + 1));
    assert.deepEqual(restricted[1].vocals.map((vocal) => vocal.id), [20, 21]);
    assert.deepEqual(restricted[0].vocals.map((vocal) => vocal.id), [10]);
    assert.equal(restricted[1], full[1], "a song keeping all its vocals is reused as is");
    assert.deepEqual(pool.restrictPoolToVocals(full, new Set()), []);

    const specs = rounds.buildRounds(restricted, { seed: "hell", rounds: 20, optionsCount: 0 });
    assert.equal(specs.length, 20);
    for (const spec of specs) {
        assert.ok(spec.musicId <= 25);
        for (const vocal of spec.vocals) {
            assert.ok(listed.has(vocal.vocalId));
            assert.equal(vocal.hasLyrics, true);
        }
    }
    // Too few songs with an instrumental for the game: no rounds at all.
    assert.equal(rounds.buildRounds(restricted, { seed: "hell", rounds: 30, optionsCount: 0 }).length, 0);
});

test("a vocal-removal game marks every round as vocals removed", () => {
    const { musics, vocals } = fakeSongs(12);
    const restricted = pool.restrictPoolToVocals(pool.buildSongPool(musics, vocals, NOW), new Set(vocals.map((vocal) => vocal.id)));
    const specs = rounds.buildRounds(restricted, { seed: "vr", rounds: 2, optionsCount: 0 });
    const config = { clipSeconds: 5, answerMode: "type", vocalRemoval: true, timeLimit: 45, seed: "vr" };
    let state = game.gameReducer(game.createGameState(), { type: "start", rounds: specs, config });
    assert.equal(game.isVocalRemovalApplied(state), true);
    // The server-cut clip reports where it sits in the song; the reveal shows that.
    state = game.gameReducer(state, { type: "clipStarted", now: 0, clipStart: 73.5 });
    state = game.gameReducer(state, { type: "giveUp", now: 1000 });
    assert.equal(state.results[0].clipStart, 73.5);
    assert.equal(state.results[0].vocalRemovalApplied, true);
    assert.equal(game.createGameState().config.seed, "");
});

test("clip starts stay past the lead-in and clear of the ending", () => {
    assert.equal(rounds.resolveClipStart(0, 9, 120, 15), 9);
    assert.equal(rounds.resolveClipStart(1, 9, 120, 15), 102);
    assert.equal(rounds.resolveClipStart(0.5, 9, 120, 15), 55.5);
    // Too short for the padding: the latest start that still fits the clip.
    assert.equal(rounds.resolveClipStart(0.7, 9, 20, 15), 5);
    assert.equal(rounds.formatClock(83.4), "01:23");
});

test("share links restore the settings and presets are detected", () => {
    const base = settings.defaultSettings("seed1");
    assert.equal(settings.detectPreset(base), "normal");
    assert.equal(base.rounds, settings.DEFAULT_ROUNDS);
    assert.equal(settings.DEFAULT_ROUNDS, 20);
    assert.deepEqual(settings.ROUND_COUNTS, [10, 20, 30]);
    const hell = settings.applyPreset(base, "hell");
    assert.equal(settings.detectPreset(hell), "hell");
    const custom = { ...hell, clipSeconds: 2, timeLimit: 60, server: "cn", answerMode: "choice", optionsCount: 8, rounds: 30 };
    const restored = settings.parseSettingsParams(settings.settingsToParams(custom), settings.defaultSettings("other"));
    assert.deepEqual(restored, custom);
    assert.equal(settings.detectPreset(restored), "custom");
    // The round count is not a difficulty dimension: changing it keeps the preset.
    assert.equal(settings.detectPreset({ ...hell, rounds: 10 }), "hell");
    assert.equal(settings.hasSettingsParams(new URLSearchParams("rounds=10")), true);
    assert.equal(settings.hasSettingsParams(new URLSearchParams("tab=free")), false);
    const clamped = settings.parseSettingsParams(new URLSearchParams("time=999&clip=7&mode=nope&rounds=15"), base);
    assert.equal(clamped.rounds, base.rounds);
    assert.equal(clamped.timeLimit, 120);
    assert.equal(clamped.clipSeconds, base.clipSeconds);
    assert.equal(clamped.answerMode, base.answerMode);
});
