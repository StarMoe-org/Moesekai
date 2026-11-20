import type {
    CorpusLoadProgress,
    CorpusStatusInfo,
    StoryChunk,
    StoryChunkType,
    StorySearchHit,
    StorySearchServer,
} from "./types";

interface WorkerResponse {
    reqId: number;
    type?: "progress";
    phase?: CorpusLoadProgress["phase"];
    server?: StorySearchServer;
    loadedBytes?: number;
    totalBytes?: number;
    ok?: boolean;
    data?: unknown;
    error?: string;
}

interface PendingCall {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    onProgress?: (progress: CorpusLoadProgress) => void;
}

export class StorySearchWorkerClient {
    private worker: Worker | null = null;
    private seq = 0;
    private pending = new Map<number, PendingCall>();

    private ensureWorker(): Worker {
        if (!this.worker) {
            this.worker = new Worker(new URL("./worker.ts", import.meta.url));
            this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                const msg = event.data;
                const entry = this.pending.get(msg.reqId);
                if (!entry) return;

                if (msg.type === "progress" && msg.phase && msg.server) {
                    entry.onProgress?.({
                        phase: msg.phase,
                        server: msg.server,
                        loadedBytes: msg.loadedBytes,
                        totalBytes: msg.totalBytes,
                    });
                    return;
                }

                this.pending.delete(msg.reqId);
                if (msg.ok) {
                    entry.resolve(msg.data);
                } else {
                    entry.reject(new Error(msg.error || "Worker error"));
                }
            };
            this.worker.onerror = (event) => {
                const err = new Error(event.message || "Story search worker crashed");
                for (const [, entry] of this.pending) {
                    entry.reject(err);
                }
                this.pending.clear();
                this.worker?.terminate();
                this.worker = null;
            };
        }
        return this.worker;
    }

    private call<T>(
        type: string,
        payload: unknown,
        onProgress?: (progress: CorpusLoadProgress) => void,
    ): Promise<T> {
        const worker = this.ensureWorker();
        const reqId = ++this.seq;
        return new Promise<T>((resolve, reject) => {
            this.pending.set(reqId, {
                resolve: resolve as (value: unknown) => void,
                reject,
                onProgress,
            });
            worker.postMessage({ reqId, type, payload });
        });
    }

    loadCorpus(
        server: StorySearchServer,
        options?: { forceRefresh?: boolean; onProgress?: (progress: CorpusLoadProgress) => void },
    ): Promise<CorpusStatusInfo> {
        return this.call<CorpusStatusInfo>(
            "loadCorpus",
            { server, forceRefresh: options?.forceRefresh ?? false },
            options?.onProgress,
        );
    }

    searchLocal(params: {
        server: StorySearchServer;
        query: string;
        isRegex: boolean;
        caseSensitive: boolean;
        type?: StoryChunkType | "all";
        charIds?: number[];
        limit?: number;
    }): Promise<{ hits: StorySearchHit[]; totalMatches: number; searchMs: number }> {
        return this.call("searchLocal", params);
    }

    lookupChunks(server: StorySearchServer, ids: number[]): Promise<Record<number, StoryChunk>> {
        return this.call("lookupChunks", { server, ids });
    }

    clearCache(server?: StorySearchServer): Promise<{ cleared: boolean }> {
        return this.call("clearCache", { server });
    }

    dispose(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.pending.clear();
    }
}
