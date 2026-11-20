"use client";

import { useEffect, useRef, useState } from "react";
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
}

export default function TurnstileWidget({
    sessionActive,
    resetSeed,
    onToken,
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
    const [errorMessage, setErrorMessage] = useState<{ seed: number; message: string } | null>(null);
    const effectiveScriptReady = scriptReady || Boolean(getTurnstileApi());
    const visibleError = errorMessage && errorMessage.seed === resetSeed ? errorMessage.message : null;

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
        script.onerror = () => setErrorMessage({ seed: resetSeedRef.current, message: t("page.storySearch.turnstile.scriptFailed") });
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
                setErrorMessage(null);
                onTokenRef.current(token);
            },
            "expired-callback": () => {
                setErrorMessage({ seed: resetSeedRef.current, message: t("page.storySearch.turnstile.expired") });
                onTokenRef.current("");
            },
            "error-callback": () => {
                setErrorMessage({ seed: resetSeedRef.current, message: t("page.storySearch.turnstile.failed") });
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
        return null;
    }

    return (
        <div className="flex flex-col items-start gap-2">
            <div ref={hostRef} className="min-h-[65px] overflow-hidden rounded-md3-md" />
            {visibleError && (
                <div className="type-body-s text-error">{visibleError}</div>
            )}
        </div>
    );
}
