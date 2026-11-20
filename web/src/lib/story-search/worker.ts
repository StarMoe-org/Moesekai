import brotliPromise from "brotli-dec-wasm";
import { chunkMatchesCharacterIds, speakerMatchesCharacterIds } from "./characters";
import { parseDialogueLines } from "./dialogue";
import type {
    CorpusStatusInfo,
    ManifestServerEntry,
    StoryChunk,
    StoryChunkType,
    StorySearchHit,
    StorySearchManifest,
    StorySearchServer,
} from "./types";

const CORPUS_BASE_URL = "https://assets.pjsk.moe/sekai-extra-assets/sekai-story-search";
const DB_NAME = "moesekai_story_search_v1";
const STORE_NAME = "corpora";

interface CachedCorpusRecord {
    server: StorySearchServer;
    cacheVersion: string;
    version: string;
    path: string;
    chunkCount: number;
    rawBytes: number;
    brBytes: number;
    buffer: ArrayBuffer;
    fetchedAt: number;
}

interface IndexedChunk extends StoryChunk {
    textLower: string;
}

interface LoadedServerCorpus {
    info: CorpusStatusInfo;
    chunks: IndexedChunk[];
    byId: Map<number, IndexedChunk>;
}

const loadedByServer = new Map<StorySearchServer, LoadedServerCorpus>();

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "server" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbGet(server: StorySearchServer): Promise<CachedCorpusRecord | null> {
    try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const req = tx.objectStore(STORE_NAME).get(server);
            req.onsuccess = () => resolve((req.result as CachedCorpusRecord | undefined) ?? null);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null;
    }
}

async function idbPut(record: CachedCorpusRecord): Promise<void> {
    try {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // Ignore IDB quota/private-mode restrictions cleanly
    }
}

async function idbDelete(server?: StorySearchServer): Promise<void> {
    try {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            if (server) {
                store.delete(server);
            } else {
                store.clear();
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // Ignore
    }
}

function resolveManifestCorpusInfo(manifest: StorySearchManifest, server: StorySearchServer) {
    const entry: ManifestServerEntry | undefined =
        manifest.servers?.[server] ?? manifest[server];

    const rawPath =
        entry?.corpus?.path
        ?? entry?.chunks?.path
        ?? entry?.chunks_path
        ?? entry?.corpus?.file
        ?? entry?.chunks?.file
        ?? (manifest.corpus?.path || manifest.corpus?.file)
        ?? `${server}/chunks.jsonl.br`;

    const normalizedPath = rawPath.startsWith("http://") || rawPath.startsWith("https://")
        ? rawPath
        : `${CORPUS_BASE_URL}/${rawPath.replace(/^\/+/, "")}`;

    const sha256 =
        entry?.corpus?.sha256
        ?? entry?.chunks?.sha256
        ?? entry?.chunks_sha256
        ?? entry?.corpus?.file
        ?? rawPath;

    const version = String(
        entry?.version
        ?? manifest.version
        ?? entry?.generated_at
        ?? manifest.generated_at
        ?? "1",
    );

    const cacheVersion = `${version}:${sha256}`;
    const expectedBytes = entry?.corpus?.br_bytes ?? entry?.chunks?.br_bytes;

    return {
        url: normalizedPath,
        path: rawPath,
        version,
        cacheVersion,
        expectedBytes,
    };
}

async function fetchManifest(): Promise<StorySearchManifest> {
    const resp = await fetch(`${CORPUS_BASE_URL}/manifest.json`, {
        mode: "cors",
        cache: "no-cache",
    });
    if (!resp.ok) {
        throw new Error(`manifest.json HTTP ${resp.status}`);
    }
    return (await resp.json()) as StorySearchManifest;
}

async function downloadWithProgress(
    url: string,
    expectedBytes: number | undefined,
    onProgress: (loadedBytes: number, totalBytes?: number) => void,
): Promise<ArrayBuffer> {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) {
        throw new Error(`Corpus download failed: HTTP ${resp.status}`);
    }
    const headerLength = Number(resp.headers.get("content-length") || "0");
    const totalBytes = headerLength > 0 ? headerLength : expectedBytes;

    if (!resp.body) {
        const buf = await resp.arrayBuffer();
        onProgress(buf.byteLength, totalBytes ?? buf.byteLength);
        return buf;
    }

    const reader = resp.body.getReader();
    const parts: Uint8Array[] = [];
    let loaded = 0;
    let lastEmit = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            parts.push(value);
            loaded += value.byteLength;
            const now = performance.now();
            if (now - lastEmit > 80) {
                lastEmit = now;
                onProgress(loaded, totalBytes);
            }
        }
    }
    onProgress(loaded, totalBytes ?? loaded);

    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const part of parts) {
        merged.set(part, offset);
        offset += part.byteLength;
    }
    return merged.buffer;
}

