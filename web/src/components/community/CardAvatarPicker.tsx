"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "@/contexts/TranslationContext";
import { getCharacterName } from "@/lib/i18n";
import { getCharacterIconUrl } from "@/lib/assets";
import {
    getCardAvatarImageUrls,
    useCommunityCards,
} from "@/lib/community-masterdata";
import { getCommunityErrorMessage } from "@/lib/community-api";
import { patchCommunitySessionPreferences } from "@/lib/community-session";
import {
    UNIT_DATA,
    getCardDefaultTrainedStatus,
    getRarityNumber,
    isTrainableCard,
    type CardRarityType,
    type ICardInfo,
} from "@/types/types";
import type { CommunityProfile } from "@/types/community";
import CommunityAvatar from "./CommunityAvatar";
import {
    Banner,
    Button,
    Chip,
    Dialog,
    EmptyState,
    LoadingState,
    SegmentedButton,
    TextField,
    cn,
} from "@/components/md3";
import { mdCheck, mdRestartAlt, mdSearch } from "@/components/md3/icons";

const PAGE_SIZE = 60;
const ALL_CHAR_IDS = UNIT_DATA.flatMap((u) => u.charIds);

const RARITY_FILTERS: readonly { id: CardRarityType | "all"; label?: string }[] = [
    { id: "all" },
    { id: "rarity_4", label: "4★" },
    { id: "rarity_birthday", label: "BD" },
    { id: "rarity_3", label: "3★" },
    { id: "rarity_2", label: "2★" },
    { id: "rarity_1", label: "1★" },
];

function CardThumbImg({
    primaryUrl,
    jpFallbackUrl,
    alt,
}: {
    primaryUrl: string;
    jpFallbackUrl: string;
    alt: string;
}) {
    const [usedJp, setUsedJp] = useState(false);
    const src = usedJp ? jpFallbackUrl : primaryUrl;
    return (
        <img
            src={src}
            alt={alt}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => {
                if (!usedJp && jpFallbackUrl !== primaryUrl) {
                    setUsedJp(true);
                }
            }}
        />
    );
}

interface CardAvatarPickerProps {
    isOpen: boolean;
    onClose: () => void;
    profile: CommunityProfile;
    onSaved: (updated: CommunityProfile, wasReset: boolean) => void;
}

