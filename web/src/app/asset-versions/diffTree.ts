import type { ChangeCause, ChangedFile } from "@/lib/assetHistory";
import type { DirectoryTreeNodeLike } from "@/components/common/DirectoryTreeSidebar";

export type DiffMediaCategory = "image" | "audio" | "video" | "text" | "other";

/** What a change follows from, `unknown` where its document does not tell. */
export type DiffCause = ChangeCause | "unknown";

export interface DiffCounts {
    total: number;
    added: number;
    changed: number;
    removed: number;
    /** How many of them only the conversion made. */
    conversion: number;
}

export interface DiffDirectoryNode extends DirectoryTreeNodeLike {
    name: string;
    path: string;
    directories: DiffDirectoryNode[];
    files: ChangedFile[];
    counts: DiffCounts;
}

export interface DiffDirectoryListing {
    folders: DiffDirectoryNode[];
    files: ChangedFile[];
}

export function getFileName(path: string): string {
    const slash = path.lastIndexOf("/");
    return slash === -1 ? path : path.slice(slash + 1);
}

export function getFileExtension(path: string): string {
    const name = getFileName(path);
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function getDiffMediaCategory(file: Pick<ChangedFile, "path" | "media_type">): DiffMediaCategory {
    const media = file.media_type ?? "";
    if (media.startsWith("image/")) return "image";
    if (media.startsWith("audio/")) return "audio";
    if (media.startsWith("video/")) return "video";
    if (media.startsWith("text/") || media === "application/json") return "text";

    const ext = getFileExtension(file.path);
    if (["png", "jpg", "jpeg", "webp", "gif", "svg", "ico"].includes(ext)) return "image";
    if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) return "audio";
    if (["mp4", "webm", "mov", "mkv"].includes(ext)) return "video";
    if (["json", "txt", "csv", "xml", "yaml", "yml"].includes(ext)) return "text";
    return "other";
}

export function getDiffCause(file: Pick<ChangedFile, "cause">): DiffCause {
    return file.cause ?? "unknown";
}

export function countDiffCauses(files: ChangedFile[]): Record<DiffCause, number> {
    const counts: Record<DiffCause, number> = { source: 0, conversion: 0, unknown: 0 };
    for (const file of files) {
        counts[getDiffCause(file)] += 1;
    }
    return counts;
}

function emptyCounts(): DiffCounts {
    return { total: 0, added: 0, changed: 0, removed: 0, conversion: 0 };
}

function countFile(counts: DiffCounts, file: ChangedFile) {
    counts.total += 1;
    counts[file.kind] += 1;
    if (file.cause === "conversion") counts.conversion += 1;
}

function createNode(name: string, path: string): DiffDirectoryNode {
    return {
        name,
        path,
        directories: [],
        files: [],
        counts: emptyCounts(),
    };
}

/** Builds a navigable directory tree from flat changed file records. */
export function buildDiffDirectoryTree(files: ChangedFile[]): DiffDirectoryNode {
    const root = createNode("", "");
    const childMaps = new WeakMap<DiffDirectoryNode, Map<string, DiffDirectoryNode>>();

    const getChildMap = (node: DiffDirectoryNode) => {
        let map = childMaps.get(node);
        if (!map) {
            map = new Map<string, DiffDirectoryNode>();
            childMaps.set(node, map);
        }
        return map;
    };

    for (const file of files) {
        const parts = file.path.split("/").filter(Boolean);
        let current = root;
        countFile(current.counts, file);

        for (let i = 0; i < parts.length - 1; i += 1) {
            const segment = parts[i];
            const map = getChildMap(current);
            let next = map.get(segment);
            if (!next) {
                const nextPath = current.path ? `${current.path}/${segment}` : segment;
                next = createNode(segment, nextPath);
                map.set(segment, next);
                current.directories.push(next);
            }
            current = next;
            countFile(current.counts, file);
        }

        current.files.push(file);
    }

    const sortTree = (node: DiffDirectoryNode) => {
        node.directories.sort((a, b) => a.name.localeCompare(b.name));
        for (const child of node.directories) {
            sortTree(child);
        }
    };
    sortTree(root);

    return root;
}

export function findDiffDirectory(root: DiffDirectoryNode, path: string): DiffDirectoryNode | null {
    const segments = path.split("/").filter(Boolean);
    let current = root;
    for (const segment of segments) {
        const next = current.directories.find((dir) => dir.name === segment);
        if (!next) return null;
        current = next;
    }
    return current;
}

export function listDiffDirectory(root: DiffDirectoryNode, path: string): DiffDirectoryListing {
    const dir = findDiffDirectory(root, path);
    if (!dir) return { folders: [], files: [] };
    return { folders: dir.directories, files: dir.files };
}

export function searchDiffDirectory(root: DiffDirectoryNode, basePath: string, query: string): DiffDirectoryListing {
    const q = query.trim().toLowerCase();
    if (!q) return listDiffDirectory(root, basePath);

    const startDir = findDiffDirectory(root, basePath);
    if (!startDir) return { folders: [], files: [] };

    const folders: DiffDirectoryNode[] = [];
    const files: ChangedFile[] = [];

    const walk = (node: DiffDirectoryNode) => {
        for (const child of node.directories) {
            const relPath = basePath ? child.path.slice(basePath.length + 1) : child.path;
            if (child.name.toLowerCase().includes(q) || relPath.toLowerCase().includes(q)) {
                folders.push(child);
            }
            walk(child);
        }
        for (const file of node.files) {
            const name = getFileName(file.path);
            const relPath = basePath ? file.path.slice(basePath.length + 1) : file.path;
            if (name.toLowerCase().includes(q) || relPath.toLowerCase().includes(q)) {
                files.push(file);
            }
        }
    };

    walk(startDir);
    return { folders, files };
}
