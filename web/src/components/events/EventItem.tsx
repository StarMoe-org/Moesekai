"use client";
import { Card, Icon } from "@/components/md3";
import { mdCalendarMonth } from "@/components/md3/icons";
import Image from "next/image";
import { IEventInfo, EVENT_TYPE_COLORS, getEventStatus, EVENT_STATUS_DISPLAY, EventType } from "@/types/events";
import { getEventStoryBannerUrl, getEventLogoUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { TranslatedText } from "@/components/common/TranslatedText";
import { UNIT_DATA, UNIT_ICON_FILES, UNIT_ID_LABEL_KEYS, ATTR_ICON_PATHS, ATTR_NAMES } from "@/types/types";
import { useI18n } from "@/contexts/I18nContext";

// Build unit icon mapping from UNIT_DATA
const EVENT_UNIT_ICON: Record<string, { icon: string; labelKey: string }> = Object.fromEntries(
    UNIT_DATA.filter(u => UNIT_ICON_FILES[u.id]).map(u => [u.id, { icon: UNIT_ICON_FILES[u.id], labelKey: UNIT_ID_LABEL_KEYS[u.id] ?? `common.units.${u.id}` }])
);

interface EventItemProps {
    event: IEventInfo;
    isSpoiler?: boolean;
    basePath?: string;
    unitType?: string;
    bonusAttr?: string;
    eventStoryIds?: Set<number>;
}

export default function EventItem({ event, isSpoiler, basePath = "/events", unitType, bonusAttr, eventStoryIds }: EventItemProps) {
    const { assetSource } = useTheme();
    const { t, formatDate: formatLocaleDate } = useI18n();
    const hasEventStoryBanner = eventStoryIds ? eventStoryIds.has(event.id) : true;
    const thumbnailUrl = hasEventStoryBanner
        ? getEventStoryBannerUrl(event.assetbundleName, assetSource)
        : getEventLogoUrl(event.assetbundleName, assetSource);
    const status = getEventStatus(event);
    const statusDisplay = EVENT_STATUS_DISPLAY[status];

    // Format dates
    const formatDate = (timestamp: number) => formatLocaleDate(timestamp, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });

    return (
        <Card href={`${basePath}/${event.id}`} variant="elevated" className="group h-full" data-shortcut-item="true">
            {/* Event Logo */}
            <div className="relative aspect-[16/9] bg-surface-container-high overflow-hidden">
                <Image
                    src={thumbnailUrl}
                    alt={event.name}
                    fill
                    className={`object-contain ${hasEventStoryBanner ? "" : "p-4"}`}
                    unoptimized
                />

                {/* Status Badge (status data color) */}
                <div
                    className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 px-1.5 sm:px-2 py-0.5 rounded-full type-label-s text-white shadow-elev-1"
                    style={{ backgroundColor: statusDisplay.color }}
                >
                    {t(`common.status.${status}`)}
                </div>

                {/* Event Type Badge (event type data color) */}
                <div
                    className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-1.5 sm:px-2 py-0.5 rounded-full type-label-s text-white shadow-elev-1"
                    style={{ backgroundColor: EVENT_TYPE_COLORS[event.eventType as EventType] }}
                >
                    {t(`common.eventTypes.${event.eventType}`)}
                </div>

                {/* Spoiler Badge - Bottom Right */}
                {isSpoiler && (
                    <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 px-1.5 sm:px-2 py-0.5 rounded-full bg-tertiary text-on-tertiary type-label-s shadow-elev-1">
                        {t("common.badge.spoiler")}
                    </div>
                )}
            </div>

            {/* Event Info */}
            <div className="p-2.5 sm:p-4">
                {/* ID Badge + Unit Badge */}
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                    <span className="px-1.5 sm:px-2 py-0.5 rounded-md3-sm bg-surface-container-high text-on-surface-variant type-label-s font-mono">
                        #{event.id}
                    </span>
                    {unitType && (
                        EVENT_UNIT_ICON[unitType] ? (
                            <div className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center" title={t(EVENT_UNIT_ICON[unitType].labelKey)}>
                                <Image
                                    src={`/data/icon/${EVENT_UNIT_ICON[unitType].icon}`}
                                    alt={t(EVENT_UNIT_ICON[unitType].labelKey)}
                                    width={16}
                                    height={16}
                                    className="object-contain"
                                    unoptimized
                                />
                            </div>
                        ) : (
                            <span className="px-1.5 py-0.5 rounded-md3-sm bg-surface-container-high text-on-surface-variant type-label-s" title={t("common.badge.mixed")}>{t("common.badge.mixed")}</span>
                        )
                    )}
                    {bonusAttr && ATTR_ICON_PATHS[bonusAttr as keyof typeof ATTR_ICON_PATHS] && (
                        <div className="w-5 h-5 flex items-center justify-center" title={ATTR_NAMES[bonusAttr as keyof typeof ATTR_NAMES]}>
                            <Image
                                src={`/data/icon/${ATTR_ICON_PATHS[bonusAttr as keyof typeof ATTR_ICON_PATHS]}`}
                                alt={ATTR_NAMES[bonusAttr as keyof typeof ATTR_NAMES] || bonusAttr}
                                width={16}
                                height={16}
                                className="object-contain"
                                unoptimized
                            />
                        </div>
                    )}
                </div>

                {/* Event Name */}
                <h3 className="type-title-s sm:type-title-m text-on-surface mb-1.5 sm:mb-2 group-hover:text-primary transition-colors">
                    <TranslatedText
                        original={event.name}
                        category="events"
                        field="name"
                        originalClassName=""
                        translationClassName="type-body-s text-on-surface-variant mt-0.5"
                    />
                </h3>

                {/* Date Range */}
                <div className="type-label-m text-on-surface-variant hidden sm:block">
                    <div className="flex items-center gap-1">
                        <Icon path={mdCalendarMonth} size={14} />
                        <span>{formatDate(event.startAt)}</span>
                        <span>~</span>
                        <span>{formatDate(event.aggregateAt)}</span>
                    </div>
                </div>
            </div>
        </Card>
    );
}
