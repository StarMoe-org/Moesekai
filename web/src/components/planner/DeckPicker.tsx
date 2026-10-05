"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { Card } from "@/components/md3";
import CollapsibleBlock from "./CollapsibleBlock";
import { fetchMasterDataForServer } from "@/lib/fetch";
import type { ICardInfo } from "@/types/types";
import type { PlannerDeckOption } from "@/lib/deck-recommend/planner-types";

interface DeckPickerProps {
    options: PlannerDeckOption[];
    selectedRank: number | null;
    onSelect(rank: number): void;
}

function formatPercent(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Radio list of the engine's top decks; the chosen deck feeds the PT plan and the song-gain table. */
export default function DeckPicker({ options, selectedRank, onSelect }: DeckPickerProps) {
    const { t, formatNumber } = useI18n();
    const [cardsMaster, setCardsMaster] = useState<ICardInfo[]>([]);

    const hasOptions = options.length > 0;
    useEffect(() => {
        if (!hasOptions) return;
        let cancelled = false;
        // JP holds every card id CN has, matching the deck-recommend page.
        fetchMasterDataForServer<ICardInfo[]>("jp", "cards.json")
            .then((cards) => {
                if (!cancelled) setCardsMaster(cards);
            })
            .catch(() => {
                if (!cancelled) setCardsMaster([]);
            });
        return () => {
            cancelled = true;
        };
    }, [hasOptions]);

    const cardById = useMemo(() => new Map(cardsMaster.map((c) => [c.id, c])), [cardsMaster]);

    if (!hasOptions) return null;

    return (
        <CollapsibleBlock title={t("page.predictionPlanner.pt.deck.resultsTitle", { count: options.length })}>
            <div role="radiogroup" className="space-y-2">
                {options.map((option) => {
                    const selected = option.rank === selectedRank;
                    return (
                        <Card
                            key={option.rank}
                            variant={selected ? "filled" : "outlined"}
                            role="radio"
                            aria-checked={selected}
                            onClick={() => onSelect(option.rank)}
                            className={`p-3 ${selected ? "ring-2 ring-primary" : ""}`}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span
                                    aria-hidden="true"
                                    className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? "border-primary" : "border-outline"}`}
                                >
                                    {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
                                </span>
                                <span className={`type-label-l tabular-nums ${option.rank === 1 ? "text-tertiary" : "text-on-surface-variant"}`}>
                                    #{option.rank}
                                </span>
                                <span className="type-title-m type-emphasized font-mono text-on-surface truncate">
                                    {formatNumber(option.eventPoint)}
                                </span>
                                <span className="type-label-s text-on-surface-variant whitespace-nowrap">
                                    {t("page.predictionPlanner.pt.deck.columns.ptPerPlay")}
                                </span>
                                <span className={`ml-auto shrink-0 type-label-m px-2 py-1 rounded-md3-sm whitespace-nowrap ${selected
                                    ? "bg-secondary-container text-on-secondary-container"
                                    : "bg-surface-container-low text-on-surface-variant border border-outline-variant"
                                    }`}>
                                    {selected ? t("page.predictionPlanner.pt.deck.selected") : t("page.predictionPlanner.pt.deck.select")}
                                </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 type-body-s text-on-surface-variant pl-7">
                                <span>
                                    {t("page.predictionPlanner.pt.deck.columns.power")}{" "}
                                    <span className="type-label-m font-mono text-on-surface">{formatNumber(option.totalPower)}</span>
                                </span>
                                <span>
                                    {t("page.predictionPlanner.pt.deck.columns.bonus")}{" "}
                                    <span className="type-label-m font-mono text-tertiary">{formatPercent(option.eventBonus)}%</span>
                                </span>
                                <span>
                                    {t("page.predictionPlanner.pt.deck.columns.effectiveSkill")}{" "}
                                    <span className="type-label-m font-mono text-on-surface">{formatPercent(option.effectiveSkill)}%</span>
                                </span>
                            </div>
                            <div className="mt-2 flex gap-1.5 pl-6">
                                {option.cards.slice(0, 5).map((card, i) => {
                                    const master = cardById.get(card.cardId);
                                    const isBirthday = card.rarity === "rarity_birthday" || master?.cardRarityType === "rarity_birthday";
                                    const trained = (card.rarity === "rarity_3" || card.rarity === "rarity_4") && !isBirthday;
                                    return (
                                        <span key={`${card.cardId}-${i}`} className="relative block w-10 h-10 shrink-0">
                                            {master ? (
                                                <SekaiCardThumbnail card={master} trained={trained} mastery={card.masterRank} width={40} />
                                            ) : (
                                                <span className="flex w-10 h-10 rounded-md3-xs bg-surface-container-high items-center justify-center type-label-s text-on-surface-variant">?</span>
                                            )}
                                            {i === 0 && (
                                                <span className="absolute bottom-0 right-0 bg-primary text-on-primary type-label-s px-1 py-0.5 rounded-tl-md3-xs leading-none">L</span>
                                            )}
                                        </span>
                                    );
                                })}
                            </div>
                        </Card>
                    );
                })}
            </div>
        </CollapsibleBlock>
    );
}
