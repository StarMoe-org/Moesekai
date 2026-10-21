"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Dialog, ErrorState, LoadingState, TextField } from "@/components/md3";
import { mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { getBackgroundImageUrl } from "@/lib/assets";
import { fetchStoryBackgrounds } from "@/lib/live2dViewer/client";
import type { Live2DRegion } from "@/lib/live2dViewer/config";

interface BackgroundPickerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    region: Live2DRegion;
    /** The asset site the reader chose. */
    line: "main" | "overseas";
    current: string | null;
    onSelect: (name: string) => void;
}

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

/** The story backgrounds of a server, as thumbnails, to stand the model on. Pages of the list come as they are asked for. */
export function BackgroundPickerDialog({ isOpen, onClose, region, line, current, onSelect }: BackgroundPickerDialogProps) {
    const { t } = useI18n();
    const [names, setNames] = useState<string[]>([]);
    const [next, setNext] = useState<string | null>(null);
    const [list, setList] = useState<ListState>({ status: "loading" });
    const [query, setQuery] = useState("");
    const loaded = useRef<string | null>(null);
    const source = `${line}-${region}` as AssetSourceType;

    // (the list starts as loading; a later page or a retry says so itself before it asks)
    const load = useCallback((cursor: string | null, signal: AbortSignal) => {
        fetchStoryBackgrounds(region, line, cursor, signal).then(
            page => {
                setNames(previous => (cursor ? [...previous, ...page.names] : page.names));
                setNext(page.next);
                setList({ status: "ready" });
            },
            (error: unknown) => {
                if (!signal.aborted) setList({ status: "error", message: error instanceof Error ? error.message : String(error) });
            },
        );
    }, [region, line]);

    // The first page when the dialog first opens (the page gives each server and asset site a dialog of its own).
    useEffect(() => {
        if (!isOpen || loaded.current === source) return;
        loaded.current = source;
        const controller = new AbortController();
        load(null, controller.signal);
        return () => controller.abort();
    }, [isOpen, source, load]);

    const more = useRef<AbortController | null>(null);
    useEffect(() => () => more.current?.abort(), []);
    const loadMore = () => {
        if (!next) return;
        more.current?.abort();
        more.current = new AbortController();
        setList({ status: "loading" });
        load(next, more.current.signal);
    };

    const needle = query.trim().toLowerCase();
    const shown = useMemo(() => (needle ? names.filter(name => name.toLowerCase().includes(needle)) : names), [names, needle]);

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={t("page.live2d.chooseBackground")}
            size="lg"
            fullscreenOnMobile
        >
            <div className="space-y-4">
                <TextField
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={t("page.live2d.backgroundSearch")}
                    icon={mdSearch}
                    aria-label={t("page.live2d.backgroundSearch")}
                />
                {list.status === "error" && names.length === 0 ? (
                    <ErrorState title={t("page.live2d.backgroundsFailed")} message={list.message} retryLabel={t("common.action.retry")} onRetry={() => {
                        setList({ status: "loading" });
                        load(null, new AbortController().signal);
                    }} />
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {shown.map(name => (
                                <button
                                    key={name}
                                    type="button"
                                    title={name}
                                    aria-pressed={name === current}
                                    onClick={() => {
                                        onSelect(name);
                                        onClose();
                                    }}
                                    className={`state-layer focus-ring overflow-hidden rounded-md3-md border-2 text-left ${name === current ? "border-primary" : "border-transparent"}`}
                                >
                                    <img src={getBackgroundImageUrl(name, source)} alt="" loading="lazy" className="aspect-video w-full bg-surface-container-highest object-cover" />
                                    <span className="block truncate px-2 py-1 font-mono type-label-s text-on-surface-variant">{name}</span>
                                </button>
                            ))}
                        </div>
                        {list.status === "loading" && <LoadingState className="min-h-40" />}
                        {list.status === "ready" && shown.length === 0 && (
                            <p className="type-body-s text-on-surface-variant">{t("page.live2d.noMatches")}</p>
                        )}
                        {next && list.status !== "loading" && (
                            <div className="flex justify-center">
                                <Button variant="tonal" onClick={loadMore}>{t("page.live2d.moreBackgrounds")}</Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Dialog>
    );
}
