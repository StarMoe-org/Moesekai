/**
 * The community story maker's document format (src/lib/storyMaker): the strict validator, the
 * stage reducer behind seeking, the playback planner and the document edits.
 * Run with: node --experimental-strip-types --test web/tests/story-maker.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const { validateStoryDocument, parseStoryJson } = await import("../src/lib/storyMaker/validate.ts");
const { stageStateAt, stageStateAlong, INITIAL_STAGE_STATE } = await import("../src/lib/storyMaker/state.ts");
const { runFrom, advance, choiceTarget } = await import("../src/lib/storyMaker/playback.ts");
const {
    createStoryDocument, createStep, insertStep, moveStep, duplicateStep, removeStep, addCastMember, removeCastMember,
    castUsage, storyFileName, serializeStory, newStoryId,
} = await import("../src/lib/storyMaker/document.ts");
const {
    DEFAULT_STORY_BACKGROUND, DEFAULT_STORY_BGM, DEFAULT_STORY_SE, SLOT_X, STORY_AUDIO_PATH_PATTERN, STORY_LIMITS,
    STORY_MOTION_PATTERN,
} = await import("../src/lib/storyMaker/limits.ts");
const { createStarterStoryDocument } = await import("../src/lib/storyMaker/starter.ts");
const { importWebTypeScript } = await import("./characterization/test-helpers.mjs");

function sample() {
    return {
        format: "moesekai-story/1",
        region: "jp",
        title: "放課後",
        summary: "A short scene",
        author: "someone",
        cast: [
            { key: "ichika", modelId: "v2_01ichika_casual", name: "一歌", characterId: 1 },
            { key: "saki", modelId: "v2_02saki_casual", name: "咲希", characterId: 2 },
        ],
        steps: [
            { id: "s1", op: "background", name: DEFAULT_STORY_BACKGROUND, transition: "fade" },
            { id: "s2", op: "bgm", action: "play", name: "bgm00001", volume: 0.8 },
            { id: "s3", op: "appear", cast: "ichika", slot: "left", fade: true, motion: "w-cool-normal01", facial: "face_smile_01" },
            { id: "s4", op: "talk", cast: "ichika", body: "Hello", lipSync: true },
            { id: "s5", op: "appear", cast: "saki", slot: "right", fade: true },
            { id: "s6", op: "move", cast: "ichika", slot: "center", duration: 0.5 },
            { id: "s7", op: "choice", options: [
                { id: "o1", text: "Stay", target: "l1" },
                { id: "o2", text: "Leave", target: "l2" },
            ] },
            { id: "l1", op: "label", name: "stay" },
            { id: "s8", op: "talk", name: "???", body: "Stay then", lipSync: true },
            { id: "s9", op: "jump", target: "l3" },
            { id: "l2", op: "label", name: "leave" },
            { id: "s10", op: "hide", cast: "saki", fade: true },
            { id: "s11", op: "narration", body: "She left." },
            { id: "l3", op: "label", name: "end" },
            { id: "s12", op: "effect", effect: "fadeOut", color: "white", duration: 1 },
            { id: "s13", op: "telop", body: "The end" },
        ],
    };
}

test("a well-formed document passes and comes back with only the known fields", () => {
    const raw = sample();
    raw.extra = "dropped";
    raw.steps[0].unknown = 1;
    const result = validateStoryDocument(raw);
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    assert.equal("extra" in result.doc, false);
    assert.equal("unknown" in result.doc.steps[0], false);
    assert.equal(result.doc.steps.length, raw.steps.length);
    assert.deepEqual(result.doc.cast[0], raw.cast[0]);
});

test("JSON that does not parse, other formats and unknown regions are refused", () => {
    assert.deepEqual(parseStoryJson("{oops").issues, [{ code: "invalidJson", path: "$" }]);
    assert.equal(validateStoryDocument([]).issues[0].code, "notObject");
    assert.equal(validateStoryDocument({ ...sample(), format: "moesekai-story/2" }).issues[0].code, "formatUnsupported");
    assert.equal(validateStoryDocument({ ...sample(), region: "us" }).issues[0].code, "regionInvalid");
});

test("unknown ops, bad ids, duplicates and unresolved references are reported with their paths", () => {
    const raw = sample();
    raw.steps.push({ id: "x1", op: "script", body: "alert(1)" });
    raw.steps.push({ id: "s1", op: "label", name: "dup" });
    raw.steps.push({ id: "bad id!", op: "label", name: "x" });
    raw.steps.push({ id: "x2", op: "jump", target: "nowhere" });
    raw.steps.push({ id: "x3", op: "talk", cast: "ghost", body: "boo", lipSync: true });
    raw.steps.push({ id: "x4", op: "talk", body: "nobody", lipSync: true });
    raw.cast.push({ key: "ichika", modelId: "v2_01ichika_school", name: "dup" });
    const result = validateStoryDocument(raw);
    assert.equal(result.ok, false);
    const codes = result.issues.map(issue => `${issue.code}@${issue.path}`);
    assert.ok(codes.includes(`opUnknown@steps[${raw.steps.length - 6}].op`), codes.join("\n"));
    assert.ok(codes.includes(`idDuplicate@steps[${raw.steps.length - 5}].id`));
    assert.ok(codes.includes(`idInvalid@steps[${raw.steps.length - 4}].id`));
    assert.ok(codes.includes(`speakerMissing@steps[${raw.steps.length - 1}]`));
    assert.ok(codes.includes("idDuplicate@cast[2].key"));
});

test("references are checked once the fields are sound", () => {
    const raw = sample();
    raw.steps.push({ id: "x2", op: "jump", target: "nowhere" });
    raw.steps.push({ id: "x3", op: "talk", cast: "ghost", body: "boo", lipSync: true });
    raw.steps[6].options[1].target = "missing";
    const codes = validateStoryDocument(raw).issues.map(issue => `${issue.code}@${issue.path}`);
    assert.ok(codes.includes(`labelUnresolved@steps[${raw.steps.length - 2}].target`));
    assert.ok(codes.includes(`castUnknown@steps[${raw.steps.length - 1}].cast`));
    assert.ok(codes.includes("labelUnresolved@steps[6].options[1].target"));
});

test("strings, counts and numbers are capped", () => {
    const long = { ...sample(), title: "x".repeat(STORY_LIMITS.title + 1) };
    assert.deepEqual(validateStoryDocument(long).issues[0], { code: "tooLong", path: "$.title", params: { max: STORY_LIMITS.title } });

    const many = sample();
    many.steps = Array.from({ length: STORY_LIMITS.steps + 1 }, (_, i) => ({ id: `n${i}`, op: "narration", body: "" }));
    assert.equal(validateStoryDocument(many).issues[0].code, "tooMany");

    const crowd = sample();
    crowd.cast = Array.from({ length: STORY_LIMITS.cast + 1 }, (_, i) => ({ key: `c${i}`, modelId: "v2_01ichika_casual", name: "x" }));
    assert.equal(validateStoryDocument(crowd).issues[0].code, "tooMany");

    const body = sample();
    body.steps[3].body = "x".repeat(STORY_LIMITS.body + 1);
    assert.equal(validateStoryDocument(body).issues[0].path, "steps[3].body");

    const range = sample();
    range.steps[1].volume = 3;
    assert.equal(validateStoryDocument(range).issues[0].code, "numberRange");

    const choice = sample();
    choice.steps[6].options = [choice.steps[6].options[0]];
    assert.equal(validateStoryDocument(choice).issues[0].code, "tooFew");
});

test("asset names are limited to the game's naming", () => {
    for (const name of ["../secret", "https://evil.example/x", "bg a"]) {
        const raw = sample();
        raw.steps[0].name = name;
        const result = validateStoryDocument(raw);
        assert.equal(result.ok, false, name);
        assert.equal(result.issues[0].code, "assetNameInvalid");
    }
    const emptyBg = sample();
    emptyBg.steps[0].name = "";
    assert.equal(validateStoryDocument(emptyBg).issues[0].code, "fieldMissing");
    const model = sample();
    model.cast[0].modelId = "V2/../x";
    assert.equal(validateStoryDocument(model).issues[0].code, "modelIdInvalid");
    const voice = sample();
    voice.steps[3].voice = { kind: "story", scenarioId: "../x", voiceId: "v1" };
    assert.equal(validateStoryDocument(voice).issues[0].code, "assetNameInvalid");
});

test("the issue list is bounded", () => {
    const raw = sample();
    raw.steps = Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, op: "nope" }));
    assert.equal(validateStoryDocument(raw).issues.length, 50);
});

test("stageStateAt folds the steps in document order", () => {
    const { doc } = validateStoryDocument(sample());
    assert.deepEqual(stageStateAt(doc, -1), INITIAL_STAGE_STATE);

    const atTalk = stageStateAt(doc, 3);
    assert.equal(atTalk.background, DEFAULT_STORY_BACKGROUND);
    assert.deepEqual(atTalk.bgm, { name: "bgm00001", volume: 0.8 });
    assert.deepEqual(atTalk.actors, [{ cast: "ichika", slot: "left", x: SLOT_X.left, y: 0, scale: 1, mirror: false, motion: "w-cool-normal01", facial: "face_smile_01" }]);
    assert.deepEqual(atTalk.dialogue, { stepId: "s4", cast: "ichika", speaker: "一歌", body: "Hello" });
    assert.equal(atTalk.speaking, "ichika");

    const moved = stageStateAt(doc, 5);
    assert.deepEqual(moved.actors.map(actor => [actor.cast, actor.x]), [["ichika", 0], ["saki", SLOT_X.right]]);
    // a line's lip sync stops with the next step; the dialogue window stays
    assert.equal(moved.speaking, null);
    assert.equal(moved.dialogue.stepId, "s4");

    const end = stageStateAt(doc, doc.steps.length - 1);
    assert.deepEqual(end.actors.map(actor => actor.cast), ["ichika"]);
    assert.deepEqual(end.screen, { color: "white", covered: true });
    assert.deepEqual(end.telop, { stepId: "s13", body: "The end" });
    assert.equal(end.dialogue, null);
    assert.equal(end.narration, null);
    // past the end is the end
    assert.deepEqual(stageStateAt(doc, 999), end);
});

test("a talk step's motion and facial change its speaker, a background clears the text", () => {
    const doc = createStoryDocument("jp");
    doc.cast.push({ key: "a", modelId: "v2_01ichika_casual", name: "A" });
    doc.steps.push(
        { id: "1", op: "appear", cast: "a", slot: "center", fade: false },
        { id: "2", op: "talk", cast: "a", body: "hi", facial: "face_angry_01", lipSync: false },
        { id: "3", op: "pose", cast: "a", motion: "m2" },
        { id: "4", op: "background", name: null, transition: "black" },
    );
    const talk = stageStateAt(doc, 1);
    assert.equal(talk.actors[0].facial, "face_angry_01");
    assert.equal(talk.speaking, null);
    const pose = stageStateAt(doc, 2);
    assert.deepEqual([pose.actors[0].motion, pose.actors[0].facial], ["m2", "face_angry_01"]);
    assert.equal(stageStateAt(doc, 3).dialogue, null);
});

test("runs stop at steps that wait, follow jumps and choices, and cut off loops", () => {
    const { doc } = validateStoryDocument(sample());
    const first = runFrom(doc, 0);
    assert.deepEqual(first, { path: [0, 1, 2, 3], stop: "block", at: 3 });

    const toChoice = advance(doc, 3);
    assert.deepEqual(toChoice, { path: [4, 5, 6], stop: "block", at: 6 });
    // a choice waits for an option
    assert.deepEqual(advance(doc, 6), { path: [], stop: "block", at: 6 });
    assert.equal(choiceTarget(doc, 6, "o2"), 10);
    assert.equal(choiceTarget(doc, 6, "nope"), null);

    const stay = advance(doc, 6, "o1");
    assert.deepEqual(stay, { path: [7, 8], stop: "block", at: 8 });
    const jumped = advance(doc, 8);
    assert.deepEqual(jumped, { path: [9, 13, 14, 15], stop: "block", at: 15 });
    assert.deepEqual(advance(doc, 15), { path: [], stop: "end", at: -1 });

    const leave = advance(doc, 6, "o2");
    assert.deepEqual(leave, { path: [10, 11, 12], stop: "block", at: 12 });

    // the state along a played path skips what was not played
    const along = stageStateAlong(doc, [...first.path, ...toChoice.path, ...leave.path]);
    assert.deepEqual(along.actors.map(actor => actor.cast), ["ichika"]);
    assert.deepEqual(along.narration, { stepId: "s11", body: "She left." });

    const loop = createStoryDocument("jp");
    loop.steps.push({ id: "l", op: "label", name: "top" }, { id: "j", op: "jump", target: "l" });
    assert.equal(runFrom(loop, 0).stop, "loop");
});

test("document edits keep ids unique and return new documents", () => {
    let doc = createStoryDocument("cn", "t");
    doc = addCastMember(doc, { modelId: "v2_01ichika_casual", name: "A", characterId: 1 });
    const key = doc.cast[0].key;
    const talk = createStep("talk", doc);
    assert.equal(talk.cast, key);
    doc = insertStep(doc, -1, talk);
    doc = insertStep(doc, 0, createStep("narration", doc));
    doc = insertStep(doc, -1, createStep("label", doc));
    assert.deepEqual(doc.steps.map(step => step.op), ["label", "talk", "narration"]);
    const jump = createStep("jump", doc);
    assert.equal(jump.target, doc.steps[0].id);

    const before = doc;
    doc = duplicateStep(doc, 1);
    assert.equal(before.steps.length, 3);
    assert.deepEqual(doc.steps.map(step => step.op), ["label", "talk", "talk", "narration"]);
    assert.notEqual(doc.steps[1].id, doc.steps[2].id);
    doc = moveStep(doc, 3, 0);
    assert.equal(doc.steps[0].op, "narration");
    doc = removeStep(doc, 0);
    assert.equal(castUsage(doc, key), 2);
    assert.equal(validateStoryDocument(JSON.parse(serializeStory({ ...doc, steps: doc.steps.map(step => step.op === "talk" ? { ...step, body: "x" } : step) }))).ok, true);
    const orphaned = removeCastMember(doc, key);
    assert.equal(validateStoryDocument(orphaned).issues[0].code, "castUnknown");

    const choice = createStep("choice", doc);
    assert.equal(choice.options.length, 2);
    assert.notEqual(choice.options[0].id, choice.options[1].id);
    assert.match(newStoryId(), /^[a-z0-9]{8}$/);
});

test("export file names are safe", () => {
    assert.equal(storyFileName(createStoryDocument("jp", "")), "story.moesekai-story.json");
    assert.equal(storyFileName(createStoryDocument("jp", ' a/b:c*?"<>| d ')), "abc-d.moesekai-story.json");
});

test("place step validates non-empty, empty clear, missing, and max length", () => {
    const valid = createStoryDocument("jp", "Place test");
    valid.steps.push(
        { id: "p1", op: "place", text: "Miyamasuzaka Girls Academy" },
        { id: "p2", op: "place", text: "" },
    );
    const okResult = validateStoryDocument(valid);
    assert.equal(okResult.ok, true, JSON.stringify(okResult.ok ? [] : okResult.issues));
    assert.equal(okResult.doc.steps[0].text, "Miyamasuzaka Girls Academy");
    assert.equal(okResult.doc.steps[1].text, "");

    const tooLong = createStoryDocument("jp", "Long place");
    tooLong.steps.push({ id: "p1", op: "place", text: "x".repeat(STORY_LIMITS.place + 1) });
    assert.deepEqual(validateStoryDocument(tooLong).issues[0], {
        code: "tooLong",
        path: "steps[0].text",
        params: { max: STORY_LIMITS.place },
    });

    const missing = createStoryDocument("jp", "Missing place text");
    missing.steps.push({ id: "p1", op: "place" });
    assert.equal(validateStoryDocument(missing).issues[0].code, "fieldMissing");
    assert.equal(validateStoryDocument(missing).issues[0].path, "steps[0].text");

    const badType = createStoryDocument("jp", "Bad place type");
    badType.steps.push({ id: "p1", op: "place", text: 123 });
    assert.equal(validateStoryDocument(badType).issues[0].code, "fieldType");
});

test("place persists across talks and backgrounds, clears on empty text, and does not block playback", () => {
    assert.equal(INITIAL_STAGE_STATE.place, null);
    let doc = createStoryDocument("jp", "Place state");
    doc = addCastMember(doc, { modelId: "v2_01ichika_casual", name: "Ichika", characterId: 1 });
    const key = doc.cast[0].key;
    const blankPlace = createStep("place", doc);
    assert.equal(blankPlace.op, "place");
    assert.equal(blankPlace.text, "");

    doc.steps.push(
        { id: "bg1", op: "background", name: "bg_a000001", transition: "fade" },
        { id: "pl1", op: "place", text: "Classroom" },
        { id: "ap1", op: "appear", cast: key, slot: "left", fade: true },
        { id: "tk1", op: "talk", cast: key, body: "Hi!", lipSync: true },
        { id: "bg2", op: "background", name: "bg_a000002", transition: "cut" },
        { id: "mv1", op: "move", cast: key, slot: "center", duration: 0.5 },
        { id: "tl1", op: "telop", body: "Later" },
        { id: "tk2", op: "talk", cast: key, body: "Still here.", lipSync: true },
        { id: "pl2", op: "place", text: "   " },
        { id: "pl3", op: "place", text: "Rooftop" },
        { id: "pl4", op: "place", text: "" },
        { id: "nr1", op: "narration", body: "Sunset." },
    );

    // Playback runs right through background + place + appear into talk without stopping at place.
    const first = runFrom(doc, 0);
    assert.deepEqual(first, { path: [0, 1, 2, 3], stop: "block", at: 3 });

    const atTalk1 = stageStateAt(doc, 3);
    assert.equal(atTalk1.place, "Classroom");
    assert.equal(atTalk1.dialogue?.body, "Hi!");

    // Background, move, and telop preserve place; telop clears dialogue and is cleared by next talk.
    assert.equal(stageStateAt(doc, 4).place, "Classroom");
    assert.equal(stageStateAt(doc, 5).place, "Classroom");
    const atTelop = stageStateAt(doc, 6);
    assert.equal(atTelop.place, "Classroom");
    assert.deepEqual(atTelop.telop, { stepId: "tl1", body: "Later" });
    assert.equal(atTelop.dialogue, null);

    const atTalk2 = stageStateAt(doc, 7);
    assert.equal(atTalk2.place, "Classroom");
    assert.equal(atTalk2.telop, null);
    assert.equal(atTalk2.dialogue?.body, "Still here.");

    // Whitespace-only place clears place without clearing dialogue or actors.
    const clearedWs = stageStateAt(doc, 8);
    assert.equal(clearedWs.place, null);
    assert.equal(clearedWs.dialogue?.body, "Still here.");
    assert.equal(clearedWs.actors.length, 1);

    // Updating place sets new text without clearing dialogue or actors.
    const updated = stageStateAt(doc, 9);
    assert.equal(updated.place, "Rooftop");
    assert.equal(updated.dialogue?.body, "Still here.");
    assert.equal(updated.actors.length, 1);

    // Playback runs through pl2 + pl3 + pl4 directly into narration.
    const toNarration = advance(doc, 7);
    assert.deepEqual(toNarration, { path: [8, 9, 10, 11], stop: "block", at: 11 });
    const atNarration = stageStateAlong(doc, [...first.path, 4, 5, 6, 7, ...toNarration.path]);
    assert.equal(atNarration.place, null);
    assert.deepEqual(atNarration.narration, { stepId: "nr1", body: "Sunset." });
});

test("starter demo document passes strict validation and branches cleanly", () => {
    const starter = createStarterStoryDocument("jp", {
        title: "Demo",
        summary: "Summary",
        author: "Author",
        ichikaName: "Ichika",
        sakiName: "Saki",
        placeOpening: "Miyamasuzaka Girls Academy · Classroom",
        telopOpening: "After-School Practice",
        lineIchikaGreeting: "Hi",
        lineSakiReply: "Hello",
        choicePractice: "Practice",
        choiceTea: "Tea",
        labelPractice: "practice",
        linePractice: "Let's play",
        labelTea: "tea",
        lineTea: "Let's eat",
        labelEnding: "end",
        narrationEnding: "Sunset",
        telopEnding: "Fin",
    });
    const result = validateStoryDocument(starter);
    assert.equal(result.ok, true, JSON.stringify(result.ok ? [] : result.issues));
    const first = runFrom(starter, 0);
    assert.equal(first.stop, "block");
    assert.equal(starter.steps[first.at].op, "telop");
    const firstState = stageStateAlong(starter, first.path);
    assert.equal(firstState.place, "Miyamasuzaka Girls Academy · Classroom");
    assert.equal(firstState.telop?.body, "After-School Practice");

    const second = advance(starter, first.at);
    const secondState = stageStateAlong(starter, [...first.path, ...second.path]);
    assert.equal(secondState.place, "Miyamasuzaka Girls Academy · Classroom");
    assert.equal(secondState.dialogue?.body, "Hi");
    assert.equal(secondState.telop, null);

    const endNarrationIndex = starter.steps.findIndex(step => step.op === "narration");
    assert.equal(stageStateAt(starter, endNarrationIndex).place, null);

    // Starter uses a verified classroom scene background, not a CG (bg_a000001..0099 or bg_s*).
    const bgStep = starter.steps.find(step => step.op === "background");
    assert.equal(bgStep?.name, DEFAULT_STORY_BACKGROUND);
    assert.equal(/^bg_a0000\d\d$/.test(bgStep?.name ?? ""), false);
    assert.equal((bgStep?.name ?? "").startsWith("bg_s"), false);

    // Starter uses a verified everyday classroom BGM (not the non-existent bgm00001) at an audible volume.
    const bgmStep = starter.steps.find(step => step.op === "bgm" && step.action === "play");
    assert.equal(bgmStep?.name, DEFAULT_STORY_BGM);
    assert.notEqual(bgmStep?.name, "bgm00001");
    assert.ok((bgmStep?.volume ?? 0) >= 0.7 && (bgmStep?.volume ?? 0) <= 1);
    assert.equal(firstState.bgm.name, DEFAULT_STORY_BGM);
});

test("SLOT_X uses authentic game stand positions and appear/move validate and persist scale & y", () => {
    assert.deepEqual(SLOT_X, {
        farLeft: -0.62,
        left: -0.365,
        center: 0,
        right: 0.365,
        farRight: 0.62,
    });

    const doc = createStoryDocument("jp", "Framing");
    doc.cast.push({ key: "a", modelId: "v2_01ichika_casual", name: "Ichika", characterId: 1 });
    doc.steps.push(
        { id: "ap1", op: "appear", cast: "a", slot: "left", fade: true, scale: 1.15, y: 0.12 },
        { id: "mv1", op: "move", cast: "a", slot: "right", duration: 0.5 },
        { id: "mv2", op: "move", cast: "a", slot: "center", duration: 0.4, scale: 1.3, y: -0.1 },
    );
    const valid = validateStoryDocument(doc);
    assert.equal(valid.ok, true, JSON.stringify(valid.ok ? [] : valid.issues));
    assert.equal(valid.doc.steps[0].scale, 1.15);
    assert.equal(valid.doc.steps[0].y, 0.12);
    assert.equal("scale" in valid.doc.steps[1], false);
    assert.equal("y" in valid.doc.steps[1], false);
    assert.equal(valid.doc.steps[2].scale, 1.3);
    assert.equal(valid.doc.steps[2].y, -0.1);

    const s0 = stageStateAt(valid.doc, 0);
    assert.deepEqual([s0.actors[0].x, s0.actors[0].scale, s0.actors[0].y], [-0.365, 1.15, 0.12]);
    // Move without scale/y preserves current actor framing.
    const s1 = stageStateAt(valid.doc, 1);
    assert.deepEqual([s1.actors[0].x, s1.actors[0].scale, s1.actors[0].y], [0.365, 1.15, 0.12]);
    // Move with scale/y updates actor framing.
    const s2 = stageStateAt(valid.doc, 2);
    assert.deepEqual([s2.actors[0].x, s2.actors[0].scale, s2.actors[0].y], [0, 1.3, -0.1]);

    // Out-of-bounds scale/y are rejected by strict validation.
    for (const bad of [
        { scale: STORY_LIMITS.scaleMin - 0.01 },
        { scale: STORY_LIMITS.scaleMax + 0.01 },
        { y: STORY_LIMITS.yMin - 0.01 },
        { y: STORY_LIMITS.yMax + 0.01 },
    ]) {
        const invalidAppear = structuredClone(doc);
        Object.assign(invalidAppear.steps[0], bad);
        assert.equal(validateStoryDocument(invalidAppear).issues[0].code, "numberRange");

        const invalidMove = structuredClone(doc);
        Object.assign(invalidMove.steps[1], bad);
        assert.equal(validateStoryDocument(invalidMove).issues[0].code, "numberRange");
    }

    const badType = structuredClone(doc);
    badType.steps[0].scale = "big";
    assert.equal(validateStoryDocument(badType).issues[0].code, "fieldType");

    // Default background, BGM and SE steps use verified assets that pass strict validation immediately.
    const defaultBg = createStep("background", doc);
    assert.equal(defaultBg.name, DEFAULT_STORY_BACKGROUND);
    const defaultBgm = createStep("bgm", doc);
    assert.equal(defaultBgm.action, "play");
    assert.equal(defaultBgm.name, DEFAULT_STORY_BGM);
    assert.equal(defaultBgm.volume, 0.75);
    const defaultSe = createStep("se", doc);
    assert.equal(defaultSe.name, DEFAULT_STORY_SE);
    const seDoc = { ...doc, steps: [...doc.steps, defaultSe] };
    assert.equal(validateStoryDocument(seDoc).ok, true);
});

test("useStoryAudio unlocks autoplay-blocked BGM on first user gesture without leaks or restarting", async () => {
    const { JSDOM } = await import("jsdom");
    const React = (await import("react")).default;
    const { act } = React;
    const { createRoot } = await import("react-dom/client");
    const { useStoryAudio } = await import("../src/components/story-maker/useStoryAudio.ts");

    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
    const prevWindow = globalThis.window;
    const prevDocument = globalThis.document;
    const prevAudio = globalThis.Audio;
    const prevActEnv = globalThis.IS_REACT_ACT_ENVIRONMENT;

    let playPolicy = "block"; // "block" | "allow" | "unsupported"
    const instances = [];

    class FakeAudio {
        constructor(src) {
            this.src = src;
            this.loop = false;
            this.volume = 1;
            this.paused = true;
            this.error = null;
            this.playCalls = 0;
            this.pauseCalls = 0;
            this.listeners = new Map();
            instances.push(this);
        }
        addEventListener(type, fn) {
            if (!this.listeners.has(type)) this.listeners.set(type, new Set());
            this.listeners.get(type).add(fn);
        }
        removeEventListener(type, fn) {
            this.listeners.get(type)?.delete(fn);
        }
        removeAttribute(name) {
            if (name === "src") this.src = "";
        }
        pause() {
            this.paused = true;
            this.pauseCalls += 1;
        }
        play() {
            this.playCalls += 1;
            if (playPolicy === "block") {
                const err = new Error("Autoplay blocked");
                err.name = "NotAllowedError";
                return Promise.reject(err);
            }
            if (playPolicy === "unsupported") {
                this.error = { code: 4 };
                const err = new Error("Not supported");
                err.name = "NotSupportedError";
                return Promise.reject(err);
            }
            this.paused = false;
            return Promise.resolve();
        }
    }

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Audio = FakeAudio;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    let added = 0;
    let removed = 0;
    const origAdd = dom.window.addEventListener.bind(dom.window);
    const origRemove = dom.window.removeEventListener.bind(dom.window);
    dom.window.addEventListener = (type, fn, opts) => {
        if (type === "pointerdown" || type === "click" || type === "keydown") added += 1;
        return origAdd(type, fn, opts);
    };
    dom.window.removeEventListener = (type, fn, opts) => {
        if (type === "pointerdown" || type === "click" || type === "keydown") removed += 1;
        return origRemove(type, fn, opts);
    };

    try {
        let controls = null;
        function Harness({ volume, muted }) {
            controls = useStoryAudio(volume, muted);
            return null;
        }
        const host = dom.window.document.getElementById("root");
        const root = createRoot(host);

        await act(async () => {
            root.render(React.createElement(Harness, { volume: 0.8, muted: false }));
        });

        // 1. Initial load blocked by autoplay policy -> audioBlocked=true & unlock listeners armed.
        await act(async () => {
            controls.syncBgm("https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/bgm00020/bgm00020.mp3", 0.75);
            await Promise.resolve();
        });
        assert.equal(instances.length, 1);
        assert.equal(instances[0].playCalls, 1);
        assert.equal(controls.audioBlocked, true);
        assert.equal(added, 3);
        assert.equal(removed, 0);

        // 2. First user gesture unlocks BGM, clears audioBlocked, and removes all unlock listeners.
        playPolicy = "allow";
        await act(async () => {
            dom.window.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
            await Promise.resolve();
        });
        assert.equal(instances[0].playCalls, 2);
        assert.equal(instances[0].paused, false);
        assert.equal(controls.audioBlocked, false);
        assert.equal(removed, added, "all unlock listeners must be removed after unlock");

        // 3. Re-syncing the same BGM updates volume without restarting or creating a new Audio.
        await act(async () => {
            controls.syncBgm("https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/bgm00020/bgm00020.mp3", 0.5);
            await Promise.resolve();
        });
        assert.equal(instances.length, 1);
        assert.equal(instances[0].playCalls, 2);
        assert.ok(Math.abs(instances[0].volume - 0.4) < 1e-6);

        // 4. Muting pauses BGM; unmuting resumes it cleanly.
        await act(async () => {
            root.render(React.createElement(Harness, { volume: 0.8, muted: true }));
        });
        assert.equal(instances[0].paused, true);
        assert.equal(instances[0].volume, 0);
        await act(async () => {
            root.render(React.createElement(Harness, { volume: 0.8, muted: false }));
            await Promise.resolve();
        });
        assert.equal(instances[0].paused, false);
        assert.equal(instances[0].playCalls, 3);

        // 5. Media load failure (404 / NotSupportedError) must NOT trap audioBlocked or leak listeners.
        playPolicy = "unsupported";
        await act(async () => {
            controls.syncBgm("https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/missing/missing.mp3", 0.75);
            await Promise.resolve();
        });
        assert.equal(controls.audioBlocked, false);
        assert.equal(removed, added);

        // 6. Autoplay block + unmount cleans up listeners with zero leaks.
        playPolicy = "block";
        await act(async () => {
            controls.syncBgm("https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/bgm00020/bgm00020.mp3", 0.75);
            await Promise.resolve();
        });
        assert.equal(controls.audioBlocked, true);
        assert.ok(added > removed);

        await act(async () => {
            root.unmount();
        });
        assert.equal(removed, added, "unmount must remove any armed unlock listeners");
    } finally {
        globalThis.window = prevWindow;
        globalThis.document = prevDocument;
        globalThis.Audio = prevAudio;
        globalThis.IS_REACT_ACT_ENVIRONMENT = prevActEnv;
    }
});

test("STORY_MOTION_PATTERN accepts official space-containing facials and rejects leading/trailing spaces", () => {
    for (const valid of [
        "face_ worry_01",
        "face_ serious_01",
        "face _angry_01",
        "face_ expressionless_01",
        "face_ sing_02",
        "w-cool-normal01",
        "a",
        "a".repeat(64),
    ]) {
        assert.equal(STORY_MOTION_PATTERN.test(valid), true, `expected valid: ${JSON.stringify(valid)}`);
        const raw = sample();
        raw.steps[2].facial = valid;
        const result = validateStoryDocument(raw);
        assert.equal(result.ok, true, `validateStoryDocument failed for ${JSON.stringify(valid)}: ${JSON.stringify(result.ok ? [] : result.issues)}`);
        assert.equal(result.doc.steps[2].facial, valid);
    }

    for (const invalid of [
        " face_worry_01",
        "face_worry_01 ",
        " ",
        "   ",
        "../face_smile_01",
        "facial/face_smile_01",
        "a".repeat(65),
    ]) {
        assert.equal(STORY_MOTION_PATTERN.test(invalid), false, `expected invalid: ${JSON.stringify(invalid)}`);
        const raw = sample();
        raw.steps[2].facial = invalid;
        const result = validateStoryDocument(raw);
        assert.equal(result.ok, false, `expected reject for ${JSON.stringify(invalid)}`);
        assert.equal(result.issues[0].code, "assetNameInvalid");
    }
});

test("BGM and SE accept bare IDs, pack paths, and MySEKAI soundtrack paths up to 128 chars", () => {
    for (const bgmName of [
        "bgm00020",
        "bgm00016_01/bgm00016_01_1",
        "bgm10001/bgm_area_leoneed_untitled",
        "mysekai/sound/bgm/music0001/music0001",
        "sound/scenario/bgm/bgm_area00001/bgm_area00001",
        "a".repeat(STORY_LIMITS.audioPath),
    ]) {
        assert.equal(STORY_AUDIO_PATH_PATTERN.test(bgmName), true, bgmName);
        const raw = sample();
        raw.steps[1].name = bgmName;
        const result = validateStoryDocument(raw);
        assert.equal(result.ok, true, `${bgmName}: ${JSON.stringify(result.ok ? [] : result.issues)}`);
        assert.equal(result.doc.steps[1].name, bgmName);
    }

    for (const seName of [
        DEFAULT_STORY_SE,
        "se_pack00001/se00056",
        "se_pack00001_b/se_walk_men_001_1",
        "se00001_b",
    ]) {
        const raw = sample();
        raw.steps.push({ id: "se1", op: "se", name: seName });
        const result = validateStoryDocument(raw);
        assert.equal(result.ok, true, `${seName}: ${JSON.stringify(result.ok ? [] : result.issues)}`);
        assert.equal(result.doc.steps.at(-1).name, seName);
    }

    for (const bad of [
        "../secret",
        "/bgm00020",
        "bgm00020/",
        "se_pack00001_b//se00001_b",
        "a/b/c/d/e/f",
        "bgm 00020",
        "https://evil.example/a.mp3",
        "a".repeat(STORY_LIMITS.audioPath + 1),
    ]) {
        assert.equal(STORY_AUDIO_PATH_PATTERN.test(bad), false, bad);
        const rawBgm = sample();
        rawBgm.steps[1].name = bad;
        assert.equal(validateStoryDocument(rawBgm).issues[0].code, "assetNameInvalid", bad);

        const rawSe = sample();
        rawSe.steps.push({ id: "se_bad", op: "se", name: bad });
        assert.equal(validateStoryDocument(rawSe).issues[0].code, "assetNameInvalid", bad);
    }
});

test("Checker.pattern emits fieldMissing instead of format errors when required fields are empty strings", () => {
    const cases = [
        ["bgm.name", (raw) => { raw.steps[1].name = ""; }, "steps[1].name"],
        ["se.name", (raw) => { raw.steps.push({ id: "se_empty", op: "se", name: "" }); }, "steps[16].name"],
        ["appear.cast", (raw) => { raw.steps[2].cast = ""; }, "steps[2].cast"],
        ["move.cast", (raw) => { raw.steps[5].cast = ""; }, "steps[5].cast"],
        ["hide.cast", (raw) => { raw.steps[11].cast = ""; }, "steps[11].cast"],
        ["pose.cast", (raw) => { raw.steps.push({ id: "p_empty", op: "pose", cast: "" }); }, "steps[16].cast"],
        ["jump.target", (raw) => { raw.steps[9].target = ""; }, "steps[9].target"],
        ["choice.option.target", (raw) => { raw.steps[6].options[0].target = ""; }, "steps[6].options[0].target"],
        ["voice.scenarioId", (raw) => { raw.steps[3].voice = { kind: "story", scenarioId: "", voiceId: "v1" }; }, "steps[3].voice.scenarioId"],
        ["voice.voiceId", (raw) => { raw.steps[3].voice = { kind: "story", scenarioId: "ev1", voiceId: "" }; }, "steps[3].voice.voiceId"],
        ["cast.modelId", (raw) => { raw.cast[0].modelId = ""; }, "cast[0].modelId"],
        ["step.id", (raw) => { raw.steps[0].id = ""; }, "steps[0].id"],
    ];
    for (const [label, mutate, expectedPath] of cases) {
        const raw = sample();
        mutate(raw);
        const result = validateStoryDocument(raw);
        assert.equal(result.ok, false, label);
        const match = result.issues.find(issue => issue.path === expectedPath);
        assert.ok(match, `${label}: missing issue at ${expectedPath}, got ${JSON.stringify(result.issues)}`);
        assert.equal(match.code, "fieldMissing", `${label}: expected fieldMissing, got ${match.code}`);
    }
});

test("storyMaker assets URL resolution and cached catalogs (SE, BGM/soundtrack, motion clips, voices)", async () => {
    const masterMock = {
        fail: false,
        tracks: [
            { id: 1, seq: 1, title: "With Gratitude", musicSoundTrackCategoryId: 1, assetbundleName: "sound/scenario/bgm/bgm_area00001", assetbundleFileName: "bgm_area00001" },
            { id: 101, seq: 10, title: "一緒に歌おう！", pronunciation: "いっしょにうたおう", musicSoundTrackCategoryId: 12, assetbundleName: "mysekai/sound/bgm/music0001", assetbundleFileName: "music0001" },
            { id: 104, seq: 20, title: "斜陽に照らされて", musicSoundTrackCategoryId: 3, assetbundleName: "sound/scenario/bgm/bgm_area00001", assetbundleFileName: "bgm_area00001" },
            { id: 121, seq: 30, title: "今、ここにある日常", musicSoundTrackCategoryId: 13, assetbundleName: "sound/scenario/bgm/bgm00018", assetbundleFileName: "bgm00018" },
        ],
        categories: [
            { id: 1, name: "ユニット総合" },
            { id: 3, name: "レオニ" },
            { id: 12, name: "マイセカイ" },
            { id: 13, name: "シナリオ" },
        ],
    };
    globalThis.__testMasterMock = masterMock;

    const assetsMod = await importWebTypeScript("src/lib/storyMaker/assets.ts", [
        [
            `import {\n    getAreaTalkVoiceUrl, getAssetBaseUrl, getBackgroundImageUrl, getCardStoryVoiceUrl, getStoryBgmUrl,\n    getStorySoundEffectUrl, getStoryVoiceUrl, type AssetLine,\n} from "@/lib/assets";`,
            `const getAssetBaseUrl = (s) => (s.startsWith("backup-") ? "https://storage.exmeaning.com" : "https://storage.pjsk.moe") + "/sekai-" + s.slice(s.indexOf("-") + 1) + "-assets";
const getBackgroundImageUrl = (n, s) => getAssetBaseUrl(s) + "/scenario/background/" + n + "/" + n + ".webp";
const getStoryBgmUrl = (n, s) => getAssetBaseUrl(s) + "/sound/scenario/bgm/" + n + "/" + n + ".mp3";
const getStorySoundEffectUrl = (n, s) => getAssetBaseUrl(s) + "/sound/scenario/se/" + n + ".mp3";
const getStoryVoiceUrl = (sc, v, s) => getAssetBaseUrl(s) + "/sound/scenario/voice/" + sc + "/" + v + ".mp3";
const getCardStoryVoiceUrl = (sc, v, s) => getAssetBaseUrl(s) + "/sound/card_scenario/voice/" + sc + "/" + v + ".mp3";
const getAreaTalkVoiceUrl = (sc, v, s) => getAssetBaseUrl(s) + "/sound/actionset/voice/" + sc + "/" + v + ".mp3";`,
        ],
        [
            `import { fetchMasterDataForServer } from "@/lib/fetch";`,
            `const fetchMasterDataForServer = async (_server, path) => {
    if (globalThis.__testMasterMock.fail) throw new Error("masterdata down");
    if (path === "musicSoundTracks.json") return globalThis.__testMasterMock.tracks;
    if (path === "musicSoundTrackCategories.json") return globalThis.__testMasterMock.categories;
    return [];
};`,
        ],
        [
            `import { STORY_ASSET_PATTERN, STORY_AUDIO_PATH_PATTERN } from "./limits";`,
            `const STORY_ASSET_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const STORY_AUDIO_PATH_PATTERN = /^(?=.{1,128}$)[A-Za-z0-9_-]+(?:\\/[A-Za-z0-9_-]+){0,4}$/;`,
        ],
    ]);

    // 1. URL builders (BGM + SE)
    assert.equal(
        assetsMod.storyBgmUrl("bgm00020", "jp", "main"),
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/bgm00020/bgm00020.mp3",
    );
    assert.equal(
        assetsMod.storyBgmUrl("bgm00016_01/bgm00016_01_1", "jp", "main"),
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/bgm00016_01/bgm00016_01_1.mp3",
    );
    assert.equal(
        assetsMod.storyBgmUrl("mysekai/sound/bgm/music0001/music0001", "cn", "backup"),
        "https://storage.exmeaning.com/sekai-cn-assets/mysekai/sound/bgm/music0001/music0001.mp3",
    );
    assert.equal(
        assetsMod.storySeUrl("se_pack00001_b/se00001_b", "jp", "main"),
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/se/se_pack00001_b/se00001_b.mp3",
    );
    assert.equal(
        assetsMod.storySeUrl("se_pack00001/se00056", "jp", "main"),
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/se/se_pack00001/se00056.mp3",
    );
    assert.deepEqual(assetsMod.storySeCandidateUrls("se_pack00001/se00056", "jp", "main"), [
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/se/se_pack00001/se00056.mp3",
    ]);
    // Before catalog is fetched, bare SE name tries se_pack00001_b then se_pack00001.
    assert.deepEqual(assetsMod.storySeCandidateUrls("se00056", "jp", "main"), [
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/se/se_pack00001_b/se00056.mp3",
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/se/se_pack00001/se00056.mp3",
    ]);

    const prevFetch = globalThis.fetch;
    const requested = [];
    const routes = {
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/se/se_pack00001_b/": {
            format: "directory-listing", version: 1,
            files: [{ name: "se00001_b.mp3" }, { name: "se00950.mp3" }],
        },
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/se/se_pack00001/": {
            format: "directory-listing", version: 1,
            files: [{ name: "se00056.mp3" }],
        },
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/": {
            format: "directory-listing", version: 1,
            directories: ["bgm", "bgm00000", "bgm00016_01", "bgm00018", "bgm00020", "bgm10001", "bgm90001", "bgm90040"],
        },
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/bgm00016_01/": {
            format: "directory-listing", version: 1,
            files: [{ name: "bgm00016_01_1.mp3" }, { name: "bgm00016_01_2.mp3" }],
        },
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/bgm10001/": {
            format: "directory-listing", version: 1,
            files: [{ name: "bgm_area_leoneed_untitled.mp3" }],
        },
        "https://storage.pjsk.moe/sekai-cn-assets/sound/scenario/bgm/": {
            format: "directory-listing", version: 1,
            directories: ["bgm00020"],
        },
        "https://assets.pjsk.moe/lib/jp/library/live2d/motion/v2_02saki_motion_base/_ripper.json": {
            crc: 123,
            files: [
                { path: "motion/w-cute01-nod.sse-motion.json" },
                { path: "facial/face_smile_01.sse-motion.json" },
                { path: "facial/face_ worry_01.sse-motion.json" },
                { path: "other/ignored.json" },
            ],
        },
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/voice/": {
            format: "directory-listing", version: 1,
            directories: ["event_210_01", "bad dir!"],
        },
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/voice/event_210_01/": {
            format: "directory-listing", version: 1,
            files: [{ name: "voice_ev_night_26_01_02_19.mp3" }, { name: "voice_ev_night_26_01_01_19.mp3" }],
        },
    };
    globalThis.fetch = async (url) => {
        const key = String(url);
        requested.push(key);
        const body = routes[key];
        if (!body) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => structuredClone(body) };
    };

    try {
        // 2. SE catalog populates deterministic <pack>/<file> items AND bare-name pack index.
        const seItems = await assetsMod.fetchStorySeCatalog("jp", "main");
        assert.deepEqual(seItems, [
            { name: "se_pack00001_b/se00001_b", pack: "se_pack00001_b", label: "se00001_b" },
            { name: "se_pack00001/se00056", pack: "se_pack00001", label: "se00056" },
            { name: "se_pack00001_b/se00950", pack: "se_pack00001_b", label: "se00950" },
        ]);
        // Now bare "se00056" resolves straight to se_pack00001!
        assert.equal(
            assetsMod.storySeUrl("se00056", "jp", "main"),
            "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/se/se_pack00001/se00056.mp3",
        );
        assert.equal(
            assetsMod.storySeCandidateUrls("se00056", "jp", "main")[0],
            "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/se/se_pack00001/se00056.mp3",
        );

        // 3. BGM catalog merges /soundtrack (deduped + MySEKAI) + expanded/unlisted scenario BGMs, skipping silent & stem dirs.
        const bgm = await assetsMod.fetchStoryBgmCatalog("jp", "main");
        assert.deepEqual(bgm.categories.map(c => c.id), [3, 12, 13]);
        assert.deepEqual(bgm.items.map(i => i.name), [
            "mysekai/sound/bgm/music0001/music0001",
            "bgm_area00001",
            "bgm00018",
            "bgm00016_01/bgm00016_01_1",
            "bgm00016_01/bgm00016_01_2",
            "bgm00020",
            "bgm10001/bgm_area_leoneed_untitled",
            "bgm90040",
        ]);
        const mysekaiTrack = bgm.items.find(i => i.name.startsWith("mysekai/"));
        assert.equal(mysekaiTrack?.mysekai, true);
        assert.equal(mysekaiTrack?.title, "一緒に歌おう！");
        const area1 = bgm.items.find(i => i.name === "bgm_area00001");
        assert.equal(area1?.title, "斜陽に照らされて");
        assert.equal(area1?.categoryId, 3);
        const unlisted = bgm.items.find(i => i.name === "bgm00020");
        assert.equal(unlisted?.source, "scenario");
        assert.equal(unlisted?.categoryId, null);

        // Masterdata failure gracefully falls back to scenario directory listing.
        masterMock.fail = true;
        const fallbackBgm = await assetsMod.fetchStoryBgmCatalog("cn", "main");
        assert.deepEqual(fallbackBgm.categories, []);
        assert.deepEqual(fallbackBgm.items.map(i => i.name), ["bgm00020"]);

        // 4. Live2D _ripper.json clip loader parses motions and space-containing facials sorted.
        const clips = await assetsMod.fetchMotionBundleClips("https://assets.pjsk.moe/lib/jp/", "live2d/motion/v2_02saki_motion_base");
        assert.deepEqual(clips, {
            motions: ["w-cute01-nod"],
            facials: ["face_ worry_01", "face_smile_01"],
        });

        // 5. 2-step Voice directory loaders list valid scenarios and voice files and reject invalid scenarioIds.
        assert.deepEqual(await assetsMod.fetchStoryVoiceScenarios("story", "jp", "main"), ["event_210_01"]);
        assert.deepEqual(
            await assetsMod.fetchStoryVoiceFiles("story", "event_210_01", "jp", "main"),
            ["voice_ev_night_26_01_01_19", "voice_ev_night_26_01_02_19"],
        );
        await assert.rejects(() => assetsMod.fetchStoryVoiceFiles("story", "../evil", "jp", "main"));
    } finally {
        globalThis.fetch = prevFetch;
        delete globalThis.__testMasterMock;
    }
});

test("isStoryCgBackground classifies CG vs scene backgrounds and fetchStoryBackgrounds caches per region|line", async () => {
    const clientMod = await importWebTypeScript("src/lib/live2dViewer/client.ts", [
        [
            `import { getAssetBaseUrl, type AssetLine } from "@/lib/assets";`,
            `const getAssetBaseUrl = (s) => "https://storage.pjsk.moe/sekai-" + s.slice(s.indexOf("-") + 1) + "-assets";`,
        ],
        [
            `import { live2dSources, type Live2DRegion } from "./config";`,
            `const live2dSources = (r) => ({ library: "", index: "https://assets.pjsk.moe/" + r + "/models.json" });`,
        ],
        [
            `import { parseLive2DModelIndex, type Live2DModel } from "./models";`,
            `const parseLive2DModelIndex = (v) => v;`,
        ],
    ]);

    for (const cg of ["bg_a000001", "bg_a000099", "bg_s000001", "bg_s000569"]) {
        assert.equal(clientMod.isStoryCgBackground(cg), true, cg);
    }
    for (const scene of ["bg_a000000", "bg_a000100", "bg_a000401", "bg_b000101", "bg_white", "bg00026"]) {
        assert.equal(clientMod.isStoryCgBackground(scene), false, scene);
    }

    const prevFetch = globalThis.fetch;
    let calls = 0;
    let failFirst = true;
    globalThis.fetch = async () => {
        calls += 1;
        if (failFirst) {
            failFirst = false;
            return { ok: false, status: 503, json: async () => ({}) };
        }
        return {
            ok: true, status: 200,
            json: async () => ({
                format: "directory-listing",
                version: 1,
                directories: ["background", "bg_a000001", "bg_a000401", "livetalk_default"],
            }),
        };
    };

    try {
        // Rejection evicts cache so retry works.
        await assert.rejects(() => clientMod.fetchStoryBackgrounds("jp", "main"));
        const first = await clientMod.fetchStoryBackgrounds("jp", "main");
        const second = await clientMod.fetchStoryBackgrounds("jp", "main");
        assert.deepEqual(first, ["bg_a000001", "bg_a000401"]);
        assert.deepEqual(second, first);
        assert.equal(calls, 2, "cached region|line must not re-fetch on second call");
    } finally {
        globalThis.fetch = prevFetch;
    }
});
