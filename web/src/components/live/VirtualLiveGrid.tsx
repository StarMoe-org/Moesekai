"use client";
import VirtualLiveItem from "./VirtualLiveItem";
import { IVirtualLiveInfo } from "@/types/virtualLive";
import { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { EmptyState } from "@/components/md3";
import { mdMusicNote } from "@/components/md3/icons";

interface VirtualLiveGridProps {
    virtualLives: IVirtualLiveInfo[];
    isLoading?: boolean;
}

// Skeleton loading component
function VirtualLiveSkeleton() {
    return (
        <div className="rounded-md3-md overflow-hidden bg-surface-container-low animate-pulse">
            <div className="aspect-[16/7] bg-surface-container-highest" />
            <div className="p-4 space-y-3">
                <div className="h-4 bg-surface-container-highest rounded-md3-xs w-16" />
                <div className="h-4 bg-surface-container-highest rounded-md3-xs w-3/4" />
                <div className="h-3 bg-surface-container-highest rounded-md3-xs w-1/2" />
            </div>
        </div>
    );
}

export default function VirtualLiveGrid({ virtualLives, isLoading = false }: VirtualLiveGridProps) {
    const [now] = useState(() => Date.now());
    const { t } = useI18n();

    // Show skeletons while loading
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <VirtualLiveSkeleton key={i} />
                ))}
            </div>
        );
    }

    // Empty state
    if (virtualLives.length === 0) {
        return <EmptyState icon={mdMusicNote} title={t("page.live.noResult")} description={t("page.live.noResultHint")} />;
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {virtualLives.map(virtualLive => {
                const isSpoiler = virtualLive.startAt > now;
                return <VirtualLiveItem key={virtualLive.id} virtualLive={virtualLive} isSpoiler={isSpoiler} />;
            })}
        </div>
    );
}
