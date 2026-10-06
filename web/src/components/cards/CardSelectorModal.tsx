"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import Link from "@/components/LocalizedLink";
import Modal from "@/components/common/Modal";
import CardFilters from "@/components/cards/CardFilters";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import {
    ICardInfo,
    CardRarityType,
    CardAttribute,
    isTrainableCard,
    getCardDefaultTrainedStatus,
    getRarityNumber,
    IGachaDetail,
    ISkillInfo,
    SupportUnit,
} from "@/types/types";
import { ICardSupply } from "@/hooks/useCardSupplyType";
import { useTheme } from "@/contexts/ThemeContext";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import { fetchMasterDataForServer, type ServerSourceType } from "@/lib/fetch";
import { getCardSkillTypes } from "@/lib/skill";
import { loadTranslations, TranslationData } from "@/lib/translations";
import { parseSearchQuery, matchExpr, type SearchTerm, type SearchExpr } from "@/lib/searchQuery";

export interface CardSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    cards: ICardInfo[];
    gachaDetails?: IGachaDetail[];
    pickupCardIds?: number[];
    selectedCardIds?: number[];
    maxSelectCount?: number;
    onToggleCardSelect?: (card: ICardInfo) => void;
    onSelectCard?: (card: ICardInfo) => void;
    server?: ServerSourceType;
}

