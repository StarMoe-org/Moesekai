"use client";
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { Button, LoadingState, PageContainer, PageHeader, Select } from "@/components/md3";
import { Live2DInspector } from "@/components/live2d/Live2DInspector";
import { Live2DModelStage } from "@/components/live2d/Live2DModelStage";
import { live2dCostumeLabel, live2dOwnerName } from "@/components/live2d/labels";
import { useLive2DViewer } from "@/components/live2d/useLive2DViewer";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { getBackgroundImageUrl, getCharacterIconUrl } from "@/lib/assets";
import { fetchLive2DModels } from "@/lib/live2dViewer/client";
import { LIVE2D_REGIONS, isLive2DRegion, live2dSources, type Live2DRegion } from "@/lib/live2dViewer/config";
import { live2dViewerHref, parseLive2DCharacterParam, parseLive2DModelParam, type Live2DModel } from "@/lib/live2dViewer/models";
import type { AssetSourceType } from "@/contexts/ThemeContext";

const subscribeNever = () => () => {};

type ListState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; models: Live2DModel[] };

/** A server's model list, read again when the server changes or a retry asks for it. */
function useModelList(region: Live2DRegion | null) {
    const [result, setResult] = useState<{ key: string; state: ListState } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const key = region ? `${region}|${attempt}` : null;
    useEffect(() => {
        if (!region || !key) return;
        const controller = new AbortController();
        fetchLive2DModels(region, controller.signal).then(
            models => setResult({ key, state: { status: "ready", models } }),
            (error: unknown) => {
                if (!controller.signal.aborted) setResult({ key, state: { status: "error", message: error instanceof Error ? error.message : String(error) } });
            },
        );
        return () => controller.abort();
    }, [region, key]);
    const retry = useCallback(() => setAttempt(value => value + 1), []);
    return { state: result?.key === key ? result.state : { status: "loading" } as ListState, retry };
}

/**
 * The Live2D model viewer: a server's models (those its story library holds), one shown on the
 * stage with the game's own motions, facials, blinking, breath and physics, and a panel beside it
 * to choose the model, its motion and facial, and the scene. The address names the server and the
 * model (`?server=jp&model=v2_01ichika_casual`), so a link opens the same one; without one the
 * first model is shown.
 */
