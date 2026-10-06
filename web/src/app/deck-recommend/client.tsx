"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "@/components/LocalizedLink";
import { ServerRegionLabel } from "@/components/common/ServerRegion";
import { useI18n } from "@/contexts/I18nContext";
import Image from "next/image";
import MainLayout from "@/components/MainLayout";
import type { ICardInfo } from "@/types/types";
import type { IMusicInfo } from "@/types/music";
import CharacterSelector from "@/components/deck-recommend/CharacterSelector";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import CardSelectorModal from "@/components/cards/CardSelectorModal";
import CustomRulesModal, {
    UNIT_BONUS_OPTIONS,
    ATTR_OPTIONS,
    CUSTOM_CHARACTER_IDS,
    type CustomRulesState,
} from "@/components/deck-recommend/CustomRulesModal";
import ActiveRulesSummary from "@/components/deck-recommend/ActiveRulesSummary";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { getCharacterIconUrl } from "@/lib/assets";
import {
    getOAuthAccessTokenForGameUser,
    SERVER_OPTIONS,
    type ServerType,
} from "@/lib/account";
import {
    getWl3SimulationGroupByEventId,
    type Wl3SimulationGroup,
} from "@/lib/world-bloom-simulation";
import { getCharacterName } from "@/lib/i18n";
import AccountSelector from "@/components/AccountSelector";
import EventSelector from "@/components/deck-recommend/EventSelector";
import MusicSelector from "@/components/deck-recommend/MusicSelector";
import { type OverrideCatalogItem } from "@/components/deck-recommend/DataOverridePanel";
import {
    buildDeckWorkerArgs,
    DEFAULT_CARD_CONFIG,
    DEFAULT_DECK_FORM_STATE as DEFAULT_SAVED_CONFIG,
    type DeckFormState as SavedConfig,
} from "@/lib/deck-recommend/worker-args";
import { SnowyDataProvider } from "@/lib/deck-recommend/data-provider";
import type {
    DeckMusicRow,
    DeckRecommendMode,
    DeckResultDeck,
    DeckTrainingConfig,
    DeckUserCard,
} from "@/lib/deck-recommend/engine-types";
import {
    DECK_SAVED_CONFIG_KEY as SAVED_CONFIG_KEY,
    DECK_SERVER_STORAGE_KEY as SERVER_STORAGE_KEY,
    DECK_USER_ID_STORAGE_KEY as USER_ID_STORAGE_KEY,
    parseSavedDeckConfig,
    resolveDeckAccount,
} from "@/lib/deck-recommend/planner-args";
import { useDeckEngine } from "@/lib/deck-recommend/use-deck-engine";
import { Banner, Button, CircularProgress, EmptyState, Icon, PageContainer, PageHeader, Switch } from "@/components/md3";
import { mdAccountCircle, mdCheck, mdContentCopy, mdDelete, mdKeyboardArrowDown, mdLeaderboard, mdPlayArrow, mdSave } from "@/components/md3/icons";
import "./deck-recommend.css";

type RawRow = Record<string, unknown>;

function rowsOf(value: unknown): RawRow[] {
    return Array.isArray(value)
        ? (value.filter((item) => item !== null && typeof item === "object") as RawRow[])
        : [];
}

function numOf(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
}

/** 数据覆盖面板的真实值快照（只取覆盖需要的键）。 */
interface OverrideUserSnapshot {
    userAreas?: { areaItems?: { areaItemId?: number; level?: number }[] }[];
    userCharacters?: { characterId?: number; characterRank?: number }[];
    userMysekaiGates?: { mysekaiGateId?: number; mysekaiGateLevel?: number }[];
    userMysekaiFixtureGameCharacterPerformanceBonuses?: { gameCharacterId?: number; totalBonusRate?: number }[];
    userDecks?: { member1?: number; member2?: number; member3?: number; member4?: number; member5?: number }[];
}

/** 用账号区服主数据 + 用户数据构建覆盖面板的四组目录。 */
function buildOverrideCatalogs(
    master: {
        areaItems: unknown;
        areaItemLevels: unknown;
        characterRanks: unknown;
        gameCharacters: unknown;
        gameCharacterUnits: unknown;
        mysekaiGates: unknown;
        mysekaiGateLevels: unknown;
    },
    userSnapshot: OverrideUserSnapshot | null,
    t: TranslationFn,
): {
    areaItems: OverrideCatalogItem[];
    characters: OverrideCatalogItem[];
    gates: OverrideCatalogItem[];
    fixtureCharacters: OverrideCatalogItem[];
} {
    // 区域道具：每个道具的目标（角色/团/属性）与上限。
    const VALID_ATTRS = new Set(["cool", "cute", "happy", "mysterious", "pure"]);
    const VALID_UNITS = new Set(["light_sound", "idol", "street", "theme_park", "school_refusal", "piapro"]);

    const areaMax = new Map<number, number>();
    const areaTarget = new Map<number, { unit?: string; attr?: string; characterId?: number }>();
    for (const row of rowsOf(master.areaItemLevels)) {
        const id = numOf(row.areaItemId);
        const level = numOf(row.level);
        if (id > 0 && level > 0) {
            areaMax.set(id, Math.max(areaMax.get(id) ?? 0, level));
            if (!areaTarget.has(id)) {
                const charId = numOf(row.targetGameCharacterId);
                const rawUnit = typeof row.targetUnit === "string" ? row.targetUnit : "";
                const rawAttr = typeof row.targetCardAttr === "string" ? row.targetCardAttr.toLowerCase() : "";

                let characterId: number | undefined;
                let unit: string | undefined;
                let attr: string | undefined;

                if (charId >= 1 && charId <= 26) {
                    characterId = charId;
                } else if (VALID_UNITS.has(rawUnit)) {
                    unit = rawUnit;
                } else if (VALID_ATTRS.has(rawAttr)) {
                    attr = rawAttr;
                }

                areaTarget.set(id, { characterId, unit, attr });
            }
        }
    }
    const userAreaItems = new Map<number, number>();
    for (const area of (userSnapshot?.userAreas ?? []) as { areaItems?: { areaItemId?: number; level?: number }[] }[]) {
        for (const item of area.areaItems ?? []) {
            const id = numOf(item.areaItemId);
            if (id > 0) userAreaItems.set(id, numOf(item.level));
        }
    }
    const areaItems: OverrideCatalogItem[] = rowsOf(master.areaItems)
        .map((row): OverrideCatalogItem | null => {
            const id = numOf(row.id);
            const max = areaMax.get(id) ?? 0;
            if (id <= 0 || max <= 0) return null;
            const target = areaTarget.get(id);
            let sub = "";
            if (target?.characterId) {
                sub = getCharacterName(t, target.characterId, "full");
            } else if (target?.unit) {
                const unit = UNIT_BONUS_OPTIONS.find((option) => option.value === target.unit);
                sub = unit ? t(unit.labelKey) : target.unit;
            } else if (target?.attr) {
                const attr = ATTR_OPTIONS.find((option) => option.value === target.attr);
                sub = attr ? attr.label : target.attr;
            }
            return {
                id,
                name: typeof row.name === "string" && row.name ? row.name : `#${id}`,
                sub,
                characterId: target?.characterId,
                unit: target?.unit,
                attr: target?.attr,
                max,
                current: userAreaItems.get(id) ?? null,
            };
        })
        .filter((item): item is OverrideCatalogItem => item !== null)
        .sort((a, b) => a.id - b.id);

    // 角色等级：每角色上限 + 真实 rank。
    const userRanks = new Map<number, number>();
    for (const character of userSnapshot?.userCharacters ?? []) {
        const id = numOf(character.characterId);
        if (id > 0) userRanks.set(id, numOf(character.characterRank));
    }
    const rankMax = new Map<number, number>();
    let globalRankMax = 0;
    for (const row of rowsOf(master.characterRanks)) {
        const rank = numOf(row.characterRank);
        if (rank <= 0) continue;
        globalRankMax = Math.max(globalRankMax, rank);
        const characterId = numOf(row.characterId);
        if (characterId > 0) rankMax.set(characterId, Math.max(rankMax.get(characterId) ?? 0, rank));
    }
    const characters: OverrideCatalogItem[] = rowsOf(master.gameCharacters)
        .map((row): OverrideCatalogItem | null => {
            const id = numOf(row.id);
            if (id <= 0) return null;
            const unitRow = rowsOf(master.gameCharacterUnits).find((entry) => numOf(entry.gameCharacterId) === id);
            const unit = UNIT_BONUS_OPTIONS.find((option) => option.value === unitRow?.unit);
            return {
                id,
                name: getCharacterName(t, id, "full"),
                sub: unit ? t(unit.labelKey) : "",
                characterId: id,
                unit: typeof unitRow?.unit === "string" ? unitRow.unit : undefined,
                max: rankMax.get(id) ?? globalRankMax,
                current: userRanks.get(id) ?? null,
            };
        })
        .filter((item): item is OverrideCatalogItem => item !== null);

    // 烤森门：上限 + 真实等级。
    const gateMax = new Map<number, number>();
    for (const row of rowsOf(master.mysekaiGateLevels)) {
        const id = numOf(row.mysekaiGateId);
        const level = numOf(row.level);
        if (id > 0 && level > 0) gateMax.set(id, Math.max(gateMax.get(id) ?? 0, level));
    }
    const userGateLevels = new Map<number, number>();
    for (const gate of userSnapshot?.userMysekaiGates ?? []) {
        const id = numOf(gate.mysekaiGateId);
        if (id > 0) userGateLevels.set(id, numOf(gate.mysekaiGateLevel));
    }
    const gates: OverrideCatalogItem[] = rowsOf(master.mysekaiGates)
        .map((row): OverrideCatalogItem | null => {
            const id = numOf(row.id);
            const max = gateMax.get(id) ?? 0;
            if (id <= 0 || max <= 0) return null;
            const unit = UNIT_BONUS_OPTIONS.find((option) => option.value === row.unit);
            return {
                id,
                name: typeof row.name === "string" && row.name ? row.name : `#${id}`,
                sub: unit ? t(unit.labelKey) : "",
                unit: typeof row.unit === "string" ? row.unit : undefined,
                max,
                current: userGateLevels.get(id) ?? null,
            };
        })
        .filter((item): item is OverrideCatalogItem => item !== null)
        .sort((a, b) => a.id - b.id);

    // 玩偶加成：按角色。
    const userFixtureRates = new Map<number, number>();
    for (const fixture of userSnapshot?.userMysekaiFixtureGameCharacterPerformanceBonuses ?? []) {
        const id = numOf(fixture.gameCharacterId);
        if (id > 0 && !userFixtureRates.has(id)) userFixtureRates.set(id, numOf(fixture.totalBonusRate));
    }
    const fixtureCharacters: OverrideCatalogItem[] = rowsOf(master.gameCharacters)
        .map((row): OverrideCatalogItem | null => {
            const id = numOf(row.id);
            if (id <= 0) return null;
            const unitRow = rowsOf(master.gameCharacterUnits).find((entry) => numOf(entry.gameCharacterId) === id);
            const unit = UNIT_BONUS_OPTIONS.find((option) => option.value === unitRow?.unit);
            return {
                id,
                name: getCharacterName(t, id, "full"),
                sub: unit ? t(unit.labelKey) : "",
                characterId: id,
                unit: typeof unitRow?.unit === "string" ? unitRow.unit : undefined,
                max: 0,
                current: userFixtureRates.get(id) ?? null,
            };
        })
        .filter((item): item is OverrideCatalogItem => item !== null);

    return { areaItems, characters, gates, fixtureCharacters };
}

