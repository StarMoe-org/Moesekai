"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getServerDisplayCode, ServerRegionIcon } from "@/components/common/ServerRegion";
import {
    Banner, Button, Chip, Dialog, ErrorState, Icon, IconButton, LinearProgress, LoadMore, LoadingState,
    SegmentedButton, Select, Tabs, TextField, cn, type SelectOption,
} from "@/components/md3";
import {
    mdArrowBack, mdChat, mdCheck, mdChevronRight, mdFolderOpen, mdKeyboardArrowDown, mdKeyboardArrowUp,
    mdPlayArrowFill, mdRefresh, mdSearch, mdStopFill,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { SERVER_LABEL_KEYS } from "@/lib/account-servers";
import { getCharacterIconUrl, type AssetLine } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import { StorySearchWorkerClient } from "@/lib/story-search/client";
import { parseDialogueLines } from "@/lib/story-search/dialogue";
import {
    STORY_SEARCH_SERVERS,
    type CorpusLoadProgress,
    type CorpusStatusInfo,
    type StoryChunk,
    type StoryChunkType,
    type StorySearchHit,
    type StorySearchServer,
} from "@/lib/story-search/types";
import {
    fetchStoryVoiceFiles,
    fetchStoryVoiceScenarios,
    storyVoiceCandidateUrls,
} from "@/lib/storyMaker/assets";
import { resolveStorySearchChunkVoices, type StorySearchVoiceLine } from "@/lib/storyMaker/voiceSearch";
import type { StoryRegion, StoryVoiceKind, StoryVoiceRef } from "@/types/storyMaker";
import { previewStorySound } from "./useStoryAudio";

export interface VoicePickerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    kind: StoryVoiceKind;
    region: StoryRegion;
    line: AssetLine;
    currentScenarioId: string;
    currentVoiceId: string;
    onSelect: (voice: StoryVoiceRef, suggestedText?: string) => void;
}

type PickerTab = "search" | "browse";
type BrowseVoiceKind = Exclude<StoryVoiceKind, "part">;
type SearchTypeFilter = "all" | StoryChunkType;

type ListState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; items: string[] };

type ChunkResolveState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; lines: StorySearchVoiceLine[] };

const LOADING_STATE: ListState = { status: "loading" };
const BROWSE_PAGE_SIZE = 60;
const SEARCH_PAGE_SIZE = 25;
const SEARCH_LIMIT = 80;
const SEARCH_DEBOUNCE_MS = 220;
const CHARACTER_IDS = Array.from({ length: 26 }, (_, idx) => idx + 1);
const BROWSE_VOICE_KINDS: readonly BrowseVoiceKind[] = ["story", "card", "area"];

const SEARCH_TYPE_FILTERS: readonly { value: SearchTypeFilter; labelKey: string }[] = [
    { value: "all", labelKey: "page.storyMaker.voiceSearch.allTypes" },
    { value: "event", labelKey: "page.storyMaker.voiceSearch.typeEvent" },
    { value: "unit", labelKey: "page.storyMaker.voiceSearch.typeUnit" },
    { value: "card", labelKey: "page.storyMaker.voiceSearch.typeCard" },
    { value: "talk", labelKey: "page.storyMaker.voiceSearch.typeTalk" },
    { value: "self", labelKey: "page.storyMaker.voiceSearch.typeSelf" },
    { value: "special", labelKey: "page.storyMaker.voiceSearch.typeSpecial" },
];

const CHUNK_TYPE_LABEL_KEYS: Record<StoryChunkType, string> = {
    event: "page.storyMaker.voiceSearch.typeEvent",
    unit: "page.storyMaker.voiceSearch.typeUnit",
    card: "page.storyMaker.voiceSearch.typeCard",
    talk: "page.storyMaker.voiceSearch.typeTalk",
    self: "page.storyMaker.voiceSearch.typeSelf",
    special: "page.storyMaker.voiceSearch.typeSpecial",
};

function renderHighlighted(text: string, query: string): ReactNode {
    const q = query.trim();
    if (!q) return text;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "ig");
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let count = 0;
    for (const match of text.matchAll(re)) {
        const start = match.index ?? 0;
        const hit = match[0];
        if (!hit) break;
        if (start > lastIndex) parts.push(text.slice(lastIndex, start));
        parts.push(
            <mark
                key={`${start}-${count}`}
                className="rounded-md3-xs bg-primary-container px-0.5 text-on-primary-container"
            >
                {hit}
            </mark>,
        );
        lastIndex = start + hit.length;
        if (++count >= 32) break;
    }
    if (parts.length === 0) return text;
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
}

