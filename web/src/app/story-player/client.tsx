"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import LocalizedLink from "@/components/LocalizedLink";
import { Banner, Button, IconButton, LoadingState, PageContainer, PageHeader, Select, Slider, Surface } from "@/components/md3";
import {
    mdChevronLeft, mdChevronRight, mdFullscreen, mdListAlt, mdPlayArrowFill, mdReplay, mdSkipNext, mdTune,
} from "@/components/md3/icons";
import { Live2DPlayerSettings } from "@/components/story/Live2DPlayerSettings";
import { Live2DControls, Live2DFailureBanner, Live2DStage } from "@/components/story/Live2DStage";
import { live2dActiveRow, live2dRows } from "@/components/story/live2dRows";
import { useLive2DPlayer } from "@/components/story/useLive2DPlayer";
import { STORY_KIND_LABEL_KEYS, storyEpisodeLabel, storyGroupTitle } from "@/components/story-player/labels";
import { StoryPickerDialog } from "@/components/story-player/StoryPickerDialog";
import { StoryScriptPanel, type StoryScriptState } from "@/components/story-player/StoryScriptPanel";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useStoryCatalogs } from "@/hooks/useStoryCatalogs";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { SSE_WEB_REGIONS, sseWebSources, type SseWebRegion } from "@/lib/sseWeb/config";
import type { SsePlayerNode } from "@/lib/sseWeb/player";
import { StoryAssetMissingError } from "@/lib/storyAsset";
import {
    parseSelector, selectorKind, storyPlayerHref, type StoryEpisode, type StoryKind,
} from "@/lib/storyPlayer/episodes";
import { loadEpisodeScript } from "@/lib/storyPlayer/script";

const subscribeNever = () => () => {};

/** The servers whose libraries can be played here (each needs a client unpack). */
const REGIONS: readonly SseWebRegion[] = SSE_WEB_REGIONS.filter(region => sseWebSources(region) !== null);

function playableRegion(value: string | null | undefined): SseWebRegion | null {
    return REGIONS.find(region => region === value?.trim().toLowerCase()) ?? null;
}

