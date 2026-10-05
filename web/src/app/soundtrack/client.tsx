"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense, type CSSProperties } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchBgmDurationsData, fetchMasterData } from "@/lib/fetch";
import { getMysekaiRawAssetUrl } from "@/lib/assets";
import { getMysekaiSoundTrackAudioUrl } from "@/lib/mysekai-preview/assets";
import { Banner, Button, Chip, CircularProgress, EmptyState, Icon, IconButton, LoadingState, PageContainer, PageHeader, Surface, TextField } from "@/components/md3";
import {
    mdArrowDownward,
    mdArrowUpward,
    mdChevronRight,
    mdDownload,
    mdError,
    mdGraphicEq,
    mdMusicOff,
    mdPauseFill,
    mdPlayArrowFill,
    mdRepeat,
    mdRepeatOne,
    mdSearch,
    mdSell,
    mdShare,
    mdShuffle,
    mdSkipNextFill,
    mdSkipPreviousFill,
    mdVolumeDown,
    mdVolumeOff,
    mdVolumeUp,
} from "@/components/md3/icons";

// Interface definitions based on masterdata schemas
interface MysekaiMusicSoundTrackCategory {
    id: number;
    name: string;
    assetbundleName: string;
}

interface MysekaiMusicSoundTrackMaster {
    id: number;
    seq: number;
    title: string;
    pronunciation: string;
    musicSoundTrackCategoryId: number;
    assetbundleName: string;
    assetbundleFileName: string;
    isSpoiler?: boolean;
    durationSeconds?: number;
    durationMilliseconds?: number;
    durationSourceKey?: string;
}

interface BgmDurationTrack {
    key: string;
    route: string;
    file_name: string;
    duration_seconds: number;
    duration_milliseconds?: number;
}

interface BgmDurationsResponse {
    generated_at?: string;
    tracks: BgmDurationTrack[];
}

type PlaybackMode = "sequential" | "loop-one" | "shuffle";
type SoundtrackCategoryFilter = number | "spoiler" | null;
type SoundtrackMediaSessionAction = "play" | "pause" | "stop" | "previoustrack" | "nexttrack" | "seekbackward" | "seekforward" | "seekto";

const PLAYBACK_MODES = ["sequential", "loop-one", "shuffle"] as const satisfies readonly PlaybackMode[];

function isPlaybackMode(value: string | null): value is PlaybackMode {
    return PLAYBACK_MODES.includes(value as PlaybackMode);
}

function clampVolume(value: number) {
    if (!Number.isFinite(value)) return 0.5;
    return Math.min(1, Math.max(0, value));
}

const SOUNDTRACK_AUDIO_CACHE_NAME = "soundtrack-audio-v1";
const SPOILER_TRACK_ID_BASE = -1_000_000;
const SPOILER_TRACK_SEQ_BASE = 10_000;
const SPOILER_DURATION_THRESHOLD_SECONDS = 40;
const MYSEKAI_SOUNDTRACK_CATEGORY_ID = 12;
const SCENARIO_SOUNDTRACK_CATEGORY_ID = 13;
const SPOILER_CATEGORY_FILTER = "spoiler" as const;
const SPOILER_CATEGORY_THEME = { from: "#F97316", to: "#C2410C" };
const SOUNDTRACK_INITIAL_LIST_LIMIT = 80;
const SOUNDTRACK_LIST_BATCH_SIZE = 80;
const SOUNDTRACK_LIST_SCROLL_THRESHOLD_PX = 280;
const SOUNDTRACK_PROGRESS_UPDATE_INTERVAL_MS = 500;
const SOUNDTRACK_MEDIA_SEEK_OFFSET_SECONDS = 10;
const SOUNDTRACK_MEDIA_ARTWORK_SIZES = ["96x96", "128x128", "192x192", "256x256", "384x384", "512x512"] as const;

function sanitizeDownloadFileName(value: string) {
    return value
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, " ")
        .trim() || "soundtrack";
}

function getTrackDownloadFileName(track: MysekaiMusicSoundTrackMaster) {
    const seq = track.seq.toString().padStart(3, "0");
    return `${seq}_${sanitizeDownloadFileName(track.title || track.assetbundleFileName)}.mp3`;
}

