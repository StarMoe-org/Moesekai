"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "@/components/LocalizedLink";
import { Button, ErrorState } from "@/components/md3";
import { mdChevronRight } from "@/components/md3/icons";
import Image from "next/image";
import {
    IVirtualLiveInfo,
    VIRTUAL_LIVE_TYPE_COLORS,
    getVirtualLiveStatus,
    VIRTUAL_LIVE_STATUS_DISPLAY,
    VirtualLiveType,
} from "@/types/virtualLive";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import { getVirtualLiveBannerUrl } from "@/lib/assets";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useI18n } from "@/contexts/I18nContext";

export default function UpcomingLiveTab() {
    const { assetSource, isShowSpoiler } = useTheme();
    const { t, formatDate: formatLocaleDate } = useI18n();
    const [virtualLives, setVirtualLives] = useState<IVirtualLiveInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                const data = await fetchMasterData<IVirtualLiveInfo[]>("virtualLives.json");
                setVirtualLives(data);
                setError(null);
            } catch (err) {
                console.error("Error fetching virtual lives:", err);
                setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [t]);

    // Find upcoming or ongoing virtual lives
    const displayLives = useMemo(() => {
        const now = Date.now();

        // Exclude beginner type
        const filtered = virtualLives.filter(vl => vl.virtualLiveType !== "beginner");

        // Ongoing lives (already started, not ended)
        const ongoing = filtered.filter(vl => vl.startAt <= now && vl.endAt > now);

        // Upcoming lives (not started yet) — only when spoiler is on
        const upcoming = isShowSpoiler
            ? filtered.filter(vl => vl.startAt > now)
            : [];

        // Combine: ongoing first, then upcoming sorted by startAt
        const combined = [
            ...ongoing.sort((a, b) => a.startAt - b.startAt),
            ...upcoming.sort((a, b) => a.startAt - b.startAt),
        ];

        return combined.slice(0, 3);
    }, [virtualLives, isShowSpoiler]);

    // Find the next schedule for a virtual live
    const getNextSchedule = (vl: IVirtualLiveInfo) => {
        const now = Date.now();
        const schedules = vl.virtualLiveSchedules || [];
        // Find the next upcoming schedule
        const next = schedules
            .filter(s => s.endAt > now)
            .sort((a, b) => a.startAt - b.startAt)[0];
        return next || null;
    };

    const formatDate = (ts: number) => formatLocaleDate(ts, {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2].map(i => (
                    <div key={i} className="animate-pulse h-20 w-full rounded-md3-lg bg-surface-container-high" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <ErrorState title={t("page.home.upcomingLive.loadFailedTitle")} message={error} />
        );
    }

    if (displayLives.length === 0) {
        return (
            <div className="p-8 text-center text-on-surface-variant bg-surface-container-low rounded-md3-xl">
                <p className="type-body-l">{t("page.home.upcomingLive.noData")}</p>
            </div>
        );
    }

    return (
        <div>
            <div className="space-y-3">
                {displayLives.map(vl => {
                    const status = getVirtualLiveStatus(vl);
                    const statusDisplay = VIRTUAL_LIVE_STATUS_DISPLAY[status];
                    const typeLabel = t(`common.virtualLiveTypes.${vl.virtualLiveType}`);
                    const typeName = typeLabel === `common.virtualLiveTypes.${vl.virtualLiveType}` ? vl.virtualLiveType : typeLabel;
                    const typeColor = VIRTUAL_LIVE_TYPE_COLORS[vl.virtualLiveType as VirtualLiveType] || "#9E9E9E";
                    const nextSchedule = getNextSchedule(vl);

                    return (
                        <Link key={vl.id} href={`/live/${vl.id}`} className="state-layer focus-ring block group rounded-md3-lg">
                            <div className="relative flex h-20 sm:h-24 rounded-md3-lg overflow-hidden bg-surface-container-low shadow-elev-1 transition-shadow duration-200 group-hover:shadow-elev-2">
                                {/* Left: Banner (35%) */}
                                <div className="w-[35%] relative overflow-hidden">
                                    <Image
                                        src={getVirtualLiveBannerUrl(vl.assetbundleName, assetSource)}
                                        alt={vl.name}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                    <div className="absolute inset-0 bg-scrim/20" />
                                </div>

                                {/* Right: Info (65%) */}
                                <div className="w-[65%] flex flex-col justify-center p-3 sm:p-4 gap-1">
                                    {/* Badges */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span
                                            className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md3-xs text-white"
                                            style={{ backgroundColor: statusDisplay.color }}
                                        >
                                            {t(`common.status.${status}`)}
                                        </span>
                                        <span
                                            className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md3-xs text-white"
                                            style={{ backgroundColor: typeColor }}
                                        >
                                            {typeName}
                                        </span>
                                    </div>

                                    {/* Title */}
                                    <h3 className="type-title-s text-on-surface line-clamp-1 group-hover:text-primary transition-colors">
                                        <TranslatedText
                                            original={vl.name}
                                            category="virtualLive"
                                            field="name"
                                            originalClassName="line-clamp-1"
                                            translationClassName="type-label-s text-on-surface-variant line-clamp-1"
                                        />
                                    </h3>

                                    {/* Schedule info */}
                                    <div className="type-label-s text-on-surface-variant font-mono">
                                        {nextSchedule ? (
                                            <span>
                                                {t("page.home.upcomingLive.nextSchedule", { date: formatDate(nextSchedule.startAt) })}
                                            </span>
                                        ) : (
                                            <span>
                                                {formatDate(vl.startAt)} - {formatDate(vl.endAt)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
            {/* View All Link */}
            <div className="mt-4 text-center">
                <Button variant="text" trailingIcon={mdChevronRight} href="/live">
                    {t("page.home.upcomingLive.viewAll")}
                </Button>
            </div>
        </div>
    );
}
