"use client";
import React from "react";
import Link from "@/components/LocalizedLink";
import {
    ATTR_NAMES,
    CARD_RARITY_MAX_LEVELS,
    getCardDefaultTrainedStatus,
    getCardUnitField,
    getRarityNumber,
    ICardInfo,
    ISkillInfo,
    isTrainableCard,
    UNIT_FIELD_LABEL_KEYS,
} from "@/types/types";
import { getAttrIconUrl, getCharacterChibiIconUrl, getUnitTabIconUrl } from "@/lib/assets";
import { getCardMaxSkillMultiplier, getCardSkillTypes } from "@/lib/skill";
import { getCardSupplyMeta } from "@/hooks/useCardSupplyType";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";
import { TranslatedText } from "@/components/common/TranslatedText";
import SekaiCardThumbnail from "./SekaiCardThumbnail";
import { Icon } from "@/components/md3";

interface CardParameterRowLike {
    id?: number;
    cardLevel?: number;
    cardParameterType: "param1" | "param2" | "param3";
    power: number;
}

function getCardMaxBasePower(card: ICardInfo): number | null {
    const levels = CARD_RARITY_MAX_LEVELS[card.cardRarityType];
    const maxLevel = levels?.trained || levels?.normal || 1;
    const trainedBonus = levels?.trained
        ? (card.specialTrainingPower1BonusFixed +
            card.specialTrainingPower2BonusFixed +
            card.specialTrainingPower3BonusFixed)
        : 0;

    const rawParams = card.cardParameters as ICardInfo["cardParameters"] | CardParameterRowLike[] | undefined;
    if (!rawParams) return null;

    if (Array.isArray(rawParams)) {
        const pickMax = (type: CardParameterRowLike["cardParameterType"]) => {
            const rows = rawParams
                .filter((r) => r.cardParameterType === type)
                .sort((a, b) => (a.cardLevel ?? a.id ?? 0) - (b.cardLevel ?? b.id ?? 0));
            if (rows.length === 0) return 0;
            const exact = rows.find((r) => r.cardLevel === maxLevel);
            return (exact ?? rows[rows.length - 1]).power || 0;
        };
        const total = pickMax("param1") + pickMax("param2") + pickMax("param3") + trainedBonus;
        return total > 0 ? total : null;
    }

    const idx = maxLevel - 1;
    const p1 = rawParams.param1?.[idx] ?? rawParams.param1?.[rawParams.param1.length - 1] ?? 0;
    const p2 = rawParams.param2?.[idx] ?? rawParams.param2?.[rawParams.param2.length - 1] ?? 0;
    const p3 = rawParams.param3?.[idx] ?? rawParams.param3?.[rawParams.param3.length - 1] ?? 0;
    const total = p1 + p2 + p3 + trainedBonus;
    return total > 0 ? total : null;
}

interface CardTableProps {
    cards: ICardInfo[];
    hrefPrefix?: string;
    skillsMap?: Map<number, ISkillInfo>;
}

