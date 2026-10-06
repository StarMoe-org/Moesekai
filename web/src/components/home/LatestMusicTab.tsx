"use client";
import { useState, useEffect } from "react";
import Link from "@/components/LocalizedLink";
import { Button, EmptyState, ErrorState } from "@/components/md3";
import { mdChevronRight, mdMusicNote } from "@/components/md3/icons";
import Image from "next/image";
import { IMusicInfo } from "@/types/music";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import { getMusicJacketUrl } from "@/lib/assets";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";

export default function LatestMusicTab() {
    const { assetSource, isShowSpoiler } = useTheme();
    const { t, formatDate: formatLocaleDate } = useI18n();
    const { t: translateMasterText } = useTranslation();
    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const musicsData = await fetchMasterData<IMusicInfo[]>("musics.json");

                // Filter and sort by publishedAt
                const now = Date.now();
                const filteredMusics = musicsData
                    .filter(music => isShowSpoiler || music.publishedAt <= now)
                    .sort((a, b) => b.publishedAt - a.publishedAt)
                    .slice(0, 6);

                setMusics(filteredMusics);
                setError(null);
            } catch (err) {
                console.error("Error fetching music data:", err);
                setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [isShowSpoiler, t]);

    if (isLoading) {
        return (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="animate-pulse">
                        <div className="aspect-square rounded-md3-md bg-surface-container-high" />
                        <div className="mt-2 h-3 bg-surface-container-high rounded-md3-xs w-3/4" />
                    </div>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <ErrorState title={t("page.home.latestMusic.loadFailedTitle")} message={error} />
        );
    }

    if (musics.length === 0) {
        return (
            <EmptyState icon={mdMusicNote} title={t("page.home.latestMusic.noData")} className="rounded-md3-xl bg-surface-container-low py-8" />
        );
    }

    // Format date helper
    const formatDate = (timestamp: number) => formatLocaleDate(timestamp, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });

    return (
        <div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {musics.map((music) => {
                    const translatedTitle = translateMasterText("music", "title", music.title) ?? music.title;
                    const now = Date.now();
                    const isSpoiler = music.publishedAt > now;

                    return (
                        <Link key={music.id} href={`/music/${music.id}`} className="group state-layer focus-ring block rounded-md3-md">
                            <div className={`relative rounded-md3-md overflow-hidden bg-surface-card shadow-elev-1 transition-shadow duration-200 group-hover:shadow-elev-2 ${isSpoiler ? 'ring-2 ring-tertiary' : ''}`}>
                                {/* Music Jacket */}
                                <div className="aspect-square relative bg-surface-container-high">
                                    <Image
                                        src={getMusicJacketUrl(music.assetbundleName, assetSource)}
                                        alt={music.title}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                    {/* Spoiler Badge */}
                                    {isSpoiler && (
                                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-tertiary text-on-tertiary text-[10px] font-bold rounded-md3-xs">
                                            {t("page.home.latestMusic.newBadge")}
                                        </div>
                                    )}
                                </div>
                                {/* Music Info */}
                                <div className="p-2">
                                    <p className="type-label-m text-on-surface truncate group-hover:text-primary transition-colors">
                                        {translatedTitle}
                                    </p>
                                    <p className="type-label-s text-on-surface-variant mt-0.5 hidden sm:block">
                                        {formatDate(music.publishedAt)}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
            {/* View All Link */}
            <div className="mt-4 text-center">
                <Button variant="text" trailingIcon={mdChevronRight} href="/music">
                    {t("page.home.latestMusic.viewAll")}
                </Button>
            </div>
        </div>
    );
}
