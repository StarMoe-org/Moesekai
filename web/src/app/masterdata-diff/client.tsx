"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterSection, FilterButton } from "@/components/common/BaseFilters";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import ExternalLink from "@/components/ExternalLink";
import LocalizedLink from "@/components/LocalizedLink";
import AiSummaryCard from "@/components/masterdata-diff/AiSummaryCard";
import EntityHighlightsView from "@/components/masterdata-diff/EntityHighlightsView";
import FileDiffExplorer from "@/components/masterdata-diff/FileDiffExplorer";
import { useI18n } from "@/contexts/I18nContext";
import {
    fetchMasterdataCommitDiff,
    fetchMasterdataSummary,
    fetchMasterdataVersions,
} from "@/lib/masterdata-diff-api";
import {
    Button,
    Card,
    EmptyState,
    ErrorState,
    Icon,
    LoadingState,
    PageContainer,
    PageHeader,
    Surface,
} from "@/components/md3";
import {
    mdCompareArrows,
    mdDescription,
    mdHistory,
    mdLayers,
    mdOpenInNew,
    mdRefresh,
    mdSchedule,
} from "@/components/md3/icons";
import {
    MASTERDATA_DIFF_SERVERS,
    type MasterdataCommitDiffResponse,
    type MasterdataDiffServer,
    type MasterdataSummaryResponse,
    type MasterdataVersionItem,
} from "@/types/masterdataDiff";

const VERSIONS_PAGE_SIZE = 20;

function parseServerParam(raw: string | null): MasterdataDiffServer | null {
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower === "jp" || lower === "en" || lower === "cn") {
        return lower;
    }
    return null;
}

