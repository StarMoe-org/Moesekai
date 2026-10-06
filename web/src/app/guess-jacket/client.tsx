"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { Button, Icon, IconButton, TextField, LinearProgress, LoadingIndicator, LoadingState, ErrorState } from "@/components/md3";
import { getMusicJacketUrl } from "@/lib/assets";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { loadTranslations, type TranslationData } from "@/lib/translations";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { mdShare, mdRefresh, mdArrowForward } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { IMusicInfo } from "@/types/music";

const ROUNDS_PER_GAME = 10;
const OPTIONS_PER_ROUND_DEFAULT = 10;
const OPTIONS_CHOICES = [4, 6, 8, 10] as const;
const BASE_SCORE_PER_ROUND = 1000;
const FEEDBACK_DURATION = 3000;
const MAX_STRIKES_PER_ROUND = 3;

type GameState = "setup" | "playing" | "result";
type Difficulty = "easy" | "normal" | "hard" | "extreme";
type ServerScope = "jp" | "cn";

// Distortion Effects for Extreme Mode
type DistortionType = "none" | "hue-rotate" | "flip-v" | "flip-h" | "grayscale" | "invert" | "rgb-shuffle";

interface ActiveDistortion {
    type: DistortionType;
}

const DISTORTION_POOL: ActiveDistortion[] = [
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

interface CropRect {
    x: number;
    y: number;
    size: number;
}

interface GameSettings {
    server: ServerScope;
    seed: string;
    difficulty: Difficulty;
    timeLimit: number;
    optionsCount: number;
}

interface RoundQuestion {
    music: IMusicInfo;
    options: IMusicInfo[];
}

interface RoundResult {
    round: number;
    music: IMusicInfo;
    userGuess: number | null;
    isCorrect: boolean;
    score: number;
    timeTaken: number;
    multiplier: number;
    distortions?: ActiveDistortion[];
}

class SeededRandom {
    private seed: number;

    constructor(seed: string) {
        this.seed = this.hashString(seed || Date.now().toString());
    }

    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0;
        }
        return hash;
    }

    next(): number {
        const x = Math.sin(this.seed++) * 10000;
        return x - Math.floor(x);
    }

    pickMultiple<T>(array: T[], count: number): T[] {
        const pool = [...array];
        const picked: T[] = [];
        const total = Math.min(count, pool.length);

        for (let i = 0; i < total; i++) {
            const index = Math.floor(this.next() * pool.length);
            picked.push(pool[index]);
            pool.splice(index, 1);
        }

        return picked;
    }
}

const CanvasImage = ({ image, objectFit = "contain" }: { image: HTMLImageElement | null; objectFit?: "contain" | "cover" }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        canvas.width = image.width;
        canvas.height = image.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
    }, [image]);

    if (!image) return null;

    return <canvas ref={canvasRef} className="w-full h-full block" style={{ objectFit }} />;
};

function getAssetSourceForServer(server: ServerScope): AssetSourceType {
    return server === "cn" ? "main-cn" : "main-jp";
}

function getDifficultyMultiplier(difficulty: Difficulty): number {
    if (difficulty === "easy") return 0.8;
    if (difficulty === "hard") return 1.5;
    if (difficulty === "extreme") return 2.2;
    return 1.0;
}

function getCropSize(difficulty: Difficulty): number {
    if (difficulty === "easy") return 380;
    if (difficulty === "hard") return 200;
    if (difficulty === "extreme") return 150;
    return 280;
}