function normalizeAssetPath(value: string) {
    return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

function normalizeAudioKey(value: string) {
    return normalizeAssetPath(value).replace(/\?.*$/, "");
}

function getTrackAudioKey(track: MysekaiMusicSoundTrackMaster) {
    const assetbundleName = normalizeAssetPath(track.assetbundleName);
    const fileName = String(track.assetbundleFileName || assetbundleName.split("/").pop() || "").trim();
    return fileName ? `${assetbundleName}/${fileName}.mp3` : "";
}

function getSpoilerTrackId(key: string) {
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
        hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return SPOILER_TRACK_ID_BASE - (hash % 900_000);
}

function stripAudioExtension(fileName: string) {
    return fileName.replace(/\.(mp3|wav|ogg)$/i, "");
}

function humanizeSpoilerTrackName(fileName: string) {
    return stripAudioExtension(fileName)
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildSpoilerTrackFromDuration(entry: BgmDurationTrack, index: number): MysekaiMusicSoundTrackMaster | null {
    const key = normalizeAudioKey(entry.key);
    if (!key || !key.toLowerCase().endsWith(".mp3")) return null;

    const extensionlessKey = key.replace(/\.mp3$/i, "");
    const slashIndex = extensionlessKey.lastIndexOf("/");
    if (slashIndex <= 0) return null;

    const assetbundleName = extensionlessKey.slice(0, slashIndex);
    const assetbundleFileName = extensionlessKey.slice(slashIndex + 1);
    const displayName = humanizeSpoilerTrackName(entry.file_name || assetbundleFileName) || assetbundleFileName;
    const categoryId = assetbundleName.startsWith("mysekai/sound/bgm/")
        ? MYSEKAI_SOUNDTRACK_CATEGORY_ID
        : SCENARIO_SOUNDTRACK_CATEGORY_ID;

    return {
        id: getSpoilerTrackId(key),
        seq: SPOILER_TRACK_SEQ_BASE + index,
        title: displayName,
        pronunciation: assetbundleFileName,
        musicSoundTrackCategoryId: categoryId,
        assetbundleName,
        assetbundleFileName,
        isSpoiler: true,
        durationSeconds: entry.duration_seconds,
        durationMilliseconds: entry.duration_milliseconds,
        durationSourceKey: key,
    };
}

function buildSpoilerTracksFromDurations(
    durationData: BgmDurationsResponse | null,
    masterTracks: MysekaiMusicSoundTrackMaster[]
) {
    if (!durationData?.tracks?.length) return [];

    const masterAudioKeys = new Set(masterTracks.map(getTrackAudioKey).filter(Boolean));
    return durationData.tracks
        .filter((entry) => {
            const key = normalizeAudioKey(entry.key);
            return entry.duration_seconds > SPOILER_DURATION_THRESHOLD_SECONDS && !masterAudioKeys.has(key);
        })
        .map((entry, index) => buildSpoilerTrackFromDuration(entry, index))
        .filter((track): track is MysekaiMusicSoundTrackMaster => track !== null);
}

function getDisplayTrackTitle(track: MysekaiMusicSoundTrackMaster | null, t: (key: string, values?: Record<string, string | number | boolean | null | undefined>) => string) {
    if (!track) return t("page.soundtrack.emptyTrack");
    if (!track.isSpoiler) return track.title;
    return t("page.soundtrack.spoiler.unlistedTitle", { name: track.title });
}

function getTrackSearchText(track: MysekaiMusicSoundTrackMaster) {
    return [
        track.title,
        track.pronunciation,
        track.assetbundleName,
        track.assetbundleFileName,
        track.durationSourceKey,
    ].filter(Boolean).join(" ").toLowerCase();
}

function triggerDirectDownload(url: string, fileName: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function triggerBlobDownload(blob: Blob, fileName: string) {
    const objectUrl = URL.createObjectURL(blob);
    triggerDirectDownload(objectUrl, fileName);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

async function readAudioBlobFromCache(url: string): Promise<Blob | null> {
    if (!("caches" in window)) return null;

    try {
        const response = await window.caches.match(url);
        if (!response) return null;

        const blob = await response.blob();
        return blob.size > 0 ? blob : null;
    } catch (err) {
        console.warn("Failed to read soundtrack audio cache:", err);
        return null;
    }
}

async function storeAudioBlobInCache(url: string, blob: Blob) {
    if (!("caches" in window) || blob.size === 0) return;

    try {
        const cache = await window.caches.open(SOUNDTRACK_AUDIO_CACHE_NAME);
        await cache.put(url, new Response(blob, {
            headers: { "Content-Type": blob.type || "audio/mpeg" },
        }));
    } catch (err) {
        console.warn("Failed to store soundtrack audio cache:", err);
    }
}

interface SoundtrackMediaSessionActionDetails {
    seekOffset?: number;
    seekTime?: number;
    fastSeek?: boolean;
}

type SoundtrackMediaSessionActionHandler = (details?: SoundtrackMediaSessionActionDetails) => void;

interface SoundtrackMediaSessionPositionState {
    duration: number;
    playbackRate?: number;
    position: number;
}

interface SoundtrackMediaSessionArtwork {
    src: string;
    sizes?: string;
    type?: string;
}

interface SoundtrackMediaMetadataInit {
    title?: string;
    artist?: string;
    album?: string;
    artwork?: SoundtrackMediaSessionArtwork[];
}

interface SoundtrackMediaSessionLike {
    metadata: unknown | null;
    playbackState: "none" | "paused" | "playing";
    setActionHandler?: (action: SoundtrackMediaSessionAction, handler: SoundtrackMediaSessionActionHandler | null) => void;
    setPositionState?: (state?: SoundtrackMediaSessionPositionState) => void;
}

interface SoundtrackMediaMetadataConstructor {
    new(init?: SoundtrackMediaMetadataInit): unknown;
}

function getSoundtrackMediaSession() {
    if (typeof navigator === "undefined") return null;
    return (navigator as Navigator & { mediaSession?: SoundtrackMediaSessionLike }).mediaSession ?? null;
}

function createSoundtrackMediaMetadata(init: SoundtrackMediaMetadataInit) {
    if (typeof window === "undefined") return null;
    const MediaMetadataConstructor = (window as Window & { MediaMetadata?: SoundtrackMediaMetadataConstructor }).MediaMetadata;
    if (!MediaMetadataConstructor) return null;

    try {
        return new MediaMetadataConstructor(init);
    } catch (err) {
        console.warn("Failed to create soundtrack media metadata:", err);
        return null;
    }
}

function setSoundtrackMediaSessionActionHandler(
    mediaSession: SoundtrackMediaSessionLike,
    action: SoundtrackMediaSessionAction,
    handler: SoundtrackMediaSessionActionHandler | null,
) {
    if (!mediaSession.setActionHandler) return;

    try {
        mediaSession.setActionHandler(action, handler);
    } catch {
        // Some platforms intentionally expose only a subset of Media Session actions.
    }
}

function setSoundtrackMediaSessionMetadata(mediaSession: SoundtrackMediaSessionLike, metadata: unknown | null) {
    try {
        mediaSession.metadata = metadata;
    } catch (err) {
        console.warn("Failed to update soundtrack media metadata:", err);
    }
}

function setSoundtrackMediaSessionPlaybackState(
    mediaSession: SoundtrackMediaSessionLike,
    playbackState: SoundtrackMediaSessionLike["playbackState"],
) {
    try {
        mediaSession.playbackState = playbackState;
    } catch (err) {
        console.warn("Failed to update soundtrack media playback state:", err);
    }
}

// Color schemes matching each category group
// Unit / category accent colors (game data colors, not theme colors)
const CATEGORY_THEMES: Record<number, { from: string; to: string }> = {
    1: { from: "#00E5CF", to: "#007D85" }, // Unit overview
    2: { from: "#FF45A4", to: "#7D1BFF" }, // Virtual Singer
    3: { from: "#33A2FF", to: "#102E7A" }, // Leo/need
    4: { from: "#52FF45", to: "#EBE81B" }, // MORE MORE JUMP!
    5: { from: "#FF6E1A", to: "#A60E0E" }, // Vivid BAD SQUAD
    6: { from: "#FFDF00", to: "#FF5E00" }, // Wonderlands x Showtime
    7: { from: "#C655FF", to: "#1F0F3D" }, // Nightcord
    11: { from: "#00E5CF", to: "#007D85" }, // In-game
    12: { from: "#00CCBB", to: "#006655" }, // Mysekai
    13: { from: "#94A3B8", to: "#334155" }, // Scenario
    14: { from: "#38BDF8", to: "#0369A1" }, // Live
    15: { from: "#F43F5E", to: "#9F1239" }, // Virtual Live
    16: { from: "#F59E0B", to: "#B45309" }, // Gacha
    20: { from: "#64748B", to: "#1E293B" }, // Other
    30: { from: "#EC4899", to: "#BE185D" }, // Collaboration
};

const DEFAULT_THEME = { from: "#00CCBB", to: "#1E293B" };

function SoundtrackContent() {
    const { t, formatNumber } = useI18n();
    const { assetSource, isShowSpoiler, backgroundAnimationBudget } = useTheme();
    const isPerformanceVisuals = backgroundAnimationBudget === "on";
    const searchParams = useSearchParams();

    // Data states
    const [tracks, setTracks] = useState<MysekaiMusicSoundTrackMaster[]>([]);
    const [categories, setCategories] = useState<MysekaiMusicSoundTrackCategory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Audio Ref
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const playRequestIdRef = useRef(0);
    const lastProgressUpdateRef = useRef(0);
    const currentTimeRef = useRef(0);
    const playNextRef = useRef<() => void>(() => {});

    // Audio states
    const [isPlaying, setIsPlaying] = useState(false);
    const [hasActivatedAudio, setHasActivatedAudio] = useState(false);
    const [playbackRestartNonce, setPlaybackRestartNonce] = useState(0);
    const [currentTrack, setCurrentTrack] = useState<MysekaiMusicSoundTrackMaster | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.5);
    const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("sequential");
    const [showVolumePopup, setShowVolumePopup] = useState(false);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadHint, setDownloadHint] = useState<string | null>(null);
    const [shareHint, setShareHint] = useState<string | null>(null);
    const [durationWarning, setDurationWarning] = useState<string | null>(null);

    // Filter & Search states
    const [selectedCategoryId, setSelectedCategoryId] = useState<SoundtrackCategoryFilter>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"seq" | "title">("seq");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [visibleTrackLimit, setVisibleTrackLimit] = useState(SOUNDTRACK_INITIAL_LIST_LIMIT);

    const setVolumeAndPersist = useCallback((nextVolume: number) => {
        const clampedVolume = clampVolume(nextVolume);
        setVolume(clampedVolume);
        localStorage.setItem("soundtrack-volume", clampedVolume.toString());
    }, []);

    // Load initial volume from localStorage (Client only)
    useEffect(() => {
        const savedVolume = localStorage.getItem("soundtrack-volume");
        if (savedVolume !== null) {
            setVolume(clampVolume(parseFloat(savedVolume)));
        }
        const savedMode = localStorage.getItem("soundtrack-playback-mode");
        if (isPlaybackMode(savedMode)) {
            setPlaybackMode(savedMode);
        }
    }, []);

    // Close volume popup when clicking anywhere outside
    useEffect(() => {
        if (!showVolumePopup) return;
        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest(".volume-container")) {
                setShowVolumePopup(false);
            }
        };
        document.addEventListener("click", handleOutsideClick);
        return () => document.removeEventListener("click", handleOutsideClick);
    }, [showVolumePopup]);



    // Fetch masterdata
    useEffect(() => {
        let cancelled = false;

        async function loadData() {
            try {
                setIsLoading(true);
                setDurationWarning(null);
                const [tracksData, categoriesData, durationData] = await Promise.all([
                    fetchMasterData<MysekaiMusicSoundTrackMaster[]>("musicSoundTracks.json"),
                    fetchMasterData<MysekaiMusicSoundTrackCategory[]>("musicSoundTrackCategories.json"),
                    fetchBgmDurationsData<BgmDurationsResponse>().catch((err) => {
                        console.warn("Failed to load BGM duration data:", err);
                        return null;
                    }),
                ]);

                if (cancelled) return;

                if (!durationData) {
                    setDurationWarning(t("page.soundtrack.spoiler.durationLoadFailed"));
                }

                // Sort categories and tracks initially
                const sortedCategories = [...categoriesData].sort((a, b) => a.id - b.id);
                setCategories(sortedCategories);

                const spoilerTracks = buildSpoilerTracksFromDurations(durationData, tracksData);
                const sortedTracks = [...tracksData, ...spoilerTracks].sort((a, b) => a.seq - b.seq);
                setTracks(sortedTracks);

                const nextSearchQuery = searchParams.get("search") ?? "";
                const nextSortBy = searchParams.get("sort") === "title" ? "title" : "seq";
                const nextSortOrder = searchParams.get("order") === "desc" ? "desc" : "asc";
                const visibleTracks = isShowSpoiler ? sortedTracks : sortedTracks.filter(track => !track.isSpoiler);

                // Set default track on first load, restoring from URL first and sessionStorage second.
                // Restore filters from searchParams
                const urlCat = searchParams.get("category");
                const nextCategoryId = (() => {
                    if (!urlCat) return null;
                    if (urlCat === SPOILER_CATEGORY_FILTER) return isShowSpoiler ? SPOILER_CATEGORY_FILTER : null;
                    const parsedCat = parseInt(urlCat, 10);
                    return !Number.isNaN(parsedCat) && sortedCategories.some(c => c.id === parsedCat)
                        ? parsedCat
                        : null;
                })();
                setSelectedCategoryId(nextCategoryId);

                const restoreCandidates = visibleTracks.filter((track) => {
                    if (nextCategoryId === SPOILER_CATEGORY_FILTER && !track.isSpoiler) return false;
                    if (typeof nextCategoryId === "number" && track.musicSoundTrackCategoryId !== nextCategoryId) return false;
                    if (nextSearchQuery.trim() && !getTrackSearchText(track).includes(nextSearchQuery.toLowerCase().trim())) return false;
                    return true;
                }).sort((a, b) => {
                    let comparison = 0;
                    if (nextSortBy === "seq") comparison = a.seq - b.seq;
                    else comparison = a.title.localeCompare(b.title, "ja-JP");
                    return nextSortOrder === "asc" ? comparison : -comparison;
                });

                // Set default track on first load, restoring from URL first and sessionStorage second.
                const urlTrackIdStr = searchParams.get("track");
                const savedTrackIdStr = sessionStorage.getItem("soundtrack-current-track-id");
                const restoreTrackIdStr = urlTrackIdStr ?? savedTrackIdStr;
                const restoredTrackId = restoreTrackIdStr ? parseInt(restoreTrackIdStr, 10) : NaN;
                const matchedTrack = Number.isNaN(restoredTrackId)
                    ? null
                    : visibleTracks.find(t => t.id === restoredTrackId) ?? null;
                setCurrentTrack(matchedTrack ?? restoreCandidates[0] ?? visibleTracks[0] ?? null);

                setSearchQuery(nextSearchQuery);
                setSortBy(nextSortBy);
                setSortOrder(nextSortOrder);

                setError(null);
            } catch (err) {
                if (cancelled) return;
                console.error("Failed to load soundtracks masterdata:", err);
                setError(err instanceof Error ? err.message : t("page.soundtrack.errors.fetchFailed"));
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }
        loadData();

        return () => {
            cancelled = true;
        };
    }, [searchParams, t, isShowSpoiler]);

    useEffect(() => {
        currentTimeRef.current = currentTime;
    }, [currentTime]);

    // Track audio source URL (correctly resolving Mysekai paths too)
    const selectedAudioUrl = useMemo(() => {
        if (!currentTrack) return "";
        return getMysekaiSoundTrackAudioUrl(currentTrack.assetbundleName, currentTrack.assetbundleFileName, assetSource) || "";
    }, [currentTrack, assetSource]);
    const audioUrl = hasActivatedAudio ? selectedAudioUrl : "";

    // Sync volume state to audio element
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = clampVolume(volume);
        }
    }, [volume]);

    // Save current track ID to sessionStorage for state restoration
    useEffect(() => {
        if (currentTrack) {
            sessionStorage.setItem("soundtrack-current-track-id", currentTrack.id.toString());
        }
    }, [currentTrack]);

    useEffect(() => {
        setDownloadHint(null);
        setShareHint(null);
    }, [selectedAudioUrl]);

    // Explicitly swap/restart the single audio element source so old tracks are stopped before a new one loads.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        playRequestIdRef.current += 1;
        audio.pause();
        setCurrentTime(0);
        setDuration(0);
        setAudioError(null);

        if (!audioUrl) {
            if (audio.hasAttribute("src") || audio.currentSrc) {
                audio.removeAttribute("src");
                audio.load();
            }
            setIsPlaying(false);
            return;
        }

        if (audio.src !== audioUrl) {
            audio.src = audioUrl;
            audio.load();
        }
        audio.currentTime = 0;

        return () => {
            playRequestIdRef.current += 1;
            audio.pause();
        };
    }, [audioUrl, playbackRestartNonce]);

    // Declaratively control audio playback and ignore stale play() promises from rapid track switches.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (!audioUrl || !isPlaying) {
            playRequestIdRef.current += 1;
            audio.pause();
            return;
        }

        let retryTimer: number | null = null;
        const requestId = playRequestIdRef.current + 1;
        playRequestIdRef.current = requestId;

        const tryPlay = (allowAbortRetry: boolean) => {
            audio.play()
                .then(() => {
                    if (playRequestIdRef.current === requestId) {
                        setAudioError(null);
                    }
                })
                .catch(err => {
                    if (playRequestIdRef.current !== requestId) return;

                    const isAbort = err instanceof DOMException && err.name === "AbortError";
                    if (isAbort && allowAbortRetry) {
                        retryTimer = window.setTimeout(() => {
                            if (playRequestIdRef.current === requestId && isPlaying && audioUrl) {
                                tryPlay(false);
                            }
                        }, 80);
                        return;
                    }
                    if (isAbort) return;

                    console.warn("Audio play prevented or errored:", err);
                    setIsPlaying(false);
                    setAudioError(t("page.soundtrack.errors.audioPlayFailed"));
                });
        };

        tryPlay(true);

        return () => {
            if (retryTimer !== null) {
                window.clearTimeout(retryTimer);
            }
        };
    }, [isPlaying, audioUrl, playbackRestartNonce, t]);

    // Stop playback when leaving the route/component to avoid orphaned audio.
    useEffect(() => {
        const audio = audioRef.current;
        return () => {
            playRequestIdRef.current += 1;
            if (!audio) return;
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
        };
    }, []);

    // Category dictionary for quick mapping
    const categoryMap = useMemo(() => {
        return new Map(categories.map(c => [c.id, c]));
    }, [categories]);

    const spoilerTrackCount = useMemo(() => tracks.filter(track => track.isSpoiler).length, [tracks]);
    const selectedCategoryLabel = selectedCategoryId === SPOILER_CATEGORY_FILTER
        ? t("page.soundtrack.spoiler.categoryName")
        : selectedCategoryId !== null
            ? categoryMap.get(selectedCategoryId)?.name || t("page.soundtrack.categoryFallback")
            : t("page.soundtrack.allCategory");

    // Filtered and Sorted Tracks
    const filteredTracks = useMemo(() => {
        let result = tracks;

        // 1. Hide spoiler-only supplemental tracks unless the global spoiler setting is enabled.
        if (!isShowSpoiler) {
            result = result.filter(t => !t.isSpoiler);
        }

        // 2. Filter by category
        if (selectedCategoryId === SPOILER_CATEGORY_FILTER) {
            result = result.filter(t => t.isSpoiler);
        } else if (selectedCategoryId !== null) {
            result = result.filter(t => t.musicSoundTrackCategoryId === selectedCategoryId);
        }

        // 3. Filter by search query (fuzzy search title, pronunciation, asset key, or file name)
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(t => getTrackSearchText(t).includes(query));
        }

        // 4. Sort
        result = [...result];
        result.sort((a, b) => {
            let comparison = 0;
            if (sortBy === "seq") {
                comparison = a.seq - b.seq;
            } else if (sortBy === "title") {
                comparison = a.title.localeCompare(b.title, "ja-JP");
            }
            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [tracks, selectedCategoryId, searchQuery, sortBy, sortOrder, isShowSpoiler]);

    const displayedTracks = useMemo(() => {
        return filteredTracks.slice(0, visibleTrackLimit);
    }, [filteredTracks, visibleTrackLimit]);

    const hasMoreTracks = visibleTrackLimit < filteredTracks.length;

    useEffect(() => {
        setVisibleTrackLimit(SOUNDTRACK_INITIAL_LIST_LIMIT);
    }, [selectedCategoryId, searchQuery, sortBy, sortOrder, isShowSpoiler]);

    const handlePlaylistScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        if (!hasMoreTracks) return;

        const target = event.currentTarget;
        const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
        if (distanceToBottom > SOUNDTRACK_LIST_SCROLL_THRESHOLD_PX) return;

        setVisibleTrackLimit(limit => Math.min(limit + SOUNDTRACK_LIST_BATCH_SIZE, filteredTracks.length));
    }, [filteredTracks.length, hasMoreTracks]);

    const updateTrackUrlParam = useCallback((track: MysekaiMusicSoundTrackMaster | null) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        if (track) url.searchParams.set("track", track.id.toString());
        else url.searchParams.delete("track");
        window.history.replaceState({}, "", url.toString());
    }, []);

    // Sync states to URL query parameters
    const handleFilterChange = useCallback((catId: SoundtrackCategoryFilter, search: string, sort: "seq" | "title", order: "asc" | "desc") => {
        const url = new URL(window.location.href);

        if (catId !== null) url.searchParams.set("category", catId.toString());
        else url.searchParams.delete("category");

        if (search) url.searchParams.set("search", search);
        else url.searchParams.delete("search");

        if (sort !== "seq") url.searchParams.set("sort", sort);
        else url.searchParams.delete("sort");

        if (order !== "asc") url.searchParams.set("order", order);
        else url.searchParams.delete("order");

        if (currentTrack) url.searchParams.set("track", currentTrack.id.toString());
        else url.searchParams.delete("track");

        window.history.replaceState({}, "", url.toString());
    }, [currentTrack]);

    useEffect(() => {
        if (isShowSpoiler || selectedCategoryId !== SPOILER_CATEGORY_FILTER) return;

        setSelectedCategoryId(null);
        handleFilterChange(null, searchQuery, sortBy, sortOrder);
    }, [handleFilterChange, isShowSpoiler, selectedCategoryId, searchQuery, sortBy, sortOrder]);

    useEffect(() => {
        if (!currentTrack) return;
        if (isShowSpoiler || !currentTrack.isSpoiler) return;

        const fallbackTrack = filteredTracks[0] ?? tracks.find(track => !track.isSpoiler) ?? null;
        setCurrentTrack(fallbackTrack);
        updateTrackUrlParam(fallbackTrack);
        setIsPlaying(false);
    }, [currentTrack, filteredTracks, tracks, isShowSpoiler, updateTrackUrlParam]);

    // Update active category
    const selectCategory = (catId: SoundtrackCategoryFilter) => {
        setSelectedCategoryId(catId);
        handleFilterChange(catId, searchQuery, sortBy, sortOrder);
    };

    // Update search query
    const handleSearch = (query: string) => {
        setSearchQuery(query);
        handleFilterChange(selectedCategoryId, query, sortBy, sortOrder);
    };

    // Toggle sorting parameters
    const toggleSort = (field: "seq" | "title") => {
        let newOrder: "asc" | "desc" = "asc";
        if (sortBy === field) {
            newOrder = sortOrder === "asc" ? "desc" : "asc";
        }
        setSortBy(field);
        setSortOrder(newOrder);
        handleFilterChange(selectedCategoryId, searchQuery, field, newOrder);
    };

    // Theme values for currently active track
    const currentCategory = currentTrack
        ? categoryMap.get(currentTrack.musicSoundTrackCategoryId) ?? null
        : null;

    const currentArtworkUrl = useMemo(() => {
        if (!currentTrack) return "";
        const jacketName = currentCategory?.assetbundleName ?? "jacket_s_soundtrack_1";
        return getMysekaiRawAssetUrl(
            `music_record_soundtrack/jacket/${jacketName}/${jacketName}.webp`,
            assetSource,
        );
    }, [assetSource, currentCategory, currentTrack]);

    const currentTheme = useMemo(() => {
        if (!currentTrack) return DEFAULT_THEME;
        return CATEGORY_THEMES[currentTrack.musicSoundTrackCategoryId] ?? DEFAULT_THEME;
    }, [currentTrack]);

    const syncCurrentTime = useCallback((force = false) => {
        const audio = audioRef.current;
        if (!audio) return;

        const now = performance.now();
        if (!force && now - lastProgressUpdateRef.current < SOUNDTRACK_PROGRESS_UPDATE_INTERVAL_MS) return;

        lastProgressUpdateRef.current = now;
        const nextTime = audio.currentTime;
        setCurrentTime(prevTime => {
            const safeNextTime = Number.isFinite(nextTime) ? nextTime : 0;
            return Math.abs(prevTime - safeNextTime) > 0.2 ? safeNextTime : prevTime;
        });
    }, []);

    const startPlayback = useCallback(() => {
        if (!selectedAudioUrl) return;
        setHasActivatedAudio(true);
        setIsPlaying(true);
    }, [selectedAudioUrl]);

    const pausePlayback = useCallback(() => {
        setIsPlaying(false);
    }, []);

    const stopPlayback = useCallback(() => {
        setIsPlaying(false);
        syncCurrentTime(true);
    }, [syncCurrentTime]);

    // Audio handlers
    const togglePlay = () => {
        if (isPlaying) {
            pausePlayback();
            return;
        }
        startPlayback();
    };

    const handleTimeUpdate = () => {
        syncCurrentTime();
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            const nextDuration = audioRef.current.duration;
            setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }
    };

    const getSeekableDuration = useCallback(() => {
        const audioDuration = audioRef.current?.duration;
        if (typeof audioDuration === "number" && Number.isFinite(audioDuration) && audioDuration > 0) {
            return audioDuration;
        }
        const trackDuration = currentTrack?.durationSeconds ?? duration;
        return Number.isFinite(trackDuration) && trackDuration > 0 ? trackDuration : 0;
    }, [currentTrack, duration]);

    const seekToTime = useCallback((time: number, fastSeek = false) => {
        if (!Number.isFinite(time)) return;

        const audio = audioRef.current;
        const seekableDuration = getSeekableDuration();
        const nextTime = seekableDuration > 0
            ? Math.min(seekableDuration, Math.max(0, time))
            : Math.max(0, time);

        if (audio) {
            if (fastSeek && typeof audio.fastSeek === "function") {
                try {
                    audio.fastSeek(nextTime);
                } catch {
                    audio.currentTime = nextTime;
                }
            } else {
                audio.currentTime = nextTime;
            }
        }
        currentTimeRef.current = nextTime;
        setCurrentTime(nextTime);
    }, [getSeekableDuration]);

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        seekToTime(val);
    };

    const handleVerticalVolumePointer = (event: React.PointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const nextVolume = 1 - (event.clientY - rect.top) / rect.height;
        setVolumeAndPersist(nextVolume);
    };

    const cyclePlaybackMode = () => {
        let nextMode: PlaybackMode;
        if (playbackMode === "sequential") {
            nextMode = "loop-one";
        } else if (playbackMode === "loop-one") {
            nextMode = "shuffle";
        } else {
            nextMode = "sequential";
        }
        setPlaybackMode(nextMode);
        localStorage.setItem("soundtrack-playback-mode", nextMode);
    };

    const getPlaybackList = useCallback(() => (
        filteredTracks.length > 0
            ? filteredTracks
            : tracks.filter(track => isShowSpoiler || !track.isSpoiler)
    ), [filteredTracks, tracks, isShowSpoiler]);

    const pickRandomTrack = useCallback((activeList: MysekaiMusicSoundTrackMaster[]) => {
        if (activeList.length <= 1 || !currentTrack) return activeList[0];

        const candidates = activeList.filter(track => track.id !== currentTrack.id);
        return candidates[Math.floor(Math.random() * candidates.length)] ?? activeList[0];
    }, [currentTrack]);

    // Audio navigation methods
    const playNext = useCallback(() => {
        if (tracks.length === 0 || !currentTrack) return;

        const activeList = getPlaybackList();
        if (activeList.length === 0) return;

        let nextTrack: MysekaiMusicSoundTrackMaster;

        if (playbackMode === "shuffle") {
            nextTrack = pickRandomTrack(activeList);
        } else {
            const currentIndex = activeList.findIndex(t => t.id === currentTrack.id);
            if (currentIndex !== -1 && currentIndex < activeList.length - 1) {
                nextTrack = activeList[currentIndex + 1];
            } else {
                // Loop to start
                nextTrack = activeList[0];
            }
        }

        const isRestartingSameTrack = nextTrack.id === currentTrack.id;
        setCurrentTrack(nextTrack);
        updateTrackUrlParam(nextTrack);
        setHasActivatedAudio(true);
        setIsPlaying(true);
        if (isRestartingSameTrack) {
            setPlaybackRestartNonce(nonce => nonce + 1);
        }
    }, [currentTrack, getPlaybackList, pickRandomTrack, playbackMode, tracks.length, updateTrackUrlParam]);

    useEffect(() => {
        playNextRef.current = playNext;
    }, [playNext]);

    const playPrevious = useCallback(() => {
        if (tracks.length === 0 || !currentTrack) return;

        const activeList = getPlaybackList();
        if (activeList.length === 0) return;

        let prevTrack: MysekaiMusicSoundTrackMaster;

        if (playbackMode === "shuffle") {
            prevTrack = pickRandomTrack(activeList);
        } else {
            const currentIndex = activeList.findIndex(t => t.id === currentTrack.id);
            if (currentIndex > 0) {
                prevTrack = activeList[currentIndex - 1];
            } else {
                // Loop to end
                prevTrack = activeList[activeList.length - 1];
            }
        }

        const isRestartingSameTrack = prevTrack.id === currentTrack.id;
        setCurrentTrack(prevTrack);
        updateTrackUrlParam(prevTrack);
        setHasActivatedAudio(true);
        setIsPlaying(true);
        if (isRestartingSameTrack) {
            setPlaybackRestartNonce(nonce => nonce + 1);
        }
    }, [currentTrack, getPlaybackList, pickRandomTrack, playbackMode, tracks.length, updateTrackUrlParam]);

    useEffect(() => {
        const mediaSession = getSoundtrackMediaSession();
        if (!mediaSession) return;

        if (!currentTrack) {
            setSoundtrackMediaSessionMetadata(mediaSession, null);
            return;
        }

        const title = getDisplayTrackTitle(currentTrack, t);
        const categoryName = currentCategory?.name || "Soundtrack";
        const artist = currentTrack.pronunciation || categoryName;
        const metadata = createSoundtrackMediaMetadata({
            title,
            artist,
            album: categoryName,
            artwork: currentArtworkUrl
                ? SOUNDTRACK_MEDIA_ARTWORK_SIZES.map(size => ({
                    src: currentArtworkUrl,
                    sizes: size,
                    type: "image/webp",
                }))
                : undefined,
        });

        if (metadata) {
            setSoundtrackMediaSessionMetadata(mediaSession, metadata);
        }
    }, [currentArtworkUrl, currentCategory, currentTrack, t]);

    useEffect(() => {
        const mediaSession = getSoundtrackMediaSession();
        if (!mediaSession) return;

        setSoundtrackMediaSessionPlaybackState(
            mediaSession,
            audioUrl ? isPlaying ? "playing" : "paused" : "none",
        );
    }, [audioUrl, isPlaying]);

    useEffect(() => {
        const mediaSession = getSoundtrackMediaSession();
        if (!mediaSession?.setPositionState) return;

        const positionDuration = getSeekableDuration();
        if (!audioUrl || positionDuration <= 0) {
            try {
                mediaSession.setPositionState();
            } catch {
                // Some browsers require a full position state or do not support clearing.
            }
            return;
        }

        try {
            mediaSession.setPositionState({
                duration: positionDuration,
                playbackRate: audioRef.current?.playbackRate || 1,
                position: Math.min(positionDuration, Math.max(0, currentTime)),
            });
        } catch (err) {
            console.warn("Failed to update soundtrack media position:", err);
        }
    }, [audioUrl, currentTime, duration, getSeekableDuration]);

    useEffect(() => {
        const mediaSession = getSoundtrackMediaSession();
        if (!mediaSession) return;

        setSoundtrackMediaSessionActionHandler(mediaSession, "play", startPlayback);
        setSoundtrackMediaSessionActionHandler(mediaSession, "pause", pausePlayback);
        setSoundtrackMediaSessionActionHandler(mediaSession, "stop", stopPlayback);
        setSoundtrackMediaSessionActionHandler(mediaSession, "previoustrack", playPrevious);
        setSoundtrackMediaSessionActionHandler(mediaSession, "nexttrack", playNext);
        setSoundtrackMediaSessionActionHandler(mediaSession, "seekbackward", (details) => {
            const offset = details?.seekOffset ?? SOUNDTRACK_MEDIA_SEEK_OFFSET_SECONDS;
            const audioTime = audioRef.current?.currentTime;
            const baseTime = typeof audioTime === "number" && Number.isFinite(audioTime) ? audioTime : currentTimeRef.current;
            seekToTime(baseTime - offset);
        });
        setSoundtrackMediaSessionActionHandler(mediaSession, "seekforward", (details) => {
            const offset = details?.seekOffset ?? SOUNDTRACK_MEDIA_SEEK_OFFSET_SECONDS;
            const audioTime = audioRef.current?.currentTime;
            const baseTime = typeof audioTime === "number" && Number.isFinite(audioTime) ? audioTime : currentTimeRef.current;
            seekToTime(baseTime + offset);
        });
        setSoundtrackMediaSessionActionHandler(mediaSession, "seekto", (details) => {
            if (typeof details?.seekTime !== "number") return;
            seekToTime(details.seekTime, Boolean(details.fastSeek));
        });

        return () => {
            (["play", "pause", "stop", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"] as const).forEach((action) => {
                setSoundtrackMediaSessionActionHandler(mediaSession, action, null);
            });
        };
    }, [pausePlayback, playNext, playPrevious, seekToTime, startPlayback, stopPlayback]);

    useEffect(() => {
        const mediaSession = getSoundtrackMediaSession();
        return () => {
            if (!mediaSession) return;
            setSoundtrackMediaSessionMetadata(mediaSession, null);
            setSoundtrackMediaSessionPlaybackState(mediaSession, "none");
        };
    }, []);

    const handleEnded = useCallback(() => {
        if (playbackMode === "loop-one") {
            const audio = audioRef.current;
            if (!audio) return;

            const requestId = playRequestIdRef.current + 1;
            playRequestIdRef.current = requestId;
            audio.currentTime = 0;
            audio.play().catch(err => {
                if (playRequestIdRef.current !== requestId) return;
                console.error("Replay blocked:", err);
                setIsPlaying(false);
                setAudioError(t("page.soundtrack.errors.loopReplayFailed"));
            });
        } else {
            playNextRef.current();
        }
    }, [playbackMode, t]);

    const handleTrackSelect = (track: MysekaiMusicSoundTrackMaster) => {
        setCurrentTrack(track);
        updateTrackUrlParam(track);
        setHasActivatedAudio(true);
        setIsPlaying(true);
    };

    const handleDownloadCurrentTrack = async () => {
        if (!currentTrack || !selectedAudioUrl || isDownloading) return;

        const downloadUrl = selectedAudioUrl;
        const fileName = getTrackDownloadFileName(currentTrack);
        setIsDownloading(true);
        setDownloadHint(null);
        setShareHint(null);

        try {
            const cachedBlob = await readAudioBlobFromCache(downloadUrl);
            if (cachedBlob) {
                triggerBlobDownload(cachedBlob, fileName);
                setDownloadHint(t("page.soundtrack.download.cachedHint"));
                return;
            }

            const response = await fetch(downloadUrl, { cache: "force-cache" });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const blob = await response.blob();
            if (blob.size === 0) {
                throw new Error("EMPTY_AUDIO_BLOB");
            }

            await storeAudioBlobInCache(downloadUrl, blob);
            triggerBlobDownload(blob, fileName);
            setDownloadHint(t("page.soundtrack.download.cachedAndStartedHint"));
        } catch (err) {
            console.warn("Soundtrack download fallback to direct link:", err);
            triggerDirectDownload(downloadUrl, fileName);
            setDownloadHint(t("page.soundtrack.download.directHint"));
        } finally {
            setIsDownloading(false);
        }
    };

    const buildCurrentTrackShareUrl = useCallback(() => {
        if (!currentTrack || typeof window === "undefined") return "";
        const url = new URL(window.location.href);
        url.searchParams.set("track", currentTrack.id.toString());
        if (selectedCategoryId !== null) url.searchParams.set("category", selectedCategoryId.toString());
        else url.searchParams.delete("category");
        if (searchQuery) url.searchParams.set("search", searchQuery);
        else url.searchParams.delete("search");
        if (sortBy !== "seq") url.searchParams.set("sort", sortBy);
        else url.searchParams.delete("sort");
        if (sortOrder !== "asc") url.searchParams.set("order", sortOrder);
        else url.searchParams.delete("order");
        return url.toString();
    }, [currentTrack, selectedCategoryId, searchQuery, sortBy, sortOrder]);

    const handleShareCurrentTrack = useCallback(async () => {
        if (!currentTrack) return;

        const url = buildCurrentTrackShareUrl();
        if (!url) return;

        setDownloadHint(null);
        setShareHint(null);

        const title = getDisplayTrackTitle(currentTrack, t);
        try {
            if (navigator.share) {
                await navigator.share({
                    title,
                    text: t("page.soundtrack.share.nativeText", { title }),
                    url,
                });
                setShareHint(t("page.soundtrack.share.sharedHint"));
                return;
            }

            await navigator.clipboard.writeText(url);
            setShareHint(t("page.soundtrack.share.copiedHint"));
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            console.warn("Failed to share soundtrack URL:", err);
            setShareHint(t("page.soundtrack.share.failedHint"));
        }
    }, [buildCurrentTrackShareUrl, currentTrack, t]);

    // Format seconds into MM:SS
    const formatTime = (time: number) => {
        if (!Number.isFinite(time)) return "00:00";
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    const displayDuration = currentTrack?.durationSeconds ?? duration;

    const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
    const playbackModeLabel = playbackMode === "sequential"
        ? t("page.soundtrack.playbackModes.sequential")
        : playbackMode === "loop-one"
            ? t("page.soundtrack.playbackModes.loopOne")
            : t("page.soundtrack.playbackModes.shuffle");
    const playbackModeIcon = playbackMode === "sequential" ? mdRepeat : playbackMode === "loop-one" ? mdRepeatOne : mdShuffle;
    const volumeIcon = volume === 0 ? mdVolumeOff : volume < 0.4 ? mdVolumeDown : mdVolumeUp;
    const getJacketUrl = (categoryId: number) => {
        const jacketName = categoryMap.get(categoryId)?.assetbundleName ?? "jacket_s_soundtrack_1";
        return getMysekaiRawAssetUrl(`music_record_soundtrack/jacket/${jacketName}/${jacketName}.webp`, assetSource);
    };
    const sortOptions = [
        { field: "seq" as const, label: t("page.soundtrack.filters.sortBySeq") },
        { field: "title" as const, label: t("page.soundtrack.filters.sortByTitle") },
    ];

    return (
        <div className="relative w-full select-none text-on-surface">
            {/* Embedded styles for spinning CD animations to ensure smooth pause/resumes */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes spin-cd {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-cd-spin {
                    animation: spin-cd 30s linear infinite;
                    will-change: transform;
                }
                @media (prefers-reduced-motion: reduce) {
                    .animate-cd-spin { animation: none; }
                }
                .custom-slider-thumb::-webkit-slider-thumb {
                    appearance: none;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: ${currentTheme.from};
                    cursor: pointer;
                }
                .custom-slider-thumb::-moz-range-thumb {
                    width: 14px;
                    height: 14px;
                    border: 0;
                    border-radius: 50%;
                    background: ${currentTheme.from};
                    cursor: pointer;
                }

                .vertical-volume-hitbox {
                    touch-action: none;
                }
                /* Hide scrollbars completely while remaining scrollable */
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                /* Thin custom scrollbar for playlist */
                .custom-playlist-scrollbar {
                    scrollbar-width: thin;
                    scrollbar-color: var(--md-sys-color-outline-variant) transparent;
                }
            `}} />

            {/* Hidden HTML5 Audio Element */}
            <audio
                ref={audioRef}
                preload="metadata"
                crossOrigin="anonymous"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onDurationChange={handleLoadedMetadata}
                onEnded={handleEnded}
                onError={(e) => {
                    console.error("Audio playback error:", e);
                    setAudioError(t("page.soundtrack.errors.audioLoadFailed"));
                    setIsPlaying(false);
                }}
            />

            <PageContainer className="relative z-10">
                <PageHeader
                    eyebrow={t("page.soundtrack.badge")}
                    title={t("page.soundtrack.title")}
                    highlight={t("page.soundtrack.titleHighlight")}
                    description={t("page.soundtrack.description")}
                />

                {/* Main Content Layout */}
                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">

                    {/* Left Column: Music Player */}
                    <div className="w-full lg:col-span-5">
                        <Surface tone="low" className="relative overflow-hidden p-6 sm:p-8">

                            {/* Accent line in the category color */}
                            <div
                                className="absolute inset-x-0 top-0 h-[3px]"
                                style={{ background: `linear-gradient(to right, transparent, ${currentTheme.from}, transparent)` }}
                            />

                            {/* Album Art - Rotating CD (artwork, fixed dark vinyl colors are intentional) */}
                            <div className="relative mx-auto mb-8 flex aspect-square w-full max-w-[280px] items-center justify-center sm:max-w-[320px]">
                                <div className="pointer-events-none absolute inset-4 scale-95 rounded-full bg-shadow/30 blur-lg" />

                                <div className="relative flex h-full w-full select-none items-center justify-center rounded-full bg-[#0a0a0a] p-[6px] shadow-inner">
                                    {/* Concentric Grooves */}
                                    <div className="pointer-events-none absolute inset-2 rounded-full border border-[#171717]" />
                                    <div className="pointer-events-none absolute inset-6 rounded-full border border-[#171717]" />
                                    <div className="pointer-events-none absolute inset-12 rounded-full border border-[#171717]" />
                                    <div className="pointer-events-none absolute inset-20 rounded-full border border-[#171717]" />

                                    {/* Center spinning core */}
                                    <div className={`relative flex h-4/5 w-4/5 items-center justify-center overflow-hidden rounded-full bg-[#171717] ${isPlaying ? "animate-cd-spin" : ""}`}>
                                        {currentTrack && (
                                            <div className="relative h-full w-full">
                                                <Image
                                                    src={getJacketUrl(currentTrack.musicSoundTrackCategoryId)}
                                                    alt={currentTrack.title}
                                                    fill
                                                    className="object-cover"
                                                    unoptimized
                                                    priority
                                                />
                                            </div>
                                        )}

                                        {/* CD Hole Trim */}
                                        <div className="absolute z-20 flex h-12 w-12 items-center justify-center rounded-full border-4 border-[#262626] bg-[#0a0a0a]">
                                            <div className="h-4 w-4 rounded-full bg-surface-container-low" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Song Meta Info */}
                            <div className="mb-6 px-2 text-center">
                                <div key={currentTrack?.id || "empty"}>
                                    <h2 className="max-w-full truncate type-title-l text-on-surface">
                                        {getDisplayTrackTitle(currentTrack, t)}
                                    </h2>
                                    <p className="mt-1 truncate type-body-s text-on-surface-variant">
                                        {currentTrack?.pronunciation || t("page.soundtrack.pronunciationLoading")}
                                    </p>
                                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                                        <span className="inline-flex h-7 items-center rounded-md3-sm bg-secondary-container px-3 type-label-m text-on-secondary-container">
                                            {currentTrack ? (categoryMap.get(currentTrack.musicSoundTrackCategoryId)?.name || "BGM") : "..."}
                                        </span>
                                        {currentTrack?.isSpoiler && (
                                            <span className="inline-flex h-7 items-center rounded-md3-sm bg-tertiary-container px-3 type-label-m text-on-tertiary-container">
                                                {t("common.badge.spoiler")}
                                            </span>
                                        )}
                                        {currentTrack && Number.isFinite(displayDuration) && displayDuration > 0 && (
                                            <span className="inline-flex h-7 items-center rounded-md3-sm border border-outline-variant px-3 font-mono type-label-m text-on-surface-variant" title={t("page.soundtrack.durationLabel")}>
                                                {formatTime(displayDuration)}
                                            </span>
                                        )}
                                        <Button
                                            variant="tonal"
                                            size="xs"
                                            icon={isDownloading ? undefined : mdDownload}
                                            onClick={handleDownloadCurrentTrack}
                                            disabled={!currentTrack || !selectedAudioUrl || isDownloading}
                                            title={isDownloading ? t("page.soundtrack.download.preparingTitle") : t("page.soundtrack.download.currentTitle")}
                                        >
                                            {isDownloading && <CircularProgress size={16} strokeWidth={2} />}
                                            {isDownloading ? t("page.soundtrack.download.preparing") : t("page.soundtrack.download.button")}
                                        </Button>
                                        <Button
                                            variant="tonal"
                                            size="xs"
                                            icon={mdShare}
                                            onClick={handleShareCurrentTrack}
                                            disabled={!currentTrack}
                                            title={t("page.soundtrack.share.currentTitle")}
                                        >
                                            {t("page.soundtrack.share.button")}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {audioError && (
                                <Banner tone="error" className="mb-4">{audioError}</Banner>
                            )}
                            {(downloadHint || shareHint || durationWarning) && !audioError && (
                                <Banner tone="info" className="mb-4">{downloadHint || shareHint || durationWarning}</Banner>
                            )}

                            {/* Progress Bar (category color is game data) */}
                            <div className="mb-6">
                                <input
                                    type="range"
                                    min="0"
                                    max={duration || 100}
                                    value={currentTime}
                                    onChange={handleSeek}
                                    onPointerDown={() => syncCurrentTime(true)}
                                    aria-label={t("page.soundtrack.durationLabel")}
                                    className="custom-slider-thumb focus-ring h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none"
                                    style={{
                                        background: `linear-gradient(to right, ${currentTheme.from} 0%, ${currentTheme.from} ${progressPercent}%, var(--md-sys-color-surface-container-highest) ${progressPercent}%, var(--md-sys-color-surface-container-highest) 100%)`
                                    }}
                                />
                                <div className="mt-2 flex items-center justify-between font-mono type-label-s text-on-surface-variant">
                                    <span>{formatTime(currentTime)}</span>
                                    <span>{formatTime(duration)}</span>
                                </div>
                            </div>

                            {/* Player Controls */}
                            <div className="mx-auto mb-2 flex max-w-sm items-center justify-between gap-2 px-2">

                                {/* Playback Mode (Cycle Button) */}
                                <IconButton
                                    icon={playbackModeIcon}
                                    label={playbackModeLabel}
                                    variant={playbackMode === "sequential" ? "standard" : "tonal"}
                                    onClick={cyclePlaybackMode}
                                />

                                {/* Playback Navigation & Action Group */}
                                <div className="flex items-center gap-3">
                                    <IconButton
                                        icon={mdSkipPreviousFill}
                                        label={t("page.soundtrack.controls.previous")}
                                        onClick={playPrevious}
                                    />

                                    <IconButton
                                        icon={isPlaying ? mdPauseFill : mdPlayArrowFill}
                                        label={isPlaying ? t("page.soundtrack.controls.pause") : t("page.soundtrack.controls.play")}
                                        variant="filled"
                                        size="m"
                                        width="wide"
                                        shape={isPlaying ? "square" : "round"}
                                        onClick={togglePlay}
                                    />

                                    <IconButton
                                        icon={mdSkipNextFill}
                                        label={t("page.soundtrack.controls.next")}
                                        onClick={playNext}
                                    />
                                </div>

                                {/* Volume (Popover Dropup Trigger) */}
                                <div
                                    className="volume-container group relative flex items-center justify-center"
                                    onMouseEnter={() => setShowVolumePopup(true)}
                                    onMouseLeave={() => setShowVolumePopup(false)}
                                >
                                    {/* Vertical Volume Popover Wrapper (Bridges the Gap) */}
                                    <div
                                        className={`absolute bottom-full left-1/2 z-30 -translate-x-1/2 pb-3 transition-[opacity,transform] duration-200 ease-md3-standard ${
                                            showVolumePopup
                                                ? "pointer-events-auto translate-y-0 opacity-100"
                                                : "pointer-events-none translate-y-2 opacity-0"
                                        }`}
                                    >
                                        <div
                                            className="flex flex-col items-center gap-3 rounded-md3-lg bg-surface-container p-4 shadow-elev-2"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <span className="font-mono type-label-s text-on-surface-variant">
                                                {`${Math.round(volume * 100)}%`}
                                            </span>
                                            <div
                                                className="vertical-volume-hitbox focus-ring relative flex h-28 w-8 cursor-pointer items-center justify-center rounded-md3-sm"
                                                role="slider"
                                                tabIndex={0}
                                                aria-label={t("page.soundtrack.controls.volume")}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-valuenow={Math.round(volume * 100)}
                                                onPointerDown={(event) => {
                                                    event.currentTarget.setPointerCapture(event.pointerId);
                                                    handleVerticalVolumePointer(event);
                                                }}
                                                onPointerMove={(event) => {
                                                    if (event.buttons !== 1) return;
                                                    handleVerticalVolumePointer(event);
                                                }}
                                                onClick={(event) => event.stopPropagation()}
                                                onKeyDown={(event) => {
                                                    const step = event.shiftKey ? 0.1 : 0.05;
                                                    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
                                                        event.preventDefault();
                                                        setVolumeAndPersist(volume + step);
                                                    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
                                                        event.preventDefault();
                                                        setVolumeAndPersist(volume - step);
                                                    } else if (event.key === "PageUp") {
                                                        event.preventDefault();
                                                        setVolumeAndPersist(volume + 0.1);
                                                    } else if (event.key === "PageDown") {
                                                        event.preventDefault();
                                                        setVolumeAndPersist(volume - 0.1);
                                                    } else if (event.key === "Home") {
                                                        event.preventDefault();
                                                        setVolumeAndPersist(0);
                                                    } else if (event.key === "End") {
                                                        event.preventDefault();
                                                        setVolumeAndPersist(1);
                                                    }
                                                }}
                                            >
                                                <div className="pointer-events-none relative flex h-24 w-1.5 items-end overflow-hidden rounded-full bg-surface-container-highest">
                                                    <div
                                                        className="w-full rounded-full bg-primary transition-[height] duration-75"
                                                        style={{ height: `${volume * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <IconButton
                                        icon={volumeIcon}
                                        label={t("page.soundtrack.controls.volumeAdjust")}
                                        selected={showVolumePopup}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowVolumePopup(!showVolumePopup);
                                        }}
                                    />
                                </div>
                            </div>
                        </Surface>
                    </div>

                    {/* Right Column: Categories & Playlist */}
                    <div className="flex w-full flex-col gap-6 lg:col-span-7">

                        {/* Category Cards Filter Carousel */}
                        <div className="w-full">
                            <h3 className="mb-3 flex items-center gap-2 type-title-s text-on-surface">
                                <Icon path={mdSell} size={20} className="text-primary" />
                                {t("page.soundtrack.filters.categoryTitle")}
                            </h3>

                            {/* Horizontal sliding categories list (scrollbars hidden via no-scrollbar) */}
                            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-3">
                                {/* "ALL" Card */}
                                <button
                                    type="button"
                                    aria-pressed={selectedCategoryId === null}
                                    onClick={() => selectCategory(null)}
                                    className={`state-layer focus-ring relative flex h-16 w-24 flex-shrink-0 flex-col justify-between overflow-hidden rounded-md3-md p-2.5 text-left transition-colors duration-150 ease-md3-standard ${
                                        selectedCategoryId === null
                                            ? "bg-secondary-container text-on-secondary-container ring-2 ring-primary"
                                            : "bg-surface-container text-on-surface"
                                    }`}
                                >
                                    <span className="type-label-s text-on-surface-variant">ALL</span>
                                    <span className="type-label-l">{t("page.soundtrack.allCategory")}</span>
                                </button>

                                {/* Spoiler-only supplemental BGM category */}
                                {isShowSpoiler && (
                                    <button
                                        type="button"
                                        aria-pressed={selectedCategoryId === SPOILER_CATEGORY_FILTER}
                                        onClick={() => selectCategory(SPOILER_CATEGORY_FILTER)}
                                        className={`state-layer focus-ring relative flex h-16 w-32 flex-shrink-0 flex-col justify-between overflow-hidden rounded-md3-md p-2.5 text-left transition-colors duration-150 ease-md3-standard ${
                                            selectedCategoryId === SPOILER_CATEGORY_FILTER
                                                ? "bg-tertiary-container text-on-tertiary-container ring-2"
                                                : "bg-surface-container text-on-surface"
                                        }`}
                                        style={{
                                            ["--tw-ring-color" as string]: SPOILER_CATEGORY_THEME.from,
                                            borderLeft: `3px solid ${SPOILER_CATEGORY_THEME.from}`,
                                            } as CSSProperties}
                                    >
                                        <span className="relative z-10 type-label-s text-tertiary">
                                            {t("common.badge.spoiler")} · {formatNumber(spoilerTrackCount)}
                                        </span>
                                        <span className="relative z-10 block max-w-full truncate type-label-l">
                                            {t("page.soundtrack.spoiler.categoryName")}
                                        </span>
                                    </button>
                                )}

                                {/* List of Categories */}
                                {categories.map(cat => {
                                    const active = selectedCategoryId === cat.id;
                                    const theme = CATEGORY_THEMES[cat.id] ?? DEFAULT_THEME;

                                    return (
                                        <button
                                            type="button"
                                            key={cat.id}
                                            aria-pressed={active}
                                            onClick={() => selectCategory(cat.id)}
                                            className={`group state-layer focus-ring relative flex h-16 w-32 flex-shrink-0 flex-col justify-between overflow-hidden rounded-md3-md p-2.5 text-left transition-colors duration-150 ease-md3-standard ${
                                                active
                                                    ? "bg-secondary-container text-on-secondary-container ring-2"
                                                    : "bg-surface-container text-on-surface"
                                            }`}
                                            style={{
                                                ["--tw-ring-color" as string]: theme.from,
                                                borderLeft: `3px solid ${theme.from}`,
                                                } as CSSProperties}
                                        >
                                            {/* Faint jacket background */}
                                            {isPerformanceVisuals && (
                                                <div className="pointer-events-none absolute inset-0 opacity-15">
                                                    <Image
                                                        src={getMysekaiRawAssetUrl(`music_record_soundtrack/jacket/${cat.assetbundleName}/${cat.assetbundleName}.webp`, assetSource)}
                                                        alt=""
                                                        fill
                                                        className="object-cover"
                                                        unoptimized
                                                    />
                                                </div>
                                            )}

                                            {/* Category Indicator Tag */}
                                            <span className="relative z-10 type-label-s text-on-surface-variant">
                                                CAT #{cat.id}
                                            </span>

                                            {/* Name */}
                                            <span className="relative z-10 block max-w-full truncate type-label-l">
                                                {cat.name}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Search and Sort Toolbar */}
                        <Surface tone="low" radius="lg" className="flex flex-col items-center justify-between gap-4 p-4 sm:flex-row">

                            {/* Fuzzy Search Box */}
                            <TextField
                                data-shortcut-search="true"
                                containerClassName="w-full sm:w-72"
                                dense
                                icon={mdSearch}
                                placeholder={t("page.soundtrack.filters.searchPlaceholder")}
                                aria-label={t("page.soundtrack.filters.searchPlaceholder")}
                                value={searchQuery}
                                onValueChange={handleSearch}
                                clearable
                                clearLabel={t("common.md3.clear")}
                            />

                            {/* Sort Actions */}
                            <div className="flex w-full flex-shrink-0 justify-end gap-2 sm:w-auto">
                                {sortOptions.map(({ field, label }) => (
                                    <Chip
                                        key={field}
                                        selected={sortBy === field}
                                        showCheckmark={false}
                                        trailingIcon={sortBy === field ? (sortOrder === "asc" ? mdArrowUpward : mdArrowDownward) : undefined}
                                        onClick={() => toggleSort(field)}
                                    >
                                        {label}
                                    </Chip>
                                ))}
                            </div>
                        </Surface>

                        {/* Playlist Box */}
                        <Surface tone="low" className="relative flex max-h-[560px] min-h-[420px] flex-1 flex-col overflow-hidden">

                            {/* Inner Scroll container */}
                            <div className="custom-playlist-scrollbar flex-1 overflow-y-auto p-3" onScroll={handlePlaylistScroll}>
                                {isLoading ? (
                                    <LoadingState className="min-h-80" label={t("page.soundtrack.states.loading")} />
                                ) : error ? (
                                    <EmptyState
                                        icon={mdError}
                                        title={t("page.soundtrack.states.loadFailedTitle")}
                                        description={error}
                                    />
                                ) : filteredTracks.length === 0 ? (
                                    <EmptyState
                                        icon={mdMusicOff}
                                        title={t("page.soundtrack.states.noResultsTitle")}
                                        description={t("page.soundtrack.states.noResultsDescription")}
                                    />
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {displayedTracks.map((track) => {
                                            const isActive = currentTrack?.id === track.id;
                                            const trackTheme = CATEGORY_THEMES[track.musicSoundTrackCategoryId] ?? DEFAULT_THEME;

                                            return (
                                                <button
                                                    type="button"
                                                    key={track.id}
                                                    aria-current={isActive ? "true" : undefined}
                                                    onClick={() => handleTrackSelect(track)}
                                                    className={`group state-layer focus-ring flex w-full items-center justify-between rounded-md3-lg p-3 text-left transition-colors duration-150 ease-md3-standard ${
                                                        isActive
                                                            ? "bg-secondary-container text-on-secondary-container"
                                                            : "text-on-surface"
                                                    }`}
                                                >
                                                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                                                        {/* Play Index or Active equalizer indicator */}
                                                        <div className="flex w-8 flex-shrink-0 items-center justify-center">
                                                            {isActive && isPlaying ? (
                                                                <Icon path={mdGraphicEq} size={20} style={{ color: trackTheme.from }} />
                                                            ) : (
                                                                <span className={`font-mono type-label-m ${isActive ? "text-primary" : "text-on-surface-variant"}`}>
                                                                    {track.seq.toString().padStart(3, "0")}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Cover thumbnail */}
                                                        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md3-sm">
                                                            <Image
                                                                src={getJacketUrl(track.musicSoundTrackCategoryId)}
                                                                alt={track.title}
                                                                fill
                                                                className="object-cover"
                                                                sizes="40px"
                                                                loading="lazy"
                                                                unoptimized
                                                            />
                                                            {/* Hover Play Arrow Overlay */}
                                                            <div className="absolute inset-0 flex items-center justify-center bg-scrim/40 text-inverse-on-surface opacity-0 transition-opacity group-hover:opacity-100">
                                                                <Icon path={mdPlayArrowFill} size={20} />
                                                            </div>
                                                        </div>

                                                        {/* Titles */}
                                                        <div className="min-w-0 flex-1">
                                                            <h4 className="truncate type-title-s">
                                                                {getDisplayTrackTitle(track, t)}
                                                            </h4>
                                                            <p className="mt-0.5 truncate type-body-s text-on-surface-variant">
                                                                {track.pronunciation}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Right info: category tag, spoiler badge, duration, and action hint */}
                                                    <div className="ml-2 flex flex-shrink-0 items-center gap-2">
                                                        <span className="hidden max-w-[80px] truncate rounded-md3-xs bg-surface-container-highest px-2 py-0.5 type-label-s text-on-surface-variant sm:inline-block">
                                                            {categoryMap.get(track.musicSoundTrackCategoryId)?.name || "BGM"}
                                                        </span>
                                                        {track.isSpoiler && (
                                                            <span className="rounded-md3-xs bg-tertiary px-2 py-0.5 type-label-s text-on-tertiary">
                                                                {t("common.badge.spoiler")}
                                                            </span>
                                                        )}
                                                        {track.durationSeconds !== undefined && (
                                                            <span className="hidden rounded-md3-xs border border-outline-variant px-2 py-0.5 font-mono type-label-s text-on-surface-variant sm:inline-block">
                                                                {formatTime(track.durationSeconds)}
                                                            </span>
                                                        )}
                                                        <Icon path={mdChevronRight} size={20} className="text-on-surface-variant" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {hasMoreTracks && (
                                            <div className="flex justify-center py-3">
                                                <Button
                                                    variant="outlined"
                                                    size="xs"
                                                    onClick={() => setVisibleTrackLimit(limit => Math.min(limit + SOUNDTRACK_LIST_BATCH_SIZE, filteredTracks.length))}
                                                >
                                                    {formatNumber(Math.min(visibleTrackLimit, filteredTracks.length))} / {formatNumber(filteredTracks.length)}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Playlist footer statistics */}
                            <div className="border-t border-outline-variant bg-surface-container px-6 py-3 text-center type-label-m text-on-surface-variant">
                                {t("page.soundtrack.footer", {
                                    shown: formatNumber(filteredTracks.length),
                                    total: formatNumber(tracks.length),
                                    category: selectedCategoryLabel,
                                })}
                            </div>
                        </Surface>

                    </div>
                </div>
            </PageContainer>
        </div>
    );
}

export default function SoundtrackClient() {
    const { t } = useI18n();

    return (
        <MainLayout>
            <Suspense fallback={<LoadingState className="min-h-[80vh]" label={t("page.soundtrack.states.suspenseLoading")} />}>
                <SoundtrackContent />
            </Suspense>
        </MainLayout>
    );
}
