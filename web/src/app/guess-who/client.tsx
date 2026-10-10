"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { useRouter, useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { Button, Icon, IconButton, SegmentedButton, TextField, LinearProgress, LoadingIndicator, LoadingState, ErrorState } from "@/components/md3";
import { FilterButton } from "@/components/common/BaseFilters";
import { fetchMasterData } from "@/lib/fetch";
import { ICardInfo, UNIT_DATA, CHAR_COLORS, UNIT_ICON_FILES, UNIT_ID_LABEL_KEYS } from "@/types/types";
import { getCardFullUrl, getCharacterIconUrl } from "@/lib/assets";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { mdShare, mdRefresh, mdArrowForward } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";

// Game Constants
const ROUNDS_PER_GAME = 10;
const BASE_SCORE_PER_ROUND = 1000;
const FEEDBACK_DURATION = 3000; // Reduced to 3s for snappier feel
const MAX_STRIKES_PER_ROUND = 3;

// Rarity Definitions
const RARITY_OPTIONS = [
    { id: "rarity_1", num: 1 },
    { id: "rarity_2", num: 2 },
    { id: "rarity_3", num: 3 },
    { id: "rarity_4", num: 4 },
    { id: "rarity_birthday", num: 5 },
];

const DEFAULT_RARITIES = ["rarity_3", "rarity_4"];

// Types
type GameState = "setup" | "playing" | "result";
type ServerScope = "jp" | "cn";
type Difficulty = "easy" | "normal" | "hard" | "extreme";

// Distortion Effects
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

interface GameSettings {
    server: ServerScope;
    timeLimit: number;
    seed: string;
    difficulty: Difficulty;
    selectedUnitIds: string[];
    selectedRarities: string[];
}

interface RoundResult {
    round: number;
    card: ICardInfo;
    userGuess: number | null;
    isCorrect: boolean;
    score: number;
    timeTaken: number;
    isTrained: boolean;
    distortions?: ActiveDistortion[]; // For extreme mode
    multiplier: number;
}

// Seeded Random
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

    // Helper to pick random item from array
    pick<T>(array: T[]): T {
        return array[Math.floor(this.next() * array.length)];
    }

    // Helper to pick N distinct items
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

// Canvas Image Helper
const CanvasImage = ({ image, objectFit = "contain" }: { image: HTMLImageElement | null, objectFit?: "contain" | "cover" }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const cvs = canvasRef.current;
        if (!cvs || !image) return;
        const ctx = cvs.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        cvs.width = image.width;
        cvs.height = image.height;
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        ctx.drawImage(image, 0, 0);
    }, [image]);

    if (!image) return null;

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full block"
            style={{ objectFit }}
        />
    );
};

