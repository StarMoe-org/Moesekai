"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StoryStudioHub, type StoryHubSortKey, type StoryStudioHubSlots } from "@moesekai/story-editor";
import MainLayout from "@/components/MainLayout";
import { Button, LoadingState } from "@/components/md3";
import { mdWandStars } from "@/components/md3/icons";
import {
    StoryDesktopGuideDialog,
    useStoryDesktopGuide,
} from "@/components/story-maker/StoryDesktopGuideDialog";
import { StoryStudioWebProvider } from "@/components/story-maker/StoryStudioWebProvider";
import { useI18n } from "@/contexts/I18nContext";
import { useScrollRestore } from "@/hooks/useScrollRestore";

function isSortKey(value: string | null): value is StoryHubSortKey {
    return value === "updated" || value === "created" || value === "title";
}

function StoryMakerContent() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(true);
    const {
        isOpen: desktopGuideOpen,
        openGuide: openDesktopGuide,
        closeGuide: closeDesktopGuide,
    } = useStoryDesktopGuide();

    const initialSearch = searchParams.get("search") ?? "";
    const rawSort = searchParams.get("sortBy");
    const initialSortBy: StoryHubSortKey = isSortKey(rawSort) ? rawSort : "updated";

    const { displayCount, loadMore, resetDisplayCount } = useScrollRestore({
        storageKey: "story-maker",
        defaultDisplayCount: 12,
        increment: 12,
        isReady: !loading,
    });

    const handleFilterChange = useCallback(
        ({ search, sortBy }: { search: string; sortBy: StoryHubSortKey }) => {
            if (typeof window === "undefined") return;
            const url = new URL(window.location.href);
            if (search) url.searchParams.set("search", search);
            else url.searchParams.delete("search");
            if (sortBy !== "updated") url.searchParams.set("sortBy", sortBy);
            else url.searchParams.delete("sortBy");
            window.history.replaceState({}, "", url.toString());
        },
        [],
    );

    const slots = useMemo<StoryStudioHubSlots>(
        () => ({
            headerActions: (
                <Button
                    variant="tonal"
                    icon={mdWandStars}
                    onClick={openDesktopGuide}
                    className="px-3 sm:px-4"
                >
                    {t("page.storyMaker.desktopGuide.triggerAction")}
                </Button>
            ),
        }),
        [openDesktopGuide, t],
    );

    return (
        <>
            <StoryStudioHub
                initialSearch={initialSearch}
                initialSortBy={initialSortBy}
                onFilterChange={handleFilterChange}
                scrollRestore={{ displayCount, loadMore, resetDisplayCount }}
                onLoadingChange={setLoading}
                showMobileNotice
                slots={slots}
            />
            <StoryDesktopGuideDialog
                isOpen={desktopGuideOpen}
                onClose={closeDesktopGuide}
            />
        </>
    );
}

export default function StoryMakerClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingState />}>
                <StoryStudioWebProvider>
                    <StoryMakerContent />
                </StoryStudioWebProvider>
            </Suspense>
        </MainLayout>
    );
}
