/**
 * The asset versions page's documents (src/lib/assetHistory.ts): the version history and the
 * changes of one version, read as gzip-compressed JSON, and the addresses of their files.
 * Run with: node --test web/tests/asset-history.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";

import { importWebTypeScript } from "./characterization/test-helpers.mjs";

const history = await importWebTypeScript("src/lib/assetHistory.ts");

const SITE = "https://assets.example";

/** Serves `documents` (URL → JSON) gzip-compressed and answers 404 for any other URL. */
function serve(documents) {
    const requested = [];
    globalThis.fetch = async (url) => {
        requested.push(url);
        const doc = documents[url];
        if (doc === undefined) return new Response("not found\n", { status: 404 });
        return new Response(gzipSync(JSON.stringify(doc)), { headers: { "content-type": "application/gzip" } });
    };
    return requested;
}

const ENTRIES = [
    { published_version: "6.1.0.10-b", revision: "bb", published_at: "2026-11-17T08:55:31Z", files: 12, added: 2, removed: 1, changed: 3 },
    { published_version: "6.1.0.0-a", revision: "aa", files: 10 },
];

test("the history lists the versions of the storage view, newest first", async () => {
    const requested = serve({
        [`${SITE}/history/jp/storage`]: { format: "version-history", version: 1, view: "storage", entries: ENTRIES },
    });
    assert.deepEqual(await history.fetchVersionHistory(SITE, "jp"), ENTRIES);
    assert.deepEqual(requested, [`${SITE}/history/jp/storage`]);
});

test("a server without a history has no versions", async () => {
    serve({});
    assert.deepEqual(await history.fetchVersionHistory(SITE, "cn"), []);
});

test("the change count is the sum of the three lists, and unknown without them", () => {
    assert.equal(history.changeCount(ENTRIES[0]), 6);
    assert.equal(history.changeCount(ENTRIES[1]), undefined);
});

test("the changes list added, changed and removed files with their kind", async () => {
    const version = "6.1.0.10-b";
    serve({
        [`${SITE}/changes/jp/storage@${version}`]: {
            format: "version-changes", version: 1, view: "storage", from: "6.1.0.0-a", to: version,
            added: [{ path: "a/new.png", size: 5, media_type: "image/png" }],
            removed: [{ path: "a/old.png", size: 7 }],
            changed: [{ path: "a/same.png", size: 9, previous_size: 8 }],
        },
    });
    const changes = await history.fetchVersionChanges(SITE, "jp", version);
    assert.equal(changes.from, "6.1.0.0-a");
    assert.equal(changes.to, version);
    assert.deepEqual(changes.files.map(file => [file.kind, file.path]), [
        ["added", "a/new.png"], ["changed", "a/same.png"], ["removed", "a/old.png"],
    ]);
    assert.equal(changes.files[1].previous_size, 8);
});

test("a version without a change record has no changes", async () => {
    serve({});
    assert.equal(await history.fetchVersionChanges(SITE, "jp", "6.1.0.0-a"), null);
});

test("a history of version 2 counts the changes that only the conversion made", async () => {
    const entries = [
        { ...ENTRIES[0], conversion: { added: 0, removed: 1, changed: 2 } },
        { published_version: "6.1.0.5-c", revision: "cc", files: 11, added: 1, removed: 0, changed: 0 },
    ];
    serve({ [`${SITE}/history/jp/storage`]: { format: "version-history", version: 2, view: "storage", entries } });
    assert.deepEqual(await history.fetchVersionHistory(SITE, "jp"), entries);
    assert.equal(history.conversionCount(entries[0]), 3);
    assert.equal(history.conversionCount(entries[1]), undefined);
});

test("the changes of version 2 keep the cause of each file, and leave it out where it is not known", async () => {
    const version = "6.1.0.10-b";
    serve({
        [`${SITE}/changes/jp/storage@${version}`]: {
            format: "version-changes", version: 2, view: "storage", from: "6.1.0.0-a", to: version,
            added: [{ path: "a/new.png", size: 5, media_type: "image/png", cause: "source" }],
            removed: [{ path: "a/old.png", size: 7 }],
            changed: [{ path: "a/same.png", size: 9, previous_size: 8, cause: "conversion" }],
        },
    });
    const changes = await history.fetchVersionChanges(SITE, "jp", version);
    assert.deepEqual(changes.files.map(file => [file.path, file.cause]), [
        ["a/new.png", "source"], ["a/same.png", "conversion"], ["a/old.png", undefined],
    ]);
});

test("a document of another format or version is refused", async () => {
    serve({ [`${SITE}/history/jp/storage`]: { format: "version-history", version: 3, entries: [] } });
    await assert.rejects(history.fetchVersionHistory(SITE, "jp"), /Unsupported version-history/);
    serve({ [`${SITE}/history/jp/storage`]: { format: "directory-listing", version: 1 } });
    await assert.rejects(history.fetchVersionHistory(SITE, "jp"), /Unsupported version-history/);
});

test("other errors are reported", async () => {
    globalThis.fetch = async () => new Response("", { status: 503 });
    await assert.rejects(history.fetchVersionHistory(SITE, "jp"), /HTTP 503/);
});

test("a file is read from its version, and a removed file from the version before", () => {
    const changes = { from: "6.1.0.0-a", to: "6.1.0.10-b", files: [] };
    assert.equal(
        history.changedFileUrl(SITE, "jp", changes, { kind: "added", path: "music/a b/x#1.png", size: 1 }),
        `${SITE}/storage/jp@6.1.0.10-b/music/a%20b/x%231.png`,
    );
    assert.equal(
        history.changedFileUrl(SITE, "jp", changes, { kind: "removed", path: "music/old.png", size: 1 }),
        `${SITE}/storage/jp@6.1.0.0-a/music/old.png`,
    );
});
