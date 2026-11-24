/**
 * Reading the canonical view of a published exporter output through the resolver that serves it:
 * the roles from the listing of their directory, and each asset from its document,
 * `<name>.asset.json`, which says the role of each of its files. Every file is read from the
 * version the listing named, so one page never mixes two versions. Documents are kept for the
 * page's lifetime, and a failed request is forgotten so that a retry asks again.
 */
import type {
    Costume3dAssetDocument, Costume3dCatalog, Costume3dClip, Costume3dComponents, Costume3dCostume,
    Costume3dDirectoryListing, Costume3dFile,
} from "@/types/costume3d";
import { COSTUME3D_FORMATS, COSTUME3D_FORMS, costume3dSource } from "./config";

/** The directory of the `costume-role` assets: one per role, `costume/role/<characterId>-<unit>`. */
const ROLE_DIRECTORY = "costume/role/";
const ASSET_DOCUMENT = ".asset.json";

/** Why an output cannot be read: not published for the server, written in formats this reader does not know, or not reachable. */
export class Costume3dUnavailableError extends Error {
    readonly reason: "region" | "format" | "network";

    constructor(reason: "region" | "format" | "network", detail?: string) {
        super(`costume3d_unavailable:${reason}${detail ? `:${detail}` : ""}`);
        this.reason = reason;
    }
}

/** What an asset cannot give: it is not published, its conversion failed, or it is written in a format this reader does not know. */
export class Costume3dDocumentError extends Error {
    readonly reason: "missing" | "failed" | "format";

    constructor(reason: "missing" | "failed" | "format", detail?: string) {
        super(`costume3d_document:${reason}${detail ? `:${detail}` : ""}`);
        this.reason = reason;
    }
}

const documents = new Map<string, Promise<unknown>>();
const publications = new Map<string, Promise<Costume3dPublication>>();

/** A JSON document, read once for the page. */
function fetchJson<T>(url: string): Promise<T> {
    return kept(documents, url, () => fetch(url).then(response => {
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        return response.json();
    })) as Promise<T>;
}

/** The document `key` names, made once by `load`; one that failed is made again on the next call. */
function kept<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
    let pending = cache.get(key);
    if (!pending) {
        pending = load();
        pending.catch(() => cache.delete(key));
        cache.set(key, pending);
    }
    return pending;
}

/** The failure a document holds, if it is the document of an asset that could not be produced. */
function failed(document: { error?: { code: string } }): void {
    if (document.error) throw new Costume3dDocumentError("failed", document.error.code);
}

/** Refuses a document written in a format, or a version of it, this reader does not know. */
function requireVersion(document: { format?: string; version?: number }, format: string): void {
    if (document.format !== format || document.version !== COSTUME3D_FORMATS[format]) {
        throw new Costume3dUnavailableError("format", `${document.format} ${document.version}`);
    }
}

/** One published version of a region's view: its roles, and its assets by name. */
export class Costume3dPublication {
    /** The version's root, ending in `/`: `<base><region>@<version>/`. */
    readonly root: string;
    /** The names of the `costume-role` assets, in name order. */
    readonly roles: string[];
    private readonly assets = new Map<string, Promise<Costume3dAssetDocument>>();

    private constructor(root: string, roles: string[]) {
        this.root = root;
        this.roles = roles;
    }

    /** Opens the current version of the view at `source` (`<base><region>/`), named by the listing of its roles. */
    static async open(source: string): Promise<Costume3dPublication> {
        const listing = await fetchJson<Costume3dDirectoryListing>(`${source}${ROLE_DIRECTORY}`);
        requireVersion(listing, "directory-listing");
        const roles = listing.files
            .filter(file => file.name.endsWith(ASSET_DOCUMENT))
            .map(file => `${ROLE_DIRECTORY}${file.name.slice(0, -ASSET_DOCUMENT.length)}`);
        const root = `${source.slice(0, -1)}@${listing.published_version}/`;
        return new Costume3dPublication(root, roles);
    }

    /** The document of asset `name`; refuses an asset that was not published or whose form this reader does not know. */
    asset(name: string): Promise<Costume3dAssetDocument> {
        return kept(this.assets, name, () => this.readAsset(name));
    }

    private async readAsset(name: string): Promise<Costume3dAssetDocument> {
        const response = await fetch(`${this.root}${name}${ASSET_DOCUMENT}`);
        if (response.status === 404) throw new Costume3dDocumentError("missing", name);
        if (!response.ok) throw new Error(`${response.status} ${name}`);
        const document = await response.json() as Costume3dAssetDocument;
        requireVersion(document, "asset");
        const formVersion = COSTUME3D_FORMS[document.form];
        if (formVersion !== undefined && document.form_version !== formVersion) {
            throw new Costume3dDocumentError("format", `${document.form} ${document.form_version}`);
        }
        return document;
    }

    /** The member of `asset` with `role`, or null when it has none. */
    file(asset: Costume3dAssetDocument, role: string): Costume3dFile | null {
        const member = asset.members.find(entry => entry.role === role);
        if (!member) return null;
        // An asset of one file is published as `<name>.<extension>`, one of several as `<name>/<role>.<extension>`.
        const path = asset.members.length === 1 ? asset.name : `${asset.name}/${role}`;
        return { sha256: member.sha256, url: `${this.root}${path}.${member.extension}` };
    }

    /** The member of `asset` with `role`; refuses an asset without one. */
    member(asset: Costume3dAssetDocument, role: string): Costume3dFile {
        const file = this.file(asset, role);
        if (!file) throw new Costume3dDocumentError("missing", `${asset.name}#${role}`);
        return file;
    }

    /** Reads the document of a member, once its format is known to the reader. */
    readMember<T extends { format?: string; version?: number; error?: { code: string } }>(asset: Costume3dAssetDocument, role: string, format: string): Promise<T> {
        return fetchJson<T>(this.member(asset, role).url).then(document => {
            requireVersion(document, format);
            failed(document);
            return document;
        });
    }

    /** The role document `costume/role/<characterId>-<unit>`. */
    role(name: string): Promise<Costume3dCatalog> {
        return this.asset(name).then(asset => this.readMember<Costume3dCatalog>(asset, "costume-role", "costume-role"));
    }

    /** The document `costume/<costumeNumber>`. */
    costume(costumeNumber: number): Promise<Costume3dCostume> {
        return this.asset(`costume/${costumeNumber}`)
            .then(asset => this.readMember<Costume3dCostume>(asset, "costume", "costume"));
    }

    /** The components of a `costume-model` asset; none when its prefab has no spring, collider or constraint. */
    components(asset: Costume3dAssetDocument): Promise<Costume3dComponents> {
        if (!this.file(asset, "components")) {
            return Promise.resolve({ format: "components", version: 1, components: [] });
        }
        return this.readMember<Costume3dComponents>(asset, "components", "components");
    }

    /** The clip of a `costume-motion` asset. */
    clip(asset: Costume3dAssetDocument): Promise<Costume3dClip> {
        return this.readMember<Costume3dClip>(asset, "motion", "clip");
    }
}

/** Opens the current version of `region`'s output, once per page; a failed open is tried again on the next call. */
export function openOutput(region: string): Promise<Costume3dPublication> {
    const source = costume3dSource(region);
    if (!source) return Promise.reject(new Costume3dUnavailableError("region"));
    return kept(publications, source, () => Costume3dPublication.open(source).catch(error => {
        if (error instanceof Costume3dUnavailableError) throw error;
        throw new Costume3dUnavailableError("network", error instanceof Error ? error.message : String(error));
    }));
}
