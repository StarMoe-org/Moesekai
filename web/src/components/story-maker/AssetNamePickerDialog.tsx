"use client";
import { useEffect, useMemo, useState } from "react";
import { Banner, Chip, Dialog, ErrorState, IconButton, LoadMore, LoadingState, TextField, cn } from "@/components/md3";
import { mdPlayArrowFill, mdSearch, mdStopFill } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetLine } from "@/lib/assets";
import {
    STORY_SE_PACKS,
    fetchStoryBgmCatalog,
    fetchStorySeCatalog,
    storyBgmUrl,
    storySeCandidateUrls,
    type StoryAssetKind,
    type StoryBgmCatalog,
    type StorySeItem,
    type StorySePack,
} from "@/lib/storyMaker/assets";
import type { StoryRegion } from "@/types/storyMaker";
import { previewStorySound } from "./useStoryAudio";

interface AssetNamePickerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    kind: StoryAssetKind;
    region: StoryRegion;
    line: AssetLine;
    current: string;
    onSelect: (name: string) => void;
}

type CatalogState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; kind: "bgm"; catalog: StoryBgmCatalog }
    | { status: "ready"; kind: "se"; items: StorySeItem[] };

const LOADING_STATE: CatalogState = { status: "loading" };
const PAGE_SIZE = 60;

type BgmFilter = "all" | "unlisted" | `cat:${number}`;
type SeFilter = "all" | StorySePack;

/**
 * Searchable picker dialog for game BGM (merged with `/soundtrack` catalog titles & categories)
 * and SE (all packs with deterministic `<pack>/<file>` names), with progressive LoadMore and
 * inline audio preview error feedback.
 */
