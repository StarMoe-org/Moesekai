"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "@/components/LocalizedLink";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import PredictionChart from "@/components/events/PredictionChart";
import PGAIChart from "@/components/events/PGAIChart";
import Sparkline from "@/components/events/Sparkline";
import ActivityStats from "@/components/events/ActivityStats";
import EventGoalPlanner from "@/components/events/EventGoalPlanner";
import { useI18n } from "@/contexts/I18nContext";
import { fetchPredictionData, fetchEventList } from "@/lib/prediction-api";
import {
    subscribeRankingSync,
    applyLiveSyncToPrediction,
    extractTierScoresFromEntries,
    LiveRankingSyncPayload,
    publishRankingSync,
} from "@/lib/ranking-sync";
import { PredictionData, EventListItem, ServerType, TierKLine, RankChart, KLinePoint } from "@/types/prediction";
import { IEventInfo, EventType, getEventStatus, EVENT_STATUS_DISPLAY } from "@/types/events";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData, fetchMasterDataForServer } from "@/lib/fetch";
import { getEventBannerUrl, getEventLogoUrl, getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import { getWl3SimulationGroupByEventId } from "@/lib/world-bloom-simulation";
import { fetchLatestV2, fetchWorldLinkLatestV2, fetchWorldLinkTierSeriesV2 } from "@/lib/realtime-ranking-next-api";
import { WorldLinkSnapshotV2, SeriesPoint } from "@/types/realtime-ranking-next";
import { calculateEventPrediction } from "@/lib/prediction-engine";
import { saveWorldLinkSnapshotToStorage, fetchWorldLinkArchive } from "@/lib/world-link-archive";

interface WorldBloomChapter {
    id: number;
    eventId: number;
    gameCharacterId: number;
    chapterNo: number;
    chapterStartAt: number;
    aggregateAt: number;
    chapterEndAt: number;
    isSupplemental?: boolean;
}

interface LegacyTierKline {
    rank: number;
    ChangePct?: number;
    changePct?: number;
    Speed?: number;
    speed?: number;
    CurrentIndex?: number;
    currentIndex?: number;
}

// Available rank tiers
const RANK_TIERS = [50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 5000, 10000];

export default function PredictionNextClient() {
    const { t, formatDate, formatNumber } = useI18n();
    const { assetSource, themeColor, serverSource } = useTheme();
    const [server, setServer] = useState<ServerType>(() => (serverSource === "jp" ? "jp" : "cn"));
    const hasManualServerOverride = useRef(false);
    const [events, setEvents] = useState<EventListItem[]>([]);
    const [masterEvents, setMasterEvents] = useState<IEventInfo[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
    const [predictionData, setPredictionData] = useState<PredictionData | null>(null);
    const [selectedRank, setSelectedRank] = useState<number>(100);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [worldBlooms, setWorldBlooms] = useState<WorldBloomChapter[]>([]);
    const [selectedWlChapter, setSelectedWlChapter] = useState<'overall' | number>('overall');
    const [worldLinkSnapshot, setWorldLinkSnapshot] = useState<WorldLinkSnapshotV2 | null>(null);
    const [chapterTierSeries, setChapterTierSeries] = useState<Record<string, SeriesPoint[]> | null>(null);

    // Live Clock for relative time & progress
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Sync server selection when global data server setting changes
    useEffect(() => {
        if (!hasManualServerOverride.current) {
            const targetServer: ServerType = serverSource === "jp" ? "jp" : "cn";
            if (targetServer !== server) {
                setServer(targetServer);
                setSelectedEventId(null);
                setSelectedWlChapter('overall');
                setEvents([]);
                setPredictionData(null);
                setEventsLoading(true);
            }
        }
    }, [serverSource, server]);

    // Fetch master data for assets matching currently selected server
    useEffect(() => {
        fetchMasterDataForServer<IEventInfo[]>(server, "events.json")
            .then(setMasterEvents)
            .catch(() => {
                fetchMasterData<IEventInfo[]>("events.json").then(setMasterEvents).catch(console.error);
            });
        fetchMasterDataForServer<WorldBloomChapter[]>(server, "worldBlooms.json")
            .then(setWorldBlooms)
            .catch(() => {
                fetchMasterData<WorldBloomChapter[]>("worldBlooms.json").then(setWorldBlooms).catch(console.error);
            });
    }, [server]);

    // Handle server switch safely
    const handleServerChange = (newServer: ServerType) => {
        if (newServer === server) return;
        hasManualServerOverride.current = true;
        setEventsLoading(true);
        setError(null);
        setServer(newServer);
        setSelectedEventId(null); // Clear selection to prevent invalid fetch
        setSelectedWlChapter('overall');
        setEvents([]); // Clear list
        setPredictionData(null); // Clear data
    };

    const handleEventChange = (eventId: number) => {
        setError(null);
        setLoading(true);
        setSelectedEventId(eventId);
        setSelectedWlChapter('overall');
    };

    // Fetch events list when server changes
    useEffect(() => {
        fetchEventList(server)
            .then(data => {
                if (!Array.isArray(data)) {
                    setEvents([]);
                    // If data is invalid, selectedEventId stays null
                    return;
                }
                // Sort: active first, then by ID descending (latest first)
                const sortedEvents = [...data].sort((a, b) => {
                    if (a.is_active && !b.is_active) return -1;
                    if (!a.is_active && b.is_active) return 1;
                    return b.id - a.id;
                });
                setEvents(sortedEvents);

                // If no event selected (e.g. after server switch), select default
                if (!selectedEventId) {
                    const activeEvent = sortedEvents.find(e => e.is_active);
                    const latestEvent = sortedEvents[0];
                    const defaultEventId = activeEvent?.id || latestEvent?.id || null;
                    if (defaultEventId) {
                        setLoading(true);
                        setError(null);
                        setSelectedEventId(defaultEventId);
                    }
                }
            })
            .catch(err => {
                console.error('Failed to fetch events:', err);
                setError(t("page.prediction.errors.eventsFetchFailed"));
                setEvents([]);
            })
            .finally(() => setEventsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server, t]);

    // Fetch prediction data when event changes
    useEffect(() => {
        if (!selectedEventId) {
            return;
        }

        fetchPredictionData(selectedEventId, server)
            .then(data => {
                setPredictionData(data);
            })
            .catch(err => {
                console.error('Failed to fetch prediction:', err);
                setError(t("page.prediction.errors.predictionFetchFailed"));
                setPredictionData(null);
            })
            .finally(() => setLoading(false));
    }, [selectedEventId, server, t]);

    // Live Ranking Sync Subscription: Receive live border cutoffs from realtime ranking or other tabs
    useEffect(() => {
        if (!selectedEventId) return;

        const predEvent = events.find(e => e.id == selectedEventId);
        const masterEvent = masterEvents.find(e => e.id == selectedEventId);
        const s = predEvent?.start_at ? (predEvent.start_at < 10000000000 ? predEvent.start_at * 1000 : predEvent.start_at) : masterEvent?.startAt;
        const e = predEvent?.end_at ? (predEvent.end_at < 10000000000 ? predEvent.end_at * 1000 : predEvent.end_at) : masterEvent?.aggregateAt;

        const unsubscribe = subscribeRankingSync((payload) => {
            if (payload.region !== server) return;
            if (payload.eventId && payload.eventId !== selectedEventId) return;

            setPredictionData((prev) => {
                if (!prev) return prev;
                return applyLiveSyncToPrediction(prev, payload, server, s, e);
            });
        });

        return () => unsubscribe();
    }, [selectedEventId, server, events, masterEvents]);

    // Extract World Link chapters for current event
    const eventWorldBlooms = useMemo(() => {
        if (!selectedEventId) return [];
        const predEvent = events.find(e => e.id == selectedEventId);
        const masterEvent = masterEvents.find(e => e.id == selectedEventId);

        // 1. Check matching entries in masterdata worldBlooms.
        // A finale entry has no gameCharacterId; a finale event has only the overall ranking.
        const matched = worldBlooms
            .filter(wb => wb.eventId === selectedEventId && !wb.isSupplemental && wb.gameCharacterId > 0)
            .sort((a, b) => a.chapterNo - b.chapterNo);
        if (matched.length > 0) return matched;

        // 2. Event 214 (Again And Again Ambition! - WL3 Shuffle) canonical chapter roster
        if (selectedEventId === 214) {
            const s = predEvent?.start_at ? (predEvent.start_at < 10000000000 ? predEvent.start_at * 1000 : predEvent.start_at) : (masterEvent?.startAt || Date.now());
            const duration = 48 * 3600000;
            const roster = [11, 15, 25, 19, 7]; // Ch1: Akito, Ch2: Nene, Ch3: MEIKO, Ch4: Ena, Ch5: Airi
            return roster.map((charId, idx) => ({
                id: selectedEventId * 100 + idx + 1,
                eventId: selectedEventId,
                gameCharacterId: charId,
                chapterNo: idx + 1,
                chapterStartAt: s + idx * duration,
                aggregateAt: s + (idx + 1) * duration,
                chapterEndAt: s + (idx + 1) * duration,
            }));
        }

        // 3. Check live worldLinkSnapshot groups
        if (worldLinkSnapshot && Array.isArray(worldLinkSnapshot.groups) && worldLinkSnapshot.groups.length > 0) {
            const validGroups = worldLinkSnapshot.groups.filter(g => !g.isWorldBloomChapterAggregate && g.gameCharacterId > 0);
            if (validGroups.length > 0) {
                const s = predEvent?.start_at ? (predEvent.start_at < 10000000000 ? predEvent.start_at * 1000 : predEvent.start_at) : (masterEvent?.startAt || Date.now());
                const e = predEvent?.end_at ? (predEvent.end_at < 10000000000 ? predEvent.end_at * 1000 : predEvent.end_at) : (masterEvent?.aggregateAt || (s + 9 * 24 * 3600000));
                const totalHours = Math.max(24, (e - s) / 3600000);
                const chapterHours = Math.min(48, Math.floor(totalHours / validGroups.length));

                const allGroupsHaveSameTimestamps = validGroups.every(g => g.startAt === validGroups[0].startAt && g.endAt === validGroups[0].endAt);

                const liveChapters = validGroups.map((g, idx) => {
                    const chapterStart = allGroupsHaveSameTimestamps ? (s + idx * chapterHours * 3600000) : g.startAt;
                    const chapterEnd = allGroupsHaveSameTimestamps ? Math.min(e, s + (idx + 1) * chapterHours * 3600000) : g.endAt;
                    return {
                        id: selectedEventId * 100 + idx + 1,
                        eventId: selectedEventId,
                        gameCharacterId: g.gameCharacterId,
                        chapterNo: idx + 1,
                        chapterStartAt: chapterStart,
                        aggregateAt: chapterEnd,
                        chapterEndAt: chapterEnd,
                    };
                });
                return liveChapters;
            }
        }

        // 3. Check WL3 simulation group definition
        const wl3Group = getWl3SimulationGroupByEventId(selectedEventId);
        if (wl3Group) {
            const s = predEvent?.start_at ? (predEvent.start_at < 10000000000 ? predEvent.start_at * 1000 : predEvent.start_at) : (masterEvent?.startAt || Date.now());
            const durationPerChapter = 48 * 3600000;
            return wl3Group.members.map((charId, idx) => ({
                id: selectedEventId * 100 + idx + 1,
                eventId: selectedEventId,
                gameCharacterId: charId,
                chapterNo: idx + 1,
                chapterStartAt: s + idx * durationPerChapter,
                aggregateAt: s + (idx + 1) * durationPerChapter,
                chapterEndAt: s + (idx + 1) * durationPerChapter,
            }));
        }

        return [];
    }, [worldBlooms, selectedEventId, events, masterEvents, worldLinkSnapshot]);

    const activeWlChapter = useMemo(() => {
        if (selectedWlChapter === 'overall') return null;
        return eventWorldBlooms.find(wb => wb.gameCharacterId === selectedWlChapter) || null;
    }, [eventWorldBlooms, selectedWlChapter]);

    const isWorldBloomEvent = useMemo(() => {
        if (!selectedEventId) return false;
        const predEvent = events.find(e => e.id == selectedEventId);
        const masterEvent = masterEvents.find(e => e.id == selectedEventId);
        const baseName = masterEvent?.name || predEvent?.name || "";
        return masterEvent?.eventType === "world_bloom" || predEvent?.event_type === "world_bloom"
            || baseName.toLowerCase().includes("world link")
            || baseName.toLowerCase().includes("world bloom")
            || baseName.includes("ワールドリンク")
            || eventWorldBlooms.length > 0;
    }, [selectedEventId, events, masterEvents, eventWorldBlooms]);

    // Fetch World Link snapshot (live or fallback to client/static archive)
    useEffect(() => {
        if (!selectedEventId || !isWorldBloomEvent) {
            setWorldLinkSnapshot(null);
            return;
        }
        let isCancelled = false;

        fetchWorldLinkLatestV2(server)
            .then(async data => {
                if (isCancelled) return;
                const hasActiveData = data && Array.isArray(data.groups) && data.groups.some(g => g.entries?.some(e => e.score > 0));
                if (hasActiveData && (!data.eventId || data.eventId === selectedEventId)) {
                    setWorldLinkSnapshot(data);
                    saveWorldLinkSnapshotToStorage(server, selectedEventId, data);
                } else {
                    // Try archived or cached snapshot
                    const archived = await fetchWorldLinkArchive(server, selectedEventId);
                    if (!isCancelled && archived) {
                        setWorldLinkSnapshot(archived);
                    }
                }
            })
            .catch(async () => {
                if (!isCancelled) {
                    const archived = await fetchWorldLinkArchive(server, selectedEventId);
                    if (!isCancelled && archived) {
                        setWorldLinkSnapshot(archived);
                    }
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [selectedEventId, server, isWorldBloomEvent]);

    // Fetch detailed chapter tier series when a single WL character chapter is selected
    useEffect(() => {
        if (!selectedEventId || !isWorldBloomEvent || typeof selectedWlChapter !== 'number') {
            setChapterTierSeries(null);
            return;
        }
        fetchWorldLinkTierSeriesV2(server, {
            gameCharacterId: selectedWlChapter,
            tiers: RANK_TIERS,
        })
            .then(series => {
                setChapterTierSeries(series);
            })
            .catch(() => {
                setChapterTierSeries(null);
            });
    }, [selectedEventId, server, isWorldBloomEvent, selectedWlChapter]);

    // 10s Live Background Polling: Fetch fresh realtime board cutoffs and update in-memory predictions
    useEffect(() => {
        if (!selectedEventId) return;

        const predEvent = events.find(e => e.id === selectedEventId);
        const masterEvent = masterEvents.find(e => e.id === selectedEventId);
        const s = predEvent?.start_at ? (predEvent.start_at < 10000000000 ? predEvent.start_at * 1000 : predEvent.start_at) : masterEvent?.startAt;
        const e = predEvent?.end_at ? (predEvent.end_at < 10000000000 ? predEvent.end_at * 1000 : predEvent.end_at) : masterEvent?.aggregateAt;

        const POLL_INTERVAL = 10_000;
        let isPolling = false;

        const pollTick = async () => {
            if (isPolling) return;
            isPolling = true;
            try {
                // 1. Fetch fresh standard realtime ranking snapshot
                const freshSnapshot = await fetchLatestV2(server);
                if (freshSnapshot && Array.isArray(freshSnapshot.entries) && freshSnapshot.entries.length > 0) {
                    const tierScores = extractTierScoresFromEntries(freshSnapshot.entries);
                    const syncPayload: LiveRankingSyncPayload = {
                        region: server,
                        eventId: freshSnapshot.eventId || selectedEventId,
                        updatedAt: freshSnapshot.updatedAt || Date.now(),
                        tierScores,
                        source: "prediction-next",
                    };
                    setPredictionData(prev => {
                        if (prev) {
                            return applyLiveSyncToPrediction(
                                prev,
                                syncPayload,
                                server,
                                s,
                                e,
                                isWorldBloomEvent ? "world_bloom" : undefined,
                                isWorldBloomEvent ? 990 : 475,
                            );
                        }
                        return prev;
                    });
                    setError(null);
                    publishRankingSync(syncPayload);
                }

                // 2. Fetch fresh World Link snapshot if World Link event
                if (isWorldBloomEvent) {
                    const freshWl = await fetchWorldLinkLatestV2(server);
                    if (freshWl && Array.isArray(freshWl.groups) && freshWl.groups.length > 0) {
                        setWorldLinkSnapshot(freshWl);
                        saveWorldLinkSnapshotToStorage(server, selectedEventId, freshWl);
                    }
                }
            } catch (_err) {
                // Silent fail during background polling
            } finally {
                isPolling = false;
            }
        };

        // Fire initial tick immediately and schedule every 10s
        pollTick();
        const interval = setInterval(pollTick, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [selectedEventId, server, events, masterEvents, isWorldBloomEvent]);

    // Compute active prediction data based on selected WL chapter vs overall
    const activePredictionData = useMemo<PredictionData | null>(() => {
        if (!predictionData) return null;

        const predEvent = events.find(e => e.id === selectedEventId);
        const masterEvent = masterEvents.find(e => e.id === selectedEventId);
        const eventStart = predEvent?.start_at ? (predEvent.start_at < 10000000000 ? predEvent.start_at * 1000 : predEvent.start_at) : (masterEvent?.startAt || Date.now());
        const eventEnd = predEvent?.end_at ? (predEvent.end_at < 10000000000 ? predEvent.end_at * 1000 : predEvent.end_at) : (masterEvent?.aggregateAt || (eventStart + 9 * 24 * 3600000));

        if (!isWorldBloomEvent || selectedWlChapter === 'overall') {
            if (isWorldBloomEvent && predictionData.data?.charts) {
                const enhancedCharts: RankChart[] = predictionData.data.charts.map(chart => {
                    if (chart.Rank > 10000 || !chart.HistoryPoints || chart.HistoryPoints.length === 0) return chart;
                    const res = calculateEventPrediction({
                        server,
                        rank: chart.Rank,
                        startAt: eventStart,
                        endAt: eventEnd,
                        historyPoints: chart.HistoryPoints,
                        eventType: "world_bloom",
                        bonusPercent: 990,
                    });
                    return {
                        ...chart,
                        PredictedScore: res.predictedScore,
                        PredictedScoreP10: res.predictedScoreP10,
                        PredictedScoreP90: res.predictedScoreP90,
                        PredictPoints: res.predictPoints,
                    };
                });
                const enhancedKlines: TierKLine[] = (predictionData.data.tier_klines || []).map(tk => {
                    const ch = enhancedCharts.find(c => c.Rank === tk.Rank);
                    const engineRes = ch && ch.HistoryPoints?.length > 0 ? calculateEventPrediction({
                        server,
                        rank: tk.Rank,
                        startAt: eventStart,
                        endAt: eventEnd,
                        historyPoints: ch.HistoryPoints,
                        eventType: "world_bloom",
                        bonusPercent: 990,
                    }) : undefined;
                    return {
                        ...tk,
                        Speed: engineRes?.effectiveHourlySpeed ?? tk.Speed,
                    };
                });
                return {
                    ...predictionData,
                    data: {
                        ...predictionData.data,
                        charts: enhancedCharts,
                        tier_klines: enhancedKlines,
                    },
                };
            }
            return predictionData;
        }

        const group = worldLinkSnapshot?.groups?.find(g => g.gameCharacterId === selectedWlChapter);
        const chapter = activeWlChapter || eventWorldBlooms.find(wb => wb.gameCharacterId === selectedWlChapter);
        const chapterIndex = eventWorldBlooms.findIndex(wb => wb.gameCharacterId === selectedWlChapter);
        const fallbackDuration = 48 * 3600000;
        const s = chapter?.chapterStartAt || (eventStart + Math.max(0, chapterIndex) * fallbackDuration);
        const e = chapter?.aggregateAt || (s + fallbackDuration);
        const isChapterUnstarted = now < s;

        const calculatedResults: Record<number, ReturnType<typeof calculateEventPrediction>> = {};

        const chapterCharts: RankChart[] = RANK_TIERS.map(rank => {
            const entry = group?.entries?.find(item => item.rank === rank);
            const currentScore = isChapterUnstarted ? 0 : (entry?.score || 0);

            let historyPoints: { t: string; y: number }[] = [];

            if (!isChapterUnstarted) {
                // 1. Prefer true World Link chapter tier series from real-time API
                const seriesForRank = chapterTierSeries ? (chapterTierSeries[String(rank)] || (chapterTierSeries as Record<string, SeriesPoint[]>)[String(rank)]) : undefined;
                if (Array.isArray(seriesForRank) && seriesForRank.length > 0) {
                    historyPoints = seriesForRank.map(pt => ({
                        t: new Date(pt.t).toISOString(),
                        y: pt.s,
                    }));
                }

                // Ensure history starts cleanly from chapter start (t = s, y = 0)
                const startIso = new Date(s).toISOString();
                if (historyPoints.length === 0 || new Date(historyPoints[0].t).getTime() > s + 3600000) {
                    historyPoints.unshift({ t: startIso, y: 0 });
                }

                // 2. Ensure current score point is synced to the data snapshot timestamp (avoid client clock drift)
                const dataTime = Math.min(e, Math.max(s, worldLinkSnapshot?.updatedAt || predictionData.timestamp || s));
                const dataIso = new Date(dataTime).toISOString();
                if (historyPoints.length === 1) {
                    historyPoints.push({ t: dataIso, y: currentScore });
                } else {
                    const lastPt = historyPoints[historyPoints.length - 1];
                    if (dataTime > new Date(lastPt.t).getTime() + 60_000) {
                        historyPoints.push({ t: dataIso, y: currentScore });
                    } else {
                        historyPoints[historyPoints.length - 1] = { t: dataIso, y: currentScore };
                    }
                }

                // 3. Interpolate realistic historical S-curve if upstream series API is unavailable
                if (historyPoints.length <= 2 && currentScore > 0 && dataTime > s) {
                    const steps = 16;
                    const totalDur = Math.max(1, e - s);
                    const currProg = Math.max(0.01, (dataTime - s) / totalDur);
                    const normCurve = (p: number) => 1.30 * p - 0.30 * p * p;
                    const denom = Math.max(0.01, normCurve(currProg));
                    const smoothHistory: { t: string; y: number }[] = [];
                    for (let i = 0; i <= steps; i++) {
                        const frac = i / steps;
                        const tPoint = s + frac * (dataTime - s);
                        const pPoint = (tPoint - s) / totalDur;
                        const yPoint = Math.round(currentScore * Math.min(1.0, normCurve(pPoint) / denom));
                        smoothHistory.push({ t: new Date(tPoint).toISOString(), y: yPoint });
                    }
                    historyPoints = smoothHistory;
                }
            } else {
                // Chapter is unstarted: single anchor at chapter start
                historyPoints = [{ t: new Date(s).toISOString(), y: 0 }];
            }

            const engineResult = calculateEventPrediction({
                server,
                rank,
                startAt: s,
                endAt: e,
                historyPoints,
                characterId: typeof selectedWlChapter === 'number' ? selectedWlChapter : undefined,
                bonusPercent: isWorldBloomEvent ? 990 : 475,
            });

            calculatedResults[rank] = engineResult;

            return {
                Rank: rank,
                CurrentScore: currentScore,
                PredictedScore: engineResult.predictedScore,
                PredictedScoreP10: engineResult.predictedScoreP10,
                PredictedScoreP90: engineResult.predictedScoreP90,
                HistoryPoints: historyPoints,
                PredictPoints: engineResult.predictPoints,
            };
        });

        const dataTimeForChapter = Math.min(e, Math.max(s, worldLinkSnapshot?.updatedAt || predictionData.timestamp || s));
        const isChapterEnded = dataTimeForChapter >= e || now >= e;
        const elapsedHours = Math.max(0.1, (dataTimeForChapter - s) / 3600000);

        const tier_klines: TierKLine[] = RANK_TIERS.map(rank => {
            const entry = group?.entries?.find(item => item.rank === rank);
            const score = isChapterUnstarted ? 0 : (entry?.score || 0);
            const engineRes = calculatedResults[rank];
            const chart = chapterCharts.find(c => c.Rank === rank);

            const speed = (isChapterEnded || isChapterUnstarted)
                ? 0
                : (engineRes?.effectiveHourlySpeed || (elapsedHours > 0 ? Math.round(score / elapsedHours) : 0));

            const sparklineData: KLinePoint[] = (chart?.HistoryPoints || []).map(pt => ({
                t: pt.t,
                o: pt.y,
                c: pt.y,
                l: pt.y,
                h: pt.y,
                v: 0,
            }));

            return {
                Rank: rank,
                Data: sparklineData,
                CurrentIndex: score,
                Speed: speed,
                ChangePct: 0,
            };
        });

        return {
            ...predictionData,
            data: {
                ...predictionData.data,
                charts: chapterCharts,
                tier_klines,
            },
        };
    }, [predictionData, isWorldBloomEvent, selectedWlChapter, worldLinkSnapshot, activeWlChapter, eventWorldBlooms, now, server, chapterTierSeries, events, masterEvents, selectedEventId]);

    // Process chart data (trim 1% from start/end) - Replacing original currentChart definition
    const currentChart = useMemo(() => {
        const raw = activePredictionData?.data?.charts?.find(c => c.Rank === selectedRank);
        if (!raw) return undefined;

        const trimData = (points: { t: string, y: number }[]) => {
            if (!points || points.length < 10) return points;
            const trimCount = Math.floor(points.length * 0.01);
            if (trimCount === 0) return points;
            return points.slice(trimCount, points.length - trimCount);
        };

        return {
            ...raw,
            HistoryPoints: trimData(raw.HistoryPoints),
            PredictPoints: raw.PredictPoints
        };
    }, [activePredictionData, selectedRank]);

    // Get available ranks from data
    const availableRanks = activePredictionData?.data?.charts?.map(c => c.Rank) || [];

    // Prepare Event Banner & Status
    const eventState = useMemo(() => {
        if (!selectedEventId) return null;

        const predEvent = events.find(e => e.id == selectedEventId);
        const masterEvent = masterEvents.find(e => e.id == selectedEventId);

        if (!predEvent && !masterEvent) return null;

        const baseName = masterEvent?.name || predEvent?.name || "";
        const isWlEvent = masterEvent?.eventType === "world_bloom" || predEvent?.event_type === "world_bloom"
            || baseName.toLowerCase().includes("world link")
            || baseName.toLowerCase().includes("world bloom")
            || baseName.includes("ワールドリンク");
        const chapterNameSuffix = activeWlChapter
            ? ` · ${t("page.prediction.wl.chapterItem", { no: activeWlChapter.chapterNo, name: getCharacterName(t, activeWlChapter.gameCharacterId) })}`
            : "";
        const name = baseName + chapterNameSuffix;
        const rawType = masterEvent?.eventType || predEvent?.event_type;
        const eventType: EventType = isWlEvent
            ? "world_bloom"
            : rawType === "cheerful_carnival"
                ? "cheerful_carnival"
                : "marathon";
        const assetbundleName = masterEvent?.assetbundleName || "";

        // Timestamps: Prefer active WL chapter timeframe if selected, else prediction schedule / masterdata
        const s = activeWlChapter
            ? activeWlChapter.chapterStartAt
            : (predEvent?.start_at ? (predEvent.start_at < 10000000000 ? predEvent.start_at * 1000 : predEvent.start_at) : masterEvent?.startAt);
        const e = activeWlChapter
            ? activeWlChapter.aggregateAt
            : (predEvent?.end_at ? (predEvent.end_at < 10000000000 ? predEvent.end_at * 1000 : predEvent.end_at) : masterEvent?.aggregateAt);

        const startAt = s || 0;
        const endAt = e || 0;

        const mockEvent: IEventInfo = {
            id: selectedEventId,
            bgmAssetbundleName: "",
            eventOnlyComponentDisplayStartAt: startAt,
            name,
            eventType,
            assetbundleName,
            startAt,
            aggregateAt: endAt,
            rankingAnnounceAt: endAt,
            distributionStartAt: endAt,
            eventOnlyComponentDisplayEndAt: endAt,
            closedAt: endAt,
            distributionEndAt: endAt,
            virtualLiveId: 0,
            unit: "",
            isCountLeaderCharacterPlay: false,
        };

        const status = getEventStatus(mockEvent);
        const statusDisplay = EVENT_STATUS_DISPLAY[status];
        const eventTypeLabel = t(`common.eventTypes.${eventType}`);
        const eventTypeName = eventTypeLabel === `common.eventTypes.${eventType}` ? eventType : eventTypeLabel;

        const totalDuration = endAt - startAt;
        const elapsed = Math.max(0, now - startAt);
        let progressPercent = 0;

        if (status === 'ongoing') {
            progressPercent = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100) : 0;
        } else if (status === 'ended') {
            progressPercent = 100;
        }


        const formatEventDate = (ts: number) => formatDate(ts, {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        const isActive = predEvent?.is_active || (status === 'ongoing');

        // Relative Update Time
        let updateTime = null;
        if (predictionData?.timestamp) {
            const diff = now - predictionData.timestamp;
            const diffSec = Math.max(0, Math.floor(diff / 1000));
            if (diffSec < 60) updateTime = t("page.prediction.relativeTime.secondsAgo", { seconds: diffSec });
            else if (diffSec < 3600) updateTime = t("page.prediction.relativeTime.minutesAgo", { minutes: Math.floor(diffSec / 60) });
            else updateTime = formatDate(predictionData.timestamp, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
        }

        return {
            banner: {
                mockEvent,
                status,
                statusDisplay,
                eventTypeName,
                progressPercent,
                formatEventDate,
                updateTime,
                hasBanner: !!assetbundleName
            },
            isActive
        };
    }, [selectedEventId, events, masterEvents, predictionData, now, t, formatDate, activeWlChapter]);

    return (
        <MainLayout>
            <div className="container mx-auto px-4 sm:px-6 py-8">
                {/* Page Header - matching events page style */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 px-4 py-2 border border-miku/30 bg-miku/5 rounded-full mb-4">
                        <span className="text-miku text-xs font-bold tracking-widest uppercase">{t("page.prediction.badge")}</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-primary-text">
                        {t("page.prediction.title")} <span className="text-miku">{t("page.prediction.titleHighlight")} Next</span>
                    </h1>
                </div>

                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-4 mb-8 items-center sm:items-stretch">
                    {/* Server Toggle */}
                    <div className="flex bg-white rounded-xl border border-slate-200 p-1">
                        <button
                            onClick={() => handleServerChange('cn')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${server === 'cn'
                                ? 'bg-miku text-white shadow-md'
                                : 'text-slate-600 hover:bg-slate-50'
                                }`}
                        >
                            {t("page.prediction.servers.cn")}
                        </button>
                        <button
                            onClick={() => handleServerChange('jp')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${server === 'jp'
                                ? 'bg-miku text-white shadow-md'
                                : 'text-slate-600 hover:bg-slate-50'
                                }`}
                        >
                            {t("page.prediction.servers.jp")}
                        </button>
                    </div>

                    {/* Event Selector */}
                    <div className="flex-1">
                        <select
                            value={selectedEventId || ''}
                            onChange={(e) => handleEventChange(Number(e.target.value))}
                            disabled={eventsLoading || events.length === 0}
                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-miku/20 focus:border-miku disabled:opacity-50"
                        >
                            {eventsLoading ? (
                                <option>{t("page.prediction.events.loading")}</option>
                            ) : events.length === 0 ? (
                                <option>{t("page.prediction.events.empty")}</option>
                            ) : (
                                events.map(event => (
                                    <option key={event.id} value={event.id}>
                                        {event.is_active ? '🟢 ' : ''}#{event.id} {event.name}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>
                    {/* Warning for >99% progress */}
                    {eventState && eventState.isActive && eventState.banner.progressPercent >= 99 && (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full border shadow-sm w-full sm:w-auto justify-center sm:justify-start shrink-0"
                            style={{
                                borderColor: `${themeColor}40`,
                                backgroundColor: `${themeColor}10`,
                            }}>
                            <div
                                className="w-6 h-6 shrink-0"
                                style={{
                                    backgroundColor: themeColor,
                                    maskImage: `url(/miku.webp)`,
                                    maskSize: 'contain',
                                    maskRepeat: 'no-repeat',
                                    maskPosition: 'center',
                                    WebkitMaskImage: `url(/miku.webp)`,
                                    WebkitMaskSize: 'contain',
                                    WebkitMaskRepeat: 'no-repeat',
                                    WebkitMaskPosition: 'center',
                                }}
                            />
                            <span className="text-sm font-medium whitespace-nowrap" style={{ color: themeColor }}>
                                {t("page.prediction.stopPredictionNotice")}
                            </span>
                        </div>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                        {error}
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-miku/30 border-t-miku rounded-full animate-spin" />
                            <span className="text-slate-500">{t("page.prediction.loading")}</span>
                        </div>
                    </div>
                )}

                {/* Main Content */}
                {!loading && activePredictionData && (
                    <div className="space-y-6">
                        {/* World Link Chapter Selector - Sticky docked beneath MainNavbar */}
                        {isWorldBloomEvent && eventWorldBlooms.length > 0 && (
                            <div className="sticky top-[58px] z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-700/90 p-3 shadow-md mb-6 transition-all">
                                <div className="flex items-center justify-between mb-2.5 px-1">
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                                        <span>🌸</span>
                                        <span>{t("page.prediction.wl.chapters")}</span>
                                    </span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                        {selectedWlChapter === 'overall'
                                            ? t("page.prediction.wl.overall")
                                            : activeWlChapter
                                                ? t("page.prediction.wl.chapterItem", { no: activeWlChapter.chapterNo, name: getCharacterName(t, activeWlChapter.gameCharacterId) })
                                                : ''}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                                    {/* Overall Button */}
                                    <button
                                        type="button"
                                        onClick={() => setSelectedWlChapter('overall')}
                                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                                            selectedWlChapter === 'overall'
                                                ? 'bg-miku text-white border-miku shadow-sm shadow-miku/30'
                                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <span>🌟</span>
                                        <span>{t("page.prediction.wl.overall")}</span>
                                    </button>

                                    {/* Character Chapter Buttons */}
                                    {eventWorldBlooms.map((wb) => {
                                        const isSelected = selectedWlChapter === wb.gameCharacterId;
                                        const isOngoing = now >= wb.chapterStartAt && now <= wb.aggregateAt;
                                        const isEnded = now > wb.aggregateAt;
                                        const statusKey = isOngoing ? 'ongoing' : isEnded ? 'ended' : 'upcoming';

                                        return (
                                            <button
                                                key={wb.gameCharacterId}
                                                type="button"
                                                onClick={() => setSelectedWlChapter(wb.gameCharacterId)}
                                                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                                                    isSelected
                                                        ? 'bg-miku text-white border-miku shadow-sm shadow-miku/30'
                                                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                }`}
                                            >
                                                <div className="relative w-4 h-4 rounded-full overflow-hidden shrink-0 border border-white/40">
                                                    <Image
                                                        src={getCharacterIconUrl(wb.gameCharacterId)}
                                                        alt={getCharacterName(t, wb.gameCharacterId)}
                                                        fill
                                                        className="object-cover"
                                                        unoptimized
                                                    />
                                                </div>
                                                <span>
                                                    {t("page.prediction.wl.chapterItem", {
                                                        no: wb.chapterNo,
                                                        name: getCharacterName(t, wb.gameCharacterId)
                                                    })}
                                                </span>
                                                <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                                    isSelected
                                                        ? 'bg-white/20 text-white'
                                                        : isOngoing
                                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                            : isEnded
                                                                ? 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                                }`}>
                                                    {t(`page.prediction.wl.chapterStatus.${statusKey}`)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {/* Event Banner */}
                        {eventState && (() => {
                            const { banner, isActive } = eventState;
                            const isUpcoming = banner.status === "upcoming";
                            const isEnded = banner.status === "ended";
                            const showPredictionColumns = isActive || isUpcoming;
                            const isChapterView = isWorldBloomEvent && selectedWlChapter !== 'overall';
                            const currentChapterGroup = isChapterView ? worldLinkSnapshot?.groups?.find(g => g.gameCharacterId === selectedWlChapter) : undefined;
                            const hasChapterScores = isChapterView ? (!!currentChapterGroup && Array.isArray(currentChapterGroup.entries) && currentChapterGroup.entries.some(e => e.score > 0)) : true;
                            const isChapterUnarchived = isEnded && isChapterView && !hasChapterScores;
                            const statusLabel = t(`common.status.${banner.status}`);
                            const fallbackStatusLabel = t(banner.statusDisplay.labelKey);
                            const resolvedStatusLabel = statusLabel === `common.status.${banner.status}` ? fallbackStatusLabel : statusLabel;
                            return (
                                <>
                                    <Link href={`/events/${banner.mockEvent.id}`} className="block group mb-6">
                                        <div className="relative flex min-h-[136px] h-auto md:h-36 rounded-2xl overflow-hidden glass-card border border-white/40 bg-white shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99] hover:shadow-md cursor-pointer">
                                            {/* Link wrapper could be added here if needed */}

                                            {/* Left Side: Background & Logo */}
                                            <div className="w-[45%] relative overflow-hidden">
                                                {banner.hasBanner ? (
                                                    <>
                                                        <div className="absolute inset-0">
                                                            <Image
                                                                src={getEventBannerUrl(banner.mockEvent.assetbundleName, assetSource)}
                                                                alt={banner.mockEvent.name}
                                                                fill
                                                                className="object-cover"
                                                                unoptimized
                                                            />
                                                            <div className="absolute inset-0 bg-black/50" />
                                                        </div>
                                                        <div className="absolute inset-0 flex items-center justify-center p-2">
                                                            <div className="relative w-full h-full max-h-20 sm:max-h-24">
                                                                <Image
                                                                    src={getEventLogoUrl(banner.mockEvent.assetbundleName, assetSource)}
                                                                    alt=""
                                                                    fill
                                                                    className="object-contain drop-shadow-2xl"
                                                                    unoptimized
                                                                />
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="absolute inset-0 bg-gradient-to-br from-miku to-blue-400 flex items-center justify-center text-white/20 font-bold text-4xl">
                                                        NO IMAGE
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Side: Info */}
                                            <div className="w-[55%] relative flex flex-col justify-center p-3 sm:p-4 z-10 overflow-hidden">
                                                {/* Progress Overlay */}
                                                {banner.status === "ongoing" && (
                                                    <div
                                                        className="absolute inset-y-0 left-0 transition-all duration-500 ease-out z-0 pointer-events-none"
                                                        style={{
                                                            width: `${banner.progressPercent}%`,
                                                            backgroundColor: themeColor,
                                                            opacity: 0.12
                                                        }}
                                                    />
                                                )}

                                                <div className="space-y-1 relative z-20 pr-12 sm:pr-16">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span
                                                            className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded text-white shadow-sm"
                                                            style={{ backgroundColor: banner.statusDisplay.color }}
                                                        >
                                                            {resolvedStatusLabel}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-400">
                                                            {banner.eventTypeName}
                                                        </span>
                                                    </div>
                                                    <h3 className="font-bold text-primary-text text-sm sm:text-base leading-tight line-clamp-1" title={banner.mockEvent.name}>
                                                        {banner.mockEvent.name}
                                                    </h3>
                                                    <div className="pt-1.5 text-[10px] sm:text-xs text-slate-400 font-mono flex flex-col sm:flex-row sm:gap-2">
                                                        <span>{banner.formatEventDate(banner.mockEvent.startAt)}</span>
                                                        <span className="hidden sm:inline">-</span>
                                                        <span>{banner.formatEventDate(banner.mockEvent.aggregateAt)}</span>
                                                    </div>
                                                    {banner.updateTime && (
                                                        <div className="text-[10px] sm:text-xs text-slate-500/80 font-mono mt-0.5">
                                                            {t("page.prediction.dataUpdate", { time: banner.updateTime })}
                                                        </div>
                                                    )}
                                                </div>

                                                {banner.status === "ongoing" && (
                                                    <div className="absolute bottom-1 right-2 text-2xl sm:text-3xl md:text-4xl font-black text-slate-800/25 dark:text-slate-100/25 select-none z-10 tracking-tighter leading-none pointer-events-none">
                                                        {Math.floor(banner.progressPercent)}<span className="text-sm sm:text-base md:text-lg ml-0.5">%</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Link>

                                    {/* Row 1: PGAI + Activity Stats (Only if Active) */}
                                    {isActive && (
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[320px] mb-6">
                                            <div className="lg:col-span-2 min-h-[300px] lg:min-h-[320px] h-full">
                                                {activePredictionData.data.global_kline && (
                                                    <PGAIChart
                                                        globalKline={activePredictionData.data.global_kline}
                                                        height={undefined} // Let flex/grid handle height
                                                    />
                                                )}
                                            </div>
                                            <div className="min-h-[300px] lg:min-h-[320px] h-full">
                                                {activePredictionData.data.tier_klines && (
                                                    <ActivityStats tiers={activePredictionData.data.tier_klines} />
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Upcoming Chapter / Event Notice Banner */}
                                    {isUpcoming && (
                                        <div className="flex items-center gap-2.5 p-4 mb-6 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/40 text-blue-700 dark:text-blue-300 text-xs sm:text-sm">
                                            <svg className="w-4 h-4 shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span>{t("page.prediction.wl.upcomingNotice", { time: banner.formatEventDate(banner.mockEvent.startAt) })}</span>
                                        </div>
                                    )}

                                    {/* Unarchived Ended Chapter Notice Banner */}
                                    {isChapterUnarchived && (
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 mb-6 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/40 text-amber-800 dark:text-amber-200 text-xs sm:text-sm">
                                            <div className="flex items-start sm:items-center gap-2.5">
                                                <svg className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5 sm:mt-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                                <span>{t("page.prediction.wl.unarchivedChapterNotice")}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedWlChapter('overall')}
                                                className="self-start sm:self-auto shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs transition-colors shadow-sm cursor-pointer"
                                            >
                                                {t("page.prediction.wl.switchToOverall")}
                                            </button>
                                        </div>
                                    )}

                                    {/* Row 2: Prediction List / Table */}
                                    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden mb-6">
                                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                            <h3 className="font-bold text-slate-700">
                                                {isUpcoming
                                                    ? t("page.prediction.table.upcomingTitle")
                                                    : (isActive ? t("page.prediction.table.activeTitle") : t("page.prediction.table.finalTitle"))}
                                            </h3>
                                            {showPredictionColumns && <span className="text-xs text-slate-400">{t("page.prediction.table.detailHint")}</span>}
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-slate-500 font-medium w-24">{t("page.prediction.table.tier")}</th>
                                                        <th className="px-4 py-3 text-right text-slate-500 font-medium">
                                                            {isEnded ? t("page.prediction.table.finalScore") : t("page.prediction.table.currentScore")}
                                                        </th>
                                                        {showPredictionColumns && <th className="px-4 py-3 text-right text-slate-500 font-medium">{t("page.prediction.table.predictedScore")}</th>}
                                                        {showPredictionColumns && <th className="px-4 py-3 text-right text-slate-500 font-medium">{t("page.prediction.table.gap")}</th>}
                                                        {showPredictionColumns && <th className="px-4 py-3 text-right text-slate-500 font-medium">{t("page.prediction.table.speed")}</th>}
                                                        {showPredictionColumns && <th className="px-4 py-3 text-center text-slate-500 font-medium w-32">{t("page.prediction.table.trend")}</th>}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {activePredictionData.data.charts?.map(chart => {
                                                        // Handle case-sensitivity or missing data
                                                        const rank = chart.Rank;
                                                        // Try strict and loose matching
                                                        const legacyTierKlines = (activePredictionData.data as PredictionData["data"] & {
                                                            tierKlines?: LegacyTierKline[];
                                                        }).tierKlines;
                                                        const legacyTier = legacyTierKlines?.find((t) => t.rank == rank);
                                                        const tierStats: TierKLine | undefined = activePredictionData.data.tier_klines?.find((t) => t.Rank == rank)
                                                            || (legacyTier
                                                                ? {
                                                                    Rank: legacyTier.rank,
                                                                    Data: [],
                                                                    CurrentIndex: legacyTier.CurrentIndex ?? legacyTier.currentIndex ?? 0,
                                                                    Speed: legacyTier.Speed ?? legacyTier.speed ?? 0,
                                                                    ChangePct: legacyTier.ChangePct ?? legacyTier.changePct ?? 0,
                                                                }
                                                                : undefined);

                                                        const historyData = chart.HistoryPoints.map(p => p.y);
                                                        const predictData = (chart.PredictPoints || []).map(p => p.y);

                                                        // Determine colors
                                                        const trendColor = tierStats && tierStats.ChangePct < 0 ? '#10b981' : '#ef4444';

                                                        return (
                                                            <tr
                                                                key={chart.Rank}
                                                                className={`border-t border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors ${showPredictionColumns && chart.Rank === selectedRank ? 'bg-miku/5' : ''
                                                                    }`}
                                                                onClick={() => showPredictionColumns && setSelectedRank(chart.Rank)}
                                                            >
                                                                <td className="px-4 py-3 font-bold text-miku">T{chart.Rank}</td>
                                                                <td className="px-4 py-3 text-right text-slate-700 font-mono font-bold">
                                                                    {isChapterUnarchived ? (
                                                                        <span className="text-slate-400 font-normal select-none">-</span>
                                                                    ) : (
                                                                        formatNumber(chart.CurrentScore)
                                                                    )}
                                                                </td>
                                                                {showPredictionColumns && (
                                                                    <>
                                                                        <td className="px-4 py-3 text-right text-amber-600 font-mono font-bold">
                                                                            {chart.Rank > 10000 ? '-' : formatNumber(chart.PredictedScore)}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right text-slate-500 font-mono">
                                                                            {chart.Rank > 10000 ? '-' : (isUpcoming ? `+${formatNumber(chart.PredictedScore)}` : `+${formatNumber(chart.PredictedScore - chart.CurrentScore)}`)}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right font-mono">
                                                                            {tierStats ? (
                                                                                isUpcoming ? (
                                                                                    <span className="text-slate-400">0 /h</span>
                                                                                ) : (
                                                                                    <div className="flex flex-col items-end">
                                                                                        <span className="text-slate-700">{tierStats.Speed != null ? formatNumber(tierStats.Speed) : '-'} /h</span>
                                                                                        <span className={`text-[10px] ${tierStats.ChangePct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                                                            {tierStats.ChangePct >= 0 ? '+' : ''}{tierStats.ChangePct?.toFixed(1) ?? '0'}%
                                                                                        </span>
                                                                                    </div>
                                                                                )
                                                                            ) : '-'}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            <div className="flex justify-center items-center">
                                                                                <Sparkline
                                                                                    data={historyData}
                                                                                    prediction={(predictData.length > 0 && chart.Rank <= 10000) ? predictData : undefined}
                                                                                    progress={isUpcoming ? 0.05 : Math.max(0.05, Math.min(0.95, (banner.progressPercent || 50) / 100))}
                                                                                    color={trendColor}
                                                                                    width={100}
                                                                                    height={30}
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                    </>
                                                                )}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Row 3: Goal Strategy Planner (When Event is Active or Upcoming) */}
                                    {showPredictionColumns && (
                                        <EventGoalPlanner
                                            server={server}
                                            charts={activePredictionData.data.charts || []}
                                            startAt={activeWlChapter ? activeWlChapter.chapterStartAt : banner.mockEvent.startAt}
                                            endAt={activeWlChapter ? activeWlChapter.aggregateAt : banner.mockEvent.aggregateAt}
                                            isActive={isActive}
                                            isWorldBloom={isWorldBloomEvent}
                                        />
                                    )}

                                    {/* Row 4: Large Detailed Chart (When Event is Active or Upcoming) */}
                                    {showPredictionColumns && (
                                        <div id="detailed-chart" className="scroll-mt-24 mb-6">
                                            <div className="bg-white rounded-xl border border-slate-200 p-6">
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                                                    <h3 className="text-lg font-bold text-slate-800 shrink-0">
                                                        {t("page.prediction.chart.detailTitle", { rank: selectedRank })}
                                                    </h3>
                                                    {/* Rank Selector for Chart */}
                                                    <div className="flex gap-2 overflow-x-auto pb-2 w-full sm:w-auto sm:flex-wrap sm:justify-end no-scrollbar">
                                                        {(availableRanks.length > 0 ? availableRanks : RANK_TIERS).map(rank => (
                                                            <button
                                                                key={rank}
                                                                onClick={() => setSelectedRank(rank)}
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 snap-start ${selectedRank === rank
                                                                    ? 'bg-miku text-white shadow-lg shadow-miku/20'
                                                                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                                                    }`}
                                                            >
                                                                T{rank}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {currentChart ? (
                                                    <PredictionChart data={currentChart} className="h-[350px] sm:h-[450px]" />
                                                ) : (
                                                    <div className="h-[350px] sm:h-[450px] flex items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl">
                                                        {t("page.prediction.chart.noTierData", { rank: selectedRank })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Footer Sources */}
                                    <div className="text-center text-xs text-slate-400 pb-8 space-y-1">
                                        <p>{t("page.prediction.sources.tier")}</p>
                                        <p>{t("page.prediction.sources.prediction")}</p>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )
                }

                {/* Empty State */}
                {
                    !loading && !predictionData && !error && selectedEventId && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            <p>{t("page.prediction.empty")}</p>
                        </div>
                    )
                }
            </div>
        </MainLayout>
    );
}
