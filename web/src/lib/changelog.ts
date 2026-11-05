/**
 * On-site changelog (/changelog), so readers do not need GitHub access.
 *
 * Source of truth is the repository-root CHANGELOG.md. This module reads it
 * when available (local dev and the Docker build, which copies it next to
 * web/), and falls back to the checked-in snapshot at src/data/changelog.md.
 * Refresh the snapshot after editing the root file with:
 *   npm run sync:changelog
 * (also wired into the web build/dev scripts).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ChangelogEntry {
    /** Full heading text, e.g. "v2.0.0 — release notes title". */
    title: string;
    /** Semver extracted from the heading ("v2.0.0"), or null for date-only entries. */
    version: string | null;
    /** Markdown body below the heading. */
    body: string;
}

const VERSION_PATTERN = /^v(\d+\.\d+\.\d+)\b/;

export function parseChangelog(markdown: string): ChangelogEntry[] {
    const sections = markdown.split(/^## /m);
    const entries: ChangelogEntry[] = [];
    // sections[0] is the top-level "# ..." preamble before the first entry.
    for (const section of sections.slice(1)) {
        const newline = section.indexOf("\n");
        if (newline < 0) continue;
        const title = section.slice(0, newline).trim();
        const body = section.slice(newline + 1).trim();
        if (!title) continue;
        const match = VERSION_PATTERN.exec(title);
        entries.push({ title, version: match ? `v${match[1]}` : null, body });
    }
    return entries;
}

export function getChangelogEntries(): ChangelogEntry[] {
    const candidates = [
        path.join(process.cwd(), "..", "CHANGELOG.md"),
        path.join(process.cwd(), "CHANGELOG.md"),
        path.join(process.cwd(), "src", "data", "changelog.md"),
    ];
    for (const candidate of candidates) {
        try {
            if (existsSync(candidate)) return parseChangelog(readFileSync(candidate, "utf8"));
        } catch {
            // Try the next candidate.
        }
    }
    return [];
}
