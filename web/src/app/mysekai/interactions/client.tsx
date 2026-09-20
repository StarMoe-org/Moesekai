"use client";

import { Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "@/components/LocalizedLink";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme, type ServerSourceType } from "@/contexts/ThemeContext";
import { localizePathForBrowser } from "@/lib/localized-path";
import { INITIAL_BROWSE, filterCatalog, supportedRegion, type BrowseState, type CatalogEntry } from "@/lib/moly/catalog";
import { INITIAL_FURNITURE, workspaceQuery } from "@/lib/moly/workspaceNavigation";
import { useWorkspaceNavigation } from "@/lib/moly/useWorkspaceNavigation";
import { runtimeSelectionFilters } from "@/lib/moly/runtimeSelection";
import { useContentCatalog, useContentDetail, useRuntimeManifest } from "@/lib/moly/useResources";
import type { MolyBoot, MolyError, MolyKey, MolySnapshot, MolyTab, MolyPlayerDataState } from "@/lib/moly/contract";
import PlayerDataPanel from "@/components/mysekai-interactions/PlayerDataPanel";
import type { PlayerSession, RuntimeStageHandle } from "@/components/mysekai-interactions/RuntimeStage";
import WorkspaceStage from "@/components/mysekai-interactions/WorkspaceStage";
import ContentBrowser from "@/components/mysekai-interactions/ContentBrowser";
import ContentDetail from "@/components/mysekai-interactions/ContentDetail";
import { getLocaleRouteConfig, uiLocaleToRouteLocale } from "@/lib/locale-routing";
import "./interactions.css";
import "@/components/mysekai-interactions/participants.css";
import "./workspace.css";

const subscribeHydration = () => () => {};
const hydratedSnapshot = () => true;
const serverHydrationSnapshot = () => false;
const servers: ServerSourceType[] = ["cn", "jp", "en", "tw", "kr"];
const pageSize = 24;
const soundStorageKey = "mysekai:sound-enabled";
type PendingStart = { key: MolyKey | null; preview: boolean };

