/**
 * Where moesekai-api (sign-in and guess-music) is reached from the browser.
 *
 * Production builds set NEXT_PUBLIC_MOESEKAI_API_ORIGIN to
 * https://passport.pjsk.moe, next to the passport. The session cookie belongs
 * to that origin, and requests carry it with `credentials: "include"` (the
 * API allows exactly this site with CORS).
 *
 * Empty (local development) means the page's own origin, where the dev server
 * forwards /api/auth/ and /api/guess-music/.
 *
 * Kept free of path aliases and React so the tests can import it directly.
 */
export const MOESEKAI_API_ORIGIN = (process.env.NEXT_PUBLIC_MOESEKAI_API_ORIGIN ?? "").trim().replace(/\/+$/, "");

/** The credentials mode for requests to `baseUrl`: the session cookie must travel to another origin too. */
export function apiCredentials(baseUrl: string): RequestCredentials {
    return baseUrl ? "include" : "same-origin";
}

/**
 * `url` with a one-off `_` parameter, for every GET to moesekai-api.
 *
 * Cloudflare caches every 200 on the pjsk.moe zone (passport.pjsk.moe
 * included) for a minute whatever the response says, and cookies are not part
 * of its cache key: without this, one visitor's answer (who is signed in,
 * today's ranked status, the "me" row of a leaderboard) would be handed to the
 * next. The query string is part of the key, so a value only this request
 * knows keeps its answer to itself.
 */
export function uncachedUrl(url: string): string {
    const nonce =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const hashAt = url.indexOf("#");
    const base = hashAt < 0 ? url : url.slice(0, hashAt);
    return `${base}${base.includes("?") ? "&" : "?"}_=${nonce}${hashAt < 0 ? "" : url.slice(hashAt)}`;
}
