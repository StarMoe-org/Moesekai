"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterButton, FilterSection, FilterToggle } from "@/components/common/BaseFilters";
import CharacterFilter from "@/components/common/CharacterFilter";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import {
    Banner,
    Button,
    Chip,
    EmptyState,
    Icon,
    IconButton,
    LinearProgress,
    LoadMore,
    LoadingState,
    PageContainer,
    PageHeader,
    SectionCard,
    SegmentedButton,
    TextField,
    Tooltip,
    cn,
} from "@/components/md3";
import {
    mdDelete,
    mdDownload,
    mdInfo,
    mdMatchCase,
    mdRefresh,
    mdRegularExpression,
    mdSearch,
    mdWandStars,
} from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import { StorySearchWorkerClient } from "@/lib/story-search/client";
import { loadStoryLinkLookup, type StoryLinkLookup } from "@/lib/story-search/links";
import {
    STORY_CHUNK_TYPES,
    STORY_SEARCH_SERVERS,
    type CorpusLoadProgress,
    type CorpusStatusInfo,
    type SemanticSearchApiResponse,
    type StoryChunk,
    type StoryChunkType,
    type StoryResultView,
    type StorySearchHit,
    type StorySearchMode,
    type StorySearchServer,
    type StorySearchStatusResponse,
} from "@/lib/story-search/types";
import ResultCard from "./_components/ResultCard";
import TurnstileWidget from "./_components/TurnstileWidget";

const TOP_K_OPTIONS = [10, 20, 40, 60] as const;
const LOCAL_RESULT_LIMIT = 300;

function parseServerParam(raw: string | null): StorySearchServer | null {
    if (raw === "cn" || raw === "jp") return raw;
    return null;
}

function parseModeParam(raw: string | null): StorySearchMode | null {
    if (raw === "local" || raw === "semantic") return raw;
    return null;
}

function parseViewParam(raw: string | null): StoryResultView {
    return raw === "brief" ? "brief" : "detailed";
}

function parseTypeParam(raw: string | null): StoryChunkType | "all" {
    if (raw && (STORY_CHUNK_TYPES as readonly string[]).includes(raw)) {
        return raw as StoryChunkType;
    }
    return "all";
}

function parseCharsParam(raw: string | null): number[] {
    if (!raw) return [];
    return raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 26);
}

