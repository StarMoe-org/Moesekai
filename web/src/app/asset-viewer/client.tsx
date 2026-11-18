"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";

import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterSection, FilterButton } from "@/components/common/BaseFilters";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import Modal from "@/components/common/Modal";
import ExternalLink from "@/components/ExternalLink";
import AssetTosModal from "@/components/common/AssetTosModal";
import LocalizedLink from "@/components/LocalizedLink";
import { Banner, Button, Card, CircularProgress, EmptyState, ErrorState, Icon, IconButton, LoadingState, Menu, PageContainer, PageHeader, SegmentedButton, Surface } from "@/components/md3";
import {
    mdArticle,
    mdAudioFile,
    mdCheck,
    mdChevronLeft,
    mdContentCopy,
    mdDescription,
    mdDownload,
    mdDraft,
    mdFolderFill,
    mdFolderOpen,
    mdGridView,
    mdHistory,
    mdImage,
    mdHelp,
    mdKeyboardArrowDown,
    mdMenuBook,
    mdRefresh,
    mdViewList,
    mdVolumeUp,
} from "@/components/md3/icons";
import { AssetFaq, AssetGuide, fileKind, formatDocUrl } from "./guide";
import {
    ASSET_VIEWS,
    clearAssetTreeCache,
    isAssetView,
    listDirectory,
    loadAssetTree,
    type AssetView,
    type AssetTree,
    type AssetTreeFile,
    type AssetTreeFolder,
} from "@/lib/assetTree";

const PAGE_SIZE = 200;

// Merged file format structure (e.g. png + webp combined)
export interface AssetFormatInfo {
    ext: string;
    name: string;
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
    primaryUrl: string;
    primaryExt: string;
    isImage: boolean;
    isAudio: boolean;
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
                primaryUrl: file.url,
                primaryExt: ext,
                isImage: file.mediaType.startsWith("image/"),
                isAudio: file.mediaType.startsWith("audio/"),
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

function getFileIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "webp", "gif", "svg", "ico"].includes(ext || "")) {
        return <Icon path={mdImage} size={32} className="text-primary" />;
    }
    if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext || "")) {
        return <Icon path={mdAudioFile} size={32} className="text-tertiary" />;
    }
    if (["json", "txt", "csv", "xml", "yaml", "yml"].includes(ext || "")) {
        return <Icon path={mdArticle} size={32} className="text-secondary" />;
    }
    return <Icon path={mdDraft} size={32} className="text-on-surface-variant" />;
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

function FolderIcon() {
    return <Icon path={mdFolderFill} size={32} className="text-tertiary" />;
}

function matchesQuery(name: string, query: string): boolean {
    return !query || name.toLowerCase().includes(query);
}

