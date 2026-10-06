"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";

import MainLayout from "@/components/MainLayout";
import BaseFilters, { FilterSection, FilterButton } from "@/components/common/BaseFilters";
import { useTheme } from "@/contexts/ThemeContext";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import Modal from "@/components/common/Modal";
import ExternalLink from "@/components/ExternalLink";
import AssetTosModal from "@/components/common/AssetTosModal";
import LocalizedLink from "@/components/LocalizedLink";
import { Banner, Button, Card, CircularProgress, EmptyState, ErrorState, Icon, IconButton, LoadingState, PageContainer, PageHeader, SegmentedButton, Surface } from "@/components/md3";
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
    mdInventory2,
    mdRefresh,
    mdViewList,
    mdVolumeUp,
} from "@/components/md3/icons";

// Type definitions for Bundle & Asset Browser APIs
export interface BundleBrowseItem {
    type: "directory" | "bundle";
    name: string;
    path: string;
    fingerprint?: string;
    fileCount?: number;
    totalSize?: number;
    source?: string;
    filesUrl?: string;
}

export interface BundleBrowseResponse {
    server: string;
    prefix: string;
    limit: number;
    nextCursor?: string;
    snapshotRevision: number;
    items: BundleBrowseItem[];
}

export interface AssetBrowserItem {
    type: "file" | "asset";
    name: string;
    path: string;
    url?: string;
    source?: string;
    size?: number;
    fingerprint?: string;
    sha256?: string;
    version?: string;
}

export interface BundleMetaInfo {
    path: string;
    fingerprint?: string;
    fileCount: number;
    totalSize: number;
    source: string;
}

export interface BundleFilesResponse {
    server: string;
    bundle: BundleMetaInfo;
    limit: number;
    nextCursor?: string;
    snapshotRevision: number;
    items: AssetBrowserItem[];
}

// Merged file format structure (e.g. png + webp combined)
export interface AssetFormatInfo {
    ext: string;
    name: string;
    url: string;
    size?: number;
    fingerprint?: string;
    sha256?: string;
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
    source?: string;
    version?: string;
}

export interface DirCacheEntry {
    type: "dir";
    bundleItems: BundleBrowseItem[];
    nextCursor: string;
    snapshotRevision: number;
    scrollY: number;
}

export interface BundleCacheEntry {
    type: "bundle";
    rawAssetFiles: AssetBrowserItem[];
    activeBundleMeta: BundleMetaInfo | null;
    nextCursor: string;
    snapshotRevision: number;
    scrollY: number;
}

export type ViewCacheEntry = DirCacheEntry | BundleCacheEntry;

const CACHE_STORAGE_KEY = "asset_viewer_view_cache_v1";

function saveCacheToSessionStorage(cacheMap: Map<string, ViewCacheEntry>) {
    if (typeof window === "undefined") return;
    try {
        const entries = Array.from(cacheMap.entries());
        const sliced = entries.slice(-20);
        sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(sliced));
    } catch {
        // ignore quota errors
    }
}

function loadCacheFromSessionStorage(): Map<string, ViewCacheEntry> {
    if (typeof window === "undefined") return new Map();
    try {
        const saved = sessionStorage.getItem(CACHE_STORAGE_KEY);
        if (saved) {
            const entries = JSON.parse(saved);
            if (Array.isArray(entries)) {
                return new Map(entries);
            }
        }
    } catch {
        // ignore errors
    }
    return new Map();
}

