"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";

import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterSection, FilterButton } from "@/components/common/BaseFilters";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import Modal from "@/components/common/Modal";
import ExternalLink from "@/components/ExternalLink";
import AssetTosModal from "@/components/common/AssetTosModal";
import LocalizedLink from "@/components/LocalizedLink";
import { Banner, Button, Card, CircularProgress, EmptyState, ErrorState, Icon, IconButton, LoadingState, PageContainer, PageHeader, Surface } from "@/components/md3";
import {
    mdCheck,
    mdChevronLeft,
    mdChevronRight,
    mdContentCopy,
    mdDescription,
    mdDownload,
    mdFolder,
    mdFolderOff,
    mdHistory,
    mdRefresh,
    mdVolumeUp,
} from "@/components/md3/icons";

// ==================== Types (matching the assets gateway responses) ====================

export interface AssetVersionItem {
    assetVersion: string;
    appVersion: string;
    assetHash?: string;
    bundleCount: number;
    committedAt: number; // unix seconds
    changedAssets: number;
    /** Client COMMIT stats passthrough — keys are not guaranteed to be stable */
    stats?: Record<string, number>;
    diffUrl?: string;
}

export interface AssetVersionsResponse {
    server: string;
    limit: number;
    nextCursor?: string;
    items: AssetVersionItem[];
}

export interface AssetDiffItem {
    changeType: "added" | "updated";
    path: string;
    url: string;
    source?: string;
    size?: number;
    fingerprint?: string;
    sha256?: string;
    bundlePath?: string;
}

export interface AssetDiffResponse {
    server: string;
    assetVersion: string;
    appVersion: string;
    assetHash?: string;
    committedAt: number;
    types?: string[];
    totalChanged: number;
    limit: number;
    nextCursor?: string;
    items: AssetDiffItem[];
}

type AssetDiffMeta = Omit<AssetDiffResponse, "items" | "nextCursor" | "limit">;

const SERVERS = ["jp", "en", "tw", "kr", "cn"] as const;
const VERSIONS_PAGE_LIMIT = 20;
const DIFF_PAGE_LIMIT = 200;

// Known COMMIT stat keys → i18n labels; unknown keys fall back to the raw name
const STAT_LABEL_KEYS: Record<string, string> = {
    SkippedByLayer1: "page.assetVersions.stats.skippedByLayer1",
    SkippedByCheck: "page.assetVersions.stats.skippedByCheck",
    UploadedShared: "page.assetVersions.stats.uploadedShared",
    UploadedOverride: "page.assetVersions.stats.uploadedOverride",
};

const STAT_CHIP_CLASSES: Record<string, string> = {
    UploadedOverride: "bg-tertiary-container text-on-tertiary-container",
    UploadedShared: "bg-secondary-container text-on-secondary-container",
};
const STAT_CHIP_DEFAULT = "bg-surface-container-highest text-on-surface-variant";

