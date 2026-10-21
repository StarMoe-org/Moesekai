"use client";
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterButton, FilterSection, FilterToggle } from "@/components/common/BaseFilters";
import CharacterFilter from "@/components/common/CharacterFilter";
import { Button, LoadingState, PageContainer, PageHeader, Select } from "@/components/md3";
import { mdFilterList } from "@/components/md3/icons";
import { BackgroundPickerDialog } from "@/components/live2d/BackgroundPickerDialog";
import { live2dCostumeLabel, live2dOwnerName } from "@/components/live2d/labels";
import { Live2DModelPanel } from "@/components/live2d/Live2DModelPanel";
import { Live2DModelStage } from "@/components/live2d/Live2DModelStage";
import { useLive2DViewer } from "@/components/live2d/useLive2DViewer";
import { useI18n } from "@/contexts/I18nContext";
import { useQuickFilter, useQuickFilterContext } from "@/contexts/QuickFilterContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { getBackgroundImageUrl } from "@/lib/assets";
import { fetchLive2DModels } from "@/lib/live2dViewer/client";
import { LIVE2D_REGIONS, isLive2DRegion, live2dSources, type Live2DRegion } from "@/lib/live2dViewer/config";
import { live2dViewerHref, parseLive2DCharacterParam, parseLive2DModelParam, type Live2DModel } from "@/lib/live2dViewer/models";
import type { Live2DModelKind } from "@/types/live2d";
import { UNIT_DATA } from "@/types/types";
import type { AssetSourceType } from "@/contexts/ThemeContext";

const subscribeNever = () => () => {};
const KINDS: readonly Live2DModelKind[] = ["character", "sub", "mob"];

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
 * stage with the game's own motions, facials, blinking, breath and physics. The filters narrow
 * the list beside the stage; the address names the server and the model
 * (`?server=jp&model=v2_01ichika_casual`), so a link opens the same one.
 */