export default function CardTable({ cards, hrefPrefix = "/cards", skillsMap }: CardTableProps) {
    const [now] = React.useState(() => Date.now());
    const { assetSource } = useTheme();
    const { t, formatDate } = useI18n();

    return (
        <div className="overflow-x-auto rounded-md3-md border border-outline-variant bg-surface-container-low">
            <table className="w-full min-w-[960px] border-collapse text-left type-body-m text-on-surface">
                <thead className="bg-surface-container-high type-label-l text-on-surface-variant">
                    <tr>
                        <th scope="col" className="w-36 p-3">
                            <span className="sr-only">{t("page.mysekai.detail.thumbnail")}</span>
                        </th>
                        <th scope="col" className="w-20 p-3">ID</th>
                        <th scope="col" className="min-w-[180px] p-3">{t("common.field.name")}</th>
                        <th scope="col" className="min-w-[150px] p-3">{t("common.filter.character")}</th>
                        <th scope="col" className="w-28 p-3">{t("common.filter.attribute")}</th>
                        <th scope="col" className="w-28 p-3">{t("common.filter.cardType")}</th>
                        <th scope="col" className="min-w-[190px] p-3">{t("page.cards.skillTitle")}</th>
                        <th scope="col" className="w-24 p-3 text-right">{t("page.cards.totalPower")}</th>
                        <th scope="col" className="w-28 p-3 text-right">{t("page.cards.releasedAtLabel")}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                    {cards.map((card) => {
                        const href = `${hrefPrefix}/${card.id}`;
                        const releaseTs = card.releaseAt || card.archivePublishedAt || 0;
                        const isSpoiler = releaseTs > now;
                        const isBirthday = card.cardRarityType === "rarity_birthday";
                        const rarityNum = getRarityNumber(card.cardRarityType);
                        const characterName = getCharacterName(t, card.characterId);
                        const unitField = getCardUnitField(card);
                        const unitLabel = t(UNIT_FIELD_LABEL_KEYS[unitField] ?? "common.units.vs");
                        const supplyType = card.cardSupplyType || "normal";
                        const supplyKey = `common.cardSupplyTypes.${supplyType}`;
                        const translatedSupply = t(supplyKey);
                        const supplyLabel = translatedSupply !== supplyKey ? translatedSupply : supplyType;
                        const supplyMeta = getCardSupplyMeta(supplyType);

                        const primarySkill =
                            (card.specialTrainingSkillId ? skillsMap?.get(card.specialTrainingSkillId) : undefined) ??
                            skillsMap?.get(card.skillId);
                        const skillTypes = getCardSkillTypes(primarySkill);
                        const maxMultiplier = getCardMaxSkillMultiplier(card, skillsMap);
                        const skillName = card.specialTrainingSkillName || card.cardSkillName;
                        const maxPower = getCardMaxBasePower(card);

                        const thumbs = getCardDefaultTrainedStatus(card)
                            ? [true]
                            : isTrainableCard(card) && !isBirthday
                                ? [false, true]
                                : [false];

                        return (
                            <tr key={card.id} className="hover:bg-surface-container">
                                {/* Thumbnails */}
                                <td className="p-2.5">
                                    <div className="flex items-start gap-1.5">
                                        {thumbs.map((trained) => (
                                            <Link
                                                key={String(trained)}
                                                href={href}
                                                className="w-14 shrink-0 text-center"
                                            >
                                                <SekaiCardThumbnail card={card} trained={trained} className="w-14" />
                                                <span className="mt-0.5 block type-label-s text-on-surface-variant">
                                                    {t(trained ? "page.cards.afterTrained" : "page.cards.beforeTrained")}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                </td>

                                {/* ID + Spoiler */}
                                <td className="p-3 align-middle">
                                    <div className="type-label-m font-mono text-on-surface-variant tabular-nums">#{card.id}</div>
                                    {isSpoiler && (
                                        <span className="mt-1 inline-block rounded-md3-xs bg-tertiary px-1.5 py-0.5 type-label-s text-on-tertiary">
                                            {t("common.badge.spoiler")}
                                        </span>
                                    )}
                                </td>

                                {/* Name */}
                                <th scope="row" className="p-3 align-middle font-normal">
                                    <Link
                                        href={href}
                                        data-shortcut-item="true"
                                        className="state-layer focus-ring block rounded-md3-xs py-1 type-title-s text-primary"
                                    >
                                        <TranslatedText
                                            original={card.prefix}
                                            category="cards"
                                            field="prefix"
                                            translationClassName="block type-body-s text-on-surface-variant mt-0.5"
                                        />
                                    </Link>
                                </th>

                                {/* Character + Unit */}
                                <td className="p-3 align-middle">
                                    <div className="flex items-center gap-2">
                                        <div className="relative h-8 w-8 shrink-0">
                                            <img
                                                src={getCharacterChibiIconUrl(card.characterId, assetSource)}
                                                alt={characterName}
                                                loading="lazy"
                                                decoding="async"
                                                className="h-full w-full object-contain"
                                            />
                                            <img
                                                src={getUnitTabIconUrl(unitField, assetSource)}
                                                alt={unitLabel}
                                                title={unitLabel}
                                                loading="lazy"
                                                decoding="async"
                                                className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-surface-card p-0.5 object-contain shadow-elev-1"
                                            />
                                        </div>
                                        <div className="min-w-0 leading-tight">
                                            <div className="truncate type-label-l text-on-surface">{characterName}</div>
                                            <div className="truncate type-label-s text-on-surface-variant">{unitLabel}</div>
                                        </div>
                                    </div>
                                </td>

                                {/* Attribute & Rarity */}
                                <td className="p-3 align-middle">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5">
                                            <img
                                                src={getAttrIconUrl(card.attr, assetSource)}
                                                alt={ATTR_NAMES[card.attr]}
                                                className="h-5 w-5 shrink-0 object-contain"
                                            />
                                            <span className="type-label-m text-on-surface">{ATTR_NAMES[card.attr]}</span>
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                            {isBirthday ? (
                                                <img src="/data/icon/birthday.webp" alt="Birthday" className="h-4 w-4 object-contain" />
                                            ) : (
                                                Array.from({ length: rarityNum }).map((_, i) => (
                                                    <img
                                                        key={i}
                                                        src={isTrainableCard(card) ? "/data/icon/star_trained.webp" : "/data/icon/star.webp"}
                                                        alt=""
                                                        className="h-3.5 w-3.5 object-contain"
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </td>

                                {/* Card Supply Type */}
                                <td className="p-3 align-middle">
                                    <span className={`inline-flex items-center gap-1 type-label-m ${supplyMeta.colorClass}`}>
                                        <Icon path={supplyMeta.icon} size={15} className="shrink-0" />
                                        <span>{supplyLabel}</span>
                                    </span>
                                </td>

                                {/* Skill */}
                                <td className="p-3 align-middle">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex flex-wrap items-center gap-1">
                                            {maxMultiplier !== null && (
                                                <span className="rounded-md3-xs bg-primary-container px-1.5 py-0.5 type-label-s font-semibold text-on-primary-container tabular-nums">
                                                    {maxMultiplier}%
                                                </span>
                                            )}
                                            {skillTypes.map((st) => (
                                                <span
                                                    key={st}
                                                    className="rounded-md3-xs bg-surface-container-high px-1.5 py-0.5 type-label-s text-on-surface-variant"
                                                >
                                                    {t(`common.skillTypes.${st}`)}
                                                </span>
                                            ))}
                                        </div>
                                        {skillName && (
                                            <div className="truncate max-w-[220px] type-body-s text-on-surface-variant" title={skillName}>
                                                {skillName}
                                            </div>
                                        )}
                                    </div>
                                </td>

                                {/* Max Base Power */}
                                <td className="p-3 align-middle text-right type-label-l text-on-surface tabular-nums">
                                    {maxPower !== null ? maxPower.toLocaleString() : "-"}
                                </td>

                                {/* Release Date */}
                                <td className="p-3 align-middle text-right type-body-s text-on-surface-variant tabular-nums">
                                    {releaseTs > 0 ? formatDate(releaseTs) : "-"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