export function CardAvatarPicker({
    isOpen,
    onClose,
    profile,
    onSaved,
}: CardAvatarPickerProps) {
    const { t } = useI18n();
    const { assetSource, serverSource, isShowSpoiler } = useTheme();
    const { t: translateGameData } = useTranslation();
    const { cards, cardsMap, localCardIds, loading } = useCommunityCards(isOpen);

    const [selectedCardId, setSelectedCardId] = useState<number | null>(
        profile.avatar_card_id ?? null,
    );
    const [selectedTrained, setSelectedTrained] = useState<boolean>(
        Boolean(profile.avatar_card_trained),
    );
    const [wasOpen, setWasOpen] = useState(isOpen);

    const [selectedCharId, setSelectedCharId] = useState<number | null>(null);
    const [selectedRarity, setSelectedRarity] = useState<CardRarityType | "all">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
    const [nowTs] = useState<number>(() => Date.now());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Re-sync draft selection whenever dialog opens
    if (wasOpen !== isOpen) {
        setWasOpen(isOpen);
        if (isOpen) {
            setSelectedCardId(profile.avatar_card_id ?? null);
            setSelectedTrained(Boolean(profile.avatar_card_trained));
            setError(null);
            setVisibleLimit(PAGE_SIZE);
        }
    }

    const selectedCard = useMemo<ICardInfo | undefined>(
        () => (selectedCardId ? cardsMap?.get(selectedCardId) : undefined),
        [cardsMap, selectedCardId],
    );

    const selectedAlwaysTrained = selectedCard ? getCardDefaultTrainedStatus(selectedCard) : false;
    const selectedCanToggleTrained = Boolean(
        selectedCard && isTrainableCard(selectedCard) && !selectedAlwaysTrained,
    );
    const effectiveTrained = selectedCard
        ? selectedAlwaysTrained || (selectedTrained && isTrainableCard(selectedCard))
        : false;

    const filteredCards = useMemo<ICardInfo[]>(() => {
        const q = searchQuery.trim().toLowerCase();
        const result = cards.filter((card) => {
            if (!isShowSpoiler && card.releaseAt && card.releaseAt > nowTs) {
                return false;
            }
            if (selectedCharId !== null && card.characterId !== selectedCharId) {
                return false;
            }
            if (selectedRarity !== "all" && card.cardRarityType !== selectedRarity) {
                return false;
            }
            if (!q) return true;
            const charName = getCharacterName(t, card.characterId).toLowerCase();
            const translated = translateGameData("cards", "prefix", card.prefix)?.toLowerCase() ?? "";
            return (
                String(card.id).includes(q) ||
                card.prefix.toLowerCase().includes(q) ||
                translated.includes(q) ||
                charName.includes(q)
            );
        });
        return [...result].sort((a, b) => b.id - a.id);
    }, [cards, isShowSpoiler, nowTs, searchQuery, selectedCharId, selectedRarity, t, translateGameData]);

    const displayedCards = useMemo(
        () => filteredCards.slice(0, visibleLimit),
        [filteredCards, visibleLimit],
    );

    const handleSelectCard = (card: ICardInfo) => {
        setSelectedCardId(card.id);
        if (getCardDefaultTrainedStatus(card)) {
            setSelectedTrained(true);
        } else if (!isTrainableCard(card)) {
            setSelectedTrained(false);
        }
        setError(null);
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const updated = await patchCommunitySessionPreferences({
                avatar_card_id: selectedCardId,
                avatar_card_trained: selectedCardId ? effectiveTrained : false,
            });
            onSaved(updated, selectedCardId === null);
            onClose();
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        setSaving(true);
        setError(null);
        try {
            const updated = await patchCommunitySessionPreferences({
                avatar_card_id: null,
                avatar_card_trained: false,
            });
            setSelectedCardId(null);
            setSelectedTrained(false);
            onSaved(updated, true);
            onClose();
        } catch (err) {
            setError(getCommunityErrorMessage(err, t));
        } finally {
            setSaving(false);
        }
    };

    const selectedCardTitle = selectedCard
        ? translateGameData("cards", "prefix", selectedCard.prefix) || selectedCard.prefix
        : null;

    const hasExistingOrDraftCard = Boolean(profile.avatar_card_id || selectedCardId);

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={t("page.community.avatarPicker.title")}
            size="lg"
            fullscreenOnMobile
            className="sm:h-[min(85vh,760px)]"
            bodyClassName="flex flex-col gap-3 overflow-hidden"
            actions={
                <>
                    {hasExistingOrDraftCard && (
                        <Button
                            variant="text"
                            icon={mdRestartAlt}
                            disabled={saving}
                            onClick={() => void handleReset()}
                            className="mr-auto"
                        >
                            {t("page.community.avatarPicker.resetDefault")}
                        </Button>
                    )}
                    <Button variant="text" onClick={onClose} disabled={saving}>
                        {t("common.action.cancel")}
                    </Button>
                    <Button
                        variant="filled"
                        icon={mdCheck}
                        disabled={saving || !selectedCardId}
                        onClick={() => void handleSave()}
                    >
                        {saving
                            ? t("page.community.avatarPicker.saving")
                            : t("page.community.avatarPicker.save")}
                    </Button>
                </>
            }
        >
            {/* Live circular preview & trained toggle */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md3-md bg-surface-container p-3">
                <div className="flex min-w-0 items-center gap-3">
                    <CommunityAvatar
                        displayName={profile.display_name}
                        avatarUrl={profile.avatar_url}
                        avatarCardId={selectedCardId}
                        avatarCardTrained={effectiveTrained}
                        sizeClassName="h-14 w-14 ring-2 ring-primary/40"
                        textClassName="type-title-l"
                    />
                    <div className="min-w-0">
                        {selectedCard && selectedCardTitle ? (
                            <>
                                <p className="truncate type-title-s text-on-surface">
                                    {selectedCardTitle}
                                </p>
                                <p className="truncate type-label-m text-on-surface-variant">
                                    {getCharacterName(t, selectedCard.characterId)} ·{" "}
                                    {selectedCard.cardRarityType === "rarity_birthday"
                                        ? "BD"
                                        : `${getRarityNumber(selectedCard.cardRarityType)}★`}{" "}
                                    · #{selectedCard.id}
                                </p>
                            </>
                        ) : (
                            <p className="type-body-m text-on-surface-variant">
                                {t("page.community.avatarPicker.previewDefault")}
                            </p>
                        )}
                    </div>
                </div>

                {selectedCanToggleTrained ? (
                    <SegmentedButton<"normal" | "trained">
                        aria-label={t("page.community.avatarPicker.trained")}
                        value={effectiveTrained ? "trained" : "normal"}
                        onValueChange={(val) => setSelectedTrained(val === "trained")}
                        density={-1}
                        className="w-44 shrink-0"
                        options={[
                            { value: "normal", label: t("page.community.avatarPicker.normal") },
                            { value: "trained", label: t("page.community.avatarPicker.trained") },
                        ]}
                    />
                ) : selectedCard && !selectedAlwaysTrained ? (
                    <span className="shrink-0 type-label-s text-on-surface-variant">
                        {t("page.community.avatarPicker.notTrainable")}
                    </span>
                ) : null}
            </div>

            {error && (
                <div className="shrink-0">
                    <Banner tone="error">{error}</Banner>
                </div>
            )}

            {/* Search & rarity filter */}
            <div className="flex shrink-0 flex-col gap-2">
                <TextField
                    value={searchQuery}
                    onValueChange={(value) => {
                        setSearchQuery(value);
                        setVisibleLimit(PAGE_SIZE);
                    }}
                    icon={mdSearch}
                    clearable
                    placeholder={t("page.community.avatarPicker.searchPlaceholder")}
                />
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5 sm:flex-wrap sm:overflow-visible">
                    {RARITY_FILTERS.map((rf) => (
                        <Chip
                            key={rf.id}
                            variant="filter"
                            selected={selectedRarity === rf.id}
                            className="shrink-0"
                            onClick={() => {
                                setSelectedRarity(rf.id);
                                setVisibleLimit(PAGE_SIZE);
                            }}
                        >
                            {rf.id === "all"
                                ? t("page.community.avatarPicker.allRarities")
                                : rf.label}
                        </Chip>
                    ))}
                </div>
            </div>

            {/* Unclipped character avatar strip */}
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto scrollbar-hide px-1 py-1.5 sm:flex-wrap sm:overflow-visible">
                <button
                    type="button"
                    onClick={() => {
                        setSelectedCharId(null);
                        setVisibleLimit(PAGE_SIZE);
                    }}
                    aria-pressed={selectedCharId === null}
                    title={t("page.community.avatarPicker.allCharacters")}
                    className={cn(
                        "state-layer focus-ring flex h-8 shrink-0 items-center justify-center rounded-full px-2.5 type-label-s transition-colors",
                        selectedCharId === null
                            ? "bg-primary-container text-on-primary-container"
                            : "border border-outline-variant text-on-surface-variant hover:border-primary",
                    )}
                >
                    {t("common.comments.stickerPicker.all")}
                </button>
                {ALL_CHAR_IDS.map((charId) => {
                    const name = getCharacterName(t, charId);
                    const active = selectedCharId === charId;
                    return (
                        <button
                            key={charId}
                            type="button"
                            onClick={() => {
                                setSelectedCharId(active ? null : charId);
                                setVisibleLimit(PAGE_SIZE);
                            }}
                            title={name}
                            aria-label={name}
                            aria-pressed={active}
                            className={cn(
                                "focus-ring relative h-8 w-8 shrink-0 overflow-hidden rounded-full transition-shadow",
                                active
                                    ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-high"
                                    : "ring-1 ring-outline-variant hover:ring-primary",
                            )}
                        >
                            <Image
                                src={getCharacterIconUrl(charId)}
                                alt={name}
                                fill
                                className="object-cover"
                                unoptimized
                            />
                        </button>
                    );
                })}
            </div>

            {/* Scrollable card face grid */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md3-md bg-surface-container p-2.5">
                {loading && cards.length === 0 ? (
                    <LoadingState label={t("common.state.loading")} />
                ) : displayedCards.length === 0 ? (
                    <EmptyState
                        title={t("page.community.avatarPicker.empty")}
                        description={t("page.community.avatarPicker.emptyHint")}
                    />
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                            {displayedCards.map((card) => {
                                const isSelected = selectedCardId === card.id;
                                const previewTrained =
                                    getCardDefaultTrainedStatus(card) ||
                                    (selectedTrained && isTrainableCard(card));
                                const urls = getCardAvatarImageUrls(
                                    card,
                                    previewTrained,
                                    assetSource,
                                    serverSource,
                                    localCardIds ? localCardIds.has(card.id) : undefined,
                                );
                                const translatedPrefix =
                                    translateGameData("cards", "prefix", card.prefix) || card.prefix;
                                const rarityLabel =
                                    card.cardRarityType === "rarity_birthday"
                                        ? "BD"
                                        : `${getRarityNumber(card.cardRarityType)}★`;

                                return (
                                    <button
                                        key={card.id}
                                        type="button"
                                        onClick={() => handleSelectCard(card)}
                                        aria-pressed={isSelected}
                                        title={`${translatedPrefix} (#${card.id})`}
                                        className={cn(
                                            "state-layer focus-ring relative flex flex-col items-center gap-1.5 rounded-md3-md p-2 text-center transition-colors",
                                            isSelected
                                                ? "bg-primary-container/60 ring-2 ring-primary"
                                                : "bg-surface-container-lowest hover:bg-surface-container-high",
                                        )}
                                    >
                                        <span className="relative block h-14 w-14 overflow-hidden rounded-full bg-surface-container-high ring-1 ring-outline-variant/60">
                                            <CardThumbImg
                                                key={`${card.id}-${previewTrained}-${assetSource}-${serverSource}`}
                                                primaryUrl={urls.primaryUrl}
                                                jpFallbackUrl={urls.jpFallbackUrl}
                                                alt={translatedPrefix}
                                            />
                                        </span>
                                        <span className="absolute left-1.5 top-1.5 rounded-md3-xs bg-surface-container-high/90 px-1 py-0.5 type-label-s text-on-surface-variant">
                                            {rarityLabel}
                                        </span>
                                        <span className="w-full truncate type-label-s text-on-surface-variant">
                                            {translatedPrefix}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {filteredCards.length > visibleLimit && (
                            <div className="mt-3 text-center">
                                <Button
                                    variant="tonal"
                                    size="xs"
                                    onClick={() => setVisibleLimit((prev) => prev + PAGE_SIZE)}
                                >
                                    {t("common.comments.loadMore")}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Dialog>
    );
}

export default CardAvatarPicker;
