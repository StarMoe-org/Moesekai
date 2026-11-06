import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BASELINE_VERSION, deriveVersion, nextReleaseTag, resolveVersion } from "../scripts/resolve-version.mjs";

test("deriveVersion increments from the baseline before the first tag", () => {
    assert.equal(deriveVersion(null, 0), BASELINE_VERSION);
    assert.equal(deriveVersion(null, 123), "2.0.123");
    assert.equal(deriveVersion("not-a-tag", 5), BASELINE_VERSION);
});

test("deriveVersion auto-bumps patch by commits since the tag", () => {
    assert.equal(deriveVersion("v2.0.0", 0), "2.0.0");
    assert.equal(deriveVersion("v2.0.0", 1), "2.0.1");
    assert.equal(deriveVersion("v2.0.0", 37), "2.0.37");
    assert.equal(deriveVersion("v2.3.4", 3), "2.3.7");
    assert.equal(deriveVersion("v2.3.4", -1), "2.3.4");
});

test("nextReleaseTag never goes backwards from the derived version", () => {
    // The first release tags the baseline commit, not the current HEAD.
    assert.equal(nextReleaseTag(null, 0, "patch"), "v2.0.0");
    assert.equal(nextReleaseTag(null, 999, "minor"), "v2.0.0");
    assert.equal(nextReleaseTag(null, 999, "major"), "v2.0.0");
    // Exactly on a tag.
    assert.equal(nextReleaseTag("v2.0.0", 0, "patch"), "v2.0.1");
    assert.equal(nextReleaseTag("v2.0.0", 0, "minor"), "v2.1.0");
    assert.equal(nextReleaseTag("v2.0.0", 0, "major"), "v3.0.0");
    // 37 commits after v2.0.0 already display as 2.0.37, so the next patch
    // tag must be v2.0.38 — not v2.0.1 — to stay monotonic and collision-free.
    assert.equal(nextReleaseTag("v2.0.0", 37, "patch"), "v2.0.38");
    assert.equal(nextReleaseTag("v2.0.0", 37, "minor"), "v2.1.0");
    assert.equal(nextReleaseTag("v2.0.0", 37, "major"), "v3.0.0");
});

test("resolveVersion derives the version from a real git history", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "moesekai-version-"));
    try {
        const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
        git(["init", "-q", "-b", "main"]);
        git(["config", "user.email", "test@example.com"]);
        git(["config", "user.name", "Test"]);
        git(["commit", "-q", "--allow-empty", "-m", "first"]);

        let info = resolveVersion(dir);
        assert.equal(info.tag, null);
        assert.equal(info.version, BASELINE_VERSION);
        assert.equal(info.isRelease, false);
        assert.match(info.commit, /^[0-9a-f]{40}$/);

        const baseline = info.commit;
        git(["commit", "-q", "--allow-empty", "-m", "before first release"]);
        const beforeRelease = resolveVersion(dir, baseline);
        assert.equal(beforeRelease.commitsSince, 1);
        assert.equal(beforeRelease.version, "2.0.1");
        assert.equal(nextReleaseTag(beforeRelease.tag, beforeRelease.commitsSince, "patch"), "v2.0.0");
        git(["tag", "v2.0.0", baseline]);
        assert.equal(resolveVersion(dir, baseline).version, beforeRelease.version);
        git(["tag", "-d", "v2.0.0"]);

        git(["tag", "-a", "v2.0.0", "-m", "Moesekai v2.0.0"]);
        info = resolveVersion(dir);
        assert.equal(info.tag, "v2.0.0");
        assert.equal(info.version, "2.0.0");
        assert.equal(info.isRelease, true);

        git(["commit", "-q", "--allow-empty", "-m", "second"]);
        git(["commit", "-q", "--allow-empty", "-m", "third"]);
        info = resolveVersion(dir);
        assert.equal(info.version, "2.0.2");
        assert.equal(info.commitsSince, 2);
        assert.equal(info.isRelease, false);

        // Prerelease / non-semver tags must not become the base tag.
        git(["tag", "v9.9.9-beta.1"]);
        git(["tag", "random-tag"]);
        info = resolveVersion(dir);
        assert.equal(info.tag, "v2.0.0");
        assert.equal(info.version, "2.0.2");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("MOESEKAI_VERSION env override wins (Docker / CI without .git)", () => {
    const previous = process.env.MOESEKAI_VERSION;
    process.env.MOESEKAI_VERSION = "v2.0.42";
    try {
        const info = resolveVersion("/nonexistent");
        assert.equal(info.version, "2.0.42");
    } finally {
        if (previous === undefined) delete process.env.MOESEKAI_VERSION;
        else process.env.MOESEKAI_VERSION = previous;
    }
});