export default function CardSelectorModal({
    isOpen,
    onClose,
    title,
    cards,
    gachaDetails = [],
    pickupCardIds = [],
    selectedCardIds,
    maxSelectCount,
    onToggleCardSelect,
    onSelectCard,
    server = "jp",
}: CardSelectorModalProps) {
    const { t } = useI18n();
    const { useTrainedThumbnail, isShowSpoiler } = useTheme();
    const [now] = useState(() => Date.now());

    // Filters state
    const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [selectedAttrs, setSelectedAttrs] = useState<CardAttribute[]>([]);
    const [selectedRarities, setSelectedRarities] = useState<CardRarityType[]>([]);
    const [selectedSupplyTypes, setSelectedSupplyTypes] = useState<string[]>([]);
    const [selectedSupportUnits, setSelectedSupportUnits] = useState<SupportUnit[]>([]);
    const [selectedSkillTypes, setSelectedSkillTypes] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState<string>("");

    // Sort state
    const [sortBy, setSortBy] = useState<"id" | "releaseAt" | "rarity">("id");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const [skillsMap, setSkillsMap] = useState<Map<number, ISkillInfo>>(new Map());
    const [suppliesMap, setSuppliesMap] = useState<Map<number, string>>(new Map());
    const [translations, setTranslations] = useState<TranslationData | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;
        async function loadMasterData() {
            try {
                const [skillsData, suppliesData, translationsData] = await Promise.all([
                    fetchMasterDataForServer<ISkillInfo[]>(server, "skills.json").catch(() => []),
                    fetchMasterDataForServer<ICardSupply[]>(server, "cardSupplies.json").catch(() => []),
                    loadTranslations(),
                ]);
                if (isMounted) {
                    if (skillsData.length > 0) {
                        setSkillsMap(new Map(skillsData.map((s) => [s.id, s])));
                    }
                    if (suppliesData.length > 0) {
                        setSuppliesMap(new Map(suppliesData.map((s) => [s.id, s.cardSupplyType])));
                    }
                    setTranslations(translationsData);
                }
            } catch {
                // ignore fallback
            }
        }
        loadMasterData();
        return () => {
            isMounted = false;
        };
    }, [isOpen, server]);

    const pickupSet = useMemo(() => new Set(pickupCardIds), [pickupCardIds]);

    // Weight and rate calculations per rarity (for gacha modal if applicable)
    const { weightByRarity, detailByCardId } = useMemo(() => {
        const weightByRarity: Record<string, number> = {};
        const detailByCardId = new Map<number, IGachaDetail>();

        gachaDetails.forEach((detail) => {
            if (!detailByCardId.has(detail.cardId)) {
                detailByCardId.set(detail.cardId, detail);
            }
        });

        gachaDetails.forEach((detail) => {
            const card = cards.find((c) => c.id === detail.cardId);
            if (!card) return;
            const rarity = card.cardRarityType;
            weightByRarity[rarity] = (weightByRarity[rarity] || 0) + (detail.weight || 1);
        });

        return { weightByRarity, detailByCardId };
    }, [gachaDetails, cards]);

    // Processed pool with actual overall draw rate
    const processedPool = useMemo(() => {
        const rarityBaseRate: Record<string, number> = {
            rarity_4: 3.0,
            rarity_birthday: 3.0,
            rarity_3: 8.5,
            rarity_2: 88.5,
            rarity_1: 0.0,
        };

        return cards.map((card) => {
            const detail = detailByCardId.get(card.id);
            const rarity = card.cardRarityType;
            const totalWeight = weightByRarity[rarity] || (detail?.weight || 1);
            const weight = detail?.weight || 1;
            const rarityRate = rarityBaseRate[rarity] ?? 3.0;
            // Without a gacha detail the fallback weights collapse to the flat rarity rate, which is not a draw rate.
            const actualRate = detail && totalWeight > 0 ? (rarityRate * weight) / totalWeight : 0;
            const isPickup = pickupSet.has(card.id);
            const supplyType =
                card.cardSupplyType ||
                suppliesMap.get(card.cardSupplyId) ||
                (card.cardRarityType === "rarity_birthday" ? "birthday" : "normal");

            return {
                card: { ...card, cardSupplyType: supplyType },
                detail,
                rarity,
                isPickup,
                actualRate,
            };
        });
    }, [cards, detailByCardId, weightByRarity, pickupSet, suppliesMap]);

    // Advanced search: parse query into boolean expression tree
    const parsedSearch = useMemo<SearchExpr | null>(
        () => parseSearchQuery(searchQuery),
        [searchQuery],
    );

    // Search term matcher
    const matchCardTerm = useCallback(
        (term: SearchTerm, card: ICardInfo & { cardSupplyType: string }): boolean => {
            switch (term.kind) {
                case "text": {
                    const q = term.value.toLowerCase().trim();
                    if (!q) return true;
                    if (card.prefix?.toLowerCase().includes(q)) return true;
                    const chinesePrefix = translations?.cards?.prefix?.[card.prefix];
                    if (chinesePrefix && chinesePrefix.toLowerCase().includes(q)) return true;
                    if (card.cardSkillName?.toLowerCase().includes(q)) return true;
                    if (card.gachaPhrase?.toLowerCase().includes(q)) return true;
                    return false;
                }
                case "id-eq":
                    return card.id === term.value;
                case "id-range":
                    return card.id >= term.lo && card.id <= term.hi;
                case "date-range": {
                    const ts = card.releaseAt || 0;
                    return ts >= term.loTs && ts <= term.hiTs;
                }
                default:
                    return false;
            }
        },
        [translations],
    );

    // Filtered and sorted pool
    const filteredPool = useMemo(() => {
        const hasVsUnitSelected = selectedUnitIds.includes("vs");

        const filtered = processedPool.filter((item) => {
            const { card } = item;

            // Character & VS shortcut filter
            if (selectedCharacters.length > 0 || (!hasVsUnitSelected && selectedSupportUnits.length > 0)) {
                const matchesChar = selectedCharacters.includes(card.characterId);
                const matchesVsShortcut =
                    !hasVsUnitSelected &&
                    card.characterId >= 21 &&
                    selectedSupportUnits.includes(card.supportUnit);

                if (!matchesChar && !matchesVsShortcut) return false;
            }

            // Attribute filter
            if (selectedAttrs.length > 0 && !selectedAttrs.includes(card.attr)) {
                return false;
            }

            // Rarity filter
            if (selectedRarities.length > 0 && !selectedRarities.includes(card.cardRarityType)) {
                return false;
            }

            // Supply type filter
            if (selectedSupplyTypes.length > 0 && !selectedSupplyTypes.includes(card.cardSupplyType)) {
                return false;
            }

            // Support Unit filter when VS unit is selected
            if (hasVsUnitSelected && selectedSupportUnits.length > 0) {
                if (card.characterId >= 21 && !selectedSupportUnits.includes(card.supportUnit)) {
                    return false;
                }
            }

            // Skill type filter
            if (selectedSkillTypes.length > 0) {
                const normalSkill = skillsMap.get(card.skillId);
                const trainedSkill = card.specialTrainingSkillId
                    ? skillsMap.get(card.specialTrainingSkillId)
                    : undefined;

                const cardSkillTypes = new Set<string>([
                    ...getCardSkillTypes(normalSkill),
                    ...getCardSkillTypes(trainedSkill),
                ]);

                if (!selectedSkillTypes.some((type) => cardSkillTypes.has(type))) {
                    return false;
                }
            }

            // Search query
            if (parsedSearch && !matchExpr(parsedSearch, card, matchCardTerm)) {
                return false;
            }

            // Spoiler check
            if (!isShowSpoiler) {
                if ((card.releaseAt || card.archivePublishedAt || 0) > now) {
                    return false;
                }
            }

            return true;
        });

        return filtered.sort((a, b) => {
            // Selected cards prioritized in multi-select mode
            if (selectedCardIds && selectedCardIds.length > 0) {
                const isSelA = selectedCardIds.includes(a.card.id);
                const isSelB = selectedCardIds.includes(b.card.id);
                if (isSelA !== isSelB) return isSelA ? -1 : 1;
            }

            let comparison = 0;
            switch (sortBy) {
                case "id":
                    comparison = a.card.id - b.card.id;
                    break;
                case "releaseAt":
                    comparison = (a.card.releaseAt || 0) - (b.card.releaseAt || 0);
                    break;
                case "rarity":
                    comparison = getRarityNumber(a.card.cardRarityType) - getRarityNumber(b.card.cardRarityType);
                    break;
            }

            if (comparison !== 0) {
                return sortOrder === "asc" ? comparison : -comparison;
            }

            // Tie breaker
            if (a.isPickup !== b.isPickup) return a.isPickup ? -1 : 1;
            return b.card.id - a.card.id;
        });
    }, [
        processedPool,
        selectedCharacters,
        selectedUnitIds,
        selectedSupportUnits,
        selectedAttrs,
        selectedRarities,
        selectedSupplyTypes,
        selectedSkillTypes,
        parsedSearch,
        matchCardTerm,
        isShowSpoiler,
        now,
        selectedCardIds,
        sortBy,
        sortOrder,
        skillsMap,
    ]);

    const handleReset = () => {
        setSelectedCharacters([]);
        setSelectedUnitIds([]);
        setSelectedAttrs([]);
        setSelectedRarities([]);
        setSelectedSupplyTypes([]);
        setSelectedSupportUnits([]);
        setSelectedSkillTypes([]);
        setSearchQuery("");
        setSortBy("id");
        setSortOrder("desc");
    };

    const modalTitle = title || `${t("page.gacha.cardPoolTitle", { count: cards.length })}`;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="xl">
            <div className="space-y-4">
                {/* Reusable CardFilters Component */}
                <CardFilters
                    selectedCharacters={selectedCharacters}
                    onCharacterChange={setSelectedCharacters}
                    selectedUnitIds={selectedUnitIds}
                    onUnitIdsChange={setSelectedUnitIds}
                    selectedAttrs={selectedAttrs}
                    onAttrChange={setSelectedAttrs}
                    selectedRarities={selectedRarities}
                    onRarityChange={setSelectedRarities}
                    selectedSupplyTypes={selectedSupplyTypes}
                    onSupplyTypeChange={setSelectedSupplyTypes}
                    selectedSupportUnits={selectedSupportUnits}
                    onSupportUnitChange={setSelectedSupportUnits}
                    selectedSkillTypes={selectedSkillTypes}
                    onSkillTypeChange={setSelectedSkillTypes}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={(id, order) => {
                        setSortBy(id as "id" | "releaseAt" | "rarity");
                        setSortOrder(order);
                    }}
                    onReset={handleReset}
                    totalCards={cards.length}
                    filteredCards={filteredPool.length}
                />

                {/* Selection Status & Clear Bar */}
                {selectedCardIds && onToggleCardSelect && (
                    <div className="flex items-center justify-between bg-surface-container rounded-md3-md px-3.5 py-2 type-label-l">
                        <span className="text-on-surface">
                            {t("page.gacha.wishSelectTitle")}:{" "}
                            <span className="text-primary font-black">{selectedCardIds.length}</span> /{" "}
                            {maxSelectCount || "∞"}
                        </span>
                        {selectedCardIds.length > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    const selectedCards = cards.filter((c) => selectedCardIds.includes(c.id));
                                    selectedCards.forEach((c) => onToggleCardSelect(c));
                                }}
                                className="state-layer focus-ring type-label-m text-on-error-container px-2 py-0.5 rounded-full bg-error-container"
                            >
                                {t("page.gacha.wishSelectClear", { count: selectedCardIds.length })}
                            </button>
                        )}
                    </div>
                )}

                {/* Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3 max-h-[60vh] overflow-y-auto pr-1">
                    {filteredPool.map((item) => {
                        const showTrained =
                            getCardDefaultTrainedStatus(item.card) ||
                            (useTrainedThumbnail &&
                                isTrainableCard(item.card) &&
                                item.card.cardRarityType !== "rarity_birthday");
                        const characterName = getCharacterName(t, item.card.characterId);

                        const isSelected = selectedCardIds ? selectedCardIds.includes(item.card.id) : false;

                        const cardContent = (
                            <div
                                className={`rounded-md3-md overflow-hidden bg-surface-container-low border transition-[box-shadow,border-color] duration-150 ease-md3-standard relative ${
                                    isSelected
                                        ? "ring-2 ring-primary shadow-elev-2 border-transparent"
                                        : item.isPickup
                                          ? "ring-2 ring-tertiary border-transparent shadow-elev-2"
                                          : "border-outline-variant hover:ring-2 hover:ring-primary"
                                }`}
                            >
                                {/* Card Image Container */}
                                <div className="w-full relative">
                                    <SekaiCardThumbnail card={item.card} trained={showTrained} className="w-full" />
                                    {isSelected ? (
                                        <div className="absolute top-1 right-1 z-10 px-1.5 bg-primary text-on-primary type-label-s rounded-md3-xs shadow-elev-1">
                                            ✓ {t("page.gacha.selected")}
                                        </div>
                                    ) : item.isPickup ? (
                                        <div className="absolute top-1 right-1 z-10 px-1.5 bg-tertiary text-on-tertiary type-label-s rounded-md3-xs shadow-elev-1">
                                            {t("page.gacha.upLabel")}
                                        </div>
                                    ) : null}
                                </div>

                                {/* Card Info - Persistent Footer matching /cards */}
                                <div className="px-2 py-1.5 border-t border-outline-variant">
                                    <div className="mb-0.5">
                                        <TranslatedText
                                            original={item.card.prefix}
                                            category="cards"
                                            field="prefix"
                                            originalClassName="type-label-m type-emphasized text-on-surface truncate group-hover:text-primary block"
                                            translationClassName="type-label-s text-on-surface-variant truncate block"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-1">
                                        <p className="type-label-s text-on-surface-variant truncate flex-1">
                                            {characterName}
                                        </p>
                                        {item.actualRate > 0 && (
                                            <span className="shrink-0 type-label-s text-on-surface-variant bg-surface-container-high px-1 rounded-md3-xs font-mono">
                                                {/* Below 0.005 two decimals round a real draw rate down to 0.00%. */}
                                                {item.actualRate >= 0.1
                                                    ? `${item.actualRate.toFixed(1)}%`
                                                    : item.actualRate >= 0.005
                                                        ? `${item.actualRate.toFixed(2)}%`
                                                        : "<0.01%"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );

                        if (onToggleCardSelect) {
                            const canSelectMore =
                                maxSelectCount && selectedCardIds
                                    ? selectedCardIds.length < maxSelectCount
                                    : true;
                            const isDisabled = !isSelected && !canSelectMore;

                            return (
                                <button
                                    key={item.card.id}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => {
                                        if (isDisabled) return;
                                        onToggleCardSelect(item.card);
                                    }}
                                    className={`group focus-ring rounded-md3-md block text-left w-full ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                                >
                                    {cardContent}
                                </button>
                            );
                        }

                        if (onSelectCard) {
                            return (
                                <button
                                    key={item.card.id}
                                    type="button"
                                    onClick={() => {
                                        onSelectCard(item.card);
                                        onClose();
                                    }}
                                    className="group focus-ring rounded-md3-md block text-left w-full"
                                >
                                    {cardContent}
                                </button>
                            );
                        }

                        return (
                            <Link key={item.card.id} href={`/cards/${item.card.id}`} className="group focus-ring rounded-md3-md block">
                                {cardContent}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
}