function formatBytes(bytes?: number): string {
    if (bytes === undefined || bytes === null) return "-";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileExtension(path: string): string {
    const name = path.split("/").pop() || "";
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function isImagePath(path: string): boolean {
    return ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(getFileExtension(path));
}

function isAudioPath(path: string): boolean {
    return ["mp3", "wav", "ogg", "m4a", "flac"].includes(getFileExtension(path));
}

function isTextPath(path: string): boolean {
    return ["json", "txt", "csv", "xml", "yaml", "yml"].includes(getFileExtension(path));
}

function AssetVersionsContent() {
    const { assetSource } = useTheme();
    const { t, formatNumber, formatDate } = useI18n();

    // ==================== Query states (synced to URL) ====================

    const [server, setServer] = useState<string>(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const queryServer = params.get("server");
            if (queryServer) return queryServer;

            const savedServer = localStorage.getItem("server-source");
            if (savedServer === "en" || savedServer === "jp" || savedServer === "cn" || savedServer === "tw" || savedServer === "kr") {
                return savedServer;
            }
            return "jp";
        }
        return "jp";
    });
    // Selected version — empty string means the version timeline view
    const [version, setVersion] = useState<string>(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            return params.get("version") || "";
        }
        return "";
    });

    const [typeFilter, setTypeFilter] = useState<string>(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const types = params.get("types");
            if (types) return types;
        }
        return "default";
    });

    const [showTos, setShowTos] = useState(false);

    // Sync state to URL query parameters (write-only)
    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("server", server);
        if (version) {
            url.searchParams.set("version", version);
            if (typeFilter !== "default") {
                url.searchParams.set("types", typeFilter);
            } else {
                url.searchParams.delete("types");
            }
        } else {
            url.searchParams.delete("version");
            url.searchParams.delete("action");
            url.searchParams.delete("types");
        }
        window.history.replaceState({}, "", url.toString());
    }, [server, version, typeFilter]);

    // Handle back/forward navigation
    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            const serverParam = params.get("server");
            if (serverParam) {
                setServer(serverParam);
            }
            setVersion(params.get("version") || "");
            setTypeFilter(params.get("types") || "default");
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    // Versions are server-specific, so switching servers exits the diff view
    const handleServerChange = useCallback((srv: string) => {
        setServer(srv);
        setVersion("");
    }, []);

    const gatewayDomain = useMemo(() => {
        return assetSource === "overseas" ? "https://storage.pjsk.moe" : "https://storage.exmeaning.com";
    }, [assetSource]);

    // ==================== Version timeline states ====================

    const [versions, setVersions] = useState<AssetVersionItem[]>([]);
    const [versionsCursor, setVersionsCursor] = useState<string>("");
    const [isVersionsLoading, setIsVersionsLoading] = useState(true);
    const [isVersionsLoadingMore, setIsVersionsLoadingMore] = useState(false);
    const [versionsError, setVersionsError] = useState<string | null>(null);

    const fetchVersions = useCallback(async () => {
        try {
            setIsVersionsLoading(true);
            setVersionsError(null);
            const url = `${gatewayDomain}/api/assets/versions?server=${server}&limit=${VERSIONS_PAGE_LIMIT}`;
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data: AssetVersionsResponse = await res.json();
            setVersions(data.items || []);
            setVersionsCursor(data.nextCursor || "");
        } catch (err) {
            console.error("Failed to load asset versions:", err);
            setVersionsError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setIsVersionsLoading(false);
        }
    }, [server, gatewayDomain]);

    useEffect(() => {
        fetchVersions();
    }, [fetchVersions]);

    const fetchMoreVersions = useCallback(async () => {
        if (!versionsCursor || isVersionsLoadingMore) return;
        try {
            setIsVersionsLoadingMore(true);
            const url = `${gatewayDomain}/api/assets/versions?server=${server}&limit=${VERSIONS_PAGE_LIMIT}&cursor=${encodeURIComponent(versionsCursor)}`;
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data: AssetVersionsResponse = await res.json();
            setVersions(prev => [...prev, ...(data.items || [])]);
            setVersionsCursor(data.nextCursor || "");
        } catch (err) {
            console.error("Failed to load more asset versions:", err);
        } finally {
            setIsVersionsLoadingMore(false);
        }
    }, [server, gatewayDomain, versionsCursor, isVersionsLoadingMore]);

    // ==================== Diff states ====================

    const [diffMeta, setDiffMeta] = useState<AssetDiffMeta | null>(null);
    const [diffItems, setDiffItems] = useState<AssetDiffItem[]>([]);
    const [diffCursor, setDiffCursor] = useState<string>("");
    const [isDiffLoading, setIsDiffLoading] = useState(false);
    const [isDiffLoadingMore, setIsDiffLoadingMore] = useState(false);
    const [diffError, setDiffError] = useState<string | null>(null);

    // Diff filters
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"size" | "path">("size");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Selected file detail modal
    const [selectedFile, setSelectedFile] = useState<AssetDiffItem | null>(null);
    const [previewText, setPreviewText] = useState<string | null>(null);
    const [isPreviewTextLoading, setIsPreviewTextLoading] = useState(false);
    const [previewTextError, setPreviewTextError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState(false);

    const fetchDiff = useCallback(async () => {
        if (!version) return;
        try {
            setIsDiffLoading(true);
            setDiffError(null);
            setDiffItems([]);
            setDiffMeta(null);

            let url = `${gatewayDomain}/api/assets/diff?server=${server}&version=${encodeURIComponent(version)}&limit=${DIFF_PAGE_LIMIT}`;
            if (typeFilter && typeFilter !== "default") {
                url += `&types=${encodeURIComponent(typeFilter)}`;
            }

            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data: AssetDiffResponse = await res.json();
            setDiffMeta({
                server: data.server,
                assetVersion: data.assetVersion,
                appVersion: data.appVersion,
                assetHash: data.assetHash,
                committedAt: data.committedAt,
                types: data.types,
                totalChanged: data.totalChanged,
            });
            setDiffItems(data.items || []);
            setDiffCursor(data.nextCursor || "");
        } catch (err) {
            console.error("Failed to load asset diff:", err);
            setDiffError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setIsDiffLoading(false);
        }
    }, [server, version, typeFilter, gatewayDomain]);

    useEffect(() => {
        fetchDiff();
    }, [fetchDiff]);

    const fetchMoreDiff = useCallback(async () => {
        if (!version || !diffCursor || isDiffLoadingMore) return;
        try {
            setIsDiffLoadingMore(true);

            let url = `${gatewayDomain}/api/assets/diff?server=${server}&version=${encodeURIComponent(version)}&limit=${DIFF_PAGE_LIMIT}&cursor=${encodeURIComponent(diffCursor)}`;
            if (typeFilter && typeFilter !== "default") {
                url += `&types=${encodeURIComponent(typeFilter)}`;
            }

            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data: AssetDiffResponse = await res.json();
            setDiffItems(prev => [...prev, ...(data.items || [])]);
            setDiffCursor(data.nextCursor || "");
        } catch (err) {
            console.error("Failed to load more asset diff entries:", err);
        } finally {
            setIsDiffLoadingMore(false);
        }
    }, [server, version, typeFilter, gatewayDomain, diffCursor, isDiffLoadingMore]);

    // ==================== Diff filtering & pagination ====================

    const processedDiffItems = useMemo(() => {
        let list = [...diffItems];

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            list = list.filter(item => item.path.toLowerCase().includes(query));
        }

        const isAsc = sortOrder === "asc";
        if (sortBy === "path") {
            list.sort((a, b) => isAsc ? a.path.localeCompare(b.path) : b.path.localeCompare(a.path));
        } else {
            list.sort((a, b) => {
                const sizeA = a.size || 0;
                const sizeB = b.size || 0;
                return isAsc ? sizeA - sizeB : sizeB - sizeA;
            });
        }

        return list;
    }, [diffItems, searchQuery, sortBy, sortOrder]);

    const isDiffView = version !== "";
    const hasActiveDiffFilters = searchQuery !== "" || typeFilter !== "default" || sortBy !== "size" || sortOrder !== "desc";

    const resetFilters = useCallback(() => {
        setSearchQuery("");
        setTypeFilter("default");
        setSortBy("size");
        setSortOrder("desc");
    }, []);

    // Reset diff filters when leaving / switching versions
    useEffect(() => {
        resetFilters();
    }, [version, resetFilters]);

    // ==================== File preview helpers ====================

    const handleFetchPreviewText = async (file: AssetDiffItem) => {
        if (!file.url) return;
        try {
            setIsPreviewTextLoading(true);
            setPreviewTextError(null);
            setPreviewText(null);

            const res = await fetch(`${gatewayDomain}${file.url}`);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const content = await res.text();

            try {
                const parsed = JSON.parse(content);
                setPreviewText(JSON.stringify(parsed, null, 2));
            } catch {
                setPreviewText(content);
            }
        } catch (err) {
            console.error("Error loading text preview:", err);
            setPreviewTextError(err instanceof Error ? err.message : "Failed to load text preview");
        } finally {
            setIsPreviewTextLoading(false);
        }
    };

    const handleCopyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 2000);
        }).catch(err => {
            console.error("Clipboard copy failed:", err);
        });
    };

    // ==================== Sidebar filters ====================

    const quickFilterContent = (
        <BaseFilters
            filteredCount={isDiffView ? processedDiffItems.length : versions.length}
            totalCount={isDiffView ? diffItems.length : versions.length}
            countUnit={isDiffView ? t("page.assetVersions.fileUnit") : t("page.assetVersions.versionUnit")}
            searchQuery={searchQuery}
            onSearchChange={isDiffView ? setSearchQuery : undefined}
            searchPlaceholder={t("page.assetVersions.searchPlaceholder")}
            showSearch={isDiffView}
            sortOptions={isDiffView ? [
                { id: "size", label: t("page.assetVersions.size") },
                { id: "path", label: t("page.assetVersions.path") },
            ] : undefined}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={isDiffView ? (field, order) => {
                setSortBy(field as "size" | "path");
                setSortOrder(order);
            } : undefined}
            hasActiveFilters={isDiffView && hasActiveDiffFilters}
            onReset={resetFilters}
        >
            <FilterSection label={t("page.assetVersions.serverSelect")}>
                <div className="flex flex-wrap gap-2">
                    {SERVERS.map(srv => (
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

            {isDiffView && (
                <FilterSection label={t("page.assetVersions.fileTypeLabel")}>
                    <div className="grid grid-cols-3 gap-2">
                        <FilterButton
                            selected={typeFilter === "all" || typeFilter === "default"}
                            onClick={() => setTypeFilter("all")}
                        >
                            {t("page.assetVersions.filterAll")}
                        </FilterButton>
                        <FilterButton
                            selected={typeFilter === "webp"}
                            onClick={() => setTypeFilter("webp")}
                        >
                            webp
                        </FilterButton>
                        <FilterButton
                            selected={typeFilter === "mp3"}
                            onClick={() => setTypeFilter("mp3")}
                        >
                            mp3
                        </FilterButton>
                    </div>
                </FilterSection>
            )}


        </BaseFilters>
    );

    useQuickFilter(t("page.assetVersions.title"), quickFilterContent, [
        server,
        version,
        searchQuery,
        typeFilter,
        sortBy,
        sortOrder,
        processedDiffItems.length,
        diffItems.length,
        versions.length,
        diffMeta,
        diffCursor,
        t,
    ]);

    // ==================== Modal header actions ====================

    const modalHeaderActions = useMemo(() => {
        if (!selectedFile?.url) return null;
        return (
            <div className="flex items-center gap-1">
                <IconButton
                    icon={copyFeedback ? mdCheck : mdContentCopy}
                    size="xs"
                    onClick={() => handleCopyToClipboard(`${gatewayDomain}${selectedFile.url}`)}
                    label={copyFeedback ? t("page.assetVersions.copied") : t("page.assetVersions.copyLink")}
                />
                <ExternalLink
                    href={`${gatewayDomain}${selectedFile.url}`}
                    className="state-layer focus-ring flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
                    title={t("page.assetVersions.download")}
                >
                    <Icon path={mdDownload} size={20} />
                </ExternalLink>
            </div>
        );
    }, [selectedFile, gatewayDomain, copyFeedback, t]);

    // ==================== Shared render helpers ====================

    const renderStatChips = (stats: Record<string, number> | undefined, wrapperClassName: string) => {
        const entries = Object.entries(stats || {}).filter(([key, value]) => value > 0 && key !== "SkippedByCheck");
        if (entries.length === 0) return null;
        return (
            <div className={`flex flex-wrap items-center gap-1.5 ${wrapperClassName}`}>
                {entries.map(([key, value]) => {
                    const labelKey = STAT_LABEL_KEYS[key];
                    return (
                        <span
                            key={key}
                            className={`rounded-md3-sm px-2 py-0.5 type-label-s ${STAT_CHIP_CLASSES[key] || STAT_CHIP_DEFAULT}`}
                        >
                            {labelKey ? t(labelKey) : key} {formatNumber(value)}
                        </span>
                    );
                })}
            </div>
        );
    };

    const renderChangeTypeBadge = (changeType: AssetDiffItem["changeType"]) => (
        <span
            className={`shrink-0 rounded-md3-sm px-2 py-0.5 type-label-s uppercase ${
                changeType === "added"
                    ? "bg-primary-container text-on-primary-container"
                    : "bg-tertiary-container text-on-tertiary-container"
            }`}
        >
            {changeType === "added" ? t("page.assetVersions.changeAdded") : t("page.assetVersions.changeUpdated")}
        </span>
    );

    const formatCommittedAt = (committedAt: number) =>
        formatDate(new Date(committedAt * 1000), {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });

    const selectedVersionMeta = useMemo(() => {
        if (!isDiffView) return null;
        return versions.find(v => v.assetVersion === version) || null;
    }, [isDiffView, versions, version]);

    // ==================== Render ====================

    return (
        <PageContainer>
            {/* Page Header */}
            <PageHeader
                eyebrow={t("page.assetVersions.badge")}
                title={t("page.assetVersions.title")}
                highlight={t("page.assetVersions.titleHighlight")}
                description={
                    <>
                        {t("page.assetVersions.descriptionPrefix")}
                        <button
                            type="button"
                            onClick={() => setShowTos(true)}
                            className="focus-ring mx-1 rounded-md3-xs text-primary hover:underline"
                        >
                            {t("page.assetVersions.descriptionLink")}
                        </button>
                        {t("page.assetVersions.descriptionSuffix")}
                    </>
                }
            />

            {/* Filters live in the global FilterDrawer (registered above via
                useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {/* Toolbar */}
                <Surface tone="card" radius="xl" className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                    <div className="flex min-w-0 items-center gap-2">
                        {isDiffView && (
                            <IconButton
                                icon={mdChevronLeft}
                                size="xs"
                                onClick={() => setVersion("")}
                                label={t("page.assetVersions.backToList")}
                            />
                        )}
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 type-label-l text-on-surface-variant">
                            <button
                                type="button"
                                onClick={() => setVersion("")}
                                className={`focus-ring rounded-md3-xs transition-colors hover:text-primary ${!isDiffView ? "type-title-s text-on-surface" : ""}`}
                            >
                                {t("page.assetVersions.timeline")}
                            </button>
                            {isDiffView && (
                                <>
                                    <span className="text-outline">/</span>
                                    <span className="truncate font-mono type-title-s text-on-surface">{version}</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <LocalizedLink
                            href={`/asset-viewer?server=${server}`}
                            className="state-layer focus-ring flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
                            title={t("layout.nav.items.assetViewer")}
                            aria-label={t("layout.nav.items.assetViewer")}
                        >
                            <Icon path={mdFolder} size={20} />
                        </LocalizedLink>

                        <IconButton
                            icon={mdRefresh}
                            size="xs"
                            onClick={isDiffView ? fetchDiff : fetchVersions}
                            label={t("common.action.refresh")}
                            className={(isDiffView ? isDiffLoading : isVersionsLoading) ? "[&_svg]:animate-spin" : undefined}
                        />
                    </div>
                </Surface>

                {!isDiffView ? (
                    /* ==================== Version Timeline View ==================== */
                    isVersionsLoading ? (
                        <LoadingState />
                    ) : versionsError ? (
                        <ErrorState
                            title={t("page.assetVersions.loadFailed")}
                            message={versionsError}
                            retryLabel={t("common.action.retry")}
                            onRetry={fetchVersions}
                        />
                    ) : versions.length === 0 ? (
                        <Surface tone="card" radius="xl">
                            <EmptyState icon={mdHistory} title={t("page.assetVersions.emptyVersions")} />
                        </Surface>
                    ) : (
                        <>
                            <div className="relative flex flex-col gap-3">
                                {/* Timeline rail */}
                                <div className="absolute bottom-4 left-[13px] top-4 hidden w-px bg-outline-variant sm:block" aria-hidden />
                                {versions.map((v, index) => (
                                    <div key={`${v.assetVersion}-${index}`} className="relative sm:pl-9">
                                        {/* Timeline dot */}
                                        <span
                                            className={`absolute left-[9px] top-6 hidden h-[9px] w-[9px] rounded-full sm:block ${index === 0 ? "bg-primary ring-4 ring-primary-container" : "bg-outline"}`}
                                            aria-hidden
                                        />
                                        <Card
                                            variant="filled"
                                            radius="lg"
                                            onClick={() => setVersion(v.assetVersion)}
                                            className="group select-none p-4 text-left sm:p-5"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-mono type-title-l type-emphasized text-on-surface transition-colors duration-200 group-hover:text-primary">
                                                            {v.assetVersion}
                                                        </span>
                                                        <span className="rounded-md3-sm bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface-variant">
                                                            App {v.appVersion}
                                                        </span>
                                                        {index === 0 && (
                                                            <span className="rounded-md3-sm bg-primary px-2 py-0.5 type-label-s text-on-primary">
                                                                {t("page.assetVersions.latestBadge")}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-1 type-body-s text-on-surface-variant">
                                                        {formatCommittedAt(v.committedAt)}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1 type-label-l text-on-surface-variant transition-colors duration-200 group-hover:text-primary">
                                                    <span className="hidden sm:inline">{t("page.assetVersions.viewDiff")}</span>
                                                    <Icon path={mdChevronRight} size={20} />
                                                </div>
                                            </div>

                                            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 type-body-s text-on-surface-variant">
                                                <span>
                                                    {t("page.assetVersions.changedAssetsLabel")}
                                                    <span className="ml-1.5 type-label-l text-on-surface">{formatNumber(v.changedAssets)}</span>
                                                </span>
                                            </div>

                                            {renderStatChips(v.stats, "mt-2.5")}
                                        </Card>
                                    </div>
                                ))}
                            </div>

                            {versionsCursor && (
                                <div className="mt-8 flex justify-center">
                                    <Button
                                        variant="tonal"
                                        size="m"
                                        onClick={fetchMoreVersions}
                                        disabled={isVersionsLoadingMore}
                                    >
                                        {isVersionsLoadingMore ? <CircularProgress size={20} /> : t("page.assetVersions.loadMore")}
                                    </Button>
                                </div>
                            )}

                            {!versionsCursor && versions.length > 0 && (
                                <div className="mt-8 text-center type-body-m text-on-surface-variant">
                                    {t("page.assetVersions.allVersionsLoaded", { count: versions.length })}
                                </div>
                            )}
                        </>
                    )
                ) : (
                    /* ==================== Single Version Diff View ==================== */
                    <>
                        {/* Version summary card */}
                        <Surface tone="card" radius="xl" className="mb-4 p-4 sm:p-5">
                            {isDiffLoading && !diffMeta ? (
                                <div className="flex items-center gap-3 type-body-m text-on-surface-variant">
                                    <CircularProgress size={20} />
                                    <span>{t("page.assetVersions.loadingDiff")}</span>
                                </div>
                            ) : diffMeta ? (
                                <>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono type-title-l type-emphasized text-on-surface">{diffMeta.assetVersion}</span>
                                        <span className="rounded-md3-sm bg-surface-container-high px-2 py-0.5 type-label-s text-on-surface-variant">
                                            App {diffMeta.appVersion}
                                        </span>
                                        {(diffMeta.types || []).map(type => (
                                            <span key={type} className="rounded-md3-sm bg-secondary-container px-2 py-0.5 type-label-s text-on-secondary-container">
                                                {type}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 type-body-s text-on-surface-variant">
                                        <span>{formatCommittedAt(diffMeta.committedAt)}</span>
                                        <span>
                                            {t("page.assetVersions.totalChangedLabel")}
                                            <span className="ml-1.5 type-label-l text-on-surface">{formatNumber(diffMeta.totalChanged)}</span>
                                        </span>
                                        <span>
                                            {t("page.assetVersions.loadedLabel")}
                                            <span className="ml-1.5 type-label-l text-on-surface">{formatNumber(diffItems.length)}</span>
                                        </span>
                                    </div>
                                    {selectedVersionMeta && renderStatChips(selectedVersionMeta.stats, "mt-2.5")}
                                    {diffMeta.assetHash && (
                                        <p className="mt-2 break-all font-mono type-label-s text-on-surface-variant">
                                            {diffMeta.assetHash}
                                        </p>
                                    )}
                                </>
                            ) : null}
                        </Surface>

                        {/* Diff list */}
                        {isDiffLoading ? (
                            <LoadingState />
                        ) : diffError ? (
                            <ErrorState
                                title={t("page.assetVersions.loadFailed")}
                                message={diffError}
                                retryLabel={t("common.action.retry")}
                                onRetry={fetchDiff}
                            />
                        ) : processedDiffItems.length === 0 ? (
                            <Surface tone="card" radius="xl">
                                <EmptyState icon={mdFolderOff} title={t("page.assetVersions.emptyDiff")} />
                            </Surface>
                        ) : (
                            <>
                                <div className="flex flex-col gap-1.5">
                                    {/* Table header */}
                                    <div className="mb-1 flex select-none items-center border-b border-outline-variant px-4 py-2.5 type-label-m text-on-surface-variant">
                                        <div className="w-16">{t("page.assetVersions.changeTypeLabel")}</div>
                                        <div className="min-w-0 flex-1 pl-3">{t("page.assetVersions.path")}</div>
                                        <div className="w-24 text-right">{t("page.assetVersions.size")}</div>
                                    </div>
                                    {/* Rows */}
                                    {processedDiffItems.map((item, index) => (
                                        <Card
                                            key={`${item.path}-${index}`}
                                            variant="filled"
                                            onClick={() => setSelectedFile(item)}
                                            className="group select-none px-4 py-3 text-left"
                                        >
                                            <div className="flex items-center gap-3">
                                            {renderChangeTypeBadge(item.changeType)}
                                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                                <p
                                                    className="truncate font-mono type-body-s text-on-surface transition-colors duration-200 group-hover:text-primary sm:type-body-m"
                                                    title={item.path}
                                                >
                                                    {item.path}
                                                </p>
                                                {item.source === "override" && (
                                                    <span className="shrink-0 rounded-md3-xs bg-tertiary-container px-1.5 type-label-s text-on-tertiary-container">override</span>
                                                )}
                                            </div>
                                            <div className="w-24 shrink-0 text-right type-label-m text-on-surface-variant">
                                                {formatBytes(item.size)}
                                            </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>

                                {/* Fetch next server page */}
                                {diffCursor && (
                                    <div className="mt-8 flex justify-center">
                                        <Button
                                            variant="tonal"
                                            size="m"
                                            onClick={fetchMoreDiff}
                                            disabled={isDiffLoadingMore}
                                        >
                                            {isDiffLoadingMore ? (
                                                <CircularProgress size={20} />
                                            ) : (
                                                <>
                                                    {t("page.assetVersions.loadMore")}
                                                    <span className="type-label-l opacity-80">
                                                        {formatNumber(diffItems.length)} / {formatNumber(diffMeta?.totalChanged || 0)}
                                                    </span>
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}

                                {/* All loaded message */}
                                {!diffCursor && processedDiffItems.length > 0 && (
                                    <div className="mt-8 text-center type-body-m text-on-surface-variant">
                                        {t("page.assetVersions.allDiffLoaded", { count: processedDiffItems.length })}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* File Detail Modal */}
            <Modal
                isOpen={!!selectedFile}
                onClose={() => {
                    setSelectedFile(null);
                    setPreviewText(null);
                    setPreviewTextError(null);
                }}
                title={selectedFile ? (selectedFile.path.split("/").pop() || selectedFile.path) : ""}
                size="md"
                headerActions={modalHeaderActions}
            >
                {selectedFile && (
                    <div className="space-y-6">
                        {/* File Details Grid */}
                        <div className="space-y-2.5 rounded-md3-lg bg-surface-container p-4 type-body-s sm:type-body-m">
                            <div className="flex justify-between gap-4">
                                <span className="shrink-0 text-on-surface-variant">{t("page.assetVersions.changeTypeLabel")}</span>
                                {renderChangeTypeBadge(selectedFile.changeType)}
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-on-surface-variant">{t("page.assetVersions.path")}</span>
                                <span className="select-all break-all font-mono type-label-s text-on-surface sm:type-label-m">{selectedFile.path}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="shrink-0 text-on-surface-variant">{t("page.assetVersions.size")}</span>
                                <span className="text-right type-label-l text-on-surface">{formatBytes(selectedFile.size)}</span>
                            </div>
                            {selectedFile.source && (
                                <div className="flex justify-between gap-4">
                                    <span className="shrink-0 text-on-surface-variant">{t("page.assetVersions.source")}</span>
                                    <span className="text-right capitalize text-on-surface">{selectedFile.source}</span>
                                </div>
                            )}
                            {selectedFile.bundlePath && (
                                <div className="flex justify-between gap-4">
                                    <span className="shrink-0 text-on-surface-variant">{t("page.assetVersions.bundlePath")}</span>
                                    <span className="max-w-[200px] truncate text-right font-mono text-on-surface" title={selectedFile.bundlePath}>{selectedFile.bundlePath}</span>
                                </div>
                            )}
                            {selectedFile.fingerprint && (
                                <div className="flex justify-between gap-4">
                                    <span className="shrink-0 text-on-surface-variant">{t("page.assetVersions.fingerprint")}</span>
                                    <span className="max-w-[200px] truncate text-right font-mono text-on-surface" title={selectedFile.fingerprint}>{selectedFile.fingerprint}</span>
                                </div>
                            )}
                            {selectedFile.sha256 && (
                                <div className="flex flex-col gap-1 border-t border-outline-variant pt-1.5">
                                    <span className="text-on-surface-variant">{t("page.assetVersions.sha256")}</span>
                                    <span className="select-all break-all font-mono type-label-s text-on-surface sm:type-label-m">{selectedFile.sha256}</span>
                                </div>
                            )}
                        </div>

                        {/* Inline Previews */}
                        <div className="flex flex-col items-center justify-center">
                            {isImagePath(selectedFile.path) && selectedFile.url && (
                                <div className="relative flex max-h-64 w-full justify-center rounded-md3-lg bg-surface-container p-4">
                                    <img
                                        src={`${gatewayDomain}${selectedFile.url}`}
                                        alt={selectedFile.path}
                                        className="max-h-56 rounded-md3-sm object-contain"
                                        onError={(e) => {
                                            (e.target as HTMLElement).style.display = "none";
                                        }}
                                    />
                                </div>
                            )}

                            {isAudioPath(selectedFile.path) && selectedFile.url && (
                                <div className="w-full rounded-md3-lg bg-surface-container p-4">
                                    <p className="mb-2 flex items-center gap-1.5 type-label-l text-on-surface-variant">
                                        <Icon path={mdVolumeUp} size={18} />
                                        {t("page.assetVersions.playAudio")}
                                    </p>
                                    <audio
                                        src={`${gatewayDomain}${selectedFile.url}`}
                                        controls
                                        className="w-full"
                                    />
                                </div>
                            )}

                            {isTextPath(selectedFile.path) && selectedFile.url && (
                                <div className="w-full">
                                    {previewText === null && !isPreviewTextLoading && !previewTextError && (
                                        <Button
                                            variant="filled"
                                            size="m"
                                            fullWidth
                                            icon={mdDescription}
                                            onClick={() => handleFetchPreviewText(selectedFile)}
                                        >
                                            {t("page.assetVersions.previewText")}
                                        </Button>
                                    )}

                                    {isPreviewTextLoading && (
                                        <div className="flex justify-center p-6">
                                            <CircularProgress size={32} />
                                        </div>
                                    )}

                                    {previewTextError && (
                                        <Banner tone="error">{previewTextError}</Banner>
                                    )}

                                    {previewText !== null && (
                                        <div className="relative w-full">
                                            <Button
                                                variant="tonal"
                                                size="xs"
                                                icon={copyFeedback ? mdCheck : mdContentCopy}
                                                className="absolute right-3 top-3"
                                                onClick={() => handleCopyToClipboard(previewText)}
                                            >
                                                {copyFeedback ? t("page.assetVersions.copied") : t("common.action.copy")}
                                            </Button>
                                            <pre className="custom-scrollbar max-h-[35vh] w-full select-all overflow-auto whitespace-pre rounded-md3-lg bg-surface-container-highest p-4 font-mono type-label-s text-on-surface sm:type-label-m">
                                                <code>{previewText}</code>
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Terms of Service Overlay Modal */}
            <AssetTosModal open={showTos} onOpenChange={setShowTos} />
        </PageContainer>
    );
}

export default function AssetVersionsClient() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <Suspense fallback={<LoadingState label={t("page.assetVersions.loadingFallback")} />}>
                <AssetVersionsContent />
            </Suspense>
        </MainLayout>
    );
}
