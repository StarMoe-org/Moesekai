/**
 * Reads a deck engine's user data through moesekai-api (/api/sekai) with the visitor's StarMoe session: the
 * route the account library uses once the visitor is signed in, which reads Haruki through their StarMoe Connect
 * link where it can and Haruki's public API otherwise.
 *
 * Runs inside the deck workers, so it keeps to fetch and the API origin helpers (no account store, no React).
 * Kept free of path aliases so the tests can import it directly.
 */
import { MOESEKAI_API_ORIGIN, apiCredentials, uncachedUrl } from "../moesekai-api-origin.ts";

/**
 * The suite of `userId` on `server` limited to `keys` (comma-separated), as moesekai-api returns it.
 *
 * Resolves to null when moesekai-api cannot answer for this visitor (signed out meanwhile, route not deployed,
 * unavailable): the caller then reads the old way. Throws `USER_NOT_FOUND` / `API_NOT_PUBLIC`, the codes the
 * deck pages already show, or `Failed to fetch user data (<status>)`.
 */
export async function fetchStarMoeUserData(
    server: string,
    userId: string,
    keys: string,
    origin: string = MOESEKAI_API_ORIGIN,
): Promise<unknown | null> {
    const url = `${origin}/api/sekai/${encodeURIComponent(server)}/suite/${encodeURIComponent(userId)}?key=${encodeURIComponent(keys)}`;
    const response = await fetch(uncachedUrl(url), {
        headers: { Accept: "application/json" },
        credentials: apiCredentials(origin),
        cache: "no-store",
    });
    if (response.ok) {
        return await response.json();
    }

    let code = "";
    try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === "string") code = body.error;
    } catch {
        // not JSON
    }
    if (response.status === 404 && code === "data_not_public") throw new Error("API_NOT_PUBLIC");
    if (response.status === 400) throw new Error("USER_NOT_FOUND");
    if (response.status === 401 || response.status === 404 || response.status === 503) return null;
    throw new Error(`Failed to fetch user data (${response.status})`);
}
