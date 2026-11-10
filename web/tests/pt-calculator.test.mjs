import test from "node:test";
import assert from "node:assert/strict";
import { calculatePtRange, defaultPtForm, eventPt, normalizePtSkills, readPtForm, validatePtForm, writePtForm } from "../src/lib/pt-calculator/calculator.ts";
import { getPtSong } from "../src/lib/pt-calculator/songs.ts";
import { PT_MUSIC_METAS } from "./fixtures/pt-calculator.mjs";

const songs = PT_MUSIC_METAS.map((meta) => getPtSong(meta, "multi"));

function filledForm(mode = "multi") {
    return {
        ...defaultPtForm(mode), power: "368953", bonus: "435",
        skills: mode === "multi" ? ["248", "260", "250", "260", "260", "248"] : ["150", "130", "130", "130", "130", "150"],
    };
}

test("only song and energy have numeric defaults in both modes", () => {
    for (const mode of ["multi", "solo"]) {
        const form = defaultPtForm(mode);
        assert.equal(form.song, "74");
        assert.equal(form.fires, 10);
        assert.equal(form.power, "");
        assert.equal(form.bonus, "");
        assert.deepEqual(form.skills, Array(6).fill(""));
        assert.equal(validatePtForm(form), "incomplete");
        assert.equal(calculatePtRange(songs[0], form), null);
    }
});

test("co-op calculates score and PT bounds for unequal skill percentages", () => {
    assert.deepEqual(calculatePtRange(songs[0], filledForm()), {
        scoreMin: 6860681, scoreMax: 6923403, ptMin: 96775, ptMax: 97370,
    });
});

test("solo at the minimum 10% effectiveness has no Fever or co-op active bonus", () => {
    const form = { ...defaultPtForm("solo"), power: "300000", bonus: "0", fires: 0, skills: Array(6).fill("10") };
    assert.deepEqual(calculatePtRange(songs[0], form), {
        scoreMin: 1357500, scoreMax: 1357500, ptMin: 167, ptMax: 167,
    });
});

function permutations(values) {
    if (!values.length) return [[]];
    return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map((rest) => [value, ...rest]));
}

test("bounds contain every actual skill order on all three charts and both modes", () => {
    for (const song of songs) {
        for (const mode of ["solo", "multi"]) {
            const form = normalizePtSkills({ ...filledForm(mode), skills: ["10", "40", "120", "200", "288", "100"] });
            const result = calculatePtRange(song, form);
            const base = mode === "solo" ? song.solo.base : song.multi.base;
            const scores = [];
            const weights = mode === "solo" ? song.solo.skills : song.multi.skills;
            for (const order of permutations(form.skills.slice(0, 5).map(Number))) {
                const rate = base + weights[5] * Number(form.skills[5]) / 100
                    + order.reduce((sum, skill, index) => sum + weights[index] * skill / 100, 0);
                scores.push(Math.floor(rate * Number(form.power) * 4 + (mode === "multi" ? 0.375 * Number(form.power) : 0)));
            }
            assert.ok(Math.abs(result.scoreMin - Math.min(...scores)) <= 1);
            assert.ok(Math.abs(result.scoreMax - Math.max(...scores)) <= 1);
        }
    }
});

test("solo encore follows the leader, while co-op allows independent S6", () => {
    const solo = filledForm("solo");
    const result = calculatePtRange(songs[0], solo);
    assert.deepEqual(calculatePtRange(songs[0], { ...solo, skills: [...solo.skills.slice(0, 5), "0"] }), result);
    const multi = filledForm();
    assert.ok(calculatePtRange(songs[0], { ...multi, skills: [...multi.skills.slice(0, 5), "10"] }).scoreMax
        < calculatePtRange(songs[0], multi).scoreMax);
});

test("PT floors the score tier and base points before applying all energy multipliers", () => {
    const rates = [1, 5, 10, 15, 20, 25, 27, 29, 31, 33, 35];
    rates.forEach((rate, fires) => {
        assert.equal(eventPt(19999, 0, 100, fires, "solo"), 100 * rate);
        assert.equal(eventPt(20000, 0, 100, fires, "solo"), 101 * rate);
        assert.equal(eventPt(17499, 435, 122, fires, "multi"), 815 * rate);
        assert.equal(eventPt(17500, 435, 122, fires, "multi"), 822 * rate);
    });
});

test("URL round trip preserves arbitrary songs, difficulty, zero energy, and unrelated parameters", () => {
    for (const mode of ["multi", "solo"]) {
        const state = normalizePtSkills({ ...filledForm(mode), song: "9999", difficulty: "append", fires: 0, power: "" });
        const params = new URLSearchParams("unrelated=keep");
        writePtForm(params, state);
        assert.deepEqual(readPtForm(params), state);
        assert.equal(params.get("unrelated"), "keep");
    }
    const fallback = readPtForm(new URLSearchParams("mode=bad&song=invalid&fires=-1&difficulty=invalid&skills=1,2"));
    assert.deepEqual(fallback, defaultPtForm());
    assert.equal(readPtForm(new URLSearchParams("song=226")).difficulty, "hard");
    assert.equal(readPtForm(new URLSearchParams("song=226&difficulty=master")).difficulty, "master");
});

