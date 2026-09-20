"use client";

import { useEffect, useState } from "react";
import type { MolyEntry } from "./contract";
import { fetchContentCatalog, fetchContentDetail, fetchRuntimeManifest, type CatalogEntry, type ContentCatalog, type ResourceSnapshot, type RuntimeManifest } from "./catalog";

/** Results carry their request identity; a late response can never cross a snapshot boundary. */
export function useRuntimeManifest(retry: number, snapshot?: string | null, region?: string | null) {
    const key = `${retry}:${region ?? ""}:${snapshot ?? ""}`;
    const [result, setResult] = useState<{ key: string; value?: RuntimeManifest; failed?: boolean } | null>(null);
    useEffect(() => {
        const abort = new AbortController();
        fetchRuntimeManifest(abort.signal, snapshot ? { snapshot, region } : undefined).then(value => { if (!abort.signal.aborted) setResult({ key, value }); })
            .catch(() => { if (!abort.signal.aborted) setResult({ key, failed: true }); });
        return () => abort.abort();
    }, [key, snapshot, region]);
    // Pinning a catalog that was just discovered must not blank/recreate the
    // reading surface while the exact same manifest identity is revalidated.
    const compatible = result?.key === key || Boolean(snapshot && result?.key.startsWith(`${retry}:`)
        && result.value?.snapshots.some(item => item.id === snapshot && (!region || item.region === region)));
    return { manifest: compatible ? result?.value : undefined, failed: result?.key === key && Boolean(result.failed) };
}

export function useContentCatalog(snapshot: ResourceSnapshot | undefined, retry: number) {
    const [result, setResult] = useState<{ key: string; value?: ContentCatalog; failed?: boolean } | null>(null);
    const key = snapshot ? `${snapshot.id}:${retry}` : "";
    useEffect(() => {
        if (!snapshot) return;
        const abort = new AbortController();
        fetchContentCatalog(snapshot, abort.signal).then(value => { if (!abort.signal.aborted) setResult({ key, value }); })
            .catch(() => { if (!abort.signal.aborted) setResult({ key, failed: true }); });
        return () => abort.abort();
    }, [snapshot, key]);
    return { catalog: result?.key === key ? result.value : undefined, failed: result?.key === key && Boolean(result.failed) };
}

export function useContentDetail(snapshot: ResourceSnapshot | undefined, entry: CatalogEntry | undefined, retry: number) {
    const [result, setResult] = useState<{ key: string; value?: MolyEntry; failed?: boolean } | null>(null);
    const key = snapshot && entry ? `${snapshot.id}:${entry.key}:${retry}` : "";
    useEffect(() => {
        if (!snapshot || !entry) return;
        const abort = new AbortController();
        fetchContentDetail(snapshot, entry, abort.signal).then(value => { if (!abort.signal.aborted) setResult({ key, value }); })
            .catch(() => { if (!abort.signal.aborted) setResult({ key, failed: true }); });
        return () => abort.abort();
    }, [snapshot, entry, key]);
    return { detail: result?.key === key ? result.value : undefined, loading: Boolean(key) && result?.key !== key, failed: result?.key === key && Boolean(result.failed) };
}
