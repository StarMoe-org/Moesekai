/**
 * Zero-copy browser POSIX USTAR `.tar` bundler and client-side audio validation helpers
 * for Community Story custom voice tracks.
 *
 * - Zero external dependencies; works in both browser and Node 20+ (for unit tests).
 * - Preserves file payloads as `Blob` slices inside `new Blob(parts)` so large voice packs
 *   never duplicate audio bytes in JS heap memory.
 * - Produces archives strictly compatible with `moesekai-media-worker`'s `worker/archive.py`
 *   (POSIX USTAR regular files, root `index.json`, safe relative paths, verified SHA-256).
 */
import type { StoryDocument } from "@/types/storyMaker";

export const SUPPORTED_AUDIO_EXTENSIONS = [
    ".ogg",
    ".mp3",
    ".wav",
    ".m4a",
    ".flac",
    ".webm",
] as const;

export type SupportedAudioExtension = (typeof SUPPORTED_AUDIO_EXTENSIONS)[number];

export const STORY_AUDIO_LIMITS = {
    maxClips: 1500,
    maxArchiveClipFiles: 1499, // reserves 1 entry slot for root index.json (<= 1500 total)
    maxSingleFileBytes: 25 * 1024 * 1024, // 25 MiB
    maxArchiveBytes: 150 * 1024 * 1024, // 150 MiB
    maxSingleClipDurationMs: 60_000, // 60 seconds
    maxTotalDurationMs: 60 * 60 * 1000, // 60 minutes
} as const;

const TAR_BLOCK_SIZE = 512;
const MAX_USTAR_NAME_BYTES = 99; // leave 1 NUL terminator inside 100-byte USTAR name field
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();

export interface TalkBeatVoiceSlot {
    beatId: string;
    nodeId: string;
    sceneTitle: string;
    speakerName: string;
    textPreview: string;
    hasOfficialVoice: boolean;
}

export interface AudioBundleInputClip {
    beatId: string;
    file: Blob;
    originalFilename: string;
    rawSha256: string;
    speaker?: string;
}

export interface AudioArchiveIndexEntry {
    beat_id: string;
    filename: string;
    raw_sha256: string;
    speaker?: string;
}

export interface AudioTarBundleResult {
    blob: Blob;
    archiveSizeBytes: number;
    entries: AudioArchiveIndexEntry[];
}

export interface AudioFileMatchResult<T extends { name: string }> {
    matched: Map<string, T>;
    unmatched: T[];
    unsupported: T[];
}

export type AudioValidationIssueCode =
    | "empty"
    | "tooManyClips"
    | "fileTooLarge"
    | "clipTooLong"
    | "totalDurationExceeded"
    | "archiveTooLarge"
    | "missingDuration";

export interface AudioValidationIssue {
    code: AudioValidationIssueCode;
    beatId?: string;
    actual?: number;
    limit?: number;
}

export interface AudioSelectionItemSummary {
    beatId: string;
    sizeBytes: number;
    durationMs: number | null;
}

/** Extracts the lowercase file extension (including leading `.`) or empty string. */
export function getAudioExtension(filename: string): string {
    const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
    const dot = base.lastIndexOf(".");
    if (dot <= 0 || dot === base.length - 1) return "";
    return base.slice(dot).toLowerCase();
}

/** Returns true if `filename` has a supported audio extension. */
export function isSupportedAudioFilename(filename: string): boolean {
    const ext = getAudioExtension(filename);
    return (SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);
}

/** Extracts the stem (filename without directory or last extension). */
export function getFilenameStem(filename: string): string {
    const base = (filename.replace(/\\/g, "/").split("/").pop() ?? "").trim();
    const dot = base.lastIndexOf(".");
    return (dot > 0 ? base.slice(0, dot) : base).trim();
}

/**
 * Produces a strictly safe, deterministic ASCII archive entry path (`clips/<safeStem><ext>`)
 * that satisfies both POSIX USTAR 99-byte name limits and `worker/archive.py` security rules
 * (no `..`, no leading `/`, no `\`, no `:`, no leading `.`, no spaces or control characters).
 */
