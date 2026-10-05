"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import ExternalLink from "@/components/ExternalLink";
import { useI18n } from "@/contexts/I18nContext";
import type { HitEvent, HudRuntimeState, PreviewRuntimeConfig, TransportState } from "@/lib/chart-preview/types";
import { AudioTransport } from "@/lib/chart-preview/audioTransport";
import { GlPreviewRenderer } from "@/lib/chart-preview/glRenderer";
import { MmwWasmPreview } from "@/lib/chart-preview/mmwWasm";
import { MmwEffectSystem } from "@/lib/chart-preview/mmwEffectSystem";
import { JudgementEffects } from "@/lib/chart-preview/judgementEffects";
import { JudgementSounds } from "@/lib/chart-preview/judgementSounds";
import { normalizeOffsetMs } from "@/lib/chart-preview/url";
import { HudTimeline } from "@/lib/chart-preview/hudTimeline";
import { generateOverlayV3BackgroundObjectUrl } from "@/lib/chart-preview/overlayBackgroundGen";
import { MOE_LOGO_URL } from "@/lib/assets";
import { Button, Chip, Icon, IconButton, LoadingIndicator } from "@/components/md3";
import {
    mdBookmark,
    mdErrorFill,
    mdFitScreen,
    mdFullscreen,
    mdFullscreenExit,
    mdLock,
    mdLockOpen,
    mdPauseFill,
    mdPlayArrowFill,
    mdReplay,
    mdStopFill,
} from "@/components/md3/icons";
import "./hud.css";

const defaultConfig: PreviewRuntimeConfig = {
    mirror: false,
    flickAnimation: true,
    holdAnimation: true,
    simultaneousLine: true,
    noteSpeed: 10.5,
    holdAlpha: 0.74,
    guideAlpha: 0.5,
    stageOpacity: 1,
    backgroundBrightness: 1,
    effectOpacity: 1,
};

type PreviewState = "init" | "loading" | "ready" | "error";

type WebkitFullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitFullscreenElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
};

const LS_NOTE_SPEED = "chart-preview-note-speed";
const LS_SE_VOLUME = "chart-preview-se-volume";
const LS_BGM_VOLUME = "chart-preview-bgm-volume";
const LS_PLAYBACK_RATE = "chart-preview-playback-rate";
const LS_RENDER_SCALE = "chart-preview-render-scale";

const RENDER_SCALE_OPTIONS = [
    { value: 0.5, label: "50%" },
    { value: 0.75, label: "75%" },
    { value: 1, label: "100%" },
] as const;

// HUD constants
const HUD_INTRO_DURATION_SEC = 5.5;
const INTRO_CLEAN_BG_DURATION_SEC = 0.6;
const INTRO_PLAYFIELD_FADE_IN_SEC = 1.2;
const INTRO_BG_WIDTH = 1920;
const INTRO_BG_HEIGHT = 1080;
const INTRO_BG_BASE_COLOR = "rgba(104, 104, 156, 0.8)";
const INTRO_GRAD_DURATION_SEC = 1.8;
const INTRO_GRAD_START_SEC = 0.3;
const INTRO_GRAD_START_Y = 1500;
const INTRO_GRAD_END_Y = 0;
const INTRO_GRAD_DRAW_WIDTH = 2400;
const INTRO_GRAD_DRAW_HEIGHT = 1400;
const INTRO_GRAD_ALPHA = 0.1;
const COMBO_DIGIT_STEP = 92;
const COMBO_BASE_SCALE = 0.85;
const JUDGE_ANIMATION_FPS = 60;
const JUDGE_ANIMATION_TOTAL_FRAMES = 20;
const SCORE_PLUS_VISIBLE_SEC = 0.6;
const SCORE_PLUS_SLIDE_IN_PX = 12;
const SCORE_PLUS_FLOAT_PX = 8;
const LIFE_MAX_VALUE = 2000;

const MIN_CHART_LEAD_IN_SEC = 9;
const AUTO_BADGE_SHOW_AFTER_SEC = HUD_INTRO_DURATION_SEC + INTRO_CLEAN_BG_DURATION_SEC + INTRO_PLAYFIELD_FADE_IN_SEC;
const AUTO_BADGE_ANIM_PERIOD_SEC = 1.25;
const AUTO_BADGE_ANIM_SPAN = 1.2;

const FIXED_BACKGROUND_URL = "/assets/mmw/background_overlay.png";

function toAssetUrl(path: string) {
    return encodeURI(path);
}

// ── HUD image preload cache ──
// All HUD digit/sprite images are fetched once and converted to object URLs.
// Using blob object URLs as img.src ensures the browser never issues additional
// network requests when DOM elements are created or re-inserted.
const hudBlobUrlCache = new Map<string, string>();

function preloadHudImages(): Promise<void> {
    if (hudBlobUrlCache.size > 0) return Promise.resolve();

    const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const paths: string[] = [];

    for (const d of [...digits, "n", "+"]) {
        paths.push(`/assets/mmw/overlay/score/digit/${d}.png`);
        paths.push(`/assets/mmw/overlay/score/digit/s${d}.png`);
    }
    for (const d of digits) {
        paths.push(`/assets/mmw/overlay/combo/b${d}.png`);
        paths.push(`/assets/mmw/overlay/combo/n${d}.png`);
    }
    for (const d of digits) {
        paths.push(`/assets/mmw/overlay/life/v3/digit/${d}.png`);
        paths.push(`/assets/mmw/overlay/life/v3/digit/s${d}.png`);
    }
    paths.push("/assets/mmw/overlay/judge/v3/1.png");
    for (const r of ["a", "b", "c", "d", "s"]) {
        paths.push(`/assets/mmw/overlay/score/rank/txt/en/${r}.png`);
        paths.push(`/assets/mmw/overlay/score/rank/chr/${r}.png`);
    }

    return Promise.all(
        paths.map((p) =>
            fetch(toAssetUrl(p))
                .then((r) => r.blob())
                .then((blob) => { hudBlobUrlCache.set(p, URL.createObjectURL(blob)); })
                .catch(() => { /* skip failed images */ }),
        ),
    ).then(() => {});
}

function getHudImageSrc(path: string): string {
    return hudBlobUrlCache.get(path) ?? toAssetUrl(path);
}

function createHudImageElement(path: string, className: string) {
    const image = document.createElement("img");
    image.className = className;
    image.src = getHudImageSrc(path);
    image.alt = "";
    return image;
}

function formatScoreValue(value: number) {
    return String(Math.max(0, Math.round(value))).padStart(8, " ").replace(/ /g, "n");
}

function normalizeDifficulty(value: string) {
    const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
    const map: Record<string, string> = { "0": "EASY", "1": "NORMAL", "2": "HARD", "3": "EXPERT", "4": "MASTER", "5": "APPEND", "6": "ETERNAL" };
    return map[normalized] ?? (["EASY", "NORMAL", "HARD", "EXPERT", "MASTER", "APPEND", "ETERNAL"].includes(normalized) ? normalized : value.trim());
}

function difficultyTheme(value: string) {
    const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
    const map: Record<string, string> = { EASY: "easy", NORMAL: "normal", HARD: "hard", EXPERT: "expert", MASTER: "master", APPEND: "append", ETERNAL: "eternal" };
    return map[normalized] ?? "";
}

function inferDifficultyFromSusUrl(susUrl: string) {
    let decoded = susUrl;
    try { decoded = decodeURIComponent(susUrl); } catch { /* keep original */ }
    const normalized = decoded.toUpperCase();
    for (const candidate of ["ETERNAL", "APPEND", "MASTER", "EXPERT", "HARD", "NORMAL", "EASY"] as const) {
        if (normalized.includes(candidate)) return candidate;
    }
    return "";
}

function upperBoundNumber(values: readonly number[], target: number) {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (values[mid] <= target + 0.0001) low = mid + 1;
        else high = mid;
    }
    return low;
}

