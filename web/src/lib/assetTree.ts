import { ASSET_DOMAIN_MAIN } from "@/lib/assets";

export const STORAGE_ORIGIN = ASSET_DOMAIN_MAIN;

const TREE_FORMAT = "directory-tree";
const TREE_VERSION = 1;

/** Files of one directory, one column per field; a file is the same index in every column. */
export interface TreeFileColumns {
    names: string[];
    sizes: number[];
    /** Positions in `DirectoryTree.media_types`. */
    media_types: number[];
}

export interface TreeDirectory {
    name: string;
    directories?: TreeDirectory[];
    files?: TreeFileColumns;
}

/** The directory-tree document served for one view of a region. */
export interface DirectoryTree {
    format: string;
    version: number;
    view: string;
    published_version: string;
    revision: string;
    files: number;
    media_types: string[];
    root: TreeDirectory;
}

/** The published views of a region: files for pages, the exporter's canonical assets, and the client package. */
export const ASSET_VIEWS = ["storage", "canonical", "client"] as const;
export type AssetView = (typeof ASSET_VIEWS)[number];

export function isAssetView(value: string | null): value is AssetView {
    return ASSET_VIEWS.includes(value as AssetView);
}

export interface AssetTree {
    region: string;
    view: AssetView;
    document: DirectoryTree;
}

export interface AssetTreeFolder {
    name: string;
    path: string;
}

export interface AssetTreeFile {
    name: string;
    path: string;
    size: number;
    mediaType: string;
    /** The file in the version the tree was read from. */
    url: string;
    /** The file in the current version, for links that should follow updates. */
    latestUrl: string;
}

export interface AssetTreeListing {
    folders: AssetTreeFolder[];
    files: AssetTreeFile[];
}

const treeCache = new Map<string, Promise<AssetTree>>();

/** Loads the tree of a view of a region once; a failed load is retried on the next call. */
export function loadAssetTree(region: string, view: AssetView): Promise<AssetTree> {
    const key = `${region}/${view}`;
    const cached = treeCache.get(key);
    if (cached) return cached;

    const loading = fetchAssetTree(region, view);
    treeCache.set(key, loading);
    loading.catch(() => treeCache.delete(key));
    return loading;
}

export function clearAssetTreeCache(region: string, view: AssetView): void {
    treeCache.delete(`${region}/${view}`);
}

async function fetchAssetTree(region: string, view: AssetView): Promise<AssetTree> {
    const response = await fetch(`${STORAGE_ORIGIN}/trees/${region}/${view}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    if (!response.body) {
        throw new Error("Empty directory tree response");
    }
    const json: unknown = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
    return { region, view, document: parseDirectoryTree(json) };
}

function parseDirectoryTree(json: unknown): DirectoryTree {
    const header = json as { format?: unknown; version?: unknown } | null;
    if (header?.format !== TREE_FORMAT || header.version !== TREE_VERSION) {
        throw new Error(
            `Unsupported directory tree: format ${String(header?.format)}, version ${String(header?.version)}`,
        );
    }
    return json as DirectoryTree;
}

function splitPath(path: string): string[] {
    return path.split("/").filter(Boolean);
}

function joinPath(base: string, name: string): string {
    return base ? `${base}/${name}` : name;
}

/** The directory at `path` (segments joined by `/`, empty for the root), or null when the tree has none. */
export function findDirectory(root: TreeDirectory, path: string): TreeDirectory | null {
    let current = root;
    for (const segment of splitPath(path)) {
        const next = current.directories?.find(dir => dir.name === segment);
        if (!next) return null;
        current = next;
    }
    return current;
}

/** Subdirectories and files directly under `path`. */
export function listDirectory(tree: AssetTree, path: string): AssetTreeListing {
    const { document } = tree;
    const dir = findDirectory(document.root, path);
    if (!dir) return { folders: [], files: [] };

    const folders = (dir.directories ?? []).map(child => ({
        name: child.name,
        path: joinPath(path, child.name),
    }));

    const columns = dir.files;
    const files = columns
        ? columns.names.map((name, index): AssetTreeFile => {
              const filePath = joinPath(path, name);
              return {
                  name,
                  path: filePath,
                  size: columns.sizes[index],
                  mediaType: document.media_types[columns.media_types[index]],
                  url: fileUrl(tree, filePath),
                  latestUrl: latestFileUrl(tree, filePath),
              };
          })
        : [];

    return { folders, files };
}

/** Recursively searches subdirectories and files under `basePath` matching `query` (case-insensitive). */
export function searchDirectory(tree: AssetTree, basePath: string, query: string): AssetTreeListing {
    const q = query.trim().toLowerCase();
    if (!q) return listDirectory(tree, basePath);

    const { document } = tree;
    const rootDir = findDirectory(document.root, basePath);
    if (!rootDir) return { folders: [], files: [] };

    const folders: AssetTreeFolder[] = [];
    const files: AssetTreeFile[] = [];

    const walk = (node: TreeDirectory, currentPath: string) => {
        for (const child of node.directories ?? []) {
            const childPath = joinPath(currentPath, child.name);
            const relPath = basePath ? childPath.slice(basePath.length + 1) : childPath;
            if (child.name.toLowerCase().includes(q) || relPath.toLowerCase().includes(q)) {
                folders.push({ name: child.name, path: childPath });
            }
            walk(child, childPath);
        }

        const columns = node.files;
        if (columns) {
            for (let i = 0; i < columns.names.length; i += 1) {
                const name = columns.names[i];
                const filePath = joinPath(currentPath, name);
                const relPath = basePath ? filePath.slice(basePath.length + 1) : filePath;
                if (name.toLowerCase().includes(q) || relPath.toLowerCase().includes(q)) {
                    files.push({
                        name,
                        path: filePath,
                        size: columns.sizes[i],
                        mediaType: document.media_types[columns.media_types[i]],
                        url: fileUrl(tree, filePath),
                        latestUrl: latestFileUrl(tree, filePath),
                    });
                }
            }
        }
    };

    walk(rootDir, basePath);
    return { folders, files };
}

/** The URL prefix of each view before `<region>/` or `<region>@<version>/`. The canonical view has none. */
const VIEW_PREFIX: Record<AssetView, string> = {
    storage: "/storage",
    canonical: "",
    client: "/client",
};

/** URL of a file of the view under `region`, which is either `<region>` or `<region>@<version>`. */
function viewUrl(tree: AssetTree, region: string, path: string): string {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return `${STORAGE_ORIGIN}${VIEW_PREFIX[tree.view]}/${region}/${encodedPath}`;
}

/** Public URL of a file in the published version the tree was read from. */
export function fileUrl(tree: AssetTree, path: string): string {
    return viewUrl(tree, `${tree.region}@${tree.document.published_version}`, path);
}

/** Public URL of a file in whichever version of the region is current when it is requested. */
export function latestFileUrl(tree: AssetTree, path: string): string {
    return viewUrl(tree, tree.region, path);
}