function parseJsonlChunks(rawBytes: Uint8Array, defaultServer: StorySearchServer): {
    chunks: IndexedChunk[];
    byId: Map<number, IndexedChunk>;
} {
    const text = new TextDecoder("utf-8").decode(rawBytes);
    const lines = text.split("\n");
    const chunks: IndexedChunk[] = [];
    const byId = new Map<number, IndexedChunk>();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parsed = JSON.parse(line) as StoryChunk;
        if (!parsed.server) parsed.server = defaultServer;
        const indexed: IndexedChunk = {
            ...parsed,
            chars: Array.isArray(parsed.chars) ? parsed.chars : [],
            textLower: (parsed.text ?? "").toLowerCase(),
        };
        chunks.push(indexed);
        byId.set(indexed.id, indexed);
    }
    return { chunks, byId };
}

async function handleLoadCorpus(
    reqId: number,
    payload: { server: StorySearchServer; forceRefresh?: boolean },
): Promise<CorpusStatusInfo> {
    const { server, forceRefresh = false } = payload;

    const existing = loadedByServer.get(server);
    if (existing && !forceRefresh) {
        // Re-check manifest in case a newer corpus version was published.
        try {
            self.postMessage({ reqId, type: "progress", phase: "checking", server });
            const manifest = await fetchManifest();
            const target = resolveManifestCorpusInfo(manifest, server);
            if (existing.info.cacheVersion === target.cacheVersion) {
                return existing.info;
            }
        } catch {
            // If offline or manifest temporarily unreachable, keep loaded memory copy.
            return existing.info;
        }
    }

    self.postMessage({ reqId, type: "progress", phase: "checking", server });
    const manifest = await fetchManifest();
    const target = resolveManifestCorpusInfo(manifest, server);

    let buffer: ArrayBuffer | null = null;
    let source: "idb" | "network" = "network";

    if (!forceRefresh) {
        const cached = await idbGet(server);
        if (cached && cached.cacheVersion === target.cacheVersion && cached.buffer?.byteLength > 0) {
            buffer = cached.buffer;
            source = "idb";
        }
    }

    if (!buffer) {
        buffer = await downloadWithProgress(target.url, target.expectedBytes, (loadedBytes, totalBytes) => {
            self.postMessage({
                reqId,
                type: "progress",
                phase: "downloading",
                server,
                loadedBytes,
                totalBytes,
            });
        });
    }

    self.postMessage({ reqId, type: "progress", phase: "decompressing", server });
    const brotli = await brotliPromise;
    const rawBytes = brotli.decompress(new Uint8Array(buffer));
    const { chunks, byId } = parseJsonlChunks(rawBytes, server);

    const info: CorpusStatusInfo = {
        server,
        version: target.version,
        cacheVersion: target.cacheVersion,
        chunkCount: chunks.length,
        brBytes: buffer.byteLength,
        rawBytes: rawBytes.byteLength,
        source,
    };

    loadedByServer.set(server, { info, chunks, byId });

    if (source === "network") {
        await idbPut({
            server,
            cacheVersion: target.cacheVersion,
            version: target.version,
            path: target.path,
            chunkCount: chunks.length,
            rawBytes: rawBytes.byteLength,
            brBytes: buffer.byteLength,
            buffer,
            fetchedAt: Date.now(),
        });
    }

    return info;
}

