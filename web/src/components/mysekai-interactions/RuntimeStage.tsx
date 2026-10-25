"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyPlayerDataCommand, MolyPlayerDataState, MolyBoot, MolyError, MolyFilters, MolyKey, MolyLocale, MolyMount, MolySnapshot, MolyTextSession, MountOptions } from "@/lib/moly/contract";
import { fetchContentCatalog, fetchContentDetail } from "@/lib/moly/catalog";
import { entryTextKey, resolveEntryText, type EntryTextResult } from "@/lib/moly/text";
import type { MolyRelease, ResourceSnapshot } from "@/lib/moly/catalog";
import { resourceCacheCommand } from "@/lib/moly/resourceCache";

export interface PlayerSession {
    /** Unique per request; drives React identity and debugging only. */
    id: number;
    /**
     * Realm identity. The stage mounts one runtime realm per epoch and every
     * content switch inside that epoch goes through the live mount handle, so
     * switching conversations never resets the renderer, the audio graph or
     * the loaded world. Only an explicit Close/Retry/region change raises it.
     */
    epoch: number;
    snapshot: ResourceSnapshot;
    release: MolyRelease;
    initial: MolyFilters;
    content: MolyKey | null;
    play: MolyKey | null;
    preview?: boolean;
    soundEnabled: boolean;
    /** Text locale captured by the initial Play, independent of later UI changes. */
    textLocale: MolyLocale;
    textSession?: MolyTextSession | null;
    /** Retry discovers current publications before pinning reading and playback. */
    refreshText?: boolean;
}
export interface RuntimeStageHandle {
    setTextSession(key: MolyKey | null, session: MolyTextSession | null): void;
    playerData(value: MolyPlayerDataCommand): void;
    play(key: MolyKey): void;
    preview(key: MolyKey): void;
    browse(filters: MolyFilters): void;
    setWeather(phenomenon: number): void;
    setSite(site: string): void;
    setSoundEnabled(enabled: boolean): void;
    select(key: MolyKey): void;
    stop(): void;
    close(): Promise<boolean>;
}
interface Props {
    onTextResolved(value: EntryTextResult): void;
    onPlayerData(value: MolyPlayerDataState | null): void;
    session: PlayerSession;
    onSnapshot(value: MolySnapshot | null): void;
    onBoot(value: MolyBoot | null): void;
    onError(value: MolyError | null): void;
}
type EmbedModule = { mountMoly(container: HTMLElement, options: MountOptions): MolyMount };

async function playbackText(request: PlayerSession, key: MolyKey, locale: MolyLocale,
    override: MolyTextSession | null, refresh: boolean): Promise<{ session: MolyTextSession | null; result?: EntryTextResult }> {
    if (override?.locale === locale) return { session: override };
    if (!request.snapshot.textSource) return { session: null };
    const signal = AbortSignal.timeout(15000);
    const catalog = await fetchContentCatalog(request.snapshot, signal);
    const row = catalog.entries.find(row => row.key === key);
    if (!row) return { session: null };
    const entry = await fetchContentDetail(request.snapshot, row, signal);
    try {
        const result = await resolveEntryText(request.snapshot, entry, locale, request.release.module, { refresh });
        return { session: result.session, result };
    } catch (error) {
        console.warn("[moly] display translation unavailable, using source", error);
        return { session: null, result: { key: entryTextKey(request.snapshot, entry, locale, request.release.module), entry, session: null } };
    }
}

