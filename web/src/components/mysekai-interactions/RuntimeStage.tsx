"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyBoot, MolyError, MolyFilters, MolyKey, MolyMount, MolySnapshot, MountOptions } from "@/lib/moly/contract";
import type { MolyRelease, ResourceSnapshot } from "@/lib/moly/catalog";
import { ensureResourceCache } from "@/lib/moly/resourceCache";

export interface PlayerSession {
    id: number;
    snapshot: ResourceSnapshot;
    release: MolyRelease;
    initial: MolyFilters;
    content: MolyKey | null;
    play: MolyKey | null;
}
export interface RuntimeStageHandle {
    play(key: MolyKey): void;
    browse(filters: MolyFilters): void;
    select(key: MolyKey): void;
    stop(): void;
    close(): Promise<boolean>;
}
interface Props {
    session: PlayerSession;
    onSnapshot(value: MolySnapshot | null): void;
    onBoot(value: MolyBoot | null): void;
    onError(value: MolyError): void;
}
type EmbedModule = { mountMoly(container: HTMLElement, options: MountOptions): MolyMount };

const RuntimeStage = forwardRef<RuntimeStageHandle, Props>(function RuntimeStage({ session, onSnapshot, onBoot, onError }, ref) {
    const container = useRef<HTMLDivElement>(null);
    const mount = useRef<MolyMount | null>(null);
    const queued = useRef<Array<(player: MolyMount) => void>>([]);
    const { resolvedColorScheme, themeColor } = useTheme();
    const { locale } = useI18n();
    const state = useRef({ resolvedColorScheme, themeColor, locale, onSnapshot, onBoot, onError });

    useEffect(() => {
        state.current = { resolvedColorScheme, themeColor, locale, onSnapshot, onBoot, onError };
        mount.current?.setTheme({ mode: resolvedColorScheme, accent: themeColor });
        mount.current?.setLocale(locale);
    }, [resolvedColorScheme, themeColor, locale, onSnapshot, onBoot, onError]);

    useImperativeHandle(ref, () => {
        const send = (action: (player: MolyMount) => void) => {
            if (mount.current) action(mount.current);
            else if (queued.current.length < 64) queued.current.push(action);
        };
        return {
            play: key => send(player => player.play(key)),
            browse: filters => send(player => player.browse(filters)),
            select: key => send(player => player.select(key)),
            stop: () => send(player => player.stop()),
            async close() {
                queued.current = [];
                return mount.current ? mount.current.close() : true;
            },
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        let owned: MolyMount | null = null;
        const host = container.current;
        if (!host) return;
        const initialize = async () => {
            try {
                const moduleUrl = new URL(session.release.module, location.origin);
                if (moduleUrl.origin !== location.origin || moduleUrl.pathname !== `/moly/releases/${session.release.id}/embed.mjs`) throw new Error("Invalid runtime module URL");
                // Keep the separately versioned runtime out of every Next.js
                // bundle. Its source and protocol are validated at discovery.
                // Retention is optional. Install the narrow worker before a new
                // iframe navigates, without blocking online use when unavailable.
                await ensureResourceCache().catch(() => null);
                const sdk = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl.href) as EmbedModule;
                if (cancelled || !host.isConnected) return;
                if (typeof sdk.mountMoly !== "function") throw new Error("Runtime adapter is unavailable");
                const current = state.current;
                owned = sdk.mountMoly(host, {
                    view: "stage", src: session.release.stage, assets: session.snapshot.assets,
                    region: session.snapshot.region, version: session.snapshot.version, snapshot: session.snapshot.id,
                    theme: { mode: current.resolvedColorScheme, accent: current.themeColor }, locale: current.locale,
                    filters: session.initial, content: session.content ?? undefined, preload: true,
                    onSnapshot: value => { if (!cancelled) state.current.onSnapshot(value); },
                    onBoot: value => { if (!cancelled) state.current.onBoot(value); },
                    onError: value => { if (!cancelled) state.current.onError(value); },
                });
                mount.current = owned;
                if (session.play) owned.play(session.play);
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
        // A session is created only by explicit load/source/retry actions.
        // Theme, locale, filters and React rerenders never recreate the iframe.
    }, [session]);

    return <div ref={container} className="interaction-runtime" data-moly-session={session.id} />;
});
export default RuntimeStage;
