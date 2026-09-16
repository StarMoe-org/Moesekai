"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AccountSelector from "@/components/AccountSelector";
import Link from "@/components/LocalizedLink";
import { fetchAccountMysekaiText } from "@/lib/account";
import type { MolyPlayerDataCommand, MolyPlayerDataState, MolyRegion } from "@/lib/moly/contract";
import { useI18n } from "@/contexts/I18nContext";

interface Props { region: MolyRegion; ready: boolean; blocked: boolean; value: MolyPlayerDataState | null;
    send(value: MolyPlayerDataCommand): void; onExplore(): void; }
export default function PlayerDataPanel({ region, ready, blocked, value, send, onExplore }: Props) {
    const { t } = useI18n();
    const [uid, setUid] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const request = useRef<AbortController | null>(null);
    const generation = useRef(0);
    const allowedServers = useMemo(() => [region], [region]);
    useEffect(() => () => { generation.current++; request.current?.abort(); }, [region]);
    const locked = busy || Boolean(value?.busy) || !ready || blocked;
    const execute = async (load: (signal: AbortSignal) => Promise<string>) => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        const ticket = ++generation.current;
        setError(""); setBusy(true);
        try {
            const text = await load(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
            if (ticket !== generation.current) return;
            send({ operation: "preview", region, json: text });
        } catch (cause) {
            if (ticket === generation.current && !controller.signal.aborted) {
                const code = cause instanceof Error ? cause.message : "NETWORK_ERROR";
                setError(code === "MYSEKAI_NOT_ACCESSIBLE" ? "playerPrivate"
                    : code === "OAUTH_REAUTH_REQUIRED" ? "playerReauth" : code === "INVALID_UID" ? "playerUidInvalid"
                    : code === "PLAYER_DATA_TOO_LARGE" ? "playerTooLarge" : "playerLoadFailed");
            }
        } finally { if (ticket === generation.current) setBusy(false); }
    };
    const command = (operation: MolyPlayerDataCommand["operation"]) => {
        setError("");
        try { send({ operation, region }); if (operation === "explore") onExplore(); }
        catch { setError("playerLoadFailed"); }
    };
    return <section className="interaction-player-data" aria-label={t("page.mysekaiInteractions.r4b.importPlayer")}>
        <p>{t("page.mysekaiInteractions.r4b.playerPrivacy")}</p>
        <AccountSelector allowedServers={allowedServers} currentUserId={uid} currentServer={region}
            onSelect={id => setUid(id)} />
        <div className="interaction-import-row">
            <label>{t("page.mysekaiInteractions.r4b.playerUid")}<input inputMode="numeric" autoComplete="off" maxLength={20} value={uid}
                onChange={event => setUid(event.target.value.trim())} /></label>
            <button className="interaction-button" disabled={locked || !uid} onClick={() => void execute(signal => fetchAccountMysekaiText(region, uid, signal))}>{t("page.mysekaiInteractions.r4b.playerFetch")}</button>
            <label className="interaction-button">{t("page.mysekaiInteractions.r4b.playerFile")}<input type="file" accept=".json,application/json" disabled={locked}
                onChange={event => { const file = event.target.files?.[0]; event.target.value = "";
                    if (file) void execute(async () => { if (file.size > 32 * 1048576) throw new Error("PLAYER_DATA_TOO_LARGE"); return file.text(); }); }} /></label>
        </div>
        {!ready && <p role="status">{t("page.mysekaiInteractions.r4b.playerWait")}</p>}
        {blocked && <p role="status">{t("page.mysekaiInteractions.r4b.playerStopFirst")}</p>}
        {error && <p role="alert">{t(`page.mysekaiInteractions.r4b.${error}`)} <Link href="/profile/">{t("page.mysekaiInteractions.r4b.playerAccount")}</Link></p>}
        {value?.error && <p role="alert">{value.status}</p>}
        {busy || value?.busy ? <p role="status">{t("page.mysekaiInteractions.r4b.playerChecking")}</p> : null}
        {value?.summary && !value.error && <p>{t("page.mysekaiInteractions.r4b.playerSummary", value.summary)}</p>}
        <div className="interaction-import-row">
            {value?.canExplore && !value.error && <button className="interaction-button primary" disabled={locked} onClick={() => command("explore")}>{t("page.mysekaiInteractions.r4b.playerExplore")}</button>}
            {value?.exploring && <button className="interaction-button" disabled={locked} onClick={() => command("restore")}>{t("page.mysekaiInteractions.r4b.playerRestore")}</button>}
        </div>
    </section>;
}
