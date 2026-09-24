/**
 * Public directory holding the Moly publication: `manifest.json`, the cache
 * worker, and the immutable `releases/`, `snapshots/` and `asset-store/`
 * trees. It includes the provider path (for an S3 bucket, the bucket segment)
 * and ends in "/", e.g. `https://assets.example.com/bucket/`. Empty means the
 * feature is not deployed.
 *
 * The value must already be canonical: the proxy destination in
 * next.config.ts and the URLs the client builds both come from here, and a
 * value that the URL parser would rewrite could make them disagree.
 */
export function molyResourceBase(): string {
    const raw = process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE?.trim() || "";
    if (!raw) return "";
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error("moly_resource_base_invalid");
    }
    if (/[?#\\\s]/.test(raw) || parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password
        || parsed.search || parsed.hash || parsed.pathname === "/" || !parsed.pathname.endsWith("/")
        || /[\%]/.test(parsed.pathname) || parsed.pathname.split("/").some(part => part === "." || part === "..")
        || raw !== parsed.href) throw new Error("moly_resource_base_invalid");
    return parsed.href;
}

/**
 * Maps a logical publication path (`/moly/snapshots/<id>/...`) to its public
 * URL below the resource base. Logical paths stay the manifest's identity;
 * only the host decides where the bytes are served from.
 */
export function molyResourceUrl(path: string): string {
    if (!/^\/moly\/(?:snapshots|releases|asset-store)\//.test(path) || /[\%?#]/.test(path)
        || path.split("/").some(part => part === "." || part === "..")) throw new Error("moly_resource_path_invalid");
    const base = molyResourceBase();
    return base ? base + path.slice("/moly/".length) : path;
}
