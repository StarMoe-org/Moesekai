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
import { Button, Icon, LoadingIndicator, LoadingState, PageContainer, EmptyState, SegmentedButton } from "@/components/md3";
import { mdApparel, mdArrowBack, mdBarChart, mdBolt, mdCalendarMonth, mdChevronRight, mdInfo, mdMenuBook, mdPaid, mdSchedule, mdStopCircle, mdVolumeUp, mdZoomIn } from "@/components/md3/icons";

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
        if (Number.isFinite(cardId)) {
            fetchCard();
        } else {
            setIsLoading(false);
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
                <PageContainer>
                    <LoadingState label={t("common.state.loading")} />
                </PageContainer>
            </MainLayout>
        );
    }

    if (error || !card) {
        return (
            <MainLayout>
                <PageContainer>
                    <EmptyState
                        icon={mdSchedule}
                        title={t("page.cards.notFoundTitle")}
                        description={t("page.cards.notFoundDesc")}
                        action={
                            <Button variant="filled" icon={mdArrowBack} href="/cards">
                                {t("page.cards.backToList")}
                            </Button>
                        }
                    />
                </PageContainer>
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

            <PageContainer>
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-high rounded-md3-sm type-label-m font-mono text-on-surface-variant w-fit">
                            ID: {card.id}
                        </span>
                        {isJpAdvance && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-error-container text-on-error-container rounded-md3-sm type-label-m w-fit">
                                <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
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
                    <h1 className="type-headline-m sm:type-headline-l text-on-surface mb-2">
                        <TranslatedText
                            original={card.prefix}
                            category="cards"
                            field="prefix"
                            originalClassName=""
                            translationClassName="block type-title-m text-on-surface-variant mt-1"
                        />
                    </h1>
                    <div className="flex items-center gap-3">
                        <span className="type-title-m text-on-surface-variant">{characterName}</span>
                        {characterUnit && (
                            <span
                                className="type-label-m px-2 py-0.5 rounded-md3-sm text-white"
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
                                    <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70 overflow-hidden">
                                        <div className="px-4 py-2 border-b border-outline-variant">
                                            <span className="type-title-s text-on-surface-variant">{t("page.cards.viewNormal")}</span>
                                        </div>
                                        <div className="relative aspect-[2/1] bg-surface-container">
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
                                    <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70 overflow-hidden">
                                        <div className="px-4 py-2 border-b border-outline-variant">
                                            <span className="type-title-s text-on-surface-variant">{t("page.cards.viewTrained")}</span>
                                        </div>
                                        <div className="relative aspect-[2/1] bg-surface-container">
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
                            <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70 overflow-hidden">
                                {/* Image Toggle (only for trainable non-birthday cards that have both images) */}
                                {trainable && !isBirthday && !cardDefaultTrained && (
                                    <div className="p-3 border-b border-outline-variant">
                                        <SegmentedButton
                                            className="w-full"
                                            value={showTrained ? "trained" : "normal"}
                                            onValueChange={(v) => setShowTrained(v === "trained")}
                                            options={[
                                                { value: "normal", label: t("page.cards.viewNormal") },
                                                { value: "trained", label: t("page.cards.viewTrained") },
                                            ]}
                                        />
                                    </div>
                                )}

                                {/* Main Image */}
                                <div
                                    className="relative aspect-[2/1] bg-surface-container cursor-zoom-in group"
                                    onClick={() => setImageViewerOpen(true)}
                                >
                                    {/* Loading Spinner (behind image) */}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <LoadingIndicator size={32} />
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
                                    <div className="absolute bottom-3 right-3 z-20 bg-inverse-surface/80 text-inverse-on-surface type-label-m px-2 py-1 rounded-md3-sm flex items-center gap-1">
                                        <Icon path={mdZoomIn} size={16} />
                                        {t("page.cards.clickExpand")}
                                    </div>
                                </div>

                                {/* Thumbnails */}
                                <div className="p-4 flex gap-3 justify-center">
                                    {/* Only show normal thumbnail if card has both images */}
                                    {!cardDefaultTrained && (
                                        <div
                                            className={`relative w-16 h-16 rounded-md3-sm overflow-hidden cursor-pointer ring-2 transition-[box-shadow] duration-150 ${!effectiveShowTrained ? "ring-primary" : "ring-transparent hover:ring-outline-variant"
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
                                            className={`relative w-16 h-16 rounded-md3-sm overflow-hidden cursor-pointer ring-2 transition-[box-shadow] duration-150 ${effectiveShowTrained ? "ring-primary" : "ring-transparent hover:ring-outline-variant"
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
                        <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70 overflow-hidden">
                            <SectionTitle icon={mdInfo}>{t("page.cards.basicInfo")}</SectionTitle>
                            <div className="divide-y divide-outline-variant">
                                <InfoRow label={t("page.cards.cardIdLabel")} value={`#${card.id}`} />
                                <InfoRow
                                    label={t("common.field.name")}
                                    value={
                                        <TranslatedText
                                            original={card.prefix}
                                            category="cards"
                                            field="prefix"
                                            originalClassName=""
                                            translationClassName="block type-body-s text-on-surface-variant mt-0.5"
                                        />
                                    }
                                />
                                <InfoRow label={t("common.filter.character")} value={characterName} />
                                <InfoRow label={t("common.filter.cardType")} value={
                                    <span className={`px-2 py-0.5 rounded-md3-xs type-label-m ${supplyName === t("common.cardSupplyTypes.normal") ? "bg-surface-container-high text-on-surface-variant" :
                                        supplyName === t("common.cardSupplyTypes.birthday") ? "bg-tertiary-container text-on-tertiary-container" :
                                            "bg-secondary-container text-on-secondary-container"
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
                                    value={<span className="font-mono type-body-s bg-surface-container-high px-2 py-0.5 rounded-md3-xs">{card.assetbundleName}</span>}
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
                                                <span className={card.supportUnit === "none" ? "text-on-surface-variant" : ""}>
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
                        <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70 overflow-hidden">
                            <SectionTitle icon={mdBarChart}>{t("page.cards.powerLabel")}</SectionTitle>

                            {/* Level Slider - Compact */}
                            <div className="px-5 py-3 border-b border-outline-variant flex items-center gap-3">
                                <span className="type-label-l text-on-surface-variant whitespace-nowrap w-12 text-right">
                                    Lv.{cardLevel}
                                </span>
                                <input
                                    type="range"
                                    min={1}
                                    max={maxLevel}
                                    value={cardLevel}
                                    onChange={(e) => setCardLevel(Number(e.target.value))}
                                    className="flex-1 h-1.5 bg-surface-container-highest rounded-full appearance-none cursor-pointer accent-primary"
                                />
                                <span className="type-label-m text-on-surface-variant w-8">
                                    /{maxLevel}
                                </span>
                            </div>

                            {/* Stats Display - Simplified (No Bars) */}
                            <div className="px-5 py-4">
                                <div className="flex items-center justify-between">
                                    <span className="type-title-m text-on-surface">{t("page.cards.totalPower")}</span>
                                    <span className="type-headline-s type-emphasized text-primary">{stats.total.toLocaleString()}</span>
                                </div>
                            </div>

                        </div>

                        {/* Skill Card */}
                        <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70 overflow-hidden">
                            <SectionTitle icon={mdBolt}>{t("page.cards.skillTitle")}</SectionTitle>
                            <div className="p-5">
                                {/* Skill Level Slider */}
                                {skillData && (
                                    <div className="mb-4 flex items-center gap-3 pb-3 border-b border-outline-variant">
                                        <span className="type-label-l text-on-surface-variant whitespace-nowrap">
                                            {t("page.cards.skillTitle")} Lv.{skillLevel}
                                        </span>
                                        <input
                                            type="range"
                                            min={1}
                                            max={skillData.skillEffects[0]?.skillEffectDetails.length || 4}
                                            value={skillLevel}
                                            onChange={(e) => setSkillLevel(Number(e.target.value))}
                                            className="flex-1 h-1.5 bg-surface-container-highest rounded-full appearance-none cursor-pointer accent-primary"
                                        />
                                        <span className="type-label-m text-on-surface-variant">
                                            /{skillData.skillEffects[0]?.skillEffectDetails.length || 4}
                                        </span>
                                    </div>
                                )}

                                {/* Normal Skill (Before Blooming) */}
                                <div className={`mb-4 ${trainedSkillData ? 'pb-4 border-b border-outline-variant' : ''}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="type-label-m text-on-surface-variant">{t("page.cards.skillNameLabel")}</span>
                                        {trainedSkillData && (
                                            <span className="type-label-s px-2 py-0.5 bg-surface-container-high text-on-surface-variant rounded-md3-xs">
                                                {t("page.cards.beforeTrained")}
                                            </span>
                                        )}
                                    </div>
                                    <p className="type-title-l text-on-surface mb-2">
                                        <TranslatedText
                                            original={card.cardSkillName}
                                            category="cards"
                                            field="skillName"
                                            originalClassName=""
                                            translationClassName="block type-body-m text-on-surface-variant mt-0.5"
                                        />
                                    </p>
                                    <div className="p-4 bg-surface-container rounded-md3-md">
                                        <p className="type-body-m text-on-surface-variant whitespace-pre-line">
                                            {skillDescription || t("page.cards.loadingSkill")}
                                        </p>
                                    </div>
                                </div>


                                {/* Trained Skill (After Blooming) */}
                                {trainedSkillData && card.specialTrainingSkillName && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="type-label-m text-on-surface-variant">{t("page.cards.skillNameLabel")}</span>
                                            <span className="type-label-s px-2 py-0.5 bg-tertiary-container text-on-tertiary-container rounded-md3-xs">
                                                {t("page.cards.afterTrained")}
                                            </span>
                                        </div>
                                        <p className="type-title-l text-on-surface mb-2">
                                            <TranslatedText
                                                original={card.specialTrainingSkillName}
                                                category="cards"
                                                field="skillName"
                                                originalClassName=""
                                                translationClassName="block type-body-m text-on-surface-variant mt-0.5"
                                            />
                                        </p>
                                        <div className="p-4 bg-tertiary-container/40 rounded-md3-md ring-1 ring-tertiary/30">
                                            <p className="type-body-m text-on-surface whitespace-pre-line">
                                                {trainedSkillDescription || t("page.cards.loadingSkill")}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Costumes Card */}
                        {relatedCostumes.length > 0 && (
                            <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70 overflow-hidden">
                                <SectionTitle icon={mdApparel}>{t("page.cards.costumeTitle")}</SectionTitle>
                                <div className="p-5">
                                    <CostumeGrid costumes={relatedCostumes} assetSource={assetSource} />
                                </div>
                            </div>
                        )}

                        {/* Card Story Card */}
                        {hasCardStory && (
                            <div className="rounded-md3-xl bg-secondary-container text-on-secondary-container overflow-hidden">
                                <Link href={`/story/card/${cardId}`} className="state-layer focus-ring block rounded-md3-xl">
                                    <div className="flex min-h-14 items-center gap-3 px-5 pt-4">
                                        <Icon path={mdMenuBook} size={24} />
                                        <h2 className="type-title-l">{t("page.cards.storyTitle")}</h2>
                                    </div>
                                    <div className="p-5 pt-2 flex items-center justify-between gap-4">
                                        <div>
                                            <p className="type-title-m">
                                                {t("page.cards.storyReadBtn")}
                                            </p>
                                            <p className="type-body-s opacity-80 mt-1">
                                                {t("page.cards.storyReadDesc")}
                                            </p>
                                        </div>
                                        <span className="w-10 h-10 rounded-full bg-surface-container text-primary flex items-center justify-center shrink-0">
                                            <Icon path={mdChevronRight} size={24} />
                                        </span>
                                    </div>
                                </Link>
                            </div>
                        )}

                        {/* Related Event Card */}
                        {relatedEvent && (
                            <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70 overflow-hidden">
                                <SectionTitle icon={mdCalendarMonth}>{t("page.cards.relatedEventTitle")}</SectionTitle>
                                <div className="p-4 pt-2">
                                    <Link href={`/events/${relatedEvent.id}`} className="focus-ring block group rounded-md3-lg overflow-hidden">
                                        <div className="relative aspect-[2/1] w-full">
                                            <Image
                                                src={getEventBannerUrl(relatedEvent.assetbundleName, assetSource)}
                                                alt={relatedEvent.name}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-scrim/80 via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />
                                            <div className="absolute bottom-0 left-0 w-full p-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-mono bg-scrim/40 text-white px-2 py-0.5 rounded-md3-xs">
                                                        Event #{relatedEvent.id}
                                                    </span>
                                                </div>
                                                <h3 className="text-white type-title-l leading-tight truncate">
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
                            <div className="rounded-md3-xl bg-surface-card border border-outline-variant/70 overflow-hidden">
                                <SectionTitle icon={mdPaid}>{t("page.cards.relatedGachaTitle")}</SectionTitle>
                                <div className="p-4 pt-2 grid grid-cols-1 gap-3">
                                    {relatedGachas.map((gacha) => (
                                        <Link key={gacha.id} href={`/gacha/${gacha.id}`} className="state-layer focus-ring block group relative h-32 bg-surface-container-lowest rounded-md3-lg overflow-hidden shadow-elev-1 transition-shadow duration-200 hover:shadow-elev-2">
                                            {/* Logo Container with Padding */}
                                            <div className="absolute inset-3 z-0 flex items-center justify-center">
                                                <Image
                                                    src={getGachaLogoUrl(gacha.assetbundleName, assetSource)}
                                                    alt={gacha.name}
                                                    fill
                                                    className="object-contain opacity-90 transition-opacity group-hover:opacity-100"
                                                    unoptimized
                                                />
                                            </div>

                                            {/* Gradient Overlay for Text Readability - Lighter for light mode, or white fade */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/95 via-surface-container-lowest/50 to-transparent z-10" />

                                            {/* Text Content */}
                                            <div className="absolute bottom-0 left-0 w-full p-3 z-20">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-mono bg-secondary-container text-on-secondary-container px-1.5 py-0.5 rounded-md3-xs">
                                                        #{gacha.id}
                                                    </span>
                                                </div>
                                                <h3 className="text-on-surface type-title-s w-full line-clamp-2">
                                                    <TranslatedText
                                                        original={gacha.name}
                                                        category="gacha"
                                                        field="name"
                                                        originalClassName="truncate block"
                                                        translationClassName="type-body-s text-on-surface-variant truncate block mt-0.5"
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
                    <Button variant="tonal" icon={mdArrowBack} href="/cards">
                        {t("page.cards.backToList")}
                    </Button>
                </div>
            </PageContainer>
        </MainLayout>
    );
}

// Section heading used by the detail cards
function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-14 items-center gap-3 px-5 pt-4 pb-2">
            <Icon path={icon} size={24} className="text-primary" />
            <h2 className="min-w-0 flex-1 truncate type-title-l text-on-surface">{children}</h2>
        </div>
    );
}

// Info Row Component
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="px-5 py-3 flex items-center justify-between gap-4">
            <span className="type-body-m text-on-surface-variant">{label}</span>
            <span className="type-body-m text-on-surface text-right">{value}</span>
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
            <span className="type-body-m text-on-surface-variant">{t("page.cards.gachaPhraseLabel")}</span>
            <div className="flex items-start gap-3">
                <button
                    type="button"
                    onClick={togglePlay}
                    aria-pressed={isPlaying}
                    className={`state-layer focus-ring flex-shrink-0 w-10 h-10 flex items-center justify-center transition-[border-radius,background-color] duration-200 ease-md3-standard ${isPlaying
                        ? "bg-primary text-on-primary rounded-md3-md"
                        : "bg-surface-container-high text-on-surface-variant rounded-full"
                        }`}
                >
                    <Icon path={isPlaying ? mdStopCircle : mdVolumeUp} size={20} />
                </button>
                <p className="type-body-m text-on-surface pt-2">
                    <TranslatedText
                        original={phrase}
                        category="cards"
                        field="gachaPhrase"
                        originalClassName=""
                        translationClassName="block type-body-s text-on-surface-variant mt-1"
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
        <div className="bg-surface-container rounded-md3-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-variant">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="type-label-s font-mono text-on-surface-variant">No.{costume.costumeNumber}</span>
                    <span className="type-title-s text-on-surface truncate">{costume.name}</span>
                </div>
                <Link
                    href={`/costumes/${costume.costumeNumber}`}
                    className="state-layer focus-ring flex-shrink-0 rounded-full px-2 py-1 type-label-l text-primary"
                >
                    {t("page.cards.costumeDetailLink")}
                </Link>
            </div>

            {/* Parts Grid */}
            <div className="grid grid-cols-4 gap-0.5 bg-outline-variant/50">
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
                        <div key={item.id} className="relative aspect-square bg-surface-container-lowest flex items-center justify-center p-1.5 group">
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
                                <span className="inline-block px-1 py-0.5 bg-surface-container-high/90 text-[9px] font-bold text-on-surface-variant rounded-md3-xs">
                                    {translateWithFallback(PART_TYPE_LABEL_KEYS[item.partType], item.partType)}
                                </span>
                            </div>
                            {item.characterId && (
                                <div className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full overflow-hidden ring-1 ring-outline-variant bg-surface-container-lowest shadow-elev-1 z-10">
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
                    <div className="col-span-4 py-4 flex items-center justify-center bg-surface-container-lowest text-on-surface-variant type-body-s">
                        {t("page.cards.costumeNoParts")}
                    </div>
                )}
            </div>

            {/* Color Selector */}
            {availableColors.length > 1 && (
                <div className="px-3 py-2.5 border-t border-outline-variant">
                    <p className="type-label-m text-on-surface-variant mb-1.5">{t("page.cards.costumeColorSchemes")}</p>
                    <div className="flex gap-1.5 overflow-x-auto md:flex-wrap md:overflow-x-visible scrollbar-hide pb-1 md:pb-0">
                        {availableColors.map(variant => {
                            const isSelected = selectedColorId === variant.colorId;
                            return (
                                <button
                                    key={variant.colorId}
                                    onClick={() => setSelectedColorId(variant.colorId)}
                                    className={`state-layer focus-ring flex items-center gap-1.5 pl-1 pr-2.5 h-8 rounded-md3-sm type-label-m transition-colors whitespace-nowrap border ${isSelected
                                        ? "bg-secondary-container text-on-secondary-container border-transparent"
                                        : "text-on-surface-variant border-outline-variant"
                                        }`}
                                >
                                    <div className="w-6 h-6 rounded-md3-xs overflow-hidden bg-surface-container-highest relative shrink-0">
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