/** The episode's script in the chosen server's text (loading until it comes), or null without an episode. */
function useEpisodeScript(episode: StoryEpisode | undefined, region: SseWebRegion | null): StoryScriptState | null {
    const { assetSource } = useTheme();
    const key = episode && region ? `${region}|${assetSource}|${episode.selector}` : null;
    const [result, setResult] = useState<{ key: string; state: StoryScriptState } | null>(null);

    useEffect(() => {
        if (!key || !episode || !region) return;
        let cancelled = false;
        loadEpisodeScript(episode, region, assetSource).then(
            data => { if (!cancelled) setResult({ key, state: { status: "ready", data } }); },
            (error: unknown) => {
                if (cancelled) return;
                setResult({
                    key,
                    state: error instanceof StoryAssetMissingError
                        ? { status: "missing", paths: error.missingPaths }
                        : { status: "error", message: error instanceof Error ? error.message : String(error) },
                });
            },
        );
        return () => { cancelled = true; };
        // the key names the episode, its server and the asset source
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    if (!key) return null;
    return result?.key === key ? result.state : { status: "loading" };
}

/**
 * The story player: one episode of a server's story library played on a stage, with its
 * script beside it, the two following each other. The address names the server and the
 * episode (`?server=jp&ep=event:140/1`), so a link opens the same one.
 */
function StoryPlayerContent() {
    const { t } = useI18n();
    const params = useSearchParams();
    const { serverSource, hasHydratedThemeSettings } = useTheme();
    const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

    // What the reader chose on this page; the address, then the site's server, before that.
    const [chosen, setChosen] = useState<{ region?: SseWebRegion; selector?: string | null }>({});
    const themeRegion = hydrated && hasHydratedThemeSettings ? playableRegion(serverSource) ?? REGIONS[0] ?? null : null;
    const region = chosen.region ?? playableRegion(params.get("server")) ?? themeRegion;
    const selector = chosen.selector !== undefined ? chosen.selector : parseSelector(params.get("ep"));
    const kind = selector ? selectorKind(selector) : null;

    // The address follows what is shown, so it can be shared.
    useEffect(() => {
        if (!region) return;
        const url = new URL(window.location.href);
        const target = new URL(storyPlayerHref(region, selector), url.origin);
        if (url.search === target.search) return;
        url.search = target.search;
        window.history.replaceState({}, "", url.toString());
    }, [region, selector]);

    const catalogs = useStoryCatalogs(region);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerKind, setPickerKind] = useState<StoryKind>("event");
    const { request } = catalogs;
    useEffect(() => {
        if (kind) request(kind);
    }, [kind, request]);
    useEffect(() => {
        if (pickerOpen) request(pickerKind);
    }, [pickerOpen, pickerKind, request]);

    const catalogState = kind ? catalogs.get(kind) : null;
    const catalog = catalogState?.status === "ready" ? catalogState.catalog : null;
    const episode = catalog && selector ? catalog.episodes.get(selector) : undefined;
    const notInLibrary = catalog !== null && selector !== null && episode === undefined;
    const index = episode && catalog ? catalog.order.indexOf(episode) : -1;
    const previousEpisode = index > 0 ? catalog?.order[index - 1] : undefined;
    const nextEpisode = index >= 0 ? catalog?.order[index + 1] : undefined;

    // The player, and where it is in the script.
    const [nodes, setNodes] = useState<readonly SsePlayerNode[] | null>(null);
    const [node, setNode] = useState(0);
    const [follow, setFollow] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [seekTo, setSeekTo] = useState<number | null>(null);
    const onActiveChange = useCallback((active: boolean) => {
        if (!active) setNodes(null);
    }, []);
    const onNode = useCallback((at: number, all: readonly SsePlayerNode[]) => {
        setNode(at);
        setNodes(all);
    }, []);
    const { stageRef, player } = useLive2DPlayer({ selector, region: region ?? "", onActiveChange, onNode });
    // the script of an episode not (yet) known from the catalog is on its way, or there is none
    const script: StoryScriptState = useEpisodeScript(episode, region)
        ?? (selector && !notInLibrary && catalogState?.status !== "error" ? { status: "loading" } : { status: "none" });
    const scriptActions = script.status === "ready" ? script.data.actions : undefined;
    const rows = useMemo(() => live2dRows(scriptActions, nodes), [scriptActions, nodes]);
    const activeRow = player.phase === "ready" && nodes ? live2dActiveRow(rows, node) : -1;

    // An episode the reader picked plays as soon as it is loaded; one the address names waits
    // to be asked (it downloads the whole episode).
    const startOnChoice = useRef<string | null>(null);
    const { start } = player;
    useEffect(() => {
        if (!selector || startOnChoice.current !== selector) return;
        startOnChoice.current = null;
        void start({ play: true });
    }, [selector, start]);

    const choose = (next: string) => {
        if (next === selector) {
            if (player.phase === "idle" || player.phase === "failed") void start({ play: true });
            return;
        }
        startOnChoice.current = next;
        setChosen(previous => ({ ...previous, region: region ?? undefined, selector: next }));
    };

    const changeRegion = (next: SseWebRegion) => {
        if (next === region) return;
        startOnChoice.current = null;
        setChosen({ region: next, selector });
    };

    const openPicker = () => {
        setPickerKind(kind ?? "event");
        setPickerOpen(true);
    };

    const commitSeek = () => {
        if (seekTo === null) return;
        player.seek(seekTo);
        setSeekTo(null);
    };

    const { phase, position } = player;
    const lastNode = Math.max(0, position.nodes - 1);
    const groupOfEpisode = episode && catalog ? catalog.groups.find(group => group.key === episode.group) : undefined;

    const heading = episode && groupOfEpisode && kind ? (
        <>
            <span className="block truncate type-label-l text-primary">
                {t(STORY_KIND_LABEL_KEYS[kind])} · {storyGroupTitle(groupOfEpisode, t)}
            </span>
            <span className="mt-0.5 line-clamp-2 type-title-l text-on-surface group-hover:text-primary">
                {storyEpisodeLabel(episode, t)}{episode.title && episode.title !== storyEpisodeLabel(episode, t) && ` — ${episode.title}`}
            </span>
        </>
    ) : selector ? (
        <>
            <span className="block truncate type-label-l text-primary">{kind ? t(STORY_KIND_LABEL_KEYS[kind]) : null}</span>
            <span className="mt-0.5 block truncate font-mono type-title-m text-on-surface">{selector}</span>
        </>
    ) : (
        <span className="block type-title-m text-on-surface-variant">{t("page.storyPlayer.noEpisodeTitle")}</span>
    );

    return (
        <PageContainer wide>
            <PageHeader title={t("page.storyPlayer.title")} description={t("page.storyPlayer.description")} />

            {/* Laid out by the width the page has beside the site's navigation, not the window's. */}
            <div className="@container">
            <Surface tone="default" radius="xl" className="mb-4 flex flex-col gap-3 p-3 sm:p-4 @3xl:flex-row @3xl:items-center">
                <div className="min-w-0 flex-1">
                    {episode?.readerHref ? (
                        <LocalizedLink
                            href={episode.readerHref}
                            title={t("page.storyPlayer.readStory")}
                            className="group state-layer focus-ring -m-1 block rounded-md3-md p-1"
                        >
                            {heading}
                        </LocalizedLink>
                    ) : heading}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <IconButton
                        icon={mdChevronLeft}
                        label={previousEpisode ? `${t("page.storyPlayer.previousEpisode")}: ${previousEpisode.title || storyEpisodeLabel(previousEpisode, t)}` : t("page.storyPlayer.previousEpisode")}
                        variant="tonal"
                        disabled={!previousEpisode}
                        onClick={() => previousEpisode && choose(previousEpisode.selector)}
                    />
                    <IconButton
                        icon={mdChevronRight}
                        label={nextEpisode ? `${t("page.storyPlayer.nextEpisode")}: ${nextEpisode.title || storyEpisodeLabel(nextEpisode, t)}` : t("page.storyPlayer.nextEpisode")}
                        variant="tonal"
                        disabled={!nextEpisode}
                        onClick={() => nextEpisode && choose(nextEpisode.selector)}
                    />
                    <Select<SseWebRegion>
                        value={region}
                        onValueChange={changeRegion}
                        options={REGIONS.map(value => ({ value, label: t(SERVER_LABEL_KEYS[value]) }))}
                        aria-label={t("page.storyPlayer.server")}
                        disabled={!region}
                        className="w-48"
                    />
                    <Button variant="filled" icon={mdListAlt} onClick={openPicker} disabled={!region}>
                        {t("page.storyPlayer.chooseStory")}
                    </Button>
                </div>
            </Surface>

            {!region ? (
                <LoadingState />
            ) : !player.available ? (
                <Banner tone="warning" title={t("page.storyPlayer.unavailableTitle")}>
                    <p>{t("page.storyPlayer.unavailableDescription")}</p>
                </Banner>
            ) : (
                <div className="grid gap-4 @5xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
                    <div className="min-w-0">
                        <Surface tone="default" radius="xl" className="overflow-hidden">
                            <Live2DStage player={player} stageRef={stageRef} style={player.fullscreen ? undefined : { aspectRatio: player.ratio }}>
                                {/* Before the episode loads: what to do next, on a card over the dark stage. */}
                                {(phase === "idle" || (phase === "ready" && position.ended)) && (
                                    <div className="absolute inset-0 flex items-center justify-center p-4">
                                        <div className="flex max-w-md flex-col items-center gap-3 rounded-md3-lg bg-surface-container-high px-5 py-4 text-center text-on-surface shadow-elev-2">
                                            {phase === "ready" ? (
                                                <>
                                                    <p className="type-title-m">{t("page.story.live2d.ended")}</p>
                                                    <div className="flex flex-wrap justify-center gap-2">
                                                        <Button variant="tonal" icon={mdReplay} onClick={player.togglePlay}>{t("page.storyPlayer.replay")}</Button>
                                                        {nextEpisode && (
                                                            <Button variant="filled" icon={mdSkipNext} onClick={() => choose(nextEpisode.selector)}>
                                                                {t("page.storyPlayer.nextEpisode")}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </>
                                            ) : !selector ? (
                                                <>
                                                    <p className="type-title-m">{t("page.storyPlayer.emptyTitle")}</p>
                                                    <p className="hidden type-body-s text-on-surface-variant @min-[480px]:block">{t("page.storyPlayer.emptyHint")}</p>
                                                    <Button variant="filled" icon={mdListAlt} onClick={openPicker}>{t("page.storyPlayer.chooseStory")}</Button>
                                                </>
                                            ) : notInLibrary ? (
                                                <>
                                                    <p className="type-title-m">{t("page.storyPlayer.notInLibraryTitle")}</p>
                                                    <p className="hidden type-body-s text-on-surface-variant @min-[480px]:block">{t("page.storyPlayer.notInLibraryDescription")}</p>
                                                    <Button variant="tonal" icon={mdListAlt} onClick={openPicker}>{t("page.storyPlayer.chooseStory")}</Button>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="hidden type-body-s text-on-surface-variant @min-[480px]:block">{t("page.story.live2d.hint")}</p>
                                                    <Button variant="filled" icon={mdPlayArrowFill} onClick={() => void start({ play: true })}>
                                                        {t("page.story.live2d.start")}
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </Live2DStage>

                            {phase === "ready" && (
                                <div className="@container px-4 pb-2 pt-1">
                                    <Slider
                                        value={seekTo ?? Math.min(position.node, lastNode)}
                                        onValueChange={setSeekTo}
                                        onPointerUp={commitSeek}
                                        onKeyUp={commitSeek}
                                        onBlur={commitSeek}
                                        min={0}
                                        max={lastNode}
                                        showValue
                                        formatValue={value => t("page.story.live2d.position", { current: value + 1, total: position.nodes })}
                                        aria-label={t("page.storyPlayer.seek")}
                                        disabled={position.nodes === 0}
                                    />
                                    <div
                                        role="toolbar"
                                        aria-label={t("page.story.live2d.controls")}
                                        className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1"
                                    >
                                        <Live2DControls
                                            player={player}
                                            floating={false}
                                            extra={(
                                                <>
                                                    <IconButton icon={mdTune} label={t("page.story.live2d.settings.title")} onClick={() => setSettingsOpen(true)} />
                                                    <IconButton icon={mdFullscreen} label={t("page.story.live2d.fullscreen")} onClick={player.toggleFullscreen} />
                                                </>
                                            )}
                                        />
                                    </div>
                                </div>
                            )}
                            {phase === "loading" && (
                                <div className="flex min-h-14 items-center justify-end px-4 py-2">
                                    <Button variant="text" onClick={player.close}>{t("common.action.cancel")}</Button>
                                </div>
                            )}
                        </Surface>

                        {phase === "failed" && <Live2DFailureBanner player={player} className="mt-4" />}
                        {player.notes.length > 0 && (
                            <ul className="mt-3 space-y-1 px-2 type-body-s text-on-surface-variant">
                                {player.notes.map(line => <li key={line}>{line}</li>)}
                            </ul>
                        )}
                    </div>

                    {/* The script: as tall as the stage's column on a wide page, its own height on a narrow one. */}
                    <div className="relative h-[60vh] min-w-0 @5xl:h-auto @5xl:min-h-[24rem]">
                        <StoryScriptPanel
                            className="h-full @5xl:absolute @5xl:inset-0"
                            script={script}
                            activeRow={activeRow}
                            nodeOfRow={player.phase === "ready" ? rows.nodeOfRow : new Map()}
                            onSeek={player.seek}
                            follow={follow}
                            onFollowChange={setFollow}
                        />
                    </div>
                </div>
            )}
            </div>

            {region && <StoryPickerDialog
                isOpen={pickerOpen}
                region={region}
                onClose={() => setPickerOpen(false)}
                kind={pickerKind}
                onKindChange={setPickerKind}
                catalog={catalogs.get(pickerKind)}
                onRetry={() => catalogs.retry(pickerKind)}
                current={selector}
                onSelect={choose}
            />}
            <Live2DPlayerSettings
                isOpen={settingsOpen && phase === "ready"}
                onClose={() => setSettingsOpen(false)}
                settings={player.settings}
                onChange={player.changeSettings}
            />
        </PageContainer>
    );
}

export default function StoryPlayerClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <StoryPlayerContent />
            </Suspense>
        </MainLayout>
    );
}