function getCorpusProgressMetrics(progress: CorpusLoadProgress | null): { ratio: number | undefined; pct: number } {
    if (!progress) return { ratio: undefined, pct: 0 };
    if (progress.phase === "decompressing") return { ratio: 0.95, pct: 95 };
    if (progress.phase === "ready") return { ratio: 1, pct: 100 };
    if (progress.phase === "downloading" && progress.totalBytes && progress.totalBytes > 0) {
        const downloaded = Math.min(1, Math.max(0, (progress.loadedBytes ?? 0) / progress.totalBytes));
        const ratio = Math.min(0.9, downloaded * 0.9);
        return { ratio, pct: Math.round(ratio * 100) };
    }
    return { ratio: undefined, pct: 0 };
}

/**
 * Dual-mode game voice picker:
 * - Tab 1 (default): Story Search dialogue finder backed by `StorySearchWorkerClient` + per-line voice resolver.
 * - Tab 2: 2-step scenario -> voice directory browser (`story` / `card` / `area`).
 */
export function VoicePickerDialog({
    isOpen, onClose, kind, region, line, currentScenarioId, currentVoiceId, onSelect,
}: VoicePickerDialogProps) {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<PickerTab>("search");

    // Shared preview state
    const [playing, setPlaying] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

    // Tab 1: Story Search state
    const workerRef = useRef<StorySearchWorkerClient | null>(null);
    const loadedWorkerServersRef = useRef(new Set<StorySearchServer>());
    const resolveControllersRef = useRef(new Map<string, AbortController>());
    const [searchServer, setSearchServer] = useState<StorySearchServer>(region);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCharId, setSelectedCharId] = useState<number>(0);
    const [searchType, setSearchType] = useState<SearchTypeFilter>("all");
    const [corpusByServer, setCorpusByServer] = useState<Partial<Record<StorySearchServer, CorpusStatusInfo>>>({});
    const [corpusLoadState, setCorpusLoadState] = useState<{ server: StorySearchServer; progress: CorpusLoadProgress } | null>(null);
    const [corpusAttempt, setCorpusAttempt] = useState(0);
    const [searchVisibleCount, setSearchVisibleCount] = useState(SEARCH_PAGE_SIZE);
    const [searchResult, setSearchResult] = useState<{
        queryKey: string;
        hits: StorySearchHit[];
        totalMatches: number;
        error: string | null;
    } | null>(null);
    const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());
    const [resolvedByKey, setResolvedByKey] = useState<Record<string, ChunkResolveState>>({});

    // Reset worker-coupled corpus/search state when the dialog closes while kept mounted.
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (!isOpen) {
            setCorpusByServer({});
            setCorpusLoadState(null);
            setSearchResult(null);
            setPlaying(null);
            setPreviewError(null);
        }
    }

    // Tab 2: Browse Folders state
    const initialBrowseKind: BrowseVoiceKind = kind === "part" ? "story" : kind;
    const [browseKind, setBrowseKind] = useState<BrowseVoiceKind>(initialBrowseKind);
    const [activeScenario, setActiveScenario] = useState<string | null>(() => (
        kind === "part" ? null : (currentScenarioId.trim() || null)
    ));
    const [scenarioQuery, setScenarioQuery] = useState("");
    const [voiceQuery, setVoiceQuery] = useState("");
    const [visibleCount, setVisibleCount] = useState(BROWSE_PAGE_SIZE);
    const [attempt, setAttempt] = useState(0);

    const scenarioKey = `${browseKind}|${region}|${line}|${attempt}`;
    const [loadedScenarios, setLoadedScenarios] = useState<{ key: string; state: ListState } | null>(null);
    const fileKey = activeScenario ? `${browseKind}|${region}|${line}|${activeScenario}|${attempt}` : null;
    const [loadedFiles, setLoadedFiles] = useState<{ key: string; state: ListState } | null>(null);

    const abortAllResolutions = useCallback(() => {
        for (const controller of resolveControllersRef.current.values()) {
            controller.abort();
        }
        resolveControllersRef.current.clear();
    }, []);

    const stopPreview = useCallback(() => {
        previewStorySound(null);
        setPlaying(null);
        setPreviewError(null);
    }, []);

    const disposeWorker = useCallback(() => {
        workerRef.current?.dispose();
        workerRef.current = null;
        loadedWorkerServersRef.current.clear();
    }, []);

    const ensureWorker = useCallback((): StorySearchWorkerClient => {
        if (!workerRef.current) {
            workerRef.current = new StorySearchWorkerClient();
        }
        return workerRef.current;
    }, []);

    // Cleanup worker, audio previews, and in-flight voice resolution requests when closing or unmounting.
    useEffect(() => {
        if (!isOpen) {
            previewStorySound(null);
            abortAllResolutions();
            disposeWorker();
        }
        return () => {
            previewStorySound(null);
            abortAllResolutions();
            disposeWorker();
        };
    }, [isOpen, abortAllResolutions, disposeWorker]);

    // Auto-load local Story Search corpus for the selected search server.
    const activeCorpus = corpusByServer[searchServer] ?? null;
    useEffect(() => {
        if (!isOpen || activeTab !== "search") return;
        if (loadedWorkerServersRef.current.has(searchServer)) return;
        let cancelled = false;
        const client = ensureWorker();
        client.loadCorpus(searchServer, {
            forceRefresh: corpusAttempt > 0,
            onProgress: (progress) => {
                if (!cancelled) {
                    setCorpusLoadState({ server: searchServer, progress });
                }
            },
        }).then(
            (info) => {
                if (cancelled) return;
                loadedWorkerServersRef.current.add(searchServer);
                setCorpusByServer(prev => ({ ...prev, [searchServer]: info }));
                setCorpusLoadState({ server: searchServer, progress: { phase: "ready", server: searchServer, info } });
            },
            (err: unknown) => {
                if (cancelled) return;
                const message = err instanceof Error ? err.message : String(err);
                setCorpusLoadState({ server: searchServer, progress: { phase: "error", server: searchServer, error: message } });
            },
        );
        return () => {
            cancelled = true;
        };
    }, [isOpen, activeTab, searchServer, corpusAttempt, ensureWorker]);

    // Debounced worker search across the loaded corpus.
    const trimmedSearchQuery = searchQuery.trim();
    const hasActiveQuery = trimmedSearchQuery.length > 0 || selectedCharId > 0;
    const currentQueryKey = `${searchServer}|${searchType}|${selectedCharId}|${trimmedSearchQuery}`;

    useEffect(() => {
        if (!isOpen || activeTab !== "search" || !activeCorpus || !hasActiveQuery) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            const client = ensureWorker();
            client.searchLocal({
                server: searchServer,
                query: trimmedSearchQuery,
                isRegex: false,
                caseSensitive: false,
                type: searchType,
                charIds: selectedCharId > 0 ? [selectedCharId] : undefined,
                limit: SEARCH_LIMIT,
            }).then(
                (res) => {
                    if (cancelled) return;
                    setSearchResult({
                        queryKey: currentQueryKey,
                        hits: res.hits,
                        totalMatches: res.totalMatches,
                        error: null,
                    });
                },
                (err: unknown) => {
                    if (cancelled) return;
                    setSearchResult({
                        queryKey: currentQueryKey,
                        hits: [],
                        totalMatches: 0,
                        error: err instanceof Error ? err.message : String(err),
                    });
                },
            );
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [
        isOpen, activeTab, activeCorpus, hasActiveQuery, searchServer, trimmedSearchQuery,
        searchType, selectedCharId, currentQueryKey, ensureWorker,
    ]);

    // Tab 2: Fetch scenario directories.
    useEffect(() => {
        if (!isOpen || activeTab !== "browse" || activeScenario !== null) return;
        const controller = new AbortController();
        fetchStoryVoiceScenarios(browseKind, region, line, controller.signal).then(
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
    }, [isOpen, activeTab, activeScenario, browseKind, region, line, scenarioKey]);

    // Tab 2: Fetch voice files inside selected scenario.
    useEffect(() => {
        if (!isOpen || activeTab !== "browse" || !activeScenario || !fileKey) return;
        const controller = new AbortController();
        fetchStoryVoiceFiles(browseKind, activeScenario, region, line, controller.signal).then(
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
    }, [isOpen, activeTab, activeScenario, fileKey, browseKind, region, line]);

    // Server & Character dropdown options for Story Search.
    const serverOptions = useMemo<SelectOption<StorySearchServer>[]>(() => (
        STORY_SEARCH_SERVERS.map(srv => ({
            value: srv,
            label: t(SERVER_LABEL_KEYS[srv]),
            leading: <ServerRegionIcon server={srv} size={18} decorative />,
        }))
    ), [t]);

    const characterOptions = useMemo<SelectOption<number>[]>(() => [
        {
            value: 0,
            label: t("page.storyMaker.voiceSearch.allCharacters"),
            textValue: t("page.storyMaker.voiceSearch.allCharacters"),
        },
        ...CHARACTER_IDS.map(id => {
            const charName = getCharacterName(t, id);
            return {
                value: id,
                label: charName,
                textValue: `${id} ${charName}`,
                leading: (
                    <img
                        src={getCharacterIconUrl(id)}
                        alt=""
                        className="size-5 rounded-full bg-surface-container-highest object-cover"
                    />
                ),
            };
        }),
    ], [t]);

    // Tab 2 derived lists
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

    const activeBrowseState = activeScenario === null ? scenarioState : fileState;
    const filteredBrowse = activeScenario === null ? filteredScenarios : filteredVoices;
    const visibleBrowse = filteredBrowse.slice(0, visibleCount);

    // Tab 1 derived status
    const activeCorpusProgress = corpusLoadState?.server === searchServer ? corpusLoadState.progress : null;
    const corpusFailed = !activeCorpus && activeCorpusProgress?.phase === "error";
    const corpusLoading = !activeCorpus && !corpusFailed;
    const { ratio: corpusRatio, pct: corpusPct } = getCorpusProgressMetrics(activeCorpusProgress);
    const activeSearchHits = hasActiveQuery && searchResult?.queryKey === currentQueryKey ? searchResult.hits : [];
    const activeTotalMatches = hasActiveQuery && searchResult?.queryKey === currentQueryKey ? searchResult.totalMatches : 0;
    const activeSearchError = hasActiveQuery && searchResult?.queryKey === currentQueryKey ? searchResult.error : null;
    const isSearching = Boolean(activeCorpus) && hasActiveQuery && searchResult?.queryKey !== currentQueryKey;
    const visibleSearchHits = activeSearchHits.slice(0, searchVisibleCount);

    const handleClose = () => {
        stopPreview();
        abortAllResolutions();
        onClose();
    };

    const handleTabChange = (nextTab: PickerTab) => {
        if (nextTab === activeTab) return;
        stopPreview();
        abortAllResolutions();
        setActiveTab(nextTab);
    };

    const handleSearchServerChange = (nextServer: StorySearchServer) => {
        if (nextServer === searchServer) return;
        stopPreview();
        abortAllResolutions();
        setSearchServer(nextServer);
        setCorpusAttempt(0);
        setSearchVisibleCount(SEARCH_PAGE_SIZE);
        setExpandedKeys(new Set());
    };

    const resolveChunk = useCallback((chunk: StoryChunk) => {
        const key = `${chunk.server}:${chunk.id}`;
        const existing = resolveControllersRef.current.get(key);
        existing?.abort();
        const controller = new AbortController();
        resolveControllersRef.current.set(key, controller);
        setResolvedByKey(prev => ({ ...prev, [key]: { status: "loading" } }));

        resolveStorySearchChunkVoices(chunk, line, controller.signal).then(
            (lines) => {
                if (controller.signal.aborted) return;
                resolveControllersRef.current.delete(key);
                setResolvedByKey(prev => ({ ...prev, [key]: { status: "ready", lines } }));
            },
            (err: unknown) => {
                if (controller.signal.aborted) return;
                resolveControllersRef.current.delete(key);
                setResolvedByKey(prev => ({
                    ...prev,
                    [key]: { status: "error", message: err instanceof Error ? err.message : String(err) },
                }));
            },
        );
    }, [line]);

    const toggleExpandChunk = (chunk: StoryChunk) => {
        const key = `${chunk.server}:${chunk.id}`;
        const currentlyExpanded = expandedKeys.has(key);
        setExpandedKeys((prev) => {
            const next = new Set(prev);
            if (currentlyExpanded) next.delete(key);
            else next.add(key);
            return next;
        });
        if (!currentlyExpanded) {
            const state = resolvedByKey[key];
            if (!state || state.status === "error") {
                resolveChunk(chunk);
            }
        }
    };

    const toggleAudioPreview = (previewKey: string, urls: readonly string[], errorLabel: string) => {
        setPreviewError(null);
        if (playing === previewKey) {
            previewStorySound(null);
            setPlaying(null);
            return;
        }
        setPlaying(previewKey);
        previewStorySound(urls, {
            onEnd: () => setPlaying(curr => (curr === previewKey ? null : curr)),
            onError: () => {
                setPlaying(curr => (curr === previewKey ? null : curr));
                setPreviewError(errorLabel);
            },
        });
    };

    const handleSelectVoice = (voice: StoryVoiceRef, suggestedText?: string, sourceTab: PickerTab = "browse") => {
        stopPreview();
        abortAllResolutions();
        const normalizedVoice: StoryVoiceRef = {
            kind: voice.kind,
            scenarioId: voice.scenarioId,
            voiceId: voice.voiceId,
        };
        if (sourceTab === "search" && searchServer !== region) {
            normalizedVoice.region = searchServer;
        }
        onSelect(normalizedVoice, suggestedText);
        onClose();
    };

    const openScenario = (scenarioId: string) => {
        stopPreview();
        setActiveScenario(scenarioId);
        setVoiceQuery("");
        setVisibleCount(BROWSE_PAGE_SIZE);
    };

    const backToScenarios = () => {
        stopPreview();
        setActiveScenario(null);
        setVisibleCount(BROWSE_PAGE_SIZE);
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={handleClose}
            title={t("page.storyMaker.inspector.pickVoice")}
            size="lg"
            fullscreenOnMobile
        >
            <div className="min-w-0 space-y-3">
                <Tabs<PickerTab>
                    variant="secondary"
                    value={activeTab}
                    onValueChange={handleTabChange}
                    aria-label={t("page.storyMaker.inspector.pickVoice")}
                    items={[
                        {
                            value: "search",
                            label: t("page.storyMaker.voiceSearch.tabSearch"),
                            icon: mdSearch,
                        },
                        {
                            value: "browse",
                            label: t("page.storyMaker.voiceSearch.tabBrowse"),
                            icon: mdFolderOpen,
                        },
                    ]}
                />

                {previewError && (
                    <Banner tone="error">
                        <span className="break-words">
                            {t("page.storyMaker.inspector.audioPreviewFailed")}
                            <span className="ml-1.5 font-mono type-label-s opacity-80">({previewError})</span>
                        </span>
                    </Banner>
                )}

                {activeTab === "search" ? (
                    <div className="min-w-0 space-y-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Select<StorySearchServer>
                                label={t("page.storyMaker.voiceSearch.serverLabel")}
                                value={searchServer}
                                onValueChange={handleSearchServerChange}
                                options={serverOptions}
                            />
                            <Select<number>
                                label={t("page.storyMaker.voiceSearch.allCharacters")}
                                value={selectedCharId}
                                onValueChange={(nextId) => {
                                    setSelectedCharId(nextId);
                                    setSearchVisibleCount(SEARCH_PAGE_SIZE);
                                }}
                                options={characterOptions}
                                searchable
                            />
                        </div>

                        {searchServer !== region && (
                            <Banner tone="info">
                                {t("page.storyMaker.nle.crossServerVoiceNotice", {
                                    server: getServerDisplayCode(searchServer),
                                })}
                            </Banner>
                        )}

                        <TextField
                            value={searchQuery}
                            onValueChange={(next) => {
                                setSearchQuery(next);
                                setSearchVisibleCount(SEARCH_PAGE_SIZE);
                            }}
                            placeholder={t("page.storyMaker.voiceSearch.searchPlaceholder")}
                            aria-label={t("page.storyMaker.voiceSearch.searchPlaceholder")}
                            icon={mdSearch}
                            clearable
                        />

                        <div className="flex flex-wrap gap-1.5">
                            {SEARCH_TYPE_FILTERS.map(item => (
                                <Chip
                                    key={item.value}
                                    variant="filter"
                                    showCheckmark={false}
                                    selected={searchType === item.value}
                                    onClick={() => {
                                        setSearchType(item.value);
                                        setSearchVisibleCount(SEARCH_PAGE_SIZE);
                                    }}
                                >
                                    {t(item.labelKey)}
                                </Chip>
                            ))}
                        </div>

                        {corpusLoading && (
                            <div className="space-y-1.5 rounded-md3-md bg-surface-container px-3 py-2.5">
                                <p className="type-label-m text-on-surface-variant">
                                    {t("page.storyMaker.voiceSearch.loadingCorpus", { progress: corpusPct })}
                                </p>
                                <LinearProgress value={corpusRatio} />
                            </div>
                        )}

                        {corpusFailed && (
                            <Banner tone="error">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="min-w-0 flex-1 type-body-s">
                                        {t("page.storyMaker.voiceSearch.corpusError")}
                                    </span>
                                    <Button
                                        size="xs"
                                        variant="tonal"
                                        icon={mdRefresh}
                                        onClick={() => {
                                            setCorpusLoadState(null);
                                            setCorpusAttempt(prev => prev + 1);
                                        }}
                                    >
                                        {t("page.storyMaker.voiceSearch.retryCorpus")}
                                    </Button>
                                </div>
                            </Banner>
                        )}

                        {activeCorpus && (
                            <p className="type-label-s text-on-surface-variant">
                                {t("page.storyMaker.voiceSearch.corpusReady", { count: activeCorpus.chunkCount })}
                            </p>
                        )}

                        {isSearching && (
                            <div className="space-y-1.5 py-2">
                                <p className="type-label-m text-on-surface-variant">
                                    {t("page.storyMaker.voiceSearch.searching")}
                                </p>
                                <LinearProgress />
                            </div>
                        )}

                        {activeCorpus && hasActiveQuery && !isSearching && (
                            <>
                                {activeSearchError && (
                                    <Banner tone="error">{activeSearchError}</Banner>
                                )}

                                <p className="font-mono type-label-s text-on-surface-variant">
                                    {t("page.storyMaker.voiceSearch.resultCount", { count: activeTotalMatches })}
                                </p>

                                {activeSearchHits.length === 0 ? (
                                    <p className="py-8 text-center type-body-m text-on-surface-variant">
                                        {t("page.storyMaker.voiceSearch.noResults")}
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {visibleSearchHits.map(hit => {
                                            const { chunk } = hit;
                                            const chunkKey = `${chunk.server}:${chunk.id}`;
                                            const expanded = expandedKeys.has(chunkKey);
                                            const resolveState = resolvedByKey[chunkKey];
                                            const matchedSet = new Set(hit.matchedLineIndices ?? []);
                                            const snippetLines = parseDialogueLines(chunk.text ?? "");
                                            const previewLines = hit.matchedLineIndices && hit.matchedLineIndices.length > 0
                                                ? hit.matchedLineIndices
                                                    .slice(0, 3)
                                                    .map(idx => snippetLines[idx])
                                                    .filter((item): item is NonNullable<typeof item> => Boolean(item))
                                                : snippetLines.slice(0, 3);
                                            const voicedCount = resolveState?.status === "ready"
                                                ? resolveState.lines.filter(entry => entry.voiceRef !== null).length
                                                : null;

                                            return (
                                                <div
                                                    key={chunkKey}
                                                    className="min-w-0 overflow-hidden rounded-md3-md border border-outline-variant/80 bg-surface-container-low"
                                                >
                                                    <button
                                                        type="button"
                                                        aria-expanded={expanded}
                                                        onClick={() => toggleExpandChunk(chunk)}
                                                        className="state-layer focus-ring flex w-full min-w-0 cursor-pointer flex-col gap-1.5 px-3 py-2.5 text-left"
                                                    >
                                                        <div className="flex w-full min-w-0 items-start justify-between gap-2">
                                                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                                                <span className="shrink-0 rounded-md3-xs bg-secondary-container px-1.5 py-0.5 type-label-s text-on-secondary-container">
                                                                    {t(CHUNK_TYPE_LABEL_KEYS[chunk.type])}
                                                                </span>
                                                                <span className="min-w-0 truncate type-title-s text-on-surface">
                                                                    {chunk.story}
                                                                </span>
                                                                {chunk.ep && (
                                                                    <span className="min-w-0 truncate type-label-m text-on-surface-variant">
                                                                        · {chunk.ep}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="inline-flex shrink-0 items-center gap-1 type-label-s text-primary">
                                                                <span>
                                                                    {voicedCount !== null
                                                                        ? t("page.storyMaker.voiceSearch.voiceCount", { count: voicedCount })
                                                                        : t("page.storyMaker.voiceSearch.loadVoices")}
                                                                </span>
                                                                <Icon
                                                                    path={expanded ? mdKeyboardArrowUp : mdKeyboardArrowDown}
                                                                    size={18}
                                                                />
                                                            </span>
                                                        </div>

                                                        {chunk.chars.length > 0 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {chunk.chars.slice(0, 6).map((charLabel, idx) => (
                                                                    <span
                                                                        key={`${charLabel}-${idx}`}
                                                                        className="rounded-md3-xs bg-surface-container-highest px-1.5 py-0.5 type-label-s text-on-surface-variant"
                                                                    >
                                                                        {charLabel}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {!expanded && previewLines.length > 0 && (
                                                            <div className="space-y-0.5 pt-0.5 type-body-s text-on-surface-variant">
                                                                {previewLines.map((snippet, idx) => (
                                                                    <p key={idx} className="line-clamp-2 break-words">
                                                                        {snippet.speaker && (
                                                                            <span className="font-medium text-primary">
                                                                                {snippet.speaker}:{" "}
                                                                            </span>
                                                                        )}
                                                                        <span>{renderHighlighted(snippet.speech, trimmedSearchQuery)}</span>
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </button>

                                                    {expanded && (
                                                        <div className="border-t border-outline-variant/60 bg-surface-container px-3 py-2.5">
                                                            {(!resolveState || resolveState.status === "loading") && (
                                                                <div className="space-y-1.5 py-2">
                                                                    <p className="type-label-s text-on-surface-variant">
                                                                        {t("page.storyMaker.voiceSearch.loadingVoices")}
                                                                    </p>
                                                                    <LinearProgress />
                                                                </div>
                                                            )}

                                                            {resolveState?.status === "error" && (
                                                                <div className="flex flex-wrap items-center justify-between gap-2 py-1">
                                                                    <span className="type-body-s text-error">
                                                                        {t("page.storyMaker.voiceSearch.resolveError")}
                                                                    </span>
                                                                    <Button
                                                                        size="xs"
                                                                        variant="tonal"
                                                                        icon={mdRefresh}
                                                                        onClick={() => resolveChunk(chunk)}
                                                                    >
                                                                        {t("common.action.retry")}
                                                                    </Button>
                                                                </div>
                                                            )}

                                                            {resolveState?.status === "ready" && (
                                                                resolveState.lines.length === 0 ? (
                                                                    <p className="py-2 type-body-s text-on-surface-variant">
                                                                        {t("page.storyMaker.voiceSearch.resolveError")}
                                                                    </p>
                                                                ) : (
                                                                    <ul className="space-y-2">
                                                                        {resolveState.lines.map(voiceLine => {
                                                                            const isMatchedLine = matchedSet.has(voiceLine.lineIndex);
                                                                            const allVoiceRefs = voiceLine.voiceRef
                                                                                ? [voiceLine.voiceRef, ...voiceLine.extraVoices]
                                                                                : [];

                                                                            return (
                                                                                <li
                                                                                    key={voiceLine.lineIndex}
                                                                                    className={cn(
                                                                                        "min-w-0 space-y-2 rounded-md3-sm border p-2.5",
                                                                                        isMatchedLine
                                                                                            ? "border-primary/40 bg-secondary-container/35"
                                                                                            : "border-outline-variant/60 bg-surface-container-low",
                                                                                    )}
                                                                                >
                                                                                    <div className="min-w-0 space-y-0.5">
                                                                                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
                                                                                            {voiceLine.speaker && (
                                                                                                <span className="truncate type-label-l text-primary">
                                                                                                    {voiceLine.speaker}
                                                                                                </span>
                                                                                            )}
                                                                                            {allVoiceRefs.length === 0 ? (
                                                                                                <span className="rounded-md3-xs bg-surface-container-highest px-1.5 py-0.5 type-label-s text-on-surface-variant">
                                                                                                    {t("page.storyMaker.voiceSearch.noVoiceOnLine")}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="rounded-md3-xs bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">
                                                                                                    {t("page.storyMaker.voiceSearch.voiceReady")}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                        <p className="break-words whitespace-pre-wrap type-body-m text-on-surface">
                                                                                            {renderHighlighted(voiceLine.text, trimmedSearchQuery)}
                                                                                        </p>
                                                                                    </div>

                                                                                    {allVoiceRefs.length > 0 && (
                                                                                        <div className="space-y-1.5">
                                                                                            {allVoiceRefs.map(ref => {
                                                                                                const previewKey = `search:${chunkKey}:${voiceLine.lineIndex}:${ref.kind}:${ref.scenarioId}:${ref.voiceId}`;
                                                                                                const isPlaying = playing === previewKey;
                                                                                                const candidateUrls = storyVoiceCandidateUrls(ref, searchServer, line);
                                                                                                return (
                                                                                                    <div
                                                                                                        key={`${ref.kind}|${ref.scenarioId}|${ref.voiceId}`}
                                                                                                        className="flex min-w-0 flex-wrap items-center gap-1.5"
                                                                                                    >
                                                                                                        <IconButton
                                                                                                            size="xs"
                                                                                                            icon={isPlaying ? mdStopFill : mdPlayArrowFill}
                                                                                                            label={t(isPlaying ? "page.storyMaker.inspector.stopPreview" : "page.storyMaker.inspector.previewAudio")}
                                                                                                            onClick={() => toggleAudioPreview(previewKey, candidateUrls, ref.voiceId)}
                                                                                                        />
                                                                                                        <span className="min-w-0 flex-1 truncate font-mono type-label-s text-on-surface-variant">
                                                                                                            {ref.voiceId}
                                                                                                        </span>
                                                                                                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                                                                                            <Button
                                                                                                                size="xs"
                                                                                                                variant="tonal"
                                                                                                                icon={mdCheck}
                                                                                                                onClick={() => handleSelectVoice(ref, undefined, "search")}
                                                                                                            >
                                                                                                                {t("page.storyMaker.voiceSearch.useVoice")}
                                                                                                            </Button>
                                                                                                            <Button
                                                                                                                size="xs"
                                                                                                                variant="outlined"
                                                                                                                icon={mdChat}
                                                                                                                onClick={() => handleSelectVoice(ref, voiceLine.text, "search")}
                                                                                                            >
                                                                                                                {t("page.storyMaker.voiceSearch.useVoiceAndText")}
                                                                                                            </Button>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    )}
                                                                                </li>
                                                                            );
                                                                        })}
                                                                    </ul>
                                                                )
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {visibleSearchHits.length < activeSearchHits.length && (
                                            <LoadMore
                                                label={t("page.storyMaker.inspector.loadMoreAssets")}
                                                shown={visibleSearchHits.length}
                                                total={activeSearchHits.length}
                                                onLoadMore={() => setSearchVisibleCount(count => count + SEARCH_PAGE_SIZE)}
                                                className="mt-2"
                                            />
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <div className="min-w-0 space-y-3">
                        <SegmentedButton<BrowseVoiceKind>
                            density={-2}
                            value={browseKind}
                            onValueChange={(nextKind) => {
                                stopPreview();
                                setBrowseKind(nextKind);
                                setActiveScenario(null);
                                setScenarioQuery("");
                                setVoiceQuery("");
                                setVisibleCount(BROWSE_PAGE_SIZE);
                            }}
                            options={BROWSE_VOICE_KINDS.map(item => ({
                                value: item,
                                label: t(`page.storyMaker.voiceKind.${item}`),
                            }))}
                            aria-label={t("page.storyMaker.inspector.voiceKind")}
                        />

                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 truncate type-label-l text-on-surface-variant">
                                {t(activeScenario === null ? "page.storyMaker.inspector.voiceStepScenario" : "page.storyMaker.inspector.voiceStepFile")}
                                {" · "}
                                {t(`page.storyMaker.voiceKind.${browseKind}`)}
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
                                setVisibleCount(BROWSE_PAGE_SIZE);
                            }}
                            placeholder={t(activeScenario === null ? "page.storyMaker.inspector.voiceScenarioSearch" : "page.storyMaker.inspector.voiceFileSearch")}
                            icon={mdSearch}
                            clearable
                            aria-label={t(activeScenario === null ? "page.storyMaker.inspector.voiceScenarioSearch" : "page.storyMaker.inspector.voiceFileSearch")}
                        />

                        {activeBrowseState.status === "ready" && (
                            <p className="font-mono type-label-s text-on-surface-variant">
                                {t("page.storyMaker.inspector.assetCount", { shown: visibleBrowse.length, total: filteredBrowse.length })}
                            </p>
                        )}

                        {activeBrowseState.status === "loading" ? (
                            <LoadingState className="min-h-40" />
                        ) : activeBrowseState.status === "error" ? (
                            <ErrorState
                                title={t("page.storyMaker.inspector.voiceListFailed")}
                                message={activeBrowseState.message}
                                retryLabel={t("common.action.retry")}
                                onRetry={() => setAttempt(value => value + 1)}
                            />
                        ) : filteredBrowse.length === 0 ? (
                            <p className="py-8 text-center type-body-m text-on-surface-variant">
                                {t("page.storyMaker.inspector.voiceNoMatches")}
                            </p>
                        ) : (
                            <>
                                <ul className="divide-y divide-outline-variant/60">
                                    {activeScenario === null ? visibleBrowse.map(scenarioId => {
                                        const selected = browseKind === kind && scenarioId === currentScenarioId;
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
                                    }) : visibleBrowse.map(voiceId => {
                                        const selected = browseKind === kind && activeScenario === currentScenarioId && voiceId === currentVoiceId;
                                        const previewKey = `browse:${browseKind}:${activeScenario}:${voiceId}`;
                                        const isPlaying = playing === previewKey;
                                        const ref: StoryVoiceRef = { kind: browseKind, scenarioId: activeScenario, voiceId };
                                        return (
                                            <li key={voiceId} className="flex min-w-0 items-center gap-2 py-1">
                                                <button
                                                    type="button"
                                                    aria-pressed={selected}
                                                    onClick={() => handleSelectVoice(ref)}
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
                                                    onClick={() => toggleAudioPreview(
                                                        previewKey,
                                                        storyVoiceCandidateUrls(ref, region, line),
                                                        voiceId,
                                                    )}
                                                />
                                            </li>
                                        );
                                    })}
                                </ul>

                                {visibleBrowse.length < filteredBrowse.length && (
                                    <LoadMore
                                        label={t("page.storyMaker.inspector.loadMoreAssets")}
                                        shown={visibleBrowse.length}
                                        total={filteredBrowse.length}
                                        onLoadMore={() => setVisibleCount(count => count + BROWSE_PAGE_SIZE)}
                                        className="mt-2"
                                    />
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </Dialog>
    );
}
