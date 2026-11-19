"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/md3";
import { mdFolder, mdFolderFill, mdFolderOpen, mdKeyboardArrowDown } from "@/components/md3/icons";

export interface DirectoryTreeNodeLike {
    name: string;
    directories?: readonly DirectoryTreeNodeLike[];
}

interface DirectoryTreeSidebarProps<T extends DirectoryTreeNodeLike> {
    root: T;
    rootLabel: string;
    title: string;
    activePath: string;
    onSelectPath: (path: string) => void;
    renderBadge?: (node: T, nodePath: string) => React.ReactNode;
}

function collectAncestorPaths(path: string): string[] {
    const ancestors = [""];
    if (!path) return ancestors;
    const parts = path.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i += 1) {
        ancestors.push(parts.slice(0, i + 1).join("/"));
    }
    return ancestors;
}

interface TreeNodeRowProps<T extends DirectoryTreeNodeLike> {
    node: T;
    nodePath: string;
    displayName: string;
    depth: number;
    activePath: string;
    expandedPaths: Set<string>;
    onToggleExpand: (path: string) => void;
    onSelectPath: (path: string) => void;
    activeItemRef: React.RefObject<HTMLDivElement | null>;
    renderBadge?: (node: T, nodePath: string) => React.ReactNode;
}

function TreeNodeRowInner<T extends DirectoryTreeNodeLike>({
    node,
    nodePath,
    displayName,
    depth,
    activePath,
    expandedPaths,
    onToggleExpand,
    onSelectPath,
    activeItemRef,
    renderBadge,
}: TreeNodeRowProps<T>) {
    const isActive = activePath === nodePath;
    const isExpanded = expandedPaths.has(nodePath);

    const sortedChildren = useMemo(() => {
        if (!node.directories?.length) return [] as T[];
        return [...(node.directories as readonly T[])].sort((a, b) => a.name.localeCompare(b.name));
    }, [node.directories]);

    const hasChildren = sortedChildren.length > 0;

    return (
        <div>
            <div
                ref={isActive ? activeItemRef : undefined}
                style={{ paddingLeft: `${depth * 14 + 4}px` }}
                className={`group flex items-center gap-1 rounded-md3-md pr-2 transition-colors ${
                    isActive
                        ? "bg-primary-container/75 text-on-primary-container"
                        : "text-on-surface hover:bg-surface-container-high/70"
                }`}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand(nodePath);
                        }}
                        aria-label={displayName}
                        aria-expanded={isExpanded}
                        className="focus-ring flex h-7 w-5 shrink-0 items-center justify-center rounded-md3-xs text-on-surface-variant transition-colors hover:text-on-surface"
                    >
                        <Icon
                            path={mdKeyboardArrowDown}
                            size={16}
                            className={`transition-transform duration-150 ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                        />
                    </button>
                ) : (
                    <span className="h-7 w-5 shrink-0" aria-hidden />
                )}

                <button
                    type="button"
                    onClick={() => {
                        onSelectPath(nodePath);
                        if (hasChildren && !isExpanded) {
                            onToggleExpand(nodePath);
                        }
                    }}
                    title={displayName}
                    className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md3-sm py-1.5 text-left"
                >
                    <Icon
                        path={isActive || (hasChildren && isExpanded) ? mdFolderOpen : mdFolderFill}
                        size={18}
                        className={`shrink-0 ${isActive ? "text-primary" : "text-tertiary"}`}
                    />
                    <span className={`min-w-0 flex-1 truncate type-label-l ${isActive ? "font-semibold" : "font-normal"}`}>
                        {displayName}
                    </span>
                    {renderBadge?.(node, nodePath)}
                </button>
            </div>

            {hasChildren && isExpanded && (
                <div>
                    {sortedChildren.map((child) => {
                        const childPath = nodePath ? `${nodePath}/${child.name}` : child.name;
                        return (
                            <TreeNodeRow
                                key={childPath}
                                node={child}
                                nodePath={childPath}
                                displayName={child.name}
                                depth={depth + 1}
                                activePath={activePath}
                                expandedPaths={expandedPaths}
                                onToggleExpand={onToggleExpand}
                                onSelectPath={onSelectPath}
                                activeItemRef={activeItemRef}
                                renderBadge={renderBadge}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const TreeNodeRow = memo(TreeNodeRowInner) as typeof TreeNodeRowInner;

export default function DirectoryTreeSidebar<T extends DirectoryTreeNodeLike>({
    root,
    rootLabel,
    title,
    activePath,
    onSelectPath,
    renderBadge,
}: DirectoryTreeSidebarProps<T>) {
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(collectAncestorPaths(activePath)));
    const [prevActivePath, setPrevActivePath] = useState(activePath);
    const activeItemRef = useRef<HTMLDivElement | null>(null);

    if (activePath !== prevActivePath) {
        setPrevActivePath(activePath);
        const ancestors = collectAncestorPaths(activePath);
        if (ancestors.some((p) => !expandedPaths.has(p))) {
            const next = new Set(expandedPaths);
            for (const p of ancestors) next.add(p);
            setExpandedPaths(next);
        }
    }

    useEffect(() => {
        activeItemRef.current?.scrollIntoView({ block: "nearest" });
    }, [activePath]);

    const handleToggleExpand = (path: string) => {
        setExpandedPaths((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant/60 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                    <Icon path={mdFolder} size={18} className="shrink-0 text-tertiary" />
                    <span className="truncate type-title-s text-on-surface">{title}</span>
                </div>
                <button
                    type="button"
                    onClick={() => onSelectPath("")}
                    className={`focus-ring shrink-0 rounded-md3-xs px-1.5 py-0.5 type-label-m transition-colors ${
                        activePath === "" ? "text-primary font-medium" : "text-on-surface-variant hover:text-primary"
                    }`}
                >
                    {rootLabel}
                </button>
            </div>

            <div className="custom-scrollbar flex-1 space-y-0.5 overflow-y-auto p-2">
                <TreeNodeRow
                    node={root}
                    nodePath=""
                    displayName={rootLabel}
                    depth={0}
                    activePath={activePath}
                    expandedPaths={expandedPaths}
                    onToggleExpand={handleToggleExpand}
                    onSelectPath={onSelectPath}
                    activeItemRef={activeItemRef}
                    renderBadge={renderBadge}
                />
            </div>
        </div>
    );
}
