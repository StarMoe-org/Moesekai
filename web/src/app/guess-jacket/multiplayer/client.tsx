"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { localizePathForBrowser } from "@/lib/localized-path";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { UNIT_DATA } from "@/types/types";
import { getMusicJacketUrl, getCharacterIconUrl, getStampUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { loadTranslations, type TranslationData } from "@/lib/translations";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import {
    generateRoomCode, createRoom, findRoom, findRoomAcrossServers,
    updateRoomPlayers, updateRoomStatus, deleteRoom,
    getSupabaseClient, measureAllLatencies,
    SERVERS, RoomPlayer, RoomRecord
} from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { IMusicInfo } from "@/types/music";
import Modal from "@/components/common/Modal";
import { Select } from "@/components/md3";
import { ServerRegionIcon } from "@/components/common/ServerRegion";
import "./multiplayer.css";

// ==================== CONSTANTS ====================

const MAX_PLAYERS = 4;
const MAX_ROUNDS = 10;
const INITIAL_HP = 1000;
const ATTEMPT_PENALTY = 20;
const TIMEOUT_PENALTY = 100;
const FEEDBACK_DURATION = 4000;
const OPTIONS_CHOICES = [4, 6, 8, 10] as const;
const PLAYABLE_CHARACTER_IDS = UNIT_DATA.flatMap((unit) => unit.charIds);

// Get sticker URL from generic stamp assets (01-44 range)
function getStickerImageUrl(stickerNum: number): string {
    const padded = String(stickerNum).padStart(4, "0");
    return getStampUrl(`stamp${padded}`, "main-jp");
}

// Round multiplier by round index
function getRoundMultiplier(roundIndex: number): number {
    return (roundIndex + 1) * 0.5;
}

// Generate session ID
function generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ==================== TYPES ====================

type Difficulty = "easy" | "normal" | "hard" | "extreme";
type ServerScope = "jp" | "cn";
type DistortionType = "none" | "hue-rotate" | "flip-v" | "flip-h" | "grayscale" | "invert" | "rgb-shuffle";

interface ActiveDistortion {
    type: DistortionType;
}

const DISTORTION_POOL: { type: DistortionType }[] = [
    { type: "none" },
    { type: "hue-rotate" },
    { type: "flip-v" },
    { type: "flip-h" },
    { type: "grayscale" },
    { type: "invert" },
    { type: "rgb-shuffle" },
];

const DISTORTION_LABEL_KEYS: Record<DistortionType, string> = {
    none: "none",
    "hue-rotate": "hueRotate",
    "flip-v": "flipV",
    "flip-h": "flipH",
    grayscale: "grayscale",
    invert: "invert",
    "rgb-shuffle": "rgbShuffle",
};

interface MultiplayerSettings {
    server: ServerScope;
    difficulty: Difficulty;
    timeLimit: number;
    optionsCount: number;
}

const DEFAULT_SETTINGS: MultiplayerSettings = {
    server: "jp",
    difficulty: "normal",
    timeLimit: 30,
    optionsCount: 10,
};

type Phase = "lobby" | "room" | "playing" | "feedback" | "result";
type LobbyTab = "create" | "join";

interface PlayerState {
    id: string;
    characterId: number;
    slot: number;
    isHost: boolean;
    hp: number;
    blockBar: number;
    attempts: number;
    guessedCorrectly: boolean;
    guessOrder: number;
    eliminated: boolean;
    eliminatedRound: number;
    isDying?: boolean;
    reviveCount: number;
}

interface RoundData {
    roundIndex: number;
    musicId: number;
    assetbundleName: string;
    cropX: number;
    cropY: number;
    cropSize: number;
    distortions?: ActiveDistortion[];
    optionIds: number[];
}

interface FloatingHpChange {
    id: string;
    playerId: string;
    amount: number;
    type: "wrong" | "kill" | "timeout" | "block";
}

interface ActiveSticker {
    id: string;
    stickerNum: number;
    expiresAt: number;
}

// ==================== SEEDED RANDOM ====================

class SeededRandom {
    private seed: number;
    constructor(seed: string) {
        this.seed = this.hashString(seed || Date.now().toString());
    }
    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }
    next(): number {
        const x = Math.sin(this.seed++) * 10000;
        return x - Math.floor(x);
    }
    pick<T>(array: T[]): T {
        return array[Math.floor(this.next() * array.length)];
    }
    pickMultiple<T>(array: T[], n: number): T[] {
        const result: T[] = [];
        const pool = [...array];
        for (let i = 0; i < n; i++) {
            if (pool.length === 0) break;
            const idx = Math.floor(this.next() * pool.length);
            result.push(pool[idx]);
            pool.splice(idx, 1);
        }
        return result;
    }
}

function getAssetSourceForServer(server: ServerScope): AssetSourceType {
    return server === "cn" ? "main-cn" : "main-jp";
}

function getCropSize(difficulty: Difficulty): number {
    if (difficulty === "easy") return 380;
    if (difficulty === "hard") return 200;
    if (difficulty === "extreme") return 150;
    return 280;
}

// ==================== MAIN COMPONENT ====================

function MultiplayerContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { themeColor } = useTheme();
    const { t } = useI18n();
    const getRelayServerName = useCallback((serverId: string) => {
        const server = SERVERS.find(s => s.id === serverId);
        return server ? t(server.nameKey) : serverId;
    }, [t]);
    const getRelayServerRegion = useCallback((serverId: string) => {
        const server = SERVERS.find(s => s.id === serverId);
        return server ? t(server.regionKey) : "";
    }, [t]);

    // Phase & identity
    const [phase, setPhase] = useState<Phase>("lobby");
    const [lobbyTab, setLobbyTab] = useState<LobbyTab>("create");
    const [mySessionId] = useState(() => generateSessionId());
    const [myCharId, setMyCharId] = useState<number>(21);

    useEffect(() => {
        const roomParam = searchParams.get("room");
        if (roomParam) {
            setLobbyTab("join");
            setJoinCode(roomParam.toUpperCase());
        }
    }, [searchParams]);

    // Game settings (host-configurable)
    const [gameSettings, setGameSettings] = useState<MultiplayerSettings>(DEFAULT_SETTINGS);

    // Room state
    const [roomId, setRoomId] = useState<string>("");
    const [roomCode, setRoomCode] = useState<string>("");
    const [joinCode, setJoinCode] = useState<string>("");
    const [players, setPlayers] = useState<PlayerState[]>([]);
    const [isHost, setIsHost] = useState(false);
    const [error, setError] = useState<string>("");

    // Multi-server state
    const [selectedServerId, setSelectedServerId] = useState<string>("tokyo-1");
    const [currentServerId, setCurrentServerId] = useState<string>("tokyo-1");
    const [serverLatencies, setServerLatencies] = useState<Map<string, number>>(new Map());
    const [isTestingLatency, setIsTestingLatency] = useState(false);
    const [isServerListExpanded, setIsServerListExpanded] = useState(false);
    const currentServerIdRef = useRef<string>("tokyo-1");

    // UI state
    const [showRules, setShowRules] = useState(false);

    // Game state
    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [loadError, setLoadError] = useState<string>("");
    const [musicsLoading, setMusicsLoading] = useState(true);
    const [gameDeck, setGameDeck] = useState<IMusicInfo[]>([]);
    const [currentRound, setCurrentRound] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);
    const [isRoundActive, setIsRoundActive] = useState(false);
    const [roundData, setRoundData] = useState<RoundData | null>(null);
    const [guessCount, setGuessCount] = useState(0);
    const [activeSettings, setActiveSettings] = useState<MultiplayerSettings>(DEFAULT_SETTINGS);
    const [myGuessed, setMyGuessed] = useState(false);
    const [disabledOptionIds, setDisabledOptionIds] = useState<number[]>([]);

    // Feedback
    const [feedbackMusic, setFeedbackMusic] = useState<IMusicInfo | null>(null);
    const [feedbackCorrect, setFeedbackCorrect] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);

    // Stickers
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const [activeStickers, setActiveStickers] = useState<Map<string, ActiveSticker>>(new Map());

    // Kill notifications
    const [killNotify, setKillNotify] = useState<string>("");

    // Floating HP changes
    const [floatingHpChanges, setFloatingHpChanges] = useState<FloatingHpChange[]>([]);

    // Wrong guess shake
    const [wrongGuessShake, setWrongGuessShake] = useState(false);

    // Distortions (extreme mode)
    const [currentDistortions, setCurrentDistortions] = useState<ActiveDistortion[]>([]);

    // Canvas
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    // Channel
    const channelRef = useRef<RealtimeChannel | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

    // State refs for channel handlers
    const playersRef = useRef<PlayerState[]>([]);
    const guessCountRef = useRef(0);
    const currentRoundRef = useRef(0);
    const gameDeckRef = useRef<IMusicInfo[]>([]);
    const isHostRef = useRef(false);
    const activeSettingsRef = useRef<MultiplayerSettings>(DEFAULT_SETTINGS);
    const musicsRef = useRef<IMusicInfo[]>([]);
    const isRoundActiveRef = useRef(false);
    const myGuessedRef = useRef(false);
    const roundDataRef = useRef<RoundData | null>(null);
    const timeLeftRef = useRef(30);
    const roundKillDamageRef = useRef<Map<string, number>>(new Map());

    useEffect(() => { playersRef.current = players; }, [players]);
    useEffect(() => { guessCountRef.current = guessCount; }, [guessCount]);
    useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);
    useEffect(() => { gameDeckRef.current = gameDeck; }, [gameDeck]);
    useEffect(() => { isHostRef.current = isHost; }, [isHost]);
    useEffect(() => { activeSettingsRef.current = activeSettings; }, [activeSettings]);
    useEffect(() => { musicsRef.current = musics; }, [musics]);
    useEffect(() => { isRoundActiveRef.current = isRoundActive; }, [isRoundActive]);
    useEffect(() => { myGuessedRef.current = myGuessed; }, [myGuessed]);
    useEffect(() => { roundDataRef.current = roundData; }, [roundData]);
    useEffect(() => { currentServerIdRef.current = currentServerId; }, [currentServerId]);

    // Image preloading state
    const [isPreloading, setIsPreloading] = useState(false);
    const preloadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

    // Loading progress state (per-player)
    const [playerLoadProgress, setPlayerLoadProgress] = useState<Map<string, number>>(new Map());
    const [playerLoadComplete, setPlayerLoadComplete] = useState<Map<string, boolean>>(new Map());
    const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const fakeProgressRef = useRef<NodeJS.Timeout | null>(null);
    const myLoadCompleteRef = useRef(false);

    // ==================== MUSIC MAP & TRANSLATIONS ====================

    const musicMap = useMemo(() => new Map(musics.map(m => [m.id, m])), [musics]);

    const getCnTitle = useCallback((jpTitle: string) => {
        return translations?.music?.title?.[jpTitle] ?? "";
    }, [translations]);

    const getDisplayTitle = useCallback((music: IMusicInfo) => {
        return { jp: music.title, cn: getCnTitle(music.title) };
    }, [getCnTitle]);

    // ==================== LOAD MUSIC DATA ====================

    const loadMusics = useCallback(async () => {
        setMusicsLoading(true);
        setLoadError("");
        try {
            const [data, translationsData] = await Promise.all([
                fetchMasterDataForServer<IMusicInfo[]>(gameSettings.server, "musics.json"),
                loadTranslations(),
            ]);
            const validMusics = data.filter(m => Boolean(m.assetbundleName && m.title && m.id > 0));
            setMusics(validMusics);
            setTranslations(translationsData);
        } catch (e) {
            console.error("Failed to load musics", e);
            setLoadError(t("page.guessJacket.common.errors.musicLoadFailed"));
        } finally {
            setMusicsLoading(false);
        }
    }, [gameSettings.server, t]);

    useEffect(() => { loadMusics(); }, [loadMusics]);

    // ==================== LATENCY TESTING ====================

    const testAllLatencies = useCallback(async () => {
        setIsTestingLatency(true);
        try {
            const results = await measureAllLatencies();
            setServerLatencies(results);
            let bestServerId = "tokyo-1";
            let minLatency = 9999;
            results.forEach((latency, id) => {
                if (latency > 0 && latency < minLatency) {
                    minLatency = latency;
                    bestServerId = id;
                }
            });
            setSelectedServerId(bestServerId);
        } catch (e) {
            console.warn("Latency test failed:", e);
        } finally {
            setIsTestingLatency(false);
        }
    }, []);

    useEffect(() => {
        if (phase === "lobby") testAllLatencies();
    }, [phase, testAllLatencies]);

    // ==================== CHANNEL SETUP ====================

    const setupChannel = useCallback((code: string, serverId?: string) => {
        const sid = serverId || currentServerIdRef.current;
        const client = getSupabaseClient(sid);
        if (channelRef.current) {
            client.removeChannel(channelRef.current);
        }

        const channel = client.channel(`room-${code}`, {
            config: { broadcast: { self: true } },
        });

        channel.on("broadcast", { event: "player_join" }, ({ payload }) => {
            setPlayers(prev => {
                if (prev.find(p => p.id === payload.id)) return prev;
                const newPlayer: PlayerState = {
                    id: payload.id,
                    characterId: payload.characterId,
                    slot: prev.length + 1,
                    isHost: false,
                    hp: INITIAL_HP,
                    blockBar: 0,
                    attempts: 0,
                    guessedCorrectly: false,
                    guessOrder: 0,
                    eliminated: false,
                    eliminatedRound: -1,
                    reviveCount: 0,
                };
                return [...prev, newPlayer];
            });
        });

        channel.on("broadcast", { event: "player_leave" }, ({ payload }) => {
            setPlayers(prev => prev.filter(p => p.id !== payload.id));
        });

        channel.on("broadcast", { event: "game_start" }, ({ payload }) => {
            const settings = payload.settings as MultiplayerSettings;
            const seed = payload.seed as string;
            const allMusics = musicsRef.current;
            setActiveSettings(settings);
            activeSettingsRef.current = settings;

            const filtered = allMusics.filter(m => Boolean(m.assetbundleName && m.title && m.id > 0));

            const random = new SeededRandom(seed);
            const shuffled = [...filtered].sort(() => random.next() - 0.5);
            const deck = shuffled.slice(0, MAX_ROUNDS);

            setGameDeck(deck);
            gameDeckRef.current = deck;
            setCurrentRound(0);
            currentRoundRef.current = 0;
            setPlayers(prev => prev.map(p => ({
                ...p,
                hp: INITIAL_HP,
                blockBar: 0,
                attempts: 0,
                guessedCorrectly: false,
                guessOrder: 0,
                eliminated: false,
                eliminatedRound: -1,
                isDying: false,
                reviveCount: 0,
            })));
            setPlayerLoadProgress(new Map());
            setPlayerLoadComplete(new Map());
            myLoadCompleteRef.current = false;
            setPhase("playing");
            setIsPreloading(true);
        });

        channel.on("broadcast", { event: "round_start" }, ({ payload }) => {
            const rd = payload.roundData as RoundData;
            setIsPreloading(false);
            setRoundData(rd);
            roundDataRef.current = rd;
            setCurrentRound(rd.roundIndex);
            currentRoundRef.current = rd.roundIndex;
            setTimeLeft(activeSettingsRef.current.timeLimit);
            timeLeftRef.current = activeSettingsRef.current.timeLimit;
            setIsRoundActive(true);
            isRoundActiveRef.current = true;
            setMyGuessed(false);
            myGuessedRef.current = false;
            setGuessCount(0);
            guessCountRef.current = 0;
            setDisabledOptionIds([]);
            setCurrentDistortions(rd.distortions || []);
            setPlayers(prev => prev.map(p => ({
                ...p,
                attempts: 0,
                guessedCorrectly: false,
                guessOrder: 0,
            })));
            roundKillDamageRef.current.clear();
            loadRoundImage(rd);
        });

        channel.on("broadcast", { event: "guess_result" }, ({ payload }) => {
            const { playerId, isCorrect, guessedMusicId, newPlayers, guessOrder: order, killInfo, blockInfo, hpChanges: changes } = payload;
            if (newPlayers) {
                setPlayers(newPlayers);
                playersRef.current = newPlayers;
            }
            if (order) {
                setGuessCount(order);
                guessCountRef.current = order;
            }

            if (changes && Array.isArray(changes)) {
                const floats: FloatingHpChange[] = changes.map((c: { playerId: string; amount: number; type: string }) => ({
                    id: Math.random().toString(36),
                    playerId: c.playerId,
                    amount: c.amount,
                    type: c.type as FloatingHpChange["type"],
                }));
                setFloatingHpChanges(prev => [...prev, ...floats]);
                setTimeout(() => {
                    setFloatingHpChanges(prev => prev.filter(f => !floats.find(fl => fl.id === f.id)));
                }, 2000);
            }

            if (!isCorrect && playerId) {
                // Track wrong guess to disable that option
                if (guessedMusicId && playerId === mySessionId) {
                    setDisabledOptionIds(prev => [...prev, guessedMusicId]);
                }

                const wrongFloat: FloatingHpChange = {
                    id: Math.random().toString(36),
                    playerId,
                    amount: -(ATTEMPT_PENALTY * getRoundMultiplier(currentRoundRef.current)),
                    type: "wrong",
                };
                setFloatingHpChanges(prev => [...prev, wrongFloat]);
                setTimeout(() => {
                    setFloatingHpChanges(prev => prev.filter(f => f.id !== wrongFloat.id));
                }, 2000);

                if (playerId === mySessionId) {
                    setWrongGuessShake(true);
                    setTimeout(() => setWrongGuessShake(false), 500);
                }
            }

            if (killInfo) {
                const killerName = getCharacterName(t, killInfo.killerCharId);
                setKillNotify(t("page.guessJacket.multiplayer.killNotify", { name: killerName }));
                setTimeout(() => setKillNotify(""), 3000);
            }
            if (blockInfo && blockInfo.playerId === mySessionId) {
                setKillNotify(t("page.guessJacket.multiplayer.blockNotify"));
                setTimeout(() => setKillNotify(""), 2000);
            }

            if (playerId === mySessionId && isCorrect) {
                setMyGuessed(true);
                myGuessedRef.current = true;
            }
        });

        channel.on("broadcast", { event: "round_end" }, ({ payload }) => {
            setIsRoundActive(false);
            isRoundActiveRef.current = false;
            if (timerRef.current) clearInterval(timerRef.current);
            const { music, newPlayers } = payload;
            if (newPlayers) {
                setPlayers(newPlayers);
                playersRef.current = newPlayers;
            }
            if (music) {
                setFeedbackMusic(music);
            }
            const me = (newPlayers || playersRef.current).find((p: PlayerState) => p.id === mySessionId);
            setFeedbackCorrect(me?.guessedCorrectly || false);
            setShowFeedback(true);
        });

        channel.on("broadcast", { event: "next_round" }, ({ payload }) => {
            setShowFeedback(false);
            setFeedbackMusic(null);
            if (payload.newPlayers) {
                setPlayers(payload.newPlayers);
                playersRef.current = payload.newPlayers;
            }
        });

        channel.on("broadcast", { event: "game_over" }, ({ payload }) => {
            setIsRoundActive(false);
            isRoundActiveRef.current = false;
            if (timerRef.current) clearInterval(timerRef.current);
            setShowFeedback(false);
            if (payload.finalPlayers) {
                setPlayers(payload.finalPlayers);
            }
            setPhase("result");
        });

        channel.on("broadcast", { event: "return_to_room" }, () => {
            setPhase("room");
            setShowFeedback(false);
            setFeedbackMusic(null);
            setIsRoundActive(false);
            isRoundActiveRef.current = false;
            setPlayers(prev => prev.map(p => ({
                ...p,
                hp: INITIAL_HP,
                blockBar: 0,
                attempts: 0,
                guessedCorrectly: false,
                guessOrder: 0,
                eliminated: false,
                eliminatedRound: -1,
                isDying: false,
                reviveCount: 0,
            })));
            setFloatingHpChanges([]);
        });

        channel.on("broadcast", { event: "loading_progress" }, ({ payload }) => {
            const { playerId, progress } = payload as { playerId: string; progress: number };
            setPlayerLoadProgress(prev => {
                const next = new Map(prev);
                next.set(playerId, Math.max(next.get(playerId) || 0, progress));
                return next;
            });
        });

        channel.on("broadcast", { event: "loading_complete" }, ({ payload }) => {
            const { playerId } = payload as { playerId: string };
            setPlayerLoadProgress(prev => {
                const next = new Map(prev);
                next.set(playerId, 100);
                return next;
            });
            setPlayerLoadComplete(prev => {
                const next = new Map(prev);
                next.set(playerId, true);
                return next;
            });
        });

        channel.on("broadcast", { event: "sticker" }, ({ payload }) => {
            const { playerId, stickerNum } = payload;
            setActiveStickers(prev => {
                const next = new Map(prev);
                next.set(playerId, {
                    id: Math.random().toString(36),
                    stickerNum,
                    expiresAt: Date.now() + 3000,
                });
                return next;
            });

            setTimeout(() => {
                setActiveStickers(prev => {
                    const next = new Map(prev);
                    const sticker = next.get(playerId);
                    if (sticker && sticker.expiresAt <= Date.now() + 100) {
                        next.delete(playerId);
                    }
                    return next;
                });
            }, 3000);
        });

        channel.on("broadcast", { event: "player_guess" }, ({ payload }) => {
            if (!isHostRef.current) return;

            const { playerId, musicId, timeLeft: guessTimeLeft } = payload as {
                playerId: string;
                musicId: number;
                timeLeft: number;
            };

            const rd = roundDataRef.current;
            if (!rd) return;

            const isCorrect = musicId === rd.musicId;
            const roundMult = getRoundMultiplier(currentRoundRef.current);

            const updatedPlayers = [...playersRef.current];
            const playerIdx = updatedPlayers.findIndex(p => p.id === playerId);
            if (playerIdx === -1) return;

            const player = { ...updatedPlayers[playerIdx] };
            if (player.guessedCorrectly || player.eliminated) return;
            const isDead = player.hp <= 0 && !player.isDying;

            player.attempts += 1;

            if (!isCorrect) {
                if (!isDead) {
                    player.hp -= ATTEMPT_PENALTY * roundMult;
                }
                updatedPlayers[playerIdx] = player;

                channelRef.current?.send({
                    type: "broadcast",
                    event: "guess_result",
                    payload: {
                        playerId,
                        isCorrect: false,
                        guessedMusicId: musicId,
                        newPlayers: updatedPlayers,
                    },
                });
                playersRef.current = updatedPlayers;
                return;
            }

            // Correct guess!
            const newGuessOrder = guessCountRef.current + 1;
            player.guessedCorrectly = true;
            player.guessOrder = newGuessOrder;

            const isFirstAttemptCorrect = player.attempts === 1;
            const hpChanges: { playerId: string; amount: number; type: string }[] = [];
            const tl = guessTimeLeft as number;

            // Last Stand Recovery
            if (player.isDying) {
                if (isFirstAttemptCorrect) {
                    // Calculate revival HP: lowest positive HP among all players, capped at 200
                    const aliveHps = updatedPlayers
                        .filter(p => p.id !== playerId && !p.eliminated && p.hp > 0)
                        .map(p => p.hp);
                    const reviveHp = aliveHps.length > 0 ? Math.min(Math.min(...aliveHps), 200) : 200;
                    player.isDying = false;
                    player.hp = reviveHp;
                    player.reviveCount = (player.reviveCount || 0) + 1;
                    hpChanges.push({ playerId, amount: reviveHp, type: "block" });
                }
            }
            // Kill mechanic
            else if (isFirstAttemptCorrect && !isDead) {
                const previousKills = updatedPlayers.filter(p => p.id !== playerId && p.guessedCorrectly && p.attempts === 1).length;
                const killCoeffs = [1.0, 0.4, 0.1];
                const killCoeff = killCoeffs[Math.min(previousKills, killCoeffs.length - 1)];
                const killBase = roundMult * (tl + 20) * killCoeff * 6;

                const unansweredPlayers = updatedPlayers.filter(p => p.id !== playerId && !p.eliminated && !p.guessedCorrectly);

                unansweredPlayers.forEach(op => {
                    const opIdx = updatedPlayers.findIndex(p => p.id === op.id);
                    if (opIdx !== -1) {
                        const blocked = Math.min(updatedPlayers[opIdx].blockBar, killBase);
                        const actualDamage = killBase - blocked;
                        updatedPlayers[opIdx] = {
                            ...updatedPlayers[opIdx],
                            hp: updatedPlayers[opIdx].hp - actualDamage,
                            blockBar: updatedPlayers[opIdx].blockBar - blocked,
                        };
                        const prevKillDmg = roundKillDamageRef.current.get(op.id) || 0;
                        roundKillDamageRef.current.set(op.id, prevKillDmg + actualDamage);
                        hpChanges.push({ playerId: op.id, amount: -actualDamage, type: "kill" });
                        if (blocked > 0) {
                            hpChanges.push({ playerId: op.id, amount: blocked, type: "block" });
                        }
                    }
                });
            }

            // Block bar
            if (!player.isDying && !isDead) {
                const attemptCoeffs = [1.0, 0.5, 0.25];
                const attemptCoeff = attemptCoeffs[Math.min(player.attempts - 1, attemptCoeffs.length - 1)];
                const blockAmount = (tl + 20) * 2.5 * attemptCoeff;
                player.blockBar += blockAmount;

                const killDmgTaken = roundKillDamageRef.current.get(playerId) || 0;
                if (killDmgTaken > 0 && blockAmount > 0) {
                    const healAmount = Math.min(blockAmount, killDmgTaken);
                    player.hp += healAmount;
                    player.blockBar -= healAmount;
                    roundKillDamageRef.current.set(playerId, killDmgTaken - healAmount);
                    hpChanges.push({ playerId, amount: healAmount, type: "block" });
                }
            }

            updatedPlayers[playerIdx] = player;

            channelRef.current?.send({
                type: "broadcast",
                event: "guess_result",
                payload: {
                    playerId,
                    isCorrect: true,
                    newPlayers: updatedPlayers,
                    guessOrder: newGuessOrder,
                    killInfo: (isFirstAttemptCorrect && !player.isDying && !isDead) ? { killerCharId: player.characterId } : undefined,
                    hpChanges: hpChanges.length > 0 ? hpChanges : undefined,
                    blockInfo: (player.blockBar > 0) ? { playerId, amount: player.blockBar } : undefined,
                },
            });

            playersRef.current = updatedPlayers;
            guessCountRef.current = newGuessOrder;

            // Check if all active players have guessed
            const activePlayers = updatedPlayers.filter(p => !p.eliminated);
            const allGuessed = activePlayers.every(p => p.guessedCorrectly);
            if (allGuessed) {
                const music = gameDeckRef.current[currentRoundRef.current];
                channelRef.current?.send({
                    type: "broadcast",
                    event: "round_end",
                    payload: { music, newPlayers: updatedPlayers },
                });

                const feedbackTimeout = setTimeout(() => {
                    advanceGame(updatedPlayers);
                }, FEEDBACK_DURATION);
                feedbackTimerRef.current = feedbackTimeout;
            }
        });

        channel.on("broadcast", { event: "settings_update" }, ({ payload }) => {
            if (!isHostRef.current) {
                setGameSettings(payload.settings);
            }
        });

        channel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
                console.log("Subscribed to room channel:", code);
            }
        });

        channelRef.current = channel;
        return channel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mySessionId, t]);

    // Broadcast settings when player joins (if host)
    useEffect(() => {
        if (isHost && phase === "room" && channelRef.current) {
            const timer = setTimeout(() => {
                channelRef.current?.send({
                    type: "broadcast",
                    event: "settings_update",
                    payload: { settings: gameSettings },
                });
            }, 1000);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [players.length, isHost, phase]);

    const updateGameSettings = useCallback((newSettings: MultiplayerSettings | ((prev: MultiplayerSettings) => MultiplayerSettings)) => {
        setGameSettings(prev => {
            const next = typeof newSettings === "function" ? newSettings(prev) : newSettings;
            if (isHostRef.current && phase === "room") {
                channelRef.current?.send({
                    type: "broadcast",
                    event: "settings_update",
                    payload: { settings: next },
                });
            }
            return next;
        });
    }, [phase]);

    // ==================== CLEANUP ON UNMOUNT ====================
    useEffect(() => {
        return () => {
            if (channelRef.current) {
                const client = getSupabaseClient(currentServerIdRef.current);
                client.removeChannel(channelRef.current);
            }
            if (timerRef.current) clearInterval(timerRef.current);
            if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        };
    }, []);

    // ==================== IMAGE PRELOADING ====================

    useEffect(() => {
        if (phase === "playing" && isPreloading && gameDeckRef.current.length > 0) {
            let fakeProgress = 0;
            const fakeInterval = setInterval(() => {
                if (myLoadCompleteRef.current) {
                    clearInterval(fakeInterval);
                    return;
                }
                fakeProgress = Math.min(85, fakeProgress + 2 + Math.random() * 3);
                channelRef.current?.send({
                    type: "broadcast",
                    event: "loading_progress",
                    payload: { playerId: mySessionId, progress: Math.floor(fakeProgress) },
                });
            }, 150);
            fakeProgressRef.current = fakeInterval;

            const music = gameDeckRef.current[0];
            const assetSource = getAssetSourceForServer(activeSettingsRef.current.server);
            const url = getMusicJacketUrl(music.assetbundleName, assetSource);

            const onComplete = (img?: HTMLImageElement) => {
                if (myLoadCompleteRef.current) return;
                myLoadCompleteRef.current = true;
                clearInterval(fakeInterval);
                if (img) preloadedImagesRef.current.set(url, img);
                channelRef.current?.send({
                    type: "broadcast",
                    event: "loading_progress",
                    payload: { playerId: mySessionId, progress: 100 },
                });
                channelRef.current?.send({
                    type: "broadcast",
                    event: "loading_complete",
                    payload: { playerId: mySessionId },
                });
            };

            if (preloadedImagesRef.current.has(url)) {
                onComplete(preloadedImagesRef.current.get(url)!);
            } else {
                const img = new window.Image();
                img.crossOrigin = "anonymous";
                img.onload = () => onComplete(img);
                img.onerror = () => onComplete();
                img.src = url;
            }

            const safetyTimeout = setTimeout(() => {
                if (isHostRef.current) {
                    setIsPreloading(false);
                    setTimeout(() => startRound(0), 300);
                }
            }, 10000);
            loadingTimeoutRef.current = safetyTimeout;

            return () => {
                clearInterval(fakeInterval);
                clearTimeout(safetyTimeout);
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, isPreloading, mySessionId]);

    // Host: check if all players have finished loading
    useEffect(() => {
        if (!isPreloading || !isHost) return;
        const allLoaded = players.length > 0 && players.every(p => playerLoadComplete.get(p.id));
        if (allLoaded) {
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
            }
            const startDelay = setTimeout(() => {
                setIsPreloading(false);
                setTimeout(() => startRound(0), 300);
            }, 1000);
            return () => clearTimeout(startDelay);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPreloading, isHost, players, playerLoadComplete]);

    // Safety: re-draw canvas after preloading screen is dismissed
    useEffect(() => {
        if (!isPreloading && roundData && imageRef.current && canvasRef.current) {
            drawCanvas(imageRef.current, roundData);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPreloading, roundData]);

    // ==================== CANVAS RENDERING ====================

    const loadRoundImage = useCallback((rd: RoundData) => {
        const assetSource = getAssetSourceForServer(activeSettingsRef.current.server);
        const url = getMusicJacketUrl(rd.assetbundleName, assetSource);
        const cachedImg = preloadedImagesRef.current.get(url);
        if (cachedImg) {
            imageRef.current = cachedImg;
            drawCanvas(cachedImg, rd);
        } else {
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                imageRef.current = img;
                preloadedImagesRef.current.set(url, img);
                drawCanvas(img, rd);
            };
            img.onerror = () => {
                console.error("Failed to load jacket image for round", rd.roundIndex);
            };
            img.src = url;
        }

        // Background prefetch next round
        const nextIndex = rd.roundIndex + 1;
        const nextMusic = gameDeckRef.current[nextIndex];
        if (nextMusic) {
            const nextUrl = getMusicJacketUrl(nextMusic.assetbundleName, assetSource);
            if (!preloadedImagesRef.current.has(nextUrl)) {
                const prefetchImg = new window.Image();
                prefetchImg.crossOrigin = "anonymous";
                prefetchImg.onload = () => {
                    preloadedImagesRef.current.set(nextUrl, prefetchImg);
                };
                prefetchImg.src = nextUrl;
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const drawCanvas = useCallback((img: HTMLImageElement, rd: RoundData) => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const ctx = cvs.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        cvs.width = 300;
        cvs.height = 300;
        ctx.clearRect(0, 0, cvs.width, cvs.height);

        const distortions = rd.distortions || [];

        ctx.save();

        let filterString = "";
        const hasFlipH = distortions.some(d => d.type === "flip-h");
        const hasFlipV = distortions.some(d => d.type === "flip-v");
        const hasGrayscale = distortions.some(d => d.type === "grayscale");
        const hasInvert = distortions.some(d => d.type === "invert");
        const hasHueRotate = distortions.some(d => d.type === "hue-rotate");
        const hasRgbShuffle = distortions.some(d => d.type === "rgb-shuffle");

        if (hasGrayscale) filterString += "grayscale(100%) ";
        if (hasInvert) filterString += "invert(100%) ";
        if (hasHueRotate) filterString += "hue-rotate(180deg) ";
        if (filterString) ctx.filter = filterString.trim();

        if (hasFlipH || hasFlipV) {
            ctx.translate(cvs.width / 2, cvs.height / 2);
            ctx.scale(hasFlipH ? -1 : 1, hasFlipV ? -1 : 1);
            ctx.translate(-cvs.width / 2, -cvs.height / 2);
        }

        ctx.drawImage(
            img,
            rd.cropX, rd.cropY, rd.cropSize, rd.cropSize,
            0, 0, cvs.width, cvs.height
        );

        ctx.restore();

        if (hasRgbShuffle) {
            const imageData = ctx.getImageData(0, 0, cvs.width, cvs.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                data[i] = g;
                data[i + 1] = b;
                data[i + 2] = r;
            }
            ctx.putImageData(imageData, 0, 0);
        }
    }, []);

    // ==================== TIMER ====================
    useEffect(() => {
        if (!isRoundActive) return;

        if (timerRef.current) clearInterval(timerRef.current);

        // timeLeftRef carries the countdown so the host's round-end broadcast can
        // run here rather than inside a setState updater, which React may replay.
        const interval = setInterval(() => {
            const newTime = Math.max(0, timeLeftRef.current - 0.1);
            timeLeftRef.current = newTime;
            setTimeLeft(newTime);

            if (newTime <= 0 && isHostRef.current) {
                clearInterval(interval);
                hostProcessTimeout();
            }
        }, 100);

        timerRef.current = interval;

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRoundActive]);

    // ==================== HOST GAME LOGIC ====================

    const hostProcessTimeout = useCallback(() => {
        const roundMult = getRoundMultiplier(currentRoundRef.current);
        const updatedPlayers = playersRef.current.map(p => {
            if (p.eliminated || p.guessedCorrectly) return p;
            if (p.isDying) return p;
            return { ...p, hp: p.hp - TIMEOUT_PENALTY * roundMult };
        });

        const music = gameDeckRef.current[currentRoundRef.current];
        channelRef.current?.send({
            type: "broadcast",
            event: "round_end",
            payload: { music, newPlayers: updatedPlayers },
        });

        const feedbackTimeout = setTimeout(() => {
            advanceGame(updatedPlayers);
        }, FEEDBACK_DURATION);
        feedbackTimerRef.current = feedbackTimeout;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const advanceGame = useCallback((currentPlayers: PlayerState[]) => {
        const roundIdx = currentRoundRef.current;
        const updatedElim = currentPlayers.map(p => {
            if (p.eliminated) return p;

            if (p.isDying) {
                if (p.hp > 0) {
                    return { ...p, isDying: false };
                } else {
                    return { ...p, eliminated: true, eliminatedRound: roundIdx, isDying: false };
                }
            }

            if (p.hp <= 0) {
                // Max 2 revives; if already used up, eliminate directly
                if ((p.reviveCount || 0) >= 2) {
                    return { ...p, eliminated: true, eliminatedRound: roundIdx, hp: 0 };
                }
                return { ...p, isDying: true };
            }

            return p;
        });

        const activePlayers = updatedElim.filter(p => !p.eliminated);

        if (activePlayers.length <= 1 || roundIdx >= MAX_ROUNDS - 1) {
            channelRef.current?.send({
                type: "broadcast",
                event: "game_over",
                payload: { finalPlayers: updatedElim },
            });
            return;
        }

        const nextRound = currentRoundRef.current + 1;
        playersRef.current = updatedElim;
        channelRef.current?.send({
            type: "broadcast",
            event: "next_round",
            payload: { newPlayers: updatedElim },
        });

        setTimeout(() => startRound(nextRound), 500);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startRound = useCallback((roundIndex: number) => {
        const music = gameDeckRef.current[roundIndex];
        if (!music) return;

        const assetSource = getAssetSourceForServer(activeSettingsRef.current.server);
        const url = getMusicJacketUrl(music.assetbundleName, assetSource);
        const cachedImg = preloadedImagesRef.current.get(url);

        const diff = activeSettingsRef.current.difficulty;
        const cropSize = getCropSize(diff);

        const random = new SeededRandom(music.assetbundleName + roundIndex);

        const buildAndBroadcast = (img: HTMLImageElement | null) => {
            let cropX = 0, cropY = 0;
            if (img) {
                const maxX = Math.max(0, img.width - cropSize);
                const maxY = Math.max(0, img.height - cropSize);
                cropX = Math.floor(random.next() * maxX);
                cropY = Math.floor(random.next() * maxY);
            } else {
                cropX = Math.floor(random.next() * 800);
                cropY = Math.floor(random.next() * 600);
            }

            // Extreme Mode: generate random distortions
            let distortions: ActiveDistortion[] | undefined;
            if (diff === "extreme") {
                const numDistortions = Math.floor(random.next() * 3) + 1;
                const effects = random.pickMultiple(DISTORTION_POOL, numDistortions);
                const activeEffects = effects.filter(e => e.type !== "none");
                if (activeEffects.length > 0) {
                    distortions = activeEffects;
                }
            }

            // Generate options
            const optCount = activeSettingsRef.current.optionsCount;
            const allMusics = musicsRef.current.filter(m => Boolean(m.assetbundleName && m.title && m.id > 0));
            const optionRandom = new SeededRandom(`options-${roundIndex}-${music.id}`);
            const distractors = optionRandom.pickMultiple(
                allMusics.filter(m => m.id !== music.id),
                optCount - 1
            );
            const allOptions = optionRandom.pickMultiple([...distractors, music], optCount);
            const optionIds = allOptions.map(m => m.id);

            const rd: RoundData = {
                roundIndex,
                musicId: music.id,
                assetbundleName: music.assetbundleName,
                cropX,
                cropY,
                cropSize,
                distortions,
                optionIds,
            };

            channelRef.current?.send({
                type: "broadcast",
                event: "round_start",
                payload: { roundData: rd },
            });
        };

        if (cachedImg) {
            buildAndBroadcast(cachedImg);
        } else {
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                preloadedImagesRef.current.set(url, img);
                buildAndBroadcast(img);
            };
            img.onerror = () => {
                buildAndBroadcast(null);
            };
            img.src = url;
        }
    }, []);

    const handleGuess = useCallback((musicId: number) => {
        const me = playersRef.current.find(p => p.id === mySessionId);
        if (!isRoundActiveRef.current || myGuessedRef.current || !roundDataRef.current || (me && me.eliminated)) return;

        channelRef.current?.send({
            type: "broadcast",
            event: "player_guess",
            payload: {
                playerId: mySessionId,
                musicId,
                timeLeft: timeLeftRef.current,
            },
        });
    }, [mySessionId]);

    // ==================== ROOM ACTIONS ====================

    const handleCreateRoom = async () => {
        setError("");
        const code = generateRoomCode();
        const hostPlayer: RoomPlayer = {
            id: mySessionId,
            characterId: myCharId,
            slot: 1,
            isHost: true,
        };

        const room = await createRoom(code, hostPlayer, selectedServerId);
        if (!room) {
            setError(t("page.guessJacket.multiplayer.errors.createRoomFailed"));
            return;
        }

        setRoomId(room.id);
        setRoomCode(code);
        setCurrentServerId(selectedServerId);
        currentServerIdRef.current = selectedServerId;
        setIsHost(true);
        isHostRef.current = true;

        const myPlayer: PlayerState = {
            id: mySessionId,
            characterId: myCharId,
            slot: 1,
            isHost: true,
            hp: INITIAL_HP,
            blockBar: 0,
            attempts: 0,
            guessedCorrectly: false,
            guessOrder: 0,
            eliminated: false,
            eliminatedRound: -1,
            reviveCount: 0,
        };
        setPlayers([myPlayer]);

        setupChannel(code, selectedServerId);
        setPhase("room");
    };

    const handleJoinRoom = async () => {
        setError("");
        if (!joinCode.trim()) {
            setError(t("page.guessJacket.multiplayer.errors.roomCodeRequired"));
            return;
        }

        try {
            const serverParam = searchParams.get("server");
            let foundRoom: { room: RoomRecord; serverId: string } | null = null;

            if (serverParam) {
                const room = await findRoom(joinCode.trim(), serverParam);
                if (room) foundRoom = { room, serverId: serverParam };
            }

            if (!foundRoom) {
                foundRoom = await findRoomAcrossServers(joinCode.trim());
            }

            if (!foundRoom) {
                setError(t("page.guessJacket.multiplayer.errors.roomNotFound"));
                return;
            }

            const { room, serverId: foundServerId } = foundRoom;

            let currentPlayers: RoomPlayer[] = [];
            if (Array.isArray(room.players)) {
                currentPlayers = room.players;
            } else if (typeof room.players === 'string') {
                try {
                    currentPlayers = JSON.parse(room.players);
                } catch (e) {
                    console.error("Failed to parse room.players:", e);
                    currentPlayers = [];
                }
            } else {
                currentPlayers = [];
            }

            if (room.status !== "waiting") {
                setError(t("page.guessJacket.multiplayer.errors.gameAlreadyStarted"));
                return;
            }

            if (currentPlayers.length >= MAX_PLAYERS) {
                setError(t("page.guessJacket.multiplayer.errors.roomFull"));
                return;
            }

            const charTaken = currentPlayers.some((p: RoomPlayer) => Number(p.characterId) === Number(myCharId));
            if (charTaken) {
                setError(t("page.guessJacket.multiplayer.errors.characterTaken"));
                return;
            }

            const newPlayer: RoomPlayer = {
                id: mySessionId,
                characterId: myCharId,
                slot: currentPlayers.length + 1,
                isHost: false,
            };

            const updated = await updateRoomPlayers(room.id, [...currentPlayers, newPlayer], foundServerId);
            if (!updated) {
                setError(t("page.guessJacket.multiplayer.errors.joinRoomFailed"));
                return;
            }

            setRoomId(room.id);
            setRoomCode(room.code);
            setCurrentServerId(foundServerId);
            currentServerIdRef.current = foundServerId;
            setIsHost(false);
            isHostRef.current = false;

            const myPlayer: PlayerState = {
                id: mySessionId,
                characterId: myCharId,
                slot: currentPlayers.length + 1,
                isHost: false,
                hp: INITIAL_HP,
                blockBar: 0,
                attempts: 0,
                guessedCorrectly: false,
                guessOrder: 0,
                eliminated: false,
                eliminatedRound: -1,
                reviveCount: 0,
            };

            const initialPlayers: PlayerState[] = currentPlayers.map((p: RoomPlayer) => ({
                id: p.id,
                characterId: p.characterId,
                slot: p.slot,
                isHost: p.isHost,
                hp: INITIAL_HP,
                blockBar: 0,
                attempts: 0,
                guessedCorrectly: false,
                guessOrder: 0,
                eliminated: false,
                eliminatedRound: -1,
                reviveCount: 0,
            }));

            setPlayers([...initialPlayers, myPlayer]);

            const channel = setupChannel(room.code, foundServerId);

            setTimeout(() => {
                channel?.send({
                    type: "broadcast",
                    event: "player_join",
                    payload: { id: mySessionId, characterId: myCharId },
                });
            }, 500);

            setPhase("room");
        } catch (e) {
            console.error("Join room exception:", e);
            setError(t("page.guessJacket.multiplayer.errors.joinRoomException"));
        }
    };

    const handleStartGame = async () => {
        if (!isHost || players.length < 2) return;

        const seed = roomCode + Date.now().toString();

        const filtered = musics.filter(m => Boolean(m.assetbundleName && m.title && m.id > 0));

        const requiredPoolSize = Math.max(MAX_ROUNDS, gameSettings.optionsCount);
        if (filtered.length < requiredPoolSize) {
            setError(t("page.guessJacket.multiplayer.errors.deckInsufficient", { count: filtered.length }));
            return;
        }

        updateRoomStatus(roomId, "playing", currentServerId);

        channelRef.current?.send({
            type: "broadcast",
            event: "game_start",
            payload: { seed, settings: gameSettings },
        });
    };

    const handleLeaveRoom = async () => {
        if (channelRef.current) {
            channelRef.current.send({
                type: "broadcast",
                event: "player_leave",
                payload: { id: mySessionId },
            });
            const client = getSupabaseClient(currentServerIdRef.current);
            client.removeChannel(channelRef.current);
            channelRef.current = null;
        }
        if (isHost && roomId) {
            await deleteRoom(roomId, currentServerId);
        }
        setPhase("lobby");
        setRoomCode("");
        setRoomId("");
        setPlayers([]);
        setIsHost(false);
    };

    // ==================== STICKER & SKIP ====================

    const sendSticker = useCallback((stickerNum: number) => {
        channelRef.current?.send({
            type: "broadcast",
            event: "sticker",
            payload: {
                playerId: mySessionId,
                stickerNum,
            },
        });
        setShowStickerPicker(false);
    }, [mySessionId]);

    const handleSkipFeedback = useCallback(() => {
        setShowFeedback(false);
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        if (isHostRef.current) {
            channelRef.current?.send({
                type: "broadcast",
                event: "next_round",
                payload: {},
            });
            setTimeout(() => {
                advanceGame(playersRef.current);
            }, 300);
        }
    }, [advanceGame]);

    // ==================== MEMOS ====================

    const _takenCharIds = useMemo(() => {
        if (phase !== "room") return new Set<number>();
        return new Set(players.filter(p => p.id !== mySessionId).map(p => p.characterId));
    }, [players, phase, mySessionId]);

    const getServerLabel = useCallback((server: ServerScope) => t(`page.guessJacket.common.serverLabels.${server}`), [t]);
    const getServerShortLabel = useCallback((server: ServerScope) => t(`page.guessJacket.common.serverLabels.${server}Short`), [t]);
    const getDifficultyLabel = useCallback((difficulty: Difficulty) => t(`page.guessJacket.common.difficultyLabels.${difficulty}`), [t]);
    const getDistortionLabel = useCallback((distortion: ActiveDistortion) => t(`page.guessJacket.common.distortions.${DISTORTION_LABEL_KEYS[distortion.type]}`), [t]);
    const getLocalizedMusicTitle = useCallback((jpTitle: string) => getCnTitle(jpTitle) || t("page.guessJacket.common.noTranslation"), [getCnTitle, t]);

    const rankedPlayers = useMemo(() => {
        return [...players].sort((a, b) => {
            const aAlive = a.hp > 0;
            const bAlive = b.hp > 0;
            if (aAlive && !bAlive) return -1;
            if (!aAlive && bAlive) return 1;
            if (aAlive && bAlive) return b.hp - a.hp;
            return (b.eliminatedRound ?? -1) - (a.eliminatedRound ?? -1);
        });
    }, [players]);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const myPlayer = players.find(p => p.id === mySessionId);

    // ========== LOBBY PHASE ==========
    if (phase === "lobby") {
        return (
            <div className="mp-container">
                <button className="mp-back-btn" onClick={() => router.push(localizePathForBrowser("/guess-jacket/"))} title={t("page.guessJacket.multiplayer.backTitle")}>
                    ←
                </button>
                <div className="mp-lobby">
                    <div className="mp-lobby-header">
                        <div className="mp-lobby-title">{t("page.guessJacket.multiplayer.lobbyTitle")}</div>
                        <div className="mp-lobby-subtitle">{t("page.guessJacket.multiplayer.lobbySubtitle")}</div>
                    </div>

                    {/* Character Selection */}
                    <div className="mp-card">
                        <div className="mp-card-title">{t("page.guessJacket.multiplayer.chooseCharacter")}</div>
                        <div className="mp-char-grid">
                            {PLAYABLE_CHARACTER_IDS.map((id) => {
                                const name = getCharacterName(t, id);
                                return (
                                    <button
                                        key={id}
                                        className={`mp-char-btn ${myCharId === id ? "selected" : ""}`}
                                        onClick={() => setMyCharId(id)}
                                        title={name}
                                    >
                                        <Image src={getCharacterIconUrl(id)} alt={name} fill sizes="48px" unoptimized />
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ textAlign: "center", marginTop: "0.5rem", fontSize: "0.875rem", color: "#94a3b8" }}>
                            {t("page.guessJacket.multiplayer.currentCharacter")} <strong style={{ color: themeColor }}>{getCharacterName(t, myCharId)}</strong>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="mp-tabs">
                        <button
                            className={`mp-tab ${lobbyTab === "create" ? "active" : ""}`}
                            onClick={() => setLobbyTab("create")}
                        >
                            {t("page.guessJacket.multiplayer.createTab")}
                        </button>
                        <button
                            className={`mp-tab ${lobbyTab === "join" ? "active" : ""}`}
                            onClick={() => setLobbyTab("join")}
                        >
                            {t("page.guessJacket.multiplayer.joinTab")}
                        </button>
                    </div>

                    {lobbyTab === "create" ? (
                        <>
                            {/* Server Selection Card */}
                            <div className="mp-card">
                                <div className="mp-card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span>{t("page.guessJacket.multiplayer.serverSelection")}</span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setIsServerListExpanded(!isServerListExpanded)}
                                            style={{
                                                fontSize: "0.75rem", background: "none", border: "none",
                                                color: themeColor, cursor: "pointer", fontWeight: 600,
                                            }}
                                        >
                                            {isServerListExpanded ? t("page.guessJacket.multiplayer.collapseServerList") : t("page.guessJacket.multiplayer.changeServer")}
                                        </button>
                                        <button
                                            onClick={testAllLatencies}
                                            disabled={isTestingLatency}
                                            style={{
                                                fontSize: "0.75rem", background: "none", border: `1px solid ${themeColor}`,
                                                color: themeColor, borderRadius: "0.375rem", padding: "0.1rem 0.4rem",
                                                cursor: isTestingLatency ? "not-allowed" : "pointer", fontWeight: 600,
                                                opacity: isTestingLatency ? 0.5 : 1,
                                            }}
                                        >
                                            {isTestingLatency ? t("page.guessJacket.multiplayer.testingLatency") : "↻"}
                                        </button>
                                    </div>
                                </div>

                                {!isServerListExpanded && (
                                    <div
                                        className="mp-server-item selected"
                                        style={{ marginBottom: 0, cursor: "default", border: `1px solid ${themeColor}` }}
                                    >
                                        <div className="mp-server-info">
                                            <div className="mp-server-name">
                                                {getRelayServerName(selectedServerId)}
                                                <span className="bg-miku/10 text-miku text-[10px] px-1.5 py-0.5 rounded ml-2">{t("page.guessJacket.multiplayer.currentSelected")}</span>
                                            </div>
                                            <div className="mp-server-region">{getRelayServerRegion(selectedServerId)}</div>
                                        </div>
                                        <div className={`mp-server-latency ${(serverLatencies.get(selectedServerId) || 999) < 100 ? "signal-good" :
                                            (serverLatencies.get(selectedServerId) || 999) < 200 ? "signal-ok" : "signal-bad"
                                            }`}>
                                            <span className="mp-server-signal">
                                                {(serverLatencies.get(selectedServerId) || 999) < 100 ? "🟢" :
                                                    (serverLatencies.get(selectedServerId) || 999) < 200 ? "🟡" : "🔴"}
                                            </span>
                                            {serverLatencies.get(selectedServerId) !== undefined ?
                                                `${serverLatencies.get(selectedServerId)}ms` :
                                                (isTestingLatency ? "..." : "--")}
                                        </div>
                                    </div>
                                )}

                                {isServerListExpanded && (
                                    <div className="mp-server-list animate-in fade-in slide-in-from-top-2 duration-200">
                                        {SERVERS.map(server => {
                                            const latency = serverLatencies.get(server.id);
                                            const isSelected = selectedServerId === server.id;
                                            let signalClass = "";
                                            let signalIcon = "⏳";
                                            if (latency !== undefined) {
                                                if (latency < 0) { signalClass = "signal-fail"; signalIcon = "❌"; }
                                                else if (latency < 100) { signalClass = "signal-good"; signalIcon = "🟢"; }
                                                else if (latency < 200) { signalClass = "signal-ok"; signalIcon = "🟡"; }
                                                else { signalClass = "signal-bad"; signalIcon = "🔴"; }
                                            }
                                            return (
                                                <button
                                                    key={server.id}
                                                    className={`mp-server-item ${isSelected ? "selected" : ""}`}
                                                    onClick={() => {
                                                        setSelectedServerId(server.id);
                                                        setIsServerListExpanded(false);
                                                    }}
                                                >
                                                    <div className="mp-server-info">
                                                        <div className="mp-server-name">{t(server.nameKey)}</div>
                                                        <div className="mp-server-region">{t(server.regionKey)}</div>
                                                    </div>
                                                    <div className={`mp-server-latency ${signalClass}`}>
                                                        <span className="mp-server-signal">{signalIcon}</span>
                                                        {latency !== undefined ? (
                                                            latency < 0 ? t("page.guessJacket.multiplayer.latencyTimeout") : `${latency}ms`
                                                        ) : (
                                                            isTestingLatency ? "..." : "--"
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="mp-server-note">
                                    {t("page.guessJacket.multiplayer.autoServerNote")}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-2 p-2 bg-slate-50 border border-slate-100 rounded">
                                    {t("page.guessJacket.multiplayer.awsQuotaWarningPrefix")}<strong>{t("page.guessJacket.multiplayer.awsRegions")}</strong>{t("page.guessJacket.multiplayer.awsQuotaWarningSuffix")}
                                </div>
                            </div>

                            {/* Game Rules Card */}
                            <div className="mp-card">
                                <div className="mp-card-title flex justify-between items-center">
                                    <span>{t("page.guessJacket.multiplayer.rules")}</span>
                                    <button
                                        onClick={() => setShowRules(true)}
                                        className="text-xs text-miku font-bold hover:underline"
                                    >
                                        {t("page.guessJacket.multiplayer.viewDetailedRules")}
                                    </button>
                                </div>
                                <div className="text-xs text-slate-500 space-y-1">
                                    <p>• <span className="font-bold">{t("page.guessJacket.multiplayer.ruleSummary.unlimitedTitle")}</span> {t("page.guessJacket.multiplayer.ruleSummary.unlimitedDesc")}</p>
                                    <p>• <span className="font-bold">{t("page.guessJacket.multiplayer.ruleSummary.killBlockTitle")}</span> {t("page.guessJacket.multiplayer.ruleSummary.killBlockDesc")}</p>
                                    <p>• <span className="font-bold">{t("page.guessJacket.multiplayer.ruleSummary.lastStandTitle")}</span> {t("page.guessJacket.multiplayer.ruleSummary.lastStandDesc")}</p>
                                </div>
                            </div>

                            {/* Game Settings Card */}
                            <div className="mp-card">
                                <div className="mp-card-title">{t("page.guessJacket.multiplayer.gameSettings")}</div>

                                {/* Server Scope */}
                                <div style={{ marginBottom: "1rem" }}>
                                    <Select
                                        value={gameSettings.server}
                                        onValueChange={(server) => updateGameSettings(prev => ({ ...prev, server }))}
                                        options={(["jp", "cn"] as ServerScope[]).map(server => ({ value: server, label: getServerShortLabel(server), leading: <ServerRegionIcon server={server} decorative /> }))}
                                        label={t("page.guessJacket.multiplayer.serverScope")}
                                    />
                                </div>

                                {/* Difficulty */}
                                <div style={{ marginBottom: "1rem" }}>
                                    <Select
                                        value={gameSettings.difficulty}
                                        onValueChange={(difficulty) => updateGameSettings(prev => ({ ...prev, difficulty }))}
                                        options={(["easy", "normal", "hard", "extreme"] as Difficulty[]).map(difficulty => ({ value: difficulty, label: getDifficultyLabel(difficulty) }))}
                                        label={t("page.guessJacket.multiplayer.difficultySetting")}
                                    />
                                </div>

                                {/* Time Limit */}
                                <div style={{ marginBottom: "1rem" }}>
                                    <div className="mp-settings-label">{t("page.guessJacket.multiplayer.guessTime")}</div>
                                    <input
                                        className="mp-input"
                                        type="number"
                                        value={gameSettings.timeLimit}
                                        onChange={(e) => updateGameSettings(prev => ({ ...prev, timeLimit: Math.max(3, Math.min(120, Number(e.target.value))) }))}
                                        style={{ textAlign: "center", fontFamily: "monospace" }}
                                    />
                                </div>

                                {/* Options Count */}
                                <div style={{ marginBottom: "1rem" }}>
                                    <Select
                                        value={gameSettings.optionsCount}
                                        onValueChange={(optionsCount) => updateGameSettings(prev => ({ ...prev, optionsCount }))}
                                        options={OPTIONS_CHOICES.map(count => ({ value: count, label: t("page.guessJacket.common.optionCountLabel", { count }) }))}
                                        label={t("page.guessJacket.multiplayer.optionsCount")}
                                    />
                                </div>

                                {/* Loading/Error State */}
                                {musicsLoading && (
                                    <div style={{ textAlign: "center", padding: "0.5rem", color: "#94a3b8", fontSize: "0.875rem" }}>
                                        {t("page.guessJacket.common.loadingMusics")}
                                    </div>
                                )}
                                {loadError && (
                                    <div style={{ textAlign: "center", padding: "0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.75rem" }}>
                                        <div style={{ color: "#dc2626", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>{loadError}</div>
                                        <button
                                            onClick={loadMusics}
                                            style={{ padding: "0.375rem 1rem", background: "#dc2626", color: "white", border: "none", borderRadius: "0.5rem", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}
                                        >
                                            {t("page.guessJacket.common.reload")}
                                        </button>
                                    </div>
                                )}

                                <button
                                    className="mp-btn mp-btn-primary"
                                    onClick={handleCreateRoom}
                                    disabled={musicsLoading || !!loadError}
                                    style={{ width: "100%", marginTop: "0.5rem", opacity: (musicsLoading || loadError) ? 0.5 : 1 }}
                                >
                                    {musicsLoading ? t("page.guessJacket.common.loading") : t("page.guessJacket.multiplayer.createRoom")}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            <input
                                className="mp-input"
                                type="text"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                placeholder={t("page.guessJacket.multiplayer.roomCodePlaceholder")}
                                maxLength={6}
                            />

                            {musicsLoading && (
                                <div style={{ textAlign: "center", padding: "0.5rem", color: "#94a3b8", fontSize: "0.875rem" }}>
                                    {t("page.guessJacket.common.loadingMusics")}
                                </div>
                            )}
                            {loadError && (
                                <div style={{ textAlign: "center", padding: "0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.75rem" }}>
                                    <div style={{ color: "#dc2626", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>{loadError}</div>
                                    <button
                                        onClick={loadMusics}
                                        style={{ padding: "0.375rem 1rem", background: "#dc2626", color: "white", border: "none", borderRadius: "0.5rem", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}
                                    >
                                        {t("page.guessJacket.common.reload")}
                                    </button>
                                </div>
                            )}

                            <button
                                className="mp-btn mp-btn-primary"
                                onClick={handleJoinRoom}
                                disabled={musicsLoading || !!loadError}
                                style={{ opacity: (musicsLoading || loadError) ? 0.5 : 1 }}
                            >
                                {musicsLoading ? t("page.guessJacket.common.loading") : t("page.guessJacket.multiplayer.joinRoom")}
                            </button>

                            {error && <div className="mp-error">{error}</div>}
                        </div>
                    )}

                </div>

                <Modal
                    isOpen={showRules}
                    onClose={() => setShowRules(false)}
                    title={t("page.guessJacket.multiplayer.rulesModalTitle")}
                    size="lg"
                >
                    <div className="space-y-6">
                        <section>
                            <h4 className="font-black text-slate-700 mb-2 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">1</span>
                                {t("page.guessJacket.multiplayer.rulesModal.unlimitedTitle")}
                            </h4>
                            <p className="text-sm text-slate-500 leading-relaxed pl-8">
                                {t("page.guessJacket.multiplayer.rulesModal.unlimitedBody1")}
                                {t("page.guessJacket.multiplayer.rulesModal.unlimitedBody2")}
                            </p>
                        </section>

                        <section>
                            <h4 className="font-black text-slate-700 mb-2 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs">2</span>
                                {t("page.guessJacket.multiplayer.rulesModal.killBlockTitle")}
                            </h4>
                            <div className="text-sm text-slate-500 leading-relaxed pl-8 space-y-2">
                                <p>
                                    {t("page.guessJacket.multiplayer.rulesModal.killBody")}
                                </p>
                                <p>
                                    {t("page.guessJacket.multiplayer.rulesModal.blockBody")}
                                </p>
                            </div>
                        </section>

                        <section>
                            <h4 className="font-black text-slate-700 mb-2 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs">3</span>
                                {t("page.guessJacket.multiplayer.rulesModal.lastStandTitle")}
                            </h4>
                            <p className="text-sm text-slate-500 leading-relaxed pl-8">
                                {t("page.guessJacket.multiplayer.rulesModal.lastStandBody1")}
                                {t("page.guessJacket.multiplayer.rulesModal.lastStandBody2")}
                                {t("page.guessJacket.multiplayer.rulesModal.lastStandBody3")}
                            </p>
                        </section>

                        <div className="pt-2 flex justify-center">
                            <button
                                onClick={() => setShowRules(false)}
                                className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors"
                            >
                                {t("page.guessJacket.multiplayer.rulesModal.understood")}
                            </button>
                        </div>
                    </div>
                </Modal>
            </div>
        );
    }

    // ========== ROOM PHASE ==========
    if (phase === "room") {
        return (
            <div className="mp-container">
                <div className="mp-lobby">
                    <div className="mp-room-code">
                        <div className="mp-room-code-label">{t("page.guessJacket.multiplayer.roomCode")}</div>
                        <div className="mp-room-code-value">{roomCode}</div>
                        <button
                            style={{
                                marginTop: "0.5rem",
                                background: "none",
                                border: "none",
                                color: themeColor,
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                fontWeight: 700,
                            }}
                            onClick={() => {
                                navigator.clipboard.writeText(roomCode);
                            }}
                        >
                            {t("page.guessJacket.multiplayer.copyRoomCode")}
                        </button>
                        <button
                            style={{
                                marginTop: "0.5rem",
                                marginLeft: "1rem",
                                background: "none",
                                border: "none",
                                color: themeColor,
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                fontWeight: 700,
                            }}
                            onClick={() => {
                                const difficulty = getDifficultyLabel(gameSettings.difficulty);
                                const server = getServerShortLabel(gameSettings.server);
                                const serverName = getRelayServerName(currentServerId);
                                const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}&server=${currentServerId}`;
                                const shareText = t("page.guessJacket.multiplayer.shareText", { server, difficulty, roomCode, serverName, shareUrl });
                                navigator.clipboard.writeText(shareText);
                                alert(t("page.guessJacket.multiplayer.shareCopied"));
                            }}
                        >
                            {t("page.guessJacket.multiplayer.shareLink")}
                        </button>
                        <div style={{ textAlign: "center", marginTop: "0.25rem", fontSize: "0.7rem", color: "#94a3b8" }}>
                            🌐 {getRelayServerName(currentServerId)}
                        </div>
                    </div>

                    {/* Player slots */}
                    <div className="mp-card">
                        <div className="mp-card-title">{t("page.guessJacket.multiplayer.players", { count: players.length, max: MAX_PLAYERS })}</div>
                        <div className="mp-players">
                            {[1, 2, 3, 4].map(slot => {
                                const p = players.find(pl => pl.slot === slot);
                                return (
                                    <div key={slot} className={`mp-player-slot ${p ? "filled" : ""} ${p?.isHost ? "host" : ""}`}>
                                        {p ? (
                                            <>
                                                <div className="mp-player-avatar">
                                                    <Image src={getCharacterIconUrl(p.characterId)} alt="" fill sizes="40px" unoptimized />
                                                </div>
                                                <div>
                                                    <div className="mp-player-name">{getCharacterName(t, p.characterId)}</div>
                                                    <div className="mp-player-label">
                                                        P{slot} {p.isHost ? t("page.guessJacket.multiplayer.hostBadge") : ""} {p.id === mySessionId ? t("page.guessJacket.multiplayer.youBadge") : ""}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="mp-empty-slot">{t("page.guessJacket.multiplayer.emptySlot", { slot })}</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Settings Display */}
                    <div className="mp-card">
                        <div className="mp-card-title">{t("page.guessJacket.multiplayer.gameSettings")} {!isHost && <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 400 }}>{t("page.guessJacket.multiplayer.hostConfig")}</span>}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.875rem" }}>
                            <div style={{ color: "#94a3b8" }}>{t("page.guessJacket.multiplayer.labels.server")}</div>
                            <div style={{ color: "#334155", fontWeight: 600 }}>
                                {getServerLabel(gameSettings.server)}
                            </div>
                            <div style={{ color: "#94a3b8" }}>{t("page.guessJacket.multiplayer.labels.difficulty")}</div>
                            <div style={{ color: "#334155", fontWeight: 600 }}>
                                {getDifficultyLabel(gameSettings.difficulty)}
                            </div>
                            <div style={{ color: "#94a3b8" }}>{t("page.guessJacket.multiplayer.labels.timeLimit")}</div>
                            <div style={{ color: "#334155", fontWeight: 600 }}>{gameSettings.timeLimit}{t("page.guessJacket.common.secondsSuffix")}</div>
                            <div style={{ color: "#94a3b8" }}>{t("page.guessJacket.multiplayer.labels.optionsCount")}</div>
                            <div style={{ color: "#334155", fontWeight: 600 }}>{t("page.guessJacket.common.optionCountLabel", { count: gameSettings.optionsCount })}</div>
                        </div>
                    </div>

                    {isHost ? (
                        <button
                            className="mp-btn mp-btn-primary"
                            onClick={handleStartGame}
                            disabled={players.length < 2}
                        >
                            {players.length < 2 ? t("page.guessJacket.multiplayer.waitingMorePlayers") : t("page.guessJacket.multiplayer.startGame")}
                        </button>
                    ) : (
                        <div className="mp-waiting">
                            <div className="mp-waiting-text">
                                {t("page.guessJacket.multiplayer.waitHostStart")}
                                <span className="mp-loading-dot">.</span>
                                <span className="mp-loading-dot">.</span>
                                <span className="mp-loading-dot">.</span>
                            </div>
                        </div>
                    )}

                    <button className="mp-btn mp-btn-danger" onClick={handleLeaveRoom}>
                        {t("page.guessJacket.multiplayer.leaveRoom")}
                    </button>

                    {error && <div className="mp-error">{error}</div>}
                </div>
            </div>
        );
    }

    // ========== PLAYING PHASE ==========
    if (phase === "playing") {
        if (isPreloading) {
            return (
                <div className="mp-container">
                    <div className="mp-loading-screen">
                        <div className="mp-loading-title">{t("page.guessJacket.multiplayer.loadingResources")}</div>
                        <div className="mp-loading-subtitle">{t("page.guessJacket.multiplayer.preloadFirstQuestion")}</div>
                        <div className="mp-loading-players">
                            {players.map(p => {
                                const progress = playerLoadProgress.get(p.id) || 0;
                                const isComplete = playerLoadComplete.get(p.id) || false;
                                return (
                                    <div key={p.id} className={`mp-loading-player ${isComplete ? "complete" : ""}`}>
                                        <div className="mp-loading-player-info">
                                            <div className="mp-loading-player-avatar">
                                                <Image src={getCharacterIconUrl(p.characterId)} alt="" fill sizes="32px" unoptimized />
                                            </div>
                                            <div className="mp-loading-player-name">
                                                {getCharacterName(t, p.characterId)}
                                                {p.id === mySessionId && <span className="mp-loading-you">{t("page.guessJacket.multiplayer.you")}</span>}
                                            </div>
                                            {isComplete && (
                                                <div className="mp-loading-complete-badge">{t("page.guessJacket.multiplayer.loadingComplete")}</div>
                                            )}
                                        </div>
                                        <div className="mp-loading-bar">
                                            <div
                                                className="mp-loading-bar-fill"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mp-loading-hint">{t("page.guessJacket.multiplayer.allPlayersLoadedHint")}</div>
                    </div>
                </div>
            );
        }

        const roundMult = getRoundMultiplier(currentRound);
        const timerPercent = (timeLeft / activeSettings.timeLimit) * 100;

        return (
            <div className="mp-container">
                <div className="mp-game">
                    {/* Kill notification */}
                    {killNotify && (
                        <div className="mp-kill-notify">
                            <div className={killNotify.startsWith("⚔️") ? "mp-kill-text" : "mp-block-text"}>
                                {killNotify}
                            </div>
                        </div>
                    )}

                    {/* Feedback overlay */}
                    {showFeedback && feedbackMusic && (
                        <div className="mp-feedback-overlay" onClick={isHost ? handleSkipFeedback : undefined}>
                            <div className={`mp-feedback-result ${feedbackCorrect ? "mp-feedback-correct" : "mp-feedback-wrong"}`}>
                                {feedbackCorrect ? t("page.guessJacket.multiplayer.feedbackCorrect") : t("page.guessJacket.multiplayer.feedbackWrong")}
                            </div>
                            <div style={{
                                width: "200px",
                                height: "200px",
                                borderRadius: "0.75rem",
                                overflow: "hidden",
                                margin: "0.5rem auto",
                                border: "2px solid #e2e8f0",
                                position: "relative",
                                background: "#f8fafc",
                            }}>
                                <Image
                                    src={getMusicJacketUrl(feedbackMusic.assetbundleName, getAssetSourceForServer(activeSettings.server))}
                                    alt={feedbackMusic.title}
                                    fill
                                    sizes="200px"
                                    style={{ objectFit: "cover" }}
                                    unoptimized
                                />
                            </div>
                            <div style={{ color: "#334155", fontSize: "1.25rem", fontWeight: 700, marginTop: "0.5rem", textAlign: "center", maxWidth: "80vw" }}>
                                {feedbackMusic.title}
                            </div>
                            <div style={{ color: "#94a3b8", fontSize: "0.875rem", marginTop: "0.25rem", textAlign: "center", maxWidth: "80vw" }}>
                                {getLocalizedMusicTitle(feedbackMusic.title)}
                            </div>
                            <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "1.5rem" }}>
                                {isHost ? t("page.guessJacket.multiplayer.skipFeedback") : t("page.guessJacket.multiplayer.waitingNextRound")}
                            </div>
                        </div>
                    )}

                    {/* HUD - Player HP */}
                    <div className="mp-hud">
                        {players.map(p => {
                            const hpPercent = Math.max(0, (p.hp / INITIAL_HP) * 100);
                            const blockPercent = Math.min(100, (p.blockBar / 500) * 100);
                            const hpClass = hpPercent < 25 ? "low" : hpPercent < 50 ? "medium" : "";
                            const playerChanges = floatingHpChanges.filter(f => f.playerId === p.id);
                            return (
                                <div
                                    key={p.id}
                                    className={`mp-hud-player ${p.id === mySessionId ? "self" : ""} ${p.eliminated || p.hp <= 0 ? "eliminated" : ""}`}
                                    style={{ position: "relative" }}
                                >
                                    <div className="mp-hud-avatar">
                                        <Image src={getCharacterIconUrl(p.characterId)} alt="" fill sizes="28px" unoptimized />
                                    </div>
                                    <div className="mp-hud-label">P{p.slot}</div>
                                    <div className={`mp-hud-hp ${p.hp < 0 ? "negative" : ""}`}>
                                        {Math.floor(p.hp)}
                                    </div>
                                    <div className="mp-hp-bar">
                                        <div className={`mp-hp-fill ${hpClass}`} style={{ width: `${hpPercent}%` }} />
                                    </div>
                                    {p.blockBar > 0 && (
                                        <div className="mp-block-bar">
                                            <div className="mp-block-fill" style={{ width: `${blockPercent}%` }} />
                                        </div>
                                    )}
                                    {p.isDying && !p.eliminated ? (
                                        <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] px-1 rounded-bl font-bold animate-pulse">
                                            {t("page.guessJacket.multiplayer.dying")}
                                        </div>
                                    ) : null}

                                    {p.guessedCorrectly ? (
                                        <div style={{ fontSize: "0.5rem", color: themeColor, fontWeight: 700 }}>✓</div>
                                    ) : p.attempts > 0 && isRoundActive ? (
                                        <div style={{ fontSize: "0.5rem", color: "#f87171", fontWeight: 700 }}>✗{p.attempts}</div>
                                    ) : null}
                                    {playerChanges.map(fc => (
                                        <div
                                            key={fc.id}
                                            className="mp-hp-float"
                                            style={{
                                                color: fc.type === "block" ? themeColor : fc.type === "kill" ? "#f97316" : "#f87171",
                                            }}
                                        >
                                            {fc.type === "block" ? `🛡️${Math.floor(fc.amount)}` : Math.floor(fc.amount)}
                                        </div>
                                    ))}

                                    {activeStickers.has(p.id) && (
                                        <div className="mp-chat-bubble">
                                            <img
                                                src={getStickerImageUrl(activeStickers.get(p.id)!.stickerNum)}
                                                alt="sticker"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Round info */}
                    <div className="mp-round-bar">
                        <div className="mp-round-label">
                            Round {currentRound + 1}/{MAX_ROUNDS}
                        </div>
                        <div style={{ fontSize: "0.875rem", color: "#334155", fontWeight: 700 }}>
                            {timeLeft.toFixed(1)}s
                        </div>
                        <div className="mp-round-mult">×{roundMult.toFixed(1)}</div>
                    </div>

                    {/* Timer bar */}
                    <div className="mp-timer-bar">
                        <div
                            className={`mp-timer-fill ${timerPercent < 25 ? "urgent" : ""}`}
                            style={{ width: `${timerPercent}%` }}
                        />
                    </div>

                    {/* Game area - canvas + music options */}
                    <div className="mp-game-area">
                        <div className="mp-canvas-wrap">
                            <canvas ref={canvasRef} width={300} height={300} />
                            {isRoundActive && currentDistortions.length > 0 && (
                                <div style={{
                                    position: "absolute",
                                    top: "0.5rem",
                                    right: "0.5rem",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.25rem",
                                    alignItems: "flex-end",
                                    pointerEvents: "none",
                                }}>
                                    {currentDistortions.map((d: ActiveDistortion, i: number) => (
                                        <span key={i} style={{
                                            padding: "0.25rem 0.5rem",
                                            background: "#ef4444",
                                            color: "white",
                                            fontSize: "0.75rem",
                                            fontWeight: 700,
                                            borderRadius: "0.25rem",
                                            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                                            opacity: 0.9,
                                            whiteSpace: "nowrap",
                                        }}>
                                            {getDistortionLabel(d)}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {!isRoundActive && !showFeedback && (
                                <div style={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "rgba(255,255,255,0.8)",
                                    color: "#334155",
                                    fontWeight: 700,
                                    borderRadius: "1rem",
                                }}>
                                    {t("page.guessJacket.multiplayer.preparing")}
                                </div>
                            )}
                        </div>

                        {/* Music options list */}
                        <div className={`mp-music-options ${wrongGuessShake ? "mp-shake" : ""}`}>
                            {roundData?.optionIds.map((optId, index) => {
                                const music = musicMap.get(optId);
                                if (!music) return null;
                                const title = getDisplayTitle(music);
                                const isWrong = disabledOptionIds.includes(optId);
                                return (
                                    <button
                                        key={`${currentRound}-${optId}`}
                                        className={`mp-music-option-btn ${isWrong ? "guessed-wrong" : ""}`}
                                        onClick={() => handleGuess(optId)}
                                        disabled={!isRoundActive || myGuessed || isWrong}
                                    >
                                        <span className="mp-music-option-index">{String(index + 1).padStart(2, "0")}</span>
                                        <div className="mp-music-option-titles">
                                            <span className="mp-music-option-title">{title.jp}</span>
                                            {title.cn && <span className="mp-music-option-cn">{title.cn}</span>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Sticker toggle */}
                    <button
                        className="mp-sticker-toggle"
                        onClick={() => setShowStickerPicker(!showStickerPicker)}
                        title={t("page.guessJacket.multiplayer.sendStickerTitle")}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                            <line x1="9" y1="9" x2="9.01" y2="9"></line>
                            <line x1="15" y1="9" x2="15.01" y2="9"></line>
                        </svg>
                    </button>

                    {/* Sticker picker */}
                    {showStickerPicker && (
                        <div className="mp-sticker-picker">
                            {Array.from({ length: 32 }, (_, i) => i + 1).map(num => (
                                <button
                                    key={num}
                                    className="mp-sticker-item"
                                    onClick={() => sendSticker(num)}
                                >
                                    <img
                                        src={getStickerImageUrl(num)}
                                        alt={`sticker-${num}`}
                                        loading="lazy"
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ========== RESULT PHASE ==========
    if (phase === "result") {
        return (
            <div className="mp-container">
                <div className="mp-result">
                    <div className="mp-result-title">{t("page.guessJacket.multiplayer.resultTitle")}</div>

                    <div className="mp-rank-list">
                        {rankedPlayers.map((p, idx) => {
                            const posClass = idx === 0 ? "gold" : idx === 1 ? "silver" : idx === 2 ? "bronze" : "";
                            const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
                            return (
                                <div key={p.id} className={`mp-rank-item ${idx === 0 ? "first" : ""}`}>
                                    <div className={`mp-rank-pos ${posClass}`}>{medal}</div>
                                    <div className="mp-rank-avatar">
                                        <Image src={getCharacterIconUrl(p.characterId)} alt="" fill sizes="48px" unoptimized />
                                    </div>
                                    <div className="mp-rank-info">
                                        <div className="mp-rank-name">
                                            {getCharacterName(t, p.characterId)}
                                            {p.id === mySessionId && <span style={{ color: themeColor, marginLeft: "0.5rem", fontSize: "0.75rem" }}>({t("page.guessJacket.multiplayer.you")})</span>}
                                        </div>
                                        <div className="mp-rank-hp">
                                            {Math.floor(p.hp)} HP
                                            {p.hp <= 0 && <span style={{ color: "#f87171", marginLeft: "0.25rem" }}>{t("page.guessJacket.multiplayer.eliminated")}</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ display: "flex", gap: "0.75rem", width: "100%", maxWidth: "24rem" }}>
                        <button className="mp-btn mp-btn-secondary" onClick={handleLeaveRoom} style={{ flex: 1 }}>
                            {t("page.guessJacket.multiplayer.backToLobby")}
                        </button>
                        {isHost ? (
                            <button
                                className="mp-btn mp-btn-primary"
                                onClick={() => {
                                    updateRoomStatus(roomId, "waiting", currentServerId);
                                    channelRef.current?.send({
                                        type: "broadcast",
                                        event: "return_to_room",
                                        payload: {},
                                    });
                                }}
                                style={{ flex: 1 }}
                            >
                                {t("page.guessJacket.multiplayer.rematch")}
                            </button>
                        ) : (
                            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "0.875rem" }}>
                                {t("page.guessJacket.multiplayer.waitingHost")}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

// ==================== EXPORT ====================

export default function MultiplayerClient() {
    return (
        <Suspense fallback={
            <div className="mp-container">
                <div className="mp-verify">
                    <div className="mp-verify-title">Loading...</div>
                </div>
            </div>
        }>
            <MultiplayerContent />
        </Suspense>
    );
}
