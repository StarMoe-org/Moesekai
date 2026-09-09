"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import { useI18n } from "@/contexts/I18nContext";
import Modal from "@/components/common/Modal";
import { getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import { type ICardInfo, CARD_RARITY_MAX_LEVELS } from "@/types/types";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import DataOverridePanel, { type OverrideCatalogItem } from "./DataOverridePanel";
import type {
    DeckSkillOrder,
    DeckSkillReference,
    DeckSingleCardOverride,
    DeckAreaItemOverride,
    DeckCharacterRankOverride,
    DeckMysekaiGateOverride,
    DeckMysekaiFixtureOverride,
} from "@/lib/deck-recommend/engine-types";

export const UNIT_BONUS_OPTIONS = [
    { value: "light_sound", labelKey: "common.units.ln", icon: "ln.webp" },
    { value: "idol", labelKey: "common.units.mmj", icon: "mmj.webp" },
    { value: "street", labelKey: "common.units.vbs", icon: "vbs.webp" },
    { value: "theme_park", labelKey: "common.units.ws", icon: "wxs.webp" },
    { value: "school_refusal", labelKey: "common.units.25ji", icon: "n25.webp" },
    { value: "piapro", labelKey: "common.units.vs", icon: "vs.webp" },
];

export const ATTR_OPTIONS = [
    { value: "cool", label: "Cool", icon: "Cool.webp" },
    { value: "cute", label: "Cute", icon: "cute.webp" },
    { value: "happy", label: "Happy", icon: "Happy.webp" },
    { value: "mysterious", label: "Mysterious", icon: "Mysterious.webp" },
    { value: "pure", label: "Pure", icon: "Pure.webp" },
];

export const CUSTOM_CHARACTER_IDS = Array.from({ length: 26 }, (_, i) => i + 1);

export interface CustomRulesState {
    // Constraints
    fixedCards: number[];
    fixedCharacters: number[];
    excludedCards: number[];
    useCurrentDeck: boolean;
    leaderCharacterId: number | null;
    bestSkillAsLeader: boolean;

    // Pool filter
    unitFilter: string;
    attrFilter: string;
    characterFilterIds: number[];

    // Skills & Multi
    multiTeammatePower: string;
    multiTeammateScoreUp: string;
    multiScoreUpLowerBound: string;
    skillOrder: DeckSkillOrder;
    specificSkillOrder: string;
    skillReference: DeckSkillReference;
    keepAfterTrainingState: boolean;
    supportMasterMax: boolean;
    supportSkillMax: boolean;
    filterOtherUnit: boolean;

    // Advanced & Overrides
    boost: string;
    otherScore: string;
    areaItemLevel: string;
    areaItemOverrides: DeckAreaItemOverride[];
    characterRank: string;
    characterRankOverrides: DeckCharacterRankOverride[];
    mysekaiGateLevel: string;
    mysekaiGateOverrides: DeckMysekaiGateOverride[];
    mysekaiFixtureBonusRate: string;
    mysekaiFixtureOverrides: DeckMysekaiFixtureOverride[];
    singleCardOverrides: DeckSingleCardOverride[];

    // Engine
    limit: string;
    timeoutSeconds: string;
}

interface CustomRulesModalProps {
    isOpen: boolean;
    onClose: () => void;
    state: CustomRulesState;
    onChange: (partial: Partial<CustomRulesState>) => void;
    onResetAll: () => void;
    cardsMaster: ICardInfo[];
    overrideCatalogs: {
        areaItems: OverrideCatalogItem[];
        characters: OverrideCatalogItem[];
        gates: OverrideCatalogItem[];
        fixtureCharacters: OverrideCatalogItem[];
    };
    onOpenCardModal: (type: "fixed" | "excluded" | "single") => void;
    userDeckCardIds?: number[];
}

type TabKey = "constraints" | "poolFilter" | "skillsAndMulti" | "dataOverrides" | "singleCards" | "engine";
type TranslationFn = ReturnType<typeof useI18n>["t"];

function SingleCardOverrideRow({
    entry,
    master,
    onChange,
    onRemove,
    t,
}: {
    entry: DeckSingleCardOverride;
    master?: ICardInfo;
    onChange: (updated: DeckSingleCardOverride) => void;
    onRemove: () => void;
    t: TranslationFn;
}) {
    const maxLevel = useMemo(() => {
        if (!master) return 60;
        const config = CARD_RARITY_MAX_LEVELS[master.cardRarityType];
        return config ? (config.trained ?? config.normal) : 60;
    }, [master]);

    return (
        <div className="p-3 bg-white/80 dark:bg-slate-800/80 rounded-2xl border border-slate-200/70 dark:border-slate-700 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    {master ? (
                        <SekaiCardThumbnail card={master} trained={entry.masterRank !== undefined && entry.masterRank > 0} width={40} />
                    ) : (
                        <div className="w-10 h-10 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs text-slate-500">
                            #{entry.cardId}
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            {master?.prefix ?? `#${entry.cardId}`}
                        </div>
                        <div className="text-[10px] text-slate-400">
                            ID: {entry.cardId} · Max Lv.{maxLevel}
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-xs text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                    {t("page.deckRecommend.config.singleCardRemove")}
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1 text-xs border-t border-slate-100 dark:border-slate-700/60">
                {/* Level */}
                <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/40 p-2 rounded-xl">
                    <span className="text-slate-500 whitespace-nowrap">{t("page.deckRecommend.config.singleCardLevel")}:</span>
                    <div className="flex items-center gap-1">
                        <input
                            type="number"
                            min={1}
                            max={maxLevel}
                            value={entry.level ?? ""}
                            onChange={(e) => onChange({
                                ...entry,
                                level: e.target.value === "" ? undefined : Math.max(1, Math.min(maxLevel, parseInt(e.target.value, 10) || 1)),
                            })}
                            placeholder={t("page.deckRecommend.config.singleCardInherit")}
                            className="w-16 px-1.5 py-1 text-xs ios-glass-input rounded-lg text-center"
                        />
                        <button
                            type="button"
                            onClick={() => onChange({ ...entry, level: maxLevel })}
                            className="text-[11px] text-miku font-medium px-1 hover:underline whitespace-nowrap"
                        >
                            {t("page.deckRecommend.config.singleCardLevelMax")}
                        </button>
                    </div>
                </div>

                {/* Master Rank */}
                <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/40 p-2 rounded-xl">
                    <span className="text-slate-500 whitespace-nowrap">{t("page.deckRecommend.config.singleCardMaster")}:</span>
                    <div className="flex items-center gap-0.5">
                        {[0, 1, 2, 3, 4, 5].map((rank) => {
                            const isSelected = entry.masterRank === rank;
                            return (
                                <button
                                    key={rank}
                                    type="button"
                                    onClick={() => onChange({
                                        ...entry,
                                        masterRank: isSelected ? undefined : rank,
                                    })}
                                    className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all ${
                                        isSelected
                                            ? "bg-miku text-white shadow-xs"
                                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                                    }`}
                                >
                                    {rank}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Skill Level */}
                <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/40 p-2 rounded-xl">
                    <span className="text-slate-500 whitespace-nowrap">{t("page.deckRecommend.config.singleCardSkill")}:</span>
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4].map((sl) => {
                            const isSelected = entry.skillLevel === sl;
                            return (
                                <button
                                    key={sl}
                                    type="button"
                                    onClick={() => onChange({
                                        ...entry,
                                        skillLevel: isSelected ? undefined : sl,
                                    })}
                                    className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all ${
                                        isSelected
                                            ? "bg-miku text-white shadow-xs"
                                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                                    }`}
                                >
                                    {sl}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Episodes */}
                <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/40 p-2 rounded-xl">
                    <span className="text-slate-500 whitespace-nowrap">{t("page.deckRecommend.config.singleCardEpisodes")}:</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => {
                                const count = entry.episodeReadCount ?? 0;
                                const newCount = count >= 1 ? (count === 2 ? 0 : 0) : 1;
                                onChange({ ...entry, episodeReadCount: newCount });
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                                (entry.episodeReadCount ?? 0) >= 1
                                    ? "bg-miku text-white shadow-xs"
                                    : "bg-white dark:bg-slate-800 text-slate-500"
                            }`}
                        >
                            {t("page.deckRecommend.config.singleCardEpisode1")}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const count = entry.episodeReadCount ?? 0;
                                const newCount = count === 2 ? 1 : 2;
                                onChange({ ...entry, episodeReadCount: newCount });
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                                (entry.episodeReadCount ?? 0) === 2
                                    ? "bg-miku text-white shadow-xs"
                                    : "bg-white dark:bg-slate-800 text-slate-500"
                            }`}
                        >
                            {t("page.deckRecommend.config.singleCardEpisode2")}
                        </button>
                    </div>
                </div>

                {/* Canvas Bonus */}
                <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/40 p-2 rounded-xl">
                    <span className="text-slate-500 whitespace-nowrap">{t("page.deckRecommend.config.singleCardCanvas")}:</span>
                    <input
                        type="checkbox"
                        className="ds-checkbox"
                        checked={entry.canvas ?? false}
                        onChange={(e) => onChange({ ...entry, canvas: e.target.checked })}
                    />
                </div>
            </div>
        </div>
    );
}

export default function CustomRulesModal({
    isOpen,
    onClose,
    state,
    onChange,
    onResetAll,
    cardsMaster,
    overrideCatalogs,
    onOpenCardModal,
    userDeckCardIds = [],
}: CustomRulesModalProps) {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<TabKey>("constraints");

    const {
        fixedCards,
        fixedCharacters,
        excludedCards,
        useCurrentDeck,
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

    // Calculate active rule count for badge and preview
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
                            <span className="text-[10px] text-slate-400 font-mono">+{excludedCards.length - 5}</span>
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
                            <span className="text-[10px] text-slate-400 font-mono">+{singleCardOverrides.length - 5}</span>
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

    const tabs: { key: TabKey; label: string }[] = [
        { key: "constraints", label: t("page.deckRecommend.rules.tabs.constraints") },
        { key: "poolFilter", label: t("page.deckRecommend.rules.tabs.poolFilter") },
        { key: "skillsAndMulti", label: t("page.deckRecommend.rules.tabs.skillsAndMulti") },
        { key: "dataOverrides", label: t("page.deckRecommend.rules.tabs.dataOverrides") },
        { key: "singleCards", label: t("page.deckRecommend.rules.tabs.singleCards") },
        { key: "engine", label: t("page.deckRecommend.rules.tabs.engine") },
    ];

    const dataOverrideValues = useMemo(() => ({
        areaItemLevel,
        areaItemOverrides,
        characterRank,
        characterRankOverrides,
        mysekaiGateLevel,
        mysekaiGateOverrides,
        mysekaiFixtureBonusRate,
        mysekaiFixtureOverrides,
    }), [
        areaItemLevel, areaItemOverrides, characterRank, characterRankOverrides,
        mysekaiGateLevel, mysekaiGateOverrides, mysekaiFixtureBonusRate, mysekaiFixtureOverrides,
    ]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t("page.deckRecommend.rules.modalTitle")}
            size="xl"
        >
            <div className="flex flex-col space-y-4">
                {/* Tabs Switcher */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200/60 dark:border-slate-800">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                                activeTab === tab.key
                                    ? "bg-miku text-white shadow-sm"
                                    : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                    {activeRules.length > 0 && (
                        <button
                            type="button"
                            onClick={onResetAll}
                            className="ml-auto text-xs text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap"
                        >
                            {t("page.deckRecommend.rules.resetAll")}
                        </button>
                    )}
                </div>

                {/* Tab Contents */}
                <div className="min-h-[360px] max-h-[54vh] overflow-y-auto pr-1 space-y-4">
                    {/* 1. Constraints */}
                    {activeTab === "constraints" && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                            {/* Left Column: Fixed Characters + Designate Leader */}
                            <div className="space-y-4">
                                {/* Fixed characters (Clean Avatar Multi-Selector) */}
                                <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                    <div className="flex items-center justify-between mb-2.5">
                                        <div className="flex items-center gap-1.5">
                                            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                                {t("page.deckRecommend.config.fixedCharacters")}
                                            </label>
                                            <span className="text-[11px] font-mono text-slate-400">
                                                ({fixedCharacters.length} / 5)
                                            </span>
                                        </div>
                                        {fixedCharacters.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => onChange({ fixedCharacters: [] })}
                                                className="text-[11px] text-red-500 hover:underline font-medium"
                                            >
                                                {t("page.deckRecommend.config.filterClear")}
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                        {CUSTOM_CHARACTER_IDS.map((id) => {
                                            const active = fixedCharacters.includes(id);
                                            const full = !active && fixedCharacters.length >= 5;
                                            return (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    disabled={full}
                                                    onClick={() => {
                                                        onChange({
                                                            fixedCharacters: active
                                                                ? fixedCharacters.filter((v) => v !== id)
                                                                : [...fixedCharacters, id].sort((a, b) => a - b),
                                                        });
                                                    }}
                                                    className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 aspect-square rounded-full p-0.5 transition-all border relative flex items-center justify-center ${
                                                        active
                                                            ? "ring-2 ring-miku shadow-sm border-miku bg-miku/15"
                                                            : full
                                                                ? "opacity-30 cursor-not-allowed border-slate-200 dark:border-slate-800"
                                                                : "border-slate-200 dark:border-slate-700 hover:border-miku/50 bg-white/50 dark:bg-slate-800/50"
                                                    }`}
                                                    title={getCharacterName(t, id, "full")}
                                                >
                                                    <img src={getCharacterIconUrl(id)} alt="" className="w-full h-full rounded-full object-cover shrink-0 aspect-square pointer-events-none" loading="lazy" />
                                                    {active && (
                                                        <span className="absolute -top-0.5 -right-0.5 bg-miku text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-bold shadow-xs shrink-0 aspect-square">
                                                            ✓
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Designate Leader (Exact Same Avatar Multi-grid Style) */}
                                <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                    <div className="flex items-center justify-between mb-2.5">
                                        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                            {t("page.deckRecommend.rules.designateLeader")}
                                        </label>
                                        {leaderCharacterId && (
                                            <button
                                                type="button"
                                                onClick={() => onChange({ leaderCharacterId: null })}
                                                className="text-[11px] text-red-500 hover:underline font-medium"
                                            >
                                                {t("page.deckRecommend.config.filterClear")}
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                        {CUSTOM_CHARACTER_IDS.map((id) => {
                                            const active = leaderCharacterId === id;
                                            return (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    onClick={() => {
                                                        onChange({ leaderCharacterId: active ? null : id });
                                                    }}
                                                    className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 aspect-square rounded-full p-0.5 transition-all border relative flex items-center justify-center ${
                                                        active
                                                            ? "ring-2 ring-miku shadow-sm border-miku bg-miku/15"
                                                            : "border-slate-200 dark:border-slate-700 hover:border-miku/50 bg-white/50 dark:bg-slate-800/50"
                                                    }`}
                                                    title={getCharacterName(t, id, "full")}
                                                >
                                                    <img src={getCharacterIconUrl(id)} alt="" className="w-full h-full rounded-full object-cover shrink-0 aspect-square pointer-events-none" loading="lazy" />
                                                    {active && (
                                                        <span className="absolute -top-0.5 -right-0.5 bg-miku text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-bold shadow-xs shrink-0 aspect-square">
                                                            L
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Other constraints */}
                            <div className="space-y-3.5">
                                {/* Best Skill as Leader */}
                                <label className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300 cursor-pointer bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 rounded-xl p-3.5">
                                    <div>
                                        <span className="font-bold block">{t("page.deckRecommend.config.bestSkillAsLeader")}</span>
                                        <span className="text-[11px] text-slate-400 block mt-0.5">{t("page.deckRecommend.rules.bestSkillAsLeaderHint")}</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="ds-checkbox flex-shrink-0"
                                        checked={bestSkillAsLeader}
                                        onChange={(e) => onChange({ bestSkillAsLeader: e.target.checked })}
                                    />
                                </label>

                                {/* Use current deck */}
                                <label className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300 cursor-pointer bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 rounded-xl p-3.5">
                                    <div>
                                        <span className="font-bold block">{t("page.deckRecommend.config.useCurrentDeck")}</span>
                                        <span className="text-[11px] text-slate-400 block mt-0.5">{t("page.deckRecommend.config.useCurrentDeckHint")}</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="ds-checkbox flex-shrink-0"
                                        checked={useCurrentDeck}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                const cards = userDeckCardIds.filter((v) => v > 0);
                                                onChange({ useCurrentDeck: true, ...(cards.length > 0 ? { fixedCards: cards.slice(0, 5) } : {}) });
                                            } else {
                                                onChange({ useCurrentDeck: false });
                                            }
                                        }}
                                    />
                                </label>

                                {/* Fixed cards */}
                                <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                            {t("page.deckRecommend.config.fixedCards")}
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => onOpenCardModal("fixed")}
                                            className="text-xs text-miku font-bold hover:underline"
                                        >
                                            + {t("page.deckRecommend.config.addCard")}
                                        </button>
                                    </div>
                                    {fixedCards.length === 0 ? (
                                        <p className="text-xs text-slate-400">{t("page.deckRecommend.config.noneSelected")}</p>
                                    ) : (
                                        <div className="flex gap-2 flex-wrap">
                                            {fixedCards.map((cardId) => {
                                                const master = cardsMaster.find((c) => c.id === cardId);
                                                return (
                                                    <button
                                                        key={cardId}
                                                        type="button"
                                                        title={`${t("page.deckRecommend.config.singleCardRemove")}: ${master?.prefix ?? cardId}`}
                                                        onClick={() => onChange({ fixedCards: fixedCards.filter((v) => v !== cardId) })}
                                                        className="relative rounded-lg overflow-hidden hover:opacity-75 transition-opacity"
                                                    >
                                                        {master ? <SekaiCardThumbnail card={master} trained={false} width={42} /> : <span className="text-xs">#{cardId}</span>}
                                                        <span className="absolute top-0 right-0 bg-red-500 text-white text-[9px] w-4 h-4 rounded-bl flex items-center justify-center font-bold">×</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Excluded cards */}
                                <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                            {t("page.deckRecommend.config.excludedCards")}
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => onOpenCardModal("excluded")}
                                            className="text-xs text-miku font-bold hover:underline"
                                        >
                                            + {t("page.deckRecommend.config.addCard")}
                                        </button>
                                    </div>
                                    {excludedCards.length === 0 ? (
                                        <p className="text-xs text-slate-400">{t("page.deckRecommend.config.noneSelected")}</p>
                                    ) : (
                                        <div className="flex gap-2 flex-wrap">
                                            {excludedCards.map((cardId) => {
                                                const master = cardsMaster.find((c) => c.id === cardId);
                                                return (
                                                    <button
                                                        key={cardId}
                                                        type="button"
                                                        title={`${t("page.deckRecommend.config.singleCardRemove")}: ${master?.prefix ?? cardId}`}
                                                        onClick={() => onChange({ excludedCards: excludedCards.filter((v) => v !== cardId) })}
                                                        className="relative rounded-lg overflow-hidden hover:opacity-75 transition-opacity"
                                                    >
                                                        {master ? <SekaiCardThumbnail card={master} trained={false} width={42} /> : <span className="text-xs">#{cardId}</span>}
                                                        <span className="absolute top-0 right-0 bg-red-500 text-white text-[9px] w-4 h-4 rounded-bl flex items-center justify-center font-bold">×</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 2. Pool Filter */}
                    {activeTab === "poolFilter" && (
                        <div className="space-y-4">
                            {/* Unit Filter (Icon-only) */}
                            <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                        {t("page.deckRecommend.config.filterUnit")}
                                    </label>
                                    {unitFilter && (
                                        <button type="button" onClick={() => onChange({ unitFilter: "" })} className="text-[11px] text-red-500 hover:underline">
                                            {t("page.deckRecommend.config.filterClear")}
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {UNIT_BONUS_OPTIONS.map((unit) => {
                                        const isSelected = unitFilter === unit.value;
                                        return (
                                            <button
                                                key={unit.value}
                                                type="button"
                                                onClick={() => onChange({ unitFilter: isSelected ? "" : unit.value })}
                                                className={`p-2 rounded-xl transition-all border ${
                                                    isSelected
                                                        ? "ring-2 ring-miku shadow-md bg-white border-transparent dark:bg-miku/15 dark:border-miku/40"
                                                        : "bg-white/70 dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 hover:bg-slate-100"
                                                }`}
                                                title={t(unit.labelKey)}
                                            >
                                                <div className="w-8 h-8 relative">
                                                    <Image src={`/data/icon/${unit.icon}`} alt={t(unit.labelKey)} fill className="object-contain" unoptimized />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Attribute Filter (Icon-only) */}
                            <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                        {t("page.deckRecommend.config.filterAttr")}
                                    </label>
                                    {attrFilter && (
                                        <button type="button" onClick={() => onChange({ attrFilter: "" })} className="text-[11px] text-red-500 hover:underline">
                                            {t("page.deckRecommend.config.filterClear")}
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {ATTR_OPTIONS.map((attr) => {
                                        const isSelected = attrFilter === attr.value;
                                        return (
                                            <button
                                                key={attr.value}
                                                type="button"
                                                onClick={() => onChange({ attrFilter: isSelected ? "" : attr.value })}
                                                className={`p-2 rounded-xl transition-all border ${
                                                    isSelected
                                                        ? "ring-2 ring-miku shadow-md bg-white border-transparent dark:bg-miku/15 dark:border-miku/40"
                                                        : "bg-white/70 dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 hover:bg-slate-100"
                                                }`}
                                                title={attr.label}
                                            >
                                                <div className="w-8 h-8 relative">
                                                    <Image src={`/data/icon/${attr.icon}`} alt={attr.label} fill className="object-contain" unoptimized />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Character pool filter (Clean Avatar Multi-Selector) */}
                            <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                <div className="flex items-center justify-between mb-2.5">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                        {t("page.deckRecommend.config.filterCharacter")}
                                    </label>
                                    {characterFilterIds.length > 0 && (
                                        <button type="button" onClick={() => onChange({ characterFilterIds: [] })} className="text-[11px] text-red-500 hover:underline">
                                            {t("page.deckRecommend.config.filterClear")}
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                    {CUSTOM_CHARACTER_IDS.map((id) => {
                                        const active = characterFilterIds.includes(id);
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => {
                                                    onChange({
                                                        characterFilterIds: active
                                                            ? characterFilterIds.filter((v) => v !== id)
                                                            : [...characterFilterIds, id].sort((a, b) => a - b),
                                                    });
                                                }}
                                                className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 aspect-square rounded-full p-0.5 transition-all border relative flex items-center justify-center ${
                                                    active
                                                        ? "ring-2 ring-miku shadow-sm border-miku bg-miku/15"
                                                        : "border-slate-200 dark:border-slate-700 hover:border-miku/50 bg-white/50 dark:bg-slate-800/50"
                                                }`}
                                                title={getCharacterName(t, id, "full")}
                                            >
                                                <img src={getCharacterIconUrl(id)} alt="" className="w-full h-full rounded-full object-cover shrink-0 aspect-square pointer-events-none" loading="lazy" />
                                                {active && (
                                                    <span className="absolute -top-0.5 -right-0.5 bg-miku text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-bold shadow-xs shrink-0 aspect-square">
                                                        ✓
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. Skills and Multi */}
                    {activeTab === "skillsAndMulti" && (
                        <div className="space-y-4">
                            {/* Multi live parameters */}
                            <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-2">
                                    {t("page.deckRecommend.config.multiLiveTitle")}
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-[11px] text-slate-400 block mb-1">{t("page.deckRecommend.config.teammatePower")}</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={multiTeammatePower}
                                            onChange={(e) => onChange({ multiTeammatePower: e.target.value })}
                                            placeholder={t("page.deckRecommend.config.followSelfPlaceholder")}
                                            className="ds-field-input"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-slate-400 block mb-1">{t("page.deckRecommend.config.teammateScoreUp")}</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={multiTeammateScoreUp}
                                            onChange={(e) => onChange({ multiTeammateScoreUp: e.target.value })}
                                            placeholder={t("page.deckRecommend.config.followSelfPlaceholder")}
                                            className="ds-field-input"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-slate-400 block mb-1">{t("page.deckRecommend.config.scoreUpLowerBound")}</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={multiScoreUpLowerBound}
                                            onChange={(e) => onChange({ multiScoreUpLowerBound: e.target.value })}
                                            placeholder={t("page.deckRecommend.config.noLimit")}
                                            className="ds-field-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Skill orders and reference */}
                            <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1.5">{t("page.deckRecommend.config.skillOrder")}</label>
                                    <div className="flex flex-wrap gap-2">
                                        {(["average", "max", "min", "specific"] as const).map((option) => (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => onChange({ skillOrder: option })}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                                                    skillOrder === option
                                                        ? "bg-miku text-white shadow-sm"
                                                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                                }`}
                                            >
                                                {t(`page.deckRecommend.config.skillOrders.${option}`)}
                                            </button>
                                        ))}
                                    </div>
                                    {skillOrder === "specific" && (
                                        <div className="mt-2 max-w-xs">
                                            <input
                                                type="text"
                                                value={specificSkillOrder}
                                                onChange={(e) => onChange({ specificSkillOrder: e.target.value })}
                                                placeholder={t("page.deckRecommend.config.specificSkillOrderPlaceholder")}
                                                className="ds-field-input"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1.5">{t("page.deckRecommend.config.skillReference")}</label>
                                    <div className="flex flex-wrap gap-2">
                                        {(["average", "max", "min"] as const).map((option) => (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => onChange({ skillReference: option })}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                                                    skillReference === option
                                                        ? "bg-miku text-white shadow-sm"
                                                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                                }`}
                                            >
                                                {t(`page.deckRecommend.config.skillReferences.${option}`)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <label className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                                    <span>{t("page.deckRecommend.config.keepAfterTrainingState")}</span>
                                    <input
                                        type="checkbox"
                                        className="ds-checkbox flex-shrink-0"
                                        checked={keepAfterTrainingState}
                                        onChange={(e) => onChange({ keepAfterTrainingState: e.target.checked })}
                                    />
                                </label>
                            </div>

                            {/* World Bloom Support */}
                            <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 space-y-2">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                                    {t("page.deckRecommend.config.supportGroupTitle")}
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {(["supportMasterMax", "supportSkillMax", "filterOtherUnit"] as const).map((typedKey) => (
                                        <label key={typedKey} className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-3 py-2">
                                            <span>{t(`page.deckRecommend.config.${typedKey}`)}</span>
                                            <input
                                                type="checkbox"
                                                className="ds-checkbox flex-shrink-0"
                                                checked={state[typedKey]}
                                                onChange={(e) => onChange({ [typedKey]: e.target.checked })}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 4. Data Overrides (Pure Icon/Grid Panel) */}
                    {activeTab === "dataOverrides" && (
                        <div className="space-y-4">
                            <DataOverridePanel
                                areaItems={overrideCatalogs.areaItems}
                                characters={overrideCatalogs.characters}
                                gates={overrideCatalogs.gates}
                                fixtureCharacters={overrideCatalogs.fixtureCharacters}
                                values={dataOverrideValues}
                                onChange={onChange}
                            />
                        </div>
                    )}

                    {/* 5. Single Card Overrides (Dedicated Top-Level Tab) */}
                    {activeTab === "singleCards" && (
                        <div className="space-y-3">
                            <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                        {t("page.deckRecommend.config.singleCardTitle")}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => onOpenCardModal("single")}
                                        className="text-xs text-miku font-bold hover:underline"
                                    >
                                        + {t("page.deckRecommend.config.singleCardAdd")}
                                    </button>
                                </div>
                                {singleCardOverrides.length === 0 ? (
                                    <p className="text-xs text-slate-400">{t("page.deckRecommend.config.singleCardEmpty")}</p>
                                ) : (
                                    <div className="space-y-2.5">
                                        {singleCardOverrides.map((entry) => {
                                            const master = cardsMaster.find((c) => c.id === entry.cardId);
                                            return (
                                                <SingleCardOverrideRow
                                                    key={entry.cardId}
                                                    entry={entry}
                                                    master={master}
                                                    onChange={(updated) => {
                                                        onChange({
                                                            singleCardOverrides: singleCardOverrides.map((e) =>
                                                                e.cardId === entry.cardId ? updated : e
                                                            ),
                                                        });
                                                    }}
                                                    onRemove={() => {
                                                        onChange({
                                                            singleCardOverrides: singleCardOverrides.filter((e) => e.cardId !== entry.cardId),
                                                        });
                                                    }}
                                                    t={t}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 6. Engine Parameters */}
                    {activeTab === "engine" && (
                        <div className="space-y-4">
                            <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-2">
                                    {t("page.deckRecommend.config.advancedTitle")}
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[11px] text-slate-400 block mb-1">{t("page.deckRecommend.config.advanced.limit")}</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={30}
                                            value={limit}
                                            onChange={(e) => onChange({ limit: e.target.value })}
                                            className="ds-field-input"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-slate-400 block mb-1">{t("page.deckRecommend.config.advanced.timeout")}</label>
                                        <input
                                            type="number"
                                            min={5}
                                            max={300}
                                            value={timeoutSeconds}
                                            onChange={(e) => onChange({ timeoutSeconds: e.target.value })}
                                            className="ds-field-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50/80 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[11px] text-slate-400 block mb-1">{t("page.deckRecommend.config.boost")}</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={10}
                                            value={boost}
                                            onChange={(e) => onChange({ boost: e.target.value })}
                                            placeholder="-"
                                            className="ds-field-input"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-slate-400 block mb-1">{t("page.deckRecommend.config.otherScore")}</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={otherScore}
                                            onChange={(e) => onChange({ otherScore: e.target.value })}
                                            placeholder="-"
                                            className="ds-field-input"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Effect Preview - Sticky Bottom Panel */}
                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-3.5 bg-miku rounded-full" />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                {t("page.deckRecommend.rules.previewTitle")}
                            </span>
                            {activeRules.length > 0 && (
                                <span className="text-[10px] font-mono text-miku font-bold bg-miku/10 px-1.5 py-0.5 rounded-full">
                                    {t("page.deckRecommend.rules.activeCount", { count: activeRules.length })}
                                </span>
                            )}
                        </div>
                        {activeRules.length > 0 && (
                            <button
                                type="button"
                                onClick={onResetAll}
                                className="text-[11px] text-red-500 hover:text-red-600 font-medium"
                            >
                                {t("page.deckRecommend.rules.resetAll")}
                            </button>
                        )}
                    </div>

                    {activeRules.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-1">
                            {t("page.deckRecommend.rules.previewEmpty")}
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                            {activeRules.map((rule) => (
                                <div
                                    key={rule.key}
                                    className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg text-xs"
                                >
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">{rule.label}</span>
                                    {rule.detail}
                                    <button
                                        type="button"
                                        onClick={rule.onRemove}
                                        className="text-slate-400 hover:text-red-500 font-bold ml-0.5"
                                        title={t("page.deckRecommend.rules.removeRule")}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="ios-glass-btn ios-glass-btn-primary rounded-xl px-5 py-2 text-xs font-bold"
                    >
                        {t("page.deckRecommend.rules.applyAndClose")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