export function buildSafeArchiveClipPath(
    beatId: string,
    originalFilename: string,
    usedPaths: Set<string>,
): string {
    const ext = isSupportedAudioFilename(originalFilename)
        ? getAudioExtension(originalFilename)
        : ".ogg";
    const cleaned = beatId
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, "_")
        .replace(/^[_-]+|[_-]+$/g, "")
        .slice(0, 64) || "clip";

    let candidate = `clips/${cleaned}${ext}`;
    if (!usedPaths.has(candidate) && textEncoder.encode(candidate).length <= MAX_USTAR_NAME_BYTES) {
        usedPaths.add(candidate);
        return candidate;
    }

    let suffix = 2;
    while (suffix < 10_000) {
        const stemCap = Math.max(1, 56 - String(suffix).length);
        candidate = `clips/${cleaned.slice(0, stemCap)}_${suffix}${ext}`;
        if (!usedPaths.has(candidate) && textEncoder.encode(candidate).length <= MAX_USTAR_NAME_BYTES) {
            usedPaths.add(candidate);
            return candidate;
        }
        suffix += 1;
    }
    throw new Error(`Unable to allocate unique safe archive path for beat ${beatId}`);
}

/** Traverses talk beats of a `StoryDocument` in stable playback order (reachable nodes first). */
export function extractTalkBeatsForVoice(doc: StoryDocument): TalkBeatVoiceSlot[] {
    const castNameByKey = new Map<string, string>();
    for (const member of doc.cast) {
        castNameByKey.set(member.key, member.name.trim() || member.key);
    }

    const orderedNodeIds: string[] = [];
    const visited = new Set<string>();
    const queue: string[] = [doc.startNodeId];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current) || !doc.nodes[current]) continue;
        visited.add(current);
        orderedNodeIds.push(current);
        for (const edge of doc.edges) {
            if (edge.fromNodeId === current && !visited.has(edge.toNodeId)) {
                queue.push(edge.toNodeId);
            }
        }
    }
    for (const nodeId of Object.keys(doc.nodes)) {
        if (!visited.has(nodeId)) {
            orderedNodeIds.push(nodeId);
        }
    }

    const slots: TalkBeatVoiceSlot[] = [];
    for (const nodeId of orderedNodeIds) {
        const node = doc.nodes[nodeId];
        if (!node || node.type !== "scene") continue;
        const sceneTitle = node.title.trim() || node.id;
        for (const beat of node.beats) {
            if (beat.kind !== "talk") continue;
            const speakerName = (
                beat.speakerName?.trim()
                || (beat.speakerKey ? castNameByKey.get(beat.speakerKey) : "")
                || ""
            ).trim();
            slots.push({
                beatId: beat.id,
                nodeId: node.id,
                sceneTitle,
                speakerName,
                textPreview: beat.body.replace(/\s+/g, " ").trim(),
                hasOfficialVoice: Boolean(beat.voice),
            });
        }
    }
    return slots;
}

/**
 * Auto-matches dropped/picked audio files named `<beatId>.<ext>` against story talk beats.
 * Exact ID matches take precedence over case-insensitive matches.
 */
export function matchAudioFilesToTalkBeats<T extends { name: string }>(
    files: readonly T[],
    talkBeats: readonly TalkBeatVoiceSlot[],
): AudioFileMatchResult<T> {
    const exactBeatSet = new Set(talkBeats.map((b) => b.beatId));
    const lowerBeatMap = new Map<string, string>();
    for (const beat of talkBeats) {
        const lower = beat.beatId.toLowerCase();
        if (!lowerBeatMap.has(lower)) {
            lowerBeatMap.set(lower, beat.beatId);
        }
    }

    const matched = new Map<string, T>();
    const unmatched: T[] = [];
    const unsupported: T[] = [];

    for (const file of files) {
        if (!isSupportedAudioFilename(file.name)) {
            unsupported.push(file);
            continue;
        }
        const stem = getFilenameStem(file.name);
        let beatId: string | undefined;
        if (exactBeatSet.has(stem)) {
            beatId = stem;
        } else {
            beatId = lowerBeatMap.get(stem.toLowerCase());
        }
        if (beatId && !matched.has(beatId)) {
            matched.set(beatId, file);
        } else {
            unmatched.push(file);
        }
    }

    return { matched, unmatched, unsupported };
}

/** Estimates `index.json` byte size for `clipCount` clips (~240 B/clip, min 4 KiB). */
export function estimateAudioIndexJsonBytes(clipCount: number): number {
    return Math.max(4096, Math.max(0, clipCount) * 240);
}

