"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyPlayerDataCommand, MolyPlayerDataState, MolyBoot, MolyError, MolyFilters, MolyKey, MolyMount, MolySnapshot, MountOptions } from "@/lib/moly/contract";
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
}
export interface RuntimeStageHandle {
    playerData(value: MolyPlayerDataCommand): void;
    play(key: MolyKey): void;
    preview(key: MolyKey): void;
    browse(filters: MolyFilters): void;
    setWeather(phenomenon: number): void;
    setSoundEnabled(enabled: boolean): void;
    select(key: MolyKey): void;
    stop(): void;
    close(): Promise<boolean>;
}
interface Props {
    onPlayerData(value: MolyPlayerDataState | null): void;
    session: PlayerSession;
    onSnapshot(value: MolySnapshot | null): void;
    onBoot(value: MolyBoot | null): void;
    onError(value: MolyError | null): void;
}
type EmbedModule = { mountMoly(container: HTMLElement, options: MountOptions): MolyMount };

const RuntimeStage = forwardRef<RuntimeStageHandle, Props>(function RuntimeStage({ session, onSnapshot, onBoot, onError, onPlayerData }, ref) {
    const router = useRouter();
    const container = useRef<HTMLDivElement>(null);
    const mount = useRef<MolyMount | null>(null);
    const queued = useRef<Array<(player: MolyMount) => void>>([]);
    const { resolvedColorScheme, themeColor } = useTheme();
    const { locale, registerLocaleNavigation } = useI18n();
    const state = useRef({ resolvedColorScheme, themeColor, locale, onSnapshot, onBoot, onError, onPlayerData });

    useEffect(() => {
        state.current = { resolvedColorScheme, themeColor, locale, onSnapshot, onBoot, onError, onPlayerData };
        mount.current?.setTheme({ mode: resolvedColorScheme, accent: themeColor });
        mount.current?.setLocale(locale);
    }, [resolvedColorScheme, themeColor, locale, onSnapshot, onBoot, onError, onPlayerData]);

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
        return {
            playerData: value => {
                if (!mount.current) throw new Error("The stage is not ready");
                mount.current.playerData(value);
            },
            play: key => send(player => player.play(key)),
            preview: key => send(player => player.preview(key)),
            browse: filters => send(player => player.browse(filters)),
            setWeather: phenomenon => send(player => player.setWeather(phenomenon)),
            // Runtime publications are independently versioned. Feature-detect the
            // sound gate so a host hot-update cannot crash while an older cached
            // release is still mounted; current releases implement this method.
            setSoundEnabled: enabled => send(player => {
                if (typeof player.setSoundEnabled === "function") player.setSoundEnabled(enabled);
            }),
            select: key => send(player => player.select(key)),
            stop: () => send(player => player.stop()),
            async close() {
                queued.current = [];
                return mount.current ? mount.current.close() : true;
            },
        };
    }, []);

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
                if (request.play) { if (request.preview) owned.preview(request.play); else owned.play(request.play); }
                for (const action of queued.current.splice(0)) action(owned);
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
