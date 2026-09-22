/** Complete public object-store directory, including the provider's path. */
export function molyResourceBase(): string {
    const raw = process.env.NEXT_PUBLIC_MOLY_RESOURCE_BASE?.trim() || "";
    if (!raw) return "";
    let parsed: URL;
    try { parsed = new URL(raw); }
    catch { throw new Error("moly_resource_base_invalid"); }
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password
        || parsed.search || parsed.hash || parsed.pathname === "/" || !parsed.pathname.endsWith("/")
        || /[\\%]/.test(parsed.pathname) || parsed.pathname.split("/").some(part => part === "." || part === "..")
        || raw !== parsed.href) throw new Error("moly_resource_base_invalid");
    return parsed.href;
}

/** The old origin-only route remains valid for deployments that map /moly/. */
export function molyResourceOrigin(): string {
    const base = molyResourceBase();
    const raw = process.env.NEXT_PUBLIC_MOLY_RESOURCE_ORIGIN?.trim() || "";
    if (!raw) return base ? new URL(base).origin : "";

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
    if (base && parsed.origin !== new URL(base).origin) throw new Error("moly_resource_config_mismatch");
    return parsed.origin;
}

export function molyResourceUrl(path: string): string {
    if (!/^\/moly\/(?:snapshots|releases|asset-store)\//.test(path) || /[\\%?#]/.test(path)
        || path.split("/").some(part => part === "." || part === "..")) throw new Error("moly_resource_path_invalid");
    const base = molyResourceBase();
    return base ? new URL(path.slice("/moly/".length), base).href : molyResourceOrigin() + path;
}
