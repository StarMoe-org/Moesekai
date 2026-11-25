"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Button, Icon, IconButton } from "@/components/md3";
import {
    mdChevronLeft,
    mdChevronRight,
    mdClose,
    mdCompareArrows,
    mdFolder,
    mdHistory,
    mdLayers,
    mdSearch,
} from "@/components/md3/icons";
import type { UnifiedVersionKind, UnifiedVersionNode } from "@/app/asset-versions/versionTimeline";

export type TimelineKindFilter = "all" | UnifiedVersionKind;

interface VersionTimelineStripProps {
    nodes: UnifiedVersionNode[];
    selectedNodeId: string;
    onSelectNode: (node: UnifiedVersionNode) => void;
    supportsMasterdata: boolean;
    isLoading: boolean;
    hasMoreMasterdata: boolean;
    isLoadingMoreMasterdata: boolean;
    onLoadMoreMasterdata: () => void;
    onOpenFullPicker: () => void;
}

export default function VersionTimelineStrip({
    nodes,
    selectedNodeId,
    onSelectNode,
    supportsMasterdata,
    isLoading,
    hasMoreMasterdata,
    isLoadingMoreMasterdata,
    onLoadMoreMasterdata,
    onOpenFullPicker,
}: VersionTimelineStripProps) {
    const { t, formatDate, formatNumber } = useI18n();
    const [kindFilter, setKindFilter] = useState<TimelineKindFilter>("all");
    const [query, setQuery] = useState("");
    const railRef = useRef<HTMLDivElement | null>(null);
    const activeItemRef = useRef<HTMLButtonElement | null>(null);

    const counts = useMemo(() => {
        let both = 0;
        let asset = 0;
        let masterdata = 0;
        for (const n of nodes) {
            if (n.kind === "both") both += 1;
            else if (n.kind === "asset") asset += 1;
            else masterdata += 1;
        }
        return { all: nodes.length, both, asset, masterdata };
    }, [nodes]);

    useEffect(() => {
        if (!supportsMasterdata && (kindFilter === "both" || kindFilter === "masterdata")) {
            setKindFilter("all");
        }
    }, [supportsMasterdata, kindFilter]);

    const filteredNodes = useMemo(() => {
        const q = query.trim().toLowerCase();
        return nodes.filter((n) => {
            if (kindFilter !== "all" && n.kind !== kindFilter) return false;
            if (!q) return true;
            if (n.primaryLabel.toLowerCase().includes(q)) return true;
            if (n.secondaryLabel && n.secondaryLabel.toLowerCase().includes(q)) return true;
            if (n.asset?.published_version.toLowerCase().includes(q)) return true;
            if (n.asset?.published_at?.toLowerCase().includes(q)) return true;
            if (n.masterdata?.dataVersion.toLowerCase().includes(q)) return true;
            if (n.masterdata?.sha.toLowerCase().includes(q)) return true;
            if (n.masterdata?.committedAt.toLowerCase().includes(q)) return true;
            return false;
        });
    }, [nodes, kindFilter, query]);

    const activeFilteredIndex = useMemo(
        () => filteredNodes.findIndex((n) => n.id === selectedNodeId),
        [filteredNodes, selectedNodeId],
    );

    useEffect(() => {
        if (activeItemRef.current) {
            activeItemRef.current.scrollIntoView({
                behavior: "smooth",
                inline: "nearest",
                block: "nearest",
            });
        }
    }, [selectedNodeId]);

    const filterPills: Array<{ key: TimelineKindFilter; label: string; count: number; show: boolean }> = [
        { key: "all", label: t("page.assetVersions.versionTimeline.filterAll"), count: counts.all, show: true },
        { key: "both", label: t("page.assetVersions.versionTimeline.filterBoth"), count: counts.both, show: supportsMasterdata },
        { key: "asset", label: t("page.assetVersions.versionTimeline.filterAssetOnly"), count: counts.asset, show: supportsMasterdata },
        { key: "masterdata", label: t("page.assetVersions.versionTimeline.filterMasterdataOnly"), count: counts.masterdata, show: supportsMasterdata },
    ];

    const formatNodeTime = (ms: number) => {
        if (!ms) return "";
        return formatDate(new Date(ms), {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const scrollRail = (delta: number) => {
        railRef.current?.scrollBy({ left: delta, behavior: "smooth" });
    };

    return (
        <div className="glass mb-4 overflow-hidden rounded-md3-xl">
            {/* Header & Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-outline-variant/45 px-3.5 py-2.5 sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 text-on-surface">
                        <Icon path={mdHistory} size={18} className="text-primary" />
                        <span className="type-title-s font-medium">
                            {t("page.assetVersions.timeline")}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                        {filterPills
                            .filter((p) => p.show)
                            .map((pill) => {
                                const selected = kindFilter === pill.key;
                                return (
                                    <button
                                        key={pill.key}
                                        type="button"
                                        onClick={() => setKindFilter(pill.key)}
                                        aria-pressed={selected}
                                        className={`state-layer focus-ring inline-flex h-7 items-center gap-1 rounded-full px-2.5 type-label-m transition-colors ${
                                            selected
                                                ? "glass-selected font-medium text-on-surface"
                                                : "text-on-surface-variant hover:bg-surface-container/50"
                                        }`}
                                    >
                                        <span>{pill.label}</span>
                                        <span className="font-mono type-label-s opacity-80">
                                            {formatNumber(pill.count)}
                                        </span>
                                    </button>
                                );
                            })}
                    </div>
                </div>

                {/* Search & Quick Navigation */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <div className="relative">
                        <Icon
                            path={mdSearch}
                            size={15}
                            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
                        />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t("page.assetVersions.versionTimeline.searchPlaceholder")}
                            className="focus-ring h-7 w-40 rounded-full border border-outline-variant/60 bg-surface-container-lowest/70 pl-8 pr-7 type-label-m text-on-surface placeholder:text-on-surface-variant sm:w-48"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                aria-label={t("common.md3.clear")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                            >
                                <Icon path={mdClose} size={14} />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-0.5">
                        <IconButton
                            icon={mdChevronLeft}
                            size="xs"
                            onClick={() => scrollRail(-360)}
                            label={t("page.assetVersions.versionTimeline.scrollLeft")}
                        />
                        <IconButton
                            icon={mdChevronRight}
                            size="xs"
                            onClick={() => scrollRail(360)}
                            label={t("page.assetVersions.versionTimeline.scrollRight")}
                        />
                    </div>

                    <Button
                        variant="text"
                        size="xs"
                        onClick={onOpenFullPicker}
                    >
                        {t("page.assetVersions.versionTimeline.allVersions")}
                    </Button>
                </div>
            </div>

            {/* Horizontal Timeline Rail */}
            <div className="relative px-3.5 py-3 sm:px-4">
                {isLoading && nodes.length === 0 ? (
                    <div className="flex gap-3 overflow-hidden py-1">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="h-[88px] w-52 shrink-0 animate-pulse rounded-md3-lg bg-surface-container/60"
                            />
                        ))}
                    </div>
                ) : filteredNodes.length === 0 ? (
                    <div className="py-5 text-center type-body-s text-on-surface-variant">
                        {t("page.assetVersions.versionTimeline.emptyFiltered")}
                    </div>
                ) : (
                    <div
                        ref={railRef}
                        className="custom-scrollbar flex items-stretch gap-3 overflow-x-auto pb-1.5"
                    >
                        {filteredNodes.map((node, index) => {
                            const isActive = node.id === selectedNodeId;
                            const isLatest = nodes[0]?.id === node.id;
                            const assetAdded = node.asset?.added;
                            const assetChanged = node.asset?.changed;
                            const assetRemoved = node.asset?.removed;
                            const hasAssetCounts =
                                assetAdded !== undefined &&
                                assetChanged !== undefined &&
                                assetRemoved !== undefined;

                            return (
                                <div key={node.id} className="relative flex shrink-0 flex-col">
                                    {/* Timeline track + dot */}
                                    <div className="relative mb-2 flex items-center">
                                        {index > 0 && (
                                            <span
                                                aria-hidden
                                                className="absolute right-1/2 -left-3 h-0.5 bg-outline-variant/55"
                                            />
                                        )}
                                        {index < filteredNodes.length - 1 && (
                                            <span
                                                aria-hidden
                                                className="absolute left-1/2 -right-3 h-0.5 bg-outline-variant/55"
                                            />
                                        )}
                                        <span
                                            aria-hidden
                                            className={`relative z-10 mx-auto h-2.5 w-2.5 rounded-full border-2 transition-transform ${
                                                isActive
                                                    ? "scale-125 border-primary bg-primary"
                                                    : node.kind === "both"
                                                        ? "border-primary bg-surface"
                                                        : node.kind === "masterdata"
                                                            ? "border-tertiary bg-surface"
                                                            : "border-outline bg-surface"
                                            }`}
                                        />
                                    </div>

                                    {/* Version Card */}
                                    <button
                                        ref={isActive ? activeItemRef : null}
                                        type="button"
                                        onClick={() => onSelectNode(node)}
                                        aria-current={isActive ? "true" : undefined}
                                        className={`state-layer focus-ring flex w-[216px] flex-1 flex-col justify-between rounded-md3-lg border px-3 py-2.5 text-left transition-all ${
                                            isActive
                                                ? "glass-selected border-primary/60 text-on-surface"
                                                : "border-outline-variant/45 bg-surface-container-low/55 text-on-surface hover:border-outline-variant hover:bg-surface-container/75"
                                        }`}
                                    >
                                        {/* Top badges */}
                                        <div className="mb-1.5 flex items-center justify-between gap-1.5">
                                            <div className="flex flex-wrap items-center gap-1">
                                                {node.kind === "both" ? (
                                                    <span className="inline-flex items-center gap-1 rounded-md3-xs bg-primary-container px-1.5 py-0.5 type-label-s font-medium text-on-primary-container">
                                                        <Icon path={mdLayers} size={12} />
                                                        {t("page.assetVersions.versionTimeline.badgeBoth")}
                                                    </span>
                                                ) : node.kind === "asset" ? (
                                                    <span className="inline-flex items-center gap-1 rounded-md3-xs bg-secondary-container px-1.5 py-0.5 type-label-s font-medium text-on-secondary-container">
                                                        <Icon path={mdFolder} size={12} />
                                                        {t("page.assetVersions.versionTimeline.badgeAsset")}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-md3-xs bg-tertiary-container px-1.5 py-0.5 type-label-s font-medium text-on-tertiary-container">
                                                        <Icon path={mdCompareArrows} size={12} />
                                                        {t("page.assetVersions.versionTimeline.badgeMasterdata")}
                                                    </span>
                                                )}
                                                {isLatest && (
                                                    <span className="rounded-md3-xs bg-primary px-1.5 py-0.5 type-label-s font-medium text-on-primary">
                                                        {t("page.assetVersions.latestBadge")}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Version label(s) */}
                                        <div className="min-w-0">
                                            <div className="truncate font-mono type-title-s font-semibold text-on-surface">
                                                {node.primaryLabel}
                                            </div>
                                            {node.secondaryLabel && (
                                                <div className="truncate font-mono type-label-s text-on-surface-variant">
                                                    {t("page.assetVersions.versionTimeline.assetVersionTag", {
                                                        version: node.secondaryLabel,
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Footer metadata */}
                                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-outline-variant/35 pt-1.5 type-label-s text-on-surface-variant">
                                            <span className="truncate font-mono">
                                                {formatNodeTime(node.sortTimeMs)}
                                            </span>
                                            {hasAssetCounts ? (
                                                <span className="shrink-0 font-mono">
                                                    +{formatNumber(assetAdded)} ~{formatNumber(assetChanged)}
                                                </span>
                                            ) : node.masterdata ? (
                                                <span className="shrink-0 font-mono opacity-80">
                                                    {node.masterdata.shortSha}
                                                </span>
                                            ) : null}
                                        </div>
                                    </button>
                                </div>
                            );
                        })}

                        {supportsMasterdata && hasMoreMasterdata && (
                            <div className="flex shrink-0 flex-col justify-end pt-4">
                                <Button
                                    variant="tonal"
                                    size="s"
                                    onClick={onLoadMoreMasterdata}
                                    disabled={isLoadingMoreMasterdata}
                                    className="h-full min-h-[88px] whitespace-nowrap"
                                >
                                    {isLoadingMoreMasterdata
                                        ? t("common.state.loading")
                                        : t("page.masterdataDiff.versions.loadMore")}
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* Subtle status line for current position */}
                {filteredNodes.length > 0 && activeFilteredIndex >= 0 && (
                    <div className="mt-1.5 flex items-center justify-between type-label-s text-on-surface-variant">
                        <span>
                            {t("page.assetVersions.versionTimeline.positionSummary", {
                                current: activeFilteredIndex + 1,
                                total: filteredNodes.length,
                            })}
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={activeFilteredIndex >= filteredNodes.length - 1}
                                onClick={() => {
                                    if (activeFilteredIndex < filteredNodes.length - 1) {
                                        onSelectNode(filteredNodes[activeFilteredIndex + 1]);
                                    }
                                }}
                                className="state-layer focus-ring rounded-full px-2 py-0.5 disabled:opacity-40"
                            >
                                {t("page.assetVersions.prevVersion")}
                            </button>
                            <span aria-hidden>·</span>
                            <button
                                type="button"
                                disabled={activeFilteredIndex <= 0}
                                onClick={() => {
                                    if (activeFilteredIndex > 0) {
                                        onSelectNode(filteredNodes[activeFilteredIndex - 1]);
                                    }
                                }}
                                className="state-layer focus-ring rounded-full px-2 py-0.5 disabled:opacity-40"
                            >
                                {t("page.assetVersions.nextVersion")}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