/** Estimates exact USTAR `.tar` archive byte size given raw payload byte sizes. */
export function estimateTarArchiveBytes(payloadSizes: readonly number[], indexJsonBytes?: number): number {
    const resolvedIndexBytes = indexJsonBytes ?? estimateAudioIndexJsonBytes(payloadSizes.length);
    const pad512 = (size: number) => Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    let total = TAR_BLOCK_SIZE + pad512(resolvedIndexBytes); // index.json header + padded body
    for (const size of payloadSizes) {
        total += TAR_BLOCK_SIZE + pad512(Math.max(0, size));
    }
    total += TAR_BLOCK_SIZE * 2; // 1024-byte EOF zero blocks
    return total;
}

/** Validates a selected set of audio clips against client/server safety & quota bounds. */
export function validateAudioSelection(
    items: readonly AudioSelectionItemSummary[],
): AudioValidationIssue[] {
    const issues: AudioValidationIssue[] = [];
    if (items.length === 0) {
        issues.push({ code: "empty" });
        return issues;
    }
    if (items.length > STORY_AUDIO_LIMITS.maxArchiveClipFiles) {
        issues.push({
            code: "tooManyClips",
            actual: items.length,
            limit: STORY_AUDIO_LIMITS.maxArchiveClipFiles,
        });
    }

    let totalDurationMs = 0;
    const payloadSizes: number[] = [];

    for (const item of items) {
        payloadSizes.push(item.sizeBytes);
        if (item.sizeBytes > STORY_AUDIO_LIMITS.maxSingleFileBytes) {
            issues.push({
                code: "fileTooLarge",
                beatId: item.beatId,
                actual: item.sizeBytes,
                limit: STORY_AUDIO_LIMITS.maxSingleFileBytes,
            });
        }
        if (item.durationMs === null || !Number.isFinite(item.durationMs) || item.durationMs <= 0) {
            issues.push({ code: "missingDuration", beatId: item.beatId });
        } else {
            if (item.durationMs > STORY_AUDIO_LIMITS.maxSingleClipDurationMs) {
                issues.push({
                    code: "clipTooLong",
                    beatId: item.beatId,
                    actual: item.durationMs,
                    limit: STORY_AUDIO_LIMITS.maxSingleClipDurationMs,
                });
            }
            totalDurationMs += item.durationMs;
        }
    }

    if (totalDurationMs > STORY_AUDIO_LIMITS.maxTotalDurationMs) {
        issues.push({
            code: "totalDurationExceeded",
            actual: totalDurationMs,
            limit: STORY_AUDIO_LIMITS.maxTotalDurationMs,
        });
    }

    const estArchiveBytes = estimateTarArchiveBytes(
        payloadSizes,
        estimateAudioIndexJsonBytes(items.length),
    );
    if (estArchiveBytes > STORY_AUDIO_LIMITS.maxArchiveBytes) {
        issues.push({
            code: "archiveTooLarge",
            actual: estArchiveBytes,
            limit: STORY_AUDIO_LIMITS.maxArchiveBytes,
        });
    }

    return issues;
}

/** Computes lowercase 64-character hex SHA-256 digest using Web Crypto. */
export async function sha256Hex(blob: Blob): Promise<string> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
        throw new Error("web_crypto_unavailable");
    }
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < bytes.length; i += 1) {
        hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
}

/**
 * Probes an audio `Blob`/`File`'s duration in milliseconds in the browser using `<audio>`.
 * Always revokes its temporary Object URL. Returns `null` if unavailable or unreadable.
 */
export function probeAudioDurationMs(blob: Blob, timeoutMs = 8000): Promise<number | null> {
    if (typeof window === "undefined" || typeof Audio === "undefined" || typeof URL === "undefined") {
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(blob);
        const audio = new Audio();
        audio.preload = "metadata";
        let settled = false;

        const finish = (value: number | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            audio.onloadedmetadata = null;
            audio.onerror = null;
            audio.src = "";
            URL.revokeObjectURL(objectUrl);
            resolve(value);
        };

        const timer = window.setTimeout(() => finish(null), timeoutMs);

        audio.onloadedmetadata = () => {
            const sec = audio.duration;
            if (Number.isFinite(sec) && sec > 0) {
                finish(Math.max(1, Math.round(sec * 1000)));
            } else {
                finish(null);
            }
        };
        audio.onerror = () => finish(null);
        audio.src = objectUrl;
    });
}

