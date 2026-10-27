"use client";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { MolyEntry, MolyLocale, MolyTextSession } from "./contract";
import type { ResourceSnapshot } from "./catalog";
import { entryTextKey, loadTextModule, resolveEntryText, translationPreviewOrigin, type EntryTextResult, type TextModule } from "./text";

export function useEntryText(snapshot: ResourceSnapshot | undefined, entry: MolyEntry | undefined,
    locale: MolyLocale, moduleUrl: string | undefined) {
    const key = entryTextKey(snapshot, entry, locale, moduleUrl);
    const [result, setResult] = useState<EntryTextResult | null>(null);
    const sequence = useRef(0);
    const pin = useCallback((value: EntryTextResult) => {
        if (value.key !== key) return;
        sequence.current++;
        setResult(value);
    }, [key]);
    useEffect(() => {
        if (!snapshot || !entry || !moduleUrl) return;
        const request = ++sequence.current;
        let cancelled = false;
        resolveEntryText(snapshot, entry, locale, moduleUrl).then(value => {
            if (!cancelled && request === sequence.current) setResult(value);
        }).catch(error => { if (!cancelled) console.warn("[moly] display translation unavailable", error); });
        return () => { cancelled = true; };
    }, [snapshot, entry, locale, moduleUrl, key]);
    return { ...(result?.key === key ? result : { entry, session: null }), pin };
}

/** A preview is accepted only from the trusted editor window that opened this page. */
export function useTranslationPreview(snapshot: ResourceSnapshot | undefined, entry: MolyEntry | undefined, moduleUrl?: string) {
    const identity = JSON.stringify([snapshot?.id, snapshot?.region, snapshot?.textSource?.url, snapshot?.textSource?.sha256,
        snapshot?.textSource?.bytes, entry?.key, entry?.scriptKey, moduleUrl]);
    const region = snapshot?.region, sourceUrl = snapshot?.textSource?.url,
        sourceHash = snapshot?.textSource?.sha256, sourceBytes = snapshot?.textSource?.bytes;
    const content = entry?.key, scriptKey = entry?.scriptKey;
    const [preview, setPreview] = useState<{ identity: string; session: MolyTextSession; entry: MolyEntry } | null>(null);
    const accept = useEffectEvent((sdk: TextModule, session: MolyTextSession) => {
        if (entry) setPreview({ identity, session, entry: sdk.localizeEntry(entry, session) });
    });
    useEffect(() => {
        const nonce = new URLSearchParams(location.search).get("translationPreview");
        if (!nonce || !/^[a-f0-9]{32,64}$/.test(nonce) || !window.opener || !region || !sourceUrl || !sourceHash || !sourceBytes || !content || !scriptKey || !moduleUrl) return;
        const opener = window.opener;
        const origin = translationPreviewOrigin();
        let cancelled = false;
        let sequence = 0;
        const abort = new AbortController();
        const receive = async (event: MessageEvent) => {
            const data = event.data;
            if (event.origin !== origin || event.source !== opener || data?.source !== "nexttrans-mysekai"
                || data.type !== "preview" || data.nonce !== nonce || data.region !== region || data.content !== content) return;
            const draft = data.session as MolyTextSession;
            if (!draft || draft.official !== "" || !["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"].includes(draft.locale)
                || typeof draft.community !== "string" || new TextEncoder().encode(draft.community).byteLength > 2 * 1048576) return;
            const request = ++sequence;
            try {
                const overlay = JSON.parse(draft.community);
                if (overlay.schema !== "moly-text-overlay/1" || overlay.sourceRegion !== region || overlay.locale !== draft.locale
                    || !Array.isArray(overlay.entries) || overlay.entries.some((line: { source?: unknown }) => line?.source !== "human")) return;
                const sdk = await loadTextModule(moduleUrl);
                // The editor supplies draft display strings only. Source IDs,
                // bindings and hashes come from this immutable asset snapshot.
                const source = await sdk.loadTextSession({ source: { url: sourceUrl, sha256: sourceHash, bytes: sourceBytes }, region,
                    locale: draft.locale, scriptKey }, AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]));
                if (!source) return;
                const session: MolyTextSession = { source: source.source, official: "", community: draft.community, locale: draft.locale };
                if (!cancelled && request === sequence) accept(sdk, session);
            } catch (error) { if (!cancelled) console.warn("[moly] invalid translation preview", error); }
        };
        window.addEventListener("message", receive);
        opener.postMessage({ source: "moly-preview", type: "ready", nonce }, origin);
        return () => { cancelled = true; abort.abort(); window.removeEventListener("message", receive); };
    }, [region, sourceUrl, sourceHash, sourceBytes, content, scriptKey, moduleUrl, identity]);
    return preview?.identity === identity ? preview : null;
}
