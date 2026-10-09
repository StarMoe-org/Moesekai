/**
 * Plumbing shared by the guess-music API clients (daily-api.ts and
 * practice-api.ts): the canonical request URL and error bodies.
 *
 * Both clients call the page's own origin by default, never
 * NEXT_PUBLIC_API_URL: /api/guess-music/* sits behind the same forwarding as
 * /api/auth/*, and moesekai-api's session cookie is first-party to the page
 * (see moesekai-account.ts), so another API host would never see it.
 *
 * Kept free of path aliases and React so the tests can import it directly.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function isAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/**
 * The URL to request for an API path. Absolute URLs pass through; a relative
 * path is joined to `baseUrl` and ends in a slash before its query. The site
 * runs with Next's `trailingSlash`, so the slash-less form would first take a
 * 308 redirect (POSTs included) in front of the dev proxy; the Go API trims
 * the slash, so both forms reach the same handler.
 */
export function apiUrl(baseUrl: string, path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const queryAt = path.search(/[?#]/);
    const pathname = queryAt < 0 ? path : path.slice(0, queryAt);
    const rest = queryAt < 0 ? "" : path.slice(queryAt);
    const canonical = pathname.endsWith("/") ? pathname : `${pathname}/`;
    return `${baseUrl}${canonical.startsWith("/") ? "" : "/"}${canonical}${rest}`;
}

export interface ApiErrorBody {
    /** The server's error code, or "http_<status>" when it sent none. */
    code: string;
    message: string;
    /** The parsed JSON body, when there was one. */
    data: Record<string, unknown> | null;
}

/** Reads an error response ({"error": "<code>", "message": "<text>"}); a non-JSON body falls back to the status. */
export async function readApiError(response: Response): Promise<ApiErrorBody> {
    let data: Record<string, unknown> | null = null;
    try {
        const parsed: unknown = await response.json();
        if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
        // Not JSON (a proxy error page).
    }
    const code = typeof data?.error === "string" && data.error ? data.error : `http_${response.status}`;
    const message = typeof data?.message === "string" && data.message ? data.message : response.statusText;
    return { code, message, data };
}