function MasterdataDiffContent() {
    const { t, locale, formatDate, formatNumber } = useI18n();

    // ==================== URL-synced state ====================
    const [server, setServer] = useState<MasterdataDiffServer>(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const fromQuery = parseServerParam(params.get("server"));
            if (fromQuery) return fromQuery;
            const saved = parseServerParam(localStorage.getItem("server-source"));
            if (saved) return saved;
        }
        return "jp";
    });

    const [selectedSha, setSelectedSha] = useState<string>(() => {
        if (typeof window !== "undefined") {
            return new URLSearchParams(window.location.search).get("sha") || "";
        }
        return "";
    });

    const [activeTab, setActiveTab] = useState<"overview" | "files">(() => {
        if (typeof window !== "undefined") {
            return new URLSearchParams(window.location.search).get("tab") === "files"
                ? "files"
                : "overview";
        }
        return "overview";
    });

    const [selectedFile, setSelectedFile] = useState<string>(() => {
        if (typeof window !== "undefined") {
            return new URLSearchParams(window.location.search).get("file") || "";
        }
        return "";
    });

    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("server", server);
        if (selectedSha) {
            url.searchParams.set("sha", selectedSha);
        } else {
            url.searchParams.delete("sha");
        }
        if (activeTab === "files") {
            url.searchParams.set("tab", "files");
            if (selectedFile) {
                url.searchParams.set("file", selectedFile);
            } else {
                url.searchParams.delete("file");
            }
        } else {
            url.searchParams.delete("tab");
            url.searchParams.delete("file");
        }
        window.history.replaceState({}, "", url.toString());
    }, [server, selectedSha, activeTab, selectedFile]);

    useEffect(() => {
        const onPopState = () => {
            const params = new URLSearchParams(window.location.search);
            const srv = parseServerParam(params.get("server"));
            if (srv) setServer(srv);
            setSelectedSha(params.get("sha") || "");
            setActiveTab(params.get("tab") === "files" ? "files" : "overview");
            setSelectedFile(params.get("file") || "");
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    // ==================== Versions timeline ====================
    const [versions, setVersions] = useState<MasterdataVersionItem[]>([]);
    const [versionsPage, setVersionsPage] = useState(1);
    const [hasMoreVersions, setHasMoreVersions] = useState(false);
    const [isVersionsLoading, setIsVersionsLoading] = useState(true);
    const [isLoadingMoreVersions, setIsLoadingMoreVersions] = useState(false);
    const [versionsError, setVersionsError] = useState<string | null>(null);

    const loadVersions = useCallback(async (srv: MasterdataDiffServer, signal?: AbortSignal) => {
        setIsVersionsLoading(true);
        setVersionsError(null);
        try {
            const data = await fetchMasterdataVersions(srv, 1, VERSIONS_PAGE_SIZE, signal);
            const items = data.items || [];
            setVersions(items);
            setVersionsPage(1);
            setHasMoreVersions(Boolean(data.hasMore));
            setSelectedSha((prev) => {
                if (prev) return prev;
                return items[0]?.sha || "";
            });
        } catch (err) {
            if ((err as Error)?.name === "AbortError") return;
            setVersionsError(err instanceof Error ? err.message : "Unknown error");
            setVersions([]);
            setHasMoreVersions(false);
        } finally {
            setIsVersionsLoading(false);
        }
    }, []);

    useEffect(() => {
        const ctrl = new AbortController();
        void loadVersions(server, ctrl.signal);
        return () => ctrl.abort();
    }, [server, loadVersions]);

    const handleLoadMoreVersions = async () => {
        if (!hasMoreVersions || isLoadingMoreVersions) return;
        setIsLoadingMoreVersions(true);
        try {
            const nextPage = versionsPage + 1;
            const data = await fetchMasterdataVersions(server, nextPage, VERSIONS_PAGE_SIZE);
            setVersions((prev) => [...prev, ...(data.items || [])]);
            setVersionsPage(nextPage);
            setHasMoreVersions(Boolean(data.hasMore));
        } catch (err) {
            setVersionsError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setIsLoadingMoreVersions(false);
        }
    };

    const handleServerChange = (nextServer: MasterdataDiffServer) => {
        if (nextServer === server) return;
        setServer(nextServer);
        setSelectedSha("");
        setSelectedFile("");
        setActiveTab("overview");
    };

    // ==================== Selected commit diff ====================
    const [commitDiff, setCommitDiff] = useState<MasterdataCommitDiffResponse | null>(null);
    const [isDiffLoading, setIsDiffLoading] = useState(false);
    const [diffError, setDiffError] = useState<string | null>(null);

    const loadCommitDiff = useCallback(
        async (srv: MasterdataDiffServer, sha: string, signal?: AbortSignal) => {
            if (!sha) {
                setCommitDiff(null);
                return;
            }
            setIsDiffLoading(true);
            setDiffError(null);
            try {
                const res = await fetchMasterdataCommitDiff(srv, sha, signal);
                setCommitDiff(res);
            } catch (err) {
                if ((err as Error)?.name === "AbortError") return;
                setDiffError(err instanceof Error ? err.message : "Unknown error");
                setCommitDiff(null);
            } finally {
                setIsDiffLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        const ctrl = new AbortController();
        void loadCommitDiff(server, selectedSha, ctrl.signal);
        return () => ctrl.abort();
    }, [server, selectedSha, loadCommitDiff]);

    // ==================== AI Summary ====================
    const [summary, setSummary] = useState<MasterdataSummaryResponse | null>(null);
    const [isSummaryLoading, setIsSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    const loadSummary = useCallback(
        async (srv: MasterdataDiffServer, sha: string, loc: string, signal?: AbortSignal) => {
            if (!sha) {
                setSummary(null);
                return;
            }
            setIsSummaryLoading(true);
            setSummaryError(null);
            try {
                const res = await fetchMasterdataSummary(srv, sha, loc, signal);
                setSummary(res);
            } catch (err) {
                if ((err as Error)?.name === "AbortError") return;
                setSummaryError(err instanceof Error ? err.message : "Unknown error");
                setSummary(null);
            } finally {
                setIsSummaryLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        const ctrl = new AbortController();
        void loadSummary(server, selectedSha, locale, ctrl.signal);
        return () => ctrl.abort();
    }, [server, selectedSha, locale, loadSummary]);

    const handleInspectFile = (filePath: string) => {
        setSelectedFile(filePath);
        setActiveTab("files");
    };

    const filterContent = (
        <BaseFilters
            title={t("page.masterdataDiff.filters.title")}
            hasActiveFilters={false}
            onReset={() => handleServerChange("jp")}
            totalCount={versions.length}
            filteredCount={versions.length}
            countUnit={t("page.masterdataDiff.filters.versionUnit")}
        >
            <FilterSection label={t("page.masterdataDiff.filters.server")}>
                <div className="flex flex-wrap gap-1.5">
                    {MASTERDATA_DIFF_SERVERS.map((srv) => (
                        <FilterButton
                            key={srv}
                            selected={server === srv}
                            onClick={() => handleServerChange(srv)}
                        >
                            <ServerRegionLabel server={srv} />
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>

            <FilterSection label={t("page.masterdataDiff.filters.versions")}>
                {isVersionsLoading ? (
                    <div className="py-4 text-center type-body-s text-on-surface-variant">
                        {t("common.state.loading")}
                    </div>
                ) : versionsError ? (
                    <div className="space-y-2 py-2">
                        <p className="type-body-s text-error">{versionsError}</p>
                        <Button
                            variant="tonal"
                            size="xs"
                            icon={mdRefresh}
                            onClick={() => void loadVersions(server)}
                        >
                            {t("common.action.retry")}
                        </Button>
                    </div>
                ) : versions.length === 0 ? (
                    <p className="py-2 type-body-s text-on-surface-variant">
                        {t("page.masterdataDiff.versions.empty")}
                    </p>
                ) : (
                    <div className="max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
                        {versions.map((v) => {
                            const active = v.sha === selectedSha;
                            return (
                                <button
                                    key={v.sha}
                                    type="button"
                                    onClick={() => {
                                        setSelectedSha(v.sha);
                                        setSelectedFile("");
                                    }}
                                    className={`w-full rounded-md3-m border px-3 py-2.5 text-left transition-colors state-layer focus-ring ${
                                        active
                                            ? "border-primary bg-primary-container text-on-primary-container"
                                            : "border-outline-variant/60 bg-surface-container-low text-on-surface"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono type-label-l truncate">
                                            v{v.dataVersion}
                                        </span>
                                        <span className="font-mono type-label-s opacity-75">
                                            {v.shortSha}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-1 type-label-s opacity-80">
                                        <Icon path={mdSchedule} size={13} />
                                        <span>
                                            {formatDate(new Date(v.committedAt), {
                                                year: "numeric",
                                                month: "2-digit",
                                                day: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}

                        {hasMoreVersions && (
                            <Button
                                variant="tonal"
                                size="xs"
                                className="w-full"
                                onClick={handleLoadMoreVersions}
                                disabled={isLoadingMoreVersions}
                            >
                                {isLoadingMoreVersions
                                    ? t("common.state.loading")
                                    : t("page.masterdataDiff.versions.loadMore")}
                            </Button>
                        )}
                    </div>
                )}
            </FilterSection>
        </BaseFilters>
    );

    return (
        <PageContainer>
            <PageHeader
                title={t("page.masterdataDiff.title")}
                description={t("page.masterdataDiff.subtitle")}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <LocalizedLink href={`/asset-versions?server=${server}`}>
                            <Button variant="tonal" size="s" icon={mdHistory}>
                                {t("page.masterdataDiff.actions.assetVersions")}
                            </Button>
                        </LocalizedLink>
                        <Button
                            variant="outlined"
                            size="s"
                            icon={mdRefresh}
                            onClick={() => void loadVersions(server)}
                        >
                            {t("common.action.refresh")}
                        </Button>
                    </div>
                }
            />

            <div className="grid gap-6 lg:grid-cols-[296px_minmax(0,1fr)] items-start">
                <aside className="lg:sticky lg:top-20">{filterContent}</aside>

                <main className="min-w-0 space-y-5">
                    {!selectedSha && !isVersionsLoading ? (
                        <EmptyState
                            icon={mdCompareArrows}
                            title={t("page.masterdataDiff.versions.selectPrompt")}
                        />
                    ) : isDiffLoading ? (
                        <LoadingState label={t("page.masterdataDiff.loadingDiff")} />
                    ) : diffError ? (
                        <ErrorState
                            title={t("page.masterdataDiff.loadDiffError")}
                            message={diffError}
                            onRetry={() => void loadCommitDiff(server, selectedSha)}
                        />
                    ) : commitDiff ? (
                        <>
                            {/* Version metadata summary card */}
                            <Card
                                variant="outlined"
                                className="border-outline-variant bg-surface-container-low p-5"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-1.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-md3-full bg-primary px-2.5 py-0.5 type-label-m text-on-primary">
                                                <ServerRegionLabel server={commitDiff.server} />
                                            </span>
                                            <h2 className="font-mono type-headline-s text-on-surface">
                                                v{commitDiff.dataVersion}
                                            </h2>
                                            <span className="rounded-md3-xs bg-surface-container-highest px-2 py-0.5 font-mono type-label-s text-on-surface-variant">
                                                {commitDiff.shortSha}
                                            </span>
                                        </div>
                                        <p className="type-body-s text-on-surface-variant">
                                            {commitDiff.commitMessage} ·{" "}
                                            {formatDate(new Date(commitDiff.committedAt), {
                                                year: "numeric",
                                                month: "2-digit",
                                                day: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </p>
                                    </div>

                                    {commitDiff.commitUrl && (
                                        <ExternalLink
                                            href={commitDiff.commitUrl}
                                            className="inline-flex items-center gap-1.5 rounded-md3-full border border-outline-variant bg-surface px-3.5 py-1.5 type-label-m text-on-surface state-layer focus-ring"
                                        >
                                            <span>{t("page.masterdataDiff.actions.viewOnGitHub")}</span>
                                            <Icon path={mdOpenInNew} size={15} />
                                        </ExternalLink>
                                    )}
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2.5">
                                    <Surface
                                        tone="high"
                                        className="rounded-md3-s px-3 py-1.5 type-label-m text-on-surface"
                                    >
                                        {t("page.masterdataDiff.stats.filesChanged", {
                                            count: formatNumber(commitDiff.stats.filesChanged),
                                        })}
                                    </Surface>
                                    <Surface
                                        tone="high"
                                        className="rounded-md3-s px-3 py-1.5 font-mono type-label-m text-primary"
                                    >
                                        +{formatNumber(commitDiff.stats.additions)}
                                    </Surface>
                                    <Surface
                                        tone="high"
                                        className="rounded-md3-s px-3 py-1.5 font-mono type-label-m text-error"
                                    >
                                        -{formatNumber(commitDiff.stats.deletions)}
                                    </Surface>
                                </div>
                            </Card>

                            {/* AI Summary */}
                            <AiSummaryCard
                                summary={summary}
                                isLoading={isSummaryLoading}
                                error={summaryError}
                                onRetry={() => void loadSummary(server, selectedSha, locale)}
                            />

                            {/* Dual-view switcher */}
                            <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant pb-3">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("overview")}
                                    className={`inline-flex items-center gap-2 rounded-md3-full px-4 py-2 type-label-l transition-colors state-layer focus-ring ${
                                        activeTab === "overview"
                                            ? "bg-secondary-container text-on-secondary-container"
                                            : "bg-surface-container-low text-on-surface-variant"
                                    }`}
                                >
                                    <Icon path={mdLayers} size={18} />
                                    <span>
                                        {t("page.masterdataDiff.tabs.entities", {
                                            count: commitDiff.entityGroups.length,
                                        })}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("files")}
                                    className={`inline-flex items-center gap-2 rounded-md3-full px-4 py-2 type-label-l transition-colors state-layer focus-ring ${
                                        activeTab === "files"
                                            ? "bg-secondary-container text-on-secondary-container"
                                            : "bg-surface-container-low text-on-surface-variant"
                                    }`}
                                >
                                    <Icon path={mdDescription} size={18} />
                                    <span>
                                        {t("page.masterdataDiff.tabs.files", {
                                            count: commitDiff.files.length,
                                        })}
                                    </span>
                                </button>
                            </div>

                            {activeTab === "overview" ? (
                                <EntityHighlightsView
                                    server={commitDiff.server}
                                    groups={commitDiff.entityGroups}
                                    onInspectFile={handleInspectFile}
                                />
                            ) : (
                                <FileDiffExplorer
                                    server={commitDiff.server}
                                    sha={commitDiff.sha}
                                    files={commitDiff.files}
                                    selectedFile={selectedFile}
                                    onSelectFile={setSelectedFile}
                                />
                            )}
                        </>
                    ) : null}
                </main>
            </div>
        </PageContainer>
    );
}

export default function MasterdataDiffClient() {
    const { t } = useI18n();
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState label={t("common.state.loading")} />}>
                <MasterdataDiffContent />
            </Suspense>
        </MainLayout>
    );
}