function writeAscii(target: Uint8Array, offset: number, maxLength: number, text: string): void {
    const encoded = textEncoder.encode(text);
    if (encoded.length > maxLength) {
        throw new Error(`TAR header field overflow at offset ${offset}: "${text}" (${encoded.length} > ${maxLength})`);
    }
    target.set(encoded, offset);
}

function writeOctal(target: Uint8Array, offset: number, width: number, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Invalid TAR octal integer: ${value}`);
    }
    const oct = value.toString(8);
    if (oct.length > width - 1) {
        throw new Error(`TAR octal value overflow (${value} -> ${oct}) for width ${width}`);
    }
    const padded = oct.padStart(width - 1, "0");
    writeAscii(target, offset, width - 1, padded);
    target[offset + width - 1] = 0;
}

/** Builds a 512-byte POSIX USTAR regular-file header block with a valid octal checksum. */
export function buildUstarHeader(name: string, sizeBytes: number, mtimeSec: number): Uint8Array {
    if (!name || name.startsWith("/") || name.includes("\\") || name.includes("..") || name.includes(":") || name.includes("\0")) {
        throw new Error(`Unsafe TAR entry name rejected: "${name}"`);
    }
    const nameBytes = textEncoder.encode(name);
    if (nameBytes.length > MAX_USTAR_NAME_BYTES) {
        throw new Error(`TAR entry name exceeds ${MAX_USTAR_NAME_BYTES} bytes: "${name}"`);
    }

    const header = new Uint8Array(TAR_BLOCK_SIZE);
    header.set(nameBytes, 0);
    writeOctal(header, 100, 8, 0o644); // mode
    writeOctal(header, 108, 8, 0); // uid
    writeOctal(header, 116, 8, 0); // gid
    writeOctal(header, 124, 12, sizeBytes); // size
    writeOctal(header, 136, 12, Math.max(0, Math.floor(mtimeSec))); // mtime
    // Checksum field must be 8 ASCII spaces during calculation
    header.fill(0x20, 148, 156);
    header[156] = 0x30; // typeflag '0' (regular file)
    writeAscii(header, 257, 6, "ustar"); // magic "ustar\0" (index 262 stays 0)
    writeAscii(header, 263, 2, "00"); // POSIX ustar version "00"
    writeOctal(header, 329, 8, 0); // devmajor
    writeOctal(header, 337, 8, 0); // devminor

    let checksum = 0;
    for (let i = 0; i < TAR_BLOCK_SIZE; i += 1) {
        checksum += header[i];
    }
    const chkOct = checksum.toString(8).padStart(6, "0");
    writeAscii(header, 148, 6, chkOct);
    header[154] = 0;
    header[155] = 0x20;
    return header;
}

/**
 * Packs `clips` + root `index.json` into a single POSIX USTAR `.tar` `Blob` without copying
 * file bytes into JS memory. Strictly validates SHA-256 format, unique beat IDs, and bounds.
 */
export function buildAudioTarBundle(
    clips: readonly AudioBundleInputClip[],
    options: { nowMs?: number } = {},
): AudioTarBundleResult {
    if (clips.length === 0) {
        throw new Error("Cannot build empty audio archive");
    }
    if (clips.length > STORY_AUDIO_LIMITS.maxArchiveClipFiles) {
        throw new Error(`Too many clips for single archive (${clips.length} > ${STORY_AUDIO_LIMITS.maxArchiveClipFiles})`);
    }

    const mtimeSec = Math.floor((options.nowMs ?? Date.now()) / 1000);
    const usedPaths = new Set<string>(["index.json"]);
    const seenBeats = new Set<string>();
    const entries: AudioArchiveIndexEntry[] = [];
    const normalizedClips: Array<{ path: string; blob: Blob }> = [];

    for (const clip of clips) {
        const beatId = clip.beatId.trim();
        if (!beatId) {
            throw new Error("Archive clip missing non-empty beatId");
        }
        if (seenBeats.has(beatId)) {
            throw new Error(`Duplicate beatId in audio archive: ${beatId}`);
        }
        seenBeats.add(beatId);

        const sha = clip.rawSha256.trim().toLowerCase();
        if (!SHA256_HEX_RE.test(sha)) {
            throw new Error(`Invalid rawSha256 for beat ${beatId}`);
        }
        if (clip.file.size <= 0 || clip.file.size > STORY_AUDIO_LIMITS.maxSingleFileBytes) {
            throw new Error(`Clip size out of bounds for beat ${beatId}: ${clip.file.size}`);
        }

        const archivePath = buildSafeArchiveClipPath(beatId, clip.originalFilename, usedPaths);
        entries.push({
            beat_id: beatId,
            filename: archivePath,
            raw_sha256: sha,
            ...(clip.speaker?.trim() ? { speaker: clip.speaker.trim() } : {}),
        });
        normalizedClips.push({ path: archivePath, blob: clip.file });
    }

    const indexBytes = textEncoder.encode(JSON.stringify({ clips: entries }, null, 2));
    const parts: BlobPart[] = [];
    let totalBytes = 0;

    const appendRecord = (name: string, payload: Uint8Array | Blob, size: number) => {
        const header = buildUstarHeader(name, size, mtimeSec);
        parts.push(header as BlobPart);
        parts.push(payload as BlobPart);
        totalBytes += TAR_BLOCK_SIZE + size;
        const remainder = size % TAR_BLOCK_SIZE;
        if (remainder !== 0) {
            const padLen = TAR_BLOCK_SIZE - remainder;
            parts.push(new Uint8Array(padLen));
            totalBytes += padLen;
        }
    };

    appendRecord("index.json", indexBytes, indexBytes.byteLength);
    for (const item of normalizedClips) {
        appendRecord(item.path, item.blob, item.blob.size);
    }

    // Two 512-byte zero blocks terminate a POSIX USTAR archive.
    parts.push(new Uint8Array(TAR_BLOCK_SIZE * 2));
    totalBytes += TAR_BLOCK_SIZE * 2;

    if (totalBytes > STORY_AUDIO_LIMITS.maxArchiveBytes) {
        throw new Error(`Archive size exceeds limit (${totalBytes} > ${STORY_AUDIO_LIMITS.maxArchiveBytes})`);
    }

    return {
        blob: new Blob(parts, { type: "application/x-tar" }),
        archiveSizeBytes: totalBytes,
        entries,
    };
}

/** Uploads a `Blob` directly to a presigned S3 PUT URL via XHR with upload progress events. */
export function putBlobWithProgress(
    url: string,
    blob: Blob,
    options: {
        contentType?: string;
        onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void;
        signal?: AbortSignal;
    } = {},
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
            reject(new DOMException("Upload aborted", "AbortError"));
            return;
        }
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url, true);
        xhr.withCredentials = false;
        xhr.setRequestHeader("Content-Type", options.contentType ?? "application/x-tar");

        const onAbort = () => {
            xhr.abort();
            reject(new DOMException("Upload aborted", "AbortError"));
        };
        options.signal?.addEventListener("abort", onAbort, { once: true });

        const cleanup = () => {
            options.signal?.removeEventListener("abort", onAbort);
        };

        xhr.upload.onprogress = (event) => {
            const total = event.lengthComputable && event.total > 0 ? event.total : blob.size;
            const loaded = Math.min(event.loaded, total);
            const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
            options.onProgress?.(percent, loaded, total);
        };

        xhr.onload = () => {
            cleanup();
            if (xhr.status >= 200 && xhr.status < 300) {
                options.onProgress?.(100, blob.size, blob.size);
                resolve();
            } else {
                reject(new Error(`PUT HTTP ${xhr.status}`));
            }
        };

        xhr.onerror = () => {
            cleanup();
            reject(new Error("network_error"));
        };

        xhr.ontimeout = () => {
            cleanup();
            reject(new Error("request_timeout"));
        };

        xhr.send(blob);
    });
}

/** Formats milliseconds into a compact `m:ss` duration label. */
export function formatDurationMs(durationMs: number): string {
    const safeSec = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(safeSec / 60);
    const seconds = safeSec % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Formats byte counts into compact human-readable KiB/MiB text. */
export function formatByteSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
    }
    if (bytes >= 1024) {
        return `${Math.round(bytes / 1024)} KiB`;
    }
    return `${Math.max(0, Math.round(bytes))} B`;
}
