"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "@/components/LocalizedLink";
import MainLayout from "@/components/MainLayout";
import Modal from "@/components/common/Modal";
import GachaSelector from "@/components/gacha/GachaSelector";
import CardSelectorModal from "@/components/cards/CardSelectorModal";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import CharacterFilter from "@/components/common/CharacterFilter";
import { FilterSection, getFilterChipStateClasses, getFilterIconStateClasses } from "@/components/common/BaseFilters";
import GachaStage3d, { type GachaStageRequest } from "@/components/gacha/GachaStage3d";
import { SEKAI_GACHA_MAX_CARDS, isSekaiGachaCard } from "@/lib/sekaiGacha/protocol";
import {
    ICardInfo,
    IGachaInfo,
    IGachaDetail,
    CardRarityType,
    CardAttribute,
    ATTR_NAMES,
    ATTR_ICON_PATHS,
    isTrainableCard,
    getCardDefaultTrainedStatus,
    isWishGacha,
} from "@/types/types";
import { ICardSupply, useCardSupplyTypeMapping } from "@/hooks/useCardSupplyType";
import { fetchMasterData } from "@/lib/fetch";
import { getGachaLogoUrl, getGachaScreenUrl } from "@/lib/assets";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import {
    Button,
    ErrorState,
    Icon,
    IconButton,
    LoadingState,
    PageContainer,
    PageHeader,
    SectionCard,
    Switch,
} from "@/components/md3";
import {
    mdAdd,
    mdBarChart,
    mdCasino,
    mdCheck,
    mdClose,
    mdDelete,
    mdGridView,
    mdKidStar,
    mdOpenInNew,
    mdPlayArrowFill,
    mdRefresh,
    mdStarFill,
    mdTune,
    mdViewInAr,
    mdWandStars,
} from "@/components/md3/icons";

const STAGE_3D_KEY = "gacha-stage-3d";
const DIY_STORAGE_KEY = "moesekai_gacha_simulator_diy_v1";

const CARD_TILE_BASE = "rounded-md3-sm overflow-hidden bg-surface-container-lowest transition-shadow relative";
const CARD_TILE_IDLE = "ring-1 ring-outline-variant group-hover:ring-2 group-hover:ring-primary";

const ATTRIBUTES: CardAttribute[] = ["cool", "cute", "happy", "mysterious", "pure"];

type GuaranteeMode = "over_rarity_3_once" | "over_rarity_4_once" | "none";
type PoolMode = "gacha" | "filter";

interface SimulatorStats {
    spinCount: number;
    pickupCount: number;
    rarity4Count: number;
    birthdayCount: number;
    rarity3Count: number;
    rarity2Count: number;
}

interface HistoryItem {
    cardId: number;
    pullIndex: number;
}

interface WeightedCardEntry {
    card: ICardInfo;
    weight: number;
    chance: number;
}

function pickByChance<T>(entries: Array<{ item: T; chance: number }>): T | null {
    if (entries.length === 0) return null;
    const totalChance = entries.reduce((sum, entry) => sum + Math.max(0, entry.chance), 0);
    if (totalChance <= 0) return null;

    const roll = Math.random() * totalChance;
    let accumulated = 0;
    for (const entry of entries) {
        accumulated += Math.max(0, entry.chance);
        if (roll < accumulated) {
            return entry.item;
        }
    }
    return entries[entries.length - 1]?.item ?? null;
}

function PulledBadge({ count }: { count: number }) {
    return (
        <div className="flex items-center justify-center gap-0.5 bg-primary text-on-primary type-label-s py-0.5 leading-none">
            <Icon path={mdCheck} size={12} />
            {count > 1 && <span>×{count}</span>}
        </div>
    );
}

