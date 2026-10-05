"use client";
import { Card, Icon } from "@/components/md3";
import { mdCalendarMonth } from "@/components/md3/icons";
import Image from "next/image";
import { IVirtualLiveInfo, VIRTUAL_LIVE_TYPE_COLORS, getVirtualLiveStatus, VIRTUAL_LIVE_STATUS_DISPLAY, VirtualLiveType } from "@/types/virtualLive";
import { getVirtualLiveBannerUrl } from "@/lib/assets";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";

interface VirtualLiveItemProps {
    virtualLive: IVirtualLiveInfo;
    isSpoiler?: boolean;
}

export default function VirtualLiveItem({ virtualLive, isSpoiler }: VirtualLiveItemProps) {
    const { assetSource } = useTheme();
    const { t, formatDate: formatLocaleDate } = useI18n();
    const bannerUrl = getVirtualLiveBannerUrl(virtualLive.assetbundleName, assetSource);
    const status = getVirtualLiveStatus(virtualLive);
    const statusDisplay = VIRTUAL_LIVE_STATUS_DISPLAY[status];

    // Format dates
    const formatDate = (timestamp: number) => formatLocaleDate(timestamp, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });

    return (
        <Card href={`/live/${virtualLive.id}`} variant="elevated" className="group h-full" data-shortcut-item="true">
            <div>
                {/* Banner Image */}
                <div className="relative aspect-[16/7] bg-surface-container-high overflow-hidden">
                    <Image
                        src={bannerUrl}
                        alt={virtualLive.name}
                        fill
                        className="object-contain"
                        unoptimized
                    />

                    {/* Status Badge */}
                    <div
                        className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 px-1.5 sm:px-2 py-0.5 rounded-full type-label-s text-white shadow-elev-1"
                        style={{ backgroundColor: statusDisplay.color }}
                    >
                        {t(`common.status.${status}`)}
                    </div>

                    {/* Type Badge */}
                    <div
                        className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-1.5 sm:px-2 py-0.5 rounded-full type-label-s text-white shadow-elev-1"
                        style={{ backgroundColor: VIRTUAL_LIVE_TYPE_COLORS[virtualLive.virtualLiveType as VirtualLiveType] || "#9E9E9E" }}
                    >
                        {t(`common.virtualLiveTypes.${virtualLive.virtualLiveType}`)}
                    </div>

                    {/* Spoiler Badge */}
                    {isSpoiler && (
                        <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 px-1.5 sm:px-2 py-0.5 bg-tertiary text-on-tertiary rounded-full type-label-s shadow-elev-1">
                            {t("common.badge.spoiler")}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="p-2.5 sm:p-4">
                    {/* ID Badge */}
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <span className="px-1.5 sm:px-2 py-0.5 rounded-md3-sm bg-surface-container-high text-on-surface-variant type-label-s font-mono">
                            #{virtualLive.id}
                        </span>
                    </div>

                    {/* Name */}
                    <h3 className="type-title-s sm:type-title-m text-on-surface mb-1.5 sm:mb-2 group-hover:text-primary transition-colors">
                        <TranslatedText
                            original={virtualLive.name}
                            category="virtualLive"
                            field="name"
                            originalClassName=""
                            translationClassName="type-body-s text-on-surface-variant mt-0.5"
                        />
                    </h3>

                    {/* Date Range */}
                    <div className="type-label-m text-on-surface-variant hidden sm:block">
                        <div className="flex items-center gap-1">
                            <Icon path={mdCalendarMonth} size={14} />
                            <span>{formatDate(virtualLive.startAt)}</span>
                            <span>~</span>
                            <span>{formatDate(virtualLive.endAt)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
