import assert from "node:assert/strict";
import test from "node:test";
import { parseChangelog } from "../src/lib/changelog.ts";

const SAMPLE = [
    "# MoeSekai Changelog",
    "",
    "Intro paragraph before the first release entry.",
    "",
    "## v2.0.0 - First stable release",
    "",
    "### Added",
    "",
    "- On-site changelog page",
    "",
    "## v1.2.3 - Bugfix release",
    "",
    "- Fixed a crash",
    "",
    "## 2026-01-01 - Maintenance",
    "",
    "- Routine maintenance",
    "",
].join("\n");

test("parseChangelog splits entries on level-2 headings and skips the preamble", () => {
    const entries = parseChangelog(SAMPLE);
    assert.equal(entries.length, 3);
    assert.ok(entries[0].body.includes("On-site changelog page"));
    assert.ok(entries[1].body.includes("Fixed a crash"));
});

test("parseChangelog extracts the semver from versioned headings", () => {
    const entries = parseChangelog(SAMPLE);
    assert.equal(entries[0].version, "v2.0.0");
    assert.equal(entries[1].version, "v1.2.3");
    assert.equal(entries[0].title, "v2.0.0 - First stable release");
});

test("parseChangelog leaves version null for date-only headings", () => {
    const entries = parseChangelog(SAMPLE);
    assert.equal(entries[2].version, null);
    assert.equal(entries[2].title, "2026-01-01 - Maintenance");
});

test("parseChangelog returns an empty list without release headings", () => {
    assert.deepEqual(parseChangelog(""), []);
    assert.deepEqual(parseChangelog("# Title\n\nJust an intro.\n"), []);
});

test("build snapshot embeds commits alongside curated release notes", async () => {
    const { getChangelogEntries } = await import("../src/lib/changelog.ts");
    const snapshot = JSON.parse((await import("node:fs")).readFileSync(new URL("../src/data/changelog-build.json", import.meta.url), "utf8"));
    const entries = getChangelogEntries();
    assert.ok(snapshot.commits.length > 0);
    assert.ok(entries[0].title.includes(snapshot.commits[0].sha.slice(0, 7)));
    assert.ok(entries.some((entry) => entry.version === "v2.0.0"));
});

test("sync embeds git history and preserves it when git is unavailable", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");
    const path = (await import("node:path")).default;
    const dir = mkdtempSync(path.join((await import("node:os")).tmpdir(), "moesekai-changelog-"));
    try {
        mkdirSync(path.join(dir, "web/scripts"), { recursive: true });
        mkdirSync(path.join(dir, "web/src/data"), { recursive: true });
        copyFileSync(new URL("../scripts/sync-changelog.mjs", import.meta.url), path.join(dir, "web/scripts/sync-changelog.mjs"));
        writeFileSync(path.join(dir, "CHANGELOG.md"), "# Notes\n\n## v2.0.0\n\nRelease\n");
        const git = (args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
        git(["init", "-q"]);
        git(["config", "user.email", "test@example.com"]);
        git(["config", "user.name", "Test"]);
        git(["commit", "-q", "--allow-empty", "-m", "A recent change"]);
        const run = () => execFileSync(process.execPath, [path.join(dir, "web/scripts/sync-changelog.mjs")], { cwd: dir, stdio: "ignore" });
        run();
        const target = path.join(dir, "web/src/data/changelog-build.json");
        const first = JSON.parse(readFileSync(target, "utf8"));
        assert.equal(first.commits[0].subject, "A recent change");
        assert.match(first.markdown, /v2\.0\.0/);
        rmSync(path.join(dir, ".git"), { recursive: true });
        run();
        assert.deepEqual(JSON.parse(readFileSync(target, "utf8")).commits, first.commits);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
