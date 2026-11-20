"use client";

import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, Suspense, type ReactNode } from "react";

import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterSection, FilterButton } from "@/components/common/BaseFilters";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import DirectoryTreeSidebar from "@/components/common/DirectoryTreeSidebar";
import ExplorerSplitPane from "@/components/common/ExplorerSplitPane";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { usePageServer } from "@/hooks/usePageServer";
import { useAutoLoadMore } from "@/hooks/useAutoLoadMore";
import Modal from "@/components/common/Modal";
import ExternalLink from "@/components/ExternalLink";
import AssetTosModal from "@/components/common/AssetTosModal";
import {
    Banner,
    Button,
    Card,
    CircularProgress,
    EmptyState,
    ErrorState,
    Icon,
    IconButton,
    LoadingState,
    Menu,
    PageContainer,
    PageHeader,
    SegmentedButton,
    Surface,
} from "@/components/md3";
import { isModalHistoryRoundTrip } from "@/components/md3";
import { getAssetDomain } from "@/lib/assets";
import {
    changedFileUrl,
    conversionCount,
    fetchVersionChanges,
    fetchVersionHistory,
    shortVersion,
    type ChangedFile,
    type ChangeKind,
    type VersionChanges,
    type VersionEntry,
} from "@/lib/assetHistory";
import {
    mdArticle,
    mdAudioFile,
    mdCheck,
    mdChevronLeft,
    mdChevronRight,
    mdClose,
    mdContentCopy,
    mdDescription,
    mdDockToRight,
    mdDownload,
    mdDraft,
    mdFolder,
    mdFolderFill,
    mdFolderOff,
    mdGridView,
    mdHistory,
    mdHome,
    mdImage,
    mdKeyboardArrowDown,
    mdKeyboardArrowUp,
    mdRefresh,
    mdSearch,
    mdVideoFile,
    mdViewList,
    mdVolumeUp,
} from "@/components/md3/icons";
import {
    buildDiffDirectoryTree,
    countDiffCauses,
    getDiffCause,
    getDiffMediaCategory,
    getFileExtension,
    getFileName,
    listDiffDirectory,
    searchDiffDirectory,
    type DiffCause,
    type DiffMediaCategory,
} from "./diffTree";

const PAGE_SIZE = 200;

type KindFilter = "all" | ChangeKind;
type MediaFilter = "all" | DiffMediaCategory;
type CauseFilter = "all" | DiffCause;

const CHANGE_BADGES: Record<ChangeKind, { labelKey: string; className: string }> = {
    added: { labelKey: "page.assetVersions.changeAdded", className: "bg-primary-container text-on-primary-container" },
    changed: { labelKey: "page.assetVersions.changeUpdated", className: "bg-tertiary-container text-on-tertiary-container" },
    removed: { labelKey: "page.assetVersions.changeRemoved", className: "bg-error-container text-on-error-container" },
};

const CAUSE_LABEL_KEYS: Record<DiffCause, string> = {
    source: "page.assetVersions.causeSource",
    conversion: "page.assetVersions.causeConversion",
    unknown: "page.assetVersions.causeUnknown",
};

