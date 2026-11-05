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
