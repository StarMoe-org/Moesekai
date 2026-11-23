/**
 * Unit test suite for Story Maker native multi-language (`StoryLocalePack`),
 * AI Translation Assistant prompt & chunking, mandatory transparent provenance
 * declaration, and generalized custom voice track (`StoryVoiceManifest`) playback.
 *
 * Run with: node --experimental-strip-types --test tests/story-maker-i18n.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
    STORY_I18N_SCHEMA_VERSION,
    STORY_VOICE_MANIFEST_SCHEMA_VERSION,
    addCastMember,
    addVariable,
    connectEdge,
    createNode,
    createSceneBeat,
    createStoryDocument,
    insertBeat,
    setScenePlace,
    setStorySourceLocale,
    updateBeat,
    updateNode,
    upsertStoryLocalePack,
    compileStoryGraph,
    advanceRuntime,
    createInitialRuntime,
    localizeRuntimeFrame,
    parseStoryScript,
    serializeStoryScript,
    parseStoryJson,
    validateStoryDocument,
    PJSK_CHARACTER_SPEECH_HINTS,
    applyStoryLocaleOverlay,
    buildAiTranslationPrompt,
    buildTranslationChunks,
    computeBeatSrcHash,
    detectJsonArtifactKind,
    detectOutdatedBeats,
    extractJsonObjectText,
    extractTranslatableSource,
    getAvailableStoryLocales,
    inferStorySourceLocale,
    isSafeVoiceManifestUrl,
    matchVoiceManifestToDoc,
    parseAndValidateLocalePack,
    parseStoryVoiceManifest,
    resolveVoiceManifestLineUrl,
    upgradePackToProofread,
} = await import("@moesekai/story-core");

function buildSampleBilingualDoc() {
    let doc = createStoryDocument("jp", "屋顶上的小约定");
    doc = setStorySourceLocale(doc, "zh-CN");
    doc = {
        ...doc,
        meta: {
            ...doc.meta,
            summary: "星乃一歌与初音未来在放学后的简短对话。",
            author: "Tester",
        },
    };

    doc = addCastMember(doc, {
        key: "ichika",
        name: "星乃一歌",
        modelId: "01ichika_unit",
        characterId: 1,
    });
    doc = addCastMember(doc, {
        key: "miku",
        name: "初音未来",
        modelId: "21miku_band",
        characterId: 21,
    });
    doc = addCastMember(doc, {
        key: "mob",
        name: "路人同学",
        modelId: "sub_mob_student_01",
    });

    const addedVar = addVariable(doc, { name: "默契值", type: "number", initial: 5 });
    doc = addedVar.doc;
    const varId = addedVar.variable.id;

    const sc = createNode(doc, "scene", { x: 200, y: 100 });
    doc = sc.doc;
    const sceneId = sc.node.id;
    doc = setScenePlace(doc, sceneId, { mode: "set", text: "宫益坂女子学园 屋顶" });

    const b1 = createSceneBeat("talk", doc);
    doc = insertBeat(doc, sceneId, {
        ...b1,
        speakerKey: "ichika",
        body: "你好，今天的风真舒服啊！",
        facial: "face_smile_01",
    });

    const b2 = createSceneBeat("talk", doc);
    doc = insertBeat(doc, sceneId, {
        ...b2,
        speakerKey: "miku",
        body: `现在的默契值是 {{${varId}}} 哦。`,
        facial: "face_shy_01",
    });

    const b3 = createSceneBeat("talk", doc);
    doc = insertBeat(doc, sceneId, {
        ...b3,
        speakerKey: "ichika",
        body: "这句配有官方语音。",
        voice: {
            kind: "story",
            scenarioId: "event_001_01",
            voiceId: "voice_ev_01",
        },
    });

    const b4 = createSceneBeat("talk", doc);
    doc = insertBeat(doc, sceneId, {
        ...b4,
        speakerKey: "mob",
        body: "路人角色的台词。",
    });

    const b5 = createSceneBeat("narration", doc);
    doc = insertBeat(doc, sceneId, {
        ...b5,
        body: "微风轻轻吹过屋顶。",
    });

    const b6 = createSceneBeat("telop", doc);
    doc = insertBeat(doc, sceneId, {
        ...b6,
        text: "片刻之后",
    });

    const ch = createNode(doc, "choice", { x: 500, y: 100 });
    doc = ch.doc;
    const choiceId = ch.node.id;
    doc = updateNode(doc, choiceId, node => (
        node.type === "choice"
            ? {
                ...node,
                options: [
                    { id: "opt_a", text: "继续练吉他" },
                    { id: "opt_b", text: `查看默契 {{${varId}}}` },
                ],
            }
            : node
    ));

    const end = createNode(doc, "end", { x: 800, y: 100 });
    doc = end.doc;
    const endId = end.node.id;
    doc = updateNode(doc, endId, node => (
        node.type === "end"
            ? { ...node, title: "放学后的余韵", subtitle: `最终默契：{{${varId}}}` }
            : node
    ));

    doc = connectEdge(doc, doc.startNodeId, "out", sceneId);
    doc = connectEdge(doc, sceneId, "out", choiceId);
    doc = connectEdge(doc, choiceId, "opt_a", endId);
    doc = connectEdge(doc, choiceId, "opt_b", endId);

    return {
        doc,
        sceneId,
        choiceId,
        endId,
        varId,
        beatIds: { b1: b1.id, b2: b2.id, b3: b3.id, b4: b4.id, b5: b5.id, b6: b6.id },
        castKeys: { ichika: "ichika", miku: "miku", mob: "mob" },
    };
}

// ==================== 1. PJSK Speech-Habit Reference Table ====================

test("1. PJSK_CHARACTER_SPEECH_HINTS covers all 26 main characters", () => {
    for (let id = 1; id <= 26; id += 1) {
        const hint = PJSK_CHARACTER_SPEECH_HINTS[id];
        assert.ok(hint, `Missing speech hint for character ${id}`);
        assert.equal(hint.characterId, id);
        assert.ok(hint.firstPerson.length > 0);
        assert.ok(hint.toneJa.length > 0);
        assert.ok(hint.toneEn.length > 0);
    }
});

// ==================== 2. Extraction & Deterministic srcHash ====================

test("2. extractTranslatableSource strips stage/graph noise and computes deterministic 8-char srcHash", () => {
    const { doc, beatIds, sceneId, choiceId, endId } = buildSampleBilingualDoc();
    const extracted = extractTranslatableSource(doc);

    assert.equal(extracted.sourceLocale, "zh-CN");
    assert.equal(extracted.meta.title, "屋顶上的小约定");
    assert.equal(extracted.places[sceneId], "宫益坂女子学园 屋顶");
    assert.equal(extracted.beats.length, 6);
    assert.equal(extracted.choices[choiceId].opt_a, "继续练吉他");
    assert.equal(extracted.ends[endId].title, "放学后的余韵");

    const hashA = computeBeatSrcHash("  你好，  今天的风真舒服啊！ ");
    const hashB = computeBeatSrcHash("你好， 今天的风真舒服啊！");
    assert.equal(hashA, hashB);
    assert.match(hashA, /^[0-9a-f]{8}$/);
    assert.equal(extracted.beatById[beatIds.b1].srcHash, computeBeatSrcHash("你好，今天的风真舒服啊！"));
    assert.equal(extracted.beatById[beatIds.b3].hasOfficialVoice, true);
    assert.equal(extracted.beatById[beatIds.b1].hasOfficialVoice, false);
});

// ==================== 3. AI Translation Prompt Builder ====================

test("3. buildAiTranslationPrompt injects ONLY appearing PJSK characters and omits TTS instructions", () => {
    const { doc } = buildSampleBilingualDoc();
    const built = buildAiTranslationPrompt(doc, "ja-JP", 0);

    // Only Ichika (1) and Miku (21) appear; uncast characters like Tsukasa (13) or Kanade (17) must NOT appear.
    assert.deepEqual(built.injectedCharacterIds, [1, 21]);
    assert.match(built.prompt, /星乃一歌/);
    assert.match(built.prompt, /初音ミク/);
    assert.match(built.prompt, /教室のセカイ/);
    assert.doesNotMatch(built.prompt, /天馬司/);
    assert.doesNotMatch(built.prompt, /宵崎奏/);
    assert.match(built.prompt, /moesekai-story-i18n\/1/);
    assert.match(built.prompt, /\{\{variable\}\}/);
    // Must contain ZERO TTS / emotion / read directives
    assert.doesNotMatch(built.prompt, /TTS/);
    assert.doesNotMatch(built.prompt, /"emotion"/);
    assert.doesNotMatch(built.prompt, /"read"/);

    // Payload beat entries must NOT include emotion or read keys
    for (const beatPayload of Object.values(built.chunk.payload.beats)) {
        assert.equal("emotion" in beatPayload, false);
        assert.equal("read" in beatPayload, false);
    }

    // Also verify en-US target works cleanly
    const builtEn = buildAiTranslationPrompt(doc, "en-US", 0);
    assert.deepEqual(builtEn.injectedCharacterIds, [1, 21]);
    assert.match(builtEn.prompt, /Hoshino Ichika/);
    assert.doesNotMatch(builtEn.prompt, /Japanese Localization Guidelines/);
});

// ==================== 4. Scene-Aware Chunking ====================

test("4. buildTranslationChunks splits long stories by scene (~60 beats/chunk) and slices oversized scenes", () => {
    let doc = createStoryDocument("jp", "长篇测试");
    doc = setStorySourceLocale(doc, "zh-CN");
    doc = addCastMember(doc, { key: "ichika", name: "一歌", modelId: "01ichika_unit", characterId: 1 });

    const s1 = createNode(doc, "scene", { x: 100, y: 0 });
    doc = s1.doc;
    const s2 = createNode(doc, "scene", { x: 300, y: 0 });
    doc = s2.doc;
    const s3 = createNode(doc, "scene", { x: 500, y: 0 });
    doc = s3.doc;

    for (let i = 0; i < 40; i += 1) {
        doc = insertBeat(doc, s1.node.id, { ...createSceneBeat("talk", doc), speakerKey: "ichika", body: `S1 line ${i}` });
    }
    for (let i = 0; i < 35; i += 1) {
        doc = insertBeat(doc, s2.node.id, { ...createSceneBeat("talk", doc), speakerKey: "ichika", body: `S2 line ${i}` });
    }
    for (let i = 0; i < 75; i += 1) {
        doc = insertBeat(doc, s3.node.id, { ...createSceneBeat("talk", doc), speakerKey: "ichika", body: `S3 line ${i}` });
    }
    doc = connectEdge(doc, doc.startNodeId, "out", s1.node.id);
    doc = connectEdge(doc, s1.node.id, "out", s2.node.id);
    doc = connectEdge(doc, s2.node.id, "out", s3.node.id);

    const chunks = buildTranslationChunks(doc, "ja-JP", { maxBeatsPerChunk: 60 });
    assert.equal(chunks.length, 4);
    assert.equal(chunks[0].beatCount, 40);
    assert.equal(chunks[1].beatCount, 35);
    assert.equal(chunks[2].beatCount, 60);
    assert.equal(chunks[3].beatCount, 15);
    assert.equal(chunks[0].includesMeta, true);
    assert.equal(chunks[1].includesMeta, false);
    assert.equal(chunks[3].includesChoicesAndEnds, true);
    assert.equal(chunks.reduce((sum, c) => sum + c.beatCount, 0), 150);
});

// ==================== 5. Tolerant Parser, {{var}} Guard & Anti-Spoofing ====================

test("5. parseAndValidateLocalePack strips markdown fences, enforces {{var}}, anti-spoofing, and chunk merge", () => {
    const { doc, beatIds, sceneId, choiceId, endId, varId, castKeys } = buildSampleBilingualDoc();
    const extracted = extractTranslatableSource(doc);

    const validJaPayload = {
        schema: STORY_I18N_SCHEMA_VERSION,
        locale: "ja-JP",
        translationMeta: {
            origin: "original", // Attempted spoofing by AI -> must be forced to ai_raw on ai_paste!
            modelHint: "TestModel",
        },
        meta: {
            title: "屋上での小さな約束",
            summary: "星乃一歌と初音ミクの放課後の会話。",
        },
        cast: {
            [castKeys.ichika]: "星乃一歌",
            [castKeys.miku]: "初音ミク",
            [castKeys.mob]: "クラスメイト",
        },
        places: {
            [sceneId]: "宮益坂女子学園 屋上",
        },
        beats: {
            [beatIds.b1]: {
                srcHash: extracted.beatById[beatIds.b1].srcHash,
                body: "こんにちは、今日の風は気持ちいいね！",
                // Legacy extra fields must be silently stripped
                emotion: "明るく微笑みながら",
                read: "こんにちは",
            },
            [beatIds.b2]: {
                srcHash: extracted.beatById[beatIds.b2].srcHash,
                body: `今のキズナは {{${varId}}} だよ。`,
            },
            [beatIds.b3]: {
                srcHash: extracted.beatById[beatIds.b3].srcHash,
                body: "このセリフは公式ボイスだよ。",
            },
            [beatIds.b4]: {
                srcHash: extracted.beatById[beatIds.b4].srcHash,
                body: "クラスメイトのセリフだよ。",
            },
            [beatIds.b5]: {
                srcHash: extracted.beatById[beatIds.b5].srcHash,
                body: "そよ風が屋上を吹き抜けた。",
            },
            [beatIds.b6]: {
                srcHash: extracted.beatById[beatIds.b6].srcHash,
                body: "しばらくして",
            },
            unknown_extra_beat: {
                srcHash: "deadbeef",
                body: "これは余分なIDだよ。",
            },
        },
        choices: {
            [choiceId]: {
                opt_a: "ギターの練習を続ける",
                opt_b: `キズナ {{${varId}}} を確認する`,
            },
        },
        ends: {
            [endId]: {
                title: "放課後の余韻",
                subtitle: `最終キズナ：{{${varId}}}`,
            },
        },
    };

    const noisyAiOutput = `Sure! Here is the translated JSON:\n\n\`\`\`json\n${JSON.stringify(validJaPayload, null, 2)}\n\`\`\`\n\nHope this helps!`;
    assert.ok(extractJsonObjectText(noisyAiOutput)?.startsWith("{"));

    const res = parseAndValidateLocalePack(noisyAiOutput, doc, "ja-JP", { importSource: "ai_paste" });
    assert.equal(res.ok, true, JSON.stringify(res.errors));
    assert.ok(res.pack);
    // Mandatory anti-spoofing: ai_paste ALWAYS forces ai_raw when AI tries to claim "original"
    assert.equal(res.pack.translationMeta.origin, "ai_raw");
    // Extra unknown beat ID is warned and stripped
    assert.equal(res.pack.beats.unknown_extra_beat, undefined);
    assert.ok(res.warnings.some(w => w.code === "extraBeat" && w.beatId === "unknown_extra_beat"));
    // Legacy emotion/read fields must NOT persist on StoryLocaleBeatEntry
    assert.equal("emotion" in res.pack.beats[beatIds.b1], false);
    assert.equal("read" in res.pack.beats[beatIds.b1], false);

    // {{var}} guard: dropping {{varId}} must produce a blocking placeholderMismatch error
    const brokenVarPayload = structuredClone(validJaPayload);
    brokenVarPayload.beats[beatIds.b2].body = "今のキズナは 5 だよ。";
    const brokenVarRes = parseAndValidateLocalePack(JSON.stringify(brokenVarPayload), doc, "ja-JP", {
        importSource: "ai_paste",
    });
    assert.equal(brokenVarRes.ok, false);
    assert.ok(brokenVarRes.errors.some(e => e.code === "placeholderMismatch" && e.beatId === beatIds.b2));

    // File upload claiming "original" without override must be blocked
    const spoofFileRes = parseAndValidateLocalePack(JSON.stringify(validJaPayload), doc, "ja-JP", {
        importSource: "file_upload",
    });
    assert.equal(spoofFileRes.ok, false);
    assert.ok(spoofFileRes.errors.some(e => e.code === "originOriginalForbidden"));

    // File upload with explicit "human" declaration passes
    const humanFileRes = parseAndValidateLocalePack(JSON.stringify(validJaPayload), doc, "ja-JP", {
        importSource: "file_upload",
        originOverride: "human",
    });
    assert.equal(humanFileRes.ok, true);
    assert.equal(humanFileRes.pack?.translationMeta.origin, "human");

    // Upgrading ai_raw pack to ai_assisted works and preserves content
    const upgraded = upgradePackToProofread(res.pack, "Reviewed by creator");
    assert.equal(upgraded.translationMeta.origin, "ai_assisted");
    assert.equal(upgraded.translationMeta.note, "Reviewed by creator");

    // Merging a second chunk preserves already-translated beats from chunk 1
    const partialChunk = {
        schema: STORY_I18N_SCHEMA_VERSION,
        locale: "ja-JP",
        translationMeta: { origin: "ai_raw" },
        beats: {
            [beatIds.b1]: { srcHash: extracted.beatById[beatIds.b1].srcHash, body: "やっほー、風が強いね！" },
        },
    };
    const mergedRes = parseAndValidateLocalePack(JSON.stringify(partialChunk), doc, "ja-JP", {
        importSource: "ai_paste",
        existingPack: upgraded,
    });
    assert.equal(mergedRes.ok, true);
    assert.equal(mergedRes.pack?.beats[beatIds.b1].body, "やっほー、風が強いね！");
    assert.equal(mergedRes.pack?.beats[beatIds.b2].body, `今のキズナは {{${varId}}} だよ。`);
});

// ==================== 6. srcHash Outdated Detection ====================

test("6. detectOutdatedBeats flags only edited beats via srcHash", () => {
    const { doc, sceneId, beatIds } = buildSampleBilingualDoc();
    const extracted = extractTranslatableSource(doc);
    const pack = {
        schema: STORY_I18N_SCHEMA_VERSION,
        storyId: doc.id,
        locale: "en-US",
        translationMeta: { origin: "human" },
        beats: Object.fromEntries(
            extracted.beats.map(b => [b.beatId, { srcHash: b.srcHash, body: `EN: ${b.body}` }]),
        ),
    };

    const before = detectOutdatedBeats(doc, pack);
    assert.equal(before.outdatedBeatIds.length, 0);
    assert.equal(before.missingBeatIds.length, 0);
    assert.equal(before.upToDateCount, 6);

    const editedDoc = updateBeat(doc, sceneId, beatIds.b1, prev => (
        prev.kind === "talk" ? { ...prev, body: "你好，今天的微风格外温柔呢！" } : prev
    ));
    const after = detectOutdatedBeats(editedDoc, pack);
    assert.deepEqual(after.outdatedBeatIds, [beatIds.b1]);
    assert.equal(after.upToDateCount, 5);
});

// ==================== 7. Non-Mutating Overlay & Zero-Restart Runtime Localization ====================

test("7. applyStoryLocaleOverlay and localizeRuntimeFrame switch subtitles mid-playback without mutating doc", () => {
    const { doc, beatIds, sceneId, choiceId, endId, varId } = buildSampleBilingualDoc();
    const extracted = extractTranslatableSource(doc);
    const jaPack = {
        schema: STORY_I18N_SCHEMA_VERSION,
        storyId: doc.id,
        locale: "ja-JP",
        translationMeta: { origin: "ai_assisted", modelHint: "Claude" },
        meta: { title: "屋上での小さな約束", summary: "放課後の会話。" },
        cast: { ichika: "星乃一歌", miku: "初音ミク" },
        places: { [sceneId]: "宮益坂女子学園 屋上" },
        beats: {
            [beatIds.b1]: { srcHash: extracted.beatById[beatIds.b1].srcHash, body: "こんにちは、いい風だね！" },
            [beatIds.b2]: { srcHash: extracted.beatById[beatIds.b2].srcHash, body: `今のキズナは {{${varId}}} だよ。` },
        },
        choices: { [choiceId]: { opt_a: "ギターを続ける", opt_b: `キズナ {{${varId}}}` } },
        ends: { [endId]: { title: "放課後の余韻", subtitle: `最終キズナ {{${varId}}}` } },
    };

    const withJa = upsertStoryLocalePack(doc, jaPack);
    const available = getAvailableStoryLocales(withJa);
    assert.equal(available.length, 2);
    assert.equal(available[0].locale, "zh-CN");
    assert.equal(available[0].origin, "original");
    assert.equal(available[1].locale, "ja-JP");
    assert.equal(available[1].origin, "ai_assisted");

    const localized = applyStoryLocaleOverlay(withJa, "ja-JP");
    assert.equal(withJa.meta.title, "屋顶上的小约定");
    assert.equal(localized.meta.title, "屋上での小さな約束");
    const locScene = localized.nodes[sceneId];
    assert.equal(locScene.type, "scene");
    if (locScene.type === "scene") {
        assert.equal(locScene.place.mode === "set" ? locScene.place.text : "", "宮益坂女子学園 屋上");
        const firstTalk = locScene.beats.find(b => b.id === beatIds.b1);
        assert.equal(firstTalk?.kind === "talk" ? firstTalk.body : "", "こんにちは、いい風だね！");
    }

    const baseProgram = compileStoryGraph(withJa);
    assert.equal(baseProgram.ok, true);
    let frame = createInitialRuntime(baseProgram);
    assert.equal(frame.stage.dialogue?.body, "你好，今天的风真舒服啊！");
    frame = advanceRuntime(baseProgram, frame);
    assert.equal(frame.stage.dialogue?.body, "现在的默契值是 5 哦。");

    const swapped = localizeRuntimeFrame(frame, localized);
    assert.equal(swapped.pc, frame.pc);
    assert.equal(swapped.stage.dialogue?.body, "今のキズナは 5 だよ。");
    assert.equal(swapped.stage.dialogue?.speaker, "初音ミク");
    assert.equal(swapped.stage.place, "宮益坂女子学園 屋上");
});

// ==================== 8. Generalized Custom Voice Track Manifest & URL Safety ====================

test("8. Generalized StoryVoiceManifest, HTTPS/private-IP guard, baseUrl resolution, and .story.json import", () => {
    const { doc, beatIds } = buildSampleBilingualDoc();
    const extracted = extractTranslatableSource(doc);

    // 8a: Minimal custom voice manifest (only schema, storyId, lines[beatId].url — zero TTS fields required!)
    const minimal = parseStoryVoiceManifest({
        schema: STORY_VOICE_MANIFEST_SCHEMA_VERSION,
        storyId: doc.id,
        lines: {
            [beatIds.b1]: { url: "https://cdn.example.com/dub/b1.ogg" },
        },
    });
    assert.ok(minimal);
    assert.equal(minimal.locale, undefined);
    assert.deepEqual(resolveVoiceManifestLineUrl(minimal, beatIds.b1), ["https://cdn.example.com/dub/b1.ogg"]);

    // 8b: Multi-locale manifest (`zh-CN`, `en-US`, etc.) + relative URLs + `baseUrl` + `objectKey` + optional metadata
    const customManifest = parseStoryVoiceManifest({
        schema: STORY_VOICE_MANIFEST_SCHEMA_VERSION,
        storyId: doc.id,
        locale: "zh-CN",
        title: "中文同人配音版",
        baseUrl: "https://assets.pjsk.moe/sekai-tts-audio/custom/demo",
        lines: {
            [beatIds.b1]: {
                url: "lines/b1.ogg",
                durationMs: 2100,
                speaker: "星乃一歌",
            },
            [beatIds.b2]: {
                url: "",
                objectKey: "lines/b2.ogg",
                locale: "ja-JP",
                speaker: "初音ミク",
                audioHash: "hash_b2",
            },
            [beatIds.b3]: {
                url: "/local-voice/b3.ogg",
            },
            unrelated_beat: {
                url: "https://cdn.example.com/other.ogg",
            },
            // Unsafe line URLs must be stripped out individually
            unsafe_http: {
                url: "http://cdn.example.com/insecure.ogg",
            },
            unsafe_js: {
                url: "javascript:alert(1)",
            },
            unsafe_private: {
                url: "https://192.168.1.10/internal.ogg",
            },
        },
    });
    assert.ok(customManifest);
    assert.equal(customManifest.locale, "zh-CN");
    assert.equal(customManifest.title, "中文同人配音版");
    assert.deepEqual(resolveVoiceManifestLineUrl(customManifest, beatIds.b1), [
        "https://assets.pjsk.moe/sekai-tts-audio/custom/demo/lines/b1.ogg",
    ]);
    assert.deepEqual(resolveVoiceManifestLineUrl(customManifest, beatIds.b2), [
        "https://assets.pjsk.moe/sekai-tts-audio/custom/demo/lines/b2.ogg",
    ]);
    assert.deepEqual(resolveVoiceManifestLineUrl(customManifest, beatIds.b3), [
        "/local-voice/b3.ogg",
    ]);
    assert.equal(customManifest.lines.unsafe_http, undefined);
    assert.equal(customManifest.lines.unsafe_js, undefined);
    assert.equal(customManifest.lines.unsafe_private, undefined);

    // 8c: Legacy manifest with extra TTS fields still parses cleanly for playback (extra fields stripped)
    const legacyManifest = parseStoryVoiceManifest({
        schema: STORY_VOICE_MANIFEST_SCHEMA_VERSION,
        storyId: doc.id,
        storyRev: 1,
        locale: "ja-JP",
        model: "legacy-model",
        translationOrigin: "ai_assisted",
        generatedAt: "2026-11-22T00:00:00Z",
        baseUrl: "https://assets.pjsk.moe/sekai-tts-audio/demo/sample",
        lines: {
            [beatIds.b1]: {
                audioHash: "aaa111",
                voiceId: "pjsk_01_ichika",
                voiceVer: 1,
                url: "",
                objectKey: "lines/b1.ogg",
                durationMs: 2100,
                sizeBytes: 12000,
                codec: "opus",
                variant: 0,
            },
        },
    });
    assert.ok(legacyManifest);
    assert.equal("model" in legacyManifest, false);
    assert.equal("translationOrigin" in legacyManifest, false);
    assert.equal("voiceId" in legacyManifest.lines[beatIds.b1], false);
    assert.deepEqual(resolveVoiceManifestLineUrl(legacyManifest, beatIds.b1), [
        "https://assets.pjsk.moe/sekai-tts-audio/demo/sample/lines/b1.ogg",
    ]);

    // 8d: Reject invalid locale, unsafe baseUrl, or manifest whose lines are ALL unsafe
    assert.equal(parseStoryVoiceManifest({
        schema: STORY_VOICE_MANIFEST_SCHEMA_VERSION,
        storyId: doc.id,
        locale: "xx-XX",
        lines: { [beatIds.b1]: { url: "https://cdn.example.com/b1.ogg" } },
    }), null);
    assert.equal(parseStoryVoiceManifest({
        schema: STORY_VOICE_MANIFEST_SCHEMA_VERSION,
        storyId: doc.id,
        baseUrl: "https://127.0.0.1/voice",
        lines: { [beatIds.b1]: { url: "b1.ogg" } },
    }), null);
    assert.equal(parseStoryVoiceManifest({
        schema: STORY_VOICE_MANIFEST_SCHEMA_VERSION,
        storyId: doc.id,
        lines: { [beatIds.b1]: { url: "http://insecure.example.com/b1.ogg" } },
    }), null);

    // 8e: Strict HTTPS + private/loopback IP URL safety checks
    assert.equal(isSafeVoiceManifestUrl("https://assets.pjsk.moe/sekai-tts-audio/custom/manifest.json"), true);
    assert.equal(isSafeVoiceManifestUrl("/voice/manifest.json"), true);
    assert.equal(isSafeVoiceManifestUrl("http://assets.pjsk.moe/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("http://localhost:8080/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://localhost/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://127.0.0.1/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://10.0.0.5/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://172.16.0.1/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://192.168.1.1/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://169.254.169.254/latest/meta-data"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[::1]/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[::ffff:127.0.0.1]/a.ogg"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[::ffff:10.0.0.1]/a.ogg"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[::ffff:169.254.169.254]/a.ogg"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[::ffff:192.168.1.1]/a.ogg"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[0:0:0:0:0:ffff:127.0.0.1]/a.ogg"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[::127.0.0.1]/a.ogg"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[64:ff9b::127.0.0.1]/a.ogg"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[fc00::1]/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[fe80::1]/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://[ff02::1]/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://0x7f000001/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://2130706433/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://seaweedfs/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("https://user:pass@cdn.example.com/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("//evil.example/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("/../secret/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("javascript:alert(1)"), false);
    assert.equal(isSafeVoiceManifestUrl("file:///C:/manifest.json"), false);
    assert.equal(isSafeVoiceManifestUrl("data:application/json,{}"), false);
    assert.equal(isSafeVoiceManifestUrl("   "), false);

    // 8f: Artifact detection + beat-ID match summary + .story.json round-trip preserving locales
    const jaPack = {
        schema: STORY_I18N_SCHEMA_VERSION,
        locale: "ja-JP",
        translationMeta: { origin: "ai_assisted", modelHint: "TestModel" },
        meta: { title: "屋上での小さな約束" },
        beats: {
            [beatIds.b1]: {
                srcHash: extracted.beatById[beatIds.b1].srcHash,
                body: "こんにちは、今日の風は気持ちいいね！",
            },
        },
    };
    const docWithPack = upsertStoryLocalePack(doc, jaPack);

    assert.equal(detectJsonArtifactKind(docWithPack), "story");
    assert.equal(detectJsonArtifactKind(jaPack), "localePack");
    assert.equal(detectJsonArtifactKind(customManifest), "voiceManifest");
    assert.equal(detectJsonArtifactKind({ schema: "unknown/99" }), "unknown");
    assert.equal(detectJsonArtifactKind(null), "unknown");
    assert.equal(detectJsonArtifactKind(["not", "an", "object"]), "unknown");

    const match = matchVoiceManifestToDoc(docWithPack, customManifest);
    assert.equal(match.totalManifestLines, 4);
    assert.equal(match.totalTalkBeats, 4);
    assert.equal(match.matchedCount, 3);
    assert.deepEqual(match.matchedBeatIds, [beatIds.b1, beatIds.b2, beatIds.b3]);
    assert.equal(match.storyIdMismatch, false);

    const mismatchedDoc = createStoryDocument("jp", "另一个不相关的草稿");
    const zeroMatch = matchVoiceManifestToDoc(mismatchedDoc, customManifest);
    assert.equal(zeroMatch.matchedCount, 0);
    assert.equal(zeroMatch.storyIdMismatch, true);

    const imported = parseStoryJson(JSON.stringify(docWithPack));
    assert.equal(imported.ok, true);
    if (imported.ok) {
        assert.equal(imported.doc.sourceLocale, "zh-CN");
        assert.equal(imported.doc.locales?.["ja-JP"]?.translationMeta.origin, "ai_assisted");
        assert.equal(
            imported.doc.locales?.["ja-JP"]?.beats[beatIds.b1]?.body,
            "こんにちは、今日の風は気持ちいいね！",
        );
        assert.deepEqual(
            getAvailableStoryLocales(imported.doc).map(item => item.locale),
            ["zh-CN", "ja-JP"],
        );
    }
});

// ==================== 9. Backward Compatibility & Whitelist Stripping ====================

test("9. Legacy v2 docs & .msk scripts round-trip cleanly; lang= preserved; removed TTS fields stripped", () => {
    let legacy = createStoryDocument("jp", "Legacy Story");
    legacy = addCastMember(legacy, { key: "ichika", name: "Ichika", modelId: "01ichika_unit", characterId: 1 });
    const sc = createNode(legacy, "scene", { x: 200, y: 100 });
    legacy = sc.doc;
    legacy = insertBeat(legacy, sc.node.id, {
        ...createSceneBeat("talk", legacy),
        speakerKey: "ichika",
        body: "Hello!",
    });
    legacy = connectEdge(legacy, legacy.startNodeId, "out", sc.node.id);

    // 9a: Legacy doc without sourceLocale emits no lang= and round-trips cleanly
    const legacyScript = serializeStoryScript(legacy);
    assert.doesNotMatch(legacyScript, /\blang=/);
    assert.equal(inferStorySourceLocale(legacy), "en-US");
    const reparsedLegacy = parseStoryScript(legacyScript);
    assert.equal(reparsedLegacy.ok, true);
    assert.equal(validateStoryDocument(reparsedLegacy.doc).ok, true);
    assert.equal(compileStoryGraph(reparsedLegacy.doc).ok, true);

    // 9b: Modern doc with sourceLocale round-trips lang= in .msk
    const modern = setStorySourceLocale(legacy, "zh-CN");
    const modernScript = serializeStoryScript(modern);
    assert.match(modernScript, /lang=zh-CN/);
    const reparsedModern = parseStoryScript(modernScript);
    assert.equal(reparsedModern.ok, true, JSON.stringify(reparsedModern.diagnostics));
    assert.equal(reparsedModern.doc.sourceLocale, "zh-CN");

    // 9c: Legacy JSON containing old TTS fields (`voiceId`, `tts`, `emotion`, `read`) is cleanly stripped on import
    const scNode = modern.nodes[sc.node.id];
    const firstBeatId = scNode.type === "scene" ? scNode.beats[0].id : "b_0";
    const legacyWithOldTts = {
        ...modern,
        cast: modern.cast.map(m => ({ ...m, voiceId: "pjsk_01_ichika" })),
        nodes: {
            ...modern.nodes,
            [sc.node.id]: scNode.type === "scene"
                ? {
                    ...scNode,
                    beats: scNode.beats.map(b => (
                        b.kind === "talk"
                            ? { ...b, tts: { disabled: true, emotion: "優しく", read: "はろー" } }
                            : b
                    )),
                }
                : scNode,
        },
        locales: {
            "ja-JP": {
                schema: STORY_I18N_SCHEMA_VERSION,
                storyId: modern.id,
                locale: "ja-JP",
                translationMeta: { origin: "human" },
                beats: {
                    [firstBeatId]: {
                        srcHash: computeBeatSrcHash("Hello!"),
                        body: "こんにちは！",
                        emotion: "明るく",
                        read: "こんにちは",
                    },
                },
            },
        },
    };
    const stripped = validateStoryDocument(legacyWithOldTts);
    assert.equal(stripped.ok, true);
    if (stripped.ok) {
        assert.equal("voiceId" in stripped.doc.cast[0], false);
        const checkedScene = stripped.doc.nodes[sc.node.id];
        if (checkedScene.type === "scene" && checkedScene.beats[0].kind === "talk") {
            assert.equal("tts" in checkedScene.beats[0], false);
        }
        const checkedBeat = stripped.doc.locales?.["ja-JP"]?.beats[firstBeatId];
        assert.equal(checkedBeat?.body, "こんにちは！");
        assert.equal("emotion" in (checkedBeat ?? {}), false);
        assert.equal("read" in (checkedBeat ?? {}), false);
    }

    // 9d: validateStoryDocument rejects "original" in doc.locales.* & upsertStoryLocalePack ignores sourceLocale overlay
    const badOriginDoc = {
        ...modern,
        locales: {
            "ja-JP": {
                schema: STORY_I18N_SCHEMA_VERSION,
                locale: "ja-JP",
                translationMeta: { origin: "original" },
                beats: {},
            },
        },
    };
    assert.equal(validateStoryDocument(badOriginDoc).ok, false);

    const unchangedDoc = upsertStoryLocalePack(modern, {
        schema: STORY_I18N_SCHEMA_VERSION,
        storyId: modern.id,
        locale: "zh-CN",
        translationMeta: { origin: "human" },
        beats: {},
    });
    assert.equal(unchangedDoc.locales?.["zh-CN"], undefined);
});

test("10. parseStoryVoiceManifest accepts backend-compatible beat IDs ([A-Za-z0-9_.:-]{1,128}) and drops unsafe/overlong ones", () => {
    const longBeatId = "scene_01." + "b".repeat(119); // 128 chars
    const tooLongBeatId = "b".repeat(129);
    const parsed = parseStoryVoiceManifest({
        schema: STORY_VOICE_MANIFEST_SCHEMA_VERSION,
        storyId: "story_1",
        baseUrl: "https://cdn.example.com/audio",
        lines: {
            "scene.1:beat_001": { objectKey: "clips/1.ogg" },
            [longBeatId]: { objectKey: "clips/long.ogg" },
            [tooLongBeatId]: { objectKey: "clips/too_long.ogg" },
            "bad/beat": { objectKey: "clips/bad.ogg" },
        },
    });
    assert.ok(parsed);
    assert.ok(parsed.lines["scene.1:beat_001"]);
    assert.ok(parsed.lines[longBeatId]);
    assert.equal(parsed.lines[tooLongBeatId], undefined);
    assert.equal(parsed.lines["bad/beat"], undefined);
});
