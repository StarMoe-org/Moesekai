export type StorySearchMode = "local" | "semantic";
export type StorySearchServer = "cn" | "jp";
export type StoryChunkType = "unit" | "event" | "card" | "talk" | "self" | "special";

export const STORY_SEARCH_SERVERS: readonly StorySearchServer[] = ["cn", "jp"];
export const STORY_CHUNK_TYPES: readonly StoryChunkType[] = [
    "unit",
    "event",
    "card",
    "talk",
    "self",
    "special",
];

export interface StoryChunk {
    id: number;
    server: StorySearchServer;
    type: StoryChunkType;
    story_id: string;
    story: string;
    ep: string;
    scenario_id: string;
    chars: string[];
    char_ids?: number[];
    line_start: number;
    line_end: number;
    text?: string;
    chunk_hash?: string;
}

export interface ManifestArtifactRef {
    path?: string;
    file?: string;
    sha256?: string;
    raw_bytes?: number;
    br_bytes?: number;
}

export interface ManifestServerEntry {
    version?: string | number;
    generated_at?: string;
    chunk_count?: number;
    corpus?: ManifestArtifactRef;
    chunks?: ManifestArtifactRef;
    chunks_path?: string;
    chunks_sha256?: string;
    vectors?: ManifestArtifactRef | ManifestArtifactRef[];
}

export interface StorySearchManifest {
    version?: string | number;
    generated_at?: string;
    model?: string;
    dims?: number;
    servers?: Partial<Record<StorySearchServer, ManifestServerEntry>>;
    cn?: ManifestServerEntry;
    jp?: ManifestServerEntry;
    corpus?: ManifestArtifactRef;
    chunk_count?: number;
}

export interface CorpusStatusInfo {
    server: StorySearchServer;
    version: string;
    cacheVersion: string;
    chunkCount: number;
    brBytes: number;
    rawBytes: number;
    source: "idb" | "network";
}

export type CorpusLoadPhase =
    | "idle"
    | "checking"
    | "downloading"
    | "decompressing"
    | "ready"
    | "error";

export interface CorpusLoadProgress {
    phase: CorpusLoadPhase;
    server: StorySearchServer;
    loadedBytes?: number;
    totalBytes?: number;
    info?: CorpusStatusInfo;
    error?: string;
}

export interface StorySearchHit {
    chunk: StoryChunk;
    score: number;
    matchCount?: number;
}

export interface SemanticSearchApiResult {
    id: number;
    server: StorySearchServer;
    type: StoryChunkType;
    story_id: string;
    story: string;
    ep: string;
    scenario_id: string;
    chars: string[];
    char_ids?: number[];
    line_start: number;
    line_end: number;
    score: number;
    text?: string;
}

export interface SemanticSearchApiResponse {
    results: SemanticSearchApiResult[];
    dims?: number;
    model?: string;
    cached?: boolean;
    latency_ms?: number;
    session_remaining?: number;
    code?: string;
    error?: string;
    message?: string;
}

export interface StorySearchStatusResponse {
    servers?: Record<string, unknown>;
    dims?: number;
    model?: string;
    turnstile_required?: boolean;
    session_valid?: boolean;
    session_active?: boolean;
    session_remaining?: number;
}
