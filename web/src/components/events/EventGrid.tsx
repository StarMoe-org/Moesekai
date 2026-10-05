"use client";
import EventItem from "./EventItem";
import { IEventInfo } from "@/types/events";
import { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { EmptyState } from "@/components/md3";
import { mdCalendarMonth } from "@/components/md3/icons";

interface EventGridProps {
    events: IEventInfo[];
    isLoading?: boolean;
    basePath?: string;
    eventUnitMap?: Map<number, string>;
    eventBannerCharMap?: Map<number, number>;
    eventBonusAttrMap?: Map<number, string>;
    eventStoryIds?: Set<number>;
}

// Skeleton loading component
function EventSkeleton() {
    return (
        <div className="overflow-hidden rounded-md3-md bg-surface-container-low animate-pulse">
            <div className="aspect-[16/9] bg-surface-container-highest" />
            <div className="p-4 space-y-3">
                <div className="h-4 w-16 rounded-md3-xs bg-surface-container-highest" />
                <div className="h-4 w-3/4 rounded-md3-xs bg-surface-container-highest" />
                <div className="h-3 w-1/2 rounded-md3-xs bg-surface-container-highest" />
            </div>
        </div>
    );
}

export default function EventGrid({ events, isLoading = false, basePath = "/events", eventUnitMap, eventBannerCharMap: _eventBannerCharMap, eventBonusAttrMap, eventStoryIds }: EventGridProps) {
    const [now] = useState(() => Date.now());
    const { t } = useI18n();

    // Show skeletons while loading
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <EventSkeleton key={i} />
                ))}
            </div>
        );
    }

    // Empty state
    if (events.length === 0) {
        return <EmptyState icon={mdCalendarMonth} title={t("page.events.noResult")} description={t("page.events.noResultHint")} />;
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {events.map(event => {
                const isSpoiler = event.startAt > now;
                return <EventItem key={event.id} event={event} isSpoiler={isSpoiler} basePath={basePath} unitType={eventUnitMap?.get(event.id)} bonusAttr={eventBonusAttrMap?.get(event.id)} eventStoryIds={eventStoryIds} />;
            })}
        </div>
    );
}
