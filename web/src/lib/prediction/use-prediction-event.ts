"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchPredictionData, fetchEventList, fetchGlobalKline } from "@/lib/prediction-api";
import {
    applyLiveSyncToPrediction,
    loadPredictionContextSource,
    predictionContextFor,
    type PredictionContextSource,
} from "@/lib/prediction/live-prediction";
import {
    subscribeRankingSync,
    extractTierScoresFromEntries,
    publishRankingSync,
    type LiveRankingSyncPayload,
} from "@/lib/ranking-sync";
import { fetchMasterData, fetchMasterDataForServer } from "@/lib/fetch";
import { getWl3SimulationGroupByEventId } from "@/lib/world-bloom-simulation";
import { fetchLatestV2, fetchWorldLinkLatestV2, fetchWorldLinkTierSeriesV2 } from "@/lib/realtime-ranking-next-api";
import { calculateEventPrediction } from "@/lib/prediction-engine";
import { saveWorldLinkSnapshotToStorage, fetchWorldLinkArchive } from "@/lib/world-link-archive";
import type { EventListItem, KLinePoint, PredictionData, RankChart, ServerType, TierKLine } from "@/types/prediction";
import type { IEventInfo } from "@/types/events";
import type { SeriesPoint, WorldLinkSnapshotV2 } from "@/types/realtime-ranking-next";
import type { PredictionEventState, UsePredictionEventOptions, WorldBloomChapterRow } from "./types";

/** Rank tiers used when a scope's reward tiers are unknown (no rules for the event or chapter). */
export const PREDICTION_RANK_TIERS = [50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 5000, 10000];

// Katakana "World Link" as it appears in JP event names (escaped: web/src forbids kana literals).
const JP_WORLD_LINK_NAME = "\u30ef\u30fc\u30eb\u30c9\u30ea\u30f3\u30af";

export interface UsePredictionEventResult extends PredictionEventState {
    /** Latest World Link snapshot (live, or archived after the event); null for non-WL events. */
    worldLinkSnapshot: WorldLinkSnapshotV2 | null;
}

/** Event-list timestamps may be seconds or milliseconds; 0/absent means "not provided". */
function eventListTimeMs(value: number | undefined): number | undefined {
    if (!value) return undefined;
    return value < 10000000000 ? value * 1000 : value;
}

/** World Link detection by event type or name, without the masterdata chapter check. */
export function looksLikeWorldLinkEvent(
    masterEvent: IEventInfo | null | undefined,
    eventMeta: EventListItem | null | undefined,
): boolean {
    const baseName = masterEvent?.name || eventMeta?.name || "";
    return masterEvent?.eventType === "world_bloom" || eventMeta?.event_type === "world_bloom"
        || baseName.toLowerCase().includes("world link")
        || baseName.toLowerCase().includes("world bloom")
        || baseName.includes(JP_WORLD_LINK_NAME);
}

interface LoadedWorldLinkSnapshot {
    region: ServerType;
    eventId: number;
    snapshot: WorldLinkSnapshotV2;
}

interface LoadedChapterTierSeries {
    key: string;
    series: Record<string, SeriesPoint[]>;
}

function chapterSeriesKey(server: ServerType, eventId: number, gameCharacterId: number): string {
    return `${server}:${eventId}:${gameCharacterId}`;
}

/**
 * Rows of a chapter view: the reward tiers the snapshot group or the chapter tier-series covers. Before the
 * chapter has any data (not started, not archived) nothing narrows them, so every reward tier gets a row.
 */
export function chapterRowRanks(
    rewardTiers: readonly number[],
    groupRanks: readonly number[],
    series: Record<string, SeriesPoint[]> | null,
): number[] {
    const covered = new Set(groupRanks);
    for (const [rank, points] of Object.entries(series ?? {})) {
        if (Array.isArray(points) && points.length > 0) covered.add(Number(rank));
    }
    const coveredTiers = rewardTiers.filter((rank) => covered.has(rank));
    return coveredTiers.length > 0 ? coveredTiers : [...rewardTiers];
}

/**
 * The live endpoint serves the region's running event and local storage may hold one saved under another id,
 * so a snapshot that names a different event is not this event's.
 */
function snapshotBelongsTo(snapshot: WorldLinkSnapshotV2, eventId: number): boolean {
    return !snapshot.eventId || snapshot.eventId === eventId;
}

