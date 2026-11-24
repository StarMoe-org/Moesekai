"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { fetchMasterdataFileDiff } from "@/lib/masterdata-diff-api";
import {
    Button,
    Card,
    CircularProgress,
    EmptyState,
    ErrorState,
    Icon,
    Surface,
    TextField,
} from "@/components/md3";
import {
    mdDescription,
    mdKeyboardArrowDown,
    mdKeyboardArrowUp,
    mdSearch,
} from "@/components/md3/icons";
import type {
    MasterdataDiffServer,
    MasterdataFileChange,
    MasterdataFileDiffResponse,
    MasterdataRecordDiff,
} from "@/types/masterdataDiff";

interface FileDiffExplorerProps {
    server: MasterdataDiffServer;
    sha: string;
    files: MasterdataFileChange[];
    selectedFile: string;
    onSelectFile: (filePath: string) => void;
}

const FILE_DIFF_PAGE_SIZE = 60;

function formatJsonValue(value: unknown): string {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function changePillClasses(changeType: "added" | "modified" | "removed"): string {
    switch (changeType) {
        case "added":
            return "bg-primary-container text-on-primary-container";
        case "removed":
            return "bg-error-container text-on-error-container";
        default:
            return "bg-tertiary-container text-on-tertiary-container";
    }
}

function RecordDiffCard({ record }: { record: MasterdataRecordDiff }) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(record.changeType === "modified");

    return (
        <Surface tone="default" className="overflow-hidden rounded-md3-m border border-outline-variant/70">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left state-layer focus-ring"
            >
                <div className="flex min-w-0 items-center gap-2.5">
                    <span
                        className={`shrink-0 rounded-md3-xs px-2 py-0.5 type-label-s ${changePillClasses(record.changeType)}`}
                    >
                        {t(`page.masterdataDiff.changeType.${record.changeType}`)}
                    </span>
                    <span className="font-mono type-label-l text-on-surface shrink-0">
                        #{record.key}
                    </span>
                    {record.summary && (
                        <span className="truncate type-body-s text-on-surface-variant">
                            {record.summary}
                        </span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-on-surface-variant">
                    {record.fields && record.fields.length > 0 && (
                        <span className="type-label-s">
                            {t("page.masterdataDiff.files.fieldsChanged", { count: record.fields.length })}
                        </span>
                    )}
                    <Icon path={expanded ? mdKeyboardArrowUp : mdKeyboardArrowDown} size={18} />
                </div>
            </button>

            {expanded && (
                <div className="border-t border-outline-variant/60 bg-surface-container-low p-4">
                    {record.fields && record.fields.length > 0 ? (
                        <div className="space-y-2.5">
                            {record.fields.map((fd) => (
                                <div
                                    key={fd.field}
                                    className="rounded-md3-s border border-outline-variant/60 bg-surface p-3"
                                >
                                    <div className="font-mono type-label-m text-primary mb-2">
                                        {fd.field}
                                    </div>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <div className="rounded-md3-xs bg-error-container/35 p-2.5">
                                            <div className="type-label-s text-on-error-container mb-1">
                                                {t("page.masterdataDiff.files.before")}
                                            </div>
                                            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono type-body-s text-on-surface">
                                                {formatJsonValue(fd.before)}
                                            </pre>
                                        </div>
                                        <div className="rounded-md3-xs bg-primary-container/35 p-2.5">
                                            <div className="type-label-s text-on-primary-container mb-1">
                                                {t("page.masterdataDiff.files.after")}
                                            </div>
                                            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono type-body-s text-on-surface">
                                                {formatJsonValue(fd.after)}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <pre className="max-h-96 overflow-auto rounded-md3-s bg-surface p-3 font-mono type-body-s text-on-surface">
                            {formatJsonValue(record.changeType === "removed" ? record.before : record.after)}
                        </pre>
                    )}
                </div>
            )}
        </Surface>
    );
}

export default function FileDiffExplorer({
    server,
    sha,
    files,
    selectedFile,
    onSelectFile,
}: FileDiffExplorerProps) {
    const { t } = useI18n();
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [changeFilter, setChangeFilter] = useState<"all" | "added" | "modified" | "removed">("all");

    const [fileDiff, setFileDiff] = useState<MasterdataFileDiffResponse | null>(null);
    const [records, setRecords] = useState<MasterdataRecordDiff[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const categories = useMemo(() => {
        const set = new Set<string>();
        files.forEach((f) => set.add(f.category));
        return ["all", ...Array.from(set)];
    }, [files]);

    const filteredFiles = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return files.filter((f) => {
            if (categoryFilter !== "all" && f.category !== categoryFilter) return false;
            if (q && !f.path.toLowerCase().includes(q) && !f.name.toLowerCase().includes(q)) {
                return false;
            }
            return true;
        });
    }, [files, categoryFilter, searchQuery]);

    const activeFile = useMemo(() => {
        if (selectedFile && files.some((f) => f.path === selectedFile)) {
            return selectedFile;
        }
        return filteredFiles[0]?.path || files[0]?.path || "";
    }, [selectedFile, files, filteredFiles]);

    const loadFileDiff = useCallback(
        async (filePath: string, change: "all" | "added" | "modified" | "removed", signal?: AbortSignal) => {
            if (!filePath) {
                setFileDiff(null);
                setRecords([]);
                return;
            }
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetchMasterdataFileDiff(server, sha, filePath, {
                    change,
                    offset: 0,
                    limit: FILE_DIFF_PAGE_SIZE,
                    signal,
                });
                setFileDiff(res);
                setRecords(res.items || []);
            } catch (err) {
                if ((err as Error)?.name === "AbortError") return;
                setError(err instanceof Error ? err.message : "Unknown error");
                setFileDiff(null);
                setRecords([]);
            } finally {
                setIsLoading(false);
            }
        },
        [server, sha],
    );

    useEffect(() => {
        const ctrl = new AbortController();
        void loadFileDiff(activeFile, changeFilter, ctrl.signal);
        return () => ctrl.abort();
    }, [activeFile, changeFilter, loadFileDiff]);

    const handleLoadMore = async () => {
        if (!fileDiff || !fileDiff.truncated || isLoadingMore || !activeFile) return;
        setIsLoadingMore(true);
        try {
            const next = await fetchMasterdataFileDiff(server, sha, activeFile, {
                change: changeFilter,
                offset: records.length,
                limit: FILE_DIFF_PAGE_SIZE,
            });
            setFileDiff(next);
            setRecords((prev) => [...prev, ...(next.items || [])]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setIsLoadingMore(false);
        }
    };

    if (!files || files.length === 0) {
        return (
            <EmptyState
                icon={mdDescription}
                title={t("page.masterdataDiff.files.emptyTitle")}
                description={t("page.masterdataDiff.files.emptyDescription")}
            />
        );
    }

    return (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* File list sidebar */}
            <Card variant="outlined" className="flex flex-col overflow-hidden border-outline-variant bg-surface-container-low">
                <div className="space-y-3 border-b border-outline-variant p-3.5">
                    <TextField
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t("page.masterdataDiff.files.searchPlaceholder")}
                        icon={mdSearch}
                    />
                    <div className="flex flex-wrap gap-1.5">
                        {categories.map((cat) => {
                            const active = categoryFilter === cat;
                            const labelKey =
                                cat === "all"
                                    ? "page.masterdataDiff.filters.all"
                                    : `page.masterdataDiff.categories.${cat}`;
                            const translated = t(labelKey);
                            const label = translated === labelKey ? cat : translated;
                            return (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setCategoryFilter(cat)}
                                    className={`rounded-md3-full px-2.5 py-1 type-label-s transition-colors state-layer focus-ring ${
                                        active
                                            ? "bg-secondary-container text-on-secondary-container"
                                            : "bg-surface-container-high text-on-surface-variant"
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="max-h-[540px] divide-y divide-outline-variant/50 overflow-y-auto">
                    {filteredFiles.map((f) => {
                        const isSelected = f.path === activeFile;
                        return (
                            <button
                                key={f.path}
                                type="button"
                                onClick={() => {
                                    setChangeFilter("all");
                                    onSelectFile(f.path);
                                }}
                                className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition-colors state-layer focus-ring ${
                                    isSelected
                                        ? "bg-primary-container/60 text-on-primary-container"
                                        : "text-on-surface"
                                }`}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate font-mono type-label-m">
                                            {f.name}
                                        </span>
                                        {f.isCore && (
                                            <span className="shrink-0 rounded-md3-xs bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">
                                                {t("page.masterdataDiff.files.coreBadge")}
                                            </span>
                                        )}
                                    </div>
                                    <div className="truncate type-label-s text-on-surface-variant">
                                        {f.path}
                                    </div>
                                </div>
                                <div className="shrink-0 text-right font-mono type-label-s">
                                    {f.additions > 0 && (
                                        <span className="text-primary">+{f.additions}</span>
                                    )}
                                    {f.deletions > 0 && (
                                        <span className="ml-1.5 text-error">-{f.deletions}</span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </Card>

            {/* File diff detail */}
            <Card variant="outlined" className="overflow-hidden border-outline-variant bg-surface-container-low">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-5 py-3.5">
                    <div className="min-w-0">
                        <h3 className="truncate font-mono type-title-m text-on-surface">
                            {activeFile}
                        </h3>
                        {fileDiff && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 type-label-s text-on-surface-variant">
                                <span>
                                    {t("page.masterdataDiff.files.recordCounts", {
                                        added: fileDiff.totalAdded,
                                        modified: fileDiff.totalModified,
                                        removed: fileDiff.totalRemoved,
                                    })}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {(["all", "added", "modified", "removed"] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setChangeFilter(mode)}
                                className={`rounded-md3-full px-3 py-1 type-label-s transition-colors state-layer focus-ring ${
                                    changeFilter === mode
                                        ? "bg-primary text-on-primary"
                                        : "bg-surface-container-high text-on-surface-variant"
                                }`}
                            >
                                {mode === "all"
                                    ? t("page.masterdataDiff.filters.all")
                                    : t(`page.masterdataDiff.changeType.${mode}`)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center gap-3 py-12 text-on-surface-variant">
                            <CircularProgress size={24} />
                            <span className="type-body-m">{t("common.state.loading")}</span>
                        </div>
                    ) : error ? (
                        <ErrorState
                            title={t("page.masterdataDiff.files.loadError")}
                            message={error}
                            onRetry={() => void loadFileDiff(activeFile, changeFilter)}
                        />
                    ) : records.length === 0 ? (
                        <EmptyState
                            icon={mdDescription}
                            title={t("page.masterdataDiff.files.noMatchingRecords")}
                        />
                    ) : (
                        <div className="space-y-3">
                            {records.map((rec, idx) => (
                                <RecordDiffCard
                                    key={`${rec.changeType}-${rec.key}-${idx}`}
                                    record={rec}
                                />
                            ))}
                            {fileDiff?.truncated && (
                                <div className="pt-2 text-center">
                                    <Button
                                        variant="tonal"
                                        onClick={handleLoadMore}
                                        disabled={isLoadingMore}
                                    >
                                        {isLoadingMore
                                            ? t("common.state.loading")
                                            : t("page.masterdataDiff.files.loadMoreRecords")}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
