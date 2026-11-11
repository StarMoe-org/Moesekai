"use client";

import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Modal from "@/components/common/Modal";
import GachaFilters from "@/components/gacha/GachaFilters";
import { IGachaInfo, ICardInfo, GachaCategoryType, GACHA_TYPE_LABEL_KEYS, isWishGacha } from "@/types/types";
import { getGachaLogoUrl } from "@/lib/assets";
import { useTheme } from "@/contexts/ThemeContext";
import { TranslatedText } from "@/components/common/TranslatedText";
import { useI18n } from "@/contexts/I18nContext";
import { fetchMasterDataForServer, type ServerSourceType } from "@/lib/fetch";
import { loadTranslations, TranslationData } from "@/lib/translations";
import { Button, EmptyState, Icon, LoadingState } from "@/components/md3";
import { mdCasino, mdCheck, mdDeployedCode } from "@/components/md3/icons";

export interface GachaSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    gachas?: IGachaInfo[];
    cards?: ICardInfo[];
    selectedGachaId?: number | null;
    onSelectGacha: (gacha: IGachaInfo) => void;
    server?: ServerSourceType;
}

export default function GachaSelectorModal({
    isOpen,
    onClose,
    title,
    gachas: propGachas,
    cards: propCards,
    selectedGachaId,
    onSelectGacha,
    server = "jp",
}: GachaSelectorModalProps) {
    const { t, formatDate } = useI18n();
    const { isShowSpoiler, assetSource } = useTheme();
    const [now] = useState(() => Date.now());

    const [fetchedGachas, setFetchedGachas] = useState<IGachaInfo[]>([]);
    const [fetchedCards, setFetchedCards] = useState<ICardInfo[]>([]);
    const [translations, setTranslations] = useState<TranslationData | null>(null);
    const [loading, setLoading] = useState(false);

    // Filter & sort states
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"id" | "startAt">("startAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [selectedCategory, setSelectedCategory] = useState<GachaCategoryType>("all");
    const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [displayCount, setDisplayCount] = useState(24);
    const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});

    const gachas = propGachas && propGachas.length > 0 ? propGachas : fetchedGachas;
    const cards = propCards && propCards.length > 0 ? propCards : fetchedCards;

    useEffect(() => {
        if (!isOpen) return;
        let active = true;

        async function loadData() {
            const needGachas = !propGachas || propGachas.length === 0;
            const needCards = !propCards || propCards.length === 0;
            if (needGachas || needCards) setLoading(true);
            try {
                const [gachasData, cardsData, translationsData] = await Promise.all([
                    needGachas ? fetchMasterDataForServer<IGachaInfo[]>(server, "gachas.json") : Promise.resolve([]),
                    needCards ? fetchMasterDataForServer<ICardInfo[]>(server, "cards.json") : Promise.resolve([]),
                    loadTranslations(),
                ]);
                if (!active) return;
                if (needGachas) setFetchedGachas(gachasData);
                if (needCards) setFetchedCards(cardsData);
                setTranslations(translationsData);
            } catch (err) {
                console.error("Failed to load gachas in GachaSelectorModal:", err);
            } finally {
                if (active) setLoading(false);
            }
        }

        loadData();
        return () => {
            active = false;
        };
    }, [isOpen, propGachas, propCards, server]);

    const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

    const filteredGachas = useMemo(() => {
        let result = [...gachas];

        if (selectedCategory !== "all") {
            if (selectedCategory === "wish_pick") {
                result = result.filter((g) => isWishGacha(g));
            } else if (selectedCategory === "normal_pickup") {
                result = result.filter((g) => !isWishGacha(g));
            }
        }

        if (selectedCharacters.length > 0) {
            result = result.filter((gacha) => {
                const pickupCharIds = new Set<number>();
                for (const pickup of gacha.gachaPickups || []) {
                    const card = cardMap.get(pickup.cardId);
                    if (card) pickupCharIds.add(card.characterId);
                }
                return selectedCharacters.some((charId) => pickupCharIds.has(charId));
            });
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            const queryAsNumber = parseInt(query, 10);
            result = result.filter((gacha) => {
                if (gacha.id === queryAsNumber) return true;
                if (gacha.name.toLowerCase().includes(query)) return true;
                const chineseName = translations?.gacha?.name?.[gacha.name];
                if (chineseName && chineseName.toLowerCase().includes(query)) return true;
                return false;
            });
        }

        if (!isShowSpoiler) {
            result = result.filter((gacha) => gacha.startAt <= now);
        }

        result.sort((a, b) => {
            const cmp = sortBy === "id" ? a.id - b.id : a.startAt - b.startAt;
            return sortOrder === "asc" ? cmp : -cmp;
        });

        return result;
    }, [gachas, cardMap, selectedCategory, selectedCharacters, searchQuery, isShowSpoiler, now, sortBy, sortOrder, translations]);

    const modalTitle = title || t("page.gachaSimulator.selector.modalTitle", { count: gachas.length });

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="xl">
            <div className="space-y-4 min-h-[60vh]">
                <GachaFilters
                    searchQuery={searchQuery}
                    onSearchChange={(q) => {
                        setSearchQuery(q);
                        setDisplayCount(24);
                    }}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={(nextSort, nextOrder) => {
                        setSortBy(nextSort);
                        setSortOrder(nextOrder);
                        setDisplayCount(24);
                    }}
                    selectedCategory={selectedCategory}
                    onCategoryChange={(cat) => {
                        setSelectedCategory(cat);
                        setDisplayCount(24);
                    }}
                    selectedCharacters={selectedCharacters}
                    onCharacterChange={(chars) => {
                        setSelectedCharacters(chars);
                        setDisplayCount(24);
                    }}
                    selectedUnitIds={selectedUnitIds}
                    onUnitIdsChange={(units) => {
                        setSelectedUnitIds(units);
                        setDisplayCount(24);
                    }}
                    totalGachas={gachas.length}
                    filteredGachas={filteredGachas.length}
                />

                {loading ? (
                    <LoadingState label={t("common.state.loading")} className="min-h-[30vh]" />
                ) : filteredGachas.length === 0 ? (
                    <EmptyState
                        icon={mdDeployedCode}
                        title={t("page.gacha.noResult")}
                        description={t("page.gacha.noResultHint")}
                    />
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 max-h-[58vh] overflow-y-auto pr-1">
                            {filteredGachas.slice(0, displayCount).map((gacha) => {
                                const isSelected = selectedGachaId === gacha.id;
                                const isUnreleased = gacha.startAt > now;
                                const isOngoing = gacha.startAt <= now && gacha.endAt >= now;
                                const logoUrl = getGachaLogoUrl(gacha.assetbundleName, assetSource);
                                const typeLabelKey = GACHA_TYPE_LABEL_KEYS[gacha.gachaType];
                                const typeLabel = typeLabelKey ? t(typeLabelKey) : gacha.gachaType;

                                return (
                                    <button
                                        key={gacha.id}
                                        type="button"
                                        onClick={() => {
                                            onSelectGacha(gacha);
                                            onClose();
                                        }}
                                        className={`state-layer focus-ring group text-left rounded-md3-md overflow-hidden bg-surface-container-low border transition-shadow duration-150 ${
                                            isSelected
                                                ? "ring-2 ring-primary border-transparent shadow-elev-2"
                                                : "border-outline-variant hover:ring-2 hover:ring-primary"
                                        }`}
                                    >
                                        <div className="relative aspect-[16/9] bg-surface-container-high">
                                            {failedLogos[logoUrl] ? (
                                                <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant">
                                                    <Icon path={mdCasino} size={36} />
                                                </div>
                                            ) : (
                                                <Image
                                                    src={logoUrl}
                                                    alt={gacha.name}
                                                    fill
                                                    className="object-contain p-2"
                                                    unoptimized
                                                    onError={() =>
                                                        setFailedLogos((prev) => ({ ...prev, [logoUrl]: true }))
                                                    }
                                                />
                                            )}

                                            {/* Top Right Badges */}
                                            <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                                                {isSelected && (
                                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 type-label-s bg-primary text-on-primary rounded-full shadow-elev-1">
                                                        <Icon path={mdCheck} size={12} />
                                                        {t("page.gacha.selected")}
                                                    </span>
                                                )}
                                                {isUnreleased && isShowSpoiler && (
                                                    <span className="px-2 py-0.5 type-label-s bg-tertiary text-on-tertiary rounded-full shadow-elev-1">
                                                        {t("common.badge.spoiler")}
                                                    </span>
                                                )}
                                                {isOngoing && (
                                                    <span className="px-2 py-0.5 type-label-s bg-primary text-on-primary rounded-full shadow-elev-1">
                                                        {t("common.badge.ongoing")}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Bottom Left ID & Type Badge */}
                                            <div className="absolute bottom-2 left-2 flex items-center gap-1">
                                                <span className="px-2 py-0.5 type-label-s font-mono bg-inverse-surface/80 text-inverse-on-surface rounded-full">
                                                    #{gacha.id}
                                                </span>
                                                <span className="px-2 py-0.5 type-label-s bg-tertiary-container text-on-tertiary-container rounded-full">
                                                    {typeLabel}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-3">
                                            <div className="type-title-s text-on-surface group-hover:text-primary transition-colors">
                                                <TranslatedText
                                                    original={gacha.name}
                                                    category="gacha"
                                                    field="name"
                                                    originalClassName="block truncate"
                                                    translationClassName="type-body-s text-on-surface-variant block truncate"
                                                />
                                            </div>
                                            <div className="mt-1 flex items-center justify-between gap-2 type-label-s text-on-surface-variant">
                                                <span>
                                                    {formatDate(gacha.startAt, {
                                                        year: "numeric",
                                                        month: "2-digit",
                                                        day: "2-digit",
                                                    })}{" "}
                                                    ~{" "}
                                                    {formatDate(gacha.endAt, {
                                                        year: "numeric",
                                                        month: "2-digit",
                                                        day: "2-digit",
                                                    })}
                                                </span>
                                                {(gacha.gachaPickups?.length || 0) > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-md3-xs bg-surface-container-high font-mono">
                                                        UP ×{gacha.gachaPickups.length}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {filteredGachas.length > displayCount && (
                            <div className="pt-2 text-center">
                                <Button
                                    type="button"
                                    variant="tonal"
                                    size="s"
                                    onClick={() => setDisplayCount((prev) => prev + 24)}
                                >
                                    {t("page.gacha.loadMore")} ({Math.min(displayCount, filteredGachas.length)} /{" "}
                                    {filteredGachas.length})
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}