export default function StorySearchClient() {
    const searchParams = useSearchParams();
    const { t } = useI18n();
    const { serverSource, hasHydratedThemeSettings } = useTheme();

    const [mode, setMode] = useState<StorySearchMode>("local");
    const [resultView, setResultView] = useState<StoryResultView>("detailed");
    const [server, setServer] = useState<StorySearchServer>("cn");
    const [query, setQuery] = useState("");
    const [submittedSemanticQuery, setSubmittedSemanticQuery] = useState("");
    const [isRegex, setIsRegex] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [storyType, setStoryType] = useState<StoryChunkType | "all">("all");
    const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [topK, setTopK] = useState<number>(20);
    const [urlInitialized, setUrlInitialized] = useState(false);

    // Worker & corpus state
    const workerRef = useRef<StorySearchWorkerClient | null>(null);
    const [corpusByServer, setCorpusByServer] = useState<Partial<Record<StorySearchServer, CorpusStatusInfo>>>({});
    const [corpusProgress, setCorpusProgress] = useState<CorpusLoadProgress | null>(null);
    const [linkLookup, setLinkLookup] = useState<StoryLinkLookup | null>(null);

    // Search result state
    const [localHits, setLocalHits] = useState<StorySearchHit[]>([]);
    const [localTotalMatches, setLocalTotalMatches] = useState(0);
    const [localSearchMs, setLocalSearchMs] = useState<number | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);
    const [isLocalSearching, setIsLocalSearching] = useState(false);

    const [semanticHits, setSemanticHits] = useState<StorySearchHit[]>([]);
    const [semanticLatencyMs, setSemanticLatencyMs] = useState<number | null>(null);
    const [semanticCached, setSemanticCached] = useState(false);
    const [semanticError, setSemanticError] = useState<string | null>(null);
    const [isSemanticSearching, setIsSemanticSearching] = useState(false);

    // Turnstile / session state
    const [turnstileToken, setTurnstileToken] = useState("");
    const [turnstileResetSeed, setTurnstileResetSeed] = useState(0);
    const [turnstileRequired, setTurnstileRequired] = useState(true);
    const [sessionActive, setSessionActive] = useState(false);

    const activeCorpus = corpusByServer[server] ?? null;
    const isCorpusBusy =
        corpusProgress?.server === server
        && (corpusProgress.phase === "checking"
            || corpusProgress.phase === "downloading"
            || corpusProgress.phase === "decompressing");

    const activeHits = mode === "local" ? localHits : semanticHits;
    const isSearching = mode === "local" ? isLocalSearching : isSemanticSearching;

    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "story-search",
        defaultDisplayCount: 30,
        increment: 30,
        isReady: !isSearching && !isCorpusBusy,
    });

    // Initialize worker once
    useEffect(() => {
        const client = new StorySearchWorkerClient();
        workerRef.current = client;
        return () => {
            client.dispose();
            workerRef.current = null;
        };
    }, []);

    // Hydrate initial state from URL params and user's server setting
    useEffect(() => {
        if (!hasHydratedThemeSettings || urlInitialized) return;

        const urlMode = parseModeParam(searchParams.get("mode"));
        const urlServer = parseServerParam(searchParams.get("server"));
        const urlQ = searchParams.get("q");
        const urlRegex = searchParams.get("regex");
        const urlCase = searchParams.get("case");
        const urlType = parseTypeParam(searchParams.get("type"));
        const urlChars = parseCharsParam(searchParams.get("chars"));
        const urlView = parseViewParam(searchParams.get("view"));

        if (urlMode) setMode(urlMode);
        setResultView(urlView);
        if (urlServer) {
            setServer(urlServer);
        } else if (serverSource === "jp") {
            setServer("jp");
        } else {
            setServer("cn");
        }
        if (urlQ !== null) setQuery(urlQ);
        if (urlRegex === "1" || urlRegex === "true") setIsRegex(true);
        if (urlCase === "1" || urlCase === "true") setCaseSensitive(true);
        setStoryType(urlType);
        if (urlChars.length > 0) setSelectedCharacters(urlChars);

        setUrlInitialized(true);
    }, [hasHydratedThemeSettings, searchParams, serverSource, urlInitialized]);

    // Sync filter state to URL query params via window.history.replaceState wrapper
    useEffect(() => {
        if (!urlInitialized) return;
        const params = new URLSearchParams();
        if (mode !== "local") params.set("mode", mode);
        params.set("server", server);
        if (query.trim()) params.set("q", query);
        if (isRegex) params.set("regex", "1");
        if (caseSensitive) params.set("case", "1");
        if (storyType !== "all") params.set("type", storyType);
        if (selectedCharacters.length > 0) params.set("chars", selectedCharacters.join(","));
        if (resultView !== "detailed") params.set("view", resultView);
        replaceCurrentUrlSearchParams(params);
    }, [mode, server, query, isRegex, caseSensitive, storyType, selectedCharacters, resultView, urlInitialized]);

    // Load masterdata link lookup for `/story/...` and `/story-player` URLs
    useEffect(() => {
        if (!urlInitialized) return;
        let cancelled = false;
        loadStoryLinkLookup(server)
            .then((lookup) => {
                if (!cancelled) setLinkLookup(lookup);
            })
            .catch(() => {
                if (!cancelled) setLinkLookup(null);
            });
        return () => {
            cancelled = true;
        };
    }, [server, urlInitialized]);

    const loadCorpusForServer = useCallback(async (targetServer: StorySearchServer, forceRefresh = false) => {
        const client = workerRef.current;
        if (!client) return null;

        setCorpusProgress({ phase: "checking", server: targetServer });
        try {
            const info = await client.loadCorpus(targetServer, {
                forceRefresh,
                onProgress: (progress) => setCorpusProgress(progress),
            });
            setCorpusByServer((prev) => ({ ...prev, [targetServer]: info }));
            setCorpusProgress({ phase: "ready", server: targetServer, info });
            return info;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setCorpusProgress({ phase: "error", server: targetServer, error: message });
            return null;
        }
    }, []);

    // Auto-load corpus in local mode when server changes
    useEffect(() => {
        if (!urlInitialized || mode !== "local") return;
        if (corpusByServer[server]) return;
        void loadCorpusForServer(server, false);
    }, [urlInitialized, mode, server, corpusByServer, loadCorpusForServer]);

    // Check semantic API session/Turnstile status when switching to semantic mode
    useEffect(() => {
        if (!urlInitialized || mode !== "semantic") return;
        let cancelled = false;
        fetch("/api/story-search/status", { credentials: "include" })
            .then(async (res) => {
                if (!res.ok) return null;
                return (await res.json()) as StorySearchStatusResponse;
            })
            .then((data) => {
                if (cancelled || !data) return;
                if (typeof data.turnstile_required === "boolean") {
                    setTurnstileRequired(data.turnstile_required);
                }
                const isSessionValid = data.session_valid ?? data.session_active;
                if (typeof isSessionValid === "boolean") {
                    setSessionActive(isSessionValid);
                }
            })
            .catch(() => {
                // Ignore status probe error; search endpoint enforces auth cleanly.
            });
        return () => {
            cancelled = true;
        };
    }, [urlInitialized, mode]);

    // Hydrate semantic hits with full text once local corpus becomes available
    useEffect(() => {
        const client = workerRef.current;
        if (!client || !activeCorpus || semanticHits.length === 0) return;
        const missingIds = semanticHits
            .filter((h) => h.chunk.server === server && !h.chunk.text)
            .map((h) => h.chunk.id);
        if (missingIds.length === 0) return;

        let cancelled = false;
        client.lookupChunks(server, missingIds)
            .then((map) => {
                if (cancelled) return;
                setSemanticHits((prev) => prev.map((hit) => {
                    const localChunk = map[hit.chunk.id];
                    if (!localChunk || hit.chunk.server !== server) return hit;
                    return { ...hit, chunk: { ...hit.chunk, text: localChunk.text, chars: localChunk.chars } };
                }));
            })
            .catch(() => {
                // Non-fatal
            });
        return () => {
            cancelled = true;
        };
    }, [activeCorpus, semanticHits, server]);

    // Run local keyword / regex search reactively in worker
    useEffect(() => {
        if (!urlInitialized || mode !== "local") return;
        const client = workerRef.current;
        if (!client || !activeCorpus) return;

        const trimmed = query.trim();
        const hasFilters = storyType !== "all" || selectedCharacters.length > 0;
        if (!trimmed && !hasFilters) {
            setLocalHits([]);
            setLocalTotalMatches(0);
            setLocalSearchMs(null);
            setLocalError(null);
            return;
        }

        if (isRegex && trimmed) {
            try {
                new RegExp(trimmed, caseSensitive ? "gm" : "igm");
            } catch (err) {
                setLocalError(
                    t("page.storySearch.search.regexInvalid", {
                        message: err instanceof Error ? err.message : String(err),
                    }),
                );
                return;
            }
        }

        let cancelled = false;
        const timer = setTimeout(() => {
            setIsLocalSearching(true);
            setLocalError(null);
            client.searchLocal({
                server,
                query: trimmed,
                isRegex,
                caseSensitive,
                type: storyType,
                charIds: selectedCharacters,
                limit: LOCAL_RESULT_LIMIT,
            })
                .then((res) => {
                    if (cancelled) return;
                    setLocalHits(res.hits);
                    setLocalTotalMatches(res.totalMatches);
                    setLocalSearchMs(res.searchMs);
                })
                .catch((err) => {
                    if (cancelled) return;
                    setLocalError(err instanceof Error ? err.message : String(err));
                })
                .finally(() => {
                    if (!cancelled) setIsLocalSearching(false);
                });
        }, 120);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [
        urlInitialized,
        mode,
        activeCorpus,
        server,
        query,
        isRegex,
        caseSensitive,
        storyType,
        selectedCharacters,
        t,
    ]);

    const handleSemanticSearch = useCallback(async (event?: FormEvent) => {
        event?.preventDefault();
        const trimmed = query.trim();
        if (!trimmed) {
            setSemanticError(t("page.storySearch.search.emptyPrompt"));
            return;
        }

        if (turnstileRequired && !sessionActive && !turnstileToken) {
            setSemanticError(t("page.storySearch.turnstile.requiredError"));
            return;
        }

        setIsSemanticSearching(true);
        setSemanticError(null);
        resetDisplayCount();

        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (turnstileToken) {
                headers["CF-Turnstile-Response"] = turnstileToken;
            }

            const resp = await fetch("/api/story-search/search", {
                method: "POST",
                credentials: "include",
                headers,
                body: JSON.stringify({
                    query: trimmed,
                    server,
                    type: storyType === "all" ? undefined : storyType,
                    charIds: selectedCharacters.length > 0 ? selectedCharacters : undefined,
                    topK,
                    turnstileToken: turnstileToken || undefined,
                }),
            });

            const data = (await resp.json().catch(() => null)) as SemanticSearchApiResponse | null;

            if (resp.status === 401 || resp.status === 403) {
                setSessionActive(false);
                setTurnstileToken("");
                setTurnstileResetSeed((s) => s + 1);
                throw new Error(t("page.storySearch.errors.turnstileInvalid"));
            }
            if (resp.status === 429) {
                throw new Error(t("page.storySearch.errors.rateLimited"));
            }
            if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
                throw new Error(t("page.storySearch.errors.serviceUnavailable"));
            }
            if (!resp.ok || !data) {
                const detail = data?.message || data?.error || `${resp.status} ${resp.statusText}`;
                throw new Error(t("page.storySearch.errors.requestFailed", { message: detail }));
            }

            if (turnstileRequired) {
                const hasRemaining = typeof data.session_remaining !== "number" || data.session_remaining > 0;
                setSessionActive(hasRemaining);
            }
            setTurnstileToken("");

            const rawResults = Array.isArray(data.results) ? data.results : [];
            let chunkMap: Record<number, StoryChunk> = {};
            if (workerRef.current && corpusByServer[server] && rawResults.length > 0) {
                chunkMap = await workerRef.current
                    .lookupChunks(server, rawResults.map((r) => r.id))
                    .catch(() => ({}));
            }

            const mapped: StorySearchHit[] = rawResults.map((r) => {
                const localChunk = chunkMap[r.id];
                const chunk: StoryChunk = {
                    id: r.id,
                    server: r.server ?? server,
                    type: r.type,
                    story_id: r.story_id,
                    story: r.story,
                    ep: r.ep,
                    scenario_id: r.scenario_id,
                    chars: localChunk?.chars ?? r.chars ?? [],
                    char_ids: r.char_ids,
                    line_start: r.line_start,
                    line_end: r.line_end,
                    text: r.text ?? localChunk?.text,
                };
                return { chunk, score: r.score };
            });

            setSemanticHits(mapped);
            setSubmittedSemanticQuery(trimmed);
            setSemanticLatencyMs(typeof data.latency_ms === "number" ? data.latency_ms : null);
            setSemanticCached(Boolean(data.cached));
        } catch (err) {
            setSemanticError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSemanticSearching(false);
        }
    }, [
        query,
        turnstileRequired,
        sessionActive,
        turnstileToken,
        server,
        storyType,
        selectedCharacters,
        topK,
        corpusByServer,
        resetDisplayCount,
        t,
    ]);

    const handleClearCache = useCallback(async () => {
        const client = workerRef.current;
        if (!client) return;
        await client.clearCache(server);
        setCorpusByServer((prev) => {
            const next = { ...prev };
            delete next[server];
            return next;
        });
        setCorpusProgress(null);
        if (mode === "local") {
            void loadCorpusForServer(server, true);
        }
    }, [server, mode, loadCorpusForServer]);

    const handleResetFilters = useCallback(() => {
        setQuery("");
        setIsRegex(false);
        setCaseSensitive(false);
        setStoryType("all");
        setSelectedCharacters([]);
        setSelectedUnitIds([]);
        setTopK(20);
        resetDisplayCount();
    }, [resetDisplayCount]);

    const hasActiveFilters = Boolean(
        query.trim()
        || isRegex
        || caseSensitive
        || storyType !== "all"
        || selectedCharacters.length > 0,
    );

    const quickFilterContent = (
        <BaseFilters
            variant="plain"
            title={t("common.filter.title")}
            filteredCount={mode === "local" ? localTotalMatches : semanticHits.length}
            totalCount={mode === "local" ? (activeCorpus?.chunkCount ?? localTotalMatches) : semanticHits.length}
            countUnit={t("page.storySearch.filters.countUnit")}
            searchQuery={query}
            onSearchChange={(val) => {
                setQuery(val);
                resetDisplayCount();
            }}
            searchPlaceholder={
                mode === "local"
                    ? t("page.storySearch.search.localPlaceholder")
                    : t("page.storySearch.search.semanticPlaceholder")
            }
            hasActiveFilters={hasActiveFilters}
            onReset={handleResetFilters}
        >
            <FilterSection label={t("page.storySearch.filters.storyType")}>
                <div className="flex flex-wrap gap-2">
                    <FilterButton
                        selected={storyType === "all"}
                        onClick={() => {
                            setStoryType("all");
                            resetDisplayCount();
                        }}
                    >
                        {t("page.storySearch.filters.allTypes")}
                    </FilterButton>
                    {STORY_CHUNK_TYPES.map((typeOption) => (
                        <FilterButton
                            key={typeOption}
                            selected={storyType === typeOption}
                            onClick={() => {
                                setStoryType(typeOption);
                                resetDisplayCount();
                            }}
                        >
                            {t(`page.storySearch.filters.types.${typeOption}`)}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>

            {mode === "local" ? (
                <FilterSection label={t("page.storySearch.modes.localLabel")}>
                    <div className="space-y-1">
                        <FilterToggle
                            selected={isRegex}
                            onClick={() => {
                                setIsRegex((v) => !v);
                                resetDisplayCount();
                            }}
                            label={t("page.storySearch.search.regexToggle")}
                        />
                        <FilterToggle
                            selected={caseSensitive}
                            onClick={() => {
                                setCaseSensitive((v) => !v);
                                resetDisplayCount();
                            }}
                            label={t("page.storySearch.search.caseSensitive")}
                        />
                    </div>
                </FilterSection>
            ) : (
                <FilterSection label={t("page.storySearch.filters.topK")}>
                    <div className="flex flex-wrap gap-2">
                        {TOP_K_OPTIONS.map((k) => (
                            <FilterButton
                                key={k}
                                selected={topK === k}
                                onClick={() => setTopK(k)}
                            >
                                {k}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>
            )}

            <CharacterFilter
                selectedCharacters={selectedCharacters}
                onCharacterChange={(chars) => {
                    setSelectedCharacters(chars);
                    resetDisplayCount();
                }}
                selectedUnitIds={selectedUnitIds}
                onUnitIdsChange={setSelectedUnitIds}
                characterLabel={t("page.storySearch.filters.character")}
            />
        </BaseFilters>
    );

    useQuickFilter(t("common.filter.title"), quickFilterContent, [
        mode,
        query,
        isRegex,
        caseSensitive,
        storyType,
        selectedCharacters,
        selectedUnitIds,
        topK,
        localTotalMatches,
        semanticHits.length,
        activeCorpus?.chunkCount,
    ]);

    const displayedHits = useMemo(
        () => activeHits.slice(0, displayCount),
        [activeHits, displayCount],
    );

    const hasMissingSemanticContext =
        mode === "semantic"
        && semanticHits.length > 0
        && !activeCorpus
        && semanticHits.some((h) => !h.chunk.text);

    const downloadProgressRatio =
        corpusProgress?.phase === "downloading"
        && corpusProgress.totalBytes
        && corpusProgress.totalBytes > 0
        && corpusProgress.loadedBytes !== undefined
            ? Math.min(1, corpusProgress.loadedBytes / corpusProgress.totalBytes)
            : undefined;

    return (
        <MainLayout>
            <PageContainer>
                <PageHeader
                    eyebrow={t("page.storySearch.badge")}
                    title={t("page.storySearch.title")}
                    highlight={t("page.storySearch.titleHighlight")}
                    description={t("page.storySearch.description")}
                />

                {/* Mode & Server Controls */}
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <SegmentedButton
                        className="w-full shrink-0 sm:w-auto"
                        value={mode}
                        onValueChange={(nextMode) => {
                            setMode(nextMode);
                            resetDisplayCount();
                        }}
                        options={[
                            {
                                value: "local",
                                label: t("page.storySearch.modes.localLabel"),
                                icon: mdSearch,
                            },
                            {
                                value: "semantic",
                                label: t("page.storySearch.modes.semanticLabel"),
                                icon: mdWandStars,
                            },
                        ]}
                    />

                    <div className="flex flex-wrap items-center gap-2">
                        {STORY_SEARCH_SERVERS.map((srv) => (
                            <Chip
                                key={srv}
                                selected={server === srv}
                                onClick={() => {
                                    setServer(srv);
                                    resetDisplayCount();
                                }}
                            >
                                <ServerRegionLabel server={srv} size={16} />
                            </Chip>
                        ))}
                        {!activeCorpus && !isCorpusBusy && mode === "semantic" && (
                            <Tooltip label={t("page.storySearch.corpus.loadNow")}>
                                <IconButton
                                    icon={mdDownload}
                                    label={t("page.storySearch.corpus.loadNow")}
                                    variant="outlined"
                                    size="xs"
                                    onClick={() => void loadCorpusForServer(server, false)}
                                />
                            </Tooltip>
                        )}
                        {activeCorpus && (
                            <Tooltip label={t("common.action.refresh")}>
                                <IconButton
                                    icon={mdRefresh}
                                    label={t("common.action.refresh")}
                                    variant="standard"
                                    size="xs"
                                    disabled={isCorpusBusy}
                                    onClick={() => void loadCorpusForServer(server, true)}
                                />
                            </Tooltip>
                        )}
                        <Tooltip label={t("page.storySearch.corpus.refreshCache")}>
                            <IconButton
                                icon={mdDelete}
                                label={t("page.storySearch.corpus.refreshCache")}
                                variant="standard"
                                size="xs"
                                disabled={isCorpusBusy}
                                onClick={() => void handleClearCache()}
                            />
                        </Tooltip>
                    </div>
                </div>

                {/* Search Card */}
                <SectionCard className="mb-5">
                    <form
                        onSubmit={(e) => {
                            if (mode === "semantic") {
                                void handleSemanticSearch(e);
                            } else {
                                e.preventDefault();
                            }
                        }}
                        className="flex items-center gap-2"
                    >
                        <div className="min-w-0 flex-1">
                            <TextField
                                variant="outlined"
                                icon={mode === "local" ? mdSearch : mdWandStars}
                                clearable
                                value={query}
                                onValueChange={(next) => {
                                    setQuery(next);
                                    if (mode === "local") resetDisplayCount();
                                }}
                                placeholder={
                                    mode === "local"
                                        ? t("page.storySearch.search.localPlaceholder")
                                        : t("page.storySearch.search.semanticPlaceholder")
                                }
                            />
                        </div>

                        {mode === "local" ? (
                            <div className="flex shrink-0 items-center gap-1.5">
                                <Tooltip label={t("page.storySearch.search.caseSensitive")}>
                                    <IconButton
                                        icon={mdMatchCase}
                                        label={t("page.storySearch.search.caseSensitive")}
                                        variant="outlined"
                                        size="s"
                                        selected={caseSensitive}
                                        className={cn(
                                            caseSensitive
                                                ? "border-transparent bg-primary-container text-on-primary-container"
                                                : "border-outline-variant bg-surface-container-high text-on-surface-variant",
                                        )}
                                        onClick={() => {
                                            setCaseSensitive((v) => !v);
                                            resetDisplayCount();
                                        }}
                                    />
                                </Tooltip>
                                <Tooltip label={t("page.storySearch.search.regexToggle")}>
                                    <IconButton
                                        icon={mdRegularExpression}
                                        label={t("page.storySearch.search.regexToggle")}
                                        variant="outlined"
                                        size="s"
                                        selected={isRegex}
                                        className={cn(
                                            isRegex
                                                ? "border-transparent bg-primary-container text-on-primary-container"
                                                : "border-outline-variant bg-surface-container-high text-on-surface-variant",
                                        )}
                                        onClick={() => {
                                            setIsRegex((v) => !v);
                                            resetDisplayCount();
                                        }}
                                    />
                                </Tooltip>
                            </div>
                        ) : (
                            <Button
                                type="submit"
                                variant="filled"
                                size="s"
                                icon={mdWandStars}
                                disabled={
                                    isSemanticSearching
                                    || !query.trim()
                                    || (turnstileRequired && !sessionActive && !turnstileToken)
                                }
                                className="shrink-0"
                            >
                                {isSemanticSearching
                                    ? t("page.storySearch.search.searching")
                                    : t("page.storySearch.search.submit")}
                            </Button>
                        )}
                    </form>

                    {mode === "semantic" && (
                        <div className="mt-3 flex flex-col gap-3 border-t border-outline-variant/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2 type-body-s text-on-surface-variant">
                                <Icon path={mdInfo} size={16} className="shrink-0 text-primary" />
                                <span>{t("page.storySearch.modelAttribution")}</span>
                            </div>

                            {turnstileRequired && !sessionActive && (
                                <div className="shrink-0">
                                    <TurnstileWidget
                                        sessionActive={sessionActive}
                                        resetSeed={turnstileResetSeed}
                                        onToken={setTurnstileToken}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {isCorpusBusy && (
                        <div className="mt-3">
                            <LinearProgress value={downloadProgressRatio} wavy={downloadProgressRatio !== undefined} />
                        </div>
                    )}
                </SectionCard>

                {/* Error Banners */}
                {corpusProgress?.phase === "error" && corpusProgress.server === server && corpusProgress.error && (
                    <Banner tone="error" className="mb-4">
                        {t("page.storySearch.corpus.errorPrefix", { message: corpusProgress.error })}
                    </Banner>
                )}

                {mode === "local" && localError && (
                    <Banner tone="error" className="mb-4">
                        {localError}
                    </Banner>
                )}

                {mode === "semantic" && semanticError && (
                    <Banner tone="error" className="mb-4">
                        {semanticError}
                    </Banner>
                )}

                {hasMissingSemanticContext && (
                    <Banner
                        tone="info"
                        className="mb-4"
                        action={
                            <Button
                                variant="tonal"
                                size="s"
                                icon={mdDownload}
                                disabled={isCorpusBusy}
                                onClick={() => void loadCorpusForServer(server, false)}
                            >
                                {t("page.storySearch.corpus.loadForContext")}
                            </Button>
                        }
                    >
                        {t("page.storySearch.corpus.contextHint")}
                    </Banner>
                )}

                {/* Loading state */}
                {(isSearching || (mode === "local" && isCorpusBusy && !activeCorpus)) && (
                    <LoadingState
                        label={
                            mode === "semantic"
                                ? t("page.storySearch.search.searching")
                                : t("common.state.loading")
                        }
                    />
                )}

                {/* Results Toolbar (Summary + Detailed / Brief View Toggle) */}
                {!isSearching && activeHits.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                        <div className="flex flex-wrap items-center gap-2 type-label-l text-on-surface-variant">
                            {mode === "local" ? (
                                <span>
                                    {t("page.storySearch.results.summaryLocal", {
                                        total: localTotalMatches.toLocaleString(),
                                        ms: localSearchMs !== null ? localSearchMs.toFixed(1) : "0",
                                    })}
                                </span>
                            ) : (
                                <>
                                    <span>
                                        {t("page.storySearch.results.summarySemantic", {
                                            total: semanticHits.length,
                                            ms: semanticLatencyMs !== null ? semanticLatencyMs.toFixed(1) : "0",
                                        })}
                                    </span>
                                    {semanticCached && (
                                        <span className="rounded-md3-xs bg-secondary-container px-2 py-0.5 type-label-s text-on-secondary-container">
                                            {t("page.storySearch.results.cachedBadge")}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>

                        <SegmentedButton
                            className="w-auto"
                            density={-2}
                            value={resultView}
                            onValueChange={setResultView}
                            options={[
                                { value: "detailed", label: t("page.storySearch.results.viewDetailed") },
                                { value: "brief", label: t("page.storySearch.results.viewBrief") },
                            ]}
                        />
                    </div>
                )}

                {/* Results List */}
                {!isSearching && displayedHits.length > 0 && (
                    <div className={resultView === "brief" ? "space-y-2" : "space-y-3"}>
                        {displayedHits.map((hit) => (
                            <ResultCard
                                key={`${hit.chunk.server}-${hit.chunk.id}`}
                                hit={hit}
                                mode={mode}
                                resultView={resultView}
                                selectedCharacters={selectedCharacters}
                                highlightQuery={mode === "local" ? query : submittedSemanticQuery}
                                isRegex={isRegex}
                                caseSensitive={caseSensitive}
                                lookup={linkLookup}
                            />
                        ))}
                    </div>
                )}

                {/* Empty / Prompt States */}
                {!isSearching && !isCorpusBusy && activeHits.length === 0 && (
                    mode === "local" && activeCorpus && !query.trim() && storyType === "all" && selectedCharacters.length === 0 ? (
                        <EmptyState title={t("page.storySearch.search.emptyPrompt")} />
                    ) : mode === "semantic" && !submittedSemanticQuery ? (
                        <EmptyState title={t("page.storySearch.search.emptyPrompt")} />
                    ) : (
                        <EmptyState
                            title={t("page.storySearch.results.emptyTitle")}
                            description={t("page.storySearch.results.emptyHint")}
                        />
                    )
                )}

                <LoadMore
                    label={t("page.storySearch.results.loadMore")}
                    shown={displayedHits.length}
                    total={activeHits.length}
                    onLoadMore={loadMore}
                />
            </PageContainer>
        </MainLayout>
    );
}
