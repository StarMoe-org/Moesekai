/**
 * Unit test suite for the `moesekai-story/2` Story Maker architecture:
 * - Strict whitelist JSON validator & compiler diagnostic bridge (`validate.ts`)
 * - Static analyzer & 2-pass IR compiler (`compiler.ts`)
 * - Immutable graph / stage-slot / beat / variable / drag-drop mutations & auto-layout (`document.ts`)
 * - Deterministic Runtime VM & instant editor stage evaluator (`runtime.ts`)
 * - Bidirectional lossless MoeSekai Script (`.msk`) DSL (`script.ts`)
 * - Rich v2 starter story (`starter.ts`)
 * - v2 asset collector & Cache API preloader (`preloader.ts`)
 * - Retained audio, asset URL, voice search, Live2D catalog, and playback hook modules
 *
 * Run with: node --experimental-strip-types --test web/tests/story-maker.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const { STORY_ISSUE_CODES, STORY_SCHEMA_VERSION } = await import("../src/types/storyMaker.ts");
const {
    DEFAULT_STORY_BACKGROUND, DEFAULT_STORY_BGM, DEFAULT_STORY_SE, SLOT_X, STORY_AUDIO_PATH_PATTERN,
    STORY_LIMITS, STORY_MOTION_PATTERN, detectStageActorOverlaps, layoutStageActors,
} = await import("../src/lib/storyMaker/limits.ts");
const {
    STORY_DRAG_MIME, STORY_BEAT_DRAG_MIME, GRAPH_COL_GAP, GRAPH_ROW_GAP,
    newStoryId, createStoryDocument, createNode, moveNode, removeNode, duplicateNode,
    continueAndCutScene,
    connectEdge, disconnectEdge, disconnectPort, getNodeOutPorts, canConnectNodes,
    setSceneBackground, setSceneBgm, setScenePlace, setSceneTransition, setSceneStageCast,
    addActorToSceneCast, addCastKeyToScene, updateActorInSceneCast, removeActorFromSceneCast,
    createSceneBeat, insertBeat, updateBeat, removeBeat, duplicateBeat, moveBeat,
    addChoiceOption, updateChoiceOption, removeChoiceOption,
    addConditionRule, removeConditionRule,
    updateStoryMeta, addCastMember, removeCastMember, castUsage, speakerName,
    addVariable, updateVariable, removeVariable, variableUsage,
    acceptsTarget, canDropOnTarget, applyDragPayloadToTarget, autoLayoutGraph,
    storyFileName, storyScriptFileName, serializeStory,
} = await import("../src/lib/storyMaker/document.ts");
const { compileStoryGraph } = await import("../src/lib/storyMaker/compiler.ts");
const { validateStoryDocument, parseStoryJson, parseStoryDocumentDraft } = await import("../src/lib/storyMaker/validate.ts");
const {
    INITIAL_STAGE_STATE, initVariables, interpolateStoryText, evaluateCondition, applyVarOps,
    createInitialRuntime, advanceRuntime, evaluateStageAt,
} = await import("../src/lib/storyMaker/runtime.ts");
const {
    STORY_SCRIPT_EXT, STORY_SCRIPT_NAME, serializeStoryScript, parseStoryScript,
} = await import("../src/lib/storyMaker/script.ts");
const starterModule = await import("../src/lib/storyMaker/starter.ts");
const { createStarterStoryDocument, createStarterStoryFromScript } = starterModule;
const {
    extractWaveformPeaks, decodeStoryAudio, getCachedStoryAudio, clearStoryAudioCache,
} = await import("../src/lib/storyMaker/audioCache.ts");
const { importWebTypeScript } = await import("./characterization/test-helpers.mjs");

function starterStrings() {
    return {
        title: "放学后的小小练习",
        summary: "内置示例剧情",
        author: "示例模板",
        ichikaName: "星乃一歌",
        sakiName: "天马咲希",
        placeOpening: "宫益坂女子学园 教室",
        telopOpening: "放学后的排练",
        lineIchikaGreeting: "辛苦了！今天放学后要做什么好呢？",
        lineSakiReply: "欸嘿嘿，机会难得哦！",
        choicePractice: "去音乐教室合练新歌",
        choiceTea: "去附近的甜品店休息一下",
        labelPractice: "合练路线",
        linePractice: "我们把副歌部分再合一遍吧！",
        labelTea: "甜品路线",
        lineTea: "今天有限定草莓圣代！",
        labelEnding: "结局判定",
        narrationEnding: "夕阳透过窗户洒进走廊。",
        telopEnding: "放学后的甜蜜时光",
        varAffectionName: "默契度",
        endingPracticeTitle: "默契合练结局",
        endingCafeTitle: "甜蜜放学结局",
    };
}

function makeStarter(region = "jp") {
    return createStarterStoryDocument(region, starterStrings());
}

// ==================== 1. Validation & Schema Tests ====================

test("v2 starter story passes strict validation, strips unknown fields, and compiles with 0 errors/warnings", () => {
    const raw = structuredClone(makeStarter("jp"));
    raw.extraRoot = "should-be-dropped";
    raw.meta.extraMeta = 123;
    raw.nodes.scene_open.unknownField = true;
    raw.nodes.scene_open.beats[0].injected = "bad";

    const result = validateStoryDocument(raw);
    assert.equal(result.ok, true, JSON.stringify(result.ok ? [] : result.issues));
    assert.equal(result.doc.schema, STORY_SCHEMA_VERSION);
    assert.equal("extraRoot" in result.doc, false);
    assert.equal("extraMeta" in result.doc.meta, false);
    assert.equal("unknownField" in result.doc.nodes.scene_open, false);
    assert.equal("injected" in result.doc.nodes.scene_open.beats[0], false);

    assert.equal(result.program.ok, true);
    assert.equal(result.program.errors.length, 0);
    assert.equal(result.program.warnings.length, 0);
    assert.deepEqual(result.program.endingNodeIds, ["end_practice", "end_cafe"]);
    assert.equal(result.program.reachableNodeIds.length, 8);
});

test("parseStoryJson and validateStoryDocument refuse malformed JSON, v1 docs, bad regions, and prototype keys", () => {
    assert.deepEqual(parseStoryJson("{broken").issues, [{ code: "invalidJson", path: "$" }]);
    assert.equal(validateStoryDocument([]).issues[0].code, "notObject");
    assert.equal(validateStoryDocument({ format: "moesekai-story/1", region: "jp", title: "old", cast: [], steps: [] }).issues[0].code, "formatUnsupported");
    assert.equal(validateStoryDocument({ ...makeStarter(), region: "us" }).issues[0].code, "regionInvalid");

    const protoDoc = makeStarter();
    Object.defineProperty(protoDoc.nodes, "__proto__", { value: { id: "__proto__", type: "end", title: "x", pos: { x: 0, y: 0 } }, enumerable: true });
    const protoRes = validateStoryDocument(protoDoc);
    assert.equal(protoRes.ok, false);
    assert.ok(protoRes.issues.some(i => i.code === "idInvalid"));
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
        assert.equal(STORY_MOTION_PATTERN.test(valid), true, valid);
        const doc = makeStarter();
        doc.nodes.scene_open.stageCast.actors[0].facial = valid;
        const res = validateStoryDocument(doc);
        assert.equal(res.ok, true, `${valid}: ${JSON.stringify(res.ok ? [] : res.issues)}`);
        assert.equal(res.doc.nodes.scene_open.stageCast.actors[0].facial, valid);
    }

    for (const invalid of [
        " face_worry_01",
        "face_worry_01 ",
        " ",
        "../face_smile_01",
        "facial/face_smile_01",
        "a".repeat(65),
    ]) {
        assert.equal(STORY_MOTION_PATTERN.test(invalid), false, invalid);
        const doc = makeStarter();
        doc.nodes.scene_open.stageCast.actors[0].facial = invalid;
        const res = validateStoryDocument(doc);
        assert.equal(res.ok, false, invalid);
        assert.equal(res.issues[0].code, "assetNameInvalid");
    }
});

test("BGM and SE accept bare IDs, pack paths, and MySEKAI paths up to 128 chars and reject unsafe paths", () => {
    for (const bgmName of [
        "bgm00020",
        "bgm00016_01/bgm00016_01_1",
        "bgm10001/bgm_area_leoneed_untitled",
        "mysekai/sound/bgm/music0001/music0001",
        "sound/scenario/bgm/bgm_area00001/bgm_area00001",
        "a".repeat(STORY_LIMITS.audioPath),
    ]) {
        assert.equal(STORY_AUDIO_PATH_PATTERN.test(bgmName), true, bgmName);
        const doc = makeStarter();
        doc.nodes.scene_open.bgm = { mode: "play", name: bgmName, volume: 0.8 };
        const res = validateStoryDocument(doc);
        assert.equal(res.ok, true, `${bgmName}: ${JSON.stringify(res.ok ? [] : res.issues)}`);
    }

    for (const bad of ["../secret", "/bgm00020", "bgm00020/", "a//b", "a/b/c/d/e/f", "bgm 01", "https://evil.example/a.mp3", "a".repeat(129)]) {
        assert.equal(STORY_AUDIO_PATH_PATTERN.test(bad), false, bad);
        const doc = makeStarter();
        doc.nodes.scene_open.bgm = { mode: "play", name: bad, volume: 0.8 };
        assert.equal(validateStoryDocument(doc).issues[0].code, "assetNameInvalid", bad);
    }
});

test("voice kind 'part', voice.region cross-server override, and voice trim bounds are strictly enforced", () => {
    const validVoices = [
        { kind: "part", scenarioId: "01ichika_light_sound", voiceId: "partvoice_01_001" },
        { kind: "story", scenarioId: "ev_01", voiceId: "v_01", region: "cn", start: 0 },
        { kind: "story", scenarioId: "ev_01", voiceId: "v_01", start: 0.1, end: 0.15 },
        { kind: "card", scenarioId: "001001_ichika01", voiceId: "v_01", region: "en", start: 0, end: 600 },
    ];
    for (const voice of validVoices) {
        const doc = makeStarter();
        doc.nodes.scene_open.beats[1].voice = voice;
        const res = validateStoryDocument(doc);
        assert.equal(res.ok, true, JSON.stringify(res.ok ? [] : res.issues));
        assert.deepEqual(res.doc.nodes.scene_open.beats[1].voice, voice);
    }

    const invalidTrimCases = [
        { kind: "story", scenarioId: "ev_01", voiceId: "v_01", start: -0.1 },
        { kind: "story", scenarioId: "ev_01", voiceId: "v_01", start: 600.1 },
        { kind: "story", scenarioId: "ev_01", voiceId: "v_01", end: 0 },
        { kind: "story", scenarioId: "ev_01", voiceId: "v_01", end: 601 },
        { kind: "story", scenarioId: "ev_01", voiceId: "v_01", start: 2, end: 2 },
        { kind: "story", scenarioId: "ev_01", voiceId: "v_01", start: 3, end: 2 },
        { kind: "story", scenarioId: "ev_01", voiceId: "v_01", start: 1.0, end: 1.04 },
    ];
    for (const voice of invalidTrimCases) {
        const doc = makeStarter();
        doc.nodes.scene_open.beats[1].voice = voice;
        const res = validateStoryDocument(doc);
        assert.equal(res.ok, false);
        assert.ok(res.issues.some(i => i.code === "voiceTrimInvalid"));
    }

    const badRegionDoc = makeStarter();
    badRegionDoc.nodes.scene_open.beats[1].voice = { kind: "story", scenarioId: "ev_01", voiceId: "v_01", region: "us" };
    assert.ok(validateStoryDocument(badRegionDoc).issues.some(i => i.code === "regionInvalid"));
});

test("stageCast enforces unique castKey and max 5 actors; parseStoryDocumentDraft keeps mid-edit v2 drafts", () => {
    const dupDoc = makeStarter();
    dupDoc.nodes.scene_open.stageCast = {
        mode: "set",
        actors: [
            { castKey: "ichika", slot: "left" },
            { castKey: "ichika", slot: "right" },
        ],
    };
    const dupRes = validateStoryDocument(dupDoc);
    assert.equal(dupRes.ok, false);
    assert.ok(dupRes.issues.some(i => i.code === "actorDuplicate"));

    const crowdDoc = makeStarter();
    crowdDoc.cast.push(
        { key: "c3", modelId: "v2_03honami_casual", name: "Honami" },
        { key: "c4", modelId: "v2_04shiho_casual", name: "Shiho" },
        { key: "c5", modelId: "v2_05minori_casual", name: "Minori" },
        { key: "c6", modelId: "v2_06haruka_casual", name: "Haruka" },
    );
    crowdDoc.nodes.scene_open.stageCast = {
        mode: "set",
        actors: [
            { castKey: "ichika", slot: "farLeft" },
            { castKey: "saki", slot: "left" },
            { castKey: "c3", slot: "center" },
            { castKey: "c4", slot: "right" },
            { castKey: "c5", slot: "farRight" },
            { castKey: "c6", slot: "center" },
        ],
    };
    const crowdRes = validateStoryDocument(crowdDoc);
    assert.equal(crowdRes.ok, false);
    assert.ok(crowdRes.issues.some(i => i.code === "actorLimitExceeded"));

    // Brand-new unwired v2 draft fails strict validate (startDisconnected) but is accepted by parseStoryDocumentDraft.
    const blank = createStoryDocument("jp", "WIP");
    assert.equal(validateStoryDocument(blank).ok, false);
    assert.ok(parseStoryDocumentDraft(blank) !== null);
    assert.equal(parseStoryDocumentDraft({ format: "moesekai-story/1", region: "jp", title: "old", cast: [], steps: [] }), null);
});

// ==================== 2. Compiler & Static Diagnostics Tests ====================

test("compiler reports hard errors for broken start, invalid edges, duplicate port wires, and bad speaker/choice", () => {
    const doc = createStoryDocument("jp", "Errors");
    const c0 = compileStoryGraph(doc);
    assert.equal(c0.ok, false);
    assert.ok(c0.errors.some(d => d.code === "startDisconnected"));

    const noStart = structuredClone(doc);
    delete noStart.nodes.start;
    assert.ok(compileStoryGraph(noStart).errors.some(d => d.code === "startMissing"));

    const badEdges = makeStarter();
    badEdges.edges.push(
        { id: "e_bad_src", fromNodeId: "end_practice", fromPortId: "out", toNodeId: "scene_open" },
        { id: "e_bad_tgt", fromNodeId: "scene_open", fromPortId: "out", toNodeId: "start" },
        { id: "e_dup_port", fromNodeId: "start", fromPortId: "out", toNodeId: "scene_cafe" },
    );
    const badRes = compileStoryGraph(badEdges);
    assert.equal(badRes.ok, false);
    assert.ok(badRes.errors.some(d => d.code === "edgeInvalidSource"));
    assert.ok(badRes.errors.some(d => d.code === "edgeInvalidTarget"));
    assert.ok(badRes.errors.some(d => d.code === "edgeDuplicatePort"));

    const badContent = makeStarter();
    badContent.nodes.scene_open.beats[1] = { id: "scene_open_b2", kind: "talk", body: "No speaker" };
    badContent.nodes.choice_plan.options[0].text = "   ";
    const contentRes = compileStoryGraph(badContent);
    assert.equal(contentRes.ok, false);
    assert.ok(contentRes.errors.some(d => d.code === "speakerMissing"));
    assert.ok(contentRes.errors.some(d => d.code === "choiceOptionEmpty"));
});

test("compiler validates variable references, type compatibility, and {{var}} template placeholders", () => {
    const doc = makeStarter();
    doc.variables.push({ id: "has_key", name: "钥匙", type: "boolean", initial: false });

    // Valid template using variable display name (`{{默契度}}`) AND id (`{{has_key}}`) compiles cleanly.
    doc.nodes.scene_open.beats[1].body = "当前默契 {{默契度}}，钥匙 {{has_key}}";
    assert.equal(compileStoryGraph(doc).ok, true);

    // Missing template variable triggers templateVarMissing error.
    const missingTpl = structuredClone(doc);
    missingTpl.nodes.scene_open.beats[1].body = "Hello {{ghost_var}}!";
    assert.ok(compileStoryGraph(missingTpl).errors.some(d => d.code === "templateVarMissing"));

    // Type mismatch: boolean with `>` or `add`, number with `toggle`, unknown variable id.
    const typeBad = structuredClone(doc);
    typeBad.nodes.cond_ending.rules.push({
        id: "rule_bad_bool",
        expr: { varId: "has_key", op: ">", value: true },
    });
    typeBad.nodes.scene_open.beats.push({
        id: "b_var_bad",
        kind: "varOp",
        ops: [
            { varId: "affection", op: "toggle" },
            { varId: "has_key", op: "add", value: 1 },
            { varId: "missing_id", op: "set", value: 1 },
        ],
    });
    const res = compileStoryGraph(typeBad);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(d => d.code === "variableTypeMismatch"));
    assert.ok(res.errors.some(d => d.code === "variableNotFound"));
});

test("compiler emits non-blocking warnings for isolated draft nodes, unwired ports, empty scenes, missing endings, and zero-wait cycles", () => {
    // 1. Add an isolated empty draft scene to an otherwise valid story -> ok === true with warnings!
    const withDraft = makeStarter();
    const added = createNode(withDraft, "scene", { x: 400, y: 600 }, { id: "draft_scene", title: "Draft" });
    const prog1 = compileStoryGraph(added.doc);
    assert.equal(prog1.ok, true, JSON.stringify(prog1.errors));
    assert.ok(prog1.warnings.some(w => w.code === "nodeUnreachable" && w.nodeId === "draft_scene"));
    assert.ok(prog1.warnings.some(w => w.code === "sceneEmptyBeats" && w.nodeId === "draft_scene"));
    assert.ok(prog1.warnings.some(w => w.code === "portUnwired" && w.nodeId === "draft_scene"));
    // Isolated draft scene is STILL lowered into IR with a valid entry PC!
    assert.equal(typeof prog1.nodeEntryPc.draft_scene, "number");

    // 2. Story with no ending and a zero-wait cycle: start -> empty_a -> empty_b -> empty_a
    let cyc = createStoryDocument("jp", "Cycle");
    cyc = createNode(cyc, "scene", { x: 300, y: 100 }, { id: "s_a", title: "A" }).doc;
    cyc = createNode(cyc, "scene", { x: 600, y: 100 }, { id: "s_b", title: "B" }).doc;
    cyc = connectEdge(cyc, "start", "out", "s_a");
    cyc = connectEdge(cyc, "s_a", "out", "s_b");
    cyc = connectEdge(cyc, "s_b", "out", "s_a");
    const prog2 = compileStoryGraph(cyc);
    assert.equal(prog2.ok, true);
    assert.ok(prog2.warnings.some(w => w.code === "endingMissing"));
    assert.ok(prog2.warnings.some(w => w.code === "cycleDetected"));
});

// ==================== 3. Document Graph Mutations & Drag-Drop Tests ====================

test("createNode produces 100% isolated nodes; connectEdge/removeNode/duplicateNode enforce graph invariants", () => {
    let doc = createStoryDocument("jp", "Graph Ops");
    const s1 = createNode(doc, "scene", { x: 300, y: 120 }, { title: "Opening" });
    doc = s1.doc;
    assert.equal(doc.edges.length, 0);

    const ch = createNode(doc, "choice", { x: 620, y: 120 }, { title: "Pick" });
    doc = ch.doc;
    const end = createNode(doc, "end", { x: 960, y: 120 }, { title: "Fin" });
    doc = end.doc;

    // Cannot wire into start or out of end.
    assert.equal(canConnectNodes(doc, s1.node.id, "out", "start").ok, false);
    assert.equal(canConnectNodes(doc, end.node.id, "out", s1.node.id).ok, false);
    assert.equal(connectEdge(doc, s1.node.id, "out", "start"), doc);
    assert.equal(connectEdge(doc, end.node.id, "out", s1.node.id), doc);

    // Valid wiring; re-wiring the same port replaces the prior edge cleanly (1-to-1 per output port).
    doc = connectEdge(doc, "start", "out", s1.node.id);
    doc = connectEdge(doc, s1.node.id, "out", ch.node.id);
    doc = connectEdge(doc, s1.node.id, "out", end.node.id); // replaces s1->ch!
    assert.equal(doc.edges.filter(e => e.fromNodeId === s1.node.id && e.fromPortId === "out").length, 1);
    assert.equal(doc.edges.find(e => e.fromNodeId === s1.node.id)?.toNodeId, end.node.id);

    // Duplicate creates an isolated copy with fresh IDs.
    const dup = duplicateNode(doc, ch.node.id);
    doc = dup.doc;
    assert.ok(dup.node && dup.node.id !== ch.node.id);
    assert.notEqual(dup.node.options[0].id, ch.node.options[0].id);
    assert.equal(doc.edges.some(e => e.fromNodeId === dup.node.id || e.toNodeId === dup.node.id), false);

    // removeNode refuses to delete start, and deletes incident edges when removing other nodes.
    assert.equal(removeNode(doc, "start"), doc);
    const removed = removeNode(doc, s1.node.id);
    assert.equal(s1.node.id in removed.nodes, false);
    assert.equal(removed.edges.length, 0);

    // disconnectEdge / disconnectPort & moveNode
    const edgeId = doc.edges[0].id;
    assert.equal(disconnectEdge(doc, edgeId).edges.length, doc.edges.length - 1);
    assert.equal(disconnectPort(doc, "start", "out").edges.some(e => e.fromNodeId === "start"), false);
    const moved = moveNode(doc, end.node.id, { x: 99999, y: -99999 });
    assert.deepEqual(moved.nodes[end.node.id].pos, { x: STORY_LIMITS.coordMax, y: STORY_LIMITS.coordMin });
});

test("stage slots replace cleanly, enforce unique actors & max 5, and beats reorder intra-node & cross-node", () => {
    let doc = createStoryDocument("jp", "Slots & Beats");
    doc = addCastMember(doc, { key: "a", modelId: "v2_01ichika_casual", name: "Ichika", characterId: 1 });
    doc = addCastMember(doc, { key: "b", modelId: "v2_02saki_casual", name: "Saki", characterId: 2 });
    const s1 = createNode(doc, "scene", { x: 300, y: 100 }, { id: "s1" });
    doc = s1.doc;
    const s2 = createNode(doc, "scene", { x: 640, y: 100 }, { id: "s2" });
    doc = s2.doc;

    doc = setSceneBackground(doc, "s1", { mode: "set", asset: DEFAULT_STORY_BACKGROUND });
    doc = setSceneBgm(doc, "s1", { mode: "play", name: DEFAULT_STORY_BGM, volume: 0.8 });
    doc = setScenePlace(doc, "s1", { mode: "set", text: "Classroom" });
    doc = setSceneTransition(doc, "s1", { kind: "fadeWhite", duration: 0.6 });
    doc = addCastKeyToScene(doc, "s1", "a");
    doc = addCastKeyToScene(doc, "s1", "b");
    doc = addCastKeyToScene(doc, "s1", "a"); // duplicate no-op
    assert.equal(doc.nodes.s1.stageCast.actors.length, 2);
    assert.equal(doc.nodes.s1.stageCast.actors[0].slot, "left");
    assert.equal(doc.nodes.s1.stageCast.actors[1].slot, "right");

    doc = updateActorInSceneCast(doc, "s1", "a", { scale: 1.2, facial: "face_smile_01" });
    assert.equal(doc.nodes.s1.stageCast.actors[0].scale, 1.2);
    doc = addActorToSceneCast(doc, "s1", { castKey: "a", slot: "center" }); // replaces existing "a"
    assert.equal(doc.nodes.s1.stageCast.actors.length, 2);
    assert.equal(doc.nodes.s1.stageCast.actors[0].slot, "center");
    doc = removeActorFromSceneCast(doc, "s1", "b");
    assert.equal(doc.nodes.s1.stageCast.actors.length, 1);

    // Beats: insert, update, duplicate, intra-node move, cross-node move, remove
    const b1 = createSceneBeat("talk", doc, { castHint: "a" });
    const b2 = createSceneBeat("narration", doc);
    const b3 = createSceneBeat("cue", doc, { cueType: "flash" });
    doc = insertBeat(doc, "s1", b1);
    doc = insertBeat(doc, "s1", b2);
    doc = insertBeat(doc, "s1", b3);
    assert.deepEqual(doc.nodes.s1.beats.map(b => b.id), [b1.id, b2.id, b3.id]);

    // Intra-node reorder: move b3 to index 0
    doc = moveBeat(doc, "s1", b3.id, "s1", 0);
    assert.deepEqual(doc.nodes.s1.beats.map(b => b.id), [b3.id, b1.id, b2.id]);

    // Cross-node drag: move b1 from s1 into s2
    doc = moveBeat(doc, "s1", b1.id, "s2", 0);
    assert.deepEqual(doc.nodes.s1.beats.map(b => b.id), [b3.id, b2.id]);
    assert.deepEqual(doc.nodes.s2.beats.map(b => b.id), [b1.id]);

    // Update, duplicate, remove
    doc = updateBeat(doc, "s2", b1.id, b => ({ ...b, body: "Moved line" }));
    assert.equal(doc.nodes.s2.beats[0].body, "Moved line");
    const dupBeat = duplicateBeat(doc, "s2", b1.id);
    doc = dupBeat.doc;
    assert.equal(doc.nodes.s2.beats.length, 2);
    assert.notEqual(dupBeat.beat.id, b1.id);
    doc = removeBeat(doc, "s2", dupBeat.beat.id);
    assert.equal(doc.nodes.s2.beats.length, 1);
    assert.equal(speakerName(doc, doc.nodes.s2.beats[0]), "Ichika");
    assert.equal(castUsage(doc, "a"), 2); // stageCast + talk beat
});

test("typed drag payloads enforce strict drop-zone compatibility and apply mutations cleanly", () => {
    assert.equal(STORY_DRAG_MIME, "application/x-moesekai-story-v2-drag");
    assert.equal(STORY_BEAT_DRAG_MIME, "application/x-moesekai-story-v2-beat");

    assert.deepEqual(acceptsTarget({ kind: "node", nodeType: "scene" }), ["canvas"]);
    assert.deepEqual(acceptsTarget({ kind: "slot-bg", slot: { mode: "clear" } }), ["slot-bg"]);
    assert.deepEqual(acceptsTarget({ kind: "slot-bgm", slot: { mode: "stop" } }), ["slot-bgm"]);
    assert.deepEqual(acceptsTarget({ kind: "slot-place", slot: { mode: "hide" } }), ["slot-place"]);
    assert.deepEqual(acceptsTarget({ kind: "slot-transition", slot: { kind: "none", duration: 0 } }), ["slot-transition"]);
    assert.deepEqual(acceptsTarget({ kind: "slot-cast-mode", mode: "inherit" }), ["slot-cast"]);
    assert.deepEqual(acceptsTarget({ kind: "asset-cast", castKey: "ichika" }), ["slot-cast", "beat-track"]);
    assert.deepEqual(acceptsTarget({ kind: "beat", beatKind: "talk" }), ["beat-track"]);
    assert.deepEqual(acceptsTarget({ kind: "asset-se", name: DEFAULT_STORY_SE }), ["beat-track"]);
    assert.deepEqual(acceptsTarget({ kind: "var-op", varId: "affection" }), ["beat-track"]);
    assert.equal(canDropOnTarget({ kind: "slot-bg", slot: { mode: "clear" } }, "beat-track"), false);

    let doc = createStoryDocument("jp", "DnD");
    doc = addCastMember(doc, { key: "ichika", modelId: "v2_01ichika_casual", name: "Ichika" });

    // Drop a scene onto canvas
    const droppedNode = applyDragPayloadToTarget(doc, { kind: "node", nodeType: "scene" }, { zone: "canvas", pos: { x: 320, y: 160 } });
    doc = droppedNode.doc;
    assert.ok(droppedNode.nodeId);

    // Incompatible drop is a safe no-op
    assert.equal(
        applyDragPayloadToTarget(doc, { kind: "slot-bg", slot: { mode: "clear" } }, { zone: "slot-bgm", nodeId: droppedNode.nodeId }).doc,
        doc,
    );

    // Compatible asset-cast drop onto BOTH slot-cast AND beat-track!
    doc = applyDragPayloadToTarget(doc, { kind: "asset-cast", castKey: "ichika" }, { zone: "slot-cast", nodeId: droppedNode.nodeId }).doc;
    const droppedTalk = applyDragPayloadToTarget(doc, { kind: "asset-cast", castKey: "ichika" }, { zone: "beat-track", nodeId: droppedNode.nodeId });
    doc = droppedTalk.doc;
    assert.equal(doc.nodes[droppedNode.nodeId].stageCast.mode, "set");
    assert.equal(doc.nodes[droppedNode.nodeId].beats.length, 1);
    assert.equal(doc.nodes[droppedNode.nodeId].beats[0].kind, "talk");
    assert.equal(doc.nodes[droppedNode.nodeId].beats[0].speakerKey, "ichika");

    // Compatible SE drop onto beat-track
    doc = applyDragPayloadToTarget(doc, { kind: "asset-se", name: DEFAULT_STORY_SE }, { zone: "beat-track", nodeId: droppedNode.nodeId }).doc;
    assert.equal(doc.nodes[droppedNode.nodeId].beats[1].kind, "cue");
    assert.equal(doc.nodes[droppedNode.nodeId].beats[1].se, DEFAULT_STORY_SE);
});

test("variables, choice options, condition rules, autoLayoutGraph, and safe filenames behave deterministically", () => {
    let doc = makeStarter();
    const addedVar = addVariable(doc, { id: "flag_a", name: "Flag A", type: "boolean", initial: false });
    doc = addedVar.doc;
    doc = updateVariable(doc, "flag_a", { initial: true, name: "Key" });
    assert.equal(doc.variables.find(v => v.id === "flag_a")?.initial, true);
    assert.equal(variableUsage(doc, "affection") >= 3, true); // choice effect + condition rule + ending templates

    // Add & remove choice option prunes its edge cleanly.
    doc = addChoiceOption(doc, "choice_plan", "Extra Option");
    const extraOptId = doc.nodes.choice_plan.options[2].id;
    doc = connectEdge(doc, "choice_plan", extraOptId, "end_cafe");
    doc = updateChoiceOption(doc, "choice_plan", extraOptId, { text: "Updated" });
    assert.equal(doc.nodes.choice_plan.options[2].text, "Updated");
    doc = removeChoiceOption(doc, "choice_plan", extraOptId);
    assert.equal(doc.edges.some(e => e.fromPortId === extraOptId), false);
    assert.equal(doc.nodes.choice_plan.options.length, 2);

    // Add & remove condition rule prunes its edge cleanly.
    doc = addConditionRule(doc, "cond_ending", { varId: "flag_a", op: "==", value: true }, "Has Key");
    const extraRuleId = doc.nodes.cond_ending.rules[1].id;
    doc = connectEdge(doc, "cond_ending", extraRuleId, "end_practice");
    assert.deepEqual(getNodeOutPorts(doc.nodes.cond_ending), ["rule1", extraRuleId, "else"]);
    doc = removeConditionRule(doc, "cond_ending", extraRuleId);
    assert.equal(doc.edges.some(e => e.fromPortId === extraRuleId), false);
    doc = removeVariable(doc, "flag_a");

    // autoLayoutGraph layers start -> scene_open -> choice_plan -> (practice, cafe) -> cond_ending -> (end_practice, end_cafe)
    const laidOut = autoLayoutGraph(doc);
    assert.ok(laidOut.nodes.start.pos.x < laidOut.nodes.scene_open.pos.x);
    assert.equal(laidOut.nodes.scene_open.pos.x - laidOut.nodes.start.pos.x, GRAPH_COL_GAP);
    assert.equal(laidOut.nodes.scene_practice.pos.x, laidOut.nodes.scene_cafe.pos.x);
    assert.equal(laidOut.nodes.scene_cafe.pos.y - laidOut.nodes.scene_practice.pos.y, GRAPH_ROW_GAP);

    // Safe filenames
    const weird = updateStoryMeta(createStoryDocument("jp", ' a/b:c*?"<>| d '), { author: "x" });
    assert.equal(storyFileName(weird), "abc-d.moesekai-story.json");
    assert.equal(storyScriptFileName(weird), "abc-d.msk");
    assert.equal(storyFileName(createStoryDocument("jp", "")), "story.moesekai-story.json");
    assert.match(newStoryId(), /^[a-z0-9]{8}$/);
    assert.equal(JSON.parse(serializeStory(doc)).schema, STORY_SCHEMA_VERSION);
});

// ==================== 4. Deterministic Runtime VM & Stage Evaluator Tests ====================

test("runtime VM executes both branches of starter story, mutates counters, evaluates conditions, and reaches both named endings", () => {
    const starter = makeStarter("jp");
    const program = compileStoryGraph(starter);
    assert.equal(program.ok, true);

    // Run to first blocking beat: telop in scene_open
    const f1 = createInitialRuntime(program);
    assert.equal(f1.stoppedReason, "blocking");
    assert.equal(f1.nodeId, "scene_open");
    assert.equal(f1.beatId, "scene_open_b1");
    assert.equal(f1.stage.background, DEFAULT_STORY_BACKGROUND);
    assert.deepEqual(f1.stage.bgm, { name: DEFAULT_STORY_BGM, volume: 0.75 });
    assert.equal(f1.stage.place, "宫益坂女子学园 教室");
    assert.equal(f1.stage.actors.length, 2);
    assert.equal(f1.stage.telop?.body, "放学后的排练");
    assert.deepEqual(f1.variables, { affection: 0 });

    // Beat 2: Ichika talk + Saki synchronous reaction!
    const f2 = advanceRuntime(program, f1);
    assert.equal(f2.beatId, "scene_open_b2");
    assert.equal(f2.stage.dialogue?.speaker, "星乃一歌");
    assert.equal(f2.stage.speaking, "ichika");
    assert.equal(f2.stage.actors.find(a => a.cast === "saki")?.facial, "face_happy_01");

    // Beat 3: Saki talk
    const f3 = advanceRuntime(program, f2);
    assert.equal(f3.beatId, "scene_open_b3");
    assert.equal(f3.stage.speaking, "saki");

    // Choice node
    const fChoice = advanceRuntime(program, f3);
    assert.equal(fChoice.stoppedReason, "choice");
    assert.equal(fChoice.nodeId, "choice_plan");
    assert.equal(fChoice.pendingChoice?.options.length, 2);
    assert.equal(fChoice.pendingChoice?.options[0].available, true);
    // Calling advance without optionId stays parked at choice.
    assert.equal(advanceRuntime(program, fChoice), fChoice);

    // ---- Branch A: Practice (opt1 adds affection += 1 -> end_practice) ----
    const a1 = advanceRuntime(program, fChoice, "opt1");
    assert.equal(a1.nodeId, "scene_practice");
    assert.equal(a1.beatId, "scene_practice_b2"); // stageAction move ran non-blockingly!
    assert.equal(a1.variables.affection, 1);
    assert.equal(a1.stage.background, DEFAULT_STORY_BACKGROUND); // inherited!
    assert.equal(a1.stage.bgm.name, DEFAULT_STORY_BGM); // inherited without restarting!
    const a1Ichika = a1.stage.actors.find(a => a.cast === "ichika");
    const a1Saki = a1.stage.actors.find(a => a.cast === "saki");
    assert.equal(a1Ichika?.slot, "center");
    assert.ok(a1Ichika && a1Saki && a1Saki.x - a1Ichika.x >= 0.45, "anti-overlap layout keeps center+right separated");

    const a2 = advanceRuntime(program, a1); // narration
    assert.equal(a2.beatId, "scene_practice_b3");
    const aEnd = advanceRuntime(program, a2); // cond_ending (affection >= 1) -> end_practice
    assert.equal(aEnd.stoppedReason, "end");
    assert.equal(aEnd.ending?.nodeId, "end_practice");
    assert.equal(aEnd.ending?.title, "默契合练结局");
    assert.ok(aEnd.ending?.subtitle?.includes("1"), `expected interpolated affection=1, got ${aEnd.ending?.subtitle}`);
    assert.deepEqual(aEnd.visitedNodeIds, ["start", "scene_open", "choice_plan", "scene_practice", "cond_ending", "end_practice"]);
    assert.ok(aEnd.visitedEdgeIds.includes("e_cond_ending_rule1"));

    // ---- Branch B: Tea (opt2 leaves affection at 0 -> else -> end_cafe) ----
    const b1 = advanceRuntime(program, fChoice, "opt2");
    assert.equal(b1.nodeId, "scene_cafe");
    assert.equal(b1.variables.affection, 0);
    assert.equal(b1.stage.place, null); // scene_cafe hides place!
    assert.equal(b1.stage.actors.find(a => a.cast === "ichika")?.slot, "left"); // NOT leaked from practice!
    assert.equal(b1.stage.actors.find(a => a.cast === "saki")?.slot, "center");

    const b2 = advanceRuntime(program, b1);
    const bEnd = advanceRuntime(program, b2);
    assert.equal(bEnd.stoppedReason, "end");
    assert.equal(bEnd.ending?.nodeId, "end_cafe");
    assert.equal(bEnd.ending?.title, "甜蜜放学结局");
    assert.ok(bEnd.ending?.subtitle?.includes("0"));
    assert.ok(bEnd.visitedEdgeIds.includes("e_cond_ending_else"));
});

test("runtime enforces locked conditional choices, off-stage speakers, stageAction enter/pose/exit, varOp, and template interpolation", () => {
    let doc = createStoryDocument("jp", "Conditional");
    doc = addCastMember(doc, { key: "ichika", modelId: "v2_01ichika_casual", name: "Ichika" });
    doc = addVariable(doc, { id: "key", name: "钥匙", type: "boolean", initial: false }).doc;
    doc = addVariable(doc, { id: "score", name: "Score", type: "number", initial: 10 }).doc;

    doc = createNode(doc, "scene", { x: 300, y: 100 }, { id: "s1", title: "Room" }).doc;
    doc = setSceneStageCast(doc, "s1", { mode: "clear" });
    doc = insertBeat(doc, "s1", { id: "b1", kind: "talk", speakerKey: "ichika", body: "Offstage {{Score}}" });
    doc = insertBeat(doc, "s1", { id: "b2", kind: "stageAction", action: "enter", castKey: "ichika", slot: "left", motion: "m1" });
    doc = insertBeat(doc, "s1", { id: "b3", kind: "stageAction", action: "pose", castKey: "ichika", facial: "f1" });
    doc = insertBeat(doc, "s1", { id: "b4", kind: "varOp", ops: [{ varId: "score", op: "sub", value: 3 }] });
    doc = insertBeat(doc, "s1", { id: "b5", kind: "talk", speakerKey: "ichika", body: "Onstage {{score}}" });

    doc = createNode(doc, "choice", { x: 640, y: 100 }, { id: "c1", title: "Door" }).doc;
    doc.nodes.c1.options = [
        { id: "o_locked", text: "Open with key", condition: { varId: "key", op: "==", value: true } },
        { id: "o_grab", text: "Grab key", effects: [{ varId: "key", op: "toggle" }] },
    ];
    doc = createNode(doc, "end", { x: 980, y: 60 }, { id: "e_secret", title: "Secret" }).doc;

    doc = connectEdge(doc, "start", "out", "s1");
    doc = connectEdge(doc, "s1", "out", "c1");
    doc = connectEdge(doc, "c1", "o_locked", "e_secret");
    doc = connectEdge(doc, "c1", "o_grab", "c1"); // loop back to choice after grabbing key!

    const prog = compileStoryGraph(doc);
    assert.equal(prog.ok, true, JSON.stringify(prog.errors));

    const f1 = createInitialRuntime(prog);
    assert.equal(f1.stage.dialogue?.body, "Offstage 10");
    assert.equal(f1.stage.speaking, null); // off-stage speaker does not flap mouth!

    const f2 = advanceRuntime(prog, f1);
    assert.equal(f2.stage.dialogue?.body, "Onstage 7");
    assert.equal(f2.stage.speaking, "ichika");
    assert.deepEqual([f2.stage.actors[0].motion, f2.stage.actors[0].facial], ["m1", "f1"]);

    const fChoice1 = advanceRuntime(prog, f2);
    assert.equal(fChoice1.pendingChoice?.options[0].available, false);
    assert.equal(fChoice1.pendingChoice?.options[1].available, true);
    // Attempting to choose locked option is rejected!
    assert.equal(advanceRuntime(prog, fChoice1, "o_locked"), fChoice1);

    // Grab key (toggles key -> true) and return to c1: now o_locked is unlocked!
    const fChoice2 = advanceRuntime(prog, fChoice1, "o_grab");
    assert.equal(fChoice2.variables.key, true);
    assert.equal(fChoice2.pendingChoice?.options[0].available, true);

    const fEnd = advanceRuntime(prog, fChoice2, "o_locked");
    assert.equal(fEnd.stoppedReason, "end");
    assert.equal(fEnd.ending?.nodeId, "e_secret");

    // Verify pure helpers directly
    assert.equal(interpolateStoryText("Hi {{missing}}", doc, { score: 5 }), "Hi {{missing}}");
    assert.equal(evaluateCondition({ varId: "score", op: "<=", value: 7 }, { score: 7 }), true);
    assert.equal(evaluateCondition({ varId: "key", op: "!=", value: true }, { key: false }), true);
    assert.equal(applyVarOps([{ varId: "score", op: "set", value: 99999999 }], { score: 0 }, doc).score, STORY_LIMITS.varNumberMax);
});

test("createInitialRuntime(program, startNodeId) and evaluateStageAt reconstruct inherited state without sibling bleed", () => {
    const starter = makeStarter("jp");
    const prog = compileStoryGraph(starter);

    // "Play from this Scene" starting at scene_practice reconstructs BG/BGM/Cast AND affection=1 from opt1!
    const fromPractice = createInitialRuntime(prog, "scene_practice");
    assert.equal(fromPractice.nodeId, "scene_practice");
    assert.equal(fromPractice.variables.affection, 1);
    assert.equal(fromPractice.stage.background, DEFAULT_STORY_BACKGROUND);
    assert.equal(fromPractice.stage.bgm.name, DEFAULT_STORY_BGM);
    assert.equal(fromPractice.stage.actors.find(a => a.cast === "ichika")?.slot, "center");

    // Editor stage preview at scene_cafe keeps Ichika at left (no bleed from scene_practice!).
    const atCafeSetup = evaluateStageAt(starter, "scene_cafe");
    assert.equal(atCafeSetup.stage.background, DEFAULT_STORY_BACKGROUND);
    assert.equal(atCafeSetup.stage.place, null); // scene_cafe hides place
    assert.equal(atCafeSetup.stage.actors.find(a => a.cast === "ichika")?.slot, "left");
    assert.equal(atCafeSetup.stage.actors.find(a => a.cast === "saki")?.slot, "right");
    assert.equal(atCafeSetup.stage.dialogue, null); // before beats

    const atCafeTalk = evaluateStageAt(starter, "scene_cafe", "scene_cafe_b2");
    assert.equal(atCafeTalk.stage.actors.find(a => a.cast === "saki")?.slot, "center");
    assert.equal(atCafeTalk.stage.dialogue?.body, "今天有限定草莓圣代！");

    // Play & preview on an isolated unreachable draft scene still works safely!
    const withIsolated = createNode(starter, "scene", { x: 200, y: 600 }, { id: "iso_scene" }).doc;
    const withBg = setSceneBackground(withIsolated, "iso_scene", { mode: "set", asset: "bg_a000402" });
    const withBeat = insertBeat(withBg, "iso_scene", { id: "iso_b1", kind: "telop", text: "Isolated Preview" });
    const isoProg = compileStoryGraph(withBeat);
    const isoRun = createInitialRuntime(isoProg, "iso_scene");
    assert.equal(isoRun.stoppedReason, "blocking");
    assert.equal(isoRun.stage.background, "bg_a000402");
    assert.equal(isoRun.stage.telop?.body, "Isolated Preview");
    assert.equal(evaluateStageAt(withBeat, "iso_scene", "iso_b1").stage.telop?.body, "Isolated Preview");
    assert.deepEqual(evaluateStageAt(withBeat, "missing_id").stage, INITIAL_STAGE_STATE);
});

test("runtime VM cuts off zero-wait loops deterministically and handles disconnected ports", () => {
    let cyc = createStoryDocument("jp", "Loop");
    cyc = createNode(cyc, "scene", { x: 300, y: 100 }, { id: "s1" }).doc;
    cyc = createNode(cyc, "scene", { x: 600, y: 100 }, { id: "s2" }).doc;
    cyc = connectEdge(cyc, "start", "out", "s1");
    cyc = connectEdge(cyc, "s1", "out", "s2");
    cyc = connectEdge(cyc, "s2", "out", "s1");

    const loopFrame = createInitialRuntime(compileStoryGraph(cyc));
    assert.equal(loopFrame.stoppedReason, "loop");

    let deadEnd = createStoryDocument("jp", "Dead End");
    deadEnd = createNode(deadEnd, "scene", { x: 300, y: 100 }, { id: "s1" }).doc;
    deadEnd = insertBeat(deadEnd, "s1", { id: "b1", kind: "telop", text: "One beat" });
    deadEnd = connectEdge(deadEnd, "start", "out", "s1");
    const prog = compileStoryGraph(deadEnd);
    const f1 = createInitialRuntime(prog);
    assert.equal(f1.stoppedReason, "blocking");
    const f2 = advanceRuntime(prog, f1);
    assert.equal(f2.stoppedReason, "disconnected");
});

// ==================== 5. MoeSekai Script (.msk) Bidirectional DSL Tests ====================

test("MoeSekai Script (.msk) starter story round-trip is lossless and compiles to identical IR", () => {
    assert.equal(STORY_SCRIPT_EXT, ".msk");
    assert.equal(STORY_SCRIPT_NAME, "MoeSekai Script");

    const starter = makeStarter("jp");
    const script1 = serializeStoryScript(starter);
    const parsed = parseStoryScript(script1);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));

    const script2 = serializeStoryScript(parsed.doc);
    assert.equal(script2, script1, "serialize -> parse -> serialize must be byte-for-byte identical");

    const ir1 = compileStoryGraph(starter);
    const ir2 = compileStoryGraph(parsed.doc);
    assert.equal(ir2.ok, true, JSON.stringify(ir2.errors));
    assert.deepEqual(ir2.instructions, ir1.instructions, "compiled IR must be identical after .msk round-trip");
    assert.deepEqual(ir2.nodeEntryPc, ir1.nodeEntryPc);
    assert.deepEqual(ir2.beatPc, ir1.beatPc);
});

test("MoeSekai Script (.msk) round-trips all slots, beats, reactions, voices, trims, quotes, conditions, and auto-layouts missing @pos", () => {
    const source = `
# Full-feature MoeSekai Script test
@story "Special \\"Quotes\\" Test" region=cn id="full_demo" author="Tester" summary="Line 1\\nLine 2"

@var score: number = 5 "好感度"
@var unlocked: boolean = false

@cast ichika "星乃一歌" model="v2_01ichika_casual" char=1
@cast saki "天马咲希" model="v2_02saki_casual" char=2

start -> s_intro

scene s_intro "开场" {
  bg set "bg_a000401"
  bgm play "bgm00020" vol=0.65
  place set "教室"
  transition fadeWhite 0.6
  cast set [
    ichika at left scale=1.1 y=-0.05 motion="w-cool-normal01" facial="face_ worry_01"
    saki at right scale=1.05
  ]
  telop "Chapter 1"
  talk ichika as "一歌（小声）" "你好\\n世界" motion="w-cool-nod01" facial="face_smile_01" react(saki motion="w-cute-nod01" facial="face_happy_01") voice(card:001001_ichika01:v_01[0.25..2.5]@jp) se="se_pack00001_b/se00001_b" seVol=0.8
  talk "???" "画外音台词"
  stage enter saki at farRight scale=1.2 y=0.1 motion="m1" facial="f1"
  stage move ichika to center dur=0.5 scale=1.15 y=0
  stage pose saki facial="face_smile_01"
  stage exit saki
  cue se "se_pack00001_b/se00001_b" vol=0.9
  cue flash black 0.3
  cue shake 0.4
  cue wait 0.5
  narration "旁白内容" se="se_pack00001_b/se00001_b" seVol=0.5
  set score += 2, score -= 1, unlocked toggle
} -> ch_gate

choice ch_gate "分歧" {
  custom_a: "秘密路线" if unlocked == true [score = 99] -> cond_check
  "普通路线" -> end_normal
}

condition cond_check "检查" {
  r_high: if score >= 50 "高分" -> end_true ; else -> end_normal
}

scene s_clear "清场草稿" @pos(80, 620) {
  bg clear
  bgm stop
  place hide
  transition none 0
  cast clear
}

end end_true "真结局" subtitle="得分 {{score}}"
end end_normal "普通结局"
`;

    const parsed1 = parseStoryScript(source);
    assert.equal(parsed1.ok, true, JSON.stringify(parsed1.diagnostics));
    const doc1 = parsed1.doc;

    // Explicit @pos preserved on s_clear; omitted @pos auto-laid-out deterministically!
    assert.deepEqual(doc1.nodes.s_clear.pos, { x: 80, y: 620 });
    assert.ok(doc1.nodes.start.pos.x < doc1.nodes.s_intro.pos.x);
    assert.ok(doc1.nodes.s_intro.pos.x < doc1.nodes.ch_gate.pos.x);

    // Escaped strings, voice trim & cross-server region, reactions, custom option/rule IDs all intact.
    assert.equal(doc1.meta.title, 'Special "Quotes" Test');
    assert.equal(doc1.meta.summary, "Line 1\nLine 2");
    const talkBeat = doc1.nodes.s_intro.beats[1];
    assert.equal(talkBeat.speakerKey, "ichika");
    assert.equal(talkBeat.speakerName, "一歌（小声）");
    assert.equal(talkBeat.body, "你好\n世界");
    assert.deepEqual(talkBeat.voice, { kind: "card", scenarioId: "001001_ichika01", voiceId: "v_01", region: "jp", start: 0.25, end: 2.5 });
    assert.deepEqual(talkBeat.reactions, [{ castKey: "saki", motion: "w-cute-nod01", facial: "face_happy_01" }]);
    assert.equal(doc1.nodes.ch_gate.options[0].id, "custom_a");
    assert.equal(doc1.nodes.cond_check.rules[0].id, "r_high");
    assert.equal(doc1.nodes.cond_check.rules[0].label, "高分");

    // Strictly validates & compiles with 0 errors!
    const validated = validateStoryDocument(doc1);
    assert.equal(validated.ok, true, JSON.stringify(validated.ok ? [] : validated.issues));

    // Second round-trip is byte-for-byte identical!
    const serialized1 = serializeStoryScript(doc1);
    const parsed2 = parseStoryScript(serialized1);
    assert.equal(parsed2.ok, true, JSON.stringify(parsed2.diagnostics));
    assert.equal(serializeStoryScript(parsed2.doc), serialized1);
    assert.deepEqual(compileStoryGraph(parsed2.doc).instructions, compileStoryGraph(doc1).instructions);
});

test("parseStoryScript reports precise line:col diagnostics on syntax errors", () => {
    assert.equal(parseStoryScript("   \n# comment only\n").ok, false);

    const bad = parseStoryScript('@story "Test" region=jp\n@unknown foo\nscene s1 "S1" {\n  talk ichika "unterminated\n}');
    assert.equal(bad.ok, false);
    assert.ok(bad.diagnostics.length >= 2);
    assert.equal(bad.diagnostics.some(d => d.line === 2 && d.col >= 1), true);
    assert.equal(bad.diagnostics.some(d => d.line === 4), true);
});

// ==================== 6. v2 Preloader & Cache Inspector Tests ====================

test("collectStoryAssets walks v2 SceneNodes (slots, beats, reactions, SE, cross-server voices) and preloadStoryAssets matches stage-worker.js cache keys", async () => {
    const preloaderMod = await importWebTypeScript("src/lib/storyMaker/preloader.ts", [
        [
            `import { getAssetLine, type AssetLine } from "@/lib/assets";`,
            `const getAssetLine = (s) => String(s).startsWith("backup") ? "backup" : "main";`,
        ],
        [`import { fetchLive2DModels } from "@/lib/live2dViewer/client";`, `const fetchLive2DModels = async () => [];`],
        [
            `import { live2dSources } from "@/lib/live2dViewer/config";`,
            `const live2dSources = (r) => ({ library: "https://assets.pjsk.moe/ripper/" + r + "/", index: "" });`,
        ],
        [
            `import {\n    storyBackgroundUrl, storyBgmUrl, storySeCandidateUrls, storyVoiceCandidateUrls,\n} from "./assets";`,
            `const storyBackgroundUrl = (n, r) => "https://storage.pjsk.moe/sekai-" + r + "-assets/scenario/background/" + n + "/" + n + ".webp";
const storyBgmUrl = (n, r) => "https://storage.pjsk.moe/sekai-" + r + "-assets/sound/scenario/bgm/" + n + "/" + n + ".mp3";
const storySeCandidateUrls = (n, r) => ["https://storage.pjsk.moe/sekai-" + r + "-assets/sound/scenario/se/" + n + ".mp3"];
const storyVoiceCandidateUrls = (v, r) => ["https://storage.pjsk.moe/sekai-" + (v.region || r) + "-assets/sound/" + v.kind + "/" + v.scenarioId + "/" + v.voiceId + ".mp3"];`,
        ],
        [
            `import { decodeStoryAudio, getCachedStoryAudio, getSharedAudioContext } from "./audioCache";`,
            `const decodeStoryAudio = async () => null;\nconst getCachedStoryAudio = () => null;\nconst getSharedAudioContext = () => null;`,
        ],
        [`import { loadStoryUiKit } from "./uiKit";`, `const loadStoryUiKit = async () => null;`],
    ]);

    let doc = createStoryDocument("jp", "v2 Dedup");
    doc = addCastMember(doc, { key: "a", modelId: "v2_01ichika_casual", name: "Ichika A" });
    doc = addCastMember(doc, { key: "b", modelId: "v2_01ichika_casual", name: "Ichika Clone" }); // shared modelId!
    doc = addCastMember(doc, { key: "c", modelId: "v2_02saki_casual", name: "Saki" });
    doc = createNode(doc, "scene", { x: 300, y: 100 }, { id: "s1" }).doc;
    doc = createNode(doc, "scene", { x: 640, y: 100 }, { id: "s2" }).doc;

    doc = setSceneBackground(doc, "s1", { mode: "set", asset: "bg_a000401" });
    doc = setSceneBackground(doc, "s2", { mode: "set", asset: "bg_a000401" }); // dup bg
    doc = setSceneBgm(doc, "s1", { mode: "play", name: "bgm00020", volume: 0.8 });
    doc = setSceneBgm(doc, "s2", { mode: "play", name: "bgm00020", volume: 0.5 }); // dup bgm
    doc = setSceneStageCast(doc, "s1", {
        mode: "set",
        actors: [
            { castKey: "a", slot: "left", motion: "m_slot", facial: "f_slot" },
            { castKey: "c", slot: "right" },
        ],
    });
    doc = insertBeat(doc, "s1", {
        id: "b1",
        kind: "talk",
        speakerKey: "b",
        body: "Hi",
        motion: "m_talk",
        reactions: [{ castKey: "c", motion: "m_react", facial: "f_react" }],
        voice: { kind: "story", scenarioId: "ev1", voiceId: "v1" },
        se: DEFAULT_STORY_SE,
    });
    doc = insertBeat(doc, "s1", {
        id: "b2",
        kind: "talk",
        speakerKey: "a",
        body: "Trimmed same voice",
        voice: { kind: "story", scenarioId: "ev1", voiceId: "v1", start: 0.5, end: 1.0 }, // same audio file!
    });
    doc = insertBeat(doc, "s2", {
        id: "b3",
        kind: "stageAction",
        action: "pose",
        castKey: "a",
        facial: "f_action",
    });
    doc = insertBeat(doc, "s2", {
        id: "b4",
        kind: "narration",
        body: "Boom",
        se: DEFAULT_STORY_SE, // dup SE
    });
    doc = insertBeat(doc, "s2", {
        id: "b5",
        kind: "cue",
        cueType: "se",
        se: "se_pack00001/se00056",
    });
    doc = insertBeat(doc, "s2", {
        id: "b6",
        kind: "talk",
        speakerKey: "c",
        body: "Cross server",
        voice: { kind: "story", scenarioId: "ev1", voiceId: "v1", region: "cn" }, // different region -> distinct URL!
    });

    const manifest = preloaderMod.collectStoryAssets(doc, {
        models: [
            { id: "v2_01ichika_casual", bundle: "live2d/model/v2_01ichika_casual", motions: ["live2d/motion/v2_01ichika_motion_base"] },
            { id: "v2_02saki_casual", bundle: "live2d/model/v2_02saki_casual", motions: ["live2d/motion/v2_02saki_motion_base"] },
        ],
    });

    assert.equal(manifest.live2d.length, 2);
    assert.deepEqual(manifest.live2d[0], {
        modelId: "v2_01ichika_casual",
        bundle: "live2d/model/v2_01ichika_casual",
        motionBundle: "live2d/motion/v2_01ichika_motion_base",
        motions: ["m_slot", "m_talk"],
        facials: ["f_action", "f_slot"],
    });
    assert.deepEqual(manifest.live2d[1].motions, ["m_react"]);
    assert.deepEqual(manifest.live2d[1].facials, ["f_react"]);
    assert.equal(manifest.backgrounds.length, 1);
    assert.equal(manifest.bgm.length, 1);
    assert.equal(manifest.se.length, 2);
    assert.equal(manifest.voices.length, 2);
    assert.deepEqual(manifest.counts, { live2d: 2, background: 1, audio: 5, uikit: 1, total: 9 });

    // Cache API key verification matching stage-worker.js
    const stored = new Map();
    const cachedUrl = "https://assets.pjsk.moe/ripper/jp/library/live2d/model/v2_01ichika_casual/model.moc3?crc=777";
    stored.set(cachedUrl, new Response(new Uint8Array([9, 9])));
    const prevCaches = globalThis.caches;
    const prevFetch = globalThis.fetch;
    const fetchedUrls = [];
    globalThis.caches = {
        async has(name) { return name === "sekai-live2d-v1"; },
        async open(name) {
            assert.equal(name, "sekai-live2d-v1");
            return {
                async match(key) { return stored.get(String(key)); },
                async put(key, resp) { stored.set(String(key), resp); },
                async keys() { return [...stored.keys()].map(url => ({ url })); },
            };
        },
    };
    globalThis.fetch = async (url) => {
        const s = String(url);
        fetchedUrls.push(s);
        if (s.endsWith("/live2d/model/v2_01ichika_casual/_ripper.json")) {
            return { ok: true, status: 200, json: async () => ({ crc: 777, files: [{ path: "model.moc3", kind: "model" }, { path: "tex.png", kind: "texture" }] }) };
        }
        if (s.endsWith("/live2d/motion/v2_01ichika_motion_base/_ripper.json")) {
            return { ok: true, status: 200, json: async () => ({ crc: 888, files: [{ path: "motion/m1.sse-motion.json", kind: "motion" }, { path: "facial/face_ worry_01.sse-motion.json", kind: "motion" }] }) };
        }
        return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
    };

    try {
        let smallDoc = createStoryDocument("jp", "Cache Test");
        smallDoc = addCastMember(smallDoc, { key: "a", modelId: "v2_01ichika_casual", name: "Ichika" });
        smallDoc = createNode(smallDoc, "scene", { x: 300, y: 100 }, { id: "s1" }).doc;
        smallDoc = setSceneBackground(smallDoc, "s1", { mode: "set", asset: "bg_a000401" });
        smallDoc = setSceneStageCast(smallDoc, "s1", { mode: "set", actors: [{ castKey: "a", slot: "center", motion: "m1", facial: "face_ worry_01" }] });

        const final = await preloaderMod.preloadStoryAssets(smallDoc, {
            includeUiKit: false,
            models: [{ id: "v2_01ichika_casual", bundle: "live2d/model/v2_01ichika_casual", motions: ["live2d/motion/v2_01ichika_motion_base"] }],
        });
        assert.equal(final.done, true);
        assert.equal(final.failed, 0);
        assert.equal(final.byCategory.live2d.total, 4);
        assert.equal(final.byCategory.live2d.cached, 1);
        assert.equal(fetchedUrls.some(u => u.endsWith("model.moc3")), false);
        assert.ok(stored.has("https://assets.pjsk.moe/ripper/jp/library/live2d/motion/v2_01ichika_motion_base/facial/face_%20worry_01.sse-motion.json?crc=888"));

        const status = await preloaderMod.inspectStoryCacheStatus(smallDoc, {
            includeUiKit: false,
            models: [{ id: "v2_01ichika_casual", bundle: "live2d/model/v2_01ichika_casual", motions: ["live2d/motion/v2_01ichika_motion_base"] }],
        });
        assert.equal(status.live2dCachedModels, 1);
        assert.equal(status.hasLocalCache, true);
    } finally {
        globalThis.caches = prevCaches;
        globalThis.fetch = prevFetch;
    }
});

// ==================== 7. Retained Engine & Catalog Tests ====================

test("SLOT_X and layoutStageActors use balanced, non-overlapping Project SEKAI stand coordinates", () => {
    assert.deepEqual(SLOT_X, {
        farLeft: -0.75,
        left: -0.365,
        center: 0,
        right: 0.365,
        farRight: 0.75,
    });

    // 2 actors (left + right): official SIDE_X_DEFAULT ±0.365
    const duo = layoutStageActors([
        { cast: "a", slot: "left", x: 0, scale: 1 },
        { cast: "b", slot: "right", x: 0, scale: 1 },
    ]);
    assert.deepEqual(duo.map(a => a.x), [-0.365, 0.365]);

    // 3 actors (left + center + right): official SIDE_X_THREE ±0.573 & 0
    const trio = layoutStageActors([
        { cast: "a", slot: "left", x: 0, scale: 1 },
        { cast: "b", slot: "center", x: 0, scale: 1 },
        { cast: "c", slot: "right", x: 0, scale: 1 },
    ]);
    assert.deepEqual(trio.map(a => a.x), [-0.573, 0, 0.573]);

    // 4 actors (farLeft + left + right + farRight): uniform 0.50 spacing, zero overlap
    const quartet = layoutStageActors([
        { cast: "a", slot: "farLeft", x: 0, scale: 1 },
        { cast: "b", slot: "left", x: 0, scale: 1 },
        { cast: "c", slot: "right", x: 0, scale: 1 },
        { cast: "d", slot: "farRight", x: 0, scale: 1 },
    ]);
    assert.deepEqual(quartet.map(a => a.x), [-0.75, -0.25, 0.25, 0.75]);
    assert.deepEqual(detectStageActorOverlaps(quartet), { duplicateSlots: [], overlaps: [] });

    // 5 actors: uniform 0.40 spacing, zero overlap at scale=1
    const quintet = layoutStageActors([
        { cast: "a", slot: "farLeft", x: 0, scale: 1 },
        { cast: "b", slot: "left", x: 0, scale: 1 },
        { cast: "c", slot: "center", x: 0, scale: 1 },
        { cast: "d", slot: "right", x: 0, scale: 1 },
        { cast: "e", slot: "farRight", x: 0, scale: 1 },
    ]);
    assert.deepEqual(quintet.map(a => a.x), [-0.8, -0.4, 0, 0.4, 0.8]);
    assert.deepEqual(detectStageActorOverlaps(quintet), { duplicateSlots: [], overlaps: [] });

    // Asymmetric 4-actor lineup (left + center + right + farRight): stays well separated
    const asym4 = layoutStageActors([
        { cast: "a", slot: "left", x: 0, scale: 1 },
        { cast: "b", slot: "center", x: 0, scale: 1 },
        { cast: "c", slot: "right", x: 0, scale: 1 },
        { cast: "d", slot: "farRight", x: 0, scale: 1 },
    ]);
    for (let i = 0; i < asym4.length - 1; i += 1) {
        assert.ok(asym4[i + 1].x - asym4[i].x >= 0.47, `expected gap >= 0.47, got ${asym4[i + 1].x - asym4[i].x}`);
    }
    assert.deepEqual(detectStageActorOverlaps(asym4), { duplicateSlots: [], overlaps: [] });

    // Duplicate slots: PAV still separates visually while audit reports duplicateSlots
    const dupSlot = layoutStageActors([
        { cast: "a", slot: "center", x: 0, scale: 1 },
        { cast: "b", slot: "center", x: 0, scale: 1 },
    ]);
    assert.ok(dupSlot[1].x - dupSlot[0].x >= 0.47);
    const dupAudit = detectStageActorOverlaps(dupSlot);
    assert.equal(dupAudit.duplicateSlots.length, 1);
    assert.equal(dupAudit.duplicateSlots[0].slot, "center");

    // Compiler emits stageSlotDuplicate & stageActorOverlap warnings on colliding/overscaled scenes
    const warnScript = `@story "Overlap Warn" region=jp id="overlap_warn"
@cast ichika "Ichika" model="v2_01ichika_casual"
@cast saki "Saki" model="v2_02saki_casual"
@cast honami "Honami" model="v2_03honami_casual"
@cast shiho "Shiho" model="v2_04shiho_casual"
start -> s1
scene s1 "Crowded" {
  cast set [
    ichika at farLeft scale=1.4
    saki at left scale=1.4
    honami at right scale=1.4
    shiho at farRight scale=1.4
  ]
  talk ichika "Big!"
  stage move saki to farLeft dur=0.3
  talk saki "Same slot!"
} -> e1
end e1 "Fin"
`;
    const parsedWarn = parseStoryScript(warnScript);
    assert.equal(parsedWarn.ok, true);
    const compiledWarn = compileStoryGraph(parsedWarn.doc);
    assert.equal(compiledWarn.ok, true);
    assert.ok(compiledWarn.warnings.some(w => w.code === "stageActorOverlap"), "expected stageActorOverlap warning");
    assert.ok(compiledWarn.warnings.some(w => w.code === "stageSlotDuplicate"), "expected stageSlotDuplicate warning");

    // Explicit `overlap` ("贴贴") allows snug cheek-to-cheek huddle with 0 warnings and lossless .msk round-trip
    const huddleScript = `@story "Huddle Test" region=jp id="huddle_test"
@cast ichika "Ichika" model="v2_01ichika_casual"
@cast saki "Saki" model="v2_02saki_casual"
@cast shiho "Shiho" model="v2_04shiho_casual"
start -> s1
scene s1 "Huddle" {
  cast set [
    ichika at center scale=1 overlap facial="face_smile_01"
    saki at center scale=1 overlap facial="face_sparkling_01"
  ]
  talk ichika "Close together!"
  stage enter shiho at right scale=1
  stage move ichika to left dur=0.3 overlap
  stage move saki to left dur=0.3 overlap
  talk saki "Huddling on the left while Shiho watches!"
} -> e1
end e1 "Fin"
`;
    const parsedHuddle = parseStoryScript(huddleScript);
    assert.equal(parsedHuddle.ok, true);
    const compiledHuddle = compileStoryGraph(parsedHuddle.doc);
    assert.equal(compiledHuddle.ok, true);
    assert.equal(compiledHuddle.warnings.length, 0, `expected 0 warnings with explicit overlap, got ${JSON.stringify(compiledHuddle.warnings)}`);

    // Check actual cheek-to-cheek coordinates: [-0.11, +0.11] on center, then left huddle + separated right bystander
    const f1 = createInitialRuntime(compiledHuddle);
    assert.deepEqual(f1.stage.actors.map(a => a.x), [-0.11, 0.11]);
    const f2 = advanceRuntime(compiledHuddle, f1);
    const leftPairGap = Math.round((f2.stage.actors[1].x - f2.stage.actors[0].x) * 1000) / 1000;
    const bystanderGap = Math.round((f2.stage.actors[2].x - f2.stage.actors[1].x) * 1000) / 1000;
    assert.equal(leftPairGap, 0.22);
    assert.ok(bystanderGap >= 0.48, `expected bystander gap >= 0.48, got ${bystanderGap}`);

    // Lossless .msk round-trip of `overlap` keyword
    const serializedHuddle = serializeStoryScript(parsedHuddle.doc);
    assert.ok(serializedHuddle.includes("ichika at center scale=1 overlap"));
    assert.ok(serializedHuddle.includes("stage move saki to left dur=0.3 overlap"));
    const reparsedHuddle = parseStoryScript(serializedHuddle);
    assert.equal(reparsedHuddle.ok, true);
    assert.equal(serializeStoryScript(reparsedHuddle.doc), serializedHuddle);
});

test("extractWaveformPeaks normalizes stereo buffers and decodeStoryAudio caches LRU hits with fallback", async () => {
    const stereo = {
        numberOfChannels: 2,
        length: 8,
        getChannelData(ch) {
            return ch === 0
                ? new Float32Array([0, 0.25, -0.5, 0.25, 0, 0, 0.1, 0.1])
                : new Float32Array([0.1, 0, 0.1, 0, -0.25, 0.25, 0, 0]);
        },
    };
    const peaks = extractWaveformPeaks(stereo, 4);
    assert.equal(peaks.length, 4);
    assert.ok(Math.abs(peaks[0] - 0.5) < 1e-6);
    assert.ok(Math.abs(peaks[1] - 1.0) < 1e-6);

    const prevWindow = globalThis.window;
    const prevFetch = globalThis.fetch;
    clearStoryAudioCache();
    let fetchCount = 0;
    const fakeBuffer = { numberOfChannels: 1, length: 4, duration: 1.5, sampleRate: 44100, getChannelData: () => new Float32Array(4) };
    globalThis.window = {
        AudioContext: class FakeAudioContext {
            constructor() { this.state = "running"; }
            async resume() { this.state = "running"; }
            async decodeAudioData() { return fakeBuffer; }
        },
    };
    globalThis.fetch = async (url) => {
        fetchCount += 1;
        if (String(url).includes("missing")) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
        return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
    };

    try {
        const urls = ["https://storage.pjsk.moe/missing.mp3", "https://storage.pjsk.moe/hit.mp3"];
        const [a, b] = await Promise.all([decodeStoryAudio(urls), decodeStoryAudio(urls)]);
        assert.equal(a?.url, "https://storage.pjsk.moe/hit.mp3");
        assert.equal(b?.buffer, fakeBuffer);
        assert.equal(fetchCount, 2);
        assert.equal(getCachedStoryAudio("https://storage.pjsk.moe/missing.mp3"), fakeBuffer);
    } finally {
        clearStoryAudioCache();
        globalThis.window = prevWindow;
        globalThis.fetch = prevFetch;
    }
});

test("storyMaker assets URL resolution, cross-server voice URLs, and cached catalogs work cleanly", async () => {
    globalThis.__testMasterMock = {
        fail: false,
        tracks: [
            { id: 101, seq: 10, title: "一緒に歌おう！", musicSoundTrackCategoryId: 12, assetbundleName: "mysekai/sound/bgm/music0001", assetbundleFileName: "music0001" },
            { id: 104, seq: 20, title: "斜陽に照らされて", musicSoundTrackCategoryId: 3, assetbundleName: "sound/scenario/bgm/bgm_area00001", assetbundleFileName: "bgm_area00001" },
        ],
        categories: [{ id: 3, name: "レオニ" }, { id: 12, name: "マイセカイ" }],
    };

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
            `const fetchMasterDataForServer = async (_s, p) => p === "musicSoundTracks.json" ? globalThis.__testMasterMock.tracks : globalThis.__testMasterMock.categories;`,
        ],
        [
            `import { STORY_ASSET_PATTERN, STORY_AUDIO_PATH_PATTERN } from "./limits";`,
            `const STORY_ASSET_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;\nconst STORY_AUDIO_PATH_PATTERN = /^(?=.{1,128}$)[A-Za-z0-9_-]+(?:\\/[A-Za-z0-9_-]+){0,4}$/;`,
        ],
    ]);

    assert.equal(
        assetsMod.storyBgmUrl("bgm00020", "jp", "main"),
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/bgm00020/bgm00020.mp3",
    );
    assert.equal(
        assetsMod.storyVoiceUrl({ kind: "story", scenarioId: "event_226_01", voiceId: "v1", region: "jp" }, "cn", "main"),
        "https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/voice/event_226_01/v1.mp3",
    );
    assert.deepEqual(
        assetsMod.storyVoiceCandidateUrls({ kind: "part", scenarioId: "01ichika_light_sound", voiceId: "partvoice_01_001", region: "en" }, "jp", "main"),
        [
            "https://storage.pjsk.moe/sekai-en-assets/sound/scenario/part_voice/01ichika_light_sound/partvoice_01_001.mp3",
            "https://storage.pjsk.moe/sekai-en-assets/sound/scenario/voice/part_voice_01ichika_light_sound/partvoice_01_001.mp3",
        ],
    );
    delete globalThis.__testMasterMock;
});

test("voiceSearch resolves scenario JSON paths including EN card member_scenario and partvoice refs", async () => {
    const voiceSearchMod = await importWebTypeScript("src/lib/storyMaker/voiceSearch.ts", [
        [
            `import { getAssetBaseUrl, getAssetLine, type AssetLine } from "@/lib/assets";`,
            `const getAssetLine = (s) => String(s).startsWith("backup") ? "backup" : "main";
const getAssetBaseUrl = (s) => "https://storage.pjsk.moe/sekai-" + s.slice(s.indexOf("-") + 1) + "-assets";`,
        ],
        [
            `import { fetchMasterDataForServer } from "@/lib/fetch";`,
            `const fetchMasterDataForServer = async (_server, table) => globalThis.__testVoiceMaster[table] ?? [];`,
        ],
        [
            `import { parseDialogueLines } from "@/lib/story-search/dialogue";`,
            `const parseDialogueLines = (text) => text.split("\\n").slice(1).filter(Boolean).map(raw => {
    const idx = raw.indexOf(": ");
    return idx > 0 ? { speaker: raw.slice(0, idx), speech: raw.slice(idx + 2), raw } : { speaker: null, speech: raw, raw };
});`,
        ],
        [
            `import { STORY_ASSET_PATTERN } from "./limits";`,
            `const STORY_ASSET_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;`,
        ],
    ]);

    globalThis.__testVoiceMaster = {
        "cards.json": [{ id: 42, assetbundleName: "res001_no001" }],
        "character2ds.json": [
            { id: 1, characterType: "game_character", characterId: 1, assetName: "01ichika", unit: "light_sound" },
        ],
    };
    const prevFetch = globalThis.fetch;
    const requestedUrls = [];
    globalThis.fetch = async (url) => {
        requestedUrls.push(String(url));
        return {
            ok: true,
            status: 200,
            json: async () => ({
                ScenarioId: "001001_ichika01",
                Snippets: [{ Index: 0, Action: 1, ReferenceIndex: 0 }],
                TalkData: [{
                    TalkCharacters: [{ Character2dId: 1 }],
                    WindowDisplayName: "Ichika",
                    Body: "Hello",
                    Voices: [{ Character2dId: 1, VoiceId: "partvoice_01_001", Volume: 1 }],
                }],
            }),
        };
    };

    try {
        const lines = await voiceSearchMod.resolveStorySearchChunkVoices(
            {
                id: 1,
                server: "en",
                type: "card",
                story_id: "card_42",
                story: "Card",
                ep: "former",
                scenario_id: "001001_ichika01",
                chars: ["Ichika"],
                line_start: 0,
                line_end: 0,
                text: "[Card]\nIchika: Hello",
            },
            "main",
        );
        assert.equal(requestedUrls[0], "https://storage.pjsk.moe/sekai-en-assets/character/member_scenario/res001_no001/001001_ichika01.json");
        assert.deepEqual(lines[0].voiceRef, { kind: "part", scenarioId: "01ichika_light_sound", voiceId: "partvoice_01_001", region: "en" });
    } finally {
        globalThis.fetch = prevFetch;
        delete globalThis.__testVoiceMaster;
    }
});

test("useStoryAudio unlocks autoplay-blocked BGM on first user gesture without listener leaks", async () => {
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

    let playPolicy = "block";
    const instances = [];

    class FakeAudio {
        constructor(src) {
            this.src = src;
            this.loop = false;
            this.volume = 1;
            this.paused = true;
            this.error = null;
            this.playCalls = 0;
            this.listeners = new Map();
            instances.push(this);
        }
        addEventListener(type, fn) {
            if (!this.listeners.has(type)) this.listeners.set(type, new Set());
            this.listeners.get(type).add(fn);
        }
        removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
        removeAttribute(name) { if (name === "src") this.src = ""; }
        pause() { this.paused = true; }
        play() {
            this.playCalls += 1;
            if (playPolicy === "block") {
                const err = new Error("Autoplay blocked");
                err.name = "NotAllowedError";
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
        const root = createRoot(dom.window.document.getElementById("root"));
        await act(async () => { root.render(React.createElement(Harness, { volume: 0.8, muted: false })); });

        await act(async () => {
            controls.syncBgm("https://storage.pjsk.moe/sekai-jp-assets/sound/scenario/bgm/bgm00020/bgm00020.mp3", 0.75);
            await Promise.resolve();
        });
        assert.equal(controls.audioBlocked, true);
        assert.equal(added, 3);

        playPolicy = "allow";
        await act(async () => {
            dom.window.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
            await Promise.resolve();
        });
        assert.equal(controls.audioBlocked, false);
        assert.equal(removed, added);

        await act(async () => { root.unmount(); });
    } finally {
        globalThis.window = prevWindow;
        globalThis.document = prevDocument;
        globalThis.Audio = prevAudio;
        globalThis.IS_REACT_ACT_ENVIRONMENT = prevActEnv;
    }
});

// ==================== 8. Additional v2 Edge-Case & Subsystem Tests ====================

test("removeCastMember preserves references so compiler flags castUnknown cleanly", () => {
    const starter = makeStarter("jp");
    const removed = removeCastMember(starter, "saki");
    assert.equal(removed.cast.some(c => c.key === "saki"), false);
    const prog = compileStoryGraph(removed);
    assert.equal(prog.ok, false);
    assert.ok(prog.errors.some(d => d.code === "castUnknown" && d.params?.key === "saki"));
});

test("initVariables initializes both number and boolean defaults and evaluateCondition handles all 6 numeric operators", () => {
    let doc = createStoryDocument("jp", "Vars");
    doc = addVariable(doc, { id: "hp", name: "HP", type: "number", initial: 50 }).doc;
    doc = addVariable(doc, { id: "win", name: "Win", type: "boolean", initial: true }).doc;
    const vars = initVariables(doc);
    assert.deepEqual(vars, { hp: 50, win: true });

    assert.equal(evaluateCondition({ varId: "hp", op: "==", value: 50 }, vars), true);
    assert.equal(evaluateCondition({ varId: "hp", op: "!=", value: 49 }, vars), true);
    assert.equal(evaluateCondition({ varId: "hp", op: ">", value: 49 }, vars), true);
    assert.equal(evaluateCondition({ varId: "hp", op: ">=", value: 50 }, vars), true);
    assert.equal(evaluateCondition({ varId: "hp", op: "<", value: 51 }, vars), true);
    assert.equal(evaluateCondition({ varId: "hp", op: "<=", value: 50 }, vars), true);
    assert.equal(evaluateCondition({ varId: "hp", op: ">", value: 50 }, vars), false);
    assert.equal(evaluateCondition({ varId: "win", op: "==", value: true }, vars), true);
    assert.equal(evaluateCondition({ varId: "win", op: ">", value: true }, vars), false);
    assert.equal(evaluateCondition({ varId: "missing", op: "==", value: 0 }, vars), false);
});

test("runtime stageAction exit removes actor and cue instructions appear in executedInstructions", () => {
    let doc = createStoryDocument("jp", "Stage Exit & Cues");
    doc = addCastMember(doc, { key: "a", modelId: "v2_01ichika_casual", name: "Ichika" });
    doc = createNode(doc, "scene", { x: 300, y: 100 }, { id: "s1", title: "Act" }).doc;
    doc = setSceneStageCast(doc, "s1", { mode: "set", actors: [{ castKey: "a", slot: "center" }] });
    doc = insertBeat(doc, "s1", { id: "b1", kind: "cue", cueType: "flash", color: "white", duration: 0.3 });
    doc = insertBeat(doc, "s1", { id: "b2", kind: "cue", cueType: "shake", duration: 0.4 });
    doc = insertBeat(doc, "s1", { id: "b3", kind: "cue", cueType: "wait", duration: 0.5 });
    doc = insertBeat(doc, "s1", { id: "b4", kind: "stageAction", action: "exit", castKey: "a" });
    doc = insertBeat(doc, "s1", { id: "b5", kind: "narration", body: "Empty stage." });
    doc = connectEdge(doc, "start", "out", "s1");

    const prog = compileStoryGraph(doc);
    assert.equal(prog.ok, true);
    const frame = createInitialRuntime(prog);
    assert.equal(frame.stoppedReason, "blocking");
    assert.equal(frame.beatId, "b5");
    assert.equal(frame.stage.actors.length, 0);
    const cueOps = frame.executedInstructions.filter(i => i.op === "cue").map(i => i.beat.cueType);
    assert.deepEqual(cueOps, ["flash", "shake", "wait"]);
});

test("autoLayoutGraph handles cyclic graphs cleanly and onlyNodeIds preserves pinned coordinates", () => {
    let doc = createStoryDocument("jp", "Cyclic Layout");
    doc = createNode(doc, "scene", { x: 0, y: 0 }, { id: "s1" }).doc;
    doc = createNode(doc, "scene", { x: 0, y: 0 }, { id: "s2" }).doc;
    doc = createNode(doc, "scene", { x: 500, y: 700 }, { id: "pinned_iso" }).doc;
    doc = connectEdge(doc, "start", "out", "s1");
    doc = connectEdge(doc, "s1", "out", "s2");
    doc = connectEdge(doc, "s2", "out", "s1"); // back-edge!

    const partial = autoLayoutGraph(doc, { onlyNodeIds: new Set(["s1", "s2"]) });
    assert.deepEqual(partial.nodes.pinned_iso.pos, { x: 500, y: 700 });
    assert.ok(partial.nodes.s2.pos.x > partial.nodes.s1.pos.x);

    const full = autoLayoutGraph(doc);
    assert.ok(full.nodes.pinned_iso.pos.y > full.nodes.s1.pos.y);
});

test("MoeSekai Script handles negative numbers, partial voice trims ([start..] and [..end]), custom start id, cast set [], and inline -> target", () => {
    const src = `
@story "Edge Syntax" region=tw id="edge_test"
@var delta: number = -5
@cast a "A" model="v2_01ichika_casual"
start id=entry_01 @pos(-100, -50) -> s1
scene s1 "One" @pos(200, -50) {
  bg inherit
  bgm inherit
  place inherit
  transition none 0
  cast set []
  talk a "Trim start only" voice(story:ev1:v1[1.25..])
  talk a "Trim end only" voice(part:01ichika:pv1[..2.5]@en)
  set delta = -10
  -> cond1
}
condition cond1 "Neg" @pos(540, -50) {
  if delta < -2 -> e1
  else -> e1
}
end e1 "Done" @pos(880, -50)
`;
    const parsed = parseStoryScript(src);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
    const doc = parsed.doc;
    assert.equal(doc.startNodeId, "entry_01");
    assert.deepEqual(doc.nodes.entry_01.pos, { x: -100, y: -50 });
    assert.equal(doc.variables[0].initial, -5);
    assert.deepEqual(doc.nodes.s1.stageCast, { mode: "set", actors: [] });
    assert.deepEqual(doc.nodes.s1.beats[0].voice, { kind: "story", scenarioId: "ev1", voiceId: "v1", start: 1.25 });
    assert.deepEqual(doc.nodes.s1.beats[1].voice, { kind: "part", scenarioId: "01ichika", voiceId: "pv1", region: "en", end: 2.5 });
    assert.equal(doc.nodes.cond1.rules[0].expr.value, -2);
    assert.equal(validateStoryDocument(doc).ok, true);

    const rt = parseStoryScript(serializeStoryScript(doc));
    assert.equal(rt.ok, true);
    assert.equal(serializeStoryScript(rt.doc), serializeStoryScript(doc));
});

test("drafts.ts uses moesekai-story-maker-v2 IndexedDB, persists/renames/duplicates v2 drafts, and ignores v1 records", async () => {
    const records = new Map();
    let openedDbName = null;

    const fakeStore = {
        getAll() {
            const req = {};
            queueMicrotask(() => req.onsuccess?.());
            req.result = [...records.values()].map(v => structuredClone(v));
            return req;
        },
        get(id) {
            const req = {};
            queueMicrotask(() => req.onsuccess?.());
            req.result = records.has(id) ? structuredClone(records.get(id)) : undefined;
            return req;
        },
        put(val) {
            records.set(val.id, structuredClone(val));
            const req = {};
            queueMicrotask(() => req.onsuccess?.());
            req.result = val.id;
            return req;
        },
        delete(id) {
            records.delete(id);
            const req = {};
            queueMicrotask(() => req.onsuccess?.());
            return req;
        },
    };

    const prevIdb = globalThis.indexedDB;
    globalThis.indexedDB = {
        open(name) {
            openedDbName = name;
            const db = {
                objectStoreNames: { contains: () => true },
                transaction: () => ({ objectStore: () => fakeStore }),
                close() {},
            };
            const req = { result: db };
            queueMicrotask(() => req.onsuccess?.());
            return req;
        },
    };

    const draftsMod = await importWebTypeScript("src/lib/storyMaker/drafts.ts", [
        [`import type { StoryDocument, StoryDraft } from "@/types/storyMaker";`, ``],
        [`import { createStoryDocument, newStoryId, updateStoryMeta } from "./document";`, `import { createStoryDocument, newStoryId, updateStoryMeta } from "${new URL("../src/lib/storyMaker/document.ts", import.meta.url).href}";`],
        [`import { STORY_LIMITS } from "./limits";`, `import { STORY_LIMITS } from "${new URL("../src/lib/storyMaker/limits.ts", import.meta.url).href}";`],
        [`import { parseStoryDocumentDraft, validateStoryDocument } from "./validate";`, `import { parseStoryDocumentDraft, validateStoryDocument } from "${new URL("../src/lib/storyMaker/validate.ts", import.meta.url).href}";`],
    ]);

    try {
        // Seed a legacy v1 record that must be filtered out automatically.
        records.set("legacy_v1", {
            id: "legacy_v1",
            createdAt: 1,
            updatedAt: 1,
            doc: { format: "moesekai-story/1", region: "jp", title: "Old", cast: [], steps: [] },
        });

        const blank = draftsMod.emptyDraftDocument("jp", "My Draft");
        const created = await draftsMod.createDraft(blank);
        assert.equal(openedDbName, "moesekai-story-maker-v2");
        assert.equal(created.doc.meta.title, "My Draft");

        const list = await draftsMod.listDrafts();
        assert.equal(list.length, 1);
        assert.equal(list[0].id, created.id);

        const renamed = await draftsMod.renameDraft(created.id, "Renamed v2");
        assert.equal(renamed?.doc.meta.title, "Renamed v2");

        const duplicated = await draftsMod.duplicateDraft(created.id, " (Copy)");
        assert.ok(duplicated && duplicated.id !== created.id);
        assert.notEqual(duplicated.doc.id, created.doc.id);
        assert.equal(duplicated.doc.meta.title, "Renamed v2 (Copy)");

        await draftsMod.deleteDraft(created.id);
        assert.equal((await draftsMod.listDrafts()).length, 1);
    } finally {
        globalThis.indexedDB = prevIdb;
    }
});

test("compiler enforces global beat ID uniqueness, limits, and exact nodeEntryPc / beatPc maps", () => {
    const doc = makeStarter("jp");
    // Duplicate beat ID across two different scenes -> idDuplicate error!
    doc.nodes.scene_cafe.beats[0].id = doc.nodes.scene_open.beats[0].id;
    const dupRes = compileStoryGraph(doc);
    assert.equal(dupRes.ok, false);
    assert.ok(dupRes.errors.some(d => d.code === "idDuplicate"));

    // Clean starter maps every beat ID to its exact instruction in instructions[].
    const clean = compileStoryGraph(makeStarter("jp"));
    for (const [beatId, pc] of Object.entries(clean.beatPc)) {
        assert.equal(clean.instructions[pc].beatId, beatId);
    }
    for (const [nodeId, pc] of Object.entries(clean.nodeEntryPc)) {
        assert.equal(clean.instructions[pc].nodeId, nodeId);
    }
});

test("validateStoryDocument caps issues at 50 and checks numeric ranges on scale, y, volume, and duration", () => {
    const badRange = makeStarter("jp");
    badRange.nodes.scene_open.stageCast.actors[0].scale = 3.0;
    badRange.nodes.scene_open.stageCast.actors[1].y = -1.5;
    badRange.nodes.scene_open.bgm.volume = 1.5;
    badRange.nodes.scene_open.transition.duration = 25;
    const res = validateStoryDocument(badRange);
    assert.equal(res.ok, false);
    assert.equal(res.issues.filter(i => i.code === "numberRange").length, 4);

    // Bounded issue list when bombarded with invalid beats.
    const flood = makeStarter("jp");
    flood.nodes.scene_open.beats = Array.from({ length: 120 }, (_, i) => ({ id: `x${i}`, kind: "nope" }));
    assert.equal(validateStoryDocument(flood).issues.length, 50);
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

    assert.equal(clientMod.isStoryCgBackground("bg_a000001"), true);
    assert.equal(clientMod.isStoryCgBackground("bg_s000569"), true);
    assert.equal(clientMod.isStoryCgBackground("bg_a000401"), false);

    const prevFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        return {
            ok: true, status: 200,
            json: async () => ({
                format: "directory-listing",
                version: 1,
                directories: ["background", "bg_a000001", "bg_a000401"],
            }),
        };
    };
    try {
        const first = await clientMod.fetchStoryBackgrounds("jp", "main");
        const second = await clientMod.fetchStoryBackgrounds("jp", "main");
        assert.deepEqual(first, ["bg_a000001", "bg_a000401"]);
        assert.deepEqual(second, first);
        assert.equal(calls, 1);
    } finally {
        globalThis.fetch = prevFetch;
    }
});

test("fetchLive2DModels caches per region and returns [] on 404", async () => {
    const clientMod = await importWebTypeScript("src/lib/live2dViewer/client.ts", [
        [`import { getAssetBaseUrl, type AssetLine } from "@/lib/assets";`, `const getAssetBaseUrl = () => "https://storage.pjsk.moe/sekai-jp-assets";`],
        [`import { live2dSources, type Live2DRegion } from "./config";`, `const live2dSources = (r) => ({ library: "", index: "https://assets.pjsk.moe/" + r + "/models.json" });`],
        [`import { parseLive2DModelIndex, type Live2DModel } from "./models";`, `const parseLive2DModelIndex = (v) => v.models;`],
    ]);

    const prevFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url) => {
        calls += 1;
        if (String(url).includes("/en/")) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ models: [{ id: "v2_01ichika_casual" }] }) };
    };
    try {
        assert.deepEqual(await clientMod.fetchLive2DModels("jp"), [{ id: "v2_01ichika_casual" }]);
        assert.deepEqual(await clientMod.fetchLive2DModels("jp"), [{ id: "v2_01ichika_casual" }]);
        assert.equal(calls, 1);
        assert.deepEqual(await clientMod.fetchLive2DModels("en"), []);
    } finally {
        globalThis.fetch = prevFetch;
    }
});

test("MoeSekai Script round-trips empty varOp beats (both 'set' and 'set []')", () => {
    let doc = createStoryDocument("jp", "Empty VarOp");
    doc = createNode(doc, "scene", { x: 300, y: 120 }, { id: "s1", title: "Scene" }).doc;
    doc = insertBeat(doc, "s1", createSceneBeat("varOp", doc)); // ops: [] when no variables exist!
    doc = insertBeat(doc, "s1", { id: "s1_b2", kind: "telop", text: "After empty set" });
    doc = createNode(doc, "end", { x: 640, y: 120 }, { id: "e1", title: "Done" }).doc;
    doc = connectEdge(doc, "start", "out", "s1");
    doc = connectEdge(doc, "s1", "out", "e1");

    assert.equal(validateStoryDocument(doc).ok, true);
    const script1 = serializeStoryScript(doc);
    assert.ok(script1.includes("\n  set\n"), `expected clean empty set line:\n${script1}`);

    const parsed1 = parseStoryScript(script1);
    assert.equal(parsed1.ok, true, JSON.stringify(parsed1.diagnostics));
    assert.deepEqual(parsed1.doc.nodes.s1.beats[0].ops, []);
    assert.equal(serializeStoryScript(parsed1.doc), script1);

    // Explicit `set []` form also parses cleanly.
    const parsedBrackets = parseStoryScript(script1.replace("\n  set\n", "\n  set []\n"));
    assert.equal(parsedBrackets.ok, true, JSON.stringify(parsedBrackets.diagnostics));
    assert.deepEqual(parsedBrackets.doc.nodes.s1.beats[0].ops, []);
});

test("MoeSekai Script round-trips all-digit IDs across cast, variables, nodes, choice options, and condition rules", () => {
    const doc = {
        schema: STORY_SCHEMA_VERSION,
        id: "999888",
        region: "jp",
        meta: { title: "Numeric IDs", summary: "", author: "" },
        cast: [
            { key: "0482", modelId: "v2_01ichika_casual", name: "Ichika", characterId: 1 },
            { key: "0999", modelId: "v2_02saki_casual", name: "Saki", characterId: 2 },
        ],
        variables: [
            { id: "001", name: "Counter", type: "number", initial: 0 },
        ],
        startNodeId: "0",
        nodes: {
            "0": { id: "0", type: "start", pos: { x: 40, y: 120 } },
            "100": {
                id: "100",
                type: "scene",
                title: "Room",
                pos: { x: 340, y: 120 },
                background: { mode: "set", asset: DEFAULT_STORY_BACKGROUND },
                bgm: { mode: "inherit" },
                place: { mode: "inherit" },
                transition: { kind: "none", duration: 0.4 },
                stageCast: {
                    mode: "set",
                    actors: [{ castKey: "0482", slot: "left" }, { castKey: "0999", slot: "right" }],
                },
                beats: [
                    {
                        id: "100_b1",
                        kind: "talk",
                        speakerKey: "0482",
                        body: "Score: {{001}}",
                        reactions: [{ castKey: "0999", facial: "face_smile_01" }],
                    },
                    { id: "100_b2", kind: "stageAction", action: "move", castKey: "0482", slot: "center", duration: 0.4 },
                    { id: "100_b3", kind: "varOp", ops: [{ varId: "001", op: "add", value: 1 }] },
                ],
            },
            "200": {
                id: "200",
                type: "choice",
                title: "Choose",
                pos: { x: 680, y: 120 },
                options: [
                    { id: "123456", text: "Option A", condition: { varId: "001", op: ">=", value: 1 }, effects: [{ varId: "001", op: "add", value: 2 }] },
                    { id: "654321", text: "Option B" },
                ],
            },
            "300": {
                id: "300",
                type: "condition",
                title: "Check",
                pos: { x: 1020, y: 120 },
                rules: [
                    { id: "777", label: "High", expr: { varId: "001", op: ">=", value: 2 } },
                ],
            },
            "400": { id: "400", type: "end", title: "Ending", pos: { x: 1360, y: 120 } },
        },
        edges: [
            { id: "e_0_out", fromNodeId: "0", fromPortId: "out", toNodeId: "100" },
            { id: "e_100_out", fromNodeId: "100", fromPortId: "out", toNodeId: "200" },
            { id: "e_200_123456", fromNodeId: "200", fromPortId: "123456", toNodeId: "300" },
            { id: "e_200_654321", fromNodeId: "200", fromPortId: "654321", toNodeId: "400" },
            { id: "e_300_777", fromNodeId: "300", fromPortId: "777", toNodeId: "400" },
            { id: "e_300_else", fromNodeId: "300", fromPortId: "else", toNodeId: "400" },
        ],
    };

    const validated = validateStoryDocument(doc);
    assert.equal(validated.ok, true, JSON.stringify(validated.ok ? [] : validated.issues));

    const script1 = serializeStoryScript(doc);
    const parsed = parseStoryScript(script1);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
    assert.equal(serializeStoryScript(parsed.doc), script1);
    assert.deepEqual(compileStoryGraph(parsed.doc).instructions, compileStoryGraph(doc).instructions);
});

test("MoeSekai Script round-trips digit-then-hyphen IDs and voice asset names without breaking -> or -=", () => {
    const doc = makeStarter("jp");
    doc.nodes.scene_open.beats[1].voice = {
        kind: "story",
        scenarioId: "01-ev",
        voiceId: "02-vo",
        region: "en",
        start: 0.2,
        end: 1.5,
    };
    const validated = validateStoryDocument(doc);
    assert.equal(validated.ok, true, JSON.stringify(validated.ok ? [] : validated.issues));

    const script1 = serializeStoryScript(doc);
    const parsed = parseStoryScript(script1);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
    assert.deepEqual(parsed.doc.nodes.scene_open.beats[1].voice, doc.nodes.scene_open.beats[1].voice);
    assert.equal(serializeStoryScript(parsed.doc), script1);

    // Compact numeric IDs followed directly by `->` or `-=` (no whitespace) must still lex cleanly!
    const compact = parseStoryScript(`
@story "Compact" region=jp
@var 01: number = 10
start -> 02-scene
scene 02-scene "Test" {
  bg inherit
  bgm inherit
  place inherit
  transition none 0
  cast inherit
  set 01-=5
}->03-end
end 03-end "End"
`);
    assert.equal(compact.ok, true, JSON.stringify(compact.diagnostics));
    assert.deepEqual(compact.doc.nodes["02-scene"].beats[0].ops, [{ varId: "01", op: "sub", value: 5 }]);
    assert.equal(compact.doc.edges.find(e => e.fromNodeId === "02-scene")?.toNodeId, "03-end");
});

// ==================== 9. Merge Node Warning, Continue & Cut Scene, .msk Starters ====================

test("compiler emits non-blocking mergeNodeInheritAmbiguous warning on multi-in-degree scene with inherit slots and clears it once all slots are explicit", () => {
    assert.ok(STORY_ISSUE_CODES.includes("mergeNodeInheritAmbiguous"));

    let doc = createStoryDocument("jp", "Merge Test");
    doc = addCastMember(doc, { key: "ichika", modelId: "v2_01ichika_casual", name: "Ichika", characterId: 1 });
    doc = createNode(doc, "choice", { x: 320, y: 120 }, { id: "ch1", title: "Split" }).doc;
    doc.nodes.ch1.options = [
        { id: "opt1", text: "Branch A" },
        { id: "opt2", text: "Branch B" },
    ];
    doc = createNode(doc, "scene", { x: 640, y: 20 }, { id: "s_a", title: "A" }).doc;
    doc = setSceneBackground(doc, "s_a", { mode: "set", asset: "bg_a000401" });
    doc = setSceneBgm(doc, "s_a", { mode: "play", name: "bgm00020", volume: 0.7 });
    doc = setScenePlace(doc, "s_a", { mode: "set", text: "Place A" });
    doc = setSceneStageCast(doc, "s_a", { mode: "set", actors: [{ castKey: "ichika", slot: "left" }] });
    doc = insertBeat(doc, "s_a", { id: "b_a", kind: "narration", body: "In A." });

    doc = createNode(doc, "scene", { x: 640, y: 240 }, { id: "s_b", title: "B" }).doc;
    doc = setSceneBackground(doc, "s_b", { mode: "set", asset: "bg_a000402" });
    doc = setSceneBgm(doc, "s_b", { mode: "play", name: "bgm00018", volume: 0.6 });
    doc = setScenePlace(doc, "s_b", { mode: "set", text: "Place B" });
    doc = setSceneStageCast(doc, "s_b", { mode: "set", actors: [{ castKey: "ichika", slot: "right" }] });
    doc = insertBeat(doc, "s_b", { id: "b_b", kind: "narration", body: "In B." });

    // Merge scene with all 4 slots set to inherit (default of createNode).
    doc = createNode(doc, "scene", { x: 960, y: 120 }, { id: "s_merge", title: "Merge" }).doc;
    doc = insertBeat(doc, "s_merge", { id: "b_m", kind: "narration", body: "Rejoined." });
    doc = createNode(doc, "end", { x: 1280, y: 120 }, { id: "e1", title: "Fin" }).doc;

    doc = connectEdge(doc, "start", "out", "ch1");
    doc = connectEdge(doc, "ch1", "opt1", "s_a");
    doc = connectEdge(doc, "ch1", "opt2", "s_b");
    doc = connectEdge(doc, "s_a", "out", "s_merge");
    doc = connectEdge(doc, "s_b", "out", "s_merge");
    doc = connectEdge(doc, "s_merge", "out", "e1");

    // 1. All 4 slots inherited on 2-in-degree scene -> warning emitted, still non-blocking (ok === true).
    const progAll = compileStoryGraph(doc);
    assert.equal(progAll.ok, true, JSON.stringify(progAll.errors));
    const warnAll = progAll.warnings.find(w => w.code === "mergeNodeInheritAmbiguous");
    assert.ok(warnAll, "expected mergeNodeInheritAmbiguous warning");
    assert.equal(warnAll.severity, "warning");
    assert.equal(warnAll.nodeId, "s_merge");
    assert.equal(warnAll.path, "nodes.s_merge");
    assert.deepEqual(warnAll.params, { count: 2, slots: "background, bgm, place, stageCast" });

    // 2. Partial explicit slots -> warning only lists remaining inherited slots.
    let partial = setSceneBackground(doc, "s_merge", { mode: "clear" });
    partial = setScenePlace(partial, "s_merge", { mode: "hide" });
    const warnPartial = compileStoryGraph(partial).warnings.find(w => w.code === "mergeNodeInheritAmbiguous");
    assert.ok(warnPartial);
    assert.deepEqual(warnPartial.params, { count: 2, slots: "bgm, stageCast" });

    // 3. All 4 slots explicitly declared (set/clear/stop/hide) -> warning completely cleared (0 warnings total)!
    let resolved = setSceneBgm(partial, "s_merge", { mode: "stop" });
    resolved = setSceneStageCast(resolved, "s_merge", { mode: "clear" });
    const progResolved = compileStoryGraph(resolved);
    assert.equal(progResolved.ok, true);
    assert.equal(progResolved.warnings.length, 0, JSON.stringify(progResolved.warnings));

    // 4. Deterministic BFS resolution in evaluateStageAt ordered by doc.edges order!
    const snap1 = evaluateStageAt(doc, "s_merge");
    const snap2 = evaluateStageAt(doc, "s_merge");
    assert.deepEqual(snap1, snap2);
    assert.equal(snap1.stage.background, "bg_a000401"); // opt1 edge appeared before opt2 in doc.edges
    assert.equal(snap1.stage.place, "Place A");

    // Swapping edge order for ch1 puts s_b first in BFS -> deterministically resolves to s_b's stage.
    const reordered = {
        ...doc,
        edges: [
            doc.edges.find(e => e.fromNodeId === "start"),
            doc.edges.find(e => e.fromPortId === "opt2"),
            doc.edges.find(e => e.fromPortId === "opt1"),
            doc.edges.find(e => e.fromNodeId === "s_b"),
            doc.edges.find(e => e.fromNodeId === "s_a"),
            doc.edges.find(e => e.fromNodeId === "s_merge"),
        ],
    };
    const snapReordered = evaluateStageAt(reordered, "s_merge");
    assert.equal(snapReordered.stage.background, "bg_a000402");
    assert.equal(snapReordered.stage.place, "Place B");
    assert.equal(snapReordered.stage.actors[0]?.slot, "right");
});

test("continueAndCutScene creates continuation scenes with presets, splitAtBeatId migration, and A -> new -> B rewiring while keeping createNode isolated", () => {
    let doc = createStoryDocument("jp", "Cut Scene Sugar");
    doc = addCastMember(doc, { key: "ichika", modelId: "v2_01ichika_casual", name: "Ichika", characterId: 1 });
    const s1Res = createNode(doc, "scene", { x: 300, y: 120 }, { id: "s_a", title: "Act 1" });
    doc = s1Res.doc;
    // createNode itself MUST remain 100% isolated (0 edges)!
    assert.equal(doc.edges.length, 0);

    doc = setSceneBackground(doc, "s_a", { mode: "set", asset: DEFAULT_STORY_BACKGROUND });
    doc = setSceneBgm(doc, "s_a", { mode: "play", name: DEFAULT_STORY_BGM, volume: 0.75 });
    doc = setScenePlace(doc, "s_a", { mode: "set", text: "Classroom" });
    doc = setSceneStageCast(doc, "s_a", { mode: "set", actors: [{ castKey: "ichika", slot: "center" }] });
    doc = insertBeat(doc, "s_a", { id: "b1", kind: "telop", text: "Beat 1" });
    doc = insertBeat(doc, "s_a", { id: "b2", kind: "talk", speakerKey: "ichika", body: "Beat 2" });
    doc = insertBeat(doc, "s_a", { id: "b3", kind: "narration", body: "Beat 3" });

    // Place downstream node right at (s_a.pos.x + GRAPH_COL_GAP, s_a.pos.y) to also test occupancy nudging!
    doc = createNode(doc, "end", { x: 300 + GRAPH_COL_GAP, y: 120 }, { id: "end_b", title: "End" }).doc;
    doc = connectEdge(doc, "start", "out", "s_a");
    doc = connectEdge(doc, "s_a", "out", "end_b");

    // Non-scene or missing node returns safe no-op.
    assert.deepEqual(continueAndCutScene(doc, "missing"), { doc, node: null });
    assert.deepEqual(continueAndCutScene(doc, "end_b"), { doc, node: null });
    assert.deepEqual(continueAndCutScene(doc, "start"), { doc, node: null });

    // 1. Default inherit continuation + splitAtBeatId="b2" + rewiring s_a -> newScene -> end_b!
    const cut1 = continueAndCutScene(doc, "s_a", { title: "Act 1 (Cont.)", splitAtBeatId: "b2" });
    assert.ok(cut1.node);
    const newId1 = cut1.node.id;
    assert.equal(cut1.node.title, "Act 1 (Cont.)");
    assert.deepEqual(cut1.node.background, { mode: "inherit" });
    assert.deepEqual(cut1.node.bgm, { mode: "inherit" });
    assert.deepEqual(cut1.node.place, { mode: "inherit" });
    assert.deepEqual(cut1.node.stageCast, { mode: "inherit" });
    assert.deepEqual(cut1.node.transition, { kind: "none", duration: 0.4 });
    // Nudged away from occupied end_b position!
    assert.equal(cut1.node.pos.x, 300 + GRAPH_COL_GAP);
    assert.notEqual(cut1.node.pos.y, 120);
    // Beat migration: b1 stays on s_a, [b2, b3] move to newScene!
    assert.deepEqual(cut1.doc.nodes.s_a.beats.map(b => b.id), ["b1"]);
    assert.deepEqual(cut1.doc.nodes[newId1].beats.map(b => b.id), ["b2", "b3"]);
    // Edge rewiring: s_a.out -> newId1 AND newId1.out -> end_b (both normal detachable edges)!
    assert.equal(cut1.doc.edges.find(e => e.fromNodeId === "s_a" && e.fromPortId === "out")?.toNodeId, newId1);
    assert.equal(cut1.doc.edges.find(e => e.fromNodeId === newId1 && e.fromPortId === "out")?.toNodeId, "end_b");
    assert.equal(compileStoryGraph(cut1.doc).ok, true);
    assert.equal(compileStoryGraph(cut1.doc).warnings.length, 0);

    // 2. Presets: bgmStop, bgmChange, bgChange on an unwired tail scene.
    const tailBase = disconnectPort(cut1.doc, newId1, "out");
    const stopCut = continueAndCutScene(tailBase, newId1, { preset: "bgmStop" });
    assert.ok(stopCut.node);
    assert.deepEqual(stopCut.node.bgm, { mode: "stop" });
    assert.deepEqual(stopCut.node.background, { mode: "inherit" });
    assert.equal(stopCut.doc.edges.find(e => e.fromNodeId === newId1)?.toNodeId, stopCut.node.id);
    assert.equal(stopCut.doc.edges.some(e => e.fromNodeId === stopCut.node.id), false);

    const bgmChangeCut = continueAndCutScene(tailBase, newId1, { preset: "bgmChange" });
    assert.deepEqual(bgmChangeCut.node?.bgm, { mode: "play", name: DEFAULT_STORY_BGM, volume: 0.75 });

    const bgChangeCut = continueAndCutScene(tailBase, newId1, { preset: "bgChange" });
    assert.deepEqual(bgChangeCut.node?.background, { mode: "set", asset: DEFAULT_STORY_BACKGROUND });

    // 3. Respects STORY_LIMITS.nodes.
    let fullDoc = createStoryDocument("jp", "Full");
    fullDoc = createNode(fullDoc, "scene", { x: 300, y: 120 }, { id: "s0" }).doc;
    for (let i = Object.keys(fullDoc.nodes).length; i < STORY_LIMITS.nodes; i++) {
        fullDoc.nodes[`pad_${i}`] = { id: `pad_${i}`, type: "end", title: "", pos: { x: 0, y: i * 10 } };
    }
    assert.equal(Object.keys(fullDoc.nodes).length, STORY_LIMITS.nodes);
    assert.deepEqual(continueAndCutScene(fullDoc, "s0"), { doc: fullDoc, node: null });
});

test("createStarterStoryFromScript parses zh/en/ja .msk templates with 0 errors and 0 warnings, and starter.ts is .msk-only", () => {
    assert.equal("downloadStoryJson" in starterModule, false, "downloadStoryJson must be removed from starter.ts");
    assert.equal(typeof starterModule.downloadStoryScript, "function");

    const cases = [
        { locale: "zh", region: "cn" },
        { locale: "en", region: "en" },
        { locale: "ja", region: "jp" },
    ];
    for (const { locale, region } of cases) {
        const doc = createStarterStoryFromScript(region, locale);
        assert.equal(doc.schema, STORY_SCHEMA_VERSION);
        assert.equal(doc.region, region);

        const validated = validateStoryDocument(doc);
        assert.equal(validated.ok, true, `${locale}: ${JSON.stringify(validated.ok ? [] : validated.issues)}`);
        assert.equal(validated.program.errors.length, 0, `${locale} errors`);
        assert.equal(validated.program.warnings.length, 0, `${locale} warnings: ${JSON.stringify(validated.program.warnings)}`);

        const declaredEndings = Object.values(doc.nodes)
            .filter(node => node.type === "end")
            .map(node => node.id);
        assert.ok(declaredEndings.length >= 2, `${locale}: expected >= 2 endings, got ${declaredEndings.length}`);
        assert.equal(validated.program.endingNodeIds.length, declaredEndings.length, `${locale}: all endings must be graph-reachable`);

        // Generic BFS branch explorer across arbitrary choices/conditions to verify every declared ending is reachable.
        const reachedEndings = new Set();
        const queue = [{ frame: createInitialRuntime(validated.program), seenChoiceStates: new Set() }];
        let exploredPaths = 0;

        while (queue.length > 0) {
            assert.ok(exploredPaths < 128, `${locale}: BFS exceeded 128 branches`);
            const { frame: startFrame, seenChoiceStates } = queue.shift();
            let cur = startFrame;
            let steps = 0;
            while (cur.stoppedReason === "blocking") {
                steps += 1;
                assert.ok(steps <= 500, `${locale}: blocking beat step limit exceeded`);
                cur = advanceRuntime(validated.program, cur);
            }

            if (cur.stoppedReason === "choice") {
                const available = cur.pendingChoice.options.filter(opt => opt.available);
                assert.ok(available.length > 0, `${locale}: deadlocked choice at ${cur.nodeId}`);
                const varSig = JSON.stringify(cur.variables);
                for (const opt of available) {
                    const stateKey = `${cur.nodeId}\0${opt.id}\0${varSig}`;
                    if (seenChoiceStates.has(stateKey)) continue;
                    const nextSeen = new Set(seenChoiceStates);
                    nextSeen.add(stateKey);
                    queue.push({ frame: advanceRuntime(validated.program, cur, opt.id), seenChoiceStates: nextSeen });
                }
            } else {
                exploredPaths += 1;
                assert.equal(cur.stoppedReason, "end", `${locale}: branch stopped unexpectedly with ${cur.stoppedReason} at ${cur.nodeId}`);
                reachedEndings.add(cur.ending.nodeId);
            }
        }

        for (const endId of declaredEndings) {
            assert.ok(reachedEndings.has(endId), `${locale}: declared ending '${endId}' was not reached by BFS (reached: ${[...reachedEndings].join(", ")})`);
        }
    }
});
