"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import MainLayout from "@/components/MainLayout";
import { PageContainer, PageHeader, Tabs } from "@/components/md3";
import DailyChallengePanel from "@/components/guess-music/DailyChallengePanel";
import FreePlayPanel, { FREE_PLAY_PARAMS } from "@/components/guess-music/FreePlayPanel";
import StarMoeAccountChip from "@/components/guess-music/StarMoeAccountChip";
import { useI18n } from "@/contexts/I18nContext";

type TabId = "daily" | "free";

const TAB_IDS: readonly TabId[] = ["daily", "free"];
const noSubscription = () => () => {};

/** `?tab=` wins; a share link (settings in the URL) opens free play; otherwise the daily challenge. */
function tabFromSearch(search: string): TabId {
    const params = new URLSearchParams(search);
    const tab = params.get("tab");
    if ((TAB_IDS as readonly string[]).includes(tab ?? "")) return tab as TabId;
    return FREE_PLAY_PARAMS.some((name) => params.has(name)) ? "free" : "daily";
}

export default function GuessMusicClient() {
    const { t } = useI18n();
    // null while prerendering and hydrating: the URL is only read in the browser.
    const search = useSyncExternalStore(noSubscription, () => window.location.search, () => null);
    const [chosenTab, setChosenTab] = useState<TabId | null>(null);
    const [freeVisited, setFreeVisited] = useState(false);
    const [freePlaying, setFreePlaying] = useState(false);
    const tab = chosenTab ?? (search === null ? "daily" : tabFromSearch(search));
    const [initialSearch] = useState(() => search);
    const freeSearch = initialSearch ?? search;

    const selectTab = (next: TabId) => {
        setChosenTab(next);
        if (next === "free") setFreeVisited(true);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", next);
        window.history.replaceState(window.history.state, "", url.toString());
    };

    const [dailyPlaying, setDailyPlaying] = useState(false);
    const handlePlayingChange = useCallback((playing: boolean) => setFreePlaying(playing), []);
    const handleDailyPlayingChange = useCallback((playing: boolean) => setDailyPlaying(playing), []);
    const showFree = tab === "free" || freeVisited;

    return (
        <MainLayout>
            <PageContainer className="max-w-4xl">
                <PageHeader
                    eyebrow={t("page.guessMusic.badge")}
                    title={t("page.guessMusic.title")}
                    description={t("page.guessMusic.description")}
                    actions={<StarMoeAccountChip />}
                />
                {/* A running game (either tab) hides the tabs: its clip and timer must not carry on behind the other tab. */}
                {!freePlaying && !dailyPlaying && (
                    <Tabs
                        aria-label={t("page.guessMusic.tabs.label")}
                        items={[
                            { value: "daily", label: t("page.guessMusic.tabs.daily") },
                            { value: "free", label: t("page.guessMusic.tabs.free") },
                        ]}
                        value={tab}
                        onValueChange={selectTab}
                        className="mb-4 sm:mb-6"
                    />
                )}
                <div role="tabpanel" aria-label={t("page.guessMusic.tabs.daily")} hidden={tab !== "daily"}>
                    <DailyChallengePanel onPlayingChange={handleDailyPlayingChange} />
                </div>
                {showFree && freeSearch !== null && (
                    <div role="tabpanel" aria-label={t("page.guessMusic.tabs.free")} hidden={tab !== "free"}>
                        <FreePlayPanel initialSearch={freeSearch} active={tab === "free"} onPlayingChange={handlePlayingChange} />
                    </div>
                )}
            </PageContainer>
        </MainLayout>
    );
}