function handleSearchLocal(payload: {
    server: StorySearchServer;
    query: string;
    isRegex: boolean;
    caseSensitive: boolean;
    type?: StoryChunkType | "all";
    charIds?: number[];
    limit?: number;
}): { hits: StorySearchHit[]; totalMatches: number; searchMs: number } {
    const loaded = loadedByServer.get(payload.server);
    if (!loaded) {
        throw new Error(`Corpus not loaded for ${payload.server}`);
    }

    const q = payload.query.trim();
    const charIds = payload.charIds ?? [];
    const typeFilter = payload.type && payload.type !== "all" ? payload.type : null;
    const limit = payload.limit ?? 5000;

    let re: RegExp | null = null;
    if (q && payload.isRegex) {
        const flags = payload.caseSensitive ? "gm" : "igm";
        re = new RegExp(q, flags);
    }
    const needle = payload.caseSensitive ? q : q.toLowerCase();

    const t0 = performance.now();
    const hits: StorySearchHit[] = [];
    const seenLineKeys = new Set<string>();
    let totalMatches = 0;

    for (let i = 0; i < loaded.chunks.length; i++) {
        const chunk = loaded.chunks[i];
        if (typeFilter && chunk.type !== typeFilter) continue;
        if (charIds.length > 0 && !chunkMatchesCharacterIds(chunk, charIds)) continue;

        // Fast whole-chunk pre-filter before splitting lines.
        if (q) {
            if (re) {
                re.lastIndex = 0;
                if (!re.test(chunk.text ?? "")) continue;
            } else {
                const wholeHay = payload.caseSensitive ? (chunk.text ?? "") : chunk.textLower;
                if (!wholeHay.includes(needle)) continue;
            }
        }

        const dialogueLines = parseDialogueLines(chunk.text ?? "");
        if (dialogueLines.length === 0) continue;

        const matchedLineIndices: number[] = [];
        let chunkMatches = 0;

        for (let lineIdx = 0; lineIdx < dialogueLines.length; lineIdx++) {
            const item = dialogueLines[lineIdx];

            // When character filter is active, only match utterances spoken by the selected character(s).
            if (charIds.length > 0) {
                if (item.speaker === null || !speakerMatchesCharacterIds(item.speaker, charIds)) {
                    continue;
                }
            }

            let lineMatchCount = 1;
            if (q) {
                // Match against spoken text when filtered by character, or dialogue line (without metadata header).
                const target = charIds.length > 0 ? item.speech : item.raw;
                if (re) {
                    re.lastIndex = 0;
                    const matches = target.match(re);
                    if (!matches || matches.length === 0) continue;
                    lineMatchCount = matches.length;
                } else {
                    const hay = payload.caseSensitive ? target : target.toLowerCase();
                    if (!hay.includes(needle)) continue;
                    let count = 0;
                    let pos = 0;
                    while ((pos = hay.indexOf(needle, pos)) !== -1) {
                        count++;
                        pos += Math.max(1, needle.length);
                    }
                    lineMatchCount = count;
                }
            }

            // Deduplicate overlapping sliding-window utterances across adjacent chunks.
            const globalLineNo = (chunk.line_start ?? 0) + lineIdx;
            const lineKey = `${chunk.server}\0${chunk.scenario_id || chunk.story_id}\0${chunk.ep}\0${globalLineNo}\0${item.raw}`;
            if (seenLineKeys.has(lineKey)) continue;
            seenLineKeys.add(lineKey);

            matchedLineIndices.push(lineIdx);
            chunkMatches += lineMatchCount;
        }

        if (matchedLineIndices.length === 0) continue;

        totalMatches++;
        if (hits.length < limit) {
            hits.push({
                chunk,
                score: chunkMatches,
                matchCount: chunkMatches,
                matchedLineIndices,
            });
        }
    }

    const searchMs = performance.now() - t0;
    return { hits, totalMatches, searchMs };
}

function handleLookupChunks(payload: { server: StorySearchServer; ids: number[] }): Record<number, StoryChunk> {
    const loaded = loadedByServer.get(payload.server);
    if (!loaded) return {};
    const out: Record<number, StoryChunk> = {};
    for (const id of payload.ids) {
        const chunk = loaded.byId.get(id);
        if (chunk) out[id] = chunk;
    }
    return out;
}

self.onmessage = async (event: MessageEvent<{ reqId: number; type: string; payload?: unknown }>) => {
    const { reqId, type, payload } = event.data;
    try {
        if (type === "loadCorpus") {
            const info = await handleLoadCorpus(reqId, payload as { server: StorySearchServer; forceRefresh?: boolean });
            self.postMessage({ reqId, ok: true, data: info });
            return;
        }
        if (type === "searchLocal") {
            const res = handleSearchLocal(payload as Parameters<typeof handleSearchLocal>[0]);
            self.postMessage({ reqId, ok: true, data: res });
            return;
        }
        if (type === "lookupChunks") {
            const res = handleLookupChunks(payload as { server: StorySearchServer; ids: number[] });
            self.postMessage({ reqId, ok: true, data: res });
            return;
        }
        if (type === "clearCache") {
            const server = (payload as { server?: StorySearchServer } | undefined)?.server;
            if (server) {
                loadedByServer.delete(server);
            } else {
                loadedByServer.clear();
            }
            await idbDelete(server);
            self.postMessage({ reqId, ok: true, data: { cleared: true } });
            return;
        }
        throw new Error(`Unknown worker action: ${type}`);
    } catch (err) {
        self.postMessage({
            reqId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};
