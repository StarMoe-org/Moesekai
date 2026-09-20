"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MolyWeather } from "@/lib/moly/contract";
import Image from "next/image";
import { useI18n } from "@/contexts/I18nContext";

function WeatherIcon({ source }: { source?: string | null }) {
    const [failed, setFailed] = useState<string | null>(null);
    if (!source || failed === source) return null;
    return <Image className="weather-source-icon" src={source} alt="" width={36} height={36}
        unoptimized onError={() => setFailed(source)} />;
}

export default function WeatherControl({ weather, choose, disabled = false }: { weather: MolyWeather; choose(id: number): void; disabled?: boolean }) {
    const { t } = useI18n();
    const menu = useRef<HTMLDetailsElement>(null);
    const summary = useRef<HTMLElement>(null);
    const positionMenu = useCallback(() => {
        if (!menu.current?.open || !summary.current) return;
        const rect = summary.current.getBoundingClientRect();
        // Keep the global fixed navigation unobscured on both desktop and phone.
        // On mobile, an overflowing absolute child can enlarge innerWidth /
        // innerHeight. Use the stable document viewport to avoid feedback.
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const above = Math.max(0, rect.top - 124);
        const below = Math.max(0, viewportHeight - rect.bottom - 24);
        const placement = above >= Math.min(440, below) ? "above" : "below";
        const width = Math.min(330, viewportWidth - 48);
        const left = Math.min(viewportWidth - width - 16, Math.max(16, rect.left));
        menu.current.dataset.placement = placement;
        menu.current.style.setProperty("--weather-menu-max-height", `${Math.min(440, placement === "above" ? above : below)}px`);
        menu.current.style.setProperty("--weather-menu-left", `${left - rect.left}px`);
    }, []);
    useEffect(() => {
        window.addEventListener("resize", positionMenu);
        window.addEventListener("scroll", positionMenu, true);
        return () => { window.removeEventListener("resize", positionMenu); window.removeEventListener("scroll", positionMenu, true); };
    }, [positionMenu]);

    useEffect(() => {
        const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false; };
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; summary.current?.focus(); event.stopPropagation(); } };
        document.addEventListener("pointerdown", outside);
        document.addEventListener("keydown", escape);
        return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
    }, []);
    const committedId = weather.transition ? weather.transition.committedId : weather.committedId ?? weather.id;
    const current = weather.options.find(option => option.id === committedId);
    const phase = weather.transition?.phase ?? "ready";
    const phaseKey = phase === "waiting" ? "weatherWaiting" : phase === "loading" ? "weatherLoading"
        : phase === "transitioning" ? "weatherTransitioning" : "weatherApplied";
    const requested = weather.options.find(option => option.id === weather.transition?.requestedId);
    const currentLabel = current?.label ?? (weather.transition ? t("page.mysekaiWorkspace.weatherNotApplied") : weather.label ?? weather.name);
    const currentIcon = current?.iconUrl ?? (weather.transition ? undefined : weather.iconUrl);
    return <div className="workspace-weather-control">
        <span className="workspace-tool-label">{t("page.mysekaiInteractions.weather")}</span>
        <div className="workspace-weather-field">
        <details ref={menu} className="workspace-weather" onToggle={positionMenu}>
            <summary ref={summary} aria-label={t("page.mysekaiInteractions.weather")} aria-haspopup="dialog" data-weather-control aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}>
                <WeatherIcon source={currentIcon} /><strong>{currentLabel}</strong>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
            </summary>
            <div className="workspace-weather-menu" role="dialog" aria-label={t("page.mysekaiInteractions.weather")}>
                <div className="workspace-weather-options" role="radiogroup" aria-label={t("page.mysekaiInteractions.weather")}>
                    {weather.options.map((option, index) => <button type="button" key={option.id} role="radio" aria-checked={committedId === option.id}
                        disabled={disabled} data-weather-id={option.id} tabIndex={(committedId ?? weather.options[0]?.id) === option.id ? 0 : -1}
                        onClick={() => { choose(option.id); if (menu.current) menu.current.open = false; summary.current?.focus(); }}
                        onKeyDown={event => {
                            const move = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 } as Record<string, number>)[event.key];
                            if (move === undefined && event.key !== "Home" && event.key !== "End") return;
                            event.preventDefault();
                            const next = weather.options[event.key === "Home" ? 0 : event.key === "End" ? weather.options.length - 1 : (index + move + weather.options.length) % weather.options.length];
                            choose(next.id); menu.current?.querySelector<HTMLButtonElement>(`[data-weather-id="${next.id}"]`)?.focus();
                        }}><WeatherIcon source={option.iconUrl} /><span>{option.label ?? option.name}</span></button>)}
                </div>
            </div>
        </details>
        <span className="workspace-weather-phase" role="status">{t(`page.mysekaiWorkspace.${phaseKey}`)}{phase !== "ready" && requested && <> · {requested.label ?? requested.name}</>}</span>
        </div>
        <p className="workspace-weather-disclaimer">{t("page.mysekaiWorkspace.weatherIncomplete")}</p>
    </div>;
}
