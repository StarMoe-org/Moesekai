"use client";
import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Dialog, ErrorState, Icon, IconButton, LoadMore, LoadingState, TextField, cn } from "@/components/md3";
import { mdArrowBack, mdChevronRight, mdPlayArrowFill, mdSearch, mdStopFill } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { AssetLine } from "@/lib/assets";
import { fetchStoryVoiceFiles, fetchStoryVoiceScenarios, storyVoiceUrl } from "@/lib/storyMaker/assets";
import type { StoryRegion, StoryVoiceKind } from "@/types/storyMaker";
import { previewStorySound } from "./useStoryAudio";

interface VoicePickerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    kind: StoryVoiceKind;
    region: StoryRegion;
    line: AssetLine;
    currentScenarioId: string;
    currentVoiceId: string;
    onSelect: (scenarioId: string, voiceId: string) => void;
}

type ListState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; items: string[] };

const LOADING_STATE: ListState = { status: "loading" };
const PAGE_SIZE = 60;

/**
 * Two-step searchable picker for official game voices: step 1 picks a `scenarioId` directory,
 * step 2 picks and previews a `voiceId` clip inside that scenario.
 */
export function VoicePickerDialog({
    isOpen, onClose, kind, region, line, currentScenarioId, currentVoiceId, onSelect,
}: VoicePickerDialogProps) {
    const { t } = useI18n();
    const [activeScenario, setActiveScenario] = useState<string | null>(() => currentScenarioId.trim() || null);
    const [scenarioQuery, setScenarioQuery] = useState("");
    const [voiceQuery, setVoiceQuery] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [attempt, setAttempt] = useState(0);
    const [playing, setPlaying] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const scenarioKey = `${kind}|${region}|${line}|${attempt}`;
    const [loadedScenarios, setLoadedScenarios] = useState<{ key: string; state: ListState } | null>(null);
    const fileKey = activeScenario ? `${kind}|${region}|${line}|${activeScenario}|${attempt}` : null;
    const [loadedFiles, setLoadedFiles] = useState<{ key: string; state: ListState } | null>(null);

    useEffect(() => {
        if (!isOpen || activeScenario !== null) return;
        const controller = new AbortController();
        fetchStoryVoiceScenarios(kind, region, line, controller.signal).then(
            items => setLoadedScenarios({ key: scenarioKey, state: { status: "ready", items } }),
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    setLoadedScenarios({
                        key: scenarioKey,
                        state: { status: "error", message: error instanceof Error ? error.message : String(error) },
                    });
                }
            },
        );
        return () => controller.abort();
    }, [isOpen, activeScenario, kind, region, line, scenarioKey]);

    useEffect(() => {
        if (!isOpen || !activeScenario || !fileKey) return;
        const controller = new AbortController();
        fetchStoryVoiceFiles(kind, activeScenario, region, line, controller.signal).then(
            items => setLoadedFiles({ key: fileKey, state: { status: "ready", items } }),
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    setLoadedFiles({
                        key: fileKey,
                        state: { status: "error", message: error instanceof Error ? error.message : String(error) },
                    });
                }
            },
        );
        return () => controller.abort();
    }, [isOpen, activeScenario, fileKey, kind, region, line]);

    useEffect(() => {
        if (!isOpen) previewStorySound(null);
        return () => previewStorySound(null);
    }, [isOpen]);

    const scenarioState: ListState = loadedScenarios?.key === scenarioKey ? loadedScenarios.state : LOADING_STATE;
    const fileState: ListState = fileKey && loadedFiles?.key === fileKey ? loadedFiles.state : LOADING_STATE;

    const scenarioNeedle = scenarioQuery.trim().toLowerCase();
    const filteredScenarios = useMemo(() => {
        if (scenarioState.status !== "ready") return [];
        return scenarioNeedle
            ? scenarioState.items.filter(id => id.toLowerCase().includes(scenarioNeedle))
            : scenarioState.items;
    }, [scenarioState, scenarioNeedle]);

    const voiceNeedle = voiceQuery.trim().toLowerCase();
    const filteredVoices = useMemo(() => {
        if (fileState.status !== "ready") return [];
        return voiceNeedle
            ? fileState.items.filter(id => id.toLowerCase().includes(voiceNeedle))
            : fileState.items;
    }, [fileState, voiceNeedle]);

    const activeState = activeScenario === null ? scenarioState : fileState;
    const filtered = activeScenario === null ? filteredScenarios : filteredVoices;
    const visible = filtered.slice(0, visibleCount);

    const stopPreview = () => {
        previewStorySound(null);
        setPlaying(null);
        setPreviewError(null);
    };

    const handleClose = () => {
        stopPreview();
        onClose();
    };

    const openScenario = (scenarioId: string) => {
        stopPreview();
        setActiveScenario(scenarioId);
        setVoiceQuery("");
        setVisibleCount(PAGE_SIZE);
    };

    const backToScenarios = () => {
        stopPreview();
        setActiveScenario(null);
        setVisibleCount(PAGE_SIZE);
    };

    const togglePreview = (voiceId: string) => {
        if (!activeScenario) return;
        setPreviewError(null);
        if (playing === voiceId) {
            previewStorySound(null);
            setPlaying(null);
            return;
        }
        const url = storyVoiceUrl({ kind, scenarioId: activeScenario, voiceId }, region, line);
        setPlaying(voiceId);
        previewStorySound(url, {
            onEnd: () => setPlaying(curr => (curr === voiceId ? null : curr)),
            onError: () => {
                setPlaying(curr => (curr === voiceId ? null : curr));
                setPreviewError(voiceId);
            },
        });
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={handleClose}
            title={t("page.storyMaker.inspector.pickVoice")}
            size="md"
            fullscreenOnMobile
        >
            <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 truncate type-label-l text-on-surface-variant">
                        {t(activeScenario === null ? "page.storyMaker.inspector.voiceStepScenario" : "page.storyMaker.inspector.voiceStepFile")}
                        {" · "}
                        {t(`page.storyMaker.voiceKind.${kind}`)}
                    </span>
                    {activeScenario !== null && (
                        <Button size="xs" variant="text" icon={mdArrowBack} onClick={backToScenarios}>
                            {t("page.storyMaker.inspector.voiceBackToScenarios")}
                        </Button>
                    )}
                </div>

                {activeScenario !== null && (
                    <div className="flex min-w-0 items-center gap-2 rounded-md3-md bg-surface-container px-3 py-1.5">
                        <span className="min-w-0 truncate font-mono type-label-l text-on-surface">{activeScenario}</span>
                    </div>
                )}

                <TextField
                    value={activeScenario === null ? scenarioQuery : voiceQuery}
                    onValueChange={(next) => {
                        if (activeScenario === null) setScenarioQuery(next);
                        else setVoiceQuery(next);
                        setVisibleCount(PAGE_SIZE);
                    }}
                    placeholder={t(activeScenario === null ? "page.storyMaker.inspector.voiceScenarioSearch" : "page.storyMaker.inspector.voiceFileSearch")}
                    icon={mdSearch}
                    clearable
                    aria-label={t(activeScenario === null ? "page.storyMaker.inspector.voiceScenarioSearch" : "page.storyMaker.inspector.voiceFileSearch")}
                />

                {previewError && (
                    <Banner tone="error">
                        <span className="break-words">
                            {t("page.storyMaker.inspector.audioPreviewFailed")}
                            <span className="ml-1.5 font-mono type-label-s opacity-80">({previewError})</span>
                        </span>
                    </Banner>
                )}

                {activeState.status === "ready" && (
                    <p className="font-mono type-label-s text-on-surface-variant">
                        {t("page.storyMaker.inspector.assetCount", { shown: visible.length, total: filtered.length })}
                    </p>
                )}

                {activeState.status === "loading" ? (
                    <LoadingState className="min-h-40" />
                ) : activeState.status === "error" ? (
                    <ErrorState
                        title={t("page.storyMaker.inspector.voiceListFailed")}
                        message={activeState.message}
                        retryLabel={t("common.action.retry")}
                        onRetry={() => setAttempt(value => value + 1)}
                    />
                ) : filtered.length === 0 ? (
                    <p className="py-8 text-center type-body-m text-on-surface-variant">
                        {t("page.storyMaker.inspector.voiceNoMatches")}
                    </p>
                ) : (
                    <>
                        <ul className="divide-y divide-outline-variant/60">
                            {activeScenario === null ? visible.map(scenarioId => {
                                const selected = scenarioId === currentScenarioId;
                                return (
                                    <li key={scenarioId} className="py-1">
                                        <button
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => openScenario(scenarioId)}
                                            className={cn(
                                                "state-layer focus-ring flex w-full min-w-0 items-center justify-between gap-2 rounded-md3-sm px-3 py-2 text-left font-mono type-body-m",
                                                selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                            )}
                                        >
                                            <span className="min-w-0 truncate">{scenarioId}</span>
                                            <Icon path={mdChevronRight} size={18} className="shrink-0 opacity-60" />
                                        </button>
                                    </li>
                                );
                            }) : visible.map(voiceId => {
                                const selected = activeScenario === currentScenarioId && voiceId === currentVoiceId;
                                const isPlaying = playing === voiceId;
                                return (
                                    <li key={voiceId} className="flex min-w-0 items-center gap-2 py-1">
                                        <button
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => {
                                                stopPreview();
                                                onSelect(activeScenario, voiceId);
                                                onClose();
                                            }}
                                            className={cn(
                                                "state-layer focus-ring min-w-0 flex-1 truncate rounded-md3-sm px-3 py-2 text-left font-mono type-body-m",
                                                selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
                                            )}
                                        >
                                            {voiceId}
                                        </button>
                                        <IconButton
                                            size="xs"
                                            icon={isPlaying ? mdStopFill : mdPlayArrowFill}
                                            label={t(isPlaying ? "page.storyMaker.inspector.stopPreview" : "page.storyMaker.inspector.previewAudio")}
                                            onClick={() => togglePreview(voiceId)}
                                        />
                                    </li>
                                );
                            })}
                        </ul>

                        {visible.length < filtered.length && (
                            <LoadMore
                                label={t("page.storyMaker.inspector.loadMoreAssets")}
                                shown={visible.length}
                                total={filtered.length}
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
