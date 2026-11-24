#!/usr/bin/env node
// Embed the curated notes and recent git history at build time. CI runs this
// before Docker (which intentionally excludes .git); web-only builds keep the
// last available commit snapshot rather than erasing it.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.dirname(webRoot);
const source = path.join(repo, "CHANGELOG.md");
const markdownTarget = path.join(webRoot, "src/data/changelog.md");
const jsonTarget = path.join(webRoot, "src/data/changelog-build.json");
const markdown = readFileSync(existsSync(source) ? source : markdownTarget, "utf8");
let commits = existsSync(jsonTarget) ? JSON.parse(readFileSync(jsonTarget, "utf8")).commits : [];
try {
    // The record/field delimiters are stripped by git from commit subjects.
    const raw = execFileSync("git", ["log", "-300", "--format=%H%x00%cs%x00%s%x00"], { cwd: repo, encoding: "utf8" });
    commits = raw.split("\n").filter(Boolean).map((line) => {
        const [sha, date, subject] = line.split("\0");
        return { sha, date, subject };
    });
} catch {
    console.log("[sync-changelog] git history unavailable; retaining snapshot");
}
writeFileSync(markdownTarget, markdown);
writeFileSync(jsonTarget, JSON.stringify({ markdown, commits }, null, 2) + "\n");
console.log(`[sync-changelog] embedded notes and ${commits.length} commits`);
