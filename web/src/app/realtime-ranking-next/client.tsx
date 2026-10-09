"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import MainLayout from "@/components/MainLayout";
import { Chip, ErrorState, LoadingState, PageContainer, Surface } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import { getCharacterName } from "@/lib/i18n";
import { fetchRealtimeRankingMasterData } from "@/lib/realtime-ranking-next-api";
import {
    RealtimeRankingMasterData,
    RealtimeRankingNextBoardMode,
    RealtimeRankingRegion,
    isRealtimeRankingRegion,
} from "@/types/realtime-ranking-next";
import CurrentEventCard from "@/components/realtime-ranking/CurrentEventCard";
import ParkingPeriodsModal from "@/components/realtime-ranking/ParkingPeriodsModal";
import BoardHeader from "./_components/BoardHeader";
import BoardList from "./_components/BoardList";
import { useRealtimeBoard, POLL_INTERVAL } from "./_hooks/useRealtimeBoard";
import { useChurnData } from "./_hooks/useChurnData";
import { useCurrentEvent } from "./_hooks/useCurrentEvent";
import {
    getEffectiveLine,
    setRealtimeRankingLine,
    useRealtimeRankingLine,
} from "@/lib/realtime-ranking-line";

const DEFAULT_REGION: RealtimeRankingRegion = "cn";
const SHOW_CHURN_STORAGE_KEY = "rr-next:showChurn";

const EMPTY_MASTER_DATA: RealtimeRankingMasterData = {
    cards: [],
    honors: [],
    honorGroups: [],
    bondsHonors: [],
    bondsHonorWords: [],
    gameCharaUnits: [],
};

