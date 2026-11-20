"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

interface ExplorerSplitPaneProps {
    showSidebar: boolean;
    sidebar: React.ReactNode;
    children: React.ReactNode;
    resizeLabel: string;
    storageKey?: string;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    maxWidthRatio?: number;
}

const DEFAULT_STORAGE_KEY = "asset-explorer-sidebar-width";
const widthListeners = new Set<() => void>();

function subscribeWidthStore(callback: () => void) {
    widthListeners.add(callback);
    const onStorage = () => callback();
    window.addEventListener("storage", onStorage);
    return () => {
        widthListeners.delete(callback);
        window.removeEventListener("storage", onStorage);
    };
}

function notifyWidthStore() {
    for (const listener of widthListeners) listener();
}

export default function ExplorerSplitPane({
    showSidebar,
    sidebar,
    children,
    resizeLabel,
    storageKey = DEFAULT_STORAGE_KEY,
    defaultWidth = 272,
    minWidth = 180,
    maxWidth = 560,
    maxWidthRatio = 0.55,
}: ExplorerSplitPaneProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const clampWidth = useCallback(
        (rawWidth: number) => {
            const containerWidth = containerRef.current?.clientWidth ?? 0;
            const ratioMax = containerWidth > 0 ? Math.floor(containerWidth * maxWidthRatio) : maxWidth;
            const upper = Math.max(minWidth, Math.min(maxWidth, ratioMax));
            return Math.max(minWidth, Math.min(upper, Math.round(rawWidth)));
        },
        [minWidth, maxWidth, maxWidthRatio],
    );

    const sidebarWidth = useSyncExternalStore(
        subscribeWidthStore,
        () => {
            if (typeof window === "undefined") return defaultWidth;
            const saved = Number(localStorage.getItem(storageKey));
            return Number.isFinite(saved) && saved >= minWidth
                ? Math.max(minWidth, Math.min(maxWidth, Math.round(saved)))
                : defaultWidth;
        },
        () => defaultWidth,
    );

    const commitWidth = useCallback(
        (nextWidth: number) => {
            const clamped = clampWidth(nextWidth);
            if (containerRef.current) {
                containerRef.current.style.setProperty("--explorer-sidebar-width", `${clamped}px`);
            }
            if (typeof window !== "undefined") {
                localStorage.setItem(storageKey, String(clamped));
                notifyWidthStore();
            }
        },
        [clampWidth, storageKey],
    );

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const container = containerRef.current;
        if (!container) return;

        e.preventDefault();
        const startX = e.clientX;
        const startWidth = sidebarWidth;
        let latestWidth = startWidth;

        setIsDragging(true);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";

        const onPointerMove = (moveEvent: PointerEvent) => {
            latestWidth = clampWidth(startWidth + (moveEvent.clientX - startX));
            container.style.setProperty("--explorer-sidebar-width", `${latestWidth}px`);
        };

        const finishDrag = () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", finishDrag);
            window.removeEventListener("pointercancel", finishDrag);
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
            setIsDragging(false);
            commitWidth(latestWidth);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", finishDrag);
        window.addEventListener("pointercancel", finishDrag);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            commitWidth(sidebarWidth - 16);
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            commitWidth(sidebarWidth + 16);
        } else if (e.key === "Home") {
            e.preventDefault();
            commitWidth(defaultWidth);
        }
    };

    return (
        <div
            ref={containerRef}
            style={{ "--explorer-sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
            className="flex flex-col lg:h-[68vh] lg:min-h-[520px] lg:max-h-[820px] lg:flex-row"
        >
            {showSidebar && (
                <>
                    <aside className="flex max-h-64 w-full shrink-0 flex-col border-b border-outline-variant/60 bg-surface-container-lowest/40 lg:max-h-none lg:w-[var(--explorer-sidebar-width)] lg:border-b-0">
                        {sidebar}
                    </aside>

                    {/* Draggable Vertical Splitter (desktop) */}
                    <div
                        role="separator"
                        tabIndex={0}
                        aria-orientation="vertical"
                        aria-label={resizeLabel}
                        aria-valuenow={sidebarWidth}
                        aria-valuemin={minWidth}
                        aria-valuemax={maxWidth}
                        title={resizeLabel}
                        onPointerDown={handlePointerDown}
                        onDoubleClick={() => commitWidth(defaultWidth)}
                        onKeyDown={handleKeyDown}
                        className={`group focus-ring relative hidden w-2 shrink-0 cursor-col-resize touch-none select-none items-center justify-center transition-colors lg:flex ${
                            isDragging ? "bg-primary/10" : "hover:bg-primary/5"
                        }`}
                    >
                        <div
                            className={`h-full transition-all ${
                                isDragging ? "w-0.5 bg-primary" : "w-px bg-outline-variant/70 group-hover:w-0.5 group-hover:bg-primary/70"
                            }`}
                        />
                        <div
                            className={`pointer-events-none absolute h-8 w-1 rounded-full transition-colors ${
                                isDragging ? "bg-primary" : "bg-outline-variant group-hover:bg-primary"
                            }`}
                        />
                    </div>
                </>
            )}

            {children}
        </div>
    );
}
