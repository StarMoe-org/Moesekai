"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@/components/md3";
import { mdRefresh, mdVerifiedUser } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";

export const STORY_SEARCH_TURNSTILE_SITE_KEY = "0x4AAAAAAGKO8xcwCQ39Blz6";
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileRenderOptions {
    sitekey: string;
    callback?: (token: string) => void;
    "error-callback"?: () => void;
    "expired-callback"?: () => void;
    theme?: "light" | "dark" | "auto";
    size?: "normal" | "compact" | "flexible";
}

interface TurnstileApi {
    render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
    reset: (widgetId?: string) => void;
    remove?: (widgetId?: string) => void;
}

declare global {
    interface Window {
        __storySearchTurnstileLoaded?: () => void;
    }
}

function getTurnstileApi(): TurnstileApi | undefined {
    if (typeof window === "undefined") return undefined;
    return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

interface TurnstileWidgetProps {
    sessionActive: boolean;
    resetSeed: number;
    onToken: (token: string) => void;
    onManualReset: () => void;
}

export default function TurnstileWidget({
    sessionActive,
    resetSeed,
    onToken,
    onManualReset,
}: TurnstileWidgetProps) {
    const { t } = useI18n();
    const hostRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    const resetSeedRef = useRef(resetSeed);

    useEffect(() => {
        onTokenRef.current = onToken;
    }, [onToken]);

    const [scriptReady, setScriptReady] = useState(
        () => Boolean(getTurnstileApi()),
    );
    const [statusInfo, setStatusInfo] = useState<{ seed: number; message: string } | null>(null);
    const effectiveScriptReady = scriptReady || Boolean(getTurnstileApi());
    const statusMessage = statusInfo && statusInfo.seed === resetSeed ? statusInfo.message : null;

    useEffect(() => {
        if (sessionActive) return;
        if (getTurnstileApi()) return;

        window.__storySearchTurnstileLoaded = () => setScriptReady(true);
        const existingScript = document.querySelector<HTMLScriptElement>(
            `script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]`,
        );
        if (existingScript) {
            const handleLoad = () => setScriptReady(true);
            existingScript.addEventListener("load", handleLoad, { once: true });
            return () => existingScript.removeEventListener("load", handleLoad);
        }

        const script = document.createElement("script");
        script.src = `${TURNSTILE_SCRIPT_SRC}&onload=__storySearchTurnstileLoaded`;
        script.async = true;
        script.defer = true;
        script.onerror = () => setStatusInfo({ seed: resetSeedRef.current, message: t("page.storySearch.turnstile.scriptFailed") });
        document.head.appendChild(script);
    }, [sessionActive, t]);

    useEffect(() => {
        const turnstile = getTurnstileApi();
        if (sessionActive || !effectiveScriptReady || !hostRef.current || !turnstile) return;
        if (widgetIdRef.current) return;

        const docTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

        widgetIdRef.current = turnstile.render(hostRef.current, {
            sitekey: STORY_SEARCH_TURNSTILE_SITE_KEY,
            theme: docTheme,
            size: "normal",
            callback: (token) => {
                setStatusInfo({ seed: resetSeedRef.current, message: t("page.storySearch.turnstile.completed") });
                onTokenRef.current(token);
            },
            "expired-callback": () => {
                setStatusInfo({ seed: resetSeedRef.current, message: t("page.storySearch.turnstile.expired") });
                onTokenRef.current("");
            },
            "error-callback": () => {
                setStatusInfo({ seed: resetSeedRef.current, message: t("page.storySearch.turnstile.failed") });
                onTokenRef.current("");
            },
        });

        return () => {
            if (widgetIdRef.current) {
                getTurnstileApi()?.remove?.(widgetIdRef.current);
                widgetIdRef.current = null;
            }
        };
    }, [effectiveScriptReady, sessionActive, t]);

    useEffect(() => {
        resetSeedRef.current = resetSeed;
        if (!resetSeed || sessionActive || !widgetIdRef.current) return;
        getTurnstileApi()?.reset(widgetIdRef.current);
        onTokenRef.current("");
    }, [resetSeed, sessionActive]);

    if (sessionActive) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md3-lg bg-secondary-container/60 px-4 py-3 text-on-secondary-container">
                <div className="flex items-center gap-2.5">
                    <Icon path={mdVerifiedUser} size={20} className="shrink-0 text-primary" />
                    <span className="type-label-l">{t("page.storySearch.turnstile.sessionActive")}</span>
                </div>
                <Button variant="text" size="s" icon={mdRefresh} onClick={onManualReset}>
                    {t("page.storySearch.turnstile.reset")}
                </Button>
            </div>
        );
    }

    const displayMessage = statusMessage ?? (
        effectiveScriptReady ? t("page.storySearch.turnstile.prompt") : t("page.storySearch.turnstile.loading")
    );

    return (
        <div className="rounded-md3-lg bg-surface-container p-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <div className="type-label-l text-on-surface">{t("page.storySearch.turnstile.title")}</div>
                    <div className="mt-1 type-body-s text-on-surface-variant">{displayMessage}</div>
                </div>
                <div ref={hostRef} className="min-h-[65px] min-w-[300px] shrink-0 overflow-hidden rounded-md3-md" />
            </div>
        </div>
    );
}
