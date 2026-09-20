/** Only public, immutable Moly artifacts are sent to this independently deployed origin. */
export function molyResourceOrigin(): string {
    const raw = process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN?.trim() || "";
    if (!raw) return "";

    // Keep the origin configurable at build time. Resource paths are appended
    // separately below, so accepting a path/query/credential here would make
    // the immutable `/moly/...` contract ambiguous (and could escape the
    // intended public CDN origin).
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error("moly_resource_origin_invalid");
    }
    if (!/^https:\/\/[^/?#\\\s]+\/?$/i.test(raw)
        || parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password
        || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("moly_resource_origin_invalid");
    return parsed.origin;
}

export function molyResourceUrl(path: string): string {
    if (!/^\/moly\/(?:snapshots|releases|asset-store)\//.test(path) || /[\\%?#]/.test(path)
        || path.split("/").some(part => part === "." || part === "..")) throw new Error("moly_resource_path_invalid");
    return molyResourceOrigin() + path;
}
