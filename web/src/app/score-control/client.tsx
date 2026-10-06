"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { IMusicInfo, IMusicMeta } from "@/types/music";
import type { ICardInfo } from "@/types/types";
import { fetchMasterDataForServer, fetchMusicMetas } from "@/lib/fetch";
import { saveToolState, getAccount, getOAuthAccessTokenForGameUser, isValidServer, SERVER_OPTIONS, type ServerType } from "@/lib/account";
import AccountSelector from "@/components/AccountSelector";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import MusicSelector from "@/components/deck-recommend/MusicSelector";
import EventSelector from "@/components/deck-recommend/EventSelector";
import CharacterSelector from "@/components/deck-recommend/CharacterSelector";
import { preloadDeckEngine } from "@/lib/deck-engine/wasm-loader";

import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getCharacterName } from "@/lib/i18n";
import { getMusicJacketUrl } from "@/lib/assets";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import {
    getValidScores,
    planSmartRoutes,
    FIRE_OPTIONS,
    type ScoreControlResult,
    type SmartRoutePlan,
} from "@/lib/score-control/score-control-calculator";
import { Banner, Button, CircularProgress, EmptyState, Icon, PageContainer, PageHeader, Switch } from "@/components/md3";
import { mdAllInclusive, mdCalculate, mdCheckCircle, mdInfo, mdKeyboardArrowDown, mdListAlt, mdRoute, mdSettings, mdStop, mdStyle, mdTune } from "@/components/md3/icons";
import "./score-control.css";

const _DIFFICULTY_OPTIONS = [
    { value: "easy", label: "Easy" },
    { value: "normal", label: "Normal" },
    { value: "hard", label: "Hard" },
    { value: "expert", label: "Expert" },
    { value: "master", label: "Master" },
    { value: "append", label: "Append" },
];

/** Group results by boost level */
interface BoostGroup {
    boost: number;
    boostRate: number;
    label: string;
    results: ScoreControlResult[];
}

function groupByBoost(raw: ScoreControlResult[]): BoostGroup[] {
    const groups: BoostGroup[] = [];
    for (const opt of FIRE_OPTIONS) {
        const boostResults = raw.filter((r) => r.boost === opt.fires);
        if (boostResults.length > 0) {
            groups.push({
                boost: opt.fires,
                boostRate: opt.rate,
                label: opt.label,
                results: boostResults,
            });
        }
    }
    return groups;
}


/** Fire label helper */
function fireLabel(boost: number): string {
    return `${boost}🔥`;
}


// ==================== Constants ====================

// Valid event_rate values: 100, 103-128, 130 (skip 101, 102, 129 — no songs exist)
const VALID_EVENT_RATES = [
    100, 103, 104, 105, 106, 107, 108, 109, 110,
    111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
    121, 122, 123, 124, 125, 126, 127, 128, 130,
];

// ==================== Infinite Search Types ====================

interface InfiniteSongResult {
    eventRate: number;
    /** All songs at this event_rate that can use the pure AFK routes */
    songs: { musicId: number; musicTitle: string; assetbundleName: string }[];
    difficulty: string;
    routes: SmartRoutePlan[];
    decks: DeckResultInfo[];
}

// ==================== Deck Builder Types ====================
interface CardConfigItem {
    disable: boolean;
    rankMax: boolean;
    episodeRead: boolean;
    masterMax: boolean;
    skillMax: boolean;
}

interface WorkerCardConfig {
    disable?: boolean;
    rankMax?: boolean;
    episodeRead?: boolean;
    masterMax?: boolean;
    skillMax?: boolean;
}

interface DeckCardInfo {
    cardId: number;
    cardRarityType?: string;
    masterRank?: number;
    level?: number;
    [key: string]: unknown;
}

interface DeckResultInfo {
    eventBonus?: number;
    score?: number;
    cards?: DeckCardInfo[];
    [key: string]: unknown;
}

interface UserCardInfo {
    cardId: number;
    masterRank?: number;
    level?: number;
    [key: string]: unknown;
}

type CardMasterInfo = ICardInfo;

const RARITY_CONFIG_KEYS = [
    { key: "rarity_1", label: "★1", color: "#888888" },
    { key: "rarity_2", label: "★2", color: "#88BB44" },
    { key: "rarity_3", label: "★3", color: "#4488DD" },
    { key: "rarity_4", label: "★4", color: "#FFAA00" },
    { key: "rarity_birthday", label: "Birthday", color: "#FF6699" },
];

const DEFAULT_CARD_CONFIG: Record<string, CardConfigItem> = {
    rarity_1: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_2: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_3: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_4: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
    rarity_birthday: { disable: false, rankMax: true, episodeRead: true, masterMax: false, skillMax: false },
};

type ScoreControlTranslationFn = (key: string, values?: Record<string, string | number | boolean | null | undefined>) => string;

function getErrorMessage(error: string, t: ScoreControlTranslationFn): string {
    switch (error) {
        case "INVALID_SEARCH_COMPLETION":
            return t("page.deckRecommend.errors.engineVersion");
        case "USER_NOT_FOUND":
            return t("page.scoreControl.errors.userNotFound");
        case "API_NOT_PUBLIC":
            return t("page.scoreControl.errors.apiNotPublic");
        case "INVALID_USER_DATA_PAYLOAD":
            return t("page.scoreControl.errors.invalidUserDataPayload");
        default:
            if (error.includes("404")) return t("page.scoreControl.errors.userNotFound404");
            if (error.includes("403")) return t("page.scoreControl.errors.apiNotPublic403");
            return error;
    }
}

