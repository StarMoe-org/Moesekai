"use client";

import { useMemo } from "react";
import { Button, Checkbox, IconButton, Slider, Switch, TextField, cn } from "@/components/md3";
import { mdAdd, mdDelete } from "@/components/md3/icons";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { useI18n } from "@/contexts/I18nContext";
import { effectiveRates, poolIssues, RARITY_KEYS, type SimPoolConfig, type SimRarity } from "@/lib/gacha-simulator/engine";
import type { ICardInfo } from "@/types/types";

export interface PoolEditorProps {
    pool: SimPoolConfig;
    cards: Map<number, ICardInfo>;
    onChange: (pool: SimPoolConfig) => void;
    onOpenCardSelector: () => void;
}

const RARITY_STARS: Record<SimRarity, number> = { rarity_1: 1, rarity_2: 2, rarity_3: 3, rarity_4: 4, rarity_birthday: 4 };

export default function PoolEditor({ pool, cards, onChange, onOpenCardSelector }: PoolEditorProps) {
    const { t } = useI18n();
    const effective = useMemo(() => effectiveRates(pool), [pool]);
    const issues = useMemo(() => poolIssues(pool), [pool]);

    const update = (patch: Partial<SimPoolConfig>) => onChange({ ...pool, ...patch });
    const setRate = (rarity: SimRarity, value: number) => update({ rates: { ...pool.rates, [rarity]: Math.max(0, value) } });
    const setCard = (cardId: number, patch: Partial<{ up: boolean; weight: number }>) => {
        update({ cards: pool.cards.map((card) => (card.cardId === cardId ? { ...card, ...patch } : card)) });
    };
    const removeCard = (cardId: number) => update({ cards: pool.cards.filter((card) => card.cardId !== cardId) });

    const rateTotal = RARITY_KEYS.reduce((sum, rarity) => sum + (pool.rates[rarity] || 0), 0);

    return (
        <div className="flex flex-col gap-6">
            <TextField
                label={t("page.gachaSimulator.poolName")}
                value={pool.name}
                maxLength={60}
                onChange={(event) => update({ name: event.target.value })}
            />

            {issues.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-md3-md bg-error-container p-3 type-body-m text-on-error-container">
                    {issues.map((issue) => (
                        <li key={issue}>{t(`page.gachaSimulator.issues.${issue}`)}</li>
                    ))}
                </ul>
            )}

            <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="type-title-m text-on-surface">{t("page.gachaSimulator.ratesTitle")}</h3>
                    <p className="type-body-s text-on-surface-variant">{t("page.gachaSimulator.ratesNote", { total: rateTotal.toFixed(1) })}</p>
                </div>
                {RARITY_KEYS.map((rarity) => {
                    const hasCards = pool.cards.some((card) => card.rarity === rarity);
                    return (
                        <div key={rarity} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3">
                            <span className="type-label-l text-on-surface">{t(`page.gachaSimulator.rarity.${rarity}`)}</span>
                            <Slider
                                value={pool.rates[rarity] || 0}
                                min={0}
                                max={100}
                                step={0.1}
                                aria-label={t(`page.gachaSimulator.rarity.${rarity}`)}
                                formatValue={(value) => `${value.toFixed(1)}%`}
                                onValueChange={(value) => setRate(rarity, value)}
                                disabled={!hasCards && (pool.rates[rarity] || 0) === 0}
                            />
                            <span className={cn("text-right type-label-m tabular-nums", hasCards ? "text-on-surface" : "text-on-surface-variant")}>
                                {effective[rarity].toFixed(2)}%
                            </span>
                        </div>
                    );
                })}
            </section>

            <section className="flex flex-col gap-4">
                <div className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3">
                    <span className="type-label-l text-on-surface">{t("page.gachaSimulator.upShare")}</span>
                    <Slider
                        value={Math.round(pool.upShare * 100)}
                        min={0}
                        max={100}
                        step={1}
                        aria-label={t("page.gachaSimulator.upShare")}
                        formatValue={(value) => `${value}%`}
                        onValueChange={(value) => update({ upShare: value / 100 })}
                    />
                    <span className="text-right type-label-m tabular-nums text-on-surface">{Math.round(pool.upShare * 100)}%</span>
                </div>
                <p className="type-body-s text-on-surface-variant">{t("page.gachaSimulator.upShareHint")}</p>

                <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                        label={t("page.gachaSimulator.pity")}
                        type="number"
                        min={0}
                        max={1000}
                        value={String(pool.pityPulls)}
                        supportingText={t("page.gachaSimulator.pityHint")}
                        onChange={(event) => update({ pityPulls: Math.min(1000, Math.max(0, Math.floor(Number(event.target.value) || 0))) })}
                    />
                    <div className="flex items-center justify-between gap-3 rounded-md3-md bg-surface-container-high px-4 py-3">
                        <Switch
                            checked={pool.tenPullFloor}
                            onCheckedChange={(checked) => update({ tenPullFloor: checked })}
                            label={t("page.gachaSimulator.tenPullFloor")}
                            description={t("page.gachaSimulator.tenPullFloorHint")}
                        />
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="type-title-m text-on-surface">
                        {t("page.gachaSimulator.cardsTitle", { count: pool.cards.length })}
                    </h3>
                    <Button variant="tonal" size="s" icon={mdAdd} onClick={onOpenCardSelector}>
                        {t("page.gachaSimulator.pickCards")}
                    </Button>
                </div>
                {pool.cards.length === 0 ? (
                    <p className="type-body-m text-on-surface-variant">{t("page.gachaSimulator.emptyCards")}</p>
                ) : (
                    <ul className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
                        {pool.cards.map((entry) => {
                            const card = cards.get(entry.cardId);
                            return (
                                <li key={entry.cardId} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-md3-md bg-surface-container-high p-2">
                                    {card ? (
                                        <SekaiCardThumbnail card={card} width={56} />
                                    ) : (
                                        <span className="h-14 w-14 rounded-md3-sm bg-surface-container-highest" />
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate type-label-l text-on-surface">
                                            #{entry.cardId} {card?.prefix ?? ""}
                                        </p>
                                        <p className="type-label-m text-on-surface-variant">
                                            {"★".repeat(RARITY_STARS[entry.rarity])} · {t(`page.gachaSimulator.rarity.${entry.rarity}`)}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-3">
                                            <Checkbox
                                                checked={entry.up}
                                                onCheckedChange={(checked) => setCard(entry.cardId, { up: checked })}
                                                label={t("page.gachaSimulator.upLabel")}
                                            />
                                            <label className="flex items-center gap-2 type-label-m text-on-surface-variant">
                                                {t("page.gachaSimulator.weightLabel")}
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={entry.weight}
                                                    onChange={(event) => setCard(entry.cardId, { weight: Math.max(0, Number(event.target.value) || 0) })}
                                                    className="w-20 rounded-md3-sm bg-surface-container-highest px-2 py-1 text-on-surface tabular-nums"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                    <IconButton icon={mdDelete} label={t("page.gachaSimulator.removeCard")} onClick={() => removeCard(entry.cardId)} />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