function compareNames(a: string, b: string, sortOrder: "asc" | "desc"): number {
    return sortOrder === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

function AssetViewerContent() {
    const { t, formatNumber, locale } = useI18n();

    // Query states
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

    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<"all" | "directories" | "files">("all");
    const [sortBy, setSortBy] = useState<"name" | "size">("name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    // Load view mode preference from localStorage on mount
    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("asset-viewer-mode");
            if (saved === "grid" || saved === "list") {
                setViewMode(saved);
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
    const [showFaq, setShowFaq] = useState(false);

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

    // Scroll position per region and directory, restored when returning to it
    const scrollByViewRef = useRef<Map<string, number>>(new Map());
    const viewKey = `${server}:${view}:${prefix}`;

    // Fetch the tree of the selected region and view (cached per region and view)
    useEffect(() => {
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
    }, [server, view, reloadToken]);

    // Restore the scroll position of the directory being shown
    useEffect(() => {
        window.scrollTo({ top: scrollByViewRef.current.get(viewKey) ?? 0, behavior: "instant" });
    }, [viewKey]);

    // Start each listing at its first page
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [server, view, prefix, searchQuery, filterType, sortBy, sortOrder]);

    // Sync state to URL query parameters
    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("server", server);
        url.searchParams.set("view", view);
        if (prefix) {
            url.searchParams.set("prefix", prefix);
        } else {
            url.searchParams.delete("prefix");
        }
        window.history.replaceState({}, "", url.toString());
    }, [server, view, prefix]);

    // Handle browser popstate navigation
    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            const serverParam = params.get("server");
            if (serverParam) {
                setServer(serverParam);
            }
            const viewParam = params.get("view");
            setView(isAssetView(viewParam) ? viewParam : "storage");
            setPrefix(params.get("prefix") || "");
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    const rememberScroll = () => {
        scrollByViewRef.current.set(viewKey, window.scrollY);
    };

    const navigateTo = (path: string) => {
        rememberScroll();
        setPrefix(path);
    };

    const changeServer = (srv: string) => {
        rememberScroll();
        setServer(srv);
    };

    // Paths differ between views, so another view starts at its root
    const changeView = (next: AssetView) => {
        rememberScroll();
        setView(next);
        setPrefix("");
    };

    const refreshTree = () => {
        clearAssetTreeCache(server, view);
        setReloadToken(token => token + 1);
    };

    // Subfolders and files of the current directory
    const listing = useMemo(() => (tree ? listDirectory(tree, prefix) : null), [tree, prefix]);

    const mergedFiles = useMemo(() => groupFiles(listing?.files ?? []), [listing]);

    const query = searchQuery.trim().toLowerCase();

    const folders = useMemo(() => {
        if (filterType === "files") return [];
        return (listing?.folders ?? [])
            .filter(folder => matchesQuery(folder.name, query))
            .sort((a, b) => compareNames(a.name, b.name, sortOrder));
    }, [listing, query, filterType, sortOrder]);

    const files = useMemo(() => {
        if (filterType === "directories") return [];
        return mergedFiles
            .filter(item => matchesQuery(item.name, query) || item.formats.some(f => matchesQuery(f.name, query)))
            .sort((a, b) => {
                if (sortBy === "size") {
                    return sortOrder === "asc" ? a.totalSize - b.totalSize : b.totalSize - a.totalSize;
                }
                return compareNames(a.name, b.name, sortOrder);
            });
    }, [mergedFiles, query, filterType, sortBy, sortOrder]);

    const totalItemCount = (listing?.folders.length ?? 0) + mergedFiles.length;
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

    const handleGoBack = () => {
        const parts = prefix.split("/").filter(Boolean);
        navigateTo(parts.slice(0, -1).join("/"));
    };

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

    const activeFiltersCount = (server !== "jp" ? 1 : 0) + (filterType !== "all" ? 1 : 0) + (sortBy !== "name" ? 1 : 0) + (sortOrder !== "asc" ? 1 : 0);

    const resetFilters = () => {
        setServer("jp");
        setFilterType("all");
        setSortBy("name");
        setSortOrder("asc");
        setSearchQuery("");
    };

    const quickFilterContent = (
        <BaseFilters
            filteredCount={currentItemCount}
            totalCount={totalItemCount}
            countUnit={t("page.assetViewer.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("page.assetViewer.searchPlaceholder")}
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
                    {(["jp", "en", "tw", "kr", "cn"] as const).map(srv => (
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

            <FilterSection label={t("page.assetViewer.source")}>
                <div className="grid grid-cols-3 gap-2">
                    {(["all", "directories", "files"] as const).map(type => (
                        <FilterButton
                            key={type}
                            selected={filterType === type}
                            onClick={() => setFilterType(type)}
                        >
                            {type === "all" ? t("page.assetViewer.allTypes") :
                             type === "directories" ? t("page.assetViewer.typeDirectory") :
                             t("page.assetViewer.typeBundle")}
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
        <PageContainer>
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

            {/* View switcher: the same version as files for pages, canonical assets, or the client package */}
            <Surface tone="card" radius="xl" className="mb-4 space-y-3 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                    <div className="flex flex-wrap gap-1">
                        <Button variant="text" size="s" icon={mdMenuBook} onClick={() => setShowGuide(true)}>
                            {t("page.assetGuide.open")}
                        </Button>
                        <Button variant="text" size="s" icon={mdHelp} onClick={() => setShowFaq(true)}>
                            {t("page.assetGuide.faq.title")}
                        </Button>
                    </div>
                </div>
                <p className="type-body-s text-on-surface-variant">
                    {t(`page.assetGuide.views.${view}.summary`)}
                    {tree && tree.view === view && (
                        <span className="ml-2 font-mono type-label-s text-outline">
                            {t("page.assetGuide.version", {
                                version: tree.document.published_version.split("-")[0],
                                count: formatNumber(tree.document.files),
                            })}
                        </span>
                    )}
                </p>
            </Surface>

            {/* Filters live in the global FilterDrawer (registered above via
                useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {/* Breadcrumbs Navigation & Actions */}
                <Surface tone="card" radius="xl" className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                    <div className="flex min-w-0 items-center gap-2">
                        {prefix && (
                            <IconButton
                                icon={mdChevronLeft}
                                size="xs"
                                onClick={handleGoBack}
                                label={t("page.assetViewer.parentDir")}
                            />
                        )}
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 type-label-l text-on-surface-variant">
                            {breadcrumbs.map((bc, index) => {
                                const isCurrent = index === breadcrumbs.length - 1;
                                return (
                                    <div key={bc.path} className="flex items-center gap-1.5">
                                        {index > 0 && <span className="text-outline">/</span>}
                                        <button
                                            type="button"
                                            onClick={() => navigateTo(bc.path)}
                                            className={`focus-ring rounded-md3-xs transition-colors hover:text-primary ${
                                                isCurrent ? "type-title-s text-on-surface" : ""
                                            }`}
                                        >
                                            {bc.name}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <SegmentedButton
                            className="w-auto"
                            density={-2}
                            showCheckmark={false}
                            aria-label={t("page.assetViewer.viewGrid")}
                            value={viewMode}
                            onValueChange={(mode) => handleViewModeChange(mode)}
                            options={[
                                { value: "grid", label: <span className="sr-only">{t("page.assetViewer.viewGrid")}</span>, icon: mdGridView },
                                { value: "list", label: <span className="sr-only">{t("page.assetViewer.viewList")}</span>, icon: mdViewList },
                            ]}
                        />

                        <LocalizedLink
                            href={`/asset-versions?server=${server}`}
                            className="state-layer focus-ring flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
                            title={t("layout.nav.items.assetVersions")}
                            aria-label={t("layout.nav.items.assetVersions")}
                        >
                            <Icon path={mdHistory} size={20} />
                        </LocalizedLink>

                        <IconButton
                            icon={mdRefresh}
                            size="xs"
                            onClick={refreshTree}
                            label={t("common.action.refresh")}
                            className={isLoading ? "[&_svg]:animate-spin" : undefined}
                        />
                    </div>
                </Surface>

                {/* Loader */}
                {isLoading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState
                        title={t("page.assetViewer.loadFailed")}
                        message={error}
                        retryLabel={t("common.action.retry")}
                        onRetry={refreshTree}
                    />
                ) : currentItemCount === 0 ? (
                    <Surface tone="card" radius="xl">
                        <EmptyState icon={mdFolderOpen} title={t("page.assetViewer.emptyFolder")} />
                    </Surface>
                ) : (
                    <>
                        {/* Subfolders of the current directory */}
                        {shownFolders.length > 0 && (viewMode === "grid" ? (
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                                {shownFolders.map((folder: AssetTreeFolder) => (
                                    <Card
                                        key={folder.path}
                                        variant="filled"
                                        radius="lg"
                                        onClick={() => navigateTo(folder.path)}
                                        className="group select-none p-4"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="shrink-0 rounded-md3-md bg-surface-container-low p-2.5">
                                                <FolderIcon />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate type-title-s text-on-surface transition-colors duration-200 group-hover:text-primary" title={folder.name}>
                                                    {folder.name}
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                {shownFolders.map((folder: AssetTreeFolder) => (
                                    <Card
                                        key={folder.path}
                                        variant="filled"
                                        onClick={() => navigateTo(folder.path)}
                                        className="group select-none p-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="shrink-0 rounded-md3-sm bg-surface-container-low p-1.5">
                                                <FolderIcon />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate type-title-s text-on-surface transition-colors duration-200 group-hover:text-primary" title={folder.name}>
                                                    {folder.name}
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ))}

                        {/* Files of the current directory (with direct Image Previews & merged PNG+WEBP formats) */}
                        {shownFiles.length > 0 && (viewMode === "grid" ? (
                            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                                {shownFiles.map((item) => (
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
                                            {/* Direct Thumbnail Preview for Images */}
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
                                                    {getFileIcon(item.name)}
                                                </div>
                                            )}

                                            <div className="flex min-w-0 flex-1 flex-col justify-between">
                                                <p className="truncate type-label-l text-on-surface transition-colors duration-200 group-hover:text-primary" title={item.name}>
                                                    {item.name}
                                                </p>

                                                <div className="mt-1.5 flex items-center justify-between gap-1">
                                                    {/* Formats Pills */}
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
                                                    <span className="type-label-s text-on-surface-variant">
                                                        {formatBytes(item.totalSize)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-3 flex flex-col gap-1.5">
                                <div className="mb-1 flex select-none items-center border-b border-outline-variant px-4 py-2.5 type-label-m text-on-surface-variant">
                                    <div className="w-12"></div>
                                    <div className="min-w-0 flex-1">{t("common.form.uid")}</div>
                                    <div className="w-32 text-center">{t("page.assetViewer.formats")}</div>
                                    <div className="w-24 text-right">{t("page.assetViewer.size")}</div>
                                </div>
                                {shownFiles.map((item) => (
                                    <Card
                                        key={item.id}
                                        variant="filled"
                                        onClick={() => {
                                            setSelectedFile(item);
                                            setActiveFormatIndex(0);
                                        }}
                                        className="group select-none p-2.5"
                                    >
                                        <div className="flex items-center gap-3">
                                            {/* Thumbnail preview in list mode */}
                                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md3-sm [background-size:6px_6px] ${checkerboardClassName}`}>
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
                                                    getFileIcon(item.name)
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <p className="truncate type-title-s text-on-surface transition-colors duration-200 group-hover:text-primary" title={item.name}>
                                                    {item.name}
                                                </p>
                                            </div>

                                            <div className="flex w-32 shrink-0 items-center justify-center gap-1">
                                                {item.formats.map((f) => (
                                                    <span
                                                        key={f.ext}
                                                        className="rounded-md3-xs bg-surface-container-low px-1.5 type-label-s uppercase text-on-surface-variant"
                                                    >
                                                        {f.ext}
                                                    </span>
                                                ))}
                                            </div>

                                            <div className="w-24 shrink-0 text-right type-label-m text-on-surface-variant">
                                                {formatBytes(item.totalSize)}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ))}

                        {/* Load Next Page */}
                        {hasMore && (
                            <div className="mt-8 flex justify-center">
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
                            </div>
                        )}

                        {/* All Loaded Message */}
                        {!hasMore && (
                            <div className="mt-8 text-center type-body-m text-on-surface-variant">
                                {t("page.assetViewer.allLoaded", { count: currentItemCount })}
                            </div>
                        )}
                    </>
                )}
            </div>

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
                            <div className="flex justify-between gap-4">
                                <span className="shrink-0 text-on-surface-variant">{t("page.assetGuide.fileKind")}</span>
                                <span className="text-right text-on-surface">
                                    {t(`page.assetGuide.files.${fileKind(`${prefix}/${activeFormat.name}`)}`)}
                                </span>
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

            {/* What these assets are, and why they take the forms they do */}
            <Modal
                isOpen={showGuide}
                onClose={() => setShowGuide(false)}
                title={t("page.assetGuide.title")}
                size="lg"
            >
                <AssetGuide />
            </Modal>

            {/* Why the audio and video take the formats they do, and what they lose */}
            <Modal
                isOpen={showFaq}
                onClose={() => setShowFaq(false)}
                title={t("page.assetGuide.faq.title")}
                size="lg"
            >
                <AssetFaq />
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
