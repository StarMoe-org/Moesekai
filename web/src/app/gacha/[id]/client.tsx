"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import Link from "@/components/LocalizedLink";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import DetailPageAdCard from "@/components/DetailPageAdCard";
import { ICardInfo, IGachaInfo, IGachaDetail, GACHA_TYPE_LABEL_KEYS, isTrainableCard, getCardDefaultTrainedStatus, IGachaBehavior, IGachaCardRarityRate, isWishGacha } from "@/types/types";
import { getGachaLogoUrl, getGachaScreenUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { fetchMasterData } from "@/lib/fetch";
import { TranslatedText } from "@/components/common/TranslatedText";
import ImagePreviewModal from "@/components/common/ImagePreviewModal";
import CardSelectorModal from "@/components/cards/CardSelectorModal";
import { useI18n } from "@/contexts/I18nContext";
import { getGachaInfoTranslation, loadGachaInfoTranslations, resolveGachaInfoText, type GachaInfoField, type GachaInfoTranslations } from "@/lib/gachaInfoTranslations";

// Gacha Simulator Types
interface GachaStatistic {
    counts: number[];
    spinCount: number;
    pickupCount: number;
}

interface HistoryItem extends IGachaDetail {
    pullIndex: number;
}

// Card rarity type to number mapping
const cardRarityTypeToRarity: Record<string, number> = {
    rarity_1: 1,
    rarity_2: 2,
    rarity_3: 3,
    rarity_4: 4,
    rarity_birthday: 4,
};

// ... (LOCAL_ATTR_ICONS definition remains here, if it was in the range. If not, I should be careful not to overwrite it if I didn't include it in Context. 
// Wait, I am replacing from line 17. The previous content shows LOCAL_ATTR_ICONS starts at line 35 (in original file, but line numbers shifted).
// Let's check the context from previous view_file output in Step 27/29.
// Step 27 added definitions.
// Step 29/31 showed state definitions.
// To be safe, I will target the GachaStatistic interface definition and the state definitions separately or verify lines.)

// Let me use `view_file` first to be absolutely sure of line numbers before I replace logic.


// Local attribute icon mapping
const _LOCAL_ATTR_ICONS: Record<string, string> = {
    cool: "/data/icon/Cool.webp",
    cute: "/data/icon/cute.webp",
    happy: "/data/icon/Happy.webp",
    mysterious: "/data/icon/Mysterious.webp",
    pure: "/data/icon/Pure.webp",
};

function buildCumulativeWeights(weights: number[]): number[] {
    const cumulative: number[] = [];
    let total = 0;

    for (const weight of weights) {
        total += weight;
        cumulative.push(total);
    }

    return cumulative;
}

function pickByWeight<T>(items: T[], getWeight: (item: T) => number): T | null {
    if (items.length === 0) return null;

    let totalWeight = 0;
    for (const item of items) {
        totalWeight += Math.max(0, getWeight(item));
    }

    if (totalWeight <= 0) return null;

    const roll = Math.random() * totalWeight;
    let accumulated = 0;

    for (const item of items) {
        accumulated += Math.max(0, getWeight(item));
        if (roll < accumulated) {
            return item;
        }
    }

    return items[items.length - 1] ?? null;
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

function isSelectableWishDetail(detail: IGachaDetail): boolean {
    return detail.gachaDetailWishType === "normal"
        || detail.gachaDetailWishType === "limited"
        || (!!detail.isWish && !detail.gachaDetailWishType);
}

export default function GachaDetailClient() {
    const { t, formatDate, locale } = useI18n();
    const _router = useRouter();    const params = useParams();
    const gachaId = params.id as string;
    const searchParams = useSearchParams();
    const isScreenshotMode = searchParams.get('mode') === 'screenshot';
    const [gacha, setGacha] = useState<IGachaInfo | null>(null);
    const [cards, setCards] = useState<ICardInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [activeImageTab, setActiveImageTab] = useState<"logo" | "bg">("logo");
    const [imageViewerOpen, setImageViewerOpen] = useState(false);
    const [customSpinCount, setCustomSpinCount] = useState<string>("");
    const [selectedWishCardIds, setSelectedWishCardIds] = useState<number[]>([]);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
    const [gachaInfoTranslations, setGachaInfoTranslations] = useState<{ locale: string; data: GachaInfoTranslations } | null>(null);
    const [originalGachaInfoFields, setOriginalGachaInfoFields] = useState<Partial<Record<GachaInfoField, boolean>>>({});
    const [isCardSelectorModalOpen, setIsCardSelectorModalOpen] = useState(false);
    const [isWishModalOpen, setIsWishModalOpen] = useState(false);
    const { useTrainedThumbnail, assetSource, useLLMTranslation } = useTheme();
    const { setDetailName } = useBreadcrumb();

    // Gacha Simulator states
    const [statistic, setStatistic] = useState<GachaStatistic>({
        counts: [],
        spinCount: 0,
        pickupCount: 0,
    });
    const [currentGachaResult, setCurrentGachaResult] = useState<IGachaDetail[]>([]);
    const [history4Stars, setHistory4Stars] = useState<HistoryItem[]>([]);
    const [gachaRarityRates, setGachaRarityRates] = useState<IGachaCardRarityRate[]>([]);
    const [_weights, setWeights] = useState<number[]>([]);
    const [normalRates, setNormalRates] = useState<number[]>([]);
    const [guaranteedRates, setGuaranteedRates] = useState<number[]>([]);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Set breadcrumb detail name
    useEffect(() => {
        if (gacha) setDetailName(gacha.name);
    }, [gacha, setDetailName]);

    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);

                const [gachasData, cardsData] = await Promise.all([
                    fetchMasterData<IGachaInfo[]>("gachas.json", true),
                    fetchMasterData<ICardInfo[]>("cards.json", true)
                ]);

                const gachaIdNum = parseInt(gachaId, 10);
                const foundGacha = gachasData.find(g => g.id === gachaIdNum);

                if (!foundGacha) {
                    throw new Error("Gacha not found");
                }

                setGacha(foundGacha);
                setCards(cardsData);
                document.title = `${foundGacha.name} - Moesekai`;
            } catch (err) {
                console.error("Error:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [gachaId]);

    const hasGachaInformationText = !!(gacha?.gachaInformation?.summary || gacha?.gachaInformation?.bubbleText || gacha?.gachaInformation?.description);

    useEffect(() => {
        if (!useLLMTranslation || !hasGachaInformationText) return;
        let active = true;
        loadGachaInfoTranslations(locale).then((data) => {
            if (active) setGachaInfoTranslations({ locale, data });
        });
        return () => {
            active = false;
        };
    }, [locale, useLLMTranslation, hasGachaInformationText]);

    const formatTimestamp = useCallback((timestamp: number) => {
        if (!mounted) return "...";
        return formatDate(timestamp, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }, [mounted, formatDate]);

    const isWishPickGacha = useMemo(() => {
        return gacha ? isWishGacha(gacha) : false;
    }, [gacha]);

    // Get pickup cards from the gachaPickups
    const pickupCards = useMemo(() => {
        if (!gacha) return [];
        const pickupCardIds = gacha.gachaPickups?.map(p => p.cardId) || [];
        return pickupCardIds
            .map(cardId => cards.find(c => c.id === cardId))
            .filter((c): c is ICardInfo => c !== undefined);
    }, [gacha, cards]);

    const cardMap = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]);

    const fixedWishCards = useMemo(() => {
        if (!gacha || !isWishPickGacha) return [] as ICardInfo[];
        return gacha.gachaDetails
            .filter(detail => detail.gachaDetailWishType === "fixed")
            .map(detail => cardMap.get(detail.cardId))
            .filter((card): card is ICardInfo => !!card && card.cardRarityType === "rarity_4");
    }, [gacha, isWishPickGacha, cardMap]);

    const wishCandidateCards = useMemo(() => {
        if (!gacha || !isWishPickGacha) return [] as ICardInfo[];
        const wishDetails = gacha.gachaDetails.filter(detail => {
            const card = cardMap.get(detail.cardId);
            return card?.cardRarityType === "rarity_4"
                && detail.gachaDetailWishType !== "fixed"
                && isSelectableWishDetail(detail);
        });

        return wishDetails
            .map(detail => cardMap.get(detail.cardId))
            .filter((card): card is ICardInfo => !!card);
    }, [gacha, isWishPickGacha, cardMap]);

    const selectedWishCards = useMemo(() => {
        if (!isWishPickGacha || selectedWishCardIds.length === 0) {
            return [] as ICardInfo[];
        }
        const selectedSet = new Set(selectedWishCardIds);
        return wishCandidateCards.filter(card => selectedSet.has(card.id));
    }, [isWishPickGacha, wishCandidateCards, selectedWishCardIds]);

    const activePickupCards = useMemo(() => {
        if (!isWishPickGacha) return pickupCards;
        return [...fixedWishCards, ...selectedWishCards];
    }, [isWishPickGacha, fixedWishCards, selectedWishCards, pickupCards]);

    const dreamPickSelectionLimit = useMemo(() => {
        if (!gacha) return 10;
        if (gacha.wishSelectCount && gacha.wishSelectCount > 0) {
            const fixedCount = gacha.gachaDetails.filter(
                detail => detail.gachaDetailWishType === "fixed"
            ).length;
            return Math.max(0, gacha.wishSelectCount - fixedCount);
        }
        if (gacha.wishFixedSelectCount && gacha.wishFixedSelectCount > 0) {
            return gacha.wishFixedSelectCount;
        }
        return wishCandidateCards.length > 0 ? Math.min(10, wishCandidateCards.length) : 10;
    }, [gacha, wishCandidateCards.length]);

    useEffect(() => {
        if (!isWishPickGacha || wishCandidateCards.length === 0) {
            setSelectedWishCardIds([]);
            return;
        }

        setSelectedWishCardIds(prev => {
            const validPrev = prev.filter(id => wishCandidateCards.some(card => card.id === id));
            return validPrev.slice(0, dreamPickSelectionLimit);
        });
    }, [isWishPickGacha, wishCandidateCards, dreamPickSelectionLimit]);

    // Process full card pool list with details and rate share calculation
    const fullCardPool = useMemo(() => {
        if (!gacha || !gacha.gachaDetails || cards.length === 0) return [];

        const pickupSet = new Set((gacha.gachaPickups || []).map(p => p.cardId));

        // Group details by cardRarityType to compute total weight per rarity
        const weightByRarity: Record<string, number> = {};
        gacha.gachaDetails.forEach(detail => {
            const card = cardMap.get(detail.cardId);
            if (!card) return;
            const rarity = card.cardRarityType;
            weightByRarity[rarity] = (weightByRarity[rarity] || 0) + (detail.weight || 1);
        });

        // Deduplicate card IDs while keeping detail info
        const detailByCardId = new Map<number, IGachaDetail>();
        gacha.gachaDetails.forEach(d => {
            if (!detailByCardId.has(d.cardId)) {
                detailByCardId.set(d.cardId, d);
            }
        });

        const items = Array.from(detailByCardId.values()).map(detail => {
            const card = cardMap.get(detail.cardId);
            if (!card) return null;

            const rarity = card.cardRarityType;
            const totalWeight = weightByRarity[rarity] || detail.weight || 1;
            const rateShare = totalWeight > 0 ? ((detail.weight || 1) / totalWeight) * 100 : 0;
            const isPickup = pickupSet.has(card.id);

            return {
                detail,
                card,
                rarity,
                isPickup,
                rateShare,
            };
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        // Sort: 4★ first, then Birthday, then 3★, then 2★; within same rarity: pickup first, then cardId descending
        const rarityOrder: Record<string, number> = {
            rarity_4: 4,
            rarity_birthday: 3.5,
            rarity_3: 3,
            rarity_2: 2,
            rarity_1: 1,
        };

        return items.sort((a, b) => {
            const rA = rarityOrder[a.rarity] || 0;
            const rB = rarityOrder[b.rarity] || 0;
            if (rA !== rB) return rB - rA;
            if (a.isPickup !== b.isPickup) return a.isPickup ? -1 : 1;
            return b.card.id - a.card.id;
        });
    }, [gacha, cards, cardMap]);

    const poolCards = useMemo(() => fullCardPool.map(item => item.card), [fullCardPool]);
    const pickupCardIds = useMemo(() => (gacha?.gachaPickups || []).map(p => p.cardId), [gacha]);

    // Get gacha status
    const getGachaStatus = () => {
        if (!gacha) return { label: "Unknown", color: "#888" };
        const now = Date.now();
        if (gacha.startAt > now) return { label: t("page.gacha.states.notStarted"), color: "#f59e0b" };
        if (gacha.endAt >= now) return { label: t("page.gacha.states.ongoing"), color: "#22c55e" };
        return { label: t("page.gacha.states.ended"), color: "#94a3b8" };
    };

    // Initialize gacha rates when gacha data is loaded
    useEffect(() => {
        if (gacha && gacha.gachaCardRarityRates) {
            const rates = [...gacha.gachaCardRarityRates]
                .sort((a, b) => b.rate - a.rate)
                .filter(rate => !!rate.rate);

            setGachaRarityRates(rates);
            setNormalRates(rates.map(rate => rate.rate));

            // Calculate guaranteed rates for 10-pull guarantee
            const sumRates = rates.reduce(
                (sum, curr) => [...sum, curr.rate + (sum.slice(-1)[0] || 0)],
                [] as number[]
            );

            if (gacha.gachaBehaviors.some(gb => gb.gachaBehaviorType === "over_rarity_3_once")) {
                const grs = rates.map(rate => rate.rate);
                const rarity3Idx = rates.findIndex(rate => rate.cardRarityType === "rarity_3");
                if (rarity3Idx !== -1) {
                    grs[rarity3Idx] = sumRates[rarity3Idx];
                    rates.forEach((rate, idx) => {
                        if (rate.cardRarityType !== "rarity_birthday" && cardRarityTypeToRarity[rate.cardRarityType] < 3) {
                            grs[idx] = 0;
                        }
                    });
                }
                setGuaranteedRates(grs);
            } else if (gacha.gachaBehaviors.some(gb => gb.gachaBehaviorType === "over_rarity_4_once")) {
                const grs = [...sumRates];
                const rarity4Idx = rates.findIndex(rate => rate.cardRarityType === "rarity_4");
                if (rarity4Idx !== -1) {
                    grs[rarity4Idx] = sumRates[rarity4Idx];
                    rates.forEach((rate, idx) => {
                        if (rate.cardRarityType !== "rarity_birthday" && cardRarityTypeToRarity[rate.cardRarityType] < 4) {
                            grs[idx] = 0;
                        }
                    });
                }
                setGuaranteedRates(grs);
            }

            // Initialize statistic counts
            setStatistic(stats => ({
                ...stats,
                counts: rates.map(() => 0),
            }));
        }
    }, [gacha]);

    const rateCardPools = useMemo(() => {
        if (!gacha || cards.length === 0 || gachaRarityRates.length === 0) return [] as IGachaDetail[][];

        return gachaRarityRates.map(rate => {
            const matchingRarity = gacha.gachaDetails.filter(detail => {
                const card = cardMap.get(detail.cardId);
                return card?.cardRarityType === rate.cardRarityType;
            });

            if (matchingRarity.length === 0) return [];

            const lotteryType = rate.lotteryType;
            if (lotteryType === "categorized_wish") {
                const wishOnly = matchingRarity.filter(d => !!d.isWish);
                return wishOnly.length > 0 ? wishOnly : matchingRarity;
            }

            if (lotteryType === "normal") {
                const nonWishOnly = matchingRarity.filter(d => !d.isWish);
                return nonWishOnly.length > 0 ? nonWishOnly : matchingRarity;
            }

            return matchingRarity;
        });
    }, [cards, gacha, gachaRarityRates, cardMap]);

    // Calculate weights for each rate bucket
    useEffect(() => {
        if (rateCardPools.length > 0) {
            setWeights(rateCardPools.map(pool => pool.reduce((sum, detail) => sum + detail.weight, 0)));
        }
    }, [rateCardPools]);

    // Gacha simulation function
    const doGacha = useCallback((behavior: IGachaBehavior) => {
        if (!gacha || gachaRarityRates.length === 0 || cards.length === 0) return;

        const rollTimes = behavior.spinCount;
        const rollResult = gachaRarityRates.map(() => 0);

        const normalSum = buildCumulativeWeights(normalRates);
        const guaranteeSum = buildCumulativeWeights(guaranteedRates);

        const tmpGachaResult: IGachaDetail[] = [];
        const isOverRarity = behavior.gachaBehaviorType.startsWith("over_rarity");
        let overRarityLevel = 0;
        if (isOverRarity) {
            if (behavior.gachaBehaviorType === "over_rarity_3_once") {
                overRarityLevel = 3;
            } else if (behavior.gachaBehaviorType === "over_rarity_4_once") {
                overRarityLevel = 4;
            }
        }

        const wishRateIndex = gachaRarityRates.findIndex(
            rate => rate.cardRarityType === "rarity_4" && rate.lotteryType === "categorized_wish"
        );
        const normalFourStarIndex = gachaRarityRates.findIndex(
            rate => rate.cardRarityType === "rarity_4" && rate.lotteryType === "normal"
        );

        const pickDreamPickCard = (): { pulled: IGachaDetail | null; countAsWishRate: boolean } => {
            if (!gacha) return { pulled: null, countAsWishRate: true };

            // Collect all 4-star card details from gachaDetails
            const allFourStarDetails = gacha.gachaDetails.filter(detail => {
                const card = cardMap.get(detail.cardId);
                return card?.cardRarityType === "rarity_4";
            });

            if (allFourStarDetails.length === 0) return { pulled: null, countAsWishRate: true };

            const selectedSet = new Set(selectedWishCardIds);

            const fixedWishDetails = allFourStarDetails.filter(
                detail => detail.gachaDetailWishType === "fixed"
            );

            // User-selected cards never include the fixed PU cards.
            const selectedWishDetails = allFourStarDetails.filter(detail =>
                detail.gachaDetailWishType !== "fixed"
                && isSelectableWishDetail(detail)
                && selectedSet.has(detail.cardId)
            );

            const promotedDetails = [...fixedWishDetails, ...selectedWishDetails];
            const promotedCardIds = new Set(promotedDetails.map(detail => detail.cardId));

            // Other 4-star cards in pool
            const otherDetails = allFourStarDetails.filter(detail =>
                !promotedCardIds.has(detail.cardId)
            );

            // Calculate total 4-star rate
            const totalRate = [wishRateIndex, normalFourStarIndex]
                .filter(i => i !== -1)
                .reduce((sum, i) => sum + (gachaRarityRates[i]?.rate || 0), 0) || 3.0;

            const promotedCount = promotedDetails.length;

            let entries: Array<{ item: IGachaDetail; chance: number }> = [];

            if (promotedCount > 0) {
                // Limit total PU chance so it doesn't overflow total 4-star rate (max 80% of total rate, 0.4% per card max)
                const singlePuRate = Math.min(0.4, (totalRate * 0.8) / promotedCount);
                const totalPuRate = singlePuRate * promotedCount;
                const remainingRate = Math.max(0.1, totalRate - totalPuRate);

                const puEntries = promotedDetails.map(detail => ({ item: detail, chance: singlePuRate }));

                let remainingEntries: Array<{ item: IGachaDetail; chance: number }> = [];
                if (otherDetails.length > 0) {
                    const sumWeight = otherDetails.reduce((s, d) => s + (d.weight > 0 ? d.weight : 1), 0);
                    remainingEntries = otherDetails.map(detail => ({
                        item: detail,
                        chance: remainingRate * ((detail.weight > 0 ? detail.weight : 1) / sumWeight),
                    }));
                } else {
                    const extraPerCard = remainingRate / promotedCount;
                    puEntries.forEach(entry => { entry.chance += extraPerCard; });
                }

                entries = [...puEntries, ...remainingEntries];
            } else {
                const sumWeight = allFourStarDetails.reduce((s, d) => s + (d.weight > 0 ? d.weight : 1), 0);
                entries = allFourStarDetails.map(detail => ({
                    item: detail,
                    chance: totalRate * ((detail.weight > 0 ? detail.weight : 1) / sumWeight),
                }));
            }

            const pulled = pickByChance(entries) || allFourStarDetails[0] || null;
            const countAsWishRate = pulled ? promotedCardIds.has(pulled.cardId) : true;

            return { pulled, countAsWishRate };
        };

        let noOverRarityCount = 0;

        for (let i = 0; i < rollTimes; i++) {

            if (i % 10 === 9 && isOverRarity && noOverRarityCount === 9 && guaranteeSum.length > 0) {
                const roll = Math.random() * 100;
                const idx = guaranteeSum.findIndex(rate => roll < rate);
                if (idx !== -1) {
                    if (isWishPickGacha && (idx === wishRateIndex || idx === normalFourStarIndex)) {
                        const { pulled, countAsWishRate } = pickDreamPickCard();
                        if (pulled) {
                            const targetIdx = (countAsWishRate && wishRateIndex !== -1) ? wishRateIndex : (normalFourStarIndex !== -1 ? normalFourStarIndex : idx);
                            rollResult[targetIdx] = (rollResult[targetIdx] || 0) + 1;
                            tmpGachaResult.push(pulled);
                        }
                    } else if ((rateCardPools[idx]?.length || 0) > 0) {
                        const pulled = pickByWeight(rateCardPools[idx] || [], detail => detail.weight > 0 ? detail.weight : 1);
                        if (pulled) {
                            rollResult[idx] = (rollResult[idx] || 0) + 1;
                            tmpGachaResult.push(pulled);
                        }
                    }
                }
                noOverRarityCount = 0;
                continue;
            } else if (i % 10 === 0) {
                noOverRarityCount = 0;
            }

            const roll = Math.random() * 100;
            const idx = normalSum.findIndex(rate => roll < rate);
            if (idx !== -1) {
                if (isWishPickGacha && (idx === wishRateIndex || idx === normalFourStarIndex)) {
                    const { pulled, countAsWishRate } = pickDreamPickCard();
                    if (pulled) {
                        const targetIdx = (countAsWishRate && wishRateIndex !== -1) ? wishRateIndex : (normalFourStarIndex !== -1 ? normalFourStarIndex : idx);
                        rollResult[targetIdx] = (rollResult[targetIdx] || 0) + 1;
                        tmpGachaResult.push(pulled);

                        if (isOverRarity && cardRarityTypeToRarity[gachaRarityRates[idx].cardRarityType] < overRarityLevel) {
                            noOverRarityCount += 1;
                        }
                    }
                } else if ((rateCardPools[idx]?.length || 0) > 0) {
                    const pulled = pickByWeight(rateCardPools[idx] || [], detail => detail.weight > 0 ? detail.weight : 1);
                    if (pulled) {
                        rollResult[idx] = (rollResult[idx] || 0) + 1;
                        tmpGachaResult.push(pulled);

                        if (isOverRarity && cardRarityTypeToRarity[gachaRarityRates[idx].cardRarityType] < overRarityLevel) {
                            noOverRarityCount += 1;
                        }
                    }
                }
            }
        }

        let actualStartSpinCount = 0;
        const derivedPickupCount = tmpGachaResult.reduce((count, detail) => {
            return count + (activePickupCards.some(p => p.id === detail.cardId) ? 1 : 0);
        }, 0);

        setStatistic(stats => {
            actualStartSpinCount = stats.spinCount;
            return {
                counts: stats.counts.map((count, idx) => rollResult[idx] + count),
                spinCount: stats.spinCount + behavior.spinCount,
                pickupCount: (stats.pickupCount || 0) + derivedPickupCount,
            };
        });

        setCurrentGachaResult(tmpGachaResult.slice(-10));

        // Update history 4 stars - use functional form to get accurate previous history
        // We need to calculate pullIndex based on the captured startSpinCount
        setHistory4Stars(prev => {
            // Build the list of new 4-star details with proper pullIndex
            const new4StarDetails: HistoryItem[] = [];

            tmpGachaResult.forEach((detail, idx) => {
                const card = cards.find(c => c.id === detail.cardId);
                if (card && (card.cardRarityType === "rarity_4" || card.cardRarityType === "rarity_birthday")) {
                    new4StarDetails.push({
                        ...detail,
                        pullIndex: actualStartSpinCount + idx + 1
                    });
                }
            });

            if (new4StarDetails.length === 0) {
                return prev;
            }

            // Reverse so newest is first, then prepend to existing history
            return [...new4StarDetails.reverse(), ...prev];
        });
    }, [cards, cardMap, gacha, gachaRarityRates, guaranteedRates, normalRates, activePickupCards, rateCardPools, isWishPickGacha, selectedWishCardIds]);

    // Reset gacha statistics
    const resetGacha = useCallback(() => {
        setStatistic(stats => ({
            counts: stats.counts.map(() => 0),
            spinCount: 0,
            pickupCount: 0,
        }));
        setCurrentGachaResult([]);
        setHistory4Stars([]);
    }, []);

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

    if (error || !gacha) {
        return (
            <MainLayout>
                <div className="container mx-auto px-4 py-16">
                    <div className="max-w-md mx-auto text-center">
                        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-amber-100 flex items-center justify-center">
                            <svg className="w-12 h-12 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t("page.gacha.notFoundTitle", { id: gachaId })}</h2>
                        <p className="text-slate-500 mb-6">{t("page.gacha.notFoundDesc")}</p>
                        <Link
                            href="/gacha"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-miku text-white font-bold rounded-xl hover:bg-miku-dark transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            {t("page.gacha.backToList")}
                        </Link>
                    </div>
                </div>
            </MainLayout>
        );
    }

    const logoUrl = getGachaLogoUrl(gacha.assetbundleName, assetSource);
    const bgUrl = getGachaScreenUrl(gacha.assetbundleName, gacha.id, assetSource);
    const status = getGachaStatus();
    const gachaTypeLabelKey = GACHA_TYPE_LABEL_KEYS[gacha.gachaType];
    const gachaTypeLabel = gachaTypeLabelKey ? t(gachaTypeLabelKey) : gacha.gachaType;
    const activeImageLabel = t(`page.gacha.imageTabs.${activeImageTab}`);
    const activeImageUrl = activeImageTab === "logo" ? logoUrl : bgUrl;
    const activeGachaInfoTranslations = useLLMTranslation && gachaInfoTranslations?.locale === locale ? gachaInfoTranslations.data : null;
    const summaryView = resolveGachaInfoText(
        gacha.gachaInformation?.summary ?? "",
        getGachaInfoTranslation(activeGachaInfoTranslations, "summary", gacha.gachaInformation?.summary),
        !!originalGachaInfoFields.summary,
    );
    const bubbleTextView = resolveGachaInfoText(
        gacha.gachaInformation?.bubbleText ?? "",
        getGachaInfoTranslation(activeGachaInfoTranslations, "bubbleText", gacha.gachaInformation?.bubbleText),
        !!originalGachaInfoFields.bubbleText,
    );
    const descriptionView = resolveGachaInfoText(
        gacha.gachaInformation?.description ?? "",
        getGachaInfoTranslation(activeGachaInfoTranslations, "description", gacha.gachaInformation?.description),
        !!originalGachaInfoFields.description,
    );
    const toggleGachaInfoOriginal = (field: GachaInfoField) => {
        setOriginalGachaInfoFields(prev => ({ ...prev, [field]: !prev[field] }));
    };

    return (
        <MainLayout>
            <ImagePreviewModal
                isOpen={imageViewerOpen}
                onClose={() => setImageViewerOpen(false)}
                title={t("page.gacha.imageDetailTitle", { name: gacha.name, tab: activeImageLabel })}
                imageUrl={activeImageUrl}
                alt={t("page.gacha.imageDetailAlt", { name: gacha.name, tab: activeImageLabel })}
                fileName={`gacha_${gacha.id}_${activeImageTab}.png`}
            />

            <div className="container mx-auto px-4 sm:px-6 py-8">
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-xs font-mono text-slate-500 w-fit">
                            ID: {gacha.id}
                        </span>
                        <span className="px-3 py-1 text-xs font-bold rounded-full text-white w-fit bg-purple-500">
                            {gachaTypeLabel}
                        </span>
                        <span
                            className="px-3 py-1 text-xs font-bold rounded-full text-white w-fit"
                            style={{ backgroundColor: status.color }}
                        >
                            {status.label}
                        </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-800">
                        <TranslatedText
                            original={gacha.name}
                            category="gacha"
                            field="name"
                            originalClassName=""
                            translationClassName="block text-lg font-medium text-slate-400 mt-1"
                        />
                    </h1>
                </div>

                {/* Main Content Grid - Images LEFT, Info RIGHT */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                    {/* LEFT Column: Image Gallery */}
                    <div>
                        {isScreenshotMode ? (
                            /* Screenshot Mode: Show all images in flat layout */
                            <div className="space-y-4">
                                {/* Logo */}
                                <div className="ios-glass-card rounded-2xl overflow-hidden">
                                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                                        <span className="text-sm font-bold text-slate-600">Logo</span>
                                    </div>
                                    <div className="relative aspect-[16/9] bg-gradient-to-br from-slate-50 to-slate-100">
                                        <Image
                                            src={logoUrl}
                                            alt={`${gacha.name} Logo`}
                                            fill
                                            className="object-contain p-6"
                                            unoptimized
                                            priority
                                        />
                                    </div>
                                </div>
                                {/* Background */}
                                <div className="ios-glass-card rounded-2xl overflow-hidden">
                                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                                        <span className="text-sm font-bold text-slate-600">{t("page.gacha.imageTabs.bg")}</span>
                                    </div>
                                    <div className="relative aspect-[16/9] bg-gradient-to-br from-slate-50 to-slate-100">
                                        <Image
                                            src={bgUrl}
                                            alt={`${gacha.name} Background`}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Normal Mode: Tabs */
                            <div className="ios-glass-card rounded-2xl overflow-hidden lg:sticky lg:top-24">
                                {/* Tabs */}
                                <div className="flex border-b border-slate-200">
                                    {[
                                        { key: "logo", label: "Logo" },
                                        { key: "bg", label: t("page.gacha.imageTabs.bg") },
                                    ].map((tab) => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveImageTab(tab.key as "logo" | "bg")}
                                            className={`flex-1 py-3 px-4 text-sm font-bold transition-colors ${activeImageTab === tab.key
                                                ? "text-miku border-b-2 border-miku bg-miku/5"
                                                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                                                }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                                {/* Image Content */}
                                <div
                                    className="relative aspect-[16/9] bg-gradient-to-br from-slate-50 to-slate-100 cursor-zoom-in group"
                                    onClick={() => setImageViewerOpen(true)}
                                >
                                    {activeImageTab === "logo" && (
                                        <Image
                                            src={logoUrl}
                                            alt={`${gacha.name} Logo`}
                                            fill
                                            className="object-contain p-6"
                                            unoptimized
                                            priority
                                        />
                                    )}
                                    {activeImageTab === "bg" && (
                                        <Image
                                            src={bgUrl}
                                            alt={`${gacha.name} Background`}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    )}
                                    <div className="absolute bottom-3 right-3 z-10 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                        </svg>
                                        {t("page.gacha.clickExpand")}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT Column: Info Cards */}
                    <div className="space-y-6">
                        {/* Basic Info Card */}
                        <div className="ios-glass-card rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {t("page.gacha.basicInfo")}
                                </h2>
                            </div>
                            <div className="divide-y divide-slate-100">
                                <InfoRow label={t("page.gacha.idLabel")} value={`#${gacha.id}`} />
                                <InfoRow
                                    label={t("page.gacha.nameLabel")}
                                    value={
                                        <TranslatedText
                                            original={gacha.name}
                                            category="gacha"
                                            field="name"
                                            originalClassName=""
                                            translationClassName="block text-xs font-normal text-slate-400 mt-0.5"
                                        />
                                    }
                                />
                                <InfoRow label={t("page.gacha.typeLabel")} value={gachaTypeLabel} />
                                <InfoRow label={t("page.gacha.startTimeLabel")} value={formatTimestamp(gacha.startAt)} />
                                <InfoRow label={t("page.gacha.endTimeLabel")} value={formatTimestamp(gacha.endAt)} />
                                <InfoRow
                                    label={t("page.gacha.assetNameLabel")}
                                    value={<span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{gacha.assetbundleName}</span>}
                                />
                            </div>
                        </div>

                        {/* Gacha Summary & Tagline Card */}
                        {(gacha.gachaInformation?.summary || gacha.gachaInformation?.bubbleText) && (
                            <div className="ios-glass-card rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent flex items-center justify-between">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {t("page.gacha.summaryTitle")}
                                    </h2>
                                    {gacha.gachaInformation.summary && (
                                        <button
                                            type="button"
                                            onClick={() => setIsSummaryExpanded(prev => !prev)}
                                            className="text-xs font-bold text-miku hover:text-miku-dark transition-colors flex items-center gap-1"
                                        >
                                            {isSummaryExpanded ? t("page.gacha.showLessSummary") : t("page.gacha.showMoreSummary")}
                                            <svg
                                                className={`w-4 h-4 transition-transform duration-200 ${isSummaryExpanded ? "rotate-180" : ""}`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                <div className="p-5 space-y-4">
                                    {gacha.gachaInformation.bubbleText && (
                                        <div className="px-4 py-3 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-miku/10 border border-pink-200/50 rounded-xl flex items-start gap-3">
                                            <span className="shrink-0 px-2 py-0.5 bg-pink-500 text-white text-xs font-bold rounded-md shadow-sm">
                                                {t("page.gacha.bubbleTitle")}
                                            </span>
                                            <p className="text-sm font-medium text-slate-700 leading-snug">
                                                {bubbleTextView.text}
                                            </p>
                                            {bubbleTextView.canToggle && (
                                                <GachaInfoOriginalToggle
                                                    className="ml-auto shrink-0"
                                                    showingTranslation={bubbleTextView.showingTranslation}
                                                    onToggle={() => toggleGachaInfoOriginal("bubbleText")}
                                                />
                                            )}
                                        </div>
                                    )}
                                    {gacha.gachaInformation.summary && (
                                        <div>
                                            {summaryView.canToggle && (
                                                <div className="flex justify-end mb-2">
                                                    <GachaInfoOriginalToggle
                                                        showingTranslation={summaryView.showingTranslation}
                                                        onToggle={() => toggleGachaInfoOriginal("summary")}
                                                    />
                                                </div>
                                            )}
                                            <div className={`text-sm text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50/50 p-4 rounded-xl border border-slate-100 ${!isSummaryExpanded ? "max-h-36 overflow-hidden relative" : ""}`}>
                                                {summaryView.text}
                                                {!isSummaryExpanded && (
                                                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none" />
                                                )}
                                            </div>
                                            {!isSummaryExpanded && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsSummaryExpanded(true)}
                                                    className="mt-3 w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-xl transition-colors border border-slate-200/60"
                                                >
                                                    {t("page.gacha.showMoreSummary")}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Gacha Detailed Description & Rules Card */}
                        {gacha.gachaInformation?.description && (
                            <div className="ios-glass-card rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent flex items-center justify-between">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        {t("page.gacha.descriptionTitle")}
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={() => setIsDescriptionExpanded(prev => !prev)}
                                        className="text-xs font-bold text-miku hover:text-miku-dark transition-colors flex items-center gap-1"
                                    >
                                        {isDescriptionExpanded ? t("page.gacha.showLessDescription") : t("page.gacha.showMoreDescription")}
                                        <svg
                                            className={`w-4 h-4 transition-transform duration-200 ${isDescriptionExpanded ? "rotate-180" : ""}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="p-5">
                                    {descriptionView.canToggle && (
                                        <div className="flex justify-end mb-2">
                                            <GachaInfoOriginalToggle
                                                showingTranslation={descriptionView.showingTranslation}
                                                onToggle={() => toggleGachaInfoOriginal("description")}
                                            />
                                        </div>
                                    )}
                                    <div className={`text-xs text-slate-600 leading-relaxed whitespace-pre-line ${!isDescriptionExpanded ? "max-h-36 overflow-hidden relative" : ""}`}>
                                        {descriptionView.text}
                                        {!isDescriptionExpanded && (
                                            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                                        )}
                                    </div>
                                    {!isDescriptionExpanded && (
                                        <button
                                            type="button"
                                            onClick={() => setIsDescriptionExpanded(true)}
                                            className="mt-3 w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-xl transition-colors border border-slate-200/60"
                                        >
                                            {t("page.gacha.showMoreDescription")}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Gacha Rates Card */}
                        {gacha.gachaCardRarityRates && gacha.gachaCardRarityRates.length > 0 && (
                            <div className="ios-glass-card rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                        {t("page.gacha.ratesTitle")}
                                    </h2>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {gacha.gachaCardRarityRates.map((rate, idx) => {
                                        const rarityLabel = rate.cardRarityType === "rarity_birthday"
                                            ? t("page.gacha.birthdayLabel")
                                            : t("page.gacha.starLabel", { star: rate.cardRarityType.replace("rarity_", "") });
                                        return (
                                            <div key={rate.id ? `rate-${rate.id}-${idx}` : `${rate.cardRarityType}-${idx}`} className="px-5 py-3 flex items-center justify-between text-sm">
                                                <span className="text-slate-500 font-medium">{rarityLabel}</span>
                                                <span className="text-miku font-bold">{rate.rate}%</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Pickup Cards */}
                        {pickupCards.length > 0 && (
                            <div className="space-y-4">
                                {isWishPickGacha && (
                                    <div className="ios-glass-card rounded-2xl overflow-hidden">
                                        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                                <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                                </svg>
                                                {t("page.gacha.wishSelectTitle")}
                                            </h2>
                                            {fullCardPool.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCardSelectorModalOpen(true)}
                                                    className="px-3 py-1.5 bg-miku/10 hover:bg-miku hover:text-white text-miku text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012 2v2M7 7h10" />
                                                    </svg>
                                                    {t("page.gacha.viewFullCardPool", { count: fullCardPool.length })}
                                                </button>
                                            )}
                                        </div>
                                        <div className="p-4 space-y-4">
                                            <div className="space-y-2">
                                                <h3 className="text-sm font-bold text-slate-800">
                                                    {t("page.gacha.fixedPuCardsTitle", { count: fixedWishCards.length })}
                                                </h3>
                                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6 gap-1.5">
                                                    {fixedWishCards.map(card => {
                                                        const showTrained = getCardDefaultTrainedStatus(card) || (useTrainedThumbnail && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");
                                                        const pullCount = history4Stars.filter(h => h.cardId === card.id).length;
                                                        const isPulled = pullCount > 0;

                                                        return (
                                                            <Link key={card.id} href={`/cards/${card.id}`} className="group block">
                                                                <div className={`rounded-lg overflow-hidden bg-white hover:shadow-lg transition-all ${isPulled ? 'ring-2 ring-green-400' : 'ring-1 ring-slate-200 hover:ring-miku'}`}>
                                                                    <SekaiCardThumbnail card={card} trained={showTrained} className="w-full" />
                                                                    {isPulled && (
                                                                        <div className="flex items-center justify-center gap-0.5 bg-gradient-to-r from-green-500 to-green-400 text-white text-[8px] font-black py-0.5 leading-none">
                                                                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                            </svg>
                                                                            {pullCount > 1 && <span>×{pullCount}</span>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <h3 className="text-sm font-bold text-slate-800">{t("page.gacha.wishSelectSubTitle")}</h3>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsWishModalOpen(true)}
                                                        className="px-3.5 py-1.5 bg-miku hover:bg-miku-dark text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                        </svg>
                                                        {t("page.gacha.wishSelectSubTitle")} ({selectedWishCardIds.length}/{dreamPickSelectionLimit})
                                                    </button>
                                                </div>
                                            </div>
                                            {selectedWishCards.length > 0 && (
                                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6 gap-1.5">
                                                    {selectedWishCards.map(card => {
                                                        const showTrained = getCardDefaultTrainedStatus(card) || (useTrainedThumbnail && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");
                                                        const pullCount = history4Stars.filter(h => h.cardId === card.id).length;
                                                        const isPulled = pullCount > 0;

                                                        return (
                                                            <Link
                                                                key={card.id}
                                                                href={`/cards/${card.id}`}
                                                                className="group block"
                                                            >
                                                                <div className={`rounded-lg overflow-hidden bg-white hover:shadow-lg transition-all ${isPulled ? 'ring-2 ring-green-400' : 'ring-1 ring-slate-200 hover:ring-miku'}`}>
                                                                    <SekaiCardThumbnail card={card} trained={showTrained} className="w-full" />
                                                                    {isPulled && (
                                                                        <div className="flex items-center justify-center gap-0.5 bg-gradient-to-r from-green-500 to-green-400 text-white text-[8px] font-black py-0.5 leading-none">
                                                                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                            </svg>
                                                                            {pullCount > 1 && <span>×{pullCount}</span>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {!isWishPickGacha && (
                                    <div className="ios-glass-card rounded-2xl overflow-hidden">
                                        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                                <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                                </svg>
                                                {t("page.gacha.pickupCardsTitle", { count: pickupCards.length })}
                                            </h2>
                                            {fullCardPool.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCardSelectorModalOpen(true)}
                                                    className="px-3 py-1.5 bg-miku/10 hover:bg-miku hover:text-white text-miku text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                                    </svg>
                                                    {t("page.gacha.viewFullCardPool", { count: fullCardPool.length })}
                                                </button>
                                            )}
                                        </div>
                                        <div className="p-4">
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                                            {pickupCards.map(card => {
                                                const showTrained = getCardDefaultTrainedStatus(card) || (useTrainedThumbnail && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");
                                                const pullCount = history4Stars.filter(h => h.cardId === card.id).length;
                                                const isPulled = pullCount > 0;

                                                return (
                                                    <Link
                                                        key={card.id}
                                                        href={`/cards/${card.id}`}
                                                        className="group block"
                                                    >
                                                        <div className={`rounded-lg overflow-hidden bg-white hover:shadow-lg transition-all ${isPulled ? 'ring-2 ring-green-400' : 'ring-1 ring-slate-200 hover:ring-miku'}`}>
                                                            <SekaiCardThumbnail card={card} trained={showTrained} className="w-full" />
                                                            {isPulled && (
                                                                <div className="flex items-center justify-center gap-0.5 bg-gradient-to-r from-green-500 to-green-400 text-white text-[8px] font-black py-0.5 leading-none">
                                                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                    </svg>
                                                                    {pullCount > 1 && <span>×{pullCount}</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* No pickup cards message */}
                        {pickupCards.length === 0 && (
                            <div className="ios-glass-card rounded-2xl overflow-hidden p-6 text-center text-slate-400">
                                <p>{t("page.gacha.noPickupCards")}</p>
                            </div>
                        )}

                        {/* Card Selector Modal for Full Card Pool */}
                        <CardSelectorModal
                            isOpen={isCardSelectorModalOpen}
                            onClose={() => setIsCardSelectorModalOpen(false)}
                            cards={poolCards}
                            gachaDetails={gacha.gachaDetails}
                            pickupCardIds={pickupCardIds}
                        />

                        {/* Consolidated Simulator & Statistics (Sidebar Mode) */}
                        <div className="ios-glass-card rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {t("page.gacha.simulatorTitle")}
                                </h2>
                            </div>
                            <div className="p-5 flex flex-col gap-6">
                                {/* Controls */}
                                <div className="flex flex-col gap-4 items-center">
                                    <div className="flex flex-wrap gap-3 justify-center w-full">
                                        {(() => {
                                            const uniqueBehaviors = gacha.gachaBehaviors.reduce((acc, curr) => {
                                                if (!acc.some(b => b.spinCount === curr.spinCount)) {
                                                    acc.push(curr);
                                                }
                                                return acc;
                                            }, [] as IGachaBehavior[]).sort((a, b) => a.spinCount - b.spinCount);

                                            return uniqueBehaviors.map((behavior, idx) => {
                                                const label = behavior.spinCount === 1 
                                                    ? t("page.gacha.spinSingle") 
                                                    : t("page.gacha.spinMulti", { count: behavior.spinCount });
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => doGacha(behavior)}
                                                        className="flex-1 py-3 bg-miku hover:bg-miku-dark text-white font-bold rounded-xl transition-all shadow-sm hover:shadow active:scale-95"
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            });
                                        })()}

                                        {/* Custom Spin Count Input */}
                                        <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 pl-3 w-full sm:w-auto mt-2 sm:mt-0">
                                            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">{t("page.gacha.customSpinCountLabel")}</span>
                                            <input
                                                type="number"
                                                min="1"
                                                max="1000"
                                                value={customSpinCount}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === "" || (parseInt(val) >= 1 && parseInt(val) <= 1000)) {
                                                        setCustomSpinCount(val);
                                                    }
                                                }}
                                                className="w-16 bg-transparent text-sm font-bold text-slate-800 focus:outline-none text-center"
                                                placeholder="MAX"
                                            />
                                            <button
                                                onClick={() => {
                                                    const count = parseInt(customSpinCount);
                                                    if (count && count > 0 && count <= 1000) {
                                                        // Find a reference behavior (prefer strict 10-pull for guarantee type, else generic)
                                                        const refBehavior = gacha.gachaBehaviors.find(b => b.spinCount === 10) || gacha.gachaBehaviors[0];
                                                        if (refBehavior) {
                                                            doGacha({
                                                                ...refBehavior,
                                                                spinCount: count
                                                            });
                                                        }
                                                    }
                                                }}
                                                disabled={!customSpinCount}
                                                className="p-2 bg-slate-200 hover:bg-miku hover:text-white text-slate-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between w-full px-1">
                                        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t("page.gacha.totalSpinCount")} <span className="text-lg text-slate-800 ml-1">{statistic.spinCount}</span></div>
                                        <button
                                            onClick={resetGacha}
                                            className="text-slate-400 hover:text-slate-600 text-sm hover:underline transition-colors"
                                        >
                                            {t("page.gacha.resetData")}
                                        </button>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="h-px bg-slate-100 w-full"></div>

                                {/* Statistics Table */}
                                <div className="overflow-hidden rounded-xl border border-slate-100">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100">
                                                <th className="text-left py-2 px-3 font-bold text-slate-600">{t("page.gacha.thRarity")}</th>
                                                <th className="text-center py-2 px-3 font-bold text-slate-600">{t("page.gacha.thCount")}</th>
                                                <th className="text-center py-2 px-3 font-bold text-slate-600">{t("page.gacha.thProbability")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* UP Rate Row */}
                                            <tr className="border-b border-slate-100 last:border-0 hover:bg-pink-50/50 transition-colors bg-pink-50/30">
                                                <td className="py-2 px-3 font-bold text-pink-500 flex items-center gap-1">
                                                    <span className="bg-pink-500 text-white text-[10px] px-1 rounded">{t("page.gacha.upLabel")}</span>
                                                    {isWishPickGacha ? t("page.gacha.dreamPickPuLabel") : t("page.gacha.memberLabel")}
                                                </td>
                                                <td className="text-center py-2 px-3 text-slate-600">{statistic.pickupCount || 0}</td>
                                                <td className="text-center py-2 px-3 text-pink-500 font-bold">
                                                    {statistic.spinCount > 0 ? (((statistic.pickupCount || 0) / statistic.spinCount) * 100).toFixed(2) : "0.00"}%
                                                </td>
                                            </tr>
                                            {gachaRarityRates.map((rate, idx) => {
                                                const rarityLabel = rate.cardRarityType === "rarity_birthday"
                                                    ? t("page.gacha.birthdayLabel")
                                                    : rate.cardRarityType === "rarity_4" && isWishPickGacha
                                                        ? rate.lotteryType === "categorized_wish"
                                                            ? t("page.gacha.rarityWishMode", { star: cardRarityTypeToRarity[rate.cardRarityType] })
                                                            : t("page.gacha.rarityNormalMode", { star: cardRarityTypeToRarity[rate.cardRarityType] })
                                                        : t("page.gacha.starLabel", { star: cardRarityTypeToRarity[rate.cardRarityType] });
                                                const count = statistic.counts[idx] || 0;
                                                const percentage = statistic.spinCount > 0
                                                    ? ((count / statistic.spinCount) * 100).toFixed(2)
                                                    : "0.00";
                                                return (
                                                    <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                                                        <td className="py-2 px-3 font-bold text-slate-700">{rarityLabel}</td>
                                                        <td className="text-center py-2 px-3 text-slate-600">{count}</td>
                                                        <td className="text-center py-2 px-3 text-miku font-bold">{percentage}%</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Current Gacha Result */}
                        {currentGachaResult.length > 0 && (
                            <div className="ios-glass-card rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                        </svg>
                                        {t("page.gacha.recentResultsTitle")}
                                    </h2>
                                </div>
                                <div className="p-4">
                                    <div className="grid grid-cols-5 gap-2">
                                        {currentGachaResult.map((detail, idx) => {
                                            const card = cards.find(c => c.id === detail.cardId);
                                            if (!card) return null;

                                            const showTrained = getCardDefaultTrainedStatus(card) || (useTrainedThumbnail && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");
                                            const isPickup = activePickupCards.some(p => p.id === card.id);
                                            const is4Star = card.cardRarityType === "rarity_4" || card.cardRarityType === "rarity_birthday";

                                            return (
                                                <Link
                                                    key={idx}
                                                    href={`/cards/${card.id}`}
                                                    className="group block"
                                                >
                                                    <div className={`rounded-lg overflow-hidden bg-white hover:shadow-lg transition-all ${isPickup
                                                        ? 'ring-2 ring-pink-400'
                                                        : is4Star
                                                            ? 'ring-2 ring-yellow-400'
                                                            : 'ring-1 ring-slate-200 hover:ring-miku'
                                                        }`}>
                                                        <SekaiCardThumbnail card={card} trained={showTrained} className="w-full" />
                                                        {(isPickup || is4Star) && (
                                                            <div className={`text-center text-white text-[8px] sm:text-[9px] font-black py-0.5 leading-none ${isPickup ? 'bg-gradient-to-r from-pink-500 to-pink-400' : 'bg-gradient-to-r from-yellow-400 to-yellow-300'}`}>
                                                                {isPickup ? t("page.gacha.upLabel") : t("page.gacha.star4Label")}
                                                            </div>
                                                        )}
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* History 4-Star Results */}
                        {history4Stars.length > 0 && (
                            <div className="ios-glass-card rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-miku/5 to-transparent">
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-miku" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                        </svg>
                                        {t("page.gacha.history4StarsTitle")}
                                    </h2>
                                </div>
                                <div className="p-4">
                                    <div className="grid grid-cols-5 gap-2">
                                        {history4Stars.map((detail, idx) => {
                                            const card = cards.find(c => c.id === detail.cardId);
                                            if (!card) return null;

                                            const showTrained = getCardDefaultTrainedStatus(card) || (useTrainedThumbnail && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");
                                            const isPickup = activePickupCards.some(p => p.id === card.id);
                                            const is4Star = card.cardRarityType === "rarity_4" || card.cardRarityType === "rarity_birthday";

                                            const currentPullIndex = detail.pullIndex || 0;
                                            const olderDetail = history4Stars[idx + 1];
                                            const prevPullIndex = olderDetail ? (olderDetail.pullIndex || 0) : 0;
                                            const pityCount = currentPullIndex - prevPullIndex;
                                            const pityColorClass = pityCount <= 50 ? "bg-green-500" : pityCount >= 100 ? "bg-orange-500" : "bg-miku";

                                            return (
                                                <Link
                                                    key={idx}
                                                    href={`/cards/${card.id}`}
                                                    className="group block"
                                                >
                                                    <div className={`rounded-lg overflow-hidden bg-white hover:shadow-lg transition-all ${isPickup
                                                        ? 'ring-2 ring-pink-400'
                                                        : is4Star
                                                            ? 'ring-2 ring-yellow-400'
                                                            : 'ring-1 ring-slate-200 hover:ring-miku'
                                                        }`}>
                                                        <SekaiCardThumbnail card={card} trained={showTrained} className="w-full" />
                                                        <div className={`flex items-center justify-between text-white text-[8px] sm:text-[9px] font-black py-0.5 px-1 leading-none ${isPickup ? 'bg-gradient-to-r from-pink-500 to-pink-400' : 'bg-gradient-to-r from-yellow-400 to-yellow-300'}`}>
                                                            <span>{isPickup ? t("page.gacha.upLabel") : t("page.gacha.star4Label")}</span>
                                                            {pityCount > 0 && (
                                                                <span className={`px-1 py-0.5 rounded text-[8px] sm:text-[9px] font-bold ${pityColorClass} text-white`}>
                                                                    {t("page.gacha.pityPull", { count: pityCount })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        <DetailPageAdCard hidden={isScreenshotMode} />
                    </div>
                </div>

                {/* Back Button */}
                <div className="mt-12 text-center">
                    <Link
                        href="/gacha"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        {t("page.gacha.backToList")}
                    </Link>
                </div>
            </div>

            {/* Wish PU Card Selector Modal */}
            <CardSelectorModal
                isOpen={isWishModalOpen}
                onClose={() => setIsWishModalOpen(false)}
                title={`${t("page.gacha.wishSelectSubTitle")} (${selectedWishCardIds.length}/${dreamPickSelectionLimit})`}
                cards={wishCandidateCards}
                selectedCardIds={selectedWishCardIds}
                maxSelectCount={dreamPickSelectionLimit}
                onToggleCardSelect={(card) => {
                    setSelectedWishCardIds(prev => {
                        if (prev.includes(card.id)) {
                            return prev.filter(id => id !== card.id);
                        }
                        if (prev.length >= dreamPickSelectionLimit) {
                            return prev;
                        }
                        return [...prev, card.id];
                    });
                }}
            />
        </MainLayout >
    );
}

function GachaInfoOriginalToggle({ showingTranslation, onToggle, className = "" }: { showingTranslation: boolean; onToggle: () => void; className?: string }) {
    const { t } = useI18n();
    return (
        <button
            type="button"
            onClick={onToggle}
            className={`inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-miku transition-colors ${className}`}
        >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            {showingTranslation ? t("page.gacha.showOriginalText") : t("page.gacha.showTranslatedText")}
        </button>
    );
}

// Info Row Component (same as events page)
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="px-5 py-3 flex items-center justify-between text-sm">
            <span className="text-slate-500 font-medium">{label}</span>
            <span className="text-slate-800 font-bold text-right max-w-[60%]">{value}</span>
        </div>
    );
}
