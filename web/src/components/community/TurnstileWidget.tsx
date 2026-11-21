"use client";

import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";

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
        __communityTurnstileLoaded?: () => void;
    }
}

function getTurnstileApi(): TurnstileApi | undefined {
    if (typeof window === "undefined") return undefined;
    return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

interface TurnstileWidgetProps {
    siteKey: string;
    onToken: (token: string) => void;
    resetNonce?: number;
}

export function TurnstileWidget({ siteKey, onToken, resetNonce = 0 }: TurnstileWidgetProps) {
    const { t } = useI18n();
    const hostRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    const resetNonceRef = useRef(resetNonce);

    useEffect(() => {
        onTokenRef.current = onToken;
    }, [onToken]);

    const [scriptReady, setScriptReady] = useState(() => Boolean(getTurnstileApi()));
    const [errorState, setErrorState] = useState<{ nonce: number; message: string } | null>(null);
    const effectiveScriptReady = scriptReady || Boolean(getTurnstileApi());
    const visibleError = errorState && errorState.nonce === resetNonce ? errorState.message : null;

    useEffect(() => {
        if (!siteKey) return;
        if (getTurnstileApi()) return;

        window.__communityTurnstileLoaded = () => setScriptReady(true);
        const existingScript = document.querySelector<HTMLScriptElement>(
            `script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]`,
        );
        if (existingScript) {
            const handleLoad = () => setScriptReady(true);
            existingScript.addEventListener("load", handleLoad, { once: true });
            return () => existingScript.removeEventListener("load", handleLoad);
        }

        const script = document.createElement("script");
        script.src = `${TURNSTILE_SCRIPT_SRC}&onload=__communityTurnstileLoaded`;
        script.async = true;
        script.defer = true;
        script.onerror = () =>
            setErrorState({
                nonce: resetNonceRef.current,
                message: t("common.comments.turnstile.scriptFailed"),
            });
        document.head.appendChild(script);
    }, [siteKey, t]);

    useEffect(() => {
        const turnstile = getTurnstileApi();
        if (!siteKey || !effectiveScriptReady || !hostRef.current || !turnstile) return;
        if (widgetIdRef.current) return;

        const docTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

        widgetIdRef.current = turnstile.render(hostRef.current, {
            sitekey: siteKey,
            theme: docTheme,
            size: "normal",
            callback: (token) => {
                setErrorState(null);
                onTokenRef.current(token);
            },
            "expired-callback": () => {
                setErrorState({
                    nonce: resetNonceRef.current,
                    message: t("common.comments.turnstile.expired"),
                });
                onTokenRef.current("");
            },
            "error-callback": () => {
                setErrorState({
                    nonce: resetNonceRef.current,
                    message: t("common.comments.turnstile.failed"),
                });
                onTokenRef.current("");
            },
        });

        return () => {
            if (widgetIdRef.current) {
                getTurnstileApi()?.remove?.(widgetIdRef.current);
                widgetIdRef.current = null;
            }
        };
    }, [effectiveScriptReady, siteKey, t]);

    useEffect(() => {
        resetNonceRef.current = resetNonce;
        if (!resetNonce || !siteKey || !widgetIdRef.current) return;
        getTurnstileApi()?.reset(widgetIdRef.current);
        onTokenRef.current("");
    }, [resetNonce, siteKey]);

    if (!siteKey) return null;

    return (
        <div className="my-2 flex flex-col items-start gap-1.5">
            <div ref={hostRef} className="min-h-[65px] overflow-hidden rounded-md3-md" />
            {visibleError && <div className="type-body-s text-error">{visibleError}</div>}
        </div>
    );
}

export default TurnstileWidget;
