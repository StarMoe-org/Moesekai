"use client";
import { Suspense } from "react";
import MainLayout from "@/components/MainLayout";
import EventGrid from "@/components/events/EventGrid";
import EventFilters from "@/components/events/EventFilters";
import { useEventListData } from "@/hooks/useEventListData";
import { useQuickFilter } from "@/contexts/QuickFilterContext";
import { useI18n } from "@/contexts/I18nContext";
import { ErrorState, LoadMore, LoadingState, PageContainer, PageHeader } from "@/components/md3";

function EventsContent() {
    const { t } = useI18n();
    const data = useEventListData({ storageKey: "events", basePath: "/events" });

    const quickFilterContent = (
        <EventFilters
            selectedTypes={data.selectedTypes}
            onTypeChange={data.setSelectedTypes}
            selectedEventUnits={data.selectedEventUnits}
            onEventUnitChange={data.setSelectedEventUnits}
            selectedCharacters={data.selectedCharacters}
            onCharacterChange={data.setSelectedCharacters}
            selectedUnitIds={data.selectedUnitIds}
            onUnitIdsChange={data.setSelectedUnitIds}
            charaUnits={data.charaUnits}
            selectedBannerChars={data.selectedBannerChars}
            onBannerCharsChange={data.setSelectedBannerChars}
            selectedBannerUnitIds={data.selectedBannerUnitIds}
            onBannerUnitIdsChange={data.setSelectedBannerUnitIds}
            selectedBonusAttr={data.selectedBonusAttr}
            onBonusAttrChange={data.setSelectedBonusAttr}
            searchQuery={data.searchQuery}
            onSearchChange={data.setSearchQuery}
            sortBy={data.sortBy}
            sortOrder={data.sortOrder}
            onSortChange={data.handleSortChange}
            onReset={data.resetFilters}
            totalEvents={data.events.length}
            filteredEvents={data.filteredEvents.length}
        />
    );

    useQuickFilter(t("page.events.filterTitle"), quickFilterContent, [
        data.selectedTypes,
        data.selectedEventUnits,
        data.selectedCharacters,
        data.selectedUnitIds,
        data.selectedBannerChars,
        data.selectedBannerUnitIds,
        data.selectedBonusAttr,
        data.searchQuery,
        data.sortBy,
        data.sortOrder,
        data.events.length,
        data.filteredEvents.length,
    ]);

    return (
        <PageContainer>
            <PageHeader
                align="center"
                eyebrow={t("page.events.badge")}
                title={t("page.events.title")}
                highlight={t("page.events.titleHighlight")}
                description={t("page.events.description")}
            />

            {data.error && (
                <ErrorState
                    className="mb-6"
                    title={t("common.state.loadingFailed")}
                    message={data.error}
                    retryLabel={t("common.action.retry")}
                />
            )}

            {/* Event Grid. Filters live in the global FilterDrawer (registered
                above via useQuickFilter), so the page body is a single column. */}
            <div className="min-w-0">
                <EventGrid events={data.displayedEvents} isLoading={data.isLoading} eventUnitMap={data.eventUnitMap} eventBannerCharMap={data.eventBannerCharMap} eventBonusAttrMap={data.eventBonusAttrMap} eventStoryIds={data.eventStoryIds} />

                {!data.isLoading && (
                    <LoadMore
                        label={t("page.events.loadMore")}
                        shown={data.displayedEvents.length}
                        total={data.filteredEvents.length}
                        onLoadMore={data.loadMore}
                        allLoadedLabel={t("page.events.allLoaded", { count: data.filteredEvents.length })}
                    />
                )}
            </div>
        </PageContainer>
    );
}

function EventsLoadingFallback() {
    const { t } = useI18n();
    return <LoadingState label={t("page.events.loadingFallback")} />;
}

export default function EventsClient() {
    return (
        <MainLayout>
            <Suspense fallback={<EventsLoadingFallback />}>
                <EventsContent />
            </Suspense>
        </MainLayout>
    );
}
