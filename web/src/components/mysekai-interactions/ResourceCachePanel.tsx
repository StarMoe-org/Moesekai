"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { resourceCacheCommand, type ResourceCacheState } from "@/lib/moly/resourceCache";

export default function ResourceCachePanel({ playerOpen }: { playerOpen: boolean }) {
    const { t, locale } = useI18n();
    const [state, setState] = useState<ResourceCacheState | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<"cleared" | "failed" | null>(null);
    useEffect(() => {
        let cancelled = false;
        resourceCacheCommand("query").then(value => { if (!cancelled) { setState(value); setUnavailable(false); } })
            .catch(() => { if (!cancelled) setUnavailable(true); });
        return () => { cancelled = true; };
    }, [playerOpen]);
    const run = async (type: "query" | "retain" | "clear", enabled?: boolean) => {
        if (busy || (type === "clear" && playerOpen)) return;
        setBusy(true); setNotice(null);
        try { setState(await resourceCacheCommand(type, enabled)); setUnavailable(false); if (type === "clear") setNotice("cleared"); }
        catch { setNotice("failed"); }
        finally { setBusy(false); }
    };
    return <details className="interaction-resource-cache" onToggle={event => { if (event.currentTarget.open) void run("query"); }}>
        <summary>{t("page.mysekaiInteractions.cache.title")}</summary>
        {unavailable ? <p>{t("page.mysekaiInteractions.cache.unavailable")} <button className="interaction-text-button" disabled={busy} onClick={() => void run("query")}>{t("page.mysekaiInteractions.retry")}</button></p>
            : <><label><input type="checkbox" checked={state?.enabled ?? false} disabled={busy || !state} onChange={event => void run("retain", event.target.checked)} />{t("page.mysekaiInteractions.cache.retain")}</label>
                <p>{t("page.mysekaiInteractions.cache.hint")}</p>
                {state && <p data-moly-cache-bytes={state.bytes}>{t("page.mysekaiInteractions.cache.usage", { size: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(state.bytes / 1048576) })}</p>}
                <button className="interaction-button" disabled={playerOpen || busy || !state} onClick={() => void run("clear")}>{t("page.mysekaiInteractions.cache.clear")}</button>
                <p>{t("page.mysekaiInteractions.cache.clearHint")}</p></>}
        {notice && <p role="status">{t(`page.mysekaiInteractions.cache.${notice}`)}</p>}
    </details>;
}
