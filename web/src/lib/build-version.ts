/**
 * Build-time MoeSekai version resolution (Node-only — imported by next.config.ts,
 * never by client code; the client reads the inlined result via "@/lib/app-version").
 *
 * Versioning model (see docs/VERSIONING.md):
 * - The single source of truth is the latest strict semver git tag `vX.Y.Z`.
 * - The displayed version is derived, never stored: patch = tag.patch + number of
 *   commits since that tag, so every commit automatically bumps the small version
 *   (v2.0.0 -> 37 commits later -> 2.0.37) with no extra commits or tags.
 * - Before the first tag exists (or when .git is unavailable, e.g. inside Docker),
 *   BASELINE_VERSION is used. CI passes MOESEKAI_* env overrides computed on the
 *   runner (where .git exists) through Docker build-args.
 *
 * Keep the pure helpers in sync with web/scripts/resolve-version.mjs (the CLI /
 * GitHub Actions twin of this module).
 */
import { execFileSync } from "node:child_process";

/** First formal release and fallback when no tag/env is available. */
export const BASELINE_VERSION = "2.0.0";

export interface BuildVersionInfo {
    /** Derived semver without the leading "v", e.g. "2.0.37". */
    version: string;
    /** Latest reachable strict semver tag, e.g. "v2.0.0", or null before the first release. */
    tag: string | null;
    /** Commits on HEAD since `tag` (total commits when no tag exists). */
    commitsSince: number;
    /** Full commit SHA the build was made from, or "" when unknown. */
    commit: string;
    /** ISO date (yyyy-mm-dd) of the build. */
    buildDate: string;
    /** True when HEAD is exactly on `tag`. */
    isRelease: boolean;
}

const STRICT_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const STRICT_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function parseSemver(value: string): [number, number, number] | null {
    const match = STRICT_VERSION_PATTERN.exec(value);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** patch is raised by the commit count so plain commits auto-bump the small version. */
export function deriveVersion(tag: string | null, commitsSince: number): string {
    if (!tag) return BASELINE_VERSION;
    const match = STRICT_TAG_PATTERN.exec(tag);
    if (!match) return BASELINE_VERSION;
    const count = Number.isFinite(commitsSince) && commitsSince > 0 ? Math.floor(commitsSince) : 0;
    return `${match[1]}.${match[2]}.${Number(match[3]) + count}`;
}

/** The tag a release should create so version numbers never go backwards or collide. */
export function nextReleaseTag(tag: string | null, commitsSince: number, bump: "patch" | "minor" | "major"): string {
    if (!tag) return `v${BASELINE_VERSION}`;
    const derived = parseSemver(deriveVersion(tag, commitsSince));
    if (!derived) return `v${BASELINE_VERSION}`;
    const [major, minor, patch] = derived;
    if (bump === "major") return `v${major + 1}.0.0`;
    if (bump === "minor") return `v${major}.${minor + 1}.0`;
    return `v${major}.${minor}.${patch + 1}`;
}

function git(args: string[]): string | null {
    try {
        return execFileSync("git", args, {
            cwd: process.cwd(),
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 10_000,
        }).trim();
    } catch {
        return null;
    }
}

function envOverride(): BuildVersionInfo | null {
    const raw = (process.env.MOESEKAI_VERSION || "").trim().replace(/^v/, "");
    if (!raw || !parseSemver(raw)) return null;
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

export function resolveBuildVersion(): BuildVersionInfo {
    const override = envOverride();
    if (override) return override;

    const commit = git(["rev-parse", "HEAD"]) || "";
    const buildDate = new Date().toISOString().slice(0, 10);

    // Highest strict semver tag reachable from HEAD (prerelease tags are ignored).
    const tags = git(["tag", "--merged", "HEAD", "--list", "v*", "--sort=-version:refname"]);
    const tag = tags?.split("\n").map((line) => line.trim()).find((line) => STRICT_TAG_PATTERN.test(line)) ?? null;

    if (!tag) {
        const total = Number.parseInt(git(["rev-list", "--count", "HEAD"]) || "", 10);
        return {
            version: BASELINE_VERSION,
            tag: null,
            commitsSince: Number.isFinite(total) ? total : 0,
            commit,
            buildDate,
            isRelease: false,
        };
    }

    const since = Number.parseInt(git(["rev-list", "--count", `${tag}..HEAD`]) || "", 10);
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