function Live2DViewerContent() {
    const { t } = useI18n();
    const params = useSearchParams();
    const { serverSource, assetSource, hasHydratedThemeSettings } = useTheme();
    const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

    // What the reader chose here; the address, then the site's server, before that.
    const [chosen, setChosen] = useState<{ region?: Live2DRegion; model?: string | null }>({});
    const paramRegion = params.get("server");
    const themeRegion = hydrated && hasHydratedThemeSettings ? (isLive2DRegion(serverSource) ? serverSource : "jp") : null;
    const region = chosen.region ?? (isLive2DRegion(paramRegion) ? paramRegion : null) ?? themeRegion;
    const modelId = chosen.model !== undefined ? chosen.model : parseLive2DModelParam(params.get("model"));
    // A link from a character's page (`?character=<id>`) shows that character's first model.
    const [linkedCharacter] = useState(() => parseLive2DCharacterParam(params.get("character")));

    const list = useModelList(region);
    const models = useMemo(() => (list.state.status === "ready" ? list.state.models : []), [list.state]);
    // Without a model named: the linked character's first, else the first character's.
    const shownId = modelId
        ?? (linkedCharacter ? models.find(model => model.characterId === linkedCharacter)?.id : undefined)
        ?? models.find(model => model.kind === "character")?.id
        ?? null;
    const current = useMemo(() => models.find(model => model.id === shownId) ?? null, [models, shownId]);

    // The address follows what is shown, so it can be shared.
    const listLoading = list.state.status === "loading";
    useEffect(() => {
        // (until the list is in, the model shown is not known)
        if (!region || listLoading) return;
        const url = new URL(window.location.href);
        const target = new URL(live2dViewerHref(region, shownId, linkedCharacter), url.origin);
        if (url.search === target.search) return;
        url.search = target.search;
        window.history.replaceState({}, "", url.toString());
    }, [region, shownId, linkedCharacter, listLoading]);

    // The viewer.
    const library = region ? live2dSources(region).library : "";
    const { hostRef, phase, state, view, setView, act, clipError, retry } = useLive2DViewer({ library, model: current });
    const [loop, setLoop] = useState(false);
    const [background, setBackground] = useState<string | null>(null);
    const line = assetSource.startsWith("overseas") ? "overseas" : "main";
    const backgroundUrl = background && region ? getBackgroundImageUrl(background, `${line}-${region}` as AssetSourceType) : null;
    const ready = phase.kind === "ready" ? state : null;

    const select = (model: Live2DModel) => setChosen(previous => ({ ...previous, region: region ?? undefined, model: model.id }));
    const changeRegion = (next: Live2DRegion) => {
        if (next === region) return;
        setBackground(null);
        setChosen({ region: next, model: shownId });
    };

    const emptyMessage = list.state.status === "loading" ? (
        <LoadingState className="min-h-0" label={t("page.live2d.listLoading")} />
    ) : list.state.status === "error" ? (
        <div className="flex flex-col items-center gap-3 rounded-md3-lg bg-surface-container-high px-5 py-4 text-on-surface shadow-elev-2">
            <p className="type-title-m">{t("page.live2d.listFailed")}</p>
            <p className="max-w-sm break-all font-mono type-label-s text-on-surface-variant">{list.state.message}</p>
            <Button variant="tonal" onClick={list.retry}>{t("common.action.retry")}</Button>
        </div>
    ) : (
        <div className="flex max-w-md flex-col items-center gap-2 rounded-md3-lg bg-surface-container-high px-5 py-4 text-on-surface shadow-elev-2">
            <p className="type-title-m">{t(models.length === 0 ? "page.live2d.listEmpty" : "page.live2d.modelMissing")}</p>
            <p className="type-body-s text-on-surface-variant">{t(models.length === 0 ? "page.live2d.listEmptyDescription" : "page.live2d.modelMissingDescription")}</p>
        </div>
    );

    const caption = current && (
        <div className="glass flex min-w-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-4">
            {current.kind === "character" && current.characterId !== null ? (
                <img src={getCharacterIconUrl(current.characterId)} alt="" className="size-9 shrink-0 rounded-full bg-surface-container-highest object-cover" />
            ) : (
                <span aria-hidden className="size-2 shrink-0" />
            )}
            <div className="min-w-0">
                <p className="truncate type-title-s text-on-surface">{live2dOwnerName(t, current)}</p>
                <p className="truncate type-label-m text-on-surface-variant">
                    {live2dCostumeLabel(t, current)}
                    {current.generation === 2 && " · v2"}
                </p>
            </div>
        </div>
    );

    return (
        <PageContainer wide>
            <PageHeader
                title={t("page.live2d.title")}
                description={<span className="hidden sm:inline">{t("page.live2d.description")}</span>}
                className="mb-3 sm:mb-4"
                actions={region && (
                    <Select<Live2DRegion>
                        value={region}
                        onValueChange={changeRegion}
                        options={LIVE2D_REGIONS.map(value => ({ value, label: t(SERVER_LABEL_KEYS[value]) }))}
                        aria-label={t("page.live2d.server")}
                        className="w-44"
                    />
                )}
            />

            {!region ? (
                <LoadingState />
            ) : (
                <div className="@container">
                    <div className="grid gap-3 @4xl:h-[clamp(36rem,calc(100svh-13rem),64rem)] @4xl:grid-cols-[minmax(0,1fr)_24rem]">
                        <Live2DModelStage
                            phase={phase}
                            hostRef={hostRef}
                            view={view}
                            setView={setView}
                            background={backgroundUrl}
                            onRetry={retry}
                            empty={emptyMessage}
                            caption={caption}
                            paused={ready?.paused ?? false}
                            onTogglePause={() => void act(viewer => (viewer.paused ? viewer.play() : viewer.pause()))}
                            onReset={() => void act(viewer => Promise.all([
                                viewer.defaultMotion ? viewer.playMotion(viewer.defaultMotion, { loop }) : false,
                                viewer.defaultFacial ? viewer.setFacial(viewer.defaultFacial) : false,
                            ]))}
                            className="h-[min(60svh,36rem)] min-h-80 @4xl:h-full"
                        />
                        <Live2DInspector
                            region={region}
                            line={line}
                            models={models}
                            listStatus={list.state.status}
                            onRetryList={list.retry}
                            current={current}
                            onSelect={select}
                            state={ready}
                            act={act}
                            clipError={clipError}
                            loop={loop}
                            onLoopChange={setLoop}
                            background={background}
                            onBackgroundChange={setBackground}
                            className="@4xl:h-full"
                        />
                    </div>
                    <div className="mt-2 flex flex-col gap-1 px-1 type-label-s text-on-surface-variant sm:flex-row sm:justify-between sm:gap-4">
                        <p>{t("page.live2d.notice")}</p>
                        <p className="shrink-0">{t("page.live2d.credit")}</p>
                    </div>
                </div>
            )}
        </PageContainer>
    );
}

export default function Live2DViewerClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <Live2DViewerContent />
            </Suspense>
        </MainLayout>
    );
}
