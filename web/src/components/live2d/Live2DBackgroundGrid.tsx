"use client";
import { useEffect, useMemo, useState } from "react";
import { Chip, ErrorState, Icon, LoadMore, LoadingState, TextField, cn } from "@/components/md3";
import { mdBlock, mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { getBackgroundImageUrl, type AssetLine } from "@/lib/assets";
import { fetchStoryBackgrounds, isStoryCgBackground } from "@/lib/live2dViewer/client";
import type { Live2DRegion } from "@/lib/live2dViewer/config";

export type Live2DBackgroundCategory = "all" | "scene" | "cg";

interface Live2DBackgroundGridProps {
    region: Live2DRegion;
    /** The asset line the reader chose. */
    line: AssetLine;
    /** The background shown, or null for none. */
    current: string | null;
    onSelect: (name: string | null) => void;
    /** Initial category filter (`all` by default so `/live2d` keeps its existing view). */
    defaultCategory?: Live2DBackgroundCategory;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; names: string[] };

const PAGE_SIZE = 60;

/**
 * The story backgrounds of a server, as thumbnails, to stand the model on (the first is none).
 * The parent gives each server and asset line a grid of its own.
 */
export function Live2DBackgroundGrid({
    region, line, current, onSelect, defaultCategory = "all",
}: Live2DBackgroundGridProps) {
    const { t } = useI18n();
    const [list, setList] = useState<ListState>({ status: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<Live2DBackgroundCategory>(defaultCategory);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const source = `${line}-${region}` as AssetSourceType;

    useEffect(() => {
        const controller = new AbortController();
        fetchStoryBackgrounds(region, line, controller.signal).then(
            names => setList({ status: "ready", names }),
            (error: unknown) => {
                if (!controller.signal.aborted) setList({ status: "error", message: error instanceof Error ? error.message : String(error) });
            },
        );
        return () => controller.abort();
    }, [region, line, attempt]);

    const retry = () => {
        setList({ status: "loading" });
        setAttempt(previous => previous + 1);
    };

    const counts = useMemo(() => {
        if (list.status !== "ready") return null;
        let cg = 0;
        for (const name of list.names) {
            if (isStoryCgBackground(name)) cg += 1;
        }
        return { all: list.names.length, scene: list.names.length - cg, cg };
    }, [list]);

    const needle = query.trim().toLowerCase();
    const shown = useMemo(() => {
        const names = list.status === "ready" ? list.names : [];
        const byCategory = category === "all"
            ? names
            : category === "cg"
                ? names.filter(isStoryCgBackground)
                : names.filter(name => !isStoryCgBackground(name));
        return needle ? byCategory.filter(name => name.toLowerCase().includes(needle)) : byCategory;
    }, [list, category, needle]);

    const visible = shown.slice(0, visibleCount);

    if (list.status === "error") {
        return <ErrorState title={t("page.live2d.backgroundsFailed")} message={list.message} retryLabel={t("common.action.retry")} onRetry={retry} />;
    }

    const categories: readonly { value: Live2DBackgroundCategory; labelKey: string; count?: number }[] = [
        { value: "all", labelKey: "page.storyMaker.inspector.bgCategoryAll", count: counts?.all },
        { value: "scene", labelKey: "page.storyMaker.inspector.bgCategoryScene", count: counts?.scene },
        { value: "cg", labelKey: "page.storyMaker.inspector.bgCategoryCg", count: counts?.cg },
    ];

    return (
        <div className="min-w-0 space-y-3">
            <TextField
                value={query}
                onValueChange={(next) => {
                    setQuery(next);
                    setVisibleCount(PAGE_SIZE);
                }}
                placeholder={t("page.live2d.backgroundSearch")}
                icon={mdSearch}
                clearable
                aria-label={t("page.live2d.backgroundSearch")}
            />
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label={t("page.storyMaker.inspector.backgroundImage")}>
                    {categories.map(item => (
                        <Chip
                            key={item.value}
                            variant="filter"
                            selected={category === item.value}
                            showCheckmark={false}
                            onClick={() => {
                                setCategory(item.value);
                                setVisibleCount(PAGE_SIZE);
                            }}
                        >
                            {t(item.labelKey)}
                            {item.count !== undefined && (
                                <span className="ml-1 type-label-s opacity-70">{item.count}</span>
                            )}
                        </Chip>
                    ))}
                </div>
                {list.status === "ready" && (
                    <span className="shrink-0 font-mono type-label-s text-on-surface-variant">
                        {t("page.storyMaker.inspector.assetCount", { shown: visible.length, total: shown.length })}
                    </span>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2">
                {!needle && (
                    <button
                        type="button"
                        aria-pressed={current === null}
                        onClick={() => onSelect(null)}
                        className={cn(
                            "state-layer focus-ring flex min-w-0 flex-col overflow-hidden rounded-md3-md border-2 bg-surface-container-high text-on-surface-variant",
                            current === null ? "border-primary" : "border-transparent",
                        )}
                    >
                        <span className="flex aspect-video w-full flex-col items-center justify-center gap-1">
                            <Icon path={mdBlock} size={20} />
                            <span className="type-label-m">{t("page.live2d.noBackground")}</span>
                        </span>
                    </button>
                )}
                {visible.map(name => (
                    <button
                        key={name}
                        type="button"
                        title={name}
                        aria-label={name}
                        aria-pressed={name === current}
                        onClick={() => onSelect(name)}
                        className={cn(
                            "state-layer focus-ring flex min-w-0 flex-col overflow-hidden rounded-md3-md border-2 bg-surface-container text-left",
                            name === current ? "border-primary" : "border-transparent",
                        )}
                    >
                        <img
                            src={getBackgroundImageUrl(name, source)}
                            alt=""
                            loading="lazy"
                            className="aspect-video w-full bg-surface-container-highest object-cover"
                        />
                        <span className="block w-full truncate px-1.5 py-1 font-mono type-label-s text-on-surface-variant">
                            {name}
                        </span>
                    </button>
                ))}
            </div>
            {list.status === "loading" && <LoadingState className="min-h-24" />}
            {list.status === "ready" && shown.length === 0 && (
                <p className="type-body-s text-on-surface-variant">{t("page.live2d.backgroundNoMatches")}</p>
            )}
            {list.status === "ready" && visible.length < shown.length && (
                <LoadMore
                    label={t("page.storyMaker.inspector.loadMoreAssets")}
                    shown={visible.length}
                    total={shown.length}
                    onLoadMore={() => setVisibleCount(count => count + PAGE_SIZE)}
                    className="mt-2"
                />
            )}
        </div>
    );
}
