"use client";
import React from "react";
import Link from "@/components/LocalizedLink";
import {
    ICardInfo,
    ISkillInfo,
    isTrainableCard,
    getCardDefaultTrainedStatus,
    getCardUnitField,
    UNIT_FIELD_LABEL_KEYS,
} from "@/types/types";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslatedText } from "@/components/common/TranslatedText";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import SekaiCardLarge from "@/components/cards/SekaiCardLarge";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import { getCharacterChibiIconUrl, getUnitTabIconUrl } from "@/lib/assets";
import { getCardMaxSkillMultiplier } from "@/lib/skill";
import { getCardSupplyMeta } from "@/hooks/useCardSupplyType";
import { Icon } from "@/components/md3";

interface CardItemProps {
    card: ICardInfo;
    isSpoiler?: boolean;
    hrefPrefix?: string; // default: "/cards"
    variant?: "compact" | "large";
    skillsMap?: Map<number, ISkillInfo>;
}

export default function CardItem({ card, isSpoiler, hrefPrefix = "/cards", variant = "compact", skillsMap }: CardItemProps) {
    const { useTrainedThumbnail, assetSource } = useTheme();
    const { t } = useI18n();
    const translatedPrefix = useTranslatedText(card.prefix, "cards", "prefix");
    const characterName = getCharacterName(t, card.characterId);
    const tooltip = [card.prefix, translatedPrefix, characterName].filter(Boolean).join("\n");

    // Show trained thumbnail if the card's default art is after_training
    // (e.g. cards 1167 / 1458-1463 that have no normal art),
    // or when the user setting is on and the card is trainable.
    const showTrainedThumbnail = getCardDefaultTrainedStatus(card) ||
        (useTrainedThumbnail && isTrainableCard(card) && card.cardRarityType !== "rarity_birthday");

    if (variant === "large") {
        const unitField = getCardUnitField(card);
        const unitIconUrl = getUnitTabIconUrl(unitField, assetSource);
        const unitLabel = t(UNIT_FIELD_LABEL_KEYS[unitField] ?? "common.units.vs");
        const chibiUrl = getCharacterChibiIconUrl(card.characterId, assetSource);
        const supplyType = card.cardSupplyType || "normal";
        const supplyKey = `common.cardSupplyTypes.${supplyType}`;
        const translatedSupply = t(supplyKey);
        const supplyLabel = translatedSupply !== supplyKey ? translatedSupply : supplyType;
        const supplyMeta = getCardSupplyMeta(supplyType);
        const maxSkillMultiplier = getCardMaxSkillMultiplier(card, skillsMap);
        const skillTooltip = maxSkillMultiplier !== null ? `${supplyLabel} · ${maxSkillMultiplier}%` : supplyLabel;

        return (
            <Link href={`${hrefPrefix}/${card.id}`} title={tooltip} className="group state-layer focus-ring flex h-full rounded-t-none rounded-b-md3-md [content-visibility:auto] [contain-intrinsic-size:auto_220px]" data-shortcut-item="true">
                <div className="relative flex w-full cursor-pointer flex-col rounded-t-none rounded-b-md3-md overflow-hidden bg-surface-card text-on-surface shadow-elev-1 transition-shadow duration-200 ease-md3-standard group-hover:shadow-elev-2">
                    <div className="w-full relative">
                        <SekaiCardLarge card={card} />
                        {isSpoiler && (
                            <span className="absolute right-2.5 bottom-3 rounded-md3-xs bg-tertiary px-1.5 py-0.5 type-label-s text-on-tertiary shadow-elev-1">
                                {t("common.badge.spoiler")}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-1 flex-col px-2.5 py-2 border-t border-outline-variant leading-tight">
                        <p className="truncate type-label-l text-on-surface group-hover:text-primary">{card.prefix}</p>
                        {translatedPrefix && (
                            <p className="truncate type-label-s text-on-surface-variant">{translatedPrefix}</p>
                        )}
                        <div className="mt-auto pt-1.5">
                            <div className="flex items-center gap-2 border-t border-outline-variant/50 pt-1.5">
                            <div className="relative h-8 w-8 shrink-0">
                                <img
                                    src={chibiUrl}
                                    alt={characterName}
                                    title={characterName}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-contain"
                                />
                                <img
                                    src={unitIconUrl}
                                    alt={unitLabel}
                                    title={unitLabel}
                                    loading="lazy"
                                    decoding="async"
                                    className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-surface-card p-0.5 object-contain shadow-elev-1"
                                />
                            </div>
                            <div className="min-w-0 flex-1 leading-tight">
                                <p className="truncate type-label-m text-on-surface-variant">{characterName}</p>
                                <p className="truncate type-label-s text-outline tabular-nums">#{card.id}</p>
                            </div>
                            <span
                                title={skillTooltip}
                                className={`inline-flex shrink-0 items-center gap-1 type-label-m font-semibold tabular-nums ${supplyMeta.colorClass}`}
                            >
                                <Icon path={supplyMeta.icon} size={15} className="shrink-0" />
                                {maxSkillMultiplier !== null && <span>{maxSkillMultiplier}%</span>}
                            </span>
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        );
    }

    return (
        <Link href={`${hrefPrefix}/${card.id}`} title={tooltip} className="group state-layer focus-ring flex h-full rounded-md3-md [content-visibility:auto] [contain-intrinsic-size:auto_185px]" data-shortcut-item="true">
            {/* Fills the grid row, so cards with and without a translated title line up. */}
            <div className="relative flex w-full cursor-pointer flex-col rounded-md3-md overflow-hidden bg-surface-card text-on-surface shadow-elev-1 transition-shadow duration-200 ease-md3-standard group-hover:shadow-elev-2">
                {/* Card Image Container */}
                <div className="w-full relative">
                    <SekaiCardThumbnail
                        card={card}
                        trained={showTrainedThumbnail}
                        className="w-full"
                        hoverSwitch
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
