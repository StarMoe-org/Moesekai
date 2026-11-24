/** Build-time snapshot of curated notes and recent commits. */
import changelogBuild from "../data/changelog-build.json" with { type: "json" };

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
    const commits = changelogBuild.commits.map(({ sha, date, subject }) => ({
        title: `${date} · ${sha.slice(0, 7)}`,
        version: null,
        // Treat commit subjects as plain text rather than author-supplied Markdown.
        body: subject.replace(/[\\`*_{}\[\]<>#!|]/g, "\\$&"),
    }));
    return [...commits, ...parseChangelog(changelogBuild.markdown)];
}
