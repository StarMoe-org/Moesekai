import type { ResourceSnapshot } from "./catalog";

export interface SourcePortrait { unit: number; model: string; rig: string; file: string; width: number; height: number; }
interface PortraitManifest { schemaVersion: 1; generator: string; region: string; version: string; expected: number; portraits: SourcePortrait[]; }
const pending = new Map<string, Promise<Map<number, string>>>();

/** Tiny static index only: no renderer, GLB, gameplay catalogue or base pack. */
export function sourcePortraits(snapshot: ResourceSnapshot): Promise<Map<number, string>> {
    const previous = pending.get(snapshot.id);
    if (previous) return previous;
    const base = snapshot.catalog.slice(0, -"index.json".length) + "portraits/";
    const work = (async () => {
        const response = await fetch(base + "manifest.json", { cache: "force-cache", credentials: "omit", redirect: "error" });
        if (!response.ok || Number(response.headers.get("content-length")) > 131072) throw new Error("portrait_unavailable");
        const text = await response.text();
        if (text.length > 131072) throw new Error("portrait_index_invalid");
        const manifest = JSON.parse(text) as PortraitManifest;
        if (manifest.schemaVersion !== 1 || manifest.generator !== "moly-root-chara-head-v1" || manifest.region !== snapshot.region
            || manifest.version !== snapshot.version || !Array.isArray(manifest.portraits) || manifest.portraits.length !== manifest.expected
            || manifest.portraits.length > 256) throw new Error("portrait_source_mismatch");
        const result = new Map<number, string>();
        for (const row of manifest.portraits) {
            if (!Number.isSafeInteger(row.unit) || row.unit <= 0 || result.has(row.unit) || row.file !== `unit-${row.unit}.png`
                || row.width !== 512 || row.height !== 512 || row.model !== `sd_${row.unit + 100}.glb`
                || row.rig !== `sd_${row.unit + 100}.rig.json`) throw new Error("portrait_identity_invalid");
            result.set(row.unit, base + row.file);
        }
        return result;
    })();
    pending.set(snapshot.id, work);
    void work.catch(() => pending.delete(snapshot.id));
    return work;
}
