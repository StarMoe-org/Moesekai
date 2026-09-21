"use client";

import { useEffect, useState } from "react";
import Link from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import { resourceCacheCommand, type ResourceCacheState } from "@/lib/moly/resourceCache";
import { useRuntimeManifest } from "@/lib/moly/useResources";

export default function ResourceCachePanel({ playerOpen, reloadHref = "/mysekai/interactions/" }: { playerOpen: boolean; reloadHref?: string }) {
    const { t, locale } = useI18n();
    const [state, setState] = useState<ResourceCacheState | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<"cleared" | "failed" | null>(null);
    // Resources can be published on this origin or a separate CDN. Validate
    // discovery before registering a worker; an empty CDN setting is not proof
    // that a same-origin publication is absent. The hook cancels stale reads.
    const { manifest, failed: deploymentFailed } = useRuntimeManifest(0);
    const deployed = Boolean(manifest);
    const deploymentLoading = !manifest && !deploymentFailed;
    useEffect(() => {
        if (!deployed) return;
        let cancelled = false;
        resourceCacheCommand("query").then(value => { if (!cancelled) { setState(value); setUnavailable(false); } })
            .catch(() => { if (!cancelled) setUnavailable(true); });
        return () => { cancelled = true; };
    }, [playerOpen, deployed]);
    const run = async (type: "query" | "retain" | "clear", enabled?: boolean) => {
        if (busy || (type === "clear" && playerOpen)) return;
        setBusy(true); setNotice(null);
        try { setState(await resourceCacheCommand(type, enabled)); setUnavailable(false); if (type === "clear") setNotice("cleared"); }
        catch { setNotice("failed"); }
        finally { setBusy(false); }
    };
    return <details open className="interaction-resource-cache" onToggle={event => { if (event.currentTarget.open && deployed) void run("query"); }}>
        <summary>{t("page.mysekaiInteractions.cache.title")}</summary>
        {deploymentLoading ? <p role="status">{t("common.state.loading")}</p>
            : !deployed ? <p>{t("page.mysekaiInteractions.noDeployment")}</p>
            : unavailable ? <p>{t("page.mysekaiInteractions.cache.unavailable")} <button className="interaction-text-button" disabled={busy} onClick={() => void run("query")}>{t("page.mysekaiInteractions.retry")}</button></p>
            : <><p>{t("page.mysekaiInteractions.r4b.cacheAutomatic")}</p>
                {state && <p data-moly-cache-bytes={state.bytes}>{t("page.mysekaiInteractions.cache.usage", { size: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(state.bytes / 1048576) })}</p>}
                <button className="interaction-button" disabled={playerOpen || busy || !state} onClick={() => void run("clear")}>{t("page.mysekaiInteractions.cache.clear")}</button>
                <p>{t("page.mysekaiInteractions.cache.clearHint")}</p>
                <Link className="interaction-button" href={reloadHref}>{t("page.mysekaiInteractions.r4b.reloadResources")}</Link></>}
        {notice && <p role="status">{t(`page.mysekaiInteractions.cache.${notice}`)}</p>}
    </details>;
}
