"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/LocalizedLink";
import { useI18n } from "@/contexts/I18nContext";
import { resourceCacheCommand, type ResourceCacheState } from "@/lib/moly/resourceCache";
import { useRuntimeManifest } from "@/lib/moly/useResources";

async function browserStorageEstimate() {
    try {
        const value = await navigator.storage?.estimate();
        return value && Number.isFinite(value.usage) && Number.isFinite(value.quota) && value.quota! > 0
            ? { usage: value.usage!, quota: value.quota! } : null;
    } catch { return null; }
}

export default function ResourceCachePanel({ playerOpen, reloadHref = "/mysekai/interactions/", region, snapshot: snapshotId }: { playerOpen: boolean; reloadHref?: string; region?: string | null; snapshot?: string | null }) {
    const { t, locale } = useI18n();
    const [state, setState] = useState<ResourceCacheState | null>(null);
    const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [busy, setBusy] = useState<"query" | "clear" | null>("query");
    const [notice, setNotice] = useState<"cleared" | "failed" | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const [retry, setRetry] = useState(0);
    const operation = useRef(false);
    // A CDN setting alone does not determine whether same-origin resources exist.
    const { manifest, failed: deploymentFailed } = useRuntimeManifest(retry);
    const deployed = Boolean(manifest);
    const deploymentLoading = !manifest && !deploymentFailed;
    useEffect(() => {
        if (!deployed) return;
        let cancelled = false;
        operation.current = true;
        void Promise.all([resourceCacheCommand("query"), browserStorageEstimate()])
            .then(([value, estimate]) => { if (!cancelled) { setState(value); setStorage(estimate); setUnavailable(false); } })
            .catch(() => { if (!cancelled) setUnavailable(true); })
            .finally(() => { if (!cancelled) { operation.current = false; setBusy(null); } });
        return () => { cancelled = true; };
    }, [deployed]);
    const run = async (type: "query" | "clear") => {
        if (operation.current || (type === "clear" && (playerOpen || !confirmClear))) return;
        operation.current = true;
        setBusy(type); setNotice(null);
        try {
            const value = await resourceCacheCommand(type);
            setState(value); setUnavailable(false);
            setStorage(await browserStorageEstimate());
            if (type === "clear") { setNotice("cleared"); setConfirmClear(false); }
        } catch { setNotice("failed"); }
        finally { operation.current = false; setBusy(null); }
    };
    const origin = manifest?.release.resourceOrigin ?? t("page.mysekaiInteractions.cache.sameOrigin");
    const snapshots = manifest?.snapshots.filter(item => (!region || item.region === region) && (!snapshotId || item.id === snapshotId)) ?? [];
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const integer = new Intl.NumberFormat(locale);
    const mib = (bytes: number) => number.format(bytes / 1048576);
    return <section className="interaction-resource-cache" aria-busy={Boolean(busy) && deployed} aria-label={t("page.mysekaiInteractions.cache.title")}>
        {deploymentLoading ? <p role="status">{t("common.state.loading")}</p>
            : !deployed ? <div className="interaction-notice"><p>{t("page.mysekaiInteractions.noDeployment")}</p><button className="interaction-button" onClick={() => setRetry(value => value + 1)}>{t("page.mysekaiInteractions.retry")}</button></div>
            : <>
                {unavailable && <p role="alert">{t("page.mysekaiInteractions.cache.unavailable")}</p>}
                <div className="interaction-resource-cache-grid">
                    <div className="interaction-resource-cache-card">
                        <h2>{t("page.mysekaiInteractions.cache.diskTitle")}</h2>
                        {state ? <>
                            <p className="interaction-resource-cache-total" data-moly-cache-bytes={state.bytes} data-moly-cache-entries={state.entries}>{t("page.mysekaiInteractions.cache.storageUsage", { size: mib(state.bytes), bytes: integer.format(state.bytes), entries: integer.format(state.entries) })}</p>
                            <p>{t(`page.mysekaiInteractions.cache.${state.enabled ? "retentionEnabled" : "retentionDisabled"}`)}</p>
                            {state.limitBytes ? <><p>{t("page.mysekaiInteractions.cache.budget", { size: mib(state.limitBytes) })}</p><progress aria-label={t("page.mysekaiInteractions.cache.diskTitle")} max={state.limitBytes} value={Math.min(state.bytes, state.limitBytes)} /></>
                                : <p>{t("page.mysekaiInteractions.cache.budgetUnknown")}</p>}
                        </> : <p role="status">{t(busy ? "common.state.loading" : "page.mysekaiInteractions.cache.statsUnavailable")}</p>}
                        <p>{t("page.mysekaiInteractions.cache.allSnapshots")}</p>
                    </div>
                    <div className="interaction-resource-cache-card">
                        <h2>{t("page.mysekaiInteractions.cache.siteStorageTitle")}</h2>
                        {storage ? <p className="interaction-resource-cache-total">{t("page.mysekaiInteractions.cache.siteStorage", { used: mib(storage.usage), quota: mib(storage.quota) })}</p>
                            : <p>{t("page.mysekaiInteractions.cache.siteStorageUnknown")}</p>}
                        <p>{t("page.mysekaiInteractions.cache.siteStorageHint")}</p>
                    </div>
                </div>
                <div className="interaction-resource-cache-context">
                    {snapshots.map(snapshot => <p key={snapshot.id}>{t("page.mysekaiInteractions.cache.snapshot", { region: snapshot.region.toUpperCase(), version: snapshot.version, id: snapshot.id })}</p>)}
                    {snapshotId && !snapshots.length && <p>{t("page.mysekaiInteractions.cache.requestedSnapshot", { id: snapshotId })}</p>}
                    <p>{t("page.mysekaiInteractions.cache.origin", { origin })}</p>
                </div>
                <div className="interaction-resource-cache-actions">
                    <button className="interaction-button" disabled={Boolean(busy)} onClick={() => void run("query")}>{t("page.mysekaiInteractions.cache.refresh")}</button>
                    <button className="interaction-button interaction-button-danger" aria-expanded={confirmClear} aria-controls="moly-clear-confirmation" disabled={playerOpen || Boolean(busy) || !state || state.entries === 0} onClick={() => { setNotice(null); setConfirmClear(true); }}>{t("page.mysekaiInteractions.cache.clear")}</button>
                </div>
                {confirmClear && <div className="interaction-resource-cache-confirm" id="moly-clear-confirmation" role="group" aria-labelledby="moly-clear-title">
                    <h3 id="moly-clear-title">{t("page.mysekaiInteractions.cache.clearConfirm")}</h3>
                    <p>{t("page.mysekaiInteractions.cache.clearHint")}</p>
                    <div className="interaction-resource-cache-actions"><button className="interaction-button interaction-button-danger" disabled={playerOpen || Boolean(busy)} onClick={() => void run("clear")}>{t("common.action.confirm")}</button><button className="interaction-button" disabled={Boolean(busy)} onClick={() => setConfirmClear(false)}>{t("common.action.cancel")}</button></div>
                </div>}
                <div aria-live="polite" aria-atomic="true" className="interaction-resource-cache-status">
                    {busy ? <p role="status">{t(`page.mysekaiInteractions.cache.${busy === "clear" ? "clearing" : "refreshing"}`)}</p>
                        : notice && <p role={notice === "failed" ? "alert" : "status"}>{t(`page.mysekaiInteractions.cache.${notice}`)}</p>}
                </div>
                <div className="interaction-resource-cache-memory"><h2>{t("page.mysekaiInteractions.cache.memoryTitle")}</h2><p>{t("page.mysekaiInteractions.cache.memoryHint")}</p></div>
                <Link className="interaction-button" href={reloadHref}>{t("page.mysekaiInteractions.r4b.reloadResources")}</Link>
            </>}
    </section>;
}
