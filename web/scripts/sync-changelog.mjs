#!/usr/bin/env node
/**
 * Copy the repository-root CHANGELOG.md (source of truth) to the checked-in
 * snapshot at web/src/data/changelog.md, which /changelog falls back to when
 * the root file is not present at build time. No-ops when the root file is
 * missing (e.g. a web-only checkout), keeping the existing snapshot.
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(webRoot, "..", "CHANGELOG.md");
const target = path.join(webRoot, "src", "data", "changelog.md");

if (existsSync(source)) {
    copyFileSync(source, target);
    console.log(`[sync-changelog] ${path.relative(webRoot, source)} -> src/data/changelog.md`);
} else {
    console.log("[sync-changelog] root CHANGELOG.md not found; keeping existing snapshot");
}