function GuessWhoContent() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t } = useI18n();

    // Game State
    const [gameState, setGameState] = useState<GameState>("setup");
    const [cards, setCards] = useState<ICardInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>("");

    // Settings
    const [settings, setSettings] = useState<GameSettings>({
        server: "jp",
        timeLimit: 60,
        seed: Math.random().toString(36).substring(7),
        difficulty: "normal",
        selectedUnitIds: [],
        selectedRarities: DEFAULT_RARITIES,
    });

    // Gameplay State
    const [gameDeck, setGameDeck] = useState<ICardInfo[]>([]);
    const [currentRound, setCurrentRound] = useState(0);
    const [currentResults, setCurrentResults] = useState<RoundResult[]>([]);
    const [timeLeft, setTimeLeft] = useState(0);
    const [isRoundActive, setIsRoundActive] = useState(false);
    const [_, setRedraw] = useState(0);

    const activeImagesRef = useRef<Record<number, HTMLImageElement>>({});

    const [cropRect, setCropRect] = useState<{ x: number, y: number, size: number } | null>(null);
    const [currentIsTrained, setCurrentIsTrained] = useState(false);
    const [currentDistortions, setCurrentDistortions] = useState<ActiveDistortion[]>([]);

    // New Logic State
    const [strikes, setStrikes] = useState(0);
    const [combo, setCombo] = useState(0);

    // Feedback State
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackResult, setFeedbackResult] = useState<RoundResult | null>(null);

    // Refs
    const randomRef = useRef<SeededRandom | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
    const initializedRef = useRef(false);

    // Initialize
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const seedParam = searchParams.get("seed");
        const difficultyParam = searchParams.get("difficulty");
        const timeParam = searchParams.get("time");
        const serverParam = searchParams.get("server");
        const unitsParam = searchParams.get("units");
        const raritiesParam = searchParams.get("rarities");

        setSettings(prev => ({
            ...prev,
            seed: seedParam || Math.random().toString(36).substring(7),
            difficulty: (difficultyParam as Difficulty) || "normal",
            timeLimit: Math.min(120, timeParam ? Number(timeParam) : 60),
            server: (serverParam as ServerScope) || "jp",
            selectedUnitIds: unitsParam ? unitsParam.split(",") : [],
            selectedRarities: raritiesParam ? raritiesParam.split(",") : DEFAULT_RARITIES,
        }));
    }, [searchParams]);

    // Load Data
    const loadCards = useCallback(async () => {
        setIsLoading(true);
        setLoadError("");
        try {
            const data = await fetchMasterData<ICardInfo[]>("cards.json");
            const validCards = data.filter(c => c.characterId > 0 && c.characterId <= 26);
            setCards(validCards);
        } catch (e) {
            console.error("Failed to load cards", e);
            setLoadError(t("page.guessWho.common.errors.cardLoadFailed"));
        } finally {
            setIsLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadCards();
    }, [loadCards]);

    // Share URL
    const getShareUrl = () => {
        if (typeof window === "undefined") return "";
        const params = new URLSearchParams();
        params.set("seed", settings.seed);
        params.set("difficulty", settings.difficulty);
        params.set("time", settings.timeLimit.toString());
        params.set("server", settings.server);
        if (settings.selectedUnitIds.length > 0) {
            params.set("units", settings.selectedUnitIds.join(","));
        }
        if (settings.selectedRarities.length > 0 && settings.selectedRarities.length !== RARITY_OPTIONS.length) {
            params.set("rarities", settings.selectedRarities.join(","));
        }
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    };

    const copyShareLink = () => {
        const url = getShareUrl();
        navigator.clipboard.writeText(url).then(() => {
            alert(t("page.guessWho.single.shareCopied"));
        });
    };

    // Filter Handlers
    const handleUnitToggle = (unitId: string) => {
        setSettings(prev => {
            const newUnits = prev.selectedUnitIds.includes(unitId)
                ? prev.selectedUnitIds.filter(id => id !== unitId)
                : [...prev.selectedUnitIds, unitId];
            return { ...prev, selectedUnitIds: newUnits };
        });
    };

    const handleRarityToggle = (rarityId: string) => {
        setSettings(prev => {
            const newRarities = prev.selectedRarities.includes(rarityId)
                ? prev.selectedRarities.filter(id => id !== rarityId)
                : [...prev.selectedRarities, rarityId];
            return { ...prev, selectedRarities: newRarities };
        });
    };

    // Available Characters
    const availableCharacters = useMemo(() => {
        if (settings.selectedUnitIds.length === 0) return UNIT_DATA.flatMap((unit) => unit.charIds);
        const chars: number[] = [];
        UNIT_DATA.forEach(unit => {
            if (settings.selectedUnitIds.includes(unit.id)) {
                chars.push(...unit.charIds);
            }
        });
        return Array.from(new Set(chars));
    }, [settings.selectedUnitIds]);

    // Start Game logic
    const startGame = () => {
        if (isLoading) return;

        randomRef.current = new SeededRandom(settings.seed);

        const deck = cards.filter(card => {
            if (settings.server === "cn") { /* placeholder */ }
            if (settings.selectedUnitIds.length > 0 && !availableCharacters.includes(card.characterId)) return false;
            if (settings.selectedRarities.length > 0) {
                if (!settings.selectedRarities.includes(card.cardRarityType)) return false;
            } else { return false; }
            if (!card.assetbundleName) return false;
            return true;
        });

        if (deck.length < ROUNDS_PER_GAME) {
            alert(t("page.guessWho.common.errors.deckInsufficient", { count: deck.length }));
            return;
        }

        const shuffled = [...deck].sort(() => randomRef.current!.next() - 0.5);
        setGameDeck(shuffled.slice(0, ROUNDS_PER_GAME));

        setCurrentRound(0);
        setCurrentResults([]);
        setCombo(0);
        activeImagesRef.current = {};

        setGameState("playing");
        startRound(shuffled[0], 0);
    };

    const startRound = (card: ICardInfo, roundIndex: number) => {
        setIsRoundActive(false);
        setShowFeedback(false);
        setFeedbackResult(null);
        setTimeLeft(settings.timeLimit);
        setCropRect(null);
        setStrikes(0);
        setCurrentDistortions([]);
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);

        const img = new window.Image();
        img.crossOrigin = "anonymous";
        const isTrained = card.cardRarityType !== "rarity_1" && card.cardRarityType !== "rarity_2" && randomRef.current!.next() > 0.5;

        setCurrentIsTrained(isTrained);

        img.src = getCardFullUrl(card.characterId, card.assetbundleName, isTrained);

        img.onload = () => {
            activeImagesRef.current[roundIndex] = img;
            setRedraw(prev => prev + 1);

            let cropSize = 250;
            if (settings.difficulty === "easy") cropSize = 400;
            if (settings.difficulty === "hard") cropSize = 150;
            if (settings.difficulty === "extreme") cropSize = 150;

            const maxX = img.width - cropSize;
            const maxY = img.height - cropSize;
            const validMaxX = Math.max(0, maxX);
            const validMaxY = Math.max(0, maxY);

            const x = Math.floor(randomRef.current!.next() * validMaxX);
            const y = Math.floor(randomRef.current!.next() * validMaxY);

            // Extreme Mode: Distortions
            if (settings.difficulty === "extreme") {
                const numDistortions = Math.floor(randomRef.current!.next() * 3) + 1; // 1 to 3
                const effects = randomRef.current!.pickMultiple(DISTORTION_POOL, numDistortions);
                const activeEffects = effects.filter(e => e.type !== "none");
                setCurrentDistortions(activeEffects);
            } else {
                setCurrentDistortions([]);
            }

            setCropRect({ x, y, size: cropSize });
            setIsRoundActive(true);
        };

        img.onerror = () => {
            console.error("Failed to load image", card.id);
            handleGuess(null);
        };
    };

    // Draw Canvas (Drawing Logic Updated for Distortions)
    useEffect(() => {
        const currentImg = activeImagesRef.current[currentRound];
        if (!canvasRef.current || !currentImg || !cropRect) return;
        const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        const cvs = canvasRef.current;
        cvs.width = 300; // Fixed display size
        cvs.height = 300;

        ctx.clearRect(0, 0, cvs.width, cvs.height);

        ctx.save();

        // Apply filters
        let filterString = "";

        // Active effects
        const hasFlipH = currentDistortions.some(d => d.type === "flip-h");
        const hasFlipV = currentDistortions.some(d => d.type === "flip-v");
        const hasGrayscale = currentDistortions.some(d => d.type === "grayscale");
        const hasInvert = currentDistortions.some(d => d.type === "invert");
        const hasHueRotate = currentDistortions.some(d => d.type === "hue-rotate");
        const hasRgbShuffle = currentDistortions.some(d => d.type === "rgb-shuffle");

        if (hasGrayscale) filterString += "grayscale(100%) ";
        if (hasInvert) filterString += "invert(100%) ";
        if (hasHueRotate) filterString += "hue-rotate(180deg) ";

        if (filterString) ctx.filter = filterString.trim();

        // Apply transforms (translate to center to rotate/flip)
        if (hasFlipH || hasFlipV) {
            ctx.translate(cvs.width / 2, cvs.height / 2);
            ctx.scale(hasFlipH ? -1 : 1, hasFlipV ? -1 : 1);
            ctx.translate(-cvs.width / 2, -cvs.height / 2);
        }

        ctx.drawImage(
            currentImg,
            cropRect.x, cropRect.y, cropRect.size, cropRect.size,
            0, 0, cvs.width, cvs.height
        );

        ctx.restore();

        // Apply Pixel Manipulations (RGB Shuffle) after standard filters
        if (hasRgbShuffle) {
            const imageData = ctx.getImageData(0, 0, cvs.width, cvs.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                // Cycle
                data[i] = g;     // R gets G
                data[i + 1] = b; // G gets B
                data[i + 2] = r; // B gets R
            }
            ctx.putImageData(imageData, 0, 0);
        }

    }, [currentRound, cropRect, currentDistortions, _]);

    // Timer
    useEffect(() => {
        if (!isRoundActive) return;
        if (timeLeft <= 0) {
            handleGuess(null);
            return;
        }
        const interval = setInterval(() => {
            setTimeLeft(prev => Math.max(0, prev - 0.1));
        }, 100);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRoundActive, timeLeft]);

    const getCurrentPotentialScore = () => {
        if (!isRoundActive) return 0;
        const timeFactor = Math.max(0.1, timeLeft / settings.timeLimit);
        let diffMult = 1.0;
        if (settings.difficulty === "easy") diffMult = 0.8;
        if (settings.difficulty === "hard") diffMult = 1.5;
        if (settings.difficulty === "extreme") diffMult = 2.5;

        let comboMult = 1.0;
        if (combo > 0) comboMult = 1.0 + (combo * 0.5); // Preview next combo

        return Math.floor(BASE_SCORE_PER_ROUND * timeFactor * diffMult * comboMult);
    };

    const handleGuess = (charId: number | null) => {
        const isCorrect = charId === gameDeck[currentRound].characterId;

        // Wrong Guess Logic (Retry)
        if (!isCorrect && charId !== null) {
            // Check if max strikes reached
            if (strikes < MAX_STRIKES_PER_ROUND - 1) {
                setStrikes(prev => prev + 1);
                setTimeLeft(prev => prev * 0.5); // 50% penalty
                setCombo(0); // Break combo
                // Transient feedback
                const feedbackEl = document.createElement("div");
                feedbackEl.textContent = t("page.guessWho.single.wrongTimePenalty");
                feedbackEl.className = "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-error text-on-error font-bold px-6 py-3 rounded-full motion-safe:animate-bounce z-[100] shadow-elev-2 type-title-l";
                document.body.appendChild(feedbackEl);
                setTimeout(() => feedbackEl.remove(), 1000);
                return; // Do NOT end round
            }
            // If strikes reached max, proceed to fail round below
        }

        setIsRoundActive(false);
        const timeTaken = settings.timeLimit - timeLeft;

        let roundScore = 0;
        let finalMultiplier = 1.0;

        if (isCorrect) {
            const timeFactor = Math.max(0.1, timeLeft / settings.timeLimit);
            let diffMult = 1.0;
            if (settings.difficulty === "easy") diffMult = 0.8;
            if (settings.difficulty === "hard") diffMult = 1.5;
            if (settings.difficulty === "extreme") diffMult = 2.5;

            // Combo Logic
            let newCombo = combo;
            if (strikes === 0) {
                newCombo = combo + 1;
            } else {
                newCombo = 0;
            }
            setCombo(newCombo);

            // Calculate Multiplier: 1 + (streak-1)*0.5. e.g. 1->1x, 2->1.5x, 3->2.0x
            // Wait, usually combo starts at 0.
            // If newCombo is 1 (first correct), mult is 1.0
            // If newCombo is 2 (2nd correct), mult is 1.5
            // If newCombo is 3 (3rd correct), mult is 2.0
            // Formula: 1.0 + Math.max(0, newCombo - 1) * 0.5

            const comboBonus = Math.max(0, newCombo - 1) * 0.5;
            finalMultiplier = 1.0 + comboBonus;

            roundScore = Math.floor(BASE_SCORE_PER_ROUND * timeFactor * diffMult * finalMultiplier);
        } else {
            setCombo(0);
        }

        const result: RoundResult = {
            round: currentRound,
            card: gameDeck[currentRound],
            userGuess: charId,
            isCorrect,
            score: roundScore,
            timeTaken,
            isTrained: currentIsTrained,
            distortions: currentDistortions,
            multiplier: finalMultiplier,
        };

        const newResults = [...currentResults, result];
        setCurrentResults(newResults);

        setFeedbackResult(result);
        setShowFeedback(true);

        feedbackTimerRef.current = setTimeout(() => {
            handleNextRound();
        }, FEEDBACK_DURATION);
    };

    const handleNextRound = () => {
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        if (currentRound < ROUNDS_PER_GAME - 1) {
            const nextRound = currentRound + 1;
            setCurrentRound(nextRound);
            startRound(gameDeck[nextRound], nextRound);
        } else {
            setGameState("result");
        }
    };

    const formatTime = (seconds: number) => Math.max(0, seconds).toFixed(1) + "s";

    if (isLoading) {
        return (
            <MainLayout>
                <div className="flex h-screen items-center justify-center">
                    <h1 className="sr-only">{t("page.guessWho.title")}</h1>
                    <LoadingState label={t("page.guessWho.common.loading")} />
                </div>
            </MainLayout>
        );
    }

    const currentTotalScore = currentResults.reduce((acc, r) => acc + r.score, 0);
    const currentCanvasImage = activeImagesRef.current[currentRound];

    // ==================== RESULT SCREEN ====================
    if (gameState === "result") {
        const shareUrl = getShareUrl();
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`;

        // Helper for displaying server
        const getServerLabel = (s: ServerScope) => t(`page.guessWho.common.serverLabels.${s}`);
        const getDifficultyLabel = (d: Difficulty) => t(`page.guessWho.common.difficultyLabels.${d}`);

        return (
            <MainLayout>
                <div className="min-h-screen">
                    <div className="container mx-auto px-4 py-8 pb-20">
                        <div className="max-w-4xl mx-auto rounded-md3-xl overflow-hidden bg-surface-container-low text-on-surface">
                            <div className="p-8 text-center border-b border-outline-variant">
                                {/* Header */}
                                <div className="inline-flex items-center gap-2 px-4 py-2 border border-outline-variant bg-primary-container rounded-full mb-4">
                                    <span className="text-on-primary-container type-label-m type-emphasized">GAME OVER</span>
                                </div>
                                <h1 className="type-headline-l type-emphasized text-on-surface mb-2">{t("page.guessWho.single.challengeComplete")}</h1>
                                <p className="type-title-l text-on-surface-variant mb-6">{t("page.guessWho.single.finalScore")}</p>
                                <div className="type-display-l type-emphasized text-primary mb-8 motion-safe:animate-bounce">{currentTotalScore}</div>

                                <div className="flex flex-col md:flex-row items-center justify-center gap-8 bg-surface-container-high rounded-md3-lg p-6 mb-8">
                                    <div className="text-left space-y-2 type-body-m text-on-surface-variant">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-on-surface w-16">{t("page.guessWho.common.seed")}</span>
                                            <code className="bg-surface-container-high px-2 py-1 rounded-md3-xs border border-outline-variant font-mono text-on-surface ">{settings.seed}</code>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-on-surface w-16">{t("page.guessWho.common.server")}</span>
                                            <span className="font-bold text-on-surface "><ServerRegionLabel server={settings.server} label={getServerLabel(settings.server)} /></span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-on-surface w-16">{t("page.guessWho.common.difficulty")}</span>
                                            <span className="capitalize font-bold text-primary">{getDifficultyLabel(settings.difficulty)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-on-surface w-16">{t("page.guessWho.common.timeLimit")}</span>
                                            <span className="text-on-surface ">{settings.timeLimit}{t("page.guessWho.common.secondsSuffix")}</span>
                                        </div>
                                        {settings.selectedUnitIds.length > 0 && (
                                            <div className="flex items-start gap-2">
                                                <span className="font-bold text-on-surface w-16 shrink-0">{t("page.guessWho.common.selectedUnits")}</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {settings.selectedUnitIds.map(uid => (
                                                        <Image key={uid} src={`/data/icon/${UNIT_ICON_FILES[uid]}`} width={20} height={20} alt={uid} className="w-5 h-5 object-contain" unoptimized />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {settings.difficulty === "extreme" && (
                                            <div className="type-label-m text-error font-bold mt-2 pt-2 border-t border-outline-variant">
                                                {t("page.guessWho.common.distortions.extremeSummary")}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-center gap-2">
                                        <div data-theme="light" data-seed="21" className="w-[120px] h-[120px] bg-surface-container-lowest p-2 rounded-md3-md shadow-elev-1 border border-outline-variant">
                                            <img src={qrCodeUrl} alt="Share QR Code" className="w-full h-full object-contain" />
                                        </div>
                                        <span className="type-label-m text-on-surface-variant type-emphasized">{t("page.guessWho.single.scanToChallenge")}</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap justify-center gap-4">
                                    <Button onClick={copyShareLink} variant="tonal" size="m" className="max-w-full">
                                        <Icon path={mdShare} size={20} />
                                        {t("page.guessWho.single.copyLink")}
                                    </Button>
                                    <Button onClick={() => { setSettings(prev => ({ ...prev, seed: Math.random().toString(36).substring(7) })); setGameState("setup"); }} variant="filled" size="m" className="">
                                        {t("page.guessWho.single.playAgainNewSeed")}
                                    </Button>
                                </div>
                            </div>

                            {/* Results Grid */}
                            <div className="p-8 bg-surface-container">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                                    {currentResults.map((res, idx) => (
                                        <Link href={`/cards/${res.card.id}`} key={idx} className={`state-layer focus-ring relative block p-4 rounded-md3-md border flex gap-4 overflow-hidden transition-transform  hover:shadow-elev-2 ${res.isCorrect ? "bg-primary-container  border-primary/30" : "bg-error-container  border-error/30"}`}>
                                            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                                                <CanvasImage image={activeImagesRef.current[res.round]} objectFit="cover" />
                                            </div>
                                            <div className="relative z-10 flex flex-col gap-2 w-full">
                                                <div className="flex gap-4 w-full">
                                                    <div className="w-16 h-16 relative shrink-0">
                                                        <div className="absolute inset-0 rounded-md3-sm overflow-hidden shadow-elev-1 ring-1 ring-outline-variant">
                                                            <Image src={getCharacterIconUrl(res.card.characterId)} alt="char" fill className="object-cover" />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="type-label-m text-on-surface-variant type-emphasized mb-0.5">Round {res.round + 1}</div>
                                                        <div className={`type-emphasized type-title-m leading-tight mb-1 ${res.isCorrect ? "text-on-primary-container" : "text-on-error-container"}`}>
                                                            {res.isCorrect ? t("page.guessWho.common.correct") : t("page.guessWho.common.wrong")}
                                                        </div>
                                                        {!res.isCorrect && <div className="type-label-m text-error font-bold bg-surface-container-lowest inline-block px-1 rounded-md3-xs block w-fit mb-1">{t("page.guessWho.common.selectedGuess", { name: res.userGuess ? getCharacterName(t, res.userGuess) : t("page.guessWho.common.timeout") })}</div>}
                                                        <div className="type-label-m text-on-surface-variant truncate flex items-center gap-1">
                                                            <span className="font-bold shrink-0">{getCharacterName(t, res.card.characterId)}</span>
                                                            <span className="w-1 h-1 rounded-full bg-outline shrink-0"></span>
                                                            <span className="opacity-80 truncate">{res.card.prefix}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0">
                                                        <div className="type-title-m font-bold text-on-surface">+{res.score}</div>
                                                        {res.multiplier > 1 && (
                                                            <div className="type-label-m font-bold text-primary bg-primary-container px-1.5 rounded-md3-xs">
                                                                x{res.multiplier.toFixed(1)} Combo
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {res.distortions && res.distortions.length > 0 && (
                                                    <div className="flex flex-wrap justify-end gap-1 px-1">
                                                        {res.distortions.map((d, i) => (
                                                            <span key={i} className="type-label-s px-1.5 py-0.5 bg-inverse-surface text-inverse-on-surface rounded-md3-xs font-bold shadow-elev-1 whitespace-nowrap">
                                                                {t(`page.guessWho.common.distortions.${DISTORTION_LABEL_KEYS[d.type]}`)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
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

    // Split for brevity / manual re-insertion of large render blocks
    return GuessWhoClientPlayingAndSetup({
        t,
        gameState, settings, setSettings,
        currentTotalScore, timeLeft, isRoundActive,
        currentRound, showFeedback, feedbackResult, currentCanvasImage,
        canvasRef, currentDistortions, handleGuess, handleNextRound,
        availableCharacters, getCharacterLabel: (characterId) => getCharacterName(t, characterId), startGame, handleRarityToggle, handleUnitToggle, copyShareLink, formatTime,
        potentialScore: getCurrentPotentialScore(),
        combo, strikes,
        loadError, loadCards, isLoading
    });
}

export default function GuessWhoClient() {
    return (
        <Suspense fallback={<LoadingState />}>
            <GuessWhoContent />
        </Suspense>
    );
}

// Helper to keep code clean since we are repeating the layout in "Playing" mode
interface GuessWhoPlayingAndSetupProps {
    t: ReturnType<typeof useI18n>["t"];
    gameState: GameState;
    settings: GameSettings;
    setSettings: React.Dispatch<React.SetStateAction<GameSettings>>;
    currentTotalScore: number;
    timeLeft: number;
    isRoundActive: boolean;
    currentRound: number;
    showFeedback: boolean;
    feedbackResult: RoundResult | null;
    currentCanvasImage?: HTMLImageElement;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    currentDistortions: ActiveDistortion[];
    handleGuess: (charId: number | null) => void;
    handleNextRound: () => void;
    availableCharacters: number[];
    getCharacterLabel: (characterId: number) => string;
    startGame: () => void;
    handleRarityToggle: (rarityId: string) => void;
    handleUnitToggle: (unitId: string) => void;
    copyShareLink: () => void;
    formatTime: (seconds: number) => string;
    potentialScore: number;
    combo: number;
    strikes: number;
    loadError: string;
    loadCards: () => Promise<void>;
    isLoading: boolean;
}

function GuessWhoClientPlayingAndSetup({
    t,
    gameState, settings, setSettings,
    currentTotalScore, timeLeft, isRoundActive,
    currentRound, showFeedback, feedbackResult, currentCanvasImage,
    canvasRef, currentDistortions, handleGuess, handleNextRound,
    availableCharacters, getCharacterLabel, startGame, handleRarityToggle, handleUnitToggle, copyShareLink, formatTime, potentialScore,

    combo, strikes,
    loadError, loadCards, isLoading
}: GuessWhoPlayingAndSetupProps) {
    const multiplier = combo > 0 ? 1.0 + (combo * 0.5) : 1.0;

    if (gameState === "playing") {
        return (
            <MainLayout>
                <div className="min-h-screen">
                    <div className="container mx-auto px-4 py-4 flex flex-col min-h-screen relative">
                        {/* Feedback Overlay */}
                        {showFeedback && feedbackResult && currentCanvasImage && typeof document !== "undefined" && createPortal(
                            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-inverse-surface text-inverse-on-surface cursor-pointer animate-in fade-in duration-200" onClick={handleNextRound}>
                                <div className="relative w-full max-w-lg aspect-[4/3] sm:aspect-auto sm:h-[70vh]">
                                    <CanvasImage image={currentCanvasImage} objectFit="contain" />
                                </div>
                                <div className={`mt-8 px-8 py-4 rounded-full type-emphasized type-headline-m motion-safe:animate-bounce ${feedbackResult.isCorrect ? "bg-primary text-on-primary" : "bg-error text-on-error"}`}>
                                    {feedbackResult.isCorrect ? t("page.guessWho.single.feedbackCorrect") : t("page.guessWho.single.feedbackWrong")}
                                </div>
                                <div className="mt-4 text-center text-inverse-on-surface">
                                    <div className="type-headline-s font-bold mb-1">{getCharacterLabel(feedbackResult.card.characterId)}</div>
                                    <div className="text-inverse-on-surface">{feedbackResult.card.prefix}</div>
                                </div>
                                <div className="mt-8 text-inverse-on-surface type-body-m motion-safe:animate-pulse">{t("page.guessWho.single.clickContinue", { seconds: FEEDBACK_DURATION / 1000 })}</div>
                            </div>,
                            document.body
                        )}

                        <div className="bg-surface-container rounded-md3-lg p-4 shadow-elev-1 mb-6">
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

                            {/* Combo & Lives Bar */}
                            <div className="flex justify-between items-center mb-2 px-1">
                                <div className="flex items-center gap-1 h-6">
                                    {multiplier > 1 && (
                                        <div className="flex items-center gap-1 bg-tertiary-container text-on-tertiary-container px-2 py-0.5 rounded-full type-label-m font-bold shadow-elev-1 motion-safe:animate-pulse">
                                            <span>COMBO x{multiplier.toFixed(1)}</span>
                                            <span className="type-label-s opacity-80">{t("page.guessWho.single.streakLabel", { combo })}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    {[...Array(MAX_STRIKES_PER_ROUND)].map((_, i) => (
                                        <div key={i} className={`w-3 h-3 rounded-full transition-colors ${i < (MAX_STRIKES_PER_ROUND - strikes) ? "bg-error" : "bg-surface-container-highest"}`} />
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-center type-label-l text-on-surface tabular-nums">{formatTime(timeLeft)}</div>
                                <LinearProgress value={timeLeft / settings.timeLimit} tickMs={100} aria-label={t("page.guessWho.common.timeLimit")} />
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col items-center justify-start gap-8">
                            <div className="relative">
                                <div className="relative rounded-md3-lg overflow-hidden shadow-elev-3 ring-4 ring-outline-variant bg-surface-container-high shrink-0" style={{ width: 300, height: 300 }}>
                                    <canvas ref={canvasRef} width={300} height={300} className="w-full h-full" />
                                    {isRoundActive && currentDistortions.length > 0 && (
                                        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end pointer-events-none">
                                            {currentDistortions.map((d: ActiveDistortion, i: number) => (
                                                <span key={i} className="px-2 py-1 bg-error text-on-error type-label-m font-bold rounded-md3-xs shadow-elev-1 opacity-90">
                                                    {t(`page.guessWho.common.distortions.${DISTORTION_LABEL_KEYS[d.type]}`)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {!isRoundActive && !showFeedback && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-scrim/60 text-inverse-on-surface font-bold ">
                                            <LoadingIndicator contained aria-label={t("page.guessWho.single.loadingImage")} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="w-full max-w-5xl flex flex-wrap justify-center gap-2 sm:gap-3 p-4 bg-surface-container rounded-md3-xl shadow-elev-1 transition-opacity">
                                {availableCharacters.map((id) => {
                                    const name = getCharacterLabel(id);
                                    const idStr = String(id);
                                    const color = CHAR_COLORS[idStr];
                                    return (
                                        <button key={id} onClick={() => isRoundActive && handleGuess(id)} disabled={!isRoundActive} className="state-layer focus-ring w-10 h-10 sm:w-16 sm:h-16 rounded-md3-md overflow-hidden relative group transition-transform disabled:opacity-50 ring-2 ring-transparent hover:ring-primary shadow-elev-1" title={name}>
                                            <Image src={getCharacterIconUrl(id)} alt={name} fill className="object-cover" unoptimized />
                                            <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity" style={{ backgroundColor: color }} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </MainLayout>
        );
    }

    // SETUP SCREEN
    return (
        <MainLayout>
            <div className="min-h-screen pt-8 pb-20">
                <div className="container mx-auto px-4 max-w-2xl">
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center gap-2 px-4 py-2 border border-outline-variant bg-primary-container rounded-full mb-4 shadow-elev-1">
                            <span className="text-on-primary-container type-label-m type-emphasized">{t("page.guessWho.badge")}</span>
                        </div>
                        <h1 className="type-headline-l type-emphasized text-on-surface mb-2 ">{t("page.guessWho.title")} <span className="text-primary">?</span></h1>
                        <p className="text-on-surface-variant font-medium">{t("page.guessWho.description")}</p>
                        <a
                            href="/guess-who/multiplayer/"
                            className="state-layer focus-ring inline-flex items-center gap-2 mt-4 px-6 py-2.5 bg-primary text-on-primary text-on-primary rounded-full font-bold type-body-m shadow-elev-2 hover:shadow-elev-3 transition-all "
                        >
                            <span>{t("page.guessWho.single.multiplayerMode")}</span>
                            <Icon path={mdArrowForward} size={20} />
                        </a>
                    </div>

                    {/* Every setting is a title-s label over its control: segmented buttons for single choices, filter chips for multiple. */}
                    <div className="bg-surface-container-low text-on-surface p-4 sm:p-8 rounded-md3-xl space-y-6">
                        <div>
                            <label htmlFor="guess-who-seed" className="mb-2 block type-title-s text-on-surface">{t("page.guessWho.single.seedSetting")}</label>
                            <div className="flex gap-2">
                                <TextField
                                    id="guess-who-seed"
                                    type="text"
                                    value={settings.seed}
                                    onChange={(e) => setSettings({ ...settings, seed: e.target.value })}
                                    containerClassName="min-w-0 flex-1" className="font-mono"
                                    trailing={
                                        <IconButton
                                            onClick={() => setSettings({ ...settings, seed: Math.random().toString(36).substring(7) })}
                                            icon={mdRefresh}
                                            size="xs"
                                            className="mr-1"
                                            label={t("page.guessWho.single.regenerateSeed")}
                                        />
                                    }
                                />
                                <Button onClick={copyShareLink} variant="tonal" icon={mdShare}>
                                    {t("page.guessWho.single.share")}
                                </Button>
                            </div>
                        </div>

                        <div>
                            <span className="mb-2 block type-title-s text-on-surface">{t("page.guessWho.single.difficultySetting")}</span>
                            <SegmentedButton
                                aria-label={t("page.guessWho.single.difficultySetting")}
                                value={settings.difficulty}
                                onValueChange={(difficulty) => setSettings({ ...settings, difficulty })}
                                options={(["easy", "normal", "hard", "extreme"] as Difficulty[]).map((d) => ({ value: d, label: t(`page.guessWho.common.difficultyLabels.${d}`) }))}
                            />
                        </div>

                        <div>
                            <span className="mb-2 block type-title-s text-on-surface">{t("page.guessWho.single.raritySetting")}</span>
                            <div className="flex flex-wrap gap-2">
                                {RARITY_OPTIONS.map(({ id, num }) => (
                                    <FilterButton key={id} selected={settings.selectedRarities.includes(id)} onClick={() => handleRarityToggle(id)} className="h-10 gap-0.5">
                                        {id === "rarity_birthday" ? (<span className="relative h-5 w-5"><Image src="/data/icon/birthday.webp" alt="Birthday" fill className="object-contain" unoptimized /></span>) : (Array.from({ length: num }).map((_, i) => (<span key={i} className="relative h-4 w-4"><Image src="/data/icon/star.webp" alt="Star" fill className="object-contain" unoptimized /></span>)))}
                                    </FilterButton>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <span className="mb-2 block type-title-s text-on-surface">{t("page.guessWho.single.serverScope")}</span>
                                <SegmentedButton
                                    aria-label={t("page.guessWho.single.serverScope")}
                                    value={settings.server}
                                    onValueChange={(server) => setSettings({ ...settings, server })}
                                    options={(["jp", "cn"] as ServerScope[]).map((s) => ({ value: s, label: <ServerRegionLabel server={s} label={t(`page.guessWho.common.serverLabels.${s}`)} /> }))}
                                />
                            </div>
                            <div>
                                <label htmlFor="guess-who-time" className="mb-2 block type-title-s text-on-surface">{t("page.guessWho.single.guessTime")}</label>
                                <TextField id="guess-who-time" type="number" value={settings.timeLimit} onChange={(e) => setSettings({ ...settings, timeLimit: Math.max(3, Math.min(120, Number(e.target.value))) })} containerClassName="w-full" className="font-mono" />
                            </div>
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <span className="type-title-s text-on-surface">{t("page.guessWho.single.characterFilter")}</span>
                                <Button onClick={() => setSettings({ ...settings, selectedUnitIds: [] })} variant="text" size="xs">{t("page.guessWho.single.resetFilter")}</Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {UNIT_DATA.map(unit => {
                                    const unitLabel = t(UNIT_ID_LABEL_KEYS[unit.id] ?? `common.units.${unit.id}`);
                                    const picked = settings.selectedUnitIds.includes(unit.id);
                                    // No unit picked means every unit plays, so none is greyed out.
                                    const muted = settings.selectedUnitIds.length > 0 && !picked;
                                    return (
                                        <button aria-pressed={picked} key={unit.id} onClick={() => handleUnitToggle(unit.id)} className={`state-layer focus-ring transition-[opacity,filter,background-color] p-1 rounded-full ${picked ? "bg-secondary-container ring-2 ring-primary" : muted ? "opacity-60 hover:opacity-100 grayscale hover:grayscale-0" : "bg-surface-container-high"}`}>
                                            <Image src={`/data/icon/${UNIT_ICON_FILES[unit.id]}`} alt={unitLabel} width={40} height={40} className="w-10 h-10 object-contain" unoptimized />
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-2 type-body-s text-on-surface-variant">{settings.selectedUnitIds.length > 0 ? t("page.guessWho.single.selectedCharacters", { count: availableCharacters.length }) : t("page.guessWho.single.selectedAllCharacters")}</div>
                        </div>
                    </div>

                    {loadError && (
                        <ErrorState className="mt-4" title={loadError} retryLabel={t("page.guessWho.common.reload")} onRetry={loadCards} />
                    )}

                    <Button onClick={startGame} disabled={isLoading || !!loadError} variant="filled" size="m" className="mt-6 w-full">
                        {isLoading ? t("page.guessWho.common.loading") : t("page.guessWho.single.startChallenge")}
                    </Button>

                    <Link href="/guess-jacket" className="state-layer focus-ring mt-3 block text-center type-body-m text-on-surface-variant hover:text-primary transition-colors">
                        {t("page.guessWho.single.goGuessJacket")}
                    </Link>
                </div>
            </div>
        </MainLayout >
    );
}
