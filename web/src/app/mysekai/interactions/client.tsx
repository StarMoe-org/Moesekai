"use client";

import { Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme, type ServerSourceType } from "@/contexts/ThemeContext";
import { INITIAL_BROWSE, filterCatalog, supportedRegion, type BrowseState, type CatalogEntry } from "@/lib/moly/catalog";
import { INITIAL_FURNITURE, workspaceQuery } from "@/lib/moly/workspaceNavigation";
import { useWorkspaceNavigation } from "@/lib/moly/useWorkspaceNavigation";
import { runtimeSelectionFilters } from "@/lib/moly/runtimeSelection";
import { useContentCatalog, useContentDetail, useRuntimeManifest } from "@/lib/moly/useResources";
import type { MolyBoot, MolyError, MolyKey, MolySnapshot, MolyTab, MolyPlayerDataState } from "@/lib/moly/contract";
import type { PlayerSession, RuntimeStageHandle } from "@/components/mysekai-interactions/RuntimeStage";
import WorkspaceStage from "@/components/mysekai-interactions/WorkspaceStage";
import ContentBrowser from "@/components/mysekai-interactions/ContentBrowser";
import ContentDetail from "@/components/mysekai-interactions/ContentDetail";
import InteractionsFilters from "@/components/mysekai-interactions/InteractionsFilters";
import InteractionsSettingsModal from "@/components/mysekai-interactions/InteractionsSettingsModal";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { UNIT_DATA } from "@/types/types";
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
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const [soundReady, setSoundReady] = useState(false);
    const player = useRef<RuntimeStageHandle>(null);
    const realmSequence = useRef(0);
    const closeInFlight = useRef<Promise<void> | null>(null);
    const sourceIntent = useRef(0);
    const searchEditing = useRef(false);
    const workspace = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = workspace.current;
        if (!element) return;
        const measure = () => {
            const style = getComputedStyle(element);
            const contentWidth = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            element.dataset.workspaceNarrow = String(contentWidth <= 900);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        measure();
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(soundStorageKey);
            setSoundEnabled(saved === "0" ? false : true);
        } catch {
            setSoundEnabled(true);
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
    const preparing = Boolean(session && !live?.ready && !runtimeError);
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

    const change = useCallback((value: Partial<BrowseState>) => {
        const searchOnly = Object.keys(value).length === 1 && value.query !== undefined;
        const replace = searchOnly && searchEditing.current;
        searchEditing.current = searchOnly;
        commit(current => ({ ...current, page: 1, browse: { ...current.browse, ...value }, content: null, invalidContent: false }), { replace, scroll: "preserve" });
    }, [commit]);
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
        setSelectedUnitIds(UNIT_DATA.filter(unit => unit.charIds.includes(id)).map(u => u.id));
        commit(current => ({ ...current, page: 1, content: null, invalidContent: false,
            browse: { ...INITIAL_BROWSE, tab: current.browse.tab === "activities" ? "activities" : "conversations", fixture: current.browse.fixture ?? (selected?.fixtureIds.length === 1 ? selected.fixtureIds[0] : null), characters: [id] } }), { scroll: "catalog" });
    };

    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>(() => {
        return UNIT_DATA.filter(unit =>
            unit.charIds.length > 0 && unit.charIds.some(id => nav.browse.characters.includes(id))
        ).map(u => u.id);
    });

    const handleCharacterChange = useCallback((chars: number[]) => {
        change({ characters: chars });
    }, [change]);

    const handleResetFilters = useCallback(() => {
        setSelectedUnitIds([]);
        change({ query: "", characters: [], availability: "all", fixture: null });
    }, [change]);

    const hasActiveFilters = Boolean(
        nav.browse.query ||
        nav.browse.characters.length > 0 ||
        nav.browse.availability !== "all" ||
        nav.browse.fixture !== null
    );

    const quickFilterContent = useMemo(() => (
        <InteractionsFilters
            searchQuery={nav.browse.query}
            onSearchChange={query => change({ query })}
            tab={nav.browse.tab}
            onTabChange={tab => change({ tab })}
            selectedCharacters={nav.browse.characters}
            onCharacterChange={handleCharacterChange}
            selectedUnitIds={selectedUnitIds}
            onUnitIdsChange={setSelectedUnitIds}
            availability={nav.browse.availability}
            onAvailabilityChange={availability => change({ availability })}
            totalCount={catalog?.entries.length ?? 0}
            filteredCount={contentResults.length}
            hasActiveFilters={hasActiveFilters}
            onReset={handleResetFilters}
        />
    ), [
        nav.browse.query,
        nav.browse.tab,
        nav.browse.characters,
        selectedUnitIds,
        nav.browse.availability,
        catalog?.entries.length,
        contentResults.length,
        hasActiveFilters,
        change,
        handleCharacterChange,
        handleResetFilters,
    ]);

    useQuickFilter(t("page.mysekaiInteractions.filterTitle"), quickFilterContent, [
        quickFilterContent,
        t,
    ]);
    const showStage = (expanded: boolean) => {
        setStageExpanded(expanded);
        requestAnimationFrame(() => document.querySelector(expanded ? ".workspace-stage" : ".workspace-body")?.scrollIntoView({ block: "start", behavior: "instant" }));
    };
    const launch = (key: MolyKey | null, preview = false, sound = soundEnabled) => {
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

    /** Immediate preview/play start without blocking prompts */
    const start = (key: MolyKey | null, preview = false) => {
        launch(key, preview, soundEnabled);
    };

    const toggleSound = () => {
        const next = !soundEnabled;
        setSoundEnabled(next);
        try { localStorage.setItem(soundStorageKey, next ? "1" : "0"); } catch {}
        player.current?.setSoundEnabled(next);
    };

    const changeSound = (enabled: boolean) => {
        setSoundEnabled(enabled);
        try { localStorage.setItem(soundStorageKey, enabled ? "1" : "0"); } catch {}
        player.current?.setSoundEnabled(enabled);
    };

    const retryPlayer = async () => {
        if (!snapshot?.available || !manifest || closing) return;
        const key = selected?.available ? nav.content : null;
        await closePlayer();
        const identity = ++realmSequence.current;
        setSession({ id: identity, epoch: identity, snapshot, release: manifest.release, initial: runtimeSelectionFilters(nav.content, mode, nav.browse.tab), content: nav.content, play: key, soundEnabled });
        showStage(true);
    };

    const switchSource = async (next: string) => {
        if (next === source || closing || !servers.includes(next as ServerSourceType)) return;
        const intent = ++sourceIntent.current;
        if (session) await closePlayer();
        if (intent !== sourceIntent.current) return;
        commit(current => ({ ...current, page: 1, region: next, snapshot: null, browse: { ...INITIAL_BROWSE, tab: current.browse.tab },
            furniture: { ...INITIAL_FURNITURE }, content: null, invalidContent: false }), { scroll: "top" });
        setMode("independent"); setNotice(null);
    };

    const share = async () => {
        const url = new URL(window.location.href);
        url.search = workspaceQuery(nav).toString();
        url.hash = "";
        try { await navigator.clipboard.writeText(url.href); setNotice("copied"); }
        catch { setNotice("copyFailed"); }
    };

    const catalogProblem = expired ? "snapshotExpired" : manifestFailed ? "noDeployment" : !region || (manifest && !published) ? "regionUnavailable" : catalogFailed ? "catalogFailed" : null;

    return (
        <div
            ref={workspace}
            className="mysekai-interactions mysekai-workspace container mx-auto px-4 sm:px-6 py-6"
            data-workspace-region={source}
            onBlurCapture={event => { if (event.target instanceof HTMLInputElement) searchEditing.current = false; }}
        >
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-2.5 mb-1.5">
                        <h1 className="text-2xl sm:text-3xl font-black text-primary-text tracking-tight">
                            {t("page.mysekaiInteractions.title")}
                        </h1>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-miku/10 text-miku border border-miku/30">
                            {t("page.mysekaiWorkspace.alphaLabel")}
                        </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        {t("page.mysekaiInteractions.subtitle")}
                    </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    {/* Enter / Open Scene button */}
                    <button
                        type="button"
                        className="px-4 py-2 rounded-xl bg-miku hover:bg-miku/90 text-white font-bold text-xs sm:text-sm transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        disabled={!soundReady || !snapshot?.available || closing}
                        onClick={() => start(null)}
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
                        </svg>
                        <span>{t(`page.mysekaiWorkspace.${session ? "openScene" : "enterScene"}`)}</span>
                    </button>

                    {/* Settings Modal Trigger */}
                    <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        <span className="hidden sm:inline">{t("page.mysekaiWorkspace.settingsModalTitle")}</span>
                    </button>
                </div>
            </div>

            {/* Global Settings Modal */}
            <InteractionsSettingsModal
                isOpen={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                source={source}
                onSourceChange={switchSource}
                servers={servers}
                soundEnabled={soundEnabled}
                onSoundChange={changeSound}
                mode={mode}
                onModeChange={setMode}
                snapshot={snapshot}
                live={live}
                sessionActive={Boolean(session)}
                closing={closing}
                onSetWeather={id => player.current?.setWeather(id)}
                playerData={playerData}
                onSendPlayerData={value => {
                    if (!player.current) throw new Error("Stage not ready");
                    player.current.playerData(value);
                }}
                onExplorePlayerData={() => {
                    setMode("current");
                    player.current?.browse({ mode: "current" });
                    showStage(true);
                }}
            />

            {/* Navigation Tabs */}
            <nav className="flex gap-6 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label={t("page.mysekaiInteractions.browse")}>
                {(["conversations", "activities"] as const).map(tab => (
                    <button
                        key={tab}
                        data-tab={tab}
                        className={`pb-3 text-sm sm:text-base font-bold transition-all border-b-2 -mb-px flex items-center gap-2 cursor-pointer ${
                            nav.browse.tab === tab || (tab === "conversations" && nav.browse.tab === "performances")
                                ? "border-miku text-miku font-black"
                                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                        onClick={() => change({ tab })}
                    >
                        <span>{t(`page.mysekaiWorkspace.${tab}`)}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            {counts[tab]?.toLocaleString() ?? "—"}
                        </span>
                    </button>
                ))}
            </nav>

            {/* Active Context Chip Bar */}
            {(nav.browse.fixture || nav.browse.characters.length > 0) && (
                <div className="flex items-center flex-wrap gap-2 p-2.5 px-4 mb-4 rounded-xl bg-miku/10 border border-miku/20 text-xs" role="status">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">{t("page.mysekaiInteractions.filterScope")}:</span>
                    {nav.browse.fixture && (
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                            {contextFixture ?? `#${nav.browse.fixture}`}
                        </span>
                    )}
                    {nav.browse.characters.map(id => (
                        <span key={id} className="font-bold text-miku bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-miku/30">
                            {catalog?.characters.find(person => person.id === id)?.name ?? `#${id}`}
                        </span>
                    ))}
                    <button
                        type="button"
                        className="ml-auto text-xs text-slate-500 hover:text-red-500 transition-colors font-semibold cursor-pointer"
                        onClick={() => {
                            setSelectedUnitIds([]);
                            change({ fixture: null, characters: [] });
                        }}
                    >
                        {t("page.mysekaiInteractions.clearContext")} ×
                    </button>
                </div>
            )}

            {notice && <p className="workspace-feedback" role="status">{t(`page.mysekaiInteractions.${notice}`)}</p>}

            {/* Main Stage & Content Area */}
            <div className={`workspace-body${nav.content || nav.invalidContent ? " workspace-has-detail" : ""}`}>
                <WorkspaceStage
                    session={session}
                    player={player}
                    live={live}
                    boot={boot}
                    error={runtimeError}
                    expanded={stageExpanded}
                    closing={closing}
                    mode={mode}
                    soundEnabled={soundEnabled}
                    onToggleSound={toggleSound}
                    onOpenSettings={() => setSettingsOpen(true)}
                    setMode={setMode}
                    expand={showStage}
                    close={() => void closePlayer()}
                    retry={() => void retryPlayer()}
                    onSnapshot={setLive}
                    onBoot={setBoot}
                    onError={setRuntimeError}
                    onPlayerData={setPlayerData}
                />

                <div className="workspace-catalog-column">
                    {catalogProblem && (
                        <section className="workspace-inline-notice" role="status">
                            <h2>{t(`page.mysekaiInteractions.${catalogProblem}`, { region: source.toUpperCase() })}</h2>
                            <button className="interaction-button" onClick={() => setRetry(value => value + 1)}>{t("common.action.retry")}</button>
                            {expired && (
                                <button className="interaction-button" onClick={() => commit(current => ({ ...current, snapshot: null, content: null, invalidContent: false }))}>
                                    {t("page.mysekaiWorkspace.latestSource")}
                                </button>
                            )}
                        </section>
                    )}

                    {catalog && snapshot ? (
                        <ContentBrowser
                            catalog={catalog}
                            snapshot={snapshot}
                            browse={nav.browse}
                            results={contentResults}
                            selected={nav.content}
                            active={activeKey}
                            phase={phase}
                            page={page}
                            pageSize={pageSize}
                            change={change}
                            select={select}
                            onPage={next => commit(current => ({ ...current, page: next }), { scroll: "catalog" })}
                        />
                    ) : catalogLoading || !sourceReady ? (
                        <div className="flex items-center justify-center min-h-[300px]" role="status">
                            <div className="loading-spinner loading-spinner-sm" />
                        </div>
                    ) : null}
                </div>

                {/* Selected Content Detail Aside */}
                {(nav.content || nav.invalidContent) && (
                    <aside
                        className="workspace-detail-pane ios-glass-card rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
                        data-mysekai-detail
                        tabIndex={-1}
                        aria-label={t("page.mysekaiWorkspace.detail")}
                    >
                        <div className="workspace-detail-toolbar flex items-center justify-between p-3 px-4 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
                            <button className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-miku transition-colors cursor-pointer" onClick={back}>
                                ← {t("page.mysekaiWorkspace.backToResults")}
                            </button>
                            <button
                                className="w-7 h-7 rounded-full grid place-items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                aria-label={t("common.action.close")}
                                onClick={() => commit(current => ({ ...current, content: null, invalidContent: false }), { scroll: "catalog" })}
                            >
                                ×
                            </button>
                        </div>

                        {visibleEntry && snapshot ? (
                            <ContentDetail
                                entry={visibleEntry}
                                snapshot={snapshot}
                                detailLoading={detailLoading}
                                detailFailed={detailFailed}
                                canPlay={canPlay}
                                preparing={preparing}
                                reason={reason}
                                playing={activeKey === nav.content}
                                replacing={Boolean(activeKey && activeKey !== nav.content)}
                                restoring={closing || phase === "restoring"}
                                preview={() => start(visibleEntry.key, true)}
                                previewing={Boolean(live?.status.preview && activeKey === visibleEntry.key)}
                                play={() => start(visibleEntry.key)}
                                share={() => void share()}
                                retry={() => setDetailRetry(value => value + 1)}
                                related={related}
                                character={character}
                                fixture={id => related(id, "performances")}
                            />
                        ) : (
                            <div className="p-12 text-center text-xs text-slate-400" role="status">
                                <p>{t(`page.mysekaiInteractions.${missing ? "contentMissing" : "loading"}`)}</p>
                                {missing && (
                                    <button
                                        type="button"
                                        className="mt-3 px-3 py-1.5 rounded-lg bg-miku text-white font-semibold"
                                        onClick={back}
                                    >
                                        {t("page.mysekaiWorkspace.backToResults")}
                                    </button>
                                )}
                            </div>
                        )}
                    </aside>
                )}
            </div>

            {/* Collapsed mini transport floating bottom */}
            {session && !stageExpanded && (
                <div className="workspace-mini-transport">
                    <button onClick={() => showStage(true)}>
                        <span className={`interaction-phase interaction-phase-${phase}`}>
                            {t(`page.mysekaiInteractions.phase.${phase}`)}
                        </span>
                        <strong>{live?.status.activeTitle ?? t("page.mysekaiWorkspace.scene")}</strong>
                        <span>{t("page.mysekaiWorkspace.openScene")} ↑</span>
                    </button>
                    {live?.status.canStop && (
                        <button
                            className="interaction-text-button"
                            disabled={closing}
                            onClick={() => player.current?.stop()}
                        >
                            {t(`page.mysekaiInteractions.${phase === "completed" ? "returnScene" : "stop"}`)}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default function InteractionsClient({ defaultTab = "conversations" }: { defaultTab?: MolyTab }) {
    return (
        <MainLayout>
            <Suspense>
                <WorkspaceContent defaultTab={defaultTab} />
            </Suspense>
        </MainLayout>
    );
}
