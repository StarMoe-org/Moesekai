"use client";

import { useCallback, useEffect, useState } from "react";
import ExternalLink from "@/components/ExternalLink";
import AiSummaryCard from "@/components/masterdata-diff/AiSummaryCard";
import EntityHighlightsView from "@/components/masterdata-diff/EntityHighlightsView";
import FileDiffExplorer from "@/components/masterdata-diff/FileDiffExplorer";
import { useI18n } from "@/contexts/I18nContext";
import {
    fetchMasterdataCommitDiff,
    fetchMasterdataSummary,
} from "@/lib/masterdata-diff-api";
import {
    ErrorState,
    Icon,
    LoadingState,
    Surface,
    Tabs,
} from "@/components/md3";
import {
    mdDescription,
    mdLayers,
    mdOpenInNew,
    mdSchedule,
} from "@/components/md3/icons";
import type {
    MasterdataCommitDiffResponse,
    MasterdataDiffServer,
    MasterdataSummaryResponse,
    MasterdataVersionItem,
} from "@/types/masterdataDiff";

interface MasterdataUpdateSectionProps {
    server: MasterdataDiffServer;
    versionItem: MasterdataVersionItem;
    activeTab: "overview" | "files";
    onTabChange: (tab: "overview" | "files") => void;
    selectedFile: string;
    onSelectFile: (filePath: string) => void;
}

export default function MasterdataUpdateSection({
    server,
    versionItem,
    activeTab,
    onTabChange,
    selectedFile,
    onSelectFile,
}: MasterdataUpdateSectionProps) {
    const { t, locale, formatDate, formatNumber } = useI18n();

    const [commitDiff, setCommitDiff] = useState<MasterdataCommitDiffResponse | null>(null);
    const [isDiffLoading, setIsDiffLoading] = useState(true);
    const [diffError, setDiffError] = useState<string | null>(null);

    const [summary, setSummary] = useState<MasterdataSummaryResponse | null>(null);
    const [isSummaryLoading, setIsSummaryLoading] = useState(true);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    const loadDiff = useCallback(
        async (srv: MasterdataDiffServer, sha: string, signal?: AbortSignal) => {
            setIsDiffLoading(true);
            setDiffError(null);
            try {
                const res = await fetchMasterdataCommitDiff(srv, sha, signal);
                setCommitDiff(res);
            } catch (err) {
                if ((err as Error).name === "AbortError") return;
                setCommitDiff(null);
                setDiffError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!signal?.aborted) {
                    setIsDiffLoading(false);
                }
            }
        },
        [],
    );

    const loadSummary = useCallback(
        async (srv: MasterdataDiffServer, sha: string, loc: string, signal?: AbortSignal) => {
            setIsSummaryLoading(true);
            setSummaryError(null);
            try {
                const res = await fetchMasterdataSummary(srv, sha, loc, signal);
                setSummary(res);
            } catch (err) {
                if ((err as Error).name === "AbortError") return;
                setSummary(null);
                setSummaryError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!signal?.aborted) {
                    setIsSummaryLoading(false);
                }
            }
        },
        [],
    );

    useEffect(() => {
        const ctrl = new AbortController();
        void loadDiff(server, versionItem.sha, ctrl.signal);
        return () => ctrl.abort();
    }, [server, versionItem.sha, loadDiff]);

    useEffect(() => {
        const ctrl = new AbortController();
        void loadSummary(server, versionItem.sha, locale, ctrl.signal);
        return () => ctrl.abort();
    }, [server, versionItem.sha, locale, loadSummary]);

    const handleInspectFile = (filePath: string) => {
        onSelectFile(filePath);
        onTabChange("files");
    };

    if (isDiffLoading) {
        return (
            <Surface tone="card" radius="xl" className="p-6">
                <LoadingState label={t("page.masterdataDiff.loadingDiff")} />
            </Surface>
        );
    }

    if (diffError) {
        return (
            <ErrorState
                title={t("page.masterdataDiff.loadDiffError")}
                message={diffError}
                onRetry={() => void loadDiff(server, versionItem.sha)}
            />
        );
    }

    if (!commitDiff) return null;

    return (
        <div className="space-y-4">
            {/* Commit Metadata Surface */}
            <Surface tone="card" radius="xl" className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-tertiary-container px-2.5 py-0.5 font-mono type-label-l font-medium text-on-tertiary-container">
                                v{commitDiff.dataVersion}
                            </span>
                            <span className="font-mono type-label-m text-on-surface-variant">
                                {commitDiff.shortSha}
                            </span>
                            {commitDiff.commitUrl && (
                                <ExternalLink
                                    href={commitDiff.commitUrl}
                                    className="inline-flex items-center gap-1 type-label-m text-primary hover:underline"
                                >
                                    <span>{t("page.masterdataDiff.actions.viewOnGitHub")}</span>
                                    <Icon path={mdOpenInNew} size={14} />
                                </ExternalLink>
                            )}
                        </div>
                        <p className="type-body-m text-on-surface">
                            {commitDiff.commitMessage}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 type-label-m text-on-surface-variant">
                            <span className="inline-flex items-center gap-1">
                                <Icon path={mdSchedule} size={14} />
                                {formatDate(new Date(commitDiff.committedAt), {
                                    year: "numeric",
                                    month: "2-digit",
                                    day: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </span>
                            <span className="font-mono type-label-s">
                                {commitDiff.repo}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-surface-container px-3 py-1 font-mono type-label-m text-on-surface">
                            {t("page.masterdataDiff.stats.filesChanged", {
                                count: commitDiff.stats.filesChanged,
                            })}
                        </span>
                        {(commitDiff.stats.additions > 0 || commitDiff.stats.deletions > 0) && (
                            <>
                                <span className="rounded-full bg-primary-container/70 px-3 py-1 font-mono type-label-m text-on-primary-container">
                                    +{formatNumber(commitDiff.stats.additions)}
                                </span>
                                <span className="rounded-full bg-error-container/70 px-3 py-1 font-mono type-label-m text-on-error-container">
                                    -{formatNumber(commitDiff.stats.deletions)}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </Surface>

            {/* AI Summary */}
            <AiSummaryCard
                summary={summary}
                isLoading={isSummaryLoading}
                error={summaryError}
                onRetry={() => void loadSummary(server, versionItem.sha, locale)}
            />

            {/* Secondary MD3 Tabs: Entity Highlights vs JSON File Diff */}
            <Surface tone="card" radius="xl" className="overflow-hidden">
                <Tabs
                    variant="secondary"
                    scrollable
                    value={activeTab}
                    onValueChange={onTabChange}
                    items={[
                        {
                            value: "overview",
                            icon: mdLayers,
                            label: t("page.masterdataDiff.tabs.entities", {
                                count: commitDiff.entityGroups.length,
                            }),
                        },
                        {
                            value: "files",
                            icon: mdDescription,
                            label: t("page.masterdataDiff.tabs.files", {
                                count: commitDiff.files.length,
                            }),
                        },
                    ]}
                />
                <div className="p-4 sm:p-5">
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
                            onSelectFile={onSelectFile}
                        />
                    )}
                </div>
            </Surface>
        </div>
    );
}
