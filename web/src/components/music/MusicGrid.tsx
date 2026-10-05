"use client";
import MusicItem from "./MusicItem";
import { IMusicInfo } from "@/types/music";
import { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { EmptyState } from "@/components/md3";
import { mdMusicNote } from "@/components/md3/icons";

interface MusicGridProps {
    musics: IMusicInfo[];
    isLoading: boolean;
}

// Skeleton component for loading state
function MusicSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="rounded-md3-md overflow-hidden bg-surface-container-low">
                <div className="aspect-square bg-surface-container-high"></div>
                <div className="p-3 space-y-2">
                    <div className="h-4 bg-surface-container-highest rounded-md3-xs w-3/4"></div>
                    <div className="h-3 bg-surface-container-high rounded-md3-xs w-1/2"></div>
                </div>
            </div>
        </div>
    );
}

export default function MusicGrid({ musics, isLoading }: MusicGridProps) {
    const [now] = useState(() => Date.now());
    const { t } = useI18n();

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: 15 }).map((_, i) => (
                    <MusicSkeleton key={i} />
                ))}
            </div>
        );
    }

    if (musics.length === 0) {
        return <EmptyState icon={mdMusicNote} title={t("page.music.noResult")} description={t("page.music.noResultHint")} />;
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {musics.map((music) => {
                const isSpoiler = music.publishedAt > now;
                return <MusicItem key={music.id} music={music} isSpoiler={isSpoiler} />;
            })}
        </div>
    );
}