test("shared URLs distinguish effective percentages from legacy multipliers", () => {
    const params = new URLSearchParams("power=368953&bonus=435&skills=3.48,3.6,3.5,3.6,3.6,3.48&grouping=all&unrelated=keep");
    assert.deepEqual(readPtForm(params), filledForm());
    writePtForm(params, readPtForm(params));
    assert.equal(params.has("skills"), false);
    assert.equal(params.has("grouping"), false);
    assert.equal(params.get("effectiveSkills"), "248,260,250,260,260,248");
    assert.equal(params.get("unrelated"), "keep");
    assert.deepEqual(readPtForm(params), filledForm());
    params.set("effectiveSkills", "0,0,0,0,0,0");
    assert.deepEqual(readPtForm(params).skills, Array(6).fill("0"));
    writePtForm(params, defaultPtForm());
    assert.equal(params.has("power"), false);
    assert.equal(params.has("bonus"), false);
    assert.equal(params.has("effectiveSkills"), false);
    assert.deepEqual(readPtForm(params), defaultPtForm());
});

test("power accepts up to 1000000 and all six percentages must be between 10 and 288 inclusive", () => {
    const form = filledForm();
    assert.deepEqual(normalizePtSkills(form).skills, form.skills);
    for (const patch of [
        { power: "" }, { power: "Infinity" }, { power: "1000001" }, { power: "1.2" },
        { bonus: "-1" }, { bonus: "NaN" }, { bonus: "10001" },
        { skills: ["-1", ...form.skills.slice(1)] }, { skills: ["288.01", ...form.skills.slice(1)] },
        { skills: ["0", ...form.skills.slice(1)] }, { skills: ["9.99", ...form.skills.slice(1)] },
        { skills: ["", ...form.skills.slice(1)] }, { skills: ["NaN", ...form.skills.slice(1)] },
        { skills: ["Infinity", ...form.skills.slice(1)] },
    ]) {
        const invalid = { ...form, ...patch };
        assert.ok(validatePtForm(invalid));
        assert.equal(calculatePtRange(songs[0], invalid), null);
    }
    assert.equal(validatePtForm({ ...form, skills: Array(6).fill("10") }), null);
    assert.equal(validatePtForm({ ...form, skills: Array(6).fill("288") }), null);
    for (const power of ["1", "399960", "1000000"]) {
        assert.equal(validatePtForm({ ...form, power }), null);
        assert.ok(calculatePtRange(songs[0], { ...form, power }));
    }
});

test("any song's chart metadata supplies both solo and co-op calculations", () => {
    const meta = {
        music_id: 9999, difficulty: "master", base_score: 1, fever_score: 0.5, event_rate: 125,
        skill_score_multi: Array(6).fill(0.125), skill_score_solo: Array(6).fill(0.125),
    };
    const form = { ...filledForm(), song: "9999", difficulty: "master", power: "300000", bonus: "0", fires: 0, skills: Array(6).fill("100") };
    assert.deepEqual(calculatePtRange(getPtSong(meta, "multi"), form), {
        scoreMin: 2512500, scoreMax: 2512500, ptMin: 335, ptMax: 335,
    });
    assert.deepEqual(calculatePtRange(getPtSong(meta, "solo"), { ...form, mode: "solo" }), {
        scoreMin: 2100000, scoreMax: 2100000, ptMin: 256, ptMax: 256,
    });
    for (const mode of ["multi", "solo"]) {
        const skillKey = mode === "multi" ? "skill_score_multi" : "skill_score_solo";
        for (const weights of [undefined, [], [0.1], [0.1, 0.1, 0.1, 0.1, 0.1, NaN], Array(6).fill(-0.1)]) {
            assert.equal(getPtSong({ ...meta, [skillKey]: weights }, mode), null);
        }
        assert.equal(getPtSong({ ...meta, event_rate: NaN }, mode), null);
        assert.equal(getPtSong({ ...meta, base_score: NaN }, mode), null);
    }
});

test("every song and difficulty uses its supplied metadata coefficients", () => {
    for (const music_id of [74, 226, 448, 9999]) {
        for (const difficulty of ["hard", "expert", "master"]) {
            const chartMeta = {
                music_id, difficulty, base_score: 1, fever_score: 0.5, event_rate: 125,
                skill_score_multi: Array(6).fill(0.125), skill_score_solo: Array(6).fill(0.125),
            };
            const song = getPtSong(chartMeta, "multi");
            assert.deepEqual(song.multi, { base: 1.25, skills: chartMeta.skill_score_multi });
            const form = { ...filledForm(), power: "300000", bonus: "0", fires: 0, skills: Array(6).fill("100") };
            assert.deepEqual(calculatePtRange(song, form), {
                scoreMin: 2512500, scoreMax: 2512500, ptMin: 335, ptMax: 335,
            });
        }
    }
});
