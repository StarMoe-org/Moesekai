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
const { DEFAULT_STORY_BACKGROUND, SLOT_X, STORY_LIMITS } = await import("../src/lib/storyMaker/limits.ts");
const { createStarterStoryDocument } = await import("../src/lib/storyMaker/starter.ts");

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
    for (const name of ["../secret", "https://evil.example/x", "bg a", ""]) {
        const raw = sample();
        raw.steps[0].name = name;
        const result = validateStoryDocument(raw);
        assert.equal(result.ok, false, name);
        assert.equal(result.issues[0].code, "assetNameInvalid");
    }
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

    // Default background step uses verified classroom scene background.
    const defaultBg = createStep("background", doc);
    assert.equal(defaultBg.name, DEFAULT_STORY_BACKGROUND);
});
