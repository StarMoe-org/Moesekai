"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl } from "@/lib/assets";
import type { ICardInfo } from "@/types/types";
import { Button, Icon } from "@/components/md3";
import { mdClose, mdRestartAlt, mdTune } from "@/components/md3/icons";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { UNIT_BONUS_OPTIONS, ATTR_OPTIONS, type CustomRulesState } from "./CustomRulesModal";

interface ActiveRulesSummaryProps {
    state: CustomRulesState;
    onOpenModal: () => void;
    onChange: (partial: Partial<CustomRulesState>) => void;
    onResetAll: () => void;
    cardsMaster: ICardInfo[];
}

export default function ActiveRulesSummary({
    state,
    onOpenModal,
    onChange,
    onResetAll,
    cardsMaster,
}: ActiveRulesSummaryProps) {
    const { t } = useI18n();

    const {
        fixedCards,
        fixedCharacters,
        excludedCards,
        leaderCharacterId,
        bestSkillAsLeader,
        unitFilter,
        attrFilter,
        characterFilterIds,
        multiTeammatePower,
        multiTeammateScoreUp,
        multiScoreUpLowerBound,
        skillOrder,
        specificSkillOrder,
        skillReference,
        keepAfterTrainingState,
        supportMasterMax,
        supportSkillMax,
        filterOtherUnit,
        boost,
        otherScore,
        areaItemLevel,
        areaItemOverrides,
        characterRank,
        characterRankOverrides,
        mysekaiGateLevel,
        mysekaiGateOverrides,
        mysekaiFixtureBonusRate,
        mysekaiFixtureOverrides,
        singleCardOverrides,
        limit,
        timeoutSeconds,
    } = state;

    const activeRules = useMemo(() => {
        const rules: { key: string; label: string; detail?: React.ReactNode; onRemove: () => void }[] = [];

        if (fixedCharacters.length > 0) {
            rules.push({
                key: "fixedCharacters",
                label: t("page.deckRecommend.rules.preview.fixedCharacters", { count: fixedCharacters.length }),
                detail: (
                    <div className="flex items-center gap-1">
                        {fixedCharacters.map((id) => (
                            <img key={id} src={getCharacterIconUrl(id)} alt="" className="w-5 h-5 rounded-full object-contain" />
                        ))}
                    </div>
                ),
                onRemove: () => onChange({ fixedCharacters: [] }),
            });
        }

        if (fixedCards.length > 0) {
            rules.push({
                key: "fixedCards",
                label: t("page.deckRecommend.rules.preview.fixedCards", { count: fixedCards.length }),
                detail: (
                    <div className="flex items-center gap-1">
                        {fixedCards.map((cardId) => {
                            const c = cardsMaster.find((item) => item.id === cardId);
                            return c ? <SekaiCardThumbnail key={cardId} card={c} trained={false} width={22} /> : null;
                        })}
                    </div>
                ),
                onRemove: () => onChange({ fixedCards: [], useCurrentDeck: false }),
            });
        }

        if (excludedCards.length > 0) {
            rules.push({
                key: "excludedCards",
                label: t("page.deckRecommend.rules.preview.excludedCards", { count: excludedCards.length }),
                detail: (
                    <div className="flex items-center gap-1">
                        {excludedCards.slice(0, 5).map((cardId) => {
                            const c = cardsMaster.find((item) => item.id === cardId);
                            return c ? <SekaiCardThumbnail key={cardId} card={c} trained={false} width={22} /> : null;
                        })}
                        {excludedCards.length > 5 && (
                            <span className="text-[10px] text-on-surface-variant font-mono">+{excludedCards.length - 5}</span>
                        )}
                    </div>
                ),
                onRemove: () => onChange({ excludedCards: [] }),
            });
        }

        if (leaderCharacterId) {
            rules.push({
                key: "leader",
                label: t("page.deckRecommend.rules.preview.leader"),
                detail: (
                    <img src={getCharacterIconUrl(leaderCharacterId)} alt="" className="w-5 h-5 rounded-full object-contain" />
                ),
                onRemove: () => onChange({ leaderCharacterId: null }),
            });
        }

        if (!bestSkillAsLeader) {
            rules.push({
                key: "noBestSkillLeader",
                label: t("page.deckRecommend.rules.preview.noBestSkillLeader"),
                onRemove: () => onChange({ bestSkillAsLeader: true }),
            });
        }

        if (unitFilter) {
            const u = UNIT_BONUS_OPTIONS.find((item) => item.value === unitFilter);
            rules.push({
                key: "unitFilter",
                label: t("page.deckRecommend.rules.preview.unitFilter"),
                detail: u ? <Image src={`/data/icon/${u.icon}`} alt="" width={18} height={18} className="object-contain" /> : unitFilter,
                onRemove: () => onChange({ unitFilter: "" }),
            });
        }

        if (attrFilter) {
            const a = ATTR_OPTIONS.find((item) => item.value === attrFilter);
            rules.push({
                key: "attrFilter",
                label: t("page.deckRecommend.rules.preview.attrFilter"),
                detail: a ? <Image src={`/data/icon/${a.icon}`} alt="" width={18} height={18} className="object-contain" /> : attrFilter,
                onRemove: () => onChange({ attrFilter: "" }),
            });
        }

        if (characterFilterIds.length > 0) {
            rules.push({
                key: "characterFilter",
                label: t("page.deckRecommend.rules.preview.characterFilter", { count: characterFilterIds.length }),
                detail: (
                    <div className="flex items-center gap-1">
                        {characterFilterIds.map((id) => (
                            <img key={id} src={getCharacterIconUrl(id)} alt="" className="w-5 h-5 rounded-full object-contain" />
                        ))}
                    </div>
                ),
                onRemove: () => onChange({ characterFilterIds: [] }),
            });
        }

        if (multiTeammatePower || multiTeammateScoreUp || multiScoreUpLowerBound) {
            const parts: string[] = [];
            if (multiTeammatePower) parts.push(`${multiTeammatePower}`);
            if (multiTeammateScoreUp) parts.push(`${multiTeammateScoreUp}%`);
            rules.push({
                key: "multiLive",
                label: t("page.deckRecommend.rules.preview.multiLive", { value: parts.join(" / ") || "-" }),
                onRemove: () => onChange({ multiTeammatePower: "", multiTeammateScoreUp: "", multiScoreUpLowerBound: "" }),
            });
        }

        if (skillOrder !== "average" || specificSkillOrder) {
            rules.push({
                key: "skillOrder",
                label: t("page.deckRecommend.rules.preview.skillOrder", {
                    order: skillOrder === "specific" ? specificSkillOrder || "12345" : t(`page.deckRecommend.config.skillOrders.${skillOrder}`),
                }),
                onRemove: () => onChange({ skillOrder: "average", specificSkillOrder: "" }),
            });
        }

        if (skillReference !== "average") {
            rules.push({
                key: "skillRef",
                label: t("page.deckRecommend.rules.preview.skillRef", {
                    ref: t(`page.deckRecommend.config.skillReferences.${skillReference}`),
                }),
                onRemove: () => onChange({ skillReference: "average" }),
            });
        }

        if (keepAfterTrainingState) {
            rules.push({
                key: "keepAfterTraining",
                label: t("page.deckRecommend.rules.preview.keepAfterTraining"),
                onRemove: () => onChange({ keepAfterTrainingState: false }),
            });
        }

        if (supportMasterMax || supportSkillMax || filterOtherUnit) {
            rules.push({
                key: "support",
                label: t("page.deckRecommend.rules.preview.supportSettings"),
                onRemove: () => onChange({ supportMasterMax: false, supportSkillMax: false, filterOtherUnit: false }),
            });
        }

        if (areaItemLevel || areaItemOverrides.length > 0) {
            rules.push({
                key: "areaItems",
                label: areaItemLevel
                    ? t("page.deckRecommend.rules.preview.areaLevel", { level: areaItemLevel })
                    : t("page.deckRecommend.rules.preview.areaOverrides", { count: areaItemOverrides.length }),
                onRemove: () => onChange({ areaItemLevel: "", areaItemOverrides: [] }),
            });
        }

        if (characterRank || characterRankOverrides.length > 0) {
            rules.push({
                key: "characterRank",
                label: characterRank
                    ? t("page.deckRecommend.rules.preview.characterRankLevel", { rank: characterRank })
                    : t("page.deckRecommend.rules.preview.characterRankOverrides", { count: characterRankOverrides.length }),
                onRemove: () => onChange({ characterRank: "", characterRankOverrides: [] }),
            });
        }

        if (mysekaiGateLevel || mysekaiGateOverrides.length > 0 || mysekaiFixtureBonusRate || mysekaiFixtureOverrides.length > 0) {
            rules.push({
                key: "mysekaiOverrides",
                label: t("page.deckRecommend.rules.preview.mysekaiOverrides"),
                onRemove: () => onChange({
                    mysekaiGateLevel: "",
                    mysekaiGateOverrides: [],
                    mysekaiFixtureBonusRate: "",
                    mysekaiFixtureOverrides: [],
                }),
            });
        }

        if (singleCardOverrides.length > 0) {
            rules.push({
                key: "singleCards",
                label: t("page.deckRecommend.rules.preview.singleCards", { count: singleCardOverrides.length }),
                detail: (
                    <div className="flex items-center gap-1">
                        {singleCardOverrides.slice(0, 5).map((entry) => {
                            const c = cardsMaster.find((item) => item.id === entry.cardId);
                            return c ? <SekaiCardThumbnail key={entry.cardId} card={c} trained={false} width={22} /> : null;
                        })}
                        {singleCardOverrides.length > 5 && (
                            <span className="text-[10px] text-on-surface-variant font-mono">+{singleCardOverrides.length - 5}</span>
                        )}
                    </div>
                ),
                onRemove: () => onChange({ singleCardOverrides: [] }),
            });
        }

        if (boost || otherScore) {
            rules.push({
                key: "boostScore",
                label: t("page.deckRecommend.rules.preview.boostScore"),
                onRemove: () => onChange({ boost: "", otherScore: "" }),
            });
        }

        if (limit !== "10" || timeoutSeconds !== "120") {
            rules.push({
                key: "engineParams",
                label: t("page.deckRecommend.rules.preview.engineParams", { limit, timeout: timeoutSeconds }),
                onRemove: () => onChange({ limit: "10", timeoutSeconds: "120" }),
            });
        }

        return rules;
    }, [
        fixedCards, fixedCharacters, excludedCards, leaderCharacterId, bestSkillAsLeader,
        unitFilter, attrFilter, characterFilterIds, multiTeammatePower, multiTeammateScoreUp,
        multiScoreUpLowerBound, skillOrder, specificSkillOrder, skillReference,
        keepAfterTrainingState, supportMasterMax, supportSkillMax, filterOtherUnit,
        areaItemLevel, areaItemOverrides, characterRank, characterRankOverrides,
        mysekaiGateLevel, mysekaiGateOverrides, mysekaiFixtureBonusRate, mysekaiFixtureOverrides,
        singleCardOverrides, boost, otherScore, limit, timeoutSeconds, cardsMaster, onChange, t
    ]);

    return (
        <div className="mb-5 rounded-md3-lg border border-outline-variant bg-surface-container-low p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
                <div className="flex items-center gap-2">
                    <Icon path={mdTune} size={20} className="text-primary" />
                    <span className="type-title-s text-on-surface">
                        {t("page.deckRecommend.rules.title")}
                    </span>
                    {activeRules.length > 0 && (
                        <span className="type-label-m rounded-md3-sm bg-secondary-container px-2 py-0.5 font-mono text-on-secondary-container">
                            {t("page.deckRecommend.rules.activeCount", { count: activeRules.length })}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {activeRules.length > 0 && (
                        <Button type="button" variant="text" color="error" size="xs" icon={mdRestartAlt} onClick={onResetAll}>
                            {t("page.deckRecommend.rules.resetAll")}
                        </Button>
                    )}
                    <Button type="button" variant="tonal" size="xs" icon={mdTune} onClick={onOpenModal}>
                        {activeRules.length > 0 ? t("page.deckRecommend.rules.editButton") : t("page.deckRecommend.rules.addButton")}
                    </Button>
                </div>
            </div>

            {activeRules.length === 0 ? (
                <button
                    type="button"
                    onClick={onOpenModal}
                    className="state-layer focus-ring w-full rounded-md3-md border border-dashed border-outline-variant p-3 text-center text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                >
                    <span className="type-body-s">
                        {t("page.deckRecommend.rules.emptyHint")}
                    </span>
                </button>
            ) : (
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {activeRules.map((rule) => (
                        <div
                            key={rule.key}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md3-sm border border-outline-variant bg-surface-container-lowest pl-3 pr-1 type-label-l text-on-surface-variant"
                        >
                            <span className="text-on-surface">{rule.label}</span>
                            {rule.detail}
                            <button
                                type="button"
                                onClick={rule.onRemove}
                                className="state-layer focus-ring ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant hover:text-error"
                                title={t("page.deckRecommend.rules.removeRule")}
                                aria-label={t("page.deckRecommend.rules.removeRule")}
                            >
                                <Icon path={mdClose} size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