const MODE_OPTIONS: { value: DeckRecommendMode }[] = [
    { value: "event" },
    { value: "challenge" },
    { value: "custom" },
    { value: "strongest" },
    { value: "weakest" },
    { value: "mysekai" },
];

const DIFFICULTY_OPTIONS = ["easy", "normal", "hard", "expert", "master", "append"];

const DIFFICULTY_COLORS: Record<string, string> = {
    easy: "bg-blue-500",
    normal: "bg-green-500",
    hard: "bg-amber-500",
    expert: "bg-red-500",
    master: "bg-purple-500",
    append: "bg-[#EE92BC]",
};

const LIVE_TYPE_OPTIONS = ["multi", "solo", "auto"] as const;
const CHALLENGE_LIVE_OPTIONS = ["challenge", "auto"] as const;

const RARITY_CONFIG_KEYS = [
    { key: "rarity_1", color: "#888888" },
    { key: "rarity_2", color: "#88BB44" },
    { key: "rarity_3", color: "#4488DD" },
    { key: "rarity_4", color: "#FFAA00" },
    { key: "rarity_birthday", color: "#FF6699" },
];


const SIM_EVENT_TYPE_OPTIONS = ["marathon", "cheerful_carnival", "world_bloom"] as const;

const VIRTUAL_SINGER_ID_MIN = 21;

type TranslationFn = ReturnType<typeof useI18n>["t"];

