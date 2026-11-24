"use client";

import React, { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
    LIVE2D_VIEWER_PATH,
    STORY_REGIONS,
    WEB_STORY_WORKSPACE_CAPABILITIES,
    createBrowserStoryExportAdapter,
    createIndexedDbStoryDraftStorageAdapter,
    live2dCoreUrl,
    type AssetLine,
    type StoryCoreConfig,
    type StoryRegion,
} from "@moesekai/story-core";
import { StoryStudioProvider } from "@moesekai/story-editor";
import type { StudioLinkProps } from "@moesekai/story-editor/md3";
import "@moesekai/story-editor/styles/story-game-ui.css";
import LocalizedLink from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { MOE_LOGO_URL } from "@/lib/assets";
import { LIVE2D_VIEWER_RELEASE } from "@/lib/live2dViewer/release";
import { localizePath } from "@/lib/localized-path";
import { SSE_WEB_PATH, sseWebSources } from "@/lib/sseWeb/config";
import { SSE_WEB_RELEASE } from "@/lib/sseWeb/release";

const subscribeNever = () => () => {};

function isStoryRegion(value: string | null | undefined): value is StoryRegion {
    return STORY_REGIONS.includes(value as StoryRegion);
}

function WebStudioLink({ href, prefetch, ...rest }: StudioLinkProps) {
    return <LocalizedLink href={href} prefetch={prefetch} {...rest} />;
}

export interface StoryStudioWebProviderProps {
    children: React.ReactNode;
}

/**
 * Wires `@moesekai/story-editor`'s `<StoryStudioProvider>` to Snowy_Viewer's
 * Next.js router, `LocalizedLink`, `I18nContext`, `ThemeContext`, IndexedDB
 * draft storage, browser exporter, and vendored Live2D / sse-web assets.
 */
export function StoryStudioWebProvider({ children }: StoryStudioWebProviderProps) {
    const { t, locale, routeLocale } = useI18n();
    const { assetSource, serverSource, hasHydratedThemeSettings } = useTheme();
    const router = useRouter();
    const pathname = usePathname();
    const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

    const assetLine: AssetLine = assetSource.startsWith("backup") ? "backup" : "main";
    const defaultRegion: StoryRegion = hydrated && hasHydratedThemeSettings && isStoryRegion(serverSource)
        ? serverSource
        : "jp";

    const navigate = useCallback(
        (href: string) => {
            router.push(localizePath(href, routeLocale));
        },
        [routeLocale, router],
    );

    const storage = useMemo(() => createIndexedDbStoryDraftStorageAdapter(), []);
    const exporter = useMemo(() => createBrowserStoryExportAdapter(), []);

    const live2dScriptBase = LIVE2D_VIEWER_RELEASE
        ? `${LIVE2D_VIEWER_PATH}${LIVE2D_VIEWER_RELEASE}/`
        : null;
    const sseWebScriptBase = SSE_WEB_RELEASE
        ? `${SSE_WEB_PATH}${SSE_WEB_RELEASE}/`
        : null;

    const live2dCore = useMemo(() => live2dCoreUrl(), []);

    const coreConfig = useMemo<Partial<StoryCoreConfig>>(() => {
        const sse = sseWebSources("jp");
        // Spell each NEXT_PUBLIC_* variable in full so Next.js inlines build-time values.
        const explicitLive2DSite = process.env.NEXT_PUBLIC_LIVE2D_SITE?.trim()
            || process.env.NEXT_PUBLIC_SSE_WEB_SITE?.trim()
            || "";
        const explicitLive2DProxy = process.env.NEXT_PUBLIC_LIVE2D_ASSET_PROXY?.trim()
            || process.env.NEXT_PUBLIC_SSE_WEB_ASSET_PROXY?.trim()
            || null;
        return {
            defaultAssetLine: assetLine,
            defaultRegion,
            live2dSite: explicitLive2DSite,
            live2dCoreUrl: live2dCore,
            live2dAssetProxy: explicitLive2DProxy,
            ...(sse?.site ? { sseWebSite: sse.site } : {}),
            ...(sse?.proxy ? { sseWebAssetProxy: sse.proxy } : {}),
            ...(sseWebScriptBase ? { sseWebScriptBase } : {}),
        };
    }, [assetLine, defaultRegion, live2dCore, sseWebScriptBase]);

    return (
        <StoryStudioProvider
            locale={locale}
            t={t}
            assetLine={assetLine}
            assetSource={assetSource}
            defaultRegion={defaultRegion}
            LinkComponent={WebStudioLink}
            navigate={navigate}
            pathname={pathname}
            live2dScriptBase={live2dScriptBase}
            live2dCoreUrl={live2dCore}
            sseWebScriptBase={sseWebScriptBase}
            coreConfig={coreConfig}
            brandLogoUrl={MOE_LOGO_URL}
            unitIconBaseUrl="/data/icon/"
            storage={storage}
            exporter={exporter}
            capabilities={WEB_STORY_WORKSPACE_CAPABILITIES}
        >
            {children}
        </StoryStudioProvider>
    );
}
