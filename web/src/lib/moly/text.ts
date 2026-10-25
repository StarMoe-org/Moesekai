import type { MolyEntry, MolyLocale, MolyTextSession } from "./contract";
import type { ResourceSnapshot } from "./catalog";
import { molyResourceBase } from "./resourceBase";

export type TextModule = {
    loadTextSession(options: { source: { url: string; sha256: string; bytes: number }; official?: string;
        community?: string; region: string; locale: MolyLocale; scriptKey: string }, signal?: AbortSignal): Promise<MolyTextSession | null>;
    localizeEntry(entry: MolyEntry, session: MolyTextSession | null): MolyEntry;
};
export type EntryTextResult = { key: string; session: MolyTextSession | null; entry: MolyEntry };
// Page-local pins. Reading and playback share the same publication selection;
// none of these keys participates in a game resource snapshot's identity.
const sessions = new Map<string, Promise<MolyTextSession | null>>();

export async function loadTextModule(moduleUrl: string): Promise<TextModule> {
    const url = new URL(moduleUrl, location.origin);
    if (url.origin !== location.origin || url.username || url.password || url.search || url.hash
        || !/^\/moly\/releases\/[a-z0-9._-]+\/embed\.mjs$/.test(url.pathname))
        throw new Error("moly_text_module_invalid");
    const sdk = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url.href) as TextModule;
    if (typeof sdk.loadTextSession !== "function" || typeof sdk.localizeEntry !== "function")
        throw new Error("moly_text_runtime_unavailable");
    return sdk;
}

export function entryTextKey(snapshot: ResourceSnapshot | undefined, entry: MolyEntry | undefined,
    locale: MolyLocale, moduleUrl: string | undefined): string {
    return JSON.stringify([snapshot?.id, snapshot?.region, snapshot?.textSource?.url, snapshot?.textSource?.sha256,
        snapshot?.textSource?.bytes, entry?.key, entry?.scriptKey, locale, moduleUrl]);
}

export async function resolveEntryText(snapshot: ResourceSnapshot, entry: MolyEntry, locale: MolyLocale,
    moduleUrl: string, options: { refresh?: boolean } = {}): Promise<EntryTextResult> {
    const key = entryTextKey(snapshot, entry, locale, moduleUrl);
    if (!snapshot.textSource || !entry.scriptKey) return { key, session: null, entry };
    const sdk = await loadTextModule(moduleUrl);
    let request = options.refresh ? undefined : sessions.get(key);
    if (!request) {
        request = sdk.loadTextSession({ source: snapshot.textSource, region: snapshot.region,
            locale, scriptKey: entry.scriptKey!,
            official: `${molyResourceBase()}translations/${snapshot.region}/${locale}/latest.json`,
            community: `${translationPreviewOrigin()}/files/mysekai/${snapshot.region}/${locale}/latest.json` });
        sessions.set(key, request);
        if (sessions.size > 64) sessions.delete(sessions.keys().next().value!);
        const owned = request;
        void request.catch(() => { if (sessions.get(key) === owned) sessions.delete(key); });
    }
    const session = await request;
    // Cache immutable text documents, not an entry object from an earlier read.
    return { key, session, entry: sdk.localizeEntry(entry, session) };
}

export function translationPreviewOrigin(): string {
    return new URL(process.env.NEXT_PUBLIC_TRANSLATION_ORIGIN || "https://translation.exmeaning.com").origin;
}
