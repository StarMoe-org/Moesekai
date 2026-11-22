import assert from "node:assert/strict";
import test from "node:test";
import {
    STORY_AUDIO_LIMITS,
    buildAudioTarBundle,
    buildSafeArchiveClipPath,
    buildUstarHeader,
    estimateTarArchiveBytes,
    extractTalkBeatsForVoice,
    matchAudioFilesToTalkBeats,
    sha256Hex,
    validateAudioSelection,
} from "../src/lib/storyMaker/audioBundle.ts";
import { connectEdge, createNode, createSceneBeat, createStoryDocument } from "../src/lib/storyMaker/document.ts";

/** Minimal POSIX USTAR parser to verify every header block, checksum, padding, and EOF record. */
function parseUstarTar(bytes) {
    assert.equal(bytes.byteLength % 512, 0, "TAR total size must be a multiple of 512 bytes");
    const files = new Map();
    const decoder = new TextDecoder();
    let offset = 0;

    while (offset < bytes.byteLength) {
        const block = bytes.subarray(offset, offset + 512);
        const allZero = block.every((b) => b === 0);
        if (allZero) {
            // Remaining blocks must be zero EOF padding (at least 2 blocks total)
            const rest = bytes.subarray(offset);
            assert.ok(rest.byteLength >= 1024, "USTAR archive must end with at least 1024 zero bytes");
            assert.ok(rest.every((b) => b === 0), "Trailing EOF padding must be all zeros");
            break;
        }

        const magic = decoder.decode(block.subarray(257, 263));
        assert.equal(magic, "ustar\0", "Expected POSIX ustar magic");
        const version = decoder.decode(block.subarray(263, 265));
        assert.equal(version, "00", "Expected POSIX ustar version '00'");
        assert.equal(block[156], 0x30, "Expected regular file typeflag '0'");

        // Verify header checksum
        const storedChk = parseInt(
            decoder.decode(block.subarray(148, 156)).replace(/\0.*$/, "").trim(),
            8,
        );
        let computed = 0;
        for (let i = 0; i < 512; i += 1) {
            computed += i >= 148 && i < 156 ? 0x20 : block[i];
        }
        assert.equal(storedChk, computed, "TAR header octal checksum mismatch");

        const name = decoder.decode(block.subarray(0, 100)).replace(/\0.*$/, "");
        const size = parseInt(
            decoder.decode(block.subarray(124, 136)).replace(/\0.*$/, "").trim(),
            8,
        );
        const payloadStart = offset + 512;
        const payloadEnd = payloadStart + size;
        files.set(name, bytes.slice(payloadStart, payloadEnd));

        const paddedSize = Math.ceil(size / 512) * 512;
        offset = payloadStart + paddedSize;
    }

    return files;
}

test("1. buildSafeArchiveClipPath sanitizes paths, preserves supported ext, and deduplicates collisions", () => {
    const used = new Set(["index.json"]);
    assert.equal(buildSafeArchiveClipPath("b_001", "voices/b_001.OGG", used), "clips/b_001.ogg");
    assert.equal(buildSafeArchiveClipPath("b_001", "b_001.mp3", used), "clips/b_001.mp3");
    assert.equal(buildSafeArchiveClipPath("b_001", "b_001.ogg", used), "clips/b_001_2.ogg");
    assert.equal(buildSafeArchiveClipPath("../../evil:id/中文", "bad.txt", used), "clips/evil_id.ogg");
    for (const entry of used) {
        assert.ok(!entry.includes(".."), `Path must not contain '..': ${entry}`);
        assert.ok(!entry.includes(":"), `Path must not contain ':': ${entry}`);
        assert.ok(!entry.startsWith("/"), `Path must not start with '/': ${entry}`);
    }
});

test("2. buildUstarHeader rejects unsafe paths and oversized names", () => {
    assert.throws(() => buildUstarHeader("../secret.ogg", 10, 1700000000), /Unsafe TAR entry name/);
    assert.throws(() => buildUstarHeader("/abs/path.ogg", 10, 1700000000), /Unsafe TAR entry name/);
    assert.throws(() => buildUstarHeader("C:\\win.ogg", 10, 1700000000), /Unsafe TAR entry name/);
    assert.throws(() => buildUstarHeader(`${"a".repeat(100)}.ogg`, 10, 1700000000), /exceeds 99 bytes/);
});

test("3. buildAudioTarBundle produces valid zero-copy POSIX USTAR archive matching worker/archive.py index.json", async () => {
    const payload1 = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x11, 0x22, 0x33]); // 9 bytes
    const payload2 = new Uint8Array(1024).fill(0xab); // exact 2-block payload
    const blob1 = new Blob([payload1], { type: "audio/ogg" });
    const blob2 = new Blob([payload2], { type: "audio/mpeg" });

    const sha1 = await sha256Hex(blob1);
    const sha2 = await sha256Hex(blob2);
    assert.match(sha1, /^[0-9a-f]{64}$/);
    assert.match(sha2, /^[0-9a-f]{64}$/);

    const bundle = buildAudioTarBundle(
        [
            {
                beatId: "b_intro_1",
                file: blob1,
                originalFilename: "folder/b_intro_1.ogg",
                rawSha256: sha1,
                speaker: "初音ミク",
            },
            {
                beatId: "b_intro_2",
                file: blob2,
                originalFilename: "b_intro_2.MP3",
                rawSha256: sha2,
            },
        ],
        { nowMs: 1_750_000_000_000 },
    );

    assert.equal(bundle.blob.type, "application/x-tar");
    assert.equal(bundle.blob.size, bundle.archiveSizeBytes);
    assert.equal(bundle.entries.length, 2);

    const rawBytes = new Uint8Array(await bundle.blob.arrayBuffer());
    const extracted = parseUstarTar(rawBytes);

    assert.equal(extracted.size, 3);
    assert.ok(extracted.has("index.json"));
    assert.ok(extracted.has("clips/b_intro_1.ogg"));
    assert.ok(extracted.has("clips/b_intro_2.mp3"));

    assert.deepEqual(extracted.get("clips/b_intro_1.ogg"), payload1);
    assert.deepEqual(extracted.get("clips/b_intro_2.mp3"), payload2);

    const indexJson = JSON.parse(new TextDecoder().decode(extracted.get("index.json")));
    assert.deepEqual(indexJson, {
        clips: [
            {
                beat_id: "b_intro_1",
                filename: "clips/b_intro_1.ogg",
                raw_sha256: sha1,
                speaker: "初音ミク",
            },
            {
                beat_id: "b_intro_2",
                filename: "clips/b_intro_2.mp3",
                raw_sha256: sha2,
            },
        ],
    });
});

