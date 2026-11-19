"use client";

import { useState, useEffect, useMemo, useRef, useDeferredValue, Suspense } from "react";

import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterSection, FilterButton } from "@/components/common/BaseFilters";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { usePageServer } from "@/hooks/usePageServer";
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
    mdFolderFill,
    mdFolderOpen,
    mdGridView,
    mdHistory,
    mdHome,
    mdImage,
    mdKeyboardArrowDown,
    mdKeyboardArrowUp,
    mdMenuBook,
    mdRefresh,
    mdSearch,
    mdVideoFile,
    mdViewList,
    mdVolumeUp,
} from "@/components/md3/icons";
import { AssetGuide, formatDocUrl } from "./guide";
import DirectoryTreeSidebar from "@/components/common/DirectoryTreeSidebar";
import ExplorerSplitPane from "@/components/common/ExplorerSplitPane";
import {
    ASSET_VIEWS,
    clearAssetTreeCache,
    isAssetView,
    listDirectory,
    loadAssetTree,
    searchDirectory,
    type AssetView,
    type AssetTree,
    type AssetTreeFile,
    type AssetTreeFolder,
} from "@/lib/assetTree";
import { shortVersion } from "@/lib/assetHistory";

const PAGE_SIZE = 200;

export type AssetFilterType = "all" | "directories" | "image" | "audio" | "video" | "text" | "other";

// Merged file format structure (e.g. png + webp combined)
export interface AssetFormatInfo {
    ext: string;
    name: string;
    path: string;
    /** The file in the version being browsed. */
    url: string;
    /** The file in the current version, the link that is copied by default. */
    latestUrl: string;
    size: number;
}

export interface MergedAssetItem {
    id: string;
    baseName: string;
    name: string;
    path: string;
    primaryUrl: string;
    primaryExt: string;
    isImage: boolean;
    isAudio: boolean;
    isVideo: boolean;
    isText: boolean;
    formats: AssetFormatInfo[];
    totalSize: number;
}

function formatBytes(bytes?: number): string {
    if (bytes === undefined || bytes === null) return "-";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function groupFiles(files: AssetTreeFile[]): MergedAssetItem[] {
    const map = new Map<string, MergedAssetItem>();

    for (const file of files) {
        const extMatch = file.name.match(/\.([^.]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : "";

        let key = file.path;
        let baseName = file.name;
        if (ext === "png" || ext === "webp") {
            key = file.path.replace(/\.(png|webp)$/i, "");
            baseName = file.name.replace(/\.(png|webp)$/i, "");
        }

        const formatEntry: AssetFormatInfo = {
            ext,
            name: file.name,
            path: file.path,
            url: file.url,
            latestUrl: file.latestUrl,
            size: file.size,
        };

        const existing = map.get(key);
        if (existing) {
            if (!existing.formats.some(f => f.ext === ext)) {
                existing.formats.push(formatEntry);
            }
            existing.totalSize += file.size;
            if (ext === "webp") {
                existing.primaryUrl = file.url;
                existing.primaryExt = "webp";
            }
        } else {
            const isText = file.mediaType.startsWith("text/") || file.mediaType === "application/json";
            map.set(key, {
                id: key,
                baseName,
                name: file.name,
                path: file.path,
                primaryUrl: file.url,
                primaryExt: ext,
                isImage: file.mediaType.startsWith("image/"),
                isAudio: file.mediaType.startsWith("audio/"),
                isVideo: file.mediaType.startsWith("video/"),
                isText,
                formats: [formatEntry],
                totalSize: file.size,
            });
        }
    }

    for (const item of map.values()) {
        item.formats.sort((a, b) => {
            if (a.ext === "webp") return -1;
            if (b.ext === "webp") return 1;
            return a.ext.localeCompare(b.ext);
        });
        item.name = item.formats.length > 1 ? item.baseName : item.formats[0].name;
    }

    return Array.from(map.values());
}

function getFileIcon(item: Pick<MergedAssetItem, "isImage" | "isAudio" | "isVideo" | "isText" | "name">, size = 24) {
    if (item.isImage) return <Icon path={mdImage} size={size} className="text-primary" />;
    if (item.isAudio) return <Icon path={mdAudioFile} size={size} className="text-tertiary" />;
    if (item.isVideo) return <Icon path={mdVideoFile} size={size} className="text-primary" />;
    if (item.isText) return <Icon path={mdArticle} size={size} className="text-secondary" />;

    const ext = item.name.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "webp", "gif", "svg", "ico"].includes(ext || "")) {
        return <Icon path={mdImage} size={size} className="text-primary" />;
    }
    if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext || "")) {
        return <Icon path={mdAudioFile} size={size} className="text-tertiary" />;
    }
    if (["mp4", "webm", "mov", "mkv"].includes(ext || "")) {
        return <Icon path={mdVideoFile} size={size} className="text-primary" />;
    }
    if (["json", "txt", "csv", "xml", "yaml", "yml"].includes(ext || "")) {
        return <Icon path={mdArticle} size={size} className="text-secondary" />;
    }
    return <Icon path={mdDraft} size={size} className="text-on-surface-variant" />;
}