function GuessJacketContent() {
    const searchParams = useSearchParams();
    const { t } = useI18n();

    const [gameState, setGameState] = useState<GameState>("setup");
    const [musics, setMusics] = useState<IMusicInfo[]>([]);
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [settings, setSettings] = useState<GameSettings>({
        server: "jp",
        seed: Math.random().toString(36).substring(7),
        difficulty: "normal",
        timeLimit: 30,
        optionsCount: OPTIONS_PER_ROUND_DEFAULT,
    });

    const [rounds, setRounds] = useState<RoundQuestion[]>([]);
    const [currentRound, setCurrentRound] = useState(0);
    const [currentResults, setCurrentResults] = useState<RoundResult[]>([]);
    const [timeLeft, setTimeLeft] = useState(0);
    const [isRoundActive, setIsRoundActive] = useState(false);
    const [cropRect, setCropRect] = useState<CropRect | null>(null);
    const [strikes, setStrikes] = useState(0);
    const [combo, setCombo] = useState(0);
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackResult, setFeedbackResult] = useState<RoundResult | null>(null);
    const [disabledOptionIds, setDisabledOptionIds] = useState<number[]>([]);
    const [roundNotice, setRoundNotice] = useState("");
    const [redrawFlag, setRedrawFlag] = useState(0);
    const [currentDistortions, setCurrentDistortions] = useState<ActiveDistortion[]>([]);

    const activeImagesRef = useRef<Record<number, HTMLImageElement>>({});
    const roundResolvedRef = useRef(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
    const noticeTimerRef = useRef<NodeJS.Timeout | null>(null);
    const initializedRef = useRef(false);

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const seedParam = searchParams.get("seed");
        const difficultyParam = searchParams.get("difficulty");
        const timeParam = searchParams.get("time");
        const optionsParam = searchParams.get("options");
        const serverParam = searchParams.get("server");

        const safeDifficulty: Difficulty =
            difficultyParam === "easy" || difficultyParam === "normal" || difficultyParam === "hard" || difficultyParam === "extreme"
                ? difficultyParam
                : "normal";

        const timeFromQuery = timeParam === null ? NaN : Number(timeParam);
        const safeTime = Number.isFinite(timeFromQuery)
            ? Math.max(5, Math.min(120, timeFromQuery))
            : 30;

        const optionsFromQuery = optionsParam === null ? NaN : Number(optionsParam);
        const safeOptions = Number.isFinite(optionsFromQuery) && (OPTIONS_CHOICES as readonly number[]).includes(optionsFromQuery)
            ? optionsFromQuery
            : OPTIONS_PER_ROUND_DEFAULT;

        const safeServer: ServerScope = serverParam === "cn" ? "cn" : "jp";

        setSettings((prev) => ({
            ...prev,
            seed: seedParam || prev.seed,
            difficulty: safeDifficulty,
            timeLimit: safeTime,
            optionsCount: safeOptions,
            server: safeServer,
        }));
    }, [searchParams]);

    const loadMusics = useCallback(async () => {
        setIsLoading(true);
        setLoadError("");
        try {
            const [data, translationsData] = await Promise.all([
                fetchMasterDataForServer<IMusicInfo[]>(settings.server, "musics.json"),
                loadTranslations(),
            ]);
            const validMusics = data.filter((music) =>
                Boolean(music.assetbundleName && music.title && music.id > 0)
            );
            setMusics(validMusics);
            setTranslations(translationsData);
        } catch (error) {
            console.error("Failed to load musics", error);
            setLoadError(t("page.guessJacket.common.errors.musicLoadFailed"));
        } finally {
            setIsLoading(false);
        }
    }, [settings.server, t]);

    useEffect(() => {
        loadMusics();
    }, [loadMusics]);

    useEffect(() => {
        return () => {
            if (feedbackTimerRef.current) {
                clearTimeout(feedbackTimerRef.current);
            }
            if (noticeTimerRef.current) {
                clearTimeout(noticeTimerRef.current);
            }
        };
    }, []);

    const musicMap = useMemo(() => {
        return new Map(musics.map((music) => [music.id, music]));
    }, [musics]);

    const getCnTitle = useCallback((jpTitle: string) => {
        return translations?.music?.title?.[jpTitle] ?? "";
    }, [translations]);

    const getDisplayTitle = useCallback((music: IMusicInfo) => {
        const jp = music.title;
        const cn = getCnTitle(jp);
        return {
            jp,
            cn,
        };
    }, [getCnTitle]);

    const getDisplayTitleById = useCallback((musicId: number | null) => {
        if (!musicId) return null;
        const music = musicMap.get(musicId);
        if (!music) return null;
        return getDisplayTitle(music);
    }, [getDisplayTitle, musicMap]);

    const currentQuestion = rounds[currentRound];
    const currentCanvasImage = activeImagesRef.current[currentRound] || null;
    const currentTotalScore = currentResults.reduce((total, result) => total + result.score, 0);
    const comboMultiplier = combo > 0 ? 1 + combo * 0.5 : 1;

    const getShareUrl = useCallback(() => {
        if (typeof window === "undefined") return "";

        const params = new URLSearchParams();
        params.set("seed", settings.seed);
        params.set("difficulty", settings.difficulty);
        params.set("time", settings.timeLimit.toString());
        params.set("options", settings.optionsCount.toString());
        params.set("server", settings.server);
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }, [settings]);

    const copyShareLink = useCallback(() => {
        const url = getShareUrl();
        navigator.clipboard.writeText(url).then(() => {
            alert(t("page.guessJacket.single.shareCopied"));
        });
    }, [getShareUrl, t]);

    const buildRounds = useCallback((pool: IMusicInfo[], seed: string, optionsCount: number): RoundQuestion[] => {
        const deckRandom = new SeededRandom(`${seed}-deck`);
        const selectedSongs = deckRandom.pickMultiple(pool, ROUNDS_PER_GAME);

        return selectedSongs.map((music, roundIndex) => {
            const optionRandom = new SeededRandom(`${seed}-options-${roundIndex}-${music.id}`);
            const distractors = optionRandom.pickMultiple(
                pool.filter((candidate) => candidate.id !== music.id),
                optionsCount - 1
            );
            const mixed = optionRandom.pickMultiple([...distractors, music], optionsCount);
            return {
                music,
                options: mixed,
            };
        });
    }, []);

    const showTransientNotice = useCallback((message: string) => {
        setRoundNotice(message);
        if (noticeTimerRef.current) {
            clearTimeout(noticeTimerRef.current);
        }
        noticeTimerRef.current = setTimeout(() => {
            setRoundNotice("");
        }, 1000);
    }, []);

    const startRound = useCallback((question: RoundQuestion, roundIndex: number) => {
        if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
        }

        roundResolvedRef.current = false;
        setShowFeedback(false);
        setFeedbackResult(null);
        setCropRect(null);
        setTimeLeft(settings.timeLimit);
        setStrikes(0);
        setDisabledOptionIds([]);
        setRoundNotice("");
        setIsRoundActive(false);

        const assetSource = getAssetSourceForServer(settings.server);
        const image = new window.Image();
        image.crossOrigin = "anonymous";
        image.src = getMusicJacketUrl(question.music.assetbundleName, assetSource);

        image.onload = () => {
            activeImagesRef.current[roundIndex] = image;
            setRedrawFlag((prev) => prev + 1);

            const cropSize = getCropSize(settings.difficulty);
            const maxX = Math.max(0, image.width - cropSize);
            const maxY = Math.max(0, image.height - cropSize);
            const cropRandom = new SeededRandom(`${settings.seed}-crop-${roundIndex}-${question.music.id}`);

            const x = Math.floor(cropRandom.next() * (maxX + 1));
            const y = Math.floor(cropRandom.next() * (maxY + 1));

            // Extreme Mode: pick 1-3 random distortions (consistent with guess-who)
            if (settings.difficulty === "extreme") {
                const distRandom = new SeededRandom(`${settings.seed}-dist-${roundIndex}`);
                const numDistortions = Math.floor(distRandom.next() * 3) + 1; // 1 to 3
                const pool = [...DISTORTION_POOL];
                const picked: ActiveDistortion[] = [];
                for (let i = 0; i < numDistortions && pool.length > 0; i++) {
                    const idx = Math.floor(distRandom.next() * pool.length);
                    picked.push(pool[idx]);
                    pool.splice(idx, 1);
                }
                const activeEffects = picked.filter(e => e.type !== "none");
                setCurrentDistortions(activeEffects);
            } else {
                setCurrentDistortions([]);
            }

            setCropRect({ x, y, size: cropSize });
            setIsRoundActive(true);
        };

        image.onerror = () => {
            console.error("Failed to load music jacket", question.music.id);
            showTransientNotice(t("page.guessJacket.common.errors.jacketLoadFailed"));
            setIsRoundActive(true);
            setTimeLeft(0);
        };
    }, [settings.difficulty, settings.seed, settings.timeLimit, settings.server, showTransientNotice, t]);

    useEffect(() => {
        const currentImage = activeImagesRef.current[currentRound];
        const canvas = canvasRef.current;

        if (!canvas || !currentImage || !cropRect) return;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        canvas.width = 320;
        canvas.height = 320;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Base filter per difficulty
        if (settings.difficulty === "hard") {
            ctx.filter = "saturate(120%) contrast(130%)";
        } else {
            ctx.filter = "none";
        }

        ctx.save();

        // Apply distortion filters (extreme mode)
        if (settings.difficulty === "extreme") {
            let filterString = "";
            const hasFlipH = currentDistortions.some(d => d.type === "flip-h");
            const hasFlipV = currentDistortions.some(d => d.type === "flip-v");
            const hasGrayscale = currentDistortions.some(d => d.type === "grayscale");
            const hasInvert = currentDistortions.some(d => d.type === "invert");
            const hasHueRotate = currentDistortions.some(d => d.type === "hue-rotate");

            if (hasGrayscale) filterString += "grayscale(100%) ";
            if (hasInvert) filterString += "invert(100%) ";
            if (hasHueRotate) filterString += "hue-rotate(180deg) ";

            if (filterString) ctx.filter = filterString.trim();

            if (hasFlipH || hasFlipV) {
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.scale(hasFlipH ? -1 : 1, hasFlipV ? -1 : 1);
                ctx.translate(-canvas.width / 2, -canvas.height / 2);
            }
        }

        ctx.drawImage(
            currentImage,
            cropRect.x,
            cropRect.y,
            cropRect.size,
            cropRect.size,
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.restore();

        // Apply pixel manipulations (RGB Shuffle) after standard filters
        if (settings.difficulty === "extreme" && currentDistortions.some(d => d.type === "rgb-shuffle")) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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
    }, [currentRound, cropRect, redrawFlag, settings.difficulty, settings.seed, currentDistortions]);

    const finishRound = useCallback((guessMusicId: number | null) => {
        if (roundResolvedRef.current || !currentQuestion) return;
        roundResolvedRef.current = true;
        setIsRoundActive(false);

        const isCorrect = guessMusicId === currentQuestion.music.id;
        const timeTaken = settings.timeLimit - timeLeft;

        let roundScore = 0;
        let multiplier = 1;

        if (isCorrect) {
            const timeFactor = Math.max(0.1, timeLeft / settings.timeLimit);
            const diffMultiplier = getDifficultyMultiplier(settings.difficulty);
            const newCombo = strikes === 0 ? combo + 1 : 0;
            setCombo(newCombo);

            multiplier = 1 + Math.max(0, newCombo - 1) * 0.5;
            roundScore = Math.floor(BASE_SCORE_PER_ROUND * timeFactor * diffMultiplier * multiplier);
        } else {
            setCombo(0);
        }

        const result: RoundResult = {
            round: currentRound,
            music: currentQuestion.music,
            userGuess: guessMusicId,
            isCorrect,
            score: roundScore,
            timeTaken,
            multiplier,
            distortions: currentDistortions.length > 0 ? currentDistortions : undefined,
        };

        setCurrentResults((prev) => [...prev, result]);
        setFeedbackResult(result);
        setShowFeedback(true);

        feedbackTimerRef.current = setTimeout(() => {
            if (currentRound < ROUNDS_PER_GAME - 1) {
                const nextRound = currentRound + 1;
                setCurrentRound(nextRound);
                const nextQuestion = rounds[nextRound];
                if (nextQuestion) {
                    startRound(nextQuestion, nextRound);
                }
            } else {
                setGameState("result");
            }
        }, FEEDBACK_DURATION);
    }, [combo, currentDistortions, currentQuestion, currentRound, rounds, settings.difficulty, settings.timeLimit, startRound, strikes, timeLeft]);

    const handleGuess = useCallback((musicId: number | null) => {
        if (!isRoundActive || !currentQuestion) return;

        const isCorrect = musicId === currentQuestion.music.id;

        if (!isCorrect && musicId !== null && strikes < MAX_STRIKES_PER_ROUND - 1) {
            setStrikes((prev) => prev + 1);
            setTimeLeft((prev) => prev * 0.5);
            setCombo(0);
            setDisabledOptionIds((prev) => (prev.includes(musicId) ? prev : [...prev, musicId]));
            showTransientNotice(t("page.guessJacket.single.wrongTimePenalty"));
            return;
        }

        finishRound(musicId);
    }, [currentQuestion, finishRound, isRoundActive, showTransientNotice, strikes, t]);

    useEffect(() => {
        if (!isRoundActive) return;
        if (timeLeft <= 0) {
            finishRound(null);
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft((prev) => Math.max(0, prev - 0.1));
        }, 100);

        return () => clearInterval(timer);
    }, [finishRound, isRoundActive, timeLeft]);

    const startGame = useCallback(() => {
        if (isLoading) return;

        const validPool = musics.filter((music) => music.assetbundleName && music.title);
        const requiredPoolSize = Math.max(ROUNDS_PER_GAME, settings.optionsCount);

        if (validPool.length < requiredPoolSize) {
            alert(t("page.guessJacket.common.errors.deckInsufficient", { count: validPool.length }));
            return;
        }

        const builtRounds = buildRounds(validPool, settings.seed, settings.optionsCount);
        setRounds(builtRounds);
        setCurrentRound(0);
        setCurrentResults([]);
        setCombo(0);
        activeImagesRef.current = {};
        setGameState("playing");
        startRound(builtRounds[0], 0);
    }, [buildRounds, isLoading, musics, settings.optionsCount, settings.seed, startRound, t]);

    const handleNextRound = useCallback(() => {
        if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
        }

        if (currentRound < ROUNDS_PER_GAME - 1) {
            const nextRound = currentRound + 1;
            setCurrentRound(nextRound);
            const nextQuestion = rounds[nextRound];
            if (nextQuestion) {
                startRound(nextQuestion, nextRound);
            }
        } else {
            setGameState("result");
        }
    }, [currentRound, rounds, startRound]);

    const formatTime = (seconds: number) => `${Math.max(0, seconds).toFixed(1)}s`;
    const getServerLabel = useCallback((server: ServerScope) => t(`page.guessJacket.common.serverLabels.${server}`), [t]);
    const getServerShortLabel = useCallback((server: ServerScope) => t(`page.guessJacket.common.serverLabels.${server}Short`), [t]);
    const getDifficultyLabel = useCallback((difficulty: Difficulty) => t(`page.guessJacket.common.difficultyLabels.${difficulty}`), [t]);
    const getDistortionLabel = useCallback((distortion: ActiveDistortion) => t(`page.guessJacket.common.distortions.${DISTORTION_LABEL_KEYS[distortion.type]}`), [t]);
    const getLocalizedMusicTitle = useCallback((title: ReturnType<typeof getDisplayTitle> | null) => {
        if (!title) return t("page.guessJacket.common.noTranslation");
        return title.cn || t("page.guessJacket.common.noTranslation");
    }, [t]);
    const formatGuessedTitle = useCallback((musicId: number | null) => {
        if (!musicId) return t("page.guessJacket.common.timeout");
        const guessed = getDisplayTitleById(musicId);
        if (!guessed) return t("page.guessJacket.common.noTranslation");
        return `${guessed.jp} / ${getLocalizedMusicTitle(guessed)}`;
    }, [getDisplayTitleById, getLocalizedMusicTitle, t]);

    const potentialScore = useMemo(() => {
        if (!isRoundActive) return 0;

        const timeFactor = Math.max(0.1, timeLeft / settings.timeLimit);
        const difficultyFactor = getDifficultyMultiplier(settings.difficulty);
        const previewComboMultiplier = combo > 0 ? 1 + combo * 0.5 : 1;

        return Math.floor(BASE_SCORE_PER_ROUND * timeFactor * difficultyFactor * previewComboMultiplier);
    }, [combo, isRoundActive, settings.difficulty, settings.timeLimit, timeLeft]);

    if (isLoading) {
        return (
            <MainLayout>
                <div className="flex min-h-screen items-center justify-center">
                    <h1 className="sr-only">{t("page.guessJacket.title")}</h1>
                    <LoadingState label={t("page.guessJacket.common.loading")} />
                </div>
            </MainLayout>
        );
    }

    if (gameState === "result") {
        const shareUrl = getShareUrl();
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`;

        return (
            <MainLayout>
                <div className="min-h-screen">
                    <div className="container mx-auto px-4 py-8 pb-20">
                        <div className="max-w-4xl mx-auto rounded-md3-xl overflow-hidden bg-surface-container-low text-on-surface">
                            <div className="p-8 text-center border-b border-outline-variant">
                                <div className="inline-flex items-center gap-2 px-4 py-2 border border-outline-variant bg-primary-container rounded-full mb-4">
                                    <span className="text-primary type-label-m type-emphasized">GUESS JACKET</span>
                                </div>
                                <h1 className="type-headline-l type-emphasized text-on-surface mb-2">{t("page.guessJacket.single.challengeComplete")}</h1>
                                <p className="type-title-l text-on-surface-variant mb-6">{t("page.guessJacket.single.finalScore")}</p>
                                <div className="type-display-l type-emphasized text-primary mb-8 motion-safe:animate-bounce">{currentTotalScore}</div>

                                <div className="flex flex-col md:flex-row items-center justify-center gap-8 bg-surface-container-high rounded-md3-lg p-6 mb-8">
                                    <div className="text-left space-y-2 type-body-m text-on-surface-variant">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-on-surface w-16">{t("page.guessJacket.common.seed")}</span>
                                            <code className="bg-surface-container-high px-2 py-1 rounded-md3-xs border border-outline-variant font-mono text-on-surface ">{settings.seed}</code>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-on-surface w-16">{t("page.guessJacket.common.server")}</span>
                                            <span className="font-bold text-on-surface "><ServerRegionLabel server={settings.server} label={getServerLabel(settings.server)} /></span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-on-surface w-16">{t("page.guessJacket.common.difficulty")}</span>
                                            <span className="font-bold text-primary">{getDifficultyLabel(settings.difficulty)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-on-surface w-16">{t("page.guessJacket.common.timeLimit")}</span>
                                            <span className="text-on-surface ">{settings.timeLimit}{t("page.guessJacket.common.secondsSuffix")}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-on-surface w-16">{t("page.guessJacket.common.questionCount")}</span>
                                            <span className="text-on-surface ">{t("page.guessJacket.common.questionCountValue", { rounds: ROUNDS_PER_GAME, options: settings.optionsCount })}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center gap-2">
                                        <div data-theme="light" data-seed="21" className="w-[120px] h-[120px] bg-surface-container-lowest p-2 rounded-md3-md shadow-elev-1 border border-outline-variant">
                                            <Image src={qrCodeUrl} alt="Share QR Code" width={120} height={120} className="w-full h-full object-contain" unoptimized />
                                        </div>
                                        <span className="type-label-m text-on-surface-variant type-emphasized">{t("page.guessJacket.single.scanToChallenge")}</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap justify-center gap-4">
                                    <Button
                                        onClick={copyShareLink}
                                        variant="tonal" size="m" className="max-w-full"
                                    >
                                        {t("page.guessJacket.single.copyLink")}
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            setSettings((prev) => ({
                                                ...prev,
                                                seed: Math.random().toString(36).substring(7),
                                            }));
                                            setGameState("setup");
                                        }}
                                        variant="filled" size="m" className=""
                                    >
                                        {t("page.guessJacket.single.playAgainNewSeed")}
                                    </Button>
                                </div>
                            </div>

                            <div className="p-8 bg-surface-container">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                                    {currentResults.map((result) => (
                                        <Link
                                            href={`/music/${result.music.id}`}
                                            key={result.round}
                                            className={`state-layer focus-ring block p-4 rounded-md3-md border transition-transform  hover:shadow-elev-2 ${result.isCorrect ? "bg-primary-container  border-primary/30" : "bg-error-container  border-error/30"}`}
                                        >
                                            <div className="flex gap-4">
                                                <div className="w-16 h-16 relative rounded-md3-sm overflow-hidden shadow-elev-1 ring-1 ring-outline-variant shrink-0">
                                                    <Image
                                                        src={getMusicJacketUrl(result.music.assetbundleName, getAssetSourceForServer(settings.server))}
                                                        alt={result.music.title}
                                                        fill
                                                        className="object-cover"
                                                        unoptimized
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="type-label-m text-on-surface-variant type-emphasized mb-0.5">
                                                        Round {result.round + 1}
                                                    </div>
                                                    <div className={`type-emphasized type-title-m leading-tight mb-1 ${result.isCorrect ? "text-on-primary-container" : "text-on-error-container"}`}>
                                                        {result.isCorrect ? t("page.guessJacket.common.correct") : t("page.guessJacket.common.wrong")}
                                                    </div>
                                                    {!result.isCorrect && (
                                                        <div className="type-label-m text-error font-bold bg-surface-container-lowest inline-block px-1 rounded-md3-xs mb-1">
                                                            {t("page.guessJacket.common.selectedGuess", { name: formatGuessedTitle(result.userGuess) })}
                                                        </div>
                                                    )}
                                                    <div className="type-body-m text-on-surface truncate font-bold">{getDisplayTitle(result.music).jp}</div>
                                                    <div className="type-label-m text-on-surface-variant truncate">{getLocalizedMusicTitle(getDisplayTitle(result.music))}</div>
                                                    <div className="type-label-m text-on-surface-variant">{t("page.guessJacket.common.usedTime", { time: formatTime(result.timeTaken) })}</div>
                                                </div>
                                                <div className="flex flex-col items-end shrink-0">
                                                    <div className="type-title-m font-bold text-on-surface">+{result.score}</div>
                                                    {result.multiplier > 1 && (
                                                        <div className="type-label-m font-bold text-primary bg-primary-container px-1.5 rounded-md3-xs">
                                                            x{result.multiplier.toFixed(1)} Combo
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {result.distortions && result.distortions.length > 0 && (
                                                <div className="flex flex-wrap justify-end gap-1 px-1 mt-1">
                                                    {result.distortions.map((d, i) => (
                                                        <span key={i} className="type-label-s px-1.5 py-0.5 bg-inverse-surface text-inverse-on-surface rounded-md3-xs font-bold shadow-elev-1 whitespace-nowrap">
                                                            {getDistortionLabel(d)}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </MainLayout>
        );
    }

    if (gameState === "playing" && currentQuestion) {
        return (
            <MainLayout>
                <div className="h-[100dvh] overflow-hidden">
                    <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-col h-[100dvh] relative overflow-hidden">
                        {showFeedback && feedbackResult && currentCanvasImage && typeof document !== "undefined" && createPortal(
                            <div
                                className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-inverse-surface text-inverse-on-surface cursor-pointer animate-in fade-in duration-200"
                                onClick={handleNextRound}
                            >
                                <div className="relative w-full max-w-lg aspect-square">
                                    <CanvasImage image={currentCanvasImage} objectFit="contain" />
                                </div>
                                <div className={`mt-8 px-8 py-4 rounded-full type-emphasized type-headline-m motion-safe:animate-bounce ${feedbackResult.isCorrect ? "bg-primary text-on-primary" : "bg-error text-on-error"}`}>
                                    {feedbackResult.isCorrect ? t("page.guessJacket.single.feedbackCorrect") : t("page.guessJacket.single.feedbackWrong")}
                                </div>
                                <div className="mt-4 text-center text-inverse-on-surface max-w-2xl px-4">
                                    <div className="type-headline-s font-bold mb-1">{getDisplayTitle(feedbackResult.music).jp}</div>
                                    <div className="type-body-l text-inverse-on-surface mb-1">{getLocalizedMusicTitle(getDisplayTitle(feedbackResult.music))}</div>
                                    {!feedbackResult.isCorrect && (
                                        <div className="text-inverse-on-surface type-body-m">
                                            {t("page.guessJacket.common.answer", { name: formatGuessedTitle(feedbackResult.userGuess) })}
                                        </div>
                                    )}
                                </div>
                                <div className="mt-8 text-inverse-on-surface type-body-m motion-safe:animate-pulse">{t("page.guessJacket.single.clickContinue", { seconds: FEEDBACK_DURATION / 1000 })}</div>
                            </div>,
                            document.body
                        )}

                        <div className="bg-surface-container rounded-md3-lg p-3 sm:p-4 shadow-elev-1 mb-3 sm:mb-6 shrink-0">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="type-title-l font-bold text-on-surface">Round {currentRound + 1} / {ROUNDS_PER_GAME}</div>
                                    <div className="type-label-m text-on-surface-variant font-mono mt-1">Seed: {settings.seed}</div>
                                </div>
                                <div className="text-right">
                                    <div className="type-headline-s type-emphasized text-on-surface">{currentTotalScore} <span className="type-body-m text-on-surface-variant font-normal">pts</span></div>
                                    {isRoundActive && <div className="type-body-m font-bold text-primary motion-safe:animate-pulse">+{potentialScore}</div>}
                                </div>
                            </div>

                            <div className="flex justify-between items-center mb-2 px-1">
                                <div className="flex items-center gap-1 h-6">
                                    {comboMultiplier > 1 && (
                                        <div className="flex items-center gap-1 bg-tertiary-container text-on-tertiary-container px-2 py-0.5 rounded-full type-label-m font-bold shadow-elev-1 motion-safe:animate-pulse">
                                            <span>COMBO x{comboMultiplier.toFixed(1)}</span>
                                            <span className="type-label-s opacity-80">(Streak: {combo})</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    {[...Array(MAX_STRIKES_PER_ROUND)].map((_, index) => (
                                        <div
                                            key={index}
                                            className={`w-3 h-3 rounded-full transition-colors ${index < (MAX_STRIKES_PER_ROUND - strikes) ? "bg-error" : "bg-surface-container-highest"}`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-center type-label-l text-on-surface tabular-nums">{formatTime(timeLeft)}</div>
                                <LinearProgress value={timeLeft / settings.timeLimit} aria-label={t("page.guessJacket.common.timeLimit")} />
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 flex flex-col lg:flex-row items-center lg:items-start justify-start lg:justify-center gap-2 sm:gap-6 pb-3 sm:pb-8 overflow-hidden">
                            <div className="flex flex-col items-center gap-2 sm:gap-4 shrink-0">
                                <div className="relative rounded-md3-lg overflow-hidden shadow-elev-3 ring-4 ring-outline-variant bg-surface-container-high shrink-0 w-[min(36vw,132px)] h-[min(36vw,132px)] sm:w-[320px] sm:h-[320px]">
                                    <canvas ref={canvasRef} width={320} height={320} className="w-full h-full" />
                                    {isRoundActive && currentDistortions.length > 0 && (
                                        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end pointer-events-none">
                                            {currentDistortions.map((d, i) => (
                                                <span key={i} className="px-2 py-1 bg-error text-on-error type-label-m font-bold rounded-md3-xs shadow-elev-1 opacity-90">
                                                    {getDistortionLabel(d)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {!isRoundActive && !showFeedback && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-scrim/60 text-inverse-on-surface font-bold ">
                                            <LoadingIndicator contained aria-label={t("page.guessJacket.single.loadingImage")} />
                                        </div>
                                    )}
                                </div>

                                <div className="type-label-s sm:type-label-m text-on-surface-variant text-center px-4">
                                    {t("page.guessJacket.single.chooseHint", { count: settings.optionsCount })}
                                </div>

                                {roundNotice && (
                                    <div className="px-4 py-2 rounded-full bg-error text-on-error type-body-m font-bold motion-safe:animate-pulse shadow-elev-2">
                                        {roundNotice}
                                    </div>
                                )}
                            </div>

                            <div className="w-full lg:flex-1 max-w-4xl p-2.5 sm:p-4 bg-surface-container rounded-md3-xl shadow-elev-1 min-h-0 flex-[1.25] lg:flex-1 overflow-hidden lg:h-full">
                                <div className="h-full overflow-y-auto pr-1 touch-pan-y overscroll-contain">
                                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                        {currentQuestion.options.map((option, index) => {
                                            const isDisabled = !isRoundActive || disabledOptionIds.includes(option.id);
                                            return (
                                                <button
                                                    key={`${currentRound}-${option.id}`}
                                                    onClick={() => handleGuess(option.id)}
                                                    disabled={isDisabled}
                                                    className={`state-layer focus-ring text-left px-2.5 sm:px-4 py-2.5 sm:py-3 rounded-md3-md border transition-all ${isDisabled
                                                        ? "bg-surface-container-high text-on-surface-variant border-outline-variant cursor-not-allowed"
                                                        : "bg-surface-container-lowest hover:border-primary hover:bg-primary-container text-on-surface border-outline-variant "
                                                        }`}
                                                >
                                                    <span className="type-label-s sm:type-label-m font-mono text-on-surface-variant mr-1.5 sm:mr-2">{String(index + 1).padStart(2, "0")}</span>
                                                    <span className="font-bold type-label-m sm:type-body-l block truncate">{getDisplayTitle(option).jp}</span>
                                                    <span className="type-label-s sm:type-label-m text-on-surface-variant mt-0.5 sm:mt-1 block truncate">{getLocalizedMusicTitle(getDisplayTitle(option))}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="min-h-screen pt-8 pb-20">
                <div className="container mx-auto px-4 max-w-2xl">
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center gap-2 px-4 py-2 border border-outline-variant bg-primary-container rounded-full mb-4 shadow-elev-1">
                            <span className="text-primary type-label-m type-emphasized">Creativity Game</span>
                        </div>
                        <h1 className="type-headline-l type-emphasized text-on-surface mb-2 ">{t("page.guessJacket.title")} <span className="text-primary">?</span></h1>
                        <p className="text-on-surface-variant font-medium">{t("page.guessJacket.description")}</p>
                        <a
                            href="/guess-jacket/multiplayer/"
                            className="state-layer focus-ring inline-flex items-center gap-2 mt-4 px-6 py-2.5 bg-primary text-on-primary text-on-primary rounded-full font-bold type-body-m shadow-elev-2 hover:shadow-elev-3 transition-all "
                        >
                            <span>{t("page.guessJacket.single.multiplayerMode")}</span>
                            <Icon path={mdArrowForward} size={20} />
                        </a>
                    </div>

                    <div className="bg-surface-container-low text-on-surface p-4 sm:p-8 rounded-md3-xl space-y-6 sm:space-y-8">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                                <label className="block type-body-m font-bold text-on-surface mb-2">{t("page.guessJacket.common.seed")}</label>
                                <div className="flex gap-2">
                                    <TextField
                                        type="text"
                                        value={settings.seed}
                                        onChange={(event) => setSettings((prev) => ({ ...prev, seed: event.target.value }))}
                                        label={t("page.guessJacket.common.seed")} containerClassName="min-w-0 flex-1" className="font-mono"
                                    />
                                    <IconButton
                                        onClick={() => setSettings((prev) => ({ ...prev, seed: Math.random().toString(36).substring(7) }))}
                                        variant="tonal"
                                        icon={mdRefresh}
                                        label={t("page.guessJacket.single.regenerateSeed")}
                                    />
                                </div>
                            </div>
                            <div className="flex items-end w-full sm:w-auto">
                                <Button onClick={copyShareLink} variant="tonal" size="m" className="max-w-full">
                                    <Icon path={mdShare} size={20} />
                                    {t("page.guessJacket.single.share")}
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="block type-body-m font-bold text-on-surface mb-3">{t("page.guessJacket.single.serverScope")}</label>
                                <div className="flex gap-2 p-1 bg-surface-container-high rounded-md3-sm">
                                    {(["jp", "cn"] as ServerScope[]).map(s => (
                                        <Button key={s} onClick={() => setSettings({ ...settings, server: s })} variant="tonal" selected={settings.server === s} className="min-w-0 px-2 flex-1">
                                            <ServerRegionLabel server={s} label={getServerShortLabel(s)} />
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block type-body-m font-bold text-on-surface mb-3">{t("page.guessJacket.single.roundTime")}</label>
                                <TextField
                                    type="number"
                                    value={settings.timeLimit}
                                    onChange={(event) => {
                                        const nextValue = Number(event.target.value);
                                        const safeValue = Number.isFinite(nextValue) ? Math.max(5, Math.min(120, nextValue)) : 30;
                                        setSettings((prev) => ({ ...prev, timeLimit: safeValue }));
                                    }}
                                    label={t("page.guessJacket.single.roundTime")} containerClassName="w-full" className="font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block type-body-m font-bold text-on-surface mb-3">{t("page.guessJacket.single.difficultySetting")}</label>
                            <div className="grid grid-cols-4 gap-2">
                                {(["easy", "normal", "hard", "extreme"] as Difficulty[]).map((difficulty) => (
                                    <Button
                                        key={difficulty}
                                        onClick={() => setSettings((prev) => ({ ...prev, difficulty }))}
                                        variant="tonal" selected={settings.difficulty === difficulty} className="min-w-0 px-2 "
                                    >
                                        {getDifficultyLabel(difficulty)}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block type-body-m font-bold text-on-surface mb-3">{t("page.guessJacket.single.optionsCount")}</label>
                            <div className="grid grid-cols-4 gap-2">
                                {OPTIONS_CHOICES.map((count) => (
                                    <Button
                                        key={count}
                                        onClick={() => setSettings((prev) => ({ ...prev, optionsCount: count }))}
                                        variant="tonal" selected={settings.optionsCount === count} className="min-w-0 px-2 "
                                    >
                                        {t("page.guessJacket.common.optionCountLabel", { count })}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-md3-lg bg-surface-container-high p-4 type-body-m text-on-surface-variant space-y-1">
                            <div>• {t("page.guessJacket.single.rules.roundCount", { rounds: ROUNDS_PER_GAME, options: settings.optionsCount })}</div>
                            <div>• {t("page.guessJacket.single.rules.strikes", { strikes: MAX_STRIKES_PER_ROUND })}</div>
                            <div>• {t("page.guessJacket.single.rules.combo")}</div>
                            <div>• {t("page.guessJacket.single.rules.seed")}</div>
                        </div>
                    </div>

                    {loadError && (
                        <ErrorState className="mt-4" title={loadError} retryLabel={t("page.guessJacket.common.reload")} onRetry={loadMusics} />
                    )}

                    <Button
                        onClick={startGame}
                        disabled={isLoading || !!loadError}
                        variant="filled" size="m" className="mt-6 w-full"
                    >
                        {isLoading ? t("page.guessJacket.common.loading") : t("page.guessJacket.single.startChallenge")}
                    </Button>

                    <Link
                        href="/guess-who"
                        className="state-layer focus-ring mt-3 block text-center type-body-m text-on-surface-variant hover:text-primary transition-colors"
                    >
                        {t("page.guessJacket.single.goGuessWho")}
                    </Link>
                </div>
            </div>
        </MainLayout>
    );
}

export default function GuessJacketClient() {
    return (
        <Suspense fallback={<LoadingState />}>
            <GuessJacketContent />
        </Suspense>
    );
}
