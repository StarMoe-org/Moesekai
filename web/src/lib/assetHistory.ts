/**
 * The version history of a view of the asset site and the changes of each version: the
 * `version-history` and `version-changes` documents (version 1) the site serves at
 * `/history/<server>/<view>` and `/changes/<server>/<view>@<version>`, as gzip-compressed JSON.
 */

const HISTORY_FORMAT = "version-history";
const CHANGES_FORMAT = "version-changes";
const FORMAT_VERSION = 1;

/** The view whose versions the asset versions page follows: the files under the game's paths. */
export const HISTORY_VIEW = "storage";

/** One published version of a view, newest first in the history. */
export interface VersionEntry {
    published_version: string;
    revision: string;
    /** RFC 3339, left out when not known. */
    published_at?: string;
    files: number;
    /** The three counts are left out together when the changes of the version are not known. */
    added?: number;
    removed?: number;
    changed?: number;
}

export type ChangeKind = "added" | "removed" | "changed";

export interface ChangedFile {
    kind: ChangeKind;
    path: string;
    size: number;
    media_type?: string;
    previous_size?: number;
}

/** The files a version added, removed and changed since the version before it (`from`). */
export interface VersionChanges {
    from: string;
    to: string;
    files: ChangedFile[];
}

/** How many files the version changed in all, or undefined when its changes are not known. */
export function changeCount(entry: VersionEntry): number | undefined {
    if (entry.added === undefined || entry.removed === undefined || entry.changed === undefined) return undefined;
    return entry.added + entry.removed + entry.changed;
}

/** The versions of `server`'s view, newest first. */
export async function fetchVersionHistory(origin: string, server: string): Promise<VersionEntry[]> {
    const json = await fetchGzipJson(`${origin}/history/${server}/${HISTORY_VIEW}`);
    if (json === null) return [];
    return (checkFormat(json, HISTORY_FORMAT) as { entries?: VersionEntry[] }).entries ?? [];
}

/** The changes of `version`, or null when the site has none for it (such as the first version). */
export async function fetchVersionChanges(origin: string, server: string, version: string): Promise<VersionChanges | null> {
    const json = await fetchGzipJson(`${origin}/changes/${server}/${HISTORY_VIEW}@${encodeURIComponent(version)}`);
    if (json === null) return null;
    const doc = checkFormat(json, CHANGES_FORMAT) as {
        from: string;
        to: string;
        added?: Omit<ChangedFile, "kind">[];
        removed?: Omit<ChangedFile, "kind">[];
        changed?: Omit<ChangedFile, "kind">[];
    };
    const rows = (kind: ChangeKind, list: Omit<ChangedFile, "kind">[] = []) => list.map(row => ({ ...row, kind }));
    return {
        from: doc.from,
        to: doc.to,
        files: [...rows("added", doc.added), ...rows("changed", doc.changed), ...rows("removed", doc.removed)],
    };
}

/** The file at `path` in `version`, which stays the same bytes as long as the version exists. */
export function versionFileUrl(origin: string, server: string, version: string, path: string): string {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return `${origin}/${HISTORY_VIEW}/${server}@${encodeURIComponent(version)}/${encodedPath}`;
}

/** Where a changed file can be read: a removed file only in the version before. */
export function changedFileUrl(origin: string, server: string, changes: VersionChanges, file: ChangedFile): string {
    return versionFileUrl(origin, server, file.kind === "removed" ? changes.from : changes.to, file.path);
}

/** The JSON of a gzip-compressed document, or null when the site answers 404. */
async function fetchGzipJson(url: string): Promise<unknown | null> {
    const response = await fetch(url);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error("Empty response");
    return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
}

function checkFormat(json: unknown, format: string): unknown {
    const header = json as { format?: unknown; version?: unknown } | null;
    if (header?.format !== format || header.version !== FORMAT_VERSION) {
        throw new Error(`Unsupported ${format}: format ${String(header?.format)}, version ${String(header?.version)}`);
    }
    return json;
}
