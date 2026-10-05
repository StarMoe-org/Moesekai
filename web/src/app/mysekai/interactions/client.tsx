"use client";

import { Suspense, useCallback, useDeferredValue, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import { Button, IconButton, LoadingState, PageHeader } from "@/components/md3";
import { mdArrowBack, mdClose, mdPlayArrowFill, mdSettings } from "@/components/md3/icons";
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
    // A link's region decides the first view; a later change of the site's
    // server is followed like a switch made on this page.
    const followServer = useEffectEvent((next: ServerSourceType) => { void switchSource(next); });
    const followedServer = useRef<ServerSourceType | null>(null);
    useEffect(() => {
        if (!hydrated || !hasHydratedThemeSettings) return;
        const previous = followedServer.current;
        followedServer.current = serverSource;
        if (previous !== null && previous !== serverSource) followServer(serverSource);
    }, [hydrated, hasHydratedThemeSettings, serverSource]);

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
            className="mysekai-interactions mysekai-workspace mx-auto w-full"
            data-workspace-region={source}
            onBlurCapture={event => { if (event.target instanceof HTMLInputElement) searchEditing.current = false; }}
        >
            {/* Page Header */}
            <PageHeader
                className="mb-6 sm:mb-6"
                title={
                    <span className="inline-flex flex-wrap items-center gap-2.5">
                        {t("page.mysekaiInteractions.title")}
                        <span className="rounded-md3-sm bg-tertiary-container px-2 py-0.5 type-label-m text-on-tertiary-container">
                            {t("page.mysekaiWorkspace.alphaLabel")}
                        </span>
                    </span>
                }
                description={
                    <>
                        {t("page.mysekaiInteractions.subtitle")}
                        <span className="mt-1 block type-body-s text-on-surface-variant">
                            {t("page.mysekaiInteractions.r6.engineSource")}{" "}
                            <ExternalLink href="https://github.com/empty-sekai/moly" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                moly
                            </ExternalLink>
                        </span>
                    </>
                }
                actions={
                    <>
                        {/* Enter / Open Scene button */}
                        <Button
                            variant="filled"
                            icon={mdPlayArrowFill}
                            disabled={!soundReady || !snapshot?.available || closing}
                            onClick={() => start(null)}
                        >
                            {t(`page.mysekaiWorkspace.${session ? "openScene" : "enterScene"}`)}
                        </Button>

                        {/* Settings Modal Trigger */}
                        <Button variant="tonal" icon={mdSettings} onClick={() => setSettingsOpen(true)}>
                            <span className="hidden sm:inline">{t("page.mysekaiWorkspace.settingsModalTitle")}</span>
                        </Button>
                    </>
                }
            />

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
            <nav className="mb-6 flex gap-2 border-b border-outline-variant" aria-label={t("page.mysekaiInteractions.browse")}>
                {(["conversations", "activities"] as const).map(tab => {
                    const active = nav.browse.tab === tab || (tab === "conversations" && nav.browse.tab === "performances");
                    return (
                        <button
                            key={tab}
                            data-tab={tab}
                            aria-pressed={active}
                            className={`state-layer focus-ring relative -mb-px flex cursor-pointer items-center gap-2 rounded-t-md3-sm border-b-[3px] px-3 pb-3 pt-2 type-title-s transition-colors ${
                                active
                                    ? "border-primary text-primary"
                                    : "border-transparent text-on-surface-variant hover:text-on-surface"
                            }`}
                            onClick={() => change({ tab })}
                        >
                            <span>{t(`page.mysekaiWorkspace.${tab}`)}</span>
                            <span className={`rounded-md3-sm px-2 py-0.5 type-label-m ${active ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface-variant"}`}>
                                {counts[tab]?.toLocaleString() ?? "—"}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {/* Active Context Chip Bar */}
            {(nav.browse.fixture || nav.browse.characters.length > 0) && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md3-lg bg-secondary-container px-4 py-2.5 type-body-s text-on-secondary-container" role="status">
                    <span>{t("page.mysekaiInteractions.filterScope")}:</span>
                    {nav.browse.fixture && (
                        <span className="type-label-l">
                            {contextFixture ?? `#${nav.browse.fixture}`}
                        </span>
                    )}
                    {nav.browse.characters.map(id => (
                        <span key={id} className="rounded-md3-sm bg-surface-container-lowest px-2 py-0.5 type-label-m text-primary">
                            {catalog?.characters.find(person => person.id === id)?.name ?? `#${id}`}
                        </span>
                    ))}
                    <Button
                        size="xs"
                        variant="text"
                        trailingIcon={mdClose}
                        className="ml-auto"
                        onClick={() => {
                            setSelectedUnitIds([]);
                            change({ fixture: null, characters: [] });
                        }}
                    >
                        {t("page.mysekaiInteractions.clearContext")}
                    </Button>
                </div>
            )}

            {notice && <p className="workspace-feedback" role="status">{t(`page.mysekaiInteractions.${notice}`)}</p>}

            {/* Main Stage & Content Area */}
            <div className={`workspace-body${nav.content || nav.invalidContent ?" workspace-has-detail" : ""}`}>
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
                        <LoadingState className="min-h-[300px]" />
                    ) : null}
                </div>

                {/* Selected Content Detail Aside */}
                {(nav.content || nav.invalidContent) && (
                    <aside
                        className="workspace-detail-pane overflow-hidden"
                        data-mysekai-detail
                        tabIndex={-1}
                        aria-label={t("page.mysekaiWorkspace.detail")}
                    >
                        <div className="workspace-detail-toolbar">
                            <Button size="xs" variant="text" icon={mdArrowBack} onClick={back}>
                                {t("page.mysekaiWorkspace.backToResults")}
                            </Button>
                            <IconButton
                                icon={mdClose}
                                size="xs"
                                label={t("common.action.close")}
                                onClick={() => commit(current => ({ ...current, content: null, invalidContent: false }), { scroll: "catalog" })}
                            />
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
                            <div className="p-12 text-center type-body-s text-on-surface-variant" role="status">
                                <p>{t(`page.mysekaiInteractions.${missing ? "contentMissing" : "loading"}`)}</p>
                                {missing && (
                                    <Button variant="filled" size="xs" className="mt-3" onClick={back}>
                                        {t("page.mysekaiWorkspace.backToResults")}
                                    </Button>
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