function formatBytes(bytes?: number): string {
    if (bytes === undefined || bytes === null) return "-";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function groupBundleFiles(files: AssetBrowserItem[]): MergedAssetItem[] {
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
            url: file.url || "",
            size: file.size,
            fingerprint: file.fingerprint,
            sha256: file.sha256,
        };

        if (map.has(key)) {
            const existing = map.get(key)!;
            if (!existing.formats.some(f => f.ext === ext)) {
                existing.formats.push(formatEntry);
            }
            existing.totalSize += file.size || 0;
            if (ext === "webp" && file.url) {
                existing.primaryUrl = file.url;
                existing.primaryExt = "webp";
            }
        } else {
            const isImg = ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);
            const isAud = ["mp3", "wav", "ogg", "m4a", "flac"].includes(ext);
            const isTxt = ["json", "txt", "csv", "xml", "yaml", "yml"].includes(ext);

            map.set(key, {
                id: key,
                baseName,
                name: (ext === "png" || ext === "webp") ? baseName : file.name,
                primaryUrl: file.url || "",
                primaryExt: ext,
                isImage: isImg,
                isAudio: isAud,
                isText: isTxt,
                formats: [formatEntry],
                totalSize: file.size || 0,
                source: file.source,
                version: file.version,
            });
        }
    }

    for (const item of map.values()) {
        item.formats.sort((a, b) => {
            if (a.ext === "webp") return -1;
            if (b.ext === "webp") return 1;
            return a.ext.localeCompare(b.ext);
        });
        if (item.formats.length > 1) {
            item.name = item.baseName;
        } else {
            item.name = item.formats[0].name;
        }
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

function ArchiveBundleIcon() {
    return <Icon path={mdInventory2} size={32} className="text-secondary" />;
}

function FolderIcon() {
    return <Icon path={mdFolderFill} size={32} className="text-tertiary" />;
}

function AssetViewerContent() {
    const { assetSource } = useTheme();
    const { t, formatNumber } = useI18n();

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

    const [prefix, setPrefix] = useState<string>(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            return params.get("prefix") || "";
        }
        return "";
    });

    const [bundlePath, setBundlePath] = useState<string>(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            return params.get("bundle") || "";
        }
        return "";
    });

    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<"all" | "directories" | "bundles">("all");
    const [sortBy, setSortBy] = useState<"name" | "size" | "fileCount">("name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

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

    // TOS modal visibility
    const [showTos, setShowTos] = useState(false);

    // API response states
    const [bundleItems, setBundleItems] = useState<BundleBrowseItem[]>([]);
    const [rawAssetFiles, setRawAssetFiles] = useState<AssetBrowserItem[]>([]);
    const [activeBundleMeta, setActiveBundleMeta] = useState<BundleMetaInfo | null>(null);

    const [nextCursor, setNextCursor] = useState<string>("");
    const [, setSnapshotRevision] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Selected file details & modal state
    const [selectedFile, setSelectedFile] = useState<MergedAssetItem | null>(null);
    const [activeFormatIndex, setActiveFormatIndex] = useState<number>(0);

    const [previewText, setPreviewText] = useState<string | null>(null);
    const [isPreviewTextLoading, setIsPreviewTextLoading] = useState(false);
    const [previewTextError, setPreviewTextError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState(false);

    // View cache and scroll restore state
    const viewCacheRef = useRef<Map<string, ViewCacheEntry>>(new Map());
    const activeViewKeyRef = useRef<string>("");
    const lastScrollYRef = useRef<number>(0);

    // Initialize cache from sessionStorage on mount
    useEffect(() => {
        viewCacheRef.current = loadCacheFromSessionStorage();
    }, []);

    // Track scroll position continuously
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleScroll = () => {
            lastScrollYRef.current = window.scrollY;
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const getViewKey = useCallback((s: string, p: string, b: string) => {
        return b ? `bundle:${s}:${b}` : `dir:${s}:${p}`;
    }, []);

    const saveCurrentViewScroll = useCallback(() => {
        const key = activeViewKeyRef.current;
        if (!key) return;
        const cached = viewCacheRef.current.get(key);
        if (cached) {
            cached.scrollY = lastScrollYRef.current;
            saveCacheToSessionStorage(viewCacheRef.current);
        }
    }, []);

    // Sync state to URL query parameters
    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("server", server);
        if (prefix) {
            url.searchParams.set("prefix", prefix);
        } else {
            url.searchParams.delete("prefix");
        }
        if (bundlePath) {
            url.searchParams.set("bundle", bundlePath);
        } else {
            url.searchParams.delete("bundle");
        }
        window.history.replaceState({}, "", url.toString());
    }, [server, prefix, bundlePath]);

    // Handle browser popstate navigation
    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            const serverParam = params.get("server");
            const prefixParam = params.get("prefix") || "";
            const bundleParam = params.get("bundle") || "";
            if (serverParam) {
                setServer(serverParam);
            }
            setPrefix(prefixParam);
            setBundlePath(bundleParam);
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    // Active domain base URL
    const gatewayDomain = useMemo(() => {
        return assetSource === "overseas" ? "https://storage.pjsk.moe" : "https://storage.exmeaning.com";
    }, [assetSource]);

    // Fetch view data
    const fetchCurrentView = useCallback(async (forceRefresh = false) => {
        const key = getViewKey(server, prefix, bundlePath);

        if (activeViewKeyRef.current && activeViewKeyRef.current !== key) {
            saveCurrentViewScroll();
        }
        activeViewKeyRef.current = key;

        if (!forceRefresh && viewCacheRef.current.has(key)) {
            const cached = viewCacheRef.current.get(key)!;
            if (cached.type === "bundle" && bundlePath) {
                setRawAssetFiles(cached.rawAssetFiles);
                setActiveBundleMeta(cached.activeBundleMeta);
                setBundleItems([]);
                setNextCursor(cached.nextCursor);
                setSnapshotRevision(cached.snapshotRevision);
                setIsLoading(false);
                setError(null);

                const targetY = cached.scrollY || 0;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            window.scrollTo({ top: targetY, behavior: "instant" });
                            lastScrollYRef.current = targetY;
                        }, 50);
                    });
                });
                return;
            } else if (cached.type === "dir" && !bundlePath) {
                setBundleItems(cached.bundleItems);
                setRawAssetFiles([]);
                setActiveBundleMeta(null);
                setNextCursor(cached.nextCursor);
                setSnapshotRevision(cached.snapshotRevision);
                setIsLoading(false);
                setError(null);

                const targetY = cached.scrollY || 0;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            window.scrollTo({ top: targetY, behavior: "instant" });
                            lastScrollYRef.current = targetY;
                        }, 50);
                    });
                });
                return;
            }
        }

        try {
            setIsLoading(true);
            setError(null);

            if (bundlePath) {
                const url = `${gatewayDomain}/api/assets/bundle-files?server=${server}&path=${encodeURIComponent(bundlePath)}&limit=200`;
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const data: BundleFilesResponse = await res.json();
                const items = data.items || [];
                const meta = data.bundle || null;
                const cursor = data.nextCursor || "";
                const rev = data.snapshotRevision || 0;

                setRawAssetFiles(items);
                setActiveBundleMeta(meta);
                setBundleItems([]);
                setNextCursor(cursor);
                setSnapshotRevision(rev);

                const newCache: BundleCacheEntry = {
                    type: "bundle",
                    rawAssetFiles: items,
                    activeBundleMeta: meta,
                    nextCursor: cursor,
                    snapshotRevision: rev,
                    scrollY: 0,
                };
                viewCacheRef.current.set(key, newCache);
                saveCacheToSessionStorage(viewCacheRef.current);
            } else {
                const url = `${gatewayDomain}/api/assets/bundles?server=${server}&prefix=${encodeURIComponent(prefix)}&limit=200`;
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const data: BundleBrowseResponse = await res.json();
                const items = data.items || [];
                const cursor = data.nextCursor || "";
                const rev = data.snapshotRevision || 0;

                setBundleItems(items);
                setRawAssetFiles([]);
                setActiveBundleMeta(null);
                setNextCursor(cursor);
                setSnapshotRevision(rev);

                const newCache: DirCacheEntry = {
                    type: "dir",
                    bundleItems: items,
                    nextCursor: cursor,
                    snapshotRevision: rev,
                    scrollY: 0,
                };
                viewCacheRef.current.set(key, newCache);
                saveCacheToSessionStorage(viewCacheRef.current);
            }
            window.scrollTo({ top: 0, behavior: "instant" });
            lastScrollYRef.current = 0;
        } catch (err) {
            console.error("Failed to load assets view:", err);
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setIsLoading(false);
        }
    }, [server, prefix, bundlePath, gatewayDomain, getViewKey, saveCurrentViewScroll]);

    useEffect(() => {
        fetchCurrentView();
    }, [fetchCurrentView]);

    // Fetch next page
    const fetchMore = useCallback(async () => {
        if (!nextCursor || isLoadingMore) return;
        const key = getViewKey(server, prefix, bundlePath);
        try {
            setIsLoadingMore(true);

            if (bundlePath) {
                const url = `${gatewayDomain}/api/assets/bundle-files?server=${server}&path=${encodeURIComponent(bundlePath)}&limit=200&cursor=${encodeURIComponent(nextCursor)}`;
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const data: BundleFilesResponse = await res.json();
                const newItems = data.items || [];
                const cursor = data.nextCursor || "";
                const rev = data.snapshotRevision || 0;

                setRawAssetFiles(prev => {
                    const updated = [...prev, ...newItems];
                    const cached = viewCacheRef.current.get(key);
                    if (cached && cached.type === "bundle") {
                        cached.rawAssetFiles = updated;
                        cached.nextCursor = cursor;
                        cached.snapshotRevision = rev;
                        saveCacheToSessionStorage(viewCacheRef.current);
                    }
                    return updated;
                });
                setNextCursor(cursor);
                setSnapshotRevision(rev);
            } else {
                const url = `${gatewayDomain}/api/assets/bundles?server=${server}&prefix=${encodeURIComponent(prefix)}&limit=200&cursor=${encodeURIComponent(nextCursor)}`;
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const data: BundleBrowseResponse = await res.json();
                const newItems = data.items || [];
                const cursor = data.nextCursor || "";
                const rev = data.snapshotRevision || 0;

                setBundleItems(prev => {
                    const updated = [...prev, ...newItems];
                    const cached = viewCacheRef.current.get(key);
                    if (cached && cached.type === "dir") {
                        cached.bundleItems = updated;
                        cached.nextCursor = cursor;
                        cached.snapshotRevision = rev;
                        saveCacheToSessionStorage(viewCacheRef.current);
                    }
                    return updated;
                });
                setNextCursor(cursor);
                setSnapshotRevision(rev);
            }
        } catch (err) {
            console.error("Failed to load more items:", err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [server, prefix, bundlePath, gatewayDomain, nextCursor, isLoadingMore, getViewKey]);

    // Group raw files into merged asset items (merging png + webp)
    const mergedAssetFiles = useMemo(() => {
        return groupBundleFiles(rawAssetFiles);
    }, [rawAssetFiles]);

    // Breadcrumbs list
    const breadcrumbs = useMemo(() => {
        const parts = prefix.split("/").filter(Boolean);
        const list = [{ name: t("page.assetViewer.root"), path: "", isBundle: false }];
        let currentPath = "";
        for (const part of parts) {
            currentPath += part + "/";
            list.push({ name: part, path: currentPath, isBundle: false });
        }
        if (bundlePath) {
            const bundleName = bundlePath.split("/").pop() || bundlePath;
            list.push({ name: bundleName, path: bundlePath, isBundle: true });
        }
        return list;
    }, [prefix, bundlePath, t]);

    // Breadcrumb click handler
    const handleBreadcrumbClick = (bc: { name: string; path: string; isBundle: boolean }) => {
        if (bc.isBundle) return;
        saveCurrentViewScroll();
        setBundlePath("");
        setPrefix(bc.path);
    };

    // Go back up one level
    const handleGoBack = useCallback(() => {
        saveCurrentViewScroll();
        if (bundlePath) {
            setBundlePath("");
            return;
        }
        if (!prefix) return;
        const parts = prefix.split("/").filter(Boolean);
        parts.pop();
        const parentPath = parts.length > 0 ? parts.join("/") + "/" : "";
        setPrefix(parentPath);
    }, [prefix, bundlePath, saveCurrentViewScroll]);

    // Processed directory & bundle items
    const processedBundleItems = useMemo(() => {
        let list = [...bundleItems];

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            list = list.filter(item => item.name.toLowerCase().includes(query));
        }

        if (filterType === "directories") {
            list = list.filter(item => item.type === "directory");
        } else if (filterType === "bundles") {
            list = list.filter(item => item.type === "bundle");
        }

        list.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === "directory" ? -1 : 1;
            }

            const isAsc = sortOrder === "asc";

            if (a.type === "directory") {
                return isAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
            }

            if (sortBy === "size") {
                const sizeA = a.totalSize || 0;
                const sizeB = b.totalSize || 0;
                return isAsc ? sizeA - sizeB : sizeB - sizeA;
            }

            if (sortBy === "fileCount") {
                const countA = a.fileCount || 0;
                const countB = b.fileCount || 0;
                return isAsc ? countA - countB : countB - countA;
            }

            return isAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        });

        return list;
    }, [bundleItems, searchQuery, filterType, sortBy, sortOrder]);

    // Processed asset files inside bundle
    const processedAssetFiles = useMemo(() => {
        let list = [...mergedAssetFiles];

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            list = list.filter(item =>
                item.name.toLowerCase().includes(query) ||
                item.formats.some(f => f.name.toLowerCase().includes(query))
            );
        }

        list.sort((a, b) => {
            const isAsc = sortOrder === "asc";
            if (sortBy === "size") {
                const sizeA = a.totalSize || 0;
                const sizeB = b.totalSize || 0;
                return isAsc ? sizeA - sizeB : sizeB - sizeA;
            }
            return isAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        });

        return list;
    }, [mergedAssetFiles, searchQuery, sortBy, sortOrder]);

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

            const fileUrl = `${gatewayDomain}${format.url}`;
            const res = await fetch(fileUrl);
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

    // Clipboard copy
    const handleCopyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 2000);
        }).catch(err => {
            console.error("Clipboard copy failed:", err);
        });
    };

    // Sidebar Filters configuration
    const totalItemCount = bundlePath ? mergedAssetFiles.length : bundleItems.length;
    const currentItemCount = bundlePath ? processedAssetFiles.length : processedBundleItems.length;
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
            sortOptions={
                bundlePath
                    ? [
                          { id: "name", label: t("common.form.uid") },
                          { id: "size", label: t("page.assetViewer.size") },
                      ]
                    : [
                          { id: "name", label: t("common.form.uid") },
                          { id: "size", label: t("page.assetViewer.totalSize") },
                          { id: "fileCount", label: t("page.assetViewer.fileCount") },
                      ]
            }
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(field, order) => {
                setSortBy(field as "name" | "size" | "fileCount");
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
                            onClick={() => {
                                saveCurrentViewScroll();
                                setServer(srv);
                            }}
                        >
                            <ServerRegionLabel server={srv} />
                        </FilterButton>
                    ))}
                </div>
            </FilterSection>

            {!bundlePath && (
                <FilterSection label={t("page.assetViewer.source")}>
                    <div className="grid grid-cols-3 gap-2">
                        {(["all", "directories", "bundles"] as const).map(type => (
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
            )}
        </BaseFilters>
    );

    useQuickFilter(t("page.assetViewer.title"), quickFilterContent, [
        searchQuery,
        server,
        filterType,
        sortBy,
        sortOrder,
        bundlePath,
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
                    onClick={() => handleCopyToClipboard(`${gatewayDomain}${activeFormat.url}`)}
                    label={copyFeedback ? t("page.assetViewer.copied") : t("page.assetViewer.copyLink")}
                />
                <ExternalLink
                    href={`${gatewayDomain}${activeFormat.url}`}
                    className="state-layer focus-ring flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
                    title={t("page.assetViewer.download")}
                >
                    <Icon path={mdDownload} size={20} />
                </ExternalLink>
            </div>
        );
    }, [activeFormat, gatewayDomain, copyFeedback, t]);

    const checkerboardClassName =
        "bg-surface-container-high bg-[radial-gradient(var(--md-sys-color-outline-variant)_1px,transparent_1px)]";

    return (
        <PageContainer>
            {/* Page Header */}
            <PageHeader
                align="center"
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

            {/* Filters live in the global FilterDrawer (registered above via
                useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                {/* Breadcrumbs Navigation & Actions */}
                <Surface tone="card" radius="xl" className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                    <div className="flex min-w-0 items-center gap-2">
                        {(prefix || bundlePath) && (
                            <IconButton
                                icon={mdChevronLeft}
                                size="xs"
                                onClick={handleGoBack}
                                label={t("page.assetViewer.parentDir")}
                            />
                        )}
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 type-label-l text-on-surface-variant">
                            {breadcrumbs.map((bc, index) => (
                                <div key={`${bc.path}-${index}`} className="flex items-center gap-1.5">
                                    {index > 0 && <span className="text-outline">/</span>}
                                    {bc.isBundle ? (
                                        <span className="flex items-center gap-1 rounded-md3-sm bg-primary-container px-2 py-0.5 type-label-l text-on-primary-container">
                                            <Icon path={mdInventory2} size={16} />
                                            {bc.name}
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => handleBreadcrumbClick(bc)}
                                            className={`focus-ring rounded-md3-xs transition-colors hover:text-primary ${
                                                index === breadcrumbs.length - 1 && !bundlePath
                                                    ? "type-title-s text-on-surface"
                                                    : ""
                                            }`}
                                        >
                                            {bc.name}
                                        </button>
                                    )}
                                </div>
                            ))}
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
                            onClick={() => fetchCurrentView(true)}
                            label={t("common.action.refresh")}
                            className={isLoading ? "[&_svg]:animate-spin" : undefined}
                        />
                    </div>
                </Surface>

                {/* Active Bundle Details Banner */}
                {bundlePath && activeBundleMeta && (
                    <Surface tone="default" radius="xl" className="mb-4 flex flex-wrap items-center justify-between gap-4 p-5">
                        <div className="flex min-w-0 items-center gap-3.5">
                            <div className="shrink-0 rounded-md3-lg bg-primary-container p-3 text-on-primary-container">
                                <ArchiveBundleIcon />
                            </div>
                            <div className="min-w-0">
                                <h2 className="max-w-xs truncate type-title-l text-on-surface sm:max-w-md" title={activeBundleMeta.path}>
                                    {activeBundleMeta.path.split("/").pop()}
                                </h2>
                                <p className="mt-0.5 max-w-sm truncate font-mono type-body-s text-on-surface-variant" title={activeBundleMeta.fingerprint || ""}>
                                    {activeBundleMeta.fingerprint ? `FP: ${activeBundleMeta.fingerprint}` : activeBundleMeta.path}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 type-body-s">
                            <div className="text-right">
                                <span className="block text-on-surface-variant">{t("page.assetViewer.fileCount")}</span>
                                <span className="type-label-l text-on-surface">{formatNumber(activeBundleMeta.fileCount)}</span>
                            </div>
                            <div className="h-7 w-px bg-outline-variant" />
                            <div className="text-right">
                                <span className="block text-on-surface-variant">{t("page.assetViewer.totalSize")}</span>
                                <span className="type-label-l text-on-surface">{formatBytes(activeBundleMeta.totalSize)}</span>
                            </div>
                            {activeBundleMeta.source && (
                                <>
                                    <div className="h-7 w-px bg-outline-variant" />
                                    <div className="text-right">
                                        <span className="block text-on-surface-variant">{t("page.assetViewer.source")}</span>
                                        <span className="rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 type-label-s uppercase text-on-tertiary-container">
                                            {activeBundleMeta.source}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    </Surface>
                )}

                {/* Loader */}
                {isLoading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState
                        title={t("page.assetViewer.loadFailed")}
                        message={error}
                        retryLabel={t("common.action.retry")}
                        onRetry={() => fetchCurrentView(true)}
                    />
                ) : (bundlePath ? processedAssetFiles.length === 0 : processedBundleItems.length === 0) ? (
                    <Surface tone="card" radius="xl">
                        <EmptyState icon={mdFolderOpen} title={t("page.assetViewer.emptyFolder")} />
                    </Surface>
                ) : (
                    <>
                        {/* Directory & Bundles Tree View (Without redundant text badges) */}
                        {!bundlePath ? (
                            viewMode === "grid" ? (
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                                    {processedBundleItems.map((item, index) => {
                                        const isDir = item.type === "directory";
                                        return (
                                            <Card
                                                key={`${item.path}-${index}`}
                                                variant="filled"
                                                radius="lg"
                                                onClick={() => {
                                                    saveCurrentViewScroll();
                                                    if (isDir) {
                                                        setPrefix(item.path.endsWith("/") ? item.path : item.path + "/");
                                                    } else {
                                                        setBundlePath(item.path);
                                                    }
                                                }}
                                                className="group select-none p-4"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="shrink-0 rounded-md3-md bg-surface-container-low p-2.5">
                                                        {isDir ? <FolderIcon /> : <ArchiveBundleIcon />}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate type-title-s text-on-surface transition-colors duration-200 group-hover:text-primary" title={item.name}>
                                                            {item.name}
                                                        </p>
                                                        <div className="mt-0.5 truncate type-label-s text-on-surface-variant">
                                                            {!isDir && (
                                                                <span>
                                                                    {formatBytes(item.totalSize)}
                                                                    {item.fileCount !== undefined && ` • ${t("page.assetViewer.fileCountValue", { count: item.fileCount })}`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    <div className="mb-1 flex select-none items-center border-b border-outline-variant px-4 py-2.5 type-label-m text-on-surface-variant">
                                        <div className="w-10"></div>
                                        <div className="min-w-0 flex-1">{t("common.form.uid")}</div>
                                        <div className="w-24 text-right">{t("page.assetViewer.fileCount")}</div>
                                        <div className="hidden w-28 text-right sm:block">{t("page.assetViewer.totalSize")}</div>
                                    </div>
                                    {processedBundleItems.map((item, index) => {
                                        const isDir = item.type === "directory";
                                        return (
                                            <Card
                                                key={`${item.path}-${index}`}
                                                variant="filled"
                                                onClick={() => {
                                                    saveCurrentViewScroll();
                                                    if (isDir) {
                                                        setPrefix(item.path.endsWith("/") ? item.path : item.path + "/");
                                                    } else {
                                                        setBundlePath(item.path);
                                                    }
                                                }}
                                                className="group select-none p-3"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="shrink-0 rounded-md3-sm bg-surface-container-low p-1.5">
                                                        {isDir ? <FolderIcon /> : <ArchiveBundleIcon />}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate type-title-s text-on-surface transition-colors duration-200 group-hover:text-primary" title={item.name}>
                                                            {item.name}
                                                        </p>
                                                    </div>
                                                    <div className="w-24 shrink-0 text-right type-label-m text-on-surface-variant">
                                                        {isDir ? "-" : (item.fileCount !== undefined ? t("page.assetViewer.fileCountValue", { count: item.fileCount }) : "-")}
                                                    </div>
                                                    <div className="hidden w-28 shrink-0 truncate text-right font-mono type-label-m text-on-surface-variant sm:block">
                                                        {isDir ? "-" : formatBytes(item.totalSize)}
                                                    </div>
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                            )
                        ) : (
                            /* Files inside Bundle (with direct Image Previews & Merged PNG+WEBP formats) */
                            viewMode === "grid" ? (
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                                    {processedAssetFiles.map((item) => (
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
                                                            src={`${gatewayDomain}${item.primaryUrl}`}
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
                                <div className="flex flex-col gap-1.5">
                                    <div className="mb-1 flex select-none items-center border-b border-outline-variant px-4 py-2.5 type-label-m text-on-surface-variant">
                                        <div className="w-12"></div>
                                        <div className="min-w-0 flex-1">{t("common.form.uid")}</div>
                                        <div className="w-32 text-center">{t("page.assetViewer.formats")}</div>
                                        <div className="w-24 text-right">{t("page.assetViewer.size")}</div>
                                    </div>
                                    {processedAssetFiles.map((item) => (
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
                                                            src={`${gatewayDomain}${item.primaryUrl}`}
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
                            )
                        )}

                        {/* Load Next Page Cursor */}
                        {nextCursor && (
                            <div className="mt-8 flex justify-center">
                                <Button
                                    variant="tonal"
                                    size="m"
                                    onClick={fetchMore}
                                    disabled={isLoadingMore}
                                >
                                    {isLoadingMore ? (
                                        <CircularProgress size={20} />
                                    ) : (
                                        <>
                                            {t("page.assetViewer.loadMore")}
                                            <span className="type-label-l opacity-80">
                                                {formatNumber(bundlePath ? mergedAssetFiles.length : bundleItems.length)}
                                            </span>
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}

                        {/* All Loaded Message */}
                        {!nextCursor && (bundlePath ? processedAssetFiles.length > 0 : processedBundleItems.length > 0) && (
                            <div className="mt-8 text-center type-body-m text-on-surface-variant">
                                {t("page.assetViewer.allLoaded", { count: bundlePath ? processedAssetFiles.length : processedBundleItems.length })}
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
                            {selectedFile.version && (
                                <div className="flex justify-between gap-4">
                                    <span className="shrink-0 text-on-surface-variant">{t("page.assetViewer.version")}</span>
                                    <span className="text-right font-mono text-on-surface">{selectedFile.version}</span>
                                </div>
                            )}
                            {selectedFile.source && (
                                <div className="flex justify-between gap-4">
                                    <span className="shrink-0 text-on-surface-variant">{t("page.assetViewer.source")}</span>
                                    <span className="text-right capitalize text-on-surface">{selectedFile.source}</span>
                                </div>
                            )}
                            {activeFormat.fingerprint && (
                                <div className="flex justify-between gap-4">
                                    <span className="shrink-0 text-on-surface-variant">{t("page.assetViewer.fingerprint")}</span>
                                    <span className="max-w-[200px] truncate text-right font-mono text-on-surface" title={activeFormat.fingerprint}>{activeFormat.fingerprint}</span>
                                </div>
                            )}
                            {activeFormat.sha256 && (
                                <div className="flex flex-col gap-1 border-t border-outline-variant pt-1.5">
                                    <span className="text-on-surface-variant">{t("page.assetViewer.sha256")}</span>
                                    <span className="select-all break-all font-mono type-label-s text-on-surface sm:type-label-m">{activeFormat.sha256}</span>
                                </div>
                            )}
                        </div>

                        {/* Inline Previews */}
                        <div className="flex flex-col items-center justify-center">
                            {selectedFile.isImage && activeFormat.url && (
                                <div className={`relative flex max-h-72 w-full justify-center rounded-md3-lg p-4 [background-size:10px_10px] ${checkerboardClassName}`}>
                                    <img
                                        src={`${gatewayDomain}${activeFormat.url}`}
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
                                        src={`${gatewayDomain}${activeFormat.url}`}
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