export default function ScoreControlClient() {
    const { t, formatDate, formatNumber } = useI18n();
    const { assetSource } = useTheme();

    // Music selection state
    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [musicMetas, setMusicMetas] = useState<IMusicMeta[]>([]);
    const [musicId, setMusicId] = useState("");
    const [difficulty, _setDifficulty] = useState("master");

    // Calculator inputs
    const [targetPT, setTargetPT] = useState<number>(698);
    const [minBonus, setMinBonus] = useState<number>(5);
    const [maxBonus, setMaxBonus] = useState<number>(200);

    // Result state
    const [smartRoutes, setSmartRoutes] = useState<SmartRoutePlan[] | null>(null);
    const [fallbackResults, setFallbackResults] = useState<BoostGroup[] | null>(null);
    const [fallbackCount, setFallbackCount] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [expandedRoute, setExpandedRoute] = useState<number | null>(null);

    // ====== Deck Builder State ======
    const [deckBuilderEnabled, setDeckBuilderEnabled] = useState(false);
    const [dbUserId, setDbUserId] = useState("");
    const [dbServer, setDbServer] = useState<ServerType>("jp");
    const [dbEventId, setDbEventId] = useState("");
    const [dbEventType, setDbEventType] = useState<string | null>(null);
    const [dbLiveType, _setDbLiveType] = useState("multi");
    const [dbSupportCharacterId, setDbSupportCharacterId] = useState<number | null>(null);
    const [dbCardConfig, setDbCardConfig] = useState<Record<string, CardConfigItem>>(
        JSON.parse(JSON.stringify(DEFAULT_CARD_CONFIG))
    );
    const [dbShowCardConfig, setDbShowCardConfig] = useState(false);
    const [dbAllowSave, setDbAllowSave] = useState(false);

    // Deck builder results
    const [dbResults, setDbResults] = useState<DeckResultInfo[] | null>(null);
    const [dbUserCards, setDbUserCards] = useState<UserCardInfo[]>([]);
    const [dbDuration, setDbDuration] = useState<number | null>(null);
    const [dbError, setDbError] = useState<string | null>(null);
    const [dbIsCalculating, setDbIsCalculating] = useState(false);
    const [dbUploadTime, setDbUploadTime] = useState<number | null>(null);
    const [cardsMaster, setCardsMaster] = useState<CardMasterInfo[]>([]);

    const dbWorkerRef = useRef<Worker | null>(null);

    // Fake progress bar state for deck builder
    const [dbFakeProgress, setDbFakeProgress] = useState<number>(0);
    const dbFakeProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fake progress for infinite search per-step
    const [infiniteStepProgress, setInfiniteStepProgress] = useState<number>(0);
    const infiniteStepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Infinite search duration tracking
    const [infiniteSearchDuration, setInfiniteSearchDuration] = useState<number | null>(null);
    const [infiniteSearchUploadTime, setInfiniteSearchUploadTime] = useState<number | null>(null);

    /** Compute routes and update state, including fallback results. */
    const computeAndSetRoutes = (
        tp: number, rate: number, bMin: number, bMax: number,
        maxScore: number, bonuses?: number[]
    ) => {
        const routes = planSmartRoutes(tp, rate, bMin, bMax, maxScore, 10, 20, bonuses);
        setSmartRoutes(routes);
        if (routes.length > 0) {
            setExpandedRoute(0);
        } else {
            const raw = getValidScores(tp, rate, 435, 2_840_000);
            const filtered = raw.filter(r => r.eventBonus >= bMin && r.eventBonus <= bMax);
            setFallbackResults(groupByBoost(filtered));
            setFallbackCount(filtered.length);
        }
    };

    /** Start a fake progress animation that asymptotically approaches ~90% */
    const startFakeProgress = useCallback((
        setter: React.Dispatch<React.SetStateAction<number>>,
        timerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
    ) => {
        if (timerRef.current) clearInterval(timerRef.current);
        setter(0);
        const startTime = Date.now();
        timerRef.current = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000; // seconds
            // Asymptotic curve: approaches 90% over ~30s
            const progress = 90 * (1 - Math.exp(-elapsed / 12));
            setter(Math.min(90, progress));
        }, 200);
    }, []);

    /** Stop fake progress and jump to 100% (or reset to 0) */
    const stopFakeProgress = useCallback((
        setter: React.Dispatch<React.SetStateAction<number>>,
        timerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
        complete: boolean = true,
    ) => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (complete) {
            setter(100);
            setTimeout(() => setter(0), 600);
        } else {
            setter(0);
        }
    }, []);

    // Pre-warm the deck builder worker as soon as it is enabled, so the first
    // calculation skips both the worker chunk compile and the wasm boot.
    useEffect(() => {
        if (!deckBuilderEnabled || dbWorkerRef.current) return;
        const w = new Worker(new URL("@/lib/deck-recommend/deck-builder-worker.ts", import.meta.url));
        w.postMessage({ warmup: true });
        dbWorkerRef.current = w;
    }, [deckBuilderEnabled]);

    // Terminate the persistent worker when leaving the page.
    useEffect(() => {
        return () => {
            dbWorkerRef.current?.terminate();
            dbWorkerRef.current = null;
        };
    }, []);

    // ====== Infinite Song Search State ======
    const [infiniteSearchEnabled, setInfiniteSearchEnabled] = useState(false);
    const [infiniteSearchRunning, setInfiniteSearchRunning] = useState(false);
    const [infiniteSearchResults, setInfiniteSearchResults] = useState<InfiniteSongResult[]>([]);
    const [infiniteSearchProgress, setInfiniteSearchProgress] = useState<{
        currentRate: number;
        totalChecked: number;
        found: number;
        currentSongTitle: string;
    } | null>(null);
    const infiniteSearchCancelledRef = useRef(false);
    const [infiniteExpandedIdx, setInfiniteExpandedIdx] = useState<number | null>(null);

    // Group deck results by event bonus
    const dbResultsByBonus = useMemo(() => {
        if (!dbResults) return {};
        const grouped: Record<number, DeckResultInfo[]> = {};
        dbResults.forEach((deck) => {
            const bonus = deck.eventBonus ?? (deck.score || 0); // Handle potentially different field names
            // Round bonus to 1 decimal place to avoid precision issues
            const key = Math.round(bonus * 10) / 10;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(deck);
        });
        return grouped;
    }, [dbResults]);

    // Load initial data
    useEffect(() => {
        preloadDeckEngine();

        fetchMasterDataForServer<IMusicInfo[]>("jp", "musics.json")
            .then((data) => setMusics(data))
            .catch((err) => console.error("Failed to fetch musics", err));

        fetchMusicMetas()
            .then((data) => setMusicMetas(data))
            .catch((err) => console.error("Failed to fetch music meta", err));

        fetchMasterDataForServer<CardMasterInfo[]>("jp", "cards.json").then(setCardsMaster).catch(console.error);

        // Prefer values from the account system.
        const account = getAccount();
        if (account?.toolStates.scoreControl) {
            setDbUserId(account.toolStates.scoreControl.userId);
            setDbServer(account.toolStates.scoreControl.server);
            setDbAllowSave(true); setDeckBuilderEnabled(true);
        } else if (account?.toolStates.deckRecommend) {
            setDbUserId(account.toolStates.deckRecommend.userId);
            setDbServer(account.toolStates.deckRecommend.server);
            setDbAllowSave(true); setDeckBuilderEnabled(true);
        } else {
            const savedUserId = localStorage.getItem("deck_recommend_userid");
            const savedServer = localStorage.getItem("deck_recommend_server");
            if (savedUserId) { setDbUserId(savedUserId); setDbAllowSave(true); setDeckBuilderEnabled(true); }
            if (isValidServer(savedServer)) {
                setDbServer(savedServer);
            }
        }
    }, []);

    // Get event_rate for selected song + difficulty
    const selectedEventRate = useMemo((): number | null => {
        if (!musicId || !musicMetas.length) return null;
        const id = parseInt(musicId);
        const meta = musicMetas.find(
            (m) => m.music_id === id && m.difficulty === difficulty,
        );
        if (!meta) return null;
        return meta.event_rate || 100;
    }, [musicId, difficulty, musicMetas]);

    // World Bloom chapter character: the deck-builder request needs the chapter
    // (supportCharacterId maps to world_bloom_character_id in the worker).
    const handleDbEventSelect = useCallback((eventId: string, eventType?: string) => {
        setDbEventId(eventId);
        setDbEventType(eventType ?? null);
        setDbSupportCharacterId(null);
    }, []);

    const [worldBlooms, setWorldBlooms] = useState<
        { eventId: number; gameCharacterId: number | null; chapterNo: number | null; worldBloomChapterType: string | null }[]
    >([]);
    useEffect(() => {
        if (dbEventType !== "world_bloom") return;
        fetchMasterDataForServer<
            { eventId: number; gameCharacterId: number | null; chapterNo: number | null; worldBloomChapterType: string | null }[]
        >(dbServer, "worldBlooms.json").then(setWorldBlooms).catch(console.error);
    }, [dbEventType, dbServer]);

    const dbWlChapterCharacterIds = useMemo(() => {
        if (dbEventType !== "world_bloom" || !dbEventId) return [];
        const eventId = parseInt(dbEventId);
        const ids = worldBlooms
            .filter((row) => row.eventId === eventId
                && row.gameCharacterId != null
                && row.worldBloomChapterType !== "finale")
            .sort((a, b) => (a.chapterNo ?? 0) - (b.chapterNo ?? 0))
            .map((row) => row.gameCharacterId as number);
        return [...new Set(ids)];
    }, [dbEventType, dbEventId, worldBlooms]);

    // Selected music title
    const selectedMusicTitle = useMemo(() => {
        if (!musicId) return "";
        const music = musics.find((m) => m.id.toString() === musicId);
        return music ? music.title : t("page.scoreControl.fallbackMusicTitle", { id: musicId });
    }, [musicId, musics, t]);

    // Handle calculation
    const handleCalculate = useCallback(() => {
        // If infinite search is enabled, delegate to infinite search
        if (infiniteSearchEnabled && deckBuilderEnabled) {
            handleInfiniteSearch();
            return;
        }

        if (!selectedEventRate) {
            setError(t("page.scoreControl.errors.musicMetaRequired"));
            return;
        }
        if (!targetPT || targetPT <= 0) {
            setError(t("page.scoreControl.errors.invalidTargetPt"));
            return;
        }
        if (minBonus > maxBonus) {
            setError(t("page.scoreControl.errors.invalidBonusRange"));
            return;
        }

        setIsCalculating(true);
        setError(null);
        setSmartRoutes(null);
        setFallbackResults(null);
        setFallbackCount(0);
        setExpandedRoute(null);

        // When deckBuilderEnabled, defer route display until worker completes
        if (!deckBuilderEnabled) {
            setTimeout(() => {
                try {
                    const bonusMin = Math.max(0, minBonus);
                    const bonusMax = Math.min(435, maxBonus);

                    computeAndSetRoutes(targetPT, selectedEventRate, bonusMin, bonusMax, 2_840_000);
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : t("page.scoreControl.errors.calculationFailedUnknown");
                    setError(t("page.scoreControl.errors.calculationFailed", { message }));
                    setSmartRoutes(null);
                    setFallbackResults(null);
                } finally {
                    setIsCalculating(false);
                }
            }, 10);
        }

        // === Deck Builder: start multi-worker if enabled ===
        if (deckBuilderEnabled) {
            if (!dbUserId.trim()) {
                setDbError(t("page.scoreControl.errors.userRequired"));
                setIsCalculating(false);
                return;
            }
            if (!dbEventId.trim()) {
                setDbError(t("page.scoreControl.errors.eventRequired"));
                setIsCalculating(false);
                return;
            }
            if (dbEventType === "world_bloom" && !dbSupportCharacterId) {
                setDbError(t("page.scoreControl.errors.supportCharacterRequired"));
                setIsCalculating(false);
                return;
            }

            setDbError(null);
            setDbResults(null);
            setDbDuration(null);
            setDbUploadTime(null);
            setDbIsCalculating(true);

            // Start fake progress
            startFakeProgress(setDbFakeProgress, dbFakeProgressTimerRef);

            // Build card config
            const configForCalc: Record<string, WorkerCardConfig> = {};
            for (const [key, val] of Object.entries(dbCardConfig)) {
                if (val.disable) {
                    configForCalc[key] = { disable: true };
                } else {
                    configForCalc[key] = {
                        rankMax: val.rankMax,
                        episodeRead: val.episodeRead,
                        masterMax: val.masterMax,
                        skillMax: val.skillMax,
                    };
                }
            }

            const bonusMin = Math.max(0, minBonus);
            const bonusMax = Math.min(435, maxBonus);

            // Target-driven build: plan routes first, then build decks only for
            // the bonus tiers these routes actually need.
            const prelimRoutes = planSmartRoutes(targetPT, selectedEventRate!, bonusMin, bonusMax, 2840000, 10, 20);
            let bonusTiers = [...new Set(
                prelimRoutes.flatMap((route) => route.steps.map((step) => step.eventBonus)),
            )].filter((tier) => tier > 0).sort((a, b) => a - b);
            if (bonusTiers.length === 0) {
                // No planned route in range: fall back to the plain wide-table calculation,
                // and still build decks for the tiers the wide table found.
                computeAndSetRoutes(targetPT, selectedEventRate!, bonusMin, bonusMax, 2_840_000);
                bonusTiers = [...new Set(
                    getValidScores(targetPT, selectedEventRate!, 435, 2_840_000)
                        .filter((r) => r.eventBonus >= bonusMin && r.eventBonus <= bonusMax)
                        .map((r) => r.eventBonus),
                )].sort((a, b) => a - b).slice(0, 32);
            }
            if (bonusTiers.length === 0) {
                setIsCalculating(false);
                return;
            }

            // Reuse the persistent worker (wasm and data stay warm inside it);
            // create it on demand if the warmup effect has not run yet.
            if (!dbWorkerRef.current) {
                dbWorkerRef.current = new Worker(
                    new URL("@/lib/deck-recommend/deck-builder-worker.ts", import.meta.url)
                );
            }
            const w = dbWorkerRef.current;

            // Single worker: only the tiers from the route planning are searched
            // (a handful), so a single round trip is enough.
            const mergeResultRows = (allResults: DeckResultInfo[]): DeckResultInfo[] => {
                // Merge results, deduplicate by eventBonus
                const seen = new Set<number>();
                const merged: DeckResultInfo[] = [];
                for (const r of allResults) {
                    const bonus = r.eventBonus ?? (r.score || 0);
                    const key = Math.round(bonus * 10) / 10;
                    if (!seen.has(key)) {
                        seen.add(key);
                        merged.push(r);
                    }
                }
                return merged;
            };

            const startTime = performance.now();

            w.onmessage = (event) => {
                const data = event.data;
                if ("warm" in data) return; // warmup ack from the pre-warm effect
                if (data.error) {
                    setDbError(getErrorMessage(data.error, t));
                    // Fallback routes
                    try {
                        computeAndSetRoutes(targetPT, selectedEventRate!, bonusMin, bonusMax, 2_840_000);
                    } catch (_) { /* ignore */ }
                    stopFakeProgress(setDbFakeProgress, dbFakeProgressTimerRef, false);
                    setIsCalculating(false);
                    setDbIsCalculating(false);
                } else {
                    const duration = performance.now() - startTime;
                    stopFakeProgress(setDbFakeProgress, dbFakeProgressTimerRef, true);

                    const merged = mergeResultRows(data.result || []);
                    setDbResults(merged);
                    if (data.userCards) setDbUserCards(data.userCards);
                    setDbDuration(duration);
                    if (data.upload_time) setDbUploadTime(data.upload_time);

                    // Re-plan smart routes
                    if (merged.length > 0) {
                        const foundBonuses = Array.from(new Set<number>(merged.map((r) => {
                            const bonus = r.eventBonus ?? (r.score || 0);
                            return Math.round((typeof bonus === 'number' ? bonus : 0) * 10) / 10;
                        })));
                        computeAndSetRoutes(targetPT, selectedEventRate!, bonusMin, bonusMax, 100000, foundBonuses);
                    } else {
                        setSmartRoutes([]);
                    }

                    setIsCalculating(false);
                    setDbIsCalculating(false);
                }
            };

            w.onerror = (err) => {
                setDbError(t("page.scoreControl.errors.workerError", { message: err.message }));
                stopFakeProgress(setDbFakeProgress, dbFakeProgressTimerRef, false);
                setIsCalculating(false);
                setDbIsCalculating(false);
            };

            const oauthAccessToken = getOAuthAccessTokenForGameUser(dbServer, dbUserId.trim());
            w.postMessage({
                args: {
                    userId: dbUserId.trim(),
                    server: dbServer,
                    oauthAccessToken,
                    eventId: parseInt(dbEventId),
                    bonusTiers,
                    minBonus: bonusMin,
                    maxBonus: bonusMax,
                    liveType: dbLiveType,
                    musicId: parseInt(musicId),
                    difficulty,
                    supportCharacterId: dbSupportCharacterId || undefined,
                    cardConfig: configForCalc,
                },
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEventRate, targetPT, minBonus, maxBonus, deckBuilderEnabled, dbUserId, dbServer, dbEventId, dbLiveType, dbSupportCharacterId, musicId, difficulty, dbCardConfig, smartRoutes, infiniteSearchEnabled, t]);

    // ====== Infinite Song Search Logic (Concurrent Worker Pool) ======
    const handleInfiniteSearch = useCallback(async () => {
        if (!musicMetas.length || !musics.length) return;
        if (!dbUserId.trim()) { setDbError(t("page.scoreControl.errors.userRequired")); return; }
        if (!dbEventId.trim()) { setDbError(t("page.scoreControl.errors.eventRequired")); return; }
        if (dbEventType === "world_bloom" && !dbSupportCharacterId) {
            setDbError(t("page.scoreControl.errors.supportCharacterRequired"));
            return;
        }
        if (!targetPT || targetPT <= 0) { setError(t("page.scoreControl.errors.invalidTargetPt")); return; }

        infiniteSearchCancelledRef.current = false;
        setInfiniteSearchRunning(true);
        setInfiniteSearchResults([]);
        setInfiniteSearchProgress({ currentRate: VALID_EVENT_RATES[0], totalChecked: 0, found: 0, currentSongTitle: "" });
        setInfiniteExpandedIdx(null);
        setInfiniteStepProgress(0);
        setInfiniteSearchDuration(null);
        setInfiniteSearchUploadTime(null);
        setDbError(null);
        setError(null);

        // Hide previous normal deck builder results
        setSmartRoutes(null);
        setFallbackResults(null);
        setFallbackCount(0);
        setDbResults(null);
        setDbDuration(null);
        setDbUploadTime(null);
        setExpandedRoute(null);

        const infiniteStartTime = performance.now();

        const bonusMin = Math.max(0, minBonus);
        const bonusMax = Math.min(435, maxBonus);

        // Build card config once
        const configForCalc: Record<string, WorkerCardConfig> = {};
        for (const [key, val] of Object.entries(dbCardConfig)) {
            if (val.disable) {
                configForCalc[key] = { disable: true };
            } else {
                configForCalc[key] = {
                    rankMax: val.rankMax,
                    episodeRead: val.episodeRead,
                    masterMax: val.masterMax,
                    skillMax: val.skillMax,
                };
            }
        }

        // Build task queue: one task per event_rate that has songs
        interface InfTask {
            rate: number;
            songsAtRate: IMusicMeta[];
            firstMusicId: number;
            firstSongTitle: string;
        }
        const taskQueue: InfTask[] = [];
        for (const rate of VALID_EVENT_RATES) {
            const songsAtRate = musicMetas.filter(
                (m) => m.event_rate === rate && m.difficulty === difficulty
            );
            if (songsAtRate.length === 0) continue;
            const firstMeta = songsAtRate[0];
            const firstSongInfo = musics.find((m) => m.id === firstMeta.music_id);
            taskQueue.push({
                rate,
                songsAtRate,
                firstMusicId: firstMeta.music_id,
                firstSongTitle: firstSongInfo ? firstSongInfo.title : t("page.scoreControl.fallbackMusicTitle", { id: firstMeta.music_id }),
            });
        }

        const collected: InfiniteSongResult[] = [];
        let totalChecked = 0;
        const _taskIdx = 0;
        let capturedUploadTime: number | null = null;
        const isMobileInf = typeof window !== 'undefined' && /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const poolSize = isMobileInf ? 1 : Math.min(navigator.hardwareConcurrency || 4, 4);

        // Start fake progress for the step
        startFakeProgress(setInfiniteStepProgress, infiniteStepTimerRef);

        // Process a single task and return result
        const processTask = (task: InfTask): Promise<void> => {
            return new Promise<void>((resolve) => {
                if (infiniteSearchCancelledRef.current || collected.length >= 10) {
                    resolve();
                    return;
                }

                const w = new Worker(
                    new URL("@/lib/deck-recommend/deck-builder-worker.ts", import.meta.url)
                );
                w.onmessage = (evt) => {
                    w.terminate();
                    totalChecked++;

                    // Reset step progress for next task
                    stopFakeProgress(setInfiniteStepProgress, infiniteStepTimerRef, true);
                    setTimeout(() => startFakeProgress(setInfiniteStepProgress, infiniteStepTimerRef), 100);

                    const data = evt.data;
                    if (!capturedUploadTime && data.upload_time) {
                        capturedUploadTime = data.upload_time;
                        setInfiniteSearchUploadTime(data.upload_time);
                    }
                    if (!data.error && data.result && data.result.length > 0) {
                        const results = data.result;
                        const foundBonuses = Array.from(new Set<number>(results.map((r: DeckResultInfo) => {
                            const bonus = r.eventBonus ?? (r.score || 0);
                            return Math.round((typeof bonus === 'number' ? bonus : 0) * 10) / 10;
                        })));
                        const routes = planSmartRoutes(
                            targetPT, task.rate, bonusMin, bonusMax, 100000, 10, 20, foundBonuses
                        );
                        const pureAFKRoutes = routes.filter(r => r.isPureAFK);
                        if (pureAFKRoutes.length > 0) {
                            const allSongs = task.songsAtRate.map((m) => {
                                const info = musics.find((mu) => mu.id === m.music_id);
                                return {
                                    musicId: m.music_id,
                                    musicTitle: info ? info.title : t("page.scoreControl.fallbackMusicTitle", { id: m.music_id }),
                                    assetbundleName: info ? info.assetbundleName : "",
                                };
                            });
                            collected.push({
                                eventRate: task.rate,
                                songs: allSongs,
                                difficulty,
                                routes: pureAFKRoutes,
                                decks: results,
                            });
                            setInfiniteSearchResults([...collected]);
                        }
                    }

                    setInfiniteSearchProgress({
                        currentRate: task.rate,
                        totalChecked,
                        found: collected.length,
                        currentSongTitle: t("page.scoreControl.currentSongWithRate", { title: task.firstSongTitle, rate: task.rate }),
                    });

                    resolve();
                };
                w.onerror = () => {
                    w.terminate();
                    totalChecked++;
                    resolve();
                };
                const oauthAccessToken = getOAuthAccessTokenForGameUser(dbServer, dbUserId.trim());
                w.postMessage({
                    args: {
                        userId: dbUserId.trim(),
                        server: dbServer,
                        oauthAccessToken,
                        eventId: parseInt(dbEventId),
                        minBonus: bonusMin,
                        maxBonus: bonusMax,
                        liveType: dbLiveType,
                        musicId: task.firstMusicId,
                        difficulty,
                        supportCharacterId: dbSupportCharacterId || undefined,
                        cardConfig: configForCalc,
                    },
                });
            });
        };

        // Concurrent pool runner using tagged promises
        const runPool = async () => {
            let activeCount = 0;
            let resolveSlot: (() => void) | null = null;

            const waitForSlot = (): Promise<void> => {
                if (activeCount < poolSize) return Promise.resolve();
                return new Promise<void>((resolve) => { resolveSlot = resolve; });
            };

            for (let i = 0; i < taskQueue.length; i++) {
                if (infiniteSearchCancelledRef.current || collected.length >= 10) break;

                await waitForSlot();
                if (infiniteSearchCancelledRef.current || collected.length >= 10) break;

                const task = taskQueue[i];
                activeCount++;
                processTask(task).then(() => {
                    activeCount--;
                    if (resolveSlot) {
                        const fn = resolveSlot;
                        resolveSlot = null;
                        fn();
                    }
                });
            }

            // Wait for all remaining tasks
            while (activeCount > 0) {
                await new Promise<void>((resolve) => { resolveSlot = resolve; });
            }
        };

        await runPool();

        stopFakeProgress(setInfiniteStepProgress, infiniteStepTimerRef, false);
        setInfiniteSearchDuration(performance.now() - infiniteStartTime);
        setInfiniteSearchRunning(false);
        setInfiniteSearchProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [musicMetas, musics, difficulty, dbUserId, dbServer, dbEventId, dbLiveType, dbSupportCharacterId, dbCardConfig, minBonus, maxBonus, targetPT, t]);

    const handleCancelInfiniteSearch = useCallback(() => {
        infiniteSearchCancelledRef.current = true;
    }, []);

    // Update deck builder card config
    const updateDbCardConfig = useCallback((rarity: string, field: keyof CardConfigItem, value: boolean) => {
        setDbCardConfig((prev) => ({
            ...prev,
            [rarity]: { ...prev[rarity], [field]: value },
        }));
    }, []);

    // Find card master data by ID
    const getCardMaster = useCallback((cardId: number) => {
        return cardsMaster.find((c) => c.id === cardId);
    }, [cardsMaster]);

    /** Render a single deck card with full info — shared renderer using SekaiCardThumbnail */
    const renderDeckCard = (card: DeckCardInfo, i: number, size: "sm" | "md" = "md") => {
        const masterCard = getCardMaster(card.cardId);
        const userCard = dbUserCards.find((u) => u.cardId === card.cardId);
        const rarityType = masterCard?.cardRarityType || card.cardRarityType;
        const isBirthday = rarityType === "rarity_birthday";
        const masterRank = userCard?.masterRank ?? card.masterRank ?? 0;
        const level = userCard?.level ?? card.level ?? 1;
        const showTrained = ((rarityType === "rarity_3" || rarityType === "rarity_4") && !isBirthday);

        if (!masterCard) {
            return (
                <div key={i} className="w-10 h-10 sm:w-12 sm:h-12 rounded bg-surface-container-high flex items-center justify-center text-on-surface-variant text-xs flex-shrink-0">
                    ?
                </div>
            );
        }

        const thumbWidth = size === "sm" ? 40 : 48;

        const characterName = getCharacterName(t, masterCard.characterId, "short");

        return (
            <div key={i} className="relative flex flex-col items-center gap-0.5 flex-shrink-0" title={`ID:${card.cardId} ${masterCard.prefix || ""} ${characterName}`}>
                <Link href={`/cards/${card.cardId}`} className="block relative" target="_blank">
                    <SekaiCardThumbnail
                        card={masterCard}
                        trained={showTrained}
                        mastery={masterRank}
                        width={thumbWidth}
                    />
                    {i === 0 && (
                        <div className="absolute bottom-0 right-0 bg-primary text-on-primary text-[8px] font-bold px-1 py-[1px] rounded-tl-md leading-none z-10">L</div>
                    )}
                </Link>
                <div className="text-[9px] sm:text-[10px] text-on-surface-variant font-mono leading-none flex items-center gap-0.5">
                    <span>Lv.{level}</span>
                    {masterRank > 0 && (
                        <span className="bg-surface-container-high text-on-surface-variant rounded-full px-[3px] py-[1px] flex items-center gap-[1px] leading-none border border-outline-variant">
                            <span className="text-[7px]">🔷</span>
                            <span className="text-[8px] font-bold">{masterRank}</span>
                        </span>
                    )}
                </div>
            </div>
        );
    };

    /** Render results table for fallback exact match */
    const renderResultsTable = (items: ScoreControlResult[]) => (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs text-on-surface-variant border-b border-outline-variant">
                        <th className="text-left px-5 py-2.5 font-medium">{t("page.scoreControl.table.eventBonus")}</th>
                        <th className="text-left px-5 py-2.5 font-medium">{t("page.scoreControl.table.scoreMin")}</th>
                        <th className="text-left px-5 py-2.5 font-medium">{t("page.scoreControl.table.scoreMax")}</th>
                        <th className="text-left px-5 py-2.5 font-medium">{t("page.scoreControl.table.scoreWindow")}</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((r, i) => {
                        const isAFK = r.scoreMin === 0;
                        return (
                            <tr key={i} className={`sc-row border-b border-outline-variant last:border-0 ${isAFK ? "bg-tertiary-container/30" : ""}`}>
                                <td className="px-5 py-2.5">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className={`w-2 h-2 rounded-full ${isAFK ? "bg-tertiary" : "bg-primary"}`}></span>
                                        <span className="font-bold text-on-surface">{r.eventBonus}%</span>
                                        {isAFK && (
                                            <span className="text-[10px] font-bold text-on-tertiary-container bg-tertiary-container px-1.5 py-0.5 rounded">
                                                {t("page.scoreControl.table.afk")}
                                            </span>
                                        )}
                                    </span>
                                </td>
                                <td className="px-5 py-2.5 font-mono text-on-surface-variant">
                                    {isAFK ? (
                                        <span className="text-tertiary font-bold">0</span>
                                    ) : (
                                        formatNumber(r.scoreMin)
                                    )}
                                </td>
                                <td className="px-5 py-2.5 font-mono text-on-surface-variant">
                                    {formatNumber(r.scoreMax)}
                                </td>
                                <td className="px-5 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <div className="sc-score-bar flex-1 min-w-[60px] max-w-[120px]">
                                            <div
                                                className={`sc-score-bar-fill ${isAFK ? "!bg-tertiary" : ""}`}
                                                style={{
                                                    width: `${Math.min(100, ((r.scoreMax - r.scoreMin + 1) / 1000) * 100)}%`,
                                                }}
                                            />
                                        </div>
                                        <span className="text-xs text-on-surface-variant font-mono whitespace-nowrap">
                                            {isAFK ? (
                                                <span className="text-tertiary">{t("page.scoreControl.table.afkAvailable")}</span>
                                            ) : (
                                                <>+/-{formatNumber(Math.floor((r.scoreMax - r.scoreMin) / 2))}</>
                                            )}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    return (
        <MainLayout>
            <PageContainer className="max-w-5xl">
                <PageHeader
                    align="center"
                    eyebrow={t("page.scoreControl.badge")}
                    title={t("page.scoreControl.title")}
                    highlight={t("page.scoreControl.titleHighlight")}
                    description={t("page.scoreControl.description")}
                />

                {/* Input Form */}
                <div className="bg-surface-card border border-outline-variant/70 p-5 sm:p-6 rounded-md3-xl mb-6">
                    <h2 className="type-title-l text-on-surface mb-4 flex items-center gap-2">
                        <Icon path={mdTune} size={24} className="text-primary" />
                        {t("page.scoreControl.musicAndTarget")}
                    </h2>

                    {/* Song + Difficulty */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                        <div className={infiniteSearchEnabled && deckBuilderEnabled ? "opacity-50 pointer-events-none" : ""}>
                            <MusicSelector
                                selectedMusicId={musicId}
                                onSelect={(id) => setMusicId(id)}
                                recommendMode="event"
                                liveType="multi"
                            />
                            {musicId && selectedEventRate === null && (
                                <p className="mt-1 text-xs text-tertiary">
                                    {t("page.scoreControl.noMetaForDifficulty", { difficulty: difficulty.toUpperCase() })}
                                </p>
                            )}
                            {selectedEventRate !== null && (
                                <p className="mt-1 text-xs text-on-surface-variant">
                                    {t("page.scoreControl.musicRate", { rate: selectedEventRate })}
                                </p>
                            )}
                        </div>
                        <div className="flex items-end pb-2">
                            <p className="text-xs text-on-surface-variant">
                                <span className="inline-flex items-center gap-1">
                                    <Icon path={mdInfo} size={16} className="text-on-surface-variant" />
                                    {t("page.scoreControl.difficultyIrrelevant")}
                                </span>
                            </p>
                        </div>
                    </div>

                    {/* Target PT + Bonus Range */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                        <div>
                            <label className="mb-1 block type-label-l text-on-surface-variant">
                                {t("page.scoreControl.targetPt")} <span className="text-error">*</span>
                            </label>
                            <input
                                type="number"
                                value={targetPT}
                                onChange={(e) => setTargetPT(Number(e.target.value))}
                                placeholder="698"
                                min={1}
                                className="sc-number-input h-12 w-full rounded-md3-xs border border-outline bg-transparent px-4 type-body-l text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant"
                            />
                            <p className="mt-1 text-xs text-on-surface-variant">
                                {t("page.scoreControl.targetPtHint")}
                            </p>
                        </div>
                        <div>
                            <label className="mb-1 block type-label-l text-on-surface-variant">
                                {t("page.scoreControl.minBonus")}
                            </label>
                            <input
                                type="number"
                                value={minBonus}
                                onChange={(e) => setMinBonus(Number(e.target.value))}
                                placeholder="5"
                                min={0}
                                max={435}
                                className="sc-number-input h-12 w-full rounded-md3-xs border border-outline bg-transparent px-4 type-body-l text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant"
                            />
                            <p className="mt-1 text-xs text-on-surface-variant">
                                {t("page.scoreControl.minBonusHint")}
                            </p>
                        </div>
                        <div>
                            <label className="mb-1 block type-label-l text-on-surface-variant">
                                {t("page.scoreControl.maxBonus")}
                            </label>
                            <input
                                type="number"
                                value={maxBonus}
                                onChange={(e) => setMaxBonus(Number(e.target.value))}
                                placeholder="200"
                                min={0}
                                max={435}
                                className="sc-number-input h-12 w-full rounded-md3-xs border border-outline bg-transparent px-4 type-body-l text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant"
                            />
                            <p className="mt-1 text-xs text-on-surface-variant">
                                {t("page.scoreControl.maxBonusHint")}
                            </p>
                        </div>
                    </div>

                    {/* ====== Deck Builder Toggle ====== */}
                    <div className="mb-5 p-4 rounded-md3-lg bg-surface-container">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="type-title-s text-on-surface">{t("page.scoreControl.deckBuilder")}</span>
                                <span className="type-label-s text-on-tertiary-container bg-tertiary-container px-2 py-0.5 rounded-md3-sm">{t("page.scoreControl.beta")}</span>
                            </div>
                            <Switch
                                checked={deckBuilderEnabled}
                                onCheckedChange={setDeckBuilderEnabled}
                                aria-label={t("page.scoreControl.deckBuilder")}
                            />
                        </div>
                        {deckBuilderEnabled && (
                            <Banner tone="warning" className="mt-3">{t("page.scoreControl.deckBuilderWarning")}</Banner>
                        )}
                    </div>

                    {/* ====== Deck Builder Expanded Options ====== */}
                    {deckBuilderEnabled && (
                        <div className="mb-5 space-y-4 p-4 rounded-md3-lg bg-surface-container">
                            <h3 className="type-title-s text-on-surface flex items-center gap-2">
                                <Icon path={mdSettings} size={20} className="text-primary" />
                                {t("page.scoreControl.deckBuilderSettings")}
                            </h3>

                            {/* Account Selector + User ID + Server */}
                            <AccountSelector
                                onSelect={(gameId, srv) => {
                                    setDbUserId(gameId);
                                    setDbServer(srv);
                                    if (dbAllowSave) {
                                        localStorage.setItem("deck_recommend_userid", gameId);
                                        localStorage.setItem("deck_recommend_server", srv);
                                        saveToolState("scoreControl", gameId, srv);
                                    }
                                }}
                                currentUserId={dbUserId}
                                currentServer={dbServer}
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block type-label-l text-on-surface-variant">
                                        {t("page.scoreControl.userId")} <span className="text-error">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={dbUserId}
                                        onChange={(e) => {
                                            setDbUserId(e.target.value);
                                            if (dbAllowSave) localStorage.setItem("deck_recommend_userid", e.target.value);
                                        }}
                                        placeholder={t("page.scoreControl.userIdPlaceholder")}
                                        className="h-12 w-full rounded-md3-xs border border-outline bg-transparent px-4 type-body-l text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant"
                                    />
                                    <div className="flex items-center justify-between mt-2 px-1">
                                        <span className="type-label-l text-on-surface-variant">{t("page.scoreControl.saveLocally")}</span>
                                        <Switch
                                            checked={dbAllowSave}
                                            aria-label={t("page.scoreControl.saveLocally")}
                                            onCheckedChange={(n) => {
                                                setDbAllowSave(n);
                                                if (n) {
                                                    localStorage.setItem("deck_recommend_userid", dbUserId);
                                                    localStorage.setItem("deck_recommend_server", dbServer);
                                                    saveToolState("scoreControl", dbUserId, dbServer);
                                                } else {
                                                    localStorage.removeItem("deck_recommend_userid");
                                                    localStorage.removeItem("deck_recommend_server");
                                                }
                                            }}
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-on-surface-variant">
                                        {t("page.scoreControl.harukiHintStart")} <ExternalLink href="https://haruki.seiunx.com" className="text-primary hover:underline">{t("page.scoreControl.harukiToolbox")}</ExternalLink> {t("page.scoreControl.harukiHintEnd")}
                                    </p>
                                </div>
                                <div>
                                    <label className="mb-1 block type-label-l text-on-surface-variant">{t("page.scoreControl.server")}</label>
                                    <div className="flex flex-wrap gap-2">
                                        {SERVER_OPTIONS.map((s) => (
                                            <button
                                                key={s.value}
                                                onClick={() => {
                                                    setDbServer(s.value);
                                                    if (dbAllowSave) localStorage.setItem("deck_recommend_server", s.value);
                                                }}
                                                className={`state-layer focus-ring h-8 px-3 rounded-md3-sm type-label-l transition-colors ${dbServer === s.value
                                                    ? "bg-secondary-container text-on-secondary-container"
                                                    : "border border-outline-variant text-on-surface-variant"
                                                    }`}
                                            >
                                                <ServerRegionLabel server={s.value} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Event */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block type-label-l text-on-surface-variant">
                                        {t("page.scoreControl.event")} <span className="text-error">*</span>
                                    </label>
                                    <EventSelector
                                        selectedEventId={dbEventId}
                                        onSelect={handleDbEventSelect}
                                    />
                                </div>
                            </div>

                            {/* World Bloom chapter character */}
                            {dbEventType === "world_bloom" && (
                                <div className="mt-4">
                                    <label className="mb-1 block type-label-l text-on-surface-variant">
                                        {t("page.scoreControl.wlChapterCharacter")} <span className="text-error">*</span>
                                    </label>
                                    <CharacterSelector
                                        selectedCharacterId={dbSupportCharacterId}
                                        onSelect={setDbSupportCharacterId}
                                        availableCharacterIds={
                                            dbWlChapterCharacterIds.length
                                                ? dbWlChapterCharacterIds
                                                : undefined
                                        }
                                        hideUnitFilter
                                    />
                                </div>
                            )}

                            {/* Card Config Toggle */}
                            <div>
                                <button
                                    onClick={() => setDbShowCardConfig(!dbShowCardConfig)}
                                    className="state-layer focus-ring -ml-2 flex h-10 items-center gap-2 rounded-full px-3 type-label-l text-on-surface-variant transition-colors hover:text-primary"
                                >
                                    <Icon path={mdKeyboardArrowDown} size={20} className={`transition-transform ${dbShowCardConfig ? "rotate-180" : ""}`} />
                                    {t("page.scoreControl.cardTrainingSettings")}
                                </button>
                                {dbShowCardConfig && (
                                    <div className="mt-3 overflow-x-auto">
                                        <table className="dr-config-table w-full text-sm">
                                            <thead>
                                                <tr>
                                                    <th className="text-left py-2 px-2 text-on-surface-variant font-medium">{t("page.scoreControl.cardConfigHeaders.rarity")}</th>
                                                    <th className="py-2 px-2 text-on-surface-variant font-medium">{t("page.scoreControl.cardConfigHeaders.disable")}</th>
                                                    <th className="py-2 px-2 text-on-surface-variant font-medium">{t("page.scoreControl.cardConfigHeaders.maxLevel")}</th>
                                                    <th className="py-2 px-2 text-on-surface-variant font-medium">{t("page.scoreControl.cardConfigHeaders.episodes")}</th>
                                                    <th className="py-2 px-2 text-on-surface-variant font-medium">{t("page.scoreControl.cardConfigHeaders.maxMaster")}</th>
                                                    <th className="py-2 px-2 text-on-surface-variant font-medium">{t("page.scoreControl.cardConfigHeaders.maxSkill")}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {RARITY_CONFIG_KEYS.map((rk) => {
                                                    const cfg = dbCardConfig[rk.key];
                                                    return (
                                                        <tr key={rk.key} className="border-t border-outline-variant">
                                                            <td className="py-2 px-2">
                                                                <div className="flex items-center gap-0.5">
                                                                    {rk.key === "rarity_birthday" ? (
                                                                        <div className="w-4 h-4 relative">
                                                                            <Image src="/data/icon/birthday.webp" alt="Birthday" fill className="object-contain" unoptimized />
                                                                        </div>
                                                                    ) : (
                                                                        Array.from({ length: parseInt(rk.key.split("_")[1]) }).map((_, i) => (
                                                                            <div key={i} className="w-3 h-3 relative">
                                                                                <Image src="/data/icon/star.webp" alt="Star" fill className="object-contain" unoptimized />
                                                                            </div>
                                                                        ))
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="py-2 px-2 text-center">
                                                                <input type="checkbox" checked={!cfg.disable} onChange={(e) => updateDbCardConfig(rk.key, 'disable', !e.target.checked)} className="dr-checkbox" />
                                                            </td>
                                                            <td className="py-2 px-2 text-center">
                                                                <input type="checkbox" checked={cfg.rankMax} onChange={(e) => updateDbCardConfig(rk.key, 'rankMax', e.target.checked)} className="dr-checkbox" disabled={cfg.disable} />
                                                            </td>
                                                            <td className="py-2 px-2 text-center">
                                                                <input type="checkbox" checked={cfg.episodeRead} onChange={(e) => updateDbCardConfig(rk.key, 'episodeRead', e.target.checked)} className="dr-checkbox" disabled={cfg.disable} />
                                                            </td>
                                                            <td className="py-2 px-2 text-center">
                                                                <input type="checkbox" checked={cfg.masterMax} onChange={(e) => updateDbCardConfig(rk.key, 'masterMax', e.target.checked)} className="dr-checkbox" disabled={cfg.disable} />
                                                            </td>
                                                            <td className="py-2 px-2 text-center">
                                                                <input type="checkbox" checked={cfg.skillMax} onChange={(e) => updateDbCardConfig(rk.key, 'skillMax', e.target.checked)} className="dr-checkbox" disabled={cfg.disable} />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Infinite Song Search Toggle */}
                            <div className="mt-4 p-3 rounded-md3-md bg-surface-container-high">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="type-title-s text-on-surface">{t("page.scoreControl.infiniteSearch")}</span>
                                        <span className="type-label-s text-on-tertiary-container bg-tertiary-container px-2 py-0.5 rounded-md3-sm">{t("page.scoreControl.experimental")}</span>
                                    </div>
                                    <Switch
                                        checked={infiniteSearchEnabled}
                                        onCheckedChange={setInfiniteSearchEnabled}
                                        aria-label={t("page.scoreControl.infiniteSearch")}
                                    />
                                </div>
                                {infiniteSearchEnabled && (
                                    <div className="mt-2 space-y-2">
                                        <Banner tone="warning">{t("page.scoreControl.infiniteWarning")}</Banner>
                                        <p className="type-body-s text-on-surface-variant">{t("page.scoreControl.searchRatesHint")}</p>
                                        <p className="type-body-s text-on-surface-variant">{t("page.scoreControl.infiniteStartHint")}</p>
                                        {infiniteSearchRunning && (
                                            <Button type="button" variant="outlined" color="error" size="s" fullWidth icon={mdStop} onClick={handleCancelInfiniteSearch}>
                                                {t("page.scoreControl.stopSearch")}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Calculate Button */}
                    <Button
                        type="button"
                        variant="filled"
                        size="m"
                        fullWidth
                        onClick={handleCalculate}
                        disabled={infiniteSearchEnabled && deckBuilderEnabled ? (infiniteSearchRunning || !dbUserId.trim() || !dbEventId.trim()) : (!selectedEventRate || isCalculating)}
                        >
                        {isCalculating || infiniteSearchRunning ? (
                            <>
                                <CircularProgress size={20} strokeWidth={3} />
                                {infiniteSearchRunning ? t("page.scoreControl.searching") : t("page.scoreControl.calculating")}
                            </>
                        ) : (
                            <>
                                <Icon path={mdCalculate} size={24} />
                                {infiniteSearchEnabled && deckBuilderEnabled ? t("page.scoreControl.infiniteSearchButton") : t("page.scoreControl.smartCalculate")}
                            </>
                        )}
                    </Button>
                </div>

                {/* Error Display */}
                {error && (
                    <Banner tone="error" className="mb-6">{error}</Banner>
                )}

                {/* Deck Builder Duration & Upload Time - above results */}
                {deckBuilderEnabled && !dbIsCalculating && (dbDuration !== null || dbUploadTime) && (
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                        {dbDuration !== null && <span className="text-xs text-on-surface-variant">{t("page.scoreControl.calculationDuration", { seconds: (dbDuration / 1000).toFixed(1) })}</span>}
                        {dbUploadTime && <span className="text-xs text-on-surface-variant">{t("page.scoreControl.dataTime", { time: formatDate(dbUploadTime * 1000, { dateStyle: "short", timeStyle: "short" }) })}</span>}
                    </div>
                )}

                {/* Infinite Search Duration - above results */}
                {infiniteSearchEnabled && deckBuilderEnabled && !infiniteSearchRunning && (infiniteSearchDuration !== null || infiniteSearchUploadTime) && (
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                        {infiniteSearchDuration !== null && <span className="text-xs text-on-surface-variant">{t("page.scoreControl.searchDuration", { seconds: (infiniteSearchDuration / 1000).toFixed(1) })}</span>}
                        {infiniteSearchUploadTime && <span className="text-xs text-on-surface-variant">{t("page.scoreControl.dataTime", { time: formatDate(infiniteSearchUploadTime * 1000, { dateStyle: "short", timeStyle: "short" }) })}</span>}
                    </div>
                )}

                {/* ===== Smart Route Plans (Primary) ===== */}
                {smartRoutes !== null && smartRoutes.length > 0 && (
                    <div className="sc-result-enter mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <h2 className="type-title-l text-on-surface flex items-center gap-2">
                                <Icon path={mdRoute} size={24} className="text-primary" />
                                {t("page.scoreControl.smartRoutesTitle")}
                            </h2>
                            <span className="px-2.5 py-1 bg-secondary-container text-on-secondary-container type-label-l rounded-md3-sm">
                                {t("page.scoreControl.routeCount", { count: formatNumber(smartRoutes.length) })}
                            </span>
                            <span className="text-xs text-on-surface-variant">
                                {t("page.scoreControl.bonusRange", { min: minBonus, max: maxBonus })}
                            </span>
                        </div>

                        <div className="space-y-3">
                            {smartRoutes.map((plan, idx) => {
                                const isExpanded = expandedRoute === idx;
                                return (
                                    <div key={idx} className="bg-surface-card border border-outline-variant/70 rounded-md3-lg overflow-hidden">
                                        <button
                                            onClick={() => setExpandedRoute(isExpanded ? null : idx)}
                                            className="state-layer focus-ring w-full px-5 py-4 flex items-center justify-between text-left"
                                        >
                                            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                                                <span className="type-title-s text-on-surface whitespace-nowrap">
                                                    {t("page.scoreControl.routeLabel", { index: idx + 1 })}
                                                </span>
                                                {plan.isPureAFK ? (
                                                    <span className="type-label-s text-on-tertiary-container bg-tertiary-container px-2 py-0.5 rounded-md3-sm whitespace-nowrap">
                                                        {t("page.scoreControl.pureAfk")}
                                                    </span>
                                                ) : (
                                                    <span className="type-label-s text-on-secondary-container bg-secondary-container px-2 py-0.5 rounded-md3-sm whitespace-nowrap">
                                                        {t("page.scoreControl.afkAndControl")}
                                                    </span>
                                                )}
                                                <span className="text-xs text-on-surface-variant whitespace-nowrap">
                                                    {t("page.scoreControl.playCount", { count: formatNumber(plan.totalPlays) })}
                                                    {plan.afkCount > 0 && (
                                                        <span className="text-tertiary ml-1">{t("page.scoreControl.afkPlayCount", { count: formatNumber(plan.afkCount) })}</span>
                                                    )}
                                                </span>
                                                <span className="type-label-l text-tertiary whitespace-nowrap">
                                                    = {plan.totalPT} PT
                                                </span>
                                            </div>
                                            <Icon path={mdKeyboardArrowDown} size={24} className={`text-on-surface-variant transition-transform flex-shrink-0 ml-2 ${isExpanded ? "rotate-180" : ""}`} />
                                        </button>

                                        {isExpanded && (
                                            <div className="border-t border-outline-variant px-5 py-4 space-y-3">
                                                {plan.steps.map((step, si) => (
                                                    <div key={si} className={`rounded-md3-md p-4 ${step.isAFK ? "bg-tertiary-container/40" : "bg-secondary-container/40"}`}>
                                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                            <span className={`type-label-l px-2 py-0.5 rounded-md3-sm ${step.isAFK ? "bg-tertiary-container text-on-tertiary-container" : "bg-secondary-container text-on-secondary-container"}`}>
                                                                {step.isAFK ? t("page.scoreControl.stepAfk") : t("page.scoreControl.stepControl")}
                                                            </span>
                                                            <span className="type-title-s text-on-surface">x{step.count}</span>
                                                            <span className="text-xs text-on-surface-variant">{t("page.scoreControl.eachTimePt", { pt: formatNumber(step.pt) })}</span>
                                                            <span className="text-xs text-on-surface-variant">
                                                                {t("page.scoreControl.subtotal")} <span className="font-bold text-on-surface">{formatNumber(step.pt * step.count)} PT</span>
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                                            <div>
                                                                <span className="text-on-surface-variant">{t("page.scoreControl.fire")}</span>
                                                                <div className="font-bold text-on-surface mt-0.5">{fireLabel(step.boost)} <span className="text-on-surface-variant font-normal">x{step.boostRate}</span></div>
                                                            </div>
                                                            <div>
                                                                <span className="text-on-surface-variant">{t("page.scoreControl.deckBonus")}</span>
                                                                <div className="font-bold text-on-surface mt-0.5">{step.eventBonus}%</div>
                                                            </div>
                                                            <div>
                                                                <span className="text-on-surface-variant">{t("page.scoreControl.scoreRange")}</span>
                                                                <div className="font-bold text-on-surface mt-0.5 font-mono">
                                                                    {step.isAFK ? <span className="text-tertiary">0 ~ {formatNumber(step.scoreMax)}</span> : <span>{formatNumber(step.scoreMin)} ~ {formatNumber(step.scoreMax)}</span>}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <span className="text-on-surface-variant">{t("page.scoreControl.action")}</span>
                                                                <div className="font-bold mt-0.5">
                                                                    {step.isAFK ? (
                                                                        <span className="text-tertiary">{t("page.scoreControl.afkAction")}</span>
                                                                    ) : (
                                                                        <span className="text-secondary">
                                                                            {step.scoreMin === step.scoreMax ? <>{t("page.scoreControl.targetScore", { score: formatNumber(step.scoreMin) })}</> : <>{t("page.scoreControl.controlToRange", { min: formatNumber(step.scoreMin), max: formatNumber(step.scoreMax) })}</>}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {dbResultsByBonus && dbResultsByBonus[step.eventBonus] && (
                                                            <div className="mt-2 pt-2 border-t border-outline-variant">
                                                                <div className="text-[10px] text-on-surface-variant mb-1 flex items-center justify-between">
                                                                    <span>{t("page.scoreControl.recommendedDeckWithBonus", { bonus: step.eventBonus })}</span>
                                                                    <span className="bg-surface-container-high text-on-surface-variant px-1.5 py-0.5 rounded">{t("page.scoreControl.planCount", { count: formatNumber(dbResultsByBonus[step.eventBonus].length) })}</span>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    {dbResultsByBonus[step.eventBonus].map((deck, deckIdx: number) => (
                                                                        <div key={deckIdx} className="bg-surface-container-lowest rounded-md3-sm p-2 border border-outline-variant">
                                                                            <div className="flex gap-1 flex-wrap mb-1">
                                                                                {deck.cards?.slice(0, 5).map((card: DeckCardInfo, i: number) => renderDeckCard(card, i))}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                                <div className="flex items-center justify-end gap-2 pt-1">
                                                    <span className="text-xs text-on-surface-variant">{t("page.scoreControl.total")}</span>
                                                    <span className="type-title-s text-tertiary font-mono">{formatNumber(plan.steps.reduce((sum, s) => sum + s.pt * s.count, 0))} PT</span>
                                                    <span className="text-tertiary type-label-l">{t("page.scoreControl.exactlyAchieved")}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Fallback */}
                {smartRoutes !== null && smartRoutes.length === 0 && fallbackResults !== null && (
                    <div className="sc-result-enter">
                        <Banner tone="warning" className="mb-4" title={t("page.scoreControl.fallbackNotice")}>
                            {t("page.scoreControl.fallbackSummary", { min: minBonus, max: maxBonus, target: formatNumber(targetPT) })}
                        </Banner>
                        {fallbackResults.length === 0 ? (
                            <div className="bg-surface-card border border-outline-variant/70 rounded-md3-xl">
                                <EmptyState title={t("page.scoreControl.noPlan")} description={t("page.scoreControl.noPlanHint")} className="py-10" />
                            </div>
                        ) : (
                            <>
                                <div className="bg-surface-card border border-outline-variant/70 p-4 sm:p-5 rounded-md3-lg mb-4">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-3">
                                            <h2 className="type-title-l text-on-surface flex items-center gap-2">
                                                <Icon path={mdListAlt} size={24} className="text-primary" />{t("page.scoreControl.fallbackTitle")}
                                            </h2>
                                            <span className="px-2.5 py-1 bg-secondary-container text-on-secondary-container type-label-l rounded-md3-sm">{t("page.scoreControl.planCount", { count: formatNumber(fallbackCount) })}</span>
                                        </div>
                                        <div className="text-xs text-on-surface-variant flex items-center gap-2 flex-wrap">
                                            <span>{t("page.scoreControl.targetPtLabel", { target: formatNumber(targetPT) })}</span>
                                            <span>·</span>
                                            <span>{t("page.scoreControl.songRateLabel", { rate: selectedEventRate })}</span>
                                            {selectedMusicTitle && (<><span>·</span><span className="truncate max-w-[200px]">{selectedMusicTitle}</span></>)}
                                        </div>
                                    </div>
                                </div>
                                {fallbackResults.map((group) => (
                                    <div key={group.boost} className="bg-surface-card border border-outline-variant/70 rounded-md3-lg mb-4 overflow-hidden">
                                        <div className="sc-boost-header px-5 py-3 border-b border-outline-variant flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">{group.label}</span>
                                                <span className="text-xs text-on-surface-variant">{t("page.scoreControl.multiplier", { rate: group.boostRate })}</span>
                                            </div>
                                            <span className="type-label-m text-on-surface-variant bg-surface-container-highest px-2.5 py-1 rounded-md3-sm">{t("page.scoreControl.planCount", { count: formatNumber(group.results.length) })}</span>
                                        </div>
                                        {renderResultsTable(group.results)}
                                    </div>
                                ))}
                                {dbResults !== null && dbResults.length > 0 && (
                                    <div className="bg-surface-card border border-outline-variant/70 p-4 sm:p-5 rounded-md3-lg mb-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Icon path={mdStyle} size={20} className="text-primary" />
                                            <h3 className="type-title-s text-on-surface">{t("page.scoreControl.recommendedDecks")}</h3>
                                        </div>
                                        {Object.entries(dbResultsByBonus).sort(([a], [b]) => Number(a) - Number(b)).map(([bonus, decks]) => (
                                            <div key={bonus} className="mb-3 last:mb-0">
                                                <div className="text-[10px] font-bold text-primary mb-1.5">{t("page.scoreControl.recommendedDeckWithBonus", { bonus })}</div>
                                                <div className="space-y-2">
                                                    {decks.map((deck, deckIdx: number) => (
                                                        <div key={deckIdx} className="bg-surface-container-lowest rounded-md3-sm p-2 border border-outline-variant">
                                                            <div className="flex gap-1 flex-wrap">
                                                                {deck.cards?.slice(0, 5).map((card: DeckCardInfo, i: number) => renderDeckCard(card, i))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* No results at all */}
                {smartRoutes !== null && smartRoutes.length === 0 && fallbackResults === null && (
                    <div className="bg-surface-card border border-outline-variant/70 rounded-md3-xl sc-result-enter">
                        <EmptyState title={t("page.scoreControl.noPlan")} description={t("page.scoreControl.noPlanHint")} className="py-10" />
                    </div>
                )}

                {/* Deck Builder Status */}
                {deckBuilderEnabled && (
                    <div className="mb-6">
                        {dbIsCalculating && (
                            <div className="bg-surface-card border border-outline-variant/70 p-6 rounded-md3-lg">
                                <div className="flex items-center gap-3 mb-3">
                                    <CircularProgress size={20} strokeWidth={3} className="shrink-0 text-primary" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-on-surface">{t("page.scoreControl.searchingDecks")}</p>
                                        <p className="text-[10px] text-on-surface-variant mt-0.5">{t("page.scoreControl.deckBuilderProgressTask")}</p>
                                    </div>
                                    <span className="type-label-l text-primary tabular-nums">{Math.round(dbFakeProgress)}%</span>
                                </div>
                                <div className="sc-fake-progress-track">
                                    <div className="sc-fake-progress-fill" style={{ width: `${dbFakeProgress}%` }} />
                                </div>
                            </div>
                        )}
                        {dbError && (
                            <Banner tone="error" className="mb-4">{dbError}</Banner>
                        )}
                        {!dbIsCalculating && dbResults !== null && dbResults.length === 0 && (
                            <div className="bg-surface-card border border-outline-variant/70 rounded-md3-xl">
                                <EmptyState title={t("page.scoreControl.noMatchingDeck")} description={t("page.scoreControl.noMatchingDeckHint")} className="py-10" />
                            </div>
                        )}
                    </div>
                )}

                {/* Infinite Song Search Progress & Results */}
                {infiniteSearchEnabled && deckBuilderEnabled && (infiniteSearchRunning || infiniteSearchResults.length > 0) && (
                    <div className="mb-6 sc-result-enter">
                        {infiniteSearchRunning && infiniteSearchProgress && (
                            <div className="p-5 rounded-md3-lg mb-4 bg-surface-container">
                                <div className="flex items-center gap-3 mb-3">
                                    <CircularProgress size={20} strokeWidth={3} className="shrink-0 text-tertiary" />
                                    <span className="type-title-s text-on-surface">{t("page.scoreControl.infiniteInProgress")}</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div><span className="text-on-surface-variant">{t("page.scoreControl.currentRate")}</span><div className="font-bold text-tertiary mt-0.5">{infiniteSearchProgress.currentRate}%</div></div>
                                    <div><span className="text-on-surface-variant">{t("page.scoreControl.checkedCount")}</span><div className="font-bold text-on-surface mt-0.5">{t("page.scoreControl.checkedSongs", { count: formatNumber(infiniteSearchProgress.totalChecked) })}</div></div>
                                    <div><span className="text-on-surface-variant">{t("page.scoreControl.foundCount")}</span><div className="font-bold text-tertiary mt-0.5">{infiniteSearchProgress.found} / 10</div></div>
                                    <div><span className="text-on-surface-variant">{t("page.scoreControl.currentSong")}</span><div className="font-bold text-on-surface mt-0.5 truncate">{infiniteSearchProgress.currentSongTitle}</div></div>
                                </div>
                                <div className="mt-3 w-full bg-surface-container-highest rounded-full h-1.5">
                                    <div className="bg-tertiary h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (VALID_EVENT_RATES.indexOf(infiniteSearchProgress.currentRate) + 1) / VALID_EVENT_RATES.length * 100)}%` }} />
                                </div>
                                {infiniteStepProgress > 0 && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <span className="text-[10px] text-on-surface-variant whitespace-nowrap">{t("page.scoreControl.currentStep")}</span>
                                        <div className="sc-fake-progress-track flex-1">
                                            <div className="sc-fake-progress-fill !bg-tertiary" style={{ width: `${infiniteStepProgress}%` }} />
                                        </div>
                                        <span className="text-[10px] font-bold text-tertiary tabular-nums w-8 text-right">{Math.round(infiniteStepProgress)}%</span>
                                    </div>
                                )}
                                <p className="mt-1.5 text-[10px] text-on-surface-variant">{t("page.scoreControl.parallelWorkersShort", { count: Math.min(navigator.hardwareConcurrency || 4, 4) })}</p>
                            </div>
                        )}

                        {!infiniteSearchRunning && infiniteSearchResults.length > 0 && (
                            <div className="p-4 rounded-md3-lg mb-4 bg-tertiary-container text-on-tertiary-container">
                                <div className="flex items-center gap-2">
                                    <Icon path={mdCheckCircle} size={24} />
                                    <span className="type-title-s">{t("page.scoreControl.infiniteComplete", { rateCount: formatNumber(infiniteSearchResults.length), songCount: formatNumber(infiniteSearchResults.reduce((s, r) => s + r.songs.length, 0)) })}</span>
                                </div>
                            </div>
                        )}

                        {!infiniteSearchRunning && infiniteSearchResults.length === 0 && (
                            <div className="bg-surface-card border border-outline-variant/70 rounded-md3-xl mb-4">
                                <EmptyState title={t("page.scoreControl.noInfiniteSongs")} description={t("page.scoreControl.noInfiniteSongsHint")} className="py-10" />
                            </div>
                        )}

                        {infiniteSearchResults.length > 0 && (
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <h2 className="type-title-l text-on-surface flex items-center gap-2">
                                        <Icon path={mdAllInclusive} size={24} className="text-primary" />
                                        {t("page.scoreControl.infiniteResultsTitle")}
                                    </h2>
                                    <span className="px-2.5 py-1 bg-secondary-container text-on-secondary-container type-label-l rounded-md3-sm">{t("page.scoreControl.rateCount", { count: formatNumber(infiniteSearchResults.length) })}</span>
                                </div>
                                <div className="space-y-3">
                                    {infiniteSearchResults.map((result, idx) => {
                                        const isExpanded = infiniteExpandedIdx === idx;
                                        return (
                                            <div key={idx} className="bg-surface-card border border-outline-variant/70 rounded-md3-lg overflow-hidden">
                                                <button onClick={() => setInfiniteExpandedIdx(isExpanded ? null : idx)} className="state-layer focus-ring w-full px-5 py-4 flex items-center justify-between text-left">
                                                    <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                                                        <span className="type-title-s text-on-surface whitespace-nowrap">#{idx + 1}</span>
                                                        <span className="type-label-s text-on-tertiary-container bg-tertiary-container px-2 py-0.5 rounded-md3-sm whitespace-nowrap">{t("page.scoreControl.rateBadge", { rate: result.eventRate })}</span>
                                                        <span className="type-label-s text-on-tertiary-container bg-tertiary-container px-2 py-0.5 rounded-md3-sm whitespace-nowrap">{t("page.scoreControl.pureAfk")}</span>
                                                        <span className="text-xs text-on-surface-variant whitespace-nowrap">{t("page.scoreControl.songsAndRoutes", { songs: formatNumber(result.songs.length), routes: formatNumber(result.routes.length) })}</span>
                                                    </div>
                                                    <Icon path={mdKeyboardArrowDown} size={24} className={`text-on-surface-variant transition-transform flex-shrink-0 ml-2 ${isExpanded ? "rotate-180" : ""}`} />
                                                </button>

                                                {isExpanded && (
                                                    <div className="border-t border-outline-variant px-5 py-4 space-y-3">
                                                        {/* Songs with cover images */}
                                                        <div className="rounded-md3-md p-3 border border-outline-variant bg-surface-container-low">
                                                            <div className="text-[10px] text-on-surface-variant mb-1.5">{t("page.scoreControl.availableSongs", { count: formatNumber(result.songs.length) })}</div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {result.songs.map((song, si) => (

                                                                    <Link key={si} href={`/music/${song.musicId}`} target="_blank" className="state-layer focus-ring flex items-center gap-2 bg-surface-container-lowest px-2 py-1.5 rounded-md3-sm border border-outline-variant transition-colors hover:border-primary group">

                                                                        {song.assetbundleName && result.songs.length < 5 && (
                                                                            <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0 ring-1 ring-outline-variant">
                                                                                <Image src={getMusicJacketUrl(song.assetbundleName, assetSource)} alt={song.musicTitle} fill className="object-cover" unoptimized />
                                                                            </div>
                                                                        )}
                                                                        <span className="text-xs text-on-surface group-hover:text-primary transition-colors">{song.musicTitle}</span>
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Routes */}
                                                        {result.routes.slice(0, 5).map((plan, pi) => (
                                                            <div key={pi} className="rounded-md3-md p-4 bg-tertiary-container/40">
                                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                                    <span className="type-label-l px-2 py-0.5 rounded-md3-sm bg-tertiary-container text-on-tertiary-container">{t("page.scoreControl.routeLabel", { index: pi + 1 })}</span>
                                                                    <span className="type-label-s text-on-tertiary-container bg-tertiary-container px-2 py-0.5 rounded-md3-sm">{t("page.scoreControl.pureAfk")}</span>
                                                                    <span className="text-xs text-on-surface-variant">{t("page.scoreControl.routeSummary", { plays: formatNumber(plan.totalPlays), pt: formatNumber(plan.totalPT) })}</span>
                                                                </div>
                                                                {plan.steps.map((step, si) => (
                                                                    <div key={si} className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mt-1">
                                                                        <div><span className="text-on-surface-variant">{t("page.scoreControl.step")}</span><div className="font-bold text-tertiary mt-0.5">{t("page.scoreControl.afkTimes", { count: formatNumber(step.count) })}</div></div>
                                                                        <div><span className="text-on-surface-variant">{t("page.scoreControl.fire")}</span><div className="font-bold text-on-surface mt-0.5">{fireLabel(step.boost)} <span className="text-on-surface-variant font-normal">x{step.boostRate}</span></div></div>
                                                                        <div><span className="text-on-surface-variant">{t("page.scoreControl.deckBonus")}</span><div className="font-bold text-on-surface mt-0.5">{step.eventBonus}%</div></div>
                                                                        <div><span className="text-on-surface-variant">{t("page.scoreControl.perPlayPt")}</span><div className="font-bold text-tertiary mt-0.5">{step.pt} PT</div></div>
                                                                    </div>
                                                                ))}
                                                                {/* Matching decks with full card display */}
                                                                {(() => {
                                                                    const neededBonuses = new Set(plan.steps.map(s => s.eventBonus));
                                                                    const matchingDecks = result.decks.filter((d) => {
                                                                        const bonus = d.eventBonus ?? (d.score || 0);
                                                                        const key = Math.round(bonus * 10) / 10;
                                                                        return neededBonuses.has(key);
                                                                    });
                                                                    if (matchingDecks.length === 0) return null;
                                                                    return (
                                                                        <div className="mt-2 pt-2 border-t border-tertiary/30">
                                                                            <div className="text-[10px] text-on-surface-variant mb-1">{t("page.scoreControl.recommendedDeck")}</div>
                                                                            {matchingDecks.slice(0, 2).map((deck, di: number) => (
                                                                                <div key={di} className="bg-surface-container-lowest rounded-md3-sm p-2 border border-outline-variant mb-1">
                                                                                    <div className="flex gap-1 flex-wrap mb-1">
                                                                                        {deck.cards?.slice(0, 5).map((card: DeckCardInfo, ci: number) => renderDeckCard(card, ci, "sm"))}
                                                                                    </div>
                                                                                    <span className="text-[10px] text-on-surface-variant">{t("page.scoreControl.bonusLabel", { bonus: Math.round((deck.eventBonus ?? deck.score ?? 0) * 10) / 10 })}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="mt-12 text-center type-body-s text-on-surface-variant">
                    <p>{t("page.scoreControl.licenseNotice")}</p>
                </div>
            </PageContainer>
        </MainLayout>
    );
}
