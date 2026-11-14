/**
 * Reading a published exporter output in its `index` layout: the pointer of a region
 * (`<region>/<view>/current.json`), the index root it names, the shards by directory, the
 * listings by asset form, and the asset documents, which say the role of each file. Objects are
 * in the store, named by their SHA-256; nothing is read by a guessed file path. Documents are
 * kept for the page's lifetime, and a failed request is forgotten so that a retry asks again.
 */
import type {
    Costume3dAssetDocument, Costume3dCatalog, Costume3dClip, Costume3dComponents, Costume3dCostume, Costume3dIndexRoot,
    Costume3dIndexShard, Costume3dListing, Costume3dPointer,
} from "@/types/costume3d";
import { COSTUME3D_FORMATS, COSTUME3D_FORMS, costume3dSource } from "./config";

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
const shards = new Map<string, Promise<Costume3dIndexShard>>();
const publications = new Map<string, Costume3dPublication>();

/** A request whose document is kept; a failure is not kept. */
function fetchDocument<T>(url: string, read: (response: Response) => Promise<T>): Promise<T> {
    let pending = documents.get(url) as Promise<T> | undefined;
    if (!pending) {
        pending = fetch(url).then(response => {
            if (!response.ok) throw new Error(`${response.status} ${url}`);
            return read(response);
        });
        pending.catch(() => documents.delete(url));
        documents.set(url, pending);
    }
    return pending;
}

const fetchJson = <T>(url: string): Promise<T> => fetchDocument(url, response => response.json() as Promise<T>);

/** A check that `document` is in the version of `format` this reader knows. */
const versioned = <T extends { format?: string; version?: number }>(format: string) => (document: T): T => {
    requireVersion(document, format);
    return document;
};

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

/**
 * The output one pointer URL stands for: opened once per page, it reads the pointer and the root
 * it names once, keeps its listings and asset documents, and keeps shards by their hash, which
 * publications share.
 */
export class Costume3dPublication {
    /** The store's directory, ending in `/`. */
    readonly store: string;
    private readonly pointerUrl: string;
    private readonly root: () => Promise<Costume3dIndexRoot>;
    private readonly shardOf: () => Promise<Map<string, string>>;
    private readonly listings = new Map<string, Promise<Costume3dListing>>();
    private readonly assets = new Map<string, Promise<Costume3dAssetDocument>>();

    constructor(pointerUrl: string) {
        this.pointerUrl = pointerUrl;
        // The store is in the output's own directory, beside `published/`.
        this.store = `${pointerUrl.slice(0, pointerUrl.lastIndexOf("published/"))}store/`;
        this.root = memo(async () => {
            const current = await fetchDocument(pointerUrl, response => response.json() as Promise<Costume3dPointer>);
            requireVersion(current, "pointer");
            const root = await fetchJson<Costume3dIndexRoot>(this.object(current.root, "json"));
            requireVersion(root, "index-root");
            return root;
        });
        this.shardOf = memo(() => this.root().then(root => new Map(root.shards.map(entry => [entry.directory, entry.sha256]))));
    }

    /** The pointer of the publication: `<region>/<view>/current.json`. */
    get pointer(): string {
        return this.pointerUrl;
    }

    /** The names of the assets of `form`, in name order. */
    async listing(form: string): Promise<string[]> {
        return (await this.listingOf(form)).entries.map(entry => entry.name);
    }

    /** The listing of `form`, read once for this publication. */
    private listingOf(form: string): Promise<Costume3dListing> {
        return kept(this.listings, form, async () => {
            const reference = (await this.root()).listings.find(entry => entry.form === form);
            if (!reference) return { format: "listing", version: 1, form, entries: [] };
            return fetchJson<Costume3dListing>(this.object(reference.sha256, "json")).then(versioned("listing"));
        });
    }

    /** The document of asset `name`; refuses an asset that was not published or whose form this reader does not know. */
    asset(name: string): Promise<Costume3dAssetDocument> {
        return kept(this.assets, name, () => this.findAsset(name));
    }

    private async findAsset(name: string): Promise<Costume3dAssetDocument> {
        const directory = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
        const sha256 = (await this.shardOf()).get(directory);
        const shard = sha256
            ? await kept(shards, sha256, () => fetchJson<Costume3dIndexShard>(this.object(sha256, "json"))
                .then(versioned("index-shard")))
            : null;
        const entry = shard?.entries.find(file => file.name === `${name.slice(directory.length + 1)}.asset.json`);
        if (!entry) throw new Costume3dDocumentError("missing", name);
        const document = await fetchJson<Costume3dAssetDocument>(this.object(entry.sha256, entry.extension));
        requireVersion(document, "asset");
        const formVersion = COSTUME3D_FORMS[document.form];
        if (formVersion !== undefined && document.form_version !== formVersion) {
            throw new Costume3dDocumentError("format", `${document.form} ${document.form_version}`);
        }
        return document;
    }

    /** The store object of a member of `asset`: its URL, and its hash when a loader names what it reads by it. */
    member(asset: Costume3dAssetDocument, role: string): { url: string; sha256: string } {
        const member = asset.members.find(entry => entry.role === role);
        if (!member) throw new Costume3dDocumentError("missing", `${asset.name}#${role}`);
        return { url: this.object(member.sha256, member.extension), sha256: member.sha256 };
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
        if (!asset.members.some(member => member.role === "components")) {
            return Promise.resolve({ format: "components", version: 1, components: [] });
        }
        return this.readMember<Costume3dComponents>(asset, "components", "components");
    }

    /** The clip of a `costume-motion` asset. */
    clip(asset: Costume3dAssetDocument): Promise<Costume3dClip> {
        return this.readMember<Costume3dClip>(asset, "motion", "clip");
    }

    private object(sha256: string, extension: string): string {
        return `${this.store}${sha256.slice(0, 2)}/${sha256}.${extension}`;
    }
}

/** A promise made once; one it rejected is made again on the next call. */
function memo<T>(make: () => Promise<T>): () => Promise<T> {
    let pending: Promise<T> | null = null;
    return () => {
        if (!pending) {
            pending = make();
            pending.catch(() => { pending = null; });
        }
        return pending;
    };
}

/** Opens `region`'s output, after checking that its index is published in the documents this reader knows. */
export async function openOutput(region: string): Promise<Costume3dPublication> {
    const pointer = costume3dSource(region);
    if (!pointer) throw new Costume3dUnavailableError("region");
    let publication = publications.get(pointer);
    if (!publication) {
        publication = new Costume3dPublication(pointer);
        publications.set(pointer, publication);
    }
    try {
        await publication.listing("costume-role");
    } catch (error) {
        publications.delete(pointer);
        if (error instanceof Costume3dUnavailableError) throw error;
        throw new Costume3dUnavailableError("network", error instanceof Error ? error.message : String(error));
    }
    return publication;
}