function Live2DViewerContent() {
    const { t } = useI18n();
    const params = useSearchParams();
    const { serverSource, assetSource, hasHydratedThemeSettings } = useTheme();
    const { open: openFilters } = useQuickFilterContext();
    const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

    // What the reader chose here; the address, then the site's server, before that.
    const [chosen, setChosen] = useState<{ region?: Live2DRegion; model?: string | null }>({});
    const paramRegion = params.get("server");
    const themeRegion = hydrated && hasHydratedThemeSettings ? (isLive2DRegion(serverSource) ? serverSource : "jp") : null;
    const region = chosen.region ?? (isLive2DRegion(paramRegion) ? paramRegion : null) ?? themeRegion;
    const modelId = chosen.model !== undefined ? chosen.model : parseLive2DModelParam(params.get("model"));
    // A link from a character's page (`?character=<id>`) lists that character's models and shows the first.
    const [linkedCharacter] = useState(() => parseLive2DCharacterParam(params.get("character")));

    const list = useModelList(region);
    const models = useMemo(() => (list.state.status === "ready" ? list.state.models : []), [list.state]);
    // Without a model named, a link from a character's page shows that character's first model.
    const shownId = modelId ?? (linkedCharacter ? models.find(model => model.characterId === linkedCharacter)?.id ?? null : null);
    const current = useMemo(() => models.find(model => model.id === shownId) ?? null, [models, shownId]);

    // The address follows what is shown, so it can be shared.
    const listLoading = list.state.status === "loading";
    useEffect(() => {
        // (until the list is in, the model a character's link stands for is not known)
        if (!region || listLoading) return;
        const url = new URL(window.location.href);
        const target = new URL(live2dViewerHref(region, shownId, linkedCharacter), url.origin);
        if (url.search === target.search) return;
        url.search = target.search;
        window.history.replaceState({}, "", url.toString());
    }, [region, shownId, linkedCharacter, listLoading]);

    // Filters of the list beside the stage.
    const [search, setSearch] = useState("");
    const [kinds, setKinds] = useState<Live2DModelKind[]>([]);
    const [characters, setCharacters] = useState<number[]>(() => (linkedCharacter ? [linkedCharacter] : []));
    const [unitIds, setUnitIds] = useState<string[]>([]);
    const [newOnly, setNewOnly] = useState(false);
    const unitCharacters = useMemo(() => new Set(UNIT_DATA.filter(unit => unitIds.includes(unit.id)).flatMap(unit => unit.charIds)), [unitIds]);
    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return models.filter(model => {
            if (kinds.length > 0 && !kinds.includes(model.kind)) return false;
            if (characters.length > 0 || unitIds.length > 0) {
                if (model.characterId === null) return false;
                if (characters.length > 0 && !characters.includes(model.characterId)) return false;
                if (unitIds.length > 0 && !unitCharacters.has(model.characterId)) return false;
            }
            if (newOnly && model.generation !== 2) return false;
            if (!needle) return true;
            return [model.id, live2dOwnerName(t, model), live2dCostumeLabel(t, model)].join(" ").toLowerCase().includes(needle);
        });
    }, [models, kinds, characters, unitIds, unitCharacters, newOnly, search, t]);
    const hasActiveFilters = Boolean(search) || kinds.length > 0 || characters.length > 0 || unitIds.length > 0 || newOnly;
    const resetFilters = () => {
        setSearch("");
        setKinds([]);
        setCharacters([]);
        setUnitIds([]);
        setNewOnly(false);
    };

    useQuickFilter(t("page.live2d.filterTitle"), (
        <BaseFilters
            title={t("page.live2d.filterTitle")}
            filteredCount={filtered.length}
            totalCount={models.length}
            searchQuery={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("page.live2d.searchPlaceholder")}
            hasActiveFilters={hasActiveFilters}
            onReset={resetFilters}
        >
            <FilterSection label={t("page.live2d.kindTitle")}>
                <div className="flex flex-wrap gap-2">
                    <FilterButton selected={kinds.length === 0} onClick={() => setKinds([])}>{t("common.filter.all")}</FilterButton>
                    {KINDS.map(kind => (
                        <FilterButton
                            key={kind}
                            selected={kinds.includes(kind)}
                            onClick={() => setKinds(previous => (previous.includes(kind) ? previous.filter(item => item !== kind) : [...previous, kind]))}
                        >
                            {t(`page.live2d.kind.${kind}`)}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>
            <CharacterFilter
                selectedCharacters={characters}
                onCharacterChange={setCharacters}
                selectedUnitIds={unitIds}
                onUnitIdsChange={setUnitIds}
            />
            <FilterToggle selected={newOnly} onClick={() => setNewOnly(value => !value)} label={t("page.live2d.newOnly")} />
        </BaseFilters>
    ), [filtered.length, models.length, search, kinds, characters, unitIds, newOnly, hasActiveFilters, t]);

    // The viewer.
    const library = region ? live2dSources(region).library : "";
    const { hostRef, phase, state, view, setView, act, clipError, retry } = useLive2DViewer({ library, model: current });
    const [loop, setLoop] = useState(false);
    const [background, setBackground] = useState<string | null>(null);
    const [backgroundsOpen, setBackgroundsOpen] = useState(false);
    const line = assetSource.startsWith("overseas") ? "overseas" : "main";
    const backgroundUrl = background && region ? getBackgroundImageUrl(background, `${line}-${region}` as AssetSourceType) : null;

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
            <p className="type-title-m">{t(models.length === 0 ? "page.live2d.listEmpty" : shownId ? "page.live2d.modelMissing" : "page.live2d.emptyTitle")}</p>
            <p className="type-body-s text-on-surface-variant">{t(models.length === 0 ? "page.live2d.listEmptyDescription" : "page.live2d.emptyDescription")}</p>
        </div>
    );

    return (
        <PageContainer wide>
            <PageHeader
                title={t("page.live2d.title")}
                description={t("page.live2d.description")}
                actions={region && (
                    <>
                        <Select<Live2DRegion>
                            value={region}
                            onValueChange={changeRegion}
                            options={LIVE2D_REGIONS.map(value => ({ value, label: t(SERVER_LABEL_KEYS[value]) }))}
                            aria-label={t("page.live2d.server")}
                            className="w-48"
                        />
                        <Button variant="tonal" icon={mdFilterList} onClick={openFilters}>{t("page.live2d.filterTitle")}</Button>
                    </>
                )}
            />

            {!region ? (
                <LoadingState />
            ) : (
                <div className="@container">
                    <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_22rem] @4xl:items-start">
                        <div className="min-w-0 space-y-2">
                            <Live2DModelStage
                                phase={phase}
                                hostRef={hostRef}
                                view={view}
                                setView={setView}
                                background={backgroundUrl}
                                onRetry={retry}
                                empty={emptyMessage}
                            />
                            <p className="px-1 type-body-s text-on-surface-variant">{t("page.live2d.notice")}</p>
                            <p className="px-1 text-right type-label-s text-on-surface-variant">{t("page.live2d.credit")}</p>
                        </div>
                        <Live2DModelPanel
                            models={filtered}
                            total={models.length}
                            listStatus={list.state.status}
                            onRetryList={list.retry}
                            current={current}
                            onSelect={select}
                            state={phase.kind === "ready" ? state : null}
                            act={act}
                            clipError={clipError}
                            loop={loop}
                            onLoopChange={setLoop}
                            background={background}
                            onChooseBackground={() => setBackgroundsOpen(true)}
                            onClearBackground={() => setBackground(null)}
                        />
                    </div>
                </div>
            )}

            {region && (
                <BackgroundPickerDialog
                    key={`${region}|${line}`}
                    isOpen={backgroundsOpen}
                    onClose={() => setBackgroundsOpen(false)}
                    region={region}
                    line={line}
                    current={background}
                    onSelect={setBackground}
                />
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
