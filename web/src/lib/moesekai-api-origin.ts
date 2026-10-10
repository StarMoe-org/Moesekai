/**
 * Where moesekai-api (sign-in and guess-music) is reached from the browser.
 *
 * Production builds set NEXT_PUBLIC_MOESEKAI_API_ORIGIN to
 * https://passport.pjsk.moe: pjsk.moe's own /api/ sits behind a Cloudflare
 * rule that caches responses whatever Cache-Control says, so per-user answers
 * must not go through it. The session cookie then belongs to that origin, and
 * requests carry it with `credentials: "include"` (the API allows exactly this
 * site with CORS).
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