const RuntimeStage = forwardRef<RuntimeStageHandle, Props>(function RuntimeStage({ session, onSnapshot, onBoot, onError, onPlayerData, onTextResolved }, ref) {
    const router = useRouter();
    const container = useRef<HTMLDivElement>(null);
    const mount = useRef<MolyMount | null>(null);
    const queued = useRef<Array<(player: MolyMount) => void>>([]);
    const textOverride = useRef<{ key: MolyKey; session: MolyTextSession } | null>(null);
    const playSequence = useRef(0);
    const { resolvedColorScheme, themeColor } = useTheme();
    const { locale, registerLocaleNavigation } = useI18n();
    const state = useRef({ resolvedColorScheme, themeColor, locale, onSnapshot, onBoot, onError, onPlayerData, onTextResolved });

    useEffect(() => {
        state.current = { resolvedColorScheme, themeColor, locale, onSnapshot, onBoot, onError, onPlayerData, onTextResolved };
        mount.current?.setTheme({ mode: resolvedColorScheme, accent: themeColor });
        mount.current?.setLocale(locale);
    }, [resolvedColorScheme, themeColor, locale, onSnapshot, onBoot, onError, onPlayerData, onTextResolved]);

    useEffect(() => registerLocaleNavigation(url => {
        // Locale is already applied by the site's I18nContext. Use the native
        // History API supported by App Router for locale switching: no new
        // server navigation can replace this page's live renderer realm.
        window.history.replaceState(null, "", url);
    }), [registerLocaleNavigation]);

    useEffect(() => {
        let cancelled = false;
        let navigating = false;
        const leave = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
            if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
            const target = new URL(link.href, location.href);
            if (target.origin !== location.origin || target.pathname === location.pathname) return;
            // Controlled site navigation awaits the one actual world owner.
            // Browser/tab destruction still has synchronous dispose as fallback.
            event.preventDefault();
            event.stopPropagation();
            if (navigating) return;
            navigating = true;
            playSequence.current++;
            queued.current = [];
            const destination = target.pathname + target.search + target.hash;
            void (mount.current?.close() ?? Promise.resolve(true))
                .catch(() => false)
                .then(() => { if (!cancelled) router.push(destination); })
                // The click was already swallowed above. If the hand-off fails,
                // fall back to a real navigation rather than leaving the page
                // with every internal link silently dead.
                .catch(() => { if (!cancelled) window.location.assign(target.href); })
                .finally(() => { navigating = false; });
        };
        document.addEventListener("click", leave, true);
        return () => { cancelled = true; document.removeEventListener("click", leave, true); };
    }, [router]);

    useImperativeHandle(ref, () => {
        const send = (action: (player: MolyMount) => void) => {
            if (mount.current) action(mount.current);
            else if (queued.current.length < 64) queued.current.push(action);
        };
        const play = (key: MolyKey, preview: boolean) => {
            const sequence = ++playSequence.current;
            const locale = state.current.locale;
            const override = textOverride.current?.key === key ? textOverride.current.session : null;
            // Keep gesture activation synchronous even when text loads first.
            const frame = mount.current?.frame;
            try { frame?.contentWindow?.dispatchEvent(new Event("moly-activate")); } catch { /* frame still loading */ }
            const run = async () => {
                const text = await playbackText(session, key, locale, override, true);
                if (sequence !== playSequence.current) return;
                send(player => {
                    if (sequence !== playSequence.current) return;
                    if (text.result) state.current.onTextResolved(text.result);
                    player.setTextSession?.(text.session);
                    if (preview) player.preview(key); else player.play(key);
                });
            };
            void run().catch(error => {
                if (sequence !== playSequence.current) return;
                console.warn("[moly] translated playback unavailable, using source", error);
                send(player => {
                    if (sequence !== playSequence.current) return;
                    player.setTextSession?.(null); if (preview) player.preview(key); else player.play(key);
                });
            });
        };
        return {
            setTextSession: (key, value) => { textOverride.current = key && value ? { key, session: value } : null; },
            playerData: value => {
                if (!mount.current) throw new Error("The stage is not ready");
                mount.current.playerData(value);
            },
            play: key => play(key, false),
            preview: key => play(key, true),
            browse: filters => send(player => player.browse(filters)),
            setWeather: phenomenon => send(player => player.setWeather(phenomenon)),
            // Older cached releases have no site dial; they keep their initial site.
            setSite: site => send(player => {
                if (typeof player.setSite === "function") player.setSite(site);
            }),
            // Runtime publications are independently versioned. Feature-detect the
            // sound gate so a host hot-update cannot crash while an older cached
            // release is still mounted; current releases implement this method.
            setSoundEnabled: enabled => send(player => {
                if (typeof player.setSoundEnabled === "function") player.setSoundEnabled(enabled);
            }),
            select: key => send(player => player.select(key)),
            stop: () => { playSequence.current++; send(player => player.stop()); },
            async close() {
                playSequence.current++;
                queued.current = [];
                return mount.current ? mount.current.close() : true;
            },
        };
    }, [session]);

    // One realm per `session.epoch`. Content switching reuses the live world
    // through the mount handle instead of tearing the renderer, the audio
    // graph and the caches down and building them again: only an explicit
    // close, retry, or region change asks for a new epoch.
    const epoch = session?.epoch ?? null;
    const launch = useRef(session);
    useEffect(() => { launch.current = session; });

    useEffect(() => {
        const request = launch.current;
        if (epoch === null || !request) return;
        const requests = playSequence;
        const sequence = ++requests.current;
        textOverride.current = null;
        let cancelled = false;
        let owned: MolyMount | null = null;
        const host = container.current;
        if (!host) return;
        state.current.onPlayerData(null);
        const initialize = async () => {
            try {
                const moduleUrl = new URL(request.release.module, location.origin);
                if (moduleUrl.origin !== location.origin || moduleUrl.pathname !== `/moly/releases/${request.release.id}/embed.mjs`) throw new Error("Invalid runtime module URL");
                // Keep the separately versioned runtime out of every Next.js
                // bundle. Its source and protocol are validated at discovery.
                // Enable required-resource retention before the iframe starts fetching.
                // Storage denial must not prevent online playback.
                await resourceCacheCommand("retain", true).catch(error => {
                    console.warn("[moly] persistent resource cache unavailable", error);
                });
                const sdk = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl.href) as EmbedModule;
                if (cancelled || !host.isConnected) return;
                if (typeof sdk.mountMoly !== "function") throw new Error("Runtime adapter is unavailable");
                const current = state.current;
                owned = sdk.mountMoly(host, {
                    view: "stage", src: request.release.stage, assets: request.snapshot.assets,
                    resourceBase: request.release.resourceBase,
                    region: request.snapshot.region, version: request.snapshot.version, snapshot: request.snapshot.id,
                    packs: request.snapshot.packs, assetCatalog: request.snapshot.assetCatalog,
                    theme: { mode: current.resolvedColorScheme, accent: current.themeColor }, locale: current.locale,
                    filters: request.initial, content: request.content ?? undefined, sound: request.soundEnabled,
                    onPlayerData: value => { if (!cancelled) state.current.onPlayerData(value); },
                    onSnapshot: value => { if (!cancelled) state.current.onSnapshot(value); },
                    onBoot: value => {
                        if (!cancelled) {
                            if (value.phase === "downloading") {
                                state.current.onSnapshot(null);
                                state.current.onError(null);
                            }
                            state.current.onBoot(value);
                        }
                    },
                    onError: value => { if (!cancelled) state.current.onError(value); },
                });
                mount.current = owned;
                for (const action of queued.current.splice(0)) action(owned);
                if (request.play && sequence === playSequence.current) {
                    const text = await playbackText(request, request.play, request.textLocale, request.textSession ?? null, request.refreshText === true)
                        .catch(error => { console.warn("[moly] translated playback unavailable, using source", error); return { session: null, result: undefined }; });
                    if (!cancelled && sequence === playSequence.current) {
                        if (text.result) state.current.onTextResolved(text.result);
                        owned.setTextSession?.(text.session);
                        if (request.preview) owned.preview(request.play); else owned.play(request.play);
                    }
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("[moly] runtime mount failed", error);
                    state.current.onError({ code: "mount_failed" });
                }
            }
        };
        void initialize();
        return () => {
            cancelled = true;
            requests.current++;
            owned?.dispose();
            if (mount.current === owned) mount.current = null;
            queued.current = [];
        };
        // A new epoch is created only by explicit load/source/retry actions.
        // Theme, locale, filters, catalogue selection and content switches
        // never recreate the iframe or its realm.
    }, [epoch]);

    return <div ref={container} className="interaction-runtime" data-moly-session={session.id} />;
});
export default RuntimeStage;