function formatBytes(bytes?: number): string {
    if (bytes === undefined || bytes === null) return "-";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function normalizeMediaFilter(raw: string | null): MediaFilter {
    if (!raw || raw === "default" || raw === "all") return "all";
    if (raw === "webp" || raw === "png" || raw === "image") return "image";
    if (raw === "mp3" || raw === "audio") return "audio";
    if (raw === "mp4" || raw === "video") return "video";
    if (raw === "json" || raw === "txt" || raw === "text") return "text";
    if (raw === "other") return "other";
    return "all";
}

function normalizeCauseFilter(raw: string | null): CauseFilter {
    return raw === "source" || raw === "conversion" || raw === "unknown" ? raw : "all";
}

function getRelativeParent(fullPath: string, basePath: string): string {
    const rel = basePath && fullPath.startsWith(`${basePath}/`) ? fullPath.slice(basePath.length + 1) : fullPath;
    const slash = rel.lastIndexOf("/");
    return slash > 0 ? rel.slice(0, slash) : "";
}

function getDiffFileIcon(category: DiffMediaCategory, size = 20) {
    switch (category) {
        case "image": return <Icon path={mdImage} size={size} className="text-primary" />;
        case "audio": return <Icon path={mdAudioFile} size={size} className="text-tertiary" />;
        case "video": return <Icon path={mdVideoFile} size={size} className="text-primary" />;
        case "text": return <Icon path={mdArticle} size={size} className="text-secondary" />;
        default: return <Icon path={mdDraft} size={size} className="text-on-surface-variant" />;
    }
}

function FilterChip({ selected, selectedClassName, onClick, children }: {
    selected: boolean;
    selectedClassName: string;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={`state-layer focus-ring inline-flex h-8 shrink-0 items-center rounded-full px-3 type-label-l transition-colors ${
                selected
                    ? selectedClassName
                    : "border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container"
            }`}
        >
            {children}
        </button>
    );
}

function AssetVersionsContent() {
    const { assetSource } = useTheme();
    const { t, formatNumber, formatDate } = useI18n();

    // ==================== Query & layout states ====================

    const { servers, server, pinned, ready, chooseServer } = usePageServer();
    const [version, setVersion] = useState<string>(() => {
        if (typeof window !== "undefined") {
            return new URLSearchParams(window.location.search).get("version") || "";
        }
        return "";
    });

    const [prefix, setPrefix] = useState<string>(() => {
        if (typeof window !== "undefined") {
            return new URLSearchParams(window.location.search).get("prefix")?.replace(/^\/+|\/+$/g, "") || "";
        }
        return "";
    });

    const [historyStack, setHistoryStack] = useState<string[]>(() => [prefix]);
    const [historyIndex, setHistoryIndex] = useState(0);

    const [viewMode, setViewMode] = useState<"list" | "grid">("list");
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showVersionPicker, setShowVersionPicker] = useState(false);
    const [versionQuery, setVersionQuery] = useState("");

    const [kindFilter, setKindFilter] = useState<KindFilter>("all");
    const [causeFilter, setCauseFilter] = useState<CauseFilter>(() => {
        if (typeof window !== "undefined") {
            return normalizeCauseFilter(new URLSearchParams(window.location.search).get("cause"));
        }
        return "all";
    });
    const [mediaFilter, setMediaFilter] = useState<MediaFilter>(() => {
        if (typeof window !== "undefined") {
            return normalizeMediaFilter(new URLSearchParams(window.location.search).get("types"));
        }
        return "all";
    });
    const [searchQuery, setSearchQuery] = useState("");
    const deferredQuery = useDeferredValue(searchQuery.trim());
    const [sortBy, setSortBy] = useState<"size" | "path">("path");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const [showTos, setShowTos] = useState(false);

    // Load persisted view mode and responsive sidebar default on mount
    useEffect(() => {
        if (typeof window !== "undefined") {
            const savedMode = localStorage.getItem("asset-versions-view-mode");
            if (savedMode === "grid" || savedMode === "list") {
                setViewMode(savedMode);
            }
            if (window.innerWidth < 1024) {
                setSidebarOpen(false);
            }
        }
    }, []);

    const handleViewModeChange = (mode: "list" | "grid") => {
        setViewMode(mode);
        if (typeof window !== "undefined") {
            localStorage.setItem("asset-versions-view-mode", mode);
        }
    };

    // The URL of the current history entry, as the state below names it.
    const stateUrl = useCallback(() => {
        const url = new URL(window.location.href);
        if (pinned) {
            url.searchParams.set("server", pinned);
        } else {
            url.searchParams.delete("server");
        }
        if (version) {
            url.searchParams.set("version", version);
        } else {
            url.searchParams.delete("version");
        }
        if (prefix) {
            url.searchParams.set("prefix", prefix);
        } else {
            url.searchParams.delete("prefix");
        }
        if (mediaFilter !== "all") {
            url.searchParams.set("types", mediaFilter);
        } else {
            url.searchParams.delete("types");
        }
        if (causeFilter !== "all") {
            url.searchParams.set("cause", causeFilter);
        } else {
            url.searchParams.delete("cause");
        }
        url.searchParams.delete("action");
        return url.toString();
    }, [pinned, version, prefix, mediaFilter, causeFilter]);

    // Sync state to URL query parameters
    useEffect(() => {
        if (!ready) return;
        window.history.replaceState({}, "", stateUrl());
    }, [ready, stateUrl]);

    // Handle browser back/forward navigation
    useEffect(() => {
        const handlePopState = () => {
            // A modal the picker opened removed its history entry, and this popstate is the
            // `back` it queued: what the page did while it was open stays, and the entry it
            // returned to is renamed to match.
            if (isModalHistoryRoundTrip()) {
                window.history.replaceState({}, "", stateUrl());
                return;
            }
            const params = new URLSearchParams(window.location.search);
            const nextVersion = params.get("version") || "";
            const nextPrefix = params.get("prefix")?.replace(/^\/+|\/+$/g, "") || "";
            setVersion(nextVersion);
            setPrefix(nextPrefix);
            setHistoryStack([nextPrefix]);
            setHistoryIndex(0);
            setMediaFilter(normalizeMediaFilter(params.get("types")));
            setCauseFilter(normalizeCauseFilter(params.get("cause")));
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [stateUrl]);

    const origin = useMemo(() => getAssetDomain(assetSource), [assetSource]);

    // ==================== Version timeline states ====================

    const [versions, setVersions] = useState<VersionEntry[]>([]);
    const [isVersionsLoading, setIsVersionsLoading] = useState(true);
    const [versionsError, setVersionsError] = useState<string | null>(null);
    const versionRef = useRef(version);
    versionRef.current = version;

    const fetchVersions = useCallback(async () => {
        if (!ready) return;
        try {
            setIsVersionsLoading(true);
            setVersionsError(null);
            const list = await fetchVersionHistory(origin, server);
            setVersions(list);
            if (list.length > 0 && (!versionRef.current || !list.some(v => v.published_version === versionRef.current))) {
                setVersion(list[0].published_version);
                setPrefix("");
                setHistoryStack([""]);
                setHistoryIndex(0);
            }
        } catch (err) {
            console.error("Failed to load asset versions:", err);
            setVersionsError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setIsVersionsLoading(false);
        }
    }, [ready, server, origin]);

    useEffect(() => {
        fetchVersions();
    }, [fetchVersions]);

    // ==================== Changes states ====================

    const [changes, setChanges] = useState<VersionChanges | null>(null);
    const [isDiffLoading, setIsDiffLoading] = useState(false);
    const [diffError, setDiffError] = useState<string | null>(null);

    // Selected file detail modal
    const [selectedFile, setSelectedFile] = useState<ChangedFile | null>(null);
    const [previewText, setPreviewText] = useState<string | null>(null);
    const [isPreviewTextLoading, setIsPreviewTextLoading] = useState(false);
    const [previewTextError, setPreviewTextError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState(false);

    const listScrollRef = useRef<HTMLDivElement | null>(null);

    const fetchDiff = useCallback(async () => {
        if (!ready || !version) return;
        try {
            setIsDiffLoading(true);
            setDiffError(null);
            setChanges(null);
            setChanges(await fetchVersionChanges(origin, server, version));
        } catch (err) {
            console.error("Failed to load asset diff:", err);
            setDiffError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setIsDiffLoading(false);
        }
    }, [ready, server, version, origin]);

    useEffect(() => {
        fetchDiff();
    }, [fetchDiff]);

    const diffItems = useMemo(() => changes?.files ?? [], [changes]);

    // Where the changes tell their causes, the page can show those of one cause only: the
    // directory tree, its counts and the listing then all follow that cause.
    const causeCounts = useMemo(() => countDiffCauses(diffItems), [diffItems]);
    const hasCauses = causeCounts.source + causeCounts.conversion > 0;
    const activeCause: CauseFilter = hasCauses ? causeFilter : "all";
    const causeItems = useMemo(
        () => (activeCause === "all" ? diffItems : diffItems.filter(item => getDiffCause(item) === activeCause)),
        [diffItems, activeCause],
    );

    const fileUrl = useCallback(
        (file: ChangedFile) => (changes ? changedFileUrl(origin, server, changes, file) : ""),
        [changes, origin, server],
    );

    // Reset visibleCount when query, filters, directory, or version changes
    const filterKey = `${server}:${version}:${prefix}:${deferredQuery}:${activeCause}:${kindFilter}:${mediaFilter}:${sortBy}:${sortOrder}`;
    const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
    if (filterKey !== prevFilterKey) {
        setPrevFilterKey(filterKey);
        setVisibleCount(PAGE_SIZE);
    }

    // ==================== Navigation handlers ====================

    const selectServer = (srv: (typeof servers)[number]) => {
        if (srv === server) return;
        setVersion("");
        setPrefix("");
        setHistoryStack([""]);
        setHistoryIndex(0);
        chooseServer(srv);
    };

    const selectVersion = (nextVersion: string) => {
        if (nextVersion === version) return;
        setVersion(nextVersion);
        setPrefix("");
        setHistoryStack([""]);
        setHistoryIndex(0);
        if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
    };

    const navigateTo = (path: string) => {
        const normalized = path.replace(/^\/+|\/+$/g, "");
        if (normalized === prefix) return;
        setPrefix(normalized);
        setHistoryStack(prev => [...prev.slice(0, historyIndex + 1), normalized]);
        setHistoryIndex(prev => prev + 1);
        if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
    };

    const handleHistoryBack = () => {
        if (historyIndex <= 0) return;
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setPrefix(historyStack[nextIdx]);
        if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
    };

    const handleHistoryForward = () => {
        if (historyIndex >= historyStack.length - 1) return;
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setPrefix(historyStack[nextIdx]);
        if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
    };

    const handleGoUp = () => {
        if (!prefix) return;
        const parts = prefix.split("/").filter(Boolean);
        navigateTo(parts.slice(0, -1).join("/"));
    };

    const handleRefresh = () => {
        fetchVersions();
        if (version) fetchDiff();
    };

    // ==================== Directory tree & filtering ====================

    const diffTree = useMemo(() => buildDiffDirectoryTree(causeItems), [causeItems]);

    const isSearching = deferredQuery.length > 0;

    // Base listing before kind/media filters
    const scopedListing = useMemo(() => {
        return isSearching
            ? searchDiffDirectory(diffTree, prefix, deferredQuery)
            : listDiffDirectory(diffTree, prefix);
    }, [diffTree, prefix, isSearching, deferredQuery]);

    // Counts for filter chips based on the current scoped listing
    const scopeCounts = useMemo(() => {
        const kinds: Record<KindFilter, number> = {
            all: scopedListing.files.length,
            added: 0,
            changed: 0,
            removed: 0,
        };
        const media: Record<MediaFilter, number> = {
            all: scopedListing.files.length,
            image: 0,
            audio: 0,
            video: 0,
            text: 0,
            other: 0,
        };
        for (const item of scopedListing.files) {
            kinds[item.kind] += 1;
            media[getDiffMediaCategory(item)] += 1;
        }
        return { kinds, media };
    }, [scopedListing]);

    const folders = useMemo(() => {
        const matched = scopedListing.folders.filter(folder => {
            if (kindFilter === "all") return true;
            return folder.counts[kindFilter] > 0;
        });
        return [...matched].sort((a, b) =>
            sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
        );
    }, [scopedListing.folders, kindFilter, sortOrder]);

    const files = useMemo(() => {
        const filtered = scopedListing.files.filter(item => {
            if (kindFilter !== "all" && item.kind !== kindFilter) return false;
            if (mediaFilter !== "all" && getDiffMediaCategory(item) !== mediaFilter) return false;
            return true;
        });

        const isAsc = sortOrder === "asc";
        return [...filtered].sort((a, b) => {
            if (sortBy === "size") {
                const diff = (a.size || 0) - (b.size || 0);
                return isAsc ? diff : -diff;
            }
            const nameA = getFileName(a.path);
            const nameB = getFileName(b.path);
            return isAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        });
    }, [scopedListing.files, kindFilter, mediaFilter, sortBy, sortOrder]);

    const currentItemCount = folders.length + files.length;
    const shownFolders = folders.slice(0, visibleCount);
    const shownFiles = files.slice(0, Math.max(0, visibleCount - shownFolders.length));
    const shownItemCount = shownFolders.length + shownFiles.length;
    const hasMore = currentItemCount > shownItemCount;
    const loadMoreRef = useAutoLoadMore({
        hasMore,
        itemCount: shownItemCount,
        onLoadMore: () => setVisibleCount(count => count + PAGE_SIZE),
        scrollRootRef: listScrollRef,
    });

    const breadcrumbs = useMemo(() => {
        const parts = prefix.split("/").filter(Boolean);
        return [
            { name: t("page.assetViewer.root"), path: "" },
            ...parts.map((part, index) => ({ name: part, path: parts.slice(0, index + 1).join("/") })),
        ];
    }, [prefix, t]);

    const selectedVersionIndex = useMemo(
        () => versions.findIndex(v => v.published_version === version),
        [versions, version],
    );

    const selectedVersionMeta = selectedVersionIndex >= 0 ? versions[selectedVersionIndex] : null;

    const filteredVersions = useMemo(() => {
        const q = versionQuery.trim().toLowerCase();
        if (!q) return versions;
        return versions.filter(v =>
            v.published_version.toLowerCase().includes(q) ||
            (v.published_at && v.published_at.toLowerCase().includes(q)),
        );
    }, [versions, versionQuery]);

    const hasActiveDiffFilters =
        searchQuery !== "" ||
        activeCause !== "all" ||
        kindFilter !== "all" ||
        mediaFilter !== "all" ||
        sortBy !== "path" ||
        sortOrder !== "asc";

    const resetFilters = useCallback(() => {
        setSearchQuery("");
        setCauseFilter("all");
        setKindFilter("all");
        setMediaFilter("all");
        setSortBy("path");
        setSortOrder("asc");
    }, []);

    // ==================== File preview helpers ====================

    const handleFetchPreviewText = async (file: ChangedFile) => {
        try {
            setIsPreviewTextLoading(true);
            setPreviewTextError(null);
            setPreviewText(null);

            const res = await fetch(fileUrl(file));
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

    const toggleSortColumn = (col: "path" | "size") => {
        if (sortBy === col) {
            setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortBy(col);
            setSortOrder(col === "size" ? "desc" : "asc");
        }
    };

    // ==================== Filter options & helpers ====================

    const kindChipOptions: Array<{ key: KindFilter; label: string; count: number; alwaysShowCount?: boolean }> = [
        { key: "all", label: t("page.assetVersions.filterAll"), count: scopeCounts.kinds.all, alwaysShowCount: true },
        { key: "added", label: t("page.assetVersions.changeAdded"), count: scopeCounts.kinds.added },
        { key: "changed", label: t("page.assetVersions.changeUpdated"), count: scopeCounts.kinds.changed },
        { key: "removed", label: t("page.assetVersions.changeRemoved"), count: scopeCounts.kinds.removed },
    ];

    const mediaChipOptions: Array<{ key: MediaFilter; label: string; count: number }> = [
        { key: "all", label: t("page.assetVersions.filterAll"), count: scopeCounts.media.all },
        { key: "image", label: t("page.assetViewer.typeImage"), count: scopeCounts.media.image },
        { key: "audio", label: t("page.assetViewer.typeAudio"), count: scopeCounts.media.audio },
        { key: "video", label: t("page.assetViewer.typeVideo"), count: scopeCounts.media.video },
        { key: "text", label: t("page.assetViewer.typeText"), count: scopeCounts.media.text },
    ];
    if (scopeCounts.media.other > 0 || mediaFilter === "other") {
        mediaChipOptions.push({ key: "other", label: t("page.assetViewer.typeOther"), count: scopeCounts.media.other });
    }

    const causeOptions: Array<{ key: CauseFilter; label: string; count: number }> = [
        { key: "all", label: t("page.assetVersions.causeAll"), count: diffItems.length },
        { key: "source", label: t(CAUSE_LABEL_KEYS.source), count: causeCounts.source },
        { key: "conversion", label: t(CAUSE_LABEL_KEYS.conversion), count: causeCounts.conversion },
    ];
    if (causeCounts.unknown > 0 || causeFilter === "unknown") {
        causeOptions.push({ key: "unknown", label: t(CAUSE_LABEL_KEYS.unknown), count: causeCounts.unknown });
    }

    const getMediaTypeBadge = (item: ChangedFile): string => {
        const cat = getDiffMediaCategory(item);
        switch (cat) {
            case "image": return t("page.assetViewer.typeImage");
            case "audio": return t("page.assetViewer.typeAudio");
            case "video": return t("page.assetViewer.typeVideo");
            case "text": return t("page.assetViewer.typeText");
            default: {
                const ext = getFileExtension(item.path);
                return ext ? ext.toUpperCase() : t("page.assetViewer.typeAsset");
            }
        }
    };

    // ==================== Sidebar filters (global FilterDrawer) ====================

    const quickFilterContent = (
        <BaseFilters
            filteredCount={files.length}
            totalCount={diffItems.length}
            countUnit={t("page.assetVersions.fileUnit")}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("page.assetVersions.searchPlaceholder")}
            sortOptions={[
                { id: "path", label: t("page.assetVersions.path") },
                { id: "size", label: t("page.assetVersions.size") },
            ]}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(field, order) => {
                setSortBy(field as "size" | "path");
                setSortOrder(order);
            }}
            hasActiveFilters={hasActiveDiffFilters}
            onReset={resetFilters}
        >
            <FilterSection label={t("page.assetVersions.serverSelect")}>
                <div className="flex flex-wrap gap-2">
                    {servers.map(srv => (
                        <FilterButton
                            key={srv}
                            selected={server === srv}
                            onClick={() => selectServer(srv)}
                        >
                            <ServerRegionLabel server={srv} />
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>

            {hasCauses && (
                <FilterSection label={t("page.assetVersions.causeLabel")}>
                    <div className="flex flex-wrap gap-2">
                        {causeOptions.map(opt => (
                            <FilterButton
                                key={opt.key}
                                selected={activeCause === opt.key}
                                onClick={() => setCauseFilter(opt.key)}
                            >
                                {opt.label}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>
            )}

            <FilterSection label={t("page.assetVersions.changeTypeLabel")}>
                <div className="grid grid-cols-2 gap-2">
                    {kindChipOptions.map(opt => (
                        <FilterButton
                            key={opt.key}
                            selected={kindFilter === opt.key}
                            onClick={() => setKindFilter(opt.key)}
                        >
                            {opt.label}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>

            <FilterSection label={t("page.assetVersions.fileTypeLabel")}>
                <div className="flex flex-wrap gap-2">
                    {mediaChipOptions.map(opt => (
                        <FilterButton
                            key={opt.key}
                            selected={mediaFilter === opt.key}
                            onClick={() => setMediaFilter(opt.key)}
                        >
                            {opt.label}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>
        </BaseFilters>
    );

    useQuickFilter(t("page.assetVersions.title"), quickFilterContent, [
        server,
        version,
        searchQuery,
        causeFilter,
        causeCounts,
        kindFilter,
        mediaFilter,
        sortBy,
        sortOrder,
        files.length,
        diffItems.length,
        t,
    ]);

    // ==================== Modal header & render helpers ====================

    const modalHeaderActions = useMemo(() => {
        if (!selectedFile) return null;
        const url = fileUrl(selectedFile);
        return (
            <div className="flex items-center gap-1">
                <IconButton
                    icon={copyFeedback ? mdCheck : mdContentCopy}
                    size="xs"
                    onClick={() => handleCopyToClipboard(url)}
                    label={copyFeedback ? t("page.assetVersions.copied") : t("page.assetVersions.copyLink")}
                />
                <ExternalLink
                    href={url}
                    className="state-layer focus-ring flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
                    title={t("page.assetVersions.download")}
                >
                    <Icon path={mdDownload} size={20} />
                </ExternalLink>
            </div>
        );
    }, [selectedFile, fileUrl, copyFeedback, t]);

    const renderChangeTypeBadge = (kind: ChangeKind) => (
        <span className={`shrink-0 rounded-md3-sm px-2 py-0.5 type-label-s ${CHANGE_BADGES[kind].className}`}>
            {t(CHANGE_BADGES[kind].labelKey)}
        </span>
    );

    // Marks the changes that only the conversion made while the changes of every cause are shown.
    const renderConversionMark = (item: ChangedFile) =>
        activeCause === "all" && item.cause === "conversion" ? (
            <span
                className="shrink-0 rounded-md3-xs bg-surface-container-highest px-1.5 py-0.5 type-label-s text-on-surface-variant"
                title={t("page.assetVersions.causeConversionHint")}
            >
                {t(CAUSE_LABEL_KEYS.conversion)}
            </span>
        ) : null;

    const formatPublishedAt = (publishedAt: string) =>
        formatDate(new Date(publishedAt), {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });

    const checkerboardClassName =
        "bg-surface-container-high bg-[radial-gradient(var(--md-sys-color-outline-variant)_1px,transparent_1px)]";

    const selectedCategory = selectedFile ? getDiffMediaCategory(selectedFile) : null;

    return (
        <PageContainer wide>
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

            {/* Compact Version Picker & Server / Explorer Controls */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
                {/* Compact Version Picker + Quick Stepper */}
                <div className="flex items-center gap-0.5 rounded-full border border-outline-variant bg-surface-card p-0.5">
                    <IconButton
                        icon={mdChevronLeft}
                        size="xs"
                        disabled={selectedVersionIndex < 0 || selectedVersionIndex >= versions.length - 1}
                        onClick={() => {
                            if (selectedVersionIndex >= 0 && selectedVersionIndex < versions.length - 1) {
                                selectVersion(versions[selectedVersionIndex + 1].published_version);
                            }
                        }}
                        label={t("page.assetVersions.prevVersion")}
                    />
                    <button
                        type="button"
                        onClick={() => setShowVersionPicker(true)}
                        className="state-layer focus-ring inline-flex h-8 items-center gap-2 rounded-full px-2.5 text-left"
                    >
                        <Icon path={mdHistory} size={18} className="shrink-0 text-primary" />
                        <span className="truncate font-mono type-label-l font-medium text-on-surface">
                            {version ? shortVersion(version) : t("page.assetVersions.selectVersion")}
                        </span>
                        {selectedVersionIndex === 0 && (
                            <span className="hidden rounded-md3-xs bg-primary px-1.5 py-0.5 type-label-s text-on-primary sm:inline">
                                {t("page.assetVersions.latestBadge")}
                            </span>
                        )}
                        <Icon path={mdKeyboardArrowDown} size={18} className="shrink-0 text-on-surface-variant" />
                    </button>
                    <IconButton
                        icon={mdChevronRight}
                        size="xs"
                        disabled={selectedVersionIndex <= 0}
                        onClick={() => {
                            if (selectedVersionIndex > 0) {
                                selectVersion(versions[selectedVersionIndex - 1].published_version);
                            }
                        }}
                        label={t("page.assetVersions.nextVersion")}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Menu
                        align="end"
                        anchor={(props) => (
                            <Button {...props} variant="outlined" size="xs" trailingIcon={mdKeyboardArrowDown}>
                                <ServerRegionLabel server={server} />
                            </Button>
                        )}
                        items={servers.map(srv => ({
                            key: srv,
                            label: <ServerRegionLabel server={srv} />,
                            onSelect: () => selectServer(srv),
                        }))}
                    />
                    <Button
                        variant="text"
                        size="xs"
                        icon={mdFolder}
                        href={pinned ? `/asset-viewer?server=${pinned}` : "/asset-viewer"}
                    >
                        {t("layout.nav.items.assetViewer")}
                    </Button>
                </div>
            </div>

            {/* Multi-Pane Version & Diff Explorer Frame */}
            <Surface tone="card" radius="xl" className="overflow-hidden">
                {/* Top Navigation, Breadcrumbs, Search & View Mode Toolbar */}
                <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/70 px-3 py-2.5 sm:px-4">
                    <div className="flex shrink-0 items-center gap-0.5">
                        <IconButton
                            icon={mdDockToRight}
                            size="xs"
                            selected={sidebarOpen}
                            onClick={() => setSidebarOpen(prev => !prev)}
                            label={t("page.assetViewer.toggleSidebar")}
                            className={sidebarOpen ? "bg-primary-container/75 text-primary" : undefined}
                        />
                        <IconButton
                            icon={mdChevronLeft}
                            size="xs"
                            disabled={historyIndex <= 0}
                            onClick={handleHistoryBack}
                            label={t("page.assetViewer.navBack")}
                        />
                        <IconButton
                            icon={mdChevronRight}
                            size="xs"
                            disabled={historyIndex >= historyStack.length - 1}
                            onClick={handleHistoryForward}
                            label={t("page.assetViewer.navForward")}
                        />
                        <IconButton
                            icon={mdKeyboardArrowUp}
                            size="xs"
                            disabled={!prefix}
                            onClick={handleGoUp}
                            label={t("page.assetViewer.parentDir")}
                        />
                        <IconButton
                            icon={mdRefresh}
                            size="xs"
                            onClick={handleRefresh}
                            label={t("common.action.refresh")}
                            className={isVersionsLoading || isDiffLoading ? "[&_svg]:animate-spin" : undefined}
                        />
                    </div>

                    {/* Breadcrumbs */}
                    <nav
                        aria-label={t("page.assetViewer.directoryTree")}
                        className="custom-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 type-label-l text-on-surface-variant"
                    >
                        {breadcrumbs.map((bc, index) => {
                            const isCurrent = index === breadcrumbs.length - 1;
                            const isRoot = index === 0;
                            return (
                                <div key={bc.path || "root"} className="flex shrink-0 items-center gap-1">
                                    {index > 0 && <span className="text-outline/70">/</span>}
                                    <button
                                        type="button"
                                        onClick={() => navigateTo(bc.path)}
                                        className={`state-layer focus-ring inline-flex items-center gap-1.5 rounded-md3-sm px-2 py-1 transition-colors ${
                                            isCurrent
                                                ? "bg-primary-container text-on-primary-container font-medium"
                                                : "hover:bg-surface-container-high hover:text-primary"
                                        }`}
                                    >
                                        {isRoot && <Icon path={mdHome} size={16} />}
                                        <span>{bc.name}</span>
                                    </button>
                                </div>
                            );
                        })}
                    </nav>

                    {/* Search & View Toggle */}
                    <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                        <div className="relative flex-1 sm:w-64 md:w-72">
                            <Icon
                                path={mdSearch}
                                size={18}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                            />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t("page.assetViewer.searchSubtreePlaceholder")}
                                aria-label={t("page.assetViewer.searchSubtreePlaceholder")}
                                className="focus-ring h-9 w-full rounded-full border border-outline-variant bg-surface-container-lowest pl-9 pr-8 type-body-s text-on-surface placeholder:text-on-surface-variant/75"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    aria-label={t("common.md3.clear")}
                                    className="state-layer focus-ring absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant"
                                >
                                    <Icon path={mdClose} size={16} />
                                </button>
                            )}
                        </div>

                        <SegmentedButton
                            className="w-auto shrink-0"
                            density={-2}
                            iconOnly
                            showCheckmark={false}
                            aria-label={t("page.assetViewer.viewList")}
                            value={viewMode}
                            onValueChange={(mode) => handleViewModeChange(mode as "list" | "grid")}
                            options={[
                                { value: "list", label: t("page.assetViewer.viewList"), icon: mdViewList },
                                { value: "grid", label: t("page.assetViewer.viewGrid"), icon: mdGridView },
                            ]}
                        />
                    </div>
                </div>

                {/* Status Sub-Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/60 bg-surface-container-low/60 px-3 py-1.5 type-label-m text-on-surface-variant sm:px-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <ServerRegionLabel server={server} />
                        {version && (
                            <>
                                <span className="text-outline">·</span>
                                <span className="font-mono text-on-surface">{shortVersion(version)}</span>
                            </>
                        )}
                        {selectedVersionMeta?.published_at && (
                            <span className="hidden text-outline sm:inline">
                                ({formatPublishedAt(selectedVersionMeta.published_at)})
                            </span>
                        )}
                        {changes?.from && (
                            <span className="hidden font-mono text-outline md:inline">
                                · {t("page.assetVersions.comparedFrom", { from: shortVersion(changes.from) })}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 font-mono">
                        {selectedVersionMeta && (
                            <span>
                                {t("page.assetViewer.totalFiles", { count: formatNumber(selectedVersionMeta.files) })}
                            </span>
                        )}
                        {changes && (
                            <span className="text-on-surface">
                                {t("page.assetVersions.changesSummary", { count: formatNumber(diffItems.length) })}
                            </span>
                        )}
                    </div>
                </div>

                {/* Split-Pane Explorer Body (Directory Tree Sidebar + Diff Listing) */}
                <ExplorerSplitPane
                    showSidebar={Boolean(sidebarOpen && changes && diffTree.directories.length > 0 && !isDiffLoading && !diffError)}
                    resizeLabel={t("page.assetViewer.resizeSidebar")}
                    sidebar={
                        changes ? (
                            <DirectoryTreeSidebar
                                root={diffTree}
                                rootLabel={t("page.assetViewer.root")}
                                title={t("page.assetViewer.directoryTree")}
                                activePath={prefix}
                                onSelectPath={navigateTo}
                                renderBadge={(node) => (
                                    <span className="shrink-0 rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 font-mono type-label-s text-on-surface-variant">
                                        {formatNumber(node.counts.total)}
                                    </span>
                                )}
                            />
                        ) : null
                    }
                >

                    {/* Right Column: Filter Chips & Diff Explorer Listing */}
                    <div className="flex min-h-[360px] min-w-0 flex-1 flex-col overflow-hidden">
                        {isVersionsLoading && !version ? (
                            <LoadingState label={t("page.assetVersions.loadingFallback")} />
                        ) : !version ? (
                            <EmptyState icon={mdHistory} title={t("page.assetVersions.emptyVersions")} />
                        ) : isDiffLoading ? (
                            <LoadingState label={t("page.assetVersions.loadingDiff")} />
                        ) : diffError ? (
                            <div className="p-4">
                                <ErrorState
                                    title={t("page.assetVersions.loadFailed")}
                                    message={diffError}
                                    retryLabel={t("common.action.retry")}
                                    onRetry={fetchDiff}
                                />
                            </div>
                        ) : !changes ? (
                            <EmptyState icon={mdHistory} title={t("page.assetVersions.noChangeRecord")} />
                        ) : (
                            <>
                                {/* Combined Kind & Media Filter Chips */}
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/60 px-3 py-2.5 sm:px-4">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {hasCauses && (
                                            <>
                                                {causeOptions.map(opt => (
                                                    <FilterChip
                                                        key={opt.key}
                                                        selected={activeCause === opt.key}
                                                        selectedClassName="bg-tertiary-container text-on-tertiary-container font-medium"
                                                        onClick={() => setCauseFilter(opt.key)}
                                                    >
                                                        {opt.label}
                                                        {(opt.key === "all" || opt.count > 0) && ` (${formatNumber(opt.count)})`}
                                                    </FilterChip>
                                                ))}

                                                <span className="mx-1 hidden h-4 w-px bg-outline-variant/70 sm:inline-block" aria-hidden />
                                            </>
                                        )}

                                        {kindChipOptions.map(opt => (
                                            <FilterChip
                                                key={opt.key}
                                                selected={kindFilter === opt.key}
                                                selectedClassName="bg-primary text-on-primary"
                                                onClick={() => setKindFilter(opt.key)}
                                            >
                                                {opt.label}
                                                {(opt.alwaysShowCount || opt.count > 0) && ` (${formatNumber(opt.count)})`}
                                            </FilterChip>
                                        ))}

                                        <span className="mx-1 hidden h-4 w-px bg-outline-variant/70 sm:inline-block" aria-hidden />

                                        {mediaChipOptions.map(opt => (
                                            <FilterChip
                                                key={opt.key}
                                                selected={mediaFilter === opt.key}
                                                selectedClassName="bg-secondary-container text-on-secondary-container font-medium"
                                                onClick={() => setMediaFilter(opt.key)}
                                            >
                                                {opt.label}
                                                {opt.key !== "all" && opt.count > 0 && ` (${formatNumber(opt.count)})`}
                                            </FilterChip>
                                        ))}
                                    </div>

                                    <span className="shrink-0 type-label-m text-on-surface-variant">
                                        {t("page.assetViewer.summaryCounts", {
                                            folders: formatNumber(folders.length),
                                            files: formatNumber(files.length),
                                        })}
                                    </span>
                                </div>

                                {/* Search indicator */}
                                {isSearching && (
                                    <div className="flex items-center justify-between gap-2 border-b border-outline-variant/40 bg-secondary-container/30 px-4 py-1.5 type-body-s text-on-surface-variant">
                                        <span className="truncate">
                                            {t("page.assetViewer.searchingSubtree")}:{" "}
                                            <strong className="text-on-surface">{deferredQuery}</strong>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery("")}
                                            className="focus-ring shrink-0 rounded-md3-xs px-1.5 py-0.5 type-label-m text-primary hover:underline"
                                        >
                                            {t("common.md3.clear")}
                                        </button>
                                    </div>
                                )}

                                {/* Listing Area */}
                                <div ref={listScrollRef} className="custom-scrollbar flex-1 overflow-y-auto">
                                    {currentItemCount === 0 ? (
                                        <EmptyState icon={mdFolderOff} title={t("page.assetVersions.emptyDiff")} />
                                    ) : viewMode === "list" ? (
                                        <div>
                                            {/* Sticky Table Header */}
                                            <div className="sticky top-0 z-10 flex select-none items-center gap-3 border-b border-outline-variant/60 bg-surface-container-lowest/95 px-4 py-2 type-label-m text-on-surface-variant">
                                                <div className="w-16 shrink-0">{t("page.assetVersions.changeTypeLabel")}</div>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSortColumn("path")}
                                                    className="focus-ring flex min-w-0 flex-1 items-center gap-1 text-left transition-colors hover:text-primary"
                                                >
                                                    <span>{t("page.assetViewer.columnName")}</span>
                                                    {sortBy === "path" && (
                                                        <Icon
                                                            path={mdKeyboardArrowDown}
                                                            size={16}
                                                            className={sortOrder === "desc" ? "rotate-180" : undefined}
                                                        />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSortColumn("size")}
                                                    className="focus-ring hidden w-36 shrink-0 items-center justify-end gap-1 transition-colors hover:text-primary sm:flex"
                                                >
                                                    <span>{t("page.assetVersions.size")}</span>
                                                    {sortBy === "size" && (
                                                        <Icon
                                                            path={mdKeyboardArrowDown}
                                                            size={16}
                                                            className={sortOrder === "desc" ? "rotate-180" : undefined}
                                                        />
                                                    )}
                                                </button>
                                                <div className="w-20 shrink-0 text-right">{t("page.assetViewer.columnType")}</div>
                                            </div>

                                            <div className="divide-y divide-outline-variant/40">
                                                {/* Folder Rows (Tree mode) */}
                                                {shownFolders.map((folder) => {
                                                    const relParent = isSearching ? getRelativeParent(folder.path, prefix) : "";
                                                    return (
                                                        <button
                                                            key={folder.path}
                                                            type="button"
                                                            onClick={() => navigateTo(folder.path)}
                                                            className="state-layer focus-ring group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-container/60"
                                                        >
                                                            <div className="flex w-16 shrink-0 items-center">
                                                                <span className="rounded-md3-sm bg-surface-container-high px-2 py-0.5 font-mono type-label-s text-on-surface-variant">
                                                                    {formatNumber(folder.counts.total)}
                                                                </span>
                                                            </div>
                                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md3-md bg-tertiary-container/40 text-tertiary">
                                                                <Icon path={mdFolderFill} size={22} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p
                                                                    className="truncate type-title-s text-on-surface transition-colors group-hover:text-primary"
                                                                    title={folder.name}
                                                                >
                                                                    {folder.name}
                                                                </p>
                                                                {relParent && (
                                                                    <p className="truncate font-mono type-label-s text-on-surface-variant">
                                                                        {relParent}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="hidden w-36 shrink-0 flex-wrap items-center justify-end gap-1 font-mono type-label-s sm:flex">
                                                                {folder.counts.added > 0 && (
                                                                    <span className="rounded-md3-xs bg-primary-container px-1.5 py-0.5 text-on-primary-container">
                                                                        +{folder.counts.added}
                                                                    </span>
                                                                )}
                                                                {folder.counts.changed > 0 && (
                                                                    <span className="rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 text-on-tertiary-container">
                                                                        ~{folder.counts.changed}
                                                                    </span>
                                                                )}
                                                                {folder.counts.removed > 0 && (
                                                                    <span className="rounded-md3-xs bg-error-container px-1.5 py-0.5 text-on-error-container">
                                                                        -{folder.counts.removed}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex w-20 shrink-0 justify-end">
                                                                <span className="rounded-md3-sm bg-tertiary-container/50 px-2.5 py-0.5 type-label-s text-on-tertiary-container">
                                                                    {t("page.assetViewer.typeDirectory")}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}

                                                {/* File Rows */}
                                                {shownFiles.map((item) => {
                                                    const category = getDiffMediaCategory(item);
                                                    const url = fileUrl(item);
                                                    const displayName = getFileName(item.path);
                                                    const relParent = isSearching ? getRelativeParent(item.path, prefix) : "";
                                                    const showDelta = item.kind === "changed" && item.previous_size !== undefined;

                                                    return (
                                                        <button
                                                            key={`${item.kind}:${item.path}`}
                                                            type="button"
                                                            onClick={() => setSelectedFile(item)}
                                                            className="state-layer focus-ring group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-container/60"
                                                        >
                                                            <div className="flex w-16 shrink-0 items-center">
                                                                {renderChangeTypeBadge(item.kind)}
                                                            </div>

                                                            <div
                                                                className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md3-md [background-size:6px_6px] ${
                                                                    category === "image" && url ? checkerboardClassName : "bg-surface-container"
                                                                }`}
                                                            >
                                                                {category === "image" && url ? (
                                                                    <img
                                                                        src={url}
                                                                        alt={item.path}
                                                                        loading="lazy"
                                                                        className="h-full w-full object-contain p-0.5"
                                                                        onError={(e) => {
                                                                            (e.target as HTMLElement).style.display = "none";
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    getDiffFileIcon(category, 20)
                                                                )}
                                                            </div>

                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex min-w-0 items-center gap-2">
                                                                    <p
                                                                        className="truncate type-title-s text-on-surface transition-colors group-hover:text-primary"
                                                                        title={item.path}
                                                                    >
                                                                        {displayName}
                                                                    </p>
                                                                    {renderConversionMark(item)}
                                                                </div>
                                                                {relParent && (
                                                                    <p className="truncate font-mono type-label-s text-on-surface-variant">
                                                                        {relParent}
                                                                    </p>
                                                                )}
                                                            </div>

                                                            <div className="hidden w-36 shrink-0 text-right font-mono type-label-s text-on-surface-variant sm:block">
                                                                {showDelta
                                                                    ? `${formatBytes(item.previous_size)} → ${formatBytes(item.size)}`
                                                                    : formatBytes(item.size)}
                                                            </div>

                                                            <div className="flex w-20 shrink-0 justify-end">
                                                                <span className="rounded-md3-sm bg-secondary-container/60 px-2.5 py-0.5 type-label-s text-on-secondary-container">
                                                                    {getMediaTypeBadge(item)}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3 p-3 sm:p-4">
                                            {/* Grid Mode Folders */}
                                            {shownFolders.length > 0 && (
                                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                                                    {shownFolders.map((folder) => {
                                                        const relParent = isSearching ? getRelativeParent(folder.path, prefix) : "";
                                                        return (
                                                            <Card
                                                                key={folder.path}
                                                                variant="filled"
                                                                radius="lg"
                                                                onClick={() => navigateTo(folder.path)}
                                                                className="group select-none p-3.5"
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className="shrink-0 rounded-md3-md bg-tertiary-container/40 p-2 text-tertiary">
                                                                        <Icon path={mdFolderFill} size={26} />
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <p
                                                                            className="truncate type-title-s text-on-surface transition-colors group-hover:text-primary"
                                                                            title={folder.name}
                                                                        >
                                                                            {folder.name}
                                                                        </p>
                                                                        {relParent && (
                                                                            <p className="truncate font-mono type-label-s text-on-surface-variant">
                                                                                {relParent}
                                                                            </p>
                                                                        )}
                                                                        <div className="mt-1 flex flex-wrap gap-1 font-mono type-label-s">
                                                                            {folder.counts.added > 0 && (
                                                                                <span className="text-primary">+{folder.counts.added}</span>
                                                                            )}
                                                                            {folder.counts.changed > 0 && (
                                                                                <span className="text-tertiary">~{folder.counts.changed}</span>
                                                                            )}
                                                                            {folder.counts.removed > 0 && (
                                                                                <span className="text-error">-{folder.counts.removed}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </Card>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Grid Mode Files */}
                                            {shownFiles.length > 0 && (
                                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                                                    {shownFiles.map((item) => {
                                                        const category = getDiffMediaCategory(item);
                                                        const url = fileUrl(item);
                                                        const fileName = getFileName(item.path);
                                                        const relParent = getRelativeParent(item.path, prefix);
                                                        return (
                                                            <Card
                                                                key={`${item.kind}:${item.path}`}
                                                                variant="filled"
                                                                radius="lg"
                                                                onClick={() => setSelectedFile(item)}
                                                                className="group select-none p-3"
                                                            >
                                                                <div className="flex flex-col">
                                                                    <div
                                                                        className={`relative mb-2.5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-md3-md [background-size:8px_8px] ${
                                                                            category === "image" && url ? checkerboardClassName : "bg-surface-container-low"
                                                                        }`}
                                                                    >
                                                                        <span className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">
                                                                            {renderChangeTypeBadge(item.kind)}
                                                                            {renderConversionMark(item)}
                                                                        </span>
                                                                        {category === "image" && url ? (
                                                                            <img
                                                                                src={url}
                                                                                alt={item.path}
                                                                                loading="lazy"
                                                                                className="h-full w-full object-contain p-1.5"
                                                                                onError={(e) => {
                                                                                    (e.target as HTMLElement).style.display = "none";
                                                                                }}
                                                                            />
                                                                        ) : (
                                                                            getDiffFileIcon(category, 32)
                                                                        )}
                                                                    </div>

                                                                    <p
                                                                        className="truncate type-label-l text-on-surface transition-colors group-hover:text-primary"
                                                                        title={item.path}
                                                                    >
                                                                        {fileName}
                                                                    </p>
                                                                    {relParent && (
                                                                        <p className="truncate font-mono type-label-s text-on-surface-variant">
                                                                            {relParent}
                                                                        </p>
                                                                    )}

                                                                    <div className="mt-1.5 flex items-center justify-between gap-1">
                                                                        <span className="type-label-s text-on-surface-variant">
                                                                            {getMediaTypeBadge(item)}
                                                                        </span>
                                                                        <span className="font-mono type-label-s text-on-surface-variant">
                                                                            {formatBytes(item.size)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </Card>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Load More / All Loaded Footer */}
                                    {currentItemCount > 0 && (
                                        <div ref={loadMoreRef} className="px-4 py-6 text-center">
                                            {hasMore ? (
                                                <Button
                                                    variant="tonal"
                                                    size="m"
                                                    onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
                                                >
                                                    {t("page.assetViewer.loadMore")}
                                                    <span className="type-label-l opacity-80">
                                                        {formatNumber(currentItemCount - shownFolders.length - shownFiles.length)}
                                                    </span>
                                                </Button>
                                            ) : (
                                                <div className="type-body-m text-on-surface-variant">
                                                    {t("page.assetVersions.allDiffLoaded", { count: currentItemCount })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </ExplorerSplitPane>
            </Surface>

            {/* File Detail Modal */}
            <Modal
                isOpen={!!selectedFile}
                onClose={() => {
                    setSelectedFile(null);
                    setPreviewText(null);
                    setPreviewTextError(null);
                }}
                title={selectedFile ? getFileName(selectedFile.path) : ""}
                size="md"
                headerActions={modalHeaderActions}
            >
                {selectedFile && (
                    <div className="space-y-6">
                        {/* File Details Grid */}
                        <div className="space-y-2.5 rounded-md3-lg bg-surface-container p-4 type-body-s sm:type-body-m">
                            <div className="flex justify-between gap-4">
                                <span className="shrink-0 text-on-surface-variant">{t("page.assetVersions.changeTypeLabel")}</span>
                                {renderChangeTypeBadge(selectedFile.kind)}
                            </div>
                            {selectedFile.cause && (
                                <div className="flex justify-between gap-4">
                                    <span className="shrink-0 text-on-surface-variant">{t("page.assetVersions.causeLabel")}</span>
                                    <span className="text-right text-on-surface">
                                        {t(CAUSE_LABEL_KEYS[selectedFile.cause])}
                                        {selectedFile.cause === "conversion" && (
                                            <span className="block type-label-s text-on-surface-variant">
                                                {t("page.assetVersions.causeConversionHint")}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-col gap-1">
                                <span className="text-on-surface-variant">{t("page.assetVersions.path")}</span>
                                <span className="select-all break-all font-mono type-label-s text-on-surface sm:type-label-m">
                                    {selectedFile.path}
                                </span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="shrink-0 text-on-surface-variant">{t("page.assetVersions.size")}</span>
                                <span className="text-right font-mono type-label-l text-on-surface">{formatBytes(selectedFile.size)}</span>
                            </div>
                            {selectedFile.kind === "changed" && selectedFile.previous_size !== undefined && (
                                <div className="flex justify-between gap-4">
                                    <span className="shrink-0 text-on-surface-variant">{t("page.assetVersions.previousSize")}</span>
                                    <span className="text-right font-mono type-label-l text-on-surface-variant">
                                        {formatBytes(selectedFile.previous_size)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Inline Previews */}
                        <div className="flex flex-col items-center justify-center">
                            {selectedCategory === "image" && (
                                <div className={`relative flex max-h-72 w-full justify-center rounded-md3-lg p-4 [background-size:10px_10px] ${checkerboardClassName}`}>
                                    <img
                                        src={fileUrl(selectedFile)}
                                        alt={selectedFile.path}
                                        className="max-h-64 rounded-md3-sm object-contain"
                                        onError={(e) => {
                                            (e.target as HTMLElement).style.display = "none";
                                        }}
                                    />
                                </div>
                            )}

                            {selectedCategory === "audio" && (
                                <div className="w-full rounded-md3-lg bg-surface-container p-4">
                                    <p className="mb-2 flex items-center gap-1.5 type-label-l text-on-surface-variant">
                                        <Icon path={mdVolumeUp} size={18} />
                                        {t("page.assetVersions.playAudio")}
                                    </p>
                                    <audio
                                        src={fileUrl(selectedFile)}
                                        controls
                                        className="w-full"
                                    />
                                </div>
                            )}

                            {selectedCategory === "video" && (
                                <div className="w-full rounded-md3-lg bg-surface-container p-4">
                                    <p className="mb-2 flex items-center gap-1.5 type-label-l text-on-surface-variant">
                                        <Icon path={mdVideoFile} size={18} />
                                        {t("page.assetViewer.playVideo")}
                                    </p>
                                    <video
                                        src={fileUrl(selectedFile)}
                                        controls
                                        className="max-h-72 w-full rounded-md3-sm bg-surface-container-highest"
                                    />
                                </div>
                            )}

                            {selectedCategory === "text" && (
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

            {/* Version Picker Modal */}
            <Modal
                isOpen={showVersionPicker}
                onClose={() => {
                    setShowVersionPicker(false);
                    setVersionQuery("");
                }}
                title={t("page.assetVersions.timeline")}
                size="md"
            >
                <div className="space-y-3">
                    <div className="relative">
                        <Icon
                            path={mdSearch}
                            size={18}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                        />
                        <input
                            type="text"
                            value={versionQuery}
                            onChange={(e) => setVersionQuery(e.target.value)}
                            placeholder={t("page.assetVersions.selectVersion")}
                            aria-label={t("page.assetVersions.selectVersion")}
                            className="focus-ring h-9 w-full rounded-full border border-outline-variant bg-surface-container-lowest pl-9 pr-8 type-body-s text-on-surface placeholder:text-on-surface-variant/75"
                        />
                        {versionQuery && (
                            <button
                                type="button"
                                onClick={() => setVersionQuery("")}
                                aria-label={t("common.md3.clear")}
                                className="state-layer focus-ring absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant"
                            >
                                <Icon path={mdClose} size={16} />
                            </button>
                        )}
                    </div>

                    <div className="custom-scrollbar max-h-[55vh] divide-y divide-outline-variant/40 overflow-y-auto rounded-md3-lg border border-outline-variant/60">
                        {isVersionsLoading ? (
                            <div className="flex justify-center py-8">
                                <CircularProgress size={28} />
                            </div>
                        ) : versionsError ? (
                            <div className="p-3">
                                <ErrorState
                                    title={t("page.assetVersions.loadFailed")}
                                    message={versionsError}
                                    retryLabel={t("common.action.retry")}
                                    onRetry={fetchVersions}
                                />
                            </div>
                        ) : filteredVersions.length === 0 ? (
                            <div className="px-4 py-8 text-center type-body-s text-on-surface-variant">
                                {t("page.assetVersions.emptyVersions")}
                            </div>
                        ) : (
                            filteredVersions.map((v) => {
                                const isSelected = v.published_version === version;
                                const isLatest = versions[0]?.published_version === v.published_version;
                                const hasCounts =
                                    v.added !== undefined &&
                                    v.changed !== undefined &&
                                    v.removed !== undefined;
                                const conversion = conversionCount(v) ?? 0;
                                return (
                                    <button
                                        key={v.published_version}
                                        type="button"
                                        onClick={() => {
                                            selectVersion(v.published_version);
                                            setShowVersionPicker(false);
                                            setVersionQuery("");
                                        }}
                                        className={`state-layer focus-ring flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                                            isSelected
                                                ? "bg-primary-container/75 text-on-primary-container"
                                                : "hover:bg-surface-container/70"
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-mono type-label-l font-semibold">
                                                    {shortVersion(v.published_version)}
                                                </span>
                                                {isLatest && (
                                                    <span className="shrink-0 rounded-md3-xs bg-primary px-1.5 py-0.5 type-label-s text-on-primary">
                                                        {t("page.assetVersions.latestBadge")}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2 type-label-s text-on-surface-variant">
                                                <span>{v.published_at ? formatPublishedAt(v.published_at) : "-"}</span>
                                                <span>·</span>
                                                <span className="font-mono">{formatNumber(v.files)}</span>
                                            </div>
                                            {conversion > 0 && (
                                                <div className="mt-0.5 type-label-s text-on-surface-variant">
                                                    {t("page.assetVersions.conversionCount", { count: formatNumber(conversion) })}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex shrink-0 items-center gap-1 font-mono type-label-s">
                                            {hasCounts ? (
                                                <>
                                                    {(v.added ?? 0) > 0 && (
                                                        <span className="rounded-md3-xs bg-primary-container px-1.5 py-0.5 text-on-primary-container">
                                                            +{formatNumber(v.added!)}
                                                        </span>
                                                    )}
                                                    {(v.changed ?? 0) > 0 && (
                                                        <span className="rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 text-on-tertiary-container">
                                                            ~{formatNumber(v.changed!)}
                                                        </span>
                                                    )}
                                                    {(v.removed ?? 0) > 0 && (
                                                        <span className="rounded-md3-xs bg-error-container px-1.5 py-0.5 text-on-error-container">
                                                            -{formatNumber(v.removed!)}
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-on-surface-variant/80">-</span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
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