function formatBonusValue(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

function formatScoreValue(value: number): string {
    return new Intl.NumberFormat("en-US").format(Math.floor(value));
}

/** 解析目标加成输入（空格/逗号分隔的正整数，最多 32 个）。 */
function parseBonusTargets(text: string): number[] | null {
    const parts = text.split(/[\s,，]+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length > 32) return null;
    const values: number[] = [];
    for (const part of parts) {
        const value = Number.parseInt(part, 10);
        if (!Number.isFinite(value) || value <= 0) return null;
        values.push(value);
    }
    return values;
}

// ==================== Fake Progress Bar ====================
function ProgressBar({ percent, stageLabel }: { percent: number; stageLabel: string }) {
    const [displayPercent, setDisplayPercent] = useState(0);
    const targetRef = useRef(percent);

    useEffect(() => {
        targetRef.current = percent;
        let raf: number;
        const tick = () => {
            setDisplayPercent((prev) => {
                const target = targetRef.current;
                if (prev >= target) return prev;
                const next = prev + Math.max(0.2, (target - prev) * 0.08);
                return next > target ? target : next;
            });
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [percent]);

    return (
        <div className="ds-progress-container">
            <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-on-surface-variant">{stageLabel}</span>
                <span className="text-xs font-mono text-primary font-bold">{Math.round(displayPercent)}%</span>
            </div>
            <div className="ds-progress-track">
                <div className="ds-progress-bar" style={{ width: `${displayPercent}%` }} />
            </div>
        </div>
    );
}

function SectionTitle({ text }: { text: string }) {
    return (
        <label className="mb-2 block type-title-s text-on-surface">{text}</label>
    );
}

function usePillClass() {
    return useCallback((active: boolean) =>
        `state-layer focus-ring inline-flex h-10 items-center justify-center gap-2 px-4 rounded-md3-sm type-label-l transition-colors duration-200 ease-md3-standard ${active
            ? "bg-secondary-container text-on-secondary-container"
            : "border border-outline-variant text-on-surface-variant"}`, []);
}

// ==================== Character multi-select grid ====================
function CharacterMultiGrid({
    selected,
    onToggle,
    maxCount,
}: {
    selected: number[];
    onToggle: (id: number) => void;
    maxCount: number;
}) {
    const { t } = useI18n();
    return (
        <div className="flex flex-wrap gap-2">
            {CUSTOM_CHARACTER_IDS.map((id) => {
                const active = selected.includes(id);
                const full = !active && selected.length >= maxCount;
                return (
                    <button
                        key={id}
                        type="button"
                        disabled={full}
                        onClick={() => onToggle(id)}
                        className={`w-10 h-10 rounded-full p-0.5 transition-all border relative ${
                            active
                                ? "ring-2 ring-primary border-primary bg-secondary-container"
                                : full
                                    ? "opacity-30 cursor-not-allowed border-outline-variant"
                                    : "border-outline-variant hover:border-primary bg-surface-container-lowest"
                        }`}
                        title={getCharacterName(t, id, "full")}
                    >
                        <img src={getCharacterIconUrl(id)} alt="" className="w-full h-full rounded-full object-contain" loading="lazy" />
                        {active && (
                            <span className="absolute -top-0.5 -right-0.5 bg-primary text-on-primary rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-bold">
                                ✓
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ==================== Song ranking panel ====================
type MusicRankRow = DeckMusicRow;

function SongRankingPanel({
    rows,
    loading,
    songTitles,
}: {
    rows: MusicRankRow[] | null;
    loading: boolean;
    songTitles: Map<number, string>;
}) {
    const { t } = useI18n();
    if (loading) {
        return <p className="text-xs text-on-surface-variant py-2">{t("page.deckRecommend.result.songRankingLoading")}</p>;
    }
    if (!rows || rows.length === 0) {
        return <p className="text-xs text-on-surface-variant py-2">{t("page.deckRecommend.result.songRankingEmpty")}</p>;
    }
    return (
        <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
                <thead>
                    <tr className="text-on-surface-variant">
                        <th className="text-left py-1 px-1">#</th>
                        <th className="text-left py-1 px-1">{t("page.deckRecommend.result.colSong")}</th>
                        <th className="text-left py-1 px-1">{t("page.deckRecommend.result.colDifficulty")}</th>
                        <th className="text-right py-1 px-1">{t("page.deckRecommend.result.colLiveScore")}</th>
                        <th className="text-right py-1 px-1">{t("page.deckRecommend.result.colEventPoint")}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(0, 20).map((row, i) => {
                        return (
                            <tr key={`${row.musicId}-${row.difficulty}`} className="border-t border-outline-variant">
                                <td className="py-1.5 px-1 font-bold text-on-surface-variant">{i + 1}</td>
                                <td className="py-1.5 px-1 text-on-surface-variant">
                                    {songTitles.get(row.musicId) ?? `#${row.musicId}`}
                                </td>
                                <td className="py-1.5 px-1 font-mono uppercase text-on-surface-variant">{row.difficulty}</td>
                                <td className="py-1.5 px-1 text-right font-mono text-on-surface-variant">{formatScoreValue(row.liveScore)}</td>
                                <td className="py-1.5 px-1 text-right font-bold text-primary">{row.eventPoint !== undefined ? formatScoreValue(row.eventPoint) : "-"}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ==================== Result deck row ====================
interface DeckRowProps {
    deck: DeckResultDeck;
    scoreLabel: string;
    showBonus: boolean;
    cardsMaster: ICardInfo[];
    songTitles: Map<number, string>;
    userCards: DeckUserCard[];
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
    musicRows: MusicRankRow[] | null;
    musicLoading: boolean;
    onRequestMusic: () => void;
}

function DeckRow({
    deck, scoreLabel, showBonus, cardsMaster, songTitles, userCards, formatNumber,
    musicRows, musicLoading, onRequestMusic,
}: DeckRowProps) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(false);
    const [showRanking, setShowRanking] = useState(false);

    const masterById = useMemo(() => new Map(cardsMaster.map((c) => [c.id, c])), [cardsMaster]);
    const userCardById = useMemo(() => new Map(userCards.map((u) => [u.cardId, u])), [userCards]);

    const totalPower = deck.totalPower;
    const eventBonus = deck.eventBonus ?? 0;

    const copySummary = useCallback(() => {
        const lines = [
            `#${deck.rank} ${scoreLabel}: ${formatScoreValue(deck.score)}`,
            `power: ${formatNumber(totalPower)}`,
            showBonus ? `bonus: ${formatBonusValue(eventBonus)}%` : "",
            `effective skill: ${formatBonusValue(deck.effectiveSkill)}%`,
            deck.cards.map((c, i) => {
                const name = masterById.get(c.cardId)?.prefix ?? `card ${c.cardId}`;
                return `${i === 0 ? "[L]" : "   "} ${name} (${c.cardId})`;
            }).join("\n"),
        ].filter(Boolean);
        navigator.clipboard?.writeText(lines.join("\n")).catch(() => {});
    }, [deck, scoreLabel, showBonus, eventBonus, totalPower, formatNumber, masterById]);

    return (
        <div className="ds-result-row rounded-md3-lg mb-3 overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="state-layer focus-ring w-full flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 p-3 sm:p-4 text-left"
            >
                <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto min-w-0">
                    <div className="flex-shrink-0 w-8 sm:w-9 text-center">
                        <div className={`ds-rank type-title-l sm:type-headline-s ${deck.rank === 1 ? "text-primary" : "text-on-surface-variant"}`}>
                            #{deck.rank}
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="type-headline-s sm:type-headline-m type-emphasized text-on-surface font-mono">
                                {formatScoreValue(deck.score)}
                            </span>
                            <span className="text-xs text-on-surface-variant">{scoreLabel}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 mt-0.5 text-[11px] sm:text-xs text-on-surface-variant flex-wrap">
                            {showBonus && (
                                <span className="font-bold text-tertiary">{formatBonusValue(eventBonus)}%</span>
                            )}
                            <span>{t("page.deckRecommend.result.power")}: {formatNumber(totalPower)}</span>
                            <span>{t("page.deckRecommend.result.effectiveSkill")}: {formatBonusValue(deck.effectiveSkill)}%</span>
                        </div>
                    </div>
                    <Icon path={mdKeyboardArrowDown} size={20} className={`text-on-surface-variant transition-transform flex-shrink-0 sm:hidden ml-auto ${expanded ? "rotate-180" : ""}`} />
                </div>

                <div className="flex gap-1.5 overflow-x-auto no-scrollbar justify-between sm:justify-end sm:ml-auto w-full sm:w-auto pt-1 sm:pt-0">
                    {deck.cards.slice(0, 5).map((card, i) => {
                        const masterCard = masterById.get(card.cardId);
                        const userCard = userCardById.get(card.cardId);
                        const masterRank = userCard?.masterRank ?? card.masterRank;
                        const level = userCard?.level ?? card.level;
                        const isBirthday = card.rarity === "rarity_birthday" || masterCard?.cardRarityType === "rarity_birthday";
                        const showTrained = (card.rarity === "rarity_3" || card.rarity === "rarity_4") && !isBirthday;
                        if (!masterCard) {
                            return (
                                <div key={i} className="ds-card-thumb w-11 h-11 sm:w-12 sm:h-12 rounded bg-surface-container-high flex items-center justify-center text-on-surface-variant text-xs flex-shrink-0">?</div>
                            );
                        }
                        return (
                            <div key={i} className="relative flex flex-col items-center gap-0.5 flex-shrink-0">
                                <Link href={`/cards/${card.cardId}`} className="block relative" target="_blank">
                                    <span className="block w-11 h-11 sm:w-12 sm:h-12">
                                        <SekaiCardThumbnail card={masterCard} trained={showTrained} mastery={masterRank} width={48} />
                                    </span>
                                    {i === 0 && (
                                        <div className="absolute bottom-0 right-0 bg-primary text-on-primary text-[8px] font-bold px-1 py-[1px] rounded-tl-md leading-none z-10">L</div>
                                    )}
                                </Link>
                                <div className="text-[9px] sm:text-[10px] text-on-surface-variant font-mono leading-none flex items-center gap-0.5">
                                    <span>Lv.{level}</span>
                                    {masterRank > 0 && (
                                        <span className="bg-surface-container-high text-on-surface-variant rounded-full px-[3px] py-[1px] flex items-center gap-[1px] leading-none border border-outline-variant">
                                            <span className="text-[8px] font-bold">{masterRank}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <Icon path={mdKeyboardArrowDown} size={20} className={`text-on-surface-variant transition-transform flex-shrink-0 hidden sm:block ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && (
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-outline-variant">
                    <div className="py-2.5 flex flex-wrap items-center gap-2 sm:gap-3 text-xs border-b border-outline-variant">
                        <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant rounded-md3-sm px-2.5 py-1.5">
                            <span className="text-on-surface-variant font-medium">{t("page.deckRecommend.result.liveScore")}:</span>
                            <span className="font-mono font-bold text-on-surface">{formatNumber(deck.liveScore)}</span>
                        </div>
                        {deck.eventPoint !== undefined && (
                            <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant rounded-md3-sm px-2.5 py-1.5">
                                <span className="text-on-surface-variant font-medium">{t("page.deckRecommend.result.eventPoint")}:</span>
                                <span className="font-mono font-bold text-on-surface">{formatNumber(deck.eventPoint)}</span>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setShowRanking((prev) => !prev);
                                if (!showRanking && musicRows === null && !musicLoading) onRequestMusic();
                            }}
                            className="inline-flex h-8 items-center justify-center gap-1.5 bg-secondary-container text-on-secondary-container state-layer focus-ring rounded-full px-3 type-label-l"
                        >
                            <Icon path={mdLeaderboard} size={18} />
                            {t("page.deckRecommend.result.songRanking")}
                        </button>
                        <button
                            type="button"
                            onClick={copySummary}
                            className="inline-flex h-8 items-center justify-center gap-1.5 bg-secondary-container text-on-secondary-container state-layer focus-ring rounded-full px-3 type-label-l"
                        >
                            <Icon path={mdContentCopy} size={18} />
                            {t("page.deckRecommend.result.copy")}
                        </button>
                    </div>
                    {showRanking && (
                        <SongRankingPanel rows={musicRows} loading={musicLoading} songTitles={songTitles} />
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs mt-2">
                            <thead>
                                <tr className="text-on-surface-variant">
                                    <th className="text-left py-1 px-1">{t("page.deckRecommend.result.leader")}</th>
                                    <th className="text-left py-1 px-1">{t("page.deckRecommend.result.cardId")}</th>
                                    <th className="text-left py-1 px-1">{t("page.deckRecommend.result.cardName")}</th>
                                    <th className="text-right py-1 px-1">{t("page.deckRecommend.result.power")}</th>
                                    <th className="text-right py-1 px-1">{t("page.deckRecommend.result.skill")}</th>
                                    {showBonus && <th className="text-right py-1 px-1">{t("page.deckRecommend.result.eventBonus")}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {deck.cards.map((card, i) => {
                                    const masterCard = masterById.get(card.cardId);
                                    const cardName = masterCard?.prefix ?? getCharacterName(t, card.characterId, "short") ?? `ID:${card.characterId}`;
                                    return (
                                        <tr key={i} className="border-t border-outline-variant">
                                            <td className="py-1.5 px-1 font-bold text-on-surface-variant">{i === 0 ? t("page.deckRecommend.result.leader") : `#${i + 1}`}</td>
                                            <td className="py-1.5 px-1 font-mono text-on-surface-variant">{card.cardId}</td>
                                            <td className="py-1.5 px-1 text-on-surface-variant">{cardName}</td>
                                            <td className="py-1.5 px-1 text-right font-mono text-on-surface-variant">{formatNumber(card.power)}</td>
                                            <td className="py-1.5 px-1 text-right text-primary font-bold">{formatBonusValue(card.skillScoreUp)}%</td>
                                            {showBonus && (
                                                <td className="py-1.5 px-1 text-right font-bold text-tertiary">
                                                    {card.eventBonus > 0 ? `${formatBonusValue(card.eventBonus)}%` : "-"}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================== Main client ====================
export default function DeckRecommendClient() {
    const { t, formatNumber } = useI18n();
    const pill = usePillClass();

    // Account
    const [server, setServer] = useState<ServerType>("jp");
    const [userId, setUserId] = useState("");
    // Form state (restorable)
    const [state, setState] = useState<SavedConfig>(DEFAULT_SAVED_CONFIG);
    const patch = useCallback((partial: Partial<SavedConfig>) => {
        setState((prev) => ({ ...prev, ...partial }));
    }, []);

    const {
        mode, eventId, selectedEventType, eventBonusCharacterIds, liveType, supportCharacterId,
        challengeCharacterId, musicId, difficulty, cardConfig, target, bonusTargets,
        simulateEnabled, simType, simAttr, simUnit, simBonusMode, simCharacterIds,
        simCharacterUnits, simTurn, simCharacterId,
        customSubMode, customUnit, customCharacterIds, customCharacterUnits, customAttr,
        strongestTarget, multiTeammatePower, multiTeammateScoreUp, multiScoreUpLowerBound,
        skillOrder, specificSkillOrder, skillReference, keepAfterTrainingState,
        bestSkillAsLeader, minimize, supportMasterMax, supportSkillMax, filterOtherUnit,
        boost, otherScore, leaderCharacterId, fixedCards, fixedCharacters,
        excludedCards, singleCardOverrides, limit, timeoutSeconds,
        areaItemLevel, areaItemOverrides, characterRank, characterRankOverrides,
        mysekaiGateLevel, mysekaiGateOverrides, mysekaiFixtureBonusRate, mysekaiFixtureOverrides,
        unitFilter, attrFilter, characterFilterIds, useCurrentDeck,
    } = state;

    const [isCustomRulesOpen, setIsCustomRulesOpen] = useState(false);

    // Run state (resident engine worker)
    const {
        isCalculating, progressPercent, progressLabel, error, setError, results, userCards,
        duration, completion, musicByDeck, musicLoadingByDeck, warmup, runDeck, requestDeckMusic,
        cancel: handleCancel,
    } = useDeckEngine();
    const [savedHint, setSavedHint] = useState(false);
    const [finaleEventId, setFinaleEventId] = useState<string | null>(null);
    const selectedEventIsFinale = finaleEventId === eventId;
    const calculateScrollYRef = useRef<number | null>(null);

    // Card master + music metas for result rendering
    const [cardsMaster, setCardsMaster] = useState<ICardInfo[]>([]);
    const [songTitles, setSongTitles] = useState<Map<number, string>>(new Map());
    const [cardModal, setCardModal] = useState<null | "fixed" | "excluded" | "single">(null);

    // 数据覆盖的主数据目录
    const [overrideMaster, setOverrideMaster] = useState<{
        areaItems: unknown[];
        areaItemLevels: unknown[];
        characterRanks: unknown[];
        gameCharacters: unknown[];
        gameCharacterUnits: unknown[];
        mysekaiGates: unknown[];
        mysekaiGateLevels: unknown[];
    } | null>(null);
    const [userSnapshot, setUserSnapshot] = useState<OverrideUserSnapshot | null>(null);

    const emptyOverrideCatalogs = useMemo(() => ({
        areaItems: [] as OverrideCatalogItem[],
        characters: [] as OverrideCatalogItem[],
        gates: [] as OverrideCatalogItem[],
        fixtureCharacters: [] as OverrideCatalogItem[],
    }), []);

    // 默认使用日服数据作为数据覆盖目录主数据
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchMasterDataForServer<unknown[]>("jp", "areaItems.json"),
            fetchMasterDataForServer<unknown[]>("jp", "areaItemLevels.json"),
            fetchMasterDataForServer<unknown[]>("jp", "characterRanks.json"),
            fetchMasterDataForServer<unknown[]>("jp", "gameCharacters.json"),
            fetchMasterDataForServer<unknown[]>("jp", "gameCharacterUnits.json"),
            fetchMasterDataForServer<unknown[]>("jp", "mysekaiGates.json"),
            fetchMasterDataForServer<unknown[]>("jp", "mysekaiGateLevels.json"),
        ])
            .then(([areaItems, areaItemLevels, characterRanks, gameCharacters, gameCharacterUnits, mysekaiGates, mysekaiGateLevels]) => {
                if (cancelled) return;
                setOverrideMaster({
                    areaItems,
                    areaItemLevels,
                    characterRanks,
                    gameCharacters,
                    gameCharacterUnits,
                    mysekaiGates,
                    mysekaiGateLevels,
                });
            })
            .catch(console.error);
        return () => {
            cancelled = true;
        };
    }, []);

    // 用户快照根据当前选择的账号区服与用户 ID 拉取
    useEffect(() => {
        let cancelled = false;
        const trimmed = userId.trim();
        if (!trimmed) return;
        (async () => {
            try {
                const provider = SnowyDataProvider.getCachedInstance(
                    trimmed,
                    server,
                    getOAuthAccessTokenForGameUser(server, trimmed),
                );
                const userData = await provider.getUserDataAll();
                if (cancelled) return;
                setUserSnapshot(userData as OverrideUserSnapshot);
            } catch {
                if (cancelled) return;
                setUserSnapshot(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [server, userId]);

    const effectiveUserSnapshot = userId.trim() ? userSnapshot : null;

    const overrideCatalogs = useMemo(
        () => overrideMaster
            ? buildOverrideCatalogs(overrideMaster, effectiveUserSnapshot, t)
            : emptyOverrideCatalogs,
        [overrideMaster, effectiveUserSnapshot, t, emptyOverrideCatalogs],
    );

    // 卡名与缩略图（默认使用日服全量数据）
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchMasterDataForServer<ICardInfo[]>("jp", "cards.json"),
            fetchMasterDataForServer<IMusicInfo[]>("jp", "musics.json"),
        ])
            .then(([cards, musics]) => {
                if (cancelled) return;
                setCardsMaster(cards);
                setSongTitles(new Map(musics.map((m) => [m.id, m.title])));
            })
            .catch(console.error);
        return () => {
            cancelled = true;
        };
    }, []);

    // Background warmup on load and on server/account change; the hook terminates the worker on unmount.
    useEffect(() => {
        warmup(server, userId);
    }, [server, userId, warmup]);

    // Restore last used account + saved config
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        const restored = parseSavedDeckConfig(localStorage.getItem(SAVED_CONFIG_KEY));
        const account = resolveDeckAccount();
        if (account.server) setServer(account.server);
        if (account.userId) setUserId(account.userId);
        if (restored) setState((prev) => ({ ...prev, ...restored }));
    }, []);
    /* eslint-enable react-hooks/set-state-in-effect */

    const selectedWl3Simulation: Wl3SimulationGroup | null = useMemo(
        () => getWl3SimulationGroupByEventId(eventId),
        [eventId],
    );

    // Clear support char when it no longer belongs to the current bonus set
    useEffect(() => {
        if (supportCharacterId === null || supportCharacterId <= 0) return;
        const allowed: readonly number[] | null = selectedWl3Simulation
            ? (selectedWl3Simulation.members as readonly number[])
            : selectedEventType === "world_bloom"
                ? eventBonusCharacterIds
                : null;
        if (allowed && !allowed.includes(supportCharacterId)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            patch({ supportCharacterId: 0 });
        }
    }, [selectedWl3Simulation, selectedEventType, eventBonusCharacterIds, supportCharacterId, patch]);

    const needsMusic = mode !== "mysekai" && mode !== "weakest";
    const needsEvent = mode === "event" || mode === "mysekai";
    const needsLiveType = mode === "event" || mode === "custom" || mode === "strongest";

    const scoreLabel = useMemo(() => {
        if (mode === "mysekai") return t("page.deckRecommend.scoreLabels.mysekai");
        if (mode === "challenge") return t("page.deckRecommend.scoreLabels.challenge");
        if (mode === "weakest") return t("page.deckRecommend.scoreLabels.power");
        if (mode === "strongest") {
            return strongestTarget === "skill"
                ? t("page.deckRecommend.scoreLabels.effectiveSkill")
                : t("page.deckRecommend.scoreLabels.power");
        }
        if (mode === "event" && target === "power") return t("page.deckRecommend.scoreLabels.power");
        if (mode === "event" && target === "bonus") return t("page.deckRecommend.scoreLabels.bonus");
        return t("page.deckRecommend.scoreLabels.pt");
    }, [mode, strongestTarget, target, t]);

    const updateCardConfig = useCallback((key: string, field: keyof DeckTrainingConfig, value: boolean) => {
        setState((prev) => ({
            ...prev,
            cardConfig: {
                ...prev.cardConfig,
                [key]: {
                    ...prev.cardConfig[key],
                    [field]: value,
                },
            },
        }));
    }, []);

    const handleEventSelect = useCallback((id: string, evType?: string) => {
        patch({ eventId: id, selectedEventType: evType ?? null });
    }, [patch]);

    const handleEventTypeChange = useCallback((evType: string | null) => {
        patch({ selectedEventType: evType });
    }, [patch]);

    const handleFinaleChange = useCallback((id: string, isFinale: boolean) => {
        setFinaleEventId(isFinale ? id : null);
    }, []);

    const handleBonusCharacters = useCallback((charIds: number[]) => {
        patch({ eventBonusCharacterIds: charIds });
    }, [patch]);

    const handleSaveConfig = () => {
        localStorage.setItem(SAVED_CONFIG_KEY, JSON.stringify(state));
        setSavedHint(true);
        setTimeout(() => setSavedHint(false), 2000);
    };

    const handleClearConfig = () => {
        localStorage.removeItem(SAVED_CONFIG_KEY);
        setState({ ...DEFAULT_SAVED_CONFIG, cardConfig: DEFAULT_CARD_CONFIG });
    };

    const handleResetRules = useCallback(() => {
        patch({
            fixedCards: [],
            fixedCharacters: [],
            excludedCards: [],
            useCurrentDeck: false,
            leaderCharacterId: null,
            bestSkillAsLeader: true,
            unitFilter: "",
            attrFilter: "",
            characterFilterIds: [],
            multiTeammatePower: "",
            multiTeammateScoreUp: "",
            multiScoreUpLowerBound: "",
            skillOrder: "average",
            specificSkillOrder: "",
            skillReference: "average",
            keepAfterTrainingState: false,
            supportMasterMax: false,
            supportSkillMax: false,
            filterOtherUnit: false,
            boost: "",
            otherScore: "",
            areaItemLevel: "",
            areaItemOverrides: [],
            characterRank: "",
            characterRankOverrides: [],
            mysekaiGateLevel: "",
            mysekaiGateOverrides: [],
            mysekaiFixtureBonusRate: "",
            mysekaiFixtureOverrides: [],
            singleCardOverrides: [],
            limit: "10",
            timeoutSeconds: "120",
        });
    }, [patch]);

    const customRulesState: CustomRulesState = useMemo(() => ({
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
    }), [
        fixedCards, fixedCharacters, excludedCards, useCurrentDeck, leaderCharacterId,
        bestSkillAsLeader, unitFilter, attrFilter, characterFilterIds, multiTeammatePower,
        multiTeammateScoreUp, multiScoreUpLowerBound, skillOrder, specificSkillOrder,
        skillReference, keepAfterTrainingState, supportMasterMax, supportSkillMax,
        filterOtherUnit, boost, otherScore, areaItemLevel, areaItemOverrides,
        characterRank, characterRankOverrides, mysekaiGateLevel, mysekaiGateOverrides,
        mysekaiFixtureBonusRate, mysekaiFixtureOverrides, singleCardOverrides, limit, timeoutSeconds,
    ]);

    const restoreCalculateScroll = useCallback(() => {
        if (calculateScrollYRef.current === null) return;
        const savedY = calculateScrollYRef.current;
        requestAnimationFrame(() => {
            window.scrollTo({ top: savedY, behavior: "instant" });
            requestAnimationFrame(() => {
                window.scrollTo({ top: savedY, behavior: "instant" });
                calculateScrollYRef.current = null;
            });
        });
    }, []);

    const handleCalculate = async () => {
        if (!userId.trim()) {
            setError(t("page.deckRecommend.errors.userRequired"));
            return;
        }
        if (needsMusic && !musicId) {
            setError(t("page.deckRecommend.errors.musicRequired"));
            return;
        }
        if (needsEvent && !simulateEnabled && !eventId) {
            setError(t("page.deckRecommend.errors.eventRequired"));
            return;
        }
        if (mode === "event" && !simulateEnabled && selectedEventType === "world_bloom" && !selectedEventIsFinale && !supportCharacterId) {
            setError(t("page.deckRecommend.errors.supportCharacterRequired"));
            return;
        }
        if (mode === "challenge" && !challengeCharacterId) {
            setError(t("page.deckRecommend.errors.characterRequired"));
            return;
        }
        if (mode === "custom" && customSubMode === "character" && customCharacterIds.length === 0) {
            setError(t("page.deckRecommend.errors.customCharactersRequired"));
            return;
        }
        if (mode === "event" && simulateEnabled && simType === "world_bloom" && simTurn !== 3 && !simUnit) {
            setError(t("page.deckRecommend.errors.simulateUnitRequired"));
            return;
        }
        if (mode === "event" && simulateEnabled && simType === "world_bloom" && simTurn === 3 && !simCharacterId) {
            setError(t("page.deckRecommend.errors.supportCharacterRequired"));
            return;
        }
        if (
            mode === "event" && simulateEnabled && simType !== "world_bloom"
            && simBonusMode === "character" && simCharacterIds.length === 0
        ) {
            setError(t("page.deckRecommend.errors.customCharactersRequired"));
            return;
        }

        calculateScrollYRef.current = typeof window !== "undefined" ? window.scrollY : null;
        runDeck(() => {
            const bonusTargetsParsed = target === "bonus" && bonusTargets.trim() ? parseBonusTargets(bonusTargets) : null;
            if (target === "bonus" && bonusTargets.trim() && !bonusTargetsParsed) {
                return { error: t("page.deckRecommend.errors.bonusTargetsInvalid") };
            }
            return buildDeckWorkerArgs(state, {
                server,
                userId,
                bonusTargets: bonusTargetsParsed,
            });
        }, { onSuccess: restoreCalculateScroll });
    };

    const requestMusic = (deck: DeckResultDeck) => {
        if (musicLoadingByDeck[deck.rank]) return;
        requestDeckMusic({
            requestId: deck.rank,
            liveType,
            eventType: selectedEventType ?? undefined,
            teammates: {
                power: multiTeammatePower ? parseInt(multiTeammatePower) : undefined,
                scoreUp: multiTeammateScoreUp ? parseInt(multiTeammateScoreUp) : undefined,
            },
            deck: {
                totalPower: deck.totalPower,
                eventBonusRate: deck.eventBonus ?? 0,
                supportDeckBonusRate: 0,
                cards: deck.cards.map((c) => ({ skillScoreUp: c.skillScoreUp, skillLifeRecovery: 0 })),
            },
        });
    };

    return (
        <MainLayout>
            <PageContainer className="max-w-5xl">
                <PageHeader
                    align="center"
                    eyebrow={t("page.deckRecommend.badge")}
                    title={t("page.deckRecommend.title")}
                    highlight={t("page.deckRecommend.titleHighlight")}
                    description={t("page.deckRecommend.description")}
                />

                {/* Account Card */}
                <div className="bg-surface-card border border-outline-variant/70 p-5 sm:p-6 rounded-md3-xl mb-6">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <h2 className="type-title-l text-on-surface flex items-center gap-2">
                            <Icon path={mdAccountCircle} size={24} className="text-primary" />
                            {t("page.deckRecommend.account.title")}
                        </h2>
                        <div className="flex gap-2">
                            <Button type="button" variant="tonal" size="xs" icon={savedHint ? mdCheck : mdSave} onClick={handleSaveConfig}>
                                {savedHint ? t("page.deckRecommend.config.saved") : t("page.deckRecommend.config.save")}
                            </Button>
                            <Button type="button" variant="text" size="xs" icon={mdDelete} onClick={handleClearConfig}>
                                {t("page.deckRecommend.config.clear")}
                            </Button>
                        </div>
                    </div>
                    <AccountSelector
                        onSelect={(gameId, srv) => {
                            setUserId(gameId);
                            setServer(srv);
                            localStorage.setItem(USER_ID_STORAGE_KEY, gameId);
                            localStorage.setItem(SERVER_STORAGE_KEY, srv);
                        }}
                        currentUserId={userId}
                        currentServer={server}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-1">
                        <div>
                            <SectionTitle text={t("page.deckRecommend.account.server")} />
                            <div className="flex flex-wrap gap-2">
                                {SERVER_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            setServer(option.value);
                                            localStorage.setItem(SERVER_STORAGE_KEY, option.value);
                                        }}
                                        className={pill(server === option.value)}
                                    >
                                        <ServerRegionLabel server={option.value} />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <SectionTitle text={t("page.deckRecommend.account.userId")} />
                            <input
                                type="text"
                                value={userId}
                                onChange={(e) => {
                                    setUserId(e.target.value);
                                    localStorage.setItem(USER_ID_STORAGE_KEY, e.target.value);
                                }}
                                placeholder={t("page.deckRecommend.account.userIdPlaceholder")}
                                className="h-12 w-full rounded-md3-xs border border-outline bg-transparent px-4 type-body-l text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant"
                            />
                            <p className="text-xs text-on-surface-variant mt-1.5">{t("page.deckRecommend.account.userIdHint")}</p>
                        </div>
                    </div>
                </div>

                {/* Mode tabs */}
                <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-2 mb-6 justify-center">
                    {MODE_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => patch({ mode: option.value })}
                            className={`${pill(mode === option.value)} text-center px-2 sm:px-4 whitespace-nowrap`}
                        >
                            {t(`page.deckRecommend.modes.${option.value}`)}
                        </button>
                    ))}
                </div>

                {/* Config card */}
                <div className="bg-surface-card border border-outline-variant/70 p-5 sm:p-6 rounded-md3-xl mb-6">
                    {/* Active Rules Summary Panel */}
                    <ActiveRulesSummary
                        state={customRulesState}
                        onOpenModal={() => setIsCustomRulesOpen(true)}
                        onChange={patch}
                        onResetAll={handleResetRules}
                        cardsMaster={cardsMaster}
                    />

                    {/* 挑战组卡 */}
                    {mode === "challenge" && (
                        <div className="mb-5">
                            <SectionTitle text={t("page.deckRecommend.config.challengeTitle")} />
                            <CharacterSelector
                                selectedCharacterId={challengeCharacterId}
                                onSelect={(id) => patch({ challengeCharacterId: id })}
                            />
                            <div className="mt-3">
                                <SectionTitle text={t("page.deckRecommend.config.challengeLiveType")} />
                                <div className="flex gap-2">
                                    {CHALLENGE_LIVE_OPTIONS.map((option) => (
                                        <button key={option} type="button" onClick={() => patch({ liveType: option })} className={pill(liveType === option)}>
                                            {t(`page.deckRecommend.config.challengeLiveTypes.${option}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 活动选择 / 模拟活动 */}
                    {mode === "event" && (
                        <div className="mb-5">
                            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                                <SectionTitle text={t("page.deckRecommend.config.eventTitle")} />
                                <div className="flex items-center gap-2">
                                    <span className="type-label-l text-on-surface-variant">
                                        {t("page.deckRecommend.config.simulateTitle")}
                                    </span>
                                    <Switch
                                        checked={simulateEnabled}
                                        onCheckedChange={(checked) => patch({ simulateEnabled: checked })}
                                        title={t("page.deckRecommend.config.simulateDesc")}
                                        aria-label={t("page.deckRecommend.config.simulateTitle")}
                                    />
                                </div>
                            </div>
                            {simulateEnabled ? (
                                <div className="rounded-md3-lg bg-surface-container p-4">
                                    <p className="text-xs text-on-surface-variant mb-3">{t("page.deckRecommend.config.simulateDesc")}</p>
                                    <SectionTitle text={t("page.deckRecommend.config.simulateType")} />
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {SIM_EVENT_TYPE_OPTIONS.map((option) => (
                                            <button key={option} type="button" onClick={() => patch({ simType: option })} className={pill(simType === option)}>
                                                {t(`common.eventTypes.${option}`)}
                                            </button>
                                        ))}
                                    </div>
                                    {simType === "world_bloom" ? (
                                        <div className="mb-3">
                                            <SectionTitle text={t("page.deckRecommend.config.simulateTurn")} />
                                            <div className="flex gap-2 mb-3">
                                                {[1, 2, 3].map((turn) => (
                                                    <button key={turn} type="button" onClick={() => patch({ simTurn: turn })} className={pill(simTurn === turn)}>
                                                        {t("page.deckRecommend.config.simulateTurnOption", { turn: String(turn) })}
                                                    </button>
                                                ))}
                                            </div>
                                            {simTurn !== 3 ? (
                                                <div>
                                                    <SectionTitle text={t("page.deckRecommend.config.simulateUnit")} />
                                                    <div className="flex flex-wrap gap-2">
                                                        {UNIT_BONUS_OPTIONS.map((unit) => {
                                                            const isSelected = simUnit === unit.value;
                                                            return (
                                                                <button
                                                                    key={unit.value}
                                                                    type="button"
                                                                    onClick={() => patch({ simUnit: unit.value })}
                                                                    className={`p-2 rounded-md3-md transition-all border ${
                                                                        isSelected
                                                                            ? "ring-2 ring-primary shadow-elev-1 bg-surface-container-lowest border-transparent"
                                                                            : "bg-surface-container-lowest border-outline-variant hover:bg-surface-container-high"
                                                                    }`}
                                                                    title={t(unit.labelKey)}
                                                                >
                                                                    <div className="w-7 h-7 relative">
                                                                        <Image src={`/data/icon/${unit.icon}`} alt={t(unit.labelKey)} fill className="object-contain" unoptimized />
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <SectionTitle text={t("page.deckRecommend.config.simulateCharacter")} />
                                                    <CharacterSelector
                                                        selectedCharacterId={simCharacterId}
                                                        onSelect={(id) => patch({ simCharacterId: id })}
                                                        hideUnitFilter
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            {/* 团活按团给加成，混活直接指定加成角色集合。 */}
                                            <SectionTitle text={t("page.deckRecommend.config.customTitle")} />
                                            <div className="flex gap-2 mb-3">
                                                <button type="button" onClick={() => patch({ simBonusMode: "unit" })} className={pill(simBonusMode === "unit")}>
                                                    {t("page.deckRecommend.config.customSubMode.unit")}
                                                </button>
                                                <button type="button" onClick={() => patch({ simBonusMode: "character" })} className={pill(simBonusMode === "character")}>
                                                    {t("page.deckRecommend.config.customSubMode.character")}
                                                </button>
                                            </div>
                                            {simBonusMode === "unit" ? (
                                                <div className="mb-3">
                                                    <SectionTitle text={t("page.deckRecommend.config.simulateUnit")} />
                                                    <div className="flex flex-wrap gap-2">
                                                        {UNIT_BONUS_OPTIONS.map((unit) => {
                                                            const isSelected = simUnit === unit.value;
                                                            return (
                                                                <button
                                                                    key={unit.value}
                                                                    type="button"
                                                                    onClick={() => patch({ simUnit: isSelected ? "" : unit.value })}
                                                                    className={`p-2 rounded-md3-md transition-all border ${
                                                                        isSelected
                                                                            ? "ring-2 ring-primary shadow-elev-1 bg-surface-container-lowest border-transparent"
                                                                            : "bg-surface-container-lowest border-outline-variant hover:bg-surface-container-high"
                                                                    }`}
                                                                    title={t(unit.labelKey)}
                                                                >
                                                                    <div className="w-7 h-7 relative">
                                                                        <Image src={`/data/icon/${unit.icon}`} alt={t(unit.labelKey)} fill className="object-contain" unoptimized />
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="mb-3">
                                                    <SectionTitle text={t("page.deckRecommend.config.simulateCharacter")} />
                                                    <p className="text-xs text-on-surface-variant mb-2">{t("page.deckRecommend.config.customCharactersHint")}</p>
                                                    <CharacterMultiGrid
                                                        selected={simCharacterIds}
                                                        onToggle={(id) => {
                                                            setState((prev) => {
                                                                const next = prev.simCharacterIds.includes(id)
                                                                    ? prev.simCharacterIds.filter((v) => v !== id)
                                                                    : prev.simCharacterIds.length >= 5
                                                                        ? prev.simCharacterIds
                                                                        : [...prev.simCharacterIds, id].sort((a, b) => a - b);
                                                                const units = { ...prev.simCharacterUnits };
                                                                if (!next.includes(id)) delete units[id];
                                                                return { ...prev, simCharacterIds: next, simCharacterUnits: units };
                                                            });
                                                        }}
                                                        maxCount={5}
                                                    />
                                                    {simCharacterIds.some((id) => id >= VIRTUAL_SINGER_ID_MIN) && (
                                                        <div className="mt-4 space-y-2">
                                                            {simCharacterIds.filter((id) => id >= VIRTUAL_SINGER_ID_MIN).map((id) => (
                                                                <div key={id} className="flex items-center gap-2 flex-wrap">
                                                                    <img src={getCharacterIconUrl(id)} alt="" className="w-7 h-7 rounded-full object-contain" loading="lazy" />
                                                                    <span className="text-xs text-on-surface-variant font-medium w-24 truncate">
                                                                        {getCharacterName(t, id, "short")}
                                                                    </span>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {UNIT_BONUS_OPTIONS.map((unit) => {
                                                                            const isSelected = simCharacterUnits[id] === unit.value;
                                                                            return (
                                                                                <button
                                                                                    key={unit.value}
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        setState((prev) => {
                                                                                            const units = { ...prev.simCharacterUnits };
                                                                                            if (units[id] === unit.value) delete units[id];
                                                                                            else units[id] = unit.value;
                                                                                            return { ...prev, simCharacterUnits: units };
                                                                                        })
                                                                                    }
                                                                                    className={`p-1.5 rounded-md3-sm transition-all border ${
                                                                                        isSelected
                                                                                            ? "ring-2 ring-primary bg-surface-container-lowest border-transparent"
                                                                                            : "bg-surface-container-high border-transparent hover:bg-surface-container-high"
                                                                                    }`}
                                                                                    title={t(unit.labelKey)}
                                                                                >
                                                                                    <div className="w-5 h-5 relative">
                                                                                        <Image src={`/data/icon/${unit.icon}`} alt={t(unit.labelKey)} fill className="object-contain" unoptimized />
                                                                                    </div>
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <SectionTitle text={t("page.deckRecommend.config.simulateAttr")} />
                                            <div className="flex flex-wrap gap-2">
                                                {ATTR_OPTIONS.map((attr) => {
                                                    const isSelected = simAttr === attr.value;
                                                    return (
                                                        <button
                                                            key={attr.value}
                                                            type="button"
                                                            onClick={() => patch({ simAttr: isSelected ? "" : attr.value })}
                                                            className={`p-2 rounded-md3-md transition-all border ${
                                                                isSelected
                                                                    ? "ring-2 ring-primary shadow-elev-1 bg-surface-container-lowest border-transparent"
                                                                    : "bg-surface-container-lowest border-outline-variant hover:bg-surface-container-high"
                                                            }`}
                                                            title={attr.label}
                                                        >
                                                            <div className="w-7 h-7 relative">
                                                                <Image src={`/data/icon/${attr.icon}`} alt={attr.label} fill className="object-contain" unoptimized />
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <EventSelector
                                        selectedEventId={eventId}
                                        onSelect={handleEventSelect}
                                        onEventTypeChange={handleEventTypeChange}
                                        onFinaleChange={handleFinaleChange}
                                        onBonusCharactersChange={handleBonusCharacters}
                                    />
                                    {selectedWl3Simulation && (
                                        <p className="text-xs text-primary mt-2 font-medium">
                                            {t("page.deckRecommend.config.wl3Hint", { group: String(selectedWl3Simulation.groupId) })}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                    {mode === "mysekai" && (
                        <div className="mb-5">
                            <SectionTitle text={t("page.deckRecommend.config.eventTitle")} />
                            <EventSelector
                                selectedEventId={eventId}
                                onSelect={handleEventSelect}
                            />
                        </div>
                    )}

                    {/* 连接世界章节角色 */}
                    {mode === "event" && !simulateEnabled && selectedEventType === "world_bloom" && !selectedEventIsFinale && (
                        <div className="mb-5">
                            <SectionTitle
                                text={selectedWl3Simulation
                                    ? t("page.deckRecommend.config.wl3Chapter")
                                    : t("page.deckRecommend.config.wlChapter")}
                            />
                            <CharacterSelector
                                selectedCharacterId={supportCharacterId}
                                onSelect={(id) => patch({ supportCharacterId: id })}
                                availableCharacterIds={
                                    selectedWl3Simulation
                                        ? (selectedWl3Simulation.members as readonly number[])
                                        : eventBonusCharacterIds.length
                                            ? eventBonusCharacterIds
                                            : undefined
                                }
                                hideUnitFilter
                            />
                        </div>
                    )}

                    {/* 最弱组卡 */}
                    {mode === "weakest" && (
                        <div className="mb-5">
                            <Banner tone="info">{t("page.deckRecommend.config.weakestHint")}</Banner>
                        </div>
                    )}

                    {/* 自定义加成 */}
                    {mode === "custom" && (
                        <div className="mb-5">
                            <SectionTitle text={t("page.deckRecommend.config.customTitle")} />
                            <div className="flex gap-2 mb-4">
                                <button type="button" onClick={() => patch({ customSubMode: "unit" })} className={pill(customSubMode === "unit")}>
                                    {t("page.deckRecommend.config.customSubMode.unit")}
                                </button>
                                <button type="button" onClick={() => patch({ customSubMode: "character" })} className={pill(customSubMode === "character")}>
                                    {t("page.deckRecommend.config.customSubMode.character")}
                                </button>
                            </div>
                            {customSubMode === "unit" ? (
                                <div>
                                    <SectionTitle text={t("page.deckRecommend.config.customUnit")} />
                                    <div className="flex flex-wrap gap-2">
                                        {UNIT_BONUS_OPTIONS.map((unit) => {
                                            const isSelected = customUnit === unit.value;
                                            return (
                                                <button
                                                    key={unit.value}
                                                    type="button"
                                                    onClick={() => patch({ customUnit: unit.value })}
                                                    className={`p-2 rounded-md3-md transition-all border ${
                                                        isSelected
                                                            ? "ring-2 ring-primary shadow-elev-1 bg-surface-container-lowest border-transparent"
                                                            : "bg-surface-container-lowest border-outline-variant hover:bg-surface-container-high"
                                                    }`}
                                                    title={t(unit.labelKey)}
                                                >
                                                    <div className="w-7 h-7 relative">
                                                        <Image src={`/data/icon/${unit.icon}`} alt={t(unit.labelKey)} fill className="object-contain" unoptimized />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <SectionTitle text={t("page.deckRecommend.config.customCharacters")} />
                                    <p className="text-xs text-on-surface-variant mb-2">{t("page.deckRecommend.config.customCharactersHint")}</p>
                                    <CharacterMultiGrid
                                        selected={customCharacterIds}
                                        onToggle={(id) => {
                                            setState((prev) => {
                                                const next = prev.customCharacterIds.includes(id)
                                                    ? prev.customCharacterIds.filter((v) => v !== id)
                                                    : prev.customCharacterIds.length >= 5
                                                        ? prev.customCharacterIds
                                                        : [...prev.customCharacterIds, id].sort((a, b) => a - b);
                                                const units = { ...prev.customCharacterUnits };
                                                if (!next.includes(id)) delete units[id];
                                                return { ...prev, customCharacterIds: next, customCharacterUnits: units };
                                            });
                                        }}
                                        maxCount={5}
                                    />
                                    {customCharacterIds.some((id) => id >= VIRTUAL_SINGER_ID_MIN) && (
                                        <div className="mt-4 space-y-2">
                                            {customCharacterIds.filter((id) => id >= VIRTUAL_SINGER_ID_MIN).map((id) => (
                                                <div key={id} className="flex items-center gap-2 flex-wrap">
                                                    <img src={getCharacterIconUrl(id)} alt="" className="w-7 h-7 rounded-full object-contain" loading="lazy" />
                                                    <span className="text-xs text-on-surface-variant font-medium w-24 truncate">
                                                        {getCharacterName(t, id, "short")}
                                                    </span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {UNIT_BONUS_OPTIONS.map((unit) => {
                                                            const isSelected = customCharacterUnits[id] === unit.value;
                                                            return (
                                                                <button
                                                                    key={unit.value}
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setState((prev) => {
                                                                            const units = { ...prev.customCharacterUnits };
                                                                            if (units[id] === unit.value) delete units[id];
                                                                            else units[id] = unit.value;
                                                                            return { ...prev, customCharacterUnits: units };
                                                                        })
                                                                    }
                                                                    className={`p-1.5 rounded-md3-sm transition-all border ${
                                                                        isSelected
                                                                            ? "ring-2 ring-primary bg-surface-container-lowest border-transparent"
                                                                            : "bg-surface-container-high border-transparent hover:bg-surface-container-high"
                                                                    }`}
                                                                    title={t(unit.labelKey)}
                                                                >
                                                                    <div className="w-5 h-5 relative">
                                                                        <Image src={`/data/icon/${unit.icon}`} alt={t(unit.labelKey)} fill className="object-contain" unoptimized />
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="mt-4">
                                <SectionTitle text={t("page.deckRecommend.config.customAttr")} />
                                <div className="flex flex-wrap gap-2">
                                    {ATTR_OPTIONS.map((attr) => {
                                        const isSelected = customAttr === attr.value;
                                        return (
                                            <button
                                                key={attr.value}
                                                type="button"
                                                onClick={() => patch({ customAttr: isSelected ? "" : attr.value })}
                                                className={`p-2 rounded-md3-md transition-all border ${
                                                    isSelected
                                                        ? "ring-2 ring-primary shadow-elev-1 bg-surface-container-lowest border-transparent"
                                                        : "bg-surface-container-lowest border-outline-variant hover:bg-surface-container-high"
                                                }`}
                                                title={attr.label}
                                            >
                                                <div className="w-7 h-7 relative">
                                                    <Image src={`/data/icon/${attr.icon}`} alt={attr.label} fill className="object-contain" unoptimized />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Live 类型 */}
                    {needsLiveType && (
                        <div className="mb-5">
                            <SectionTitle text={t("page.deckRecommend.config.liveType")} />
                            <div className="flex flex-wrap gap-2">
                                {LIVE_TYPE_OPTIONS.map((option) => (
                                    <button key={option} type="button" onClick={() => patch({ liveType: option })} className={pill(liveType === option)}>
                                        {t(`page.deckRecommend.liveTypes.${option}`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 最强组卡目标 */}
                    {mode === "strongest" && (
                        <div className="mb-5">
                            <SectionTitle text={t("page.deckRecommend.config.strongestTarget")} />
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => patch({ strongestTarget: "power", minimize: false })}
                                    className={pill(strongestTarget === "power" && !minimize)}
                                >
                                    {t("page.deckRecommend.config.strongestPower")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => patch({ strongestTarget: "skill", minimize: false })}
                                    className={pill(strongestTarget === "skill")}
                                >
                                    {t("page.deckRecommend.config.strongestSkill")}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 组卡目标 */}
                    {mode === "event" && (
                        <div className="mb-5">
                            <SectionTitle text={t("page.deckRecommend.config.targetTitle")} />
                            <div className="flex flex-wrap gap-2 mb-3">
                                {(["score", "power", "bonus"] as const).map((option) => (
                                    <button key={option} type="button" onClick={() => patch({ target: option })} className={pill(target === option)}>
                                        {t(`page.deckRecommend.config.targets.${option}`)}
                                    </button>
                                ))}
                            </div>
                            {target === "bonus" && (
                                <div>
                                    <input
                                        type="text"
                                        value={bonusTargets}
                                        onChange={(e) => patch({ bonusTargets: e.target.value })}
                                        placeholder={t("page.deckRecommend.config.bonusTargetsPlaceholder")}
                                        className="h-12 w-full max-w-sm rounded-md3-xs border border-outline bg-transparent px-4 type-body-l text-on-surface outline-none transition-colors hover:border-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant"
                                    />
                                    <p className="text-xs text-on-surface-variant mt-1.5">{t("page.deckRecommend.config.bonusTargetsHint")}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 音乐 */}
                    {needsMusic && (
                        <div className="mb-5">
                            <SectionTitle text={t("page.deckRecommend.config.musicTitle")} />
                            <MusicSelector selectedMusicId={musicId} onSelect={(id) => patch({ musicId: id })} liveType={liveType} />
                            <div className="flex flex-wrap gap-2 mt-3">
                                {DIFFICULTY_OPTIONS.map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => patch({ difficulty: option })}
                                        className={`state-layer focus-ring h-9 px-3 rounded-md3-sm type-label-l transition-colors ${difficulty === option
                                            ? `${DIFFICULTY_COLORS[option]} text-white`
                                            : "border border-outline-variant text-on-surface-variant"}`}
                                    >
                                        {option.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {mode !== "weakest" && (
                        <div className="mb-5">
                            <SectionTitle text={t("page.deckRecommend.config.trainingTitle")} />
                            <div className="overflow-x-auto">
                                <table className="ds-config-table w-full text-sm">
                                    <thead>
                                        <tr className="text-on-surface-variant">
                                            <th className="text-left py-2 px-2">{t("page.deckRecommend.config.training.rarity")}</th>
                                            <th className="text-center py-2 px-2">{t("page.deckRecommend.config.training.disable")}</th>
                                            <th className="text-center py-2 px-2">{t("page.deckRecommend.config.training.level")}</th>
                                            <th className="text-center py-2 px-2">{t("page.deckRecommend.config.training.episodes")}</th>
                                            <th className="text-center py-2 px-2">{t("page.deckRecommend.config.training.master")}</th>
                                            <th className="text-center py-2 px-2">{t("page.deckRecommend.config.training.skill")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {RARITY_CONFIG_KEYS.map(({ key, color }) => (
                                            <tr key={key} className="border-t border-outline-variant">
                                                <td className="py-2 px-2">
                                                    <span className="font-bold" style={{ color }}>{t(`page.deckRecommend.config.training.rarities.${key}`)}</span>
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                    <input type="checkbox" className="ds-checkbox" checked={cardConfig[key].disable} onChange={(e) => updateCardConfig(key, "disable", e.target.checked)} />
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                    <input type="checkbox" className="ds-checkbox" checked={cardConfig[key].levelMax} disabled={cardConfig[key].disable} onChange={(e) => updateCardConfig(key, "levelMax", e.target.checked)} />
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                    <input type="checkbox" className="ds-checkbox" checked={cardConfig[key].episodeRead} disabled={cardConfig[key].disable} onChange={(e) => updateCardConfig(key, "episodeRead", e.target.checked)} />
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                    <input type="checkbox" className="ds-checkbox" checked={cardConfig[key].masterMax} disabled={cardConfig[key].disable} onChange={(e) => updateCardConfig(key, "masterMax", e.target.checked)} />
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                    <input type="checkbox" className="ds-checkbox" checked={cardConfig[key].skillMax} disabled={cardConfig[key].disable} onChange={(e) => updateCardConfig(key, "skillMax", e.target.checked)} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Calculate Button & Progress */}
                <div className="mb-6">
                    {isCalculating ? (
                        <Button type="button" variant="outlined" color="error" size="m" fullWidth onClick={handleCancel}>
                            <CircularProgress size={20} strokeWidth={3} />
                            {t("page.deckRecommend.cancel")}
                        </Button>
                    ) : (
                        <Button type="button" variant="filled" size="m" fullWidth icon={mdPlayArrow} onClick={handleCalculate}>
                            {t("page.deckRecommend.calculate")}
                        </Button>
                    )}
                    {isCalculating && (
                        <div className="bg-surface-card border border-outline-variant/70 p-4 rounded-md3-lg mt-4">
                            <ProgressBar percent={progressPercent} stageLabel={progressLabel} />
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <Banner tone="error" className="mb-6">{error}</Banner>
                )}

                {/* Results */}
                {results !== null && completion && !error && (
                    <p role="status" className="mb-3 type-body-s text-on-surface-variant">
                        {t(completion === "complete"
                            ? "page.deckRecommend.result.complete"
                            : "page.deckRecommend.result.timedOut")}
                    </p>
                )}
                {results && results.length > 0 && (
                    <div className="bg-surface-card border border-outline-variant/70 p-5 sm:p-6 rounded-md3-xl mb-6 [overflow-anchor:none]">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <h2 className="type-title-l text-on-surface flex items-center gap-2">
                                <Icon path={mdLeaderboard} size={24} className="text-primary" />
                                {t("page.deckRecommend.result.title")}
                            </h2>
                            {duration !== null && (
                                <span className="text-xs text-on-surface-variant font-mono">
                                    {t("page.deckRecommend.result.duration", { ms: formatNumber(Math.round(duration)) })}
                                </span>
                            )}
                        </div>
                        {results.map((deck) => (
                            <DeckRow
                                key={deck.rank}
                                deck={deck}
                                scoreLabel={scoreLabel}
                                showBonus={mode === "event" || mode === "custom" || mode === "mysekai"}
                                cardsMaster={cardsMaster}
                                songTitles={songTitles}
                                userCards={userCards}
                                formatNumber={formatNumber}
                                musicRows={musicByDeck[deck.rank] ?? null}
                                musicLoading={musicLoadingByDeck[deck.rank] ?? false}
                                onRequestMusic={() => requestMusic(deck)}
                            />
                        ))}
                    </div>
                )}
                {results && results.length === 0 && !error && (
                    <div className="bg-surface-card border border-outline-variant/70 rounded-md3-xl mb-6">
                        <EmptyState title={t("page.deckRecommend.result.empty")} className="py-10" />
                    </div>
                )}
            </PageContainer>

            {/* 自定义规则弹窗 */}
            <CustomRulesModal
                isOpen={isCustomRulesOpen}
                onClose={() => setIsCustomRulesOpen(false)}
                state={customRulesState}
                onChange={patch}
                onResetAll={handleResetRules}
                cardsMaster={cardsMaster}
                overrideCatalogs={overrideCatalogs}
                onOpenCardModal={setCardModal}
                userDeckCardIds={[
                    effectiveUserSnapshot?.userDecks?.[0]?.member1,
                    effectiveUserSnapshot?.userDecks?.[0]?.member2,
                    effectiveUserSnapshot?.userDecks?.[0]?.member3,
                    effectiveUserSnapshot?.userDecks?.[0]?.member4,
                    effectiveUserSnapshot?.userDecks?.[0]?.member5,
                ].filter((v): v is number => typeof v === "number" && v > 0)}
            />

            {/* 卡牌选择弹窗（固定/排除/单卡覆盖共用） */}
            <CardSelectorModal
                isOpen={cardModal !== null}
                onClose={() => setCardModal(null)}
                title={cardModal === "fixed"
                    ? t("page.deckRecommend.config.fixedCards")
                    : cardModal === "excluded"
                        ? t("page.deckRecommend.config.excludedCards")
                        : t("page.deckRecommend.config.singleCardTitle")}
                cards={cardsMaster}
                maxSelectCount={cardModal === "fixed" ? 5 : cardModal === "single" ? 1 : undefined}
                selectedCardIds={cardModal === "fixed" ? fixedCards : cardModal === "excluded" ? excludedCards : singleCardOverrides.map((e) => e.cardId)}
                onToggleCardSelect={(card) => {
                    if (cardModal === "single") {
                        setState((prev) => ({ ...prev, singleCardOverrides: [{ cardId: card.id }] }));
                        setCardModal(null);
                        return;
                    }
                    const key = cardModal === "fixed" ? "fixedCards" : "excludedCards";
                    setState((prev) => {
                        const list = prev[key] as number[];
                        return {
                            ...prev,
                            [key]: list.includes(card.id) ? list.filter((v) => v !== card.id) : [...list, card.id],
                        };
                    });
                }}
            />
        </MainLayout>
    );
}
