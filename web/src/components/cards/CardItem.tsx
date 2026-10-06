"use client";
import React from "react";
import Link from "@/components/LocalizedLink";
import { ICardInfo, isTrainableCard, getCardDefaultTrainedStatus } from "@/types/types";
import { useTheme } from "@/contexts/ThemeContext";
import { TranslatedText } from "@/components/common/TranslatedText";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";

interface CardItemProps {
    card: ICardInfo;
    isSpoiler?: boolean;
    hrefPrefix?: string; // default: "/cards"
}

export default function CardItem({ card, isSpoiler, hrefPrefix = "/cards" }: CardItemProps) {
    const { useTrainedThumbnail } = useTheme();
    const { t } = useI18n();
    const characterName = getCharacterName(t, card.characterId);

    // Show trained thumbnail if the card's default art is after_training
    // (e.g. cards 1167 / 1458-1463 that have no normal art),
    // or when the user setting is on and the card is trainable.
    const showTrainedThumbnail = getCardDefaultTrainedStatus(card) ||
        (useTrainedThumbnail && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");

    return (
        <Link href={`${hrefPrefix}/${card.id}`} className="group state-layer focus-ring block rounded-md3-md" data-shortcut-item="true">
            <div className="relative cursor-pointer rounded-md3-md overflow-hidden bg-surface-card text-on-surface shadow-elev-1 transition-shadow duration-200 ease-md3-standard group-hover:shadow-elev-2">
                {/* Card Image Container */}
                <div className="w-full relative">
                    <SekaiCardThumbnail
                        card={card}
                        trained={showTrainedThumbnail}
                        className="w-full"
                    />
                </div>

                {/* Card Info - Persistent Footer */}
                <div className="px-2 py-1.5 border-t border-outline-variant">
                    {/* Spoiler Badge - inline in footer */}
                    {isSpoiler && (
                        <div className="mb-0.5">
                            <span className="inline-block px-1.5 bg-tertiary text-on-tertiary type-label-s rounded-md3-xs">
                                {t("common.badge.spoiler")}
                            </span>
                        </div>
                    )}
                    <div className="mb-0.5">
                        <TranslatedText
                            original={card.prefix}
                            category="cards"
                            field="prefix"
                            originalClassName="type-label-m type-emphasized text-on-surface truncate group-hover:text-primary block"
                            translationClassName="type-label-s text-on-surface-variant truncate block"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-1">
                        <p className="type-label-s text-on-surface-variant truncate flex-1">{characterName}</p>
                        <span className="flex-shrink-0 type-label-s text-on-surface-variant bg-surface-container-high px-1 rounded-md3-xs font-mono">
                            #{card.id}
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
