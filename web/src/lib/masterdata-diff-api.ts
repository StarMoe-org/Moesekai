import { MOESEKAI_API_ORIGIN, apiCredentials } from "@/lib/moesekai-api-origin";
import type {
    MasterdataCommitDiffResponse,
    MasterdataDiffServer,
    MasterdataFileDiffResponse,
    MasterdataSummaryResponse,
    MasterdataVersionsResponse,
} from "@/types/masterdataDiff";

export class MasterdataDiffApiError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string) {
        super(`Masterdata diff API error (${status}): ${code}`);
        this.name = "MasterdataDiffApiError";
        this.status = status;
        this.code = code;
    }
}

async function fetchDiffJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const url = `${MOESEKAI_API_ORIGIN}${path}`;
    const res = await fetch(url, {
        method: "GET",
        credentials: apiCredentials(MOESEKAI_API_ORIGIN),
        signal,
    });
    if (!res.ok) {
        let code = `http_${res.status}`;
        try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) code = body.error;
        } catch {
            // ignore non-JSON error body
        }
        throw new MasterdataDiffApiError(res.status, code);
    }
    return (await res.json()) as T;
}

export function fetchMasterdataVersions(
    server: MasterdataDiffServer,
    page = 1,
    limit = 20,
    signal?: AbortSignal,
): Promise<MasterdataVersionsResponse> {
    const qs = new URLSearchParams({
        server,
        page: String(page),
        limit: String(limit),
    });
    return fetchDiffJson<MasterdataVersionsResponse>(`/api/masterdata-diff/versions?${qs.toString()}`, signal);
}

export function fetchMasterdataCommitDiff(
    server: MasterdataDiffServer,
    sha: string,
    signal?: AbortSignal,
): Promise<MasterdataCommitDiffResponse> {
    const qs = new URLSearchParams({ server, sha });
    return fetchDiffJson<MasterdataCommitDiffResponse>(`/api/masterdata-diff/diff?${qs.toString()}`, signal);
}

export function fetchMasterdataFileDiff(
    server: MasterdataDiffServer,
    sha: string,
    file: string,
    options?: {
        change?: "all" | "added" | "modified" | "removed";
        offset?: number;
        limit?: number;
        signal?: AbortSignal;
    },
): Promise<MasterdataFileDiffResponse> {
    const qs = new URLSearchParams({ server, sha, file });
    if (options?.change && options.change !== "all") {
        qs.set("change", options.change);
    }
    if (options?.offset !== undefined && options.offset > 0) {
        qs.set("offset", String(options.offset));
    }
    if (options?.limit !== undefined && options.limit > 0) {
        qs.set("limit", String(options.limit));
    }
    return fetchDiffJson<MasterdataFileDiffResponse>(`/api/masterdata-diff/file-diff?${qs.toString()}`, options?.signal);
}

export function fetchMasterdataSummary(
    server: MasterdataDiffServer,
    sha: string,
    locale: string,
    signal?: AbortSignal,
): Promise<MasterdataSummaryResponse> {
    const qs = new URLSearchParams({ server, sha, locale });
    return fetchDiffJson<MasterdataSummaryResponse>(`/api/masterdata-diff/summary?${qs.toString()}`, signal);
}
