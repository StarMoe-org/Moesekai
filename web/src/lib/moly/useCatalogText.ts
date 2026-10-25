"use client";
import { useEffect, useState } from "react";
import type { ResourceSnapshot } from "./catalog";
import type { MolyLocale } from "./contract";
import { loadTextModule, translationPreviewOrigin } from "./text";
import { molyResourceBase } from "./resourceBase";

export type CatalogTextIndex = Record<string, { title: string; search: string }>;

export function useCatalogText(snapshot: ResourceSnapshot | undefined, locale: MolyLocale, moduleUrl?: string) {
    const identity = JSON.stringify([snapshot?.region, snapshot?.textSource, locale, moduleUrl]);
    const [result, setResult] = useState<{ identity: string; index: CatalogTextIndex } | null>(null);
    const region = snapshot?.region, url = snapshot?.textSource?.url,
        sha256 = snapshot?.textSource?.sha256, bytes = snapshot?.textSource?.bytes;
    useEffect(() => {
        if (!region || !url || !sha256 || !bytes || !moduleUrl) return;
        const abort = new AbortController();
        let cancelled = false;
        void (async () => {
            const sdk = await loadTextModule(moduleUrl) as Awaited<ReturnType<typeof loadTextModule>> & {
                loadTextIndex?: (options: { source: { url: string; sha256: string; bytes: number }; official: string;
                    community: string; region: string; locale: MolyLocale }, signal: AbortSignal) => Promise<CatalogTextIndex>;
            };
            if (!sdk.loadTextIndex || cancelled) return;
            const index = await sdk.loadTextIndex({ source: { url, sha256, bytes }, region, locale,
                official: `${molyResourceBase()}translations/${region}/${locale}/latest.json`,
                community: `${translationPreviewOrigin()}/files/mysekai/${region}/${locale}/latest.json` }, abort.signal);
            if (!cancelled) setResult({ identity, index });
        })().catch(error => { if (!cancelled) console.warn("[moly] translated search unavailable", error); });
        return () => { cancelled = true; abort.abort(); };
    }, [identity, region, url, sha256, bytes, locale, moduleUrl]);
    return result?.identity === identity ? result.index : undefined;
}
