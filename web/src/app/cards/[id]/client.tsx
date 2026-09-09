"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import MainLayout from "@/components/MainLayout";
import {
    ICardInfo,
    ISkillInfo,
    ATTR_COLORS,
    ATTR_NAMES,
    UNIT_DATA,
    UNIT_FIELD_TO_ID,
    UNIT_ICON_FILES,
    isTrainableCard,
    getCardDefaultTrainedStatus,
    getRarityNumber,
    CardAttribute,
    SUPPORT_UNIT_LABEL_KEYS,
    CARD_RARITY_MAX_LEVELS,
} from "@/types/types";
import { getCardFullUrl, getCardThumbnailUrl, getEventBannerUrl, getGachaLogoUrl, getCardGachaVoiceUrl, getCostumeThumbnailUrl, getCharacterIconUrl } from "@/lib/assets";
import { useRef } from "react";
import { formatSkillDescription } from "@/lib/skill";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { getCharacterName } from "@/lib/i18n";
import { fetchMasterData } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import ImagePreviewModal from "@/components/common/ImagePreviewModal";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import { ICostumeInfo, IMoeCostumeData, PART_TYPE_LABEL_KEYS } from "@/types/costume";

// Max levels by rarity
const MAX_LEVELS = CARD_RARITY_MAX_LEVELS;

interface CardSupplyInfo {
    id: number;
    cardSupplyType?: string;
}

interface CardParameterRow {
    id: number;
    cardParameterType: "param1" | "param2" | "param3";
    power: number;
}

interface RelatedGachaInfo {
    id: number;
    name: string;
    assetbundleName: string;
}

