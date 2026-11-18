"use client";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, Icon, LoadingState, TextField, cn } from "@/components/md3";
import { mdBlock, mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { getBackgroundImageUrl, type AssetLine } from "@/lib/assets";
import { fetchStoryBackgrounds } from "@/lib/live2dViewer/client";
import type { Live2DRegion } from "@/lib/live2dViewer/config";

interface Live2DBackgroundGridProps {
    region: Live2DRegion;
    /** The asset line the reader chose. */
    line: AssetLine;
    /** The background shown, or null for none. */
    current: string | null;
    onSelect: (name: string | null) => void;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; names: string[] };

/**
 * The story backgrounds of a server, as thumbnails, to stand the model on (the first is none).
 * The parent gives each server and asset line a grid of its own.
 */
export function Live2DBackgroundGrid({ region, line, current, onSelect }: Live2DBackgroundGridProps) {
    const { t } = useI18n();
    const [list, setList] = useState<ListState>({ status: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [query, setQuery] = useState("");
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

    const needle = query.trim().toLowerCase();
    const shown = useMemo(() => {
        const names = list.status === "ready" ? list.names : [];
        return needle ? names.filter(name => name.toLowerCase().includes(needle)) : names;
    }, [list, needle]);

    if (list.status === "error") {
        return <ErrorState title={t("page.live2d.backgroundsFailed")} message={list.message} retryLabel={t("common.action.retry")} onRetry={retry} />;
    }

    return (
        <div className="space-y-3">
            <TextField
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={t("page.live2d.backgroundSearch")}
                icon={mdSearch}
                aria-label={t("page.live2d.backgroundSearch")}
            />
            <div className="grid grid-cols-2 gap-2">
                {!needle && (
                    <button
                        type="button"
                        aria-pressed={current === null}
                        onClick={() => onSelect(null)}
                        className={cn(
                            "state-layer focus-ring flex aspect-video flex-col items-center justify-center gap-1 rounded-md3-md border-2 bg-surface-container-high text-on-surface-variant",
                            current === null ? "border-primary" : "border-transparent",
                        )}
                    >
                        <Icon path={mdBlock} size={20} />
                        <span className="type-label-m">{t("page.live2d.noBackground")}</span>
                    </button>
                )}
                {shown.map(name => (
                    <button
                        key={name}
                        type="button"
                        title={name}
                        aria-label={name}
                        aria-pressed={name === current}
                        onClick={() => onSelect(name)}
                        className={cn(
                            "state-layer focus-ring overflow-hidden rounded-md3-md border-2",
                            name === current ? "border-primary" : "border-transparent",
                        )}
                    >
                        <img src={getBackgroundImageUrl(name, source)} alt="" loading="lazy" className="aspect-video w-full bg-surface-container-highest object-cover" />
                    </button>
                ))}
            </div>
            {list.status === "loading" && <LoadingState className="min-h-24" />}
            {list.status === "ready" && needle && shown.length === 0 && (
                <p className="type-body-s text-on-surface-variant">{t("page.live2d.backgroundNoMatches")}</p>
            )}
        </div>
    );
}
