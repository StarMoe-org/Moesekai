"use client";

import { Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "@/components/LocalizedLink";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { localizePathForBrowser, replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import { INITIAL_BROWSE, filterCatalog, furnitureHref, interactionHref, parseBrowse, supportedRegion, validContentKey, type BrowseState } from "@/lib/moly/catalog";
import { useContentCatalog, useContentDetail, useRuntimeManifest } from "@/lib/moly/useResources";
import type { MolyBoot, MolyError, MolyKey, MolySnapshot, MolyTab } from "@/lib/moly/contract";
import RuntimeStage, { type PlayerSession, type RuntimeStageHandle } from "@/components/mysekai-interactions/RuntimeStage";
import ContentBrowser from "@/components/mysekai-interactions/ContentBrowser";
import ContentDetail from "@/components/mysekai-interactions/ContentDetail";
import ContentArtwork from "@/components/mysekai-interactions/ContentArtwork";
import ResourceCachePanel from "@/components/mysekai-interactions/ResourceCachePanel";
import "./interactions.css";
import "@/components/mysekai-interactions/participants.css";
import { getLocaleRouteConfig, uiLocaleToRouteLocale } from "@/lib/locale-routing";

const subscribeHydration = () => () => {};
const hydratedSnapshot = () => true;
const serverHydrationSnapshot = () => false;

interface NavigationState { page: number; region: string | null; snapshot: string | null; browse: BrowseState; content: MolyKey | null; invalidContent: boolean; }
function fromParams(params: URLSearchParams): NavigationState {
    const content = params.get("content");
    const browse = parseBrowse(params);
    if (!params.has("tab")) {
        if (content?.startsWith("fixture:") || (!content && browse.fixture)) browse.tab = "furniture";
        else if (content?.startsWith("activity:")) browse.tab = "activities";
    }
    return { page: Math.min(100000, Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1)), region: params.get("region"), snapshot: params.get("snapshot"), browse,
        content: validContentKey(content) ? content : !content && browse.fixture ? `fixture:${browse.fixture}` : null,
        invalidContent: Boolean(content && !validContentKey(content)) };
}

function InteractionsContent() {
    const params = useSearchParams();
    const { t, locale } = useI18n();
    const { serverSource, hasHydratedThemeSettings } = useTheme();
    const hydrated = useSyncExternalStore(subscribeHydration, hydratedSnapshot, serverHydrationSnapshot);
    const [nav, setNav] = useState(() => fromParams(new URLSearchParams(params.toString())));
    const [retry, setRetry] = useState(0);
    const [detailRetry, setDetailRetry] = useState(0);
    const [session, setSession] = useState<PlayerSession | null>(null);
    const [live, setLive] = useState<MolySnapshot | null>(null);
    const [boot, setBoot] = useState<MolyBoot | null>(null);
    const [runtimeError, setRuntimeError] = useState<MolyError | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [mode, setMode] = useState<"independent" | "current">("independent");
    const [closing, setClosing] = useState(false);
    const player = useRef<RuntimeStageHandle>(null);
    const stage = useRef<HTMLDivElement>(null);
    const sessionSequence = useRef(0);
    const pendingScroll = useRef<{ x: number; y: number; anchor: HTMLElement | null; top: number } | null>(null);
    const retainViewport = () => {
        const anchor = Array.from(document.querySelectorAll<HTMLElement>(".interaction-card"))
            .find(element => { const rect = element.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight; }) ?? null;
        pendingScroll.current = { x: scrollX, y: scrollY, anchor, top: anchor?.getBoundingClientRect().top ?? 0 };
    };
    // A Suspense subtree may hydrate after the parent restored preferences.
    // Its initial render still needs the same locale default as SSR. Defer
    // catalogue binding until the one existing settings owner is ready.
    const sourceReady = nav.region !== null || (hydrated && hasHydratedThemeSettings);
    const source = nav.region ?? (hydrated && hasHydratedThemeSettings ? serverSource : getLocaleRouteConfig(uiLocaleToRouteLocale(locale)).defaultServer);
    const region = supportedRegion(source);
    const { manifest, failed: manifestFailed } = useRuntimeManifest(retry);
    const published = manifest?.snapshots.find(item => item.region === region);
    const expired = Boolean(nav.snapshot && published && nav.snapshot !== published.id);
    const snapshot = sourceReady && !expired && published?.available ? published : undefined;
    const { catalog, failed: catalogFailed } = useContentCatalog(snapshot, retry);
    const entries = useMemo(() => new Map(catalog?.entries.map(entry => [entry.key, entry]) ?? []), [catalog]);
    const selected = nav.content ? entries.get(nav.content) : undefined;
    const { detail, loading: detailLoading, failed: detailFailed } = useContentDetail(snapshot, selected, detailRetry);
    const visibleEntry = detail ?? selected;
    const deferredBrowse = useDeferredValue(nav.browse);
    const results = useMemo(() => catalog ? filterCatalog(catalog, deferredBrowse) : [], [catalog, deferredBrowse]);
    const pageSize = 24;
    const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
    const page = Math.min(nav.page, pageCount);
    const contextFixture = nav.browse.fixture ? entries.get(`fixture:${nav.browse.fixture}`) : undefined;
    const missing = nav.invalidContent || Boolean(nav.content && catalog && !selected);
    const activeKey = live?.status.activeKey ?? null;
    const ownerBusy = Boolean(live?.status.canStop);
    const currentAdmission = live?.selected?.key === nav.content && live.mode === "current" ? live.selected : null;
    // Only consume the Rust projection. There are no cast/furniture eligibility rules here.
    const canPlay = Boolean(selected && (mode === "independent" ? selected.available : currentAdmission?.available));
    const reason = mode === "current" ? currentAdmission?.reasonCode ?? null : selected?.reasonCode ?? null;
    const phase = closing ? "restoring" : live?.status.phase ?? (session ? "preparing" : "idle");
    const loading = !manifestFailed && (!sourceReady || !manifest || Boolean(snapshot && !catalog && !catalogFailed));
    const blocked = manifestFailed ? "noDeployment" : expired ? "snapshotExpired"
        : manifest && sourceReady && (!region || !published?.available) ? "regionUnavailable"
            : catalogFailed ? "catalogFailed" : missing ? "contentMissing" : null;

    useLayoutEffect(() => {
        const previous = pendingScroll.current;
        if (!previous) return;
        if (previous.anchor?.isConnected) {
            const delta = previous.anchor.getBoundingClientRect().top - previous.top;
            if (Math.abs(delta) > 0.5) window.scrollTo({ left: previous.x, top: window.scrollY + delta, behavior: "instant" });
        } else {
            window.scrollTo({ left: previous.x, top: previous.y, behavior: "instant" });
        }
        // Selecting a catalogue row changes twice: first the lightweight index
        // row, then the source detail payload. Keep the same visible card pinned
        // through both layouts instead of clearing the restore after the first.
        if (!detailLoading) pendingScroll.current = null;
    }, [nav, detail, session, detailLoading]);

    useEffect(() => {
        if (!catalog || !snapshot || (nav.region && nav.snapshot)) return;
        // Pin identity once discovery completes, not on every theme/server change.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNav(current => ({ ...current, region: current.region ?? snapshot.region, snapshot: current.snapshot ?? snapshot.id }));
    }, [catalog, snapshot, nav.region, nav.snapshot]);

    useEffect(() => {
        if (!nav.region) return;
        const query = new URLSearchParams(window.location.search);
        for (const key of ["region", "snapshot", "tab", "q", "character", "fixture", "availability", "content", "page"]) query.delete(key);
        query.set("region", nav.region);
        if (nav.snapshot) query.set("snapshot", nav.snapshot);
        query.set("tab", nav.browse.tab);
        if (nav.page > 1) query.set("page", String(nav.page));
        if (nav.browse.query) query.set("q", nav.browse.query);
        if (nav.browse.character) query.set("character", String(nav.browse.character));
        if (nav.browse.fixture) query.set("fixture", String(nav.browse.fixture));
        if (nav.browse.availability !== "all") query.set("availability", nav.browse.availability);
        if (nav.content) query.set("content", nav.content);
        if (query.toString() !== window.location.search.slice(1)) replaceCurrentUrlSearchParams(query);
    }, [nav]);

    useEffect(() => {
        if (!session) return;
        player.current?.browse({ ...nav.browse, mode });
        if (nav.content) player.current?.select(nav.content);
    }, [session, nav.browse, nav.content, mode]);

    const closePlayer = useCallback(async () => {
        setClosing(true);
        const restored = await (player.current?.close() ?? Promise.resolve(true));
        setSession(null); setLive(null); setBoot(null); setRuntimeError(null); setClosing(false);
        if (!restored) setNotice("restoreInterrupted");
    }, []);

    useEffect(() => {
        const navigate = () => {
            const next = fromParams(new URLSearchParams(window.location.search));
            if (session && next.region && next.region !== session.snapshot.region) {
                void closePlayer().then(() => setNav(next));
            } else setNav(next);
        };
        window.addEventListener("popstate", navigate);
        return () => window.removeEventListener("popstate", navigate);
    }, [session, closePlayer]);

    const change = (value: Partial<BrowseState>) => {
        retainViewport();
        setNav(current => {
            const browse = { ...current.browse, ...value };
            const entry = current.content ? entries.get(current.content) : undefined;
            // A filtered-out detail must not keep offering an invalid Play
            // intent. This affects selection only, never the active player.
            const visible = entry && catalog && filterCatalog({ ...catalog, entries: [entry] }, browse).length > 0;
            return { ...current, page: 1, browse, content: visible ? current.content : null };
        });
    };
    const goToPage = (next: number) => {
        const target = Math.max(1, Math.min(pageCount, next));
        if (target === page) return;
        const query = new URLSearchParams(window.location.search);
        if (target === 1) query.delete("page"); else query.set("page", String(target));
        window.history.pushState(window.history.state, "", window.location.pathname + "?" + query.toString());
        pendingScroll.current = null;
        setNav(current => ({ ...current, page: target }));
        requestAnimationFrame(() => document.querySelector(".interaction-browser")?.scrollIntoView({ block: "start", behavior: "instant" }));
    };
    const select = (content: MolyKey) => {
        retainViewport();
        setNav(current => ({ ...current, content, invalidContent: false }));
        setNotice(null);
    };
    const related = (fixture: number, tab: MolyTab) => {
        change({ fixture, tab, query: "", character: null });
    };
    const showStage = () => stage.current?.scrollIntoView({ block: "start", behavior: "auto" });
    const start = (key: MolyKey | null) => {
        retainViewport();
        if (!snapshot || !manifest || closing) return;
        setRuntimeError(null); setNotice(null);
        if (session) { if (key) player.current?.play(key); }
        else setSession({ id: ++sessionSequence.current, snapshot, release: manifest.release,
            initial: { ...nav.browse, mode }, content: nav.content, play: key });
    };
    const switchSource = async (next: string) => {
        if (closing || next === source) return;
        if (session) await closePlayer();
        setNav({ page: 1, region: next, snapshot: null, browse: { ...INITIAL_BROWSE }, content: null, invalidContent: false });
        setMode("independent"); setNotice(null);
    };
    const share = async () => {
        if (!snapshot || !nav.content) return;
        const href = interactionHref({ region: snapshot.region, snapshot: snapshot.id, content: nav.content, fixture: nav.browse.fixture, tab: nav.browse.tab });
        try { await navigator.clipboard.writeText(new URL(localizePathForBrowser(href), location.origin).href); setNotice("copied"); }
        catch { setNotice("copyFailed"); }
    };
    const runtimeFailure = runtimeError || live?.status.phase === "error";

    return <div className="mysekai-interactions">
        <header className="interaction-page-heading">
            <div><p className="interaction-eyebrow">MYSEKAI</p><h1>{t("page.mysekaiInteractions.title")}</h1><p>{t("page.mysekaiInteractions.subtitle")}</p></div>
            <nav aria-label={t("page.mysekaiInteractions.related")}><Link href={`/mysekai/?region=${encodeURIComponent(source)}`}>{t("page.mysekaiInteractions.furnitureDatabase")}</Link><Link href="/mysekai-preview/scene/">{t("page.mysekaiInteractions.scenePreview")}</Link></nav>
        </header>
        <div className="interaction-source-bar">
            <div><span className="interaction-eyebrow">{t("page.mysekaiInteractions.source")}</span> <strong>{source.toUpperCase()}</strong>{snapshot && <span>{snapshot.version}</span>}</div>
            <div className="interaction-source-options">{manifest?.snapshots.map(item => <button key={item.id} className="interaction-chip" aria-pressed={source === item.region} disabled={closing || !item.available} onClick={() => void switchSource(item.region)}>{item.region.toUpperCase()}</button>)}</div>
        </div>
        <p className="interaction-source-note">{t("page.mysekaiInteractions.sourceHint")}{nav.region !== null && <> {t("page.mysekaiInteractions.pinnedRegion", { region: source.toUpperCase() })}</>}</p>
        {nav.browse.fixture && region && <div className="interaction-context">
            <Link href={furnitureHref(region, nav.browse.fixture)}>{t("page.mysekaiInteractions.fromFixture", { name: contextFixture?.title ?? `#${nav.browse.fixture}` })}</Link>
            <button className="interaction-text-button" onClick={() => change({ fixture: null })}>{t("page.mysekaiInteractions.clearContext")}</button>
        </div>}
        {blocked && <section className="interaction-notice" role="status">
            <h2>{t(`page.mysekaiInteractions.${blocked}`, { region: source.toUpperCase() })}</h2>
            {(blocked === "noDeployment" || blocked === "regionUnavailable") && <p>{t(`page.mysekaiInteractions.${blocked}Hint`)}</p>}
            {(blocked === "regionUnavailable" || blocked === "snapshotExpired") && <p>{t("page.mysekaiInteractions.switchHint")}</p>}
            <button className="interaction-button" onClick={() => setRetry(value => value + 1)}>{t("page.mysekaiInteractions.retry")}</button>
            {blocked === "snapshotExpired" && <button className="interaction-button" onClick={() => { void closePlayer().then(() => { setNav({ page: 1, region: source, snapshot: null, browse: { ...INITIAL_BROWSE }, content: null, invalidContent: false }); }); }}>{t("page.mysekaiInteractions.switchRegion", { region: source.toUpperCase() })}</button>}
        </section>}
        {loading && <div className="interaction-loading" role="status">{t("page.mysekaiInteractions.loading")}</div>}
        {(snapshot || session) && Boolean(nav.content || session) && <div className="interaction-experience">
            <section className="interaction-stage-column" ref={stage} aria-label={t("page.mysekaiInteractions.nowPlaying")}>
                <div className="interaction-stage-surface">
                    {session ? <RuntimeStage ref={player} session={session} onSnapshot={setLive} onBoot={setBoot} onError={setRuntimeError} />
                        : <div className="interaction-stage-placeholder">
                            {visibleEntry && snapshot && <ContentArtwork entry={visibleEntry} snapshot={snapshot} large />}
                            <span className="interaction-eyebrow">{t("page.mysekaiInteractions.catalogOnly")}</span>
                            <h2>{t("page.mysekaiInteractions.loadPlayer")}</h2><p>{t("page.mysekaiInteractions.loadHint")}</p>
                            {manifest && <small>{t("page.mysekaiInteractions.downloadSize", { size: Math.ceil(Math.max(manifest.release.engines.webgpu.downloadBytes, manifest.release.engines.webgl2.downloadBytes) / 1048576) })}</small>}
                            <button className="interaction-button interaction-primary" onClick={() => start(null)}>{t("page.mysekaiInteractions.loadPlayer")}</button>
                        </div>}
                </div>
                <div className="interaction-transport" data-runtime-phase={phase}>
                    <div aria-live="polite"><span className={`interaction-phase interaction-phase-${phase}`}>{t(`page.mysekaiInteractions.phase.${phase}`)}</span>
                        {live?.status.activeTitle && <strong>{live.status.activeTitle}</strong>}
                        {boot?.backend && <span className="interaction-backend">{boot.backend === "webgpu" ? "WebGPU" : "WebGL 2"}</span>}
                    </div>
                    {session && <div className="interaction-transport-actions"><button className="interaction-button" disabled={!ownerBusy || closing} onClick={() => player.current?.stop()}>{t("page.mysekaiInteractions.stop")}</button><button className="interaction-text-button" disabled={closing} onClick={() => void closePlayer()}>{t("page.mysekaiInteractions.closePlayer")}</button></div>}
                </div>
                <div className="interaction-mode"><label>{t(`page.mysekaiInteractions.mode.${mode}`)} <select aria-label={t(`page.mysekaiInteractions.mode.${mode}`)} disabled={ownerBusy || closing} value={mode} onChange={event => setMode(event.target.value as "independent" | "current")}>
                    <option value="independent">{t("page.mysekaiInteractions.mode.independent")}</option><option value="current">{t("page.mysekaiInteractions.mode.current")}</option></select></label><p>{t(`page.mysekaiInteractions.${mode === "independent" ? "modeHint" : "currentHint"}`)}</p></div>
                <ResourceCachePanel playerOpen={Boolean(session)} />
                {runtimeFailure && <div className="interaction-notice" role="alert"><p>{t(`page.mysekaiInteractions.${runtimeError?.code === "source_mismatch" ? "sourceMismatch" : "runtimeFailed"}`)}</p><button className="interaction-button" onClick={() => void closePlayer()}>{t("page.mysekaiInteractions.closePlayer")}</button></div>}
            </section>
            {visibleEntry && snapshot ? <ContentDetail entry={visibleEntry} snapshot={snapshot} detailLoading={detailLoading} detailFailed={detailFailed} canPlay={canPlay}
                reason={reason} playing={activeKey === nav.content} replacing={Boolean(activeKey && activeKey !== nav.content)} restoring={closing || phase === "restoring"}
                play={() => start(visibleEntry.key)} share={() => void share()} retry={() => setDetailRetry(value => value + 1)} related={related} character={id => change({ character: id })} />
                : <section className="interaction-detail interaction-empty"><h2>{t("page.mysekaiInteractions.choose")}</h2><p>{t("page.mysekaiInteractions.chooseHint")}</p></section>}
        </div>}
        {notice && <p className="interaction-feedback" role="status">{t(`page.mysekaiInteractions.${notice}`)}</p>}
        {catalog && snapshot && <ContentBrowser catalog={catalog} snapshot={snapshot} browse={nav.browse} results={results} selected={nav.content}
            active={phase === "playing" ? activeKey : null} page={page} pageSize={pageSize} change={change} select={select} onPage={goToPage} />}
        {ownerBusy && <div className="interaction-mini-transport"><button onClick={showStage}><span className="interaction-live-dot">{t(`page.mysekaiInteractions.phase.${phase}`)}</span><strong>{live?.status.activeTitle}</strong></button><button onClick={() => player.current?.stop()}>{t("page.mysekaiInteractions.stop")}</button></div>}
    </div>;
}

export default function InteractionsClient() {
    return <MainLayout><Suspense><InteractionsContent /></Suspense></MainLayout>;
}