function getFileCategory(item: MergedAssetItem): Exclude<AssetFilterType, "all" | "directories"> {
    if (item.isImage) return "image";
    if (item.isAudio) return "audio";
    if (item.isVideo) return "video";
    if (item.isText) return "text";
    return "other";
}

function getRelativeParent(fullPath: string, basePath: string): string {
    const rel = basePath && fullPath.startsWith(`${basePath}/`) ? fullPath.slice(basePath.length + 1) : fullPath;
    const slash = rel.lastIndexOf("/");
    return slash > 0 ? rel.slice(0, slash) : "";
}

/** A row of the file details naming a document format or an asset form, linked to its specification. */
function SpecRow({ label, name, locale, title }: { label: string; name: string; locale: string; title: string }) {
    return (
        <div className="flex justify-between gap-4">
            <span className="shrink-0 text-on-surface-variant">{label}</span>
            <ExternalLink
                href={formatDocUrl(name, locale)}
                className="text-right font-mono type-label-l text-primary hover:underline"
                title={title}
            >
                {name}
            </ExternalLink>
        </div>
    );
}

function compareNames(a: string, b: string, sortOrder: "asc" | "desc"): number {
    return sortOrder === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

function AssetViewerContent() {
    const { t, formatNumber, locale } = useI18n();

    // Query states
    const { servers, server, pinned, ready, chooseServer, unpin } = usePageServer();

    // The published view being browsed
    const [view, setView] = useState<AssetView>(() => {
        if (typeof window !== "undefined") {
            const queryView = new URLSearchParams(window.location.search).get("view");
            if (isAssetView(queryView)) return queryView;
        }
        return "storage";
    });

    // Directory path inside the tree of the view, segments joined by "/" ("" is the root)
    const [prefix, setPrefix] = useState<string>(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            return params.get("prefix")?.replace(/^\/+|\/+$/g, "") || "";
        }
        return "";
    });

    // In-explorer navigation history stack
    const [historyStack, setHistoryStack] = useState<string[]>(() => [prefix]);
    const [historyIndex, setHistoryIndex] = useState(0);

    // Collapsible directory tree sidebar (open by default on desktop)
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const [searchQuery, setSearchQuery] = useState("");
    const deferredQuery = useDeferredValue(searchQuery.trim());
    const [filterType, setFilterType] = useState<AssetFilterType>("all");
    const [sortBy, setSortBy] = useState<"name" | "size">("name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [viewMode, setViewMode] = useState<"grid" | "list">("list");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    // Load view mode preference and responsive sidebar default on mount
    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("asset-viewer-mode");
            if (saved === "grid" || saved === "list") {
                setViewMode(saved);
            }
            if (window.innerWidth < 1024) {
                setSidebarOpen(false);
            }
        }
    }, []);

    const handleViewModeChange = (mode: "grid" | "list") => {
        setViewMode(mode);
        if (typeof window !== "undefined") {
            localStorage.setItem("asset-viewer-mode", mode);
        }
    };

    // TOS and guide modal visibility
    const [showTos, setShowTos] = useState(false);
    const [showGuide, setShowGuide] = useState(false);

    // Storage tree states
    const [tree, setTree] = useState<AssetTree | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadToken, setReloadToken] = useState(0);

    // Selected file details & modal state
    const [selectedFile, setSelectedFile] = useState<MergedAssetItem | null>(null);
    const [activeFormatIndex, setActiveFormatIndex] = useState<number>(0);

    const [previewText, setPreviewText] = useState<string | null>(null);
    // The `format` of a previewed JSON document and, for an asset document, the `form` of the
    // asset: each names its specification
    const [previewFormat, setPreviewFormat] = useState<{ format: string; form?: string } | null>(null);
    const [isPreviewTextLoading, setIsPreviewTextLoading] = useState(false);
    const [previewTextError, setPreviewTextError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState(false);

    // Scroll position per region and directory inside the explorer listing pane
    const listScrollRef = useRef<HTMLDivElement | null>(null);
    const scrollByViewRef = useRef<Map<string, number>>(new Map());
    const viewKey = `${server}:${view}:${prefix}`;

    // Reset visibleCount whenever the listing context changes
    const filterKey = `${viewKey}:${deferredQuery}:${filterType}:${sortBy}:${sortOrder}`;
    const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
    if (filterKey !== prevFilterKey) {
        setPrevFilterKey(filterKey);
        setVisibleCount(PAGE_SIZE);
    }

    // Fetch the tree of the selected region and view (cached per region and view)
    useEffect(() => {
        if (!ready) return;
        let active = true;
        setIsLoading(true);
        setError(null);
        loadAssetTree(server, view)
            .then(loaded => {
                if (active) setTree(loaded);
            })
            .catch(err => {
                console.error("Failed to load directory tree:", err);
                if (active) setError(err instanceof Error ? err.message : "Unknown error");
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [ready, server, view, reloadToken]);

    // Restore the scroll position of the listing pane when navigating
    useEffect(() => {
        if (listScrollRef.current) {
            listScrollRef.current.scrollTop = scrollByViewRef.current.get(viewKey) ?? 0;
        }
    }, [viewKey]);

    // Sync state to URL query parameters
    useEffect(() => {
        if (!ready) return;
        const url = new URL(window.location.href);
        if (pinned) {
            url.searchParams.set("server", pinned);
        } else {
            url.searchParams.delete("server");
        }
        url.searchParams.set("view", view);
        if (prefix) {
            url.searchParams.set("prefix", prefix);
        } else {
            url.searchParams.delete("prefix");
        }
        window.history.replaceState({}, "", url.toString());
    }, [ready, pinned, view, prefix]);

    // Handle browser popstate navigation (the server follows it in usePageServer)
    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            const viewParam = params.get("view");
            const nextPrefix = params.get("prefix")?.replace(/^\/+|\/+$/g, "") || "";
            setView(isAssetView(viewParam) ? viewParam : "storage");
            setPrefix(nextPrefix);
            setHistoryStack([nextPrefix]);
            setHistoryIndex(0);
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    const rememberScroll = () => {
        if (listScrollRef.current) {
            scrollByViewRef.current.set(viewKey, listScrollRef.current.scrollTop);
        }
    };

    const navigateTo = (path: string) => {
        const normalized = path.replace(/^\/+|\/+$/g, "");
        if (normalized === prefix) return;
        rememberScroll();
        setPrefix(normalized);
        setHistoryStack(prev => [...prev.slice(0, historyIndex + 1), normalized]);
        setHistoryIndex(prev => prev + 1);
    };

    const handleHistoryBack = () => {
        if (historyIndex <= 0) return;
        rememberScroll();
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setPrefix(historyStack[nextIdx]);
    };

    const handleHistoryForward = () => {
        if (historyIndex >= historyStack.length - 1) return;
        rememberScroll();
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setPrefix(historyStack[nextIdx]);
    };

    const handleGoUp = () => {
        if (!prefix) return;
        const parts = prefix.split("/").filter(Boolean);
        navigateTo(parts.slice(0, -1).join("/"));
    };

    const changeServer = (srv: (typeof servers)[number]) => {
        rememberScroll();
        chooseServer(srv);
    };

    // Paths differ between views, so another view starts at its root
    const changeView = (next: AssetView) => {
        rememberScroll();
        setView(next);
        setPrefix("");
        setHistoryStack([""]);
        setHistoryIndex(0);
        setFilterType("all");
    };

    const refreshTree = () => {
        clearAssetTreeCache(server, view);
        setReloadToken(token => token + 1);
    };

    const isSearching = deferredQuery.length > 0;

    // Subfolders and files of the current directory (or recursive search across current subtree)
    const listing = useMemo(() => {
        if (!tree) return null;
        return isSearching ? searchDirectory(tree, prefix, deferredQuery) : listDirectory(tree, prefix);
    }, [tree, prefix, isSearching, deferredQuery]);

    const mergedFiles = useMemo(() => groupFiles(listing?.files ?? []), [listing]);

    const categoryCounts = useMemo(() => {
        const counts = {
            all: (listing?.folders.length ?? 0) + mergedFiles.length,
            directories: listing?.folders.length ?? 0,
            image: 0,
            audio: 0,
            video: 0,
            text: 0,
            other: 0,
        };
        for (const item of mergedFiles) {
            counts[getFileCategory(item)] += 1;
        }
        return counts;
    }, [listing, mergedFiles]);

    const folders = useMemo(() => {
        if (filterType !== "all" && filterType !== "directories") return [];
        return [...(listing?.folders ?? [])].sort((a, b) => compareNames(a.name, b.name, sortOrder));
    }, [listing, filterType, sortOrder]);

    const files = useMemo(() => {
        if (filterType === "directories") return [];
        return mergedFiles
            .filter(item => filterType === "all" || getFileCategory(item) === filterType)
            .sort((a, b) => {
                if (sortBy === "size") {
                    return sortOrder === "asc" ? a.totalSize - b.totalSize : b.totalSize - a.totalSize;
                }
                return compareNames(a.name, b.name, sortOrder);
            });
    }, [mergedFiles, filterType, sortBy, sortOrder]);

    const totalItemCount = categoryCounts.all;
    const currentItemCount = folders.length + files.length;
    const shownFolders = folders.slice(0, visibleCount);
    const shownFiles = files.slice(0, Math.max(0, visibleCount - shownFolders.length));
    const hasMore = currentItemCount > shownFolders.length + shownFiles.length;

    // Breadcrumbs list
    const breadcrumbs = useMemo(() => {
        const parts = prefix.split("/").filter(Boolean);
        return [
            { name: t("page.assetViewer.root"), path: "" },
            ...parts.map((part, index) => ({ name: part, path: parts.slice(0, index + 1).join("/") })),
        ];
    }, [prefix, t]);

    // Active format in modal
    const activeFormat = useMemo(() => {
        if (!selectedFile || selectedFile.formats.length === 0) return null;
        return selectedFile.formats[activeFormatIndex] || selectedFile.formats[0];
    }, [selectedFile, activeFormatIndex]);

    // Fetch text preview
    const handleFetchPreviewText = async (format: AssetFormatInfo) => {
        if (!format.url) return;
        try {
            setIsPreviewTextLoading(true);
            setPreviewTextError(null);
            setPreviewText(null);
            setPreviewFormat(null);

            const res = await fetch(format.url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const content = await res.text();

            try {
                const parsed = JSON.parse(content);
                setPreviewText(JSON.stringify(parsed, null, 2));
                if (typeof parsed?.format === "string") {
                    setPreviewFormat({ format: parsed.format, form: typeof parsed.form === "string" ? parsed.form : undefined });
                }
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

    // Clipboard copy
    const handleCopyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 2000);
        }).catch(err => {
            console.error("Clipboard copy failed:", err);
        });
    };

    const toggleSortColumn = (col: "name" | "size") => {
        if (sortBy === col) {
            setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortBy(col);
            setSortOrder("asc");
        }
    };

    const activeFiltersCount = (pinned ? 1 : 0) + (filterType !== "all" ? 1 : 0) + (sortBy !== "name" ? 1 : 0) + (sortOrder !== "asc" ? 1 : 0);

    const resetFilters = () => {
        unpin();
        setFilterType("all");
        setSortBy("name");
        setSortOrder("asc");
        setSearchQuery("");
    };

    const filterChipOptions = useMemo(() => {
        const base: Array<{ key: AssetFilterType; label: string; count: number; alwaysShowCount?: boolean }> = [
            { key: "all", label: t("page.assetViewer.allTypes"), count: categoryCounts.all, alwaysShowCount: true },
            { key: "directories", label: t("page.assetViewer.typeDirectory"), count: categoryCounts.directories },
            { key: "image", label: t("page.assetViewer.typeImage"), count: categoryCounts.image },
            { key: "audio", label: t("page.assetViewer.typeAudio"), count: categoryCounts.audio },
            { key: "video", label: t("page.assetViewer.typeVideo"), count: categoryCounts.video },
            { key: "text", label: t("page.assetViewer.typeText"), count: categoryCounts.text },
        ];
        if (categoryCounts.other > 0 || filterType === "other") {
            base.push({ key: "other", label: t("page.assetViewer.typeOther"), count: categoryCounts.other });
        }
        return base;
    }, [categoryCounts, filterType, t]);

    const getFileTypeBadge = (item: MergedAssetItem): string => {
        const cat = getFileCategory(item);
        switch (cat) {
            case "image": return t("page.assetViewer.typeImage");
            case "audio": return t("page.assetViewer.typeAudio");
            case "video": return t("page.assetViewer.typeVideo");
            case "text": return t("page.assetViewer.typeText");
            default: return item.primaryExt ? item.primaryExt.toUpperCase() : t("page.assetViewer.typeAsset");
        }
    };

    const quickFilterContent = (
        <BaseFilters
            filteredCount={currentItemCount}
            totalCount={totalItemCount}
            countUnit={t("page.assetViewer.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("page.assetViewer.searchSubtreePlaceholder")}
            sortOptions={[
                { id: "name", label: t("common.form.uid") },
                { id: "size", label: t("page.assetViewer.size") },
            ]}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(field, order) => {
                setSortBy(field as "name" | "size");
                setSortOrder(order);
            }}
            hasActiveFilters={activeFiltersCount > 0 || searchQuery !== ""}
            onReset={resetFilters}
        >
            <FilterSection label={t("page.assetViewer.serverSelect")}>
                <div className="flex flex-wrap gap-2">
                    {servers.map(srv => (
                        <FilterButton
                            key={srv}
                            selected={server === srv}
                            onClick={() => changeServer(srv)}
                        >
                            <ServerRegionLabel server={srv} />
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>

            <FilterSection label={t("page.assetViewer.columnType")}>
                <div className="flex flex-wrap gap-2">
                    {filterChipOptions.map(opt => (
                        <FilterButton
                            key={opt.key}
                            selected={filterType === opt.key}
                            onClick={() => setFilterType(opt.key)}
                        >
                            {opt.label}
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>
        </BaseFilters>
    );

    useQuickFilter(t("page.assetViewer.title"), quickFilterContent, [
        searchQuery,
        server,
        filterType,
        sortBy,
        sortOrder,
        currentItemCount,
        totalItemCount,
        filterChipOptions,
        t,
    ]);

    const modalHeaderActions = useMemo(() => {
        if (!activeFormat?.url) return null;
        return (
            <div className="flex items-center gap-1">
                <IconButton
                    icon={copyFeedback ? mdCheck : mdContentCopy}
                    size="xs"
                    onClick={() => handleCopyToClipboard(activeFormat.latestUrl)}
                    label={copyFeedback ? t("page.assetViewer.copied") : t("page.assetViewer.copyLink")}
                />
                <Menu
                    align="end"
                    anchor={(props) => (
                        <IconButton {...props} icon={mdKeyboardArrowDown} size="xs" label={t("page.assetViewer.copyOptions")} />
                    )}
                    items={[
                        { key: "latest", label: t("page.assetViewer.copyLink"), onSelect: () => handleCopyToClipboard(activeFormat.latestUrl) },
                        { key: "version", label: t("page.assetViewer.copyVersionLink"), onSelect: () => handleCopyToClipboard(activeFormat.url) },
                    ]}
                />
                <ExternalLink
                    href={activeFormat.url}
                    className="state-layer focus-ring flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
                    title={t("page.assetViewer.download")}
                >
                    <Icon path={mdDownload} size={20} />
                </ExternalLink>
            </div>
        );
    }, [activeFormat, copyFeedback, t]);

    const checkerboardClassName =
        "bg-surface-container-high bg-[radial-gradient(var(--md-sys-color-outline-variant)_1px,transparent_1px)]";

    return (
        <PageContainer wide>
            {/* Page Header */}
            <PageHeader
                eyebrow={t("page.assetViewer.badge")}
                title={t("page.assetViewer.title")}
                highlight={t("page.assetViewer.titleHighlight")}
                description={
                    <>
                        {t("page.assetViewer.descriptionPrefix")}
                        <button
                            type="button"
                            onClick={() => setShowTos(true)}
                            className="focus-ring mx-1 rounded-md3-xs text-primary hover:underline"
                        >
                            {t("page.assetViewer.descriptionLink")}
                        </button>
                        {t("page.assetViewer.descriptionSuffix")}
                    </>
                }
            />

            {/* Compact View Switcher & Server / Changelog Controls */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
                <SegmentedButton
                    className="w-auto"
                    density={-1}
                    aria-label={t("page.assetGuide.view")}
                    value={view}
                    onValueChange={(next) => changeView(next as AssetView)}
                    options={ASSET_VIEWS.map(option => ({
                        value: option,
                        label: t(`page.assetGuide.views.${option}.label`),
                    }))}
                />

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
                            onSelect: () => changeServer(srv),
                        }))}
                    />
                    <Button
                        variant="text"
                        size="xs"
                        icon={mdHistory}
                        href={pinned ? `/asset-versions?server=${pinned}` : "/asset-versions"}
                    >
                        {t("layout.nav.items.assetVersions")}
                    </Button>
                    <Button
                        variant="text"
                        size="xs"
                        icon={mdMenuBook}
                        onClick={() => setShowGuide(true)}
                    >
                        {t("page.assetGuide.open")}
                    </Button>
                </div>
            </div>

            {/* Multi-Pane File Explorer Frame */}
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
                            onClick={refreshTree}
                            label={t("common.action.refresh")}
                            className={isLoading ? "[&_svg]:animate-spin" : undefined}
                        />
                    </div>

                    {/* Breadcrumb Path */}
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
                            onValueChange={(mode) => handleViewModeChange(mode as "grid" | "list")}
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
                        <span className="text-outline">·</span>
                        <span>{t(`page.assetGuide.views.${view}.label`)}</span>
                        {tree && tree.view === view && (
                            <span className="font-mono text-outline">
                                ({shortVersion(tree.document.published_version)})
                            </span>
                        )}
                    </div>
                    {tree && tree.view === view && (
                        <span className="font-mono type-label-m text-on-surface-variant">
                            {t("page.assetViewer.totalFiles", { count: formatNumber(tree.document.files) })}
                        </span>
                    )}
                </div>

                {/* Split-Pane Explorer Body */}
                <ExplorerSplitPane
                    showSidebar={Boolean(sidebarOpen && tree && !isLoading && !error)}
                    resizeLabel={t("page.assetViewer.resizeSidebar")}
                    sidebar={
                        tree ? (
                            <DirectoryTreeSidebar
                                root={tree.document.root}
                                rootLabel={t("page.assetViewer.root")}
                                title={t("page.assetViewer.directoryTree")}
                                activePath={prefix}
                                onSelectPath={navigateTo}
                            />
                        ) : null
                    }
                >

                    {/* Right Main Content Pane */}
                    <div className="flex min-h-[360px] min-w-0 flex-1 flex-col overflow-hidden">
                        {isLoading ? (
                            <LoadingState />
                        ) : error ? (
                            <div className="p-4">
                                <ErrorState
                                    title={t("page.assetViewer.loadFailed")}
                                    message={error}
                                    retryLabel={t("common.action.retry")}
                                    onRetry={refreshTree}
                                />
                            </div>
                        ) : (
                            <>
                                {/* Type Filter Chips & Summary Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/60 px-3 py-2.5 sm:px-4">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {filterChipOptions.map(opt => {
                                            const selected = filterType === opt.key;
                                            const countText = opt.alwaysShowCount || opt.count > 0
                                                ? ` (${formatNumber(opt.count)})`
                                                : "";
                                            return (
                                                <button
                                                    key={opt.key}
                                                    type="button"
                                                    onClick={() => setFilterType(opt.key)}
                                                    aria-pressed={selected}
                                                    className={`state-layer focus-ring inline-flex h-8 shrink-0 items-center rounded-full px-3.5 type-label-l transition-colors ${
                                                        selected
                                                            ? "bg-primary text-on-primary"
                                                            : "border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container"
                                                    }`}
                                                >
                                                    {opt.label}{countText}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <span className="shrink-0 type-label-m text-on-surface-variant">
                                        {t("page.assetViewer.summaryCounts", {
                                            folders: formatNumber(folders.length),
                                            files: formatNumber(files.length),
                                        })}
                                    </span>
                                </div>

                                {/* Subtree Search Indicator */}
                                {isSearching && (
                                    <div className="flex items-center justify-between gap-2 border-b border-outline-variant/40 bg-secondary-container/30 px-4 py-1.5 type-body-s text-on-surface-variant">
                                        <span className="truncate">
                                            {t("page.assetViewer.searchingSubtree")}: <strong className="text-on-surface">{deferredQuery}</strong>
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

                                {/* Scrollable Directory/File Listing */}
                                <div ref={listScrollRef} className="custom-scrollbar flex-1 overflow-y-auto">
                                    {currentItemCount === 0 ? (
                                        <EmptyState icon={mdFolderOpen} title={t("page.assetViewer.emptyFolder")} />
                                    ) : viewMode === "list" ? (
                                        <div>
                                            {/* Sticky Table Header */}
                                            <div className="sticky top-0 z-10 flex select-none items-center gap-3 border-b border-outline-variant/60 bg-surface-container-lowest/95 px-4 py-2 type-label-m text-on-surface-variant">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSortColumn("name")}
                                                    className="focus-ring flex min-w-0 flex-1 items-center gap-1 text-left transition-colors hover:text-primary"
                                                >
                                                    <span>{t("page.assetViewer.columnName")}</span>
                                                    {sortBy === "name" && (
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
                                                    className="focus-ring hidden w-24 shrink-0 items-center justify-end gap-1 sm:flex transition-colors hover:text-primary"
                                                >
                                                    <span>{t("page.assetViewer.size")}</span>
                                                    {sortBy === "size" && (
                                                        <Icon
                                                            path={mdKeyboardArrowDown}
                                                            size={16}
                                                            className={sortOrder === "desc" ? "rotate-180" : undefined}
                                                        />
                                                    )}
                                                </button>
                                                <div className="w-20 shrink-0 text-right">
                                                    {t("page.assetViewer.columnType")}
                                                </div>
                                            </div>

                                            {/* Folder & File Rows */}
                                            <div className="divide-y divide-outline-variant/40">
                                                {shownFolders.map((folder: AssetTreeFolder) => {
                                                    const relParent = isSearching ? getRelativeParent(folder.path, prefix) : "";
                                                    return (
                                                        <button
                                                            key={folder.path}
                                                            type="button"
                                                            onClick={() => navigateTo(folder.path)}
                                                            className="state-layer focus-ring group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-container/60"
                                                        >
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
                                                            <div className="hidden w-24 shrink-0 text-right type-label-m text-on-surface-variant sm:block">
                                                                -
                                                            </div>
                                                            <div className="flex w-20 shrink-0 justify-end">
                                                                <span className="rounded-md3-sm bg-tertiary-container/50 px-2.5 py-0.5 type-label-s text-on-tertiary-container">
                                                                    {t("page.assetViewer.typeDirectory")}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}

                                                {shownFiles.map((item) => {
                                                    const relParent = isSearching ? getRelativeParent(item.path, prefix) : "";
                                                    return (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedFile(item);
                                                                setActiveFormatIndex(0);
                                                            }}
                                                            className="state-layer focus-ring group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-container/60"
                                                        >
                                                            <div
                                                                className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md3-md [background-size:6px_6px] ${
                                                                    item.isImage && item.primaryUrl ? checkerboardClassName : "bg-surface-container"
                                                                }`}
                                                            >
                                                                {item.isImage && item.primaryUrl ? (
                                                                    <img
                                                                        src={item.primaryUrl}
                                                                        alt={item.name}
                                                                        loading="lazy"
                                                                        className="h-full w-full object-contain p-0.5"
                                                                        onError={(e) => {
                                                                            (e.target as HTMLElement).style.display = "none";
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    getFileIcon(item, 20)
                                                                )}
                                                            </div>

                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <p
                                                                        className="truncate type-title-s text-on-surface transition-colors group-hover:text-primary"
                                                                        title={item.name}
                                                                    >
                                                                        {item.name}
                                                                    </p>
                                                                    {item.formats.length > 1 && (
                                                                        <div className="hidden shrink-0 items-center gap-1 md:flex">
                                                                            {item.formats.map((f) => (
                                                                                <span
                                                                                    key={f.ext}
                                                                                    className="rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 type-label-s uppercase text-on-surface-variant"
                                                                                >
                                                                                    {f.ext}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {relParent && (
                                                                    <p className="truncate font-mono type-label-s text-on-surface-variant">
                                                                        {relParent}
                                                                    </p>
                                                                )}
                                                            </div>

                                                            <div className="hidden w-24 shrink-0 text-right font-mono type-label-m text-on-surface-variant sm:block">
                                                                {formatBytes(item.totalSize)}
                                                            </div>

                                                            <div className="flex w-20 shrink-0 justify-end">
                                                                <span className="rounded-md3-sm bg-secondary-container/60 px-2.5 py-0.5 type-label-s text-on-secondary-container">
                                                                    {getFileTypeBadge(item)}
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
                                                    {shownFolders.map((folder: AssetTreeFolder) => {
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
                                                                            className="truncate type-title-s text-on-surface transition-colors duration-200 group-hover:text-primary"
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
                                                        const relParent = isSearching ? getRelativeParent(item.path, prefix) : "";
                                                        return (
                                                            <Card
                                                                key={item.id}
                                                                variant="filled"
                                                                radius="lg"
                                                                onClick={() => {
                                                                    setSelectedFile(item);
                                                                    setActiveFormatIndex(0);
                                                                }}
                                                                className="group select-none p-3"
                                                            >
                                                                <div className="flex flex-col">
                                                                    {item.isImage && item.primaryUrl ? (
                                                                        <div className={`relative mb-2.5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-md3-md [background-size:8px_8px] ${checkerboardClassName}`}>
                                                                            <img
                                                                                src={item.primaryUrl}
                                                                                alt={item.name}
                                                                                loading="lazy"
                                                                                className="h-full w-full object-contain p-1.5"
                                                                                onError={(e) => {
                                                                                    (e.target as HTMLElement).style.display = "none";
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="relative mb-2.5 flex aspect-square w-full items-center justify-center rounded-md3-md bg-surface-container-low">
                                                                            {getFileIcon(item, 32)}
                                                                        </div>
                                                                    )}

                                                                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                                                                        <p
                                                                            className="truncate type-label-l text-on-surface transition-colors duration-200 group-hover:text-primary"
                                                                            title={item.name}
                                                                        >
                                                                            {item.name}
                                                                        </p>
                                                                        {relParent && (
                                                                            <p className="truncate font-mono type-label-s text-on-surface-variant">
                                                                                {relParent}
                                                                            </p>
                                                                        )}

                                                                        <div className="mt-1.5 flex items-center justify-between gap-1">
                                                                            {item.formats.length > 1 ? (
                                                                                <div className="flex items-center gap-1">
                                                                                    {item.formats.map((f) => (
                                                                                        <span
                                                                                            key={f.ext}
                                                                                            className="rounded-md3-xs bg-surface-container-low px-1.5 type-label-s uppercase text-on-surface-variant"
                                                                                        >
                                                                                            {f.ext}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            ) : (
                                                                                <span className="type-label-s text-on-surface-variant">
                                                                                    {getFileTypeBadge(item)}
                                                                                </span>
                                                                            )}
                                                                            <span className="type-label-s text-on-surface-variant">
                                                                                {formatBytes(item.totalSize)}
                                                                            </span>
                                                                        </div>
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
                                        <div className="px-4 py-6 text-center">
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
                                                    {t("page.assetViewer.allLoaded", { count: currentItemCount })}
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

            {/* File Detail & Preview Modal */}
            <Modal
                isOpen={!!selectedFile}
                onClose={() => {
                    setSelectedFile(null);
                    setActiveFormatIndex(0);
                    setPreviewText(null);
                    setPreviewFormat(null);
                    setPreviewTextError(null);
                }}
                title={selectedFile?.name || ""}
                size="md"
                headerActions={modalHeaderActions}
            >
                {selectedFile && activeFormat && (
                    <div className="space-y-6">
                        {/* Format Switcher Tabs (if multiple formats exist, e.g. WEBP + PNG) */}
                        {selectedFile.formats.length > 1 && (
                            <SegmentedButton
                                value={String(activeFormatIndex)}
                                onValueChange={(v) => {
                                    setActiveFormatIndex(Number(v));
                                    setPreviewText(null);
                                    setPreviewFormat(null);
                                }}
                                options={selectedFile.formats.map((f, idx) => ({
                                    value: String(idx),
                                    label: (
                                        <span className="flex items-center gap-2">
                                            <span className="uppercase">{f.ext}</span>
                                            <span className="font-mono type-label-s opacity-75">{formatBytes(f.size)}</span>
                                        </span>
                                    ),
                                }))}
                            />
                        )}

                        {/* File Details Grid */}
                        <div className="space-y-2.5 rounded-md3-lg bg-surface-container p-4 type-body-s sm:type-body-m">
                            <div className="flex justify-between gap-4">
                                <span className="shrink-0 text-on-surface-variant">{t("page.assetViewer.size")}</span>
                                <span className="text-right type-label-l text-on-surface">{formatBytes(activeFormat.size)}</span>
                            </div>
                            {previewFormat && (
                                <SpecRow label={t("page.assetGuide.jsonFormat")} name={previewFormat.format} locale={locale} title={t("page.assetGuide.formatDocs")} />
                            )}
                            {previewFormat?.form && (
                                <SpecRow label={t("page.assetGuide.assetForm")} name={previewFormat.form} locale={locale} title={t("page.assetGuide.formatDocs")} />
                            )}
                        </div>

                        {/* Inline Previews */}
                        <div className="flex flex-col items-center justify-center">
                            {selectedFile.isImage && activeFormat.url && (
                                <div className={`relative flex max-h-72 w-full justify-center rounded-md3-lg p-4 [background-size:10px_10px] ${checkerboardClassName}`}>
                                    <img
                                        src={activeFormat.url}
                                        alt={activeFormat.name}
                                        className="max-h-64 rounded-md3-sm object-contain"
                                        onError={(e) => {
                                            (e.target as HTMLElement).style.display = "none";
                                        }}
                                    />
                                </div>
                            )}

                            {selectedFile.isAudio && activeFormat.url && (
                                <div className="w-full rounded-md3-lg bg-surface-container p-4">
                                    <p className="mb-2 flex items-center gap-1.5 type-label-l text-on-surface-variant">
                                        <Icon path={mdVolumeUp} size={18} />
                                        {t("page.assetViewer.playAudio")}
                                    </p>
                                    <audio
                                        src={activeFormat.url}
                                        controls
                                        className="w-full"
                                    />
                                </div>
                            )}

                            {selectedFile.isVideo && activeFormat.url && (
                                <div className="w-full rounded-md3-lg bg-surface-container p-4">
                                    <p className="mb-2 flex items-center gap-1.5 type-label-l text-on-surface-variant">
                                        <Icon path={mdVideoFile} size={18} />
                                        {t("page.assetViewer.playVideo")}
                                    </p>
                                    <video
                                        src={activeFormat.url}
                                        controls
                                        className="max-h-72 w-full rounded-md3-sm bg-surface-container-highest"
                                    />
                                </div>
                            )}

                            {selectedFile.isText && activeFormat.url && (
                                <div className="w-full">
                                    {previewText === null && !isPreviewTextLoading && !previewTextError && (
                                        <Button
                                            variant="filled"
                                            size="m"
                                            fullWidth
                                            icon={mdDescription}
                                            onClick={() => handleFetchPreviewText(activeFormat)}
                                        >
                                            {t("page.assetViewer.previewText")}
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
                                                {copyFeedback ? t("page.assetViewer.copied") : t("common.action.copy")}
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

            {/* Concise attribution & plain-language audio format modal */}
            <Modal
                isOpen={showGuide}
                onClose={() => setShowGuide(false)}
                title={t("page.assetGuide.title")}
                size="md"
            >
                <AssetGuide />
            </Modal>

            {/* Terms of Service Overlay Modal */}
            <AssetTosModal open={showTos} onOpenChange={setShowTos} />
        </PageContainer>
    );
}

export default function AssetViewerClient() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <Suspense fallback={<LoadingState label={t("page.assetViewer.loadingFallback")} />}>
                <AssetViewerContent />
            </Suspense>
        </MainLayout>
    );
}