export default function CardDetailPage({ id }: { initialData?: unknown; id?: number }) {
    const { t, formatDate: formatLocaleDate } = useI18n();
    const params = useParams();
    const cardId = id ?? Number(params?.id);
    const { assetSource } = useTheme();
    const { t: translateGameData } = useTranslation();
    const { setDetailName } = useBreadcrumb();

    const [isScreenshotMode, setIsScreenshotMode] = useState(false);
    const [card, setCard] = useState<ICardInfo | null>(null);
    const [skillDescription, setSkillDescription] = useState<string | null>(null);
    const [supplyName, setSupplyName] = useState<string>(""); // Added state
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [isJpAdvance, setIsJpAdvance] = useState(false);

    // Handle screenshot mode from query string after mount
    useEffect(() => {
        if (typeof window !== "undefined") {
            const sp = new URLSearchParams(window.location.search);
            setIsScreenshotMode(sp.get("mode") === "screenshot");
        }
    }, []);

    // View states
    const [showTrained, setShowTrained] = useState(false);
    const [cardLevel, setCardLevel] = useState(1);
    const [skillLevel, setSkillLevel] = useState(1);
    const [skillData, setSkillData] = useState<ISkillInfo | null>(null);
    const [trainedSkillData, setTrainedSkillData] = useState<ISkillInfo | null>(null);
    const [trainedSkillDescription, setTrainedSkillDescription] = useState<string | null>(null);
    const [imageViewerOpen, setImageViewerOpen] = useState(false);
    const [relatedEvent, setRelatedEvent] = useState<{ id: number; name: string; assetbundleName: string } | null>(null);
    const [relatedGachas, setRelatedGachas] = useState<RelatedGachaInfo[]>([]);
    const [relatedCostumes, setRelatedCostumes] = useState<ICostumeInfo[]>([]);
    const [hasCardStory, setHasCardStory] = useState(false);


    // Set mounted state
    useEffect(() => {
        setMounted(true);
    }, []);

    // Set breadcrumb detail name
    useEffect(() => {
        if (card) setDetailName(card.prefix);
    }, [card, setDetailName]);

    // Fetch card data
    useEffect(() => {
        async function fetchCard() {
            try {
                setIsLoading(true);
                const [cardsData, skillsData, suppliesData, cardEpisodesData] = await Promise.all([
                    fetchMasterData<ICardInfo[]>("cards.json"),
                    fetchMasterData<ISkillInfo[]>("skills.json"),
                    fetchMasterData<CardSupplyInfo[]>("cardSupplies.json").catch(() => []),
                    fetchMasterData<{ cardId: number }[]>("cardEpisodes.json").catch(() => []),
                ]);

                let foundCard = cardsData.find(c => c.id === cardId);
                let resolvedSkills = skillsData;
                let resolvedSupplies = suppliesData;
                let resolvedEpisodes = cardEpisodesData;

                if (!foundCard) {
                    try {
                        const [jpCards, jpSkills, jpSupplies, jpEpisodes] = await Promise.all([
                            fetchMasterData<ICardInfo[]>("cards.json", false, "jp"),
                            fetchMasterData<ISkillInfo[]>("skills.json", false, "jp"),
                            fetchMasterData<CardSupplyInfo[]>("cardSupplies.json", false, "jp").catch(() => []),
                            fetchMasterData<{ cardId: number }[]>("cardEpisodes.json", false, "jp").catch(() => []),
                        ]);
                        foundCard = jpCards.find(c => c.id === cardId);
                        if (foundCard) {
                            resolvedSkills = jpSkills;
                            resolvedSupplies = jpSupplies;
                            resolvedEpisodes = jpEpisodes;
                            setIsJpAdvance(true);
                        }
                    } catch (jpErr) {
                        console.warn("JP fallback fetch failed:", jpErr);
                    }
                }

                if (!foundCard) {
                    throw new Error(`Card ${cardId} not found`);
                }

                // Check if card has story episodes
                setHasCardStory(resolvedEpisodes.some(e => e.cardId === cardId));

                // Handle Supply Type
                const supply = resolvedSupplies.find((s) => s.id === foundCard.cardSupplyId);
                if (supply && supply.cardSupplyType) {
                    const localizedSupply = t("common.cardSupplyTypes." + supply.cardSupplyType);
                    setSupplyName(localizedSupply !== "common.cardSupplyTypes." + supply.cardSupplyType ? localizedSupply : supply.cardSupplyType);
                } else {
                    setSupplyName(t("common.cardSupplyTypes.normal")); // Default
                }

                // ... (rest of logic)
                // Normal skill
                const skill = resolvedSkills.find((s) => s.id === foundCard.skillId);
                if (skill) {
                    setSkillData(skill);
                    // Default to max level available in skill effects details
                    const maxLvl = skill.skillEffects[0]?.skillEffectDetails.length || 1;
                    setSkillLevel(maxLvl);
                }
                // Trained skill (after blooming)
                if (foundCard.specialTrainingSkillId) {
                    const trainedSkill = resolvedSkills.find((s) => s.id === foundCard.specialTrainingSkillId);
                    if (trainedSkill) {
                        setTrainedSkillData(trainedSkill);
                    }
                }


                // The API returns an array of objects but the UI expects an object of arrays
                const cardWithRawParams = foundCard as ICardInfo & {
                    cardParameters: ICardInfo["cardParameters"] | CardParameterRow[];
                };
                if (Array.isArray(cardWithRawParams.cardParameters)) {
                    const rawParams = cardWithRawParams.cardParameters;
                    // Group by type and sort by ID (assuming ID order corresponds to level)
                    const transformParams = (type: CardParameterRow["cardParameterType"]) => {
                        return rawParams
                            .filter(p => p.cardParameterType === type)
                            .sort((a, b) => a.id - b.id)
                            .map(p => p.power);
                    };

                    cardWithRawParams.cardParameters = {
                        param1: transformParams("param1"),
                        param2: transformParams("param2"),
                        param3: transformParams("param3"),
                    };
                }
                setCard(cardWithRawParams);
                // document.title = `Moesekai - ${foundCard.prefix}`; // Moved to metadata

                // Set initial level to max
                const maxLevelInfo = MAX_LEVELS[foundCard.cardRarityType];
                const initialLevel = maxLevelInfo.trained || maxLevelInfo.normal;
                setCardLevel(initialLevel);
                setError(null);
            } catch (err) {
                console.error("Error fetching card:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        if (cardId) {
            fetchCard();
        }
    }, [cardId, t]);

    // Computed values
    const trainable = card ? isTrainableCard(card) : false;
    const isBirthday = card?.cardRarityType === "rarity_birthday";
    const rarityNum = card ? getRarityNumber(card.cardRarityType) : 1;
    const characterName = card ? getCharacterName(t, card.characterId) : "";

    // Card's default art is after_training (e.g. cards 1167 / 1458-1463 have no normal art)
    const cardDefaultTrained = card ? getCardDefaultTrainedStatus(card) : false;

    // Find unit for character
    const characterUnit = useMemo(() => {
        if (!card) return null;
        return UNIT_DATA.find(u => u.charIds.includes(card.characterId));
    }, [card]);

    // Current main image URL - always use trained for trained-only cards
    const effectiveShowTrained = cardDefaultTrained || (showTrained && trainable && !isBirthday);
    const mainImageUrl = card ? getCardFullUrl(card.characterId, card.assetbundleName, effectiveShowTrained, assetSource) : "";

    // Get max level info
    const maxLevelInfo = card ? MAX_LEVELS[card.cardRarityType] : { normal: 50 };
    const maxLevel = maxLevelInfo.trained || maxLevelInfo.normal;
    const normalMaxLevel = maxLevelInfo.normal;

    // Calculate stats at current level
    const stats = useMemo(() => {
        if (!card) return { param1: 0, param2: 0, param3: 0, total: 0 };

        const levelIndex = cardLevel - 1;
        const isTrained = cardLevel > normalMaxLevel;

        // Get base stats
        let param1 = card.cardParameters.param1[levelIndex] || 0;
        let param2 = card.cardParameters.param2[levelIndex] || 0;
        let param3 = card.cardParameters.param3[levelIndex] || 0;

        // Add training bonus if trained
        if (isTrained) {
            param1 += card.specialTrainingPower1BonusFixed;
            param2 += card.specialTrainingPower2BonusFixed;
            param3 += card.specialTrainingPower3BonusFixed;
        }

        return {
            param1,
            param2,
            param3,
            total: param1 + param2 + param3,
        };
    }, [card, cardLevel, normalMaxLevel]);

    // Attribute icon mapping
    const getAttrIcon = (attr: CardAttribute) => {
        const iconMap: Record<CardAttribute, string> = {
            cool: "Cool.webp",
            cute: "cute.webp",
            happy: "Happy.webp",
            mysterious: "Mysterious.webp",
            pure: "Pure.webp",
        };
        return `/data/icon/${iconMap[attr]}`;
    };

    // Dynamic skill description (normal skill)
    useEffect(() => {
        if (skillData && card) {
            const translatedDescription = translateGameData("skills", "description", skillData.description);
            const displaySkillData = translatedDescription
                ? { ...skillData, description: translatedDescription }
                : skillData;
            setSkillDescription(formatSkillDescription(displaySkillData, skillLevel, card));
        }
    }, [skillData, skillLevel, card, translateGameData]);

    // Dynamic skill description (trained skill after blooming)
    useEffect(() => {
        if (trainedSkillData && card) {
            const translatedDescription = translateGameData("skills", "description", trainedSkillData.description);
            const displaySkillData = translatedDescription
                ? { ...trainedSkillData, description: translatedDescription }
                : trainedSkillData;
            setTrainedSkillDescription(formatSkillDescription(displaySkillData, skillLevel, card));
        }
    }, [trainedSkillData, skillLevel, card, translateGameData]);

    // Fetch related event and gachas
    useEffect(() => {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

        async function fetchEventMap() {
            try {
                const res = await fetch(`${API_BASE}/api/card-event-map`);
                if (!res.ok) return;
                const map = await res.json();
                if (map[cardId]) {
                    setRelatedEvent(map[cardId]);
                }
            } catch (_e) {
                console.log("Could not fetch event map");
            }
        }

        async function fetchGachaMap() {
            try {
                const res = await fetch(`${API_BASE}/api/card-gacha-map`);
                if (!res.ok) return;
                const map = await res.json() as Record<number, RelatedGachaInfo[]>;
                if (map[cardId] && Array.isArray(map[cardId])) {
                    const gachas = map[cardId];
                    if (gachas.length > 0) {
                        // Find the one with smallest ID
                        const smallest = gachas.reduce((prev, curr) => prev.id < curr.id ? prev : curr);
                        setRelatedGachas([smallest]);
                    }
                }
            } catch (_e) {
                console.log("Could not fetch gacha map");
            }
        }

        async function fetchCostumes() {
            try {
                const data = await fetchMasterData<IMoeCostumeData>("moe_costume.json");
                const matched = (data.costumes || []).filter(
                    c => c.cardIds && c.cardIds.includes(cardId)
                );
                setRelatedCostumes(matched);
            } catch (_e) {
                console.log("Could not fetch costumes");
            }
        }

        if (cardId) {
            fetchEventMap();
            fetchGachaMap();
            fetchCostumes();
        }
    }, [cardId]);

    if (isLoading) {

        return (
            <MainLayout>
                <div className="container mx-auto px-4 py-16">
                    <div className="flex flex-col items-center justify-center min-h-[50vh]">
                        <div className="loading-spinner"></div>
                        <p className="mt-4 text-slate-500">{t("common.state.loading")}</p>
                    </div>
                </div>
            </MainLayout>
        );
    }

    if (error || !card) {
        return (
            <MainLayout>
                <div className="container mx-auto px-4 py-16">
                    <div className="max-w-md mx-auto text-center">
                        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-amber-100 flex items-center justify-center">
                            <svg className="w-12 h-12 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t("page.cards.notFoundTitle")}</h2>
                        <p className="text-slate-500 mb-6">{t("page.cards.notFoundDesc")}</p>
                        <Link
                            href="/cards"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-miku text-white font-bold rounded-xl hover:bg-miku-dark transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            {t("page.cards.backToList")}
                        </Link>
                    </div>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <ImagePreviewModal
                isOpen={imageViewerOpen}
                onClose={() => setImageViewerOpen(false)}
                title={t("page.cards.detailTitle", { name: card.prefix })}
                imageUrl={mainImageUrl}
                alt={card.prefix}
                fileName={`card_${card.id}_${effectiveShowTrained ? "trained" : "normal"}.png`}
            />

            <div className="container mx-auto px-4 sm:px-6 py-8">
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-xs font-mono text-slate-500 w-fit">
                            ID: {card.id}
                        </span>
                        {isJpAdvance && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 rounded-full text-xs font-semibold w-fit border border-rose-200 dark:border-rose-900/50">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                {t("page.cards.jpAdvanceBadge")}
                            </span>
                        )}
                        <div className="flex items-center gap-2">
                            {/* Attribute Badge */}
                            <div
                                className="w-6 h-6 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: ATTR_COLORS[card.attr] + "20" }}
                            >
                                <Image
                                    src={getAttrIcon(card.attr)}
                                    alt={card.attr}
                                    width={18}
                                    height={18}
                                    className="object-contain"
                                    unoptimized
                                />
                            </div>
                            {/* Rarity Stars */}
                            <div className="flex items-center gap-0.5">
                                {isBirthday ? (
                                    <Image
                                        src="/data/icon/birthday.webp"
                                        alt="Birthday"
                                        width={20}
                                        height={20}
                                        unoptimized
                                    />
                                ) : (
                                    Array.from({ length: rarityNum }).map((_, i) => (
                                        <Image
                                            key={i}
                                            src={effectiveShowTrained && cardLevel > normalMaxLevel ? "/data/icon/star_trained.webp" : "/data/icon/star.webp"}
                                            alt="Star"
                                            width={18}
                                            height={18}
                                            unoptimized
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-800 mb-2">
                        <TranslatedText
                            original={card.prefix}
                            category="cards"
                            field="prefix"
                            originalClassName=""
                            translationClassName="block text-base font-medium text-slate-400 mt-1"
                        />
                    </h1>
                    <div className="flex items-center gap-3">
                        <span className="text-lg text-slate-600">{characterName}</span>
                        {characterUnit && (
                            <span
                                className="text-xs px-2 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: characterUnit.color }}
                            >
                                {characterUnit.name}
                            </span>
                        )}
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Card Image */}
                    <div className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto custom-scrollbar">
                        {isScreenshotMode ? (
                            /* Screenshot Mode: Show all images in flat layout */
                            <div className="space-y-4">
                                {/* Normal Image */}
                                {!cardDefaultTrained && (
                                    <div className="ios-glass-card rounded-2xl overflow-hidden">
                                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                                            <span className="text-sm font-bold text-slate-600">{t("page.cards.viewNormal")}</span>
                                        </div>
                                        <div className="relative aspect-[2/1] bg-gradient-to-br from-slate-50 to-slate-100">
                                            <Image
                                                src={getCardFullUrl(card.characterId, card.assetbundleName, false, assetSource)}
                                                alt={`${card.prefix} - ${t("page.cards.viewNormal")}`}
                                                fill
                                                className="object-contain"
                                                unoptimized
                                                priority
                                            />
                                        </div>
                                    </div>
                                )}
                                {/* Trained Image */}
                                {(cardDefaultTrained || (trainable && !isBirthday)) && (
                                    <div className="ios-glass-card rounded-2xl overflow-hidden">
                                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                                            <span className="text-sm font-bold text-slate-600">{t("page.cards.viewTrained")}</span>
                                        </div>
                                        <div className="relative aspect-[2/1] bg-gradient-to-br from-slate-50 to-slate-100">
                                            <Image
                                                src={getCardFullUrl(card.characterId, card.assetbundleName, true, assetSource)}
                                                alt={`${card.prefix} - ${t("page.cards.viewTrained")}`}
                                                fill
                                                className="object-contain"
                                                unoptimized
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Normal Mode: Tabs and switchable view */
                            <div className="ios-glass-card rounded-2xl overflow-hidden">
                                {/* Image Toggle (only for trainable non-birthday cards that have both images) */}
                                {trainable && !isBirthday && !cardDefaultTrained && (
                                    <div className="flex p-1 bg-slate-100/30 dark:bg-slate-900/30 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-800/80 gap-1">
                                        <button
                                            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${!showTrained
                                                ? "ios-glass-tab-active bg-miku text-white shadow-sm"
                                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-800/40"
                                                }`}
                                            onClick={() => setShowTrained(false)}
                                        >
                                            {t("page.cards.viewNormal")}
                                        </button>
                                        <button
                                            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${showTrained
                                                ? "ios-glass-tab-active bg-miku text-white shadow-sm"
                                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-800/40"
                                                }`}
                                            onClick={() => setShowTrained(true)}
                                        >
                                            {t("page.cards.viewTrained")}
                                        </button>
                                    </div>
                                )}

                                {/* Main Image */}
                                <div
                                    className="relative aspect-[2/1] bg-gradient-to-br from-slate-50 to-slate-100 cursor-zoom-in group"
                                    onClick={() => setImageViewerOpen(true)}
                                >
                                    {/* Loading Spinner (behind image) */}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="loading-spinner loading-spinner-sm"></div>
                                    </div>

                                    <Image
                                        key={mainImageUrl} // Force remount on URL change for immediate switch
                                        src={mainImageUrl}
                                        alt={card.prefix}
                                        fill
                                        className="object-contain relative z-10"
                                        unoptimized
                                        priority
                                    />
                                    <div className="absolute bottom-3 right-3 z-20 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                        </svg>
                                        {t("page.cards.clickExpand")}
                                    </div>
                                </div>

                                {/* Thumbnails */}
                                <div className="p-4 flex gap-3 justify-center bg-slate-50/50">
                                    {/* Only show normal thumbnail if card has both images */}
                                    {!cardDefaultTrained && (
                                        <div
                                            className={`relative w-16 h-16 rounded-lg overflow-hidden cursor-pointer ring-2 transition-all ${!effectiveShowTrained ? "ring-miku" : "ring-transparent hover:ring-slate-300"
                                                }`}
                                            onClick={() => setShowTrained(false)}
                                        >
                                            <Image
                                                src={getCardThumbnailUrl(card.characterId, card.assetbundleName, false, assetSource)}
                                                alt="Normal"
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        </div>
                                    )}
                                    {/* Show trained thumbnail for trainable cards or default-trained cards */}
                                    {(cardDefaultTrained || (trainable && !isBirthday)) && (
                                        <div
                                            className={`relative w-16 h-16 rounded-lg overflow-hidden cursor-pointer ring-2 transition-all ${effectiveShowTrained ? "ring-miku" : "ring-transparent hover:ring-slate-300"
                                                }`}
                                            onClick={() => !cardDefaultTrained && setShowTrained(true)}
                                        >
                                            <Image
                                                src={getCardThumbnailUrl(card.characterId, card.assetbundleName, true, assetSource)}
                                                alt="Trained"
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: Card Info */}
                    <div className="space-y-6">
                        {/* Basic Info Card */}
                        <div className="ios-glass-card rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {t("page.cards.basicInfo")}
                                </h2>
                            </div>
                            <div className="divide-y divide-slate-100">
                                <InfoRow label={t("page.cards.cardIdLabel")} value={`#${card.id}`} />
                                <InfoRow
                                    label={t("common.field.name")}
                                    value={
                                        <TranslatedText
                                            original={card.prefix}
                                            category="cards"
                                            field="prefix"
                                            originalClassName=""
                                            translationClassName="block text-xs font-normal text-slate-400 mt-0.5"
                                        />
                                    }
                                />
                                <InfoRow label={t("common.filter.character")} value={characterName} />
                                <InfoRow label={t("common.filter.cardType")} value={
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${supplyName === t("common.cardSupplyTypes.normal") ? "bg-slate-100 text-slate-500" :
                                        supplyName === t("common.cardSupplyTypes.birthday") ? "bg-pink-100 text-pink-500" :
                                            "bg-amber-100 text-amber-600"
                                        }`}>
                                        {supplyName}
                                    </span>
                                } />
                                <InfoRow
                                    label={t("common.filter.attribute")}
                                    value={
                                        <div className="flex items-center gap-2">
                                            <Image
                                                src={getAttrIcon(card.attr)}
                                                alt={card.attr}
                                                width={20}
                                                height={20}
                                                unoptimized
                                            />
                                            <span style={{ color: ATTR_COLORS[card.attr] }}>
                                                {ATTR_NAMES[card.attr]}
                                            </span>
                                        </div>
                                    }
                                />
                                <InfoRow
                                    label={t("common.filter.rarity")}
                                    value={
                                        <div className="flex items-center gap-1">
                                            {isBirthday ? (
                                                <>
                                                    <Image
                                                        src="/data/icon/birthday.webp"
                                                        alt="Birthday"
                                                        width={20}
                                                        height={20}
                                                        unoptimized
                                                    />
                                                    <span className="text-pink-500 font-bold">Birthday</span>
                                                </>
                                            ) : (
                                                <>
                                                    {Array.from({ length: rarityNum }).map((_, i) => (
                                                        <Image
                                                            key={i}
                                                            src="/data/icon/star.webp"
                                                            alt="Star"
                                                            width={18}
                                                            height={18}
                                                            unoptimized
                                                        />
                                                    ))}
                                                    <span className="ml-1 text-amber-500 font-bold">{rarityNum}★</span>
                                                </>
                                            )}
                                        </div>
                                    }
                                />
                                <InfoRow
                                    label={t("page.cards.releasedAtLabel")}
                                    value={mounted && card.releaseAt
                                        ? formatLocaleDate(card.releaseAt, {
                                            year: "numeric",
                                            month: "long",
                                            day: "numeric",
                                        })
                                        : card.releaseAt ? "..." : t("page.cards.unknown")}
                                />
                                <InfoRow
                                    label={t("page.events.assetNameLabel")}
                                    value={<span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{card.assetbundleName}</span>}
                                />
                                {/* Support Unit - Only for Virtual Singers (characterId >= 21) */}
                                {card.characterId >= 21 && (
                                    <InfoRow
                                        label={t("common.filter.supportUnit")}
                                        value={
                                            <div className="flex items-center gap-2">
                                                {card.supportUnit !== "none" && (
                                                    <div className="w-5 h-5 relative">
                                                        <Image
                                                            src={`/data/icon/${UNIT_ICON_FILES[UNIT_FIELD_TO_ID[card.supportUnit]]}`}
                                                            alt={t(SUPPORT_UNIT_LABEL_KEYS[card.supportUnit])}
                                                            fill
                                                            className="object-contain"
                                                            unoptimized
                                                        />
                                                    </div>
                                                )}
                                                <span className={card.supportUnit === "none" ? "text-slate-400" : ""}>
                                                    {t(SUPPORT_UNIT_LABEL_KEYS[card.supportUnit])}
                                                </span>
                                            </div>
                                        }
                                    />
                                )}
                                {card.gachaPhrase && card.gachaPhrase !== "-" && (
                                    <GachaPhraseRow
                                        phrase={card.gachaPhrase}
                                        assetbundleName={card.assetbundleName}
                                    />
                                )}
                            </div>

                        </div>

                        {/* Stats Card */}
                        <div className="ios-glass-card rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    {t("page.cards.powerLabel")}
                                </h2>
                            </div>

                            {/* Level Slider - Compact */}
                            <div className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-500 whitespace-nowrap w-12 text-right">
                                    Lv.{cardLevel}
                                </span>
                                <input
                                    type="range"
                                    min={1}
                                    max={maxLevel}
                                    value={cardLevel}
                                    onChange={(e) => setCardLevel(Number(e.target.value))}
                                    className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-miku"
                                />
                                <span className="text-xs text-slate-400 w-8">
                                    /{maxLevel}
                                </span>
                            </div>

                            {/* Stats Display - Simplified (No Bars) */}
                            <div className="px-5 py-4">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-700">{t("page.cards.totalPower")}</span>
                                    <span className="text-2xl font-black text-miku">{stats.total.toLocaleString()}</span>
                                </div>
                            </div>

                        </div>

                        {/* Skill Card */}
                        <div className="ios-glass-card rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    {t("page.cards.skillTitle")}
                                </h2>
                            </div>
                            <div className="p-5">
                                {/* Skill Level Slider */}
                                {skillData && (
                                    <div className="mb-4 flex items-center gap-3 pb-3 border-b border-slate-200/60">
                                        <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                                            {t("page.cards.skillTitle")} Lv.{skillLevel}
                                        </span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={skillData.skillEffects[0]?.skillEffectDetails.length || 4}
                                            value={skillLevel}
                                            onChange={(e) => setSkillLevel(Number(e.target.value))}
                                            className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-miku"
                                        />
                                        <span className="text-xs text-slate-400">
                                            /{skillData.skillEffects[0]?.skillEffectDetails.length || 4}
                                        </span>
                                    </div>
                                )}

                                {/* Normal Skill (Before Blooming) */}
                                <div className={`mb-4 ${trainedSkillData ? 'pb-4 border-b border-slate-200/60' : ''}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs text-slate-400 uppercase tracking-wider">{t("page.cards.skillNameLabel")}</span>
                                        {trainedSkillData && (
                                            <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                                                {t("page.cards.beforeTrained")}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-lg font-bold text-slate-800 mb-2">
                                        <TranslatedText
                                            original={card.cardSkillName}
                                            category="cards"
                                            field="skillName"
                                            originalClassName=""
                                            translationClassName="block text-sm font-medium text-slate-400 mt-0.5"
                                        />
                                    </p>
                                    <div className="p-4 bg-slate-50 rounded-xl">
                                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                                            {skillDescription || t("page.cards.loadingSkill")}
                                        </p>
                                    </div>
                                </div>


                                {/* Trained Skill (After Blooming) */}
                                {trainedSkillData && card.specialTrainingSkillName && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs text-slate-400 uppercase tracking-wider">{t("page.cards.skillNameLabel")}</span>
                                            <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full">
                                                {t("page.cards.afterTrained")}
                                            </span>
                                        </div>
                                        <p className="text-lg font-bold text-slate-800 mb-2">
                                            <TranslatedText
                                                original={card.specialTrainingSkillName}
                                                category="cards"
                                                field="skillName"
                                                originalClassName=""
                                                translationClassName="block text-sm font-medium text-slate-400 mt-0.5"
                                            />
                                        </p>
                                        <div className="p-4 bg-gradient-to-br from-amber-50 to-slate-50 rounded-xl ring-1 ring-amber-200/50">
                                            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                                                {trainedSkillDescription || t("page.cards.loadingSkill")}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Costumes Card */}
                        {relatedCostumes.length > 0 && (
                            <div className="ios-glass-card rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        {t("page.cards.costumeTitle")}
                                    </h2>
                                </div>
                                <div className="p-5">
                                    <CostumeGrid costumes={relatedCostumes} assetSource={assetSource} />
                                </div>
                            </div>
                        )}

                        {/* Card Story Card */}
                        {hasCardStory && (
                            <div className="ios-glass-card rounded-2xl overflow-hidden group">
                                <Link href={`/story/card/${cardId}`} className="block">
                                    <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-pink-500/10 to-transparent group-hover:from-pink-500/20 transition-colors">
                                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                            <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                            </svg>
                                            {t("page.cards.storyTitle")}
                                        </h2>
                                    </div>
                                    <div className="p-5 flex items-center justify-between group-hover:bg-pink-50/30 transition-colors">
                                        <div>
                                            <p className="font-bold text-slate-800 group-hover:text-pink-600 transition-colors">
                                                {t("page.cards.storyReadBtn")}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1">
                                                {t("page.cards.storyReadDesc")}
                                            </p>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center group-hover:bg-pink-200 transition-colors">
                                            <svg className="w-4 h-4 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        )}

                        {/* Related Event Card */}
                        {relatedEvent && (
                            <div className="ios-glass-card rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        {t("page.cards.relatedEventTitle")}
                                    </h2>
                                </div>
                                <div className="p-0">
                                    <Link href={`/events/${relatedEvent.id}`} className="block group">
                                        <div className="relative aspect-[2/1] w-full">
                                            <Image
                                                src={getEventBannerUrl(relatedEvent.assetbundleName, assetSource)}
                                                alt={relatedEvent.name}
                                                fill
                                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                                unoptimized
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />
                                            <div className="absolute bottom-0 left-0 w-full p-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-mono bg-white/20 text-white px-2 py-0.5 rounded backdrop-blur-sm">
                                                        Event #{relatedEvent.id}
                                                    </span>
                                                </div>
                                                <h3 className="text-white font-bold text-lg leading-tight truncate">
                                                    <TranslatedText
                                                        original={relatedEvent.name}
                                                        category="events"
                                                        field="name"
                                                        originalClassName="truncate block"
                                                        translationClassName="text-sm font-medium text-white/90 truncate block mt-0.5"
                                                    />
                                                </h3>
                                            </div>
                                        </div>
                                    </Link>
                                </div>
                            </div>
                        )}

                        {/* Related Gacha Card */}
                        {relatedGachas.length > 0 && (
                            <div className="ios-glass-card rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-purple-500/10 to-transparent">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {t("page.cards.relatedGachaTitle")}
                                    </h2>
                                </div>
                                <div className="p-4 grid grid-cols-1 gap-3">
                                    {relatedGachas.map((gacha) => (
                                        <Link key={gacha.id} href={`/gacha/${gacha.id}`} className="block group relative h-32 bg-white rounded-xl overflow-hidden ring-1 ring-slate-200 shadow-sm transition-all hover:shadow-md hover:scale-[1.02]">
                                            {/* Logo Container with Padding */}
                                            <div className="absolute inset-3 z-0 flex items-center justify-center">
                                                <Image
                                                    src={getGachaLogoUrl(gacha.assetbundleName, assetSource)}
                                                    alt={gacha.name}
                                                    fill
                                                    className="object-contain transition-transform duration-500 group-hover:scale-110 opacity-90 group-hover:opacity-100"
                                                    unoptimized
                                                />
                                            </div>

                                            {/* Gradient Overlay for Text Readability - Lighter for light mode, or white fade */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/50 to-transparent z-10" />

                                            {/* Text Content */}
                                            <div className="absolute bottom-0 left-0 w-full p-3 z-20">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-mono bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded border border-purple-200 shadow-sm">
                                                        #{gacha.id}
                                                    </span>
                                                </div>
                                                <h3 className="text-slate-800 font-bold text-sm leading-snug w-full line-clamp-2 text-shadow-sm">
                                                    <TranslatedText
                                                        original={gacha.name}
                                                        category="gacha"
                                                        field="name"
                                                        originalClassName="truncate block"
                                                        translationClassName="text-xs font-medium text-slate-500 truncate block mt-0.5"
                                                    />
                                                </h3>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        <DetailPageAdCard hidden={isScreenshotMode} />
                    </div>
                </div>

                {/* Back Button */}
                <div className="mt-12 text-center">
                    <Link
                        href="/cards"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        {t("page.cards.backToList")}
                    </Link>
                </div>
            </div >
        </MainLayout >
    );
}

// Info Row Component
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-500">{label}</span>
            <span className="text-sm font-medium text-slate-800">{value}</span>
        </div>
    );
}

// Gacha Phrase Row Component
function GachaPhraseRow({ phrase, assetbundleName }: { phrase: string; assetbundleName: string }) {
    const { t } = useI18n();
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const togglePlay = () => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsPlaying(false);
        } else {
            audioRef.current.play().catch(e => console.error("Audio play failed:", e));
            setIsPlaying(true);
        }
    };

    return (
        <div className="px-5 py-3 flex flex-col gap-2">
            <span className="text-sm text-slate-500">{t("page.cards.gachaPhraseLabel")}</span>
            <div className="flex items-start gap-3">
                <button
                    onClick={togglePlay}
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${isPlaying
                        ? "bg-miku text-white shadow-md scale-110"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                >
                    {isPlaying ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                    )}
                </button>
                <p className="text-sm font-medium text-slate-800 leading-relaxed pt-1">
                    <TranslatedText
                        original={phrase}
                        category="cards"
                        field="gachaPhrase"
                        originalClassName=""
                        translationClassName="block text-xs font-normal text-slate-500 mt-1"
                    />
                </p>
                <audio
                    ref={audioRef}
                    src={getCardGachaVoiceUrl(assetbundleName)}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                />
            </div>
        </div>
    );
}

// Helper to extract base name (remove _XX color suffix)
function getVariantBaseName(assetName: string): string {
    return assetName.replace(/_\d+$/, "");
}

interface CostumeDisplayItem {
    id: string;
    partType: string;
    baseAssetName: string;
    strictAsset?: string;
    characterId?: number;
}

// Costume Grid Component — shows each costume as an inline detail panel
function CostumeGrid({ costumes, assetSource }: { costumes: ICostumeInfo[], assetSource: AssetSourceType }) {
    return (
        <div className="space-y-6">
            {costumes.map(costume => (
                <CostumeInlineDetail key={costume.costumeNumber} costume={costume} assetSource={assetSource} />
            ))}
        </div>
    );
}

function CostumeInlineDetail({ costume, assetSource }: { costume: ICostumeInfo, assetSource: AssetSourceType }) {
    const [selectedColorId, setSelectedColorId] = useState(1);
    const { t } = useI18n();
    const { t: translateGameData } = useTranslation();
    const translateWithFallback = useCallback((key: string | undefined, fallback: string) => {
        if (!key) return fallback;
        const label = t(key);
        return label === key ? fallback : label;
    }, [t]);

    // Build display items (same logic as /costumes/:ID)
    const displayItems = useMemo(() => {
        const items: CostumeDisplayItem[] = [];

        // Shared parts
        Object.entries(costume.parts).forEach(([partType, partList]) => {
            const groups = new Map<string, typeof partList>();
            partList.forEach(part => {
                const base = getVariantBaseName(part.assetbundleName);
                const key = `${partType}-${base}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(part);
            });

            groups.forEach((groupItems, key) => {
                const colorIds = new Set<number>();
                let hasCollision = false;
                for (const item of groupItems) {
                    if (colorIds.has(item.colorId)) { hasCollision = true; break; }
                    colorIds.add(item.colorId);
                }

                if (hasCollision) {
                    groupItems.forEach(item => {
                        items.push({
                            id: item.assetbundleName,
                            partType,
                            baseAssetName: item.assetbundleName,
                            strictAsset: item.assetbundleName,
                        });
                    });
                } else {
                    const base = getVariantBaseName(groupItems[0].assetbundleName);
                    items.push({ id: key, partType, baseAssetName: base });
                }
            });
        });

        // Extra parts (character-specific)
        if (costume.extraParts) {
            costume.extraParts.forEach(ep => {
                ep.variants.forEach(variant => {
                    items.push({
                        id: `extra-${ep.characterId}-${variant.assetbundleName}`,
                        partType: ep.partType,
                        baseAssetName: variant.assetbundleName,
                        strictAsset: variant.assetbundleName,
                        characterId: ep.characterId,
                    });
                });
            });
        }

        // Sort: body → hair → head → others, extraParts after shared
        const getPartScore = (pt: string) => pt === "body" ? 1 : pt === "hair" ? 2 : pt === "head" ? 3 : 4;
        return items.sort((a, b) => {
            const scoreA = getPartScore(a.partType) + (a.characterId ? 10 : 0);
            const scoreB = getPartScore(b.partType) + (b.characterId ? 10 : 0);
            return scoreA - scoreB;
        });
    }, [costume]);

    // Available color variants (from shared parts only)
    const availableColors = useMemo(() => {
        const uniqueColors = new Map<number, { colorId: number; colorName: string; assetbundleName: string }>();
        Object.values(costume.parts).forEach(partList => {
            partList.forEach(part => {
                if (!uniqueColors.has(part.colorId)) {
                    uniqueColors.set(part.colorId, part);
                }
            });
        });
        return Array.from(uniqueColors.values()).sort((a, b) => a.colorId - b.colorId);
    }, [costume]);

    return (
        <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-slate-400">No.{costume.costumeNumber}</span>
                    <span className="text-sm font-bold text-slate-700 truncate">{costume.name}</span>
                </div>
                <Link
                    href={`/costumes/${costume.costumeNumber}`}
                    className="flex-shrink-0 text-xs text-miku hover:text-miku-dark font-medium transition-colors"
                >
                    {t("page.cards.costumeDetailLink")}
                </Link>
            </div>

            {/* Parts Grid */}
            <div className="grid grid-cols-4 gap-0.5 bg-slate-200/50">
                {displayItems.map((item) => {
                    let assetName = item.id;

                    if (item.strictAsset) {
                        assetName = item.strictAsset;
                    } else {
                        const partList = costume.parts[item.partType] || [];
                        const preciseMatch = partList.find(p =>
                            p.colorId === selectedColorId &&
                            getVariantBaseName(p.assetbundleName) === item.baseAssetName
                        );
                        if (preciseMatch) {
                            assetName = preciseMatch.assetbundleName;
                        } else {
                            const anyMatch = partList.find(p => getVariantBaseName(p.assetbundleName) === item.baseAssetName);
                            if (anyMatch) assetName = anyMatch.assetbundleName;
                        }
                    }

                    return (
                        <div key={item.id} className="relative aspect-square bg-gradient-to-br from-white to-slate-50 flex items-center justify-center p-1.5 group">
                            <div className="relative w-full h-full">
                                <Image
                                    src={getCostumeThumbnailUrl(assetName, assetSource)}
                                    alt={item.id}
                                    fill
                                    className="object-contain"
                                    unoptimized
                                />
                            </div>
                            <div className="absolute inset-x-0 bottom-0 p-0.5 pointer-events-none">
                                <span className="inline-block px-1 py-0.5 bg-white/90 backdrop-blur text-[9px] font-bold text-slate-600 rounded shadow-sm">
                                    {translateWithFallback(PART_TYPE_LABEL_KEYS[item.partType], item.partType)}
                                </span>
                            </div>
                            {item.characterId && (
                                <div className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full overflow-hidden ring-1 ring-slate-200 bg-white shadow-sm z-10">
                                    <Image
                                        src={getCharacterIconUrl(item.characterId)}
                                        alt={getCharacterName(t, item.characterId)}
                                        width={20}
                                        height={20}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
                {displayItems.length === 0 && (
                    <div className="col-span-4 py-4 flex items-center justify-center text-slate-400 text-xs">
                        {t("page.cards.costumeNoParts")}
                    </div>
                )}
            </div>

            {/* Color Selector */}
            {availableColors.length > 1 && (
                <div className="px-3 py-2.5 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-500 mb-1.5">{t("page.cards.costumeColorSchemes")}</p>
                    <div className="flex gap-1.5 overflow-x-auto md:flex-wrap md:overflow-x-visible scrollbar-hide pb-1 md:pb-0">
                        {availableColors.map(variant => {
                            const isSelected = selectedColorId === variant.colorId;
                            return (
                                <button
                                    key={variant.colorId}
                                    onClick={() => setSelectedColorId(variant.colorId)}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${isSelected
                                        ? "bg-miku/10 text-miku border-2 border-miku"
                                        : "bg-white text-slate-600 border border-slate-200 hover:border-miku/50"
                                        }`}
                                >
                                    <div className="w-6 h-6 rounded overflow-hidden bg-slate-100 relative shrink-0">
                                        <Image
                                            src={getCostumeThumbnailUrl(variant.assetbundleName, assetSource)}
                                            alt={variant.colorName}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </div>
                                    {translateGameData("costumes", "colorName", variant.colorName) || variant.colorName}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