function WorkspaceContent({ defaultTab }: { defaultTab: MolyTab }) {
    const params = useSearchParams();
    const { t, locale } = useI18n();
    const { serverSource, hasHydratedThemeSettings } = useTheme();
    const hydrated = useSyncExternalStore(subscribeHydration, hydratedSnapshot, serverHydrationSnapshot);
    const { nav, commit, back, restore } = useWorkspaceNavigation(params.toString(), defaultTab);
    const [retry, setRetry] = useState(0);
    const [detailRetry, setDetailRetry] = useState(0);
    const [session, setSession] = useState<PlayerSession | null>(null);
    const [live, setLive] = useState<MolySnapshot | null>(null);
    const [boot, setBoot] = useState<MolyBoot | null>(null);
    const [runtimeError, setRuntimeError] = useState<MolyError | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [mode, setMode] = useState<"independent" | "current">("independent");
    const [closing, setClosing] = useState(false);
    const [stageExpanded, setStageExpanded] = useState(true);
    const [playerData, setPlayerData] = useState<MolyPlayerDataState | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState<boolean | null>(null);
    const [soundReady, setSoundReady] = useState(false);
    const [soundDialogOpen, setSoundDialogOpen] = useState(false);
    const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);
    const player = useRef<RuntimeStageHandle>(null);
    const realmSequence = useRef(0);
    const closeInFlight = useRef<Promise<void> | null>(null);
    const sourceIntent = useRef(0);
    const searchEditing = useRef(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(soundStorageKey);
            setSoundEnabled(saved === "1" ? true : saved === "0" ? false : null);
        } catch {
            setSoundEnabled(null);
        } finally {
            setSoundReady(true);
        }
    }, []);

    const sourceReady = nav.region !== null || (hydrated && hasHydratedThemeSettings);
    const source = nav.region ?? (hydrated && hasHydratedThemeSettings ? serverSource : getLocaleRouteConfig(uiLocaleToRouteLocale(locale)).defaultServer);
    const region = supportedRegion(source);
    const { manifest, failed: manifestFailed } = useRuntimeManifest(retry, nav.snapshot, region);
    const published = manifest?.snapshots.find(item => item.region === region);
    const expired = Boolean(nav.snapshot && published && nav.snapshot !== published.id);
    // A missing engine/CAS deployment is not a reason to hide a readable static catalog.
    const snapshot = sourceReady && !expired ? published : undefined;
    const { catalog, failed: catalogFailed } = useContentCatalog(snapshot, retry);
    const entries = useMemo(() => new Map<string, CatalogEntry>(catalog?.entries.map(entry => [entry.key, entry]) ?? []), [catalog]);
    const selected = nav.content ? entries.get(nav.content) : undefined;
    const { detail, loading: detailLoading, failed: detailFailed } = useContentDetail(snapshot, selected, detailRetry);
    const visibleEntry = detail ?? selected;
    const deferredBrowse = useDeferredValue(nav.browse);
    const contentResults = useMemo(() => catalog ? filterCatalog(catalog, deferredBrowse) : [], [catalog, deferredBrowse]);
    const resultCount = contentResults.length;
    const pageCount = Math.max(1, Math.ceil(resultCount / pageSize));
    const page = Math.min(nav.page, pageCount);
    const contextFixture = nav.browse.fixture ? entries.get(`fixture:${nav.browse.fixture}`)?.title : undefined;
    const activeKey = live?.status.activeKey ?? null;
    const phase = closing ? "restoring" : live?.status.phase ?? (session ? "preparing" : "idle");
    const preparing = Boolean(session && !live?.ready && boot?.phase !== "awaiting-gesture" && !runtimeError);
    const currentAdmission = live?.selected?.key === nav.content && live.mode === "current" ? live.selected : null;
    const canPlay = !preparing && !closing && Boolean(snapshot?.available && selected && (mode === "independent" ? selected.available : currentAdmission?.available));
    const reason = mode === "current" ? currentAdmission?.reasonCode ?? null : selected?.reasonCode ?? null;
    const catalogLoading = sourceReady && Boolean(region && !manifestFailed && (!manifest || (snapshot && !catalog && !catalogFailed)));
    const browserReady = !catalogLoading;
    const missing = nav.invalidContent || Boolean(nav.content && browserReady && !selected);
    const counts = useMemo(() => ({
        conversations: catalog?.entries.filter(entry => entry.key.startsWith("talk:")).length,
        activities: catalog?.entries.filter(entry => entry.key.startsWith("activity:")).length,
    }), [catalog]);

    useLayoutEffect(() => restore(browserReady && !detailLoading), [restore, browserReady, detailLoading, detail, nav, resultCount]);

    useEffect(() => {
        if (!sourceReady || nav.region !== null) return;
        commit(current => ({ ...current, region: source }), { replace: true });
    }, [sourceReady, nav.region, source, commit]);
    useEffect(() => {
        if (!catalog || !snapshot || nav.snapshot) return;
        commit(current => ({ ...current, snapshot: snapshot.id }), { replace: true });
    }, [catalog, snapshot, nav.snapshot, commit]);

    const closePlayer = useCallback((): Promise<void> => {
        if (closeInFlight.current) return closeInFlight.current;
        setClosing(true);
        const operation = (async () => {
            let restored = false;
            try { restored = await (player.current?.close() ?? Promise.resolve(true)); }
            catch { restored = false; }
            finally {
                setSession(null); setLive(null); setBoot(null); setRuntimeError(null); setPlayerData(null); setClosing(false);
                if (!restored) setNotice("restoreInterrupted");
                closeInFlight.current = null;
            }
        })();
        closeInFlight.current = operation;
        return operation;
    }, []);

    useEffect(() => {
        if (session && (source !== session.snapshot.region || Boolean(nav.snapshot && nav.snapshot !== session.snapshot.id))) void closePlayer();
    }, [session, source, nav.snapshot, closePlayer]);
    useEffect(() => {
        if (!session) return;
        player.current?.browse(runtimeSelectionFilters(nav.content, mode, nav.browse.tab));
        if (nav.content) player.current?.select(nav.content);
    }, [session, nav.browse, nav.content, mode]);

    const change = (value: Partial<BrowseState>) => {
        const searchOnly = Object.keys(value).length === 1 && value.query !== undefined;
        const replace = searchOnly && searchEditing.current;
        searchEditing.current = searchOnly;
        commit(current => ({ ...current, page: 1, browse: { ...current.browse, ...value }, content: null, invalidContent: false }), { replace, scroll: "preserve" });
    };
    const select = (content: MolyKey) => {
        searchEditing.current = false;
        commit(current => ({ ...current, content, invalidContent: false }), { scroll: "detail" });
        setNotice(null);
    };
    const related = (fixture: number, tab: MolyTab) => {
        searchEditing.current = false;
        commit(current => ({ ...current, page: 1, content: null, invalidContent: false,
            browse: { ...INITIAL_BROWSE, fixture, tab } }), { scroll: "catalog" });
    };
    const character = (id: number) => {
        searchEditing.current = false;
        commit(current => ({ ...current, page: 1, content: null, invalidContent: false,
            browse: { ...INITIAL_BROWSE, tab: current.browse.tab === "activities" ? "activities" : "conversations", fixture: current.browse.fixture ?? (selected?.fixtureIds.length === 1 ? selected.fixtureIds[0] : null), character: id } }), { scroll: "catalog" });
    };
    const showStage = (expanded: boolean) => {
        setStageExpanded(expanded);
        requestAnimationFrame(() => document.querySelector(expanded ? ".workspace-stage" : ".workspace-body")?.scrollIntoView({ block: "start", behavior: "instant" }));
    };
    const launch = (key: MolyKey | null, preview = false, sound = soundEnabled ?? false) => {
        if (!snapshot?.available || !manifest || closeInFlight.current) return;
        setRuntimeError(null); setNotice(null);
        if (session) {
            player.current?.setSoundEnabled(sound);
            if (key) { player.current?.browse(runtimeSelectionFilters(key, mode)); if (preview) player.current?.preview(key); else player.current?.play(key); }
        } else {
            const identity = ++realmSequence.current;
            setSession({ id: identity, epoch: identity, snapshot, release: manifest.release,
                initial: runtimeSelectionFilters(key ?? nav.content, mode, nav.browse.tab), content: key ?? nav.content, play: key, preview, soundEnabled: sound });
        }
        showStage(true);
    };
    const start = (key: MolyKey | null, preview = false) => {
        if (!soundReady) return;
        if (soundEnabled === null) {
            setPendingStart({ key, preview });
            setSoundDialogOpen(true);
            return;
        }
        launch(key, preview, soundEnabled);
    };
    const chooseSound = (enabled: boolean) => {
        setSoundEnabled(enabled);
        try { localStorage.setItem(soundStorageKey, enabled ? "1" : "0"); } catch {}
        player.current?.setSoundEnabled(enabled);
        const pending = pendingStart;
        setPendingStart(null);
        setSoundDialogOpen(false);
        if (pending) launch(pending.key, pending.preview, enabled);
    };
    const retryPlayer = async () => {
        if (!snapshot?.available || !manifest || closing) return;
        const key = selected?.available ? nav.content : null;
        await closePlayer();
        const identity = ++realmSequence.current;
        setSession({ id: identity, epoch: identity, snapshot, release: manifest.release, initial: runtimeSelectionFilters(nav.content, mode, nav.browse.tab), content: nav.content, play: key, soundEnabled: soundEnabled ?? false });
        showStage(true);
    };
    const switchSource = async (next: string) => {
        if (next === source || closing || !servers.includes(next as ServerSourceType)) return;
        const intent = ++sourceIntent.current;
        if (session) await closePlayer();
        if (intent !== sourceIntent.current) return;
        commit(current => ({ ...current, page: 1, region: next, snapshot: null, browse: { ...INITIAL_BROWSE, tab: current.browse.tab },
            furniture: { ...INITIAL_FURNITURE }, content: null, invalidContent: false }), { scroll: "top" });
        setMode("independent"); setNotice(null); setImportOpen(false);
    };
    const share = async () => {
        const query = workspaceQuery(nav);
        const href = localizePathForBrowser(`/mysekai/interactions/?${query}`);
        try { await navigator.clipboard.writeText(new URL(href, location.origin).href); setNotice("copied"); }
        catch { setNotice("copyFailed"); }
    };
    const catalogProblem = expired ? "snapshotExpired" : manifestFailed ? "noDeployment" : !region || (manifest && !published) ? "regionUnavailable" : catalogFailed ? "catalogFailed" : null;

    return <div className="mysekai-interactions mysekai-workspace" data-workspace-region={source}
        onBlurCapture={event => { if (event.target instanceof HTMLInputElement) searchEditing.current = false; }}>
        <header className="workspace-heading">
            <h1>{t("page.mysekaiInteractions.title")}</h1>
            <div className="workspace-heading-actions">
                <label className="workspace-source-select"><span className="sr-only">{t("page.mysekaiInteractions.source")}</span>
                    <select aria-label={t("page.mysekaiInteractions.source")} value={source} disabled={closing} onChange={event => void switchSource(event.target.value)}>
                        {!servers.includes(source as ServerSourceType) && <option value={source}>{source}</option>}
                        {servers.map(server => <option key={server} value={server}>{t(`common.server.${server}`)}</option>)}
                    </select>
                </label>
                <button className="interaction-button" aria-haspopup="dialog" aria-expanded={soundDialogOpen} onClick={() => { setPendingStart(null); setSoundDialogOpen(true); }}>
                    {t(`page.mysekaiWorkspace.${soundEnabled === true ? "soundOn" : soundEnabled === false ? "soundOff" : "soundSetting"}`)}
                </button>
                <button className="interaction-button" aria-expanded={importOpen} aria-controls="workspace-player-data" onClick={() => setImportOpen(value => !value)}>{t("page.mysekaiWorkspace.myWorld")}</button>
                <button className="interaction-button workspace-enter-scene" disabled={!soundReady || !snapshot?.available || closing} onClick={() => start(null)}>{t(`page.mysekaiWorkspace.${session ? "openScene" : "enterScene"}`)}</button>
            </div>
        </header>
        <div className="workspace-subbar">
            <details className="workspace-source-menu"><summary>{t("page.mysekaiInteractions.source")}{snapshot && <> · {snapshot.region.toUpperCase()} {snapshot.version}</>}</summary>
                <div><p>{t("page.mysekaiWorkspace.databaseSource", { region: source.toUpperCase() })}</p>
                    {snapshot && <p>{t("page.mysekaiWorkspace.authoredSource", { region: snapshot.region.toUpperCase(), version: snapshot.version })}</p>}
                    <p>{t("page.mysekaiWorkspace.sourceSeparation")}</p>
                    <Link href={`/mysekai/interactions/resources/?${new URLSearchParams({ region: source, ...(snapshot ? { snapshot: snapshot.id } : {}) })}`}>{t("page.mysekaiInteractions.r4b.manageResources")}</Link>
                </div>
            </details>
        </div>
        {soundDialogOpen && <section className="workspace-sound-choice" role="dialog" aria-modal="false" aria-label={t("page.mysekaiWorkspace.soundTitle")}>
            <div className="workspace-section-title"><h2>{t("page.mysekaiWorkspace.soundTitle")}</h2>
                <button className="interaction-text-button" onClick={() => { setPendingStart(null); setSoundDialogOpen(false); }}>{t("common.action.close")}</button></div>
            <p>{t("page.mysekaiWorkspace.soundPrompt")}</p>
            <div className="workspace-sound-actions">
                <button className="interaction-button interaction-primary" aria-pressed={soundEnabled === true} onClick={() => chooseSound(true)}>{t("page.mysekaiWorkspace.soundEnable")}</button>
                <button className="interaction-button" aria-pressed={soundEnabled === false} onClick={() => chooseSound(false)}>{t("page.mysekaiWorkspace.soundMute")}</button>
            </div>
            <small>{t("page.mysekaiWorkspace.soundRemember")}</small>
        </section>}
        {importOpen && <section className="workspace-import" id="workspace-player-data">
            <div className="workspace-section-title"><h2>{t("page.mysekaiWorkspace.myWorld")}</h2><button className="interaction-text-button" onClick={() => setImportOpen(false)}>{t("common.action.close")}</button></div>
            {!session && <div className="workspace-import-activation"><p>{t("page.mysekaiWorkspace.importNeedsScene")}</p>
                {snapshot?.available && manifest ? <><p>{t("page.mysekaiInteractions.baseDownloadSize", { size: Math.ceil((Math.max(manifest.release.engines.webgpu.downloadBytes, manifest.release.engines.webgl2.downloadBytes) + snapshot.base.downloadBytes) / 1048576) })}</p>
                    <button className="interaction-button interaction-primary" onClick={() => start(null)}>{t("page.mysekaiWorkspace.enterScene")}</button></>
                    : <p>{t("page.mysekaiInteractions.regionUnavailable", { region: source.toUpperCase() })}</p>}
            </div>}
            {snapshot && <PlayerDataPanel key={snapshot.id} region={snapshot.region} ready={Boolean(live?.ready && live.scene?.ready)}
                blocked={Boolean(live?.status.activeKey || closing || phase === "restoring" || phase === "preparing")} value={playerData}
                send={value => { if (!player.current) throw new Error("Stage not ready"); player.current.playerData(value); }}
                onExplore={() => { setMode("current"); player.current?.browse({ mode: "current" }); showStage(true); }} />}
        </section>}
        <WorkspaceStage session={session} player={player} live={live} boot={boot} error={runtimeError} expanded={stageExpanded} closing={closing} mode={mode}
            setMode={setMode} expand={showStage} close={() => void closePlayer()} retry={() => void retryPlayer()}
            onSnapshot={setLive} onBoot={setBoot} onError={setRuntimeError} onPlayerData={setPlayerData} />
        <nav className="workspace-tabs" aria-label={t("page.mysekaiInteractions.browse")}>
            {(["conversations", "activities"] as const).map(tab => <button key={tab} data-tab={tab}
                aria-pressed={nav.browse.tab === tab || (tab === "conversations" && nav.browse.tab === "performances")}
                onClick={() => change({ tab })}>{t(`page.mysekaiWorkspace.${tab}`)}<span>{counts[tab]?.toLocaleString() ?? "—"}</span></button>)}
        </nav>
        {(nav.browse.fixture || nav.browse.character) && <div className="workspace-context" role="status">
            {nav.browse.fixture && <button onClick={() => change({ tab: "performances" })}>{contextFixture ?? `#${nav.browse.fixture}`}</button>}
            {nav.browse.character && <span>{catalog?.characters.find(person => person.id === nav.browse.character)?.name ?? `#${nav.browse.character}`}</span>}
            <button className="interaction-text-button" onClick={() => change({ fixture: null, character: null })}>{t("page.mysekaiInteractions.clearContext")} ×</button>
        </div>}
        {notice && <p className="workspace-feedback" role="status">{t(`page.mysekaiInteractions.${notice}`)}</p>}
        <div className={`workspace-body${nav.content || nav.invalidContent ? " workspace-has-detail" : ""}`}>
            <div className="workspace-catalog-column">
                {catalogProblem && <section className="workspace-inline-notice" role="status">
                    <h2>{t(`page.mysekaiInteractions.${catalogProblem}`, { region: source.toUpperCase() })}</h2>
                    <button className="interaction-button" onClick={() => setRetry(value => value + 1)}>{t("common.action.retry")}</button>
                    {expired && <button className="interaction-button" onClick={() => commit(current => ({ ...current, snapshot: null, content: null, invalidContent: false }))}>{t("page.mysekaiWorkspace.latestSource")}</button>}
                </section>}
                {catalog && snapshot ? <ContentBrowser catalog={catalog} snapshot={snapshot} browse={nav.browse} results={contentResults} selected={nav.content}
                    active={activeKey} phase={phase} page={page} pageSize={pageSize} change={change} select={select} onPage={next => commit(current => ({ ...current, page: next }), { scroll: "catalog" })} />
                    : catalogLoading || !sourceReady ? <div className="workspace-loading" role="status"><span>{t("common.state.loading")}</span><div /><div /><div /></div> : null}
            </div>
            {(nav.content || nav.invalidContent) && <aside className="workspace-detail-pane" data-mysekai-detail tabIndex={-1} aria-label={t("page.mysekaiWorkspace.detail")}>
                <div className="workspace-detail-toolbar"><button className="interaction-text-button" onClick={back}>← {t("page.mysekaiWorkspace.backToResults")}</button>
                    <button className="workspace-icon-button" aria-label={t("common.action.close")} onClick={() => commit(current => ({ ...current, content: null, invalidContent: false }), { scroll: "catalog" })}>×</button></div>
                {visibleEntry && snapshot ? <ContentDetail entry={visibleEntry} snapshot={snapshot} detailLoading={detailLoading} detailFailed={detailFailed} canPlay={canPlay} preparing={preparing}
                        reason={reason} playing={activeKey === nav.content} replacing={Boolean(activeKey && activeKey !== nav.content)} restoring={closing || phase === "restoring"}
                        preview={() => start(visibleEntry.key, true)} previewing={Boolean(live?.status.preview && activeKey === visibleEntry.key)} play={() => start(visibleEntry.key)}
                        share={() => void share()} retry={() => setDetailRetry(value => value + 1)} related={related} character={character} fixture={id => related(id, "performances")} />
                        : <div className="interaction-empty" role="status"><p>{t(`page.mysekaiInteractions.${missing ? "contentMissing" : "loading"}`)}</p>
                            {missing && <button className="interaction-button" onClick={back}>{t("page.mysekaiWorkspace.backToResults")}</button>}</div>}
            </aside>}
        </div>
        {session && !stageExpanded && <div className="workspace-mini-transport"><button onClick={() => showStage(true)}><span className={`interaction-phase interaction-phase-${phase}`}>{t(`page.mysekaiInteractions.phase.${phase}`)}</span>
            <strong>{live?.status.activeTitle ?? t("page.mysekaiWorkspace.scene")}</strong><span>{t("page.mysekaiWorkspace.openScene")} ↑</span></button>
            <button className="interaction-text-button" disabled={!live?.status.canStop || closing} onClick={() => player.current?.stop()}>{t(`page.mysekaiInteractions.${phase === "completed" ? "returnScene" : "stop"}`)}</button></div>}
    </div>;
}

export default function InteractionsClient({ defaultTab = "conversations" }: { defaultTab?: MolyTab }) {
    return <MainLayout><Suspense><WorkspaceContent defaultTab={defaultTab} /></Suspense></MainLayout>;
}
