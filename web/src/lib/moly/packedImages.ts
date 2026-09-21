"use client";

import type { ResourceSnapshot } from "./catalog";

interface PackClient {
    catalog(): Promise<{ region: string; version: string }>;
    resolve(path: string): Promise<{ bytes: number }>;
    read(path: string): Promise<Uint8Array>;
}
interface PackModule { PackClient: new (root: string, catalog: string, options: { required: boolean }) => PackClient; }
const clients = new Map<string, Promise<PackClient>>();
let active = 0;
const waiting: Array<() => void> = [];

async function clientFor(snapshot: ResourceSnapshot): Promise<PackClient> {
    if (!snapshot.packs || !snapshot.assetCatalog || !snapshot.releaseModule) throw new Error("packed_snapshot_invalid");
    const releaseModule = snapshot.releaseModule;
    const key = `${snapshot.releaseModule}:${snapshot.region}:${snapshot.assetCatalog}`;
    let pending = clients.get(key);
    if (!pending) {
        pending = (async () => {
            const url = new URL(releaseModule.replace(/embed\.mjs$/, "asset-pack-client.mjs"), location.origin);
            if (url.origin !== location.origin || !/^\/moly\/releases\/[a-z0-9._-]+\/asset-pack-client\.mjs$/.test(url.pathname)) throw new Error("packed_module_invalid");
            // Load only the release's small checksum/codec reader, never its renderer.
            const packModule = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url.href) as PackModule;
            const client = new packModule.PackClient(snapshot.assets, snapshot.assetCatalog!, { required: true });
            const catalog = await client.catalog();
            if (catalog.region !== snapshot.region || catalog.version !== snapshot.assetReleaseVersion) throw new Error("packed_source_mismatch");
            return client;
        })();
        clients.set(key, pending);
        void pending.catch(() => clients.delete(key));
    }
    return pending;
}

/** Resolve source thumbnails through the same verified v2 reader as the runtime. */
export async function packedImage(snapshot: ResourceSnapshot, image: string): Promise<Blob> {
    const path = image.replace(/^moly:\/\//, "");
    if (path.startsWith("/") || /[:\\]/.test(path) || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("packed_image_invalid");
    const mime = ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" } as Record<string, string>)[path.split(".").pop()?.toLowerCase() ?? ""];
    if (!mime) throw new Error("packed_image_type");
    await new Promise<void>(resolve => { const enter = () => { active++; resolve(); }; if (active < 2) enter(); else waiting.push(enter); });
    try {
        const client = await clientFor(snapshot);
        if ((await client.resolve(path)).bytes > 16 * 1048576) throw new Error("packed_image_too_large");
        const bytes = await client.read(path);
        return new Blob([new Uint8Array(bytes)], { type: mime });
    } finally { active--; waiting.shift()?.(); }
}