export function findActiveWlChapter(
    chapters: readonly WorldBloomChapterRow[],
    selected: "overall" | number,
): WorldBloomChapterRow | null {
    if (selected === "overall") return null;
    return chapters.find(wb => wb.gameCharacterId === selected) || null;
}

export function usePredictionEvent(options: UsePredictionEventOptions = {}): UsePredictionEventResult {
    const { t } = useI18n();
    const { serverSource, hasHydratedThemeSettings } = useTheme();
    // An explicit server (from the URL, or picked on the page) wins over the global server setting.
    const [manualServer, setManualServer] = useState<ServerType | null>(options.initialServer ?? null);
    const server: ServerType = manualServer ?? (serverSource === "jp" ? "jp" : "cn");
    // Until the theme settings hydrate, serverSource is the default rather than the saved one, so
    // nothing may be fetched for it: a late answer for the default server would win the race.
    const serverReady = manualServer !== null || hasHydratedThemeSettings;
    const [events, setEvents] = useState<EventListItem[]>([]);
    const [masterEvents, setMasterEvents] = useState<IEventInfo[]>([]);
    const [selectedEventId, setSelectedEventIdState] = useState<number | null>(() => options.initialEventId ?? null);
    const [predictionData, setPredictionData] = useState<PredictionData | null>(null);
    const [loading, setLoading] = useState(() => Boolean(options.initialEventId));
    const [error, setError] = useState<string | null>(null);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [worldBlooms, setWorldBlooms] = useState<WorldBloomChapterRow[]>([]);
    const [selectedWlChapter, setSelectedWlChapter] = useState<"overall" | number>(() => options.initialChapter ?? "overall");
    const [loadedWorldLinkSnapshot, setLoadedWorldLinkSnapshot] = useState<LoadedWorldLinkSnapshot | null>(null);
    const [loadedChapterTierSeries, setLoadedChapterTierSeries] = useState<LoadedChapterTierSeries | null>(null);
    const [loadedContextSource, setLoadedContextSource] = useState<PredictionContextSource | null>(null);
    // Read by the 10 s poll, which must not restart on every data update.
    const predictionDataRef = useRef<PredictionData | null>(null);

    // Live clock for relative time & progress
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // A server change drops the selection made for the previous server. Adjusted during render, so
    // no effect runs with the new server and the old selection. The first settled server keeps
    // the initial selection (e.g. an event from the URL).
    const [settledServer, setSettledServer] = useState<ServerType | null>(null);
    if (serverReady && settledServer !== server) {
        setSettledServer(server);
        if (settledServer !== null) {
            setEventsLoading(true);
            setError(null);
            setSelectedEventIdState(null);
            setSelectedWlChapter("overall");
            setEvents([]);
            setPredictionData(null);
        }
    }

    // Fetch master data for assets matching currently selected server
    useEffect(() => {
        if (!serverReady) return;
        let cancelled = false;
        const keep = <T,>(set: (value: T) => void) => (value: T) => { if (!cancelled) set(value); };
        fetchMasterDataForServer<IEventInfo[]>(server, "events.json")
            .then(keep(setMasterEvents))
            .catch(() => {
                fetchMasterData<IEventInfo[]>("events.json").then(keep(setMasterEvents)).catch(console.error);
            });
        fetchMasterDataForServer<WorldBloomChapterRow[]>(server, "worldBlooms.json")
            .then(keep(setWorldBlooms))
            .catch(() => {
                fetchMasterData<WorldBloomChapterRow[]>("worldBlooms.json").then(keep(setWorldBlooms)).catch(console.error);
            });
        return () => {
            cancelled = true;
        };
    }, [server, serverReady]);

    const setServer = useCallback((newServer: ServerType) => {
        if (newServer === server) return;
        setManualServer(newServer);
    }, [server]);

    const setSelectedEventId = useCallback((eventId: number | null) => {
        // Re-selecting the current event would leave `loading` set with no fetch to clear it.
        if (eventId === selectedEventId) return;
        setError(null);
        if (eventId !== null) setLoading(true);
        setSelectedEventIdState(eventId);
        setSelectedWlChapter("overall");
    }, [selectedEventId]);

    // Fetch events list when server changes
    useEffect(() => {
        if (!serverReady) return;
        let cancelled = false;
        fetchEventList(server)
            .then(data => {
                if (cancelled) return;
                if (!Array.isArray(data)) {
                    setEvents([]);
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
                        setSelectedEventIdState(defaultEventId);
                    }
                }
            })
            .catch(err => {
                if (cancelled) return;
                console.error("Failed to fetch events:", err);
                setError(t("page.prediction.errors.eventsFetchFailed"));
                setEvents([]);
            })
            .finally(() => {
                if (!cancelled) setEventsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server, serverReady, t]);

    // Fetch prediction data when event changes; a reply for an event that is no longer selected is dropped.
    useEffect(() => {
        if (!selectedEventId) {
            return;
        }
        let cancelled = false;

        fetchPredictionData(selectedEventId, server)
            .then(data => {
                if (!cancelled) setPredictionData(data);
            })
            .catch(err => {
                if (cancelled) return;
                console.error("Failed to fetch prediction:", err);
                setError(t("page.prediction.errors.predictionFetchFailed"));
                setPredictionData(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [selectedEventId, server, t]);

    // Prediction context inputs (event rules, event meta, JP finals for CN) of the selected event
    useEffect(() => {
        if (!selectedEventId) return;
        let cancelled = false;
        loadPredictionContextSource(server, selectedEventId)
            .then(source => {
                if (!cancelled) setLoadedContextSource(source);
            })
            .catch(err => console.warn("Prediction context unavailable, using the fallback context:", err));
        return () => {
            cancelled = true;
        };
    }, [selectedEventId, server]);

    const contextSource = loadedContextSource && loadedContextSource.region === server && loadedContextSource.eventId === selectedEventId
        ? loadedContextSource
        : null;

    useEffect(() => {
        predictionDataRef.current = predictionData;
    }, [predictionData]);

    // Until the selected event's own data arrives, the previous event's tiers must not be shown or planned with.
    const selectedPredictionData = predictionData && predictionData.data?.event_id === selectedEventId ? predictionData : null;

    // The previous event's snapshot must not give the next event its chapters (or make it a WL event).
    const worldLinkSnapshot = loadedWorldLinkSnapshot && loadedWorldLinkSnapshot.region === server && loadedWorldLinkSnapshot.eventId === selectedEventId
        ? loadedWorldLinkSnapshot.snapshot
        : null;

    // Live ranking sync: receive live border cutoffs from realtime ranking or other tabs
    useEffect(() => {
        if (!selectedEventId) return;

        const predEvent = events.find(e => e.id === selectedEventId);
        const masterEvent = masterEvents.find(e => e.id === selectedEventId);
        const s = eventListTimeMs(predEvent?.start_at) ?? masterEvent?.startAt;
        const e = eventListTimeMs(predEvent?.end_at) ?? masterEvent?.aggregateAt;
        const contextFor = (otherTiers: ReadonlyArray<{ rank: number; score: number }>) =>
            predictionContextFor(contextSource, { kind: "overall" }, otherTiers, {
                region: server,
                eventId: selectedEventId,
                eventType: masterEvent?.eventType ?? predEvent?.event_type,
                startAt: s ?? 0,
                endAt: e ?? 0,
                chapterCharacterId: null,
                chapterNo: null,
            });

        const unsubscribe = subscribeRankingSync((payload) => {
            if (payload.region !== server) return;
            if (payload.eventId && payload.eventId !== selectedEventId) return;

            setPredictionData((prev) => {
                if (!prev) return prev;
                return applyLiveSyncToPrediction(prev, payload, server, s, e, contextFor);
            });
        });

        return () => unsubscribe();
    }, [selectedEventId, server, events, masterEvents, contextSource]);

    // Extract World Link chapters for current event
    const eventWorldBlooms = useMemo<WorldBloomChapterRow[]>(() => {
        if (!selectedEventId) return [];
        const predEvent = events.find(e => e.id === selectedEventId);
        const masterEvent = masterEvents.find(e => e.id === selectedEventId);

        // 1. Check matching entries in masterdata worldBlooms.
        // A finale entry has no gameCharacterId; a finale event has only the overall ranking.
        const matched = worldBlooms
            .filter(wb => wb.eventId === selectedEventId && !wb.isSupplemental && wb.gameCharacterId > 0)
            .sort((a, b) => a.chapterNo - b.chapterNo);
        if (matched.length > 0) return matched;

        // 2. Event 214 (Again And Again Ambition! - WL3 Shuffle) canonical chapter roster
        if (selectedEventId === 214) {
            const s = eventListTimeMs(predEvent?.start_at) ?? (masterEvent?.startAt || Date.now());
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
                const s = eventListTimeMs(predEvent?.start_at) ?? (masterEvent?.startAt || Date.now());
                const e = eventListTimeMs(predEvent?.end_at) ?? (masterEvent?.aggregateAt || (s + 9 * 24 * 3600000));
                const totalHours = Math.max(24, (e - s) / 3600000);
                const chapterHours = Math.min(48, Math.floor(totalHours / validGroups.length));

                const allGroupsHaveSameTimestamps = validGroups.every(g => g.startAt === validGroups[0].startAt && g.endAt === validGroups[0].endAt);

                return validGroups.map((g, idx) => {
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
            }
        }

        // 4. Check WL3 simulation group definition
        const wl3Group = getWl3SimulationGroupByEventId(selectedEventId);
        if (wl3Group) {
            const s = eventListTimeMs(predEvent?.start_at) ?? (masterEvent?.startAt || Date.now());
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

    const activeWlChapter = useMemo(
        () => findActiveWlChapter(eventWorldBlooms, selectedWlChapter),
        [eventWorldBlooms, selectedWlChapter],
    );

    const isWorldBloomEvent = useMemo(() => {
        if (!selectedEventId) return false;
        const predEvent = events.find(e => e.id === selectedEventId);
        const masterEvent = masterEvents.find(e => e.id === selectedEventId);
        return looksLikeWorldLinkEvent(masterEvent, predEvent) || eventWorldBlooms.length > 0;
    }, [selectedEventId, events, masterEvents, eventWorldBlooms]);

    // Fetch World Link snapshot (live or fallback to client/static archive)
    useEffect(() => {
        if (!selectedEventId || !isWorldBloomEvent) {
            setLoadedWorldLinkSnapshot(null);
            return;
        }
        let isCancelled = false;
        const keep = (snapshot: WorldLinkSnapshotV2) =>
            setLoadedWorldLinkSnapshot({ region: server, eventId: selectedEventId, snapshot });
        const loadArchived = async () => {
            const archived = await fetchWorldLinkArchive(server, selectedEventId);
            if (!isCancelled && archived && snapshotBelongsTo(archived, selectedEventId)) keep(archived);
        };

        fetchWorldLinkLatestV2(server)
            .then(async data => {
                if (isCancelled) return;
                const hasActiveData = data && Array.isArray(data.groups) && data.groups.some(g => g.entries?.some(e => e.score > 0));
                if (data && hasActiveData && snapshotBelongsTo(data, selectedEventId)) {
                    keep(data);
                    saveWorldLinkSnapshotToStorage(server, selectedEventId, data);
                } else {
                    // Try archived or cached snapshot
                    await loadArchived();
                }
            })
            .catch(async () => {
                if (!isCancelled) await loadArchived();
            });

        return () => {
            isCancelled = true;
        };
    }, [selectedEventId, server, isWorldBloomEvent]);

    // The selected chapter's own reward tiers (JP and CN chapters differ from the event's tiers and each other).
    const chapterRewardTiers = useMemo<readonly number[]>(() => {
        if (typeof selectedWlChapter !== "number") return PREDICTION_RANK_TIERS;
        const tiers = contextSource?.rewardTiersFor({ kind: "chapter", gameCharacterId: selectedWlChapter });
        return tiers && tiers.length > 0 ? tiers : PREDICTION_RANK_TIERS;
    }, [contextSource, selectedWlChapter]);

    // Fetch detailed chapter tier series when a single WL character chapter is selected; the reply is kept
    // under its chapter so a late reply of another chapter or tier list is never used.
    useEffect(() => {
        if (!selectedEventId || !isWorldBloomEvent || typeof selectedWlChapter !== "number") {
            setLoadedChapterTierSeries(null);
            return;
        }
        let cancelled = false;
        const key = chapterSeriesKey(server, selectedEventId, selectedWlChapter);
        fetchWorldLinkTierSeriesV2(server, {
            gameCharacterId: selectedWlChapter,
            tiers: [...chapterRewardTiers],
        })
            .then(series => {
                if (!cancelled) setLoadedChapterTierSeries({ key, series });
            })
            .catch(() => {
                if (!cancelled) setLoadedChapterTierSeries(null);
            });
        return () => {
            cancelled = true;
        };
    }, [selectedEventId, server, isWorldBloomEvent, selectedWlChapter, chapterRewardTiers]);

    const chapterTierSeries = loadedChapterTierSeries && selectedEventId != null && typeof selectedWlChapter === "number"
        && loadedChapterTierSeries.key === chapterSeriesKey(server, selectedEventId, selectedWlChapter)
        ? loadedChapterTierSeries.series
        : null;

    // 10s live background polling: fetch fresh realtime board cutoffs and update in-memory predictions
    useEffect(() => {
        if (!selectedEventId) return;

        const predEvent = events.find(e => e.id === selectedEventId);
        const masterEvent = masterEvents.find(e => e.id === selectedEventId);
        const s = eventListTimeMs(predEvent?.start_at) ?? masterEvent?.startAt;
        const e = eventListTimeMs(predEvent?.end_at) ?? masterEvent?.aggregateAt;
        const contextFor = (otherTiers: ReadonlyArray<{ rank: number; score: number }>) =>
            predictionContextFor(contextSource, { kind: "overall" }, otherTiers, {
                region: server,
                eventId: selectedEventId,
                eventType: masterEvent?.eventType ?? predEvent?.event_type,
                startAt: s ?? 0,
                endAt: e ?? 0,
                chapterCharacterId: null,
                chapterNo: null,
            });

        const POLL_INTERVAL = 10_000;
        let isPolling = false;
        let cancelled = false;

        const pollTick = async () => {
            if (isPolling) return;
            isPolling = true;
            try {
                // 0. A PGAI kline that failed to load is asked for again until it arrives
                const shown = predictionDataRef.current;
                if (shown?.data?.event_id === selectedEventId && shown.data.global_kline.length === 0) {
                    const kline = await fetchGlobalKline(selectedEventId, server);
                    if (cancelled) return;
                    if (kline.length > 0) {
                        setPredictionData(prev => prev?.data?.event_id === selectedEventId
                            ? { ...prev, data: { ...prev.data, global_kline: kline } }
                            : prev);
                    }
                }

                // 1. Fetch fresh standard realtime ranking snapshot
                const freshSnapshot = await fetchLatestV2(server);
                if (cancelled) return;
                if (freshSnapshot && Array.isArray(freshSnapshot.entries) && freshSnapshot.entries.length > 0) {
                    const tierScores = extractTierScoresFromEntries(freshSnapshot.entries);
                    const syncPayload: LiveRankingSyncPayload = {
                        region: server,
                        eventId: freshSnapshot.eventId || selectedEventId,
                        updatedAt: freshSnapshot.updatedAt || Date.now(),
                        tierScores,
                        source: "prediction-next",
                    };
                    const loaded = predictionDataRef.current;
                    const hasTiers = loaded?.data?.event_id === selectedEventId && (loaded.data.charts?.length ?? 0) > 0;
                    if (!hasTiers && freshSnapshot.eventId === selectedEventId) {
                        // The load failed or found no tiers while the board serves this event: load it again.
                        const reloaded = await fetchPredictionData(selectedEventId, server);
                        if (cancelled) return;
                        if (reloaded.data.charts.length > 0) {
                            setPredictionData(reloaded);
                            setError(null);
                        }
                    } else {
                        setPredictionData(prev => {
                            if (prev) {
                                return applyLiveSyncToPrediction(prev, syncPayload, server, s, e, contextFor);
                            }
                            return prev;
                        });
                    }
                    publishRankingSync(syncPayload);
                }

                // 2. Fetch fresh World Link snapshot if World Link event
                if (isWorldBloomEvent) {
                    const freshWl = await fetchWorldLinkLatestV2(server);
                    if (cancelled) return;
                    if (freshWl && Array.isArray(freshWl.groups) && freshWl.groups.length > 0 && snapshotBelongsTo(freshWl, selectedEventId)) {
                        setLoadedWorldLinkSnapshot({ region: server, eventId: selectedEventId, snapshot: freshWl });
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
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [selectedEventId, server, events, masterEvents, isWorldBloomEvent, contextSource]);

    // Compute active prediction data based on selected WL chapter vs overall
    const activePredictionData = useMemo<PredictionData | null>(() => {
        const predictionData = selectedPredictionData;
        if (!predictionData) return null;

        const predEvent = events.find(e => e.id === selectedEventId);
        const masterEvent = masterEvents.find(e => e.id === selectedEventId);
        const eventStart = eventListTimeMs(predEvent?.start_at) ?? (masterEvent?.startAt || Date.now());
        const eventEnd = eventListTimeMs(predEvent?.end_at) ?? (masterEvent?.aggregateAt || (eventStart + 9 * 24 * 3600000));
        const eventId = selectedEventId ?? predictionData.data.event_id;
        const eventType = masterEvent?.eventType ?? predEvent?.event_type;

        if (!isWorldBloomEvent || selectedWlChapter === "overall") {
            if (isWorldBloomEvent && predictionData.data?.charts) {
                const overallContext = predictionContextFor(
                    contextSource,
                    { kind: "overall" },
                    predictionData.data.charts.map(c => ({ rank: c.Rank, score: c.CurrentScore })),
                    { region: server, eventId, eventType, startAt: eventStart, endAt: eventEnd, chapterCharacterId: null, chapterNo: null },
                );
                const enhancedCharts: RankChart[] = predictionData.data.charts.map(chart => {
                    if (!chart.HistoryPoints || chart.HistoryPoints.length === 0) return chart;
                    const res = calculateEventPrediction({
                        server,
                        rank: chart.Rank,
                        startAt: eventStart,
                        endAt: eventEnd,
                        historyPoints: chart.HistoryPoints,
                        context: overallContext,
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
                        context: overallContext,
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
        const chapterContext = predictionContextFor(
            contextSource,
            { kind: "chapter", gameCharacterId: selectedWlChapter },
            isChapterUnstarted ? [] : (group?.entries ?? []).map(item => ({ rank: item.rank, score: item.score })),
            {
                region: server,
                eventId,
                eventType,
                startAt: s,
                endAt: e,
                chapterCharacterId: selectedWlChapter,
                chapterNo: chapter?.chapterNo ?? (chapterIndex >= 0 ? chapterIndex + 1 : null),
            },
        );

        const chapterRanks = chapterRowRanks(
            chapterRewardTiers,
            isChapterUnstarted ? [] : (group?.entries ?? []).map(item => item.rank),
            isChapterUnstarted ? null : chapterTierSeries,
        );
        const chapterCharts: RankChart[] = chapterRanks.map(rank => {
            const entry = group?.entries?.find(item => item.rank === rank);
            const currentScore = isChapterUnstarted ? 0 : (entry?.score || 0);

            let historyPoints: { t: string; y: number }[] = [];

            if (!isChapterUnstarted) {
                // 1. Prefer true World Link chapter tier series from real-time API
                const seriesForRank = chapterTierSeries ? chapterTierSeries[String(rank)] : undefined;
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
                context: chapterContext,
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

        const tier_klines: TierKLine[] = chapterRanks.map(rank => {
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
                CurrentIndex: null,
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
    }, [selectedPredictionData, isWorldBloomEvent, selectedWlChapter, worldLinkSnapshot, activeWlChapter, eventWorldBlooms, now, server, chapterTierSeries, chapterRewardTiers, events, masterEvents, selectedEventId, contextSource]);

    const eventMeta = useMemo(
        () => (selectedEventId ? events.find(e => e.id === selectedEventId) ?? null : null),
        [events, selectedEventId],
    );
    const masterEvent = useMemo(
        () => (selectedEventId ? masterEvents.find(e => e.id === selectedEventId) ?? null : null),
        [masterEvents, selectedEventId],
    );

    // Scope bounds follow the page banner: the selected chapter's window, else the event schedule.
    const scopeStartAt = activeWlChapter
        ? activeWlChapter.chapterStartAt
        : (eventListTimeMs(eventMeta?.start_at) ?? masterEvent?.startAt ?? null);
    const scopeEndAt = activeWlChapter
        ? activeWlChapter.aggregateAt
        : (eventListTimeMs(eventMeta?.end_at) ?? masterEvent?.aggregateAt ?? null);

    return {
        server,
        setServer,
        events,
        eventsLoading,
        masterEvents,
        selectedEventId,
        setSelectedEventId,
        eventMeta,
        masterEvent,
        eventWorldBlooms,
        isWorldBloomEvent,
        selectedWlChapter,
        setSelectedWlChapter,
        activePredictionData,
        scopeStartAt,
        scopeEndAt,
        loading,
        error,
        now,
        worldLinkSnapshot,
    };
}