export function AssetNamePickerDialog({ isOpen, onClose, kind, region, line, current, onSelect }: AssetNamePickerDialogProps) {
    const { t } = useI18n();
    const [query, setQuery] = useState("");
    const [bgmFilter, setBgmFilter] = useState<BgmFilter>("all");
    const [seFilter, setSeFilter] = useState<SeFilter>("all");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [attempt, setAttempt] = useState(0);
    const [playing, setPlaying] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const key = `${kind}|${region}|${line}|${attempt}`;
    const [loaded, setLoaded] = useState<{ key: string; state: CatalogState } | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const controller = new AbortController();
        if (kind === "bgm") {
            fetchStoryBgmCatalog(region, line, controller.signal).then(
                catalog => setLoaded({ key, state: { status: "ready", kind: "bgm", catalog } }),
                (error: unknown) => {
                    if (!controller.signal.aborted) {
                        setLoaded({ key, state: { status: "error", message: error instanceof Error ? error.message : String(error) } });
                    }
                },
            );
        } else {
            fetchStorySeCatalog(region, line, controller.signal).then(
                items => setLoaded({ key, state: { status: "ready", kind: "se", items } }),
                (error: unknown) => {
                    if (!controller.signal.aborted) {
                        setLoaded({ key, state: { status: "error", message: error instanceof Error ? error.message : String(error) } });
                    }
                },
            );
        }
        return () => controller.abort();
    }, [isOpen, kind, region, line, key]);

    useEffect(() => {
        if (!isOpen) previewStorySound(null);
        return () => previewStorySound(null);
    }, [isOpen]);

    const state: CatalogState = loaded?.key === key ? loaded.state : LOADING_STATE;
    const needle = query.trim().toLowerCase();

    const bgmSummary = useMemo(() => {
        if (state.status !== "ready" || state.kind !== "bgm") return null;
        const { categories, items } = state.catalog;
        const byCat = new Map<number, number>();
        let unlisted = 0;
        for (const item of items) {
            if (item.categoryId === null) unlisted += 1;
            else byCat.set(item.categoryId, (byCat.get(item.categoryId) ?? 0) + 1);
        }
        const activeCategories = categories.filter(cat => (byCat.get(cat.id) ?? 0) > 0);
        return { categories: activeCategories, byCat, unlisted, total: items.length };
    }, [state]);

    const filteredBgm = useMemo(() => {
        if (state.status !== "ready" || state.kind !== "bgm") return [];
        const byFilter = bgmFilter === "all"
            ? state.catalog.items
            : bgmFilter === "unlisted"
                ? state.catalog.items.filter(item => item.categoryId === null)
                : state.catalog.items.filter(item => `cat:${item.categoryId}` === bgmFilter);
        if (!needle) return byFilter;
        return byFilter.filter(item => (
            item.name.toLowerCase().includes(needle)
            || item.title.toLowerCase().includes(needle)
            || (item.pronunciation?.toLowerCase().includes(needle) ?? false)
            || item.categoryName.toLowerCase().includes(needle)
        ));
    }, [state, bgmFilter, needle]);

    const sePackCounts = useMemo(() => {
        if (state.status !== "ready" || state.kind !== "se") return null;
        const counts: Record<StorySePack, number> = { se_pack00001_b: 0, se_pack00001: 0 };
        for (const item of state.items) counts[item.pack] += 1;
        return { ...counts, total: state.items.length };
    }, [state]);

    const filteredSe = useMemo(() => {
        if (state.status !== "ready" || state.kind !== "se") return [];
        const byFilter = seFilter === "all"
            ? state.items
            : state.items.filter(item => item.pack === seFilter);
        if (!needle) return byFilter;
        return byFilter.filter(item => (
            item.label.toLowerCase().includes(needle)
            || item.name.toLowerCase().includes(needle)
        ));
    }, [state, seFilter, needle]);

    const totalMatches = kind === "bgm" ? filteredBgm.length : filteredSe.length;
    const shownBgm = kind === "bgm" ? filteredBgm.slice(0, visibleCount) : [];
    const shownSe = kind === "se" ? filteredSe.slice(0, visibleCount) : [];
    const shownCount = kind === "bgm" ? shownBgm.length : shownSe.length;

    const togglePreview = (name: string) => {
        setPreviewError(null);
        if (playing === name) {
            previewStorySound(null);
            setPlaying(null);
            return;
        }
        const source = kind === "bgm"
            ? storyBgmUrl(name, region, line)
            : storySeCandidateUrls(name, region, line);
        setPlaying(name);
        previewStorySound(source, {
            onEnd: () => setPlaying(curr => (curr === name ? null : curr)),
            onError: () => {
                setPlaying(curr => (curr === name ? null : curr));
                setPreviewError(name);
            },
        });
    };

    const handleClose = () => {
        previewStorySound(null);
        setPlaying(null);
        setPreviewError(null);
        onClose();
    };

    const handlePick = (name: string) => {
        previewStorySound(null);
        setPlaying(null);
        setPreviewError(null);
        onSelect(name);
        onClose();
    };

    const sePackLabel = (pack: StorySePack) => t(
        pack === "se_pack00001_b" ? "page.storyMaker.inspector.sePackB" : "page.storyMaker.inspector.sePackA",
    );

    return (
        <Dialog
            isOpen={isOpen}
            onClose={handleClose}
            title={t(kind === "bgm" ? "page.storyMaker.inspector.pickBgm" : "page.storyMaker.inspector.pickSe")}
            size="md"
            fullscreenOnMobile
        >
            <div className="min-w-0 space-y-3">
                <TextField
                    value={query}
                    onValueChange={(next) => {
                        setQuery(next);
                        setVisibleCount(PAGE_SIZE);
                    }}
                    placeholder={t("page.storyMaker.inspector.assetSearchPlaceholder")}
                    icon={mdSearch}
                    clearable
                    aria-label={t("page.storyMaker.inspector.assetSearchPlaceholder")}
                />

                {kind === "bgm" && bgmSummary && (bgmSummary.categories.length > 0 || bgmSummary.unlisted > 0) && (
                    <div
                        className="scrollbar-hide flex min-w-0 gap-1.5 overflow-x-auto pb-1"
                        role="group"
                        aria-label={t("page.storyMaker.inspector.pickBgm")}
                    >
                        <Chip
                            variant="filter"
                            selected={bgmFilter === "all"}
                            showCheckmark={false}
                            className="shrink-0"
                            onClick={() => {
                                setBgmFilter("all");
                                setVisibleCount(PAGE_SIZE);
                            }}
                        >
                            {t("page.storyMaker.inspector.filterAll")}
                            <span className="ml-1 type-label-s opacity-70">{bgmSummary.total}</span>
                        </Chip>
                        {bgmSummary.categories.map(cat => {
                            const filterKey: BgmFilter = `cat:${cat.id}`;
                            return (
                                <Chip
                                    key={cat.id}
                                    variant="filter"
                                    selected={bgmFilter === filterKey}
                                    showCheckmark={false}
                                    className="shrink-0"
                                    onClick={() => {
                                        setBgmFilter(filterKey);
                                        setVisibleCount(PAGE_SIZE);
                                    }}
                                >
                                    {cat.name}
                                    <span className="ml-1 type-label-s opacity-70">{bgmSummary.byCat.get(cat.id) ?? 0}</span>
                                </Chip>
                            );
                        })}
                        {bgmSummary.unlisted > 0 && (
                            <Chip
                                variant="filter"
                                selected={bgmFilter === "unlisted"}
                                showCheckmark={false}
                                className="shrink-0"
                                onClick={() => {
                                    setBgmFilter("unlisted");
                                    setVisibleCount(PAGE_SIZE);
                                }}
                            >
                                {t("page.storyMaker.inspector.bgmUnlisted")}
                                <span className="ml-1 type-label-s opacity-70">{bgmSummary.unlisted}</span>
                            </Chip>
                        )}
                    </div>
                )}

                {kind === "se" && sePackCounts && (
                    <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label={t("page.storyMaker.inspector.pickSe")}>
                        <Chip
                            variant="filter"
                            selected={seFilter === "all"}
                            showCheckmark={false}
                            onClick={() => {
                                setSeFilter("all");
                                setVisibleCount(PAGE_SIZE);
                            }}
                        >
                            {t("page.storyMaker.inspector.filterAll")}
                            <span className="ml-1 type-label-s opacity-70">{sePackCounts.total}</span>
                        </Chip>
                        {STORY_SE_PACKS.map(pack => (
                            <Chip
                                key={pack}
                                variant="filter"
                                selected={seFilter === pack}
                                showCheckmark={false}
                                onClick={() => {
                                    setSeFilter(pack);
                                    setVisibleCount(PAGE_SIZE);
                                }}
                            >
                                {sePackLabel(pack)}
                                <span className="ml-1 type-label-s opacity-70">{sePackCounts[pack]}</span>
                            </Chip>
                        ))}
                    </div>
                )}

                {previewError && (
                    <Banner tone="error">
                        <span className="break-words">
                            {t("page.storyMaker.inspector.audioPreviewFailed")}
                            <span className="ml-1.5 font-mono type-label-s opacity-80">({previewError})</span>
                        </span>
                    </Banner>
                )}

                {state.status === "ready" && (
                    <p className="font-mono type-label-s text-on-surface-variant">
                        {t("page.storyMaker.inspector.assetCount", { shown: shownCount, total: totalMatches })}
                    </p>
                )}

                {state.status === "loading" ? (
                    <LoadingState className="min-h-40" />
                ) : state.status === "error" ? (
                    <ErrorState
                        title={t("page.storyMaker.inspector.assetListFailed")}
                        message={state.message}
                        retryLabel={t("common.action.retry")}
                        onRetry={() => setAttempt(value => value + 1)}
                    />
                ) : totalMatches === 0 ? (
                    <p className="py-8 text-center type-body-m text-on-surface-variant">
                        {t("page.storyMaker.inspector.assetNoMatches")}
                    </p>
                ) : (
                    <>
                        <ul className="divide-y divide-outline-variant/60">
                            {kind === "bgm" ? shownBgm.map(item => {
                                const selected = item.name === current;
                                const isPlaying = playing === item.name;
                                const badgeText = item.categoryName || t("page.storyMaker.inspector.bgmUnlisted");
                                return (
                                    <li key={item.name} className="flex min-w-0 items-center gap-2 py-1">
                                        <button
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => handlePick(item.name)}
                                            className={cn(
                                                "state-layer focus-ring flex min-w-0 flex-1 flex-col gap-0.5 rounded-md3-sm px-3 py-2 text-left",
                                                selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                            )}
                                        >
                                            <span className="block w-full truncate type-body-m">
                                                {item.title || item.name}
                                            </span>
                                            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 type-label-s text-on-surface-variant">
                                                <span className="min-w-0 truncate font-mono">{item.name}</span>
                                                <span className="shrink-0 rounded-md3-xs bg-surface-container-high px-1.5 py-0.5">
                                                    {badgeText}
                                                </span>
                                                {item.mysekai && (
                                                    <span className="shrink-0 rounded-md3-xs bg-primary-container px-1.5 py-0.5 text-on-primary-container">
                                                        {t("page.storyMaker.inspector.bgmMysekaiBadge")}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                        <IconButton
                                            size="xs"
                                            icon={isPlaying ? mdStopFill : mdPlayArrowFill}
                                            label={t(isPlaying ? "page.storyMaker.inspector.stopPreview" : "page.storyMaker.inspector.previewAudio")}
                                            onClick={() => togglePreview(item.name)}
                                        />
                                    </li>
                                );
                            }) : shownSe.map(item => {
                                const selected = item.name === current || item.label === current;
                                const isPlaying = playing === item.name;
                                return (
                                    <li key={item.name} className="flex min-w-0 items-center gap-2 py-1">
                                        <button
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => handlePick(item.name)}
                                            className={cn(
                                                "state-layer focus-ring flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md3-sm px-3 py-2 text-left",
                                                selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                            )}
                                        >
                                            <span className="min-w-0 truncate font-mono type-body-m">{item.label}</span>
                                            <span className="shrink-0 rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 font-mono type-label-s text-on-surface-variant">
                                                {item.pack}
                                            </span>
                                        </button>
                                        <IconButton
                                            size="xs"
                                            icon={isPlaying ? mdStopFill : mdPlayArrowFill}
                                            label={t(isPlaying ? "page.storyMaker.inspector.stopPreview" : "page.storyMaker.inspector.previewAudio")}
                                            onClick={() => togglePreview(item.name)}
                                        />
                                    </li>
                                );
                            })}
                        </ul>

                        {shownCount < totalMatches && (
                            <LoadMore
                                label={t("page.storyMaker.inspector.loadMoreAssets")}
                                shown={shownCount}
                                total={totalMatches}
                                onLoadMore={() => setVisibleCount(count => count + PAGE_SIZE)}
                                className="mt-2"
                            />
                        )}
                    </>
                )}
            </div>
        </Dialog>
    );
}
