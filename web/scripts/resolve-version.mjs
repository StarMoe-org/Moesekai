#!/usr/bin/env node
/**
 * CLI twin of web/src/lib/build-version.ts (keep the pure helpers in sync).
 *
 * Usage:
 *   node web/scripts/resolve-version.mjs              # human-readable summary
 *   node web/scripts/resolve-version.mjs --json       # JSON for scripts
 *   node web/scripts/resolve-version.mjs --shell      # KEY=value lines (CI $GITHUB_OUTPUT)
 *   node web/scripts/resolve-version.mjs --next-tag patch|minor|major
 *
 * Versioning model (docs/VERSIONING.md): the latest strict semver git tag vX.Y.Z
 * is the only source of truth; the displayed version is X.Y.(Z + commits since
 * the tag), so every commit auto-bumps the small version with no file edits.
 * Before the first tag, commits since the v2.0.0 baseline commit are counted.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const BASELINE_VERSION = "2.0.0";

const BASELINE_COMMIT = "fb4767c9543ac65f69a91b99cb23146e111e046a";

const STRICT_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const STRICT_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function parseSemver(value) {
    const match = STRICT_VERSION_PATTERN.exec(value);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function deriveVersion(tag, commitsSince) {
    if (!tag) return `2.0.${Number.isFinite(commitsSince) && commitsSince > 0 ? Math.floor(commitsSince) : 0}`;
    const match = STRICT_TAG_PATTERN.exec(tag);
    if (!match) return BASELINE_VERSION;
    const count = Number.isFinite(commitsSince) && commitsSince > 0 ? Math.floor(commitsSince) : 0;
    return `${match[1]}.${match[2]}.${Number(match[3]) + count}`;
}

export function nextReleaseTag(tag, commitsSince, bump) {
    if (!tag) return `v${BASELINE_VERSION}`;
    const derived = parseSemver(deriveVersion(tag, commitsSince));
    if (!derived) return `v${BASELINE_VERSION}`;
    const [major, minor, patch] = derived;
    if (bump === "major") return `v${major + 1}.0.0`;
    if (bump === "minor") return `v${major}.${minor + 1}.0`;
    return `v${major}.${minor}.${patch + 1}`;
}

function git(args, cwd) {
    try {
        return execFileSync("git", args, {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 10_000,
        }).trim();
    } catch {
        return null;
    }
}

export function resolveVersion(cwd = process.cwd(), baselineCommit = BASELINE_COMMIT) {
    const raw = (process.env.MOESEKAI_VERSION || "").trim().replace(/^v/, "");
    if (raw && parseSemver(raw)) {
        const tag = (process.env.MOESEKAI_RELEASE_TAG || "").trim();
        return {
            version: raw,
            tag: STRICT_TAG_PATTERN.test(tag) ? tag : null,
            commitsSince: Number.parseInt(process.env.MOESEKAI_COMMITS_SINCE || "", 10) || 0,
            commit: (process.env.MOESEKAI_COMMIT || "").trim(),
            buildDate: (process.env.MOESEKAI_BUILD_DATE || "").trim() || new Date().toISOString().slice(0, 10),
            isRelease: process.env.MOESEKAI_IS_RELEASE === "1",
        };
    }

    const commit = git(["rev-parse", "HEAD"], cwd) || "";
    const buildDate = new Date().toISOString().slice(0, 10);
    const tags = git(["tag", "--merged", "HEAD", "--list", "v*", "--sort=-version:refname"], cwd);
    const tag = tags?.split("\n").map((line) => line.trim()).find((line) => STRICT_TAG_PATTERN.test(line)) ?? null;

    if (!tag) {
        const total = Number.parseInt(git(["rev-list", "--count", `${baselineCommit}..HEAD`], cwd) || "", 10);
        return {
            version: deriveVersion(null, Number.isFinite(total) ? total : 0),
            tag: null,
            commitsSince: Number.isFinite(total) ? total : 0,
            commit,
            buildDate,
            isRelease: false,
        };
    }

    const since = Number.parseInt(git(["rev-list", "--count", `${tag}..HEAD`], cwd) || "", 10);
    const commitsSince = Number.isFinite(since) ? since : 0;
    return {
        version: deriveVersion(tag, commitsSince),
        tag,
        commitsSince,
        commit,
        buildDate,
        isRelease: commitsSince === 0,
    };
}

function main(argv) {
    const info = resolveVersion();
    const nextTagIndex = argv.indexOf("--next-tag");
    if (nextTagIndex >= 0) {
        const bump = argv[nextTagIndex + 1] || "patch";
        if (!["patch", "minor", "major"].includes(bump)) {
            console.error(`Invalid bump "${bump}" (expected patch|minor|major)`);
            process.exit(1);
        }
        console.log(nextReleaseTag(info.tag, info.commitsSince, bump));
        return;
    }
    if (argv.includes("--json")) {
        console.log(JSON.stringify(info, null, 2));
        return;
    }
    if (argv.includes("--shell")) {
        console.log(`version=${info.version}`);
        console.log(`tag=${info.tag ?? ""}`);
        console.log(`commits_since=${info.commitsSince}`);
        console.log(`commit=${info.commit}`);
        console.log(`build_date=${info.buildDate}`);
        console.log(`is_release=${info.isRelease ? "1" : ""}`);
        return;
    }
    console.log(`Moesekai v${info.version}`);
    console.log(`  base tag:      ${info.tag ?? "(none — baseline)"}`);
    console.log(`  commits since: ${info.commitsSince}${info.isRelease ? " (exactly on tag)" : ""}`);
    console.log(`  commit:        ${info.commit || "(unknown)"}`);
    console.log(`  build date:    ${info.buildDate}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main(process.argv.slice(2));
}