function readNumber(key: string, fallback: number): number {
    if (typeof window === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const val = Number(raw);
    return Number.isFinite(val) ? val : fallback;
}

interface ChartPreviewPlayerProps {
    susUrl: string;
    bgmUrl?: string;
    rawOffsetMs?: number | null;
    /** Seconds of filler/silence at the start of the BGM file (from musics.json fillerSec). */
    fillerSec?: number;
    /** If true, skip the leading silence in BGM (default: true when bgmUrl is provided). */
    skipBgmSilence?: boolean;
    onFullscreenChange?: (isFullscreen: boolean) => void;
    /** Cover/jacket image URL for intro card and background generation */
    coverUrl?: string | null;
    /** Song title for intro card */
    title?: string | null;
    /** Lyricist for intro card */
    lyricist?: string | null;
    /** Composer for intro card */
    composer?: string | null;
    /** Arranger for intro card */
    arranger?: string | null;
    /** Vocal for intro card */
    vocal?: string | null;
    /** Difficulty label for intro card */
    difficulty?: string | null;
    /** Description line 1 for intro card */
    description1?: string | null;
    /** Description line 2 for intro card */
    description2?: string | null;
    /** Extra text for intro card */
    extra?: string | null;
}

function formatTime(value: number) {
    const safe = Math.max(value, 0);
    const minutes = Math.floor(safe / 60);
    const seconds = Math.floor(safe % 60);
    const milliseconds = Math.floor((safe % 1) * 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export default function ChartPreviewPlayer({
    susUrl,
    bgmUrl,
    rawOffsetMs,
    fillerSec = 0,
    skipBgmSilence = true,
    onFullscreenChange,
    coverUrl,
    title: propTitle,
    lyricist: propLyricist,
    composer: propComposer,
    arranger: propArranger,
    vocal: propVocal,
    difficulty: propDifficulty,
    description1: propDescription1,
    description2: propDescription2,
    extra: propExtra,
}: ChartPreviewPlayerProps) {
    const { t } = useI18n();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const effectsCanvasRef = useRef<HTMLCanvasElement>(null);

    const transportRef = useRef<AudioTransport | null>(null);
    const wasmRef = useRef<MmwWasmPreview | null>(null);
    const rendererRef = useRef<GlPreviewRenderer | null>(null);
    const effectsRef = useRef<MmwEffectSystem | null>(null);
    const judgementEffectsRef = useRef<JudgementEffects | null>(null);
    const judgementSoundsRef = useRef<JudgementSounds | null>(null);
    const rafRef = useRef<number>(0);

    const hitEventsRef = useRef<HitEvent[]>([]);
    const nextHitEventIndexRef = useRef(0);
    const previousTimeSecRef = useRef(0);
    const previousChartTimeSecRef = useRef(0);
    const previousTransportStateRef = useRef<TransportState>("idle");
    const normalizedOffsetMsRef = useRef(0);
    const initialStartSecRef = useRef(0);
    const previewReadyRef = useRef(false);
    const rendererReadyRef = useRef(false);
    const configRef = useRef({ ...defaultConfig, noteSpeed: readNumber(LS_NOTE_SPEED, 10.5) });

    const bgmExpectedRef = useRef(false);
    const bgmLoadedRef = useRef(false);

    // HUD refs
    const hudLayerRef = useRef<HTMLDivElement>(null);
    const hudTimelineRef = useRef<HudTimeline | null>(null);
    const hudJudgeTimesRef = useRef<number[]>([]);
    const hudComboTimesRef = useRef<number[]>([]);
    const hudScoreDigitsRef = useRef<HTMLDivElement>(null);
    const hudScorePlusRef = useRef<HTMLDivElement>(null);
    const hudScoreBarClipRef = useRef<HTMLDivElement>(null);
    const hudScoreRankCharRef = useRef<HTMLImageElement>(null);
    const hudScoreRankTxtRef = useRef<HTMLImageElement>(null);
    const hudLifeDigitsRef = useRef<HTMLDivElement>(null);
    const hudLifeFillClipRef = useRef<HTMLDivElement>(null);
    const hudComboRootRef = useRef<HTMLDivElement>(null);
    const hudComboDigitsRef = useRef<HTMLDivElement>(null);
    const hudComboTagRef = useRef<HTMLImageElement>(null);
    const hudJudgeLayerRef = useRef<HTMLDivElement>(null);
    const hudIntroCardRef = useRef<HTMLDivElement>(null);
    const hudIntroBgCanvasRef = useRef<HTMLCanvasElement>(null);
    const hudIntroCoverShellRef = useRef<HTMLDivElement>(null);
    const hudIntroCoverRef = useRef<HTMLImageElement>(null);
    const hudIntroDifficultyRef = useRef<HTMLDivElement>(null);
    const hudIntroTitleRef = useRef<HTMLDivElement>(null);
    const hudIntroDesc1Ref = useRef<HTMLDivElement>(null);
    const hudIntroDesc2Ref = useRef<HTMLDivElement>(null);
    const hudIntroExtraRef = useRef<HTMLDivElement>(null);
    const hudIntroTextRef = useRef<HTMLDivElement>(null);
    const hudAutoBadgeRef = useRef<HTMLImageElement>(null);
    const hudScoreRootRef = useRef<HTMLDivElement>(null);
    const hudLifeRootRef = useRef<HTMLDivElement>(null);
    const apLayerRef = useRef<HTMLDivElement>(null);
    const apVideoRef = useRef<HTMLVideoElement>(null);
    const apCanvasRef = useRef<HTMLCanvasElement>(null);
    const introGradImageRef = useRef<HTMLImageElement | null>(null);
    const introGradReadyRef = useRef(false);
    const backgroundObjectUrlRef = useRef<string | null>(null);

    // HUD mutable state
    const lastHudScoreTextRef = useRef("");
    const lastHudScorePlusTextRef = useRef("");
    const lastHudLifeTextRef = useRef("");
    const lastHudComboTextRef = useRef("");
    const lastHudRankRef = useRef<string>("");
    const lastHudScoreForPlusTriggerRef = useRef(0);
    const lastHudScorePlusEventIndexRef = useRef(-1);
    const scorePlusTriggerChartSecRef = useRef(Number.NEGATIVE_INFINITY);
    const hudJudgeImageRef = useRef<HTMLImageElement | null>(null);
    const chartLeadInSecRef = useRef(0);

    const [previewState, setPreviewState] = useState<PreviewState>("init");
    const [statusTitle, setStatusTitle] = useState(() => t("page.chartPreview.player.initializingTitle"));
    const [statusText, setStatusText] = useState(() => t("page.chartPreview.player.initializingText"));
    const [requiresGesture, setRequiresGesture] = useState(false);
    const [bgmLoading, setBgmLoading] = useState(false);
    const [warningMessage, setWarningMessage] = useState("");

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [noteSpeed, setNoteSpeed] = useState(() => readNumber(LS_NOTE_SPEED, 10.5));
    const [seVolume, setSeVolume] = useState(() => readNumber(LS_SE_VOLUME, 0.8));
    const [bgmVolume, setBgmVolume] = useState(() => readNumber(LS_BGM_VOLUME, 0.8));
    const [_playbackRate, setPlaybackRate] = useState(() => readNumber(LS_PLAYBACK_RATE, 1));
    const [speedText, setSpeedText] = useState(() => String(readNumber(LS_PLAYBACK_RATE, 1)));
    const [speedError, setSpeedError] = useState(false);
    const speedInputRef = useRef<HTMLInputElement>(null);
    const speedErrorRef = useRef(false);
    const pausedBySpeedErrorRef = useRef(false);
    const [markedTime, setMarkedTime] = useState<number | null>(null);
    const [markFlash, setMarkFlash] = useState(false);
    const [lowEffects, setLowEffects] = useState(false);
    const [renderScale, setRenderScale] = useState(() => readNumber(LS_RENDER_SCALE, 1));
    const renderScaleRef = useRef(readNumber(LS_RENDER_SCALE, 1));
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [controlsLocked, setControlsLocked] = useState(false);
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        if (previewState === "init") {
            setStatusTitle(t("page.chartPreview.player.initializingTitle"));
            setStatusText(t("page.chartPreview.player.initializingText"));
        }
    }, [previewState, t]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const ua = navigator.userAgent;
        setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const syncViewport = () => {
            const vv = window.visualViewport;
            setViewport({
                width: Math.round(vv?.width ?? window.innerWidth),
                height: Math.round(vv?.height ?? window.innerHeight),
            });
        };

        syncViewport();

        const visualViewport = window.visualViewport;
        window.addEventListener("resize", syncViewport);
        window.addEventListener("orientationchange", syncViewport);
        visualViewport?.addEventListener("resize", syncViewport);
        visualViewport?.addEventListener("scroll", syncViewport);

        return () => {
            window.removeEventListener("resize", syncViewport);
            window.removeEventListener("orientationchange", syncViewport);
            visualViewport?.removeEventListener("resize", syncViewport);
            visualViewport?.removeEventListener("scroll", syncViewport);
        };
    }, []);

    // Auto-hide controls in fullscreen: show on interaction, hide after 3s idle
    const resetControlsTimer = useCallback(() => {
        if (controlsLocked) return;
        setControlsVisible(true);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }, [controlsLocked]);

    // When entering/exiting fullscreen, reset controls visibility
    useEffect(() => {
        if (isFullscreen) {
            resetControlsTimer();
        } else {
            setControlsVisible(true);
            setControlsLocked(false);
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        }
        return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
    }, [isFullscreen, resetControlsTimer]);

    // When controls are locked, immediately hide them
    useEffect(() => {
        if (controlsLocked) {
            setControlsVisible(false);
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        }
    }, [controlsLocked]);

    const handleControlsLockToggle = useCallback(() => {
        setControlsLocked(prev => {
            if (prev) {
                // Unlocking: show controls and start auto-hide timer
                setControlsVisible(true);
                if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
                controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
            }
            return !prev;
        });
    }, []);

    // Fullscreen toggle — always try Fullscreen API first, fallback to CSS overlay
    const handleFullscreenToggle = useCallback(async () => {
        if (!isFullscreen) {
            const wrapper = wrapperRef.current as WebkitFullscreenElement | null;
            if (!wrapper) return;
            try {
                if (wrapper.requestFullscreen) {
                    await wrapper.requestFullscreen();
                } else if (wrapper.webkitRequestFullscreen) {
                    await wrapper.webkitRequestFullscreen();
                } else {
                    throw new Error("Fullscreen API unavailable");
                }
                // Try to lock orientation to landscape (requires fullscreen on mobile)
                try { await (screen.orientation as ScreenOrientation & { lock(o: string): Promise<void> }).lock("landscape"); } catch { /* unsupported or not allowed */ }
            } catch {
                // Fallback: CSS fixed overlay (pseudo fullscreen)
                setIsNativeFullscreen(false);
                setIsFullscreen(true);
            }
        } else {
            // Unlock orientation before exiting fullscreen
            try { screen.orientation.unlock(); } catch { /* ignore */ }
            if (isNativeFullscreen) {
                const fullscreenDocument = document as WebkitFullscreenDocument;
                try {
                    if (document.fullscreenElement) {
                        await document.exitFullscreen();
                    } else if (fullscreenDocument.webkitFullscreenElement && fullscreenDocument.webkitExitFullscreen) {
                        await fullscreenDocument.webkitExitFullscreen();
                    } else {
                        setIsNativeFullscreen(false);
                        setIsFullscreen(false);
                    }
                } catch {
                    setIsNativeFullscreen(false);
                    setIsFullscreen(false);
                }
            } else {
                setIsNativeFullscreen(false);
                setIsFullscreen(false);
            }
        }
    }, [isFullscreen, isNativeFullscreen]);

    // Web fullscreen (CSS-only, no Fullscreen API) — recommended for iOS
    const handleWebFullscreenToggle = useCallback(() => {
        if (!isFullscreen) {
            setIsNativeFullscreen(false);
            setIsFullscreen(true);
        } else {
            setIsNativeFullscreen(false);
            setIsFullscreen(false);
        }
    }, [isFullscreen]);

    // Sync fullscreen state with browser events and unlock orientation on exit
    useEffect(() => {
        const handleChange = () => {
            const fullscreenDocument = document as WebkitFullscreenDocument;
            const fsElement = document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
            const active = !!fsElement && fsElement === wrapperRef.current;
            if (!active) {
                try { screen.orientation.unlock(); } catch { /* ignore */ }
            }
            setIsNativeFullscreen(active);
            setIsFullscreen(active);
        };
        document.addEventListener("fullscreenchange", handleChange);
        document.addEventListener("webkitfullscreenchange", handleChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleChange);
            document.removeEventListener("webkitfullscreenchange", handleChange);
        };
    }, []);

    const isPseudoFullscreen = isFullscreen && !isNativeFullscreen;

    // Lock body scroll during pseudo fullscreen
    useEffect(() => {
        if (!isPseudoFullscreen) return;

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [isPseudoFullscreen]);

    // iOS: block all touch-driven scrolling / rubber-band / swipe-back in pseudo fullscreen
    useEffect(() => {
        if (!isPseudoFullscreen) return;
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        // Prevent touchmove on the whole document to kill iOS rubber-band & swipe gestures.
        // We allow touchmove only inside elements that genuinely need scrolling (e.g. range inputs).
        const blockTouchMove = (e: TouchEvent) => {
            const target = e.target as HTMLElement | null;
            // Allow range sliders to work normally
            if (target?.tagName === "INPUT" && (target as HTMLInputElement).type === "range") return;
            e.preventDefault();
        };

        // Prevent pull-to-refresh / overscroll on the wrapper itself
        const blockTouchStart = (e: TouchEvent) => {
            // Single-finger touch: if the wrapper is at scroll boundary, prevent to avoid
            // iOS Safari pull-to-refresh / elastic overscroll.
            if (e.touches.length === 1) {
                const el = wrapper;
                if (el.scrollTop <= 0) el.scrollTop = 1;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight) el.scrollTop = el.scrollHeight - el.clientHeight - 1;
            }
        };

        // { passive: false } is required so preventDefault() actually works on iOS
        document.addEventListener("touchmove", blockTouchMove, { passive: false });
        wrapper.addEventListener("touchstart", blockTouchStart, { passive: true });

        // Also set touch-action: none on body to prevent gesture navigation
        const prevTouchAction = document.body.style.touchAction;
        document.body.style.touchAction = "none";

        return () => {
            document.removeEventListener("touchmove", blockTouchMove);
            wrapper.removeEventListener("touchstart", blockTouchStart);
            document.body.style.touchAction = prevTouchAction;
        };
    }, [isPseudoFullscreen]);

    useEffect(() => {
        onFullscreenChange?.(isFullscreen);
    }, [isFullscreen, onFullscreenChange]);

    useEffect(() => {
        return () => {
            onFullscreenChange?.(false);
        };
    }, [onFullscreenChange]);

    useEffect(() => {
        if (!isPseudoFullscreen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            void handleFullscreenToggle();
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [handleFullscreenToggle, isPseudoFullscreen]);

    const updateUi = useCallback(() => {
        const transport = transportRef.current;
        if (!transport) return;
        const snapshot = transport.getSnapshot();
        setIsPlaying(snapshot.state === "playing");
        setCurrentTime(snapshot.currentTimeSec);
        setDuration(snapshot.durationSec);
        setRequiresGesture(snapshot.requiresGesture);
    }, []);

    // Bootstrap
    useEffect(() => {
        if (!canvasRef.current || !effectsCanvasRef.current || !panelRef.current) return;

        const transport = new AudioTransport();
        const wasm = new MmwWasmPreview();
        const renderer = new GlPreviewRenderer(canvasRef.current);
        const effects = new MmwEffectSystem(effectsCanvasRef.current);
        const judgementEffectsInstance = new JudgementEffects(effectsCanvasRef.current);
        const judgementSoundsInstance = new JudgementSounds();

        transportRef.current = transport;
        wasmRef.current = wasm;
        rendererRef.current = renderer;
        effectsRef.current = effects;
        judgementEffectsRef.current = judgementEffectsInstance;
        judgementSoundsRef.current = judgementSoundsInstance;

        transport.setVolume(readNumber(LS_BGM_VOLUME, 0.8));
        judgementSoundsInstance.setVolume(readNumber(LS_SE_VOLUME, 0.8));
        const savedRate = readNumber(LS_PLAYBACK_RATE, 1);
        if (savedRate !== 1) void transport.setPlaybackRate(savedRate);

        const unsubscribe = transport.subscribe(updateUi);

        const emptyFrame = new Float32Array();

        function lowerBoundHitEvent(timeSec: number) {
            const events = hitEventsRef.current;
            let low = 0;
            let high = events.length;
            while (low < high) {
                const mid = (low + high) >> 1;
                if (events[mid].timeSec < timeSec - 0.0001) {
                    low = mid + 1;
                } else {
                    high = mid;
                }
            }
            return low;
        }

        function triggerNoteEffects(event: HitEvent) {
            const trigger = {
                x: event.center,
                width: event.width,
                timeSec: performance.now() / 1000,
                untilSec: event.endTimeSec,
            };

            switch (event.kind) {
                case "flick":
                    effects.trigger(event.critical ? "fx_note_critical_flick_aura" : "fx_note_flick_aura", trigger);
                    effects.trigger(event.critical ? "fx_note_critical_flick_gen" : "fx_note_flick_gen", trigger);
                    effects.trigger(event.critical ? "fx_note_critical_flick_flash" : "fx_note_flick_flash", trigger);
                    if (event.critical) effects.trigger("fx_lane_critical_flick", trigger);
                    break;
                case "trace":
                    effects.trigger(event.critical ? "fx_note_critical_trace_aura" : "fx_note_trace_aura", trigger);
                    break;
                case "tick":
                    effects.trigger(event.critical ? "fx_note_critical_long_hold_via_aura" : "fx_note_long_hold_via_aura", trigger);
                    break;
                case "holdLoop":
                    effects.trigger(event.critical ? "fx_note_critical_long_hold_gen" : "fx_note_long_hold_gen", trigger);
                    effects.trigger(event.critical ? "fx_note_critical_long_hold_gen_aura" : "fx_note_hold_aura", trigger);
                    break;
                case "criticalTap":
                    effects.trigger("fx_note_critical_normal_aura", trigger);
                    effects.trigger("fx_note_critical_normal_gen", trigger);
                    effects.trigger("fx_lane_critical", trigger);
                    break;
                default:
                    effects.trigger("fx_note_normal_aura", trigger);
                    effects.trigger("fx_note_normal_gen", trigger);
                    effects.trigger("fx_lane_default", trigger);
                    break;
            }
        }

        function emitHitEvents(fromSec: number, toSec: number) {
            const events = hitEventsRef.current;
            while (nextHitEventIndexRef.current < events.length && events[nextHitEventIndexRef.current].timeSec <= toSec + 0.0001) {
                const event = events[nextHitEventIndexRef.current];
                if (event.timeSec >= fromSec - 0.0001) {
                    triggerNoteEffects(event);
                    judgementEffectsInstance.trigger(event, performance.now() / 1000);
                    judgementSoundsInstance.trigger(
                        transport.getAudioContext(),
                        event,
                        transport.getSnapshot().playbackRate,
                        event.timeSec,
                    );
                }
                nextHitEventIndexRef.current += 1;
            }
        }

        function resumeActiveHoldLoops(currentTimeSec: number) {
            for (const event of hitEventsRef.current) {
                if (event.kind !== "holdLoop" || event.endTimeSec === undefined) continue;
                if (event.timeSec < currentTimeSec - 0.0001 && event.endTimeSec > currentTimeSec + 0.0001) {
                    judgementSoundsInstance.trigger(
                        transport.getAudioContext(),
                        event,
                        transport.getSnapshot().playbackRate,
                        currentTimeSec,
                    );
                }
            }
        }

        // ── HUD helper functions ──

        function setScoreDigits(score: number) {
            const container = hudScoreDigitsRef.current;
            if (!container) return;
            const text = formatScoreValue(score);
            if (text === lastHudScoreTextRef.current) return;
            lastHudScoreTextRef.current = text;
            const fragment = document.createDocumentFragment();
            for (const digit of text) {
                const stack = document.createElement("span");
                stack.className = "hud-score-digit-stack";
                stack.append(
                    createHudImageElement(`/assets/mmw/overlay/score/digit/s${digit}.png`, "hud-score-digit-shadow"),
                    createHudImageElement(`/assets/mmw/overlay/score/digit/${digit}.png`, "hud-score-digit-main"),
                );
                fragment.append(stack);
            }
            container.replaceChildren(fragment);
        }

        function setScorePlusDigits(scoreDelta: number) {
            const container = hudScorePlusRef.current;
            if (!container) return;
            const text = `+${Math.max(0, Math.round(scoreDelta))}`;
            if (text === lastHudScorePlusTextRef.current) return;
            lastHudScorePlusTextRef.current = text;
            const fragment = document.createDocumentFragment();
            for (const char of text) {
                const stack = document.createElement("span");
                stack.className = "hud-score-plus-stack";
                if (char === "+") stack.classList.add("hud-score-plus-stack-sign");
                stack.append(
                    createHudImageElement(`/assets/mmw/overlay/score/digit/s${char === "+" ? "+" : char}.png`, "hud-score-plus-shadow"),
                    createHudImageElement(`/assets/mmw/overlay/score/digit/${char === "+" ? "+" : char}.png`, "hud-score-plus-main"),
                );
                fragment.append(stack);
            }
            container.replaceChildren(fragment);
        }

        function hideScorePlus() {
            const el = hudScorePlusRef.current;
            if (!el) return;
            el.hidden = true;
            el.style.opacity = "0";
            el.style.transform = `translate(${(-SCORE_PLUS_SLIDE_IN_PX).toFixed(2)}px, 0px)`;
        }

        function updateScorePlusAnimation(chartTimeSec: number, transportState: TransportState, hidden: boolean) {
            const el = hudScorePlusRef.current;
            if (!el) return;
            if (hidden || transportState !== "playing" || !Number.isFinite(scorePlusTriggerChartSecRef.current)) {
                hideScorePlus(); return;
            }
            const elapsed = chartTimeSec - scorePlusTriggerChartSecRef.current;
            if (elapsed < 0 || elapsed > SCORE_PLUS_VISIBLE_SEC) { hideScorePlus(); return; }
            const progress = Math.min(1, Math.max(0, elapsed / SCORE_PLUS_VISIBLE_SEC));
            const entryProgress = Math.min(1, progress / 0.42);
            const eased = 1 - (0.9 ** (entryProgress * 12));
            const fadeStart = 0.88;
            const baseAlpha = Math.min(1, 1.3 * eased);
            const alpha = progress <= fadeStart ? baseAlpha : Math.max(0, baseAlpha * (1 - (progress - fadeStart) / (1 - fadeStart)));
            const offsetX = -SCORE_PLUS_SLIDE_IN_PX * (1 - eased);
            const offsetY = -SCORE_PLUS_FLOAT_PX * eased;
            el.hidden = false;
            el.style.opacity = alpha.toFixed(3);
            el.style.transform = `translate(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px)`;
        }

        function setLifeDigits(lifeRatio: number) {
            const container = hudLifeDigitsRef.current;
            if (!container) return;
            const lifeValue = Math.max(0, Math.round(LIFE_MAX_VALUE * Math.min(1, Math.max(0, lifeRatio))));
            const text = String(lifeValue);
            if (text === lastHudLifeTextRef.current) return;
            lastHudLifeTextRef.current = text;
            const fragment = document.createDocumentFragment();
            const reversed = [...text].reverse();
            for (let i = 0; i < reversed.length; i += 1) {
                const digit = reversed[i];
                const stack = document.createElement("span");
                stack.className = "hud-life-digit-slot";
                stack.style.left = `${319 - i * 22}px`;
                const digitStack = document.createElement("span");
                digitStack.className = "hud-life-digit-stack";
                digitStack.append(
                    createHudImageElement(`/assets/mmw/overlay/life/v3/digit/s${digit}.png`, "hud-life-digit-shadow"),
                    createHudImageElement(`/assets/mmw/overlay/life/v3/digit/${digit}.png`, "hud-life-digit-main"),
                );
                stack.append(digitStack);
                fragment.append(stack);
            }
            container.replaceChildren(fragment);
        }

        function setComboDigits(combo: number) {
            const container = hudComboDigitsRef.current;
            if (!container) return;
            if (combo <= 0) {
                if (lastHudComboTextRef.current !== "") {
                    lastHudComboTextRef.current = "";
                    container.replaceChildren();
                }
                return;
            }
            const text = String(combo);
            if (text === lastHudComboTextRef.current) return;
            lastHudComboTextRef.current = text;
            const fragment = document.createDocumentFragment();
            const mid = text.length / 2;
            for (let i = 0; i < text.length; i += 1) {
                const digit = text[i];
                const slot = document.createElement("span");
                slot.className = "hud-combo-slot";
                slot.style.left = `calc(50% + ${(i - mid + 0.5) * COMBO_DIGIT_STEP}px)`;
                slot.append(
                    createHudImageElement(`/assets/mmw/overlay/combo/b${digit}.png`, "hud-combo-digit-glow"),
                    createHudImageElement(`/assets/mmw/overlay/combo/n${digit}.png`, "hud-combo-digit"),
                );
                fragment.append(slot);
            }
            container.replaceChildren(fragment);
        }

        function setRankSprites(rank: HudRuntimeState["rank"]) {
            if (rank === lastHudRankRef.current) return;
            lastHudRankRef.current = rank;
            if (hudScoreRankTxtRef.current) hudScoreRankTxtRef.current.src = getHudImageSrc(`/assets/mmw/overlay/score/rank/txt/en/${rank}.png`);
            if (hudScoreRankCharRef.current) hudScoreRankCharRef.current.src = getHudImageSrc(`/assets/mmw/overlay/score/rank/chr/${rank}.png`);
        }

        function renderJudgeBursts(currentTimeSec: number, hidden: boolean) {
            const layer = hudJudgeLayerRef.current;
            if (!layer) return;
            const times = hudJudgeTimesRef.current;
            if (hidden || times.length === 0) { layer.hidden = true; return; }
            const latestIndex = upperBoundNumber(times, currentTimeSec) - 1;
            if (latestIndex < 0) { layer.hidden = true; return; }
            const progressFrames = (currentTimeSec - times[latestIndex]) * JUDGE_ANIMATION_FPS;
            if (progressFrames < 0 || progressFrames >= JUDGE_ANIMATION_TOTAL_FRAMES) { layer.hidden = true; return; }
            let alpha = 1;
            let rawScale = 2 / 3;
            if (progressFrames < 2) alpha = 0;
            else if (progressFrames < 5) rawScale = (2 / 3) - Math.pow(-1.45 + progressFrames / 4, 4) * (2 / 3);
            const scale = Math.max(0.01, rawScale * 1.5);
            if (!hudJudgeImageRef.current) {
                hudJudgeImageRef.current = createHudImageElement("/assets/mmw/overlay/judge/v3/1.png", "hud-judge-burst");
                layer.replaceChildren(hudJudgeImageRef.current);
            }
            hudJudgeImageRef.current.style.opacity = String(alpha);
            hudJudgeImageRef.current.style.transform = `scale(${scale})`;
            layer.hidden = false;
        }

        function updateComboAnimation(currentTimeSec: number, combo: number, hidden: boolean) {
            const digitsEl = hudComboDigitsRef.current;
            const rootEl = hudComboRootRef.current;
            if (!digitsEl || !rootEl) return;
            const times = hudComboTimesRef.current;
            if (hidden || combo <= 0 || times.length === 0) {
                digitsEl.style.transform = `translate(-50%, -50%) scale(${COMBO_BASE_SCALE})`;
                rootEl.style.setProperty("--combo-glow-opacity", "0");
                return;
            }
            const latestIndex = upperBoundNumber(times, currentTimeSec) - 1;
            if (latestIndex < 0) {
                digitsEl.style.transform = `translate(-50%, -50%) scale(${COMBO_BASE_SCALE})`;
                rootEl.style.setProperty("--combo-glow-opacity", "0");
                return;
            }
            const progress = (currentTimeSec - times[latestIndex]) * JUDGE_ANIMATION_FPS;
            const shiftScale = Math.min(1, Math.max(0.5, (progress / 8) * 0.5 + 0.5));
            const burstAlpha = progress < 14 ? Math.max(0, 1 - progress / 14) : 0;
            const glowAlpha = Math.min(1, 0.25 + burstAlpha * 0.75);
            digitsEl.style.transform = `translate(-50%, -50%) scale(${shiftScale * COMBO_BASE_SCALE})`;
            rootEl.style.setProperty("--combo-glow-opacity", glowAlpha.toFixed(3));
        }

        function hasIntroCardContent() {
            return Boolean(
                coverUrl ||
                propTitle?.trim() ||
                propDescription1?.trim() ||
                propDescription2?.trim() ||
                propExtra?.trim() ||
                propDifficulty?.trim(),
            );
        }

        function isIntroVisible(currentTimeSec: number, transportState: TransportState) {
            return hasIntroCardContent() && transportState === "playing" && currentTimeSec >= 0 && currentTimeSec < HUD_INTRO_DURATION_SEC;
        }

        function getPlayfieldVisibility(currentTimeSec: number, transportState: TransportState) {
            if (!hasIntroCardContent() || transportState !== "playing" || currentTimeSec < 0) return 1;
            const revealStartSec = HUD_INTRO_DURATION_SEC + INTRO_CLEAN_BG_DURATION_SEC;
            if (currentTimeSec < revealStartSec) return 0;
            return Math.min(1, Math.max(0, (currentTimeSec - revealStartSec) / INTRO_PLAYFIELD_FADE_IN_SEC));
        }

        function applyPlayfieldVisibility(visibility: number) {
            const alpha = Math.min(1, Math.max(0, visibility)).toFixed(3);
            const effectsCanvas = effectsCanvasRef.current;
            if (effectsCanvas) effectsCanvas.style.opacity = alpha;
            if (hudScoreRootRef.current) hudScoreRootRef.current.style.opacity = alpha;
            if (hudLifeRootRef.current) hudLifeRootRef.current.style.opacity = alpha;
            // combo opacity is managed together with its hidden state below
            if (hudJudgeLayerRef.current) hudJudgeLayerRef.current.style.opacity = alpha;
        }

        function clamp01(v: number) { return Math.min(1, Math.max(0, v)); }
        function easeOutQuad(v: number) { const c = clamp01(v); return 1 - (1 - c) * (1 - c); }

        function drawIntroGradLayer(ctx: CanvasRenderingContext2D, introTimeSec: number, waveStartSec: number) {
            if (!introGradReadyRef.current || !introGradImageRef.current) return;
            const normalized = (introTimeSec - waveStartSec) / INTRO_GRAD_DURATION_SEC;
            if (normalized <= 0 || normalized >= 1) return;
            const eased = easeOutQuad(normalized);
            const offsetY = INTRO_GRAD_START_Y + (INTRO_GRAD_END_Y - INTRO_GRAD_START_Y) * eased;
            const drawX = (INTRO_BG_WIDTH - INTRO_GRAD_DRAW_WIDTH) / 2;
            const drawY = (INTRO_BG_HEIGHT - INTRO_GRAD_DRAW_HEIGHT) / 2 + offsetY;
            ctx.globalAlpha = INTRO_GRAD_ALPHA;
            ctx.drawImage(introGradImageRef.current, drawX, drawY, INTRO_GRAD_DRAW_WIDTH, INTRO_GRAD_DRAW_HEIGHT);
        }

        function renderIntroBackdrop(currentTimeSec: number) {
            const canvas = hudIntroBgCanvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            const introTimeSec = Math.min(HUD_INTRO_DURATION_SEC, Math.max(0, currentTimeSec));
            ctx.clearRect(0, 0, INTRO_BG_WIDTH, INTRO_BG_HEIGHT);
            ctx.globalAlpha = 1;
            ctx.fillStyle = INTRO_BG_BASE_COLOR;
            ctx.fillRect(0, 0, INTRO_BG_WIDTH, INTRO_BG_HEIGHT);
            drawIntroGradLayer(ctx, introTimeSec, INTRO_GRAD_START_SEC);
            drawIntroGradLayer(ctx, introTimeSec, INTRO_GRAD_START_SEC + INTRO_GRAD_DURATION_SEC);
            ctx.globalAlpha = 1;
        }

        function renderHudFrame(ct: number, transportState: TransportState, chartTimeSec: number) {
            const hudLayer = hudLayerRef.current;
            if (!hudLayer) return;

            // Scale HUD layout to panel size
            const panel = panelRef.current;
            if (panel) {
                const bounds = panel.getBoundingClientRect();
                hudLayer.style.setProperty("--hud-scale", String(bounds.width / 1920));
            }

            hudLayer.hidden = !previewReadyRef.current;
            if (!previewReadyRef.current) {
                panelRef.current?.classList.remove("intro-active");
                applyPlayfieldVisibility(1);
                lastHudScoreForPlusTriggerRef.current = 0;
                hideScorePlus();
                if (hudAutoBadgeRef.current) hudAutoBadgeRef.current.hidden = true;
                return;
            }

            const introVisible = isIntroVisible(ct, transportState);
            const playfieldVisibility = getPlayfieldVisibility(ct, transportState);
            const hudSuppressed = introVisible || playfieldVisibility <= 0.001;

            applyPlayfieldVisibility(playfieldVisibility);

            if (introVisible) {
                renderIntroBackdrop(ct);
            }

            if (introVisible) {
                panelRef.current?.classList.add("intro-active");
                if (hudIntroCardRef.current) hudIntroCardRef.current.classList.add("visible");
            } else {
                panelRef.current?.classList.remove("intro-active");
                if (hudIntroCardRef.current) hudIntroCardRef.current.classList.remove("visible");
            }

            // HUD timeline state
            const timeline = hudTimelineRef.current;
            if (timeline) {
                const state = timeline.snapshotAt(chartTimeSec);

                setScoreDigits(state.score);
                setRankSprites(state.rank);
                setLifeDigits(state.lifeRatio);
                setComboDigits(state.combo);

                // Score bar
                if (hudScoreBarClipRef.current) {
                    hudScoreBarClipRef.current.style.width = `${(state.scoreBarRatio * 354).toFixed(1)}px`;
                }

                // Life fill
                if (hudLifeFillClipRef.current) {
                    hudLifeFillClipRef.current.style.width = `${(state.lifeRatio * 100).toFixed(1)}%`;
                }

                // Combo root + tag visibility
                if (hudComboRootRef.current) {
                    const shouldHide = hudSuppressed || state.combo <= 0;
                    hudComboRootRef.current.hidden = shouldHide;
                    if (!shouldHide) {
                        hudComboRootRef.current.style.opacity = Math.min(1, Math.max(0, playfieldVisibility)).toFixed(3);
                    }
                }
                if (hudComboTagRef.current) {
                    hudComboTagRef.current.hidden = state.combo <= 0 || hudSuppressed;
                }

                // Score plus trigger
                if (state.latestScoreEventIndex >= 0 && state.latestScoreEventIndex !== lastHudScorePlusEventIndexRef.current) {
                    setScorePlusDigits(state.latestScoreDelta);
                    lastHudScorePlusEventIndexRef.current = state.latestScoreEventIndex;
                    scorePlusTriggerChartSecRef.current = chartTimeSec;
                    if (hudScorePlusRef.current) hudScorePlusRef.current.hidden = false;
                }
                updateScorePlusAnimation(chartTimeSec, transportState, hudSuppressed);

                // Judge bursts
                renderJudgeBursts(chartTimeSec, hudSuppressed);

                // Combo animation
                updateComboAnimation(chartTimeSec, state.combo, hudSuppressed);
            }

            // Auto badge — pulse animation after intro completes
            if (hudAutoBadgeRef.current) {
                hudAutoBadgeRef.current.hidden = false;
                if (ct < AUTO_BADGE_SHOW_AFTER_SEC) {
                    hudAutoBadgeRef.current.style.opacity = "0";
                } else {
                    const phase = ((ct - AUTO_BADGE_SHOW_AFTER_SEC) / AUTO_BADGE_ANIM_PERIOD_SEC) % AUTO_BADGE_ANIM_SPAN;
                    const alpha = Math.max(0, Math.sin(phase * Math.PI));
                    hudAutoBadgeRef.current.style.opacity = alpha.toFixed(3);
                }
            }
        }

        function frameLoop() {
            if (!rendererReadyRef.current) {
                try { renderer.renderEmpty(configRef.current); } catch { /* not ready */ }
                rafRef.current = requestAnimationFrame(frameLoop);
                return;
            }
            try {
                const snapshot = transport.getSnapshot();
                const ct = snapshot.currentTimeSec;
                const chartTimeSec = ct - chartLeadInSecRef.current;
                const frame = previewReadyRef.current ? wasm.render(chartTimeSec) : { count: 0, floats: emptyFrame };
                renderer.render(frame.floats, frame.count, configRef.current);

                if (previewReadyRef.current) {
                    if (
                        snapshot.state !== "playing" ||
                        previousTransportStateRef.current !== "playing" ||
                        chartTimeSec < previousChartTimeSecRef.current ||
                        chartTimeSec - previousChartTimeSecRef.current > 0.25
                    ) {
                        nextHitEventIndexRef.current = lowerBoundHitEvent(chartTimeSec);
                        if (snapshot.state !== "playing") {
                            effects.reset();
                            judgementEffectsInstance.reset();
                            judgementSoundsInstance.stopAll();
                        } else {
                            resumeActiveHoldLoops(chartTimeSec);
                        }
                    } else {
                        emitHitEvents(previousChartTimeSecRef.current, chartTimeSec);
                    }
                }

                const nowSec = performance.now() / 1000;
                effects.render(nowSec);
                judgementEffectsInstance.render(nowSec);

                // HUD rendering
                renderHudFrame(ct, snapshot.state, chartTimeSec);

                previousTimeSecRef.current = ct;
                previousChartTimeSecRef.current = chartTimeSec;
                previousTransportStateRef.current = snapshot.state;
                updateUi();
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unknown render error";
                setStatusTitle(t("page.chartPreview.player.loadFailedTitle"));
                setStatusText(message);
                setPreviewState("error");
                transport.setError();
                previewReadyRef.current = false;
            }
            rafRef.current = requestAnimationFrame(frameLoop);
        }

        // ResizeObserver
        const panel = panelRef.current;
        const resizeObserver = new ResizeObserver(() => {
            const bounds = panel.getBoundingClientRect();
            const dpr = (window.devicePixelRatio || 1) * renderScaleRef.current;
            renderer.resize(bounds.width, bounds.height, dpr);
            wasm.resize(bounds.width, bounds.height, dpr);
            effects.resize(bounds.width, bounds.height, dpr);
            judgementEffectsInstance.resize(bounds.width, bounds.height, dpr);
        });

        async function bootstrap() {
            try {
                setPreviewState("loading");
                setStatusTitle(t("page.chartPreview.player.loadingResourcesTitle"));
                setStatusText(t("page.chartPreview.player.loadingResourcesText"));

                await Promise.all([
                    wasm.init(),
                    renderer.loadTextures(),
                    effects.load(),
                    preloadHudImages(),
                    judgementSoundsInstance.load(transport.getAudioContext()).catch(() => {
                        setWarningMessage(t("page.chartPreview.player.judgementSoundLoadFailed"));
                    }),
                ]);
                rendererReadyRef.current = true;
                resizeObserver.observe(panel);

                setStatusTitle(t("page.chartPreview.player.loadingChartTitle"));
                setStatusText(t("page.chartPreview.player.loadingChartText"));

                const bgmExpected = !!bgmUrl;
                bgmExpectedRef.current = bgmExpected;
                bgmLoadedRef.current = !bgmUrl;

                const susResponse = await fetch(susUrl);
                if (!susResponse.ok) throw new Error(`Failed to load SUS: ${susResponse.status}`);
                const susText = await susResponse.text();

                const normalizedMs = normalizeOffsetMs(rawOffsetMs ?? null, susText);
                normalizedOffsetMsRef.current = normalizedMs;

                // Pre-set BGM filler offset so timing calculations account for it
                const effectiveFillerSec = (skipBgmSilence && bgmUrl && fillerSec > 0) ? fillerSec : 0;
                transport.setBgmOffsetSec(effectiveFillerSec);

                // Lead-in timing alignment (matching reference repo logic)
                // sourceOffsetSec = the time gap between audio start and chart tick=0
                const sourceOffsetSec = -normalizedMs / 1000;
                // chartLeadInSec = guaranteed minimum lead-in before chart notes arrive
                // Must be at least MIN_CHART_LEAD_IN_SEC (9s) to allow intro animation
                const chartLeadInSec = Math.max(sourceOffsetSec, MIN_CHART_LEAD_IN_SEC);
                // audioStartDelaySec = how long to delay audio playback in transport time
                // The filler silence in the BGM file is skipped via bgmOffsetSec,
                // so the effective audio content starts at fillerSec in the file.
                // We need: at transport time = audioStartDelaySec, audio plays from bgmOffsetSec.
                // chartLeadInSec seconds of transport time pass before chartTimeSec=0.
                // Audio should start playing so that at chartTimeSec=0, the audio is at
                // the point corresponding to the chart start (after filler).
                const audioStartDelaySec = Math.max(0, chartLeadInSec - sourceOffsetSec);
                chartLeadInSecRef.current = chartLeadInSec;

                // Pass negative lead-in as the offset so WASM places notes correctly
                wasm.loadSusText(susText, -chartLeadInSec * 1000);
                wasm.setPreviewConfig(configRef.current);

                // Set audio start delay so BGM plays at the right moment
                transport.setAudioStartOffset(audioStartDelaySec);

                // WASM already applied the -chartLeadInSec offset internally,
                // so hit event times are in "transport time" space — no extra adjustment needed.
                hitEventsRef.current = wasm.getHitEvents().map((event) => ({
                    ...event,
                    timeSec: event.timeSec,
                    endTimeSec: event.endTimeSec,
                }));
                nextHitEventIndexRef.current = 0;

                // Initialize HUD timeline from WASM hud events (also already offset by wasm)
                try {
                    const hudEvents = wasm.getHudEvents();
                    hudTimelineRef.current = new HudTimeline(hudEvents);
                    // Extract judge and combo times for animations
                    hudJudgeTimesRef.current = hudEvents
                        .filter((e) => e.showJudge)
                        .map((e) => e.timeSec)
                        .sort((a, b) => a - b);
                    hudComboTimesRef.current = hudEvents
                        .map((e) => e.timeSec)
                        .sort((a, b) => a - b);
                } catch (hudError) {
                    // HUD events not available in this WASM build, continue without HUD
                    console.warn("[ChartPreview] HUD events unavailable:", hudError);
                    hudTimelineRef.current = null;
                }

                // Initialize intro card metadata
                const songMeta = (() => { try { return wasm.getSongMetadata(); } catch { return { title: "", artist: "", designer: "" }; } })();
                const introTitle = propTitle?.trim() || songMeta.title.trim() || "";
                const introLyricist = propLyricist?.trim() || "-";
                const introComposer = propComposer?.trim() || songMeta.artist.trim() || "-";
                const introArranger = propArranger?.trim() || "-";
                const introVocal = propVocal?.trim() || "-";
                const introDifficulty = propDifficulty?.trim() || inferDifficultyFromSusUrl(susUrl);
                const introDesc1 = propDescription1?.trim() || t("page.chartPreview.player.introCredits", {
                    lyricist: introLyricist,
                    composer: introComposer,
                    arranger: introArranger,
                });
                const introDesc2 = propDescription2?.trim() || `Vo. ${introVocal}`;
                const introExtra = propExtra?.trim() || "";

                // Apply intro card content to DOM
                if (hudIntroTitleRef.current) hudIntroTitleRef.current.textContent = introTitle || "Unknown Title";
                if (hudIntroDesc1Ref.current) hudIntroDesc1Ref.current.textContent = introDesc1;
                if (hudIntroDesc2Ref.current) hudIntroDesc2Ref.current.textContent = introDesc2;
                if (hudIntroExtraRef.current) {
                    hudIntroExtraRef.current.textContent = introExtra;
                    hudIntroExtraRef.current.hidden = !introExtra;
                }
                if (hudIntroDifficultyRef.current) {
                    const diffText = introDifficulty ? normalizeDifficulty(introDifficulty) : "";
                    hudIntroDifficultyRef.current.textContent = diffText;
                    hudIntroDifficultyRef.current.hidden = !diffText;
                    const theme = difficultyTheme(diffText);
                    if (theme) hudIntroDifficultyRef.current.dataset.theme = theme;
                    else delete hudIntroDifficultyRef.current.dataset.theme;
                }

                // Set cover image
                if (coverUrl && hudIntroCoverRef.current && hudIntroCoverShellRef.current) {
                    hudIntroCoverShellRef.current.hidden = false;
                    hudIntroCoverRef.current.hidden = false;
                    hudIntroCoverRef.current.src = coverUrl;
                    hudIntroCardRef.current?.classList.remove("no-cover");
                } else if (hudIntroCoverShellRef.current) {
                    hudIntroCoverShellRef.current.hidden = true;
                    if (hudIntroCoverRef.current) hudIntroCoverRef.current.hidden = true;
                    hudIntroCardRef.current?.classList.add("no-cover");
                }

                // Load intro gradient image
                const gradImg = new Image();
                gradImg.onload = () => { introGradImageRef.current = gradImg; introGradReadyRef.current = true; };
                gradImg.src = "/assets/mmw/overlay/start_grad.png";

                // Generate V3 background if cover is available
                if (coverUrl) {
                    generateOverlayV3BackgroundObjectUrl(coverUrl).then((url) => {
                        backgroundObjectUrlRef.current = url;
                        renderer.setBackgroundUrl(url);
                    }).catch(() => {
                        renderer.setBackgroundUrl(FIXED_BACKGROUND_URL);
                    });
                } else {
                    renderer.setBackgroundUrl(FIXED_BACKGROUND_URL);
                }

                const chartEndTimeSec = wasm.getChartEndTimeSec();
                // Duration includes the lead-in period
                const minimumDurationSec = Math.max(chartEndTimeSec + chartLeadInSec + 1, chartLeadInSec + 1);
                transport.setDuration(minimumDurationSec);
                transport.setReady();

                // Start at time 0 — the lead-in handles the gap before chart notes arrive
                initialStartSecRef.current = 0;

                previewReadyRef.current = true;
                setPreviewState("ready");
                updateUi();

                // Load BGM in background
                if (bgmUrl) {
                    setBgmLoading(true);
                    setWarningMessage(t("page.chartPreview.player.loadingBgm"));
                    try {
                        const controller = new AbortController();
                        const timer = window.setTimeout(() => controller.abort(), 30000);
                        const bgmFetchUrl = bgmUrl;
                        const bgmResponse = await fetch(bgmFetchUrl, { signal: controller.signal });
                        window.clearTimeout(timer);
                        if (!bgmResponse.ok) throw new Error(`BGM: ${bgmResponse.status}`);
                        const bgmData = await bgmResponse.arrayBuffer();
                        await Promise.race([
                            transport.setAudioData(bgmData),
                            new Promise<never>((_, reject) => {
                                window.setTimeout(() => reject(new Error("BGM decode timeout.")), 30000);
                            }),
                        ]);
                        // bgmOffsetSec was already set before audio start offset calculation
                        transport.setDuration(Math.max(transport.getSnapshot().durationSec, minimumDurationSec));
                        bgmLoadedRef.current = true;
                        setBgmLoading(false);
                        setWarningMessage("");
                    } catch (error) {
                        bgmExpectedRef.current = false;
                        bgmLoadedRef.current = false;
                        setBgmLoading(false);
                        setWarningMessage(
                            error instanceof Error
                                ? t("page.chartPreview.player.bgmLoadFailedWithMessage", { message: error.message })
                                : t("page.chartPreview.player.bgmLoadFailed")
                        );
                    }
                    updateUi();
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error";
                setStatusTitle(t("page.chartPreview.player.loadFailedTitle"));
                setStatusText(message);
                setPreviewState("error");
                transport.setError();
                updateUi();
            }
        }

        rafRef.current = requestAnimationFrame(frameLoop);
        void bootstrap();

        return () => {
            cancelAnimationFrame(rafRef.current);
            resizeObserver.disconnect();
            unsubscribe();
            transport.stop();
            try { transport.getAudioContext().close(); } catch { /* ignore */ }
            wasm.dispose();
            judgementSoundsInstance.stopAll();
            if (backgroundObjectUrlRef.current) {
                URL.revokeObjectURL(backgroundObjectUrlRef.current);
                backgroundObjectUrlRef.current = null;
            }
        };
    }, [susUrl, bgmUrl, rawOffsetMs, fillerSec, skipBgmSilence, updateUi, coverUrl, propTitle, propLyricist, propComposer, propArranger, propVocal, propDifficulty, propDescription1, propDescription2, propExtra, t]);

    const handlePlayToggle = useCallback(async () => {
        const transport = transportRef.current;
        if (!transport) return;

        // If speed is invalid, reset to 1x and continue playing
        if (speedErrorRef.current) {
            setSpeedError(false);
            speedErrorRef.current = false;
            pausedBySpeedErrorRef.current = false;
            setSpeedText("1");
            setPlaybackRate(1);
            await transport.setPlaybackRate(1);
            try { localStorage.setItem(LS_PLAYBACK_RATE, "1"); } catch { /* quota */ }
        }

        if (bgmExpectedRef.current && !bgmLoadedRef.current) {
            setWarningMessage(t("page.chartPreview.player.songStillLoading"));
            return;
        }

        if (transport.getSnapshot().state === "playing") {
            pausedBySpeedErrorRef.current = false;
            transport.pause();
            return;
        }

        const ok = await transport.play();
        if (!ok) {
            setRequiresGesture(true);
        }
        updateUi();
    }, [t, updateUi]);

    const handleStop = useCallback(() => {
        const transport = transportRef.current;
        if (!transport) return;
        transport.stop();
        setMarkedTime(null);
        const startSec = initialStartSecRef.current;
        if (startSec > 0.001) {
            transport.seek(startSec);
        }
        const chartTime = startSec - chartLeadInSecRef.current;
        const events = hitEventsRef.current;
        let low = 0;
        let high = events.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (events[mid].timeSec < chartTime - 0.0001) low = mid + 1;
            else high = mid;
        }
        nextHitEventIndexRef.current = low;
        previousTimeSecRef.current = startSec;
        previousChartTimeSecRef.current = chartTime;
        effectsRef.current?.reset();
        judgementEffectsRef.current?.reset();
        updateUi();
    }, [updateUi]);

    const handleMark = useCallback(() => {
        const transport = transportRef.current;
        if (!transport) return;
        setMarkedTime(transport.getSnapshot().currentTimeSec);
        setMarkFlash(true);
        setTimeout(() => setMarkFlash(false), 400);
    }, []);

    const handleJump = useCallback(() => {
        const transport = transportRef.current;
        if (!transport || markedTime === null) return;
        transport.seek(markedTime);
        updateUi();
    }, [markedTime, updateUi]);

    const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const transport = transportRef.current;
        if (!transport) return;
        const nextTime = Number(e.target.value);
        transport.seek(nextTime);
        const chartTime = nextTime - chartLeadInSecRef.current;
        const events = hitEventsRef.current;
        let low = 0;
        let high = events.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (events[mid].timeSec < chartTime - 0.0001) low = mid + 1;
            else high = mid;
        }
        nextHitEventIndexRef.current = low;
        previousTimeSecRef.current = nextTime;
        previousChartTimeSecRef.current = chartTime;
        effectsRef.current?.reset();
        judgementEffectsRef.current?.reset();
        updateUi();
    }, [updateUi]);

    const handleSpeedChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const transport = transportRef.current;
        const raw = e.target.value;
        setSpeedText(raw);

        const val = Number(raw);
        const valid = raw !== "" && Number.isFinite(val) && val >= 0.1 && val <= 4;

        if (valid) {
            setSpeedError(false);
            speedErrorRef.current = false;
            setPlaybackRate(val);
            if (transport) {
                await transport.setPlaybackRate(val);
                try { localStorage.setItem(LS_PLAYBACK_RATE, String(val)); } catch { /* quota */ }
                // Auto-resume if we paused due to speed error
                if (pausedBySpeedErrorRef.current) {
                    pausedBySpeedErrorRef.current = false;
                    await transport.play();
                }
                updateUi();
            }
        } else {
            setSpeedError(true);
            speedErrorRef.current = true;
            // Pause if currently playing, and remember we did so
            if (transport && transport.getSnapshot().state === "playing") {
                pausedBySpeedErrorRef.current = true;
                transport.pause();
                updateUi();
            }
        }
    }, [updateUi]);

    const handleNoteSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        // Allow empty input while typing
        if (raw === "") {
            setNoteSpeed(0);
            return;
        }
        const val = Number(raw);
        if (!Number.isFinite(val)) return;
        const clamped = Math.min(Math.max(val, 1), 12);
        setNoteSpeed(clamped);
        configRef.current = { ...configRef.current, noteSpeed: clamped };
        wasmRef.current?.setPreviewConfig(configRef.current);
        try { localStorage.setItem(LS_NOTE_SPEED, String(clamped)); } catch { /* quota */ }
    }, []);

    const handleSeVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value) / 100;
        setSeVolume(val);
        judgementSoundsRef.current?.setVolume(val);
        try { localStorage.setItem(LS_SE_VOLUME, String(val)); } catch { /* quota */ }
    }, []);

    const handleBgmVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value) / 100;
        setBgmVolume(val);
        transportRef.current?.setVolume(val);
        try { localStorage.setItem(LS_BGM_VOLUME, String(val)); } catch { /* quota */ }
    }, []);

    const handleLowEffectsToggle = useCallback(() => {
        setLowEffects(prev => {
            const next = !prev;
            configRef.current = { ...configRef.current, effectOpacity: next ? 0.3 : 1 };
            wasmRef.current?.setPreviewConfig(configRef.current);
            return next;
        });
    }, []);

    const handleRenderScaleChange = useCallback((scale: number) => {
        setRenderScale(scale);
        renderScaleRef.current = scale;
        try { localStorage.setItem(LS_RENDER_SCALE, String(scale)); } catch { /* quota */ }
        const panel = panelRef.current;
        if (!panel) return;
        const bounds = panel.getBoundingClientRect();
        const dpr = (window.devicePixelRatio || 1) * scale;
        rendererRef.current?.resize(bounds.width, bounds.height, dpr);
        wasmRef.current?.resize(bounds.width, bounds.height, dpr);
        effectsRef.current?.resize(bounds.width, bounds.height, dpr);
        judgementEffectsRef.current?.resize(bounds.width, bounds.height, dpr);
    }, []);

    const handleUnlock = useCallback(async () => {
        const transport = transportRef.current;
        if (!transport) return;
        await transport.unlock();
        setRequiresGesture(false);
        updateUi();
    }, [updateUi]);

    const showStatus = previewState === "init" || previewState === "loading" || previewState === "error";
    const isCompactControls = isPseudoFullscreen;
    const fullscreenHeight = viewport.height > 0 ? `${viewport.height}px` : "100dvh";
    const wrapperClassName = isPseudoFullscreen
        ? "fixed inset-0 z-[150] bg-scrim"
        : isNativeFullscreen
            ? "h-full w-full bg-scrim"
            : "flex flex-col gap-3 w-full";
    const contentClassName = isFullscreen ? "relative h-full w-full bg-scrim" : "flex flex-col gap-3";
    const panelClassName = `relative overflow-hidden bg-scrim ${isFullscreen ? "rounded-none" : "rounded-md3-lg"}`;
    const controlsClassName = isFullscreen
        ? "absolute bottom-0 left-0 right-0 z-30 flex flex-col gap-2.5 border-t border-outline-variant bg-surface-container/95 px-4 pt-3 text-on-surface transition-opacity duration-300 ease-md3-standard"
        : "flex flex-col gap-3 rounded-md3-xl bg-surface-container-low p-4 text-on-surface";
    const timeClassName = `${isCompactControls ? "type-label-s" : "type-label-m"} ml-auto font-mono shrink min-w-0 truncate text-right text-on-surface-variant`;
    const chipClassName = "border-outline-variant bg-surface-container-lowest";
    const fieldTextClassName = `text-on-surface-variant ${isCompactControls ? "type-label-s" : "type-label-m"}`;
    const fieldInputClassName = "border-outline-variant bg-surface-container-lowest text-on-surface";
    const buttonSize = isCompactControls ? "xs" : "s";

    return (
        <div
            ref={wrapperRef}
            className={wrapperClassName}
            style={isPseudoFullscreen ? { height: fullscreenHeight, overscrollBehavior: "none", touchAction: "none" } : undefined}
            onPointerMove={isFullscreen ? resetControlsTimer : undefined}
            onPointerDown={isFullscreen ? resetControlsTimer : undefined}
        >
            <div className={contentClassName} style={isPseudoFullscreen ? { minHeight: fullscreenHeight } : undefined}>
                <div
                    className={isFullscreen ? "flex h-full w-full items-center justify-center bg-scrim" : "w-full"}
                    style={isPseudoFullscreen ? { paddingTop: "env(safe-area-inset-top)" } : isNativeFullscreen ? { padding: 16 } : undefined}
                >
                    <div
                        ref={panelRef}
                        className={panelClassName}
                        style={isFullscreen
                            ? { width: "100%", aspectRatio: "16 / 9", maxWidth: isPseudoFullscreen ? "100%" : "min(100%, 1800px)", maxHeight: "100%", flexShrink: 0 }
                            : { width: "100%", aspectRatio: "16 / 9" }}
                    >
                        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
                        <canvas ref={effectsCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

                        {/* HUD Layer */}
                        <div ref={hudLayerRef} className="hud-layer" hidden>
                            <div className="hud-layout">
                                {/* Score */}
                                <div ref={hudScoreRootRef} className="hud-score-root">
                                    <img className="hud-score-bg" src="/assets/mmw/overlay/score/bg.png" alt="" />
                                    <div ref={hudScoreBarClipRef} className="hud-score-bar-clip" style={{ width: 0 }}>
                                        <img className="hud-score-bar" src="/assets/mmw/overlay/score/bar.png" alt="" />
                                    </div>
                                    <img className="hud-score-fg" src="/assets/mmw/overlay/score/fg.png" alt="" />
                                    <img ref={hudScoreRankCharRef} className="hud-score-rank-char" src="/assets/mmw/overlay/score/rank/chr/d.png" alt="" />
                                    <img ref={hudScoreRankTxtRef} className="hud-score-rank-txt" src="/assets/mmw/overlay/score/rank/txt/en/d.png" alt="" />
                                    <div ref={hudScoreDigitsRef} className="hud-score-digits" />
                                    <div ref={hudScorePlusRef} className="hud-score-plus" hidden />
                                </div>

                                {/* Life */}
                                <div ref={hudLifeRootRef} className="hud-life-root">
                                    <img className="hud-life-bg" src="/assets/mmw/overlay/life/v3/bg.png" alt="" />
                                    <div ref={hudLifeFillClipRef} className="hud-life-fill-clip">
                                        <img className="hud-life-fill" src="/assets/mmw/overlay/life/v3/normal.png" alt="" />
                                    </div>
                                    <div ref={hudLifeDigitsRef} className="hud-life-digits" />
                                </div>

                                {/* Combo */}
                                <div ref={hudComboRootRef} className="hud-combo-root">
                                    <img ref={hudComboTagRef} className="hud-combo-tag" src="/assets/mmw/overlay/combo/nt.png" alt="" hidden />
                                    <div ref={hudComboDigitsRef} className="hud-combo-digits" />
                                </div>

                                {/* Judge */}
                                <div ref={hudJudgeLayerRef} className="hud-judge-layer" hidden />

                                {/* Intro Card */}
                                <div ref={hudIntroCardRef} className="hud-intro-card">
                                    <div className="hud-intro-bg">
                                        <canvas ref={hudIntroBgCanvasRef} className="hud-intro-bg-canvas" width={1920} height={1080} />
                                    </div>
                                    <div ref={hudIntroCoverShellRef} className="hud-intro-cover-shell" hidden>
                                        <img ref={hudIntroCoverRef} className="hud-intro-cover" alt="" hidden />
                                        <div ref={hudIntroDifficultyRef} className="hud-intro-difficulty" hidden />
                                    </div>
                                    <div ref={hudIntroTextRef} className="hud-intro-text">
                                        <div ref={hudIntroExtraRef} className="hud-intro-extra" hidden />
                                        <div ref={hudIntroTitleRef} className="hud-intro-title" />
                                        <div ref={hudIntroDesc1Ref} className="hud-intro-meta" />
                                        <div ref={hudIntroDesc2Ref} className="hud-intro-meta" />
                                    </div>
                                </div>

                                {/* Auto Live badge */}
                                <img ref={hudAutoBadgeRef} className="hud-auto-badge" src="/assets/mmw/overlay/autolive.png" alt="" hidden />
                            </div>
                        </div>

                        {/* AP Layer */}
                        <div ref={apLayerRef} className="ap-layer" hidden>
                            <video ref={apVideoRef} className="ap-video-source" src="/assets/mmw/overlay/ap.mp4" playsInline muted preload="auto" />
                            <canvas ref={apCanvasRef} className="ap-canvas" />
                        </div>

                        {showStatus && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-scrim/32">
                                <div className={`flex flex-col items-center ${isCompactControls ? "gap-3 p-4" : "gap-4 p-6"}`}>
                                    {previewState !== "error" ? (
                                        <div
                                            className={`chart-preview-logo-fill ${isCompactControls ? "h-10 w-40" : "h-14 w-56 sm:h-16 sm:w-64"}`}
                                            style={{
                                                backgroundImage:
                                                    "linear-gradient(to right, var(--md-sys-color-primary-container) 33%, var(--md-sys-color-primary) 33%, rgba(255,255,255,0.15) 66%, var(--md-sys-color-primary-container) 66%)",
                                                backgroundSize: "300% 100%",
                                                maskImage: `url(${MOE_LOGO_URL})`,
                                                maskSize: "contain",
                                                maskPosition: "center",
                                                maskRepeat: "no-repeat",
                                                WebkitMaskImage: `url(${MOE_LOGO_URL})`,
                                                WebkitMaskSize: "contain",
                                                WebkitMaskPosition: "center",
                                                WebkitMaskRepeat: "no-repeat",
                                            }}
                                            role="img"
                                            aria-label="Loading"
                                        />
                                    ) : (
                                        <Icon path={mdErrorFill} size={isCompactControls ? 32 : 40} className="text-error-container" />
                                    )}
                                    <div className="text-center">
                                        {/* Text sits on the dark game playfield, so it stays light in both themes. */}
                                        <div className={`text-white ${isCompactControls ? "mb-0.5 type-label-l" : "mb-1 type-title-s"}`}>{statusTitle}</div>
                                        <div className={`text-white/70 ${isCompactControls ? "type-label-s" : "type-body-s"}`}>{statusText}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {requiresGesture && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-scrim/80">
                                <div className={`text-center ${isCompactControls ? "p-4" : "p-6"}`}>
                                    <div className={`text-white ${isCompactControls ? "mb-1 type-title-s" : "mb-2 type-title-l"}`}>{t("page.chartPreview.player.audioGestureTitle")}</div>
                                    {!isCompactControls && <div className="mb-4 type-body-m text-white/70">{t("page.chartPreview.player.audioGestureDescription")}</div>}
                                    <Button
                                        variant="filled"
                                        size={buttonSize}
                                        icon={mdPlayArrowFill}
                                        onClick={handleUnlock}
                                        className={isCompactControls ? "mt-2" : undefined}
                                    >
                                        {t("page.chartPreview.player.startAudio")}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {bgmLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-scrim/60">
                                <div className={`flex flex-col items-center text-center ${isCompactControls ? "gap-1 p-4" : "gap-2 p-6"}`}>
                                    <LoadingIndicator size={isCompactControls ? 32 : 48} />
                                    <div className={`text-white ${isCompactControls ? "type-title-s" : "type-title-l"}`}>{t("page.chartPreview.player.loadingSongTitle")}</div>
                                    <div className={`text-white/70 ${isCompactControls ? "type-body-s" : "type-body-m"}`}>{t("page.chartPreview.player.loadingSongDescription")}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Lock button — fullscreen only, always visible in top-right corner */}
                {isFullscreen && (
                    <IconButton
                        icon={mdLockOpen}
                        selectedIcon={mdLock}
                        selected={controlsLocked}
                        variant={controlsLocked ? "filled" : "tonal"}
                        onClick={handleControlsLockToggle}
                        className="absolute top-3 right-3 z-40"
                        label={controlsLocked ? t("page.chartPreview.player.unlockControls") : t("page.chartPreview.player.lockControls")}
                    />
                )}

                <div
                    className={controlsClassName}
                    style={isFullscreen
                        ? {
                            opacity: controlsVisible ? 1 : 0,
                            pointerEvents: controlsVisible ? "auto" : "none",
                            paddingBottom: isPseudoFullscreen ? "calc(env(safe-area-inset-bottom) + 12px)" : 16,
                        }
                        : undefined}
                >
                    <div className={isFullscreen ? "flex items-center justify-between" : "flex min-w-0 flex-wrap items-center gap-2"}>
                        {/* Left buttons */}
                        <div className={isFullscreen ? "flex items-center gap-2" : "contents"}>
                            {isFullscreen ? (
                                <>
                                    <IconButton
                                        icon={isPlaying ? mdPauseFill : mdPlayArrowFill}
                                        variant="filled"
                                        onClick={handlePlayToggle}
                                        disabled={bgmLoading || previewState !== "ready"}
                                        label={isPlaying ? t("page.chartPreview.player.pause") : t("page.chartPreview.player.play")}
                                    />
                                    <IconButton icon={mdStopFill} variant="tonal" onClick={handleStop} label={t("page.chartPreview.player.stop")} />
                                    <IconButton icon={mdBookmark} variant="tonal" onClick={handleMark} label={t("page.chartPreview.player.markCurrentTime")} />
                                    <IconButton
                                        icon={mdReplay}
                                        variant={markedTime !== null && !markFlash ? "filled" : "tonal"}
                                        onClick={handleJump}
                                        disabled={markedTime === null}
                                        label={markedTime !== null ? t("page.chartPreview.player.jumpToTime", { time: formatTime(markedTime) }) : t("page.chartPreview.player.noMarkedTime")}
                                    />
                                </>
                            ) : (
                                <>
                                    <Button
                                        variant="filled"
                                        size={buttonSize}
                                        icon={isPlaying ? mdPauseFill : mdPlayArrowFill}
                                        className="shrink-0"
                                        onClick={handlePlayToggle}
                                        disabled={bgmLoading || previewState !== "ready"}
                                        title={isPlaying ? t("page.chartPreview.player.pause") : t("page.chartPreview.player.play")}
                                    >
                                        {isPlaying ? t("page.chartPreview.player.pause") : t("page.chartPreview.player.play")}
                                    </Button>
                                    <Button variant="tonal" size={buttonSize} icon={mdStopFill} className="shrink-0" onClick={handleStop} title={t("page.chartPreview.player.stop")}>
                                        {t("page.chartPreview.player.stop")}
                                    </Button>
                                    <Button variant="tonal" size={buttonSize} icon={mdBookmark} className="shrink-0" onClick={handleMark} title={t("page.chartPreview.player.markCurrentTime")}>
                                        {t("page.chartPreview.player.mark")}
                                    </Button>
                                    <Button
                                        variant={markedTime !== null && !markFlash ? "filled" : "tonal"}
                                        size={buttonSize}
                                        icon={mdReplay}
                                        className="shrink-0"
                                        onClick={handleJump}
                                        disabled={markedTime === null}
                                        title={markedTime !== null ? t("page.chartPreview.player.jumpToTime", { time: formatTime(markedTime) }) : t("page.chartPreview.player.noMarkedTime")}
                                    >
                                        {t("page.chartPreview.player.jump")}
                                    </Button>
                                </>
                            )}
                        </div>
                        {/* Non-fullscreen time (original position) */}
                        {!isFullscreen && (
                            <span className={timeClassName}>
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </span>
                        )}
                        {/* Right: time + exit fullscreen (fullscreen only) */}
                        <div className={isFullscreen ? "flex items-center gap-3" : "hidden"}>
                            <span className={timeClassName}>
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </span>
                            <IconButton
                                icon={mdFullscreenExit}
                                variant="tonal"
                                onClick={handleFullscreenToggle}
                                label={t("page.chartPreview.player.exitFullscreen")}
                            />
                        </div>
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.001}
                        value={Math.min(currentTime, duration || currentTime)}
                        onChange={handleSeek}
                        className={`w-full cursor-pointer accent-primary ${isCompactControls ? "h-1.5" : "h-2"}`}
                    />

                    {!isFullscreen && (
                        <div className={`flex flex-wrap items-center ${isCompactControls ? "gap-1.5" : "gap-2"}`}>
                            <label className={`flex h-10 items-center gap-1.5 rounded-md3-sm border px-3 ${chipClassName}`}>
                                <span className={fieldTextClassName}>{t("page.chartPreview.player.speed")}</span>
                                <input
                                    ref={speedInputRef}
                                    type="number"
                                    max={4}
                                    step={0.05}
                                    value={speedText}
                                    onChange={handleSpeedChange}
                                    className={`${isCompactControls ? "w-14" : "w-16"} focus-ring rounded-md3-xs border px-1.5 py-0.5 text-center type-label-m transition-colors ${speedError ? "animate-pulse border-error bg-error-container text-on-error-container" : fieldInputClassName}`}
                                />
                            </label>

                            <label className={`flex h-10 items-center gap-1.5 rounded-md3-sm border px-3 ${chipClassName}`}>
                                <span className={fieldTextClassName}>noteSpeed</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={12}
                                    step={0.1}
                                    value={noteSpeed || ""}
                                    onChange={handleNoteSpeedChange}
                                    className={`${isCompactControls ? "w-12" : "w-14"} focus-ring rounded-md3-xs border px-1.5 py-0.5 text-center type-label-m ${fieldInputClassName}`}
                                />
                            </label>

                            <label className={`flex h-10 items-center gap-1.5 rounded-md3-sm border px-3 ${chipClassName}`}>
                                <span className={fieldTextClassName}>{t("page.chartPreview.player.seVolume")}</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={Math.round(seVolume * 100)}
                                    onChange={handleSeVolumeChange}
                                    className={`${isCompactControls ? "w-14" : "w-16"} cursor-pointer accent-primary`}
                                />
                                <span className="type-label-s tabular-nums text-on-surface-variant">{Math.round(seVolume * 100)}%</span>
                            </label>

                            <label className={`flex h-10 items-center gap-1.5 rounded-md3-sm border px-3 ${chipClassName}`}>
                                <span className={fieldTextClassName}>{t("page.chartPreview.player.bgmVolume")}</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={Math.round(bgmVolume * 100)}
                                    onChange={handleBgmVolumeChange}
                                    className={`${isCompactControls ? "w-14" : "w-16"} cursor-pointer accent-primary`}
                                />
                                <span className="type-label-s tabular-nums text-on-surface-variant">{Math.round(bgmVolume * 100)}%</span>
                            </label>

                            <Chip selected={lowEffects} onClick={handleLowEffectsToggle}>
                                {t("page.chartPreview.player.lowEffects")}
                            </Chip>

                            <div className={`flex h-10 items-center gap-1.5 rounded-md3-sm border px-3 ${chipClassName}`}>
                                <span className={fieldTextClassName}>{t("page.chartPreview.player.quality")}</span>
                                <div className="flex gap-1">
                                    {RENDER_SCALE_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            aria-pressed={renderScale === opt.value}
                                            onClick={() => handleRenderScaleChange(opt.value)}
                                            className={`state-layer focus-ring rounded-full px-2 py-0.5 type-label-m transition-colors duration-150 ease-md3-standard ${renderScale === opt.value
                                                ? "bg-primary text-on-primary"
                                                : "text-on-surface-variant"
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="ml-auto flex items-center gap-1.5">
                                <Button
                                    variant="outlined"
                                    size={buttonSize}
                                    icon={mdFitScreen}
                                    onClick={handleWebFullscreenToggle}
                                    title={t("page.chartPreview.player.webFullscreenTitle")}
                                >
                                    {t("page.chartPreview.player.webFullscreen")}
                                </Button>
                                <Button
                                    variant="outlined"
                                    size={buttonSize}
                                    icon={mdFullscreen}
                                    onClick={handleFullscreenToggle}
                                    title={t("page.chartPreview.player.enterFullscreen")}
                                >
                                    {t("page.chartPreview.player.fullscreen")}
                                </Button>
                            </div>
                        </div>
                    )}

                    {warningMessage && <div className={`text-tertiary ${isCompactControls ? "type-label-s" : "type-body-s"}`}>{warningMessage}</div>}

                    {!isFullscreen && isIOS && (
                        <div className="space-y-0.5 text-right type-body-s italic text-on-surface-variant">
                            <div>{t("page.chartPreview.player.iosWebFullscreenTip")}</div>
                            <div>{t("page.chartPreview.player.iosQualityTip")}</div>
                        </div>
                    )}

                    {!isFullscreen && (
                        <div className="type-body-s text-on-surface-variant">
                            Adapted from{" "}
                            <ExternalLink href="https://github.com/crash5band/MikuMikuWorld" className="text-primary hover:underline">
                                MikuMikuWorld
                            </ExternalLink>{" "}
                            {t("page.chartPreview.player.creditMikuMikuWorldSuffix")} {t("page.chartPreview.player.creditSourcePrefix")}{" "}
                            <ExternalLink href="https://github.com/watagashi-uni/" className="text-primary hover:underline">
                                watagashi-uni
                            </ExternalLink>{t("page.chartPreview.player.creditSourceMiddle")}{" "}
                            <ExternalLink href="https://github.com/watagashi-uni/sekai-mmw-preview-web" className="text-primary hover:underline">
                                sekai-mmw-preview-web
                            </ExternalLink>
                            {t("page.chartPreview.player.creditSourceSuffix")}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