function GachaSimulatorContent() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const { useTrainedThumbnail, assetSource, isShowSpoiler } = useTheme();
    const supplyTypes = useCardSupplyTypeMapping();
    const [now] = useState(() => Date.now());

    // Masterdata
    const [allGachas, setAllGachas] = useState<IGachaInfo[]>([]);
    const [allCards, setAllCards] = useState<ICardInfo[]>([]);
    const [suppliesMap, setSuppliesMap] = useState<Map<number, string>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [initialized, setInitialized] = useState(false);

    // Base Gacha & DIY Config States
    const [selectedGachaId, setSelectedGachaId] = useState<number | null>(null);
    const [rate4Star, setRate4Star] = useState<number>(3.0);
    const [rateBirthday, setRateBirthday] = useState<number>(0.0);
    const [rate3Star, setRate3Star] = useState<number>(8.5);
    const [rate2Star, setRate2Star] = useState<number>(88.5);
    const [singlePickupRate, setSinglePickupRate] = useState<number>(0.4);
    const [guaranteeMode, setGuaranteeMode] = useState<GuaranteeMode>("over_rarity_3_once");
    const [pickupCardIds, setPickupCardIds] = useState<number[]>([]);

    // Card Pool Customization States
    const [poolMode, setPoolMode] = useState<PoolMode>("gacha");
    const [selectedSupplyTypes, setSelectedSupplyTypes] = useState<string[]>(["normal"]);
    const [selectedPoolChars, setSelectedPoolChars] = useState<number[]>([]);
    const [selectedPoolUnitIds, setSelectedPoolUnitIds] = useState<string[]>([]);
    const [selectedPoolAttrs, setSelectedPoolAttrs] = useState<CardAttribute[]>([]);
    const [addedCardIds, setAddedCardIds] = useState<number[]>([]);
    const [removedCardIds, setRemovedCardIds] = useState<number[]>([]);

    // Modals
    const [isAdvancedModalOpen, setIsAdvancedModalOpen] = useState(false);
    const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
    const [isViewPoolModalOpen, setIsViewPoolModalOpen] = useState(false);
    const [isEditAllPoolModalOpen, setIsEditAllPoolModalOpen] = useState(false);

    // Simulator States
    const [customSpinCount, setCustomSpinCount] = useState<string>("");
    const [stats, setStats] = useState<SimulatorStats>({
        spinCount: 0,
        pickupCount: 0,
        rarity4Count: 0,
        birthdayCount: 0,
        rarity3Count: 0,
        rarity2Count: 0,
    });
    const [recentPullCardIds, setRecentPullCardIds] = useState<number[]>([]);
    const [historyHighRarity, setHistoryHighRarity] = useState<HistoryItem[]>([]);

    // 3D Stage States
    const [stage3dEnabled, setStage3dEnabled] = useState(false);
    const [stageRequest, setStageRequest] = useState<GachaStageRequest | null>(null);
    const [stageOpen, setStageOpen] = useState(false);
    const [lastSpinCount, setLastSpinCount] = useState<number>(10);

    useEffect(() => {
        try {
            setStage3dEnabled(localStorage.getItem(STAGE_3D_KEY) === "1");
        } catch {
            /* ignore */
        }
    }, []);

    const changeStage3d = useCallback((enabled: boolean) => {
        setStage3dEnabled(enabled);
        try {
            localStorage.setItem(STAGE_3D_KEY, enabled ? "1" : "0");
        } catch {
            /* ignore */
        }
        if (!enabled) {
            setStageOpen(false);
            setStageRequest(null);
        }
    }, []);

    // Load Master Data
    useEffect(() => {
        let active = true;
        async function loadData() {
            try {
                setIsLoading(true);
                const [gachasData, cardsData, suppliesData] = await Promise.all([
                    fetchMasterData<IGachaInfo[]>("gachas.json"),
                    fetchMasterData<ICardInfo[]>("cards.json"),
                    fetchMasterData<ICardSupply[]>("cardSupplies.json").catch(() => [] as ICardSupply[]),
                ]);
                if (!active) return;
                setAllGachas(gachasData);
                setAllCards(cardsData);
                if (suppliesData.length > 0) {
                    setSuppliesMap(new Map(suppliesData.map((s) => [s.id, s.cardSupplyType])));
                }
                setError(null);
            } catch (err) {
                if (!active) return;
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                if (active) setIsLoading(false);
            }
        }
        loadData();
        return () => {
            active = false;
        };
    }, []);

    // Enrich cards with resolved cardSupplyType
    const enrichedCards = useMemo(() => {
        return allCards.map((card) => {
            const supplyType =
                card.cardSupplyType ||
                suppliesMap.get(card.cardSupplyId) ||
                (card.cardRarityType === "rarity_birthday" ? "birthday" : "normal");
            return { ...card, cardSupplyType: supplyType };
        });
    }, [allCards, suppliesMap]);

    const cardMap = useMemo(() => new Map(enrichedCards.map((c) => [c.id, c])), [enrichedCards]);

    // Eligible cards for gacha (2★, 3★, 4★, Birthday)
    const allGachaEligibleCards = useMemo(() => {
        return enrichedCards.filter((c) => c.cardRarityType !== "rarity_1");
    }, [enrichedCards]);

    const selectedGacha = useMemo(() => {
        if (selectedGachaId === null) return null;
        return allGachas.find((g) => g.id === selectedGachaId) || null;
    }, [allGachas, selectedGachaId]);

    // Apply an official gacha's configuration
    const applyGachaConfig = useCallback(
        (gacha: IGachaInfo) => {
            setSelectedGachaId(gacha.id);

            const rates = gacha.gachaCardRarityRates || [];
            const r4 = rates
                .filter((r) => r.cardRarityType === "rarity_4")
                .reduce((sum, r) => sum + (r.rate || 0), 0);
            const rBd = rates
                .filter((r) => r.cardRarityType === "rarity_birthday")
                .reduce((sum, r) => sum + (r.rate || 0), 0);
            const r3 = rates
                .filter((r) => r.cardRarityType === "rarity_3")
                .reduce((sum, r) => sum + (r.rate || 0), 0);
            const r2 = rates
                .filter((r) => r.cardRarityType === "rarity_2")
                .reduce((sum, r) => sum + (r.rate || 0), 0);

            setRate4Star(Number(r4.toFixed(2)));
            setRateBirthday(Number(rBd.toFixed(2)));
            setRate3Star(Number(r3.toFixed(2)));
            setRate2Star(Number(r2.toFixed(2)));

            // Guarantee mode
            if (gacha.gachaBehaviors?.some((b) => b.gachaBehaviorType === "over_rarity_4_once")) {
                setGuaranteeMode("over_rarity_4_once");
            } else if (gacha.gachaBehaviors?.some((b) => b.gachaBehaviorType === "over_rarity_3_once")) {
                setGuaranteeMode("over_rarity_3_once");
            } else {
                setGuaranteeMode("none");
            }

            // Pickups
            const rawPickups = (gacha.gachaPickups || []).map((p) => p.cardId);
            if (isWishGacha(gacha)) {
                const fixedWishIds = (gacha.gachaDetails || [])
                    .filter((d) => d.gachaDetailWishType === "fixed")
                    .map((d) => d.cardId);
                const merged = Array.from(new Set([...fixedWishIds, ...rawPickups]));
                setPickupCardIds(merged);
            } else {
                setPickupCardIds(rawPickups);
            }

            // Single pickup rate estimation from gacha details
            if (rBd > 0 && r4 === 0 && rawPickups.length > 0) {
                setSinglePickupRate(Number((rBd / rawPickups.length).toFixed(2)));
            } else {
                setSinglePickupRate(0.4);
            }

            setPoolMode("gacha");
            setAddedCardIds([]);
            setRemovedCardIds([]);
        },
        []
    );

    // Initialize from URL or localStorage or default latest gacha
    useEffect(() => {
        if (isLoading || allGachas.length === 0 || initialized) return;

        const urlGachaId = searchParams.get("gachaId");
        if (urlGachaId) {
            const numId = parseInt(urlGachaId, 10);
            const found = allGachas.find((g) => g.id === numId);
            if (found) {
                applyGachaConfig(found);
                setInitialized(true);
                return;
            }
        }

        try {
            const savedRaw = localStorage.getItem(DIY_STORAGE_KEY);
            if (savedRaw) {
                const saved = JSON.parse(savedRaw);
                if (typeof saved.selectedGachaId === "number") {
                    setSelectedGachaId(saved.selectedGachaId);
                } else {
                    setSelectedGachaId(null);
                }
                if (typeof saved.rate4Star === "number") setRate4Star(saved.rate4Star);
                if (typeof saved.rateBirthday === "number") setRateBirthday(saved.rateBirthday);
                if (typeof saved.rate3Star === "number") setRate3Star(saved.rate3Star);
                if (typeof saved.rate2Star === "number") setRate2Star(saved.rate2Star);
                if (typeof saved.singlePickupRate === "number") setSinglePickupRate(saved.singlePickupRate);
                if (saved.guaranteeMode) setGuaranteeMode(saved.guaranteeMode);
                if (Array.isArray(saved.pickupCardIds)) setPickupCardIds(saved.pickupCardIds);
                if (saved.poolMode) setPoolMode(saved.poolMode);
                if (Array.isArray(saved.selectedSupplyTypes)) setSelectedSupplyTypes(saved.selectedSupplyTypes);
                if (Array.isArray(saved.selectedPoolChars)) setSelectedPoolChars(saved.selectedPoolChars);
                if (Array.isArray(saved.selectedPoolUnitIds)) setSelectedPoolUnitIds(saved.selectedPoolUnitIds);
                if (Array.isArray(saved.selectedPoolAttrs)) setSelectedPoolAttrs(saved.selectedPoolAttrs);
                if (Array.isArray(saved.addedCardIds)) setAddedCardIds(saved.addedCardIds);
                if (Array.isArray(saved.removedCardIds)) setRemovedCardIds(saved.removedCardIds);
                setInitialized(true);
                return;
            }
        } catch {
            /* ignore */
        }

        // Default to latest released gacha
        const releasedGachas = allGachas
            .filter((g) => isShowSpoiler || g.startAt <= now)
            .sort((a, b) => b.startAt - a.startAt);
        const defaultGacha = releasedGachas[0] || allGachas[0];
        if (defaultGacha) {
            applyGachaConfig(defaultGacha);
        }
        setInitialized(true);
    }, [isLoading, allGachas, initialized, searchParams, applyGachaConfig, isShowSpoiler, now]);

    // Persist DIY state to localStorage & sync gachaId to URL
    useEffect(() => {
        if (!initialized) return;
        const payload = {
            selectedGachaId,
            rate4Star,
            rateBirthday,
            rate3Star,
            rate2Star,
            singlePickupRate,
            guaranteeMode,
            pickupCardIds,
            poolMode,
            selectedSupplyTypes,
            selectedPoolChars,
            selectedPoolUnitIds,
            selectedPoolAttrs,
            addedCardIds,
            removedCardIds,
        };
        try {
            localStorage.setItem(DIY_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            /* ignore */
        }

        const params = new URLSearchParams();
        if (selectedGachaId !== null) {
            params.set("gachaId", String(selectedGachaId));
        }
        replaceCurrentUrlSearchParams(params);
    }, [
        initialized,
        selectedGachaId,
        rate4Star,
        rateBirthday,
        rate3Star,
        rate2Star,
        singlePickupRate,
        guaranteeMode,
        pickupCardIds,
        poolMode,
        selectedSupplyTypes,
        selectedPoolChars,
        selectedPoolUnitIds,
        selectedPoolAttrs,
        addedCardIds,
        removedCardIds,
    ]);

    // Active Pickup Cards
    const pickupCards = useMemo(() => {
        return pickupCardIds
            .map((id) => cardMap.get(id))
            .filter((c): c is ICardInfo & { cardSupplyType: string } => c !== undefined);
    }, [pickupCardIds, cardMap]);

    // Compute Active Card Pool
    const activePoolCards = useMemo(() => {
        const poolSet = new Set<number>();

        if (poolMode === "gacha" && selectedGacha) {
            for (const detail of selectedGacha.gachaDetails || []) {
                if (cardMap.has(detail.cardId)) {
                    poolSet.add(detail.cardId);
                }
            }
        } else {
            // Filter mode across allGachaEligibleCards
            for (const card of allGachaEligibleCards) {
                if (!isShowSpoiler && (card.releaseAt || card.archivePublishedAt || 0) > now) {
                    continue;
                }
                if (selectedSupplyTypes.length > 0 && !selectedSupplyTypes.includes(card.cardSupplyType)) {
                    continue;
                }
                if (selectedPoolChars.length > 0 && !selectedPoolChars.includes(card.characterId)) {
                    continue;
                }
                if (selectedPoolAttrs.length > 0 && !selectedPoolAttrs.includes(card.attr)) {
                    continue;
                }
                poolSet.add(card.id);
            }
        }

        // Apply manual removals and additions
        for (const remId of removedCardIds) {
            poolSet.delete(remId);
        }
        for (const addId of addedCardIds) {
            if (cardMap.has(addId)) poolSet.add(addId);
        }
        // Always ensure pickup cards are in the active pool
        for (const puId of pickupCardIds) {
            if (cardMap.has(puId)) poolSet.add(puId);
        }

        const result = Array.from(poolSet)
            .map((id) => cardMap.get(id))
            .filter((c): c is ICardInfo & { cardSupplyType: string } => c !== undefined);

        const rarityOrder: Record<string, number> = {
            rarity_4: 4,
            rarity_birthday: 3.5,
            rarity_3: 3,
            rarity_2: 2,
            rarity_1: 1,
        };
        const puSet = new Set(pickupCardIds);

        return result.sort((a, b) => {
            const rA = rarityOrder[a.cardRarityType] || 0;
            const rB = rarityOrder[b.cardRarityType] || 0;
            if (rA !== rB) return rB - rA;
            const pA = puSet.has(a.id);
            const pB = puSet.has(b.id);
            if (pA !== pB) return pA ? -1 : 1;
            return b.id - a.id;
        });
    }, [
        poolMode,
        selectedGacha,
        allGachaEligibleCards,
        cardMap,
        isShowSpoiler,
        now,
        selectedSupplyTypes,
        selectedPoolChars,
        selectedPoolAttrs,
        removedCardIds,
        addedCardIds,
        pickupCardIds,
    ]);

    const activePoolCardIds = useMemo(() => activePoolCards.map((c) => c.id), [activePoolCards]);

    // Group active pool cards by rarity and compute individual card draw chances & synthetic gachaDetails
    const {
        poolByRarity,
        syntheticGachaDetails,
        effectivePickupTotalRate,
    } = useMemo(() => {
        const pickupSet = new Set(pickupCardIds);
        const byRarity: Record<CardRarityType, WeightedCardEntry[]> = {
            rarity_4: [],
            rarity_birthday: [],
            rarity_3: [],
            rarity_2: [],
            rarity_1: [],
        };

        const rarityRatesMap: Record<CardRarityType, number> = {
            rarity_4: Math.max(0, rate4Star),
            rarity_birthday: Math.max(0, rateBirthday),
            rarity_3: Math.max(0, rate3Star),
            rarity_2: Math.max(0, rate2Star),
            rarity_1: 0,
        };

        const rawCardsByRarity: Record<CardRarityType, ICardInfo[]> = {
            rarity_4: [],
            rarity_birthday: [],
            rarity_3: [],
            rarity_2: [],
            rarity_1: [],
        };

        for (const card of activePoolCards) {
            rawCardsByRarity[card.cardRarityType]?.push(card);
        }

        let totalEffectiveUpRate = 0;
        const details: IGachaDetail[] = [];

        (["rarity_4", "rarity_birthday", "rarity_3", "rarity_2"] as CardRarityType[]).forEach((rarity) => {
            const cardsOfRarity = rawCardsByRarity[rarity];
            const rarityTotalRate = rarityRatesMap[rarity];
            if (cardsOfRarity.length === 0) return;

            const upCards = cardsOfRarity.filter((c) => pickupSet.has(c.id));
            const nonUpCards = cardsOfRarity.filter((c) => !pickupSet.has(c.id));

            if (upCards.length > 0 && rarityTotalRate > 0) {
                const maxPerUp = rarityTotalRate / upCards.length;
                const actualPerUp = nonUpCards.length > 0
                    ? Math.min(Math.max(0, singlePickupRate), maxPerUp)
                    : maxPerUp;
                const upTotalForRarity = actualPerUp * upCards.length;
                const nonUpTotalForRarity = Math.max(0, rarityTotalRate - upTotalForRarity);
                const perNonUp = nonUpCards.length > 0 ? nonUpTotalForRarity / nonUpCards.length : 0;

                totalEffectiveUpRate += upTotalForRarity;

                for (const card of upCards) {
                    const weight = Math.max(1, Math.round(actualPerUp * 10000));
                    byRarity[rarity].push({ card, weight, chance: actualPerUp });
                    details.push({ id: card.id, gachaId: selectedGachaId ?? 0, cardId: card.id, weight });
                }
                for (const card of nonUpCards) {
                    const weight = Math.max(1, Math.round(perNonUp * 10000));
                    byRarity[rarity].push({ card, weight, chance: perNonUp });
                    details.push({ id: card.id, gachaId: selectedGachaId ?? 0, cardId: card.id, weight });
                }
            } else {
                const perCard = cardsOfRarity.length > 0 ? rarityTotalRate / cardsOfRarity.length : 0;
                for (const card of cardsOfRarity) {
                    const weight = 100;
                    byRarity[rarity].push({ card, weight, chance: perCard });
                    details.push({ id: card.id, gachaId: selectedGachaId ?? 0, cardId: card.id, weight });
                }
            }
        });

        return {
            poolByRarity: byRarity,
            syntheticGachaDetails: details,
            effectivePickupTotalRate: Number(totalEffectiveUpRate.toFixed(2)),
        };
    }, [activePoolCards, pickupCardIds, rate4Star, rateBirthday, rate3Star, rate2Star, singlePickupRate, selectedGachaId]);

    const totalRateSum = useMemo(() => {
        return Number((rate4Star + rateBirthday + rate3Star + rate2Star).toFixed(2));
    }, [rate4Star, rateBirthday, rate3Star, rate2Star]);

    const autoBalance2Star = useCallback(() => {
        const remainder = Math.max(0, Number((100 - rate4Star - rateBirthday - rate3Star).toFixed(2)));
        setRate2Star(remainder);
    }, [rate4Star, rateBirthday, rate3Star]);

    // Toggle a card in/out of the active pool manually
    const handleTogglePoolCard = useCallback(
        (card: ICardInfo) => {
            const isCurrentlyInPool = activePoolCardIds.includes(card.id);
            if (isCurrentlyInPool) {
                // Remove from pool (also remove from pickup if it was a pickup card)
                setPickupCardIds((prev) => prev.filter((id) => id !== card.id));
                setAddedCardIds((prev) => prev.filter((id) => id !== card.id));
                setRemovedCardIds((prev) => (prev.includes(card.id) ? prev : [...prev, card.id]));
            } else {
                setRemovedCardIds((prev) => prev.filter((id) => id !== card.id));
                setAddedCardIds((prev) => (prev.includes(card.id) ? prev : [...prev, card.id]));
            }
        },
        [activePoolCardIds]
    );

    // Reset simulator stats
    const resetStats = useCallback(() => {
        setStats({
            spinCount: 0,
            pickupCount: 0,
            rarity4Count: 0,
            birthdayCount: 0,
            rarity3Count: 0,
            rarity2Count: 0,
        });
        setRecentPullCardIds([]);
        setHistoryHighRarity([]);
    }, []);

    // Perform Gacha Roll
    const spin = useCallback(
        (spinCount: number) => {
            if (activePoolCards.length === 0 || spinCount <= 0) return;

            const rarityBuckets: Array<{ rarity: CardRarityType; rate: number; entries: WeightedCardEntry[] }> = [
                { rarity: "rarity_4" as const, rate: Math.max(0, rate4Star), entries: poolByRarity.rarity_4 },
                { rarity: "rarity_birthday" as const, rate: Math.max(0, rateBirthday), entries: poolByRarity.rarity_birthday },
                { rarity: "rarity_3" as const, rate: Math.max(0, rate3Star), entries: poolByRarity.rarity_3 },
                { rarity: "rarity_2" as const, rate: Math.max(0, rate2Star), entries: poolByRarity.rarity_2 },
            ].filter((b) => b.rate > 0 && b.entries.length > 0);

            if (rarityBuckets.length === 0) return;

            const pickupSet = new Set(pickupCardIds);
            const pulledCards: ICardInfo[] = [];
            let addPickup = 0;
            let addR4 = 0;
            let addBd = 0;
            let addR3 = 0;
            let addR2 = 0;

            const getRarityLevel = (r: CardRarityType) => {
                if (r === "rarity_4" || r === "rarity_birthday") return 4;
                if (r === "rarity_3") return 3;
                return 2;
            };

            const minGuaranteeLevel =
                guaranteeMode === "over_rarity_4_once" ? 4 : guaranteeMode === "over_rarity_3_once" ? 3 : 0;

            let noGuaranteeCount = 0;

            for (let i = 0; i < spinCount; i++) {
                if (i % 10 === 0) {
                    noGuaranteeCount = 0;
                }

                const is10thGuarantee =
                    i % 10 === 9 && minGuaranteeLevel > 0 && noGuaranteeCount === 9;

                let chosenBucket: (typeof rarityBuckets)[number] | null = null;

                if (is10thGuarantee) {
                    // Build guaranteed buckets (collapsing lower rarity rates into the threshold rarity)
                    const eligibleBuckets = rarityBuckets.filter(
                        (b) => getRarityLevel(b.rarity) >= minGuaranteeLevel
                    );
                    if (eligibleBuckets.length > 0) {
                        const collapsedRate = rarityBuckets
                            .filter((b) => getRarityLevel(b.rarity) < minGuaranteeLevel)
                            .reduce((s, b) => s + b.rate, 0);

                        const guaranteeEntries = eligibleBuckets.map((b) => {
                            const isThresholdRarity =
                                (minGuaranteeLevel === 3 && b.rarity === "rarity_3") ||
                                (minGuaranteeLevel === 4 &&
                                    (b.rarity === "rarity_4" ||
                                        (b.rarity === "rarity_birthday" &&
                                            !eligibleBuckets.some((eb) => eb.rarity === "rarity_4"))));
                            return {
                                item: b,
                                chance: isThresholdRarity ? b.rate + collapsedRate : b.rate,
                            };
                        });
                        chosenBucket = pickByChance(guaranteeEntries);
                    }
                }

                if (!chosenBucket) {
                    chosenBucket = pickByChance(
                        rarityBuckets.map((b) => ({ item: b, chance: b.rate }))
                    );
                }

                if (!chosenBucket) continue;

                const pulledCard = pickByChance(
                    chosenBucket.entries.map((e) => ({ item: e.card, chance: e.chance > 0 ? e.chance : e.weight }))
                );

                if (!pulledCard) continue;

                pulledCards.push(pulledCard);
                if (pickupSet.has(pulledCard.id)) addPickup++;
                if (pulledCard.cardRarityType === "rarity_4") addR4++;
                else if (pulledCard.cardRarityType === "rarity_birthday") addBd++;
                else if (pulledCard.cardRarityType === "rarity_3") addR3++;
                else addR2++;

                if (minGuaranteeLevel > 0 && getRarityLevel(pulledCard.cardRarityType) < minGuaranteeLevel) {
                    noGuaranteeCount++;
                }
            }

            if (pulledCards.length === 0) return;

            let startSpinCount = 0;
            setStats((prev) => {
                startSpinCount = prev.spinCount;
                return {
                    spinCount: prev.spinCount + pulledCards.length,
                    pickupCount: prev.pickupCount + addPickup,
                    rarity4Count: prev.rarity4Count + addR4,
                    birthdayCount: prev.birthdayCount + addBd,
                    rarity3Count: prev.rarity3Count + addR3,
                    rarity2Count: prev.rarity2Count + addR2,
                };
            });

            setRecentPullCardIds(pulledCards.slice(-10).map((c) => c.id));

            setHistoryHighRarity((prev) => {
                const newItems: HistoryItem[] = [];
                pulledCards.forEach((card, idx) => {
                    if (card.cardRarityType === "rarity_4" || card.cardRarityType === "rarity_birthday") {
                        newItems.push({
                            cardId: card.id,
                            pullIndex: startSpinCount + idx + 1,
                        });
                    }
                });
                if (newItems.length === 0) return prev;
                return [...newItems.reverse(), ...prev];
            });

            // 3D Stage presentation for 1~10 pulls
            if (
                stage3dEnabled &&
                pulledCards.length > 0 &&
                pulledCards.length <= SEKAI_GACHA_MAX_CARDS &&
                pulledCards.every((c) => isSekaiGachaCard(c))
            ) {
                setLastSpinCount(spinCount);
                setStageRequest((previous) => ({
                    id: (previous?.id ?? 0) + 1,
                    cards: pulledCards.map((card) => ({
                        card,
                        trained:
                            getCardDefaultTrainedStatus(card) ||
                            (useTrainedThumbnail &&
                                isTrainableCard(card) &&
                                card.cardRarityType !== "rarity_birthday"),
                        pickup: pickupSet.has(card.id),
                    })),
                }));
                setStageOpen(true);
            }
        },
        [
            activePoolCards.length,
            rate4Star,
            rateBirthday,
            rate3Star,
            rate2Star,
            poolByRarity,
            pickupCardIds,
            guaranteeMode,
            stage3dEnabled,
            useTrainedThumbnail,
        ]
    );

    const fallbackVisualGacha = selectedGacha || allGachas[0];
    const stageLogoUrl = fallbackVisualGacha
        ? getGachaLogoUrl(fallbackVisualGacha.assetbundleName, assetSource)
        : "";
    const stageBgUrl = fallbackVisualGacha
        ? getGachaScreenUrl(fallbackVisualGacha.assetbundleName, fallbackVisualGacha.id, assetSource)
        : "";
    const stageTitle = selectedGacha ? selectedGacha.name : t("page.gachaSimulator.diyStageTitle");

    if (isLoading) {
        return (
            <PageContainer>
                <LoadingState label={t("common.state.loading")} />
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <PageHeader
                eyebrow={t("page.gachaSimulator.badge")}
                title={t("page.gachaSimulator.title")}
                highlight={t("page.gachaSimulator.titleHighlight")}
                description={t("page.gachaSimulator.description")}
            />

            {error && (
                <ErrorState
                    className="mb-6"
                    title={t("common.state.loadingFailed")}
                    message={error}
                    retryLabel={t("common.action.retry")}
                />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* LEFT COLUMN: Gacha Selector, Summary & Pickup Cards */}
                <div className="space-y-6 min-w-0">
                    {/* 1. Base Gacha Selector */}
                    <SectionCard
                        icon={mdCasino}
                        title={t("page.gachaSimulator.baseGachaSection")}
                        bodyClassName="space-y-3"
                        actions={
                            selectedGacha ? (
                                <Button
                                    href={`/gacha/${selectedGacha.id}`}
                                    variant="text"
                                    size="xs"
                                    icon={mdOpenInNew}
                                >
                                    {t("page.gachaSimulator.viewGachaDetail")}
                                </Button>
                            ) : undefined
                        }
                    >
                        <p className="type-body-s text-on-surface-variant">
                            {t("page.gachaSimulator.baseGachaHint")}
                        </p>
                        <GachaSelector
                            selectedGachaId={selectedGachaId}
                            gachas={allGachas}
                            cards={enrichedCards}
                            onSelect={(gacha) => applyGachaConfig(gacha)}
                        />
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                                variant="filled"
                                size="s"
                                icon={mdTune}
                                onClick={() => setIsAdvancedModalOpen(true)}
                            >
                                {t("page.gachaSimulator.advancedSettings")}
                            </Button>
                            <Button
                                variant="tonal"
                                size="s"
                                icon={mdGridView}
                                onClick={() => setIsViewPoolModalOpen(true)}
                            >
                                {t("page.gachaSimulator.viewActivePool", { count: activePoolCards.length })}
                            </Button>
                            {selectedGacha && (
                                <Button
                                    variant="outlined"
                                    size="s"
                                    icon={mdRefresh}
                                    onClick={() => applyGachaConfig(selectedGacha)}
                                >
                                    {t("page.gachaSimulator.restoreGachaDefault")}
                                </Button>
                            )}
                        </div>
                    </SectionCard>

                    {/* 2. Current Rates & Rules Summary (Read-only summary, click Advanced Settings to edit) */}
                    <SectionCard
                        icon={mdBarChart}
                        title={t("page.gacha.ratesTitle")}
                        bodyClassName="p-0 pb-1"
                        actions={
                            <Button
                                variant="tonal"
                                size="xs"
                                icon={mdTune}
                                onClick={() => setIsAdvancedModalOpen(true)}
                            >
                                {t("page.gachaSimulator.advancedSettings")}
                            </Button>
                        }
                    >
                        <div className="divide-y divide-outline-variant">
                            <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2 type-body-m">
                                <span className="text-on-surface-variant">4★</span>
                                <div className="flex items-center gap-2">
                                    {pickupCards.length > 0 && (
                                        <span className="type-label-s bg-tertiary-container text-on-tertiary-container px-2 py-0.5 rounded-md3-xs font-mono">
                                            {t("page.gacha.upLabel")}: {singlePickupRate}% × {pickupCards.length}
                                        </span>
                                    )}
                                    <span className="text-primary font-medium font-mono">{rate4Star}%</span>
                                </div>
                            </div>
                            {(rateBirthday > 0 || poolByRarity.rarity_birthday.length > 0) && (
                                <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2 type-body-m">
                                    <span className="text-on-surface-variant">{t("page.gacha.birthdayLabel")}</span>
                                    <span className="text-primary font-medium font-mono">{rateBirthday}%</span>
                                </div>
                            )}
                            <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2 type-body-m">
                                <span className="text-on-surface-variant">3★</span>
                                <span className="text-primary font-medium font-mono">{rate3Star}%</span>
                            </div>
                            <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2 type-body-m">
                                <span className="text-on-surface-variant">2★</span>
                                <span className="text-primary font-medium font-mono">{rate2Star}%</span>
                            </div>
                            <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2 type-body-m">
                                <span className="text-on-surface-variant">{t("page.gachaSimulator.guaranteeLabel")}</span>
                                <span className="text-on-surface font-medium type-body-s">
                                    {guaranteeMode === "over_rarity_3_once"
                                        ? t("page.gachaSimulator.guarantee.rarity3")
                                        : guaranteeMode === "over_rarity_4_once"
                                          ? t("page.gachaSimulator.guarantee.rarity4")
                                          : t("page.gachaSimulator.guarantee.none")}
                                </span>
                            </div>
                            <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2 type-body-m">
                                <span className="text-on-surface-variant">{t("page.gachaSimulator.poolModeLabel")}</span>
                                <div className="flex flex-wrap items-center gap-1.5 type-body-s">
                                    <span className="text-on-surface font-medium">
                                        {poolMode === "gacha"
                                            ? t("page.gachaSimulator.poolModes.gacha")
                                            : t("page.gachaSimulator.poolModes.filter")}
                                    </span>
                                    {(addedCardIds.length > 0 || removedCardIds.length > 0) && (
                                        <span className="type-label-s bg-primary-container text-on-primary-container px-1.5 py-0.5 rounded-md3-xs font-mono">
                                            +{addedCardIds.length} / -{removedCardIds.length}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </SectionCard>

                    {/* 3. Pickup (UP) Cards */}
                    <SectionCard
                        icon={mdKidStar}
                        title={t("page.gacha.pickupCardsTitle", { count: pickupCards.length })}
                        bodyClassName="space-y-3"
                        actions={
                            <Button
                                variant="tonal"
                                size="xs"
                                icon={mdAdd}
                                onClick={() => setIsPickupModalOpen(true)}
                            >
                                {t("page.gachaSimulator.editPickups")}
                            </Button>
                        }
                    >
                        {pickupCards.length === 0 ? (
                            <div className="rounded-md3-lg bg-surface-container p-5 text-center type-body-m text-on-surface-variant">
                                {t("page.gachaSimulator.noPickupsHint")}
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                                    {pickupCards.map((card) => {
                                        const showTrained =
                                            getCardDefaultTrainedStatus(card) ||
                                            (useTrainedThumbnail &&
                                                isTrainableCard(card) &&
                                                card.cardRarityType !== "rarity_birthday");
                                        const pullCount = historyHighRarity.filter((h) => h.cardId === card.id).length;
                                        const isPulled = pullCount > 0;

                                        return (
                                            <div key={card.id} className="relative group">
                                                <Link
                                                    href={`/cards/${card.id}`}
                                                    className="block rounded-md3-sm focus-ring"
                                                >
                                                    <div
                                                        className={`${CARD_TILE_BASE} ${
                                                            isPulled ? "ring-2 ring-primary" : CARD_TILE_IDLE
                                                        }`}
                                                    >
                                                        <SekaiCardThumbnail
                                                            card={card}
                                                            trained={showTrained}
                                                            className="w-full"
                                                        />
                                                        {isPulled && <PulledBadge count={pullCount} />}
                                                    </div>
                                                </Link>
                                                <button
                                                    type="button"
                                                    title={t("common.md3.clear")}
                                                    onClick={() =>
                                                        setPickupCardIds((prev) => prev.filter((id) => id !== card.id))
                                                    }
                                                    className="absolute -top-1.5 -right-1.5 z-10 size-5 rounded-full bg-error text-on-error shadow-elev-1 flex items-center justify-center opacity-85 hover:opacity-100"
                                                >
                                                    <Icon path={mdClose} size={13} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex justify-end pt-1">
                                    <Button
                                        variant="text"
                                        size="xs"
                                        icon={mdDelete}
                                        onClick={() => setPickupCardIds([])}
                                    >
                                        {t("page.gachaSimulator.clearPickups")}
                                    </Button>
                                </div>
                            </>
                        )}
                    </SectionCard>
                </div>

                {/* RIGHT COLUMN: Simulator & Results */}
                <div className="space-y-6 min-w-0 lg:sticky lg:top-24">
                    <SectionCard
                        icon={mdCasino}
                        title={t("page.gacha.simulatorTitle")}
                        bodyClassName="flex flex-col gap-5"
                        actions={
                            <Button
                                variant="tonal"
                                size="xs"
                                icon={mdTune}
                                onClick={() => setIsAdvancedModalOpen(true)}
                            >
                                {t("page.gachaSimulator.advancedSettings")}
                            </Button>
                        }
                    >
                        {/* 3D Presentation Toggle */}
                        <div className="flex w-full items-center gap-3 rounded-md3-lg bg-surface-container px-4 py-3">
                            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
                                <Icon path={mdViewInAr} size={22} />
                            </span>
                            <Switch
                                checked={stage3dEnabled}
                                onCheckedChange={changeStage3d}
                                label={<span className="type-title-s">{t("page.gacha.stage3d.toggle")}</span>}
                                description={<span className="type-body-s">{t("page.gacha.stage3d.toggleHint")}</span>}
                                className="min-w-0 flex-1"
                            />
                        </div>

                        {/* Pull Buttons */}
                        <div className="flex flex-wrap gap-2.5 justify-center w-full">
                            <Button
                                variant="filled"
                                size="m"
                                icon={stage3dEnabled ? mdViewInAr : undefined}
                                onClick={() => spin(1)}
                                disabled={activePoolCards.length === 0}
                                className="flex-1"
                            >
                                {t("page.gacha.spinSingle")}
                            </Button>
                            <Button
                                variant="filled"
                                size="m"
                                icon={stage3dEnabled ? mdViewInAr : undefined}
                                onClick={() => spin(10)}
                                disabled={activePoolCards.length === 0}
                                className="flex-1"
                            >
                                {t("page.gacha.spinMulti", { count: 10 })}
                            </Button>
                            <Button
                                variant="tonal"
                                size="m"
                                onClick={() => spin(100)}
                                disabled={activePoolCards.length === 0}
                                className="flex-1"
                            >
                                {t("page.gacha.spinMulti", { count: 100 })}
                            </Button>

                            {/* Custom Spin Count Input */}
                            <div className="flex items-center gap-2 bg-surface-container-high rounded-full p-1 pl-4 w-full justify-between">
                                <span className="type-label-l text-on-surface-variant whitespace-nowrap">
                                    {t("page.gacha.customSpinCountLabel")}
                                </span>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={customSpinCount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === "" || (parseInt(val, 10) >= 1 && parseInt(val, 10) <= 1000)) {
                                            setCustomSpinCount(val);
                                        }
                                    }}
                                    className="w-20 bg-transparent type-title-s text-on-surface outline-none text-center font-mono"
                                    placeholder="1~1000"
                                />
                                <IconButton
                                    variant="filled"
                                    icon={mdPlayArrowFill}
                                    label={t("page.gacha.customSpinCountLabel")}
                                    onClick={() => {
                                        const count = parseInt(customSpinCount, 10);
                                        if (count && count > 0 && count <= 1000) {
                                            spin(count);
                                        }
                                    }}
                                    disabled={!customSpinCount || activePoolCards.length === 0}
                                />
                            </div>
                        </div>

                        {/* Total Pulls & Reset */}
                        <div className="flex items-center justify-between w-full px-1">
                            <div className="type-label-l text-on-surface-variant">
                                {t("page.gacha.totalSpinCount")}{" "}
                                <span className="type-title-l text-on-surface ml-1 font-mono">{stats.spinCount}</span>
                            </div>
                            <Button variant="text" size="xs" onClick={resetStats}>
                                {t("page.gacha.resetData")}
                            </Button>
                        </div>

                        <div className="h-px bg-outline-variant w-full" />

                        {/* Statistics Table */}
                        <div className="overflow-hidden rounded-md3-md border border-outline-variant">
                            <table className="w-full type-body-m">
                                <thead>
                                    <tr className="bg-surface-container border-b border-outline-variant">
                                        <th className="text-left py-2 px-3 type-title-s text-on-surface-variant">
                                            {t("page.gacha.thRarity")}
                                        </th>
                                        <th className="text-center py-2 px-3 type-title-s text-on-surface-variant">
                                            {t("page.gacha.thCount")}
                                        </th>
                                        <th className="text-center py-2 px-3 type-title-s text-on-surface-variant">
                                            {t("page.gacha.thProbability")}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* UP Row */}
                                    <tr className="border-b border-outline-variant bg-tertiary-container/40">
                                        <td className="py-2 px-3 font-medium text-tertiary flex items-center gap-1">
                                            <span className="bg-tertiary text-on-tertiary type-label-s px-1 rounded-md3-xs">
                                                {t("page.gacha.upLabel")}
                                            </span>
                                            {t("page.gacha.memberLabel")}
                                        </td>
                                        <td className="text-center py-2 px-3 text-on-surface-variant font-mono">
                                            {stats.pickupCount}
                                        </td>
                                        <td className="text-center py-2 px-3 text-tertiary font-medium font-mono">
                                            {stats.spinCount > 0
                                                ? ((stats.pickupCount / stats.spinCount) * 100).toFixed(2)
                                                : "0.00"}
                                            %
                                        </td>
                                    </tr>
                                    <StatRow
                                        label="4★"
                                        count={stats.rarity4Count}
                                        spinCount={stats.spinCount}
                                    />
                                    {(rateBirthday > 0 || stats.birthdayCount > 0) && (
                                        <StatRow
                                            label={t("page.gacha.birthdayLabel")}
                                            count={stats.birthdayCount}
                                            spinCount={stats.spinCount}
                                        />
                                    )}
                                    <StatRow
                                        label="3★"
                                        count={stats.rarity3Count}
                                        spinCount={stats.spinCount}
                                    />
                                    <StatRow
                                        label="2★"
                                        count={stats.rarity2Count}
                                        spinCount={stats.spinCount}
                                    />
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>

                    {/* Recent Results */}
                    {recentPullCardIds.length > 0 && (
                        <SectionCard
                            icon={mdWandStars}
                            title={t("page.gacha.recentResultsTitle")}
                            bodyClassName="p-4 pt-3"
                        >
                            <div className="grid grid-cols-5 gap-2">
                                {recentPullCardIds.map((cardId, idx) => {
                                    const card = cardMap.get(cardId);
                                    if (!card) return null;
                                    const showTrained =
                                        getCardDefaultTrainedStatus(card) ||
                                        (useTrainedThumbnail &&
                                            isTrainableCard(card) &&
                                            card.cardRarityType !== "rarity_birthday");
                                    const isPickup = pickupCardIds.includes(card.id);
                                    const is4Star =
                                        card.cardRarityType === "rarity_4" ||
                                        card.cardRarityType === "rarity_birthday";

                                    return (
                                        <Link
                                            key={`${cardId}-${idx}`}
                                            href={`/cards/${card.id}`}
                                            className="group block rounded-md3-sm focus-ring"
                                        >
                                            <div
                                                className={`${CARD_TILE_BASE} ${
                                                    isPickup
                                                        ? "ring-2 ring-tertiary"
                                                        : is4Star
                                                          ? "ring-2 ring-yellow-400"
                                                          : CARD_TILE_IDLE
                                                }`}
                                            >
                                                <SekaiCardThumbnail
                                                    card={card}
                                                    trained={showTrained}
                                                    className="w-full"
                                                />
                                                {(isPickup || is4Star) && (
                                                    <div
                                                        className={`text-center type-label-s py-0.5 leading-none ${
                                                            isPickup
                                                                ? "bg-tertiary text-on-tertiary"
                                                                : "bg-yellow-400 text-black/80"
                                                        }`}
                                                    >
                                                        {isPickup
                                                            ? t("page.gacha.upLabel")
                                                            : t("page.gacha.star4Label")}
                                                    </div>
                                                )}
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        </SectionCard>
                    )}

                    {/* History 4★ / Birthday Results */}
                    {historyHighRarity.length > 0 && (
                        <SectionCard
                            icon={mdStarFill}
                            title={t("page.gacha.history4StarsTitle")}
                            bodyClassName="p-4 pt-3"
                        >
                            <div className="grid grid-cols-5 gap-2 max-h-96 overflow-y-auto pr-1">
                                {historyHighRarity.map((item, idx) => {
                                    const card = cardMap.get(item.cardId);
                                    if (!card) return null;
                                    const showTrained =
                                        getCardDefaultTrainedStatus(card) ||
                                        (useTrainedThumbnail &&
                                            isTrainableCard(card) &&
                                            card.cardRarityType !== "rarity_birthday");
                                    const isPickup = pickupCardIds.includes(card.id);
                                    const olderItem = historyHighRarity[idx + 1];
                                    const prevPullIndex = olderItem ? olderItem.pullIndex : 0;
                                    const pityCount = item.pullIndex - prevPullIndex;
                                    const pityColorClass =
                                        pityCount <= 50
                                            ? "bg-green-600 text-white"
                                            : pityCount >= 100
                                              ? "bg-error text-on-error"
                                              : "bg-primary text-on-primary";

                                    return (
                                        <Link
                                            key={`${item.cardId}-${item.pullIndex}-${idx}`}
                                            href={`/cards/${card.id}`}
                                            className="group block rounded-md3-sm focus-ring"
                                        >
                                            <div
                                                className={`${CARD_TILE_BASE} ${
                                                    isPickup ? "ring-2 ring-tertiary" : "ring-2 ring-yellow-400"
                                                }`}
                                            >
                                                <SekaiCardThumbnail
                                                    card={card}
                                                    trained={showTrained}
                                                    className="w-full"
                                                />
                                                <div
                                                    className={`flex items-center justify-between type-label-s py-0.5 px-1 leading-none ${
                                                        isPickup
                                                            ? "bg-tertiary text-on-tertiary"
                                                            : "bg-yellow-400 text-black/80"
                                                    }`}
                                                >
                                                    <span>
                                                        {isPickup
                                                            ? t("page.gacha.upLabel")
                                                            : t("page.gacha.star4Label")}
                                                    </span>
                                                    {pityCount > 0 && (
                                                        <span
                                                            className={`px-1 py-0.5 rounded-md3-xs text-[9px] font-bold ${pityColorClass}`}
                                                        >
                                                            {t("page.gacha.pityPull", { count: pityCount })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        </SectionCard>
                    )}
                </div>
            </div>

            {/* 3D Gacha Stage */}
            {stage3dEnabled && stageRequest && (
                <GachaStage3d
                    request={stageRequest}
                    open={stageOpen}
                    onClose={() => setStageOpen(false)}
                    onAgain={() => spin(lastSpinCount)}
                    againLabel={
                        lastSpinCount === 1
                            ? t("page.gacha.spinSingle")
                            : t("page.gacha.spinMulti", { count: lastSpinCount })
                    }
                    title={stageTitle}
                    logoUrl={stageLogoUrl}
                    backdropUrl={stageBgUrl}
                />
            )}

            {/* Advanced Settings Modal (Rates, Guarantee, Pickup & Pool Customization) */}
            <Modal
                isOpen={isAdvancedModalOpen}
                onClose={() => setIsAdvancedModalOpen(false)}
                title={t("page.gachaSimulator.advancedSettings")}
                size="lg"
                syncHistory={false}
                headerActions={
                    selectedGacha ? (
                        <Button
                            variant="text"
                            size="xs"
                            icon={mdRefresh}
                            onClick={() => applyGachaConfig(selectedGacha)}
                        >
                            {t("page.gachaSimulator.restoreGachaDefault")}
                        </Button>
                    ) : undefined
                }
            >
                <div className="space-y-6">
                    {/* Section 1: Rarity Rates & Presets */}
                    <div className="space-y-3.5">
                        <h3 className="type-title-s text-on-surface flex items-center gap-2">
                            <Icon path={mdTune} size={18} className="text-primary" />
                            {t("page.gachaSimulator.ratesSection")}
                        </h3>

                        {/* Presets */}
                        <div>
                            <div className="type-label-m text-on-surface-variant mb-2">
                                {t("page.gachaSimulator.presetsLabel")}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {selectedGacha && (
                                    <button
                                        type="button"
                                        onClick={() => applyGachaConfig(selectedGacha)}
                                        className={getFilterChipStateClasses(false)}
                                    >
                                        {t("page.gachaSimulator.presets.gachaDefault")}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRate4Star(3.0);
                                        setRateBirthday(0.0);
                                        setRate3Star(8.5);
                                        setRate2Star(88.5);
                                        setSinglePickupRate(0.4);
                                        setGuaranteeMode("over_rarity_3_once");
                                    }}
                                    className={getFilterChipStateClasses(
                                        rate4Star === 3.0 && rateBirthday === 0 && rate3Star === 8.5 && singlePickupRate === 0.4
                                    )}
                                >
                                    {t("page.gachaSimulator.presets.normal3")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRate4Star(6.0);
                                        setRateBirthday(0.0);
                                        setRate3Star(8.5);
                                        setRate2Star(85.5);
                                        setSinglePickupRate(0.4);
                                        setGuaranteeMode("over_rarity_3_once");
                                    }}
                                    className={getFilterChipStateClasses(
                                        rate4Star === 6.0 && rateBirthday === 0 && rate3Star === 8.5
                                    )}
                                >
                                    {t("page.gachaSimulator.presets.fes6")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRate4Star(0.0);
                                        setRateBirthday(3.0);
                                        setRate3Star(8.5);
                                        setRate2Star(88.5);
                                        setSinglePickupRate(3.0);
                                        setGuaranteeMode("over_rarity_3_once");
                                    }}
                                    className={getFilterChipStateClasses(
                                        rate4Star === 0 && rateBirthday === 3.0 && rate3Star === 8.5
                                    )}
                                >
                                    {t("page.gachaSimulator.presets.birthday3")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRate4Star(100.0);
                                        setRateBirthday(0.0);
                                        setRate3Star(0.0);
                                        setRate2Star(0.0);
                                        setSinglePickupRate(20.0);
                                        setGuaranteeMode("over_rarity_4_once");
                                    }}
                                    className={getFilterChipStateClasses(rate4Star === 100.0)}
                                >
                                    {t("page.gachaSimulator.presets.all4Star")}
                                </button>
                            </div>
                        </div>

                        {/* Rate Inputs Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <RateInputBox
                                label="4★ (%)"
                                value={rate4Star}
                                onChange={setRate4Star}
                            />
                            <RateInputBox
                                label={`${t("page.gacha.birthdayLabel")} (%)`}
                                value={rateBirthday}
                                onChange={setRateBirthday}
                            />
                            <RateInputBox
                                label="3★ (%)"
                                value={rate3Star}
                                onChange={setRate3Star}
                            />
                            <RateInputBox
                                label="2★ (%)"
                                value={rate2Star}
                                onChange={setRate2Star}
                            />
                            <RateInputBox
                                label={t("page.gachaSimulator.singleUpRateLabel")}
                                value={singlePickupRate}
                                onChange={setSinglePickupRate}
                                highlight
                            />
                        </div>

                        {/* Rate Sum & Auto-Balance Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md3-md bg-surface-container px-3.5 py-2.5 type-body-s">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-on-surface-variant">
                                    {t("page.gachaSimulator.totalRateSumLabel")}{" "}
                                    <strong
                                        className={
                                            Math.abs(totalRateSum - 100) < 0.01
                                                ? "text-primary font-mono"
                                                : "text-tertiary font-mono"
                                        }
                                    >
                                        {totalRateSum}%
                                    </strong>
                                </span>
                                <span className="text-on-surface-variant">
                                    {t("page.gachaSimulator.totalUpRateLabel")}{" "}
                                    <strong className="text-tertiary font-mono">
                                        {effectivePickupTotalRate}%
                                    </strong>{" "}
                                    ({pickupCards.length} {t("page.cards.countUnit")})
                                </span>
                            </div>
                            {Math.abs(totalRateSum - 100) >= 0.01 && (
                                <Button variant="tonal" size="xs" onClick={autoBalance2Star}>
                                    {t("page.gachaSimulator.autoBalance2Star")}
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="h-px bg-outline-variant" />

                    {/* Section 2: 10-Pull Guarantee Mode */}
                    <div className="space-y-2.5">
                        <div className="type-title-s text-on-surface">
                            {t("page.gachaSimulator.guaranteeLabel")}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(
                                [
                                    { value: "over_rarity_3_once", label: t("page.gachaSimulator.guarantee.rarity3") },
                                    { value: "over_rarity_4_once", label: t("page.gachaSimulator.guarantee.rarity4") },
                                    { value: "none", label: t("page.gachaSimulator.guarantee.none") },
                                ] as const
                            ).map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setGuaranteeMode(option.value)}
                                    className={getFilterChipStateClasses(guaranteeMode === option.value)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="h-px bg-outline-variant" />

                    {/* Section 3: Pickup (UP) Cards */}
                    <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="type-title-s text-on-surface flex items-center gap-1.5">
                                <Icon path={mdKidStar} size={18} className="text-primary" />
                                {t("page.gacha.pickupCardsTitle", { count: pickupCards.length })}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {pickupCards.length > 0 && (
                                    <Button
                                        variant="text"
                                        size="xs"
                                        icon={mdDelete}
                                        onClick={() => setPickupCardIds([])}
                                    >
                                        {t("page.gachaSimulator.clearPickups")}
                                    </Button>
                                )}
                                <Button
                                    variant="filled"
                                    size="xs"
                                    icon={mdAdd}
                                    onClick={() => setIsPickupModalOpen(true)}
                                >
                                    {t("page.gachaSimulator.editPickups")}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-outline-variant" />

                    {/* Section 4: Appearing Card Pool Configuration */}
                    <div className="space-y-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="type-title-s text-on-surface flex items-center gap-2">
                                <Icon path={mdGridView} size={18} className="text-primary" />
                                {t("page.gachaSimulator.poolSection", { count: activePoolCards.length })}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="tonal"
                                    size="xs"
                                    icon={mdGridView}
                                    onClick={() => setIsViewPoolModalOpen(true)}
                                >
                                    {t("page.gachaSimulator.viewActivePool", { count: activePoolCards.length })}
                                </Button>
                                <Button
                                    variant="outlined"
                                    size="xs"
                                    icon={mdAdd}
                                    onClick={() => setIsEditAllPoolModalOpen(true)}
                                >
                                    {t("page.gachaSimulator.editPoolCards")}
                                </Button>
                            </div>
                        </div>

                        {/* Pool Source Mode Chips */}
                        <div>
                            <div className="type-label-m text-on-surface-variant mb-2">
                                {t("page.gachaSimulator.poolModeLabel")}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={!selectedGacha}
                                    onClick={() => {
                                        setPoolMode("gacha");
                                        setAddedCardIds([]);
                                        setRemovedCardIds([]);
                                    }}
                                    className={getFilterChipStateClasses(poolMode === "gacha")}
                                >
                                    {t("page.gachaSimulator.poolModes.gacha")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPoolMode("filter");
                                        setAddedCardIds([]);
                                        setRemovedCardIds([]);
                                    }}
                                    className={getFilterChipStateClasses(poolMode === "filter")}
                                >
                                    {t("page.gachaSimulator.poolModes.filter")}
                                </button>
                            </div>
                        </div>

                        {/* Filter Rules when in "filter" mode */}
                        {poolMode === "filter" && (
                            <div className="space-y-4 rounded-md3-lg bg-surface-container p-3.5">
                                <FilterSection label={t("common.filter.cardType")}>
                                    <div className="flex flex-wrap gap-2">
                                        {supplyTypes.map((st) => {
                                            const isSelected = selectedSupplyTypes.includes(st.type);
                                            return (
                                                <button
                                                    key={st.type}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedSupplyTypes((prev) =>
                                                            prev.includes(st.type)
                                                                ? prev.filter((item) => item !== st.type)
                                                                : [...prev, st.type]
                                                        );
                                                    }}
                                                    className={getFilterChipStateClasses(isSelected)}
                                                >
                                                    {t(`common.cardSupplyTypes.${st.type}`)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </FilterSection>

                                <FilterSection label={t("common.filter.attribute")}>
                                    <div className="flex flex-wrap gap-2">
                                        {ATTRIBUTES.map((attr) => {
                                            const isSelected = selectedPoolAttrs.includes(attr);
                                            return (
                                                <button
                                                    key={attr}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedPoolAttrs((prev) =>
                                                            prev.includes(attr)
                                                                ? prev.filter((a) => a !== attr)
                                                                : [...prev, attr]
                                                        )
                                                    }
                                                    className={`!p-1.5 ${getFilterIconStateClasses(isSelected)}`}
                                                    title={ATTR_NAMES[attr]}
                                                >
                                                    <div className="w-6 h-6 relative">
                                                        <Image
                                                            src={`/data/icon/${ATTR_ICON_PATHS[attr]}`}
                                                            alt={ATTR_NAMES[attr]}
                                                            fill
                                                            className="object-contain"
                                                            unoptimized
                                                        />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </FilterSection>

                                <CharacterFilter
                                    selectedCharacters={selectedPoolChars}
                                    onCharacterChange={setSelectedPoolChars}
                                    selectedUnitIds={selectedPoolUnitIds}
                                    onUnitIdsChange={setSelectedPoolUnitIds}
                                />
                            </div>
                        )}

                        {/* Pool Breakdown by Rarity */}
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md3-md bg-surface-container px-3.5 py-2.5 type-label-m">
                            <div className="flex flex-wrap items-center gap-3 text-on-surface-variant">
                                <span>
                                    4★: <strong className="text-on-surface font-mono">{poolByRarity.rarity_4.length}</strong>
                                </span>
                                <span>
                                    {t("page.gacha.birthdayLabel")}:{" "}
                                    <strong className="text-on-surface font-mono">{poolByRarity.rarity_birthday.length}</strong>
                                </span>
                                <span>
                                    3★: <strong className="text-on-surface font-mono">{poolByRarity.rarity_3.length}</strong>
                                </span>
                                <span>
                                    2★: <strong className="text-on-surface font-mono">{poolByRarity.rarity_2.length}</strong>
                                </span>
                            </div>

                            {(addedCardIds.length > 0 || removedCardIds.length > 0) && (
                                <div className="flex items-center gap-2">
                                    <span className="type-label-s text-primary font-mono">
                                        +{addedCardIds.length} / -{removedCardIds.length}
                                    </span>
                                    <Button
                                        variant="text"
                                        size="xs"
                                        onClick={() => {
                                            setAddedCardIds([]);
                                            setRemovedCardIds([]);
                                        }}
                                    >
                                        {t("page.gachaSimulator.resetManualPoolOverrides")}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="flex justify-end pt-2 border-t border-outline-variant">
                        <Button variant="filled" size="m" onClick={() => setIsAdvancedModalOpen(false)}>
                            {t("common.action.confirm")}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Modal 1: Select Pickup (UP) Cards */}
            <CardSelectorModal
                isOpen={isPickupModalOpen}
                onClose={() => setIsPickupModalOpen(false)}
                title={t("page.gachaSimulator.editPickupsModalTitle", { count: pickupCardIds.length })}
                cards={allGachaEligibleCards}
                pickupCardIds={pickupCardIds}
                selectedCardIds={pickupCardIds}
                selectionLabel={t("page.gacha.upLabel")}
                onToggleCardSelect={(card) => {
                    setPickupCardIds((prev) =>
                        prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [...prev, card.id]
                    );
                }}
                onSelectCards={(cardsToAdd) => {
                    const addIds = cardsToAdd.map((c) => c.id);
                    setPickupCardIds((prev) => Array.from(new Set([...prev, ...addIds])));
                }}
                onClearCards={() => setPickupCardIds([])}
            />

            {/* Modal 2: View Active Pool with Real-Time Draw Rates */}
            <CardSelectorModal
                isOpen={isViewPoolModalOpen}
                onClose={() => setIsViewPoolModalOpen(false)}
                title={t("page.gacha.cardPoolTitle", { count: activePoolCards.length })}
                cards={activePoolCards}
                gachaDetails={syntheticGachaDetails}
                pickupCardIds={pickupCardIds}
                rarityRates={{
                    rarity_4: rate4Star,
                    rarity_birthday: rateBirthday,
                    rarity_3: rate3Star,
                    rarity_2: rate2Star,
                }}
            />

            {/* Modal 3: Add / Remove Cards from All Eligible Cards into Active Pool */}
            <CardSelectorModal
                isOpen={isEditAllPoolModalOpen}
                onClose={() => setIsEditAllPoolModalOpen(false)}
                title={t("page.gachaSimulator.editPoolModalTitle", { count: activePoolCardIds.length })}
                cards={allGachaEligibleCards}
                gachaDetails={syntheticGachaDetails}
                pickupCardIds={pickupCardIds}
                rarityRates={{
                    rarity_4: rate4Star,
                    rarity_birthday: rateBirthday,
                    rarity_3: rate3Star,
                    rarity_2: rate2Star,
                }}
                selectedCardIds={activePoolCardIds}
                selectionLabel={t("page.gachaSimulator.poolSelectedLabel")}
                onToggleCardSelect={handleTogglePoolCard}
                onSelectCards={(cardsToAdd) => {
                    const addSet = new Set(cardsToAdd.map((c) => c.id));
                    setRemovedCardIds((prev) => prev.filter((id) => !addSet.has(id)));
                    setAddedCardIds((prev) => Array.from(new Set([...prev, ...addSet])));
                }}
                onClearCards={(cardsToRemove) => {
                    const removeSet = new Set(cardsToRemove.map((c) => c.id));
                    setPickupCardIds((prev) => prev.filter((id) => !removeSet.has(id)));
                    setAddedCardIds((prev) => prev.filter((id) => !removeSet.has(id)));
                    setRemovedCardIds((prev) => Array.from(new Set([...prev, ...removeSet])));
                }}
            />
        </PageContainer>
    );
}

function RateInputBox({
    label,
    value,
    onChange,
    highlight = false,
}: {
    label: string;
    value: number;
    onChange: (val: number) => void;
    highlight?: boolean;
}) {
    return (
        <label
            className={`flex flex-col gap-1 rounded-md3-md border p-2.5 ${
                highlight
                    ? "border-tertiary/50 bg-tertiary-container/25"
                    : "border-outline-variant bg-surface-container-low"
            }`}
        >
            <span className="type-label-m text-on-surface-variant">{label}</span>
            <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={value}
                onChange={(e) => {
                    const num = parseFloat(e.target.value);
                    onChange(Number.isNaN(num) ? 0 : Math.min(100, Math.max(0, num)));
                }}
                className="w-full bg-transparent type-title-m font-mono text-on-surface outline-none"
            />
        </label>
    );
}

function StatRow({ label, count, spinCount }: { label: string; count: number; spinCount: number }) {
    const pct = spinCount > 0 ? ((count / spinCount) * 100).toFixed(2) : "0.00";
    return (
        <tr className="border-b border-outline-variant last:border-0">
            <td className="py-2 px-3 font-medium text-on-surface">{label}</td>
            <td className="text-center py-2 px-3 text-on-surface-variant font-mono">{count}</td>
            <td className="text-center py-2 px-3 text-primary font-medium font-mono">{pct}%</td>
        </tr>
    );
}

function GachaSimulatorLoadingFallback() {
    const { t } = useI18n();
    return <LoadingState label={t("common.state.loading")} />;
}

export default function GachaSimulatorClient() {
    return (
        <MainLayout>
            <Suspense fallback={<GachaSimulatorLoadingFallback />}>
                <GachaSimulatorContent />
            </Suspense>
        </MainLayout>
    );
}
