"use client";
import { useEffect, useMemo, useState } from "react";
import { Dialog, ErrorState, IconButton, LoadingState, TextField, cn } from "@/components/md3";
import { mdPlayArrowFill, mdSearch, mdStopFill } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetLine } from "@/lib/assets";
import { fetchStoryAssetNames, storyBgmUrl, storySeUrl, type StoryAssetKind } from "@/lib/storyMaker/assets";
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

type ListState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; names: string[] };

const LOADING_STATE: ListState = { status: "loading" };

/** Searchable picker dialog for game BGM or SE asset names with inline audio preview. */
export function AssetNamePickerDialog({ isOpen, onClose, kind, region, line, current, onSelect }: AssetNamePickerDialogProps) {
    const { t } = useI18n();
    const [query, setQuery] = useState("");
    const [attempt, setAttempt] = useState(0);
    const [playing, setPlaying] = useState<string | null>(null);
    const key = `${kind}|${region}|${line}|${attempt}`;
    const [loaded, setLoaded] = useState<{ key: string; state: ListState } | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        fetchStoryAssetNames(kind, region, line).then(
            names => { if (!cancelled) setLoaded({ key, state: { status: "ready", names } }); },
            (error: unknown) => {
                if (!cancelled) setLoaded({ key, state: { status: "error", message: error instanceof Error ? error.message : String(error) } });
            },
        );
        return () => { cancelled = true; };
    }, [isOpen, kind, region, line, key]);

    useEffect(() => {
        if (!isOpen) {
            previewStorySound(null);
        }
        return () => previewStorySound(null);
    }, [isOpen]);

    const state: ListState = loaded?.key === key ? loaded.state : LOADING_STATE;
    const needle = query.trim().toLowerCase();
    const shown = useMemo(() => {
        if (state.status !== "ready") return [];
        const list = needle ? state.names.filter(name => name.toLowerCase().includes(needle)) : state.names;
        return list.slice(0, 200);
    }, [state, needle]);

    const togglePreview = (name: string) => {
        if (playing === name) {
            previewStorySound(null);
            setPlaying(null);
            return;
        }
        const url = kind === "bgm" ? storyBgmUrl(name, region, line) : storySeUrl(name, region, line);
        previewStorySound(url);
        setPlaying(name);
    };

    const handleClose = () => {
        previewStorySound(null);
        setPlaying(null);
        onClose();
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={handleClose}
            title={t(kind === "bgm" ? "page.storyMaker.inspector.pickBgm" : "page.storyMaker.inspector.pickSe")}
            size="md"
            fullscreenOnMobile
        >
            <div className="space-y-3">
                <TextField
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={t("page.storyMaker.inspector.assetSearchPlaceholder")}
                    icon={mdSearch}
                    aria-label={t("page.storyMaker.inspector.assetSearchPlaceholder")}
                />
                {state.status === "loading" ? (
                    <LoadingState className="min-h-40" />
                ) : state.status === "error" ? (
                    <ErrorState
                        title={t("page.storyMaker.inspector.assetListFailed")}
                        message={state.message}
                        retryLabel={t("common.action.retry")}
                        onRetry={() => setAttempt(value => value + 1)}
                    />
                ) : shown.length === 0 ? (
                    <p className="py-8 text-center type-body-m text-on-surface-variant">
                        {t("page.storyMaker.inspector.assetNoMatches")}
                    </p>
                ) : (
                    <ul className="divide-y divide-outline-variant/60">
                        {shown.map(name => {
                            const selected = name === current;
                            const isPlaying = playing === name;
                            return (
                                <li key={name} className="flex items-center gap-2 py-1">
                                    <button
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => {
                                            previewStorySound(null);
                                            setPlaying(null);
                                            onSelect(name);
                                            onClose();
                                        }}
                                        className={cn(
                                            "state-layer focus-ring min-w-0 flex-1 truncate rounded-md3-sm px-3 py-2 text-left font-mono type-body-m",
                                            selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                        )}
                                    >
                                        {name}
                                    </button>
                                    <IconButton
                                        size="xs"
                                        icon={isPlaying ? mdStopFill : mdPlayArrowFill}
                                        label={t(isPlaying ? "page.storyMaker.inspector.stopPreview" : "page.storyMaker.inspector.previewAudio")}
                                        onClick={() => togglePreview(name)}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </Dialog>
    );
}
