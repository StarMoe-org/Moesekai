// Copies the Live2D story player's vendored release (web/vendor/sse-web) to
// public/sse-web/<release>/, where the browser loads it from: its workers have to be
// same-origin with the page and find each other by relative paths, so the release is served as
// it is and not bundled. Run by `copy:wasm`, before dev and build.
//
// Fails when the vendored files are not what their manifest lists, or when
// src/lib/sseWeb/release.ts names another release (run scripts/sync-sse-web.mjs).
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_DIR, readRelease, releaseId, releaseSource, RELEASE_FILE, VENDOR_DIR } from "./sse-web-release.mjs";

try {
    const manifest = readRelease(VENDOR_DIR);
    if (readFileSync(RELEASE_FILE, "utf8") !== releaseSource(manifest)) {
        throw new Error("src/lib/sseWeb/release.ts does not name the release in vendor/sse-web; update both with scripts/sync-sse-web.mjs");
    }
    const id = releaseId(manifest);
    rmSync(PUBLIC_DIR, { recursive: true, force: true });
    mkdirSync(PUBLIC_DIR, { recursive: true });
    cpSync(VENDOR_DIR, join(PUBLIC_DIR, id), { recursive: true });
    console.log(`[sse-web] vendor/sse-web (commit ${manifest.commit.slice(0, 12)}) -> public/sse-web/${id}/`);
} catch (error) {
    console.error(`[sse-web] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
}