function RealtimeRankingNextContent() {
    const { t } = useI18n();
    const { themeColor, serverSource } = useTheme();
    const searchParams = useSearchParams();
    const hasManualRegionOverride = useRef(false);

    const [region, setRegion] = useState<RealtimeRankingRegion>(() => {
        const fromUrl = searchParams.get("region");
        if (isRealtimeRankingRegion(fromUrl)) return fromUrl;
        return isRealtimeRankingRegion(serverSource) ? serverSource : DEFAULT_REGION;
    });

    useEffect(() => {
        const fromUrl = searchParams.get("region");
        if (isRealtimeRankingRegion(fromUrl)) {
            setRegion(fromUrl);
            return;
        }
        if (!hasManualRegionOverride.current && isRealtimeRankingRegion(serverSource)) {
            setRegion(serverSource);
        }
    }, [searchParams, serverSource]);

    const handleRegionChange = useCallback((newRegion: RealtimeRankingRegion) => {
        hasManualRegionOverride.current = true;
        setRegion(newRegion);
    }, []);
    const line = useRealtimeRankingLine();
    const [boardMode, setBoardMode] = useState<RealtimeRankingNextBoardMode>("overall");
    const [masterData, setMasterData] = useState<RealtimeRankingMasterData>(EMPTY_MASTER_DATA);
    const [countdown, setCountdown] = useState(Math.floor(POLL_INTERVAL / 1000));
    const [trackedUserId, setTrackedUserId] = useState<string | null>(null);

    const [showChurn, setShowChurn] = useState<boolean>(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            if (localStorage.getItem(SHOW_CHURN_STORAGE_KEY) === "1") {
                setShowChurn(true);
            }
        } catch {
            // ignore
        }
    }, []);

    const handleShowChurnChange = useCallback((val: boolean) => {
        setShowChurn(val);
        if (typeof window !== "undefined") {
            try {
                localStorage.setItem(SHOW_CHURN_STORAGE_KEY, val ? "1" : "0");
            } catch {
                // ignore
            }
        }
    }, []);

    const [parkingModalUserId, setParkingModalUserId] = useState<string | null>(null);

    // Compute effective asset source based on the selected server and route.
    const effectiveLine = getEffectiveLine(line, region);
    const effectiveAssetSource: AssetSourceType = useMemo(
        () => `${effectiveLine === "global" ? "overseas" : "main"}-${region}` as AssetSourceType,
        [effectiveLine, region],
    );

    const board = useRealtimeBoard(region, boardMode, true);
    const worldLinkCharacterId = board.isWorldLinkMode && board.activeGroup ? board.activeGroup.gameCharacterId : null;
    const churnData = useChurnData(region, worldLinkCharacterId, true);
    const currentEvent = useCurrentEvent(
        region,
        board.snapshot
            ? { eventId: board.snapshot.eventId, startAt: board.snapshot.startAt, endAt: board.snapshot.endAt }
            : null,
    );

    const selectedParkingChurnEntry = parkingModalUserId ? churnData.get(parkingModalUserId) : undefined;

    // Master data per region.
    useEffect(() => {
        let cancelled = false;
        setMasterData(EMPTY_MASTER_DATA);
        fetchRealtimeRankingMasterData(region)
            .then((data) => { if (!cancelled) setMasterData(data); })
            .catch(() => { if (!cancelled) setMasterData(EMPTY_MASTER_DATA); });
        return () => { cancelled = true; };
    }, [region]);

    // Sync region to URL.
    useEffect(() => {
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        params.set("region", region);
        replaceCurrentUrlSearchParams(params);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [region]);

    // Countdown ticker.
    useEffect(() => {
        const timer = window.setInterval(() => {
            setCountdown((prev) => (prev <= 1 ? Math.floor(POLL_INTERVAL / 1000) : prev - 1));
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (board.isRefreshing) setCountdown(Math.floor(POLL_INTERVAL / 1000));
    }, [board.isRefreshing]);

    // Auto leave WL mode if it becomes unavailable.
    useEffect(() => {
        if (!board.isLoading && boardMode === "worldlink" && !board.worldLinkAvailable) {
            setBoardMode("overall");
        }
    }, [board.isLoading, board.worldLinkAvailable, boardMode]);

    // Load tracked user from localStorage per region+event.
    const eventId = board.snapshot?.eventId;
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!eventId) { setTrackedUserId(null); return; }
        try {
            setTrackedUserId(localStorage.getItem(`rr-next:tracked:${region}:${eventId}`));
        } catch {
            setTrackedUserId(null);
        }
    }, [region, eventId]);

    const eventIdRef = useRef<number | undefined>(eventId);
    eventIdRef.current = eventId;

    const handleTrackToggle = useCallback((userId: string) => {
        const ev = eventIdRef.current;
        if (!ev) return;
        const key = `rr-next:tracked:${region}:${ev}`;
        setTrackedUserId((prev) => {
            const next = prev === userId ? null : userId;
            try {
                if (next) localStorage.setItem(key, next);
                else localStorage.removeItem(key);
            } catch { /* ignore */ }
            return next;
        });
    }, [region]);

    return (
        <MainLayout>
            <PageContainer>
                <BoardHeader
                    region={region}
                    onRegionChange={handleRegionChange}
                    line={line}
                    onLineChange={setRealtimeRankingLine}
                    updatedAt={board.activeGroup ? board.activeGroup.updatedAt : board.snapshot?.updatedAt}
                    eventId={board.snapshot?.eventId}
                    totalEntries={board.entries.length}
                    countdown={countdown}
                    isRefreshing={board.isRefreshing}
                    syncFailed={!!board.error}
                    onRefresh={board.refresh}
                    showChurn={showChurn}
                    onShowChurnChange={handleShowChurnChange}
                />

                <CurrentEventCard
                    event={currentEvent}
                    assetSource={effectiveAssetSource}
                    themeColor={themeColor}
                />

                {/* World Link toggle */}
                {board.worldLinkAvailable && (
                    <Surface tone="card" radius="lg" className="mb-6 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip selected={boardMode === "overall"} onClick={() => setBoardMode("overall")}>
                                {t("page.realtimeRankingNext.board.overall")}
                            </Chip>
                            <Chip selected={boardMode === "worldlink"} onClick={() => setBoardMode("worldlink")}>
                                {t("page.realtimeRankingNext.board.worldlink")}
                            </Chip>
                        </div>

                        {boardMode === "worldlink" && board.worldLinkSnapshot && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {board.worldLinkSnapshot.groups.map((group) => {
                                    const isActive = group.gameCharacterId === board.activeGroup?.gameCharacterId;
                                    return (
                                        <Chip
                                            key={group.gameCharacterId}
                                            selected={isActive}
                                            onClick={() => board.setSelectedCharacterId(group.gameCharacterId)}
                                        >
                                            {getCharacterName(t, group.gameCharacterId)}
                                        </Chip>
                                    );
                                })}
                            </div>
                        )}
                    </Surface>
                )}

                {board.error && (
                    <ErrorState
                        className="mb-6"
                        title={t("page.realtimeRankingNext.loadFailed")}
                        retryLabel={t("common.action.retry")}
                        onRetry={board.refresh}
                    />
                )}

                {board.isLoading && board.entries.length === 0 ? (
                    <LoadingState label={t("page.realtimeRankingNext.loading")} />
                ) : (
                    <BoardList
                        entries={board.entries}
                        masterData={masterData}
                        assetSource={effectiveAssetSource}
                        churnData={churnData}
                        showChurn={showChurn}
                        onShowParkingPeriods={setParkingModalUserId}
                        region={region}
                        eventId={board.snapshot?.eventId}
                        worldLinkCharacterId={worldLinkCharacterId}
                        trackedUserId={trackedUserId}
                        onTrackToggle={handleTrackToggle}
                        staleRanks={board.staleRanks}
                    />
                )}

                <ParkingPeriodsModal
                    userId={parkingModalUserId}
                    churnEntry={selectedParkingChurnEntry}
                    onClose={() => setParkingModalUserId(null)}
                />
            </PageContainer>
        </MainLayout>
    );
}

export default function RealtimeRankingNextClient() {
    const { t } = useI18n();
    return (
        <Suspense fallback={<LoadingState label={t("page.realtimeRankingNext.loading")} />}>
            <RealtimeRankingNextContent />
        </Suspense>
    );
}