test("4. buildAudioTarBundle rejects duplicate beat IDs, bad SHA-256, and empty input", () => {
    const sample = new Blob([new Uint8Array([1, 2, 3])]);
    const validSha = "a".repeat(64);
    assert.throws(() => buildAudioTarBundle([]), /empty audio archive/);
    assert.throws(
        () => buildAudioTarBundle([{ beatId: "b1", file: sample, originalFilename: "b1.ogg", rawSha256: "not-hex" }]),
        /Invalid rawSha256/,
    );
    assert.throws(
        () =>
            buildAudioTarBundle([
                { beatId: "b1", file: sample, originalFilename: "b1.ogg", rawSha256: validSha },
                { beatId: "b1", file: sample, originalFilename: "b1.mp3", rawSha256: validSha },
            ]),
        /Duplicate beatId/,
    );
});

test("5. extractTalkBeatsForVoice and matchAudioFilesToTalkBeats auto-match <beatId>.<ext>", () => {
    let doc = createStoryDocument("jp", "Voice Test");
    const added = createNode(doc, "scene", { x: 240, y: 80 });
    assert.ok(added.node);
    doc = connectEdge(added.doc, doc.startNodeId, "out", added.node.id);
    const scene = doc.nodes[added.node.id];
    assert.ok(scene && scene.type === "scene");
    const b1 = createSceneBeat("talk", doc);
    b1.id = "b_001";
    b1.speakerName = "Miku";
    b1.body = "Hello";
    const b2 = createSceneBeat("talk", doc);
    b2.id = "BeatTwo";
    b2.body = "World";
    scene.beats = [b1, b2];

    const slots = extractTalkBeatsForVoice(doc);
    assert.equal(slots.length, 2);
    assert.equal(slots[0].beatId, "b_001");
    assert.equal(slots[0].speakerName, "Miku");

    const files = [
        { name: "voices/b_001.ogg" },
        { name: "beattwo.WAV" },
        { name: "unknown_beat.mp3" },
        { name: "readme.txt" },
    ];
    const match = matchAudioFilesToTalkBeats(files, slots);
    assert.equal(match.matched.get("b_001")?.name, "voices/b_001.ogg");
    assert.equal(match.matched.get("BeatTwo")?.name, "beattwo.WAV");
    assert.equal(match.unmatched.length, 1);
    assert.equal(match.unmatched[0].name, "unknown_beat.mp3");
    assert.equal(match.unsupported.length, 1);
    assert.equal(match.unsupported[0].name, "readme.txt");
});

test("6. validateAudioSelection enforces single clip duration, total duration, file size, and archive cap", () => {
    assert.deepEqual(
        validateAudioSelection([]).map((i) => i.code),
        ["empty"],
    );

    const ok = validateAudioSelection([
        { beatId: "b1", sizeBytes: 120_000, durationMs: 4_500 },
        { beatId: "b2", sizeBytes: 240_000, durationMs: 12_000 },
    ]);
    assert.equal(ok.length, 0);

    const overClip = validateAudioSelection([
        { beatId: "b1", sizeBytes: STORY_AUDIO_LIMITS.maxSingleFileBytes + 1, durationMs: 61_000 },
    ]);
    assert.deepEqual(
        overClip.map((i) => i.code),
        ["fileTooLarge", "clipTooLong"],
    );

    const manyLong = Array.from({ length: 65 }, (_, idx) => ({
        beatId: `b_${idx}`,
        sizeBytes: 300_000,
        durationMs: 60_000,
    }));
    const overTotal = validateAudioSelection(manyLong);
    assert.ok(overTotal.some((i) => i.code === "totalDurationExceeded"));

    // 1499 clips (with short 1s durations & small files) is allowed; 1500 hits maxArchiveClipFiles (1499)
    const exact1499 = Array.from({ length: STORY_AUDIO_LIMITS.maxArchiveClipFiles }, (_, idx) => ({
        beatId: `b_${idx}`,
        sizeBytes: 2048,
        durationMs: 1000,
    }));
    assert.equal(validateAudioSelection(exact1499).length, 0);

    const over1500 = [...exact1499, { beatId: "b_1499", sizeBytes: 2048, durationMs: 1000 }];
    assert.ok(validateAudioSelection(over1500).some((i) => i.code === "tooManyClips"));

    // Scaled index.json estimate grows proportionally for large clip counts
    const smallEst = estimateTarArchiveBytes([100, 1024]);
    const largeEst = estimateTarArchiveBytes(Array.from({ length: 500 }, () => 1024));
    assert.ok(smallEst > 2048);
    assert.ok(largeEst > 500 * 1536 + 500 * 240);
});
