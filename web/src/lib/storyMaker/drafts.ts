/**
 * The story maker's v2 drafts, kept in browser IndexedDB (`moesekai-story-maker-v2`, store
 * `drafts`). Nothing leaves the device: sharing is by exporting `.moesekai-story.json` or `.msk`.
 * Every draft read back is checked against the `moesekai-story/2` schema, rejecting corrupted or
 * legacy v1 records while preserving mid-edit v2 drafts.
 */
import type { StoryDocument, StoryDraft } from "@/types/storyMaker";
import { createStoryDocument, newStoryId, updateStoryMeta } from "./document";
import { STORY_LIMITS } from "./limits";
import { parseStoryDocumentDraft, validateStoryDocument } from "./validate";

const DB_NAME = "moesekai-story-maker-v2";
const DB_VERSION = 1;
const STORE = "drafts";

let opening: Promise<IDBDatabase> | null = null;

export class StoryDraftsUnavailableError extends Error {
    constructor() {
        super("story_drafts_unavailable");
    }
}

function open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") return Promise.reject(new StoryDraftsUnavailableError());
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: "id" });
                store.createIndex("updatedAt", "updatedAt");
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.close();
                opening = null;
            };
            resolve(db);
        };
        request.onerror = () => {
            opening = null;
            reject(request.error ?? new StoryDraftsUnavailableError());
        };
        request.onblocked = () => {
            opening = null;
            reject(new StoryDraftsUnavailableError());
        };
    });
    return opening;
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await open();
    return db.transaction(STORE, mode).objectStore(STORE);
}

/** A stored record as a v2 draft, or null when it does not hold a valid v2 document. */
function readDraft(value: unknown): StoryDraft | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Partial<StoryDraft>;
    if (typeof record.id !== "string" || typeof record.createdAt !== "number" || typeof record.updatedAt !== "number") return null;
    const result = validateStoryDocument(record.doc);
    if (result.ok) {
        return { id: record.id, doc: result.doc, createdAt: record.createdAt, updatedAt: record.updatedAt };
    }
    // Mid-edit v2 drafts (e.g. a brand-new draft with unwired `start` or an empty choice text)
    // remain editable until the author wires them up.
    const draftDoc = parseStoryDocumentDraft(record.doc);
    if (draftDoc) {
        return { id: record.id, doc: draftDoc, createdAt: record.createdAt, updatedAt: record.updatedAt };
    }
    return null;
}

/** Every draft, the most recently edited first. */
export async function listDrafts(): Promise<StoryDraft[]> {
    const all = await settle((await store("readonly")).getAll());
    return all.map(readDraft).filter((draft): draft is StoryDraft => draft !== null).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDraft(id: string): Promise<StoryDraft | null> {
    return readDraft(await settle((await store("readonly")).get(id)));
}

async function put(draft: StoryDraft): Promise<StoryDraft> {
    await settle((await store("readwrite")).put(draft));
    return draft;
}

/** A new draft holding `doc`. */
export async function createDraft(doc: StoryDocument): Promise<StoryDraft> {
    const now = Date.now();
    const taken = (await listDrafts()).map(draft => draft.id);
    return put({ id: newStoryId(taken, 10), doc, createdAt: now, updatedAt: now });
}

export function emptyDraftDocument(region: StoryDocument["region"], title: string): StoryDocument {
    return createStoryDocument(region, title);
}

/** Saves a draft's document (its edit time follows). */
export async function saveDraft(id: string, doc: StoryDocument): Promise<StoryDraft> {
    const current = await settle((await store("readonly")).get(id)) as StoryDraft | undefined;
    const now = Date.now();
    return put({ id, doc, createdAt: current?.createdAt ?? now, updatedAt: now });
}

export async function renameDraft(id: string, title: string): Promise<StoryDraft | null> {
    const draft = await getDraft(id);
    if (!draft) return null;
    return saveDraft(id, updateStoryMeta(draft.doc, { title }));
}

export async function duplicateDraft(id: string, titleSuffix: string): Promise<StoryDraft | null> {
    const draft = await getDraft(id);
    if (!draft) return null;
    const title = `${draft.doc.meta.title}${titleSuffix}`.slice(0, STORY_LIMITS.title);
    const cloned = structuredClone(draft.doc);
    cloned.id = newStoryId([draft.doc.id], 10);
    cloned.meta = { ...cloned.meta, title };
    return createDraft(cloned);
}

export async function deleteDraft(id: string): Promise<void> {
    await settle((await store("readwrite")).delete(id));
}
