"use client";
import React from "react";
import Link from "@/components/LocalizedLink";
import { ICardInfo, isTrainableCard, getCardDefaultTrainedStatus } from "@/types/types";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslatedText } from "@/components/common/TranslatedText";
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
    const translatedPrefix = useTranslatedText(card.prefix, "cards", "prefix");
    const tooltip = [card.prefix, translatedPrefix, getCharacterName(t, card.characterId)].filter(Boolean).join("\n");

    // Show trained thumbnail if the card's default art is after_training
    // (e.g. cards 1167 / 1458-1463 that have no normal art),
    // or when the user setting is on and the card is trainable.
    const showTrainedThumbnail = getCardDefaultTrainedStatus(card) ||
        (useTrainedThumbnail && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");

    return (
        <Link href={`${hrefPrefix}/${card.id}`} title={tooltip} className="group state-layer focus-ring flex h-full rounded-md3-md" data-shortcut-item="true">
            {/* Fills the grid row, so cards with and without a translated title line up. */}
            <div className="relative flex w-full cursor-pointer flex-col rounded-md3-md overflow-hidden bg-surface-card text-on-surface shadow-elev-1 transition-shadow duration-200 ease-md3-standard group-hover:shadow-elev-2">
                {/* Card Image Container */}
                <div className="w-full relative">
                    <SekaiCardThumbnail
                        card={card}
                        trained={showTrainedThumbnail}
                        className="w-full"
                    />
                    {isSpoiler && (
                        <span className="absolute right-1 top-1 rounded-md3-xs bg-tertiary px-1.5 type-label-s text-on-tertiary shadow-elev-1">
                            {t("common.badge.spoiler")}
                        </span>
                    )}
                </div>

                {/* Card Info: original title, its translation when on, then character and ID, set
                    small and tight so three lines fit narrow cards. The tooltip has the full text. */}
                <div className="flex flex-1 flex-col px-2 py-1.5 border-t border-outline-variant leading-tight">
                    <p className="truncate text-[11px] font-semibold text-on-surface group-hover:text-primary">{card.prefix}</p>
                    {translatedPrefix && (
                        <p className="truncate text-[10px] text-on-surface-variant">{translatedPrefix}</p>
                    )}
                    <div className="mt-auto flex items-baseline gap-1 pt-0.5 text-[10px] text-on-surface-variant">
                        <span className="min-w-0 flex-1 truncate">{getCharacterName(t, card.characterId, "short")}</span>
                        <span className="shrink-0 tabular-nums">#{card.id}</span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
